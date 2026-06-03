import { useMemo } from "react";
import { ClipboardCopy, Expand, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { formatOptions } from "../../features/clipboard/clipboard-store";
import { EditorStatusBar } from "./MetadataRow";

const maxHighlightedBytes = 160 * 1024;
const maxLineNumbers = 1200;

function classify(token, language, nextToken = "") {
  if (language === "JSON") {
    if (/^"[^"]+"$/.test(token) && nextToken === ":") return "key";
    if (/^"[^"]*"$/.test(token)) return "string";
    if (/^(true|false)$/.test(token)) return "bool";
    if (/^null$/.test(token)) return "null";
    if (/^-?\d+(\.\d+)?$/.test(token)) return "number";
  }
  if (/^(curl|npm|vite|export|const|\$|>)/.test(token)) return "command";
  return "";
}

function highlight(value, language) {
  const matcher = /"[^"]*"|-?\b\d+(?:\.\d+)?\b|\btrue\b|\bfalse\b|\bnull\b|curl|npm|vite|export|const|\$|>/g;
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = matcher.exec(value)) !== null) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const token = match[0];
    const nextToken = /^\s*:/.test(value.slice(matcher.lastIndex)) ? ":" : "";
    parts.push(
      <span className={`pv-code-${classify(token, language, nextToken)}`} key={`${token}-${match.index}`}>
        {token}
      </span>
    );
    cursor = matcher.lastIndex;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

export function CodeBlockEditor({
  value,
  onChange,
  format,
  onFormatChange,
  onCopy,
  onFormat,
  readonly = false
}) {
  const lines = Math.max(1, value.split(/\r?\n/).length);
  const bytes = useMemo(() => new Blob([value]).size, [value]);
  const shouldHighlight = bytes <= maxHighlightedBytes;
  const lineNumbers = useMemo(() => (
    Array.from({ length: Math.min(lines, maxLineNumbers) }, (_, index) => index + 1)
  ), [lines]);
  const highlightedValue = useMemo(() => (
    shouldHighlight ? highlight(value || " ", format) : ""
  ), [format, shouldHighlight, value]);

  return (
    <div className="pv-code-editor">
      <div className="pv-code-toolbar section-title-row">
        {readonly ? (
          <span className="pv-language-trigger select-trigger">{format}</span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="pv-language-trigger select-trigger" type="button" aria-label="Select clipboard format">
                {format}
                <ChevronDown size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="pv-menu" align="start">
              {formatOptions.map((option) => (
                <DropdownMenuItem active={option === format} key={option} onSelect={() => onFormatChange(option)}>
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button type="button" onClick={onCopy} aria-label="Copy editor content">
          <ClipboardCopy size={20} />
        </button>
        {!readonly && (
          <button type="button" onClick={onFormat} aria-label="Format editor content">
            <Expand size={20} />
          </button>
        )}
      </div>
      <div className={shouldHighlight ? "code-box pv-code-surface" : "code-box pv-code-surface is-plaintext"}>
        <div className="line-numbers pv-line-numbers" aria-hidden="true">
          {lineNumbers.map((line) => <span key={line}>{line}</span>)}
          {lines > maxLineNumbers && <span>...</span>}
        </div>
        <pre className="pv-code-highlight" aria-hidden="true"><code>{highlightedValue}</code></pre>
        <textarea
          value={value}
          readOnly={readonly}
          aria-readonly={readonly}
          spellCheck={false}
          aria-label="Clipboard content"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <EditorStatusBar bytes={bytes} characters={value.length} lines={lines} onFormat={onFormat} />
    </div>
  );
}
