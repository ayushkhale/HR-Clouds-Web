// ─────────────────────────────────────────────────────────────────────────────
// theme/motion.js — the motion language.
//
// Ported from shared/motion/tokens.js. One vocabulary for the whole app, so
// the animations read as a system rather than a pile of one-off effects. If a
// value needs changing, change it HERE — a component with a hard-coded 300 is
// how the language drifts apart.
//
// TWO HARD RULES, both carried over from the web app:
//
//   1. REANIMATED IS THE ONLY ANIMATION DEPENDENCY. No Framer Motion, no GSAP,
//      no Moti, no Lottie (CLAUDE.md: "motion is in-house").
//
//   2. TRANSFORM AND OPACITY ONLY. Both are composited on the UI thread and
//      neither triggers layout. Animating width/height/top/padding works and
//      then stutters on the cheap Android somebody actually punches in on.
//      For a fold, use a layout transition, not an animated height.
//
// Every helper here takes `reduced` — the value from useReducedMotion() — and
// returns a config that is already correct for it. That is deliberate: the web
// app's safety net is one CSS media query that near-zeroes every duration, and
// a native app has no such backstop. Putting the check inside the helpers means
// a component that forgets to ask still behaves.
// ─────────────────────────────────────────────────────────────────────────────

import { Easing, ReduceMotion } from 'react-native-reanimated';

/** Entrances: a fast start that settles softly. The house easing. */
export const EASE_ENTER = Easing.bezier(0.16, 1, 0.3, 1);

/** Presses, toggles, folds: gentler, because the user is driving it. */
export const EASE_MICRO = Easing.bezier(0.22, 0.61, 0.36, 1);

export const DURATION = Object.freeze({
  /** Section and card entrances. */
  enter: 700,
  /** Short entrances — small items inside an already-revealed block. */
  enterShort: 500,
  /** Press, focus, toggle, fold. Fast enough to feel like a direct response. */
  micro: 200,
  /** Sheet open / close. */
  sheet: 280,
  /** The punch ring's sweep. */
  ring: 600,
});

/** Travel distances, in px. Deliberately small — a long throw reads as cheap. */
export const DISTANCE = Object.freeze({ rise: 28, riseSmall: 16, slide: 40 });

/** Gap between siblings in a staggered group, in ms. */
export const STAGGER = Object.freeze({ normal: 80, tight: 55 });

/**
 * The house spring, for anything a gesture drives (a sheet being dragged).
 * `reduceMotion: System` lets Reanimated itself shorten it when the OS flag is
 * on, which is the one place we don't have to branch by hand.
 */
export const SPRING = Object.freeze({
  damping: 18,
  stiffness: 180,
  mass: 0.9,
  reduceMotion: ReduceMotion.System,
});

/* ─── Timing configs, reduce-motion aware ─────────────────────────────────────
   Pass the flag from useReducedMotion(). `duration: 0` is a real jump, not a
   fast tween — Reanimated applies the value on the next frame with no
   interpolation, which is exactly what reduce-motion asks for. */

export const enterTiming = (reduced) =>
  (reduced ? { duration: 0 } : { duration: DURATION.enterShort, easing: EASE_ENTER });

export const microTiming = (reduced) =>
  (reduced ? { duration: 0 } : { duration: DURATION.micro, easing: EASE_MICRO });

export const ringTiming = (reduced) =>
  (reduced ? { duration: 0 } : { duration: DURATION.ring, easing: EASE_ENTER });

/**
 * Sheets are the ONE exception: they keep their slide under reduce-motion,
 * just shorter. A sheet that materialises instantly reads as a glitch rather
 * than as calm, and the slide is what tells you where it came from — it is
 * orientation, not decoration.
 */
export const sheetTiming = (reduced) =>
  ({ duration: reduced ? 140 : DURATION.sheet, easing: EASE_ENTER });

/** Stagger delay for item `i`, which is simply 0 under reduce-motion. */
export const staggerDelay = (i, reduced, gap = STAGGER.tight) => (reduced ? 0 : i * gap);

/* ─── Press feedback ──────────────────────────────────────────────────────────
   The whole app's press response, in one place. A press keeps its COLOUR
   change under reduce-motion and loses only the scale: feedback that something
   was pressed is information, and removing it makes the app feel broken. */

export const PRESS_SCALE = 0.98;

/** `({ pressed }) => [styles.x, pressStyle(pressed, reduced)]` on a Pressable. */
export const pressStyle = (pressed, reduced) =>
  (pressed && !reduced ? { transform: [{ scale: PRESS_SCALE }] } : null);

/** Opacity for a pressed row / icon button, where a scale would look wrong. */
export const pressOpacity = (pressed) => (pressed ? 0.7 : 1);

/* ─── The skeleton pulse ─────────────────────────────────────────────────────
   Under reduce-motion the blocks go static grey rather than breathing. */

export const SKELETON = Object.freeze({
  duration: 1000,
  from: 0.5,
  to: 1,
  easing: Easing.inOut(Easing.ease),
});
