import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Link2, RefreshCw, ScanLine, Smartphone, X } from "lucide-react";
import { ActionButton } from "./ActionButton";
import { QrCode } from "./QrCode";
import {
  buildClipboardUrl,
  createPairingCode,
  normalizePairingCode,
  pairingCodeLength,
  pairingCodePattern,
  parseClipboardTarget,
  resolvePairingCode
} from "../../features/clipboard/pairing";
import { startQrScan } from "../../features/clipboard/qr-scanner";

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function openClipboardId(clipboardId) {
  window.location.href = `/clip/${encodeURIComponent(clipboardId)}`;
}

// The body only mounts while the dialog is open, so every open starts from fresh state.
export function PairDialog({ open, ...props }) {
  return open ? <PairDialogBody {...props} /> : null;
}

function PairDialogBody({ clipboardId = "", initialTab = "show", prepareShare, onClose }) {
  const canShow = Boolean(clipboardId);
  const [tab, setTab] = useState(canShow ? initialTab : "join");
  const [pairing, setPairing] = useState({
    status: canShow && initialTab === "show" ? "loading" : "idle",
    code: "",
    expiresAt: 0,
    error: ""
  });
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [joinState, setJoinState] = useState({ busy: false, error: "" });
  const [scanState, setScanState] = useState({ active: false, error: "" });
  const videoRef = useRef(null);
  const stopScanRef = useRef(null);
  const codeInputRef = useRef(null);
  const dialogRef = useRef(null);

  const stopScanning = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    setScanState((current) => (current.active ? { ...current, active: false } : current));
  }, []);

  const joinWithId = useCallback((id) => {
    stopScanning();
    openClipboardId(id);
  }, [stopScanning]);

  const joinWithCode = useCallback(async (rawCode) => {
    const code = normalizePairingCode(rawCode);
    if (!pairingCodePattern.test(code)) {
      setJoinState({ busy: false, error: `Enter the ${pairingCodeLength}-character code from the other device.` });
      return;
    }
    setJoinState({ busy: true, error: "" });
    try {
      joinWithId(await resolvePairingCode(code));
    } catch (error) {
      setJoinState({ busy: false, error: error.message });
    }
  }, [joinWithId]);

  const requestCode = useCallback(async () => {
    try {
      if (prepareShare && !(await prepareShare())) {
        throw new Error("Save this clipboard before pairing a device.");
      }
      const result = await createPairingCode(clipboardId);
      setNow(Date.now());
      setPairing({ status: "ready", code: result.code, expiresAt: new Date(result.expiresAt).getTime(), error: "" });
    } catch (error) {
      setPairing({ status: "error", code: "", expiresAt: 0, error: error.message });
    }
  }, [clipboardId, prepareShare]);

  const issueCode = useCallback(() => {
    setPairing({ status: "loading", code: "", expiresAt: 0, error: "" });
    void requestCode();
  }, [requestCode]);

  // First code is requested when the dialog opens on the Show tab.
  const requestedRef = useRef(false);
  useEffect(() => {
    if (requestedRef.current || !canShow || initialTab !== "show") return;
    requestedRef.current = true;
    void requestCode();
  }, [canShow, initialTab, requestCode]);

  // Countdown.
  useEffect(() => {
    if (pairing.status !== "ready") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing.status]);

  useEffect(() => () => stopScanRef.current?.(), []);

  useEffect(() => {
    if (tab === "join" && !scanState.active) {
      codeInputRef.current?.focus();
    }
  }, [tab, scanState.active]);

  const handleScanned = useCallback((text) => {
    const target = parseClipboardTarget(text.trim());
    if (target) {
      joinWithId(target);
      return;
    }
    const code = normalizePairingCode(text);
    if (pairingCodePattern.test(code)) {
      stopScanning();
      void joinWithCode(code);
      return;
    }
    setJoinState({ busy: false, error: "That QR code is not a PasteVault clipboard." });
  }, [joinWithCode, joinWithId, stopScanning]);

  const startScanning = useCallback(async () => {
    setJoinState({ busy: false, error: "" });
    setScanState({ active: true, error: "" });
    // Wait for the <video> element to mount before attaching the stream.
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    try {
      stopScanRef.current = await startQrScan(videoRef.current, handleScanned);
    } catch (error) {
      setScanState({ active: false, error: error.message });
    }
  }, [handleScanned]);

  const copy = useCallback(async (kind, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? "" : current)), 1800);
    } catch {
      setCopied("");
    }
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll("button, input") ?? [])
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const remaining = pairing.status === "ready" ? pairing.expiresAt - now : 0;
  const expired = pairing.status === "ready" && remaining <= 0;
  const clipboardUrl = canShow ? buildClipboardUrl(clipboardId) : "";
  const displayCode = pairing.code ? `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}` : "";

  return (
    <div
      className="pv-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="pv-pair-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-title"
        onKeyDown={handleKeyDown}
      >
        <button className="pv-icon-button pv-modal-close" type="button" onClick={onClose} aria-label="Close pairing">
          <X size={19} />
        </button>
        <span className="pv-modal-icon"><Smartphone size={27} /></span>
        <h2 id="pair-title">Pair a device</h2>

        {canShow && (
          <div className="pv-pair-tabs" role="tablist" aria-label="Pairing mode">
            {[["show", "Show code"], ["join", "Join"]].map(([id, label]) => (
              <button
                key={id}
                id={`pair-tab-${id}`}
                className="pv-pair-tab"
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`pair-panel-${id}`}
                onClick={() => {
                  stopScanning();
                  setTab(id);
                  if (id === "show" && pairing.status === "idle") issueCode();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === "show" && canShow && (
          <div id="pair-panel-show" className="pv-pair-panel" role="tabpanel" aria-labelledby="pair-tab-show">
            <p>Scan this on your phone, or type the code on another device.</p>
            <div className="pv-pair-qr" data-state={pairing.status}>
              <QrCode value={clipboardUrl} label="QR code that opens this clipboard" />
            </div>
            {pairing.status === "loading" && <p className="pv-pair-status" role="status">Preparing code…</p>}
            {pairing.status === "error" && (
              <p className="pv-pair-error" role="alert">{pairing.error}</p>
            )}
            {pairing.status === "ready" && (
              <div className="pv-pair-code" aria-live="polite">
                <strong aria-label={`Pairing code ${pairing.code.split("").join(" ")}`}>{displayCode}</strong>
                <span>{expired ? "Code expired" : `One-time code · expires in ${formatRemaining(remaining)}`}</span>
              </div>
            )}
            <div className="pv-modal-actions">
              {pairing.status === "ready" && !expired && (
                <ActionButton icon={copied === "code" ? Check : Copy} onClick={() => copy("code", pairing.code)}>
                  {copied === "code" ? "Copied" : "Copy code"}
                </ActionButton>
              )}
              <ActionButton icon={copied === "link" ? Check : Link2} onClick={() => copy("link", clipboardUrl)}>
                {copied === "link" ? "Copied" : "Copy link"}
              </ActionButton>
              {(pairing.status === "error" || pairing.status === "ready") && (
                <ActionButton icon={RefreshCw} onClick={issueCode}>New code</ActionButton>
              )}
            </div>
            <p className="pv-pair-note">The QR and link open this clipboard directly. Password-protected clipboards still need their password.</p>
          </div>
        )}

        {tab === "join" && (
          <form
            id="pair-panel-join"
            className="pv-pair-panel"
            role={canShow ? "tabpanel" : undefined}
            aria-labelledby={canShow ? "pair-tab-join" : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              void joinWithCode(codeInput);
            }}
            noValidate
          >
            <p>Enter the code from your other device, or scan its QR code.</p>
            {scanState.active ? (
              <div className="pv-pair-scanner">
                <video ref={videoRef} muted playsInline aria-label="Camera preview" />
                <i aria-hidden="true" />
              </div>
            ) : (
              <label className="pv-pair-field" htmlFor="pair-code-input">
                Pairing code
                <input
                  id="pair-code-input"
                  ref={codeInputRef}
                  value={codeInput}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={pairingCodeLength + 1}
                  placeholder="ABC 123"
                  aria-invalid={Boolean(joinState.error)}
                  onChange={(event) => {
                    const value = normalizePairingCode(event.target.value);
                    setCodeInput(value.length > 3 ? `${value.slice(0, 3)} ${value.slice(3)}` : value);
                    if (joinState.error) setJoinState({ busy: false, error: "" });
                  }}
                />
              </label>
            )}
            {(joinState.error || scanState.error) && (
              <p className="pv-pair-error" role="alert">{joinState.error || scanState.error}</p>
            )}
            <div className="pv-modal-actions">
              {!scanState.active && (
                <ActionButton variant="primary" type="submit" disabled={joinState.busy}>
                  {joinState.busy ? "Joining…" : "Join clipboard"}
                  <ArrowRight size={19} />
                </ActionButton>
              )}
              {scanState.active ? (
                <ActionButton icon={X} onClick={stopScanning}>Stop camera</ActionButton>
              ) : (
                <ActionButton icon={ScanLine} onClick={startScanning}>Scan QR</ActionButton>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
