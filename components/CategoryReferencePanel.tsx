const CATEGORY_DETAILS: Array<{ name: string; description: string }> = [
  {
    name: "Military Bearing",
    description: "Appearance, conduct, discipline, and adherence to military standards.",
  },
  {
    name: "Customs, Courtesies and Traditions",
    description: "Respect for traditions, proper salutes, courtesies, and military etiquette.",
  },
  {
    name: "Quality of Work",
    description: "Accuracy, thoroughness, attention to detail, and high-quality output.",
  },
  {
    name: "Technical Proficiency",
    description: "Skill mastery, expertise in duties, and technical competence.",
  },
  {
    name: "Initiative",
    description: "Self-motivation, proactive actions, and taking charge without direction.",
  },
  {
    name: "Decision Making and Problem Solving",
    description: "Sound judgment, analytical thinking, and effective problem resolution.",
  },
  {
    name: "Military Readiness",
    description: "Preparedness, training, equipment maintenance, and mission readiness.",
  },
  {
    name: "Self Awareness and Learning",
    description: "Personal growth, learning from experiences, and self-improvement.",
  },
  {
    name: "Team Building",
    description: "Fostering unity, morale, cohesion, and team spirit.",
  },
  {
    name: "Respect for Others",
    description: "Treating others with dignity, fairness, and consideration.",
  },
  {
    name: "Accountability and Responsibility",
    description: "Reliability, ownership of actions, and fulfilling obligations.",
  },
  {
    name: "Influencing Others",
    description: "Persuasion, leadership influence, and motivating subordinates.",
  },
  {
    name: "Effective Communication",
    description: "Clear expression, listening skills, and effective information exchange.",
  },
];

type CategoryReferencePanelProps = {
  rankLevel: string;
  selectedCategory: string;
  onSelectCategory: (categoryName: string) => void;
};

export default function CategoryReferencePanel({
  rankLevel,
  selectedCategory,
  onSelectCategory,
}: CategoryReferencePanelProps) {
  const pdfUrl = `/api/official-guidance/pdf?rank=${encodeURIComponent(rankLevel)}`;

  return (
    <section className="rounded-xl border border-(--border-muted) bg-(--surface-1) p-4 shadow-md sm:p-8" aria-label="Category reference">
      <h2 className="text-xl text-center font-bold text-(--text-strong) sm:text-2xl">Category Reference</h2>

      <div className="mt-4 flex justify-center">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary inline-flex rounded-md px-3 py-2 text-sm font-semibold"
        >
          Open Marking Sheet PDF
        </a>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CATEGORY_DETAILS.map((category) => (
          <button
            key={category.name}
            type="button"
            onClick={() => onSelectCategory(category.name)}
            className={`rounded-md border p-3 text-left transition-colors ${
              selectedCategory === category.name
                ? "border-(--color-secondary) bg-(--color-secondary-soft)"
                : "border-(--border-muted) bg-(--surface-2) hover:border-(--color-secondary) hover:bg-(--color-secondary-soft)"
            }`}
          >
            <h3 className="text-sm font-semibold text-(--text-strong)">{category.name}</h3>
            <p className="mt-1 text-sm text-(--text-soft)">{category.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
