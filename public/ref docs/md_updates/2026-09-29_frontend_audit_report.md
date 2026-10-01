# Frontend Audit Report: UI Review and Fix Session, 28–29 Sep 2026

**Scope:** every frontend change made in the 28–29 Sep 2026 working session. That covers the catalog guidance, the build, the sidebar, three live-browser reviews (HR, manager, employee), wiring the backend's R-1 to R-6, and a final senior code review of all of it.
**State:** uncommitted, in the working tree of `dev`. 94 files modified (93 under `src/` plus `vite.config.js`), 5 source files added.
**Verified by:** a production build (to a scratch folder; `dist/` untouched), ESLint compared per file against `HEAD`, and live checks in Chrome against `development.hrclouds.in` with real HR, manager and employee logins at 1366×768 and 1440×900.

---

## 1. Summary

| | Count |
|---|---|
| Files modified | 94 (93 in `src/` plus `vite.config.js`) |
| New source files | 5 (`trendChartMeta.jsx`, `SundayLabel.jsx`, `directoryIndex.js`, `statusChip.js`, `annualStatementMeta.js`) |
| Issues found and fixed before the final review (§2–§7; R-1 to R-6 wiring listed separately in §7a) | 42 |
| Further bugs found and fixed by the final code review (§8) | 20 |
| Lint | **No file worse than `HEAD`**; 3 files improved (LeaveDashboard 1→0, AttendanceHolidaysPage 2→1, DashboardSidebar 4→3) |
| Build | Passes; `public/ref docs/` is no longer copied into the output |
| Open items needing the backend | R-7, R-8, R-9 (§9) |

Severity used below: **High** means wrong data shown, an action fails, or a user is misled. **Medium** means a broken interaction or a house-rule violation users will notice. **Low** means polish or consistency.

---

## 2. Documents: catalog URL and filters

Source: `md_updates/2026-09-28_document_catalog_url_and_filters_guidance.md`.

| Sev | Bug | Fix | Files |
|---|---|---|---|
| High | The catalog was always called with `plane=employee&activated=false` pinned on. The 19 org-plane types (every letter the company issues) were invisible. `experience_letter_issued` could never be activated, so issuing an experience letter failed with `409 DOCUMENT_TYPE_NOT_ACTIVATED`. | #1 is called with a clean URL, once. All filtering happens in the UI: FilterTabs "All / We collect / We issue" with counts, plus search, category, country and status. The plane is kept in the URL (`?tab=catalog&plane=org`) so other screens can deep-link to it. | `DocumentTypesPage.jsx`, `documents.api.js` |
| Medium | Already-activated types vanished from the catalog, which read as "deleted". | Every card shows a status: Active / Active · switched off / Not activated / No longer offered. An activated entry's preview offers "Configure it", which opens the org's own type. | `DocumentTypesPage.jsx` |
| Low | Error copy for `DOCUMENT_TYPE_NOT_ACTIVATED` didn't say where to go. | It now names the path: Document Types → Catalog → We issue. | `documentErrors.js` |

## 3. Build

| Sev | Issue | Fix | Files |
|---|---|---|---|
| Medium | `public/ref docs/` (about 6 MB of internal API contracts) was copied into `dist/` and deployed to every visitor. | A build-only Vite plugin deletes `dist/ref docs` after bundling. The folder stays in `public/`, because CLAUDE.md and code comments point there. | `vite.config.js` |

## 4. Navigation (sidebar and routes)

| Sev | Issue | Fix | Files |
|---|---|---|---|
| Medium | The sidebar used a different structure in each role, and items were alphabetical rather than in the order the work is done. | Rebuilt as one shape for all roles. Sections run in a shared order; Payroll uses numbered steps, Setup and Me are dropdowns, and every self-service item starts with "My". Open/closed state is remembered per role (`hrc.sidebar.open.<role>`, try/catch guarded), and the section of the current page is always open. Arrow keys, Home and End work like a tree. | `DashboardSidebar.jsx` |
| High | HR and managers had no page for their own leave, payslips, loans or tax. | `MY_PAY_PATHS` and `useMyPayPaths()`, plus routes `/dashboard/{hr,manager}/my-{leaves,payslips,loans,tax}` that reuse the employee screens. | `paths.js`, `AppRoutes.jsx` |
| Low | Sidebar label ≠ page h1 ≠ top-bar title in several places. | Renamed so all three match: My Document Home, My Personal Documents, My Company Documents, My Document Requests, Salary Adjustments (manager), Document Reports, Payroll Exports, Document Exports, My Loans & Variable Pay, My Tax & Investments. | several pages, `portfolioMeta.js` |
| Medium | "Earned leave" and Document Home links sent HR and managers into the employee workspace. | The links resolve inside the current workspace. | `EmployeeCompOffsPage.jsx`, `AllMyDocumentsPage.jsx` |

## 5. HR panel review (live, HR login)

| Sev | Bug | Fix | Files |
|---|---|---|---|
| High | Exit cancel always failed with `400 "cancellation_reason" is required`, because the page sent `reason`. | The API layer sends `cancellation_reason`. | `payroll.api.js`, `PayrollExitsPage.jsx` |
| High | Encashment reject sent `reason`, but #210 requires `rejection_reason`. | Fixed in the API layer. | `payroll.api.js`, `PayrollEncashmentsPage.jsx` |
| Medium | Only HR's chart marked Sundays, and every chart opened on days 1–15 even late in the month. | Shared `trendChartMeta.jsx`: `sundayMarkers()` and `defaultChartPage()`, which opens the half that holds today. Used by all three dashboards. | `trendChartMeta.jsx`, `SundayLabel.jsx`, `HRDashboard.jsx`, `ManagerDashboard.jsx`, `EmployeeDashboard.jsx` |
| Medium | The same person showed as an illustrated avatar on one screen and as initials on another, because many rows carry no gender. | `GenderAvatar` looks the person up in the org directory (`directoryIndex.js`: cached, HR and managers only, never retried) when the row has no gender or photo. | `GenderAvatar.jsx`, `directoryIndex.js` |
| Low | Payroll statuses were square UPPERCASE tags, while attendance and documents used rounded pills. | Shared `STATUS_CHIP` applied across about 17 payroll screens. | `statusChip.js` + payroll pages |
| Low | Calculation codes rendered as "Percent Of Ctc". | `calculationLabel()` gives "% of CTC" and similar. | `runMeta.js`, Components and Templates pages |
| Medium | The letters register showed "A colleague" instead of the recipient. | `letterRowParts()` reads the name (see also §8, items 4–5). | `letterIssueMeta.js`, `IssuedLettersPage.jsx` |
| Medium | Screens overflowed or clipped at 1366 px: filter bars ran off cards, 1,100–1,150 px tables, clipped tab bars and truncated labels. | Main areas use `max-w-7xl`. Tables are ≤ 960 px wide with `px-4` cells. Filter bars put search and actions on one line with filters wrapping underneath. Tab bars wrap, and labels wrap rather than truncate. | Loans, Adjustments, Reimbursements, Policies, Holidays, Inbox, Encashments, Exits, profiles and others |
| Low | The employee code appeared twice ("EMP-01 · EMP-01"). | `PersonCell` de-duplicates it. | `attendance/ui.jsx` |
| Medium | Exit rows needed a View (eye) button. | The row opens the settlement, and the eye button is gone (house rule). | `PayrollExitsPage.jsx` |

## 6. Manager panel review (live, manager login)

| Sev | Bug | Fix | Files |
|---|---|---|---|
| High | The Earned Leave summary cards all read 0, because they read keys the API doesn't send. | They read the live keys (`redeemable`, `earned`, `used`, `expired`), with the old keys as fallback. | `EmployeeCompOffsPage.jsx` |
| Medium | Credit and Expires columns were solid "N/A" (the fields aren't sent). | The columns hide until a row has a value. The pending queue gains a "Day off" column. | `AttendanceApprovalQueue.jsx`, `EmployeeCompOffsPage.jsx`, `AttendanceCompOffsPage.jsx` |
| Medium | Both inboxes opened on an empty queue while others had work. | They open on the first queue with work (see §8, item 3). | `HRInboxPage.jsx`, `ManagerApprovalsInbox.jsx` |
| Medium | `/documents/hr/settings` was called by managers and employees, giving a 403 on every request screen. | Only HR tokens ask. | `useDocumentSettings.js` |
| Medium | The live attendance Shift column read "N/A" (the API sends `shift_snapshot`). | It reads `shift_snapshot`. | `ManagerDashboard.jsx` |
| Low | Manager salaries lacked the Department and Effective-from columns HR has. | Added. | `TeamSalaryPage.jsx` |
| Medium | Manager adjustment and bonus rows opened nothing, unlike HR's. | Record inspectors added (Salary Adjustments). | `ManagerAdjustmentsPage.jsx` |
| Medium | Pending HR comp-off rows needed a Review button. | The row opens the decision. | `AttendanceCompOffsPage.jsx` |
| Low | Profile tab bars clipped; "1 days left"; "accrued". | Tabs wrap, days pluralise, and "given so far" is used. | profile pages, `LeaveTab.jsx`, `LeaveDashboard.jsx` |

## 7. Backend R-1 to R-6 wired, and the employee panel review

### 7a. Backend changes wired (fallbacks kept; not yet deployed on dev at 29 Sep)

| # | Frontend change | Files |
|---|---|---|
| R-1 | Letters list reads `included_users` | `letterIssueMeta.js` |
| R-2 | Request rows use `document_type_name` / `document_type_group` via `requestTypeOf()` | `requestMeta.js`, `RequestsTable.jsx`, `DocumentRequestDetailDialog.jsx` |
| R-4 | Encashment cancel sends `cancellation_reason`; the reason is shown to HR, managers and employees | `payroll.api.js` + 3 encashment views |
| R-5 | Avatars read `gender` from `user.*_profile` | `GenderAvatar.jsx` |
| R-6 | `has_employee_record: false` shows "no required-documents list", never a 100% score | `requestMeta.js`, `ChecklistPanel.jsx` |

### 7b. Employee panel review (live, employee login, Compunic)

| Sev | Bug | Fix | Files |
|---|---|---|---|
| High | The dashboard said 12 days absent while My Attendance said 1: graph data counts the days before joining (R-7). | Days before `user.joining_date` are shown as "Before you joined" and taken out of the mix. This is a workaround until R-7 is fixed. | `EmployeeDashboard.jsx` |
| Medium | The employee chart showed the whole month, not the half that holds today. | Paged like HR and manager. | `EmployeeDashboard.jsx` |
| Medium | A Sunday someone worked hid its "SUNDAY" label behind the bar. | Sunday day numbers on the axis turn purple (`DayTick`), on all three dashboards. | `SundayLabel.jsx` + 3 dashboards |
| High | The punch card's shift line was blank on every dashboard: `/attendance/shift` wraps the shift. | Unwrapped. Times read "10:00 am–06:00 pm". | `AttendanceCard.jsx` |
| High | The annual statement showed N/A in every cell, and HR's #183 screen had the same bug: the live reply uses `month`, all-null months and `totals`. | Shared `annualStatementMeta.js` used by both screens. | `annualStatementMeta.js`, `MyPayslipsPage.jsx`, `PayrollPayslipsPage.jsx` |
| High | The tax projection showed ₹0 everywhere plus a raw JSON dump: the live reply is nested and reports `income_tax_enabled: false`. | Reads the nested shape, explains when tax is switched off, and lists what the estimate leaves out. | `MyTaxAndInvestmentsPage.jsx` |
| High | The leave form's "attach a document" picker always failed with a 400: `status` was sent twice. | Fixed (refined in §8, item 16). | `LeaveAttachmentField.jsx` |
| Medium | Take-home per year read "₹4,55,000.04", and "After PF, ESI, PT and tax" appeared when only PF applied. | Rounded to the rupee; the hint names the heads actually deducted. | `MySalaryPage.jsx` |
| Medium | Each bonus was listed twice (under Bonuses and Adjustments, with the same ids). | Shown once. | `MyLoansAndAdvancesPage.jsx` |
| Medium | Loans were tall cards with a hand-rolled modal and "ACTIVE" tags. | A table whose rows open a `DetailDialog`, matching HR. | `MyLoansAndAdvancesPage.jsx` |
| Low | The tax summary used jargon ("TDS Deducted (YTD)"). | House wording: "Income tax so far" and similar. | `MyTaxAndInvestmentsPage.jsx` |
| Low | The leave status filter was a native select of 7 options. | FilterTabs with counts; the Apply form's footer is pinned. | `LeaveDashboard.jsx` |
| Low | The comp-off "Earned" tag contradicted "Waiting for approval". | One shared label. | `enums.js` |
| Low | The profile showed "2002-03-03", "female", "single". | Shows "3 Mar 2002", "Female", "Single". | `MyProfilePage.jsx` |
| Low | Durations read "8h 0m" and "0h 0m". | They read "8h" and "0m" everywhere. | `dates.js` |

---

## 8. Final code review: bugs found and fixed

A line-by-line review of everything above found these. All are fixed and verified.

| # | Sev | Bug (edge case) | Fix | File |
|---|---|---|---|---|
| 1 | Medium | **Sidebar state leaked between workspaces.** The four route groups render the same layout, so React kept one sidebar instance when HR switched workspace. Its open sections, read for one role, were then saved under another role's key. | The sidebar is keyed by role, so it remounts per workspace. | `DashboardLayout.jsx` |
| 2 | Low | A single-item sidebar section didn't close the mobile drawer when tapped. | Added `closeOnMobile`. | `DashboardSidebar.jsx` |
| 3 | Medium | **Inbox jumped queues mid-work.** The auto-select ran on every count change, so clearing the last item in a queue moved the person to another queue. | Auto-select runs once, when the counts first arrive. | `HRInboxPage.jsx`, `ManagerApprovalsInbox.jsx` |
| 4 | High | **Copied letter reference numbers were corrupted.** `breakableReference()` rewrote hyphens to U+2011 and inserted invisible U+200B characters. People are asked to quote these numbers, and a pasted copy no longer matched in search or email. | Replaced with `referenceSegments()`. Wrap points are now `<wbr>` markup, and each segment is `whitespace-nowrap`. Verified: the copied text equals the reference exactly. | `letterIssueMeta.js`, `IssuedLettersPage.jsx` |
| 5 | Medium | **The letters register replaced a known name with "Loading…" or "Name unavailable".** A directory placeholder beat the name parsed from the title, and "Name unavailable" stuck on failure. Object-shaped `included_users` entries weren't handled either. | Precedence is now: embedded name, then a real directory hit, then the title's name. Placeholders never win. Tested with 4 cases. | `letterIssueMeta.js` |
| 6 | Medium | **A 31-day month had three chart pages**; the third held only the 31st, and on the 31st the chart opened on that single bar. Row dates with a time part also compared wrongly against "today". | `chartPageCount()` and `chartPageRows()` always give two halves (1–15 and 16–end), and date comparisons use the calendar day. Tested for 31, 28 and 10-day months and boundary days. | `trendChartMeta.jsx` + 3 dashboards |
| 7 | Low | `DayTick` rendered a blank tick for a timestamp value. | Uses the first 10 characters. | `SundayLabel.jsx` |
| 8 | Low | The punch card's `"shift" in shiftData` throws a TypeError if the payload is ever a primitive. | Type-guarded. | `AttendanceCard.jsx` |
| 9 | Low | A whitespace-only encashment cancel reason was sent and failed the server's 1–1000 rule. | Trimmed; a blank reason is sent as none. | `payroll.api.js` |
| 10 | Low | Catalog "Select all N shown" replaced the selection, dropping items picked under another filter. | It adds to the selection. | `DocumentTypesPage.jsx` |
| 11 | Low | HR comp-off rows kept a pointer cursor during a bulk approval, when clicking does nothing. | The cursor follows clickability. | `AttendanceCompOffsPage.jsx` |
| 12 | Low | Manager salaries showed Department "N/A" while the directory was loading (house rule: "Loading…"). | Reads "Loading…", then the department or N/A. | `TeamSalaryPage.jsx` |
| 13 | Medium | **A "% of gross" manager bonus was described as "% of basic pay"** in the inspector, and the table showed a bare "%". | `bonusValueLabel()` names the right basis in both places. | `ManagerAdjustmentsPage.jsx` |
| 14 | Low | The same loan read "Flat — on the full amount throughout" to the employee but "flat" to HR and managers (role parity). | Shared `interestMethodLabel()`. | `runMeta.js`, 3 loan views |
| 15 | Medium | A failed repayment-schedule read showed "No EMIs scheduled", which reads as nothing owed. | Shows "Couldn't load the repayment schedule". | `MyLoansAndAdvancesPage.jsx` |
| 16 | Medium | The attachment picker fetched 100 unfiltered documents, so someone with more could lose evidence-eligible ones off the page. | One exact call per status (`available`, `pending_verification`). Half a list still shows; the error only appears if both calls fail. | `LeaveAttachmentField.jsx` |
| 17 | Low | Leave filter: when a status tab disappeared (you cancelled your only pending leave), the list went empty with no tab selected. | Falls back to All. | `LeaveDashboard.jsx` |
| 18 | Low | Tax projection notes and limitations used their text as the React key (duplicates collide), and non-strings could render. | Index keys; strings only. | `MyTaxAndInvestmentsPage.jsx` |
| 19 | Low | Shift times were 12-hour on the punch card but 24-hour on the manager team table and the HR profile daily log. | 12-hour everywhere a shift sits next to punch times. The roster grid stays compact 24-hour. | `ManagerDashboard.jsx`, `AttendanceTab.jsx` |
| 20 | Low | Policy thresholds read "7.25h", or "NaNh" for bad data. | `fmtHours`: "7h 15m" / "N/A". | `AttendancePoliciesPage.jsx` |

**Reviewed and judged correct (no change):**

- The routes for every `MY_PAY_PATHS` entry exist.
- No hard-coded `/dashboard/employee` links remain in multi-workspace screens.
- Every caller of the changed API signatures was updated.
- `rowPreviewProps` ignores checkbox clicks.
- The catalog's URL plane is whitelisted.
- `useDocumentSettings` gates on the JWT role.
- `directoryIndex` never fetches for employees and never retries.
- Every `STATUS_CHIP` renders a humanised label.
- Cancelling a past approved leave raises a manager-approved cancellation request, and that is intended.

---

## 9. Open items

**Backend** (details in `md_updates/2026-09-28_frontend_requests_to_backend.md`)

- **R-1 to R-6 are not yet deployed** to `development.hrclouds.in` (checked 29 Sep). The frontend works both before and after they're deployed, and was verified against the report's shapes by rewriting responses in the browser.
- **R-7:** days before joining are counted as absent (M15, M16, and the employee's own graph data). The employee dashboard works around this with `joining_date`. Remove that workaround once the fix is deployed (search for "R-7" in `EmployeeDashboard.jsx`).
- **R-8:** the comp-off summary shape needs confirming, and `credit_days` needs adding to comp-off rows.
- **R-9 (new):** documents that ask for neither acknowledgement nor signature are counted as "needs you" (#70 and the Document Home feed). The frontend deliberately shows the server's verdict as-is.
- **Please document** the `tax` and `tds` blocks of `/payroll/me/tax/projection` for when income tax is enabled.

**Frontend, deferred by agreement**

- Unify the two tab styles (underline vs pill) and the remaining native-select filters.
- My Company Documents is still shown as cards rather than a table.
- HR's Attendance History / Overtime / Flags parity pass; the Letterhead stepped editor; Document Settings simplification.
- The chart wheel-paging on the HR and manager dashboards (from before this session) also captures vertical page scroll.

**Repository**

- Nothing is committed.
- `dist/` still carries an uncommitted rebuild from earlier in the session (with `ref docs` removed). Decide whether to ship it, or restore with `git checkout -- dist/ && git clean -fdq dist/`.

---

## 10. How to re-verify

1. `npm run lint` and compare per file with `HEAD`; none should be worse.
2. `npm run build`; `dist/ref docs` must not exist.
3. In a browser at 1366×768, log in as each role (the employee account asks you to pick the organisation, Compunic).
   - Dashboard chart: opens on the half holding today; Sunday numbers are purple; the shift line shows on the punch card.
   - Employee: My Payslips → Annual statement shows months, not N/A. My Tax → Projection shows figures and the tax-off note. My Loans → a row opens the inspector.
   - HR: Documents → Issued Letters → copy a reference number; it pastes unchanged.
   - HR: Inbox opens on the first queue with work.
