import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const boardId = `files-viewer-${Date.now()}`;

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const text = (value) => Buffer.from(value, "utf8");
const pdf = text("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const samples = [
  { name: "shot.png", mimeType: "image/png", buffer: png },
  { name: "config.json", mimeType: "application/json", buffer: text('{"name":"vault","items":[1,2,3],"ok":true}') },
  { name: "notes.md", mimeType: "text/markdown", buffer: text("# Heading\n\nSome **bold** text and a [link](https://example.com).\n\n<script>window.__xss = 1</script>\n") },
  { name: "people.csv", mimeType: "text/csv", buffer: text("name,role\nAda,Engineer\nGrace,Admiral\n") },
  { name: "script", mimeType: "text/plain", buffer: text("#!/usr/bin/env python3\nimport os\n\ndef main():\n    print(os.getcwd())\n") },
  { name: "paper.pdf", mimeType: "application/pdf", buffer: pdf },
  { name: "archive.zip", mimeType: "application/zip", buffer: Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(2000, 3)]) },
  { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.concat([Buffer.from("MZ"), Buffer.alloc(2000, 5)]) }
];

const browser = await chromium.launch({ channel: "msedge" });
const newPage = async (viewport) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    throw error;
  });
  return page;
};

const panel = (page) => page.getByRole("region", { name: "Encrypted files" });
const row = (page, name) => panel(page).getByRole("listitem").filter({ hasText: name });
const viewer = (page) => page.getByRole("dialog", { name: /^Preview of/ });
const open = async (page, name) => {
  await row(page, name).getByRole("button", { name: `Open ${name}` }).click();
  await viewer(page).waitFor();
};
const close = async (page) => {
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "detached" });
};

try {
  const page = await newPage({ width: 1280, height: 1000 });
  await page.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });

  for (const sample of samples) {
    await panel(page).getByLabel("Attach files").setInputFiles(sample);
    await row(page, sample.name).getByText(/days left/).waitFor({ timeout: 15000 });
  }

  // Closing the viewer returns focus to the file that opened it.
  await open(page, "config.json");
  await close(page);
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    "Open config.json",
    "focus returns to the opener"
  );

  // Image: shown from the decrypted bytes, with a thumbnail tile in the list.
  assert.ok(await row(page, "shot.png").locator(".pv-file-tile img").count(), "image attachments get a thumbnail");
  await open(page, "shot.png");
  await viewer(page).locator("img.pv-viewer-image").waitFor();
  await close(page);

  // JSON: auto-detected, with a formatted view.
  await open(page, "config.json");
  await viewer(page).getByText(/JSON \(auto-detected\)|JSON/).first().waitFor();
  await viewer(page).locator(".pv-viewer-source .hljs").waitFor();
  await viewer(page).getByRole("button", { name: "Formatted" }).click();
  await viewer(page).getByText('"name": "vault"').waitFor();
  await close(page);

  // Markdown formatted view renders and never runs embedded HTML.
  await open(page, "notes.md");
  await viewer(page).getByRole("button", { name: "Formatted" }).click();
  await viewer(page).locator(".pv-viewer-markdown h1", { hasText: "Heading" }).waitFor();
  assert.equal(await viewer(page).locator(".pv-viewer-markdown script").count(), 0, "scripts are never rendered");
  assert.equal(await page.evaluate(() => window.__xss), undefined, "embedded scripts never run");
  await close(page);

  // CSV renders as a table.
  await open(page, "people.csv");
  await viewer(page).getByRole("button", { name: "Formatted" }).click();
  await viewer(page).locator(".pv-viewer-table td", { hasText: "Grace" }).waitFor();
  await close(page);

  // Extensionless script is detected from its content, and the language can be overridden.
  await open(page, "script");
  await viewer(page).getByText(/Python \(auto-detected\)/).waitFor();
  await viewer(page).getByLabel("Language").selectOption({ label: "JavaScript" });
  await viewer(page).getByText("JavaScript", { exact: true }).last().waitFor();
  await close(page);
  await open(page, "script");
  assert.equal(await viewer(page).getByLabel("Language").inputValue(), "javascript", "the chosen language is remembered");
  await close(page);

  // PDF gets an embedded viewer plus a fallback link.
  await open(page, "paper.pdf");
  await viewer(page).locator("iframe.pv-viewer-pdf").waitFor();
  await viewer(page).getByRole("link", { name: /Open in a new tab/ }).waitFor();
  await close(page);

  // Everything else is carried, not opened.
  await open(page, "archive.zip");
  await viewer(page).getByText("No preview for this file type").waitFor();
  await viewer(page).getByRole("button", { name: "Download", exact: true }).waitFor();
  await close(page);

  await open(page, "setup.exe");
  await viewer(page).getByText(/never run or previewed/).waitFor();
  await close(page);

  // Tools shows how much of the clipboard's file allowance is used.
  await page.getByRole("button", { name: /^Tools$/ }).first().click();
  await page.getByText("Encrypted files", { exact: true }).waitFor();
  await page.getByText(/8 of 10 files. Each file/).waitFor();

  // Mobile: the viewer fills the screen with no sideways scroll.
  const mobile = await newPage({ width: 390, height: 844 });
  await mobile.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
  await mobile.getByRole("button", { name: "Editor", exact: true }).click();
  await row(mobile, "config.json").waitFor({ timeout: 20000 });
  await open(mobile, "config.json");
  await viewer(mobile).locator(".pv-viewer-source").waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `no horizontal overflow on mobile (${overflow}px)`);
  const box = await viewer(mobile).boundingBox();
  assert.ok(box.width >= 389, "viewer is full width on mobile");
  await close(mobile);

  console.log("File viewer checks passed.");
} finally {
  await browser.close();
}
