import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import clipHandler from "../api/clip/[id].js";
import presenceHandler from "../api/presence/[id].js";
import fileHandler from "../api/file/[...path].js";

let ipCounter = 0;
function request(handler, { method = "GET", id = "", url = "", body, headers = {} }) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [payload] : []);
  ipCounter += 1;
  const ip = `10.7.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  req.method = method;
  req.url = url;
  req.query = id ? { id } : {};
  req.headers = { "x-forwarded-for": ip, ...(payload ? { "content-type": "application/json" } : {}), ...headers };
  req.socket = { remoteAddress: ip };
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = value;
    }
  };
  return handler(req, res).then(() => ({
    status: res.statusCode,
    body: typeof res.body === "string" && res.body.startsWith("{") ? JSON.parse(res.body) : null
  }));
}

const clip = (options) => request(clipHandler, options);
const presence = (options) => request(presenceHandler, options);
const files = (options) => request(fileHandler, options);

const tokenOf = (seed) => `tok-${seed}-0123456789abcdef0123456789abcdef`;
const hashOf = (token) => createHash("sha256").update(token).digest("base64url");

function record(id, over = {}) {
  return {
    version: 2,
    id,
    updatedAt: new Date().toISOString(),
    contentVersion: 1,
    sync: { mode: "link", salt: "AAAAAAAAAAAAAAAAAAAAAA==" },
    encryptedPayload: { iv: "AAAAAAAAAAAAAAAA", data: "Y2lwaGVydGV4dA==" },
    ...over
  };
}

const stamp = Date.now();

// --- view-only lock -----------------------------------------------------------------------------
{
  const id = `share-lock-${stamp}`;
  const token = tokenOf("a");
  const other = tokenOf("b");
  const lock = { hash: hashOf(token) };

  assert.equal((await clip({ method: "PUT", id, body: record(id) })).status, 200, "an unlocked clipboard accepts any writer");
  const claim = await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "1" }, body: record(id, { contentVersion: 2, writeLock: lock }) });
  assert.equal(claim.status, 200, "the first writer can put a lock on");

  const fetched = await clip({ id });
  assert.deepEqual(fetched.body.writeLock, lock, "the lock hash is readable so other devices know the clipboard is view-only");
  assert.ok(!JSON.stringify(fetched.body).includes(token), "the token itself never reaches the server");

  const anonymous = await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "2" }, body: record(id, { contentVersion: 3, writeLock: lock }) });
  assert.equal(anonymous.status, 403);
  assert.equal(anonymous.body.reason, "read_only");
  assert.equal((await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "2", "x-pastevault-write-token": other }, body: record(id, { contentVersion: 3, writeLock: lock }) })).status, 403, "wrong token");
  assert.equal((await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "2", "x-pastevault-force": "true" }, body: record(id, { contentVersion: 3 }) })).status, 403, "force does not bypass the lock");

  const allowed = await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "2", "x-pastevault-write-token": token }, body: record(id, { contentVersion: 3, writeLock: lock }) });
  assert.equal(allowed.status, 200, "the token holder can still write");

  // rotating the token cuts off the old one
  const rotated = tokenOf("c");
  const rotate = await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "3", "x-pastevault-write-token": token }, body: record(id, { contentVersion: 4, writeLock: { hash: hashOf(rotated) } }) });
  assert.equal(rotate.status, 200);
  assert.equal((await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "4", "x-pastevault-write-token": token }, body: record(id, { contentVersion: 5, writeLock: { hash: hashOf(rotated) } }) })).status, 403, "the old token stops working");

  // turning the lock off needs the token too
  assert.equal((await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "4" }, body: record(id, { contentVersion: 5 }) })).status, 403);
  assert.equal((await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "4", "x-pastevault-write-token": rotated }, body: record(id, { contentVersion: 5 }) })).status, 200);
  assert.equal((await clip({ id })).body.writeLock, undefined, "the lock is gone");
  assert.equal((await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "5" }, body: record(id, { contentVersion: 6 }) })).status, 200, "anyone can write again");

  // malformed locks are rejected
  const bad = `share-badlock-${stamp}`;
  assert.equal((await clip({ method: "PUT", id: bad, body: record(bad, { writeLock: { hash: "short" } }) })).status, 400);
  assert.equal((await clip({ method: "PUT", id: bad, body: record(bad, { writeLock: { hash: hashOf(token), extra: 1 } }) })).status, 400);
  assert.equal((await clip({ method: "PUT", id: bad, body: record(bad, { writeLock: "x" }) })).status, 400);
}

// --- view-only clipboards refuse file changes too ---------------------------------------------
{
  const id = `share-files-${stamp}`;
  const token = tokenOf("f");
  await clip({ method: "PUT", id, body: record(id, { writeLock: { hash: hashOf(token) } }) });

  const ticketBody = { clipboardId: id, size: 64 };
  const refused = await files({ method: "POST", url: "/api/file/ticket", body: ticketBody });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.reason, "read_only");
  const ticket = await files({ method: "POST", url: "/api/file/ticket", body: ticketBody, headers: { "x-pastevault-write-token": token } });
  assert.equal(ticket.status, 200, "the token holder can upload");
  assert.equal((await files({ method: "POST", url: "/api/file/confirm", body: { clipboardId: id, fileId: ticket.body.fileId } })).status, 403, "confirm is guarded");
  assert.equal((await files({ method: "DELETE", url: `/api/file/${id}/${ticket.body.fileId}` })).status, 403, "delete is guarded");
  assert.equal((await files({ method: "DELETE", url: `/api/file/${id}/${ticket.body.fileId}`, headers: { "x-pastevault-write-token": token } })).status, 200);
  assert.equal((await files({ method: "GET", url: `/api/file/${id}/${ticket.body.fileId}` })).status, 404, "downloads stay open, and the file is gone");
}

// --- text expiry ---------------------------------------------------------------------------------
{
  const id = `share-expiry-${stamp}`;
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const saved = await clip({ method: "PUT", id, body: record(id, { expiresAt: soon, settings: { autosaveEnabled: true, expireAfter: "1h" } }) });
  assert.equal(saved.status, 200);
  assert.equal((await clip({ id })).body.expiresAt, soon);

  const past = `share-past-${stamp}`;
  assert.equal((await clip({ method: "PUT", id: past, body: record(past, { expiresAt: new Date(Date.now() - 1000).toISOString() }) })).status, 400, "an expiry in the past is refused");
  const far = `share-far-${stamp}`;
  assert.equal((await clip({ method: "PUT", id: far, body: record(far, { expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() }) })).status, 400, "an expiry beyond a month is refused");
  assert.equal((await clip({ method: "PUT", id: far, body: record(far, { settings: { expireAfter: "forever" } }) })).status, 400, "unknown expiry options are refused");
  assert.equal((await clip({ method: "PUT", id: far, body: record(far, { expiresAt: "soon" }) })).status, 400);

  // a record that has passed its time answers 404 and can be started again from scratch
  const expired = `share-gone-${stamp}`;
  await clip({ method: "PUT", id: expired, body: record(expired, { expiresAt: new Date(Date.now() + 1500).toISOString() }) });
  assert.equal((await clip({ id: expired })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 1700));
  assert.equal((await clip({ id: expired })).status, 404, "expired clipboards are gone");
  assert.equal((await clip({ method: "PUT", id: expired, body: record(expired) })).status, 200, "the id can be reused");

  // removing the expiry keeps the clipboard
  await clip({ method: "PUT", id, headers: { "x-pastevault-base-version": "1" }, body: record(id, { contentVersion: 2, settings: { autosaveEnabled: true, expireAfter: "never" } }) });
  assert.equal((await clip({ id })).body.expiresAt, undefined);
}

// --- paired devices ------------------------------------------------------------------------------
{
  const id = `share-presence-${stamp}`;
  const beat = (deviceId, label) => presence({ method: "POST", id, body: { deviceId, label } });

  assert.deepEqual((await presence({ id })).body.devices, [], "nobody yet");
  const first = await beat("device-aaa", "Chrome on Windows");
  assert.equal(first.status, 200);
  assert.equal(first.body.devices.length, 1);
  const second = await beat("device-bbb", "Safari on iPhone");
  assert.deepEqual(second.body.devices.map((device) => device.deviceId).sort(), ["device-aaa", "device-bbb"]);
  await beat("device-aaa", "Chrome on Windows");
  assert.equal((await presence({ id })).body.devices.length, 2, "a repeat heartbeat does not add a device");
  assert.equal((await presence({ method: "POST", id, body: { deviceId: "x" } })).status, 400, "ids must look like device ids");
  const labelled = await presence({ method: "POST", id, body: { deviceId: "device-ccc", label: "<b>Evil</b>\n" } });
  assert.equal(labelled.body.devices.find((device) => device.deviceId === "device-ccc").label, "bEvil/b", "labels are stripped of markup and control characters");

  // disconnecting
  assert.equal((await presence({ method: "POST", id, body: { action: "disconnect", deviceId: "device-aaa", targetDeviceId: "device-aaa" } })).status, 400, "a device cannot disconnect itself");
  const cut = await presence({ method: "POST", id, body: { action: "disconnect", deviceId: "device-aaa", targetDeviceId: "device-bbb" } });
  assert.equal(cut.status, 200);
  assert.equal(cut.body.disconnected, 1);
  const after = await beat("device-bbb", "Safari on iPhone");
  assert.equal(after.body.revoked, true, "the disconnected device is told to stop");
  assert.deepEqual(after.body.devices, []);
  assert.ok(!(await presence({ id })).body.devices.some((device) => device.deviceId === "device-bbb"));
  assert.equal((await presence({ method: "POST", id, body: { action: "rejoin", deviceId: "device-bbb" } })).status, 200);
  assert.equal((await beat("device-bbb", "Safari on iPhone")).body.revoked, false, "a device can rejoin on purpose");

  const others = await presence({ method: "POST", id, body: { action: "disconnect", deviceId: "device-aaa", targetDeviceId: "others" } });
  assert.equal(others.body.disconnected, 2);
  assert.deepEqual((await presence({ id })).body.devices.map((device) => device.deviceId), ["device-aaa"]);

  // on a view-only clipboard only the token holder may disconnect devices
  const locked = `share-presence-lock-${stamp}`;
  const token = tokenOf("p");
  await clip({ method: "PUT", id: locked, body: record(locked, { writeLock: { hash: hashOf(token) } }) });
  await presence({ method: "POST", id: locked, body: { deviceId: "device-one", label: "One" } });
  const viewer = await presence({ method: "POST", id: locked, body: { action: "disconnect", deviceId: "device-two", targetDeviceId: "device-one" } });
  assert.equal(viewer.status, 403);
  const holder = await presence({ method: "POST", id: locked, headers: { "x-pastevault-write-token": token }, body: { action: "disconnect", deviceId: "device-two", targetDeviceId: "device-one" } });
  assert.equal(holder.status, 200);
}

console.log("Share checks passed.");
