import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle2, Clipboard, DatabaseZap, KeyRound, Link2, Mouse } from "lucide-react";
import { ActionButton } from "../components/pastevault/ActionButton";
import { AppLogo } from "../components/pastevault/AppLogo";
import {
  appVersion,
  clipboardIdPattern,
  createClip,
  defaultClipboardId,
  inferTitle,
  nowIso,
  saveRecord
} from "../features/clipboard/clipboard-store";

function detectFormat(value, name = "") {
  const trimmed = value.trim();
  const lower = name.toLowerCase();
  if (lower.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) return "JSON";
  if (lower.endsWith(".sh") || lower.endsWith(".bash") || trimmed.startsWith("npm ")) return "BASH";
  if (lower.endsWith(".md")) return "Markdown";
  if (lower.endsWith(".html")) return "HTML";
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

  if (/^(clip_[a-zA-Z0-9_-]{3,75}|[a-f0-9]{8,16})$/i.test(value) && clipboardIdPattern.test(value)) {
    return value;
  }

  return "";
}

export default function LandingPage() {
  const [entry, setEntry] = useState("");

  const createClipboardFromText = useCallback((value, sourceName = "") => {
    const clipboardId = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const format = detectFormat(value, sourceName);
    const clip = createClip({
      id: sourceName ? `clip_${sourceName.replace(/[^a-z0-9]/gi, "_").slice(0, 24).toLowerCase()}` : undefined,
      title: sourceName || inferTitle(value, format),
      content: value,
      format,
      pinned: true,
      tags: sourceName ? ["import"] : []
    });

    saveRecord(clipboardId, {
      version: appVersion,
      id: clipboardId,
      updatedAt: nowIso(),
      protection: null,
      payload: { clips: [clip], selectedId: clip.id }
    });
    window.location.href = `/clip/${clipboardId}`;
  }, []);

  const openClipboard = useCallback((overrideValue) => {
    const value = (overrideValue ?? entry).trim();
    if (!value) {
      window.location.href = `/clip/${defaultClipboardId}`;
      return;
    }

    const clipboardTarget = parseClipboardTarget(value);
    if (clipboardTarget) {
      window.location.href = `/clip/${encodeURIComponent(clipboardTarget)}`;
      return;
    }

    createClipboardFromText(value);
  }, [createClipboardFromText, entry]);

  return (
    <div className="vault-landing pv-landing">
      <main className="pv-landing-core" aria-labelledby="landing-title">
        <AppLogo />
        <h1 id="landing-title">The fastest way to move text between devices</h1>
        <p>Paste once. Open the link anywhere. Optional password. No account.</p>
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
            Open clipboard
            <ArrowRight size={24} />
          </ActionButton>
        </form>
        <a className="pv-scroll-cue" href="#how-it-works" aria-label="Scroll to learn how PasteVault works">
          <Mouse size={18} />
          Scroll for the quick tour
        </a>
      </main>
      <section className="pv-landing-section pv-landing-feature" id="how-it-works">
        <div>
          <span><Link2 size={18} /> Link-first clipboard</span>
          <h2>Paste something. Get a clipboard URL. Move on.</h2>
        </div>
        <p>
          PasteVault keeps the entry path deliberately short: text or link in, clipboard out. Use it for payloads,
          commands, notes, JSON, env vars, and anything else that should not involve sending yourself a message.
        </p>
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
        <p>No account. Optional password. One link for the thing you need on another device.</p>
        <ActionButton variant="primary" onClick={() => openClipboard()}>Launch PasteVault <ArrowRight size={20} /></ActionButton>
      </footer>
    </div>
  );
}
