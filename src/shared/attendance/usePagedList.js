// ─────────────────────────────────────────────────────────────────────────────
// attendance/usePagedList.js — Paginated fetch state for list screens.
//  • Page resets to 1 whenever `filterKey` changes (no stale page 5 of a
//    filter that only has 1 page).
//  • Out-of-order responses are discarded.
//  • If the current page becomes empty (e.g. last row approved), steps back.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePaginated } from "./normalize.js";

/**
 * @param {(args: {page: number, limit: number}) => Promise<any>} fetchPage
 * @param {{limit?: number, keys?: string[], filterKey?: string, enabled?: boolean}} [options]
 */
export function usePagedList(fetchPage, { limit = 20, keys = [], filterKey = "", enabled = true } = {}) {
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const [state, setState] = useState({ items: [], total: 0, totalPages: 1, loading: enabled, error: null });

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const requestId = useRef(0);

  const setPage = useCallback(
    (next) => setPageState((prev) => {
      const current = prev.key === filterKey ? prev.page : 1;
      const value = typeof next === "function" ? next(current) : next;
      return { key: filterKey, page: Math.max(1, Number(value) || 1) };
    }),
    [filterKey]
  );

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetchRef.current({ page, limit });
      if (id !== requestId.current) return;
      const n = normalizePaginated(res, keysRef.current, { page, limit });
      if (n.items.length === 0 && page > 1) {
        const target = Math.max(1, Math.min(page - 1, n.totalPages));
        if (target < page) {
          setPage(target);
          return;
        }
      }
      setState({ items: n.items, total: n.total, totalPages: n.totalPages, loading: false, error: null });
    } catch (error) {
      if (id !== requestId.current) return;
      setState((s) => ({ ...s, loading: false, error }));
    }
    // `filterKey` is intentionally a dependency: the fetcher lives in a ref, so a
    // filter change on page 1 would otherwise never trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, filterKey, enabled, setPage]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, page, limit, setPage, reload: load };
}
