import assert from "node:assert/strict";
import {
  clipIdPattern,
  formatDate,
  normalizeClipboardPayload,
  normalizeClip,
  normalizeFormat,
  normalizeVaultSettings,
  parseClipboardExport,
  validateContent,
  detectFormat,
  resolveFormat
} from "../src/features/clipboard/clipboard-store.js";

const settings = normalizeVaultSettings({
  autosaveEnabled: false,
  unexpected: "ignored"
});
if (settings.autosaveEnabled !== false || settings.expireAfter !== "never" || Object.keys(settings).length !== 2) {
  throw new Error("Vault settings should keep only the supported settings.");
}
if (normalizeVaultSettings({ expireAfter: "1d" }).expireAfter !== "1d" || normalizeVaultSettings({ expireAfter: "forever" }).expireAfter !== "never") {
  throw new Error("Delete-after should accept only the offered choices.");
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

if (validateContent("{") !== "" || !validateContent("  ").startsWith("Paste or type")) {
  throw new Error("Validation should only refuse empty text.");
}

for (const [text, expected] of [
  ['{"a":1}', "JSON"], ["[1,2]", "JSON"], ["{ not json", "Plain text"], ["https://example.com/a?b=1", "Plain text"],
  ["curl -X POST https://x.dev", "cURL"], ["SELECT * FROM users;", "SQL"], ["<div>hi</div>", "HTML"],
  ["npm install react", "BASH"], ["const a = 1;", "JavaScript"], ["# Title\n\nbody", "Markdown"],
  ["a,b,c\n1,2,3", "CSV"], ["just some words", "Plain text"]
]) {
  if (detectFormat(text) !== expected) throw new Error(`detectFormat(${JSON.stringify(text)}) should be ${expected}, got ${detectFormat(text)}.`);
}
if (resolveFormat("https://example.com", "JSON") !== "Plain text" || resolveFormat('{"a":1}', "JSON") !== "JSON" || resolveFormat("x", "SQL") !== "SQL") {
  throw new Error("A hand-picked JSON format must fall back when the text is not JSON, and other picks stay.");
}

if (formatDate("not-a-date") !== "Unknown date") {
  throw new Error("Invalid dates should render with a stable fallback.");
}

// --- save status ----------------------------------------------------------------
{
  const { describeSaveStatus } = await import("../src/features/clipboard/save-status.js");
  assert.equal(describeSaveStatus("Hosted sync saved").label, "Saved");
  assert.equal(describeSaveStatus("Saved locally").label, "Saved");
  assert.equal(describeSaveStatus("Autosave on").label, "Saved");
  assert.equal(describeSaveStatus("Saving...").label, "Saving");
  assert.equal(describeSaveStatus("Unsaved changes").tone, "pending");
  assert.equal(describeSaveStatus("Offline, saved locally").label, "Saved on this device");
  assert.equal(describeSaveStatus("Conflict: remote version changed").tone, "conflict");
  assert.equal(describeSaveStatus("Saved", { conflict: true }).label, "Needs review");
  assert.equal(describeSaveStatus("Autosave off", { autosaveEnabled: false }).label, "Autosave off");
}

console.log("Store checks passed.");
