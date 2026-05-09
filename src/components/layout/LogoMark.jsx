import { Clipboard } from "lucide-react";

export function LogoMark({ size = "default" }) {
  return (
    <div className={`vault-logo ${size === "large" ? "large" : ""}`}>
      <span><Clipboard size={size === "large" ? 36 : 27} /></span>
      <strong>PasteVault</strong>
    </div>
  );
}
