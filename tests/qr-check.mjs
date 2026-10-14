import qrcode from "qrcode-generator";
import jsQR from "jsqr";

// Proves the QR we render is readable by the jsQR fallback scanner.
const payloads = [
  "https://thepastevault.vercel.app/clip/pair-check-1791734618691",
  "https://thepastevault.vercel.app/clip/pv_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
  "ABC234"
];

for (const payload of payloads) {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 3;
  const scale = 6;
  const size = (count + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const px = ((row + quiet) * scale + y) * size + (col + quiet) * scale + x;
          data[px * 4] = 7;
          data[px * 4 + 1] = 8;
          data[px * 4 + 2] = 10;
        }
      }
    }
  }
  const decoded = jsQR(data, size, size);
  if (decoded?.data !== payload) {
    throw new Error(`jsQR could not read the generated QR for ${payload} (got ${decoded?.data}).`);
  }
}
console.log("QR decode checks passed.");
