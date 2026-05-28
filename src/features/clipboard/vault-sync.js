export const vaultMessageTypes = {
  sessionState: "session-state",
  contentSaved: "content-saved"
};

export const remoteSessionPollMs = 2500;
export const remoteContentPollMs = 3000;

const deviceIdKey = "pastevault:device-id";

export function sessionStateKey(vaultId) {
  return `pastevault:session:${vaultId}`;
}

export function draftStateKey(vaultId, sessionId) {
  return `pastevault:draft:${vaultId}:${sessionId}`;
}

export function preservedDraftStateKey(vaultId) {
  return `pastevault:draft-preserved:${vaultId}`;
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local storage can be unavailable in restricted browser modes.
  }
}

export function createSessionId() {
  return `session_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function getDeviceId() {
  const existing = readStorage(deviceIdKey);
  if (existing) return existing;
  const next = `device_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  writeStorage(deviceIdKey, next);
  return next;
}

export function normalizeSessionState(value, vaultId) {
  if (!value || typeof value !== "object") return null;
  if (value.vaultId !== vaultId) return null;
  return {
    vaultId,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
    deviceId: typeof value.deviceId === "string" ? value.deviceId : "",
    theme: value.theme === "dark" || value.theme === "light" ? value.theme : undefined,
    viewMode: typeof value.viewMode === "string" ? value.viewMode : undefined,
    selectedTab: typeof value.selectedTab === "string" ? value.selectedTab : undefined,
    isLocked: typeof value.isLocked === "boolean" ? value.isLocked : undefined,
    editorSettings: value.editorSettings && typeof value.editorSettings === "object" ? value.editorSettings : {},
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
  };
}

export function readSessionState(vaultId) {
  const raw = readStorage(sessionStateKey(vaultId));
  if (!raw) return null;
  try {
    return normalizeSessionState(JSON.parse(raw), vaultId);
  } catch {
    return null;
  }
}

export function writeSessionState(vaultId, state) {
  const normalized = normalizeSessionState(state, vaultId);
  if (!normalized) return null;
  return writeStorage(sessionStateKey(vaultId), JSON.stringify(normalized)) ? normalized : null;
}

export function writeDraftState(vaultId, sessionId, draft) {
  writeStorage(draftStateKey(vaultId, sessionId), JSON.stringify(draft));
}

export function clearDraftState(vaultId, sessionId) {
  removeStorage(draftStateKey(vaultId, sessionId));
}

export function preserveDraftState(vaultId, draft) {
  writeStorage(preservedDraftStateKey(vaultId), JSON.stringify({
    ...draft,
    preservedAt: new Date().toISOString()
  }));
}

export function readPreservedDraftState(vaultId) {
  const raw = readStorage(preservedDraftStateKey(vaultId));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (!draft || draft.vaultId !== vaultId || typeof draft.localContent !== "object") return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearPreservedDraftState(vaultId) {
  removeStorage(preservedDraftStateKey(vaultId));
}

export function createVaultChannel(vaultId) {
  if (!("BroadcastChannel" in window)) return null;
  return new BroadcastChannel(`pastevault:vault:${vaultId}`);
}

export function postVaultMessage(channel, message) {
  if (!channel) return;
  channel.postMessage(message);
}

export async function fetchRemoteSessionState(vaultId) {
  const response = await fetch(`/api/session/${encodeURIComponent(vaultId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Remote session fetch failed with ${response.status}`);
  return normalizeSessionState(await response.json(), vaultId);
}

export async function pushRemoteSessionState(vaultId, state) {
  const normalized = normalizeSessionState(state, vaultId);
  if (!normalized) return;
  const response = await fetch(`/api/session/${encodeURIComponent(vaultId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized)
  });
  if (!response.ok) throw new Error(`Remote session save failed with ${response.status}`);
}
