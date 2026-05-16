import { cn } from "../../lib/utils";

export function AppLogo({ className, compact = false }) {
  return (
    <a className={cn("pv-logo", compact && "pv-logo-compact", className)} href="/" aria-label="PasteVault home">
      <img src="/pastevault-logo.png" alt="PasteVault" />
    </a>
  );
}
