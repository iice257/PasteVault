import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId } from "../features/clipboard/vault-sync";
import { disconnectDevice, heartbeatMs, rejoinClipboard, sendHeartbeat } from "../features/clipboard/presence";
import { setDetached } from "../features/clipboard/sharing";

// Announces this device to the clipboard while the page is visible and returns who else is here.
// If another device disconnects this one, sync stops until the person chooses to reconnect.
export function useDevices(clipboardId, { enabled, detached, writeToken }) {
  const [devices, setDevices] = useState([]);
  const [failed, setFailed] = useState(false);
  const [deviceId] = useState(getDeviceId);
  const timer = useRef(0);

  const beat = useCallback(async () => {
    try {
      const result = await sendHeartbeat(clipboardId);
      setFailed(false);
      if (result.revoked) {
        setDetached(clipboardId, true);
        setDevices([]);
        return;
      }
      setDevices(result.devices ?? []);
    } catch {
      setFailed(true);
    }
  }, [clipboardId]);

  useEffect(() => {
    if (!enabled || detached) return undefined;
    const run = () => {
      window.clearTimeout(timer.current);
      if (document.visibilityState === "visible") void beat();
      timer.current = window.setTimeout(run, heartbeatMs);
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", run);
    };
  }, [beat, detached, enabled]);

  const disconnect = useCallback(async (target) => {
    const result = await disconnectDevice(clipboardId, target, writeToken);
    await beat();
    return result.disconnected ?? 0;
  }, [beat, clipboardId, writeToken]);

  const reconnect = useCallback(async () => {
    await rejoinClipboard(clipboardId);
    setDetached(clipboardId, false);
  }, [clipboardId]);

  return { devices, deviceId, failed, disconnect, reconnect };
}
