type TabBarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dashboardRecommendationCount?: number;
};

export default function TabBar({
  activeTab,
  setActiveTab,
  dashboardRecommendationCount = 0,
}: TabBarProps) {
  const tabBaseClass =
    "min-w-[48%] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:text-base";
  const getTabClass = (tabKey: string) =>
    `${tabBaseClass} ${
      activeTab === tabKey
        ? "border-blue-700 bg-blue-700 text-white shadow-sm"
        : "border-slate-300 bg-slate-50 text-slate-800 hover:border-blue-300 hover:bg-blue-50"
    }`;

  return (
    <div className="sticky top-(--tab-bar-top-offset) z-20 flex flex-wrap gap-2 rounded-xl border border-slate-300 bg-white/95 p-2 shadow-lg backdrop-blur supports-backdrop-filter:bg-white/80">
      <button
        onClick={() => setActiveTab("log")}
        className={getTabClass("log")}
      >
        Daily Log
      </button>

      <button
        onClick={() => setActiveTab("generator")}
        className={getTabClass("generator")}
      >
        Generator
      </button>

      <button
        onClick={() => setActiveTab("history")}
        className={getTabClass("history")}
      >
        Official Marks
      </button>

      <button
        onClick={() => setActiveTab("dashboard")}
        className={`${getTabClass("dashboard")} overflow-hidden`}
      >
        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5">
          Dashboard
          {dashboardRecommendationCount > 0 && (
            <span
              className={`dashboard-notification-bubble inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                activeTab === "dashboard"
                  ? "bg-white text-blue-700"
                  : "bg-red-500 text-white"
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
        className={getTabClass("export")}
      >
        Export Marks
      </button>

      <button
        onClick={() => setActiveTab("marks-package")}
        className={getTabClass("marks-package")}
      >
        Marks Package Builder
      </button>
    </div>
  );
}