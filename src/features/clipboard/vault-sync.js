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

export function createSessionId() {
  return `session_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function getDeviceId() {
  const existing = window.localStorage.getItem(deviceIdKey);
  if (existing) return existing;
  const next = `device_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  window.localStorage.setItem(deviceIdKey, next);
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
  const raw = window.localStorage.getItem(sessionStateKey(vaultId));
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
  window.localStorage.setItem(sessionStateKey(vaultId), JSON.stringify(normalized));
  return normalized;
}

export function writeDraftState(vaultId, sessionId, draft) {
  window.localStorage.setItem(draftStateKey(vaultId, sessionId), JSON.stringify(draft));
}

export function clearDraftState(vaultId, sessionId) {
  window.localStorage.removeItem(draftStateKey(vaultId, sessionId));
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
