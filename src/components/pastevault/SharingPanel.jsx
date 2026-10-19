import { useState } from "react";
import { Clock, Eye, Laptop, Link2, Pencil, RotateCw, Smartphone, Unlink } from "lucide-react";
import { ActionButton } from "./ActionButton";
import { expireOptions } from "../../features/clipboard/sharing";

// Who can change this clipboard. One honest sentence about the current state, then only the
// actions that make sense for it.
export function SharingCard({ locked, canEdit, busy, onCopyLink, onCopyEditLink, onEnable, onDisable, onReset }) {
  const [confirming, setConfirming] = useState(false);

  if (locked && !canEdit) {
    return (
      <div className="pv-inspector-card pv-sharing-card" data-testid="sharing-card">
        <h3><Eye size={17} />Sharing</h3>
        <strong>View only</strong>
        <p>You can read and copy this clipboard. Changes need the edit link from the person who shared it.</p>
        <ActionButton compact icon={Link2} onClick={onCopyLink}>Copy view-only link</ActionButton>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="pv-inspector-card pv-sharing-card" data-testid="sharing-card">
        <h3><Eye size={17} />Sharing</h3>
        <strong>Link is view-only</strong>
        <p>Anyone with the plain link can read this clipboard. Only devices with the edit link can change it.</p>
        <div className="pv-inspector-buttons">
          <ActionButton compact icon={Link2} onClick={onCopyLink}>Copy view-only link</ActionButton>
          <ActionButton compact icon={Pencil} onClick={onCopyEditLink}>Copy edit link</ActionButton>
          <ActionButton compact icon={RotateCw} onClick={onReset} disabled={busy}>New edit link</ActionButton>
          <ActionButton compact onClick={onDisable} disabled={busy}>Let anyone edit</ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="pv-inspector-card pv-sharing-card" data-testid="sharing-card">
      <h3><Eye size={17} />Sharing</h3>
      <strong>Anyone with the link can edit</strong>
      <p>Make the link view-only to send this clipboard to someone without letting them change it.</p>
      {confirming ? (
        <>
          <p className="pv-inspector-warn">Every existing link becomes view-only. Keep the edit link to change it from your other devices.</p>
          <div className="pv-inspector-buttons">
            <ActionButton compact variant="primary" icon={Eye} disabled={busy} onClick={async () => {
              await onEnable();
              setConfirming(false);
            }}>Make view-only</ActionButton>
            <ActionButton compact onClick={() => setConfirming(false)}>Cancel</ActionButton>
          </div>
        </>
      ) : (
        <div className="pv-inspector-buttons">
          <ActionButton compact icon={Link2} onClick={onCopyLink}>Copy link</ActionButton>
          <ActionButton compact icon={Eye} onClick={() => setConfirming(true)}>Make link view-only</ActionButton>
        </div>
      )}
    </div>
  );
}

export function ExpiryCard({ value, disabled, expiresAt, onChange }) {
  return (
    <div className="pv-inspector-card pv-sharing-card" data-testid="expiry-card">
      <h3><Clock size={17} />Delete after</h3>
      <p>
        {expiresAt
          ? `This clipboard deletes itself on ${new Date(expiresAt).toLocaleString()}. Each save restarts the timer.`
          : "Keep this clipboard until you delete it, or let it clean itself up."}
      </p>
      <div className="pv-segmented" role="radiogroup" aria-label="Delete after">
        {expireOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? "is-active" : ""}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function deviceIcon(label) {
  return /iPhone|iPad|Android/i.test(label) ? Smartphone : Laptop;
}

// Devices that have this clipboard open right now. Only devices heard from in the last minute or
// so are listed, so the number is never an estimate.
export function DevicesCard({ devices, selfId, failed, canManage, onDisconnect }) {
  const [busy, setBusy] = useState("");
  const others = devices.filter((device) => device.deviceId !== selfId);

  const run = async (target) => {
    setBusy(target);
    try {
      await onDisconnect(target);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="pv-inspector-card pv-sharing-card" data-testid="devices-card">
      <h3><Laptop size={17} />Devices</h3>
      {failed && !devices.length ? (
        <p>Device list unavailable right now.</p>
      ) : (
        <>
          <strong>{devices.length === 1 ? "Only this device is open" : `${devices.length} devices open`}</strong>
          <ul className="pv-device-list">
            {devices.map((device) => {
              const Icon = deviceIcon(device.label);
              const self = device.deviceId === selfId;
              return (
                <li key={device.deviceId}>
                  <Icon size={17} aria-hidden="true" />
                  <span>{device.label}{self && <em>This device</em>}</span>
                  {!self && canManage && (
                    <button type="button" disabled={Boolean(busy)} onClick={() => run(device.deviceId)} aria-label={`Disconnect ${device.label}`}>
                      <Unlink size={15} />{busy === device.deviceId ? "Disconnecting" : "Disconnect"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {others.length > 1 && canManage && (
            <ActionButton compact icon={Unlink} disabled={Boolean(busy)} onClick={() => run("others")}>Disconnect all others</ActionButton>
          )}
          <p className="pv-inspector-note">
            Disconnected devices stop syncing. Anyone who still has the link can open it again, so use a password or a view-only link to keep people out.
          </p>
        </>
      )}
    </div>
  );
}
