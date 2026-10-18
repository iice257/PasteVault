// One short, calm label for the many internal sync messages. Detail lives in the title attribute.
export function describeSaveStatus(syncStatus, { autosaveEnabled = true, conflict = false } = {}) {
  const raw = String(syncStatus ?? "");
  if (conflict || /conflict|external changes/i.test(raw)) return { label: "Needs review", tone: "conflict" };
  if (/saving/i.test(raw)) return { label: "Saving", tone: "pending" };
  if (/unsaved/i.test(raw)) return { label: "Unsaved changes", tone: "pending" };
  if (/^error/i.test(raw)) return { label: "Not saved", tone: "conflict" };
  if (/sync failed/i.test(raw)) return { label: "Sync failed", tone: "conflict" };
  if (/recovered/i.test(raw)) return { label: "Draft recovered", tone: "pending" };
  if (/offline|unavailable/i.test(raw)) return { label: "Saved on this device", tone: "ok" };
  if (/autosave off/i.test(raw) || (!autosaveEnabled && !/saved|synced/i.test(raw))) return { label: "Autosave off", tone: "idle" };
  return { label: "Saved", tone: "ok" };
}
