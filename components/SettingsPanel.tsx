import { useRef, useState } from "react";

type ArchivedMarkingPeriod = {
  period: string;
  archivedAt: string;
  marks: Array<{
    text: string;
    date: string;
    dates?: string[];
    category?: string;
    markingPeriod?: string;
    title?: string;
  }>;
};

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
  aiGeneratorSplitRecommendationsEnabled: boolean;
  setAiGeneratorSplitRecommendationsEnabled: (value: boolean) => void;
  aiGeneratorAlternateDraftsEnabled: boolean;
  setAiGeneratorAlternateDraftsEnabled: (value: boolean) => void;
  premiumFeaturesEnabled?: boolean;
  betaTrialExpiresAt?: string | null;
  betaTrialActive?: boolean;
  billingBusy?: boolean;
  onUpgradeToPremium?: () => void;
  onRedeemBetaCode?: (code: string) => Promise<{ ok: boolean; message: string }>;
  aiLogImportEnabled: boolean;
  setAiLogImportEnabled: (value: boolean) => void;
  aiDashboardInsightsEnabled: boolean;
  setAiDashboardInsightsEnabled: (value: boolean) => void;
  aiMarksPackageEnabled: boolean;
  setAiMarksPackageEnabled: (value: boolean) => void;
  darkModeEnabled: boolean;
  setDarkModeEnabled: (value: boolean) => void;
  tacticalColorSchemeEnabled: boolean;
  setTacticalColorSchemeEnabled: (value: boolean) => void;
  highContrastEnabled: boolean;
  setHighContrastEnabled: (value: boolean) => void;
  historyCount: number;
  archivedMarkingPeriods: ArchivedMarkingPeriod[];
  settingsMessage: string;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onImportArchivedMarks: (period: string, markIndexes?: number[]) => void;
  onDeleteArchivedMarkingPeriod: (period: string) => void;
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
  aiGeneratorSplitRecommendationsEnabled,
  setAiGeneratorSplitRecommendationsEnabled,
  aiGeneratorAlternateDraftsEnabled,
  setAiGeneratorAlternateDraftsEnabled,
  premiumFeaturesEnabled = false,
  betaTrialExpiresAt = null,
  betaTrialActive = false,
  billingBusy = false,
  onUpgradeToPremium,
  onRedeemBetaCode,
  aiLogImportEnabled,
  setAiLogImportEnabled,
  aiDashboardInsightsEnabled,
  setAiDashboardInsightsEnabled,
  aiMarksPackageEnabled,
  setAiMarksPackageEnabled,
  darkModeEnabled,
  setDarkModeEnabled,
  tacticalColorSchemeEnabled,
  setTacticalColorSchemeEnabled,
  highContrastEnabled,
  setHighContrastEnabled,
  historyCount,
  archivedMarkingPeriods,
  settingsMessage,
  onExportBackup,
  onImportBackup,
  onImportArchivedMarks,
  onDeleteArchivedMarkingPeriod,
  onClearAllBullets,
  onClearDailyLog,
  onReviewTutorial,
  onDeleteAccount,
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [generatorTabAiOpen, setGeneratorTabAiOpen] = useState(false);
  const [expandedArchivedPeriods, setExpandedArchivedPeriods] = useState<Record<string, boolean>>({});
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSource, setImportSource] = useState<"archive" | "file">(
    archivedMarkingPeriods.length > 0 ? "archive" : "file"
  );
  const [selectedImportPeriod, setSelectedImportPeriod] = useState(archivedMarkingPeriods[0]?.period ?? "");
  const [selectedArchivedMarkIndexes, setSelectedArchivedMarkIndexes] = useState<number[]>([]);
  const [deleteArchiveTarget, setDeleteArchiveTarget] = useState<ArchivedMarkingPeriod | null>(null);
  const [betaCode, setBetaCode] = useState("");
  const [betaMessage, setBetaMessage] = useState("");
  const [betaBusy, setBetaBusy] = useState(false);

  const restrictToRankAndRate = isGuestSession;
  const selectedArchive = archivedMarkingPeriods.find((entry) => entry.period === selectedImportPeriod) ?? null;

  const openImportModal = () => {
    const defaultPeriod = archivedMarkingPeriods[0]?.period ?? "";
    setImportSource(archivedMarkingPeriods.length > 0 ? "archive" : "file");
    setSelectedImportPeriod(defaultPeriod);
    setSelectedArchivedMarkIndexes(
      archivedMarkingPeriods[0]?.marks.map((_, index) => index) ?? []
    );
    setImportModalOpen(true);
  };
  const handleImportPeriodChange = (period: string) => {
    setSelectedImportPeriod(period);
    const nextArchive = archivedMarkingPeriods.find((entry) => entry.period === period);
    setSelectedArchivedMarkIndexes(nextArchive?.marks.map((_, index) => index) ?? []);
  };

  const toggleArchivedMark = (index: number) => {
    setSelectedArchivedMarkIndexes((prev) =>
      prev.includes(index) ? prev.filter((value) => value !== index) : [...prev, index].sort((a, b) => a - b)
    );
  };

  const handleRedeemBeta = async () => {
    if (!onRedeemBetaCode) {
      return;
    }

    setBetaBusy(true);
    setBetaMessage("");

    try {
      const result = await onRedeemBetaCode(betaCode);
      setBetaMessage(result.message);
      if (result.ok) {
        setBetaCode("");
      }
    } catch {
      setBetaMessage("Unable to redeem beta code.");
    } finally {
      setBetaBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-semibold text-(--text-strong)">Settings</h2>
        <p className="mt-1 text-sm text-supporting">Manage your defaults, AI behavior, appearance, and data controls.</p>
      </div>
      <div className="h-px bg-(--border-muted) opacity-60" />
      <div className="bg-(--surface-1) p-4 sm:p-8 rounded-xl shadow-md space-y-8">

      <section className="space-y-4 rounded-lg bg-(--surface-2) p-4 sm:p-5">
        <h3 className="section-title-tertiary">User Profile</h3>
        <p className="text-sm text-supporting">
          Set defaults used across generators and marks package workflows.
        </p>
        {restrictToRankAndRate ? (
          <p className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning)">
            Guest mode: only Rank and Rate can be changed.
          </p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Rank</label>
            <select
              value={rankLevel}
              onChange={(e) => setRankLevel(e.target.value)}
              className="settings-control mt-2 w-full border rounded-md p-3"
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
              className="settings-control mt-2 w-full border rounded-md p-3"
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
              className="settings-control mt-2 w-full border rounded-md p-3"
            />
            <p className="mt-1 text-xs text-(--text-soft)">Format: Last, First, MI</p>
          </div>

          <div>
            <label className="block text-sm font-medium">Unit/Command (Optional)</label>
            <input
              type="text"
              value={userUnit}
              onChange={(e) => setUserUnit(e.target.value)}
              placeholder="e.g. Sector Boston"
              disabled={restrictToRankAndRate}
              className="settings-control mt-2 w-full border rounded-md p-3"
            />
          </div>
        </div>
      </section>

      {!restrictToRankAndRate ? (
        <section className="space-y-4 rounded-lg bg-(--surface-2) p-4 sm:p-5">
          <h3 className="section-title-tertiary">Beta Access</h3>
          <p className="text-sm text-supporting">
            Enter your invite code to enable Premium features for 14 days.
          </p>

          {betaTrialActive && betaTrialExpiresAt ? (
            <div className="rounded-md border px-3 py-2 text-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, var(--color-surface-1))', borderColor: 'var(--color-success)', color: 'var(--color-success)' }}>
              Beta access is active through {new Date(betaTrialExpiresAt).toLocaleString()}.
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={betaCode}
                onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                placeholder="Enter beta code"
                disabled={betaBusy || billingBusy}
                className="settings-control w-full sm:max-w-xs border rounded-md p-3"
              />
              <button
                type="button"
                onClick={() => void handleRedeemBeta()}
                disabled={!betaCode.trim() || betaBusy || billingBusy || !onRedeemBetaCode}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {betaBusy ? "Redeeming..." : "Redeem Code"}
              </button>
            </div>
          )}

          {betaMessage ? (
            <p className="text-sm text-supporting">{betaMessage}</p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg bg-(--surface-2) p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setAiSettingsOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="section-title-tertiary">AI Generation Settings</h3>
          <svg
            className={`h-5 w-5 shrink-0 text-(--text-soft) transition-transform duration-200 ${aiSettingsOpen ? "rotate-180" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {aiSettingsOpen && (
          <>
          {!restrictToRankAndRate && !premiumFeaturesEnabled ? (
            <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <p className="font-semibold">Refine/improve features are Premium-only.</p>
              <p className="mt-1">Upgrade to enable split recommendations and alternate drafts.</p>
              {onUpgradeToPremium ? (
                <button
                  type="button"
                  onClick={onUpgradeToPremium}
                  className="mt-2 btn-primary rounded-md px-3 py-2 text-xs font-semibold"
                >
                  Upgrade to Premium
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <label className="block text-sm font-medium">
              Bullet Style
              {!premiumFeaturesEnabled && !restrictToRankAndRate && (
                <span className="ml-2 text-xs font-normal text-(--color-primary)">(Premium)</span>
              )}
            </label>
          <select
            value={premiumFeaturesEnabled ? bulletStyle : "Short/Concise"}
            onChange={(e) => setBulletStyle(e.target.value)}
            disabled={restrictToRankAndRate || !premiumFeaturesEnabled}
            className="settings-control mt-2 w-full md:w-96 border rounded-md p-3"
          >
            <option>Short/Concise</option>
            <option>Standard</option>
            <option>Detailed</option>
          </select>
          <p className="mt-2 text-xs text-(--text-soft)">
            This default is sent to the bullet generator prompt each time you generate.
            {!premiumFeaturesEnabled && !restrictToRankAndRate && (
              <> Upgrade to Premium to change this setting.</>  
            )}
          </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="settings-option-card rounded-md">
            <button
              type="button"
              onClick={() => setGeneratorTabAiOpen((o) => !o)}
              className="flex w-full items-start justify-between gap-3 p-3 text-left"
            >
              <span>
                <span className="block text-sm font-medium text-(--text-strong)">Generator Tab AI</span>
                <span className="text-xs text-(--text-soft)">Expand to configure bullet generation, split recommendations, and alternate category drafts.</span>
              </span>
              <svg
                className={`h-5 w-5 shrink-0 text-(--text-soft) transition-transform duration-200 ${generatorTabAiOpen ? "rotate-180" : ""}`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {generatorTabAiOpen && (
              <div className="space-y-2 p-3">
                <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={aiGeneratorEnabled}
                    onChange={(e) => setAiGeneratorEnabled(e.target.checked)}
                    disabled={restrictToRankAndRate}
                  />
                  <span>
                    <span className="block text-sm font-medium text-(--text-strong)">Bullet Generation</span>
                    <span className="text-xs text-(--text-soft)">Use AI to generate bullets in the Generator tab.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={aiGeneratorSplitRecommendationsEnabled}
                    onChange={(e) => setAiGeneratorSplitRecommendationsEnabled(e.target.checked)}
                    disabled={restrictToRankAndRate || !premiumFeaturesEnabled}
                  />
                  <span>
                    <span className="block text-sm font-medium text-(--text-strong)">Split Recommendations</span>
                    <span className="text-xs text-(--text-soft)">Show AI recommendation for splitting one action into multiple marks.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={aiGeneratorAlternateDraftsEnabled}
                    onChange={(e) => setAiGeneratorAlternateDraftsEnabled(e.target.checked)}
                    disabled={restrictToRankAndRate || !premiumFeaturesEnabled}
                  />
                  <span>
                    <span className="block text-sm font-medium text-(--text-strong)">Alternate Drafts</span>
                    <span className="text-xs text-(--text-soft)">Show alternate category recommendations and allow generating alternate-category drafts.</span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={aiLogImportEnabled}
              onChange={(e) => setAiLogImportEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-(--text-strong)">Daily Log Tab AI</span>
              <span className="text-xs text-(--text-soft)">Use AI file parsing for Word/PDF note imports.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={aiDashboardInsightsEnabled}
              onChange={(e) => setAiDashboardInsightsEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-(--text-strong)">Dashboard Tab AI</span>
              <span className="text-xs text-(--text-soft)">Use AI insights, category evaluation, and rewording recommendations.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={aiMarksPackageEnabled}
              onChange={(e) => setAiMarksPackageEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-(--text-strong)">Marks Package Tab AI</span>
              <span className="text-xs text-(--text-soft)">Use AI to generate package summaries and supervisor notes.</span>
            </span>
          </label>
          </div>
          </>
        )}
      </section>

      <section className="rounded-lg bg-(--surface-2) p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setAppearanceOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="section-title-tertiary">Appearance</h3>
          <svg
            className={`h-5 w-5 shrink-0 text-(--text-soft) transition-transform duration-200 ${appearanceOpen ? "rotate-180" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {appearanceOpen && (
          <div className="mt-4 space-y-4">
          <p className="text-sm text-(--text-soft)">
          Adjust readability and color scheme preferences for the full app.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={darkModeEnabled}
              onChange={(e) => {
                const checked = e.target.checked;
                setDarkModeEnabled(checked);
                if (checked) {
                  setTacticalColorSchemeEnabled(false);
                }
              }}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-(--text-strong)">Dark Color Scheme</span>
              <span className="text-xs text-(--text-soft)">Switches the app to a darker surface and text palette.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={tacticalColorSchemeEnabled}
              onChange={(e) => {
                const checked = e.target.checked;
                setTacticalColorSchemeEnabled(checked);
                if (checked) {
                  setDarkModeEnabled(false);
                }
              }}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-(--text-strong)">Tactical Color Scheme</span>
              <span className="text-xs text-(--text-soft)">Applies the charcoal, slate, and green tactical palette. This cannot be enabled at the same time as Dark Color Scheme.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md bg-(--surface-2) p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={highContrastEnabled}
              onChange={(e) => setHighContrastEnabled(e.target.checked)}
              disabled={restrictToRankAndRate}
            />
            <span>
              <span className="block text-sm font-medium text-(--text-strong)">High Contrast</span>
              <span className="text-xs text-(--text-soft)">Increases text contrast and makes control outlines easier to see.</span>
            </span>
          </label>
          </div>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg bg-(--surface-2) p-4 sm:p-5">
        <h3 className="section-title-tertiary">Data Management</h3>
        <p className="text-sm text-supporting">Saved bullets: {historyCount}</p>
        <p className="text-sm text-supporting">Archived marking periods: {archivedMarkingPeriods.length}</p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExportBackup}
            disabled={restrictToRankAndRate}
            className="btn-secondary px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Backup
          </button>

          <button
            onClick={openImportModal}
            disabled={restrictToRankAndRate}
            className="btn-secondary px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            Import Backup
          </button>

          <button
            onClick={onClearAllBullets}
            disabled={restrictToRankAndRate}
            className="px-4 py-2 rounded-md bg-(--color-danger) text-(--color-text-on-strong) text-sm font-medium hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Official Marks
          </button>

          <button
            onClick={onClearDailyLog}
            disabled={restrictToRankAndRate}
            className="px-4 py-2 rounded-md bg-(--color-danger) text-(--color-text-on-strong) text-sm font-medium hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
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
              setImportModalOpen(false);
              onImportBackup(file);
            }
            e.currentTarget.value = "";
          }}
        />

        {settingsMessage && <p className="text-sm text-(--text-strong)">{settingsMessage}</p>}

        <div className="rounded-lg bg-(--surface-1) p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-(--text-strong)">Archived Marking Periods</h4>
              <p className="mt-1 text-xs text-(--text-soft)">
                Review archived periods here, then use Import Backup to pull an entire archived period or selected marks back into Official Marks.
              </p>
            </div>
          </div>

          {archivedMarkingPeriods.length === 0 ? (
            <p className="mt-3 text-sm text-(--text-soft)">No archived marking periods yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {archivedMarkingPeriods.map((archive) => {
                const archiveKey = `${archive.period}-${archive.archivedAt}`;
                const isOpen = expandedArchivedPeriods[archiveKey] === true;

                return (
                  <div key={archiveKey} className="overflow-hidden rounded-lg border border-(--border-muted)">
                    <div className="flex flex-col gap-3 bg-(--surface-2) px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedArchivedPeriods((prev) => ({
                            ...prev,
                            [archiveKey]: !isOpen,
                          }))
                        }
                        className="flex min-w-0 flex-1 items-center justify-between text-left"
                      >
                        <div>
                          <p className="text-sm font-semibold text-(--text-strong)">{archive.period}</p>
                          <p className="mt-1 text-xs text-(--text-soft)">
                            Archived {new Date(archive.archivedAt).toLocaleString()} • {archive.marks.length} marks
                          </p>
                        </div>
                        <span className="ml-3 text-xs text-(--text-soft)">{isOpen ? "Hide" : "Review"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteArchiveTarget(archive)}
                        className="rounded-md border border-(--color-danger) px-3 py-2 text-xs font-semibold text-(--color-danger) transition hover:bg-(--color-danger-soft)"
                      >
                        Delete
                      </button>
                    </div>

                    {isOpen && (
                      <div className="space-y-3 px-4 py-4">
                        {archive.marks.map((mark, index) => (
                          <div key={`${archiveKey}-${index}`} className="rounded-md border border-(--border-muted) bg-(--surface-2) p-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm font-medium text-(--text-strong)">{mark.title || "Official Mark"}</p>
                              <p className="text-xs text-(--text-soft)">
                                {mark.date ? new Date(mark.date).toLocaleDateString() : "Not Dated"}
                              </p>
                            </div>
                            {mark.category && (
                              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-(--text-soft)">{mark.category}</p>
                            )}
                            <p className="mt-2 text-sm text-(--text-strong)">{mark.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-(--border-muted) bg-(--surface-1) p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-(--text-strong)">Import Backup</h3>
                <p className="mt-1 text-sm text-(--text-soft)">
                  Restore official marks from a backup JSON file or from an archived marking period.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setImportSource("archive")}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  importSource === "archive" ? "btn-primary" : "btn-secondary"
                }`}
                disabled={archivedMarkingPeriods.length === 0}
              >
                Archived Marking Periods
              </button>
              <button
                type="button"
                onClick={() => setImportSource("file")}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  importSource === "file" ? "btn-primary" : "btn-secondary"
                }`}
              >
                Backup JSON File
              </button>
            </div>

            {importSource === "archive" ? (
              <div className="mt-5 space-y-4">
                {archivedMarkingPeriods.length === 0 ? (
                  <p className="text-sm text-(--text-soft)">No archived marking periods are available to import.</p>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-(--text-strong)">Archived Marking Period</label>
                      <select
                        value={selectedImportPeriod}
                        onChange={(e) => handleImportPeriodChange(e.target.value)}
                        className="settings-control mt-2 w-full rounded-md border p-3"
                      >
                        {archivedMarkingPeriods.map((archive) => (
                          <option key={`${archive.period}-${archive.archivedAt}`} value={archive.period}>
                            {archive.period} ({archive.marks.length} marks)
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedArchive && (
                      <div className="rounded-lg border border-(--border-muted) bg-(--surface-2) p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-(--text-strong)">{selectedArchive.period}</p>
                            <p className="mt-1 text-xs text-(--text-soft)">
                              Archived {new Date(selectedArchive.archivedAt).toLocaleString()} • {selectedArchive.marks.length} marks
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedArchivedMarkIndexes(selectedArchive.marks.map((_, index) => index))}
                              className="btn-secondary rounded-md px-3 py-2 text-xs font-medium"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedArchivedMarkIndexes([])}
                              className="btn-secondary rounded-md px-3 py-2 text-xs font-medium"
                            >
                              Clear Selection
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteArchiveTarget(selectedArchive);
                                setImportModalOpen(false);
                              }}
                              className="rounded-md border border-(--color-danger) px-3 py-2 text-xs font-semibold text-(--color-danger) transition hover:bg-(--color-danger-soft)"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onImportArchivedMarks(selectedArchive.period);
                                setImportModalOpen(false);
                              }}
                              className="btn-primary rounded-md px-3 py-2 text-xs font-semibold"
                            >
                              Import All Marks
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {selectedArchive.marks.map((mark, index) => {
                            const selected = selectedArchivedMarkIndexes.includes(index);

                            return (
                              <label
                                key={`${selectedArchive.period}-${index}`}
                                className="flex gap-3 rounded-md border border-(--border-muted) bg-(--surface-1) p-3"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4"
                                  checked={selected}
                                  onChange={() => toggleArchivedMark(index)}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-sm font-medium text-(--text-strong)">{mark.title || "Official Mark"}</span>
                                    <span className="text-xs text-(--text-soft)">
                                      {mark.date ? new Date(mark.date).toLocaleDateString() : "Not Dated"}
                                    </span>
                                  </span>
                                  {mark.category && (
                                    <span className="mt-2 block text-xs font-medium uppercase tracking-wide text-(--text-soft)">
                                      {mark.category}
                                    </span>
                                  )}
                                  <span className="mt-2 block text-sm text-(--text-strong)">{mark.text}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>

                        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={() => setImportModalOpen(false)}
                            className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onImportArchivedMarks(selectedArchive.period, selectedArchivedMarkIndexes);
                              setImportModalOpen(false);
                            }}
                            disabled={selectedArchivedMarkIndexes.length === 0}
                            className="btn-primary rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Import Selected Marks ({selectedArchivedMarkIndexes.length})
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-(--border-muted) bg-(--surface-2) p-4">
                <p className="text-sm text-(--text-soft)">
                  Choose a backup JSON file to restore saved data into this account.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="btn-primary rounded-md px-4 py-2 text-sm font-medium"
                  >
                    Choose Backup File
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(false)}
                    className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteArchiveTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-xl border border-(--border-muted) bg-(--surface-1) p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-(--text-strong)">Delete Archived Marking Period?</h3>
            <p className="mt-3 text-sm text-(--text-soft)">
              Deleting {deleteArchiveTarget.period} will permanently remove every archived mark in this marking period.
            </p>
            <p className="mt-2 text-sm text-(--text-soft)">
              If you continue, these marks will be gone forever and cannot be recovered from the archive.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteArchiveTarget(null)}
                className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteArchivedMarkingPeriod(deleteArchiveTarget.period);
                  if (selectedImportPeriod === deleteArchiveTarget.period) {
                    const nextArchive = archivedMarkingPeriods.find(
                      (archive) => archive.period !== deleteArchiveTarget.period
                    );
                    setSelectedImportPeriod(nextArchive?.period ?? "");
                    setSelectedArchivedMarkIndexes(nextArchive?.marks.map((_, index) => index) ?? []);
                  }
                  setDeleteArchiveTarget(null);
                }}
                className="rounded-md bg-(--color-danger) px-4 py-2 text-sm font-semibold text-(--color-text-on-strong) hover:brightness-95"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-4 rounded-lg bg-(--surface-2) p-4 sm:p-5">
        <h3 className="section-title-tertiary">Help</h3>
        <p className="text-sm text-(--text-soft)">
          Reopen the quick tutorial for a refresher on how each tab is meant to be used.
        </p>
        <button
          onClick={onReviewTutorial}
          disabled={restrictToRankAndRate}
          className="btn-secondary px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          Review Tutorial
        </button>
      </section>

      {!restrictToRankAndRate && (
      <section className="space-y-4 rounded-lg bg-(--color-danger-soft) p-4 sm:p-5">
        <h3 className="section-title-tertiary" style={{color: 'var(--color-danger)'}}>Danger Zone</h3>
        <p className="text-sm text-(--color-danger)">
          Permanently delete your account. This cannot be undone. All saved data will be lost.
        </p>
        <button
          onClick={onDeleteAccount}
          className="px-4 py-2 rounded-md border border-(--color-danger) bg-(--color-danger) text-(--color-text-on-strong) text-sm font-medium hover:brightness-95"
        >
          Delete Account
        </button>
      </section>
      )}
    </div>
    </div>
  );
}
