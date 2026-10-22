import { getDeviceId } from "./vault-sync";

export const heartbeatMs = 25_000;

// A short, honest name for this browser, shown to the other devices ("Chrome on Windows").
export function describeThisDevice() {
  const agent = navigator.userAgent ?? "";
  const browser = /Edg\//.test(agent) ? "Edge"
    : /OPR\//.test(agent) ? "Opera"
      : /Firefox\//.test(agent) ? "Firefox"
        : /Chrome\//.test(agent) || /CriOS\//.test(agent) ? "Chrome"
          : /Safari\//.test(agent) ? "Safari"
            : "Browser";
  const system = /iPhone/.test(agent) ? "iPhone"
    : /iPad/.test(agent) ? "iPad"
      : /Android/.test(agent) ? "Android"
        : /Windows/.test(agent) ? "Windows"
          : /Mac OS X/.test(agent) ? "Mac"
            : /CrOS/.test(agent) ? "ChromeOS"
              : /Linux/.test(agent) ? "Linux"
                : "";
  return system ? `${browser} on ${system}` : browser;
}

async function post(clipboardId, body, headers = {}) {
  const response = await fetch(`/api/presence/${encodeURIComponent(clipboardId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = new Error(`Presence request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function sendHeartbeat(clipboardId) {
  return post(clipboardId, { deviceId: getDeviceId(), label: describeThisDevice() });
}

export function disconnectDevice(clipboardId, targetDeviceId, writeToken = "") {
  return post(
    clipboardId,
    { action: "disconnect", deviceId: getDeviceId(), targetDeviceId },
    writeToken ? { "X-PasteVault-Write-Token": writeToken } : {}
  );
}

export function rejoinClipboard(clipboardId) {
  return post(clipboardId, { action: "rejoin", deviceId: getDeviceId() });
}
