import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motionAllowed } from "../../../features/landing/landing-fx.js";

const words = ["stuff", "code", "links", "files", "notes", "secrets"];
const holdMs = 2600;

// The italic word in the headline. It swaps through what people actually paste, and its box
// eases to each word's width so the line never jumps. Static "stuff" without motion.
export function RotatingWord() {
  const [{ index, prev }, setWord] = useState({ index: 0, prev: -1 });
  const advance = useCallback(() => setWord((state) => ({ index: (state.index + 1) % words.length, prev: state.index })), []);
  const [width, setWidth] = useState(null);
  const [paused, setPaused] = useState(false);
  const [animated] = useState(motionAllowed);
  const measureRefs = useRef([]);

  const measure = useCallback(() => {
    const node = measureRefs.current[index];
    if (node) setWidth(Math.ceil(node.getBoundingClientRect().width));
  }, [index]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!animated) return undefined;
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [animated, measure]);

  useEffect(() => {
    if (!animated || paused) return undefined;
    const timer = window.setTimeout(advance, holdMs);
    return () => window.clearTimeout(timer);
  }, [advance, animated, index, paused]);

  if (!animated) return <span className="pv-landing-emphasis">stuff</span>;

  return (
    <button
      className="pv-landing-emphasis pv-word"
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      style={width ? { width } : undefined}
      onClick={advance}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {words.map((word, position) => (
        <span
          key={word}
          ref={(node) => {
            measureRefs.current[position] = node;
          }}
          className={position === index ? "pv-word-item is-current" : position === prev ? "pv-word-item is-prev" : "pv-word-item"}
        >
          {word}
        </span>
      ))}
    </button>
  );
}
