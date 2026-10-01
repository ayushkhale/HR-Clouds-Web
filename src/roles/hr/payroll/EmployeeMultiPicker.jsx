// ─────────────────────────────────────────────────────────────────────────────
// EmployeeMultiPicker.jsx — choose a group of employees by name.
//
// Off-cycle and final-settlement runs (#38, Phase 7) pay a named cohort rather
// than everybody. The backend takes `user_ids`, but nobody can pick a UUID from
// a list, so this is the shared PersonMultiSelect over the app-wide employee
// directory — the same people, in the same order, as every other picker.
// ─────────────────────────────────────────────────────────────────────────────

import { PersonMultiSelect } from "../../../shared/components/PersonPicker";
import { useEmployeeDirectory } from "../../../shared/contexts/EmployeeDirectoryContext";

/**
 * @param {string[]} value      selected user ids
 * @param {Function} onChange   next ids
 * @param {number}   [max]      refuse to add beyond this many
 * @param {boolean}  [disabled]
 * @param {boolean}  [includeInactive] leavers need to be selectable for a final settlement
 */
export default function EmployeeMultiPicker({ value = [], onChange, max, disabled = false, includeInactive = true }) {
  const { options, activeOptions, status } = useEmployeeDirectory();

  return (
    <PersonMultiSelect
      people={includeInactive ? options : activeOptions}
      value={value}
      onChange={onChange}
      max={max}
      disabled={disabled}
      loading={status === "loading" || status === "idle"}
      error={status === "error" ? "Couldn't load people." : ""}
      placeholder="Choose people"
    />
  );
}
