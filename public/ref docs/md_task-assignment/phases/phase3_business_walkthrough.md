# Task Assignment Module — Phase 3 User-Facing Business Walkthrough

**Document File:** `public/md_task-assignment/phases/phase3_business_walkthrough.md`  
**Audience:** HR Administrators, People Managers, Employees, Department Leads, Executive Leadership  
**Product Version:** Dakshi HRMS (HRClouds / HRVista Soft Solutions) — Task Assignment Module  
**Scope:** Phase 3 (Deliverable Submission, Managerial Review, Administrative Workflows, Two-Mode Document Attachments & Concurrency Protection)  

---

## 1. Executive Summary & Purpose of Phase 3

Welcome to the **Task Assignment Module Phase 3 Business Walkthrough**.

In Phase 1 and Phase 2, Dakshi HRMS introduced the operational foundation for task management: creating tasks, defining deadlines, strictly enforcing managerial reporting lines, providing employee self-service task views, and establishing verifiable read receipts.

**Phase 3 completes the task lifecycle.** It bridges daily task execution with managerial evaluation, administrative oversight, and enterprise file collaboration:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           THE COMPLETE TASK LIFECYCLE (PHASE 3)                         │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   [ PENDING ] ──(Assignee starts work)──► [ IN PROGRESS ]                               │
│                                                   │                                     │
│                                           (Assignee submits                             │
│                                             deliverables)                               │
│                                                   ▼                                     │
│   [ REOPENED ] ◄──(Manager requests)────── [ IN REVIEW ]                                │
│        │               rework)                    │                                     │
│        │                                  (Manager approves)                            │
│        └──(Assignee resubmits)                    ▼                                     │
│                                            [ COMPLETED ]                                │
│                                                   │                                     │
│                                       (Privileged HR Reopen only)                       │
│                                                   ▼                                     │
│                                            [ REOPENED ]                                 │
│                                                                                         │
│   * At any active stage, an authorized Manager/HR can:                                  │
│     • Reassign to another subordinate                                                   │
│     • Extend the due date (preserving original baseline)                                │
│     • Cancel the task with recorded justification                                       │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### What Business Problems Does Phase 3 Solve?

1. **The "Unverified Delivery" Ambiguity:** Employees often claim work is finished via email or chat, but managers have no single place to inspect submitted files, review deliverable notes, and formally sign off. Phase 3 introduces structured **Deliverable Submissions** and a formal **In Review** evaluation gate.
2. **The "Endless Feedback Loop" Frustration:** When work needs revisions, feedback given verbally or across scattered messages often leads to confusion. Phase 3 automates **Structured Rework Requests**, logging clear revision feedback directly into the task's discussion feed and tracking rework cycles so management can identify training or specification issues.
3. **The "Unplanned Absence" Disruption:** When an employee goes on unplanned sick leave or is reassigned to an urgent project, their open tasks risk stalling. Phase 3 enables seamless **Task Reassignments** to active subordinates, automatically resetting read receipts so the new owner is fully accountable.
4. **The "Overdue Reassignment Trap":** In legacy systems, reassigning an already-overdue task results in the new employee inheriting a failing deadline on day one. Phase 3 **mandates** that managers set a realistic future deadline whenever reassigning overdue work.
5. **The "Moving Goalpost" Reporting Blindspot:** When deadlines are pushed back repeatedly, leadership loses track of what the original timeline was. Phase 3 introduces **Baseline Immutability**: active due dates can be extended, but the committed original due date remains permanently recorded.
6. **Secure Document Sharing Without Email Bloat:** Large briefing files, spreadsheets, and deliverables are uploaded directly and securely to cloud object storage with strict permissions, preventing sensitive corporate files from leaking across departments.

---

## 2. Who Can Use Phase 3 Features?

Access to Phase 3 actions is strictly governed by employee role and organizational reporting relationships:

| User Role | Self-Service Deliverable Submission | Review, Approval & Rework | Reassign Tasks | Extend Due Dates | Cancel Tasks | Privileged HR Reopen |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Employee** | **YES** (Own tasks) | NO | NO | NO | NO | NO |
| **People Manager** | **YES** (If assigned work) | **YES** (Direct team) | **YES** (Direct team) | **YES** (Direct team) | **YES** (Direct team) | NO |
| **HR Administrator** | **YES** (If assigned work) | **YES** (Org-wide) | **YES** (Org-wide) | **YES** (Org-wide) | **YES** (Org-wide) | **YES** (Org-wide) |
| **Platform Admin** | **YES** (If assigned work) | **YES** (Org-wide) | **YES** (Org-wide) | **YES** (Org-wide) | **YES** (Org-wide) | **YES** (Org-wide) |

### Detailed Role Responsibilities

#### 1. Employees (`employee`)
* **Focus:** Focused execution and deliverable submission.
* **Permissions:** Can view tasks assigned to them, download briefing files, submit final deliverables with explanatory notes and links, and respond to rework requests. Employees cannot reassign tasks, approve their own work, extend deadlines, or cancel tasks.

#### 2. People Managers (`manager`)
* **Focus:** Operational supervision, deliverable quality control, and workload rebalancing.
* **Permissions:** Can inspect work submitted by their direct reports, approve deliverables, send work back for revisions with mandatory feedback, reassign tasks among subordinates, grant deadline extensions, and cancel obsolete tasks. Managers are restricted to their active reporting subtree and cannot approve peer tasks or reassign work upward to HR.

#### 3. HR Administrators (`hr`)
* **Focus:** Organization-wide operational governance, audit compliance, and privileged overrides.
* **Permissions:** Possess global supervisory authority across all departments. In addition to standard managerial actions, HR administrators can perform privileged reopens on completed tasks if post-completion compliance or audit remediations are required.

---

## 3. The Task Lifecycle: Complete Status Guide

Phase 3 introduces and formalizes the six standardized lifecycle states:

| Status | Business Meaning | Who Has Next Action? | Permitted Actions |
|---|---|---|---|
| **Pending** | Task has been delegated to the assignee but work has not yet officially commenced. | Assignee | Assignee can view details (stamping read receipt) and click "Start Work". Manager can reassign, extend, or cancel. |
| **In Progress** | Assignee has acknowledged the task and is actively working on the deliverables. | Assignee | Assignee can attach work-in-progress files, post comments, and click "Submit Deliverables". Manager can extend, reassign, or cancel. |
| **In Review** | Assignee has submitted completed deliverables. The task is awaiting formal review and sign-off. | Manager / HR Reviewer | Reviewer can inspect deliverables and choose to **Approve** (complete) or **Request Rework** (reopen). Assignee waits for feedback. |
| **Reopened** | Deliverables were rejected by the reviewer and sent back for revision with feedback. | Assignee | Assignee reviews manager feedback in the comment thread, addresses requested fixes, and resubmits for review. |
| **Completed** | Deliverables were accepted and approved. The task is officially finished and closed. | *None (Terminal)* | Read-only archive. Only an authorized HR Administrator can perform a privileged reopen if required. Cannot be cancelled. |
| **Cancelled** | The task was formally terminated before completion due to obsolete requirements or scope changes. | *None (Terminal)* | Read-only archive. Preserves cancellation reason and user accountability. Cannot be restarted or submitted. |

---

## 4. Employee Self-Service: Submitting Deliverables

### What is this feature?
When an employee finishes working on an assigned task, they submit their completed work for review rather than informally messaging their manager.

### Why does it exist?
It establishes a clear, auditable timestamp of completion. It ensures that all deliverables—written summaries, file attachments, and external links—are packaged together in one verifiable record.

### Where can the user access it?
1. Open the **Task Assignment** module from the main navigation menu.
2. Navigate to **My Tasks**.
3. Click on the active task you have been working on.
4. Click the **Submit Deliverables** button located at the top right of the task details view.

### Required & Optional Information
* **Submission Note (Required):** A clear, concise summary of the work completed, findings, or handover instructions (minimum 10 characters, maximum 2,000 characters).
* **Attached Files (Optional):** You may attach up to 10 supporting documents, spreadsheets, or images (each up to 10MB) that represent your final deliverable.
* **External Links (Optional):** You may provide up to 5 secure web links (e.g., Pull Request URL, Figma design link, shared cloud document) with descriptive labels.

### What happens after you submit?
1. **Immediate Status Change:** The task status immediately shifts from `In Progress` (or `Reopened`) to **In Review**.
2. **Reviewer Notification:** Your manager (or the person who assigned the task) receives an instant notification alerting them that your deliverables are ready for review.
3. **Lock on Deliverables:** While under review, the submission cannot be edited, preventing accidental changes while your manager evaluates your work.
4. **On-Time Protection:** The exact submission timestamp is locked. Even if your manager takes three days to review the work, your delivery punctuality is evaluated against your submission time, protecting your track record.

> [!WARNING]
> **Must Start Work First:** You cannot submit deliverables for a task that is still in `Pending` status. You must first click "Start Work" to transition the task into active progress before submitting final work.

---

## 5. Manager Review: Approval, Rejection & Rework

When an employee submits deliverables, the task appears in the Manager's review queue. The manager has two clear choices: **Approve Deliverable** or **Request Rework**.

```
                           ┌──────────────────────────┐
                           │    TASK IS IN REVIEW     │
                           └─────────────┬────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
         [ APPROVE DELIVERABLE ]                   [ REQUEST REWORK ]
                    │                                         │
     • Task marked "Completed"                • Task marked "Reopened"
     • Evaluates on-time delivery             • Increments rework counter
     • Assignee notified of acceptance        • Posts feedback to discussion
     • Task moves to archives                 • Assignee notified to revise
```

---

### Action A: Approving a Task

#### What is this feature?
The formal sign-off process where a manager accepts the submitted work, closing the task as finished.

#### How to use it:
1. Open the **Task Assignment** module and select **Team Tasks** or **Tasks Assigned by Me**.
2. Filter by status: **In Review**.
3. Open the task and inspect the employee's submission notes, attached files, and external links.
4. Click the **Approve Task** button.
5. *(Optional)* Enter an **Approval Note** (e.g., commendation, feedback for the employee).
6. Click **Confirm Approval**.

#### What happens next?
* **Status Updates to Completed:** The task moves into the closed `Completed` state.
* **On-Time Calculation:** The system checks whether the task was finished on or before the active deadline:
  * If completed on time: Flagged as `On Time`.
  * If completed past deadline: Flagged as `Overdue Completion`.
* **Assignee Alert:** The employee receives an immediate notification that their deliverable was accepted.
* **Accountability Stamped:** The manager's name and the exact acceptance timestamp are permanently recorded on the task card.

---

### Action B: Requesting Rework (Rejecting Deliverable)

#### What is this feature?
If the submitted deliverable is incomplete, contains errors, or does not meet requirements, the manager returns it to the assignee with required corrective instructions.

#### How to use it:
1. Open the task currently in **In Review** status.
2. Click the **Request Rework** button.
3. In the feedback window, enter a **Reopen Reason** (minimum 10 characters, maximum 2,000 characters). Explain clearly what is missing or what needs to be changed.
4. Click **Send Back for Rework**.

#### What happens next?
* **Status Updates to Reopened:** The task transitions back to active work under the `Reopened` status.
* **Automated Discussion Entry:** The system automatically posts a highlighted message directly into the task's comment feed:
  > **REWORK REQUESTED:** *"[Manager's detailed feedback]"*  
  This ensures revision feedback is permanently visible alongside future updates.
* **Rework Count Tracking:** The system increments the task's rework counter by 1.
* **Excessive Rework Alert:** If a task undergoes **5 or more rework cycles**, the system automatically flags an **Excessive Rework Warning**. This alerts senior leadership and HR that a task may have unclear requirements, unrealistic expectations, or require direct managerial intervention.
* **Assignee Notification:** The employee receives an urgent notification detailing the rework request so they can make corrections promptly.

---

## 6. Privileged HR Governance: Reopening Completed Tasks

### What is this feature?
An administrative safeguard that allows authorized HR Administrators to reopen an already-completed task when post-delivery compliance audits, client requirement reversals, or quality discrepancies demand further work.

### Who can use it?
* **HR Administrators** and **Platform Administrators** only.
* **People Managers CANNOT reopen completed tasks.** Once a manager approves a task, it is locked to prevent tampering with historical performance records.

### How to use it:
1. Log in with an **HR Administrator** account.
2. Navigate to **HR Task Governance**.
3. Locate the completed task and click **Privileged Reopen**.
4. Enter a detailed operational justification (minimum 15 characters).
5. Click **Confirm Privileged Reopen**.

### What happens next?
* The task status reverts from `Completed` to `Reopened`.
* The previous completion date and approver name are cleared.
* An indelible entry is added to the system audit log noting that an HR Administrator executed a privileged override.
* Both the assignee and their direct manager are notified immediately.

---

## 7. Operational Adjustments: Task Reassignment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TASK REASSIGNMENT WORKFLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Current Assignee: Alex Mercer (Out on sudden sick leave)                  │
│                                                                             │
│   Manager Action:                                                           │
│   1. Select new subordinate: Jordan Hayes                                   │
│   2. Enter operational reason (min 10 chars)                                │
│   3. If task is overdue ──► MUST specify new future due date (≥ 15 min)     │
│                                                                             │
│   System Effects:                                                           │
│   • Assignee changes to Jordan Hayes                                        │
│   • Read receipt resets to "Unread" (is_viewed = false)                     │
│   • Reassignment count increments by 1                                      │
│   • Previous work/review resets to "In Progress"                            │
│   • Audit trail records transfer from Alex to Jordan                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What is this feature?
Transfers responsibility for an active task from one employee to another.

### Why does it exist?
Employees get sick, take sudden leave, or shift to higher-priority company initiatives. Reassignment ensures that open work does not stall when staffing dynamics change.

### Who can reassign?
* **People Managers:** Can reassign tasks belonging to their direct team, but only to **other active direct subordinates**. Managers cannot reassign tasks outside their team or to administrative personnel.
* **HR Administrators:** Can reassign tasks across departments enterprise-wide.

### Strict Business Rules & Guardrails
1. **Zero Self-Delegation:** A manager cannot reassign a task to themselves.
2. **No Redundant Reassignments:** You cannot reassign a task to the person who currently owns it.
3. **The Overdue Reassignment Rule:** If a task is currently past its deadline (overdue), the system **blocks** reassignment unless the manager provides a **New Future Due Date** at least 15 minutes into the future. A new assignee must never inherit an expired deadline on their first day of ownership!

### Step-by-Step Workflow
1. Open the active task in your managerial view.
2. Click **Reassign Task**.
3. Select the **New Assignee** from the dropdown list of your direct active subordinates.
4. Enter the **Reassignment Reason** (minimum 10 characters; e.g., *"Reassigning to Jordan due to Alex's medical leave"*).
5. If the task is overdue, select an updated **New Due Date**.
6. Click **Confirm Reassignment**.

### What happens next?
* **Ownership Transferred:** The task disappears from the previous employee's active queue and appears in the new assignee's queue.
* **Read Receipt Reset:** The task's read status is reset to **Unread**. The new assignee must open the task to record their own acknowledgment.
* **Review Reset:** If the task was previously waiting in `In Review`, its status resets to `In Progress` so the new assignee can verify and refine the deliverables before resubmitting.
* **Reassignment Counter:** The task's reassignment counter increments by 1.
* **Notifications:** The new assignee receives an immediate alert about their new assignment, and the previous assignee is notified of the handoff.

---

## 8. Schedule Management: Due Date Extensions

### What is this feature?
Allows a manager or HR administrator to officially grant extra time for an active task while preserving the immutable original baseline deadline.

### Why does it exist?
Projects encounter unexpected vendor delays, client feedback bottlenecks, or technical roadblocks. While giving extra time is often necessary, losing track of the original committed date skews quarterly planning accuracy.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BASELINE DUE DATE IMMUTABILITY                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [ Original Deadline: Oct 15 ] ◄── NEVER OVERWRITTEN (Analytical Baseline) │
│                 │                                                           │
│           Manager grants extension (Client delayed assets)                  │
│                 ▼                                                           │
│   [ Active Due Date:   Oct 20 ] ◄── Current operational deadline            │
│   [ Extension Count:   1      ] ◄── Recorded extension cycle                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How to use it:
1. Open the active task details.
2. Click the **Extend Due Date** button.
3. Pick a **New Due Date**. The date must be strictly later than the current due date and at least 15 minutes into the future.
4. Enter a detailed **Extension Reason** (minimum 10 characters, maximum 500 characters).
5. Click **Confirm Extension**.

### What happens next?
* The active `Due Date` updates to the new date.
* The `Original Due Date` remains **completely unchanged** in the historical record.
* The task's `Extension Count` increments by 1.
* An audit log entry is recorded with the extension reason.
* The employee receives a notification that their deadline has been extended.

> [!NOTE]
> Completed and cancelled tasks cannot have their due dates extended.

---

## 9. Task Termination: Safe Cancellation

### What is this feature?
Formally terminates a task that is no longer required, recording why it was cancelled and who authorized the termination.

### Terminal State Protection (Critical Rule)
* **Active Tasks Can Be Cancelled:** Tasks in `Pending`, `In Progress`, `In Review`, or `Reopened` status can be cancelled at any time by an authorized manager or HR administrator.
* **Completed Tasks CANNOT Be Cancelled:** Once a task is accepted and marked `Completed`, it can **never** be cancelled. Finished work is a historical corporate achievement and cannot be erased or retroactively cancelled.

### How to use it:
1. Open the active task details.
2. Click the **Cancel Task** button.
3. Enter a mandatory **Cancellation Reason** (minimum 10 characters, maximum 500 characters; e.g., *"Project cancelled due to client corporate restructuring"*).
4. Click **Confirm Cancellation**.

### What happens next?
* Status updates permanently to **Cancelled**.
* The employee is notified immediately so they can stop work.
* The cancellation reason, cancelling manager's name, and timestamp are locked into the task card.
* No further edits, comments, submissions, or extensions can be performed on the task.

---

## 10. File & Document Attachments

Phase 3 introduces an enterprise-grade document attachment system supporting two distinct modes of collaboration:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TWO MODES OF DOCUMENT ATTACHMENT                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   MODE A: Pre-Creation Briefing Staging                                     │
│   • Upload guidelines, contracts, briefs BEFORE creating the task           │
│   • Files are staged securely in the cloud                                  │
│   • When manager clicks "Create Task", files bind to the new task instantly │
│                                                                             │
│   MODE B: In-Task Deliverable Attachment                                    │
│   • Upload work-in-progress, reports, or deliverables to an EXISTING task   │
│   • Bound immediately to the task ID                                        │
│   • Categorized as "briefing" or "submission"                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Supported File Formats & Technical Limits
* **Permitted File Formats:**
  * PDF Documents (`.pdf`)
  * Images (`.jpg`, `.jpeg`, `.png`, `.webp`)
  * Microsoft Office Documents (`.docx`, `.xlsx`)
* **Maximum File Size:** 10 MB per file. Files exceeding 10 MB are rejected.
* **Task Quota Cap:** Maximum **20 attachments** per task. If a task reaches 20 attachments, additional uploads are blocked until obsolete files are removed.

### Secure Viewing & Download Privacy
To protect sensitive corporate documents, files are never exposed via public links. When an authorized user clicks to download a file:
1. The system verifies that the user is the **Assignee**, the **Assigner**, the **Direct Line Manager**, or an **HR Administrator**.
2. If verified, the system generates a private, temporary download link valid for **15 minutes**.
3. Unauthorized employees outside the reporting line cannot view or download files.

---

## 11. Collaborative Concurrency Protection

In a busy workplace, multiple users may view and edit the same task at nearly the same time. For example:
* An employee clicks **Submit Deliverables** at the exact moment their manager clicks **Extend Due Date**.
* A manager clicks **Approve Task** while another administrator is modifying task details.

### How Dakshi HRMS Protects You:
The system uses **Automatic Concurrency Protection**:
* Every task carries a hidden version counter that updates whenever an action is performed.
* If another team member modifies the task while you have it open on your screen, the system detects that your view is slightly out of date.
* When you click an action, instead of silently overwriting the other person's update, the system alerts you:
  > **Notice:** *"This task was recently modified by another team member. Please refresh the page to see the latest updates before proceeding."*
* You refresh the screen, review the latest state, and perform your action with confidence. No updates are ever lost or overwritten!

---

## 12. User-Facing Validation & Safeguards

The Task Assignment Module includes built-in safeguards to keep task data accurate and prevent human error:

| Action | What You Must Provide | Built-In Safeguard / Restriction |
|---|---|---|
| **Submit Deliverables** | Submission note (10–2,000 chars) | Task cannot be in `Pending` status. Cannot submit without a note. Files cannot exceed 10MB. |
| **Approve Task** | Optional approval note | Task must be in `In Review` status. Completed tasks cannot be re-approved. |
| **Request Rework** | Reopen reason (10–2,000 chars) | Task must be in `In Review` status. Cannot reopen cancelled tasks. Excessive rework alert triggered at 5 cycles. |
| **Privileged HR Reopen** | HR justification (15–2,000 chars) | Only HR Administrators can use this. Regular managers are blocked. |
| **Reassign Task** | Subordinate selection & reason (10–1,000 chars) | Cannot reassign to yourself. Cannot reassign to current assignee. If task is overdue, a new future deadline is mandatory. |
| **Extend Due Date** | New due date & reason (10–500 chars) | New date must be strictly after current deadline and $\ge 15$ minutes in future. Original deadline is never overwritten. |
| **Cancel Task** | Cancellation reason (10–500 chars) | Cannot cancel completed tasks. Reason is mandatory. |
| **Attach Files** | File format & size | Max 10MB per file. Max 20 attachments per task. Supported: PDF, Images, Word, Excel. |

---

## 13. End-to-End Real-World Scenarios

### Scenario 1: A Successful Task Journey from Delegation to Sign-Off

```text
Day 1 (Morning):
Sarah (Finance Manager) creates a task for Alex (Senior Financial Analyst):
• Title: "Prepare Q3 Regional Sales Variance Analysis"
• Due Date: Friday at 5:00 PM
• Attachment: "Q3_Sales_Raw_Data.xlsx" (uploaded during task creation)

Day 1 (Afternoon):
Alex logs into Dakshi HRMS, sees the new task in "My Tasks", and opens it.
• System instantly logs Alex's Read Receipt (Sarah sees Alex has read the task).
• Alex clicks "Start Work" — status changes from "Pending" to "In Progress".

Day 3:
Alex completes the variance model, uploads "Q3_Variance_Final.pdf", adds a link to the finance team spreadsheet, and writes a detailed submission note.
• Alex clicks "Submit Deliverables" — status updates to "In Review".
• Sarah receives an instant notification: "Alex submitted deliverables for review".

Day 4:
Sarah reviews the spreadsheet and variance report. Everything matches budget expectations.
• Sarah clicks "Approve Task" and leaves a note: "Excellent work, approved for board deck."
• Status updates to "Completed".
• System evaluates completion timestamp: Finished 1 day before deadline -> marked "On Time".
• Alex receives a notification of approval. Task is archived in company records.
```

---

### Scenario 2: Handling Deliverable Revisions (The Rework Cycle)

```text
Step 1:
Employee Jordan submits a draft compliance policy for review. Status shifts to "In Review".

Step 2:
Manager Priya reviews the document and notices that Section 4 lacks updated statutory pension disclosures.
• Priya clicks "Request Rework".
• Priya writes: "Please review Section 4 and include the statutory 2026 pension contribution table from the employee handbook."
• Status updates to "Reopened".
• System automatically injects Priya's note as a highlighted comment in the task thread.
• Rework counter increments from 0 to 1.

Step 3:
Jordan receives the notification, opens the task, reads the feedback in the comments, updates Section 4, and clicks "Submit Deliverables" again.
• Status updates back to "In Review".

Step 4:
Priya reviews the revised policy. The statutory table is now correct.
• Priya clicks "Approve Task".
• Task is successfully marked "Completed".
```

---

### Scenario 3: Managing Unplanned Absences & Overdue Tasks

```text
Situation:
Alex is assigned an operational tax reconciliation due today at 5:00 PM. At 1:00 PM, Alex is rushed to the hospital for an emergency medical procedure and will be out for two weeks. The deadline passes, and the task becomes "Overdue".

Manager Action:
Manager Sarah needs Jordan to take over the urgent tax reconciliation.
1. Sarah opens the overdue task and clicks "Reassign Task".
2. Sarah selects Jordan from the subordinate list.
3. Sarah enters reason: "Alex on emergency medical leave; reassigning to Jordan."
4. System Safeguard: Because the task is already Overdue, Sarah CANNOT submit without a new deadline.
5. Sarah sets a new deadline for tomorrow at 6:00 PM (giving Jordan 29 hours to complete).
6. Sarah clicks "Confirm Reassignment".

Result:
• Task is reassigned to Jordan.
• Active Due Date updates to tomorrow at 6:00 PM (Extension Count: 1).
• Original baseline deadline remains safely recorded as yesterday.
• Read receipt resets to Unread.
• Jordan receives an alert, opens the task, and delivers the report on time.
```

---

## 14. Frequently Asked Questions (FAQ)

### Q1: Can I submit deliverables for a task if it is still in "Pending" status?
**No.** You must first open the task and click **Start Work** to transition it into `In Progress`. This ensures managers know work is actively underway before deliverables are submitted.

### Q2: What happens if I make a mistake in my submission note?
Once you submit deliverables, the task moves to `In Review` and is locked while your reviewer evaluates it. If you need to make immediate changes, communicate with your manager in the task comment feed or ask them to click **Request Rework** so you can revise and resubmit.

### Q3: Why can't I (a People Manager) reopen a completed task?
In enterprise HR compliance, completed tasks represent historical corporate milestones and approved achievements. To prevent retroactive tampering or performance record disputes, managers cannot reopen completed work. If an audit or regulatory error requires reopening a completed task, contact your **HR Administrator**, who can perform a Privileged Reopen with documented justification.

### Q4: If my manager extends my deadline, does it hurt my on-time completion record?
When a manager grants an extension, the active `Due Date` moves forward. If you submit your work on or before the *new* extended deadline, your task is recorded as completed on time. However, leadership can see the `Extension Count` and compare your final completion against the `Original Due Date` for project planning analytics.

### Q5: Can I reassign a task to someone in another department?
**People Managers cannot.** Managers can only delegate and reassign work to active subordinates within their own direct team hierarchy. If cross-departmental task reallocation is required, contact your **HR Administrator**, who possesses organization-wide reassignment authority.

### Q6: What happens if I try to reassign an overdue task without changing the deadline?
The system will **block** the reassignment and display an error. You must select a new due date at least 15 minutes in the future so the new assignee receives a fair, achievable operational deadline.

### Q7: Can a completed task ever be cancelled?
**No.** Once a task has been approved and marked `Completed`, it can never be cancelled. Cancellation is strictly reserved for active tasks that were deprioritized or terminated before completion.

### Q8: What types of files can I attach, and is there a size limit?
You can attach **PDF documents**, **Images** (JPEG, PNG, WebP), and **Microsoft Office files** (Word `.docx`, Excel `.xlsx`). Each file must be under **10 MB**, and each task can hold a maximum of **20 attachments**.

### Q9: Who can download the files attached to a task?
Only authorized individuals directly involved in the task: the **Assignee**, the **Assigner**, the **Direct Line Manager of the Assignee**, and **HR Administrators**. All other employees are blocked from accessing or downloading files.

### Q10: What does the "Excessive Rework Alert" mean?
If a task is rejected and sent back for revisions **5 or more times**, the system flags an Excessive Rework Alert. This helps department heads identify tasks where specifications may be ambiguous, requirements may be shifting, or the assignee requires additional training or coaching.

---

## 15. Summary Checklist for Users

* [x] **Employees:** Acknowledge tasks promptly $\rightarrow$ Click "Start Work" $\rightarrow$ Upload deliverables $\rightarrow$ Submit with clear explanatory notes.
* [x] **Managers:** Inspect submitted deliverables $\rightarrow$ Approve with commendation OR Request rework with actionable feedback $\rightarrow$ Reassign during absences $\rightarrow$ Set future deadlines if overdue.
* [x] **HR Administrators:** Maintain organization-wide oversight $\rightarrow$ Review cross-departmental progress $\rightarrow$ Perform privileged reopens on completed tasks when audited $\rightarrow$ Inspect immutable delivery baselines.
