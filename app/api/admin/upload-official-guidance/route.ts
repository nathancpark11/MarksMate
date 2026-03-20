import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireSessionUser } from "@/lib/auth";
import { isGuidanceAdminUsername } from "@/lib/admin";
import { enforceRateLimits } from "@/lib/rateLimit";
import { clearOfficialGuidanceCache } from "@/lib/officialGuidance";
import { extractTextFromPdfBuffer } from "@/lib/pdfTextExtraction";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

// JSON/base64 upload bodies expand the original PDF size, so keep the raw file
// limit below Vercel's 4.5 MB function payload ceiling.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const LOCAL_GUIDANCE_DIR = path.join(process.cwd(), "data", "official-guidance");
const LOCAL_UPLOAD_LOG_PATH = path.join(LOCAL_GUIDANCE_DIR, "upload-log.json");

type ParsedUploadRequest = {
  fileName: string;
  fileBuffer: Buffer;
  source: string;
  uniqueRanks: string[];
};

type UploadHistoryEntry = {
  rank: string;
  source: string;
  fileName: string;
  outputFile: string;
  chunkCount: number;
  uploadedAt: string;
  uploadedBy: string;
  replacedExisting: boolean;
};

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

function rankFileName(rank: string) {
  return `${sanitizeFileNameSegment(rank)}.json`;
}

function normalizeUploadHistoryEntry(value: unknown): UploadHistoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const rank = typeof entry.rank === "string" ? normalizeRank(entry.rank) : "";
  if (!rank) {
    return null;
  }

  return {
    rank,
    source: typeof entry.source === "string" && entry.source.trim() ? entry.source.trim() : "Official Marking Guide",
    fileName: typeof entry.fileName === "string" ? entry.fileName : "",
    outputFile: typeof entry.outputFile === "string" ? entry.outputFile : rankFileName(rank),
    chunkCount: typeof entry.chunkCount === "number" ? entry.chunkCount : 0,
    uploadedAt: typeof entry.uploadedAt === "string" ? entry.uploadedAt : "",
    uploadedBy: typeof entry.uploadedBy === "string" ? entry.uploadedBy : "",
    replacedExisting: Boolean(entry.replacedExisting),
  };
}

function uploadHistoryKey(entry: UploadHistoryEntry) {
  return [entry.rank, entry.uploadedAt, entry.uploadedBy, entry.outputFile, entry.fileName, entry.source].join("|");
}

function sortUploadHistory(entries: UploadHistoryEntry[]) {
  return [...entries].sort((a, b) => {
    const aTs = Date.parse(a.uploadedAt || "");
    const bTs = Date.parse(b.uploadedAt || "");
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) {
      return bTs - aTs;
    }
    if (a.uploadedAt !== b.uploadedAt) {
      return a.uploadedAt > b.uploadedAt ? -1 : 1;
    }
    return a.rank.localeCompare(b.rank);
  });
}

function mergeUploadHistoryEntries(...entrySets: UploadHistoryEntry[][]) {
  const merged = new Map<string, UploadHistoryEntry>();
  for (const entries of entrySets) {
    for (const entry of entries) {
      const normalized = normalizeUploadHistoryEntry(entry);
      if (!normalized) {
        continue;
      }
      merged.set(uploadHistoryKey(normalized), normalized);
    }
  }
  return sortUploadHistory([...merged.values()]);
}

async function readLocalUploadHistory() {
  try {
    const raw = await readFile(LOCAL_UPLOAD_LOG_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as UploadHistoryEntry[];
    }

    return parsed
      .map((entry) => normalizeUploadHistoryEntry(entry))
      .filter((entry): entry is UploadHistoryEntry => Boolean(entry));
  } catch {
    return [] as UploadHistoryEntry[];
  }
}

async function inferUploadHistoryFromGuidanceFiles() {
  const inferredEntries: UploadHistoryEntry[] = [];

  try {
    const files = await readdir(LOCAL_GUIDANCE_DIR, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith(".json") || file.name === "upload-log.json") {
        continue;
      }

      try {
        const raw = await readFile(path.join(LOCAL_GUIDANCE_DIR, file.name), "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const rankValue = Array.isArray(parsed.ranks) && typeof parsed.ranks[0] === "string" ? parsed.ranks[0] : "";
        const rank = normalizeRank(rankValue);
        if (!rank) {
          continue;
        }

        const chunks = Array.isArray(parsed.chunks) ? parsed.chunks.length : 0;
        inferredEntries.push({
          rank,
          source:
            typeof parsed.source === "string" && parsed.source.trim()
              ? parsed.source.trim()
              : "Official Marking Guide",
          fileName: file.name,
          outputFile: file.name,
          chunkCount: chunks,
          uploadedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
          uploadedBy: typeof parsed.uploadedBy === "string" ? parsed.uploadedBy : "",
          replacedExisting: false,
        });
      } catch {
        // Ignore malformed guidance files.
      }
    }
  } catch {
    return [] as UploadHistoryEntry[];
  }

  return inferredEntries;
}

async function appendLocalUploadHistory(entries: UploadHistoryEntry[]) {
  if (!entries.length) {
    return;
  }

  try {
    await mkdir(LOCAL_GUIDANCE_DIR, { recursive: true });
    const existing = await readLocalUploadHistory();
    const merged = mergeUploadHistoryEntries(existing, entries).slice(0, 1000);
    await writeFile(LOCAL_UPLOAD_LOG_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  } catch {
    // Local file logging can fail in read-only deployments.
  }
}

async function removeLocalUploadHistoryByRank(rank: string) {
  try {
    const existing = await readLocalUploadHistory();
    const filtered = existing.filter((entry) => entry.rank !== rank);
    await mkdir(LOCAL_GUIDANCE_DIR, { recursive: true });
    await writeFile(LOCAL_UPLOAD_LOG_PATH, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");
  } catch {
    // Local file logging can fail in read-only deployments.
  }
}

async function removeLocalGuidanceFile(rank: string) {
  try {
    await unlink(path.join(LOCAL_GUIDANCE_DIR, rankFileName(rank)));
  } catch {
    // File may not exist or FS may be read-only.
  }
}

async function loadMergedUploadHistoryEntries() {
  let dbEntries: UploadHistoryEntry[] = [];
  try {
    await ensureSchema();
    const { rows } = await sql`
      SELECT rank, source, file_name, output_file, chunk_count, uploaded_at, uploaded_by, replaced_existing
      FROM guidance_upload_log
      ORDER BY uploaded_at DESC, id DESC
      LIMIT 500
    `;

    dbEntries = rows
      .map((row) =>
        normalizeUploadHistoryEntry({
          rank: typeof row.rank === "string" ? row.rank : "",
          source: typeof row.source === "string" ? row.source : "Official Marking Guide",
          fileName: typeof row.file_name === "string" ? row.file_name : "",
          outputFile: typeof row.output_file === "string" ? row.output_file : "",
          chunkCount: typeof row.chunk_count === "number" ? row.chunk_count : 0,
          uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : "",
          uploadedBy: typeof row.uploaded_by === "string" ? row.uploaded_by : "",
          replacedExisting: Boolean(row.replaced_existing),
        })
      )
      .filter((entry): entry is UploadHistoryEntry => Boolean(entry));
  } catch {
    dbEntries = [];
  }

  const localEntries = await readLocalUploadHistory();
  const inferredFileEntries = localEntries.length ? [] : await inferUploadHistoryFromGuidanceFiles();
  return mergeUploadHistoryEntries(dbEntries, localEntries, inferredFileEntries).slice(0, 100);
}

async function mirrorGuidanceToLocalFiles(params: {
  ranks: string[];
  source: string;
  chunks: Array<{ id: string; title: string; text: string; keywords: string[] }>;
  generatedAt: string;
  uploadedBy: string;
}) {
  const writtenFiles: string[] = [];

  try {
    await mkdir(LOCAL_GUIDANCE_DIR, { recursive: true });

    for (const rank of params.ranks) {
      const fileName = rankFileName(rank);
      const filePath = path.join(LOCAL_GUIDANCE_DIR, fileName);
      const payload = {
        source: params.source,
        ranks: [rank],
        generatedAt: params.generatedAt,
        uploadedBy: params.uploadedBy,
        chunks: params.chunks,
      };

      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      writtenFiles.push(path.posix.join("data/official-guidance", fileName));
    }
  } catch {
    // Writing to local files can fail in read-only deployments. DB persistence remains authoritative.
  }

  return writtenFiles;
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

async function parseUploadRequest(req: Request): Promise<ParsedUploadRequest | Response> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as {
      fileName?: string;
      fileBase64?: string;
      source?: string;
      ranks?: string[];
    } | null;

    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const fileBase64 = typeof body?.fileBase64 === "string" ? body.fileBase64.trim() : "";
    const source = typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "Official Marking Guide";
    const uniqueRanks = [...new Set(
      Array.isArray(body?.ranks)
        ? body.ranks.map((value) => normalizeRank(typeof value === "string" ? value : "")).filter(Boolean)
        : []
    )].sort();

    if (!fileName || !fileBase64) {
      return Response.json({ error: "A PDF file is required." }, { status: 400 });
    }

    const fileBuffer = Buffer.from(fileBase64, "base64");
    if (!fileBuffer.length) {
      return Response.json({ error: "Unable to read that PDF upload." }, { status: 400 });
    }

    if (fileBuffer.length > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `File too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
        { status: 413 }
      );
    }

    if (!uniqueRanks.length) {
      return Response.json({ error: "Select at least one rank (E3-E7)." }, { status: 400 });
    }

    return { fileName, fileBuffer, source, uniqueRanks };
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
  const uniqueRanks = [...new Set(
    ranksRaw
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeRank(value))
      .filter(Boolean)
  )].sort();

  if (!uniqueRanks.length) {
    return Response.json({ error: "Select at least one rank (E3-E7)." }, { status: 400 });
  }

  return {
    fileName: file.name,
    fileBuffer: Buffer.from(await file.arrayBuffer()),
    source,
    uniqueRanks,
  };
}

export async function GET() {
  try {
    const { response } = await requireGuidanceAdmin();
    if (response) {
      return response;
    }

    const entries = await loadMergedUploadHistoryEntries();

    return Response.json({ entries }, { status: 200 });
  } catch {
    return Response.json({ error: "Unable to load guidance upload history right now." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { user, response } = await requireGuidanceAdmin();
    if (response || !user) {
      return response ?? Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "delete-official-guidance-per-hour",
        maxRequests: 30,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Rate limit reached for guidance deletions.",
      },
    ]);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = (await req.json().catch(() => null)) as { rank?: string } | null;
    const normalizedRank = normalizeRank(typeof body?.rank === "string" ? body.rank : "");
    if (!normalizedRank) {
      return Response.json({ error: "A valid rank is required (E3-E7)." }, { status: 400 });
    }

    await ensureSchema();
    await sql`DELETE FROM guidance_datasets WHERE ranks_key = ${normalizedRank}`;
    await sql`DELETE FROM guidance_upload_log WHERE rank = ${normalizedRank}`;

    await Promise.all([
      removeLocalGuidanceFile(normalizedRank),
      removeLocalUploadHistoryByRank(normalizedRank),
    ]);

    clearOfficialGuidanceCache();

    const entries = await loadMergedUploadHistoryEntries();

    return Response.json(
      {
        ok: true,
        message: `Deleted official guidance for ${normalizedRank}.`,
        entries,
      },
      { status: 200 }
    );
  } catch {
    return Response.json({ error: "Unable to delete guidance right now." }, { status: 500 });
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

    const parsedUpload = await parseUploadRequest(req);
    if (parsedUpload instanceof Response) {
      return parsedUpload;
    }

    const { fileName, fileBuffer, source, uniqueRanks } = parsedUpload;

    const normalized = normalizeText(await extractTextFromPdfBuffer(fileBuffer));

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
      const outputFile = rankFileName(rank);

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
          ${fileName},
          ${outputFile},
          ${chunks.length},
          ${generatedAt},
          ${user.username},
          ${replacedRanks.has(rank)}
        )
      `;
    }

    const uploadHistoryEntries: UploadHistoryEntry[] = uniqueRanks.map((rank) => ({
      rank,
      source,
      fileName,
      outputFile: rankFileName(rank),
      chunkCount: chunks.length,
      uploadedAt: generatedAt,
      uploadedBy: user.username,
      replacedExisting: replacedRanks.has(rank),
    }));

    clearOfficialGuidanceCache();

    await appendLocalUploadHistory(uploadHistoryEntries);

    const replacementMessage = replacedRanks.size
      ? ` Replaced existing guidance for ${[...replacedRanks].sort().join(", ")}.`
      : "";

    return Response.json(
      {
        ok: true,
        message: categoryChunks.length
          ? `Indexed ${categoryChunks.length} categories for ${uniqueRanks.join(", ")}.${replacementMessage}`
          : `Uploaded and indexed ${chunks.length} sections for ${uniqueRanks.join(", ")}.${replacementMessage}`,
        outputFile: uniqueRanks.length === 1 ? rankFileName(uniqueRanks[0]) : `${sanitizeFileNameSegment(uniqueRanks.join("-"))}.json`,
        chunks: chunks.length,
        localFiles: await mirrorGuidanceToLocalFiles({
          ranks: uniqueRanks,
          source,
          chunks,
          generatedAt,
          uploadedBy: user.username,
        }),
        uploadHistory: uploadHistoryEntries,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload and index guidance right now.";
    return Response.json({ error: message }, { status: 500 });
  }
}
