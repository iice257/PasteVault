import { cn } from "../../lib/utils";

export function AppLogo({ className, compact = false, iconOnly = false, style }) {
  return (
    <a className={cn("pv-logo", compact && "pv-logo-compact", iconOnly && "pv-logo-icon-only", className)} href="/" aria-label="PasteVault home" style={style}>
      <img src="/pastevault-logo.png" alt="PasteVault" />
    </a>
  );
}
