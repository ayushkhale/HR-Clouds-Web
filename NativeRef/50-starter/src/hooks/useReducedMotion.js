// ─────────────────────────────────────────────────────────────────────────────
// hooks/useReducedMotion.js — the OS "reduce motion" flag.
//
// Every animated component in the app reads this and passes it to the helpers
// in theme/motion.js, which already know what each kind of motion should do
// when it is on. See 20-design/04-motion.md for the table.
//
// It also listens for CHANGES: somebody turning the setting on while the app is
// open expects it to take effect, and on iOS this flips with Low Power Mode on
// some settings combinations.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduced(!!v); })
      .catch(() => { /* unsupported platform — motion stays on */ });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

/**
 * The screen-reader flag. NOT the same thing, and not interchangeable: a
 * screen-reader user may want full motion, and a reduce-motion user may have no
 * screen reader. This one decides whether a decorative element gets
 * `accessibilityElementsHidden`, and whether a live-updating timer announces
 * itself (it must not — a clock that speaks every second is unusable).
 */
export function useScreenReader() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => { if (alive) setOn(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v) => setOn(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return on;
}
