import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const boardId = `files-flow-${Date.now()}`;

// A real 1x1 PNG so the content is a valid image.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const document = Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(3000, 7)]);

const browser = await chromium.launch({ channel: "msedge" });
const newPage = async (viewport = { width: 1280, height: 1000 }) => {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    throw error;
  });
  return page;
};

const editor = (page) => page.getByLabel("Clipboard content");
const panel = (page) => page.getByRole("region", { name: "Encrypted files" });
const row = (page, name) => panel(page).getByRole("listitem").filter({ hasText: name });

try {
  const deviceA = await newPage();
  await deviceA.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });

  // Paste first: the empty state leads with it and states the privacy promise.
  await panel(deviceA).getByText("Paste an image or file").waitFor();
  await panel(deviceA).getByText(/Encrypted before it leaves your device\. Up to 5 MB, kept for 7 days\./).waitFor();

  // Attach with the file picker.
  await panel(deviceA).getByLabel("Attach files").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: png });
  await row(deviceA, "shot.png").getByText(/days left/).waitFor({ timeout: 15000 });
  await row(deviceA, "shot.png").getByText(/7 days left|6 days left/).waitFor();

  // Paste a screenshot from the system clipboard into the editor.
  await editor(deviceA).click();
  await deviceA.evaluate((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    document.querySelector('[aria-label="Clipboard content"]').dispatchEvent(event);
  }, [...png]);
  await row(deviceA, "Pasted image").getByText(/days left/).waitFor({ timeout: 15000 });

  // Pasting real text next to a file still pastes text, not an attachment.
  const before = await panel(deviceA).getByRole("listitem").count();
  await deviceA.evaluate((bytes) => {
    const data = new DataTransfer();
    data.setData("text/plain", "plain text wins");
    data.items.add(new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    document.querySelector('[aria-label="Clipboard content"]').dispatchEvent(event);
  }, [...png]);
  await deviceA.waitForTimeout(600);
  assert.equal(await panel(deviceA).getByRole("listitem").count(), before, "text on the clipboard wins over a file");

  // An unsaved draft survives attaching a file.
  const draft = '{"unsaved":"draft that must survive"}';
  await editor(deviceA).fill(draft);
  await panel(deviceA).getByLabel("Attach files").setInputFiles({
    name: "terms.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: document
  });
  await row(deviceA, "terms.docx").getByText(/days left/).waitFor({ timeout: 15000 });
  assert.equal(await editor(deviceA).inputValue(), draft, "unsaved text is kept when a file is attached");

  // Too large: refused with a specific message, nothing uploaded.
  await panel(deviceA).getByLabel("Attach files").setInputFiles({
    name: "big.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1)
  });
  await row(deviceA, "big.bin").getByText(/over 5 MB/).waitFor();
  await row(deviceA, "big.bin").getByRole("button", { name: /Dismiss big\.bin/ }).click();
  await row(deviceA, "big.bin").waitFor({ state: "detached" });

  // Device B receives the files and downloads byte-identical content.
  const deviceB = await newPage({ width: 390, height: 844 });
  await deviceB.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
  await row(deviceB, "shot.png").waitFor({ timeout: 20000 });
  await row(deviceB, "terms.docx").waitFor();

  const [download] = await Promise.all([
    deviceB.waitForEvent("download"),
    row(deviceB, "shot.png").getByRole("button", { name: "Download shot.png" }).click()
  ]);
  assert.equal(download.suggestedFilename(), "shot.png");
  assert.deepEqual(await readFile(await download.path()), png, "downloaded bytes match the original");

  const [docDownload] = await Promise.all([
    deviceB.waitForEvent("download"),
    row(deviceB, "terms.docx").getByRole("button", { name: "Download terms.docx" }).click()
  ]);
  assert.deepEqual(await readFile(await docDownload.path()), document, "documents round trip too");

  const overflow = await deviceB.evaluate(() => window.document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `no horizontal overflow on mobile (${overflow}px)`);

  // Removing a file deletes it on the server and on the other device.
  await row(deviceA, "terms.docx").getByRole("button", { name: "Remove terms.docx" }).click();
  await row(deviceA, "terms.docx").waitFor({ state: "detached" });
  await row(deviceB, "terms.docx").waitFor({ state: "detached", timeout: 20000 });

  console.log("File flow checks passed.");
} finally {
  await browser.close();
}
