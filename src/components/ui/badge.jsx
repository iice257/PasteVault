import { cn } from "../../lib/utils";

export function Badge({ className, tone = "neutral", children }) {
  return <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>;
}
