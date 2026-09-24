// ─────────────────────────────────────────────────────────────────────────────
// documents/useDocumentTypes.js — The document types a viewer can see, for
// naming rows (rows carry only document_type_id) and for the upload picker.
//
//   hr         — GET /hr/types (#5), every type incl. deactivated ones, so old
//                documents keep their name; uploads offer active employee types
//   manager    — GET /manager/types (#25); uploads offer manager_can_request
//   self       — GET /me/documents/types (#34); only types the caller may upload
//   hrOrg      — the same #5 list, narrowed to `plane: "org"`: the policies and
//                letters HR can issue to an audience (Phase 2)
//   managerOrg — GET /manager/org-documents/types (#62); an empty array means
//                the org turned team documents off, which is not an error
//
// Shared by every mounted screen for a minute, keyed by the session token.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { documentsAPI, tokenHelper } from "../api";
import { arrayPayload, typeIndex } from "./documentMeta";

const LOADERS = {
  hr: () => documentsAPI.getTypes(),
  manager: () => documentsAPI.getManagerTypes(),
  self: () => documentsAPI.getMyUploadTypes(),
  // #5 filtered server-side. HR's employee-plane list is cached under its own
  // key, so asking for org types never disturbs it.
  hrOrg: () => documentsAPI.getTypes({ plane: "org" }),
  managerOrg: () => documentsAPI.getManagerOrgTypes(),
};

const CACHE_MS = 60_000;
let cache = { token: null, entries: {} };

function cached(planeKey) {
  const token = tokenHelper.get();
  if (cache.token !== token) cache = { token, entries: {} };
  const hit = cache.entries[planeKey];
  return hit && Date.now() - hit.at < CACHE_MS ? hit : null;
}

/** Drop the cache (after HR edits, activates or deactivates a type). */
export function invalidateDocumentTypes() {
  cache = { token: tokenHelper.get(), entries: {} };
}

const byOrder = (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name));

/**
 * @param {"hr"|"manager"|"self"|"hrOrg"|"managerOrg"} planeKey
 * @returns {{ types: object[], uploadTypes: object[], index: Map, loading: boolean, error: unknown, reload: () => void }}
 */
export default function useDocumentTypes(planeKey) {
  const [state, setState] = useState(() => {
    const hit = cached(planeKey);
    return hit ? { types: hit.types, loading: false, error: null } : { types: [], loading: true, error: null };
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const hit = nonce === 0 ? cached(planeKey) : null;
    if (hit) {
      setState({ types: hit.types, loading: false, error: null });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    LOADERS[planeKey]()
      .then((res) => {
        const types = arrayPayload(res).slice().sort(byOrder);
        cache.entries[planeKey] = { at: Date.now(), types };
        if (alive) setState({ types, loading: false, error: null });
      })
      .catch((error) => alive && setState({ types: [], loading: false, error }));
    return () => { alive = false; };
  }, [planeKey, nonce]);

  const reload = useCallback(() => {
    delete cache.entries[planeKey];
    setNonce((n) => n + 1);
  }, [planeKey]);

  const uploadTypes = useMemo(() => {
    if (planeKey === "hr") return state.types.filter((t) => t.is_active !== false && (t.plane || "employee") === "employee");
    if (planeKey === "manager") return state.types.filter((t) => t.manager_can_request);
    // An org document's type must be org-plane and active (R-36, R-37). The
    // plane filter is re-applied here because a server that ignores the query
    // parameter would otherwise offer employee types the publish would refuse.
    if (planeKey === "hrOrg") return state.types.filter((t) => t.is_active !== false && t.plane === "org");
    if (planeKey === "managerOrg") return state.types.filter((t) => t.is_active !== false && t.manager_can_request);
    return state.types;
  }, [planeKey, state.types]);

  const index = useMemo(() => typeIndex(state.types), [state.types]);

  return { ...state, uploadTypes, index, reload };
}
