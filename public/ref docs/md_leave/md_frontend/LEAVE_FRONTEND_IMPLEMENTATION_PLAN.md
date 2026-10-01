# Leave Module — Frontend Implementation Plan (Source of Truth)

> **Status:** Living document. This is the single source of truth for the Leave
> Module frontend. Update the "Phase Status Tracker" and per-phase sections
> after every phase. A phase is complete only when its APIs and workflow are
> verified **end-to-end** (UI → action → request → backend contract → response
> → state → final UI), not merely when a service function exists.

**Backend source of truth:** the `.md` files in
`public/ref docs/md_leave/` and `public/ref docs/api_registry.md`
(+ `public/ref docs/new updates/`). Do not invent backend behaviour.

**Base URL:** `https://development.hrclouds.in/api/v1` (see `src/shared/api/client.js`).
**Feature flag:** every leave endpoint is gated by `leave.access`.
**Error schema (global):** `{ success:false, message, errorCode }` — switch on
`errorCode` (NOT `code`). Decimals come back as strings — always `parseFloat()`.
**Leave status enum:** `pending`, `approved`, `rejected`, `cancelled`,
`cancellation_pending`, `terminated_cancelled`.

---

## Phase Status Tracker

| Phase | Title | Status |
|---|---|---|
| 1 | Correctness & Data Integrity | ✅ Complete (reviewed) |
| 2 | Role Coverage & Automation Visibility | ✅ Complete (reviewed) |
| 3 | Phase-6 Configuration Fields | ⬜ Not started |
| 4 | Employee Self-Service Depth | ⬜ Not started |
| 5 | Approver Decision Support | ✅ Complete |
| 6 | Reporting | ⛔ Blocked (no backend endpoint — B8) — Requirements documented |

### Phase 1 — completion notes
Files changed: `LeaveTab.jsx`, `ManagerLeavePage.jsx`, `ManagerApprovalsInbox.jsx`,
`LeaveTypesPage.jsx`, `LeaveDashboard.jsx`, new `shared/utils/leaveErrors.js`.
- Override modal now blank-by-default with dirty-field tracking → sends only
  changed keys; empty submit is blocked. No more silent config reset / quota cap.
- Manager Team History renders independently of the pending queue.
- Inbox resolves the real applicant name via `applicant` (fallback to `user`);
  balance lookup uses `applicant.id ?? user_id`.
- Leave-type conflict switched to `errorCode`.
- Cancel modal + cancellable set are date-driven; `cancellation_pending` removed
  from cancellable; `terminated_cancelled` badge added.
Verified end-to-end via `vite build` (pass) + eslint (only pre-existing baseline
conventions remain — React import + unescaped entities, consistent with codebase).

### Phase 2 — completion notes
Files changed: `leave.api.js`, `LeaveAutomationPage.jsx`, new
`HRLeaveRequestsPage.jsx`, `AppRoutes.jsx`, `DashboardSidebar.jsx`,
`ManagerLeavePage.jsx`.
- New **HR → Leaves → Leave Requests** page (`/dashboard/hr/leaves/requests`):
  org-wide pending queue with approve/reject + client-side search, and a history
  tab with status + employee filters and page/limit pagination.
- Sidebar: added "Leave Requests", re-enabled "Automation Engine".
- Automation page: surfaces the run summary (period/processed/credited/skipped/
  failed, and rolled/oldYear/newYear), optional `reference_date`, ordering hint.
- `runAccrual`/`runRollover` accept optional `reference_date`;
  `getTeamMemberRequests` accepts `{status,page,limit}`.
- Manager history tab: status filter + pagination wired to `getTeamRequests`.

### Review after Phase 1 + 2 (findings fixed)
- **Duplicate request on filter change** — resetting page via a separate effect
  caused a stale-page fetch then a page-1 fetch. Fixed by resetting page inside
  the filter change handlers (`changeStatus`/`changeUser`/`changeHistoryStatus`)
  so `loadHistory`/`loadRequests` fire exactly once.
- **Employee-list purpose** — HR history filter now uses
  `getEmployees({ purpose: "all_hr_list" })` (matches EmployeesPage), best-effort.
- Verified: no contract mismatches, approve/reject payloads correct, loading/
  empty/error states present, null-safe name/id/date resolution, submit buttons
  disabled while in-flight, no hardcoded data, list keys present.
- Pending backend confirmation (non-blocking): B4 (history total/limit meta —
  pagination is heuristic until then), B7 (applicant shape), B10 (HR org history).

Legend: ⬜ Not started · 🔨 In progress · ✅ Complete · ⛔ Blocked

---

## API Coverage Matrix (28 leave endpoints)

Status: ✅ Fully · 🟨 Partially · 🟥 Incorrectly Integrated · ⬜ Missing

| # | Feature | Endpoint | Method | Service fn | Status | Phase |
|---|---|---|---|---|---|---|
| 1 | Leave Types | `/leaves/types` | POST | `createLeaveType` | ✅ | 3 |
| 2 | Leave Types | `/leaves/types` | GET | `getLeaveTypes` | ✅ | — |
| 3 | Leave Types | `/leaves/types/:id` | PUT | `updateLeaveType` | ✅ | 3 |
| 4 | Leave Types | `/leaves/types/:id` | DELETE | `deleteLeaveType` | ✅ | — |
| 5 | Templates | `/leaves/templates` | POST | `createTemplate` | ✅ | — |
| 6 | Templates | `/leaves/templates` | GET | `getTemplates` | ✅ | — |
| 7 | Templates | `/leaves/templates/:id` | PUT | `updateTemplate` | ✅ | — |
| 8 | Templates | `/leaves/templates/:id` | DELETE | `deleteTemplate` | ✅ | — |
| 9 | Entitlements | `/leaves/templates/:tid/entitlements` | POST | `addEntitlement` | ✅ | 3 |
| 10 | Entitlements | `/leaves/templates/:tid/entitlements/:eid` | PUT | `updateEntitlement` | ✅ | 3 |
| 11 | Entitlements | `/leaves/templates/:tid/entitlements/:eid` | DELETE | `deleteEntitlement` | ✅ | — |
| 12 | Allocation | `/leaves/users/:userId/assign-policy` | POST | `assignPolicy` | ✅ | — |
| 13 | Override | `/leaves/users/:userId/configs/:leaveTypeId` | PUT | `overrideConfig` | ✅ | 1,3 |
| 14 | Balance (HR) | `/leaves/users/:userId/balances` | GET | `getUserBalances` | ✅ | 4 |
| 15 | Balance (self) | `/leaves/my-balances` | GET | `getMyBalances` | ✅ | 4 |
| 16 | Apply catalog | `/leaves/my-leave-types` | GET | `getMyLeaveTypes` | ✅ | 4 |
| 17 | Application | `/leaves/request` | POST | `submitRequest` | ✅ | 4 |
| 18 | History (self) | `/leaves/my-requests` | GET | `getMyRequests` | ✅ | 4 |
| 19 | Detail (self) | `/leaves/requests/:id` | GET | `getLeaveRequest` | ✅ | 4 |
| 20 | Cancellation | `/leaves/requests/:id/cancel` | POST | `cancelRequest` | ✅ | 1 |
| 21 | Approval queue | `/leaves/team/requests/pending` | GET | `getTeamPendingRequests` | ✅ | 1,2 |
| 22 | Approve | `/leaves/requests/:id/approve` | POST | `approveRequest` | ✅ | 2,5 |
| 23 | Reject | `/leaves/requests/:id/reject` | POST | `rejectRequest` | ✅ | 2 |
| 24 | Team history | `/leaves/team/requests` | GET | `getTeamRequests` | ✅ | 1,2 |
| 25 | Member history | `/leaves/team/member/:userId/requests` | GET | `getTeamMemberRequests` | ✅ | 2,5 |
| 26 | Member balances | `/leaves/team/member/:userId/balances` | GET | `getTeamMemberBalances` | ✅ | 1,5 |
| 27 | Accrual | `/leaves/automation/accrual/run` | POST | `runAccrual` | ✅ | 2 |
| 28 | Rollover | `/leaves/automation/rollover/run` | POST | `runRollover` | ✅ | 2 |

Holiday dependency: `GET /attendance/holidays` (read-only display) — ✅.
Reports/summary: no backend endpoint — out of scope (see B8).

---

## Phase 1 — Correctness & Data Integrity 🔴

**Objective:** stop the integrations that lose data or hide fetched data.

**Fixes:**
1. **Override Config** (`LeaveTab.jsx`) — modal prefilled from a non-existent
   `balance.config` object and unconditionally sent all 5 rule fields from
   fabricated defaults, silently resetting accrual type / carry-forward /
   probation / overdraft and capping annual quota at a mid-year `total_accrued`.
   Fix: dirty-field tracking, send only changed keys, block empty submit.
2. **Manager Team History** (`ManagerLeavePage.jsx`) — empty-state guard tested
   the *pending* array on the History tab, so history was never shown when the
   pending queue was empty (the steady state). Fix: per-tab empty state.
3. **Approvals Inbox names** (`ManagerApprovalsInbox.jsx`) — read `item.user`,
   backend sends `applicant`, so every leave row showed "Unknown" and the
   balance lookup used the wrong id. Fix: `resolveApplicant()` + correct id.
4. **Leave type conflict** (`LeaveTypesPage.jsx`) — checked `err.data.code`,
   renamed to `errorCode`. Fix: use `errorCode`.
5. **Cancellation semantics** (`LeaveDashboard.jsx`) — modal keyed on `status`
   but backend decides by date; `cancellation_pending` was offered as
   cancellable (guaranteed 400). Fix: date-driven copy, drop the bad status.
6. **Shared error mapper** (`src/shared/utils/leaveErrors.js`, new) — mirrors
   `payrollErrors.js`; maps typed `errorCode`s incl. `FEATURE_NOT_AVAILABLE`.

**Exit criteria:** override sends a minimal payload; History renders with an
empty pending queue; no "Unknown" applicant; duplicate-code shows field error;
cancel copy matches actual outcome in both directions.

---

## Phase 2 — Role Coverage & Automation Visibility 🟠

**Objective:** give HR the approval powers the backend already grants; make
automation runs legible.

**Work:**
1. New **HR → Leaves → Leave Requests** page: global pending queue + org-wide
   history reusing approver APIs; sidebar entry + route.
2. Wire `status` / `user_id` / `page` / `limit` on team history.
3. Client-side search/paging on the unpaginated pending queue.
4. Re-enable Automation nav; render run summary
   (`period`/`processed`/`credited`/`skipped`/`failed`); optional
   `reference_date`; rollover-before-accrual hint.
5. Add `reference_date` to `runAccrual`/`runRollover` in `leave.api.js`.

**Exit criteria:** HR can approve/reject any org leave incl. escalated; team
history filters + paging work; accrual/rollover report real counts.

---

## Phase 3 — Phase-6 Configuration Fields 🟡

**Work:** demographic gating (`allowed_genders`, `allowed_marital_statuses`) on
leave types; tri-state `notice_period_max_days` (Unrestricted `null` / Blocked
`0` / Capped `n`) on entitlements + override; exclude already-entitled types
from the Add-Quota dropdown.

---

## Phase 4 — Employee Self-Service Depth 🟡

**Work:** searchable leave-type selector with balance + doc threshold; live
pre-submit balance/pending-hold/LWP panel; typed error handling; `year`
selector; history filter/search; explicit detail affordance.

---

## Phase 5 — Approver Decision Support 🟡

**Work:** inline balance snapshot on approval cards; full request detail;
typed approve-failure guidance; clear Approve-Leave vs Approve-Cancellation.

---

## Phase 6 — Reporting ⛔ Blocked

No backend endpoint for leave summaries/utilisation/export. Tracked as B8.
**Frontend requirements for Backend have been documented in `PHASE_6_REPORTING_REQUIREMENTS.md`.**

---

## Backend Clarifications Required

| # | Question | Blocks | Resolution |
|---|---|---|---|
| B1 | Does any endpoint return the employee's current `employee_leave_config` (assigned_annual_quota, accrual_type, max_carry_forward, probation_restriction_days, max_negative_balance, notice_period_max_days)? No `GET /leaves/users/:id/configs` exists. | Override prefill | Open — mitigated by dirty-field-only payload |
| B2 | Does `GET /my-requests` nest `leave_type`? Sample omits it but UI renders `r.leave_type?.name`. | Self history labels | Open — verify against live response |
| B3 | Do balance rows include `carried_forward`, `lapsed_balance`, `last_accrued_period`? | Carry-forward display | Open |
| B4 | `GET /team/requests` default/max `limit` and does it return `total`/`page` meta? | Real pagination | Open — client-side paging fallback |
| B5 | Are leave business errors returned with specific `errorCode`s (DOCUMENT_REQUIRED, DEMOGRAPHIC_INELIGIBLE, NOTICE_PERIOD_RESTRICTED, SANDWICH_*) or generic BAD_REQUEST + message? | Typed apply errors | Open — pass through message as fallback |
| B6 | Is there a file-upload endpoint for `document_url`? | Document upload | Open — URL paste only for now |
| B7 | Confirm pending-queue applicant shape is `applicant` (not `user`). | Inbox names | Assumed `applicant` per phase3 doc — verify live |
| B8 | Is a leave reports/summary/export endpoint planned? | Phase 6 | Open — Phase 6 blocked |
| B9 | Pagination coming to `/team/requests/pending` and `/my-requests`? | Queue scale | Open — client-side for now |
| B10 | Can HR read an arbitrary employee's leave history via `/team/member/:userId/requests`? | HR history panel | Assumed yes (global approver) — verify |

---

## Change Log

- _(init)_ Plan created from approved audit. Phases 1–5 scoped, Phase 6 blocked.
- **Phase 1 + 2 implemented & reviewed.** Correctness fixes (override data-loss,
  manager history branch, inbox applicant names, cancel semantics, error codes)
  + HR approval surface, automation summaries, history filters/pagination.
  Build passes; post-phase review fixed a duplicate-fetch on filter change.
  Next: Phase 3 + 4.
- **Phase 5 implemented & reviewed.** Decision support logic introduced to `ManagerApprovalsInbox.jsx`. Inbox now uses rich `LeaveInboxCard`s for leaves to display inline balances, granular request details (LWP/paid breakdown, dates), and clear Approve vs. Cancel texts with typed error messages. Phase 6 remains blocked, but requirements are now documented in `PHASE_6_REPORTING_REQUIREMENTS.md`.
