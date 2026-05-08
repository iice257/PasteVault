import { cn } from "../../lib/utils";

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  icon: "btn-icon"
};

export function Button({ className, variant = "secondary", children, ...props }) {
  return (
    <button className={cn("btn", variants[variant], className)} {...props}>
      {children}
    </button>
  );
}
