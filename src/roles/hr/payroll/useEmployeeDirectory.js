// ─────────────────────────────────────────────────────────────────────────────
// useEmployeeDirectory.js — The organisation's people for payroll and document
// screens, keyed by `user_id`, with a load status so a name that hasn't loaded
// yet never reads as "Employee not found".
//
// It is now a thin view of the app-wide directory
// (`shared/contexts/EmployeeDirectoryContext`) — the roster is read once per
// session for the whole app, so ~30 screens share one request and show the same
// people. This wrapper stays because those screens read `directory` and
// `nameOf`, and because `includeInactive: false` (leavers hidden) is a filter
// here, never a second fetch.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useEmployeeDirectory as useSharedDirectory } from "../../../shared/contexts/EmployeeDirectoryContext";

/**
 * @param {{ includeInactive?: boolean, enabled?: boolean }} [options] leavers
 *   are included by default, because past runs, loans and audit entries still
 *   name them. `enabled: false` skips the load (status "idle") for screens
 *   whose rows already embed names (gap G-2).
 * @returns {{ rows: object[], status: "idle"|"loading"|"ready"|"error"|"unavailable", directory: { options: object[], activeOptions: object[], byId: Map<string, object> }, nameOf: (id: string, fallback?: string) => string, reload: () => void }}
 */
export default function useEmployeeDirectory({ includeInactive = true, enabled = true } = {}) {
  const { rows, activeRows, options, activeOptions, byId, status, nameOf, reload } = useSharedDirectory({ enabled });

  // Leavers still resolve by id even when the list hides them: a payslip from
  // March must name the person who has since left.
  const directory = useMemo(
    () => ({ options: includeInactive ? options : activeOptions, activeOptions, byId }),
    [includeInactive, options, activeOptions, byId]
  );

  return {
    rows: includeInactive ? rows : activeRows,
    status,
    directory,
    nameOf,
    reload,
  };
}
