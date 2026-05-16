import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4173";
const boardId = `functional-${Date.now()}`;
const password = "correct horse battery staple";
const largeMarker = `large-marker-${Date.now()}`;
const largeText = JSON.stringify({ marker: largeMarker, data: "0123456789abcdef".repeat(14000) }, null, 2);
const storageKey = `pastevault:clipboard:${boardId}`;

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  permissions: ["clipboard-read", "clipboard-write"]
});
const page = await context.newPage();

await page.addInitScript(() => {
  window.localStorage.setItem("pastevault-theme", "dark");
});

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByPlaceholder("Paste something or enter a clipboard link").fill("Landing paste opens a clipboard");
await page.getByRole("button", { name: /Open clipboard/i }).click();
await page.waitForURL(/\/clip\/[a-zA-Z0-9_-]+$/);
await page.getByLabel("Clipboard content").waitFor();
const openedText = await page.getByLabel("Clipboard content").inputValue();
if (!openedText.includes("Landing paste opens a clipboard")) {
  throw new Error("Landing paste did not create and open a clipboard.");
}

await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
await page.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
await page.getByLabel("Clipboard content").fill(largeText);
await page.keyboard.press("Control+S");
await page.getByRole("status").getByText("Clip saved successfully").waitFor();
await page.getByRole("button", { name: "History" }).click();
await page.getByPlaceholder("Search history").fill(largeMarker);
await page.locator(".pv-history-row").first().waitFor();

await page.getByRole("button", { name: /Password optional/i }).click();
await page.getByPlaceholder("8+ characters").fill(password);
await page.getByPlaceholder("Repeat password").fill(password);
await page.getByLabel("I understand this password cannot be recovered.").check();
await page.getByRole("button", { name: /^Enable$/ }).click();
await page.getByRole("status").getByText("Password enabled", { exact: true }).waitFor();

const protectedRecord = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
if (!protectedRecord || protectedRecord.includes(largeMarker) || !protectedRecord.includes("encryptedPayload")) {
  throw new Error("Protected clipboard storage leaked plaintext or missed encrypted payload metadata.");
}

await page.reload({ waitUntil: "networkidle" });
await page.getByText("This clipboard is password protected").waitFor();
await page.getByPlaceholder("Clipboard password").fill("wrong password");
await page.getByRole("button", { name: /^Unlock clipboard$/ }).click();
await page.getByText("Password did not unlock this clipboard.").waitFor();
await page.getByPlaceholder("Clipboard password").fill(password);
await page.getByRole("button", { name: /^Unlock clipboard$/ }).click();
await page.getByLabel("Clipboard content").waitFor();
await page.waitForFunction((marker) => {
  const editor = document.querySelector("[aria-label='Clipboard content']");
  return editor?.value.includes(marker);
}, largeMarker);

const otherId = `${boardId}-other`;
await page.goto(`${baseUrl}/clip/${otherId}`, { waitUntil: "networkidle" });
await page.getByText(largeMarker).first().waitFor({ state: "detached", timeout: 5000 }).catch(async () => {
  const body = await page.textContent("body");
  if (body?.includes(largeMarker)) {
    throw new Error("Clipboard ids are not isolated.");
  }
});

await context.close();
await browser.close();
console.log("Functional checks passed.");
