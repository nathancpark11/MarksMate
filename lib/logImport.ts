export function normalizeImportedAction(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/^[\s\-\*\u2022\u25CF\u25E6\u2043\d.)]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ImportedLogEntry = {
  text: string;
  dates: string[];
};

const MONTH_PATTERN = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_VALUE_PATTERN = `\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}|${MONTH_PATTERN}\\s+\\d{1,2}(?:,\\s*\\d{2,4})?|\\d{1,2}\\s+${MONTH_PATTERN}(?:\\s+\\d{2,4})?`;
const DATE_AT_START_PATTERN = new RegExp(
  `^[\\[(]?(${DATE_VALUE_PATTERN})[\\])]?(?:\\s*[-:|]\\s*|\\s+)`,
  "i"
);
const DATE_AT_END_PATTERN = new RegExp(
  `(?:\\s*[-:|]\\s*|\\s+)[\\[(]?(${DATE_VALUE_PATTERN})[\\])]?[.)\\]"']*$`,
  "i"
);
const WRAPPED_DATE_PATTERN = new RegExp(`[\\[(](${DATE_VALUE_PATTERN})[\\])]`, "gi");

function normalizeDetectedDate(rawDate: string) {
  const cleaned = rawDate.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const currentYear = new Date().getFullYear();
  const hasYear = /\b\d{4}\b/.test(cleaned) || /\b\d{2}\b/.test(cleaned.split(/[/-]/).pop() || "");
  const candidate = hasYear ? cleaned : `${cleaned} ${currentYear}`;
  const parsed = new Date(candidate);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function extractDatesFromLine(line: string) {
  const lineWithoutBulletPrefix = line.replace(/^([\-\*\u2022\u25CF\u25E6\u2043]|\d+[.)]|[a-zA-Z][.)])\s+/, "").trim();
  const collectedDates: string[] = [];
  let remainingText = lineWithoutBulletPrefix;

  remainingText = remainingText.replace(WRAPPED_DATE_PATTERN, (fullMatch, rawDate: string) => {
    const normalizedDate = normalizeDetectedDate(rawDate);
    if (normalizedDate) {
      collectedDates.push(normalizedDate);
    }

    const matchIndex = remainingText.indexOf(fullMatch);
    const hasContentBefore = matchIndex > 0 && /\S/.test(remainingText.slice(0, matchIndex));
    const afterMatchIndex = matchIndex + fullMatch.length;
    const hasContentAfter = /\S/.test(remainingText.slice(afterMatchIndex));

    return hasContentBefore && hasContentAfter ? " " : "";
  });

  remainingText = remainingText
    .replace(/\s+/g, " ")
    .replace(/[-:|\s]+$/, "")
    .trim();

  while (true) {
    const startMatch = remainingText.match(DATE_AT_START_PATTERN);
    if (!startMatch?.[1]) {
      break;
    }

    const normalizedDate = normalizeDetectedDate(startMatch[1]);
    if (!normalizedDate) {
      break;
    }

    collectedDates.push(normalizedDate);
    remainingText = remainingText.slice(startMatch[0].length).trim();
  }

  while (true) {
    const endMatch = remainingText.match(DATE_AT_END_PATTERN);
    if (!endMatch?.[1]) {
      break;
    }

    const normalizedDate = normalizeDetectedDate(endMatch[1]);
    if (!normalizedDate) {
      break;
    }

    collectedDates.unshift(normalizedDate);
    remainingText = remainingText
      .slice(0, remainingText.length - endMatch[0].length)
      .replace(/[-:|\s]+$/, "")
      .trim();
  }

  return {
    dates: collectedDates.filter((date, index) => collectedDates.indexOf(date) === index),
    remainingText,
  };
}

function extractFallbackEntriesFromText(normalizedText: string): string[] {
  const rawLines = normalizedText.split("\n");
  const mergedEntries: string[] = [];
  let currentEntry = "";

  const flushCurrentEntry = () => {
    const cleaned = currentEntry.replace(/\s+/g, " ").trim();
    if (cleaned.length >= 18) {
      mergedEntries.push(cleaned);
    }
    currentEntry = "";
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    if (!line) {
      flushCurrentEntry();
      continue;
    }

    if (!currentEntry) {
      currentEntry = line;
      continue;
    }

    const startsWithDate = DATE_AT_START_PATTERN.test(line);
    const previous = currentEntry.trim();
    const lineStartsLikeContinuation =
      /^[a-z(,)]/.test(line) || /^(and|or|to|for|with|via|in|on|by|of|the)\b/i.test(line);
    const previousEndsLikeContinuation =
      /[-,:;]$/.test(previous) || /\b(and|or|to|for|with|via|in|on|by|of|the)$/i.test(previous);
    const shouldMerge = !startsWithDate && (lineStartsLikeContinuation || previousEndsLikeContinuation);

    if (shouldMerge) {
      currentEntry = `${currentEntry} ${line}`;
      continue;
    }

    flushCurrentEntry();
    currentEntry = line;
  }

  flushCurrentEntry();
  return mergedEntries;
}

export function extractCandidateEntriesFromText(text: string): ImportedLogEntry[] {
  const normalizedText = text.replace(/\r\n/g, "\n").trim();
  if (!normalizedText) {
    return [];
  }

  const bulletLikeLines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      /^([\-\*\u2022\u25CF\u25E6\u2043]|\d+[.)]|[a-zA-Z][.)])\s+/.test(line)
    );

  const fallbackLines = extractFallbackEntriesFromText(normalizedText);

  const sourceLines = bulletLikeLines.length > 0 ? bulletLikeLines : fallbackLines;
  const deduped: ImportedLogEntry[] = [];
  const seen = new Set<string>();

  for (const sourceLine of sourceLines) {
    const { dates, remainingText } = extractDatesFromLine(sourceLine);
    const normalizedTextValue = normalizeImportedAction(remainingText);
    if (normalizedTextValue.length < 8) {
      continue;
    }

    const key = `${normalizedTextValue.toLowerCase()}|${dates.join("|")}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      text: normalizedTextValue,
      dates,
    });

    if (deduped.length >= 40) {
      break;
    }
  }

  return deduped;
}

export function extractCandidateActionsFromText(text: string): string[] {
  return extractCandidateEntriesFromText(text).map((entry) => entry.text);
}
