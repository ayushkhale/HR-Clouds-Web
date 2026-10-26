# Implementation Plan: Frontend Requests of 2 Oct 2026

**Date:** 2026-10-02
**Status:** Implemented 2026-10-02, Phases 0–4 with the §4 recommendations as decided. Phase 5 is deferred. Migration 00066 is handed back unrun. Implementation record: `public/md_leave/md_phases/phase7_implementation_plan.md`. Frontend change record: `public/md_updates/2026-10-02_leave_assignment_ledger_and_gender_fixes.md`.
**Sources:**
- `public/md_updates/2026-10-02_frontend_requests_to_backend.md` (G-1, G-2, L-1)
- `public/md_updates/2026-10-02_leave_assignment_api_request.md` (§3.1–§3.7; supersedes L-1)

**Modules affected:** `leave` (most of the work), `organization` (G-1), `payroll` (G-2, test only)
**Migration:** `00066-create-leave-policy-assignments.js`. Number 00065 is reserved for billing. The user runs migrations; it is handed back unrun.

---

## 1. Summary

| Item | Verdict after reading the code | Action | Phase |
|---|---|---|---|
| **G-1** Invited employee's gender shows wrong | **Not reproducible from code for a normal invite.** The invite validator, controller, service and repository store `gender` on the role profile. The column has no default. #8 and #9 read the role-matched profile. **One latent path produces exactly this symptom** (§3, B-8/B-9). HR also has no way to correct gender. | Fix the latent path. Add an HR-only correction endpoint. Hand the user a read-only diagnostic query. Ask frontend for the affected `user_id`. | 0 |
| **G-2** `null` accepted for 5 nullable payroll keys? | **Confirmed.** All five accept `null`. `""` is still rejected, which is intended. | Add a test for the two day caps; no code change. | 0 |
| **L-1 / §3.1–3.7** Leave assignment APIs | **The request rests on a false premise.** The backend does not record which policy a person is on: templates are *copied* into per-user configs with no link back. The list, the "custom rules" flag, headcounts, ending and reverting all need a new assignment ledger (migration 00066). | Build the ledger, then the endpoints in the frontend's priority order. | 1–4 (5 deferred) |
| **Existing leave defects** found while reviewing | **11 defects** in the assignment engine. Two corrupt balances: an empty template wipes all of a person's leave, and assigning A → B → A credits the same leave twice. | Fix with tests, mostly before any new API ships. | 0–3 |

The leave module currently has **no unit tests** (`tests/unit/` has no `leave/` folder). Every phase below adds them.

---

## 2. Checking the frontend's claims

| # | Frontend claim | Verdict | Evidence |
|---|---|---|---|
| C-1 | `gender` (and `blood_group`, `dob`, `pan_number`, `uan_number`, `marital_status`, `personal_email`, address fields) may be missing from the invite whitelist | **False.** All are accepted. The doc is stale. | `organization/validators/invitation.validator.js:21-35`; passed through at `invitation.controller.js:10-37` |
| C-2 | Which table is `gender` written to? | The **role profile** (`employee_profiles` / `manager_profiles` / `hr_profiles`). `user_profiles` has no gender column. | `invitation.service.js:235-236, 242`, `organization.repository.js:275` (`upsertRoleProfile`) |
| C-3 | The role profile's `gender` column may have a default that wins | **False.** It is nullable with no default. | migration `00029-add-gender-to-profiles.js`; the three profile models |
| C-4 | #8 / #9 read path | Both read the **membership role's** profile, so for a single profile the value round-trips. | `employee_formatter.utils.js:12-16, 69`; `organization.service.js:893-901` |
| C-5 | Gender can't be corrected after the invite | **True.** The self and team PATCH whitelists exclude it, and no HR endpoint writes it. | `organization.service.js:33-34`; `employee.validator.js:20-37` |
| C-6 | G-2: `null` accepted for the 5 nullable keys | **True.** `""` is rejected by design. An empty body `{}` returns 400 (`.min(1)`), so "save with no changes" must not send a request. | `payroll_hr.validator.js:221,222,226,239,240`; columns nullable in `00048`; `payroll_settings.service.js` `_assertPayoutComponents` skips `null` |
| C-7 | "Everything asked for here is already in your database" | **False.** `employee_leave_configs` has no `template_id`, `assigned_by` or batch id. Nothing records who is on which policy, or who assigned it. | `leave/models/employee_leave_config.model.js`; `leave_assignment.service.js:161-172` copies values only |
| C-8 | Table `leave_policy_configs` | The table is `employee_leave_configs`. | model above |
| C-9 | L-1 precedent `GET /attendance/assignments` | The real route is `GET /attendance/hr/shifts/assignments`. It is **not paginated** (`findAll`). | `attendance/services/shift.service.js:213-240` |
| C-10 | "`NO_JOINING_DATE` — today this is a 500" | **False, and worse than a 500.** A missing `joining_date` is silently replaced by *today*. A long-tenured employee's first upfront assignment is then pro-rated from today instead of granting the full year. The balance is wrong and no error is raised. | `leave_assignment.service.js:120` |
| C-11 | Assignment is destructive, silent and returns nothing useful | **True.** The reply is `{ success, message }` with no `data`. | `leave_admin.controller.js:134-144` |
| C-12 | Deleting a template with people on it is quiet data loss | **Partly.** Configs are copies, so people keep their rules and balances. What is lost is the link to the template, which is not recorded anyway. A 409 is still right once the link exists. | `leave_admin.service.js:120-138` |
| C-13 | §4 Q1: is assigning the same template twice a no-op? | **No.** Every config is closed and recreated, per-person overrides are wiped back to template values, and accrued days move by the (template − override) difference. | `leave_assignment.service.js:136-187` |
| C-14 | §4 Q2: are taken days kept on a mid-year reassignment? | **Yes.** `total_used` is carried on the same-year row and never reset. Accrual is recomputed and floored at `total_used`. Caveat below the table. | `leave_assignment.service.js:151, 187, 199` |
| C-15 | Targeting example `target_employment_types: ["Full-time"]` | Must be canonical (`full_time`, `part_time`, `contract`, `intern`). `employment_type` exists **only on employee profiles**, so managers and HR never match a non-empty employment-type filter. | `invitation.validator.js:32`; `organization.repository.js:14` |
| C-16 | Auth for the new routes: `hr, admin, super-admin` | **New routes will be `hr` only.** `admin` and `super-admin` are platform roles with no org (`org_id IS NULL`), so they cannot carry tenant context. Existing leave routes keep their current lists; that is a separate change. | `organization/routes/role_planes.js` |
| C-17 | `getMyLeaveTypes` projects per-user config | **True**, for the caller only. | `leave_balance.service.js:21-45` |
| C-18 | Mirror shift assignments: no PUT, End and Delete | No PUT and End: yes. **Delete cannot be mirrored.** Shift delete hard-deletes any assignment, which is safe there because shifts have no ledger. A leave assignment has already written balances (D-4). | `shift.service.js:242-274` |

**C-14 caveat:** for an upfront type moving to another upfront type, the credit is the difference between the two annual quotas, pro-rated from **1 January** (or the joining date if the person joined this year), not from the day of the change. Upgrading 12 → 24 days in July therefore credits +12 days, not +6. This is deliberate in the engine: it makes repeated reassignments path-independent. The bulk preview must say so.

---

## 3. Defects in existing code (fix regardless of the new APIs)

| ID | Defect | Where | Impact | Fix | Phase |
|---|---|---|---|---|---|
| **B-1** | A template with **zero entitlements** closes *every* active config the person has, then reports success. | `leave_assignment.service.js:130-140` (`newLeaveTypeIds = []` makes every config an "orphan") | The person can no longer apply for any leave, silently. | Reject with `400 TEMPLATE_EMPTY` before any write. Also drop entitlements whose leave type is inactive or deleted; if none remain, return `TEMPLATE_EMPTY`. | 0 |
| **B-2** | **Double credit on A → B → A.** Template B lacks Earned Leave, so the EL config is closed but its balance row is kept (accrued 18). Re-assigning A finds no live EL config, takes the "first assignment" path and adds the pro-rata quota *on top of* the retained 18. | `leave_assignment.service.js:148` (`oldConfig` is only searched among live configs) | Free leave; reproducible by any HR. | When no live config exists for the type, load the latest config for (user, type) **closed in the current IST year** (`paranoid: false`) and pass it as `oldConfig`. | 0 |
| **B-3** | **A race on a first assignment returns a 500.** With no live configs, `SELECT … FOR UPDATE` locks nothing. Two concurrent assigns (for example a double-click) both insert, and the partial unique index `emp_leave_config_user_type_idx` rejects the second with `SequelizeUniqueConstraintError`. | `leave_assignment.service.js:107-134` | 500 on a double-click; the bulk endpoint would make this routine. | Take `pg_advisory_xact_lock(hashtext('leaveassign:{org}:{user}'))` first in every transaction that changes assignments (assign, override, revert, end, each bulk person). The precedent is `leave_application.service.js:207`. | 0 |
| **B-4** | The template and its entitlements are read **outside** the transaction. | `leave_assignment.service.js:125` (no `transaction`) | An entitlement edit or template delete can interleave with an assignment. | Read inside the transaction with `FOR SHARE` on the template row. Template delete takes `FOR UPDATE` (§6.12). | 0 |
| **B-5** | **Server clock versus IST.** The assignment code uses `new Date().getFullYear()` and `dayjs()`, but accrual and rollover use `Asia/Kolkata`. | `leave_assignment.service.js:28, 84, 121, 171, 191, 252, 258, 286` | On a UTC server, assignments between 00:00 and 05:30 IST get yesterday's `effective_from`. On 1 January they update the previous year's balance row. | Add an `istNow()` helper to `leave/utils/leave_automation.utils.js` (it already holds the shared accrual/rollover helpers) and use it in every touched path. | 0 |
| **B-6** | Re-assigning the same template silently wipes overrides (C-13). | as C-13 | HR loses per-person rules with no warning. | Needs the ledger: the same live template returns `outcome: "unchanged"` and writes nothing (D-7). | 1 |
| **B-7** | Assignment checks only that a role profile exists, **not the membership**. | `leave_assignment.service.js:112-118` | A deactivated member can be assigned a policy. | Require an active membership (`userRoleRepository.findActiveMembership`). No membership → `404 EMPLOYEE_NOT_FOUND`; inactive membership → `409 EMPLOYEE_INACTIVE`. | 0 |
| **B-8** | Role-profile resolution tries **employee → manager → hr** instead of using the membership's role. | `leave_assignment.service.js:112-114, 261-263`; `leave_application.service.js:24-26`; `common/utilities/profile.utils.js:15` | With a stale row in another role table (B-9), `joining_date` and **`gender`** are read from the wrong row: wrong pro-rata, and the wrong leave-eligibility decision. | Leave: resolve via the membership role (shared helper in `leave/utils`). `formatUserProfile` has no role available, so it keeps its order; B-9 stops new duplicates. | 0 |
| **B-9** | **Stale role-profile rows.** Re-inviting a non-member after expiry with a different role creates a second row in another role table. Revoke purges only the invited role (`purgeInvitationArtifacts(…, payload.role_key)`); expiry purges nothing. | `invitation.service.js:242`; `organization.repository.js:462-467` | One user has two role profiles with different gender and joining date. Attendance and leave embeds read the employee row first. **The most plausible cause of G-1.** | In `inviteUser`, delete the live (`deleted_at IS NULL`) rows in the *other two* role tables for (org, user) before the upsert. This code is only reached for non-members, because duplicate membership is rejected earlier. Soft-deleted history rows are left alone. | 0 |
| **B-10** | The joining-date fallback described in C-10. | `leave_assignment.service.js:120, 265` | Wrong balances, silently. | Block with `400 NO_JOINING_DATE` (D-8), shipped together with an HR way to fill the date in (§7). | 0 |
| **B-11** | The config lookups in `getMyLeaveTypes` and the leave application ignore effective dates. | `leave_balance.service.js:24`; `leave_application.service.js:238-241` | Harmless today, because every live row has `effective_to = NULL`. Wrong as soon as "End" exists. | Changed with End (§6.10). | 3 |

---

## 4. Decisions (recommendation given for each; sign-off needed)

| ID | Question | Recommendation | Why |
|---|---|---|---|
| **D-1** | How to record "who is on which policy"? | A new **assignment ledger table**, plus a link column on configs (§5). | A `template_id` column on each config row can't express "assigned at", "assigned by", "ended", "bulk batch", or a person with no configs. The ledger is also the audit trail the frontend asked for. |
| **D-2** | Roles for the new routes | `hr` only (C-16). | Role-plane rule. Existing leave routes are unchanged. |
| **D-3** | `effective_from` | Accept it, but **only equal to today (IST)** in this release. Otherwise `400 EFFECTIVE_DATE_NOT_SUPPORTED`. Future-dated scheduling is Phase 5. | The frontend accepts this sequencing (§3.4). Scheduling the main use case (1 January) interacts with year-end rollover (`leave_rollover.service.js:131-172`) and needs its own design. |
| **D-4** | `DELETE /leaves/assignments/:id` | Allowed **only for an assignment that has not started** (Phase 5). A started assignment cannot be deleted: **End it, or assign the correct policy.** | Balances are already written, and accrual or leave may have happened since. Reversing them honestly needs a pre-image plus "nothing happened since" checks. After B-2, re-assigning the correct policy gives the same upfront balance as assigning it in the first place, because quota differences telescope. So the safe route already exists. |
| **D-5** | What does End do to balances? | **Nothing.** Days already credited stay. Monthly accrual stops after `effective_to`. No new applications for dates after it. | Clawing back unearned upfront days touches F&F encashment and payroll and is a business decision. If wanted later, add it as an explicit option. |
| **D-6** | Bulk transaction model | **One transaction per person**, with explicit per-person outcomes. Synchronous, **cap 200** people per call. | All-or-nothing across hundreds of people means long-held balance locks against live applications and the accrual cron. At about 30 queries per person, 200 people takes roughly 15 s, comfortably under proxy timeouts. Retries are safe because of D-7. |
| **D-7** | Assigning the template a person is already on | **No-op**, `outcome: "unchanged"`, no writes, overrides kept. To drop overrides, use revert (§6.7). | Idempotent retries; fixes B-6. **This changes current behaviour**, so it goes in the change record. |
| **D-8** | Missing `joining_date` | Block: `400 NO_JOINING_DATE` (single assign); a `blocked` bucket in bulk. HR can fill a missing date once (§7). | A silent wrong balance is worse than an error. Without the fill-in route, blocking would be a dead end, because no endpoint can set `joining_date` after the invite today. |
| **D-9** | Revert target | The values **as assigned** (stored on the config at assignment time), not the template's current values. | Configs are copies. A later template edit does not move non-overridden people, so revert should land where their peers are. The inspector shows the template's current values separately, so drift is visible. |
| **D-10** | People assigned before the ledger existed | Backfill **one "legacy" ledger row per person who has live configs**, with `template_id = NULL`. Do not infer the template. | Inference from value sets is fragile: two templates can be identical, and overrides blur the match. The list shows them as "on a policy (untracked)", and re-assigning makes them tracked. |
| **D-11** | Unassigned people in the list | Include them in one list, with `coverage: "on_policy" \| "legacy" \| "none"`, filterable. | The frontend's stated preference. One count, no merging on the client. |
| **D-12** | Fields on the HR correction endpoint (G-1) | `gender`, `marital_status` (the two leave-eligibility demographics), and `joining_date` **only when currently empty**. | Gender is the ask. Marital status is the same class. Joining date unblocks D-8. Changing an existing joining date would move payroll proration and tenure, so it is out of scope. |
| **D-13** | Audit for the HR correction | A required `reason` plus a structured `[ORG_AUDIT]` log line, with old → new in the response. | The organization module has no audit table today; for example, department transfer writes its reason only to the mapping row. A durable org audit table is a follow-up for a separate decision. |

---

## 5. Data model: migration `00066-create-leave-policy-assignments.js`

### 5.1 New table `employee_leave_policy_assignments` (paranoid, underscored)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL, FK `organizations` | |
| `user_id` | UUID NOT NULL, FK `users` | |
| `template_id` | UUID NULL, FK `leave_policy_templates` | `NULL` = legacy backfill (D-10). Templates are soft-deleted, so the FK stays valid. |
| `template_name_snapshot` | VARCHAR(150) NULL | History stays readable after a rename or delete. |
| `effective_from` | DATE NOT NULL | IST business date |
| `effective_to` | DATE NULL | `CHECK (effective_to IS NULL OR effective_to >= effective_from)` |
| `activated_at` | TIMESTAMPTZ NULL | Set when the configs are written. Always set until Phase 5 adds scheduling; added now so Phase 5 needs no second migration. |
| `source` | ENUM(`assign`, `bulk`, `legacy_backfill`) NOT NULL | |
| `bulk_request_id` | UUID NULL | Groups one bulk call. |
| `assigned_by` | UUID NULL, FK `users` ON DELETE SET NULL | |
| `ended_by`, `ended_at`, `end_reason` | UUID NULL / TIMESTAMPTZ NULL / VARCHAR(500) NULL | |
| `created_at`, `updated_at`, `deleted_at` | timestamps | |

Indexes:
- `elpa_one_open_idx` UNIQUE `(org_id, user_id)` WHERE `deleted_at IS NULL AND activated_at IS NOT NULL AND effective_to IS NULL`. A backstop: at most one open assignment per person.
- `elpa_one_scheduled_idx` UNIQUE `(org_id, user_id)` WHERE `deleted_at IS NULL AND activated_at IS NULL`. Used from Phase 5.
- `elpa_org_template_idx` `(org_id, template_id)` WHERE `deleted_at IS NULL`. Used for headcounts and `TEMPLATE_IN_USE`.
- `elpa_org_user_from_idx` `(org_id, user_id, effective_from DESC)`. Used for history and the current-assignment lookup.

### 5.2 New columns on `employee_leave_configs`

| Column | Type | Notes |
|---|---|---|
| `assignment_id` | UUID NULL, FK `employee_leave_policy_assignments`, indexed | |
| `template_values` | JSONB NULL | The entitlement values as copied (`annual_quota`, `accrual_type`, `max_carry_forward`, `probation_restriction_days`, `max_negative_balance`, `notice_period_max_days`). `NULL` for legacy rows. |
| `overridden_fields` | TEXT[] NOT NULL DEFAULT `'{}'` | Computed at write time by assign (empty), override (diff against `template_values`) and revert (empty). Makes the "custom rules" count and filter a cheap indexed read. |

### 5.3 Backfill (inside `up()`, same transaction)

```sql
INSERT INTO employee_leave_policy_assignments
  (id, org_id, user_id, template_id, template_name_snapshot, effective_from, activated_at, source, created_at, updated_at)
SELECT gen_random_uuid(), org_id, user_id, NULL, NULL, MIN(effective_from), NOW(), 'legacy_backfill', NOW(), NOW()
  FROM employee_leave_configs WHERE deleted_at IS NULL GROUP BY org_id, user_id;

UPDATE employee_leave_configs c SET assignment_id = a.id
  FROM employee_leave_policy_assignments a
 WHERE c.deleted_at IS NULL AND a.source = 'legacy_backfill'
   AND a.org_id = c.org_id AND a.user_id = c.user_id;
```

### 5.4 Migration hazards
- **Deploy the migration before the code.** The model gains attributes that every `EmployeeLeaveConfig` select includes. Code that runs before the migration breaks every leave read and write.
- `down()` drops the table and the three columns, which **destroys the assignment history**. Write the same warning comment that 00051 carries.
- Model file: `leave/models/employee_leave_policy_assignment.model.js`. Associations: `belongsTo User` (as `user`, `assigner`), `belongsTo LeavePolicyTemplate` (as `template`), `hasMany EmployeeLeaveConfig` (as `configs`). Add `EmployeeLeaveConfig.belongsTo(assignment)`.

---

## 6. API specifications

**All new routes:** `authenticate`, `authorize(['hr'])`, `requireFeature('leave.access')`. They live in `leave_admin.routes.js` under a new `hrOnly` chain, so the existing `hrAuth` is unchanged.

**Route order:** register `/assignments/summary`, `/assignments/preview` and `/assignments/bulk` before `/assignments/:id/...`, and validate `:id` as a UUID.

**Errors:** existing classes (`AppError(status, msg, code, details)`, `NotFoundError`, `ConflictError` with `.details`).

### 6.1 `GET /api/v1/leaves/assignments`: coverage roster (§3.1) · Phase 1

**Query parameters:**

| Parameter | Type / values |
|---|---|
| `template_id` | UUID |
| `coverage` | `on_policy` \| `legacy` \| `none` |
| `has_overrides` | boolean |
| `department_id` | UUID |
| `role` | `employee` \| `manager` \| `hr` |
| `q` | string, ≤ 150 |
| `page` | ≥ 1 |
| `limit` | 1–100, default 20 |

Unknown keys are rejected. Validate with the Express 5-safe pattern (validate `req.query` into a local, do not reassign it).

**Response:**

```json
{ "success": true, "message": "Leave assignments fetched", "data": {
  "total": 150, "page": 1, "limit": 20,
  "rows": [{
    "user": { "user_id": "…", "name": "Asha Menon", "email": "…", "role": "employee",
              "employee_code": "E-104", "department": "Engineering", "designation": "Backend Dev",
              "avatar_url": null, "gender": "female" },
    "coverage": "on_policy",
    "assignment": {
      "id": "…", "template": { "id": "…", "name": "Standard 2026", "entitlement_count": 4 },
      "legacy": false, "effective_from": "2026-01-01", "effective_to": null, "state": "ongoing",
      "override_count": 0, "assigned_by": { "id": "…", "name": "Rahul Gupta" },
      "assigned_at": "2026-01-01T06:12:44.000Z"
    }
  }]
}}
```

**Row rules:**
- `user` is the flat #8 shape: the `toSlimView` fields.
- `assignment` is `null` when `coverage = "none"`.
- `state` is `ongoing` (today ≤ `effective_to`, or no end) or `ended`. `upcoming` arrives in Phase 5.

**Base set:** active memberships (`user_roles.is_active`) with role `employee`, `manager` or `hr`, `users.status = 'active'`. These are the same people #8 shows.

**Coverage:**
- `on_policy`: the current assignment has a `template_id`.
- `legacy`: the current assignment has `template_id IS NULL`.
- `none`: no current assignment.

The **current assignment** is the live row with `activated_at` set and `effective_from ≤ today ≤ coalesce(effective_to, ∞)`. Ties are broken by `effective_from DESC, created_at DESC`.

**Implementation:** a new repository method `findAssignmentRoster` using raw SQL with replacements (precedent: `document_recipient.service.js` `resolveAudience`):
- Base: `user_roles` ⨝ `roles` ⨝ `users`.
- The role-profile join is keyed on `roles.key`. **Never OR across the three profile tables**, because that is what B-9 corrupts.
- Current assignment and counts: `LEFT JOIN LATERAL`.
- Total: `COUNT(*) OVER()`.
- Order: `lower(name), user_id`.

Then hydrate the page:
- users: `organizationRepository.getEmployeesByOrgId(orgId, { userIds })` → `buildEmployeeRow` → slim projection → `avatarAssets.resolveRowAvatars`;
- `assigned_by` names: `invitationLedgerRepository.findProfileNames`.

That is three queries per page, with no N+1.

### 6.2 `GET /api/v1/leaves/assignments/summary` (§3.7) · Phase 4

`{ on_policy, legacy, unassigned, with_overrides, templates: [{ id, name, assigned_user_count }] }`. The base set is identical to §6.1, computed in one SQL statement with `COUNT(*) FILTER (…)`.

### 6.3 `GET /api/v1/leaves/users/:userId/leave-config`: effective configuration (§3.2) · Phase 1

```json
{ "user_id": "…",
  "assignment": { "id": "…", "template": { "id": "…", "name": "Standard 2026" }, "legacy": false,
                  "effective_from": "2026-01-01", "effective_to": null, "state": "ongoing",
                  "assigned_by": { "id": "…", "name": "…" }, "assigned_at": "…" },
  "types": [{
    "leave_type_id": "…", "leave_type": { "name": "Earned Leave", "code": "EL", "is_active": true },
    "config_id": "…", "effective_from": "2026-07-14",
    "effective": { "assigned_annual_quota": 24, "accrual_type": "upfront", "max_carry_forward": 5,
                   "probation_restriction_days": 90, "max_negative_balance": 0, "notice_period_max_days": null },
    "policy_default": { "annual_quota": 18, "accrual_type": "upfront", "max_carry_forward": 5,
                        "probation_restriction_days": 90, "max_negative_balance": 0, "notice_period_max_days": null },
    "template_current": { "annual_quota": 20, "...": "…" },
    "is_overridden": true, "overridden_fields": ["assigned_annual_quota"]
  }]
}
```

**Field meanings:**
- `policy_default`: the values as assigned (`template_values`).
- `template_current`: the template's live entitlement. It is `null` if the entitlement or template was removed since.
- For **legacy** configs, `policy_default`, `template_current`, `is_overridden` and `overridden_fields` are all `null`. The UI says "assigned before tracking; re-assign to compare".

**Edge cases:**
- Numbers are returned as numbers (the configs are DECIMAL; parse them).
- The user must be a member of the org, active or not, so HR can inspect a leaver. Otherwise `404 EMPLOYEE_NOT_FOUND`.
- No live configs → `assignment: null, types: []`.

### 6.4 `GET /api/v1/leaves/users/:userId/assignments`: history · Phase 1

The member's assignments, newest first, at most 100, ended ones included. The row shape is the same as §6.1's `assignment`. This replaces the frontend's proposed `?user_id=` "history" filter: a roster row and a history row are different things, and mixing them in one list breaks `total` and the paging.

### 6.5 `POST /api/v1/leaves/users/:userId/assign-policy` (changed) · Phase 0 fixes, Phase 1 ledger

- **Body:** `{ "template_id": "uuid", "effective_from": "YYYY-MM-DD" }`. `effective_from` is optional; if sent, it must equal today (IST) (D-3).
- **Response (additive):** the existing `success` and `message`, plus `data: { assignment_id, outcome: "assigned" | "unchanged", types_added: [codes], types_removed: [codes], types_updated: [codes], overrides_replaced: [codes] }`.

**Errors:**

| HTTP | Code |
|---|---|
| 404 | `EMPLOYEE_NOT_FOUND` |
| 409 | `EMPLOYEE_INACTIVE` |
| 404 | `TEMPLATE_NOT_FOUND` |
| 400 | `TEMPLATE_EMPTY` |
| 400 | `NO_JOINING_DATE` |
| 400 | `EFFECTIVE_DATE_NOT_SUPPORTED` |

**Flow (one transaction):**
1. Take the advisory lock (B-3).
2. Check the active membership (B-7) and resolve the role profile via the membership role (B-8).
3. Require a joining date (B-10).
4. Load the template with `FOR SHARE` (B-4), filter out inactive types, and reject if empty (B-1).
5. If the same template is current → `unchanged` (D-7).
6. Otherwise:
   - close the current ledger row (`effective_to = max(yesterday, its effective_from)`, mirroring `_closeOutConfig`);
   - insert the new ledger row;
   - close and copy the configs with `assignment_id`, `template_values` and `overridden_fields = '{}'`;
   - run the engine with the B-2 lookup.

**Refactor:** extract `_assignInTransaction(t, { orgId, userId, template, actorId, source, bulkRequestId, today })`, which returns the outcome. The single and bulk routes both call it. The controller passes `req.user.id` as the actor.

### 6.6 `PUT /api/v1/leaves/users/:userId/configs/:leaveTypeId` (changed) · Phase 1

Takes the advisory lock. The new config row carries `assignment_id` and `template_values` forward, and `overridden_fields` is the diff against `template_values` (empty for legacy rows). The response adds `overridden_fields`. The request contract is unchanged.

### 6.7 `DELETE /api/v1/leaves/users/:userId/configs/:leaveTypeId`: revert to the policy default (§3.5) · Phase 4

The PUT path with `template_values` as the new values and `overridden_fields = '{}'`; the balance is recalculated by the same engine. Outcomes:

| Situation | Result |
|---|---|
| No live config | `404 CONFIG_NOT_FOUND` |
| Legacy row | `409 NO_POLICY_DEFAULT` |
| Already not overridden | `200` with `outcome: "unchanged"` (idempotent) |

### 6.8 `POST /api/v1/leaves/assignments/preview` (§3.3) · Phase 2

**Body:**

```json
{ "template_id": "uuid", "effective_from": "YYYY-MM-DD",
  "target_departments": [], "target_locations": [], "target_employment_types": [],
  "target_job_statuses": [], "included_users": [], "excluded_users": [], "scope": "selection" }
```

**Validation:**
- `target_employment_types` must be canonical values (C-15); `target_job_statuses` must be the canonical job-status list.
- The UUID arrays are capped at 500 each.
- Unknown department or location IDs → `400 INVALID_TARGETING` (mirrors `document_org.service.js:94-99`).
- **Safety:** if every targeting array is empty, require `"scope": "all"`. Otherwise `400 TARGETING_REQUIRED`, so an empty form can never assign the whole org.

**Resolution:**
- Same base set as §6.1, using the role-matched profile.
- Each person is checked with `matchesCriteria` and `normaliseCriteria`, **imported** from `document/utils/document_targeting.utils.js` (pure, no DB, same precedence as holidays and weekly-offs). Do not copy them.
- Note: `resolveAudience` there reads `employee_profiles` only, so it is **not reusable** (leave covers managers and HR).

**Response:**

```json
{ "matched": 34, "cap": 200, "over_cap": false, "preview_token": "sha256…",
  "unchanged": [{ "user_id": "…", "name": "…", "reason": "ALREADY_ON_TEMPLATE" }],
  "changing":  [{ "user_id": "…", "name": "…", "from_template": "Standard 2025", "legacy": false,
                  "types_added": ["ML"], "types_removed": ["SL"], "overrides_replaced": ["EL"] }],
  "blocked":   [{ "user_id": "…", "name": "…", "reason": "NO_JOINING_DATE" }] }
```

- A person with no policy appears in `changing` with `from_template: null`.
- `types_removed` matters: those types stop being applicable, although their balance rows are kept.
- `preview_token` is the SHA-256 of: the template ID, a hash of the template's entitlements, and the sorted list of (user_id, current assignment ID).

### 6.9 `POST /api/v1/leaves/assignments/bulk` (§3.3) · Phase 2

**Body:** the same as preview, plus an optional `preview_token`.

**Request-level errors:**
- `400 BULK_LIMIT_EXCEEDED` with `details: { cap: 200, matched }`;
- `409 PREVIEW_STALE` when the token no longer matches;
- `400 TEMPLATE_EMPTY`;
- the validation errors from §6.8.

**Per person:** its own transaction plus the advisory lock, via `_assignInTransaction` with `source = 'bulk'` and a shared `bulk_request_id`.

**Response:** `200 { bulk_request_id, assigned: [...], skipped: [...], failed: [{ user_id, name, code }] }`. A partial failure is a 200, reported honestly per person. Answer to the frontend: **per-person, not all-or-nothing** (D-6).

**Retry:** people already done come back as `skipped` (`ALREADY_ON_TEMPLATE`).

### 6.10 `POST /api/v1/leaves/assignments/:id/end` (§3.4) · Phase 3

**Body:** `{ "effective_to": "YYYY-MM-DD", "reason": "≤500 chars, optional" }`.

**Errors:**

| HTTP | Code | When |
|---|---|---|
| 404 | `ASSIGNMENT_NOT_FOUND` | unknown assignment |
| 409 | `ASSIGNMENT_ALREADY_ENDED` | `effective_to` already set |
| 400 | `EFFECTIVE_TO_IN_PAST` | before today (IST); past accrual and approvals can't be undone |
| 400 | `INVALID_DATE` | before `effective_from` |
| 409 | `ASSIGNMENT_HAS_LEAVES_AFTER_END` | `pending`, `approved` or `cancellation_pending` requests end after `effective_to`; `details.request_ids` lists them |

**Effect:** in one transaction with the advisory lock:
1. Set `effective_to`, `ended_by`, `ended_at` and `end_reason` on the assignment.
2. Set `effective_to` on the assignment's live configs.
3. Leave **balances untouched** (D-5).

**Reader changes that ship with this route (B-11):**
- **Leave application** (`leave_application.service.js:238`): the config must cover the request (`effective_to IS NULL OR effective_to >= end_date`). Otherwise `400 LEAVE_CONFIG_ENDED`.
- **`getMyLeaveTypes`:** keep configs where `effective_to` is null or ≥ today.
- **`findActiveConfig` and `findAllActiveConfigs`:** drop the `effective_to: null` predicate, so a "live row" means not soft-deleted. The unique index guarantees one per type. Without this change, re-assigning someone whose assignment is ending would miss their configs and hit the unique index. It is behaviour-preserving today, because every live row has `effective_to = NULL`.
- **Accrual and rollover:** already date-aware (`findActiveConfigsByOrg`); no change.

### 6.11 `GET /api/v1/leaves/templates` (changed) (§3.6) · Phase 1

Each row gains `assigned_user_count`: the people whose current assignment is this template. It comes from one `GROUP BY` query merged into the list, with no N+1.

### 6.12 `DELETE /api/v1/leaves/templates/:id` (changed) (§3.6) · Phase 1

**Flow:** lock the template row `FOR UPDATE`, then count the live assignments that are ongoing (and scheduled, from Phase 5).

**Result:** if any exist, return `409 TEMPLATE_IN_USE` with `details: { assigned_user_count }`.

**What does not block:** ended assignments. History keeps working through `template_name_snapshot`.

### 6.13 Deferred to Phase 5 (its own plan)

Future-dated `effective_from` (`upcoming` state), the daily activation job, and `DELETE /leaves/assignments/:id` for assignments that have not started (D-4).

**The blocker:** activation on 1 January must run **after** the year-end rollover. A new-year row seeded early is re-based by `_rolloverOneConfig`'s E2 path.

**Until then:** the frontend hides Delete and the date picker shows today only.

---

## 7. Organization: G-1 work · Phase 0

1. **Regression test** (`tests/unit/organization/`).
   - An invite with `gender: "male"` for each role reaches `upsertRoleProfile` as `male`.
   - `buildEmployeeRow` and `formatEmployeeResponse` return `male` when the *other* role table holds a stale `female` row.
2. **B-9 fix** in `invitation.service.js`, plus a new repository method `removeOtherRoleProfiles(orgId, userId, keepRoleKey, t)` (live rows only).
3. **B-8 fix** for leave eligibility and assignment (shared membership-role resolver in `leave/utils`).
4. **New endpoint** `PATCH /api/v1/organizations/employees/:id/hr-fields`, `authorize(HR_ONLY)`.
   - **Body:** `{ gender?: "male"|"female"|"other"|"prefer_not_to_say"|null, marital_status?: string≤50|null, joining_date?: "YYYY-MM-DD", reason: string 3–500 (required) }`, with at least one field besides `reason`. `gender` values match the DB enum and the leave `allowed_genders` vocabulary.
   - **Writes:** the membership role's profile, through the existing `updateRoleProfileFields`.

   **Rules:**
   - **Not on yourself:** `400 SELF_EDIT_NOT_ALLOWED`. This stops HR granting themselves gender-gated leave; it mirrors `updateTeamMemberProfile`.
   - **Unknown member:** `404 EMPLOYEE_NOT_FOUND`.
   - **Joining date already set:** `409 JOINING_DATE_ALREADY_SET`.
   - **Effect on leave:** future leave applications use the new value; pending requests are **not** re-validated (documented).

   **Response:** `getEmployeeById`, plus `changes: { field: { from, to } }`.

   **Audit:** the D-13 structured log line.
5. **Diagnostic query for the user to run.** It is read-only and I do not run it. It lists members with more than one live role profile:
   ```sql
   SELECT ur.org_id, ur.user_id, r.key AS membership_role,
          ep.gender AS emp_gender, mp.gender AS mgr_gender, hp.gender AS hr_gender
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     LEFT JOIN employee_profiles ep ON ep.user_id = ur.user_id AND ep.org_id = ur.org_id AND ep.deleted_at IS NULL
     LEFT JOIN manager_profiles  mp ON mp.user_id = ur.user_id AND mp.org_id = ur.org_id AND mp.deleted_at IS NULL
     LEFT JOIN hr_profiles       hp ON hp.user_id = ur.user_id AND hp.org_id = ur.org_id AND hp.deleted_at IS NULL
    WHERE (ep.id IS NOT NULL)::int + (mp.id IS NOT NULL)::int + (hp.id IS NOT NULL)::int > 1;
   ```
   Cleaning up existing duplicates is a data fix for the user to decide on, not part of this code change.
6. **Ask the frontend** for the affected `user_id`, and the screen or endpoint where "female" appeared. If the query above returns nothing for that user, G-1 stays open with this evidence.

## 8. Payroll: G-2 · Phase 0

Add one test to `tests/unit/payroll/payroll_settings_schema.test.js`:
- `fnf_encashment_max_days: null` and `compoff_encashment_max_days_per_fy: null` validate to `null`;
- `""` is rejected for both.

The three component IDs are already covered (the "accept null" test). No code change.

---

## 9. Phases and order

Each phase ends with `node --test "tests/unit/leave/**/*.test.js"` (plus the module's own tests) and then a full `npm test`, all green.

| Phase | Contents | Main files | Verify |
|---|---|---|---|
| **0**: no migration | B-1, B-2, B-3, B-4, B-5, B-7, B-8, B-9, B-10 · §7 (G-1) · §8 (G-2) | `leave_assignment.service.js`, `leave_application.service.js`, `leave/utils/leave_automation.utils.js` (+ a membership-role resolver), `invitation.service.js`, `organization.repository.js`, `employee.routes.js`, `employee.validator.js`, `organization.service.js` | Tests below; pure engine tests for A → B → A, empty template, IST boundary |
| **1**: ledger + P1 | Migration 00066 + model · §6.1, §6.3, §6.4 · §6.5/§6.6 write the ledger · B-6 · §6.11, §6.12 | new model + repository (`employee_leave_policy_assignment.repository.js`), `leave_admin.routes.js`, `leave_admin.controller.js`, `leave_admin.service.js`, new validator schemas | Roster SQL builder and shaping tests (stubbed repository); `hr`-only route tests; migration verified statically (§11) |
| **2**: bulk | §6.8, §6.9 | `leave_assignment.service.js` (`previewBulk`, `assignBulk`), validator | Bucket classification, token staleness, cap, per-person failure isolation, retry idempotency |
| **3**: end | §6.10 + B-11 reader changes · D-3 `effective_from` validation | `leave_assignment.service.js`, `employee_leave_config.repository.js`, `leave_application.service.js`, `leave_balance.service.js` | Ended-config application rejection; reassign after end; leaves-after-end 409 |
| **4**: P3 | §6.7 revert · §6.2 summary | as above | Revert outcomes; summary counts equal the roster filters |
| **5**: deferred | §6.13, separate plan | | |

The **documentation** (§10) is updated **inside each phase**, for the endpoints that phase ships, not batched at the end.

---

## 10. Documentation to update (follow each file's existing structure)

| File | Change | Structure to follow |
|---|---|---|
| `public/md_leave/combined_api_analysis.md` | Title "(Phases 1, 2, 3, 5)" becomes "(Phases 1, 2, 3, 5, 7)". New part `# Phase 7 APIs (Assignment Ledger, Bulk Assignment & Coverage)` with §23 onwards, one per new endpoint. Edit §6, §8, §11 and §12 in place for the changed contracts and errors. | The existing bullet template per section: *API name / purpose · HTTP method · Endpoint / route · Authentication / authorization requirements · Request JSON Payload · Request Fields · Detailed API Function · Error handling · What This API Gives/Does* |
| `public/md_leave/md_phases/phase7_api_analysis.md` (new) | Frontend integration guide for Phase 7 | Mirror `phase6_api_analysis.md`: numbered `## n.` endpoint sections with `### New Request Body Fields` / `### New Error Scenarios & Business Rules`, then `## Workflow n` with `### Step n`, then `## 🛑 Edge Cases & Data Integrity Guardrails` |
| `public/md_leave/md_phases/phase7_implementation_plan.md` (new) | Lifted from this plan's leave parts once signed off | Mirror `phase6_implementation_plan.md` |
| `public/md_leave/development_phases.md` | Add `## Phase 7: …` | Existing `## Phase n` → `### n.x` → `### Phase n Verification` |
| `public/md_leave/md_rag/leave_policy_assignment_qa.md` | Q&A for: same-template no-op, End semantics, revert, coverage states, `NO_JOINING_DATE` | Existing Q&A format in that file |
| `public/md_system/api_registry.md` | New section `## Leave Module - Policy Assignment Ledger & Coverage (Phase 7)` with `_Requires Feature Flag: \`leave.access\`_`, the same 13-column table, rows numbered from 1. Update rows in place: Foundation #6 and #8, Policy Assignment #1 and #2. Organization Module: add a `hr-fields` row. | The existing section header + flag line + 13-column table |
| `public/md_organization/4_org_employee_api.md` | New `## 10. Update HR-Owned Employee Fields` (§6–§9 were taken) | That file's per-endpoint headings (Business Purpose · Endpoint Contract · Complete Internal Execution Flow · Internal Working · Database Operations · Response Structure) |
| `public/md_organization/2_org_invitation_api.md` §1 | List every accepted field, including `gender` and its "set at invite, corrected by HR via hr-fields" rule (C-1: doc is stale) | Existing §1 layout |
| `public/md_updates/<date>_leave_assignment_ledger_and_gender_fixes.md` (new, per phase) | Frontend change record: new contracts, §12 answers, behaviour changes (`TEMPLATE_EMPTY`, `NO_JOINING_DATE`, same-template no-op, `TEMPLATE_IN_USE`, `hr`-only new routes) | Dated record like the other `md_updates` files |
| `public/md_settings/org_settings_registry.md` | **No change.** No new org-configurable setting is introduced. D-5 and D-6 are fixed rules, not settings. | — |

---

## 11. Deploy and ops (handed back)

- **Migration 00066:** the user runs it; it is never run from here. Verify it statically:
  - `require()` it and check that `up` and `down` exist;
  - check that the model attributes match the migration columns (precedent: the "columns mirror migration" test in `payroll_settings_schema.test.js`);
  - unit tests.
- **Order:** migration first, then code from Phase 1 onwards (§5.4). Phase 0 needs no migration and can ship on its own.
- **Backfill:** runs inside `up()`. Expected row count = distinct (org, user) pairs with live configs.
- **Diagnostic SQL for G-1** (§7.5): the user runs it.

---

## 12. Answers for the frontend (goes into the change record)

1. **G-1:** `gender` is accepted on invite, stored on the role profile with no default, and returned by #8 and #9 from that same row. We found one path that produces the symptom: a re-invite under a different role leaves a stale second profile. It is being fixed. **Please send the affected user's `user_id`.** HR will be able to correct gender, marital status, and a missing joining date via `PATCH /organizations/employees/:id/hr-fields` (HR only, reason required, not on yourself).
2. **G-2:** `null` is accepted for all five keys. `""` is rejected, and so is an empty `{}` body.
3. **Unassigned people:** included in `GET /leaves/assignments` with `coverage: "none"`; filter with `?coverage=none`. People assigned before the ledger show `coverage: "legacy"` until re-assigned.
4. **History:** `GET /leaves/users/:userId/assignments` instead of `?user_id=`.
5. **Bulk:** per-person transactions with explicit outcomes. Cap **200** per call. Narrow the selection, or split it with `included_users`; a targeting query can't be paged. Pass the preview's `preview_token` to get `409 PREVIEW_STALE` if anything changed in between.
6. **Same template twice:** no-op from this release (`outcome: "unchanged"`). Before this release it wiped overrides.
7. **Mid-year re-assignment:** taken days are never reset. For upfront → upfront, the credit is the quota difference pro-rated from 1 January (or the joining date), not from the change date. Types the new policy lacks stop being applicable, but their balances are kept.
8. **End:** balances are left as they are. There are no new applications for dates after `effective_to`, and monthly accrual stops. You can't end an assignment while leave requests run past the end date (`409`, with their IDs).
9. **Delete:** not available for an assignment that has started. Use End, or assign the right policy. Delete arrives with future-dated scheduling (Phase 5). Until then, `effective_from` accepts today only.
10. **Roles:** the new endpoints are `hr` only.
11. **Error codes:**
    - We keep yours: `TEMPLATE_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `TEMPLATE_EMPTY`, `TEMPLATE_IN_USE`, `ASSIGNMENT_NOT_FOUND`, `ASSIGNMENT_ALREADY_ENDED`, `NO_JOINING_DATE`, `BULK_LIMIT_EXCEEDED`.
    - We add: `EMPLOYEE_INACTIVE`, `EFFECTIVE_DATE_NOT_SUPPORTED`, `EFFECTIVE_TO_IN_PAST`, `INVALID_DATE`, `ASSIGNMENT_HAS_LEAVES_AFTER_END`, `LEAVE_CONFIG_ENDED`, `PREVIEW_STALE`, `INVALID_TARGETING`, `TARGETING_REQUIRED`, `NO_POLICY_DEFAULT`, `CONFIG_NOT_FOUND` (existing), `SELF_EDIT_NOT_ALLOWED`, `JOINING_DATE_ALREADY_SET`.
    - We drop `EFFECTIVE_DATE_BEFORE_JOINING`: with today-only dates, a future joiner is pro-rated from their joining date, so blocking them would be wrong.
12. **Targeting values** must be canonical (`full_time`, not `Full-time`). Employment type matches employees only.

---

## 13. Risks and open points

- **B-2 fix scope:** "closed in the current IST year" must use the same year as the balance row being updated. Test it across 31 Dec / 1 Jan.
- **Monthly over-credit from B-2:** months already over-credited for monthly types stay; the accrual cron floors at 0. Not reversed retroactively; noted, not fixed.
- **Bulk duration:** the cap of 200 is an estimate (about 30 queries per person). Measure it on the dev database once implemented and adjust the constant.
- **Existing duplicate role profiles (B-9):** cleaning these up is a data decision for the user after the §7.5 query.
- **Durable org audit table:** follow-up (D-13).
- **Existing leave routes** still allow `admin` and `super-admin`. Harmonising them is a separate reviewed change (role-plane note).
