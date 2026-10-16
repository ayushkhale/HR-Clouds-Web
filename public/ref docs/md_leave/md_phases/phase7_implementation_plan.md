# Phase 7 — Policy Assignment Ledger, Coverage & Bulk Assignment: Implementation Record

**Date:** 2026-10-02 · **Status:** Implemented. Code and unit tests are green; migration 00066 is handed back unrun.
**Source plan (full detail, decisions D-1…D-13):** `public/md_updates/2026-10-02_backend_implementation_plan_for_frontend_requests.md`
**Frontend guide:** `phase7_api_analysis.md` · **Combined analysis:** §6, §8, §11, §12, §14b, §23–§31

---

## 0. Executive Summary — What Phase 7 *Actually* Is

The frontend asked for a Leave Assignment screen, modelled on the attendance shift roster. The request assumed the backend already knew who is on which policy. **It did not.** Assigning a template copied values into `employee_leave_configs` with no link back. Phase 7 therefore:
1. Adds the assignment ledger (`employee_leave_policy_assignments`) and links configs to it.
2. Ships the screen's APIs: roster, summary, effective config, history, bulk preview and assign, end, revert, template headcount and `TEMPLATE_IN_USE`.
3. Fixes eleven defects in the assignment engine found during review (§1).

## 1. Audit Cross-Check — Verdicts

| ID | Defect | Fix |
|---|---|---|
| B-1 | An empty template closed every config the person had | `400 TEMPLATE_EMPTY` before any write; inactive or deleted types are dropped |
| B-2 | A → B → A credited an upfront type twice | No live config but a current-year balance → diff against the latest config closed this IST year |
| B-3 | Two concurrent first assignments → 500 on the unique index | `pg_advisory_xact_lock('leaveassign:{org}:{user}')` first in every assignment write |
| B-4 | Template read outside the transaction | Read inside, `FOR SHARE`; delete takes `FOR UPDATE` |
| B-5 | Server clock instead of IST | `istNow()` / `istToday()` / `istYearStart()` in `leave_automation.utils` |
| B-6 | Same template again wiped overrides | No-op (`outcome: "unchanged"`) |
| B-7 | A deactivated member could be assigned | `409 EMPLOYEE_INACTIVE` |
| B-8 | Role profile probed employee → manager → hr | Resolved from the membership role (`leave_member.utils`); also used by eligibility and the calculator |
| B-9 | A re-invite under another role left a stale profile (G-1) | `inviteUser` removes other role tables' live rows first |
| B-10 | A missing joining date was silently "today" | `400 NO_JOINING_DATE`, plus an HR fill-once route |
| B-11 | Config readers ignored effective dates | Application, apply-form catalog and live-row lookups made date-aware |

## 2. Database / Schema Changes

### Migration `00066-create-leave-policy-assignments.js`

**New table `employee_leave_policy_assignments`:**
- Columns: `template_id` (NULL = legacy), `template_name_snapshot`, `effective_from` / `effective_to`, `activated_at`, `source`, `bulk_request_id`, `assigned_by`, `ended_by`, `ended_at`, `end_reason`. Paranoid.
- Indexes:
  - `elpa_one_open_idx`: UNIQUE; at most one open activated assignment per member;
  - `elpa_one_scheduled_idx`: UNIQUE; reserved for scheduling;
  - `elpa_org_template_idx`;
  - `elpa_org_user_from_idx`.
- A range CHECK (`effective_to` not before `effective_from`).

**New columns on `employee_leave_configs`:** `assignment_id`, `template_values` (JSONB, as copied) and `overridden_fields` (TEXT[]).

**Backfill:** one `legacy_backfill` row per (org, user) with live configs, and those configs are linked to it.

**`down()`** destroys the ledger history.

## 3. Task-by-Task Implementation

### T1 — Engine fixes (B-1…B-11)
`leave_assignment.service.js` is restructured around `_assignInTransaction` (shared by single and bulk) and `_rewriteConfig` (shared by override and revert). The engine math (`_calculateNewAccrued`) is unchanged apart from taking the IST instant.

### T2 — Ledger writes
Assign closes the current ledger row (`effective_to = max(yesterday, its effective_from)`) and inserts the new one. Configs carry `assignment_id`, `template_values` and `overridden_fields`. Override and revert keep the link.

### T3 — Reads
`leave_assignment_read.service.js` provides the roster, summary, effective config and history. `employee_leave_policy_assignment.repository.js` holds the raw SQL: the member base set, the current-assignment lateral join, override counts, filters and per-template counts.

### T4 — Bulk
`_planBulk` does the targeting and classification. The predicate is imported from `document_targeting.utils`; it is the same one holidays, weekly-offs and org documents use. Each person runs in their own transaction, with a cap of 200 and a preview token.

### T5 — End
Stamps the assignment and its configs. It is refused while leave runs past the end date, under the same per-(user, type) locks a submission takes. Balances are untouched.

### T6 — Templates
`assigned_user_count` on the list; `409 TEMPLATE_IN_USE` on delete. Both use the same count.

### T7 — Organization (G-1)
- `PATCH /organizations/employees/:id/hr-fields`: gender, marital status, and a missing joining date; HR only; not on yourself; reason required.
- Stale-profile removal on invite (B-9).

## 4. Execution Order & Dependencies
Migration 00066 **before** the code: `EmployeeLeaveConfig` selects the new columns. Phase 5 (future-dated scheduling, activation job, deleting a not-yet-started assignment) is deferred. Activation on 1 January must run after the year-end rollover.

## 5. Transactions, Concurrency, Idempotency, Data Integrity

**Locks:**
- Per-member advisory lock.
- Template `FOR SHARE` (assign) and `FOR UPDATE` (delete).
- End takes the submission locks.
- Partial unique indexes back the "one open assignment per member" rule.

**Idempotency:**
- Same-template assign is a no-op.
- Revert with no overrides is a no-op.
- A bulk retry skips people already done.

## 6. Error Handling & Edge Cases (consolidated)

| Code | HTTP | When |
|---|---|---|
| `TEMPLATE_EMPTY` | 400 | The policy has no active leave types |
| `NO_JOINING_DATE` | 400 | No joining date on file |
| `EFFECTIVE_DATE_NOT_SUPPORTED` | 400 | `effective_from` is not today (IST) |
| `EFFECTIVE_TO_IN_PAST` | 400 | End date before today |
| `INVALID_DATE` | 400 | End date before the start |
| `TARGETING_REQUIRED` | 400 | Every targeting array empty without `scope: "all"` |
| `INVALID_TARGETING` | 400 | Department or location outside the org |
| `BULK_LIMIT_EXCEEDED` | 400 | More than 200 matched |
| `LEAVE_CONFIG_ENDED` | 400 (submit) / 409 (override, revert) | The config's assignment has ended |
| `EMPLOYEE_INACTIVE` | 409 | Deactivated member |
| `TEMPLATE_IN_USE` | 409 | Delete while people are on the policy |
| `ASSIGNMENT_ALREADY_ENDED` | 409 | Ending twice |
| `ASSIGNMENT_HAS_LEAVES_AFTER_END` | 409 | Leave runs past the end date |
| `PREVIEW_STALE` | 409 | Selection or policy changed since the preview |
| `NO_POLICY_DEFAULT` | 409 | Revert on a legacy config |
| `ASSIGNMENT_NOT_FOUND`, `CONFIG_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `TEMPLATE_NOT_FOUND` | 404 | Unknown resource |

## 7. Security & Authorization
New routes are `hr` only (role-plane rule); the older leave routes keep their lists. Roster SQL binds every value through replacements, and search wildcards are escaped. The roster returns the #8 slim user fields only.

## 8. Performance & Scalability
A roster page costs three queries (count, page, hydration) plus one for names, with no N+1. The bulk cap of 200 at roughly 30 queries per person was chosen to stay inside proxy timeouts; measure it on the dev database.

## 9. Logging, Monitoring & Audit
The ledger is the audit trail (who, when, ended by, reason). Bulk per-person unexpected failures are logged with `bulk_request_id`. The HR-fields change logs `[ORG_AUDIT]` with old → new and the reason.

## 10. Testing Strategy
All suites stub the database; none touches Postgres.
- `tests/unit/leave/leave_assignment_service.test.js` (33): engine fixes, ledger, override, revert, end, bulk.
- `tests/unit/leave/leave_assignment_contract.test.js` (15): migration against the model, indexes, backfill, validators, roster SQL, hr-only routes.
- `tests/unit/leave/leave_assignment_read.test.js` (10): roster shaping, leave-config, history, template count and 409, member resolution, apply-form filter, `LEAVE_CONFIG_ENDED`.
- `tests/unit/organization/hr_owned_fields_and_stale_profiles.test.js` (10).
- `tests/unit/payroll/payroll_settings_schema.test.js` (+1, G-2).

## 11. Migration & Deployment
The user runs 00066. It was verified statically only (recording queryInterface). The roster and summary SQL were checked against model attributes but have **not run against Postgres**: smoke-test them on the dev database after migrating.

## 12. Definition of Done — Phase 7
- [x] Ledger, backfill and links
- [x] §23–§30 endpoints, plus changed §6, §8, §11, §12
- [x] B-1…B-11 fixed with tests
- [x] Docs: combined analysis, registry, this record, the frontend guide, the frontend change record
- [ ] Migration 00066 applied (user)
- [ ] Dev-database smoke test of the roster, summary, bulk and end (user)

## 13. Risk Register
- **Roster SQL** is unexecuted until migrated.
- **Bulk cap:** an estimate.
- **Monthly over-credit** from B-2 before the fix is not reversed.
- **Existing duplicate role profiles** need a user-run cleanup; see the diagnostic query in the source plan §7.

## 14. Files Touched (reviewer checklist)
**Migration:** `src/infrastructure/postgres-sql/migrations/00066-create-leave-policy-assignments.js`

**Leave models and repositories:**
- `leave/models/employee_leave_policy_assignment.model.js` (new), `employee_leave_config.model.js`
- `leave/repositories/employee_leave_policy_assignment.repository.js` (new), `employee_leave_config.repository.js`, `leave_policy_template.repository.js`

**Leave services:**
- `leave/services/leave_assignment.service.js`, `leave_assignment_read.service.js` (new)
- `leave_admin.service.js`, `leave_application.service.js`, `leave_balance.service.js`

**Leave utilities:** `leave/utils/leave_member.utils.js` (new), `leave_automation.utils.js`, `leave_calculator.utils.js`

**Leave HTTP layer:** `leave/validators/leave_assignment.validator.js`, `leave/controllers/leave_admin.controller.js`, `leave/routes/leave_admin.routes.js`

**Organization:**
- `organization/repositories/organization.repository.js`
- `organization/services/invitation.service.js`, `organization.service.js`
- `organization/controllers/employee.controller.js`, `organization/routes/employee.routes.js`, `organization/validators/employee.validator.js`
