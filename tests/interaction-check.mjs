import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4173";
const boardId = `interaction-${Date.now()}`;
const storageKey = `pastevault:clipboard:${boardId}`;

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  permissions: ["clipboard-read", "clipboard-write"],
  acceptDownloads: true
});
const page = await context.newPage();

page.on("pageerror", (error) => {
  throw error;
});

await page.addInitScript((key) => {
  window.localStorage.setItem("pastevault-theme", "dark");
  window.localStorage.removeItem(key);
}, storageKey);

await page.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
await page.locator(".vault-theme.theme-dark").waitFor();

await page.getByRole("button", { name: "Theme toggle" }).click();
await page.locator(".vault-theme.theme-light").waitFor();
await page.getByRole("button", { name: "Theme toggle" }).click();
await page.locator(".vault-theme.theme-dark").waitFor();

await page.getByRole("banner").getByRole("button", { name: "Copy link" }).click();
await page.getByRole("status").getByText("Clipboard link copied").waitFor();

await page.getByRole("button", { name: "Password optional" }).click();
await page.getByPlaceholder("8+ characters").fill("short");
await page.getByRole("button", { name: /^Enable$/ }).click();
await page.getByText("Use at least 8 characters").waitFor();
await page.keyboard.press("Escape");

await page.locator(".section-title-row .select-trigger").click();
await page.getByRole("menuitem", { name: "Plain text" }).click();
await page.getByLabel("Clipboard content").fill("interaction button test");
await page.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
await page.getByRole("status").getByText("Clip saved successfully").waitFor();

await page.locator(".vault-card-actions").getByRole("button", { name: "More actions" }).click();
await page.getByRole("menuitem", { name: "New clip" }).click();
if (await page.getByLabel("Clipboard content").inputValue() !== "") {
  throw new Error("New clip action did not clear the editor.");
}

await page.getByLabel("Clipboard content").fill("{\"from\":\"dropdown\"}");
await page.locator(".section-title-row .select-trigger").click();
await page.getByRole("menuitem", { name: "JSON" }).click();
await page.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
await page.getByRole("status").getByText("Clip saved successfully").waitFor();

await page.getByLabel("Workspace navigation").getByRole("button", { name: "History" }).click();
await page.locator(".history-toolbar .sort-trigger").click();
await page.getByRole("menuitem", { name: "Largest" }).click();
await page.locator(".history-toolbar .filter-trigger").click();
await page.getByRole("menuitem", { name: "JSON" }).click();
await page.getByPlaceholder("Search history").fill("dropdown");
await page.getByText("{\"from\":\"dropdown\"}").first().waitFor();

await page.getByLabel("Workspace navigation").getByRole("button", { name: "Details" }).click();
await page.locator(".details-panel input[placeholder='Add tag...']").fill("tested");
await page.locator(".details-panel input[placeholder='Add tag...']").press("Enter");
await page.locator(".details-panel .tag").filter({ hasText: "tested" }).waitFor();
await page.getByRole("button", { name: "Preview" }).click();
await page.locator(".details-panel .pv-inspector-preview").getByLabel("Clipboard content").waitFor();
await page.getByLabel("Selected clip").getByRole("button", { name: "Details" }).click();

await page.locator("input[type='file']").setInputFiles({
  name: "interaction-notes.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("imported from interaction check")
});
await page.getByRole("status").getByText(/Imported .*clip/).waitFor();

const exportedClipTimestamp = new Date().toISOString();
await page.locator("input[type='file']").setInputFiles([
  {
    name: "bulk-notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Bulk note\nImported in the same picker")
  },
  {
    name: "pastevault-export.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      clipboardId: "backup-board",
      exportedAt: exportedClipTimestamp,
      selectedId: "clip_restored_export",
      clips: [{
        id: "clip_restored_export",
        title: "Restored export clip",
        content: "restored from a PasteVault export",
        format: "Plain text",
        pinned: false,
        starred: false,
        tags: ["backup"],
        createdAt: exportedClipTimestamp,
        updatedAt: exportedClipTimestamp
      }]
    }))
  }
]);
await page.getByRole("status").getByText("Imported 2 clips").waitFor();
await page.getByLabel("Workspace navigation").getByRole("button", { name: "History" }).click();
await page.locator(".history-toolbar .filter-trigger").click();
await page.getByRole("menuitem", { name: "All types" }).click();
await page.getByPlaceholder("Search history").fill("Restored export clip");
await page.getByLabel("Clipboard history rows").getByText("Restored export clip").waitFor();
await page.locator(".pv-history-table-card .pv-history-menu button[aria-label^='More actions for']").first().click();
await page.getByRole("menuitem", { name: "Open clip" }).click();
await page.getByLabel("Clipboard content").waitFor();

const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Top bar more actions" }).click();
await page.getByRole("menuitem", { name: "Export board" }).click();
await downloadPromise;

await page.getByLabel("Workspace navigation").getByRole("button", { name: "Editor" }).click();
await page.locator(".vault-card-actions").getByRole("button", { name: "More actions" }).click();
await page.getByRole("menuitem", { name: "Copy latest" }).click();
await page.getByRole("status").getByText("Clip copied").waitFor();

await page.goto(`${baseUrl}/history`, { waitUntil: "networkidle" });
await page.locator(".pv-history-page").getByRole("heading", { name: "Recent history" }).waitFor();
await page.locator(".pv-history-page .pv-history-card").first().waitFor();

await context.close();
await browser.close();
console.log("Interaction checks passed.");
