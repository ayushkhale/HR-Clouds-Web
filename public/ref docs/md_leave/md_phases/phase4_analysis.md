# Phase 4 Analysis: The Leave ↔ Attendance Bridge

Phase 4 represents the most critical and complex layer of the HRMS ecosystem. Rather than introducing new APIs, Phase 4 is built entirely of **background hooks, bridges, calculation engines, and cron jobs**. Its primary goal is to securely tie the **Attendance Module** (what employees actually work) to the **Leave Module** (what employees are allowed to take off), ensuring zero data leaks, no double-spending of leave balances, and perfect payroll synchronization.

This document breaks down exactly how these integrations flow in a production environment, complete with the API endpoints that trigger them.

---

## Workflow 1: The Comp-Off Lifecycle (Earning and Spending)

Compensatory Offs (Comp-Offs) bridge the gap between working on a holiday and earning a future day off. The system requires zero manual "Earn Comp-Off" forms from the employee. It is entirely automated based on their raw attendance data.

### Step 1: Earning the Comp-Off (Employee Action)
Employees simply do their job on a non-working day.
- **Action:** An employee uses `POST /api/v1/attendance/clock-in` and `POST /api/v1/attendance/clock-out` on a Saturday (a Weekly Off) or a Public Holiday.
- **The Phase 4 Magic:** When they clock out, the `attendance_calculation.service.js` automatically evaluates the organization's policy (`comp_off_on_holiday_work: true`). If allowed, the system silently generates a pending `AttendanceCompOffs` record with `status = 'earned'`.

### Step 2: Approving the Earned Comp-Off (Manager Action)
- **Action:** The manager reviews their team's pending items using `GET /api/v1/attendance/comp-offs/pending`.
- **Action:** They approve the system-generated comp-off using `POST /api/v1/attendance/comp-offs/:id/approve`.
- **The Phase 4 Magic:** The moment the manager approves it, the Phase 4 cross-module bridge reaches into the Leave Module and deposits `+1.0` day into the employee's `LeaveBalance` wallet for the "Comp-Off (CO)" leave type.

### Step 3: Spending the Comp-Off (Employee Action)
The employee decides to take a random Tuesday off.
- **Action:** They check their wallet via `GET /api/v1/leaves/my-balances` and confirm they have `1` day of CO.
- **Action:** They apply for leave using `POST /api/v1/leaves/request`, selecting "Comp-Off".
- **The Phase 4 Magic:** The system mathematically searches for the oldest unexpired Comp-Off record and locks it to this leave request using the `source_comp_off_id` pointer.

### Step 4: Approving the Comp-Off Leave (Manager Action)
- **Action:** The manager checks their leave queue using `GET /api/v1/leaves/team/requests/pending`.
- **Action:** They approve the Tuesday off using `POST /api/v1/leaves/requests/:id/approve`.
- **The Phase 4 Magic:** The system securely marks the underlying `AttendanceCompOffs` record as `used` and injects an `on_leave` record into the employee's attendance ledger for that Tuesday.

### Step 5: Fixing/Cancelling the Comp-Off (Employee Action)
The employee changes their mind and wants to work that Tuesday instead.
- **Action:** They hit `POST /api/v1/leaves/requests/:id/cancel`.
- **The Phase 4 Magic:** The system automatically "un-burns" the Saturday comp-off (returning it to `approved` status so it can be used later) and refunds the `1.0` day back to their wallet, **provided the 90-day expiry hasn't passed**. If it has expired in the meantime, the balance is not refunded and the comp-off is marked `expired`.

---

## Workflow 2: Regularization vs. Approved Leaves

Regularization is used when an employee forgets to clock out or disputes an attendance record. Phase 4 ensures that regularizations can safely interact with (and override) existing Leave records.

### Step 1: Requesting a Fix (Employee Action)
An employee was marked `absent` or `on_leave`, but they actually worked.
- **Action:** They use `POST /api/v1/attendance/regularization`, providing the date, exact time they left, and a reason.
- **Action:** They track the status via `GET /api/v1/attendance/regularizations`.

### Step 2: Reviewing the Fix & The Phase 4 Overwrite (Manager Action)
- **Action:** The manager reviews via `GET /api/v1/attendance/regularizations/pending` and approves via `POST /api/v1/attendance/regularizations/:id/approve`.
- **The Phase 4 Magic:** 
  1. The system updates the attendance record to `present`.
  2. If the day was previously marked as an approved leave (`on_leave`), the regularization service **automatically triggers a partial or full refund** of the leave request.
  3. It refunds the leave balance and safely un-burns the `source_comp_off_id` if it was a Comp-Off leave, applying the strict 90-day expiry validation logic before doing so.

---

## Workflow 3: HR Deactivation & Graceful Unwinding

When an employee resigns or is terminated, HR deactivates them. Phase 4 ensures their future footprint is wiped clean.

- **Action:** HR calls `DELETE /api/v1/organizations/employees/:id`.
- **The Phase 4 Magic:** A post-deletion hook fires (`_unwindEmployeeLeaves`). It scans for any future approved leaves the employee had (e.g., a vacation planned for next month). It cancels those leaves, removes the future `on_leave` attendance records, un-burns any consumed Comp-Offs, and refunds the balances so the final payroll settlement accurately reflects their true unspent leave wallet.

---

## The Phase 4 Cron Jobs

### 1. The Comp-Off Expiry Engine (`expireStaleCompOffs`)
By company policy, earned Comp-Offs expire after 90 days if not used. 
- **How it works:** A nightly cron job scans the `AttendanceCompOffs` table for records where `status = 'approved'` and `expiry_date < today`.
- **The Action:** For every expired record, it reaches across the bridge into the Leave Module, deducts `1.0` from the employee's `LeaveBalance`, and sets the comp-off status to `expired`. This prevents employees from hoarding weekend work indefinitely.

### 2. The Auto-Mark Absent Engine (`auto_mark_absent.cron.js`)
Runs daily at 7:00 AM IST to mark employees absent if they didn't clock in yesterday.
- **Phase 4 Upgrade:** To prevent race conditions where a manager approves a backdated leave at 8:00 AM *after* the cron ran, Phase 4 introduced an **UPSERT** pattern in the Leave Approval service. If the cron already marked them `absent`, the Leave service safely overwrites it to `on_leave`. If they actually worked and are marked `present`, the Leave service throws a `BadRequestError` preventing the manager from overriding a working day with a leave day.

---

## Critical Edge Cases Handled in Phase 4

1. **The "In Progress" Bypass:** A manager cannot approve a leave for today if the employee is currently actively clocked in (`status === 'in_progress'`). The system throws a conflict error.
2. **Race Conditions on Leave Balances:** All balance deductions and comp-off reservations are wrapped in strict PostgreSQL `SELECT ... FOR UPDATE` locks. If an employee tries to open two tabs and apply for 1 remaining Casual Leave simultaneously, the database forces the second request to wait for the first to commit, accurately returning an "Insufficient Balance" error to the second tab.
3. **Double-Crediting Prevention:** Recalculations triggered by regularizations are fully idempotent. Re-calculating an already calculated day will not magically spawn a second Comp-Off.

### Summary
Phase 4 acts as the invisible nervous system of the application. The APIs exposed to the user remain remarkably simple (Clock In, Apply Leave, Approve), while the backend handles complex state synchronization, expiry logic, and cross-module refunds automatically.
