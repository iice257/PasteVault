import { arrayToBase64, base64ToArray } from "../clipboard/clipboard-store.js";

import { gcmTagBytes, maxCipherBytes, maxFileBytes } from "./limits.js";

export { gcmTagBytes, maxCipherBytes, maxFileBytes };

const keyBytes = 32;
const ivBytes = 12;

export class FileCryptoError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "FileCryptoError";
    this.code = code;
  }
}

function aad(attachmentId) {
  return new TextEncoder().encode(`pastevault:file:${attachmentId}`);
}

async function importKey(keyBase64, usages) {
  const raw = base64ToArray(keyBase64);
  if (raw.length !== keyBytes) throw new FileCryptoError("Invalid file key.", "bad-key");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}

// Encrypts one file with a fresh random key and IV. The attachment id is bound in as
// additional authenticated data so a ciphertext cannot be swapped onto another attachment.
export async function encryptFile(bytes, attachmentId) {
  const plain = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
  if (plain.length === 0) throw new FileCryptoError("That file is empty.", "empty");
  if (plain.length > maxFileBytes) throw new FileCryptoError("That file is over 5 MB.", "too-large");

  const rawKey = crypto.getRandomValues(new Uint8Array(keyBytes));
  const iv = crypto.getRandomValues(new Uint8Array(ivBytes));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(attachmentId) }, key, plain);
  return {
    ciphertext: new Uint8Array(encrypted),
    key: arrayToBase64(rawKey),
    iv: arrayToBase64(iv)
  };
}

export async function decryptFile(ciphertext, { key, iv, id }) {
  if (!(ciphertext instanceof Uint8Array)) ciphertext = new Uint8Array(ciphertext);
  if (ciphertext.length <= gcmTagBytes || ciphertext.length > maxCipherBytes) {
    throw new FileCryptoError("This file is damaged.", "bad-size");
  }
  try {
    const cryptoKey = await importKey(key, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToArray(iv), additionalData: aad(id) },
      cryptoKey,
      ciphertext
    );
    return new Uint8Array(plain);
  } catch (error) {
    if (error instanceof FileCryptoError) throw error;
    throw new FileCryptoError("Could not decrypt this file. It may be damaged or the key does not match.", "decrypt-failed");
  }
}
