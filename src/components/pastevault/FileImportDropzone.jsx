import { useState } from "react";
import { FileUp, LoaderCircle, Plus } from "lucide-react";
import { cn } from "../../lib/utils";

export function FileImportDropzone({
  inputRef,
  onFiles,
  compact = false,
  disabled = false,
  className,
  active = false,
  plusIcon = false,
  onDragComplete
}) {
  const [dragging, setDragging] = useState(false);
  const isActive = dragging || active;
  const Icon = disabled ? LoaderCircle : plusIcon ? Plus : FileUp;

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
          isActive && "is-dragging",
          disabled && "is-disabled",
          className
        )}
        type="button"
        aria-label="Import clipboard files"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setDragging(false);
            onDragComplete?.();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          onDragComplete?.();
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
