# HrClouds HRMS — HR User Onboarding & Setup Workflow Guide

**Document Version:** 2.1  
**Target Audience:** HR Administrators, People Operations & System Admins  
**Platform URL:** `https://frontend.dev.hrclouds.in`  
**Purpose:** Streamlined, step-by-step navigation and execution guide for HR administrators setting up the organization, configuring attendance rules, creating shifts, inviting employees, and provisioning leave quotas.

---

## Master Setup Order Flowchart

Follow this sequential workflow strictly. Each step provides the foundational data required by the next step:

```
+--------------------------------------------------------------------------+
| PHASE 1: ORGANISATION FOUNDATION                                         |
|   Step 1A: Create Office Location    -> /dashboard/hr/attendance/locations|
|   Step 1B: Create Departments        -> /dashboard/hr/departments         |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| PHASE 2: TIME & ATTENDANCE RULES (Complete BEFORE inviting users)        |
|   Step 2A: Create Attendance Policy  -> /dashboard/hr/attendance/policies |
|   Step 2B: Create Work Shifts        -> /dashboard/hr/attendance/shifts   |
|   Step 2C: Setup Holidays            -> /dashboard/hr/attendance/holidays |
|   Step 2D: Setup Weekly Offs         -> /dashboard/hr/attendance/weekly-offs
|   Step 2E: Setup Earned Leave Rules  -> /dashboard/hr/attendance/comp-off-policies
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| PHASE 3: PEOPLE ONBOARDING & INVITES                                     |
|   Step 3A: Send Employee Invites     -> /dashboard/hr/invites             |
|   Step 3B: Employee Accepts Invite & Sets Password via Email (48 hours)  |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
| PHASE 4: POST-JOIN SETUP (After employee accepts invitation)             |
|   Step 4A: Assign Work Shift         -> /dashboard/hr/attendance/shift-assignments
|   Step 4B: Create Leave Types        -> /dashboard/hr/leaves/types        |
|   Step 4C: Create Leave Policies     -> /dashboard/hr/leaves/policies     |
|   Step 4D: Assign Leave Policy       -> /dashboard/hr/leaves/policies     |
+--------------------------------------------------------------------------+
```

---

### Core Sequential Rules

> **1. Locations before Departments:** Departments must be bound to a physical office location.  
> **2. Policies & Shifts before Invites:** Attendance rules, working hours, and holiday calendars must exist before employees clock in on Day 1.  
> **3. Invites before Shift & Leave Assignments:** You cannot assign shifts or leave quotas to an employee until their user account exists in the system.

---

## PHASE 1: Organisation Foundation

Set up your physical workplace and departments.

### Step 1A: Create Office Locations

* **Sidebar Path:** `SETUP` > `Organisation` > `Office Locations`
* **Direct URL:** `/dashboard/hr/attendance/locations`
* **Goal:** Register your office building and set up GPS geofencing boundaries for mobile attendance.

**Execution Steps:**
1. Navigate to **Office Locations** (`/dashboard/hr/attendance/locations`).
2. Click the **`+ Add Location`** button at the top-right.
3. Fill in the location details: Name, Code, Timezone, and full street Address.
4. On the map pane, click to position your GPS marker pin (or enter Latitude and Longitude).
5. Set the **Geofence Radius** (recommended: `150` meters).
6. Fill in City, State, Country, and Pincode.
7. Click **`Create Location`**.

```yaml
# Example Data:
Location Name: Indore Head Office
Location Code: IND-HO
Time Zone: Asia/Kolkata (IST +05:30)
Address: Plot No. 42, Scheme 54, PU-4 Commercial Complex, Vijay Nagar
Latitude: 22.7533
Longitude: 75.8937
Geofence Radius: 150 meters
City: Indore, State: Madhya Pradesh, Pincode: 452010
```

---

### Step 1B: Create Departments

* **Sidebar Path:** `SETUP` > `Organisation` > `Departments`
* **Direct URL:** `/dashboard/hr/departments`
* **Goal:** Create organizational units (Engineering, HR, Sales) and connect them to your office location.

**Execution Steps:**
1. Navigate to **Departments** (`/dashboard/hr/departments`).
2. Click the **`+ Add Department`** button at the top-right.
3. Enter the **Department Name** and a short **Department Code**.
4. Select the **Location** from the dropdown (choose the office created in Step 1A).
5. *(Optional)* Select a **Head of Department** (can be left blank during initial setup).
6. Enter a brief Description and make sure **Department is Active** is checked.
7. Click **`Save Department`**.
8. Repeat for all company departments (e.g., *IT*, *HR*, *Finance*, *Sales*).

```yaml
# Example Data:
Department Name: Information Technology
Department Code: IT
Location: Indore Head Office
Head of Department: Unassigned (Set after staff join)
Description: Software engineering, cloud infrastructure, and technical support.
Department is Active: Yes
```

---

## PHASE 2: Time & Attendance Master Flow

Configure working hours, holiday schedules, and attendance rules **before inviting any employees**.

### Step 2A: Create Attendance Policies

* **Sidebar Path:** `SETUP` > `Time` > `Attendance Policies`
* **Direct URL:** `/dashboard/hr/attendance/policies`
* **Goal:** Configure allowed clock-in methods, arrival grace time, and late arrival penalties.

**Execution Steps:**
1. Navigate to **Attendance Policies** (`/dashboard/hr/attendance/policies`).
2. Click **`Create Policy`** (or `+ Add Policy`) at the top-right.
3. Enter the **Policy Name** and set **Priority** to `1`.
4. Choose **Punch Mode** as `Web & Mobile`.
5. Enable **Allow Web Punch**, **Allow Mobile Punch**, and **Require Location / Geofence**.
6. Set **Late Arrival Grace Period** (e.g., `15` minutes).
7. Select **Late Mark Action** (e.g., `Flag Late & Alert Manager`).
8. Enable **Earn Earned Leave for Holiday Work**.
9. Leave scope set to *All Departments* and *All Locations* for company-wide coverage.
10. Click **`Save Policy`**.

```yaml
# Example Data:
Policy Name: Standard Office Attendance Policy 2026
Priority: 1
Punch Mode: Web & Mobile (Geofenced)
Late Arrival Grace Period: 15 minutes
Late Mark Action: Mark Late (3 late marks = 0.5 Day Loss of Pay)
Earn Earned Leave for Holiday Work: Enabled
Applies To: All Locations, All Departments
```

---

### Step 2B: Create Work Shifts

* **Sidebar Path:** `SETUP` > `Time` > `Work Shifts`
* **Direct URL:** `/dashboard/hr/attendance/shifts`
* **Goal:** Define scheduled shift hours, meal breaks, and Half-Day / Full-Day work duration thresholds.

> **IMPORTANT:** In this step, you are only creating the shift template. You will assign this shift to employees **in Phase 4** after they accept their onboarding invitation.

**Execution Steps:**
1. Navigate to **Work Shifts** (`/dashboard/hr/attendance/shifts`).
2. Click **`+ Add Shift`** at the top-right.
3. Enter **Shift Name** and **Shift Code**.
4. Set **Shift Type** to `Fixed Hours`.
5. Set scheduled **Start Time** (e.g., `09:30 AM`) and **End Time** (e.g., `06:30 PM`).
6. Set **Break Duration** (e.g., `60` minutes).
7. Set **Half Day Minimum Hours** (e.g., `4.5` hours) and **Full Day Minimum Hours** (e.g., `8.0` hours).
8. Set **Grace Period** (e.g., `15` minutes).
9. Click **`Save Shift`**.

```yaml
# Example Data:
Shift Name: General Day Shift (9:30 AM - 6:30 PM)
Shift Code: GEN-01
Shift Type: Fixed Hours
Start Time: 09:30 AM
End Time: 06:30 PM
Break Duration: 60 minutes
Half Day Minimum Hours: 4.5 hours
Full Day Minimum Hours: 8.0 hours
Grace Period: 15 minutes
```

---

### Step 2C: Setup Public & Company Holidays

* **Sidebar Path:** `SETUP` > `Time` > `Holidays`
* **Direct URL:** `/dashboard/hr/attendance/holidays`
* **Goal:** Publish mandatory paid public holidays and optional festival holidays for the year.

**Execution Steps:**
1. Navigate to **Holidays** (`/dashboard/hr/attendance/holidays`).
2. Select the operational year (e.g., `2026`) from the year dropdown.
3. Click **`+ Add Holiday`** (or `Import Calendar` for pre-populated lists).
4. Enter the **Holiday Name** and select the **Date**.
5. Choose **Type** as `Mandatory` (or `Optional` for floating holidays).
6. Under **Applicable Locations**, select `All Locations`.
7. Click **`Save Holiday`**.
8. Repeat for your full annual holiday schedule.

```yaml
# Example Data:
Holiday Name: Republic Day
Date: 26-01-2026
Type: Mandatory
Applicable Locations: All Locations
```

---

### Step 2D: Setup Weekly Offs

* **Sidebar Path:** `SETUP` > `Time` > `Weekly Offs`
* **Direct URL:** `/dashboard/hr/attendance/weekly-offs`
* **Goal:** Define weekly non-working rest days (e.g., 5-day week, 6-day week, or alternate Saturdays).

**Execution Steps:**
1. Navigate to **Weekly Offs** (`/dashboard/hr/attendance/weekly-offs`).
2. Click **`+ Add Rule`** (or `Add Policy`).
3. Enter a **Policy Name** and set **Priority** to `1`.
4. Under **Work Days**, toggle ON: `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`. (Leave `Saturday` and `Sunday` OFF).
5. Under **Alternate Saturday Schedule**, select `All Saturdays are off`.
6. Under **Applies To**, select `All Departments` and `All Locations`.
7. Click **`Save Policy`**.

```yaml
# Example Data:
Policy Name: Corporate 5-Day Work Week (Mon-Fri)
Work Days: Monday, Tuesday, Wednesday, Thursday, Friday
Weekly Off Days: Saturday, Sunday
Alternate Saturday Rule: All Saturdays are off
Applies To: All Departments
```

---

### Step 2E: Setup Earned Leave Policies (Comp-Off)

* **Sidebar Path:** `SETUP` > `Time` > `Comp-Off Policies`
* **Direct URL:** `/dashboard/hr/attendance/comp-off-policies`
* **Goal:** Reward staff with compensatory off credits when they work on scheduled weekly offs or holidays.

**Execution Steps:**
1. Navigate to **Comp-Off Policies** (`/dashboard/hr/attendance/comp-off-policies`).
2. Click **`+ Add policy`** at the top-right.
3. Enter the **Policy Name**.
4. Set **Hours for half day** to `4.0` and **Hours for full day** to `8.0`.
5. Set **Multiplier** to `1.0`.
6. Set **Valid for (days)** to `60` (credits expire after 2 months).
7. Set **Maximum balance** to `5.0` days.
8. Check **Requires manager approval**.
9. Click **`Save Policy`**.

```yaml
# Example Data:
Policy Name: Standard Compensatory Off Policy
Hours for Half Day: 4.0 hours
Hours for Full Day: 8.0 hours
Multiplier: 1.0
Validity: 60 days
Maximum Balance Cap: 5.0 days
Requires Manager Approval: Yes
```

---

## PHASE 3: People Onboarding — Inviting Team Members

Now that organization, attendance, shifts, and holiday policies are ready, you can safely issue invitations.

### Step 3A: Issue Employee Invitations via the 4-Step Wizard

* **Sidebar Path:** `PEOPLE` > `Invites`
* **Direct URL:** `/dashboard/hr/invites`
* **Goal:** Pre-fill candidate profile and work details, and generate a 48-hour email activation link.

> **CRITICAL PERMANENT FIELDS: Role & Gender**  
> The **Role** (`HR`, `Manager`, `Employee`) and **Gender** (`Male`, `Female`, `Other`) fields **cannot be changed from the profile after onboarding**. Verify both carefully before sending.

#### The 4 Accordion Steps:
* **Step 1: Required Information** — Name, Work Email, Role, Gender, Employee ID.
* **Step 2: Profile Details** — Mobile Phone, Personal Email, DOB, Marital Status, Blood Group, Designation.
* **Step 3: Organization & Work** — Office Location, Department, Reporting Manager, Job Status, Employment Type, Work Mode, Joining Date.
  > *Rule: If inviting a Manager or HR, their Reporting Person must strictly be an HR user.*
* **Step 4: Compliance & Address** — PAN, UAN, Residential Address, City, State, Pincode.

**Execution Steps:**
1. Navigate to **Invites** (`/dashboard/hr/invites`).
2. Click the **`+ New invite`** button at the top-right.
3. Complete **Step 1 (Required Information)**: Name, Work Email, Role, Gender.
4. Expand **Step 2 (Profile Details)**: Phone, DOB, Blood Group, Designation.
5. Expand **Step 3 (Organization & Work)**: Select Location, Department, Reporting Person, Job Status, Employment Type, Work Mode, and Joining Date.
6. Expand **Step 4 (Compliance & Address)**: Enter PAN, UAN, and Address (check *Same as Current*).
7. Click **`Send Invitation`**.
8. The invite moves to the **Waiting** tab with a 48-hour expiration timer.

```yaml
# Example Data:
Full Name: Aman Sharma
Email Address: aman.sharma@yourcompany.com
Role: Employee
Gender: Male
Primary Contact: +91 9876543210
Designation: Full Stack Developer
Location: Indore Head Office
Department: Information Technology
Reporting Person: Abhishek HR
Job Status: Probation
Employment Type: Full Time
Work Mode: On-site
Joining Date: 01-11-2026
```

---

### Step 3B: Employee Accepts Invitation

* The employee receives an activation email with a secure link (valid for 48 hours).
* The employee sets their password and logs into the self-service portal.
* On the HR Invites dashboard, their status updates from **Waiting** to **Accepted**.
* The employee now appears in the active **Team Directory** (`/dashboard/hr/employees`).

---

## PHASE 4: Post-Join Setup — Scheduling & Leaves

Perform these steps **after** the employee accepts their invitation and appears in the Team Directory.

### Step 4A: Assign Work Shift to the Joined Employee

* **Sidebar Path:** `SETUP` > `Time` > `Shift Assignments` (or `Roster`)
* **Direct URL:** `/dashboard/hr/attendance/shift-assignments`
* **Goal:** Assign the shift template created in Step 2B to the onboarded employee.

**Execution Steps:**
1. Navigate to **Shift Assignments** (or Roster: `/dashboard/hr/attendance/roster`).
2. Locate the employee (or click **`Bulk Assign Shift`**).
3. Select the shift: `General Day Shift (9:30 AM - 6:30 PM)`.
4. Select the employee: `Aman Sharma` (or select entire Department: `Information Technology`).
5. Set **Effective From Date** as their joining date.
6. Leave **Effective To Date** blank for an ongoing permanent schedule.
7. Click **`Confirm Shift Assignment`**.

---

### Step 4B: Create Leave Types

* **Sidebar Path:** `SETUP` > `Leave` > `Leave Types`
* **Direct URL:** `/dashboard/hr/leaves/types`
* **Goal:** Create the leave categories your company offers (e.g., Casual Leave, Sick Leave, Maternity Leave).

**Execution Steps:**
1. Navigate to **Leave Types** (`/dashboard/hr/leaves/types`).
2. Click **`+ Add Leave Type`** at the top-right.
3. Configure **Casual Leave (CL)**:
   - Name: `Casual Leave`, Code: `CL`.
   - Toggle **Paid Leave** to `ON`.
   - Toggle **Count Weekends In Between** to `OFF` (sandwich rule off).
   - Click **`Save Leave Type`**.
4. Click **`+ Add Leave Type`** again to configure **Sick Leave (SL)**:
   - Name: `Sick Leave`, Code: `SL`.
   - Toggle **Paid Leave** to `ON`.
   - Set **Document Required After** to `2` days (medical certificate needed for 3+ consecutive days).
   - Click **`Save Leave Type`**.

```yaml
# Example Data:
Leave Type 1: Casual Leave (CL) | Paid: Yes | Sandwich Rule: Off | Doc Required: None
Leave Type 2: Sick Leave (SL)   | Paid: Yes | Sandwich Rule: Off | Doc Required: After 2 days
```

---

### Step 4C: Create Leave Policies (Quota Templates)

* **Sidebar Path:** `SETUP` > `Leave` > `Leave Policies`
* **Direct URL:** `/dashboard/hr/leaves/policies`
* **Goal:** Bundle leave types into an annual quota package with accrual and carry-forward rules.

**Execution Steps:**
1. Navigate to **Leave Policies** (`/dashboard/hr/leaves/policies`).
2. Click **`Create Policy`** at top-right.
3. Enter Policy Name as `Standard Full-Time Leave Policy 2026` and click **`Save Policy Template`**.
4. On the generated card, click **`+ Add Quota`** to attach **Casual Leave (CL)**:
   - Leave Type: `Casual Leave (CL)`.
   - Days Per Year: `12`.
   - How Leave Is Given: `Every month` (1 day credited each month).
   - Unused Days Kept For Next Year: `3` days.
   - Wait After Joining: `30` days.
   - Click **`Save Quota`**.
5. Click **`+ Add Quota`** again to attach **Sick Leave (SL)**:
   - Leave Type: `Sick Leave (SL)`.
   - Days Per Year: `10`.
   - How Leave Is Given: `All at once` (available on Day 1).
   - Unused Days Kept: `0` (lapses at year end).
   - Click **`Save Quota`**.

```yaml
# Example Data:
Policy Name: Standard Full-Time Leave Policy 2026
Quota 1: Casual Leave (CL) -> 12 days/yr | Accrual: Monthly (1/mo) | Rollover: 3 days max
Quota 2: Sick Leave (SL)   -> 10 days/yr | Accrual: All at once   | Rollover: 0 (Lapses)
```

---

### Step 4D: Assign Leave Policies to Employees

* **Sidebar Path:** `SETUP` > `Leave` > `Leave Policies`
* **Direct URL:** `/dashboard/hr/leaves/policies`
* **Goal:** Enroll onboarded employees into the leave quota package.

**Execution Steps:**
1. On the **Leave Policies** page, locate the card: `Standard Full-Time Leave Policy 2026`.
2. Click the **`Assign`** button on that card.
3. Select targets: Choose individual employee (`Aman Sharma`) or select by department (`Information Technology`).
4. Verify policy selection and preview quota allocations.
5. Click **`Confirm & Assign Policy`**.
6. The employee's leave balance is initialized and active.

---

## Daily Operations Summary

* **HR Inbox** (`/dashboard/hr/inbox`): Approve leave requests, regularize missed attendance punches, sign off overtime, and resolve system attendance flags.
* **Team Directory** (`/dashboard/hr/employees`): View staff cards, reporting lines, and monthly attendance calendars.
* **Daily Attendance** (`/dashboard/hr/attendance/daily`): Real-time live dashboard of present, late, on-leave, and absent staff with GPS verification.

---

## Master Setup Checklist

Print this reference checklist to track your onboarding progress:

| Phase | Step | Task Description | Target Portal URL | Done |
| :---: | :---: | :--- | :--- | :---: |
| **Phase 1** | **1A** | Create Office Location & Geofence | `/dashboard/hr/attendance/locations` | [ ] |
| **Phase 1** | **1B** | Create Organizational Departments | `/dashboard/hr/departments` | [ ] |
| **Phase 2** | **2A** | Create Attendance Policy (Grace time, Punch modes) | `/dashboard/hr/attendance/policies` | [ ] |
| **Phase 2** | **2B** | Create Work Shift Templates (Start/End hours) | `/dashboard/hr/attendance/shifts` | [ ] |
| **Phase 2** | **2C** | Publish Public & Company Holiday Calendar | `/dashboard/hr/attendance/holidays` | [ ] |
| **Phase 2** | **2D** | Configure Weekly Offs (5-Day / Alternate Sat) | `/dashboard/hr/attendance/weekly-offs` | [ ] |
| **Phase 2** | **2E** | Setup Earned Leave (Comp-Off) Rules | `/dashboard/hr/attendance/comp-off-policies` | [ ] |
| **Phase 3** | **3A** | Issue Employee Invites via 4-Step Wizard | `/dashboard/hr/invites` | [ ] |
| **Phase 3** | **3B** | Employee Accepts Invite & Creates Password | *48-hr Email Link* | [ ] |
| **Phase 4** | **4A** | Assign Shift in Roster / Shift Assignments | `/dashboard/hr/attendance/shift-assignments` | [ ] |
| **Phase 4** | **4B** | Create Leave Types (CL, SL, ML) | `/dashboard/hr/leaves/types` | [ ] |
| **Phase 4** | **4C** | Assemble Leave Policy & Attach Annual Quotas | `/dashboard/hr/leaves/policies` | [ ] |
| **Phase 4** | **4D** | Assign Leave Policy to Onboarded Employees | `/dashboard/hr/leaves/policies` | [ ] |

---

*HrClouds HRMS User Onboarding & Setup Workflow Guide — Streamlined for rapid execution and clean PDF printing.*
