import mammoth from "mammoth";
import { requireSessionUser } from "@/lib/auth";
import { extractCandidateEntriesFromText } from "@/lib/logImport";
import { extractTextFromPdfBuffer } from "@/lib/pdfTextExtraction";

const SUPPORTED_EXTENSIONS = new Set([".docx", ".pdf"]);

function getExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return "";
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

export async function POST(req: Request) {
  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }

    const formData = await req.formData();
    const maybeFile = formData.get("file");

    if (!(maybeFile instanceof File)) {
      return Response.json({ error: "Missing upload file." }, { status: 400 });
    }

    const extension = getExtension(maybeFile.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return Response.json(
        { error: "Only .docx and .pdf files are supported." },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await maybeFile.arrayBuffer());

    let extractedText = "";
    if (extension === ".docx") {
      const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = docxResult.value || "";
    } else {
      extractedText = await extractTextFromPdfBuffer(fileBuffer);
    }

    const entries = extractCandidateEntriesFromText(extractedText);

    return Response.json({
      entries,
      total: entries.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to process file.";
    return Response.json({ error: message }, { status: 500 });
  }
}
