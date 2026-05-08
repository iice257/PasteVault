import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, align = "start", children, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content className={cn("dropdown-content", className)} align={align} sideOffset={7} {...props}>
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, active, children, ...props }) {
  return (
    <DropdownMenuPrimitive.Item className={cn("dropdown-item", active && "is-active", className)} {...props}>
      <span>{children}</span>
      {active && <Check size={16} />}
    </DropdownMenuPrimitive.Item>
  );
}
