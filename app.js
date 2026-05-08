const DB_NAME = "pastevault";
const DB_VERSION = 1;
const STORE_NAME = "clips";
const MAX_SHARE_URL = 64000;

const els = {
  storageStatus: document.querySelector("#storageStatus"),
  installButton: document.querySelector("#installButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsMenu: document.querySelector("#settingsMenu"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  clearButton: document.querySelector("#clearButton"),
  clipTitle: document.querySelector("#clipTitle"),
  clipText: document.querySelector("#clipText"),
  formatButton: document.querySelector("#formatButton"),
  formatLabel: document.querySelector("#formatLabel"),
  formatMenu: document.querySelector("#formatMenu"),
  saveButton: document.querySelector("#saveButton"),
  pasteButton: document.querySelector("#pasteButton"),
  copyLatestButton: document.querySelector("#copyLatestButton"),
  shareDraftButton: document.querySelector("#shareDraftButton"),
  searchInput: document.querySelector("#searchInput"),
  sortButton: document.querySelector("#sortButton"),
  sortLabel: document.querySelector("#sortLabel"),
  sortMenu: document.querySelector("#sortMenu"),
  shareNotice: document.querySelector("#shareNotice"),
  shareNoticeText: document.querySelector("#shareNoticeText"),
  acceptShareButton: document.querySelector("#acceptShareButton"),
  dismissShareButton: document.querySelector("#dismissShareButton"),
  clipCount: document.querySelector("#clipCount"),
  emptyState: document.querySelector("#emptyState"),
  clipList: document.querySelector("#clipList"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailCard: document.querySelector("#detailCard"),
  detailFormat: document.querySelector("#detailFormat"),
  detailTitle: document.querySelector("#detailTitle"),
  detailText: document.querySelector("#detailText"),
  detailCreated: document.querySelector("#detailCreated"),
  detailSize: document.querySelector("#detailSize"),
  pinButton: document.querySelector("#pinButton"),
  copySelectedButton: document.querySelector("#copySelectedButton"),
  shareSelectedButton: document.querySelector("#shareSelectedButton"),
  deleteSelectedButton: document.querySelector("#deleteSelectedButton"),
  toast: document.querySelector("#toast")
};

const state = {
  clips: [],
  db: null,
  selectedId: null,
  pendingShare: null,
  format: "auto",
  sort: "newest",
  query: "",
  deferredInstallPrompt: null
};

init().catch((error) => {
  console.error(error);
  toast("Storage could not start. History may be unavailable.");
});

async function init() {
  state.db = await openDb();
  await loadClips();
  bindEvents();
  parseSharedClip();
  render();
  updateStorageStatus();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function bindEvents() {
  els.saveButton.addEventListener("click", saveDraft);
  els.pasteButton.addEventListener("click", pasteFromSystemClipboard);
  els.copyLatestButton.addEventListener("click", copyLatest);
  els.shareDraftButton.addEventListener("click", shareDraft);
  els.copySelectedButton.addEventListener("click", copySelected);
  els.shareSelectedButton.addEventListener("click", shareSelected);
  els.deleteSelectedButton.addEventListener("click", deleteSelected);
  els.pinButton.addEventListener("click", togglePinned);
  els.exportButton.addEventListener("click", exportHistory);
  els.importInput.addEventListener("change", importHistory);
  els.clearButton.addEventListener("click", clearUnpinned);
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    renderList();
  });

  bindMenu(els.formatButton, els.formatMenu, (button) => {
    state.format = button.dataset.format;
    els.formatLabel.textContent = labelForFormat(state.format);
  });

  bindMenu(els.sortButton, els.sortMenu, (button) => {
    state.sort = button.dataset.sort;
    els.sortLabel.textContent = button.textContent;
    renderList();
  });

  bindMenu(els.settingsButton, els.settingsMenu);

  els.acceptShareButton.addEventListener("click", async () => {
    if (!state.pendingShare) return;
    const clip = await addClip({
      ...state.pendingShare,
      source: "share-link"
    });
    state.pendingShare = null;
    history.replaceState(null, "", location.pathname + location.search);
    selectClip(clip.id);
    render();
    toast("Shared clip added.");
  });

  els.dismissShareButton.addEventListener("click", () => {
    state.pendingShare = null;
    els.shareNotice.hidden = true;
    history.replaceState(null, "", location.pathname + location.search);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-wrap")) closeMenus();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) {
      toast("Install from your browser menu.");
      return;
    }
    state.deferredInstallPrompt.prompt();
    state.deferredInstallPrompt = null;
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      saveDraft();
    }
    if (event.key === "/" && document.activeElement === document.body) {
      event.preventDefault();
      els.searchInput.focus();
    }
    if (event.key === "Escape") closeMenus();
  });
}

function bindMenu(button, menu, onPick) {
  button.addEventListener("click", () => {
    const isOpen = menu.classList.contains("open");
    closeMenus();
    menu.classList.toggle("open", !isOpen);
    button.setAttribute("aria-expanded", String(!isOpen));
  });

  menu.addEventListener("click", (event) => {
    const item = event.target.closest("button");
    if (!item) return;
    if (onPick) onPick(item);
    closeMenus();
  });
}

function closeMenus() {
  document.querySelectorAll(".menu.open").forEach((menu) => menu.classList.remove("open"));
  document.querySelectorAll("[aria-expanded='true']").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
      store.createIndex("pinned", "pinned");
      store.createIndex("format", "format");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode = "readonly") {
  return state.db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadClips() {
  state.clips = await requestToPromise(tx().getAll());
  state.clips.sort((a, b) => b.updatedAt - a.updatedAt);
  state.selectedId = state.clips[0]?.id ?? null;
}

async function putClip(clip) {
  await requestToPromise(tx("readwrite").put(clip));
  const index = state.clips.findIndex((item) => item.id === clip.id);
  if (index >= 0) state.clips[index] = clip;
  else state.clips.unshift(clip);
}

async function removeClip(id) {
  await requestToPromise(tx("readwrite").delete(id));
  state.clips = state.clips.filter((clip) => clip.id !== id);
}

async function addClip(input) {
  const text = input.text.trimEnd();
  if (!text.trim()) throw new Error("Cannot save an empty clip.");

  const existing = state.clips.find((clip) => clip.text === text);
  const timestamp = Date.now();
  const format = input.format && input.format !== "auto" ? input.format : detectFormat(text);
  const clip = existing
    ? {
        ...existing,
        title: input.title?.trim() || existing.title || titleFromText(text),
        format,
        updatedAt: timestamp,
        hits: (existing.hits ?? 1) + 1
      }
    : {
        id: crypto.randomUUID ? crypto.randomUUID() : `clip-${timestamp}-${Math.random().toString(16).slice(2)}`,
        title: input.title?.trim() || titleFromText(text),
        text,
        format,
        source: input.source ?? "manual",
        pinned: Boolean(input.pinned),
        createdAt: input.createdAt ?? timestamp,
        updatedAt: timestamp,
        hits: 1
      };

  await putClip(clip);
  state.selectedId = clip.id;
  return clip;
}

async function saveDraft() {
  try {
    const clip = await addClip({
      title: els.clipTitle.value,
      text: els.clipText.value,
      format: state.format,
      source: "manual"
    });
    els.clipTitle.value = "";
    els.clipText.value = "";
    render();
    toast(existingTextCount(clip.text) > 1 ? "Existing clip refreshed." : "Clip saved.");
  } catch (error) {
    toast(error.message);
  }
}

async function pasteFromSystemClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      toast("System clipboard is empty.");
      return;
    }
    els.clipText.value = text;
    els.clipText.focus();
    toast("Pasted.");
  } catch {
    toast("Clipboard read needs browser permission.");
  }
}

async function copyLatest() {
  const clip = sortedClips()[0];
  if (!clip) {
    toast("No clips to copy.");
    return;
  }
  await copyText(clip.text);
  toast("Latest copied.");
}

async function copySelected() {
  const clip = selectedClip();
  if (!clip) return;
  await copyText(clip.text);
  toast("Copied.");
}

async function shareDraft() {
  const text = els.clipText.value.trimEnd();
  if (!text.trim()) {
    toast("Draft is empty.");
    return;
  }
  await createShareLink({
    title: els.clipTitle.value.trim() || titleFromText(text),
    text,
    format: state.format === "auto" ? detectFormat(text) : state.format
  });
}

async function shareSelected() {
  const clip = selectedClip();
  if (!clip) return;
  await createShareLink(clip);
}

async function createShareLink(clip) {
  const payload = {
    v: 1,
    title: clip.title,
    text: clip.text,
    format: clip.format,
    createdAt: Date.now()
  };
  const encoded = encodePayload(payload);
  const baseUrl = location.href.split("#")[0];
  const url = `${baseUrl}#clip=${encoded}`;
  if (url.length > MAX_SHARE_URL) {
    toast("Share link is too large. Use export for this one.");
    return;
  }

  if (navigator.share && url.length < 4000) {
    try {
      await navigator.share({ title: clip.title, text: clip.title, url });
      toast("Share sheet opened.");
      return;
    } catch {
      // The user may cancel the native sheet; copying still leaves a useful result.
    }
  }
  await copyText(url);
  toast("Share link copied.");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

async function deleteSelected() {
  const clip = selectedClip();
  if (!clip) return;
  await removeClip(clip.id);
  state.selectedId = sortedClips()[0]?.id ?? null;
  render();
  toast("Deleted.");
}

async function togglePinned() {
  const clip = selectedClip();
  if (!clip) return;
  const updated = { ...clip, pinned: !clip.pinned, updatedAt: Date.now() };
  await putClip(updated);
  render();
  toast(updated.pinned ? "Pinned." : "Unpinned.");
}

async function clearUnpinned() {
  const unpinned = state.clips.filter((clip) => !clip.pinned);
  await Promise.all(unpinned.map((clip) => requestToPromise(tx("readwrite").delete(clip.id))));
  state.clips = state.clips.filter((clip) => clip.pinned);
  state.selectedId = state.clips[0]?.id ?? null;
  render();
  toast("Unpinned clips cleared.");
}

function exportHistory() {
  const data = {
    exportedAt: new Date().toISOString(),
    app: "PasteVault",
    clips: state.clips
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pastevault-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Export started.");
}

async function importHistory(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const clips = Array.isArray(data.clips) ? data.clips : [];
    let imported = 0;
    for (const clip of clips) {
      if (typeof clip.text !== "string") continue;
      await addClip({
        title: clip.title,
        text: clip.text,
        format: clip.format,
        pinned: clip.pinned,
        createdAt: clip.createdAt,
        source: "import"
      });
      imported += 1;
    }
    render();
    toast(`${imported} clips imported.`);
  } catch {
    toast("Import file was not valid JSON.");
  } finally {
    event.target.value = "";
  }
}

function parseSharedClip() {
  const match = location.hash.match(/clip=([^&]+)/);
  if (!match) return;
  try {
    const payload = decodePayload(match[1]);
    if (!payload?.text || typeof payload.text !== "string") throw new Error("Invalid payload");
    state.pendingShare = {
      title: payload.title || titleFromText(payload.text),
      text: payload.text,
      format: payload.format || detectFormat(payload.text),
      createdAt: payload.createdAt || Date.now()
    };
    els.shareNoticeText.textContent = `Shared clip: ${state.pendingShare.title}`;
    els.shareNotice.hidden = false;
  } catch {
    toast("Share link could not be read.");
  }
}

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.slice(index, index + 8192));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function render() {
  renderList();
  renderDetail();
  updateStorageStatus();
}

function renderList() {
  const clips = sortedClips().filter((clip) => matchesQuery(clip, state.query));
  els.clipList.replaceChildren(...clips.map(renderClipItem));
  els.emptyState.hidden = clips.length > 0;
  els.clipCount.textContent = `${clips.length} ${clips.length === 1 ? "item" : "items"}`;
}

function renderClipItem(clip) {
  const item = document.createElement("li");
  item.className = `clip-item${clip.id === state.selectedId ? " active" : ""}`;
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", () => selectClip(clip.id));

  const content = document.createElement("span");
  const title = document.createElement("span");
  title.className = "clip-title";
  title.textContent = clip.pinned ? `* ${clip.title}` : clip.title;
  const preview = document.createElement("span");
  preview.className = "clip-preview";
  preview.textContent = clip.text.replace(/\s+/g, " ").trim() || "Empty";
  content.append(title, preview);

  const pill = document.createElement("span");
  pill.className = `pill ${clip.format}`;
  pill.textContent = clip.format;
  button.append(content, pill);
  item.append(button);
  return item;
}

function renderDetail() {
  const clip = selectedClip();
  els.detailEmpty.hidden = Boolean(clip);
  els.detailCard.hidden = !clip;
  if (!clip) return;

  els.detailFormat.textContent = clip.format;
  els.detailTitle.textContent = clip.title;
  els.detailText.textContent = clip.text;
  els.detailCreated.textContent = formatDate(clip.createdAt);
  els.detailSize.textContent = formatBytes(new Blob([clip.text]).size);
  els.pinButton.textContent = clip.pinned ? "!" : "*";
  els.pinButton.setAttribute("aria-label", clip.pinned ? "Unpin clip" : "Pin clip");
}

function selectClip(id) {
  state.selectedId = id;
  render();
}

function selectedClip() {
  return state.clips.find((clip) => clip.id === state.selectedId) ?? null;
}

function sortedClips() {
  const clips = [...state.clips];
  if (state.sort === "oldest") clips.sort((a, b) => a.updatedAt - b.updatedAt);
  else if (state.sort === "size") clips.sort((a, b) => b.text.length - a.text.length);
  else if (state.sort === "pinned") clips.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  else clips.sort((a, b) => b.updatedAt - a.updatedAt);
  return clips;
}

function matchesQuery(clip, query) {
  if (!query) return true;
  return `${clip.title}\n${clip.text}\n${clip.format}`.toLowerCase().includes(query);
}

function detectFormat(text) {
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/i.test(trimmed)) return "url";
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return "text";
    }
  }
  if (/[{};=<>]/.test(trimmed) && /\n/.test(trimmed)) return "code";
  return "text";
}

function titleFromText(text) {
  const firstLine = text.trim().split(/\r?\n/).find(Boolean) || "Untitled";
  return firstLine.slice(0, 64);
}

function labelForFormat(format) {
  return format === "json" ? "JSON" : format.charAt(0).toUpperCase() + format.slice(1);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function existingTextCount(text) {
  return state.clips.filter((clip) => clip.text === text.trimEnd()).length;
}

async function updateStorageStatus() {
  const count = state.clips.length;
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage ? formatBytes(estimate.usage) : "0 B";
    els.storageStatus.textContent = `${count} saved, ${used} used`;
    return;
  }
  els.storageStatus.textContent = `${count} saved`;
}

function toast(message) {
  els.toast.textContent = message;
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => {
    els.toast.textContent = "";
  }, 2600);
}
