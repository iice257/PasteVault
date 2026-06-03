import { useEffect, useRef } from "react";
import { Lock, X } from "lucide-react";
import { ActionButton } from "./ActionButton";

export function PasswordModal({
  open,
  locked,
  hasPassword,
  passwordInput,
  passwordConfirm,
  acknowledged,
  setPasswordInput,
  setPasswordConfirm,
  setAcknowledged,
  onUnlock,
  onEnable,
  onRemove,
  onClose
}) {
  const passwordRef = useRef(null);

  useEffect(() => {
    if (open) {
      passwordRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (locked) {
      onUnlock();
      return;
    }
    onEnable();
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll("button, input"))
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

  return (
    <div
      className="pv-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form className="pv-password-modal" role="dialog" aria-modal="true" aria-labelledby="password-title" aria-describedby="password-description" onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
        <button className="pv-icon-button pv-modal-close" type="button" onClick={onClose} aria-label="Close password modal">
          <X size={19} />
        </button>
        <span className="pv-modal-icon"><Lock size={27} /></span>
        <h2 id="password-title">Password optional</h2>
        <p id="password-description">Password protect this clipboard link. PasteVault cannot recover it if it is lost.</p>
        <label htmlFor="pv-password-input">
          Password
          <input
            id="pv-password-input"
            ref={passwordRef}
            type="password"
            value={passwordInput}
            placeholder={locked ? "Clipboard password" : "8+ characters"}
            autoComplete={locked ? "current-password" : "new-password"}
            minLength={locked ? undefined : 8}
            onChange={(event) => setPasswordInput(event.target.value)}
          />
        </label>
        {!locked && (
          <>
            <label htmlFor="pv-password-confirm">
              Confirm password
              <input
                id="pv-password-confirm"
                type="password"
                value={passwordConfirm}
                placeholder="Repeat password"
                autoComplete="new-password"
                minLength={8}
                aria-invalid={Boolean(passwordConfirm && passwordInput !== passwordConfirm)}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </label>
            <label className="pv-check-row" htmlFor="pv-password-acknowledged">
              <input
                id="pv-password-acknowledged"
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I understand this password cannot be recovered.
            </label>
          </>
        )}
        <div className="pv-modal-actions">
          {locked ? (
            <ActionButton variant="primary" type="submit">Unlock clipboard</ActionButton>
          ) : (
            <ActionButton variant="primary" type="submit">{hasPassword ? "Update" : "Enable"}</ActionButton>
          )}
          {hasPassword && !locked && <ActionButton type="button" onClick={onRemove}>Remove password</ActionButton>}
        </div>
      </form>
    </div>
  );
}
