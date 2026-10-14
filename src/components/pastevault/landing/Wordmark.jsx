import { useEffect, useRef } from "react";
import { motionAllowed } from "../../../features/landing/landing-fx.js";

const letters = Array.from("PasteVault");

// Big footer wordmark. Inter is a variable font, so each letter's weight swells as the cursor
// passes over it. Plain bold text on touch screens and with reduced motion.
export function Wordmark() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionAllowed() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    const spans = Array.from(root.querySelectorAll("span"));
    let frame = 0;
    let pointerX = -9999;
    let pointerY = -9999;

    const paint = () => {
      frame = 0;
      spans.forEach((span) => {
        const box = span.getBoundingClientRect();
        const distance = Math.hypot(pointerX - (box.left + box.width / 2), pointerY - (box.top + box.height / 2));
        const heat = Math.max(0, 1 - distance / 220);
        span.style.fontVariationSettings = `"wght" ${Math.round(420 + heat * 480)}`;
        span.style.setProperty("--heat", heat.toFixed(3));
      });
    };
    const onMove = (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const onLeave = () => {
      pointerX = -9999;
      pointerY = -9999;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <strong ref={rootRef} className="pv-wordmark" aria-label="PasteVault">
      {letters.map((letter, index) => (
        <span key={index} aria-hidden="true">{letter}</span>
      ))}
    </strong>
  );
}
