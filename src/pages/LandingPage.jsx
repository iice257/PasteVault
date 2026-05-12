import { useCallback, useState } from "react";
import { ArrowRight, Clipboard } from "lucide-react";
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
      <main className="pv-landing-core">
        <AppLogo />
        <h1>The fastest way to move text between devices</h1>
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
      </main>
    </div>
  );
}
