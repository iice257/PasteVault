import { randomInt } from "node:crypto";
import {
  codeAlphabet,
  codeLength,
  codeTtlSeconds,
  createRateLimiter,
  idPattern,
  isJsonRequest,
  json,
  kvCommand,
  memoryCodes,
  readBody
} from "./_shared.js";

const rateLimit = createRateLimiter(() => 12);

function randomCode() {
  let code = "";
  for (let i = 0; i < codeLength; i += 1) {
    code += codeAlphabet[randomInt(codeAlphabet.length)];
  }
  return code;
}

async function claimCode(code, clipboardId) {
  const key = `pastevault:code:${code}`;
  const result = await kvCommand(["SET", key, clipboardId, "EX", codeTtlSeconds, "NX"]);
  if (result) return result.result === "OK";
  if (process.env.VERCEL === "1") {
    throw Object.assign(new Error("Durable storage is not configured."), { statusCode: 503 });
  }
  const existing = memoryCodes.get(code);
  if (existing && existing.expiresAt > Date.now()) return false;
  memoryCodes.set(code, { clipboardId, expiresAt: Date.now() + codeTtlSeconds * 1000 });
  return true;
}

// POST /api/code { clipboardId } -> { code, expiresAt }
// Short, one-time pairing code that resolves to a clipboard link on another device.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  }
  const limit = rateLimit(req);
  if (limit.limited) {
    return json(res, 429, { error: "Too many requests." }, { "Retry-After": "60" });
  }
  try {
    if (!isJsonRequest(req)) {
      return json(res, 415, { error: "Content-Type must be application/json." });
    }
    const body = JSON.parse((await readBody(req, 2048)) || "{}");
    const clipboardId = body?.clipboardId;
    if (typeof clipboardId !== "string" || !idPattern.test(clipboardId)) {
      return json(res, 400, { error: "Invalid clipboard id." });
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = randomCode();
      if (await claimCode(code, clipboardId)) {
        return json(res, 200, { code, expiresAt: new Date(Date.now() + codeTtlSeconds * 1000).toISOString() });
      }
    }
    return json(res, 503, { error: "Could not allocate a code. Try again." });
  } catch (error) {
    if (error.statusCode === 413) return json(res, 413, { error: "Payload too large." });
    if (error.statusCode === 503) return json(res, 503, { error: "Storage temporarily unavailable." });
    return json(res, 400, { error: "Invalid request body." });
  }
}
