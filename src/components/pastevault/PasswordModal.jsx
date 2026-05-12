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
  if (!open) return null;

  return (
    <div className="pv-modal-layer" role="presentation">
      <section className="pv-password-modal" role="dialog" aria-modal="true" aria-labelledby="password-title">
        <button className="pv-icon-button pv-modal-close" type="button" onClick={onClose} aria-label="Close password modal">
          <X size={19} />
        </button>
        <span className="pv-modal-icon"><Lock size={27} /></span>
        <h2 id="password-title">Password optional</h2>
        <p>Password protect this clipboard link. PasteVault cannot recover it if it is lost.</p>
        <label>
          Password
          <input
            type="password"
            value={passwordInput}
            placeholder={locked ? "Clipboard password" : "8+ characters"}
            onChange={(event) => setPasswordInput(event.target.value)}
          />
        </label>
        {!locked && (
          <>
            <label>
              Confirm password
              <input
                type="password"
                value={passwordConfirm}
                placeholder="Repeat password"
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </label>
            <label className="pv-check-row">
              <input
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
            <ActionButton variant="primary" onClick={onUnlock}>Unlock clipboard</ActionButton>
          ) : (
            <ActionButton variant="primary" onClick={onEnable}>{hasPassword ? "Update" : "Enable"}</ActionButton>
          )}
          {hasPassword && !locked && <ActionButton onClick={onRemove}>Remove password</ActionButton>}
        </div>
      </section>
    </div>
  );
}
