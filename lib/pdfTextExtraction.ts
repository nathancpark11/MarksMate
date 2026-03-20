type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

let runtimePolyfillsReady: Promise<void> | null = null;

class MinimalDOMPoint {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1
  ) {}
}

class MinimalDOMRect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0
  ) {}
}

class MinimalImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth;
      this.height = width ?? 0;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }

    this.data = dataOrWidth;
    this.width = width ?? 0;
    this.height = height ?? 0;
  }
}

class MinimalPath2D {
  addPath() {}
  rect() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
}

class MinimalDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  m11 = 1;
  m12 = 0;
  m13 = 0;
  m14 = 0;
  m21 = 0;
  m22 = 1;
  m23 = 0;
  m24 = 0;
  m31 = 0;
  m32 = 0;
  m33 = 1;
  m34 = 0;
  m41 = 0;
  m42 = 0;
  m43 = 0;
  m44 = 1;
  is2D = true;

  constructor(init?: number[] | Float32Array | Float64Array | string) {
    if (Array.isArray(init) || init instanceof Float32Array || init instanceof Float64Array) {
      const values = Array.from(init);
      if (values.length >= 6) {
        this.a = this.m11 = values[0] ?? 1;
        this.b = this.m12 = values[1] ?? 0;
        this.c = this.m21 = values[2] ?? 0;
        this.d = this.m22 = values[3] ?? 1;
        this.e = this.m41 = values[4] ?? 0;
        this.f = this.m42 = values[5] ?? 0;
      }
    }
  }

  multiplySelf(other?: MinimalDOMMatrix) {
    if (!other) {
      return this;
    }

    const nextA = this.a * other.a + this.c * other.b;
    const nextB = this.b * other.a + this.d * other.b;
    const nextC = this.a * other.c + this.c * other.d;
    const nextD = this.b * other.c + this.d * other.d;
    const nextE = this.a * other.e + this.c * other.f + this.e;
    const nextF = this.b * other.e + this.d * other.f + this.f;

    this.a = this.m11 = nextA;
    this.b = this.m12 = nextB;
    this.c = this.m21 = nextC;
    this.d = this.m22 = nextD;
    this.e = this.m41 = nextE;
    this.f = this.m42 = nextF;
    return this;
  }

  preMultiplySelf(other?: MinimalDOMMatrix) {
    if (!other) {
      return this;
    }

    const current = new MinimalDOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
    this.a = this.m11 = other.a;
    this.b = this.m12 = other.b;
    this.c = this.m21 = other.c;
    this.d = this.m22 = other.d;
    this.e = this.m41 = other.e;
    this.f = this.m42 = other.f;
    return this.multiplySelf(current);
  }

  translateSelf(tx = 0, ty = 0) {
    this.e = this.m41 += tx;
    this.f = this.m42 += ty;
    return this;
  }

  translate(tx = 0, ty = 0) {
    return new MinimalDOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).translateSelf(tx, ty);
  }

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    this.a = this.m11 *= scaleX;
    this.b = this.m12 *= scaleX;
    this.c = this.m21 *= scaleY;
    this.d = this.m22 *= scaleY;
    return this;
  }

  scale(scaleX = 1, scaleY = scaleX) {
    return new MinimalDOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).scaleSelf(scaleX, scaleY);
  }

  invertSelf() {
    const determinant = this.a * this.d - this.b * this.c;
    if (!determinant) {
      this.a = this.d = this.m11 = this.m22 = NaN;
      this.b = this.c = this.e = this.f = this.m12 = this.m21 = this.m41 = this.m42 = NaN;
      return this;
    }

    const nextA = this.d / determinant;
    const nextB = -this.b / determinant;
    const nextC = -this.c / determinant;
    const nextD = this.a / determinant;
    const nextE = (this.c * this.f - this.d * this.e) / determinant;
    const nextF = (this.b * this.e - this.a * this.f) / determinant;

    this.a = this.m11 = nextA;
    this.b = this.m12 = nextB;
    this.c = this.m21 = nextC;
    this.d = this.m22 = nextD;
    this.e = this.m41 = nextE;
    this.f = this.m42 = nextF;
    return this;
  }
}

async function ensurePdfRuntimePolyfills() {
  if (!runtimePolyfillsReady) {
    runtimePolyfillsReady = (async () => {
      if (typeof globalThis.DOMMatrix === "undefined") {
        globalThis.DOMMatrix = MinimalDOMMatrix as typeof globalThis.DOMMatrix;
      }

      if (typeof globalThis.DOMPoint === "undefined") {
        globalThis.DOMPoint = MinimalDOMPoint as typeof globalThis.DOMPoint;
      }

      if (typeof globalThis.DOMRect === "undefined") {
        globalThis.DOMRect = MinimalDOMRect as typeof globalThis.DOMRect;
      }

      if (typeof globalThis.ImageData === "undefined") {
        globalThis.ImageData = MinimalImageData as typeof globalThis.ImageData;
      }

      if (typeof globalThis.Path2D === "undefined") {
        globalThis.Path2D = MinimalPath2D as typeof globalThis.Path2D;
      }

      if (!globalThis.navigator?.language) {
        globalThis.navigator = {
          language: "en-US",
          platform: "",
          userAgent: "",
        } as Navigator;
      }
    })();
  }

  await runtimePolyfillsReady;
}

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
  await ensurePdfRuntimePolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    pdfjs.GlobalWorkerOptions.workerPort = null;
  }

  const documentInit = {
    data: new Uint8Array(fileBuffer),
    disableWorker: true,
    worker: null,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  } as unknown;
  const loadingTask = pdfjs.getDocument(documentInit as Parameters<typeof pdfjs.getDocument>[0]);

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
  await ensurePdfRuntimePolyfills();
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
    return await extractWithPdfParse(fileBuffer);
  } catch (pdfParseError) {
    try {
      return await extractWithPdfJs(fileBuffer);
    } catch (pdfJsError) {
      throw new Error(
        `PDF extraction failed. pdf-parse: ${getErrorMessage(pdfParseError)}. pdfjs-dist: ${getErrorMessage(pdfJsError)}.`
      );
    }
  }
}