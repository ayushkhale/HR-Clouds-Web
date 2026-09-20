# Phase 7: Automation, Corrections (Arrears · Off-Cycle · F&F) & Hardening — Business Walkthrough

This document provides a comprehensive, user-facing guide to **Phase 7 of the Payroll module**. It explains how the HRMS platform manages the complex, real-world events that occur during month-end payroll operations: **Employee Separations and Full & Final (F&F) Settlements**, **Retroactive Corrections and Salary Arrears**, **Comp-Off and Leave Encashments**, **Off-Cycle and Supplementary Payroll Disbursements**, **Advanced Tax Treatments (Perquisites and Medical Relief)**, and **Automated Payroll Calendar Operations**.

This guide is written specifically for **HR Administrators**, **People Managers**, and **Employees**. It translates underlying system intelligence into practical, role-based workflows, step-by-step instructions, business validations, error safeguards, real-world scenarios, and answers to common operational questions.

---

## 🚀 What Phase 7 Provides

Phases 1 through 6 created a robust payroll engine capable of calculating, auditing, and delivering regular monthly compensation. Phase 7 hardens and expands the system so it can handle corrections, unexpected changes, and separations without recalculating closed historical periods or compromising statutory accuracy.

```
+-------------------------------------------------------------------------------------------------------+
|                                    PHASE 7 PAYROLL SUITE OVERVIEW                                     |
+------------------------------------+----------------------------------+-------------------------------+
| 1. EXITS & FULL & FINAL (F&F)      | 2. RETROACTIVE ARREARS & DRIFT   | 3. COMP-OFF & LEAVE CASH-OUT  |
| • Dedicated exit tracking (LWD)    | • Automatic drift detection      | • Comp-off encashment cash-out|
| • Automated notice recovery math   | • Frozen-policy recalculation    | • Dual-debit time-off guard   |
| • Automatic leave balance cash-out | • Earning-line delta generation  | • Unutilized earned leave F&F |
| • Integrated loan foreclosure      | • Full-reversal safety brake     | • Configurable pay rate bases |
| • Isolated F&F settlement runs     | • Zero-touch next-month settlement| • Multi-year balance routing  |
+------------------------------------+----------------------------------+-------------------------------+
| 4. OFF-CYCLE & SUPPLEMENTARY RUNS  | 5. ADVANCED TAX PERQUISITES & 80D| 6. CALENDAR AUTOMATION & CRONS|
| • Mid-month supplementary payouts  | • Taxable employer health perks  | • Attendance cut-off reminders|
| • Base salary & LOP suppression    | • Automated Section 80D credit   | • Pay-day pending run alerts  |
| • Same-period statutory netting    | • Transparent taxable earnings   | • Automatic draft run creation|
| • Anti-double-payment protection   | • Old vs. New regime alignment   | • Stale calculation recovery  |
| • Cross-run combined statements    | • Form 16 Part B synchronisation | • Document retention clean-up |
+------------------------------------+----------------------------------+-------------------------------+
```

### Key Business Capabilities

1. **First-Class Employee Separation Management:** HR can officially record resignations, terminations, retirements, or contract completions with a binding Last Working Day (LWD). This automatically eliminates recurring payroll calculation warnings for departing staff.
2. **Automated Full & Final (F&F) Settlement:** A single preparation step evaluates notice shortfall deductions, leave balance encashments, and outstanding company loan foreclosures. It freezes the settlement plan with a complete audit trail and true reset capability.
3. **Audit-Proof Retroactive Arrears:** If an employee's attendance is regularized late, a leave request is approved after payroll closed, or a salary increment is backdated, the system computes the exact earnings drift. It schedules the difference as an arrear adjustment in the next open payroll without modifying closed historical records.
4. **Comp-Off & Leave Encashment with Double-Spend Protection:** Employees can receive cash for unutilized compensatory off days or leave balances. The system enforces an atomic dual-debit guarantee: the comp-off record is marked as cashed out and the leave wallet is reduced simultaneously, ensuring a day of leave cannot be taken as time off and collected as cash.
5. **Off-Cycle Payouts with Same-Period Statutory Netting:** HR can issue mid-month bonus disbursements or executive settlements without paying base monthly salary twice. Statutory deductions (Provident Fund, ESI, Professional Tax, and TDS) are calculated across cumulative monthly earnings and netted against prior runs so employees pay the correct tax bracket and statutory limits without over-deduction.
6. **Executive Tax Perquisites & Automated Section 80D Relief:** Employer-provided wellness subsidies can be classified as taxable perquisites, elevating taxable income without distorting retirement wage bases. Qualifying employee medical insurance deductions are automatically credited to Section 80D under the Old Tax Regime.
7. **Proactive Payroll Calendar Automation:** Automated schedulers send reminder notifications for attendance cut-offs, unapproved paydays, and tax declaration milestones, while background sweepers recover crashed calculations and purge expired temporary files.

---

## 🏢 1. HR & Finance Administration Workflows

HR Administrators oversee financial governance, configure organizational policies, execute employee settlements, reconcile salary drift, and manage automated operations.

---

### 1.1 Managing Employee Exits & Separation Records

**What it is:** The official administrative record documenting an employee's separation from the organization, establishing their binding **Last Working Day (LWD)** and notice obligations.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Exits & Separations*.
* **Why it is useful:** Solves the historical problem where departing employees repeatedly triggered "Missing Exit Date" payroll errors. Establishes legal notice period accountability and determines the exact boundary date for salary and encashment proration.

#### Separation Data Inputs

| Field / Parameter | Required / Optional | Business Purpose |
| :--- | :--- | :--- |
| **Employee** | Required | The active employee departing the organization. |
| **Separation Type** | Required | Nature of departure: `Resignation`, `Termination`, `Retirement`, `End of Contract`, `Death`, or `Absconding`. |
| **Last Working Day (LWD)** | Required | The final official date of employment. Drives attendance window clamping, leave balance evaluation, and settlement timing. |
| **Resignation Date** | Optional | The date the employee formally tendered resignation. Must be on or before the Last Working Day. |
| **Notice Period Required (Days)** | Required | Contractual notice duration. Defaults automatically from company policy settings (e.g., 30, 60, or 90 days). |
| **Notice Period Served (Days)** | Required | Actual working days served during the notice window. Defaults to 0 until confirmed. |
| **Notice Recovery Waived?** | Required | Toggle switch. If enabled, the organization waives financial penalty for unserved notice days. |
| **Notice Shortfall Override (Days)** | Optional | Discretionary HR adjustment to increase or decrease the unserved shortfall days. |
| **Exit Reason / Remarks** | Optional | Internal operational documentation explaining the departure circumstances. |

#### Separation Actions & Workflows

```
  [Record Exit] ---------> Status: RECORDED
                                |
             +------------------+------------------+
             |                                     |
             v                                     v
     [Prepare Settlement]                   [Correct Details]
             |                                     |
             v                                     +--> (Updates LWD, notice, reason)
      Status: PREPARED
             |
             +------------------+------------------+
             |                                     |
             v                                     v
     [Final Settlement Run Paid]            [Reset Settlement]
             |                                     |
             v                                     v
      Status: SETTLED                       Status: RECORDED
```

1. **Recording an Exit:** HR submits the departure details. The system creates an exit record in `Recorded` status.
   * **System Impact:** The recurring monthly "Missing Exit Date" calculation block for this employee is permanently cleared. For payroll months beginning after the LWD, the employee automatically drops out of population aggregation.
2. **Correcting Exit Details:** HR can adjust the Last Working Day, served days, waiver status, or exit reason while in `Recorded` status.
   * **Guardrail:** If the settlement has already been prepared, corrections are blocked. HR must reset the settlement first to ensure financial calculations match the updated dates.
3. **Cancelling an Exit:** If a departing employee withdraws their resignation or is reinstated, HR can cancel the separation record with a mandatory justification remark.
   * **Guardrail:** An exit cannot be cancelled if it has already been settled through an approved or paid payroll run.

---

### 1.2 Preparing Full & Final (F&F) Settlements

**What it is:** The financial settlement engine that calculates all exit obligations—recovering unserved notice debt, encashing unutilized leave balances, and foreclosing outstanding company loans—consolidating them into approved variable pay items for payout.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Exits & Separations > [Select Exit Record] > Settlement*.
* **Why it is useful:** Replaces manual spreadsheet calculations with an automated, policy-driven computation that synchronizes leave wallets, loan ledgers, and salary adjustments.

#### Step-by-Step Settlement Workflow

##### Step 1: Pre-Flight Settlement Preview (Read-Only)
Before committing financial adjustments, HR opens the **Settlement Preview**. The system performs a live simulation and displays:
* **Notice Shortfall Assessment:** Calculates unserved days:
  $$\text{Shortfall Days} = \text{Notice Required} - \text{Notice Served}$$
  If waived, shortfall is ₹0. Otherwise, it calculates the recovery rate based on the employee's approved salary structure (e.g., Basic / 30) and displays the proposed deduction amount.
* **Eligible Leave Encashment:** Inspects organizational encashment policy. For each eligible leave type (e.g., Earned Leave, Privilege Leave), it reads the real-time available balance, applies organizational maximum encashment caps, computes daily rate value, and calculates the cash payout.
* **Loan Balances & Foreclosure:** Detects any active company loans. Displays total outstanding principal, cancels upcoming monthly interest, and identifies the lump-sum recovery amount.
* **Net Projected Settlement:** Summarizes total additions (encashments) versus total recoveries (notice deficit and loan balance).

##### Step 2: Preparing the Settlement (Idempotent Commit)
HR selects the target settlement payroll month and clicks **"Prepare Settlement"**.
* **System Actions:**
  1. Creates an approved deduction adjustment for Notice Recovery (`category: recovery`).
  2. Creates approved earning encashment records for eligible leave balances and deducts the corresponding days from the employee's active leave wallet.
  3. Executes loan foreclosure, cancelling future monthly installments and creating an approved loan recovery adjustment for the outstanding principal.
  4. Transitions exit record status to `Prepared`.
* **Idempotency Guarantee:** If HR clicks "Prepare Settlement" multiple times or refreshes during network latency, the system recognizes the existing prepared plan and returns it safely without duplicating adjustments, leave debits, or loan recoveries.

##### Step 3: Resetting a Prepared Settlement
If a separation date is renegotiated or an error is discovered prior to payroll approval, HR clicks **"Reset Settlement"** with a mandatory cancellation remark.
* **System Actions:**
  * Cancels the notice recovery and loan recovery adjustments.
  * Reverses leave encashments, restoring deducted days back to the employee's leave balance wallet.
  * Re-arms cancelled loan installments back to active status.
  * Transitions exit record status back to `Recorded`.
* **Guardrail:** Reset is refused if any prepared adjustment has already been committed to an approved or paid payroll run.

---

### 1.3 Executing a Final Settlement Payroll Run

**What it is:** Running a dedicated payroll execution specifically for separated staff to disburse their final compensation and payslip.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Runs > Create Run*.
* **Workflow:**
  1. HR creates a new run, selecting **Run Type: Final Settlement**.
  2. HR designates the target settlement month and provides the specific exiting Employee ID(s).
  3. The system verifies that the target month matches the month selected during settlement preparation.
  4. HR triggers calculation. The engine incorporates:
     * Prorated base earnings up to the Last Working Day.
     * All prepared settlement items (leave encashment earnings, notice deductions, loan recovery).
     * Any unpaid expense reimbursements or monthly deductions.
  5. HR reviews the comprehensive payroll preview, checks net take-home pay, and executes **Approve** and **Pay**.
* **What happens upon payment:**
  * The exit record status automatically flips to `Settled`.
  * The final payslip is generated, published, and emailed to the departing employee's personal address.
  * The employee's organizational tax summary is frozen for Form 16 issuance.

> [!WARNING]
> **Notice Recovery Exceeding Net Earnings:**  
> If an employee leaves on extremely short notice, their notice penalty may exceed their earned salary. Under labor compliance, the system clamps net take-home pay to **₹0.00** and flags a warning: `NOTICE_RECOVERY_CARRIED_FORWARD`. This unpaid deficit cannot be recovered through future payrolls because the employee is departing; HR must collect the remaining balance through off-platform clearance procedures.

---

### 1.4 Managing Retroactive Corrections & Salary Arrears

**What it is:** A reconciliation tool that detects compensation discrepancies caused by past events (such as late leave regularizations, retroactive appraisal increments, or delayed overtime sign-offs) and automatically credits or deducts the difference in the next open payroll.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Arrears & Corrections*.
* **Why it is useful:** In traditional HRMS software, correcting a past month required "re-opening" closed periods, destroying historical tax records and invalidating previously issued payslips. The Phase 7 arrear engine preserves closed periods as immutable records while settling net differences in the current active month.

#### The Three Core Retroactive Drift Scenarios

```
+-------------------------------------------------------------------------------------------------------+
|                                    RETROACTIVE SALARY DRIFT CAUSES                                    |
+-----------------------------------+-----------------------------------+-------------------------------+
| CASE R1: ATTENDANCE & LEAVE       | CASE R2: RETRO SALARY INCREMENT   | CASE R3: DELAYED OVERTIME     |
| • Employee applied for medical    | • Executive promotion finalized   | • Overtime hours logged or    |
|   leave after March payroll closed|   in May with effective date      |   manager-approved after the  |
| • Unpaid LOP was deducted in March|   backdated to March 1st          |   attendance cut-off lock     |
| • Leave approval changes unworked | • Employee was paid old salary    | • Overtime was not included in|
|   days to paid absence            |   in March and April              |   the closed month's payslip  |
| ➔ RESULT: Positive Arrear Due     | ➔ RESULT: Positive Arrear Due     | ➔ RESULT: Positive Arrear Due |
+-----------------------------------+-----------------------------------+-------------------------------+
```

#### Step-by-Step Arrear Reconciliation Workflow

##### Step 1: Inspecting the Arrear Drift Report
HR opens *Arrears > Inspect Drift* and selects a closed historical month (e.g., `2026-03`).
* **System Computation:** The system re-evaluates the historical period using **live operational facts** (updated leave ledgers, approved salary structures, verified overtime hours) combined with the **frozen policy snapshot** of that closed run (historical rounding rules, LOP divisors, and component formulas).
* **Drift Comparison:** Compares recomputed earnings against the original paid item, subtracting any arrears already raised in previous reconciliation passes.
* **Inspection Output:** Displays a transparent preview of affected employees, discrepancy reasons (`Structure Changed`, `Ledger Changed`, `Overtime Changed`), and individual component deltas (e.g., Basic: +₹4,000; HRA: +₹2,000; Total Drift: +₹6,000).

##### Step 2: Committing Arrear Adjustments
HR reviews the drift report, provides an operational reason (e.g., "April appraisal retro increment for Q1"), and clicks **"Reconcile Arrears"**.
* **System Actions:**
  1. Evaluates all eligible employees in a single transaction.
  2. Automatically routes adjustments to the earliest open payroll month.
  3. Generates individual `payroll_adjustments` records:
     * Positive deltas become approved earning adjustments (`category: arrear`).
     * Negative deltas (such as late unexcused absences) become approved deduction adjustments.
     * Copies taxability, PF, and ESI flags directly from the historical component snapshot so arrear earnings attract statutory deductions identical to the original wage category.
  4. Generates a shared `arrear_batch_id` linking all generated adjustments to the reconciliation audit event.
* **System Protections:**
  * **Full-Reversal Safety Brake:** If an adjustment would claw back 99% or more of an employee's historical gross pay, the system halts and marks the employee as `FULL_REVERSAL_SUSPECTED`. This requires explicit HR opt-in (`Allow Full Reversal: Yes`) to prevent clerical mistakes from wiping out an employee's entire salary.
  * **Unavailable Recompute Protection:** If an employee joined after or separated before the reconciled month, the system skips them with a `RECOMPUTE_UNAVAILABLE` notice rather than treating their absent record as zero days worked and clawing back their pay.

---

### 1.5 Managing Comp-Off & Leave Encashments

**What it is:** Processing cash payouts for accumulated compensatory off days (earned by working on weekends or holidays) or accumulated annual leave balances.

* **Who uses it:** HR Administrators (direct creation and approval) and People Managers (submitting proposals).
* **Where to access:** *Payroll > Encashments*.

#### Encashment Policy Settings

HR configures organizational encashment behavior under *Settings > Payroll Settings > Encashment Policy*:

| Policy Setting | Available Options | Operational Effect |
| :--- | :--- | :--- |
| **Encashment Enabled** | `Enabled` / `Disabled` | Master toggle permitting compensatory off and leave encashment workflows. |
| **Rate Basis** | `Basic`, `Basic + DA`, `Gross` | Determines which salary components form the basis of the daily cash-out value. |
| **Divisor Basis** | `Fixed 30`, `Calendar Days`, `Working Days` | Selects the divisor used to derive daily wage ($Daily Rate = Rate Basis / Divisor$). |
| **Maximum Days per Year** | Numeric Cap (e.g., 15 days) or `Unlimited` | Caps total encashment days an employee can cash out within a single financial year. |
| **Payout Earning Component** | Active Earning Component (e.g., `LEAVE_ENCASH`) | Designates the specific earnings category displayed on the payslip and tax ledger. |

#### Comp-Off Encashment & The Anti-Double-Spend Guarantee (EC-27)

When an employee earns a Compensatory Off in the Attendance module, two things happen simultaneously:
1. An approved row is recorded in the comp-off register.
2. A credit of +1.0 day is added to their Compensatory Off (`CO`) leave balance wallet.

If an employee could encash the comp-off without updating their leave wallet, they could collect the cash payout and subsequently apply for a paid comp-off leave day, spending the same entitlement twice.

```
   [Manager or HR Proposes Comp-Off Encashment]
                        |
                        v
               [HR Approves Request]
                        |
       +----------------+----------------+
       |                                 |
       v                                 v
[Comp-Off Record Updated]      [Leave Wallet Debited]
  Status: APPROVED ➔ ENCASHED    Balance: 1.0 ➔ 0.0 Days
       |                                 |
       +----------------+----------------+
                        |
                        v
     [Approved Payout Adjustment Generated]
```

* **The System Guarantee:** Upon approval of a comp-off encashment, the system executes an atomic transaction that:
  1. Transitions the comp-off record status from `approved` to `encashed`. (The attendance expiry cron ignores encashed records, so it will never expire an encashed day).
  2. Debits the employee's `CO` leave balance wallet for the exact calendar year in which the comp-off was earned. If the comp-off was earned in December 2025 and encashed in January 2026, the system debits the 2025 balance wallet, preventing multi-year wallet corruption.
  3. Creates an approved ad-hoc earning adjustment for the upcoming payroll run.

---

### 1.6 Running Off-Cycle & Supplementary Payrolls

**What it is:** Executing an interim, targeted payroll disbursement within a calendar month that already has a completed regular payroll run.

* **Who uses it:** HR Administrators only.
* **Where to access:** *Payroll > Runs > Create Run > Run Type: Off-Cycle*.
* **Why it is useful:** Accommodates mid-month organizational bonuses, special performance incentives, late severance disbursements, or off-schedule corrections without waiting for the next regular month-end payroll cycle.

#### How "Supplementary Only" Mode Operates

When an off-cycle run is created, the system locks its calculation mode to **Supplementary Only**:
* **Base Salary Suppressed:** Base structure earnings, monthly basic pay, fixed allowances, and Loss of Pay (LOP) attendance deductions are skipped. Payable days are set to 0.
* **Recurring Deductions Skipped:** Benefit insurance premiums, recurring monthly loan EMIs, and carry-forward debt recoveries are excluded (these belong exclusively to the regular monthly run).
* **Targeted Payouts Included:** Only approved ad-hoc adjustments, retroactive arrears, encashment payouts, and verified expense reimbursements are processed.
* **Zero-Payout Error Block:** If an employee included in an off-cycle cohort has no pending variable pay adjustments or reimbursements, the system flags an item error (`NO_SUPPLEMENTARY_LINES`) rather than generating a ₹0.00 payslip.

#### Same-Period Statutory Netting (D-56)

The primary risk of running two payrolls in one calendar month is statutory double-charging:
* Deducting the monthly Professional Tax (PT) slab twice.
* Charging the Employee Provident Fund (PF) wage ceiling (₹15,000) twice.
* Miscalculating Income Tax (TDS) brackets by ignoring tax already withheld earlier in the month.

**The Phase 7 Netting Solution:**  
When calculating an off-cycle run, the engine checks for closed sibling runs in the same month. It computes statutory liabilities on the **cumulative monthly earnings** and subtracts what was already deducted earlier in the month:

$$\text{Off-Cycle Deduction} = \text{Liability}(\text{Regular Gross} + \text{Off-Cycle Gross}) - \text{Regular Deduction Already Paid}$$

* **Professional Tax (PT):** Evaluates total combined earnings against state tax slabs. If the regular run already paid the full monthly bracket, off-cycle PT is ₹0.00. If the combined salary crosses into a higher tax slab, only the marginal difference is deducted.
* **Provident Fund (PF):** If an employee's regular salary already utilized the ₹15,000 statutory ceiling, no additional PF is deducted from the off-cycle payout.
* **Income Tax (TDS):** Accumulates the month's total taxable earnings and applies incremental withholding so tax deductions remain balanced throughout the year.

---

### 1.7 Advanced Benefit Tax Tracking & Perquisites

**What it is:** Accurately applying tax rules to corporate group insurance and executive wellness perks.

* **Who uses it:** HR Administrators.
* **Where to access:** *Payroll > Benefit Plans > [Select Plan] > Tax Configuration*.

#### 1. Employer Benefit Contributions as Taxable Perquisites
When an employer provides executive health memberships or subsidized wellness programs, tax regulations often mandate that the company's subsidy be treated as taxable income (a perquisite).
* **The Challenge:** In traditional systems, adding an employer subsidy to an employee's earnings artificially inflated their gross pay, incorrectly triggering extra Provident Fund, ESI, and Professional Tax deductions.
* **The Phase 7 Rule:** When `Employer Contribution Taxable` is enabled on a benefit plan, the company subsidy is accumulated into a dedicated perquisite pool. It increases **Taxable Earnings for TDS** while leaving Gross Earnings, PF Wages, and ESI Eligibility completely untouched. The payslip, payroll register, and Form 16 Part B clearly display `Perquisite Amount` to explain the variance between gross pay and taxable income.

#### 2. Automated Section 80D Tax Relief
When an employee enrolls in a corporate health insurance plan, their monthly payroll deduction represents medical insurance premium spending.
* **The Phase 7 Rule:** HR can tag a health benefit plan with tax section `80D`. During payroll calculation and annual tax projections under the Old Tax Regime, the system projects the employee's annual premium payments and automatically credits them under Section 80D. Employees do not need to manually collect receipts or submit investment declaration proofs for employer-sponsored medical insurance.

---

### 1.8 Payroll Calendar Automation & System Housekeeping

**What it is:** Automated background processes that eliminate repetitive operational chores, protect system performance, and enforce legal document retention policies.

* **Who uses it:** Fully automated; monitored and manually triggered by HR Administrators.
* **Where to access:** *Settings > Payroll Settings > Automation* and *Payroll > System Jobs*.

```
+-------------------------------------------------------------------------------------------------------+
|                                    PHASE 7 BACKGROUND AUTOMATION JOBS                                 |
+-----------------------------------+-----------------------------------+-------------------------------+
| CALENDAR REMINDERS CRON           | AUTO-DRAFT CREATION CRON          | RUN & ATTACHMENT SWEEPERS     |
| • Runs daily at 08:00 IST         | • Runs daily at 02:00 IST         | • Stale Run Sweeper: every 10m|
| • Attendance cut-off alerts to HR | • Automatically drafts regular run| • Marks crashed runs as failed|
| • Pay-day pending run alerts      |   on the configured draft day     | • Attachment Sweeper: 03:30   |
| • Declaration opening alerts      | • Checks previous month attendance| • Cleans abandoned temp files |
| • Proof deadline approaching alerts|• Never calculates or approves    | • Form 16 Part A permanently  |
| • Multi-instance watermark locks  |   automatically (Human in loop)   |   protected from deletion     |
+-----------------------------------+-----------------------------------+-------------------------------+
```

#### The Four Calendar Reminders
1. **Attendance Cut-Off Reminder:** On the organization's configured attendance cut-off day (e.g., 25th of the month), sends an email reminding HR to complete attendance regularizations and overtime approvals.
2. **Pay-Day Reminder:** On the organization's official payday, if the month's regular payroll run is not yet approved, sends an urgent notification to HR. It inspects the last three closed periods and warns HR if any un-reconciled arrear drift exists.
3. **Declaration Window Opening:** On the first day of the investment declaration window, sends an automated reminder to all active employees who have not yet submitted declarations for the financial year.
4. **Proof Submission Deadline:** Exactly 14 days before the final proof-of-investment deadline, alerts all employees with submitted declarations who still have unverified proof items.

#### Automated Scheduled Auto-Draft
On the organization's designated draft day (e.g., 1st of the month), the system verifies that the previous month has concluded and automatically creates a new `regular` payroll run in `Draft` status.
* **Human-in-the-Loop Safety:** The auto-draft cron **only creates the shell**. It never calculates salary or approves payments automatically, ensuring HR always performs attendance reviews before numbers are generated.

#### Automated Housekeeping Sweepers
* **Stale Calculation Sweeper:** If a server interruption occurs during calculation, leaving a run stranded in `calculating` status for over 30 minutes, the sweeper marks the run as `Failed` with reason `calculation_stale_swept`, allowing HR to safely trigger recalculation.
* **Attachment Retention Sweeper:** Deletes abandoned upload drafts older than 24 hours and enforces organizational document retention windows on soft-deleted receipts.
  * **Permanent Tax Document Protection:** Form 16 Part A certificates and official statutory tax records are **strictly excluded** from retention purges, remaining accessible for legal compliance.

---

## 👥 2. Manager Workflows & Operations

People Managers hold operational visibility over their reporting lines, proposing encashments and monitoring team compensation without crossing organizational privacy boundaries.

---

### 2.1 Proposing Comp-Off & Leave Encashments

**What it is:** Recommending a cash payout for a team member's unutilized compensatory off days or accumulated leave balance.

* **Who uses it:** People Managers with direct reports.
* **Where to access:** *Team > Compensation > Encashments*.

#### Step-by-Step Workflow
1. The manager navigates to their team compensation dashboard and clicks **"Propose Encashment"**.
2. The manager selects a direct report and chooses the encashment type:
   * **Comp-Off Cash-Out:** Selects specific approved, unexpired comp-off dates earned by the employee.
   * **Leave Balance Cash-Out:** Selects an encashable leave type (e.g., Earned Leave) and enters the number of days to cash out.
3. The manager enters a justification remark and clicks **"Submit Proposal"**.
4. **Approval Routing:**
   * If the organization requires separate HR review, the proposal lands in HR's pending approval queue in `Pending` status.
   * If the manager holds direct compensation approval authority, the request transitions immediately to `Approved`.
5. **Team Privacy Protection:** If the organization's privacy settings have compensation visibility turned **OFF** for managers, the manager sees the requested day count and status, but financial rupee amounts are masked to prevent sensitive compensation exposure.

```
   Manager Proposes Request ➔ Status: PENDING ➔ HR Reviews & Approves ➔ Status: APPROVED ➔ Paid in Next Run
             |                                              |
             +-------- Manager Cancels Before Review -------+
                                     |
                                     v
                             Status: CANCELLED
```

---

### 2.2 Tracking Team Encashment History

**What it is:** Reviewing past encashment proposals and approval statuses for team members.

* **Where to access:** *Team > Compensation > Encashments Directory*.
* **Workflow:** Managers can filter requests by status (`Pending`, `Approved`, `Rejected`, `Cancelled`) or by employee.
* **Security & Hierarchy Restriction:** A manager can **only** inspect records for their direct and indirect reporting lines. If a manager attempts to view encashment records for an employee in another department, the system halts access with a permission notice.

---

## 🧑‍💻 3. Employee Self-Service Workflows

Phase 7 provides employees with total clarity regarding separations, retroactive adjustments, and compensatory off cash payouts.

---

### 3.1 Tracking Personal Encashment Requests

**What it is:** Monitoring personal leave and compensatory off encashments and tracking their payment status.

* **Who uses it:** All active employees.
* **Where to access:** *My Payroll > Encashments*.
* **Workflow:**
  1. The employee views a chronological ledger of all encashment events.
  2. Each entry displays:
     * Date requested and source type (Comp-Off vs. Leave Balance).
     * Days encashed.
     * Daily payout rate and total approved cash amount.
     * Current status: `Pending Review`, `Approved`, `Rejected`, or `Cancelled`.
     * Target payout month and direct link to the published payslip once disbursed.

---

### 3.2 Transparent Payslip Explanations: Arrears & Full Settlements

**What it is:** Viewing transparent, itemized line items when retroactive pay, perquisites, or separation settlements are included on a payslip.

* **Where to access:** *My Payroll > Payslips > [Select Payslip]*.

#### What Employees See on Updated Payslips

1. **Retroactive Arrear Lines:** Instead of burying corrections in a confusing lump-sum, arrears appear as distinct, labeled earning lines indicating the original period:
   * Example: `Arrears - Basic Pay (2026-03): ₹4,000.00`
   * Example: `Arrears - Overtime Allowance (2026-03): ₹1,500.00`
2. **Taxable Perquisite Transparency:** If the employee receives company-paid health insurance or wellness benefits, the employer's contribution is displayed under a dedicated information block:
   * `Taxable Perquisite Value: ₹2,500.00`
   * This reassures the employee by explaining why their taxable income is higher than their gross take-home salary.
3. **Full & Final Settlement Payslips:** Separated employees receive a comprehensive settlement payslip itemizing:
   * Prorated working earnings up to their Last Working Day.
   * Total leave encashment additions.
   * Notice recovery deductions (if applicable).
   * Company loan balance recovery clearance.

---

### 3.3 Multi-Run Annual Salary Statements

**What it is:** Reviewing the complete Financial Year salary statement when a single month holds multiple payroll disbursements (such as a regular monthly salary and an off-cycle incentive or settlement).

* **Where to access:** *My Payroll > Annual Statement*.
* **How Split Months are Displayed:**  
  In previous phases, each month was displayed as a single static line. Under Phase 7, if an employee received two disbursements in a single calendar month (e.g., Regular Salary + Off-Cycle Bonus), the Annual Statement displays:
  * A unified monthly summary row reflecting the **combined gross pay, total statutory withholdings, and net take-home pay**.
  * An expandable **Disbursements Breakdown** detailing each individual run:
    * `Run #1 (Regular Monthly): Gross ₹60,000 | TDS ₹4,000 | Net ₹56,000`
    * `Run #2 (Off-Cycle Incentive): Gross ₹25,000 | TDS ₹2,500 | Net ₹22,500`
  * This guarantees that the Annual Statement matches the employee's official Form 16 Part B tax certificate to the exact rupee.

---

## 🔄 4. Status Lifecycles & State Transitions

Phase 7 introduces formal state machines for exits, encashments, and payroll runs, ensuring every financial record transitions predictably and safely.

---

### 4.1 Employee Exit Lifecycle

```
                     +-----------------------------------+
                     |                                   |
                     v                                   |
[HR Submits] ➔ RECORDED ➔ [Prepare Settlement] ➔ PREPARED ➔ [F&F Run Paid] ➔ SETTLED
    |              |                                |
    |              v                                v
    +--------> CANCELLED <--------------------------+
               (Mandatory Reason)
```

| Exit Status | Meaning | Permitted Operations |
| :--- | :--- | :--- |
| **`Recorded`** | Separation officially registered; LWD established. | HR can correct LWD/notice details, cancel the exit, or proceed to prepare settlement. |
| **`Prepared`** | Settlement computed; notice, encashment, and loan adjustments frozen. | HR can inspect settlement plan, link to an F&F run, or trigger **Reset Settlement**. Data edits blocked. |
| **`Settled`** | Final Settlement payroll run has reached `Paid` status. | **Terminal State.** Record is permanently locked. Payslip and Form 16 generated. Cannot be edited or cancelled. |
| **`Cancelled`** | Separation revoked (employee reinstated or resignation withdrawn). | **Terminal State.** Permitted only from `Recorded` or `Prepared` (auto-resets adjustments upon cancellation). |

---

### 4.2 Comp-Off & Leave Encashment Lifecycle

| Encashment Status | Meaning | Permitted Operations |
| :--- | :--- | :--- |
| **`Pending`** | Proposed by manager or draft-created; awaiting HR review. | HR can Approve or Reject. Proposing manager can Cancel. Comp-off records remain available. |
| **`Approved`** | Verified by HR; leave wallet debited; comp-off marked `encashed`. | Payout adjustment scheduled for payroll. Can be Cancelled/Reversed only while target run is unpaid. |
| **`Rejected`** | HR declined the cash-out proposal with a mandatory remark. | **Terminal State.** Comp-off records and leave balance wallets remain completely untouched. |
| **`Cancelled`** | Revoked prior to review, or reversed after approval. | **Terminal State.** If reversed after approval, comp-off flips back to `approved` and wallet is re-credited. |

---

### 4.3 Payroll Run Type Matrix

| Run Type | Permitted Cohort | Calculation Mode | Attendance Lock Behavior | Primary Business Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **`Regular`** | Entire Organization (Whole Population) | `Full` | Creates new period lock or adopts existing lock. | Standard monthly company-wide payroll disbursement. |
| **`Off-Cycle`** | Specific Cohort (1 to 500 Employees) | `Supplementary Only` | Adopts existing lock only; never creates lock. | Mid-month bonuses, commissions, or special corrections. |
| **`Final Settlement`**| Departing Staff (1 to 50 Exiting Employees) | `Full` or `Supplementary Only` | Adopts existing lock only; never creates lock. | Exit settlements, notice clearance, and leave cash-out. |

---

## 💼 5. Real-World Operational Scenarios

The following end-to-end business scenarios illustrate how Phase 7 capabilities handle common organizational events.

---

### Scenario 1: Resignation with Short Notice & Full and Final Settlement

**Context:** An implementation consultant resigns on March 10th. Contractual notice is 60 days, but the employee requests an immediate Last Working Day of March 31st (serving only 21 days). The employee has 8 days of unused Earned Leave and an active computer purchase loan with ₹15,000 remaining principal.

1. **Recording Departure:** HR navigates to *Exits & Separations* and logs the resignation:
   * Last Working Day: `2026-03-31`
   * Notice Required: `60 Days` | Notice Served: `21 Days`
   * Notice Shortfall: `39 Days` unserved. Management declines waiver.
2. **Previewing Settlement:** HR opens *Settlement Preview* for March 2026:
   * **Notice Recovery:** Basic pay is ₹30,000. Daily rate (Divisor 30) is ₹1,000/day. The system calculates a notice penalty deduction of ₹39,000 ($39 \text{ days} \times ₹1,000$).
   * **Leave Encashment:** 8 days Earned Leave encashed at ₹1,000/day adds ₹8,000 gross.
   * **Loan Recovery:** The system detects the computer loan, forgives future interest, and adds a ₹15,000 principal recovery deduction.
3. **Preparing Settlement:** HR confirms and clicks **"Prepare Settlement"**. The adjustments are committed, the employee's Earned Leave balance is debited by 8 days, and the loan installments are closed.
4. **Executing Payout:** HR creates a `Final Settlement` payroll run for March, reviews calculations, and approves payment.
5. **Outcome:** The employee receives their final settlement payslip detailing earned March salary, leave encashment earnings, notice penalty deductions, and loan clearance. The exit record status transitions to `Settled`.

---

### Scenario 2: Backdated Medical Leave & Automated Arrear Recovery

**Context:** On April 3rd, an engineer falls ill and is hospitalized. March payroll closes on April 5th. Because the employee was marked absent on March 29th, 30th, and 31st without an approved leave request, March payroll deducted 3 days of Loss of Pay (LOP) amounting to ₹6,000. On April 10th, the employee returns, uploads medical discharge certificates, and HR approves 3 days of paid Sick Leave for March 29–31.

1. **Drift Detection:** On April 20th, while preparing April payroll, HR opens *Arrears > Inspect Drift* for period `2026-03`.
2. **Automated Analysis:** The system identifies that March attendance changed from unexcused absence to approved paid leave. It compares recomputed earnings against the closed March run and identifies a net positive drift of +₹6,000 (reversing the 3 days of LOP).
3. **Reconciliation:** HR clicks **"Reconcile Arrears"** with remark *"Approved medical leave hospitalization"*.
4. **Outcome:** The system automatically schedules a +₹6,000 earning adjustment under category `Arrear` into the open April payroll run. When April payroll pays out, the engineer's payslip clearly displays:
   * `Basic Salary (April): ₹60,000.00`
   * `Arrears - LOP Refund (2026-03): ₹6,000.00`
   * March payroll history remains completely untouched and auditable.

---

### Scenario 3: Retroactive Appraisal Increment

**Context:** Annual performance reviews are finalized on May 15th. A senior developer receives a promotion and salary increase of ₹15,000/month, effective retroactively from April 1st. April payroll has already been paid at the old salary rate.

1. **Approving Salary Revision:** HR approves the new salary structure with effective date `2026-04-01`.
2. **Proactive System Notification:** Upon approval, the system detects that the effective date reaches into a closed payroll month (`2026-04`) and displays a prompt:
   * `"Salary revision approved. Retroactive arrears detected for 1 closed period (2026-04). Reconcile via Arrears management before running May payroll."`
3. **Drift Reconciliation:** HR opens *Arrears & Corrections* for April 2026. The engine recomputes April earnings under the new component values and identifies a +₹15,000 earnings delta. HR clicks **"Reconcile"**.
4. **Outcome:** A +₹15,000 arrear earning adjustment is routed to the May payroll run. The developer receives their new May salary plus the April arrear difference, with all statutory PF and tax withholdings calculated automatically.

---

### Scenario 4: Holiday Comp-Off Encashment & Anti-Double-Spend Protection

**Context:** A systems administrator works on Republic Day (a national holiday) and earns 1.0 Compensatory Off day on January 26th. In March, the employee requests to cash out the comp-off rather than taking time off.

1. **Manager Proposal:** The IT Manager opens *Team > Compensation > Encashments*, selects the administrator, checks the January 26th comp-off date, and submits the proposal.
2. **HR Approval:** HR reviews the request under *Payroll > Encashments* and clicks **"Approve"**.
3. **Atomic Dual-Debit:**
   * The January 26th comp-off record transitions to `encashed`.
   * The administrator's `CO` leave balance wallet is debited from 1.0 day to 0.0 days.
4. **Verification of Protection:** The administrator attempts to submit an absence request for the following Friday using compensatory off. The Leave module halts the request, showing `Insufficient Balance (0.0 Available)`.
5. **Outcome:** The administrator receives cash value for the holiday work on their March payslip, and the company is protected against duplicate leave spending.

---

### Scenario 5: Mid-Month Performance Bonus via Off-Cycle Run

**Context:** To reward the sales team for closing a major enterprise contract, executive management approves an immediate ₹50,000 spot cash bonus for 12 account executives on May 15th, rather than making them wait for end-of-month May payroll. Regular May payroll will run on May 31st.

1. **Creating Adjustments:** HR creates approved spot bonus adjustments of ₹50,000 for the 12 executives for period `2026-05`.
2. **Creating Off-Cycle Run:** HR navigates to *Runs > Create Run*, selects **Run Type: Off-Cycle**, specifies period `2026-05`, and selects the 12 executives.
3. **Supplementary Calculation:** The engine runs in `Supplementary Only` mode:
   * Base May salary is ignored.
   * Statutory netting evaluates earlier May payouts (₹0.00 since regular May payroll has not yet run).
   * Applicable tax is calculated on the bonus, and net bonuses are disbursed on May 16th.
4. **Regular Run Synchronization:** On May 31st, HR runs regular May payroll for the entire company.
   * When calculating the 12 sales executives, the statutory netting engine evaluates their cumulative monthly earnings (Regular Salary + May 15th Bonus).
   * It deducts only the incremental tax difference, accounting for the tax already withheld on May 16th.
5. **Outcome:** Employees receive their mid-month reward promptly, and month-end tax withholding reconciles without manual adjustment.

---

## ❓ 6. Frequently Asked Questions (FAQ)

### Separation & Full and Final Settlement (F&F)

#### Q1: What happens if an employee leaves the company but HR forgets to record an exit record?
If no exit record is created and an employee is marked inactive in their user profile, the payroll calculation engine will flag an error item: `EXIT_DATE_REQUIRED`. The payroll run cannot be approved until HR either enters a Last Working Day override on the run item or officially logs the departure under *Exits & Separations*.

#### Q2: Can we settle an employee's F&F in a month after their Last Working Day?
Yes. If an employee leaves on March 31st but their final clearance approvals conclude on April 15th, HR can prepare the settlement targeting period `2026-04`. The final settlement run will process in April as a supplementary payout.

#### Q3: Why does "Prepare Settlement" block me from making changes to Last Working Day?
Preparing a settlement calculates exact leave encashment days and notice penalties based on the specific Last Working Day. If HR could alter the LWD after preparation, the frozen financial adjustments would contradict the updated employment dates. To change dates, simply click **"Reset Settlement"**, update the departure details, and re-prepare.

---

### Arrears & Retroactive Pay

#### Q4: If I run Arrear Reconciliation twice for the same closed month, will employees be paid twice?
**No.** The arrear engine is strictly idempotent. On its second pass, the system re-evaluates the drift and subtracts all arrears previously raised for that period. The second calculation produces zero delta, creating no new adjustments.

#### Q5: Why did the system flag an employee as `FULL_REVERSAL_SUSPECTED` during reconciliation?
If an operational change (such as an incorrect profile update) causes the arrear engine to calculate a clawback exceeding 99% of an employee's historical gross earnings, the safety brake triggers. This protects against catastrophic data entry errors that could wipe out an employee's upcoming salary. If the total clawback is genuine (e.g., someone was erroneously paid after leaving), HR can check `Allow Full Reversal: Yes` to proceed.

#### Q6: Are statutory deductions (PF, ESI, TDS) included in the arrear drift calculation?
The drift calculation evaluates **earnings components only**. Statutory withholdings are deliberately computed during the active target month when the arrear is disbursed. This complies with statutory regulations, ensuring PF contributions and income tax withholdings reconcile accurately in the year they are paid.

---

### Encashment & Comp-Offs

#### Q7: Can a manager encash their own compensatory off days?
**No.** Self-approval of compensation is strictly blocked. A manager cannot propose an encashment for themselves. An encashment for a manager must be initiated by HR or by their administrative superior.

#### Q8: What happens if an approved comp-off passes its 90-day validity window while an encashment request is pending review?
The approval transaction performs a strict row-level check: the comp-off must be active and unexpired at the moment HR clicks "Approve". If a comp-off expires while sitting in a review queue, the approval transaction halts with `COMP_OFF_NOT_ENCASHABLE`, preventing cash payment for lapsed entitlements.

---

### Off-Cycle Runs & Statutory Netting

#### Q9: Can an employee receive their regular monthly salary twice if they are included in an off-cycle run?
**No.** The system enforces invariant **INV-P7-1**: an employee can have at most one approved payroll item carrying full structure earnings per calendar month. Off-cycle runs operate in `Supplementary Only` mode, suppressing base salary and paying only designated adjustments or reimbursements.

#### Q10: Why did an employee pay less Professional Tax on their off-cycle payout than expected?
State Professional Tax slabs are monthly limits (e.g., ₹200/month). Because the Phase 7 engine performs same-period statutory netting across all runs in a month, if the employee's regular payroll run already deducted their full monthly PT bracket, the off-cycle run correctly deducts ₹0.00 PT, avoiding double taxation.

---

### Calendar Automation & System Tasks

#### Q11: If the auto-draft cron runs on the 1st of the month, does it automatically approve payroll?
**No.** The auto-draft cron creates the payroll run in `Draft` status only. It never calculates amounts or approves payments. HR must review attendance records, trigger calculation, inspect previews, and approve the run.

#### Q12: Why are Form 16 Part A certificates excluded from the automatic attachment clean-up sweeper?
Form 16 Part A certificates are statutory tax compliance documents that employers are legally required to retain for multiple financial years. The attachment sweeper cleans up temporary expense receipt drafts and soft-deleted items, but permanently protects tax certificates from retention purges.
