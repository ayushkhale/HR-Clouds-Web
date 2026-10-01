# Frontend → Backend: Open Requests, 29 Sep 2026

**From:** Frontend (employee, manager and HR workspaces)
**To:** Backend (Attendance, Payroll, Documents, Organisation)
**Date:** 2026-09-29
**Supersedes nothing.** This carries forward the still-open items from
`2026-09-28_frontend_requests_to_backend.md` (R-1 … R-9) and adds ten requests
found since, each verified against the code as it stands today.

## How to read this

Every request is **additive**. No existing field changes meaning and no response
shrinks, so nothing that works today breaks when these ship.

Each item says what the frontend does **meanwhile**. "Frontend ready" means the
screen already reads the new field and falls back to today's behaviour while it
is missing — shipping it needs no frontend release. Where we had to build a
workaround, it is named, so it can be deleted once the endpoint exists.

We are not asking for anything that is only a documentation nicety unless it
changes what the UI is allowed to *say*. Three of these (F-6, F-7, F-9) are
questions, not code: we cannot write a sentence on screen that asserts behaviour
we cannot verify, so those screens currently say less than they should.

---

## 1. Carried forward from 28 Sep

| # | Status | Module | What we need |
|---|---|---|---|
| R-1 … R-6 | **Reported shipped, not yet observed** | Documents / Attendance / Payroll | The execution report says these are done; `https://development.hrclouds.in` still served the old responses when we last checked. Please deploy and tell us, so we can re-test against the real API instead of rewritten responses. |
| **R-7** | **Open — High** | Attendance | `GET /attendance/manager/team/member/:userId/summary` (M16), `…/history` (M15): days **before the joining date** are counted as absent. Also reproduced on the employee's own graph data. |
| **R-8** | **Open — Medium** | Attendance | `GET /attendance/comp-offs/mine/summary` (#20), M11, HR #37: document the summary shape; send credit days on comp-off rows. |
| **R-9** | **Open — High** | Documents | `GET /documents/me/hr-documents` (#70), `GET /documents/me/documents/all`: a document that asks for neither acknowledgement nor signature is still counted as "needs you". |

---

## 2. New requests

| # | Priority | Module | API | What we need |
|---|---|---|---|---|
| F-1 | **High** | Organisation | `GET /api/v1/organizations/me` | Return `org_name` (and `org_code`) for the signed-in organisation |
| F-2 | **High** | Documents | `GET /api/v1/documents/hr/letters/bulk` *(new)* | A way to list this org's recent letter batches |
| F-3 | Medium | Documents | `POST /api/v1/documents/manager/letters/proposals/:id/cancel` *(new)* | Let a manager withdraw their own pending proposal |
| F-4 | Medium | Payroll | `statutory_breakdown` on #18 / #29 / #33 | Enumerate `status`, reconcile `ctc_cost`, document `warnings[]` |
| F-5 | Medium | Payroll | Payroll list endpoints (gap **G-2**) | Support `?include=employee` so lists stop needing a lookup per row |
| F-6 | Medium | Attendance | `POST/PUT /api/v1/attendance/hr/holidays` | Define what `type` (`public`/`optional`/`restricted`) actually changes |
| F-7 | Medium | Payroll | `POST /api/v1/payroll/hr/employees/:userId/encashments` (#206) | Confirm which settings decide a standalone leave payout's daily rate |
| F-8 | Low | Attendance | `GET /attendance/overtime/mine`, employee report **H46** | Publish the response shape and the accepted query keys |
| F-9 | Low | Attendance | `POST …/comp-offs/:id/approve` · `…/reject` | Confirm the request body, and whether reject requires a reason |
| F-10 | Low | Payroll | `GET …/tax/form16/:financialYear` (#114, #126) | Publish the Part B field list, or say the shape is free-form |

---

### F-1 · The organisation's own name is not readable (High)

**API:** `GET /api/v1/organizations/me`

**Today:** no endpoint in the product returns the name of the organisation the
session belongs to. Probed and 404 on 2026-09-27: `/organizations`,
`/organizations/profile`, `/organizations/me/profile`, `/organizations/:id`,
`/organizations/current`, `/organizations/settings`, `/auth/me`.
`GET /organizations/me` returns the person's profile with `org_id` but no name.
`/organizations/directory`, `/payroll/hr/settings` and `/documents/hr/settings`
do not carry it either.

The one place it exists is `GET /documents/hr/letter-branding` →
`inherited.org_name`. We deliberately do **not** use it for page chrome: it is
HR-only, `documents.access`-gated, and it **creates a branding row as a side
effect**.

**What we need:** `org_name` on `GET /organizations/me`. Please also add the
organisation's short code (`org_code`) — see F-1b.

**Meanwhile:** the top bar shows the org name only when a multi-organisation
sign-in happened to cache it in `localStorage`; otherwise it shows the role
alone, with deliberately no placeholder string.
([DashboardTopBar.jsx:107](src/shared/components/DashboardTopBar.jsx#L107))

**Frontend ready.** `AuthContext.hydrateProfile()` already spreads this reply
into `user`, so the name appears with **no frontend change at all**.

#### F-1b · The organisation short code, for letter reference numbers

Letter reference patterns support a `{ORG_CODE}` token, and the live-example box
under the pattern field has to render it as the literal placeholder `ORGCODE`,
because nothing returns the real one. The example therefore cannot show HR what
their reference numbers will really look like.
([letterIssueMeta.js:583-590](src/shared/documents/letterIssueMeta.js#L583-L590))

---

### F-2 · A letter batch becomes unreachable if its id is lost (High)

**API:** `POST /documents/hr/letters/bulk` (#143) → `GET …/bulk/:batchId` (#144)

**Today:** #143 answers `202` with a batch id and no letters. #144 reports on an
id **handed over once**. There is no endpoint that lists batches, so if the page
is closed, the browser changes, or the id is simply lost, a running batch can
never be looked at again — including one that is failing.

**What we need:** `GET /api/v1/documents/hr/letters/bulk` — the org's recent
batches, newest first, with the same `status` and `counts` blocks #144 already
returns. Pagination optional; the last 20 would be enough.

**Meanwhile:** we keep the last 5 batch handles per signed-in user in
`localStorage` with a 7-day TTL. This is a workaround, it is per-browser, and it
is the only reason a batch survives a page reload today.
([recentLetterBatches.js](src/shared/documents/recentLetterBatches.js),
[IssuedLettersPage.jsx:38](src/roles/hr/documents/screens/IssuedLettersPage.jsx#L38))

Once the endpoint exists we delete that file.

---

### F-3 · A manager cannot withdraw their own letter proposal (Medium)

**API:** `#145`/`#146` (manager plane), `#148`/`#150` (HR decisions)

**Today:** `cancelled` is one of the four proposal states and both `#146` and
`#148` accept it as a filter value, but **nothing in the product can reach it**.
A manager who proposes a letter by mistake has no way to take it back; they must
ask HR to reject it, which records a rejection against them instead.

**What we need:** `POST /api/v1/documents/manager/letters/proposals/:id/cancel`
— proposer-only, pending-only, terminal. `409` when it is already decided is
fine and we will handle it.

**Meanwhile:** the frontend **describes** the cancelled state (so a proposal
cancelled by any future means renders correctly) but never offers it as an
action. ([letterProposalMeta.js:115-121](src/shared/documents/letterProposalMeta.js#L115-L121))

---

### F-4 · `statutory_breakdown` contract gaps (Medium)

**API:** `GET /payroll/me/salary-structure` (#33),
`/payroll/hr/employees/:userId/salary-structures/current` (#18),
`/payroll/manager/employees/:userId/salary-structures/current` (#29)
**Doc:** `md_updates/updated_salary_structure_apis_2026_09_18.md`

Five questions were sent on 2026-09-19 and are still unanswered. Each one forces
the UI to hedge its wording:

1. **`status` is not enumerated.** The sample shows only `"estimated"`. We treat
   anything unrecognised as an estimate and additionally map `not_applied`,
   `disabled` and `calculated` (the vocabulary payroll-run items use). Please
   publish the closed set. ([statutoryBreakdown.js:41-48](src/shared/utils/statutoryBreakdown.js#L41-L48))
2. **`figures.ctc_cost` overshoots `annual_ctc / 12`** — ₹30,916.67 vs
   ₹29,166.67 in your own sample — because employer PF is budgeted on top of
   CTC, not inside it. Confirm that is intended. We never label both "CTC".
3. **`statutory_snapshot.pf.admin_charges` is `"500.00"`**, which looks like the
   EPFO *establishment* monthly floor stamped onto a single employee (0.5% of
   that PF wage would be ₹72.92). We show it for reference only and exclude it
   from totals. Confirm.
4. **`statutory_snapshot.warnings[]` element shape is undocumented.** We accept
   both plain strings and `{code, message}`.
5. **`esi_wage` and `taxable_earnings` are in the payload but missing from the
   doc's §4.2 field table.** Please add them so they are contractual.

**Meanwhile:** gross / deductions / take-home are derived in exactly one place
(`statutoryTotals()`), and `net` is always `gross − deductions`, never
`figures.net_pay`, because `net_pay` nets only the statutory side.

---

### F-5 · A list that shows people needs one request per row (Medium · gap G-2)

**API:** the payroll list endpoints that return rows keyed by `user_id`

**Today:** rows carry a `user_id` and no person. CLAUDE.md §7 forbids a request
per row, and §4 forbids showing an id, so every such screen loads the whole
employee directory to resolve names.

**What we need:** `?include=employee` on those lists, embedding the same minimal
person block the attendance module already sends (`user_id`, name,
`employee_code`, and `gender` for the avatar — see R-5).

**Meanwhile:** `fetchAllOrgEmployees()` caches the directory for 5 minutes per
token and shares in-flight calls; `normalize.js` already reads an embedded
employee when one is present, so this works the day it ships.
([normalize.js:184](src/shared/attendance/normalize.js#L184))

---

### F-6 · What does a holiday's `type` actually change? (Medium · question)

**API:** holiday create/update, `type` = `public | optional | restricted`
(default `public`), per `ATTENDANCE_API_CONTRACT.md` §204

**Today:** HR picks one of three buttons — National / Optional / Restricted —
and **nothing in the contract, the code or the UI says what the engine does
differently** for each. `ATTENDANCE_MODULE_AUDIT.md` additionally flags that the
employee-facing API returns `is_optional` rather than this enum, and marks the
mismatch *Backend Clarification Required*.

**What we need, in one or two sentences each:** for each of the three values —
is the day non-working for everyone by default? Does it consume a quota? Does it
affect pay, comp-off eligibility or the attendance ledger? And how does `type`
map to `is_optional` on the employee read?

**Why this blocks something concrete:** "restricted holiday" is a term an admin
outside India cannot be expected to know. It is exactly the kind of field
CLAUDE.md §10 requires an ⓘ hint on, and we **refused to write one** because we
would have had to invent the behaviour. The hint is ready to ship the day this
is answered.

---

### F-7 · Which settings price a standalone leave payout? (Medium · question)

**API:** `POST /api/v1/payroll/hr/employees/:userId/encashments` (#206), the
manager twin (#216), and the amount shown on the approval queue

**Today:** Payroll Settings has `fnf_encashment_rate_basis` (basic or gross) and
`fnf_encashment_divisor` (30 / calendar days / working days), documented as part
of **final settlement**. A standalone leave payout — one raised from Leave
Payouts, not from an exit — shows an amount, and nothing states whether it uses
those same two settings, a separate rule, or the leave policy.

**What we need:** confirmation of which setting each path reads, or the name of
the setting we are missing.

**Why it matters:** HR is approving a money figure they cannot check. As with
F-6, the explanatory hint is written and withheld until the answer is known.

---

### F-8 · Two endpoints consumed without a published shape (Low)

1. **`GET /attendance/overtime/mine`** (audit **C14**) — no documented response
   shape. We read `overtime_minutes` and fall back to `minutes`, because minutes
   are the canonical unit elsewhere in the module. Please confirm the key and
   the unit. ([EmployeeOvertimePage.jsx:12-16](src/roles/employee/screens/EmployeeOvertimePage.jsx#L12-L16))
2. **The employee attendance report, H46** (audit **C15**) — the accepted query
   keys are undocumented. We send `start_date` / `end_date`, which is what the
   live endpoint has been consumed with successfully. Please confirm, or name
   the real ones. ([EmployeeAttendanceReport.jsx:51-54](src/shared/attendance/EmployeeAttendanceReport.jsx#L51-L54))

More broadly: several documented endpoints (overtime/mine, comp-offs/mine,
daily-log, graph-data, trends, weekly-calendar, the pending lists and the HR
dashboard reads) still have **no documented response shape**, and several create
endpoints (shift, rotation, holiday, weekly-off, device) have no documented
request body. They cannot be marked fully integrated without that.

---

### F-9 · Comp-off decision body (Low · confirmation)

**API:** `POST /attendance/{hr,manager}/comp-offs/:id/approve` and `…/reject`

**Today:** the documented body is empty. The frontend now sends one consistent
shape everywhere — `{ remarks }` when the user typed something, and **no body at
all** when they did not.
([attendance.api.js:86-90](src/shared/api/attendance.api.js#L86-L90))

**What we need:** confirm that is accepted, and specifically **whether reject
requires a reason**. If it does, we will make the field mandatory in the dialog
rather than let the user meet a 400 after deciding.

---

### F-10 · Form 16 Part B has no typed shape (Low)

**API:** `GET /payroll/hr/employees/:userId/tax/form16/:financialYear` (#114)
and its self twin `GET /payroll/me/tax/form16/:financialYear` (#126)

**Today:** the registry describes #114 as "the frozen `form16_snapshot` when
finalized, otherwise a live computation", but the **fields inside that dataset
are not listed anywhere**. With no shape to lay out, the Year-End screen renders
the whole object as `JSON.stringify` inside a `<pre>` — raw API keys, and ids
among them, in front of an HR user. That is our own CLAUDE.md §4 violated, and
we would rather not ship it a day longer than necessary.

**What we need:** the Part B field list (or confirmation that the snapshot is
genuinely free-form and varies by org, which is also an answer we can design
for). We will replace the JSON dump with a proper record inspector either way —
this is the only thing stopping us.

---

## 3. What we are **not** asking for

Recorded so these are not re-raised:

- **`/payroll/self/…` → `/payroll/me/…`** — this codebase never used the `/self/`
  form; the 2026-09-19 fix guide was a no-op here. Nothing is outstanding.
- **PDF Phase 3 (payslip render engine)** — complete and verified live on
  2026-09-28 against the dev API. The handover guide's "~38%, Steps 6–16
  pending" is a stale snapshot.
- **`PUT /attendance/hr/shifts/assignments/:id` and `/attendance/hr/regularizations`**
  — both were listed as "undocumented endpoints the frontend calls" in the
  attendance audit. The frontend no longer calls either; it uses the documented
  `…/assignments/:id/end`, `DELETE …/assignments/:id`, and the documented
  regularization routes.
- **Items 1–10 of the attendance audit's "12 findings that matter most"** —
  those were frontend defects and are fixed.

---

## 4. Suggested order

1. **F-1** — one field, no frontend work, and it is visible on every screen of
   the product for every user.
2. **R-7** and **R-9** — both make a screen state a wrong fact about a person.
3. **F-6** and **F-7** — answers, not code; they unblock copy that is written
   and waiting.
4. **F-2** — deletes a `localStorage` workaround we would rather not own.
5. Everything else.
