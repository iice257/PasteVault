import { Braces, FileText, Lock, Pin, Star, Terminal } from "lucide-react";
import { formatAge, formatBytes, textBytes } from "../../features/clipboard/clipboard-store";
import { cn } from "../../lib/utils";

function renderHistoryIcon(format, title) {
  if (title === "Encrypted") return <Lock size={28} />;
  if (format === "JSON") return <Braces size={28} />;
  if (format === "BASH" || title === "Deploy command") return <Terminal size={28} />;
  return <FileText size={28} />;
}

function labelFor(format) {
  if (format === "Plain text") return "TXT";
  if (format === "JavaScript") return "JS";
  return format;
}

export function RecentHistoryCard({ clip, selected, onOpen, onTogglePin, onToggleStar }) {
  return (
    <article className={cn("pv-history-card", selected && "is-selected")} onClick={onOpen}>
      <div className="pv-history-icon">
        {renderHistoryIcon(clip.format, clip.title)}
      </div>
      <div className="pv-history-card-actions">
        <button
          type="button"
          aria-label={clip.starred ? `Unstar ${clip.title}` : `Star ${clip.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleStar();
          }}
        >
          <Star size={18} fill={clip.starred ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          aria-label={clip.pinned ? `Unpin ${clip.title}` : `Pin ${clip.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePin();
          }}
        >
          <Pin size={18} fill={clip.pinned ? "currentColor" : "none"} />
        </button>
      </div>
      <h3>{clip.title}</h3>
      <span className={`pv-chip pv-chip-${labelFor(clip.format).toLowerCase()}`}>{labelFor(clip.format)}</span>
      <footer>
        <span>{formatAge(clip.updatedAt)}</span>
        <strong>{formatBytes(textBytes(clip.content))}</strong>
      </footer>
    </article>
  );
}
