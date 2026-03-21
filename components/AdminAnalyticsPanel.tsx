"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ADMIN_ANALYTICS_SESSION_KEY = "adminAnalyticsSnapshot:v1";

type AdminAnalyticsSnapshot = {
  generatedAt: string;
  totals: {
    totalUsers: number;
    activeUsers: number;
    totalBulletsGenerated: number;
    totalCommittedMarks: number;
    averageBulletsPerUser: number;
    averageAiCallsPerUser: number;
    averageTokensPerUser: number;
    totalTokenUsage: number;
    estimatedTotalAiCostUsd: number;
    estimatedAverageCostPerUserUsd: number;
    averageCostPerActiveUserUsd: number;
  };
  usersByRankRate: Array<{ rank: string; rate: string; users: number }>;
  averageCostByRankRate: Array<{ rank: string; rate: string; averageCostUsd: number }>;
  monthlyTrends: Array<{
    month: string;
    newUsers: number;
    activeUsers: number;
    bulletsGenerated: number;
    committedMarks: number;
    aiCalls: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
  mostActiveUsers: Array<{
    userId: string;
    identifier: string;
    rank: string;
    rate: string;
    totalAiCalls: number;
    totalGeneratedBullets: number;
    totalDailyLogs: number;
    estimatedAiCostUsd: number;
  }>;
};

type GuidanceUploadStatus = {
  fileName: string;
  status: "uploading" | "uploaded" | "failed";
  detail?: string;
};

type GuidanceUploadHistoryEntry = {
  rank: string;
  source: string;
  fileName: string;
  outputFile: string;
  chunkCount: number;
  uploadedAt: string;
  uploadedBy: string;
  replacedExisting: boolean;
};

type AdminAnalyticsPanelProps = {
  guidanceUploadBusy: boolean;
  guidanceUploadStatus: GuidanceUploadStatus | null;
  guidanceDeleteBusyRank: string | null;
  guidanceUploadHistory: GuidanceUploadHistoryEntry[];
  onUploadGuidancePdf: (file: File, ranks: string[]) => void;
  onDeleteGuidanceForRank: (rank: string) => void;
};

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

export default function AdminAnalyticsPanel({
  guidanceUploadBusy,
  guidanceUploadStatus,
  guidanceDeleteBusyRank,
  guidanceUploadHistory,
  onUploadGuidancePdf,
  onDeleteGuidanceForRank,
}: AdminAnalyticsPanelProps) {
  const [data, setData] = useState<AdminAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const guidanceInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [guidanceOpen, setGuidanceOpen] = useState(false);

  const rankOptions = ["E3", "E4", "E5", "E6", "E7"];
  const status = guidanceUploadStatus?.status || "idle";
  const statusLabel =
    status === "uploaded"
      ? "Uploaded"
      : status === "failed"
        ? "Failed"
        : status === "uploading"
          ? "Uploading"
          : "Idle";
  const statusTextClass =
    status === "uploaded"
      ? "text-(--color-success)"
      : status === "failed"
        ? "text-(--color-danger)"
        : status === "uploading"
          ? "text-(--color-warning)"
          : "text-(--color-primary)";
  const statusCardClass =
    status === "uploaded"
      ? "border-(--color-success)"
      : status === "failed"
        ? "border-(--color-danger)"
        : status === "uploading"
          ? "border-(--color-warning)"
          : "border-(--color-secondary)";

  const toggleRank = (rank: string) => {
    setSelectedRanks((prev) =>
      prev.includes(rank) ? prev.filter((entry) => entry !== rank) : [...prev, rank]
    );
  };

  const formatUploadTimestamp = (value: string) => {
    if (!value) {
      return "Unknown date";
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  };

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/analytics/overview", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await res.json().catch(() => null)) as
        | AdminAnalyticsSnapshot
        | { error?: string }
        | null;

      if (!res.ok) {
        const message =
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to load admin analytics.";
        throw new Error(message);
      }

      const snapshot = payload as AdminAnalyticsSnapshot;
      setData(snapshot);
      try {
        window.sessionStorage.setItem(ADMIN_ANALYTICS_SESSION_KEY, JSON.stringify(snapshot));
      } catch {
        // Ignore storage write failures and keep in-memory state.
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load admin analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(ADMIN_ANALYTICS_SESSION_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as AdminAnalyticsSnapshot;
      if (parsed && typeof parsed === "object" && typeof parsed.generatedAt === "string") {
        setData(parsed);
      }
    } catch {
      // Ignore corrupted session data.
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError("");

    try {
      const res = await fetch("/api/admin/analytics/export", { method: "GET" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Unable to export analytics.");
      }

      const blob = await res.blob();
      const fileName =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^";]+)"?/)?.[1]
          ?.trim() || "admin-analytics.xlsx";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export analytics.");
    } finally {
      setExporting(false);
    }
  }, []);

  const metricCards = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { label: "Total Users", value: String(data.totals.totalUsers) },
      { label: "Active Users (30d)", value: String(data.totals.activeUsers) },
      { label: "Total Bullets Generated", value: String(data.totals.totalBulletsGenerated) },
      { label: "Total Committed Marks", value: String(data.totals.totalCommittedMarks) },
      { label: "Average Bullets Per User", value: data.totals.averageBulletsPerUser.toFixed(2) },
      { label: "Average AI Calls Per User", value: data.totals.averageAiCallsPerUser.toFixed(2) },
      { label: "Total Token Usage", value: data.totals.totalTokenUsage.toLocaleString() },
      { label: "Estimated Total AI Cost", value: formatUsd(data.totals.estimatedTotalAiCostUsd) },
      {
        label: "Estimated Average Cost Per User",
        value: formatUsd(data.totals.estimatedAverageCostPerUserUsd),
      },
    ];
  }, [data]);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Admin Analytics</h2>
          <p className="text-sm text-slate-600">
            Metrics and cost estimates are generated from server-side data and protected admin APIs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadAnalytics()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            disabled={loading}
          >
            {loading ? "Running..." : "Run Analytics"}
          </button>
          <button
            onClick={() => void handleExport()}
            className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            disabled={exporting || loading}
          >
            {exporting ? "Exporting..." : "Export XLSX"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Running analytics...</p> : null}

      {!loading && !data ? (
        <p className="text-sm text-slate-600">
          No analysis has been run in this session yet. Click <span className="font-semibold">Run Analytics</span>.
        </p>
      ) : null}

      {!loading && data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metricCards.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-900">Users By Rank/Rate</h3>
              <div className="mt-2 max-h-64 overflow-auto text-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-2">Rank</th>
                      <th className="py-1 pr-2">Rate</th>
                      <th className="py-1 text-right">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.usersByRankRate.map((row) => (
                      <tr key={`${row.rank}-${row.rate}`} className="border-t border-slate-100">
                        <td className="py-1 pr-2">{row.rank}</td>
                        <td className="py-1 pr-2">{row.rate}</td>
                        <td className="py-1 text-right">{row.users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-900">Average Cost By Rank/Rate</h3>
              <div className="mt-2 max-h-64 overflow-auto text-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-2">Rank</th>
                      <th className="py-1 pr-2">Rate</th>
                      <th className="py-1 text-right">Avg Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.averageCostByRankRate.map((row) => (
                      <tr key={`${row.rank}-${row.rate}`} className="border-t border-slate-100">
                        <td className="py-1 pr-2">{row.rank}</td>
                        <td className="py-1 pr-2">{row.rate}</td>
                        <td className="py-1 text-right">{formatUsd(row.averageCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-900">Monthly Usage Trend</h3>
              <div className="mt-2 max-h-64 overflow-auto text-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-2">Month</th>
                      <th className="py-1 pr-2 text-right">Users</th>
                      <th className="py-1 pr-2 text-right">AI Calls</th>
                      <th className="py-1 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthlyTrends.map((row) => (
                      <tr key={row.month} className="border-t border-slate-100">
                        <td className="py-1 pr-2">{row.month}</td>
                        <td className="py-1 pr-2 text-right">{row.activeUsers}</td>
                        <td className="py-1 pr-2 text-right">{row.aiCalls}</td>
                        <td className="py-1 text-right">{formatUsd(row.estimatedCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-900">Most Active Users</h3>
              <div className="mt-2 max-h-64 overflow-auto text-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-2">Identifier</th>
                      <th className="py-1 pr-2 text-right">AI Calls</th>
                      <th className="py-1 pr-2 text-right">Bullets</th>
                      <th className="py-1 text-right">Logs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mostActiveUsers.map((row) => (
                      <tr key={row.userId} className="border-t border-slate-100">
                        <td className="py-1 pr-2">{row.identifier}</td>
                        <td className="py-1 pr-2 text-right">{row.totalAiCalls}</td>
                        <td className="py-1 pr-2 text-right">{row.totalGeneratedBullets}</td>
                        <td className="py-1 text-right">{row.totalDailyLogs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <section className="official-guidance-admin rounded-lg border border-(--color-secondary) bg-(--color-secondary-soft)">
        <button
          type="button"
          onClick={() => setGuidanceOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={guidanceOpen}
        >
          <h3 className="text-lg font-semibold text-(--color-primary)">Official Guidance Admin</h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-5 w-5 shrink-0 text-(--color-primary) transition-transform duration-200 ${guidanceOpen ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {guidanceOpen && (
        <div className="space-y-4 border-t border-(--color-secondary) px-4 pb-4 pt-3 sm:px-5">
        <p className="text-sm text-(--color-primary)">
          Upload rank-specific PDF guidance so AI can reference the correct source for E3-E7. Keep PDFs at 3 MB or smaller for deployed uploads.
        </p>

        <div>
          <label className="block text-sm font-medium text-(--color-primary)">Ranks</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {rankOptions.map((rank) => {
              const isSelected = selectedRanks.includes(rank);
              return (
                <button
                  key={rank}
                  type="button"
                  onClick={() => toggleRank(rank)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    isSelected ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {rank}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-start">
          <button
            type="button"
            onClick={() => guidanceInputRef.current?.click()}
            disabled={guidanceUploadBusy}
            className="btn-primary px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guidanceUploadBusy ? "Uploading..." : "Upload Guidance PDF"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className={`min-w-0 rounded-md border bg-(--surface-1) px-3 py-2 text-xs text-(--color-primary) md:min-w-88 ${statusCardClass}`}>
            <p className="font-semibold">Upload Status</p>
            <p className="truncate">
              File: {guidanceUploadStatus?.fileName || "No recent upload"}
            </p>
            <p className={statusTextClass}>
              State: {statusLabel}
            </p>
            {guidanceUploadStatus?.detail && (
              <p className="line-clamp-2 text-(--color-primary)">{guidanceUploadStatus.detail}</p>
            )}
          </div>

          <div className="rounded-md border border-(--color-secondary) bg-(--surface-1) px-3 py-2 text-xs text-(--color-primary)">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Upload Log</p>
              <p className="text-[11px] text-(--color-primary)">Permanent history by rank</p>
            </div>
            {guidanceUploadHistory.length ? (
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                {guidanceUploadHistory.map((entry, index) => (
                  <div
                    key={`${entry.rank}-${entry.uploadedAt}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-md border border-(--color-secondary) bg-(--color-secondary-soft) px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-(--color-primary)">{entry.rank}</p>
                      <p className="truncate text-(--color-primary)">{entry.fileName || entry.outputFile || entry.source}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-(--color-primary)">
                      <div className="flex items-center justify-end gap-2">
                        <p>{formatUploadTimestamp(entry.uploadedAt)}</p>
                        <button
                          type="button"
                          onClick={() => onDeleteGuidanceForRank(entry.rank)}
                          disabled={guidanceDeleteBusyRank !== null}
                          className="rounded border border-(--color-danger) bg-(--color-danger-soft) px-2 py-1 text-[11px] font-medium text-(--color-danger) hover:bg-(--color-danger) hover:text-(--color-text-on-strong) disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {guidanceDeleteBusyRank === entry.rank ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                      {entry.replacedExisting ? <p className="mt-1">Overwrote prior upload</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-(--color-primary)">No guidance uploads have been logged yet.</p>
            )}
          </div>
        </div>

        <input
          ref={guidanceInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUploadGuidancePdf(file, selectedRanks);
            }
            e.currentTarget.value = "";
          }}
        />
        </div>
        )}
      </section>
    </section>
  );
}
