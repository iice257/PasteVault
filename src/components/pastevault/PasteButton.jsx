import { ClipboardPaste } from "lucide-react";

// Phones only. Outside the editor there is no text field to paste into, so one button stands in.
export function PasteButton({ onPaste }) {
  return (
    <div className="pv-bottom-paste">
      <button type="button" onClick={onPaste}>
        <ClipboardPaste size={20} />
        Paste
      </button>
    </div>
  );
}
