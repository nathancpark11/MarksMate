import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type HistoryItem = { text: string; date: string; dates?: string[]; category?: string; markingPeriod?: string; title?: string };
type ArchivedMarkingPeriod = { period: string; archivedAt: string; marks: HistoryItem[] };

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

type HistoryPanelProps = {
  history: HistoryItem[];
  archivedMarkingPeriods: ArchivedMarkingPeriod[];
  rankLevel: string;
  currentPeriodOverride?: string;
  handleCopy: (text: string) => void;
  handleDelete: (index: number) => void;
  handleUpdateMark: (index: number, nextText: string, nextCategory?: string, nextDate?: string) => void;
  handleReprompt: (index: number) => void;
  handleArchiveMarkingPeriod: (period: string, switchToNextPeriod?: boolean) => void;
  handleDeleteMarkingPeriod: (period: string) => void;
  handleSwitchToNextPeriod: (period: string) => void;
  handleRevertMarkingPeriod: () => void;
};

export default function HistoryPanel({
  history,
  archivedMarkingPeriods,
  rankLevel,
  currentPeriodOverride,
  handleCopy,
  handleDelete,
  handleUpdateMark,
  handleReprompt,
  handleArchiveMarkingPeriod,
  handleDeleteMarkingPeriod,
  handleSwitchToNextPeriod,
  handleRevertMarkingPeriod,
}: HistoryPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedPeriods, setExpandedPeriods] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [periodCategoryFilters, setPeriodCategoryFilters] = useState<Record<string, string[]>>({});
  const [editableMarks, setEditableMarks] = useState<Record<number, string>>({});
  const [editableCategories, setEditableCategories] = useState<Record<number, string>>({});
  const [editableDates, setEditableDates] = useState<Record<number, string>>({});
  const [editingMarks, setEditingMarks] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveTargetPeriod, setArchiveTargetPeriod] = useState<string | null>(null);
  const [deleteTargetPeriod, setDeleteTargetPeriod] = useState<string | null>(null);
  const [switchPeriodPromptPeriod, setSwitchPeriodPromptPeriod] = useState<string | null>(null);

  const parseValidDate = (dateStr: string): Date | null => {
    if (!dateStr?.trim()) {
      return null;
    }

    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDateOrBlank = (dateStr: string): string => {
    const parsed = parseValidDate(dateStr);
    return parsed ? parsed.toLocaleDateString() : "Not Dated";
  };

  const toDateInputValue = (dateStr: string): string => {
    const parsed = parseValidDate(dateStr);
    if (!parsed) {
      return "";
    }

    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
    const day = `${parsed.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const toStoredDateValue = (dateInputValue: string, fallbackDate: string): string => {
    if (!dateInputValue.trim()) {
      return "";
    }

    const parsed = new Date(`${dateInputValue}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? fallbackDate : parsed.toISOString();
  };

  const toTitleCase = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEditableMarks((prev) => {
        const next: Record<number, string> = {};
        history.forEach((item, index) => {
          next[index] = prev[index] ?? item.text;
        });
        return next;
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [history]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEditableCategories((prev) => {
        const next: Record<number, string> = {};
        history.forEach((item, index) => {
          next[index] = prev[index] ?? item.category ?? "";
        });
        return next;
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [history]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEditableDates((prev) => {
        const next: Record<number, string> = {};
        history.forEach((item, index) => {
          const parsed = parseValidDate(item.date);
          if (prev[index] !== undefined) {
            next[index] = prev[index];
            return;
          }

          if (!parsed) {
            next[index] = "";
            return;
          }

          const year = parsed.getFullYear();
          const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
          const day = `${parsed.getDate()}`.padStart(2, "0");
          next[index] = `${year}-${month}-${day}`;
        });
        return next;
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [history]);

  const getMarkingPeriodFromDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // EER due month (0-indexed) per rank
    const eerMonthMap: Record<string, number> = {
      E1: 0, E2: 0, E3: 1, E4: 2, E5: 3, E6: 4, E7: 8,
    };
    const eerMonth = eerMonthMap[rankLevel] ?? 2;
    const isSemiAnnual = ['E1', 'E2', 'E3', 'E4', 'E5'].includes(rankLevel);

    if (isSemiAnnual) {
      // Two 6-month periods per year:
      //   Period A: (eerMonth+7)%12  →  eerMonth        (wraps year boundary)
      //   Period B: (eerMonth+1)%12  →  (eerMonth+6)%12 (within same calendar year for E1-E5)
      const startA = (eerMonth + 7) % 12;
      const endA = eerMonth;
      const startB = (eerMonth + 1) % 12;
      const endB = (eerMonth + 6) % 12;

      if (month >= startB && month <= endB) {
        // Period B — same calendar year
        return `${monthNames[startB]} ${year} – ${monthNames[endB]} ${year}`;
      } else if (month >= startA) {
        // Period A — started this year, ends next
        return `${monthNames[startA]} ${year} – ${monthNames[endA]} ${year + 1}`;
      } else {
        // Period A — started last year, ends this year
        return `${monthNames[startA]} ${year - 1} – ${monthNames[endA]} ${year}`;
      }
    } else {
      // Annual — E6, E7
      const startMonth = (eerMonth + 1) % 12;
      if (month >= startMonth) {
        return `${monthNames[startMonth]} ${year} – ${monthNames[eerMonth]} ${year + 1}`;
      } else {
        return `${monthNames[startMonth]} ${year - 1} – ${monthNames[eerMonth]} ${year}`;
      }
    }
  };

  const getMarkingPeriod = (dateStr: string): string => {
    const d = parseValidDate(dateStr);
    if (!d) {
      // Blank or invalid dates are treated as part of the active marking period.
      return currentPeriodOverride?.trim() || getMarkingPeriodFromDate(new Date());
    }

    return getMarkingPeriodFromDate(d);
  };

  const getMonthLabel = (dateStr: string): string => {
    const d = parseValidDate(dateStr);
    if (!d) {
      return "Not Dated";
    }

    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const getPeriodSortKey = (period: string): string => {
    if (!period.includes(' – ')) {
      return '0000-00';
    }

    const monthMap: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };
    // Period format: "MMM YYYY – MMM YYYY" — sort by the end date
    const endPart = period.split(' – ')[1] ?? period;
    const [endMonth, endYear] = endPart.split(' ');
    return `${endYear}-${monthMap[endMonth] ?? '01'}`;
  };

  const getMonthSortKey = (label: string): string => {
    if (label === 'Not Dated') {
      return '0000-00';
    }

    const monthMap: Record<string, string> = {
      January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
      July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
    };
    const [month, year] = label.split(' ');
    return `${year}-${monthMap[month] ?? '01'}`;
  };

  const grouped: Record<string, Record<string, { item: HistoryItem; index: number }[]>> = {};
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredHistoryWithIndex = history
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
    if (!normalizedSearchQuery) {
      return true;
    }

    const normalizedDate = formatDateOrBlank(item.date).toLowerCase();
    const searchFields = [
      item.text,
      item.title ?? "",
      item.category ?? "",
      item.markingPeriod ?? "",
      normalizedDate,
      ...(Array.isArray(item.dates)
        ? item.dates.map((dateValue) => formatDateOrBlank(dateValue))
        : []),
    ];

      return searchFields.some((field) => field.toLowerCase().includes(normalizedSearchQuery));
    });

  filteredHistoryWithIndex.forEach(({ item, index }) => {
    const period = item.markingPeriod?.trim() ? item.markingPeriod : getMarkingPeriod(item.date);
    const month = getMonthLabel(item.date);
    if (!grouped[period]) grouped[period] = {};
    if (!grouped[period][month]) grouped[period][month] = [];
    grouped[period][month].push({ item, index });
  });

  const sortedPeriods = Object.keys(grouped).sort((a, b) =>
    getPeriodSortKey(b).localeCompare(getPeriodSortKey(a))
  );

  const getCurrentPeriodInfo = () => {
    const now = new Date();
    const currentPeriod = currentPeriodOverride?.trim() || getMarkingPeriod(now.toISOString());
    // Parse end portion: "MMM YYYY"
    const endPart = currentPeriod.split(' – ')[1] ?? '';
    const [endMonthStr, endYearStr] = endPart.split(' ');
    const fullMonthMap: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const endMonth = fullMonthMap[endMonthStr] ?? 0;
    const endYear = parseInt(endYearStr, 10);
    // End of period = last day of the EER due month
    const endDate = new Date(endYear, endMonth + 1, 0); // day 0 = last day of endMonth
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / msPerDay);
    return { currentPeriod, endDate, daysRemaining };
  };

  const { currentPeriod, endDate, daysRemaining } = getCurrentPeriodInfo();
  const urgencyColor = daysRemaining <= 30 ? 'text-red-600' : daysRemaining <= 60 ? 'text-yellow-600' : 'text-green-700';

  const startEditingMark = (index: number, item: HistoryItem) => {
    setEditableMarks((prev) => ({ ...prev, [index]: item.text }));
    setEditableCategories((prev) => ({
      ...prev,
      [index]: item.category ?? "",
    }));
    setEditableDates((prev) => ({
      ...prev,
      [index]: toDateInputValue(item.date),
    }));
    setEditingMarks((prev) => ({ ...prev, [index]: true }));
  };

  const cancelEditingMark = (index: number, item: HistoryItem) => {
    setEditableMarks((prev) => ({ ...prev, [index]: item.text }));
    setEditableCategories((prev) => ({
      ...prev,
      [index]: item.category ?? "",
    }));
    setEditableDates((prev) => ({
      ...prev,
      [index]: toDateInputValue(item.date),
    }));
    setEditingMarks((prev) => ({ ...prev, [index]: false }));
  };

  return (
    <div className="bg-(--surface-1) p-4 sm:p-6 rounded-xl shadow-md">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Official Marks</h2>
        <p className="mt-1 text-sm text-(--text-soft)">
          This is where your official marks are stored. These are the bullets that will be displayed when exported.
        </p>
        {archivedMarkingPeriods.length > 0 && (
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-(--text-soft)">
            Archived periods available in Settings: {archivedMarkingPeriods.length}
          </p>
        )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 rounded-lg border border-(--color-secondary) bg-(--color-secondary-soft) p-4 text-center sm:grid-cols-3">
        <div className="flex flex-col items-center text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-(--text-soft)">Current Marking Period</p>
          <p className="mt-1 font-semibold text-(--text-strong)">{currentPeriod}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-(--text-soft)">End of Period</p>
          <p className="mt-1 font-semibold text-(--text-strong)">{endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-(--text-soft)">Days Remaining</p>
          <p className={`mt-1 font-bold text-lg ${urgencyColor}`}>{daysRemaining > 0 ? daysRemaining : 0}</p>
        </div>
        {currentPeriodOverride && (
          <div className="sm:col-span-3 flex justify-center">
            <button
              type="button"
              onClick={handleRevertMarkingPeriod}
              className="mt-1 inline-flex items-center justify-center rounded-md border border-(--color-secondary) px-3 py-1 text-center text-xs font-semibold text-(--color-primary) transition hover:bg-(--color-secondary)"
            >
              Revert Marking Period
            </button>
          </div>
        )}
      </div>

      <div className="mb-5">
        <label htmlFor="official-marks-search" className="block text-xs font-semibold uppercase tracking-wide text-(--text-soft)">
          Search Saved Marks
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="official-marks-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by mark text, title, category, or date"
            className="w-full rounded-md border border-(--border-muted) bg-(--surface-1) px-3 py-2 text-sm text-(--text-strong) focus:outline-none focus:ring-1 focus:ring-(--color-secondary)"
          />
          {searchQuery.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="btn-secondary shrink-0 rounded-md px-3 py-2 text-xs font-semibold"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {history.length === 0 && <p className="text-(--text-soft)">No bullets committed yet.</p>}
      {history.length > 0 && filteredHistoryWithIndex.length === 0 && (
        <p className="text-(--text-soft)">No saved marks match your search.</p>
      )}

      <div className="space-y-4">
        {sortedPeriods.map((period) => {
          const isPeriodOpen = expandedPeriods[period] !== false;
          const sortedMonths = Object.keys(grouped[period]).sort((a, b) =>
            getMonthSortKey(b).localeCompare(getMonthSortKey(a))
          );
          const periodCategoryCounts = Object.values(grouped[period])
            .flat()
            .reduce<Record<string, number>>((acc, { item }) => {
              const category = item.category?.trim();
              if (!category) {
                return acc;
              }

              acc[category] = (acc[category] ?? 0) + 1;
              return acc;
            }, {});
          const periodCategories = Object.keys(periodCategoryCounts).sort((a, b) => a.localeCompare(b));
          const selectedPeriodCategoryFilters = periodCategoryFilters[period] || [];
          const isPeriodAlreadyArchived = archivedMarkingPeriods.some(
            (archive) => archive.period === period
          );

          const isCategorySelected = (category: string) =>
            selectedPeriodCategoryFilters.some(
              (selectedCategory) => selectedCategory.toLowerCase() === category.toLowerCase()
            );

          const visibleMonthCount = sortedMonths.filter((month) => {
            if (selectedPeriodCategoryFilters.length === 0) return true;
            return grouped[period][month].some(({ item }) => {
              const itemCategory = item.category;
              return selectedPeriodCategoryFilters.some(
                (selectedCategory) =>
                  (itemCategory || "").trim().toLowerCase() === selectedCategory.toLowerCase()
              );
            });
          }).length;

          return (
            <div key={period} className="overflow-hidden rounded-lg border border-(--border-muted)">
              <div className="bg-(--surface-2) px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    className="flex min-w-0 flex-1 items-center justify-between text-left hover:text-(--text-strong)"
                    onClick={() => setExpandedPeriods((prev) => ({ ...prev, [period]: !isPeriodOpen }))}
                  >
                    <span className="font-semibold text-(--text-strong)">Marking Period: {period}</span>
                    <span className="ml-3 text-sm text-(--text-soft)">{isPeriodOpen ? '▼' : '▶'}</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    {isPeriodAlreadyArchived ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeleteTargetPeriod(period);
                        }}
                        className="rounded-md border border-(--color-danger) px-3 py-2 text-xs font-semibold text-(--color-danger) transition hover:bg-(--color-danger-soft)"
                      >
                        Delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setArchiveTargetPeriod(period);
                        }}
                        className="rounded-md border border-(--color-danger) px-3 py-2 text-xs font-semibold text-(--color-danger) transition hover:bg-(--color-danger-soft)"
                      >
                        Archive Marking Period
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="block text-xs font-semibold uppercase tracking-wide text-(--text-soft)">
                    Filter this period by category
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPeriodCategoryFilters((prev) => ({ ...prev, [period]: [] }))}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        selectedPeriodCategoryFilters.length === 0
                          ? "btn-primary"
                          : "btn-secondary"
                      }`}
                    >
                      {selectedPeriodCategoryFilters.length === 0 ? "✓ " : ""}
                      All Categories
                    </button>
                    {periodCategories.map((category) => {
                      const selected = isCategorySelected(category);
                      const categoryCount = periodCategoryCounts[category] ?? 0;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => {
                            setPeriodCategoryFilters((prev) => {
                              const current = prev[period] || [];
                              const exists = current.some(
                                (selectedCategory) => selectedCategory.toLowerCase() === category.toLowerCase()
                              );

                              if (exists) {
                                return {
                                  ...prev,
                                  [period]: current.filter(
                                    (selectedCategory) =>
                                      selectedCategory.toLowerCase() !== category.toLowerCase()
                                  ),
                                };
                              }

                              return { ...prev, [period]: [...current, category] };
                            });
                          }}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            selected
                              ? "btn-primary"
                              : "btn-secondary"
                          }`}
                        >
                          {selected ? "✓ " : ""}
                          {category} ({categoryCount})
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {isPeriodOpen && (
                <div className="divide-y divide-(--border-muted)">
                  {sortedMonths.map((month) => {
                    const monthKey = `${period}__${month}`;
                    const isMonthOpen = expandedMonths[monthKey] !== false;
                    const monthItems = grouped[period][month].filter(({ item }) => {
                      if (selectedPeriodCategoryFilters.length === 0) return true;
                      const itemCategory = item.category;
                      return selectedPeriodCategoryFilters.some(
                        (selectedCategory) =>
                          (itemCategory || "").trim().toLowerCase() === selectedCategory.toLowerCase()
                      );
                    });

                    if (monthItems.length === 0) return null;

                    return (
                      <div key={month}>
                        <button
                          className="flex w-full items-center justify-between bg-(--surface-2) px-4 py-2 text-left hover:bg-(--surface-3)"
                          onClick={() => setExpandedMonths((prev) => ({ ...prev, [monthKey]: !isMonthOpen }))}
                        >
                          <span className="text-sm font-medium text-(--text-soft)">{month}</span>
                          <span className="text-xs text-(--text-soft)">{isMonthOpen ? '▼' : '▶'}</span>
                        </button>

                        {isMonthOpen && (
                          <div className="space-y-2 px-4 py-2">
                            {monthItems.map(({ item, index }) => (
                              <div key={index} className="rounded-md border border-(--border-muted) bg-(--surface-2) p-3">
                                <div
                                  className="cursor-pointer flex flex-col gap-1.5 rounded-md bg-(--surface-2) px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                  onClick={() => setExpanded((prev) => ({ ...prev, [item.text]: !prev[item.text] }))}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    {item.title && (
                                      <h3 className="truncate text-sm font-semibold text-(--text-strong)">{toTitleCase(item.title)}</h3>
                                    )}
                                    <p className="shrink-0 text-xs text-(--text-soft)">
                                      {formatDateOrBlank(item.date)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 sm:ml-3 sm:shrink-0">
                                    <select
                                      value={item.category ?? ""}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) => {
                                        event.stopPropagation();
                                        const nextCategory = event.target.value;
                                        setEditableCategories((prev) => ({ ...prev, [index]: nextCategory }));
                                        handleUpdateMark(index, item.text, nextCategory || undefined);
                                      }}
                                      className="official-mark-category-select official-mark-category-select-inline w-full rounded-md border border-(--color-secondary) bg-(--color-secondary-soft) px-2 py-1 text-xs font-medium text-(--color-primary) sm:w-44"
                                      aria-label="Change official mark category"
                                      title="Change category"
                                    >
                                      <option value="">No category</option>
                                      {OFFICIAL_MARK_CATEGORIES.map((categoryOption) => (
                                        <option key={categoryOption} value={categoryOption}>
                                          {categoryOption}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="text-sm">{expanded[item.text] ? '▼' : '▶'}</span>
                                  </div>
                                </div>

                                {expanded[item.text] && (
                                  <div className="mt-2">
                                    {editingMarks[index] ? (
                                      <>
                                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-(--text-soft)">
                                            Mark date
                                            <input
                                              type="date"
                                              value={editableDates[index] ?? toDateInputValue(item.date)}
                                              onChange={(e) =>
                                                setEditableDates((prev) => ({
                                                  ...prev,
                                                  [index]: e.target.value,
                                                }))
                                              }
                                              className="rounded-md border p-2 text-sm font-normal text-(--text-strong)"
                                              aria-label="Edit official mark date"
                                            />
                                          </label>
                                          {Array.isArray(item.dates) && item.dates.length > 1 && (
                                            <div className="rounded-md border border-(--border-muted) bg-(--surface-1) px-3 py-2">
                                              <p className="text-xs font-medium uppercase tracking-wide text-(--text-soft)">
                                                Source dates
                                              </p>
                                              <p className="mt-1 text-sm text-(--text-soft)">
                                                {item.dates.map((dateValue) => formatDateOrBlank(dateValue)).join(", ")}
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                        <textarea
                                          value={editableMarks[index] ?? item.text}
                                          onChange={(e) =>
                                            setEditableMarks((prev) => ({
                                              ...prev,
                                              [index]: e.target.value,
                                            }))
                                          }
                                          className="mt-2 w-full rounded-md border p-2 text-sm"
                                          rows={3}
                                          aria-label="Edit official mark"
                                          autoFocus
                                        />
                                        <div className="flex justify-end gap-3 mt-2">
                                          <button
                                            onClick={() => {
                                              cancelEditingMark(index, item);
                                            }}
                                            className="text-(--text-soft) text-sm"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={() => {
                                              const nextText = (editableMarks[index] ?? item.text).trim();
                                              const nextDate = toStoredDateValue(editableDates[index] ?? toDateInputValue(item.date), item.date);
                                              if (!nextText) {
                                                setEditableMarks((prev) => ({ ...prev, [index]: item.text }));
                                                return;
                                              }
                                              handleUpdateMark(index, nextText, editableCategories[index] ?? item.category, nextDate);
                                              setEditingMarks((prev) => ({ ...prev, [index]: false }));
                                              if (nextText !== item.text) {
                                                setExpanded((prev) => {
                                                  const next = { ...prev };
                                                  delete next[item.text];
                                                  next[nextText] = true;
                                                  return next;
                                                });
                                              }
                                            }}
                                            className="text-(--color-success) text-sm font-medium"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-sm">{item.text}</p>
                                        {Array.isArray(item.dates) && item.dates.length > 1 && (
                                          <p className="mt-2 text-xs text-(--text-soft)">
                                            Source dates: {item.dates.map((dateValue) => formatDateOrBlank(dateValue)).join(", ")}
                                          </p>
                                        )}
                                        <div className="flex items-center justify-between mt-2">
                                          <div className="flex gap-3">
                                            <button onClick={() => handleCopy(item.text)} className="text-(--color-primary) text-sm">
                                              Copy
                                            </button>
                                            <button onClick={() => handleDelete(index)} className="text-(--color-danger) text-sm">
                                              Delete
                                            </button>
                                            <button onClick={() => handleReprompt(index)} className="text-(--text-strong) text-sm">
                                              Reprompt
                                            </button>
                                          </div>
                                          <button
                                            onClick={() => startEditingMark(index, item)}
                                            className="text-(--color-primary) text-sm"
                                          >
                                            Edit
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {visibleMonthCount === 0 && (
                    <div className="px-4 py-3 text-sm text-(--text-soft)">
                      No marks match this category for this marking period.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {archiveTargetPeriod && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4"
            onClick={() => setArchiveTargetPeriod(null)}
          >
            <div
              className="w-full max-w-lg rounded-xl border border-(--border-muted) bg-(--surface-1) p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-(--text-strong)">Archive Marking Period?</h3>
              <p className="mt-3 text-sm text-(--text-soft)">
                Archiving {archiveTargetPeriod} commits every official mark in this period to archive, clears Daily Log entries, and switches you to the next marking period.
              </p>
              <p className="mt-2 text-sm text-(--text-soft)">
                Archived marks can be found in Settings under Data Management.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setArchiveTargetPeriod(null)}
                  className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!archiveTargetPeriod) {
                      return;
                    }
                    handleArchiveMarkingPeriod(archiveTargetPeriod, false);
                    setSwitchPeriodPromptPeriod(archiveTargetPeriod);
                    setArchiveTargetPeriod(null);
                  }}
                  className="rounded-md bg-(--color-danger) px-4 py-2 text-sm font-semibold text-(--color-text-on-strong) hover:brightness-95"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {deleteTargetPeriod && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4"
            onClick={() => setDeleteTargetPeriod(null)}
          >
            <div
              className="w-full max-w-lg rounded-xl border border-(--border-muted) bg-(--surface-1) p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-(--text-strong)">Delete from Official Marks?</h3>
              <p className="mt-3 text-sm text-(--text-soft)">
                This period is already archived. Deleting removes only the active copy from Official Marks.
              </p>
              <p className="mt-2 text-sm text-(--text-soft)">
                Archived marks remain available in Settings under Data Management.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteTargetPeriod(null)}
                  className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!deleteTargetPeriod) {
                      return;
                    }
                    handleDeleteMarkingPeriod(deleteTargetPeriod);
                    setDeleteTargetPeriod(null);
                  }}
                  className="rounded-md bg-(--color-danger) px-4 py-2 text-sm font-semibold text-(--color-text-on-strong) hover:brightness-95"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {switchPeriodPromptPeriod && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4"
            onClick={() => setSwitchPeriodPromptPeriod(null)}
          >
            <div
              className="w-full max-w-lg rounded-xl border border-(--border-muted) bg-(--surface-1) p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-(--text-strong)">Switch to Next Marking Period?</h3>
              <p className="mt-3 text-sm text-(--text-soft)">
                {switchPeriodPromptPeriod} has been archived. Would you like to switch to the next marking period now?
              </p>
              <p className="mt-2 text-sm text-(--text-soft)">
                You can revert this at any time using the Revert Marking Period button.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setSwitchPeriodPromptPeriod(null)}
                  className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
                >
                  Stay on Current Period
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!switchPeriodPromptPeriod) return;
                    handleSwitchToNextPeriod(switchPeriodPromptPeriod);
                    setSwitchPeriodPromptPeriod(null);
                  }}
                  className="btn-primary rounded-md px-4 py-2 text-sm font-semibold"
                >
                  Switch Period
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

    </div>
  );
}
