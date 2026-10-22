import { createHash, timingSafeEqual } from "node:crypto";
import { isIsoDateString, isPlainObject, kvCommand } from "./_shared.js";

export const maxBodyBytes = 1024 * 1024;
export const expireAfterOptions = ["never", "1h", "1d", "7d"];
export const maxExpiryMs = 31 * 24 * 60 * 60 * 1000;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]{43}$/;
const memoryStore = new Map();

function canUseMemoryStore() {
  return process.env.VERCEL !== "1";
}

function storageKey(id) {
  return `pastevault:clip:${id}`;
}

export function recordContentVersion(record) {
  const version = Number(record?.contentVersion ?? record?.payload?.version ?? 1);
  return Number.isFinite(version) && version > 0 ? Math.floor(version) : 1;
}

export async function getClip(id) {
  const key = storageKey(id);
  const result = await kvCommand(["GET", key]);
  if (result) {
    if (!result.result) return null;
    try {
      const parsed = JSON.parse(result.result);
      return isValidRecord(parsed, id) && !isExpired(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!canUseMemoryStore()) {
    throw Object.assign(new Error("Durable clipboard storage is not configured."), { statusCode: 503 });
  }
  const record = memoryStore.get(key) ?? null;
  if (record && isExpired(record)) {
    memoryStore.delete(key);
    return null;
  }
  return record;
}

export async function setClip(id, value) {
  const key = storageKey(id);
  const serialized = JSON.stringify(value);
  // A clipboard with an expiry is removed by the store itself, so nothing has to sweep text.
  const command = value.expiresAt
    ? ["SET", key, serialized, "PXAT", new Date(value.expiresAt).getTime()]
    : ["SET", key, serialized];
  const result = await kvCommand(command);
  if (!result) {
    if (!canUseMemoryStore()) {
      throw Object.assign(new Error("Durable clipboard storage is not configured."), { statusCode: 503 });
    }
    memoryStore.set(key, value);
  }
}

export function isExpired(record) {
  return Boolean(record?.expiresAt) && new Date(record.expiresAt).getTime() <= Date.now();
}

export function hashWriteToken(token) {
  return createHash("sha256").update(String(token)).digest("base64url");
}

// A clipboard with a writeLock only accepts changes from callers that present the matching token.
export function canWrite(record, token) {
  const hash = record?.writeLock?.hash;
  if (!hash) return true;
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return false;
  const given = Buffer.from(hashWriteToken(token));
  const wanted = Buffer.from(hash);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function writeTokenFrom(req) {
  const raw = req.headers["x-pastevault-write-token"];
  return typeof raw === "string" ? raw : "";
}

export function isValidRecord(record, id) {
  if (!record || typeof record !== "object") return false;
  if (record.id !== id || record.version !== 2) return false;
  if (!isIsoDateString(record.updatedAt)) return false;
  if (record.lastSavedAt !== undefined && !isIsoDateString(record.lastSavedAt)) return false;
  if (!isValidContentVersion(record.contentVersion)) return false;
  if (!isValidSettings(record.settings)) return false;
  if (!isValidWriteLock(record.writeLock)) return false;
  if (!isValidExpiry(record.expiresAt)) return false;
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
    (key === "autosaveEnabled" && typeof value === "boolean") ||
    (key === "expireAfter" && expireAfterOptions.includes(value))
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


function isValidWriteLock(lock) {
  if (lock === undefined) return true;
  return isPlainObject(lock) && Object.keys(lock).length === 1 && base64UrlPattern.test(lock.hash ?? "");
}

// Only a bounded, future expiry is accepted, so a record cannot be made to outlive the retention rules.
function isValidExpiry(expiresAt) {
  if (expiresAt === undefined) return true;
  if (!isIsoDateString(expiresAt)) return false;
  const at = new Date(expiresAt).getTime();
  return at > Date.now() && at <= Date.now() + maxExpiryMs;
}
