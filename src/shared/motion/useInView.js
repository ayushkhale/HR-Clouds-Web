import { useEffect, useRef, useState } from "react";
import { VIEWPORT } from "./tokens";
import { observeElement } from "./observerPool";

/**
 * Fires once when the element first enters the viewport.
 *
 * One-shot by default: it stops watching after the first hit, so content never
 * re-animates when the reader scrolls back up — replaying an entrance on every
 * pass is the fastest way to make a site feel cheap.
 *
 * Shares a pooled IntersectionObserver with every other element using the same
 * options rather than constructing one per component.
 *
 * Falls back to visible wherever IntersectionObserver is missing, so content is
 * never trapped at opacity 0.
 *
 * @returns {[React.RefObject, boolean]} ref to attach, and whether it's in view
 */
export function useInView({
  threshold = VIEWPORT.threshold,
  rootMargin = VIEWPORT.rootMargin,
  once = true,
  skip = false,
} = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  // Lets the observer callback stop calling setState after the one-shot fires
  // without re-subscribing.
  const doneRef = useRef(false);

  useEffect(() => {
    if (skip) {
      setInView(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    let stop = () => {};
    stop = observeElement(el, { threshold, rootMargin }, (isIntersecting) => {
      if (isIntersecting) {
        if (doneRef.current) return;
        setInView(true);
        if (once) {
          doneRef.current = true;
          stop();
        }
      } else if (!once) {
        setInView(false);
      }
    });

    return () => stop();
  }, [threshold, rootMargin, once, skip]);

  return [ref, inView];
}
