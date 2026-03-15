import { useEffect, useState } from "react";

type DashboardPanelProps = {
  history: { text: string; category?: string }[];
  suggestions: Record<string, { category: string; reason: string }>;
  rankLevel: string;
  onUpdateBullet?: (oldText: string, newText: string) => void;
  onCommitConsolidatedRepetition?: (
    originalBullets: string[],
    consolidatedBullet: string,
    category?: string
  ) => void;
};

type SmartInsights = {
  underrepresentedCategories: Array<{
    category: string;
    bulletCount: number;
    suggestedAction: string;
  }>;
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

const MIN_MARK = 4;
const MAX_MARK = 7;

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

export default function DashboardPanel({
  history,
  suggestions,
  rankLevel,
  onUpdateBullet,
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
  const [hasLoadedInsightsOnce, setHasLoadedInsightsOnce] = useState(false);
  const [showSmartInsights, setShowSmartInsights] = useState(true);
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
  const [dismissedRepetitionGroups, setDismissedRepetitionGroups] = useState<Set<string>>(new Set());
  const [openConsolidationGroupKey, setOpenConsolidationGroupKey] = useState<string | null>(null);
  const [consolidatedDrafts, setConsolidatedDrafts] = useState<Record<string, string>>({});
  const [consolidationLoadingKey, setConsolidationLoadingKey] = useState<string | null>(null);
  const [consolidationErrorByKey, setConsolidationErrorByKey] = useState<Record<string, string>>({});

  const startEditingBullet = (originalText: string, suggested: string) =>
    setEditingBullets((prev) => ({ ...prev, [originalText]: suggested }));

  const cancelEditingBullet = (originalText: string) =>
    setEditingBullets((prev) => {
      const next = { ...prev };
      delete next[originalText];
      return next;
    });

  const commitEditingBullet = (originalText: string) => {
    const newText = (editingBullets[originalText] ?? "").trim();
    if (newText && newText !== originalText && onUpdateBullet) {
      onUpdateBullet(originalText, newText);
    }
    cancelEditingBullet(originalText);
    setDismissedBullets((prev) => new Set(prev).add(originalText));
  };

  const getRepetitionGroupKey = (group: SmartInsights["repetitionGroups"][number]) =>
    `${group.theme}|${group.category}|${group.bullets.join("||")}`;

  const generateConsolidatedDraft = async (
    group: SmartInsights["repetitionGroups"][number],
    groupKey: string
  ) => {
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
    if (!draft) {
      setConsolidationErrorByKey((prev) => ({ ...prev, [groupKey]: "Consolidated bullet is empty." }));
      return;
    }

    if (onCommitConsolidatedRepetition) {
      onCommitConsolidatedRepetition(group.bullets, draft, group.category);
    }

    setDismissedRepetitionGroups((prev) => new Set(prev).add(groupKey));
    setOpenConsolidationGroupKey((prev) => (prev === groupKey ? null : prev));
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

  history.forEach((item) => {
    const rawCategory = item.category || suggestions[item.text]?.category;
    if (!rawCategory) return;

    // Normalize legacy category naming variants before counting.
    const normalized = normalizeCategoryName(rawCategory);

    const matched = categories.find((cat) => cat.toLowerCase() === normalized.toLowerCase());
    if (matched) {
      counts[matched]++;
      bulletsByCategory[matched].push(item.text);
    }
  });

  const populatedBulletsByCategory = Object.fromEntries(
    Object.entries(bulletsByCategory).filter(([, bullets]) => bullets.length > 0)
  );
  const hasCategoryBullets = Object.keys(populatedBulletsByCategory).length > 0;

  const evaluationRequestBody = JSON.stringify({
    rankLevel,
    categories: populatedBulletsByCategory,
  });

  const fetchSmartInsights = async () => {
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

  const refreshInsightSection = async (section: "missingResults" | "repetition") => {
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
        setOpenConsolidationGroupKey(null);
        setConsolidatedDrafts({});
        setConsolidationErrorByKey({});
      }
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : "AI insights unavailable.");
    } finally {
      setRefreshingInsightSection(null);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    if (!hasCategoryBullets) {
      setEvaluations({});
      setEvaluationError("");
      setIsEvaluating(false);
      return;
    }

    const fetchEvaluations = async () => {
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

        if (!isCancelled) {
          const normalizedEvaluations = Object.fromEntries(
            Object.entries((data.evaluations || {}) as Record<string, RawCategoryEvaluation>)
              .map(([category, evaluation]) => [category, normalizeEvaluation(evaluation)])
              .filter((entry): entry is [string, CategoryEvaluation] => Boolean(entry[1]))
          );

          setEvaluations(normalizedEvaluations);
        }
      } catch (error) {
        if (!isCancelled) {
          setEvaluations({});
          setEvaluationError(
            error instanceof Error ? error.message : "AI quality score unavailable."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsEvaluating(false);
        }
      }
    };

    fetchEvaluations();

    return () => {
      isCancelled = true;
    };
  }, [evaluationRequestBody, hasCategoryBullets]);

  useEffect(() => {
    let isCancelled = false;

    if (!showSmartInsights || !hasCategoryBullets || hasLoadedInsightsOnce) {
      return;
    }

    const fetchInsights = async () => {
      setIsLoadingInsights(true);
      setInsightsError("");

      try {
        const data = await fetchSmartInsights();

        if (!isCancelled) {
          setInsights(data);
          setHasLoadedInsightsOnce(true);
        }
      } catch (error) {
        if (!isCancelled) {
          setInsightsError(
            error instanceof Error ? error.message : "AI insights unavailable."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingInsights(false);
        }
      }
    };

    fetchInsights();

    return () => {
      isCancelled = true;
    };
  }, [showSmartInsights, hasCategoryBullets, hasLoadedInsightsOnce, rankLevel, categories, bulletsByCategory]);

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

  const totalEstimate = categories.reduce((sum, cat) => {
    const count = counts[cat];
    return sum + getBarHeight(count);
  }, 0);
  const maxTotalEstimate = categories.length * MAX_MARK;
  const minColorScaleScore = 52;
  const totalEstimateRatio =
    maxTotalEstimate > minColorScaleScore
      ? Math.max(
          0,
          Math.min(1, (totalEstimate - minColorScaleScore) / (maxTotalEstimate - minColorScaleScore))
        )
      : 0;
  const totalEstimateHue = Math.round(totalEstimateRatio * 120);

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
                {totalEstimate}/{maxTotalEstimate}
              </span>
            </p>
            {evaluationError && (
              <p className="mt-2 text-sm text-red-600">{evaluationError}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Smart Insights Section ── */}
      <div className="mt-6 border-t border-gray-200 pt-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-gray-800">AI Smart Insights</h3>
          <button
            type="button"
            onClick={() => setShowSmartInsights((prev) => !prev)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              showSmartInsights
                ? "border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {showSmartInsights ? "Turn Off" : "Turn On"}
          </button>
        </div>

        {!showSmartInsights ? (
          <p className="py-4 text-center text-sm text-gray-500">
            AI Smart Insights are turned off.
          </p>
        ) : !hasCategoryBullets ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Add bullets to generate AI smart insights.
          </p>
        ) : isLoadingInsights ? (
          <p className="text-sm text-gray-500 text-center py-4">Analyzing your bullets&#8230;</p>
        ) : insightsError ? (
          <p className="text-sm text-red-600 text-center py-4">{insightsError}</p>
        ) : insights ? (
          <div className="space-y-5">

            {/* Underrepresented Categories */}
            <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleInsightSection("underrepresented")}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <h4 className="text-sm font-semibold text-orange-700">
                    Underrepresented Categories
                    {insights.underrepresentedCategories.length > 0 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-orange-200 px-2 py-0.5 text-xs font-medium text-orange-800">
                        {insights.underrepresentedCategories.length}
                      </span>
                    )}
                  </h4>
                </div>
                <svg
                  className={`h-4 w-4 text-orange-400 transition-transform duration-200 ${openInsightSections.underrepresented ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openInsightSections.underrepresented && (
                <div className="px-4 pb-4">
                  {insights.underrepresentedCategories.length === 0 ? (
                    <p className="text-xs text-orange-600">All categories are well-represented.</p>
                  ) : (
                    <ul className="space-y-3">
                      {insights.underrepresentedCategories.map((item, i) => (
                        <li key={i} className="rounded-lg bg-white border border-orange-100 p-3">
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

            {/* Bullets Missing Measurable Results */}
            {(() => {
              const visible = insights.bulletsLackingResults.filter(
                (item) => !dismissedBullets.has(item.bullet)
              );
              return (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleInsightSection("missingResults")}
                      className="flex min-w-0 flex-1 items-center justify-between text-left"
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
                      <svg
                        className={`h-4 w-4 text-yellow-400 transition-transform duration-200 ${openInsightSections.missingResults ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshInsightSection("missingResults")}
                      disabled={refreshingInsightSection === "missingResults"}
                      className="shrink-0 rounded-md border border-yellow-300 bg-white px-2.5 py-1 text-xs font-semibold text-yellow-800 hover:bg-yellow-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {refreshingInsightSection === "missingResults" ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {openInsightSections.missingResults && (
                    <div className="px-4 pb-4">
                      {visible.length === 0 ? (
                        <p className="text-xs text-yellow-600">All bullets include measurable outcomes.</p>
                      ) : (
                        <ul className="space-y-3">
                          {visible.map((item, i) => {
                            const isEditing = Object.prototype.hasOwnProperty.call(editingBullets, item.bullet);
                            return (
                              <li key={i} className="rounded-lg bg-white border border-yellow-100 p-3">
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
                                        onClick={() => commitEditingBullet(item.bullet)}
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
            <div className="rounded-xl border border-purple-200 bg-purple-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleInsightSection("repetition")}
                  className="flex min-w-0 flex-1 items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <h4 className="text-sm font-semibold text-purple-700">
                      Repetition Detected
                      {insights.repetitionGroups.filter((group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group))).length > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-purple-200 px-2 py-0.5 text-xs font-medium text-purple-800">
                          {insights.repetitionGroups.filter((group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group))).length} {insights.repetitionGroups.filter((group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group))).length === 1 ? "group" : "groups"}
                        </span>
                      )}
                    </h4>
                  </div>
                  <svg
                    className={`h-4 w-4 text-purple-400 transition-transform duration-200 ${openInsightSections.repetition ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void refreshInsightSection("repetition")}
                  disabled={refreshingInsightSection === "repetition"}
                  className="shrink-0 rounded-md border border-purple-300 bg-white px-2.5 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshingInsightSection === "repetition" ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {openInsightSections.repetition && (
                <div className="px-4 pb-4">
                  {insights.repetitionGroups.filter((group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group))).length === 0 ? (
                    <p className="text-xs text-purple-600">No repeated themes detected across your bullets.</p>
                  ) : (
                    <ul className="space-y-3">
                      {insights.repetitionGroups
                        .filter((group) => !dismissedRepetitionGroups.has(getRepetitionGroupKey(group)))
                        .map((group, i) => {
                          const groupKey = getRepetitionGroupKey(group);
                          const isOpen = openConsolidationGroupKey === groupKey;
                          const isReprompting = consolidationLoadingKey === groupKey;
                          return (
                        <li key={i} className="rounded-lg bg-white border border-purple-100 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-purple-700">{group.theme}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-purple-500 font-medium">{group.bullets.length} bullets</span>
                              <button
                                type="button"
                                onClick={() => setDismissedRepetitionGroups((prev) => new Set(prev).add(groupKey))}
                                className="rounded border border-purple-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-purple-600 hover:bg-purple-100 transition-colors"
                                title="Dismiss suggestion"
                                aria-label="Dismiss suggestion"
                              >
                                [X]
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{group.category}</p>
                          <ul className="mb-2 space-y-1">
                            {group.bullets.map((b, j) => (
                              <li key={j} className="text-xs text-gray-600 italic">&bull; {b}</li>
                            ))}
                          </ul>
                          <div className="flex items-start gap-1.5">
                            <svg className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <p className="text-xs text-gray-700">{group.suggestion}</p>
                          </div>

                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => void handleOpenConsolidation(group)}
                              className="rounded-md border border-purple-300 bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-200 transition-colors"
                            >
                              Consolidate and Reprompt
                            </button>
                          </div>

                          {isOpen && (
                            <div className="mt-3 rounded-md border border-purple-200 bg-purple-50 p-3 space-y-2">
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

            {/* Before Marks Close */}
            <div className="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleInsightSection("preClose")}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h4 className="text-sm font-semibold text-green-700">Before Marks Close</h4>
                </div>
                <svg
                  className={`h-4 w-4 text-green-400 transition-transform duration-200 ${openInsightSections.preClose ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openInsightSections.preClose && (
                <div className="px-4 pb-4">
                  {insights.preCloseActions.length === 0 ? (
                    <p className="text-xs text-green-600">No additional pre-close actions identified.</p>
                  ) : (
                    <ul className="space-y-3">
                      {insights.preCloseActions.map((item, i) => (
                        <li key={i} className="rounded-lg bg-white border border-green-100 p-3">
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

          </div>
        ) : null}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(primaryCategoryGroups).map(([primaryCategory, subCategories]) => {
          const groupMinScore = subCategories.length * MIN_MARK;
          const groupMaxScore = subCategories.length * MAX_MARK;
          const groupRecommendedScore = subCategories.reduce((sum, cat) => {
            const mark = getBarHeight(counts[cat]);
            const evaluation = evaluations[cat];
            const recommendedScore =
              counts[cat] > 0 && evaluation
                ? Math.min(MAX_MARK, Math.max(MIN_MARK, Math.round((mark + evaluation.compiledScore) / 2)))
                : mark;

            return sum + recommendedScore;
          }, 0);

          return (
          <div key={primaryCategory} className="h-fit rounded-xl border border-gray-200 bg-gray-50">
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
                const recommendedScore =
                  count > 0 && evaluation
                    ? Math.min(MAX_MARK, Math.max(MIN_MARK, Math.round((mark + evaluation.compiledScore) / 2)))
                    : mark;

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

        <p className="mt-4 text-base text-gray-600">
          AI Quality Score - category analysis based on bullet strength and impact.
          <br />
          Bullet Score - the total number of bullets per category.
          <br />
          Recommended Mark - the combination of AI Quality and Bullet Score
        </p>
      </div>
    </div>
  );
}