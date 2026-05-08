import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4173";
const outputDir = fileURLToPath(new URL("../verification-shots/", import.meta.url));
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const theme of ["dark", "light"]) {
  await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outputDir, `${theme}.png`), fullPage: true });
  const checks = await page.locator(".sidebar, .editor-card, .history-panel, .details-panel").count();
  if (checks !== 4) {
    throw new Error(`Expected 4 primary UI regions in ${theme} mode, found ${checks}.`);
  }
}

await browser.close();
console.log("Visual screenshots captured.");
