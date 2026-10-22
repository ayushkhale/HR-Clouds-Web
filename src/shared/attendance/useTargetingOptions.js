// ─────────────────────────────────────────────────────────────────────────────
// attendance/useTargetingOptions.js — Live org data for holiday / weekly-off
// targeting selectors (locations, departments, employees, employment types,
// job statuses, shifts). Replaces the loaders duplicated in both modals and
// fixes options with undefined labels (which crashed MultiSelectDropdown search).
//
// EMPLOYMENT TYPES AND JOB STATUSES ARE CANONICAL, NOT ROSTER-DERIVED (2026-10-22).
// They used to be scraped off whoever happened to be on the roster, with
// title-case fallbacks ("Active", "Full-time", "Notice Period"). Both were
// wrong: a value nobody holds yet — an intern in an org with no interns — was
// simply missing from the dropdown, so HR could not target it; and the
// fallbacks were non-canonical strings the matcher never equals and the API
// refuses with VALIDATION_ERROR. The backend matches on strict enum equality,
// so the options now come from the authoritative list in profileEnums.js, in
// full, every time. Contract:
// md_updates/2026-10-22_employee_job_status_and_employment_type_enums_guide.md §8.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { organizationAPI, tokenHelper } from "../api";
import { EMPLOYMENT_TYPE_OPTIONS, JOB_STATUS_OPTIONS } from "../organization/profileEnums.js";
import { isUuid, listFrom } from "./normalize.js";
import { useOrgEmployees } from "./EmployeePicker.jsx";

const CACHE_MS = 60_000;
// Keyed by session token: org data must not survive a logout/login in the same tab.
let orgCache = { key: null, at: 0, locations: [], departments: [] };
const orgCacheFresh = () => orgCache.key === (tokenHelper.get() || "") && Date.now() - orgCache.at < CACHE_MS;
const EMPTY = [];

export function useTargetingOptions({ shifts = EMPTY } = {}) {
  const employees = useOrgEmployees("shift_assignment");
  const [org, setOrg] = useState(() =>
    orgCacheFresh()
      ? { locations: orgCache.locations, departments: orgCache.departments, loading: false }
      : { locations: [], departments: [], loading: true }
  );

  useEffect(() => {
    if (orgCacheFresh()) return undefined;
    const key = tokenHelper.get() || "";
    let alive = true;
    Promise.allSettled([organizationAPI.getLocations(), organizationAPI.getDepartments()]).then(([loc, dep]) => {
      const locations = loc.status === "fulfilled" ? listFrom(loc.value, ["locations"]) : [];
      const departments = dep.status === "fulfilled" ? listFrom(dep.value, ["departments"]) : [];
      if (loc.status === "fulfilled" && dep.status === "fulfilled") orgCache = { key, at: Date.now(), locations, departments };
      if (alive) setOrg({ locations, departments, loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    // `useOrgEmployees("shift_assignment")` already hands back current employees
    // only. `o.active` is the directory's own canonical flag, so this never
    // re-derives "is this person still here?" with a second, subtly different
    // rule — it used to test `status !== "Inactive"` (capital I) against a
    // lower-case value, which matched nothing and only looked like a guard.
    // A leaver already saved in a stored audience still shows as a chip
    // ("Former employee"), so they can be seen and removed but never added.
    const activeEmployees = employees.options.filter((o) => o.active !== false);

    return {
      loading: org.loading || employees.loading,
      locationOptions: org.locations.filter((l) => l.is_active !== false).map((l) => ({ value: l.id, label: l.name || "Unnamed location" })),
      departmentOptions: org.departments.filter((d) => d.is_active !== false).map((d) => ({ value: d.id || d._id, label: d.name || "Unnamed department" })),
      // For PersonMultiSelect, the one people picker used app-wide.
      employeePeople: activeEmployees,
      // The full canonical enums, so every value can be targeted even when no
      // current employee holds it. See the header for why this is not derived.
      employmentTypeOptions: EMPLOYMENT_TYPE_OPTIONS,
      jobStatusOptions: JOB_STATUS_OPTIONS,
      shiftOptions: shifts.map((s) => ({ value: s.id, label: s.name || "Unnamed shift" })),
    };
  }, [employees.options, employees.loading, org, shifts]);
}

/** Keep already-saved values selectable even if they're no longer in the live list. */
export function withSelected(options, selected = [], unknownLabel = "No longer available") {
  const known = new Set(options.map((o) => o.value));
  const extra = (selected || [])
    .filter((v) => !known.has(v))
    .map((v) => ({ value: v, label: typeof v === "string" && !isUuid(v) ? v : unknownLabel }));
  return extra.length ? [...options, ...extra] : options;
}

/** Human-readable targeting summary lines for a holiday / weekly-off rule. */
export function describeTargeting(rule, t) {
  const parts = [];
  const add = (title, options, ids) => {
    const list = Array.isArray(ids) ? ids : [];
    if (list.length === 0) return;
    const names = list.map((id) => options?.find((o) => o.value === id)?.label || (isUuid(id) ? null : id)).filter(Boolean);
    const hidden = list.length - names.length;
    parts.push(`${title}: ${names.length ? names.join(", ") : ""}${hidden > 0 ? `${names.length ? " " : ""}+${hidden} more` : ""}`);
  };
  add("Locations", t.locationOptions, rule.target_locations);
  add("Departments", t.departmentOptions, rule.target_departments);
  add("Shifts", t.shiftOptions, rule.target_shifts);
  add("Employment types", t.employmentTypeOptions, rule.target_employment_types);
  add("Job statuses", t.jobStatusOptions, rule.target_job_statuses);
  // Weekly-off rules use `target_users`; holidays use included/excluded (§5.5).
  add("Employees", t.employeeOptions, rule.target_users);
  add("Also includes", t.employeeOptions, rule.included_users);
  add("Excludes", t.employeeOptions, rule.excluded_users);
  return parts;
}
