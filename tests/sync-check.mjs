import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const boardId = `sync-${Date.now()}`;
const remoteClips = new Map();
const remoteSessions = new Map();

function routeId(url) {
  return decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
}

async function installRemoteRoutes(context) {
  await context.route("**/api/clip/**", async (route) => {
    const id = routeId(route.request().url());
    if (route.request().method() === "GET") {
      const record = remoteClips.get(id);
      await route.fulfill({
        status: record ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(record ?? { error: "Clipboard not found." })
      });
      return;
    }

    if (route.request().method() === "PUT") {
      const record = JSON.parse(route.request().postData() ?? "{}");
      const baseVersion = Number(route.request().headers()["x-pastevault-base-version"]);
      const current = remoteClips.get(id);
      const currentVersion = Number(current?.contentVersion ?? 1);
      if (current && Number.isFinite(baseVersion) && currentVersion > baseVersion && route.request().headers()["x-pastevault-force"] !== "true") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Clipboard changed since this edit began.", currentVersion, baseVersion })
        });
        return;
      }
      remoteClips.set(id, { ...record, updatedAt: new Date().toISOString() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
      return;
    }

    await route.fulfill({ status: 405 });
  });

  await context.route("**/api/session/**", async (route) => {
    const id = routeId(route.request().url());
    if (route.request().method() === "GET") {
      const state = remoteSessions.get(id);
      await route.fulfill({
        status: state ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(state ?? { error: "Vault session not found." })
      });
      return;
    }

    if (route.request().method() === "PUT") {
      const state = JSON.parse(route.request().postData() ?? "{}");
      remoteSessions.set(id, { ...state, updatedAt: new Date().toISOString() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
      return;
    }

    await route.fulfill({ status: 405 });
  });
}

function editorValue(page) {
  return page.getByLabel("Clipboard content").inputValue();
}

async function waitForEditorValue(page, matcher, description) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = await editorValue(page).catch(() => "");
    if (typeof matcher === "string" ? value.includes(matcher) : matcher(value)) {
      return value;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function makeContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ["clipboard-read", "clipboard-write"]
  });
  await installRemoteRoutes(context);
  await context.addInitScript(() => {
    window.localStorage.setItem("pastevault-theme", "light");
  });
  return context;
}

const browser = await chromium.launch({ channel: "msedge" });
const contextA = await makeContext(browser);
const contextB = await makeContext(browser);
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();

const shareBoardId = `share-${Date.now()}`;
const shareContent = `share-link-${shareBoardId}`;
const shareContextA = await makeContext(browser);
const sharePageA = await shareContextA.newPage();
await sharePageA.goto(`${baseUrl}/clip/${shareBoardId}`, { waitUntil: "networkidle" });
await sharePageA.locator(".vault-theme.theme-light").waitFor();
await sharePageA.locator(".section-title-row .select-trigger").click();
await sharePageA.getByRole("menuitem", { name: "Plain text" }).click();
await sharePageA.getByLabel("Clipboard content").fill(shareContent);
await sharePageA.getByRole("button", { name: "Top bar options" }).click();
await sharePageA.getByRole("menuitem", { name: "Copy link" }).click();
await sharePageA.locator(".pv-toast").getByText(/synced link copied/i).waitFor({ timeout: 10000 });

const shareContextB = await makeContext(browser);
const sharePageB = await shareContextB.newPage();
await sharePageB.goto(`${baseUrl}/clip/${shareBoardId}`, { waitUntil: "networkidle" });
await waitForEditorValue(sharePageB, shareContent, "copied link content on clean device");
await shareContextA.close();
await shareContextB.close();

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
await pageB.locator(".vault-theme.theme-dark").waitFor({ timeout: 10000 });

await pageA.getByLabel("Workspace navigation").getByRole("button", { name: "History" }).click();
await pageB.locator(".pv-dashboard-stage.pv-section-history").waitFor({ timeout: 10000 });
await pageA.getByLabel("Workspace navigation").getByRole("button", { name: "Editor" }).click();
await pageB.locator(".pv-dashboard-stage.pv-section-editor").waitFor({ timeout: 10000 });

const autosaveContent = `{
  "sync": "autosave-on-${boardId}",
  "ok": true
}`;
await pageA.getByLabel("Clipboard content").fill(autosaveContent);
await waitForEditorValue(pageB, `autosave-on-${boardId}`, "autosaved content on peer device");

await pageA.getByRole("button", { name: /Autosave on/i }).click();
await pageB.getByRole("button", { name: /Autosave off/i }).waitFor({ timeout: 10000 });

const privateDraft = `{
  "sync": "private-draft-${boardId}",
  "saved": false
}`;
await pageA.getByLabel("Clipboard content").fill(privateDraft);
await pageA.waitForTimeout(2200);
const peerBeforeSave = await editorValue(pageB);
if (peerBeforeSave.includes(`private-draft-${boardId}`)) {
  throw new Error("Autosave-off leaked unsaved content to another device.");
}

await pageA.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
await waitForEditorValue(pageB, `private-draft-${boardId}`, "manual save content on peer device");

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
await pageA.getByText(/External changes available|Conflict/i).first().waitFor({ timeout: 10000 });

await pageA.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
await pageA.getByText(/changed elsewhere|reload latest/i).first().waitFor({ timeout: 10000 });

await contextA.close();
await contextB.close();
await browser.close();
console.log("Sync checks passed.");
