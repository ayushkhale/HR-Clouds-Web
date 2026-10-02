# Leave Assignment APIs, Gender Correction & Payroll Null Confirmation (change record)

**Date:** 2026-10-02
**Modules:** Leave, Organization, Payroll (confirmation only)
**Audience:** Frontend (HR workspace)
**Answers:**
- `2026-10-02_frontend_requests_to_backend.md` (G-1, G-2, L-1)
- `2026-10-02_leave_assignment_api_request.md` (§3.1–§3.7, §4)

**Full contracts:** `public/md_leave/md_phases/phase7_api_analysis.md` (leave) · `public/md_organization/4_org_employee_api.md` §10 (HR fields)

> **Deploy dependency:** the leave changes need **migration 00066** applied on the server. Until it is, the leave endpoints are not available on that environment. The frontend can build against this record now.

---

## 1. What you asked for, and what shipped

| Your item | Status | Endpoint |
|---|---|---|
| §3.1 list assignments (P1) | **Shipped** | `GET /api/v1/leaves/assignments` |
| §3.2 per-user config (P1) | **Shipped** | `GET /api/v1/leaves/users/:userId/leave-config` |
| (history for the inspector) | **Shipped** | `GET /api/v1/leaves/users/:userId/assignments` |
| §3.3 bulk + preview (P2) | **Shipped** | `POST /api/v1/leaves/assignments/preview`, `POST /api/v1/leaves/assignments/bulk` |
| §3.4 `effective_from` | **Partly.** Today only (IST) | `POST /api/v1/leaves/users/:userId/assign-policy` |
| §3.4 end | **Shipped** | `POST /api/v1/leaves/assignments/:id/end` |
| §3.4 delete | **Not yet** (see §4.6) | — |
| §3.5 revert (P3) | **Shipped** | `DELETE /api/v1/leaves/users/:userId/configs/:leaveTypeId` |
| §3.6 headcount + 409 (P3) | **Shipped** | `GET /api/v1/leaves/templates` (`assigned_user_count`), `DELETE /api/v1/leaves/templates/:id` (`409 TEMPLATE_IN_USE`) |
| §3.7 summary (P3) | **Shipped** | `GET /api/v1/leaves/assignments/summary` |
| G-1 correct gender | **Shipped** | `PATCH /api/v1/organizations/employees/:id/hr-fields` |

**Roles:** every new endpoint above is **`hr` only**, not `hr, admin, super-admin`. Admin and super-admin are platform accounts with no organisation. The existing leave endpoints keep their current roles.

---

## 2. Things in the requests that were not as described

- **"Everything asked for is already in your database."** It was not. The backend did not record which policy a person was on, only copies of its values. We added that record. People who already had leave settings show as **`coverage: "legacy"`** ("on a policy, untracked") until HR re-assigns them. They are never shown as "no policy".
- **`target_employment_types: ["Full-time"]`.** Send the canonical values: `full_time`, `part_time`, `contract`, `intern`. Only employees carry an employment type, so managers and HR never match a non-empty employment-type filter.
- **"`NO_JOINING_DATE` — today this is a 500."** It was not a 500. The backend silently treated a missing joining date as *today*, which under-granted long-tenured people. It is now a `400 NO_JOINING_DATE` (see §4.3).
- **The attendance list you mirrored is not paginated.** The new leave list is (`page`, `limit` ≤ 100).

---

## 3. Your two §4 questions

1. **Assigning the same template twice.** From this release it is a **no-op**: `data.outcome: "unchanged"`, nothing is recalculated, and custom rules are kept. Before this release it silently wiped per-person overrides.
2. **Re-assigning mid-year: are taken days kept?** **Yes, taken leave is never reset.** For an upfront leave type, the balance moves by the difference between the old and new annual quotas, **pro-rated from 1 January** (or from the joining date if the person joined this year), not from the day of the change. Leave types the new policy lacks stop being applicable, but their balances are kept. The bulk preview lists both per person (`types_removed`, `overrides_replaced`).

---

## 4. Behaviour you need to show on screen

### 4.1 Unassigned people
They are included in `GET /leaves/assignments` with `coverage: "none"` and `assignment: null`. Filter with `?coverage=none`. Use `?coverage=on_policy|legacy|none` instead of `?unassigned=true`.

### 4.2 Bulk
- **One person per transaction**, so partial success is real. HTTP 200 with `assigned`, `skipped` and `failed` lists, each person with a code.
- **Cap: 200 people per request.** `400 BULK_LIMIT_EXCEEDED` with `details: { cap, matched }`; the preview shows `over_cap: true`. A targeting query cannot be paged: narrow it, or split with `included_users`.
- **Send the preview's `preview_token`** with the bulk call. If anyone or anything changed in between, you get `409 PREVIEW_STALE`; preview again.
- **An empty selection** (every array empty) needs `"scope": "all"`, or it returns `400 TARGETING_REQUIRED`.
- **Retrying is safe:** people already done come back as `skipped`.

### 4.3 Assign responses and errors (`POST …/assign-policy`)
- **Response:** now includes `data: { assignment_id, outcome, types_added, types_removed, types_updated, overrides_replaced }`. This is additive.
- **`400 TEMPLATE_EMPTY`:** the policy has no active leave types. Before, this silently removed all of the person's leave.
- **`400 NO_JOINING_DATE`:** fill the date with `PATCH /organizations/employees/:id/hr-fields`, then retry.
- **`409 EMPLOYEE_INACTIVE`:** the person is deactivated.
- **`400 EFFECTIVE_DATE_NOT_SUPPORTED`:** `effective_from` must be today (IST). Show only today in the date picker for now.

### 4.4 End (confirmation copy)
**"Balances are kept as they are. No leave can be applied after {date}, and monthly accrual stops."** The end date is inclusive and must be today or later.

**Errors:**
- `409 ASSIGNMENT_HAS_LEAVES_AFTER_END`: leave is booked after the date; `details.request_ids` lists it. Those requests must be cancelled or rejected first.
- `409 ASSIGNMENT_ALREADY_ENDED`.
- `400 EFFECTIVE_TO_IN_PAST`.
- `400 INVALID_DATE`.

**After the end date:**
- Applying for leave after the end returns `400 LEAVE_CONFIG_ENDED`.
- `GET /leaves/my-leave-types` drops those types after the end date, and returns `config.effective_to` so the apply form can say when the policy ends.

### 4.5 Customise and Revert
- **Prefill** from `GET …/leave-config`:
  - `effective`: the values now;
  - `policy_default`: what Revert restores;
  - `template_current`: shows drift when the template was edited after the person was assigned.
- **Legacy configs** return `null` for those policy fields and the override flags. Suggested copy: "Assigned before policies were tracked; re-assign to compare."
- **Revert outcomes:**
  - `outcome: "reverted"`;
  - `outcome: "unchanged"` (nothing was customised);
  - `409 NO_POLICY_DEFAULT` (legacy config).
- **The customise PUT** now also returns `overridden_fields`.

### 4.6 Delete
**Not available for an assignment that has started.** Its balances are already written and can't be honestly reversed. Offer **End**, or assigning the right policy, which recalculates correctly. Delete for not-yet-started assignments arrives together with future-dated assignments.

### 4.7 Policies page
- Show `assigned_user_count` per policy.
- `DELETE` returns `409 TEMPLATE_IN_USE` with `details.assigned_user_count`. Suggested copy: "{n} people are on this policy — move them first."

### 4.8 New error codes to map

| Code | HTTP |
|---|---|
| `EMPLOYEE_INACTIVE` | 409 |
| `EFFECTIVE_DATE_NOT_SUPPORTED` | 400 |
| `EFFECTIVE_TO_IN_PAST` | 400 |
| `INVALID_DATE` | 400 |
| `ASSIGNMENT_HAS_LEAVES_AFTER_END` | 409 |
| `LEAVE_CONFIG_ENDED` | 400 on submit, 409 on customise/revert |
| `PREVIEW_STALE` | 409 |
| `INVALID_TARGETING` | 400 |
| `TARGETING_REQUIRED` | 400 |
| `NO_POLICY_DEFAULT` | 409 |
| `CONFIG_NOT_FOUND` | 404 |
| `SELF_EDIT_NOT_ALLOWED` | 400 |
| `JOINING_DATE_ALREADY_SET` | 409 |

We kept your names: `TEMPLATE_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `TEMPLATE_EMPTY`, `TEMPLATE_IN_USE`, `ASSIGNMENT_NOT_FOUND`, `ASSIGNMENT_ALREADY_ENDED`, `NO_JOINING_DATE`, `BULK_LIMIT_EXCEEDED`.

We dropped `EFFECTIVE_DATE_BEFORE_JOINING`. With today-only dates, a future joiner is pro-rated from their joining date, so blocking them would be wrong.

---

## 5. G-1: gender shown wrongly after an invite

- **Your three questions.**
  - `gender` **is** accepted on invite. So are `blood_group`, `dob`, `pan_number`, `uan_number`, `marital_status`, `personal_email` and the address fields; the invite document was out of date and is now corrected.
  - It is stored on the role profile, which has **no default**.
  - #8 and #9 return it from that same row.
- **The likely cause.** If the same email was invited earlier under a different role (for example as an employee, and the invite expired), and then invited again (for example as a manager), two profiles existed. Screens that read the first one showed the old gender. A re-invite now removes the earlier role's leftover profile. Leave eligibility now always reads the profile of the person's actual role.
- **We need the affected person's `user_id`** to confirm this was the cause in your case.
- **HR can now correct it:** `PATCH /api/v1/organizations/employees/:id/hr-fields`.
  - HR only, and not on yourself.
  - Body: any of `gender` (`male` · `female` · `other` · `prefer_not_to_say` · `null`) or `marital_status` (≤ 50 or `null`), plus a required `reason` (3–500 characters).
  - The same endpoint fills a **missing** `joining_date` once; an existing date cannot be changed (`409 JOINING_DATE_ALREADY_SET`).
  - The response is the employee detail plus `changes: { field: { from, to } }`.
  - Pending leave requests are not re-checked; future applications use the new value.
- **UI suggestion.** Change the invite dialog note to: "Gender can be corrected later by HR."

## 6. G-2: payroll settings `null`

**Confirmed:** `null` is accepted for all five nullable keys, and clears the value:
- `fnf_encashment_max_days`, `compoff_encashment_max_days_per_fy`;
- `fnf_encashment_component_id`, `fnf_notice_recovery_component_id`, `compoff_encashment_component_id`.

`""` is rejected. So is an empty `{}` body, which needs at least one key: don't send a request when nothing changed.

---

## 7. Frontend checklist

- [x] **Leave Assignment list:** `GET /leaves/assignments`. Columns: Policy, From, State, Custom (`override_count`). Filter on `coverage`.
- [x] **Tiles:** `GET /leaves/assignments/summary`.
- [x] **Record inspector:**
  - `GET …/leave-config` for the configuration;
  - `GET …/assignments` for the history.
- [x] **Customise dialog:** prefill from `effective`; show `policy_default`; add a "Revert to the policy default" link (DELETE).
- [x] **Bulk assign dialog:**
  - canonical targeting values;
  - preview, then bulk with `preview_token`;
  - per-person outcomes;
  - cap of 200.
- [x] **Assign:** handle `data.outcome` and the new error codes. Date picker: today only.
- [x] **End row action:** copy from §4.4. Hide Delete.
- [x] **Leave Policies:** `assigned_user_count` column, plus the `TEMPLATE_IN_USE` message.
- [x] **Apply form:** `LEAVE_CONFIG_ENDED` is mapped in `leaveErrors.js`, which the apply form already reads. Showing `config.effective_to` on the form is still open.
- [ ] **Employee profile (HR):** "Correct gender / marital status / joining date" form using `hr-fields`, with a reason field.
- [ ] **Invite dialog:** update the gender note.

---

## 8. Frontend delivery note (2026-10-02)

Built against this record before the endpoints were live on any environment, so none of it
has been exercised against a real server yet — it needs migration 00066 and a QA pass.

**New:** `src/roles/hr/leaves/screens/LeaveAssignmentPage.jsx` ·
`src/roles/hr/leaves/components/AssignmentInspector.jsx` ·
`src/shared/leaves/CustomiseLeaveRulesDialog.jsx` · `src/shared/leaves/leaveAssignmentMeta.js`.
Route `/dashboard/hr/leaves/assignments`, HR only; sidebar entry under Setup › Leave, directly
after Leave Policies.

**Deviations from the plan, and why:**
- **No `effective_from` picker.** Today (IST) is the only value the server accepts, and a control
  whose single legal value is today can only be got wrong. The field is omitted and the server
  dates the assignment. Add the picker back with future dating (§4.6).
- **Employment type and job status are canonical constants**, not `useTargetingOptions`'s
  roster-derived strings. Only departments, locations and people come from that hook.
- **No chunking above the 200 cap.** The preview reports `over_cap` and HR is asked to narrow the
  selection, as §4.2 says. Splitting it behind HR's back would assign people the preview
  never showed them.
- **One row cannot be re-read after a write** — `GET /leaves/assignments` has no `user_id`
  filter, so the page re-reads the current page (one request) plus the summary.

**Still open, and not part of this change:**
- G-1 HR correction form for gender / marital status / joining date (`PATCH
  /organizations/employees/:id/hr-fields`) and the invite dialog's gender note.
- `config.effective_to` shown on the employee apply form.
- Delete, and future-dated assignments, when they arrive together.
