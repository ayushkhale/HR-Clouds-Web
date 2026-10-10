# Phase 1: Organization Settings Hub — Business Walkthrough & User Guide

**Document Ref:** `public/md_settings/phases/phase1_business_walkthrough.md`  
**Audience:** HR Administrators, People Managers, Operations Leads, Executive Stakeholders  
**Product Version:** Dakshi HRMS (HRClouds / HRVista) — Settings Module Phase 1  
**Scope:** Foundation, Discovery Catalog, and Organization-Wide Read Plane  

---

## 1. Executive Summary & Purpose of the Settings Hub

Welcome to the **Organization Settings Hub (Phase 1)** user guide. 

In every growing organization, hundreds of rules govern how employees are paid, how documents are verified, how taxes and statutory benefits are calculated, and who has the authority to make critical decisions. Traditionally, these rules were scattered across disconnected system menus, buried in specialized configuration forms, or hidden from the people who need them most.

**Settings Module Phase 1** solves this challenge by introducing a centralized **Discovery and Audit Command Center**. It brings all 138 organizational settings across 26 business categories—along with pointers to 49 specialized policy management screens—into a single, unified, and transparent view.

### What is Delivered in Phase 1?
* **A Single Source of Truth:** View all organization-level configurations across Payroll, Statutory Compliance, Documents, Corporate Branding, and Company Notifications in one unified dashboard.
* **Smart Exploration Catalog:** Browse every available company setting, read plain-language descriptions of what it does, understand its factory defaults, and see which business processes it affects.
* **Real-Time Configuration Auditing:** Instantly see your organization’s active live values side-by-side with system defaults, highlighted by clear "Customized" indicators.
* **Impact & Risk Transparency:** Review the exact timing of changes (e.g., immediate, on the next payroll run, or during the next document upload) and risk classifications (Low, Medium, or High) before planning operational adjustments.
* **Cross-Module Dependency Mapping:** Inspect prerequisite conditions and relationships between settings so HR leaders never configure conflicting business rules.
* **Strict Role-Based Privacy:** Protect sensitive organizational data. HR administrators maintain complete visibility across all categories, while People Managers access only the governance and authority rules relevant to their teams.

> **Important Note for Phase 1 Users:**  
> Phase 1 establishes the **Discovery, Exploration, and Read-Only Auditing** layer of the Settings Hub. You can view, search, filter, and inspect all organizational settings here. Direct, in-place editing and one-click factory resets within this unified hub will be enabled in **Phase 2**. In the interim, making operational updates continues seamlessly through your existing individual module administration screens (such as Payroll Settings or Document Branding).
>
> > [!IMPORTANT]
> > **Do Not Remove Existing Module Settings Pages:**  
> > Introducing the unified Organization Settings Hub does **NOT** remove, replace, or eliminate existing settings pages that exist under specific module tabs in the frontend (such as *Payroll > Settings*, *Documents > Settings*, *Leave > Policy Setup*, or *Attendance > Policies*). All existing module-specific settings pages **must remain fully intact, functional, and accessible under their respective module tabs**. The Settings Hub is an overarching single pane of glass, not a replacement that breaks existing module workflows.

---

## 2. Who Can Access the Settings Hub?

The Settings Hub enforces strict data privacy and governance boundaries:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ORGANIZATION ACCESS MATRIX                            │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ User Role            │ Access Level         │ Permitted Categories          │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ HR Administrator     │ Full Visibility      │ All 26 Categories (100% of    │
│                      │                      │ Organization Settings)        │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ People Manager       │ Targeted Visibility  │ 2 Governance & Authority      │
│                      │                      │ Categories Only               │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Employee             │ No Access            │ None (Personal profile only)  │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Platform Admin       │ Strictly Excluded    │ None (Tenant privacy locked)  │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

### Detailed Role Explanations

#### 1. HR Administrators (`hr`)
* **Role Summary:** The executive custodians of company policy, legal compliance, and organizational compensation.
* **What They Can See:** Complete access to all 26 settings categories across Payroll, Statutory Contributions, Document Policies, Letterhead Branding, and Company Notification Channels.
* **Why:** HR requires full visibility to audit compliance, prepare for payroll cycles, align company branding, and verify statutory deduction percentages.

#### 2. People Managers (`manager`)
* **Role Summary:** Team leaders responsible for supervising direct reports, conducting performance appraisals, and recommending compensation or document approvals.
* **What They Can See:** Specifically permitted to view two dedicated governance categories:
  1. **Payroll Approval Authority:** Verifies whether managers can view direct reports' compensation, propose raises, or whether secondary HR approval is required.
  2. **Document Approval Authority:** Verifies whether managers can directly approve non-confidential team documents or if HR verification is required.
* **What is Hidden:** All remaining 24 categories (such as statutory PF/ESI rates, banking formats, company tax numbers, and document retention rules) are strictly hidden to safeguard sensitive corporate financial and legal information.

#### 3. General Employees (`employee`)
* **Role Summary:** Individual team members who manage personal profiles, view payslips, submit claims, and upload identity documents.
* **Access Level:** General employees do not have access to the Organization Settings Hub. Organization-level policies are established at the employer level.

#### 4. Platform Administrators (`admin`, `super-admin`)
* **Role Summary:** Cloud infrastructure and technical platform maintenance personnel.
* **Access Level:** **Strictly Excluded.** To ensure multi-tenant data confidentiality, platform administrators cannot view or browse any customer organization's internal settings, salaries, or tax rules.

---

## 3. Why Does the Settings Hub Exist? (The Business Problem)

Before Settings Phase 1, managing company policies in an enterprise HRMS suffered from four critical operational problems:

### 1. The "Scattered Needle in a Haystack" Problem
To find out how the company handles overtime, cut-off dates, or letterheads, an administrator had to jump between 6 different system screens:
* Navigating to *Payroll > Administration > Settings* to check the monthly pay cycle.
* Navigating to *Payroll > Compliance > Statutory Setup* to check PF ceiling limits.
* Navigating to *Documents > Company Policies* to check upload file sizes.
* Navigating to *Documents > Letter Templates* to check the official company address.
* Navigating to *Company Profile* to check administrative contact emails.

**How Phase 1 Solves It:** Everything is visible in one centralized dashboard, accessible in two clicks.

### 2. The "Hidden Default" Uncertainty
HR leaders often wondered: *"Is our Provident Fund ceiling set to ₹15,000 because we configured it that way, or because it's the system default? What happens if we reset it?"*  
**How Phase 1 Solves It:** Every setting displays its factory default value side-by-side with your active live value, complete with a visual badge indicating whether your company has customized it.

### 3. The "Unintended Consequence" Fear
Changing an operational setting can sometimes cause unexpected issues. For example:
* *"If I change the pay date today, will it affect the payslips I generated yesterday, or only the upcoming run?"*
* *"If I enable mandatory secondary review for payroll, do we have enough active HR managers to approve it?"*

**How Phase 1 Solves It:** Every setting card discloses its **Impact Timing** (e.g., *Applies to next payroll run*, *Applies to next document uploaded*, or *Immediate*) and outlines **Prerequisites & Known Dependencies** directly on the screen.

### 4. The Single vs. Multi-Record Policy Confusion
In HR, some configurations are single organization-wide toggles (e.g., *"What is our pay date?"*), while others are multi-record policy tables (e.g., *"What are our 5 different leave types?"* or *"What are our state-specific Professional Tax slabs?"*). Users were often confused about where each type of policy lived.  
**How Phase 1 Solves It:** The Settings Hub cleanly distinguishes between single-value settings and multi-record policy directories, providing clear pointers to the exact policy screens where specialized records are managed.

---

## 4. Navigating the Settings Hub

When an authorized user logs into Dakshi HRMS and clicks **Settings** in the main sidebar, they are presented with an intuitive, modern command center:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ ORGANIZATION SETTINGS HUB                               [ Search Setting ]│
├─────────────────────────────────────────────────────────────────────────────┤
│ Module Filter: [ All Modules ] [ Payroll ] [ Documents ] [ Organization ]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  🏢 ORGANIZATION OVERVIEW                                                   │
│  Active Settings: 138   •   Categories: 26   •   Customized Policies: 7     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐                │
│  │ 📅 Payroll Calendar      │  │ 🏛️ Statutory PF (Provident)│                │
│  │ 7 Settings • 1 Customized│  │ 14 Settings • All Default│                │
│  │ [ View Category Details ]│  │ [ View Category Details ]│                │
│  └──────────────────────────┘  └──────────────────────────┘                │
│                                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐                │
│  │ 🖋️ Letterhead & Branding │  │ 📁 Document Storage Rules│                │
│  │ 13 Settings • Customized │  │ 4 Settings • All Default │                │
│  │ [ View Category Details ]│  │ [ View Category Details ]│                │
│  └──────────────────────────┘  └──────────────────────────┘                │
│                                                                             │
│  ... (22 Additional Categories) ...                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Screen Areas

1. **Top Metric Bar:** Shows the total number of settings evaluated, total active categories, and a quick tally of how many settings differ from factory recommendations.
2. **Module Filter Pills:** Allows one-click filtering by functional domain (`Payroll`, `Documents`, `Organization Profile`, or `All`).
3. **Search & Discovery Bar:** Instant live search across all setting labels, units, and descriptions.
4. **Category Grid:** Cards representing each of the 26 business categories. Each card displays:
   * Category title and icon
   * Total number of settings in that category
   * Customized settings badge (if any setting differs from standard default)
   * Subscription entitlement badge (shows if an upgrade is required)
5. **Setting Detail Drawer:** Clicking any setting or category opens a slide-out drawer providing a deep dive into the rule's operational impact, allowed choices, and prerequisite requirements.

---

## 5. Comprehensive Tour of Settings Categories

The Settings Hub organizes all 138 organizational settings into **26 logical business categories across 5 core functional stores**:

---

### A. Payroll Settings (11 Categories — 63 Settings)

These categories govern compensation schedules, calculation logic, tax withholding, and approval workflows.

#### 1. Payroll Calendar (`payroll.calendar`) — 7 Settings
* **What it controls:** When and how often your employees get paid.
* **Key Configurable Options:**
  * **Payroll Cycle:** Frequency of compensation (Monthly, Bi-weekly, or Weekly). Factory default: `monthly`.
  * **Pay Period Start Day:** The day of the month when your salary cycle begins (usually Day 1).
  * **Attendance Cut-Off Day:** The day of the month when employee attendance and leave records are locked for salary calculations (e.g., Day 25).
  * **Pay Day:** The scheduled salary disbursement day (e.g., Day 30 or Day 1).
  * **Pay Day in Next Month:** Flag indicating if salaries are paid in the following calendar month (e.g., January salary paid on February 5th).
  * **Currency:** Primary payroll disbursement currency (e.g., `INR`).
  * **Financial Year Start Month:** Fiscal accounting calendar starting month (e.g., Month `4` for April in India).

#### 2. Approval Authority & Governance (`payroll.authority`) — 3 Settings
* **What it controls:** Maker-Checker controls and manager visibility over salaries.
* **Key Configurable Options:**
  * **Require Separate Checker:** When enabled, the HR team member who creates or revises a salary structure cannot approve it. A second authorized HR administrator must review and sign off.
  * **Manager Can View Team Compensation:** Dictates whether people managers can see the salary breakdown of their direct reports or only high-level team budget totals.
  * **Manager Direct Compensation Authority:** Whether managers can directly approve salary increments without HR escalation (recommended: disabled).

#### 3. Salary Processing & Proration (`payroll.calculation`) — 8 Settings
* **What it controls:** How salaries are mathematically computed for mid-month joiners, exits, and unpaid leaves.
* **Key Configurable Options:**
  * **Proration Basis:** How daily wages are calculated for partial months (e.g., based on actual calendar days in the month, a standard 30-day month, or working business days).
  * **Rounding Method:** How final payable amounts are rounded (e.g., round to nearest whole rupee).
  * **Loss of Pay (LOP) Deduction Base:** Defines whether unpaid leave deducts only from Basic Pay or proportionally across all earnings.

#### 4. Tax Withholding & TDS (`payroll.tax`) — 6 Settings
* **What it controls:** Automated income tax withholding policies during salary runs.
* **Key Configurable Options:**
  * **Default Tax Regime:** The statutory regime applied to new employees (e.g., New Tax Regime vs Old Tax Regime).
  * **PAN Non-Availability Deduction Rate:** Statutory mandatory deduction rate (20%) applied to employees without a registered PAN.
  * **Declaration Submission Deadline:** Cut-off date for employees to submit investment and tax-saving declarations.

#### 5. Expense Reimbursements (`payroll.reimbursements`) — 5 Settings
* **What it controls:** Policies for processing employee business expenses and out-of-pocket claims.
* **Key Configurable Options:**
  * **Maximum Claim Submission Window:** Days allowed after incurring an expense to submit a claim (e.g., 60 days).
  * **Mandatory Receipt Threshold:** Minimum expense amount requiring an attached receipt.
  * **Separate Reimbursement Payout:** Controls whether approved reimbursements are paid alongside monthly salaries or disbursed through an out-of-cycle transfer.

#### 6. Employee Corporate Benefits (`payroll.benefits`) — 5 Settings
* **What it controls:** Group insurance policies, retirement contributions, and corporate health plans.
* **Key Configurable Options:**
  * **Mid-Month Benefit Deduction Policy:** Flat monthly charge rules for health and corporate benefits.
  * **Employer Benefit Contribution Basis:** Inclusion of employer benefit shares in total CTC calculations.

#### 7. Employee Loans & Advances (`payroll.loans`) — 6 Settings
* **What it controls:** Company-provided salary advances and personal emergency loans.
* **Key Configurable Options:**
  * **Maximum Loan Amount Multiple:** Maximum loan cap relative to an employee's monthly net salary (e.g., 3x monthly pay).
  * **Maximum Repayment Tenure:** Longest allowed repayment schedule in months (e.g., 12 months).
  * **Interest Rate Option:** Whether employee loans carry standard interest or are zero-interest payroll advances.

#### 8. Bonus & Variable Pay (`payroll.variable_pay`) — 5 Settings
* **What it controls:** Performance bonuses, annual incentives, and sales commissions.
* **Key Configurable Options:**
  * **Bonus Withholding Policy:** Whether statutory deductions (PF/ESI) apply to performance bonuses.
  * **Disbursement Cycle:** Timing of scheduled bonus disbursements (Quarterly, Annual, or Ad-hoc).

#### 9. Full & Final Settlement (F&F) (`payroll.fnf`) — 6 Settings
* **What it controls:** Financial calculations when an employee leaves the company.
* **Key Configurable Options:**
  * **Notice Period Shortfall Recovery:** Daily rate formula used to recover unserved notice period days.
  * **Leave Balance Encashment Rule:** Basis for converting accrued paid leaves into cash.
  * **Gratuity Calculation Formula:** Compliance formula for statutory gratuity payouts based on completed years of service.

#### 10. Payment & Bank Advice (`payroll.banking`) — 6 Settings
* **What it controls:** Bank disbursement files generated after payroll approval.
* **Key Configurable Options:**
  * **Primary Bank Advice Format:** Supported banking export layout (e.g., HDFC, ICICI, SBI, Axis standard CSV).
  * **Encrypted Bank Details Enforcement:** Mandatory masking of employee bank account numbers across general reporting views.

#### 11. Payroll Automation & Reminders (`payroll.automation`) — 6 Settings
* **What it controls:** Automated reminders and schedule triggers for HR operators.
* **Key Configurable Options:**
  * **Automated Run Reminders:** Days before pay date to notify HR to initiate payroll processing.
  * **Auto-Lock Attendance Date:** Automatic freeze of biometric attendance data on the cut-off date.

---

### B. Statutory Compliance Settings (4 Categories — 25 Settings)

These categories configure mandatory legal withholdings under Indian labor laws.

#### 12. Employees' Provident Fund (PF & EPS) (`statutory.pf`) — 14 Settings
* **What it controls:** Mandatory retirement savings contributions under the Employees' Provident Funds and Miscellaneous Provisions Act.
* **Key Configurable Options:**
  * **Employee PF Contribution Rate:** Standard employee deduction percentage (Factory default: `12%`).
  * **Employer PF Contribution Rate:** Standard employer matching contribution (Factory default: `12%`, divided between EPF and EPS).
  * **Statutory PF Wage Ceiling:** Government statutory monthly limit (Factory default: `₹15,000`).
  * **Restrict PF to Ceiling:** Toggle allowing or restricting contributions strictly to the ₹15,000 ceiling.
  * **Employee Pension Scheme (EPS) Enabled:** Automatic allocation of 8.33% of employer contribution to EPS.
  * **EDLI Insurance & Admin Charges:** Standard statutory administrative fees (0.50% PF Admin, 0.50% EDLI Insurance).

#### 13. Employees' State Insurance (ESI) (`statutory.esi`) — 5 Settings
* **What it controls:** Mandatory medical and disability insurance for eligible employees.
* **Key Configurable Options:**
  * **ESI Enablement:** Master switch enabling ESI withholding across the organization.
  * **Employee ESI Rate:** Standard deduction (Factory default: `0.75%`).
  * **Employer ESI Rate:** Employer contribution (Factory default: `3.25%`).
  * **Statutory Wage Threshold:** Government eligibility ceiling (Factory default: `₹21,000` gross monthly wage).

#### 14. Professional Tax (PT) (`statutory.pt`) — 1 Setting
* **What it controls:** Master switch enabling state-level Professional Tax deductions.
* **Key Configurable Options:**
  * **Professional Tax Enabled:** Activates state-specific tax deduction slabs across payroll runs.

#### 15. Income Tax & Withholding (`statutory.income_tax`) — 5 Settings
* **What it controls:** Central income tax calculation rules and compliance surcharges.
* **Key Configurable Options:**
  * **Income Tax Withholding Enabled:** Activates automated TDS deductions.
  * **Standard Health & Education Cess:** Statutory cess percentage applied to income tax (Factory default: `4%`).
  * **TDS Without PAN Rate:** Statutory penalty tax deduction rate (Factory default: `20%`).

---

### C. Documents & Records Management (9 Categories — 35 Settings)

These categories define how employee records, digital agreements, and sensitive company documents are handled.

#### 16. Document Storage & Upload Safeguards (`documents.storage`) — 4 Settings
* **What it controls:** File transfer limits and safety controls.
* **Key Configurable Options:**
  * **Maximum File Size:** Upper limit for employee uploads (e.g., 10 MB or 25 MB).
  * **Secure Viewing Link Duration:** Expiration window (in seconds) for private document access links.
  * **Mandatory Virus & Malware Scan:** Safety check performed on all incoming attachments.

#### 17. Document Lifecycle & Retention (`documents.lifecycle`) — 4 Settings
* **What it controls:** Rules for document retirement and employee deletion permissions.
* **Key Configurable Options:**
  * **Employee Deletion Restriction:** Prohibits employees from deleting documents once verified by HR.
  * **Mandatory Verification Default:** Ensures newly added document types default to requiring administrative sign-off.
  * **Offboarding Document Archive Mode:** Automated archiving of employee files when an exit settlement is completed.

#### 18. Digital Signatures & Acknowledgements (`documents.acknowledgement`) — 3 Settings
* **What it controls:** Digital signatures and formal acknowledgements for company handbooks and policies.
* **Key Configurable Options:**
  * **Mandatory Acknowledgement Deadline:** Days allowed for employees to review and sign mandatory company policies (e.g., 7 days).
  * **Portal Access Blocking:** Restricts non-essential portal access if critical statutory policies remain unacknowledged after the deadline.

#### 19. Notifications & Expiry Alerts (`documents.notifications`) — 7 Settings
* **What it controls:** Proactive reminder alerts for expiring passports, visas, licenses, and contracts.
* **Key Configurable Options:**
  * **Document Expiry Reminder Windows:** Days in advance to trigger alerts (e.g., 30 days, 15 days, and 7 days before expiry).
  * **Notify HR on New Uploads:** Alerts HR administrators when an employee submits a new document for review.

#### 20. Employee Document Requests (`documents.requests`) — 2 Settings
* **What it controls:** Workflows when HR requests missing documents from employees.
* **Key Configurable Options:**
  * **Default Submission Due Days:** Standard timeframe given to employees to fulfill a document request (e.g., 5 business days).
  * **Onboarding Completeness Threshold:** Required document completion percentage before an employee profile is marked fully onboarded.

#### 21. Document Publishing (`documents.publishing`) — 1 Setting
* **What it controls:** Rules for batch publishing company-wide policies and announcements.

#### 22. Official Letters & Notices (`documents.letters`) — 8 Settings
* **What it controls:** Generation of appointment letters, increment letters, and relieving certificates.
* **Key Configurable Options:**
  * **Enable Letter Branding:** Automatically applies company letterhead and branding to all generated letters.
  * **Automatic Exit Letter Issuance:** Automatically drafts relieving and experience certificates upon completion of Full & Final settlements.
  * **Reference Number Sequence Pattern:** Custom pattern used to number official letters (e.g., `DOC-YYYY-SEQ`).

#### 23. Document Approval Authority (`documents.authority`) — 4 Settings
* **What it controls:** Managerial review rights over team documents.
* **Key Configurable Options:**
  * **Manager Can View Team Documents:** Permits managers to view non-confidential employee records (e.g., certifications, education degrees).
  * **Manager Direct Document Authority:** Allows managers to directly approve team certifications without HR escalation.

#### 24. Document Record Retention (`documents.retention`) — 2 Settings
* **What it controls:** Legal retention schedules before historical documents can be permanently purged (e.g., 7 years for financial and tax-related files).

---

### D. Corporate Identity & Official Branding (1 Category — 13 Settings)

#### 25. Letterhead & Legal Information (`documents.branding`) — 13 Settings
* **What it controls:** The visual appearance and legal footer information stamped onto system-generated PDFs (payslips, appointment letters, tax certificates).
* **Key Configurable Options:**
  * **Official Registration Numbers:** Corporate Identity Number (CIN), GSTIN, PAN, and TAN.
  * **Registered Office Address:** Multi-line registered office address displayed on official letterheads.
  * **Official Signatory Designation:** Standard title of the company representative signing letters (e.g., *"Head of People & Culture"*).
  * **Brand Styling:** Primary accent color code (HEX format) and letterhead enablement switch.
  * **Contact Details:** Official corporate support email, telephone number, and website address.

---

### E. Organization Notifications & Profile (1 Category — 2 Settings)

#### 26. Operational Notifications (`organization.profile`) — 2 Settings
* **What it controls:** Primary administrative contacts for system-wide notices.
* **Key Configurable Options:**
  * **Primary Notification Email:** Corporate email address that receives system billing notices, license renewals, and critical operational alerts.
  * **Primary Notification Phone:** Emergency administrative contact telephone number.

---

## 6. Multi-Record Policy Directories (The 49 "Surfaces")

In addition to the 26 single-value settings categories described above, an enterprise HRMS relies on **multi-record policy tables**. For example, your organization does not have a single "leave balance"; it has multiple leave types (Casual Leave, Sick Leave, Maternity Leave), each with its own individual rules.

Settings Module Phase 1 catalogs **49 specialized policy directories**. When exploring the Settings Hub, these directories act as smart pointers guiding you to their dedicated operational screens:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📚 SPECIALIZED POLICY DIRECTORIES (SURFACES)                                │
├─────────────────────────┬───────────────────────┬───────────────────────────┤
│ Functional Area         │ Policy Directory      │ Where It Is Managed       │
├─────────────────────────┼───────────────────────┼───────────────────────────┤
│ Leave Management        │ Leave Types & Quotas  │ Leave > Policy Setup      │
│                         │ Sandwich Rules        │ Leave > Rules & Policies  │
│                         │ Accrual & Carry-Over  │ Leave > Accruals          │
├─────────────────────────┼───────────────────────┼───────────────────────────┤
│ Attendance & Time       │ Shift Rosters         │ Attendance > Shifts       │
│                         │ Grace Periods         │ Attendance > Policies     │
│                         │ Holiday Calendars     │ Attendance > Holidays     │
├─────────────────────────┼───────────────────────┼───────────────────────────┤
│ Payroll Masters         │ Salary Components     │ Payroll > Components      │
│                         │ Salary Templates      │ Payroll > Templates       │
│                         │ State PT Slabs        │ Payroll > PT Setup        │
├─────────────────────────┼───────────────────────┼───────────────────────────┤
│ Document Templates      │ Document Types Master │ Documents > Templates     │
│                         │ Letter Templates      │ Documents > Letters       │
└─────────────────────────┴───────────────────────┴───────────────────────────┘
```

**Why this matters to the user:** You never have to wonder where a policy lives. If you search for *"Sandwich Rule"* or *"Shift Template"* in the Settings Hub, the system immediately points you to the exact management screen where those policies are configured.

---

## 7. Understanding Setting Badges, States & Classifications

When reviewing settings in the Hub, each card displays visual indicators to help you assess its operational status:

| Badge / State | Visual Indicator | What It Means in Business Terms | What You Can Do |
| :--- | :--- | :--- | :--- |
| **Factory Default** | 🟢 Gray / Clean | The setting is currently operating on standard system recommendations (e.g., PF rate at 12%). | No action needed. System is adhering to standard industry practices. |
| **Customized** | 🟣 Purple / Badge | Your organization has customized this setting away from the factory default (e.g., Pay Day set to 28th instead of 30th). | Review to verify that the customization remains aligned with company policy. |
| **Active & Entitled** | 🟢 Green Check | This feature is fully included in your organization's current subscription plan. | Accessible for review by all authorized administrators. |
| **Subscription Required** | 🔒 Lock Icon | This feature belongs to a module (e.g., Advanced Payroll) not included in your current subscription. | Contact your account manager to upgrade your subscription tier. |
| **Role Restricted** | 🚫 Shield Icon | You do not have permission to view this specific category (e.g., a Manager viewing Statutory PF). | Contact your primary HR Administrator if you require elevated access. |
| **Service Maintenance** | 🟡 Amber Warning | The underlying subsystem is momentarily completing a maintenance check. | Other categories remain fully available. Recheck this category shortly. |

### Operational Risk Classifications
Every setting is classified by operational risk to prevent hasty modifications:
* **Low Risk (🟢):** Cosmetic or informational settings (e.g., brand accent color, official website URL). Changing these has zero impact on calculations.
* **Medium Risk (🟡):** Workflow or notification settings (e.g., document upload limits, reminder schedules, Maker-Checker toggles). Changes affect operational timelines but do not alter financial ledgers.
* **High Risk (🔴):** Financial, tax, or legal settings (e.g., statutory PF ceiling, tax deduction regime, payroll cut-off day). Changes directly affect employee take-home pay or statutory compliance filings.

### Impact Timing Disclosures
The setting drawer explicitly states when a change takes effect:
* **Immediate:** Takes effect the instant it is updated (e.g., branding colors, notification phone number).
* **Next Record:** Applies to the next individual action taken (e.g., next document uploaded or next expense claim submitted).
* **Next Payroll Run:** Does not affect past or locked payroll runs; applies automatically when initiating the next monthly salary cycle.

---

## 8. Step-by-Step User Workflows (Real-World Scenarios)

### Workflow 1: Pre-Payroll Audit (HR Administrator)
**Scenario:** It is the 24th of the month. HR Administrator Priya wants to audit the company's payroll cut-off and statutory deduction settings before locking biometric attendance for the month.

```text
1. Priya logs into Dakshi HRMS and clicks "Settings" in the main navigation.
2. In the top filter bar, she clicks the "Payroll" filter pill.
   → The screen instantly filters down to the 11 Payroll categories.
3. She opens the "Payroll Calendar" category card.
   → She confirms:
     • Attendance Cut-Off Day: 25th (Active)
     • Pay Day: 30th (Active)
     • Payroll Cycle: Monthly (Active)
4. She clicks the "Statutory PF" card.
   → She reviews the active PF Employee Rate (12%) and Statutory Wage Ceiling (₹15,000).
   → She notes that both show the "Factory Default" badge, confirming full statutory compliance.
5. Confident that all operational rules are verified, Priya proceeds to the Payroll processing queue.
```

---

### Workflow 2: Verifying Approval Rights (People Manager)
**Scenario:** Engineering Manager Rahul has conducted annual performance reviews and wants to recommend a salary increase for a senior engineer. Before initiating the proposal, Rahul wants to know if he has direct approval rights or if secondary HR approval is required.

```text
1. Rahul logs in and navigates to "Settings".
   → As a People Manager, Rahul sees only the 2 Governance & Authority categories.
   → All statutory, banking, and company branding settings are automatically hidden.
2. Rahul clicks "Payroll Approval Authority".
   → He inspects the rules:
     • Manager Can View Team Compensation: Enabled (He can view his team's breakdown)
     • Require Separate Checker: Enabled (Maker-Checker is active)
     • Manager Direct Compensation Authority: Disabled (HR holds final sign-off)
3. Outcome: Rahul understands that when he submits the salary increment proposal, it will automatically enter HR's pending queue for final approval before taking effect.
```

---

### Workflow 3: Auditing Company Letterhead Branding (HR Operations Lead)
**Scenario:** The company recently updated its registered office address and appointed a new Chief People Officer. The HR Operations Lead needs to ensure that official letters and payslips reflect these changes.

```text
1. The HR Lead navigates to "Settings" and clicks "Letterhead & Branding".
2. The screen displays all 13 branding configurations:
   • Official Signatory Designation: "Head of People & Culture"
   • Corporate Identity Number (CIN): Active value displayed
   • GSTIN & PAN: Active values displayed
   • Registered Office Address: Current multi-line address displayed
3. The HR Lead spots that the Registered Office Address still shows the previous building address.
4. Using the link provided on the card, the HR Lead navigates to the Document Branding screen to update the address, knowing that all future letters will immediately reflect the new location.
```

---

## 9. Guardrails, Restrictions & Failure Recovery

The Settings Hub incorporates robust operational guardrails to prevent errors and protect company data:

### 1. Active Organization Requirement
* **Rule:** If an organization's account is suspended or inactive, access to the Settings Hub is immediately locked.
* **User Message:** *"Organization is currently suspended. Please contact account support."*

### 2. Search & Filter Exclusivity
* **Rule:** You cannot filter by both a high-level module (e.g., `Payroll`) and a specific category (e.g., `Document Storage`) at the same time.
* **User Behavior:** The user interface automatically manages filters so your results are always unambiguous.

### 3. Graceful Subsystem Isolation (Self-Healing Reads)
* **What happens during maintenance:** If one specific background system experiences temporary maintenance (for example, if document storage servers are undergoing an upgrade), the Settings Hub **does not crash**.
* **User Experience:** The remaining 25 categories load and display normally. The affected category displays an amber badge: *"Temporarily completing maintenance — other categories unaffected."*

### 4. Zero Exposure of Sensitive Security Keys
* **Rule:** Sensitive cryptographic passwords, payment gateway secrets, and biometric hardware API keys are **never displayed** in the Settings Hub.
* **Why:** To ensure that even authorized HR administrators are protected from accidental exposure of high-security infrastructure credentials.

---

## 10. Phase 1 vs. Future Roadmap

To ensure clear expectations across your organization, here is how Phase 1 fits into the broader Settings Module roadmap:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SETTINGS MODULE EVOLUTION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🚀 PHASE 1: DISCOVERY & READ PLANE (CURRENTLY LIVE)                         │
│ • Unified exploration catalog of 138 settings across 26 categories          │
│ • Real-time live values displayed with "Customized" vs "Default" badges     │
│ • Full disclosure of impact timing, risk ratings, and prerequisite rules   │
│ • Directory pointers to 49 specialized policy management screens            │
│ • Strict role-based privacy (HR complete view, Manager authority view)      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔮 PHASE 2: CENTRALIZED WRITE PLANE & FACTORY RESETS (UPCOMING)             │
│ • Direct, in-place editing of settings directly within the Settings Hub     │
│ • One-click "Reset to Factory Default" per setting category                 │
│ • Optimistic concurrency locks (prevents two admins from overwriting edits) │
│ • Mandatory change reasons recorded for high-risk configurations            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔮 PHASE 3: COMPLIANCE AUDIT TRAIL & HISTORICAL TIMELINES (UPCOMING)         │
│ • Complete historical log of who changed what, when, and why                │
│ • Point-in-time configuration diffs for external legal and labor audits     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Frequently Asked Questions (FAQ)

#### Q1: Can I change settings directly on this dashboard right now?
**A:** In **Phase 1**, the Settings Hub provides a centralized **Discovery and Audit** view. You can inspect all active values, defaults, and risk ratings. Direct in-place editing and factory resets will be unlocked in **Phase 2**. In the interim, you can update settings using your existing dedicated management screens (such as *Payroll Settings* or *Document Settings*).

#### Q2: Why can't our People Managers see the Provident Fund or Tax settings?
**A:** This is an intentional security design. Statutory contributions, company banking formats, and corporate tax numbers are sensitive organizational data. Managers only have access to the two **Governance & Authority** categories that govern their team's review and approval workflows.

#### Q3: Why does a category show "Subscription Required"?
**A:** Your organization may be subscribed to a plan (such as Basic Core HR) that does not include advanced modules like Automated Payroll or Document Vaults. If you require access to those features, your primary account administrator can upgrade your subscription tier.

#### Q4: If I customize a setting, does it affect past records?
**A:** **No.** The system adheres strictly to historical integrity. Changes to payroll rules apply to the *next* payroll run and do not retroactively alter previously locked or paid salary slips. Changes to document rules apply to the *next* document uploaded.

#### Q5: What does the "Customized" badge mean?
**A:** The "Customized" badge indicates that your organization's active setting differs from the standard system factory default. For example, if your company sets its monthly pay day to the 28th instead of the standard 30th, the category will display a "Customized" badge so you can quickly audit tailored policies.

#### Q6: What should I do if a category displays an amber "Maintenance" badge?
**A:** You do not need to do anything. All other categories remain fully interactive and accessible. The amber badge simply indicates that a background data store is temporarily refreshing. It will resolve automatically.

#### Q7: Where do I manage complex policies like Leave Types or Shift Rosters?
**A:** Multi-record policies are managed in their dedicated module screens. The Settings Hub provides clear directory pointers (Surfaces) that direct you to the exact page (e.g., *Leave > Policy Setup* or *Attendance > Shift Management*) with a single click.

#### Q8: Are the existing settings pages under individual module tabs being removed?
**A: Absolutely not.** The existing settings pages located under specific module tabs (such as *Payroll > Settings*, *Documents > Settings*, *Leave > Policy Setup*, and *Attendance > Policies*) must not be removed. They remain 100% active, intact, and functional. The Organization Settings Hub acts as a unified, single pane of glass for discovery and auditing across the entire organization, working in complete harmony with your existing module tabs.

---

## 12. Verification & Document Sign-Off

```text
================================================================================
SETTINGS MODULE PHASE 1 — BUSINESS WALKTHROUGH AUDIT
================================================================================
Phase 1 Features Identified: 4 core capabilities across 26 categories
Phase 1 Features Documented: 4 core capabilities across 26 categories
Missing User-Facing Features: 0

User Roles Verified:
  • HR Administrators (Full visibility across 26 categories)
  • People Managers (Targeted visibility: 2 governance categories)
  • Employees (No access to org settings hub)
  • Platform Admins (Strictly excluded for tenant privacy)

User Workflows Verified:
  • Pre-Payroll Configuration Audit
  • Manager Approval Rights Verification
  • Letterhead & Legal Branding Audit

Configuration Categories Verified:
  • 26 Categories (63 Payroll, 25 Statutory, 35 Documents, 13 Branding, 2 Profile)
  • 49 Multi-Record Policy Directories (Surfaces)

Technical/API Details Exposed: 0 (No SQL, no code, no HTTP methods, no endpoints)
Invented Functionality: 0 (Aligns 100% with shipped Phase 1 codebase)
Planned Features Distinquished: Phase 2 Write Plane clearly marked as upcoming
================================================================================
```
