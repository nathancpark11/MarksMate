import { type ReactNode, useEffect, useRef, useState } from "react";

type TabBarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dashboardRecommendationCount?: number;
  canManageOfficialGuidance?: boolean;
  hasPremiumAccess?: boolean;
  userMenu?: ReactNode;
  stickyTopPx?: number;
  fixedOnBottomOnMobile?: boolean;
};

export default function TabBar({
  activeTab,
  setActiveTab,
  dashboardRecommendationCount = 0,
  canManageOfficialGuidance = false,
  hasPremiumAccess = false,
  userMenu,
  stickyTopPx = 32,
  fixedOnBottomOnMobile = false,
}: TabBarProps) {
  const tabBaseClass =
    "inline-flex flex-1 min-h-[4rem] items-center justify-center border-b-2 border-transparent px-1.5 py-3 text-center text-xs font-semibold transition-all sm:flex-none sm:min-h-0 sm:px-4 sm:py-3 sm:text-sm sm:font-medium hover:text-(--color-primary-hover)";
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const inactiveTabClass = isMobileViewport
    ? isDarkMode
      ? "border-b-transparent text-(--text-soft) hover:text-(--color-primary)"
      : "border-b-transparent text-white hover:text-white"
    : "app-tab-inactive border-b-transparent text-(--text-soft) hover:text-(--color-primary)";
  const activeTabClass = isMobileViewport
    ? isDarkMode
      ? "!text-(--color-primary) !font-bold !rounded-none !bg-(--surface-2) !border-b-0 !border-t-[3px] !border-t-(--color-primary)"
      : "!text-white !font-bold !rounded-none !bg-white/35 !border-b-0 !border-t-[3px] !border-t-white !shadow-[inset_0_3px_0_rgba(255,255,255,1),0_0_12px_rgba(255,255,255,0.2)]"
    : "app-tab-active border-b-transparent text-(--color-primary) font-semibold";
  const isCompactMobileLabels = isMobileViewport;
  const shouldPin = fixedOnBottomOnMobile ? isMobileViewport || isPinned : isPinned;
  const isMoreTabActive = activeTab === "export" || activeTab === "marks-package" || (canManageOfficialGuidance && activeTab === "admin-analytics");

  useEffect(() => {
    const syncDarkMode = () => {
      setIsDarkMode(document.documentElement.getAttribute("data-theme") === "dark");
    };
    syncDarkMode();
    const observer = new MutationObserver(syncDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!fixedOnBottomOnMobile) {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const syncViewport = (event?: MediaQueryListEvent) => {
      setIsMobileViewport(event ? event.matches : mediaQuery.matches);
    };

    syncViewport();

    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, [fixedOnBottomOnMobile]);

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!moreMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !moreMenuRef.current.contains(target)) {
        setIsMoreMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!isMobileViewport && isMoreMenuOpen) {
      setIsMoreMenuOpen(false);
    }
  }, [isMobileViewport, isMoreMenuOpen]);

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

  const handleMoreTabSelection = (tabKey: string) => {
    setActiveTab(tabKey);
    setIsMoreMenuOpen(false);
  };

  return (
    <div
      ref={wrapperRef}
      style={shouldPin && tabBarHeight > 0 ? { height: `${tabBarHeight}px` } : undefined}
    >
      <div
        ref={containerRef}
        className={`app-tabbar ${
          shouldPin
            ? fixedOnBottomOnMobile
              ? "fixed inset-x-0 bottom-0 z-80 sm:bottom-auto"
              : "fixed left-0 right-0 z-80"
            : "relative z-30"
        } flex items-center justify-around gap-1 sm:justify-between sm:gap-2 sm:py-0 border-b border-(--border-muted) bg-(--surface-1) px-1 sm:px-3 ${
          fixedOnBottomOnMobile && shouldPin
            ? "border-t border-gray-200 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] shadow-sm sm:border-t-0 sm:pb-0 sm:shadow-none"
            : ""
        }`}
        style={{
          ...(shouldPin
            ? fixedOnBottomOnMobile
              ? isMobileViewport
                ? { top: undefined, bottom: "0px" }
                : { top: `${stickyTopPx}px`, bottom: undefined }
              : { top: `${stickyTopPx}px` }
            : {}),
          ...(isMobileViewport
            ? isDarkMode
              ? {
                  borderColor: "var(--border-muted)",
                  boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.45), 0 -1px 4px rgba(0, 0, 0, 0.3)",
                }
              : {
                  backgroundColor: "#0b3d91",
                  borderColor: "#082f73",
                  boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.45), 0 -1px 4px rgba(0, 0, 0, 0.3)",
                }
            : {}),
        }}
      >
      <div className="app-tab-row flex min-w-0 flex-1 items-stretch sm:items-center justify-around gap-0 overflow-x-auto sm:justify-center sm:overflow-x-auto whitespace-nowrap sm:pr-1">
        <button
          onClick={() => setActiveTab("log")}
          className={`app-tab sm:flex-none ${getTabClass("log")}`}
        >
          {isCompactMobileLabels ? "Daily" : "Daily Log"}
        </button>

        <button
          onClick={() => setActiveTab("generator")}
          className={`app-tab sm:flex-none ${getTabClass("generator")}`}
        >
          {isCompactMobileLabels ? "Generate" : "Generator"}
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`app-tab sm:flex-none ${getTabClass("history")}`}
        >
          {isCompactMobileLabels ? "Marks" : "Official Marks"}
        </button>

        <button
          onClick={() => setActiveTab("dashboard")}
          className={`app-tab sm:flex-none ${getTabClass("dashboard")} overflow-hidden`}
        >
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-1.5">
            Dashboard
            {dashboardRecommendationCount > 0 && (
              <span
                className="dashboard-notification-bubble inline-flex min-w-4 sm:min-w-5 shrink-0 items-center justify-center rounded-full px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold leading-none bg-(--color-danger) text-(--color-text-on-strong)"
                aria-label={`${dashboardRecommendationCount} dashboard recommendations`}
              >
                {dashboardRecommendationCount}
              </span>
            )}
          </span>
        </button>

        {isMobileViewport && (
          <div ref={moreMenuRef} className="relative flex-1 flex items-stretch">
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              aria-expanded={isMoreMenuOpen}
              className={`app-tab flex-1 flex! items-center! justify-center! ${getTabClass(isMoreTabActive ? activeTab : "__mobile-more")}`}
            >
              More
            </button>
            {isMoreMenuOpen && (
              <div
                className="fixed right-1 sm:right-3 flex min-w-44 flex-col overflow-hidden rounded-lg border border-(--border-muted) bg-(--surface-1) shadow-lg z-100"
                style={
                  shouldPin && fixedOnBottomOnMobile && isMobileViewport
                    ? { bottom: `${tabBarHeight + 8}px` }
                    : { top: `${tabBarHeight + 100}px` }
                }
              >
                <button
                  type="button"
                  onClick={() => handleMoreTabSelection("export")}
                  className={`px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "export"
                      ? "bg-(--surface-3) font-semibold text-(--color-primary)"
                      : "text-(--text-soft) hover:bg-(--surface-2) hover:text-(--color-primary)"
                  }`}
                >
                  Export Marks
                </button>
                {hasPremiumAccess && (
                  <button
                    type="button"
                    onClick={() => handleMoreTabSelection("marks-package")}
                    className={`px-4 py-3 text-left text-sm transition-colors ${
                      activeTab === "marks-package"
                        ? "bg-(--surface-3) font-semibold text-(--color-primary)"
                        : "text-(--text-soft) hover:bg-(--surface-2) hover:text-(--color-primary)"
                    }`}
                  >
                    Marks Package Builder
                  </button>
                )}
                {canManageOfficialGuidance && (
                  <button
                    type="button"
                    onClick={() => handleMoreTabSelection("admin-analytics")}
                    className={`px-4 py-3 text-left text-sm transition-colors ${
                      activeTab === "admin-analytics"
                        ? "bg-(--surface-3) font-semibold text-(--color-primary)"
                        : "text-(--text-soft) hover:bg-(--surface-2) hover:text-(--color-primary)"
                    }`}
                  >
                    Admin Analytics
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!isMobileViewport ? (
          <>
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
          </>
        ) : null}

        {!isMobileViewport && canManageOfficialGuidance && (
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
