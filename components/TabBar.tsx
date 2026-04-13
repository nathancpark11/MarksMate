import { useEffect, useRef } from "react";

type TabBarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dashboardRecommendationCount?: number;
  canManageOfficialGuidance?: boolean;
  hasPremiumAccess?: boolean;
};

export default function TabBar({
  activeTab,
  setActiveTab,
  dashboardRecommendationCount = 0,
  canManageOfficialGuidance = false,
  hasPremiumAccess = false,
}: TabBarProps) {
  const tabBaseClass =
    "min-w-[48%] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:text-base";
  const activeTabClass =
    "border-(--color-primary) bg-(--color-primary) text-white shadow-md";
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const syncHeight = () => {
      document.documentElement.style.setProperty("--tab-bar-height", `${element.offsetHeight}px`);
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--tab-bar-height", "0px");
    };
  }, []);

  const getTabClass = (tabKey: string) => {
    return `${tabBaseClass} ${
      activeTab === tabKey
        ? activeTabClass
        : "border-(--border-muted) bg-(--surface-1) text-(--color-primary) hover:bg-(--surface-2)"
    }`;
  };

  return (
    <div
      ref={containerRef}
      className="app-tabbar fixed left-1/2 z-80 flex -translate-x-1/2 flex-wrap gap-2 rounded-xl border border-(--border-muted) p-2 shadow-lg backdrop-blur"
      style={{
        top: "var(--tab-bar-top-offset)",
        width: "calc(100% - 0.5rem)",
        maxWidth: "calc(100vw - 0.5rem)",
        backgroundColor: "color-mix(in srgb, var(--color-secondary-soft) 58%, transparent)",
        backgroundImage:
          "linear-gradient(135deg, color-mix(in srgb, var(--color-secondary-soft) 52%, transparent) 0%, color-mix(in srgb, var(--surface-3) 40%, transparent) 100%)",
        backdropFilter: "saturate(130%) blur(10px)",
        WebkitBackdropFilter: "saturate(130%) blur(10px)",
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
              className="dashboard-notification-bubble inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none bg-(--color-danger) text-(--color-text-on-strong)"
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

      {hasPremiumAccess && (
        <button
          onClick={() => setActiveTab("marks-package")}
          className={`app-tab ${getTabClass("marks-package")}`}
        >
          Marks Package Builder
        </button>
      )}

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