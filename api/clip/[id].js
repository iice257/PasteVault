import {
  createRateLimiter,
  getId,
  isJsonRequest,
  json,
  readBody
} from "../_shared.js";
import {
  canWrite,
  getClip,
  isValidRecord,
  maxBodyBytes,
  recordContentVersion,
  setClip,
  writeTokenFrom
} from "../_clipstore.js";

const rateLimit = createRateLimiter((req) => (req.method === "GET" ? 120 : 40));

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
      if (!record) return json(res, 404, { error: "Clipboard not found." });
      const knownVersion = Number(req.headers["x-pastevault-known-version"]);
      if (Number.isFinite(knownVersion) && knownVersion > 0 && recordContentVersion(record) <= knownVersion) {
        res.statusCode = 304;
        res.setHeader("Cache-Control", "no-store");
        return res.end();
      }
      return json(res, 200, record);
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
      if (!canWrite(current, writeTokenFrom(req))) {
        return json(res, 403, { error: "This clipboard is view-only.", reason: "read_only" });
      }
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
