import { useEffect, useRef, useState } from "react";

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
          "Identify if multiple categories may apply **(Premium)**",
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
        text: "The Dashboard provides AI Smart Insights based on your accumulated marks **(Premium Only)**.",
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
        text: "The Export Marks tab allows users to generate documents for official submission **(Premium Only)**.",
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
        text: "The Marks Package Builder allows users to assemble a complete marks package **(Premium Only)**."
      },
      {
        type: "paragraph",
        text: "This is especially useful for end-of-tour or career evaluations, where users may need to organize large numbers of marks into a comprehensive submission.",
      },
    ],
    callout: "Click Next to see where Settings live and how to add the app to your iPhone Home Screen.",
  },
  settings: {
    label: "Profile & iPhone Setup",
    title: "Profile Settings + Add to iPhone Home Screen",
    blocks: [
      {
        type: "paragraph",
        text: "Settings live inside your user profile menu.",
      },
      {
        type: "paragraph",
        text: "Open your profile button at the top right, then select Settings to manage rank, rate, AI preferences, and app controls.",
      },
      { type: "paragraph", text: "To add this web app to your iPhone Home Screen:" },
      {
        type: "bullets",
        items: [
          "Open the app in **Safari** on iPhone",
          "Tap the **Share** button (square with arrow)",
          "Tap **View More** Arrow",
          "Tap **Add to Home Screen**",
          "Edit the name if desired, then tap Add",
        ],
      },
    ],
    callout: "After adding to Home Screen, launch it from the new icon for quick one-tap access.",
  },
};

function renderBulletText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

type TutorialModalProps = {
  activeStep: TutorialStep;
  onSelectStep: (step: TutorialStep) => void;
  onClose: () => void | Promise<void>;
  onFinish: () => void | Promise<void>;
};

export default function TutorialModal({ activeStep, onSelectStep, onClose, onFinish }: TutorialModalProps) {
  const stepIndex = TUTORIAL_STEP_ORDER.indexOf(activeStep);
  const content = TUTORIAL_CONTENT[activeStep];
  const previousStep = stepIndex > 0 ? TUTORIAL_STEP_ORDER[stepIndex - 1] : null;
  const nextStep = stepIndex < TUTORIAL_STEP_ORDER.length - 1 ? TUTORIAL_STEP_ORDER[stepIndex + 1] : null;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const activeChipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeStep]);

  return (
    <>
    {isMobile && (
      <div className="fixed inset-0 z-39 bg-black/60" aria-hidden="true" />
    )}
    <aside
      className="fixed inset-x-4 z-40 flex flex-col overflow-hidden rounded-2xl border border-(--border-muted) bg-(--surface-1) shadow-2xl sm:bg-(--surface-1)/95 sm:backdrop-blur sm:right-4 sm:top-24 sm:bottom-auto sm:left-auto sm:max-h-[calc(100dvh-7rem)] sm:w-[24rem]"
      style={isMobile ? {
        top: "50%",
        transform: "translateY(-50%)",
        maxHeight: "calc(100dvh - var(--tab-bar-height, 60px) - 2rem)",
      } : undefined}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--color-primary)">
            App Tutorial {stepIndex + 1}/{TUTORIAL_STEP_ORDER.length}
          </p>
          <h2 className="mt-2 text-base font-bold leading-tight text-(--text-strong) sm:text-lg">{content.title}</h2>
        </div>
        <button
          type="button"
          onClick={() => void onClose()}
          className="btn-secondary shrink-0 rounded-md px-3 py-2 text-sm font-medium"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:px-5">
        {TUTORIAL_STEP_ORDER.map((step) => {
          const item = TUTORIAL_CONTENT[step];
          const selected = step === activeStep;

          return (
            <button
              key={step}
              ref={selected ? activeChipRef : null}
              type="button"
              onClick={() => onSelectStep(step)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                selected
                  ? "btn-primary"
                  : "btn-secondary"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto px-4 pb-2 text-sm leading-6 text-(--text-strong) sm:px-5">
        {content.blocks.map((block, index) => {
          const isIphoneSetupParagraph =
            activeStep === "settings" &&
            block.type === "paragraph" &&
            block.text.startsWith("To add this web app");
          const isIphoneSetupBullets =
            activeStep === "settings" && block.type === "bullets";
          if ((isIphoneSetupParagraph || isIphoneSetupBullets) && !isMobile) {
            return null;
          }
          return block.type === "paragraph" ? (
            <p key={`${block.type}-${index}`}>{renderBulletText(block.text)}</p>
          ) : (
            <ul key={`${block.type}-${index}`} className="list-disc space-y-1 pl-5 text-sm text-(--text-strong)">
              {block.items.map((item) => (
                <li key={item}>{renderBulletText(item)}</li>
              ))}
            </ul>
          );
        })}

        {content.callout && (isMobile || activeStep !== "settings") && (
          <div className="rounded-lg border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning)">
            {content.callout}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-(--border-muted) px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:px-5 sm:pt-4 sm:pb-5">
        <button
          type="button"
          onClick={() => previousStep && onSelectStep(previousStep)}
          disabled={!previousStep}
          className="btn-secondary min-h-10 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>

        {nextStep ? (
          <button
            type="button"
            onClick={() => onSelectStep(nextStep)}
            className="btn-primary min-h-10 rounded-md px-4 py-2 text-sm font-semibold"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onFinish()}
            className="btn-primary min-h-10 rounded-md px-4 py-2 text-sm font-semibold"
          >
            Finish Tutorial
          </button>
        )}
      </div>
    </aside>
    </>
  );
}