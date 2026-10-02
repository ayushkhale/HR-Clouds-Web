Leave Assignment v2 — implementation plan
0. Starting point and assumptions
Base: dev @ b37ccee [ Bug Fixes and Push: RG ]. That commit already contains the earlier bug-fix batch (payroll settings diff-save, quota/manage-components/form-template widths, role+HOD column, invite gender note) and public/ref docs/md_updates/2026-10-02_frontend_requests_to_backend.md.

Assume none of this exists (it was uncommitted and is being discarded):

src/roles/hr/leaves/screens/LeaveAssignmentPage.jsx (the v1 master–detail page)
the /dashboard/hr/leaves/assignments route in src/routes/AppRoutes.jsx
the "Leave Assignment" sidebar link in src/shared/components/DashboardSidebar.jsx
the leaves.assignment surface in src/shared/fieldHelp/fieldHelp.json
public/ref docs/md_updates/2026-10-02_leave_assignment_api_request.md (the backend ask)
Note: git reset --hard does not remove untracked files, so LeaveAssignmentPage.jsx and the API-request doc survive unless you also git clean -fd. Delete them deliberately — this plan rebuilds the page from scratch and §1 below restates the contract, so nothing depends on either file.

Prerequisite: at minimum the two P1 endpoints are live. Phases are ordered so P1 alone is shippable and useful.

1. The contract this plan assumes (self-contained restatement)
1.1 P1 — GET /api/v1/leaves/assignments (hr, admin, super-admin)
Query: template_id, user_id, state (ongoing|upcoming|ended), unassigned=true, has_overrides=true, department_id, q, page, limit (≤100).


{ "success": true, "data": { "total": 150, "page": 1, "limit": 100, "rows": [{
  "id": "assignment-uuid",
  "user_id": "uuid",
  "user": { "id": "uuid",
            "profile": { "first_name": "Asha", "last_name": "Menon", "display_name": "Asha Menon", "avatar_url": null, "gender": "female" },
            "employee_profile": { "employee_code": "E-104" },
            "role": "employee", "department": "Engineering", "designation": "Backend Dev" },
  "template": { "id": "uuid", "name": "Standard 2026", "entitlement_count": 4 },
  "effective_from": "2026-01-01", "effective_to": null,
  "override_count": 0,
  "assigned_by": { "id": "uuid", "name": "Rahul Gupta" },
  "assigned_at": "2026-01-01T06:12:44.000Z" }] } }
Unassigned people arrive either as rows with template: null or only via ?unassigned=true. Both are handled — see normalizeAssignmentRows in §3.2.

1.2 P1 — GET /api/v1/leaves/users/:userId/leave-config (hr)

{ "success": true, "data": { "user_id": "uuid",
  "template": { "id": "uuid", "name": "Standard 2026" }, "effective_from": "2026-01-01",
  "types": [{ "leave_type_id": "uuid", "leave_type": { "name": "Earned Leave", "code": "EL" },
    "effective": { "assigned_annual_quota": 24, "accrual_type": "upfront", "max_carry_forward": 5,
                   "probation_restriction_days": 90, "max_negative_balance": 0, "notice_period_max_days": null },
    "policy_default": { "annual_quota": 18, "accrual_type": "upfront", "max_carry_forward": 5,
                        "probation_restriction_days": 90, "max_negative_balance": 0, "notice_period_max_days": null },
    "is_overridden": true, "overridden_fields": ["assigned_annual_quota"] }] } }
1.3 P2 — bulk assign
POST /leaves/assignments/preview (writes nothing) and POST /leaves/assignments/bulk, same body:


{ "template_id": "uuid", "effective_from": "2027-01-01",
  "target_departments": [], "target_locations": [], "target_employment_types": [],
  "target_job_statuses": [], "included_users": [], "excluded_users": [] }
Preview returns { matched, unchanged[], changing[], blocked[] }; bulk returns the same buckets as outcomes (assigned, skipped, failed, each with reason).

1.4 P2 — dating and lifecycle
POST /leaves/users/:userId/assign-policy accepts optional effective_from
POST /leaves/assignments/:id/end — body { "effective_to": "YYYY-MM-DD" }
DELETE /leaves/assignments/:id
1.5 P3
DELETE /leaves/users/:userId/configs/:leaveTypeId — revert one type to the policy
assigned_user_count on GET /leaves/templates; 409 TEMPLATE_IN_USE with details.assigned_user_count on delete
GET /leaves/assignments/summary → { on_policy, unassigned, with_overrides, templates[] }
Two answers to get in writing before building the preview copy (do not assert either on screen until confirmed): does re-assigning the same template recompute balances, and does re-assigning mid-year carry total_used forward? If taken days reset, the preview must warn that changing a policy mid-year hands people free leave. Also confirm whether DELETE /assignments/:id reverses balances — the confirm copy depends on it.

2. Target UX (what to build)
Mirror Shift Management (AttendanceRosterPage + AssignShiftDialog) deliberately: a manager promoted to HR must not learn two screens for one job.


Leave Assignment                                     [ Assign a policy ]
Who has which leave policy, and what it gives them.

[On a policy 142] [No policy 8] [Policies in use 4 of 6] [Custom rules 11]

[All] [On a policy] [No policy (8)] [Custom rules]        [search…]

Employee        Code    Policy          From        State     Custom
Asha Menon      E-104   Standard 2026   1 Jan 2026  Ongoing   —
Priya N         E-131   N/A             N/A         No policy —
Imran Q         E-140   Interns 2026    1 Apr 2026  Upcoming  —
Row opens a DetailDialog inspector; footer actions Change policy · Customise rules · End · Delete. No View/eye button in the row (§3).

3. File-by-file
3.1 src/shared/api/leave.api.js — add to the HR block

const ASSIGNMENT_FILTERS = ["template_id", "user_id", "state", "unassigned",
                            "has_overrides", "department_id", "q", "page", "limit"];
getAssignments: (params = {}) => request(`/leaves/assignments${qs(pick(params, ASSIGNMENT_FILTERS))}`),
getUserLeaveConfig: (userId) => request(`/leaves/users/${seg(userId)}/leave-config`),
previewBulkAssign: (payload) => post("/leaves/assignments/preview", payload),
bulkAssignPolicy:  (payload) => post("/leaves/assignments/bulk", payload),
endAssignment:     (id, payload) => post(`/leaves/assignments/${seg(id)}/end`, payload),
deleteAssignment:  (id) => del(`/leaves/assignments/${seg(id)}`),
revertUserConfig:  (userId, leaveTypeId) => del(`/leaves/users/${seg(userId)}/configs/${seg(leaveTypeId)}`),
Allow-list the filters the way attendance.api.js does with withShiftFilters (an unknown key must not silently widen the result); never send org_id. Keep JSDoc on each. Tick the new rows in public/ref docs/api_registry.md (§9).

3.2 src/roles/hr/leaves/leaveAssignmentMeta.js (new, no JSX)
Domain knowledge out of the JSX (§1):


export const ASSIGNMENT_STATE = { ongoing, upcoming, ended, none }   // label + purple tone + note
export const assignmentState = (row, today) => "none" | "ended" | "upcoming" | "ongoing"
export const STATE_FILTERS = [All, On a policy, No policy, Custom rules]
export function normalizeAssignmentRows(res)   // → { rows, total, page, limit }
export const PREVIEW_BUCKETS = { unchanged, changing, blocked }      // title + tone + what it means
export const BLOCK_REASON = { NO_JOINING_DATE: "No joining date on file, so leave can't be worked out", ... }
assignmentState derives from effective_from/effective_to against today (same logic as AttendanceRosterPage.assignmentState), returning none when template is null. normalizeAssignmentRows is the seam that absorbs whichever shape the backend chose for unassigned people: if no row ever carries template: null, the page fires the second ?unassigned=true query and merges. Nothing else in the UI knows which.

3.3 src/roles/hr/leaves/screens/LeaveAssignmentPage.jsx (new)
Header comment (§8) explaining: why it exists, why it is server-paginated, why unassigned rows matter most, and the normalize seam.

State: rows, total, page, filter, search (debounced 300ms), loading, loadError, inspect, endTarget, deleteTarget, customiseTarget, assignOpen.
Reads: leaveAPI.getAssignments({ ...filterToQuery(filter), q, page, limit: 25 }). Guard stale responses with a request token ref (§7). Reset page on filter/search change.
Columns: Employee (GenderAvatar + name + email) · Emp. code · Policy (name + entitlement_count as "4 leave types") · Effective from (fmtDate) · State pill · Custom (override_count → "2 types", else empty cell) · Actions.
Per-field gating (§7): hide the Custom column entirely if no row carries override_count; hide "Assigned by" in the inspector if assigned_by is absent. Absent key → hidden feature, never a crash.
Row: spread rowPreviewProps(() => setInspect(row), \Leave policy for ${name}`); actions column keeps only real actions in a HiDotsVerticalmenu (End / Delete),onClick={e => e.stopPropagation()}, opening upwards on the last two rows (copy the roster's openUp`).
States: Skeleton type="table" · ErrorState with retry (a 404 reads "The assignment list isn't available on this server yet") · EmptyState for nothing-yet vs nothing-matching.
Coverage tiles: from getSummary() if present, else three total-only queries (limit=1) in parallel. The "No policy" tile is the one that matters — make it the only tile that can be clicked, and make it set the filter.
Pagination from shared/attendance/ui.
No event-bus emit: assignment changes no approval-queue count, so nothing belongs in INBOX_EVENT_KINDS (§7). Say so in the header comment so nobody "fixes" it.
After a write: re-read that row (getAssignments({ user_id })), not the whole list.
3.4 src/roles/hr/leaves/components/AssignmentInspector.jsx (new)
DetailDialog composition only (§3) — never a hand-rolled modal:

DetailStats: days left in total, leave types, custom rules count.
DetailSection "Policy": DetailGrid (policy name, effective from, valid until, state) + DetailTable of entitlements (type, days per year via formatDayCount, how it's given, kept for next year).
DetailSection "Balances this year" (defaultOpen false, totals in the title): DetailTable — type, left, given so far, taken. All numbers through formatDayCount; Postgres decimals arrive as strings, so parseFloat first.
DetailSection "Custom rules": only when override_count > 0 — which types differ and from what, read from getUserLeaveConfig.
DetailSection "History": who assigned it and when (assigned_by.name, fmtDate) — hidden if absent.
DetailFooterNote when the person has no policy, saying why there are no numbers.
Footer: Change policy · Customise rules · End · Delete.
Reads getUserLeaveConfig(user_id) + getUserBalances(user_id, year) on open; a failed read shows "Couldn't load", never "Not set" (§7).
3.5 src/shared/leaves/AssignLeavePolicyDialog.jsx — extend, never fork
Add to the existing dialog (it already has the person picker, the "what will be replaced" read and the confirm step):

effective_from date field (default today; past dates before joining are refused server-side → map EFFECTIVE_DATE_BEFORE_JOINING).
A mode toggle: One person / Many people. In Many mode, swap the person select for the targeting controls using the holidays vocabulary — PersonMultiSelect for included_users/excluded_users, multi-selects for departments/locations, and employment types / job statuses sourced from the roster (useTargetingOptions already derives these; reuse it, don't re-derive).
Step machine: form → preview → confirm → result. Preview calls previewBulkAssign and renders the four buckets with counts and names (PREVIEW_BUCKETS); the primary button is disabled until a preview has succeeded — same principle the dialog already applies for one person ("the read has to have SUCCEEDED, not merely finished").
Result step lists per-person outcomes when bulk returns partial success. If the backend chose all-or-nothing, show the single failure reason instead.
Bulk cap: if BULK_LIMIT_EXCEEDED comes back, page the call with settleWithLimit from shared/utils/promisePool.js (§7 — never a sequential await loop).
Keep it a form (§3): max-w-5xl, grid sm:grid-cols-2 gap-x-6 gap-y-4, pinned footer, long fields on sm:col-span-2.
3.6 src/shared/leaves/CustomiseLeaveRulesDialog.jsx (new — extracted)
Lift CustomiseRulesModal out of LeaveTab.jsx so the inspector and the profile tab share one editor (§2). Changes while extracting:

Prefill every field from leave-config.types[].effective; show the policy default beneath each label ("policy default: 18").
Mark changed fields; still send only what changed (the PUT is partial).
Add Revert to the policy default → revertUserConfig behind await window.confirm(...) (§7 — window.confirm returns a Promise).
Delete the "blank means unchanged" explanation — it stops being true.
Rendered as a sibling of the inspector at z-[170], not a child (§3 stacking).
3.7 src/roles/hr/screens/employee-profile/LeaveTab.jsx — three edits
Import the extracted dialog; delete the local copy and its "no current-config object" comment.
New top row: "On Standard 2026 since 1 Jan 2026" from leave-config, with "No policy assigned" as the alternative. This is what the tab could never say.
Keep the assign button as-is (same shared dialog, person already decided).
3.8 Small files
src/shared/utils/leaveErrors.js — add TEMPLATE_EMPTY, TEMPLATE_IN_USE, ASSIGNMENT_NOT_FOUND, ASSIGNMENT_ALREADY_ENDED, EFFECTIVE_DATE_BEFORE_JOINING, NO_JOINING_DATE, BULK_LIMIT_EXCEEDED, in the plain-consequence voice of the existing entries.
src/routes/AppRoutes.jsx — const LeaveAssignmentPage = lazy(...) + <Route path="/dashboard/hr/leaves/assignments" .../> inside the existing workspace="hr" block. HR-only: the API is hr, admin, super-admin, so a manager gets no entry at all (§2 — absent, not broken).
src/shared/components/DashboardSidebar.jsx — link("Leave Assignment", \${H}/leaves/assignments`, HiClipboardCheck)directly after "Leave Policies" in the Setup › Leave group, with a comment pointing at the Work Shifts → Shift Management precedent.HiClipboardCheckis already imported. Sidebar label =<h1>=DashboardTopBar title` = "Leave Assignment" (§5).
src/roles/hr/leaves/screens/LeavePoliciesPage.jsx (P3) — assigned_user_count column; on delete, map 409 TEMPLATE_IN_USE to "23 people are on this policy — move them first" with a link to /leaves/assignments?template=….
4. Phases
Phase	Needs	Build	Done when
1	1.1	api layer, meta, page, inspector, route, sidebar, field help	HR can see every person, their policy, and who has none, and open any row
2	1.2	extract + prefill Customise, revert link, policy row on LeaveTab	The override form shows real numbers and the policy default beside them
3	1.3, 1.4	dialog modes + targeting + preview/confirm/result, effective_from, End/Delete modals	HR assigns a department in one pass, sees what will change first, and can end or delete an assignment
4	1.5	revert endpoint wired, headcount column + 409, coverage tiles	Leave Policies shows headcount and refuses an unsafe delete
Each phase is independently shippable and breaks nothing if the next never lands.

5. Field help (§10) — add to fieldHelp.json
New surface leaves.assignment, kind: "form", workspaces: ["hr"], every entry "tier": "onboarding" with an Ask Maya question, hints ≤160 chars:

Key	Covers
page	what the screen is for; that assigning replaces current rules and recounts the year
effective_from	a future date schedules the change instead of applying it now
override_count	why one person's rules can differ from their policy
state	Ongoing / Upcoming / Ended on a leave assignment
Cap is 4 per screen state — these are exactly 4, and the onboarding tier exempts HR from the cap anyway. No ⓘ on Employee, Code, Department, search or the role tabs: everyday data (§10 forbids it). The inspector reuses leaves.policy_setup for entitlement fields — do not write a second set of hints for the same concepts. Re-word the existing leaves.policy_setup entries only if a label changes. The hand-off line must state: surface id, number of hints, Ask Maya questions added.

6. Edge cases to handle explicitly
Pending invitees appear in the roster but have no profile page — flag them "Invite pending" and don't link to a profile (EmployeesPage already blocks that navigation).
Leavers: the list is current employees by default; a leaver's history stays readable via ?user_id=.
No joining date → pro-rata is impossible; today that's a 500. Surface it as a blocked row in the preview, not a crash.
Mid-year re-assignment: until the backend confirms total_used handling, the preview says what it knows and nothing more.
Partial bulk failure: report per person. Never a toast that says "done" over 7 failures.
Stale rows: refresh one row after a write; guard every read with a request token.
Never cache a roster row — presigned avatar_urls expire in ~5 min; keep ids in state and derive entries from useEmployeeDirectory (this bit me in v1).
People come from one place — useEmployeeDirectory(). No organizationAPI.getEmployees() from a screen, no second roster fetch.
Decimals are strings from Postgres — parseFloat before arithmetic or formatDayCount.
Days are whole or half — formatDayCount() only; never 2.5, and no "days" caption beside it.
No IDs on screen (§4) — personName/nameOf, employee_code only where an identifier genuinely helps. A ?template= URL param is fine; a visible uuid is not.
Unknown → N/A, never a dash; drop the Actions column if no row has an action.
Purple only (§5): violet = ongoing/success, fuchsia = upcoming/pending/warning, indigo = info, rose only for destructive and errors.
window.confirm is a Promise — if (!(await window.confirm(...))) return;
StrictMode double-fetch in dev is not a bug.
7. Verification

npm run lint      # compare only the files you touched against the baseline
npm run build
dist/ is gitignored in this tree — confirm git status --short dist/ is empty and don't commit build output.

Manual QA per phase: an org with ≥1 unassigned person, ≥1 person with overrides, ≥1 future-dated assignment, ≥1 ended one; a policy with zero entitlements; a failed read (offline) proving "Couldn't load" ≠ "No policy"; the list at 1366px and 390px with no horizontal page scroll and no layout shift from any ⓘ.

Afterwards: tick the implemented rows in public/ref docs/api_registry.md, mark the delivered items in the request doc, and record any live-behaviour deviation from the spec in the relevant file's header comment (§9) so the next person doesn't "correct" it back.

If you'd like this as a hosted page instead of a paste, say so and I'll publish it as a private artifact you can keep the link to.