import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardPaste,
  ClipboardList,
  ClipboardCopy,
  Download,
  FilePlus2,
  History,
  Link2,
  Lock,
  MoreHorizontal,
  Search,
  Settings,
  Star,
  Upload,
  Trash2,
  Zap,
  X
} from "lucide-react";
import { ActionButton } from "../components/pastevault/ActionButton";
import { AppLogo } from "../components/pastevault/AppLogo";
import { BottomPasteBar } from "../components/pastevault/BottomPasteBar";
import { ClipboardEditor } from "../components/pastevault/ClipboardEditor";
import { FileImportDropzone } from "../components/pastevault/FileImportDropzone";
import { FloatingCard, FloatingCodeCard } from "../components/pastevault/FloatingCard";
import { MetadataRow } from "../components/pastevault/MetadataRow";
import { OverflowMenu } from "../components/pastevault/OverflowMenu";
import { PasswordModal } from "../components/pastevault/PasswordModal";
import { RecentHistoryCard } from "../components/pastevault/RecentHistoryCard";
import { ThemeMenu } from "../components/pastevault/ThemeMenu";
import { Toast } from "../components/pastevault/Toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { useTheme } from "../hooks/useTheme";
import {
  appVersion,
  buildLinkSyncRecord,
  buildProtectedRecord,
  copyText,
  createClip,
  decryptLinkSyncRecord,
  decryptValue,
  derivePasswordKey,
  exportClipboard,
  fetchRemoteRecord,
  filterOptions,
  formatBytes,
  hydrateClipboard,
  inferTitle,
  loadRecord,
  maxImportBytes,
  normalizeClip,
  nowIso,
  pushRemoteRecord,
  saveRecord,
  sortOptions,
  storageBudgetBytes,
  storageKey,
  storageUsageBytes,
  textBytes,
  encryptValue,
  validateContent
} from "../features/clipboard/clipboard-store";

function clipboardTitle(id) {
  return id.length > 15 ? `${id.slice(0, 12)}...` : id;
}

function formatForFile(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[")) return "JSON";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "BASH";
  if (lower.endsWith(".md")) return "Markdown";
  if (lower.endsWith(".html")) return "HTML";
  return "Plain text";
}

function shortFormat(format) {
  if (format === "Plain text") return "TXT";
  if (format === "JavaScript") return "JS";
  return format;
}

export default function ClipboardPage({ clipboardId, initialHistory = false, initialSettings = false }) {
  const { theme, setTheme, isDark } = useTheme();
  const fileRef = useRef(null);
  const searchRef = useRef(null);
  const [initialState] = useState(() => hydrateClipboard(clipboardId));
  const [clips, setClips] = useState(initialState.clips);
  const [selectedId, setSelectedId] = useState(initialState.selectedId);
  const [draftTitle, setDraftTitle] = useState(initialState.draftTitle);
  const [draftContent, setDraftContent] = useState(initialState.draftContent);
  const [format, setFormat] = useState(initialState.format);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("Newest");
  const [filter, setFilter] = useState("All types");
  const [toast, setToast] = useState("");
  const [toastTone, setToastTone] = useState("success");
  const [error, setError] = useState(initialState.error);
  const [locked, setLocked] = useState(initialState.locked);
  const [protection, setProtection] = useState(initialState.protection);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordAcknowledged, setPasswordAcknowledged] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(Boolean(initialSettings));
  const [cryptoKey, setCryptoKey] = useState(null);
  const [syncStatus, setSyncStatus] = useState(initialState.freshLocal ? "Local ready" : "All changes saved");
  const [historyMode, setHistoryMode] = useState(initialHistory);
  const [storageUsage, setStorageUsage] = useState(() => storageUsageBytes());

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedId) ?? clips[0] ?? null,
    [clips, selectedId]
  );

  const stats = useMemo(() => ({
    bytes: textBytes(draftContent),
    characters: draftContent.length,
    lines: Math.max(1, draftContent.split(/\r?\n/).length)
  }), [draftContent]);

  const payload = useMemo(() => ({ clips, selectedId: selectedClip?.id ?? null }), [clips, selectedClip?.id]);
  const startupSyncRef = useRef({
    freshLocal: initialState.freshLocal,
    localUpdatedAt: initialState.localUpdatedAt,
    payload,
    protection
  });

  const showToast = useCallback((message, tone = "success") => {
    setToast(message);
    setToastTone(tone);
    window.clearTimeout(window.__pastevaultToast);
    window.__pastevaultToast = window.setTimeout(() => setToast(""), 3200);
  }, []);

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
          .catch(() => setSyncStatus("All changes saved"));
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
          .catch(() => setSyncStatus("All changes saved"));
      }
      setStorageUsage(storageUsageBytes());
      return true;
    } catch (saveError) {
      const isQuotaError = saveError instanceof DOMException && saveError.name === "QuotaExceededError";
      setError(isQuotaError ? "Browser storage is full. Export or delete clips before saving more." : "PasteVault could not save this clipboard.");
      return false;
    }
  }, [clipboardId, cryptoKey, protection]);

  const replaceClips = useCallback(async (nextClips, nextSelectedId) => {
    const safeSelectedId = nextClips.some((clip) => clip.id === nextSelectedId) ? nextSelectedId : nextClips[0]?.id ?? null;
    const didPersist = await persistPayload({ clips: nextClips, selectedId: safeSelectedId });
    if (!didPersist) return false;
    const nextSelected = nextClips.find((clip) => clip.id === safeSelectedId) ?? null;
    setClips(nextClips);
    setSelectedId(safeSelectedId);
    setDraftTitle(nextSelected?.title ?? "");
    setDraftContent(nextSelected?.content ?? "");
    setFormat(nextSelected?.format ?? "JSON");
    return true;
  }, [persistPayload]);

  useEffect(() => {
    let active = true;
    async function syncRemoteClipboard() {
      try {
        const remote = await fetchRemoteRecord(clipboardId);
        if (!active || !remote) return;
        const startup = startupSyncRef.current;
        const remoteUpdatedAt = new Date(remote.updatedAt || 0).getTime();
        const localUpdatedAt = new Date(startup.localUpdatedAt || 0).getTime();
        if (!startup.freshLocal && remoteUpdatedAt <= localUpdatedAt) return;

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
          setPasswordOpen(false);
          setClips([]);
          setSelectedId(null);
          setDraftTitle("");
          setDraftContent("");
          setSyncStatus("Cloud locked");
        }
      } catch {
        if (active) setSyncStatus("All changes saved");
      }
    }
    void syncRemoteClipboard();
    return () => { active = false; };
  }, [clipboardId]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === storageKey(clipboardId)) window.location.reload();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [clipboardId]);

  useEffect(() => {
    if (!passwordOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setPasswordOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [passwordOpen]);

  const selectClip = useCallback((clipId) => {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return;
    setSelectedId(clip.id);
    setDraftTitle(clip.title);
    setDraftContent(clip.content);
    setFormat(clip.format);
    setHistoryMode(false);
    setError("");
  }, [clips]);

  const handleSave = useCallback(async () => {
    const validation = validateContent(draftContent, format);
    if (validation) {
      setError(validation);
      showToast(validation, "error");
      return;
    }

    const timestamp = nowIso();
    const nextClip = selectedClip
      ? { ...selectedClip, title: draftTitle.trim() || inferTitle(draftContent, format), content: draftContent, format, updatedAt: timestamp }
      : createClip({ title: draftTitle, content: draftContent, format, pinned: clips.length === 0 });
    const nextClips = selectedClip
      ? clips.map((clip) => (clip.id === selectedClip.id ? nextClip : clip))
      : [nextClip, ...clips];
    await replaceClips(nextClips, nextClip.id);
    setError("");
    setSyncStatus("All changes saved");
    showToast("Clip saved successfully");
  }, [clips, draftContent, draftTitle, format, replaceClips, selectedClip, showToast]);

  useEffect(() => {
    const handleKeydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleSave]);

  const handleCopyLink = useCallback(async () => {
    try {
      await copyText(`${window.location.origin}/clip/${encodeURIComponent(clipboardId)}`);
      showToast("Clipboard link copied");
    } catch {
      setError("Could not copy the clipboard link.");
      showToast("Could not copy the clipboard link", "error");
    }
  }, [clipboardId, showToast]);

  const handleCopy = useCallback(async (value = draftContent) => {
    try {
      await copyText(value);
      showToast("Clip copied");
    } catch {
      setError("Browser clipboard write was blocked.");
      showToast("Browser clipboard write was blocked", "error");
    }
  }, [draftContent, showToast]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard read is unavailable.");
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        showToast("Clipboard is empty", "error");
        return;
      }
      setDraftContent(text);
      setDraftTitle((current) => current || inferTitle(text, format));
      setSyncStatus("Unsaved changes");
      showToast("Pasted from clipboard");
    } catch {
      setError("Browser clipboard read was blocked.");
      showToast("Browser clipboard read was blocked", "error");
    }
  }, [format, showToast]);

  const handleFormat = useCallback(() => {
    if (format !== "JSON") {
      showToast("Formatting is available for JSON");
      return;
    }
    try {
      setDraftContent(JSON.stringify(JSON.parse(draftContent), null, 2));
      showToast("JSON formatted");
    } catch (formatError) {
      setError(`Invalid JSON: ${formatError.message}`);
      showToast("Invalid JSON", "error");
    }
  }, [draftContent, format, showToast]);

  const handleRename = useCallback(async (value, inline = false) => {
    if (inline) {
      setDraftTitle(value);
      return;
    }
    const nextTitle = window.prompt("Rename clip", draftTitle || selectedClip?.title || "Untitled");
    if (!nextTitle) return;
    setDraftTitle(nextTitle);
    if (selectedClip) {
      await replaceClips(clips.map((clip) => (clip.id === selectedClip.id ? { ...clip, title: nextTitle, updatedAt: nowIso() } : clip)), selectedClip.id);
      showToast("Clip renamed");
    }
  }, [clips, draftTitle, replaceClips, selectedClip, showToast]);

  const handleDuplicate = useCallback(async () => {
    const duplicate = createClip({
      title: `${draftTitle || selectedClip?.title || "Untitled"} copy`,
      content: draftContent,
      format,
      tags: selectedClip?.tags ?? []
    });
    await replaceClips([duplicate, ...clips], duplicate.id);
    showToast("Clip duplicated");
  }, [clips, draftContent, draftTitle, format, replaceClips, selectedClip, showToast]);

  const handleNewClip = useCallback(() => {
    setSelectedId(null);
    setDraftTitle("");
    setDraftContent("");
    setFormat("Plain text");
    setHistoryMode(false);
    setError("");
    setSyncStatus("Unsaved changes");
    showToast("New clip ready");
  }, [showToast]);

  const handleCopyLatest = useCallback(async () => {
    const latest = [...clips].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    if (!latest) {
      showToast("No clips to copy", "error");
      return;
    }
    await handleCopy(latest.content);
  }, [clips, handleCopy, showToast]);

  const handleDelete = useCallback(async () => {
    if (!selectedClip) {
      setDraftContent("");
      showToast("Editor cleared");
      return;
    }
    const nextClips = clips.filter((clip) => clip.id !== selectedClip.id);
    await replaceClips(nextClips, nextClips[0]?.id ?? null);
    showToast("Clip deleted");
  }, [clips, replaceClips, selectedClip, showToast]);

  const handleClear = useCallback(() => {
    setDraftContent("");
    showToast("Content cleared");
  }, [showToast]);

  const handleImportFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > maxImportBytes) {
      setError("Import limit is 5 MB per file.");
      showToast("Import limit is 5 MB per file", "error");
      return;
    }
    const text = await file.text();
    const imported = createClip({
      title: file.name,
      content: text,
      format: formatForFile(file.name, text),
      tags: ["import"]
    });
    await replaceClips([imported, ...clips], imported.id);
    showToast(`Imported ${file.name} clip`);
  }, [clips, replaceClips, showToast]);

  const handleToggleFlag = useCallback(async (flag, clip = selectedClip) => {
    if (!clip) return;
    await replaceClips(
      clips.map((item) => (item.id === clip.id ? { ...item, [flag]: !item[flag], updatedAt: nowIso() } : item)),
      clip.id
    );
    showToast(flag === "pinned" ? "Pinned state updated" : "Favorite state updated");
  }, [clips, replaceClips, selectedClip, showToast]);

  const handleUnlock = useCallback(async () => {
    if (!protection) return;
    try {
      const key = await derivePasswordKey(passwordInput, protection.salt);
      await decryptValue(protection.verifier, key);
      const record = loadRecord(clipboardId);
      const decrypted = await decryptValue(record.encryptedPayload, key);
      const normalizedClips = decrypted.clips.map(normalizeClip).filter(Boolean);
      const nextSelected = normalizedClips.find((clip) => clip.id === decrypted.selectedId) ?? normalizedClips[0] ?? null;
      setCryptoKey(key);
      setLocked(false);
      setClips(normalizedClips);
      setSelectedId(nextSelected?.id ?? null);
      setDraftTitle(nextSelected?.title ?? "");
      setDraftContent(nextSelected?.content ?? "");
      setFormat(nextSelected?.format ?? "JSON");
      setPasswordInput("");
      setPasswordOpen(false);
      showToast("Clipboard unlocked");
    } catch {
      setError("Password did not unlock this clipboard.");
      showToast("Password did not unlock this clipboard", "error");
    }
  }, [clipboardId, passwordInput, protection, showToast]);

  const handleSetPassword = useCallback(async () => {
    if (passwordInput.length < 8) {
      setError("Use at least 8 characters for the clipboard password.");
      showToast("Password is too short", "error");
      return;
    }
    if (passwordInput !== passwordConfirm) {
      setError("Password confirmation does not match.");
      showToast("Password confirmation does not match", "error");
      return;
    }
    if (!passwordAcknowledged) {
      setError("Confirm that this password cannot be recovered.");
      showToast("Confirm password recovery warning", "error");
      return;
    }
    try {
      const protectedRecord = await buildProtectedRecord(clipboardId, payload, passwordInput);
      saveRecord(clipboardId, protectedRecord.record);
      void pushRemoteRecord(clipboardId, protectedRecord.record).catch(() => {});
      setCryptoKey(protectedRecord.key);
      setProtection(protectedRecord.record.protection);
      setLocked(false);
      setPasswordInput("");
      setPasswordConfirm("");
      setPasswordAcknowledged(false);
      setPasswordOpen(false);
      setStorageUsage(storageUsageBytes());
      showToast("Password enabled");
    } catch {
      setError("PasteVault could not enable password protection for this clipboard.");
      showToast("Could not enable password", "error");
    }
  }, [clipboardId, passwordAcknowledged, passwordConfirm, passwordInput, payload, showToast]);

  const handleRemovePassword = useCallback(async () => {
    if (!protection || locked) return;
    const record = { version: appVersion, id: clipboardId, updatedAt: nowIso(), protection: null, payload };
    saveRecord(clipboardId, record);
    setProtection(null);
    setCryptoKey(null);
    setPasswordInput("");
    setPasswordConfirm("");
    setPasswordAcknowledged(false);
    await buildLinkSyncRecord(clipboardId, payload).then((syncRecord) => pushRemoteRecord(clipboardId, syncRecord)).catch(() => {});
    showToast("Password removed");
  }, [clipboardId, locked, payload, protection, showToast]);

  const filteredClips = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...clips]
      .filter((clip) => filter === "All types" || clip.format === filter || shortFormat(clip.format) === filter)
      .filter((clip) => !query || `${clip.title} ${clip.content} ${clip.format} ${clip.tags.join(" ")}`.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === "Oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sort === "Largest") return textBytes(b.content) - textBytes(a.content);
        if (sort === "Smallest") return textBytes(a.content) - textBytes(b.content);
        if (sort === "Recently updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [clips, filter, search, sort]);

  if (locked) {
    return (
      <div className={`pv-dashboard vault-theme theme-${theme}`}>
        <DashboardHeader theme={theme} setTheme={setTheme} onCopyLink={handleCopyLink} onPassword={() => setPasswordOpen(true)} />
        <main className="pv-locked-state">
          <Lock size={42} />
          <h1>This clipboard is password protected</h1>
          <p>Enter the optional password for this clipboard id to decrypt the saved clips on this device.</p>
          <input type="password" placeholder="Clipboard password" value={passwordInput} onChange={(event) => setPasswordInput(event.target.value)} />
          <ActionButton variant="primary" onClick={handleUnlock}>Unlock clipboard</ActionButton>
          {error && <span className="pv-inline-error">{error}</span>}
        </main>
        <PasswordModal
          open={passwordOpen}
          locked={locked}
          hasPassword={Boolean(protection)}
          passwordInput={passwordInput}
          passwordConfirm={passwordConfirm}
          acknowledged={passwordAcknowledged}
          setPasswordInput={setPasswordInput}
          setPasswordConfirm={setPasswordConfirm}
          setAcknowledged={setPasswordAcknowledged}
          onUnlock={handleUnlock}
          onEnable={handleSetPassword}
          onRemove={handleRemovePassword}
          onClose={() => setPasswordOpen(false)}
        />
        <Toast message={toast} tone={toastTone} onClose={() => setToast("")} />
      </div>
    );
  }

  return (
    <div className={`pv-dashboard vault-theme theme-${theme} ${isDark ? "theme-dark" : "theme-light"}`}>
      <DashboardHeader
        theme={theme}
        setTheme={setTheme}
        search={historyMode ? search : undefined}
        setSearch={historyMode ? setSearch : undefined}
        searchRef={historyMode ? searchRef : undefined}
        onSearchFocus={() => setHistoryMode(true)}
        onCopyLink={handleCopyLink}
        onPassword={() => setPasswordOpen(true)}
        onPaste={handlePasteFromClipboard}
        onImport={() => fileRef.current?.click()}
        onExport={() => exportClipboard(clipboardId, payload)}
        onCopyLatest={handleCopyLatest}
        onNewClip={handleNewClip}
      />
      <DashboardRail
        active={historyMode ? "history" : "clipboard"}
        storageUsage={storageUsage}
        onImport={() => fileRef.current?.click()}
        onExport={() => exportClipboard(clipboardId, payload)}
      />
      <main className={historyMode ? "pv-dashboard-stage pv-history-mode" : "pv-dashboard-stage"}>
        <DashboardFloaters
          clips={clips}
          onClip={(id) => selectClip(id)}
          onCopy={handleCopyLink}
          onImport={() => fileRef.current?.click()}
        />

        <section className="pv-mobile-hero" aria-label="Clipboard summary">
          <AppLogo />
          <h1>{clipboardTitle(clipboardId)}</h1>
          <MetadataRow compact bytes={stats.bytes} characters={stats.characters} lines={stats.lines} format={format} passwordLabel={protection ? "Password enabled" : "Password optional"} />
          <div className="pv-mobile-actions">
            <ActionButton icon={Link2} onClick={handleCopyLink}>Copy link</ActionButton>
            <ActionButton icon={Lock} onClick={() => setPasswordOpen(true)}>Password</ActionButton>
            <ThemeMenu theme={theme} setTheme={setTheme} />
          </div>
        </section>

        {!historyMode && (
          <ClipboardEditor
            clipboardId={clipboardTitle(clipboardId)}
            title={draftTitle}
            content={draftContent}
            format={format}
            stats={stats}
            passwordLabel={protection ? "Password enabled" : "Password optional"}
            syncStatus={syncStatus}
            onContentChange={setDraftContent}
            onFormatChange={setFormat}
            onCopy={() => handleCopy(draftContent)}
            onFormat={handleFormat}
            onSave={handleSave}
            onRename={handleRename}
            onDuplicate={handleDuplicate}
            onExport={() => exportClipboard(clipboardId, payload)}
            onDelete={handleDelete}
            onClear={handleClear}
            onNewClip={handleNewClip}
            onCopyLatest={handleCopyLatest}
          />
        )}

        {historyMode && (
          <HistorySection
            clips={filteredClips}
            selectedId={selectedId}
            search={search}
            setSearch={setSearch}
            searchRef={searchRef}
            sort={sort}
            setSort={setSort}
            filter={filter}
            setFilter={setFilter}
            onOpen={selectClip}
            onTogglePin={(clip) => handleToggleFlag("pinned", clip)}
            onToggleStar={(clip) => handleToggleFlag("starred", clip)}
          />
        )}

        <section className="history-panel pv-recent-strip" aria-label="Recent clipboard history">
          <header>
            <h2>Recent history</h2>
            <a href="/history">See all</a>
          </header>
          <HistoryControls
            search={search}
            setSearch={setSearch}
            searchRef={searchRef}
            sort={sort}
            setSort={setSort}
            filter={filter}
            setFilter={setFilter}
            compact
          />
          <div>
            {filteredClips.slice(0, 4).map((clip) => (
              <RecentHistoryCard
                key={clip.id}
                clip={clip}
                selected={clip.id === selectedId}
                onOpen={() => selectClip(clip.id)}
                onTogglePin={() => handleToggleFlag("pinned", clip)}
                onToggleStar={() => handleToggleFlag("starred", clip)}
              />
            ))}
            {!filteredClips.length && <p className="pv-empty-text">No clips match this view.</p>}
          </div>
        </section>

        <section className="details-panel pv-clip-details" aria-label="Selected clip">
          <header>
            <h2>Selected clip</h2>
            <button type="button" onClick={() => handleToggleFlag("pinned")} aria-label="Toggle pinned"><MoreHorizontal size={18} /></button>
          </header>
          <strong>{selectedClip?.title ?? draftTitle}</strong>
          <p>{format} - {formatBytes(stats.bytes)} - {stats.lines} lines</p>
          <div>
            <ActionButton icon={ClipboardCopy} variant="primary" onClick={() => handleCopy(draftContent)}>Copy</ActionButton>
            <ActionButton icon={Link2} onClick={handleCopyLink}>Copy link</ActionButton>
            <ActionButton icon={Trash2} variant="danger" onClick={handleDelete}>Delete</ActionButton>
          </div>
          <dl className="pv-detail-list">
            <div><dt>Format</dt><dd>{format}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(stats.bytes)} ({stats.bytes.toLocaleString()} B)</dd></div>
            <div><dt>Characters</dt><dd>{stats.characters.toLocaleString()}</dd></div>
            <div><dt>Lines</dt><dd>{stats.lines.toLocaleString()}</dd></div>
            <div><dt>Password</dt><dd>{protection ? "Enabled" : "Optional per clipboard"}</dd></div>
            {selectedClip && <div><dt>Updated</dt><dd>{new Date(selectedClip.updatedAt).toLocaleString()}</dd></div>}
          </dl>
          <TagEditor clip={selectedClip} clips={clips} replaceClips={replaceClips} />
        </section>

        <FileImportDropzone inputRef={fileRef} onImport={handleImportFile} compact />
        <BottomPasteBar value={draftContent} onChange={setDraftContent} onAttach={() => fileRef.current?.click()} onSave={handleSave} />
        {error && <p className="pv-inline-error">{error}</p>}
      </main>

      <PasswordModal
        open={passwordOpen}
        locked={locked}
        hasPassword={Boolean(protection)}
        passwordInput={passwordInput}
        passwordConfirm={passwordConfirm}
        acknowledged={passwordAcknowledged}
        setPasswordInput={setPasswordInput}
        setPasswordConfirm={setPasswordConfirm}
        setAcknowledged={setPasswordAcknowledged}
        onUnlock={handleUnlock}
        onEnable={handleSetPassword}
        onRemove={handleRemovePassword}
        onClose={() => setPasswordOpen(false)}
      />
      <Toast message={toast} tone={toastTone} onClose={() => setToast("")} />
    </div>
  );
}

function DashboardHeader({ theme, setTheme, search, setSearch, searchRef, onSearchFocus, onCopyLink, onPassword, onPaste, onImport, onExport, onCopyLatest, onNewClip }) {
  return (
    <header className="pv-dashboard-header" role="banner">
      {setSearch ? (
        <label className="pv-global-search dashboard-search">
          <Search size={19} />
          <input
            ref={searchRef}
            placeholder="Search clips, keywords, tags..."
            value={search}
            onFocus={onSearchFocus}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>Cmd K</kbd>
        </label>
      ) : (
        <AppLogo />
      )}
      <div className="pv-dashboard-actions">
        <ActionButton icon={Link2} onClick={onCopyLink}>Copy link</ActionButton>
        <ActionButton icon={Lock} onClick={onPassword} aria-label="Password optional">Password</ActionButton>
        <ThemeMenu theme={theme} setTheme={setTheme} />
        {onPaste && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="pv-icon-button" type="button" aria-label="Top bar more actions">
                <MoreHorizontal size={22} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="pv-menu" align="end">
              <DropdownMenuItem onSelect={onPaste}>
                <ClipboardPaste size={16} />
                Paste from clipboard
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onImport}>
                <Upload size={16} />
                Import file
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewClip}>
                <FilePlus2 size={16} />
                New clip
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCopyLatest}>
                <ClipboardCopy size={16} />
                Copy latest
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExport}>
                <Download size={16} />
                Export board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

function DashboardRail({ active, storageUsage, onImport, onExport }) {
  const storagePercent = Math.min(100, Math.round((storageUsage / storageBudgetBytes) * 100));
  const storageLabel = `${formatBytes(storageUsage)} / ${formatBytes(storageBudgetBytes)}`;
  const items = [
    ["clipboard", "Clipboard", <ClipboardList size={20} />, "/clipboard"],
    ["history", "History", <History size={20} />, "/history"],
    ["starred", "Starred", <Star size={20} />, "/history"],
    ["imports", "Imports", <Upload size={20} />, "#import"],
    ["exports", "Exports", <Download size={20} />, "#export"],
    ["settings", "Settings", <Settings size={20} />, "/settings"]
  ];

  return (
    <aside className="pv-sidebar sidebar" aria-label="Workspace navigation">
      <AppLogo compact />
      <nav>
        {items.map(([key, label, icon, href]) => (
          <a
            className={active === key ? "is-active" : ""}
            href={href}
            key={key}
            onClick={(event) => {
              if (key === "imports") {
                event.preventDefault();
                onImport();
              }
              if (key === "exports") {
                event.preventDefault();
                onExport();
              }
            }}
          >
            {icon}
            {label}
          </a>
        ))}
      </nav>
      <div className="pv-storage-panel">
        <span>Storage</span>
        <strong>{storageLabel}</strong>
        <i><b style={{ width: `${storagePercent}%` }} /></i>
        <em><Zap size={15} /> Local-first</em>
      </div>
    </aside>
  );
}

function DashboardFloaters({ clips, onClip, onCopy, onImport }) {
  const api = clips.find((clip) => clip.title === "API Response") ?? clips[0];
  const notes = clips.find((clip) => clip.title === "Meeting notes");
  const encrypted = clips.find((clip) => clip.title === "Encrypted");
  const deploy = clips.find((clip) => clip.title === "Deploy command");

  return (
    <div className="pv-dashboard-floaters" aria-hidden="false">
      {api && (
        <FloatingCodeCard
          className="pv-dash-api"
          title="API Response"
          tag="JSON"
          rotation={7}
          lines={["{", '  "status": "success",', '  "code": 200,', '  "data": { ... }', "}"]}
          onClick={() => onClip(api.id)}
        />
      )}
      {notes && <FloatingCard className="pv-dash-notes" icon="file" title="Meeting notes" meta="1.1 KB - 2h ago" rotation={-3} onClick={() => onClip(notes.id)} />}
      {encrypted && <FloatingCard className="pv-dash-encrypted" icon="lock" title="Encrypted" meta="1.7 KB - 2d ago" rotation={5} onClick={() => onClip(encrypted.id)} />}
      {deploy && <FloatingCard className="pv-dash-deploy" icon="terminal" title="Deploy command" meta="128 B - 5h ago" rotation={-5} onClick={() => onClip(deploy.id)} />}
      <FloatingCard className="pv-dash-import" icon="file" title="Imported notes.txt" meta="940 B - 1d ago" rotation={-3} onClick={onImport} />
      <FloatingCard className="pv-dash-share" icon="link" title="Share this clipboard" meta="pastevault.app/clip/9f3a7b6c" rotation={-4} onClick={onCopy} />
      <button className="pv-orb pv-orb-link" type="button" onClick={onCopy} aria-label="Copy dashboard link"><Link2 size={23} /></button>
      <button className="pv-orb pv-orb-lock" type="button" onClick={() => encrypted && onClip(encrypted.id)} aria-label="Open encrypted clip"><Lock size={23} /></button>
    </div>
  );
}

function HistoryControls({ search, setSearch, searchRef, sort, setSort, filter, setFilter, compact = false }) {
  return (
    <div className={compact ? "pv-history-controls pv-history-controls-compact history-toolbar" : "pv-history-controls history-toolbar"}>
      <label className="pv-history-search">
        <Search size={18} />
        <input ref={searchRef} placeholder="Search history" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="pv-mini-select sort-trigger" type="button">{sort}</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="pv-menu" align="end">
          {sortOptions.map((option) => (
            <DropdownMenuItem active={sort === option} key={option} onSelect={() => setSort(option)}>
              {option}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="pv-mini-select filter-trigger" type="button">{filter}</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="pv-menu" align="end">
          {filterOptions.map((option) => (
            <DropdownMenuItem active={filter === option} key={option} onSelect={() => setFilter(option)}>
              {option}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TagEditor({ clip, clips, replaceClips }) {
  if (!clip) return null;

  const removeTag = (tag) => {
    void replaceClips(
      clips.map((item) => item.id === clip.id ? { ...item, tags: item.tags.filter((value) => value !== tag), updatedAt: nowIso() } : item),
      clip.id
    );
  };

  const addTag = (event) => {
    if (event.key !== "Enter") return;
    const tag = event.currentTarget.value.trim().slice(0, 32);
    event.preventDefault();
    if (!tag || clip.tags.includes(tag)) return;
    void replaceClips(
      clips.map((item) => item.id === clip.id ? { ...item, tags: [...item.tags, tag].slice(0, 8), updatedAt: nowIso() } : item),
      clip.id
    );
    event.currentTarget.value = "";
  };

  return (
    <div className="pv-tags-editor">
      <span>Tags</span>
      <div>
        {clip.tags.map((tag) => (
          <button className="tag pv-tag-pill" type="button" key={tag} onClick={() => removeTag(tag)}>
            {tag}
            <X size={14} />
          </button>
        ))}
        <input placeholder="Add tag..." onKeyDown={addTag} />
      </div>
    </div>
  );
}

function HistorySection({ clips, selectedId, search, setSearch, searchRef, sort, setSort, filter, setFilter, onOpen, onTogglePin, onToggleStar }) {
  return (
    <section className="pv-history-page history-panel">
      <header>
        <h1>Recent history</h1>
        <HistoryControls search={search} setSearch={setSearch} searchRef={searchRef} sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} />
      </header>
      <div className="pv-history-grid">
        {clips.map((clip) => (
          <RecentHistoryCard
            key={clip.id}
            clip={clip}
            selected={clip.id === selectedId}
            onOpen={() => onOpen(clip.id)}
            onTogglePin={() => onTogglePin(clip)}
            onToggleStar={() => onToggleStar(clip)}
          />
        ))}
        {!clips.length && <p className="pv-empty-text">No clips match this view.</p>}
      </div>
    </section>
  );
}
