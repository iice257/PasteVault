import { useMemo } from "react";
import qrcode from "qrcode-generator";

const quietZone = 3;

// Renders a QR code locally (no external service) as a crisp SVG.
export function QrCode({ value, label, className }) {
  const model = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) path += `M${col + quietZone} ${row + quietZone}h1v1h-1z`;
      }
    }
    return { size: count + quietZone * 2, path };
  }, [value]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${model.size} ${model.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={model.size} height={model.size} fill="#ffffff" />
      <path d={model.path} fill="#07080a" />
    </svg>
  );
}
