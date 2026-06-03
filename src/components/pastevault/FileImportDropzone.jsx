import { useState } from "react";
import { FileUp } from "lucide-react";
import { cn } from "../../lib/utils";

export function FileImportDropzone({ inputRef, onImport, compact = false }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) {
      onImport(files);
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
        accept=".txt,.json,.md,.env,.bash,.sh,.csv,text/*,application/json"
        onChange={onImport}
      />
      <button
        className={cn("pv-dropzone", compact && "pv-dropzone-compact", dragActive && "is-dragging")}
        type="button"
        aria-label="Import clipboard files"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <FileUp size={compact ? 22 : 30} />
        <span>
          <strong>Drop a file to import</strong>
          <em>.txt, .json, .md, .env, .bash, .sh up to 5MB each</em>
        </span>
      </button>
    </>
  );
}
