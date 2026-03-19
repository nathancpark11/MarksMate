import { PDFParse } from "pdf-parse";
import { requireSessionUser } from "@/lib/auth";
import { isGuidanceAdminUsername } from "@/lib/admin";
import { enforceRateLimits } from "@/lib/rateLimit";
import { clearOfficialGuidanceCache } from "@/lib/officialGuidance";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function normalizeRank(value: string) {
  const match = value.trim().toUpperCase().replace(/\s+/g, "").match(/E-?(\d+)/);
  return match ? `E${match[1]}` : "";
}

function normalizeText(input: string) {
  return input
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\u0000/g, "")
    .trim();
}

function splitIntoParagraphs(input: string) {
  return input
    .split(/\n\s*\n/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 60);
}

function chunkParagraphs(paragraphs: string[], maxLength = 900) {
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if (`${current}\n\n${paragraph}`.length <= maxLength) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }

    chunks.push(current);
    current = paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

const EVALUATION_CATEGORIES = [
  "Military Bearing",
  "Customs, Courtesies and Traditions",
  "Quality of Work",
  "Technical Proficiency",
  "Initiative",
  "Decision Making and Problem Solving",
  "Military Readiness",
  "Self Awareness and Learning",
  "Team Building",
  "Respect for Others",
  "Accountability and Responsibility",
  "Influencing Others",
  "Effective Communication",
] as const;

// Finds each known USCG evaluation category in the full PDF text and makes it
// its own named chunk, so retrieval can do an exact title match later.
function extractCategoryChunks(text: string) {
  const flat = text.replace(/\s+/g, " ");

  const positions: Array<{ name: string; index: number }> = [];
  for (const name of EVALUATION_CATEGORIES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(escaped, "i").exec(flat);
    if (match) {
      positions.push({ name, index: match.index });
    }
  }

  positions.sort((a, b) => a.index - b.index);
  if (!positions.length) return [];

  return positions
    .map(({ name, index: startIndex }, i) => {
      const endIndex = i + 1 < positions.length ? positions[i + 1].index : flat.length;
      const cleaned = flat
        .slice(startIndex, endIndex)
        .replace(/Member:\s*Supervisor:\s*(?:CPO:\s*)?Marking Official:/gi, "")
        .replace(/Page \d+ of \d+/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: `category-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: name,
        text: cleaned,
        keywords: name
          .toLowerCase()
          .split(/[\s,/]+/)
          .filter((w) => w.length > 2),
      };
    })
    .filter((chunk) => chunk.text.length > 50);
}

function sanitizeFileNameSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function parseStoredRanks(value: unknown) {
  if (typeof value !== "string") {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => normalizeRank(entry))
      .filter(Boolean);
  } catch {
    return [] as string[];
  }
}

async function requireGuidanceAdmin() {
  const { user, response: authResponse } = await requireSessionUser();
  if (authResponse || !user) {
    return {
      user: null,
      response: authResponse ?? Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isGuidanceAdminUsername(user.username)) {
    return {
      user: null,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user, response: null };
}

export async function GET() {
  try {
    const { response } = await requireGuidanceAdmin();
    if (response) {
      return response;
    }

    await ensureSchema();
    const { rows } = await sql`
      SELECT rank, source, file_name, output_file, chunk_count, uploaded_at, uploaded_by, replaced_existing
      FROM guidance_upload_log
      ORDER BY uploaded_at DESC, id DESC
      LIMIT 100
    `;

    const entries = rows.map((row) => ({
      rank: typeof row.rank === "string" ? row.rank : "",
      source: typeof row.source === "string" ? row.source : "Official Marking Guide",
      fileName: typeof row.file_name === "string" ? row.file_name : "",
      outputFile: typeof row.output_file === "string" ? row.output_file : "",
      chunkCount: typeof row.chunk_count === "number" ? row.chunk_count : 0,
      uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : "",
      uploadedBy: typeof row.uploaded_by === "string" ? row.uploaded_by : "",
      replacedExisting: Boolean(row.replaced_existing),
    }));

    return Response.json({ entries }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to load guidance upload history right now." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, response } = await requireGuidanceAdmin();
    if (response || !user) {
      return response ?? Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "upload-official-guidance-per-hour",
        maxRequests: 12,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Rate limit reached for guidance uploads.",
      },
    ]);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const formData = await req.formData();
    const sourceRaw = formData.get("source");
    const ranksRaw = formData.getAll("ranks");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "A PDF file is required." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `File too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
        { status: 413 }
      );
    }

    const source = typeof sourceRaw === "string" && sourceRaw.trim() ? sourceRaw.trim() : "Official Marking Guide";
    const ranks = ranksRaw
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeRank(value))
      .filter(Boolean);

    const uniqueRanks = [...new Set(ranks)].sort();

    if (!uniqueRanks.length) {
      return Response.json({ error: "Select at least one rank (E3-E7)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    const normalized = normalizeText(parsed.text || "");
    await parser.destroy();

    if (!normalized) {
      return Response.json({ error: "No text could be extracted from that PDF." }, { status: 400 });
    }

    const categoryChunks = extractCategoryChunks(normalized);
    const chunks = categoryChunks.length
      ? categoryChunks
      : chunkParagraphs(splitIntoParagraphs(normalized)).map((text, index) => ({
          id: `chunk-${index + 1}`,
          title: `Section ${index + 1}`,
          text,
          keywords: [] as string[],
        }));

    if (!chunks.length) {
      return Response.json({ error: "No guidance chunks were generated from that PDF." }, { status: 400 });
    }

    const ranksKey = uniqueRanks.join(",");
    const outputName = `${sanitizeFileNameSegment(ranksKey)}.json`;
    const generatedAt = new Date().toISOString();

    await ensureSchema();
    const { rows: existingRows } = await sql`
      SELECT id, ranks
      FROM guidance_datasets
      ORDER BY id
    `;

    const replacedRanks = new Set<string>();
    const datasetIdsToDelete: number[] = [];

    for (const row of existingRows) {
      const storedRanks = parseStoredRanks(row.ranks);
      const overlapsSelectedRank = storedRanks.some((rank) => uniqueRanks.includes(rank));
      if (!overlapsSelectedRank) {
        continue;
      }

      for (const rank of storedRanks) {
        if (uniqueRanks.includes(rank)) {
          replacedRanks.add(rank);
        }
      }

      if (typeof row.id === "number") {
        datasetIdsToDelete.push(row.id);
      }
    }

    for (const datasetId of datasetIdsToDelete) {
      await sql`DELETE FROM guidance_datasets WHERE id = ${datasetId}`;
    }

    for (const rank of uniqueRanks) {
      await sql`
        INSERT INTO guidance_datasets (ranks_key, source, ranks, chunks, generated_at, uploaded_by)
        VALUES (
          ${rank},
          ${source},
          ${JSON.stringify([rank])},
          ${JSON.stringify(chunks)},
          ${generatedAt},
          ${user.username}
        )
        ON CONFLICT (ranks_key) DO UPDATE SET
          source       = EXCLUDED.source,
          ranks        = EXCLUDED.ranks,
          chunks       = EXCLUDED.chunks,
          generated_at = EXCLUDED.generated_at,
          uploaded_by  = EXCLUDED.uploaded_by
      `;

      await sql`
        INSERT INTO guidance_upload_log (
          rank,
          source,
          file_name,
          output_file,
          chunk_count,
          uploaded_at,
          uploaded_by,
          replaced_existing
        )
        VALUES (
          ${rank},
          ${source},
          ${file.name},
          ${outputName},
          ${chunks.length},
          ${generatedAt},
          ${user.username},
          ${replacedRanks.has(rank)}
        )
      `;
    }

    clearOfficialGuidanceCache();

    const replacementMessage = replacedRanks.size
      ? ` Replaced existing guidance for ${[...replacedRanks].sort().join(", ")}.`
      : "";

    return Response.json(
      {
        ok: true,
        message: categoryChunks.length
          ? `Indexed ${categoryChunks.length} categories for ${uniqueRanks.join(", ")}.${replacementMessage}`
          : `Uploaded and indexed ${chunks.length} sections for ${uniqueRanks.join(", ")}.${replacementMessage}`,
        outputFile: outputName,
        chunks: chunks.length,
        uploadHistory: uniqueRanks.map((rank) => ({
          rank,
          source,
          fileName: file.name,
          outputFile: outputName,
          chunkCount: chunks.length,
          uploadedAt: generatedAt,
          uploadedBy: user.username,
          replacedExisting: replacedRanks.has(rank),
        })),
      },
      { status: 200 }
    );
  } catch {
    return Response.json({ error: "Unable to upload and index guidance right now." }, { status: 500 });
  }
}
