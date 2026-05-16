import { PanelLeft } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar({ collapsed = false, className, children, ...props }) {
  return (
    <aside className={cn("pv-sidebar", collapsed && "is-collapsed", className)} data-collapsible={collapsed ? "icon" : "none"} {...props}>
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, children, ...props }) {
  return <div className={cn("pv-sidebar-header", className)} {...props}>{children}</div>;
}

export function SidebarContent({ className, children, ...props }) {
  return <div className={cn("pv-sidebar-content", className)} {...props}>{children}</div>;
}

export function SidebarFooter({ className, children, ...props }) {
  return <div className={cn("pv-sidebar-footer", className)} {...props}>{children}</div>;
}

export function SidebarGroup({ className, children, ...props }) {
  return <section className={cn("pv-sidebar-group", className)} {...props}>{children}</section>;
}

export function SidebarGroupLabel({ className, children, ...props }) {
  return <h2 className={cn("pv-sidebar-group-label", className)} {...props}>{children}</h2>;
}

export function SidebarGroupContent({ className, children, ...props }) {
  return <div className={cn("pv-sidebar-group-content", className)} {...props}>{children}</div>;
}

export function SidebarMenu({ className, children, ...props }) {
  return <div className={cn("pv-sidebar-menu", className)} role="list" {...props}>{children}</div>;
}

export function SidebarMenuItem({ className, children, ...props }) {
  return <div className={cn("pv-sidebar-menu-item", className)} role="listitem" {...props}>{children}</div>;
}

export function SidebarMenuButton({ isActive = false, icon: Icon, children, className, ...props }) {
  return (
    <button className={cn("pv-sidebar-menu-button", isActive && "is-active", className)} type="button" aria-current={isActive ? "page" : undefined} {...props}>
      {Icon && <Icon size={20} />}
      <span>{children}</span>
    </button>
  );
}

export function SidebarTrigger({ className, children, ...props }) {
  return (
    <button className={cn("pv-sidebar-trigger", className)} type="button" aria-label="Toggle sidebar" {...props}>
      {children ?? <PanelLeft size={18} />}
    </button>
  );
}
