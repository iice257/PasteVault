import {
  codeAlphabet,
  codeLength,
  createRateLimiter,
  json,
  kvCommand,
  memoryCodes
} from "../_shared.js";

const rateLimit = createRateLimiter(() => 20);
const codePattern = new RegExp(`^[${codeAlphabet}]{${codeLength}}$`);

function normalizeCode(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

async function consumeCode(code) {
  const result = await kvCommand(["GETDEL", `pastevault:code:${code}`]);
  if (result) return result.result ?? null;
  if (process.env.VERCEL === "1") {
    throw Object.assign(new Error("Durable storage is not configured."), { statusCode: 503 });
  }
  const entry = memoryCodes.get(code);
  memoryCodes.delete(code);
  return entry && entry.expiresAt > Date.now() ? entry.clipboardId : null;
}

// GET /api/code/:code -> { clipboardId }. Codes are single use: resolving burns the code.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
  }
  const limit = rateLimit(req);
  if (limit.limited) {
    return json(res, 429, { error: "Too many requests." }, { "Retry-After": "60" });
  }
  const code = normalizeCode(req.query?.code);
  if (!codePattern.test(code)) {
    return json(res, 400, { error: "That code doesn't look right." });
  }
  try {
    const clipboardId = await consumeCode(code);
    return clipboardId
      ? json(res, 200, { clipboardId })
      : json(res, 404, { error: "That code is invalid or has expired." });
  } catch {
    return json(res, 503, { error: "Storage temporarily unavailable." });
  }
}
