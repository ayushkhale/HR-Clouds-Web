# Frontend implementation prompt — HR job-profile setup, null-safe department, HOD rules

> Hand this whole file to the frontend engineer / coding agent. It is self-contained: every contract
> needed is inline, no backend repo access required.
> Companion backend records: `2026-10-02_hr_creator_job_profile_setup_and_hod_department_fix.md`,
> `2026-10-02_hr_make_hod_department_head_column_fix.md`.

---

## Context

The HRMS backend changed on **2026-10-02**. Two defects were fixed and they both surface in the UI.

**1. The first HR of an organization (the person who registers it) used to be provisioned with
fabricated job data.** Registration wrote a department *name* (`"Human Resources"`) with no
`department_id` — a brand-new org has no departments at all, so it pointed at nothing — plus a
designation nobody chose (`"HR Administrator"`), and left `joining_date` empty. Nothing could fix
it afterwards: every endpoint that writes those fields refuses self-edits, and the creator is
usually the only HR. Consequences of the empty `joining_date`: that user cannot be assigned a leave
policy and cannot be included in a payroll run.

Registration now provisions an **intentionally empty job profile**, and two new HR-only endpoints
let an HR fill it themselves (fill-once per field). **The frontend must provide the wizard that
drives this** — otherwise a newly registered org has no way to complete setup.

**2. A department head was not a member of the department they headed.** Assigning a head only set
a flag; it never set the user's `department_id`. That is now fixed, which introduces two new error
conditions on the department endpoints, and `make_hod` finally works for `role: "hr"` invitations.

A data-repair migration also runs server-side: existing members' `department` may change value or
become `null`, and creator HRs' `designation` may become `null`.

---

## API conventions (unchanged)

- Base path `/api/v1`. All endpoints below require `Authorization: Bearer <access_token>`.
- Success: `{ "success": true, "message": "...", "data": { ... } }`
- Failure: `{ "success": false, "message": "<human readable>", "errorCode": "<STABLE_CODE>" }` —
  **branch on `errorCode`, never on `message`.**
- Everything new here is **`hr` role only**. Managers, employees and platform admins get
  `403 FORBIDDEN`. Hide the entry points for them; do not rely on the error.

---

## Task 1 — First-run setup wizard for HR (new, highest value)

### 1a. `GET /api/v1/organizations/me/setup-status`

No params, no body.

```json
{
  "success": true,
  "message": "Setup status fetched successfully",
  "data": {
    "is_complete": false,
    "missing_fields": ["joining_date", "department_id", "location_id", "designation", "employment_type", "work_mode", "gender", "marital_status"],
    "locked_fields": [],
    "current_values": {
      "joining_date": null, "department_id": null, "location_id": null, "designation": null,
      "employment_type": null, "work_mode": null, "gender": null, "marital_status": null
    },
    "org_structure": {
      "locations_count": 0,
      "departments_count": 0,
      "can_set_location": false,
      "can_set_department": false
    }
  }
}
```

| Field | How to use it |
|---|---|
| `is_complete` | `true` → hide the wizard/banner entirely. |
| `missing_fields` | Render these inputs as **editable**. The list is the server's source of truth — do not hardcode the field set. |
| `locked_fields` | Render these as **read-only** (value from `current_values`). Sending one back is a `409`. |
| `current_values` | Current values, `null` when blank. `joining_date` is `YYYY-MM-DD`. |
| `org_structure.can_set_location` | `false` → the org has no active location yet; do **not** show the location picker, show a "Create your first office location" step instead. |
| `org_structure.can_set_department` | `false` → same for departments. |

This is a **soft gate** — no other API is blocked on it. Use a dismissible banner or a checklist
card, not a modal the user cannot escape.

### 1b. `PATCH /api/v1/organizations/me/job-profile`

Send **only the fields being filled**. Partial submissions across several calls are expected and
supported (e.g. `joining_date` on step 1, `department_id` on step 3).

```json
{
  "joining_date": "2024-04-01",
  "department_id": "41fd3123-076b-4380-a6e4-95d3a3cf78a4",
  "location_id": "6b84a9f5-aaa7-4800-bf73-0f4238cec4c2",
  "designation": "Founder & Head of People",
  "employment_type": "full_time",
  "work_mode": "on-site",
  "gender": "male",
  "marital_status": "married",
  "reason": "First-run setup after registration"
}
```

| Field | Input type | Rules |
|---|---|---|
| `joining_date` | date | `YYYY-MM-DD`, real date, **not in the future**, not before `1950-01-01`. Set the date picker's max to today. |
| `department_id` | select | UUID from `GET /api/v1/organizations/departments` (active only). |
| `location_id` | select | UUID from `GET /api/v1/organizations/locations` (active only). |
| `designation` | text | 2–150 chars. |
| `employment_type` | select | exactly `full_time` · `part_time` · `contract` · `intern` |
| `work_mode` | select | exactly `on-site` · `remote` · `hybrid` · `field` — note **`on-site`**, not `office` |
| `gender` | select | exactly `male` · `female` · `other` · `prefer_not_to_say` |
| `marital_status` | text/select | ≤ 50 chars |
| `reason` | text | optional, 3–500 chars, goes to the audit log. **Not a field on its own** — a body with only `reason` is a `400`. |

Hard rules:
- **Never send `null` or `""`** for any field — rejected. Omit the key instead.
- **Never send a field listed in `locked_fields`.**
- Any other key (`employee_code`, `job_status`, `pan_number`, `dob`, `blood_group`, addresses…) is
  silently stripped. Personal fields stay on the existing `PATCH /api/v1/organizations/me`.

**200 OK**

```json
{
  "success": true,
  "message": "Job profile updated successfully",
  "data": {
    "profile": { "…": "identical shape to GET /api/v1/organizations/me" },
    "changes": { "joining_date": { "from": null, "to": "2024-04-01" } },
    "setup_status": { "…": "identical shape to 1a, recomputed after the write" }
  }
}
```

Use `data.setup_status` to advance the wizard (no second `GET` needed) and `data.profile` to refresh
the profile store in the same tick.

**Errors**

| HTTP | `errorCode` | Meaning | Required UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | bad enum / malformed, future or pre-1950 date / non-UUID / `null` or `""` / no real field | inline field error from `message` |
| 400 | `LOCATION_MISMATCH` | the chosen department belongs to a different office location than the one sent **or already saved** | "This department belongs to another office location." Re-fetch departments filtered by the saved `location_id`. |
| 400 | `DEPARTMENT_INACTIVE` / `LOCATION_INACTIVE` | target was deactivated | refresh the picker list |
| 403 | `FORBIDDEN` | not an HR | should be unreachable — hide the UI |
| 404 | `PROFILE_NOT_FOUND` | no membership / profile row | hard error toast |
| 404 | `DEPARTMENT_NOT_FOUND` / `LOCATION_NOT_FOUND` | id not in this org | refresh the picker list |
| 409 | `FIELD_ALREADY_SET` | one or more sent fields already hold a value (listed in `message`), or a concurrent/duplicate request won | re-fetch `setup-status`, re-render those fields read-only, keep the rest of the form |

**Why fill-once:** these values feed payroll proration, leave accrual, tenure, the attendance
baseline and leave-eligibility gates. The endpoint only writes into a blank. Later *corrections* are
a different operation performed by **another** HR via
`PATCH /api/v1/organizations/employees/:id/hr-fields` (gender / marital_status / joining_date) or
`PUT /api/v1/organizations/users/:id/department-transfer` (department). Do not build a self-service
"edit" affordance for these eight fields.

### 1c. The flow to build

```text
HR lands on the dashboard (after registration, or any later login)
   └─ GET /organizations/me/setup-status
        ├─ is_complete: true  → render nothing
        └─ is_complete: false → "Finish setting up your profile" banner / checklist

   Step 1  Office location — only when org_structure.can_set_location === false
             POST /api/v1/organizations/locations     (existing endpoint)
   Step 2  Department      — only when org_structure.can_set_department === false
             POST /api/v1/organizations/departments   (existing endpoint)
   Step 3  My job profile
             PATCH /api/v1/organizations/me/job-profile
             fields from missing_fields editable, locked_fields read-only
             advance/close using data.setup_status from the response
```

Implementation notes:
- Steps 1 and 2 use **existing** endpoints — only step 3 is new.
- If the HR made themselves the department head in step 2, the backend has **already** filled their
  `department_id`. It will arrive in `locked_fields` at step 3 — do not send it again.
- Surface `joining_date` first in the checklist: until it is set, that user cannot be assigned a
  leave policy or included in payroll. Good microcopy: "Required before leave and payroll can
  include you."
- Run this wizard for **any** HR whose `setup-status` is incomplete (e.g. an HR invited without a
  joining date), not only the org creator.
- **Never auto-fill or guess `joining_date`** (no "today" default). It is fill-once; a wrong value
  cannot be corrected through this endpoint.

---

## Task 2 — Null-safety for `department` and `designation`

A server-side repair migration resolves orphaned department names against real departments where it
can and **nulls them where it cannot**, and clears the auto-generated `"HR Administrator"`
designation. So:

- `department` may now be `null`, or may change value (e.g. `"Human Resources"` → `"HR Department"`).
- `designation` may now be `null`.

Audit every surface that renders either field and make it null-safe — show an em dash (`—`) or
"Not assigned", **never** the string `"null"`, `"undefined"` or an empty chip:

- own profile page, employee list, employee detail, colleague directory, org chart / hierarchy,
  department member lists, invitation list, dashboards, PDF/CSV exports, any avatar-with-subtitle
  component that prints `designation`.

**Grouping and filtering rule:** use `department_id` as the key, and treat `department` as a display
label only. Never group, filter, count or de-duplicate on the `department` string — that is the bug
being fixed. Where a user has `department_id: null`, bucket them as "Unassigned" and offer the
assign/transfer action.

---

## Task 3 — Department head picker and deactivation

Assigning a head now also makes that user a **member** of the department
(`POST /api/v1/organizations/departments`, `PUT /api/v1/organizations/departments/:id`).

| HTTP | `errorCode` | When | Required UI |
|---|---|---|---|
| 409 | `HOD_IN_OTHER_DEPARTMENT` | the chosen head already belongs to a different department | Do not show a raw error. Explain that they must be moved, and offer the transfer: `PUT /api/v1/organizations/users/:id/department-transfer` with `{ new_department_id, is_new_hod: true, … }`, which moves them and makes them head atomically. |
| 404 | `HOD_PROFILE_NOT_FOUND` | member has no profile row (data anomaly) | generic error toast |
| 400 | `INVALID_HOD_ROLE` | an `employee` was chosen | pre-filter the picker to managers/HR (unchanged) |
| 409 | `DEPARTMENT_IN_USE` | deactivating a department that still has members | **newly reachable**: the head now counts as a member, so a department that previously looked empty can fail. Message must say to transfer the head and remaining members out first. |

**Picker UX:** prefer candidates whose `department_id` is `null` or already equals this department;
for anyone else, lead with the transfer flow instead of letting the 409 happen.

---

## Task 4 — Invite form: `make_hod` now works for HR

`POST /api/v1/organizations/users/invite` with `{ role: "hr", department_id, make_hod: true }`
previously *reported success while doing nothing* — the HR joined and the department kept no head.
It now works.

- Enable the "Head of department" checkbox for `role: hr` as well as `role: manager`.
- Keep it disabled for `role: employee` (`400 INVALID_HOD_ROLE`).
- `make_hod` requires `department_id` (`400 MISSING_DEPARTMENT_FOR_HOD`) — enforce in the form.
- `make_hod` is HR-plane only; a `manager` caller sending it gets `403 FORBIDDEN_INVITE_FIELD`, so
  hide the control for manager callers.
- The headship is applied when the invitee **accepts**, not at invite time. Label it as pending
  ("Will become head of <department> on joining") in the invitation list.
- **Cache invalidation:** an HR accepting a `make_hod` invitation changes the department's head and
  can re-point several people's reporting lines. After a successful
  `POST /api/v1/organizations/invitations/accept`, invalidate
  `GET /api/v1/organizations/departments` and `GET /api/v1/organizations/hierarchy`.
- Backlog note for HR-facing copy: HR invitations sent with `make_hod: true` **before** this fix left
  no trace — those departments have no head and must be fixed manually via
  `PUT /api/v1/organizations/departments/:id`.

---

## Task 5 — `employment_type` is no longer always `null` for HR/manager rows

In employee **list** responses, `employment_type` was being selected only for employee rows, so
every manager/HR row returned `null`. It now returns the real value. Remove any workaround that
hides or hardcodes this column for managers/HR, and make sure the column renders all four values
(`full_time`, `part_time`, `contract`, `intern`).

---

## Acceptance checklist

- [ ] Fresh org registration → dashboard shows the setup banner; `setup-status` returns
      `is_complete: false` with all eight fields missing and both `can_set_*` false.
- [ ] Wizard refuses to show the department/location pickers until the org has an active one, and
      links to the create flows.
- [ ] Completing step 3 closes the wizard using the PATCH response's `setup_status` (verify in the
      network tab that no second `GET setup-status` is required).
- [ ] Re-submitting an already-filled field surfaces the `FIELD_ALREADY_SET` message and the fields
      flip to read-only after a refetch (test by double-clicking submit).
- [ ] A department from another location triggers the `LOCATION_MISMATCH` copy, not a raw error.
- [ ] Future date is blocked client-side (picker max = today) and the server's 400 is also handled.
- [ ] Every `department` / `designation` render site shows `—` for `null`; no `"null"` text anywhere.
- [ ] Department grouping/filtering keys off `department_id`; a member with none appears under
      "Unassigned".
- [ ] HOD picker: choosing someone from another department offers the transfer flow.
- [ ] Deactivating a headed department shows the `DEPARTMENT_IN_USE` guidance.
- [ ] Invite form: HOD checkbox enabled for `hr` and `manager`, disabled for `employee`, requires a
      department, hidden for manager callers.
- [ ] Department + hierarchy caches are invalidated after an invitation is accepted.
- [ ] Manager and employee logins never see the setup banner or the job-profile form.

## Do not

- Do not auto-fill, default or guess `joining_date`.
- Do not send `null`, `""` or `locked_fields` entries to `PATCH /me/job-profile`.
- Do not add a self-service edit for the eight job fields after they are set — corrections belong to
  another HR via the hr-fields / department-transfer endpoints.
- Do not hard-code the field list; drive the form from `missing_fields` / `locked_fields`.
- Do not block the app on `is_complete` — it is a soft gate.
- Do not branch on `message` strings; branch on `errorCode`.

## Confirm with backend if unclear

1. Where the setup banner should live (dashboard header vs a dedicated onboarding route).
2. Whether `marital_status` should be a free-text input or a fixed select (backend accepts any
   string ≤ 50; a shared vocabulary would be better if leave rules depend on it).
