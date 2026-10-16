# HR Clouds — HR User Navigation & Functionality Guide

**Document Purpose:** A functional navigation guide for HR Clouds, structured for RAG data source use.

---

## 1. Document Purpose

This document is a complete, deterministic navigation and functionality manual for the HR role panel of HR Clouds (dev frontend). It is written so that:

- An HR user who has never seen HR Clouds can find any piece of HR information by following the exact UI labels and click paths.
- An HRMS RAG chatbot can answer "Where do I find X?" questions with verified navigation paths and descriptions of what each screen shows.
- Every data-quality observation, empty state, and read-only action is recorded verbatim from the application UI.

All UI labels in this document are the application's exact labels. Where the purpose of an element could not be confidently determined from the available UI, this is stated explicitly rather than guessed.

---

## 2. HR Panel Overview (what the panel is, role context observed, header/user area)

### What the panel is
HR Clouds is a cloud-based HRMS and payroll application. The HR panel (URL prefix `/dashboard/hr`) is the HR administrator's workspace for managing people, attendance, time off, payroll, tax compliance, and self-service ("ME") records. A secondary self-service profile area lives at `/dashboard/profile` (My Profile).

### Role context observed
- Signed-in user identity shown in the top-right corner: **[HR Admin Email]** (button description "My Profile").
- My Profile page shows: display name **[HR Admin Email]** (no personal name is set for this user), **#[Employee ID]**, role **"Hr"**, Department **Human Resources**, Designation **HR Administrator**.
- The bank account for this user lists the account holder as **"[Company Name]"**, which is the only place an organization name appears in the UI. The organization is therefore understood to be **[Company Name]**, though the UI never shows an explicit "Organization: …" label.
- The HR user has 8 org personnel under them: 6 employees, 1 manager, and the HR user themselves.

### Header/user area (top bar, left to right)
1. Sidebar logo link **"HR Clouds"** (top-left) — returns to the HR dashboard.
2. Textbox **"Search anything..."** — global search. Typing "leave" and pressing Enter produced no results list and no navigation; the global search appeared non-functional in this environment (see Quality Findings).
3. Button **"Documents"** — opens the built-in documentation hub at `/dashboard/documents` (sections: Overview & Getting Started, Attendance & Time Tracking, Leaves & Holidays, Approvals & Regularizations, Payroll & Lock Periods, Reports & Analytics, with a "Search documentation..." box and Previous/Next section buttons).
4. An unnamed icon button (visually a bell with a red notification dot) — clicking it produced no visible panel or navigation. The purpose of this element could not be confidently determined from the available UI.
5. Button **"[HR Admin Email]"** (description "My Profile") — opens My Profile at `/dashboard/profile`.

### Sidebar footer
- Button **"Help Center 8"** (badge 8) — clicking it produced no visible response. The purpose of this element could not be confidently determined from the available UI.
- Button **"Setting"** — clicking it produced no visible response. The purpose of this element could not be confidently determined from the available UI.

### Floating assistant
- **Maya — HR Assistant · Online** chat widget floats on every page (bottom-right), with suggested questions ("What are the leave policies at HR Clouds?", "How do I apply for payroll services?", "What features does HR Clouds offer?") and a "Type your question…" textbox. It re-opens automatically on each page navigation. It was not used in this audit.

---

## 3. HR Navigation Structure (full sidebar tree with exact labels)

```
HR Clouds (logo link → /dashboard/hr)
├── Dashboard
├── HR Inbox 4                      (badge = 4 pending items)
├── PEOPLE (expandable section)
│   ├── Team                        (/dashboard/hr/employees)
│   └── Departments                 (/dashboard/hr/departments)
├── TIME & LEAVE (expandable section)
│   ├── Live Attendance             (/dashboard/hr/attendance/directory)
│   ├── Leave Requests              (/dashboard/hr/leaves/requests)
│   ├── Regularizations             (/dashboard/hr/attendance/regularizations)
│   ├── Complimentary Offs          (/dashboard/hr/attendance/comp-offs)
│   └── Shift Roster                (/dashboard/hr/attendance/roster)
├── PAYROLL (expandable section)
│   ├── Lock Attendance             (/dashboard/hr/attendance/lock-periods)
│   ├── Adjustments                 (/dashboard/hr/payroll/adjustments)
│   ├── Bonus Rules                 (/dashboard/hr/payroll/bonus-rules)
│   ├── Claims                      (/dashboard/hr/payroll/reimbursements)
│   ├── Loans & Advances            (/dashboard/hr/payroll/loans)
│   ├── Encashments                 (/dashboard/hr/payroll/encashments)
│   ├── Exits & Settlements         (/dashboard/hr/payroll/exits)
│   ├── Pay Differences             (/dashboard/hr/payroll/arrears)
│   ├── Bank Verification           (/dashboard/hr/payroll/bank-verification)
│   ├── Payroll Runs                (/dashboard/hr/payroll/runs)
│   ├── Payslips & Documents        (/dashboard/hr/payroll/payslips)
│   └── Employee Salaries           (/dashboard/hr/payroll/employee-structures)
├── TAX & COMPLIANCE (expandable section)
│   ├── Tax Declarations            (/dashboard/hr/payroll/tax-declarations)
│   ├── Statutory & Tax             (/dashboard/hr/payroll/statutory)
│   └── Year-End & Form 16          (/dashboard/hr/payroll/year-end)
├── INSIGHTS (expandable section)
│   ├── Attendance Reports          (/dashboard/hr/reports)
│   ├── Payroll Reports             (/dashboard/hr/payroll/reports)
│   ├── Exports                     (/dashboard/hr/payroll/exports)
│   └── Audit Log                   (/dashboard/hr/payroll/audit-log)
├── SETUP (expandable section)
│   ├── ORGANIZATION (label)
│   │   ├── Office Locations        (/dashboard/hr/attendance/locations)
│   │   ├── Work Shifts             (/dashboard/hr/attendance/shifts)
│   │   ├── Attendance Policies     (/dashboard/hr/attendance/policies)
│   │   ├── Complimentary Off Policies (/dashboard/hr/attendance/comp-off-policies)
│   │   ├── Holidays                (/dashboard/hr/attendance/holidays)
│   │   └── Weekly Offs             (/dashboard/hr/attendance/weekly-offs)
│   ├── LEAVE (label)
│   │   ├── Leave Types             (/dashboard/hr/leaves/types)
│   │   ├── Leave Policies          (/dashboard/hr/leaves/policies)
│   │   └── Automation              (/dashboard/hr/leaves/automation)  — "Automation Engine" for leave balances
│   ├── (no group label; payroll setup)
│   │   ├── Salary Components       (/dashboard/hr/payroll/components)
│   │   ├── Structure Templates     (/dashboard/hr/payroll/templates)
│   │   ├── Benefit Plans           (/dashboard/hr/payroll/benefits)
│   │   ├── Payroll Settings        (/dashboard/hr/payroll/settings)
│   │   └── Automation              (/dashboard/hr/payroll/automation)  — "Automatic jobs" for payroll
├── ME (expandable section, HR user's own self-service records)
│   ├── My Attendance               (/dashboard/hr/my-attendance)
│   ├── My Regularizations          (/dashboard/hr/my-attendance/regularizations)
│   ├── My Flags                    (/dashboard/hr/my-attendance/anomalies)
│   ├── My Overtime                 (/dashboard/hr/my-attendance/overtime)
│   ├── My Complimentary Offs       (/dashboard/hr/my-attendance/comp-offs)
│   ├── My Claims                   (/dashboard/hr/my-reimbursements)
│   └── My Salary & Bank            (/dashboard/hr/my-salary)
├── Help Center 8 (sidebar footer)
└── Setting (sidebar footer)
```

Notes:
- Two distinct sidebar links are both labeled **"Automation"** (one under LEAVE, one under the payroll setup group); they open different pages (Leave "Automation Engine" vs Payroll "Automatic jobs").
- The sidebar sections PEOPLE, TIME & LEAVE, PAYROLL, TAX & COMPLIANCE, INSIGHTS, SETUP, ME are expandable/collapsible buttons; all were expanded during the audit.
- There are no breadcrumbs on most pages; the Employee Profile page shows a breadcrumb **"Team / [Employee Name]"**.

---

## 4. Dashboard

### 4.1 Dashboard Overview
**Navigation:** Click **Dashboard** in the left sidebar (URL `/dashboard/hr`).
**Page content:**
- Purple banner: eyebrow **"HR COMMAND CENTER"**, heading **"Welcome back, [HR Admin Email]"**, subtext **"Monitor live attendance, rules, shift rosters and holidays."**
- A "Live" indicator (**"Live · updated 03:38 am"**) and a **"Refresh live counts"** button (read-only refresh; not clicked).
- Four stat cards, Team Performance chart, Department overview, and an embedded Attendance Directory.

### 4.2 Dashboard Widgets (per widget: name / represents / shows / click-navigates-to)
1. **Total org personnel** — represents the headcount of the organization. Shows **8**. Clicking was not observed to navigate anywhere.
2. **Present today** — represents employees clocked in today. Shows **0**. Non-navigating.
3. **Absent today** — represents employees absent today. Shows **8**. Non-navigating.
4. **Late arrivals** — represents late check-ins today. Shows **0**. Non-navigating.
5. **Team Performance** — a bar chart of daily On time / Late / Absent counts. Shows "September 2026" with month navigation (**"Previous month"** and **"Next month"** buttons, both disabled at the time of audit) and day pagination (**"Earlier days"** disabled, **"1/2"**, **"Later days"**, dates 10, 11, 14, 15). Clicking Later days moves through the month's days. The bars for the current period show all-absent (matching 8 Absent today).
6. **Department overview · 21 Sept** — today's attendance by department. Has a date picker ([Date]) and a **"View all (4)"** button. Cards show: **Sales And Markerting** (2 members, 0% PRESENT), **IT Department** (5 members, 0% PRESENT), **Unassigned** (1 member, 0% PRESENT). Each card also shows **LATE (OF PRESENT)** and **ON LEAVE** metrics. Clicking **"View all (4)"** opens an **"All departments"** dialog listing 4 departments (adds **HR Department**, 0 members) with a Close button.
7. **Attendance Directory** (embedded) — today's organization-wide attendance records (same module as TIME & LEAVE → Live Attendance; see Module 8). Tabs **Employees** / **Managers** / **HR**, **"Search people"** searchbox, **"Filter by status"** combobox, Previous/Next day buttons, date picker ([Date]), Refresh button. Each employee row is a link **"Open [Name]'s attendance"** that navigates to that employee's profile page on the Attendance tab (`/dashboard/hr/employees/<id>?tab=attendance`).

### 4.3 Dashboard Navigation
- Stat cards do not navigate.
- **"View all (4)"** → opens the "All departments" dialog.
- **"Open [Name]'s attendance"** links → Employee Profile page, Attendance tab (verified cross-navigation: Dashboard → Attendance Directory → Employee Profile → Attendance).
- All sidebar modules and top-bar items are reachable from the Dashboard as described in Section 3.

---

## 5. HR Inbox

### 5.1 Module Overview
The HR Inbox is the HR's approval worklist: everything waiting for HR action across the organization.

### 5.2 Navigation
Click **HR Inbox** in the left sidebar (URL `/dashboard/hr/inbox`). The sidebar link carries a badge **4** (3 regularizations + 1 overtime).

### 5.3 Available Information
- Heading **"HR Inbox"**, subtext **"4 items waiting across the organisation."**, **"Refresh"** button.
- **TIME & LEAVE** section with summary cards (clicking a card filters the list below):
  - **"0 Leave requests"** — Leave and cancellation requests. Button text: "Review here".
  - **"3 Regularizations"** — "Missed or wrong punches to fix". Subtext: "Showing below" (selected card).
  - **"1 Overtime"** — "Extra hours waiting for approval". Button text: "Review here".
  - **"0 Complimentary Offs"** — "Holiday work to credit". Button text: "Review here".
  - **"0 Attendance flags"** — "Unusual attendance to resolve". Button text: "Review here".
- **PAYROLL & TAX** section: **"0 Salary approvals"**, **"0 Claims"**, **"0 Loans & advances"**, **"0 Tax declarations"**, plus a note: "Bank accounts waiting for verification are listed under Payroll → Bank Verification."

### 5.4 Tables
**Pending regularizations** — columns: EMPLOYEE, DATE, RECORDED, REQUESTED, MODE, REASON.
- EMPLOYEE: name, employee code, designation (all 3 rows: [Employee Name], [Employee ID], Backend Engineer).
- DATE: 17 / 18 / [Date].
- RECORDED: "No record" (17, 18 Sept) / "10:36 am – 10:36 am" (19 Sept).
- REQUESTED: "11:00 am → 07:00 pm" / "10:00 am → 06:30 pm" / "11:00 am → 07:00 pm".
- MODE: "N/A" / "Office" / "N/A".
- REASON: "Couldn't Sign In" (all 3).
**Pending overtime** — columns: EMPLOYEE, DATE, OVERTIME, SHIFT, WORKED, EFFECTIVE.
- [Employee Name] ([Employee ID] · Backend Engineer), [Date], **2h 32m**, Morning Shift 10:00 am – 06:00 pm, Worked "09:56 am – 07:28 pm", Effective "9h 32m".

### 5.5 Filters / 5.6 Search / 5.7 Read-Only Actions
- **"Search by name or code…"** textbox (filters the table by text).
- Tabs: **All (3)** / **Employees (3)** / **Managers (0)** / **HR (0)** (counts update per category).
- **"Refresh"** button.
- Summary cards switch the queue being shown (Regularizations / Overtime / etc.).

### 5.8 Details Pages
Not explored: rows hint at a review dialog ("Click a row to review and decide." on the Pending regularizations list), but opening rows was avoided because the dialog would expose Approve/Reject actions. Listed in Areas Not Explored.

### 5.9 Cross Navigation
Bank accounts awaiting verification are cross-referenced: note under PAYROLL & TAX points to **Payroll → Bank Verification**.

## 6. Team

### 6.1 Module Overview
The Team Directory lists all organization personnel and pending invitations.

### 6.2 Navigation
Click **Team** under PEOPLE (URL `/dashboard/hr/employees`).

### 6.3 Available Information
- Heading **"Team Directory"**, subtext **"Manage all organization personnel and pending invitations."**
- Button **"Invite Member"** (invite action).
- 8 member cards, each with photo/avatar, name, role chip, department, and a status note:
  1. [HR Admin Email] — **HR**, "Human Resources"
  2. [Employee Name] — **MANAGER**, "IT Department"
  3. [Employee Name] — (department/role not rendered in the accessibility tree; card present)
  4. [Employee Name] — (card present)
  5. [Employee Name] — "Sales And Markerting"
  6. [Employee Name] — (card present)
  7. [Employee Name] — (card present)
  8. [Employee Name] — (card present)
- Every card shows **"No employee code on file"** even though employee codes exist elsewhere in the app ([Employee ID]…[Employee ID], [Employee ID], [Employee ID]).

### 6.4 Tables
No table; card grid.

### 6.5 Filters / 6.6 Search
- **"Search member or email…"** textbox (filters cards by name/email).

### 6.7 Read-Only Actions
- Search only. The **"Invite Member"** button was not clicked.

### 6.8 Details Pages
- Cards are not links in this view; employee details are reached via the Attendance Directory's "Open [Name]'s attendance" links (see Employee Profile module).

## 7. Departments

### 7.1 Module Overview
Manage organizational departments and assignments.

### 7.2 Navigation
Click **Departments** under PEOPLE (URL `/dashboard/hr/departments`).

### 7.3 Available Information
- Heading **"Departments"**, subtext **"Manage organizational departments and assignments."**
- Button **"Add Department"**.
- 3 department cards:
  1. **HR Department** — ACTIVE. Description: "This is the HR Department. All the departments comes under this department." Location: "HEAD OFFICE". Member shown: [HR Admin Email].
  2. **Sales And Markerting** — ACTIVE (note spelling). Description: "This is the Sales And Marketing Department for the sales and marketing personals." Location: "HEAD OFFICE". Member shown: [Employee Name].
  3. **IT Department** — ACTIVE. Description: "This is the IT department for all the Tech employees."

### 7.4 Tables
No table; card grid.

### 7.5 Filters / 7.6 Search
- **"Search department..."** textbox.

### 7.7 Read-Only Actions
- Search only.

### 7.8 Details Pages
- Each card has an unlabeled button that opens an **"Edit Department"** dialog (DEPARTMENT NAME*, LOCATION combobox, HEAD OF DEPARTMENT combobox, Description, "Department is Active" checkbox, Cancel / Save Department). The dialog was closed with **Cancel** without changing anything. The Edit flow is otherwise not explored (see Areas Not Explored).
- The **"Add Department"** and **"Save Department"** buttons were not clicked.

## 8. Live Attendance (Attendance Directory)

### 8.1 Module Overview
View and manage organization-wide attendance records for any date, split by Employees / Managers / HR.

### 8.2 Navigation
Click **Live Attendance** under TIME & LEAVE (URL `/dashboard/hr/attendance/directory`).

### 8.3 Available Information
- Heading **"Attendance Directory"**, subtext **"View and manage attendance records for the organization."**
- Tabs **Employees** (selected) / **Managers** / **HR**.
- **"Search people"** textbox, **"Filter by status"** combobox, **"Previous day"** / **"Next day"** buttons, **"Attendance date"** date picker (Month/Day/Year spinbuttons + "Show date picker"), **"Refresh"** button.

### 8.4 Tables
Columns: CODE, NAME, DEPARTMENT, STATUS, CLOCK IN, CLOCK OUT, HOURS.
- **Employees tab ([Date]):** 6 records, all **"Not Marked"** / "Not clocked in" / "—": [Employee ID] [Employee Name] (IT Department, Frontend Developer); [Employee ID] [Employee Name] (Sales And Markerting, Marketing Person); [Employee ID] [Employee Name] (Sales And Markerting, Marketing Person); [Employee ID] [Employee Name] (IT Department, Frontend App Developer); [Employee ID] [Employee Name] (IT Department, Backend Engineer); [Employee ID] [Employee Name] (IT Department, Backend Engineer).
- **Managers tab:** 1 record — [Employee ID] [Employee Name], IT Department, Team Manager, Not Marked.
- **HR tab:** 1 record — [Employee ID], NAME shown as **"[HR Admin Email]"** (no display name), DEPARTMENT "Human Resources HR Administrator" (concatenated rendering), Not Marked.
- "6records" / "1record" footer text (missing space).

### 8.5 Filters
- **"Filter by status"** combobox options: All statuses (selected), Present, Absent, Half day, On leave, Holiday, Weekly off.

### 8.6 Search
- **"Search people"** filters the table by name.

### 8.7 Read-Only Actions
- Tab switching, date navigation (verified: **"Previous day"** moves [Date] → [Date] and reloads the table; **"Next day"** is disabled on the current day), search, status filter, Refresh.
- On [Date] the table shows real data: [Employee Name] — Present, 09:56 am → 07:28 pm, 9h 32m; [Employee Name] — Weekly Off; others — Not clocked in.

### 8.8 Details Pages
- Each row is a link **"Open [Name]'s attendance"** → Employee Profile, Attendance tab.

### 8.9 Cross Navigation
- Dashboard → Attendance Directory → Employee Profile (Attendance) — verified.

## 9. Leave Requests

### 9.1 Module Overview
Organization-wide leave queue, including escalated requests; review leave requests.

### 9.2 Navigation
Click **Leave Requests** under TIME & LEAVE (URL `/dashboard/hr/leaves/requests`).

### 9.3 Available Information
- Heading **"Leave Requests"**, subtext **"Review the organisation-wide leave queue, including escalated requests. Click a row to see the full request."**
- Buttons **"Pending Queue"** (selected) and **"All History"**.
- **"Search by employee or leave type…"** textbox.

### 9.4 Tables
- **Pending Queue:** empty state **"All caught up!"** / **"No pending leave requests across the organisation."**.
- **All History:** columns EMPLOYEE, LEAVE TYPE, DATES, DAYS, APPLIED ON, STATUS. 2 rows:
  1. [Employee Name] ([Employee Email]) — Festival Leave — [Date] — **0.5 days Second half** — Applied [Date] — **Approved**.
  2. [Employee Name] ([Employee Email]) — Emergency Leave — [Date] — 1 day — Applied [Date] — **Approved**.
- Pagination: "Page 1", Prev/Next disabled (single page).

### 9.5 Filters
- Status filter combobox: All statuses, Pending, Approved, Rejected, Cancelled, Cancellation Pending, Terminated Cancelled.
- Employee filter combobox: All employees, [HR Admin Email].

### 9.6 Search
- **"Search by employee or leave type…"** text search.

### 9.7 Read-Only Actions
- Tab switching (Pending Queue / All History), filters, search, pagination.

### 9.8 Details Pages
- Clicking a row opens a **"LEAVE REQUEST"** detail dialog (verified on [Employee Name]'s row): employee name + email, status **"APPROVED"**, Close button. Leave details grid: LEAVE TYPE Emergency Leave; FROM [Date]; TO [Date]; TOTAL 1 day; HALF DAY No; PAID 1 day; UNPAID 0 days; APPLIED ON [Date]. Reason: **"bimaar hu"** (verbatim user-entered text).
- The dialog contains no Approve/Reject buttons for already-approved requests; it was closed with Close.

## 10. Regularizations

### 10.1 Module Overview
Pending attendance correction requests across the organisation; HR can approve or reject them.

### 10.2 Navigation
Click **Regularizations** under TIME & LEAVE (URL `/dashboard/hr/attendance/regularizations`).

### 10.3 Available Information
- Heading **"Regularizations"**, subtext **"Pending attendance correction requests across the organisation. HR can approve or reject any of them."**
- Verbatim UI admission: **"Only pending requests are listed. An organisation-wide history of approved and rejected corrections isn't available from the server yet — each employee's own history shows their past requests."**
- **"Search by name or code…"** textbox; tabs **All (3)** / **Employees (3)** / **Managers (0)** / **HR (0)**; **"Refresh"** button.

### 10.4 Tables
Columns: EMPLOYEE, DATE, RECORDED, REQUESTED, MODE, REASON.
- [Employee Name] ([Employee ID] · Backend Engineer) — [Date] — "No record" — "11:00 am → 07:00 pm" — "N/A" — "Couldn't Sign In".
- [Employee Name] — [Date] — "No record" — "10:00 am → 06:30 pm" — "Office" — "Couldn't Sign In".
- [Employee Name] — [Date] — "10:36 am – 10:36 am" — "11:00 am → 07:00 pm" — "N/A" — "Couldn't Sign In".

### 10.5 Filters / 10.6 Search
- Role tabs (All/Employees/Managers/HR); text search by name or code.

### 10.7 Read-Only Actions
- Tabs, search, Refresh. No row-level approve/reject controls are visible on this page; approval happens from the HR Inbox review flow (not explored).

## 11. Complimentary Offs (organization-wide)

### 11.1 Module Overview
Organization-wide compensatory days. HR can approve or reject earned credits on the manager's behalf.

### 11.2 Navigation
Click **Complimentary Offs** under TIME & LEAVE (URL `/dashboard/hr/attendance/comp-offs`).

### 11.3 Available Information
- Heading **"Complimentary Offs"**, subtext **"Organisation-wide compensatory days. HR can approve or reject earned credits on the manager's behalf"**.
- Tabs: **Earned** (selected) / **Approved** / **Used** / **Expired** / **Rejected / cancelled** / **All**.

### 11.4 Tables
- Columns (visible on Approved tab): (select-all checkbox), EMPLOYEE, EARNED DATE, TYPE, HOURS WORKED, STATUS, ACTIONS.
- **Earned:** empty state **"No earned complimentary offs found."**
- **Approved:** empty state **"No approved complimentary offs found."** (Used, Expired, Rejected / cancelled, All tabs were not individually opened but no data exists; the organization has no comp-off records.)

### 11.5–11.7 Filters / Search / Read-Only Actions
- Tab switching only. No search or filter controls on this page.

## 12. Shift Roster

### 12.1 Module Overview
View and manage which schedule each employee follows.

### 12.2 Navigation
Click **Shift Roster** under TIME & LEAVE (URL `/dashboard/hr/attendance/roster`).

### 12.3 Available Information
- Heading **"Shift Roster"**, subtext **"View and manage shift assignments for all employees."**
- Button **"Assign Shift"**.
- Tabs: **All** (selected) / **Ongoing** / **Upcoming** / **Ended**.
- **"Search employee, code or shift…"** textbox.

### 12.4 Tables
Columns: EMPLOYEE, EMP. CODE, SCHEDULE, EFFECTIVE FROM, VALID UNTIL, ACTIONS.
- 8 records, all on **Morning Shift 10:00 – 18:00**, all **Ongoing**:
  - [HR Admin Email] ([Employee ID]) — effective [Date]
  - [Employee Name] ([Employee ID], [Employee Email]) — [Date]
  - [Employee Name] ([Employee ID], [Employee Email]) — [Date]
  - [Employee Name] ([Employee ID], [Employee Email]) — [Date]
  - [Employee Name] ([Employee ID], [Employee Email]) — [Date]
  - [Employee Name] ([Employee ID], [Employee Email]) — [Date]
  - [Employee Name] ([Employee ID], [Employee Email]) — [Date]
  - [Employee Name] ([Employee ID], [Employee Email]) — [Date]
- ACTIONS column: collapsed per-row action menus (**"Actions for [Name]"**) — not opened (uncertain; likely contain edit/unassign).

### 12.5 Filters / 12.6 Search
- Status tabs (All/Ongoing/Upcoming/Ended); text search across employee, code, or shift.

### 12.7 Read-Only Actions
- Tab switching, search. **"Assign Shift"** and row action menus were not opened.

## 13. Lock Attendance

### 13.1 Module Overview
Freeze attendance data for payroll processing; run maintenance tasks.

### 13.2 Navigation
Click **Lock Attendance** under PAYROLL (URL `/dashboard/hr/attendance/lock-periods`).

### 13.3 Available Information
- Heading **"Period Locking & Maintenance"**, subtext **"Freeze attendance for payroll processing and run maintenance tasks."**
- Button **"Lock period"**.
- **Lock periods** table. Columns: PERIOD, REASON, SOURCE, LOCKED, ACTIONS. 1 row: **[Date] — [Date]** | Reason "Payroll run 2026-08" | Source "Payroll run" | Locked "[Date], 08:25 am" | **"Unlock"** button.
- **Recompute stale records** section: "Fixes records stuck "in progress" even though a clock-out exists. Leave the date empty to sweep all" + optional Date picker + **"Recompute"** button.

### 13.5–13.7 Filters / Search / Read-Only Actions
- None on this page.

## 14. Adjustments

### 14.1 Module Overview
One-time salary additions and deductions (bonuses, recoveries) with an approval workflow.

### 14.2 Navigation
Click **Adjustments** under PAYROLL (URL `/dashboard/hr/payroll/adjustments`).

### 14.3 Available Information
- Heading **"Salary Adjustments"**, subtext **"One-time additions and deductions, such as bonuses or recoveries. Open a row to see its details and approve, reject or cancel it."**
- Buttons **"Bulk upload"** and **"New adjustment"**.
- **"Filter this page"** textbox; Status combobox; Pay month combobox; Type combobox; Category combobox; **"Refresh"** button.

### 14.4 Tables
Columns: EMPLOYEE, PAY MONTH, TYPE, COMPONENT, AMOUNT, ADDED VIA, STATUS.
- 28 adjustments, **"Page 1 of 2"** (Prev/Next pagination).
- Page 1 (September 2026): "Ganesh Chaturthy" +[Amount] rows for [HR Admin Email], [Employee Name], [Employee Name], [Employee Name], [Employee Name], [Employee Name], [Employee Name] (all APPROVED, via Bonus rules); **"Employee not found N/A"** +[Amount] (APPROVED, via Bonus rules); [Employee Name] "Personal Bonus" +[Amount] (APPROVED); [Employee Name] "Ganesh Chaturthy Bonus" +[Amount] **CANCELLED**.
- Page 1 also lists October 2026 rows: "Diwali Bonus" +[Amount] for all personnel (APPROVED), plus a second **"Employee not found N/A"** +[Amount] (APPROVED).

### 14.5 Filters
- Status: All statuses, Waiting for approval, Approved, Rejected, Cancelled.
- Pay month: Any month, March 2027 … March 2025.
- Type: Additions & deductions, Additions only, Deductions only.
- Category: Any category, Bonus, Incentive, One-time addition, Recovery, One-time deduction, Arrear.
- Text filter ("Filter this page").

### 14.6 Search
- The "Filter this page" textbox filters rows by text.

### 14.7 Read-Only Actions
- Filters, text filter, Refresh, pagination.

### 14.8 Details Pages
- Clicking a row opens a **"SALARY ADJUSTMENT"** detail dialog (verified on [Employee Name]'s row): employee name, [Employee ID] · September 2026, AMOUNT +[Amount] TYPE/CATEGORY/COMPONENT values, "Where it stands" section (STATUS APPROVED, PAY MONTH September 2026, ADDED VIA Bonus rules, "IN AN APPROVED PAYROLL: Not yet", PROPOSED BY [HR Admin Email], CREATED ON [Date], APPROVED OR REJECTED BY, DECIDED ON, USED IN PAYROLL ON, COMPONENT CODE, REASON "Bonus For Ganesh Chaturthy"), **"Tax & contributions"** section (TAXABLE: Yes, COUNTS FOR PF, COUNTS FOR ESI with note "Bonuses and incentives are never counted when deciding ESI coverage"), and buttons **"Open bonus rules"**, **"Show the whole upload"**, **"Cancel the whole upload"**, **"Cancel adjustment"** (the Cancel buttons are mutations). Closed with Close.

## 15. Bonus Rules

### 15.1 Module Overview
Pay a bonus to a group at once: create, preview the cost, approve, then apply.

### 15.2 Navigation
Click **Bonus Rules** under PAYROLL (URL `/dashboard/hr/payroll/bonus-rules`).

### 15.3 Available Information
- Heading **"Bonus Rules"**, subtext **"Pay a bonus to a group at once. Create, preview the cost, approve, then apply. Open a rule to review"**.
- Button **"New bonus rule"**.
- Status combobox; Paid in combobox; Calculation combobox; **"Refresh"** button.

### 15.4 Tables
Columns: RULE, PAID IN, CALCULATION, WHO QUALIFIES, MOST PER PERSON, STATUS. 4 rules, all **APPROVED** with **"APPLIED · 9 PEOPLE"** (or 1 PERSON):
1. **Personal Bonus** — "Personal Bonus as you did a excellent job this month" — September 2026 — % of basic pay 5% — 1 employee — No cap — APPROVED · APPLIED · 1 PERSON.
2. **Ganesh Chaturthy Bonus** — "For Ganesh Chaturthy" — September 2026 — Fixed amount [Amount] — Everyone — No cap — APPROVED · APPLIED · 9 PEOPLE.
3. **Diwali Bonus** — "Diwali Bonus For All" — October 2026 — Fixed amount [Amount] — Everyone — No cap — APPROVED · APPLIED · 9 PEOPLE.
4. **Ganesh Chaturthy Bonus** — "Bonus For Ganesh Chaturthy" — September 2026 — Fixed amount [Amount] — Everyone — No cap — APPROVED · APPLIED · 9 PEOPLE.

### 15.5 Filters
- Status: All statuses, Waiting for approval, Approved, Rejected, Cancelled.
- Paid in: Any month, September 2027 … March 2025.
- Calculation: Any calculation, % of basic pay, % of gross pay, Fixed amount.

## 16. Claims (Reimbursements)

### 16.1 Module Overview
Review every claim in the organisation and keep the category catalog employees claim against.

### 16.2 Navigation
Click **Claims** under PAYROLL (URL `/dashboard/hr/payroll/reimbursements`).

### 16.3 Available Information
- Heading **"Reimbursements"**, subtext **"Review every claim in the organisation and keep the category catalog employees claim against."**
- Tabs: **Claims** (selected) / **Categories**.

### 16.4 Tables
- **Claims tab:** columns EMPLOYEE, CATEGORY, AMOUNT, SUBMITTED, STATUS. 
- **Categories tab** (URL `.../reimbursements?tab=categories`): columns CATEGORY, TAX, RECEIPT, PER CLAIM, PER PERIOD, STATUS.  Button **"New category"**.

### 16.5 Filters
- Claims: Status combobox (All statuses, Submitted, Waiting for HR (after manager), Approved, Paid, Rejected, Withdrawn), Category combobox (Any category; no options present), Pay month combobox (Any pay month, Mar 2027 … Mar 2025), Employee combobox (Any employee + 8 named employees with codes), Submitted from/to date pickers, **"Refresh"** button.
- Categories: **"Filter categories"** textbox, Status combobox (Active selected; Inactive, All), Refresh.

### 16.6 Search
- Claims: **"Search employee"** textbox + "Filter this page" textbox.

### 16.7 Read-Only Actions
- Tab switching, filters, search, Refresh.

## 17. Loans & Advances

### 17.1 Module Overview
Grant company loans and salary advances with an auto-generated EMI schedule; click a row to see its details.

### 17.2 Navigation
Click **Loans & Advances** under PAYROLL (URL `/dashboard/hr/payroll/loans`).

### 17.3 Available Information
- Heading **"Loans & Advances"**, subtext **"Grant company loans and salary advances with an auto-generated EMI schedule. Click a row to see its …"**
- Button **"Grant Loan"**.
- Status combobox (options: All statuses, Pending, Active, Closed, Foreclosed, Rejected, Cancelled).

### 17.4 Tables
Columns: EMPLOYEE, TYPE, PRINCIPAL, INTEREST, EMI, TENURE, OUTSTANDING, STATUS, ACTIONS.
1. [Employee Name] (first EMI Sep 2026) — Loan — [Amount] — 0% Flat — [Amount] — 6 mo — Outstanding [Amount] — **ACTIVE** — "Foreclose" / "Cancel" buttons.
2. [Employee Name] — Loan — [Amount] — 0% Reducing Balance — [Amount] — 3 mo — Outstanding [Amount] — **CANCELLED** (no actions).
3. [Employee Name] (first EMI Sep 2026) — Loan — **[Amount]** — EMI [Amount] — 6 mo — Outstanding [Amount] — **ACTIVE** — "Foreclose" / "Cancel" buttons.

### 17.5 Filters / 17.6 Search
- Status combobox only.

### 17.7 Read-Only Actions
- Status filtering. Row action buttons (Foreclose/Cancel) were not clicked.

## 18. Encashments

### 18.1 Module Overview
Pay people for comp-offs and unused leave instead of them taking the time off.

### 18.2 Navigation
Click **Encashments** under PAYROLL (URL `/dashboard/hr/payroll/encashments`).

### 18.3 Available Information
- Heading **"Encashments"**, subtext **"Pay people for comp-offs and unused leave instead of them taking the time off."**
- Button **"Pay out a balance"**.
- Filters: status combobox (All requests, Waiting for approval, Approved, Rejected, Cancelled), payout-type combobox (Comp-offs and leave, Comp-off, Leave balance), pay-month pickers (Month/Year spinbuttons, unset).

### 18.4 Tables
-  / **"Requests raised by you or proposed by managers will appear here."**

## 19. Exits & Settlements

### 19.1 Module Overview
Record a last working day, then work out and pay the final settlement.

### 19.2 Navigation
Click **Exits & Settlements** under PAYROLL (URL `/dashboard/hr/payroll/exits`).

### 19.3 Available Information
- Heading **"People leaving"**, subtext **"Record a last working day, then work out and pay the final settlement."**
- Button **"Record someone leaving"**.
- **"Filter by stage"** combobox: Everyone (selected), Recorded, Settlement ready, Settled, Cancelled.

### 19.4 Tables
Columns: EMPLOYEE, TYPE, LAST WORKING DAY, NOTICE, STAGE, ACTIONS.
- 1 row: [Employee Name] — Resigned — [Date] — Full (notice) — **Recorded** — row buttons **"Final settlement"**, **"Change details"**, **"Cancel this exit"**.

## 20. Pay Differences

### 20.1 Module Overview
When something changes after a month has been paid, the difference is made up in the next open month.

### 20.2 Navigation
Click **Pay Differences** under PAYROLL (URL `/dashboard/hr/payroll/arrears`).

### 20.3 Available Information
- Heading **"Pay Differences"**, subtext **"When something changes after a month has been paid, the difference is made up in the next open month"**.
- **"Check a month for differences"** section: "Compares what a closed month would pay today against what it actually paid. Nothing changes until you choose to pay." + MONTH TO CHECK pickers (Month: August, Year: 2026) + **"Check for differences"** button (NOT clicked — uncertain whether it creates draft records).
- **"Already paid out"** section: status filter (All, Waiting for approval, Approved, Paid, Rejected, Cancelled), month filter;  / **"Differences you choose to pay will be listed here with where they came from."**

### 20.7 Read-Only Actions
- Filters only.

## 21. Bank Verification

### 21.1 Module Overview
Review and verify employee bank accounts before they receive salary payments.

### 21.2 Navigation
Click **Bank Verification** under PAYROLL (URL `/dashboard/hr/payroll/bank-verification`).

### 21.3 Available Information
- Heading **"Bank Verification"**, subtext **"Review and verify employee bank accounts before they receive salary payments. Click a row to see its details."**
- **"Refresh"** button (disabled while fresh).
- Tabs: **ALL EMPLOYEES 8** / **VERIFIED 7** / **AWAITING 1** / **NO ACCOUNT 0**.
- **"Search by name or code…"** textbox.

### 21.4 Tables
Columns: EMPLOYEE, BANK, ACCOUNT, STATUS.
- [HR Admin Email] ("YOU", Human Resources) — [Bank Name] — [Bank Account Number] — **AWAITING VERIFICATION**.
- [Employee Name] (IT Department) — [Bank Name] — [Bank Account Number] — VERIFIED.
- [Employee Name] (IT Department) — [Bank Name] — [Bank Account Number] — VERIFIED.
- [Employee Name] (IT Department) — [Bank Name] — [Bank Account Number] — VERIFIED.
- [Employee Name] (Sales And Markerting) — [Bank Name] — [Bank Account Number] — VERIFIED.
- [Employee Name] (Sales And Markerting) — [Bank Name] — [Bank Account Number] — VERIFIED.
- [Employee Name] (IT Department) — [Bank Name] — [Bank Account Number] — VERIFIED.
- [Employee Name] (IT Department) — [Bank Name] — [Bank Account Number] — VERIFIED.

### 21.5 Filters / 21.6 Search / 21.7 Read-Only Actions
- Status tabs; name/code search; Refresh.

### 21.8 Details Pages
- Clicking a row opens a **"BANK ACCOUNT"** detail dialog (verified on the HR user's own account): employee name, "Human Resources", "YOUR ACCOUNT", status "AWAITING VERIFICATION"; Employee section (DEPARTMENT, EMPLOYEE CODE [Employee ID]); Account details: ACCOUNT HOLDER **"[Company Name]"**, ACCOUNT NUMBER [Bank Account Number], IFSC CODE **"[IFSC Code]"**, BANK [Bank Name], BRANCH Mumbai, ACCOUNT TYPE **"savings"**; VERIFIED ON: **"You can't verify your own bank account. Another HR user has to check it against your passbook or a c…"** (verbatim; truncated). No Verify/Reject buttons exist on one's own account. Closed with Close.
- Review dialogs for other employees' accounts were not opened (they would expose Verify/Reject actions).

## 22. Payroll Runs

### 22.1 Module Overview
Work out, check, approve and pay each month's salaries.

### 22.2 Navigation
Click **Payroll Runs** under PAYROLL (URL `/dashboard/hr/payroll/runs`).

### 22.3 Available Information
- Heading **"Payroll Runs"**, subtext **"Work out, check, approve and pay each month's salaries. Click a run to open it."**
- Button **"Start new run"**.
- SHOW status combobox: All runs, Draft, Calculating, Ready for review, Calculation failed, Approved, Paid, Cancelled.
- **"Filter by run type"** combobox: All kinds, Regular monthly payroll, Off-cycle payment, Final settlement.
- **"Refresh"** button.

### 22.4 Tables (run cards)
6 run cards:
1. **September 2026** — **READY FOR REVIEW** — "[Date] to [Date] · Calculated [Date]" — EMPLOYEES 8, GROSS [Amount] DEDUCTIONS [Amount] NET [Amount] — button **"Review & approve: September 2026"**.
2–5. **September 2026 — Cancelled** (×4, cancelled 18–[Date]; reasons: "Calculation Error", "Calculation Mistake", "Calculation Mismatch", "Calculation Mismatched."; one card shows "Start new run" text).
6. **August 2026 — PAID** — "Paid on [Date]" — "1 excluded" — EMPLOYEES 1, GROSS [Amount] DEDUCTIONS [Amount] NET [Amount] — data defect (see Quality Findings).

### 22.5 Filters / 22.6 Search / 22.7 Read-Only Actions
- Status filter, run-type filter, Refresh. **"Start new run"** was not clicked.

### 22.8 Details Pages
- Clicking **"Review & approve: September 2026"** opens the run detail page (`/dashboard/hr/payroll/runs/<id>`):
  - Breadcrumb **"All runs"** button (returns to the runs list).
  - "Check the figures, fix any problems, then approve." — period "[Date] to [Date] · Calculated [Date]".
  - Buttons: **Refresh**, **Recalculate**, **Approve**; **Cancel run** disabled ("unavailable until approved").
  - "No problems".
  - GROSS PAY [Amount]; Cost to company [Amount]; DEDUCTIONS [Amount]; NET PAY [Amount]
  - "Bonuses, adjustments & loans": ADDITIONS & BONUSES [Amount]; ADJUSTMENT DEDUCTIONS [Amount]; LOAN RECOVERY [Amount]; SHORTFALL RECOVERED [Amount]; SHORTFALL CARRIED FORWARD [Amount]; LOAN INSTALMENTS SKIPPED 0; PAY SET TO [Amount]: 0.
  - "Tax & statutory": PF (EMPLOYEE) [Amount]; PF (EMPLOYER) [Amount]; PENSION (EPS) [Amount]; ESI (EMPLOYEE) [Amount]; ESI (EMPLOYER) [Amount]; PROFESSIONAL TAX [Amount]; INCOME TAX (TDS) [Amount]; COVERED BY ESI 0; NO PAN ON FILE 0; NO PROFESSIONAL TAX TAKEN 0; STATUTORY MORE THAN PAY 0.
  - "Payslips": "Payslips are created when the run is approved. Approve it to see them here."
  - "Cost by department": IT Department — 5 employees · 49 unpaid days — [Amount] net · cost [Amount]; Human Resources — 1 employee · 20 unpaid days — [Amount] net · cost [Amount]; Sales And Markerting — 2 employees · 19 unpaid days — [Amount] net · cost [Amount]
  - Employee table (EMPLOYEE, STATUS, DAYS PAID / UNPAID, GROSS, NET): [Employee Name] (Calculated, 6/13, [Amount] [Amount]); [HR Admin Email] (Calculated, 10/20, [Amount] [Amount]); [Employee Name] (Calculated, 10/9, [Amount] [Amount]); [Employee Name] (Calculated, 10/9, [Amount] [Amount]); [Employee Name] (Calculated, 10/9, [Amount] [Amount]); [Employee Name] (Calculated, 9/10, [Amount] [Amount]); [Employee Name] (Calculated, 10/9, [Amount] [Amount]); [Employee Name] (Calculated, 10/9, [Amount] [Amount]).
  - Employee status tabs: Everyone (selected) / Calculated / Needs attention / Excluded / Waiting; "Filter this page by name or code" textbox.

## 23. Payslips & Documents

### 23.1 Module Overview
Every payslip issued to an employee, their yearly statement, and their Form 16 — including replaced versions.

### 23.2 Navigation
Click **Payslips & Documents** under PAYROLL (URL `/dashboard/hr/payroll/payslips`).

### 23.3 Available Information
- Heading **"Payslips & Documents"**, subtext **"Every payslip issued to an employee, their yearly statement and their Form 16 — including replaced a…"**
- EMPLOYEE combobox ([Employee Name] ([Employee ID]) selected; all 8 employees listed).
- Tabs: **Payslip history** (selected) / **Annual statement** / **Form 16**.
- **"Only current versions"** checkbox; **"Refresh"** button (disabled while fresh).

### 23.4 Tables
- **Payslip history** columns: PAY MONTH, VERSION, STATUS, EMPLOYEE CAN SEE IT, SENT, RELEASED, PUBLISHED. 4 rows (all September 2026, v 1, **WITHDRAWN**, "Yes" employee-can-see, NOT SENT, released 18–[Date]).
- **Annual statement** tab: FINANCIAL YEAR combobox (FY 2026-27 selected; FY 2024-25 … FY 2028-29); note text **"[Employee Name] 's pay"** (spacing); **"Download PDF"** button; table MONTH / GROSS / DEDUCTIONS / NET PAY / SOURCE with all cells **"N/A"** (12 months).
- **Form 16** tab: **"Form 16 — Part B"**; FY combobox; note **"Available once the financial year is finalised under Year-End & Form 16. Until then the figures can still move, so no certificate is issued."**; **"Download Form 16"** button.

### 23.5 Filters / 23.6 Search / 23.7 Read-Only Actions
- Employee selector, FY selector, "Only current versions" checkbox, tab switching, Refresh.

## 24. Employee Salaries (Salary Assignment)

### 24.1 Module Overview
Review current pay, then assign or revise salary structures.

### 24.2 Navigation
Click **Employee Salaries** under PAYROLL (URL `/dashboard/hr/payroll/employee-structures`).

### 24.3 Available Information
- Heading **"Salary Assignment"**, subtext **"Review current pay, then assign or revise salary structures."**

### 24.4 Tables
Columns: EMPLOYEE, DEPARTMENT, CURRENT CTC, EFFECTIVE FROM, ACTIONS.
- [HR Admin Email] — Human Resources — **[Amount]** — [Date] — History / Revise.
- [Employee Name] — IT Department — **[Amount]** — [Date].
- [Employee Name] — IT Department — [Amount]
- [Employee Name] — IT Department — [Amount]
- [Employee Name] — Sales And Markerting — [Amount]
- [Employee Name] — Sales And Markerting — [Amount]
- [Employee Name] — IT Department — [Amount]
- [Employee Name] — IT Department — [Amount]

### 24.5 Filters / 24.6 Search
- None on this page.

### 24.7 Read-Only Actions
- **"History"** buttons (read-only salary history panel). **"Revise"** buttons.

### 24.8 Details Pages
- Clicking **"History"** opens a **"Salary history"** panel (verified for [Employee Name]: "[Employee Name] · IT Department"): versions list — v4? (displayed) [Amount]/year, **Increment**, **APPROVED**, [Date]—Present, reason "New Increment"; [Amount] **Correction**, [Date]—[Date]; v2, [Date]—[Date], "Added PF Employee Component In The Salary Structure"; v1, **Initial**, [Date]—[Date]. Panel closed with its Close button.

## 25. Tax Declarations (Investment Declarations)

### 25.1 Module Overview
Review and verify employee tax-saving claims item by item.

### 25.2 Navigation
Click **Tax Declarations** under TAX & COMPLIANCE (URL `/dashboard/hr/payroll/tax-declarations`).

### 25.3 Available Information
- Heading **"Investment Declarations"**, subtext **"Review and verify employee tax-saving claims item by item. Open a row to review it."**
- FY combobox (FY 2026-27 selected; FY 2024-25 … FY 2028-29).
- Status combobox (Submitted selected; options: All statuses, Submitted, Under review, Verified, Partially verified, Rejected, Draft).

### 25.4 Tables
Columns: EMPLOYEE, FY, DECLARED, PROOF DEADLINE, STATUS, REOPEN.
- Empty state (FY 2026-27, All statuses): **"No declarations match this filter."** FY 2025-26 also checked — no declarations.

### 25.5 Filters / 25.6 Search / 25.7 Read-Only Actions
- FY and status comboboxes (both exercised — read-only).

## 26. Statutory & Tax (Statutory & Tax Setup)

### 26.1 Module Overview
Organisation-wide PF, ESI, Professional Tax and Income-Tax rules that drive every payroll run.

### 26.2 Navigation
Click **Statutory & Tax** under TAX & COMPLIANCE (URL `/dashboard/hr/payroll/statutory`).

### 26.3 Available Information
- Heading **"Statutory & Tax Setup"**, subtext **"Organisation-wide PF, ESI, Professional Tax and Income-Tax rules that drive every payroll run."**
- Tab-buttons: **"PF / ESI / PT / TDS"** (selected) / **"Professional Tax Slabs"** / **"Income-Tax Regimes"**.

### 26.4 Sections (PF / ESI / PT / TDS tab)
- **Provident Fund (PF):** EMPLOYEE RATE % 12; EMPLOYER RATE % 12; WAGE CEILING ₹ 15000; "Restrict to ceiling" [checked]; "LOP reduces ceiling" [checked]; "Include overtime in wage" [unchecked]; ADMIN CHARGE % 0.5; ADMIN CHARGE MIN ₹ 0.
- **Pension (EPS) & EDLI:** EPS RATE % 8.33; EPS WAGE CEILING ₹ 15000; EDLI enabled [checked]; EDLI RATE % 0.5; EDLI WAGE CEILING ₹ 15000.
- **Employee State Insurance (ESI):** EMPLOYEE RATE % 0.75; EMPLOYER RATE % 3.25; GROSS THRESHOLD ₹ 21000; "Include overtime" [checked].
- **Professional Tax (PT):** "State-wise slabs are managed in the Professional Tax Slabs tab."
- **Income Tax / TDS:** NO-PAN TDS RATE % 20; "Enforce No-PAN rate" [checked]; HEALTH & EDUCATION CESS % 4.
- **"Reset"** and **"Save Changes"** buttons (both disabled; mutations). No form field was changed.
- **Professional Tax Slabs** tab: empty state **"No PT slabs configured yet."** + **"Add State Slabs"** button.
- **Income-Tax Regimes** tab: FY combobox (FY 2026-27; FY 2024-25 … FY 2028-29); **"No regimes for FY 2026-27. Click Bootstrap Tax Tables."** + **"Bootstrap Tax Tables"** button.

### 26.5–26.7 Filters / Search / Read-Only Actions
- Tab switching, FY selector. No data entry was performed.

## 27. Year-End & Form 16 (Year-End Closure & Form 16)

### 27.1 Module Overview
Statutory challan summary, FY finalization, and per-employee Form 16.

### 27.2 Navigation
Click **Year-End & Form 16** under TAX & COMPLIANCE (URL `/dashboard/hr/payroll/year-end`).

### 27.3 Available Information
- Heading **"Year-End Closure & Form 16"**, subtext **"Statutory challan summary, FY finalization, and per-employee Form 16."**
- FY combobox (FY 2026-27 selected); button **"Finalize FY"**.
- "Statutory FY totals": PF [Amount] ESI [Amount] PT [Amount] TDS [Amount]
- **"Monthly Statutory Challan Summary"** table (MONTH, HEADCOUNT, PF, ESI, PT, TDS): empty state **"No approved payroll in FY 2026-27 yet."**
- **"Employee Tax & Form 16"** section with a **"Search employee…"** textbox (employee list below it was still loading at time of read; not asserted).

## 28. Attendance Reports

### 28.1 Module Overview
Daily, monthly and per-employee reports for payroll and compliance. Exports open correctly in Excel.

### 28.2 Navigation
Click **Attendance Reports** under INSIGHTS (URL `/dashboard/hr/reports`).

### 28.3 Available Information
- Heading **"Attendance Reports"**, subtext **"Daily, monthly and per-employee reports for payroll and compliance. Exports open correctly in Excel."**
- Tabs: **Daily report** (selected) / **Monthly report** / **Employee report**.

### 28.4 Tab content
- **Daily report:** DATE picker ([Date]), STATUS combobox (All statuses, Present, Absent, Half day, On leave, Holiday, Weekly off), SEARCH textbox, **"Generate"** button (report generation/export).
- **Monthly report:** MONTH combobox (September selected; Oct/Nov/Dec disabled), YEAR combobox (2026 selected; 2022–2026), **"Generate"** button.
- **Employee report:** employee listbox (8 employees with codes: [Employee ID], [Employee ID], [Employee ID]…[Employee ID]), FROM [Date], TO [Date], **"Generate report"** [disabled until an employee is selected], hint "Select an employee to generate their report."

### 28.7 Read-Only Actions
- Tab switching and pickers. No report was generated (export action).

## 29. Payroll Reports

### 29.1 Module Overview
Registers, department costs and deduction totals for closed payroll runs. View them here, or download as CSV or PDF.

### 29.2 Navigation
Click **Payroll Reports** under INSIGHTS (URL `/dashboard/hr/payroll/reports`).

### 29.3 Available Information
- Heading **"Payroll Reports"**, subtext **"Registers, department costs and deduction totals for closed payroll runs. View them here, or download as CSV or PDF."**
- Report-type buttons: **"Payroll register"** (selected) / **"Department distribution"** / **"Deduction summary"** / **"Component report"**.
- Tabs: **"One payroll run"** (selected) / **"A period"**.

### 29.4 Tab content
- **One payroll run:** PAYROLL RUN combobox with only "Choose a run…" (no runs selectable); **"No approved or paid runs yet — reports only cover closed runs."**; **"Show report"**, **"Download CSV"**, **"Download PDF"** all [disabled].
- **A period** (verified on Component report): FROM MONTH 2026-07, TO MONTH 2026-09, DEPARTMENT combobox (Every department, HR Department, Sales And Markerting, IT Department), LOCATION combobox (Every location, HEAD OFFICE), COMPONENT CODES textbox ("Separate codes with commas. Leave empty for every component."), Show report / Download CSV / Download PDF buttons.
- Note text: departments and locations come from the payslip as it was at approval, so a later transfer never re-writes history.

## 30. Exports

### 30.1 Module Overview
Every payslip, report and bank file that left the system — who took it, what it covered and whether it succeeded.

### 30.2 Navigation
Click **Exports** under INSIGHTS (URL `/dashboard/hr/payroll/exports`).

### 30.3 Available Information
- Heading **"Exports"**, subtext **"Every payslip, report and bank file that left the system — who took it, what it covered and whether"**.
- **"Refresh"** button (disabled while fresh).
- Filters: WHAT WAS EXPORTED combobox (All exports, Payroll register, Department distribution, Deduction summary, Component report, Bank file (NEFT), Payslips (ZIP), Payslip PDF, Annual statement, Form 16); FORMAT (Any format, CSV, PDF, ZIP, On screen (JSON)); OUTCOME (Any outcome, Completed, In progress, Failed); **"Apply"** button.

### 30.4 Tables
5 exports, all **COMPLETED**, all by [HR Admin Email], "Page 1 of 1 · 5 exports":
- [Date] 01:19 pm — Component report PDF — July 2026 → September 2026 — 0 rows.
- [Date] 01:16 pm — Payslip PDF — One payroll run — 1 row.
- [Date] 01:15 pm — Payslip PDF — One payroll run — 1 row.
- [Date] 07:35 am — Payroll register CSV — One payroll run — 1 row.
- [Date] 01:01 am — Payroll register PDF — One payroll run — 0 rows.
("Click a row for the full record"; rows were not opened.)

### 30.5 Filters / 30.6 Search / 30.7 Read-Only Actions
- What/Format/Outcome filters + Apply; Refresh; pagination (single page).

## 31. Audit Log

### 31.1 Module Overview
An append-only record of every payroll change — who did what, and when.

### 31.2 Navigation
Click **Audit Log** under INSIGHTS (URL `/dashboard/hr/payroll/audit-log`).

### 31.3 Available Information
- Heading **"Payroll Audit Log"**, subtext **"An append-only record of every payroll change — who did what, and when. Click a row to see the full …"**
- Filters: ENTITY combobox (All entities, Salary structure, Structure template, Salary component, Payroll run, Run item, Adjustment, Bonus rule, Loan, Bank account, Settings, Statutory config, PT slab, Tax regime, Tax declaration); ACTION textbox ("e.g. approve"); EMPLOYEE combobox (Anyone + 8 employees); FROM/TO date pickers; **"Apply"** button.

### 31.4 Tables
Columns: WHEN, ACTOR, ACTION, ENTITY, TARGET. **"251 entries"**, **"Page 1 of 13"** (Prev/Next pagination). ("Click a row to see the full record"; rows were not opened.)

### 31.5 Filters / 31.6 Search / 31.7 Read-Only Actions
- All filters + Apply; pagination.

## 32. Office Locations

### 32.1 Module Overview
Define geographical perimeters where employees can clock in.

### 32.2 Navigation
Click **Office Locations** under SETUP → ORGANIZATION (URL `/dashboard/hr/attendance/locations`).

### 32.3 Available Information
- Heading **"Office Locations"**, subtext **"Define geographical perimeters where employees can clock in."**
- Button **"Add Location"**.
- **"Search location..."** textbox.
- 1 location card: **HEAD OFFICE** (Active) — FULL ADDRESS: "INDRAPRASTH TOWER, MAHATMA GANDHI MARG, INDORE CITY, INDORE, JUNI INDORE TAHSIL, INDORE, MADHYA PRADESH, 452001, INDIA"; CITY & STATE: "INDORE, MADHYA PRADESH"; RADIUS: **100 meters**; a **"Location Status"** label (no visible value text; the active state is conveyed by a "Deactivate HEAD OFFICE" switch, which is checked — the switch is a mutation control and was NOT touched).

## 33. Work Shifts

### 33.1 Module Overview
Define working hours, and link each shift to an attendance policy.

### 33.2 Navigation
Click **Work Shifts** under SETUP → ORGANIZATION (URL `/dashboard/hr/attendance/shifts`).

### 33.3 Available Information
- Heading **"Shift Templates"**, subtext **"Define working hours, and link each shift to an attendance policy."**
- Button **"Add Shift"**.

### 33.4 Tables
**Shift Templates** — columns: SHIFT NAME, TYPE, WORKING HOURS, POLICY, STATUS, (actions). 1 row:
- **Morning Shift** | Fixed | 10:00 AM – 6:00 PM | Standard Office Attendance Policy 2026 | Active | "Edit Morning Shift" / "Deactivate Morning Shift" buttons.
**Rotation Patterns** — heading "Rotation Patterns", subtext "Employees on rotating schedules cycle through shift and off-day phases automatically.", **"Add Rotation"** button;  / **"Create a rotation for factories, hospitals, or support teams."**

## 34. Attendance Policies

### 34.1 Module Overview
Manage how attendance is calculated for the organisation.

### 34.2 Navigation
Click **Attendance Policies** under SETUP → ORGANIZATION (URL `/dashboard/hr/attendance/policies`).

### 34.3 Available Information
- Heading **"Attendance Policies"**, subtext **"Manage how attendance is calculated for your organisation."**
- Button **"Create Policy"**.

### 34.4 Tables
Columns: POLICY NAME, GRACE, FULL/HALF DAY, BREAKS, OVERTIME, CORRECTIONS, COMPLIMENTARY OFF, STATUS, ACTIONS.
1. **IT Department Policies** — 20 mins — 7.00 hrs / 4.00 hrs — No limit — "After 60 mins Needs approval" — 1 days — "Off" — Active — Edit/Deactivate.
2. **Standard Office Attendance Policy 2026 (Default)** — 10 mins — 7.00 hrs / 4.00 hrs — No limit — "After 60 mins Needs approval" — 3 days — "Earned on holidays" — Active — Edit/Deactivate.
(The Documents hub additionally describes: IT Department Policies — Late Grace Period 20 minutes, Late Mark Threshold 90 minutes, Minimum Hours 4.00/7.00 hrs, Regularization Window 1 days; Standard Office Attendance Policy 2026 — 10 minutes, 60 minutes, 3 days.)

## 35. Complimentary Off Policies

### 35.1 Module Overview
Rules for earning compensatory days when employees work on holidays or weekly offs.

### 35.2 Navigation
Click **Complimentary Off Policies** under SETUP → ORGANIZATION (URL `/dashboard/hr/attendance/comp-off-policies`).

### 35.3 Available Information
- Heading **"Complimentary Off Policies"** (h2), subtext **"Rules for earning compensatory days when employees work on holidays or weekly offs."**
- Note: **"Complimentary Offs are only earned when the employee's attendance policy has "EarnComplimentary Offf""** — verbatim label defect (missing space, triple "f").
- Button **"Add policy"**.

### 35.4 Tables
Columns: POLICY, HALF/FULL DAY, CREDIT, APPLIES TO, APPROVAL, ACTIONS.
- 1 row: **"Work On Sunday/Company Holiday For CO"** (Priority 0) | "N/A / N/A" | "×1.00 No expiry No balance cap" | "Whole organisation" | "Manager approval" | "Edit" / "Delete".

## 36. Holidays

### 36.1 Module Overview
Manage the organisation's holiday calendar.

### 36.2 Navigation
Click **Holidays** under SETUP → ORGANIZATION (URL `/dashboard/hr/attendance/holidays`).

### 36.3 Available Information
- Heading **"Holiday Calendar"**, subtext **"Manage your organisation's holiday calendar."**
- Year buttons **2025 / 2026 / 2027**; **"Add Holiday"** button.
- Card **"Common Holidays Catalog (2026)"** — "Quickly view and import public holidays (26 Jan, 15 Aug, 2 Oct) and optional holidays (Diwali, Holi, …", **"13 / 13 Added"** (the catalog's import function is a mutation).
- Card **"Holiday List (2026)"** — **"13 holidays added"**.

### 36.4 Tables
Columns: HOLIDAY NAME, DATE, DAY, TYPE, TARGETING, (edit/delete actions). 13 rows (2026):
New Year's Day (01 Jan, Thursday, Optional Holiday, Global); Republic Day (26 Jan, Monday, National Holiday, Global); Maha Shivratri (15 Feb, Sunday, Optional Holiday, Global); Holi (04 Mar, Wednesday, Optional Holiday, Global); Eid ul-Fitr (20 Mar, Friday, Optional Holiday, Global); Good Friday (03 Apr, Friday, Optional Holiday, Global); May Day / Labour Day (01 May, Friday, Optional Holiday, Global); Independence Day (15 Aug, Saturday, National Holiday, Global); Gandhi Jayanti (02 Oct, Friday, National Holiday, Global); Dussehra (20 Oct, Tuesday, Optional Holiday, Global); Diwali (08 Nov, Sunday, Optional Holiday, Global); Guru Nanak Jayanti (24 Nov, Tuesday, Optional Holiday, Global); Christmas Day (25 Dec, Friday, Optional Holiday, Global).
- Each row has "Edit holiday" and an unnamed (delete) button —

### 36.7 Read-Only Actions
- Year switching (2025/2026/2027), expanding the Holiday List card.

## 37. Weekly Offs

### 37.1 Module Overview
Define which days of the week are non-working for your teams.

### 37.2 Navigation
Click **Weekly Offs** under SETUP → ORGANIZATION (URL `/dashboard/hr/attendance/weekly-offs`).

### 37.3 Available Information
- Heading **"Weekly Off Configuration"**, subtext **"Define which days of the week are non-working for your teams."**
- Button **"Add Rule"**.

### 37.4 Tables
- **"Organisation-wide rules (1)"** — columns: RULE NAME, DAYS OFF, PRIORITY, EFFECTIVE, TARGETING, STATUS, ACTIONS.
  - **Global Sunday OFF** — Sunday — Priority 0 — "[Date] onwards" — "Whole organisation" — Active — Edit/Delete.
- **"Targeted rules (2)"** — same columns plus SCOPE.
  - **Corporate Saturday OFF** — Saturday — Priority 0 — Locations: HEAD OFFICE, Departments: IT Department, Employment types: Full-time, Part-time, Contract, Job statuses: Active, Probation — Active — Edit/Delete.
  - **Sales Wednesday OFF** — Wednesday — Priority 0 — Locations: HEAD OFFICE, Departments: Sales And Markerting, Employment types: Full-time, Part-time, Contract, Job statuses: Active, Probation — Active — Edit/Delete.

## 38. Leave Types

### 38.1 Module Overview
Define the categories of leave the organisation offers (e.g. Sick Leave, Casual Leave).

### 38.2 Navigation
Click **Leave Types** under SETUP → LEAVE (URL `/dashboard/hr/leaves/types`).

### 38.3 Available Information
- Heading **"Leave Types"**, subtext **"Define the categories of leave your organisation offers (e.g. Sick Leave, Casual Leave). Click a row to see its details"**.
- Button **"Add Leave Type"**.

### 38.4 Tables
Columns: NAME, CODE, TYPE, WEEKENDS IN BETWEEN, DOCUMENT AFTER, STATUS, ACTIONS.
1. Complementary Off | CO | Paid | N/A | 0 | Active | Edit/Deactivate
2. Festival Leave | FL | Paid | N/A | After 1 days | Active
3. Maternity Leave | UL | Paid | N/A | After 3 days | Active
4. Paid Leave | PL | Paid | N/A | 0 | Active
5. Casual Leave | CL | Paid | N/A | 0 | Active
6. Emergency Leave | EL | Paid | N/A | 0 | Active
7. Sick Leave | SL | Paid | N/A | After 3 days | Active
(Edit/Deactivate are mutations —)

### 38.7 Read-Only Actions
- Search is not present; the table is the full list.

### 38.8 Details Pages
- Clicking a row opens a **"LEAVE TYPE"** detail dialog (verified on "Complementary Off"): CODE CO, status ACTIVE; Rules: CODE: CO, PAY: Paid, WEEKENDS IN BETWEEN: **Not counted**, DOCUMENT REQUIRED AFTER: 0 days, DESCRIPTION: "N/A"; "Who can apply": GENDERS: EVERYONE, MARITAL STATUSES: EVERYONE; buttons **"Deactivate"** and **"Edit leave type"**; Close.

## 39. Leave Policies

### 39.1 Module Overview
Create policy templates and configure leave quotas. Assign templates to employees in their profile.

### 39.2 Navigation
Click **Leave Policies** under SETUP → LEAVE (URL `/dashboard/hr/leaves/policies`).

### 39.3 Available Information
- Heading **"Leave Policies"**, subtext **"Create policy templates and configure leave quotas. Assign templates to employees in their profile."**
- Button **"Create Policy"**.
- 2 policy cards (each card is itself a button; clicking was avoided because the card likely opens an edit/manage view):
  1. **Standard Leave Policy** — "This is the standard leave policy for all the employees." — **4 entitlements** — buttons "Add Quota", "Edit policy", "Delete policy".
  2. **Maternity Leave Policy** — "This is the Leave Policy for female employees in the case of their pregnancy or infant upbringing." — **1 entitlement** — same mutation buttons.

## 40. Leave Automation (Automation Engine)

### 40.1 Module Overview
The "brain" of the leave system: automatically calculates and updates employee leave balances via scheduled jobs.

### 40.2 Navigation
Click **Automation** under SETUP → LEAVE (URL `/dashboard/hr/leaves/automation`).

### 40.3 Available Information
- Heading **"Automation Engine"**, subtext **"The "brain" of the leave system. Automatically calculates and updates employee leave balances via sc…"**
- **"Monthly Leave Credit"**: "Deposits one month's worth of leaves into employees' accounts on the 1st of every month." + REFERENCE DATE (OPTIONAL) pickers (Month/Day/Year spinbuttons, unset) + **"Add Leave Days Now"** button.
- **"New Year Calculations (Rollover)"**: "Closes out the old year. Moves unused leaves into the new year, lapses the rest, and seeds fresh quo…"; "Year-End Rollover before the January accrual"; "Both engines are safe to re-run."; **"Trigger Rollover"** button.

## 41. Salary Components

### 41.1 Module Overview
Manage the catalog of earnings, deductions, and reimbursements.

### 41.2 Navigation
Click **Salary Components** under SETUP (payroll setup group) (URL `/dashboard/hr/payroll/components`).

### 41.3 Available Information
- Heading **"Salary Components"**, subtext **"Manage the catalog of earnings, deductions, and reimbursements. Click a row to see its details."**
- Buttons **"Bootstrap Defaults"** and **"New Component"**.

### 41.4 Tables
Columns: NAME / CODE, TYPE, CALCULATION, VALUE, FLAGS, ACTIONS. 20 components:
- **Earnings (5):** Basic Salary (BASIC, Percent Of Ctc, 50.0000%, flags BASIC CTC TAX PF); House Rent Allowance (HRA, Percent Of Basic, 40.0000%, CTC TAX); Conveyance Allowance (CONVEYANCE, Flat, [Amount] CTC TAX); Special Allowance (SPECIAL_ALLOWANCE, Balancing, "Auto (remainder)", CTC TAX); AI Assistance Allowance (AAA, Flat, [Amount] CTC TAX).
- **Deductions (10):** ESIC Employee (ESICE, Percent Of Ctc, 0.2500%, INACTIVE CTC); ESIC EMPLOYER (ESICEY, Percent Of Ctc, 3.7500%, INACTIVE CTC); Gratuity (GRT, Flat, [Amount] INACTIVE CTC); PF Employee (PFE, Percent Of Ctc, 12.0000%, INACTIVE CTC); PF Employer (PFEY, Percent Of Ctc, 12.0000%, INACTIVE CTC); TDS (TDDS, Percent Of Ctc, 10.0000%, INACTIVE CTC); Provident Fund (Employee) (PF_EMPLOYEE, Percent Of Basic, 12.0000%, CTC TAX); Professional Tax (PROFESSIONAL_TAX, Flat, [Amount] INACTIVE CTC TAX); Employees' State Insurance (Employee) (ESI_EMPLOYEE, Flat, [Amount] INACTIVE TAX); Income Tax (TDS) (TDS, Flat, [Amount] INACTIVE TAX).
- **Employer Contributions (5):** Provident Fund (Employer) (PF_EMPLOYER, Percent Of Basic, 12.0000%, CTC TAX); Employee Pension Scheme (Employer) (EPS, Flat, [Amount] CTC TAX); PF Administrative Charges (PF_ADMIN_CHARGES, Flat, [Amount] CTC TAX); EDLI Charges (Employer) (EDLI, Flat, [Amount] CTC TAX); Employees' State Insurance (Employer) (ESI_EMPLOYER, Flat, [Amount] CTC TAX).
- FLAGS legend: BASIC, CTC, TAX, PF, INACTIVE.
- ACTIONS column: Edit/Deactivate icon buttons (only "Deactivate AI Assistance Allowance" and Edit buttons were visible; NOT clicked).

## 42. Structure Templates

### 42.1 Module Overview
Define templates to standardize compensation packages.

### 42.2 Navigation
Click **Structure Templates** under SETUP (payroll setup group) (URL `/dashboard/hr/payroll/templates`).

### 42.3 Available Information
- Heading **"Structure Templates"**, subtext **"Define templates to standardize compensation packages."**
- Button **"New Template"**.
- 7 template cards, each showing drive mode, component count, and top components; **"Manage"** and **"Preview"** buttons:
  1. **New Salary Structure (NSS01)** — CTC DRIVEN — COMPONENTS (5): Basic Salary 40.0000%, House Rent Allowance 50.0000%, AI Assistance Allowance [Amount] Special Allowance Balancing, +1 more components.
  2. **New HR Salary Structure (NHRSS)** — CTC DRIVEN — COMPONENTS (5): Conveyance Allowance 20.0000%, Basic Salary 50.0000%, AI Assistance Allowance [Amount] Special Allowance Balancing, +1 more components.
  3. **New Template (NT1)** — CTC DRIVEN — COMPONENTS (0) — empty template.
  4. **Above HR Manager Structure (AHM)** — CTC DRIVEN — COMPONENTS (4): Conveyance Allowance 10.0000%, Basic Salary 40.0000%, Special Allowance Balancing, House Rent Allowance 20.0000%.
  5. **HR Salary Structure (HSS)** — CTC DRIVEN — COMPONENTS (5): House Rent Allowance 50.0000%, Conveyance Allowance [Amount] Special Allowance Balancing, Basic Salary 50.0000%, +1 more components.
  6. **Employee Salary Structure (ESS)** — COMPONENT DRIVEN — COMPONENTS (4): Special Allowance Balancing, House Rent Allowance [Amount] Conveyance Allowance [Amount] Basic Salary [Amount]
  7. **Manager Salary Structure (MSS)** — CTC DRIVEN — COMPONENTS (4): Conveyance Allowance [Amount] House Rent Allowance 50.0000%, Special Allowance Balancing, Basic Salary 60.0000%.

### 42.8 Details Pages
- **"Preview"** opens a **"Preview Structure"** panel (verified on NSS01): "Template: New Salary Structure NSS01"; **"EVALUATE FOR"** employee combobox; note "The component split is the same for everyone on this template. Professional tax and income tax depen…"; ANNUAL CTC field; **"Preview split"** button [disabled until a CTC is entered]; quick-select buttons **3L / 6L / 12L / 24L**. Nothing was entered or previewed. Panel closed with its Close button.

## 43. Benefit Plans

### 43.1 Module Overview
Define benefit plans, enroll employees and see what each plan costs.

### 43.2 Navigation
Click **Benefit Plans** under SETUP (payroll setup group) (URL `/dashboard/hr/payroll/benefits`).

### 43.3 Available Information
- Heading **"Benefits"**, subtext **"Define benefit plans, enroll employees and see what each plan costs."**
- Tabs: **Plans** (selected) / **By employee**.
- Banner: **"Benefit deductions are switched off, so nothing is charged yet. Turn them on in Payroll Settings."**
- **"Filter plans"** textbox; Status combobox (Active selected; Inactive, All); Type combobox (All types, Health insurance, Life insurance, Accident insurance, Meal, Travel, Other); **"Refresh"** button; **"New plan"** button.

### 43.4 Tables
Columns: PLAN, TYPE, PROVIDER, EMPLOYEE / MO, COMPANY / MO, VALID, STATUS. 

## 44. Payroll Settings

### 44.1 Module Overview
Configure global payroll policies, LOP rules, and manager authorities.

### 44.2 Navigation
Click **Payroll Settings** under SETUP (payroll setup group) (URL `/dashboard/hr/payroll/settings`).

### 44.3 Available Information (all read; nothing changed)
- **Calculation Policies:** LOP DIVISOR BASIS — "Calendar Days in Month" (selected; alternatives "Standard Working Days in Month", "Fixed 30 Days"); ROUNDING POLICY — "Nearest Rupee" (selected; alternative "Two Decimals (Paise)").
- **Manager Permissions:** "Managers can view team compensation" [checked]; "Manager direct compensation authority" [unchecked].
- **HR Approval Policies:** "Require separate checker (Segregation of Duties)" [unchecked].
- **Reimbursements & Benefits:** REIMBURSEMENT APPROVAL — "Manager, then HR" (selected; alternative "HR only"); PAYOUT LOOK-AHEAD MONTHS — "2 months ahead"; "Charge benefit deductions in payroll" [unchecked].
- **Payslip Delivery:** "Release payslips as soon as a run is approved" [checked]; "Email employees when their payslip is released" [unchecked].
- **When someone leaves:** STANDARD NOTICE PERIOD — 30 days; RECOVER SHORT NOTICE FROM — "Basic salary"; "Recover pay for notice that wasn't served" [unchecked]; COMPONENT USED TO RECOVER SHORT NOTICE — "Not set — settlements will be refused"; OUTSTANDING LOANS — "Collect separately, outside payroll"; "Pay out unused leave when someone leaves" [unchecked].
- **Cashing out comp-offs:** "Allow comp-offs to be cashed out" [unchecked].
- **"Save Settings"** button (mutation; no field was modified).

## 45. Payroll Automation (Automatic jobs)

### 45.1 Module Overview
Routine work payroll does on its own; jobs can also be run manually if the result is needed immediately.

### 45.2 Navigation
Click **Automation** under SETUP (payroll setup group) (URL `/dashboard/hr/payroll/automation`).

### 45.3 Available Information
- Heading **"Automatic jobs"**, subtext **"Routine work payroll does on its own. You can also run any of it now if you need the result straight…"**
- Job cards (all with run-now buttons that are state-mutating):
  1. **Payroll reminders** — SCHEDULE: UNKNOWN — "Emails the people who need to act: pay-day and cut-off dates coming up, and deadlines for tax declarations and proofs." — **"Send reminders now"** (sends emails).
  2. **Next month's draft payroll** — "Opens the draft run for the coming month so it is ready to calculate. Nothing is calculated or paid." — **"Create the draft now"** (creates a draft run).
  3. **Stuck payroll runs** — "If a calculation stops unexpectedly the run sits in 'calculating' forever. This marks those as failed so they can be started again." — **"Check for stuck runs"** (marks runs failed).
  4. **Old receipts and proofs** — "Clears half-finished uploads, and permanently deletes files kept past the retention period" — **"Clear old files now"** (deletes data).

## 46. My Attendance

### 46.1 Module Overview
The HR user's own daily attendance, hours, and schedule patterns.

### 46.2 Navigation
Click **My Attendance** under ME (URL `/dashboard/hr/my-attendance`).

### 46.3 Available Information
- Heading **"My Attendance"**, subtext **"Track your daily attendance, hours, and schedule patterns."**
- Month navigator: **"Previous month"** / **"SEPTEMBER 2026"** / **"Next month"** (disabled).
- Summary: **7 PRESENT DAYS**, 0 ABSENT DAYS, 0 LATE ARRIVALS, **57h 13m HOURS WORKED**.

### 46.4 Tables
**"History · September 2026"** — columns: DATE, STATUS, IN, OUT, EFFECTIVE, LATE, LEFT EARLY, OVERTIME, ACTIONS. 7 records:
- Fri, 18 Sept — Present — 09:34 am – 08:33 pm — 8h 58m — "—" — "—" — 1h 17m — "LOG" / "CORRECT".
- Thu, 17 Sept — Present — 10:47 am – 08:36 pm — 8h 14m — "—" — "—" — 1h 19m.
- Wed, 16 Sept — Present — 10:38 am – 08:51 pm — 8h 12m — "—" — "—" — 1h 9m.
- Tue, 15 Sept — Present — 10:33 am – 09:44 pm — 9h 17m — "—" — "—" — 1h 19m.
- Mon, 14 Sept — Present — 10:00 am – 07:59 pm — 7h 32m — "—" — "—" — 1h 25m.
- Sat, 12 Sept — Present **"Corrected"** — 10:15 am – 06:40 pm — 8h 5m — "—" — "—" — 1h 35m.
("LOG" / "CORRECT" buttons are mutations —)

## 47. My Regularizations

### 47.1 Module Overview
The HR user's own attendance correction requests and their approval status.

### 47.2 Navigation
Click **My Regularizations** under ME (URL `/dashboard/hr/my-attendance/regularizations`).

### 47.3 Available Information
- Heading **"Attendance Regularizations"**, subtext **"Request corrections for missed or wrong punches and track their approval."**
- Section **"My requests"**; tabs **All** (selected) / **Pending** / **Approved** / **Rejected** / **Cancelled**; button **"New request"**.

### 47.4 Tables
Columns: DATE, TIME, REASON, REVIEWER NOTE, STATUS, SUBMITTED.
- [Date] — 10:15 am → 06:40 pm — "Forget to clock in" — **"Ohk. Keep in mind for the next time."** — **Approved** — "Submitted [Date], 11:36 pm".

## 48. My Flags

### 48.1 Module Overview
Punches the system flagged for review (e.g. outside the office geofence or breaks over the limit).

### 48.2 Navigation
Click **My Flags** under ME (URL `/dashboard/hr/my-attendance/anomalies`).

### 48.3 Available Information
- Heading **"Attendance Flags"**, subtext **"Punches the system flagged for review — e.g. outside the office geofence or breaks over the limit."**
- Tabs: **Open** (selected) / **Resolved** / **All**.

### 48.4 Tables
-  / **"You're all clear."**

---

## 49. My Overtime

### 49.1 Module Overview
Overtime recorded from the HR user's attendance and its approval status.

### 49.2 Navigation
Click **My Overtime** under ME (URL `/dashboard/hr/my-attendance/overtime`).

### 49.3 Available Information
- Heading **"My Overtime"**, subtext **"Overtime recorded from your attendance and its approval status."**

### 49.4 Tables
Columns: DATE, OVERTIME, SHIFT, WORKED, EFFECTIVE, REVIEWER, STATUS. 5 records:
- [Date] — 1h 17m — Morning Shift 10:00 am – 06:00 pm — 09:34 am – 08:33 pm — 8h 58m — "N/A" — Approved.
- [Date] — 1h 19m — Morning Shift — 10:47 am – 08:36 pm — 8h 14m — "N/A" — Approved.
- [Date] — 1h 9m — Morning Shift — 10:38 am – 08:51 pm — 8h 12m — "N/A" — **Rejected** ("Cannot Approve").
- [Date] — 1h 19m — Morning Shift — 10:33 am – 09:44 pm — 9h 17m — "N/A" — Approved.
- [Date] — 1h 25m — Morning Shift — 10:00 am – 07:59 pm — 7h 32m — "GO ON" — Approved.

## 50. My Complimentary Offs

### 50.1 Module Overview
The HR user's own compensatory time off: days credited for working on holidays or weekly offs.

### 50.2 Navigation
Click **My Complimentary Offs** under ME (URL `/dashboard/hr/my-attendance/comp-offs`).

### 50.3 Available Information
- Heading **"Compensatory Time Off"**, subtext **"Days credited for working on holidays or weekly offs."**, note "Approved complimentary off days are added to your leave balance and must be used before they expire."
- **Available balance: 0**, **Total earned: 0**, Used: 0, Expired: 0.
- History tabs: **All** (selected) / **Earned** / **Approved** / **Used** / **Expired** / **Rejected / cancelled**.

### 50.4 Tables
-  / **"Work on a holiday or weekly off to earn one, if your organisation's policy allows it."**

---

## 51. My Claims

### 51.1 Module Overview
The HR user's own claims and benefits.

### 51.2 Navigation
Click **My Claims** under ME (URL `/dashboard/hr/my-reimbursements`).

### 51.3 Available Information
- Heading **"My Claims & Benefits"**, subtext **"Your own claims and benefits."**
- Buttons: **"My claims"** (selected) / **"Spending limits"** / **"My benefits"**.
- Status combobox (All statuses, Draft, Submitted, Waiting for HR, Approved, Paid, Rejected, Withdrawn); Pay month combobox (Any pay month, Mar 2027 … Mar 2025); **"Refresh"**; **"New claim"**.

### 51.4 Tables
Columns: CATEGORY, AMOUNT, SUBMITTED, STATUS. 

## 52. My Salary & Bank

### 52.1 Module Overview
The HR user's current salary structure, how it has changed, and where salary is paid.

### 52.2 Navigation
Click **My Salary & Bank** under ME (URL `/dashboard/hr/my-salary`).

### 52.3 Available Information
- Heading **"Salary & Bank Details"**, subtext **"Your current salary structure, how it has changed, and where your salary is paid."**
- **"Bank details"** button showing **"[Bank Account Number] · Pending verification"** (loading state "Bank details Checking…" appears briefly).
- **Current Salary Structure** (Effective [Date], Version 6, **Restructure**): ANNUAL CTC [Amount]; TAKE-HOME/MONTH [Amount]; GROSS/MONTH [Amount] (5 earnings); DEDUCTIONS/MONTH −[Amount] PF; TAKE-HOME/YEAR [Amount]
- **"View salary breakdown (5 components)"** (expandable; expanded during audit):
  - Earnings: Basic Salary (50% of CTC) [Amount]/mo, [Amount]/yr; House Rent Allowance (50% of Basic) [Amount] [Amount]; Conveyance (15% of Basic) [Amount] [Amount]; Special Allowance (Balance of CTC) [Amount] [Amount]; AI Assistance Allowance (Fixed) [Amount] [Amount]
  - Statutory deductions (estimated): PF (EPF) 12% of [Amount] −[Amount]; ESI Not applicable; Professional tax Not applicable; Income tax (TDS) −[Amount]
  - Paid by company: PF employer [Amount] (Pension EPS [Amount] · EPF [Amount]); ESI employer Not applicable; Life insurance (EDLI) [Amount]; PF admin charges [Amount]; Total monthly cost [Amount]
  - "How this was worked out": PF — pay counted [Amount] employee rate 12%, employer rate 12%, EPS [Amount] employer EPF share [Amount] EDLI [Amount] admin charges [Amount] wage ceiling Applied, unpaid leave reduces ceiling Yes; ESI No; PT "No state PT configured"; Income tax — New regime Section 115BAC, projected annual taxable pay [Amount] projected annual tax [Amount] monthly TDS [Amount]
- **Salary History** (3 revisions shown): v6 **Restructure** CURRENT — [Date]–Present — "Restructrue" (typo) [Amount] / year, "No CTC change"; v5 **Increment** — 15–[Date] — [Amount] "+[Amount] (+33.3%)"; v4 **Correction** — 1–[Date] — [Amount] (Version buttons expand per-version detail; not expanded.)

## 53. Employee Profile (cross-navigation detail page)

### 53.1 Module Overview
Per-employee 360° view, reached from the Attendance Directory or Team. Verified on [Employee Name] ([Employee ID]).

### 53.2 Navigation
From the Dashboard or TIME & LEAVE → Live Attendance, click **"Open [Name]'s attendance"** next to an employee (URL `/dashboard/hr/employees/<id>?tab=attendance`).

### 53.3 Available Information
- Breadcrumb **"Team / [Employee Name]"**.
- Header card: avatar, heading **"[Employee Name]"**, **"#[Employee ID]"**, badge **"Active"**, role Employee.
- **Organization** card: Department "IT Department", Designation "Frontend Developer", Role "Employee", Manager "[Employee Name]", Dept. Head "[Employee Name]".
- **Contact** card: Phone "8787989856", Email "[Employee Email]".
- Tabs: **Overview** / **Attendance** (selected) / **Department** / **Leave** / **Profile** / **Reports**.

### 53.4 Tab content
- **Attendance:** month navigator (Previous month / September 2026 / Next month disabled), "Every day of the month is listed. Select a day with a record to see its full breakdown." (Day-level breakdown was not explored — no attendance records exist for this employee in September.)
- **Overview:** "Monthly overview" with stat tiles: Present 0, Absent 0, "0% on time" Late arrivals, 0 Days on leave, Hours worked 0m, "0m / day", Overtime 0m; "TODAY · MON, 21 SEPT": "No data", CLOCK IN N/A, CLOCK OUT N/A, HOURS —; **"Attendance pattern"** legend (PRESENT, LATE, HALF DAY, ON LEAVE, ABSENT, HOLIDAY, WEEKLY OFF, NO DATA, UPCOMING); day-by-day calendar: 1–21 Sept "No data", 22–30 "Upcoming". "Refresh monthly overview" [disabled].
- **Department:** "DEPARTMENT: IT Department"; "HEAD OF DEPARTMENT": [Employee Name] (avatar RK, [Employee Email]).
- **Leave:** "Leave Balances" ("Leave days available to this employee."); Balance year combobox (2026; 2025, 2024); "Refresh" button; balance cards — CASUAL LEAVE CL "3.5 days left" (3.5 given so far, 0 taken), FESTIVAL LEAVE FL "2.5" (2.5 given so far), EMERGENCY LEAVE "2 given so far", PAID LEAVE "1 given so far"; "Assign Policy" section ("Gives this employee the leave days from a policy template, adjusted for how much of the year is left"; SELECT POLICY TEMPLATE combobox: "Choose a template…", "Standard Leave Policy", "Maternity Leave Policy"; **"Assign Policy"** [disabled] — mutation, not clicked); "Customise Leave Rules" table (LEAVE TYPE, DAYS LEFT, GIVEN / TAKEN, ACTIONS): Casual Leave CL "3.5 days" "3.5 given · 0 taken"; Festival Leave FL "2.5 days" "2.5 given · 0 taken"; Emergency Leave EL "2 days" "2 given · 0 taken"; Paid Leave PL "1 days" "1 given · 0 taken"; **"Customise"** buttons.
- **Profile:** "Profile Details"; PERSONAL PROFILE — DATE OF BIRTH 16 Aug 2002, GENDER Male, MARITAL STATUS Single, BLOOD GROUP B+, FATHER'S NAME "Not Available", SPOUSE NAME "Not Available"; WORK & CONTACT PROFILE — DATE OF JOINING [Date], EMPLOYMENT TYPE Part Time, WORK MODE Hybrid, WORK OFFICE HEAD OFFICE, PERSONAL EMAIL [Employee Email], EMERGENCY CONTACT "Not Available", ADDRESS DETAILS "D-36, …".
- **Reports:** "Attendance report" with FROM date ([Date]) and TO date ([Date]) pickers; **"Generate report"** button.

### 53.9 Cross Navigation
- Dashboard → Attendance Directory → "Open [Name]'s attendance" → Employee Profile (Attendance tab) — verified.

---

## 54. My Profile

### 54.1 Module Overview
The signed-in HR user's own profile.

### 54.2 Navigation
Click the **"[HR Admin Email]"** button (description "My Profile") in the top bar (URL `/dashboard/profile`).

### 54.3 Available Information
- Heading **"[HR Admin Email]"**, **"#[Employee ID]"**, role **"Hr"**.
- **Organization:** Department "Human Resources", Designation "HR Administrator".
- **Contact:** Phone "N/A", Email "[HR Admin Email]".
- **"Ask Maya assistant"** — "Shown on all pages" — switch "Show Ask Maya assistant" [checked] (the switch was NOT toggled).
- **"Sign Out"** button (NOT clicked — would end the session).
- **"Profile Details"** — "Manage your personal and organizational information." — **"Edit Details"** button.
- Personal Information: FULL NAME "[HR Admin Email]" (no real name set), PHONE "Not set", DATE OF BIRTH "Not set", BLOOD GROUP "A+", PERSONAL EMAIL "Not set".
- Organization Details: DESIGNATION "HR Administrator", DEPARTMENT "Human Resources", EMPLOYEE CODE "[Employee ID]", WORK LOCATION "Not set", GENDER "male", MARITAL STATUS "Not set".
- Address: Address, City, State, Postal Code, Country — all "Not set".

## 55. Documents (documentation hub)

### 55.1 Module Overview
Built-in product documentation for HR users.

### 55.2 Navigation
Click **"Documents"** in the top bar (URL `/dashboard/documents`).

### 55.3 Available Information
- **"Search documentation..."** textbox.
- Section buttons: **Overview & Getting Started** (selected), **Attendance & Time Tracking**, **Leaves & Holidays**, **Approvals & Regularizations**, **Payroll & Lock Periods**, **Reports & Analytics**.
- Content (Overview & Getting Started): "Welcome to HR Clouds. The Overview section is your command center for managing the organization's wo…"; describes the Employees directory (manage user access, send invitations) and the Departments page (company hierarchy).
- **"Previous: None"** [disabled] and **"Next: Attendance & Time Tracking"** buttons.
- Attendance & Time Tracking section text covers: Policies (late arrivals, early exits, half-day deductions, grace periods); Shifts & Roster; Locations & Geofencing; Weekly Offs. Each paragraph renders twice in the page text (rendering pattern, not content duplication in source).
- The remaining sections (Leaves & Holidays, Approvals & Regularizations, Payroll & Lock Periods, Reports & Analytics) were identified but not read in full.

## Data & UI Quality Findings

| # | Issue | Location | Navigation Path | What was observed | Expected behavior | Impact | Severity |
|---|-------|----------|-----------------|-------------------|-------------------|--------|----------|
| 1 | "Employee not found N/A" on approved adjustments | Adjustments | Dashboard → PAYROLL → Adjustments | Two APPROVED adjustment rows (Sept: "Ganesh Chaturthy" +[Amount]; Oct: "Diwali Bonus" +[Amount]) show EMPLOYEE as "Employee not found N/A" instead of a name/code | Every adjustment should reference a valid employee | Orphaned payroll adjustments may be paid to nobody or misallocated | High |
| 2 | "Sales And Markerting" spelling | Dashboard, Departments, attendance views, Weekly Offs, Employee Salaries, Bank Verification, Payroll Settings, reports | Multiple | Department name spelled "Sales And Markerting" (missing "a") everywhere it appears | "Sales And Marketing" | Unprofessional display in HR-facing UI; RAG should normalize | Medium |
| 3 | August 2026 payroll run marked PAID with [Amount] totals | Payroll Runs | Dashboard → PAYROLL → Payroll Runs | August 2026 run: status PAID, "Paid on [Date]", EMPLOYEES 1, GROSS [Amount] DEDUCTIONS [Amount] NET [Amount] "1 excluded" | A paid run should have non-zero totals, or the run should not be PAID | Payroll history is misleading; could confuse statutory reporting | High |
| 4 | "No approved or paid runs yet" while a PAID run exists | Payroll Reports | Dashboard → INSIGHTS → Payroll Reports | Page states "No approved or paid runs yet — reports only cover closed runs" while Payroll Runs lists August 2026 as PAID | PAID run should be listed as a selectable run | Reports cannot be generated for the paid run | Medium |
| 5 | Bonus rules "APPLIED · 9 PEOPLE" vs 8 personnel | Bonus Rules | Dashboard → PAYROLL → Bonus Rules | Three rules with WHO QUALIFIES "Everyone" show "APPROVED APPLIED · 9 PEOPLE"; org has 8 personnel | Applied-people count should match the org headcount (8) | Bonus payout headcount is inconsistent with the employee roster | Medium |
| 6 | HR user's display name missing everywhere | Team, Attendance Directory, Bank Verification, My Profile, profile menu | Multiple | The HR user's name is shown as the email "[HR Admin Email]" (Team card, attendance NAME column, bank EMPLOYEE column, profile FULL NAME) | A real display name should appear | Poor UX; confusing identity display | Medium |
| 7 | Team cards: "No employee code on file" on all cards | Team | Dashboard → PEOPLE → Team | All 8 member cards show "No employee code on file" while codes exist elsewhere ([Employee ID]…[Employee ID], [Employee ID], [Employee ID] in attendance, roster, salary views) | Cards should show the actual employee codes | Inconsistent identity data across views | Medium |
| 8 | Duplicate salary components (different codes, same concept) | Salary Components | Dashboard → SETUP → Salary Components | "ESIC Employee (ESICE)" vs "Employees' State Insurance (Employee) (ESI_EMPLOYEE)"; "PF Employee (PFE)" vs "Provident Fund (Employee) (PF_EMPLOYEE)"; "PF Employer (PFEY)" vs "Provident Fund (Employer) (PF_EMPLOYER)"; "TDS (TDDS)" vs "Income Tax (TDS) (TDS)" | One canonical component per concept | Payroll misconfiguration risk; double deductions possible | Medium |
| 9 | Gratuity typed as "Deduction" | Salary Components | Dashboard → SETUP → Salary Components | "Gratuity (GRT)" is categorized under TYPE "Deduction" | Gratuity is an employer liability/benefit, not a salary deduction | Misclassified component could affect payroll calculations | Medium |
| 10 | Inbox overtime math doesn't reconcile | HR Inbox (Overtime) | Dashboard → HR Inbox → click "1 Overtime" card | Row: OVERTIME "2h 32m", WORKED "09:56 am – 07:28 pm" (9h 32m), SHIFT "Morning Shift 10:00 am – 06:00 pm" (8h). 9h 32m − 8h = 1h 32m, not 2h 32m | Overtime should equal worked time minus shift duration | Incorrect overtime figures could overpay overtime | Medium |
| 11 | Account holder "[Company Name]" on personal account | Bank Verification | Dashboard → PAYROLL → Bank Verification → open [HR Admin Email] row | ACCOUNT HOLDER: "[Company Name]" on the HR user's personal SBI salary account | Account holder should be the employee's name | Bank verification data looks wrong; NEFT/transfer issues possible | Medium |
| 12 | Regularization row with zero-duration recorded punches | Regularizations | Dashboard → TIME & LEAVE → Regularizations | [Date] row: RECORDED "10:36 am – 10:36 am" (clock-in equals clock-out) | Recorded punches should have a valid duration | Indicates a broken/duplicate punch record | Low |
| 13 | Regularization MODE "N/A" | Regularizations / HR Inbox | Dashboard → TIME & LEAVE → Regularizations | 2 of 3 rows show MODE "N/A" (one shows "Office") | Mode should indicate where/how attendance was recorded | Missing context for approving corrections | Low |
| 14 | Employee report default date range inverted | Attendance Reports | Dashboard → INSIGHTS → Attendance Reports → Employee report | START DATE defaults to [Date], END DATE to [Date] (start after end); "Generate report" stays disabled | Start date should default to before the end date | HR must manually fix dates before generating | Low |
| 15 | "EarnComplimentary Offf" label defect | Complimentary Off Policies | Dashboard → SETUP → Complimentary Off Policies | Note text: "…has "EarnComplimentary Offf"" — missing space and triple "f" | "Earn Complimentary Off" | Confusing policy guidance text | Low |
| 16 | "Complementary Off" vs "Compensatory Off" | Leave Types | Dashboard → SETUP → Leave Types | Leave type named "Complementary Off" (CO); elsewhere the product uses "Compensatory Off" | Consistent terminology ("Compensatory") | Terminology confusion | Low |
| 17 | Maternity Leave code "UL" | Leave Types | Dashboard → SETUP → Leave Types | Maternity Leave has CODE "UL" | Expected a code like "ML" | Odd leave-type code | Low |
| 18 | "After 1 days" grammar | Leave Types | Dashboard → SETUP → Leave Types | DOCUMENT AFTER shows "After 1 days" (Festival Leave) | "After 1 day" | Minor grammar | Low |
| 19 | "Restructrue" typo in salary history | My Salary & Bank | Dashboard → ME → My Salary & Bank → Salary History | Reason text "Restructrue [Amount] / year" | "Restructure" | Minor typo in HR-visible history | Low |
| 20 | "v 1" / "v 6" version spacing | Payslips & Documents, My Salary & Bank | Dashboard → PAYROLL → Payslips & Documents; ME → My Salary & Bank | Versions render as "v 1", "v 6" (space between v and number) | "v1", "v6" | Cosmetic | Low |
| 21 | "Patidar 's pay" spacing | Payslips & Documents (Annual statement) | Dashboard → PAYROLL → Payslips & Documents → Annual statement | Note text "[Employee Name] 's pay" | "[Employee Name]'s pay" | Cosmetic | Low |
| 22 | Pagination/footer missing spaces | Multiple tables | Attendance Directory ("6records"), Audit Log ("251entries"), Exports ("5exports"), My Attendance ("7records") | Count text has no space between number and word | "6 records" etc. | Cosmetic | Low |
| 23 | WITHDRAWN payslips still employee-visible | Payslips & Documents | Dashboard → PAYROLL → Payslips & Documents | 4 WITHDRAWN v[Date] payslips show "EMPLOYEE CAN SEE IT: Yes" | Withdrawn payslips should not be employee-visible | Employees may see superseded payslips | Low |
| 24 | Completed exports with 0 rows | Exports | Dashboard → INSIGHTS → Exports | Two COMPLETED exports (Component report PDF, Payroll register PDF) show "0 rows" | Completed exports should contain data | Indicates empty/failed exports marked complete | Low |
| 25 | "SCHEDULE: UNKNOWN" on Payroll reminders job | Payroll Automation | Dashboard → SETUP → Automation (payroll) | Job card shows "SCHEDULE: UNKNOWN" | Schedule should be displayed | HR cannot tell when reminders run | Low |
| 26 | Currency/rates render with 4 decimals | Salary Components, Structure Templates | Dashboard → SETUP → Salary Components / Structure Templates | "[Amount]", "50.0000%", "40.0000%" | Conventional formatting ([Amount]; 50%) | Cosmetic; harder to scan | Low |
| 27 | Global search "Search anything..." non-functional | Top bar | Any page → "Search anything..." | Typing "leave" and pressing Enter produced no suggestions, results, or navigation | Search should return matching pages/records | Core navigation aid is broken | Medium |
| 28 | Help Center button: no visible response | Sidebar footer | Any page → "Help Center 8" | Clicking produced no panel, dialog, or navigation (badge shows 8) | Should open help content | Help is unreachable | Medium |
| 29 | "Setting" button: no visible response | Sidebar footer | Any page → "Setting" | Clicking produced no panel or navigation | Should open settings | Settings unreachable | Low |
| 30 | Unnamed top-bar button (bell): no visible response | Top bar | Any page → bell icon button | Clicking produced no notifications panel or navigation | Should open notifications | Notifications unreachable | Low |
| 31 | Trivial [Amount] loan for [Employee Name] | Loans & Advances | Dashboard → PAYROLL → Loans & Advances | Loan: principal [Amount] EMI [Amount] 6 months, ACTIVE | Realistic loan amounts | Test data in the system | Low |
| 32 | "Cost[Amount]" spacing / inconsistent decimals | Payroll Runs (run detail) | Dashboard → PAYROLL → Payroll Runs → September 2026 run | "Cost[Amount]" (missing space; 1 decimal) vs "[Amount]" (2 decimals) | Consistent currency formatting | Cosmetic | Low |
| 33 | Profile role shown as "Hr" (mixed case) | My Profile | Top bar → [HR Admin Email] | Role displays "Hr" | "HR" | Cosmetic | Low |
| 34 | Duplicate sidebar label "Automation" | Sidebar (SETUP) | Dashboard → SETUP | Two different links are both labeled "Automation" (leave vs payroll) | Distinct labels (e.g. "Leave Automation", "Payroll Automation") | Navigation ambiguity | Low |
| 35 | Office location "Location Status" has no value | Office Locations | Dashboard → SETUP → Office Locations | "Location Status" label shows no value; status must be inferred from the Deactivate switch | A visible status value (e.g. Active) | Minor UX gap | Low |
| 36 | Comp-off policy HALF/FULL DAY "N/A / N/A" | Complimentary Off Policies | Dashboard → SETUP → Complimentary Off Policies | Credit thresholds show "N/A / N/A" | Configured half/full-day thresholds or a clearer placeholder | Policy completeness unclear | Low |
| 37 | Nainika ([Bank Name]) and Maya ([Bank Name]) share last-4 "7890" | Bank Verification | Dashboard → PAYROLL → Bank Verification | Two employees in different banks share account last-4 "[Bank Account Number]" | Unique account numbers | Possible test-data duplication | Low |
| 38 | Department card metric label "ID" unclear | Dashboard ("View all (4)" dialog) | Dashboard → "View all (4)" | Each department row shows an "ID" label whose meaning is unclear | A labeled metric or no label | Minor labeling gap | Low |
| 39 | EPS rate float artifact in input control | Statutory & Tax | Dashboard → TAX & COMPLIANCE → Statutory & Tax | EPS RATE spinbutton underlying value 8.329999923706055 (displayed correctly as 8.33) | Clean decimal value | None user-facing; noted for QA | Low |

**Areas inspected with no issue observed:** login flow and session; Dashboard stat cards (8/0/8/0 reconcile with department overview 2+5+1 and attendance records 6+1+1); Leave Requests data (2 approved rows, full detail dialog); Shift Roster (8 assignments); Holidays (13 holidays, year switching); Weekly Offs rules; Leave Policies cards; Attendance Policies table; Complimentary Offs (empty, expected); Exits & Settlements (1 exit); Audit Log (251 entries, pagination); Documents hub; Employee Profile tabs (except day-level attendance breakdown, which had no records to show); My Attendance/Regularizations/Flags/Overtime/Comp-Offs/Claims/Salary & Bank self-service pages.

---

## Navigation Coverage Matrix

| # | Module | Tab | Sub-tab | Explored | Data Checked | Read-only Navigation Checked | Issues |
|---|--------|-----|---------|----------|--------------|------------------------------|--------|
| 1 | Login | — | — | Yes | Yes | Yes | None |
| 2 | Dashboard | Command Center | — | Yes | Yes | Yes | #27–30, #38 |
| 3 | Dashboard | Team Performance | — | Yes | Yes | Partial (month nav disabled at period end) | None |
| 4 | Dashboard | Department overview | All departments dialog | Yes | Yes | Yes | #2 |
| 5 | Dashboard | Attendance Directory | Employees/Managers/HR | Yes | Yes | Yes | #6 |
| 6 | HR Inbox | Pending regularizations | All/Employees/Managers/HR | Yes | Yes | Yes | #12, #13 |
| 7 | HR Inbox | Pending overtime | All/Employees/Managers/HR | Yes | Yes | Yes | #10 |
| 8 | HR Inbox | Summary cards (Leave/Regularizations/Overtime/Comp-offs/Flags) | — | Yes | Yes | Yes | None |
| 9 | Team | Team Directory | — | Yes | Yes | Yes (search) | #6, #7 |
| 10 | Departments | Department cards | — | Yes | Yes | Partial (Edit dialog opened, cancelled; Add not clicked) | #2 |
| 11 | Live Attendance | Employees | — | Yes | Yes | Yes (search, status filter, date nav, refresh) | #2, #6, #22 |
| 12 | Live Attendance | Managers | — | Yes | Yes | Yes | None |
| 13 | Live Attendance | HR | — | Yes | Yes | Yes | #6 |
| 14 | Leave Requests | Pending Queue | — | Yes | Yes | Yes | None |
| 15 | Leave Requests | All History | Detail dialog | Yes | Yes | Yes | None |
| 16 | Regularizations | — | All/Employees/Managers/HR | Yes | Yes | Yes | #12, #13 |
| 17 | Complimentary Offs | Earned | — | Yes | Yes | Yes | None |
| 18 | Complimentary Offs | Approved | — | Yes | Yes | Yes | None |
| 19 | Shift Roster | — | All/Ongoing/Upcoming/Ended | Yes | Yes | Yes | None |
| 20 | Lock Attendance | Lock periods | — | Yes | Yes | Yes (view only) | None |
| 21 | Lock Attendance | Recompute stale records | — | Yes | N/A (no action taken) | Not checked (mutation) | — |
| 22 | Adjustments | — | Detail dialog | Yes | Yes | Yes | #1 |
| 23 | Bonus Rules | — | — | Yes | Yes | Yes | #5 |
| 24 | Claims | Claims | — | Yes | Yes (empty) | Yes | None |
| 25 | Claims | Categories | — | Yes | Yes (empty) | Yes | None |
| 26 | Loans & Advances | — | — | Yes | Yes | Yes | #31 |
| 27 | Encashments | — | — | Yes | Yes (empty) | Yes | None |
| 28 | Exits & Settlements | — | — | Yes | Yes | Yes | None |
| 29 | Pay Differences | Check a month | — | Yes | Yes | Partial (Check button not clicked — uncertain) | — |
| 30 | Pay Differences | Already paid out | — | Yes | Yes (empty) | Yes | None |
| 31 | Bank Verification | All/Verified/Awaiting/No account | Account detail dialog | Yes | Yes | Yes | #11, #37 |
| 32 | Payroll Runs | Runs list | — | Yes | Yes | Yes | #3 |
| 33 | Payroll Runs | Run detail (Sept 2026) | Everyone/Calculated/Needs attention/Excluded/Waiting | Yes | Yes | Yes | #32 |
| 34 | Payslips & Documents | Payslip history | — | Yes | Yes | Yes | #20, #23 |
| 35 | Payslips & Documents | Annual statement | — | Yes | Yes (N/A, expected) | Yes | #21 |
| 36 | Payslips & Documents | Form 16 | — | Yes | Yes | Yes | None |
| 37 | Employee Salaries | Salary Assignment | Salary history panel | Yes | Yes | Yes | None |
| 38 | Tax Declarations | — | — | Yes | Yes (empty; FY 2026-27 and 2025-26 checked) | Yes | None |
| 39 | Statutory & Tax | PF/ESI/PT/TDS | — | Yes | Yes | Yes (view only) | #39 |
| 40 | Statutory & Tax | Professional Tax Slabs | — | Yes | Yes (empty) | Yes | None |
| 41 | Statutory & Tax | Income-Tax Regimes | — | Yes | Yes (empty) | Yes | None |
| 42 | Year-End & Form 16 | — | Yes | Yes | Yes (empty) | Yes | None |
| 43 | Attendance Reports | Daily report | — | Yes | Yes | Partial (Generate not clicked — export) | — |
| 44 | Attendance Reports | Monthly report | — | Yes | Yes | Partial (Generate not clicked — export) | — |
| 45 | Attendance Reports | Employee report | — | Yes | Yes | Partial (Generate not clicked — export) | #14 |
| 46 | Payroll Reports | Payroll register/Department distribution/Deduction summary/Component report | One payroll run / A period | Yes | Yes (empty) | Partial (Show/Download not clicked — export) | #4 |
| 47 | Exports | — | — | Yes | Yes | Yes | #24 |
| 48 | Audit Log | — | — | Yes | Yes | Yes | #22 |
| 49 | Office Locations | — | — | Yes | Yes | Yes | #35 |
| 50 | Work Shifts | Shift Templates | — | Yes | Yes | Yes | None |
| 51 | Work Shifts | Rotation Patterns | — | Yes | Yes (empty) | Yes | None |
| 52 | Attendance Policies | — | — | Yes | Yes | Yes | None |
| 53 | Complimentary Off Policies | — | — | Yes | Yes | Yes | #15, #36 |
| 54 | Holidays | Holiday List | — | Yes | Yes | Yes (year switching) | None |
| 55 | Weekly Offs | Organisation-wide rules | — | Yes | Yes | Yes | #2 |
| 56 | Weekly Offs | Targeted rules | — | Yes | Yes | Yes | #2 |
| 57 | Leave Types | — | Leave type detail dialog | Yes | Yes | Yes | #16, #17, #18 |
| 58 | Leave Policies | Policy cards | — | Yes | Yes | Partial (cards not opened — may lead to edit) | — |
| 59 | Leave Automation | Monthly Leave Credit / Rollover | — | Yes | Yes | Partial (trigger buttons not clicked — mutation) | — |
| 60 | Salary Components | — | — | Yes | Yes | Yes | #8, #9, #26 |
| 61 | Structure Templates | Template cards | Preview Structure panel | Yes | Yes | Yes | None |
| 62 | Benefit Plans | Plans | — | Yes | Yes (empty) | Yes | None |
| 63 | Payroll Settings | — | — | Yes | Yes | Yes (view only; Save not clicked) | None |
| 64 | Payroll Automation | Automatic jobs | — | Yes | Yes | Partial (run-now buttons not clicked — mutation) | #25 |
| 65 | My Attendance | — | — | Yes | Yes | Yes | None |
| 66 | My Regularizations | All/Pending/Approved/Rejected/Cancelled | — | Yes | Yes | Yes | None |
| 67 | My Flags | Open/Resolved/All | — | Yes | Yes (empty) | Yes | None |
| 68 | My Overtime | — | — | Yes | Yes | Yes | None |
| 69 | My Complimentary Offs | All/Earned/Approved/Used/Expired/Rejected/cancelled | — | Yes | Yes | Yes | None |
| 70 | My Claims | My claims | — | Yes | Yes (empty) | Yes | None |
| 71 | My Salary & Bank | Salary breakdown / Salary history | — | Yes | Yes | Yes | #19, #20 |
| 72 | Employee Profile | Overview/Attendance/Department/Leave/Profile/Reports | — | Yes | Yes | Yes | #2 |
| 73 | My Profile | — | — | Yes | Yes | Yes | #6, #33 |
| 74 | Documents hub | All doc sections | — | Partial (2 of 6 sections read) | Yes | Yes | None |
| 75 | Top bar | Search/Help Center/Setting/Notifications | — | Yes | N/A | Partial (no visible response — purpose undetermined) | #27–30 |

---

## HR User Question → Navigation Mapping

(Only paths actually verified in this audit.)

- **How can HR view today's attendance?** → Dashboard → Attendance Directory (embedded), or TIME & LEAVE → Live Attendance → tabs Employees / Managers / HR; use Previous day / Next day or the date picker for other dates.
- **How can HR view an employee's attendance?** → Dashboard → Attendance Directory → click **"Open [Name]'s attendance"** → Employee Profile → Attendance tab.
- **How can HR view an employee's profile?** → Dashboard → Attendance Directory → click **"Open [Name]'s attendance"** → Employee Profile → Profile tab (personal, work, contact details) or Overview tab (monthly stats).
- **How can HR see an employee's department and manager?** → Dashboard → Attendance Directory → click **"Open [Name]'s attendance"** → the Organization card (Department, Designation, Role, Manager, Dept. Head) or the Department tab.
- **How can HR view an employee's leave balances?** → Dashboard → Attendance Directory → click **"Open [Name]'s attendance"** → Leave tab.
- **Where can HR see leave requests?** → TIME & LEAVE → Leave Requests → Pending Queue / All History; or HR Inbox (summary cards).
- **Where can HR approve or reject regularizations?** → HR Inbox (review queue; 4 items); the full pending list is at TIME & LEAVE → Regularizations.
- **Where can HR see overtime awaiting approval?** → HR Inbox → click the **"1 Overtime"** card.
- **How can HR check an employee's salary?** → PAYROLL → Employee Salaries → the employee's CURRENT CTC row; click **History** for past revisions.
- **Where can HR view payroll runs?** → PAYROLL → Payroll Runs → click **"Review & approve: [Month Year]"** for the run detail (figures, bonuses/loans, tax & statutory, cost by department, per-employee table).
- **Where can HR verify bank accounts?** → PAYROLL → Bank Verification → tabs ALL EMPLOYEES / VERIFIED / AWAITING / NO ACCOUNT; click a row for account details.
- **Where can HR manage salary adjustments?** → PAYROLL → Adjustments (filter by status, pay month, type, category); click a row for the detail dialog.
- **Where can HR view bonus rules?** → PAYROLL → Bonus Rules (filter by status, paid-in month, calculation).
- **Where can HR see loans and advances?** → PAYROLL → Loans & Advances (filter by status).
- **Where can HR see exits and settlements?** → PAYROLL → Exits & Settlements (filter by stage).
- **Where can HR find payslips?** → PAYROLL → Payslips & Documents → select the EMPLOYEE → Payslip history / Annual statement / Form 16 tabs.
- **Where can HR see tax declarations?** → TAX & COMPLIANCE → Tax Declarations → select FY and status.
- **Where can HR configure PF/ESI/PT/TDS rules?** → TAX & COMPLIANCE → Statutory & Tax → PF / ESI / PT / TDS, Professional Tax Slabs, Income-Tax Regimes tabs.
- **Where can HR see attendance reports?** → INSIGHTS → Attendance Reports → Daily report / Monthly report / Employee report tabs.
- **Where can HR see payroll reports?** → INSIGHTS → Payroll Reports → report-type buttons and One payroll run / A period tabs.
- **Where can HR see what was exported?** → INSIGHTS → Exports (filter by what/format/outcome).
- **Where can HR audit payroll changes?** → INSIGHTS → Audit Log (filter by entity, action, employee, date range).
- **Where can HR manage holidays?** → SETUP → Holidays → year buttons 2025/2026/2027; Common Holidays Catalog; Holiday List.
- **Where can HR manage weekly offs?** → SETUP → Weekly Offs (Organisation-wide rules / Targeted rules).
- **Where can HR manage work shifts?** → SETUP → Work Shifts (Shift Templates / Rotation Patterns).
- **Where can HR manage attendance policies?** → SETUP → Attendance Policies.
- **Where can HR manage comp-off policies?** → SETUP → Complimentary Off Policies.
- **Where can HR manage office locations?** → SETUP → Office Locations.
- **Where can HR manage leave types?** → SETUP → Leave Types → click a row for the leave-type detail dialog.
- **Where can HR manage leave policies?** → SETUP → Leave Policies (policy cards).
- **Where can HR manage salary components?** → SETUP → Salary Components.
- **Where can HR manage salary templates?** → SETUP → Structure Templates → **Preview** for a read-only template preview.
- **Where can HR see their own attendance?** → ME → My Attendance.
- **Where can HR see their own salary and bank details?** → ME → My Salary & Bank (expand **"View salary breakdown (5 components)"** for the full calculation).
- **Where can HR lock attendance for payroll?** → PAYROLL → Lock Attendance (Lock periods table; Recompute stale records).
- **Where is the HR documentation?** → **Documents** button in the top bar → documentation hub sections.

---

## Action Modules & Form Descriptions

This section documents the expected form fields and their purposes for all major creation/editing actions available to the HR User.

### Add Department (Departments > Add Department)
- **Purpose:** Creates a new department within the organization, which allows for grouping employees and applying targeted attendance or leave policies.
- **Form Fields:**
  - **Department Name (Text Input):** The primary identifier for the department (e.g., "Engineering", "Marketing").
  - **Location (Dropdown):** Maps the department to an existing physical office location for attendance geofencing.
  - **Head of Department (Dropdown/Search):** Assigns a manager or director to oversee the department. This user often receives escalated leave or regularization approvals.
  - **Description (Text Area):** Context about the department's function.
  - **Department is Active (Checkbox):** Toggles whether this department can accept new employees.

### Add Location (Setup > Organization > Office Locations)
- **Purpose:** Defines the geographical perimeter (geofence) where employees are allowed to clock in.
- **Form Fields:**
  - **Location Name (Text Input):** Name of the office (e.g., "Head Office").
  - **Address Fields (Street, City, State, ZIP):** Determines the exact address for taxation and compliance.
  - **Radius (Number Input):** The geofence radius (in meters) within which mobile punches are accepted.

### Add Shift (Setup > Organization > Work Shifts)
- **Purpose:** Defines working hours for attendance tracking.
- **Form Fields:**
  - **Shift Name (Text Input):** Name of the schedule (e.g., "Morning Shift").
  - **Shift Type (Dropdown - Fixed/Flexible):** Dictates if the employee must be in at an exact time or just fulfill hourly quotas.
  - **Start Time & End Time (Time Pickers):** The expected working hours.
  - **Linked Policy (Dropdown):** Ties the shift to a specific attendance policy (which controls grace periods and late marks).

### Create Policy (Setup > Organization > Attendance Policies)
- **Purpose:** Sets the rules for how attendance behavior is penalized or approved.
- **Form Fields:**
  - **Policy Name (Text Input):** Name of the rule set.
  - **Late Grace Period (Number Input):** Minutes allowed after shift start before the employee is marked "Late".
  - **Minimum Hours for Full Day / Half Day (Number Inputs):** Strict thresholds dictating when an employee gets a full or half-day mark based on total hours clocked.
  - **Regularization Window (Number Input):** Days an employee has to correct a missed punch.

### Invite Member (People > Team)
- **Purpose:** Onboards a new employee into the HRMS.
- **Form Fields:**
  - **Employee Name & Email (Text Inputs):** Identity and login destination.
  - **Role (Dropdown - Employee, Manager, HR):** Sets application permissions.
  - **Department & Designation (Dropdown/Text):** Assigns organizational position.

### Grant Loan (Payroll > Loans & Advances)
- **Purpose:** Issues a company loan or advance, setting up automatic deductions from future payrolls.
- **Form Fields:**
  - **Employee (Dropdown):** The recipient.
  - **Type (Loan / Advance):** Categorizes the disbursement.
  - **Principal Amount (Number Input):** Total amount given.
  - **Interest Rate & Type (Number / Dropdown):** E.g., 0% Flat or Reducing Balance.
  - **Tenure (Number Input in Months):** Generates the EMI schedule automatically.

### Start New Run (Payroll > Payroll Runs)
- **Purpose:** Generates a draft payroll for a specific month, gathering all locked attendance, leave deductions, and loans.
- **Form Fields:**
  - **Run Type (Regular monthly / Off-cycle / Final settlement):** Determines how taxes and regular deductions apply.
  - **Target Month (Month/Year Picker):** The payroll period.
