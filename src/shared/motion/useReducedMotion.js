import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// useReducedMotion — one media query listener for the whole app.
//
// This used to attach its own matchMedia listener per component. Every
// <Reveal> calls it, so the pricing page registered 41 listeners for one
// boolean that is identical everywhere. It is now a module-level store with a
// single listener, read through useSyncExternalStore: components subscribe to
// the same source and React handles the re-render.
// ─────────────────────────────────────────────────────────────────────────────

const QUERY = "(prefers-reduced-motion: reduce)";

const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";
const mq = supported ? window.matchMedia(QUERY) : null;

const subscribers = new Set();
let current = mq ? mq.matches : false;

if (mq) {
  const onChange = (e) => {
    current = e.matches;
    // Toggling the OS setting takes effect without a reload.
    subscribers.forEach((fn) => fn());
  };
  // Safari < 14 only has the deprecated listener API.
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else mq.addListener(onChange);
}

const subscribe = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

const getSnapshot = () => current;
// Server render: assume motion is allowed, matching the client's first paint.
const getServerSnapshot = () => false;

/** True when the visitor has asked their OS for reduced motion. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
