import {
  clipIdPattern,
  formatDate,
  normalizeClipboardPayload,
  normalizeClip,
  normalizeFormat,
  normalizeVaultSettings,
  parseClipboardExport,
  validateContent
} from "../src/features/clipboard/clipboard-store.js";

const settings = normalizeVaultSettings({
  autosaveEnabled: false,
  unexpected: "ignored"
});
if (settings.autosaveEnabled !== false || Object.keys(settings).length !== 1) {
  throw new Error("Vault settings should keep only supported boolean settings.");
}

if (normalizeVaultSettings({ autosaveEnabled: "false" }).autosaveEnabled !== true) {
  throw new Error("Invalid autosave settings should fall back to the default.");
}

if (normalizeFormat("TXT") !== "Plain text" || normalizeFormat("Unknown") !== "Plain text") {
  throw new Error("Format aliases and unknown formats should normalize safely.");
}

const normalized = normalizeClip({
  id: "../bad",
  title: "  Example clip  ",
  content: "hello",
  format: "TXT",
  tags: [" ok ", "", 42, "release"],
  createdAt: "not-a-date",
  updatedAt: "also-bad"
});

if (!clipIdPattern.test(normalized.id) || normalized.title !== "Example clip" || normalized.format !== "Plain text") {
  throw new Error("Malformed clips should be normalized into safe local clips.");
}

if (normalized.tags.join(",") !== "ok,release" || Number.isNaN(new Date(normalized.updatedAt).getTime())) {
  throw new Error("Clip tags and dates should be sanitized.");
}

const payload = normalizeClipboardPayload({
  clips: [normalized],
  selectedId: "missing"
});
if (payload.selectedId !== normalized.id) {
  throw new Error("Payload selection should fall back to the first normalized clip.");
}

const exportPayload = parseClipboardExport(JSON.stringify({
  clipboardId: "../bad",
  clips: [normalized],
  selectedId: normalized.id
}));
if (!exportPayload || exportPayload.clipboardId !== "" || exportPayload.selectedId !== normalized.id) {
  throw new Error("Clipboard exports should sanitize board ids while preserving valid clips.");
}

if (!validateContent("{", "JSON").startsWith("Invalid JSON")) {
  throw new Error("JSON validation should reject malformed JSON.");
}

if (formatDate("not-a-date") !== "Unknown date") {
  throw new Error("Invalid dates should render with a stable fallback.");
}

console.log("Store checks passed.");
