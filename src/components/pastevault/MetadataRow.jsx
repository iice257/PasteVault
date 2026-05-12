import { CheckCircle2, FileText, Hash, Lock, Shield, Type } from "lucide-react";
import { formatBytes } from "../../features/clipboard/clipboard-store";

export function MetadataRow({ bytes, format, passwordLabel = "Password optional", compact = false }) {
  if (compact) {
    return (
      <div className="pv-mobile-meta">
        <span><CheckCircle2 size={14} />Saved</span>
        <i />
        <span><Shield size={16} />{passwordLabel}</span>
      </div>
    );
  }

  return (
    <div className="pv-meta-row">
      <span><CheckCircle2 size={14} />Saved</span>
      <i />
      <span className="pv-chip pv-chip-json">{format}</span>
      <i />
      <span>{formatBytes(bytes)}</span>
      <i />
      <span><Lock size={14} />{passwordLabel}</span>
    </div>
  );
}

export function EditorStatusBar({ bytes, characters, lines, onFormat }) {
  return (
    <div className="pv-editor-status">
      <span><Hash size={17} />{lines} lines</span>
      <i />
      <span><Type size={16} />{characters} chars</span>
      <i />
      <span><FileText size={16} />{formatBytes(bytes)}</span>
      <button type="button" onClick={onFormat}>Format</button>
      <strong><CheckCircle2 size={18} />Auto-saved</strong>
    </div>
  );
}
