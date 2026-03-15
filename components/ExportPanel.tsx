import { useState } from 'react';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TableCell, TableRow, Table, WidthType } from 'docx';

type HistoryItem = { text: string; date: string; category?: string };

type ExportPanelProps = {
  history: HistoryItem[];
  suggestions: Record<string, { category: string; reason: string }>;
  rankLevel: string;
};

const MAIN_CATEGORIES = ['Military', 'Performance', 'Professional Qualities', 'Leadership'] as const;
type MainCategory = typeof MAIN_CATEGORIES[number];

export default function ExportPanel({ history, suggestions, rankLevel }: ExportPanelProps) {
  const [showAckModal, setShowAckModal] = useState(false);
  const [pendingExport, setPendingExport] = useState<(() => void) | null>(null);

  const requestExport = (exportFn: () => void) => {
    setPendingExport(() => exportFn);
    setShowAckModal(true);
  };

  const handleAckConfirm = () => {
    setShowAckModal(false);
    if (pendingExport) {
      pendingExport();
      setPendingExport(null);
    }
  };

  const handleAckCancel = () => {
    setShowAckModal(false);
    setPendingExport(null);
  };

  const [selectedCategories, setSelectedCategories] = useState<Record<MainCategory, boolean>>({
    Military: true,
    Performance: true,
    'Professional Qualities': true,
    Leadership: true,
  });

  const MIN_MARK = 4;
  const MAX_MARK = 7;
  const dashboardSubCategories = [
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
  ];

  const normalizeCategory = (category: string): string => {
    const trimmed = category.trim();
    if (trimmed.toLowerCase() === 'customs, courtesies, and traditions') {
      return 'Customs, Courtesies and Traditions';
    }
    return trimmed;
  };

  const getCategoryCount = (subCategory: string): number => {
    return history.reduce((count, item) => {
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

  const getRecommendedMarks = async (): Promise<Record<string, number>> => {
    const bulletsByCategory: Record<string, string[]> = Object.fromEntries(
      dashboardSubCategories.map((cat) => [cat, [] as string[]])
    );

    history.forEach((item) => {
      const rawCategory = item.category || suggestions[item.text]?.category;
      if (!rawCategory) return;

      const normalized = normalizeCategory(rawCategory);
      const matched = dashboardSubCategories.find(
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
      dashboardSubCategories.map((subCategory) => {
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

  const handleExportWord = async () => {
    const recommendedMarks = await getRecommendedMarks();

    const categoryMapping: Record<string, string> = {
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
      'Effective Communication': 'Leadership'
    };

    const groupedByCategory: Record<string, HistoryItem[]> = {};
    const uncategorized: HistoryItem[] = [];

    history.forEach((item) => {
      if (item.category) {
        const normalizedCategory = item.category.trim();
        let found = false;
        for (const [subCategory] of Object.entries(categoryMapping)) {
          if (subCategory.toLowerCase() === normalizedCategory.toLowerCase()) {
            if (!groupedByCategory[subCategory]) groupedByCategory[subCategory] = [];
            groupedByCategory[subCategory].push(item);
            found = true;
            break;
          }
        }
        if (!found) uncategorized.push(item);
      } else {
        uncategorized.push(item);
      }
    });

    const mainCategoryOrder: Record<string, string[]> = {
      'Military': ['Military Bearing', 'Customs, Courtesies and Traditions'],
      'Performance': ['Quality of Work', 'Technical Proficiency', 'Initiative'],
      'Professional Qualities': ['Decision Making and Problem Solving', 'Military Readiness', 'Self Awareness and Learning', 'Team Building'],
      'Leadership': ['Respect for Others', 'Accountability and Responsibility', 'Influencing Others', 'Effective Communication'],
    };

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

    for (const [mainCategory, subCategories] of Object.entries(mainCategoryOrder)) {
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
        const items = groupedByCategory[subCategory] || [];

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
                  new TextRun({ text: ` (${new Date(item.date).toLocaleDateString()})`, size: 20, color: '888888' }),
                ],
                indent: { left: 360 },
                spacing: { after: 80 },
              })
            );
          }
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

    const categoryMapping: Record<string, string> = {
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

    const mainCategoryOrder: Record<string, string[]> = {
      'Military': ['Military Bearing', 'Customs, Courtesies and Traditions'],
      'Performance': ['Quality of Work', 'Technical Proficiency', 'Initiative'],
      'Professional Qualities': ['Decision Making and Problem Solving', 'Military Readiness', 'Self Awareness and Learning', 'Team Building'],
      'Leadership': ['Respect for Others', 'Accountability and Responsibility', 'Influencing Others', 'Effective Communication'],
    };

    const groupedByCategory: Record<string, HistoryItem[]> = {};
    const uncategorized: HistoryItem[] = [];

    history.forEach((item) => {
      if (item.category) {
        const normalizedCategory = item.category.trim();
        let found = false;
        for (const [subCategory] of Object.entries(categoryMapping)) {
          if (subCategory.toLowerCase() === normalizedCategory.toLowerCase()) {
            if (!groupedByCategory[subCategory]) groupedByCategory[subCategory] = [];
            groupedByCategory[subCategory].push(item);
            found = true;
            break;
          }
        }
        if (!found) uncategorized.push(item);
      } else {
        uncategorized.push(item);
      }
    });

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
      const suggested = suggestCategory(item.text);
      if (!groupedByCategory[suggested]) groupedByCategory[suggested] = [];
      groupedByCategory[suggested].push({ ...item, category: suggested });
    });

    const lines: string[] = [];
    lines.push('BULLET HISTORY EXPORT');
    lines.push(`Exported on: ${new Date().toLocaleDateString()}`);
    lines.push('');

    for (const [mainCategory, subCategories] of Object.entries(mainCategoryOrder)) {
      if (!selectedCategories[mainCategory as MainCategory]) continue;
      lines.push('='.repeat(50));
      lines.push(mainCategory.toUpperCase());
      lines.push('='.repeat(50));
      lines.push('');

      for (const subCategory of subCategories) {
        const markingVal = recommendedMarks[subCategory] ?? getMarkingValue(subCategory);
        const items = groupedByCategory[subCategory] || [];
        lines.push(`${subCategory}  |  Recommended Mark: ${markingVal}`);
        lines.push('-'.repeat(40));

        if (items.length === 0) {
          lines.push('  None');
        } else {
          const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          for (const item of sorted) {
            lines.push(`  ${item.text} (${new Date(item.date).toLocaleDateString()})`);
          }
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

    // Title
    doc.setFontSize(20);
    doc.text('Bullet History Export', 20, 30);

    // Date
    doc.setFontSize(12);
    doc.text(`Exported on: ${new Date().toLocaleDateString()}`, 20, 45);

    let yPosition = 65;

    // Define the hierarchical category mapping (subcategory -> main category)
    const categoryMapping: Record<string, string> = {
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
      'Effective Communication': 'Leadership'
    };

    // Group history items by their actual assigned categories
    const groupedByCategory: Record<string, HistoryItem[]> = {};
    const uncategorized: HistoryItem[] = [];

    history.forEach((item) => {
      if (item.category) {
        // Normalize category name (trim whitespace)
        const normalizedCategory = item.category.trim();
        let found = false;
        
        // Check if this category matches any subcategory in our mapping (case-insensitive)
        for (const [subCategory, mainCategory] of Object.entries(categoryMapping)) {
          if (subCategory.toLowerCase() === normalizedCategory.toLowerCase()) {
            if (!groupedByCategory[subCategory]) {
              groupedByCategory[subCategory] = [];
            }
            groupedByCategory[subCategory].push(item);
            found = true;
            break;
          }
        }
        
        // If not found in subcategories, check if it matches a main category name
        if (!found) {
          const mainCategories = ['Military', 'Performance', 'Professional Qualities', 'Leadership'];
          const matchedMainCategory = mainCategories.find(mainCat => 
            mainCat.toLowerCase() === normalizedCategory.toLowerCase()
          );
          
          if (matchedMainCategory) {
            // Create a pseudo-subcategory for this main category
            const pseudoSubCategory = `${matchedMainCategory} - General`;
            if (!groupedByCategory[pseudoSubCategory]) {
              groupedByCategory[pseudoSubCategory] = [];
            }
            groupedByCategory[pseudoSubCategory].push(item);
            found = true;
          }
        }
        
        if (!found) {
          uncategorized.push(item);
        }
      } else {
        uncategorized.push(item);
      }
    });

    // Function to suggest a category for uncategorized bullets
    const suggestCategory = (text: string): string => {
      const lowerText = text.toLowerCase();
      
      // Check for keywords that suggest categories
      if (lowerText.includes('military bearing') || lowerText.includes('bearing') || lowerText.includes('courtesy') || lowerText.includes('tradition')) {
        return 'Military Bearing';
      }
      if (lowerText.includes('quality') || lowerText.includes('work ethic') || lowerText.includes('performance')) {
        return 'Quality of Work';
      }
      if (lowerText.includes('technical') || lowerText.includes('proficiency') || lowerText.includes('skill')) {
        return 'Technical Proficiency';
      }
      if (lowerText.includes('initiative') || lowerText.includes('self-motivated') || lowerText.includes('proactive')) {
        return 'Initiative';
      }
      if (lowerText.includes('decision') || lowerText.includes('problem solving') || lowerText.includes('leadership')) {
        return 'Decision Making and Problem Solving';
      }
      if (lowerText.includes('readiness') || lowerText.includes('prepared') || lowerText.includes('military readiness')) {
        return 'Military Readiness';
      }
      if (lowerText.includes('self awareness') || lowerText.includes('learning') || lowerText.includes('growth')) {
        return 'Self Awareness and Learning';
      }
      if (lowerText.includes('team') || lowerText.includes('building') || lowerText.includes('collaboration')) {
        return 'Team Building';
      }
      if (lowerText.includes('respect') || lowerText.includes('others') || lowerText.includes('courtesy')) {
        return 'Respect for Others';
      }
      if (lowerText.includes('accountability') || lowerText.includes('responsibility') || lowerText.includes('duty')) {
        return 'Accountability and Responsibility';
      }
      if (lowerText.includes('influence') || lowerText.includes('communication') || lowerText.includes('interpersonal')) {
        return 'Influencing Others';
      }
      if (lowerText.includes('communication') || lowerText.includes('speaking') || lowerText.includes('writing')) {
        return 'Effective Communication';
      }
      
      // Default fallback
      return 'Military Bearing';
    };

    // Process uncategorized items - try to categorize them
    uncategorized.forEach((item) => {
      const suggestedCategory = suggestCategory(item.text);
      // Add to the appropriate category
      if (!groupedByCategory[suggestedCategory]) {
        groupedByCategory[suggestedCategory] = [];
      }
      groupedByCategory[suggestedCategory].push({
        ...item,
        category: suggestedCategory
      });
    });

    // Function to add a category section
    const addCategorySection = (categoryName: string, items: HistoryItem[]) => {
      // Pre-sort items
      const sortedItems = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Pre-calculate section height
      let sectionHeight = 16; // header
      sortedItems.forEach((item) => {
        const dateStr = ` (${new Date(item.date).toLocaleDateString()})`;
        const lines = doc.splitTextToSize(item.text + dateStr, 155);
        sectionHeight += lines.length * 4.5 + 12;
      });
      sectionHeight += 4; // bottom padding

      // Start new page if section won't fit
      if (yPosition + sectionHeight > 270) {
        doc.addPage();
        yPosition = 30;
      }

      // Draw light grey background box
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(17, yPosition - 4, 176, sectionHeight, 2, 2, 'F');

      // Category header with marking value on the right
      doc.setFontSize(13);
      doc.setTextColor(60, 60, 60);
      doc.text(categoryName, 22, yPosition + 4);
      const markingVal = recommendedMarks[categoryName] ?? getMarkingValue(categoryName);
      doc.setFontSize(11);
      doc.setTextColor(30, 80, 180);
      doc.text(`Recommended Mark: ${markingVal}`, 185, yPosition + 4, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      yPosition += 16;

      sortedItems.forEach((item) => {
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        const dateStr = ` (${new Date(item.date).toLocaleDateString()})`;
        const fullText = item.text + dateStr;
        const lines = doc.splitTextToSize(fullText, 155);
        doc.text(lines, 25, yPosition);
        yPosition += lines.length * 4.5 + 12;
      });

      // Space after section
      yPosition += 8;
    };

    // Function to add a main category section with its subcategories
    const addMainCategorySection = (mainCategoryName: string, subCategories: string[]) => {
      // Check if we need a new page for the main category header
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 30;
      }

      // Main category header (centered)
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text(mainCategoryName, 105, yPosition, { align: 'center' });
      yPosition += 15;

      // Show all subcategories, with "None" for those without bullets
      subCategories.forEach((subCategory) => {
        const items = groupedByCategory[subCategory];
        if (items && items.length > 0) {
          addCategorySection(subCategory, items);
        } else {
          // Empty subcategory box
          if (yPosition + 28 > 270) {
            doc.addPage();
            yPosition = 30;
          }
          doc.setFillColor(245, 245, 245);
          doc.roundedRect(17, yPosition - 4, 176, 28, 2, 2, 'F');
          doc.setFontSize(13);
          doc.setTextColor(60, 60, 60);
          doc.text(subCategory, 22, yPosition + 4);
          const emptyMarkingVal = recommendedMarks[subCategory] ?? getMarkingValue(subCategory);
          doc.setTextColor(30, 80, 180);
          doc.setFontSize(11);
          doc.text(`Recommended Mark: ${emptyMarkingVal}`, 185, yPosition + 4, { align: 'right' });
          doc.setFontSize(11);
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
    Object.entries(categoryMapping).forEach(([subCategory, mainCategory]) => {
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
    Object.keys(mainCategories).forEach((mainCategory) => {
      if (!selectedCategories[mainCategory as MainCategory]) return;
      const subCategories = mainCategories[mainCategory];
      addMainCategorySection(mainCategory, subCategories);
    });

    // Add any categories that don't fit the main structure
    const knownSubCategories = Object.keys(categoryMapping);
    const unknownCategories = Object.keys(groupedByCategory).filter(cat => !knownSubCategories.includes(cat));

    if (unknownCategories.length > 0) {
      // Check if we need a new page
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 30;
      }

      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text('Other Categories', 20, yPosition);
      yPosition += 15;

      unknownCategories.forEach((category) => {
        const items = groupedByCategory[category];
        if (items.length > 0) {
          addCategorySection(category, items);
        }
      });
    }

    // Save the PDF
    doc.save('bullet-history.pdf');
  };

  return (
    <>
    <div className="bg-white p-6 rounded-xl shadow-md space-y-6">
      <h2 className="text-xl font-semibold">Export Bullets</h2>

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

      {history.length === 0 ? (
        <p className="text-gray-500">No history items to export.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {history.length} item{history.length !== 1 ? 's' : ''} in history.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => requestExport(handleExportPDF)}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Export as PDF
            </button>
            <button
              onClick={() => requestExport(handleExportWord)}
              className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Export as Word
            </button>
            <button
              onClick={() => requestExport(handleExportTxt)}
              className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
            >
              Export as Text
            </button>
          </div>
        </div>
      )}
    </div>

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
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
              >
                Acknowledge &amp; Export
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}