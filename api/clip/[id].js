import {
  createRateLimiter,
  getId,
  isIsoDateString,
  isJsonRequest,
  isPlainObject,
  json,
  kvCommand,
  readBody
} from "../_shared.js";

const maxBodyBytes = 1024 * 1024;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const memoryStore = new Map();
const rateLimit = createRateLimiter((req) => (req.method === "GET" ? 120 : 40));

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
  if (!isIsoDateString(record.updatedAt)) return false;
  if (record.lastSavedAt !== undefined && !isIsoDateString(record.lastSavedAt)) return false;
  if (!isValidContentVersion(record.contentVersion)) return false;
  if (!isValidSettings(record.settings)) return false;
  if (!isEncryptedPayload(record.encryptedPayload)) return false;
  const hasSync = Boolean(record.sync);
  const hasProtection = Boolean(record.protection);
  if (hasSync === hasProtection) return false;
  if (hasSync) {
    return isPlainObject(record.sync) && record.sync.mode === "link" && isBase64(record.sync.salt);
  }
  if (hasProtection) {
    return isPlainObject(record.protection) && isBase64(record.protection.salt) && isEncryptedPayload(record.protection.verifier);
  }
  return false;
}

function isValidContentVersion(version) {
  if (version === undefined) return true;
  const parsed = Number(version);
  return Number.isFinite(parsed) && parsed > 0 && Math.floor(parsed) === parsed;
}

function isValidSettings(settings) {
  if (settings === undefined) return true;
  if (!isPlainObject(settings)) return false;
  return Object.entries(settings).every(([key, value]) => (
    key === "autosaveEnabled" && typeof value === "boolean"
  ));
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
    try {
      const record = await getClip(id);
      return record ? json(res, 200, record) : json(res, 404, { error: "Clipboard not found." });
    } catch (error) {
      return json(res, error.statusCode || 503, { error: error.publicMessage || "Storage temporarily unavailable." });
    }
  }

  if (req.method === "PUT") {
    try {
      if (!isJsonRequest(req)) {
        return json(res, 415, { error: "Content-Type must be application/json." });
      }
      const body = await readBody(req, maxBodyBytes);
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
