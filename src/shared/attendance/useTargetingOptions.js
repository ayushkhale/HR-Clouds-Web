// ─────────────────────────────────────────────────────────────────────────────
// attendance/useTargetingOptions.js — Live org data for holiday / weekly-off
// targeting selectors (locations, departments, employees, employment types,
// job statuses, shifts). Replaces the loaders duplicated in both modals and
// fixes options with undefined labels (which crashed MultiSelectDropdown search).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { organizationAPI, tokenHelper } from "../api";
import { isUuid, listFrom } from "./normalize.js";
import { useOrgEmployees } from "./EmployeePicker.jsx";

const CACHE_MS = 60_000;
// Keyed by session token: org data must not survive a logout/login in the same tab.
let orgCache = { key: null, at: 0, locations: [], departments: [] };
const orgCacheFresh = () => orgCache.key === (tokenHelper.get() || "") && Date.now() - orgCache.at < CACHE_MS;
const EMPTY = [];

// No documented enum endpoint exists (audit C7). Values are taken from the org
// roster; these are used only when no employee record carries a value.
const FALLBACK_EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract"];
const FALLBACK_JOB_STATUSES = ["Active", "Probation", "Notice Period"];

const uniqueStrings = (values) =>
  [...new Set(values.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))].sort((a, b) => a.localeCompare(b));

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
    const raw = employees.options.map((o) => o.raw || {});
    const pick = (e, key) => e?.[key] ?? e?.profile?.[key] ?? e?.employee_profile?.[key];
    const employmentTypes = uniqueStrings(raw.map((e) => pick(e, "employment_type")));
    const jobStatuses = uniqueStrings(raw.map((e) => pick(e, "job_status")));
    const activeEmployees = employees.options.filter((o) => o.raw?.is_active !== false && o.raw?.status !== "Inactive");

    return {
      loading: org.loading || employees.loading,
      locationOptions: org.locations.filter((l) => l.is_active !== false).map((l) => ({ value: l.id, label: l.name || "Unnamed location" })),
      departmentOptions: org.departments.filter((d) => d.is_active !== false).map((d) => ({ value: d.id || d._id, label: d.name || "Unnamed department" })),
      employeeOptions: activeEmployees.map((o) => ({ value: o.id, label: o.name, subtitle: o.code || o.email, avatarIdentifier: o.email || o.name })),
      employmentTypeOptions: (employmentTypes.length ? employmentTypes : FALLBACK_EMPLOYMENT_TYPES).map((v) => ({ value: v, label: v })),
      jobStatusOptions: (jobStatuses.length ? jobStatuses : FALLBACK_JOB_STATUSES).map((v) => ({ value: v, label: v })),
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
