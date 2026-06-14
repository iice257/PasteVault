import { useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export function FileImportDropzone({ inputRef, onFiles, compact = false, disabled = false }) {
  const [dragging, setDragging] = useState(false);
  const Icon = disabled ? LoaderCircle : FileUp;

  const submitFiles = (files) => {
    const selected = Array.from(files ?? []);
    if (!disabled && selected.length) {
      onFiles(selected);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        className="pv-file-input"
        type="file"
        multiple
        aria-label="Import clipboard files"
        accept=".txt,.text,.json,.md,.env,.bash,.sh,.csv,.js,.jsx,.ts,.tsx,.py,.sql,.html,.css,.xml,.yaml,.yml,.log,text/*,application/json"
        disabled={disabled}
        onChange={(event) => {
          submitFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        className={cn(
          "pv-dropzone",
          compact && "pv-dropzone-compact",
          dragging && "is-dragging",
          disabled && "is-disabled"
        )}
        type="button"
        aria-label="Import clipboard files"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          submitFiles(event.dataTransfer.files);
        }}
      >
        <Icon className={disabled ? "pv-spin" : ""} size={compact ? 22 : 30} />
        <span>
          <strong>{disabled ? "Importing files..." : dragging ? "Release to import" : "Drop files or browse"}</strong>
          <em>Text, code, JSON, Markdown, CSV and PasteVault exports; up to 5MB each</em>
        </span>
      </button>
    </>
  );
}
