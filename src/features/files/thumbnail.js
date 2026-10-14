import { maxThumbChars } from "./attachments.js";

const size = 96;
const rasterTypes = /^image\/(png|jpeg|webp|gif|bmp|avif)$/;

// Makes a tiny square preview of an image. It travels inside the encrypted clip, so other
// devices can show a thumbnail without downloading the file. Returns undefined if it cannot.
export async function makeThumbnail(file) {
  if (!rasterTypes.test(file.type) || typeof createImageBitmap !== "function") return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    bitmap.close?.();
    for (const quality of [0.72, 0.55, 0.4]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= maxThumbChars) return url;
    }
  } catch {
    // A missing thumbnail only means the tile shows the file type instead.
  }
  return undefined;
}
