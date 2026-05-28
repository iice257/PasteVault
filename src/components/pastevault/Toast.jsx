import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "../../lib/utils";

export function Toast({ message, tone = "success", onClose }) {
  if (!message) return null;

  const Icon = tone === "error" ? AlertCircle : CheckCircle2;

  return (
    <div className={cn("toast", "pv-toast", `pv-toast-${tone}`)} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <Icon size={24} />
      <div>
        <strong>{message}</strong>
        <span>{tone === "error" ? "Check the highlighted action and try again." : "Ready when you are."}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close toast">
        <X size={18} />
      </button>
    </div>
  );
}
