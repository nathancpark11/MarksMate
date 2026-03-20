import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireSessionUser } from "@/lib/auth";
import { enforceRateLimits } from "@/lib/rateLimit";
import { ensureSchema, sql } from "@/lib/db";

export const runtime = "nodejs";

function normalizeRank(value: string) {
  const match = value.trim().toUpperCase().replace(/\s+/g, "").match(/E-?(\d+)/);
  return match ? `E${match[1]}` : "";
}

function rankPdfFileName(rank: string) {
  return `${rank.toLowerCase()}.pdf`;
}

async function readPdfFromLocalFiles(rank: string) {
  const rankedPath = path.join(process.cwd(), "data", "official-guidance", rankPdfFileName(rank));
  const legacyPath = path.join(process.cwd(), "data", "official-marking-guide.pdf");

  try {
    return {
      fileName: rankPdfFileName(rank),
      contentType: "application/pdf",
      pdfBuffer: await readFile(rankedPath),
    };
  } catch {
    // Continue to fallback.
  }

  try {
    return {
      fileName: "official-marking-guide.pdf",
      contentType: "application/pdf",
      pdfBuffer: await readFile(legacyPath),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { response } = await requireSessionUser();
    if (response) {
      return response;
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "view-official-guidance-pdf-per-minute",
        maxRequests: 60,
        windowMs: 60 * 1000,
        errorMessage: "Rate limit reached for opening guidance PDFs.",
      },
    ]);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(req.url);
    const rank = normalizeRank(searchParams.get("rank") ?? "");
    if (!rank) {
      return Response.json({ error: "A valid rank is required (E3-E7)." }, { status: 400 });
    }

    await ensureSchema();
    const { rows } = await sql`
      SELECT file_name, content_type, pdf_base64
      FROM guidance_pdf_files
      WHERE rank_key = ${rank}
      LIMIT 1
    `;

    const row = rows[0];
    if (row && typeof row.pdf_base64 === "string" && row.pdf_base64.length > 0) {
      const fileName =
        typeof row.file_name === "string" && row.file_name.trim()
          ? row.file_name.trim()
          : `${rank.toLowerCase()}-guidance.pdf`;
      const contentType =
        typeof row.content_type === "string" && row.content_type.trim()
          ? row.content_type.trim()
          : "application/pdf";
      const pdfBuffer = Buffer.from(row.pdf_base64, "base64");

      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${fileName.replace(/\"/g, "")}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const localFile = await readPdfFromLocalFiles(rank);
    if (localFile) {
      return new Response(localFile.pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": localFile.contentType,
          "Content-Disposition": `inline; filename="${localFile.fileName.replace(/\"/g, "")}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    return Response.json(
      {
        error: `No guidance PDF is available for ${rank}. Upload one in Settings > Official Marking PDF Guidance first.`,
      },
      { status: 404 }
    );
  } catch {
    return Response.json({ error: "Unable to open guidance PDF right now." }, { status: 500 });
  }
}
