import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4173";
const outputDir = fileURLToPath(new URL("../verification-shots/", import.meta.url));
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

await page.addInitScript(() => window.localStorage.setItem("pastevault-theme", "dark"));
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.screenshot({ path: join(outputDir, "root.png"), fullPage: true });
const landingRegions = await page.locator(".vault-landing, .landing-input-shell").count();
if (landingRegions !== 2) {
  throw new Error(`Expected paste-first landing experience, found ${landingRegions} landing regions.`);
}
const landingCards = await page.locator(".vault-landing .ambient-card").count();
if (landingCards !== 0) {
  throw new Error(`Expected landing background image to replace old card artifacts, found ${landingCards} rendered cards.`);
}
const landingBackground = await page.locator(".vault-landing").evaluate((element) => getComputedStyle(element).backgroundImage);
if (!landingBackground.includes("landing-background.svg")) {
  throw new Error("Expected landing to use the single landing background image asset.");
}

for (const theme of ["dark", "light"]) {
  await page.addInitScript((value) => window.localStorage.setItem("pastevault-theme", value), theme);
  await page.goto(`${baseUrl}/clip/visual-check-board`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outputDir, `${theme}.png`), fullPage: true });
  const checks = await page.locator(".vault-clipboard-card, .editor-card, .history-panel").count();
  if (checks !== 3) {
    throw new Error(`Expected 3 primary clipboard regions in ${theme} mode, found ${checks}.`);
  }
  const heading = await page.locator(".vault-card-head h1").textContent();
  if (heading !== "Clipboard visual-check...") {
    throw new Error(`Expected deep-link clipboard id in ${theme} mode, found ${heading}.`);
  }
}

await page.setViewportSize({ width: 390, height: 844 });

for (const theme of ["dark", "light"]) {
  await page.addInitScript((value) => window.localStorage.setItem("pastevault-theme", value), theme);
  await page.goto(`${baseUrl}/clip/visual-check-board`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outputDir, `${theme}-mobile.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) {
    throw new Error(`Expected no horizontal overflow in ${theme} mobile mode, found ${overflow}px.`);
  }
  const navHeight = await page.locator(".sidebar").evaluate((element) => Math.round(element.getBoundingClientRect().height));
  if (navHeight > 72) {
    throw new Error(`Expected compact mobile navigation in ${theme} mode, found ${navHeight}px high.`);
  }
}

await browser.close();
console.log("Visual screenshots captured.");
