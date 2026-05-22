const maxBodyBytes = 1024 * 1024;
const idPattern = /^[a-zA-Z0-9_-]{3,80}$/;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
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

function storageKey(id) {
  return `pastevault:clip:${id}`;
}

function recordContentVersion(record) {
  const version = Number(record?.contentVersion ?? record?.payload?.version ?? 1);
  return Number.isFinite(version) && version > 0 ? Math.floor(version) : 1;
}

function getBaseVersion(req, body) {
  const headerVersion = Number(req.headers["x-pastevault-base-version"]);
  if (Number.isFinite(headerVersion) && headerVersion >= 0) return Math.floor(headerVersion);
  const bodyVersion = Number(body?.baseVersion);
  if (Number.isFinite(bodyVersion) && bodyVersion >= 0) return Math.floor(bodyVersion);
  return null;
}

function isForcedSave(req, body) {
  return req.headers["x-pastevault-force"] === "true" || body?.force === true;
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
    if (!result.result) return null;
    try {
      const parsed = JSON.parse(result.result);
      return isValidRecord(parsed, id) ? parsed : null;
    } catch {
      return null;
    }
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
  if (typeof record.updatedAt !== "string" || Number.isNaN(new Date(record.updatedAt).getTime())) return false;
  if (!isEncryptedPayload(record.encryptedPayload)) return false;
  if (record.sync) {
    return record.sync.mode === "link" && isBase64(record.sync.salt);
  }
  if (record.protection) {
    return isBase64(record.protection.salt) && isEncryptedPayload(record.protection.verifier);
  }
  return false;
}

function isEncryptedPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    isBase64(payload.iv) &&
    isBase64(payload.data) &&
    payload.iv.length <= 32 &&
    payload.data.length <= maxBodyBytes * 2
  );
}

function isBase64(value) {
  return typeof value === "string" && value.length > 0 && value.length <= maxBodyBytes * 2 && base64Pattern.test(value);
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
      if (!body.trim()) {
        return json(res, 400, { error: "Request body is required." });
      }
      const record = JSON.parse(body);
      if (!isValidRecord(record, id)) {
        return json(res, 400, { error: "Invalid encrypted clipboard payload." });
      }
      const current = await getClip(id);
      const baseVersion = getBaseVersion(req, record);
      if (current && !isForcedSave(req, record)) {
        if (baseVersion === null) {
          return json(res, 409, {
            error: "Content version required.",
            currentVersion: recordContentVersion(current)
          });
        }
        const currentVersion = recordContentVersion(current);
        if (currentVersion > baseVersion) {
          return json(res, 409, {
            error: "Clipboard changed since this edit began.",
            currentVersion,
            baseVersion
          });
        }
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
