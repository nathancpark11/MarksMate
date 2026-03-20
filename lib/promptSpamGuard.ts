export const GIANT_PROMPT_REJECTION_MESSAGE =
  "Please enter only the single accomplishment or selected log items you want converted into a mark.";

const MAX_SINGLE_INPUT_CHARS = 2500;
const MAX_COMBINED_INPUT_CHARS = 12000;
const MAX_SELECTED_LOG_ITEMS = 40;
const MAX_REPEATED_SEGMENT_COUNT = 8;
const MIN_SEGMENT_LENGTH = 16;

type CombinedInputValidationOptions = {
  maxItems?: number;
  maxCombinedChars?: number;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitSegments(value: string) {
  return value
    .split(/[\n.!?;|]+/)
    .map((segment) => normalizeWhitespace(segment).toLowerCase())
    .filter((segment) => segment.length >= MIN_SEGMENT_LENGTH);
}

function hasExcessiveRepeatedSegments(value: string) {
  const segments = splitSegments(value);
  if (segments.length < MAX_REPEATED_SEGMENT_COUNT) {
    return false;
  }

  const counts = new Map<string, number>();
  for (const segment of segments) {
    const nextCount = (counts.get(segment) ?? 0) + 1;
    if (nextCount >= MAX_REPEATED_SEGMENT_COUNT) {
      return true;
    }
    counts.set(segment, nextCount);
  }

  return false;
}

function hasExcessiveRepeatedTokens(value: string) {
  const tokens = value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9%]/g, ""))
    .filter(Boolean);

  if (tokens.length < 30) {
    return false;
  }

  const windowSize = 6;
  const counts = new Map<string, number>();

  for (let i = 0; i <= tokens.length - windowSize; i += 1) {
    const phrase = tokens.slice(i, i + windowSize).join(" ");
    const nextCount = (counts.get(phrase) ?? 0) + 1;
    if (nextCount >= 6) {
      return true;
    }
    counts.set(phrase, nextCount);
  }

  return false;
}

function isPromptSpam(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  return hasExcessiveRepeatedSegments(normalized) || hasExcessiveRepeatedTokens(normalized);
}

export function validateSingleAiInput(value: string) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_SINGLE_INPUT_CHARS) {
    return GIANT_PROMPT_REJECTION_MESSAGE;
  }

  if (isPromptSpam(normalized)) {
    return GIANT_PROMPT_REJECTION_MESSAGE;
  }

  return null;
}

export function validateCombinedAiInputs(
  values: string[],
  options: CombinedInputValidationOptions = {}
) {
  const maxItems = options.maxItems ?? MAX_SELECTED_LOG_ITEMS;
  const maxCombinedChars = options.maxCombinedChars ?? MAX_COMBINED_INPUT_CHARS;
  const normalizedValues = values.map((value) => normalizeWhitespace(value)).filter(Boolean);

  if (normalizedValues.length > maxItems) {
    return GIANT_PROMPT_REJECTION_MESSAGE;
  }

  const combined = normalizedValues.join("\n");
  if (!combined) {
    return null;
  }

  if (combined.length > maxCombinedChars) {
    return GIANT_PROMPT_REJECTION_MESSAGE;
  }

  if (isPromptSpam(combined)) {
    return GIANT_PROMPT_REJECTION_MESSAGE;
  }

  return null;
}