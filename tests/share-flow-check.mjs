import { chromium } from "playwright";

// Real browser, real dev API: view-only link, delete-after and the open-devices list across two devices.
const baseUrl = process.env.PASTEHQ_URL ?? "http://127.0.0.1:4000";
const id = `share-${Date.now()}`;
const failures = [];

function check(name, condition, detail = "") {
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`${condition ? "ok  " : "FAIL"} ${name}`);
}

// Polls a (possibly async) predicate in the page; Playwright's waitForFunction does not await promises.
async function waitFor(page, predicate, arg, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, arg).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

const open = (page, name) => page.getByRole("button", { name, exact: true }).first().click();

const browser = await chromium.launch({ channel: "msedge" });
try {
  const owner = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await owner.goto(`${baseUrl}/clip/${id}`);
  const editor = owner.getByLabel("Clipboard content");
  await editor.fill("\"shared with care\"");
  const saved = await waitFor(owner, async (clipId) => (await fetch(`/api/clip/${clipId}`)).ok, id, 20000);
  check("owner's text reaches the server", saved);

  // Make the link view-only.
  await open(owner, "Details");
  await owner.getByRole("button", { name: "Make link view-only" }).click();
  await owner.getByRole("button", { name: "Make view-only" }).click();
  await owner.getByText("Link is view-only", { exact: true }).waitFor();
  const token = await owner.evaluate((clipId) => JSON.parse(localStorage.getItem(`pastevault:write-token:${clipId}`) ?? "null")?.token ?? "", id);
  check("owner holds an edit token", token.length >= 16);
  await open(owner, "Editor");
  check("owner can still edit", await editor.isEditable());
  await open(owner, "Details");

  // A device with only the plain link can read but not change.
  const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let viewer = await viewerContext.newPage();
  await viewer.goto(`${baseUrl}/clip/${id}`);
  await viewer.getByText("View only", { exact: true }).first().waitFor({ timeout: 15000 });
  await open(viewer, "Editor");
  check("viewer sees the text", await waitFor(viewer, () => document.querySelector("textarea[aria-label='Clipboard content']")?.value === "\"shared with care\"", null));
  check("viewer cannot edit", !(await viewer.getByLabel("Clipboard content").isEditable()));
  check("viewer has no Save button", (await viewer.getByRole("button", { name: "Save", exact: true }).count()) === 0);
  const refused = await viewer.evaluate(async (clipId) => {
    const current = await (await fetch(`/api/clip/${clipId}`)).json();
    const response = await fetch(`/api/clip/${clipId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-PasteVault-Force": "true" },
      body: JSON.stringify({ ...current, contentVersion: current.contentVersion + 1 })
    });
    return response.status;
  }, id);
  check("server refuses a write without the token", refused === 403, String(refused));

  // The edit link carries the token in its fragment and then hides it.
  await viewer.close();
  viewer = await viewerContext.newPage();
  await viewer.goto(`${baseUrl}/clip/${id}#w=${token}`);
  await open(viewer, "Editor");
  await viewer.getByLabel("Clipboard content").waitFor();
  check("edit link makes the viewer an editor", await waitFor(viewer, () => !document.querySelector("textarea[aria-label='Clipboard content']")?.readOnly, null));
  check("token leaves the address bar", !viewer.url().includes("#w="));

  // Delete after. (Open devices share which section is showing, so go back to Details.)
  await open(owner, "Details");
  await owner.getByRole("radio", { name: "1 hour" }).click();
  check("expiry shows a deadline", await waitFor(owner, () => document.body.innerText.includes("deletes itself on"), null));
  const expiresAt = await owner.evaluate(async (clipId) => (await (await fetch(`/api/clip/${clipId}`)).json()).expiresAt ?? "", id);
  check("server stores an expiry about an hour out", Math.abs(new Date(expiresAt).getTime() - Date.now() - 3_600_000) < 120_000, expiresAt);

  // Devices: both pages are open, and the owner can disconnect the other.
  const listed = await waitFor(owner, () => /2 devices open/.test(document.querySelector("[data-testid='devices-card']")?.innerText ?? ""), null, 30000);
  check("owner sees two devices", listed);
  await open(owner, "Details");
  await owner.getByRole("button", { name: /^Disconnect / }).first().click();
  const detached = await waitFor(viewer, () => document.body.innerText.includes("Disconnected from this clipboard"), null, 90000);
  check("disconnected device is told", detached);
  await viewer.getByRole("button", { name: "Reconnect" }).click();
  await viewer.waitForLoadState("load");
  check("reconnect clears the notice", await waitFor(viewer, () => !document.body.innerText.includes("Disconnected from this clipboard"), null));

  // Letting anyone edit again.
  await open(owner, "Details");
  await owner.getByRole("button", { name: "Let anyone edit" }).click();
  check("lock can be lifted", await waitFor(owner, () => document.body.innerText.includes("Anyone with the link can edit"), null));
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nshare flow ok");
