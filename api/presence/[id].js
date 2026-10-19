import {
  createRateLimiter,
  getId,
  isJsonRequest,
  isPlainObject,
  isShortToken,
  json,
  kvCommand,
  readBody
} from "../_shared.js";
import { canWrite, getClip, writeTokenFrom } from "../_clipstore.js";

// Which devices have this clipboard open right now. Devices announce themselves every few
// seconds while the page is visible; the list only counts devices heard from recently, so the
// count never drifts from what is real. Nothing here is the clipboard's content.
export const presenceWindowMs = 75_000;
const staleAfterMs = 10 * 60_000;
const hashTtlSeconds = 24 * 60 * 60;
const maxBodyBytes = 2048;
const memoryHashes = new Map();
const rateLimit = createRateLimiter((req) => (req.method === "GET" ? 60 : 90));

function canUseMemoryStore() {
  return process.env.VERCEL !== "1";
}

const presenceKey = (id) => `pastevault:presence:${id}`;
const revokedKey = (id) => `pastevault:revoked:${id}`;

async function readHash(key) {
  const result = await kvCommand(["HGETALL", key]);
  if (result) {
    const flat = Array.isArray(result.result) ? result.result : [];
    const fields = {};
    for (let index = 0; index + 1 < flat.length; index += 2) fields[flat[index]] = flat[index + 1];
    return fields;
  }
  if (!canUseMemoryStore()) throw Object.assign(new Error("Durable storage is not configured."), { statusCode: 503 });
  const entry = memoryHashes.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return {};
  return Object.fromEntries(entry.fields);
}

async function writeField(key, field, value) {
  const result = await kvCommand(["HSET", key, field, value]);
  if (result) {
    await kvCommand(["EXPIRE", key, hashTtlSeconds]);
    return;
  }
  if (!canUseMemoryStore()) throw Object.assign(new Error("Durable storage is not configured."), { statusCode: 503 });
  const entry = memoryHashes.get(key);
  const fields = entry && entry.expiresAt > Date.now() ? entry.fields : new Map();
  fields.set(field, value);
  memoryHashes.set(key, { fields, expiresAt: Date.now() + hashTtlSeconds * 1000 });
}

async function deleteFields(key, fields) {
  if (!fields.length) return;
  const result = await kvCommand(["HDEL", key, ...fields]);
  if (result) return;
  const entry = memoryHashes.get(key);
  if (entry) fields.forEach((field) => entry.fields.delete(field));
}

function parseDevice(raw) {
  try {
    const value = JSON.parse(raw);
    return isPlainObject(value) && typeof value.seenAt === "number" ? value : null;
  } catch {
    return null;
  }
}

function cleanLabel(value) {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim() : "";
  return text.slice(0, 40) || "Device";
}

async function listDevices(id) {
  const [present, revoked] = await Promise.all([readHash(presenceKey(id)), readHash(revokedKey(id))]);
  const now = Date.now();
  const devices = [];
  const stale = [];
  for (const [deviceId, raw] of Object.entries(present)) {
    const device = parseDevice(raw);
    if (!device || now - device.seenAt > staleAfterMs || revoked[deviceId]) {
      stale.push(deviceId);
      continue;
    }
    if (now - device.seenAt <= presenceWindowMs) {
      devices.push({ deviceId, label: cleanLabel(device.label), lastSeen: new Date(device.seenAt).toISOString() });
    }
  }
  if (stale.length) void deleteFields(presenceKey(id), stale).catch(() => {});
  devices.sort((left, right) => right.lastSeen.localeCompare(left.lastSeen));
  return { devices, revoked };
}

// GET  /api/presence/:id                                     -> { devices }
// POST /api/presence/:id { deviceId, label }                 -> heartbeat, { devices, revoked }
// POST /api/presence/:id { action: "disconnect", deviceId, targetDeviceId | "others" }
// POST /api/presence/:id { action: "rejoin", deviceId }
// Disconnecting asks a device to stop syncing; it needs the write token when the clipboard is view-only locked.
export default async function handler(req, res) {
  const id = getId(req);
  if (!id) return json(res, 400, { error: "Invalid clipboard id." });

  const limit = rateLimit(req);
  if (limit.limited) return json(res, 429, { error: "Too many requests." }, { "Retry-After": "60" });

  try {
    if (req.method === "GET") {
      const { devices } = await listDevices(id);
      return json(res, 200, { devices });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { error: "Method not allowed." });
    }

    if (!isJsonRequest(req)) return json(res, 415, { error: "Content-Type must be application/json." });
    const body = JSON.parse((await readBody(req, maxBodyBytes)) || "{}");
    if (!isPlainObject(body) || !isShortToken(body.deviceId)) {
      return json(res, 400, { error: "Invalid device." });
    }

    if (body.action === "rejoin") {
      await deleteFields(revokedKey(id), [body.deviceId]);
      return json(res, 200, { ok: true });
    }

    if (body.action === "disconnect") {
      if (!canWrite(await getClip(id), writeTokenFrom(req))) {
        return json(res, 403, { error: "This clipboard is view-only.", reason: "read_only" });
      }
      const { devices } = await listDevices(id);
      let targets;
      if (body.targetDeviceId === "others") {
        targets = devices.map((device) => device.deviceId).filter((deviceId) => deviceId !== body.deviceId);
      } else if (isShortToken(body.targetDeviceId) && body.targetDeviceId !== body.deviceId) {
        targets = [body.targetDeviceId];
      } else {
        return json(res, 400, { error: "Invalid device." });
      }
      const at = String(Date.now());
      await Promise.all(targets.map((deviceId) => writeField(revokedKey(id), deviceId, at)));
      await deleteFields(presenceKey(id), targets);
      return json(res, 200, { ok: true, disconnected: targets.length });
    }

    if (body.action !== undefined) return json(res, 400, { error: "Unknown action." });

    const { devices, revoked } = await listDevices(id);
    if (revoked[body.deviceId]) return json(res, 200, { revoked: true, devices: [] });
    const label = cleanLabel(body.label);
    const seenAt = Date.now();
    await writeField(presenceKey(id), body.deviceId, JSON.stringify({ label, seenAt }));
    const others = devices.filter((device) => device.deviceId !== body.deviceId);
    const self = { deviceId: body.deviceId, label, lastSeen: new Date(seenAt).toISOString() };
    return json(res, 200, { revoked: false, devices: [self, ...others] });
  } catch (error) {
    if (error.statusCode === 413) return json(res, 413, { error: "Payload too large." });
    if (error.statusCode === 503) return json(res, 503, { error: "Storage temporarily unavailable." });
    return json(res, 400, { error: "Invalid request body." });
  }
}
