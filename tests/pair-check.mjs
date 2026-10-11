import { chromium } from "playwright";

const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const boardId = `pair-${Date.now()}`;

const browser = await chromium.launch({
  channel: "msedge",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
});

try {
  // Device A shows a QR and one-time code for its clipboard.
  const deviceA = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  deviceA.on("pageerror", (error) => {
    throw error;
  });
  await deviceA.goto(`${baseUrl}/clip/${boardId}`, { waitUntil: "networkidle" });
  await deviceA.getByRole("button", { name: "Top bar options" }).click();
  await deviceA.getByRole("menuitem", { name: "Pair device" }).click();

  const dialogA = deviceA.getByRole("dialog", { name: "Pair a device" });
  await dialogA.waitFor();
  await dialogA.locator(".pv-pair-qr svg").waitFor();
  const shownCode = (await dialogA.locator(".pv-pair-code strong").textContent()).replace(/\s/g, "");
  if (!/^[A-HJ-KM-NP-Z2-9]{6}$/.test(shownCode)) {
    throw new Error(`Expected a 6-character pairing code, saw "${shownCode}".`);
  }

  // Device B joins by typing the code on the landing page, submitting with Enter.
  const deviceB = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  deviceB.on("pageerror", (error) => {
    throw error;
  });
  await deviceB.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await deviceB.getByRole("button", { name: /join with a code/i }).click();
  const dialogB = deviceB.getByRole("dialog", { name: "Pair a device" });
  await dialogB.waitFor();
  if (await dialogB.getByRole("tab").count()) {
    throw new Error("Landing join dialog should not offer a Show code tab without a clipboard.");
  }

  const input = dialogB.getByLabel("Pairing code");
  await input.fill("ab");
  await input.press("Enter");
  await dialogB.getByText(/enter the 6-character code/i).waitFor();

  await input.fill(shownCode.toLowerCase());
  await input.press("Enter");
  await deviceB.waitForURL(new RegExp(`/clip/${boardId}$`));

  // The code is single use.
  await deviceB.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await deviceB.getByRole("button", { name: /join with a code/i }).click();
  const reuse = deviceB.getByRole("dialog", { name: "Pair a device" });
  await reuse.getByLabel("Pairing code").fill(shownCode);
  await reuse.getByRole("button", { name: "Join clipboard" }).click();
  await reuse.getByText(/invalid or has expired/i).waitFor();

  // Camera starts and stops cleanly (fake media device in CI).
  await reuse.getByRole("button", { name: "Scan QR" }).click();
  await reuse.locator(".pv-pair-scanner video").waitFor();
  await reuse.getByRole("button", { name: "Stop camera" }).click();
  await reuse.getByLabel("Pairing code").waitFor();

  // Browsers without BarcodeDetector load the jsQR fallback and still start the camera.
  const legacy = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  legacy.on("pageerror", (error) => {
    throw error;
  });
  await legacy.addInitScript(() => {
    delete window.BarcodeDetector;
  });
  await legacy.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await legacy.getByRole("button", { name: /join with a code/i }).click();
  const legacyDialog = legacy.getByRole("dialog", { name: "Pair a device" });
  await legacyDialog.getByRole("button", { name: "Scan QR" }).click();
  await legacyDialog.locator(".pv-pair-scanner video").waitFor();
  await legacy.waitForTimeout(800);
  if (await legacyDialog.locator(".pv-pair-error").count()) {
    throw new Error("Camera fallback should not report an error.");
  }
  await legacyDialog.getByRole("button", { name: "Stop camera" }).click();

  // Escape closes the dialog.
  await deviceB.keyboard.press("Escape");
  await reuse.waitFor({ state: "detached" });

  // Mobile layout has no horizontal overflow with the dialog open.
  await deviceB.getByRole("button", { name: /join with a code/i }).click();
  const overflow = await deviceB.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) throw new Error(`Pairing dialog overflows the mobile viewport by ${overflow}px.`);

  console.log("Pairing checks passed.");
} finally {
  await browser.close();
}
