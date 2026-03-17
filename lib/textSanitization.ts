type SanitizeTextOptions = {
  preserveLineBreaks?: boolean;
  normalizeQuotesAndDashes?: boolean;
};

const INVISIBLE_JUNK_PATTERN =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180D\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF]/g;
const UNSUPPORTED_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const FORMATTING_SPACE_PATTERN = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

function normalizeQuotesAndDashes(value: string) {
  return value
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

export function sanitizeText(value: string, options: SanitizeTextOptions = {}): string {
  const {
    preserveLineBreaks = true,
    normalizeQuotesAndDashes: shouldNormalizeQuotesAndDashes = true,
  } = options;

  let sanitized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(FORMATTING_SPACE_PATTERN, " ")
    .replace(INVISIBLE_JUNK_PATTERN, "")
    .replace(UNSUPPORTED_CONTROL_PATTERN, "");

  if (shouldNormalizeQuotesAndDashes) {
    sanitized = normalizeQuotesAndDashes(sanitized);
  }

  const normalizedLines = sanitized
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim());

  if (preserveLineBreaks) {
    return normalizedLines
      .filter((line) => line.length > 0)
      .join("\n")
      .trim();
  }

  return normalizedLines.join(" ").replace(/\s+/g, " ").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function sanitizeUnknownStrings<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeText(value, { preserveLineBreaks: false }) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknownStrings(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeUnknownStrings(item)])
    ) as T;
  }

  return value;
}