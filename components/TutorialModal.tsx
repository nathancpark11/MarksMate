type TutorialStep =
  | "log"
  | "generator"
  | "history"
  | "dashboard"
  | "export"
  | "marks-package"
  | "settings";

type TutorialContent = {
  label: string;
  title: string;
  blocks: Array<
    | { type: "paragraph"; text: string }
    | { type: "bullets"; items: string[] }
  >;
  callout?: string;
};

const TUTORIAL_STEP_ORDER: TutorialStep[] = [
  "log",
  "generator",
  "history",
  "dashboard",
  "export",
  "marks-package",
  "settings",
];

const TUTORIAL_CONTENT: Record<TutorialStep, TutorialContent> = {
  log: {
    label: "Daily Log",
    title: "Daily Log",
    blocks: [
      { type: "paragraph", text: "The Daily Log is your running record of accomplishments." },
      {
        type: "paragraph",
        text: "You can either upload existing bullets or quickly type what you accomplished today. Entries do not need to be perfectly written; just capture the action.",
      },
      {
        type: "paragraph",
        text: "This tab acts as a continuous log of everything you have done, making it easy to reference later when building official marks.",
      },
    ],
  },
  generator: {
    label: "Generator",
    title: "Generator",
    blocks: [
      { type: "paragraph", text: "The Generator turns your daily accomplishments into official marks." },
      {
        type: "paragraph",
        text: "Users can pull individual Daily Log entries into the Action field. If Impact is left blank, AI can suggest one during bullet generation.",
      },
      { type: "paragraph", text: "At the bottom are two options." },
      {
        type: "paragraph",
        text: "Generate Bullet - analyzes the action and impact to create a properly formatted official mark. It will also:",
      },
      {
        type: "bullets",
        items: [
          "Automatically categorize the bullet into the correct marking category",
          "Determine if the accomplishment should be split into multiple bullets",
          "Identify if multiple categories may apply",
        ],
      },
      {
        type: "paragraph",
        text: "Generate Mark As Is - keeps the original action text unchanged, but formats it as an official mark. AI will still categorize the mark automatically.",
      },
    ],
  },
  history: {
    label: "Official Marks",
    title: "Official Marks",
    blocks: [
      {
        type: "paragraph",
        text: "The Official Marks tab stores all marks that have been committed from the Generator.",
      },
      {
        type: "paragraph",
        text: "Here users can view, edit, and manage their finalized marks. Marks can be sorted by Marking Period or by Category, making it easy to organize them when evaluation time approaches.",
      },
    ],
  },
  dashboard: {
    label: "Dashboard",
    title: "Dashboard",
    blocks: [
      {
        type: "paragraph",
        text: "The Dashboard provides AI Smart Insights based on your accumulated marks.",
      },
      { type: "paragraph", text: "AI evaluates your marks as a whole and provides:" },
      {
        type: "bullets",
        items: [
          "Strength analysis across marking categories",
          "Recommendations on areas that may need stronger documentation",
          "A projected marking estimate based on bullet quantity and strength",
        ],
      },
      {
        type: "paragraph",
        text: "This helps users identify gaps before evaluation season arrives.",
      },
    ],
  },
  export: {
    label: "Export Marks",
    title: "Export Marks",
    blocks: [
      {
        type: "paragraph",
        text: "The Export Marks tab allows users to generate documents for official submission.",
      },
      {
        type: "paragraph",
        text: "Users can select individual categories or export everything, then generate a document in:",
      },
      { type: "bullets", items: ["PDF", "Word", "Text"] },
      {
        type: "paragraph",
        text: "This makes it easy to copy and paste marks directly into an EER form.",
      },
    ],
  },
  "marks-package": {
    label: "Marks Package Builder",
    title: "Marks Package Builder",
    blocks: [
      {
        type: "paragraph",
        text: "The Marks Package Builder allows users to assemble a complete marks package.",
      },
      {
        type: "paragraph",
        text: "This is especially useful for end-of-tour or career evaluations, where users may need to organize large numbers of marks into a comprehensive submission.",
      },
    ],
    callout: "Click Next to jump down and see where the Settings button is located.",
  },
  settings: {
    label: "Settings",
    title: "Settings",
    blocks: [
      {
        type: "paragraph",
        text: "Settings can be accessed at the bottom of the screen, where users can configure preferences such as rank, rate, and other app settings.",
      },
    ],
    callout: "Scroll down and use the Settings button at the bottom of the page.",
  },
};

type TutorialModalProps = {
  activeStep: TutorialStep;
  onSelectStep: (step: TutorialStep) => void;
  onClose: () => void | Promise<void>;
};

export default function TutorialModal({ activeStep, onSelectStep, onClose }: TutorialModalProps) {
  const stepIndex = TUTORIAL_STEP_ORDER.indexOf(activeStep);
  const content = TUTORIAL_CONTENT[activeStep];
  const previousStep = stepIndex > 0 ? TUTORIAL_STEP_ORDER[stepIndex - 1] : null;
  const nextStep = stepIndex < TUTORIAL_STEP_ORDER.length - 1 ? TUTORIAL_STEP_ORDER[stepIndex + 1] : null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-40 max-h-[70dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur sm:right-4 sm:top-24 sm:bottom-auto sm:left-auto sm:max-h-[calc(100dvh-7rem)] sm:w-[24rem] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            App Tutorial {stepIndex + 1}/{TUTORIAL_STEP_ORDER.length}
          </p>
          <h2 className="mt-2 text-lg font-bold text-slate-900">{content.title}</h2>
        </div>
        <button
          type="button"
          onClick={() => void onClose()}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TUTORIAL_STEP_ORDER.map((step) => {
          const item = TUTORIAL_CONTENT[step];
          const selected = step === activeStep;

          return (
            <button
              key={step}
              type="button"
              onClick={() => onSelectStep(step)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                selected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
        {content.blocks.map((block, index) =>
          block.type === "paragraph" ? (
            <p key={`${block.type}-${index}`}>{block.text}</p>
          ) : (
            <ul key={`${block.type}-${index}`} className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )
        )}

        {content.callout && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {content.callout}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => previousStep && onSelectStep(previousStep)}
          disabled={!previousStep}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>

        {nextStep ? (
          <button
            type="button"
            onClick={() => onSelectStep(nextStep)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onClose()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Finish Tutorial
          </button>
        )}
      </div>
    </aside>
  );
}