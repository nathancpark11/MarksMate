"use client";

// ======================================================
// IMPORTS
// ======================================================
import { useEffect, useRef, useState } from "react";
import GeneratorPanel from "../components/GeneratorPanel";
import HistoryPanel from "../components/HistoryPanel";
import TabBar from "../components/TabBar";
import DashboardPanel from "../components/DashboardPanel";
import ExportPanel from "../components/ExportPanel";
import MarksPackageBuilderPanel from "../components/MarksPackageBuilderPanel";
import SettingsPanel from "../components/SettingsPanel";
import LogPanel from "../components/LogPanel";
import TutorialModal from "../components/TutorialModal";
import {
  GENERATE_REQUEST_MAX_BYTES,
  getUtf8ByteLength,
  validateActionAndImpact,
} from "@/lib/generationValidation";

export default function Home() {
  type TutorialStep =
    | "log"
    | "generator"
    | "history"
    | "dashboard"
    | "export"
    | "marks-package"
    | "settings";

  // ======================================================
  // FORM INPUT STATE
  // ======================================================
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("");
  const [rankLevel, setRankLevel] = useState("E4");
  const [rating, setRating] = useState("BM - Boatswain's Mate");
  const [peopleAffected, setPeopleAffected] = useState("");
  const [percentImproved, setPercentImproved] = useState("");
  const [hoursSaved, setHoursSaved] = useState("");
  const [missionImpact, setMissionImpact] = useState("");

  // ======================================================
  // OUTPUT + HISTORY STATE
  // ======================================================
  type SplitBulletRecommendation = {
    shouldSplit: boolean;
    reason: string;
    splitActions: string[];
  };
  type SplitBulletDraft = {
    id: string;
    action: string;
    text: string;
    category: string;
    title?: string;
  };
  type AltCategorySuggestion = {
    categories: Array<{ name: string; reason: string }>;
    originalAction: string;
    primaryCategory: string;
    sourceTitle?: string;
  };
  const [bullet, setBullet] = useState<{text: string; category: string; title?: string} | null>(null);
  type HistoryItem = {
    text: string;
    date: string;
    category?: string;
    markingPeriod?: string;
    title?: string;
    originalAction?: string;
    sourceLogEntryId?: string;
    sourceLogEntryPreviousGroup?: string;
    sourceGroupedLogEntryIds?: string[];
    sourceGroupedLogEntryGroupName?: string;
  };
  type LogEntry = {
    id?: string;
    text: string;
    date: string;
    dates?: string[];
    group?: string;
    committed?: boolean;
  };
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [pendingLogPull, setPendingLogPull] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pulledLogDate, setPulledLogDate] = useState<string | null>(null);
  const [pulledLogIndex, setPulledLogIndex] = useState<number | null>(null);
  const [pulledLogEntryId, setPulledLogEntryId] = useState<string | null>(null);
  const [pulledGroupedEntryIndexes, setPulledGroupedEntryIndexes] = useState<number[]>([]);
  const [wasCategoryUserSelected, setWasCategoryUserSelected] = useState(false);
  const [splitBulletRecommendation, setSplitBulletRecommendation] = useState<SplitBulletRecommendation | null>(null);
  const [splitBulletRecommendationLoading, setSplitBulletRecommendationLoading] = useState(false);
  const [splitBulletDrafts, setSplitBulletDrafts] = useState<SplitBulletDraft[]>([]);
  const [splitBulletDraftsLoading, setSplitBulletDraftsLoading] = useState(false);
  const [splitBulletDraftRepromptingId, setSplitBulletDraftRepromptingId] = useState<string | null>(null);
  const [altCategorySuggestion, setAltCategorySuggestion] = useState<AltCategorySuggestion | null>(null);
  const [altCategoryDrafts, setAltCategoryDrafts] = useState<Record<string, { text: string; title?: string; generating: boolean }>>({});
  const [suggestions, setSuggestions] = useState<Record<string, { category: string; reason: string }>>({});

  const createLogEntryId = () =>
    `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const duplicateOfficialMarkMessage =
    "This action already has an official mark. If you'd like to edit it, go to the Official Marks tab and use Reprompt.";

  const normalizeComparableText = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^[-*•\s]+/, "")
      .replace(/[“”"']/g, "")
      .replace(/[.;:,!?]+$/, "")
      .replace(/\s+/g, " ");

  const findExistingOfficialMarkForAction = (actionText: string) => {
    if (editingIndex !== null) {
      return null;
    }

    const normalizedAction = normalizeComparableText(actionText);
    if (!normalizedAction) {
      return null;
    }

    const directMatch = history.find(
      (item) => normalizeComparableText(item.originalAction ?? "") === normalizedAction
    );
    if (directMatch) {
      return directMatch;
    }

    const matchingCommittedLogEntryIds = new Set(
      logEntries
        .filter(
          (entry) =>
            entry.committed && normalizeComparableText(entry.text) === normalizedAction
        )
        .map((entry) => entry.id)
        .filter((entryId): entryId is string => typeof entryId === "string" && entryId.trim().length > 0)
    );

    if (matchingCommittedLogEntryIds.size > 0) {
      const sourcedMatch = history.find(
        (item) =>
          typeof item.sourceLogEntryId === "string" &&
          matchingCommittedLogEntryIds.has(item.sourceLogEntryId)
      );
      if (sourcedMatch) {
        return sourcedMatch;
      }
    }

    return history.find((item) => normalizeComparableText(item.text) === normalizedAction) ?? null;
  };

  // ======================================================
  // MARKS PACKAGE BUILDER STATE
  // ======================================================
  const [mpMemberName, setMpMemberName] = useState("");
  const [mpUnitName, setMpUnitName] = useState("");
  const [mpPeriodStart, setMpPeriodStart] = useState("");
  const [mpPeriodEnd, setMpPeriodEnd] = useState("");

  // ======================================================
  // SETTINGS STATE
  // ======================================================
  const [userName, setUserName] = useState("");
  const [userUnit, setUserUnit] = useState("");
  const [bulletStyle, setBulletStyle] = useState("Standard");
  const [aiGeneratorEnabled, setAiGeneratorEnabled] = useState(true);
  const [aiLogImportEnabled, setAiLogImportEnabled] = useState(true);
  const [aiDashboardInsightsEnabled, setAiDashboardInsightsEnabled] = useState(true);
  const [aiMarksPackageEnabled, setAiMarksPackageEnabled] = useState(true);
  const [settingsMessage, setSettingsMessage] = useState("");

  // ======================================================
  // UI STATE
  // ======================================================
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("log");
  const [dashboardRecommendationCount, setDashboardRecommendationCount] = useState(0);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>("log");
  const [hasExited, setHasExited] = useState(false);

  // ======================================================
  // AUTH STATE
  // ======================================================
  type SessionUser = {
    id: string;
    username: string;
    needsTutorial?: boolean;
    lastLoginAt?: string | null;
  };
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [pendingUser, setPendingUser] = useState<SessionUser | null>(null);
  const [signupRankLevel, setSignupRankLevel] = useState("E4");
  const [signupRating, setSignupRating] = useState("BM - Boatswain's Mate");
  const [signupUserName, setSignupUserName] = useState("");
  const [signupUserUnit, setSignupUserUnit] = useState("");
  const [signupBulletStyle, setSignupBulletStyle] = useState("Standard");

  const formattedLastLogin = authUser?.lastLoginAt
    ? new Date(authUser.lastLoginAt).toLocaleString()
    : null;

  // ======================================================
  // AUTH SESSION
  // ======================================================
  // Block save effects until each data area has finished its initial load.
  const historyHydratedRef = useRef(false);
  const logHydratedRef = useRef(false);
  const settingsHydratedRef = useRef(false);
  const generateRequestInFlightRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      setAuthLoading(true);
      try {
        const res = await fetch("/api/auth/session", { method: "GET" });
        const data = (await res.json()) as {
          authenticated?: boolean;
          user?: SessionUser | null;
        };

        if (!cancelled) {
          setAuthUser(data.authenticated ? data.user ?? null : null);
        }
      } catch {
        if (!cancelled) {
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthSubmit = async () => {
    setAuthError("");

    const username = authUsername.trim();
    const password = authPassword;

    if (!username || !password) {
      setAuthError("Username and password are required.");
      return;
    }

    setAuthBusy(true);
    try {
      const res = await fetch(authMode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as {
        error?: string;
        user?: SessionUser;
      };

      if (!res.ok || !data.user) {
        setAuthError(data.error || "Authentication failed.");
        return;
      }

      if (authMode === "signup") {
        setPendingUser(data.user);
        setSignupStep(2);
      } else {
        setAuthUser(data.user);
        setShowNoticeModal(true);
      }
      setAuthPassword("");
    } catch {
      setAuthError("Authentication request failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignupProfileComplete = async () => {
    if (!pendingUser) return;
    try {
      await fetch("/api/user-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "settings",
          value: {
            rankLevel: signupRankLevel,
            rating: signupRating,
            userName: signupUserName,
            userUnit: signupUserUnit,
            bulletStyle: signupBulletStyle,
            aiGeneratorEnabled: true,
            aiLogImportEnabled: true,
            aiDashboardInsightsEnabled: true,
            aiMarksPackageEnabled: true,
          },
        }),
      });
    } catch {
      // Non-blocking; the reactive save effect will persist settings once logged in.
    }
    setRankLevel(signupRankLevel);
    setRating(signupRating);
    setUserName(signupUserName);
    setUserUnit(signupUserUnit);
    setBulletStyle(signupBulletStyle);
    setAiGeneratorEnabled(true);
    setAiLogImportEnabled(true);
    setAiDashboardInsightsEnabled(true);
    setAiMarksPackageEnabled(true);
    setAuthUser(pendingUser);
    setPendingUser(null);
    setSignupStep(1);
    setShowNoticeModal(true);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAuthUser(null);
      setAuthPassword("");
      setHistory([]);
      setLogEntries([]);
      setSuggestions({});
      setBullet(null);
      setEditingIndex(null);
      setPulledLogIndex(null);
      setPulledGroupedEntryIndexes([]);
      setInput("");
      setCategory("");
      setActiveTab("log");
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Permanently delete your account? All saved bullets and settings will be lost. This cannot be undone."
    );
    if (!confirmed) return;

    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        window.alert(data.error ?? "Failed to delete account.");
        return;
      }
    } catch {
      window.alert("Network error. Please try again.");
      return;
    }

    setAuthUser(null);
    setAuthPassword("");
    setHistory([]);
    setLogEntries([]);
    setSuggestions({});
    setBullet(null);
    setEditingIndex(null);
    setPulledLogIndex(null);
    setInput("");
    setCategory("");
    setActiveTab("log");
  };

  // ======================================================
  // LOAD HISTORY
  // ======================================================
  useEffect(() => {
    if (!authUser) {
      historyHydratedRef.current = false;
      setHistory([]);
      return;
    }

    historyHydratedRef.current = false;

    void (async () => {
      try {
        const res = await fetch("/api/user-data?key=history");
        const data = (await res.json()) as { value: unknown };
        if (data.value && Array.isArray(data.value) && data.value.length > 0) {
          setHistory(data.value as HistoryItem[]);
        } else {
          // One-time migration: upload localStorage data if server has none.
          const localRaw = localStorage.getItem(`bulletHistory:${authUser.id}`);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw) as unknown;
              let migrated: HistoryItem[] = [];
              if (Array.isArray(parsed) && parsed.length > 0) {
                migrated = typeof parsed[0] === "string"
                  ? (parsed as string[]).map((t) => ({ text: t, date: new Date().toISOString() }))
                  : (parsed as HistoryItem[]);
              }
              if (migrated.length > 0) {
                await fetch("/api/user-data", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: "history", value: migrated }),
                });
                localStorage.removeItem(`bulletHistory:${authUser.id}`);
              }
              setHistory(migrated);
            } catch {
              setHistory([]);
            }
          } else {
            setHistory([]);
          }
        }
      } catch {
        setHistory([]);
      } finally {
        historyHydratedRef.current = true;
      }
    })();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      logHydratedRef.current = false;
      setLogEntries([]);
      return;
    }

    logHydratedRef.current = false;

    void (async () => {
      const normalize = (arr: unknown[]): LogEntry[] =>
        (arr as Partial<LogEntry>[])
          .filter((e): e is Partial<LogEntry> => !!e && typeof e === "object")
          .map((e) => ({
            text: typeof e.text === "string" ? e.text : "",
            date: typeof e.date === "string" ? e.date : "",
            id: typeof e.id === "string" && e.id.trim().length > 0 ? e.id : createLogEntryId(),
            dates: Array.isArray(e.dates)
              ? e.dates.filter((d): d is string => typeof d === "string" && d.length > 0)
              : undefined,
            group: typeof e.group === "string" ? e.group : undefined,
            committed: typeof e.committed === "boolean" ? e.committed : undefined,
          }))
          .filter((e) => e.text.trim().length > 0);

      try {
        const res = await fetch("/api/user-data?key=log");
        const data = (await res.json()) as { value: unknown };
        if (data.value && Array.isArray(data.value)) {
          setLogEntries(normalize(data.value));
        } else {
          // One-time migration from localStorage.
          const localRaw = localStorage.getItem(`dailyLog:${authUser.id}`);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw) as unknown;
              const migrated = Array.isArray(parsed) ? normalize(parsed) : [];
              if (migrated.length > 0) {
                await fetch("/api/user-data", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: "log", value: migrated }),
                });
                localStorage.removeItem(`dailyLog:${authUser.id}`);
              }
              setLogEntries(migrated);
            } catch {
              setLogEntries([]);
            }
          } else {
            setLogEntries([]);
          }
        }
      } catch {
        setLogEntries([]);
      } finally {
        logHydratedRef.current = true;
      }
    })();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      settingsHydratedRef.current = false;
      return;
    }

    settingsHydratedRef.current = false;
    setRankLevel("E4");
    setRating("BM - Boatswain's Mate");
    setUserName("");
    setUserUnit("");
    setBulletStyle("Standard");
    setMpMemberName("");
    setMpUnitName("");
    setMpPeriodStart("");
    setMpPeriodEnd("");
    setAiGeneratorEnabled(true);
    setAiLogImportEnabled(true);
    setAiDashboardInsightsEnabled(true);
    setAiMarksPackageEnabled(true);
    setSettingsMessage("");

    void (async () => {
      type SettingsShape = {
        rankLevel?: string;
        rating?: string;
        userName?: string;
        userUnit?: string;
        bulletStyle?: string;
        aiGeneratorEnabled?: boolean;
        aiLogImportEnabled?: boolean;
        aiDashboardInsightsEnabled?: boolean;
        aiMarksPackageEnabled?: boolean;
      };
      try {
        const res = await fetch("/api/user-data?key=settings");
        const data = (await res.json()) as { value: SettingsShape | null };
        let loaded = data.value;

        if (!loaded) {
          // One-time migration from localStorage.
          const localRaw = localStorage.getItem(`appSettings:${authUser.id}`);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw) as SettingsShape;
              if (parsed && typeof parsed === "object") {
                loaded = parsed;
                await fetch("/api/user-data", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: "settings", value: loaded }),
                });
                localStorage.removeItem(`appSettings:${authUser.id}`);
              }
            } catch {
              // ignore
            }
          }
        }

        if (loaded) {
          if (loaded.rankLevel) setRankLevel(loaded.rankLevel);
          if (loaded.rating) setRating(loaded.rating);
          if (loaded.userName) setUserName(loaded.userName);
          if (loaded.userUnit) setUserUnit(loaded.userUnit);
          if (loaded.bulletStyle) {
            const mappedStyle =
              loaded.bulletStyle === "Balanced"
                ? "Standard"
                : loaded.bulletStyle === "Concise"
                  ? "Short/Concise"
                  : loaded.bulletStyle === "Impact-Forward"
                    ? "Detailed"
                    : loaded.bulletStyle;
            setBulletStyle(mappedStyle);
          }
          if (typeof loaded.aiGeneratorEnabled === "boolean") {
            setAiGeneratorEnabled(loaded.aiGeneratorEnabled);
          }
          if (typeof loaded.aiLogImportEnabled === "boolean") {
            setAiLogImportEnabled(loaded.aiLogImportEnabled);
          }
          if (typeof loaded.aiDashboardInsightsEnabled === "boolean") {
            setAiDashboardInsightsEnabled(loaded.aiDashboardInsightsEnabled);
          }
          if (typeof loaded.aiMarksPackageEnabled === "boolean") {
            setAiMarksPackageEnabled(loaded.aiMarksPackageEnabled);
          }
        }
      } catch {
        // Keep the defaults set above.
      } finally {
        settingsHydratedRef.current = true;
      }
    })();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    if (!settingsHydratedRef.current) {
      return;
    }
    void fetch("/api/user-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "settings",
        value: {
          rankLevel,
          rating,
          userName,
          userUnit,
          bulletStyle,
          aiGeneratorEnabled,
          aiLogImportEnabled,
          aiDashboardInsightsEnabled,
          aiMarksPackageEnabled,
        },
      }),
    });
  }, [
    rankLevel,
    rating,
    userName,
    userUnit,
    bulletStyle,
    aiGeneratorEnabled,
    aiLogImportEnabled,
    aiDashboardInsightsEnabled,
    aiMarksPackageEnabled,
    authUser,
  ]);

  useEffect(() => {
    if (!mpMemberName && userName) {
      setMpMemberName(userName);
    }
  }, [userName, mpMemberName]);

  useEffect(() => {
    if (!mpUnitName && userUnit) {
      setMpUnitName(userUnit);
    }
  }, [userUnit, mpUnitName]);

  useEffect(() => {
    if (!showTutorialModal) {
      return;
    }

    if (
      activeTab === "log" ||
      activeTab === "generator" ||
      activeTab === "history" ||
      activeTab === "dashboard" ||
      activeTab === "export" ||
      activeTab === "marks-package" ||
      activeTab === "settings"
    ) {
      setTutorialStep(activeTab as TutorialStep);
    }
  }, [activeTab, showTutorialModal]);

  const handleAgreeNotice = () => {
    setShowNoticeModal(false);

    if (authUser?.needsTutorial) {
      setActiveTab("log");
      setTutorialStep("log");
      setShowTutorialModal(true);
    }
  };

  const handleSelectTutorialStep = (step: TutorialStep) => {
    setTutorialStep(step);

    if (step === "settings") {
      window.requestAnimationFrame(() => {
        document
          .getElementById("settings-tutorial-anchor")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    setActiveTab(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCloseTutorial = async () => {
    setShowTutorialModal(false);

    if (!authUser?.needsTutorial) {
      return;
    }

    try {
      await fetch("/api/auth/complete-tutorial", { method: "POST" });
    } catch {
      // Keep the local session usable even if the completion request fails.
    }

    setAuthUser((currentUser) =>
      currentUser ? { ...currentUser, needsTutorial: false } : currentUser
    );
  };

  const handleExitNotice = () => {
    setHasExited(true);
    try {
      window.location.replace("about:blank");
    } catch {
      // Fallback UI is shown by hasExited if browser blocks navigation.
    }
  };

  // ======================================================
  // SAVE HISTORY
  // ======================================================
  useEffect(() => {
    if (!authUser) {
      return;
    }

    if (!historyHydratedRef.current) {
      return;
    }
    void fetch("/api/user-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "history", value: history }),
    });
  }, [history, authUser]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    if (!logHydratedRef.current) {
      return;
    }
    void fetch("/api/user-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "log", value: logEntries }),
    });
  }, [logEntries, authUser]);

  // ======================================================
  // GENERATE BULLET
  // ======================================================
  const resolveCategoryForText = async (text: string, preferredCategory?: string) => {
    if (preferredCategory) {
      return preferredCategory;
    }

    if (!aiGeneratorEnabled) {
      return "Military Bearing";
    }

    try {
      const res = await fetch("/api/suggest-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok && data.category) {
        return data.category as string;
      }
    } catch {
      // Fall through to default category.
    }

    return "Military Bearing";
  };

  const summarizeTitleForText = async (text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return "";
    }

    if (!aiGeneratorEnabled) {
      return "";
    }

    try {
      const res = await fetch("/api/summarize-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: normalizedText }),
      });
      const data = (await res.json()) as { summary?: string };
      if (res.ok && typeof data.summary === "string") {
        return data.summary.trim();
      }
    } catch {
      // Fall back to an empty title when summary generation fails.
    }

    return "";
  };

  const generateBulletDraft = async (accomplishment: string, preferredCategory?: string) => {
    if (!aiGeneratorEnabled) {
      throw new Error("Generator AI is disabled in Settings.");
    }

    const finalCategory = await resolveCategoryForText(accomplishment, preferredCategory);

    const payload = {
      accomplishment,
      category: finalCategory,
      rankLevel,
      rating,
      bulletStyle,
      peopleAffected,
      percentImproved,
      hoursSaved,
      missionImpact,
      generationIntent: "final-polished-official-mark",
    };

    const payloadBytes = getUtf8ByteLength(JSON.stringify(payload));
    if (payloadBytes > GENERATE_REQUEST_MAX_BYTES) {
      throw new Error(
        `Request is too large (${payloadBytes} bytes). Reduce Action/Impact text and keep request size under ${GENERATE_REQUEST_MAX_BYTES} bytes.`
      );
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to generate bullet.");
    }

    return {
      text: data.bullet as string,
      category: finalCategory,
      title: typeof data.title === "string" ? data.title : "",
    };
  };

  const handleGenerate = async () => {
    if (generateRequestInFlightRef.current || loading) {
      return;
    }

    if (!aiGeneratorEnabled) {
      setError("Generator AI is disabled in Settings.");
      return;
    }

    const trimmedInput = input.trim();

    const validationError = validateActionAndImpact(trimmedInput, missionImpact);
    if (validationError) {
      setError(validationError);
      setBullet(null);
      setSplitBulletRecommendation(null);
      setSplitBulletDrafts([]);
      return;
    }

    const existingOfficialMark = findExistingOfficialMarkForAction(trimmedInput);
    if (existingOfficialMark) {
      setError(duplicateOfficialMarkMessage);
      setBullet(null);
      setSplitBulletRecommendation(null);
      setSplitBulletRecommendationLoading(false);
      setSplitBulletDrafts([]);
      setSplitBulletDraftsLoading(false);
      return;
    }

    setError("");
    setSplitBulletRecommendation(null);
    setSplitBulletRecommendationLoading(false);
    setSplitBulletDrafts([]);
    setSplitBulletDraftsLoading(false);
    generateRequestInFlightRef.current = true;
    setLoading(true);

    const wasUserSelected = !!category;

    try {
      const generatedDraft = await generateBulletDraft(trimmedInput, category || undefined);

      setBullet({ text: generatedDraft.text, category: generatedDraft.category, title: generatedDraft.title });
      setWasCategoryUserSelected(wasUserSelected);

      setSplitBulletRecommendationLoading(true);
      try {
        if (!aiGeneratorEnabled) {
          setSplitBulletRecommendation(null);
        } else {
          const recommendationRes = await fetch("/api/recommend-bullet-split", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              accomplishment: trimmedInput,
              bullet: generatedDraft.text,
            }),
          });

          const recommendationData = await recommendationRes.json();
          if (recommendationRes.ok && recommendationData.recommendation) {
            setSplitBulletRecommendation(recommendationData.recommendation);
          } else {
            setSplitBulletRecommendation(null);
          }
        }
      } catch {
        setSplitBulletRecommendation(null);
      } finally {
        setSplitBulletRecommendationLoading(false);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Network error.");
      setBullet(null);
      setSplitBulletRecommendation(null);
      setSplitBulletRecommendationLoading(false);
      setSplitBulletDrafts([]);
      setSplitBulletDraftsLoading(false);
    } finally {
      setLoading(false);
      generateRequestInFlightRef.current = false;
    }
  };

  const handleGenerateMarkAsIs = async () => {
    if (generateRequestInFlightRef.current || loading) {
      return;
    }

    const trimmedInput = input.trim();

    const validationError = validateActionAndImpact(trimmedInput, missionImpact);
    if (validationError) {
      setError(validationError);
      setBullet(null);
      setSplitBulletRecommendation(null);
      setSplitBulletDrafts([]);
      return;
    }

    const existingOfficialMark = findExistingOfficialMarkForAction(trimmedInput);
    if (existingOfficialMark) {
      setError(duplicateOfficialMarkMessage);
      setBullet(null);
      setSplitBulletRecommendation(null);
      setSplitBulletRecommendationLoading(false);
      setSplitBulletDrafts([]);
      setSplitBulletDraftsLoading(false);
      return;
    }

    setError("");
    setSplitBulletRecommendation(null);
    setSplitBulletRecommendationLoading(false);
    setSplitBulletDrafts([]);
    setSplitBulletDraftsLoading(false);
    generateRequestInFlightRef.current = true;
    setLoading(true);

    try {
      const normalizedText = trimmedInput.replace(/^[-*•\s]+/, "").replace(/\s+/g, " ").trim();
      const [resolvedCategory, title] = await Promise.all([
        resolveCategoryForText(trimmedInput, category || undefined),
        summarizeTitleForText(normalizedText),
      ]);

      setBullet({
        text: normalizedText ? `- ${normalizedText}` : "",
        category: resolvedCategory,
        title,
      });
      setWasCategoryUserSelected(!!category);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Network error.");
      setBullet(null);
    } finally {
      setLoading(false);
      generateRequestInFlightRef.current = false;
    }
  };

  const handleApplySplitRecommendation = async () => {
    if (!splitBulletRecommendation?.shouldSplit || splitBulletRecommendation.splitActions.length === 0) {
      return;
    }

    if (!aiGeneratorEnabled) {
      setError("Generator AI is disabled in Settings.");
      return;
    }

    setError("");
    setSplitBulletDrafts([]);
    setSplitBulletDraftsLoading(true);
    setBullet(null);

    try {
      const drafts = await Promise.all(
        splitBulletRecommendation.splitActions.map(async (action, index) => {
          const generatedDraft = await generateBulletDraft(action, category || undefined);
          return {
            id: `split-draft-${index}`,
            action,
            text: generatedDraft.text,
            category: generatedDraft.category,
            title: generatedDraft.title,
          };
        })
      );

      setSplitBulletDrafts(drafts);
      setInput("");
      setCategory("");
      setPeopleAffected("");
      setPercentImproved("");
      setHoursSaved("");
      setMissionImpact("");
      setSplitBulletRecommendation(null);
      setSplitBulletRecommendationLoading(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to generate split bullet drafts.");
      setSplitBulletDrafts([]);
    } finally {
      setSplitBulletDraftsLoading(false);
    }
  };

  const handleClearSplitBulletDrafts = () => {
    setSplitBulletDrafts([]);
    setSplitBulletDraftsLoading(false);
    setSplitBulletDraftRepromptingId(null);
  };

  const handleRepromptSplitBulletDraft = async (draftId: string) => {
    if (!aiGeneratorEnabled) {
      setError("Generator AI is disabled in Settings.");
      return;
    }

    const targetDraft = splitBulletDrafts.find((draft) => draft.id === draftId);
    if (!targetDraft) {
      return;
    }

    setError("");
    setSplitBulletDraftRepromptingId(draftId);

    try {
      const regeneratedDraft = await generateBulletDraft(targetDraft.action, targetDraft.category);

      setSplitBulletDrafts((prevDrafts) =>
        prevDrafts.map((draft) =>
          draft.id === draftId
            ? { ...draft, text: regeneratedDraft.text, category: regeneratedDraft.category, title: regeneratedDraft.title }
            : draft
        )
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to reprompt this split draft.");
    } finally {
      setSplitBulletDraftRepromptingId(null);
    }
  };

  const triggerAltCategoryAnalysis = (
    bulletText: string,
    action: string,
    primaryCategory: string,
    sourceTitle?: string
  ) => {
    if (!aiGeneratorEnabled) {
      setAltCategorySuggestion(null);
      setAltCategoryDrafts({});
      return;
    }

    setAltCategorySuggestion(null);
    setAltCategoryDrafts({});
    void (async () => {
      try {
        const res = await fetch("/api/suggest-secondary-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bullet: bulletText, action, primaryCategory }),
        });
        const data = (await res.json()) as {
          hasAlternatives?: boolean;
          categories?: Array<{ name: string; reason: string }>;
        };
        if (res.ok && data.hasAlternatives && Array.isArray(data.categories) && data.categories.length > 0) {
          setAltCategorySuggestion({
            categories: data.categories,
            originalAction: action,
            primaryCategory,
            sourceTitle,
          });
        }
      } catch {
        // Fail silently; commit already succeeded.
      }
    })();
  };

  const handleGenerateAltCategoryDraft = async (categoryName: string) => {
    if (!aiGeneratorEnabled) return;
    if (!altCategorySuggestion) return;
    setAltCategoryDrafts((prev) => ({ ...prev, [categoryName]: { text: "", title: "", generating: true } }));
    try {
      const draft = await generateBulletDraft(altCategorySuggestion.originalAction, categoryName);
      const title = altCategorySuggestion.sourceTitle?.trim() || draft.title;
      setAltCategoryDrafts((prev) => ({
        ...prev,
        [categoryName]: { text: draft.text, title, generating: false },
      }));
    } catch {
      setAltCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[categoryName];
        return next;
      });
    }
  };

  const handleCommitAltCategoryDraft = (categoryName: string) => {
    if (!altCategorySuggestion) return;

    const draftEntry = altCategoryDrafts[categoryName];
    if (!draftEntry?.text) return;

    const originalAction = altCategorySuggestion.originalAction.trim();

    setHistory((prev) => {
      if (prev.some((h) => h.text === draftEntry.text)) return prev;
      return [
        {
          text: draftEntry.text,
          date: new Date().toISOString(),
          category: categoryName,
          markingPeriod: computeMarkingPeriod(new Date().toISOString(), rankLevel),
          title: draftEntry.title,
          originalAction,
        },
        ...prev,
      ];
    });
    setAltCategorySuggestion(null);
    setAltCategoryDrafts({});
  };

  const handleCommitSplitBulletDrafts = (draftIds: string[]) => {
    if (draftIds.length === 0) {
      return;
    }

    const selectedDrafts = splitBulletDrafts.filter((draft) => draftIds.includes(draft.id));
    if (selectedDrafts.length === 0) {
      return;
    }

    const splitItemDate = pulledLogDate !== null ? pulledLogDate : new Date().toISOString();
    const sourceLogEntry = pulledLogIndex != null ? logEntries[pulledLogIndex] : undefined;
    const sourceLogEntryId = pulledLogEntryId ?? sourceLogEntry?.id;
    const sourceLogEntryPreviousGroup = sourceLogEntry?.group;
    const splitGroupedEntries = pulledGroupedEntryIndexes
      .map((i) => logEntries[i])
      .filter((e): e is LogEntry => e !== undefined);
    const sourceGroupedLogEntryIds = splitGroupedEntries
      .map((e) => e.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const sourceGroupedLogEntryGroupName = splitGroupedEntries[0]?.group?.trim() || undefined;

    setHistory((prevHistory) => {
      const existingTexts = new Set(prevHistory.map((item) => item.text));
      const newItems = selectedDrafts
        .filter((draft) => !existingTexts.has(draft.text))
        .map((draft) => ({
          text: draft.text,
          date: splitItemDate,
          category: draft.category,
          markingPeriod: splitItemDate ? computeMarkingPeriod(splitItemDate, rankLevel) : "",
          title: draft.title,
          originalAction: draft.action.trim(),
          sourceLogEntryId,
          sourceLogEntryPreviousGroup,
          ...(sourceGroupedLogEntryIds.length > 0 && {
            sourceGroupedLogEntryIds,
            sourceGroupedLogEntryGroupName,
          }),
        }));

      return [...newItems, ...prevHistory];
    });

    setLogEntries((prevEntries) => {
      if (pulledLogIndex != null) {
        return prevEntries.map((entry, entryIndex) =>
          entryIndex === pulledLogIndex
            ? { ...entry, committed: true, group: undefined }
            : entry
        );
      }
      if (pulledGroupedEntryIndexes.length > 0) {
        const groupedIndexSet = new Set(pulledGroupedEntryIndexes);
        return prevEntries.map((entry, entryIndex) =>
          groupedIndexSet.has(entryIndex)
            ? { ...entry, committed: true, group: undefined }
            : entry
        );
      }
      return prevEntries;
    });
    setPulledLogDate(null);
    setPulledLogIndex(null);
    setPulledLogEntryId(null);
    setPulledGroupedEntryIndexes([]);
    setEditingIndex(null);
    setWasCategoryUserSelected(false);
    setInput("");
    setSplitBulletDrafts([]);
    setSplitBulletDraftsLoading(false);
    setSplitBulletDraftRepromptingId(null);
    setActiveTab("history");
    const firstDraft = selectedDrafts[0];
    if (firstDraft) {
      triggerAltCategoryAnalysis(firstDraft.text, firstDraft.action, firstDraft.category, firstDraft.title);
    }
  };

  const computeMarkingPeriod = (dateStr: string, rank: string): string => {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const eerMonthMap: Record<string, number> = { E1:0, E2:0, E3:1, E4:2, E5:3, E6:4, E7:8 };
    const eerMonth = eerMonthMap[rank] ?? 2;
    const isSemiAnnual = ['E1','E2','E3','E4','E5'].includes(rank);
    if (isSemiAnnual) {
      const startA = (eerMonth + 7) % 12;
      const endA = eerMonth;
      const startB = (eerMonth + 1) % 12;
      const endB = (eerMonth + 6) % 12;
      if (month >= startB && month <= endB) {
        return `${monthNames[startB]} ${year} – ${monthNames[endB]} ${year}`;
      } else if (month >= startA) {
        return `${monthNames[startA]} ${year} – ${monthNames[endA]} ${year + 1}`;
      } else {
        return `${monthNames[startA]} ${year - 1} – ${monthNames[endA]} ${year}`;
      }
    } else {
      const startMonth = (eerMonth + 1) % 12;
      if (month >= startMonth) {
        return `${monthNames[startMonth]} ${year} – ${monthNames[eerMonth]} ${year + 1}`;
      } else {
        return `${monthNames[startMonth]} ${year - 1} – ${monthNames[eerMonth]} ${year}`;
      }
    }
  };

  // ======================================================
  // COMMIT BULLET TO HISTORY
  // ======================================================
  const handleCommitBullet = () => {
    if (!bullet) return;

    const trimmedInput = input.trim();

    setHistory((prevHistory) => {
      // If we're editing an existing history item, update it in-place but keep original date
      if (editingIndex !== null && editingIndex >= 0 && editingIndex < prevHistory.length) {
        // prevent collision with other items
        if (prevHistory.some((h, i) => h.text === bullet.text && i !== editingIndex)) {
          return prevHistory;
        }

        return prevHistory.map((h, i) =>
          i === editingIndex ? { ...h, text: bullet.text, category: bullet.category, title: bullet.title } : h
        );
      }

      // Otherwise add new item if not duplicate
      if (prevHistory.some((h) => h.text === bullet.text)) {
        return prevHistory;
      }

      const itemDate = pulledLogDate !== null ? pulledLogDate : new Date().toISOString();
      const sourceLogEntry = pulledLogIndex != null ? logEntries[pulledLogIndex] : undefined;
      const sourceLogEntryId = pulledLogEntryId ?? sourceLogEntry?.id;
      const sourceLogEntryPreviousGroup = sourceLogEntry?.group;
      const groupedEntries = pulledGroupedEntryIndexes
        .map((i) => logEntries[i])
        .filter((e): e is LogEntry => e !== undefined);
      const sourceGroupedLogEntryIds = groupedEntries
        .map((e) => e.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      const sourceGroupedLogEntryGroupName = groupedEntries[0]?.group?.trim() || undefined;
      const newItem: HistoryItem = {
        text: bullet.text,
        date: itemDate,
        category: bullet.category,
        markingPeriod: itemDate ? computeMarkingPeriod(itemDate, rankLevel) : "",
        title: bullet.title,
        originalAction: trimmedInput,
        sourceLogEntryId,
        sourceLogEntryPreviousGroup,
        ...(sourceGroupedLogEntryIds.length > 0 && {
          sourceGroupedLogEntryIds,
          sourceGroupedLogEntryGroupName,
        }),
      };
      return [newItem, ...prevHistory];
    });

    setLogEntries((prevEntries) => {
      if (pulledLogIndex != null) {
        return prevEntries.map((entry, entryIndex) =>
          entryIndex === pulledLogIndex
            ? { ...entry, committed: true, group: undefined }
            : entry
        );
      }
      if (pulledGroupedEntryIndexes.length > 0) {
        const groupedIndexSet = new Set(pulledGroupedEntryIndexes);
        return prevEntries.map((entry, entryIndex) =>
          groupedIndexSet.has(entryIndex)
            ? { ...entry, committed: true, group: undefined }
            : entry
        );
      }
      return prevEntries;
    });
    setPulledLogDate(null);
    setPulledLogIndex(null);
    setPulledLogEntryId(null);
    setPulledGroupedEntryIndexes([]);
    setEditingIndex(null);
    setWasCategoryUserSelected(false);
    setInput("");

    setActiveTab("history");
    triggerAltCategoryAnalysis(bullet.text, input.trim(), bullet.category, bullet.title);
  };

  // ======================================================
  // COPY HISTORY ITEM
  // ======================================================
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  // ======================================================
  // REPROMPT FROM HISTORY
  // Pulls a history item back into the generator input
  // ======================================================
  const handleReprompt = (index: number) => {
    const item = history[index];
    if (!item) return;
    setInput(item.text);
    setCategory(""); // Reset category for reprompt
    setSuggestions(prev => { const newS = {...prev}; delete newS[item.text]; return newS; }); // Clear suggestion
    setEditingIndex(index);
    setActiveTab("generator");
  };

  // ======================================================
  // DELETE HISTORY ITEM
  // ======================================================
  const handleDelete = (index: number) => {
    const removedItem = history[index];
    if (!removedItem) {
      return;
    }

    const nextHistory = history.filter((_, i) => i !== index);
    setHistory(nextHistory);

    const sourceLogEntryId = removedItem.sourceLogEntryId;
    if (sourceLogEntryId) {
      const sourceLogEntryPreviousGroup = removedItem.sourceLogEntryPreviousGroup;
      const hasOtherMarksFromSameLogEntry = nextHistory.some(
        (item) => item.sourceLogEntryId === sourceLogEntryId
      );
      if (!hasOtherMarksFromSameLogEntry) {
        setLogEntries((prevEntries) =>
          prevEntries.map((entry) =>
            entry.id === sourceLogEntryId
              ? {
                  ...entry,
                  committed: false,
                  group: sourceLogEntryPreviousGroup?.trim() ? sourceLogEntryPreviousGroup : undefined,
                }
              : entry
          )
        );
      }
    }

    const sourceGroupedLogEntryIds = removedItem.sourceGroupedLogEntryIds;
    if (sourceGroupedLogEntryIds && sourceGroupedLogEntryIds.length > 0) {
      const sourceGroupedLogEntryGroupName = removedItem.sourceGroupedLogEntryGroupName;
      setLogEntries((prevEntries) =>
        prevEntries.map((entry) => {
          if (!entry.id || !sourceGroupedLogEntryIds.includes(entry.id)) return entry;
          const stillReferenced = nextHistory.some(
            (item) => item.sourceGroupedLogEntryIds?.includes(entry.id!)
          );
          if (stillReferenced) return entry;
          return {
            ...entry,
            committed: false,
            group: sourceGroupedLogEntryGroupName?.trim() ? sourceGroupedLogEntryGroupName : undefined,
          };
        })
      );
    }
  };

  const handleUpdateMark = (index: number, nextText: string, nextCategory?: string) => {
    const trimmedText = nextText.trim();
    if (!trimmedText) {
      return;
    }

    const currentItem = history[index];
    const previousText = currentItem?.text;

    setHistory((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const trimmedCategory = nextCategory?.trim();
        return {
          ...item,
          text: trimmedText,
          category: trimmedCategory ? trimmedCategory : item.category,
        };
      })
    );

    if (previousText && previousText !== trimmedText) {
      setSuggestions((prev) => {
        const existing = prev[previousText];
        if (!existing) {
          return prev;
        }

        const next = { ...prev };
        delete next[previousText];
        next[trimmedText] = existing;
        return next;
      });
    }
  };

  const handleSaveLogEntry = (entry: { text: string; group?: string }) => {
    const newEntry: LogEntry = {
      id: createLogEntryId(),
      text: entry.text,
      group: entry.group,
      date: new Date().toISOString(),
    };

    setLogEntries((prev) => [newEntry, ...prev]);
  };

  const handleSaveImportedLogEntries = (
    entriesToSave: Array<{ text: string; dates: string[]; group?: string }>
  ) => {
    const normalizedEntries = entriesToSave
      .map((entry) => ({
        id: createLogEntryId(),
        text: entry.text.trim(),
        group: entry.group?.trim() || undefined,
        date: entry.dates[0] || "",
        dates: entry.dates,
      }))
      .filter((entry) => entry.text.length > 0);

    if (normalizedEntries.length === 0) {
      return;
    }

    setLogEntries((prev) => [...normalizedEntries, ...prev]);
  };

  const handleDeleteLogEntry = (index: number) => {
    setLogEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAssignLogGroup = (entryIndexes: number[], groupName: string) => {
    const normalizedGroup = groupName.trim();
    const entryIndexSet = new Set(entryIndexes);

    setLogEntries((prev) =>
      prev.map((entry, index) => {
        if (!entryIndexSet.has(index)) {
          return entry;
        }

        return {
          ...entry,
          group: normalizedGroup.length > 0 ? normalizedGroup : undefined,
        };
      })
    );
  };

  const handleClearLogEntries = () => {
    const confirmed = window.confirm("Clear all Daily Log entries? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setLogEntries([]);
  };

  const handleExportBackup = () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      history,
      settings: {
        rankLevel,
        rating,
        userName,
        userUnit,
        bulletStyle,
        aiGeneratorEnabled,
        aiLogImportEnabled,
        aiDashboardInsightsEnabled,
        aiMarksPackageEnabled,
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSettingsMessage("Backup exported.");
  };

  const handleImportBackup = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as {
        history?: HistoryItem[] | string[];
        settings?: {
          rankLevel?: string;
          rating?: string;
          userName?: string;
          userUnit?: string;
          bulletStyle?: string;
          aiGeneratorEnabled?: boolean;
          aiLogImportEnabled?: boolean;
          aiDashboardInsightsEnabled?: boolean;
          aiMarksPackageEnabled?: boolean;
        };
      };

      if (Array.isArray(parsed.history)) {
        if (parsed.history.length > 0 && typeof parsed.history[0] === "string") {
          setHistory((parsed.history as string[]).map((t) => ({ text: t, date: new Date().toISOString() })));
        } else {
          setHistory(parsed.history as HistoryItem[]);
        }
      }

      if (parsed.settings) {
        if (parsed.settings.rankLevel) setRankLevel(parsed.settings.rankLevel);
        if (parsed.settings.rating) setRating(parsed.settings.rating);
        if (parsed.settings.userName !== undefined) setUserName(parsed.settings.userName);
        if (parsed.settings.userUnit !== undefined) setUserUnit(parsed.settings.userUnit);
        if (parsed.settings.bulletStyle) setBulletStyle(parsed.settings.bulletStyle);
        if (typeof parsed.settings.aiGeneratorEnabled === "boolean") setAiGeneratorEnabled(parsed.settings.aiGeneratorEnabled);
        if (typeof parsed.settings.aiLogImportEnabled === "boolean") setAiLogImportEnabled(parsed.settings.aiLogImportEnabled);
        if (typeof parsed.settings.aiDashboardInsightsEnabled === "boolean") setAiDashboardInsightsEnabled(parsed.settings.aiDashboardInsightsEnabled);
        if (typeof parsed.settings.aiMarksPackageEnabled === "boolean") setAiMarksPackageEnabled(parsed.settings.aiMarksPackageEnabled);
      }

      setSettingsMessage("Backup imported.");
      setActiveTab("settings");
    } catch {
      setSettingsMessage("Import failed. Please choose a valid backup JSON file.");
    }
  };

  const handleClearAllBullets = () => {
    const confirmed = window.confirm("Clear all saved bullets from history? This cannot be undone.");
    if (!confirmed) return;
    setHistory([]);
    setSuggestions({});
    setBullet(null);
    setEditingIndex(null);
    setSettingsMessage("All bullets cleared.");
  };

  const handlePullLogEntryToGenerator = (index: number) => {
    setPendingLogPull(index);
    setActiveTab("generator");
  };

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-md">
          <p className="text-base font-semibold text-gray-800">Loading account...</p>
        </div>
      </main>
    );
  }

  if (!authUser && pendingUser && signupStep === 2) {
    const RATINGS = [
      "AET - Aviation Electrical Technician",
      "AMT - Aviation Maintenance Technician",
      "AST - Aviation Survival Technician",
      "BM - Boatswain's Mate",
      "DC - Damage Controlman",
      "EM - Electrician's Mate",
      "ET - Electronics Technician",
      "GM - Gunner's Mate",
      "HS - Health Services Technician",
      "IS - Intelligence Specialist",
      "IT - Information Systems Technician",
      "MA - Maritime Enforcement Specialist",
      "MK - Machinery Technician",
      "MST - Marine Science Technician",
      "MU - Musician",
      "OS - Operations Specialist",
      "PA - Public Affairs Specialist",
      "PS - Personnel Specialist",
      "SK - Storekeeper",
      "YN - Yeoman",
    ];

    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Set Up Your Profile</h1>
          <p className="mt-2 text-sm text-slate-600">
            These defaults are used across the bullet generator and marks package workflows. You can change them any time in Settings.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Rank</label>
              <select
                value={signupRankLevel}
                onChange={(e) => setSignupRankLevel(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
              >
                {["E2","E3","E4","E5","E6","E7"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Rate</label>
              <select
                value={signupRating}
                onChange={(e) => setSignupRating(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
              >
                {RATINGS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Name <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={signupUserName}
                onChange={(e) => setSignupUserName(e.target.value)}
                placeholder="Last, First, MI"
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Unit/Command <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={signupUserUnit}
                onChange={(e) => setSignupUserUnit(e.target.value)}
                placeholder="e.g. Sector Boston"
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Default Bullet Style</label>
              <select
                value={signupBulletStyle}
                onChange={(e) => setSignupBulletStyle(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
              >
                <option>Short/Concise</option>
                <option>Standard</option>
                <option>Detailed</option>
              </select>
            </div>
          </div>

          <button
                onClick={() => void handleSignupProfileComplete()}
            className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Bullet Proof</h1>
          <p className="mt-2 text-sm text-slate-600">
            {authMode === "login"
              ? "Log in to access your AI marking assistant."
              : "Create an account to access your AI marking assistant."}
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Username</label>
              <input
                type="text"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleAuthSubmit();
                  }
                }}
              />
            </div>

            {authError && <p className="text-sm text-red-600">{authError}</p>}

            <button
              onClick={() => void handleAuthSubmit()}
              disabled={authBusy}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authBusy ? "Please wait..." : authMode === "login" ? "Log In" : "Create Account"}
            </button>

            <button
              onClick={() => {
                setAuthError("");
                setSignupStep(1);
                setPendingUser(null);
                setAuthMode(authMode === "login" ? "signup" : "login");
              }}
              className="w-full text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              {authMode === "login"
                ? "Need an account? Sign up"
                : "Already have an account? Log in"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (hasExited) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-md">
          <p className="text-base font-semibold text-gray-800">Application exited.</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-100 flex h-(--unclassified-bar-height) items-center justify-center bg-green-700 text-center text-xs font-bold uppercase tracking-widest text-black shadow-md">
        UNCLASSIFIED
      </div>
    <main className="min-h-screen flex justify-center p-3 pt-[calc(var(--unclassified-bar-height)+0.5rem)] sm:p-6 sm:pt-12">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-700">
            Signed in as <span className="font-bold text-slate-900">{authUser.username}</span>
          </p>
          <div className="flex items-center gap-3">
            {formattedLastLogin ? (
              <span className="text-xs font-normal text-slate-500">
                Last login: {formattedLastLogin}
              </span>
            ) : null}
            <button
              onClick={() => void handleLogout()}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Log Out
            </button>
          </div>
        </div>

        <TabBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          dashboardRecommendationCount={dashboardRecommendationCount}
        />

        {activeTab === "generator" && (
          <GeneratorPanel
            input={input}
            setInput={setInput}
            category={category}
            setCategory={setCategory}
            peopleAffected={peopleAffected}
            setPeopleAffected={setPeopleAffected}
            percentImproved={percentImproved}
            setPercentImproved={setPercentImproved}
            hoursSaved={hoursSaved}
            setHoursSaved={setHoursSaved}
            missionImpact={missionImpact}
            setMissionImpact={setMissionImpact}
            logEntries={logEntries}
            error={error}
            loading={loading}
            bullet={bullet}
            splitBulletRecommendation={splitBulletRecommendation}
            splitBulletRecommendationLoading={splitBulletRecommendationLoading}
            splitBulletDrafts={splitBulletDrafts}
            splitBulletDraftsLoading={splitBulletDraftsLoading}
            splitBulletDraftRepromptingId={splitBulletDraftRepromptingId}
            wasCategoryUserSelected={wasCategoryUserSelected}
            handleGenerate={handleGenerate}
            handleGenerateMarkAsIs={handleGenerateMarkAsIs}
            handleApplySplitRecommendation={handleApplySplitRecommendation}
            handleClearSplitBulletDrafts={handleClearSplitBulletDrafts}
            handleRepromptSplitBulletDraft={handleRepromptSplitBulletDraft}
            handleCommitSplitBulletDrafts={handleCommitSplitBulletDrafts}
            handleCommitBullet={handleCommitBullet}
            onLogEntryPulled={({ date, index, groupedIndexes }) => {
              setPulledLogDate(date);
              setPulledLogIndex(index);
              setPulledLogEntryId(index == null ? null : logEntries[index]?.id ?? null);
              setPulledGroupedEntryIndexes(groupedIndexes ?? []);
            }}
            pendingLogPull={pendingLogPull}
            onPendingLogPullConsumed={() => setPendingLogPull(null)}
          />
        )}

        {activeTab === "history" && (
          <HistoryPanel
            history={history}
            rankLevel={rankLevel}
            handleCopy={handleCopy}
            handleDelete={handleDelete}
            handleUpdateMark={handleUpdateMark}
            handleReprompt={handleReprompt}
          />
        )}

        {activeTab === "log" && (
          <LogPanel
            entries={logEntries}
            aiEnabled={aiLogImportEnabled}
            onSaveEntry={handleSaveLogEntry}
            onSaveImportedEntries={handleSaveImportedLogEntries}
            onDeleteEntry={handleDeleteLogEntry}

            onAssignGroup={handleAssignLogGroup}
            onPullEntry={handlePullLogEntryToGenerator}
            onReloadCommittedEntry={(text) => {
              setInput(text.text);
              setPulledLogDate(text.date || null);
              setPulledLogIndex(text.index);
              setPulledLogEntryId(text.id ?? logEntries[text.index]?.id ?? null);
              setActiveTab("generator");
            }}
          />
        )}

        <div className={activeTab === "dashboard" ? "" : "hidden"}>
          <DashboardPanel
            sessionUserId={authUser?.id ?? null}
            aiEnabled={aiDashboardInsightsEnabled}
            history={history}
            suggestions={suggestions}
            rankLevel={rankLevel}
            onInsightsRecommendationCountChange={setDashboardRecommendationCount}
            onUpdateBullet={(oldText, newText) => {
              setHistory((prev) =>
                prev.map((item) =>
                  item.text === oldText ? { ...item, text: newText } : item
                )
              );
              setSuggestions((prev) => {
                const existing = prev[oldText];
                if (!existing || oldText === newText) {
                  return prev;
                }

                const next = { ...prev };
                delete next[oldText];
                next[newText] = existing;
                return next;
              });
            }}
            onUpdateBulletForCategory={(oldText, newText, category) => {
              setHistory((prev) => {
                const normalizeCategory = (value: string | undefined) => {
                  if (!value) return "";
                  const normalized = value.trim().toLowerCase();
                  return normalized === "customs, courtesies, and traditions"
                    ? "customs, courtesies and traditions"
                    : normalized;
                };

                const normalizedTargetCategory = normalizeCategory(category);
                let hasUpdatedMatch = false;

                return prev.map((item) => {
                  const resolvedCategory = item.category || suggestions[item.text]?.category;
                  const isTargetMatch =
                    item.text === oldText &&
                    normalizeCategory(resolvedCategory) === normalizedTargetCategory;

                  if (isTargetMatch && !hasUpdatedMatch) {
                    hasUpdatedMatch = true;
                    return { ...item, text: newText, category };
                  }

                  return item;
                });
              });
              setSuggestions((prev) => {
                const existing = prev[oldText];
                if (!existing || oldText === newText) {
                  return prev;
                }

                const next = { ...prev };
                delete next[oldText];
                next[newText] = existing;
                return next;
              });
            }}
            onCommitConsolidatedRepetition={(originalBullets, consolidatedBullet, category, title) => {
              setHistory((prevHistory) => {
                const normalizeBulletText = (value: string) =>
                  value
                    .trim()
                    .toLowerCase()
                    .replace(/^[-*•\s]+/, "")
                    .replace(/[“”"']/g, "")
                    .replace(/[.;:,!?]+$/, "")
                    .replace(/\s+/g, " ");

                const normalizedOriginalBullets = originalBullets.map(normalizeBulletText);
                const normalizedOriginalSet = new Set(normalizedOriginalBullets);

                const isMatchToOriginal = (historyText: string) => {
                  const normalizedHistoryText = normalizeBulletText(historyText);
                  if (normalizedOriginalSet.has(normalizedHistoryText)) {
                    return true;
                  }

                  // Fallback for slight wording drift after in-app edits.
                  return normalizedOriginalBullets.some((normalizedOriginal) =>
                    normalizedOriginal.length > 24 &&
                    (normalizedHistoryText.includes(normalizedOriginal) ||
                      normalizedOriginal.includes(normalizedHistoryText))
                  );
                };

                const matchedItems = prevHistory.filter((item) => isMatchToOriginal(item.text));
                const sourceItem =
                  matchedItems.find(
                    (item) =>
                      normalizeBulletText(item.text) === normalizeBulletText(originalBullets[0] || "")
                  ) || matchedItems[0];
                const filtered = prevHistory.filter((item) => !isMatchToOriginal(item.text));

                if (filtered.some((item) => item.text === consolidatedBullet)) {
                  return filtered;
                }

                const sourceDate = sourceItem?.date || new Date().toISOString();
                const sourceMarkingPeriod =
                  sourceItem?.markingPeriod || computeMarkingPeriod(sourceDate, rankLevel);
                const resolvedTitle =
                  typeof title === "string" && title.trim().length > 0
                    ? title.trim()
                    : sourceItem?.title;

                const newItem = {
                  text: consolidatedBullet,
                  date: sourceDate,
                  category,
                  markingPeriod: sourceMarkingPeriod,
                  title: resolvedTitle,
                };

                return [newItem, ...filtered];
              });
            }}
          />
        </div>

        {activeTab === "export" && (
          <ExportPanel history={history} suggestions={suggestions} rankLevel={rankLevel} />
        )}

        {activeTab === "marks-package" && (
          <MarksPackageBuilderPanel
            history={history}
            suggestions={suggestions}
            aiEnabled={aiMarksPackageEnabled}
            rankLevel={rankLevel}
            rating={rating}
            memberName={mpMemberName}
            setMemberName={setMpMemberName}
            unitName={mpUnitName}
            setUnitName={setMpUnitName}
            periodStart={mpPeriodStart}
            setPeriodStart={setMpPeriodStart}
            periodEnd={mpPeriodEnd}
            setPeriodEnd={setMpPeriodEnd}
          />
        )}

        {activeTab === "settings" && (
          <SettingsPanel
            rankLevel={rankLevel}
            setRankLevel={setRankLevel}
            rating={rating}
            setRating={setRating}
            userName={userName}
            setUserName={setUserName}
            userUnit={userUnit}
            setUserUnit={setUserUnit}
            bulletStyle={bulletStyle}
            setBulletStyle={setBulletStyle}
            aiGeneratorEnabled={aiGeneratorEnabled}
            setAiGeneratorEnabled={setAiGeneratorEnabled}
            aiLogImportEnabled={aiLogImportEnabled}
            setAiLogImportEnabled={setAiLogImportEnabled}
            aiDashboardInsightsEnabled={aiDashboardInsightsEnabled}
            setAiDashboardInsightsEnabled={setAiDashboardInsightsEnabled}
            aiMarksPackageEnabled={aiMarksPackageEnabled}
            setAiMarksPackageEnabled={setAiMarksPackageEnabled}
            historyCount={history.length}
            settingsMessage={settingsMessage}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onClearAllBullets={handleClearAllBullets}
            onClearDailyLog={handleClearLogEntries}
            onReviewTutorial={() => {
              setTutorialStep("log");
              setActiveTab("log");
              setShowTutorialModal(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onDeleteAccount={() => void handleDeleteAccount()}
          />
        )}

        <div className="pb-2">
          <button
            id="settings-tutorial-anchor"
            onClick={() => setActiveTab("settings")}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium sm:text-base ${
              activeTab === "settings"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {altCategorySuggestion && altCategorySuggestion.categories.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
          <div className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl [WebkitOverflowScrolling:touch] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Alternate Category Marks</h2>
                <p className="mt-1 text-sm text-gray-600">
                  AI suggests this accomplishment could also support{" "}
                  {altCategorySuggestion.categories.length === 1
                    ? "another category"
                    : `${altCategorySuggestion.categories.length} other categories`}. Would you like a separate mark written for one?
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAltCategorySuggestion(null);
                  setAltCategoryDrafts({});
                }}
                className="shrink-0 text-gray-400 hover:text-gray-700 text-lg leading-none"
                aria-label="Dismiss"
              >
                X
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {altCategorySuggestion.categories.map(({ name, reason }) => {
                const draftEntry = altCategoryDrafts[name];
                const isGenerating = draftEntry?.generating ?? false;
                const generatedText = draftEntry?.text && !draftEntry.generating ? draftEntry.text : null;
                return (
                  <div key={name} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{name}</span>
                      {!generatedText && (
                        <button
                          type="button"
                          onClick={() => void handleGenerateAltCategoryDraft(name)}
                          disabled={isGenerating}
                          className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isGenerating ? "Generating..." : "Generate Mark"}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{reason}</p>
                    {generatedText && (
                      <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3">
                        <p className="text-sm font-semibold text-gray-900">{generatedText}</p>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleGenerateAltCategoryDraft(name)}
                            disabled={isGenerating}
                            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Regenerate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCommitAltCategoryDraft(name)}
                            className="rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            Commit This Mark
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAltCategorySuggestion(null);
                  setAltCategoryDrafts({});
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
          <div className="my-4 w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl [WebkitOverflowScrolling:touch] max-h-[calc(100dvh-2rem)] sm:p-6">
            <h2 className="text-xl font-bold text-gray-900">Important Notice</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <p>
                This application is an independent, personal productivity Tool designed to help users organize accomplishments and draft evaluation bullets.
              </p>
              <p>
                This application is NOT an official U.S. Coast Guard or Department of Defense system and is not endorsed, sponsored, or maintained by the U.S. Government.
              </p>
              <p>
                Users must ensure that no classified, Controlled Unclassified Information (CUI), For Official Use Only (FOUO), law enforcement sensitive, or operationally sensitive information is entered into this application.
              </p>
              <p>
                This Tool stores information locally and should not be considered a secure system for sensitive data.
              </p>
              <p>
                This Tool should only be used for personal note-taking and drafting purposes. All generated content should be reviewed, verified, and approved through the official evaluation process before use.
              </p>
              <p>By continuing, you acknowledge that:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>You will not enter classified, CUI, or sensitive operational information</li>
                <li>You understand this is not an official government system</li>
                <li>You are responsible for verifying the accuracy of generated content</li>
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={handleExitNotice}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Exit
              </button>
              <button
                onClick={handleAgreeNotice}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                I Understand and Agree
              </button>
            </div>
          </div>
        </div>
      )}

      {showTutorialModal && (
        <TutorialModal
          activeStep={tutorialStep}
          onSelectStep={handleSelectTutorialStep}
          onClose={handleCloseTutorial}
        />
      )}
    </main>
    </>
  );
}