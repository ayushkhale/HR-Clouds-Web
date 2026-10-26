// ─────────────────────────────────────────────────────────────────────────────
// organization/profileEnums.js — the canonical employee-profile vocabularies.
//
// WHY THIS FILE EXISTS. Audience targeting (who gets a weekly off, which holiday
// or leave policy applies, which document is distributed) is decided by STRICT
// enum equality against a profile's `employment_type` / `job_status`:
// `rule.target_job_statuses.includes(profile.job_status)`. Two failures follow
// from getting a value even slightly wrong, and both are silent:
//   · a non-canonical string ("Active", "Full-time", "Notice Period") is refused
//     by the API with VALIDATION_ERROR, or — worse — stored and then matched
//     against nothing, so the targeted employees quietly miss out;
//   · a dropdown built from the live roster only offers values somebody already
//     holds, so a brand-new org, or one with no interns yet, CANNOT target an
//     intern — the option was cut before HR ever saw it.
//
// So these are the authoritative machine values from the backend's PostgreSQL
// enums, listed in full and NEVER derived from the roster. Match them exactly.
// Labels are display-only (§4/§6) and a caller may reword them for its own
// context; the VALUES below are the contract and must not change.
//
// Contract: md_updates/2026-10-22_employee_job_status_and_employment_type_enums_guide.md
// (and the `office` → `on-site` input alias noted on WORK_MODE_OPTIONS).
// ─────────────────────────────────────────────────────────────────────────────

/** Legal / contractual arrangement. `null` is allowed (field is optional). */
export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
];

/** Operational lifecycle state. Server default is `confirmed`. */
export const JOB_STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "probation", label: "On probation" },
  { value: "trainee", label: "Trainee" },
  { value: "notice_period", label: "Serving notice" },
  { value: "contract", label: "On contract" },
  { value: "temporary", label: "Temporary" },
  { value: "terminated", label: "Terminated" },
];

// The frontend always SENDS and RENDERS `on-site`; the backend also accepts
// `office` on input but normalises it to `on-site`, so a profile never reads
// back as `office`. Never offer both — two values would mean one mode.
export const WORK_MODE_OPTIONS = [
  { value: "on-site", label: "On-site / Office" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "field", label: "Field" },
];

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

/** Bare value arrays, for validating a value against the enum before it is sent. */
export const EMPLOYMENT_TYPE_VALUES = EMPLOYMENT_TYPE_OPTIONS.map((o) => o.value);
export const JOB_STATUS_VALUES = JOB_STATUS_OPTIONS.map((o) => o.value);
export const WORK_MODE_VALUES = WORK_MODE_OPTIONS.map((o) => o.value);
export const GENDER_VALUES = GENDER_OPTIONS.map((o) => o.value);
