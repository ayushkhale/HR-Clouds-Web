# HR Clouds — Manager Panel Frontend & UI/UX Audit Report

**Audit date:** 2026-10-14  |  **Role:** Manager  |  **App:** https://frontend.dev.hrclouds.in  |  **API base:** https://development.hrclouds.in/api/v1

**Method:** Read-only API capture (direct curl GETs, 1 login POST) + frontend JS-bundle inspection, merged with a live-browser UI observation pass (read-only; no submit/approve/reject/delete clicked). DevTools was unavailable in both lanes, so endpoints, console warnings, and network traffic stay **NOT VERIFIED** and are marked as such throughout. No records were deleted, approved, rejected, submitted, or modified. Credentials were transient and never written to any file. No screenshot files are included (see §7).

## 1. Executive Summary & Health Score

- **Overall UI/UX Score (1–10):** **6/10** (browser-observation lane) — Basis: clean formatting (no raw ISO/null literals; local dates/times, formatted durations and currency), loading skeletons and real empty states, but docked for cross-view task inconsistency (M-25), profile PII exposure (M-28), blank Team Cost dialog (M-30), Absent-vs-Not-Marked mismatch (M-26), and a broken avatar with no fallback (M-27).
- **API Data Utilization Score (1–10):** **6/10** (browser-observation lane) — Basis: the UI renders most captured API data (attendance, leave, tasks, payroll), but omits overtime columns in Live Attendance, has no dashboard task/approvals strip (M-34), renders no task view/rework/reassignment counts, and shows no status on Flags.
- **API Consistency Score (1–10, evidence-grounded proxy):** **6/10** — Basis: 36 of 38 API calls returned 200 with rich payloads; docked for null headline fields, string numerics, four pagination shapes, and cross-endpoint conflicts (M-01, M-02, M-06), plus PII over-exposure (M-03).
- **Findings:** 34 total — 5 High, 12 Medium, 17 Low (24 API-lane M-01–M-24 + 10 UI-lane M-25–M-34).
- **Endpoints captured:** 38 GET calls (36 × 200, 1 × 400 probe artifact, 1 × 403 expected RBAC).
- **Top 3 Critical Frontend Issues:**
  1. **M-25 / M-01** — Same task, two priorities AND two kinds across views (High in All Tasks, Medium in My Tasks).
  2. **M-28 / M-03** — Profile page exposes PII field names (DOB, blood group, father's/spouse names, personal email).
  3. **M-02 / M-26** — Dashboard says Absent 4 while the directory says Not Marked; Team Cost dialog renders blank member cells (M-30).
- **Top 3 High-Value UI/UX Enhancement Opportunities:**
  1. Dashboard tasks-needing-attention strip + pending-approvals counter from existing endpoints (M-34).
  2. Overtime/late badges and a policy tooltip (grace 15 min, full-day 7.45h) from the already-returned policy_snapshot; add the overtime column to Live Attendance (it already exists in Team History).
  3. One-click approval ribbons, batch actions, status-pill standardization (incl. a status column on Flags), and one avatar-fallback component everywhere (M-27, M-33).

## 2. Page-by-Page Audit & API Parity

Each module lists the API capture plus a **UI lane** block with browser-observed rendered values. Endpoints/console remain NOT VERIFIED (DevTools unavailable in both lanes).

### 4.1 Manager Dashboard & Team KPI Overview — `/dashboard/manager`

- **GET /attendance/manager/team/summary?date=2026-10-14** → HTTP 200 (2.9s)
  - API keys: counts null; final_present 0, final_absent 4, final_pending 4; members[4] with status/status_reason/clock times/effective_hours/work_mode
  - Frontend rendered value: NOT VERIFIED (browser lane pending)
  - Note: Headline fields null (M-14); buckets double-count (M-02).
- **GET /attendance/manager/team/today** → HTTP 200 (4.11s)
  - API keys: 4 derived rows: status, shift_snapshot, policy_snapshot (grace_minutes 15), user profile (avatar null), id null
  - Frontend rendered value: NOT VERIFIED
  - Note: Policy snapshot repeated per member (payload bloat); avatar null vs directory (M-07).
- **GET /attendance/manager/team/graph-data?month=10&year=2026** → HTTP 200 (2.41s)
  - API keys: daily[14]: present/absent/late/half-day/leave/weekly-off/holiday counts, avg_effective_hours, total_overtime_minutes, attendance_percentage, nested counts
  - Frontend rendered value: NOT VERIFIED
  - Note: Rich trend data available; counts duplicated top-level + nested per day (payload bloat).
- **GET /leaves/team/requests/pending** → HTTP 200 (1.44s)
  - API keys: [] (empty)
  - Frontend rendered value: NOT VERIFIED
  - Note: Pending approvals queue is empty at audit time.
- **GET /tasks/manager/team-tasks** → HTTP 200 (1.61s)
  - API keys: 1 task: priority high, status pending, due_date, comments_count 0, attachments []
  - Frontend rendered value: NOT VERIFIED
  - Note: Conflicts with /tasks/me (M-01).

**UI lane (browser observation, read-only pass):**
- Dashboard KPI cards: Team members 4, Present 0, Absent 4, Late 0, On leave 0, Working 0; NO "Pending 4". No team-task section, no pending-approvals counter (M-34). Header avatar: solid purple circle, no initials.
- Live Attendance: all "Not Marked", IN/OUT/Lateness N/A; shift "Morning Shift · 10:00 am–06:00 pm"; no overtime/grace/IP/location/punch columns.
- Loading: "Loading" text + skeleton bars on most pages. No error banners on app screens. Guessed URLs (/requests/anomalies, /requests/flags, /payroll/payslips) returned the app 404 page; app links work.
- No literal null/undefined/NaN/[object Object] anywhere; no raw ISO timestamps.
### 4.2 Team Attendance & Shift Management — `/dashboard/manager/attendance (+ anomalies, comp-offs, overtime, regularizations)`

- **GET /attendance/manager/team/member/{id}/daily-log?date=2026-10-14** → HTTP 200 (2.75s)
  - API keys: status not_marked, status_context.shift populated, top-level shift null, clock in/out null, sessions [], breaks []
  - Frontend rendered value: NOT VERIFIED
  - Note: No grace_time / ip_address / location_coordinates / punch_records fields. Shift null vs status_context.shift (M-06).
- **GET /attendance/manager/team/member/{id}/history** → HTTP 200 (4.17s)
  - API keys: 14 records; effective_hours null vs 0 across endpoints; id null on derived rows
  - Frontend rendered value: NOT VERIFIED
  - Note: See M-06, M-18.
- **GET /attendance/manager/team/member/{id}/summary?month=10&year=2026** → HTTP 200 (3.86s)
  - API keys: present 5, half 1, absent 4, late 2, final_leave 6, attendance 60%, punctuality 66.67, total_overtime 369, total_break 0
  - Frontend rendered value: NOT VERIFIED
  - Note: total_break_minutes 0 (M-20); final_leave folds holidays/weekly offs (M-05).
- **GET /attendance/regularizations (own)** → HTTP 200 (1.46s)
  - API keys: 3 approved requests; requested_clock_in/out null; reviewer null; review_remarks mostly null
  - Frontend rendered value: NOT VERIFIED
  - Note: M-11. No manager team regularizations LIST endpoint found in frontend bundles - only per-item approve/reject actions. Manager Requests screens data source NOT VERIFIED.
- **GET /attendance/overtime/mine?page=1&limit=10** → HTTP 200 (1.58s)
  - API keys: total 16; nested record + approver + policy_snapshot (grace 15, thresholds); worked_duration_formatted
  - Frontend rendered value: NOT VERIFIED
  - Note: Rich unused data: policy_snapshot, matched_location, distance_to_location_meters, punch-log ids. Policy snapshot variance (M-16).
- **GET /attendance/anomalies/mine** → HTTP 200 (1.75s)
  - API keys: total 25; types: early_exit, excessive_break, insufficient_hours, late_arrival, out_of_bounds, unauthorized_absence; is_resolved boolean
  - Frontend rendered value: NOT VERIFIED
  - Note: M-21. No manager team anomalies list endpoint found in bundles.
- **GET /attendance/comp-offs/mine** → HTTP 200 (1.35s)
  - API keys: 1 comp-off: earned 2026-09-27, worked_type weekly_off, worked_hours '3.34', expiry 2026-12-26
  - Frontend rendered value: NOT VERIFIED
  - Note: No manager team comp-offs list endpoint found in bundles.

**UI lane (browser observation, read-only pass):**
- Member page (full page, not a drawer) history: No data / Present / Weekly off / Absent / Holiday; hours N/A or 0m or formatted (e.g. 7h 58m).
- Daily Log dialog: 09:20 am–06:20 pm, 7h 58m, break 1h 2m, LATE 0m, OVERTIME 0m, LEFT EARLY 0m, Office, Fixed shift; "Loading" spinner.
- Team Attendance History: pagination "Showing 1–25 of 30", OVERTIME column with "+1h 14m"-style values, one "Corrected" row.
- Regularizations, Comp-offs (= Earned Leave screen), Overtime queues all EMPTY ("All caught up…") — row-level rendering NOT observable.
- Anomalies/Flags: 1 row, "Unauthorized absence", Severity High, DETAILS truncated; columns only EMPLOYEE/DATE/FLAG/SEVERITY/DETAILS — no punch times, reviewer, worked_hours, or status pill (M-33).
### 4.3 Team Leave Approvals & Balances — `/dashboard/manager/requests/leaves`

- **GET /leaves/team/requests** → HTTP 200 (1.82s)
  - API keys: 1 record, status cancelled; applicant + leave_type embedded; total_days '1.00' string; no balance/overlap/history fields
  - Frontend rendered value: NOT VERIFIED
  - Note: M-15. Approver is UUID-only (no name). Balances require a separate call.
- **GET /leaves/team/member/{id}/balances** → HTTP 200 (1.78s)
  - API keys: 5 leave types; current_balance strings; total_accrued/used, carried_forward, lapsed_balance
  - Frontend rendered value: NOT VERIFIED
  - Note: Verified correctly scoped to the member (user_id matches member). Identical values across users are test-data uniformity, not a wrong-user bug.
- **GET /leaves/team/member/{id}/requests** → HTTP 200 (4.34s)
  - API keys: Same single cancelled request as team list
  - Frontend rendered value: NOT VERIFIED
  - Note: Team and member endpoints agree on this record.
- **GET /leaves/assignments (manager role)** → HTTP 403 (1.1s)
  - API keys: FORBIDDEN 'Access denied'
  - Frontend rendered value: NOT VERIFIED
  - Note: Expected: HR-scoped screen (/dashboard/hr/leaves/assignments) correctly denies Manager role. Not a defect.

**UI lane (browser observation, read-only pass):**
- Pending Approvals EMPTY. Team History SHOWS the cancelled request (CANCELLED pill, Emergency Leave, "9/16/2026 • 1d"); total_days renders "1d". No approver field anywhere. No clash highlighting/overlap data.
- Clicking the leave card opened NO detail modal (M-31). Leave history briefly flashes "No History Found" before data loads (M-32).
- Member Leave tab balances formatted "Xd" / "Xd and 1/2 d" with given/taken lines.
### 4.4 Team Member Directory & Profiles — `/dashboard/manager/team, /dashboard/manager/team/member/:userId`

- **GET /organizations/directory** → HTTP 200 (1.24s)
  - API keys: 8 people: name, role, employee_code, department, designation, work_location, gender, avatar_url (signed S3), dob, email
  - Frontend rendered value: NOT VERIFIED
  - Note: Org-wide, not team-scoped (M-24). Signed URLs embed AWS key ID, 300s expiry (M-13).
- **GET /organizations/employees/{id}** → HTTP 200 (1.6s)
  - API keys: 34 keys, zero nulls: profile + contact + addresses + reporting_person + department_head_details; NO skills, NO emergency_contacts
  - Frontend rendered value: NOT VERIFIED
  - Note: M-03 (PII). Skills / emergency contacts absent from API - cannot be rendered from this endpoint.
- **GET /organizations/departments** → HTTP 200 (1.17s)
  - API keys: 3 departments; head_of_department embedded (avatar null); location embedded
  - Frontend rendered value: NOT VERIFIED
  - Note: Dept-head avatar null vs directory (M-07). Seed typo 'Sales And Markerting' (M-17).
- **GET /organizations/locations** → HTTP 200 (1.19s)
  - API keys: 2 locations: city, timezone, geofence_radius_meters 100, latitude/longitude
  - Frontend rendered value: NOT VERIFIED
  - Note: Timezone 'Asia/Kolkata' vs 'Asia/Calcutta'; city 'INDORE' vs 'Indore' (M-17).
- **GET /organizations/employees (bare)** → HTTP 400 (1.0s)
  - API keys: VALIDATION_ERROR 'Purpose is required to filter employee data'
  - Frontend rendered value: NOT VERIFIED
  - Note: M-22.

**UI lane (browser observation, read-only pass):**
- Team Directory: 4 team-scoped members (org total 8 per Org Chart). 3 photos + 1 BROKEN/PARTIAL avatar (pale circle, small black arc — not initials/generic icon) (M-27). Location "HEAD OFFICE" (all caps).
- Profile is a full-page tab, not a drawer. Field names observed (values withheld): Department, Designation, Role, Work location, Joined, Contact (Phone, Email); PERSONAL PROFILE: DATE OF BIRTH, GENDER, MARITAL STATUS, BLOOD GROUP, FATHER'S NAME, SPOUSE NAME; WORK & CONTACT PROFILE: DATE OF JOINING, EMPLOYMENT TYPE, WORK MODE, WORK OFFICE, PERSONAL EMAIL, EMERGENCY CONTACT, ADDRESS DETAILS. No Skills card; single EMERGENCY CONTACT field "Not Available" (M-28).
- Org Chart filter shows "Sales And Markerting 2" (typo NOT in directory) (M-17).
- `purpose` param: NOT VERIFIED (directory renders, but param-passing itself NOT VERIFIED).
### 4.5 Task Management & Assignment — `/dashboard/manager/tasks/*, /dashboard/manager/my-tasks`

- **GET /tasks/manager/team-tasks** → HTTP 200 (1.61s)
  - API keys: 1 task: title, category compliance, priority high, status pending, due_date, assigner/assignee embedded, is_overdue false, comments_count 0
  - Frontend rendered value: NOT VERIFIED
  - Note: Conflicts with /tasks/me (M-01). No completion_percentage field anywhere in task payloads.
- **GET /tasks/manager/assigned-by-me** → HTTP 200 (1.48s)
  - API keys: [] empty; pagination total 0
  - Frontend rendered value: NOT VERIFIED
  - Note: Manager has assigned no tasks.
- **GET /tasks/manager/{id}** → HTTP 200 (1.68s)
  - API keys: Full task: extension/rework/reassignment counts, is_viewed false, external_links [], attachments []
  - Frontend rendered value: NOT VERIFIED
  - Note: Unused data opportunity: is_viewed, rework/reassignment/extension counts, external_links.
- **GET /tasks/manager/{id}/comments** → HTTP 200 (1.89s)
  - API keys: 2 comments; author embedded (avatar null); pagination shape total_items/has_next_page
  - Frontend rendered value: NOT VERIFIED
  - Note: Comment-author avatar null vs directory (M-07). Distinct pagination shape (M-09).
- **GET /tasks/me** → HTTP 200 (1.46s)
  - API keys: Same task id: priority medium, due_date 30 min earlier
  - Frontend rendered value: NOT VERIFIED
  - Note: M-01.

**UI lane (browser observation, read-only pass):**
- All Tasks/detail show the single task as Priority High, kind "Rules & compliance", Deadline "15 Oct 2026" (detail shows "10:30 am", no timezone). My Tasks shows the SAME task as Priority Medium, kind "Joining a new person" (M-25).
- Detail: no viewed/rework/reassignment/extension counts; Files: "No files on this task.", REFERENCE LINKS "Nothing linked."; Discussion: 2 comments, NO numeric count/badge; one comment author "AH" initials fallback, other photo. Action buttons present, NOT clicked.
- Tasks I Assigned EMPTY ("You haven't given out any tasks").
### Payroll (outside brief modules 4.1-4.5; captured for manager-surface completeness) — `/dashboard/manager/payroll/*`

- **GET /payroll/manager/team/benefit-enrollments** → HTTP 200 (1.85s)
  - API keys: count 0, rows []
  - Frontend rendered value: NOT VERIFIED
  - Note: Empty.
- **GET /payroll/manager/employees/{id}/payslips** → HTTP 200 (2.13s)
  - API keys: 1 payslip Sep 2026, run_status paid, gross '21911.12', net '19164.45', payable_days '17.00', lop_days '2.00'
  - Frontend rendered value: NOT VERIFIED
  - Note: Amounts as strings (M-08).
- **GET /payroll/manager/reimbursements/claims** → HTTP 200 (1.51s)
  - API keys: 1 claim: claim_number, status approved, total_amount '1000.00', current_level/total_levels 2/2, items[] with category TRAVEL
  - Frontend rendered value: NOT VERIFIED
  - Note: Approval-level fields available.
- **GET /payroll/manager/encashments** → HTTP 200 (1.82s)
  - API keys: [] empty
  - Frontend rendered value: NOT VERIFIED
  - Note: Empty.
- **GET /payroll/manager/loans** → HTTP 200 (1.96s)
  - API keys: 3 loans; sample: status active, amount '10000.00'
  - Frontend rendered value: NOT VERIFIED
  - Note: Amounts as strings (M-08).
- **GET /payroll/manager/adjustments** → HTTP 200 (1.94s)
  - API keys: 13 adjustments; samples: status approved, type earning, amounts '1075.00'/'500.00'
  - Frontend rendered value: NOT VERIFIED
  - Note: Amounts as strings (M-08).

**UI lane (browser observation, read-only pass):**
- Payslips: rupee symbol with commas + 2 decimals; NET < GROSS despite DEDUCTIONS of zero (unexplained) (M-29). Amount values withheld (formats only).
- Team Cost dialog: TEAM MEMBER cells all BLANK, STATUS "N/A" for all 4, UNPAID DAYS "2d across the team" (M-30).
- Employee Salaries: rupee Indian grouping, no decimals, same CTC/effective date for all 4 (seed-data uniformity, not a defect claim).
- Adjustments: 13 rows, all "Earning Bonus", Approved 9 / Cancelled 4, rupee whole rupees; "Earning Bonus" wraps.
- Loan Recommendations: 3 rows, TYPE Loan, TENURE "6 mo"/"3 mo", Active/Cancelled.
- Claims (Submitted) EMPTY; Team benefits EMPTY ("No team benefit enrollments."); Leave Payouts EMPTY ("Nothing here yet…").
- "Cash out earned leave" and "Propose" buttons NOT clicked.

## 3. UI/UX & Data-Rendering Defects Log

| ID | Location / Component | Severity | Description / Observed Behavior | Expected Fix | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| M-01 | GET /tasks/manager/team-tasks, GET /tasks/manager/{id} vs GET /tasks/me | High | **Same task, two priorities and two due times across endpoints** — For one task id, /tasks/manager/team-tasks and /tasks/manager/{id} return priority 'high' and due_date '2026-10-15T05:00:00.000Z', while /tasks/me returns priority 'medium' and due_date '2026-10-15T04:30:00.000Z' (30 minutes earlier). One task, two priorities, two due times. | Single source of truth for priority and due_date; normalize timezone conversion server-side so all task endpoints agree. | api-capture 11-tasks-team.json, 30-task-detail.json, 13-tasks-me.json (same task id) UI verdict: UI-confirmed and extended - UI shows the same task as Priority High in All Tasks/detail vs Priority Medium in My Tasks; kind also differs ('Rules & compliance' vs 'Joining a new person'). Detail renders '10:30 am', consistent with the team-tasks/detail due_date (05:00Z = 10:30 IST). See M-25. |
| M-02 | GET /attendance/manager/team/summary?date=2026-10-14 | High | **Team summary buckets double-count: absent 4 AND pending 4 for a 4-person team** — final_absent_count=4 and final_pending_count=4 for a team of 4 members, while all 4 members are status 'not_marked' with status_reason 'pending_clock_in'. The buckets sum to 8, exceeding team size. final_present_count=0. | Make status buckets mutually exclusive; members pending clock-in must not also count as absent (or document bucket precedence explicitly). | api-capture 01-team-summary.json UI verdict: UI reframes - Dashboard shows NO 'Pending 4' (drops the pending bucket; counts reconcile to team size), but the semantic mismatch persists: dashboard says Absent 4 while the directory says 'Not Marked'. See M-26. |
| M-03 | GET /organizations/employees/{id} (Manager role) | High | **Manager endpoint returns highly sensitive PII for a reportee** — The employee-detail endpoint returns field names including pan_number, uan_number, blood_group, dob, personal_email, contact phone, current_address and permanent_address for a reportee, far beyond what team management needs. Values are deliberately not reproduced in this report. | Role-scoped field filtering: return only team-management fields to the Manager role; gate PAN/UAN/blood-group/addresses/DOB behind HR-only access. | api-capture 28-org-employee.json (field names only) UI verdict: UI-confirmed - Profile page exposes PII field names (DOB, blood group, father's/spouse names, personal email, emergency contact, address details). PAN/UAN presence on the UI NOT VERIFIED. See M-28. |
| M-04 | GET /attendance/trends?months=6 | Medium | **Punctuality is 100% for months with zero present days** — May-Aug 2026 return present_days 0 with absent_days 30-31, yet punctuality_percentage 100. The metric defaults to 100 when there are no present days (division-by-zero fallback). | Return null / 'n/a' for punctuality when present_days is 0 instead of defaulting to 100. | api-capture 04-own-trends.json |
| M-05 | GET /attendance/summary, GET /attendance/manager/team/graph-data | Medium | **'Leave' bucket folds holidays and weekly offs into leave** — Own summary: on_leave_days 0 vs final_leave_days 6 (holiday_days 2 + weekly_off_days 4 = 6). Team graph 2026-10-02: on_leave_count 0 vs final_leave_count 4 with holiday_count 4, and attendance_percentage 100 with final_present_count 0. The 'final leave' bucket appears to include holidays and weekly offs, not just approved leave. | Separate approved-leave counts from holiday/weekly-off counts, or label the composite bucket honestly (e.g. 'non-working days'). | api-capture 03-own-summary.json, 02-team-graph.json UI verdict: UI reframes - Member history renders Weekly off and Holiday as distinct statuses (not folded into leave) at row level; the API final_leave composite remains at the summary layer. |
| M-06 | Multiple attendance endpoints (team summary, daily log, history, weekly calendar, team-today, member history) | Medium | **Null-vs-zero inconsistency for the same 'no punch yet' state** — For the same not-marked state, effective_hours is null (team summary members, weekly calendar today, member history, team-today) but 0 (own daily log, own history today); late/overtime are null (member history) but 0 (own history); total_hours is null (team-today) but 0 (daily log); member daily-log top-level shift is null while status_context.shift is populated. | One canonical representation (null = no record; 0 = recorded zero) applied uniformly across all attendance endpoints. | api-capture 01, 05, 06, 07, 23, 24, 32 files UI verdict: UI reframes - UI renders 'N/A' / '0m' / formatted durations, so the null-vs-zero split is not visible to users; the API inconsistency remains. |
| M-07 | Team summary, team-today, task comments, department heads vs directory | Medium | **Avatar URL present in one endpoint, null in others for the same person** — avatar_url is null for all 4 team members in team summary and team-today, null for task-comment authors, and null for all 3 department heads - while /organizations/directory returns signed S3 avatar URLs for the same people. | Use a single avatar resolver across all endpoints so the same person has the same avatar everywhere. | api-capture 01, 14, 16, 31, 32 files UI verdict: UI reframes - UI renders directory photos for 3 of 4 members; fallback is inconsistent: header avatar is a solid purple circle with no initials, one member avatar is broken/partial (M-27), task-comment author shows 'AH' initials fallback. |
| M-08 | Leaves, payroll, attendance, tasks endpoints | Medium | **Numeric values returned as strings** — total_days '1.00', leave balances '2.00', gross/net pay '21911.12'/'19164.45', total_hours '9.34', worked_hours '3.34', overtime pagination page '1' / limit '10' are all JSON strings, not numbers. | Return numbers as JSON numbers; keep formatted strings only in separate display fields if needed. | api-capture 08, 09, 20, 29 files UI verdict: UI-confirmed (formatting) - UI formats string numerics: total_days '1.00' renders as '1d'; balances as 'Xd' / 'Xd and 1/2 d'; payroll with rupee symbol, commas and 2 decimals (payslips) / Indian grouping, no decimals (salaries); durations as '7h 58m'. No raw string numerics observed on screen. |
| M-09 | Leaves, directory, attendance, tasks, task comments endpoints | Medium | **Pagination envelope has four different shapes** — Observed shapes: {total, page, limit, total_pages} (leaves, directory); {total, page, limit, totalPages} (attendance, tasks); {page, limit, total_items, total_pages, has_next_page, has_prev_page} (task comments); own-history carries BOTH totalPages and total_pages. | Standardize on one pagination envelope across the API. | api-capture 06, 08, 11, 14, 31 files UI verdict: UI note - UI renders a human pagination label ('Showing 1-25 of 30') in Team History; API envelope shapes remain an API-layer issue. |
| M-10 | GET /attendance/trends and other manager endpoints | Medium | **Slow endpoints: trends 11.55s, several manager endpoints over 4s** — GET /attendance/trends took 11.55s. Team-today 4.11s, member history 4.17s, member leave requests 4.34s. Median across 38 captured calls was about 1.9s. | Cache or pre-aggregate trend data; profile the slow queries (team-today, member history, member leave requests). | api-capture manifest.jsonl (seconds per call) UI verdict: UI symptom consistent - Leave history briefly flashes 'No History Found' before data loads (M-32), consistent with the slow member-leave-requests endpoint (4.34s); causation NOT VERIFIED. |
| M-11 | GET /attendance/regularizations | Medium | **Approved regularizations carry no requested punch times** — All 3 approved regularization requests have requested_clock_in and requested_clock_out null; reviewer object is null (only reviewed_by UUID); review_remarks null in 2 of 3. The approval records no corrected times. | Require requested times at submission; embed reviewer name; require remarks on approval. | api-capture 19-attendance-regularizations.json UI verdict: UI not observable - Regularizations queue EMPTY ('All caught up...'); row-level requested-times/reviewer rendering NOT observable. |
| M-12 | API error responses (observed on 401) | Low | **Error responses leak server stack traces** — A 401 response body includes a full Node.js stack trace with server file paths (auth middleware, router internals). | Strip stack traces from production error responses; log them server-side only. | api-capture 01-team-summary.json from the first (unauthenticated) capture round |
| M-13 | GET /organizations/directory avatar_url values | Low | **Signed avatar URLs embed an AWS access key ID and expire in 300s** — Directory avatar URLs contain an X-Amz-Credential access key ID and X-Amz-Expires=300. Credential material is exposed in API responses and the 5-minute TTL can break cached renders. | Serve avatars via a CDN/proxy without credential material in the URL; use a longer, cache-friendly TTL. | api-capture 14-org-directory.json (URL pattern; values not reproduced) UI verdict: UI note - UI renders 3 of 4 member photos; 1 broken/partial avatar (M-27). Whether the 300s signed-URL expiry contributes is NOT VERIFIED. |
| M-14 | GET /attendance/manager/team/summary, GET /attendance/manager/team/graph-data | Low | **Dead / legacy null headline fields** — Team summary returns counts, team_size, eligible_headcount and attendance_percentage all null while final_* counts are populated. Team graph returns top-level month, year and team_summary null. | Remove dead fields or populate them; do not ship null headline fields. | api-capture 01-team-summary.json, 02-team-graph.json UI verdict: UI reframes - Dashboard renders computed counts (no null headlines visible); the dead API fields are not surfaced by the UI. |
| M-15 | GET /leaves/team/requests vs GET /leaves/team/requests/pending | Low | **Cancelled request included in the general team requests list** — The team requests list returns 1 record with status 'cancelled'; the pending endpoint correctly returns []. Cancelled items are included in the general list, so clients must filter. | Default the team list to active statuses, or document that clients must filter by status. Whether the UI filters is NOT VERIFIED (browser lane pending). | api-capture 08-leaves-team-requests.json, 33-leaves-team-pending.json UI verdict: UI reframes - Team History SHOWS the cancelled request with a CANCELLED pill; Pending Approvals is EMPTY. The UI separates history from pending, so the 'must filter' concern is handled by separate views. No approver field anywhere in the leave UI. |
| M-16 | Overtime record policy_snapshot vs team-today policy_snapshot | Low | **Policy snapshot variance for the same policy id (unconfirmed cause)** — The same policy id shows full_day_min_hours 7.45 / max_break_duration 75 in current snapshots, but 7.00 / 60 in the 2026-10-06 overtime record snapshot. | Verify against policy edit history: if snapshots are point-in-time, this is expected; if not, it is snapshot drift. Cause NOT VERIFIED. | api-capture 20-attendance-overtime-mine.json, 32-team-today.json |
| M-17 | Departments, overtime remarks, locations | Low | **Seed-data quality typos and inconsistent canonical values** — Department name 'Sales And Markerting'; overtime remark 'AproovaD'; timezone 'Asia/Kolkata' vs 'Asia/Calcutta'; city 'INDORE' vs 'Indore'. | Correct seed data; validate canonical timezone/casing values on write. | api-capture 16-org-departments.json, 17-org-locations.json, 20-attendance-overtime-mine.json UI verdict: UI-confirmed - Typo 'Sales And Markerting' IS visible in the Org Chart filter ('Sales And Markerting 2'); NOT in the directory. Location renders 'HEAD OFFICE' (all caps) in the UI. |
| M-18 | History and team-today derived rows | Low | **Derived rows carry null ids and null timestamps** — History and team-today derived/provisional rows return id null and created_at/updated_at null. | Omit id for synthetic rows or use stable synthetic keys; do not rely on id as a list key for these rows (UI usage NOT VERIFIED). | api-capture 06-own-history.json, 24-member-history.json, 32-team-today.json UI verdict: UI reframes - UI renders derived rows without leaking null ids/timestamps; no null literals observed anywhere. |
| M-19 | GET /attendance/trends?months=6 | Low | **Current streak counts not-yet-clocked-in today as absent** — current_streak is {type: 'absent', days: 1, since: '2026-10-14'} while the 2026-10-14 day status is pending_clock_in / not_marked. | Exclude provisional / today-not-marked days from streak computation. | api-capture 04-own-trends.json, 07-own-weekly-calendar.json UI verdict: UI note - UI shows the same provisional-absent semantics: dashboard Absent 4 before clock-in while the directory says 'Not Marked' (M-26). Own-streak rendering NOT VERIFIED. |
| M-20 | GET /attendance/manager/team/member/{id}/summary | Low | **Zero break minutes across 6 present days for one member** — Member monthly summary shows total_break_minutes 0 across 6 present days (5 present + 1 half day). | Verify break capture for this member; if breaks are not tracked, do not present a 0 that implies no breaks were taken. | api-capture 25-member-summary.json UI verdict: UI note - UI Daily Log renders break duration when present (e.g. '1h 2m'); the specific 0-break member-summary case NOT VERIFIED in the UI. |
| M-21 | GET /attendance/anomalies/mine | Low | **Anomalies use an is_resolved boolean and no status field** — Anomaly records carry type / severity / is_resolved / resolver, with no status key - unlike leave and task entities which use status strings. | Align status modeling across entities, or document the boolean convention. | api-capture 21-attendance-anomalies-mine.json UI verdict: UI-confirmed - Flags view shows no status pill/column, consistent with the API's is_resolved boolean; details truncated (M-33). |
| M-22 | GET /organizations/employees (bare call) | Low | **Employee list requires a purpose query param** — A bare GET returns 400 VALIDATION_ERROR 'Purpose is required to filter employee data'. The frontend getEmployees passes caller-supplied params; whether manager screens supply purpose is NOT VERIFIED. | Document required params in the API contract; consider a default purpose for directory-style reads. | api-capture 15-org-employees.json UI verdict: UI note - Directory renders successfully (4 team members), implying params are supplied, but whether the UI passes 'purpose' is NOT VERIFIED. |
| M-23 | POST /auth/login | Low | **Login requires 'identifier', not 'email' (informational)** — POST /auth/login with {email, password} returns success:false 'Identifier is required.' With {identifier, password} it returns success:true, role manager. The frontend complies with this contract. | None - document the contract. Included because the first capture round failed on this field name. | Capture-round-1 login response; capture-round-2 login success UI verdict: UI note - Browser pass signed in successfully under the identifier contract. |
| M-24 | GET /organizations/directory (Manager role) | Low | **Directory is org-wide, not team-scoped** — The directory returns all 8 org members (HR head, 2 managers, 5 employees) including DOB/email fields to a Manager caller, not just that manager's team. | Scope the directory to the caller's visibility, or gate PII fields by role (ties to M-03). | api-capture 14-org-directory.json UI verdict: UI reframes - UI Team Directory shows only the 4 team members (team-scoped); org total 8 visible in Org Chart. The API endpoint still returns org-wide data to a Manager caller (M-24 stands at the API layer). |

| M-25 | All Tasks / My Tasks / task detail views (UI) | High | **Same task shows different priority AND kind across views** — The same task renders as Priority High, kind 'Rules & compliance', Deadline '15 Oct 2026' in All Tasks and in the task detail (detail shows '10:30 am', no timezone), but as Priority Medium, kind 'Joining a new person' in My Tasks. The detail time '10:30 am' is consistent with the team-tasks/detail due_date (05:00Z = 10:30 IST), not the /tasks/me value (04:30Z = 10:00 IST). | Single source of truth for priority, kind and due_date across all task views; render the timezone on due times. | browser observation, Tasks views (All Tasks / My Tasks / task detail). UI-confirms and extends M-01 (kind also differs in the UI). |
| M-26 | Dashboard KPI cards vs Team Directory list (UI) | Medium | **Dashboard says 'Absent 4' while the directory lists all 4 as 'Not Marked'** — Dashboard KPI cards read Team members 4, Present 0, Absent 4, Late 0, On leave 0, Working 0 (no 'Pending 4'). The Team Directory lists all 4 members as 'Not Marked' with IN/OUT/Lateness N/A. The same not-yet-clocked-in state is labelled 'Absent' on the dashboard and 'Not Marked' in the directory. | One status vocabulary across dashboard and directory: show 'Not Marked / Pending' on the dashboard before clock-in, or document that dashboard 'Absent' means not-yet-marked. | browser observation, Dashboard + Team Directory. Reframes M-02 (dashboard drops the pending bucket) and M-19 (same provisional-absent semantics). |
| M-27 | Team Directory avatar column (UI) | Medium | **Broken/partial avatar for 1 of 4 team members, with no fallback** — 3 of 4 team members render photos; the 4th shows a pale circle with a small black arc - not initials, not a generic icon. The header avatar is a solid purple circle with no initials. The task-comment author fallback does render 'AH' initials, so fallback behaviour is inconsistent across surfaces. | Robust avatar fallback: render initials (or a generic icon) whenever a photo fails to load; apply one fallback component everywhere (header, directory, comments). | browser observation, Team Directory + header + task comments. Whether the 300s signed-URL expiry (M-13) contributes is NOT VERIFIED. |
| M-28 | Member Profile page (UI, full-page tab) | High | **Profile page exposes sensitive PII field names (DOB, blood group, father's/spouse names, personal email)** — The member profile page (a full-page tab, not a drawer) exposes field names including DATE OF BIRTH, GENDER, MARITAL STATUS, BLOOD GROUP, FATHER'S NAME, SPOUSE NAME under PERSONAL PROFILE, and PERSONAL EMAIL, EMERGENCY CONTACT, ADDRESS DETAILS under WORK & CONTACT PROFILE. Field names only - no values are reproduced in this report. PAN/UAN fields were not observed on the profile page; their UI presence is NOT VERIFIED. | Role-scoped field filtering on the profile view: gate DOB, blood group, father's/spouse names, personal email and address details behind HR-only access (same fix as M-03). | browser observation, Member Profile page (field names only). UI-confirms M-03. |
| M-29 | Payslips screen (UI) | Medium | **Payslip NET < GROSS with DEDUCTIONS of zero, unexplained** — Payslips render amounts with the rupee symbol, commas and 2 decimals, but NET is less than GROSS while DEDUCTIONS shows zero, with no visible breakdown explaining the difference. Amount values are withheld from this report (formats only). | Show the deduction/LOP breakdown that explains NET < GROSS, or correct the deductions figure so the arithmetic is transparent. | browser observation, Payslips screen (formats only, amounts withheld). |
| M-30 | Team Cost dialog (UI) | Medium | **Team Cost dialog: member cells blank, STATUS 'N/A' for all 4** — In the Team Cost dialog, TEAM MEMBER cells are all blank and STATUS reads 'N/A' for all 4 members, while UNPAID DAYS shows '2d across the team'. The dialog renders no identifiable member rows. | Populate member names in the dialog; resolve STATUS instead of 'N/A'; explain how the unpaid-days rollup is computed. | browser observation, Team Cost dialog. |
| M-31 | Leave Team History card (UI) | Low | **Clicking a leave card opens no detail modal** — Clicking the leave card in Team History opened no detail modal or drawer; there is no in-place way to inspect the request's fields. No approver field appears anywhere in the leave UI. | Wire card click to a detail drawer/modal with the request fields, or remove the click affordance. | browser observation, Leave Team History. |
| M-32 | Member Leave tab history (UI) | Low | **Leave history briefly flashes 'No History Found' before data loads** — The member Leave tab history briefly flashes the empty-state text 'No History Found' before the data loads and renders. Consistent with the slow member-leave-requests endpoint (4.34s, M-10); causation NOT VERIFIED. | Show a skeleton/loading state instead of the empty-state text until the fetch resolves. | browser observation, Member Leave tab. |
| M-33 | Anomalies / Flags screen (UI, sidebar 'Flags') | Low | **Flags details truncated, with no status pill or resolution column** — The Flags screen has 1 row: 'Unauthorized absence', Severity High, with DETAILS truncated (ellipsis). Columns are only EMPLOYEE / DATE / FLAG / SEVERITY / DETAILS - no punch times, reviewer, worked_hours, or status pill/column. | Full-details tooltip or expandable row; add a status/resolution column. | browser observation, Anomalies/Flags screen. UI-confirms M-21 (no status field for flags). |
| M-34 | Manager Dashboard (UI) | Low | **Dashboard omits team-task section and pending-approvals counter** — The dashboard renders KPI counts but has no team-task section, no pending-approvals counter, and no tasks-needing-attention strip, even though the team-tasks and pending-leaves endpoints return data. | Add a tasks-needing-attention strip and a pending-approvals counter from the existing endpoints. | browser observation, Dashboard. |
## 4. Strategic UI/UX & Feature Enhancement Recommendations

1. **Managerial insights from existing API data:** Use team-graph daily avg_effective_hours + total_overtime_minutes + late_count to build a 'team load this week' strip; use trends current_streak + punctuality to flag members whose streak flipped; use member balances (carried_forward/lapsed_balance) to surface '3 members with leave expiring soon' once expiry dates are exposed; use task is_viewed + rework/reassignment counts for a 'tasks needing attention' queue.
2. **Micro-interactions & quick actions:** One-click approve/reject ribbons already have API actions - keep them read-safe in audit; standardize status pills (leave/task/attendance use different status vocabularies); show '+45m OT' style badges from overtime_minutes and late_minutes; add a policy tooltip from policy_snapshot (grace 15 min, full-day 7.45h) on attendance rows.
3. **Accessibility & responsive tweaks:** Partially observed in the browser lane: loading skeletons + 'Loading' text on most pages, spinner on the Daily Log dialog, real empty-state copy on empty queues; no error banners on app screens. Still NOT VERIFIED: color contrast of status pills, table horizontal scroll on small screens, focus states on approval actions.
4. **API consistency program:** Fix M-01/M-02/M-06/M-08/M-09 at the API layer first: one task source of truth, exclusive status buckets, one null convention, JSON numbers, one pagination envelope. These are cheaper than frontend workarounds and remove a whole class of rendering bugs.
6. **UI-lane defect fixes (M-25–M-34):** One source of truth for task priority/kind/due across views (M-25); one status vocabulary for dashboard vs directory (M-26); one avatar-fallback component (M-27); role-scoped profile fields (M-28); transparent payslip arithmetic (M-29); populated Team Cost dialog (M-30); leave-card detail modal (M-31); skeleton instead of premature empty-state flash (M-32); Flags full details + status column (M-33); dashboard task/approvals strip (M-34).

5. **Privacy hardening:** Implement M-03/M-24 field scoping before wider rollout: Manager role should not receive PAN/UAN/blood-group/DOB/addresses/phone; scope directory to visible team; strip stack traces (M-12) and credential material from URLs (M-13).

## 5. Console & Network Performance Audit

- **Network:** 38 captured GET calls — 36 × 200, 1 × 400 (bare `/organizations/employees` probe without the required `purpose` param — probe artifact, M-22), 1 × 403 (`/leaves/assignments` — expected RBAC, HR-scoped screen). An initial 22 × 401 round came from a login attempt using `email` instead of the API's `identifier` field (M-23); not a defect.
- **Timings:** median ≈ 1.9s. Slowest: `/attendance/trends` 11.55s (M-10); team-today 4.11s, member history 4.17s, member leave requests 4.34s.
- **Console:** NOT VERIFIED — no DevTools Console access in either lane (DevTools unavailable in the browser pass too). No console warnings, React key warnings, or unhandled rejections are claimed.
- **Browser-pass routing:** Guessed URLs (/requests/anomalies, /requests/flags, /payroll/payslips) returned the app 404 page; app links work. No error banners observed on app screens.
- **Error hygiene:** 401 bodies include full server stack traces (M-12).

## 6. Coverage & NOT VERIFIED items

- Row-level rendering of empty Requests queues (regularizations, comp-offs, overtime): queues were EMPTY at observation time, so row-level null/reviewer/worked_hours/is_resolved rendering is NOT observable.
- Browser console warnings, React key/hydration warnings, unhandled promise rejections (no DevTools access in either lane; DevTools unavailable in the browser pass).
- Which endpoints the Manager Requests screens (regularizations / comp-offs / overtime / inbox) and the Team Cost dialog use — endpoints NOT VERIFIED (DevTools unavailable).
- Whether policy snapshot variance (M-16) is point-in-time snapshotting or drift.
- Whether the UI passes the required `purpose` param to /organizations/employees (directory renders, but param-passing itself NOT VERIFIED).
- Whether PAN/UAN fields appear on the UI profile page (profile field names observed; PAN/UAN not among them — presence NOT VERIFIED).
- Whether the 300s signed-URL expiry contributes to the broken avatar (M-27).
- Causation between slow endpoints and the leave-history "No History Found" flash (M-32).
- Whether the UI Claims (Submitted) screen maps to the same endpoint as the API's 1 approved claim (UI shows EMPTY; endpoint mapping NOT VERIFIED).
- Grace_time / punch-timeline rendering: grace_time not observed anywhere; overtime rendered in Team History and Daily Log, omitted in Live Attendance; punch timelines NOT VERIFIED.
- Whether the UI shows the "final" vs "raw" leave/attendance buckets at summary level (history rows distinguish Weekly off/Holiday; summary bucket labels per API).
- Own trends / own-streak rendering (M-04, M-19 own-streak) — not observed in the browser pass.
- Whether the UI renders the team-graph chart data (graph-data endpoint rendering not observed).

## 7. Method, scope & safety

- Read-only: only GETs (plus 1 login POST). No approve/reject/submit/delete actions were taken; modal/submit buttons were never clicked on live data.
- Credentials transient: used only for the authorized inspection; never written to files, memory, or deliverables. Tokens redacted from every export (verified by scan: no token/password/secret values in capture files).
- Manager routes verified from the app's own JS bundle: `/dashboard/manager/*` (attendance, team, requests, tasks, payroll, settings). API base verified from the bundle: `https://development.hrclouds.in/api/v1`.
- Test data: values reflect the dev org's seed data (e.g., uniform leave balances, typos in seed text). Findings distinguish API behavior from seed-data artifacts where possible.
- Browser-observation lane: read-only pass in a live browser session (Manager role). No submit/approve/reject/delete actions were clicked. Screenshots were captured in-session for 16 requested names but are withheld from the package: the handoff bundle failed verification and several captures incidentally contain PII values. No screenshot files are included.
