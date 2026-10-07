# Comprehensive Manager Panel UI/UX & Data-Rendering Review Report

**Date of Review**: 06 October 2026  
**Auditor**: Senior Frontend & QA Engineering Agent  
**Environment**: Production/Staging (`https://frontend.dev.hrclouds.in`)  
**Target Account**: `kisan@gmail.com` (Manager Role — Lalit Gahlot, #MNGR-02)  
**Target Audience**: Frontend Engineering Team  

---

## 1. Executive Summary & Review Scope

An exhaustive, end-to-end audit of the **HrClouds Manager Panel** was performed across all primary navigation routes, sub-tabs, filter states, detail modals, and header controls:
- **Manager Dashboard** (`/dashboard/manager`)
- **Manager Requests Inbox** (`/dashboard/manager/requests/inbox`)
- **Team Directory & Member Profile Details** (`/dashboard/manager/team`, `/dashboard/manager/team/EMP-04`)
  - Sub-tabs: *Overview*, *Attendance*, *Leave*, *Salary*, *Documents*, *Profile*
- **Live Attendance** (`/dashboard/manager/team/today`)
- **Attendance History & Range Selector** (`/dashboard/manager/team/history`)
- **Leave Requests** (`/dashboard/manager/requests/leaves`)
- **Attendance Corrections / Regularizations** (`/dashboard/manager/requests/regularizations`)
- **Overtime Requests & Review Modal** (`/dashboard/manager/requests/overtime`)
- **Flags & Team Attendance Anomalies** (`/dashboard/manager/team/anomalies`)
- **Earned Leave / Comp-Off Requests** (`/dashboard/manager/requests/comp-offs`)
- **Employee Salaries & Revision Proposals** (`/dashboard/manager/payroll/team-salary`)
- **Global Header, Search Palette, Profile & Navigation Drawer** (`/dashboard/profile`)

The audit was conducted strictly in read-only mode (no mutating `POST`, `PUT`, `PATCH`, or `DELETE` operations performed). Below is the comprehensive log of 13 identified issues categorized by priority, designed to be immediately actionable for frontend engineers.

---

## 2. Detailed Issue Log

---

### Issue 1: Broken Chart X-Axis Labels (Vertical Character Stacking) on Manager Dashboard
- **Page/Module**: Manager Dashboard (`/dashboard/manager`)
- **UI element/tag/component**: "Team attendance trends" Bar Chart — X-axis tick labels (`<svg class="recharts-xAxis">` or chart text wrapper)
- **Issue description**: The day-of-week labels on the X-axis (e.g., `SUNDAY`, `MONDAY`) are vertically distorted and broken. The letters of each day name are forced to break into a single-character-wide column (e.g. `S` over `U` over `N` over `D` over `A` over `Y`), directly overlapping the chart grid lines and purple attendance bars.
- **Expected behavior**: Day-of-week labels should be legible and properly aligned horizontally. They should either be abbreviated (e.g., `Sun`, `Mon`, `Tue`) or angled at -45 degrees with `white-space: nowrap;` so that characters do not wrap or overlap graphical bars.
- **Actual behavior**: Full day strings wrap letter-by-letter vertically into the chart plot area, rendering the axis labels unreadable and visually broken.
- **Severity/Priority**: **High** (Prominent visual defect on the primary manager landing page).
- **API/data mismatch**: Data returned by the backend includes full string names (e.g., `"SUNDAY"`, `"MONDAY"`), but the frontend chart tick formatter does not truncate or format them into standard 3-letter abbreviations (`"Sun"`).

---

### Issue 2: Absent Employee Erroneously Rendered as "On time" in Attendance History
- **Page/Module**: Attendance History (`/dashboard/manager/team/history`)
- **UI element/tag/component**: LATE / EARLY column status badge (`<td><span class="badge badge-purple">On time</span></td>`)
- **Issue description**: On dates where an employee is marked **Absent** (for example, Maya Chaudhary on `Sat, 3 Oct, 2026`, where `STATUS: Absent`, `IN: N/A`, `OUT: N/A`, and `EFFECTIVE: 0m`), the "LATE / EARLY" column displays a purple badge indicating **"On time"**.
- **Expected behavior**: An absent employee was not present to be either late or on time. The "LATE / EARLY" cell should render `N/A` or `-` (consistent with how `Fri, 2 Oct, 2026 (Holiday)` and `Sun, 4 Oct, 2026 (Weekly off)` are handled).
- **Actual behavior**: Displays an active **"On time"** status badge for a day the employee did not attend work.
- **Severity/Priority**: **High** (Misleading data presentation that can skew attendance audits and performance reviews).
- **API/data mismatch**: The frontend rendering logic appears to check `if (minutesLate === 0)` or evaluates `latenessMinutes <= 0` without first checking whether `status.toLowerCase() === 'absent'` or `isPresent === false`.

---

### Issue 3: Inconsistent Formatting for Absent Work Hours Across Attendance Views
- **Page/Module**: Team Member Detail Attendance Tab (`/dashboard/manager/team/EMP-04` -> Attendance) vs Attendance History (`/dashboard/manager/team/history`)
- **UI element/tag/component**: `HOURS` / `EFFECTIVE` table cell
- **Issue description**: In Maya Chaudhary's Attendance tab:
  - `Sat, 03 Oct, 2026` (`STATUS: Absent`, `IN: N/A`, `OUT: N/A`): `HOURS` is rendered as **`0m`**.
  - `Thu, 01 Oct, 2026` (`STATUS: Absent`, `IN: N/A`, `OUT: N/A`): `HOURS` is rendered as **`N/A`**.
  - Meanwhile, in Attendance History (`/dashboard/manager/team/history`), all absent records are rendered as `0m`.
- **Expected behavior**: Standardized formatting across all attendance tables. If an employee is absent with no clock-in/out records, the hours worked should consistently display either `0m` or `N/A`, rather than alternating between both within the exact same table.
- **Actual behavior**: Two identical absent states produce different cell contents (`0m` vs `N/A`).
- **Severity/Priority**: **Medium** (Inconsistent data formatting).
- **API/data mismatch**: The backend may return `0` or `null` interchangeably for `effective_work_duration`, and the frontend helper lacks a normalized fallback rule (e.g. `formatHours(record.effectiveHours ?? 0)`).

---

### Issue 4: Global Spelling Typo in Department Entity Name ("Sales And Markerting")
- **Page/Module**: Global Manager Panel (Dashboard, Team Directory, Team Profile Card, Salaries Page, Overtime Modal)
- **UI element/tag/component**: Department badges and labels (`<span>Sales And Markerting</span>`)
- **Issue description**: The department name for team members and the manager is consistently spelled with a typographical error as **"Sales And Markerting"** (extra letter 'r').
- **Expected behavior**: Department name should be spelled correctly as **"Sales And Marketing"**.
- **Actual behavior**: Renders **"Sales And Markerting"** across all headers, cards, and tables.
- **Severity/Priority**: **Low** (Content/Text defect).
- **API/data mismatch**: Backend database record for `Department.name` contains the string `"Sales And Markerting"`. Frontend should ensure sanitization or request a database patch for existing seed/tenant data.

---

### Issue 5: Mac Command Symbol (`⌘F`) Rendered on Windows OS in Search Bar
- **Page/Module**: Global Header Navigation
- **UI element/tag/component**: Search pages input shortcut indicator (`<kbd class="shortcut">⌘F</kbd>`)
- **Issue description**: The search bar in the top navigation header renders the macOS Command symbol (`⌘F`) even when running on Windows 11/10 and Linux environments. Windows keyboards have no `⌘` key, making the shortcut indicator confusing or unhelpful for PC users.
- **Expected behavior**: The UI should detect the client's platform via `navigator.userAgent` or `navigator.userAgentData?.platform`:
  - On Windows/Linux: Render `Ctrl + F` or `Ctrl + K`.
  - On macOS: Render `⌘F` or `⌘K`.
- **Actual behavior**: Static `⌘F` is hardcoded across all client operating systems.
- **Severity/Priority**: **Low** (Platform-specific UX polish).

---

### Issue 6: Misleading Overtime Baseline Display in Table vs Review Modal
- **Page/Module**: Manager Inbox (`/dashboard/manager/requests/inbox`) & Overtime Requests (`/dashboard/manager/requests/overtime`)
- **UI element/tag/component**: Overtime table "SHIFT" column vs Timeline graph in "Review overtime request" modal
- **Issue description**: In the Overtime requests table:
  - Column **SHIFT** displays: `Morning Shift · 10:00 am - 06:00 pm` (which is an **8-hour** shift).
  - Column **WORKED** displays: `09:30 am - 07:00 pm` (9h 30m total, 8h 43m effective).
  - Column **OVERTIME** displays: **`1h 43m`**.
  - A manager viewing this table calculates: `8h 43m effective - 8h shift = 43 minutes overtime`. The displayed `1h 43m` appears to be a 1-hour calculation bug.
  - Only upon opening the modal does the explanation reveal: *"worked 8h 43m (after 47m of breaks) – full day 7h = 1h 43m overtime. Overtime counts time beyond the attendance policy's full-day hours, not the shift length."*
- **Expected behavior**: The table should indicate the baseline policy hours (e.g. `Policy: 7h (Shift: 10am - 6pm)`), or provide an information tooltip next to the `1h 43m` value. Otherwise, managers will assume the system has a math bug and inadvertently reject valid claims.
- **Actual behavior**: Table displays an 8-hour shift schedule alongside an overtime value calculated against a 7-hour policy, causing confusion.
- **Severity/Priority**: **Medium** (Usability & data clarity).
- **API/data mismatch**: Backend API returns `shift_hours: 8` and `policy_full_day_hours: 7`. The frontend table only renders `shift_name` and `shift_timings` while hiding the policy baseline used in the calculation formula.

---

### Issue 7: Horizontal Overflow & Dual Scrollbars in Side-by-Side Earnings and Deductions Tables
- **Page/Module**: Team Member Detail Salary Tab (`/dashboard/manager/team/EMP-04` -> Salary)
- **UI element/tag/component**: "EARNINGS" and "DEDUCTIONS" tables container (`<div class="grid grid-cols-2">` / `overflow-x-auto`)
- **Issue description**: On standard desktop resolutions (1600x732 viewport):
  - The "EARNINGS" table has its `ANNUAL` column clipped off-screen, spawning a prominent horizontal scrollbar.
  - The "DEDUCTIONS" table has its header clipped to `ANNU`, showing an empty state with another horizontal scrollbar right beside it.
- **Expected behavior**: Standard salary breakdown tables with 3–4 columns should fit comfortably within their grid columns on a 1600px desktop display without triggering horizontal scrollbars. Alternatively, columns should stack or adjust padding (`px-2 py-1.5`) dynamically.
- **Actual behavior**: Two separate horizontal scrollbars appear simultaneously side-by-side inside the salary card.
- **Severity/Priority**: **Medium** (Layout responsiveness & visual clutter).

---

### Issue 8: Employee Address Truncated with Ellipsis Without Text Wrapping or Tooltip
- **Page/Module**: Team Member Profile Tab (`/dashboard/manager/team/EMP-04` -> Profile)
- **UI element/tag/component**: "ADDRESS DETAILS" paragraph (`<p class="truncate">` / `text-overflow: ellipsis`)
- **Issue description**: The employee's address is truncated with an ellipsis on a single line:
  `"Indraprasth Tower, Mahatma Gandhi Marg, Indore City, Indore, Juni Indore Tahsil, Indore, Madhya Pradesh, 452001, India, Madhya Prade..."`
  There is no option to expand, hover for a tooltip, or wrap text onto multiple lines.
- **Expected behavior**: Full physical addresses should wrap across lines (`whitespace-normal break-words`) or be displayed inside a multiline block so managers can view the full address.
- **Actual behavior**: Suffix of city, state, and pin details is cut off with `...`.
- **Severity/Priority**: **Medium** (Data truncation / accessibility).

---

### Issue 9: Conflicting "Role: Employee" vs "Employment Type: Intern" Terminology
- **Page/Module**: Team Member Profile Page (`/dashboard/manager/team/EMP-04`)
- **UI element/tag/component**: Left Sticky Profile Card "Role" badge vs Right Profile Tab "EMPLOYMENT TYPE" row
- **Issue description**:
  - The left employee summary card shows a purple badge: **`Role: Employee`**.
  - The right profile detail section lists: **`EMPLOYMENT TYPE: Intern`**.
- **Expected behavior**: If the left badge represents the application RBAC permissions (e.g. Admin, Manager, Employee), it should be explicitly labeled **`System Role: Employee`** or **`Access: Employee`** to prevent confusing managers about whether the person is a permanent employee or an intern.
- **Actual behavior**: Displays "Role: Employee" directly above "Designation: Marketing Person" while the profile tab states "Intern".
- **Severity/Priority**: **Low** (Terminology ambiguity).

---

### Issue 10: Inconsistent Top Metric Cards Display on Salary Proposals Tab
- **Page/Module**: Employee Salaries (`/dashboard/manager/payroll/team-salary`)
- **UI element/tag/component**: Sub-tabs ("Team" vs "My Proposals")
- **Issue description**:
  - On the "Team" tab, three summary cards are visible: `TEAM SIZE: 1`, `TOTAL CTC: ₹5,00,000`, `AVERAGE CTC: ₹5,00,000`.
  - When switching to the "My Proposals" tab, the three cards completely disappear, leaving a barren table with table headers (`TEAM MEMBER`, `PROPOSED CTC`, `EFFECTIVE FROM`, `STATUS`) and a plain message: *"You haven't proposed any revisions yet."*
- **Expected behavior**: Tab transitions should preserve visual structure. Proposal-specific metrics (e.g., `Proposals Submitted: 0`, `Pending Approval: 0`, `Approved: 0`) or an illustrated empty state container with an actionable `+ Propose Revision` button should be displayed.
- **Actual behavior**: Metric section abruptly collapses, creating a stark visual transition.
- **Severity/Priority**: **Low** (UX consistency & empty-state design).

---

### Issue 11: Notification Counter Badge Attached to Static Sidebar Category Header
- **Page/Module**: Left Sidebar Navigation
- **UI element/tag/component**: "PAYROLL" category header -> "BEFORE THE MONTH" section title (`<div class="section-title"><span class="badge">1</span></div>`)
- **Issue description**: A circular notification badge with `1` is positioned directly next to the static text `BEFORE THE MONTH`. This header is an unclickable category title, not a navigational route.
- **Expected behavior**: Badges indicating actionable pending items should be placed directly on the destination menu link (e.g. `Employee Salaries`) or on the parent item if expandable, not on a static layout header.
- **Actual behavior**: Badge is displayed on non-interactive text.
- **Severity/Priority**: **Low** (UI polish).

---

### Issue 12: Inconsistent Styling for Unpunched Attendance Status (Bold Black vs Muted Grey)
- **Page/Module**: Live Attendance (`/dashboard/manager/team/today`)
- **UI element/tag/component**: Table cells for `IN`, `OUT`, and `LATENESS`
- **Issue description**: For an employee who has not yet clocked in:
  - `IN`: Rendered as **bold black font** `N/A`.
  - `OUT`: Rendered as **bold black font** `N/A`.
  - `LATENESS`: Rendered as **faint, low-opacity grey font** `N/A`.
- **Expected behavior**: All placeholder `N/A` values across the same row should share uniform typographic weight and color (muted text, e.g., `text-gray-400`).
- **Actual behavior**: Adjacent cells display conflicting text colors and font weights for the identical fallback value `N/A`.
- **Severity/Priority**: **Low** (Visual consistency).

---

### Issue 13: Redundant Double Scrollbar on Desktop Viewport
- **Page/Module**: Manager Dashboard & Global Shell Layout
- **UI element/tag/component**: Sidebar navigation container (`<aside class="sidebar">`) & Window viewport
- **Issue description**: On standard 1080p desktop displays (with typical browser viewport height around 732px–800px), two distinct vertical scrollbars are visible side-by-side: one for the sidebar navigation menu and one for the main application content. The sidebar's native scrollbar sits directly adjacent to active item indicators.
- **Expected behavior**: The sidebar height should adjust smoothly with compact item spacing or use thin custom overlay scrollbars (`scrollbar-width: thin; scrollbar-color: transparent transparent`) that only appear on hover, eliminating native grey scrollbar tracks.
- **Actual behavior**: Two separate OS scrollbar tracks appear adjacent to each other on standard laptop/desktop screens.
- **Severity/Priority**: **Low** (UI/UX polish).

---

## 3. Summary of Verification by Page / Module

| Page / Route | Exploration Status | Issues Found |
| :--- | :---: | :--- |
| **Manager Dashboard** (`/dashboard/manager`) | Verified | Issue 1 (Chart axis labels), Issue 4 (Typo), Issue 13 (Double scrollbar) |
| **Inbox** (`/dashboard/manager/requests/inbox`) | Verified | Issue 4 (Typo), Issue 6 (Overtime baseline clarification) |
| **Team Directory** (`/dashboard/manager/team`) | Verified | Issue 4 (Typo) |
| **Team Profile Overview** (`.../EMP-04` -> Overview) | Verified | Clean |
| **Team Profile Attendance** (`.../EMP-04` -> Attendance) | Verified | Issue 3 (Inconsistent 0m vs N/A hours) |
| **Team Profile Leave** (`.../EMP-04` -> Leave) | Verified | Clean (Leave balances render correctly) |
| **Team Profile Salary** (`.../EMP-04` -> Salary) | Verified | Issue 7 (Side-by-side table horizontal overflow) |
| **Team Profile Documents** (`.../EMP-04` -> Documents) | Verified | Clean (Empty state properly rendered) |
| **Team Profile Tab** (`.../EMP-04` -> Profile) | Verified | Issue 8 (Address truncation), Issue 9 (Role vs Employment Type) |
| **Live Attendance** (`/dashboard/manager/team/today`) | Verified | Issue 12 (Inconsistent N/A text weight/color) |
| **Attendance History** (`/dashboard/manager/team/history`) | Verified | Issue 2 (Absent marked as "On time"), Issue 3 (Hours formatting) |
| **Leave Requests** (`/dashboard/manager/requests/leaves`) | Verified | Clean (Empty state "All caught up" rendered correctly) |
| **Attendance Corrections** (`.../requests/regularizations`) | Verified | Clean (Empty state properly rendered) |
| **Overtime Requests** (`.../requests/overtime`) | Verified | Issue 4 (Typo), Issue 6 (Baseline calculation context) |
| **Attendance Flags** (`/dashboard/manager/team/anomalies`) | Verified | Clean (Empty state properly rendered) |
| **Earned Leave** (`/dashboard/manager/requests/comp-offs`) | Verified | Clean (Empty state properly rendered) |
| **Employee Salaries** (`.../payroll/team-salary`) | Verified | Issue 10 (Abrupt metric card disappearance on Proposals tab) |
| **Manager Profile** (`/dashboard/profile`) | Verified | Clean (Values render after hydration; CITY is "Not set") |
| **Global Header & Sidebar** | Verified | Issue 5 (Mac ⌘F on Windows), Issue 11 (Badge on section header) |

---

## 4. Priority Recommendations for Frontend Engineers

1. **Fix Immediate Data Logic Bugs (P1 / High)**:
   - **Attendance History Lateness Badge**: Update the badge component to check `status !== 'Absent'` before showing `"On time"`.
   - **Dashboard Bar Chart**: Add a custom tick formatter to the X-axis in Recharts/Chart.js to return `day.substring(0, 3)` (e.g. `Sun`, `Mon`) instead of letting full day names wrap letter-by-letter.
2. **Improve Responsive Layouts & Tables (P2 / Medium)**:
   - **Salary Breakdown**: Adjust column min-widths or change the side-by-side Earnings/Deductions layout to stack vertically on smaller viewports so users don't have to scroll horizontally inside cards.
   - **Address Text Wrapping**: Remove `truncate` or `overflow-hidden` from the address container in the Profile tab and apply `break-words`.
3. **Refine UX Transparency & Polish (P3 / Low)**:
   - **Overtime Schedule vs Policy**: Add an info badge or tooltip next to the shift hours in the table clarifying that overtime is calculated relative to the 7-hour daily policy.
   - **OS-Aware Keyboard Shortcut**: Replace hardcoded `⌘F` with a hook (e.g., `usePlatformShortcut`) that renders `Ctrl + F` for non-Mac users.
   - **Typo**: Update seed/tenant database records to fix `"Sales And Markerting"`.
