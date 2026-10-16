# Employee Deactivation: Which APIs May Return a Deactivated Member, and the Leaks That Were Fixed

**Document Version:** 2.0.0 (supersedes the v1.0.0 proposal of the same date)
**Date:** 2026-10-03
**Status:** ✅ Implemented — full suite 2727 pass / 0 fail (2713 before; +14 regression tests)
**Modules touched:** `auth`, `attendance`, `payroll`, `document`
**Migration required:** none. **New dependency:** none. **New setting:** none.

---

## 1. The contract

`PATCH /api/v1/organizations/employees/:id/status { "is_active": false }` writes **one** thing:

```js
await userRole.update({ is_active: false }, { transaction })
```

It deliberately does **not**:

| Not changed | Why |
|---|---|
| `users.status` (stays `'active'`) | One user can hold memberships in several orgs. The global account is not what the tenant switched off. |
| `employee_profiles.deleted_at` (stays `NULL`) | Deactivation is a **reversible suspension**, not a departure. |
| Leave requests | Unwinding them would destroy balances on a temporary suspension. |

It *does* rewire the hierarchy: direct reports are re-pointed at an active manager, the member's own upward mapping is deactivated, and any department headships are vacated.

**The consequence that caused every bug below:** `user_roles.is_active` is the *only* place the tenant's answer lives. Any query that asks "who is on staff?" by reading `users.status = 'active'`, or by joining `user_roles` without asserting `is_active`, silently counts members the org has switched off — people who **cannot authenticate** and therefore can never act on anything assigned to them.

---

## 2. The only endpoints that may return a deactivated member

### A — Explicit HR lookups
- `GET /organizations/employees?include_inactive=true` — the only directory query that admits them, behind an explicit toggle.
- `GET /organizations/employees/:id` — single-entity inspection.

### B — Separation, exit and F&F
- `GET /payroll/hr/exits`, `/exits/:id`, `/exits/:id/settlement-preview`, `/exits/:id/settlement-statement/pdf`
- `GET /documents/hr/employees/:userId/exit-pack`, `/archivable-count`

### C — Historical records and immutable audits
- `GET /payroll/hr/runs/:runId/items`, `.../items/:itemId`
- `GET /payroll/hr/reports/*` (payroll-register, department-distribution, deduction-summary, components)
- `GET /payroll/hr/employees/:userId/payslips`, `.../:runId/pdf`, `.../salary-structures`
- `GET /attendance/hr/employees/:userId/attendance`, `.../summary`, `.../daily-log` — **and the manager/HR equivalents**
- **`GET /attendance/hr/{employees,managers,hrs}/attendance` when a date RANGE is supplied** — see §4.2
- `GET /leaves/users/:userId/assignments`, `.../balances`
- `GET /documents/hr/audit`

### D — Ex-employee self-service (statutory)
- `GET /payroll/me/tax/form16/:financialYear/pdf`, `/payroll/me/annual-statement/pdf`, `/payroll/me/payslips`, `.../:runId/pdf`

Everything else must exclude them.

---

## 3. Verified already correct — no change made

- `GET /organizations/employees` (defaults `is_active = true`), `/organizations/directory`, `/organizations/hierarchy` (both hardcode `includeInactive: false`).
- `GET /leaves/assignments`, `.../summary` — the base SQL already requires `ur.org_id = :orgId AND ur.is_active = true AND ur.deleted_at IS NULL`.
- Monthly payroll run population — `payroll_attendance_aggregator._loadPopulation` already filters `is_active: true`.
- **Manager-scoped reads** — `hierarchy_access.getAccessibleUserIds` resolves from `user_reporting_mappings` where `is_active = true`, and deactivation deactivates the member's upward mapping. A manager never saw a deactivated report. Only the HR/admin *fallback* leaked (§4.2).
- `document_notification._resolveRecipients` role branch already joins `ur.is_active = true`.

---

## 4. What was fixed

### 4.1 `auth` — the two shared readers everything else is built on

| File | Change |
|---|---|
| `user_role.repository.js` | `findEmployeeIds` / `findManagerIds` / `findHrIds` take a third argument `{ activeOnly = true }`. **Default is active-only**, so a new caller that forgets the flag is safe. |
| `user.repository.js` | `findAllActiveUsers` and `findListViaUsers` now join `user_roles` with `is_active: true`. `users.status` alone was never the tenant's answer. |

### 4.2 `attendance` — roster vs. historical register

**This is where the v1.0.0 proposal was wrong**, in two ways. Both are now handled:

**(a) A blanket filter would have 404'd departed managers.** `findManagerIds` / `findHrIds` are not only rosters — they are also the role-type gates in `_verifyUserIsManager` / `_verifyUserIsHr`, which guard the *per-member history* endpoints. Those gates now pass `{ activeOnly: false }`: they answer "is this member a manager?", not "can they act today", and Category C requires a departed manager's tenure to stay auditable.

**(b) A blanket filter would have erased real attendance.** The list endpoints have two internal paths:

| Path | Taken when | Behaviour | Deactivated members |
|---|---|---|---|
| Roster (`_getAttendanceListViaUsers`) | **today or later**, single day, no status filter or `not_marked` requested | left-joins attendance onto the member list and **synthesises** a row for anyone without one | **excluded** — they were the phantom `not_marked`/`absent` rows |
| Records / history | a date range, a **past** single day, or a status only a real record can have | returns rows that **already exist** | **still resolved** |

The past-date rule matters: there is no audit of *when* `is_active` flipped, so today is the only roster that can be answered exactly. For an earlier single date a member deactivated since may hold a **real** record, and filtering them out would erase it from the single-day view while the range view still showed it. The decision lives in one place, `_isRosterRead(filters)`.

If the records path were filtered, an employee deactivated on 20 September would lose their real 1–19 September punches from the September register HR reconciles payroll against. Filtering it is a worse bug than the leak. The two paths now resolve their member list independently via a single hoisted `isRosterMode` flag.

**Affected endpoints** (response *contents* change; no contract change):

| # | Endpoint | Change |
|---|---|---|
| 51 / 55 / 47 | `GET /attendance/hr/{employees,managers,hrs}/attendance` | deactivated members gone **in roster mode only**; date-range queries unchanged |
| 59 | `GET /attendance/hr/dashboard/live` | `total_employees`, `attendance_percentage`, `counts.not_marked` all corrected |
| 60 | `GET /attendance/hr/dashboard/graph-data` | denominator corrected |
| 61 | `GET /attendance/hr/dashboard/department-summary` | per-department totals corrected |
| 62 | `GET /attendance/hr/dashboard/top-defaulters` | deactivated members no longer top the list with zero attendance |
| 63 | `GET /attendance/hr/dashboard/work-mode-distribution` | corrected |
| 1 / 14 / 18 | `GET /attendance/manager/team/{today,summary,graph-data}` | **only when viewed by HR/admin** (the `allowedUserIds === null` fallback). A manager's own view was already correct. |

### 4.3 `document` — one predicate, seven hand-written copies

The v1.0.0 proposal flagged **one** query. There were **seven**, each asking "is this an active employee of this org?" with `u.status = 'active'` and no membership check — and the comments on four of them already claimed they mirrored each other.

They are now one shared fragment, `ACTIVE_MEMBER_JOIN_SQL` in `document_defaults.js`:

```sql
JOIN user_roles ur ON ur.user_id = p.user_id AND ur.org_id = p.org_id
                  AND ur.is_active = true AND ur.deleted_at IS NULL
```

Inner-joining is safe: `user_roles_org_user_unique_idx` is UNIQUE on `(org_id, user_id) WHERE deleted_at IS NULL`, so it cannot multiply a row or corrupt a paged `count`.

| Call site | Frontend-visible effect |
|---|---|
| `document_request.isActiveEmployee` | **#80 / #93** `POST .../employees/:userId/document-requests` → `404 USER_NOT_FOUND` for a deactivated subject (was: a request nobody could fulfil, counted as overdue forever) |
| `document_request.filterActiveEmployees` | **#240 / #241** bulk → the pair lands in `skipped[]` with the existing reason `user_not_found`. Still `201`. |
| `document_checklist._loadProfile` | **#86 / #96 / #98** checklist → `404 USER_NOT_FOUND`; **#81** bulk-from-checklist likewise |
| `document_recipient.resolveAudience` | **#47 / #60 / #127** publish, recipient sync and materialisation no longer create recipient rows for deactivated members |
| `document_recipient.topUpForUser` | the daily top-up no longer adds rows for them |
| `document_org._validateTargeting` (`included_users` only) | **#43 / #44** create/update an org document → `422 TARGET_USER_UNKNOWN` if **`included_users`** names a deactivated member. `excluded_users` is deliberately *not* gated — see below. |
| `employee_document.findActiveRosterPage` | **#115 / #116** `GET /documents/hr/reports/missing-mandatory(.csv)` → compliance % now reflects current staff only |

#### Deliberately NOT changed — and this matters

- **`document_offboarding._isActiveMember`.** Returning `false` there is what fires `membership_removed` and **archives the employee's documents**. Deactivation is a reversible suspension, so adding the membership join would archive a suspended employee's documents, and reactivation does not undo archival. It asks a different question — "has this person *left*?" — and now says so in its docstring. A regression test asserts this exemption still exists.
- **`document_notification._resolveRecipients` (user branch).** A departing or suspended member must still receive "please return your documents" mail.
- **`_validateTargeting`'s `excluded_users` list.** `included_users` *targets* someone, so they must be able to act. `excluded_users` only ever *removes* someone, and that stays valid after deactivation. Gating it would have made an existing org document **uneditable** the moment anyone on its exclusion list was switched off, with no way to recover. The two lists are now validated by two different predicates.

### 4.4 `payroll` — the two current registers

| # | Endpoint | Change |
|---|---|---|
| 18a | `GET /payroll/hr/salary-structures/current` | deactivated members dropped. Deactivation does not close a structure (`effective_to` stays `NULL`), so the register disagreed with the run population, which already filters `is_active`. Their history stays readable via the per-employee endpoints (#18, #29 — unchanged). |
| 24 | `GET /payroll/hr/bank-accounts` | deactivated members dropped from the primary payment registry, for the same reason. |

Both use a `required: true` nested `user_roles` include with `distinct: true`, so `count` and pagination stay exact.

### 4.5 Dropped from the proposal: shift assignments

v1.0.0 Fix 3 proposed filtering `GET /attendance/hr/shifts/assignments`. **Not done.** That query applies no `effective_to` filter — it already returns *expired* assignments for *active* employees, so it is an assignment ledger, not a current roster. Filtering it would be inconsistent with what it already returns and would stop HR seeing or cleaning up a suspended member's assignment. Recorded as an IMPROVEMENT, not a bug.

---

## 5. Frontend impact

**No contract changes.** No field added, removed or renamed; no new query parameter; no status code changed on a previously-succeeding call. What changes is *which rows come back*.

Things to check on your side:

1. **Attendance dashboards will show different numbers**, and they will be lower-but-truthful. If any screen caches or hard-codes a headcount, re-pull it.
2. **"Top defaulters" will change membership.** Deactivated staff previously dominated it with zero attendance.
3. **The attendance register behaves differently by query shape** — a **today-or-later** single-day view hides deactivated members; a date range **or a past date** still shows their real punches. That is intentional; don't "fix" it by filtering client-side, or you will hide a leaver's genuine attendance.
4. **New error paths on existing calls:**
   - `#80` / `#93` / `#81` / `#86` / `#96` → `404 USER_NOT_FOUND` when the subject is deactivated. Surface it as "this employee is no longer active", not "not found".
   - `#43` / `#44` → `422 TARGET_USER_UNKNOWN` when **`included_users`** names a deactivated member. `excluded_users` is unaffected, so editing a document that excludes a since-deactivated member still works. The `details.unknown` array lists the offending ids; the existing message already reads "Unknown or inactive target user id".
   - `#240` / `#241` → no new error. The pair appears in `skipped[]` with `reason: "user_not_found"`, which is already in the documented vocabulary.
5. **To act on a deactivated member deliberately**, use the Category A/B/C endpoints in §2 — chiefly `GET /organizations/employees?include_inactive=true` and `GET /organizations/employees/:id`.

---

## 6. Known issues found during review and NOT addressed here

These are pre-existing, out of scope for a visibility fix, and none of them block this change. Listed so they are a decision rather than a surprise.

| Severity | Where | Problem |
|---|---|---|
| **HIGH (scale)** | `document_report._collectMissingResults` → `checklistService.forUsers` | **N+1.** The missing-mandatory report (#115/#116) pages the roster to exhaustion and runs **3 sequential queries per employee** (`_loadProfile`, plus `findLiveByUserAndTypes` and `findOpenRequestsByTypes` in `_assemble`). A 1,000-employee org costs ~3,000 round trips in one call; the CSV export is unbounded. The sequential-ness is deliberate (the code comments that parallelising it "is how a report takes down the API"), so the real fix is to batch the three reads across the whole page instead of per user. This change *shrinks* the roster but does not fix the shape. |
| **HIGH (scale)** | `hr_attendance_read._getAttendanceListViaUsers`, and the same loop in `team.service.getTeamToday` / `manager_attendance_read.getTeamSummary` | **N+1 on the most-loaded screen.** For every member with no record on the target date, the loop calls `clockService._isHoliday` (3 queries: profile args, active holiday, calendar exception) and then `_resolveShiftForUser`. At the `limit` cap of 100 that is ~400 queries to render one page of the daily attendance sheet, and early in the day almost every row takes that branch. Holiday and shift resolution are org/date-scoped and highly repetitive — a per-request memo keyed by `(orgId, date, profile-args)` would collapse nearly all of it. |
| **MEDIUM** | `organization.service.updateEmployeeStatus` | Deactivation does **not** cancel the member's **open document requests**. New ones are now refused, but existing ones stay open, stay visible, and keep accruing overdue status against someone who cannot log in to clear them. Deactivation already declines to unwind leave for the same "suspension is reversible" reason, so cancelling outright may be wrong — but excluding `is_active = false` subjects from the overdue/reminder sweeps probably is not. |
| **LOW** | `validate(schema, 'query')` in the attendance route files | Express 5 makes `req.query` getter-only, so `req.query = validateOrThrow(...)` **silently no-ops** in these non-strict modules. Rejection of invalid input still works (the throw happens first), but `convert`, `default` and `stripUnknown` are all discarded, so services receive raw strings and never see schema defaults. Harmless today and relied on by this change (dates arrive as `YYYY-MM-DD` strings), but it is a trap: adding `'use strict'` to one of those route files would turn every one of those calls into a 500. |
| **Product decision** | `document_checklist.forUser` | #86/#96 now return `404 USER_NOT_FOUND` for a deactivated subject, so an HR "Documents" tab on a suspended employee's profile will look broken. The 404 is currently the *only* membership gate for #81 (bulk-from-checklist), so letting the read through requires adding an explicit guard to `createFromChecklist` first. Say the word and it is a small change. |

---

## 7. Verification

- 14 new regression tests in `tests/unit/organization/deactivated_member_visibility.test.js`, covering both halves of the contract (rosters exclude, history resolves).
- Every one was **mutation-checked** (11 mutations): each guard was reverted in turn and the corresponding test confirmed to fail, including the four inverted mutations (applying the roster filter to the history path, treating a past date as a roster, making the identity gates active-only, and re-gating the exclusion list).
- One test is a drift guard: it walks the whole `document` module, asserts all seven active-employee predicates carry the shared join, and asserts the offboarding exemption is still exactly one and still deliberate.
- Full suite: **2727 pass / 0 fail**.
- No database was touched; all verification is static plus unit tests.
