import { useEffect, useRef, useState } from "react";

type LogEntry = {
  text: string;
  date: string;
  dates?: string[];
  committed?: boolean;
  category?: string;
  impact?: string;
};

type DailyLogItem = {
  id: string;
  text: string;
  preview: string;
  dates: string[];
  sourceIndex: number;
};

function buildDailyLogItems(entries: LogEntry[]): DailyLogItem[] {
  return entries
    .map((entry, index) => {
      const text = entry.text.trim();
      const preview = text.length > 90 ? `${text.slice(0, 90)}...` : text;
      const dates = entry.dates && entry.dates.length > 0 ? entry.dates : entry.date ? [entry.date] : [];
      return {
        id: `daily-log-entry-${index}`,
        text,
        preview,
        dates,
        sourceIndex: index,
        committed: entry.committed,
      };
    })
    .filter((entry) => entry.text.length > 0 && !entry.committed);
}

type GeneratorPanelProps = {
  input: string;
  setInput: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  peopleAffected: string;
  setPeopleAffected: (value: string) => void;
  percentImproved: string;
  setPercentImproved: (value: string) => void;
  hoursSaved: string;
  setHoursSaved: (value: string) => void;
  missionImpact: string;
  setMissionImpact: (value: string) => void;
  logEntries: LogEntry[];
  error: string;
  loading: boolean;
  bullet: {text: string; category: string} | null;
  splitBulletRecommendation: {
    shouldSplit: boolean;
    reason: string;
    splitActions: string[];
  } | null;
  splitBulletRecommendationLoading: boolean;
  splitBulletDrafts: Array<{
    id: string;
    action: string;
    text: string;
    category: string;
  }>;
  splitBulletDraftsLoading: boolean;
  splitBulletDraftRepromptingId: string | null;
  wasCategoryUserSelected: boolean;
  handleGenerate: () => void;
  handleGenerateMarkAsIs: () => void;
  handleApplySplitRecommendation: () => void | Promise<void>;
  handleClearSplitBulletDrafts: () => void;
  handleRepromptSplitBulletDraft: (draftId: string) => void | Promise<void>;
  handleCommitSplitBulletDrafts: (draftIds: string[]) => void;
  handleCommitBullet: () => void;
  onLogEntryPulled?: (payload: { date: string; index: number }) => void;
  pendingLogPull?: number | null;
  onPendingLogPullConsumed?: () => void;
};

export default function GeneratorPanel({
  input,
  setInput,
  category,
  setCategory,
  peopleAffected,
  setPeopleAffected,
  percentImproved,
  setPercentImproved,
  hoursSaved,
  setHoursSaved,
  missionImpact,
  setMissionImpact,
  logEntries,
  error,
  loading,
  bullet,
  splitBulletRecommendation,
  splitBulletRecommendationLoading,
  splitBulletDrafts,
  splitBulletDraftsLoading,
  splitBulletDraftRepromptingId,
  wasCategoryUserSelected,
  handleGenerate,
  handleGenerateMarkAsIs,
  handleApplySplitRecommendation,
  handleClearSplitBulletDrafts,
  handleRepromptSplitBulletDraft,
  handleCommitSplitBulletDrafts,
  handleCommitBullet,
  onLogEntryPulled,
  pendingLogPull,
  onPendingLogPullConsumed,
}: GeneratorPanelProps) {
  const [isBulletModalOpen, setIsBulletModalOpen] = useState(false);
  const [isSplitDraftModalOpen, setIsSplitDraftModalOpen] = useState(false);
  const [selectedSplitDraftIds, setSelectedSplitDraftIds] = useState<string[]>([]);
  const [selectedLogEntryId, setSelectedLogEntryId] = useState("");
  const [impactLoading, setImpactLoading] = useState(false);
  const [aiRecommendationEnabled, setAiRecommendationEnabled] = useState(true);
  const previousLoadingRef = useRef(loading);
  const latestPullRequestRef = useRef(0);

  const dailyLogItems = buildDailyLogItems(logEntries);
  const selectedLogEntryIndex = dailyLogItems.findIndex((entry) => entry.id === selectedLogEntryId);

  const pullLogEntryById = async (entryId: string) => {
    const targetEntry = dailyLogItems.find((entry) => entry.id === entryId);
    if (!targetEntry) {
      return;
    }

    const pulledText = targetEntry.text.trim();
    if (!pulledText) {
      return;
    }

    setInput(pulledText);

    if (onLogEntryPulled) {
      onLogEntryPulled({ date: targetEntry.dates[0] ?? "", index: targetEntry.sourceIndex });
    }

    if (!aiRecommendationEnabled) {
      return;
    }

    const requestId = latestPullRequestRef.current + 1;
    latestPullRequestRef.current = requestId;
    setImpactLoading(true);
    try {
      const res = await fetch("/api/suggest-impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pulledText }),
      });

      const data = (await res.json()) as { impact?: string };
      if (latestPullRequestRef.current !== requestId) {
        return;
      }

      if (res.ok && data.impact) {
        setMissionImpact(data.impact);
      }
    } catch {
      // Non-blocking: Action pull still succeeds if impact suggestion fails.
    } finally {
      if (latestPullRequestRef.current === requestId) {
        setImpactLoading(false);
      }
    }
  };

  const selectLogEntry = (nextId: string) => {
    if (!nextId) {
      setSelectedLogEntryId("");
      return;
    }

    if (nextId !== selectedLogEntryId) {
      setInput("");
      setMissionImpact("");
    }

    setSelectedLogEntryId(nextId);
    void pullLogEntryById(nextId);
  };

  const handleStepLogEntry = (direction: -1 | 1) => {
    if (dailyLogItems.length < 2) {
      return;
    }

    const currentIndex = selectedLogEntryIndex >= 0 ? selectedLogEntryIndex : 0;
    const nextIndex = (currentIndex + direction + dailyLogItems.length) % dailyLogItems.length;
    const nextItem = dailyLogItems[nextIndex];

    if (!nextItem) {
      return;
    }

    selectLogEntry(nextItem.id);
  };

  useEffect(() => {
    if (dailyLogItems.length === 0) {
      setSelectedLogEntryId("");
      return;
    }

    if (selectedLogEntryId && !dailyLogItems.some((entry) => entry.id === selectedLogEntryId)) {
      setSelectedLogEntryId("");
    }
  }, [dailyLogItems, selectedLogEntryId]);

  useEffect(() => {
    const generationJustFinished = previousLoadingRef.current && !loading;
    if (generationJustFinished && bullet?.text) {
      setIsBulletModalOpen(true);
    }
    previousLoadingRef.current = loading;
  }, [loading, bullet]);

  useEffect(() => {
    if (splitBulletDraftsLoading || splitBulletDrafts.length > 0) {
      setIsSplitDraftModalOpen(true);
    } else {
      setIsSplitDraftModalOpen(false);
    }
  }, [splitBulletDrafts, splitBulletDraftsLoading]);

  useEffect(() => {
    setSelectedSplitDraftIds(splitBulletDrafts.map((draft) => draft.id));
  }, [splitBulletDrafts]);

  useEffect(() => {
    if (pendingLogPull == null) return;
    const item = buildDailyLogItems(logEntries).find((i) => i.sourceIndex === pendingLogPull);
    if (item) {
      selectLogEntry(item.id);
    }
    onPendingLogPullConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLogPull]);

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-md">
      <h1 className="text-2xl sm:text-3xl font-bold text-center leading-tight">
        Mark Generator
      </h1>

      <p className="text-center text-gray-600 mt-2">
        Generate professional evaluation bullets.
      </p>

      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
        <p className="text-sm font-semibold text-blue-900">Pull From Daily Log</p>
        <p className="mt-1 text-xs text-blue-800">
          Pick a Daily Log entry and it will be pulled into Action automatically.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={() => handleStepLogEntry(-1)}
              disabled={dailyLogItems.length < 2}
              className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Previous daily log entry"
              title="Previous"
            >
              ←
            </button>

            <select
              value={selectedLogEntryId}
              onChange={(e) => selectLogEntry(e.target.value)}
              className="w-full rounded-md border p-2 text-sm"
              disabled={dailyLogItems.length === 0}
            >
              {dailyLogItems.length > 0 && <option value="">Daily Log Entry</option>}
              {dailyLogItems.length === 0 && <option value="">No Daily Log entries available</option>}
              {dailyLogItems.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.preview}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handleStepLogEntry(1)}
              disabled={dailyLogItems.length < 2}
              className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Next daily log entry"
              title="Next"
            >
              →
            </button>
          </div>
        </div>

        {selectedLogEntryId && (
          <p className="mt-2 whitespace-pre-line text-xs text-blue-900">
            {dailyLogItems.find((entry) => entry.id === selectedLogEntryId)?.text}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <label className="text-sm font-medium">Action:</label>
        <button
          onClick={() => {
            setInput("");
            setMissionImpact("");
          }}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          Clear
        </button>
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="mt-2 h-36 w-full border rounded-md p-3"
        placeholder={"What did you do? (Action or Task)\nExample: Led 06 airmen in physical fitness sessions."}
      />

      <div className="mt-6 flex items-center justify-between gap-3">
        <label className="text-sm font-medium">Impact:</label>
        <div className="flex flex-nowrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAiRecommendationEnabled((prev) => !prev)}
            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
              aiRecommendationEnabled
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
            aria-pressed={aiRecommendationEnabled}
          >
            AI Recommendation {aiRecommendationEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={() => setMissionImpact("")}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            Clear
          </button>
        </div>
      </div>
      <textarea
        value={missionImpact}
        onChange={(e) => setMissionImpact(e.target.value)}
        className="mt-2 h-24 w-full border rounded-md p-3"
        placeholder={"Optional (Highly Recommended): What was the result or mission impact?\nExample: 03 airmen graduated AST A-School"}
      />
      {impactLoading && aiRecommendationEnabled && (
        <p className="mt-2 text-xs text-blue-700">AI is recommending an impact...</p>
      )}

      <label className="block mt-6 text-sm font-medium">Category (optional - AI will suggest if blank)</label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="mt-2 w-full border rounded-md p-3"
      >
        <option value="">Auto (AI suggests)</option>
        <option>Military Bearing</option>
        <option>Customs, Courtesies and Traditions</option>
        <option>Quality of Work</option>
        <option>Technical Proficiency</option>
        <option>Initiative</option>
        <option>Decision Making and Problem Solving</option>
        <option>Military Readiness</option>
        <option>Self Awareness and Learning</option>
        <option>Team Building</option>
        <option>Respect for Others</option>
        <option>Accountability and Responsibility</option>
        <option>Influencing Others</option>
        <option>Effective Communication</option>
      </select>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <input
          placeholder="People affected"
          value={peopleAffected}
          onChange={(e) => setPeopleAffected(e.target.value)}
          className="border rounded-md p-3"
        />

        <input
          placeholder="Percent improved"
          value={percentImproved}
          onChange={(e) => setPercentImproved(e.target.value)}
          className="border rounded-md p-3"
        />

        <input
          placeholder="Hours saved"
          value={hoursSaved}
          onChange={(e) => setHoursSaved(e.target.value)}
          className="border rounded-md p-3"
        />
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
        >
          {loading ? "Generating..." : "Generate Bullet"}
        </button>
        <button
          type="button"
          onClick={handleGenerateMarkAsIs}
          disabled={loading}
          className="px-6 py-2 rounded-md border border-green-600 bg-green-600 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
        >
          {loading ? "Committing..." : "Generate Mark As Is"}
        </button>
      </div>

      {isBulletModalOpen && bullet && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:items-center">
          <div className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl [WebkitOverflowScrolling:touch] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Generated Bullet</h2>
              <button
                onClick={() => setIsBulletModalOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
              >
                Exit
              </button>
            </div>

            <div className="mt-4 rounded-md border bg-gray-50 p-4">
              <p className="text-sm text-gray-800">{bullet.text}</p>
              {!wasCategoryUserSelected && bullet.category && (
                <p className="mt-3 text-sm font-medium text-blue-700">
                  AI Recommended Category: {bullet.category}
                </p>
              )}

              {splitBulletRecommendationLoading && (
                <p className="mt-3 text-sm text-blue-700">
                  AI is checking whether this accomplishment should be split into multiple marks...
                </p>
              )}

              {!splitBulletRecommendationLoading && splitBulletRecommendation && (
                <div
                  className={`mt-3 rounded-md border p-3 text-sm ${
                    splitBulletRecommendation.shouldSplit
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-blue-200 bg-blue-50 text-blue-900"
                  }`}
                >
                  <p className="font-semibold">
                    {splitBulletRecommendation.shouldSplit
                      ? "AI Split Recommendation: Consider a separate bullet"
                      : "AI Split Recommendation: Keep as one bullet"}
                  </p>
                  {splitBulletRecommendation.reason && (
                    <p className="mt-1">{splitBulletRecommendation.reason}</p>
                  )}
                  {splitBulletRecommendation.shouldSplit && splitBulletRecommendation.splitActions.length > 0 && (
                    <>
                      <p className="mt-2 font-medium">Suggested separate prompts:</p>
                      <div className="mt-2 space-y-1">
                        {splitBulletRecommendation.splitActions.map((action, index) => (
                          <p key={`${action}-${index}`}>{index + 1}. {action}</p>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsBulletModalOpen(false);
                          void handleApplySplitRecommendation();
                        }}
                        className="mt-3 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                      >
                        Generate Separate Drafts
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? "Reprompting..." : "Reprompt"}
              </button>
              <button
                onClick={() => {
                  setIsBulletModalOpen(false);
                  // Close the modal immediately, then switch to History via parent commit handler.
                  setTimeout(() => {
                    handleCommitBullet();
                  }, 0);
                }}
                className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
              >
                Commit as Mark
              </button>
            </div>
          </div>
        </div>
      )}

      {isSplitDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:items-center">
          <div className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl [WebkitOverflowScrolling:touch] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Split Mark Drafts</h2>
              <button
                onClick={() => {
                  setIsSplitDraftModalOpen(false);
                  handleClearSplitBulletDrafts();
                }}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
              >
                Exit
              </button>
            </div>

            {splitBulletDraftsLoading && (
              <p className="mt-4 text-sm text-blue-700">
                AI is generating separate mark drafts so you can choose which ones to commit...
              </p>
            )}

            {!splitBulletDraftsLoading && splitBulletDrafts.length > 0 && (
              <>
                <p className="mt-4 text-sm text-gray-600">
                  Each draft below was generated from its own split prompt. Choose which marks to commit to history.
                </p>

                <div className="mt-4 space-y-3">
                  {splitBulletDrafts.map((draft) => {
                    const isSelected = selectedSplitDraftIds.includes(draft.id);
                    const isReprompting = splitBulletDraftRepromptingId === draft.id;

                    return (
                      <div
                        key={draft.id}
                        className={`block rounded-lg border p-4 ${
                          isSelected ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSplitDraftIds((prev) =>
                                  prev.includes(draft.id) ? prev : [...prev, draft.id]
                                );
                                return;
                              }

                              setSelectedSplitDraftIds((prev) => prev.filter((id) => id !== draft.id));
                            }}
                            className="mt-1"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm italic text-gray-900">Prompt: {draft.action}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{draft.text}</p>
                            <p className="mt-2 text-xs font-medium text-blue-700">Category: {draft.category}</p>
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => void handleRepromptSplitBulletDraft(draft.id)}
                                disabled={isReprompting}
                                className="rounded-md border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isReprompting ? "Reprompting..." : "Reprompt"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSplitDraftModalOpen(false);
                      handleClearSplitBulletDrafts();
                    }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSplitDraftModalOpen(false);
                      handleCommitSplitBulletDrafts(selectedSplitDraftIds);
                    }}
                    disabled={selectedSplitDraftIds.length === 0}
                    className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                  >
                    Commit Selected
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}