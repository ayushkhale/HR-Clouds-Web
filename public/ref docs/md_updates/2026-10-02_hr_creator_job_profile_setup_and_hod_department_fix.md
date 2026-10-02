# HR creator job-profile setup + department-head membership fix

**Date:** 2026-10-02
**Audience:** frontend engineers (HR dashboard: first-run/onboarding, profile, departments)
**Backend status:** code complete, 2647 unit tests green. One migration (`00067`) is handed to ops
**unrun** — read §7 before testing against a database.

---

## 1. What was broken

The **first HR of an organization** (the person who registers it) is not provisioned like anyone
else. Invited members get their job fields from the invitation payload; the creator got three
hardcoded values and nothing else.

Live example (production, org `83e91985-…`, HR `rishiganeshe33@gmail.com`), from
`GET /api/v1/organizations/me`:

```json
{
  "employee_code": "HR-242EAE",
  "department_id": null,
  "department": "Human Resources",
  "designation": "HR Administrator",
  "joining_date": null,
  "location_id": null, "work_location": null,
  "employment_type": null, "work_mode": null,
  "gender": null, "marital_status": null
}
```

Three distinct defects:

1. **A department that does not exist.** Registration wrote the *name* `'Human Resources'` with
   `department_id: null`. A brand-new org has no `organization_departments` rows at all, so the name
   referenced nothing. The same org's real department is called **"HR Department"** — and this HR is
   its head. Since `department_id` is the canonical key every roster, filter, report, count and
   bonus-rule candidate list groups by, the creator was skipped by all of them while the UI showed
   a department nobody could select. (`upsertRoleProfile` had the same bug class with a `'General'`
   default for any invitee sent without a `department_id`.)
2. **No joining date, and no way to add one.** `PATCH /employees/:id/hr-fields` is the only writer
   for a missing `joining_date` and it forbids self-edits — and the creator is normally the only HR,
   so the field was unreachable by anyone. Consequences: leave policy assignment refuses the member
   (`NO_JOINING_DATE`), payroll excludes them (`joining_date_missing`), bonus tenure skips them,
   payslips / annual statements / experience letters print an empty DOJ, and the attendance series
   loses its lower bound.
3. **A department head who is not in their department.** `transferDepartmentHead` set the
   `department_head` flag but never wrote `department_id`, so *any* head assigned through
   department create/update stayed outside their own department. `countProfilesInDepartment()`
   therefore reported **0 members** for a headed department — which let HR deactivate it — and
   department-scoped reads omitted its head. This is the mechanism that produced the "wrong
   department" the creator saw.

---

## 2. What changed on the backend

| # | Change | Frontend impact |
|---|---|---|
| 1 | Registration (free **and** paid) provisions the creator's `hr_profiles` row with `employee_code` only. No invented `department`, no invented `designation`, no guessed `joining_date`. | New orgs start with an explicitly empty job profile → run the wizard in §4. |
| 2 | `upsertRoleProfile` no longer defaults `department` to `'General'` on create. | An invitee sent without `department_id` now has `department: null` instead of a fake `"General"`. |
| 3 | **New** `GET /api/v1/organizations/me/setup-status` (HR only). | Drives the first-run wizard. §3.1 |
| 4 | **New** `PATCH /api/v1/organizations/me/job-profile` (HR only, fill-once). | The form that completes the profile. §3.2 |
| 5 | Assigning a department head now also writes `department_id` + the denormalized `department` name on that user when they have none; a head who belongs to a *different* department is refused (`409 HOD_IN_OTHER_DEPARTMENT`). | HOD picker UX + a new error to handle. §5 |
| 6 | `employment_type` is now selected for `hr` / `manager` rows in the employee **list** projection (it was selected for employees only, so manager/HR rows always read `null`). | Roster rows may now show a real `employment_type` where they used to show `null`. |
| 7 | Migration `00067` repairs existing rows (adopt the headed department, else resolve the orphan name, else null it; clears the auto-provisioned `'HR Administrator'`). | §6 — `department` can change value or become `null` for existing members. |

Non-goals, so you don't look for them: reporting lines and HOD-ship are **not** touched by the new
self-setup endpoint, `employee_code` is **not** editable anywhere, and nothing in the API is hard
gated on setup completeness.

---

## 3. New API contracts

Both endpoints are `hr`-only (`403 FORBIDDEN` for `manager` / `employee` / platform roles) and need
`Authorization: Bearer <access_token>` plus an active org context.

### 3.1 `GET /api/v1/organizations/me/setup-status`

No query parameters, no body.

**200 OK** — a freshly registered creator:

```json
{
  "success": true,
  "message": "Setup status fetched successfully",
  "data": {
    "is_complete": false,
    "missing_fields": [
      "joining_date", "department_id", "location_id", "designation",
      "employment_type", "work_mode", "gender", "marital_status"
    ],
    "locked_fields": [],
    "current_values": {
      "joining_date": null,
      "department_id": null,
      "location_id": null,
      "designation": null,
      "employment_type": null,
      "work_mode": null,
      "gender": null,
      "marital_status": null
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

| Field | Meaning |
|---|---|
| `is_complete` | `true` when `missing_fields` is empty. Hide the wizard entry point. |
| `missing_fields` | Still blank (`NULL`) → **editable** via §3.2 — this is the exact condition the write is guarded on, so anything listed here will be accepted. Order is stable (the order above). |
| `locked_fields` | Already on file → **not** editable via §3.2 (render read-only). |
| `current_values` | Current value of all eight fields (`null` when blank). `joining_date` is `YYYY-MM-DD`. |
| `org_structure.can_set_location` | `false` ⇒ the org has no **active** location; send the user to create one before offering the `location_id` picker. |
| `org_structure.can_set_department` | `false` ⇒ same for departments. |

**Errors:** `401` (no/invalid token) · `403 FORBIDDEN` (not HR) · `404 PROFILE_NOT_FOUND` (no
membership or no role-profile row).

### 3.2 `PATCH /api/v1/organizations/me/job-profile`

Send **only** the fields you are filling. Partial calls are expected and supported — the wizard can
submit `joining_date` on step 1 and `department_id` on step 3.

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

| Field | Type / vocabulary | Rules |
|---|---|---|
| `joining_date` | `"YYYY-MM-DD"` | Real calendar date. **Not in the future** (one day of slack past UTC today for IST and other ahead-of-UTC orgs). Not before `1950-01-01`. |
| `department_id` | UUIDv4 | Must belong to this org and be active. |
| `location_id` | UUIDv4 | Must belong to this org and be active. |
| `designation` | string | 2–150 chars. |
| `employment_type` | `full_time` · `part_time` · `contract` · `intern` | Exactly these (DB enum). |
| `work_mode` | `on-site` · `remote` · `hybrid` · `field` | Exactly these (DB enum — note `on-site`, not `office`). |
| `gender` | `male` · `female` · `other` · `prefer_not_to_say` | Exactly these. |
| `marital_status` | string | ≤ 50 chars. |
| `reason` | string | Optional, 3–500 chars, recorded in the audit log. **Not a field on its own** — a body containing only `reason` is a `400`. |

`null` and `""` are rejected for every field (this endpoint fills blanks, it never clears). Any
other key (`employee_code`, `job_status`, `pan_number`, `reporting_person`, `dob`, …) is silently
stripped — `dob`, `blood_group`, addresses and contact details stay on `PATCH /organizations/me`.

**200 OK**

```json
{
  "success": true,
  "message": "Job profile updated successfully",
  "data": {
    "profile": { "…": "exactly the GET /api/v1/organizations/me payload, refreshed" },
    "changes": {
      "joining_date":  { "from": null,              "to": "2024-04-01" },
      "department_id": { "from": null,              "to": "41fd3123-…" },
      "department":    { "from": "Human Resources", "to": "HR Department" },
      "location_id":   { "from": null,              "to": "6b84a9f5-…" },
      "work_location": { "from": null,              "to": "Main Branch Office" }
    },
    "setup_status": { "…": "the §3.1 payload, recomputed after the write" }
  }
}
```

Use `data.setup_status` to advance the wizard instead of re-calling §3.1, and `data.profile` to
refresh your profile store in one go.

**Errors**

| HTTP | `errorCode` | When | Suggested UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | No real field, bad enum, malformed / future / pre-1950 `joining_date`, non-UUID id, `null` / `""` | Field-level message from `message` |
| 400 | `LOCATION_MISMATCH` | The chosen department sits at a different location than the one you sent **or the one already on file** | "This department belongs to another office location." |
| 400 | `DEPARTMENT_INACTIVE` / `LOCATION_INACTIVE` | Target row is deactivated | Refresh the picker list |
| 403 | `FORBIDDEN` | Caller is not `hr` | — |
| 404 | `PROFILE_NOT_FOUND` | No membership / no role-profile row | Hard error |
| 404 | `DEPARTMENT_NOT_FOUND` / `LOCATION_NOT_FOUND` | Id is not in this org | Refresh the picker list |
| 409 | `FIELD_ALREADY_SET` | One or more fields you sent already hold a value (the `message` lists them), or a concurrent/duplicate request won the race | Re-fetch §3.1, re-render the form read-only for those fields |

**Why fill-once:** each of these values is already consumed elsewhere by the time it is set
(payroll proration, leave accrual, tenure, the attendance floor, leave-eligibility gates), so this
endpoint only ever writes into a blank. The guard lives in SQL (`WHERE column IS NULL`), so a
double-submit or a retry is safe: the second one gets `409 FIELD_ALREADY_SET`, never a silent
overwrite. **Corrections after the fact** are a different operation and keep their existing homes:
`PATCH /organizations/employees/:id/hr-fields` (gender / marital_status / joining_date) and
`PUT /organizations/users/:id/department-transfer` (department) — both require *another* HR, by
design.

---

## 4. Recommended first-run flow (HR dashboard)

```text
register org  ─→  land on HR dashboard
                      │
                      ├─ GET /organizations/me/setup-status
                      │       is_complete === true  ─→  nothing to do
                      │
                      └─ is_complete === false  ─→  show "Finish setting up your profile"
                                                     (banner / checklist card, dismissible —
                                                      this is a soft gate)

Step 1  Office location      (org_structure.can_set_location === false)
          POST /organizations/locations          → needs name + geo for attendance geofencing
Step 2  Department           (org_structure.can_set_department === false)
          POST /organizations/departments        → may set head_of_department_id = self
Step 3  My job profile
          PATCH /organizations/me/job-profile
            { joining_date, department_id, location_id, designation,
              employment_type, work_mode, gender, marital_status }
          → render fields in `missing_fields` as editable,
            fields in `locked_fields` as read-only,
            and use data.setup_status from the response to close the wizard
```

Notes for the implementation:

- Steps 1 and 2 use **existing** endpoints; only step 3 is new.
- If the HR made themselves the department head in step 2, the backend has already set their
  `department_id` (change #5), so `department_id` arrives in `locked_fields` at step 3 — do not send
  it again or you will get `409 FIELD_ALREADY_SET`.
- `joining_date` is the highest-value field: until it is set, this user cannot be assigned a leave
  policy and cannot be included in a payroll run. Consider flagging it first in the checklist.
- The same wizard should run for **any** HR whose `setup-status` is incomplete (e.g. an HR invited
  without a joining date), not only the org creator — the endpoints are not creator-specific.

---

## 5. Department-head changes you must handle

Assigning a head (`POST /organizations/departments` with `head_of_department_id`, or
`PUT /organizations/departments/:id`) now also makes that user a **member** of the department:

- Head has no department → it is filled (`department_id` + name). No API change for you.
- Head is already in that department → no-op.
- **Head belongs to a different department → `409 HOD_IN_OTHER_DEPARTMENT`.** They are not silently
  relocated, because moving someone has to move their reporting lines and their old department's
  headship too. Offer the department-transfer flow instead:
  `PUT /organizations/users/:id/department-transfer` with `{ new_department_id, is_new_hod: true, … }`,
  which does both atomically.
- Head is a member with no role-profile row at all → `404 HOD_PROFILE_NOT_FOUND` (data anomaly).

Second-order effect: because a head now counts as a department member,
`PUT /organizations/departments/:id` with `is_active: false` can return
`409 DEPARTMENT_IN_USE` for a department that *looked* empty before. That is correct — reassign or
transfer the head first.

**Suggested picker UX:** when choosing a head, prefer candidates whose `department_id` is `null` or
equal to this department, and surface the transfer flow for the rest rather than showing a raw 409.

---

## 6. Data repair for existing orgs (migration `00067`)

Idempotent, runs per role-profile table (`employee_profiles`, `manager_profiles`, `hr_profiles`):

0. Clears the auto-provisioned `designation = 'HR Administrator'` — matched on the exact
   registration fingerprint (`department = 'Human Resources'` **and** no `department_id` **and** no
   `joining_date`), so a hand-typed designation is untouched.
1. **Adopts the department the member heads**, when they head exactly one active department and
   carry no `department_id`. This is what fixes the reported case (creator ↔ "HR Department").
2. Otherwise **resolves the orphan name** against an active department of the same org by
   case-insensitive name, when exactly one matches.
3. Otherwise **nulls the name**: with no `department_id` it cannot be reconciled to any department
   row, so it is a ghost and displaying it is the bug.

Then it **logs** (does not change) how many active members still have no `joining_date`.

### Frontend-visible consequences

- `department` may **change value** (e.g. `"Human Resources"` → `"HR Department"`) or become
  **`null`** for members who previously showed `"General"` / `"Human Resources"`. Every surface that
  renders `department` must tolerate `null` — show an em dash or "Not assigned", never `"null"`.
- `designation` may become `null` for creator HRs. Same treatment.
- Prefer `department_id` for grouping/filtering and treat `department` as a display label only.
- `joining_date` is **not** guessed by the migration: existing creators will still see it blank
  until they fill it through §3.2. The setup banner is what makes that visible.

---

## 7. Testing notes

- Migration `00067` is handed over **unrun**; until it is applied, existing profiles still carry the
  ghost `"Human Resources"` / `"General"` labels. The new endpoints work either way — §3.2
  overwrites the stale label when `department_id` is filled.
- A fresh org registered after this deploy exercises the intended path end-to-end with no migration
  needed.
- Backend coverage: `tests/unit/organization/creator_setup_and_hod_department.test.js` (24 tests)
  pins the provisioning payload, the setup readout, fill-once + race + mismatch + inactive-target
  behaviour, the HOD membership rules, the validator vocabularies and the HR-only route gates.
- Full suite: `npm test` → **2647 pass / 0 fail**.

## 8. Related docs updated

- `public/md_system/api_registry.md` — rows **#32** and **#33** added; #2, #18, #19 amended.
- `public/md_organization/1_org_registration_api.md` — "Creator job fields" section.
- `public/md_organization/3_org_structure_api.md` — HOD invariants + new error codes.
- `public/md_organization/4_org_employee_api.md` — **§11 HR Self-Setup** (full contract).
