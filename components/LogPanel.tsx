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
  onReloadCommittedEntry?: (payload: { text: string; index: number; date: string; dates?: string[]; id?: string }) => void;
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
  const [microFeedback, setMicroFeedback] = useState("");
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
  const microFeedbackTimerRef = useRef<number | null>(null);

  const pushMicroFeedback = (message: string) => {
    if (microFeedbackTimerRef.current) {
      window.clearTimeout(microFeedbackTimerRef.current);
    }
    setMicroFeedback(message);
    microFeedbackTimerRef.current = window.setTimeout(() => {
      setMicroFeedback("");
      microFeedbackTimerRef.current = null;
    }, 2200);
  };

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

  useEffect(() => {
    return () => {
      if (microFeedbackTimerRef.current) {
        window.clearTimeout(microFeedbackTimerRef.current);
      }
    };
  }, []);

  const handleSave = () => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      setError("Please enter what you did today.");
      return;
    }

    onSaveEntry({ text: trimmedText });
    setText("");
    setError("");
    pushMicroFeedback("Entry saved. AI can now optimize it in Generator.");
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
      } else {
        pushMicroFeedback(`File parsed: ${parsedEntries.length} entr${parsedEntries.length === 1 ? "y" : "ies"} ready.`);
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
    } else {
      pushMicroFeedback(`Notes parsed: ${parsedEntries.length} entr${parsedEntries.length === 1 ? "y" : "ies"} ready.`);
    }
  };

  const handleSaveImported = () => {
    if (importedEntries.length === 0) {
      setImportError("Import entries first, then save them into Daily Log.");
      return;
    }

    setImportError("");
    onSaveImportedEntries(importedEntries.map((entry) => ({ text: entry.text, dates: entry.dates })));
    pushMicroFeedback(`Imported ${importedEntries.length} entr${importedEntries.length === 1 ? "y" : "ies"} into Daily Log.`);
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
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-(--text-strong)">Daily Log</h2>
        <p className="mt-1 text-sm text-supporting">Capture work notes you can turn into bullets later.</p>
      </div>
      <div className="h-px bg-(--border-muted) opacity-60" />
      <div className="rounded-xl bg-(--surface-1) p-4 shadow-md sm:p-6">
      {microFeedback && (
        <p className="micro-feedback mt-3 text-sm" role="status" aria-live="polite">{microFeedback}</p>
      )}

      <div className="log-import-section mt-2 rounded-lg bg-(--color-secondary-soft) p-3 sm:p-4">
        <p className="section-title-tertiary">Import Notes Into Daily Log</p>
        <p className="mt-1 text-sm text-supporting">
          Upload a .docx or .pdf file, or paste notes, then save parsed entries directly into Daily Log.
        </p>
        {!aiEnabled && (
          <p className="mt-1 text-sm text-supporting text-(--color-warning)">
            AI file import is disabled in Settings. You can still paste notes and parse locally.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setImportMode("file")}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${
              importMode === "file"
                ? "btn-primary"
                : "btn-secondary"
            }`}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setImportMode("notes")}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${
              importMode === "notes"
                ? "btn-primary"
                : "btn-secondary"
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
              className="btn-primary rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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
                className="btn-primary rounded-md px-3 py-2 text-sm font-semibold"
              >
                Parse Notes
              </button>
            </div>
          </div>
        )}

        {importError && <p className="mt-2 text-xs text-(--color-danger)">{importError}</p>}

        {importedEntries.length > 0 && (
            <div className="log-import-results mt-3 rounded-md bg-(--surface-2) p-3">
            <p className="text-xs font-semibold text-(--color-primary)">
              Parsed Entries ({importedEntries.length})
            </p>
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-(--color-primary)">
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
                className="btn-secondary rounded-md px-3 py-2 text-sm font-semibold"
              >
                Clear Imported
              </button>
              <button
                type="button"
                onClick={() => void handleSaveImported()}
                className="btn-success rounded-md px-3 py-2 text-sm font-semibold"
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
        className="mt-2 h-32 w-full rounded-md border p-3 placeholder:italic"
        placeholder="Example: Led morning maintenance brief and coordinated tasking across two teams."
      />
      <p className="mt-2 text-xs text-supporting">AI will organize and optimize this entry when you pull it into Mark Generator.</p>

      {error && <p className="mt-3 text-sm text-(--color-danger)">{error}</p>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void handleSave()}
            className="btn-primary rounded-md px-6 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Entry
          </button>
          <button
            type="button"
            onClick={() => setIsManualGroupingOpen((prev) => !prev)}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              isManualGroupingOpen
                ? "bg-(--color-warning) text-(--color-text-on-strong) hover:brightness-95"
                : "btn-secondary"
            }`}
          >
            Edit Groups
          </button>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setShowFilterMenu((prev) => !prev)}
            className="btn-tertiary self-start rounded-md px-3 py-1.5 text-xs font-semibold"
          >
            Sort by
          </button>

          {showFilterMenu && (
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded-md border border-(--border-muted) px-2 py-1.5 text-xs sm:w-auto"
            >
              <option>Date (Oldest to Newest)</option>
              <option>Date (Newest to Oldest)</option>
            </select>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm italic text-(--text-soft)">Tap on any log entry to load into generator.</p>

      {isManualGroupingOpen && (
        <div className="log-edit-groups-panel sticky top-(--tab-bar-top-offset) z-30 mt-4 -mx-4 rounded-xl border border-(--color-warning) bg-(--color-warning-soft) px-2 py-8 shadow-md backdrop-blur sm:-mx-6 sm:top-6">
          <div className="flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap">
            <input
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              placeholder="Group name (e.g. SAR, PT, Training)"
              className="log-edit-groups-input w-64 rounded-md border border-(--color-warning) bg-(--surface-1) px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAssignSelectedToGroup}
              className="log-edit-groups-primary rounded-md bg-(--color-warning) px-3 py-2 text-sm font-semibold text-(--color-text-on-strong) hover:brightness-95"
            >
              Assign to Group ({selectedCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedEntryIndexes(new Set())}
              className="btn-secondary rounded-md px-3 py-2 text-sm font-semibold"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => setIsManualGroupingOpen(false)}
              className="log-edit-groups-exit rounded-md border border-(--color-warning) bg-(--surface-1) px-3 py-2 text-sm font-semibold text-(--color-warning) hover:bg-(--color-warning-soft)"
            >
              Exit
            </button>
            {groupActionError && <span className="text-xs font-medium text-(--color-danger)">{groupActionError}</span>}
          </div>
        </div>
      )}

      {groupedMarks.length > 0 && (
        <div className="mt-4 rounded-lg bg-(--color-secondary-soft) p-3 shadow-sm">
          <p className="text-sm font-semibold text-(--color-primary)">Grouped Bullets</p>
          <p className="mt-1 text-xs text-(--color-primary)">
            Expand a group to view bullets assigned to it.
          </p>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {groupedMarks.map((group) => (
              <details
                key={group.groupName}
                className="rounded-md bg-(--surface-2)"
              >
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-(--color-primary)">
                  <div className="flex items-center justify-between gap-2">
                    <span>{group.groupName}</span>
                    <span className="rounded-full bg-(--color-secondary-soft) px-2 py-0.5 text-xs font-semibold text-(--color-primary)">
                      {group.marks.length}
                    </span>
                  </div>
                </summary>
                <div className="space-y-2 border-t border-(--border-muted) px-3 py-2">
                  {group.marks.map(({ entry, index }) => (
                    <div
                      key={`${group.groupName}-${index}`}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 ${
                        isManualGroupingOpen && selectedEntryIndexes.has(index)
                          ? "bg-(--color-warning-soft)"
                          : "bg-(--surface-2)"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleEntryPrimaryAction(index)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm text-(--text-strong)">{entry.text}</p>
                        <p className="mt-1 text-xs text-(--text-soft)">
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
                          className="btn-secondary btn-icon-action text-xs"
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
              className={`rounded-lg p-3 transition-colors ${
                isManualGroupingOpen && selectedEntryIndexes.has(index)
                  ? "bg-(--color-warning-soft)"
                  : "hover:bg-(--color-secondary-soft)"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleEntryPrimaryAction(index)}
                  title={isManualGroupingOpen ? "Tap to select for grouping" : "Tap to use in Generator"}
                  className="min-w-0 flex-1 touch-manipulation text-left"
                >
                  <p className="text-sm text-(--text-strong)">{entry.text}</p>
                  {((entry.dates && entry.dates.length > 0) || entry.date) && (
                    <p className="mt-1 text-xs text-(--text-soft)">
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
                  className="btn-icon-action"
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
              className="used-group-toggle flex w-full items-center justify-between rounded-lg border border-(--color-success) bg-(--surface-1) px-4 py-2 text-sm font-semibold text-(--color-success) hover:bg-(--color-success-soft)"
            >
              <span>Used ({usedEntries.length})</span>
              <span>{showUsed ? "▲" : "▼"}</span>
            </button>

            {showUsed && (
              <div className="mt-2 space-y-2">
                {usedEntries.map(({ entry, index }) => (
                  <div
                    key={`${entry.date || entry.dates?.join("|") || "no-date"}-${index}`}
                    className={`used-group-entry rounded-lg p-3 ${
                      isManualGroupingOpen && selectedEntryIndexes.has(index)
                        ? "bg-(--color-warning-soft)"
                        : "bg-(--color-success-soft)"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleUsedEntryClick(index)}
                        title={isManualGroupingOpen ? "Tap to select for grouping" : "Reload into Generator"}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="used-group-text text-sm text-(--text-strong)">{entry.text}</p>
                        {((entry.dates && entry.dates.length > 0) || entry.date) && (
                          <p className="used-group-meta mt-1 text-xs text-(--color-success)">
                            {entry.dates && entry.dates.length > 0
                              ? formatImportedDates(entry.dates)
                              : new Date(entry.date).toLocaleDateString()}
                          </p>
                        )}
                        <p className="used-group-meta mt-1 text-xs font-semibold text-(--color-success)">Committed as Official Mark</p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmIndex(index);
                        }}
                        className="used-group-delete btn-icon-action"
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
                className="btn-secondary rounded-xl px-4 py-2 text-sm font-semibold"
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
                      dates: entry.dates,
                      id: entry.id,
                    });
                  }
                  setReloadConfirmIndex(null);
                }}
                className="btn-success rounded-xl px-4 py-2 text-sm font-semibold"
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
                className="rounded-md bg-(--color-danger) px-4 py-2 text-sm font-semibold text-(--color-text-on-strong) hover:brightness-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
