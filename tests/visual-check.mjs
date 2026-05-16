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
if (landingBackground !== "none") {
  throw new Error(`Expected plain landing background with no artifact image, found ${landingBackground}.`);
}

const retiredArtifacts = await landingPage.locator(".ambient-card, .ambient-cards, .reactbits-backdrop, .pv-floating-card, .pv-terminal-card, .pv-sticky-note, .pv-link-preview").count();
if (retiredArtifacts !== 0) {
  throw new Error(`Expected retired artifact layers to be removed from the DOM, found ${retiredArtifacts}.`);
}

const openButtonVisible = await landingPage.getByRole("button", { name: "Open clipboard" }).first().isVisible();
if (!openButtonVisible) {
  throw new Error("Expected visible landing Open clipboard action.");
}
const footerVisibleAfterScroll = await landingPage.locator(".pv-landing-footer").count();
if (footerVisibleAfterScroll !== 1) {
  throw new Error("Expected appended landing sections and footer to exist below the first viewport.");
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

  const dashboardBackground = await page.locator(".pv-dashboard").evaluate((element) => getComputedStyle(element).backgroundImage);
  if (dashboardBackground !== "none") {
    throw new Error(`Expected plain ${theme} dashboard background with no artifact gradients, found ${dashboardBackground}.`);
  }

  const dashboardArtifacts = await page.locator(".pv-dashboard-floaters, .pv-dashboard-floaters .pv-floating-card, .pv-dashboard-floaters .pv-floating-code, .pv-orb").count();
  if (dashboardArtifacts !== 0) {
    throw new Error(`Expected dashboard background artifacts removed in ${theme} mode, found ${dashboardArtifacts}.`);
  }

  const requiredShell = {
    header: await page.locator(".pv-dashboard-header").isVisible(),
    sidebar: await page.locator(".pv-sidebar").isVisible(),
    editor: await page.locator(".pv-code-surface").isVisible(),
    details: await page.locator(".pv-clip-details").count(),
    history: await page.locator(".pv-history-page").count()
  };
  const missing = Object.entries(requiredShell)
    .filter(([name, value]) => (name === "details" || name === "history" ? value !== 0 : !value))
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Expected desktop ${theme} PasteVault regions to be visible, missing: ${missing.join(", ")}.`);
  }

  const visibleRail = await page.locator(".pv-sidebar").evaluate((element) => getComputedStyle(element).display);
  if (visibleRail === "none") {
    throw new Error(`Expected sidebar navigation visible in primary ${theme} dashboard view.`);
  }

  await page.getByRole("button", { name: "History" }).click();
  if (!(await page.locator(".pv-history-page").isVisible())) {
    throw new Error(`Expected ${theme} history section to open from the sidebar.`);
  }
  await page.getByRole("button", { name: "Details" }).click();
  if (!(await page.locator(".pv-clip-details").isVisible())) {
    throw new Error(`Expected ${theme} details section to open from the sidebar.`);
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

  const mobilePieces = await page.locator(".pv-mobile-hero, .pv-code-surface, .pv-bottom-paste").count();
  if (mobilePieces !== 3) {
    throw new Error(`Expected mobile hero, editor, and bottom paste bar in ${theme} mobile mode, found ${mobilePieces}.`);
  }

  const mobileActions = await page.locator(".pv-mobile-actions button").count();
  if (mobileActions < 3) {
    throw new Error(`Expected three mobile clipboard actions in ${theme} mode, found ${mobileActions}.`);
  }
  const mobileSectionTabs = await page.locator(".pv-mobile-section-tabs button").count();
  if (mobileSectionTabs !== 4) {
    throw new Error(`Expected four mobile section tabs in ${theme} mode, found ${mobileSectionTabs}.`);
  }
  if (await page.locator(".pv-sidebar").isVisible()) {
    throw new Error(`Expected desktop sidebar to collapse away in ${theme} mobile mode.`);
  }
  await assertNoOverflow(page, `${theme} mobile`);
  await page.close();
}

await browser.close();
console.log("Visual screenshots captured.");
