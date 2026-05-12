import { Clipboard } from "lucide-react";
import { cn } from "../../lib/utils";

export function AppLogo({ className, compact = false }) {
  return (
    <a className={cn("pv-logo", compact && "pv-logo-compact", className)} href="/" aria-label="PasteVault home">
      <span aria-hidden="true">
        <Clipboard size={compact ? 22 : 28} strokeWidth={2.5} />
      </span>
      <strong>PasteVault</strong>
    </a>
  );
}
