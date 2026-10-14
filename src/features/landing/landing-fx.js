import { useEffect } from "react";

const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function motionAllowed() {
  return !reducedMotion();
}

// Feeds the landing page three CSS variables, eased every frame:
//   --fx-x, --fx-y  cursor position from -1 to 1 across the viewport
//   --fx-scroll     0 at the top, 1 once the first screen has scrolled away
// CSS decides what moves, so nothing here touches layout.
export function useLandingPointerFx(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return undefined;

    const target = { x: 0, y: 0, scroll: 0 };
    const current = { x: 0, y: 0, scroll: 0 };
    let frame = 0;
    const pointer = finePointer();

    const readScroll = () => {
      const height = window.innerHeight || 1;
      target.scroll = Math.min(1, Math.max(0, window.scrollY / height));
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.075;
      current.y += (target.y - current.y) * 0.075;
      current.scroll += (target.scroll - current.scroll) * 0.14;
      root.style.setProperty("--fx-x", current.x.toFixed(4));
      root.style.setProperty("--fx-y", current.y.toFixed(4));
      root.style.setProperty("--fx-scroll", current.scroll.toFixed(4));
      const settled = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) + Math.abs(target.scroll - current.scroll) < 0.0008;
      frame = settled ? 0 : window.requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    const onMove = (event) => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = (event.clientY / window.innerHeight) * 2 - 1;
      wake();
    };
    const onScroll = () => {
      readScroll();
      wake();
    };

    if (pointer) window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    readScroll();
    wake();

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [rootRef]);
}

// Adds `.is-in` to every [data-reveal] element the first time it scrolls into view.
export function useRevealOnScroll(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const items = Array.from(root.querySelectorAll("[data-reveal]"));
    if (reducedMotion() || typeof IntersectionObserver === "undefined") {
      items.forEach((item) => item.classList.add("is-in"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [rootRef]);
}

// Lets an element lean toward the cursor while it is close. Returns a cleanup.
export function attachMagnet(element, { radius = 90, pull = 0.22, max = 7 } = {}) {
  if (!element || !finePointer() || reducedMotion()) return () => {};
  const onMove = (event) => {
    const box = element.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy);
    if (distance > radius + box.width / 2) {
      element.style.setProperty("--mag-x", "0px");
      element.style.setProperty("--mag-y", "0px");
      return;
    }
    const clamp = (value) => Math.max(-max, Math.min(max, value));
    element.style.setProperty("--mag-x", `${clamp(dx * pull)}px`);
    element.style.setProperty("--mag-y", `${clamp(dy * pull)}px`);
  };
  const reset = () => {
    element.style.setProperty("--mag-x", "0px");
    element.style.setProperty("--mag-y", "0px");
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  element.addEventListener("pointerleave", reset);
  return () => {
    window.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerleave", reset);
  };
}

// Hands an element the cursor position in its own box (--sx, --sy) so CSS can light the edge.
export function attachSpotlight(element) {
  if (!element || !finePointer() || reducedMotion()) return () => {};
  const onMove = (event) => {
    const box = element.getBoundingClientRect();
    element.style.setProperty("--sx", `${event.clientX - box.left}px`);
    element.style.setProperty("--sy", `${event.clientY - box.top}px`);
  };
  element.addEventListener("pointermove", onMove, { passive: true });
  return () => element.removeEventListener("pointermove", onMove);
}
