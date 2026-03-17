import { getUtf8ByteLength } from "@/lib/generationValidation";

export const DEFAULT_AI_REQUEST_MAX_BYTES = 30 * 1024;

type ParseLimitedJsonSuccess<T> = {
  ok: true;
  data: T;
  bodyBytes: number;
};

type ParseLimitedJsonFailure = {
  ok: false;
  bodyBytes: number;
  response: Response;
};

export type ParseLimitedJsonResult<T> = ParseLimitedJsonSuccess<T> | ParseLimitedJsonFailure;

export async function parseLimitedJsonBody<T>(
  req: Request,
  maxBytes = DEFAULT_AI_REQUEST_MAX_BYTES
): Promise<ParseLimitedJsonResult<T>> {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const parsedContentLength = Number(contentLengthHeader);
    if (Number.isFinite(parsedContentLength) && parsedContentLength > maxBytes) {
      return {
        ok: false,
        bodyBytes: parsedContentLength,
        response: Response.json(
          { error: `Request body exceeds ${maxBytes} bytes. Please shorten your input.` },
          { status: 413 }
        ),
      };
    }
  }

  const rawBody = await req.text();
  const bodyBytes = getUtf8ByteLength(rawBody);

  if (bodyBytes > maxBytes) {
    return {
      ok: false,
      bodyBytes,
      response: Response.json(
        { error: `Request body exceeds ${maxBytes} bytes. Please shorten your input.` },
        { status: 413 }
      ),
    };
  }

  try {
    const parsed = JSON.parse(rawBody) as T;
    return {
      ok: true,
      data: parsed,
      bodyBytes,
    };
  } catch {
    return {
      ok: false,
      bodyBytes,
      response: Response.json({ error: "Invalid JSON request body." }, { status: 400 }),
    };
  }
}