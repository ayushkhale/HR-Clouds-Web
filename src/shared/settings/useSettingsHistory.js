// ─────────────────────────────────────────────────────────────────────────────
// useSettingsHistory.js — The settings change history (#248): filters, pages
// and the keyset cursor.
//
// Contract: public/ref docs/md_settings/phases/phase3_api_analysis.md.
//
// WHY PAGING HERE IS "SHOW MORE" AND NOT PAGE NUMBERS. #248 pages by an opaque
// KEYSET cursor, not an offset. There is no page 7 to jump to and no total to
// count against — the server hands back `next_cursor` and that is the only way
// forward. So this hook appends, and the screen offers "Show earlier changes"
// rather than the house `Pagination` component, which is offset-shaped and
// would need a total it can never have.
//
// THE CURSOR IS OPAQUE AND IS NEVER REUSED ACROSS FILTERS. A cursor encodes a
// position in one particular ordering; carrying it across a filter change
// would resume in the middle of a list the reader is no longer looking at. So
// every filter change starts a fresh read with no cursor — which is also why
// `load` takes the cursor as an argument rather than reading it from state.
//
// RACE: filters change faster than the network answers. Every response is
// checked against a request token before it is allowed to land, so a slow
// first page can never overwrite a fast second one (§7).
//
// DEGRADED READS: #248 can answer 200 having failed to read some of its five
// backing stores — they come back in `unavailable_sources[]`. That is the same
// shape as #244's `unavailable_groups`, and it is handled the same way: the
// page renders what did load and says plainly that part of the record is
// missing. A partial history that claims to be complete is worse than one that
// admits the gap (§7).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { settingsAPI } from "../api";
import { isInvalidCursor, settingsErrorMessage } from "../utils/settingsErrors";

/** What the filter bar starts on, and what "Clear" puts it back to. */
export const EMPTY_FILTERS = {
  group: "",
  settingKey: "",
  actorId: "",
  from: "",
  to: "",
  source: "",
};

const PAGE_SIZE = 25;

export default function useSettingsHistory({ enabled = true } = {}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [state, setState] = useState({
    items: [],
    cursor: null,          // what the NEXT page would be fetched with
    unavailable: [],
    loading: true,
    loadingMore: false,
    error: null,
  });

  // Guards every response: only the newest request may write to state.
  const token = useRef(0);

  const load = useCallback(async (nextFilters, cursor = null) => {
    const mine = (token.current += 1);
    setState((s) => (cursor
      ? { ...s, loadingMore: true, error: null }
      : { ...s, loading: true, loadingMore: false, error: null }));

    try {
      const res = await settingsAPI.getHistory({ ...nextFilters, cursor, limit: PAGE_SIZE });
      if (mine !== token.current) return;
      const data = res?.data || {};
      setState((s) => ({
        // A first page replaces; a later page appends. Nothing de-duplicates
        // here because the keyset cursor cannot hand back a row twice.
        items: cursor ? [...s.items, ...(data.items || [])] : (data.items || []),
        cursor: data.next_cursor || null,
        unavailable: data.unavailable_sources || [],
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error) {
      if (mine !== token.current) return;
      // A rejected cursor means our position is stale, never that the history
      // is gone. Drop it and re-read from the newest change rather than
      // showing a failure the reader can do nothing about.
      if (cursor && isInvalidCursor(error)) {
        load(nextFilters, null);
        return;
      }
      setState((s) => ({
        ...s,
        // Their rows stay on screen when a "show more" fails: losing a list
        // someone has been reading is worse than the missing page.
        items: cursor ? s.items : [],
        cursor: cursor ? s.cursor : null,
        loading: false,
        loadingMore: false,
        error: settingsErrorMessage(error, "We couldn’t read the change history. Try again."),
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load(filters, null);
  }, [enabled, filters, load]);

  /** Change one filter. Always restarts the list — see the header on cursors. */
  const setFilter = useCallback((key, value) => {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      // `group` and `setting_key` must agree or the server answers 422
      // FILTER_CONFLICT. Picking a group drops a setting chosen under the old
      // one, so the two can never be sent contradicting each other.
      if (key === "group") next.settingKey = "";
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const loadMore = useCallback(() => {
    if (!state.cursor || state.loadingMore) return;
    load(filters, state.cursor);
  }, [filters, state.cursor, state.loadingMore, load]);

  const reload = useCallback(() => load(filters, null), [filters, load]);

  const filtered = Object.entries(filters).some(([, v]) => v !== "");

  return {
    ...state,
    filters,
    filtered,
    setFilter,
    clearFilters,
    loadMore,
    reload,
    hasMore: Boolean(state.cursor),
  };
}
