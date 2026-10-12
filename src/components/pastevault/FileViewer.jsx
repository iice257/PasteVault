import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { isExpired, timeLeftLabel } from "../../features/files/attachments.js";
import { classifyFile } from "../../features/files/file-kinds.js";
import { downloadAttachment, saveBytes } from "../../features/files/file-transfer.js";
import {
  detectLanguage,
  escapeHtml,
  formattedKind,
  highlightToHtml,
  isKnownLanguage,
  languageLabel,
  languageOptions,
  parseCsv,
  prettyJson,
  previewSliceBytes,
  renderMarkdown
} from "../../features/files/text-preview.js";
import { formatBytes } from "../../features/clipboard/clipboard-store";
import { FileTile } from "./AttachmentPanel";
import { cn } from "../../lib/utils";

function languageKey(attachmentId) {
  return `pastevault:lang:${attachmentId}`;
}

function readLanguageChoice(attachmentId) {
  try {
    const value = window.localStorage.getItem(languageKey(attachmentId));
    return value && isKnownLanguage(value) ? value : "";
  } catch {
    return "";
  }
}

function writeLanguageChoice(attachmentId, language) {
  try {
    window.localStorage.setItem(languageKey(attachmentId), language);
  } catch {
    // The choice just will not stick on this device.
  }
}

function CodeView({ html, text }) {
  const lineCount = useMemo(() => Math.min(text.split("\n").length, 6000), [text]);
  const numbers = useMemo(() => Array.from({ length: lineCount }, (_, index) => index + 1).join("\n"), [lineCount]);
  return (
    <div className="pv-viewer-code">
      <pre className="pv-viewer-gutter" aria-hidden="true">{numbers}</pre>
      <pre className="pv-viewer-source"><code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  );
}

function TextViewer({ attachment, bytes }) {
  const [showFull, setShowFull] = useState(false);
  const truncated = bytes.length > previewSliceBytes && !showFull;
  const text = useMemo(
    () => new TextDecoder().decode(truncated ? bytes.subarray(0, previewSliceBytes) : bytes),
    [bytes, truncated]
  );
  const detected = useMemo(() => detectLanguage({ name: attachment.name, text }), [attachment.name, text]);
  const [choice, setChoice] = useState(() => readLanguageChoice(attachment.id));
  const language = choice || detected.language;
  const formatted = formattedKind(attachment.name, language);
  const [view, setView] = useState("source");
  const activeView = formatted ? view : "source";
  const [html, setHtml] = useState("");
  const [rendered, setRendered] = useState(null);

  // Source view: highlight on demand, never blocking the first paint.
  useEffect(() => {
    let cancelled = false;
    highlightToHtml(text, language)
      .then((value) => {
        if (!cancelled) setHtml(value);
      })
      .catch(() => {
        if (!cancelled) setHtml(escapeHtml(text));
      });
    return () => {
      cancelled = true;
    };
  }, [text, language]);

  // Formatted view: Markdown, pretty JSON or a CSV table.
  useEffect(() => {
    if (activeView !== "formatted" || !formatted) return undefined;
    let cancelled = false;
    (async () => {
      if (formatted === "markdown") {
        const value = await renderMarkdown(text);
        if (!cancelled) setRendered({ kind: "markdown", html: value });
      } else if (formatted === "json") {
        const result = prettyJson(text);
        const value = result.ok ? await highlightToHtml(result.text, "json") : "";
        if (!cancelled) setRendered({ kind: "json", ...result, html: value });
      } else if (formatted === "table") {
        if (!cancelled) setRendered({ kind: "table", ...parseCsv(text) });
      }
    })().catch(() => {
      if (!cancelled) setRendered({ kind: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [activeView, formatted, text]);

  const chooseLanguage = useCallback((value) => {
    setChoice(value);
    writeLanguageChoice(attachment.id, value);
  }, [attachment.id]);

  return (
    <div className="pv-viewer-text">
      <div className="pv-viewer-toolbar">
        <label className="pv-viewer-select">
          <span>Language</span>
          <select value={language} onChange={(event) => chooseLanguage(event.target.value)} aria-label="Language">
            {languageOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {formatted && (
          <div className="pv-viewer-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={activeView === "source"} onClick={() => setView("source")}>Source</button>
            <button type="button" aria-pressed={activeView === "formatted"} onClick={() => setView("formatted")}>Formatted</button>
          </div>
        )}
        <span className="pv-viewer-hint">
          {languageLabel(language)}{!choice && detected.source === "content" ? " (auto-detected)" : ""}
        </span>
      </div>
      {activeView === "formatted" && rendered?.kind === "markdown" && (
        <article className="pv-viewer-markdown" dangerouslySetInnerHTML={{ __html: rendered.html }} />
      )}
      {activeView === "formatted" && rendered?.kind === "json" && (rendered.ok
        ? <CodeView html={rendered.html} text={rendered.text} />
        : <p className="pv-viewer-note"><TriangleAlert size={15} />This file is not valid JSON: {rendered.error}</p>)}
      {activeView === "formatted" && rendered?.kind === "table" && (
        <div className="pv-viewer-table">
          <table>
            <thead>
              <tr>{(rendered.rows[0] ?? []).map((cell, index) => <th key={index}>{cell}</th>)}</tr>
            </thead>
            <tbody>
              {rendered.rows.slice(1).map((cells, rowIndex) => (
                <tr key={rowIndex}>{cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {rendered.truncated && <p className="pv-viewer-note">Showing the first {rendered.rows.length} rows.</p>}
        </div>
      )}
      {activeView === "source" && <CodeView html={html || escapeHtml(text)} text={text} />}
      {truncated && (
        <p className="pv-viewer-note">
          Showing the first {formatBytes(previewSliceBytes)} of {formatBytes(bytes.length)}.
          <button type="button" onClick={() => setShowFull(true)}>Show full file</button>
        </p>
      )}
    </div>
  );
}

function Media({ kind, url, name, onFail }) {
  if (kind === "image") return <img className="pv-viewer-image" src={url} alt={name} />;
  if (kind === "video") return <video className="pv-viewer-video" src={url} controls playsInline onError={onFail} aria-label={name} />;
  return <audio className="pv-viewer-audio" src={url} controls onError={onFail} aria-label={name} />;
}

export function FileViewer({ attachment, clipboardId, onClose }) {
  const [state, setState] = useState({ phase: "loading", error: "", bytes: null });
  const [mediaFailed, setMediaFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef(null);
  const expired = isExpired(attachment);

  useEffect(() => {
    if (expired) return undefined;
    let cancelled = false;
    downloadAttachment({ clipboardId, attachment })
      .then((bytes) => {
        if (!cancelled) setState({ phase: "ready", error: "", bytes });
      })
      .catch((error) => {
        if (!cancelled) setState({ phase: "error", error: error.message || "Could not open this file.", bytes: null });
      });
    return () => {
      cancelled = true;
    };
  }, [attachment, clipboardId, expired]);

  const info = useMemo(
    () => (state.bytes ? classifyFile(attachment.name, state.bytes.subarray(0, 4096)) : null),
    [attachment.name, state.bytes]
  );

  // Media and PDFs play from a blob URL made after decryption, released on close.
  const objectUrl = useMemo(() => {
    if (!state.bytes || !info || !info.mime || info.kind === "text") return "";
    return URL.createObjectURL(new Blob([state.bytes], { type: info.mime }));
  }, [state.bytes, info]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(new TextDecoder().decode(state.bytes));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [state.bytes]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll("button, select, a[href]") ?? [])
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Focus moves into the dialog, and returns to the file that opened it on close.
  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector("button")?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  const playable = info && ["image", "video", "audio"].includes(info.kind) && !mediaFailed;

  return (
    <div
      className="pv-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="pv-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${attachment.name}`}
        onKeyDown={handleKeyDown}
      >
        <header className="pv-viewer-head">
          <FileTile name={attachment.name} kind={info?.kind} thumb={attachment.thumb} />
          <div className="pv-viewer-title">
            <strong title={attachment.name}>{attachment.name}</strong>
            <span>{formatBytes(attachment.size)} &middot; {timeLeftLabel(attachment)}{info ? ` · ${info.theme.label}` : ""}</span>
          </div>
          <div className="pv-viewer-actions">
            {info?.kind === "text" && (
              <button className="pv-icon-button" type="button" aria-label="Copy text" onClick={copyText}>
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            )}
            {state.bytes && (
              <button
                className="pv-icon-button"
                type="button"
                aria-label={`Download ${attachment.name}`}
                onClick={() => saveBytes(state.bytes, attachment.name)}
              >
                <Download size={17} />
              </button>
            )}
            <button className="pv-icon-button" type="button" aria-label="Close preview" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={cn("pv-viewer-body", info && `is-${info.kind}`)}>
          {expired && (
            <div className="pv-viewer-state">
              <TriangleAlert size={28} />
              <strong>This file has expired</strong>
              <span>Files are deleted 7 days after they are attached.</span>
            </div>
          )}
          {!expired && state.phase === "loading" && (
            <div className="pv-viewer-state" role="status">
              <LoaderCircle className="pv-file-spin" size={28} />
              <strong>Decrypting</strong>
              <span>Downloading and decrypting on this device.</span>
            </div>
          )}
          {!expired && state.phase === "error" && (
            <div className="pv-viewer-state" role="alert">
              <TriangleAlert size={28} />
              <strong>Could not open this file</strong>
              <span>{state.error}</span>
            </div>
          )}
          {state.phase === "ready" && info && (
            <>
              {playable && objectUrl && <Media kind={info.kind} url={objectUrl} name={attachment.name} onFail={() => setMediaFailed(true)} />}
              {info.kind === "pdf" && objectUrl && (
                <>
                  <iframe className="pv-viewer-pdf" title={attachment.name} src={objectUrl} />
                  <a className="pv-viewer-open" href={objectUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={15} />Open in a new tab
                  </a>
                </>
              )}
              {info.kind === "text" && <TextViewer attachment={attachment} bytes={state.bytes} />}
              {(info.kind === "file" || mediaFailed) && (
                <div className="pv-viewer-state is-file">
                  <FileTile className="is-large" name={attachment.name} kind="file" />
                  <strong>{mediaFailed ? "This browser can't play this file" : "No preview for this file type"}</strong>
                  <span>
                    {info.theme.caution
                      ? "Executable files are never run or previewed. Only download this if you trust where it came from."
                      : "Files are carried, not opened. Download it to use it on this device."}
                  </span>
                  <button className="pv-viewer-download" type="button" onClick={() => saveBytes(state.bytes, attachment.name)}>
                    <Download size={16} />Download
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
