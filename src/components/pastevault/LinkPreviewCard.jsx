import { ChevronRight, Copy, Link2 } from "lucide-react";

export function LinkPreviewCard({ href, onCopy }) {
  return (
    <a className="pv-link-preview" href={href} aria-label="Open link preview">
      <span>
        <Link2 size={23} />
      </span>
      <span>
        <strong>Link preview</strong>
        <em>pvault.link/9f3a7b6c</em>
        <small>1.2 KB · Text</small>
      </span>
      <button
        type="button"
        aria-label="Copy link preview"
        onClick={(event) => {
          event.preventDefault();
          onCopy();
        }}
      >
        <Copy size={18} />
      </button>
      <ChevronRight size={18} aria-hidden="true" />
    </a>
  );
}
