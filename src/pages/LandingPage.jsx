import { useCallback, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Clipboard, DatabaseZap, KeyRound, Link2, Mouse } from "lucide-react";
import { ActionButton } from "../components/pastevault/ActionButton";
import { AppLogo } from "../components/pastevault/AppLogo";
import { FileImportDropzone } from "../components/pastevault/FileImportDropzone";
import {
  appVersion,
  clipboardIdPattern,
  createClip,
  createPlainRecord,
  createVaultId,
  maxImportFiles,
  maxImportTotalBytes,
  mergeClipboardClips,
  nowIso,
  readImportFile,
  saveRecord
} from "../features/clipboard/clipboard-store";

function detectFormat(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "JSON";
  if (trimmed.startsWith("npm ") || /^[A-Z0-9_]+=/.test(trimmed)) return "BASH";
  return "Plain text";
}

function parseClipboardTarget(value) {
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/^\/clip\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]).trim();
      return clipboardIdPattern.test(id) ? id : "";
    }
  } catch {
    // Not a URL; explicit route-like input and id-like strings are handled below.
  }

  const pathMatch = value.match(/^\/?clip\/([a-zA-Z0-9_-]{3,80})$/);
  if (pathMatch) return pathMatch[1];

  if (/^(\d{5}|pv_[a-zA-Z0-9_-]{16,75}|clip_[a-zA-Z0-9_-]{3,75}|[a-f0-9]{8,16})$/i.test(value) && clipboardIdPattern.test(value)) {
    return value;
  }

  return "";
}

export default function LandingPage() {
  const fileRef = useRef(null);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [heroDragging, setHeroDragging] = useState(false);

  const createClipboard = useCallback((clips, selectedId = clips[0]?.id ?? null, importWarnings = 0) => {
    const clipboardId = createVaultId();
    const timestamp = nowIso();

    try {
      saveRecord(clipboardId, {
        version: appVersion,
        id: clipboardId,
        contentVersion: 1,
        updatedAt: timestamp,
        lastSavedAt: timestamp,
        settings: { autosaveEnabled: true },
        protection: null,
        payload: { clips, selectedId }
      });
    } catch {
      setError("PasteVault could not save this clipboard. Free some browser storage and try again.");
      return;
    }
    window.location.href = `/clip/${clipboardId}${importWarnings ? `?importWarnings=${importWarnings}` : ""}`;
  }, []);

  const createClipboardFromText = useCallback((value) => {
    const format = detectFormat(value);
    const clip = createClip({
      content: value,
      format,
      pinned: true
    });
    createClipboard([clip], clip.id);
  }, [createClipboard]);

  const openEmptyWorkspace = useCallback(() => {
    const clipboardId = createVaultId();
    try {
      saveRecord(clipboardId, createPlainRecord(clipboardId));
    } catch {
      setError("PasteVault could not open a workspace. Free some browser storage and try again.");
      return;
    }
    window.location.href = `/clip/${clipboardId}`;
  }, []);

  const openClipboard = useCallback((overrideValue) => {
    const value = (overrideValue ?? entry).trim();
    if (!value) {
      setError("");
      openEmptyWorkspace();
      return;
    }

    const clipboardTarget = parseClipboardTarget(value);
    if (clipboardTarget) {
      window.location.href = `/clip/${encodeURIComponent(clipboardTarget)}`;
      return;
    }

    setError("");
    createClipboardFromText(value);
  }, [createClipboardFromText, entry, openEmptyWorkspace]);

  const handleFiles = useCallback(async (files) => {
    setError("");
    setImporting(true);
    const accepted = files.slice(0, maxImportFiles);
    const failures = [];
    let totalBytes = 0;
    let clips = [];
    let selectedId = null;

    if (files.length > maxImportFiles) {
      failures.push(`Only the first ${maxImportFiles} files were considered.`);
    }

    for (const file of accepted) {
      if (totalBytes + file.size > maxImportTotalBytes) {
        failures.push(`${file.name}: the ${Math.round(maxImportTotalBytes / (1024 * 1024))}MB batch limit was reached.`);
        continue;
      }
      totalBytes += file.size;

      try {
        const result = await readImportFile(file);
        if (result.kind === "board") {
          clips = mergeClipboardClips(clips, result.board.clips);
          selectedId = result.board.selectedId ?? selectedId;
        } else {
          const duplicate = clips.some((clip) => clip.content === result.clip.content && clip.format === result.clip.format);
          if (duplicate) {
            failures.push(`${file.name}: duplicate content was skipped.`);
          } else {
            clips.push(result.clip);
            selectedId = result.clip.id;
          }
        }
      } catch (fileError) {
        failures.push(fileError.message);
      }
    }

    setImporting(false);
    if (!clips.length) {
      setError(failures.join(" ") || "No importable files were selected.");
      return;
    }
    createClipboard(clips, selectedId, failures.length);
  }, [createClipboard]);

  return (
    <div className="vault-landing pv-landing">
      <main
        className="pv-landing-core"
        aria-labelledby="landing-title"
        onDragEnter={(event) => {
          event.preventDefault();
          if (!importing) setHeroDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHeroDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setHeroDragging(false);
          const files = Array.from(event.dataTransfer.files ?? []);
          if (files.length) handleFiles(files);
        }}
      >
        <AppLogo />
        <h1 id="landing-title">The fastest way to move <span className="pv-landing-emphasis">stuff</span> between devices</h1>
        <p>Paste once. Open anywhere.</p>
        <form
          className="landing-input-shell pv-open-shell"
          onSubmit={(event) => {
            event.preventDefault();
            openClipboard();
          }}
        >
          <Clipboard size={25} />
          <input
            value={entry}
            aria-label="Paste text or enter a clipboard link"
            autoComplete="off"
            placeholder="Paste something or enter a clipboard link"
            onChange={(event) => setEntry(event.target.value)}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (pasted.trim()) {
                event.preventDefault();
                setEntry(pasted);
                window.setTimeout(() => openClipboard(pasted), 0);
              }
            }}
          />
          <ActionButton variant="primary" type="submit">
            {entry.trim() ? "Create clipboard" : "Open workspace"}
            <ArrowRight size={24} />
          </ActionButton>
        </form>
        {error && <p className="pv-inline-error" role="alert">{error}</p>}
        <FileImportDropzone
          inputRef={fileRef}
          onFiles={handleFiles}
          disabled={importing}
          className="pv-landing-dropzone"
          active={heroDragging}
          plusIcon
          onDragComplete={() => setHeroDragging(false)}
        />
        <a className="pv-scroll-cue" href="#how-it-works" aria-label="Scroll to learn how PasteVault works">
          <Mouse size={18} />
          Scroll for the quick tour
        </a>
      </main>
      <section className="pv-landing-section pv-landing-feature" id="how-it-works">
        <div className="pv-landing-feature-copy">
          <span><Link2 size={18} /> Link-first clipboard</span>
          <h2>Paste something. Get a clipboard URL. Move on.</h2>
        </div>
        <div className="pv-landing-flow" aria-label="PasteVault workflow">
          {[
            ["01", "Paste", "Drop text, JSON, commands, links, or files."],
            ["02", "Vault", "Save locally first with optional password protection."],
            ["03", "Open", "Copy the link and keep moving across devices."]
          ].map(([step, title, copy]) => (
            <article key={step}>
              <small>{step}</small>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="pv-landing-section pv-landing-split">
        <article>
          <KeyRound size={26} />
          <h2>Password when it matters</h2>
          <p>Set a password per clipboard id, remove it later, and keep the no-account flow intact.</p>
        </article>
        <article>
          <DatabaseZap size={26} />
          <h2>History without friction</h2>
          <p>Save clips locally, search by title/content/tag, import files, export boards, and keep recent work close.</p>
        </article>
      </section>
      <section className="pv-landing-section pv-landing-proof">
        <h2>Built for the dev tab you keep open all day.</h2>
        <div>
          {["JSON formatting", "Copy latest", "File import", "Deep links", "Theme toggle", "Keyboard save"].map((item) => (
            <span key={item}><CheckCircle2 size={16} /> {item}</span>
          ))}
        </div>
      </section>
      <footer className="pv-landing-footer">
        <AppLogo compact />
        <strong>PasteVault</strong>
        <p>
          <span>No account. Local-first clips.</span>
          <span>Share links once hosted sync is ready. Optional password.</span>
        </p>
        <ActionButton variant="primary" onClick={() => openClipboard()}>Open workspace <ArrowRight size={20} /></ActionButton>
      </footer>
    </div>
  );
}
