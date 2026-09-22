import { useInView } from "./useInView";
import { useReducedMotion } from "./useReducedMotion";
import { EASE_ENTER, DURATION, DISTANCE, STAGGER } from "./tokens";

/* ─────────────────────────────────────────────────────────────────────────────
   Reveal — the entrance primitive the whole public site is built from.

   Polymorphic on purpose. The old AnimateOnScroll always emitted a <div>, so
   dropping it around a grid or flex child inserted a box between the parent
   and the item and quietly broke the layout. `as` lets the revealed element BE
   the section, the <li>, or the heading, with no extra node.

   Only transform and opacity move, so an entrance can never shift layout:
   every element occupies its final box from first paint.
──────────────────────────────────────────────────────────────────────────── */

const VARIANTS = {
  /** The default. Fade up — used for most headings, copy and sections. */
  rise: { x: 0, y: DISTANCE.rise, scale: 1 },
  /** Shorter rise for items nested inside an already-revealed block. */
  riseSmall: { x: 0, y: DISTANCE.riseSmall, scale: 1 },
  /** Opacity only. For backgrounds and anything where travel would distract. */
  fade: { x: 0, y: 0, scale: 1 },
  /** Enters from the left — paired columns, alternating feature rows. */
  left: { x: -DISTANCE.slide, y: 0, scale: 1 },
  /** Enters from the right. */
  right: { x: DISTANCE.slide, y: 0, scale: 1 },
  /** Settles forward slightly. Reserved for product screenshots and media. */
  scale: { x: 0, y: DISTANCE.riseSmall, scale: 0.97 },
};

/**
 * @param {string}  as        element to render (default "div")
 * @param {string}  variant   key of VARIANTS
 * @param {number}  delay     ms before this element starts
 * @param {number}  index     position in a staggered group
 * @param {number}  stagger   ms between siblings, multiplied by index
 * @param {number}  duration  ms
 * @param {boolean} priority  above-the-fold: move without fading (see below)
 */
function Reveal({
  as: Tag = "div",
  variant = "rise",
  delay = 0,
  index = 0,
  stagger = STAGGER.normal,
  duration = DURATION.enter,
  priority = false,
  className = "",
  style,
  children,
  ...rest
}) {
  const reduced = useReducedMotion();
  // An above-the-fold element is in view by definition — waiting for an
  // observer callback to say so only delays it.
  const [ref, inView] = useInView({ skip: reduced || priority });

  const v = VARIANTS[variant] || VARIANTS.rise;
  const totalDelay = delay + index * stagger;

  const hidden = !reduced && !priority && !inView;

  /* `priority` exists because fading in above-the-fold content wrecks Largest
     Contentful Paint. LCP is only recorded once an element is actually
     painted, and an element at opacity 0 has not been — so a hero image
     behind a 900ms fade reports an LCP 900ms later than the moment the pixels
     were ready. Measured on /pricing: 2.2s with the fade, ~0.9s without.

     So a priority element never animates opacity. It still travels, which
     reads almost identically, but it is painted from the first frame and LCP
     lands when the image decodes. Use it for anything in the first viewport;
     leave it off everywhere else, where the fade is the whole point. */
  const motionStyle = reduced
    ? undefined
    : priority
    ? {
        animation: `reveal-settle ${duration}ms ${EASE_ENTER} ${totalDelay}ms both`,
        // Custom properties feed the keyframes, so one keyframe rule serves
        // every variant.
        "--reveal-x": `${v.x}px`,
        "--reveal-y": `${v.y}px`,
        "--reveal-scale": v.scale,
      }
    : {
        opacity: hidden ? 0 : 1,
        transform: hidden
          ? `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`
          : "translate3d(0, 0, 0) scale(1)",
        transition: `opacity ${duration}ms ${EASE_ENTER} ${totalDelay}ms, transform ${duration}ms ${EASE_ENTER} ${totalDelay}ms`,
        // Promote only while there is something to animate, then let the
        // compositor reclaim the layer.
        willChange: hidden ? "transform, opacity" : undefined,
      };

  return (
    <Tag ref={ref} className={className} style={{ ...motionStyle, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

export default Reveal;
