import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { sanitizeText } from '@/lib/textSanitization';

type HistoryItem = { text: string; date: string; category?: string };
type SavedBulletproofSummary = { summary: string; savedAt: string };
type GroupedExportCategory = {
  items: HistoryItem[];
  savedSummary?: SavedBulletproofSummary;
};

const formatItemDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

type ExportPanelProps = {
  history: HistoryItem[];
  suggestions: Record<string, { category: string; reason: string }>;
  rankLevel: string;
  isGuestSession?: boolean;
  isPremiumPlan: boolean;
  onUpgradeToPremium?: () => void;
};

type ExportType = 'pdf' | 'docx' | 'txt';

type ExportHistoryItem = {
  type: ExportType;
  createdAt: string;
  ref: string;
  itemCount: number;
};

const MAIN_CATEGORIES = ['Military', 'Performance', 'Professional Qualities', 'Leadership'] as const;
type MainCategory = typeof MAIN_CATEGORIES[number];

const BULLETPROOF_SAVED_STORAGE_KEY = 'guest-session:savedBulletproofSevens';
const FORCED_SEVEN_SAVED_STORAGE_KEY = 'guest-session:savedForcedSevens';
const DASHBOARD_SUB_CATEGORIES = [
  'Military Bearing',
  'Customs, Courtesies and Traditions',
  'Quality of Work',
  'Technical Proficiency',
  'Initiative',
  'Decision Making and Problem Solving',
  'Military Readiness',
  'Self Awareness and Learning',
  'Team Building',
  'Respect for Others',
  'Accountability and Responsibility',
  'Influencing Others',
  'Effective Communication',
] as const;

const CATEGORY_MAPPING: Record<string, string> = {
  'Military Bearing': 'Military',
  'Customs, Courtesies and Traditions': 'Military',
  'Quality of Work': 'Performance',
  'Technical Proficiency': 'Performance',
  'Initiative': 'Performance',
  'Decision Making and Problem Solving': 'Professional Qualities',
  'Military Readiness': 'Professional Qualities',
  'Self Awareness and Learning': 'Professional Qualities',
  'Team Building': 'Professional Qualities',
  'Respect for Others': 'Leadership',
  'Accountability and Responsibility': 'Leadership',
  'Influencing Others': 'Leadership',
  'Effective Communication': 'Leadership',
};

const MAIN_CATEGORY_ORDER: Record<string, string[]> = {
  Military: ['Military Bearing', 'Customs, Courtesies and Traditions'],
  Performance: ['Quality of Work', 'Technical Proficiency', 'Initiative'],
  'Professional Qualities': [
    'Decision Making and Problem Solving',
    'Military Readiness',
    'Self Awareness and Learning',
    'Team Building',
  ],
  Leadership: [
    'Respect for Others',
    'Accountability and Responsibility',
    'Influencing Others',
    'Effective Communication',
  ],
};

export default function ExportPanel({
  history,
  suggestions,
  rankLevel,
  isGuestSession = false,
  isPremiumPlan,
  onUpgradeToPremium,
}: ExportPanelProps) {
  const [showAckModal, setShowAckModal] = useState(false);
  const [pendingExport, setPendingExport] = useState<{
    run: () => Promise<void> | void;
    type: ExportType;
    ref: string;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [savedBulletproofSummaries, setSavedBulletproofSummaries] = useState<
    Record<string, SavedBulletproofSummary>
  >({});
  const [savedForcedSevenSummaries, setSavedForcedSevenSummaries] = useState<
    Record<string, SavedBulletproofSummary>
  >({});

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (isGuestSession) {
          const rawBulletproof =
            localStorage.getItem(BULLETPROOF_SAVED_STORAGE_KEY) ??
            sessionStorage.getItem(BULLETPROOF_SAVED_STORAGE_KEY);
          const parsedBulletproof = rawBulletproof ? (JSON.parse(rawBulletproof) as unknown) : null;
          const rawForced =
            localStorage.getItem(FORCED_SEVEN_SAVED_STORAGE_KEY) ??
            sessionStorage.getItem(FORCED_SEVEN_SAVED_STORAGE_KEY);
          const parsedForced = rawForced ? (JSON.parse(rawForced) as unknown) : null;

          if (!cancelled) {
            setSavedBulletproofSummaries(
              parsedBulletproof && typeof parsedBulletproof === 'object' && !Array.isArray(parsedBulletproof)
                ? (parsedBulletproof as Record<string, SavedBulletproofSummary>)
                : {}
            );
            setSavedForcedSevenSummaries(
              parsedForced && typeof parsedForced === 'object' && !Array.isArray(parsedForced)
                ? (parsedForced as Record<string, SavedBulletproofSummary>)
                : {}
            );
          }
          return;
        }

        const response = await fetch('/api/user-data?key=savedBulletproofSevens');
        const data = (await response.json()) as { value?: unknown };
        const parsed = data.value;
        const forcedResponse = await fetch('/api/user-data?key=savedForcedSevens');
        const forcedData = (await forcedResponse.json()) as { value?: unknown };
        const parsedForced = forcedData.value;

        if (!cancelled) {
          setSavedBulletproofSummaries(
            parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              ? (parsed as Record<string, SavedBulletproofSummary>)
              : {}
          );
          setSavedForcedSevenSummaries(
            parsedForced && typeof parsedForced === 'object' && !Array.isArray(parsedForced)
              ? (parsedForced as Record<string, SavedBulletproofSummary>)
              : {}
          );
        }
      } catch {
        if (!cancelled) {
          setSavedBulletproofSummaries({});
          setSavedForcedSevenSummaries({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isGuestSession]);

  const appendExportHistory = async (item: ExportHistoryItem) => {
    if (isGuestSession) {
      try {
        const raw = sessionStorage.getItem('guest-session:exportHistory');
        const existing = raw ? (JSON.parse(raw) as unknown) : [];
        const normalized = Array.isArray(existing)
          ? existing.filter(
              (entry): entry is ExportHistoryItem =>
                !!entry &&
                typeof entry === 'object' &&
                typeof (entry as { type?: unknown }).type === 'string' &&
                typeof (entry as { createdAt?: unknown }).createdAt === 'string' &&
                typeof (entry as { ref?: unknown }).ref === 'string' &&
                typeof (entry as { itemCount?: unknown }).itemCount === 'number'
            )
          : [];

        sessionStorage.setItem(
          'guest-session:exportHistory',
          JSON.stringify([item, ...normalized].slice(0, 100))
        );
      } catch {
        // Non-blocking: export should still complete if metadata save fails.
      }

      return;
    }

    try {
      const existingRes = await fetch('/api/user-data?key=exportHistory');
      const existingData = (await existingRes.json()) as { value?: unknown };
      const existing = Array.isArray(existingData.value) ? existingData.value : [];
      const normalized = existing.filter(
        (entry): entry is ExportHistoryItem =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as { type?: unknown }).type === 'string' &&
          typeof (entry as { createdAt?: unknown }).createdAt === 'string' &&
          typeof (entry as { ref?: unknown }).ref === 'string' &&
          typeof (entry as { itemCount?: unknown }).itemCount === 'number'
      );
      const next = [item, ...normalized].slice(0, 100);

      await fetch('/api/user-data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'exportHistory', value: next }),
      });
    } catch {
      // Non-blocking: export should still complete if metadata save fails.
    }
  };

  const requestExport = (
    exportFn: () => Promise<void> | void,
    type: ExportType,
    ref: string
  ) => {
    if (isExporting || isGuestSession) {
      return;
    }

    setPendingExport({ run: exportFn, type, ref });
    setShowAckModal(true);
  };

  const handleAckConfirm = async () => {
    if (!pendingExport || isExporting) {
      return;
    }

    setIsExporting(true);
    setShowAckModal(false);
    try {
      await pendingExport.run();
      await appendExportHistory({
        type: pendingExport.type,
        createdAt: new Date().toISOString(),
        ref: pendingExport.ref,
        itemCount: exportReadyHistory.length,
      });
    } finally {
      setPendingExport(null);
      setIsExporting(false);
    }
  };

  const handleAckCancel = () => {
    setShowAckModal(false);
    setPendingExport(null);
  };

  const exportActionsDisabled = isExporting || isGuestSession || !isPremiumPlan;

  const [selectedCategories, setSelectedCategories] = useState<Record<MainCategory, boolean>>({
    Military: true,
    Performance: true,
    'Professional Qualities': true,
    Leadership: true,
  });

  const MIN_MARK = 4;
  const MAX_MARK = 7;
  const exportReadyHistory: HistoryItem[] = history
    .map((item) => ({
      ...item,
      text: sanitizeText(item.text, { preserveLineBreaks: false }),
      category: item.category ? sanitizeText(item.category, { preserveLineBreaks: false }) : undefined,
    }))
    .filter((item) => item.text.length > 0);

  const normalizeCategory = (category: string): string => {
    const trimmed = category.trim();
    if (trimmed.toLowerCase() === 'customs, courtesies, and traditions') {
      return 'Customs, Courtesies and Traditions';
    }
    return trimmed;
  };

  const getCategoryCount = (subCategory: string): number => {
    return exportReadyHistory.reduce((count, item) => {
      const rawCategory = item.category || suggestions[item.text]?.category;
      if (!rawCategory) return count;
      const normalized = normalizeCategory(rawCategory);
      return normalized.toLowerCase() === subCategory.toLowerCase() ? count + 1 : count;
    }, 0);
  };

  const getMarkingValue = (subCategory: string): number => {
    const count = getCategoryCount(subCategory);
    if (count === 0) return 4;
    if (count === 1) return 4;
    if (count === 2) return 5;
    if (count === 3) return 6;
    return 7;
  };

  const clampToMarkScale = (value: number): number => {
    return Math.min(MAX_MARK, Math.max(MIN_MARK, value));
  };

  const mergedSavedSevenSummaries: Record<string, SavedBulletproofSummary> = {
    ...savedBulletproofSummaries,
    ...savedForcedSevenSummaries,
  };

  const exportSevenCount = DASHBOARD_SUB_CATEGORIES.filter((categoryName) => {
    const mainCategory = CATEGORY_MAPPING[categoryName];
    return Boolean(mainCategory && selectedCategories[mainCategory as MainCategory] && mergedSavedSevenSummaries[categoryName]);
  }).length;

  const getRecommendedMarks = async (): Promise<Record<string, number>> => {
    const bulletsByCategory: Record<string, string[]> = Object.fromEntries(
      DASHBOARD_SUB_CATEGORIES.map((cat) => [cat, [] as string[]])
    );

    exportReadyHistory.forEach((item) => {
      const rawCategory = item.category || suggestions[item.text]?.category;
      if (!rawCategory) return;
      const normalized = normalizeCategory(rawCategory);
      const matched = DASHBOARD_SUB_CATEGORIES.find(
        (cat) => cat.toLowerCase() === normalized.toLowerCase()
      );

      if (matched) {
        bulletsByCategory[matched].push(item.text);
      }
    });

    const populatedBulletsByCategory = Object.fromEntries(
      Object.entries(bulletsByCategory).filter(([, bullets]) => bullets.length > 0)
    );

    const aiCompiledScores: Record<string, number> = {};
    if (Object.keys(populatedBulletsByCategory).length > 0) {
      try {
        const response = await fetch('/api/evaluate-category-quality', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rankLevel,
            categories: populatedBulletsByCategory,
            feature: 'export',
          }),
        });

        const data = await response.json();
        if (response.ok && data.evaluations) {
          Object.entries(data.evaluations as Record<string, { compiledScore?: number }>).forEach(
            ([category, evaluation]) => {
              if (typeof evaluation?.compiledScore === 'number' && !Number.isNaN(evaluation.compiledScore)) {
                aiCompiledScores[category] = clampToMarkScale(evaluation.compiledScore);
              }
            }
          );
        }
      } catch {
        // Fallback to count-based marks when AI evaluation is unavailable.
      }
    }

    return Object.fromEntries(
      DASHBOARD_SUB_CATEGORIES.map((subCategory) => {
        const bulletMark = getMarkingValue(subCategory);
        const aiScore = aiCompiledScores[subCategory];
        const recommendedMark =
          typeof aiScore === 'number'
            ? clampToMarkScale(Math.round((bulletMark + aiScore) / 2))
            : bulletMark;

        return [subCategory, recommendedMark];
      })
    );
  };

  const buildGroupedExportCategories = (includeSuggestedFallback: boolean) => {
    const groupedByCategory: Record<string, GroupedExportCategory> = {};
    const uncategorized: HistoryItem[] = [];

    const getSavedSummaryForCategory = (categoryName: string) =>
      savedForcedSevenSummaries[categoryName] ?? savedBulletproofSummaries[categoryName];

    const ensureCategory = (categoryName: string) => {
      if (!groupedByCategory[categoryName]) {
        groupedByCategory[categoryName] = {
          items: [],
          savedSummary: getSavedSummaryForCategory(categoryName),
        };
      } else {
        const latestSummary = getSavedSummaryForCategory(categoryName);
        if (latestSummary) {
          groupedByCategory[categoryName].savedSummary = latestSummary;
        }
      }

      return groupedByCategory[categoryName];
    };

    exportReadyHistory.forEach((item) => {
      if (item.category) {
        const normalizedCategory = normalizeCategory(item.category);
        let matchedCategoryName: string | null = null;

        for (const subCategory of Object.keys(CATEGORY_MAPPING)) {
          if (subCategory.toLowerCase() === normalizedCategory.toLowerCase()) {
            matchedCategoryName = subCategory;
            break;
          }
        }

        if (!matchedCategoryName) {
          const matchedMainCategory = MAIN_CATEGORIES.find(
            (mainCategory) => mainCategory.toLowerCase() === normalizedCategory.toLowerCase()
          );

          if (matchedMainCategory) {
            matchedCategoryName = `${matchedMainCategory} - General`;
          }
        }

        if (matchedCategoryName) {
          ensureCategory(matchedCategoryName).items.push(item);
          return;
        }
      }

      uncategorized.push(item);
    });

    if (includeSuggestedFallback) {
      const suggestCategory = (text: string): string => {
        const t = text.toLowerCase();
        if (t.includes('bearing') || t.includes('courtesy') || t.includes('tradition')) return 'Military Bearing';
        if (t.includes('customs') || t.includes('courtesies')) return 'Customs, Courtesies and Traditions';
        if (t.includes('quality') || t.includes('work ethic')) return 'Quality of Work';
        if (t.includes('technical') || t.includes('proficiency') || t.includes('skill')) return 'Technical Proficiency';
        if (t.includes('initiative') || t.includes('proactive') || t.includes('self-motivated')) return 'Initiative';
        if (t.includes('decision') || t.includes('problem solving')) return 'Decision Making and Problem Solving';
        if (t.includes('readiness') || t.includes('prepared')) return 'Military Readiness';
        if (t.includes('self awareness') || t.includes('learning') || t.includes('growth')) return 'Self Awareness and Learning';
        if (t.includes('team') || t.includes('collaboration')) return 'Team Building';
        if (t.includes('respect') || t.includes('others')) return 'Respect for Others';
        if (t.includes('accountability') || t.includes('responsibility') || t.includes('duty')) return 'Accountability and Responsibility';
        if (t.includes('influence') || t.includes('interpersonal')) return 'Influencing Others';
        if (t.includes('communication') || t.includes('speaking') || t.includes('writing')) return 'Effective Communication';
        return 'Military Bearing';
      };

      uncategorized.forEach((item) => {
        ensureCategory(suggestCategory(item.text)).items.push(item);
      });
    }

    Object.entries(savedBulletproofSummaries).forEach(([categoryName, savedSummary]) => {
      if (CATEGORY_MAPPING[categoryName]) {
        ensureCategory(categoryName).savedSummary = savedSummary;
      }
    });

    Object.entries(savedForcedSevenSummaries).forEach(([categoryName, savedSummary]) => {
      if (CATEGORY_MAPPING[categoryName]) {
        ensureCategory(categoryName).savedSummary = savedSummary;
      }
    });

    return groupedByCategory;
  };

  const handleExportWord = async () => {
    const recommendedMarks = await getRecommendedMarks();
    const groupedByCategory = buildGroupedExportCategories(false);

    const children: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: 'Bullet History Export', bold: true, size: 32 })],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Exported on: ${new Date().toLocaleDateString()}`, color: '888888', size: 20 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];

    for (const [mainCategory, subCategories] of Object.entries(MAIN_CATEGORY_ORDER)) {
      if (!selectedCategories[mainCategory as MainCategory]) continue;
      children.push(
        new Paragraph({
          children: [new TextRun({ text: mainCategory, bold: true, underline: {}, size: 28, color: '000000' })],

          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        })
      );

      for (const subCategory of subCategories) {
        const markingVal = recommendedMarks[subCategory] ?? getMarkingValue(subCategory);
        const categoryData = groupedByCategory[subCategory] ?? { items: [] };
        const items = categoryData.items;
        const savedSummary = categoryData.savedSummary;

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: subCategory, bold: true, size: 24, color: '333333' }),
              new TextRun({ text: `    Recommended Mark: ${markingVal}`, size: 22, color: '1E50B4' }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );

        if (items.length === 0) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: 'None', color: '999999', italics: true, size: 20 })],
              indent: { left: 360 },
              spacing: { after: 100 },
            })
          );
        } else {
          const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          for (const item of sorted) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: item.text, size: 20 }),
                  ...(formatItemDate(item.date) ? [new TextRun({ text: ` (${formatItemDate(item.date)})`, size: 20, color: '888888' })] : []),
                ],
                indent: { left: 360 },
                spacing: { after: 80 },
              })
            );
          }
        }

        if (savedSummary?.summary) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `7 - ${savedSummary.summary}`, size: 20, color: 'C62828' })],
              indent: { left: 360 },
              spacing: { before: 60, after: 80 },
            })
          );
        }

        children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bullet-history.docx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTxt = async () => {
    const recommendedMarks = await getRecommendedMarks();
    const groupedByCategory = buildGroupedExportCategories(true);

    const lines: string[] = [];
    lines.push('BULLET HISTORY EXPORT');
    lines.push(`Exported on: ${new Date().toLocaleDateString()}`);
    lines.push('');

    for (const [mainCategory, subCategories] of Object.entries(MAIN_CATEGORY_ORDER)) {
      if (!selectedCategories[mainCategory as MainCategory]) continue;
      lines.push('='.repeat(50));
      lines.push(mainCategory.toUpperCase());
      lines.push('='.repeat(50));
      lines.push('');

      for (const subCategory of subCategories) {
        const markingVal = recommendedMarks[subCategory] ?? getMarkingValue(subCategory);
        const categoryData = groupedByCategory[subCategory] ?? { items: [] };
        const items = categoryData.items;
        const savedSummary = categoryData.savedSummary;
        lines.push(`${subCategory}  |  Recommended Mark: ${markingVal}`);
        lines.push('-'.repeat(40));

        if (items.length === 0) {
          lines.push('  None');
        } else {
          const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          for (const item of sorted) {
            const d = formatItemDate(item.date);
            lines.push(`  ${item.text}${d ? ` (${d})` : ''}`);
          }
        }

        if (savedSummary?.summary) {
          lines.push(`  7 - ${savedSummary.summary}`);
        }
        lines.push('');
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bullet-history.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const recommendedMarks = await getRecommendedMarks();

    const doc = new jsPDF();
    doc.setFont('times', 'normal');
    doc.setFontSize(10);

    // Title
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.text('Bullet History Export', 20, 30);

    // Date
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text(`Exported on: ${new Date().toLocaleDateString()}`, 20, 45);

    let yPosition = 65;

    // Define the hierarchical category mapping (subcategory -> main category)
    const groupedByCategory = buildGroupedExportCategories(true);

    const getCategorySectionHeight = (items: HistoryItem[], savedSummary?: SavedBulletproofSummary) => {
      const sortedItems = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      let sectionHeight = 16; // header
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      sortedItems.forEach((item) => {
        const fd = formatItemDate(item.date);
        const dateStr = fd ? ` (${fd})` : '';
        const lines = doc.splitTextToSize(item.text + dateStr, 155);
        sectionHeight += lines.length * 4.5 + 2;
      });
      if (savedSummary?.summary) {
        const summaryLines = doc.splitTextToSize(`7 - ${savedSummary.summary}`, 148);
        sectionHeight += summaryLines.length * 4.5 + 4;
      }
      sectionHeight += 4; // bottom padding
      return sectionHeight;
    };

    // Function to add a category section
    const addCategorySection = (
      categoryName: string,
      items: HistoryItem[],
      savedSummary?: SavedBulletproofSummary
    ) => {
      // Pre-sort items
      const sortedItems = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const preparedItems = sortedItems.map((item) => {
        const fd = formatItemDate(item.date);
        const dateStr = fd ? ` (${fd})` : '';
        const fullText = item.text + dateStr;
        doc.setFont('times', 'normal');
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(fullText, 155) as string[];
        return { lines, cursor: 0 };
      });

      const markingVal = recommendedMarks[categoryName] ?? getMarkingValue(categoryName);
      const savedSummaryLines = savedSummary?.summary
        ? (doc.splitTextToSize(`7 - ${savedSummary.summary}`, 148) as string[])
        : [];
      let savedSummaryRendered = false;
      let isContinuation = false;

      while (preparedItems.length > 0 || (!savedSummaryRendered && savedSummaryLines.length > 0)) {
        if (yPosition + 24 > 270) {
          doc.addPage();
          yPosition = 30;
        }

        let sectionHeight = 20; // header + bottom padding
        const chunk: string[][] = [];
        let renderSummaryThisChunk = false;

        while (preparedItems.length > 0) {
          const currentItem = preparedItems[0];
          const remainingLines = currentItem.lines.slice(currentItem.cursor);
          const fullRemainingHeight = remainingLines.length * 4.5 + 2;
          const availableHeight = 270 - yPosition - sectionHeight;

          if (fullRemainingHeight <= availableHeight) {
            chunk.push(remainingLines);
            sectionHeight += fullRemainingHeight;
            preparedItems.shift();
            continue;
          }

          // Split oversized items so the heading always has content below it.
          const maxLines = Math.floor((availableHeight - 2) / 4.5);
          if (maxLines > 0) {
            const partialLines = remainingLines.slice(0, maxLines);
            chunk.push(partialLines);
            sectionHeight += partialLines.length * 4.5 + 2;
            currentItem.cursor += partialLines.length;
          }
          break;
        }

        const remainingSummaryLines = savedSummaryRendered ? [] : savedSummaryLines;
        if (remainingSummaryLines.length > 0) {
          const summaryHeight = remainingSummaryLines.length * 4.5 + 2;
          const availableHeight = 270 - yPosition - sectionHeight;
          if (summaryHeight <= availableHeight) {
            sectionHeight += summaryHeight;
            renderSummaryThisChunk = true;
            savedSummaryRendered = true;
          }
        }

        if (chunk.length === 0 && !(savedSummaryRendered && savedSummaryLines.length > 0)) {
          doc.addPage();
          yPosition = 30;
          continue;
        }

        // Draw light grey background box for this page chunk.
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(17, yPosition - 4, 176, sectionHeight, 2, 2, 'F');

        // Category header with marking value on the right.
        doc.setFont('times', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(60, 60, 60);
        doc.text(isContinuation ? `${categoryName} (cont.)` : categoryName, 22, yPosition + 4);
        doc.setFont('times', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(30, 80, 180);
        doc.text(`Recommended Mark: ${markingVal}`, 185, yPosition + 4, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        yPosition += 16;

        chunk.forEach((lines) => {
          doc.setFont('times', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text(lines, 25, yPosition);
          yPosition += lines.length * 4.5 + 2;
        });

        if (renderSummaryThisChunk && savedSummaryLines.length > 0) {
          doc.setFont('times', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(198, 40, 40);
          doc.text(savedSummaryLines, 25, yPosition);
          yPosition += savedSummaryLines.length * 4.5 + 2;
        }

        // Space after each chunk.
        yPosition += 8;
        isContinuation = true;
      }
    };

    // Function to add a main category section with its subcategories
    const addMainCategorySection = (
      mainCategoryName: string,
      subCategories: string[],
      isFirstMainCategory: boolean
    ) => {
      // Keep the first major heading on the current page and force page starts for the rest.
      if (!isFirstMainCategory) {
        doc.addPage();
        yPosition = 20;
      }

      // Reserve room for heading + first subcategory so headings do not get orphaned.
      const firstSubCategory = subCategories[0];
      if (firstSubCategory) {
        const firstCategoryData = groupedByCategory[firstSubCategory] ?? { items: [] };
        const firstSectionHeight =
          firstCategoryData.items.length > 0 || firstCategoryData.savedSummary
            ? getCategorySectionHeight(firstCategoryData.items, firstCategoryData.savedSummary) + 8
            : 36;
        const requiredStartHeight = 12 + firstSectionHeight;
        const maxFirstSectionHeightOnFreshPage = 270 - 20 - 12;
        const canFitWholeFirstSection = firstSectionHeight <= maxFirstSectionHeightOnFreshPage;
        if (canFitWholeFirstSection && yPosition + requiredStartHeight > 270) {
          doc.addPage();
          yPosition = 20;
        }
      }

      // Main category header (centered)
      doc.setFont('times', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text(mainCategoryName, 105, yPosition, { align: 'center' });
      yPosition += 12;

      // Show all subcategories, with "None" for those without bullets
      subCategories.forEach((subCategory) => {
        const categoryData = groupedByCategory[subCategory] ?? { items: [] };
        if (categoryData.items.length > 0 || categoryData.savedSummary) {
          addCategorySection(subCategory, categoryData.items, categoryData.savedSummary);
        } else {
          // Empty subcategory box
          if (yPosition + 28 > 270) {
            doc.addPage();
            yPosition = 30;
          }
          doc.setFillColor(245, 245, 245);
          doc.roundedRect(17, yPosition - 4, 176, 28, 2, 2, 'F');
          doc.setFont('times', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(60, 60, 60);
          doc.text(subCategory, 22, yPosition + 4);
          const emptyMarkingVal = recommendedMarks[subCategory] ?? getMarkingValue(subCategory);
          doc.setFont('times', 'normal');
          doc.setTextColor(30, 80, 180);
          doc.setFontSize(10);
          doc.text(`Recommended Mark: ${emptyMarkingVal}`, 185, yPosition + 4, { align: 'right' });
          doc.setFont('times', 'italic');
          doc.setFontSize(10);
          doc.setTextColor(150, 150, 150);
          doc.text("None", 25, yPosition + 16);
          yPosition += 36;
        }
      });

      // Add space between main categories (double line spacing)
      yPosition += 24;
    };

    // Get all main categories and their subcategories
    const mainCategories: Record<string, string[]> = {};
    Object.entries(CATEGORY_MAPPING).forEach(([subCategory, mainCategory]) => {
      if (!mainCategories[mainCategory]) {
        mainCategories[mainCategory] = [];
      }
      mainCategories[mainCategory].push(subCategory);
    });
    
    // Also add any pseudo-subcategories for main category matches
    Object.keys(groupedByCategory).forEach(category => {
      if (category.includes(' - General')) {
        const mainCategory = category.replace(' - General', '');
        if (!mainCategories[mainCategory]) {
          mainCategories[mainCategory] = [];
        }
        if (!mainCategories[mainCategory].includes(category)) {
          mainCategories[mainCategory].push(category);
        }
      }
    });

    // Add each main category section (show all categories)
    let renderedMainCategoryCount = 0;
    Object.keys(mainCategories).forEach((mainCategory) => {
      if (!selectedCategories[mainCategory as MainCategory]) return;
      const subCategories = mainCategories[mainCategory];
      addMainCategorySection(mainCategory, subCategories, renderedMainCategoryCount === 0);
      renderedMainCategoryCount += 1;
    });

    // Add any categories that don't fit the main structure
    const knownSubCategories = Object.keys(CATEGORY_MAPPING);
    const unknownCategories = Object.keys(groupedByCategory).filter(cat => !knownSubCategories.includes(cat));

    if (unknownCategories.length > 0) {
      // Check if we need a new page
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 30;
      }

      doc.setFont('times', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text('Other Categories', 20, yPosition);
      yPosition += 15;

      unknownCategories.forEach((category) => {
        const categoryData = groupedByCategory[category];
        if (categoryData.items.length > 0 || categoryData.savedSummary) {
          addCategorySection(category, categoryData.items, categoryData.savedSummary);
        }
      });
    }

    // Save the PDF
    doc.save('bullet-history.pdf');
  };

  return (
    <>
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-semibold text-(--text-strong)">Export Official Marks</h2>
        <p className="mt-1 text-sm text-supporting">Choose categories and export your official marks output.</p>
      </div>
      <div className="h-px bg-(--border-muted) opacity-60" />
    <div className="bg-white p-6 rounded-xl shadow-md space-y-6">

      {/* ── Category Selector ── */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Select categories to include:</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MAIN_CATEGORIES.map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCategories[cat]}
                onChange={(e) =>
                  setSelectedCategories((prev) => ({ ...prev, [cat]: e.target.checked }))
                }
                className="w-4 h-4 accent-blue-600"
              />
              {cat}
            </label>
          ))}
        </div>
      </div>

      {exportReadyHistory.length === 0 ? (
        <p className="text-gray-500">No history items to export.</p>
      ) : (
        <div className="space-y-4">
          {isGuestSession ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Exporting marks is unavailable in Guest mode. Create an account to continue.
            </p>
          ) : null}
          {!isGuestSession && !isPremiumPlan ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <p className="font-semibold">Export is a Premium feature.</p>
              <p className="mt-1">Upgrade to Premium to export formatted output.</p>
              {onUpgradeToPremium ? (
                <button
                  type="button"
                  onClick={onUpgradeToPremium}
                  className="mt-2 rounded-md bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-800"
                >
                  Upgrade to Premium
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="text-sm text-gray-600">
            {exportReadyHistory.length} mark{exportReadyHistory.length !== 1 ? 's' : ''} will be exported. {exportSevenCount} saved 7{exportSevenCount !== 1 ? 's' : ''} will be exported.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() =>
                requestExport(
                  handleExportPDF,
                  'pdf',
                  `bullet-history-${new Date().toISOString().slice(0, 10)}.pdf`
                )
              }
              disabled={exportActionsDisabled}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export as PDF
            </button>
            <button
              onClick={() =>
                requestExport(
                  handleExportWord,
                  'docx',
                  `bullet-history-${new Date().toISOString().slice(0, 10)}.docx`
                )
              }
              disabled={exportActionsDisabled}
              className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export as Word
            </button>
            <button
              onClick={() =>
                requestExport(
                  handleExportTxt,
                  'txt',
                  `bullet-history-${new Date().toISOString().slice(0, 10)}.txt`
                )
              }
              disabled={exportActionsDisabled}
              className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export as Text
            </button>
          </div>
        </div>
      )}
    </div>
    </div>

      {isExporting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl px-10 py-8 flex flex-col items-center gap-4">
            <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-gray-700 font-medium text-sm">Exporting…</p>
          </div>
        </div>
      )}

      {showAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold">AI Assistance Notice</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              This tool uses AI to help generate draft performance bullets from your inputs. The
              content produced is intended as a writing aid only.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              By continuing with export, you acknowledge that AI-generated bullets may contain
              inaccuracies or incomplete information. You are responsible for reviewing, editing,
              and verifying all content before official use.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              This application is not an official U.S. Coast Guard or Department of Defense
              resource. Only unclassified information should be entered.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              Select <span className="font-semibold">&ldquo;Acknowledge &amp; Export&rdquo;</span> to
              confirm you understand and accept these conditions.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleAckCancel}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAckConfirm}
                disabled={isExporting}
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
              >
                {isExporting ? "Exporting..." : "Acknowledge & Export"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}