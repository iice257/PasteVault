import {
  FileError,
  getFileAdapter,
  maxCipherBytes,
  memoryAdapter,
  readBinary
} from "../_files.js";
import {
  createRateLimiter,
  idPattern,
  isJsonRequest,
  json,
  readBody
} from "../_shared.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rateLimit = createRateLimiter((req) => (req.method === "GET" ? 120 : 40));

function segmentsOf(req) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  return pathname
    .replace(/^\/api\/file\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

async function readJson(req) {
  if (!isJsonRequest(req)) throw new FileError(415, "bad_type", "Content-Type must be application/json.");
  try {
    return JSON.parse((await readBody(req, 4096)) || "{}");
  } catch (error) {
    if (error.statusCode === 413) throw new FileError(413, "too_large", "Payload too large.");
    throw new FileError(400, "bad_body", "Invalid request body.");
  }
}

function sweepAuthorised(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.authorization === `Bearer ${secret}`;
  return process.env.VERCEL !== "1";
}

// One function serves every file route so we stay well under the Hobby plan's function limit.
//   POST   /api/file/ticket              reserve space and get an upload URL
//   POST   /api/file/confirm             mark an upload ready
//   GET    /api/file/:clipboardId/:fileId  get a short-lived download URL
//   DELETE /api/file/:clipboardId/:fileId  remove a file
//   GET    /api/file/sweep               daily cron: delete expired files (also keeps Supabase awake)
//   PUT|GET /api/file/dev.blob/:fileId   memory adapter only (dev server and tests)
export default async function handler(req, res) {
  const segments = segmentsOf(req);
  const limit = rateLimit(req);
  if (limit.limited) {
    return json(res, 429, { error: "Too many requests." }, { "Retry-After": "60" });
  }

  const adapter = getFileAdapter();
  if (!adapter) {
    return json(res, 503, { error: "File storage is not configured.", reason: "not_configured" });
  }

  try {
    const [first, second] = segments;

    if (segments.length === 1 && first === "ticket") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
      const body = await readJson(req);
      if (typeof body.clipboardId !== "string" || !idPattern.test(body.clipboardId)) {
        return json(res, 400, { error: "Invalid clipboard id.", reason: "bad_clipboard" });
      }
      const size = body.size;
      if (!Number.isInteger(size) || size < 17) {
        return json(res, 400, { error: "Invalid file size.", reason: "bad_size" });
      }
      if (size > maxCipherBytes) {
        return json(res, 413, { error: "Files can be up to 5 MB.", reason: "too_large" });
      }
      const ticket = await adapter.reserve({ clipboardId: body.clipboardId, size });
      return json(res, 200, { fileId: ticket.fileId, uploadUrl: ticket.uploadUrl, maxBytes: maxCipherBytes });
    }

    if (segments.length === 1 && first === "confirm") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
      const body = await readJson(req);
      if (typeof body.clipboardId !== "string" || !idPattern.test(body.clipboardId) || !uuidPattern.test(body.fileId ?? "")) {
        return json(res, 400, { error: "Invalid request.", reason: "bad_request" });
      }
      const result = await adapter.confirm({ clipboardId: body.clipboardId, fileId: body.fileId.toLowerCase() });
      return json(res, 200, result);
    }

    if (segments.length === 1 && first === "sweep") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
      if (!sweepAuthorised(req)) return json(res, 401, { error: "Unauthorized." });
      return json(res, 200, await adapter.sweep());
    }

    if (segments.length === 2 && first === "dev.blob") {
      if (adapter !== memoryAdapter) return json(res, 404, { error: "Not found." });
      if (!uuidPattern.test(second)) return json(res, 400, { error: "Invalid file id." });
      if (req.method === "PUT") {
        await adapter.putBlob(second.toLowerCase(), await readBinary(req, maxCipherBytes));
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET") {
        const bytes = await adapter.readBlob(second.toLowerCase());
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(bytes);
        return undefined;
      }
      return json(res, 405, { error: "Method not allowed." }, { Allow: "GET, PUT" });
    }

    if (segments.length === 2) {
      const [clipboardId, fileId] = segments;
      if (!idPattern.test(clipboardId) || !uuidPattern.test(fileId)) {
        return json(res, 400, { error: "Invalid request.", reason: "bad_request" });
      }
      if (req.method === "GET") {
        const download = await adapter.signDownload({ clipboardId, fileId: fileId.toLowerCase() });
        return json(res, 200, download);
      }
      if (req.method === "DELETE") {
        await adapter.remove({ clipboardId, fileId: fileId.toLowerCase() });
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: "Method not allowed." }, { Allow: "GET, DELETE" });
    }

    return json(res, 404, { error: "Not found." });
  } catch (error) {
    if (error instanceof FileError) {
      return json(res, error.statusCode, { error: error.message, reason: error.reason });
    }
    console.error(`[pastevault] file route failed: ${error?.message ?? error}`);
    return json(res, 500, { error: "Something went wrong.", reason: "internal" });
  }
}
