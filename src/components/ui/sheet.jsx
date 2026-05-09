import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({ className, side = "right", children, ...props }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="ui-overlay" />
      <SheetPrimitive.Content className={cn("ui-sheet", `ui-sheet-${side}`, className)} {...props}>
        {children}
        <SheetPrimitive.Close className="ui-close" aria-label="Close">
          <X size={18} />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }) {
  return <div className={cn("ui-dialog-header", className)} {...props} />;
}

export function SheetTitle({ className, ...props }) {
  return <SheetPrimitive.Title className={cn("ui-dialog-title", className)} {...props} />;
}

export function SheetDescription({ className, ...props }) {
  return <SheetPrimitive.Description className={cn("ui-dialog-description", className)} {...props} />;
}
