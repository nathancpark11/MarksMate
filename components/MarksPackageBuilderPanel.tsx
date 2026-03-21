import { useState } from "react";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

type HistoryItem = { text: string; date: string; category?: string };

type CategorySummary = { category: string; summary: string };

type PackageResult = {
  categorySummaries: CategorySummary[];
  topAccomplishments: string[];
  supervisorNotes: string;
};

type SelectedSections = {
  categorySummaries: boolean;
  topAccomplishments: boolean;
  achievementLog: boolean;
  supervisorNotes: boolean;
};

type MarksPackageBuilderPanelProps = {
  history: HistoryItem[];
  suggestions: Record<string, { category: string; reason: string }>;
  aiEnabled: boolean;
  rankLevel: string;
  rating: string;
  memberName: string;
  setMemberName: (v: string) => void;
  unitName: string;
  setUnitName: (v: string) => void;
  periodStart: string;
  setPeriodStart: (v: string) => void;
  periodEnd: string;
  setPeriodEnd: (v: string) => void;
};

const CATEGORY_GROUPS: Record<string, string[]> = {
  Military: ["Military Bearing", "Customs, Courtesies and Traditions"],
  Performance: ["Quality of Work", "Technical Proficiency", "Initiative"],
  "Professional Qualities": [
    "Decision Making and Problem Solving",
    "Military Readiness",
    "Self Awareness and Learning",
    "Team Building",
  ],
  Leadership: [
    "Respect for Others",
    "Accountability and Responsibility",
    "Influencing Others",
    "Effective Communication",
  ],
};

const ALL_CATEGORIES = Object.values(CATEGORY_GROUPS).flat();

function normalizeCategoryName(category: string) {
  return category.trim().toLowerCase() === "customs, courtesies, and traditions"
    ? "Customs, Courtesies and Traditions"
    : category.trim();
}

function getRateCode(rating: string) {
  const trimmed = rating.trim();
  if (!trimmed) return "";

  const split = trimmed.split("-")[0]?.trim();
  return split || "";
}

function getRankRateTitle(rankLevel: string, rating: string) {
  const rateCode = getRateCode(rating);
  if (!rateCode) return "";

  switch (rankLevel) {
    case "E4":
      return `${rateCode}3`;
    case "E5":
      return `${rateCode}2`;
    case "E6":
      return `${rateCode}1`;
    case "E7":
      return `${rateCode}C`;
    default:
      return "";
  }
}

function getFallbackRankTitle(rankLevel: string) {
  if (["E4", "E5", "E6"].includes(rankLevel)) return "PO";
  if (rankLevel === "E7") return "Chief";
  return "";
}

function getLastName(memberName: string) {
  const trimmed = memberName.trim();
  if (!trimmed) return "";

  if (trimmed.includes(",")) {
    return trimmed.split(",")[0].trim();
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

export default function MarksPackageBuilderPanel({
  history,
  suggestions,
  aiEnabled,
  rankLevel,
  rating,
  memberName,
  setMemberName,
  unitName,
  setUnitName,
  periodStart,
  setPeriodStart,
  periodEnd,
  setPeriodEnd,
}: MarksPackageBuilderPanelProps) {
  const [packageResult, setPackageResult] = useState<PackageResult | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageError, setPackageError] = useState("");
  const [selectedSections, setSelectedSections] = useState<SelectedSections>({
    categorySummaries: true,
    topAccomplishments: true,
    achievementLog: true,
    supervisorNotes: true,
  });
  const [openDocumentSections, setOpenDocumentSections] = useState<SelectedSections>({
    categorySummaries: false,
    topAccomplishments: false,
    achievementLog: false,
    supervisorNotes: false,
  });

  const rankTitle = getRankRateTitle(rankLevel, rating) || getFallbackRankTitle(rankLevel);
  const lastName = getLastName(memberName);
  const titledMemberName = rankTitle && lastName ? `${rankTitle} ${lastName}` : memberName.trim();
  const fullHeaderTitlePrefix = getRankRateTitle(rankLevel, rating) || rankTitle;
  const fullHeaderTitledMemberName = fullHeaderTitlePrefix && lastName
    ? `${fullHeaderTitlePrefix} ${lastName}`
    : titledMemberName;

  const getRandomizedTitlePrefix = () => {
    const rateRankTitle = getRankRateTitle(rankLevel, rating);
    const fallbackTitle = getFallbackRankTitle(rankLevel);

    if (!rateRankTitle) return fallbackTitle;
    if (!fallbackTitle) return rateRankTitle;

    return Math.random() < 0.5 ? rateRankTitle : fallbackTitle;
  };

  // ── Counts ──────────────────────────────────────────────
  const counts: Record<string, number> = {};
  ALL_CATEGORIES.forEach((cat) => (counts[cat] = 0));

  history.forEach((item) => {
    const rawCategory = item.category || suggestions[item.text]?.category;
    if (!rawCategory) return;
    const normalized = normalizeCategoryName(rawCategory);
    const matched = ALL_CATEGORIES.find(
      (cat) => cat.toLowerCase() === normalized.toLowerCase()
    );
    if (matched) counts[matched]++;
  });

  // ── Chronological log (client-side, no AI needed) ────────
  const chronologicalLog: { monthLabel: string; sortKey: string; bullets: string[] }[] = (() => {
    const map: Record<string, { sortKey: string; label: string; bullets: string[] }> = {};
    history.forEach((item) => {
      const d = new Date(item.date);
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (!map[sortKey]) map[sortKey] = { sortKey, label, bullets: [] };
      map[sortKey].bullets.push(item.text);
    });
    return Object.values(map)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(({ sortKey, label, bullets }) => ({ monthLabel: label, sortKey, bullets }));
  })();

  // ── Build package ────────────────────────────────────────
  const handleBuildPackage = async () => {
    if (!aiEnabled) {
      setPackageError("Marks Package AI is disabled in Settings.");
      return;
    }

    if (history.length === 0) {
      setPackageError("No bullets in history. Generate and save bullets first.");
      return;
    }
    if (!Object.values(selectedSections).some(Boolean)) {
      setPackageError("Select at least one section to generate.");
      return;
    }
    setPackageLoading(true);
    setPackageError("");
    setPackageResult(null);

    setOpenDocumentSections({
      categorySummaries: false,
      topAccomplishments: false,
      achievementLog: false,
      supervisorNotes: false,
    });

    const randomTitlePrefix = getRandomizedTitlePrefix();
    const requestMemberName = randomTitlePrefix && lastName
      ? `${randomTitlePrefix} ${lastName}`
      : memberName.trim();

    const bulletsByCategory: Record<string, string[]> = {};
    history.forEach((item) => {
      const rawCategory = item.category || suggestions[item.text]?.category;
      if (!rawCategory) return;
      const normalized = normalizeCategoryName(rawCategory);
      const matched = ALL_CATEGORIES.find((cat) => cat.toLowerCase() === normalized.toLowerCase());
      if (matched) {
        if (!bulletsByCategory[matched]) bulletsByCategory[matched] = [];
        bulletsByCategory[matched].push(item.text);
      }
    });
    try {
      const res = await fetch("/api/build-marks-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulletsByCategory,
          memberName: requestMemberName,
          rankLevel,
          unitName,
          periodStart,
          periodEnd,
          includeSections: selectedSections,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPackageError(data.error || "Failed to build marks package.");
        return;
      }
      setPackageResult(data as PackageResult);

    } catch {
      setPackageError("Network error. Please try again.");
    } finally {
      setPackageLoading(false);
    }
  };

  const handleSaveAsPdf = () => {
    if (!packageResult) return;

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 48;
    const maxWidth = pageWidth - marginX * 2;
    const lineHeight = 15;
    let y = 56;

    const ensureSpace = (requiredHeight: number) => {
      if (y + requiredHeight > pageHeight - 48) {
        doc.addPage();
        y = 56;
      }
    };

    let majorSectionStarted = false;
    const startMajorSection = () => {
      if (majorSectionStarted) {
        doc.addPage();
        y = 56;
      }
      majorSectionStarted = true;
    };

    const addHeading = (text: string, size = 13, centered = false) => {
      ensureSpace(28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      if (centered) {
        doc.text(text, pageWidth / 2, y, { align: "center" });
      } else {
        doc.text(text, marginX, y);
      }
      y += 20;
    };

    const addParagraph = (text: string, size = 11, indent = 0) => {
      if (!text.trim()) return;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxWidth - indent);
      lines.forEach((line: string) => {
        ensureSpace(lineHeight);
        doc.text(line, marginX + indent, y);
        y += lineHeight;
      });
      y += 4;
    };

    const addCategorySummaryBox = (
      category: string,
      summary: string,
      supportingBullets: string[]
    ) => {
      const pad = 10;
      const boxWidth = maxWidth;
      const contentWidth = boxWidth - pad * 2;
      const boxLineHeight = 14;

      const categoryLines = doc.splitTextToSize(category, contentWidth) as string[];
      const summaryLines = doc.splitTextToSize(summary, contentWidth) as string[];
      const supportingHeaderLines = supportingBullets.length
        ? (doc.splitTextToSize("Supporting Bullets:", contentWidth) as string[])
        : [];

      const supportingLines = supportingBullets.flatMap((text) =>
        doc.splitTextToSize(`- ${text}`, contentWidth - 8) as string[]
      );

      let boxHeight =
        pad +
        categoryLines.length * boxLineHeight +
        4 +
        summaryLines.length * boxLineHeight;

      if (supportingBullets.length > 0) {
        boxHeight +=
          6 +
          supportingHeaderLines.length * boxLineHeight +
          2 +
          supportingLines.length * boxLineHeight;
      }

      boxHeight += pad;

      ensureSpace(boxHeight + 10);

      doc.setDrawColor(200);
      doc.setLineWidth(1);
      doc.roundedRect(marginX, y, boxWidth, boxHeight, 6, 6);

      let textY = y + pad + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      categoryLines.forEach((line) => {
        doc.text(line, marginX + pad, textY);
        textY += boxLineHeight;
      });

      textY += 2;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      summaryLines.forEach((line) => {
        doc.text(line, marginX + pad, textY);
        textY += boxLineHeight;
      });

      if (supportingBullets.length > 0) {
        textY += 4;
        doc.setFont("helvetica", "bold");
        supportingHeaderLines.forEach((line) => {
          doc.text(line, marginX + pad, textY);
          textY += boxLineHeight;
        });

        doc.setFont("helvetica", "normal");
        supportingLines.forEach((line) => {
          doc.text(line, marginX + pad + 8, textY);
          textY += boxLineHeight;
        });
      }

      y += boxHeight + 10;
    };

    const addMainSectionBox = (
      title: string,
      entries: Array<{ text: string; bold?: boolean; indent?: number }>
    ) => {
      const headingTopGap = 14;
      const pad = 10;
      const boxWidth = maxWidth;
      const contentWidth = boxWidth - pad * 2;
      const boxLineHeight = 14;

      const wrappedEntries = entries.flatMap((entry) => {
        const indent = entry.indent ?? 0;
        const lines = doc.splitTextToSize(entry.text, contentWidth - indent) as string[];
        return lines.map((line) => ({ line, bold: Boolean(entry.bold), indent }));
      });

      const boxHeight =
        pad +
        wrappedEntries.length * boxLineHeight +
        pad;

      // Heading is outside the box.
      ensureSpace(headingTopGap + 24 + boxHeight + 10);
      y += headingTopGap;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(title, pageWidth / 2, y, { align: "center" });
      y += 18;

      doc.setDrawColor(200);
      doc.setLineWidth(1);
      doc.roundedRect(marginX, y, boxWidth, boxHeight, 6, 6);

      let textY = y + pad + 10;

      wrappedEntries.forEach(({ line, bold, indent }) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(10);
        doc.text(line, marginX + pad + indent, textY);
        textY += boxLineHeight;
      });

      y += boxHeight + 10;
    };

    addHeading(`${fullHeaderTitledMemberName || "Member"} - Marks Package`, 16, true);
    if (unitName.trim()) {
      addParagraph(unitName.trim(), 11);
    }
    if (periodStart.trim() || periodEnd.trim()) {
      addParagraph(`${periodStart.trim()}${periodStart.trim() && periodEnd.trim() ? " - " : ""}${periodEnd.trim()}`, 11);
    }
    y += 8;

    if (selectedSections.categorySummaries && packageResult.categorySummaries.length > 0) {
      startMajorSection();
      addHeading("Category Summaries", 13, true);
      packageResult.categorySummaries.forEach(({ category, summary }) => {
        const supporting = history.filter((item) => {
          const rawCat = item.category || suggestions[item.text]?.category;
          if (!rawCat) return false;
          return normalizeCategoryName(rawCat).toLowerCase() === category.toLowerCase();
        });
        addCategorySummaryBox(
          category,
          summary,
          supporting.map((item) => item.text)
        );
      });
    }

    if (selectedSections.topAccomplishments && packageResult.topAccomplishments.length > 0) {
      startMajorSection();
      addMainSectionBox(
        "Top Accomplishments",
        packageResult.topAccomplishments.map((bulletText) => ({ text: `- ${bulletText}` }))
      );
    }

    if (selectedSections.achievementLog && chronologicalLog.length > 0) {
      startMajorSection();
      const logEntries: Array<{ text: string; bold?: boolean; indent?: number }> = [];
      chronologicalLog.forEach(({ monthLabel, bullets }) => {
        logEntries.push({ text: monthLabel, bold: true });
        bullets.forEach((b) => logEntries.push({ text: `- ${b}`, indent: 10 }));
      });
      addMainSectionBox("Chronological Achievement Log", logEntries);
    }

    if (selectedSections.supervisorNotes && packageResult.supervisorNotes) {
      startMajorSection();
      addMainSectionBox("Supervisor Notes", [{ text: packageResult.supervisorNotes }]);
    }

    const baseName = (fullHeaderTitledMemberName || "marks-package")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9\-_]/g, "");

    doc.save(`${baseName || "marks-package"}.pdf`);
  };

  const handleSaveAsWord = async () => {
    if (!packageResult) return;

    const children: Paragraph[] = [];

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${fullHeaderTitledMemberName || "Member"} - Marks Package`, bold: true, size: 32 }),
        ],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
      })
    );

    if (unitName.trim()) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: unitName.trim(), size: 22 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
        })
      );
    }

    if (periodStart.trim() || periodEnd.trim()) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${periodStart.trim()}${periodStart.trim() && periodEnd.trim() ? " - " : ""}${periodEnd.trim()}`,
              size: 22,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
        })
      );
    }

    if (selectedSections.categorySummaries && packageResult.categorySummaries.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Category Summaries", bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        })
      );

      packageResult.categorySummaries.forEach(({ category, summary }) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: category, bold: true, size: 24 })],
            spacing: { after: 80 },
          })
        );

        children.push(
          new Paragraph({
            children: [new TextRun({ text: summary, size: 22 })],
            spacing: { after: 80 },
          })
        );

        const supporting = history.filter((item) => {
          const rawCat = item.category || suggestions[item.text]?.category;
          if (!rawCat) return false;
          return normalizeCategoryName(rawCat).toLowerCase() === category.toLowerCase();
        });

        if (supporting.length > 0) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: "Supporting Bullets:", bold: true, size: 20 })],
              spacing: { after: 40 },
            })
          );

          supporting.forEach((item) => {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `- ${item.text}`, size: 20 })],
                indent: { left: 360 },
                spacing: { after: 40 },
              })
            );
          });
        }

        children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
      });
    }

    if (selectedSections.topAccomplishments && packageResult.topAccomplishments.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Top Accomplishments", bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 100 },
        })
      );

      packageResult.topAccomplishments.forEach((bulletText) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `- ${bulletText}`, size: 22 })],
            spacing: { after: 50 },
          })
        );
      });
    }

    if (selectedSections.achievementLog && chronologicalLog.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Chronological Achievement Log", bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 100 },
        })
      );

      chronologicalLog.forEach(({ monthLabel, bullets }) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: monthLabel, bold: true, size: 24 })],
            spacing: { after: 60 },
          })
        );

        bullets.forEach((b) => {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `- ${b}`, size: 22 })],
              indent: { left: 360 },
              spacing: { after: 40 },
            })
          );
        });
      });
    }

    if (selectedSections.supervisorNotes && packageResult.supervisorNotes) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Supervisor Notes", bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 80 },
        })
      );

      children.push(
        new Paragraph({
          children: [new TextRun({ text: packageResult.supervisorNotes, size: 22 })],
          spacing: { after: 80 },
        })
      );
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const baseName = (fullHeaderTitledMemberName || "marks-package")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9\-_]/g, "");

    a.download = `${baseName || "marks-package"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
        <div className="rounded-xl bg-(--surface-1) p-6 shadow-md space-y-6">
          <h2 className="text-xl font-semibold text-(--text-strong)">Marks Package Builder</h2>

          {/* ── Member Info ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Member Name</label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Last, First MI"
                autoCorrect="off"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full border rounded-md p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit / Command</label>
              <input
                type="text"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="e.g. Sector Boston"
                autoCorrect="off"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full border rounded-md p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
              <input
                type="text"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                placeholder="e.g. Jun 2025"
                className="w-full border rounded-md p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
              <input
                type="text"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                placeholder="e.g. Nov 2025"
                className="w-full border rounded-md p-2 text-sm"
              />
            </div>
          </div>

          {/* ── CTA ── */}
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-(--color-primary) bg-(--color-secondary-soft) p-6 shadow-sm">
            <p className="max-w-md text-center text-sm text-(--text-strong)">
              Generate a complete marks package in one click. Select what you would like to include below.
            </p>
            <div className="w-full max-w-2xl">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-(--color-primary)">
                Include In Generation
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: "categorySummaries", label: "Category Summaries" },
                  { key: "topAccomplishments", label: "Top Accomplishments" },
                  { key: "achievementLog", label: "Achievement Log" },
                  { key: "supervisorNotes", label: "Supervisor Notes" },
                ].map((option) => {
                  const key = option.key as keyof SelectedSections;
                  const checked = selectedSections[key];
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setSelectedSections((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                      className={`w-full rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        checked
                          ? "border-(--color-primary) bg-(--color-primary) text-(--color-text-on-strong)"
                          : "border-(--color-primary) bg-(--surface-1) text-(--color-primary) hover:bg-(--surface-2)"
                      }`}
                      aria-pressed={checked}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={handleBuildPackage}
              disabled={packageLoading || history.length === 0 || !aiEnabled}
              className="btn-primary rounded-lg border border-(--color-primary) px-6 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              {packageLoading ? "Building Package…" : "Build Marks Package"}
            </button>
            {!aiEnabled && (
              <p className="text-xs text-(--color-warning)">Marks Package AI is disabled in Settings.</p>
            )}
            {history.length === 0 && (
              <p className="text-xs text-(--text-soft)">No bullets yet — generate and save bullets first.</p>
            )}
            {packageError && (
              <p className="text-sm font-medium text-(--color-danger)">{packageError}</p>
            )}
          </div>

          {/* ── Loading skeleton ── */}
          {packageLoading && (
            <div className="space-y-3 animate-pulse">
              {[80, 55, 90, 65, 75].map((w, i) => (
                <div key={i} className="h-3 rounded bg-gray-200" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {/* ── Generated Document ── */}
          {packageResult && !packageLoading && (
            <div className="space-y-8 border-t pt-6" id="marks-package-document">

              {/* Document Header */}
              <div className="text-center space-y-1 pb-4 border-b">
                <h3 className="text-lg font-bold text-gray-900">
                  {fullHeaderTitledMemberName || "Member"} — Marks Package
                </h3>
                {unitName && <p className="text-sm text-gray-600">{unitName}</p>}
                {(periodStart || periodEnd) && (
                  <p className="text-sm text-gray-500">
                    {periodStart}{periodStart && periodEnd ? " – " : ""}{periodEnd}
                  </p>
                )}
              </div>

              {/* Section 1: Category Summaries */}
              {selectedSections.categorySummaries && packageResult.categorySummaries.length > 0 && (
                <section className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDocumentSections((prev) => ({
                        ...prev,
                        categorySummaries: !prev.categorySummaries,
                      }))
                    }
                    className="w-full flex items-center justify-between bg-gray-50 px-4 py-3 text-left"
                  >
                    <h4 className="text-base font-bold text-gray-800">Category Summaries</h4>
                    <span className="text-xs text-gray-500">
                      {openDocumentSections.categorySummaries ? "▼" : "▶"}
                    </span>
                  </button>
                  {openDocumentSections.categorySummaries && (
                    <div className="space-y-6 border-t px-4 pb-4 pt-3">
                      {packageResult.categorySummaries.map(({ category, summary }) => {
                        const supporting = history.filter((item) => {
                          const rawCat = item.category || suggestions[item.text]?.category;
                          if (!rawCat) return false;
                          return normalizeCategoryName(rawCat).toLowerCase() === category.toLowerCase();
                        });
                        return (
                          <div key={category}>
                            <p className="text-sm font-semibold text-gray-800 mb-1">{category}</p>
                            <p className="text-sm text-gray-700 leading-relaxed mb-2">{summary}</p>
                            {supporting.length > 0 && (
                              <div className="pl-4 border-l-2 border-gray-200 space-y-1">
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Supporting Bullets</p>
                                {supporting.map((item, i) => (
                                  <p key={i} className="text-xs text-gray-600">{item.text}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* Section 2: Top Accomplishments */}
              {selectedSections.topAccomplishments && packageResult.topAccomplishments.length > 0 && (
                <section className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDocumentSections((prev) => ({
                        ...prev,
                        topAccomplishments: !prev.topAccomplishments,
                      }))
                    }
                    className="w-full flex items-center justify-between bg-gray-50 px-4 py-3 text-left"
                  >
                    <h4 className="text-base font-bold text-gray-800">Top Accomplishments</h4>
                    <span className="text-xs text-gray-500">
                      {openDocumentSections.topAccomplishments ? "▼" : "▶"}
                    </span>
                  </button>
                  {openDocumentSections.topAccomplishments && (
                    <ul className="space-y-2 border-t px-4 pb-4 pt-3">
                      {packageResult.topAccomplishments.map((bullet, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-700">
                          <span className="text-blue-500 font-bold mt-0.5 shrink-0">•</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* Section 3: Chronological Achievement Log */}
              {selectedSections.achievementLog && chronologicalLog.length > 0 && (
                <section className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDocumentSections((prev) => ({
                        ...prev,
                        achievementLog: !prev.achievementLog,
                      }))
                    }
                    className="w-full flex items-center justify-between bg-gray-50 px-4 py-3 text-left"
                  >
                    <h4 className="text-base font-bold text-gray-800">Chronological Achievement Log</h4>
                    <span className="text-xs text-gray-500">
                      {openDocumentSections.achievementLog ? "▼" : "▶"}
                    </span>
                  </button>
                  {openDocumentSections.achievementLog && (
                    <div className="space-y-4 border-t px-4 pb-4 pt-3">
                      {chronologicalLog.map(({ monthLabel, bullets }) => (
                        <div key={monthLabel}>
                          <p className="text-sm font-semibold text-gray-600 mb-1">{monthLabel}</p>
                          <ul className="space-y-1 pl-2">
                            {bullets.map((b, i) => (
                              <li key={i} className="flex gap-2 text-sm text-gray-700">
                                <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Section 4: Supervisor Notes */}
              {selectedSections.supervisorNotes && packageResult.supervisorNotes && (
                <section className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDocumentSections((prev) => ({
                        ...prev,
                        supervisorNotes: !prev.supervisorNotes,
                      }))
                    }
                    className="w-full flex items-center justify-between bg-gray-50 px-4 py-3 text-left"
                  >
                    <h4 className="text-base font-bold text-gray-800">Supervisor Notes</h4>
                    <span className="text-xs text-gray-500">
                      {openDocumentSections.supervisorNotes ? "▼" : "▶"}
                    </span>
                  </button>
                  {openDocumentSections.supervisorNotes && (
                    <div className="border-t px-4 pb-4 pt-3">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {packageResult.supervisorNotes}
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* Document actions */}
              <div className="flex gap-3 flex-wrap border-t pt-4 print:hidden">
                <button
                  onClick={handleSaveAsPdf}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  Save as PDF
                </button>
                <button
                  onClick={handleSaveAsWord}
                  className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Save as Word
                </button>
                <button
                  onClick={() => setPackageResult(null)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

        </div>
  );
}
