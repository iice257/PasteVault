// Who may change a clipboard, and when it deletes itself.
//
// A clipboard link opens and edits the clipboard, because the link is the key. A "view-only" lock
// adds a second secret, the write token: the server keeps only its hash and refuses changes that do
// not present the token. The token travels in the URL fragment (#w=...), which browsers never send
// to a server, and each device keeps the tokens it has been given in its own storage.

const tokenPattern = /^[A-Za-z0-9_-]{16,128}$/;
const eventName = "pastevault:share";

export const expireOptions = [
  { value: "never", label: "Never", ms: 0 },
  { value: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { value: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 }
];

const tokenKey = (id) => `pastevault:write-token:${id}`;
const lockKey = (id) => `pastevault:write-lock:${id}`;
const detachedKey = (id) => `pastevault:detached:${id}`;

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the lock then simply does not persist on this device.
  }
}

function announce(id) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: { id } }));
}

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createWriteToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function hashWriteToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

// What this device knows: the token it holds (with its hash) and the lock hash the server reported.
export function readShareState(id) {
  let held = null;
  try {
    const parsed = JSON.parse(read(tokenKey(id)) ?? "null");
    if (parsed && tokenPattern.test(parsed.token ?? "") && typeof parsed.hash === "string") held = parsed;
  } catch {
    held = null;
  }
  const lockHash = read(lockKey(id)) || "";
  const locked = Boolean(lockHash);
  return {
    locked,
    lockHash,
    token: held?.token ?? "",
    tokenHash: held?.hash ?? "",
    // Without a lock everyone can edit; with one, only a device whose token matches it.
    canEdit: !locked || (Boolean(held) && held.hash === lockHash)
  };
}

export async function rememberToken(id, token) {
  write(tokenKey(id), JSON.stringify({ token, hash: await hashWriteToken(token) }));
  announce(id);
}

export function forgetToken(id) {
  write(tokenKey(id), null);
  announce(id);
}

export function rememberLock(id, hash) {
  const next = hash || "";
  if ((read(lockKey(id)) || "") === next) return;
  write(lockKey(id), next || null);
  announce(id);
}

export function subscribeShare(id, listener) {
  const onEvent = (event) => {
    if (event.detail?.id === id) listener();
  };
  const onStorage = (event) => {
    if (event.key === tokenKey(id) || event.key === lockKey(id) || event.key === detachedKey(id)) listener();
  };
  window.addEventListener(eventName, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(eventName, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

export function buildViewLink(id) {
  return `${window.location.origin}/clip/${encodeURIComponent(id)}`;
}

export function buildEditLink(id, token) {
  return token ? `${buildViewLink(id)}#w=${token}` : buildViewLink(id);
}

export function tokenFromLink(value) {
  try {
    const hash = new URL(value, window.location.origin).hash;
    const token = new URLSearchParams(hash.replace(/^#/, "")).get("w") ?? "";
    return tokenPattern.test(token) ? token : "";
  } catch {
    return "";
  }
}

// An edit link carries the token in its fragment. Keep it on this device, then take it out of the address bar.
export async function takeTokenFromAddress(id) {
  const token = tokenFromLink(window.location.href);
  if (!token) return false;
  await rememberToken(id, token);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}

// --- delete after -------------------------------------------------------------------------------

export function expireMs(expireAfter) {
  return expireOptions.find((option) => option.value === expireAfter)?.ms ?? 0;
}

// The time a clipboard saved at `lastSavedAt` deletes itself, or 0 for never.
export function expiryTime(settings, lastSavedAt) {
  const ms = expireMs(settings?.expireAfter);
  const saved = new Date(lastSavedAt).getTime();
  return ms && Number.isFinite(saved) ? saved + ms : 0;
}

// --- device disconnect ----------------------------------------------------------------------------

export function isDetached(id) {
  return read(detachedKey(id)) === "1";
}

export function setDetached(id, detached) {
  write(detachedKey(id), detached ? "1" : null);
  announce(id);
}
