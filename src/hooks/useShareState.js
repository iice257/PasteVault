import { useMemo, useSyncExternalStore } from "react";
import { isDetached, readShareState, subscribeShare } from "../features/clipboard/sharing";

// The sharing facts for one clipboard on this device: locked, canEdit, the token held, and whether
// another device has disconnected this one. Updates the moment any of them change.
export function useShareState(clipboardId) {
  const snapshot = useSyncExternalStore(
    (listener) => subscribeShare(clipboardId, listener),
    () => JSON.stringify({ ...readShareState(clipboardId), detached: isDetached(clipboardId) }),
    () => JSON.stringify({ locked: false, lockHash: "", token: "", tokenHash: "", canEdit: true, detached: false })
  );
  return useMemo(() => JSON.parse(snapshot), [snapshot]);
}
