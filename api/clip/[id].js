const maxBodyBytes = 1024 * 1024;
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
  const key = `${getClientKey(req)}:${getId(req)}`;
  const now = Date.now();
  const windowMs = 60_000;
  const limit = req.method === "GET" ? 120 : 40;
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

function storageKey(id) {
  return `pastevault:clip:${id}`;
}

async function kvCommand(command) {
  const config = kvConfig();
  if (!config) return null;
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) {
    throw new Error(`KV command failed with ${response.status}`);
  }
  return response.json();
}

async function getClip(id) {
  const key = storageKey(id);
  const result = await kvCommand(["GET", key]);
  if (result) {
    return result.result ? JSON.parse(result.result) : null;
  }
  return memoryStore.get(key) ?? null;
}

async function setClip(id, value) {
  const key = storageKey(id);
  const serialized = JSON.stringify(value);
  const result = await kvCommand(["SET", key, serialized]);
  if (!result) {
    memoryStore.set(key, value);
  }
}

function isValidRecord(record, id) {
  if (!record || typeof record !== "object") return false;
  if (record.id !== id || record.version !== 2) return false;
  if (record.encryptedPayload && typeof record.encryptedPayload.data === "string" && typeof record.encryptedPayload.iv === "string") {
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  const id = getId(req);
  if (!id) {
    return json(res, 400, { error: "Invalid clipboard id." });
  }

  const limit = rateLimit(req);
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(limit.resetAt / 1000)));
  if (limit.limited) {
    return json(res, 429, { error: "Too many requests." }, { "Retry-After": "60" });
  }

  if (req.method === "GET") {
    const record = await getClip(id);
    return record ? json(res, 200, record) : json(res, 404, { error: "Clipboard not found." });
  }

  if (req.method === "PUT") {
    try {
      const body = await readBody(req);
      const record = JSON.parse(body);
      if (!isValidRecord(record, id)) {
        return json(res, 400, { error: "Invalid encrypted clipboard payload." });
      }
      await setClip(id, { ...record, updatedAt: new Date().toISOString() });
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, error.statusCode || 400, { error: error.statusCode === 413 ? "Payload too large." : "Invalid request body." });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return json(res, 405, { error: "Method not allowed." });
}
