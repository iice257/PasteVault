import { useCallback, useState } from "react";
import { ArrowRight, Clipboard, Moon, Sun } from "lucide-react";
import BlurText from "../components/BlurText";
import { Button } from "../components/ui/button";
import { LogoMark } from "../components/layout/LogoMark";
import { useTheme } from "../hooks/useTheme";
import {
  appVersion,
  defaultClipboardId,
  createClip,
  inferTitle,
  nowIso,
  saveRecord
} from "../features/clipboard/clipboard-store";

export default function LandingPage() {
  const [entry, setEntry] = useState("");
  const { isDark, toggleTheme } = useTheme();

  const openClipboard = useCallback((overrideValue) => {
    const value = (overrideValue ?? entry).trim();
    if (!value) {
      window.location.href = `/clip/${defaultClipboardId}`;
      return;
    }

    const linkMatch = value.match(/(?:\/clip\/|^)([a-zA-Z0-9_-]{3,80})$/);
    if (linkMatch && value.length <= 140) {
      window.location.href = `/clip/${encodeURIComponent(linkMatch[1])}`;
      return;
    }

    const clipboardId = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const format = value.startsWith("{") || value.startsWith("[") ? "JSON" : "Plain text";
    const clip = createClip({ title: inferTitle(value, format), content: value, format, pinned: true });
    saveRecord(clipboardId, {
      version: appVersion,
      id: clipboardId,
      updatedAt: nowIso(),
      protection: null,
      payload: { clips: [clip], selectedId: clip.id }
    });
    window.location.href = `/clip/${clipboardId}`;
  }, [entry]);

  return (
    <div className={`vault-landing landing-${isDark ? "dark" : "light"}`}>
      <nav className="landing-nav" aria-label="PasteVault">
        <LogoMark />
        <div>
          <button type="button" onClick={toggleTheme} aria-label="Toggle theme" aria-pressed={!isDark}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            Theme
          </button>
          <Button variant="primary" aria-label="Open default clipboard" onClick={() => openClipboard()}>
            Open clipboard
          </Button>
        </div>
      </nav>
      <main className="landing-core">
        <LogoMark size="large" />
        <BlurText
          as="h1"
          text="The fastest way to move text between devices"
          className="landing-blur-headline"
          animateBy="words"
          delay={55}
          direction="top"
          animationFrom={{ filter: "blur(0px)", opacity: 1, y: 0 }}
          animationTo={[{ filter: "blur(0px)", opacity: 1, y: 0 }]}
        />
        <p>Paste once. Open the link anywhere. Optional password. No account.</p>
        <form
          className="landing-input-shell"
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
          <Button variant="primary" type="submit">
            Open clipboard
            <ArrowRight size={24} />
          </Button>
        </form>
      </main>
      <section className="landing-proof" aria-label="PasteVault guarantees">
        <span>Link based</span>
        <span>No account</span>
        <span>Optional password</span>
        <span>Unlimited local history</span>
      </section>
    </div>
  );
}
