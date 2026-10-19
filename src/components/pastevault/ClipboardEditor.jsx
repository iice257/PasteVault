import { AlertTriangle, CheckCircle2, ClipboardCopy, Eye, LoaderCircle, RotateCcw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { describeSaveStatus } from "../../features/clipboard/save-status";
import { ActionButton } from "./ActionButton";
import { CodeBlockEditor } from "./CodeBlockEditor";
import { MetadataRow } from "./MetadataRow";
import { OverflowMenu } from "./OverflowMenu";

export function ClipboardEditor({
  clipboardId,
  title,
  content,
  format,
  stats,
  passwordLabel,
  syncStatus,
  autosaveEnabled = true,
  conflict = null,
  readOnly = false,
  onAutosaveToggle,
  onReloadLatest,
  onForceSave,
  onContentChange,
  onFormatChange,
  onCopy,
  onFormat,
  onSave,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
  onClear,
  onNewClip,
  onCopyLatest
}) {
  const AutosaveIcon = autosaveEnabled ? ToggleRight : ToggleLeft;
  const status = describeSaveStatus(syncStatus, { autosaveEnabled, conflict: Boolean(conflict) });
  const StatusIcon = status.tone === "conflict" ? AlertTriangle : status.tone === "pending" ? LoaderCircle : CheckCircle2;
  // One status for the whole editor: what happened to the last change, plus the autosave switch.
  const statusPill = readOnly ? (
    <div className="pv-sync-pill is-readonly">
      <span className="pv-sync-label" role="status">
        <Eye size={15} aria-hidden="true" />
        View only
      </span>
    </div>
  ) : (
    <div className={`pv-sync-pill is-${status.tone}`}>
      <span className="pv-sync-label" role="status" title={syncStatus}>
        <StatusIcon size={15} aria-hidden="true" />
        {status.label}
      </span>
      <button
        className="pv-autosave-toggle"
        type="button"
        onClick={onAutosaveToggle}
        aria-pressed={autosaveEnabled}
        aria-label={`Autosave ${autosaveEnabled ? "on" : "off"}`}
        title={autosaveEnabled ? "Autosave is on. Click to turn it off." : "Autosave is off. Click to turn it on."}
      >
        <AutosaveIcon size={20} />
      </button>
    </div>
  );

  return (
    <section className="pv-workbench vault-clipboard-card editor-card">
      <header className="pv-workbench-head vault-card-head">
        <div>
          <h1>{clipboardId}</h1>
          <MetadataRow bytes={stats.bytes} characters={stats.characters} lines={stats.lines} format={format} passwordLabel={passwordLabel} />
        </div>
        <div className="pv-workbench-status">
          <div className="pv-sync-pill-row">
            {!readOnly && (!autosaveEnabled || conflict) && (
              <ActionButton icon={RotateCcw} compact onClick={onReloadLatest}>Reload latest</ActionButton>
            )}
            {!readOnly && conflict && <ActionButton icon={AlertTriangle} compact onClick={onForceSave}>Force save</ActionButton>}
            {statusPill}
          </div>
          <div className="pv-workbench-actions vault-card-actions">
            {!readOnly && <ActionButton icon={Save} variant="primary" compact onClick={onSave}>Save</ActionButton>}
            <ActionButton icon={ClipboardCopy} variant={readOnly ? "primary" : undefined} compact onClick={onCopy}>Copy</ActionButton>
            <OverflowMenu readOnly={readOnly} onRename={onRename} onDuplicate={onDuplicate} onExport={onExport} onDelete={onDelete} onClear={onClear} onNewClip={onNewClip} onCopyLatest={onCopyLatest} />
          </div>
        </div>
      </header>
      <CodeBlockEditor
        value={content}
        onChange={onContentChange}
        format={format}
        onFormatChange={onFormatChange}
        onCopy={onCopy}
        onFormat={onFormat}
        readonly={readOnly}
      />
      <input className="pv-title-input" value={title} readOnly={readOnly} onChange={(event) => onRename(event.target.value, true)} aria-label="Clip title" />
    </section>
  );
}
