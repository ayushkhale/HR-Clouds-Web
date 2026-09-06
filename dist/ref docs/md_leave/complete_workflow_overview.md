# Complete Leave Management System Workflow & Architecture Overview

This document provides a high-level, end-to-end overview of how the Leave Management System operates. It explains the architectural flow, how the different phases connect together to build a robust system, and what the final product will look like once all phases are complete.

---

## 1. System Vision & The "Why"
Building a leave system is not just about recording when someone is absent; it's about connecting **HR Policies**, **Employee Balances**, and **Daily Attendance/Payroll**. 

Our vision is a **Highly Flexible, Unified System**. Instead of building rigid rules, we built an engine where:
- HR defines "Global Templates" (e.g., *Permanent Employee 2026*).
- When a template is assigned to an employee, it generates an "Individualized Config" for them.
- If an employee needs a special exception (e.g., they negotiated 20 days of Sick Leave instead of 12), HR can override *just their config* without breaking the global template.

### The Problem We Are Solving
In most standard HR systems, leaves and daily attendance exist in silos. An employee gets their leave approved, but the attendance cron job still marks them "Absent" because they didn't punch in. Or, an employee works on a Sunday (earning a Comp Off), but they have to manually email HR to use it.
**Our system bridges this gap.** Leave approvals automatically sync with the live `attendance_records` ledger, and Comp Offs automatically generate leave balances.

---

## 2. The Core Workflow (How It Works End-to-End)

Once the entire system is built, here is what the day-to-day workflow looks like:

### Step 1: Configuration (The Setup)
1. **Define Leave Types:** HR creates types like Sick Leave (SL), Casual Leave (CL), Privilege Leave (PL), and Comp Off (CO). They define whether a type is paid, if it requires a medical certificate after 3 days, and if the "Sandwich Rule" applies.
2. **Build Templates:** HR creates a Template (e.g., "Intern Policy") and attaches Entitlements to it (e.g., 6 SL, 0 PL, Accrued Monthly).

### Step 2: Onboarding (The Assignment)
1. **Assign Policy:** When a new employee joins, HR assigns them the "Intern Policy".
2. **Pro-Rata Calculation:** The system detects they joined mid-year (e.g., July 1st). The Policy Assignment Engine kicks in, calculates pro-rata, and creates an individualized `employee_leave_config` for them with exactly 3 SL instead of 6.
3. **Wallet Creation:** The system creates a `leave_balances` row for them (their digital wallet) for the current year.

### Step 3: Application (The Request)
1. **Unified Application:** The employee opens the app and requests 4 days of Sick Leave.
2. **The Leave Calculator Engine:** 
   - The engine checks the calendar. It sees that a public holiday (Diwali) falls in the middle of those 4 days.
   - It also checks their weekly off rules.
   - It calculates that the employee only needs to burn **3 days** of leave, not 4.
3. **Balance Check:** The engine checks their "wallet". They only have 3 SL left. The system allows the request.
4. **Approval Chain:** The system queries `user_reporting_mappings`. It finds the employee's direct manager and routes the request to them.

### Step 4: Approval & Sync (The Magic)
1. **Manager Action:** The manager hits "Approve".
2. **Balance Deduction:** The system deducts 3 days from the employee's `leave_balances` wallet.
3. **Attendance Sync (The Bridge):** The system automatically pushes "On Leave" status directly into the live `attendance_records` table for those 3 days. The daily Absent Cron job will now safely ignore this employee.

### Step 5: Year-End Rollover (The Automation)
1. **Cron Job:** On January 1st at midnight, the system runs a massive calculation.
2. **Carry Forward:** It takes the remaining balance from the previous year, checks the `max_carry_forward` limit on the employee's config, and rolls it over into their new wallet for the new year.

---

## 3. The Development Workflow (Phase-by-Phase Roadmap)

We have broken this massive system down into 6 distinct, sequential phases. The architecture is designed so that **each phase acts as a strict dependency for the next**. You cannot build the roof before pouring the foundation.

Here is the exact progression of how the system comes to life:

### ✅ Phase 1: Foundation (Completed)
* **What it achieves:** We built the database schema, models, repositories, and HR Admin configuration APIs. HR can now create Leave Types (Sick, Casual) and Policy Templates.
* **Why it is necessary for Phase 2:** Before we can give an employee a leave balance, we must first know *what* to give them. Phase 1 provides the raw rules and definitions. Without Phase 1, Phase 2 has no policies to assign.

### 🚀 Phase 2: Policy Assignment & Balance Engine (Up Next)
* **What it achieves:** We will build the engine that assigns the templates (from Phase 1) to individual employees. When an employee is assigned a policy, the system calculates their pro-rata balance based on their joining date, creates a personalized `employee_leave_config`, and seeds their live `leave_balances` wallet for the current year. It also gives HR the ability to override individual quotas.
* **Why it is necessary for Phase 3:** An employee cannot apply for a leave if they don't have a balance to deduct from. Phase 2 creates the "bank accounts". Once Phase 2 is done, the system knows exactly how many days of each leave type every employee has.

### ⏳ Phase 3: Application & Approval Workflow
* **What it achieves:** We build the core user-facing functionality. This includes the complex "Leave Calculator Engine" that figures out exactly how many days to deduct (accounting for public holidays and weekends). We also build the unified Application APIs (for employees) and Approval APIs (for managers).
* **Why it is necessary for Phase 4:** Now that employees can apply and managers can approve, the system is generating approved `leave_requests`. However, these requests currently only exist inside the Leave Module. If we stop here, the separate Attendance Cron Job will still mark the employee as "Absent". This necessitates Phase 4.

### ⏳ Phase 4: Attendance Integration Bridge
* **What it achieves:** We build the cross-module communication hooks. When a manager approves a leave request (from Phase 3), this bridge automatically reaches into the Attendance module and inserts an "On Leave" record into `attendance_records`. Conversely, if an employee works on a weekend and earns a Comp Off in the Attendance module, this bridge reaches back and adds `+1` to their leave balance wallet.
* **Why it is necessary for Phase 5:** Phase 4 guarantees day-to-day operational stability between payroll and leave. Once the day-to-day operations are perfectly synced, we can move on to automating the long-term lifecycle of those leaves in Phase 5.

### ⏳ Phase 5: Automation (Cron Jobs)
* **What it achieves:** We build the "hands-off" automation layer. This includes a monthly cron job that trickles in accrued leaves (e.g., 1 Sick Leave per month instead of 12 upfront). It also includes the massive Year-End Rollover cron job that runs on January 1st to move remaining balances into the new year, respecting the `max_carry_forward` limits.
* **Why it is necessary for Phase 6:** Automation ensures the system runs itself indefinitely. With the core lifecycle fully automated, we are finally free to focus entirely on extreme edge cases and company-specific compliance rules without worrying about basic system stability.

### ⏳ Phase 6: Advanced Edge Cases & Hardening
* **What it achieves:** We lock down the system with enterprise-grade HR compliance. We implement the "Sandwich Rule", probation period restrictions (e.g., no Privilege Leave in the first 90 days), Notice Period hard caps, demographic-specific leaves (Maternity/Paternity), and complex shift-rotation awareness (e.g., taking leave during a night shift that crosses midnight).
* **The Final State:** At the end of Phase 6, the system is not just a leave tracker; it is a fully automated, compliance-driven, enterprise-grade HR engine.

---

## 4. Architectural Principles We Are Following

1. **Modular Monolith:** The Leave system lives in its own `/src/modules/leave` directory. It has its own controllers, services, and models. It communicates with the Attendance module through strictly defined database boundaries.
2. **Row-Level Locking:** When checking a user's leave balance, we use `SELECT ... FOR UPDATE` (transaction locks). This ensures that if a user double-clicks the "Apply" button quickly, the system won't accidentally approve both and create a negative double-spend.
3. **No Phantom Balances:** When an employee applies for leave, the requested days immediately count against their "Effective Balance" even before approval. This prevents them from applying for 5 days of sick leave twice while waiting for manager approval.
4. **Soft Deletes:** Nothing is ever truly deleted. If HR deletes a Leave Type, it is marked `is_active: false`. This ensures historical payroll and attendance audits never break.
