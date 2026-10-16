# Frontend → Backend: Requests from the 28 Sep 2026 UI Review

**From:** Frontend (HR, manager and employee workspaces)
**To:** Backend (Documents, Attendance and Payroll modules)
**Date:** 2026-09-28
**Environment tested:** `https://development.hrclouds.in`. We used an HR login and opened all three workspaces (HR, manager, employee).

## Summary

We reviewed every screen in the running app. Six problems can't be fixed properly on the frontend, because the data they need isn't in the response. Each is listed below against the exact API.

| # | Priority | Module | API | What we need |
|---|---|---|---|---|
| R-1 | **High** | Documents | `GET /api/v1/documents/hr/letters` (#140) | Return each letter's recipient in the list |
| R-2 | **High** | Documents | `GET /api/v1/documents/manager/document-requests` (#94) | Return the document type's name on each request row |
| R-3 | Medium | Attendance | `GET /api/v1/attendance/manager/team/summary` (M14), `GET …/team/graph-data` (M17), `GET …/team/today` (M1) | Scope these three the same way for the same caller |
| R-4 | Medium | Payroll | `POST /api/v1/payroll/hr/encashments/:id/cancel` (#211) | Accept and store a cancellation reason, or confirm there isn't one |
| R-5 | Low | Attendance | `user.profile` embedded in M1, M3, M11 and HR #37 | Add `gender` to the embedded profile |
| R-6 | Low | Documents | `GET /api/v1/documents/me/checklist` (#98) | Return `200` with an empty checklist instead of `404` when the caller has no employee record |

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

## R-3 · Manager attendance endpoints disagree on scope (Medium)

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
3. Confirm that a real `manager` token gets matching hierarchy scope on all three. We had no manager login, so we couldn't test this.

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

## R-6 · `/documents/me/checklist` returns 404 for a login with no employee record (Low)

**API:** `GET /api/v1/documents/me/checklist` · Registry **#98** · `any tenant role`

**Today:** an HR or manager login that has no employee profile gets:

```json
404 { "success": false, "message": "Employee not found", "errorCode": "USER_NOT_FOUND" }
```

This response isn't documented for #98. Because the endpoint is open to any tenant role, this is an expected state, not an error. At the moment it logs a failed request every time such a user opens **My Document Requests**.

**What we need:** return `200` with an empty checklist, plus a flag the screen can explain.

```json
{ "success": true, "data": { "items": [], "has_employee_record": false } }
```

**Frontend ready:** **Partly.** The screen already turns the 404 into "Nothing is required of you — your login isn't set up as an employee record", so users see nothing wrong. Reading `has_employee_record` is a small change we'll make once the field ships. Until then we keep handling the 404.

---

## For information: fixed on our side, no action needed

These were frontend bugs. We're listing them so nobody chases them on the server.

- **`POST /payroll/hr/exits/:id/cancel` (#199):** we sent `reason` instead of `cancellation_reason`, so every cancel failed with `400 "cancellation_reason" is required`. Fixed.
- **`POST /payroll/hr/encashments/:id/reject` (#210):** we sent `reason` instead of `rejection_reason`. Fixed.
- **`GET /attendance/manager/team/today` (M1):** we read `shift` instead of `shift_snapshot`, so the Shift column showed "N/A". Fixed; the response was correct all along.
- **`GET /documents/hr/catalog` (#1):** per your 28 Sep guidance, it's now called with no default query parameters.
