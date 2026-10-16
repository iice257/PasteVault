import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "../../lib/utils";

export function Toast({ message, tone = "success", onClose }) {
  if (!message) return null;

  const Icon = tone === "error" ? AlertCircle : CheckCircle2;

  return (
    <div className={cn("toast", "pv-toast", `pv-toast-${tone}`)} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <Icon size={20} />
      <strong>{message}</strong>
      <button type="button" onClick={onClose} aria-label="Close toast">
        <X size={16} />
      </button>
    </div>
  );
}
