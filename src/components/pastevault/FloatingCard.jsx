import { Check, ClipboardCopy, FileText, Link2, Lock, Pin, Terminal, Upload } from "lucide-react";
import { cn } from "../../lib/utils";

const iconMap = {
  check: Check,
  copy: ClipboardCopy,
  file: FileText,
  link: Link2,
  lock: Lock,
  pin: Pin,
  terminal: Terminal,
  upload: Upload
};

export function FloatingCard({ className, icon = "file", title, eyebrow, meta, children, onClick, rotation = 0, href }) {
  const Icon = iconMap[icon] ?? FileText;
  const Component = href ? "a" : "button";

  return (
    <Component
      className={cn("pv-floating-card", className)}
      style={{ "--rotate": `${rotation}deg` }}
      type={href ? undefined : "button"}
      href={href}
      onClick={onClick}
    >
      <span className="pv-floating-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="pv-floating-body">
        {eyebrow && <span className="pv-floating-eyebrow">{eyebrow}</span>}
        <strong>{title}</strong>
        {meta && <em>{meta}</em>}
        {children}
      </span>
    </Component>
  );
}

export function FloatingCodeCard({ className, title, tag = "JSON", lines = [], rotation = 0, onClick }) {
  return (
    <button className={cn("pv-floating-card pv-floating-code", className)} style={{ "--rotate": `${rotation}deg` }} type="button" onClick={onClick}>
      <span className="pv-card-row">
        <strong>{title}</strong>
        <span>{tag}</span>
      </span>
      <pre>
        {lines.map((line, index) => (
          <code key={`${line}-${index}`}>
            <span>{index + 1}</span>
            {line}
          </code>
        ))}
      </pre>
    </button>
  );
}
