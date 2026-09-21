// ─────────────────────────────────────────────────────────────────────────────
// attendance/EmployeePicker.jsx — Searchable single-select employee picker.
// Value is the employee's `user_id`; the UI shows name, employee code and email
// so HR never types or reads a raw UUID.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { organizationAPI, tokenHelper } from "../api";
import { attendanceErrorMessage } from "../utils/attendanceErrors.js";
import { isUuid, listFrom } from "./normalize.js";
import { PersonSelect } from "../components/PersonPicker.jsx";

const firstString = (...values) => values.find((v) => typeof v === "string" && v.trim() && !isUuid(v))?.trim() || "";

/** Normalise one org-roster entry into `{ id, name, code, email }`. */
export function toEmployeeOption(e) {
  const id = e?.user_id || e?.user?.id || e?.employee_id || e?.id;
  const profile = e?.profile || e?.employee_profile || e?.manager_profile || e?.hr_profile || {};
  const joined = [firstString(profile.first_name, e?.first_name), firstString(profile.last_name, e?.last_name)].filter(Boolean).join(" ");
  const email = firstString(e?.email, e?.identifier, e?.user?.identifier, e?.user?.email);
  const name = firstString(profile.display_name, e?.display_name, e?.name, e?.user?.name) || joined || email || "Unnamed employee";
  const code = firstString(e?.employee_code, profile.employee_code, e?.user?.employee_profile?.employee_code);
  return { id, name, code, email, sub: "", raw: e };
}

// Keyed by the session token so a logout → login (another user or org) in the
// same tab never reuses the previous session's roster.
let cache = { key: null, at: 0, options: [] };
const CACHE_MS = 60_000;
const cacheKey = (purpose) => `${tokenHelper.get() || ""}|${purpose}`;
const isFresh = (purpose) => cache.key === cacheKey(purpose) && Date.now() - cache.at < CACHE_MS;

export function useOrgEmployees(purpose = "shift_assignment") {
  const [state, setState] = useState(() =>
    isFresh(purpose)
      ? { options: cache.options, loading: false, error: null }
      : { options: [], loading: true, error: null }
  );

  useEffect(() => {
    if (isFresh(purpose)) return undefined;
    const key = cacheKey(purpose);
    let alive = true;
    organizationAPI
      .getEmployees({ purpose })
      .then((res) => {
        const list = listFrom(res, ["employees", "members", "users"]);
        const seen = new Set();
        const options = list.map(toEmployeeOption).filter((o) => {
          if (!o.id || seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });
        options.sort((a, b) => a.name.localeCompare(b.name));
        cache = { key, at: Date.now(), options };
        if (alive) setState({ options, loading: false, error: null });
      })
      .catch((error) => alive && setState({ options: [], loading: false, error }));
    return () => {
      alive = false;
    };
  }, [purpose]);

  return state;
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
