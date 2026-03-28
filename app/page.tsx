"use client";

// ======================================================
// IMPORTS
// ======================================================
import { useCallback, useEffect, useRef, useState } from "react";
import GeneratorPanel from "../components/GeneratorPanel";
import CategoryReferencePanel from "../components/CategoryReferencePanel";
import HistoryPanel from "../components/HistoryPanel";
import TabBar from "../components/TabBar";
import DashboardPanel from "../components/DashboardPanel";
import ExportPanel from "../components/ExportPanel";
import MarksPackageBuilderPanel from "../components/MarksPackageBuilderPanel";
import SettingsPanel from "../components/SettingsPanel";
import LogPanel from "../components/LogPanel";
import TutorialModal from "../components/TutorialModal";
import AdminAnalyticsPanel from "../components/AdminAnalyticsPanel";
import { isGuidanceAdminUsername } from "@/lib/admin";
import {
  GENERATE_REQUEST_MAX_BYTES,
  getUtf8ByteLength,
  validateActionAndImpact,
} from "@/lib/generationValidation";

export default function Home() {
  const MAX_GUIDANCE_UPLOAD_BYTES = 3 * 1024 * 1024;

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
  const [useAbbreviations, setUseAbbreviations] = useState(false);

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
    sourceBullet: string;
    sourceTitle?: string;
    sourceDate: string;
    sourceDates?: string[];
  };
  const OFFICIAL_MARK_CATEGORIES = [
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
  const [bullet, setBullet] = useState<{text: string; category: string; title?: string; guidanceSections?: string[]} | null>(null);
  type HistoryItem = {
    text: string;
    date: string;
    dates?: string[];
    category?: string;
    markingPeriod?: string;
    title?: string;
    originalAction?: string;
    sourceLogEntryId?: string;
    sourceLogEntryPreviousGroup?: string;
    sourceGroupedLogEntryIds?: string[];
    sourceGroupedLogEntryGroupName?: string;
  };
  type ArchivedMarkingPeriod = {
    period: string;
    archivedAt: string;
    marks: HistoryItem[];
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
  const [archivedMarkingPeriods, setArchivedMarkingPeriods] = useState<ArchivedMarkingPeriod[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [pendingLogPull, setPendingLogPull] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pulledLogDate, setPulledLogDate] = useState<string | null>(null);
  const [pulledLogDates, setPulledLogDates] = useState<string[]>([]);
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
  const [altCategoryDrafts, setAltCategoryDrafts] = useState<Record<string, { text: string; title?: string; generating: boolean; guidanceSections?: string[] }>>({});
  const [manualAltCategory, setManualAltCategory] = useState("");
  const manualAltCategorySelectRef = useRef<HTMLSelectElement | null>(null);
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

  const normalizeDateList = (dates?: string[]) =>
    (dates ?? [])
      .filter((date): date is string => typeof date === "string" && date.length > 0)
      .filter((date, index, arr) => arr.indexOf(date) === index);

  const getApiPayload = async <T,>(response: Response): Promise<{ data: T | null; nonJsonText: string | null }> => {
    const contentType = (response.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      try {
        return { data: (await response.json()) as T, nonJsonText: null };
      } catch {
        return { data: null, nonJsonText: null };
      }
    }

    try {
      const bodyText = await response.text();
      return { data: null, nonJsonText: bodyText.slice(0, 200).replace(/\s+/g, " ").trim() };
    } catch {
      return { data: null, nonJsonText: null };
    }
  };

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
  const [currentMarkingPeriodOverride, setCurrentMarkingPeriodOverride] = useState("");
  const MARKING_PERIOD_SEPARATOR = " – ";
  const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const normalizeMarkingPeriodLabel = (value: string): string =>
    value.replace(/\s*[\-–]\s*/g, MARKING_PERIOD_SEPARATOR).trim();

  // ======================================================
  // SETTINGS STATE
  // ======================================================
  const [userName, setUserName] = useState("");
  const [userUnit, setUserUnit] = useState("");
  const [bulletStyle, setBulletStyle] = useState("Short/Concise");
  const [aiGeneratorEnabled, setAiGeneratorEnabled] = useState(true);
  const [aiGeneratorSplitRecommendationsEnabled, setAiGeneratorSplitRecommendationsEnabled] = useState(true);
  const [aiGeneratorAlternateDraftsEnabled, setAiGeneratorAlternateDraftsEnabled] = useState(true);
  const [aiLogImportEnabled, setAiLogImportEnabled] = useState(true);
  const [aiDashboardInsightsEnabled, setAiDashboardInsightsEnabled] = useState(true);
  const [aiMarksPackageEnabled, setAiMarksPackageEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [tacticalColorSchemeEnabled, setTacticalColorSchemeEnabled] = useState(false);
  const [highContrastEnabled, setHighContrastEnabled] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [guidanceUploadBusy, setGuidanceUploadBusy] = useState(false);
  const [guidanceUploadStatus, setGuidanceUploadStatus] = useState<{
    fileName: string;
    status: "uploading" | "uploaded" | "failed";
    detail?: string;
  } | null>(null);
  const [guidanceDeleteBusyRank, setGuidanceDeleteBusyRank] = useState<string | null>(null);
  type GuidanceUploadHistoryEntry = {
    rank: string;
    source: string;
    fileName: string;
    outputFile: string;
    chunkCount: number;
    uploadedAt: string;
    uploadedBy: string;
    replacedExisting: boolean;
  };
  const [guidanceUploadHistory, setGuidanceUploadHistory] = useState<GuidanceUploadHistoryEntry[]>([]);

  // ======================================================
  // UI STATE
  // ======================================================
  const [syncFailed, setSyncFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("log");
  const [dashboardRecommendationCount, setDashboardRecommendationCount] = useState(0);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showGuestExportModal, setShowGuestExportModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>("log");
  const [hasExited, setHasExited] = useState(false);

  // ======================================================
  // AUTH STATE
  // ======================================================
  type SessionUser = {
    id: string;
    username: string;
    isGuest?: boolean;
    needsTutorial?: boolean;
    needsEmail?: boolean;
    lastLoginAt?: string | null;
    planTier?: "free" | "premium";
    planStatus?: "trialing" | "active" | "past_due" | "canceled" | null;
    dailyUsageCount?: number;
    dailyUsageLimit?: number | null;
  };
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showGuestProfilePrompt, setShowGuestProfilePrompt] = useState(false);
  const [guestRankLevel, setGuestRankLevel] = useState("E4");
  const [guestRating, setGuestRating] = useState("BM - Boatswain's Mate");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(true);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordBusy, setForgotPasswordBusy] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [emailPromptDismissed, setEmailPromptDismissed] = useState(false);
  const [emailPromptInput, setEmailPromptInput] = useState("");
  const [emailPromptBusy, setEmailPromptBusy] = useState(false);
  const [emailPromptError, setEmailPromptError] = useState("");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [pendingUser, setPendingUser] = useState<SessionUser | null>(null);
  const [signupRankLevel, setSignupRankLevel] = useState("E4");
  const [signupRating, setSignupRating] = useState("BM - Boatswain's Mate");
  const [signupUserName, setSignupUserName] = useState("");
  const [signupUserUnit, setSignupUserUnit] = useState("");
  const [signupBulletStyle, setSignupBulletStyle] = useState("Short/Concise");
  const [billingBusy, setBillingBusy] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalMessage, setUpgradeModalMessage] = useState(
    "You've reached your daily limit. Upgrade to Premium for unlimited bullets."
  );
  const canManageOfficialGuidance = isGuidanceAdminUsername(authUser?.username);

  const formattedLastLogin = authUser?.lastLoginAt
    ? new Date(authUser.lastLoginAt).toLocaleString()
    : null;
  const isGuestSession = authUser?.isGuest === true;
  const hasPremiumAccess = !isGuestSession && authUser?.planTier === "premium";
  const usageCount = authUser?.dailyUsageCount ?? 0;
  const usageLimit = authUser?.dailyUsageLimit ?? 5;
  const planLabel =
    authUser?.planStatus === "trialing"
      ? "Trial"
      : hasPremiumAccess
        ? "Premium"
        : "Free";
  const showAddEmailPrompt =
    !!authUser && !isGuestSession && authUser.needsEmail === true && !emailPromptDismissed;
  const rankLevelRef = useRef(rankLevel);
  const ratingRef = useRef(rating);

  useEffect(() => {
    rankLevelRef.current = rankLevel;
  }, [rankLevel]);

  useEffect(() => {
    ratingRef.current = rating;
  }, [rating]);

  const loadGuidanceUploadHistory = useCallback(async () => {
    if (!canManageOfficialGuidance) {
      setGuidanceUploadHistory([]);
      return;
    }

    try {
      const response = await fetch("/api/admin/upload-official-guidance", { method: "GET" });
      const { data, nonJsonText } = await getApiPayload<{
        entries?: GuidanceUploadHistoryEntry[];
        error?: string;
      }>(response);

      if (!response.ok) {
        const details = data?.error || nonJsonText || `HTTP ${response.status}`;
        throw new Error(`Unable to load guidance upload history. ${details}`);
      }

      setGuidanceUploadHistory(Array.isArray(data?.entries) ? data.entries : []);
    } catch {
      setGuidanceUploadHistory([]);
    }
  }, [canManageOfficialGuidance]);

  useEffect(() => {
    void loadGuidanceUploadHistory();
  }, [loadGuidanceUploadHistory]);

  type UserDataKey =
    | "history"
    | "archivedMarkingPeriods"
    | "log"
    | "settings"
    | "dashboardTotalEstimate"
    | "exportHistory";

  const GUEST_PROFILE_PROMPT_COMPLETED_KEY = "guest-session:profilePromptCompleted";

  const getGuestStorageKey = useCallback((key: UserDataKey) => `guest-session:${key}`, []);

  const loadUserData = useCallback(
    async <T,>(key: UserDataKey): Promise<T | null> => {
      if (isGuestSession) {
        const raw = sessionStorage.getItem(getGuestStorageKey(key));
        if (!raw) {
          return null;
        }

        try {
          return JSON.parse(raw) as T;
        } catch {
          return null;
        }
      }

      const res = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`);
      if (!res.ok) {
        throw new Error(`Load failed (${res.status})`);
      }
      const data = (await res.json()) as { value?: T | null };
      return data.value ?? null;
    },
    [getGuestStorageKey, isGuestSession]
  );

  const saveUserData = useCallback(
    async (key: UserDataKey, value: unknown) => {
      if (isGuestSession) {
        sessionStorage.setItem(getGuestStorageKey(key), JSON.stringify(value));
        return;
      }

      const res = await fetch("/api/user-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (!res.ok) {
        let message = `Save failed (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string; code?: string };
          if (typeof data.error === "string" && data.error) {
            message = data.error;
          }
          if (data.code === "FREE_SAVED_LIMIT_REACHED") {
            setUpgradeModalMessage(
              data.error ?? "Free plan supports up to 10 saved bullets. Upgrade to Premium for unlimited saves."
            );
            setShowUpgradeModal(true);
          }
        } catch {
          // Fall back to generic message.
        }
        throw new Error(message);
      }
    },
    [getGuestStorageKey, isGuestSession]
  );

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { method: "GET" });
      const data = (await res.json()) as {
        authenticated?: boolean;
        user?: SessionUser | null;
      };
      const sessionUser = data.authenticated ? data.user ?? null : null;
      setAuthUser(sessionUser);
    } catch {
      // Keep current session state if refresh fails.
    }
  }, []);

  const handleUpgradeToPremium = useCallback(
    async (billingCycle: "monthly" | "yearly" = "monthly") => {
      if (!authUser || isGuestSession || billingBusy) {
        return;
      }

      setBillingBusy(true);
      try {
        const response = await fetch("/api/billing/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ billingCycle }),
        });
        const data = (await response.json()) as { url?: string; error?: string };

        if (!response.ok || !data.url) {
          throw new Error(data.error || "Unable to start checkout.");
        }

        window.location.assign(data.url);
      } catch (upgradeError: unknown) {
        setError(upgradeError instanceof Error ? upgradeError.message : "Unable to start checkout.");
      } finally {
        setBillingBusy(false);
      }
    },
    [authUser, billingBusy, isGuestSession]
  );

  const handleManageSubscription = useCallback(async () => {
    if (!authUser || isGuestSession || billingBusy) {
      return;
    }

    setBillingBusy(true);
    try {
      const response = await fetch("/api/billing/create-portal-session", {
        method: "POST",
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Unable to open billing portal.");
      }
      window.location.assign(data.url);
    } catch (portalError: unknown) {
      setError(portalError instanceof Error ? portalError.message : "Unable to open billing portal.");
    } finally {
      setBillingBusy(false);
    }
  }, [authUser, billingBusy, isGuestSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const billingResult = params.get("billing");
    if (billingResult === "success" || billingResult === "cancel") {
      void refreshSession();
    }
  }, [refreshSession]);

  const clearGuestSessionData = useCallback(() => {
    const keys: UserDataKey[] = ["history", "archivedMarkingPeriods", "log", "settings", "dashboardTotalEstimate", "exportHistory"];

    for (const key of keys) {
      sessionStorage.removeItem(getGuestStorageKey(key));
    }
    sessionStorage.removeItem(GUEST_PROFILE_PROMPT_COMPLETED_KEY);
  }, [getGuestStorageKey]);

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
          const sessionUser = data.authenticated ? data.user ?? null : null;
          setAuthUser(sessionUser);
          if (!sessionUser || sessionUser.isGuest || !sessionUser.needsEmail) {
            setEmailPromptDismissed(false);
          }

          if (sessionUser?.isGuest) {
            const profilePromptCompleted =
              sessionStorage.getItem(GUEST_PROFILE_PROMPT_COMPLETED_KEY) === "1";
            if (!profilePromptCompleted) {
              setGuestRankLevel(rankLevelRef.current);
              setGuestRating(ratingRef.current);
              setShowGuestProfilePrompt(true);
            }
          }
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
    const email = authEmail.trim();
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
        body: JSON.stringify(
          authMode === "login"
            ? { identifier: username, username, password }
            : { username, email, password }
        ),
      });

      const data = (await res.json()) as {
        error?: string;
        user?: SessionUser;
      };

      if (!res.ok || !data.user) {
        const nextError = data.error || "Authentication failed.";
        setAuthError(nextError);

        const isInvalidCredentials =
          authMode === "login" &&
          res.status === 401 &&
          nextError.toLowerCase().includes("invalid username or password");

        if (isInvalidCredentials) {
          setShowForgotPassword(true);
          setForgotPasswordEmail(username.includes("@") ? username : "");
        }

        return;
      }

      if (authMode === "signup") {
        setPendingUser(data.user);
        setSignupStep(2);
      } else {
        setAuthUser(data.user);
        setEmailPromptDismissed(false);
        setEmailPromptInput("");
        setEmailPromptError("");
        setShowForgotPassword(false);
        setForgotPasswordOpen(false);
        setForgotPasswordEmail("");
        setForgotPasswordError("");
        setForgotPasswordMessage("");
        setShowNoticeModal(true);
      }
      setAuthPassword("");
    } catch {
      setAuthError("Authentication request failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRequestPasswordResetLink = async () => {
    const emailCandidate = forgotPasswordEmail.trim() || authUsername.trim();

    if (!emailCandidate) {
      setForgotPasswordError("Enter your email first.");
      return;
    }

    setForgotPasswordError("");
    setForgotPasswordMessage("");
    setForgotPasswordBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailCandidate }),
      });

      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        setForgotPasswordError(data.error || "Unable to send verification code.");
        return;
      }

      setForgotPasswordEmail(emailCandidate);
      setForgotPasswordMessage(
        data.message ||
          "If an account with that email exists, a password reset link has been sent."
      );
    } catch {
      setForgotPasswordError("Unable to send reset link.");
    } finally {
      setForgotPasswordBusy(false);
    }
  };

  const handleGuestLogin = async () => {
    setAuthError("");
    setAuthBusy(true);
    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      const data = (await res.json()) as { error?: string; user?: SessionUser };

      if (!res.ok || !data.user) {
        setAuthError(data.error || "Unable to start guest session.");
        return;
      }

      setAuthUser(data.user);
      setGuestRankLevel(rankLevel);
      setGuestRating(rating);
      setShowGuestProfilePrompt(false);
      sessionStorage.removeItem(GUEST_PROFILE_PROMPT_COMPLETED_KEY);
      setShowNoticeModal(true);
    } catch {
      setAuthError("Unable to start guest session.");
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
            aiGeneratorSplitRecommendationsEnabled: true,
            aiGeneratorAlternateDraftsEnabled: true,
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
    setAiGeneratorSplitRecommendationsEnabled(true);
    setAiGeneratorAlternateDraftsEnabled(true);
    setAiLogImportEnabled(true);
    setAiDashboardInsightsEnabled(true);
    setAiMarksPackageEnabled(true);
    setDarkModeEnabled(false);
    setTacticalColorSchemeEnabled(false);
    setHighContrastEnabled(false);
    setAuthUser(pendingUser);
    setPendingUser(null);
    setSignupStep(1);
    setShowNoticeModal(true);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      if (isGuestSession) {
        clearGuestSessionData();
      }
      setShowForgotPassword(true);
      setAuthUser(null);
      setAuthPassword("");
      setAuthEmail("");
      setEmailPromptDismissed(false);
      setEmailPromptInput("");
      setEmailPromptError("");
      setHistory([]);
      setArchivedMarkingPeriods([]);
      setLogEntries([]);
      setSuggestions({});
      setBullet(null);
      setEditingIndex(null);
      setPulledLogIndex(null);
      setPulledGroupedEntryIndexes([]);
      setInput("");
      setCategory("");
      setActiveTab("log");
      setSyncFailed(false);
      setLoadFailed(false);
    }
  };

  const handleRetrySave = () => {
    if (!authUser || isGuestSession || loadFailed) return;
    saveUserData("history", history).then(() => setSyncFailed(false)).catch(() => setSyncFailed(true));
    saveUserData("archivedMarkingPeriods", archivedMarkingPeriods).catch(() => setSyncFailed(true));
    saveUserData("log", logEntries).catch(() => setSyncFailed(true));
    saveUserData("settings", {
      rankLevel,
      rating,
      userName,
      userUnit,
      mpMemberName,
      mpUnitName,
      mpPeriodStart,
      mpPeriodEnd,
      currentMarkingPeriodOverride,
      bulletStyle,
      aiGeneratorEnabled,
      aiGeneratorSplitRecommendationsEnabled,
      aiGeneratorAlternateDraftsEnabled,
      aiLogImportEnabled,
      aiDashboardInsightsEnabled,
      aiMarksPackageEnabled,
      darkModeEnabled,
      tacticalColorSchemeEnabled,
      highContrastEnabled,
    }).catch(() => setSyncFailed(true));
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
    setAuthEmail("");
    setEmailPromptDismissed(false);
    setEmailPromptInput("");
    setEmailPromptError("");
    setHistory([]);
    setArchivedMarkingPeriods([]);
    setLogEntries([]);
    setSuggestions({});
    setBullet(null);
    setEditingIndex(null);
    setPulledLogIndex(null);
    setInput("");
    setCategory("");
    setDarkModeEnabled(false);
    setTacticalColorSchemeEnabled(false);
    setHighContrastEnabled(false);
    setActiveTab("log");
  };

  // ======================================================
  // LOAD HISTORY
  // ======================================================
  useEffect(() => {
    if (!authUser) {
      historyHydratedRef.current = false;
      setHistory([]);
      setArchivedMarkingPeriods([]);
      return;
    }

    historyHydratedRef.current = false;

    void (async () => {
      try {
        const loadedHistory = await loadUserData<unknown>("history");
        const loadedArchivedMarkingPeriods = await loadUserData<unknown>("archivedMarkingPeriods");
        if (Array.isArray(loadedHistory) && loadedHistory.length > 0) {
          setHistory(loadedHistory as HistoryItem[]);
        } else {
          if (isGuestSession) {
            setHistory([]);
            return;
          }

          // One-time migration: upload localStorage data if server has none.
          const localRaw = localStorage.getItem(`bulletHistory:${authUser.id}`);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw) as unknown;
              let migrated: HistoryItem[] = [];
              if (Array.isArray(parsed) && parsed.length > 0) {
                migrated = typeof parsed[0] === "string"
                  ? (parsed as string[]).map((t) => ({ text: t, date: "" }))
                  : (parsed as HistoryItem[]);
              }
              if (migrated.length > 0) {
                await saveUserData("history", migrated);
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

        if (Array.isArray(loadedArchivedMarkingPeriods)) {
          setArchivedMarkingPeriods(
            loadedArchivedMarkingPeriods.filter(
              (entry): entry is ArchivedMarkingPeriod =>
                !!entry &&
                typeof entry === "object" &&
                typeof (entry as ArchivedMarkingPeriod).period === "string" &&
                Array.isArray((entry as ArchivedMarkingPeriod).marks)
            )
          );
        } else {
          setArchivedMarkingPeriods([]);
        }

        historyHydratedRef.current = true;
      } catch {
        setLoadFailed(true);
      }
    })();
  }, [authUser, isGuestSession, loadUserData, saveUserData]);

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
        const loadedLog = await loadUserData<unknown>("log");
        if (Array.isArray(loadedLog)) {
          setLogEntries(normalize(loadedLog));
        } else {
          if (isGuestSession) {
            setLogEntries([]);
            return;
          }

          // One-time migration from localStorage.
          const localRaw = localStorage.getItem(`dailyLog:${authUser.id}`);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw) as unknown;
              const migrated = Array.isArray(parsed) ? normalize(parsed) : [];
              if (migrated.length > 0) {
                await saveUserData("log", migrated);
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

        logHydratedRef.current = true;
      } catch {
        setLoadFailed(true);
      }
    })();
  }, [authUser, isGuestSession, loadUserData, saveUserData]);

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
    setBulletStyle("Short/Concise");
    setMpMemberName("");
    setMpUnitName("");
    setMpPeriodStart("");
    setMpPeriodEnd("");
    setCurrentMarkingPeriodOverride("");
    setAiGeneratorEnabled(true);
    setAiGeneratorSplitRecommendationsEnabled(true);
    setAiGeneratorAlternateDraftsEnabled(true);
    setAiLogImportEnabled(true);
    setAiDashboardInsightsEnabled(true);
    setAiMarksPackageEnabled(true);
    setDarkModeEnabled(false);
    setTacticalColorSchemeEnabled(false);
    setHighContrastEnabled(false);
    setSettingsMessage("");

    void (async () => {
      type SettingsShape = {
        rankLevel?: string;
        rating?: string;
        userName?: string;
        userUnit?: string;
        mpMemberName?: string;
        mpUnitName?: string;
        mpPeriodStart?: string;
        mpPeriodEnd?: string;
        currentMarkingPeriodOverride?: string;
        bulletStyle?: string;
        aiGeneratorEnabled?: boolean;
        aiGeneratorSplitRecommendationsEnabled?: boolean;
        aiGeneratorAlternateDraftsEnabled?: boolean;
        aiLogImportEnabled?: boolean;
        aiDashboardInsightsEnabled?: boolean;
        aiMarksPackageEnabled?: boolean;
        darkModeEnabled?: boolean;
        tacticalColorSchemeEnabled?: boolean;
        highContrastEnabled?: boolean;
      };
      try {
        let loaded = await loadUserData<SettingsShape>("settings");

        if (!loaded && !isGuestSession) {
          // One-time migration from localStorage.
          const localRaw = localStorage.getItem(`appSettings:${authUser.id}`);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw) as SettingsShape;
              if (parsed && typeof parsed === "object") {
                loaded = parsed;
                await saveUserData("settings", loaded);
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
          if (loaded.mpMemberName) setMpMemberName(loaded.mpMemberName);
          if (loaded.mpUnitName) setMpUnitName(loaded.mpUnitName);
          if (loaded.mpPeriodStart) setMpPeriodStart(loaded.mpPeriodStart);
          if (loaded.mpPeriodEnd) setMpPeriodEnd(loaded.mpPeriodEnd);
          if (loaded.currentMarkingPeriodOverride) {
            setCurrentMarkingPeriodOverride(normalizeMarkingPeriodLabel(loaded.currentMarkingPeriodOverride));
          }
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
          if (typeof loaded.aiGeneratorSplitRecommendationsEnabled === "boolean") {
            setAiGeneratorSplitRecommendationsEnabled(loaded.aiGeneratorSplitRecommendationsEnabled);
          } else if (typeof loaded.aiGeneratorEnabled === "boolean") {
            setAiGeneratorSplitRecommendationsEnabled(loaded.aiGeneratorEnabled);
          }
          if (typeof loaded.aiGeneratorAlternateDraftsEnabled === "boolean") {
            // If the user is now premium but the saved value is false (set by auto-disable
            // when they were on the free plan), restore it to true.
            const isPremiumUser = !isGuestSession && authUser?.planTier === "premium";
            setAiGeneratorAlternateDraftsEnabled(
              isPremiumUser && !loaded.aiGeneratorAlternateDraftsEnabled
                ? true
                : loaded.aiGeneratorAlternateDraftsEnabled
            );
          } else if (typeof loaded.aiGeneratorEnabled === "boolean") {
            setAiGeneratorAlternateDraftsEnabled(loaded.aiGeneratorEnabled);
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
          if (typeof loaded.darkModeEnabled === "boolean") {
            setDarkModeEnabled(loaded.darkModeEnabled);
          }
          if (typeof loaded.tacticalColorSchemeEnabled === "boolean") {
            setTacticalColorSchemeEnabled(loaded.tacticalColorSchemeEnabled);
          }
          if (typeof loaded.highContrastEnabled === "boolean") {
            setHighContrastEnabled(loaded.highContrastEnabled);
          }
        }

        settingsHydratedRef.current = true;
      } catch {
        // Keep the defaults set above.
        setLoadFailed(true);
      }
    })();
  }, [authUser, isGuestSession, loadUserData, saveUserData]);

  useEffect(() => {
    if (!authUser) return;
    if (!settingsHydratedRef.current) {
      return;
    }
    if (loadFailed) {
      return;
    }
    saveUserData("settings", {
      rankLevel,
      rating,
      userName,
      userUnit,
      mpMemberName,
      mpUnitName,
      mpPeriodStart,
      mpPeriodEnd,
      currentMarkingPeriodOverride,
      bulletStyle,
      aiGeneratorEnabled,
      aiGeneratorSplitRecommendationsEnabled,
      aiGeneratorAlternateDraftsEnabled,
      aiLogImportEnabled,
      aiDashboardInsightsEnabled,
      aiMarksPackageEnabled,
      darkModeEnabled,
      tacticalColorSchemeEnabled,
      highContrastEnabled,
    }).then(() => setSyncFailed(false)).catch(() => setSyncFailed(true));
  }, [
    rankLevel,
    rating,
    userName,
    userUnit,
    mpMemberName,
    mpUnitName,
    mpPeriodStart,
    mpPeriodEnd,
    currentMarkingPeriodOverride,
    bulletStyle,
    aiGeneratorEnabled,
    aiGeneratorSplitRecommendationsEnabled,
    aiGeneratorAlternateDraftsEnabled,
    aiLogImportEnabled,
    aiDashboardInsightsEnabled,
    aiMarksPackageEnabled,
    darkModeEnabled,
    tacticalColorSchemeEnabled,
    highContrastEnabled,
    authUser,
    loadFailed,
    saveUserData,
  ]);

  useEffect(() => {
    if (darkModeEnabled && tacticalColorSchemeEnabled) {
      setDarkModeEnabled(false);
      return;
    }

    document.documentElement.dataset.theme = darkModeEnabled ? "dark" : "light";
    document.body.classList.toggle("theme-dark", darkModeEnabled);
  }, [darkModeEnabled, tacticalColorSchemeEnabled]);

  useEffect(() => {
    document.documentElement.dataset.colorScheme = tacticalColorSchemeEnabled ? "tactical" : "default";
    document.body.classList.toggle("theme-tactical", tacticalColorSchemeEnabled);
  }, [tacticalColorSchemeEnabled]);

  useEffect(() => {
    document.documentElement.dataset.contrast = highContrastEnabled ? "high" : "normal";
    document.body.classList.toggle("theme-high-contrast", highContrastEnabled);
  }, [highContrastEnabled]);

  useEffect(() => {
    if (aiGeneratorSplitRecommendationsEnabled) {
      return;
    }

    setSplitBulletRecommendation(null);
    setSplitBulletRecommendationLoading(false);
    setSplitBulletDrafts([]);
    setSplitBulletDraftsLoading(false);
    setSplitBulletDraftRepromptingId(null);
  }, [aiGeneratorSplitRecommendationsEnabled]);

  useEffect(() => {
    if (aiGeneratorAlternateDraftsEnabled) {
      return;
    }

    setAltCategorySuggestion(null);
    setAltCategoryDrafts({});
    setManualAltCategory("");
  }, [aiGeneratorAlternateDraftsEnabled]);

  useEffect(() => {
    if (!authUser || isGuestSession || hasPremiumAccess) {
      return;
    }

    if (aiGeneratorSplitRecommendationsEnabled) {
      setAiGeneratorSplitRecommendationsEnabled(false);
    }
  }, [
    aiGeneratorSplitRecommendationsEnabled,
    authUser,
    hasPremiumAccess,
    isGuestSession,
  ]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--guest-global-bar-height",
      isGuestSession ? "2rem" : "0px"
    );

    return () => {
      document.documentElement.style.setProperty("--guest-global-bar-height", "0px");
    };
  }, [isGuestSession]);

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

    if (isGuestSession) {
      setShowGuestProfilePrompt(true);
      return;
    }

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

  const showBottomScrollButton =
    activeTab === "log" || activeTab === "history" || activeTab === "dashboard";
  const bottomScrollButtonClass = "btn-primary focus:ring-blue-400";

  const handleScrollToBottom = useCallback(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  const handleCloseTutorial = async () => {
    setShowTutorialModal(false);

    if (!authUser?.needsTutorial) {
      return;
    }

    if (authUser.isGuest) {
      setAuthUser((currentUser) =>
        currentUser ? { ...currentUser, needsTutorial: false } : currentUser
      );
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
    if (loadFailed) {
      return;
    }
    saveUserData("history", history).then(() => setSyncFailed(false)).catch(() => setSyncFailed(true));
  }, [history, authUser, loadFailed, saveUserData]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    if (!historyHydratedRef.current) {
      return;
    }
    if (loadFailed) {
      return;
    }
    saveUserData("archivedMarkingPeriods", archivedMarkingPeriods)
      .then(() => setSyncFailed(false))
      .catch(() => setSyncFailed(true));
  }, [archivedMarkingPeriods, authUser, loadFailed, saveUserData]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    if (!logHydratedRef.current) {
      return;
    }
    if (loadFailed) {
      return;
    }
    saveUserData("log", logEntries).then(() => setSyncFailed(false)).catch(() => setSyncFailed(true));
  }, [logEntries, authUser, loadFailed, saveUserData]);

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

  const generateBulletDraft = async (
    accomplishment: string,
    options?: {
      preferredCategory?: string;
      generationIntent?: string;
      sourceBullet?: string;
      sourceCategory?: string;
    }
  ) => {
    if (!aiGeneratorEnabled) {
      throw new Error("Generator AI is disabled in Settings.");
    }

    const finalCategory = await resolveCategoryForText(accomplishment, options?.preferredCategory);

    const payload = {
      accomplishment,
      category: finalCategory,
      rankLevel,
      rating,
      bulletStyle,
      useAbbreviations,
      peopleAffected,
      percentImproved,
      hoursSaved,
      missionImpact,
      generationIntent: options?.generationIntent ?? "final-polished-official-mark",
      sourceBullet: options?.sourceBullet,
      sourceCategory: options?.sourceCategory,
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
      if (
        data?.code === "FREE_DAILY_LIMIT_REACHED" ||
        data?.code === "PREMIUM_REQUIRED"
      ) {
        setUpgradeModalMessage(
          typeof data.error === "string"
            ? data.error
            : "You've reached your daily limit. Upgrade to Premium for unlimited bullets."
        );
        setShowUpgradeModal(true);
      }
      throw new Error(data.error || "Failed to generate bullet.");
    }

    return {
      text: data.bullet as string,
      category: finalCategory,
      title: typeof data.title === "string" ? data.title : "",
      guidanceSections: Array.isArray(data.guidanceSections) ? (data.guidanceSections as string[]) : [],
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
      const generatedDraft = await generateBulletDraft(trimmedInput, {
        preferredCategory: category || undefined,
      });
      await refreshSession();

      setBullet({ text: generatedDraft.text, category: generatedDraft.category, title: generatedDraft.title, guidanceSections: generatedDraft.guidanceSections });
      setWasCategoryUserSelected(wasUserSelected);

      setSplitBulletRecommendationLoading(true);
      try {
        if (!aiGeneratorSplitRecommendationsEnabled) {
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
    if (!hasPremiumAccess) {
      setUpgradeModalMessage("Refine/improve tools are Premium features. Upgrade to continue.");
      setShowUpgradeModal(true);
      return;
    }

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
          const generatedDraft = await generateBulletDraft(action, {
            preferredCategory: category || undefined,
          });
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
    if (!hasPremiumAccess) {
      setUpgradeModalMessage("Refine/improve tools are Premium features. Upgrade to continue.");
      setShowUpgradeModal(true);
      return;
    }

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
      const regeneratedDraft = await generateBulletDraft(targetDraft.action, {
        preferredCategory: targetDraft.category,
      });

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
    sourceTitle?: string,
    sourceDates?: string[]
  ) => {
    if (!hasPremiumAccess) {
      setAltCategorySuggestion(null);
      setAltCategoryDrafts({});
      setManualAltCategory("");
      return;
    }

    if (!aiGeneratorAlternateDraftsEnabled) {
      setAltCategorySuggestion(null);
      setAltCategoryDrafts({});
      setManualAltCategory("");
      return;
    }

    const normalizedSourceDates = normalizeDateList(sourceDates);
    const sourceDate = normalizedSourceDates[0] || "";

    setAltCategorySuggestion(null);
    setAltCategoryDrafts({});
    setManualAltCategory("");
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
            sourceBullet: bulletText,
            sourceTitle,
            sourceDate,
            sourceDates: normalizedSourceDates.length > 0 ? normalizedSourceDates : undefined,
          });
          setManualAltCategory("");
        }
      } catch {
        // Fail silently; commit already succeeded.
      }
    })();
  };

  const handleGenerateAltCategoryDraft = async (categoryName: string) => {
    if (!hasPremiumAccess) {
      setUpgradeModalMessage("Alternate category drafts are Premium features. Upgrade to continue.");
      setShowUpgradeModal(true);
      return;
    }

    if (!aiGeneratorEnabled || !aiGeneratorAlternateDraftsEnabled) return;
    if (!altCategorySuggestion) return;
    setAltCategoryDrafts((prev) => ({ ...prev, [categoryName]: { text: "", title: "", generating: true } }));
    try {
      const draft = await generateBulletDraft(altCategorySuggestion.originalAction, {
        preferredCategory: categoryName,
        generationIntent: "alternate-category-rewrite",
        sourceBullet: altCategorySuggestion.sourceBullet,
        sourceCategory: altCategorySuggestion.primaryCategory,
      });
      const title = altCategorySuggestion.sourceTitle?.trim() || draft.title;
      setAltCategoryDrafts((prev) => ({
        ...prev,
        [categoryName]: { text: draft.text, title, generating: false, guidanceSections: draft.guidanceSections },
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
    const sourceDates = normalizeDateList(altCategorySuggestion.sourceDates);
    const itemDate = sourceDates[0] || altCategorySuggestion.sourceDate || "";

    setHistory((prev) => {
      if (prev.some((h) => h.text === draftEntry.text)) return prev;
      return [
        {
          text: draftEntry.text,
          date: itemDate,
          dates: sourceDates.length > 0 ? sourceDates : undefined,
          category: categoryName,
          markingPeriod: itemDate ? computeMarkingPeriod(itemDate, rankLevel) : "",
          title: draftEntry.title,
          originalAction,
        },
        ...prev,
      ];
    });
    setAltCategorySuggestion(null);
    setAltCategoryDrafts({});
    setManualAltCategory("");
  };

  useEffect(() => {
    if (!altCategorySuggestion) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      manualAltCategorySelectRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimeout);
    };
  }, [altCategorySuggestion]);

  const handleCommitSplitBulletDrafts = (draftIds: string[]) => {
    if (draftIds.length === 0) {
      return;
    }

    const selectedDrafts = splitBulletDrafts.filter((draft) => draftIds.includes(draft.id));
    if (selectedDrafts.length === 0) {
      return;
    }

    const sourceLogEntry = pulledLogIndex != null ? logEntries[pulledLogIndex] : undefined;
    const sourceLogEntryId = pulledLogEntryId ?? sourceLogEntry?.id;
    const sourceLogEntryPreviousGroup = sourceLogEntry?.group;
    const splitGroupedEntries = pulledGroupedEntryIndexes
      .map((i) => logEntries[i])
      .filter((e): e is LogEntry => e !== undefined);
    const groupedEntryDates = splitGroupedEntries.flatMap((entry) =>
      Array.isArray(entry.dates) && entry.dates.length > 0
        ? entry.dates
        : entry.date
          ? [entry.date]
          : []
    );
    const splitItemDates = normalizeDateList(
      pulledLogDates.length > 0
        ? pulledLogDates
        : pulledLogDate
          ? [pulledLogDate]
          : groupedEntryDates
    );
    const splitItemDate = splitItemDates[0] || "";
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
          dates: splitItemDates.length > 0 ? splitItemDates : undefined,
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
    setPulledLogDates([]);
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
      triggerAltCategoryAnalysis(
        firstDraft.text,
        firstDraft.action,
        firstDraft.category,
        firstDraft.title,
        splitItemDates
      );
    }
  };

  const computeMarkingPeriod = (dateStr: string, rank: string): string => {
    if (!dateStr.trim()) {
      return "";
    }

    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      return "";
    }

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

  const getNextMarkingPeriod = (period: string, rank: string): string => {
    const normalizedPeriod = normalizeMarkingPeriodLabel(period);
    const endPart = normalizedPeriod.split(MARKING_PERIOD_SEPARATOR)[1]?.trim();
    if (!endPart) {
      return "";
    }

    const [endMonthStr, endYearStr] = endPart.split(/\s+/);
    const endMonthIndex = SHORT_MONTH_NAMES.indexOf(endMonthStr);
    const endYear = Number.parseInt(endYearStr, 10);
    if (endMonthIndex === -1 || Number.isNaN(endYear)) {
      return "";
    }

    const nextMonthIndex = (endMonthIndex + 1) % 12;
    const nextYear = endMonthIndex === SHORT_MONTH_NAMES.length - 1 ? endYear + 1 : endYear;
    const nextDate = `${nextYear}-${String(nextMonthIndex + 1).padStart(2, "0")}-15`;

    return computeMarkingPeriod(nextDate, rank);
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

      const sourceLogEntry = pulledLogIndex != null ? logEntries[pulledLogIndex] : undefined;
      const sourceLogEntryId = pulledLogEntryId ?? sourceLogEntry?.id;
      const sourceLogEntryPreviousGroup = sourceLogEntry?.group;
      const groupedEntries = pulledGroupedEntryIndexes
        .map((i) => logEntries[i])
        .filter((e): e is LogEntry => e !== undefined);
      const groupedEntryDates = groupedEntries.flatMap((entry) =>
        Array.isArray(entry.dates) && entry.dates.length > 0
          ? entry.dates
          : entry.date
            ? [entry.date]
            : []
      );
      const itemDates = normalizeDateList(
        pulledLogDates.length > 0
          ? pulledLogDates
          : pulledLogDate
            ? [pulledLogDate]
            : groupedEntryDates
      );
      const itemDate = itemDates[0] || "";
      const sourceGroupedLogEntryIds = groupedEntries
        .map((e) => e.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      const sourceGroupedLogEntryGroupName = groupedEntries[0]?.group?.trim() || undefined;
      const newItem: HistoryItem = {
        text: bullet.text,
        date: itemDate,
        dates: itemDates.length > 0 ? itemDates : undefined,
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
    setPulledLogDates([]);
    setPulledLogIndex(null);
    setPulledLogEntryId(null);
    setPulledGroupedEntryIndexes([]);
    setEditingIndex(null);
    setWasCategoryUserSelected(false);
    setInput("");

    setActiveTab("history");
    const groupedEntryDatesForAlt = pulledGroupedEntryIndexes
      .map((i) => logEntries[i])
      .filter((entry): entry is LogEntry => entry !== undefined)
      .flatMap((entry) =>
        Array.isArray(entry.dates) && entry.dates.length > 0
          ? entry.dates
          : entry.date
            ? [entry.date]
            : []
      );
    const altSuggestionDates = normalizeDateList(
      pulledLogDates.length > 0
        ? pulledLogDates
        : pulledLogDate
          ? [pulledLogDate]
          : groupedEntryDatesForAlt
    );
    triggerAltCategoryAnalysis(
      bullet.text,
      input.trim(),
      bullet.category,
      bullet.title,
      altSuggestionDates
    );
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

  const handleUpdateMark = (index: number, nextText: string, nextCategory?: string, nextDate?: string) => {
    const trimmedText = nextText.trim();
    if (!trimmedText) {
      return;
    }

    const currentItem = history[index];
    const previousText = currentItem?.text;
    let resolvedDate = currentItem?.date ?? "";
    if (typeof nextDate === "string") {
      if (!nextDate.trim()) {
        resolvedDate = "";
      } else {
        const parsedNextDate = new Date(nextDate);
        if (!Number.isNaN(parsedNextDate.getTime())) {
          resolvedDate = parsedNextDate.toISOString();
        }
      }
    }

    setHistory((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const trimmedCategory = nextCategory?.trim();
        return {
          ...item,
          text: trimmedText,
          date: resolvedDate,
          category: trimmedCategory ? trimmedCategory : item.category,
          markingPeriod: resolvedDate ? computeMarkingPeriod(resolvedDate, rankLevel) : "",
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

  const handleArchiveMarkingPeriod = (period: string, switchToNextPeriod = false) => {
    const normalizedPeriod = normalizeMarkingPeriodLabel(period.trim());
    if (!normalizedPeriod) {
      return;
    }

    const resolveItemPeriod = (item: { markingPeriod?: string; date: string }) =>
      normalizeMarkingPeriodLabel(
        item.markingPeriod?.trim() ||
        (item.date ? computeMarkingPeriod(item.date, rankLevel) : "") ||
        currentMarkingPeriodOverride ||
        computeMarkingPeriod(new Date().toISOString(), rankLevel)
      );

    const marksToArchive = history.filter((item) => resolveItemPeriod(item) === normalizedPeriod);

    if (marksToArchive.length === 0) {
      return;
    }

    setArchivedMarkingPeriods((prev) => {
      const existing = prev.find((entry) => entry.period === normalizedPeriod);
      const archivedAt = new Date().toISOString();

      if (existing) {
        return prev.map((entry) =>
          entry.period === normalizedPeriod
            ? {
                ...entry,
                archivedAt,
                marks: [...marksToArchive, ...entry.marks],
              }
            : entry
        );
      }

      return [
        {
          period: normalizedPeriod,
          archivedAt,
          marks: marksToArchive,
        },
        ...prev,
      ];
    });

    setHistory((prev) =>
      prev.filter((item) => resolveItemPeriod(item) !== normalizedPeriod)
    );
    setLogEntries([]);
    setPendingLogPull(null);
    setPulledLogDate(null);
    setPulledLogDates([]);
    setPulledLogIndex(null);
    setPulledLogEntryId(null);
    setPulledGroupedEntryIndexes([]);
    setBullet(null);
    setEditingIndex(null);

    if (switchToNextPeriod) {
      const nextPeriod = getNextMarkingPeriod(normalizedPeriod, rankLevel);
      const nextParts = nextPeriod.split(MARKING_PERIOD_SEPARATOR);
      if (nextParts.length === 2) {
        setMpPeriodStart(nextParts[0]);
        setMpPeriodEnd(nextParts[1]);
      }
      setCurrentMarkingPeriodOverride(normalizeMarkingPeriodLabel(nextPeriod));
    }

    setSettingsMessage(`Archived ${normalizedPeriod}. Daily Log entries were cleared.`);
    setActiveTab("history");
  };

  const handleSwitchToNextPeriod = (period: string) => {
    const normalizedPeriod = normalizeMarkingPeriodLabel(period.trim());
    if (!normalizedPeriod) return;
    const nextPeriod = getNextMarkingPeriod(normalizedPeriod, rankLevel);
    const nextParts = nextPeriod.split(MARKING_PERIOD_SEPARATOR);
    if (nextParts.length === 2) {
      setMpPeriodStart(nextParts[0]);
      setMpPeriodEnd(nextParts[1]);
    }
    setCurrentMarkingPeriodOverride(normalizeMarkingPeriodLabel(nextPeriod));
  };

  const handleRevertMarkingPeriod = () => {
    setCurrentMarkingPeriodOverride("");
    setMpPeriodStart("");
    setMpPeriodEnd("");
  };

  const handleExportBackup = () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      history,
      archivedMarkingPeriods,
      settings: {
        rankLevel,
        rating,
        userName,
        userUnit,
        bulletStyle,
        aiGeneratorEnabled,
        aiGeneratorSplitRecommendationsEnabled,
        aiGeneratorAlternateDraftsEnabled,
        aiLogImportEnabled,
        aiDashboardInsightsEnabled,
        aiMarksPackageEnabled,
        darkModeEnabled,
        tacticalColorSchemeEnabled,
        highContrastEnabled,
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
          aiGeneratorSplitRecommendationsEnabled?: boolean;
          aiGeneratorAlternateDraftsEnabled?: boolean;
          aiLogImportEnabled?: boolean;
          aiDashboardInsightsEnabled?: boolean;
          aiMarksPackageEnabled?: boolean;
          darkModeEnabled?: boolean;
          tacticalColorSchemeEnabled?: boolean;
          highContrastEnabled?: boolean;
        };
        archivedMarkingPeriods?: ArchivedMarkingPeriod[];
      };

      if (Array.isArray(parsed.history)) {
        if (parsed.history.length > 0 && typeof parsed.history[0] === "string") {
          setHistory((parsed.history as string[]).map((t) => ({ text: t, date: "" })));
        } else {
          setHistory(parsed.history as HistoryItem[]);
        }
      }

      if (Array.isArray(parsed.archivedMarkingPeriods)) {
        setArchivedMarkingPeriods(
          parsed.archivedMarkingPeriods.filter(
            (entry): entry is ArchivedMarkingPeriod =>
              !!entry &&
              typeof entry === "object" &&
              typeof entry.period === "string" &&
              Array.isArray(entry.marks)
          )
        );
      }

      if (parsed.settings) {
        if (parsed.settings.rankLevel) setRankLevel(parsed.settings.rankLevel);
        if (parsed.settings.rating) setRating(parsed.settings.rating);
        if (parsed.settings.userName !== undefined) setUserName(parsed.settings.userName);
        if (parsed.settings.userUnit !== undefined) setUserUnit(parsed.settings.userUnit);
        if (parsed.settings.bulletStyle) setBulletStyle(parsed.settings.bulletStyle);
        if (typeof parsed.settings.aiGeneratorEnabled === "boolean") setAiGeneratorEnabled(parsed.settings.aiGeneratorEnabled);
        if (typeof parsed.settings.aiGeneratorSplitRecommendationsEnabled === "boolean") {
          setAiGeneratorSplitRecommendationsEnabled(parsed.settings.aiGeneratorSplitRecommendationsEnabled);
        } else if (typeof parsed.settings.aiGeneratorEnabled === "boolean") {
          setAiGeneratorSplitRecommendationsEnabled(parsed.settings.aiGeneratorEnabled);
        }
        if (typeof parsed.settings.aiGeneratorAlternateDraftsEnabled === "boolean") {
          setAiGeneratorAlternateDraftsEnabled(parsed.settings.aiGeneratorAlternateDraftsEnabled);
        } else if (typeof parsed.settings.aiGeneratorEnabled === "boolean") {
          setAiGeneratorAlternateDraftsEnabled(parsed.settings.aiGeneratorEnabled);
        }
        if (typeof parsed.settings.aiLogImportEnabled === "boolean") setAiLogImportEnabled(parsed.settings.aiLogImportEnabled);
        if (typeof parsed.settings.aiDashboardInsightsEnabled === "boolean") setAiDashboardInsightsEnabled(parsed.settings.aiDashboardInsightsEnabled);
        if (typeof parsed.settings.aiMarksPackageEnabled === "boolean") setAiMarksPackageEnabled(parsed.settings.aiMarksPackageEnabled);
        if (typeof parsed.settings.darkModeEnabled === "boolean") setDarkModeEnabled(parsed.settings.darkModeEnabled);
        if (typeof parsed.settings.tacticalColorSchemeEnabled === "boolean") setTacticalColorSchemeEnabled(parsed.settings.tacticalColorSchemeEnabled);
        if (typeof parsed.settings.highContrastEnabled === "boolean") setHighContrastEnabled(parsed.settings.highContrastEnabled);
      }

      setSettingsMessage("Backup imported.");
      setActiveTab("settings");
    } catch {
      setSettingsMessage("Import failed. Please choose a valid backup JSON file.");
    }
  };

  const handleImportArchivedMarks = (period: string, markIndexes?: number[]) => {
    const archive = archivedMarkingPeriods.find((entry) => entry.period === period);
    if (!archive) {
      setSettingsMessage("Choose an archived marking period to import.");
      return;
    }

    const selectedMarks =
      Array.isArray(markIndexes) && markIndexes.length > 0
        ? archive.marks.filter((_, index) => markIndexes.includes(index))
        : archive.marks;

    if (selectedMarks.length === 0) {
      setSettingsMessage("Select at least one archived mark to import.");
      return;
    }

    let importedCount = 0;
    setHistory((prev) => {
      const existingKeys = new Set(
        prev.map((item) => `${item.text}__${item.date}__${item.category ?? ""}`)
      );
      const restoredMarks = selectedMarks.filter((item) => {
        const key = `${item.text}__${item.date}__${item.category ?? ""}`;
        if (existingKeys.has(key)) {
          return false;
        }
        existingKeys.add(key);
        return true;
      });

      importedCount = restoredMarks.length;
      return [...restoredMarks, ...prev];
    });

    if (importedCount === 0) {
      setSettingsMessage(`All selected marks from ${period} are already in Official Marks.`);
      return;
    }

    setSettingsMessage(`Imported ${importedCount} archived mark${importedCount === 1 ? "" : "s"} from ${period}.`);
  };

  const handleDeleteArchivedMarkingPeriod = (period: string) => {
    const normalizedPeriod = period.trim();
    if (!normalizedPeriod) {
      return;
    }

    const existingArchive = archivedMarkingPeriods.find((entry) => entry.period === normalizedPeriod);
    if (!existingArchive) {
      setSettingsMessage("Archived marking period not found.");
      return;
    }

    setArchivedMarkingPeriods((prev) => prev.filter((entry) => entry.period !== normalizedPeriod));
    setSettingsMessage(`Deleted archived marking period ${normalizedPeriod}.`);
  };

  const handleDeleteMarkingPeriod = (period: string) => {
    const normalizedPeriod = normalizeMarkingPeriodLabel(period.trim());
    if (!normalizedPeriod) {
      return;
    }

    const resolveItemPeriodDelete = (item: { markingPeriod?: string; date: string }) =>
      normalizeMarkingPeriodLabel(
        item.markingPeriod?.trim() ||
        (item.date ? computeMarkingPeriod(item.date, rankLevel) : "") ||
        currentMarkingPeriodOverride ||
        computeMarkingPeriod(new Date().toISOString(), rankLevel)
      );

    const marksInPeriod = history.filter((item) => resolveItemPeriodDelete(item) === normalizedPeriod);

    if (marksInPeriod.length === 0) {
      return;
    }

    setHistory((prev) => prev.filter((item) => resolveItemPeriodDelete(item) !== normalizedPeriod));
    setSettingsMessage(`Deleted ${marksInPeriod.length} mark${marksInPeriod.length === 1 ? "" : "s"} from ${normalizedPeriod}.`);
    setActiveTab("history");
  };

  const handleClearAllBullets = () => {
    const confirmed = window.confirm("Clear all saved bullets from history? This cannot be undone.");
    if (!confirmed) return;
    setHistory([]);
    setArchivedMarkingPeriods([]);
    setSuggestions({});
    setBullet(null);
    setEditingIndex(null);
    setSettingsMessage("All bullets cleared.");
  };

  const handleUploadGuidancePdf = async (file: File, ranks: string[]) => {
    if (!file) {
      setSettingsMessage("Choose a PDF file to upload.");
      return;
    }

    if (file.size > MAX_GUIDANCE_UPLOAD_BYTES) {
      const maxMb = Math.round(MAX_GUIDANCE_UPLOAD_BYTES / (1024 * 1024));
      const errorMessage = `Guidance PDF must be ${maxMb} MB or smaller for deployed uploads.`;
      setSettingsMessage(errorMessage);
      setGuidanceUploadStatus({
        fileName: file.name,
        status: "failed",
        detail: errorMessage,
      });
      return;
    }

    if (!ranks.length) {
      setSettingsMessage("Select at least one rank before uploading guidance.");
      return;
    }

    setGuidanceUploadBusy(true);
    setGuidanceUploadStatus({
      fileName: file.name,
      status: "uploading",
      detail: "Uploading and indexing...",
    });
    setSettingsMessage("Uploading guidance PDF and indexing sections...");

    try {
      const fileBuffer = await file.arrayBuffer();
      const fileBase64 = btoa(
        Array.from(new Uint8Array(fileBuffer), (byte) => String.fromCharCode(byte)).join("")
      );

      const response = await fetch("/api/admin/upload-official-guidance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          fileBase64,
          source: "Official Marking Guide",
          ranks,
        }),
      });

      const { data, nonJsonText } = await getApiPayload<{
        error?: string;
        message?: string;
        chunks?: number;
        outputFile?: string;
        uploadHistory?: GuidanceUploadHistoryEntry[];
      }>(response);
      const payload = data ?? {};

      if (!response.ok) {
        const details = payload.error || nonJsonText || `HTTP ${response.status}`;
        throw new Error(`Upload failed. ${details}`);
      }

      const suffix = typeof payload.chunks === "number" ? ` (${payload.chunks} chunks)` : "";
      setSettingsMessage(`${payload.message || "Guidance uploaded."}${suffix}`);
      setGuidanceUploadStatus({
        fileName: payload.outputFile || file.name,
        status: "uploaded",
        detail: `${payload.message || "Upload complete."}${suffix}`,
      });
      const uploadHistory = Array.isArray(payload.uploadHistory) ? payload.uploadHistory : [];
      if (uploadHistory.length) {
        setGuidanceUploadHistory((prev) => [...uploadHistory, ...prev].slice(0, 100));
      } else {
        await loadGuidanceUploadHistory();
      }
      setActiveTab("settings");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to upload guidance right now.";
      setSettingsMessage(
        errorMessage
      );
      setGuidanceUploadStatus({
        fileName: file.name,
        status: "failed",
        detail: errorMessage,
      });
    } finally {
      setGuidanceUploadBusy(false);
    }
  };

  const handleDeleteGuidanceForRank = async (rank: string) => {
    if (!rank) {
      return;
    }

    const confirmed = window.confirm(`Delete official guidance for ${rank}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setGuidanceDeleteBusyRank(rank);
    setSettingsMessage(`Deleting guidance for ${rank}...`);

    try {
      const response = await fetch("/api/admin/upload-official-guidance", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rank }),
      });

      const { data, nonJsonText } = await getApiPayload<{
        error?: string;
        message?: string;
        entries?: GuidanceUploadHistoryEntry[];
      }>(response);
      const payload = data ?? {};

      if (!response.ok) {
        const details = payload.error || nonJsonText || `HTTP ${response.status}`;
        throw new Error(`Delete failed. ${details}`);
      }

      setSettingsMessage(payload.message || `Deleted guidance for ${rank}.`);
      setGuidanceUploadStatus({
        fileName: rank,
        status: "uploaded",
        detail: payload.message || `Deleted guidance for ${rank}.`,
      });

      if (Array.isArray(payload.entries)) {
        setGuidanceUploadHistory(payload.entries);
      } else {
        await loadGuidanceUploadHistory();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to delete guidance right now.";
      setSettingsMessage(errorMessage);
      setGuidanceUploadStatus({
        fileName: rank,
        status: "failed",
        detail: errorMessage,
      });
    } finally {
      setGuidanceDeleteBusyRank(null);
    }
  };

  const handlePullLogEntryToGenerator = (index: number) => {
    setPendingLogPull(index);
    setActiveTab("generator");
  };

  const handleTabChange = (tab: string) => {
    if (tab === "admin-analytics" && !canManageOfficialGuidance) {
      setActiveTab("log");
      return;
    }

    if (isGuestSession && tab === "export") {
      setActiveTab("export");
      setShowGuestExportModal(true);
      return;
    }

    setActiveTab(tab);
  };

  const handleGuestProfileComplete = () => {
    setRankLevel(guestRankLevel);
    setRating(guestRating);
    sessionStorage.setItem(GUEST_PROFILE_PROMPT_COMPLETED_KEY, "1");
    setShowGuestProfilePrompt(false);
  };

  const handleAddEmail = async () => {
    if (!authUser || authUser.isGuest) {
      return;
    }

    setEmailPromptError("");
    setEmailPromptBusy(true);
    try {
      const res = await fetch("/api/auth/add-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailPromptInput.trim() }),
      });

      const data = (await res.json()) as {
        error?: string;
        user?: SessionUser;
      };

      if (!res.ok || !data.user) {
        setEmailPromptError(data.error || "Unable to save email.");
        return;
      }

      setAuthUser(data.user);
      setEmailPromptDismissed(false);
      setEmailPromptInput("");
      setEmailPromptError("");
    } catch {
      setEmailPromptError("Unable to save email right now.");
    } finally {
      setEmailPromptBusy(false);
    }
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
      <>
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
              <label className="block text-sm font-medium text-slate-700">
                {authMode === "login" ? "Username or Email" : "Username"}
              </label>
              <input
                type="text"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
                autoComplete={authMode === "login" ? "username" : "username"}
              />
            </div>

            {authMode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Email <span className="font-normal text-slate-400">(recommended)</span>
                </label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 p-3"
                  autoComplete="email"
                />
              </div>
            )}

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

            {authMode === "login" && showForgotPassword && (
              <>
                <button
                  onClick={() => {
                    const next = !forgotPasswordOpen;
                    setForgotPasswordOpen(next);
                    setForgotPasswordError("");
                    setForgotPasswordMessage("");
                    if (next) {
                      setForgotPasswordEmail(authUsername.includes("@") ? authUsername.trim() : "");
                    }
                  }}
                  type="button"
                  className="w-full text-left text-sm font-semibold text-blue-700 hover:text-blue-800"
                >
                  Forgot Password?
                </button>
              </>
            )}

            <button
              onClick={() => void handleAuthSubmit()}
              disabled={authBusy}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authBusy ? "Please wait..." : authMode === "login" ? "Log In" : "Create Account"}
            </button>

            <button
              onClick={() => {
                const nextMode = authMode === "login" ? "signup" : "login";
                setAuthError("");
                setSignupStep(1);
                setPendingUser(null);
                setAuthEmail("");
                setShowForgotPassword(nextMode === "login");
                setForgotPasswordOpen(false);
                setForgotPasswordEmail("");
                setForgotPasswordError("");
                setForgotPasswordMessage("");
                setAuthMode(nextMode);
              }}
              className="w-full text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              {authMode === "login"
                ? "Need an account? Sign up"
                : "Already have an account? Log in"}
            </button>

            {authMode === "login" && (
              <button
                onClick={() => void handleGuestLogin()}
                disabled={authBusy}
                className="w-full text-sm font-medium text-blue-700 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue as Guest (Temporary Session)
              </button>
            )}
          </div>
        </div>
      </main>
      {forgotPasswordOpen && authMode === "login" && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Reset Password</h2>
              <button
                type="button"
                onClick={() => {
                  setForgotPasswordOpen(false);
                  setForgotPasswordError("");
                  setForgotPasswordMessage("");
                }}
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close reset password dialog"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 p-2"
                  autoComplete="email"
                />
              </div>

              <button
                onClick={() => void handleRequestPasswordResetLink()}
                disabled={forgotPasswordBusy}
                type="button"
                className="w-full rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {forgotPasswordBusy ? "Sending..." : "Send Reset Link"}
              </button>

              <p className="text-xs text-slate-600">
                Use the link in your email to open the reset page and set a new password.
              </p>

              {forgotPasswordError ? <p className="text-sm text-red-600">{forgotPasswordError}</p> : null}
              {forgotPasswordMessage ? <p className="text-sm text-green-700">{forgotPasswordMessage}</p> : null}
            </div>
          </div>
        </div>
      )}
      </>
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
      {isGuestSession ? (
        <div className="fixed inset-x-0 top-(--unclassified-bar-height) z-90 flex h-8 items-center justify-center bg-amber-200 text-center text-xs font-semibold text-amber-950 shadow-sm">
          Guest Mode: Temporary session. Data is cleared when this browser session ends.
        </div>
      ) : null}
    <main
      className={`min-h-screen flex justify-center p-3 sm:p-6 ${
        isGuestSession
          ? "pt-[calc(var(--unclassified-bar-height)+2.5rem)] sm:pt-[calc(var(--unclassified-bar-height)+3.5rem)]"
          : "pt-[calc(var(--unclassified-bar-height)+0.5rem)] sm:pt-12"
      }`}
    >
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Signed in as <span className="font-bold text-slate-900">{authUser.username}</span>
            </p>
            <p className="mt-1 text-xs font-medium text-slate-600">
              Plan: <span className="font-semibold text-slate-900">{planLabel}</span>
              {!hasPremiumAccess ? (
                <>
                  {" "}
                  • Usage today: <span className="font-semibold text-slate-900">{usageCount}/{usageLimit}</span>
                </>
              ) : null}
            </p>
            {syncFailed ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                ⚠ Data failed to sync.{" "}
                <button
                  onClick={handleRetrySave}
                  className="underline hover:text-red-800"
                >
                  Retry
                </button>
              </p>
            ) : null}
            {loadFailed ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                ⚠ Failed to load your data.{" "}
                <button
                  onClick={() => window.location.reload()}
                  className="underline hover:text-red-800"
                >
                  Reload page
                </button>
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {!isGuestSession && !hasPremiumAccess ? (
              <>
                <button
                  onClick={() => void handleUpgradeToPremium("monthly")}
                  disabled={billingBusy}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {billingBusy ? "Starting..." : "Upgrade Monthly"}
                </button>
                <button
                  onClick={() => void handleUpgradeToPremium("yearly")}
                  disabled={billingBusy}
                  className="rounded-md border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Yearly
                </button>
              </>
            ) : null}
            {!isGuestSession && hasPremiumAccess ? (
              <button
                onClick={() => void handleManageSubscription()}
                disabled={billingBusy}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Manage Subscription
              </button>
            ) : null}
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
          setActiveTab={handleTabChange}
          dashboardRecommendationCount={dashboardRecommendationCount}
          canManageOfficialGuidance={canManageOfficialGuidance}
        />

        {loadFailed ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm" role="status" aria-live="polite">
            <p className="text-sm font-semibold">Read-only safe mode is active.</p>
            <p className="mt-1 text-sm">
              One or more data sections failed to load, so saving is temporarily paused to protect your existing data.
              Reload the page to retry loading.
            </p>
          </div>
        ) : null}

        {activeTab === "generator" && (
          <>
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
              useAbbreviations={useAbbreviations}
              setUseAbbreviations={setUseAbbreviations}
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
              onLogEntryPulled={({ dates, index, groupedIndexes }) => {
                const normalizedDates = normalizeDateList(dates);
                setPulledLogDate(normalizedDates[0] ?? null);
                setPulledLogDates(normalizedDates);
                setPulledLogIndex(index);
                setPulledLogEntryId(index == null ? null : logEntries[index]?.id ?? null);
                setPulledGroupedEntryIndexes(groupedIndexes ?? []);
              }}
              pendingLogPull={pendingLogPull}
              onPendingLogPullConsumed={() => setPendingLogPull(null)}
            />
            <CategoryReferencePanel
              rankLevel={rankLevel}
              selectedCategory={category}
              onSelectCategory={setCategory}
            />
          </>
        )}

        {activeTab === "history" && (
          <HistoryPanel
            history={history}
            archivedMarkingPeriods={archivedMarkingPeriods}
            rankLevel={rankLevel}
            currentPeriodOverride={currentMarkingPeriodOverride}
            handleCopy={handleCopy}
            handleDelete={handleDelete}
            handleUpdateMark={handleUpdateMark}
            handleReprompt={handleReprompt}
            handleArchiveMarkingPeriod={handleArchiveMarkingPeriod}
            handleDeleteMarkingPeriod={handleDeleteMarkingPeriod}
            handleSwitchToNextPeriod={handleSwitchToNextPeriod}
            handleRevertMarkingPeriod={handleRevertMarkingPeriod}
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
              setCategory("");
              setInput(text.text);
              const normalizedDates = normalizeDateList(
                Array.isArray(text.dates) && text.dates.length > 0
                  ? text.dates
                  : text.date
                    ? [text.date]
                    : []
              );
              setPulledLogDate(normalizedDates[0] ?? null);
              setPulledLogDates(normalizedDates);
              setPulledLogIndex(text.index);
              setPulledLogEntryId(text.id ?? logEntries[text.index]?.id ?? null);
              setActiveTab("generator");
            }}
          />
        )}

        <div className={activeTab === "dashboard" ? "" : "hidden"}>
          <DashboardPanel
            sessionUserId={authUser?.id ?? null}
            isGuestSession={isGuestSession}
            aiEnabled={aiDashboardInsightsEnabled && !isGuestSession}
            history={history}
            suggestions={suggestions}
            rankLevel={rankLevel}
            onInsightsRecommendationCountChange={setDashboardRecommendationCount}
            onUpdateBullet={(oldText, newText) => {
              setHistory((prev) =>
                prev.map((item) =>
                  item.text === oldText
                    ? { ...item, text: newText, date: item.date || "" }
                    : item
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

                const normalizeCategoryKey = (value: string | undefined) => {
                  if (!value) return "";
                  const normalized = value.trim().toLowerCase();
                  return normalized === "customs, courtesies, and traditions"
                    ? "customs, courtesies and traditions"
                    : normalized;
                };

                const resolveItemCategory = (item: HistoryItem) =>
                  item.category || suggestions[item.text]?.category;

                const tokenSet = (value: string) =>
                  new Set(value.split(" ").filter((token) => token.length > 2));

                const computeSimilarity = (left: string, right: string) => {
                  if (!left || !right) return 0;
                  if (left === right) return 1;
                  if ((left.includes(right) || right.includes(left)) && Math.min(left.length, right.length) >= 24) {
                    return 0.9;
                  }

                  const leftTokens = tokenSet(left);
                  const rightTokens = tokenSet(right);
                  const allTokens = new Set([...leftTokens, ...rightTokens]);
                  if (allTokens.size === 0) return 0;

                  let overlap = 0;
                  for (const token of leftTokens) {
                    if (rightTokens.has(token)) overlap++;
                  }

                  return overlap / allTokens.size;
                };

                const normalizedOriginalBullets = originalBullets.map(normalizeBulletText);
                const normalizedHistory = prevHistory.map((item) => normalizeBulletText(item.text));
                const usedHistoryIndexes = new Set<number>();
                const matchedHistoryIndexes: number[] = [];

                normalizedOriginalBullets.forEach((normalizedOriginal) => {
                  if (!normalizedOriginal) return;

                  const exactIndex = normalizedHistory.findIndex(
                    (historyText, historyIndex) =>
                      !usedHistoryIndexes.has(historyIndex) && historyText === normalizedOriginal
                  );

                  if (exactIndex >= 0) {
                    usedHistoryIndexes.add(exactIndex);
                    matchedHistoryIndexes.push(exactIndex);
                    return;
                  }

                  let bestIndex = -1;
                  let bestScore = 0;
                  normalizedHistory.forEach((historyText, historyIndex) => {
                    if (usedHistoryIndexes.has(historyIndex)) return;
                    const score = computeSimilarity(normalizedOriginal, historyText);
                    if (score > bestScore) {
                      bestScore = score;
                      bestIndex = historyIndex;
                    }
                  });

                  if (bestIndex >= 0 && bestScore >= 0.82) {
                    usedHistoryIndexes.add(bestIndex);
                    matchedHistoryIndexes.push(bestIndex);
                  }
                });

                const matchedIndexSet = new Set(matchedHistoryIndexes);
                const matchedItems = matchedHistoryIndexes
                  .map((historyIndex) => prevHistory[historyIndex])
                  .filter((item): item is HistoryItem => Boolean(item));
                const sourceItem =
                  matchedItems.find(
                    (item) =>
                      normalizeBulletText(item.text) === normalizeBulletText(originalBullets[0] || "")
                  ) || matchedItems[0];
                const filtered = prevHistory.filter((_, historyIndex) => !matchedIndexSet.has(historyIndex));

                if (filtered.some((item) => item.text === consolidatedBullet)) {
                  return filtered;
                }

                const sourceDate = sourceItem?.date || "";
                const sourceMarkingPeriod =
                  sourceItem?.markingPeriod || (sourceDate ? computeMarkingPeriod(sourceDate, rankLevel) : "");
                const resolvedTitle =
                  typeof title === "string" && title.trim().length > 0
                    ? title.trim()
                    : sourceItem?.title;

                const collectedDates = Array.from(
                  new Set(
                    matchedItems.flatMap((item) => {
                      const itemDates = Array.isArray(item.dates) && item.dates.length > 0
                        ? item.dates
                        : item.date
                          ? [item.date]
                          : [];

                      return itemDates.filter((value) => {
                        if (typeof value !== "string" || !value.trim()) {
                          return false;
                        }
                        const parsed = new Date(value);
                        return !Number.isNaN(parsed.getTime());
                      });
                    })
                  )
                ).sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

                const matchedCategories = Array.from(
                  new Set(
                    matchedItems
                      .map((item) => resolveItemCategory(item))
                      .filter((itemCategory): itemCategory is string => typeof itemCategory === "string" && itemCategory.trim().length > 0)
                      .map((itemCategory) => normalizeCategoryKey(itemCategory))
                      .filter((itemCategory) => itemCategory.length > 0)
                  )
                );

                const singleMatchedCategory =
                  matchedCategories.length === 1
                    ? matchedItems
                        .map((item) => resolveItemCategory(item))
                        .find(
                          (itemCategory) =>
                            typeof itemCategory === "string" &&
                            normalizeCategoryKey(itemCategory) === matchedCategories[0]
                        )
                    : undefined;

                const finalCategory =
                  (typeof singleMatchedCategory === "string" && singleMatchedCategory.trim().length > 0
                    ? singleMatchedCategory.trim()
                    : typeof category === "string" && category.trim().length > 0
                      ? category.trim()
                      : sourceItem
                        ? resolveItemCategory(sourceItem) || "Military Bearing"
                        : "Military Bearing");

                const collectedSourceLogEntryIds = Array.from(
                  new Set(
                    matchedItems
                      .map((item) => item.sourceLogEntryId)
                      .filter(
                        (entryId): entryId is string =>
                          typeof entryId === "string" && entryId.trim().length > 0
                      )
                  )
                );

                const collectedGroupedLogEntryIds = Array.from(
                  new Set(
                    matchedItems.flatMap((item) =>
                      Array.isArray(item.sourceGroupedLogEntryIds)
                        ? item.sourceGroupedLogEntryIds.filter(
                            (entryId): entryId is string =>
                              typeof entryId === "string" && entryId.trim().length > 0
                          )
                        : []
                    )
                  )
                );

                const sourceGroupedLogEntryIds = Array.from(
                  new Set([...collectedGroupedLogEntryIds, ...collectedSourceLogEntryIds])
                );

                const sourceLogEntryId = collectedSourceLogEntryIds[0];
                const sourceLogEntryPreviousGroup =
                  sourceItem?.sourceLogEntryPreviousGroup ||
                  matchedItems.find((item) => item.sourceLogEntryPreviousGroup)?.sourceLogEntryPreviousGroup;
                const sourceGroupedLogEntryGroupName =
                  sourceItem?.sourceGroupedLogEntryGroupName ||
                  matchedItems.find((item) => item.sourceGroupedLogEntryGroupName)?.sourceGroupedLogEntryGroupName;

                const newItem = {
                  text: consolidatedBullet,
                  date: sourceDate,
                  ...(collectedDates.length > 0 ? { dates: collectedDates } : {}),
                  category: finalCategory,
                  markingPeriod: sourceMarkingPeriod,
                  title: resolvedTitle,
                  originalAction: sourceItem?.originalAction,
                  ...(sourceLogEntryId ? { sourceLogEntryId } : {}),
                  ...(sourceLogEntryPreviousGroup ? { sourceLogEntryPreviousGroup } : {}),
                  ...(sourceGroupedLogEntryIds.length > 0 ? { sourceGroupedLogEntryIds } : {}),
                  ...(sourceGroupedLogEntryGroupName ? { sourceGroupedLogEntryGroupName } : {}),
                };

                return [newItem, ...filtered];
              });
            }}
          />
        </div>

        {activeTab === "export" && (
          <ExportPanel
            history={history}
            suggestions={suggestions}
            rankLevel={rankLevel}
            isGuestSession={isGuestSession}
            isPremiumPlan={hasPremiumAccess}
            onUpgradeToPremium={() => void handleUpgradeToPremium("monthly")}
          />
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

        {activeTab === "admin-analytics" && canManageOfficialGuidance && (
          <AdminAnalyticsPanel
            guidanceUploadBusy={guidanceUploadBusy}
            guidanceUploadStatus={guidanceUploadStatus}
            guidanceDeleteBusyRank={guidanceDeleteBusyRank}
            guidanceUploadHistory={guidanceUploadHistory}
            onUploadGuidancePdf={(file, ranks) => {
              void handleUploadGuidancePdf(file, ranks);
            }}
            onDeleteGuidanceForRank={(rank) => {
              void handleDeleteGuidanceForRank(rank);
            }}
          />
        )}

        {activeTab === "settings" && (
          <SettingsPanel
            isGuestSession={isGuestSession}
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
            aiGeneratorSplitRecommendationsEnabled={aiGeneratorSplitRecommendationsEnabled}
            setAiGeneratorSplitRecommendationsEnabled={setAiGeneratorSplitRecommendationsEnabled}
            aiGeneratorAlternateDraftsEnabled={aiGeneratorAlternateDraftsEnabled}
            setAiGeneratorAlternateDraftsEnabled={setAiGeneratorAlternateDraftsEnabled}
            premiumFeaturesEnabled={hasPremiumAccess}
            onUpgradeToPremium={() => void handleUpgradeToPremium("monthly")}
            aiLogImportEnabled={aiLogImportEnabled}
            setAiLogImportEnabled={setAiLogImportEnabled}
            aiDashboardInsightsEnabled={aiDashboardInsightsEnabled}
            setAiDashboardInsightsEnabled={setAiDashboardInsightsEnabled}
            aiMarksPackageEnabled={aiMarksPackageEnabled}
            setAiMarksPackageEnabled={setAiMarksPackageEnabled}
            darkModeEnabled={darkModeEnabled}
            setDarkModeEnabled={setDarkModeEnabled}
            tacticalColorSchemeEnabled={tacticalColorSchemeEnabled}
            setTacticalColorSchemeEnabled={setTacticalColorSchemeEnabled}
            highContrastEnabled={highContrastEnabled}
            setHighContrastEnabled={setHighContrastEnabled}
            historyCount={history.length}
            archivedMarkingPeriods={archivedMarkingPeriods}
            settingsMessage={settingsMessage}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onImportArchivedMarks={handleImportArchivedMarks}
            onDeleteArchivedMarkingPeriod={handleDeleteArchivedMarkingPeriod}
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
            className={`w-full rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:text-base ${
              activeTab === "settings"
                ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                : darkModeEnabled
                  ? "border-slate-300 bg-slate-50 text-(--text-strong) hover:border-blue-300 hover:bg-blue-50"
                  : "border-slate-300 bg-slate-50 text-white hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            Settings
          </button>
        </div>

        {showBottomScrollButton && (
          <button
            type="button"
            onClick={handleScrollToBottom}
            aria-label="Scroll to bottom"
            className={`fixed right-4 bottom-4 z-40 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 sm:right-6 sm:bottom-6 ${bottomScrollButtonClass}`}
          >
            Bottom
          </button>
        )}
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
                  setManualAltCategory("");
                }}
                className="shrink-0 text-gray-400 hover:text-gray-700 text-lg leading-none"
                aria-label="Dismiss"
              >
                X
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {[
                ...altCategorySuggestion.categories,
                ...Object.keys(altCategoryDrafts)
                  .filter((name) => !altCategorySuggestion.categories.some((category) => category.name === name))
                  .map((name) => ({ name, reason: "Manually selected category." })),
              ].map(({ name, reason }) => {
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
                      <div className="generated-bullet-preview mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="generated-bullet-preview-text text-sm font-semibold text-gray-900">{generatedText}</p>
                        {draftEntry?.guidanceSections && draftEntry.guidanceSections.length > 0 && (
                          <div className="generated-bullet-reference mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2">
                            {draftEntry.guidanceSections.map((section, i) => (
                              <p key={i} className="generated-bullet-reference-text text-xs text-emerald-800">{section}</p>
                            ))}
                          </div>
                        )}
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

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Pick a Different Category</p>
                <p className="mt-1 text-xs text-gray-600">
                  If you do not like the suggested alternatives, choose any official category and generate a mark.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    ref={manualAltCategorySelectRef}
                    value={manualAltCategory}
                    onChange={(event) => setManualAltCategory(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 sm:flex-1"
                  >
                    <option value="">Choose category...</option>
                    {OFFICIAL_MARK_CATEGORIES
                      .filter((categoryName) => categoryName !== altCategorySuggestion.primaryCategory)
                      .map((categoryName) => (
                        <option key={categoryName} value={categoryName}>
                          {categoryName}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!manualAltCategory || (altCategoryDrafts[manualAltCategory]?.generating ?? false)}
                    onClick={() => {
                      if (!manualAltCategory) {
                        return;
                      }
                      void handleGenerateAltCategoryDraft(manualAltCategory);
                    }}
                    className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {manualAltCategory && altCategoryDrafts[manualAltCategory]?.generating ? "Generating..." : "Generate Selected Category"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAltCategorySuggestion(null);
                  setAltCategoryDrafts({});
                  setManualAltCategory("");
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

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {isGuestSession ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Guest mode: nothing will be saved outside this browser session.
                </p>
              ) : (
                <div />
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
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
        </div>
      )}

      {showGuestExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Export Unavailable in Guest Mode</h3>
            <p className="mt-3 text-sm text-gray-700">
              Exporting marks is unavailable in Guest mode. Create an account to continue.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowGuestExportModal(false)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgradeModal && !showNoticeModal && !showGuestProfilePrompt && !showTutorialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Upgrade to Premium</h3>
            <p className="mt-3 text-sm text-gray-700">{upgradeModalMessage}</p>
            <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Not now
              </button>
              {!isGuestSession && (
                <button
                  onClick={() => void handleUpgradeToPremium("monthly")}
                  disabled={billingBusy}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {billingBusy ? "Starting..." : "Upgrade Monthly"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showGuestProfilePrompt && isGuestSession && !showNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl sm:p-8">
            <h3 className="text-xl font-bold text-slate-900">Guest Setup</h3>
            <p className="mt-2 text-sm text-slate-600">
              Before continuing, select your rank and rate for this guest session.
            </p>
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Advanced AI analysis and categorization are available only with a full account.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Rank</label>
                <select
                  value={guestRankLevel}
                  onChange={(e) => setGuestRankLevel(e.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 p-3"
                >
                  {["E2", "E3", "E4", "E5", "E6", "E7"].map((rankOption) => (
                    <option key={rankOption} value={rankOption}>
                      {rankOption}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Rate</label>
                <select
                  value={guestRating}
                  onChange={(e) => setGuestRating(e.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 p-3"
                >
                  {[
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
                  ].map((rateOption) => (
                    <option key={rateOption} value={rateOption}>
                      {rateOption}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleGuestProfileComplete}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddEmailPrompt && !showNoticeModal && !showGuestProfilePrompt && !showTutorialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl sm:p-8">
            <h3 className="text-xl font-bold text-slate-900">Add Account Email</h3>
            <p className="mt-2 text-sm text-slate-600">
              Add an email so you can recover your account if you forget your password.
            </p>

            <div className="mt-5">
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={emailPromptInput}
                onChange={(e) => setEmailPromptInput(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
                autoComplete="email"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleAddEmail();
                  }
                }}
              />
              {emailPromptError ? (
                <p className="mt-2 text-sm text-red-600">{emailPromptError}</p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEmailPromptDismissed(true)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Not Now
              </button>
              <button
                type="button"
                onClick={() => void handleAddEmail()}
                disabled={emailPromptBusy}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {emailPromptBusy ? "Saving..." : "Save Email"}
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