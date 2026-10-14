import { fileStorageHealth } from "./_files.js";
import { json, kvCommand, kvConfig } from "./_shared.js";

// Reports whether durable storage is reachable. Never exposes URLs or tokens.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
  }
  const files = await fileStorageHealth();
  if (!kvConfig()) {
    return json(res, 200, { ok: false, storage: "not-configured", files: files.storage });
  }
  const started = Date.now();
  try {
    await kvCommand(["PING"]);
    return json(res, 200, { ok: true, storage: "ok", latencyMs: Date.now() - started, files: files.storage });
  } catch (error) {
    return json(res, 503, { ok: false, storage: error.reason ?? "unavailable", files: files.storage });
  }
}
