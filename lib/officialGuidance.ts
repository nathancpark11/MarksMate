import { sql, ensureSchema } from "@/lib/db";

type GuidanceChunk = {
  id: string;
  title: string;
  text: string;
  keywords?: string[];
  page?: number;
};

type GuidanceDataset = {
  source?: string;
  ranks?: string[];
  chunks: GuidanceChunk[];
};

let cachedDatasetsPromise: Promise<GuidanceDataset[]> | null = null;

export function clearOfficialGuidanceCache() {
  cachedDatasetsPromise = null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "with",
  "your",
  "you",
  "this",
  "must",
]);

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function normalizeRank(rankLevel: string) {
  const normalized = rankLevel.toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/E-?(\d+)/);
  if (!match) {
    return normalized;
  }

  return `E${match[1]}`;
}

function parseRankList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeRank(entry))
    .filter(Boolean);
}

function sanitizeDataset(parsed: GuidanceDataset) {
  if (!Array.isArray(parsed.chunks)) {
    return null;
  }

  const chunks = parsed.chunks
    .filter((chunk): chunk is GuidanceChunk => {
      return Boolean(chunk && typeof chunk.id === "string" && typeof chunk.text === "string");
    })
    .map((chunk) => ({
      ...chunk,
      title: typeof chunk.title === "string" ? chunk.title : "Guidance",
      keywords: Array.isArray(chunk.keywords)
        ? chunk.keywords.filter((entry): entry is string => typeof entry === "string")
        : [],
    }));

  if (!chunks.length) {
    return null;
  }

  return {
    source: parsed.source,
    ranks: parseRankList(parsed.ranks),
    chunks,
  } as GuidanceDataset;
}

async function loadGuidanceDatasets() {
  if (!cachedDatasetsPromise) {
    cachedDatasetsPromise = (async () => {
      try {
        await ensureSchema();
        const { rows } = await sql`SELECT source, ranks, chunks FROM guidance_datasets ORDER BY id`;
        const datasets: GuidanceDataset[] = [];
        for (const row of rows) {
          try {
            const parsed: GuidanceDataset = {
              source: typeof row.source === "string" ? row.source : "Official Marking Guide",
              ranks: JSON.parse(typeof row.ranks === "string" ? row.ranks : "[]") as string[],
              chunks: JSON.parse(typeof row.chunks === "string" ? row.chunks : "[]") as GuidanceChunk[],
            };
            const sanitized = sanitizeDataset(parsed);
            if (sanitized) {
              datasets.push(sanitized);
            }
          } catch {
            // Skip malformed rows.
          }
        }
        return datasets;
      } catch {
        return [];
      }
    })();
  }

  return cachedDatasetsPromise;
}

function scoreChunk(chunk: GuidanceChunk, queryTerms: Set<string>, priorityTerms?: Set<string>) {
  const chunkTerms = tokenize(`${chunk.title} ${chunk.text}`);
  const keywordTerms = tokenize((chunk.keywords || []).join(" "));

  let score = 0;
  for (const term of queryTerms) {
    if (keywordTerms.includes(term)) {
      score += 3;
    }
    if (chunkTerms.includes(term)) {
      score += 1;
    }
  }

  if (priorityTerms?.size) {
    for (const term of priorityTerms) {
      if (chunkTerms.includes(term)) {
        score += 6;
      }
    }
  }

  return score;
}

export async function getCategorySpecificGuidanceContext(params: {
  accomplishment: string;
  missionImpact: string;
  category: string;
  rankLevel: string;
  rating: string;
  maxChunks?: number;
}): Promise<{ context: string; sections: string[] }> {
  const datasets = await loadGuidanceDatasets();
  if (!datasets.length) {
    return { context: "", sections: [] };
  }

  const requestedRank = normalizeRank(params.rankLevel);
  const rankMatchedDatasets = datasets.filter((dataset) => {
    if (!dataset.ranks || !dataset.ranks.length) return false;
    return dataset.ranks.includes(requestedRank);
  });
  const selectedDatasets = rankMatchedDatasets.length ? rankMatchedDatasets : datasets;

  const allChunks = selectedDatasets.flatMap((dataset) =>
    dataset.chunks.map((chunk) => ({
      chunk,
      source: dataset.source || "Official Marking Guide",
    }))
  );

  // Exact title match — works when the PDF was chunked per-category.
  const exactMatch = allChunks.find(
    ({ chunk }) => chunk.title.toLowerCase() === params.category.toLowerCase()
  );

  let rankedChunks: Array<{ chunk: GuidanceChunk; source: string }>;
  if (exactMatch) {
    rankedChunks = [exactMatch];
  } else {
    // Fallback: keyword scoring for legacy generic-chunked datasets.
    const queryTerms = new Set(
      tokenize(
        [params.accomplishment, params.missionImpact, params.category, params.rankLevel, params.rating]
          .filter(Boolean)
          .join(" ")
      )
    );
    if (!queryTerms.size) return { context: "", sections: [] };
    const priorityTerms = new Set(tokenize(params.category));
    rankedChunks = allChunks
      .map(({ chunk, source }) => ({ chunk, source, score: scoreChunk(chunk, queryTerms, priorityTerms) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)
      .map(({ chunk, source }) => ({ chunk, source }));
  }

  if (!rankedChunks.length) {
    return { context: "", sections: [] };
  }

  const renderedChunks = rankedChunks
    .map(({ chunk, source }, index) => {
      const citation = chunk.page ? `[${source} p.${chunk.page}]` : `[${source}]`;
      const text = chunk.text.length > 600 ? `${chunk.text.slice(0, 600)}…` : chunk.text;
      return `${index + 1}. ${chunk.title}: ${text} ${citation}`;
    })
    .join("\n");

  const sections = rankedChunks.map(({ chunk }) => {
    const flat = chunk.text.replace(/\s+/g, " ").trim();
    // Extract description: text between first em-dash/hyphen and where the "2 –" mark scale begins.
    const descMatch = flat.match(/[–\-]\s*(.+?)\s*(?=2\s*[–\-])/);
    const description = descMatch
      ? descMatch[1].trim()
      : flat.replace(/^[^–\-]*[–\-]\s*/, "").slice(0, 120).trim();
    return `[3788C] - ${chunk.title} - ${description}`;
  });

  return {
    context: `
Official Guidance Excerpts for ${params.category} (Authoritative):
- Follow this guidance when composing the bullet.
- Mirror the vocabulary and phrasing style used in these excerpts when describing performance in this category.
- If the user input conflicts with this guidance, follow this guidance.
- Do not quote these excerpts verbatim.
${renderedChunks}
`,
    sections,
  };
}

export async function getMarkDescriptionsForCategory(params: {
  category: string;
  rankLevel: string;
  maxChunks?: number;
}): Promise<string> {
  const datasets = await loadGuidanceDatasets();
  if (!datasets.length) {
    return "";
  }

  const requestedRank = normalizeRank(params.rankLevel);
  const rankMatchedDatasets = datasets.filter((dataset) => {
    if (!dataset.ranks || !dataset.ranks.length) return false;
    return dataset.ranks.includes(requestedRank);
  });
  const selectedDatasets = rankMatchedDatasets.length ? rankMatchedDatasets : datasets;

  const allChunks = selectedDatasets.flatMap((dataset) =>
    dataset.chunks.map((chunk) => ({
      chunk,
      source: dataset.source || "Official Marking Guide",
    }))
  );

  // Exact title match — works when the PDF was chunked per-category.
  const exactMatch = allChunks.find(
    ({ chunk }) => chunk.title.toLowerCase() === params.category.toLowerCase()
  );

  let rankedChunks: Array<{ chunk: GuidanceChunk; source: string }>;
  if (exactMatch) {
    rankedChunks = [exactMatch];
  } else {
    // Fallback: keyword scoring for legacy generic-chunked datasets.
    const queryTerms = new Set([...tokenize(params.category)]);
    const priorityTerms = new Set(tokenize(params.category));
    rankedChunks = allChunks
      .map(({ chunk, source }) => ({ chunk, source, score: scoreChunk(chunk, queryTerms, priorityTerms) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)
      .map(({ chunk, source }) => ({ chunk, source }));
  }

  if (!rankedChunks.length) {
    return "";
  }

  const source = rankedChunks[0]?.source || "Official Marking Guide";
  const renderedChunks = rankedChunks
    .map(({ chunk }, index) => `${index + 1}. ${chunk.text}`)
    .join("\n");

  return `Official Mark Descriptions for ${params.category} [${source}]:\n${renderedChunks}`;
}

export async function getOfficialGuidanceContext(params: {
  accomplishment: string;
  missionImpact: string;
  category: string;
  rankLevel: string;
  rating: string;
  maxChunks?: number;
}) {
  const datasets = await loadGuidanceDatasets();
  if (!datasets.length) {
    return "";
  }

  const queryTerms = new Set(
    tokenize(
      [
        params.accomplishment,
        params.missionImpact,
        params.category,
        params.rankLevel,
        params.rating,
      ]
        .filter(Boolean)
        .join(" ")
    )
  );

  if (!queryTerms.size) {
    return "";
  }

  const requestedRank = normalizeRank(params.rankLevel);
  const rankMatchedDatasets = datasets.filter((dataset) => {
    if (!dataset.ranks || !dataset.ranks.length) {
      return false;
    }

    return dataset.ranks.includes(requestedRank);
  });

  const selectedDatasets = rankMatchedDatasets.length ? rankMatchedDatasets : datasets;

  const maxChunks = Number.isInteger(params.maxChunks) ? Math.max(1, params.maxChunks || 3) : 3;
  const rankedChunks = selectedDatasets
    .flatMap((dataset) =>
      dataset.chunks.map((chunk) => ({
        chunk,
        source: dataset.source || "Official Marking Guide",
        score: scoreChunk(chunk, queryTerms),
      }))
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(({ chunk, source }) => ({ chunk, source }));

  if (!rankedChunks.length) {
    return "";
  }

  const renderedChunks = rankedChunks
    .map(({ chunk, source }, index) => {
      const citation = chunk.page ? `[${source} p.${chunk.page}]` : `[${source}]`;
      return `${index + 1}. ${chunk.title}: ${chunk.text} ${citation}`;
    })
    .join("\n");

  return `
Official Guidance Excerpts (Authoritative):
- Follow this guidance when composing the bullet.
- If the user input conflicts with this guidance, follow this guidance.
- Do not quote these excerpts verbatim unless needed.
${renderedChunks}
`;
}
