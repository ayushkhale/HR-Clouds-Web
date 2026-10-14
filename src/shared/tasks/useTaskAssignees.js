// ─────────────────────────────────────────────────────────────────────────────
// useTaskAssignees.js — Who this viewer may give a task to, or hand one on to.
//
// It reads the ONE roster the app has (`useEmployeeDirectory`, CLAUDE.md §7)
// and never fetches its own. That matters more than it looks: the directory's
// read is already hierarchy-scoped server-side, so a manager's rows ARE their
// direct reports, which is exactly the set #255 and #261 will accept. A second,
// narrower roster call would also drop `avatar_url` and stop at 100 people.
//
// All this hook adds is the two exclusions the task endpoints enforce anyway,
// so the picker can't offer somebody the server would refuse:
//   • the caller themselves — D-T3 bans self-delegation outright
//   • for a manager, anyone holding hr/admin/super-admin — #255 and #261 refuse
//     those even inside the reporting line
//
// Hooks live in their own module rather than beside the dialogs, because a
// non-component export from a .jsx file breaks fast refresh (§8).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";

/** Roles #255/#261 refuse as the target of a manager's delegation. */
const GLOBAL_APPROVER_ROLES = new Set(["hr", "admin", "super-admin", "superadmin"]);

/**
 * @param {"manager"|"hr"} plane
 * @returns {{ options: object[], loading: boolean, unavailable: boolean }}
 *   `unavailable` means this role may not read the roster at all, so the picker
 *   says so rather than showing an empty list that looks like an empty company.
 */
export function useTaskAssigneeOptions(plane) {
  const { user } = useAuth();
  const { activeOptions, loading, status } = useEmployeeDirectory();
  const viewerId = user?.id;

  const options = useMemo(() => activeOptions.filter((person) => {
    if (viewerId && person.id === viewerId) return false;
    if (plane === "manager" && GLOBAL_APPROVER_ROLES.has(person.role)) return false;
    return true;
  }), [activeOptions, plane, viewerId]);

  return { options, loading, unavailable: status === "unavailable" };
}
