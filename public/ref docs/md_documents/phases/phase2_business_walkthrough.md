# Phase 2: Documents Module (Org-Issued Documents) — Business Walkthrough & User Guide

This document provides a comprehensive, user-facing guide to **Phase 2 of the Documents Module**. It explains how the organization-issued document plane operates, how it solves critical corporate communication and regulatory compliance challenges, and how HR administrators, people managers, and employees interact with company policies, targeted distributions, manager proposals, version replacements, and employee read tracking.

This guide is written in clear business language for HRMS users, operations managers, and enterprise stakeholders. It describes the exact user experience, workflows, permissions, and safeguards implemented in Phase 2 without exposing internal source code, database tables, or technical developer jargon.

---

## 🚀 What Document Module Phase 2 Provides

While Phase 1 established the foundation for **employee-owned documents** (personal records such as PAN Cards, Passports, and Degree Certificates uploaded *about* an individual), Phase 2 introduces the **organization-issued document plane**. This empowers companies to author, govern, target, and distribute institutional documents to their workforce with legal certainty and complete auditability.

Phase 2 introduces:

* **Targeted Institutional Publishing:** HR can author policies, employment letters, or operational notices once and precisely target them to the entire workforce, specific departments, physical office locations, employment types (e.g., Full-Time, Part-Time), or specific job statuses (e.g., Confirmed, Probation).
* **Automated Audience Materialization:** Upon publishing a document, the system instantly evaluates the workforce and delivers an individual copy into every targeted employee's self-service inbox.
* **Immutable Frozen Targeting Snapshot:** To ensure foolproof legal and compliance records, the system permanently freezes the exact targeting criteria, department names, location labels, and recipient counts at the moment of publication. Future renames, reorganizations, or department deletions never alter historical distribution records.
* **Zero-Downtime Policy Versioning ($v1 \rightarrow v2 \rightarrow v3$):** HR can prepare, draft, and attach files for the next version of a policy ($v2$) while the existing version ($v1$) remains live, legally active, and accessible to staff. The previous version is superseded only when the new version is officially published.
* **Policy Retirement Without Historical Loss:** Obsolete policies can be formally withdrawn with an administrative reason. Retired policies are deactivated from active compliance tracking, yet remain accessible in employee historical archives for legal verification.
* **Manager Tier-B Disciplinary & Proposal Workflow:** People Managers can initiate targeted, confidential proposals (e.g., Performance Improvement Plans, Warning Letters, Show Cause Notices) specifically addressed to direct subordinates, routing them to HR for formal verification and publication.
* **Proposer Scope Protection (Maker-Checker Safeguard):** If an employee transfers to a different reporting manager while a disciplinary proposal is awaiting HR review, the system automatically detects the change and prompts HR for an explicit review before publishing.
* **Automated Read & View Verification:** When an employee opens an issued document, the system automatically logs the exact viewing timestamp, transitioning the document from `Pending` to `Viewed` without requiring tedious manual checklists.
* **Workforce Top-Up (Smart Sync):** As new employees join the company or transfer departments, HR can run a one-click sync to top up the recipient roster against the policy's frozen criteria. New joiners receive a fair, freshly calculated due date rather than an overdue notice.
* **Auditable Administrative Exemptions (Waiving):** HR administrators can excuse individual employees from acknowledging a document (e.g., an employee on long-term medical leave or parental sabbatical) with a mandatory business explanation, preserving compliance reporting accuracy.
* **Strict Privacy Isolation:** Employees only see the documents issued to them. They can never inspect who else received a policy, how the audience was targeted, or view internal HR/manager review notes.

---

## 🔑 Key Concepts & Governance Rules

Understanding the fundamental concepts of Phase 2 ensures smooth administration and compliance across the organization.

### 1. Employee Plane vs. Organization Plane
The Documents Module operates two strictly segregated document planes:

| Dimension | Employee-Owned Plane (Phase 1) | Organization-Issued Plane (Phase 2) |
| :--- | :--- | :--- |
| **Document Subject** | An individual employee. | The entire company or a defined subset of employees. |
| **Typical Examples** | PAN Card, Aadhaar, Passport, Degree, Form 16. | Employee Handbook, Leave Policy, POSH Policy, Warning Letter, PIP. |
| **Who Authors / Uploads** | The employee or HR acting on the employee's personal file. | HR Administrators (or Managers proposing for direct reports). |
| **Ownership Anchor** | Anchored to a single person's employee profile. | Anchored to an organizational Policy Group. |
| **Lifecycle** | `Pending Upload` $\rightarrow$ `Pending Verification` $\rightarrow$ `Available`. | `Draft` $\rightarrow$ `Published` $\rightarrow$ `Superseded` / `Retired` / `Rejected`. |
| **Where Employees Access** | **My Documents** (personal records). | **My HR Documents** (issued company documents). |

---

### 2. The Policy Lifecycle State Machine

Every organization-issued document progresses through a structured lifecycle:

```text
 ┌─────────────┐
 │    Draft    │ (Editable, private to HR or proposing Manager)
 └──────┬──────┘
        │
        ├──────────────────────────────────┐
        │ [HR Publish]                     │ [HR Reject - Manager Proposals Only]
        ▼                                  ▼
 ┌─────────────┐                    ┌─────────────┐
 │  Published  │ (Live, Enforceable)│  Rejected   │ (Archived with Feedback)
 └──────┬──────┘                    └─────────────┘
        │
        ├──────────────────────────────────┐
        │ [Publish Replacement v2]         │ [HR Retire]
        ▼                                  ▼
 ┌─────────────┐                    ┌─────────────┐
 │ Superseded  │ (Archived History) │   Retired   │ (Formally Withdrawn)
 └─────────────┘                    └─────────────┘
```

#### Detailed Status Definitions

* **`Draft`**: The document is being authored. Metadata, descriptions, effective dates, acknowledgement settings, and targeting rules are fully editable. Files can be attached, replaced, or updated. The draft is completely invisible to targeted employees.
* **`Published`**: The policy is active, enforceable, and live. Eligible employees have received their copies in "My HR Documents". Exactly one published version can exist per policy group at any time.
* **`Superseded`**: When HR publishes a newer version ($v2$) of a policy, the previous version ($v1$) automatically transitions to `Superseded`. It remains permanently visible in historical records for employees who received it, but is marked as inactive (`is_actionable = false`).
* **`Retired`**: A live policy that HR has formally withdrawn with a recorded business reason. It is no longer actionable, but historical recipients retain read-only access for compliance and audit proof.
* **`Rejected`**: A proposal submitted by a manager that HR declined to publish. A mandatory explanation is recorded, and the manager can view the feedback.

---

### 3. Effective Dates vs. Stored Status (Display Statuses)
To prevent timing discrepancies or system delays from causing false compliance alarms, the system separates legal publication status from calendar-based **Display Statuses**:

* **`Scheduled`**: The policy is published, but its `Effective From` date is in the future.
* **`Active`**: The policy is published and is currently within its active window.
* **`Expired`**: The policy is published, but its `Effective To` date has passed.
* **`Draft` / `Superseded` / `Retired` / `Rejected`**: Display statuses that match their operational states directly.

---

### 4. Recipient States in the Employee Roster

When a policy is published, an individual obligation record is generated for every addressed employee:

* **`Pending`**: The document has been delivered to the employee's "My HR Documents" inbox, but the employee has not yet opened or viewed it.
* **`Viewed`**: The employee has clicked to view or download the document. The system automatically stamps the date and time of first viewing.
* **`Waived`**: HR has granted an administrative exemption to an employee (e.g., sabbatical, extended leave), relieving them of the requirement to review or acknowledge the document.
* **`Acknowledged` / `Signed`**: *(Reserved for Phase 3)* The employee has digitally acknowledged or e-signed the document.

---

### 5. Targeting Rules & Audience Precedence
When defining who should receive a document, HR can combine multiple criteria. The system evaluates eligibility using a strict business hierarchy:

1. **Exclusions Win Outright:** If an employee is listed in `Excluded Users`, they will **never** receive the document, regardless of their department, location, or inclusion in any other list.
2. **Specific Inclusions Restrict:** If specific employees are listed in `Included Users`, the audience is limited to those individuals who also satisfy any active department or location filters.
3. **Attribute Filters (Departments, Locations, Employment Types, Job Statuses):**
   * Leaving an attribute blank means **"All"** (no restriction).
   * Selecting specific attributes requires an employee's official profile to match.
   * *Department matching is strictly based on official department assignments, never free-text labels.*
4. **All-Company (Org-Wide):** If all targeting fields are left blank, the policy is automatically issued to the **entire active workforce**.

---

## 🏢 1. HR Administrator Workflows

HR Administrators maintain full operational authority over company-wide policies, notices, manager proposal reviews, recipient rosters, and compliance top-ups.

---

### 1.1 Authoring a Company Policy Draft & Uploading Files
**Purpose:** Create a new company policy, employee notice, or standard operational procedure and prepare it for distribution.

* **Who uses it:** HR Administrators.
* **Where to find it:** Navigate to **Documents > Org Documents > Create Policy Draft**.
* **Required Information:**
  * **Document Type:** Select an activated organization-plane document type (e.g., "Employee Handbook", "Leave Policy", "Code of Conduct").
  * **Title:** A clear, professional title (e.g., "Global Remote Work Policy 2026").
  * **Description / Summary:** Optional context or overview explaining the document's purpose.
  * **Storage Method:** Choose between **Upload File (S3)** or **External Web Link (Reference)**.
  * **File Upload (if uploading):** Attach a PDF, DOCX, PNG, or JPEG file within organizational size limits (up to 25 MB).
  * **External URL (if linking):** Provide a secure HTTPS link to an external system (e.g., DocuSign portal or company wiki).
  * **Effective Window (Optional):** Define `Effective From` and `Effective To` dates.
  * **Acknowledgement Settings:** Specify if employees must acknowledge receipt and enter the deadline in days (e.g., 14 days). *(Note: Acknowledgement capture activates in Phase 3; setting it now configures employee deadlines).*
  * **Confidentiality:** Mark whether the document contains sensitive information.
* **Step-by-Step Workflow:**
  1. Fill in the document details and configure the acknowledgement settings.
  2. Select your target audience (see Section 1.2).
  3. Attach the policy document file.
  4. Click **"Create Draft"**.
* **What happens next:**
  * The file uploads directly to encrypted cloud storage.
  * The document is saved in **`Draft`** status.
  * A preview card appears in HR's Org Documents list.
  * The draft is completely private to HR; no employees or managers can see it yet.
* **What can go wrong?**
  * *Oversized File:* If the document exceeds the maximum file size (default: 10 MB, up to 25 MB), the system blocks the upload with an error indicating the exact size limit.
  * *Disallowed Format:* If you upload an unsupported file format (e.g., `.exe`, `.zip`), the system prompts you to select an approved format (PDF, DOCX, JPEG, PNG).
  * *Invalid Dates:* If the `Effective To` date precedes the `Effective From` date, the system alerts: *"Effective To date must not precede Effective From date."*

---

### 1.2 Defining and Adjusting Audience Targeting Rules
**Purpose:** Ensure policies reach only the intended employees (e.g., Engineering policies only reach technical staff; regional policies only reach specific offices).

* **Where to find it:** Configured during draft creation or by clicking **"Edit Draft"** on any existing draft.
* **Available Targeting Dimensions:**
  * **Departments:** Select one or more official company departments (e.g., "Engineering", "Product").
  * **Office Locations:** Select one or more physical office sites (e.g., "Bangalore Headquarters", "Mumbai Branch").
  * **Employment Types:** Restrict by contract nature (e.g., "Full-Time", "Contractor", "Intern").
  * **Job Statuses:** Restrict by employment milestone (e.g., "Confirmed", "Probation").
  * **Included Employees:** Explicitly add specific individuals by name/employee ID.
  * **Excluded Employees:** Explicitly prevent specific individuals from receiving the document.
* **Audience Summary Preview:** As you select filters, the system dynamically displays an audience summary (e.g., *"Targeting: 2 Departments, 1 Location — Approx. 145 Employees"*).
* **Important Guardrail — Include/Exclude Conflict:** The system strictly prevents adding the same employee to both the *Included* and *Excluded* lists. If a conflict occurs, the system highlights: *"An employee cannot be both included and excluded."*

---

### 1.3 Publishing a Policy & Materializing the Employee Roster
**Purpose:** Officially release a confirmed policy draft to the workforce.

* **Where to find it:** Open the draft in **Documents > Org Documents** and click **"Publish Policy"**.
* **Pre-Publish Verification:** The system automatically verifies that:
  * The draft has a confirmed file or valid external link attached.
  * The associated document type is currently active.
  * The target audience resolves to an eligible set of active employees.
* **Step-by-Step Workflow:**
  1. Click **"Publish Policy"**.
  2. A confirmation modal displays the frozen audience summary (e.g., *"You are about to issue 'IT Security Policy 2026' to 312 active employees. This action is irreversible."*).
  3. Click **"Confirm & Publish"**.
* **What happens next:**
  * The document status changes from `Draft` to **`Published`**.
  * The targeting criteria, department labels, and location names are **permanently frozen**.
  * The system creates an individual recipient record for every eligible employee.
  * The document immediately appears in each targeted employee's "My HR Documents" inbox.
  * If a previous version of this policy existed ($v1$), it is automatically updated to **`Superseded`**.
  * An immutable entry is written to the organizational audit log.
* **What can go wrong?**
  * *Unconfirmed File:* If a file was selected but the upload was interrupted or incomplete, publishing is blocked with the error: *"Publish requires a confirmed file or reference URL."*
  * *Zero Recipients Warning:* If targeting rules match no active employees (e.g., an empty department), the system completes the publish but alerts: *"Warning: This document was published with zero recipients."*

---

### 1.4 Managing Revisions: Creating Version 2 ($v+1$) via Policy Replacement
**Purpose:** Update an existing company policy without disrupting current workforce access or deleting historical compliance proof.

* **Where to find it:** Open an active published policy and click **"Create New Version (Replace)"**.
* **The Business Problem Solved:** In legacy systems, updating a policy required deleting or unpublishing the old one, creating compliance gaps where staff had no visible policy during the transition. Phase 2 introduces **zero-downtime versioning**.
* **Step-by-Step Workflow:**
  1. Open the live policy (e.g., "Travel Policy 2025", Version 1).
  2. Click **"Create New Version"**.
  3. The system generates a new draft pre-populated with all details from Version 1, designated as **Version 2 ($v2$) Draft**.
  4. Update the title, effective window, or targeting as needed.
  5. Attach the updated policy file (e.g., `travel_policy_2026_v2.pdf`).
  6. Click **"Save Draft"**.
* **What happens during drafting?**
  * **Version 1 remains 100% live, published, and enforceable.** Employees continue to see and reference Version 1.
  * The group unique index prevents other HR users from accidentally creating competing drafts for the same policy group.
* **Finalizing the Replacement:**
  * When HR clicks **"Publish"** on Version 2, the system atomically promotes Version 2 to **`Published`** and transitions Version 1 to **`Superseded`**.
  * Employees now see Version 2 as their active policy. Version 1 is safely archived in historical records.

---

### 1.5 Retiring an Obsolete or Expired Policy
**Purpose:** Formally decommission a company policy that is no longer in effect (e.g., "Work From Home COVID Protocol 2021").

* **Where to find it:** Open an active policy in **Documents > Org Documents** and click **"Retire Policy"**.
* **Required Input:**
  * **Retirement Reason:** A mandatory business explanation of at least 10 characters (e.g., *"Superseded by Hybrid Work Guidelines 2026"*).
* **Step-by-Step Workflow:**
  1. Click **"Retire Policy"**.
  2. Enter the retirement reason in the prompt.
  3. Click **"Confirm Retirement"**.
* **What happens next:**
  * The policy status changes to **`Retired`**.
  * It is removed from active employee compliance queues.
  * Employees who originally received the policy can still view it in their history tab for reference, but it is clearly badged with a grey **Retired** tag.
  * The policy slot is freed, allowing HR to publish a new, unrelated policy in the future if desired.

---

### 1.6 Reviewing Manager Proposals (The HR Approval/Rejection Queue)
**Purpose:** Inspect disciplinary notices, warning letters, or PIPs proposed by people managers for their team members before official issuance.

* **Where to find it:** Navigate to **Documents > Proposals Queue**.
* **What you see:** A dedicated review list of manager-drafted proposals showing:
  * Proposing Manager Name & Department
  * Target Employee Name
  * Document Type (e.g., "First Written Warning")
  * Submission Timestamp
  * Attached Proposal File
* **Available Actions:**
  * **Approve & Publish:** HR clicks **"Publish"**. The proposal transitions to `Published` and immediately lands in the target employee's inbox.
  * **Reject with Feedback:** HR clicks **"Reject"** and provides a mandatory reason (e.g., *"Please attach the attendance logs for August and re-submit"*). The proposal transitions to `Rejected`. The manager is notified and can review the feedback.
* **Proposer Scope Safeguard (EC-19):**
  * If the target employee transferred to a different manager between the time the proposal was drafted and the time HR reviews it, the system detects the reporting mismatch.
  * Publishing is temporarily halted with the notice: *"The proposing manager no longer manages this employee."*
  * HR can either reject the draft or check **"Override Scope Change"** to proceed with the publication if upper management approved the action.

---

### 1.7 Monitoring Recipient Rosters & Compliance Tallies
**Purpose:** View real-time statistics and employee-by-employee status for any published document.

* **Where to find it:** Open any published or retired document and click the **"Recipient Roster"** tab.
* **Compliance Summary Cards:**
  * **Total Targeted:** Total employees who received the document.
  * **Pending:** Employees who have not yet opened the document.
  * **Viewed:** Employees who have opened and read the document.
  * **Waived:** Employees granted an administrative exemption.
* **Detailed Roster Table:**
  * Displays Employee Name, Employee ID, Department, Recipient Status (`Pending`, `Viewed`, `Waived`), First Viewed Date/Time, and Acknowledgement Due Date.
  * Filterable by status and searchable by employee name.

---

### 1.8 Topping Up Rosters for New Joiners (Workforce Sync)
**Purpose:** Automatically issue mandatory policies to new hires who joined the organization after a policy was published.

* **Where to find it:** Open a published policy and click **"Sync Recipients"**.
* **The Business Problem Solved:** Previously, if 50 new engineers joined a company three months after the "IT Security Policy" was published, HR had to manually track and email them. Phase 2 introduces **Smart Sync**.
* **How It Works:**
  1. HR clicks **"Sync Recipients"**.
  2. The system queries current active employees against the policy's **original frozen criteria**.
  3. It identifies any eligible staff members who do not currently have a recipient record.
  4. New recipient records are created with status `Pending` and tagged with source `Sync`.
  5. **Fair Due Date Calculation (EC-13):** The acknowledgement due date for new joiners is computed from the **date of the sync**, not the original publication date from months ago. New joiners are never unfairly penalized with retroactive "overdue" warnings.
  6. Existing recipients are untouched; no duplicate copies or notifications are sent to staff who already reviewed the policy.

---

### 1.9 Granting Administrative Exemptions (Waiving a Recipient)
**Purpose:** Excuse an employee from the requirement to acknowledge a document when special circumstances apply.

* **Where to find it:** In the document's **Recipient Roster**, locate the employee, click the **"..."** action menu, and select **"Waive Recipient"**.
* **Required Input:**
  * **Exemption Reason:** A mandatory explanation of at least 10 characters (e.g., *"Employee is on approved maternity leave until December"*).
* **Step-by-Step Workflow:**
  1. Click **"Waive Recipient"**.
  2. Enter the exemption reason.
  3. Click **"Confirm Waiver"**.
* **What happens next:**
  * The employee's recipient state changes from `Pending` or `Viewed` to **`Waived`**.
  * The employee is removed from pending compliance reminders.
  * The waiver reason, HR author, and timestamp are permanently recorded in the audit log.
* **What can go wrong?** If an employee has already formally completed or acknowledged the document, the system prevents waiving: *"Recipient has already completed this document and cannot be waived."*

---

### 1.10 Soft-Deleting Abandoned Drafts & Cleaning Storage
**Purpose:** Remove policy drafts or rejected proposals that are no longer needed.

* **Where to find it:** Open an un-published draft or rejected proposal and click **"Delete Draft"**.
* **Business Protection Guardrail:** Only **`Draft`** and **`Rejected`** documents can be deleted. Once a document has been **`Published`**, **`Superseded`**, or **`Retired`**, it can **never be deleted by anyone**. This guarantees permanent compliance defensibility during labor audits or legal proceedings.

---

## 👥 2. People Manager Workflows (Tier-B Proposals)

People Managers possess specialized authority to draft performance and disciplinary notices for their direct reports, tracking proposals through the HR review process.

---

### 2.1 Discovering Available Disciplinary & Performance Document Types
**Purpose:** View the specific organizational letter types managers are permitted to draft.

* **Who uses it:** People Managers.
* **Where to find it:** Navigate to **My Team > Team Documents > Propose Document > Select Type**.
* **What you see:** A curated list of approved document types (e.g., "First Written Warning", "Performance Improvement Plan", "Show Cause Notice") where the organization has enabled manager drafting permissions.
* **Organization Control:** If the company disables manager team document permissions in settings, this list safely displays as empty.

---

### 2.2 Drafting a Proposal (Warning Letter, PIP) for a Direct Report
**Purpose:** Formally initiate a disciplinary record or structured performance plan for a team member.

* **Step-by-Step Workflow:**
  1. Navigate to **My Team > Team Documents** and click **"Create Proposal"**.
  2. Select the direct report from your team dropdown list. *(The system restricts selection strictly to active subordinates reporting directly to you).*
  3. Select the document type (e.g., "Performance Improvement Plan").
  4. Enter a Title (e.g., "Q4 Performance Improvement Plan - John Doe").
  5. Select the document file to upload (e.g., the finalized PIP goals PDF).
  6. Set the effective date and acknowledgement window.
  7. Click **"Submit Proposal"**.
* **What happens next:**
  * The file uploads to encrypted storage.
  * The proposal is saved under your **"My Proposals"** tab in `Draft` status.
  * The proposal is forwarded directly to the HR Administrator Proposals Queue.
  * **Strict Subordinate Privacy:** The employee cannot see the proposal while it is under review.

---

### 2.3 Uploading and Confirming Proposal Documents
**Purpose:** Replace or re-upload a file on a proposal before HR completes review.

* If you need to make edits or re-upload a corrected file, open the proposal from **My Team > My Proposals**, click **"Update File"**, and select the revised PDF. The previous draft object is seamlessly updated.

---

### 2.4 Tracking Proposal Outcomes & Rejection Feedback ("My Proposals")
**Purpose:** Monitor whether HR has approved or rejected submitted proposals.

* **Where to find it:** Navigate to **My Team > My Proposals**.
* **Understanding Status Badges:**
  * **`Draft` (Under Review):** The proposal is in HR's review queue awaiting action.
  * **`Published` (Approved):** HR has verified and officially issued the document to your team member. It is now active in the employee's portal.
  * **`Rejected` (Declined):** HR declined the proposal. Click on the proposal card to read the required feedback provided by HR (e.g., *"Please schedule a preliminary alignment meeting with the HR Business Partner before issuing a formal warning"*).

---

## 👤 3. Employee Self-Service Workflows ("My HR Documents")

Employees have a dedicated self-service hub to review, download, and track all official policies and letters issued to them by the company.

---

### 3.1 Accessing the "My HR Documents" Inbox
**Purpose:** View company policies, handbooks, notices, and letters assigned to you.

* **Who uses it:** All company employees.
* **Where to find it:** Navigate to **Documents > My HR Documents**.
* **Understanding the Interface:**
  * A clear, uncluttered view displaying all policies and notices issued to your profile.
  * Filterable by document status:
    * **Action Required / Pending:** Documents awaiting your review.
    * **Viewed:** Documents you have already opened.
    * **History / Inactive:** Policies that have been updated ($v1$) or retired by the company.
  * Searchable by document title.

---

### 3.2 Reading Policies & Capturing Automated Compliance Timestamps (`Viewed`)
**Purpose:** Access policy content while automatically fulfilling viewing obligations.

* **Step-by-Step Workflow:**
  1. Open **My HR Documents**.
  2. Locate an unread document badged with a yellow **`Pending`** status.
  3. Click **"View Document"** or **"Download"**.
* **What happens behind the scenes:**
  * The document opens in a secure browser tab via an encrypted, temporary viewing link.
  * **Automated Compliance Capture:** The system instantly records the exact timestamp of your first view.
  * Your document badge updates immediately from **`Pending`** to green **`Viewed`**.
  * HR's administrative roster reflects that you have opened and read the policy.
  * You do not need to send an email or sign a paper sheet to prove you received the document.

---

### 3.3 Tracking Acknowledgement Windows & Deadlines
**Purpose:** Stay informed of compliance deadlines for mandatory policies.

* For documents that require formal acknowledgement (e.g., Code of Conduct), your document card displays a prominent notice: *"Due by: October 15, 2026 (7 days remaining)"*.
* If the due date passes before you view the document, your card displays an amber badge: *"Past Due"*, reminding you to review the policy immediately.

---

### 3.4 Historical Record Retention (Viewing Superseded & Retired Policies)
**Purpose:** Verify what terms or company rules were in effect during earlier periods of your employment.

* If the company publishes Version 2 of a policy, Version 1 moves to your **"Document History"** tab.
* You can open and view Version 1 at any time to verify historical terms (e.g., confirming travel reimbursement limits that applied during a business trip last quarter).
* Historical documents are marked with a grey badge: **Superseded** or **Retired**, indicating they are for reference only.

---

### 3.5 Privacy & Isolation Protections (Zero Co-Recipient Leakage)
**Purpose:** Guarantee complete personal confidentiality.

* When reviewing any document in your inbox:
  * You **cannot** see which other employees received the document.
  * You **cannot** see department targeting criteria or organizational headcounts.
  * You **cannot** see internal HR author notes or administrative identifiers.
* If a colleague attempts to copy and share a document link with someone who was not targeted, the link will refuse to open.

---

## 🔄 4. Real-World Business Scenarios

---

### Scenario A: Company-Wide Annual Policy Rollout (Code of Conduct)
**Situation:** On January 10, HR launches the updated "Code of Conduct & Ethics 2026" for all 1,200 employees across all branches and subsidiaries.

1. **Drafting:** The HR Director opens *Create Policy Draft*, selects "Code of Conduct", enters the title, sets `Effective From` to February 1, and specifies a 14-day acknowledgement window.
2. **Targeting:** HR leaves all department and location filters blank (Org-Wide distribution).
3. **File Attachment:** HR uploads `code_of_conduct_2026.pdf` (3.2 MB) and clicks *Confirm Upload*.
4. **Publishing:** HR clicks *Publish Policy*. The confirmation modal indicates: *"Targeting: Entire Organisation — 1,200 Employees"*.
5. **Instant Delivery:** 1,200 recipient records are generated in seconds.
6. **Employee Access:** An employee in Finance logs in, sees the new policy under *My HR Documents*, and clicks "View". The document opens, and their status automatically flips to `Viewed`.
7. **Compliance Reporting:** HR opens the *Recipient Roster* to monitor daily viewing progress as the workforce completes their review.

---

### Scenario B: Department-Specific Technical Guidelines (Engineering Security Protocol)
**Situation:** The VP of Engineering releases a strict "Cloud Production Access & Key Management Protocol" that applies solely to full-time Engineering staff in the Bangalore and Pune technical centers.

1. **Targeting Configuration:** HR configures targeting:
   * *Departments:* "Engineering", "DevOps"
   * *Locations:* "Bangalore Tech Center", "Pune Tech Center"
   * *Employment Types:* "Full-Time"
2. **Exclusion Safeguard:** Two external IT contractors embedded in the team are excluded by adding their IDs to `Excluded Users`.
3. **Publishing:** HR publishes the document. Only the 85 engineers matching all criteria receive the document.
4. **Isolation Verification:** An Account Executive in Sales checks their portal; the document does not appear in their inbox. If they are given a direct link, the system refuses access with *"Document not found"*.

---

### Scenario C: Manager Disciplinary Proposal & HR Maker-Checker Review
**Situation:** A Sales Manager, Priya, needs to place an underperforming sales executive, Kevin, on a 30-day Performance Improvement Plan.

1. **Proposal Initiation:** Priya navigates to *My Team > Team Documents > Create Proposal*.
2. **Direct Report Scoping:** Priya selects Kevin from her team list, titles the document "Q4 Sales PIP - Kevin Vance", attaches the detailed plan PDF, and sets a 7-day review window.
3. **Submission:** Priya clicks *Submit Proposal*. The proposal lands in HR's review queue. Kevin cannot see it yet.
4. **HR Review:** The HR Business Partner inspects the proposal in the *Proposals Queue*, verifying that previous coaching milestones were documented.
5. **Approval:** HR clicks *Publish*.
6. **Outcome:** The PIP is officially published to Kevin's "My HR Documents" inbox. Priya checks her *My Proposals* dashboard and sees the status updated to `Published`.

---

### Scenario D: Mid-Year Policy Update Without Compliance Interruption ($v1 \rightarrow v2$)
**Situation:** In June, the company revises its "Travel & Expense Reimbursement Policy" to increase daily meal allowances.

1. **Zero-Downtime Preparation:** HR opens the active Version 1 policy and clicks *Create New Version (Replace)*.
2. **Drafting $v2$:** The system creates Version 2 Draft. HR updates the allowance charts in the document and attaches `travel_policy_v2_june2026.pdf`.
3. **Active Access Unaffected:** While HR reviews the draft with the Finance Director over several days, traveling employees continue to access Version 1 without interruption.
4. **Atomic Promotion:** On July 1, HR clicks *Publish* on Version 2.
5. **Seamless Transition:** Version 2 becomes `Published` and Version 1 is marked `Superseded`. Employees opening the travel policy now see the new meal allowances, while past expense claims remain auditable against Version 1.

---

### Scenario E: Onboarding Wave Top-Up (Workforce Sync for New Hires)
**Situation:** Three months after the company-wide "IT Acceptable Use Policy" was published, 35 new university graduates join the company.

1. **Roster Gap:** Because the policy was published three months ago, the new hires do not have recipient rows.
2. **One-Click Sync:** HR opens the policy and clicks **"Sync Recipients"**.
3. **Target Evaluation:** The system evaluates current staff against the original criteria and identifies the 35 new hires.
4. **Fresh Delivery:** The 35 new graduates receive the policy in their inbox with a fresh 14-day due date calculated from today's sync date.
5. **No Disruption:** The 400 existing employees who already viewed the document receive no duplicate alerts.

---

### Scenario F: Administrative Exemption for an Employee on Sabbatical (Waive)
**Situation:** Elena is a Lead Architect on an approved 6-month research sabbatical. The company issues a mandatory "Office Relocation & Seating Agreement" requiring employee acknowledgement.

1. **Roster Review:** HR reviews the recipient roster and notices Elena's record is marked `Pending`.
2. **Administrative Action:** HR clicks the action menu next to Elena's name and selects *Waive Recipient*.
3. **Reason Logging:** HR enters: *"Employee on approved sabbatical until November; seating will be allocated upon return."*
4. **Compliance Clearance:** Elena's status updates to `Waived`. The compliance percentage reaches 100% without skewing reporting or triggering automated overdue notices.

---

### Scenario G: Team Transfer During a Pending Disciplinary Review (EC-19)
**Situation:** A manager drafts a warning letter for an analyst. Before HR completes review, the analyst transfers to a different department under a new manager.

1. **HR Review Attempt:** HR opens the proposal and clicks *Publish*.
2. **System Safeguard:** The system detects that the analyst no longer reports to the proposing manager and halts publication: *"The proposing manager no longer manages this employee."*
3. **HR Reconciliation:** HR contacts both managers to confirm whether the disciplinary action remains applicable.
4. **Authorized Override:** Upon receiving confirmation from the Head of People, HR selects *Override Scope Change* and completes the publication. The audit log permanently notes that an administrative override was authorized.

---

## 🔗 Connection to the HRMS Ecosystem

Phase 2 connects deeply with the broader HRMS modular architecture:

* **Organization Hierarchy (`hierarchyAccess`):** Real-time reporting lines determine manager proposal eligibility. A manager can only draft proposals for verified direct subordinates.
* **Role-Based Access Control (RBAC):** Distinct functional boundaries separate HR Administration, People Managers, and Employees. Platform administrators are barred from viewing sensitive tenant documents.
* **Feature Entitlement (`documents.access`):** Full feature-flag integration ensures that document capabilities activate smoothly based on tenant subscription tiers.
* **Cross-Module Targeting:** Seamlessly integrates with the Employee Profiles module, utilizing official `department_id`, `location_id`, `employment_type`, and `job_status` values for accurate targeting.
* **Legal Compliance Audit Trail:** Every authoring, targeting, publishing, viewing, syncing, and waiving action writes an unalterable log to the central audit registry.

---

## ❓ Frequently Asked Questions (FAQ)

**Q1: What is the main difference between "My Documents" and "My HR Documents"?**  
**A:** "My Documents" contains your personal employee-owned documents (e.g., your PAN card, passport, or degree certificates that you upload for HR verification). "My HR Documents" contains organization-issued policies, notices, and letters (e.g., Employee Handbook, Leave Policy, or PIP letters) that company leadership or your manager has issued to you.

**Q2: Can an employee delete a company policy from their "My HR Documents" inbox?**  
**A:** No. Employees cannot delete organization-issued documents. These are official institutional communications and compliance obligations that must remain accessible for the duration of employment.

**Q3: Can a People Manager publish a policy or disciplinary letter directly to an employee?**  
**A:** No. To prevent wrongful termination risks and ensure compliance with labor laws, managers can only **propose drafts** (Tier B). Final review, verification, and publication are strictly reserved for HR Administrators (Tier C).

**Q4: If HR updates a policy from Version 1 to Version 2, does Version 1 disappear?**  
**A:** No. Version 1 is automatically marked as `Superseded` and moves to the historical archive. Employees and HR can still view Version 1 to verify past terms, but Version 2 becomes the active, enforceable policy.

**Q5: What happens if an employee was mistakenly excluded from a policy distribution?**  
**A:** HR can simply navigate to the published policy and click **"Sync Recipients"**. If the employee's profile now matches the criteria (or if HR adjusted the criteria), the sync immediately adds the employee to the roster with a fresh due date.

**Q6: What happens if an employee opens a policy PDF multiple times? Does the viewing date change?**  
**A:** No. The system records your **first viewing timestamp** (`first_viewed_at`). Subsequent views do not overwrite your original compliance date, ensuring your historical proof of receipt remains tamper-proof.

**Q7: Can a manager see which of their team members have viewed a company-wide policy?**  
**A:** In Phase 2, recipient rosters are administered centrally by HR. Dedicated manager team compliance dashboards and acknowledgement analytics will be expanded in Phase 3.

**Q8: What happens if an employee tries to access an organization document using an ID link sent by a colleague in another department?**  
**A:** If the employee was not included in the policy's target audience, the system returns a standard *"Document not found"* error. The system never reveals whether the document exists or what its contents are.

**Q9: Can a published policy be deleted if it was uploaded with a typo?**  
**A:** No. Published policies cannot be deleted to prevent the destruction of compliance history. If an error is discovered, HR simply uses **"Create New Version"** to upload the corrected document ($v2$) and publishes it, which automatically archives Version 1.

**Q10: Why are new joiners given a due date starting from their sync date rather than the original policy publication date?**  
**A:** If a policy was published in January with a 14-day deadline, an employee joining in September would otherwise immediately be flagged as 8 months overdue. By calculating the deadline from the date of the sync (EC-13), the system gives new hires a fair, compliant window to review company policies.

---

*(End of Business Walkthrough)*
