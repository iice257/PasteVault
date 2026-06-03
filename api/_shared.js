export const idPattern = /^[a-zA-Z0-9_-]{3,80}$/;
export const storageTimeoutMs = 4500;

export function json(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  })) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
}

export function getId(req) {
  const raw = req.query?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && idPattern.test(id) ? id : "";
}

export function getClientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim()
    .slice(0, 80);
  return forwarded || req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter(getLimit) {
  const rateBuckets = new Map();
  return function rateLimit(req) {
    const key = `${getClientKey(req)}:${getId(req)}:${req.method}`;
    const now = Date.now();
    const windowMs = 60_000;
    const limit = getLimit(req);
    if (rateBuckets.size > 1000) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
      }
    }
    const bucket = rateBuckets.get(key) ?? { count: 0, resetAt: now + windowMs };
    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    return {
      limited: bucket.count > limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt
    };
  };
}

export function readBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function kvConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function isJsonRequest(req) {
  return String(req.headers["content-type"] ?? "").toLowerCase().includes("application/json");
}

export function storageError(message = "Storage temporarily unavailable.") {
  return Object.assign(new Error(message), {
    statusCode: 503,
    publicMessage: "Storage temporarily unavailable."
  });
}

export async function kvCommand(command) {
  const config = kvConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), storageTimeoutMs);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command),
      signal: controller.signal
    });
    if (!response.ok) {
      throw storageError();
    }
    return response.json();
  } catch (error) {
    if (error.statusCode) throw error;
    throw storageError(error.name === "AbortError" ? "Storage request timed out." : undefined);
  } finally {
    clearTimeout(timeout);
  }
}

export function isIsoDateString(value) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

export function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isShortText(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function isShortToken(value) {
  return typeof value === "string" && idPattern.test(value);
}
