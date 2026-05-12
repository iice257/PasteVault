import { FileUp } from "lucide-react";

export function FileImportDropzone({ inputRef, onImport, compact = false }) {
  return (
    <>
      <input
        ref={inputRef}
        className="pv-file-input"
        type="file"
        accept=".txt,.json,.md,.env,.bash,.sh,.csv,text/*,application/json"
        onChange={onImport}
      />
      <button className={compact ? "pv-dropzone pv-dropzone-compact" : "pv-dropzone"} type="button" onClick={() => inputRef.current?.click()}>
        <FileUp size={compact ? 22 : 30} />
        <span>
          <strong>Drop a file to import</strong>
          <em>.txt, .json, .md, .env, .bash, .sh up to 5MB</em>
        </span>
      </button>
    </>
  );
}
