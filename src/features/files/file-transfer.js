import { createAttachmentId, sanitizeFileName } from "./attachments.js";
import { decryptFile, encryptFile, FileCryptoError } from "./file-crypto.js";
import { maxAttachmentsPerClip, maxClipboardFileBytes, maxClipboardFiles, maxFileBytes } from "./limits.js";
import { makeThumbnail } from "./thumbnail.js";

export class TransferError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "TransferError";
    this.code = code;
  }
}

const reasonMessages = {
  too_large: "Files can be up to 5 MB.",
  clipboard_files: "This clipboard already has the maximum number of files.",
  clipboard_quota: "This clipboard has reached its file storage limit.",
  global_budget: "File storage is full right now. Try again later.",
  egress_budget: "Downloads are paused for now. Try again later.",
  not_configured: "File storage is not set up for this site yet.",
  expired: "This file has expired and was deleted.",
  not_found: "This file is no longer available."
};

async function readError(response, fallback) {
  let reason = "";
  let message = "";
  try {
    const body = await response.json();
    reason = body.reason ?? "";
    message = body.error ?? "";
  } catch {
    // Not JSON; use the status text below.
  }
  return new TransferError(reasonMessages[reason] ?? (message || fallback), reason || `http_${response.status}`);
}

async function postJson(path, payload) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new TransferError("Could not reach the server. Check your connection.", "network");
  }
  if (!response.ok) throw await readError(response, "Something went wrong. Try again.");
  return response.json();
}

function putWithProgress(url, body, mode, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new TransferError("The upload was rejected. Try again.", `upload_${request.status}`));
    };
    request.onerror = () => reject(new TransferError("Could not reach the server. Check your connection.", "network"));
    request.onabort = () => reject(new TransferError("The upload was cancelled.", "aborted"));
    const blob = new Blob([body], { type: "application/octet-stream" });
    if (mode === "form") {
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", blob);
      request.send(form);
    } else {
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.send(blob);
    }
  });
}

export function pastedFileName(file, now = new Date()) {
  if (file.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return sanitizeFileName(file.name);
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  const extension = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "png";
  return `Pasted image ${stamp}.${extension}`;
}

// Quick local checks so users get an instant, specific message before anything is encrypted.
export function checkAttachable(file, existingAttachments, allAttachments) {
  if (!file.size) return "That file is empty.";
  if (file.size > maxFileBytes) return `${sanitizeFileName(file.name, "That file")} is over 5 MB. PasteVault is for small files you want encrypted.`;
  if (existingAttachments.length >= maxAttachmentsPerClip || allAttachments.length >= maxClipboardFiles) {
    return "This clipboard already has the maximum number of files.";
  }
  const used = allAttachments.reduce((total, attachment) => total + attachment.size, 0);
  if (used + file.size > maxClipboardFileBytes) return "This clipboard has reached its file storage limit.";
  return "";
}

// Encrypts a file in the browser, uploads the ciphertext straight to storage, and returns the
// attachment record to store inside the (already encrypted) clipboard payload.
export async function uploadAttachment({ clipboardId, file, onStage = () => {} }) {
  const id = createAttachmentId();
  const bytes = new Uint8Array(await file.arrayBuffer());

  onStage("encrypting", 0);
  let sealed;
  try {
    sealed = await encryptFile(bytes, id);
  } catch (error) {
    throw error instanceof FileCryptoError ? new TransferError(error.message, error.code) : error;
  }

  const ticket = await postJson("/api/file/ticket", { clipboardId, size: sealed.ciphertext.length });
  onStage("uploading", 0);
  await putWithProgress(ticket.uploadUrl, sealed.ciphertext, ticket.mode, (fraction) => onStage("uploading", fraction));
  onStage("finishing", 1);
  const confirmed = await postJson("/api/file/confirm", { clipboardId, fileId: ticket.fileId });
  const thumb = await makeThumbnail(file);

  return {
    id,
    ...(thumb ? { thumb } : {}),
    name: pastedFileName(file),
    type: file.type || "",
    size: bytes.length,
    key: sealed.key,
    iv: sealed.iv,
    fileId: ticket.fileId,
    expiresAt: confirmed.expiresAt
  };
}

// Fetches and decrypts an attachment. The server never sees the key or the plaintext.
export async function downloadAttachment({ clipboardId, attachment }) {
  let response;
  try {
    response = await fetch(`/api/file/${encodeURIComponent(clipboardId)}/${attachment.fileId}`, { cache: "no-store" });
  } catch {
    throw new TransferError("Could not reach the server. Check your connection.", "network");
  }
  if (!response.ok) throw await readError(response, "Could not download this file.");
  const { url } = await response.json();

  let data;
  try {
    const file = await fetch(url, { cache: "no-store" });
    if (!file.ok) throw new Error(String(file.status));
    data = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new TransferError("Could not download this file. Try again.", "network");
  }

  try {
    return await decryptFile(data, { key: attachment.key, iv: attachment.iv, id: attachment.id });
  } catch (error) {
    throw error instanceof FileCryptoError ? new TransferError(error.message, error.code) : error;
  }
}

export async function deleteRemoteFile(clipboardId, fileId) {
  try {
    await fetch(`/api/file/${encodeURIComponent(clipboardId)}/${fileId}`, { method: "DELETE" });
  } catch {
    // Best effort. Anything left behind expires automatically after 7 days.
  }
}

export function saveBytes(bytes, name, mime = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFileName(name);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
