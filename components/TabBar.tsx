type TabBarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dashboardRecommendationCount?: number;
  canManageOfficialGuidance?: boolean;
};

export default function TabBar({
  activeTab,
  setActiveTab,
  dashboardRecommendationCount = 0,
  canManageOfficialGuidance = false,
}: TabBarProps) {
  const tabBaseClass =
    "min-w-[48%] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:text-base";
  const activeTabClass =
    "border-(--color-primary) bg-(--color-primary) text-white shadow-md";

  const getTabClass = (tabKey: string) => {
    return `${tabBaseClass} ${
      activeTab === tabKey
        ? activeTabClass
        : "border-(--border-muted) bg-(--surface-1) text-(--color-primary) hover:bg-(--surface-2)"
    }`;
  };

  return (
    <div
      className="app-tabbar sticky top-(--tab-bar-top-offset) z-20 flex flex-wrap gap-2 rounded-xl border border-(--border-muted) p-2 shadow-lg backdrop-blur"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-secondary-soft) 82%, var(--surface-3))",
        backgroundImage:
          "linear-gradient(135deg, color-mix(in srgb, var(--color-secondary-soft) 72%, var(--surface-3)) 0%, color-mix(in srgb, var(--color-secondary-soft) 88%, var(--surface-3)) 100%)",
      }}
    >
      <button
        onClick={() => setActiveTab("log")}
        className={`app-tab ${getTabClass("log")}`}
      >
        Daily Log
      </button>

      <button
        onClick={() => setActiveTab("generator")}
        className={`app-tab ${getTabClass("generator")}`}
      >
        Generator
      </button>

      <button
        onClick={() => setActiveTab("history")}
        className={`app-tab ${getTabClass("history")}`}
      >
        Official Marks
      </button>

      <button
        onClick={() => setActiveTab("dashboard")}
        className={`app-tab ${getTabClass("dashboard")} overflow-hidden`}
      >
        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5">
          Dashboard
          {dashboardRecommendationCount > 0 && (
            <span
              className={`dashboard-notification-bubble inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                activeTab === "dashboard"
                  ? "bg-(--color-primary) text-(--color-text-on-strong)"
                  : "bg-(--color-danger) text-(--color-text-on-strong)"
              }`}
              aria-label={`${dashboardRecommendationCount} dashboard recommendations`}
            >
              {dashboardRecommendationCount}
            </span>
          )}
        </span>
      </button>

      <button
        onClick={() => setActiveTab("export")}
        className={`app-tab ${getTabClass("export")}`}
      >
        Export Marks
      </button>

      <button
        onClick={() => setActiveTab("marks-package")}
        className={`app-tab ${getTabClass("marks-package")}`}
      >
        Marks Package Builder
      </button>

      {canManageOfficialGuidance && (
        <button
          onClick={() => setActiveTab("admin-analytics")}
          className={`app-tab ${getTabClass("admin-analytics")}`}
        >
          Admin Analytics
        </button>
      )}
    </div>
  );
}