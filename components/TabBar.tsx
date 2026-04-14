import { type ReactNode, useEffect, useRef, useState } from "react";

type TabBarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dashboardRecommendationCount?: number;
  canManageOfficialGuidance?: boolean;
  hasPremiumAccess?: boolean;
  userMenu?: ReactNode;
  stickyTopPx?: number;
};

export default function TabBar({
  activeTab,
  setActiveTab,
  dashboardRecommendationCount = 0,
  canManageOfficialGuidance = false,
  hasPremiumAccess = false,
  userMenu,
  stickyTopPx = 32,
}: TabBarProps) {
  const tabBaseClass =
    "inline-flex items-center justify-center border-b-2 border-transparent px-3 py-3 text-center text-sm font-medium transition-all sm:px-4 text-(--color-primary) hover:text-(--color-primary-hover)";
  const activeTabClass =
    "app-tab-active border-b-transparent text-(--color-primary) font-semibold";
  const inactiveTabClass =
    "app-tab-inactive border-b-transparent text-(--text-soft) hover:text-(--color-primary)";
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [tabBarHeight, setTabBarHeight] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const syncHeight = () => {
      const nextHeight = element.offsetHeight;
      setTabBarHeight(nextHeight);
      document.documentElement.style.setProperty("--tab-bar-height", `${nextHeight}px`);
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

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const updatePinnedState = () => {
      const wrapperTop = wrapper.getBoundingClientRect().top + window.scrollY;
      const shouldPin = window.scrollY + stickyTopPx >= wrapperTop;
      setIsPinned((prev) => (prev === shouldPin ? prev : shouldPin));
    };

    updatePinnedState();
    window.addEventListener("scroll", updatePinnedState, { passive: true });
    window.addEventListener("resize", updatePinnedState);

    return () => {
      window.removeEventListener("scroll", updatePinnedState);
      window.removeEventListener("resize", updatePinnedState);
    };
  }, [stickyTopPx]);

  const getTabClass = (tabKey: string) => {
    return `${tabBaseClass} ${
      activeTab === tabKey
        ? activeTabClass
        : inactiveTabClass
    }`;
  };

  return (
    <div
      ref={wrapperRef}
      style={isPinned && tabBarHeight > 0 ? { height: `${tabBarHeight}px` } : undefined}
    >
      <div
        ref={containerRef}
        className={`app-tabbar ${
          isPinned
            ? "fixed left-0 right-0 z-80"
            : "relative z-30"
        } flex items-center justify-between gap-2 border-b border-(--border-muted) bg-(--surface-1) px-2 sm:px-3`}
        style={isPinned ? { top: `${stickyTopPx}px` } : undefined}
      >
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0 overflow-x-auto whitespace-nowrap pr-1">
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

      {userMenu ? <div className="flex shrink-0 items-center">{userMenu}</div> : null}
      </div>
    </div>
  );
}
