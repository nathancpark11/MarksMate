type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

function renderPdfItems(items: PdfTextItem[]) {
  let text = "";

  for (const item of items) {
    if (typeof item.str === "string" && item.str.length > 0) {
      text += item.str;
      if (!item.hasEOL) {
        text += " ";
      }
    }

    if (item.hasEOL) {
      text += "\n";
    }
  }

  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractWithPdfJs(fileBuffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fileBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });

  const pdfDocument = await loadingTask.promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);

      try {
        const textContent = await page.getTextContent();
        const pageText = renderPdfItems(textContent.items as PdfTextItem[]);
        if (pageText) {
          pages.push(pageText);
        }
      } finally {
        page.cleanup();
      }
    }

    return pages.join("\n\n").trim();
  } finally {
    await loadingTask.destroy().catch(() => undefined);
    await pdfDocument.destroy().catch(() => undefined);
  }
}

async function extractWithPdfParse(fileBuffer: Buffer) {
  const pdfParseModule = await import("pdf-parse");
  const PDFParseClass = pdfParseModule.PDFParse;

  if (typeof PDFParseClass !== "function") {
    throw new Error("pdf-parse loader unavailable");
  }

  const parser = new PDFParseClass({ data: fileBuffer });

  try {
    const parsed = await parser.getText();
    return typeof parsed.text === "string" ? parsed.text.trim() : "";
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function extractTextFromPdfBuffer(fileBuffer: Buffer) {
  try {
    return await extractWithPdfJs(fileBuffer);
  } catch (pdfJsError) {
    try {
      return await extractWithPdfParse(fileBuffer);
    } catch (pdfParseError) {
      throw new Error(
        `PDF extraction failed. pdfjs-dist: ${getErrorMessage(pdfJsError)}. pdf-parse: ${getErrorMessage(pdfParseError)}.`
      );
    }
  }
}