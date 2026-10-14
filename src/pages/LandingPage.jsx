import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Clipboard, DatabaseZap, KeyRound, QrCode } from "lucide-react";
import { ActionButton } from "../components/pastevault/ActionButton";
import { AppLogo } from "../components/pastevault/AppLogo";
import { FileImportDropzone } from "../components/pastevault/FileImportDropzone";
import { PairDialog } from "../components/pastevault/PairDialog";
import { RotatingWord } from "../components/pastevault/landing/RotatingWord";
import { Wordmark } from "../components/pastevault/landing/Wordmark";
import {
  appVersion,
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
import { parseClipboardTarget } from "../features/clipboard/pairing";
import { attachMagnet, attachSpotlight, useLandingPointerFx, useRevealOnScroll } from "../features/landing/landing-fx";

function detectFormat(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "JSON";
  if (trimmed.startsWith("npm ") || /^[A-Z0-9_]+=/.test(trimmed)) return "BASH";
  return "Plain text";
}

const steps = [
  ["01", "Paste", "Text, code, JSON, links. Or drop a file and it is encrypted before it leaves your browser."],
  ["02", "Vault", "It lands on a clipboard link of its own, with an optional password."],
  ["03", "Open", "Scan the QR or type the code on another device. It is there in seconds."]
];

const proof = ["Encrypted files", "QR pairing", "One-time codes", "JSON formatting", "Code previews", "Deep links", "Keyboard save"];

export default function LandingPage() {
  const rootRef = useRef(null);
  const shellRef = useRef(null);
  const footerRef = useRef(null);
  const fileRef = useRef(null);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [heroDragging, setHeroDragging] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);

  useLandingPointerFx(rootRef);
  useRevealOnScroll(rootRef);

  useEffect(() => {
    const cleanups = [
      attachSpotlight(shellRef.current),
      attachMagnet(shellRef.current?.querySelector(".pv-action"), { radius: 110 }),
      attachMagnet(footerRef.current?.querySelector(".pv-action"), { radius: 110 })
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

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

  // Paste works anywhere on the page, not just inside the field.
  useEffect(() => {
    const onPaste = (event) => {
      if (event.defaultPrevented || pairOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable], [role=dialog]")) return;
      const text = event.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      event.preventDefault();
      setEntry(text);
      openClipboard(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [openClipboard, pairOpen]);

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
    <div className="vault-landing pv-landing" ref={rootRef}>
      <main
        className="pv-landing-core"
        aria-labelledby="landing-title"
        data-dragging={heroDragging ? "true" : undefined}
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
        <AppLogo style={{ "--i": 0 }} />
        <h1 id="landing-title" style={{ "--i": 1 }}>
          The fastest way to move <RotatingWord /> between devices
        </h1>
        <p style={{ "--i": 2 }}>
          Paste once. Open anywhere.
          <button className="pv-join-link" type="button" onClick={() => setPairOpen(true)}>
            <QrCode size={16} />
            Join with a code
          </button>
        </p>
        <form
          ref={shellRef}
          className="landing-input-shell pv-open-shell"
          style={{ "--i": 3 }}
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
          <span>Scroll for the quick tour</span>
          <i aria-hidden="true" />
        </a>
      </main>
      <section className="pv-landing-section pv-landing-feature" id="how-it-works">
        <div className="pv-landing-feature-copy" data-reveal>
          <span className="pv-eyebrow">Link-first clipboard</span>
          <h2>Paste something. Get a clipboard URL. Move on.</h2>
        </div>
        <ol className="pv-landing-flow" aria-label="PasteVault workflow">
          {steps.map(([step, title, copy], index) => (
            <li key={step} data-reveal style={{ "--i": index }}>
              <small>{step}</small>
              <strong>{title}</strong>
              <p>{copy}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="pv-landing-section pv-landing-split">
        <article data-reveal>
          <KeyRound size={26} />
          <h2>Password when it matters</h2>
          <p>Set one per clipboard, remove it later. There is still no account to make.</p>
        </article>
        <article data-reveal style={{ "--i": 1 }}>
          <DatabaseZap size={26} />
          <h2>History without friction</h2>
          <p>Every clip is kept and searchable by title, content or tag. Import files, export whole boards.</p>
        </article>
      </section>
      <section className="pv-landing-section pv-landing-proof">
        <h2 data-reveal>Built for the dev tab you keep open all day.</h2>
        <ul>
          {proof.map((item, index) => (
            <li key={item} data-reveal style={{ "--i": index }}><span>{item}</span></li>
          ))}
        </ul>
      </section>
      <footer className="pv-landing-footer" ref={footerRef}>
        <Wordmark />
        <p>No account. Encrypted in your browser. Optional password.</p>
        <ActionButton variant="primary" onClick={() => openClipboard()}>Open workspace <ArrowRight size={20} /></ActionButton>
        <small className="pv-landing-credit">
          Made by <a href="https://kingsleyaremu.vercel.app" target="_blank" rel="noreferrer">Ice</a>
        </small>
      </footer>
      <PairDialog open={pairOpen} onClose={() => setPairOpen(false)} />
    </div>
  );
}
