// ─────────────────────────────────────────────────────────────────────────────
// hooks/useResource.js — a single-shot fetch with cancellation and retry.
//
// For everything that isn't a paginated list: a salary structure, a summary, a
// profile, a detail read inside a sheet.
//
// Every fetch in the app must be cancellable and must discard out-of-order
// responses. Doing it here once means no screen writes `let cancelled = false`
// again — and no screen forgets to.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { unwrap } from '../lib/normalize';

/**
 * @param {() => Promise<any>} fetcher
 * @param {{
 *   deps?: any[],              // re-fetch when these change
 *   enabled?: boolean,         // false asks for nothing (a closed sheet)
 *   select?: (data:any)=>any,  // shape the payload once, here
 *   initial?: any,
 *   onError?: (e:any)=>void,   // for a non-fatal read (e.g. the profile name)
 * }} [options]
 */
export function useResource(fetcher, {
  deps = [], enabled = true, select, initial = null, onError,
} = {}) {
  const [state, setState] = useState({ data: initial, loading: enabled, error: null });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const selectRef = useRef(select);
  selectRef.current = select;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ data: initial, loading: false, error: null });
      return;
    }
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcherRef.current();
      if (id !== requestId.current) return;
      const raw = unwrap(res);
      setState({ data: selectRef.current ? selectRef.current(raw) : raw, loading: false, error: null });
    } catch (error) {
      if (id !== requestId.current) return;
      setState({ data: initial, loading: false, error });
      onErrorRef.current?.(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => { load(); }, [load]);

  // Discard any in-flight response on unmount.
  useEffect(() => () => { requestId.current += 1; }, []);

  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: d })) };
}

export default useResource;
