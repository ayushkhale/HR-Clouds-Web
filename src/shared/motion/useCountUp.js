import { useEffect, useRef } from "react";
import { useInView } from "./useInView";
import { useReducedMotion } from "./useReducedMotion";

/* ─────────────────────────────────────────────────────────────────────────────
   useCountUp — ticks a stat up to its value when it scrolls into view.

   Writes the number straight to the DOM node instead of holding it in state.
   The previous version called setState on every animation frame, so a row of
   four stats pushed ~240 React renders per second through the reconciler for
   text that only ever changes inside one element.

   The element renders its true value in JSX, and this only overwrites it while
   the count is running. That means the correct figure is in the markup from
   first paint — nothing to read wrong if JS is slow, and "400+" rather than
   "0" for anything reading the page without running the animation.

   The stats are authored as display strings ("400+", "95%", "99.9%", "24/7"),
   so this splits off a leading number and replays it, keeping whatever prefix
   and suffix were written. Anything that isn't a single leading number —
   "24/7" most obviously — is left alone rather than mangled into "24" plus
   "/7".
──────────────────────────────────────────────────────────────────────────── */

/** "₹1,200+" → { prefix: "₹", value: 1200, decimals: 0, suffix: "+" } or null. */
function parseStat(raw) {
  const text = String(raw ?? "").trim();
  // A slash means it's a ratio or a schedule ("24/7"), not a quantity.
  if (text.includes("/")) return null;

  const match = text.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) return null;

  const [, prefix, digits, suffix] = match;
  const value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;

  const dot = digits.indexOf(".");
  return {
    prefix,
    value,
    decimals: dot === -1 ? 0 : digits.length - dot - 1,
    suffix,
    grouped: digits.includes(","),
  };
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * @param {string|number} target  the authored display value
 * @returns {React.RefObject} ref to put on the element that holds the number
 */
export function useCountUp(target, { duration = 1600 } = {}) {
  const reduced = useReducedMotion();
  const parsed = parseStat(target);
  const animatable = Boolean(parsed) && !reduced;

  const [inViewRef, inView] = useInView({ skip: !animatable });
  const nodeRef = useRef(null);

  // One ref on the element, feeding both the observer and the text writes.
  const setRef = useRef((node) => {
    nodeRef.current = node;
    inViewRef.current = node;
  }).current;

  useEffect(() => {
    if (!animatable || !inView) return;
    const node = nodeRef.current;
    if (!node) return;

    const { prefix, value, decimals, suffix, grouped } = parsed;
    const format = (n) => {
      const fixed = n.toFixed(decimals);
      const withSeparators = grouped
        ? Number(fixed).toLocaleString("en-IN", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : fixed;
      return `${prefix}${withSeparators}${suffix}`;
    };

    let frame = 0;
    let start = 0;

    const step = (now) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      node.textContent = format(value * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };

    node.textContent = format(0);
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      // Leave the authored value behind if we're torn down mid-count.
      node.textContent = String(target);
    };
    // `parsed` is derived from `target` each render; target is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animatable, inView, target, duration]);

  return setRef;
}
