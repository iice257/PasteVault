import { clipboardIdPattern } from "./clipboard-store";

export const pairingCodeLength = 6;
export const pairingCodePattern = /^[A-HJ-KM-NP-Z2-9]{6}$/;

export function normalizePairingCode(value) {
  return String(value ?? "").replace(/[\s-]/g, "").toUpperCase().slice(0, pairingCodeLength);
}

export function buildClipboardUrl(clipboardId) {
  return `${window.location.origin}/clip/${encodeURIComponent(clipboardId)}`;
}

// Accepts a clipboard link, a /clip/ path, or a bare clipboard id and returns the id ("" if none).
export function parseClipboardTarget(value) {
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/^\/clip\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]).trim();
      return clipboardIdPattern.test(id) ? id : "";
    }
  } catch {
    // Not a URL; explicit route-like input and id-like strings are handled below.
  }

  const pathMatch = value.match(/^\/?clip\/([a-zA-Z0-9_-]{3,80})$/);
  if (pathMatch) return pathMatch[1];

  if (/^(\d{5}|pv_[a-zA-Z0-9_-]{16,75}|clip_[a-zA-Z0-9_-]{3,75}|[a-f0-9]{8,16})$/i.test(value) && clipboardIdPattern.test(value)) {
    return value;
  }

  return "";
}

export async function createPairingCode(clipboardId) {
  const response = await fetch("/api/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clipboardId })
  });
  if (!response.ok) {
    throw new Error(response.status === 429 ? "Too many codes. Wait a minute." : "Pairing is unavailable right now.");
  }
  return response.json();
}

export async function resolvePairingCode(code) {
  const response = await fetch(`/api/code/${encodeURIComponent(code)}`, { cache: "no-store" });
  if (response.status === 404) throw new Error("That code is invalid or has expired.");
  if (response.status === 429) throw new Error("Too many attempts. Wait a minute.");
  if (!response.ok) throw new Error("Pairing is unavailable right now.");
  const body = await response.json();
  if (!clipboardIdPattern.test(body?.clipboardId ?? "")) throw new Error("That code is invalid or has expired.");
  return body.clipboardId;
}
