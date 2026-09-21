// ─────────────────────────────────────────────────────────────────────────────
// EmployeeMultiPicker.jsx — choose a group of employees by name.
//
// Off-cycle and final-settlement runs (#38, Phase 7) pay a named cohort rather
// than everybody. The backend takes `user_ids`, but nobody can pick a UUID from
// a list, so this is the shared PersonMultiSelect over the org roster.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { fetchAllOrgEmployees } from "../../../shared/utils/orgEmployees";
import { PersonMultiSelect } from "../../../shared/components/PersonPicker";

/**
 * @param {string[]} value      selected user ids
 * @param {Function} onChange   next ids
 * @param {number}   [max]      refuse to add beyond this many
 * @param {boolean}  [disabled]
 * @param {boolean}  [includeInactive] leavers need to be selectable for a final settlement
 */
export default function EmployeeMultiPicker({ value = [], onChange, max, disabled = false, includeInactive = true }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAllOrgEmployees({ includeInactive })
      .then((list) => { if (!cancelled) setPeople(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setError("Couldn't load people."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [includeInactive]);

  return (
    <PersonMultiSelect
      people={people}
      value={value}
      onChange={onChange}
      max={max}
      disabled={disabled}
      loading={loading}
      error={error}
      placeholder="Choose people"
    />
  );
}
