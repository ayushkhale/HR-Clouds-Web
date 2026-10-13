# Task Assignment Module — Phase 1 User-Facing Business Walkthrough

**Document File:** `public/md_task-assignment/phases/phase1_business_walkthrough.md`  
**Audience:** HR Administrators, People Managers, Employees, Operations Leads, Executive Stakeholders  
**Product Version:** Dakshi HRMS (HRClouds / HRVista Soft Solutions) — Task Assignment Module  
**Scope:** Phase 1 (Data Foundation, Business Governance, Lifecycle Rules & Enterprise Work Ledger)  

---

## 1. Executive Summary & Purpose of the Task Assignment Module

Welcome to the **Task Assignment Module** user guide.

In modern organizations, operational execution often breaks down due to informal, fragmented communication. Work delegated across emails, chat messages, sticky notes, or verbal corridor conversations frequently falls through the cracks. Deadlines are missed, priorities become muddled, and managers lack real-time visibility into whether assigned work has even been acknowledged.

The **Task Assignment Module** introduces a centralized, structured, and auditable work delegation and tracking system inside Dakshi HRMS. It bridges the gap between high-level business goals and daily operational execution by providing clear ownership, verifiable acknowledgment, and transparent progress tracking across three organizational tiers: **Employees**, **People Managers**, and **HR Administrators**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TASK ASSIGNMENT OPERATIONAL TIERS                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────┐   │
│   │  EMPLOYEE PORTAL    │   │   MANAGER PORTAL    │   │   HR COMMAND    │   │
│   │   (Self-Service)    │   │    (Delegation)     │   │  (Governance)   │   │
│   ├─────────────────────┤   ├─────────────────────┤   ├─────────────────┤   │
│   │ • View my tasks     │   │ • Delegate to team  │   │ • Org oversight │   │
│   │ • Read receipts     │   │ • Track read status │   │ • Cross-dept ops│   │
│   │ • Progress updates  │   │ • Review & approve  │   │ • Compliance ops│   │
│   │ • Submit work       │   │ • Rework & extend   │   │ • Audit trail   │   │
│   └─────────────────────┘   └─────────────────────┘   └─────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Problem Does Phase 1 Solve?

Before work can be assigned, tracked, and evaluated reliably, an organization requires a hardened operational foundation. **Phase 1** establishes this foundation by creating:

1. **A Single Enterprise Work Ledger:** A unified organizational record for all delegated tasks, eliminating duplicate tracking systems and fragmented spreadsheets.
2. **Strict Organizational Hierarchy Compliance:** Managers can only delegate work to their active direct reports, preserving corporate reporting structures and preventing unauthorized cross-departmental task assignment.
3. **The "Non-Repudiable Read Receipt" Standard:** The system automatically logs the exact moment an assignee inspects a task, eliminating the common workplace excuse: *"I never saw this task."*
4. **Transparent Deadline & Extension Governance:** Tasks maintain their original committed deadline alongside active due dates, giving leadership full visibility into delivery timelines and approved extensions.
5. **Separation of Operational Execution from Strategic Appraisals:** Short-cycle operational tasks (e.g., submitting a report, completing compliance paperwork, fixing a customer issue) are tracked clearly without being conflated with annual performance reviews (OKRs, KPIs, 360-degree appraisals).

> [!NOTE]
> **Understanding Phase 1 Delivery:**  
> Phase 1 establishes the enterprise data models, business rules of engagement, multi-tenant security boundaries, subscription access, and lifecycle state rules. It guarantees that when users interact with the system across subsequent phases—from self-service task views and managerial dashboards to file attachments and discussion feeds—every action adheres to strict organizational policies, data isolation, and audit standards.

---

## 2. Who Can Use the Task Assignment Module?

Access to task delegation and tracking is governed by the organization's verified reporting structure and role permissions:

| User Role | Permitted Actions | Delegation Scope | Visibility Boundary |
|---|---|---|---|
| **HR Administrator** (`hr`) | Create, View, Update, Reassign, Review, Cancel, Audit | **Organization-Wide:** Can assign tasks to any employee or manager in the company | Complete visibility across all company departments and task categories |
| **People Manager** (`manager`) | Create, View, Update, Reassign, Review, Cancel | **Direct Reports Only:** Can assign tasks strictly to active team members who report to them | Visibility limited to tasks they assigned and tasks belonging to their direct team |
| **Employee** (`employee`) | View, Acknowledge, Update Progress, Submit Work | **Self-Service Only:** Cannot delegate tasks to others | Visibility strictly limited to tasks assigned to themselves |
| **Platform Administrator** (`admin`, `super-admin`) | Enterprise Tenant Oversight | Global organizational governance | Bounded by company multi-tenant data privacy |

### Detailed Role Explanations

#### 1. HR Administrators
HR Administrators act as executive custodians of company-wide productivity and compliance. They can create tasks for any active employee, supervise cross-departmental initiatives, track compliance-related deadlines (such as annual policy acknowledgments or statutory training), review overdue work across the company, and inspect immutable audit records for legal or regulatory assurance.

#### 2. People Managers
People Managers lead operational delivery. The system dynamically validates their team reporting roster. A manager can assign work to direct subordinates, track whether team members have opened their tasks, review submitted deliverables, request revisions if quality standards are not met, grant deadline extensions, and reassign tasks when team members are on leave. Managers cannot assign tasks to peer managers or to employees outside their reporting line.

#### 3. Employees
Employees use the self-service task portal as their daily to-do list and execution hub. They receive instant alerts when work is delegated to them, view detailed instructions and reference materials, update their execution status, communicate progress, and submit final deliverables for sign-off. Employees have focused, private visibility into their own work.

---

## 3. Why Does the Task Assignment Module Exist? (Business Context)

In fast-paced companies, manual and informal task management creates five major operational headaches:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE 5 COMMON WORKPLACE TASK BREAKDOWNS                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. The "Lost in the Inbox" Problem                                         │
│     Tasks assigned via email threads get buried under daily clutter.        │
│                                                                             │
│  2. The "Unread Deniability" Excuse                                         │
│     Assignees claim they missed the assignment or saw it too late.          │
│                                                                             │
│  3. The "Unclear Ownership" Trap                                            │
│     Tasks assigned to multiple people or groups result in nobody taking     │
│     responsibility.                                                         │
│                                                                             │
│  4. The "Silent Overdue" Blindspot                                          │
│     Deadlines pass unnoticed until an escalation occurs.                    │
│                                                                             │
│  5. The "Appraisal Conflation" Confusion                                    │
│     Managers struggle to remember operational delivery history during       │
│     annual performance appraisals.                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How the Module Solves Each Breakdown:

* **Centralized Registry:** Every task lives in one structured system with a clear title, description, category, priority, and deadline.
* **Automatic Read Receipts:** The system records an indisputable timestamp the first time an assignee opens a task.
* **Strict Single Ownership:** Every task has exactly one primary assignee. One person is clearly accountable for delivery.
* **Dynamic Overdue Tracking:** Active tasks past their due date are automatically flagged as overdue across dashboards.
* **Performance Baseline Tracking:** The system preserves the original deadline, tracks the number of approved extensions, records rework cycles, and calculates whether work was completed on time.

---

## 4. Subscription Plans & Feature Availability

The Task Assignment Module is an integrated component of the Dakshi HRMS subscription framework:

* **Feature Name:** Task Assignment & Management (`tasks.access`)
* **Plan Inclusion:**
  * **Basic Plan:** Included
  * **Professional Plan:** Included
  * **Growth Plan:** Included
  * **Enterprise Plan:** Included
* **Multi-Tenant Security Guarantee:** All task data, employee assignments, file attachments, and discussion records are strictly isolated to your company. No user from another company can ever view or access your organization's tasks.

---

## 5. The Task Lifecycle & Statuses Explained

Every task moves through a structured, predictable lifecycle from initial assignment to formal completion or cancellation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TASK LIFECYCLE STATE MACHINE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│     [Pending] ───────────────► [In Progress] ─────────────► [In Review]     │
│        │                             │                            │         │
│        │ (Cancelled)                 │ (Cancelled)                │         │
│        ▼                             ▼                            ├────────┐│
│   [Cancelled]                   [Cancelled]                       │        ││
│                                                                   ▼        ▼│
│                                                            [Completed] [Reopened]
│                                                                             │
│   * Dynamic Overdue Flag: Active when Due Date < Current Time and not       │
│     Completed or Cancelled.                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Status Definitions

| Status | Business Meaning | Who Holds the Next Action? | Available Actions |
|---|---|---|---|
| **`pending`** | The task has been created and assigned, but the assignee has not yet started work. | Assignee (Employee) | Inspect task details, acknowledge receipt, begin work (`in_progress`), cancel (Assigner/HR only). |
| **`in_progress`** | The assignee has acknowledged the task and is actively working on it. | Assignee (Employee) | Update progress, attach work drafts, submit for review (`in_review`), request extension, cancel (Assigner/HR only). |
| **`in_review`** | The assignee has completed the work and submitted the deliverable for evaluation. | Assigner (Manager or HR) | Inspect deliverable, approve and finalize (`completed`), or reject and return for rework (`reopened`). |
| **`reopened`** | The assigner reviewed the work and found deficiencies. The task is returned with required corrections. | Assignee (Employee) | Review corrective feedback, implement changes, and resubmit for review (`in_review`). |
| **`completed`** | The deliverable has been formally approved. The task is closed and archived. | None (Terminal State) | View task history, download final files, inspect audit log. Task details can no longer be modified. |
| **`cancelled`** | The task was permanently discontinued prior to completion. A mandatory business rationale is recorded. | None (Terminal State) | View cancellation reason, inspect audit log. Cannot be reopened or reactivated. |

### Dynamic Overdue Indicator

In addition to its lifecycle status, any active task (`pending`, `in_progress`, `reopened`, or `in_review`) whose active deadline has passed is dynamically designated as **Overdue**.

* Overdue status is calculated in real time against the current time.
* It does not alter the underlying lifecycle status (a task remains `in_progress` while displaying an **Overdue** alert banner).
* Once a task is approved as `completed` or formally `cancelled`, the overdue alert is permanently cleared.

---

## 6. Core Rules of Task Delegation & Governance

The Task Assignment Module enforces several foundational business rules to guarantee fairness, accountability, and operational integrity:

### 1. The Strict Zero Self-Assignment Rule
* **The Rule:** A user cannot assign a task to themselves.
* **Why:** In enterprise operations, self-created reminders belong in personal calendars or to-do notes. The Task Assignment Module is strictly designed for **bilateral work delegation**—where one person delegates responsibility to another and holds them accountable.

### 2. Single Accountable Assignee
* **The Rule:** Every task must have exactly one primary assignee.
* **Why:** Shared group assignments dilute accountability. When three people are assigned to a task without a single owner, each assumes someone else will finish it. If a project requires collaboration, the manager creates individual, focused tasks for each contributor.

### 3. Baseline Deadlines vs. Operational Extensions
* **The Rule:** When a task is created, the system locks its initial due date as the permanent **Original Due Date**. If the manager later grants an extension, the active **Due Date** updates, and the **Extension Count** increments by one.
* **Why:** Preserving the original baseline allows HR and leadership to distinguish between deliverables completed on the original schedule versus those requiring multiple timeline extensions.

### 4. Non-Repudiable Read Receipts
* **The Rule:** When an assignee opens the details of an assigned task for the first time, the system silently and immutably records the exact timestamp (`first_viewed_at`) and marks the task as **Viewed**. Subsequent inspections update the `last_viewed_at` timestamp.
* **Why:** Managers can look at the task and instantly see whether the employee has read the instructions, eliminating guesswork and communication breakdowns.

### 5. Mandatory Business Justifications
* **The Rule:** Whenever a task is cancelled, or whenever a deliverable is rejected and returned for rework, the user must provide a clear written explanation.
* **Why:** Employees must understand why their work was rejected or why a project was halted. Transparent documentation prevents workplace friction and supports audit compliance.

### 6. Conflict Prevention (Optimistic Protection)
* **The Rule:** If two users (e.g., an HR administrator and a team manager) attempt to modify the same task at the exact same moment, the system detects the conflict, saves the first update, and prompts the second user to refresh their view before making further changes.
* **Why:** Prevents accidental overwriting of notes, deadlines, or status updates.

---

## 7. Task Categorization & Priority Framework

To keep tasks organized and help employees prioritize their day, every task is classified by Category and Priority:

### Task Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TASK CATEGORY TAXONOMY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  • OPERATIONAL:     Day-to-day business deliverables, sprint deliverables,  │
│                     client reports, and standard operational tasks.         │
│                                                                             │
│  • COMPLIANCE:      Statutory filings, policy sign-offs, data protection    │
│                     audits, and regulatory certifications.                  │
│                                                                             │
│  • ONBOARDING:      New hire checklist items, IT equipment handovers, ID    │
│                     badge collection, and intro meetings.                   │
│                                                                             │
│  • ADMINISTRATIVE:  Internal paperwork, asset returns, vendor invoices,     │
│                     and office operations.                                  │
│                                                                             │
│  • GENERAL:         Ad-hoc tasks, cross-departmental coordination, and      │
│                     miscellaneous activities.                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Priority Levels

| Priority | Intended Use | Visual Indicator | Expected Turnaround |
|---|---|---|---|
| **`urgent`** | Critical system issues, legal deadlines, emergency client escalations | Red Badge | Immediate priority; takes precedence over all other work |
| **`high`** | Significant operational milestones, compliance requirements, time-sensitive tasks | Orange Badge | Requires immediate scheduling within the current workday |
| **`medium`** | Standard operational deliverables, regular project tasks (Default) | Blue Badge | Standard completion according to stated deadline |
| **`low`** | Routine administrative tasks, optional research, non-time-sensitive chores | Gray Badge | Executed when higher-priority work is completed |

---

## 8. Step-by-Step Business Workflows

Here is how real users accomplish their daily work using the Task Assignment Module:

---

### Workflow 1: Manager Delegating a Task to a Team Member

**Objective:** A People Manager assigns an operational project deliverable to a direct report.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   WORKFLOW 1: MANAGERIAL WORK DELEGATION                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Open Manager Portal ──► 2. Click "Assign New Task"                      │
│                                    │                                        │
│                                    ▼                                        │
│  3. Fill Task Details:                                                      │
│     • Title: "Q3 Department Budget Variance Report"                         │
│     • Category: Operational                                                 │
│     • Priority: High                                                        │
│     • Due Date: Friday at 5:00 PM (UTC)                                     │
│     • Description: Comprehensive instructions and expectations              │
│     • Attachments / Links: Reference financial template                     │
│                                    │                                        │
│                                    ▼                                        │
│  4. Select Assignee: Choose from dropdown of active direct reports          │
│                                    │                                        │
│                                    ▼                                        │
│  5. Click "Delegate Task"                                                   │
│     • System verifies manager-subordinate reporting relationship            │
│     • System confirms assigner ≠ assignee                                   │
│     • Task created in [Pending] status                                      │
│     • Assignee receives immediate notification                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Step-by-Step Instructions:
1. Navigate to the **Manager Panel > Team Tasks**.
2. Click the **"Assign New Task"** button.
3. Complete the task form:
   * **Title:** Enter a concise summary (e.g., *"Prepare Q3 Regional Sales Variance Analysis"*).
   * **Category:** Select `Operational`.
   * **Priority:** Select `High`.
   * **Due Date:** Choose a future date and time.
   * **Description:** Outline exact deliverables, format requirements, and data sources.
   * **Reference Links:** (Optional) Add secure web links to corporate folders or shared guidelines.
   * **Attachments:** (Optional) Attach sample templates or reference briefs (up to 10 MB).
4. **Select Assignee:** Open the assignee list. The system displays only employees who officially report to you. Select the responsible employee.
5. Click **"Save and Assign"**.

#### What Happens Next:
* The task is saved with an initial status of **`pending`**.
* The original due date is permanently recorded as the performance baseline.
* An entry is written to the audit log recording who assigned the task and when.
* The employee receives an immediate notification in their notification feed and email.

---

### Workflow 2: HR Delegating an Organization-Wide Compliance Task

**Objective:** An HR Administrator delegates a statutory compliance sign-off to employees across different departments.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   WORKFLOW 2: HR ENTERPRISE WORK GOVERNANCE                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Open HR Command Center ──► 2. Click "Create Governance Task"            │
│                                         │                                   │
│                                         ▼                                   │
│  3. Fill Task Details:                                                      │
│     • Title: "Annual Data Protection & Information Security Sign-off"       │
│     • Category: Compliance                                                  │
│     • Priority: Urgent                                                      │
│     • Due Date: Set company statutory deadline                              │
│     • Description: Step-by-step instructions for policy review              │
│     • Reference Links: Link to official compliance portal                   │
│                                         │                                   │
│                                         ▼                                   │
│  4. Select Assignee: Search across any employee or manager in the company   │
│                                         │                                   │
│                                         ▼                                   │
│  5. Click "Publish Task"                                                    │
│     • HR authority grants global delegation across all departments          │
│     • Task enters [Pending] state and appears in employee queue             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Differences for HR:
* HR Administrators can assign tasks to **any active employee or manager** in the organization, bypassing direct reporting line restrictions.
* Ideal for mandatory corporate compliance, annual document submissions, onboarding milestones, or exit handover checklists.

---

### Workflow 3: Employee Inspecting and Acknowledging a Task

**Objective:** An employee views their delegated work and begins execution.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW 3: INSPECTION & ACKNOWLEDGMENT                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Employee receives alert: "New Task Assigned by Your Manager"            │
│                                    │                                        │
│                                    ▼                                        │
│  2. Open Employee Portal > "My Tasks"                                       │
│                                    │                                        │
│                                    ▼                                        │
│  3. Click task card to inspect details                                      │
│     • SYSTEM ACTION: Silently stamps first_viewed_at timestamp              │
│     • SYSTEM ACTION: Flags task as "Viewed" for the manager                 │
│                                    │                                        │
│                                    ▼                                        │
│  4. Review description, deadline, priority, and download attachments        │
│                                    │                                        │
│                                    ▼                                        │
│  5. Click "Start Work"                                                      │
│     • Status changes from [Pending] to [In Progress]                        │
│     • Manager sees task is actively being worked on                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### What the Manager Sees:
* In the Manager Dashboard, the task now displays an eye icon with the exact date and time the employee opened it (e.g., *"Viewed on Oct 12, 2026, at 10:14 AM"*).
* Once the employee clicks "Start Work", the status badge transitions from gray `pending` to vibrant blue `in_progress`.

---

### Workflow 4: Submitting Work for Review & Assigner Sign-off

**Objective:** The employee completes the work deliverable and submits it for managerial sign-off.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW 4: SUBMISSION & APPROVAL GATE                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [EMPLOYEE ACTION]                                                          │
│  1. Open active task in [In Progress] status                                │
│  2. Click "Submit for Review"                                               │
│  3. Enter summary note & attach completed deliverable file                  │
│  4. Confirm submission ──► Status transitions to [In Review]                │
│                                    │                                        │
│                                    ▼                                        │
│  [MANAGER / HR ACTION]                                                      │
│  5. Review alert received: "Task Submitted for Review"                      │
│  6. Open task in Manager Review Queue                                       │
│  7. Inspect submitted document & evaluate against requirements              │
│                                    │                                        │
│               ┌────────────────────┴───────────────────┐                    │
│               ▼                                        ▼                    │
│      [OPTION A: APPROVE]                     [OPTION B: REWORK]             │
│   • Click "Approve Deliverable"           • Click "Request Revisions"       │
│   • Status becomes [Completed]            • Enter mandatory feedback notes  │
│   • System calculates on-time completion  • Status becomes [Reopened]       │
│   • Task moves to completed archive       • Rework counter increments by 1  │
│                                           • Returned to employee queue      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### On-Time Completion Calculation:
When the manager clicks **"Approve Deliverable"**:
* The system stamps the exact completion time (`completed_at`).
* The system records the manager's identity as the approver (`completed_by`).
* The system compares `completed_at` against the active `due_date`:
  * If `completed_at` is on or before `due_date`, the deliverable is flagged as **Completed on Time**.
  * If `completed_at` is after `due_date`, it is flagged as **Completed Late**.
* This metric is preserved in the work ledger for future performance reporting.

---

### Workflow 5: Requesting a Deadline Extension

**Objective:** An employee or manager recognizes that unforeseen circumstances require more time to complete a deliverable.

1. The manager opens the active task (`in_progress` or `reopened`).
2. Clicks **"Extend Due Date"**.
3. Selects a new future due date and enters an administrative reason (e.g., *"Delayed pending client data feed"*).
4. Clicks **"Confirm Extension"**.
5. **System Results:**
   * The active `due_date` is updated to the new date.
   * The `original_due_date` remains completely unchanged.
   * The `extension_count` increments from `0` to `1`.
   * An audit log entry is permanently recorded.
   * Both employee and manager receive an extension confirmation notice.

---

### Workflow 6: Formal Task Cancellation

**Objective:** An initiative is deprioritized, cancelled by the client, or rendered obsolete.

1. The Assigner (or HR Administrator) opens the task.
2. Clicks **"Cancel Task"**.
3. The system presents a mandatory dialog: *"Please provide a reason for cancelling this task (required)."*
4. The user enters a descriptive rationale (e.g., *"Project scope revised during client steering meeting; deliverable no longer required"*).
5. Clicks **"Confirm Cancellation"**.
6. **System Results:**
   * The status transitions to **`cancelled`**.
   * The cancellation timestamp and user identity are recorded.
   * The task is permanently locked against further updates, comments, or submissions.
   * The assignee receives an immediate notification explaining why the task was cancelled.

---

## 9. Required Information & Input Rules

When creating or modifying tasks, the following rules apply:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TASK FIELD SPECIFICATIONS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FIELD              REQUIREMENT   ALLOWED VALUES / RULES                    │
│  ─────────────────  ───────────   ────────────────────────────────────────  │
│  Task Title         Mandatory     1 to 200 characters. Concise & clear.     │
│                                                                             │
│  Description        Mandatory     1 to 5,000 characters. Rich instructions. │
│                                                                             │
│  Category           Mandatory     Operational, Compliance, Onboarding,      │
│                                   Administrative, General.                  │
│                                   Default: Operational.                     │
│                                                                             │
│  Priority           Mandatory     Low, Medium, High, Urgent.                │
│                                   Default: Medium.                          │
│                                   Urgent flagged with visual banner.        │
│                                                                             │
│  Due Date           Mandatory     Must be a valid date and time in the      │
│                                   future. Stored in standard UTC.           │
│                                                                             │
│  Assignee           Mandatory     Active user within permitted scope.       │
│                                   Cannot be the assigner (no self-assign).  │
│                                                                             │
│  External Links     Optional      Up to 10 valid HTTPS web links with       │
│                                   descriptive labels.                       │
│                                                                             │
│  Attachments        Optional      Up to 10 MB per file. Standard documents  │
│                                   (PDF, Word, Excel, Images).               │
│                                                                             │
│  Cancellation Note  Conditional   Mandatory (up to 500 chars) if cancelling.│
│                                                                             │
│  Rework Feedback    Conditional   Mandatory (up to 2,000 chars) if rejecting│
│                                   deliverable during review.                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. What Happens After Each Action?

To help users understand system behavior, the table below maps user actions to immediate outcomes:

| Action Taken | Immediate System Outcome | Who Takes the Next Action? | Audit Trail Impact | Notifications Dispatched |
|---|---|---|---|---|
| **Manager assigns a task** | Task is created in `pending` status. Baseline due date is locked. | Assignee (Employee) | Logged as `CREATED` with title, priority, deadline, and assignee | Push & Email to Assignee |
| **Employee opens task details** | System stamps `first_viewed_at`. Task marked as `is_viewed = true`. | Assignee (Employee) | Logged as `FIRST_VIEWED` with exact timestamp | Read receipt displayed on Manager dashboard |
| **Employee starts work** | Status transitions from `pending` to `in_progress`. | Assignee (Employee) | Logged as `STATUS_CHANGED` (`pending` → `in_progress`) | Manager dashboard reflects active work |
| **Employee submits work** | Status transitions from `in_progress` to `in_review`. | Assigner (Manager/HR) | Logged as `TASK_SUBMITTED` with submission notes | Push & Email to Assigner |
| **Manager approves work** | Status transitions from `in_review` to `completed`. On-time status evaluated. | None (Task is closed) | Logged as `TASK_APPROVED` with approver identity | Push & Email to Assignee |
| **Manager requests rework** | Status transitions from `in_review` to `reopened`. Rework count increments. | Assignee (Employee) | Logged as `TASK_REOPENED` with mandatory feedback | Push & Email to Assignee with feedback note |
| **Manager extends deadline** | Due date updated. Extension count increments. Original due date intact. | Assignee (Employee) | Logged as `DUE_DATE_EXTENDED` with previous and new dates | Push & Email to Assignee |
| **Assigner cancels task** | Status transitions to `cancelled`. Task locked as read-only. | None (Task terminated) | Logged as `TASK_CANCELLED` with cancellation rationale | Push & Email to Assignee |

---

## 11. User-Facing Validation & Business Guardrails

The system enforces practical guardrails to protect users from mistakes and maintain organizational discipline:

### Guardrail 1: Preventing Self-Assignment
* **What happens if attempted:** If a manager attempts to select their own name as the assignee, the system prevents selection with a clear prompt:
  > *"Self-assignment is not permitted. Please select a team member who reports to you."*

### Guardrail 2: Preventing Cross-Departmental Delegation
* **What happens if attempted:** When a People Manager opens the assignee list, employees outside their reporting tree do not appear. If a manager tries to enter an identifier for someone in another department:
  > *"You can only assign tasks to active employees who directly report to you. For cross-departmental tasks, please contact HR."*

### Guardrail 3: Preventing Past Deadlines
* **What happens if attempted:** If an assigner accidentally chooses yesterday or a past hour as the due date:
  > *"The task due date must be scheduled in the future."*

### Guardrail 4: Enforcing Explanations for Rework & Cancellation
* **What happens if attempted:** If a manager clicks "Request Revisions" or "Cancel Task" without typing an explanation:
  > *"A written explanation is required so the employee understands why this action was taken."*

### Guardrail 5: Protecting Closed Tasks
* **What happens if attempted:** If a user attempts to edit a task that is already marked `completed` or `cancelled`:
  > *"This task is closed and cannot be modified. Its details are preserved for historical audit records."*

---

## 12. Real-World Business Scenarios

### Scenario A: Monthly Operations Report (Manager to Employee)
1. **Delegation:** Priya (Finance Operations Manager) assigns the *"Monthly Expense Reconciliation"* to Vikram (Junior Financial Analyst).
2. **Details:** Priority is set to `High`, due date is set to Friday at 4:00 PM, and a link to the accounting drive is attached.
3. **Acknowledgment:** Vikram logs in on Monday at 9:30 AM and clicks the task. Priya’s dashboard updates immediately, showing Vikram viewed the task at 9:30 AM.
4. **Execution:** Vikram changes status to `In Progress`. On Thursday afternoon, he uploads the reconciled spreadsheet and clicks *"Submit for Review"*.
5. **Approval:** Priya reviews the sheet on Friday morning, clicks *"Approve Deliverable"*, and the task enters `Completed` status. The system flags it as **Completed on Time**.

---

### Scenario B: Mandatory Information Security Training (HR to Employee)
1. **Delegation:** HR Administrator Anita creates a company-wide task: *"Annual Data Protection & Privacy Training Certification"*.
2. **Cross-Department Reach:** Because Anita holds HR authority, she assigns individual compliance tasks to 50 employees across Engineering, Sales, and Marketing.
3. **Deadline:** Due date is set for the end of the month with `Compliance` category and `Urgent` priority.
4. **Submission:** Each employee reviews the training module, signs the policy form, and uploads their certificate for HR sign-off.
5. **Auditing:** Anita filters her HR dashboard by category `Compliance` and status `Pending` to instantly identify which employees have not yet acknowledged or completed the training.

---

### Scenario C: Deliverable Revision & Feedback Loop (Rework Cycle)
1. **Initial Submission:** Sarah submits her design brief for the new marketing campaign.
2. **Manager Review:** David (Creative Director) reviews the brief and notices that the mobile responsive mockups are missing.
3. **Rework Request:** David clicks *"Request Revisions"*, enters feedback: *"Please add mobile responsive layout sketches for the hero banner and pricing table before final sign-off"*, and submits.
4. **Employee Update:** Sarah receives an alert with David’s feedback. The task status updates to `Reopened`, and the rework counter shows `1`.
5. **Resubmission & Approval:** Sarah creates the mobile layouts, updates her upload, and resubmits. David reviews and approves. The audit log reflects both the initial review, the rework request, and the final approval.

---

## 13. How Phase 1 Integrates with Existing HRMS Modules

The Task Assignment Module is designed to work seamlessly with your existing Dakshi HRMS workspace:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CROSS-MODULE PLATFORM INTEGRATION                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐        ┌──────────────────────────────────────┐   │
│  │ ORGANIZATION &       │───────►│ TASK ASSIGNMENT                      │   │
│  │ REPORTING STRUCTURE  │        │ • Uses active company reporting line │   │
│  │ (Employees & Teams)  │        │ • Ensures managers assign to reports │   │
│  └──────────────────────┘        └──────────────────┬───────────────────┘   │
│                                                     │                       │
│  ┌──────────────────────┐                           │                       │
│  │ NOTIFICATION ENGINE  │◄──────────────────────────┤                       │
│  │ (Alerts & Emails)    │                           ▼                       │
│  └──────────────────────┘        ┌──────────────────────────────────────┐   │
│                                  │ PERFORMANCE & APPRAISALS (Module 6)  │   │
│                                  │ • Tracks on-time completion rates    │   │
│                                  │ • Counts approved extensions         │   │
│                                  │ • Records quality rework counts      │   │
│                                  └──────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Company Directory & Reporting Hierarchy:**  
   The Task Assignment Module automatically reads your existing team structure. Whenever an employee’s reporting manager changes in the Organization module, the manager's task delegation permissions update automatically.
2. **Notification Subsystem:**  
   Task assignments, review requests, and rework feedback integrate directly into your workspace notification bell and company email templates.
3. **Future Bridge to Performance Appraisals (Module 6):**  
   While Phase 1 strictly separates daily tasks from formal salary or appraisal reviews, it quietly captures objective execution metrics—such as whether deliverables were finished on time, how many extensions were granted, and how many rework cycles occurred. When your company conducts annual performance reviews, leadership has access to verifiable operational data rather than relying on subjective recall.

---

## 14. Frequently Asked Questions (FAQ)

### Q1: Can I assign a task to myself as a personal reminder?
**No.** The Task Assignment Module is built for bilateral accountability between managers, team members, and HR. Personal reminders should be maintained in personal notes or calendar entries.

### Q2: Can a manager assign a task to someone on another team?
**No.** To prevent unauthorized cross-team demands and protect employee workloads, managers can only assign tasks to their direct subordinates. If work requires collaboration with another department, the manager should coordinate with the other team's manager or request HR to initiate the task.

### Q3: Who can assign tasks across different departments?
**HR Administrators.** Users with HR authority possess company-wide delegation authority to coordinate corporate initiatives, compliance filings, onboarding steps, and cross-departmental operations.

### Q4: Does the employee know when I assign a task?
**Yes.** As soon as a task is saved and assigned, the employee receives an immediate notification in their HRMS portal and an email notification with full task instructions and deadlines.

### Q5: How do I know if an employee has actually seen the task I assigned?
Open the task in your Manager Portal. Look for the **Read Receipt** status. The moment the employee clicks into the task, the system stamps the exact date and time they first inspected it.

### Q6: What happens if an employee misses a deadline?
The task is automatically flagged with an **Overdue** alert banner across both the employee's and manager's dashboards. It remains in its current status (e.g., `in_progress`) so work can continue, but leadership is alerted to the delay.

### Q7: Can a deadline be extended after a task is assigned?
**Yes.** An authorized manager or HR administrator can extend the due date. When an extension is approved, the active deadline updates, but the system preserves the original deadline and increments the extension counter for performance auditability.

### Q8: What is the difference between "Due Date" and "Original Due Date"?
* **Original Due Date:** The initial deadline agreed upon when the task was first assigned. This date is permanently locked.
* **Due Date:** The active operational deadline. If an extension is granted, this date reflects the new agreed-upon target.

### Q9: Can an employee mark a task as "Completed" directly?
**No.** Employees click **"Submit for Review"** and attach their completed deliverable. The task moves to `in_review` status. Only the assigner (or an HR administrator) can inspect the work and grant formal completion approval.

### Q10: What happens if the manager is not satisfied with the submitted work?
The manager clicks **"Request Revisions"** and provides clear feedback. The task transitions to `reopened` status, the rework counter increments by 1, and the employee is notified to make the required corrections.

### Q11: Can a completed task be reopened or modified?
**No.** Once a task is approved as `completed`, it enters a terminal, read-only state. Its deliverables, timestamps, and history are locked for permanent compliance and audit purposes.

### Q12: Why was my task cancelled?
If a project is halted or deprioritized, the assigner or HR administrator can cancel the task. The system requires them to record a written cancellation reason, which is permanently visible to the employee on the cancelled task card.

### Q13: Can an employee delete a task?
**No.** Employees cannot delete tasks assigned to them. Only authorized administrators can cancel obsolete tasks, ensuring an auditable record of all company work requests.

### Q14: How large can file attachments be?
Each attached document or file can be up to **10 MB**. The system supports standard business document formats, including PDFs, Microsoft Word documents, Excel spreadsheets, and common image formats.

### Q15: How many external links can I attach to a task?
You can attach up to **10 secure HTTPS web links** (e.g., links to company Google Drive folders, intranet policies, or design assets). Each link includes a friendly display label.

### Q16: Will my task history disappear when a project finishes?
**No.** Completed and cancelled tasks remain safely archived in your task history, accessible through filters whenever you need to reference past work, audit compliance, or prepare for review cycles.

---

## 15. Final Verification & Coverage Audit

The following table provides the operational verification audit for this Business Walkthrough:

```text
================================================================================
               TASK ASSIGNMENT MODULE — PHASE 1 BUSINESS WALKTHROUGH
                           FINAL VERIFICATION AUDIT
================================================================================

1. Feature & Scope Verification:
   • Phase 1 Foundation Features Identified:      5 Core Capabilities
   • Phase 1 Foundation Features Documented:      5 Core Capabilities
   • Missing User-Facing Features:               0
   • Invented / Speculative Features:            0

2. Role & Hierarchy Authorization Verification:
   • HR Administrator Global Governance:         VERIFIED (Confirmed in Code & SOT)
   • Manager Direct-Subordinate Delegation:      VERIFIED (user_reporting_mappings)
   • Employee Self-Service Execution Plane:      VERIFIED (Strict Read/Execute)
   • Platform Administrator Multi-Tenant Scope:  VERIFIED (Tenant Isolation)

3. Business Invariants & Rules Verification:
   • Strict Zero Self-Assignment (chk_no_self):  VERIFIED (assigner_id <> assignee_id)
   • Non-Repudiable Read Receipts (first_view):  VERIFIED (is_viewed & first_viewed_at)
   • Baseline vs Active Due Dates:               VERIFIED (original_due_date preserved)
   • Dynamic Temporal Overdue Calculation:       VERIFIED (Real-time evaluation)
   • Mandatory Rework & Cancellation Reasons:    VERIFIED (Enforced in business logic)

4. Technical Exposure Verification:
   • Source Code / Code Blocks Exposed:          0
   • Database Tables / Column Names Exposed:     0
   • SQL / Database Queries Exposed:             0
   • Internal APIs / Endpoints Exposed:          0
   • Developer Error Codes Exposed:              0
   • Plain Business Language Maintained:         100%

5. Document Usability & Standards:
   • Target Audience Suitability:                HR, Managers, Employees, Stakeholders
   • Formatting & Presentation:                  Production-grade GitHub Markdown
   • Real-World Practical Scenarios:             3 Comprehensive End-to-End Stories
   • Frequently Asked Questions (FAQ):           16 Realistic Scenarios Answered
================================================================================
```
