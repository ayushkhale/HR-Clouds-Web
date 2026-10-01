// ─────────────────────────────────────────────────────────────────────────────
// attendance/EmployeePicker.jsx — Searchable single-select employee picker.
// Value is the employee's `user_id`; the UI shows name, employee code and email
// so HR never types or reads a raw UUID.
//
// The people come from the app-wide employee directory
// (`shared/contexts/EmployeeDirectoryContext`), never from a fetch of its own:
// this picker used to call `GET /organizations/employees?purpose=…` and cache
// the answer separately, which made its list differ from the same list on the
// screen behind it — a different set of fields, no photos, and only the first
// page of a large organisation. The `purpose` prop is kept for callers but no
// longer picks a projection; it only says whether leavers belong in the list.
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceErrorMessage } from "../utils/attendanceErrors.js";
import { toEmployeeOption } from "./normalize.js";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext.jsx";
import { PersonSelect } from "../components/PersonPicker.jsx";

export { toEmployeeOption };

/**
 * The roster as picker options.
 * @param {string} [purpose] kept for call sites; "emp_report" includes leavers,
 *   anything else lists current employees only.
 */
export function useOrgEmployees(purpose = "shift_assignment") {
  const { options, activeOptions, status, error } = useEmployeeDirectory();
  return {
    options: purpose === "emp_report" ? options : activeOptions,
    loading: status === "loading" || status === "idle",
    error: status === "error" ? error : null,
  };
}

/** Roster-backed PersonSelect. Value is the employee's `user_id`. */
export default function EmployeePicker({ value, onChange, purpose = "shift_assignment", disabled = false, invalid = false, placeholder = "Choose an employee", id }) {
  const { options, loading, error } = useOrgEmployees(purpose);
  return (
    <PersonSelect
      id={id}
      people={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      invalid={invalid}
      loading={loading}
      error={error ? attendanceErrorMessage(error, "Couldn't load employees.") : ""}
      emptyText="No employees found. Invite employees first."
    />
  );
}
