import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  ClipboardCopy,
  Clock3,
  Database,
  Download,
  FileInput,
  FileText,
  Link2,
  Lock,
  MoreHorizontal,
  Paperclip,
  Pin,
  Search,
  Star,
  Sun,
  Tags,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { useTheme } from "./hooks/useTheme";

const defaultClipboardId = "clip_9f8a7b6c3d2e1f0a";
const appVersion = 2;
const maxImportBytes = 5 * 1024 * 1024;
const storageBudgetBytes = 10 * 1024 * 1024;
const pbkdf2Iterations = 210000;
const formatOptions = ["Plain text", "JSON", "JavaScript", "cURL", "SQL", "HTML", "Markdown"];
const sortOptions = ["Newest", "Oldest", "Largest", "Smallest", "Recently updated"];
const filterOptions = ["All types", ...formatOptions, "CSV", "TXT", "JS"];

const sampleJson = `{
  "name": "Alice Johnson",
  "email": "alice.johnson@example.com",
  "role": "admin",
  "isActive": true,
  "createdAt": "2024-05-16T14:22:31.123Z"
}`;

function getClipboardId() {
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

function storageKey(clipboardId) {
  return `pastevault:clipboard:${clipboardId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createClip({ title, content, format, pinned = false, starred = false, tags = [] }) {
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

function createSeedClips() {
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

function createPlainRecord(clipboardId) {
  const clips = createSeedClips();
  return {
    version: appVersion,
    id: clipboardId,
    updatedAt: nowIso(),
    protection: null,
    payload: { clips, selectedId: clips[0]?.id ?? null }
  };
}

function normalizeRecord(parsed, clipboardId) {
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

function normalizeClip(clip) {
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

function saveRecord(clipboardId, record) {
  localStorage.setItem(storageKey(clipboardId), JSON.stringify(record));
}

function loadRecord(clipboardId) {
  const raw = localStorage.getItem(storageKey(clipboardId));
  if (!raw) {
    const record = createPlainRecord(clipboardId);
    saveRecord(clipboardId, record);
    return record;
  }
  return normalizeRecord(JSON.parse(raw), clipboardId);
}

function hydrateClipboard(clipboardId) {
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

function textBytes(text) {
  return new Blob([text]).size;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferTitle(content, format) {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  if (!firstLine) return `Untitled ${format}`;
  return firstLine.slice(0, 90);
}

function formatAge(iso) {
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 15000) return "Just now";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  return `${Math.floor(delta / day)}d ago`;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function validateContent(content, format) {
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

function arrayToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToArray(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function derivePasswordKey(password, saltBase64) {
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

async function encryptValue(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    iv: arrayToBase64(iv),
    data: arrayToBase64(new Uint8Array(encrypted))
  };
}

async function decryptValue(payload, key) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArray(payload.iv) },
    key,
    base64ToArray(payload.data)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function buildProtectedRecord(clipboardId, payload, password) {
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

function payloadUpdatedAt(payload) {
  const newestClipTime = payload?.clips?.reduce((newest, clip) => {
    const updatedAt = new Date(clip.updatedAt || clip.createdAt || 0).getTime();
    return Number.isFinite(updatedAt) ? Math.max(newest, updatedAt) : newest;
  }, 0) ?? 0;
  return new Date(newestClipTime || Date.now()).toISOString();
}

async function buildLinkSyncRecord(clipboardId, payload) {
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

async function decryptLinkSyncRecord(record) {
  const key = await derivePasswordKey(record.id, record.sync.salt);
  return decryptValue(record.encryptedPayload, key);
}

async function fetchRemoteRecord(clipboardId) {
  const response = await fetch(`/api/clip/${encodeURIComponent(clipboardId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Remote fetch failed with ${response.status}`);
  return response.json();
}

async function pushRemoteRecord(clipboardId, record) {
  const response = await fetch(`/api/clip/${encodeURIComponent(clipboardId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });
  if (!response.ok) throw new Error(`Remote save failed with ${response.status}`);
}

function storageUsageBytes() {
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

function exportClipboard(clipboardId, payload) {
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

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") {
    return <LandingExperience />;
  }

  return <ClipboardApp clipboardId={getClipboardId()} />;
}

function LandingExperience() {
  const [entry, setEntry] = useState("");

  const openClipboard = useCallback((overrideValue) => {
    const value = (overrideValue ?? entry).trim();
    if (!value) {
      window.location.href = `/clip/${defaultClipboardId}`;
      return;
    }

    const linkMatch = value.match(/(?:\/clip\/|^)([a-zA-Z0-9_-]{3,80})$/);
    if (linkMatch && value.length <= 140) {
      window.location.href = `/clip/${encodeURIComponent(linkMatch[1])}`;
      return;
    }

    const clipboardId = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const format = value.startsWith("{") || value.startsWith("[") ? "JSON" : "Plain text";
    const clip = createClip({ title: inferTitle(value, format), content: value, format, pinned: true });
    saveRecord(clipboardId, {
      version: appVersion,
      id: clipboardId,
      updatedAt: nowIso(),
      protection: null,
      payload: { clips: [clip], selectedId: clip.id }
    });
    window.location.href = `/clip/${clipboardId}`;
  }, [entry]);

  return (
    <div className="vault-landing">
      <main className="landing-core">
        <LogoMark size="large" />
        <h1>The fastest way to<br />move text between devices</h1>
        <p>Paste once. Open the link anywhere. Optional password. No account.</p>
        <form
          className="landing-input-shell"
          onSubmit={(event) => {
            event.preventDefault();
            openClipboard();
          }}
        >
          <Clipboard size={25} />
          <input
            value={entry}
            placeholder="Paste something or enter a clipboard link"
            onChange={(event) => setEntry(event.target.value)}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (pasted.trim()) {
                event.preventDefault();
                setEntry(pasted);
                window.setTimeout(() => openClipboard(pasted), 0);
              }
            }}
          />
          <Button variant="primary" type="submit">
            Open clipboard
            <ArrowRight size={24} />
          </Button>
        </form>
      </main>
    </div>
  );
}

function ClipboardApp({ clipboardId }) {
  const { isDark, toggleTheme } = useTheme();
  const searchRef = useRef(null);
  const fileRef = useRef(null);
  const passwordRef = useRef(null);
  const [initialState] = useState(() => hydrateClipboard(clipboardId));
  const [format, setFormat] = useState(initialState.format);
  const [sort, setSort] = useState("Newest");
  const [filter, setFilter] = useState("All types");
  const [mode, setMode] = useState("Clipboard");
  const [clips, setClips] = useState(initialState.clips);
  const [selectedId, setSelectedId] = useState(initialState.selectedId);
  const [draftTitle, setDraftTitle] = useState(initialState.draftTitle);
  const [draftContent, setDraftContent] = useState(initialState.draftContent);
  const [search, setSearch] = useState("");
  const [newTag, setNewTag] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState(initialState.error);
  const [locked, setLocked] = useState(initialState.locked);
  const [protection, setProtection] = useState(initialState.protection);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordAcknowledged, setPasswordAcknowledged] = useState(false);
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  const [activeUtilityTab, setActiveUtilityTab] = useState("Details");
  const [activeDashboardTab, setActiveDashboardTab] = useState("Editor");
  const [cryptoKey, setCryptoKey] = useState(null);
  const [storageUsage, setStorageUsage] = useState(() => storageUsageBytes());
  const [syncStatus, setSyncStatus] = useState(initialState.freshLocal ? "Local ready" : "Local saved");
  const shortClipboardId = clipboardId.length > 12 ? `${clipboardId.slice(0, 12)}...` : clipboardId;

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedId) ?? clips[0] ?? null,
    [clips, selectedId]
  );

  const selectClip = useCallback((clipId) => {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return;
    setSelectedId(clip.id);
    setDraftTitle(clip.title);
    setDraftContent(clip.content);
    setFormat(clip.format);
    setError("");
  }, [clips]);

  const payload = useMemo(() => ({ clips, selectedId: selectedClip?.id ?? null }), [clips, selectedClip?.id]);
  const startupSyncRef = useRef({
    freshLocal: initialState.freshLocal,
    localUpdatedAt: initialState.localUpdatedAt,
    payload,
    protection
  });

  const persistPayload = useCallback(async (nextPayload, nextProtection = protection, nextKey = cryptoKey) => {
    try {
      if (nextProtection) {
        if (!nextKey) {
          setError("Unlock this clipboard before saving protected changes.");
          return false;
        }
        const protectedRecord = {
          version: appVersion,
          id: clipboardId,
          updatedAt: nowIso(),
          protection: nextProtection,
          encryptedPayload: await encryptValue(nextPayload, nextKey)
        };
        saveRecord(clipboardId, protectedRecord);
        void pushRemoteRecord(clipboardId, protectedRecord)
          .then(() => setSyncStatus("Cloud saved"))
          .catch(() => setSyncStatus("Local saved"));
      } else {
        const localRecord = {
          version: appVersion,
          id: clipboardId,
          updatedAt: nowIso(),
          protection: null,
          payload: nextPayload
        };
        saveRecord(clipboardId, localRecord);
        void buildLinkSyncRecord(clipboardId, nextPayload)
          .then((syncRecord) => pushRemoteRecord(clipboardId, syncRecord))
          .then(() => setSyncStatus("Cloud saved"))
          .catch(() => setSyncStatus("Local saved"));
      }
      setStorageUsage(storageUsageBytes());
      return true;
    } catch (saveError) {
      const isQuotaError = saveError instanceof DOMException && saveError.name === "QuotaExceededError";
      setError(isQuotaError ? "Browser storage is full. Export or delete clips before saving more." : "PasteVault could not save this clipboard.");
      return false;
    }
  }, [clipboardId, cryptoKey, protection]);

  const replaceClips = useCallback(async (updater, nextSelectedId = selectedId) => {
    const nextClips = typeof updater === "function" ? updater(clips) : updater;
    const safeSelectedId = nextClips.some((clip) => clip.id === nextSelectedId) ? nextSelectedId : nextClips[0]?.id ?? null;
    const nextSelected = nextClips.find((clip) => clip.id === safeSelectedId) ?? null;
    const didPersist = await persistPayload({ clips: nextClips, selectedId: safeSelectedId });
    if (!didPersist) return;
    setClips(nextClips);
    setSelectedId(safeSelectedId);
    if (nextSelected) {
      setDraftTitle(nextSelected.title);
      setDraftContent(nextSelected.content);
      setFormat(nextSelected.format);
    } else {
      setDraftTitle("");
      setDraftContent("");
      setFormat("Plain text");
    }
  }, [clips, persistPayload, selectedId]);

  useEffect(() => {
    let active = true;

    async function syncRemoteClipboard() {
      try {
        const remote = await fetchRemoteRecord(clipboardId);
        if (!active) return;

        if (!remote) {
          const startup = startupSyncRef.current;
          const syncRecord = startup.protection
            ? null
            : await buildLinkSyncRecord(clipboardId, startup.payload);
          if (syncRecord) {
            await pushRemoteRecord(clipboardId, syncRecord);
            if (active) setSyncStatus("Cloud saved");
          }
          return;
        }

        const startup = startupSyncRef.current;
        const remoteUpdatedAt = new Date(remote.updatedAt || 0).getTime();
        const localUpdatedAt = new Date(startup.localUpdatedAt || 0).getTime();
        const shouldUseRemote = startup.freshLocal || remoteUpdatedAt > localUpdatedAt;

        if (!shouldUseRemote) {
          if (!startup.protection) {
            await pushRemoteRecord(clipboardId, await buildLinkSyncRecord(clipboardId, startup.payload));
            if (active) setSyncStatus("Cloud saved");
          }
          return;
        }

        if (remote.sync?.mode === "link") {
          const remotePayload = await decryptLinkSyncRecord(remote);
          const normalizedClips = remotePayload.clips.map(normalizeClip).filter(Boolean);
          const nextSelected = normalizedClips.find((clip) => clip.id === remotePayload.selectedId) ?? normalizedClips[0] ?? null;
          saveRecord(clipboardId, {
            version: appVersion,
            id: clipboardId,
            updatedAt: remote.updatedAt ?? nowIso(),
            protection: null,
            payload: { clips: normalizedClips, selectedId: nextSelected?.id ?? null }
          });
          if (!active) return;
          setProtection(null);
          setLocked(false);
          setCryptoKey(null);
          setClips(normalizedClips);
          setSelectedId(nextSelected?.id ?? null);
          setDraftTitle(nextSelected?.title ?? "");
          setDraftContent(nextSelected?.content ?? "");
          setFormat(nextSelected?.format ?? "JSON");
          setSyncStatus("Cloud synced");
        } else if (remote.protection && remote.encryptedPayload) {
          saveRecord(clipboardId, remote);
          if (!active) return;
          setProtection(remote.protection);
          setLocked(true);
          setCryptoKey(null);
          setClips([]);
          setSelectedId(null);
          setDraftTitle("");
          setDraftContent("");
          setSyncStatus("Cloud locked");
        }
      } catch {
        if (active) setSyncStatus("Local saved");
      }
    }

    void syncRemoteClipboard();
    return () => {
      active = false;
    };
  }, [clipboardId]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === storageKey(clipboardId)) {
        window.location.reload();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [clipboardId]);

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(window.__pastevaultToast);
    window.__pastevaultToast = window.setTimeout(() => setToast(""), 3200);
  }, []);

  const handleSave = useCallback(async () => {
    const validation = validateContent(draftContent, format);
    if (validation) {
      setError(validation);
      return;
    }

    const duplicate = clips.find(
      (clip) => clip.id !== selectedClip?.id && clip.content === draftContent && clip.format === format
    );
    if (duplicate) {
      selectClip(duplicate.id);
      showToast("Duplicate found, existing clip selected");
      return;
    }

    const timestamp = nowIso();
    const nextClip = selectedClip
      ? {
          ...selectedClip,
          title: draftTitle.trim() || inferTitle(draftContent, format),
          content: draftContent,
          format,
          updatedAt: timestamp
        }
      : createClip({ title: draftTitle, content: draftContent, format });

    const nextClips = selectedClip
      ? clips.map((clip) => (clip.id === selectedClip.id ? nextClip : clip))
      : [nextClip, ...clips];

    setError("");
    await replaceClips(nextClips, nextClip.id);
    showToast("Clip saved successfully");
  }, [clips, draftContent, draftTitle, format, replaceClips, selectedClip, selectClip, showToast]);

  useEffect(() => {
    const handleKeydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
      if (event.key === "/" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleSave]);

  const handleNewClip = useCallback(() => {
    setSelectedId(null);
    setDraftTitle("");
    setDraftContent("");
    setFormat("Plain text");
    setError("");
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setDraftContent(text);
      if (!draftTitle.trim()) setDraftTitle(inferTitle(text, format));
      showToast("Clipboard pasted");
    } catch {
      setError("Browser clipboard read was blocked. Use Ctrl+V inside the editor.");
    }
  }, [draftTitle, format, showToast]);

  const handleCopy = useCallback(async (clip = selectedClip) => {
    if (!clip) return;
    try {
      await copyText(clip.content);
      showToast("Clip copied");
    } catch {
      setError("Browser clipboard write was blocked.");
    }
  }, [selectedClip, showToast]);

  const handleCopyLatest = useCallback(async () => {
    const latest = [...clips].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    await handleCopy(latest);
  }, [clips, handleCopy]);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/clip/${encodeURIComponent(clipboardId)}`;
    try {
      await copyText(url);
      showToast("Clipboard link copied");
    } catch {
      setError("Could not copy the clipboard link.");
    }
  }, [clipboardId, showToast]);

  const handleDelete = useCallback(async () => {
    if (!selectedClip) return;
    const nextClips = clips.filter((clip) => clip.id !== selectedClip.id);
    await replaceClips(nextClips, nextClips[0]?.id ?? null);
    showToast("Clip deleted");
  }, [clips, replaceClips, selectedClip, showToast]);

  const toggleSelectedFlag = useCallback(async (flag) => {
    if (!selectedClip) return;
    await replaceClips(
      clips.map((clip) => (clip.id === selectedClip.id ? { ...clip, [flag]: !clip[flag], updatedAt: nowIso() } : clip)),
      selectedClip.id
    );
  }, [clips, replaceClips, selectedClip]);

  const handleAddTag = useCallback(async () => {
    const tag = newTag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
    if (!tag || !selectedClip || selectedClip.tags.includes(tag)) {
      setNewTag("");
      return;
    }
    await replaceClips(
      clips.map((clip) => (clip.id === selectedClip.id ? { ...clip, tags: [...clip.tags, tag], updatedAt: nowIso() } : clip)),
      selectedClip.id
    );
    setNewTag("");
  }, [clips, newTag, replaceClips, selectedClip]);

  const handleRemoveTag = useCallback(async (tag) => {
    if (!selectedClip) return;
    await replaceClips(
      clips.map((clip) => (clip.id === selectedClip.id ? { ...clip, tags: clip.tags.filter((item) => item !== tag), updatedAt: nowIso() } : clip)),
      selectedClip.id
    );
  }, [clips, replaceClips, selectedClip]);

  const handleImportFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > maxImportBytes) {
      setError("Import limit is 5 MB per file.");
      return;
    }

    const text = await file.text();
    let imported = [];
    if (file.name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        const candidates = Array.isArray(parsed.clips) ? parsed.clips : Array.isArray(parsed) ? parsed : [];
        imported = candidates.map(normalizeClip).filter(Boolean);
      } catch {
        imported = [createClip({ title: file.name, content: text, format: "JSON", tags: ["import"] })];
      }
    } else {
      imported = [createClip({ title: file.name, content: text, format: file.name.endsWith(".csv") ? "CSV" : "Plain text", tags: ["import"] })];
    }

    if (!imported.length) {
      setError("No valid clips found in import.");
      return;
    }

    const existing = new Set(clips.map((clip) => `${clip.format}:${clip.content}`));
    const fresh = imported.filter((clip) => !existing.has(`${clip.format}:${clip.content}`));
    await replaceClips([...fresh, ...clips], fresh[0]?.id ?? selectedId);
    showToast(`Imported ${fresh.length || imported.length} clip${fresh.length === 1 ? "" : "s"}`);
  }, [clips, replaceClips, selectedId, showToast]);

  const handleUnlock = useCallback(async () => {
    if (!protection) return;
    try {
      const key = await derivePasswordKey(passwordInput, protection.salt);
      await decryptValue(protection.verifier, key);
      const record = loadRecord(clipboardId);
      const decrypted = await decryptValue(record.encryptedPayload, key);
      const normalized = {
        clips: decrypted.clips.map(normalizeClip).filter(Boolean),
        selectedId: decrypted.selectedId
      };
      const nextSelected = normalized.clips.find((clip) => clip.id === normalized.selectedId) ?? normalized.clips[0] ?? null;
      setCryptoKey(key);
      setLocked(false);
      setClips(normalized.clips);
      setSelectedId(nextSelected?.id ?? null);
      setDraftTitle(nextSelected?.title ?? "");
      setDraftContent(nextSelected?.content ?? "");
      setFormat(nextSelected?.format ?? "JSON");
      setPasswordInput("");
      setPasswordPanelOpen(false);
      showToast("Clipboard unlocked");
    } catch {
      setError("Password did not unlock this clipboard.");
    }
  }, [clipboardId, passwordInput, protection, showToast]);

  const handleSetPassword = useCallback(async () => {
    if (passwordInput.length < 8) {
      setError("Use at least 8 characters for the clipboard password.");
      return;
    }
    if (passwordInput !== passwordConfirm) {
      setError("Password confirmation does not match.");
      return;
    }
    if (!passwordAcknowledged) {
      setError("Confirm that this password cannot be recovered.");
      return;
    }
    try {
      const latestRecord = loadRecord(clipboardId);
      const latestPayload = latestRecord.payload ?? payload;
      const protectedRecord = await buildProtectedRecord(clipboardId, latestPayload, passwordInput);
      saveRecord(clipboardId, protectedRecord.record);
      void pushRemoteRecord(clipboardId, protectedRecord.record)
        .then(() => setSyncStatus("Cloud saved"))
        .catch(() => setSyncStatus("Local saved"));
      setCryptoKey(protectedRecord.key);
      setProtection(protectedRecord.record.protection);
      setLocked(false);
      setPasswordInput("");
      setPasswordConfirm("");
      setPasswordAcknowledged(false);
      setPasswordPanelOpen(false);
      setStorageUsage(storageUsageBytes());
      showToast("Password enabled");
    } catch {
      setError("PasteVault could not enable password protection for this clipboard.");
    }
  }, [clipboardId, passwordAcknowledged, passwordConfirm, passwordInput, payload, showToast]);

  const handleRemovePassword = useCallback(async () => {
    if (!protection || locked) return;
    const record = { version: appVersion, id: clipboardId, updatedAt: nowIso(), protection: null, payload };
    try {
      saveRecord(clipboardId, record);
      setProtection(null);
      setCryptoKey(null);
      setPasswordInput("");
      setPasswordConfirm("");
      setPasswordAcknowledged(false);
      setStorageUsage(storageUsageBytes());
      void buildLinkSyncRecord(clipboardId, payload)
        .then((syncRecord) => pushRemoteRecord(clipboardId, syncRecord))
        .then(() => setSyncStatus("Cloud saved"))
        .catch(() => setSyncStatus("Local saved"));
      showToast("Password removed");
    } catch {
      setError("PasteVault could not remove password protection.");
    }
  }, [clipboardId, locked, payload, protection, showToast]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byMode = clips.filter((clip) => {
      if (mode === "Starred") return clip.starred;
      return true;
    });
    const byFilter = filter === "All types" ? byMode : byMode.filter((clip) => clip.format === filter || clip.format.toUpperCase() === filter);
    const bySearch = query
      ? byFilter.filter((clip) => [clip.title, clip.content, clip.format, ...clip.tags].join(" ").toLowerCase().includes(query))
      : byFilter;

    return [...bySearch].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === "Oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === "Largest") return textBytes(b.content) - textBytes(a.content);
      if (sort === "Smallest") return textBytes(a.content) - textBytes(b.content);
      if (sort === "Recently updated") return new Date(b.updatedAt) - new Date(a.updatedAt);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [clips, filter, mode, search, sort]);

  const stats = useMemo(() => {
    const bytes = selectedClip ? textBytes(selectedClip.content) : textBytes(draftContent);
    const content = selectedClip?.content ?? draftContent;
    return {
      bytes,
      lines: content ? content.split(/\r?\n/).length : 0,
      characters: content.length,
      storagePercent: Math.min(100, Math.round((storageUsage / storageBudgetBytes) * 100))
    };
  }, [draftContent, selectedClip, storageUsage]);

  return (
    <Shell isDark={isDark}>
      <div className="vault-app dashboard-app">
        <Sidebar
          mode={mode}
          setMode={setMode}
          onImport={() => fileRef.current?.click()}
          onExport={() => exportClipboard(clipboardId, payload)}
          storageUsage={storageUsage}
          storagePercent={stats.storagePercent}
        />
        <div className="dashboard-content">
          <Header
            isDark={isDark}
            onThemeChange={toggleTheme}
            onCopyLink={handleCopyLink}
            onImport={() => fileRef.current?.click()}
            onExport={() => exportClipboard(clipboardId, payload)}
            search={search}
            setSearch={setSearch}
            searchRef={searchRef}
            syncStatus={syncStatus}
            passwordPanelOpen={passwordPanelOpen}
            setPasswordPanelOpen={setPasswordPanelOpen}
            passwordInput={passwordInput}
            setPasswordInput={setPasswordInput}
            passwordConfirm={passwordConfirm}
            setPasswordConfirm={setPasswordConfirm}
            passwordAcknowledged={passwordAcknowledged}
            setPasswordAcknowledged={setPasswordAcknowledged}
            passwordRef={passwordRef}
            locked={locked}
            protection={protection}
            onUnlock={handleUnlock}
            onSetPassword={handleSetPassword}
            onRemovePassword={handleRemovePassword}
          />
          <main className="vault-app-main dashboard-main">
            {locked ? (
              <PasswordGate passwordInput={passwordInput} setPasswordInput={setPasswordInput} onUnlock={handleUnlock} error={error} />
            ) : (
              <div className="dashboard-body">
                <section className="dashboard-workspace">
                  <section className="vault-clipboard-card">
                    <div className="vault-card-head">
                      <div>
                        <h1>{shortClipboardId}</h1>
                        <p>
                          <span className="status-dot" /> Saved
                          <span /> {format}
                          <span /> {formatBytes(stats.bytes)}
                          <span /> <Lock size={13} /> {protection ? "Password enabled" : "Password optional"}
                        </p>
                      </div>
                      <div className="vault-card-actions">
                        <span><Check size={17} /> {syncStatus}</span>
                        <Button variant="primary" onClick={handleSave}>
                          <Archive size={16} />
                          Save
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" aria-label="More actions"><MoreHorizontal size={22} /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="utility-menu" align="end">
                            <DropdownMenuItem onSelect={handleNewClip}>New clip</DropdownMenuItem>
                            <DropdownMenuItem onSelect={handlePaste}>Paste from system clipboard</DropdownMenuItem>
                            <DropdownMenuItem onSelect={handleCopyLatest}>Copy latest</DropdownMenuItem>
                            <DropdownMenuItem onSelect={handleCopyLink}>Copy link</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>Import file</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => exportClipboard(clipboardId, payload)}>Export board</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleSelectedFlag("pinned")}>{selectedClip?.pinned ? "Unpin selected" : "Pin selected"}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleSelectedFlag("starred")}>{selectedClip?.starred ? "Unstar selected" : "Star selected"}</DropdownMenuItem>
                            <DropdownMenuItem className="danger-item" onSelect={handleDelete}>Delete selected</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <DashboardTabs
                      activeTab={activeDashboardTab}
                      setActiveTab={setActiveDashboardTab}
                      total={clips.length}
                      onHistory={() => searchRef.current?.focus()}
                    />
                    <div className="dashboard-editor-region">
                      <EditorCard
                        clipboardId={clipboardId}
                        draftTitle={draftTitle}
                        setDraftTitle={setDraftTitle}
                        draftContent={draftContent}
                        setDraftContent={setDraftContent}
                        format={format}
                        setFormat={setFormat}
                        selectedClip={selectedClip}
                        stats={stats}
                        error={error}
                        isDark={isDark}
                        onSave={handleSave}
                        onNew={handleNewClip}
                        onPaste={handlePaste}
                        onCopyLatest={handleCopyLatest}
                        onCopyLink={handleCopyLink}
                      />
                      <UtilityTabs
                        activeTab={activeUtilityTab}
                        setActiveTab={setActiveUtilityTab}
                        clipboardId={clipboardId}
                        clip={selectedClip}
                        stats={stats}
                        storageUsage={storageUsage}
                        storagePercent={stats.storagePercent}
                        protection={protection}
                        locked={locked}
                        newTag={newTag}
                        setNewTag={setNewTag}
                        onAddTag={handleAddTag}
                        onRemoveTag={handleRemoveTag}
                        onCopy={() => handleCopy(selectedClip)}
                        onCopyLink={handleCopyLink}
                        onDelete={handleDelete}
                        onTogglePin={() => toggleSelectedFlag("pinned")}
                        onToggleStar={() => toggleSelectedFlag("starred")}
                        onImport={() => fileRef.current?.click()}
                        onExport={() => exportClipboard(clipboardId, payload)}
                      />
                    </div>
                  </section>
                  <div className="vault-history-row">
                    <HistoryPanel
                      items={filteredItems}
                      selectedId={selectedClip?.id}
                      sort={sort}
                      setSort={setSort}
                      filter={filter}
                      setFilter={setFilter}
                      search={search}
                      setSearch={setSearch}
                      searchRef={searchRef}
                      total={clips.length}
                      isDark={isDark}
                      onSelect={selectClip}
                      onToggleStar={(clip) => replaceClips(clips.map((item) => item.id === clip.id ? { ...item, starred: !item.starred } : item), clip.id)}
                    />
                  </div>
                  <div className="vault-bottom-composer">
                    <input
                      value={draftContent}
                      placeholder="Paste or type..."
                      onChange={(event) => setDraftContent(event.target.value)}
                    />
                    <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach file">
                      <Paperclip size={31} />
                    </button>
                    <Button variant="primary" onClick={handleSave}>Save</Button>
                  </div>
                </section>
                <DetailsPanel
                  clipboardId={clipboardId}
                  clip={selectedClip}
                  isDark={isDark}
                  onCopy={() => handleCopy(selectedClip)}
                  onCopyLink={handleCopyLink}
                  onDelete={handleDelete}
                  onTogglePin={() => toggleSelectedFlag("pinned")}
                  onToggleStar={() => toggleSelectedFlag("starred")}
                  newTag={newTag}
                  setNewTag={setNewTag}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                />
              </div>
            )}
          </main>
        </div>
        <input ref={fileRef} type="file" accept=".txt,.json,.csv,.md,.html" className="file-input" onChange={handleImportFile} />
        {toast && (
          <div className="toast" role="status">
            <Check size={20} />
            <span>{toast}</span>
            <button type="button" onClick={() => setToast("")} aria-label="Dismiss toast">
              <X size={18} />
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, isDark }) {
  return (
    <div className={isDark ? "theme-dark vault-theme" : "theme-light vault-theme"}>
      {children}
    </div>
  );
}

function LogoMark({ size = "default" }) {
  return (
    <div className={`vault-logo ${size === "large" ? "large" : ""}`}>
      <span><Clipboard size={size === "large" ? 36 : 27} /></span>
      <strong>PasteVault</strong>
    </div>
  );
}

function Sidebar({ mode, setMode, onImport, onExport, storageUsage, storagePercent }) {
  const items = [
    { icon: Clipboard, label: "Clipboard", action: () => setMode("Clipboard") },
    { icon: Clock3, label: "History", action: () => setMode("History") },
    { icon: Star, label: "Starred", action: () => setMode("Starred") },
    { icon: Download, label: "Imports", action: onImport },
    { icon: Upload, label: "Exports", action: onExport }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <LogoMark />
      </div>
      <div className="sidebar-top">
        {items.map((item) => (
          <button className={`nav-item ${mode === item.label ? "active" : ""}`} key={item.label} type="button" onClick={item.action}>
            <item.icon size={22} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <div className="storage-card">
          <span>Storage</span>
          <strong>{formatBytes(storageUsage)} <em>/ 10 MB</em></strong>
          <div className="storage-track">
            <div style={{ width: `${Math.max(3, storagePercent)}%` }} />
          </div>
          <button type="button">Local only</button>
        </div>
      </div>
    </aside>
  );
}

function Header({
  isDark,
  onThemeChange,
  onCopyLink,
  onImport,
  onExport,
  search,
  setSearch,
  searchRef,
  syncStatus,
  passwordPanelOpen,
  setPasswordPanelOpen,
  passwordInput,
  setPasswordInput,
  passwordConfirm,
  setPasswordConfirm,
  passwordAcknowledged,
  setPasswordAcknowledged,
  passwordRef,
  locked,
  protection,
  onUnlock,
  onSetPassword,
  onRemovePassword
}) {
  return (
    <header className="header">
      <label className="dashboard-search">
        <Search size={19} />
        <input ref={searchRef} value={search} placeholder="Search clips, keywords, tags..." onChange={(event) => setSearch(event.target.value)} />
        <kbd>⌘ K</kbd>
      </label>
      <div className="header-actions">
        <span className="saved-state">
          <Check size={18} />
          {syncStatus}
        </span>
        <Button onClick={onCopyLink}>
          <Link2 size={17} />
          Copy link
        </Button>
        <div className="password-wrap">
          <button
            className="password-pill"
            type="button"
            aria-expanded={passwordPanelOpen}
            onClick={() => {
              setPasswordPanelOpen(!passwordPanelOpen);
              window.setTimeout(() => passwordRef.current?.focus(), 0);
            }}
          >
            <Lock size={16} />
            {protection ? (locked ? "Unlock" : "Password on") : "Password optional"}
          </button>
          {passwordPanelOpen && (
            <div
              className="password-popover"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setPasswordPanelOpen(false);
                }
              }}
            >
              <label>
                <span>{protection ? "Clipboard password" : "Set password"}</span>
                <input
                  ref={passwordRef}
                  type="password"
                  value={passwordInput}
                  placeholder="8+ characters"
                  onChange={(event) => setPasswordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void (locked ? onUnlock() : onSetPassword());
                  }}
                />
              </label>
              {!protection && (
                <>
                  <label>
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={passwordConfirm}
                      placeholder="Repeat password"
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                    />
                  </label>
                  <label className="password-warning">
                    <input
                      type="checkbox"
                      checked={passwordAcknowledged}
                      onChange={(event) => setPasswordAcknowledged(event.target.checked)}
                    />
                    <span>I understand this password cannot be recovered.</span>
                  </label>
                </>
              )}
              <div>
                {protection && locked ? <Button onClick={onUnlock}>Unlock</Button> : null}
                {!protection ? <Button onClick={onSetPassword}>Enable</Button> : null}
                {protection && !locked ? <Button onClick={onRemovePassword}>Remove</Button> : null}
                <Button onClick={() => setPasswordPanelOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="round-action theme-menu-trigger" type="button" aria-label="Theme menu" aria-pressed={!isDark}>
              <Sun size={20} />
              <span>Theme</span>
              <ChevronDown size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="utility-menu" align="end">
            <DropdownMenuItem active={!isDark} onSelect={() => { if (isDark) onThemeChange(); }}>Light</DropdownMenuItem>
            <DropdownMenuItem active={isDark} onSelect={() => { if (!isDark) onThemeChange(); }}>Dark</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="round-action" type="button" aria-label="Top bar more actions">
              <MoreHorizontal size={20} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="utility-menu" align="end">
            <DropdownMenuItem onSelect={onImport}>Import file</DropdownMenuItem>
            <DropdownMenuItem onSelect={onExport}>Export board</DropdownMenuItem>
            <DropdownMenuItem onSelect={onCopyLink}>Copy share link</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button className="round-action compact-theme-toggle" type="button" onClick={onThemeChange} aria-label="Toggle theme" aria-pressed={!isDark} title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
          <Sun size={22} />
        </button>
      </div>
    </header>
  );
}

function DashboardTabs({ activeTab, setActiveTab, total, onHistory }) {
  const tabs = [
    { label: "Editor" },
    { label: "History", count: total },
    { label: "Details" },
    { label: "Tools" }
  ];

  return (
    <nav className="dashboard-tabs" role="tablist" aria-label="Clipboard workspace sections">
      {tabs.map((tab) => (
        <button
          className={activeTab === tab.label ? "active" : ""}
          key={tab.label}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.label}
          onClick={() => {
            setActiveTab(tab.label);
            if (tab.label === "History") window.setTimeout(onHistory, 0);
          }}
        >
          {tab.label}
          {typeof tab.count === "number" && <span>{tab.count}</span>}
        </button>
      ))}
    </nav>
  );
}

function PasswordGate({ passwordInput, setPasswordInput, onUnlock, error }) {
  return (
    <section className="password-gate">
      <Lock size={30} />
      <h2>This clipboard is password protected</h2>
      <p>Enter the optional password for this clipboard id to decrypt the saved clips on this device.</p>
      <input type="password" value={passwordInput} placeholder="Clipboard password" onChange={(event) => setPasswordInput(event.target.value)} />
      <Button variant="primary" onClick={onUnlock}>Unlock clipboard</Button>
      {error && <span className="inline-error">{error}</span>}
    </section>
  );
}

function EditorCard({
  clipboardId,
  draftTitle,
  setDraftTitle,
  draftContent,
  setDraftContent,
  format,
  setFormat,
  selectedClip,
  stats,
  error,
  isDark,
  onSave,
  onNew,
  onPaste,
  onCopyLatest,
  onCopyLink
}) {
  const lines = Math.max(1, draftContent.split(/\r?\n/).length);

  return (
    <section className="editor-card">
      {isDark && (
        <label className="title-field">
          <span>Clipboard title</span>
          <div>
            <input value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} />
            <em>{draftTitle.length} / 120</em>
          </div>
        </label>
      )}
      <div className="link-context">
        <label>
          <span>Clipboard ID</span>
          <input value={clipboardId} readOnly />
        </label>
        <label>
          <span>Password</span>
          <input value="" readOnly placeholder="Optional" />
        </label>
      </div>
      {!isDark && (
        <label className="title-field light-title-field">
          <span>Clipboard title</span>
          <div>
            <input value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} />
            <em>{draftTitle.length} / 120</em>
          </div>
        </label>
      )}
      <div className="section-title-row">
        <h2>{selectedClip ? "Edit clip" : "Paste anything"}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="select-trigger" type="button">
              {format}
              <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="format-menu" align="end">
            {formatOptions.map((option) => (
              <DropdownMenuItem active={option === format} key={option} onSelect={() => setFormat(option)}>
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EditableCodeBox value={draftContent} setValue={setDraftContent} lines={lines} />
      <div className="editor-meta">
        <span>Ln {lines}, Col 1</span>
        <span>{format}</span>
        <span>{formatBytes(stats.bytes)}</span>
        <span>{stats.characters} chars</span>
        {isDark && (
          <span className="meta-saved">
            <Check size={16} />
            Saved
          </span>
        )}
      </div>
      {error && <p className="inline-error">{error}</p>}
      <div className="editor-actions">
        <Button variant="primary" onClick={onSave}>
          <Archive size={18} />
          Save
        </Button>
        <Button onClick={onNew}>
          <FileInput size={18} />
          New
        </Button>
        <Button onClick={onPaste}>
          <FileInput size={18} />
          Paste
        </Button>
        <Button onClick={onCopyLatest}>
          <ClipboardCopy size={18} />
          Copy latest
        </Button>
        <Button className="share-draft" onClick={onCopyLink}>
          <Link2 size={18} />
          Copy link
        </Button>
      </div>
    </section>
  );
}

function UtilityTabs({
  activeTab,
  setActiveTab,
  clipboardId,
  clip,
  stats,
  storageUsage,
  storagePercent,
  protection,
  locked,
  newTag,
  setNewTag,
  onAddTag,
  onRemoveTag,
  onCopy,
  onCopyLink,
  onDelete,
  onTogglePin,
  onToggleStar,
  onImport,
  onExport
}) {
  const tabs = [
    { label: "Details", icon: FileText },
    { label: "Tags", icon: Tags },
    { label: "Storage", icon: Database }
  ];
  const bytes = clip ? textBytes(clip.content) : stats.bytes;
  const lines = clip ? clip.content.split(/\r?\n/).length : stats.lines;

  return (
    <aside className="utility-panel" aria-label="Clipboard management">
      <div className="utility-tabs" role="tablist" aria-label="Clipboard management sections">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.label ? "active" : ""}
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.label}
            onClick={() => setActiveTab(tab.label)}
          >
            <tab.icon size={17} />
            {tab.label}
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="utility-menu-trigger" type="button" aria-label="More clipboard actions">
              <MoreHorizontal size={20} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="utility-menu" align="end">
            <DropdownMenuItem onSelect={onCopy}>Copy selected clip</DropdownMenuItem>
            <DropdownMenuItem onSelect={onCopyLink}>Copy clipboard link</DropdownMenuItem>
            <DropdownMenuItem onSelect={onTogglePin}>{clip?.pinned ? "Unpin selected" : "Pin selected"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleStar}>{clip?.starred ? "Unstar selected" : "Star selected"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onImport}>Import file</DropdownMenuItem>
            <DropdownMenuItem onSelect={onExport}>Export board</DropdownMenuItem>
            <DropdownMenuItem className="danger-item" onSelect={onDelete}>Delete selected</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activeTab === "Details" && (
        <div className="utility-content details-grid" role="tabpanel">
          <div><span>Clipboard ID</span><strong>{clipboardId}</strong></div>
          <div><span>Format</span><strong>{clip?.format ?? "Plain text"}</strong></div>
          <div><span>Size</span><strong>{formatBytes(bytes)}</strong></div>
          <div><span>Lines</span><strong>{lines.toLocaleString()}</strong></div>
          <div><span>Updated</span><strong>{clip ? formatAge(clip.updatedAt) : "Not saved"}</strong></div>
          <div><span>Password</span><strong>{protection ? (locked ? "Locked" : "Enabled") : "Optional"}</strong></div>
        </div>
      )}

      {activeTab === "Tags" && (
        <div className="utility-content tag-manager" role="tabpanel">
          <div className="tag-list">
            {clip?.tags.length ? clip.tags.map((tag) => <Tag label={tag} onRemove={() => onRemoveTag(tag)} key={tag} />) : <span className="empty-tag">No tags yet</span>}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onAddTag();
            }}
          >
            <input value={newTag} placeholder="Add tag..." onChange={(event) => setNewTag(event.target.value)} />
            <Button type="submit">Add</Button>
          </form>
        </div>
      )}

      {activeTab === "Storage" && (
        <div className="utility-content storage-utility" role="tabpanel">
          <div>
            <span>Local storage</span>
            <strong>{formatBytes(storageUsage)} / 10 MB</strong>
          </div>
          <div className="storage-track"><div style={{ width: `${Math.max(3, storagePercent)}%` }} /></div>
          <div className="utility-actions">
            <Button onClick={onImport}><Upload size={17} />Import</Button>
            <Button onClick={onExport}><Download size={17} />Export</Button>
          </div>
        </div>
      )}
    </aside>
  );
}

function EditableCodeBox({ value, setValue, lines }) {
  return (
    <div className="code-box editable">
      <div className="line-numbers">
        {Array.from({ length: lines }, (_, index) => (
          <span key={`line-${index + 1}`}>{index + 1}</span>
        ))}
      </div>
      <textarea
        value={value}
        spellCheck="false"
        aria-label="Clipboard content"
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}

function ReadOnlyCodeBox({ content }) {
  const lines = content ? content.split(/\r?\n/) : [""];
  return (
    <div className="code-box compact">
      <div className="line-numbers">
        {lines.map((_, index) => (
          <span key={`line-${index + 1}`}>{index + 1}</span>
        ))}
      </div>
      <pre><code>{content}</code></pre>
      <ClipboardCopy className="copy-corner" size={20} />
    </div>
  );
}

function HistoryPanel({
  items,
  selectedId,
  sort,
  setSort,
  filter,
  setFilter,
  search,
  setSearch,
  searchRef,
  total,
  isDark,
  onSelect,
  onToggleStar
}) {
  const pinnedCount = items.filter((item) => item.pinned).length;

  return (
    <section className="history-panel">
      <div className="section-title-row history-heading">
        <h2>History</h2>
        <span>{total} saved</span>
      </div>
      <div className="history-toolbar">
        <label className="search-input">
          <Search size={20} />
          <input ref={searchRef} placeholder="Search history" value={search} onChange={(event) => setSearch(event.target.value)} />
          {isDark && <kbd>/</kbd>}
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="select-trigger sort-trigger" type="button">
              {sort}
              <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="sort-menu">
            {sortOptions.map((option) => (
              <DropdownMenuItem active={option === sort} key={option} onSelect={() => setSort(option)}>
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="select-trigger filter-trigger" type="button">
              {filter}
              <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="sort-menu">
            {filterOptions.map((option) => (
              <DropdownMenuItem active={option === filter} key={option} onSelect={() => setFilter(option)}>
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pinned-label">
        <Pin size={16} />
        Pinned {pinnedCount ? `(${pinnedCount})` : ""}
      </div>
      <div className="history-list">
        {items.length ? items.map((item) => (
          <HistoryItem
            item={item}
            isDark={isDark}
            selected={item.id === selectedId}
            onSelect={() => onSelect(item.id)}
            onToggleStar={() => onToggleStar(item)}
            key={item.id}
          />
        )) : <EmptyState />}
      </div>
    </section>
  );
}

function HistoryItem({ item, isDark, selected, onSelect, onToggleStar }) {
  return (
    <article className={`history-item ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="history-leading">
        {isDark ? (item.pinned ? <Pin size={17} /> : <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); onToggleStar(); }} aria-label="Toggle starred"><Star size={18} fill={item.starred ? "currentColor" : "none"} /></button>) : null}
        {!isDark && <Badge tone={item.format.toLowerCase()}>{shortFormat(item.format)}</Badge>}
        <div>
          <h3>{item.title || inferTitle(item.content, item.format)}</h3>
          {!isDark && <p>{formatBytes(textBytes(item.content))}</p>}
          {isDark && !selected && <p>{item.content}</p>}
        </div>
      </div>
      <Badge tone={item.format.toLowerCase()}>{shortFormat(item.format)}</Badge>
      <span>{formatBytes(textBytes(item.content))}</span>
      <span>{formatAge(item.updatedAt)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="item-more" type="button" aria-label={`More actions for ${item.title}`} onClick={(event) => event.stopPropagation()}>
            <MoreHorizontal size={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="utility-menu" align="end">
          <DropdownMenuItem onSelect={onSelect}>Open clip</DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleStar}>{item.starred ? "Remove favorite" : "Favorite"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function DetailsPanel({
  clipboardId,
  clip,
  isDark,
  onCopy,
  onCopyLink,
  onDelete,
  onTogglePin,
  onToggleStar,
  newTag,
  setNewTag,
  onAddTag,
  onRemoveTag
}) {
  if (!clip) {
    return (
      <aside className="details-panel">
        <div className="details-title-row"><h2>Selected clip</h2></div>
        <EmptyState />
      </aside>
    );
  }

  const bytes = textBytes(clip.content);
  const lines = clip.content.split(/\r?\n/).length;

  return (
    <aside className="details-panel">
      <div className="details-title-row">
        <h2>Selected clip</h2>
        <div>
          <button className="icon-only" type="button" onClick={onTogglePin} aria-label="Toggle pinned"><Pin size={19} fill={clip.pinned ? "currentColor" : "none"} /></button>
          <button className="icon-only" type="button" onClick={onToggleStar} aria-label="Toggle starred"><Star size={19} fill={clip.starred ? "currentColor" : "none"} /></button>
        </div>
      </div>
      <div className="clip-heading">
        <h3>{clip.title}</h3>
        <p>
          {clipboardId} <span /> {clip.format} <span /> {formatBytes(bytes)} {isDark ? "" : ` - ${clip.tags.length} tags`}
        </p>
      </div>
      <div className="details-actions">
        <Button variant="primary" onClick={onCopy}>
          <ClipboardCopy size={18} />
          Copy
        </Button>
        <Button onClick={onCopyLink}>
          <Link2 size={18} />
          Copy link
        </Button>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={18} />
          Delete
        </Button>
        <Button variant="icon" aria-label="More actions">
          <MoreHorizontal size={21} />
        </Button>
      </div>
      <ReadOnlyCodeBox content={clip.content} />
      <dl className="meta-list">
        <div><dt>Format</dt><dd>{clip.format}</dd></div>
        <div><dt>Size</dt><dd>{formatBytes(bytes)} ({bytes.toLocaleString()} B)</dd></div>
        <div><dt>Created</dt><dd>{formatDate(clip.createdAt)}</dd></div>
        <div><dt>Updated</dt><dd>{formatDate(clip.updatedAt)}</dd></div>
        <div><dt>Characters</dt><dd>{clip.content.length.toLocaleString()}</dd></div>
        <div><dt>Lines</dt><dd>{lines.toLocaleString()}</dd></div>
        <div><dt>Pinned</dt><dd>{clip.pinned ? "Yes" : "No"}</dd></div>
        <div><dt>Starred</dt><dd>{clip.starred ? "Yes" : "No"}</dd></div>
        <div><dt>ID</dt><dd>{clip.id}</dd></div>
        <div><dt>Password</dt><dd>Optional per clipboard</dd></div>
        <div className="tags-row">
          <dt>Tags</dt>
          <dd>
            {clip.tags.map((tag) => <Tag label={tag} onRemove={() => onRemoveTag(tag)} key={tag} />)}
            <input
              value={newTag}
              placeholder="Add tag..."
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void onAddTag();
              }}
            />
          </dd>
        </div>
      </dl>
    </aside>
  );
}

function shortFormat(format) {
  if (format === "Plain text") return "TXT";
  if (format === "JavaScript") return "JS";
  return format;
}

function Tag({ label, onRemove }) {
  return (
    <span className="tag">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label} tag`}>
        <X size={15} />
      </button>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Clipboard size={22} />
      <span>No clips match this view.</span>
    </div>
  );
}

function ImportDropzone({ onImport }) {
  return (
    <button className="import-zone" type="button" onClick={onImport}>
      <div>
        <strong>Drop a file to import</strong>
        <span>.txt, .json, .csv up to 5MB</span>
      </div>
      <Upload size={30} />
    </button>
  );
}

export default App;
