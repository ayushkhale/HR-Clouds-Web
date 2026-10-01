// ─────────────────────────────────────────────────────────────────────────────
// promisePool.js — Run many requests with a cap on how many are in flight.
//
// Screens that need one request per employee (no list endpoint exists) must not
// fire hundreds at once once the full organisation is loaded.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Like Promise.allSettled over `items.map(worker)`, but with at most
 * `concurrency` workers running. Results keep input order.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {{ concurrency?: number, onSettled?: (index: number, result: PromiseSettledResult<R>, settledCount: number) => void }} [options]
 * @returns {Promise<PromiseSettledResult<R>[]>}
 */
export async function settleWithLimit(items, worker, { concurrency = 6, onSettled } = {}) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let next = 0;
  let settled = 0;

  const lane = async () => {
    while (next < list.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(list[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
      settled += 1;
      onSettled?.(index, results[index], settled);
    }
  };

  await Promise.all(Array.from({ length: Math.max(0, Math.min(concurrency, list.length)) }, lane));
  return results;
}
