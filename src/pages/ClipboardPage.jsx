import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardPaste,
  ClipboardList,
  ClipboardCopy,
  Cloud,
  Download,
  FilePlus2,
  History,
  Link2,
  Lock,
  PanelLeft,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  ShieldCheck,
  Share2,
  Star,
  Upload,
  UserCircle2,
  Trash2,
  Zap,
  X
} from "lucide-react";
import { ActionButton } from "../components/pastevault/ActionButton";
import { AppLogo } from "../components/pastevault/AppLogo";
import { BottomPasteBar } from "../components/pastevault/BottomPasteBar";
import { ClipboardEditor } from "../components/pastevault/ClipboardEditor";
import { CodeBlockEditor } from "../components/pastevault/CodeBlockEditor";
import { FileImportDropzone } from "../components/pastevault/FileImportDropzone";
import { MetadataRow } from "../components/pastevault/MetadataRow";
import { OverflowMenu } from "../components/pastevault/OverflowMenu";
import { PasswordModal } from "../components/pastevault/PasswordModal";
import { RecentHistoryCard } from "../components/pastevault/RecentHistoryCard";
import { ThemeToggle } from "../components/pastevault/ThemeToggle";
import { Toast } from "../components/pastevault/Toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger
} from "../components/ui/sidebar";
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
  formatAge,
  formatBytes,
  hydrateClipboard,
  inferTitle,
  loadRecord,
  maxImportBytes,
  mergeClipboardClips,
  nextContentVersion,
  normalizeClip,
  normalizeRecord,
  normalizeVaultSettings,
  nowIso,
  parseClipboardExport,
  pushRemoteRecord,
  recordContentVersion,
  saveRecord,
  sortOptions,
  storageBudgetBytes,
  storageKey,
  storageUsageBytes,
  textBytes,
  encryptValue,
  validateContent
} from "../features/clipboard/clipboard-store";
import {
  clearDraftState,
  createSessionId,
  createVaultChannel,
  getDeviceId,
  normalizeSessionState,
  postVaultMessage,
  readSessionState,
  sessionStateKey,
  vaultMessageTypes,
  writeDraftState,
  writeSessionState
} from "../features/clipboard/vault-sync";

function clipboardTitle(id) {
  return id.length > 15 ? `${id.slice(0, 12)}...` : id;
}

function formatForFile(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[")) return "JSON";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "BASH";
  if (lower.endsWith(".csv")) return "CSV";
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
  const { theme, isDark, setTheme } = useTheme();
  const fileRef = useRef(null);
  const searchRef = useRef(null);
  const sessionIdRef = useRef(createSessionId());
  const deviceIdRef = useRef(null);
  const channelRef = useRef(null);
  const latestDraftRef = useRef(null);
  const hasUnsavedRef = useRef(false);
  const lastRemoteSessionAtRef = useRef(0);
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
  const [activeSection, setActiveSection] = useState(() => (initialHistory ? "history" : initialSettings ? "tools" : "editor"));
  const [storageUsage, setStorageUsage] = useState(() => storageUsageBytes());
  const [contentVersion, setContentVersion] = useState(() => initialState.contentVersion ?? 1);
  const [draftBaseVersion, setDraftBaseVersion] = useState(() => initialState.contentVersion ?? 1);
  const [lastSavedAt, setLastSavedAt] = useState(() => initialState.lastSavedAt ?? initialState.localUpdatedAt ?? nowIso());
  const [autosaveEnabled, setAutosaveEnabled] = useState(() => normalizeVaultSettings(initialState.settings).autosaveEnabled);
  const [lastEditedAt, setLastEditedAt] = useState("");
  const [saveConflict, setSaveConflict] = useState(null);
  const [boardDirty, setBoardDirty] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailsTab, setDetailsTab] = useState("details");

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedId) ?? clips[0] ?? null,
    [clips, selectedId]
  );

  const stats = useMemo(() => ({
    bytes: textBytes(draftContent),
    characters: draftContent.length,
    lines: Math.max(1, draftContent.split(/\r?\n/).length)
  }), [draftContent]);

  const hasUnsavedChanges = useMemo(() => {
    if (boardDirty) return true;
    if (!selectedClip) return Boolean(draftTitle.trim() || draftContent.trim());
    return selectedClip.title !== draftTitle || selectedClip.content !== draftContent || selectedClip.format !== format;
  }, [boardDirty, draftContent, draftTitle, format, selectedClip]);

  const localDraft = useMemo(() => ({
    vaultId: clipboardId,
    localContent: {
      payload: { clips, selectedId: selectedClip?.id ?? null },
      selectedId: selectedClip?.id ?? null,
      title: draftTitle,
      content: draftContent,
      format
    },
    baseVersion: draftBaseVersion,
    hasUnsavedChanges,
    lastSavedAt,
    lastEditedAt: lastEditedAt || nowIso()
  }), [clipboardId, clips, draftBaseVersion, draftContent, draftTitle, format, hasUnsavedChanges, lastEditedAt, lastSavedAt, selectedClip?.id]);

  const payload = useMemo(() => ({ clips, selectedId: selectedClip?.id ?? null }), [clips, selectedClip?.id]);
  const startupSyncRef = useRef({
    freshLocal: initialState.freshLocal,
    localUpdatedAt: initialState.localUpdatedAt,
    contentVersion: initialState.contentVersion ?? 1,
    payload,
    protection
  });

  const showToast = useCallback((message, tone = "success") => {
    setToast(message);
    setToastTone(tone);
    window.clearTimeout(window.__pastevaultToast);
    window.__pastevaultToast = window.setTimeout(() => setToast(""), 3200);
  }, []);

  const publishSessionState = useCallback((patch = {}) => {
    if (!deviceIdRef.current) {
      deviceIdRef.current = getDeviceId();
    }

    const state = {
      vaultId: clipboardId,
      sessionId: sessionIdRef.current,
      deviceId: deviceIdRef.current,
      theme,
      viewMode: activeSection,
      selectedTab: detailsTab,
      isLocked: locked,
      ...patch,
      editorSettings: {
        format,
        sidebarCollapsed,
        autosaveEnabled,
        ...(patch.editorSettings ?? {})
      },
      updatedAt: nowIso()
    };

    const normalized = writeSessionState(clipboardId, state);
    if (!normalized) return;
    postVaultMessage(channelRef.current, {
      type: vaultMessageTypes.sessionState,
      state: normalized
    });
  }, [activeSection, autosaveEnabled, clipboardId, detailsTab, format, locked, sidebarCollapsed, theme]);

  const applyRecordToState = useCallback((record, status = "Clipboard updated") => {
    const normalizedVersion = recordContentVersion(record);
    const settings = normalizeVaultSettings(record.settings);
    setContentVersion(normalizedVersion);
    setDraftBaseVersion(normalizedVersion);
    setLastSavedAt(record.lastSavedAt ?? record.updatedAt ?? nowIso());
    setAutosaveEnabled(settings.autosaveEnabled);
    setSaveConflict(null);
    setBoardDirty(false);

    if (record.protection) {
      setProtection(record.protection);
      setLocked(true);
      setCryptoKey(null);
      setPasswordOpen(false);
      setClips([]);
      setSelectedId(null);
      setDraftTitle("");
      setDraftContent("");
      setFormat("JSON");
      setSyncStatus(status);
      clearDraftState(clipboardId, sessionIdRef.current);
      return;
    }

    const normalizedClips = record.payload.clips.map(normalizeClip).filter(Boolean);
    const nextSelected = normalizedClips.find((clip) => clip.id === record.payload.selectedId) ?? normalizedClips[0] ?? null;
    setProtection(null);
    setLocked(false);
    setCryptoKey(null);
    setClips(normalizedClips);
    setSelectedId(nextSelected?.id ?? null);
    setDraftTitle(nextSelected?.title ?? "");
    setDraftContent(nextSelected?.content ?? "");
    setFormat(nextSelected?.format ?? "JSON");
    setStorageUsage(storageUsageBytes());
    setSyncStatus(status);
    clearDraftState(clipboardId, sessionIdRef.current);
  }, [clipboardId]);

  const persistPayload = useCallback(async (nextPayload, nextProtection = protection, nextKey = cryptoKey, options = {}) => {
    try {
      const currentRecord = loadRecord(clipboardId);
      const currentVersion = recordContentVersion(currentRecord);
      const baseVersion = Number(options.baseVersion ?? draftBaseVersion) || 1;

      if (!options.force && currentVersion > baseVersion) {
        const conflict = {
          baseVersion,
          currentVersion,
          detectedAt: nowIso()
        };
        setSaveConflict(conflict);
        setSyncStatus("Conflict: reload latest before saving");
        setError("This vault changed elsewhere. Reload latest or force save after reviewing your local draft.");
        showToast("This vault changed elsewhere. Review before overwriting.", "error");
        return false;
      }

      setSyncStatus("Saving...");
      const timestamp = nowIso();
      const nextVersion = nextContentVersion(currentRecord, baseVersion);
      const settings = normalizeVaultSettings({
        autosaveEnabled,
        ...(options.settings ?? {})
      });
      const metadata = {
        contentVersion: nextVersion,
        updatedAt: timestamp,
        lastSavedAt: timestamp,
        settings
      };
      let savedRecord;

      if (nextProtection) {
        if (!nextKey) {
          setError("Unlock this clipboard before saving protected changes.");
          return false;
        }
        savedRecord = {
          version: appVersion,
          id: clipboardId,
          ...metadata,
          protection: nextProtection,
          encryptedPayload: await encryptValue(nextPayload, nextKey)
        };
      } else {
        savedRecord = {
          version: appVersion,
          id: clipboardId,
          ...metadata,
          protection: null,
          payload: nextPayload
        };
      }

      saveRecord(clipboardId, savedRecord);
      setContentVersion(nextVersion);
      setDraftBaseVersion(nextVersion);
      setLastSavedAt(timestamp);
      setAutosaveEnabled(settings.autosaveEnabled);
      setSaveConflict(null);
      setError("");
      setBoardDirty(false);
      setSyncStatus("Saved");
      clearDraftState(clipboardId, sessionIdRef.current);
      postVaultMessage(channelRef.current, {
        type: vaultMessageTypes.contentSaved,
        record: savedRecord,
        sessionId: sessionIdRef.current
      });

      if (nextProtection) {
        void pushRemoteRecord(clipboardId, savedRecord)
          .then(() => setSyncStatus("Saved"))
          .catch(() => setSyncStatus("Offline, saved locally"));
      } else {
        void buildLinkSyncRecord(clipboardId, nextPayload, metadata)
          .then((syncRecord) => pushRemoteRecord(clipboardId, syncRecord))
          .then(() => setSyncStatus("Saved"))
          .catch(() => setSyncStatus("Offline, saved locally"));
      }
      setStorageUsage(storageUsageBytes());
      return true;
    } catch (saveError) {
      const isQuotaError = saveError instanceof DOMException && saveError.name === "QuotaExceededError";
      setError(isQuotaError ? "Browser storage is full. Export or delete clips before saving more." : "PasteVault could not save this clipboard.");
      setSyncStatus("Error");
      return false;
    }
  }, [autosaveEnabled, clipboardId, cryptoKey, draftBaseVersion, protection, showToast]);

  const replaceClips = useCallback(async (nextClips, nextSelectedId, options = {}) => {
    const safeSelectedId = nextClips.some((clip) => clip.id === nextSelectedId) ? nextSelectedId : nextClips[0]?.id ?? null;
    const nextSelected = nextClips.find((clip) => clip.id === safeSelectedId) ?? null;
    const shouldPersist = autosaveEnabled || options.persist || options.force;

    if (!shouldPersist) {
      setClips(nextClips);
      setSelectedId(safeSelectedId);
      setDraftTitle(nextSelected?.title ?? "");
      setDraftContent(nextSelected?.content ?? "");
      setFormat(nextSelected?.format ?? "JSON");
      setBoardDirty(true);
      setLastEditedAt(nowIso());
      setSyncStatus("Unsaved changes");
      return true;
    }

    const didPersist = await persistPayload({ clips: nextClips, selectedId: safeSelectedId }, protection, cryptoKey, options);
    if (!didPersist) return false;
    setClips(nextClips);
    setSelectedId(safeSelectedId);
    setDraftTitle(nextSelected?.title ?? "");
    setDraftContent(nextSelected?.content ?? "");
    setFormat(nextSelected?.format ?? "JSON");
    return true;
  }, [autosaveEnabled, cryptoKey, persistPayload, protection]);

  const handleExternalSavedRecord = useCallback((externalRecord, status = "Synced from another session") => {
    const record = normalizeRecord(externalRecord, clipboardId);
    const incomingVersion = recordContentVersion(record);
    if (incomingVersion <= contentVersion) return;

    if (hasUnsavedChanges) {
      setSaveConflict({
        baseVersion: draftBaseVersion,
        currentVersion: incomingVersion,
        detectedAt: nowIso()
      });
      setSyncStatus("External changes available");
      showToast("Another session saved this vault. Save is paused until you review.", "error");
      return;
    }

    applyRecordToState(record, status);
    showToast(status);
  }, [applyRecordToState, clipboardId, contentVersion, draftBaseVersion, hasUnsavedChanges, showToast]);

  useEffect(() => {
    let active = true;
    async function syncRemoteClipboard() {
      try {
        const remote = await fetchRemoteRecord(clipboardId);
        if (!active || !remote) return;
        const startup = startupSyncRef.current;
        const remoteUpdatedAt = new Date(remote.updatedAt || 0).getTime();
        const localUpdatedAt = new Date(startup.localUpdatedAt || 0).getTime();
        const remoteVersion = recordContentVersion(remote);
        if (!startup.freshLocal && remoteVersion <= startup.contentVersion && remoteUpdatedAt <= localUpdatedAt) return;

        if (remote.sync?.mode === "link") {
          const remotePayload = await decryptLinkSyncRecord(remote);
          const normalizedClips = remotePayload.clips.map(normalizeClip).filter(Boolean);
          const nextSelected = normalizedClips.find((clip) => clip.id === remotePayload.selectedId) ?? normalizedClips[0] ?? null;
          const localRecord = {
            version: appVersion,
            id: clipboardId,
            contentVersion: remoteVersion,
            updatedAt: remote.updatedAt ?? nowIso(),
            lastSavedAt: remote.lastSavedAt ?? remote.updatedAt ?? nowIso(),
            settings: normalizeVaultSettings(remote.settings),
            protection: null,
            payload: { clips: normalizedClips, selectedId: nextSelected?.id ?? null }
          };
          saveRecord(clipboardId, localRecord);
          if (!active) return;
          applyRecordToState(localRecord, "Cloud synced");
        } else if (remote.protection && remote.encryptedPayload) {
          saveRecord(clipboardId, remote);
          if (!active) return;
          applyRecordToState(remote, "Cloud locked");
        }
      } catch {
        if (active) setSyncStatus("Saved locally - cloud unavailable");
      }
    }
    void syncRemoteClipboard();
    return () => { active = false; };
  }, [applyRecordToState, clipboardId]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (!event.newValue) return;
      if (event.key === storageKey(clipboardId)) {
        try {
          handleExternalSavedRecord(JSON.parse(event.newValue), "Synced from another tab");
        } catch {
          setSyncStatus("External sync failed");
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [clipboardId, handleExternalSavedRecord]);

  useEffect(() => {
    deviceIdRef.current = getDeviceId();
    const channel = createVaultChannel(clipboardId);
    channelRef.current = channel;

    const applySessionState = (incoming) => {
      const state = normalizeSessionState(incoming, clipboardId);
      if (!state || state.sessionId === sessionIdRef.current) return;
      const updatedAt = new Date(state.updatedAt).getTime();
      if (Number.isFinite(updatedAt) && updatedAt <= lastRemoteSessionAtRef.current) return;
      if (Number.isFinite(updatedAt)) {
        lastRemoteSessionAtRef.current = updatedAt;
      }

      if (state.theme && state.theme !== theme) {
        setTheme(state.theme);
      }
      if (state.viewMode && state.viewMode !== activeSection) {
        setActiveSection(state.viewMode);
      }
      if (state.selectedTab && state.selectedTab !== detailsTab) {
        setDetailsTab(state.selectedTab);
      }
      if (typeof state.editorSettings.sidebarCollapsed === "boolean") {
        setSidebarCollapsed(state.editorSettings.sidebarCollapsed);
      }
      if (typeof state.editorSettings.autosaveEnabled === "boolean") {
        setAutosaveEnabled(state.editorSettings.autosaveEnabled);
        setSyncStatus(state.editorSettings.autosaveEnabled ? (hasUnsavedRef.current ? "Saving..." : "Autosave on") : (hasUnsavedRef.current ? "Unsaved changes" : "Autosave off"));
      }
    };

    const handleChannelMessage = (event) => {
      if (event.data?.type === vaultMessageTypes.sessionState) {
        applySessionState(event.data.state);
      }
      if (event.data?.type === vaultMessageTypes.contentSaved && event.data.sessionId !== sessionIdRef.current) {
        handleExternalSavedRecord(event.data.record, "Synced from another session");
      }
    };

    const handleSessionStorage = (event) => {
      if (event.key !== sessionStateKey(clipboardId) || !event.newValue) return;
      try {
        applySessionState(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed peer session state. Content state is stored separately.
      }
    };

    channel?.addEventListener("message", handleChannelMessage);
    window.addEventListener("storage", handleSessionStorage);

    const existingSession = readSessionState(clipboardId);
    if (existingSession) {
      applySessionState(existingSession);
    }

    return () => {
      channel?.removeEventListener("message", handleChannelMessage);
      channel?.close();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      window.removeEventListener("storage", handleSessionStorage);
    };
  }, [activeSection, clipboardId, detailsTab, handleExternalSavedRecord, setTheme, theme]);

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

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    latestDraftRef.current = localDraft;
    hasUnsavedRef.current = hasUnsavedChanges;
    if (hasUnsavedChanges) {
      writeDraftState(clipboardId, sessionIdRef.current, localDraft);
    } else {
      clearDraftState(clipboardId, sessionIdRef.current);
    }
  }, [clipboardId, hasUnsavedChanges, localDraft]);

  const updateDraftContent = useCallback((value) => {
    setDraftContent(value);
    setLastEditedAt(nowIso());
    setSyncStatus(autosaveEnabled ? "Saving..." : "Unsaved changes");
    setError("");
  }, [autosaveEnabled]);

  const updateDraftFormat = useCallback((value) => {
    setFormat(value);
    setLastEditedAt(nowIso());
    setSyncStatus(autosaveEnabled ? "Saving..." : "Unsaved changes");
    setError("");
  }, [autosaveEnabled]);

  const updateDraftTitle = useCallback((value) => {
    setDraftTitle(value);
    setLastEditedAt(nowIso());
    setSyncStatus(autosaveEnabled ? "Saving..." : "Unsaved changes");
    setError("");
  }, [autosaveEnabled]);

  const selectClip = useCallback((clipId) => {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return;
    setSelectedId(clip.id);
    setDraftTitle(clip.title);
    setDraftContent(clip.content);
    setFormat(clip.format);
    setActiveSection("editor");
    publishSessionState({ viewMode: "editor" });
    setError("");
  }, [clips, publishSessionState]);

  const handleSave = useCallback(async (options = {}) => {
    const validation = validateContent(draftContent, format);
    if (validation) {
      setError(validation);
      setSyncStatus("Error");
      if (!options.silent) {
        showToast(validation, "error");
      }
      return false;
    }

    const timestamp = nowIso();
    const nextClip = selectedClip
      ? { ...selectedClip, title: draftTitle.trim() || inferTitle(draftContent, format), content: draftContent, format, updatedAt: timestamp }
      : createClip({ title: draftTitle, content: draftContent, format, pinned: clips.length === 0 });
    const nextClips = selectedClip
      ? clips.map((clip) => (clip.id === selectedClip.id ? nextClip : clip))
      : [nextClip, ...clips];
    const didSave = await replaceClips(nextClips, nextClip.id, { ...options, persist: true });
    if (!didSave) return false;
    setError("");
    if (!options.silent) {
      showToast("Clip saved successfully");
    }
    return true;
  }, [clips, draftContent, draftTitle, format, replaceClips, selectedClip, showToast]);

  const handleThemeToggle = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    publishSessionState({ theme: nextTheme });
  }, [publishSessionState, setTheme, theme]);

  const handleSectionChange = useCallback((section) => {
    setActiveSection(section);
    publishSessionState({ viewMode: section });
  }, [publishSessionState]);

  const handleDetailsTabChange = useCallback((tab) => {
    setDetailsTab(tab);
    publishSessionState({ selectedTab: tab });
  }, [publishSessionState]);

  const handleSidebarCollapsedChange = useCallback((collapsed) => {
    setSidebarCollapsed(collapsed);
    publishSessionState({ editorSettings: { sidebarCollapsed: collapsed } });
  }, [publishSessionState]);

  const handleAutosaveToggle = useCallback(() => {
    const nextAutosave = !autosaveEnabled;
    setAutosaveEnabled(nextAutosave);
    setSyncStatus(nextAutosave ? (hasUnsavedChanges ? "Saving..." : "Autosave on") : (hasUnsavedChanges ? "Unsaved changes" : "Autosave off"));
    publishSessionState({ editorSettings: { autosaveEnabled: nextAutosave } });

    try {
      const record = loadRecord(clipboardId);
      saveRecord(clipboardId, {
        ...record,
        settings: normalizeVaultSettings({ ...record.settings, autosaveEnabled: nextAutosave })
      });
    } catch {
      // The session state still syncs live; the next content save will persist the setting.
    }
  }, [autosaveEnabled, clipboardId, hasUnsavedChanges, publishSessionState]);

  const handleReloadLatest = useCallback(() => {
    if (hasUnsavedChanges && !window.confirm("Discard local unsaved changes and reload the latest saved vault content?")) {
      return;
    }
    try {
      const record = loadRecord(clipboardId);
      applyRecordToState(record, "Reloaded latest saved content");
      showToast("Reloaded latest saved content");
    } catch {
      setError("PasteVault could not reload the latest saved content.");
      showToast("Could not reload latest content", "error");
    }
  }, [applyRecordToState, clipboardId, hasUnsavedChanges, showToast]);

  const handleForceSave = useCallback(() => {
    void handleSave({ force: true });
  }, [handleSave]);

  useEffect(() => {
    if (!autosaveEnabled || locked || !hasUnsavedChanges || saveConflict) return undefined;
    const timer = window.setTimeout(() => {
      void handleSave({ silent: true, baseVersion: draftBaseVersion });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, draftBaseVersion, draftContent, draftTitle, format, handleSave, hasUnsavedChanges, locked, saveConflict]);

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
      updateDraftContent(text);
      setDraftTitle((current) => current || inferTitle(text, format));
      showToast("Pasted from clipboard");
    } catch {
      setError("Browser clipboard read was blocked.");
      showToast("Browser clipboard read was blocked", "error");
    }
  }, [format, showToast, updateDraftContent]);

  const handleFormat = useCallback(() => {
    if (format !== "JSON") {
      showToast("Formatting is available for JSON");
      return;
    }
    try {
      updateDraftContent(JSON.stringify(JSON.parse(draftContent), null, 2));
      showToast("JSON formatted");
    } catch (formatError) {
      setError(`Invalid JSON: ${formatError.message}`);
      showToast("Invalid JSON", "error");
    }
  }, [draftContent, format, showToast, updateDraftContent]);

  const handleRename = useCallback(async (value, inline = false) => {
    if (inline) {
      updateDraftTitle(value);
      return;
    }
    const nextTitle = window.prompt("Rename clip", draftTitle || selectedClip?.title || "Untitled");
    if (!nextTitle) return;
    setDraftTitle(nextTitle);
    if (selectedClip) {
      await replaceClips(clips.map((clip) => (clip.id === selectedClip.id ? { ...clip, title: nextTitle, updatedAt: nowIso() } : clip)), selectedClip.id);
      showToast("Clip renamed");
    }
  }, [clips, draftTitle, replaceClips, selectedClip, showToast, updateDraftTitle]);

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
    setActiveSection("editor");
    publishSessionState({ viewMode: "editor" });
    setError("");
    setSyncStatus("Unsaved changes");
    showToast("New clip ready");
  }, [publishSessionState, showToast]);

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
      updateDraftContent("");
      showToast("Editor cleared");
      return;
    }
    const nextClips = clips.filter((clip) => clip.id !== selectedClip.id);
    await replaceClips(nextClips, nextClips[0]?.id ?? null);
    showToast("Clip deleted");
  }, [clips, replaceClips, selectedClip, showToast, updateDraftContent]);

  const handleClear = useCallback(() => {
    updateDraftContent("");
    showToast("Content cleared");
  }, [showToast, updateDraftContent]);

  const handleImportFile = useCallback(async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    let nextClips = [...clips];
    let selectedImportedId = null;
    let importedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (file.size > maxImportBytes) {
        skippedCount += 1;
        continue;
      }

      try {
        const text = await file.text();
        const exportedBoard = parseClipboardExport(text);
        if (exportedBoard) {
          nextClips = mergeClipboardClips(nextClips, exportedBoard.clips);
          selectedImportedId = exportedBoard.selectedId;
          importedCount += exportedBoard.clips.length;
          continue;
        }

        const imported = createClip({
          title: file.name,
          content: text,
          format: formatForFile(file.name, text),
          tags: ["import"]
        });
        nextClips = [imported, ...nextClips];
        selectedImportedId = imported.id;
        importedCount += 1;
      } catch {
        skippedCount += 1;
      }
    }

    if (!importedCount) {
      const message = skippedCount ? "No files imported. Check file size or format." : "No importable files selected.";
      setError(message);
      showToast(message, "error");
      return;
    }

    await replaceClips(nextClips, selectedImportedId ?? nextClips[0]?.id ?? null);
    if (skippedCount) {
      showToast(`Imported ${importedCount} clips. Skipped ${skippedCount}.`, "error");
    } else {
      showToast(importedCount === 1 ? "Imported 1 clip" : `Imported ${importedCount} clips`);
    }
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
      const recordVersion = recordContentVersion(record);
      setCryptoKey(key);
      setLocked(false);
      setClips(normalizedClips);
      setSelectedId(nextSelected?.id ?? null);
      setDraftTitle(nextSelected?.title ?? "");
      setDraftContent(nextSelected?.content ?? "");
      setFormat(nextSelected?.format ?? "JSON");
      setContentVersion(recordVersion);
      setDraftBaseVersion(recordVersion);
      setLastSavedAt(record.lastSavedAt ?? record.updatedAt ?? nowIso());
      setAutosaveEnabled(normalizeVaultSettings(record.settings).autosaveEnabled);
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
      const currentRecord = loadRecord(clipboardId);
      const timestamp = nowIso();
      const nextVersion = nextContentVersion(currentRecord, draftBaseVersion);
      const protectedRecord = await buildProtectedRecord(clipboardId, payload, passwordInput, {
        contentVersion: nextVersion,
        updatedAt: timestamp,
        lastSavedAt: timestamp,
        settings: { autosaveEnabled }
      });
      saveRecord(clipboardId, protectedRecord.record);
      void pushRemoteRecord(clipboardId, protectedRecord.record).catch(() => {});
      setCryptoKey(protectedRecord.key);
      setProtection(protectedRecord.record.protection);
      setContentVersion(nextVersion);
      setDraftBaseVersion(nextVersion);
      setLastSavedAt(timestamp);
      setLocked(false);
      setPasswordInput("");
      setPasswordConfirm("");
      setPasswordAcknowledged(false);
      setPasswordOpen(false);
      setStorageUsage(storageUsageBytes());
      postVaultMessage(channelRef.current, {
        type: vaultMessageTypes.contentSaved,
        record: protectedRecord.record,
        sessionId: sessionIdRef.current
      });
      showToast("Password enabled");
    } catch {
      setError("PasteVault could not enable password protection for this clipboard.");
      showToast("Could not enable password", "error");
    }
  }, [autosaveEnabled, clipboardId, draftBaseVersion, passwordAcknowledged, passwordConfirm, passwordInput, payload, showToast]);

  const handleRemovePassword = useCallback(async () => {
    if (!protection || locked) return;
    const currentRecord = loadRecord(clipboardId);
    const timestamp = nowIso();
    const nextVersion = nextContentVersion(currentRecord, draftBaseVersion);
    const record = {
      version: appVersion,
      id: clipboardId,
      contentVersion: nextVersion,
      updatedAt: timestamp,
      lastSavedAt: timestamp,
      settings: normalizeVaultSettings({ autosaveEnabled }),
      protection: null,
      payload
    };
    saveRecord(clipboardId, record);
    setProtection(null);
    setCryptoKey(null);
    setContentVersion(nextVersion);
    setDraftBaseVersion(nextVersion);
    setLastSavedAt(timestamp);
    setPasswordInput("");
    setPasswordConfirm("");
    setPasswordAcknowledged(false);
    postVaultMessage(channelRef.current, {
      type: vaultMessageTypes.contentSaved,
      record,
      sessionId: sessionIdRef.current
    });
    await buildLinkSyncRecord(clipboardId, payload, record).then((syncRecord) => pushRemoteRecord(clipboardId, syncRecord)).catch(() => {});
    showToast("Password removed");
  }, [autosaveEnabled, clipboardId, draftBaseVersion, locked, payload, protection, showToast]);

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
        <DashboardHeader theme={theme} toggleTheme={handleThemeToggle} onCopyLink={handleCopyLink} onPassword={() => setPasswordOpen(true)} />
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
        toggleTheme={handleThemeToggle}
        search={activeSection === "history" ? search : undefined}
        setSearch={activeSection === "history" ? setSearch : undefined}
        searchRef={activeSection === "history" ? searchRef : undefined}
        onSearchFocus={() => handleSectionChange("history")}
        onCopyLink={handleCopyLink}
        onPassword={() => setPasswordOpen(true)}
        onPaste={handlePasteFromClipboard}
        onImport={() => fileRef.current?.click()}
        onExport={() => exportClipboard(clipboardId, payload)}
        onCopyLatest={handleCopyLatest}
        onNewClip={handleNewClip}
      />
      <DashboardRail
        active={activeSection}
        collapsed={sidebarCollapsed}
        onCollapsedChange={handleSidebarCollapsedChange}
        onSectionChange={handleSectionChange}
        storageUsage={storageUsage}
        onImport={() => fileRef.current?.click()}
        onExport={() => exportClipboard(clipboardId, payload)}
        onAccount={() => showToast("Sign in for cloud sync is not configured yet")}
      />
      <main className={`pv-dashboard-stage pv-section-${activeSection}`}>
        <section className="pv-mobile-hero" aria-label="Clipboard summary">
          <AppLogo />
          <h1>{clipboardTitle(clipboardId)}</h1>
          <MetadataRow compact bytes={stats.bytes} characters={stats.characters} lines={stats.lines} format={format} passwordLabel={protection ? "Password enabled" : "Password optional"} />
          <div className="pv-mobile-actions">
            <ActionButton icon={Link2} onClick={handleCopyLink}>Copy link</ActionButton>
            <ActionButton icon={Lock} onClick={() => setPasswordOpen(true)}>Password</ActionButton>
            <ThemeToggle theme={theme} toggleTheme={handleThemeToggle} />
          </div>
          <nav className="pv-mobile-section-tabs" aria-label="Clipboard sections">
            {[
              ["editor", "Editor"],
              ["history", "History"],
              ["details", "Details"],
              ["tools", "Tools"]
            ].map(([key, label]) => (
              <button className={activeSection === key ? "is-active" : ""} type="button" key={key} onClick={() => handleSectionChange(key)}>
                {label}
              </button>
            ))}
          </nav>
        </section>

        <div className="pv-dashboard-grid">
          <div className={initialHistory ? "pv-main-column pv-main-column-history" : "pv-main-column"}>
            {initialHistory ? (
              <div className="pv-mobile-section is-active" data-section="history">
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
              </div>
            ) : (
              <>
                <div className={activeSection === "editor" ? "pv-mobile-section is-active" : "pv-mobile-section"} data-section="editor">
                  <ClipboardEditor
                    clipboardId={clipboardTitle(clipboardId)}
                    title={draftTitle}
                    content={draftContent}
                    format={format}
                    stats={stats}
                    passwordLabel={protection ? "Password enabled" : "Password optional"}
                    syncStatus={syncStatus}
                    autosaveEnabled={autosaveEnabled}
                    conflict={saveConflict}
                    onAutosaveToggle={handleAutosaveToggle}
                    onReloadLatest={handleReloadLatest}
                    onForceSave={handleForceSave}
                    onContentChange={updateDraftContent}
                    onFormatChange={updateDraftFormat}
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
                </div>

                <div className={activeSection === "history" ? "pv-mobile-section is-active" : "pv-mobile-section"} data-section="history">
                  <HistoryTable
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
                </div>
              </>
            )}

            {!initialHistory && activeSection === "tools" && (
              <ToolsPanel
                clipboardId={clipboardTitle(clipboardId)}
                storageUsage={storageUsage}
                onPaste={handlePasteFromClipboard}
                onImport={() => fileRef.current?.click()}
                onExport={() => exportClipboard(clipboardId, payload)}
                onPassword={() => setPasswordOpen(true)}
                onCopyLink={handleCopyLink}
                onCopyLatest={handleCopyLatest}
                onNewClip={handleNewClip}
              />
            )}
          </div>

          <div className={activeSection === "details" ? "pv-mobile-section pv-inspector-column is-active" : "pv-mobile-section pv-inspector-column"} data-section="details">
            <DetailsPanel
              selectedClip={selectedClip}
              draftTitle={draftTitle}
              draftContent={draftContent}
              format={format}
              stats={stats}
              protection={protection}
              clips={clips}
              replaceClips={replaceClips}
              onCopy={() => handleCopy(draftContent)}
              onCopyLink={handleCopyLink}
              onDelete={handleDelete}
              onTogglePin={() => handleToggleFlag("pinned")}
              onPassword={() => setPasswordOpen(true)}
              onExport={() => exportClipboard(clipboardId, payload)}
              activeTab={detailsTab}
              onTabChange={handleDetailsTabChange}
            />
          </div>
        </div>

        <FileImportDropzone inputRef={fileRef} onImport={handleImportFile} compact />
        <BottomPasteBar value={draftContent} onChange={updateDraftContent} onAttach={() => fileRef.current?.click()} onSave={handleSave} />
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

function DashboardHeader({ theme, toggleTheme, search, setSearch, searchRef, onSearchFocus, onCopyLink, onPassword, onPaste, onImport, onExport, onCopyLatest, onNewClip }) {
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
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
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

function DashboardRail({ active, collapsed, onCollapsedChange, onSectionChange, storageUsage, onImport, onExport, onAccount }) {
  const profile = getStoredProfile();
  const storagePercent = Math.min(100, Math.round((storageUsage / storageBudgetBytes) * 100));
  const storageLabel = `${formatBytes(storageUsage)} / ${formatBytes(storageBudgetBytes)}`;
  const sections = [
    ["editor", "Editor", ClipboardList],
    ["history", "History", History],
    ["details", "Details", Star],
    ["tools", "Tools", Settings]
  ];
  const actions = [
    ["imports", "Import file", Upload, onImport],
    ["exports", "Export board", Download, onExport]
  ];

  return (
    <Sidebar className="sidebar" collapsed={collapsed} aria-label="Workspace navigation">
      <SidebarHeader>
        <AppLogo compact />
        <SidebarTrigger onClick={() => onCollapsedChange(!collapsed)}>
          <PanelLeft size={18} />
        </SidebarTrigger>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map(([key, label, Icon]) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton icon={Icon} isActive={active === key} onClick={() => onSectionChange(key)}>
                    {label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Files</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {actions.map(([key, label, Icon, action]) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton icon={Icon} onClick={action}>
                    {label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="pv-storage-panel">
          <span>Storage</span>
          <strong>{storageLabel}</strong>
          <i><b style={{ width: `${storagePercent}%` }} /></i>
          <em><Zap size={15} /> Local-first</em>
        </div>
        <button className="pv-account-panel" type="button" onClick={onAccount} aria-label={profile ? "Open user profile" : "Sign in for cloud sync"}>
          <span className="pv-account-avatar" aria-hidden="true">
            {profile?.avatar ? <img src={profile.avatar} alt="" /> : profile?.name ? profile.name.slice(0, 1).toUpperCase() : <UserCircle2 size={22} />}
          </span>
          <span className="pv-account-copy">
            <strong>{profile?.name ?? "Sign in for cloud sync"}</strong>
            <small>{profile?.email ?? "Sync clipboards across devices"}</small>
          </span>
          <Cloud size={17} />
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

function getStoredProfile() {
  try {
    const rawProfile = window.localStorage.getItem("pastevault-user-profile");
    const profile = rawProfile ? JSON.parse(rawProfile) : null;
    if (!profile || typeof profile !== "object") return null;
    return {
      avatar: typeof profile.avatar === "string" ? profile.avatar : "",
      email: typeof profile.email === "string" ? profile.email : "",
      name: typeof profile.name === "string" ? profile.name : ""
    };
  } catch {
    return null;
  }
}

function noop() {
  return undefined;
}

function DetailsPanel({ selectedClip, draftTitle, draftContent, format, stats, protection, clips, replaceClips, onCopy, onCopyLink, onDelete, onTogglePin, onPassword, onExport, activeTab, onTabChange }) {
  return (
    <section className="details-panel pv-clip-details pv-section-panel" aria-label="Selected clip">
      <header className="pv-inspector-tabs">
        <div>
          <button className={activeTab === "details" ? "is-active" : ""} type="button" onClick={() => onTabChange("details")}>Details</button>
          <button className={activeTab === "preview" ? "is-active" : ""} type="button" onClick={() => onTabChange("preview")}>Preview</button>
        </div>
        <button type="button" onClick={onTogglePin} aria-label="Toggle pinned"><Pin size={17} /></button>
      </header>
      <div className="pv-inspector-title">
        <strong>{selectedClip?.title ?? draftTitle}</strong>
        <span><Pin size={14} />{selectedClip?.pinned ? "Pinned" : "Unpinned"}</span>
        <p>{formatAge(selectedClip?.updatedAt ?? nowIso())} - {formatBytes(stats.bytes)}</p>
      </div>
      {activeTab === "details" ? (
        <>
          <dl className="pv-detail-list">
            <div><dt>Format</dt><dd>{format}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(stats.bytes)} ({stats.bytes.toLocaleString()} B)</dd></div>
            {selectedClip && <div><dt>Created</dt><dd>{new Date(selectedClip.createdAt).toLocaleString()}</dd></div>}
            {selectedClip && <div><dt>Updated</dt><dd>{new Date(selectedClip.updatedAt).toLocaleString()}</dd></div>}
            <div><dt>Characters</dt><dd>{stats.characters.toLocaleString()}</dd></div>
            <div><dt>Lines</dt><dd>{stats.lines.toLocaleString()}</dd></div>
            <div><dt>ID</dt><dd>{selectedClip?.id ?? "draft"}</dd></div>
            <div><dt>Owner</dt><dd><span className="pv-owner-pill">You</span></dd></div>
          </dl>
          <TagEditor clip={selectedClip} clips={clips} replaceClips={replaceClips} />
          <div className="pv-inspector-card">
            <h3><ShieldCheck size={17} />Security</h3>
            <strong>{protection ? "Password enabled" : "Unencrypted"}</strong>
            <p>{protection ? "Password protection is enabled for this clipboard." : "No password set for this clip"}</p>
            <ActionButton compact icon={Lock} onClick={onPassword}>Set password</ActionButton>
          </div>
          <div className="pv-inspector-card">
            <h3><Share2 size={17} />Share clip</h3>
            <p>Share securely with anyone via a private link.</p>
            <ActionButton compact icon={Link2} onClick={onCopyLink}>Create share link</ActionButton>
          </div>
          <div className="pv-inspector-card">
            <h3><Download size={17} />Export</h3>
            <p>Download or export in different formats.</p>
            <ActionButton compact icon={Download} onClick={onExport}>Export clip</ActionButton>
          </div>
        </>
      ) : (
        <div className="pv-inspector-preview">
          <CodeBlockEditor
            value={draftContent}
            format={format}
            readonly
            onChange={noop}
            onFormatChange={noop}
            onCopy={onCopy}
            onFormat={noop}
          />
        </div>
      )}
      <div className="pv-inspector-actions">
        <ActionButton icon={ClipboardCopy} variant="primary" onClick={onCopy}>Copy</ActionButton>
        <ActionButton icon={Trash2} variant="danger" onClick={onDelete}>Delete</ActionButton>
      </div>
      {draftContent.length > 6000 && <p className="pv-empty-text">Large content stays in the editor. Metadata remains responsive here.</p>}
    </section>
  );
}

function HistoryTable({ clips, selectedId, search, setSearch, searchRef, sort, setSort, filter, setFilter, onOpen, onTogglePin, onToggleStar }) {
  return (
    <section className="history-panel pv-history-table-card" aria-label="Recent clipboard history">
      <header>
        <h2>History</h2>
        <HistoryControls search={search} setSearch={setSearch} searchRef={searchRef} sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} compact />
      </header>
      <div className="pv-history-table" role="table" aria-label="Clipboard history rows">
        {clips.slice(0, 5).map((clip) => (
          <div
            className={clip.id === selectedId ? "pv-history-row is-selected" : "pv-history-row"}
            role="row"
            tabIndex={0}
            key={clip.id}
            onClick={() => onOpen(clip.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(clip.id);
              }
            }}
          >
            <span className="pv-history-doc"><ClipboardList size={17} /></span>
            <span className="pv-history-row-main">
              <strong>{clip.title}</strong>
              <small>{formatAge(clip.updatedAt)} - {formatBytes(textBytes(clip.content))}</small>
            </span>
            <span className={`pv-chip pv-chip-${shortFormat(clip.format).toLowerCase()}`}>{shortFormat(clip.format)}</span>
            <span className="pv-history-secure"><Lock size={15} /></span>
            <span className="pv-owner-pill">{clip.starred ? "Team" : "You"}</span>
            <span className="pv-history-menu">
              <button
                type="button"
                aria-label={clip.pinned ? `Unpin ${clip.title}` : `Pin ${clip.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin(clip);
                }}
              >
                <Pin size={15} fill={clip.pinned ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                aria-label={clip.starred ? `Unstar ${clip.title}` : `Star ${clip.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleStar(clip);
                }}
              >
                <Star size={15} fill={clip.starred ? "currentColor" : "none"} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={`More actions for ${clip.title}`} onClick={(event) => event.stopPropagation()}>
                    <MoreHorizontal size={17} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="pv-menu" align="end">
                  <DropdownMenuItem onSelect={() => onOpen(clip.id)}>Open clip</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onTogglePin(clip)}>{clip.pinned ? "Unpin clip" : "Pin clip"}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onToggleStar(clip)}>{clip.starred ? "Remove star" : "Star clip"}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
        ))}
        {!clips.length && <p className="pv-empty-text">No clips match this view.</p>}
      </div>
      <a className="pv-history-view-all" href="/history">View all history</a>
    </section>
  );
}

function ToolsPanel({ clipboardId, storageUsage, onPaste, onImport, onExport, onPassword, onCopyLink, onCopyLatest, onNewClip }) {
  const storagePercent = Math.min(100, Math.round((storageUsage / storageBudgetBytes) * 100));

  return (
    <section className="pv-tools-panel pv-section-panel" aria-label="Clipboard tools">
      <header>
        <span>Clipboard {clipboardId}</span>
        <h1>Tools</h1>
        <p>Secondary actions live here so the editor can stay focused and visible.</p>
      </header>
      <div className="pv-tools-grid">
        <ActionButton icon={ClipboardPaste} variant="primary" onClick={onPaste}>Paste from clipboard</ActionButton>
        <ActionButton icon={Upload} onClick={onImport}>Import file</ActionButton>
        <ActionButton icon={Download} onClick={onExport}>Export board</ActionButton>
        <ActionButton icon={Lock} onClick={onPassword}>Password</ActionButton>
        <ActionButton icon={Link2} onClick={onCopyLink}>Copy link</ActionButton>
        <ActionButton icon={ClipboardCopy} onClick={onCopyLatest}>Copy latest</ActionButton>
        <ActionButton icon={FilePlus2} onClick={onNewClip}>New clip</ActionButton>
      </div>
      <div className="pv-tools-storage">
        <span>Storage</span>
        <strong>{formatBytes(storageUsage)} / {formatBytes(storageBudgetBytes)}</strong>
        <i><b style={{ width: `${storagePercent}%` }} /></i>
        <p>Local-first storage with remote sync fallback when configured.</p>
      </div>
    </section>
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
