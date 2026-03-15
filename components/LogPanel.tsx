import { useRef, useState, useMemo } from "react";
import { extractCandidateEntriesFromText } from "@/lib/logImport";

type LogEntry = {
  text: string;
  date: string;
  dates?: string[];
  committed?: boolean;
};

type LogPanelProps = {
  entries: LogEntry[];
  onSaveEntry: (entry: { text: string }) => void;
  onSaveImportedEntries: (entries: Array<{ text: string; dates: string[] }>) => void;
  onDeleteEntry: (index: number) => void;
  onClearEntries: () => void;
  onPullEntry?: (index: number) => void;
};

export default function LogPanel({
  entries,
  onSaveEntry,
  onSaveImportedEntries,
  onDeleteEntry,
  onClearEntries,
  onPullEntry,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const { activeEntries, usedEntries } = useMemo(() => {
    const sorted = [...entries]
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const aTime = getEntrySortTime(a.entry);
        const bTime = getEntrySortTime(b.entry);
        return isOldestFirst ? aTime - bTime : bTime - aTime;
      });
    return {
      activeEntries: sorted.filter(({ entry }) => !entry.committed),
      usedEntries: sorted.filter(({ entry }) => entry.committed),
    };
  }, [entries, isOldestFirst]);

  return (
    <div className="rounded-xl bg-white p-4 shadow-md sm:p-6">
      <h2 className="text-xl font-semibold">Daily Log</h2>
      <p className="mt-1 text-sm text-gray-600">Capture work notes you can turn into bullets later.</p>

      <div className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:p-4">
        <p className="text-sm font-semibold text-indigo-900">Import Notes Into Daily Log</p>
        <p className="mt-1 text-xs text-indigo-800">
          Upload a .docx or .pdf file, or paste notes, then save parsed entries directly into Daily Log.
        </p>

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
              disabled={importLoading}
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
          <div className="mt-3 rounded-md border border-indigo-200 bg-white p-3">
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

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSave()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Entry
          </button>
          <button
            type="button"
            onClick={onClearEntries}
            disabled={entries.length === 0}
            className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Daily Log
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilterMenu((prev) => !prev)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            Sort by
          </button>

          {showFilterMenu && (
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option>Date (Oldest to Newest)</option>
              <option>Date (Newest to Oldest)</option>
            </select>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {entries.length === 0 && <p className="text-sm text-gray-400">No entries saved yet.</p>}
        {activeEntries.length === 0 && entries.length > 0 && (
          <p className="text-sm text-gray-400">All entries have been used.</p>
        )}
        {activeEntries.map(({ entry, index }) => (
            <div
              key={`${entry.date || entry.dates?.join("|") || "no-date"}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => onPullEntry?.(index)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPullEntry?.(index); }}
              title="Click to use in Generator"
              className="cursor-pointer rounded-lg border border-gray-200 p-3 transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">{entry.text}</p>
                  {((entry.dates && entry.dates.length > 0) || entry.date) && (
                    <p className="mt-1 text-xs text-gray-500">
                      {entry.dates && entry.dates.length > 0
                        ? formatImportedDates(entry.dates)
                        : new Date(entry.date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteEntry(index); }}
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
                    className="rounded-lg border border-green-300 bg-green-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-green-900">{entry.text}</p>
                        {((entry.dates && entry.dates.length > 0) || entry.date) && (
                          <p className="mt-1 text-xs text-green-700">
                            {entry.dates && entry.dates.length > 0
                              ? formatImportedDates(entry.dates)
                              : new Date(entry.date).toLocaleDateString()}
                          </p>
                        )}
                        <p className="mt-1 text-xs font-semibold text-green-700">Committed as Official Mark</p>
                      </div>
                      <button
                        onClick={() => onDeleteEntry(index)}
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
    </div>
  );
}