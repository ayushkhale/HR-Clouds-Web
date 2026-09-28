# Frontend → Backend: Requests from the 28 Sep 2026 UI Review

**From:** Frontend (HR, manager and employee workspaces)
**To:** Backend (Documents, Attendance and Payroll modules)
**Date:** 2026-09-28
**Environment tested:** `https://development.hrclouds.in`. We used an HR login (all three workspaces) and, on 29 Sep, a real manager login (MNGR-001).

## Status — 29 Sep 2026

The backend shipped **R-1 to R-6** (`2026-09-28_backend_execution_report_for_frontend_requests.md`). The frontend now reads every new field, and still works on servers without them.

| # | Backend | Frontend |
|---|---|---|
| R-1 | Done | Reads `included_users` first; the title-parsing fallback stays for older servers |
| R-2 | Done | Reads `document_type_name` / `document_type_group` in the requests table and detail |
| R-3 | Done | No change needed |
| R-4 | Done | Sends `cancellation_reason`; HR, manager and employee detail views show it |
| R-5 | Done | Avatars read `gender` from `user.employee_profile` / `manager_profile` / `hr_profile` |
| R-6 | Done | `has_employee_record: false` shows "no required-documents list", never a 100% score |
| **R-7** | **Open** | Not in the execution report: days before joining still count as absent. Also reproduced on the employee's own graph data (29 Sep, see R-7). The employee dashboard now works around it using `joining_date` |
| **R-8** | **Open** | Not in the execution report: comp-off summary shape and `credit_days` |
| **R-9** | **Open (new, 29 Sep)** | Documents that ask for nothing are counted as "needs you". Raised during the employee-panel review |

**Not deployed yet.** At 29 Sep 2026, `https://development.hrclouds.in` (the dev proxy target) still serves the old responses for all six. We checked #140, #82/#94, M1/M14/M17, #98, and the M1/M3 profiles. The frontend was verified against the report's response shapes by rewriting the responses in the browser. Please deploy, and tell us, so we can re-test for real.

## Summary

We reviewed every screen in the running app. Eight problems can't be fixed properly on the frontend, because the data they need isn't in the response or the response is wrong. Each is listed below against the exact API.

| # | Priority | Module | API | What we need |
|---|---|---|---|---|
| R-1 | **High** | Documents | `GET /api/v1/documents/hr/letters` (#140) | Return each letter's recipient in the list |
| R-2 | **High** | Documents | `GET /api/v1/documents/manager/document-requests` (#94) | Return the document type's name on each request row |
| R-3 | Low | Attendance | `GET /api/v1/attendance/manager/team/summary` (M14), `GET …/team/graph-data` (M17), `GET …/team/today` (M1) | Scope these three the same way for the same caller |
| R-4 | Medium | Payroll | `POST /api/v1/payroll/hr/encashments/:id/cancel` (#211) | Accept and store a cancellation reason, or confirm there isn't one |
| R-5 | Low | Attendance | `user.profile` embedded in M1, M3, M11 and HR #37 | Add `gender` to the embedded profile |
| R-6 | **Medium** | Documents | `GET /api/v1/documents/me/checklist` (#98) | Stop returning `404` for managers and HR — it fails even for a manager **with** an employee record |
| R-7 | **High** | Attendance | `GET /api/v1/attendance/manager/team/member/:userId/summary` (M16), `…/history` (M15) | Don't count days before the joining date as absent |
| R-8 | Medium | Attendance | `GET /api/v1/attendance/comp-offs/mine/summary` (#20), M11, HR #37 | Document the summary shape; send credit days on comp-off rows |
| R-9 | **High** | Documents | `GET /api/v1/documents/me/hr-documents` (#70), `GET /api/v1/documents/me/documents/all` | Don't mark a document "needs you" when it asks for neither acknowledgement nor signature |

Every request is **additive**: no existing field changes meaning, so nothing that works today breaks.

"Frontend ready" means the screen already reads the new field and falls back to today's behaviour while it's missing. Shipping it needs no frontend release.

---

## R-1 · Letters register: recipient missing from the list (High)

**API:** `GET /api/v1/documents/hr/letters` · Registry **#140** · role `hr`

**Today:** each list item has `recipient_count` but no recipient. Only the detail read, `GET /api/v1/documents/hr/letters/:id` (#141), returns `included_users`. This matches `md_pdfs/phase2_api_analysis.md`, where #140's item example has no `included_users`.

```json
// #140 item, captured 28 Sep 2026
{
  "id": "59498548-…",
  "reference_number": "COMPUNICPVTLTD/CNF/2026-2027/0001",
  "title": "Confirmation Letter — Rishi Ganeshe",
  "recipient_count": 1,
  "published_at": "2026-09-28T13:40:35.517Z"
  // no included_users, no subject_user_id
}
```

**Impact:** the register's "Issued to" column had nothing to show and fell back to "A colleague" for every letter. We can't fetch #141 once per row, because a 20-row page would mean 20 extra requests.

**What we need:** add `included_users` to each #140 item, with the same shape as #141.

```json
"included_users": ["9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"]
```

**Frontend today:** until this ships, we take the person's name from the generated title, the text after `" — "` (`letterRowParts()` in `shared/documents/letterIssueMeta.js`). That works only while titles keep the `"<Letter> — <Person>"` pattern. A renamed or edited title would break it.

**Frontend ready:** **Yes.** `included_users` is already preferred over the title the moment it appears.

---

## R-2 · Manager document requests: type name missing (High)

**API:** `GET /api/v1/documents/manager/document-requests` · Registry **#94** · roles `manager, hr`
**Related:** `GET /api/v1/documents/manager/types` (#25)

**Today:** request rows carry only `document_type_id`. The manager resolves names from #25, but #25 returns only the types a manager may view. So a request HR raised for any other type (Aadhaar Card in our data) has no name anywhere the manager can read.

```json
// #25 for this manager: one type only
{ "data": [{ "id": "de3369e4-…", "name": "PAN CARD", "manager_can_view": true }] }

// #94 row: its type is not in the list above
{ "id": "cd4ead68-…", "user_id": "170fc953-…", "document_type_id": "52d9720b-7d22-4882-8152-f3bdfe0f3916",
  "status": "fulfilled", "requested_by_role": "hr" }
```

HR sees the same row as **"Aadhaar Card · Identity"**. The manager saw **"A document · Document"**.

**What we need:** add these fields to each #94 row, and to any manager endpoint that returns a single request:

```json
"document_type_name": "Aadhaar Card",
"document_type_group": "identity"
```

**If hiding the type is intentional:** tell us, and we'll keep today's wording. The row now reads "A document HR asked for · Only HR can see which kind".

**Frontend ready:** No. It's a one-line change to prefer the row's name, and we'll ship it once the field lands.

---

## R-3 · Manager attendance endpoints disagree on scope for HR tokens (Low)

**APIs** (Attendance – Manager Operations; roles `manager, hr, admin`):
- `GET /api/v1/attendance/manager/team/today` · **M1**
- `GET /api/v1/attendance/manager/team/summary?date=YYYY-MM-DD` · **M14**
- `GET /api/v1/attendance/manager/team/graph-data?month=&year=` · **M17**

**Today:** with an HR token, the same dashboard gets two different scopes.

```json
// M14: team/summary?date=2026-09-28
{ "team_size": 0, "counts": { "present": 0, "absent": 0, … }, "members": [] }

// M17: team/graph-data?month=9&year=2026
{ "team_summary": {}, "daily": [] }

// M1: team/today returns 6 records, organisation-wide
```

**Impact:** on the manager dashboard, "Team today" shows 0 members and 0 present. The card beside it, built from M1, shows the IT Department with 4 members at 75% present, and the trend chart is empty.

**What we need:**
1. The same scope for all three endpoints, for the same caller.
2. Tell us which scope HR gets on `/attendance/manager/*`: HR's own direct reports, or the whole organisation.
3. **Update 29 Sep:** with a real manager token (MNGR-001) all three agree: 4 team members, 3 present, and the graph has data. So this only affects HR tokens calling `/attendance/manager/*`. Lower priority than first thought, but point 2 still needs an answer.

**Frontend ready:** nothing to change once the scopes agree.

---

## R-4 · Encashment cancel: is there a reason field? (Medium)

**API:** `POST /api/v1/payroll/hr/encashments/:id/cancel` · Registry **#211** · role `hr`

**Today:** `phase7_api_analysis.md` says **"Request JSON Payload: None."** But the Encashments screen asks HR for a reason (at least 5 characters) and sends:

```json
{ "reason": "…" }
```

So either the reason is silently thrown away, or the call is refused as an unknown key. Neither is acceptable when we make HR type it.

**What we need.** Choose one:
- **(a) Preferred.** Accept an optional `cancellation_reason` (string, 1–1000 characters). Store it, write it to the audit log, and return it on the encashment read. That name matches the other cancel endpoints: #199 cancel exit and #106 cancel run.
- **(b)** Confirm the endpoint takes no body. We'll then remove the reason prompt and ask for a plain confirmation instead.

**Frontend ready:** For (a), we switch the field name to `cancellation_reason`, a one-line change in `payroll.api.js`. For (b), we remove the prompt.

---

## R-5 · Gender missing from embedded person profiles (Low)

**APIs**, all captured with HR and manager tokens:

| Registry | API |
|---|---|
| Attendance M1 | `GET /api/v1/attendance/manager/team/today` |
| Attendance M3 | `GET /api/v1/attendance/manager/team/anomalies` |
| Attendance M11 | `GET /api/v1/attendance/manager/comp-offs/pending` |
| Attendance HR #37 | `GET /api/v1/attendance/hr/comp-offs` |

**Today:** each row embeds `user.profile` with `first_name, last_name, display_name, avatar_url`, but no `gender`.

**Impact:** every avatar in the app picks a male or female illustration from `gender`, and shows purple initials when it's missing. The same person appeared as an illustration on Team but as "PP" on Live Attendance, Flags and Earned Leave. We now fill `gender` in from `GET /api/v1/organizations/employees` (#8). But #8 is limited to `super-admin, admin, hr, manager`, so employee-facing lists can't use that fix.

**What we need:** add `gender` to the shared `user.profile` projection used by these endpoints. Ideally add it everywhere that projection is embedded.

```json
"user": { "id": "…", "profile": { "first_name": "…", "last_name": "…", "display_name": "…", "avatar_url": null, "gender": "male" } }
```

**Frontend ready:** **Yes.** The avatar already reads `profile.gender` and stops calling #8 when it's present.

---

## R-6 · `/documents/me/checklist` returns 404 for managers and HR (Medium)

**API:** `GET /api/v1/documents/me/checklist` · Registry **#98** · `any tenant role`

**Today:** both an HR login and a **manager who has an employee record** (Ravi Kumar, `MNGR-001`, IT Department) get:

```json
404 { "success": false, "message": "Employee not found", "errorCode": "USER_NOT_FOUND" }
```

We first thought this only affected logins with no employee record. The manager case shows it isn't. #98 appears to look the caller up in employee profiles only, so every manager and HR user gets it. This response isn't documented for #98, and the endpoint is open to any tenant role.

**Impact:** managers and HR can never see the documents their own job requires. **My Document Requests** shows an empty checklist, and we used to tell them "your login isn't set up as an employee record", which is false for managers. That copy has been changed to a neutral "No checklist to show yet".

**What we need:**
1. Resolve the caller through all profile types (employee, manager, HR), the same way #139 resolves a letter's subject.
2. For a login that genuinely has no record, return `200` with an empty checklist and a flag:

```json
{ "success": true, "data": { "items": [], "has_employee_record": false } }
```

**Frontend ready:** **Partly.** The 404 is handled gracefully today. Reading `has_employee_record` is a small change we'll make once it ships.

---

## R-7 · Days before joining are counted as absent (High)

**APIs:**
- `GET /api/v1/attendance/manager/team/member/:userId/summary?month=&year=` · **M16**
- `GET /api/v1/attendance/manager/team/member/:userId/history?from=&to=` · **M15**

**Today:** Aditya Patidar (`EMP-02`) **joined on 12 Sep 2026**. For September:

```json
// M16 summary
{ "present_days": 14, "absent_days": 11, "weekly_off_days": 3, … }

// M15 history, 1–12 Sep
2026-09-01 absent   …   2026-09-06 absent   …   2026-09-11 absent
2026-09-12 present
```

Every day from 1 to 11 Sep is `absent`, including Sunday 6 Sep, which is a weekly off. Those 11 days are exactly the "11 days absent" on his profile.

**Impact:** a person who hasn't missed a single working day shows **11 days absent** on the manager's Overview tab. Anyone reading it would conclude they have an attendance problem. The same numbers feed the absent bar on the dashboard charts, so every new joiner makes their team's month look worse.

**What we need:**
1. Days before `date_of_joining` (and after a leaving date) are not attendance days. Either leave them out of `records` and the summary counts, or return a distinct status such as `not_joined` that isn't counted in `absent_days`.
2. Please check the HR equivalents and the dashboard graph aggregates (M17, HR graph data) for the same rule. We only reproduced it on M15/M16.

**Also on the employee's own graph data (29 Sep):** `GET /api/v1/attendance/graph-data?month=9&year=2026` for Rishi Ganeshe (`EMP-06`, `joining_date` 2026-09-12) returns 1–11 Sep as `absent`, Sunday 6 Sep included, so `summary.absent_days` is **12**. `GET /api/v1/attendance/summary` for the same month says **1**. The dashboard's "Attendance mix" and My Attendance disagreed by 11 days. Until this is fixed, the employee dashboard drops days before `joining_date` (from `/organizations/me`) and subtracts them from `absent_days`. That workaround comes out once the server stops counting them.

**Frontend ready:** For a `not_joined` status we'd add a label and grey styling; that's a small change. If the days are simply left out, nothing is needed.

---

## R-8 · Earned leave (comp-off) payloads (Medium)

**APIs:**
- `GET /api/v1/attendance/comp-offs/mine/summary` · Registry **#20** · `all`
- `GET /api/v1/attendance/manager/comp-offs/pending` · **M11**
- `GET /api/v1/attendance/hr/comp-offs` · HR **#37**
- `GET /api/v1/attendance/comp-offs/mine` · Registry **#19**

**Today, part 1 (summary shape):** the contract marks #20 "not exhaustively verified". The live response is counts by status:

```json
{ "earned": 0, "approved": 1, "used": 0, "expired": 0, "cancelled": 0, "redeemable": 1, "total": 1 }
```

The screen was written against `available_balance`, `total_earned`, `used_days`, `expired_days`, so every card showed **0** while the history listed an approved day. We now read `redeemable` / `earned` / `used` / `expired`.

**What we need:** confirm these keys are the contract, and confirm whether they are **record counts** or **days**. A day worked for a half-day credit would make those different, and the card is labelled as a balance.

**Today, part 2 (no credit on rows):** no comp-off row in #19, M11 or #37 carries how many days it credits. We checked for `days_earned`, `credit_days`, `days`, and `comp_off_days`. So "Credit" was a column of "N/A" on all three pages. We now hide the column until a row has a value.

**What we need:** add `credit_days` (number, e.g. `1` or `0.5`) to every comp-off row, and `expiry_date` once it's known. M11's pending rows also have no `expiry_date`, which is fine if expiry is set on approval — please confirm.

**Frontend ready:** **Yes.** The Credit column comes back automatically as soon as `credit_days` is present.

---

## R-9 · Documents that ask for nothing are counted as "needs you" (High)

**APIs:**
- `GET /api/v1/documents/me/hr-documents` · **#70** (and its `compliance_state=pending` count)
- `GET /api/v1/documents/me/documents/all` (the Document Home feed)

**Today:** Rishi Ganeshe (`EMP-06`) has two letters, "Confirmation Letter — Rishi Ganeshe" and "Appointment Letter — Rishi Ganeshe". Both are already opened. On each document:

```json
"requires_acknowledgement": false, "requires_signature": false,
"acknowledgement": { "required": false, "signature_required": false, "state": "pending", … }
```

Even so:
- `#70?compliance_state=pending` counts both, so **Needs you = 2**.
- The Document Home feed returns both with `"requires_action": true, "action": "acknowledge"`.

**Impact:** the employee's Document Home says "2 things need something from you" and tags both letters **Read & confirm**. The same letters on My Company Documents say "For your information · Opened". Nothing can clear the prompt, because there is nothing to acknowledge.

**What we need:** when a document requires neither acknowledgement nor signature, don't count it as `pending`. Treat it as `completed` or not applicable once it's opened, or never pending at all. Don't send `requires_action: true` for it on the Document Home feed. `acknowledgement.state` should probably not be `pending` when `required` is `false`.

**Frontend ready:** **Yes.** Both screens show the server's verdict as-is; we deliberately don't recompute compliance on the client, so it corrects itself when the server does.

---

## For information: fixed on our side, no action needed

These were frontend bugs. We're listing them so nobody chases them on the server.

- **`POST /payroll/hr/exits/:id/cancel` (#199):** we sent `reason` instead of `cancellation_reason`, so every cancel failed with `400 "cancellation_reason" is required`. Fixed.
- **`POST /payroll/hr/encashments/:id/reject` (#210):** we sent `reason` instead of `rejection_reason`. Fixed.
- **`GET /attendance/manager/team/today` (M1):** we read `shift` instead of `shift_snapshot`, so the Shift column showed "N/A". Fixed; the response was correct all along.
- **`GET /documents/hr/catalog` (#1):** per your 28 Sep guidance, it's now called with no default query parameters.
- **`GET /documents/me/documents` (#3):** we sent `status` twice (`available` and `pending_verification`), which the validator rejects with `400 "status" must be a string`. The leave form's "attach one of your documents" picker never loaded. We now fetch without `status` and filter on our side. A comma list returns **500** (`invalid input value for enum`), which is worth turning into a 400.
- **`GET /payroll/me/annual-statement` (#192) and HR #183:** we read `period_month`, `status: "empty"` and `ytd_totals`. The live reply uses `month`, all-null months and `totals`. Every cell read N/A. Fixed on both screens.
- **`GET /payroll/me/tax/projection`:** we read flat keys (`projected_gross`, `total_tax`…). The live reply nests them (`annual_projected`, `tax`, `tds`) and says `income_tax_enabled`. Fixed. The shape for when income tax **is** enabled isn't in any doc we have. Please document the `tax` and `tds` blocks; we read `tax.taxable_income`, `tax.total_liability`, `tax.standard_deduction` and `tds.this_month`, with fallbacks.
- **`GET /attendance/shift` (U13):** the punch card read the shift's name off the `{ assignment, shift, … }` wrapper, so the shift line was blank on every dashboard. Fixed.
