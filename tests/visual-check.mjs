import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4173";
const outputDir = fileURLToPath(new URL("../verification-shots/", import.meta.url));
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });

async function createPage(theme, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.addInitScript((value) => window.localStorage.setItem("pastevault-theme", value), theme);
  return page;
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 2) {
    throw new Error(`Expected no horizontal overflow on ${label}, found ${overflow}px.`);
  }
}

const landingPage = await createPage("light", { width: 1920, height: 1080 });
await landingPage.goto(`${baseUrl}/?visual=${Date.now()}`, { waitUntil: "networkidle" });
await landingPage.screenshot({ path: join(outputDir, "root.png"), fullPage: false });

const landingRegions = await landingPage.locator(".vault-landing.pv-landing, .landing-input-shell.pv-open-shell").count();
if (landingRegions !== 2) {
  throw new Error(`Expected paste-first landing shell and input, found ${landingRegions} landing regions.`);
}

const landingBackground = await landingPage.locator(".vault-landing").evaluate((element) => getComputedStyle(element).backgroundImage);
if (!landingBackground.includes("landing-background.svg")) {
  throw new Error("Expected landing to use the supplied single background image asset.");
}

const retiredArtifacts = await landingPage.locator(".ambient-card, .ambient-cards, .reactbits-backdrop").count();
if (retiredArtifacts !== 0) {
  throw new Error(`Expected retired artifact layers to be removed from the DOM, found ${retiredArtifacts}.`);
}

const openButtonVisible = await landingPage.getByRole("button", { name: "Open clipboard" }).first().isVisible();
if (!openButtonVisible) {
  throw new Error("Expected visible landing Open clipboard action.");
}
await assertNoOverflow(landingPage, "landing desktop");
await landingPage.close();

for (const theme of ["light", "dark"]) {
  const page = await createPage(theme, { width: 1920, height: 1080 });
  await page.goto(`${baseUrl}/clip/visual-check-board?visual=${theme}-${Date.now()}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outputDir, `${theme}.png`), fullPage: false });

  const rootClass = await page.locator(".pv-dashboard").getAttribute("class");
  if (!rootClass?.includes(`theme-${theme}`)) {
    throw new Error(`Expected ${theme} dashboard class, found ${rootClass}.`);
  }

  const workbench = await page.locator(".pv-workbench.vault-clipboard-card").count();
  if (workbench !== 1) {
    throw new Error(`Expected one central clipboard editor in ${theme} mode, found ${workbench}.`);
  }

  const heading = await page.locator(".vault-card-head h1").textContent();
  if (!heading?.includes("Clipboard visual-check")) {
    throw new Error(`Expected deep-link clipboard id heading in ${theme} mode, found ${heading}.`);
  }

  const requiredShell = {
    sidebar: await page.locator(".pv-sidebar").isVisible(),
    header: await page.locator(".pv-dashboard-header").isVisible(),
    search: await page.locator(".pv-global-search").isVisible(),
    editor: await page.locator(".pv-code-surface").isVisible(),
    details: await page.locator(".pv-clip-details").isVisible(),
    history: await page.locator(".pv-recent-strip").isVisible()
  };
  const missing = Object.entries(requiredShell).filter(([, visible]) => !visible).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Expected desktop ${theme} PasteVault regions to be visible, missing: ${missing.join(", ")}.`);
  }

  const primaryActions = await page.getByRole("banner").getByRole("button").count();
  if (primaryActions < 4) {
    throw new Error(`Expected functional top-right dashboard actions in ${theme} mode, found ${primaryActions}.`);
  }
  await assertNoOverflow(page, `${theme} desktop`);
  await page.close();
}

for (const theme of ["light", "dark"]) {
  const page = await createPage(theme, { width: 390, height: 844 });
  await page.goto(`${baseUrl}/clip/visual-check-board?visual=${theme}-mobile-${Date.now()}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outputDir, `${theme}-mobile.png`), fullPage: false });

  const rootClass = await page.locator(".pv-dashboard").getAttribute("class");
  if (!rootClass?.includes(`theme-${theme}`)) {
    throw new Error(`Expected ${theme} mobile dashboard class, found ${rootClass}.`);
  }

  const mobilePieces = await page.locator(".pv-mobile-hero, .pv-code-surface, .pv-recent-strip, .pv-bottom-paste").count();
  if (mobilePieces !== 4) {
    throw new Error(`Expected mobile hero, editor, recent history, and bottom paste bar in ${theme} mobile mode, found ${mobilePieces}.`);
  }

  const mobileActions = await page.locator(".pv-mobile-actions button").count();
  if (mobileActions < 3) {
    throw new Error(`Expected three mobile clipboard actions in ${theme} mode, found ${mobileActions}.`);
  }
  if (await page.locator(".pv-sidebar").isVisible()) {
    throw new Error(`Expected desktop sidebar to collapse away in ${theme} mobile mode.`);
  }
  await assertNoOverflow(page, `${theme} mobile`);
  await page.close();
}

await browser.close();
console.log("Visual screenshots captured.");
