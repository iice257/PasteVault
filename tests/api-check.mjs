import assert from "node:assert/strict";
import { Readable } from "node:stream";
import handler from "../api/clip/[id].js";
import sessionHandler from "../api/session/[id].js";

function createReq({ method, id, body = "", ip = "127.0.0.1", headers = {} }) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.query = { id };
  req.headers = {
    "x-forwarded-for": ip,
    ...(body ? { "content-type": "application/json" } : {}),
    ...headers
  };
  req.socket = { remoteAddress: ip };
  return req;
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = value;
      this.finished = true;
    }
  };
}

async function invoke(options) {
  const req = createReq(options);
  const res = createRes();
  await handler(req, res);
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body ? JSON.parse(res.body) : null
  };
}

async function invokeSession(options) {
  const req = createReq(options);
  const res = createRes();
  await sessionHandler(req, res);
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body ? JSON.parse(res.body) : null
  };
}

const id = `api-check-${Date.now()}`;
const unsupportedType = await invoke({
  method: "PUT",
  id,
  headers: { "content-type": "text/plain" },
  body: "{}"
});
if (unsupportedType.status !== 415) {
  throw new Error(`Expected unsupported content type rejection, received ${unsupportedType.status}.`);
}

const invalid = await invoke({
  method: "PUT",
  id,
  body: JSON.stringify({ version: 2, id, payload: { clips: [] } })
});
if (invalid.status !== 400) {
  throw new Error(`Expected plaintext payload rejection, received ${invalid.status}.`);
}

const encryptedRecord = {
  version: 2,
  id,
  updatedAt: new Date().toISOString(),
  sync: { mode: "link", salt: "AAAAAAAAAAAAAAAAAAAAAA==" },
  encryptedPayload: {
    iv: "AAAAAAAAAAAAAAAA",
    data: "Y2lwaGVydGV4dA=="
  }
};

const saved = await invoke({
  method: "PUT",
  id,
  body: JSON.stringify(encryptedRecord)
});
if (saved.status !== 200 || saved.body.ok !== true) {
  throw new Error(`Expected encrypted payload save, received ${saved.status}.`);
}

const fetched = await invoke({ method: "GET", id });
if (fetched.status !== 200 || fetched.body.id !== id || !fetched.body.encryptedPayload) {
  throw new Error(`Expected encrypted payload fetch, received ${fetched.status}.`);
}

const nextEncryptedRecord = {
  ...encryptedRecord,
  contentVersion: 2,
  updatedAt: new Date().toISOString(),
  encryptedPayload: {
    iv: "BBBBBBBBBBBBBBBB",
    data: "bmV4dC1jaXBoZXJ0ZXh0"
  }
};
const versionedSave = await invoke({
  method: "PUT",
  id,
  headers: { "x-pastevault-base-version": "1" },
  body: JSON.stringify(nextEncryptedRecord)
});
if (versionedSave.status !== 200 || versionedSave.body.ok !== true) {
  throw new Error(`Expected versioned encrypted payload save, received ${versionedSave.status}.`);
}

const staleSave = await invoke({
  method: "PUT",
  id,
  headers: { "x-pastevault-base-version": "1" },
  body: JSON.stringify({ ...nextEncryptedRecord, contentVersion: 3 })
});
if (staleSave.status !== 409 || staleSave.body.currentVersion !== 2) {
  throw new Error(`Expected stale save conflict, received ${staleSave.status}.`);
}

process.env.VERCEL = "1";
const unavailableId = `api-check-unconfigured-${Date.now()}`;
const unavailableSave = await invoke({
  method: "PUT",
  id: unavailableId,
  body: JSON.stringify({
    ...encryptedRecord,
    id: unavailableId
  })
});
if (unavailableSave.status !== 503) {
  throw new Error(`Expected unconfigured production storage rejection, received ${unavailableSave.status}.`);
}
const unavailableFetch = await invoke({ method: "GET", id: unavailableId });
if (unavailableFetch.status !== 503) {
  throw new Error(`Expected unconfigured production fetch rejection, received ${unavailableFetch.status}.`);
}
delete process.env.VERCEL;

const badId = await invoke({ method: "GET", id: "../etc/passwd" });
if (badId.status !== 400) {
  throw new Error(`Expected invalid id rejection, received ${badId.status}.`);
}

const malformedEncryptedRecord = await invoke({
  method: "PUT",
  id,
  body: JSON.stringify({
    version: 2,
    id,
    updatedAt: new Date().toISOString(),
    encryptedPayload: {
      iv: "AAAAAAAAAAAAAAAA",
      data: "Y2lwaGVydGV4dA=="
    }
  })
});
if (malformedEncryptedRecord.status !== 400) {
  throw new Error(`Expected encrypted payload without sync/protection rejection, received ${malformedEncryptedRecord.status}.`);
}

const ambiguousEncryptedRecord = await invoke({
  method: "PUT",
  id,
  body: JSON.stringify({
    ...encryptedRecord,
    protection: {
      salt: "AAAAAAAAAAAAAAAAAAAAAA==",
      verifier: {
        iv: "AAAAAAAAAAAAAAAA",
        data: "Y2lwaGVydGV4dA=="
      }
    }
  })
});
if (ambiguousEncryptedRecord.status !== 400) {
  throw new Error(`Expected ambiguous sync/protection rejection, received ${ambiguousEncryptedRecord.status}.`);
}

const invalidSettingsRecord = await invoke({
  method: "PUT",
  id,
  body: JSON.stringify({
    ...encryptedRecord,
    settings: { autosaveEnabled: "yes" }
  })
});
if (invalidSettingsRecord.status !== 400) {
  throw new Error(`Expected invalid settings rejection, received ${invalidSettingsRecord.status}.`);
}

const sessionState = {
  vaultId: id,
  sessionId: "session_api_check",
  deviceId: "device_api_check",
  theme: "dark",
  viewMode: "history",
  selectedTab: "preview",
  editorSettings: {
    autosaveEnabled: false,
    sidebarCollapsed: true
  },
  updatedAt: new Date().toISOString()
};

const savedSession = await invokeSession({
  method: "PUT",
  id,
  body: JSON.stringify(sessionState)
});
if (savedSession.status !== 200 || savedSession.body.ok !== true) {
  throw new Error(`Expected session state save, received ${savedSession.status}.`);
}

const fetchedSession = await invokeSession({ method: "GET", id });
if (fetchedSession.status !== 200 || fetchedSession.body.vaultId !== id || fetchedSession.body.theme !== "dark") {
  throw new Error(`Expected session state fetch, received ${fetchedSession.status}.`);
}

process.env.VERCEL = "1";
const unavailableSession = await invokeSession({
  method: "PUT",
  id: unavailableId,
  body: JSON.stringify({
    ...sessionState,
    vaultId: unavailableId
  })
});
if (unavailableSession.status !== 503) {
  throw new Error(`Expected unconfigured production session rejection, received ${unavailableSession.status}.`);
}
delete process.env.VERCEL;

const badSession = await invokeSession({
  method: "PUT",
  id,
  body: JSON.stringify({ ...sessionState, vaultId: "../wrong" })
});
if (badSession.status !== 400) {
  throw new Error(`Expected invalid session state rejection, received ${badSession.status}.`);
}

const badSessionSettings = await invokeSession({
  method: "PUT",
  id,
  body: JSON.stringify({
    ...sessionState,
    editorSettings: {
      autosaveEnabled: false,
      nested: { unsafe: true }
    }
  })
});
if (badSessionSettings.status !== 400) {
  throw new Error(`Expected invalid editor settings rejection, received ${badSessionSettings.status}.`);
}

const badSessionView = await invokeSession({
  method: "PUT",
  id,
  body: JSON.stringify({ ...sessionState, viewMode: "unknown-panel" })
});
if (badSessionView.status !== 400) {
  throw new Error(`Expected invalid session view rejection, received ${badSessionView.status}.`);
}

const badSessionTab = await invokeSession({
  method: "PUT",
  id,
  body: JSON.stringify({ ...sessionState, selectedTab: "danger" })
});
if (badSessionTab.status !== 400) {
  throw new Error(`Expected invalid session tab rejection, received ${badSessionTab.status}.`);
}

const badSessionFormat = await invokeSession({
  method: "PUT",
  id,
  body: JSON.stringify({
    ...sessionState,
    editorSettings: {
      ...sessionState.editorSettings,
      format: "Ruby"
    }
  })
});
if (badSessionFormat.status !== 400) {
  throw new Error(`Expected invalid session format rejection, received ${badSessionFormat.status}.`);
}

console.log("API checks passed.");

const { default: healthHandler } = await import("../api/health.js");
const healthRes = createRes();
await healthHandler({ method: "GET", headers: {}, query: {} }, healthRes);
const health = JSON.parse(healthRes.body);
if (typeof health.ok !== "boolean" || !health.storage) {
  throw new Error("health endpoint must report ok and storage state");
}
if (JSON.stringify(health).match(/https?:|token/i)) {
  throw new Error("health endpoint must not leak connection details");
}
console.log("api health check passed");

{
  const unchanged = await invoke({ method: "GET", id, headers: { "x-pastevault-known-version": "99" } });
  if (unchanged.status !== 304) {
    throw new Error(`Expected 304 when client already has the latest version, received ${unchanged.status}.`);
  }
  const stale = await invoke({ method: "GET", id, headers: { "x-pastevault-known-version": "0" } });
  if (stale.status !== 200 || !stale.body.encryptedPayload) {
    throw new Error(`Expected full record without a usable known version, received ${stale.status}.`);
  }
}
console.log("api 304 check passed");

{
  const { default: codeCreate } = await import("../api/code.js");
  const { default: codeResolve } = await import("../api/code/[code].js");
  const run = async (fn, options) => {
    const req = createReq(options);
    const res = createRes();
    await fn(req, res);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };

  const pairId = `pair-check-${Date.now()}`;
  const created = await run(codeCreate, { method: "POST", id: pairId, ip: "10.0.0.1", body: JSON.stringify({ clipboardId: pairId }) });
  if (created.status !== 200 || !/^[A-HJ-KM-NP-Z2-9]{6}$/.test(created.body.code)) {
    throw new Error(`Expected a 6-character pairing code, received ${created.status} ${JSON.stringify(created.body)}.`);
  }
  const bad = await run(codeCreate, { method: "POST", id: "x", ip: "10.0.0.2", body: JSON.stringify({ clipboardId: "../etc" }) });
  if (bad.status !== 400) throw new Error("Expected invalid clipboard id to be rejected for pairing.");
  const wrongMethod = await run(codeCreate, { method: "GET", id: "x", ip: "10.0.0.3" });
  if (wrongMethod.status !== 405) throw new Error("Expected GET /api/code to be rejected.");

  const resolveReq = async (code, ip) => {
    const req = createReq({ method: "GET", id: "", ip });
    req.query = { code };
    const res = createRes();
    await codeResolve(req, res);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };
  const lower = await resolveReq(created.body.code.toLowerCase(), "10.0.0.4");
  if (lower.status !== 200 || lower.body.clipboardId !== pairId) {
    throw new Error(`Expected the code to resolve case-insensitively, received ${lower.status}.`);
  }
  const reused = await resolveReq(created.body.code, "10.0.0.4");
  if (reused.status !== 404) throw new Error("Expected pairing codes to be single use.");
  const malformed = await resolveReq("ab0O1I", "10.0.0.5");
  if (malformed.status !== 400) throw new Error("Expected malformed pairing codes to be rejected.");

  let limited = 0;
  for (let i = 0; i < 25; i += 1) {
    if ((await resolveReq("ZZZZZZ", "10.0.0.6")).status === 429) limited += 1;
  }
  if (!limited) throw new Error("Expected pairing code lookups to be rate limited.");
}
console.log("api pairing checks passed");

{
  const { default: fileHandler } = await import("../api/file/[...path].js");
  const { memoryAdapter } = await import("../api/_files.js");

  async function call({ method = "GET", path, body, ip = "10.1.0.1", headers = {} }) {
    const req = createReq({ method, id: "", body, ip, headers });
    req.url = path;
    req.query = {};
    const res = createRes();
    await fileHandler(req, res);
    const isJson = typeof res.body === "string" && res.body.startsWith("{");
    return { status: res.statusCode, body: isJson ? JSON.parse(res.body) : null, raw: res.body, headers: res.headers };
  }
  const post = (path, payload, ip, headers) => call({ method: "POST", path, body: JSON.stringify(payload), ip, headers });
  const cipherSize = (plain) => plain + 16;

  const clip = `files-check-${Date.now()}`;
  const bytes = Buffer.from("ciphertext-bytes-for-testing-only");

  // ticket -> upload -> confirm -> download -> delete
  const ticket = await post("/api/file/ticket", { clipboardId: clip, size: bytes.length });
  assert.equal(ticket.status, 200);
  assert.match(ticket.body.fileId, /^[0-9a-f-]{36}$/);
  assert.ok(ticket.body.uploadUrl.startsWith("/api/file/dev.blob/"));

  const notUploaded = await post("/api/file/confirm", { clipboardId: clip, fileId: ticket.body.fileId });
  assert.equal(notUploaded.status, 409, "confirm before upload is refused");
  assert.equal(notUploaded.body.reason, "not_uploaded");

  const wrongSize = await call({ method: "PUT", path: ticket.body.uploadUrl, body: Buffer.from("short") });
  assert.equal(wrongSize.status, 422, "upload must match the reserved size");
  const uploaded = await call({ method: "PUT", path: ticket.body.uploadUrl, body: bytes });
  assert.equal(uploaded.status, 200);

  const confirmed = await post("/api/file/confirm", { clipboardId: clip, fileId: ticket.body.fileId });
  assert.equal(confirmed.status, 200);
  const days = (new Date(confirmed.body.expiresAt).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days <= 7.01, "files are kept for 7 days");

  const download = await call({ path: `/api/file/${clip}/${ticket.body.fileId}` });
  assert.equal(download.status, 200);
  const blob = await call({ path: download.body.url });
  assert.equal(blob.status, 200);
  assert.deepEqual(Buffer.from(blob.raw), bytes, "downloaded bytes match what was uploaded");
  assert.equal(blob.headers["content-type"], "application/octet-stream");

  assert.equal((await call({ path: `/api/file/other-clip/${ticket.body.fileId}` })).status, 404, "another clipboard cannot download it");
  assert.equal((await call({ path: `/api/file/${clip}/not-a-uuid` })).status, 400);
  assert.equal((await call({ path: `/api/file/bad%20id!/${ticket.body.fileId}` })).status, 400);

  // input validation
  assert.equal((await post("/api/file/ticket", { clipboardId: "../x", size: 100 }, "10.1.0.2")).status, 400);
  assert.equal((await post("/api/file/ticket", { clipboardId: clip, size: 5 }, "10.1.0.2")).status, 400, "smaller than a GCM tag");
  assert.equal((await post("/api/file/ticket", { clipboardId: clip, size: 1.5 }, "10.1.0.2")).status, 400);
  assert.equal((await post("/api/file/ticket", { clipboardId: clip, size: cipherSize(5 * 1024 * 1024) + 1 }, "10.1.0.2")).status, 413, "over 5 MB");
  assert.equal((await call({ method: "POST", path: "/api/file/ticket", body: "{}", ip: "10.1.0.2", headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call({ path: "/api/file/ticket", ip: "10.1.0.2" })).status, 405);
  assert.equal((await call({ path: "/api/file/nope/x/y", ip: "10.1.0.2" })).status, 404);

  // delete
  assert.equal((await call({ method: "DELETE", path: `/api/file/${clip}/${ticket.body.fileId}` })).status, 200);
  assert.equal((await call({ path: `/api/file/${clip}/${ticket.body.fileId}` })).status, 404, "deleted files are gone");

  // per-clipboard byte quota: four 5 MB files fit, the fifth does not
  const quotaClip = `files-quota-${Date.now()}`;
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await post("/api/file/ticket", { clipboardId: quotaClip, size: cipherSize(5 * 1024 * 1024) }, "10.1.0.3")).status, 200);
  }
  const overQuota = await post("/api/file/ticket", { clipboardId: quotaClip, size: cipherSize(5 * 1024 * 1024) }, "10.1.0.3");
  assert.equal(overQuota.status, 422);
  assert.equal(overQuota.body.reason, "clipboard_quota");

  // per-clipboard file count
  const countClip = `files-count-${Date.now()}`;
  for (let index = 0; index < 10; index += 1) {
    assert.equal((await post("/api/file/ticket", { clipboardId: countClip, size: 100 }, "10.1.0.4")).status, 200);
  }
  const overCount = await post("/api/file/ticket", { clipboardId: countClip, size: 100 }, "10.1.0.4");
  assert.equal(overCount.status, 422);
  assert.equal(overCount.body.reason, "clipboard_files");

  // global storage budget and egress budget
  process.env.PV_FILES_GLOBAL_BUDGET_BYTES = "1";
  const full = await post("/api/file/ticket", { clipboardId: `files-budget-${Date.now()}`, size: 100 }, "10.1.0.5");
  assert.equal(full.status, 503);
  assert.equal(full.body.reason, "global_budget");
  delete process.env.PV_FILES_GLOBAL_BUDGET_BYTES;

  const egressClip = `files-egress-${Date.now()}`;
  const egressTicket = await post("/api/file/ticket", { clipboardId: egressClip, size: bytes.length }, "10.1.0.6");
  await call({ method: "PUT", path: egressTicket.body.uploadUrl, body: bytes, ip: "10.1.0.6" });
  await post("/api/file/confirm", { clipboardId: egressClip, fileId: egressTicket.body.fileId }, "10.1.0.6");
  process.env.PV_FILES_EGRESS_BUDGET_BYTES = "1";
  const paused = await call({ path: `/api/file/${egressClip}/${egressTicket.body.fileId}`, ip: "10.1.0.6" });
  assert.equal(paused.status, 503);
  assert.equal(paused.body.reason, "egress_budget");
  delete process.env.PV_FILES_EGRESS_BUDGET_BYTES;

  // expiry and sweep
  assert.equal((await call({ path: `/api/file/${egressClip}/${egressTicket.body.fileId}`, ip: "10.1.0.6" })).status, 200);
  memoryAdapter.expireNow(egressTicket.body.fileId);
  assert.equal((await call({ path: `/api/file/${egressClip}/${egressTicket.body.fileId}`, ip: "10.1.0.6" })).status, 410, "expired files report 410");
  const swept = await call({ path: "/api/file/sweep", ip: "10.1.0.7" });
  assert.equal(swept.status, 200);
  assert.ok(swept.body.removed >= 1, "sweep removes expired files");

  // the cron route needs the secret when one is configured
  process.env.CRON_SECRET = "test-secret";
  assert.equal((await call({ path: "/api/file/sweep", ip: "10.1.0.8" })).status, 401);
  assert.equal((await call({ path: "/api/file/sweep", ip: "10.1.0.8", headers: { authorization: "Bearer wrong" } })).status, 401);
  assert.equal((await call({ path: "/api/file/sweep", ip: "10.1.0.8", headers: { authorization: "Bearer test-secret" } })).status, 200);
  delete process.env.CRON_SECRET;

  // production never falls back to the memory adapter
  process.env.VERCEL = "1";
  const unconfigured = await post("/api/file/ticket", { clipboardId: clip, size: 100 }, "10.1.0.9");
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.body.reason, "not_configured");
  delete process.env.VERCEL;
}
console.log("api file checks passed");
