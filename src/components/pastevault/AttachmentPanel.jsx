import { useRef, useState } from "react";
import { Archive, Download, LoaderCircle, Paperclip, RotateCw, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { fileExtension, isExpired, timeLeftLabel } from "../../features/files/attachments.js";
import { guessKind, themeForFile } from "../../features/files/file-kinds.js";
import { formatBytes } from "../../features/clipboard/clipboard-store";
import { maxClipboardFileBytes, maxClipboardFiles } from "../../features/files/limits.js";
import { cn } from "../../lib/utils";

const stageLabels = {
  encrypting: "Encrypting",
  uploading: "Uploading",
  finishing: "Finishing"
};

function pasteShortcut() {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform ?? "";
  return /Mac|iPhone|iPad/i.test(platform) ? "⌘V" : "Ctrl+V";
}

export function FileTile({ name, kind, thumb, className }) {
  const theme = themeForFile(name, kind ?? guessKind(name));
  const extension = fileExtension(name).slice(0, 4).toUpperCase() || "FILE";
  return (
    <span className={cn("pv-file-tile", className)} data-tone={theme.tone} aria-hidden="true">
      {thumb ? <img src={thumb} alt="" draggable="false" /> : <b>{extension}</b>}
      {theme.caution && <i className="pv-file-caution" title="Executable files are never run" />}
    </span>
  );
}

export function AttachmentPanel({
  attachments,
  uploads,
  clipboardId,
  onFiles,
  onOpen,
  onDownload,
  onRemove,
  onDismissUpload,
  onRetryUpload,
  allAttachments = attachments,
  onDownloadAll,
  downloadingAll = false,
  readOnly = false
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
  const hasItems = attachments.length > 0 || uploads.length > 0;
  const busy = uploads.some((upload) => !upload.error);
  const usedBytes = allAttachments.reduce((total, attachment) => total + attachment.size, 0);
  const nearLimit = allAttachments.length >= maxClipboardFiles * 0.8 || usedBytes >= maxClipboardFileBytes * 0.8;
  const downloadable = attachments.filter((attachment) => !isExpired(attachment));

  const submit = (fileList) => {
    const files = Array.from(fileList ?? []);
    if (files.length) onFiles(files);
  };

  return (
    <section
      className={cn("pv-files-panel", dragging && "is-dragging")}
      aria-label="Encrypted files"
      data-clipboard={clipboardId}
      onDragEnter={(event) => {
        if (event.dataTransfer?.types?.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        setDragging(false);
        submit(event.dataTransfer.files);
      }}
    >
      <header className="pv-files-head">
        <div>
          <h3><ShieldCheck size={17} />Files</h3>
          <p>Encrypted before it leaves your device. Up to 5 MB, kept for 7 days.</p>
          {allAttachments.length > 0 && (
            <p className={cn("pv-files-quota", nearLimit && "is-near")} aria-live="polite">
              {nearLimit && <TriangleAlert size={13} aria-hidden="true" />}
              {allAttachments.length} of {maxClipboardFiles} files &middot; {formatBytes(usedBytes)} of {formatBytes(maxClipboardFileBytes)}
            </p>
          )}
        </div>
        <div className="pv-files-head-actions">
          {downloadable.length > 1 && (
            <button className="pv-files-attach is-quiet" type="button" onClick={onDownloadAll} disabled={downloadingAll}>
              {downloadingAll ? <LoaderCircle className="pv-file-spin" size={16} /> : <Archive size={16} />}
              {downloadingAll ? "Zipping" : "Download all"}
            </button>
          )}
          {!readOnly && (
            <button className="pv-files-attach" type="button" onClick={() => inputRef.current?.click()}>
              <Paperclip size={16} />
              Attach
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          className="pv-file-input"
          type="file"
          multiple
          aria-label="Attach files"
          onChange={(event) => {
            submit(event.target.files);
            event.target.value = "";
          }}
        />
      </header>

      {!hasItems && (readOnly ? (
        <div className="pv-files-empty">
          <strong>No files</strong>
          <span>This clipboard is view-only, so files can't be added.</span>
        </div>
      ) : touch ? (
        <div className="pv-files-empty">
          <strong>Add a photo or file</strong>
          <span>Tap Attach, or paste one into the editor.</span>
        </div>
      ) : (
        <div className="pv-files-empty">
          <strong>Paste an image or file</strong>
          <span>Press <kbd>{pasteShortcut()}</kbd> anywhere in the editor, drop a file here, or choose one.</span>
        </div>
      ))}

      {hasItems && (
        <ul className="pv-files-list">
          {uploads.map((upload) => (
            <li key={upload.key} className={cn("pv-file-row", upload.error && "has-error")}>
              <FileTile name={upload.name} />
              <div className="pv-file-body">
                <strong title={upload.name}>{upload.name}</strong>
                {upload.error ? (
                  <span className="pv-file-error" role="alert"><TriangleAlert size={14} />{upload.error}</span>
                ) : (
                  <span className="pv-file-meta">
                    {stageLabels[upload.stage] ?? "Working"}
                    {upload.stage === "uploading" ? ` ${Math.round(upload.progress * 100)}%` : "…"}
                  </span>
                )}
                {!upload.error && (
                  <progress
                    value={upload.stage === "uploading" ? upload.progress : undefined}
                    max="1"
                    aria-label={`${upload.name} progress`}
                  />
                )}
              </div>
              {upload.error ? (
                <div className="pv-file-actions">
                  {upload.file && (
                    <button className="pv-icon-button" type="button" aria-label={`Retry ${upload.name}`} onClick={() => onRetryUpload(upload)}>
                      <RotateCw size={16} />
                    </button>
                  )}
                  <button className="pv-icon-button" type="button" aria-label={`Dismiss ${upload.name}`} onClick={() => onDismissUpload(upload.key)}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <LoaderCircle className="pv-file-spin" size={18} aria-hidden="true" />
              )}
            </li>
          ))}
          {attachments.map((attachment) => {
            const expired = isExpired(attachment);
            return (
              <li key={attachment.id} className={cn("pv-file-row", expired && "is-expired")}>
                <button
                  className="pv-file-open"
                  type="button"
                  disabled={expired}
                  onClick={() => onOpen(attachment)}
                  aria-label={`Open ${attachment.name}`}
                >
                  <FileTile name={attachment.name} thumb={attachment.thumb} />
                  <div className="pv-file-body">
                    <strong title={attachment.name}>{attachment.name}</strong>
                    <span className="pv-file-meta">
                      {formatBytes(attachment.size)} &middot; {timeLeftLabel(attachment)}
                    </span>
                  </div>
                </button>
                <div className="pv-file-actions">
                  {!expired && (
                    <button className="pv-icon-button" type="button" aria-label={`Download ${attachment.name}`} onClick={() => onDownload(attachment)}>
                      <Download size={16} />
                    </button>
                  )}
                  {!readOnly && (
                    <button className="pv-icon-button" type="button" aria-label={`Remove ${attachment.name}`} onClick={() => onRemove(attachment)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasItems && !busy && !touch && (
        <p className="pv-files-hint">Paste another image or file with <kbd>{pasteShortcut()}</kbd>, or drop it here.</p>
      )}
    </section>
  );
}
