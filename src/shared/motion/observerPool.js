// ─────────────────────────────────────────────────────────────────────────────
// observerPool.js — one IntersectionObserver per configuration, not per element.
//
// Every <Reveal> used to build its own IntersectionObserver. The pricing page
// renders 41 of them, so it was creating 41 observers that all watched the
// viewport with identical options — 41 sets of internal bookkeeping for one
// question. A single observer can watch any number of targets, so this pools
// them by their options and hands each element's entry back to its own
// callback.
//
// Observers are reference-counted and torn down when their last target goes,
// so navigating between pages doesn't leak them.
// ─────────────────────────────────────────────────────────────────────────────

/** key → { observer, callbacks: Map<Element, fn> } */
const pools = new Map();

const keyOf = (threshold, rootMargin) => `${threshold}|${rootMargin}`;

/**
 * Watch `el`, calling `cb(isIntersecting)` on change.
 * @returns {() => void} stop watching
 */
export function observeElement(el, { threshold, rootMargin }, cb) {
  if (typeof IntersectionObserver === "undefined") {
    // No support: report visible once so content is never stuck hidden.
    cb(true);
    return () => {};
  }

  const key = keyOf(threshold, rootMargin);
  let pool = pools.get(key);

  if (!pool) {
    const callbacks = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          callbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { threshold, rootMargin }
    );
    pool = { observer, callbacks };
    pools.set(key, pool);
  }

  pool.callbacks.set(el, cb);
  pool.observer.observe(el);

  return () => {
    pool.callbacks.delete(el);
    pool.observer.unobserve(el);
    if (pool.callbacks.size === 0) {
      pool.observer.disconnect();
      pools.delete(key);
    }
  };
}
