import { useEffect, useRef } from "react";
import { Keyboard, X } from "lucide-react";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform ?? "");

function shortcutList() {
  const mod = isMac() ? "⌘" : "Ctrl";
  return [
    { keys: [mod, "S"], label: "Save the current clip" },
    { keys: [mod, "K"], label: "Search clips" },
    { keys: [mod, "V"], label: "Paste a copied image or file as an encrypted attachment" },
    { keys: ["Esc"], label: "Close a dialog or menu" },
    { keys: ["?"], label: "Show this list" }
  ];
}

export function ShortcutsDialog({ open, onClose }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Depends on `open` only, so a parent re-render never steals focus back to the close button.
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="pv-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pv-shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <button ref={closeRef} className="pv-icon-button pv-modal-close" type="button" onClick={onClose} aria-label="Close keyboard shortcuts">
          <X size={19} />
        </button>
        <span className="pv-modal-icon"><Keyboard size={26} /></span>
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <dl className="pv-shortcut-list">
          {shortcutList().map((shortcut) => (
            <div key={shortcut.label}>
              <dt>{shortcut.label}</dt>
              <dd>{shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
