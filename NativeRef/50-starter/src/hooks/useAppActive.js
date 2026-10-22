// ─────────────────────────────────────────────────────────────────────────────
// hooks/useAppActive.js — the native replacement for `document.visibilityState`.
//
// The web app guards every poll and every refresh-on-focus with
// `document.visibilityState === "visible"`. There is no `document` here, so
// every such place uses these two hooks instead. Do not poll without one of
// them: a timer that keeps firing in the background drains the battery, and
// Android will eventually kill the app for it.
//
// TWO HOOKS, DELIBERATELY:
//   • useAppActive()        → the boolean, for render-time decisions
//   • useOnAppActive(fn)    → the callback, for "refresh when we come back"
//
// `fn` is held in a ref, so passing an inline arrow does NOT resubscribe on
// every render. That matters: an AppState listener re-added each render leaks
// on fast re-renders.
//
// iOS adds a third state, "inactive" (the app switcher, an incoming call, a
// permission sheet). It is NOT background and NOT active. We treat anything
// other than "active" as "not active" for polling, but we only fire
// useOnAppActive on the transition INTO "active", so a permission dialog
// closing doesn't count as a return from the background. Without that, the
// location-permission sheet on iOS fires a refresh every time it opens.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** `true` while the app is in the foreground and interactive. */
export function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setActive(next === 'active'));
    // AppState.currentState can be stale by the time the effect runs.
    setActive(AppState.currentState === 'active');
    return () => sub.remove();
  }, []);

  return active;
}

/**
 * Run `fn` each time the app BECOMES active again. Not on mount — the screen
 * that mounts has already loaded its own data.
 *
 * @param {Function} fn
 * @param {boolean} [enabled=true] pass `false` to park the subscription (e.g.
 *   while a screen is not focused, or before a session exists).
 */
export function useOnAppActive(fn, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const returning = next === 'active' && last !== 'active';
      last = next;
      if (returning) fnRef.current?.();
    });
    return () => sub.remove();
  }, [enabled]);
}

/**
 * A poll that only runs in the foreground, and fires immediately on the way
 * back in rather than waiting out the remaining interval.
 *
 * Every poller in the app goes through this (contract: §7 of CLAUDE.md —
 * "pollers check document.visibilityState").
 *
 * @param {Function} fn        what to run
 * @param {number|null} ms     interval; `null` or 0 disables the poll entirely
 * @param {boolean} [enabled]
 */
export function useForegroundInterval(fn, ms, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const active = useAppActive();
  const on = enabled && active && !!ms && ms > 0;

  useEffect(() => {
    if (!on) return undefined;
    const timer = setInterval(() => fnRef.current?.(), ms);
    return () => clearInterval(timer);
  }, [on, ms]);

  useOnAppActive(() => fnRef.current?.(), enabled && !!ms);
}
