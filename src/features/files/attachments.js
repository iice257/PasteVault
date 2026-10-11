import { maxAttachmentsPerClip, maxFileBytes } from "./limits.js";

const attachmentIdPattern = /^att_[A-Za-z0-9_-]{8,40}$/;
const fileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
// Small preview image stored inside the encrypted clip so other devices show it without a download.
const thumbPattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const maxThumbChars = 16000;

export function createAttachmentId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let text = "";
  for (const byte of bytes) text += byte.toString(16).padStart(2, "0");
  return `att_${text}`;
}

// Display-safe file name: no paths, control characters or bidi overrides.
export function sanitizeFileName(name, fallback = "file") {
  const printable = [...String(name ?? "")].filter((char) => {
    const code = char.codePointAt(0);
    return !(code < 32 || code === 127 || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069));
  }).join("");
  const cleaned = printable
    .replace(/[\\/]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function fileExtension(name) {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(String(name ?? ""));
  return match ? match[1].toLowerCase() : "";
}

function base64Length(value) {
  if (typeof value !== "string" || !base64Pattern.test(value)) return -1;
  try {
    return atob(value).length;
  } catch {
    return -1;
  }
}

export function normalizeAttachment(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !attachmentIdPattern.test(raw.id)) return null;
  if (typeof raw.fileId !== "string" || !fileIdPattern.test(raw.fileId)) return null;
  if (base64Length(raw.key) !== 32 || base64Length(raw.iv) !== 12) return null;
  const size = Number(raw.size);
  if (!Number.isInteger(size) || size <= 0 || size > maxFileBytes) return null;
  const expires = new Date(raw.expiresAt);
  if (Number.isNaN(expires.getTime())) return null;

  const thumb = typeof raw.thumb === "string" && thumbPattern.test(raw.thumb) && raw.thumb.length <= maxThumbChars
    ? raw.thumb
    : undefined;

  return {
    id: raw.id,
    ...(thumb ? { thumb } : {}),
    name: sanitizeFileName(raw.name),
    type: typeof raw.type === "string" ? raw.type.slice(0, 100) : "",
    size,
    key: raw.key,
    iv: raw.iv,
    fileId: raw.fileId.toLowerCase(),
    expiresAt: expires.toISOString()
  };
}

export function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const attachment = normalizeAttachment(item);
    if (!attachment || seen.has(attachment.id)) continue;
    seen.add(attachment.id);
    result.push(attachment);
    if (result.length >= maxAttachmentsPerClip) break;
  }
  return result;
}

export function isExpired(attachment, now = Date.now()) {
  return new Date(attachment.expiresAt).getTime() <= now;
}

export function timeLeftLabel(attachment, now = Date.now()) {
  const ms = new Date(attachment.expiresAt).getTime() - now;
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  if (hours >= 1) return `${hours} h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}
