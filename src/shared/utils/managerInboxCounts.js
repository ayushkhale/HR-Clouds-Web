// ─────────────────────────────────────────────────────────────────────────────
// managerInboxCounts.js — How many items wait on a manager in each queue, for
// the sidebar Inbox badge and the dashboard's "Needs your attention" list.
//
// Same rules as hrInboxCounts: one module-level cache keyed by the session
// token, so the sidebar and the dashboard share one round of requests, and a
// queue that fails to load is `null` (shown as N/A), never 0.
// ─────────────────────────────────────────────────────────────────────────────

import { tokenHelper } from "../api";
import { HR_INBOX_QUEUES } from "./hrInboxCounts";

const CACHE_MS = 60_000;
const MANAGER_KEYS = ["leaves", "regularizations", "overtime", "compOffs", "anomalies"];
export const MANAGER_INBOX_QUEUES = HR_INBOX_QUEUES.filter((q) => MANAGER_KEYS.includes(q.key));

let cache = { token: null, at: 0, counts: null, promise: null };

function syncToken() {
  const token = tokenHelper.get();
  if (cache.token !== token) cache = { token, at: 0, counts: null, promise: null };
  return token;
}

/** Last loaded counts for this session, without a request. */
export function peekManagerInboxCounts() {
  syncToken();
  return cache.counts;
}

/** `{ [queueKey]: number | null }`. `force` skips the cache, e.g. after a decision. */
export function fetchManagerInboxCounts(force = false) {
  const token = syncToken();
  if (!token) return Promise.resolve({});
  if (!force && cache.counts && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.counts);
  if (!force && cache.promise) return cache.promise;

  const promise = Promise.allSettled(MANAGER_INBOX_QUEUES.map((q) => q.load())).then((results) => {
    const counts = {};
    results.forEach((r, i) => {
      counts[MANAGER_INBOX_QUEUES[i].key] = r.status === "fulfilled" && Number.isFinite(r.value) ? r.value : null;
    });
    if (cache.token === token) cache = { token, at: Date.now(), counts, promise: null };
    return counts;
  });
  cache.promise = promise;
  return promise;
}
