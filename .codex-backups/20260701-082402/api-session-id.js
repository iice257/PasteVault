import {
  createRateLimiter,
  getId,
  isIsoDateString,
  isJsonRequest,
  isPlainObject,
  isShortText,
  isShortToken,
  json,
  kvCommand,
  readBody
} from "../_shared.js";

const maxBodyBytes = 16 * 1024;
const sessionTtlMs = 12 * 60 * 60 * 1000;
const memoryStore = new Map();
const rateLimit = createRateLimiter((req) => (req.method === "GET" ? 120 : 80));

function canUseMemoryStore() {
  return process.env.VERCEL !== "1";
}

function storageKey(id) {
  return `pastevault:session:${id}`;
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
  if (!canUseMemoryStore()) {
    throw Object.assign(new Error("Durable session storage is not configured."), { statusCode: 503 });
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
    if (!canUseMemoryStore()) {
      throw Object.assign(new Error("Durable session storage is not configured."), { statusCode: 503 });
    }
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
  if (state.editorSettings !== undefined && !isValidEditorSettings(state.editorSettings)) return false;
  if (!isIsoDateString(state.updatedAt)) return false;
  return JSON.stringify(state).length <= maxBodyBytes;
}

function isValidEditorSettings(settings) {
  if (!isPlainObject(settings)) return false;
  return Object.entries(settings).every(([key, value]) => {
    if (key === "format") return isShortText(value, 40);
    if (key === "sidebarCollapsed") return typeof value === "boolean";
    if (key === "autosaveEnabled") return typeof value === "boolean";
    return false;
  });
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
      const body = await readBody(req, maxBodyBytes);
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
