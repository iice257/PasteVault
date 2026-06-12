import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const boardId = `mobile-${Date.now()}`;

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 2) {
    throw new Error(`Expected no horizontal overflow on ${label}, found ${overflow}px.`);
  }
}

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["clipboard-read", "clipboard-write"],
  acceptDownloads: true
});
const page = await context.newPage();

page.on("pageerror", (error) => {
  throw error;
});

await page.addInitScript(() => {
  window.localStorage.setItem("pastevault-theme", "dark");
});

await page.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
await page.locator(".pv-dashboard.theme-dark").waitFor();

if (await page.locator(".pv-sidebar").isVisible()) {
  throw new Error("Expected the desktop sidebar to stay hidden on mobile.");
}

await assertNoOverflow(page, "initial mobile editor");

await page.locator(".pv-mobile-actions").getByRole("button", { name: "Copy link" }).click();
await page.getByRole("status").getByText("Clipboard link copied").waitFor();

await page.locator(".pv-mobile-actions").getByRole("button", { name: "Password" }).click();
await page.getByPlaceholder("8+ characters").fill("short");
await page.getByRole("button", { name: "Enable" }).click();
await page.getByText("Use at least 8 characters").waitFor();
await page.keyboard.press("Escape");

await page.locator(".pv-bottom-paste input").fill("{\"mobile\":\"composer save\"}");
await page.locator(".pv-bottom-paste").getByRole("button", { name: "Save" }).click();
await page.getByRole("status").getByText("Clip saved successfully").waitFor();

await page.getByRole("button", { name: "History" }).click();
await page.locator(".pv-history-table-card").waitFor();
await page.getByPlaceholder("Search history").fill("mobile");
if ((await page.locator(".pv-history-row").count()) < 1) {
  throw new Error("Expected mobile history search to keep the saved clip visible.");
}
await assertNoOverflow(page, "mobile history");

await page.getByRole("button", { name: "Details" }).click();
await page.locator(".pv-clip-details").waitFor();
await page.locator(".details-panel input[placeholder='Add tag...']").fill("mobile");
await page.locator(".details-panel input[placeholder='Add tag...']").press("Enter");
await page.locator(".details-panel .tag").filter({ hasText: "mobile" }).waitFor();
await assertNoOverflow(page, "mobile details");

await page.getByRole("button", { name: "Tools" }).click();
await page.locator(".pv-tools-panel").waitFor();
const toolButtons = await page.locator(".pv-tools-grid button").count();
if (toolButtons < 7) {
  throw new Error(`Expected all mobile tool actions to be reachable, found ${toolButtons}.`);
}
await page.locator(".pv-tools-grid").getByRole("button", { name: "New clip" }).click();
await page.locator(".pv-code-surface").waitFor();
if (await page.getByLabel("Clipboard content").inputValue() !== "") {
  throw new Error("Expected mobile New clip action to clear the editor.");
}
await assertNoOverflow(page, "mobile tools to editor");

await browser.close();
console.log("Mobile checks passed.");
