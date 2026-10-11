import { randomUUID } from "node:crypto";

// Keep the file limits in sync with src/features/files/limits.js.
export const maxCipherBytes = 5 * 1024 * 1024 + 16;
export const maxClipboardFileBytes = 25 * 1024 * 1024;
export const maxClipboardFiles = 10;
export const retentionMs = 7 * 24 * 60 * 60 * 1000;
export const pendingMs = 60 * 60 * 1000;
export const downloadUrlSeconds = 60;
export const bucketName = "pv-files";

const gib = 1024 * 1024 * 1024;

// Budgets protect the free plan. They can be lowered with env vars (used by the tests).
export function globalBudgetBytes() {
  return Number(process.env.PV_FILES_GLOBAL_BUDGET_BYTES) || 600 * 1024 * 1024;
}

export function egressBudgetBytes() {
  return Number(process.env.PV_FILES_EGRESS_BUDGET_BYTES) || 4 * gib;
}

export class FileError extends Error {
  constructor(statusCode, reason, message) {
    super(message ?? reason);
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

const refusal = {
  clipboard_files: new FileError(422, "clipboard_files", "This clipboard already has the maximum number of files."),
  clipboard_quota: new FileError(422, "clipboard_quota", "This clipboard has reached its file storage limit."),
  global_budget: new FileError(503, "global_budget", "File storage is full right now. Try again later."),
  egress_budget: new FileError(503, "egress_budget", "Downloads are paused for now. Try again later.")
};

export function refusalError(reason) {
  return refusal[reason] ?? new FileError(503, "unavailable", "File storage is temporarily unavailable.");
}

export function readBinary(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        reject(new FileError(413, "too_large", "Payload too large."));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// --- in-memory adapter: dev server and tests ---------------------------------

const memoryFiles = new Map();
const memoryEgress = new Map();

function purgeMemory() {
  const now = Date.now();
  for (const [id, file] of memoryFiles) {
    if (file.expiresAt <= now) memoryFiles.delete(id);
  }
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

export const memoryAdapter = {
  name: "memory",

  async reserve({ clipboardId, size }) {
    purgeMemory();
    let clipFiles = 0;
    let clipBytes = 0;
    let globalBytes = 0;
    for (const file of memoryFiles.values()) {
      globalBytes += file.size;
      if (file.clipboardId === clipboardId) {
        clipFiles += 1;
        clipBytes += file.size;
      }
    }
    if (clipFiles >= maxClipboardFiles) throw refusalError("clipboard_files");
    if (clipBytes + size > maxClipboardFileBytes) throw refusalError("clipboard_quota");
    if (globalBytes + size > globalBudgetBytes()) throw refusalError("global_budget");
    const fileId = randomUUID();
    memoryFiles.set(fileId, {
      clipboardId,
      size,
      status: "pending",
      bytes: null,
      expiresAt: Date.now() + pendingMs
    });
    return { fileId, uploadUrl: `/api/file/dev.blob/${fileId}` };
  },

  async putBlob(fileId, bytes) {
    const file = memoryFiles.get(fileId);
    if (!file || file.status !== "pending" || file.expiresAt <= Date.now()) {
      throw new FileError(404, "not_found", "Upload not found.");
    }
    if (bytes.length !== file.size) throw new FileError(422, "size_mismatch", "Uploaded size does not match.");
    file.bytes = bytes;
  },

  async confirm({ clipboardId, fileId }) {
    const file = memoryFiles.get(fileId);
    if (!file || file.clipboardId !== clipboardId || file.status !== "pending" || file.expiresAt <= Date.now()) {
      throw new FileError(409, "not_found", "Upload not found or already confirmed.");
    }
    if (!file.bytes) throw new FileError(409, "not_uploaded", "The file has not finished uploading.");
    file.status = "ready";
    file.expiresAt = Date.now() + retentionMs;
    return { expiresAt: new Date(file.expiresAt).toISOString() };
  },

  async signDownload({ clipboardId, fileId }) {
    const file = memoryFiles.get(fileId);
    if (!file || file.clipboardId !== clipboardId || file.status !== "ready") {
      throw new FileError(404, "not_found", "File not found.");
    }
    if (file.expiresAt <= Date.now()) throw new FileError(410, "expired", "This file has expired.");
    const month = monthKey();
    const used = memoryEgress.get(month) ?? 0;
    if (used + file.size > egressBudgetBytes()) throw refusalError("egress_budget");
    memoryEgress.set(month, used + file.size);
    return { url: `/api/file/dev.blob/${fileId}`, size: file.size };
  },

  async readBlob(fileId) {
    const file = memoryFiles.get(fileId);
    if (!file || file.status !== "ready" || !file.bytes || file.expiresAt <= Date.now()) {
      throw new FileError(404, "not_found", "File not found.");
    }
    return file.bytes;
  },

  async remove({ clipboardId, fileId }) {
    const file = memoryFiles.get(fileId);
    if (file && file.clipboardId === clipboardId) memoryFiles.delete(fileId);
  },

  async sweep() {
    const before = memoryFiles.size;
    purgeMemory();
    return { removed: before - memoryFiles.size };
  },

  async health() {
    return { ok: true, storage: "memory" };
  },

  // Test helper: expire a file immediately.
  expireNow(fileId) {
    const file = memoryFiles.get(fileId);
    if (file) file.expiresAt = Date.now() - 1000;
  }
};

// --- Supabase adapter: production ------------------------------------------

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

let supabaseClient;
async function client() {
  if (!supabaseClient) {
    const { createClient } = await import("@supabase/supabase-js");
    const { url, key } = supabaseConfig();
    supabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return supabaseClient;
}

function unavailable(label, error) {
  console.error(`[pastevault] file storage ${label} failed: ${error?.message ?? error}`);
  return new FileError(503, "unavailable", "File storage is temporarily unavailable.");
}

export const supabaseAdapter = {
  name: "supabase",

  async reserve({ clipboardId, size }) {
    const supabase = await client();
    const { data, error } = await supabase.rpc("pv_reserve_file", {
      p_clipboard: clipboardId,
      p_size: size,
      p_max_clip_bytes: maxClipboardFileBytes,
      p_max_clip_files: maxClipboardFiles,
      p_global_budget: globalBudgetBytes()
    });
    if (error) throw unavailable("reserve", error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.reason) throw refusalError(row?.reason);
    const signed = await supabase.storage.from(bucketName).createSignedUploadUrl(row.object_path);
    if (signed.error) {
      await supabase.from("pv_files").delete().eq("id", row.file_id);
      throw unavailable("signed upload", signed.error);
    }
    return { fileId: row.file_id, uploadUrl: signed.data.signedUrl };
  },

  async confirm({ clipboardId, fileId }) {
    const supabase = await client();
    const owned = await supabase.from("pv_files").select("id").eq("id", fileId).eq("clipboard_id", clipboardId).maybeSingle();
    if (owned.error) throw unavailable("confirm lookup", owned.error);
    if (!owned.data) throw new FileError(409, "not_found", "Upload not found or already confirmed.");
    const { data, error } = await supabase.rpc("pv_confirm_file", { p_id: fileId, p_ttl: "7 days" });
    if (error) throw unavailable("confirm", error);
    if (!data) throw new FileError(409, "not_uploaded", "The file has not finished uploading.");
    const row = await supabase.from("pv_files").select("expires_at").eq("id", fileId).single();
    if (row.error) throw unavailable("confirm read", row.error);
    return { expiresAt: new Date(row.data.expires_at).toISOString() };
  },

  async signDownload({ clipboardId, fileId }) {
    const supabase = await client();
    const { data: row, error } = await supabase
      .from("pv_files")
      .select("object_path,size,status,expires_at")
      .eq("id", fileId)
      .eq("clipboard_id", clipboardId)
      .maybeSingle();
    if (error) throw unavailable("download lookup", error);
    if (!row || row.status !== "ready") throw new FileError(404, "not_found", "File not found.");
    if (new Date(row.expires_at).getTime() <= Date.now()) throw new FileError(410, "expired", "This file has expired.");
    const egress = await supabase.rpc("pv_record_egress", { p_size: row.size, p_monthly_budget: egressBudgetBytes() });
    if (egress.error) throw unavailable("egress", egress.error);
    if (!egress.data) throw refusalError("egress_budget");
    const signed = await supabase.storage.from(bucketName).createSignedUrl(row.object_path, downloadUrlSeconds);
    if (signed.error) throw unavailable("signed download", signed.error);
    return { url: signed.data.signedUrl, size: row.size };
  },

  async remove({ clipboardId, fileId }) {
    const supabase = await client();
    const { data: row, error } = await supabase
      .from("pv_files")
      .select("object_path")
      .eq("id", fileId)
      .eq("clipboard_id", clipboardId)
      .maybeSingle();
    if (error) throw unavailable("remove lookup", error);
    if (!row) return;
    const removed = await supabase.storage.from(bucketName).remove([row.object_path]);
    if (removed.error) throw unavailable("remove object", removed.error);
    await supabase.from("pv_files").delete().eq("id", fileId);
  },

  async sweep() {
    const supabase = await client();
    const { data: rows, error } = await supabase
      .from("pv_files")
      .select("id,object_path")
      .lt("expires_at", new Date().toISOString())
      .limit(500);
    if (error) throw unavailable("sweep lookup", error);
    if (!rows.length) return { removed: 0 };
    const removed = await supabase.storage.from(bucketName).remove(rows.map((row) => row.object_path));
    if (removed.error) throw unavailable("sweep objects", removed.error);
    const deleted = await supabase.from("pv_files").delete().in("id", rows.map((row) => row.id));
    if (deleted.error) throw unavailable("sweep rows", deleted.error);
    return { removed: rows.length };
  },

  async health() {
    try {
      const supabase = await client();
      const bucket = await supabase.storage.getBucket(bucketName);
      if (bucket.error) return { ok: false, storage: "unreachable" };
      const table = await supabase.from("pv_files").select("id", { head: true, count: "exact" });
      if (table.error) return { ok: false, storage: "unreachable" };
      return { ok: true, storage: "ok" };
    } catch {
      return { ok: false, storage: "unreachable" };
    }
  }
};

// Picks the adapter for this environment. Production never falls back to memory.
export function getFileAdapter() {
  if (supabaseConfig()) return supabaseAdapter;
  if (process.env.VERCEL === "1") return null;
  return memoryAdapter;
}

export async function fileStorageHealth() {
  const adapter = getFileAdapter();
  if (!adapter) return { ok: false, storage: "not-configured" };
  return adapter.health();
}
