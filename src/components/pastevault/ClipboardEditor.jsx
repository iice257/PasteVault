import { CheckCircle2, ClipboardCopy, Save } from "lucide-react";
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
  onCopyLatest,
  mobile = false
}) {
  if (mobile) {
    return (
      <section className="pv-mobile-editor-card editor-card">
        <div className="section-title-row">
          <span className="pv-chip pv-chip-json">{format}</span>
          <OverflowMenu onRename={onRename} onDuplicate={onDuplicate} onExport={onExport} onDelete={onDelete} onClear={onClear} onNewClip={onNewClip} onCopyLatest={onCopyLatest} />
        </div>
        <CodeBlockEditor
          value={content}
          onChange={onContentChange}
          format={format}
          onFormatChange={onFormatChange}
          onCopy={onCopy}
          onFormat={onFormat}
        />
      </section>
    );
  }

  return (
    <section className="pv-workbench vault-clipboard-card editor-card">
      <header className="pv-workbench-head vault-card-head">
        <div>
          <h1>Clipboard {clipboardId}</h1>
          <MetadataRow bytes={stats.bytes} characters={stats.characters} lines={stats.lines} format={format} passwordLabel={passwordLabel} />
        </div>
        <div className="pv-workbench-status">
          <span><CheckCircle2 size={16} />{syncStatus}</span>
          <div className="pv-workbench-actions vault-card-actions">
            <ActionButton icon={Save} variant="primary" compact onClick={onSave}>Save</ActionButton>
            <ActionButton icon={ClipboardCopy} compact onClick={onCopy}>Copy</ActionButton>
            <OverflowMenu onRename={onRename} onDuplicate={onDuplicate} onExport={onExport} onDelete={onDelete} onClear={onClear} onNewClip={onNewClip} onCopyLatest={onCopyLatest} />
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
      />
      <input className="pv-title-input" value={title} onChange={(event) => onRename(event.target.value, true)} aria-label="Clip title" />
    </section>
  );
}
