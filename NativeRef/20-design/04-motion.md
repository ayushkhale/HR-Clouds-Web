# 04 · Motion

The web app's motion is in-house (`shared/motion/`) with an explicit rule:
**never add Framer Motion or GSAP.** The native equivalent is Reanimated 3 and
nothing else.

One vocabulary, so the animations read as a system rather than a pile of
one-off effects. Values live in `src/theme/motion.js`; components import them
rather than hard-coding durations, or the language drifts apart.

---

## Tokens — ported from `shared/motion/tokens.js`

```js
// src/theme/motion.js
import { Easing } from 'react-native-reanimated';

/** Entrances: a fast start that settles softly. The house easing. */
export const EASE_ENTER = Easing.bezier(0.16, 1, 0.3, 1);

/** Hovers and presses: gentler, since the user is driving it. */
export const EASE_MICRO = Easing.bezier(0.22, 0.61, 0.36, 1);

export const DURATION = {
  enter: 700,       // section and card entrances
  enterShort: 500,  // small items inside an already-revealed block
  micro: 200,       // press, focus, toggle — a direct response
  sheet: 280,       // sheet open / close
};

/** Travel distances, in px. Deliberately small — a long throw reads as cheap. */
export const DISTANCE = { rise: 28, riseSmall: 16, slide: 40 };

/** Gap between siblings in a staggered group, in ms. */
export const STAGGER = { normal: 80, tight: 55 };

/** The house spring, for anything a gesture drives. */
export const SPRING = { damping: 18, stiffness: 180, mass: 0.9 };
```

Everything animates **transform and opacity only** — both are composited off the
JS thread and neither triggers layout. This is the same constraint the web
motion system holds, and on native it is the difference between 60fps and a
visible stutter.

---

## What animates, and how

| Thing | Animation | Duration / easing |
|---|---|---|
| Screen push | Platform default (native-stack) | Don't override |
| Sheet open | Translate up + backdrop fade | `DURATION.sheet`, `EASE_ENTER` |
| Sheet drag | Gesture-driven | `SPRING` |
| Card entrance on a dashboard | Fade + rise `DISTANCE.riseSmall` | `DURATION.enterShort`, `EASE_ENTER`, stagger `STAGGER.tight` |
| List row entrance | **Nothing.** | — |
| Button press | `scale: 0.98` | `DURATION.micro`, `EASE_MICRO` |
| Row press | Background colour | `DURATION.micro` |
| Tab switch | Fade, 150ms | — |
| `TabStrip` indicator | Translate + width | `DURATION.micro`, `EASE_MICRO` |
| Section fold | Height + chevron rotate 180° | `DURATION.micro` |
| Toast in / out | Translate down from the top + fade | `DURATION.micro` |
| Punch ring | Stroke progress | `withTiming`, 600ms, `EASE_ENTER` |
| Live timer digits | **No animation.** Tabular numerals, plain text | — |
| Badge count change | Scale 1 → 1.15 → 1 | `DURATION.micro` |
| Pull-to-refresh | Platform default | Don't override |
| Skeleton | Opacity 0.5 ⇄ 1, 1000ms loop | `Easing.inOut(Easing.ease)` |

### Why list rows don't animate

A 31-row attendance month with a staggered entrance takes 2.5 seconds to settle
and makes scrolling feel laggy. The web app's `Reveal` is for **marketing
sections**, not data lists. Data appears; it doesn't perform.

---

## The punch ring

The one piece of real animation in the app, and worth getting right.

```jsx
const progress = useSharedValue(0);

useEffect(() => {
  progress.value = withTiming(Math.min(1, workedMinutes / fullDayMinutes), {
    duration: 600, easing: EASE_ENTER,
  });
}, [workedMinutes, fullDayMinutes]);

const animatedProps = useAnimatedProps(() => ({
  strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
}));
```

- `CIRCUMFERENCE = 2 * Math.PI * 40` — the same radius the web card uses.
- Driven by **worked minutes against the policy's `full_day_threshold_minutes`**,
  not by elapsed wall time.
- No threshold → no ring, just the figure. Don't invent an 8-hour default; the
  policy decides what a full day is.
- Under reduce-motion the ring **jumps** to its value rather than sweeping.

---

## Reduce motion

```js
// hooks/useReducedMotion.js
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}
```

When reduced:

- entrances become **instant** (no fade, no rise);
- the ring, the fold and the indicator **jump** rather than tween;
- the skeleton pulse stops (static grey blocks);
- presses keep their colour change but lose the scale;
- **sheets keep their slide.** A sheet appearing instantly is disorienting
  rather than calm — reduce-motion means less decorative motion, not none.

The web app's safety net is a CSS rule that near-zeroes every duration. The
native equivalent is to read the flag in the `motion.js` helpers themselves, so
a component that forgets to check still behaves:

```js
export const enterTiming = (reduced) =>
  reduced ? { duration: 0 } : { duration: DURATION.enterShort, easing: EASE_ENTER };
```

---

## Haptics

Sparing, and only to confirm something consequential.

| Event | Haptic |
|---|---|
| Clock in / clock out succeeded | `impactLight` |
| Break start / end succeeded | `selection` |
| A write failed | `notificationError` |
| Everything else | **None** |

No haptic on navigation, scrolling, tab switches or opening a sheet. And respect
the system setting — on Android, check `Settings.System.HAPTIC_FEEDBACK_ENABLED`
via the library's own guard rather than buzzing regardless.

---

## Banned

- **Framer Motion, GSAP, Lottie, Moti.** The web rule carries over: motion is
  in-house. Reanimated is the one dependency.
- Animating `width`, `height`, `top`, `left`, `padding` or `margin` — all
  trigger layout. Animate `transform` and `opacity`; for a fold, use
  `LayoutAnimation` or Reanimated's `Layout` transitions.
- Looping decorative animation. The web app explicitly removed a looping glint
  from a rank mark (commit `dfbf3fb`) because it drew the eye forever.
- A spinner where a skeleton belongs.
- Animation on anything that shows a number that matters. A balance that counts
  up is charming once and infuriating by the third visit — and `useCountUp` in
  the web motion system is for the **marketing site**, not the dashboard.
- Parallax. It exists on the web landing page; it has no place in a workspace.

---

## Performance guardrails

- Every animation runs on the **UI thread** (`useAnimatedStyle`,
  `useAnimatedProps`). If you find yourself in `useEffect` + `setState` to
  animate, you've already lost the frame budget.
- `react-native-screens` is enabled, so off-screen stack screens are detached.
  Don't defeat that with a persistent timer in an unmounted screen — the live
  punch timer clears its interval when the phase leaves `working`.
- `FlatList` over `ScrollView` + `map` for anything above ~20 rows. Set
  `keyExtractor`, `getItemLayout` where rows are fixed-height, and
  `removeClippedSubviews` on Android.
- No list should drop below **55fps** while scrolling. Measure with the
  performance monitor on the low-end Android, not on a flagship.
