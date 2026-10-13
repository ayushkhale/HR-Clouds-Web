# 02 · Endpoint registry — every call the employee app makes

Paths are relative to the base URL (`…/api/v1`). Methods are exact. Every one of
these is authorised for **all org roles** unless noted — which is precisely why
the app needs its own role gate.

`✓` = used by a web employee screen today, verified in source.
`+` = available and worth using on mobile, not used on web.
`!` = carries a trap; see [05-contract-traps.md](05-contract-traps.md).

---

## Auth — `/auth`

| | Method | Path | Body / query | Notes |
|---|---|---|---|---|
| ✓ | POST | `/auth/login` | `{ identifier, password }` | `identifier` is email **or** phone. May answer `requires_org_selection` with a `selection_token` |
| ✓ | POST | `/auth/google` | `{ idToken }` | Login or auto-register. Use `@react-native-google-signin` to get the idToken |
| ✓ | POST | `/auth/forgot-password` | `{ identifier }` | → `{ requestId, identifier, identifierType, context }` |
| ✓ | POST | `/auth/forgot-password/verify` | `{ identifier, otp, context, requestId, newPassword }` | |
| ✓ | POST | `/auth/otp/resend` | `{ identifier, context, requestId }` | Invalidates the old `requestId`, returns a new one + `resendCount` |
| ✓ | POST | `/auth/select-organization` | `{ org_id }` | **Uses the selection token**, not the access token → `requestWithToken()` |
| ✓ | POST | `/auth/switch-organization` | `{ org_id }` | Uses the current access token. This is the one `/auth/*` route where a 401 **does** mean an expired session |
| ✓ | GET | `/organizations/me` | — | The signed-in person's profile. `authAPI.me()` points here deliberately — there is no `/auth/me` |

Signup (`/auth/signup`, `/auth/signup/verify`) exists but is **out of scope** —
an employee arrives by invitation.

---

## Attendance self-service — `/attendance`

No `/hr` or `/manager` segment appears anywhere in this app.

### Punch

| | Method | Path | Body | Notes |
|---|---|---|---|---|
| ✓ | POST | `/attendance/clock-in` | `{ source, latitude?, longitude?, client_timestamp?, notes?, work_mode?, metadata? }` | `source: 'mobile'` for this app. Errors: `ALREADY_CLOCKED_IN` 409, `PREVIOUS_SHIFT_OPEN` 409, `PERIOD_LOCKED` 403 |
| ✓ ! | POST | `/attendance/clock-out` | Same **minus `work_mode`** | Sending `work_mode` here is silently stripped. Errors: `NOT_CLOCKED_IN` 400, `PERIOD_LOCKED` 403 |
| ✓ | POST | `/attendance/break/start` | `{ source, notes? }` | Errors: `NOT_CLOCKED_IN`, `MAX_BREAKS_EXCEEDED` |
| ✓ | POST | `/attendance/break/end` | `{ source, notes? }` | Errors: `NOT_CLOCKED_IN`, `NO_ACTIVE_BREAK` |

`notes` ≤ 500 chars. `latitude` −90..90, `longitude` −180..180, both nullable —
**a punch without coordinates is accepted and flagged server-side, never
refused.**

### Today, history, insights

| | Method | Path | Query | Notes |
|---|---|---|---|---|
| ✓ ! | GET | `/attendance/today` | `date?` | **May return yesterday** when an overnight record is open. Always render from the returned `date` |
| ✓ ! | GET | `/attendance/history` | `from`, `to`, `page` (≥1), `limit` (1–100) | **`month`/`year` are NOT accepted** — build `from`/`to` with `monthRange()` |
| ✓ | GET | `/attendance/summary` | `month` (1–12), `year` (2000–2100) | Defaults to the current IST month. 14 keys, all verified |
| ✓ | GET | `/attendance/daily-log` | `date?` | An **object** (`record`, `logs`, `breaks`, `sessions`, `anomalies`), not an array |
| ✓ | GET | `/attendance/graph-data` | `month`, `year` | Daily bars for the dashboard chart |
| + | GET | `/attendance/trends` | `months` (1–12, default 3) | A nice mobile card the web dashboard doesn't use |
| + | GET | `/attendance/weekly-calendar` | `date?` | Week containing the date |
| ✓ | GET | `/attendance/shift` | — | Returns `{ assignment, shift, rotation, weekly_offs }` — **not a bare shift** |
| ✓ ! | GET | `/attendance/holidays` | **none** | No `year` parameter exists. Sending one is ignored. Filter client-side |

### Work mode and field sites

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/attendance/my-field-assignments` | The caller's own sites + contractual `work_mode` + `assigned_office`. **The only source for whether to show the work-mode toggle.** Returns `{ user_id, work_mode, assigned_office, total, records[] }` |

`work_mode` here is already normalised and fail-secure (a null contract reads as
`office`). Take the mode from here, never guess it from a punch record.

### Corrections (regularizations)

| | Method | Path | Body / query | Notes |
|---|---|---|---|---|
| ✓ | POST | `/attendance/regularization` → **201** | `{ date, requested_clock_in?, requested_clock_out?, reason, work_mode? }` | At least **one** of the two times is required. `reason` 5–1000 chars |
| ✓ ! | GET | `/attendance/regularizations` | `page`, `limit`, `status` | **`status` is validated and then ignored.** Fetch unfiltered, filter the loaded page client-side |
| ✓ | POST | `/attendance/regularizations/:id/cancel` | no body | Self-scoped. Errors: `FORBIDDEN`, `ALREADY_PROCESSED`, `NOT_FOUND` |

### Other self lists

| | Method | Path | Query | Notes |
|---|---|---|---|---|
| ✓ | GET | `/attendance/overtime/mine` | `page`, `limit` | **No status filter exists** |
| ✓ ! | GET | `/attendance/anomalies/mine` | `status` (`open｜resolved｜all`), `page`, `limit` | Records carry **`is_resolved` boolean**, not `status`. Use `anomalyStatusKey()` |
| ✓ | GET | `/attendance/comp-offs/mine` | `status` (`earned｜approved｜used｜expired｜cancelled`), `page`, `limit` | There is **no `rejected`** state — reject writes `cancelled` |
| ✓ | GET | `/attendance/comp-offs/mine/summary` | — | Balance aggregate |

---

## Leave — `/leaves`

| | Method | Path | Body / query | Notes |
|---|---|---|---|---|
| ✓ | GET | `/leaves/my-leave-types` | — | Active types tailored to the caller's per-user config |
| ✓ | GET | `/leaves/my-balances` | `year?` | The balance wallet |
| ✓ | GET | `/leaves/my-requests` | — | **Unpaginated**, ordered `created_at DESC` |
| ✓ | GET | `/leaves/requests/:id` | — | One request, must belong to the caller |
| ✓ | POST | `/leaves/request` | see below | Backend handles holidays / weekends / sandwich / unpaid days itself |
| ✓ ! | POST | `/leaves/requests/:id/cancel` | no body | Behaviour depends on the **date**, not the status — see the trap |

```js
// POST /leaves/request
{
  leave_type_id,                      // required
  start_date: 'YYYY-MM-DD',           // required
  end_date:   'YYYY-MM-DD',           // required
  is_half_day?: boolean,
  half_day_type?: 'first_half' | 'second_half',
  reason?: string,
  document_url?: string,              // a link the applicant pasted
  document_id?:  string,              // OR one of their own portal documents
}
```

**`document_url` and `document_id` are mutually exclusive — send one or
neither.** With `document_id` the server verifies the document belongs to the
applicant and is evidence-grade (`available` or `pending_verification`), then
stores the relative path `/api/v1/documents/attachments/:id/view-url` into
`document_url`. **That path is not a URL a client can follow** — route every
leave attachment through the attachment-view-url endpoint.

Holidays for the leave calendar come from `/attendance/holidays`, not from a
leave endpoint.

---

## Pay — `/payroll/me`

Every payroll self route lives under `/payroll/me`. There is no
`/payroll/self/...` form, whatever an older doc says.

### Salary and bank

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/payroll/me/salary-structure` | Current structure + `statutory_breakdown` |
| ✓ | GET | `/payroll/me/salary-structure/history` | Revisions, newest first |
| ✓ | GET | `/payroll/me/bank-account` | May be "nothing on file" — distinguish from "couldn't load" |
| ✓ ! | PUT | `/payroll/me/bank-account` | `account_type` must be exactly `savings` or `current`, **lowercase** |

```js
// PUT /payroll/me/bank-account
{ account_holder_name, bank_name, account_number, ifsc_code, branch_name, account_type }
```

### Payslips and statements

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/payroll/me/payslips` | A **held** payslip is indistinguishable from one that doesn't exist |
| ✓ | GET | `/payroll/me/payslips/:runId` | One payslip in full |
| ✓ | GET | `/payroll/me/payslips/:runId/pdf` | **Binary** → `files.js` |
| ✓ | GET | `/payroll/me/annual-statement` | `?financial_year=` |
| ✓ | GET | `/payroll/me/annual-statement/pdf` | **Binary** |
| ✓ | GET | `/payroll/me/encashments` | Leave Payouts |

### Tax

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/payroll/me/tax/summary` | "Income tax so far" |
| ✓ | GET | `/payroll/me/tax/projection` | Full-year projection |
| ✓ | GET | `/payroll/me/tax/monthly` | Month-by-month |
| ✓ | GET | `/payroll/me/tax/declarations` | Current declaration |
| ✓ | PUT | `/payroll/me/tax/declarations` | Upsert the whole declaration |
| ✓ | POST | `/payroll/me/tax/declarations/submit` | Locks it for HR verification |
| ✓ | PUT | `/payroll/me/tax/declarations/proofs` | Record proof references |
| ✓ | POST | `/payroll/me/tax/declarations/items/:itemId/attachments` | Request a presigned upload |
| ✓ | PUT | `/payroll/me/tax/regime` | Old ⇄ new regime |
| ✓ | GET | `/payroll/me/tax/form16/:financialYear` | |
| ✓ | GET | `/payroll/me/tax/form16/:financialYear/pdf` | **Binary** |

All tax endpoints take an optional `?financial_year=` (or `?fy=`) — pass it
explicitly rather than relying on the server's idea of the current year.

### Loans and variable pay

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/payroll/me/loans` | "Still to repay", "monthly repayment" |
| ✓ | GET | `/payroll/me/loans/:id/installments` | The schedule |
| ✓ | GET | `/payroll/me/bonuses` | |
| ✓ | GET | `/payroll/me/adjustments` | Backdated pay, corrections |

### Claims and benefits

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/payroll/me/reimbursements/categories` | Includes limits and headroom |
| ✓ | POST | `/payroll/me/reimbursements/claims` | Create a draft |
| ✓ | GET | `/payroll/me/reimbursements/claims` | `?status=&period=&page=&limit=` |
| ✓ | GET | `/payroll/me/reimbursements/claims/:id` | |
| ✓ | PUT | `/payroll/me/reimbursements/claims/:id` | **Replaces** the claim; send the whole thing |
| ✓ | POST | `/payroll/me/reimbursements/claims/:id/submit` | Draft → pending |
| ✓ | POST | `/payroll/me/reimbursements/claims/:id/cancel` | `{ cancellation_reason? }` |
| ✓ | POST | `/payroll/me/reimbursements/claims/:claimId/items/:itemId/attachments` | Presigned receipt upload |
| ✓ | GET | `/payroll/me/benefits` | Enrolments, contributions |

### Attachments (shared by claims and tax proofs)

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | POST | `/payroll/me/attachments/:attachmentId/confirm` | Call **after** the file reaches storage |
| ✓ | DELETE | `/payroll/me/attachments/:attachmentId` | |
| ✓ | GET | `/payroll/me/attachments/:attachmentId/view-url` | Short-lived signed URL. **Never cache it** |

**The presigned upload flow, in order** — this is the same three-step dance
everywhere in the app:

1. `POST …/attachments` with `{ file_name, content_type, file_size }` →
   `{ attachment_id, upload_url, … }`
2. `PUT` the bytes **directly to `upload_url`** — no Bearer token, no
   `api/client.js`. Use `fetch` or `blob-util` with the exact `Content-Type`
   you declared, or the signature fails.
3. `POST …/attachments/:id/confirm`

Miss step 3 and the attachment exists in storage but not in the record.

---

## Documents — `/documents/me` and `/documents/templates`

Three separate collections. They are **not** sub-paths of each other.

| Constant | Path | What it holds |
|---|---|---|
| `ME` | `/documents/me/documents` | Documents **I** uploaded about myself |
| `ME_ORG` | `/documents/me/hr-documents` | Company documents **issued to me** |
| `ME_SELF` | `/documents/me` | The Phase-4 self plane (requests, checklist) |
| `TPL` | `/documents/templates` | Blank forms, belonging to nobody |

### My own documents

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/documents/me/types` | Which types I may upload |
| ✓ | GET | `/documents/me/documents` | `?status=&type=&page=&limit=` |
| ✓ | POST | `/documents/me/documents` | Step 1 of upload → presigned URL |
| ✓ | POST | `/documents/me/documents/:id/confirm` | Step 3 of upload |
| ✓ | GET | `/documents/me/documents/:id` | |
| ✓ | GET | `/documents/me/documents/:id/versions` | |
| ✓ | GET | `/documents/me/documents/:id/view-url` | `?disposition=inline｜attachment` |
| ✓ | POST | `/documents/me/documents/:id/replace` | New version |
| ✓ | DELETE | `/documents/me/documents/:id` | |

### Company documents issued to me

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/documents/me/hr-documents` | |
| ✓ | GET | `/documents/me/hr-documents/:id` | |
| ✓ | GET | `/documents/me/hr-documents/:id/view-url` | |
| ✓ | POST | `/documents/me/hr-documents/:id/acknowledge` | Body is exactly `{ confirm: true }` |
| ✓ | POST | `/documents/me/hr-documents/:id/sign` | `{ signer_name }` |
| ✓ | GET | `/documents/me/hr-documents/:id/acknowledgement` | The evidence back |

### Requests and checklist

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/documents/me/document-requests` | What HR has asked me for |
| ✓ | GET | `/documents/me/checklist` | What's still missing |

### Everything of mine, in one read

| | Method | Path | Notes |
|---|---|---|---|
| ✓ ! | GET | `/documents/me/documents/all` | `?sections=&limit=` (limit ≤ 100). My documents + company documents + blank forms + payslips |

Two properties shape the UI:

1. **Each section can fail on its own**, arriving as
   `{ available: false, reason }` while the others are fine. **No section's
   failure may blank the screen.**
2. **No item carries a signed URL.** Each has `access.path` — the endpoint to
   call when the person actually taps it. That is why a 60-item home screen
   costs nothing and logs nothing until something is opened. Don't pre-fetch
   those URLs.

### Blank forms

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/documents/templates` | Published templates only |
| ✓ | GET | `/documents/templates/:id/download-url` | |

### Shared attachment bridge

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/documents/attachments/:id/view-url` | `?disposition=` . One stored path serves the applicant, their manager chain and HR; the server works out which you are. Anyone else gets a uniform 404 |

This is what a leave attachment resolves through. Never try to open
`document_url` directly.

---

## Organisation — `/organizations`

| | Method | Path | Notes |
|---|---|---|---|
| ✓ | GET | `/organizations/me` | My profile |
| ✓ | PUT | `/organizations/me` | Update my own editable fields |
| ✓ | POST | `/organizations/me/avatar/upload-url` | Presigned avatar upload |
| ✓ | POST | `/organizations/me/avatar/confirm` | |
| + | GET | `/organizations/me/setup-status` | Onboarding completeness — useful as a mobile nudge card |
| + | PUT | `/organizations/me/job-profile` | Self-serve job profile fields |
| ✓ | GET | `/organizations/details` | Company Profile screen |
| ✓ | GET | `/organizations/hierarchy` | Org Chart |
| ✓ | GET | `/organizations/directory` | `?search=&department=&page=&limit=` — **public-safe** colleague list |
| ✗ | GET | `/organizations/employees` | **HR and managers only — 403 for an employee.** Do not call it |

---

## Settings — `/settings`

| | Method | Path | Notes |
|---|---|---|---|
| + | GET | `/settings?modules=…` | Effective org settings. Useful to read feature switches, but **gate on what the data shows**, not on a settings guess |

Writes (`PUT /settings/groups/:key`) are HR-only. Don't build a UI for them.

---

## Maya (the ⓘ "Ask Maya" assistant) — external service

Not the HR Clouds gateway. `ENV.DOCMIND_API_URL`
(`https://api.codewithrishi.fun/api/public`) with `ENV.DOCMIND_API_KEY`.

- Streams over SSE. Connect timeout 20 s, idle timeout 30 s restarting on every
  chunk, both with an abort controller — a server that accepts the connection
  and goes quiet must not leave the widget on "Thinking…" forever.
- No API key → Maya is **absent**, and the ⓘ shows no "Ask Maya" link. Absent,
  not broken.
- The RAG backend emits a "could not find relevant information" sentinel;
  replace it with friendly copy rather than exposing it.
- `limits.maxQueryLength` (default 1000) is reported by the service. The ⓘ omits
  the link when the question exceeds it, rather than pre-filling a sentence cut
  off mid-word.
- **Maya never auto-sends.** A question is pre-filled; the person presses Send.
- Questions are static and conceptual. **Never** put a name, amount, balance,
  account number or id into one.

---

## Quick count

| Family | Endpoints used |
|---|---|
| Auth | 8 |
| Attendance | 20 |
| Leave | 6 |
| Pay | 33 |
| Documents | 20 |
| Organisation | 9 |
| **Total** | **≈ 96** |

Every one is already wrapped in `50-starter/src/api/`.
