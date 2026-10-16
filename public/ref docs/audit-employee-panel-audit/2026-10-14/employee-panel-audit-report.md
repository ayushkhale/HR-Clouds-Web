# HR Clouds — Employee Panel Frontend & UI/UX Audit Report

**Role audited:** Employee · **Account:** rishi@gmail.com (test account) · **Organisation:** HR-Vista Soft Solutions Private Limited (role `employee`)
**Environment:** https://frontend.dev.hrclouds.in/ · **API base:** https://development.hrclouds.in/api/v1
**Audit date:** 2026-10-14 (IST) · **Method:** Read-only. Live-browser UI walkthrough (no form submitted, no punch, no download clicked; modals opened and Cancel-closed) + direct read-only API capture (1 login POST + 1 org-selection POST + GETs only).
**Note on the second workspace:** the account belongs to 2 orgs, both role `employee`. This audit covers HR-Vista only; Compunic Private Limited was not audited.
**Privacy:** PAN, UAN, contact numbers, addresses, dates of birth and bank identifiers are redacted from all deliverables (`[REDACTED PII]`). Stored script-text payloads are described, not reproduced. Tokens/credentials were transient and are not stored anywhere in this package.
**Companion files:** `network-capture.json` (55 redacted records), `api-ui-data-mapping.json`, `findings/*.md` (24 findings), `evidence/regularizations-duplicate-rows.png`, `employee-panel-findings.xlsx`.

---

## 1. Executive Summary & Health Score

- **Overall UI/UX Score (1–10): 6** (browser assessment; consistent with findings below)
- **API Data Utilization Score (1–10): 5** — the API returns far more employee-centric data than the UI shows (shift/grace/policy detail, trends, weekly calendar, statutory breakdown, tax projection, anomalies, hierarchy), while several rendered numbers contradict their own detail endpoints.
- **Top 3 Critical Frontend Issues:**
  1. **Stored script-text payloads** in profile address and a leave reason reach the UI as raw markup (E-01, Critical/security).
  2. **Negative effective hours** (`-0.04`) with a formatted **`-1h 58m`** duration and an `absent` status on a day with punches (E-02).
  3. **Sick Leave balance does not add up** — 10 accrued − 2 used shows as balance 10 (E-03).
- **Top 3 High-Value UI/UX Enhancement Opportunities:**
  1. **Shift progress bar + live countdown** from the shift/grace/policy data the API already returns.
  2. **Leave balance breakdown cards** (accrued / used / pending / carried-forward) with a progress ring, document-threshold and sandwich-rule hints.
  3. **Anomalies inbox with one-tap regularization** — 96 unresolved anomalies currently sit behind a plain list.

**Headline counts:** 52 swept endpoints (40+ ×200) + 3 detail/PDF checks = 55 captured records. **24 findings:** 1 Critical, 6 High, 12 Medium, 5 Low (counting E-01 Critical; E-02–E-07 High; E-08–E-19 Medium; E-20–E-24 Low). No data was created, modified or deleted. Console errors and per-action DevTools network timelines are **NOT VERIFIED** (no DevTools in tooling) — see §5.

**What is genuinely good:** login + org selection work cleanly; the payslip PDF endpoint works (200, 92,908 bytes, correct filename); most employee endpoints return 200 with rich, well-shaped payloads; the Sep payslip carries an honest `not_applied` statutory note in the API; the tax projection correctly applies rebate 87A (zero liability is legitimate, not a bug).

---

## 2. Page-by-Page Audit & API Parity

### 2.1 Employee Dashboard & Punch Widget — `/dashboard/employee`

- **Triggered API Endpoints:** `GET /attendance/today`, `GET /attendance/shift`, `GET /attendance/summary?month&year`, `GET /leaves/my-balances`, `GET /attendance/holidays`
- **Data Parity Analysis:**

| Backend API Key | Backend Value | Frontend Rendered Value | Status |
| :--- | :--- | :--- | :--- |
| `today.status` | `absent` (with punches) | Absent | Bug (see E-02) |
| `today.effective_hours` | `-0.04` | Negative / contradictory duration | Bug (E-02) |
| `today.shift.{start,end}_time` | `09:30:00` / `18:30:00` | Shift times shown; no progress bar / countdown | Ignored |
| `shift.policy` (via overtime record) | grace 15 min, full-day 7.5 h, half-day 4.5 h | Not shown | Ignored |
| `summary.attendance_percentage` | `66.67` | Shown without explanation of `final_*` counts | Partial |
| `summary.final_leave_days` | `12` (includes holidays + weekly offs) | Shown as leave | Bug (E-21) |

- **UI/UX Observations:** summary cards exist but do not explain their inputs; no live timer, shift progress, or break state from `active_break`/`breaks`.
- **Backend Data Utilization Suggestion:** render a shift progress bar (09:30 → 18:30, Asia/Kolkata), a live "time remaining" countdown, grace-period indicator (15 min), and a break timeline from `breaks[]`. Add a streak/punctuality widget from `/attendance/trends` (current streak, punctuality, avg hours).

### 2.2 My Attendance & Logs — `/dashboard/employee/attendance` (+ anomalies / comp-offs / overtime / regularizations)

- **Triggered API Endpoints:** `GET /attendance/history`, `GET /attendance/daily-log`, `GET /attendance/graph-data`, `GET /attendance/weekly-calendar`, `GET /attendance/trends`, `GET /attendance/anomalies/mine`, `GET /attendance/regularizations`, `GET /attendance/overtime/mine`, `GET /attendance/comp-offs/mine`
- **Data Parity Analysis:**

| Backend API Key | Backend Value | Frontend Rendered Value | Status |
| :--- | :--- | :--- | :--- |
| `daily-log.worked_duration_formatted` | `-1h 58m` | Negative duration | Bug (E-02) |
| `history[2026-10-03].status / effective_hours / late_minutes` | `half_day` / `0` / `322` | Half-day row | Bug (E-24) |
| `anomalies.total` | `96`, all unresolved | List, no resolution flow | Ignored |
| `regularizations` | 15, incl. 3 identical 31 Dec 2026 rows | Duplicated rows visible | Bug (E-11) |
| `overtime` | 90 min + `early_exit_minutes` 30, same record | Not reconciled | Bug (E-24) |
| `comp-offs summary` | All zeros | Blank counters | Partial (E-17/E-30) |
| `trends.punctuality_percentage` | `87.8` vs summary `83.33` | Not shown / conflicting | Bug (E-23) |
| `weekly-calendar` | Week 12–18 Oct, total 7.6 h (incl. −0.04) | Calendar | Partial |

- **UI/UX Observations:** calendar and lists render; regularization modal was inspected (fields present) and closed without submitting. Evidence screenshot: `evidence/regularizations-duplicate-rows.png` shows the duplicated 31 Dec 2026 and 1 Sep 2026 Cancelled rows.
- **Backend Data Utilization Suggestion:** one-tap "Regularize this anomaly" per anomaly row; geofence explanation for the 415 km out-of-bounds flags; weekly-calendar heatmap; punctuality/streak widget with one definition of punctuality.

### 2.3 My Leaves & Balances — `/dashboard/employee/leaves`

- **Triggered API Endpoints:** `GET /leaves/my-balances`, `GET /leaves/my-leave-types`, `GET /leaves/my-requests`
- **Data Parity Analysis:**

| Backend API Key | Backend Value | Frontend Rendered Value | Status |
| :--- | :--- | :--- | :--- |
| `balances[Sick].total_accrued / total_used / current_balance` | `10.00` / `2.00` / `10.00` | `10` available | Bug (E-03) |
| `balances[Annual]` | `15.00` / `4.00` / `11.00` | `11` | OK |
| `balances` breakdown | accrued / used / carried / lapsed | Single static number only | Ignored |
| `leave_types[].config` | accrual_type, probation 90 d (Paternity), doc threshold 3 (Sick), sandwich_rule | Not shown | Ignored |
| `requests` | 10 rows; 1 day-count mismatch | Table with status pills | Bug (E-10) |
| `requests[].reason` | Contains stored script-text (1 row) | Rendered as text | Critical (E-01) |
| `requests[].document_url` | `storage.example.com` placeholder | Link | Bug (E-16) |
| `leave_type.code` | `ECL_2026`, `PAT_2026` | Raw codes shown | Bug (E-20) |

- **UI/UX Observations:** balance cards are visually clear but single-number; status pills readable; Apply Leave form inspected and closed without submitting; no approver preview data, no pending-approval split, no document-threshold hint.
- **Backend Data Utilization Suggestion:** per-type progress ring (accrued → used → pending → available) + carried-forward/lapsed lines; leave calculator ("Nov 15–16 = 2 days, needs document if Sick > 3 days, sandwich rule applies for LWP"); pending-approval deduction preview before submit.

### 2.4 Payroll & Payslips — `/dashboard/employee/payroll/my-salary`, `my-payslips`, `tax`, `loans`, `reimbursements`

- **Triggered API Endpoints:** `GET /payroll/me/salary-structure`, `GET /payroll/me/salary-structure/history`, `GET /payroll/me/payslips`, `GET /payroll/me/payslips/{run_id}`, `GET /payroll/me/payslips/{run_id}/pdf`, `GET /payroll/me/tax/*`, `GET /payroll/me/loans`, `GET /payroll/me/adjustments`, `GET /payroll/me/bonuses`, `GET /payroll/me/benefits`, `GET /payroll/me/bank-account`, `GET /payroll/me/reimbursements/*`, `GET /payroll/me/encashments`
- **Data Parity Analysis:**

| Backend API Key | Backend Value | Frontend Rendered Value | Status |
| :--- | :--- | :--- | :--- |
| `salary.monthly_gross` | `118750.00` vs figures `125000.00` | Earnings 118750 vs Gross 125000 | Bug (E-08) |
| `statutory.pf_employee_amount` | `1800.00` | PF 1800 | OK; EPS split wrong (E-07) |
| `statutory.eps_amount` | `1800.00` (= PF, should be ~1250) | Not split | Bug (E-07) |
| `payslips[Sep].statutory_status` | `not_applied` | Not warned in list | Bug (E-05) |
| `payslips[Sep].figures.total_deductions` | `7733.19` | List shows `N/A` | Bug (E-15) |
| `payslips[Sep].figures.overtime_minutes / overtime_amount` | `60` / `0.00` | Not reconciled | Bug (E-24) |
| `tax.monthly[2026-09]` | All `0.00`, paid=true | PF 0 | Bug (E-04) |
| `tax.projection.hra_received / hra_exemption` | `0.00` / `0.00` (HRA is 31250) | Not shown | Bug (E-14) |
| `loans[0].outstanding + recovered` | `60747.58` > principal `60000` | Loan card | Bug (E-13) |
| `adjustments.upcoming` | 3× bonus 8000 + 3× recovery 2500 (Dec) | Upcoming list | Bug (E-06) |
| `benefits / reimbursements / encashments` | All empty | Empty tables | Partial |
| `payslip PDF` | 200, 92,908 bytes, `payslip_2026-09.pdf` | Download works | OK |

- **UI/UX Observations:** salary breakdown is readable; payslip detail exists; PDF works. Currency formatting was not flagged as broken in the UI pass; the defects here are value-level, not format-level.
- **Backend Data Utilization Suggestion:** statutory explainer (PF/ESI/PT split with the EPS correction), "why is my net pay this?" reconciliation (gross − LOP − deductions + reimbursements), tax planner from the projection (monthly TDS, rebate status, HRA exemption), loan amortisation schedule from the instalments endpoint, upcoming-adjustments de-duplicated timeline.

### 2.5 My Profile & Documents — `/dashboard/profile`, `/dashboard/employee/documents`

- **Triggered API Endpoints:** `GET /organizations/me`, `GET /documents/me/documents`, `GET /documents/me/hr-documents`, `GET /documents/templates`, `GET /organizations/me/job-profile` (404), `GET /organizations/profile` (404), `GET /documents/me` (404)
- **Data Parity Analysis:**

| Backend API Key | Backend Value | Frontend Rendered Value | Status |
| :--- | :--- | :--- | :--- |
| `me.current_address` | Stored script-text | Rendered as text | Critical (E-01) |
| `me.reporting_person_details.name` | Email address | Email shown as name | Bug (E-22) |
| `me.avatar_url` | `null` | Initials / placeholder | Partial |
| `me.employee_code` | `EMP=002` | Shown verbatim | Bug (E-22) |
| `documents` / `hr-documents` / `templates` | `total: 0` each | Empty repository | Bug (E-16) |

- **UI/UX Observations:** Edit Profile form inspected and closed without saving. No profile-completion percentage or missing-document flags are surfaced (the API does not return them either — a gap on both sides).
- **Backend Data Utilization Suggestion:** profile-completion meter + missing-document checklist; manager/department-head contact cards from `reporting_person_details` / `department_head_details`; document-request flow for the empty repository.

### 2.6 Company Calendar & Holidays — `/dashboard/employee/company`, `/dashboard/employee/org-chart`, `/dashboard/employee/company-documents`

- **Triggered API Endpoints:** `GET /attendance/holidays`, `GET /organizations/details`, `GET /organizations/hierarchy`, `GET /organizations/departments`, `GET /organizations/locations`
- **Data Parity Analysis:**

| Backend API Key | Backend Value | Frontend Rendered Value | Status |
| :--- | :--- | :--- | :--- |
| `holidays` | 16 rows; `Invalid Day Holiday`; Diwali/Dussehra `optional` | List | Bug (E-21) |
| `holidays` upcoming | Festival Holiday 15 Oct (public, tomorrow) | Not highlighted | Ignored |
| `hierarchy` | Real names available | Root name = email in places | Bug (E-22) |
| `details.stats` | dept 9 / locations 15 | vs lists 16 / 18 | Bug (E-23) |

- **UI/UX Observations:** holiday list renders; no optional-vs-mandatory filter, no countdown to the next holiday, no team birthday/anniversary widget observed.
- **Backend Data Utilization Suggestion:** "Next holiday in N days" countdown card; optional/mandatory filter; org-chart mini-widget ("Your manager", "Your team") from the hierarchy payload.

### 2.7 Tasks, Comp-offs, Reimbursements, Benefits (supporting modules)

- **Tasks** (`GET /tasks/me`): 3+ tasks render, including an injection-probe task (E-01) and a cancelled task; `is_viewed=true` with null `viewed_at` timestamps (E-24). Suggestion: task progress/comments from `comments_count`, due-date countdown.
- **Comp-offs** (`GET /attendance/comp-offs/mine*`): all zeros; blank counters (browser). Suggestion: "How to earn a comp-off" empty-state explainer.
- **Reimbursements** (`GET /payroll/me/reimbursements/*`): claims and categories both empty — the claim form has no categories to offer. Suggestion: seed categories or hide the form until categories exist.
- **Benefits** (`GET /payroll/me/benefits`): 0 enrollments, 0 deducted. Suggestion: benefits enrolment CTA instead of an empty table.

---

## 3. UI/UX & Data-Rendering Defects Log

Full detail per finding in `findings/*.md`. Summary:

| ID | Location / Component | Severity | Description | Expected Fix |
| :--- | :--- | :--- | :--- | :--- |
| E-01 | Profile address, leave reason, task description | Critical | Stored script-text / injection-probe payloads returned verbatim | Sanitise on write, encode on render, purge seed probes |
| E-02 | Attendance today / daily-log | High | `effective_hours -0.04`, formatted `-1h 58m`, `absent` with punches | Clamp at 0, flag insufficient punch |
| E-03 | Leave balances | High | Sick 10 − 2 shows balance 10 | Fix computation + invariant test |
| E-04 | Tax monthly | High | Sep paid but all tax fields 0; YTD = Aug only | Recompute Sep statutory/tax |
| E-05 | Payslip Sep | High | Statutory `not_applied`; net excludes PF/ESI/PT/TDS; `paid_at` null | Label prominently; consistent statutory |
| E-06 | Adjustments / bonuses upcoming | High | 3× identical bonus + 3× recovery; `TEST_PERF_BONUS` test row | Deduplicate; remove test rows |
| E-07 | Salary statutory / Aug payslip | High | EPS = PF (1800 / 696.77), should be 8.33% of PF wage | Compute EPS correctly |
| E-08 | Salary structure | Medium | `monthly_gross` 118750 vs figures 125000 | One gross definition |
| E-09 | Leave types / balances | Medium | Paternity balance for female-profile; ECL missing from applicable types | Eligibility filtering; single source |
| E-10 | Leave requests | Medium | Nov 15–16 = 2 days, `total_days` 1.00 | Validate days vs range |
| E-11 | Anomalies / regularizations / overtime | Medium | Future 31 Dec 2026 records, incl. approved | Reject/quarantine future dates |
| E-12 | Attendance breaks | Medium | 3 × ~1 s breaks stored as 1 min each; break 3 min > 23 s session | Store seconds; round at display |
| E-13 | Loans | Medium | Outstanding + recovered 60747 > principal 60000; next due stale May | Split principal/interest; sync schedule |
| E-14 | Tax projection | Medium | HRA received/exemption 0 despite HRA 31250; estimates 15L vs 7.9L | Feed HRA in; one definition |
| E-15 | Payslip list / tax page | Medium | Deductions `N/A` vs detail 7733.19; Tax PF 0 vs salary PF 1800 | Render from detail figures |
| E-16 | Documents | Medium | Repository 0/0/0; leave doc URL is `example.com` placeholder | Link real docs; validate URLs |
| E-17 | Anomalies | Medium | 96 total, all unresolved; 415 km out-of-bounds | Anomalies inbox + one-tap regularization |
| E-18 | API surface | Medium | 403 on 3 endpoints; 404 on 7 bundle paths | Scoped variants; prune dead paths |
| E-19 | Performance | Medium | Projection 6310 ms, graph 3652 ms, salary 3337 ms; slow UI loads | Budgets + caching + skeletons |
| E-20 | Labels / codes | Low | Raw `ECL_2026`/`PAT_2026`; `AI_RECHARGE` name mismatch; dup order 10; HRA `is_hra=false` | Display names; unique order |
| E-21 | Holidays | Low | `Invalid Day Holiday`; Diwali/Dussehra `optional`; holidays counted in `final_leave_days` | Clean seed data; fix counting |
| E-22 | Directory names | Low | Actor names = emails; `Solid Waste Managment` typo; `EMP=002` | Resolve names; fix spelling/code |
| E-23 | Counts / flags | Low | Dept 9 vs 16; locations 15 vs 18; hybrid vs office; punctuality 83.33 vs 87.8 | Single-source stats |
| E-24 | Cross-field flags | Low | Half-day 0 h + 322 late; OT 90 + early-exit 30; OT 60 min / ₹0; viewed without timestamps | Cross-field validation |

**Explicitly NOT bugs (to avoid false positives):** tax liability `0.00` is correct via rebate 87A (E-14); EMI `5233.19` maths checks out (E-13); Sep deduction total `7733.19` and Aug `8429.96` reconcile exactly to EMI + recovery (+ PF) — the defects are the statutory/duplicate/zero gaps around them, not the arithmetic.

---

## 4. Strategic UI/UX & Employee Experience (EX) Recommendations

1. **Self-service delighters:**
   - Shift countdown + progress bar (shift 09:30–18:30, grace 15 min, full/half-day thresholds 7.5 h / 4.5 h — all already in API).
   - One-tap regularization from each anomaly row, pre-filled with the anomaly's date/times.
   - Leave calculator with pending-approval preview, document-threshold and sandwich-rule hints.
   - "Next holiday" countdown (Festival Holiday, 15 Oct 2026) and optional/mandatory holiday filter.
2. **Design polish & micro-interactions:**
   - Skeleton loaders for the slow tax/projection/salary pages (E-19).
   - Animated punch-in confirmation + break timeline; clear status toasts (e.g. "Statutory pending — net pay is pre-statutory" on the Sep payslip).
   - Consistent empty states with a next action (request a document, how to earn a comp-off, enrol in benefits) instead of blank tables.
   - Always use display names, never raw codes (`ECL_2026` → "Executive Casual Leave") or emails as names.
3. **Mobile responsive optimisation:** calendar cells need large touch targets; attendance/leave tables should collapse to cards on small screens; the punch widget and one-tap regularization must be thumb-reachable. (Mobile layout was not directly measured — treat as a recommendation, not an observed defect.)
4. **Trust & transparency:** show the arithmetic wherever money or leave is involved (salary gross build-up, payslip reconciliation, leave breakdown, loan principal/interest split, tax projection inputs). Most High/Medium findings above are invisible-arithmetic problems, not visual ones.
5. **Data hygiene:** purge seeded probe/test rows (script-text, `TEST_PERF_BONUS`, `Invalid Day Holiday`, future 31 Dec records, duplicate adjustments) and add server-side invariants (balance arithmetic, non-negative hours, EPS formula, unique upcoming adjustments, no future attendance dates).

---

## 5. Console & Network Performance Audit

- **Network failures observed (API sweep, 55 records):** `403 Access denied` — `GET /leaves/types`, `GET /leaves/templates`, `GET /organizations/me/setup-status`. `404 Cannot GET` — `/comp-offs`, `/overtime`, `/regularizations` (bare), `/organizations/me/job-profile`, `/organizations/profile`, `/payroll/me/tax/regime`, `/documents/me`. All other swept endpoints returned 200. No 5xx observed.
- **Latency (single pass, slowest GETs):** tax/projection 6310 ms, tax/summary 3715 ms, graph-data 3652 ms, salary-structure 3337 ms, weekly-calendar 2907 ms, summary 2479 ms. Browser also reported slow page loads.
- **Console errors / warnings:** **NOT VERIFIED** — the live-browser tooling exposes no DevTools Console, and the API capture cannot observe client-side errors, hydration mismatches, unhandled rejections, failed assets or React warnings. Do not treat the absence of console findings here as "console is clean".
- **Duplicate requests per user action:** **NOT VERIFIED** (no DevTools network timeline).
- **Historical ranges beyond Oct 2026:** monthly history was verified for Oct 2026; other months were not swept (trends endpoint returned Aug–Oct summaries).
- **Payslip PDF:** verified working — `GET /payroll/me/payslips/{Sep-run}/pdf` → 200, `application/pdf`, 92,908 bytes, `payslip_2026-09.pdf`. PDF body was discarded, not saved.

---

## Appendix — Methodology & Scope

1. Fetched the SPA shell + JS bundles from `frontend.dev.hrclouds.in`; extracted the API base (`development.hrclouds.in/api/v1`), the Employee route map (`/dashboard/employee/*`) and the API client path inventory (attendance/leave/payroll/documents/tasks chunks).
2. Logged in via `POST /api/v1/auth/login` (`identifier` + password), then `POST /api/v1/auth/select-organization` with the HR-Vista `org_id` (Bearer selection token). The account requires org selection (2 orgs).
3. Swept 52 employee-relevant endpoints with GET only, plus 2 payslip-detail GETs and 1 PDF header check. Every response was recorded in `network-capture.json` (redacted).
4. Drove the live browser through every Employee route listed in §2, opened Apply Leave / Regularization / Edit Profile modals and closed them without submitting; clicked nothing that writes, punches, downloads or pays.
5. Cross-checked UI-rendered values (browser report) against API payloads field by field; every mismatch above was confirmed in at least one API response. Where the browser returned only a summary (its full per-page report was not delivered), UI-only claims are labelled as browser-observed and API-corroborated wherever possible; nothing was invented to fill gaps.
6. **Limits:** no DevTools console/network timeline; no mobile-device testing; no second-org (Compunic) comparison; single-pass timings; test/seed data — some defects may be seed-data artefacts rather than production code defects, but each is reported with the exact observed values so the team can triage.
