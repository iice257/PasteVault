import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const boardId = `sync-${Date.now()}`;

function editorValue(page) {
  return page.getByLabel("Clipboard content").inputValue();
}

async function waitForEditorValue(page, matcher, description) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const value = await editorValue(page).catch(() => "");
    if (typeof matcher === "string" ? value.includes(matcher) : matcher(value)) {
      return value;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  permissions: ["clipboard-read", "clipboard-write"]
});

await context.addInitScript(() => {
  window.localStorage.setItem("pastevault-theme", "light");
});

const pageA = await context.newPage();
const pageB = await context.newPage();

for (const page of [pageA, pageB]) {
  page.on("pageerror", (error) => {
    throw error;
  });
}

await pageA.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
await pageB.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
await pageA.locator(".vault-theme.theme-light").waitFor();
await pageB.locator(".vault-theme.theme-light").waitFor();

await pageA.getByRole("button", { name: "Theme toggle" }).click();
await pageB.locator(".vault-theme.theme-dark").waitFor();

await pageA.getByLabel("Workspace navigation").getByRole("button", { name: "History" }).click();
await pageB.locator(".pv-dashboard-stage.pv-section-history").waitFor();
await pageA.getByLabel("Workspace navigation").getByRole("button", { name: "Editor" }).click();
await pageB.locator(".pv-dashboard-stage.pv-section-editor").waitFor();

const autosaveContent = `{
  "sync": "autosave-on-${boardId}",
  "ok": true
}`;
await pageA.getByLabel("Clipboard content").fill(autosaveContent);
await waitForEditorValue(pageB, `autosave-on-${boardId}`, "autosaved content on peer page");

await pageA.getByRole("button", { name: /Autosave on/i }).click();
await pageB.getByRole("button", { name: /Autosave off/i }).waitFor();

const privateDraft = `{
  "sync": "private-draft-${boardId}",
  "saved": false
}`;
await pageA.getByLabel("Clipboard content").fill(privateDraft);
await pageA.waitForTimeout(1600);
const peerBeforeSave = await editorValue(pageB);
if (peerBeforeSave.includes(`private-draft-${boardId}`)) {
  throw new Error("Autosave-off leaked unsaved content to another session.");
}

await pageA.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
await waitForEditorValue(pageB, `private-draft-${boardId}`, "manual save content on peer page");

const discardedDraft = `{
  "sync": "discard-confirm-${boardId}",
  "saved": false
}`;
await pageA.getByLabel("Clipboard content").fill(discardedDraft);
let sawDiscardPrompt = false;
pageA.once("dialog", async (dialog) => {
  sawDiscardPrompt = true;
  await dialog.dismiss();
});
await pageA.getByRole("button", { name: "Reload latest" }).click();
if (!sawDiscardPrompt) {
  throw new Error("Reload latest did not ask before discarding unsaved edits.");
}
await waitForEditorValue(pageA, `discard-confirm-${boardId}`, "local draft after cancelled reload");

const localConflictDraft = `{
  "sync": "local-conflict-${boardId}",
  "saved": false
}`;
await pageA.getByLabel("Clipboard content").fill(localConflictDraft);

const peerSavedContent = `{
  "sync": "peer-saved-${boardId}",
  "saved": true
}`;
await pageB.getByLabel("Clipboard content").fill(peerSavedContent);
await pageB.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
await pageA.getByText(/External changes available|Conflict/i).first().waitFor({ timeout: 8000 });

await pageA.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
await pageA.getByText(/changed elsewhere|reload latest/i).first().waitFor({ timeout: 8000 });

await context.close();
await browser.close();
console.log("Sync checks passed.");
