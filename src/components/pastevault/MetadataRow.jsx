import { AlertTriangle, CheckCircle2, FileText, Hash, LoaderCircle, Lock, Shield, ToggleLeft, ToggleRight, Type } from "lucide-react";
import { formatBytes } from "../../features/clipboard/clipboard-store";

const statusIcons = { conflict: AlertTriangle, pending: LoaderCircle };

export function MetadataRow({ bytes, format, passwordLabel = "Password optional", compact = false, status, autosave }) {
  if (compact) {
    const StatusIcon = statusIcons[status?.tone] ?? CheckCircle2;
    return (
      <div className="pv-mobile-meta">
        {status && <span className={`is-${status.tone}`} role="status"><StatusIcon size={14} />{status.label}</span>}
        {autosave && (
          <button
            className="pv-meta-toggle"
            type="button"
            onClick={autosave.onToggle}
            aria-pressed={autosave.enabled}
            aria-label={`Autosave ${autosave.enabled ? "on" : "off"}`}
          >
            {autosave.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
          </button>
        )}
        {status && <i />}
        <span><Shield size={16} />{passwordLabel}</span>
      </div>
    );
  }

  return (
    <div className="pv-meta-row">
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
    </div>
  );
}
