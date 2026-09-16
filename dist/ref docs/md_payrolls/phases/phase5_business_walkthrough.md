# Phase 5: Reimbursements, Benefits & Document Management — Business Walkthrough

This document provides a comprehensive, user-facing guide to **Phase 5 of the Payroll module**. It explains how the system manages employee out-of-pocket expense claims, multi-tier approval hierarchies, corporate group benefits, automated payroll deductions, secure cloud document storage, and annual Form 16 Part A tax certificate distribution.

This guide is designed for **HR Administrators**, **People Managers**, and **Employees**. It translates all underlying system capabilities into clear, role-based workflows, step-by-step instructions, status definitions, validation safeguards, real-world scenarios, and practical troubleshooting steps.

---

## 🚀 What Phase 5 Provides

Phase 5 completes the core HRMS Payroll suite by bridging the gap between everyday employee operational expenses, corporate insurance packages, and the monthly compensation payout cycle.

```
+---------------------------------------------------------------------------------------------------+
|                                   PHASE 5 PAYROLL SUITE OVERVIEW                                  |
+------------------------------------+----------------------------------+---------------------------+
| 1. EXPENSE REIMBURSEMENTS          | 2. GROUP BENEFITS & DEDUCTIONS   | 3. SECURE DOCUMENT VAULT  |
| * Multi-category expense catalog   | * Corporate health, life & perk  | * Bank-grade cloud storage|
| * Real-time budget headroom checks |   plans catalog                  | * Direct receipt uploads  |
| * Line-item receipts & merchant logs| * Individual & family floater   | * Expiring private links  |
| * Multi-level approvals (Mgr + HR) |   enrollment tracking            | * TRACES Form 16 Part A   |
| * Selective amount trimming        | * Flat monthly payroll deduction |   certificate distribution|
| * Automatic payroll payout inject  |   (Step 8a' of deduction engine) | * No unsafe file types    |
| * Off-cycle direct bank payouts    | * Employer contribution tracking |   (SVG/executables barred)|
+------------------------------------+----------------------------------+---------------------------+
```

### Key Business Capabilities

1. **Self-Service Reimbursement Claims:** Employees can check remaining category budgets in real time, draft claims, itemize expenses with merchant details, upload digitized receipts, and submit claims for review.
2. **Fair & Flexible Approval Hierarchy:** Multi-tier approval flows ensure manager visibility (Tier A) and HR governance (Tier C). Reviewers can approve, reject, or selectively trim claim lines when receipts only substantiate a partial amount.
3. **Out-of-Pocket Protection (Non-Taxable Reimbursements):** Approved expense reimbursements are paid out through monthly payroll. Non-taxable reimbursements do not inflate gross salary, retirement wages (PF/ESI), or income tax. Crucially, they are never seized or reduced by negative salary debt carry-forwards.
4. **Corporate Benefits & Insurance Administration:** HR can create health, life, and wellness plans with employee deductions and employer subsidies. Deductions automatically integrate into monthly payroll calculations without mid-month proration disputes.
5. **Secure Cloud Document Vault:** Eliminates insecure email attachments and server clutter. All sensitive proofs (medical bills, travel invoices, tax investments, signed Form 16 Part A PDFs) are stored privately with expiring view links.

---

## 🏢 1. HR & Finance Administration Workflows

HR Administrators manage company-wide financial policies, define expense categories and spending limits, perform final reimbursement audits, manage benefit enrollments, and publish official tax documents.

---

### 1.1 Managing Expense Reimbursement Categories

**What it is:** The master catalog where HR defines which expenses employees can claim, monetary caps, receipt obligations, and tax classifications.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Settings > Reimbursement Categories*.
* **Why it is useful:** Establishes firm corporate expense limits, prevents expense abuse, and ensures tax compliance between non-taxable business reimbursements and taxable perquisites.

#### Configuration Options & Inputs

| Field / Setting | Allowed Values / Input | Business Purpose |
| :--- | :--- | :--- |
| **Category Code** | Uppercase identifier (e.g., `TRAVEL`, `MOBILE`, `MEALS`) | Unique operational code used in reporting and payroll ledgers. |
| **Category Name** | Human-readable title (e.g., "Client Travel & Commute") | Displayed on the employee claim dropdown menu. |
| **Description** | Explanatory text | Informs employees what expenses qualify under this category. |
| **Taxability Classification** | `Non-Taxable` or `Taxable Perquisite` | **Non-Taxable:** Pure expense reimbursement (does not increase gross pay, PF, ESI, or TDS).<br>**Taxable:** Perquisite/benefit that attracts income tax and Professional Tax. |
| **Receipt Required** | `Yes` or `No` toggle | When enabled, employees cannot submit claims in this category without attaching a receipt document. |
| **Max Claim Amount** | Currency amount (or unlimited) | The maximum amount permitted on any single expense claim line item. |
| **Monthly Budget Cap** | Currency amount (or unlimited) | Maximum cumulative amount an employee can claim in this category in one calendar month. |
| **Annual Budget Cap** | Currency amount (or unlimited) | Maximum cumulative amount an employee can claim across the entire financial year. |
| **Active Status** | `Active` or `Inactive` toggle | Inactive categories cannot be selected for new employee claims. |

#### Step-by-Step Workflow

1. Click **"New Reimbursement Category"**.
2. Fill in the code, name, and operational guidelines.
3. Configure monetary ceilings (per-claim, monthly, and annual).
4. Set whether invoices/receipts are legally mandatory.
5. Save the category. It becomes immediately visible to employees on their expense portal.

> [!TIP]
> **Deactivating vs. Deleting:** The system does not allow deleting categories that have historical claims linked to them. If a policy changes (e.g., phasing out a home internet stipend), simply toggle the status to **Inactive**. Historical claims and audit trails remain intact.

---

### 1.2 Company-Wide Reimbursement Review & Approval Queue

**What it is:** The centralized audit dashboard where HR inspects claims across all departments, performs Level 2 final sign-offs, trims invalid amounts, schedules payouts into payroll runs, or executes direct bank payouts.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Reimbursements > Approval Queue*.

```
+---------------------------------------------------------------------------------------------------+
|                                 HR REIMBURSEMENT APPROVAL WORKFLOW                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ Submitted Claim ]                                                                              |
|           |                                                                                       |
|           v                                                                                       |
|  +---------------------+        Manager Rejects                                                   |
|  | Manager Review (L1) | ------------------------------+                                          |
|  +---------------------+                               |                                          |
|           |                                            |                                          |
|           | Manager Approves                           |                                          |
|           v                                            |                                          |
|  +---------------------+        HR Rejects             v                                          |
|  |   HR Review (L2)    | ---------------------> [ REJECTED ]                                      |
|  +---------------------+                         (Mandatory reason logged)                        |
|           |                                                                                       |
|           | HR Approves & Schedules Payout Month                                                  |
|           v                                                                                       |
|  +---------------------+                                                                          |
|  |     APPROVED        |                                                                          |
|  +---------------------+                                                                          |
|           |                                                                                       |
|           +---------------------------------+                                                     |
|           |                                 |                                                     |
|           | Scheduled into Payroll Run      | Off-Cycle Urgent Direct Bank Transfer               |
|           v                                 v                                                     |
|  +---------------------+           +---------------------+                                        |
|  | Monthly Payroll Run |           | Mark Paid Directly  |                                        |
|  | Calculated & Paid   |           | (Ref & Mode Logged) |                                        |
|  +---------------------+           +---------------------+                                        |
|           |                                 |                                                     |
|           +----------------> [ PAID ] <-----+                                                     |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

#### Step-by-Step Workflow

1. Open the **Reimbursements Queue**.
2. Filter by status:
   * `Submitted`: Claims submitted directly to HR (e.g., claims from Managers or employees without an assigned manager).
   * `Under Review`: Claims that have passed Level 1 Manager approval and await final HR sign-off.
3. Click on a claim to open the **Full Expense Audit Sheet**.
4. Inspect line items: dates, merchant names, claim descriptions, and click **"View Receipt"** to view attached proof in a secure viewer.
5. Choose from available actions:
   * **Approve in Full:** Approves the total claimed amount.
   * **Approve with Amount Trimming:** If a ₹5,000 hotel claim only has a valid bill for ₹4,200, HR adjusts the approved amount to ₹4,200. The employee receives ₹4,200, and the difference is documented.
   * **Schedule Payout Month:** HR confirms the target payroll month (e.g., `2026-10`). The system automatically defaults to the earliest open regular payroll run.
   * **Reject Claim:** HR provides a mandatory explanation (e.g., "Non-compliant expense under company travel policy"). The claim is marked `rejected`, and the employee is notified.
   * **Mark Paid Directly (Off-Cycle):** For urgent cash settlements or departing employees, HR marks the claim as paid outside payroll, recording the payment method (e.g., `Bank NEFT`, `UPI`, `Company Card`) and the bank transaction reference.

> [!NOTE]
> **No Self-Approval:** If an HR Administrator submits a personal expense claim, the system blocks them from approving their own claim. A separate HR peer or senior executive must approve it.

---

### 1.3 Configuring Corporate Benefit & Insurance Plans

**What it is:** The setup panel where HR configures group insurance, health coverages, retirement plans, and corporate perk programs.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Benefits > Plan Catalog*.
* **Why it is useful:** Automatically manages employee payroll deductions and employer subsidies for company-sponsored welfare packages.

#### Available Plan Types

* **Health Insurance (Group Mediclaim):** Hospitalization and medical treatment coverage.
* **Life Insurance (Group Term Life):** Financial security for employee beneficiaries.
* **Accidental Insurance:** Coverage for permanent disability or workplace accidents.
* **Wellness Programs:** Gym memberships, mental health subscriptions, preventative health checkups.
* **Retirement / NPS:** Voluntary corporate pension schemes.
* **Other Corporate Perks:** Transit passes, specialized equipment protection plans.

#### Required Plan Details

| Plan Parameter | Description |
| :--- | :--- |
| **Plan Code & Name** | Identifying code (e.g., `GMC-STAR-500K`) and label (e.g., "Star Health ₹5L Comprehensive"). |
| **Provider / Carrier** | Name of the insurance underwriter or provider (e.g., Star Health, HDFC ERGO). |
| **Policy Number** | Master corporate agreement/policy number. |
| **Employee Monthly Deduction** | Fixed monthly amount deducted from the employee's salary (Step 8a' of deduction waterfall). |
| **Employer Monthly Contribution**| Company-paid monthly premium (tracked as a company cost / CTC element, not deducted from net pay). |
| **Coverage Details** | Policy summary, cashless hospital networks, copay terms, and claim procedures. |

---

### 1.4 Managing Employee Benefit Enrollments

**What it is:** Linking individual employees to specific corporate benefit plans, recording covered dependents, and managing coverage lifecycles.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Benefits > Employee Enrollments*.

#### Step-by-Step Workflow

1. Navigate to **Benefit Enrollments** and click **"Enroll Employee"**.
2. Select the target employee and an active benefit plan.
3. Specify the **Coverage Tier**:
   * `Employee Only`
   * `Employee + Spouse`
   * `Employee + Children`
   * `Family Floater` (Employee + Spouse + Children)
   * `Other` (e.g., Dependent Parents)
4. Enter the employee's **Individual Member / Card ID** issued by the insurer.
5. Add **Dependent Details** (Full name, relationship, date of birth, government ID if required).
6. Set the **Coverage Start Date** (and optional **Coverage End Date**).
7. Save the enrollment.

```
+---------------------------------------------------------------------------------------------------+
|                            BENEFIT ENROLLMENT LIFECYCLE & PAYROLL                                 |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ Active Plan in Catalog ]                                                                       |
|              |                                                                                    |
|              v                                                                                    |
|  [ HR Enrolls Employee ] ----> Coverage Tier + Policy ID + Dependents Listed                      |
|              |                                                                                    |
|              v                                                                                    |
|  [ Monthly Payroll Run ] ----> Checks if enrollment is active on ANY day of the month             |
|              |                 (Strict Rule: Full monthly premium deducted; no proration)         |
|              v                                                                                    |
|  [ Step 8a' Deduction ] -----> Deducts employee premium from take-home pay                        |
|              |                 (Prioritized ahead of loan EMIs and discretionary recoveries)      |
|              v                                                                                    |
|  [ Enrollment Ending ] ------> HR sets termination date or cancels enrollment                     |
|                                (Deductions automatically halt starting next payroll month)        |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

#### Important Business Safeguards

* **Duplicate Enrollment Prevention:** The system enforces strict overlap validation. An employee cannot have two concurrent active enrollments in the same benefit plan during the same month.
* **No Mid-Month Proration (Standard Insurance Rule):** In accordance with corporate insurance industry standards, group insurance policies charge monthly premiums on a whole-month basis. If an employee's enrollment is active on even a single calendar day of a month (e.g., enrolled on the 28th), the full monthly premium is deducted during that month's payroll run.
* **Ending an Enrollment:** When an employee leaves a plan or opts out during annual renewal, HR updates the enrollment status to `cancelled` or sets an explicit end date. Deductions halt in the subsequent month.

---

### 1.5 Organization Settings for Benefits & Reimbursements

HR Administrators configure global toggles that dictate how Phase 5 features interact with the core calculation engine.

* **Where to access:** *Payroll > Settings > Payroll Preferences*.

1. **Enable Benefit Deductions (`benefit_deductions_enabled`):**
   * Default: `Off`.
   * When turned `On`, the calculation engine will scan active benefit enrollments and deduct employee premiums during payroll execution.
2. **Reimbursement Payout Lookahead Window (`reimbursement_payout_lookahead_months`):**
   * Default: `2 Months`.
   * Defines how far into the future the system looks when automatically scheduling approved reimbursement claims into an open payroll run. If the current month's payroll is already approved/locked, the claim automatically advances to the following month's open run.

---

### 1.6 Uploading Certified Form 16 Part A Certificates

**What it is:** Attaching the government-certified TRACES Form 16 Part A (containing quarterly tax deposit certificates) to an employee's finalized tax record.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Year End > Tax Certificates (Form 16)*.
* **Why it matters:** The system automatically generates Form 16 **Part B** (salary breakdown and deductions). However, Indian tax compliance requires Form 16 **Part A** to be downloaded directly from the government TRACES portal with certified cryptographically signed digital signatures. Phase 5 allows HR to upload Part A, creating a unified, complete Form 16 package for the employee.

#### Workflow

1. Download the quarterly-signed Part A PDF from the government TRACES portal.
2. In the HR portal, locate the employee under the finalized Financial Year.
3. Click **"Upload Form 16 Part A"**.
4. Select the official PDF file and upload.
5. The system binds the document to the employee's tax file. The employee can now download their complete Form 16 from their self-service portal.

---

## 👥 2. Manager Review & Approval Workflows

People Managers act as the front-line verification checkpoint for operational expenses incurred by their direct reporting teams.

---

### 2.1 Team Reimbursement Review Queue

**What it is:** A dedicated management queue displaying all pending reimbursement claims submitted by direct reports.

* **Who uses it:** People Managers with direct reports.
* **Where to access:** *Manager Portal > Team Expenses > Pending Approvals*.
* **Privacy & Boundaries:** Managers can **only** see claims submitted by their assigned subordinates. They have zero visibility into claims submitted by employees in other departments or peer managers.

```
+---------------------------------------------------------------------------------------------------+
|                                  MANAGER REVIEW ACTIONS & CONTROLS                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  TEAM CLAIM ARRIVES IN QUEUE                                                                      |
|  [ Employee Name | Claim Title | Expense Period | Total Amount | Receipt Count ]                  |
|                                                                                                   |
|  MANAGER OPENS CLAIM DETAILS:                                                                     |
|  * Item 1: Airfare (₹6,500) -> View Receipt -> Receipt matches travel policy                     |
|  * Item 2: Team Lunch (₹3,000) -> View Receipt -> Non-compliant alcoholic beverage included (₹800)|
|                                                                                                   |
|  AVAILABLE MANAGER DECISIONS:                                                                     |
|                                                                                                   |
|  1. FULL APPROVAL:                                                                                |
|     * Total ₹9,500 approved -> Moves to HR (Level 2)                                              |
|                                                                                                   |
|  2. SELECTIVE TRIMMING (PARTIAL APPROVAL):                                                        |
|     * Manager adjusts Item 2 approved amount from ₹3,000 down to ₹2,200                            |
|     * Enters review note: "Deducted ₹800 unapproved alcohol spend"                                |
|     * Total approved: ₹8,700 -> Moves to HR (Level 2)                                             |
|                                                                                                   |
|  3. COMPLETE REJECTION:                                                                           |
|     * Enters mandatory rejection note: "Travel not pre-approved by leadership"                    |
|     * Claim moves to REJECTED -> Process terminates                                               |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

### 2.2 Inspecting Expense Details & Proofs

Managers review each claim item before granting approval:
1. **Expense Date:** Verify that the expense occurred during an authorized project or trip.
2. **Category & Description:** Verify that the expense aligns with company guidelines (e.g., local taxi vs. personal travel).
3. **Merchant Details:** Confirm the vendor name and service rendered.
4. **Receipt Inspection:** Click **"View Document"** next to the line item. The system opens a secure, high-resolution preview of the receipt (JPEG, PNG, or PDF). Receipts are served through expiring secure links that protect against unauthorized access.

---

### 2.3 Manager Review Decisions

When reviewing a claim, managers have three distinct choices:

#### Choice 1: Level 1 Approval
* Used when all expense items and receipts comply with company travel and entertainment policies.
* Manager clicks **"Approve Claim"** and enters an optional approval remark.
* **What happens next:** The claim status advances to `under_review` (Level 1 Approved) and automatically routes to the HR Administrator queue for final financial audit and payout scheduling.

#### Choice 2: Partial Approval (Selective Line Trimming)
* Used when an expense is valid in principle, but the claimed amount exceeds authorized limits, includes non-reimbursable personal charges, or lacks full receipt support.
* The manager edits the approved amount for specific line items (e.g., reducing a ₹1,200 taxi claim to ₹800 because no receipt was attached for tolls).
* **Important Restriction:** Managers can only trim amounts *downward* (zero or lower than claimed). They cannot inflate claim amounts above what the employee originally requested.
* **What happens next:** The trimmed claim proceeds to HR with the manager's notes detailing the reduction.

#### Choice 3: Rejection
* Used when expenses violate policy, were not pre-authorized, or are deemed duplicate submissions.
* The manager clicks **"Reject Claim"** and **must enter a mandatory rejection reason**.
* **What happens next:** The claim transitions to `rejected`. The workflow terminates, budget headroom is released, and the employee receives the rejection notification with the manager's explanation.

---

### 2.4 Prevention of Self-Approval & Escalation

The system enforces strict anti-fraud governance:
* **Self-Approval Barred:** A manager cannot approve their own expense claim. If a manager submits a claim for their own travel, it bypasses their queue and routes directly to their direct superior (Senior Manager/Director) or HR Administration.
* **Orphaned Employee Claims:** If an employee has no assigned manager in the organizational directory, their claim is automatically normalized and assigned directly to HR for Level 1 & Level 2 consolidated approval.

---

### 2.5 Team Benefits & Emergency Policy Visibility

Managers can view corporate benefit enrollments for their direct team members (e.g., to look up medical insurance policy numbers during workplace accidents or family medical emergencies).

* **Where to access:** *Manager Portal > Team Benefits*.
* **Privacy Rule:** If company policy allows compensation visibility, managers see the monthly deduction amounts. If compensation visibility is turned off, monetary deduction amounts are automatically masked with asterisks (`****`), but the insurance provider, policy number, and emergency helpline details remain visible.

---

## 🧑‍💻 3. Employee Self-Service Workflows

Employees have full ownership of their expense claims and benefit visibility through a dedicated self-service hub.

---

### 3.1 Live Headroom & Budget Checker

**What it is:** A real-time calculator that shows employees how much budget they have left in each expense category before they spend money or submit a claim.

* **Where to access:** *My Expenses > Category Headroom*.
* **Why it is useful:** Prevents surprise rejections caused by exceeding monthly or annual spending allowances.

#### Information Displayed to the Employee

```
+---------------------------------------------------------------------------------------------------+
|                                  CATEGORY HEADROOM & BUDGET CHECK                                 |
+---------------------------------------------------------------------------------------------------+
|  Category: Client Travel & Commute (TRAVEL)                                                       |
|                                                                                                   |
|  * Maximum Allowed Per Claim:  ₹15,000.00                                                         |
|  * Monthly Budget:             ₹25,000.00  |  Spent / Claimed This Month:  ₹12,400.00             |
|  * Remaining Monthly Headroom: ₹12,600.00                                                         |
|                                                                                                   |
|  * Annual Financial Year Cap:  ₹150,000.00 |  Spent / Claimed This FY:     ₹45,000.00             |
|  * Remaining Annual Headroom:  ₹105,000.00                                                        |
|                                                                                                   |
|  Status: [ ELIGIBLE TO CLAIM UP TO ₹12,600.00 THIS MONTH ]                                        |
+---------------------------------------------------------------------------------------------------+
```

> [!NOTE]
> Headroom calculations automatically account for claims currently sitting in `submitted`, `under_review`, and `approved` states. You cannot bypass budget limits by submitting multiple claims simultaneously.

---

### 3.2 Creating & Authoring Expense Claims

Employees can organize multiple expense receipts into a single monthly or trip-based claim.

* **Where to access:** *My Expenses > New Expense Claim*.

#### Step-by-Step Workflow

1. Click **"New Expense Claim"**.
2. Enter a **Claim Title** (e.g., "Mumbai Client Demonstration - June 2026") and target **Expense Period** (e.g., `2026-06`).
3. Add general trip notes or purpose.
4. Click **"Add Expense Item"** for each individual expense:
   * **Category:** Select from the active category catalog.
   * **Expense Date:** The exact date the purchase occurred.
   * **Merchant Name:** Vendor or service provider (e.g., "IndiGo Airlines", "Uber", "Taj Hotels").
   * **Amount:** Numerical expenditure in local currency.
   * **Bill / Invoice Number:** Receipt identification number.
   * **Notes:** Specific business justification.
5. Save as **Draft**. The claim can be revisited, edited, and expanded over multiple days before final submission.

---

### 3.3 Uploading Receipts & Proof Documents

Receipts are uploaded directly from the browser to secure private storage.

* **Supported Formats:** PDF (`.pdf`), JPEG (`.jpg`, `.jpeg`), PNG (`.png`), and WebP (`.webp`).
* **Security Restriction:** Vector graphics (`.svg`) and executable files (`.exe`, `.bat`, `.sh`) are strictly blocked to protect the organization from malicious scripts.
* **Maximum File Size:** 10 MB per receipt document.

#### Upload Steps

1. On any claim line item, click **"Upload Receipt"**.
2. Drag and drop your receipt image or PDF file.
3. The browser uploads the document directly to cloud storage.
4. Once completed, a green checkmark appears indicating the receipt is linked.
5. You can click **"Preview"** at any time to verify document legibility.

---

### 3.4 Submitting Claims for Approval

Once all line items and mandatory receipts are attached:
1. Review the claim summary.
2. Click **"Submit Claim"**.
3. **Pre-Submission Validations:**
   * The claim must contain at least one line item.
   * The total claim amount must be greater than zero.
   * All line items belonging to categories requiring receipts must have an attached document.
   * The requested amounts must not exceed category limits or remaining headroom.
4. If validations pass, the claim status changes from `draft` to `submitted`.
5. The claim is locked from further employee edits and dispatched to the manager's review queue.

---

### 3.5 Tracking Claim Status & Scheduled Payout Dates

Employees can monitor the progress of their claims in real time:

* **Where to access:** *My Expenses > My Claims History*.

```
+---------------------------------------------------------------------------------------------------+
|                                 EMPLOYEE CLAIM TIMELINE VIEW                                      |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  CLAIM #CLM-2026-0042: "Bangalore Tech Conference" - Total: ₹8,500.00                             |
|                                                                                                   |
|  [x] 1. DRAFT CREATED          (June 10, 2026 - Saved by Employee)                                |
|  [x] 2. SUBMITTED              (June 12, 2026 - Dispatched to Manager)                            |
|  [x] 3. MANAGER APPROVED (L1)  (June 14, 2026 - Approved by A. Sharma; Trimmed to ₹8,200)         |
|  [x] 4. HR AUDITED & APPROVED  (June 16, 2026 - Approved by HR Finance)                           |
|      * Scheduled Payout Run:   June 2026 Regular Payroll                                          |
|      * Final Approved Amount:  ₹8,200.00                                                          |
|  [ ] 5. DISBURSED              (Pending June 30th Payroll Credit)                                 |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

### 3.6 Self-Cancellation Rights

If an employee makes a mistake, discovers an omitted receipt, or resolves an expense directly with a client, they can cancel their own claim under the following conditions:

* **Allowed Stages:**
  * While in `draft` status.
  * While in `submitted` status (awaiting manager review).
  * While in `under_review` status (even after the Manager has approved Level 1, provided HR has not granted final approval).
* **Prohibited Stages:** Once a claim is in `approved` or `paid` status, it cannot be cancelled by the employee.
* **Effect of Cancellation:** The claim transitions to `cancelled`, all budget headroom is restored, and the claim will not be processed for payment.

---

### 3.7 Viewing Group Benefits & Policy Cards

Employees can view their active company-provided insurance policies and wellness coverages.

* **Where to access:** *My Benefits > Active Coverages*.

#### Available Information
* **Plan Name & Provider:** Details of the underwriter (e.g., "Star Health Comprehensive").
* **Member / Card ID:** Individual insurance identification number for hospital admission.
* **Covered Dependents:** List of covered family members (Spouse, Children) with verified dates of birth.
* **Monthly Salary Impact:** Clear indication of:
  * Company Contribution: Paid by the employer on your behalf.
  * Employee Deduction: Exact monthly amount deducted on your payslip.
* **Policy Documents & Helplines:** Download links for policy terms and cashless claim forms.

---

### 3.8 Accessing Unified Form 16 (Part A & Part B)

At the end of the financial year, once HR has finalized year-end payroll and uploaded signed certificates:

* **Where to access:** *My Payroll > Form 16*.
* **What you can download:**
  * **Form 16 Part A:** Official government-certified quarterly tax deduction certificate from TRACES.
  * **Form 16 Part B:** Comprehensive company-issued salary, allowances, perquisites, and Chapter VI-A deduction breakdown.
* **Combined Download:** Employees can download both documents for filing their annual income tax returns (ITR).

---

## 📊 4. Status Life Cycle & Decision Matrix

---

### 4.1 Reimbursement Claim Status Life Cycle

```
                       +-------------------+
                       |       DRAFT       | <---+ (Created by Employee)
                       +-------------------+     |
                         |               |       |
      (Employee Submits) |               | (Employee Cancels)
                         v               v
               +---------------+   +-----------+
               |   SUBMITTED   |   | CANCELLED |
               +---------------+   +-----------+
                 |       |           ^
(Mgr L1 Approves)|       | (Mgr/HR   | (Employee Cancels
                 |       |  Rejects) |  before HR sign-off)
                 v       |           |
            +----------+ |           |
            |  UNDER   | |           |
            |  REVIEW  | |           |
            +----------+ |           |
                 |       |           |
 (HR L2 Approves)|       +-----+     |
                 v             v     |
           +----------+      +----------+
           | APPROVED |      | REJECTED |
           +----------+      +----------+
                 |
                 | (Payroll Run Approved OR Direct Payment Executed)
                 v
             +------+
             | PAID |
             +------+
```

| Status Badge | Meaning | Who Moves It Here | Next Possible Actions |
| :--- | :--- | :--- | :--- |
| `draft` | Claim is being prepared by the employee. Not visible to reviewers. | Employee | Edit items, upload receipts, submit, or delete. |
| `submitted` | Dispatched by employee. Awaiting Level 1 Manager review. | Employee | Manager can approve or reject. Employee can cancel. |
| `under_review` | Level 1 Manager approved. Awaiting Level 2 final HR review. | Manager | HR can approve or reject. Employee can cancel. |
| `approved` | Fully audited and approved. Scheduled into a payroll run. | HR Administrator | Locked. Will be marked `paid` during payroll or direct payout. |
| `rejected` | Declined by Manager or HR. Reason recorded. | Manager or HR | Process terminated. Headroom budget released. |
| `paid` | Money disbursed to employee (via payroll or direct transfer). | Core Payroll Engine or HR | Permanent terminal state. Cannot be changed. |
| `cancelled` | Withdrawn by employee prior to final HR approval. | Employee | Permanent terminal state. Headroom budget released. |

---

### 4.2 Benefit Enrollment Status Life Cycle

| Status | Meaning | Payroll Impact |
| :--- | :--- | :--- |
| `active` | Enrollment is currently valid. Covered dependents are active. | Monthly premium is automatically deducted in Step 8a' of payroll. |
| `cancelled` | Enrollment was manually ended or voided by HR. | Deductions cease immediately in the next payroll calculation. |
| `expired` | The enrollment's coverage end date has elapsed. | Deductions automatically stop. No historical records are altered. |

---

### 4.3 Role-Based Permission Matrix

| Operational Capability | Employee | People Manager | HR Administrator |
| :--- | :---: | :---: | :---: |
| Check Category Budget Headroom | Yes (Self) | Yes (Self) | Yes (All Employees) |
| Create, Edit & Cancel Draft Claims | Yes (Self) | Yes (Self) | Yes (Self) |
| Upload / Preview Receipts | Yes (Self) | Yes (Team Claims) | Yes (All Claims) |
| Submit Claim for Review | Yes (Self) | Yes (Self) | Yes (Self) |
| Level 1 Review (Approve / Trim / Reject) | No | Yes (Direct Reports Only) | Yes (Override / Direct) |
| Level 2 Final Audit & Payout Scheduling | No | No | Yes (All Organization) |
| Execute Direct Off-Cycle Payout | No | No | Yes |
| Manage Reimbursement Categories & Caps | No | No | Yes |
| Create Corporate Benefit Plans | No | No | Yes |
| Enroll / Terminate Employee Benefits | No | No | Yes |
| View Team Benefit Coverages | No | Yes (Direct Reports Only) | Yes (All Employees) |
| View Masked vs. Unmasked Deductions | Self Only | Policy Dependent | Full Visibility |
| Upload Form 16 Part A Certificates | No | No | Yes |
| Download Form 16 Part A & Part B | Yes (Self) | Yes (Self) | Yes (All Employees) |

---

## ⚙️ 5. Payroll Engine Integration & The Deduction Waterfall

Phase 5 integrates with the 9-step calculation engine established across Phases 1 through 4.

```
+---------------------------------------------------------------------------------------------------+
|                            THE 9-STEP PAYROLL CALCULATION WATERFALL                               |
+---------------------------------------------------------------------------------------------------+
|  STEP 1: Base Salary Proration (Calendar days, attendance, and unpaid leave)                      |
|  STEP 2: Recurring Statutory & Fixed Allowances (HRA, Special Allowance, DA)                      |
|  STEP 3: Gross Salary Aggregation                                                                 |
|  STEP 4: Statutory Wage Ceilings & Withholdings (PF Employee 12%, ESI 0.75%, Professional Tax)     |
|  STEP 5: Annual Taxable Income Projection (Tax Regimes, Standard Deduction, Verified Chapter VI-A)|
|  STEP 6: Monthly Income Tax (TDS) Withholding                                                     |
|  STEP 7: Variable Pay Injections (Phase 3 performance bonuses, spot awards, incentives)           |
|                                                                                                   |
|  STEP 8: THE DEDUCTIONS WATERFALL                                                                 |
|     * 8a: Statutory Deductions (PF + ESI + PT + Monthly TDS)                                      |
|     * 8a': [PHASE 5] CORPORATE BENEFIT DEDUCTIONS (Health, Life & Wellness employee premiums)     |
|     * 8b: [PHASE 3] Loan EMIs & Salary Advance Recoveries                                         |
|     * 8c: [PHASE 3] Ad-hoc Discretionary Deductions & Asset Damage Recoveries                     |
|     * 8d: [PHASE 3] Negative Net Shortfall Carry-Forward Recoveries                               |
|                                                                                                   |
|  NEGATIVE-NET CLAMP: Net pay is evaluated. If deductions exceed earnings, net is clamped to ₹0.00|
|                      and shortfall carries forward into next month.                               |
|                                                                                                   |
|  STEP 8f: [PHASE 5] NON-TAXABLE EXPENSE REIMBURSEMENTS (Added AFTER clamp!)                       |
|     * Travel, client meals, internet stipends, and mobile expense claims                          |
|                                                                                                   |
|  STEP 9: FINAL NET DISBURSED PAY (Gross Pay - Total Deductions + Reimbursements)                  |
+---------------------------------------------------------------------------------------------------+
```

---

### 5.1 Why Non-Taxable Reimbursements Are Never Swallowed (Step 8f)

A cornerstone of Indian labor law and accounting practice is the distinction between **Earnings** and **Reimbursements of Out-of-Pocket Expenses**:
* An employee who spends ₹5,000 of their personal money on an authorized company flight is **lending money to the company**.
* If that employee takes significant unpaid leave during the month, resulting in low salary or even a negative salary shortfall (where deductions exceed pay), the company cannot confiscate the employee's travel reimbursement to offset that salary shortfall.
* **The Solution in Phase 5:** Non-taxable reimbursements are injected into net pay at **Step 8f**, which occurs **after** the negative net clamp. If an employee's calculated salary is ₹0.00, but they have ₹5,000 in approved travel claims, their final payslip will disburse exactly **₹5,000.00**.

---

### 5.2 Benefit Deductions in the Deduction Hierarchy (Step 8a')

Corporate insurance premiums are categorized as vital welfare withholdings. Consequently, in the deduction waterfall:
* Benefit deductions are processed at **Step 8a'**, immediately following statutory taxes (PF, ESI, TDS) and **ahead of** loan repayments (Step 8b) or ad-hoc company recoveries (Step 8c).
* This ensures that an employee's health and life insurance policies remain active and funded before loan repayments are extracted.

---

### 5.3 Automated Run Transitions & Rollback Protection

When a scheduled payroll run is processed:
1. **Calculation Run:** The engine locates all claims in `approved` status marked for that payout month and reflects them as non-taxable additions on draft payslips.
2. **Payroll Approval / Lock:** When HR approves the monthly payroll run, the system marks all included reimbursement claims as `paid` and links them to the approved run ID.
3. **Rollback Safeguard:** If HR recalculates or cancels a draft payroll run prior to final approval, the included reimbursement claims automatically revert to `approved` status. They are never lost, duplicated, or prematurely marked as paid.

---

## 🔄 6. End-to-End Real-World Scenarios

---

### Scenario A: The Multi-City Client Roadshow

**The Situation:** Rajesh, a Senior Solutions Architect, travels between client sites in Mumbai and Pune. He incurs hotel charges, flight fares, client business lunches, and local taxi fares totaling ₹24,500.

#### Step 1: Headroom Check (Employee)
Rajesh navigates to *My Expenses > Category Headroom*. He checks the `TRAVEL` category.
* Monthly Limit: ₹30,000.
* Previous claims this month: ₹0.
* Result: Headroom is fully available for his planned ₹24,500 claim.

#### Step 2: Drafting & Uploading (Employee)
Rajesh creates a claim titled "Western Region Client Demos - June 2026":
* Item 1: Mumbai to Pune Airfare (₹7,500) — Uploads airline invoice PDF.
* Item 2: Hotel Residency 2 Nights (₹12,000) — Uploads hotel bill JPEG.
* Item 3: Client Dinner (₹3,500) — Uploads restaurant invoice PNG.
* Item 4: Local Taxi Auto (₹1,500) — Handwritten receipt attached.

#### Step 3: Submission & Manager Review (Manager)
Rajesh submits the claim. It arrives in the approval queue of his manager, Anita.
* Anita reviews the receipts. Items 1, 2, and 4 comply with travel guidelines.
* On Item 3 (Client Dinner), Anita notices a ₹1,000 non-reimbursable personal expense itemized on the bill.
* Anita uses the **Trim Amount** feature to adjust Item 3 from ₹3,500 down to ₹2,500.
* She enters a note: "Approved dinner minus ₹1,000 personal spend. Total approved: ₹23,500."
* She clicks **Approve**. The claim advances to `under_review`.

#### Step 4: Final Audit & Scheduling (HR Finance)
The claim enters HR Finance Administrator Vikram's queue.
* Vikram verifies company tax compliance and approves the claim.
* The system schedules payout for the upcoming **June 2026 Regular Payroll Run**.
* The claim moves to `approved`.

#### Step 5: Monthly Payroll Execution (Engine)
On June 28th, HR runs June Payroll.
* Rajesh's gross earnings: ₹100,000.
* Statutory withholdings & taxes: ₹18,000.
* Step 8f Injection: +₹23,500 (Non-Taxable Reimbursement).
* Final Take-Home Pay: ₹105,500.
* His payslip clearly itemizes: "Travel Reimbursements: ₹23,500 (Non-Taxable)".
* Upon payroll approval, the claim moves to `paid`.

---

### Scenario B: Claim Submitted into a Closed Payroll Month

**The Situation:** On July 2nd, Priya submits an internet stipend claim of ₹1,500 for the period of June. However, HR has already approved and locked the June payroll run on June 30th.

```
+---------------------------------------------------------------------------------------------------+
|                        LOOKAHEAD SCHEDULING INTO NEXT OPEN RUN                                    |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ Employee Submits June Claim on July 2nd ]                                                      |
|                      |                                                                            |
|                      v                                                                            |
|  [ System Checks June Payroll Status ]                                                            |
|      * Status: APPROVED / LOCKED -> Cannot inject new expenses into closed run                    |
|                      |                                                                            |
|                      v                                                                            |
|  [ Payout Lookahead Engine Evaluates Next Available Month ]                                       |
|      * Lookahead Limit: 2 Months                                                                  |
|      * Evaluates July Payroll Run -> Status: OPEN / DRAFT                                         |
|                      |                                                                            |
|                      v                                                                            |
|  [ Claim Payout Scheduled for July Payroll Run ]                                                  |
|      * Result: Employee receives ₹1,500 in July payslip without administrative friction           |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

### Scenario C: Mid-Month Group Medical Insurance Enrollment

**The Situation:** An employee, Siddharth, enrolls in the company's "Star Health Family Floater" plan on October 18th to cover himself and his spouse.

1. **HR Enrollment:** HR sets up the enrollment with policy number `STAR-FF-9942`, coverage tier `Employee + Spouse`, and effective date `2026-10-18`.
2. **Plan Terms:** Employee deduction: ₹1,800/month. Employer contribution: ₹3,200/month.
3. **No Mid-Month Proration:** Because the enrollment was active during October (even though started mid-month), the October payroll run deducts the full monthly premium of ₹1,800 under Step 8a'.
4. **CTC Impact:** The company's ₹3,200 subsidy is recorded on the corporate benefits ledger as a cost-to-company item and does not reduce Siddharth's take-home pay.
5. **Payslip Itemization:** Siddharth's October payslip shows: "Group Health Mediclaim: ₹1,800.00" under Deductions.

---

### Scenario D: Salary Shortfall & Out-of-Pocket Reimbursement Protection

**The Situation:** An employee takes 25 days of unpaid leave (Loss of Pay - LOP) due to personal reasons. Their gross earnings for the month drop to ₹5,000. However, they have a ₹6,000 loan EMI scheduled, plus ₹1,200 in statutory deductions. Additionally, they have an approved business travel reimbursement of ₹8,000.

1. **Earnings:** Base gross pay = ₹5,000.
2. **Deductions:** Statutory (₹1,200) + Loan EMI (₹6,000) = ₹7,200.
3. **Calculated Salary:** ₹5,000 − ₹7,200 = −₹2,200 (Negative Net Pay).
4. **Loan Engine Handling:** The loan EMI is skipped because net pay is insufficient, leaving deductions at ₹1,200.
5. **Net Pay Clamp:** If an asset recovery deduction of ₹4,500 is applied, total deductions (₹5,700) exceed gross (₹5,000), yielding −₹700. The engine clamps net salary to **₹0.00**, carrying forward the ₹700 shortfall to next month.
6. **Step 8f Reimbursement Addition:** The approved ₹8,000 travel reimbursement is added **after** the clamp.
7. **Final Payout:** The employee receives a payslip with **₹8,000.00 net pay**. The employee's personal out-of-pocket money is not used to offset their salary deficit.

---

### Scenario E: Resignation & Off-Cycle Direct Payout

**The Situation:** Deepa resigns and her last working day is July 10th. She has an approved relocation expense claim of ₹15,000. The July payroll run will not be finalized until July 31st, but her full-and-final settlement must be closed today.

1. HR opens Deepa's approved claim in the queue.
2. Instead of waiting for the monthly payroll run, HR clicks **"Mark Paid Directly (Off-Cycle)"**.
3. HR inputs:
   * Payment Mode: `Bank NEFT Transfer`.
   * Transaction Reference: `NEFT-HDFC-994827104`.
4. The system transitions the claim status directly to `paid`.
5. When July payroll is calculated on July 31st, the engine detects that this claim is already marked `paid` and does not duplicate the payout on the payslip.

---

## 🛡️ 7. User-Facing Validations & Error Handling

The following table explains common errors users may encounter, why they occur, and the concrete steps to resolve them.

| Message / Error Encountered | Why It Occurred | How to Resolve |
| :--- | :--- | :--- |
| **"Category Monthly Budget Exceeded"** | The claim amount exceeds the employee's remaining monthly headroom for this category. | Check *Category Headroom* to see current usage. Reduce the claim amount or obtain an HR limit exception. |
| **"Receipt Document Mandatory"** | The selected expense category has the *Receipt Required* policy enabled, but no receipt was attached. | Upload a legible PDF, JPEG, or PNG receipt before submitting the claim. |
| **"Disallowed File Type (SVG / Executable)"** | The user attempted to upload an unapproved file format (e.g., `.svg`, `.exe`, `.zip`). | Convert the receipt or document to standard PDF, JPEG, PNG, or WebP format and re-upload. |
| **"File Size Exceeds 10 MB"** | The uploaded scan or PDF file is larger than the 10 MB system threshold. | Compress the image or PDF using a document compression tool and re-upload. |
| **"Self-Approval Forbidden"** | A manager or HR administrator attempted to approve an expense claim where they are listed as the claimant. | Personal claims must be reviewed and approved by an independent manager or peer HR administrator. |
| **"Concurrent Enrollment Overlap"** | HR attempted to enroll an employee into a benefit plan that overlaps with an existing active enrollment in the same plan. | Terminate or end-date the existing enrollment before creating a new enrollment in that plan. |
| **"Cannot Cancel Approved Claim"** | An employee attempted to cancel a claim that has already received final approval or been marked paid. | Contact HR Administration. Approved claims can only be adjusted or reversed by HR through payroll revisions. |
| **"No Open Payroll Run in Lookahead"** | HR approved a claim, but all upcoming payroll runs within the lookahead window are closed or locked. | Open the next upcoming monthly payroll run or disburse the claim using *Mark Paid Directly*. |

---

## ❓ 8. Frequently Asked Questions (FAQ)

---

### Questions from Employees

#### Q: How quickly will I receive my money after my expense claim is approved?
**A:** Approved non-taxable expense reimbursements are bundled into your regular monthly paycheck and credited on company payday. If you submit and receive approval before monthly payroll cutoff (typically the 20th–25th of the month), it will appear on your current month's payslip. If approved after cutoff, it will be paid in the following month's paycheck.

#### Q: What happens if I lose a paper receipt for a business expense?
**A:** If the category has a mandatory receipt policy, the system will not allow submission without an attached file. You should discuss the missing receipt with your manager. If authorized under company policy, your manager or HR can advise whether an affidavit or bank transaction statement is acceptable as supporting documentation.

#### Q: Can my manager reduce the amount of my claim?
**A:** Yes. If an itemized expense is partially non-compliant (e.g., hotel bill includes personal laundry or minibar charges), your manager or HR reviewer can adjust the approved amount downward. When this occurs, the reviewer is required to log an explanatory note detailing the adjustment.

#### Q: Why can't I see my insurance deduction on my payslip if I enrolled yesterday?
**A:** If the current month's payroll run has already been locked or paid by HR, new enrollments take effect in the next open payroll run. Check with HR to confirm the effective start date of your enrollment.

---

### Questions from Managers

#### Q: Can I approve an expense claim for an employee who temporarily worked on my project but reports to another manager?
**A:** No. To prevent unauthorized spending, the system enforces reporting-line boundaries. Only the employee's assigned line manager in the organizational directory can review and approve their claims. If an employee needs to claim project expenses against your budget, their primary manager must perform the Level 1 review, or HR can handle the approval.

#### Q: What should I do if a team member's claim looks suspicious or fraudulent?
**A:** Do not approve the claim. Click **Reject**, select or enter the policy violation details in the mandatory notes field, and submit. The claim will be permanently marked `rejected`, and the employee will receive your written feedback.

#### Q: If I reject an expense claim, can the employee fix the mistake and resubmit?
**A:** A rejected claim cannot be re-opened. However, the employee's category headroom budget is immediately restored upon rejection. The employee can create a fresh claim with corrected receipts and submit it for review.

---

### Questions from HR Administrators

#### Q: Are corporate health insurance employer contributions taxable to the employee?
**A:** Under standard statutory rules, employer group mediclaim premium contributions are considered business welfare expenditures and do not represent a taxable perquisite for the employee. The system tracks employer contributions on the corporate benefits ledger without adding them to employee taxable gross earnings.

#### Q: What happens if an employee covered by health insurance leaves the company mid-month?
**A:** Set the coverage end date on their enrollment record to their last working day. Under standard insurance rules, the full month's premium is deducted in their final exit payroll run. Deductions will not occur in any subsequent periods.

#### Q: Can we pay an employee's reimbursement outside payroll if they need immediate cash?
**A:** Yes. Open the approved claim and use the **"Mark Paid Directly (Off-Cycle)"** option. Enter the bank transfer reference and payment method. The claim is immediately stamped as `paid`, and the payroll engine will know not to duplicate the payout during the monthly salary run.

#### Q: Can we configure some reimbursement categories as taxable?
**A:** Yes. In the category configuration, toggle the taxability setting to **Taxable Perquisite**. When claims in this category are approved and processed, the payroll engine adds the amount to taxable gross earnings, subjecting it to appropriate Income Tax (TDS) and Professional Tax calculations while keeping it excluded from retirement PF/ESI wages.
