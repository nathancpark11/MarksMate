import { useRef } from "react";

type SettingsPanelProps = {
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
  historyCount: number;
  settingsMessage: string;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onClearAllBullets: () => void;
  onReviewTutorial: () => void;
  onDeleteAccount: () => void;
};

export default function SettingsPanel({
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
  historyCount,
  settingsMessage,
  onExportBackup,
  onImportBackup,
  onClearAllBullets,
  onReviewTutorial,
  onDeleteAccount,
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-md space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">User Profile</h3>
        <p className="text-sm text-gray-500">
          Set defaults used across generators and marks package workflows.
        </p>

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
              className="mt-2 w-full border rounded-md p-3"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Default Bullet Settings</h3>
        <div>
          <label className="block text-sm font-medium">Bullet Style</label>
          <select
            value={bulletStyle}
            onChange={(e) => setBulletStyle(e.target.value)}
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
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Data Management</h3>
        <p className="text-sm text-gray-500">Saved bullets: {historyCount}</p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExportBackup}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Export Backup
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Import Backup
          </button>

          <button
            onClick={onClearAllBullets}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          >
            Clear All Bullets
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

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Help</h3>
        <p className="text-sm text-gray-500">
          Reopen the quick tutorial for a refresher on how each tab is meant to be used.
        </p>
        <button
          onClick={onReviewTutorial}
          className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Review Tutorial
        </button>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-red-700">Danger Zone</h3>
        <p className="text-sm text-gray-500">
          Permanently delete your account. This cannot be undone. All saved data will be lost.
        </p>
        <button
          onClick={onDeleteAccount}
          className="px-4 py-2 rounded-md border border-red-600 text-red-600 text-sm font-medium hover:bg-red-50"
        >
          Delete Account
        </button>
      </section>
    </div>
  );
}
