import { Paperclip } from "lucide-react";

export function BottomPasteBar({ value, onChange, onAttach, onSave }) {
  return (
    <form
      className="pv-bottom-paste vault-bottom-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <input value={value} placeholder="Paste or type..." aria-label="Paste or type..." onChange={(event) => onChange(event.target.value)} />
      <button type="button" aria-label="Attach file" onClick={onAttach}>
        <Paperclip size={30} />
      </button>
      <button type="submit">Save</button>
    </form>
  );
}
