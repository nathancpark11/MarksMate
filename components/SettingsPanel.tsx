import { useRef, useState } from "react";

type SettingsPanelProps = {
  isGuestSession?: boolean;
  rankLevel: string;
  setRankLevel: (value: string) => void;
  rating: string;
  setRating: (value: string) => void;
  userName: string;
  setUserName: (value: string) => void;
  userUnit: string;
  setUserUnit: (value: string) => void;
  bulletStyle: string;
  setBulletStyle: (value: string) => void;
  aiGeneratorEnabled: boolean;
  setAiGeneratorEnabled: (value: boolean) => void;
  aiLogImportEnabled: boolean;
  setAiLogImportEnabled: (value: boolean) => void;
  aiDashboardInsightsEnabled: boolean;
  setAiDashboardInsightsEnabled: (value: boolean) => void;
  aiMarksPackageEnabled: boolean;
  setAiMarksPackageEnabled: (value: boolean) => void;
  darkModeEnabled: boolean;
  setDarkModeEnabled: (value: boolean) => void;
  highContrastEnabled: boolean;
  setHighContrastEnabled: (value: boolean) => void;
  historyCount: number;
  settingsMessage: string;
  guidanceUploadBusy: boolean;
  guidanceUploadStatus: {
    fileName: string;
    status: "uploading" | "uploaded" | "failed";
    detail?: string;
  } | null;
  guidanceUploadHistory: Array<{
    rank: string;
    source: string;
    fileName: string;
    outputFile: string;
    chunkCount: number;
    uploadedAt: string;
    uploadedBy: string;
    replacedExisting: boolean;
  }>;
  canManageOfficialGuidance: boolean;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onUploadGuidancePdf: (file: File, ranks: string[]) => void;
  onClearAllBullets: () => void;
  onClearDailyLog: () => void;
  onReviewTutorial: () => void;
  onDeleteAccount: () => void;
};

export default function SettingsPanel({
  isGuestSession = false,
  rankLevel,
  setRankLevel,
  rating,
  setRating,
  userName,
  setUserName,
  userUnit,
  setUserUnit,
  bulletStyle,
  setBulletStyle,
  aiGeneratorEnabled,
  setAiGeneratorEnabled,
  aiLogImportEnabled,
  setAiLogImportEnabled,
  aiDashboardInsightsEnabled,
  setAiDashboardInsightsEnabled,
  aiMarksPackageEnabled,
  setAiMarksPackageEnabled,
  darkModeEnabled,
  setDarkModeEnabled,
  highContrastEnabled,
  setHighContrastEnabled,
  historyCount,
  settingsMessage,
  guidanceUploadBusy,
  guidanceUploadStatus,
  guidanceUploadHistory,
  canManageOfficialGuidance,
  onExportBackup,
  onImportBackup,
  onUploadGuidancePdf,
  onClearAllBullets,
  onClearDailyLog,
  onReviewTutorial,
  onDeleteAccount,
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const guidanceInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);

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
      ? "text-emerald-700"
      : status === "failed"
        ? "text-red-700"
        : status === "uploading"
          ? "text-amber-700"
          : "text-blue-900";
  const statusCardClass =
    status === "uploaded"
      ? "border-emerald-200"
      : status === "failed"
        ? "border-red-200"
        : status === "uploading"
          ? "border-amber-200"
          : "border-blue-200";

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

  const restrictToRankAndRate = isGuestSession;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-md space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-gray-800">User Profile</h3>
        <p className="text-sm text-gray-500">
          Set defaults used across generators and marks package workflows.
        </p>
        {restrictToRankAndRate ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Guest mode: only Rank and Rate can be changed.
          </p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Rank</label>
            <select
              value={rankLevel}
              onChange={(e) => setRankLevel(e.target.value)}
              className="mt-2 w-full border rounded-md p-3"
            >
              <option>E2</option>
              <option>E3</option>
              <option>E4</option>
              <option>E5</option>
              <option>E6</option>
              <option>E7</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Rate</label>
            <select
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="mt-2 w-full border rounded-md p-3"
            >
              <option>AET - Aviation Electrical Technician</option>
              <option>AMT - Aviation Maintenance Technician</option>
              <option>AST - Aviation Survival Technician</option>
              <option>BM - Boatswain&apos;s Mate</option>
              <option>DC - Damage Controlman</option>
              <option>EM - Electrician&apos;s Mate</option>
              <option>ET - Electronics Technician</option>
              <option>GM - Gunner&apos;s Mate</option>
              <option>HS - Health Services Technician</option>
              <option>IS - Intelligence Specialist</option>
              <option>IT - Information Systems Technician</option>
              <option>MA - Maritime Enforcement Specialist</option>
              <option>MK - Machinery Technician</option>
              <option>MST - Marine Science Technician</option>
              <option>MU - Musician</option>
              <option>OS - Operations Specialist</option>
              <option>PA - Public Affairs Specialist</option>
              <option>PS - Personnel Specialist</option>
              <option>SK - Storekeeper</option>
              <option>YN - Yeoman</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Name (Optional)</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Last, First, MI"
              disabled={restrictToRankAndRate}
              className="mt-2 w-full border rounded-md p-3"
            />
            <p className="mt-1 text-xs text-gray-500">Format: Last, First, MI</p>
          </div>

          <div>
            <label className="block text-sm font-medium">Unit/Command (Optional)</label>
            <input
              type="text"
              value={userUnit}
              onChange={(e) => setUserUnit(e.target.value)}
              placeholder="e.g. Sector Boston"
              disabled={restrictToRankAndRate}
              className="mt-2 w-full border rounded-md p-3"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-gray-800">AI Generation Settings</h3>
        <div>
          <label className="block text-sm font-medium">Bullet Style</label>
          <select
            value={bulletStyle}
            onChange={(e) => setBulletStyle(e.target.value)}
            disabled={restrictToRankAndRate}
            className="mt-2 w-full md:w-96 border rounded-md p-3"
          >
            <option>Short/Concise</option>
            <option>Standard</option>
            <option>Detailed</option>
          </select>
          <p className="mt-2 text-xs text-gray-500">
            This default is sent to the bullet generator prompt each time you generate.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={aiGeneratorEnabled}
              onChange={(e) => setAiGeneratorEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Generator Tab AI</span>
              <span className="text-xs text-gray-500">Use AI for bullet generation, split recommendations, and alternate drafts.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={aiLogImportEnabled}
              onChange={(e) => setAiLogImportEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Daily Log Tab AI</span>
              <span className="text-xs text-gray-500">Use AI file parsing for Word/PDF note imports.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={aiDashboardInsightsEnabled}
              onChange={(e) => setAiDashboardInsightsEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Dashboard Tab AI</span>
              <span className="text-xs text-gray-500">Use AI insights, category evaluation, and rewording recommendations.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={aiMarksPackageEnabled}
              onChange={(e) => setAiMarksPackageEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Marks Package Tab AI</span>
              <span className="text-xs text-gray-500">Use AI to generate package summaries and supervisor notes.</span>
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-gray-800">Appearance</h3>
        <p className="text-sm text-gray-500">
          Adjust readability and color scheme preferences for the full app.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={darkModeEnabled}
              onChange={(e) => setDarkModeEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Dark Color Scheme</span>
              <span className="text-xs text-gray-500">Switches the app to a darker surface and text palette.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={highContrastEnabled}
              onChange={(e) => setHighContrastEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">High Contrast</span>
              <span className="text-xs text-gray-500">Increases text contrast and makes control outlines easier to see.</span>
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-gray-800">Data Management</h3>
        <p className="text-sm text-gray-500">Saved bullets: {historyCount}</p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExportBackup}
            disabled={restrictToRankAndRate}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Backup
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
            disabled={restrictToRankAndRate}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Import Backup
          </button>

          <button
            onClick={onClearAllBullets}
            disabled={restrictToRankAndRate}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Official Marks
          </button>

          <button
            onClick={onClearDailyLog}
            disabled={restrictToRankAndRate}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Daily Log
          </button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onImportBackup(file);
            }
            e.currentTarget.value = "";
          }}
        />

        {settingsMessage && <p className="text-sm text-gray-700">{settingsMessage}</p>}
      </section>

      {canManageOfficialGuidance && <section className="official-guidance-admin space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-blue-900">Official Guidance Admin</h3>
        <p className="text-sm text-blue-800">
          Upload rank-specific PDF guidance so AI can reference the correct source for E3-E7.
        </p>

        <div>
          <label className="block text-sm font-medium text-blue-900">Ranks</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {rankOptions.map((rank) => {
              const isSelected = selectedRanks.includes(rank);
              return (
                <button
                  key={rank}
                  type="button"
                  onClick={() => toggleRank(rank)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    isSelected
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-blue-200 bg-white text-blue-900 hover:bg-blue-100"
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
            className="px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guidanceUploadBusy ? "Uploading..." : "Upload Guidance PDF"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className={`min-w-0 rounded-md border bg-white px-3 py-2 text-xs text-blue-900 md:min-w-88 ${statusCardClass}`}>
            <p className="font-semibold">Upload Status</p>
            <p className="truncate">
              File: {guidanceUploadStatus?.fileName || "No recent upload"}
            </p>
            <p className={statusTextClass}>
              State: {statusLabel}
            </p>
            {guidanceUploadStatus?.detail && (
              <p className="line-clamp-2 text-blue-800">{guidanceUploadStatus.detail}</p>
            )}
          </div>

          <div className="rounded-md border border-blue-200 bg-white px-3 py-2 text-xs text-blue-900">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Upload Log</p>
              <p className="text-[11px] text-blue-700">Permanent history by rank</p>
            </div>
            {guidanceUploadHistory.length ? (
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                {guidanceUploadHistory.map((entry, index) => (
                  <div
                    key={`${entry.rank}-${entry.uploadedAt}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-blue-950">{entry.rank}</p>
                      <p className="truncate text-blue-800">{entry.fileName || entry.outputFile || entry.source}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-blue-800">
                      <p>{formatUploadTimestamp(entry.uploadedAt)}</p>
                      {entry.replacedExisting ? <p>Overwrote prior upload</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-blue-800">No guidance uploads have been logged yet.</p>
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
      </section>}

      <section className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-gray-800">Help</h3>
        <p className="text-sm text-gray-500">
          Reopen the quick tutorial for a refresher on how each tab is meant to be used.
        </p>
        <button
          onClick={onReviewTutorial}
          disabled={restrictToRankAndRate}
          className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Review Tutorial
        </button>
      </section>

      {!restrictToRankAndRate && (
      <section className="space-y-4 rounded-lg border border-red-900 bg-red-600 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-black">Danger Zone</h3>
        <p className="text-sm text-black">
          Permanently delete your account. This cannot be undone. All saved data will be lost.
        </p>
        <button
          onClick={onDeleteAccount}
          className="px-4 py-2 rounded-md border border-red-500 bg-black text-red-500 text-sm font-medium hover:bg-gray-900"
        >
          Delete Account
        </button>
      </section>
      )}
    </div>
  );
}
