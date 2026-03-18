import { useEffect, useRef, useState, useMemo } from "react";
import { extractCandidateEntriesFromText } from "@/lib/logImport";

type LogEntry = {
  id?: string;
  text: string;
  date: string;
  dates?: string[];
  group?: string;
  committed?: boolean;
};

type LogPanelProps = {
  entries: LogEntry[];
  aiEnabled: boolean;
  onSaveEntry: (entry: { text: string }) => void;
  onSaveImportedEntries: (entries: Array<{ text: string; dates: string[] }>) => void;
  onDeleteEntry: (index: number) => void;
  onAssignGroup: (entryIndexes: number[], groupName: string) => void;
  onPullEntry?: (index: number) => void;
  onReloadCommittedEntry?: (payload: { text: string; index: number; date: string; id?: string }) => void;
};

export default function LogPanel({
  entries,
  aiEnabled,
  onSaveEntry,
  onSaveImportedEntries,
  onDeleteEntry,
  onAssignGroup,
  onPullEntry,
  onReloadCommittedEntry,
}: LogPanelProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortOrder, setSortOrder] = useState("Date (Newest to Oldest)");
  const [importMode, setImportMode] = useState<"file" | "notes">("file");
  const [pastedNotes, setPastedNotes] = useState("");
  const [importedEntries, setImportedEntries] = useState<Array<{ text: string; dates: string[] }>>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [isManualGroupingOpen, setIsManualGroupingOpen] = useState(false);
  const [selectedEntryIndexes, setSelectedEntryIndexes] = useState<Set<number>>(new Set());
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupActionError, setGroupActionError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedEntryIndexes((prev) => {
      const next = new Set<number>();
      prev.forEach((index) => {
        if (index >= 0 && index < entries.length) {
          next.add(index);
        }
      });
      return next;
    });
  }, [entries.length]);

  useEffect(() => {
    if (isManualGroupingOpen) {
      return;
    }
    setSelectedEntryIndexes(new Set());
    setGroupActionError("");
  }, [isManualGroupingOpen]);

  const handleSave = () => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      setError("Please enter what you did today.");
      return;
    }

    onSaveEntry({ text: trimmedText });
    setText("");
    setError("");
  };

  const handleProcessUpload = async (file: File) => {
    if (!aiEnabled) {
      setImportError("Daily Log AI import is disabled in Settings.");
      setImportedEntries([]);
      return;
    }

    setImportError("");
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import-log-entries", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as {
        entries?: Array<{ text?: string; dates?: string[] }>;
        error?: string;
      };
      if (!res.ok) {
        setImportError(data.error || "Unable to parse uploaded file.");
        setImportedEntries([]);
        return;
      }

      const parsedEntries = Array.isArray(data.entries)
        ? data.entries
            .filter((entry) => entry && typeof entry.text === "string")
            .map((entry) => ({
              text: entry.text!.trim(),
              dates: Array.isArray(entry.dates)
                ? entry.dates.filter((date): date is string => typeof date === "string" && date.length > 0)
                : [],
            }))
            .filter((entry) => entry.text.length > 0)
        : [];
      setImportedEntries(parsedEntries);

      if (parsedEntries.length === 0) {
        setImportError("No bullet-style actions were found in that file.");
      }
    } catch {
      setImportError("Unable to read the file. Please try again.");
      setImportedEntries([]);
    } finally {
      setImportLoading(false);
    }
  };

  const handleParsePastedNotes = () => {
    setImportError("");
    const parsedEntries = extractCandidateEntriesFromText(pastedNotes);
    setImportedEntries(parsedEntries);

    if (parsedEntries.length === 0) {
      setImportError("No bullet-style actions found in pasted notes.");
    }
  };

  const handleSaveImported = () => {
    if (importedEntries.length === 0) {
      setImportError("Import entries first, then save them into Daily Log.");
      return;
    }

    setImportError("");
    onSaveImportedEntries(importedEntries.map((entry) => ({ text: entry.text, dates: entry.dates })));
    setImportedEntries([]);
    setPastedNotes("");
    setImportError("");
  };

  const formatImportedDates = (dates: string[]) =>
    dates
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toLocaleDateString())
      .join(", ");

  const getEntrySortTime = (entry: LogEntry) => {
    const candidateDates = entry.dates && entry.dates.length > 0 ? entry.dates : entry.date ? [entry.date] : [];
    const timestamps = candidateDates
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));

    if (timestamps.length === 0) {
      return Number.NEGATIVE_INFINITY;
    }

    return Math.max(...timestamps);
  };

  const isOldestFirst = sortOrder === "Date (Oldest to Newest)";

  const [showUsed, setShowUsed] = useState(false);
  const [reloadConfirmIndex, setReloadConfirmIndex] = useState<number | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  useEffect(() => {
    if (deleteConfirmIndex === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteConfirmIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteConfirmIndex]);

  const groupedMarks = useMemo(() => {
    const byGroup = new Map<string, Array<{ entry: LogEntry; index: number }>>();

    entries.forEach((entry, index) => {
      const normalizedGroup = entry.group?.trim();
      if (!normalizedGroup) {
        return;
      }

      const existing = byGroup.get(normalizedGroup) || [];
      existing.push({ entry, index });
      byGroup.set(normalizedGroup, existing);
    });

    return Array.from(byGroup.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([groupName, marks]) => ({
        groupName,
        marks: [...marks].sort((a, b) => {
          const aTime = getEntrySortTime(a.entry);
          const bTime = getEntrySortTime(b.entry);
          return isOldestFirst ? aTime - bTime : bTime - aTime;
        }),
      }));
  }, [entries, isOldestFirst]);

  const { activeEntries, usedEntries } = useMemo(() => {
    const sorted = [...entries]
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const aTime = getEntrySortTime(a.entry);
        const bTime = getEntrySortTime(b.entry);
        return isOldestFirst ? aTime - bTime : bTime - aTime;
      });

    const ungroupedOnly = sorted.filter(({ entry }) => !entry.group?.trim());

    return {
      activeEntries: ungroupedOnly.filter(({ entry }) => !entry.committed),
      usedEntries: ungroupedOnly.filter(({ entry }) => !!entry.committed),
    };
  }, [entries, isOldestFirst]);

  const selectedCount = selectedEntryIndexes.size;

  const toggleSelection = (index: number) => {
    setGroupActionError("");
    setSelectedEntryIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleEntryPrimaryAction = (index: number) => {
    if (isManualGroupingOpen) {
      toggleSelection(index);
      return;
    }
    onPullEntry?.(index);
  };

  const handleUsedEntryClick = (index: number) => {
    if (isManualGroupingOpen) {
      toggleSelection(index);
      return;
    }
    setReloadConfirmIndex(index);
  };

  const handleAssignSelectedToGroup = () => {
    const normalizedGroup = groupNameInput.trim();
    if (!normalizedGroup) {
      setGroupActionError("Enter a group name before assigning selected entries.");
      return;
    }
    if (selectedEntryIndexes.size === 0) {
      setGroupActionError("Select at least one log entry to group.");
      return;
    }
    onAssignGroup(Array.from(selectedEntryIndexes), normalizedGroup);
    setGroupActionError("");
    setGroupNameInput("");
    setSelectedEntryIndexes(new Set());
  };

  const handleUngroupSingleEntry = (index: number) => {
    onAssignGroup([index], "");
    setSelectedEntryIndexes((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-md sm:p-6">
      <h2 className="text-xl font-semibold">Daily Log</h2>
      <p className="mt-1 text-sm text-gray-600">Capture work notes you can turn into bullets later.</p>

      <div className="log-import-section mt-5 rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:p-4">
        <p className="text-sm font-semibold text-indigo-900">Import Notes Into Daily Log</p>
        <p className="mt-1 text-xs text-indigo-800">
          Upload a .docx or .pdf file, or paste notes, then save parsed entries directly into Daily Log.
        </p>
        {!aiEnabled && (
          <p className="mt-1 text-xs text-amber-700">
            AI file import is disabled in Settings. You can still paste notes and parse locally.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setImportMode("file")}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${
              importMode === "file"
                ? "bg-indigo-700 text-white"
                : "border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setImportMode("notes")}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${
              importMode === "notes"
                ? "bg-indigo-700 text-white"
                : "border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            Paste Notes
          </button>
        </div>

        {importMode === "file" && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  return;
                }
                void handleProcessUpload(file);
                e.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading || !aiEnabled}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importLoading ? "Reading file..." : "Upload Word or PDF"}
            </button>
          </div>
        )}

        {importMode === "notes" && (
          <div className="mt-3">
            <textarea
              value={pastedNotes}
              onChange={(e) => setPastedNotes(e.target.value)}
              className="h-28 w-full rounded-md border p-3 text-sm"
              placeholder="Paste your notes or bullets here, one item per line."
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleParsePastedNotes}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Parse Notes
              </button>
            </div>
          </div>
        )}

        {importError && <p className="mt-2 text-xs text-red-700">{importError}</p>}

        {importedEntries.length > 0 && (
          <div className="log-import-results mt-3 rounded-md border border-indigo-200 bg-white p-3">
            <p className="text-xs font-semibold text-indigo-900">
              Parsed Entries ({importedEntries.length})
            </p>
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-indigo-900">
              {importedEntries.map((entry, index) => (
                <p key={`${entry.text}-${entry.dates.join("|")}-${index}`}>
                  {index + 1}. {entry.text}
                  {entry.dates.length > 0 ? ` (${formatImportedDates(entry.dates)})` : ""}
                </p>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setImportedEntries([])}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Clear Imported
              </button>
              <button
                type="button"
                onClick={() => void handleSaveImported()}
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Save to Daily Log
              </button>
            </div>
          </div>
        )}
      </div>

      <label className="mt-5 block text-sm font-medium">What did you do today?</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-2 h-32 w-full rounded-md border p-3"
        placeholder="Example: Led morning maintenance brief and coordinated tasking across two teams."
      />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void handleSave()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Entry
          </button>
          <button
            type="button"
            onClick={() => setIsManualGroupingOpen((prev) => !prev)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              isManualGroupingOpen
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "border border-amber-400 bg-white text-amber-800 hover:bg-amber-100"
            }`}
          >
            Edit Groups
          </button>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setShowFilterMenu((prev) => !prev)}
            className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            Sort by
          </button>

          {showFilterMenu && (
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs sm:w-auto"
            >
              <option>Date (Oldest to Newest)</option>
              <option>Date (Newest to Oldest)</option>
            </select>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm italic text-gray-600">Tap on any log entry to load into generator.</p>

      {isManualGroupingOpen && (
        <div className="sticky top-(--tab-bar-top-offset) z-30 mt-4 -mx-4 rounded-xl border border-amber-300 bg-amber-50/90 px-2 py-8 shadow-md backdrop-blur supports-backdrop-filter:bg-amber-50/80 sm:-mx-6 sm:top-6">
          <div className="flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap">
            <input
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              placeholder="Group name (e.g. SAR, PT, Training)"
              className="w-64 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAssignSelectedToGroup}
              className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Assign to Group ({selectedCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedEntryIndexes(new Set())}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => setIsManualGroupingOpen(false)}
              className="rounded-md border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Exit
            </button>
            {groupActionError && <span className="text-xs font-medium text-red-700">{groupActionError}</span>}
          </div>
        </div>
      )}

      {groupedMarks.length > 0 && (
        <div className="mt-4 rounded-lg border border-sky-300 bg-sky-50 p-3 shadow-sm">
          <p className="text-sm font-semibold text-sky-900">Grouped Bullets</p>
          <p className="mt-1 text-xs text-sky-800">
            Expand a group to view bullets assigned to it.
          </p>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {groupedMarks.map((group) => (
              <details
                key={group.groupName}
                className="overflow-hidden rounded-md border border-sky-200 bg-white"
              >
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-sky-800">
                  <div className="flex items-center justify-between gap-2">
                    <span>{group.groupName}</span>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                      {group.marks.length}
                    </span>
                  </div>
                </summary>
                <div className="space-y-2 border-t border-sky-100 px-3 py-2">
                  {group.marks.map(({ entry, index }) => (
                    <div
                      key={`${group.groupName}-${index}`}
                      className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                        isManualGroupingOpen && selectedEntryIndexes.has(index)
                          ? "border-amber-400 bg-amber-50"
                          : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleEntryPrimaryAction(index)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm text-gray-900">{entry.text}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {entry.committed ? "Committed" : ""}
                          {((entry.dates && entry.dates.length > 0) || entry.date)
                            ? `${entry.committed ? " | " : ""}${entry.dates && entry.dates.length > 0
                                ? formatImportedDates(entry.dates)
                                : new Date(entry.date).toLocaleDateString()}`
                            : ""}
                        </p>
                      </button>
                      {isManualGroupingOpen && (
                        <button
                          type="button"
                          onClick={() => handleUngroupSingleEntry(index)}
                          className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                          title="Remove from group"
                          aria-label="Remove from group"
                        >
                          X
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {entries.length === 0 && <p className="text-sm text-gray-400">No entries saved yet.</p>}
        {activeEntries.length === 0 && entries.length > 0 && (
          <p className="text-sm text-gray-400">All entries have been used.</p>
        )}
        {activeEntries.map(({ entry, index }) => (
            <div
              key={`${entry.date || entry.dates?.join("|") || "no-date"}-${index}`}
              className={`rounded-lg border p-3 transition-colors ${
                isManualGroupingOpen && selectedEntryIndexes.has(index)
                  ? "border-amber-400 bg-amber-50"
                  : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleEntryPrimaryAction(index)}
                  title={isManualGroupingOpen ? "Tap to select for grouping" : "Tap to use in Generator"}
                  className="min-w-0 flex-1 touch-manipulation text-left"
                >
                  <p className="text-sm text-gray-900">{entry.text}</p>
                  {((entry.dates && entry.dates.length > 0) || entry.date) && (
                    <p className="mt-1 text-xs text-gray-500">
                      {entry.dates && entry.dates.length > 0
                        ? formatImportedDates(entry.dates)
                        : new Date(entry.date).toLocaleDateString()}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmIndex(index);
                  }}
                  className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-red-600"
                  aria-label="Delete log entry"
                  title="Delete"
                >
                  X
                </button>
              </div>
            </div>
          ))}

        {usedEntries.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowUsed((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-100"
            >
              <span>Used ({usedEntries.length})</span>
              <span>{showUsed ? "▲" : "▼"}</span>
            </button>

            {showUsed && (
              <div className="mt-2 space-y-2">
                {usedEntries.map(({ entry, index }) => (
                  <div
                    key={`${entry.date || entry.dates?.join("|") || "no-date"}-${index}`}
                    className={`rounded-lg border p-3 ${
                      isManualGroupingOpen && selectedEntryIndexes.has(index)
                        ? "border-amber-400 bg-amber-50"
                        : "border-green-300 bg-green-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleUsedEntryClick(index)}
                        title={isManualGroupingOpen ? "Tap to select for grouping" : "Reload into Generator"}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm text-green-900">{entry.text}</p>
                        {((entry.dates && entry.dates.length > 0) || entry.date) && (
                          <p className="mt-1 text-xs text-green-700">
                            {entry.dates && entry.dates.length > 0
                              ? formatImportedDates(entry.dates)
                              : new Date(entry.date).toLocaleDateString()}
                          </p>
                        )}
                        <p className="mt-1 text-xs font-semibold text-green-700">Committed as Official Mark</p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmIndex(index);
                        }}
                        className="rounded-md px-2 py-1 text-sm font-semibold text-green-600 hover:bg-green-100 hover:text-red-600"
                        aria-label="Delete log entry"
                        title="Delete"
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {reloadConfirmIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <p className="text-sm font-semibold text-gray-900">
              This bullet has already been committed into your official marks. Would you like to reload it into the generator?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReloadConfirmIndex(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const entry = entries[reloadConfirmIndex];
                  if (entry) {
                    onReloadCommittedEntry?.({
                      text: entry.text,
                      index: reloadConfirmIndex,
                      date: entry.dates?.[0] ?? entry.date,
                      id: entry.id,
                    });
                  }
                  setReloadConfirmIndex(null);
                }}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteConfirmIndex(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <p className="text-sm font-semibold text-gray-900">Delete this daily entry?</p>
            <p className="mt-2 text-sm text-gray-600">This action cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmIndex(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteEntry(deleteConfirmIndex);
                  setDeleteConfirmIndex(null);
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}