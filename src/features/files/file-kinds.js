import { fileExtension } from "./attachments.js";

const extensionGroups = {
  image: { exts: "png jpg jpeg gif webp avif svg bmp ico", mimes: { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon" } },
  video: { exts: "mp4 m4v webm mov ogv mkv avi", mimes: { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg", mkv: "video/x-matroska", avi: "video/x-msvideo" } },
  audio: { exts: "mp3 wav ogg oga m4a aac flac opus weba", mimes: { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", opus: "audio/ogg", weba: "audio/webm" } },
  pdf: { exts: "pdf", mimes: { pdf: "application/pdf" } },
  text: {
    exts: "txt text md markdown log json jsonc csv tsv xml html htm css scss js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cs php sh bash zsh ps1 sql yaml yml toml ini conf cfg env diff patch lua dart r pl scala vue svelte graphql gql tex srt vtt rtf-text",
    mimes: {}
  }
};

const categoryByExtension = {
  document: "doc docx odt rtf pages wpd",
  spreadsheet: "xls xlsx xlsm ods numbers csv tsv",
  slides: "ppt pptx odp key",
  archive: "zip rar 7z tar gz tgz bz2 xz zst",
  design: "psd ai fig sketch xd indd eps",
  ebook: "epub mobi azw3",
  executable: "exe msi apk dmg app bat cmd com scr jar deb rpm pkg ipa appimage"
};

// Themed tile appearance by category. `tone` maps to a colour in the stylesheet.
export const tileThemes = {
  document: { label: "Document", tone: "blue" },
  spreadsheet: { label: "Spreadsheet", tone: "green" },
  slides: { label: "Slides", tone: "orange" },
  archive: { label: "Archive", tone: "amber" },
  design: { label: "Design", tone: "purple" },
  ebook: { label: "Ebook", tone: "teal" },
  executable: { label: "Executable", tone: "red", caution: true },
  pdf: { label: "PDF", tone: "rose" },
  image: { label: "Image", tone: "pink" },
  video: { label: "Video", tone: "indigo" },
  audio: { label: "Audio", tone: "violet" },
  text: { label: "Text", tone: "slate" },
  unknown: { label: "File", tone: "grey" }
};

const kindByExtension = new Map();
const mimeByExtension = new Map();
for (const [kind, group] of Object.entries(extensionGroups)) {
  for (const ext of group.exts.split(" ")) kindByExtension.set(ext, kind);
  for (const [ext, mime] of Object.entries(group.mimes)) mimeByExtension.set(ext, mime);
}
const categoryLookup = new Map();
for (const [category, list] of Object.entries(categoryByExtension)) {
  for (const ext of list.split(" ")) categoryLookup.set(ext, category);
}

function startsWith(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

// Identifies binary formats from their first bytes. Returns the kind or "" when unknown.
export function sniffKind(bytes) {
  if (!bytes || bytes.length < 4) return "";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) || startsWith(bytes, [0xff, 0xd8, 0xff]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) || startsWith(bytes, [0x42, 0x4d])) return "image";
  if (ascii(bytes, 0, 4) === "RIFF" && bytes.length >= 12) {
    const form = ascii(bytes, 8, 4);
    if (form === "WEBP") return "image";
    if (form === "WAVE") return "audio";
    if (form === "AVI ") return "video";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return "image";
    if (brand === "M4A ") return "audio";
    return "video";
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (ascii(bytes, 0, 4) === "OggS" || ascii(bytes, 0, 4) === "fLaC" || ascii(bytes, 0, 3) === "ID3") return "audio";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio";
  return "";
}

// Heuristic: valid UTF-8 without control characters in the first bytes.
export function looksLikeText(bytes) {
  const sample = bytes.subarray(0, 4096);
  if (!sample.length) return false;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length < 4096 ? sample : sample.subarray(0, sample.length - 4));
    return true;
  } catch {
    return false;
  }
}

function looksLikeSvg(bytes) {
  if (!looksLikeText(bytes)) return false;
  return /<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 2048)));
}

// Decides how a file is shown. The extension proposes a kind and the file's own bytes must agree,
// so a renamed file or a spoofed type never reaches a player or viewer it was not made for.
export function classifyFile(name, headBytes) {
  const ext = fileExtension(name);
  const proposed = kindByExtension.get(ext) ?? "";
  const category = categoryLookup.get(ext) ?? "";
  const sniffed = sniffKind(headBytes);

  let kind = "file";
  if (proposed === "image" && ext === "svg") {
    kind = looksLikeSvg(headBytes) ? "image" : "file";
  } else if (proposed === "text") {
    kind = looksLikeText(headBytes) ? "text" : "file";
  } else if (proposed && sniffed === proposed) {
    kind = proposed;
  } else if (!proposed && sniffed === "image") {
    kind = "image";
  } else if (!proposed && sniffed && sniffed !== "") {
    kind = sniffed;
  } else if (!proposed && !ext && looksLikeText(headBytes)) {
    kind = "text";
  }

  const mime = kind === "text" || kind === "file" ? "" : (mimeByExtension.get(ext) ?? sniffMime(headBytes) ?? defaultMime(kind));
  const tileKey = kind !== "file" && kind !== "text" ? kind : (category || (kind === "text" ? "text" : "unknown"));
  return {
    kind,
    category: category || (kind === "file" ? "unknown" : kind),
    mime,
    extension: ext,
    previewable: kind !== "file",
    theme: tileThemes[tileKey] ?? tileThemes.unknown
  };
}

function sniffMime(bytes) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}

function defaultMime(kind) {
  return { image: "image/png", video: "video/mp4", audio: "audio/mpeg", pdf: "application/pdf" }[kind] ?? "application/octet-stream";
}

// Cheap guess from the file name alone, for places that have not decrypted anything yet.
export function guessKind(name) {
  return kindByExtension.get(fileExtension(name)) ?? "file";
}

export function themeForFile(name, kind = "file") {
  const category = categoryLookup.get(fileExtension(name));
  if (kind !== "file" && kind !== "text") return tileThemes[kind] ?? tileThemes.unknown;
  return tileThemes[category] ?? (kind === "text" ? tileThemes.text : tileThemes.unknown);
}
