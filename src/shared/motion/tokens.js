// ─────────────────────────────────────────────────────────────────────────────
// tokens.js — the motion language.
//
// One vocabulary for the whole public site, so the animations read as a system
// rather than a pile of one-off effects. Everything animates `transform` and
// `opacity` only: both are composited on the GPU and neither triggers layout,
// so nothing here can cause a reflow or a layout shift.
//
// If a value needs changing, change it here. Components import these rather
// than hard-coding durations, or the language drifts apart.
// ─────────────────────────────────────────────────────────────────────────────

/** Entrances: a fast start that settles softly. The house easing. */
export const EASE_ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Hovers and presses: gentler, since the user is driving it. */
export const EASE_MICRO = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export const DURATION = {
  /** Section and card entrances. */
  enter: 700,
  /** Short entrances — small items inside an already-revealed block. */
  enterShort: 500,
  /** Hover, press, focus. Fast enough to feel like a direct response. */
  micro: 200,
};

/** Travel distances, in px. Deliberately small — a long throw reads as cheap. */
export const DISTANCE = {
  rise: 28,
  riseSmall: 16,
  slide: 40,
};

/** Gap between siblings in a staggered group, in ms. */
export const STAGGER = {
  /** Cards in a grid, list items. */
  normal: 80,
  /** Dense groups — stat tiles, word-by-word text. */
  tight: 55,
};

/** How far into the viewport an element travels before it reveals. */
export const VIEWPORT = {
  threshold: 0.15,
  rootMargin: "0px 0px -8% 0px",
};

/** Shared hover treatments, so every interactive surface agrees. */
export const HOVER = {
  /** Buttons and pills: lift a touch, press back down. */
  lift: "transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none",
  /** Cards: lift further, with the shadow doing the lifting work. */
  card: "transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none",
};
