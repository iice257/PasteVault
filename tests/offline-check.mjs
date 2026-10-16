import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const boardId = `offline-${Date.now()}`;

const offlineText = JSON.stringify({ note: "typed while offline" });
const browser = await chromium.launch({ channel: "msedge" });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });

  const editor = page.getByLabel("Clipboard content");
  await editor.fill(JSON.stringify({ note: "online draft" }));
  await page.getByRole("status").getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });

  // Edit with the network gone: the text must stay on screen and be kept on this device.
  await context.setOffline(true);
  await editor.fill(offlineText);
  await page.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(800);
  assert.equal(await editor.inputValue(), offlineText, "offline edit stays in the editor");
  const stored = await page.evaluate((id) => window.localStorage.getItem(`pastevault:clipboard:${id}`), boardId);
  assert.ok(stored?.includes("typed while offline"), "offline edit is kept in local storage");

  // Back online: the edit reaches the server, so a second device sees it.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.locator(".vault-card-actions").getByRole("button", { name: "Save" }).click();

  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const otherPage = await other.newPage();
  await otherPage.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
  await otherPage.getByLabel("Clipboard content").waitFor();
  await otherPage.waitForFunction(
    (text) => document.querySelector('[aria-label="Clipboard content"]')?.value === text,
    offlineText,
    { timeout: 20000 }
  );
  assert.equal(await otherPage.getByLabel("Clipboard content").inputValue(), offlineText, "reconnected edit reaches another device");

  await other.close();
  await context.close();
  console.log("Offline checks passed.");
} finally {
  await browser.close();
}
