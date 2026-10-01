import Reveal from "../motion/Reveal";

/**
 * Compatibility shim over the motion system.
 *
 * The original implementation had three problems: it applied a keyframe
 * `animate-*` class AND a `transition-all` at the same time, so the two fought
 * over the same properties; its `delay` prop set `animationDelay`, which the
 * transition path ignored, so delays silently did nothing; and it had no
 * `prefers-reduced-motion` handling.
 *
 * Existing call sites keep working and pick up the fixes. New code should
 * import { Reveal } from "shared/motion" directly — it can render as any
 * element, where this always emits a wrapper <div>.
 */
const ANIMATION_TO_VARIANT = {
  "slide-up": "rise",
  "slide-down": "rise",
  "fade-in": "fade",
};

const AnimateOnScroll = ({ children, animation = "slide-up", delay = 0, className = "" }) => (
  <Reveal
    variant={ANIMATION_TO_VARIANT[animation] || "rise"}
    delay={delay}
    className={className}
  >
    {children}
  </Reveal>
);

export default AnimateOnScroll;
