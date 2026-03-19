import { useEffect, useState } from "react";

type DashboardPanelProps = {
  sessionUserId?: string | null;
  isGuestSession?: boolean;
  aiEnabled: boolean;
  history: { text: string; category?: string }[];
  suggestions: Record<string, { category: string; reason: string }>;
  rankLevel: string;
  onInsightsRecommendationCountChange?: (count: number) => void;
  onUpdateBullet?: (oldText: string, newText: string) => void;
  onUpdateBulletForCategory?: (oldText: string, newText: string, category: string) => void;
  onCommitConsolidatedRepetition?: (
    originalBullets: string[],
    consolidatedBullet: string,
    category?: string,
    title?: string
  ) => void;
};

type SmartInsights = {
  bulletsLackingResults: Array<{
    bullet: string;
    category: string;
    suggestedImprovement: string;
  }>;
  preCloseActions: Array<{ action: string; feasibility: number }>;
  repetitionGroups: Array<{
    theme: string;
    bullets: string[];
    category: string;
    suggestion: string;
  }>;
};

type CategoryEvaluation = {
  breakdown: {
    impact: number;
    leadershipLevel: number;
    scopeOfResponsibility: number;
    measurableResults: number;
    initiative: number;
    alignmentToCategory: number;
  };
  aiExplanation: string;
  compiledScore: number;
};

type RawCategoryEvaluation = Partial<CategoryEvaluation> & {
  summary?: string;
  overallScore?: number;
};

type PersistedDashboardAnalysisState = {
  version: 1;
  hasAnalyzedDashboard: boolean;
  insights: SmartInsights | null;
  evaluations: Record<string, CategoryEvaluation>;
  dismissedBullets: string[];
  dismissedUnderrepresentedCategories: boolean;
  dismissedRepetitionGroups: string[];
  dismissedCrossCategoryPairs: string[];
  suppressedCategoryComparisons?: string[];
  dismissedPreCloseActions: boolean;
  lockedTotalEstimate: number | null;
};

const MIN_MARK = 4;
const MAX_MARK = 7;
const DASHBOARD_ANALYSIS_STORAGE_VERSION = 1;

function getDashboardAnalysisStorageKey(userId: string, isGuestSession: boolean) {
  return `${isGuestSession ? "guest-session" : "dashboardAnalysis"}:${userId}`;
}

function normalizeCategoryName(category: string) {
  return category.trim().toLowerCase() === "customs, courtesies, and traditions"
    ? "Customs, Courtesies and Traditions"
    : category.trim();
}

function clampBreakdownScore(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, Math.min(10, Math.round(value)));
}

function compileScoreFromBreakdown(breakdown: CategoryEvaluation["breakdown"]) {
  const averageScore =
    (breakdown.impact +
      breakdown.leadershipLevel +
      breakdown.scopeOfResponsibility +
      breakdown.measurableResults +
      breakdown.initiative +
      breakdown.alignmentToCategory) /
    6;

  const normalizedScore = 4 + ((averageScore - 1) / 9) * 3;
  return Math.round(normalizedScore * 10) / 10;
}

function normalizeEvaluation(evaluation: RawCategoryEvaluation | undefined): CategoryEvaluation | undefined {
  if (!evaluation) {
    return undefined;
  }

  const breakdown = {
    impact: clampBreakdownScore(evaluation.breakdown?.impact),
    leadershipLevel: clampBreakdownScore(evaluation.breakdown?.leadershipLevel),
    scopeOfResponsibility: clampBreakdownScore(evaluation.breakdown?.scopeOfResponsibility),
    measurableResults: clampBreakdownScore(evaluation.breakdown?.measurableResults),
    initiative: clampBreakdownScore(evaluation.breakdown?.initiative),
    alignmentToCategory: clampBreakdownScore(evaluation.breakdown?.alignmentToCategory),
  };

  const compiledScore =
    typeof evaluation.compiledScore === "number" && !Number.isNaN(evaluation.compiledScore)
      ? Math.max(MIN_MARK, Math.min(MAX_MARK, evaluation.compiledScore))
      : compileScoreFromBreakdown(breakdown);

  const aiExplanation =
    typeof evaluation.aiExplanation === "string" && evaluation.aiExplanation.trim()
      ? evaluation.aiExplanation.trim()
      : typeof evaluation.summary === "string" && evaluation.summary.trim()
        ? evaluation.summary.trim()
        : "AI could not generate an explanation for this category.";

  return {
    breakdown,
    compiledScore: Math.round(compiledScore * 10) / 10,
    aiExplanation,
  };
}

function getLocalUnderrepresentedAction(category: string, bulletCount: number) {
  if (bulletCount === 0) {
    return `No marks are currently assigned to ${category}. Add at least one mark here to improve category coverage.`;
  }

  return `${category} currently has only ${bulletCount} mark. Add another mark here to strengthen category balance.`;
}

type CategorizedBullet = {
  text: string;
  category: string;
};

type CrossCategorySimilarityPair = {
  key: string;
  left: CategorizedBullet;
  right: CategorizedBullet;
  matchType: "identical" | "similar";
};

type RepetitionGroupResolvedBullet = {
  text: string;
  category: string;
};

function normalizeBulletForSimilarity(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[-*•\s]+/, "")
    .replace(/[“”"']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function getCrossCategoryMatchType(firstBullet: string, secondBullet: string): "identical" | "similar" | null {
  const first = normalizeBulletForSimilarity(firstBullet);
  const second = normalizeBulletForSimilarity(secondBullet);

  if (!first || !second) {
    return null;
  }

  if (first === second) {
    return "identical";
  }

  if ((first.includes(second) || second.includes(first)) && Math.min(first.length, second.length) >= 24) {
    return "similar";
  }

  const firstTokens = new Set(first.split(" ").filter((token) => token.length > 2));
  const secondTokens = new Set(second.split(" ").filter((token) => token.length > 2));
  const allTokens = new Set([...firstTokens, ...secondTokens]);

  if (allTokens.size === 0) {
    return null;
  }

  let overlap = 0;
  for (const token of firstTokens) {
    if (secondTokens.has(token)) {
      overlap++;
    }
  }

  const jaccardSimilarity = overlap / allTokens.size;
  return jaccardSimilarity >= 0.72 ? "similar" : null;
}

function getCrossCategoryPairKey(left: CategorizedBullet, right: CategorizedBullet) {
  const first = `${left.category}::${left.text}`;
  const second = `${right.category}::${right.text}`;
  return [first, second].sort().join("|||" );
}

function getCategoryComparisonKey(firstCategory: string, secondCategory: string) {
  return [normalizeCategoryName(firstCategory), normalizeCategoryName(secondCategory)].sort().join("||");
}

function clampSummaryLength(value: string, maxChars = 250) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxChars - 3).trimEnd();
  return `${truncated}...`;
}

function getDistinctGroupCategories(
  group: SmartInsights["repetitionGroups"][number],
  history: { text: string; category?: string }[],
  suggestions: Record<string, { category: string; reason: string }>
) {
  const categories = group.bullets.map((bulletText) => {
    const match = history.find((item) => item.text === bulletText);
    return normalizeCategoryName(match?.category || suggestions[bulletText]?.category || group.category);
  });

  return Array.from(new Set(categories));
}

function buildCategoryComparisonKeys(categories: string[]) {
  const keys: string[] = [];
  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      keys.push(getCategoryComparisonKey(categories[i], categories[j]));
    }
  }
  return keys;
}

export default function DashboardPanel({
  sessionUserId,
  isGuestSession = false,
  aiEnabled,
  history,
  suggestions,
  rankLevel,
  onInsightsRecommendationCountChange,
  onUpdateBullet,
  onUpdateBulletForCategory,
  onCommitConsolidatedRepetition,
}: DashboardPanelProps) {
  const categories = [
    "Military Bearing",
    "Customs, Courtesies and Traditions",
    "Quality of Work",
    "Technical Proficiency",
    "Initiative",
    "Decision Making and Problem Solving",
    "Military Readiness",
    "Self Awareness and Learning",
    "Team Building",
    "Respect for Others",
    "Accountability and Responsibility",
    "Influencing Others",
    "Effective Communication",
  ];

  const primaryCategoryGroups: Record<string, string[]> = {
    Military: ["Military Bearing", "Customs, Courtesies and Traditions"],
    Performance: ["Quality of Work", "Technical Proficiency", "Initiative"],
    "Professional Qualities": [
      "Decision Making and Problem Solving",
      "Military Readiness",
      "Self Awareness and Learning",
      "Team Building",
    ],
    Leadership: [
      "Respect for Others",
      "Accountability and Responsibility",
      "Influencing Others",
      "Effective Communication",
    ],
  };

  const [evaluations, setEvaluations] = useState<Record<string, CategoryEvaluation>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");

  const [insights, setInsights] = useState<SmartInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [hasAnalyzedDashboard, setHasAnalyzedDashboard] = useState(false);
  const [isAnalyzingDashboard, setIsAnalyzingDashboard] = useState(false);
  const [lockedTotalEstimate, setLockedTotalEstimate] = useState<number | null>(null);
  const [refreshingInsightSection, setRefreshingInsightSection] = useState<
    "missingResults" | "repetition" | null
  >(null);

  const [openInsightSections, setOpenInsightSections] = useState({
    underrepresented: false,
    missingResults: false,
    preClose: false,
    repetition: false,
  });
  const toggleInsightSection = (key: keyof typeof openInsightSections) =>
    setOpenInsightSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // editingBullets: originalText -> current draft
  const [editingBullets, setEditingBullets] = useState<Record<string, string>>({});
  // dismissedBullets: set of original bullet texts that have been saved
  const [dismissedBullets, setDismissedBullets] = useState<Set<string>>(new Set());
  const [dismissedUnderrepresentedCategories, setDismissedUnderrepresentedCategories] = useState(false);
  const [dismissedRepetitionGroups, setDismissedRepetitionGroups] = useState<Set<string>>(new Set());
  const [dismissedCrossCategoryPairs, setDismissedCrossCategoryPairs] = useState<Set<string>>(new Set());
  const [suppressedCategoryComparisons, setSuppressedCategoryComparisons] = useState<Set<string>>(new Set());
  const [dismissedPreCloseActions, setDismissedPreCloseActions] = useState(false);
  const [openConsolidationGroupKey, setOpenConsolidationGroupKey] = useState<string | null>(null);
  const [consolidatedDrafts, setConsolidatedDrafts] = useState<Record<string, string>>({});
  const [consolidatedDraftTitles, setConsolidatedDraftTitles] = useState<Record<string, string>>({});
  const [consolidationLoadingKey, setConsolidationLoadingKey] = useState<string | null>(null);
  const [consolidationErrorByKey, setConsolidationErrorByKey] = useState<Record<string, string>>({});
  const [crossCategoryRewordDrafts, setCrossCategoryRewordDrafts] = useState<Record<string, string>>({});
  const [crossCategoryRewordLoadingKey, setCrossCategoryRewordLoadingKey] = useState<string | null>(null);
  const [crossCategoryRewordErrorByKey, setCrossCategoryRewordErrorByKey] = useState<Record<string, string>>({});
  const [bulletproofSummaries, setBulletproofSummaries] = useState<Record<string, string>>({});
  const [bulletproofSummaryError, setBulletproofSummaryError] = useState("");
  const [isLoadingBulletproofSummaries, setIsLoadingBulletproofSummaries] = useState(false);
  const [bulletproofSummaryRequestKey, setBulletproofSummaryRequestKey] = useState("");

  // Per-bullet Reword and Edit state for repetition group bullets
  const [repBulletRewordDrafts, setRepBulletRewordDrafts] = useState<Record<string, string>>({});
  const [repBulletRewordLoadingKey, setRepBulletRewordLoadingKey] = useState<string | null>(null);
  const [repBulletRewordErrorByKey, setRepBulletRewordErrorByKey] = useState<Record<string, string>>({});
  const [repBulletEditingKey, setRepBulletEditingKey] = useState<string | null>(null);
  const [repBulletEditValues, setRepBulletEditValues] = useState<Record<string, string>>({});
  // tracks which bullet texts have been saved per groupKey; auto-dismisses group when all are resolved
  const [repGroupResolvedBullets, setRepGroupResolvedBullets] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }

    try {
      const storage = isGuestSession ? sessionStorage : localStorage;
      const raw = storage.getItem(getDashboardAnalysisStorageKey(sessionUserId, isGuestSession));
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<PersistedDashboardAnalysisState>;
      if (parsed.version !== DASHBOARD_ANALYSIS_STORAGE_VERSION) {
        return;
      }

      setHasAnalyzedDashboard(Boolean(parsed.hasAnalyzedDashboard));
      setInsights(parsed.insights ?? null);
      setEvaluations(parsed.evaluations ?? {});
      setDismissedBullets(new Set(parsed.dismissedBullets ?? []));
      setDismissedUnderrepresentedCategories(Boolean(parsed.dismissedUnderrepresentedCategories));
      setDismissedRepetitionGroups(new Set(parsed.dismissedRepetitionGroups ?? []));
      setDismissedCrossCategoryPairs(new Set(parsed.dismissedCrossCategoryPairs ?? []));
      setSuppressedCategoryComparisons(new Set(parsed.suppressedCategoryComparisons ?? []));
      setDismissedPreCloseActions(Boolean(parsed.dismissedPreCloseActions));

      if (typeof parsed.lockedTotalEstimate === "number" && Number.isFinite(parsed.lockedTotalEstimate)) {
        setLockedTotalEstimate(parsed.lockedTotalEstimate);
      }
    } catch {
      // Ignore parse/storage errors and continue with in-memory state.
    }
  }, [sessionUserId, isGuestSession]);

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }

    const payload: PersistedDashboardAnalysisState = {
      version: DASHBOARD_ANALYSIS_STORAGE_VERSION,
      hasAnalyzedDashboard,
      insights,
      evaluations,
      dismissedBullets: Array.from(dismissedBullets),
      dismissedUnderrepresentedCategories,
      dismissedRepetitionGroups: Array.from(dismissedRepetitionGroups),
      dismissedCrossCategoryPairs: Array.from(dismissedCrossCategoryPairs),
      suppressedCategoryComparisons: Array.from(suppressedCategoryComparisons),
      dismissedPreCloseActions,
      lockedTotalEstimate,
    };

    try {
      const storage = isGuestSession ? sessionStorage : localStorage;
      storage.setItem(
        getDashboardAnalysisStorageKey(sessionUserId, isGuestSession),
        JSON.stringify(payload)
      );
    } catch {
      // Ignore quota/storage errors and continue with in-memory state.
    }
  }, [
    sessionUserId,
    hasAnalyzedDashboard,
    insights,
    evaluations,
    dismissedBullets,
    dismissedUnderrepresentedCategories,
    dismissedRepetitionGroups,
    dismissedCrossCategoryPairs,
    suppressedCategoryComparisons,
    dismissedPreCloseActions,
    lockedTotalEstimate,
    isGuestSession,
  ]);

  const startEditingBullet = (originalText: string, suggested: string) =>
    setEditingBullets((prev) => ({ ...prev, [originalText]: suggested }));

  const cancelEditingBullet = (originalText: string) =>
    setEditingBullets((prev) => {
      const next = { ...prev };
      delete next[originalText];
      return next;
    });

  const commitEditingBullet = (originalText: string, category?: string) => {
    const newText = (editingBullets[originalText] ?? "").trim();
    if (newText && newText !== originalText) {
      if (category && onUpdateBulletForCategory) {
        onUpdateBulletForCategory(originalText, newText, category);
      } else if (onUpdateBullet) {
        onUpdateBullet(originalText, newText);
      }
    }
    cancelEditingBullet(originalText);
    setDismissedBullets((prev) => new Set(prev).add(originalText));
  };

  const getRepetitionGroupKey = (group: SmartInsights["repetitionGroups"][number]) =>
    `${group.theme}|${group.category}|${group.bullets.join("||")}`;

  const suppressGroupCategoryComparisons = (group: SmartInsights["repetitionGroups"][number]) => {
    const groupCategories = getDistinctGroupCategories(group, history, suggestions);
    const comparisonKeys = buildCategoryComparisonKeys(groupCategories);
    if (comparisonKeys.length === 0) {
      return;
    }

    setSuppressedCategoryComparisons((prev) => {
      const next = new Set(prev);
      comparisonKeys.forEach((key) => next.add(key));
      return next;
    });
  };

  const generateRepetitionBulletReword = async (bulletText: string, category: string) => {
    if (!aiEnabled) {
      setRepBulletRewordErrorByKey((prev) => ({ ...prev, [bulletText]: "Dashboard AI is disabled in Settings." }));
      return;
    }
    setRepBulletRewordLoadingKey(bulletText);
    setRepBulletRewordErrorByKey((prev) => ({ ...prev, [bulletText]: "" }));
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accomplishment: bulletText,
          category,
          rankLevel,
          generationIntent: "reword-for-category",
          sourceBullet: bulletText,
          sourceCategory: category,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to generate reword draft.");
      const text = typeof data.bullet === "string" ? data.bullet.trim() : "";
      if (!text) throw new Error("Unable to generate reword draft.");
      setRepBulletRewordDrafts((prev) => ({ ...prev, [bulletText]: text }));
    } catch (error) {
      setRepBulletRewordErrorByKey((prev) => ({
        ...prev,
        [bulletText]: error instanceof Error ? error.message : "Unable to generate reword draft.",
      }));
    } finally {
      setRepBulletRewordLoadingKey(null);
    }
  };

    // Finds the actual stored history text matching the AI-returned bullet text (guards against minor AI text drift)
    const findActualHistoryText = (bulletText: string): string => {
      if (history.some((item) => item.text === bulletText)) return bulletText;
      const normalize = (s: string) =>
        s.replace(/^[-*•\s]+/, "").replace(/\s+/g, " ").trim().toLowerCase();
      const normalizedBullet = normalize(bulletText);
      const exact = history.find((item) => normalize(item.text) === normalizedBullet);
      if (exact) return exact.text;
      if (normalizedBullet.length > 24) {
        const sub = history.find((item) => {
          const n = normalize(item.text);
          return n.includes(normalizedBullet) || normalizedBullet.includes(n);
        });
        if (sub) return sub.text;
      }
      return bulletText;
    };

  const resolveRepetitionBullet = (bulletText: string, group: SmartInsights["repetitionGroups"][number]) => {
    const groupKey = getRepetitionGroupKey(group);
    const resolvedForGroup = [...(repGroupResolvedBullets[groupKey] ?? []), bulletText];
    setRepGroupResolvedBullets((prev) => ({ ...prev, [groupKey]: resolvedForGroup }));
    if (group.bullets.every((b) => resolvedForGroup.includes(b))) {
      suppressGroupCategoryComparisons(group);
      setDismissedRepetitionGroups((prev) => new Set(prev).add(groupKey));
    }
  };

  const commitRepetitionBulletReword = (oldText: string, newText: string, group: SmartInsights["repetitionGroups"][number]) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    onUpdateBullet?.(findActualHistoryText(oldText), trimmed);
    setRepBulletRewordDrafts((prev) => { const n = { ...prev }; delete n[oldText]; return n; });
    resolveRepetitionBullet(oldText, group);
  };

  const commitRepetitionBulletEdit = (oldText: string, group: SmartInsights["repetitionGroups"][number]) => {
    const newText = (repBulletEditValues[oldText] ?? oldText).trim();
    if (!newText) return;
    onUpdateBullet?.(findActualHistoryText(oldText), newText);
    setRepBulletEditingKey(null);
    setRepBulletEditValues((prev) => { const n = { ...prev }; delete n[oldText]; return n; });
    resolveRepetitionBullet(oldText, group);
  };

  const generateConsolidatedDraft = async (
    group: SmartInsights["repetitionGroups"][number],
    groupKey: string
  ) => {
    if (!aiEnabled) {
      setConsolidationErrorByKey((prev) => ({
        ...prev,
        [groupKey]: "Dashboard AI is disabled in Settings.",
      }));
      return;
    }

    setConsolidationLoadingKey(groupKey);
    setConsolidationErrorByKey((prev) => ({ ...prev, [groupKey]: "" }));

    try {
      const accomplishment = `Consolidate these repeated accomplishments into one stronger mark bullet:\n${group.bullets
        .map((bullet, index) => `${index + 1}. ${bullet}`)
        .join("\n")}`;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accomplishment,
          category: group.category,
          rankLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to generate consolidated draft.");
      }

      const generatedText = typeof data.bullet === "string" ? data.bullet.trim() : "";
      if (!generatedText) {
        throw new Error("Unable to generate consolidated draft.");
      }

      setConsolidatedDrafts((prev) => ({ ...prev, [groupKey]: generatedText }));
      setConsolidatedDraftTitles((prev) => ({
        ...prev,
        [groupKey]: typeof data.title === "string" ? data.title.trim() : "",
      }));
    } catch (error) {
      setConsolidationErrorByKey((prev) => ({
        ...prev,
        [groupKey]: error instanceof Error ? error.message : "Unable to generate consolidated draft.",
      }));
    } finally {
      setConsolidationLoadingKey(null);
    }
  };

  const handleOpenConsolidation = async (group: SmartInsights["repetitionGroups"][number]) => {
    const groupKey = getRepetitionGroupKey(group);
    setOpenConsolidationGroupKey(groupKey);

    if (!consolidatedDrafts[groupKey]) {
      await generateConsolidatedDraft(group, groupKey);
    }
  };

  const handleRepromptConsolidation = async (group: SmartInsights["repetitionGroups"][number]) => {
    const groupKey = getRepetitionGroupKey(group);
    await generateConsolidatedDraft(group, groupKey);
  };

  const handleCommitConsolidation = (group: SmartInsights["repetitionGroups"][number]) => {
    const groupKey = getRepetitionGroupKey(group);
    const draft = (consolidatedDrafts[groupKey] || "").trim();
    const title = (consolidatedDraftTitles[groupKey] || "").trim();
    if (!draft) {
      setConsolidationErrorByKey((prev) => ({ ...prev, [groupKey]: "Consolidated bullet is empty." }));
      return;
    }

    if (onCommitConsolidatedRepetition) {
      onCommitConsolidatedRepetition(group.bullets, draft, group.category, title || undefined);
    }

    suppressGroupCategoryComparisons(group);

    setDismissedRepetitionGroups((prev) => new Set(prev).add(groupKey));
    setOpenConsolidationGroupKey((prev) => (prev === groupKey ? null : prev));
  };

  const getCrossCategoryTargetKey = (pairKey: string, target: "left" | "right") => `${pairKey}|${target}`;

  const generateCrossCategoryReword = async (
    pair: CrossCategorySimilarityPair,
    target: "left" | "right"
  ) => {
    const selectedBullet = target === "left" ? pair.left : pair.right;
    const targetKey = getCrossCategoryTargetKey(pair.key, target);

    if (!aiEnabled) {
      setCrossCategoryRewordErrorByKey((prev) => ({
        ...prev,
        [targetKey]: "Dashboard AI is disabled in Settings.",
      }));
      return;
    }

    setCrossCategoryRewordLoadingKey(targetKey);
    setCrossCategoryRewordErrorByKey((prev) => ({ ...prev, [targetKey]: "" }));

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accomplishment: selectedBullet.text,
          category: selectedBullet.category,
          rankLevel,
          generationIntent: "alternate-category-rewrite",
          sourceBullet: selectedBullet.text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to reword bullet for this category.");
      }

      const generatedText = typeof data.bullet === "string" ? data.bullet.trim() : "";
      if (!generatedText) {
        throw new Error("Unable to reword bullet for this category.");
      }

      setCrossCategoryRewordDrafts((prev) => ({ ...prev, [targetKey]: generatedText }));
    } catch (error) {
      setCrossCategoryRewordErrorByKey((prev) => ({
        ...prev,
        [targetKey]: error instanceof Error ? error.message : "Unable to reword bullet for this category.",
      }));
    } finally {
      setCrossCategoryRewordLoadingKey(null);
    }
  };

  const commitCrossCategoryReword = (
    pair: CrossCategorySimilarityPair,
    target: "left" | "right"
  ) => {
    const selectedBullet = target === "left" ? pair.left : pair.right;
    const targetKey = getCrossCategoryTargetKey(pair.key, target);
    const draft = (crossCategoryRewordDrafts[targetKey] || "").trim();

    if (!draft) {
      setCrossCategoryRewordErrorByKey((prev) => ({
        ...prev,
        [targetKey]: "Reworded bullet is empty.",
      }));
      return;
    }

    if (draft === selectedBullet.text) {
      setCrossCategoryRewordErrorByKey((prev) => ({
        ...prev,
        [targetKey]: "Reworded bullet must be different before saving.",
      }));
      return;
    }

    if (onUpdateBulletForCategory) {
      onUpdateBulletForCategory(selectedBullet.text, draft, selectedBullet.category);
    } else if (onUpdateBullet) {
      onUpdateBullet(selectedBullet.text, draft);
    }

    setDismissedCrossCategoryPairs((prev) => new Set(prev).add(pair.key));
  };

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(Object.keys(primaryCategoryGroups).map((k) => [k, false]))
  );
  const toggleGroup = (group: string) =>
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));

  const counts: Record<string, number> = {};
  categories.forEach((cat) => (counts[cat] = 0));

  const bulletsByCategory: Record<string, string[]> = {};
  categories.forEach((cat) => (bulletsByCategory[cat] = []));
  const categorizedBullets: CategorizedBullet[] = [];

  history.forEach((item) => {
    const rawCategory = item.category || suggestions[item.text]?.category;
    if (!rawCategory) return;

    // Normalize legacy category naming variants before counting.
    const normalized = normalizeCategoryName(rawCategory);

    const matched = categories.find((cat) => cat.toLowerCase() === normalized.toLowerCase());
    if (matched) {
      counts[matched]++;
      bulletsByCategory[matched].push(item.text);
      categorizedBullets.push({ text: item.text, category: matched });
    }
  });

  const crossCategorySimilarityPairs: CrossCategorySimilarityPair[] = [];
  const seenCrossCategoryPairKeys = new Set<string>();

  const crossCategoryDetectionSource = categorizedBullets;

  for (let i = 0; i < crossCategoryDetectionSource.length; i++) {
    for (let j = i + 1; j < crossCategoryDetectionSource.length; j++) {
      const left = crossCategoryDetectionSource[i];
      const right = crossCategoryDetectionSource[j];

      if (left.category === right.category) {
        continue;
      }

      const matchType = getCrossCategoryMatchType(left.text, right.text);
      if (!matchType) {
        continue;
      }

      const categoryComparisonKey = getCategoryComparisonKey(left.category, right.category);
      if (suppressedCategoryComparisons.has(categoryComparisonKey)) {
        continue;
      }

      const pairKey = getCrossCategoryPairKey(left, right);
      if (seenCrossCategoryPairKeys.has(pairKey)) {
        continue;
      }

      seenCrossCategoryPairKeys.add(pairKey);
      crossCategorySimilarityPairs.push({
        key: pairKey,
        left,
        right,
        matchType,
      });
    }
  }

  const populatedBulletsByCategory = Object.fromEntries(
    Object.entries(bulletsByCategory).filter(([, bullets]) => bullets.length > 0)
  );
  const hasCategoryBullets = Object.keys(populatedBulletsByCategory).length > 0;
  const localUnderrepresentedCategories = categories
    .filter((category) => counts[category] <= 1)
    .map((category) => ({
      category,
      bulletCount: counts[category],
      suggestedAction: getLocalUnderrepresentedAction(category, counts[category]),
    }));

  useEffect(() => {
    if (!sessionUserId) {
      setLockedTotalEstimate(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        if (isGuestSession) {
          const raw = sessionStorage.getItem("guest-session:dashboardTotalEstimate");
          const parsed = raw ? (JSON.parse(raw) as unknown) : null;
          const parsedValue =
            typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
          if (!cancelled) {
            setLockedTotalEstimate(parsedValue);
          }
          return;
        }

        const response = await fetch("/api/user-data?key=dashboardTotalEstimate");
        const data = (await response.json()) as { value?: unknown };
        const parsedValue =
          typeof data.value === "number" && Number.isFinite(data.value) ? data.value : null;

        if (!cancelled) {
          setLockedTotalEstimate(parsedValue);
        }
      } catch {
        if (!cancelled) {
          setLockedTotalEstimate(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionUserId, isGuestSession]);

  const persistLockedTotalEstimate = async (estimate: number) => {
    if (isGuestSession) {
      sessionStorage.setItem("guest-session:dashboardTotalEstimate", JSON.stringify(estimate));
      return;
    }

    try {
      await fetch("/api/user-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dashboardTotalEstimate", value: estimate }),
      });
    } catch {
      // Non-blocking: UI keeps locked value locally even if this save fails.
    }
  };

  const evaluationRequestBody = JSON.stringify({
    rankLevel,
    categories: populatedBulletsByCategory,
  });

  const fetchSmartInsights = async () => {
    if (!aiEnabled) {
      throw new Error("Dashboard AI is disabled in Settings.");
    }

    const requestBody = JSON.stringify({
      rankLevel,
      allCategories: categories,
      bulletsByCategory,
    });

    const response = await fetch("/api/smart-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI insights unavailable.");
    }

    return data as SmartInsights;
  };

  const fetchCategoryEvaluations = async () => {
    if (!aiEnabled) {
      setEvaluations({});
      setEvaluationError("Dashboard AI is disabled in Settings.");
      setIsEvaluating(false);
      return;
    }

    if (!hasCategoryBullets) {
      setEvaluations({});
      setEvaluationError("");
      setIsEvaluating(false);
      return;
    }

    setIsEvaluating(true);
    setEvaluationError("");
    setEvaluations({});

    try {
      const response = await fetch("/api/evaluate-category-quality", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: evaluationRequestBody,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI quality score unavailable.");
      }

      const normalizedEvaluations = Object.fromEntries(
        Object.entries((data.evaluations || {}) as Record<string, RawCategoryEvaluation>)
          .map(([category, evaluation]) => [category, normalizeEvaluation(evaluation)])
          .filter((entry): entry is [string, CategoryEvaluation] => Boolean(entry[1]))
      );

      setEvaluations(normalizedEvaluations);
    } catch (error) {
      setEvaluations({});
      setEvaluationError(
        error instanceof Error ? error.message : "AI quality score unavailable."
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const analyzeDashboard = async () => {
    if (!aiEnabled) {
      setInsightsError("Dashboard AI is disabled in Settings.");
      return;
    }

    if (!hasCategoryBullets) {
      return;
    }

    const latestEstimate = categories.reduce((sum, categoryName) => {
      const categoryCount = counts[categoryName];
      if (categoryCount === 0 || categoryCount === 1) return sum + MIN_MARK;
      if (categoryCount === 2) return sum + 5;
      if (categoryCount === 3) return sum + 6;
      return sum + MAX_MARK;
    }, 0);

    setLockedTotalEstimate(latestEstimate);
    void persistLockedTotalEstimate(latestEstimate);

    setHasAnalyzedDashboard(true);
    setIsAnalyzingDashboard(true);
    setInsightsError("");
    setDismissedUnderrepresentedCategories(false);
    setDismissedBullets(new Set());
    setDismissedRepetitionGroups(new Set());
    setDismissedCrossCategoryPairs(new Set());
    setDismissedPreCloseActions(false);
    setEditingBullets({});
    setOpenConsolidationGroupKey(null);
    setConsolidatedDrafts({});
    setConsolidatedDraftTitles({});
    setConsolidationErrorByKey({});
    setCrossCategoryRewordDrafts({});
    setCrossCategoryRewordErrorByKey({});
    setCrossCategoryRewordLoadingKey(null);
    setBulletproofSummaries({});
    setBulletproofSummaryError("");
    setIsLoadingBulletproofSummaries(false);
    setBulletproofSummaryRequestKey("");

    try {
      await Promise.all([
        fetchCategoryEvaluations(),
        (async () => {
          setIsLoadingInsights(true);
          const data = await fetchSmartInsights();
          setInsights(data);
        })(),
      ]);
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : "AI insights unavailable.");
    } finally {
      setIsLoadingInsights(false);
      setIsAnalyzingDashboard(false);
    }
  };

  const refreshInsightSection = async (section: "missingResults" | "repetition") => {
    if (!aiEnabled) {
      setInsightsError("Dashboard AI is disabled in Settings.");
      return;
    }

    if (!hasCategoryBullets) {
      return;
    }

    setRefreshingInsightSection(section);
    setInsightsError("");

    try {
      const refreshedInsights = await fetchSmartInsights();

      setInsights((prev) => {
        if (!prev) {
          return refreshedInsights;
        }

        if (section === "missingResults") {
          return {
            ...prev,
            bulletsLackingResults: refreshedInsights.bulletsLackingResults,
          };
        }

        return {
          ...prev,
          repetitionGroups: refreshedInsights.repetitionGroups,
        };
      });

      if (section === "missingResults") {
        setDismissedBullets(new Set());
        setEditingBullets({});
      } else {
        setDismissedRepetitionGroups(new Set());
        setDismissedCrossCategoryPairs(new Set());
        setOpenConsolidationGroupKey(null);
        setConsolidatedDrafts({});
        setConsolidatedDraftTitles({});
        setConsolidationErrorByKey({});
        setCrossCategoryRewordDrafts({});
        setCrossCategoryRewordErrorByKey({});
        setCrossCategoryRewordLoadingKey(null);
      }
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : "AI insights unavailable.");
    } finally {
      setRefreshingInsightSection(null);
    }
  };

  useEffect(() => {
    if (!hasCategoryBullets) {
      setEvaluations({});
      setEvaluationError("");
      setInsights(null);
      setInsightsError("");
      setHasAnalyzedDashboard(false);
      setIsEvaluating(false);
      setIsLoadingInsights(false);
      setIsAnalyzingDashboard(false);
      setDismissedUnderrepresentedCategories(false);
      setDismissedBullets(new Set());
      setDismissedRepetitionGroups(new Set());
      setDismissedCrossCategoryPairs(new Set());
      setDismissedPreCloseActions(false);
      setEditingBullets({});
      setOpenConsolidationGroupKey(null);
      setConsolidatedDrafts({});
      setConsolidatedDraftTitles({});
      setConsolidationErrorByKey({});
      setCrossCategoryRewordDrafts({});
      setCrossCategoryRewordErrorByKey({});
      setCrossCategoryRewordLoadingKey(null);
      setBulletproofSummaries({});
      setBulletproofSummaryError("");
      setIsLoadingBulletproofSummaries(false);
      setBulletproofSummaryRequestKey("");
    }
  }, [hasCategoryBullets]);

  const getBarHeight = (count: number) => {
    if (count === 0) return MIN_MARK;
    if (count === 1) return MIN_MARK;
    if (count === 2) return 5;
    if (count === 3) return 6;
    return MAX_MARK; // 4+
  };

  const getBarWidth = (mark: number) => {
    return ((mark - MIN_MARK) / (MAX_MARK - MIN_MARK)) * 100;
  };

  const getRecommendedScore = (categoryName: string) => {
    const mark = getBarHeight(counts[categoryName]);
    const evaluation = evaluations[categoryName];

    return counts[categoryName] > 0 && evaluation
      ? Math.min(MAX_MARK, Math.max(MIN_MARK, Math.round((mark + evaluation.compiledScore) / 2)))
      : mark;
  };

  const bulletproofSevenCategories = categories.filter(
    (categoryName) => counts[categoryName] > 0 && getRecommendedScore(categoryName) === MAX_MARK
  );
  const bulletproofSummaryCategories = Object.fromEntries(
    bulletproofSevenCategories.map((categoryName) => [categoryName, bulletsByCategory[categoryName] ?? []])
  );
  const bulletproofRequestKey = JSON.stringify({
    rankLevel,
    categories: bulletproofSummaryCategories,
  });

  useEffect(() => {
    const requestPayload = JSON.parse(bulletproofRequestKey) as {
      rankLevel: string;
      categories: Record<string, string[]>;
    };
    const categoryNames = Object.keys(requestPayload.categories);

    if (!hasAnalyzedDashboard || !aiEnabled) {
      setBulletproofSummaries({});
      setBulletproofSummaryError("");
      setIsLoadingBulletproofSummaries(false);
      setBulletproofSummaryRequestKey("");
      return;
    }

    if (categoryNames.length === 0) {
      setBulletproofSummaries({});
      setBulletproofSummaryError("");
      setIsLoadingBulletproofSummaries(false);
      setBulletproofSummaryRequestKey("");
      return;
    }

    if (bulletproofSummaryRequestKey === bulletproofRequestKey) {
      return;
    }

    if (isLoadingBulletproofSummaries) {
      return;
    }

    let cancelled = false;
    setIsLoadingBulletproofSummaries(true);
    setBulletproofSummaryError("");

    void (async () => {
      try {
        const response = await fetch("/api/summarize-bulletproof-seven", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rankLevel: requestPayload.rankLevel,
            categories: requestPayload.categories,
          }),
        });
        const data = (await response.json()) as {
          summaries?: Record<string, string>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Unable to build Bulletproof 7 summaries.");
        }

        const summaries = Object.fromEntries(
          categoryNames.map((categoryName) => {
            const raw = typeof data.summaries?.[categoryName] === "string" ? data.summaries[categoryName] : "";
            return [categoryName, clampSummaryLength(raw)];
          })
        );

        if (!cancelled) {
          setBulletproofSummaries(summaries);
          setBulletproofSummaryRequestKey(bulletproofRequestKey);
        }
      } catch (error) {
        if (!cancelled) {
          setBulletproofSummaries({});
          setBulletproofSummaryError(
            error instanceof Error ? error.message : "Unable to build Bulletproof 7 summaries."
          );
          setBulletproofSummaryRequestKey("");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingBulletproofSummaries(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    aiEnabled,
    bulletproofRequestKey,
    bulletproofSevenCategories.length,
    bulletproofSummaryRequestKey,
    hasAnalyzedDashboard,
    isLoadingBulletproofSummaries,
    rankLevel,
  ]);

  const totalEstimate = categories.reduce((sum, cat) => {
    const count = counts[cat];
    return sum + getBarHeight(count);
  }, 0);
  const maxTotalEstimate = categories.length * MAX_MARK;
  const displayedTotalEstimate = lockedTotalEstimate ?? totalEstimate;
  const minColorScaleScore = 52;
  const totalEstimateRatio =
    maxTotalEstimate > minColorScaleScore
      ? Math.max(
          0,
          Math.min(1, (displayedTotalEstimate - minColorScaleScore) / (maxTotalEstimate - minColorScaleScore))
        )
      : 0;
  const totalEstimateHue = Math.round(totalEstimateRatio * 120);

  const visibleUnderrepresentedCount = dismissedUnderrepresentedCategories
    ? 0
    : localUnderrepresentedCategories.length;
  const visibleMissingResultsCount = insights
    ? insights.bulletsLackingResults.filter((item) => !dismissedBullets.has(item.bullet)).length
    : 0;
  const crossCategoryBulletTextSet = new Set(
    crossCategorySimilarityPairs.flatMap((pair) => [
      normalizeBulletForSimilarity(pair.left.text),
      normalizeBulletForSimilarity(pair.right.text),
    ])
  );
  const eligibleRepetitionGroups = insights
    ? insights.repetitionGroups.filter((group) => {
        const hasCrossCategoryBulletOverlap = group.bullets.some((bullet) =>
          crossCategoryBulletTextSet.has(normalizeBulletForSimilarity(bullet))
        );
        if (hasCrossCategoryBulletOverlap) {
          return false;
        }

        const groupCategories = getDistinctGroupCategories(group, history, suggestions);
        const comparisonKeys = buildCategoryComparisonKeys(groupCategories);
        if (comparisonKeys.length === 0) {
          return true;
        }

        return comparisonKeys.some((key) => !suppressedCategoryComparisons.has(key));
      })
    : [];
  const repetitionGroupResolvedBullets = new Map<string, RepetitionGroupResolvedBullet[]>();
  const repetitionGroupCategoryLabels = new Map<string, string>();

  eligibleRepetitionGroups.forEach((group) => {
    const groupIdentityKey = group.theme + "||" + group.bullets.join("||");
    const resolvedBullets = group.bullets.map((bulletText) => {
      const matchedHistoryItem = history.find((item) => item.text === bulletText);
      const resolvedCategory = matchedHistoryItem?.category || suggestions[bulletText]?.category || group.category;

      return {
        text: bulletText,
        category: resolvedCategory,
      };
    });

    repetitionGroupResolvedBullets.set(groupIdentityKey, resolvedBullets);

    const distinctCategories = Array.from(
      new Set(resolvedBullets.map((bullet) => normalizeCategoryName(bullet.category)))
    );

    repetitionGroupCategoryLabels.set(
      groupIdentityKey,
      distinctCategories.length <= 1 ? resolvedBullets[0]?.category || group.category : "Multiple Categories"
    );
  });
  const visibleRepetitionCount = eligibleRepetitionGroups.filter(
    (group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group))
  ).length;
  const visibleCrossCategorySimilarityCount = crossCategorySimilarityPairs.filter(
    (pair) => !dismissedCrossCategoryPairs.has(pair.key)
  ).length;
  const visibleRepetitionInsightCount = visibleRepetitionCount + visibleCrossCategorySimilarityCount;
  const visiblePreCloseCount = insights && !dismissedPreCloseActions ? insights.preCloseActions.length : 0;

  useEffect(() => {
    const recommendationCount = hasAnalyzedDashboard
      ? visibleMissingResultsCount + visibleRepetitionInsightCount
      : 0;

    onInsightsRecommendationCountChange?.(recommendationCount);
  }, [
    hasAnalyzedDashboard,
    visibleMissingResultsCount,
    visibleRepetitionInsightCount,
    onInsightsRecommendationCountChange,
  ]);

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-left">Dashboard</h2>
          <div className="text-center sm:text-right">
            <p className="text-xl">
              <span className="font-bold">Total Marking Estimate:</span>{" "}
              <span
                className="font-semibold"
                style={{ color: `hsl(${totalEstimateHue}, 78%, 38%)` }}
              >
                {displayedTotalEstimate}/{maxTotalEstimate}
              </span>
            </p>
            {evaluationError && (
              <p className="mt-2 text-sm text-red-600">{evaluationError}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Smart Insights Section ── */}
      <div className="dashboard-smart-insights mt-6 border-t border-gray-200 pt-6">
        <div className="space-y-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-gray-800">AI Smart Insights</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void analyzeDashboard()}
              disabled={!hasCategoryBullets || isAnalyzingDashboard || !aiEnabled}
              className="analyze-dashboard-button rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAnalyzingDashboard ? "Analyzing..." : "Analyze Dashboard"}
            </button>
          </div>
        </div>
        {!aiEnabled && (
          <p className="text-xs text-amber-700">Dashboard AI is disabled in Settings.</p>
        )}

        {!hasCategoryBullets ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Add bullets to generate AI smart insights.
          </p>
        ) : !hasAnalyzedDashboard ? (
          <p className="py-4 text-center text-sm text-gray-500">
            Press Analyze Dashboard to run AI Smart Insights.
          </p>
        ) : isLoadingInsights || isEvaluating ? (
          <p className="text-sm text-gray-500 text-center py-4">Analyzing your bullets&#8230;</p>
        ) : insightsError ? (
          <p className="text-sm text-red-600 text-center py-4">{insightsError}</p>
        ) : insights ? (
          <div className="space-y-5">

            {visibleUnderrepresentedCount > 0 && (
            <div className="insight-panel insight-panel-orange rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleInsightSection("underrepresented")}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <svg className="h-4 w-4 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <h4 className="text-sm font-semibold text-orange-700">
                    Underrepresented Categories
                    {visibleUnderrepresentedCount > 0 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-orange-200 px-2 py-0.5 text-xs font-medium text-orange-800">
                        {visibleUnderrepresentedCount}
                      </span>
                    )}
                  </h4>
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedUnderrepresentedCategories(true)}
                  disabled={visibleUnderrepresentedCount === 0}
                  className="shrink-0 rounded-md border border-orange-300 bg-white px-2.5 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Dismiss All
                </button>
                <button
                  type="button"
                  onClick={() => toggleInsightSection("underrepresented")}
                  className="shrink-0"
                  aria-label="Toggle underrepresented categories"
                  title="Toggle"
                >
                  <svg
                    className={`h-4 w-4 text-orange-400 transition-transform duration-200 ${openInsightSections.underrepresented ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {openInsightSections.underrepresented && (
                <div className="px-4 pb-4">
                  {dismissedUnderrepresentedCategories ? (
                    <p className="text-xs text-orange-600">All underrepresented category suggestions dismissed.</p>
                  ) : localUnderrepresentedCategories.length === 0 ? (
                    <p className="text-xs text-orange-600">All categories are well-represented.</p>
                  ) : (
                    <ul className="space-y-3">
                      {localUnderrepresentedCategories.map((item, i) => (
                        <li key={i} className="insight-card rounded-lg bg-white border border-orange-100 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-gray-700">{item.category}</p>
                            <span className="text-xs text-orange-600 font-medium">
                              {item.bulletCount} {item.bulletCount === 1 ? "bullet" : "bullets"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">{item.suggestedAction}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Bullets Missing Measurable Results */}
            {visibleMissingResultsCount > 0 && (() => {
              const visible = insights.bulletsLackingResults.filter(
                (item) => !dismissedBullets.has(item.bullet)
              );
              return (
                <div className="insight-panel insight-panel-yellow rounded-xl border border-yellow-200 bg-yellow-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleInsightSection("missingResults")}
                      className="flex min-w-0 flex-1 items-center text-left"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m1.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <h4 className="text-sm font-semibold text-yellow-700">
                          Bullets Missing Measurable Results
                          {visible.length > 0 && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800">
                              {visible.length}
                            </span>
                          )}
                        </h4>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshInsightSection("missingResults")}
                      disabled={refreshingInsightSection === "missingResults"}
                      className="shrink-0 rounded-md border border-yellow-300 bg-white px-2.5 py-1 text-xs font-semibold text-yellow-800 hover:bg-yellow-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {refreshingInsightSection === "missingResults" ? "Refreshing..." : "Refresh"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedBullets(
                          new Set(insights.bulletsLackingResults.map((item) => item.bullet))
                        )
                      }
                      disabled={visibleMissingResultsCount === 0}
                      className="shrink-0 rounded-md border border-yellow-300 bg-white px-2.5 py-1 text-xs font-semibold text-yellow-800 hover:bg-yellow-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Dismiss All
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleInsightSection("missingResults")}
                      className="shrink-0"
                      aria-label="Toggle bullets missing measurable results"
                      title="Toggle"
                    >
                      <svg
                        className={`h-4 w-4 text-yellow-400 transition-transform duration-200 ${openInsightSections.missingResults ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  {openInsightSections.missingResults && (
                    <div className="px-4 pb-4">
                      {visible.length === 0 ? (
                        <p className="text-xs text-yellow-600">All missing-results suggestions dismissed.</p>
                      ) : (
                        <ul className="space-y-3">
                          {visible.map((item, i) => {
                            const isEditing = Object.prototype.hasOwnProperty.call(editingBullets, item.bullet);
                            return (
                              <li key={i} className="insight-card rounded-lg bg-white border border-yellow-100 p-3">
                                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{item.category}</p>
                                <p className="text-xs text-gray-600 italic mb-2">&ldquo;{item.bullet}&rdquo;</p>
                                <div className="flex items-start gap-1.5 mb-3">
                                  <svg className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                  <p className="text-xs text-gray-700">
                                    {item.suggestedImprovement.split("[X%]").map((part, partIndex, parts) => (
                                      <span key={partIndex}>
                                        {part}
                                        {partIndex < parts.length - 1 && <strong>[X%]</strong>}
                                      </span>
                                    ))}
                                  </p>
                                </div>
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <textarea
                                      className="w-full rounded-md border border-yellow-300 bg-yellow-50 px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-400 resize-none"
                                      rows={3}
                                      value={editingBullets[item.bullet]}
                                      onChange={(e) =>
                                        setEditingBullets((prev) => ({ ...prev, [item.bullet]: e.target.value }))
                                      }
                                    />
                                    <p className="text-xs text-yellow-700">
                                      Replace <strong>[X%]</strong> with your real measurable result before saving.
                                    </p>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => commitEditingBullet(item.bullet, item.category)}
                                        className="rounded-md bg-yellow-500 px-3 py-1 text-xs font-semibold text-white hover:bg-yellow-600 transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => cancelEditingBullet(item.bullet)}
                                        className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startEditingBullet(item.bullet, item.suggestedImprovement)}
                                    className="flex items-center gap-1.5 rounded-md border border-yellow-300 bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800 hover:bg-yellow-200 transition-colors"
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    Edit Bullet
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Repetition Detected */}
            {visibleRepetitionInsightCount > 0 && (
            <div className="insight-panel insight-panel-purple rounded-xl border border-purple-200 bg-purple-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleInsightSection("repetition")}
                  className="flex min-w-0 flex-1 items-center text-left"
                >
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <h4 className="text-sm font-semibold text-purple-700">
                      Repetition Detected
                      {visibleRepetitionInsightCount > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-purple-200 px-2 py-0.5 text-xs font-medium text-purple-800">
                          {visibleRepetitionInsightCount} {visibleRepetitionInsightCount === 1 ? "item" : "items"}
                        </span>
                      )}
                    </h4>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void refreshInsightSection("repetition")}
                  disabled={refreshingInsightSection === "repetition"}
                  className="shrink-0 rounded-md border border-purple-300 bg-white px-2.5 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshingInsightSection === "repetition" ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDismissedRepetitionGroups(
                      new Set(eligibleRepetitionGroups.map((group) => getRepetitionGroupKey(group)))
                    );
                    setDismissedCrossCategoryPairs(
                      new Set(crossCategorySimilarityPairs.map((pair) => pair.key))
                    );
                  }}
                  disabled={visibleRepetitionInsightCount === 0}
                  className="shrink-0 rounded-md border border-purple-300 bg-white px-2.5 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Dismiss All
                </button>
                <button
                  type="button"
                  onClick={() => toggleInsightSection("repetition")}
                  className="shrink-0"
                  aria-label="Toggle repetition detected"
                  title="Toggle"
                >
                  <svg
                    className={`h-4 w-4 text-purple-400 transition-transform duration-200 ${openInsightSections.repetition ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {openInsightSections.repetition && (
                <div className="px-4 pb-4">
                  {visibleCrossCategorySimilarityCount > 0 && (
                    <div className="insight-card mb-4 rounded-lg border border-purple-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                          Cross-Category Similarity Dialogue
                        </p>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          {visibleCrossCategorySimilarityCount}
                        </span>
                      </div>
                      <p className="mb-3 text-xs text-gray-600">
                        These bullets look too close across different categories. Generate a category-specific rewrite for either mark only when you need clearer differentiation. If they already read as distinct category evidence, dismiss the item.
                      </p>
                      <ul className="space-y-3">
                        {crossCategorySimilarityPairs
                          .filter((pair) => !dismissedCrossCategoryPairs.has(pair.key))
                          .map((pair, index) => {
                            const leftKey = getCrossCategoryTargetKey(pair.key, "left");
                            const rightKey = getCrossCategoryTargetKey(pair.key, "right");
                            const leftDraft = crossCategoryRewordDrafts[leftKey] || "";
                            const rightDraft = crossCategoryRewordDrafts[rightKey] || "";

                            return (
                              <li key={pair.key} className="insight-subpanel rounded-md border border-purple-100 bg-purple-50 p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-purple-700">
                                    Pair {index + 1}: {pair.matchType === "identical" ? "Identical" : "Very Similar"}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setDismissedCrossCategoryPairs((prev) => new Set(prev).add(pair.key))}
                                    className="rounded border border-purple-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-purple-600 hover:bg-purple-100 transition-colors"
                                    title="Dismiss similarity dialogue"
                                    aria-label="Dismiss similarity dialogue"
                                  >
                                    Dismiss
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                  <div className="insight-card rounded-md border border-purple-100 bg-white p-2">
                                    <p className="mb-1 text-xs font-semibold text-gray-700">{pair.left.category}</p>
                                    <p className="text-xs text-gray-600">&ldquo;{pair.left.text}&rdquo;</p>

                                    {(leftDraft || crossCategoryRewordErrorByKey[leftKey]) && (
                                      <div className="insight-card mt-3 rounded-md border border-purple-200 bg-white p-2">
                                        <p className="mb-1 text-xs font-semibold text-purple-700">Draft for {pair.left.category}</p>
                                        <textarea
                                          className="w-full resize-none rounded-md border border-purple-200 bg-white px-2.5 py-2 text-xs italic text-gray-800 focus:outline-none focus:ring-1 focus:ring-purple-300"
                                          rows={3}
                                          value={leftDraft}
                                          onChange={(e) =>
                                            setCrossCategoryRewordDrafts((prev) => ({ ...prev, [leftKey]: e.target.value }))
                                          }
                                        />
                                        {crossCategoryRewordErrorByKey[leftKey] && (
                                          <p className="mt-1 text-xs text-red-600">{crossCategoryRewordErrorByKey[leftKey]}</p>
                                        )}
                                        <div className="mt-2 flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => commitCrossCategoryReword(pair, "left")}
                                            className="rounded-md bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
                                          >
                                            Save {pair.left.category}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCrossCategoryRewordDrafts((prev) => {
                                                const next = { ...prev };
                                                delete next[leftKey];
                                                return next;
                                              });
                                              setCrossCategoryRewordErrorByKey((prev) => ({ ...prev, [leftKey]: "" }));
                                            }}
                                            className="ml-auto rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                          >
                                            Exit
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => void generateCrossCategoryReword(pair, "left")}
                                      disabled={crossCategoryRewordLoadingKey === leftKey}
                                      className="mt-3 w-full rounded-md border border-purple-300 bg-white px-3 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {crossCategoryRewordLoadingKey === leftKey ? "Rewording..." : `Reword for ${pair.left.category}`}
                                    </button>
                                  </div>
                                  <div className="insight-card rounded-md border border-purple-100 bg-white p-2">
                                    <p className="mb-1 text-xs font-semibold text-gray-700">{pair.right.category}</p>
                                    <p className="text-xs text-gray-600">&ldquo;{pair.right.text}&rdquo;</p>

                                    {(rightDraft || crossCategoryRewordErrorByKey[rightKey]) && (
                                      <div className="insight-card mt-3 rounded-md border border-purple-200 bg-white p-2">
                                        <p className="mb-1 text-xs font-semibold text-purple-700">Draft for {pair.right.category}</p>
                                        <textarea
                                          className="w-full resize-none rounded-md border border-purple-200 bg-white px-2.5 py-2 text-xs italic text-gray-800 focus:outline-none focus:ring-1 focus:ring-purple-300"
                                          rows={3}
                                          value={rightDraft}
                                          onChange={(e) =>
                                            setCrossCategoryRewordDrafts((prev) => ({ ...prev, [rightKey]: e.target.value }))
                                          }
                                        />
                                        {crossCategoryRewordErrorByKey[rightKey] && (
                                          <p className="mt-1 text-xs text-red-600">{crossCategoryRewordErrorByKey[rightKey]}</p>
                                        )}
                                        <div className="mt-2 flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => commitCrossCategoryReword(pair, "right")}
                                            className="rounded-md bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
                                          >
                                            Save {pair.right.category}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCrossCategoryRewordDrafts((prev) => {
                                                const next = { ...prev };
                                                delete next[rightKey];
                                                return next;
                                              });
                                              setCrossCategoryRewordErrorByKey((prev) => ({ ...prev, [rightKey]: "" }));
                                            }}
                                            className="ml-auto rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                          >
                                            Exit
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => void generateCrossCategoryReword(pair, "right")}
                                      disabled={crossCategoryRewordLoadingKey === rightKey}
                                      className="mt-3 w-full rounded-md border border-purple-300 bg-white px-3 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {crossCategoryRewordLoadingKey === rightKey ? "Rewording..." : `Reword for ${pair.right.category}`}
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}

                  {eligibleRepetitionGroups.filter((group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group))).length === 0 ? (
                    visibleCrossCategorySimilarityCount === 0 ? (
                      <p className="text-xs text-purple-600">All repetition suggestions dismissed.</p>
                    ) : null
                  ) : (
                    <ul className="space-y-3">
                      {eligibleRepetitionGroups
                        .filter((group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group)))
                        .map((group, i) => {
                          const groupKey = getRepetitionGroupKey(group);
                          const groupIdentityKey = group.theme + "||" + group.bullets.join("||");
                          const resolvedCategoryLabel = repetitionGroupCategoryLabels.get(groupIdentityKey) || group.category;
                          const isMultiCategory = resolvedCategoryLabel === "Multiple Categories";
                          const isOpen = openConsolidationGroupKey === groupKey;
                          const isReprompting = consolidationLoadingKey === groupKey;
                          return (
                        <li key={i} className="insight-card rounded-lg bg-white border border-purple-100 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-purple-700">{group.theme}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-purple-500 font-medium">
                                {(repetitionGroupResolvedBullets.get(groupIdentityKey) || []).filter(b => !(repGroupResolvedBullets[groupKey] ?? []).includes(b.text)).length} bullets
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  suppressGroupCategoryComparisons(group);
                                  setDismissedRepetitionGroups((prev) => new Set(prev).add(groupKey));
                                }}
                                className="rounded border border-purple-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-purple-600 hover:bg-purple-100 transition-colors"
                                title="Dismiss suggestion"
                                aria-label="Dismiss suggestion"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
                            {resolvedCategoryLabel}
                          </p>
                          <ul className="mb-2 space-y-1">
                            {(repetitionGroupResolvedBullets.get(group.theme + "||" + group.bullets.join("||")) || [])
                              .filter((bullet) => !(repGroupResolvedBullets[groupKey] ?? []).includes(bullet.text))
                              .map((bullet, j) => {
                              const isEditing = repBulletEditingKey === bullet.text;
                              const isRewording = repBulletRewordLoadingKey === bullet.text;
                              const rewordDraft = repBulletRewordDrafts[bullet.text];
                              const rewordError = repBulletRewordErrorByKey[bullet.text];
                              return (
                              <li key={j} className="rounded-md border border-gray-300 bg-gray-50 px-2 py-2 text-xs text-gray-700">
                                <div className="flex items-start justify-between gap-2 italic mb-1.5">
                                  <div className="flex min-w-0 items-start gap-1.5">
                                    <span className="mr-1 inline-flex shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold not-italic text-gray-700">
                                      {bullet.category}
                                    </span>
                                    <span className="min-w-0">&bull; {bullet.text}</span>
                                  </div>
                                  {isMultiCategory && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        resolveRepetitionBullet(bullet.text, group);
                                      }}
                                      className="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                                      title={`Dismiss ${bullet.category} from this comparison`}
                                      aria-label={`Dismiss ${bullet.category} from this comparison`}
                                    >
                                      x
                                    </button>
                                  )}
                                </div>
                                {isMultiCategory && (<>
                                <div className="flex gap-2 not-italic">
                                  <button
                                    type="button"
                                    disabled={isRewording}
                                    onClick={() => void generateRepetitionBulletReword(bullet.text, bullet.category)}
                                    className="rounded border border-blue-300 bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isRewording ? "Rewording..." : "Reword"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRepBulletEditingKey(bullet.text);
                                      setRepBulletEditValues((prev) => ({ ...prev, [bullet.text]: bullet.text }));
                                    }}
                                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                                  >
                                    Edit
                                  </button>
                                </div>
                                {rewordError && <p className="mt-1 text-[10px] text-red-600 not-italic">{rewordError}</p>}
                                {rewordDraft && !isRewording && (
                                  <div className="mt-2 rounded-md border border-gray-300 bg-white p-2.5 space-y-2 not-italic">
                                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">Reword Draft</p>
                                    <p className="text-xs text-gray-800 leading-relaxed">{rewordDraft}</p>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => commitRepetitionBulletReword(bullet.text, rewordDraft, group)}
                                        className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void generateRepetitionBulletReword(bullet.text, bullet.category)}
                                        disabled={isRewording}
                                        className="rounded border border-blue-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        Retry
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRepBulletRewordDrafts((prev) => { const n = { ...prev }; delete n[bullet.text]; return n; })}
                                        className="ml-auto rounded border border-gray-300 bg-transparent px-2.5 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                                      >
                                        Dismiss
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {isEditing && (
                                  <div className="mt-2 space-y-1.5 not-italic">
                                    <textarea
                                      className="w-full rounded-md border border-purple-200 bg-white px-2 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-300 resize-none"
                                      rows={3}
                                      value={repBulletEditValues[bullet.text] ?? bullet.text}
                                      onChange={(e) => setRepBulletEditValues((prev) => ({ ...prev, [bullet.text]: e.target.value }))}
                                      autoFocus
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => commitRepetitionBulletEdit(bullet.text, group)}
                                        className="rounded bg-purple-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-purple-400 transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { setRepBulletEditingKey(null); setRepBulletEditValues((prev) => { const n = { ...prev }; delete n[bullet.text]; return n; }); }}
                                        className="rounded border border-purple-600 bg-transparent px-2.5 py-1 text-[10px] font-semibold text-purple-300 hover:bg-purple-800 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                                </>)}
                              </li>
                              );
                            })}
                          </ul>
                          {!isMultiCategory && (
                          <div className="flex items-start gap-1.5">
                            <svg className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <p className="text-xs text-gray-700">{group.suggestion}</p>
                          </div>
                          )}

                          {!isMultiCategory && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => void handleOpenConsolidation(group)}
                              className="rounded-md border border-purple-300 bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-200 transition-colors"
                            >
                              Consolidate and Reprompt
                            </button>
                          </div>
                          )}

                          {!isMultiCategory && isOpen && (
                            <div className="insight-subpanel mt-3 rounded-md border border-purple-200 bg-purple-50 p-3 space-y-2">
                              <p className="text-xs font-semibold text-purple-700">Consolidated Mark Draft</p>
                              <textarea
                                className="w-full rounded-md border border-purple-200 bg-white px-2.5 py-2 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-purple-300 resize-none"
                                rows={4}
                                value={consolidatedDrafts[groupKey] || ""}
                                onChange={(e) =>
                                  setConsolidatedDrafts((prev) => ({ ...prev, [groupKey]: e.target.value }))
                                }
                              />
                              {consolidationErrorByKey[groupKey] && (
                                <p className="text-xs text-red-600">{consolidationErrorByKey[groupKey]}</p>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCommitConsolidation(group)}
                                  className="rounded-md bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRepromptConsolidation(group)}
                                  disabled={isReprompting}
                                  className="rounded-md border border-purple-300 bg-white px-3 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {isReprompting ? "Reprompting..." : "Reprompt"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOpenConsolidationGroupKey(null)}
                                  className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                        })}
                    </ul>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Before Marks Close */}
            {visiblePreCloseCount > 0 && (
            <div className="insight-panel insight-panel-green rounded-xl border border-green-200 bg-green-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleInsightSection("preClose")}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h4 className="text-sm font-semibold text-green-700">Before Marks Close</h4>
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedPreCloseActions(true)}
                  disabled={visiblePreCloseCount === 0}
                  className="shrink-0 rounded-md border border-green-300 bg-white px-2.5 py-1 text-xs font-semibold text-green-800 hover:bg-green-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Dismiss All
                </button>
                <button
                  type="button"
                  onClick={() => toggleInsightSection("preClose")}
                  className="shrink-0"
                  aria-label="Toggle before marks close"
                  title="Toggle"
                >
                  <svg
                    className={`h-4 w-4 text-green-400 transition-transform duration-200 ${openInsightSections.preClose ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {openInsightSections.preClose && (
                <div className="px-4 pb-4">
                  {dismissedPreCloseActions || insights.preCloseActions.length === 0 ? (
                    <p className="text-xs text-green-600">No additional pre-close actions identified.</p>
                  ) : (
                    <ul className="space-y-3">
                      {insights.preCloseActions.map((item, i) => (
                        <li key={i} className="insight-card rounded-lg bg-white border border-green-100 p-3">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <p className="text-xs text-gray-700 flex-1">{item.action}</p>
                            <span className={`shrink-0 text-xs font-bold ${
                              item.feasibility >= 70 ? "text-green-700" :
                              item.feasibility >= 40 ? "text-yellow-700" : "text-red-600"
                            }`}>
                              {item.feasibility}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-green-100">
                            <div
                              className={`h-1.5 rounded-full ${
                                item.feasibility >= 70 ? "bg-green-500" :
                                item.feasibility >= 40 ? "bg-yellow-400" : "bg-red-400"
                              }`}
                              style={{ width: `${item.feasibility}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            )}

          </div>
        ) : null}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {([
          ["Military", "Performance"],
          ["Professional Qualities", "Leadership"],
        ] as const).map((columnGroups, columnIndex) => (
          <div key={columnIndex} className="space-y-4 xl:contents">
            {columnGroups.map((primaryCategory) => {
              const subCategories = primaryCategoryGroups[primaryCategory] || [];
              const groupMaxScore = subCategories.length * MAX_MARK;
              const groupRecommendedScore = subCategories.reduce((sum, cat) => {
                return sum + getRecommendedScore(cat);
              }, 0);

              return (
                <div key={primaryCategory} className="rounded-xl border border-gray-200 bg-gray-50">
                  <button
                    onClick={() => toggleGroup(primaryCategory)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <h3 className="text-base font-semibold text-gray-700">{primaryCategory}</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-500">
                        {groupRecommendedScore}/{groupMaxScore}
                      </p>
                      <svg
                        className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
                          openGroups[primaryCategory] ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {openGroups[primaryCategory] && (
                  <div className="space-y-3 px-4 pb-4">
                    {subCategories.map((cat) => {
                      const count = counts[cat];
                      const mark = getBarHeight(count);
                      const barWidth = `${getBarWidth(mark)}%`;
                      const evaluation = evaluations[cat];
                      const recommendedScore = getRecommendedScore(cat);

                      const scoreColors = {
                        bar:    recommendedScore === 4 ? "bg-red-500"        : recommendedScore === 5 ? "bg-yellow-400"    : recommendedScore === 6 ? "bg-green-400"     : "bg-green-700",
                        barBg:  recommendedScore === 4 ? "bg-red-100"        : recommendedScore === 5 ? "bg-yellow-100"   : recommendedScore === 6 ? "bg-green-100"    : "bg-green-200",
                        box:    recommendedScore === 4 ? "border-red-300 bg-red-50"    : recommendedScore === 5 ? "border-yellow-300 bg-yellow-50" : recommendedScore === 6 ? "border-green-300 bg-green-50"  : "border-green-600 bg-green-100",
                        label:  recommendedScore === 4 ? "text-red-500"      : recommendedScore === 5 ? "text-yellow-600"  : recommendedScore === 6 ? "text-green-600"   : "text-green-800",
                        value:  recommendedScore === 4 ? "text-red-700"      : recommendedScore === 5 ? "text-yellow-700"  : recommendedScore === 6 ? "text-green-700"   : "text-green-900",
                      };

                      return (
                        <div key={cat} className="w-full rounded-lg border border-white bg-white p-4 shadow-sm">
                          <div className="mb-1 text-center">
                            <p className="text-sm font-semibold text-gray-700">{cat}</p>
                          </div>
                          <div className={`h-4 w-full rounded ${scoreColors.barBg}`}>
                            <div
                              className={`h-4 rounded ${scoreColors.bar}`}
                              style={{ width: barWidth }}
                            ></div>
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2">
                            {/* Overall recommended score */}
                            <div className={`rounded-lg border p-2 text-center sm:p-2.5 ${scoreColors.box}`}>
                              <p className={`text-xs font-semibold leading-tight ${scoreColors.label}`}>Recommended</p>
                              <p className={`mt-1 text-lg font-bold ${scoreColors.value}`}>
                                {count === 0 || (!isEvaluating && !evaluation)
                                  ? `${mark}/7`
                                  : isEvaluating && !evaluation
                                    ? "…"
                                    : `${recommendedScore}/7`}
                              </p>
                            </div>

                            {/* AI Quality Score */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center sm:p-2.5">
                              <p className="text-xs font-semibold leading-tight text-slate-500">AI Quality</p>
                              <p className="mt-1 text-lg font-bold text-blue-600">
                                {count === 0
                                  ? "N/A"
                                  : isEvaluating && !evaluation
                                    ? "…"
                                    : evaluation
                                      ? `${evaluation.compiledScore}/7`
                                      : "—"}
                              </p>
                            </div>

                            {/* Bullet-based marking score */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center sm:p-2.5">
                              <p className="text-xs font-semibold leading-tight text-slate-500">Bullet Score</p>
                              <p className="mt-1 text-lg font-bold text-slate-700">{mark}/7</p>
                            </div>
                          </div>

                          {/* AI explanation */}
                          {count === 0 ? (
                            <p className="mt-2 text-sm text-slate-500">
                              Add bullets to this category to generate an AI quality score.
                            </p>
                          ) : evaluation ? (
                            <p className="mt-2 text-sm text-slate-600 break-normal">
                              {evaluation.aiExplanation.replace(
                                /^Recommended\s+\d+:/i,
                                `Recommended ${recommendedScore}:`
                              )}
                            </p>
                          ) : !isEvaluating ? (
                            <p className="mt-2 text-sm text-slate-500">
                              AI quality score unavailable for this category right now.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

        <p className="mt-4 text-base text-gray-600">
          AI Quality Score - category analysis based on bullet strength and impact.
          <br />
          Bullet Score - the total number of bullets per category.
          <br />
          Recommended Mark - the combination of AI Quality and Bullet Score
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="bulletproof-seven-panel rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-indigo-900">Your Bulletproof "7"</h3>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {bulletproofSevenCategories.length} {bulletproofSevenCategories.length === 1 ? "Category" : "Categories"}
            </span>
          </div>

          {!hasAnalyzedDashboard ? (
            <p className="text-sm text-indigo-700">Run Analyze Dashboard to generate Bulletproof 7 recommendations.</p>
          ) : !aiEnabled ? (
            <p className="text-sm text-indigo-700">Dashboard AI is disabled in Settings.</p>
          ) : isLoadingBulletproofSummaries ? (
            <p className="text-sm text-indigo-700">Building consolidated 7-level summaries...</p>
          ) : bulletproofSummaryError ? (
            <p className="text-sm text-red-600">{bulletproofSummaryError}</p>
          ) : bulletproofSevenCategories.length === 0 ? (
            <p className="text-sm text-indigo-700">
              No categories currently project a 7/7 recommendation based on bullet strength and AI quality.
            </p>
          ) : (
            <ul className="space-y-3">
              {bulletproofSevenCategories.map((categoryName) => {
                const summary = bulletproofSummaries[categoryName] || "Summary unavailable.";
                return (
                  <li key={categoryName} className="rounded-lg border border-indigo-100 bg-white p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-800">{categoryName}</p>
                      <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">7/7</span>
                    </div>
                    <p className="text-sm text-gray-700">{summary}</p>
                    <p className="mt-1 text-xs text-gray-500">{summary.length}/250 chars</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}