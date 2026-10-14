# Task Assignment Module — Phase 4 User-Facing Business Walkthrough

**Document File:** `public/md_task-assignment/phases/phase4_business_walkthrough.md`  
**Audience:** HR Administrators, People Managers, Employees, Department Leads, Executive Leadership  
**Product Version:** Dakshi HRMS (HRClouds / HRVista Soft Solutions) — Task Assignment Module  
**Scope:** Phase 4 (Contextual In-Task Discussions, Progress Milestone Tracking, Chronological Discussion Feeds, Automated System Hand-off Notes & Anti-Spam Collaboration Safeguards)  

---

## 1. Executive Summary & Purpose of Phase 4

Welcome to the **Task Assignment Module Phase 4 Business Walkthrough**.

In previous phases, Dakshi HRMS established the structural foundation of task management:
* **Phase 1 & Phase 2:** Created hierarchical task delegation, strict managerial reporting lines, transparent due dates, employee self-service lists, dynamic overdue detection, and verifiable read receipts.
* **Phase 3:** Completed the formal lifecycle: deliverable submission gates, manager approval and rework cycles, subordinate reassignment, immutable due date extensions, two-mode cloud file attachments, and concurrency protections.

**Phase 4 introduces live collaboration directly on the task record.** It transforms static task records into interactive, auditable collaboration hubs.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                      THE IN-TASK COLLABORATION ECOSYSTEM (PHASE 4)                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │ TASK: "Western Region Q3 Financial Reconciliation" (Due: Oct 20)                 │   │
│   ├─────────────────────────────────────────────────────────────────────────────────┤   │
│   │ Status: IN PROGRESS | Assignee: Jordan Hayes | Manager: Sarah Jenkins           │   │
│   ├─────────────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                                 │   │
│   │ [DISCUSSION THREAD]                                                             │   │
│   │                                                                                 │   │
│   │ 👤 Sarah Jenkins (Manager) · Oct 13, 10:15 AM                                   │   │
│   │   "Please verify regional variance against the new corporate guidelines."       │   │
│   │   🔗 Link: Corporate Guidelines 2026                                            │   │
│   │                                                                                 │   │
│   │ 👤 Jordan Hayes (Assignee) · Oct 14, 09:30 AM · [⭐ PROGRESS MILESTONE]         │   │
│   │   "Draft reconciliation completed. Variance table is 50% reconciled."           │   │
│   │   📎 Attached: Western_Draft_v1.xlsx                                            │   │
│   │                                                                                 │   │
│   │ ⚙️ SYSTEM NOTE (Administrative) · Oct 14, 11:00 AM                               │   │
│   │   "REWORK REQUESTED: Missing regional variance sheet reconciliation."            │   │
│   │                                                                                 │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│   * Key Collaboration Pillars:                                                          │
│     1. Contextual Discussion: Eliminates lost messages across scattered email/chat.     │
│     2. Milestone Highlighting: Distinguishes operational updates from casual talk.      │
│     3. Administrative Transparency: Auto-injects rework, reassign & cancel notes.       │
│     4. Secure External Links & Files: Safe sharing without metadata/security risks.     │
│     5. Anti-Spam Protection: Limits comment flooding with generous hourly allowances.   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### What Business Problems Does Phase 4 Solve?

1. **The "Scattered Conversations" Trap:**  
   When team members discuss task requirements across Slack, WhatsApp, and fragmented email threads, vital instructions get lost. When a project is handed off or audited weeks later, nobody remembers why specific decisions were made. Phase 4 keeps all conversations bound directly to the task itself.
2. **The "Silent Progress" Blindspot:**  
   Managers often have to chase team members for updates: *"Is this half-done? Have you started the financial model?"* Phase 4 gives employees an explicit **Progress Milestone** toggle so they can broadcast verified achievements without triggering an early formal submission.
3. **The "Lost Handoff Context" Problem:**  
   When a manager reassigns work to another team member or sends a deliverable back for revisions, the new employee or assignee often lacks context. Phase 4 automatically writes formatted **System Notes** into the discussion feed explaining *why* work was sent back or *why* it was reassigned.
4. **The "Comment Spam & Harassment" Exposure:**  
   Without rate limits, automated scripts or accidental double-clicking could flood task threads with hundreds of duplicate messages. Phase 4 introduces a balanced anti-spam shield that allows productive discussions while preventing message flooding.
5. **The "Dangerous External Link" Risk:**  
   Employees often paste external reference links (Figma designs, cloud documents, project boards). Phase 4 automatically validates all links to guarantee they use secure web connections (`https://`) and do not point to vulnerable internal servers or sensitive corporate cloud metadata.

---

## 2. Who Can Use Phase 4 Features?

Access to task discussion threads follows the strict organizational hierarchy and security boundaries of Dakshi HRMS:

| User Role | Post Comments as Assignee | Post Comments as Manager | View Discussion Feed | Post Progress Milestones | Filter by Milestones |
|---|:---:|:---:|:---:|:---:|:---:|
| **Employee** | **YES** (On assigned tasks) | NO | **YES** (On assigned tasks) | **YES** (On assigned tasks) | **YES** |
| **People Manager** | **YES** (If assigned work) | **YES** (On team tasks) | **YES** (On team & assigned tasks) | **YES** (If assignee) | **YES** |
| **HR Administrator** | **YES** (If assigned work) | **YES** (Org-wide tasks) | **YES** (Org-wide tasks) | **YES** (If assignee) | **YES** |
| **Platform Admin** | **YES** (If assigned work) | **YES** (Org-wide tasks) | **YES** (Org-wide tasks) | **YES** (If assignee) | **YES** |

### Detailed Role Responsibilities

#### 1. Employees (`employee`)
* **Core Focus:** Daily task progress, operational updates, and questions.
* **Permissions:** Can post messages and milestone updates on tasks assigned to them, attach uploaded work files, link external references, and view the complete discussion history. Employees cannot post managerial feedback on other employees' tasks.

#### 2. People Managers (`manager`)
* **Core Focus:** Quality coaching, mid-flight review feedback, and operational instructions.
* **Permissions:** Can post managerial guidance and review comments on tasks assigned to their direct reporting subordinates, inspect team discussion threads, and review employee progress milestones. Managers cannot participate in discussions on tasks outside their department hierarchy.

#### 3. HR Administrators (`hr`) & Platform Admins (`admin`)
* **Core Focus:** Global governance, policy compliance, and cross-departmental coordination.
* **Permissions:** Possess company-wide access. Can inspect discussion threads on any task across all departments and post guidance notes to assist managers or ensure statutory compliance.

---

## 3. Core Concepts & Capabilities

### 3.1 Contextual Task Discussion Thread
Every task record features a dedicated **Discussion** tab that contains a chronological conversation stream. Unlike public team channels, this stream is private to the authorized task participants (the employee, the manager who assigned the task, direct line supervisors, and HR).

### 3.2 General Messages vs. Progress Milestones
Not all comments carry the same weight:
* **General Comment:** Clarifying a requirement, asking a question, or coordinating meeting times.
* **Progress Milestone:** When the **Flag as Progress Milestone** checkbox is enabled, the comment is highlighted with a gold milestone badge (`⭐ Progress Milestone`). This allows managers to filter the feed and quickly scan major accomplishments without reading through every conversational exchange.

### 3.3 Automated Administrative System Notes
Whenever critical lifecycle events occur, the system automatically posts an indelible note into the conversation feed:
* **Rework Requested:** When a manager rejects a deliverable during review, the system logs the manager's feedback as:  
  `REWORK REQUESTED: [Feedback entered by manager]`
* **Task Reassigned:** When work is transferred to another employee, the system logs:  
  `TASK REASSIGNED: Reassigned to [New Employee Name]. Reason: [Reassignment reason]`
* **Task Cancelled:** When a task is formally called off, the system logs:  
  `TASK CANCELLED: [Cancellation reason]`

These system notes guarantee complete historical continuity so any team member inspecting the task understands its full background.

### 3.4 Secure File Attachments & Web References
Comments can bundle supporting evidence:
* **File Attachments:** Up to 10 supporting documents, spreadsheets, or images (already uploaded to the task) can be linked directly to a comment.
* **External Links:** Up to 5 secure HTTPS links (e.g., Google Drive documents, Jira tickets, Pull Requests, Figma designs) can be added with descriptive labels.

---

## 4. Employee Self-Service: Posting Comments & Milestones

### What is this feature?
Enables an assigned employee to communicate operational status, ask questions, or broadcast work milestones directly to their manager.

### Why does it exist?
Eliminates communication silos. Rather than writing an email that only the manager sees, keeping the discussion on the task record ensures that if another manager steps in, the entire project background is immediately visible.

### Where can the user access it?
1. Log in to Dakshi HRMS.
2. From the main menu, navigate to **Task Assignment → My Tasks**.
3. Click on the task you want to update.
4. Select the **Discussion** tab in the task detail view.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [MY TASKS] > TASK DETAILS: "Q3 Sales Performance Deck"                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [Details]  [Attachments]  [DISCUSSION (3)]                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Leave a Comment:                                                               │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ Completed initial draft of Western Region sales analysis. Discrepancies   │  │
│  │ have been reconciled against the Q2 baseline.                             │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [X] Flag as Progress Milestone ⭐                                              │
│                                                                                 │
│  Attach Files:  [+ Select Task Deliverable (1/10)]                              │
│  External Link: Label [ Western Sheet ]  URL [ https://docs.google.com/... ]   │
│                                                                                 │
│  [ Post Comment ]                                                               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Workflow

1. Open the task and scroll to the **Discussion** tab.
2. Enter your update in the **Leave a Comment** text box.
3. *(Optional)* If this update represents a significant deliverable milestone (e.g., "50% Completed", "Draft Architecture Ready"), check the box: **Flag as Progress Milestone**.
4. *(Optional)* Select any previously uploaded deliverables you wish to reference in this specific note.
5. *(Optional)* Click **Add Link** to attach any relevant external resources (e.g., cloud spreadsheets, design files).
6. Click **Post Comment**.

### Required vs. Optional Information
* **Comment Message (Required):** Must contain between 1 and 2,000 characters. Cannot be blank.
* **Flag as Progress Milestone (Optional):** Checkbox (default: unchecked).
* **Referenced Attachments (Optional):** Up to 10 verified task attachments.
* **External Links (Optional):** Up to 5 web links. Each link requires a **Label** (1–100 characters) and a secure **URL** (`https://...`).

### What happens after you post?
* The message appears immediately in the task's chronological conversation feed with your name, photo, and timestamp.
* If flagged as a milestone, it displays a distinct **Milestone** badge.
* The action is recorded in the permanent task audit trail.
* Your manager can view the comment when reviewing the task.

---

## 5. Manager & HR Oversight: Providing Feedback & Guidance

### What is this feature?
Enables People Managers, assigning supervisors, and HR administrators to post directions, ask clarifying questions, or provide feedback directly on a team member's task.

### Why does it exist?
Provides structured managerial coaching. When managers need to guide an employee during active work (without rejecting or approving the task), posting in the task thread keeps instructions visible and actionable.

### Where can the user access it?
* **People Managers:** Navigate to **Task Assignment → Team Tasks** (or **Assigned by Me**), select the employee's task, and click the **Discussion** tab.
* **HR Administrators:** Navigate to **Task Assignment → Organization Tasks**, click on any task, and open the **Discussion** tab.

### Step-by-Step Workflow

1. Open the subordinate's task from your team task list.
2. Navigate to the **Discussion** tab.
3. Review existing updates and milestones posted by the employee.
4. Type your instructions, review feedback, or questions into the comment box.
5. *(Optional)* Attach external reference guidelines or corporate policy links.
6. Click **Post Feedback**.

### Required vs. Optional Information
* **Feedback Message (Required):** Must contain between 1 and 2,000 characters.
* **External Links (Optional):** Up to 5 secure HTTPS links.
* **Referenced Attachments (Optional):** Up to 10 verified task attachments.

### What happens after you post?
* The comment appears in the feed displaying your managerial title, photo, and timestamp.
* The employee can immediately read your guidance upon opening the task.
* The comment is immutably logged for audit traceability.

---

## 6. Chronological Discussion Feeds: Reviewing Collaboration History

### What is this feature?
A transparent, complete historical ledger of all communications, milestones, and administrative events that have occurred throughout the task's life.

### Who can view it?
Any user authorized to access the task:
* The assigned employee.
* The supervisor who assigned the task.
* Line managers in the direct reporting tree.
* HR Administrators and Platform Admins.

Unrelated employees cannot view the discussion feed.

### Key Feed Features

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ DISCUSSION FEED (Showing 3 comments)                     [ Filter: All ▼ ]     │
│ Sort: [ Oldest First ▲ ]                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  👤 Sarah Jenkins (Manager) · Oct 13, 2026, 10:15 AM                            │
│     Please make sure to reconcile against both regional and national sales.     │
│                                                                                 │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                 │
│  👤 Jordan Hayes (Assignee) · Oct 14, 2026, 09:30 AM  [⭐ MILESTONE]            │
│     Completed initial draft of Western Region Q3 sales analysis. Discrepancies  │
│     have been reconciled against national baselines.                            │
│     📎 Attached: Western_Q3_Reconciled.xlsx (2.4 MB)                            │
│     🔗 Link: Western Region Reconciled Sheet (docs.google.com)                  │
│                                                                                 │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                 │
│  ⚙️ SYSTEM NOTE (Sarah Jenkins) · Oct 14, 2026, 11:00 AM                       │
│     REWORK REQUESTED: Missing regional variance sheet reconciliation            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

1. **Chronological Stream:** Displays messages in sequence (`Oldest First` by default, or `Newest First` if toggled).
2. **Author Identity:** Clearly shows the author's display name, profile avatar, and posting date/time.
3. **Milestone Filtering:** Click the filter dropdown to switch between **All Comments** and **Milestones Only**. When "Milestones Only" is selected, casual conversation is hidden, leaving only major progress checkpoints.
4. **Clickable Links & Deliverables:** External links and attached files can be opened or downloaded directly from the feed card.
5. **Pagination:** Displays up to 50 comments per page with clean Next/Previous navigation controls for long-running projects.

---

## 7. Administrative System Comments: Transparency Across Critical Transitions

When management performs significant administrative changes, Dakshi HRMS automatically records a **System Note** in the discussion feed. This eliminates confusion and creates an unshakeable audit trail.

### 1. The Rework Notice
* **When it occurs:** When a manager reviews submitted work and clicks **Request Rework** rather than approving it.
* **What appears in the feed:**
  > **⚙️ SYSTEM NOTE · REWORK REQUESTED:**  
  > *"Please correct the reconciliation table in slide 4 to match the audited figures."*
* **Why it matters:** The employee immediately sees why their submission was sent back without needing to check external emails.

### 2. The Task Reassignment Handoff
* **When it occurs:** When a manager reassigns work to another employee (e.g., due to illness, workload rebalancing, or skill alignment).
* **What appears in the feed:**
  > **⚙️ SYSTEM NOTE · TASK REASSIGNED:**  
  > *"Reassigned to Alex Rivera. Reason: Original assignee on emergency medical leave for two weeks."*
* **Why it matters:** When Alex opens the task for the first time, they immediately see why they received it and what had already been done.

### 3. The Task Cancellation Rationale
* **When it occurs:** When a manager or HR Administrator calls off an active task before completion.
* **What appears in the feed:**
  > **⚙️ SYSTEM NOTE · TASK CANCELLED:**  
  > *"Project cancelled due to Q4 corporate budget reprioritization and vendor consolidation."*
* **Why it matters:** Protects employee performance records. Management and HR can see that the task was terminated due to business decisions rather than employee failure.

---

## 8. User-Facing Business Validations, Limits & Protections

To keep discussions professional, secure, and performant, the system enforces several practical business rules:

| Rule | Business Restriction | Why It Exists & What to Do |
|---|---|---|
| **Message Length** | 1 to 2,000 characters | Comments cannot be empty. For comprehensive project briefings longer than 2,000 characters, upload a document and link it in your comment. |
| **Hourly Comment Limit** | Maximum 30 comments per user per task per hour | Prevents accidental flooding or message spam. If you reach this limit, a banner advises: *"You have reached the hourly limit of 30 comments for this task. Please wait X minutes before posting again."* |
| **Cancelled Tasks Locked** | New comments prohibited on cancelled tasks | When a task is cancelled, work on it has ceased. The discussion thread becomes read-only. Existing messages remain visible for reference. |
| **Secure Web Links Only** | Must use `https://` on valid public websites | Non-secure (`http://`) links or links pointing to internal network IP addresses (e.g., `192.168.x.x` or `127.0.0.1`) are blocked to safeguard corporate IT infrastructure. |
| **File Attachment Binding** | Maximum 10 attachments per comment | Files attached to a comment must belong to the active task. You cannot reference files uploaded to other employees' tasks or external organizations. |
| **External Link Cap** | Maximum 5 links per comment | Keeps discussion cards clean and readable. Each link requires a descriptive label (1–100 characters). |
| **Access Isolation** | Only task participants can view or comment | Unrelated team members cannot see tasks outside their purview, ensuring salary, compliance, and confidential project discussions remain secure. |

---

## 9. Success & Failure Scenarios: What Users See

### 9.1 Successful User Journeys

#### Journey 1: Employee Posts Progress Milestone
1. Jordan opens their active financial task.
2. Types: *"Completed Western Region draft reconciliation against national sales numbers."*
3. Checks **Flag as Progress Milestone**, attaches `Draft_Recon.xlsx`, and clicks **Post Comment**.
4. **Result:** Green confirmation banner appears: *"Comment posted successfully."* The comment displays in the feed with a gold milestone badge and downloadable attachment link.

#### Journey 2: Manager Reviews Progress and Leaves Guidance
1. Sarah opens her Team Tasks view and clicks on Jordan's task.
2. She selects the **Milestones Only** filter and immediately spots Jordan's draft note.
3. She types: *"Great progress. Please ensure you cross-check against Section 4 of the guidelines."*
4. Clicks **Post Feedback**.
5. **Result:** Green confirmation banner appears: *"Managerial comment posted successfully."*

---

### 9.2 Failure Scenarios & Recommended User Actions

#### Scenario 1: Commenting on a Cancelled Task
* **What the user does:** Opens a task marked as `Cancelled` and attempts to submit a comment.
* **What the user sees:** An error alert:  
  *"Cannot post comments on a cancelled task. This task has been terminated and its discussion thread is closed."*
* **What to do next:** If work needs to continue, contact your manager or HR to create a new task.

#### Scenario 2: Hourly Rate Limit Reached
* **What the user does:** Posts more than 30 comments on the same task within an hour.
* **What the user sees:** A rate-limiting alert:  
  *"Rate limit exceeded: maximum 30 comments per hour allowed per task. Please wait 14 minutes before submitting your next comment."*
* **What to do next:** Wait until the countdown completes before posting your next message.

#### Scenario 3: Submitting an Insecure or Internal Web Link
* **What the user does:** Pastes an internal IP link (e.g., `http://192.168.1.50/report` or `https://169.254.169.254/`).
* **What the user sees:** An input validation error:  
  *"Invalid external link: URL must be a valid, secure public HTTPS address."*
* **What to do next:** Update the link to use a secure public address (e.g., `https://docs.google.com/...`) or upload the document directly as an attachment.

#### Scenario 4: Manager Attempting to Comment on an Out-of-Hierarchy Task
* **What the user does:** A manager attempts to access or comment on a task belonging to an employee in another department.
* **What the user sees:** Access denied notice:  
  *"You do not have permission to comment on this task. You can only manage tasks assigned to your direct active subordinates."*
* **What to do next:** Only the designated assigner, the employee's direct line manager, or HR can comment on this task.

---

## 10. How Phase 4 Enhances Previous Phases

Phase 4 completes the operational puzzle by bringing rich communication to the workflows built in Phases 1, 2, and 3:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        DAKSHI HRMS TASK MODULE MATURITY MATRIX                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  PHASE 1: Foundation & Data Security                                                    │
│  • Established multi-tenant database models and immutable audit tables.                 │
│  • Guaranteed that data cannot leak between client companies.                           │
│                                                                                         │
│  PHASE 2: Delegation & Self-Service                                                     │
│  • Created task delegation (/manager) and employee task tracking (/me).                 │
│  • Added non-repudiable read receipts (First Viewed At).                                │
│  • Introduced dynamic overdue tracking without stale database flags.                    │
│                                                                                         │
│  PHASE 3: Review Gates & File Storage                                                   │
│  • Added formal Deliverable Submission and Review Approval gates.                       │
│  • Introduced Rework, Reassignment, Cancellation & Due Date Extension workflows.        │
│  • Enabled direct browser-to-cloud file uploads with 20-file task quotas.               │
│                                                                                         │
│  PHASE 4: Live Collaboration & Provenance Audit (NOW SHIPPED)                           │
│  • Contextual in-task discussion threads for employees, managers, and HR.               │
│  • Milestone tagging for scannable executive progress reviews.                          │
│  • Automated system notes logging rework, handoffs, and cancellations.                  │
│  • Anti-spam rate limiting and secure external link protection.                         │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Real-World Business Scenarios

### Scenario A: Mid-Flight Clarification & Milestone Update
1. **Context:** Jordan is working on a complex financial report. Halfway through, they notice a discrepancy in the Q2 regional numbers.
2. **Action:** Jordan posts a comment: *"Discrepancy identified in Western Region Q2 numbers. Reconciled against audited ledger."* Jordan flags it as a **Progress Milestone** and attaches the reconciliation sheet.
3. **Outcome:** Jordan's manager, Sarah, opens the task and filters by **Milestones Only**. She immediately sees the milestone, reviews the attached sheet, and replies: *"Great catch. Confirmed with finance. Proceed with draft."*
4. **Value:** Both parties stayed aligned without a single external email or meeting.

### Scenario B: Seamless Handoff During Emergency Leave
1. **Context:** Alex Rivera is assigned to complete a client onboarding checklist. Two days before the deadline, Alex is admitted to the hospital.
2. **Action:** Sarah (Manager) reassigns the task to Taylor Brooks. In the reassignment modal, Sarah enters: *"Reassigned due to Alex's medical leave. Alex completed steps 1 through 3."*
3. **Outcome:** 
   * The task moves to Taylor's queue.
   * Taylor opens the task and reads the system note:  
     `TASK REASSIGNED: Reassigned to Taylor Brooks. Reason: Reassigned due to Alex's medical leave...`
   * Taylor also reads Alex's previous comments and downloaded files in the discussion feed.
4. **Value:** Zero downtime. Taylor picks up exactly where Alex left off with full context.

### Scenario C: Clean Audit Trail on Cancelled Corporate Projects
1. **Context:** A company-wide initiative to redesign regional sales brochures is cancelled following a marketing leadership change.
2. **Action:** The HR Administrator cancels the task, entering: *"Marketing leadership restructured; print brochures cancelled in favor of digital assets."*
3. **Outcome:**
   * The task status immediately shifts to **Cancelled**.
   * The system logs a permanent note:  
     `TASK CANCELLED: Marketing leadership restructured...`
   * The discussion feed is locked to prevent further comments, but remains visible for auditing.
4. **Value:** During year-end performance reviews, nobody questions why the brochure task was unfinished—the cancellation rationale and corporate context are permanently preserved.

---

## 12. Frequently Asked Questions (FAQ)

### Q1: Who can see the comments I post on a task?
**Answer:** Comments are strictly private to the task's authorized participants: you (the assignee), your manager, managers higher in your direct reporting line, and HR Administrators. Colleagues in other teams or unrelated employees cannot see your task or its discussion feed.

### Q2: What is the difference between a regular comment and a Progress Milestone?
**Answer:** A regular comment is for day-to-day coordination, asking questions, or discussing details. A **Progress Milestone** is an explicit work achievement (e.g., "Phase 1 Complete", "Draft Shared with Client"). Milestones receive a gold badge and can be filtered so managers can view major updates at a glance.

### Q3: Can I edit or delete a comment after posting it?
**Answer:** To maintain complete corporate audit compliance and prevent disputes, comments in Dakshi HRMS cannot be edited or deleted once posted. If you need to correct information, simply post a follow-up comment referencing the earlier update.

### Q4: Can I still post comments after a task has been completed?
**Answer:** Yes! Once a task is marked `Completed`, team members can continue posting comments (e.g., to share post-launch results, archive handover notes, or ask follow-up questions).

### Q5: Can I post comments on a task that was cancelled?
**Answer:** No. When a task is marked `Cancelled`, all work and discussions are formally terminated. You can still read all previous comments and system notes, but the comment input box is disabled.

### Q6: Why did I receive a message saying I exceeded the comment limit?
**Answer:** To protect system performance and prevent spam, Dakshi HRMS limits each user to **30 comments per task per hour**. This is more than enough for normal work discussions. If you hit this limit, the system displays a timer showing when your next comment can be posted.

### Q7: Why was my external link rejected?
**Answer:** All web links must start with `https://` and point to secure, publicly accessible websites (e.g., Google Drive, Figma, GitHub, Jira). The system automatically blocks non-secure (`http://`) links and addresses pointing to private internal servers to protect corporate security.

### Q8: Does posting a comment change the task status?
**Answer:** No. Posting comments and milestones keeps everyone updated on your progress, but does not alter the task status. When you are ready for formal managerial evaluation, use the **Submit Deliverables** button to move the task to `In Review`.

---

## 13. Summary Checklist for Users

| What do you want to do? | Where to go | Action to take |
|---|---|---|
| **Post a daily work update** | Task Details → Discussion Tab | Enter message and click **Post Comment**. |
| **Share a major milestone** | Task Details → Discussion Tab | Enter message, check **Flag as Progress Milestone**, and click **Post Comment**. |
| **Attach a file to a discussion** | Task Details → Discussion Tab | Select up to 10 previously uploaded task deliverables in the attachment picker. |
| **Share an external reference** | Task Details → Discussion Tab | Enter a label and a valid `https://` URL in the link section. |
| **View milestones only** | Task Details → Discussion Tab | Change the filter dropdown from *All Comments* to *Milestones Only*. |
| **Provide managerial feedback** | Team Tasks → Discussion Tab | Enter guidance in the comment box and click **Post Feedback**. |
| **Check why a task was reopened** | Task Details → Discussion Tab | Read the automated `⚙️ SYSTEM NOTE · REWORK REQUESTED` at the top of the feed. |
| **Check why a task was cancelled** | Task Details → Discussion Tab | Read the automated `⚙️ SYSTEM NOTE · TASK CANCELLED` in the discussion stream. |
