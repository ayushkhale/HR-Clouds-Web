// ─────────────────────────────────────────────────────────────────────────────
// LetterProposalsPage.jsx (manager) — the letters this manager has asked HR to
// issue for their team (#145/#146).
//
// The same shared screen HR sees (CLAUDE.md §2). All this page decides is the
// plane and where names come from: a manager reads the roster they are allowed
// to see, not the whole organisation.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import LetterProposalsScreen from "../../../../shared/documents/LetterProposalsScreen";
import { useOrgEmployees } from "../../../../shared/attendance/EmployeePicker";

export default function LetterProposalsPage() {
  const team = useOrgEmployees("shift_assignment");

  const nameOf = useCallback(
    (id, fallback) => team.options.find((o) => o.id === id)?.name
      || fallback
      || (team.loading ? "Loading…" : "Team member"),
    [team.options, team.loading],
  );

  return (
    <LetterProposalsScreen
      plane="manager"
      people={team.options}
      peopleStatus={team.loading ? "loading" : team.error ? "error" : "ready"}
      nameOf={nameOf}
    />
  );
}
