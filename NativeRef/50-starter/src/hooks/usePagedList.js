// ─────────────────────────────────────────────────────────────────────────────
// hooks/usePagedList.js — paginated fetch state for every list screen.
//
// Ported from shared/attendance/usePagedList.js, plus one mobile addition:
// `accumulate`, for infinite scroll.
//
// What it guarantees (each one fixes a real bug):
//  • Page resets to 1 whenever `filterKey` changes — no stale page 5 of a
//    filter that only has one page.
//  • Out-of-order responses are discarded (a request-token ref).
//  • If the current page becomes empty (the last row was cancelled), it steps
//    back rather than showing an empty list with a page number.
//  • Rows loaded for ANOTHER filter are never shown under the new one: until
//    its own response lands the list is empty and loading, instead of briefly
//    showing the wrong data.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizePaginated } from '../lib/normalize';

/**
 * @param {(args: {page: number, limit: number}) => Promise<any>} fetchPage
 * @param {{
 *   limit?: number,
 *   keys?: string[],          // response keys to look for the array under
 *   filterKey?: string,       // changing this resets to page 1 and clears rows
 *   enabled?: boolean,
 *   accumulate?: boolean,     // true for infinite scroll: append pages
 * }} [options]
 */
export function usePagedList(fetchPage, {
  limit = 20, keys = [], filterKey = '', enabled = true, accumulate = false,
} = {}) {
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;

  const [state, setState] = useState({
    items: [], total: 0, totalPages: 1, loading: enabled, error: null, key: filterKey,
  });

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const requestId = useRef(0);

  const setPage = useCallback(
    (next) => setPageState((prev) => {
      const current = prev.key === filterKey ? prev.page : 1;
      const value = typeof next === 'function' ? next(current) : next;
      return { key: filterKey, page: Math.max(1, Number(value) || 1) };
    }),
    [filterKey],
  );

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetchRef.current({ page, limit });
      if (id !== requestId.current) return; // a newer request has superseded this
      const n = normalizePaginated(res, keysRef.current, { page, limit });

      // The page emptied under us (the last row was actioned) — step back.
      if (n.items.length === 0 && page > 1 && !accumulate) {
        const target = Math.max(1, Math.min(page - 1, n.totalPages));
        if (target < page) {
          setPage(target);
          return;
        }
      }

      setState((prev) => {
        const sameFilter = prev.key === filterKey;
        const items = accumulate && page > 1 && sameFilter ? [...prev.items, ...n.items] : n.items;
        return { items, total: n.total, totalPages: n.totalPages, loading: false, error: null, key: filterKey };
      });
    } catch (error) {
      if (id !== requestId.current) return;
      setState((s) => ({ ...s, loading: false, error, key: filterKey }));
    }
    // `filterKey` is intentionally a dependency: the fetcher lives in a ref, so
    // a filter change while on page 1 would otherwise never trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, filterKey, enabled, accumulate, setPage]);

  useEffect(() => { load(); }, [load]);

  const reload = useCallback(() => {
    // A pull-to-refresh goes back to the first page; accumulated rows are
    // replaced rather than appended to.
    if (page !== 1) setPage(1);
    else load();
  }, [page, setPage, load]);

  // Same filter → what was loaded (a refresh keeps rows visible while it runs).
  // Different filter → nothing yet: those rows belong to the previous view.
  const view = state.key === filterKey
    ? state
    : { items: [], total: 0, totalPages: 1, loading: enabled, error: null };

  const canLoadMore = !view.loading && page < view.totalPages;

  return {
    items: view.items,
    total: view.total,
    totalPages: view.totalPages,
    loading: view.loading,
    error: view.error,
    page,
    limit,
    setPage,
    reload,
    /** For FlatList onEndReached. A no-op when there is nothing more. */
    loadMore: () => { if (canLoadMore) setPage((p) => p + 1); },
    canLoadMore,
  };
}

export default usePagedList;
