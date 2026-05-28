const maxBodyBytes = 16 * 1024;
const sessionTtlMs = 12 * 60 * 60 * 1000;
const storageTimeoutMs = 4500;
const idPattern = /^[a-zA-Z0-9_-]{3,80}$/;
const memoryStore = new Map();
const rateBuckets = new Map();

function json(res, status, body, headers = {}) {
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

function getId(req) {
  const raw = req.query?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && idPattern.test(id) ? id : "";
}

function getClientKey(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

function rateLimit(req) {
  const key = `${getClientKey(req)}:${getId(req)}:${req.method}`;
  const now = Date.now();
  const windowMs = 60_000;
  const limit = req.method === "GET" ? 120 : 80;
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
}

function readBody(req) {
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

function kvConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function isJsonRequest(req) {
  return String(req.headers["content-type"] ?? "").toLowerCase().includes("application/json");
}

function storageError(message = "Storage temporarily unavailable.") {
  return Object.assign(new Error(message), {
    statusCode: 503,
    publicMessage: "Storage temporarily unavailable."
  });
}

function storageKey(id) {
  return `pastevault:session:${id}`;
}

async function kvCommand(command) {
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

async function getSession(id) {
  const key = storageKey(id);
  const result = await kvCommand(["GET", key]);
  if (result) {
    if (!result.result) return null;
    try {
      const parsed = JSON.parse(result.result);
      return isValidSession(parsed, id) ? parsed : null;
    } catch {
      return null;
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

async function setSession(id, value) {
  const key = storageKey(id);
  const serialized = JSON.stringify(value);
  const result = await kvCommand(["SET", key, serialized, "EX", 60 * 60 * 12]);
  if (!result) {
    memoryStore.set(key, { value, expiresAt: Date.now() + sessionTtlMs });
  }
}

function isValidSession(state, id) {
  if (!state || typeof state !== "object") return false;
  if (state.vaultId !== id) return false;
  if (!isShortToken(state.sessionId) || !isShortToken(state.deviceId)) return false;
  if (state.theme !== undefined && state.theme !== "light" && state.theme !== "dark") return false;
  if (state.viewMode !== undefined && !isShortText(state.viewMode, 40)) return false;
  if (state.selectedTab !== undefined && !isShortText(state.selectedTab, 40)) return false;
  if (state.isLocked !== undefined && typeof state.isLocked !== "boolean") return false;
  if (state.editorSettings !== undefined && !isPlainObject(state.editorSettings)) return false;
  if (typeof state.updatedAt !== "string" || Number.isNaN(new Date(state.updatedAt).getTime())) return false;
  return JSON.stringify(state).length <= maxBodyBytes;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => (
    entry === null ||
    typeof entry === "string" ||
    typeof entry === "number" ||
    typeof entry === "boolean" ||
    (entry && typeof entry === "object" && !Array.isArray(entry) && JSON.stringify(entry).length <= 4096)
  ));
}

function isShortText(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isShortToken(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{3,80}$/.test(value);
}

export default async function handler(req, res) {
  const id = getId(req);
  if (!id) {
    return json(res, 400, { error: "Invalid vault id." });
  }

  const limit = rateLimit(req);
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(limit.resetAt / 1000)));
  if (limit.limited) {
    return json(res, 429, { error: "Too many requests." }, { "Retry-After": "60" });
  }

  if (req.method === "GET") {
    try {
      const state = await getSession(id);
      return state ? json(res, 200, state) : json(res, 404, { error: "Vault session not found." });
    } catch (error) {
      return json(res, error.statusCode || 503, { error: error.publicMessage || "Storage temporarily unavailable." });
    }
  }

  if (req.method === "PUT") {
    try {
      if (!isJsonRequest(req)) {
        return json(res, 415, { error: "Content-Type must be application/json." });
      }
      const body = await readBody(req);
      if (!body.trim()) {
        return json(res, 400, { error: "Request body is required." });
      }
      const state = JSON.parse(body);
      if (!isValidSession(state, id)) {
        return json(res, 400, { error: "Invalid vault session state." });
      }
      await setSession(id, { ...state, updatedAt: new Date().toISOString() });
      return json(res, 200, { ok: true });
    } catch (error) {
      const message = error.statusCode === 413
        ? "Payload too large."
        : error.statusCode === 503
          ? "Storage temporarily unavailable."
          : "Invalid request body.";
      return json(res, error.statusCode || 400, { error: message });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return json(res, 405, { error: "Method not allowed." });
}
