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
  aiGeneratorSplitRecommendationsEnabled: boolean;
  setAiGeneratorSplitRecommendationsEnabled: (value: boolean) => void;
  aiGeneratorAlternateDraftsEnabled: boolean;
  setAiGeneratorAlternateDraftsEnabled: (value: boolean) => void;
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
  settingsMessage: string;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
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
  settingsMessage,
  onExportBackup,
  onImportBackup,
  onClearAllBullets,
  onClearDailyLog,
  onReviewTutorial,
  onDeleteAccount,
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [generatorTabAiOpen, setGeneratorTabAiOpen] = useState(false);

  const restrictToRankAndRate = isGuestSession;

  return (
    <div className="bg-(--surface-1) p-4 sm:p-8 rounded-xl shadow-md space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      <section className="space-y-4 rounded-lg border border-(--border-muted) bg-(--surface-2) p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-(--text-strong)">User Profile</h3>
        <p className="text-sm text-(--text-soft)">
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

      <section className="rounded-lg border border-(--border-muted) bg-(--surface-2) p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setAiSettingsOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="text-lg font-semibold text-(--text-strong)">AI Generation Settings</h3>
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
          <div className="mt-4">
            <label className="block text-sm font-medium">Bullet Style</label>
          <select
            value={bulletStyle}
            onChange={(e) => setBulletStyle(e.target.value)}
            disabled={restrictToRankAndRate}
            className="settings-control mt-2 w-full md:w-96 border rounded-md p-3"
          >
            <option>Short/Concise</option>
            <option>Standard</option>
            <option>Detailed</option>
          </select>
          <p className="mt-2 text-xs text-(--text-soft)">
            This default is sent to the bullet generator prompt each time you generate.
          </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="settings-option-card rounded-md border border-(--border-muted)">
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
              <div className="settings-option-card space-y-2 border-t border-(--border-muted) p-3">
                <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
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

                <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={aiGeneratorSplitRecommendationsEnabled}
                    onChange={(e) => setAiGeneratorSplitRecommendationsEnabled(e.target.checked)}
                    disabled={restrictToRankAndRate}
                  />
                  <span>
                    <span className="block text-sm font-medium text-(--text-strong)">Split Recommendations</span>
                    <span className="text-xs text-(--text-soft)">Show AI recommendation for splitting one action into multiple marks.</span>
                  </span>
                </label>

                <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={aiGeneratorAlternateDraftsEnabled}
                    onChange={(e) => setAiGeneratorAlternateDraftsEnabled(e.target.checked)}
                    disabled={restrictToRankAndRate}
                  />
                  <span>
                    <span className="block text-sm font-medium text-(--text-strong)">Alternate Drafts</span>
                    <span className="text-xs text-(--text-soft)">Show alternate category recommendations and allow generating alternate-category drafts.</span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
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

          <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
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

          <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
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

      <section className="rounded-lg border border-(--border-muted) bg-(--surface-2) p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setAppearanceOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="text-lg font-semibold text-(--text-strong)">Appearance</h3>
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
          <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
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

          <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
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

          <label className="settings-option-card flex items-start gap-3 rounded-md border border-(--border-muted) p-3">
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

      <section className="space-y-4 rounded-lg border border-(--border-muted) bg-(--surface-2) p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-(--text-strong)">Data Management</h3>
        <p className="text-sm text-(--text-soft)">Saved bullets: {historyCount}</p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExportBackup}
            disabled={restrictToRankAndRate}
            className="btn-primary px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Backup
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
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
              onImportBackup(file);
            }
            e.currentTarget.value = "";
          }}
        />

        {settingsMessage && <p className="text-sm text-(--text-strong)">{settingsMessage}</p>}
      </section>

      <section className="space-y-4 rounded-lg border border-(--border-muted) bg-(--surface-2) p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-(--text-strong)">Help</h3>
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
      <section className="space-y-4 rounded-lg border border-(--color-danger) bg-(--color-danger-soft) p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-(--color-danger)">Danger Zone</h3>
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
  );
}
