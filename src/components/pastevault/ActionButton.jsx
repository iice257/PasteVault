import { cn } from "../../lib/utils";

export function ActionButton({ icon: Icon, children, className, variant = "secondary", compact = false, ...props }) {
  return (
    <button className={cn("pv-action", `pv-action-${variant}`, compact && "pv-action-compact", className)} type="button" {...props}>
      {Icon && <Icon size={compact ? 18 : 21} strokeWidth={2.2} />}
      {children && <span>{children}</span>}
    </button>
  );
}
