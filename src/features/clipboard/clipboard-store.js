export const defaultClipboardId = "clip_9f8a7b6c3d2e1f0a";
export const appVersion = 2;
export const maxImportBytes = 5 * 1024 * 1024;
export const storageBudgetBytes = 10 * 1024 * 1024;
export const pbkdf2Iterations = 210000;
export const formatOptions = ["Plain text", "JSON", "JavaScript", "cURL", "SQL", "HTML", "Markdown"];
export const sortOptions = ["Newest", "Oldest", "Largest", "Smallest", "Recently updated"];
export const filterOptions = ["All types", ...formatOptions, "CSV", "TXT", "JS"];

export const sampleJson = `{
  "name": "Alice Johnson",
  "email": "alice.johnson@example.com",
  "role": "admin",
  "isActive": true,
  "createdAt": "2024-05-16T14:22:31.123Z"
}`;

export function getClipboardId() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const match = path.match(/^\/clip\/([^/]+)$/);

  if (!match) {
    return defaultClipboardId;
  }

  try {
    const decoded = decodeURIComponent(match[1]).trim();
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(decoded)) {
      return defaultClipboardId;
    }
    return decoded;
  } catch {
    return defaultClipboardId;
  }
}

export function storageKey(clipboardId) {
  return `pastevault:clipboard:${clipboardId}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createClip({ title, content, format, pinned = false, starred = false, tags = [] }) {
  const timestamp = nowIso();
  return {
    id: `clip_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
    title: title.trim() || inferTitle(content, format),
    content,
    format,
    pinned,
    starred,
    tags,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSeedClips() {
  const seed = createClip({
    title: "Create user endpoint",
    content: sampleJson,
    format: "JSON",
    pinned: true,
    starred: true,
    tags: ["api", "users"]
  });

  const snippets = [
    ["Select users", "SELECT u.id, u.name, u.email FROM users u WHERE u.active = 1 ORDER BY u.created_at DESC;", "SQL", ["sql"]],
    ["cURL request", "curl -X POST https://api.example.com/v1/users \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"name\":\"Alice\"}'", "cURL", ["api"]],
    ["Export API client", "export const apiClient = axios.create({ baseURL: 'https://api.example.com', timeout: 10000 })", "JavaScript", ["client"]],
    ["Deploy command", "# Deploy to production\nnpm run build\nnpm run start", "Plain text", ["deploy"]],
    ["JWT token", "5f4dcc3b5aa765d61d8327deb882cf99", "Plain text", ["token"]]
  ];

  return [
    seed,
    ...snippets.map(([title, content, format, tags]) => createClip({ title, content, format, tags }))
  ];
}

export function createPlainRecord(clipboardId) {
  const clips = createSeedClips();
  return {
    version: appVersion,
    id: clipboardId,
    updatedAt: nowIso(),
    protection: null,
    payload: { clips, selectedId: clips[0]?.id ?? null }
  };
}

export function normalizeRecord(parsed, clipboardId) {
  if (!parsed || typeof parsed !== "object") {
    return createPlainRecord(clipboardId);
  }

  if (parsed.protection && parsed.encryptedPayload) {
    return {
      version: appVersion,
      id: clipboardId,
      protection: parsed.protection,
      encryptedPayload: parsed.encryptedPayload
    };
  }

  if (Array.isArray(parsed.payload?.clips)) {
    return {
      version: appVersion,
      id: clipboardId,
      protection: null,
      payload: {
        clips: parsed.payload.clips.map(normalizeClip).filter(Boolean),
        selectedId: parsed.payload.selectedId ?? parsed.payload.clips[0]?.id ?? null
      }
    };
  }

  return createPlainRecord(clipboardId);
}

export function normalizeClip(clip) {
  if (!clip || typeof clip !== "object" || typeof clip.content !== "string") {
    return null;
  }

  return {
    id: typeof clip.id === "string" ? clip.id : `clip_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
    title: typeof clip.title === "string" ? clip.title : inferTitle(clip.content, clip.format),
    content: clip.content,
    format: typeof clip.format === "string" ? clip.format : "Plain text",
    pinned: Boolean(clip.pinned),
    starred: Boolean(clip.starred),
    tags: Array.isArray(clip.tags) ? clip.tags.filter((tag) => typeof tag === "string").slice(0, 8) : [],
    createdAt: typeof clip.createdAt === "string" ? clip.createdAt : nowIso(),
    updatedAt: typeof clip.updatedAt === "string" ? clip.updatedAt : nowIso()
  };
}

export function saveRecord(clipboardId, record) {
  localStorage.setItem(storageKey(clipboardId), JSON.stringify(record));
}

export function loadRecord(clipboardId) {
  const raw = localStorage.getItem(storageKey(clipboardId));
  if (!raw) {
    const record = createPlainRecord(clipboardId);
    saveRecord(clipboardId, record);
    return record;
  }
  return normalizeRecord(JSON.parse(raw), clipboardId);
}

export function hydrateClipboard(clipboardId) {
  try {
    const hadLocalRecord = Boolean(localStorage.getItem(storageKey(clipboardId)));
    const record = loadRecord(clipboardId);
    if (record.protection) {
      return {
        clips: [],
        selectedId: null,
        draftTitle: "",
        draftContent: "",
        format: "JSON",
        locked: true,
        protection: record.protection,
        error: "",
        freshLocal: !hadLocalRecord,
        localUpdatedAt: record.updatedAt ?? nowIso()
      };
    }

    const selected = record.payload.clips.find((clip) => clip.id === record.payload.selectedId) ?? record.payload.clips[0] ?? null;
    return {
      clips: record.payload.clips,
      selectedId: selected?.id ?? null,
      draftTitle: selected?.title ?? "",
      draftContent: selected?.content ?? "",
      format: selected?.format ?? "JSON",
      locked: false,
      protection: null,
      error: "",
      freshLocal: !hadLocalRecord,
      localUpdatedAt: record.updatedAt ?? payloadUpdatedAt(record.payload)
    };
  } catch {
    const fallback = createPlainRecord(clipboardId);
    saveRecord(clipboardId, fallback);
    const selected = fallback.payload.clips[0];
    return {
      clips: fallback.payload.clips,
      selectedId: selected.id,
      draftTitle: selected.title,
      draftContent: selected.content,
      format: selected.format,
      locked: false,
      protection: null,
      error: "Clipboard data was corrupt, so PasteVault recovered a clean board.",
      freshLocal: true,
      localUpdatedAt: fallback.updatedAt
    };
  }
}

export function textBytes(text) {
  return new Blob([text]).size;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function inferTitle(content, format) {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  if (!firstLine) return `Untitled ${format}`;
  return firstLine.slice(0, 90);
}

export function formatAge(iso) {
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 15000) return "Just now";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  return `${Math.floor(delta / day)}d ago`;
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

export function validateContent(content, format) {
  if (!content.trim()) {
    return "Paste or type something before saving.";
  }
  if (format === "JSON") {
    try {
      JSON.parse(content);
    } catch (error) {
      return `Invalid JSON: ${error.message}`;
    }
  }
  return "";
}

export function arrayToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64ToArray(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function derivePasswordKey(password, saltBase64) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToArray(saltBase64),
      iterations: pbkdf2Iterations,
      hash: "SHA-256"
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptValue(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    iv: arrayToBase64(iv),
    data: arrayToBase64(new Uint8Array(encrypted))
  };
}

export async function decryptValue(payload, key) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArray(payload.iv) },
    key,
    base64ToArray(payload.data)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export async function buildProtectedRecord(clipboardId, payload, password) {
  const salt = arrayToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await derivePasswordKey(password, salt);
  return {
    key,
    record: {
      version: appVersion,
      id: clipboardId,
      updatedAt: nowIso(),
      protection: {
        salt,
        verifier: await encryptValue({ ok: true }, key)
      },
      encryptedPayload: await encryptValue(payload, key)
    }
  };
}

export function payloadUpdatedAt(payload) {
  const newestClipTime = payload?.clips?.reduce((newest, clip) => {
    const updatedAt = new Date(clip.updatedAt || clip.createdAt || 0).getTime();
    return Number.isFinite(updatedAt) ? Math.max(newest, updatedAt) : newest;
  }, 0) ?? 0;
  return new Date(newestClipTime || Date.now()).toISOString();
}

export async function buildLinkSyncRecord(clipboardId, payload) {
  const salt = arrayToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await derivePasswordKey(clipboardId, salt);
  return {
    version: appVersion,
    id: clipboardId,
    updatedAt: nowIso(),
    sync: {
      mode: "link",
      salt
    },
    encryptedPayload: await encryptValue(payload, key)
  };
}

export async function decryptLinkSyncRecord(record) {
  const key = await derivePasswordKey(record.id, record.sync.salt);
  return decryptValue(record.encryptedPayload, key);
}

export async function fetchRemoteRecord(clipboardId) {
  const response = await fetch(`/api/clip/${encodeURIComponent(clipboardId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Remote fetch failed with ${response.status}`);
  return response.json();
}

export async function pushRemoteRecord(clipboardId, record) {
  const response = await fetch(`/api/clip/${encodeURIComponent(clipboardId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });
  if (!response.ok) throw new Error(`Remote save failed with ${response.status}`);
}

export function storageUsageBytes() {
  let total = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) ?? "";
    const value = localStorage.getItem(key) ?? "";
    if (key.startsWith("pastevault:")) {
      total += textBytes(key) + textBytes(value);
    }
  }
  return total;
}

export function exportClipboard(clipboardId, payload) {
  const blob = new Blob([JSON.stringify({ clipboardId, exportedAt: nowIso(), ...payload }, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${clipboardId}-pastevault-export.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

