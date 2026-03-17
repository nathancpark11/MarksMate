type RateLimitRule = {
  key: string;
  maxRequests: number;
  windowMs: number;
  errorMessage: string;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateLimitStore = Map<string, number[]>;

declare global {
  // eslint-disable-next-line no-var
  var __ipRateLimitStore: RateLimitStore | undefined;
}

const globalStore: RateLimitStore = globalThis.__ipRateLimitStore ?? new Map();
if (!globalThis.__ipRateLimitStore) {
  globalThis.__ipRateLimitStore = globalStore;
}

function getClientIp(req: Request) {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) {
    return cfIp;
  }

  return "unknown-ip";
}

function checkRule(req: Request, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const windowStart = now - rule.windowMs;
  const ip = getClientIp(req);
  const storeKey = `${rule.key}:${ip}`;

  const timestamps = globalStore.get(storeKey) ?? [];
  const recentTimestamps = timestamps.filter((value) => value > windowStart);

  if (recentTimestamps.length >= rule.maxRequests) {
    const oldestTimestamp = recentTimestamps[0] ?? now;
    const retryAfterMs = Math.max(0, oldestTimestamp + rule.windowMs - now);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    globalStore.set(storeKey, recentTimestamps);

    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  recentTimestamps.push(now);
  globalStore.set(storeKey, recentTimestamps);

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

export function enforceRateLimits(req: Request, rules: RateLimitRule[]) {
  for (const rule of rules) {
    const result = checkRule(req, rule);
    if (!result.allowed) {
      return Response.json(
        {
          error: `${rule.errorMessage} Try again in ${result.retryAfterSeconds}s.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
          },
        }
      );
    }
  }

  return null;
}
