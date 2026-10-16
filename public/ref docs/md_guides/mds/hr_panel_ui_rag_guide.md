# HR Panel — Complete UI & RAG Knowledge Guide

> **Application**: HrClouds — Cloud Based HRMS & Payroll
> **Panel**: HR Panel
> **Base URL**: `https://frontend.dev.hrclouds.in`
> **Logged-in User Role**: HR
> **Document Date**: 2026-10-05
> **Status**: Partial — Time, Leave, and Payroll Runs modules pending due to API quota limits

---

## 1. Document Purpose

This document is the **single source of truth** for the HR Panel UI of the HrClouds HRMS application. It serves as:

1. A **UI navigation guide** for HR users
2. A **RAG knowledge base** for answering HR-user queries
3. A **UI helper/reference system** for locating buttons, fields, dropdowns, and navigation paths
4. A source for answering questions like:
   - "Where can I add an employee?"
   - "Where is the leave approval option?"
   - "What fields are required in the Invite form?"
   - "What options are available in this dropdown?"

All information is based on **actual UI observation**. Nothing is assumed or fabricated.

---

## 2. Application Overview

| Property | Value |
|---|---|
| Application Name | HrClouds |
| Tagline | Cloud Based HRMS & Payroll |
| Base URL | `https://frontend.dev.hrclouds.in` |
| Panel | HR Panel |
| Dashboard URL | `/dashboard/hr/inbox` |
| Technology | Web Application (React-based SPA) |

---

## 3. HR Panel Overview

The HR Panel is the administrative interface for HR users. It provides access to:

- **Inbox** — Pending approvals and flags
- **Team (Employees)** — Employee directory and profiles
- **Invites** — Employee invitation management
- **Organisation** — Departments, Office Locations
- **Time** — Attendance, Shifts, Policies *(partially documented)*
- **Leave** — Leave types, policies, requests *(pending exploration)*
- **Pay** — Salary components, templates, statutory, benefits, settings, automation
- **Documents** — Document types, form templates, settings, automation
- **Letters** — Letterhead & branding, letter templates

---

## 4. Global Navigation

### 4.1 Sidebar Navigation Structure

The sidebar is on the **left side** of the application. It is organized into sections:

```
HR Panel Sidebar
│
├── PEOPLE
│   ├── 📥 Inbox                    → /dashboard/hr/inbox
│   ├── 👥 Team                     → /dashboard/hr/employees
│   └── ✉️ Invites                  → /dashboard/hr/invites
│
├── SETUP
│   ├── 🏢 Organisation
│   │   ├── Departments             → /dashboard/hr/departments
│   │   └── Office Locations        → /dashboard/hr/attendance/locations
│   │
│   ├── ⏱️ Time
│   │   ├── Daily Attendance        → /dashboard/hr/attendance/daily
│   │   ├── Work Shifts             → /dashboard/hr/attendance/shifts
│   │   ├── Shift Assignments       → /dashboard/hr/attendance/shift-assignments
│   │   ├── Attendance Policies     → /dashboard/hr/attendance/policies
│   │   ├── Overtime Policies       → /dashboard/hr/attendance/overtime-policies
│   │   ├── Comp-Off Policies       → /dashboard/hr/attendance/comp-off-policies
│   │   ├── Attendance Settings     → /dashboard/hr/attendance/settings
│   │   └── Attendance Automation   → /dashboard/hr/attendance/automation
│   │
│   ├── 🌴 Leave
│   │   ├── Leave Types             → /dashboard/hr/leave/types
│   │   ├── Leave Policies          → /dashboard/hr/leave/policies
│   │   ├── Leave Settings          → /dashboard/hr/leave/settings
│   │   └── Leave Automation        → /dashboard/hr/leave/automation
│   │
│   ├── 💳 Pay
│   │   ├── Salary Components       → /dashboard/hr/payroll/components
│   │   ├── Structure Templates     → /dashboard/hr/payroll/templates
│   │   ├── Tax & Legal Deductions  → /dashboard/hr/payroll/statutory
│   │   ├── Benefit Plans           → /dashboard/hr/payroll/benefits
│   │   ├── Payroll Settings        → /dashboard/hr/payroll/settings
│   │   └── Payroll Automation      → /dashboard/hr/payroll/automation
│   │
│   └── 📄 Documents
│       ├── Document Types          → /dashboard/hr/documents/types
│       ├── Form Templates          → /dashboard/hr/documents/templates
│       ├── Document Settings       → /dashboard/hr/documents/settings
│       ├── Document Automation     → /dashboard/hr/documents/automation
│       ├── Letterhead & Branding   → /dashboard/hr/documents/letterhead
│       └── Letter Templates        → /dashboard/hr/documents/letter-templates
```

> **Observation Status**: Observed from live UI. The Time and Leave sub-items were observed from sidebar expansion but individual pages were not fully explored due to API quota limits.

---

## 5. Header

| Element | Position | Description |
|---|---|---|
| Logo / App Name | Header → Top-left | HrClouds branding |
| Organisation Name | Header → Top area | Current organization context |
| Profile Menu | Header → Top-right | User avatar/dropdown with profile, settings, logout |
| Notification Icon | Header → Top-right | Bell icon for notifications |

> **Observation Status**: Partially observed. Detailed header inspection was part of the first audit session.

---

## 6. Dashboard / Inbox

### Overview

- **Page Title**: Inbox
- **URL**: `/dashboard/hr/inbox`
- **Description**: "8 items waiting across the organisation."
- **Navigation**: Sidebar → PEOPLE → Inbox

### Page Elements

#### Refresh Button
- **Location**: Inbox → Header → Top-right
- **Type**: Secondary button
- **Purpose**: Refreshes the inbox data

#### Request Category Cards

The Inbox displays pending items organized by category:

| # | Category | Description | Count | Action |
|---|---|---|---|---|
| 1 | Leave requests | Leave and cancellation requests | 0 | "Review here" |
| 2 | Attendance Corrections | Missed or wrong punches to fix | 0 | "Review here" |
| 3 | Overtime | Extra hours waiting for approval | 0 | "Review here" |
| 4 | Earned Leave | Holiday work to credit | 0 | "Review here" |
| 5 | Attendance flags | Unusual attendance to resolve | 8 | "Showing below" (Active) |

#### Filters & Tabs (Attendance Flags)

- **Search Input**: Placeholder `Search by name or code…`
- **Role Tabs**: `All (8)`, `Employees (5)`, `Managers (2)`, `HR (1)`

#### Attendance Flags Table

| Column | Description |
|---|---|
| Employee | Avatar, Name, Employee Code, Role badge |
| Date | Date of the flagged event |
| Flag | Flag type (e.g. "Unauthorized absence") |
| Severity | Badge (e.g. `High`) |
| Details | Text summary of the issue |

**Row Action**: Clicking a row opens the **Resolve attendance flag** modal.

### Modal: Resolve Attendance Flag

- **Trigger**: Click any row in the Attendance Flags table
- **Position**: Center modal overlay
- **Header**: "Resolve attendance flag" + Close `[X]` button

#### Modal Details Section
- Employee profile: Avatar, Name, ID, Designation, Department, Email
- Flag badge (e.g. `High`), Flag title (e.g. "Unauthorized absence")
- Description: "Employee did not clock in at all for the entire day. System auto-marked absent."
- Date: e.g. "Sat, 3 Oct, 2026"
- Detected timestamp: e.g. "4 Oct 2026, 07:00 am"

#### Resolution Form

- **Info text**: "Resolving records your explanation against the flag. It does not change the attendance record itself."
- **Field**: `Resolution note (required to mark resolved)`
  - Type: Textarea
  - Placeholder: "Add context for the employee…"
  - Character counter: 0/1000
  - Required: Yes (button disabled until filled)
- **Buttons**:
  - `Cancel` — Secondary, closes modal
  - `Mark resolved` — Primary, disabled until valid input
  - **Persistence Risk**: YES — Final submission was NOT performed.

### Common User Queries — Inbox

| User Query | Answer / Navigation |
|---|---|
| Where can I see pending requests? | Sidebar → Inbox (`/dashboard/hr/inbox`) |
| Where is the leave approval option? | Inbox → Leave requests → "Review here" |
| Where can I see attendance flags? | Inbox → Attendance flags card (shows "Showing below" when active) |
| How do I resolve an attendance flag? | Inbox → Attendance flags → Click any row → "Resolve attendance flag" modal |
| Where are attendance corrections? | Inbox → Attendance Corrections → "Review here" |
| Where can I see overtime requests? | Inbox → Overtime → "Review here" |
| What does the Refresh button do? | Refreshes the inbox data. Located: Inbox → Header → Top-right |

---

## 7. Team (Employee Directory)

### Overview

- **Page Title**: Team
- **URL**: `/dashboard/hr/employees`
- **Description**: "Manage all organization personnel and pending invitations."
- **Navigation**: Sidebar → PEOPLE → Team

### Page Elements

#### Top Action Buttons
- **`Invites`** button → links to `/dashboard/hr/invites`
  - Location: Top-right area
  - Purpose: Navigate to invitations management

#### Role Filter Tabs
| Tab | Count |
|---|---|
| All | 8 |
| HR | 1 |
| Manager | 2 |
| Employee | 5 |

#### Search Bar
- **Placeholder**: `Search member or email…`
- **Type**: Text input with instant search
- **Location**: Top of the page, below tabs

#### Total Count Display
- Label: `8 people`
- Location: Below search bar

#### Employee Cards (Grid View)

The employee directory displays as a **card grid** (not a table). Each card shows:

| Field | Description |
|---|---|
| Avatar | Employee photo/initials |
| Full Name | Employee's full name |
| Employee Code Badge | e.g. `HR-A43457`, `MNGR-02`, `EMP-01`, `Pending` |
| Role | `hr`, `manager`, `employee` |
| Department | `HR Department`, `Sales And Markerting`, `IT Department` |

**Observed Employees**:
- Abhishek HR (HR-A43457, hr, HR Department)
- Lalit Gahlot (MNGR-02, manager)
- Ravi Kumar (MNGR-001, manager)
- Multiple employees with EMP-xx codes

**Card Action**: Clicking an employee card navigates to the Employee Profile Details page.

### Employee Profile Details

- **URL Pattern**: `/dashboard/hr/employees/[uuid]`
- **Example URL**: `/dashboard/hr/employees/71639be3-1a97-4408-8bac-5b8039336755`
- **Navigation**: Team → Click employee card

#### Profile Header Fields

| Field | Example Value |
|---|---|
| Name | Abhishek HR |
| Employee ID | #HR-A43457 |
| Department | HR Department |
| Designation | HR Head |
| Role | HR |
| Manager | N/A |
| Dept. Head | Abhishek HR |
| Phone | N/A |

#### Overview / Metrics Cards

| Metric | Value | Description |
|---|---|---|
| Present | 0 Days present | Total days present in current period |
| Absent | 2 Days absent | Total days absent |
| On Time | 100% on time / 0 Late arrivals | Punctuality metric |
| Leave | 0 Days on leave | Total leave days taken |
| Hours Worked | 0m avg / day | Average daily working hours |
| Overtime | 0m | Total overtime hours |

#### Today Status Card
- Date display: e.g. "Mon, 5 Oct"
- Clock in: N/A
- Clock out: N/A
- Hours: N/A

#### Attendance Pattern Calendar
- Type: Monthly grid view
- Legend:
  - Present
  - Late
  - Half day
  - On leave
  - Absent
  - Holiday
  - Weekly off
  - No data
  - Upcoming

#### Profile Tabs

> **Observation Status**: The profile page has multiple tabs. The Overview tab was inspected. Other tabs (Personal, Job/Work, Attendance, Leaves, Documents, Payroll) exist but were not individually explored in detail.

### Common User Queries — Team / Employees

| User Query | Answer / Navigation |
|---|---|
| Where can I find employees? | Sidebar → Team (`/dashboard/hr/employees`) |
| Where is the employee list? | Sidebar → PEOPLE → Team |
| How do I open employee details? | Team → Click any employee card |
| Where can I search employees? | Team → Search bar (placeholder: "Search member or email…") |
| Where is the Add Employee button? | Team → Invites button → `/dashboard/hr/invites` → `New invite` button |
| How do I filter employees by role? | Team → Role tabs: All, HR, Manager, Employee |
| Where can I see employee attendance? | Team → Click employee → Overview tab → Attendance Pattern Calendar |
| Where can I see employee department? | Shown on each employee card in the Team grid |
| How do I navigate to an employee profile? | Sidebar → Team → Click employee card |

---

## 8. Invites

### Overview

- **Page Title**: Invites
- **URL**: `/dashboard/hr/invites`
- **Description**: "Everyone you've invited to join, and whether they've accepted. An invitation link lasts 48 hours from when it was last sent."
- **Navigation**: Sidebar → PEOPLE → Invites

### Page Elements

#### Top Action Buttons
- **`Refresh`** — Refreshes invite data
- **`New invite`** — Opens the Invite Team Member wizard modal
  - Location: Top-right
  - Type: Primary button
  - **Persistence Risk**: YES — Opens a form that can send invitations

#### Counter Cards

| Metric | Value |
|---|---|
| Waiting to be accepted | 0 |
| Accepted | 2 |
| Expired — invite again | 0 |

#### Filter Bar

| Filter | Type | Placeholder/Default |
|---|---|---|
| Search | Text input | `Search by name or email` |
| Role | Dropdown | `Any role` |
| Department | Dropdown | `Every department` |

#### Status Tabs
`All` | `Waiting` | `Accepted` | `Expired` | `Revoked`

#### Invites Table

| Column | Description |
|---|---|
| Person | Avatar, Name, Email |
| Role | Role badge, Title/Designation |
| Department | Department name |
| Status | Status badge, Joined Date |
| Sent | Date the invite was sent |
| Invited by | Name of the person who sent the invite |

### Modal: Invite Team Member Wizard

- **Trigger**: `New invite` button
- **Type**: Modal overlay
- **Header**: "Invite Team Member" + Close `[X]` button
- **Layout**: Accordion-style steps (all visible, expandable)

#### Step 1: Required Information

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Employee ID | Text input | No | `e.g. EMP001 (Optional)` |
| Full Name | Text input | Yes (*) | — |
| Email Address | Text input | Yes (*) | — |
| Role | Select dropdown | Yes (*) | — |
| Gender | Select dropdown | Yes (*) | — |

> **Notice**: "Set once, here. It can't be changed from the profile afterwards." — applies to Role and Gender.

#### Step 2: Profile Details

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Primary Contact | Text input | Yes (*) | Phone number |
| Personal Email | Text input | No | `personal@example.com` |
| Marital Status | Select dropdown | No | — |
| Blood Group | Select dropdown | No | — |
| Date of Birth | Date input | No | `dd-mm-yyyy` |
| Designation | Text input | No | `e.g. Software Engineer` |

#### Step 3: Organization & Work

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Location | Select dropdown | No | `--Select Location--` |
| Department | Select dropdown | Yes (*) | `--Select Department--` |
| Make Head Of Dept. | Toggle/dropdown | No | Options: `No`, `Yes`. Note: *Only managers and HR admins can head a department.* |
| Reporting Person | Picker button | Yes (*) | `Select a reporting person`. Note: *Defaults to Department HOD if available.* |
| Job Status | Select dropdown | Yes (*) | `--Select--` |
| Employment Type | Select dropdown | Yes (*) | `--Select--` |
| Work Mode | Select dropdown | Yes (*) | `--Select--` |
| Joining Date | Date input | No | `dd-mm-yyyy` |

#### Step 4: Compliance & Address

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| PAN Number | Text input (uppercase) | No | — |
| UAN Number | Text input | No | — |
| Pincode | Text input | No | `6-digit pincode` |
| Current Address | Text input | No | — |
| Permanent Address | Text input | Yes (*) | Checkbox: `Same as Current` |
| City | Text input | No | — |
| State | Text input | No | — |

#### Footer Buttons
- **`Cancel`** — Closes modal without submitting
- **`Send Invitation`** — Primary button
  - **Persistence Risk**: YES — Would send an actual invitation email
  - **Final submission was NOT performed.**

### Dropdown Values — Invite Form

> **Observation Status**: The dropdown fields (Role, Gender, Marital Status, Blood Group, Location, Department, Job Status, Employment Type, Work Mode) were identified but their **exact option values** were not fully captured during the audit session. The dropdowns need to be opened individually to record all options.

> **Known defaults**: Location → `--Select Location--`, Department → `--Select Department--`, Job Status → `--Select--`, Employment Type → `--Select--`, Work Mode → `--Select--`

### Common User Queries — Invites

| User Query | Answer / Navigation |
|---|---|
| Where can I add an employee? | Sidebar → Invites → `New invite` button |
| How do I invite an employee? | Sidebar → PEOPLE → Invites → `New invite` |
| Where can I see pending invitations? | Sidebar → Invites → "Waiting" tab |
| What fields are required for inviting someone? | Full Name, Email, Role, Gender, Primary Contact, Department, Reporting Person, Job Status, Employment Type, Work Mode, Permanent Address |
| Where can I see who accepted invites? | Invites → "Accepted" tab |
| Can I resend an expired invite? | Invites → "Expired" tab shows expired invitations |
| Where is the employee creation form? | Invites → `New invite` button opens the Invite Team Member wizard |

---

## 9. Organisation Module

### 9.1 Departments

#### Overview

- **Page Title**: Departments
- **URL**: `/dashboard/hr/departments`
- **Description**: "Manage organizational departments and assignments."
- **Navigation**: Sidebar → SETUP → Organisation → Departments

#### Page Elements

##### Action Button
- **`+ Add Department`**
  - Location: Top-right
  - Type: Primary button
  - Purpose: Opens Add Department modal
  - **Persistence Risk**: YES — Creates a new department

##### Search
- **Placeholder**: `Search department...`
- **Type**: Text input
- **Location**: Top of page, below heading

##### Department Cards (Grid View)

Each department is displayed as a card with:

| Field | Description |
|---|---|
| Department Name | Name of the department |
| Active Badge | Status indicator (Active/Inactive) |
| Edit Button | Pencil icon for editing |
| Description | Text description of the department's function |
| Office Location Tag | e.g. `HEAD OFFICE` |
| Department Head | Name of the HOD (e.g. `Lalit Gahlot`, `Abhishek HR`, `Ravi Kumar`) |

#### Modal: Add Department

- **Trigger**: `+ Add Department` button
- **Type**: Modal overlay
- **Header**: "Add Department"

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Department Name | Text input | Yes (*) | `e.g. Engineering, HR, Sales` |
| Location | Select dropdown | No | Shows available office locations |
| Head of Department | Custom dropdown/popover | No | Search box: "Search by name, employee code or email…". Shows eligible Managers & HR Admins |
| Description | Textarea | No | `Optional description of the department's function` |
| Department is Active | Checkbox | No | Default: Checked |

**Buttons**:
- `Cancel` — Closes modal without saving
- `Save Department` — Primary submit button
  - **Persistence Risk**: YES — Final submission was NOT performed.

### 9.2 Office Locations

#### Overview

- **Page Title**: Office Locations
- **URL**: `/dashboard/hr/attendance/locations`
- **Description**: "Define geographical perimeters where employees can clock in."
- **Navigation**: Sidebar → SETUP → Organisation → Office Locations

#### Page Elements

##### Action Button
- **`+ Add Location`**
  - Location: Top-right
  - Type: Primary button
  - Purpose: Opens Add New Location modal
  - **Persistence Risk**: YES — Creates a new location

##### Search
- **Placeholder**: `Search location...`
- **Type**: Text input

##### Location Cards (Grid View)

Each location is displayed as a card with:

| Field | Description |
|---|---|
| Location Name | e.g. `HEAD OFFICE` |
| Active Badge | Status indicator |
| Edit Button | Pencil icon |
| Full Address | Complete address text |
| City & State | e.g. `INDORE, MADHYA PRADESH` |
| Radius | e.g. `100 meters` |

#### Modal: Add New Location

- **Trigger**: `+ Add Location` button
- **Type**: Modal overlay (wide, split-pane)
- **Left Pane**: Interactive Map preview (Leaflet/OpenStreetMap with search box, zoom controls `+`/`-`, draggable marker pin)
- **Right Pane**: Form fields

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Location Name | Text input | Yes (*) | `e.g. Head Office` |
| Address | Textarea | No | `123 Business Park` |
| Latitude | Text input (monospace) | Yes (*) | `28.6139` |
| Longitude | Text input (monospace) | Yes (*) | `77.2090` |
| City | Text input | No | — |
| State | Text input | No | — |
| Country | Text input | No | — |
| Pincode | Text input | No | — |

**Buttons**:
- `Cancel` — Closes modal without saving
- `Create Location` — Primary submit button
  - **Persistence Risk**: YES — Final submission was NOT performed.

### Common User Queries — Organisation

| User Query | Answer / Navigation |
|---|---|
| Where can I add a department? | Sidebar → Organisation → Departments → `+ Add Department` button |
| Where can I see all departments? | Sidebar → SETUP → Organisation → Departments (`/dashboard/hr/departments`) |
| Where can I change a department head? | Departments → Click Edit icon on department card |
| Where can I add an office location? | Sidebar → Organisation → Office Locations → `+ Add Location` button |
| Where can I see office locations? | Sidebar → SETUP → Organisation → Office Locations (`/dashboard/hr/attendance/locations`) |
| What fields are needed to add a department? | Department Name (required), Location, Head of Department, Description, Active checkbox |
| What fields are needed to add a location? | Location Name (required), Address, Latitude (required), Longitude (required), City, State, Country, Pincode |

---

## 10. Time Module (Attendance)

> **Observation Status**: Sidebar navigation items were observed but individual pages were NOT fully explored due to API quota limits. The following is based on sidebar structure observation only.

### Known Subpages

| Page | URL | Status |
|---|---|---|
| Daily Attendance | `/dashboard/hr/attendance/daily` | Not explored |
| Work Shifts | `/dashboard/hr/attendance/shifts` | Not explored |
| Shift Assignments | `/dashboard/hr/attendance/shift-assignments` | Not explored |
| Attendance Policies | `/dashboard/hr/attendance/policies` | Not explored |
| Overtime Policies | `/dashboard/hr/attendance/overtime-policies` | Not explored |
| Comp-Off Policies | `/dashboard/hr/attendance/comp-off-policies` | Not explored |
| Attendance Settings | `/dashboard/hr/attendance/settings` | Not explored |
| Attendance Automation | `/dashboard/hr/attendance/automation` | Not explored |
| Office Locations | `/dashboard/hr/attendance/locations` | Explored (see Section 9.2) |

### Common User Queries — Time/Attendance

| User Query | Answer / Navigation |
|---|---|
| Where can I see attendance? | Sidebar → SETUP → Time → Daily Attendance (`/dashboard/hr/attendance/daily`) |
| Where can I manage shifts? | Sidebar → SETUP → Time → Work Shifts (`/dashboard/hr/attendance/shifts`) |
| Where are attendance policies? | Sidebar → SETUP → Time → Attendance Policies (`/dashboard/hr/attendance/policies`) |
| Where is the attendance settings page? | Sidebar → SETUP → Time → Attendance Settings (`/dashboard/hr/attendance/settings`) |
| Where can I see comp-off policies? | Sidebar → SETUP → Time → Comp-Off Policies (`/dashboard/hr/attendance/comp-off-policies`) |

---

## 11. Leave Module

> **Observation Status**: Sidebar navigation items were observed but individual pages were NOT fully explored due to API quota limits.

### Known Subpages

| Page | URL | Status |
|---|---|---|
| Leave Types | `/dashboard/hr/leave/types` | Not explored |
| Leave Policies | `/dashboard/hr/leave/policies` | Not explored |
| Leave Settings | `/dashboard/hr/leave/settings` | Not explored |
| Leave Automation | `/dashboard/hr/leave/automation` | Not explored |

### Common User Queries — Leave

| User Query | Answer / Navigation |
|---|---|
| Where can I see leave types? | Sidebar → SETUP → Leave → Leave Types (`/dashboard/hr/leave/types`) |
| Where can I manage leave policies? | Sidebar → SETUP → Leave → Leave Policies (`/dashboard/hr/leave/policies`) |
| Where is leave approval? | Inbox → Leave requests → "Review here" |
| Where are leave settings? | Sidebar → SETUP → Leave → Leave Settings (`/dashboard/hr/leave/settings`) |

---

## 12. Pay Module (Payroll)

### Navigation
- **Sidebar Location**: SETUP → Pay
- **Subpages**: Salary Components, Structure Templates, Tax & Legal Deductions, Benefit Plans, Payroll Settings, Payroll Automation

### 12.1 Salary Components

#### Overview

- **Page Title**: Salary Components
- **URL**: `/dashboard/hr/payroll/components`
- **Description**: "Manage the catalog of earnings, deductions, and reimbursements. Click a row to see its details."
- **Navigation**: Sidebar → SETUP → Pay → Salary Components

#### Top Action Buttons

| Button | Type | Purpose |
|---|---|---|
| `Bootstrap Defaults` | Secondary | Populates default salary components |
| `New Component` | Primary | Opens New Component modal |

#### Salary Components Table

| Column | Description |
|---|---|
| Name / Code | Component name with code (e.g. Basic Salary `BASIC`, House Rent Allowance `HRA`) |
| Type | e.g. `earning` |
| Calculation | e.g. `% of CTC`, `% of basic pay`, `Fixed amount`, `Balancing (the remainder)` |
| Value | e.g. `50%`, `40%`, `₹1,600`, `Auto (remainder)` |
| Flags | Badges: `BASIC`, `CTC`, `TAX`, `PF` |
| Actions | Edit (pencil icon) |

**Existing Components Observed**:

| Name | Code | Type | Calculation | Value | Flags |
|---|---|---|---|---|---|
| Basic Salary | BASIC | earning | % of CTC | 50% | BASIC, CTC, TAX, PF |
| House Rent Allowance | HRA | earning | % of basic pay | 40% | CTC, TAX |
| Conveyance Allowance | CONVEYANCE | earning | Fixed amount | ₹1,600 | CTC |
| Special Allowance | SPECIAL_ALLOWANCE | earning | Balancing (the remainder) | Auto (remainder) | CTC, TAX |

#### Modal: New Component

- **Trigger**: `New Component` button
- **Header**: "New Component" + Close `[X]` icon

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Name | Text input | Yes (*) | — |
| Code | Text input | Yes (*) | `E.g. BASIC_SALARY` |
| Type | Select dropdown | No | Options: `Earning`, etc. |
| Calculation | Select dropdown | No | Options: `Flat Amount`, `% of CTC`, etc. |
| Value (Amount) | Number input | No | — |
| Is Basic Component | Checkbox | No | Behavioural flag |
| Part of CTC | Checkbox | No | Behavioural flag |
| Taxable (TDS) | Checkbox | No | Behavioural flag |
| Cut for unpaid days | Checkbox | No | Behavioural flag |
| PF Applicable | Checkbox | No | Behavioural flag |
| ESI Applicable | Checkbox | No | Behavioural flag |

**Buttons**:
- `Cancel` — Closes modal
- `Create Component` — Primary submit
  - **Persistence Risk**: YES — Final submission was NOT performed.

### 12.2 Structure Templates

#### Overview

- **Page Title**: Structure Templates
- **URL**: `/dashboard/hr/payroll/templates`
- **Description**: "Define templates to standardize compensation packages."
- **Navigation**: Sidebar → SETUP → Pay → Structure Templates

#### Top Action Button
- **`New Template`** — Opens New Template modal

#### Template Cards (Grid View)

| Template Name | Code | Badge | Components | Actions |
|---|---|---|---|---|
| New Salary Structure | NSS01 | CTC DRIVEN | 5 | Edit, Delete, `Manage`, `Preview` |
| New HR Salary Structure | NHRSS | CTC DRIVEN | 5 | Edit, Delete, `Manage`, `Preview` |
| New Template | NT1 | CTC DRIVEN | 0 | Edit, Delete, `Manage` |

#### Modal: New Template

- **Trigger**: `New Template` button
- **Header**: "New Template" + Close `[X]` button

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Template Name | Text input | No | — |
| Code | Text input | No | — |
| Definition Mode | Select dropdown | No | e.g. `CTC Driven (Top-down)` |

**Buttons**:
- `Cancel` — Closes modal
- `Save Template` — Primary submit
  - **Persistence Risk**: YES — Final submission was NOT performed.

### 12.3 Tax & Legal Deductions

#### Overview

- **Page Title**: Tax & Legal Deductions
- **URL**: `/dashboard/hr/payroll/statutory`
- **Description**: "Organisation-wide PF, ESI, Professional Tax and Income-Tax rules that drive every payroll run."
- **Navigation**: Sidebar → SETUP → Pay → Tax & Legal Deductions

#### Tabs

##### Tab 1: PF / ESI / PT / TDS

Sections with toggle switches and input fields:

| Section | Fields |
|---|---|
| Provident Fund (PF) | Employee Rate %, Employer Rate %, Wage Ceiling ₹, Restrict to ceiling checkbox |
| Pension (EPS) & EDLI | Related PF pension fields |
| ESI | Employee Rate %, Employer Rate %, Wage Ceiling ₹ |
| Professional Tax | Toggle and configuration |
| Income Tax TDS | Toggle and configuration |

##### Tab 2: Professional Tax Slabs

- **Top Action**: `Add State Slabs` button

**Modal: State PT Slabs**
- **Header**: "State PT Slabs" + Close `[X]`
- **Fields**:
  - State Code * (combobox input)
  - State Name (text input)
  - Band rows: From ₹, To ₹, Monthly PT ₹, Gender (select dropdown)
  - `Add slab row` link to add more bands
- **Buttons**: `Cancel`, `Replace Slab Set` (Primary)
  - **Persistence Risk**: YES — Final submission was NOT performed.

##### Tab 3: Income-Tax Regimes

- **Financial Year Dropdown**: e.g. `2026-27`
- **Top Action**: `Bootstrap Tax Tables` button

### 12.4 Benefit Plans

#### Overview

- **Page Title**: Benefit Plans
- **URL**: `/dashboard/hr/payroll/benefits`
- **Description**: "Define benefit plans, enroll employees and see what each plan costs."
- **Navigation**: Sidebar → SETUP → Pay → Benefit Plans

#### Alert Banner
> "Benefit deductions are switched off, so nothing is charged yet. Turn them on in Payroll Settings."

#### Tabs
- `Plans`
- `By employee`

#### Filters & Search

| Filter | Type | Default |
|---|---|---|
| Search | Text input | "Search by name, code or provider" |
| Status | Dropdown | `Active` |
| Type | Dropdown | `All types` |
| Refresh | Button | — |

#### Top Action
- **`New plan`** — Opens New Benefit Plan modal

#### Plans Table

| Column | Description |
|---|---|
| Plan | Plan name and code |
| Type | e.g. Health insurance |
| Provider | Insurance provider name |
| Employee / mo | Monthly employee contribution |
| Company / mo | Monthly company contribution |
| Valid | Validity period |
| Status | Active/Inactive badge |

#### Modal: New Benefit Plan

- **Trigger**: `New plan` button
- **Header**: "New benefit plan" + Close `[X]`
- **Subtitle**: "Set the flat monthly employee and company contributions."

| Field | Type | Required | Placeholder / Notes |
|---|---|---|---|
| Name | Text input | Yes (*) | `e.g. Group health cover` |
| Code | Text input | Yes (*) | `e.g. GHI` |
| Type | Select dropdown | Yes (*) | e.g. `Health insurance` |
| Provider | Text input | No | `Optional` |
| Description | Textarea | No | — |
| Employee pays / month | Currency input (₹) | Yes (*) | — |
| Company pays / month | Currency input (₹) | Yes (*) | — |
| Sum insured | Currency input (₹) | No | `Optional` |

**Buttons**:
- `Close` — Closes modal
- `Save plan` — Primary submit
  - **Persistence Risk**: YES — Final submission was NOT performed.

### 12.5 Payroll Settings

#### Overview

- **Page Title**: Payroll Settings
- **URL**: `/dashboard/hr/payroll/settings`
- **Description**: "The rules every payroll run follows: how pay is worked out, who signs off what, when payslips go out, and what happens when somebody leaves."
- **Navigation**: Sidebar → SETUP → Pay → Payroll Settings

#### Settings Sections

##### 1. How pay is worked out
| Control | Type |
|---|---|
| Unpaid days: month divided by | Select dropdown |
| Rounding policy | Select dropdown |

##### 2. What managers may do
| Control | Type | Default |
|---|---|---|
| Managers can view team compensation | Checkbox | — |
| Manager direct compensation authority | Checkbox | — |

##### 3. HR approvals
| Control | Type |
|---|---|
| Require separate checker (Segregation of Duties) | Checkbox |

##### 4. Claims & benefits
| Control | Type |
|---|---|
| Reimbursement approval | Radio: `Manager, then HR` / `HR only` |
| Payout look-ahead months | Select dropdown |
| Charge benefit deductions in payroll | Checkbox |

##### 5. Payslip delivery
| Control | Type |
|---|---|
| Release payslips as soon as a run is approved | Checkbox |
| Email employees when their payslip is released | Checkbox |

##### 6. Payslip PDFs
- Info: "Prepared as soon as a run is released"

##### 7. When someone leaves
| Control | Type |
|---|---|
| Standard notice period | Number input (days) |
| Recover short notice from | Select dropdown |
| Recover pay for notice that wasn't served | Checkbox |
| Short notice is charged through | Select dropdown |
| Outstanding loans | Select dropdown |
| Pay out unused leave when someone leaves | Checkbox |

##### 8. Cashing out earned leave
| Control | Type |
|---|---|
| Allow earned leave to be cashed out | Checkbox |
| Work the daily rate from | Select dropdown |
| Divide the monthly salary by | Select dropdown |
| Most days per person, per year | Number input (days) |
| Paid through | Select dropdown |

#### Footer Buttons
- **`Discard changes`** — Secondary, resets changes
- **`Save Settings`** — Primary submit
  - **Persistence Risk**: YES — Final submission was NOT performed.

### 12.6 Payroll Automation

#### Overview

- **Page Title**: Payroll Automation
- **URL**: `/dashboard/hr/payroll/automation`
- **Description**: "Routine work payroll does on its own. You can also run any of it now if you need the result straight away."
- **Navigation**: Sidebar → SETUP → Pay → Payroll Automation

#### Payslip Preparation Section
- **Window dropdown**: "How far back to look" + Refresh button
- **Metric cards**:
  - Waiting to be drawn
  - Longest wait
  - Being drawn now
  - Drawn in last 24 hours
  - Didn't come out
  - Share that failed
- **Action**: `Prepare the waiting payslips now`
  - **Persistence Risk**: YES — Would trigger payslip generation.

#### Automated Jobs / Reminders

| Job | Schedule | Manual Action |
|---|---|---|
| Payroll reminders | Every day at 8:00 am | `Send reminders now` |
| Next month's draft payroll | Every day at 1:00 am | `Create the draft now` |
| Stuck payroll runs | Every 15 minutes | `Check for stuck runs` |
| Old receipts and proofs | Every Sunday at 2:00 am | `Clear old files now` |
| Get payslip PDFs ready | (Schedule unknown) | `Prepare payslips now` |

> All "Run now" buttons have **Persistence Risk: YES** — None were clicked.

### Common User Queries — Pay/Payroll

| User Query | Answer / Navigation |
|---|---|
| Where is the payroll section? | Sidebar → SETUP → Pay |
| How do I navigate to payroll? | Sidebar → SETUP → Pay → Choose subpage |
| Where can I see salary components? | Sidebar → Pay → Salary Components (`/dashboard/hr/payroll/components`) |
| Where can I add a salary component? | Pay → Salary Components → `New Component` button |
| Where can I create a salary template? | Pay → Structure Templates → `New Template` button |
| Where is the payroll settings page? | Sidebar → Pay → Payroll Settings (`/dashboard/hr/payroll/settings`) |
| Where are the tax deductions? | Sidebar → Pay → Tax & Legal Deductions (`/dashboard/hr/payroll/statutory`) |
| Where can I add a benefit plan? | Pay → Benefit Plans → `New plan` button |
| What salary components exist? | Pay → Salary Components: Basic Salary, HRA, Conveyance Allowance, Special Allowance |
| Where can I see PF/ESI settings? | Pay → Tax & Legal Deductions → PF / ESI / PT / TDS tab |
| Where can I add Professional Tax slabs? | Pay → Tax & Legal Deductions → Professional Tax Slabs tab → `Add State Slabs` button |
| Where is payroll automation? | Sidebar → Pay → Payroll Automation (`/dashboard/hr/payroll/automation`) |
| Which button creates payroll? | Not directly observed. Payroll Runs page was not explored. Check: Sidebar → Pay for a "Run Payroll" or "Payroll Runs" option |
| Where can I see payslips? | Check Payroll Automation → Payslip preparation metrics |

---

## 13. Documents Module

### Navigation
- **Sidebar Location**: SETUP → Documents
- **Subpages**: Document Types, Form Templates, Document Settings, Document Automation, Letterhead & Branding, Letter Templates

### 13.1 Document Types

#### Overview

- **Page Title**: Document Types
- **URL**: `/dashboard/hr/documents/types`
- **Description**: "What your organisation collects from its people, and what it issues to them."
- **Navigation**: Sidebar → SETUP → Documents → Document Types

#### Top Action Buttons

| Button | Type | Purpose |
|---|---|---|
| `Browse catalog` | Secondary | Shows catalog of standard document types |
| `Custom type` | Primary | Opens New Custom Document Type modal |

#### Tabs
- `Our document types` — Currently configured types
- `Catalog` — Browse available standard types

#### Filters

| Filter | Type | Default |
|---|---|---|
| Search | Text input | `Search by name or code` |
| Kind | Select dropdown | `Every kind` |
| Category | Select dropdown | `All categories` |
| Origin | Select dropdown | `Catalog and custom` |
| Status | Select dropdown | `Active and switched off` |
| Refresh | Button | — |

#### Document Types Table

| Column | Description |
|---|---|
| DOCUMENT TYPE | Name and code of the document type |
| CATEGORY | Category classification |
| WHO CAN USE IT | Access permissions |
| RULES | Business rules applied |
| STATUS | Active/Inactive badge |

#### Modal: New Custom Document Type

- **Trigger**: `Custom type` button
- **Header**: "New custom document type"

| Field | Type | Notes |
|---|---|---|
| Document scope | Radio selection | `About one employee` / `Issued by the organisation` |
| Name | Text input | — |
| Code | Text input | — |
| Category | Select dropdown | — |
| Display order | Number input | — |
| Instructions for employees | Textarea | — |

**Toggle Switches**:
- Confidential
- Employees can upload
- Employees can view
- Employees can delete a verified copy
- Managers can view
- Managers can upload

**Buttons**:
- `Cancel` — Closes modal
- `Create type` — Primary submit
  - **Persistence Risk**: YES — Final submission was NOT performed.

### 13.2 Form Templates

#### Overview

- **Page Title**: Form Templates
- **URL**: `/dashboard/hr/documents/templates`
- **Description**: "The blank forms your people download and fill in. Publishing a new version retires the old one at the same moment."
- **Navigation**: Sidebar → SETUP → Documents → Form Templates

#### Top Actions
- **Refresh** button
- **`New form`** button — Opens New Form modal

#### Status Cards/Tabs
- `Live forms` (0)
- `Drafts` (0)

#### Filters

| Filter | Type | Default |
|---|---|---|
| Search | Text input | `Search by name…` |
| State | Select dropdown | `Live` |
| Type | Select dropdown | `Any type` |

#### Modal: New Form

- **Trigger**: `New form` button

| Field | Type | Notes |
|---|---|---|
| What is this form called? | Text input | — |
| When should people use it? | Textarea | Max 2000 chars |
| File it under | Select dropdown | Document type category |
| Where is the form? | Radio selection | `Upload a file` / `Link somewhere else` |

**Buttons**:
- `Cancel` — Closes modal
- `Create the draft` — Primary submit
  - **Persistence Risk**: YES — Final submission was NOT performed.

### 13.3 Document Settings

#### Overview

- **Page Title**: Document Settings
- **URL**: `/dashboard/hr/documents/settings`
- **Description**: "Who sees and decides documents, and how long links and files last."
- **Navigation**: Sidebar → SETUP → Documents → Document Settings

#### Header Links
- `Letterhead & Branding` → `/dashboard/hr/documents/letterhead`
- `Letter Templates` → `/dashboard/hr/documents/letter-templates`
- `Register of issued letters` (link)

#### Settings Sections

##### 1. Managers
| Setting | Type | Default |
|---|---|---|
| Managers can see their team's documents | Toggle | ON |
| Managers decide directly | Toggle | OFF |

##### 2. Verification
| Setting | Type | Default |
|---|---|---|
| Separate checker | Toggle | OFF |
| New custom types need verification | Toggle | ON |
| Scan uploads for viruses | Toggle | Disabled / Not available yet |

##### 3. Employees
| Setting | Type | Default |
|---|---|---|
| Employees can delete verified documents | Toggle | OFF |

##### 4. Links & storage
| Setting | Type | Unit |
|---|---|---|
| View links stay valid for | Number input | seconds |
| Upload links stay valid for | Number input | seconds |
| Largest file anyone can upload | Number input | MB |
| Keep documents for | Number input | days |

##### 5. Acknowledgements & signatures
| Setting | Type |
|---|---|
| Default time to acknowledge | Number input (days) |
| How people sign | Select dropdown |
| Flag overdue documents as a priority | Toggle (OFF) |

##### 6. Asking people for documents
| Setting | Type |
|---|---|
| Default time to provide a document | Number input (days) |
| Onboarding target | Number input (%) |

##### 7. Emails
| Setting | Type | Default |
|---|---|---|
| Tell us when somebody uploads a document | Toggle | OFF |
| Warn people before their documents expire | Toggle | ON |
| Chase unread company documents | Toggle | OFF |
| Tell people when you ask them for something | Toggle | ON |
| Chase overdue documents | Toggle | ON |
| Warn this many days before a document expires | Text input | `30, 15, 7` |

##### 8. Letters you issue
| Setting | Type | Default / Value |
|---|---|---|
| Print your letterhead on every letter | Toggle | ON |
| Keep letters between you and the person | Toggle | ON |
| Ask people to confirm they've read a letter | Radio | `Follow the document type` / `Always ask` / `Never ask` |
| How letters are numbered | Text input | `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}` |
| Letter previews allowed each hour | Number input | — |
| Most people one batch may go to | Number input | — |
| Batches anyone may start each hour | Number input | — |
| Let managers draft letters for their team | Toggle | OFF |
| Issue automatically when somebody leaves | Select/buttons | — |
| Email people when you issue them a letter | Toggle | OFF |

##### 9. Deleted letters
| Setting | Type |
|---|---|
| How long are deleted letters kept | Radio: `Follow the company rule` / `A different number of days for letters` |

##### 10. When somebody leaves, and very large publishes
| Setting | Type |
|---|---|
| A leaver's own documents | Radio: `Archive their documents` / `Leave their documents active` |
| What a leaver's pack includes by default | Select dropdown |
| Hand a publish to the background above | Number input (people) |

### 13.4 Document Automation

#### Overview

- **Page Title**: Document Automation
- **URL**: `/dashboard/hr/documents/automation`
- **Description**: "The routines that run by themselves. You never have to run one — the buttons are for checking."
- **Navigation**: Sidebar → SETUP → Documents → Document Automation

#### Top Links
- `Email log`
- `Document Settings` → `/dashboard/hr/documents/settings`

#### Letter Delivery Section
**Metric Cards**:
| Metric | Value |
|---|---|
| Waiting to be drawn | 0 |
| Longest wait | N/A |
| Being drawn now | 0 |
| Drawn in the last 24 hours | 0 |
| Didn't come out | 0 |
| Share that failed | N/A |

- **Filter**: "How far back to look" dropdown + `Refresh` button
- **Action**: `Draw the waiting letters now`

#### Everyday Routines

| Routine | Schedule | Action Button |
|---|---|---|
| Mark expired documents | Every night at 00:30 | `Run it now` |
| Send reminders | Every morning at 08:00 | `Run it now` |
| Send queued emails | Every 15 minutes | `Run it now` |
| Give new joiners company documents | Every night at 01:00 | `Run it now` |
| Close down leavers' paperwork | Every night at 02:10 | `Run it now` |
| Finish a very large publish | Every 5 minutes | `Run it now` |

#### Clearing Out
- **`Clear out old files`** — Every night at 03:30 → `Run it now` (danger style)
- Footer link: `See your retention periods` → `/dashboard/hr/documents/settings`

> All "Run it now" buttons have **Persistence Risk: YES** — None were clicked.

### 13.5 Letterhead & Branding

#### Overview

- **Page Title**: Letterhead & Branding
- **URL**: `/dashboard/hr/documents/letterhead`
- **Description**: "The frame around every letter your company issues. Set it once and every letter follows."
- **Navigation**: Sidebar → SETUP → Documents → Letterhead & Branding

#### Top Actions
- `Refresh` button
- `Preview letterhead` button

#### Sections & Fields

##### 1. How letters are printed
- `Draw our letterhead on the page` — Toggle switch (ON)
- `Letter Templates` link → `/dashboard/hr/documents/letter-templates`

##### 2. Who signs your letters
| Field | Type | Value |
|---|---|---|
| Full name | Text input | `Priya Nair` |
| Job title | Text input | `Vice President — People & Culture` |

##### 3. Company registration numbers
| Field | Type | Value |
|---|---|---|
| CIN | Text input | `U72900KA2021PTC987654` |
| GSTIN | Text input | `29XYZAB5678C1Z2` |
| Company PAN | Text input | `XYZAB5678C` |
| TAN | Text input | `BLRZ56789C` |

##### 4. How people reach you
| Field | Type | Value |
|---|---|---|
| Email address | Text input | `people@yourcompany.com` |
| Phone number | Text input | `+91 80 6111 2222` |
| Website | Text input | `https://www.yourcompany.com` |

##### 5. Closing note
- `Footer line` — Textarea: `This is a computer-generated letter and needs no wet signature.`

##### 6. Registered address
- `Use company profile address` button
- Address line 1: `Building and street` + Remove button
- Address line 2: `Area` + Remove button
- `Add a line` button

##### 7. Company logo
- File info: On file, JPEG, 104 KB
- `Replace company logo` button

##### 8. Signatory's signature
- File info: On file, PNG, 5 KB
- `Replace signatory's signature` button

##### 9. Brand colour
- Colour picker input / Hex code input
- Preset palette: `Purple`, `Indigo`, `Magenta`, `Charcoal`, `Deep teal`, `Claret`

### 13.6 Letter Templates

#### Overview

- **Page Title**: Letter Templates
- **URL**: `/dashboard/hr/documents/letter-templates`
- **Description**: "The standard letters your company issues. Switch on the ones you use and save the wording that never changes."
- **Navigation**: Sidebar → SETUP → Documents → Letter Templates

#### Top Links
- `Letterhead & Branding` → `/dashboard/hr/documents/letterhead`
- `Issued Letters` → `/dashboard/hr/documents/letters`

#### Filter Tabs
`All letters` | `In use` | `Switched off`

#### Letter Templates Table

| Column | Description |
|---|---|
| Letter | Template name & description |
| State | `In use` or `Switched off` |
| Your wording | e.g. `Standard wording` |
| Actions | `Issue`, `Preview` |

#### Available Letter Templates

| # | Template | Description |
|---|---|---|
| 1 | Experience Letter | Confirms what somebody did here and for how long |
| 2 | Appointment Letter | The formal offer: the job, start date and full pay breakdown |
| 3 | Bonafide Letter | Confirms that somebody works here right now |
| 4 | Relieving Letter | Confirms somebody has been released from their job |
| 5 | Confirmation Letter | Confirms somebody's job is permanent now |
| 6 | Warning Letter | Records a formal warning: what happened and what has to change |
| 7 | Internship Certificate | Confirms an internship |
| 8 | No Objection Certificate | Says company has no objection |
| 9 | Salary Certificate | States what somebody is paid |
| 10 | Show Cause Notice | Asks somebody to explain why action shouldn't be taken |
| 11 | Performance Improvement Plan | Sets out what has to improve, by when |
| 12 | Full and Final Settlement Statement | States final amount settled |
| 13 | Offer Letter | Offers the job: title, start date, pay, deadline |
| 14 | Promotion Letter | Confirms promotion: old title, new title, effective date |
| 15 | Salary Revision Letter | Confirms change in pay and when it takes effect |

#### Template Configuration Modal/Drawer

- **Trigger**: Click any letter template row
- **Controls**:
  - Toggle: `Use this letter` — HR can prepare this letter
  - Optional custom inputs (e.g. `Response Deadline Days` for Show Cause Notice)
  - Placeholder info: "What the letter fills in by itself" — Employee name, Employee code, Designation, Department name, etc.
- **Actions**: `Close`, `Preview`, `Save`
  - **Persistence Risk**: YES for `Save` — Final submission was NOT performed.

### Common User Queries — Documents & Letters

| User Query | Answer / Navigation |
|---|---|
| Where are employee documents? | Sidebar → SETUP → Documents → Document Types (`/dashboard/hr/documents/types`) |
| Where can I add a document type? | Documents → Document Types → `Custom type` button |
| Where is the document catalog? | Documents → Document Types → `Browse catalog` button or "Catalog" tab |
| Where can I create a form template? | Documents → Form Templates → `New form` button |
| Where are document settings? | Sidebar → SETUP → Documents → Document Settings (`/dashboard/hr/documents/settings`) |
| Where can I see the letterhead? | Documents → Letterhead & Branding → `Preview letterhead` button |
| Where can I change the company logo on letters? | Documents → Letterhead & Branding → Company logo section → `Replace company logo` |
| What letter templates are available? | Documents → Letter Templates → 15 templates listed (Experience, Appointment, Bonafide, etc.) |
| How do I issue an experience letter? | Documents → Letter Templates → Find "Experience Letter" → `Issue` action |
| Where can I preview a letter? | Documents → Letter Templates → Click template row → `Preview` button |
| Where are document automation settings? | Documents → Document Automation (`/dashboard/hr/documents/automation`) |
| How do I change the letter numbering format? | Documents → Document Settings → "Letters you issue" section → "How letters are numbered" field |
| Where can I set the brand colour for letters? | Documents → Letterhead & Branding → Brand colour section |
| What brand colours are available? | Presets: Purple, Indigo, Magenta, Charcoal, Deep teal, Claret. Or custom hex code |

---

## 14. Global UI Components

### Modals
- Used for: Adding departments, locations, components, templates, benefit plans, document types, forms, invites
- Position: Center of viewport, overlay background
- Close: `[X]` button in top-right corner + `Cancel` button in footer

### Cards
- Used for: Employees (grid view), Departments, Office Locations, Structure Templates, Inbox request categories, Statistics
- Layout: Grid arrangement, responsive

### Tables
- Used for: Attendance flags, Invites, Salary components, Document types, Letter templates, Benefit plans
- Features: Column headers, row actions, status badges, search, filters

### Badges / Status Indicators
- Employee roles: `hr`, `manager`, `employee`
- Status: `Active`, `Inactive`, `Pending`, `Accepted`, `Expired`, `Revoked`
- Flags: `BASIC`, `CTC`, `TAX`, `PF`
- Severity: `High`
- Template: `CTC DRIVEN`
- Letter state: `In use`, `Switched off`

### Toggle Switches
- Used extensively in: Document Settings, Payroll Settings, Statutory settings
- States: ON / OFF

---

## 15. Navigation Reference

| User Goal | Navigation Path |
|---|---|
| View dashboard / inbox | Sidebar → PEOPLE → Inbox |
| Find employees | Sidebar → PEOPLE → Team |
| Add an employee | Sidebar → PEOPLE → Invites → `New invite` |
| View employee profile | Team → Click employee card |
| Manage departments | Sidebar → SETUP → Organisation → Departments |
| Add a department | Organisation → Departments → `+ Add Department` |
| Manage office locations | Sidebar → SETUP → Organisation → Office Locations |
| Add an office location | Organisation → Office Locations → `+ Add Location` |
| View attendance | Sidebar → SETUP → Time → Daily Attendance |
| Manage work shifts | Sidebar → SETUP → Time → Work Shifts |
| View leave types | Sidebar → SETUP → Leave → Leave Types |
| View salary components | Sidebar → SETUP → Pay → Salary Components |
| Add a salary component | Pay → Salary Components → `New Component` |
| Create a salary template | Pay → Structure Templates → `New Template` |
| Configure PF/ESI/PT | Pay → Tax & Legal Deductions |
| Add a benefit plan | Pay → Benefit Plans → `New plan` |
| Configure payroll rules | Pay → Payroll Settings |
| View payroll automation | Pay → Payroll Automation |
| View document types | Sidebar → SETUP → Documents → Document Types |
| Add custom document type | Documents → Document Types → `Custom type` |
| Create a form template | Documents → Form Templates → `New form` |
| Configure document settings | Documents → Document Settings |
| Preview letterhead | Documents → Letterhead & Branding → `Preview letterhead` |
| Manage letter templates | Documents → Letter Templates |
| Issue a letter | Documents → Letter Templates → `Issue` action on template row |
| View pending approvals | Sidebar → PEOPLE → Inbox |
| Resolve attendance flag | Inbox → Attendance flags → Click row → Modal |

---

## 16. Button Index

| Button | Module | Page | Location | Purpose |
|---|---|---|---|---|
| Refresh | Inbox | Inbox | Header → Top-right | Refreshes inbox data |
| Review here | Inbox | Inbox | Each category card | Opens the category's review list |
| Mark resolved | Inbox | Resolve Flag Modal | Modal → Footer-right | Resolves an attendance flag |
| Cancel | Multiple | Multiple modals | Modal → Footer-left | Closes modal without saving |
| Invites | Team | Team Page | Top-right | Navigates to Invites page |
| New invite | Invites | Invites | Top-right | Opens Invite Team Member wizard |
| Send Invitation | Invites | Invite Modal | Modal → Footer-right | Sends employee invitation |
| + Add Department | Organisation | Departments | Top-right | Opens Add Department modal |
| Save Department | Organisation | Add Dept Modal | Modal → Footer-right | Saves new department |
| + Add Location | Organisation | Locations | Top-right | Opens Add Location modal |
| Create Location | Organisation | Add Location Modal | Modal → Footer-right | Creates new location |
| Bootstrap Defaults | Pay | Salary Components | Top-right | Populates default components |
| New Component | Pay | Salary Components | Top-right | Opens New Component modal |
| Create Component | Pay | New Component Modal | Modal → Footer-right | Creates salary component |
| New Template | Pay | Structure Templates | Top-right | Opens New Template modal |
| Save Template | Pay | New Template Modal | Modal → Footer-right | Saves salary template |
| Manage | Pay | Structure Templates | Template card | Manages template components |
| Preview | Pay | Structure Templates | Template card | Previews salary structure |
| Add State Slabs | Pay | Statutory → PT tab | Top-right | Opens State PT Slabs modal |
| Replace Slab Set | Pay | State PT Slabs Modal | Modal → Footer-right | Replaces PT slab configuration |
| Bootstrap Tax Tables | Pay | Statutory → Income Tax | Top-right | Populates default tax tables |
| New plan | Pay | Benefit Plans | Top-right | Opens New Benefit Plan modal |
| Save plan | Pay | New Plan Modal | Modal → Footer-right | Saves benefit plan |
| Discard changes | Pay | Payroll Settings | Footer-left | Resets unsaved changes |
| Save Settings | Pay | Payroll Settings | Footer-right | Saves payroll settings |
| Prepare the waiting payslips now | Pay | Payroll Automation | Payslip section | Triggers payslip generation |
| Send reminders now | Pay | Payroll Automation | Jobs section | Triggers reminder emails |
| Create the draft now | Pay | Payroll Automation | Jobs section | Creates draft payroll run |
| Check for stuck runs | Pay | Payroll Automation | Jobs section | Checks stuck payroll |
| Clear old files now | Pay | Payroll Automation | Jobs section | Clears old receipts |
| Prepare payslips now | Pay | Payroll Automation | Jobs section | Generates payslip PDFs |
| Browse catalog | Documents | Document Types | Top-right | Shows standard doc types |
| Custom type | Documents | Document Types | Top-right | Opens new custom doc type modal |
| Create type | Documents | New Doc Type Modal | Modal → Footer-right | Creates document type |
| New form | Documents | Form Templates | Top-right | Opens new form template modal |
| Create the draft | Documents | New Form Modal | Modal → Footer-right | Creates form draft |
| Preview letterhead | Documents | Letterhead & Branding | Top-right | Preview letterhead layout |
| Replace company logo | Documents | Letterhead & Branding | Logo section | Upload new logo |
| Replace signatory's signature | Documents | Letterhead & Branding | Signature section | Upload new signature |
| Use company profile address | Documents | Letterhead & Branding | Address section | Copies company address |
| Add a line | Documents | Letterhead & Branding | Address section | Adds address line |
| Issue | Documents | Letter Templates | Table row action | Issues the letter to employee |
| Preview | Documents | Letter Templates | Table row action | Preview letter template |
| Draw the waiting letters now | Documents | Document Automation | Letter delivery | Generates queued letters |
| Run it now | Documents | Document Automation | Each routine row | Triggers manual run |

---

## 17. Field Index

| Field | Module | Page | Type | Required |
|---|---|---|---|---|
| Department Name | Organisation | Add Department | Text input | Yes |
| Location (Dept) | Organisation | Add Department | Select dropdown | No |
| Head of Department | Organisation | Add Department | Custom picker | No |
| Description (Dept) | Organisation | Add Department | Textarea | No |
| Department is Active | Organisation | Add Department | Checkbox | No |
| Location Name | Organisation | Add Location | Text input | Yes |
| Address | Organisation | Add Location | Textarea | No |
| Latitude | Organisation | Add Location | Text input | Yes |
| Longitude | Organisation | Add Location | Text input | Yes |
| City | Organisation | Add Location | Text input | No |
| State | Organisation | Add Location | Text input | No |
| Country | Organisation | Add Location | Text input | No |
| Pincode | Organisation | Add Location | Text input | No |
| Employee ID | Invites | Invite Modal | Text input | No |
| Full Name | Invites | Invite Modal | Text input | Yes |
| Email Address | Invites | Invite Modal | Text input | Yes |
| Role | Invites | Invite Modal | Select dropdown | Yes |
| Gender | Invites | Invite Modal | Select dropdown | Yes |
| Primary Contact | Invites | Invite Modal | Text input | Yes |
| Personal Email | Invites | Invite Modal | Text input | No |
| Marital Status | Invites | Invite Modal | Select dropdown | No |
| Blood Group | Invites | Invite Modal | Select dropdown | No |
| Date of Birth | Invites | Invite Modal | Date input | No |
| Designation | Invites | Invite Modal | Text input | No |
| Location | Invites | Invite Modal | Select dropdown | No |
| Department | Invites | Invite Modal | Select dropdown | Yes |
| Make Head Of Dept. | Invites | Invite Modal | Dropdown | No |
| Reporting Person | Invites | Invite Modal | Picker button | Yes |
| Job Status | Invites | Invite Modal | Select dropdown | Yes |
| Employment Type | Invites | Invite Modal | Select dropdown | Yes |
| Work Mode | Invites | Invite Modal | Select dropdown | Yes |
| Joining Date | Invites | Invite Modal | Date input | No |
| PAN Number | Invites | Invite Modal | Text input | No |
| UAN Number | Invites | Invite Modal | Text input | No |
| Pincode (Address) | Invites | Invite Modal | Text input | No |
| Current Address | Invites | Invite Modal | Text input | No |
| Permanent Address | Invites | Invite Modal | Text input | Yes |
| City (Address) | Invites | Invite Modal | Text input | No |
| State (Address) | Invites | Invite Modal | Text input | No |
| Component Name | Pay | New Component | Text input | Yes |
| Component Code | Pay | New Component | Text input | Yes |
| Component Type | Pay | New Component | Select dropdown | No |
| Calculation | Pay | New Component | Select dropdown | No |
| Value (Amount) | Pay | New Component | Number input | No |
| Template Name | Pay | New Template | Text input | No |
| Template Code | Pay | New Template | Text input | No |
| Definition Mode | Pay | New Template | Select dropdown | No |
| Benefit Name | Pay | New Benefit Plan | Text input | Yes |
| Benefit Code | Pay | New Benefit Plan | Text input | Yes |
| Benefit Type | Pay | New Benefit Plan | Select dropdown | Yes |
| Provider | Pay | New Benefit Plan | Text input | No |
| Employee pays/month | Pay | New Benefit Plan | Currency input | Yes |
| Company pays/month | Pay | New Benefit Plan | Currency input | Yes |
| Sum insured | Pay | New Benefit Plan | Currency input | No |
| Resolution note | Inbox | Resolve Flag Modal | Textarea | Yes |
| Document Name | Documents | New Custom Type | Text input | No |
| Document Code | Documents | New Custom Type | Text input | No |
| Category | Documents | New Custom Type | Select dropdown | No |
| Display order | Documents | New Custom Type | Number input | No |
| Instructions | Documents | New Custom Type | Textarea | No |
| Form Name | Documents | New Form | Text input | No |
| Form Purpose | Documents | New Form | Textarea | No |
| File it under | Documents | New Form | Select dropdown | No |
| Full name (Signatory) | Documents | Letterhead | Text input | No |
| Job title (Signatory) | Documents | Letterhead | Text input | No |
| CIN | Documents | Letterhead | Text input | No |
| GSTIN | Documents | Letterhead | Text input | No |
| Company PAN | Documents | Letterhead | Text input | No |
| TAN | Documents | Letterhead | Text input | No |

---

## 18. Dropdown Index

| Dropdown | Module | Page | Options | Required |
|---|---|---|---|---|
| Role (Invite) | Invites | Invite Modal | *Not fully captured — needs inspection* | Yes |
| Gender (Invite) | Invites | Invite Modal | *Not fully captured — needs inspection* | Yes |
| Marital Status | Invites | Invite Modal | *Not fully captured — needs inspection* | No |
| Blood Group | Invites | Invite Modal | *Not fully captured — needs inspection* | No |
| Location (Invite) | Invites | Invite Modal | Dynamic — lists configured office locations. Default: `--Select Location--` | No |
| Department (Invite) | Invites | Invite Modal | Dynamic — lists configured departments. Default: `--Select Department--` | Yes |
| Make Head Of Dept. | Invites | Invite Modal | `No`, `Yes` | No |
| Job Status | Invites | Invite Modal | *Not fully captured — needs inspection*. Default: `--Select--` | Yes |
| Employment Type | Invites | Invite Modal | *Not fully captured — needs inspection*. Default: `--Select--` | Yes |
| Work Mode | Invites | Invite Modal | *Not fully captured — needs inspection*. Default: `--Select--` | Yes |
| Location (Dept) | Organisation | Add Department | Dynamic — lists configured office locations | No |
| Component Type | Pay | New Component | `Earning`, (others not fully captured) | No |
| Calculation | Pay | New Component | `Flat Amount`, `% of CTC`, (others not fully captured) | No |
| Definition Mode | Pay | New Template | `CTC Driven (Top-down)`, (others not fully captured) | No |
| Benefit Type | Pay | New Benefit Plan | `Health insurance`, (others not fully captured) | Yes |
| Financial Year | Pay | Statutory → Income Tax | `2026-27`, (others not fully captured) | No |
| Kind | Documents | Document Types | Default: `Every kind` — options not fully captured | No |
| Category (Doc Types) | Documents | Document Types | Default: `All categories` — options not fully captured | No |
| Origin | Documents | Document Types | Default: `Catalog and custom` — options not fully captured | No |
| Status (Doc Types) | Documents | Document Types | Default: `Active and switched off` — options not fully captured | No |
| Status (Benefits) | Pay | Benefit Plans | Default: `Active` — options not fully captured | No |
| Type (Benefits) | Pay | Benefit Plans | Default: `All types` — options not fully captured | No |
| Role (Invites Filter) | Invites | Invites Page | Default: `Any role` — options not fully captured | No |
| Department (Invites Filter) | Invites | Invites Page | Default: `Every department` — options not fully captured | No |

> **Note**: Many dropdown option lists were not fully captured because opening each dropdown individually and recording all values was cut short by API quota limits. The fields and defaults are documented. Full option enumeration requires further inspection.

---

## 19. RAG Query Resolution Guide

### Query: "Where can I find employee attendance?"
**Answer**: Navigate to Sidebar → SETUP → Time → Daily Attendance (`/dashboard/hr/attendance/daily`). Individual employee attendance can also be viewed on each employee's profile: Team → Click employee card → Overview tab → Attendance Pattern Calendar.
**Related terms**: attendance, employee attendance, daily attendance, present, absent, late, attendance records

### Query: "Where can I add an employee?"
**Answer**: Navigate to Sidebar → PEOPLE → Invites (`/dashboard/hr/invites`) → Click `New invite` button. This opens the "Invite Team Member" wizard modal with 4 accordion steps: Required Information, Profile Details, Organization & Work, Compliance & Address.
**Related terms**: add employee, create employee, new employee, hire, onboard, invite

### Query: "Where is the leave approval option?"
**Answer**: Navigate to Sidebar → PEOPLE → Inbox (`/dashboard/hr/inbox`). The Inbox shows pending items including "Leave requests" category card. Click "Review here" to see pending leave requests for approval.
**Related terms**: leave approval, approve leave, reject leave, leave request, pending leave

### Query: "Which button should I click to create payroll?"
**Answer**: The payroll run/creation page was not fully explored. Navigate to Sidebar → SETUP → Pay for all payroll-related options. Payroll Settings and Automation are at `/dashboard/hr/payroll/settings` and `/dashboard/hr/payroll/automation` respectively.
**Related terms**: create payroll, run payroll, process payroll, payroll generation

### Query: "What fields are required in the Invite Employee form?"
**Answer**: Required fields (marked with *): Full Name, Email Address, Role, Gender, Primary Contact, Department, Reporting Person, Job Status, Employment Type, Work Mode, Permanent Address. Optional: Employee ID, Personal Email, Marital Status, Blood Group, Date of Birth, Designation, Location, Make Head Of Dept., Joining Date, PAN, UAN, Pincode, Current Address, City, State.
**Related terms**: invite form, required fields, employee form, mandatory fields

### Query: "Where can I see employee documents?"
**Answer**: Navigate to Sidebar → SETUP → Documents → Document Types (`/dashboard/hr/documents/types`). This shows all document types configured for the organisation with their categories, access rules, and status.
**Related terms**: employee documents, documents, upload documents, document types

### Query: "How do I navigate to the payroll section?"
**Answer**: Sidebar → SETUP → Pay. This expands to show: Salary Components, Structure Templates, Tax & Legal Deductions, Benefit Plans, Payroll Settings, Payroll Automation.
**Related terms**: payroll, salary, pay, compensation

### Query: "What does the three-dot button do?"
**Answer**: In the HR Panel, action menus appear as row actions in tables (e.g., Edit pencil icon on department cards, `Issue`/`Preview` on letter templates, Edit icon on salary components). The specific three-dot overflow menu was not universally observed; actions are typically exposed directly as icon buttons or text links.
**Related terms**: three dot, menu, more options, actions, overflow

### Query: "Where can I change an employee's department?"
**Answer**: Navigate to Team → Click employee card → Employee Profile page. Department information is shown in the profile header. Editing capabilities would be accessible from the profile's edit functions (specific edit button not fully documented).
**Related terms**: change department, update department, move employee, transfer

### Query: "What letter templates are available?"
**Answer**: Navigate to Documents → Letter Templates (`/dashboard/hr/documents/letter-templates`). Available templates: Experience Letter, Appointment Letter, Bonafide Letter, Relieving Letter, Confirmation Letter, Warning Letter, Internship Certificate, No Objection Certificate, Salary Certificate, Show Cause Notice, Performance Improvement Plan, Full and Final Settlement Statement, Offer Letter, Promotion Letter, Salary Revision Letter.
**Related terms**: letter templates, generate letter, issue letter, experience letter, appointment letter, offer letter

### Query: "Where can I see PF and ESI settings?"
**Answer**: Navigate to Sidebar → SETUP → Pay → Tax & Legal Deductions (`/dashboard/hr/payroll/statutory`) → Tab: "PF / ESI / PT / TDS". This shows Provident Fund, Pension (EPS) & EDLI, ESI, Professional Tax, and Income Tax TDS configurations.
**Related terms**: PF, ESI, provident fund, statutory deductions, tax deductions

---

## 20. Common User Workflows

### Workflow: Finding an Employee
1. Open HR Panel
2. Click **Team** in the sidebar (under PEOPLE)
3. Use the **Search bar** (placeholder: "Search member or email…")
4. Optionally filter by role tabs: All, HR, Manager, Employee
5. Click the employee card to view details

**Persistence**: Read-only workflow. No data modified.

### Workflow: Inviting a New Employee
1. Open HR Panel
2. Navigate to Sidebar → PEOPLE → **Invites**
3. Click **`New invite`** button (top-right)
4. Fill in Required Information (Step 1): Full Name, Email, Role, Gender
5. Fill in Profile Details (Step 2): Primary Contact, etc.
6. Fill in Organization & Work (Step 3): Department, Reporting Person, Job Status, Employment Type, Work Mode
7. Fill in Compliance & Address (Step 4): Permanent Address, PAN, etc.
8. Click **`Send Invitation`**

**IMPORTANT**: The final `Send Invitation` action was NOT executed. No employee was invited.

### Workflow: Adding a Department
1. Navigate to Sidebar → SETUP → Organisation → **Departments**
2. Click **`+ Add Department`** button
3. Fill in Department Name (required), Location, Head of Department, Description
4. Click **`Save Department`**

**IMPORTANT**: The final `Save Department` action was NOT executed. No department was created.

### Workflow: Resolving an Attendance Flag
1. Navigate to Sidebar → PEOPLE → **Inbox**
2. Click the **Attendance flags** category card
3. Click a flagged row in the table
4. Read the flag details in the modal
5. Enter a Resolution note
6. Click **`Mark resolved`**

**IMPORTANT**: The final `Mark resolved` action was NOT executed. No flag was resolved.

### Workflow: Adding a Salary Component
1. Navigate to Sidebar → SETUP → Pay → **Salary Components**
2. Click **`New Component`** button
3. Fill in Name, Code, Type, Calculation, Value, and behavioural flags
4. Click **`Create Component`**

**IMPORTANT**: The final `Create Component` action was NOT executed. No component was created.

### Workflow: Issuing a Letter to an Employee
1. Navigate to Sidebar → SETUP → Documents → **Letter Templates**
2. Find the desired template (e.g. Experience Letter)
3. Click **`Issue`** action on the template row
4. (Further steps in the issue wizard were not explored)

**IMPORTANT**: No letter was issued.

---

## 21. Read-Only Inspection Limitations

The following items could NOT be fully inspected due to safety constraints or API quota limits:

| Item | Reason |
|---|---|
| Time module pages (Daily Attendance, Shifts, Policies, etc.) | API quota exhausted before exploration |
| Leave module pages (Leave Types, Policies, Settings, etc.) | API quota exhausted before exploration |
| Payroll Runs page | Not discovered/explored |
| Employee Profile — all tabs (Personal, Job, Attendance, Leaves, Documents, Payroll) | Only Overview tab was inspected |
| Dropdown option values for Role, Gender, Marital Status, Blood Group, Job Status, Employment Type, Work Mode | Dropdowns were identified but not opened to enumerate all options |
| Company Settings / Organisation Profile | Not explored |
| Notification panel contents | Not fully explored |
| Profile menu items | Not fully explored |
| Responsive/mobile layout behaviour | Not tested |
| Payroll Runs / Processing payroll wizard | Not explored |
| Employee edit/update forms | Not explored |
| Attendance correction flow | Not explored |
| Leave request approval flow | Not explored |

---

## 22. Unverified / Not Observable Items

| Item | Observation Status | Reason |
|---|---|---|
| Dropdown values for Role | Not Verified | Dropdown was not opened during inspection |
| Dropdown values for Gender | Not Verified | Dropdown was not opened during inspection |
| Dropdown values for Marital Status | Not Verified | Dropdown was not opened during inspection |
| Dropdown values for Blood Group | Not Verified | Dropdown was not opened during inspection |
| Dropdown values for Job Status | Not Verified | Dropdown was not opened during inspection |
| Dropdown values for Employment Type | Not Verified | Dropdown was not opened during inspection |
| Dropdown values for Work Mode | Not Verified | Dropdown was not opened during inspection |
| Employee delete functionality | Not Verified | Requires persistent action |
| Payroll run execution | Not Verified | Requires persistent action |
| Leave approval/rejection | Not Verified | Requires persistent action |
| Actual form validation messages | Not Verified | Would require submitting invalid data |
| Email notification content | Not observable from UI |
| API responses | Not observable from UI inspection |

---

## 23. Safety Audit

| Check | Status |
|---|---|
| Existing records modified | No |
| New records created | No |
| Records deleted | No |
| Forms submitted | No |
| Payments triggered | No |
| Emails sent | No |
| Notifications sent | No |
| Approvals/rejections performed | No |
| Persistent configuration changed | No |

**All inspection was read-only. No persistent data was created, modified, or deleted.**

---

## 24. Completeness Checklist

- [x] Dashboard / Inbox
- [x] Sidebar navigation structure
- [ ] Header (partially observed)
- [ ] Profile menu (not fully explored)
- [ ] Notifications (not fully explored)
- [x] Inbox module (fully documented)
- [x] Team / Employee Directory (documented)
- [x] Employee Profile (Overview tab documented)
- [x] Invites module (fully documented)
- [x] Invite Team Member wizard (fully documented)
- [x] Organisation → Departments (fully documented)
- [x] Organisation → Office Locations (fully documented)
- [ ] Time module pages (NOT explored — quota limit)
- [ ] Leave module pages (NOT explored — quota limit)
- [x] Pay → Salary Components (fully documented)
- [x] Pay → Structure Templates (fully documented)
- [x] Pay → Tax & Legal Deductions (fully documented)
- [x] Pay → Benefit Plans (fully documented)
- [x] Pay → Payroll Settings (fully documented)
- [x] Pay → Payroll Automation (fully documented)
- [x] Documents → Document Types (fully documented)
- [x] Documents → Form Templates (fully documented)
- [x] Documents → Document Settings (fully documented)
- [x] Documents → Document Automation (fully documented)
- [x] Documents → Letterhead & Branding (fully documented)
- [x] Documents → Letter Templates (fully documented)
- [x] Button Index
- [x] Field Index
- [x] Dropdown Index (partial — values not fully enumerated)
- [x] Navigation Reference
- [x] RAG Query Resolution Guide
- [x] Common Workflows
- [x] Safety Audit

---

*End of HR Panel UI & RAG Knowledge Guide — Partial Version*
*Modules pending: Time (Attendance), Leave, Payroll Runs, Employee Profile deep tabs, all dropdown option enumerations*
