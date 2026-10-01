# Frontend Work & Audit Report — 2026-09-22

**Scope:** every frontend change made on 2026-09-22 (all uncommitted on `dev`, on top of `e7ffc66`).
**Audience:** frontend team, reviewers, and the backend team (section 6).
**Status:** code complete and reviewed; **not yet committed, pushed or deployed**, and **not click-tested in a browser**.

---

## 1. Summary

| Area | Result |
|---|---|
| API registry audit | 379 → 423 rows; 2 missing rows added, UI tick columns rebuilt from real routing, 42 Documents rows added |
| Manager-dashboard recon report (11 findings) | 7 fixed in code, 4 confirmed as data/backend issues |
| Employee dashboard | Redesigned (charts, cleaner layout); signature purple header kept |
| Documents module — Phase 1 | Built: 42/42 endpoints wired to UI for HR, managers and every employee |
| Tester + backend reports (4 files) | 8 real frontend issues fixed, 1 integration weakness hardened, stale findings documented |
| Code reviews (3 rounds) | 13 bugs found in today's own code and fixed |
| Verification | `vite build` passes; 0 new lint errors; 25 unit checks pass; live API shapes checked read-only |

---

## 2. How the work was verified

- **Live API (read-only):** response shapes checked with GET requests using HR, manager and employee tokens against `https://development.hrclouds.in/api/v1`. No write requests were sent. Tokens were never stored on disk.
- **Static review:** three code-review passes (the automated `code-review` skill plus a manual senior review of the untracked Documents module, which the automated pass cannot see).
- **Lint:** every changed file compared against the pushed `HEAD` version; **0 new errors** (pre-existing ones, e.g. unused `React` imports, are untouched).
- **Unit checks:** 17 formatter cases (`formatMoney`, `formatPercent`, `formatComponentValue`) and 8 worked-time cases (`workedLabel`, `totalWorkedLabel`) — all pass.
- **Build:** `vite build` succeeds (only the pre-existing >500 kB chunk warning).
- **Not done:** no browser click-through. Please smoke-test the screens listed in section 8 before release.

---

## 3. Work completed

### 3.1 API registry (`public/ref docs/api_registry.md`, mirrored to `dist/`)
- Audited all 379 endpoints against the API layer and screen usage: 370 were wired, 3 have no UI by design, 6 had a client function no screen used.
- Added the 2 endpoints the frontend calls but the registry lacked (`GET /payroll/hr/salary-structures/current` as #18a, `GET /payroll/hr/bank-accounts` as #24a).
- Rebuilt the Employee / HR / Manager UI tick columns from the real routes and import graph (83 rows corrected), and documented what a tick means.
- Wired two previously unused reads: `GET /payroll/hr/components/:id` and `GET /payroll/hr/encashments/:id` (detail dialogs now refresh from them).
- Added the Documents module sections (#1–#33); ticked the self-service section (#34–#42) that was added separately.

### 3.2 Manager-dashboard reconnaissance report — fixes
| ID | Fix |
|---|---|
| NAV-001 | Top-bar search now searches pages (from the sidebar's own menu, keyboard + ⌘F). Bell opens the Inbox and shows a dot only when something is waiting. Help Center → documentation, Settings → My Profile. Fake "8" badge removed. |
| UI-001 | Maya chat panel closes on navigation and on Escape (it was mounted outside the router and followed the user between pages). |
| DATA-001 | Variable Pay never shows a raw user ID; falls back through embedded name → team → "(you)" → "Former team member". |
| UI-002 | Negative effective hours from the server render as `0m` everywhere (was `-1m`). |
| DATA-003 | Shared `roleLabel()` — consistent "Employee", "HR", "Manager". |
| DATA-005 | Claim pay-month filters stop at next month. |
| DATA-006 | Attendance History hides pre-joining days the server fills in as "Absent". |
| Data only | DATA-002 duplicate phone, DATA-004 / UI-003 typos, DATA-007 ₹10 loan — no code change possible. |

Also fixed: `DetailGrid rows=` → `items=` on both encashment pages (opening an encashment's detail would have crashed).

### 3.3 Employee dashboard
- Rebuilt on the manager dashboard's card system; **purple hero header retained** (it was removed once in error and restored).
- "My month": three headline figures plus a daily-hours bar chart. "Attendance mix": donut chart whose colours were validated for colour-blind separation. Next holiday shown as a chip in the header.

### 3.4 Documents module — Phase 1 (new, ~3,900 lines)
Built from `public/ref docs/md_docs/phase1_*.md`.

| Audience | Screens |
|---|---|
| HR | Verification Queue · Employee Documents · Documents tab on the employee profile · Document Types (org types + platform catalog with bulk activation) · Document Settings |
| Manager | Team Documents (To review / My recommendations / All) · upload for a report · Documents tab on the member profile |
| Everyone | My Documents (in the employee, manager and HR workspaces) |

Key behaviours:
- Direct browser → S3 upload (issue → PUT → confirm) with per-stage progress. A failed attempt keeps its draft: **Try again** resends it unchanged; **Start over** discards it first.
- Client-side validation mirrors the server rules: allowed formats, size cap, required expiry, dates in order, confidential only tightens.
- Verify / reject (10–500 character reason) / stale-recommendation override / recommend / replace / delete, each shown only where the role and the document's status allow it.
- Every error code in the plan's error register has a plain message; a disabled `documents.access` flag shows a clear "not enabled" state.
- Architecture: `DOCUMENT_PLANES` adapter (hr / manager / self). Shared kit in `src/shared/documents/`.

### 3.5 Tester and backend reports (4 files in `md_updates/`)
| Finding | Verdict | Change |
|---|---|---|
| FRONTEND-002 — ₹1600.0000 | Confirmed | `formatComponentValue` / `formatPercent` on the Components and Templates screens |
| FRONTEND-006 — ₹57,559.4 | Confirmed (decimals) | `formatMoney`: exactly 2 decimals when there are paise, none otherwise; minus sign before ₹ |
| Overtime fields update + DATA-002 | Confirmed | UI uses the backend's `worked_duration_formatted` / `total_worked_duration_formatted` (falls back to hours where an endpoint doesn't send them). The overtime review shows the calculation: worked − policy full day = overtime. |
| BACKEND-009 — jobs API | New API | Automation page reads `GET /payroll/hr/jobs`, shows schedules in words. Also fixed: the settings-failure warning could never appear. |
| BACKEND-007 — export `no_data` | New status | "Empty · no data" badge and filter; Download disabled when the preview for the same filters is empty |
| BACKEND-008 — revoked payslips | Confirmed (display) | Withdrawn / replaced payslips never show as visible and aren't counted as "held"; the employee list filters them defensively |
| INTEGRATION-003 — tab race | Partly | Stale responses were already discarded; rows from a previous tab/filter are no longer shown under the new one (shared hook, 13 screens) |
| GAP-004 — invite resend/revoke | Confirmed | Buttons on pending-invite cards, with toast and busy state |
| INTEGRATION-002 — reports run list | Not reproducible | Hardened: load errors now say so, with a retry; closed runs fetched by status so cancelled runs can't crowd them out |
| FRONTEND-001, -003, -004, -005 | Not reproducible | Correct in current and pushed code (older deploy, or US date format misread) |
| FRONTEND-007 to -010 | Already fixed today | Not yet deployed |
| GAP-001 to -003, -005 | Already present / built | Delete, status, transfer live on the profile; Documents built today |

---

## 4. Bugs found in review and fixed (today's own code)

| # | Issue | Fix |
|---|---|---|
| 1 | Document viewer re-requested a signed URL on every re-render → a duplicate "viewed" audit event each time | Stable `plane.viewUrl` passed to the viewer |
| 2 | Upload retry silently ignored edits made after a failure | Form locks while a draft exists; Start over discards it |
| 3 | Filter / tab change on page ≥2 fired two requests; the slower could overwrite the newer | Page reset in the same update + newest-request guard (5 screens) |
| 4 | My Documents "Verified" tile count ≠ its list | Verified includes expiring-soon in tile, tab and list |
| 5 | `user_ids` sent as a string / as `user_ids[]` — both rejected by the API | Repeated key; a single ID is sent twice (the only form this parser reads as an array) |
| 6 | Reports page "mounted" flag broke under React StrictMode (updates silently stopped in dev) | Flag reset on every mount |
| 7 | Revoke no longer removed a pending invitee from the employee list | Restored, scoped to pending rows only |
| 8 | Document download opened a new tab after an `await` (blocked as a pop-up in Safari) | Downloads now follow the attachment link in place |
| 9 | Negative money printed as `₹-250.50` | `-₹250.50` |
| 10 | Unused helper left behind (`openInNewTab`) | Removed |
| 11 | Reject reason could exceed the server's 500-character cap | `ReasonDialog` gained `maxLength` |
| 12 | `#6 GET /types/:id` never called (edit form started from a possibly stale row) | Editor refreshes from #6 on open |
| 13 | Manager dialog named the signed-in user by lookup | Shows "You" for the signed-in user everywhere in document details |

---

## 5. Known limitations (accepted, documented in code)
- **Legacy empty exports:** exports saved before the `no_data` fix are stored as `completed`. They show as "Empty · no data" but still match the server's "Completed" filter. Fixing that client-side would break pagination counts.
- **Worked-time fallback:** `/attendance/history` and `/attendance/manager/team/today` don't yet send `worked_duration_formatted`, so hours are formatted client-side there.
- **Pending invitations:** only invites sent in the current session are listed (there is no list endpoint).
- **My Documents:** reads up to 1,000 of a person's own documents (5 pages of 200) and filters in the browser.
- **Job schedules:** shown as written in the cron expression. The server's timezone isn't part of the response, so none is claimed.
- **Verification queue, one person:** relies on the backend accepting a repeated ID (`user_ids=x&user_ids=x`). If it rejects duplicates, the backend should accept a single value (`Joi.array().single()`).
- **Top-bar search** finds pages, not records (people, requests).

---

## 6. For the backend team
1. Data fixes: foreign-tenant adjustments / bonus cohort (BACKEND-001/002), company name as account holder (003), paid ₹0 run (004), duplicate ESI/PF/TDS components (005), Gratuity as deduction (006), typos in department, leave-type code and revision reason (010–012).
2. Add `worked_duration_formatted` to `/attendance/history` and `/attendance/manager/team/today`.
3. Backfill `status = 'no_data'` for historical 0-row exports.
4. Add a "list pending invitations" endpoint.
5. Add an org-wide regularization history endpoint (GAP-006).
6. Confirm `user_ids` behaviour for one ID (see section 5).
7. Documents Phase 1: nothing verified against a live Documents backend; the screens follow the Phase 1 contract exactly.

---

## 7. Release checklist
- [ ] Browser smoke test of the screens in section 8 (HR, manager and employee logins).
- [ ] Documents: upload → verify / reject → replace → delete on a real S3 bucket (CORS must allow `PUT` from the frontend origin).
- [ ] Rebuild `dist/` and deploy — testers were on an older build.
- [ ] Commit in logical units (registry, manager fixes, dashboard, Documents, tester fixes).

---

## 8. Files touched

**New — Documents module:** `src/shared/api/documents.api.js`, `src/shared/utils/documentErrors.js`, `src/shared/documents/*` (meta, planes, upload flow, types hook, UI kit, upload / link / detail dialogs, table, per-person panel), `src/shared/screens/MyDocumentsPage.jsx`, `src/roles/hr/documents/*` (queue, employee documents, types + form, settings), `src/roles/manager/documents/screens/TeamDocumentsPage.jsx`, `src/roles/hr/screens/employee-profile/DocumentsTab.jsx`.

**Modified (44 files):**
- **Shell:** `App.jsx`, `routes/AppRoutes.jsx`, `DashboardSidebar`, `DashboardTopBar`, `SidebarContext`, `ChatbotWidget`, `AttachmentViewerDialog`, `ReasonDialog`.
- **Shared helpers:** `formatUtils`, `attendance/dates`, `usePagedList`, `LiveEffectiveHours`, `AttendanceApprovalQueue`, `DecisionContext`, `auth/permissions`.
- **HR:** employees, profile, Documents and profile tabs, attendance directory, payroll components, templates, encashments, automation, exports, reports, payslips.
- **Manager:** Variable Pay, team history, member profile, team reimbursements and encashments.
- **Employee:** dashboard, attendance, payslips, reimbursements.
- **API:** `payroll.api.js` (`getJobs`), `api/index.js`.
- **Docs:** API registry (public and dist).
