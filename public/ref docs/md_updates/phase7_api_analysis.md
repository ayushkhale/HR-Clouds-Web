# Phase 7: Policy Assignment Ledger, Coverage & Bulk Assignment APIs — Frontend Integration Guide

This document provides complete integration specifications for Frontend Developers and Support Engineers implementing the **Phase 7 (Leave Assignment)** screens: the Setup › Leave **Leave Assignment** page, its record inspector, the Customise dialog and the bulk assign dialog.

> [!IMPORTANT]
> **Architectural Note:** Until Phase 7 the backend did not record which policy template a person was on. Assigning a template only *copied* its values into per-user configs. Phase 7 adds an assignment ledger (`employee_leave_policy_assignments`, migration 00066). Every assignment now records the template, the dates, who assigned it, and when it ended. People who already had leave configs get one **legacy** ledger row with no template; re-assigning a policy makes them tracked.
>
> **Roles:** every new Phase 7 route is **`hr` only**. `admin` / `super-admin` are platform roles with no organisation and are refused (`403 FORBIDDEN`). Feature flag: `leave.access`. Dates are IST business dates `YYYY-MM-DD`, inclusive.

---

## 1. Coverage Roster (who is on which policy, and who is on none)

**Endpoint:** `GET /api/v1/leaves/assignments`
**Roles Required:** `hr`

One row per **active member** (the same people as `GET /organizations/employees`). Members with no policy are **included** with `coverage: "none"` and `assignment: null`.

### Query Parameters
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `template_id` | UUID | No | Members currently on this policy |
| `coverage` | String | No | `on_policy` (tracked policy) · `legacy` (policy from before tracking) · `none` (no policy) |
| `has_overrides` | Boolean | No | `true` = at least one customised leave type |
| `department_id` | UUID | No | |
| `role` | String | No | `employee` · `manager` · `hr` |
| `q` | String | No | ≤ 150; matches name, email or employee code |
| `page` / `limit` | Integer | No | `page` ≥ 1 (default 1); `limit` 1–100 (default 20) |

Unknown parameters are rejected with `400 VALIDATION_ERROR`.

**Example Response (`data`):**
```json
{
  "total": 150, "page": 1, "limit": 20,
  "rows": [
    {
      "user": { "user_id": "…", "name": "Asha Menon", "email": "asha@acme.in", "role": "employee",
                "employee_code": "E-104", "department": "Engineering", "designation": "Backend Dev",
                "avatar_url": null, "gender": "female" },
      "coverage": "on_policy",
      "assignment": {
        "id": "…", "template": { "id": "…", "name": "Standard 2026", "entitlement_count": 4 },
        "legacy": false, "effective_from": "2026-01-01", "effective_to": null, "state": "ongoing",
        "override_count": 0, "assigned_by": { "id": "…", "name": "Rahul Gupta" },
        "assigned_at": "2026-01-01T06:12:44.000Z"
      }
    },
    { "user": { "user_id": "…", "name": "Priya N", "...": "…" }, "coverage": "none", "assignment": null }
  ]
}
```

`state` is `ongoing` or `ended` (`upcoming` arrives with future-dated assignments). `override_count` powers the "Custom rules" column.

---

## 2. Coverage Summary (the tiles)

**Endpoint:** `GET /api/v1/leaves/assignments/summary`
**Roles Required:** `hr`

```json
{ "on_policy": 142, "legacy": 3, "unassigned": 8, "with_overrides": 11,
  "templates": [{ "id": "…", "name": "Standard 2026", "assigned_user_count": 118 }] }
```
Same population as §1, in one request.

---

## 3. One Member's Effective Configuration (Customise dialog)

**Endpoint:** `GET /api/v1/leaves/users/:userId/leave-config`
**Roles Required:** `hr`

Each leave type shows three sets of values:
- **`effective`**: what applies now.
- **`policy_default`**: the policy as it was assigned. This is what "Revert" restores.
- **`template_current`**: what the template says today. It differs from `policy_default` when someone edited the template after the person was assigned, because template edits do not move people already on the policy.

```json
{
  "user_id": "…",
  "assignment": { "id": "…", "template": { "id": "…", "name": "Standard 2026" }, "legacy": false,
                  "effective_from": "2026-01-01", "effective_to": null, "state": "ongoing",
                  "assigned_by": { "id": "…", "name": "Rahul Gupta" }, "assigned_at": "…" },
  "types": [{
    "leave_type_id": "…", "leave_type": { "name": "Earned Leave", "code": "EL", "is_active": true },
    "config_id": "…", "effective_from": "2026-07-14", "effective_to": null,
    "effective":        { "assigned_annual_quota": 24, "accrual_type": "upfront", "max_carry_forward": 5,
                          "probation_restriction_days": 90, "max_negative_balance": 0, "notice_period_max_days": null },
    "policy_default":   { "annual_quota": 18, "accrual_type": "upfront", "max_carry_forward": 5,
                          "probation_restriction_days": 90, "max_negative_balance": 0, "notice_period_max_days": null },
    "template_current": { "annual_quota": 20, "...": "…" },
    "is_overridden": true, "overridden_fields": ["assigned_annual_quota"]
  }]
}
```

**Legacy configs** (assigned before tracking) return `null` for `policy_default`, `template_current`, `is_overridden` and `overridden_fields`. Suggested UI copy: "Assigned before policies were tracked; re-assign a policy to compare."

**Errors:** `404 EMPLOYEE_NOT_FOUND`.

---

## 4. One Member's Assignment History (record inspector)

**Endpoint:** `GET /api/v1/leaves/users/:userId/assignments`
**Roles Required:** `hr`

Newest first, ended ones included, at most 100. Each row has the §1 `assignment` shape plus `source` (`assign` · `bulk` · `legacy_backfill`), `ended_by`, `ended_at` and `end_reason`.

---

## 5. Assign a Policy to One Person (changed)

**Endpoint:** `POST /api/v1/leaves/users/:userId/assign-policy`
**Roles Required:** `hr`, `admin`, `super-admin` (unchanged)

### New Request Body Fields (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `effective_from` | String | No | `YYYY-MM-DD`; must be **today (IST)**. Future dates: `400 EFFECTIVE_DATE_NOT_SUPPORTED` |

### New Response Body (additive)
```json
{ "success": true, "message": "Policy assigned successfully.",
  "data": { "assignment_id": "…", "outcome": "assigned",
            "types_added": ["ML"], "types_removed": ["SL"], "types_updated": ["EL"], "overrides_replaced": ["EL"] } }
```

### New Error Scenarios & Business Rules:
- **Same policy again is a no-op.** `outcome: "unchanged"`, nothing written, custom rules kept. (Before Phase 7 it wiped per-person overrides.)
- **`400 TEMPLATE_EMPTY`:** the policy has no active leave types. Before Phase 7 this silently removed all of the person's leave.
- **`400 NO_JOINING_DATE`:** no joining date on file. Before Phase 7 the backend silently used today, which under-granted long-tenured staff. HR can fill a missing date with `PATCH /organizations/employees/:id/hr-fields`.
- **`409 EMPLOYEE_INACTIVE`:** the member is deactivated.
- **Taken leave is never reset.** For an upfront type that stays upfront, the balance moves by the quota difference **pro-rated from 1 January** (or the joining date if they joined this year), not from the day of the change. Leave types the new policy lacks stop being applicable, but their balances are kept.

---

## 6. Bulk Assignment: Preview, then Assign

**Endpoints:**
- `POST /api/v1/leaves/assignments/preview` writes nothing.
- `POST /api/v1/leaves/assignments/bulk` performs the assignment.

**Roles Required:** `hr`

### Request Body Fields (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `template_id` | UUID | Yes | |
| `effective_from` | String | No | Today (IST) only |
| `target_departments` / `target_locations` | UUID[] | No | ≤ 500 each; must belong to the org (`400 INVALID_TARGETING`) |
| `target_employment_types` | String[] | No | `full_time` · `part_time` · `contract` · `intern` (canonical values, **not** "Full-time"). Only employees carry one, so managers and HR never match a non-empty filter |
| `target_job_statuses` | String[] | No | `probation` · `confirmed` · `notice_period` · `terminated` · `trainee` · `contract` · `temporary` |
| `included_users` / `excluded_users` | UUID[] | No | ≤ 500 each. `excluded_users` wins; `included_users` restricts |
| `scope` | String | No | `selection` (default) or `all`. **Must be `all` when every array is empty**, otherwise `400 TARGETING_REQUIRED` |
| `preview_token` | String | No (bulk only) | The token from the preview; `409 PREVIEW_STALE` if anything changed |

**Preview Response (`data`):**
```json
{ "template": { "id": "…", "name": "Standard 2026" }, "matched": 34, "cap": 200, "over_cap": false,
  "preview_token": "64-hex",
  "unchanged": [{ "user_id": "…", "name": "Asha Menon", "reason": "ALREADY_ON_TEMPLATE" }],
  "changing":  [{ "user_id": "…", "name": "Rohit Shah", "from_template": "Standard 2025", "legacy": false,
                  "types_added": [], "types_removed": ["SL"], "overrides_replaced": ["EL"] }],
  "blocked":   [{ "user_id": "…", "name": "Priya N", "reason": "NO_JOINING_DATE" }] }
```
A person with no policy appears in `changing` with `from_template: null`. A `blocked` reason is `NO_JOINING_DATE` or `NO_ROLE_PROFILE`.

**Bulk Response (`data`):**
```json
{ "bulk_request_id": "…", "template": { "id": "…", "name": "Standard 2026" }, "matched": 34,
  "assigned": [{ "user_id": "…", "name": "…", "assignment_id": "…", "outcome": "assigned", "types_added": [], "types_removed": ["SL"], "types_updated": ["EL"], "overrides_replaced": ["EL"] }],
  "skipped":  [{ "user_id": "…", "name": "…", "reason": "ALREADY_ON_TEMPLATE" }],
  "failed":   [{ "user_id": "…", "name": "…", "code": "NO_JOINING_DATE" }] }
```

### Business Rules:
- **Per person, not all-or-nothing.** Each person is assigned in their own transaction. A failure is reported for that person; everyone else still commits. The response is HTTP 200 even when some failed, so show "17 of 24 assigned" honestly.
- **Cap: 200 people per request.** Above it you get `400 BULK_LIMIT_EXCEEDED` with `details: { cap, matched }`, and the preview shows `over_cap: true`. A targeting query cannot be paged: narrow the selection, or split it with `included_users`.
- **Retry-safe.** Re-sending the same request returns people already done as `skipped`.

---

## 7. End an Assignment

**Endpoint:** `POST /api/v1/leaves/assignments/:id/end`
**Roles Required:** `hr`

### Request Body Fields (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `effective_to` | String | Yes | `YYYY-MM-DD`, today or later, not before the assignment started; inclusive |
| `reason` | String | No | ≤ 500 |

### Business Rules (for the confirmation copy):
- **Balances are left exactly as they are.** Nothing is credited back or taken away.
- Leave dated **after** `effective_to` can no longer be applied for. Submitting it returns `400 LEAVE_CONFIG_ENDED`, and the apply form stops offering those types after that date.
- Monthly accrual stops after the end date.
- `409 ASSIGNMENT_HAS_LEAVES_AFTER_END`: pending or approved leave runs past the end date. `details.request_ids` lists those requests; cancel or reject them first.
- `409 ASSIGNMENT_ALREADY_ENDED` · `400 EFFECTIVE_TO_IN_PAST` · `400 INVALID_DATE` · `404 ASSIGNMENT_NOT_FOUND`.

**Delete is not available** for an assignment that has started. End it, or assign the correct policy. Deleting a not-yet-started assignment arrives with future-dated scheduling.

---

## 8. Customise and Revert one Leave Type

- **Customise** (`PUT /api/v1/leaves/users/:userId/configs/:leaveTypeId`, unchanged contract): the response now includes `overridden_fields`.
- **Revert to the policy default:** `DELETE /api/v1/leaves/users/:userId/configs/:leaveTypeId` (`hr`). It restores `policy_default` and adjusts the balance the same way the PUT does.

**Revert outcomes:**
- **`200`, `outcome: "reverted"`:** the policy values were restored.
- **`200`, `outcome: "unchanged"`:** the leave type had no overrides.
- **`409 NO_POLICY_DEFAULT`:** a legacy config, with no policy recorded.
- **`404 CONFIG_NOT_FOUND`:** no live config for that type.

---

## 9. Policies List and Delete (changed)

- `GET /api/v1/leaves/templates`: each template now carries **`assigned_user_count`**.
- `DELETE /api/v1/leaves/templates/:id`: **`409 TEMPLATE_IN_USE`** with `details: { assigned_user_count }` while anyone is on the policy. Suggested copy: "23 people are on this policy — move them first."

---

## Workflow 1: Finding and Fixing People with No Policy

### Step 1: See the gap (HR Action)
- **Action:** HR opens Leave Assignment; the tiles call `GET /assignments/summary` and show `unassigned: 8`.
- **The Phase 7 Magic:** `GET /assignments?coverage=none` lists exactly those eight people in one request.

### Step 2: Assign in bulk (HR Action)
- **Action:** HR selects Engineering + Full-time and picks "Standard 2026". The dialog calls `POST /assignments/preview`.
- **The Phase 7 Magic:** HR sees 34 matched: 8 unchanged, 24 changing (2 with custom rules that will be replaced), and 2 blocked for a missing joining date. HR confirms; the dialog sends the same body plus `preview_token` to `POST /assignments/bulk` and shows the outcome per person.

### Step 3: Clear the blocked ones (HR Action)
- **Action:** For each blocked person, HR fills the joining date with `PATCH /organizations/employees/:id/hr-fields` and re-runs the bulk request.
- **The Phase 7 Magic:** Everyone already done comes back as `skipped`; only the two remaining people are assigned.

---

## Workflow 2: A Leaver

### Step 1: End the policy (HR Action)
- **Action:** HR opens the leaver's row and chooses End with their last working day.
- **The Phase 7 Magic:** If leave is booked past that day, the API returns the request IDs to deal with first. Otherwise the assignment ends: balances are kept for the F&F settlement, no leave can be applied after the date, and monthly accrual stops.

---

## 🛑 Edge Cases & Data Integrity Guardrails

1. **Per-member advisory lock (`leaveassign:{org}:{user}`)**
   - Assign, bulk, customise, revert and end all serialise per person.
   - **Impact:** a double-click or a bulk run racing a single assign can no longer fail with a 500 or leave two policies open.

2. **No double credit when a leave type comes back**
   - Template A (with Earned Leave) → Template B (without it) → Template A again: the third assignment is diffed against the closed Earned Leave config.
   - **Impact:** the balance is not credited a second time.

3. **Template delete versus assign**
   - Assignment share-locks the template row; delete locks it for update and counts assignments under that lock.
   - **Impact:** a template can never be deleted from under an assignment in flight.

4. **IST business calendar**
   - All dates (effective_from, the balance year) come from Asia/Kolkata, the same clock as the accrual and rollover crons.
   - **Impact:** an assignment made at 00:30 IST on 1 January lands on the new year, not the old one.

5. **Membership role decides the profile**
   - Joining date and gender (which drives gender-restricted leave) are read from the profile of the member's actual role. A leftover profile in another role table, from an earlier invite under a different role, is ignored.

6. **Legacy members**
   - Backfilled rows have `template_id: null`. They count as `coverage: "legacy"`, never as "no policy", so the "No policy" tile only shows people who really have no leave configuration.
