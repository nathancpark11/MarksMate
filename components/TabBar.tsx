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
  return (
    <div className="sticky top-(--tab-bar-top-offset) z-20 flex flex-wrap gap-2 rounded-xl bg-white/95 p-2 shadow-md backdrop-blur supports-backdrop-filter:bg-white/80 sm:top-6">
      <button
        onClick={() => setActiveTab("log")}
        className={`min-w-[48%] flex-1 rounded-md px-3 py-2 text-sm sm:min-w-0 sm:text-base ${
          activeTab === "log"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        Daily Log
      </button>

      <button
        onClick={() => setActiveTab("generator")}
        className={`min-w-[48%] flex-1 rounded-md px-3 py-2 text-sm sm:min-w-0 sm:text-base ${
          activeTab === "generator"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        Generator
      </button>

      <button
        onClick={() => setActiveTab("history")}
        className={`min-w-[48%] flex-1 rounded-md px-3 py-2 text-sm sm:min-w-0 sm:text-base ${
          activeTab === "history"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        Official Marks
      </button>

      <button
        onClick={() => setActiveTab("dashboard")}
        className={`min-w-[48%] flex-1 overflow-hidden rounded-md px-3 py-2 text-sm sm:min-w-0 sm:text-base ${
          activeTab === "dashboard"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5">
          Dashboard
          {dashboardRecommendationCount > 0 && (
            <span
              className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
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
        className={`min-w-[48%] flex-1 rounded-md px-3 py-2 text-sm sm:min-w-0 sm:text-base ${
          activeTab === "export"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        Export Marks
      </button>

      <button
        onClick={() => setActiveTab("marks-package")}
        className={`min-w-[48%] flex-1 rounded-md px-3 py-2 text-sm sm:min-w-0 sm:text-base ${
          activeTab === "marks-package"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        Marks Package Builder
      </button>
    </div>
  );
}