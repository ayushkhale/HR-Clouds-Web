import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";
import { observeElement } from "./observerPool";

/* ─────────────────────────────────────────────────────────────────────────────
   useParallax — scroll-linked vertical drift for media.

   One scroll listener and one rAF for the whole page, not one per element.
   Each hook used to register its own pair; several parallax elements on a page
   meant several listeners all waking on the same scroll event and each
   scheduling its own frame.

   The shared loop also batches correctly: it reads every element's geometry
   first, then writes every transform. Interleaving read-write-read-write would
   force the browser to recompute layout between each pair (layout thrashing);
   reading in one pass and writing in another keeps it to one layout per frame.

   Positions are published as a CSS custom property rather than through React
   state — scroll fires far too often to re-render on.
──────────────────────────────────────────────────────────────────────────── */

/** el → strength in px */
const targets = new Map();
/** Elements currently on screen; everything else is skipped entirely. */
const visible = new Set();

let frame = 0;
let listening = false;

function measureAndWrite() {
  frame = 0;
  const viewport = window.innerHeight || 0;
  if (!viewport) return;

  // Pass 1 — read. No writes in this loop, or each read after a write forces
  // a synchronous layout.
  const writes = [];
  for (const el of visible) {
    const strength = targets.get(el);
    if (strength === undefined) continue;
    const rect = el.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    const progress = (centre - viewport / 2) / (viewport / 2 + rect.height / 2);
    const clamped = Math.max(-1, Math.min(1, progress));
    writes.push([el, (-clamped * strength).toFixed(2)]);
  }

  // Pass 2 — write.
  for (const [el, y] of writes) {
    el.style.setProperty("--parallax-y", `${y}px`);
  }
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(measureAndWrite);
};

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/**
 * @param {number} strength  peak drift in px
 * @param {{minWidth?: number}} options  below this width parallax is skipped
 * @returns {React.RefObject} ref for the wrapper element
 */
export function useParallax(strength = 36, { minWidth = 768 } = {}) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    // Parallax on a phone costs a repaint per frame and buys almost nothing at
    // that viewport height, so it stays a large-screen embellishment.
    if (!window.matchMedia(`(min-width: ${minWidth}px)`).matches) {
      el.style.setProperty("--parallax-y", "0px");
      return;
    }

    targets.set(el, strength);
    startListening();

    // Only elements near the viewport take part in the per-frame work.
    const unobserve = observeElement(
      el,
      { threshold: 0, rootMargin: "20% 0px" },
      (isIntersecting) => {
        if (isIntersecting) {
          visible.add(el);
          schedule();
        } else {
          visible.delete(el);
        }
      }
    );

    schedule();

    return () => {
      unobserve();
      targets.delete(el);
      visible.delete(el);
      el.style.removeProperty("--parallax-y");
      if (targets.size === 0) stopListening();
    };
  }, [strength, reduced, minWidth]);

  return ref;
}
