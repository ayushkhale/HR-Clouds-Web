// ─────────────────────────────────────────────────────────────────────────────
// useEmployeeDirectory.js — The whole organisation employee list for payroll
// screens, keyed by `user_id`, with a load status so a name that hasn't loaded
// yet never reads as "Employee not found".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAllOrgEmployees } from "../../../shared/utils/orgEmployees";
import { employeeDirectory } from "./variablePayMeta";

/**
 * @param {{ includeInactive?: boolean, enabled?: boolean }} [options] leavers
 *   are included by default, because past runs, loans and audit entries still
 *   name them. `enabled: false` skips the fetch (status "idle") for screens
 *   whose rows already embed names (gap G-2).
 * @returns {{ rows: object[], status: "idle"|"loading"|"ready"|"error", directory: ReturnType<typeof employeeDirectory>, nameOf: (id: string, fallback?: string) => string, reload: () => void }}
 */
export default function useEmployeeDirectory({ includeInactive = true, enabled = true } = {}) {
  const [state, setState] = useState(() => ({ rows: [], status: enabled ? "loading" : "idle" }));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading" }));
    fetchAllOrgEmployees({ includeInactive })
      .then((rows) => { if (!cancelled) setState({ rows, status: "ready" }); })
      // Keep any rows from an earlier load; only the status changes.
      .catch(() => { if (!cancelled) setState((s) => ({ ...s, status: "error" })); });
    return () => { cancelled = true; };
  }, [includeInactive, enabled, reloadKey]);

  const directory = useMemo(() => employeeDirectory(state.rows), [state.rows]);

  const nameOf = useCallback((id, fallback) => {
    if (!id) return fallback ?? "N/A";
    const hit = directory.byId.get(id);
    if (hit) return hit.name;
    // "idle" only lasts until the screen asks for the directory.
    if (state.status === "loading" || state.status === "idle") return "Loading…";
    if (state.status === "error") return "Name unavailable";
    return fallback ?? "Employee not found";
  }, [directory, state.status]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { rows: state.rows, status: state.status, directory, nameOf, reload };
}
