// ─────────────────────────────────────────────────────────────────────────────
// LetterProposalsPage.jsx (HR) — the organisation's queue of letters managers
// have asked HR to issue (#148/#149/#150).
//
// The screen itself is shared with the manager workspace so the two can't drift
// apart (CLAUDE.md §2); all this page decides is the plane and where the names
// come from — HR resolves them from the whole org roster.
// ─────────────────────────────────────────────────────────────────────────────

import LetterProposalsScreen from "../../../../shared/documents/LetterProposalsScreen";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

export default function LetterProposalsPage({ embedded = false }) {
  const { rows: people, status, nameOf } = useEmployeeDirectory();
  return (
    <LetterProposalsScreen
      plane="hr"
      people={people}
      peopleStatus={status}
      nameOf={nameOf}
      embedded={embedded}
    />
  );
}
