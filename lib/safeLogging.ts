type ErrorWithMetadata = {
  name?: unknown;
  status?: unknown;
  code?: unknown;
  type?: unknown;
};

type RequestMetadata = {
  requestId: string;
  routeName: string;
  inputLength: number;
  success: boolean;
  status: number;
};

type SecurityTelemetryPayload = Record<string, string | number | boolean | null | undefined>;

function isPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function getSafeErrorDetails(error: unknown) {
  const details: Record<string, string | number | boolean> = {};

  if (error instanceof Error) {
    details.errorName = error.name || "Error";
    if (error.message) {
      details.errorMessage = error.message.slice(0, 300);
    }
  } else {
    details.errorName = "NonErrorThrown";
    details.errorType = typeof error;
  }

  const metadata = error as ErrorWithMetadata;
  if (isPrimitive(metadata?.status)) {
    details.status = metadata.status;
  }

  if (isPrimitive(metadata?.code)) {
    details.code = metadata.code;
  }

  if (isPrimitive(metadata?.type)) {
    details.type = metadata.type;
  }

  return details;
}

export function logApiError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const payload = {
    ...(extra ?? {}),
    error: getSafeErrorDetails(error),
  };

  console.error(context, payload);
}

export function getRequestId(req: Request) {
  return req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

export function logApiRequestMetadata(metadata: RequestMetadata) {
  console.info("api-request", metadata);
}

export function logSecurityEvent(event: string, payload?: SecurityTelemetryPayload) {
  console.info("security-event", {
    event,
    ...(payload ?? {}),
  });
}