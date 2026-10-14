# Task Assignment Module — Phase 2 User-Facing Business Walkthrough

**Document File:** `public/md_task-assignment/phases/phase2_business_walkthrough.md`  
**Audience:** HR Administrators, People Managers, Employees, Department Leads, Executive Leadership  
**Product Version:** Dakshi HRMS (HRClouds / HRVista Soft Solutions) — Task Assignment Module  
**Scope:** Phase 2 (Live Work Delegation, Reporting Hierarchy Engine, Employee Self-Service, Read Receipts & Enterprise Oversight)  

---

## 1. Executive Summary & Purpose of Phase 2

Welcome to the **Task Assignment Module Phase 2 Business Walkthrough**.

While Phase 1 established the enterprise data schema, multi-tenant boundaries, and governance rules behind the scenes, **Phase 2 brings the Task Assignment Module to life for everyday users**.

Phase 2 delivers the live user interfaces, personal work queues, supervisory dashboards, and company-wide governance portals across three dedicated organizational planes:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    TASK ASSIGNMENT THREE-PLANE OPERATIONAL MODEL                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  1. EMPLOYEE SELF-SERVICE PORTAL ("My Work Execution")                                  │
│     • Personal Task Queue: View all tasks delegated to you.                             │
│     • Automatic Read Receipts: Opening a task verifies your acknowledgment.             │
│     • Active Execution: Acknowledge and transition tasks between Pending & In Progress. │
│                                                                                         │
│  2. MANAGERIAL DELEGATION & SUPERVISION ("Team Operational Delivery")                   │
│     • Hierarchical Delegation: Assign work strictly to your direct subordinates.        │
│     • Tasks Assigned by Me: Track the status and read-receipts of tasks you delegated.   │
│     • Team Task Roster: Comprehensive visibility into your direct team's workload.      │
│     • Read-Only Inspection: Inspect subordinate tasks without altering read receipts.   │
│                                                                                         │
│  3. HR & ADMINISTRATIVE GOVERNANCE ("Enterprise Operational Registry")                  │
│     • Enterprise Delegation: Assign tasks across any department in the organization.    │
│     • Organization Task Registry: Company-wide oversight with department filtering.     │
│     • Complete Legal & Compliance Audit: Full history of every action, view, and alert. │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### What Business Problems Does Phase 2 Solve?

1. **The "Fragmented Delegation" Breakdown:** Managers frequently assign tasks through casual chat messages, corridor conversations, or scattered emails. These requests get lost, forgotten, or deprioritized. Phase 2 introduces a **Unified Work Ledger** where all delegated work is recorded in one place.
2. **The "I Never Saw the Task" Excuse:** In traditional email delegation, employees often claim they never received or opened an instruction. Phase 2 introduces **Automatic Non-Repudiable Read Receipts**: the exact second an employee opens a task, the system permanently records that they viewed it.
3. **Cross-Departmental Delegation Friction:** Without software guardrails, managers frequently assign tasks to employees who report to someone else, bypassing proper reporting lines and creating resource conflicts. Phase 2 enforces **Strict Organizational Hierarchy Compliance**: managers can only delegate to their verified direct reports.
4. **The "Silent Overdue" Blindspot:** Tasks often drift past deadlines without anyone noticing until an operational crisis occurs. Phase 2 provides **Real-Time Overdue Tracking**, dynamically highlighting unfinished tasks that have breached their committed deadlines.
5. **Accidental Double-Submission Protection:** Busy managers clicking buttons repeatedly on slow networks risk creating duplicate tasks. Phase 2 includes **Duplicate Click Protection**, ensuring only a single task is created even if a user double-clicks the submit button.

---

## 2. Who Can Use Phase 2 Features?

Access to Phase 2 features is strictly aligned with the employee's role and organizational reporting line:

| User Role | View My Assigned Tasks | Start Work (Pending ⇄ In Progress) | Delegate Tasks to Direct Reports | View Team Task Roster | Assign Tasks Across Departments | View Full Audit Trail |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Employee** | **YES** | **YES** | NO | NO | NO | NO |
| **People Manager** | **YES** | **YES** | **YES** | **YES** | NO | NO |
| **HR Administrator** | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** |
| **Platform Admin** | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** |

### Detailed Role Explanations

#### 1. Employees (`employee`)
* **Focus:** Focused daily execution.
* **Scope:** Private, self-service access to tasks assigned specifically to them.
* **Key Capabilities:** Inspect task instructions, reference links, and deadlines; automatically stamp read receipts; toggle status between `Pending` and `In Progress` to communicate that work is underway.

#### 2. People Managers (`manager`)
* **Focus:** Operational leadership, team coordination, and workload monitoring.
* **Scope:** Restricted strictly to their confirmed direct subordinates.
* **Key Capabilities:** Delegate operational tasks to reporting team members; track whether employees have acknowledged their assignments; review team workloads; inspect tasks without tampering with employee read receipts.

#### 3. HR Administrators (`hr`)
* **Focus:** Enterprise compliance, cross-departmental operations, and legal auditability.
* **Scope:** Entire organization across all departments.
* **Key Capabilities:** Assign tasks to any employee or manager in the company; filter company-wide tasks by department; inspect immutable chronological audit logs showing every change, status shift, IP address, and notification dispatch.

---

## 3. Where Can Users Access Task Assignment Features?

The module is integrated directly into the main navigation of Dakshi HRMS:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PORTAL NAVIGATION & ENTRY POINTS                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [ MAIN NAVIGATION ]                                                       │
│   └── Task Assignment                                                       │
│       ├── My Tasks               ◄── (All Users: Personal Work Queue)       │
│       ├── Team Tasks             ◄── (Managers & HR: Direct Team Workload)  │
│       ├── Tasks Assigned by Me   ◄── (Managers & HR: Delegation Tracker)    │
│       └── HR Task Governance     ◄── (HR & Admin Only: Enterprise Registry) │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

* **My Tasks:** Available to every employee and manager to review and execute personal assignments.
* **Team Tasks:** Available to managers and HR to supervise direct reporting lines.
* **Tasks Assigned by Me:** Available to managers and HR to track all tasks they have personally delegated to others.
* **HR Task Governance:** Available exclusively to HR and Platform Administrators for organization-wide tracking and regulatory audits.

---

## 4. Employee Self-Service: Managing Personal Work

### Feature 1: The Personal Work Queue ("My Tasks")

#### What is this feature?
A clean, centralized to-do list showing all tasks currently assigned to you, sorted by urgency and creation date.

#### Why does it exist?
Eliminates daily confusion about priorities and ensures employees never have to search through chat logs or emails to figure out what they need to work on.

#### Step-by-Step Workflow:
1. Navigate to **Task Assignment $\rightarrow$ My Tasks**.
2. Review the list of active tasks.
3. Use the filter bar to organize your queue:
   * **Filter by Status:** `Pending`, `In Progress`, `In Review`, `Reopened`, `Completed`, `Cancelled`.
   * **Filter by Priority:** `Low`, `Medium`, `High`, `Urgent`.
   * **Filter by Category:** `Operational`, `Compliance`, `Onboarding`, `Administrative`, `General`.
   * **Filter by Read Status:** See which tasks you haven't opened yet.
   * **Filter by Overdue:** Instantly isolate tasks that are past their deadline.
   * **Search Bar:** Type any keyword from the task title.
4. Click on any task card to open the complete details.

---

### Feature 2: Task Detail View & Automatic Read Receipts

#### What is this feature?
When you click on a task card, you see full briefing instructions, reference links, deadline details, and the name of the person who delegated the work.

#### The "Automatic Read Receipt" (Critical Workplace Safeguard):
* The moment you open a task card for the very first time, the system **automatically and permanently records an unalterable Read Receipt**.
* The timestamp and acknowledgment are recorded immediately.
* When your manager views the task, they can clearly see: **"Acknowledged by Alex on Oct 12 at 10:15 AM."**
* This completely eliminates the common workplace dispute: *"I never saw the task assignment."*

> [!NOTE]
> **Privacy Assurance:** Opening your own task stamps your read receipt. However, when your manager or HR inspects your task to check progress, their view is **read-only** and does not alter or erase your read receipt record.

---

### Feature 3: Starting Work (Updating Status)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STARTING WORK: STATUS TOGGLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [ PENDING ] ──────────── (Click "Start Work") ───────────► [ IN PROGRESS ]│
│                                                                             │
│   [ IN PROGRESS ] ──────── (Click "Pause Work") ───────────► [ PENDING ]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### What is this feature?
Allows an employee to communicate whether work has officially commenced.

#### How to use it:
1. Open the task in **My Tasks**.
2. If the task is in `Pending` status, click the **Start Work** button.
3. The task status instantly changes to **In Progress**.
4. Your manager immediately sees that work is actively underway.
5. If unexpected blockers arise and you must temporarily pause work, click **Pause Work** to return the status to `Pending`.

> [!IMPORTANT]
> **Phase 2 Boundary:** In Phase 2, employees toggle tasks between `Pending` and `In Progress`. Once work is fully complete, submitting deliverables for manager review (`In Review`) and formal sign-off (`Completed`) is delivered in Phase 3.

---

## 5. Managerial Delegation & Team Supervision

### Feature 4: Delegating a Task to a Direct Subordinate

#### What is this feature?
Allows a People Manager to create a new task and delegate it directly to a reporting team member.

#### Why does it exist?
Provides managers with a formal, structured tool to hand off work with clear expectations, deadlines, priority ratings, and reference links.

#### Strict Managerial Guardrails:
1. **Reporting Line Restriction:** Managers can **only** assign work to team members who directly report to them. You cannot assign tasks to colleagues across other departments or to peer managers.
2. **Zero Self-Delegation:** You cannot assign a task to yourself. Tasks represent managerial delegation and accountability.
3. **No Upward Delegation to HR:** Managers cannot assign operational tasks to HR or Administrative personnel.
4. **Future Deadline Requirement:** Deadlines must be set at least **15 minutes into the future**. Tasks cannot be created with past deadlines.

#### Step-by-Step Delegation Workflow:
1. Navigate to **Task Assignment $\rightarrow$ Team Tasks** or **Tasks Assigned by Me**.
2. Click the **Create Task** button.
3. Fill in the required task specifications:
   * **Title (Required):** A concise, descriptive summary of the task (3 to 200 characters).
   * **Description (Required):** Clear, detailed instructions explaining what needs to be done (10 to 5,000 characters).
   * **Assignee (Required):** Select a team member from your direct subordinate dropdown list.
   * **Due Date (Required):** Pick an achievable completion date and time (must be at least 15 minutes in the future).
   * **Priority (Optional):** Select `Low`, `Medium`, `High`, or `Urgent` (defaults to `Medium`).
   * **Category (Optional):** Select `Operational`, `Compliance`, `Onboarding`, `Administrative`, or `General` (defaults to `Operational`).
   * **External Links (Optional):** Add up to 5 secure web links (e.g., shared documents, client briefs, design files) with descriptive labels.
4. Click **Assign Task**.

#### What happens immediately after assignment?
* **Instant Outbox Notification:** The selected employee receives an immediate notification alerting them to the new task.
* **Added to Personal Queue:** The task immediately appears in the employee's **My Tasks** list under `Pending` status.
* **Added to Manager Dashboard:** The task appears in your **Tasks Assigned by Me** and **Team Tasks** dashboards.
* **Audit Trail Initialized:** The system permanently records who created the task, who it was assigned to, and the original baseline deadline.

---

### Feature 5: The "Tasks Assigned by Me" Dashboard

#### What is this feature?
A dedicated supervisory screen that shows every task you have personally delegated, across all of your subordinates.

#### Why does it exist?
Enables managers to follow up effectively without having to remember what was delegated to whom.

#### What you can see:
* **Assignee Name & Role:** Who is responsible for the task.
* **Read-Receipt Status:** A clear badge showing whether the assignee has opened the task (`Read` with exact timestamp) or has not yet seen it (`Unread`).
* **Active Status:** Whether the task is `Pending`, `In Progress`, or overdue.
* **Deadline & Overdue Badges:** Tasks approaching their deadline or past due are clearly highlighted in red.
* **Filter by Assignee:** Filter the view to inspect tasks delegated to a specific subordinate.

---

### Feature 6: The "Team Tasks" Workload Roster

#### What is this feature?
A comprehensive team overview that displays all tasks belonging to your reporting team members, regardless of who created them (including tasks assigned to your subordinates by HR).

#### Why does it exist?
Gives managers complete visibility into their team's total operational workload so they can balance assignments, prevent burnout, and spot bottlenecks early.

#### What you can do:
* View your entire team's active tasks in a unified, paginated table.
* Filter by **Subordinate** to conduct 1-on-1 workload reviews.
* Filter by **Priority** to see all urgent tasks across the department.
* Filter by **Overdue** to take proactive corrective action before escalations occur.

---

### Feature 7: Inspecting Subordinate Task Details

#### What is this feature?
Allows a manager to open and inspect the full details of any task belonging to their subordinate.

#### What you can see:
* Complete task instructions, priority, and committed deadlines.
* The employee's read receipt status and exact acknowledgment timestamp.
* Associated external reference links.
* Any comments or progress notes posted by the employee.

> [!NOTE]
> **Read-Only Inspection Guarantee:** When a manager opens a subordinate's task, the manager's view is strictly read-only. It does **not** tamper with or modify the employee's read receipt status.

---

## 6. HR & Administrative Enterprise Governance

### Feature 8: Enterprise Task Delegation (Cross-Departmental)

#### What is this feature?
Allows HR Administrators and Platform Admins to assign tasks to **any active employee or manager across the entire company**.

#### Why does it exist?
While managers focus on daily team operations, HR leads organization-wide initiatives such as annual compliance certifications, policy acknowledgments, onboarding milestones, and statutory reporting.

#### How it differs from Manager Delegation:
* **No Hierarchy Restriction:** HR can assign tasks across departmental boundaries (e.g., assigning a security audit task to an engineer, or a policy review task to a marketing manager).
* **Direct Enterprise Outreach:** Enables rapid distribution of corporate mandates without needing to route tasks through intermediate managers.

---

### Feature 9: The Organization Task Registry

#### What is this feature?
A centralized master directory showing all tasks across the company.

#### Key Administrative Capabilities:
* **Department Filtering:** Isolate tasks belonging to a specific department (e.g., Finance, Engineering, Sales).
* **Assigner & Assignee Search:** Filter tasks delegated by a specific manager or assigned to a specific individual.
* **Corporate Punctuality Metrics:** Monitor organization-wide compliance and overdue task volume in real time.

---

### Feature 10: Complete Audit Governance View

#### What is this feature?
An enterprise audit screen available exclusively to HR and Platform Administrators that provides an indelible chronological ledger of everything that has occurred on a task.

#### What the Audit View Displays:
1. **Full Specification Details:** Original title, description, category, and baseline deadline.
2. **Chronological Audit Trail:** Every single event that has occurred, including:
   * **Task Creation:** Who created it and when.
   * **Read Receipt:** The exact moment the employee opened the task, along with their network IP address and browser details.
   * **Status Updates:** Who toggled the status between `Pending` and `In Progress`.
   * **Edits & Reassignments:** Any changes made to task parameters.
3. **Notification Delivery Log:** A record of system notifications dispatched to the assignee, including timestamp, delivery status, and retry history.

> [!NOTE]
> **Regulatory Assurance:** The audit log is immutable. Entries cannot be edited, deleted, or overwritten by any user, providing verifiable evidence for internal compliance reviews and external regulatory audits.

---

## 7. Task Specifications: Priorities, Categories & Deadlines

Every task in Dakshi HRMS is structured with clear, standardized parameters:

### Priority Ratings

| Priority | Intended Use Case | Visual Indicator |
|---|---|---|
| **Low** | Routine, non-time-sensitive operational tasks or backlog items. | Neutral Gray / Blue |
| **Medium** *(Default)* | Standard day-to-day assignments with normal operational turnaround. | Green / Teal |
| **High** | Important milestones or deliverables that impact other team members. | Amber / Orange |
| **Urgent** | Critical blockers, emergency client escalations, or regulatory deadlines. | Bold Red |

---

### Operational Categories

| Category | Typical Workplace Examples |
|---|---|
| **Operational** *(Default)* | Preparing weekly reports, reviewing pull requests, updating client spreadsheets, resolving customer tickets. |
| **Compliance** | Annual sexual harassment policy acknowledgment, cybersecurity training certification, statutory tax filing. |
| **Onboarding** | Setting up development environments, reviewing company handbooks, completing welcome paperwork. |
| **Administrative** | Submitting travel expense receipts, updating emergency contact details, completing IT asset inventories. |
| **General** | Miscellaneous ad-hoc assignments, team coordination tasks, peer review sessions. |

---

### Deadline & Overdue Management

* **Committed Due Date:** Stored in standardized Universal Coordinated Time (UTC) and displayed in the user's local timezone.
* **15-Minute Future Rule:** All due dates must be set at least 15 minutes into the future. You cannot assign tasks that are already expired.
* **Real-Time Overdue Status:** The system automatically marks an active task as **Overdue** the moment the current time surpasses the deadline. It does not require manual status updates or nightly batch processing.

---

## 8. Status Guide & Transitions in Phase 2

In Phase 2, tasks move through the initial operational lifecycle states:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 2 STATUS TRANSITION MAP                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    [ Manager / HR delegates task ]                          │
│                                   │                                         │
│                                   ▼                                         │
│                              [ PENDING ]                                    │
│                              • Delegated                                    │
│                              • Read receipt stamped when opened             │
│                                   │                                         │
│                   ┌───────────────┴───────────────┐                         │
│                   │ Click "Start Work"            │ Click "Pause Work"      │
│                   ▼                               ▼                         │
│             [ IN PROGRESS ] ────────────────► [ PENDING ]                   │
│             • Active work underway            • Temporarily on hold         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Status | What It Means | What the Employee Can Do | What the Manager Can Do |
|---|---|---|---|
| **Pending** | Task has been assigned but work has not officially commenced. | Open task (stamps read receipt); Click **Start Work**. | Monitor acknowledgment; Review details. |
| **In Progress** | Assignee is actively executing the work. | Add progress comments; Click **Pause Work** if blocked. | Monitor progress notes; Inspect updates. |
| **In Review** | Deliverables submitted for managerial evaluation *(Handled in Phase 3)*. | Awaiting review. | Inspect submitted files; Approve or Request rework. |
| **Reopened** | Work returned for revisions *(Handled in Phase 3)*. | Address feedback and resubmit. | Provide constructive revision notes. |
| **Completed** | Deliverables accepted; Task closed *(Handled in Phase 3)*. | Archived in completed history. | Archived in team history. |
| **Cancelled** | Obsolete task formally terminated *(Handled in Phase 3)*. | Read-only record. | View cancellation reason. |

---

## 9. User-Facing Validation, Safeguards & Error Recovery

Dakshi HRMS includes built-in safeguards to protect data integrity and prevent operational mistakes:

| Action | Required Information | Built-in Safeguard / Business Restriction | User-Facing Failure Message / Behavior |
|---|---|---|---|
| **Create Task** | Title, Description, Assignee, Due Date | Title must be 3–200 characters. Description must be 10–5,000 characters. | Form highlights invalid fields: *"Title must be between 3 and 200 characters."* |
| **Select Due Date** | Future date & time | Must be at least 15 minutes into the future. | Form blocks submission: *"Due date must be at least 15 minutes into the future."* |
| **Select Assignee (Manager)** | Direct subordinate | Cannot select peers, managers outside reporting line, or HR. | Assignee dropdown displays only verified direct active subordinates. |
| **Self-Delegation** | Target assignee | Cannot assign a task to yourself. | Rejection notice: *"Self-assignment is not permitted. Tasks represent managerial delegation."* |
| **Double Click Protection** | Unique submission key | Prevents rapid double-clicking from creating duplicate tasks. | Second click is safely ignored; user is redirected to the created task. |
| **Concurrent Updates** | Current task view | If another user updates a task while you have it open, silent overwrites are blocked. | Alert notice: *"This task was recently modified. Please refresh to see the latest version."* |
| **Access Other Tasks** | Task ID / URL | Employees cannot view tasks assigned to other employees. | System returns *"Task not found"* to protect employee privacy. |

---

## 10. Real-World Workplace Scenarios

### Scenario 1: A Manager Delegates a Crucial Report

```text
Step 1: Monday Morning Delegation
Marcus (Engineering Lead) needs Priya (Senior QA Engineer) to run a security audit on the new payment gateway.
• Marcus opens Team Tasks and clicks "Create Task".
• Title: "Execute Payment Gateway OWASP Vulnerability Audit"
• Description: "Run automated security test suite against staging cluster. Document all findings and verify token sanitization."
• Assignee: Priya (Marcus's direct subordinate)
• Priority: High | Category: Compliance
• Due Date: Wednesday at 5:00 PM
• External Link: "Staging Cluster Credentials & Scope Doc"
• Marcus clicks "Assign Task".

Step 2: Instant Employee Notification & Acknowledgment
• Priya receives an alert on her HRMS dashboard: "Marcus assigned you a new task."
• Priya opens "My Tasks" and clicks on the assignment.
• Behind the scenes, the system instantly logs Priya's Read Receipt:
  "Acknowledged on Monday at 10:45 AM."
• Marcus opens his "Tasks Assigned by Me" dashboard and sees a green "Read" badge next to Priya's name. Marcus knows Priya has seen the instructions and does not need to send follow-up messages.

Step 3: Starting Active Work
• Priya clicks "Start Work". The status updates to "In Progress".
• Marcus's dashboard reflects that Priya is actively testing.
```

---

### Scenario 2: HR Launches a Company-Wide Onboarding Mandate

```text
Context:
The HR department has updated the employee remote work and data privacy policy. Every team lead must submit their updated team emergency contact rosters.

HR Action:
• Elena (HR Director) opens the HR Task Governance dashboard.
• Elena clicks "Create Task" (Enterprise mode).
• Elena delegates tasks to department managers across Engineering, Sales, Support, and Finance.
• Elena filters the Organization Task Registry by Department: "Sales".
• Elena instantly sees which sales managers have acknowledged the request and which managers are currently working on their rosters.
```

---

### Scenario 3: Employee Privacy & BOLA Protection

```text
Context:
Employee Jordan attempts to paste a direct URL to view a task assigned to colleague Alex.

System Protection:
• The system checks Jordan's identity against the task's assigned owner.
• Because Jordan is not the designated assignee, the system displays: "Task not found."
• Alex's confidential task details, performance notes, and instructions remain private and completely protected.
```

---

## 11. Frequently Asked Questions (FAQ)

### Q1: Can I assign a task to myself as a personal reminder?
**No.** The Task Assignment Module is designed for organizational delegation and verifiable accountability. Self-assignment is blocked. If you need personal notes or reminders, use personal productivity tools or calendar alerts.

### Q2: Why don't I see my colleague's name in my assignee dropdown list?
If you are a People Manager, you can only assign tasks to employees who **directly report to you** according to the company's verified reporting structure. If you need to collaborate with a colleague in another department, coordinate through your manager or contact your HR Administrator.

### Q3: Does my manager know when I opened a task?
**Yes.** The moment you open a task card in **My Tasks**, the system automatically records an unalterable read receipt timestamp. This lets your manager know that you have seen the assignment without needing to send an acknowledgment email.

### Q4: If my manager opens my task to check progress, does it reset my read receipt?
**No.** Managerial inspections and HR audits are strictly read-only. They never modify, overwrite, or reset your personal read receipt timestamp.

### Q5: How do I know if a task is overdue?
The system dynamically compares the committed due date against the current time. If a task is past its deadline and has not been completed, it automatically displays a prominent red **Overdue** badge on both your personal view and your manager's dashboard.

### Q6: Can an employee assign a task to their manager?
**No.** Upward delegation is prohibited. Employees have self-service access to view, acknowledge, and execute work assigned to them, but cannot delegate tasks upward or horizontally.

### Q7: What happens if I accidentally click the "Assign Task" button twice?
The system includes built-in duplicate click protection. The second click is safely ignored, ensuring that only one task is created.

### Q8: What should I do if a task's requirements change while I am working on it?
You can post progress updates and questions in the task discussion thread. If significant adjustments or extra time are required, your manager can update task details or extend deadlines.

### Q9: Can HR see tasks assigned within my team?
**Yes.** HR Administrators act as corporate custodians and have organization-wide visibility across all departments for compliance, resource tracking, and audit governance.

### Q10: How do I complete a task and submit my finished deliverables?
In Phase 2, tasks are tracked through active execution (`Pending` and `In Progress`). Submitting completed deliverables with attachments, undergoing formal managerial review, and obtaining approval (`Completed`) is delivered in **Phase 3**.

---

## 12. Summary Checklist for Phase 2 Users

* [x] **Employees:** Check **My Tasks** daily $\rightarrow$ Open assignments to acknowledge read receipts $\rightarrow$ Click "Start Work" when execution begins.
* [x] **Managers:** Delegate work with clear descriptions and realistic future deadlines $\rightarrow$ Verify employee read receipts in **Tasks Assigned by Me** $\rightarrow$ Balance team workloads using the **Team Tasks** roster.
* [x] **HR Administrators:** Supervise company-wide initiatives using **HR Task Governance** $\rightarrow$ Filter registry by department $\rightarrow$ Inspect complete audit trails for regulatory compliance.
