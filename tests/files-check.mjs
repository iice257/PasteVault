import assert from "node:assert/strict";
import { decryptFile, encryptFile, FileCryptoError } from "../src/features/files/file-crypto.js";
import {
  createAttachmentId,
  isExpired,
  normalizeAttachment,
  normalizeAttachments,
  sanitizeFileName,
  timeLeftLabel
} from "../src/features/files/attachments.js";
import { classifyFile, looksLikeText } from "../src/features/files/file-kinds.js";
import { maxFileBytes } from "../src/features/files/limits.js";
import { normalizeClip } from "../src/features/clipboard/clipboard-store.js";

const bytes = (...values) => new Uint8Array(values);
const text = (value) => new TextEncoder().encode(value);

// --- crypto -----------------------------------------------------------------
{
  const id = createAttachmentId();
  const plain = new Uint8Array(200_000);
  for (let offset = 0; offset < plain.length; offset += 60_000) {
    crypto.getRandomValues(plain.subarray(offset, Math.min(offset + 60_000, plain.length)));
  }
  const sealed = await encryptFile(plain, id);
  assert.equal(sealed.ciphertext.length, plain.length + 16, "ciphertext is plaintext plus a 16 byte tag");
  assert.deepEqual(await decryptFile(sealed.ciphertext, { key: sealed.key, iv: sealed.iv, id }), plain, "round trip");

  const other = await encryptFile(plain, id);
  await assert.rejects(
    decryptFile(sealed.ciphertext, { key: other.key, iv: sealed.iv, id }),
    (error) => error instanceof FileCryptoError && error.code === "decrypt-failed",
    "wrong key must fail"
  );

  const tampered = sealed.ciphertext.slice();
  tampered[10] ^= 0xff;
  await assert.rejects(decryptFile(tampered, { key: sealed.key, iv: sealed.iv, id }), FileCryptoError, "tampering must fail");

  await assert.rejects(
    decryptFile(sealed.ciphertext, { key: sealed.key, iv: sealed.iv, id: createAttachmentId() }),
    FileCryptoError,
    "ciphertext cannot be moved onto another attachment id"
  );

  await assert.rejects(decryptFile(bytes(1, 2, 3), { key: sealed.key, iv: sealed.iv, id }), FileCryptoError, "truncated data");

  const ivs = new Set();
  const keys = new Set();
  for (let index = 0; index < 40; index += 1) {
    const next = await encryptFile(text("same input"), id);
    ivs.add(next.iv);
    keys.add(next.key);
  }
  assert.equal(ivs.size, 40, "every encryption uses a fresh IV");
  assert.equal(keys.size, 40, "every file gets its own key");

  await assert.rejects(encryptFile(new Uint8Array(0), id), (error) => error.code === "empty");
  await assert.rejects(encryptFile(new Uint8Array(maxFileBytes + 1), id), (error) => error.code === "too-large");
  const atLimit = await encryptFile(new Uint8Array(maxFileBytes), id);
  assert.equal(atLimit.ciphertext.length, maxFileBytes + 16, "exactly 5 MB is accepted");
}

// --- classification ----------------------------------------------------------
{
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
  const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46);
  const pdf = text("%PDF-1.7\n%....");
  const mp4 = bytes(0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);
  const mp3 = text("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000");
  const zip = bytes(0x50, 0x4b, 3, 4, 0, 0, 0, 0);

  assert.equal(classifyFile("shot.png", png).kind, "image");
  assert.equal(classifyFile("shot.png", png).mime, "image/png");
  assert.equal(classifyFile("photo.JPG", jpeg).kind, "image");
  assert.equal(classifyFile("noext", jpeg).mime, "image/jpeg", "mime comes from the bytes when the extension is unknown");
  assert.equal(classifyFile("contract.pdf", pdf).kind, "pdf");
  assert.equal(classifyFile("clip.mp4", mp4).kind, "video");
  assert.equal(classifyFile("song.mp3", mp3).kind, "audio");

  // A renamed or spoofed file never reaches a viewer or player it was not made for.
  assert.equal(classifyFile("notes.txt", png).kind, "file", "image bytes named .txt");
  assert.equal(classifyFile("fake.png", text("<script>alert(1)</script>")).kind, "file", "script named .png");
  assert.equal(classifyFile("fake.pdf", png).kind, "file", "image named .pdf");
  assert.equal(classifyFile("fake.mp4", pdf).kind, "file", "pdf named .mp4");
  assert.equal(classifyFile("page.html", text("<h1>hi</h1>")).kind, "text", "html is previewed as source text");
  assert.equal(classifyFile("logo.svg", text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).kind, "image");
  assert.equal(classifyFile("evil.svg", text("not an svg")).kind, "file");
  assert.equal(classifyFile("README", text("# Title\n")).kind, "text", "extensionless text");
  assert.equal(looksLikeText(bytes(0, 1, 2, 3)), false);
  assert.equal(looksLikeText(text("héllo wörld")), true, "valid UTF-8");

  // Themed tiles by category.
  const tone = (name, head) => classifyFile(name, head).theme.tone;
  assert.equal(tone("a.docx", zip), "blue");
  assert.equal(tone("a.xlsx", zip), "green");
  assert.equal(tone("a.pptx", zip), "orange");
  assert.equal(tone("a.zip", zip), "amber");
  assert.equal(tone("a.psd", bytes(1, 2, 3, 4, 5)), "purple");
  assert.equal(tone("a.epub", zip), "teal");
  assert.equal(tone("a.exe", bytes(0x4d, 0x5a, 0, 0)), "red");
  assert.equal(classifyFile("a.exe", bytes(0x4d, 0x5a, 0, 0)).theme.caution, true, "executables carry a caution label");
  assert.equal(tone("a.weird", bytes(1, 2, 3, 4, 5)), "grey");
  assert.equal(classifyFile("a.docx", zip).previewable, false, "documents are carried, not opened");
}

// --- names and attachments ---------------------------------------------------
{
  assert.ok(!sanitizeFileName("../../etc/passwd").includes("/"));
  assert.ok(!sanitizeFileName("..\\..\\windows\\system32").includes("\\"));
  assert.equal(sanitizeFileName("  .hidden  "), "hidden");
  assert.equal(sanitizeFileName("a\u0000b‮c.txt"), "abc.txt", "control and bidi characters are removed");
  assert.equal(sanitizeFileName(""), "file");
  assert.equal(sanitizeFileName("x".repeat(500)).length, 120);

  const good = {
    id: createAttachmentId(),
    name: "shot.png",
    type: "image/png",
    size: 1234,
    key: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
    iv: btoa(String.fromCharCode(...new Uint8Array(12).fill(9))),
    fileId: "123e4567-e89b-12d3-a456-426614174000",
    expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString()
  };
  assert.ok(normalizeAttachment(good), "valid attachment");
  assert.equal(normalizeAttachment({ ...good, size: maxFileBytes + 1 }), null, "oversize");
  assert.equal(normalizeAttachment({ ...good, size: 0 }), null, "empty");
  assert.equal(normalizeAttachment({ ...good, key: "AAAA" }), null, "short key");
  assert.equal(normalizeAttachment({ ...good, iv: "AAAA" }), null, "short iv");
  assert.equal(normalizeAttachment({ ...good, fileId: "../../x" }), null, "bad file id");
  assert.equal(normalizeAttachment({ ...good, id: "nope" }), null, "bad attachment id");
  assert.equal(normalizeAttachment({ ...good, expiresAt: "soon" }), null, "bad date");
  assert.equal(normalizeAttachment({ ...good, name: "../x.png" }).name, ".._x.png".replace(/^\.+/, ""), "names are sanitised");

  const many = Array.from({ length: 14 }, () => ({ ...good, id: createAttachmentId() }));
  assert.equal(normalizeAttachments(many).length, 10, "at most 10 per clip");
  assert.equal(normalizeAttachments([good, good]).length, 1, "duplicate ids are dropped");
  assert.deepEqual(normalizeAttachments("nope"), []);

  assert.equal(isExpired({ expiresAt: new Date(Date.now() - 1000).toISOString() }), true);
  assert.equal(timeLeftLabel({ expiresAt: new Date(Date.now() - 1000).toISOString() }), "Expired");
  assert.match(timeLeftLabel({ expiresAt: new Date(Date.now() + 3 * 86_400_000 + 60_000).toISOString() }), /^3 days left$/);
  assert.match(timeLeftLabel({ expiresAt: new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString() }), /^5 h left$/);

  const clip = normalizeClip({ id: "clip_abc123", content: "hello", format: "Plain text", attachments: [good, { junk: true }] });
  assert.equal(clip.attachments.length, 1, "clips keep valid attachments and drop invalid ones");
  assert.deepEqual(normalizeClip({ id: "clip_abc124", content: "x", format: "Plain text" }).attachments, [], "older clips get an empty list");
}

console.log("File checks passed.");
