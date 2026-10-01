# Phase 5: Documents Module (Templates Library, Metadata Search & Tags, Compliance Reports, Data-Egress Ledger, Offboarding Unwind, Unified Composed Portfolio & Cross-Module Bridges) — Business Walkthrough & User Guide

This document provides a comprehensive, user-facing guide to **Phase 5 of the Documents Module**. It explains how company blank form templates, enterprise metadata search, tag taxonomies, workforce compliance reporting, data-egress ledgers, automated employee offboarding unwinding, exit document packs, the unified employee portfolio, real-time on-join policy top-up, and cross-module leave attachment bridges operate.

This guide is written in clear, accessible business language for **HR Administrators**, **People Managers**, **Employees**, and **Executive Leadership**. It details everyday workflows, user permissions, approval rules, and guardrails without technical code, API routes, or developer jargon.

---

## 🚀 1. What Documents Module Phase 5 Provides

Across Phases 1 through 4, the Documents Module evolved into an intelligent, proactive document management platform:
- **Phase 1** established personal employee records, identity verification, and multi-version tracking.
- **Phase 2** introduced organization-wide policy notices, targeted audiences, and mandatory reading lists.
- **Phase 3** added legally binding digital acknowledgements, clickwrap declarations, drawn e-signatures, and non-repudiation audit trails.
- **Phase 4** introduced autonomous requests, onboarding checklists, automated expiry monitoring, and email reminder outboxes.

**Phase 5 completes the enterprise document architecture.** It solves the final challenges of large-scale operations: managing blank forms, searching across thousands of documents, auditing company-wide compliance, securing bulk data exports, smoothly unwinding departing employees' records, unifying the employee document experience, and connecting document evidence directly to everyday HR workflows such as leave applications.

### The Nine Enterprise Pillars of Phase 5:

1. **Company Blank Form & Template Library:** A centralized repository of official company templates, claim forms, medical certificates, and statutory declaration sheets that employees can self-service download with a single click.
2. **Enterprise Metadata Search:** A rapid, multi-criteria search engine allowing HR to filter across every employee document in the organization by keyword, document type, status, department, tags, and date ranges.
3. **Flexible Document Tags Taxonomy:** Custom categorization tags (such as `audit-2026`, `travel`, `tax-exempt`, or `priority`) that HR can attach to any employee document for agile tracking.
4. **Workforce Compliance & Expiry Audits:** Real-time compliance dashboards displaying company-wide mandatory document completion rates, departmental rankings, and predictive expiration forecasts grouped into clean 7, 30, 60, and 90-day warning buckets.
5. **Data-Egress Audit Ledger:** A dedicated security ledger that permanently records every single bulk file download, CSV export, and employee exit pack generated across the company, ensuring no data ever leaves without an auditable record.
6. **Automated Employee Offboarding Unwind:** When an employee leaves the company, a single action safely archives their personal documents, waives pending company policy acknowledgements, cancels open document requests, and silences scheduled reminder emails.
7. **Consolidated Exit Document Packs:** One-click generation of complete document manifests and verified download packages for departing personnel, suitable for handover and physical personnel files.
8. **Unified Composed Documents Portfolio ("All My Documents"):** A single, consolidated dashboard where employees can view their personal uploaded documents, assigned company policies, downloadable blank templates, and monthly payslips in one seamless screen.
9. **Cross-Module Leave Attachment Bridge:** Direct integration with the Leave Management module, allowing employees to attach verified medical certificates or travel proof directly to leave applications, and allowing managers and HR to preview attachments with a single click.

---

## 👥 2. User Roles & Permissions Matrix

Phase 5 strictly respects the established organizational hierarchy and role boundaries of the HRMS:

| Capability / Workflow | HR Administrator | People Manager | Employee (Self) |
| :--- | :---: | :---: | :---: |
| **Create & Manage Company Blank Templates** | ✅ Full Access | ❌ | ❌ |
| **Publish / Replace / Archive Templates** | ✅ Full Access | ❌ | ❌ |
| **Browse & Download Published Templates** | ✅ Full Access | ✅ Full Access | ✅ Full Access |
| **Search Across All Employee Documents** | ✅ Org-Wide | ❌ | ❌ |
| **Assign & Update Document Tags** | ✅ Full Access | ❌ | ❌ |
| **View Missing Mandatory Compliance Report** | ✅ Org-Wide | ❌ | ❌ |
| **View Expiring Documents Audit Report** | ✅ Org-Wide | ❌ | ❌ |
| **Export Search & Compliance Reports to CSV** | ✅ Full Access | ❌ | ❌ |
| **Inspect Data-Egress Audit Ledger** | ✅ Full Access | ❌ | ❌ |
| **Execute Employee Offboarding Unwind** | ✅ Full Access | ❌ | ❌ |
| **Preview Offboarding Impact (Dry-Run)** | ✅ Full Access | ❌ | ❌ |
| **Generate Employee Exit Document Pack** | ✅ Full Access | ❌ | ❌ |
| **View Unified Portfolio ("All My Documents")** | ✅ (Under "My Profile") | ✅ (Under "My Profile") | ✅ Full Access |
| **Attach Existing Document to Leave Application** | ✅ (When applying) | ✅ (When applying) | ✅ Full Access |
| **Preview Leave Application Attachment** | ✅ Full Access | ✅ Direct Reports Only | ✅ Own Applications |
| **Monitor High-Volume Policy Publishing** | ✅ Full Access | ❌ | ❌ |

---

## 📁 3. Feature 1: Company Blank Form & Template Library

### What is this feature?
The Template Library is a curated repository of official blank forms, declaration sheets, reimbursement claim formats, and statutory templates published by HR for employees to download, fill out, and submit. Examples include outpatient medical claim forms, local conveyance expense claim sheets, gratuity nomination forms, and standard non-disclosure templates.

### Who can use it?
- **HR Administrators:** Full administrative control. HR can create drafts, upload files, link external reference URLs, publish new versions, supersede older versions, archive retired forms, and view download metrics.
- **Employees & People Managers:** Can freely browse the catalog of active published templates and download blank copies at any time.

### Why does it exist?
Previously, employees had to email HR or hunt through internal chat channels to find the latest version of standard forms. Often, outdated versions were filled out, leading to rejected claims and wasted administrative time. The Template Library ensures there is only one authoritative, active version of every company form available at all times.

### Key Business Invariants:
1. **Zero Employee PII:** Templates are blank forms owned by the company. They never contain employee personal information.
2. **No Hierarchy Scoping:** Unlike employee identity documents, templates have no manager reporting restrictions. Every authenticated employee in the company sees the exact same published template catalog.
3. **Single Active Version Rule:** For every template, exactly one version is `Published` at any time. When HR releases an update, the previous version is automatically marked `Superseded` and retired from employee view while remaining in HR audit logs.
4. **Draft Safety:** Work-in-progress drafts can be edited or deleted freely. Once published, templates cannot be deleted; they can only be replaced with a newer version or archived.

---

### Step-by-Step Workflows

#### Workflow A: HR Creates a New Template Draft
1. Navigate to **Documents** $\rightarrow$ **Template Library**.
2. Click **"New Template"**.
3. Enter the template **Title** (e.g., *"Outpatient Medical Reimbursement Form 2026"*).
4. Enter an optional **Description** explaining when employees should use this form.
5. *(Optional)* Select a linked **Document Type** (e.g., "Medical Claim").
6. Choose the **Storage Mode**:
   - **Upload File:** Select a standard file (PDF, Word DOCX, or Excel sheet).
   - **External Reference Link:** Provide a secure HTTPS web link to an official government portal or corporate intranet page.
7. Set **Employee Visibility** to `Visible` (default).
8. Click **"Create Draft"**.
9. **Immediate Result:** The template is created in `Draft` status. It is saved in the HR workspace and is completely hidden from regular employees.

#### Workflow B: HR Uploads File & Confirms Template
1. If uploading a file, click **"Upload Form"** on the draft card.
2. Select the file from your computer.
3. Once the upload finishes, click **"Confirm Upload"**.
4. The system validates the file format, size, and verifies that the file is safely stored.
5. **Immediate Result:** The draft is marked with a verified green checkmark, indicating it is ready to be published.

#### Workflow C: HR Publishes the Template
1. Open the confirmed draft and click **"Publish Template"**.
2. Confirm the prompt: *"Are you sure you want to publish this template for employee self-service?"*
3. Click **"Confirm & Publish"**.
4. **Immediate Result:**
   - The status immediately transitions to **`Published`**.
   - If a previous version of this template existed, it is demoted to **`Superseded`**.
   - The template instantly appears in the employee self-service portal.

#### Workflow D: HR Replaces an Existing Template with a New Version
1. Open the active published template (e.g., Version 1).
2. Click **"Replace with New Version"**.
3. The system generates a new draft (Version 2) pre-filled with the existing metadata and links it to the original version.
4. Update the title, description, or upload the revised form file.
5. Confirm the upload and click **"Publish"**.
6. **Immediate Result:** Version 2 becomes active and published. Version 1 is marked `Superseded` and archived in the version lineage history.

#### Workflow E: HR Archives a Retired Template
1. When a form is permanently discontinued, open the published template and click **"Archive Template"**.
2. Enter an optional business reason (e.g., *"Discontinued; claims are now processed directly through the health portal"*).
3. Click **"Confirm Archive"**.
4. **Immediate Result:** The template moves to **`Archived`** status. It is immediately hidden from the employee catalog but preserved in HR historical archives.

#### Workflow F: An Employee Browses and Downloads a Template
1. Log in to the employee portal and navigate to **Documents** $\rightarrow$ **Forms & Templates**.
2. Browse the categorized list or use the search bar to find the required form (e.g., *"Provident Fund Declaration"*).
3. Click **"Download Form"**.
4. **Immediate Result:** The official blank form downloads immediately to the employee's computer with its official filename. The system increments the internal template download counter.

---

### Template Statuses Explained

| Status | What It Means | Who Can See It | Available Actions |
| :--- | :--- | :--- | :--- |
| **Draft** | Form is being created or revised by HR; file may be pending. | HR Only | Edit metadata, upload file, confirm, publish, or delete. |
| **Published** | Official active form currently available for company-wide use. | All Employees & HR | Download, replace with new version, or archive. |
| **Superseded** | Older version replaced by a newer release. | HR Only | View version details, download for historical audit. |
| **Archived** | Form has been permanently retired and discontinued. | HR Only | View historical record; cannot be downloaded by employees. |

---

### Validations & Guardrails
- **Draft Exclusivity:** HR cannot start a second replacement draft while an uncommitted draft already exists for the same template group. This prevents conflicting parallel edits.
- **Publish Readiness:** A template cannot be published unless a verified file is uploaded or a valid secure HTTPS link is provided.
- **Draft-Only Deletion:** Only drafts can be deleted. Published or archived templates cannot be deleted to preserve compliance records.
- **Strict Version Monotonicity:** Version numbers strictly increment (Version 1 $\rightarrow$ Version 2 $\rightarrow$ Version 3).

---

## 🔍 4. Feature 2: Enterprise Metadata Search & Document Tags Taxonomy

### What is this feature?
Enterprise Metadata Search provides HR with a centralized search interface to locate employee documents across the entire organization. Instead of clicking into individual employee profiles, HR can filter tens of thousands of documents in seconds.

### Who can use it?
- **HR Administrators:** Full organizational search access.

### Why does it exist?
During statutory audits, executive reviews, or legal investigations, HR often needs to answer questions like: *"Show all expired medical licenses in the Operations department,"* or *"Find all documents tagged with `audit-2026`."* Enterprise Search delivers instant results with full spreadsheet export capabilities.

---

### Step-by-Step Workflows

#### Workflow A: Executing a Multi-Criteria Search
1. Open **Documents** and select **Global Search**.
2. Configure any combination of search criteria:
   - **Search Keyword:** Search by document title (e.g., *"Passport"*, *"Driving License"*, *"Offer Letter"*).
   - **Document Type:** Filter by specific type (e.g., "PAN Card", "Educational Degree").
   - **Employee Name or ID:** Filter by a specific person.
   - **Department:** Filter by department (e.g., "Engineering", "Sales", "Customer Support").
   - **Status:** Filter by status (`Available`, `Pending Verification`, `Rejected`, `Expired`, `Archived`).
   - **Tags:** Filter by custom organizational tags (e.g., `visa-approved`, `confidential`).
   - **Issue & Expiry Date Ranges:** Select date boundaries (e.g., documents expiring between Oct 1 and Dec 31).
3. Click **"Search"**.
4. **Immediate Result:** Matching documents display in a clean, paginated table showing employee names, employee codes, departments, document types, issue/expiry dates, statuses, and tags.

#### Workflow B: Managing Document Tags
1. From any employee document view or search result, click **"Manage Tags"**.
2. Type one or more descriptive tags (e.g., `q3-audit`, `finance-verified`).
3. Press **Enter** or click **"Save Tags"**.
4. **Immediate Result:** The document's tags update immediately. The previous tag set and new tag set are recorded in the document audit trail.

#### Workflow C: Exporting Search Results to CSV
1. After refining your search filters, click **"Export to CSV"**.
2. The system generates a formatted spreadsheet and begins downloading automatically.
3. **Immediate Result:** The download completes with a filename like `document-search-2026-09-25.csv`. The export is logged in the company's data-egress ledger.

---

### Privacy & Data Minimization Rules
To protect employee privacy and prevent data harvesting:
- **Sensitive Identifiers Shielded:** Search results and exported spreadsheets **never disclose raw document numbers** (such as national ID numbers or bank account numbers) or internal file storage paths.
- **Excluded Quarantined Files:** Files flagged for security quarantine are excluded from bulk search results and can only be accessed through the dedicated security screen.

### Tag Taxonomy Guidelines
- **Maximum 10 Tags:** A single document can hold up to 10 distinct tags.
- **Tag Character Restrictions:** Tags must be lowercase and may contain letters, numbers, spaces, hyphens, and underscores (e.g., `tax-2026`, `onboarding priority`).
- **Tag Length:** Maximum 64 characters per tag.

---

## 📊 5. Feature 3: Compliance Reporting & Missing Mandatory Audits

### What is this feature?
Compliance Reporting provides executive leadership and HR with real-time, company-wide visibility into mandatory document compliance and upcoming expiration risks. It transforms compliance tracking from reactive crisis management into proactive governance.

### Who can use it?
- **HR Administrators:** Full access to organizational dashboards, department roll-ups, and downloadable spreadsheets.

---

### Report 1: Missing Mandatory Documents Audit

#### Business Problem Solved
Labor regulations and corporate policies require certain documents (such as PAN cards, identity proofs, signed code-of-conduct agreements, or professional certifications) for all active employees. Previously, checking who was missing what required cross-referencing multiple spreadsheets. The Missing Mandatory Report provides an instant audit of workforce compliance.

#### What the Report Shows:
1. **Company-Wide Compliance Score:** An overall percentage showing organizational readiness (e.g., *"88% Overall Compliance — 105 of 120 Employees Fully Compliant"*).
2. **Breakdown by Document Type:** Identifies which document types have the highest missing counts (e.g., PAN Card: 4 missing; Aadhaar Card: 11 missing).
3. **Departmental League Table:** Compares compliance across business units (e.g., Engineering: 93% compliant; Sales: 84% compliant).
4. **Non-Compliant Employee List:** An actionable list showing each incomplete employee, what specific documents they are missing, and their personal completion percentage.

#### Step-by-Step Workflow:
1. Navigate to **Documents** $\rightarrow$ **Compliance Reports** $\rightarrow$ **Missing Mandatory**.
2. Filter by **Department**, **Employment Type** (Full-Time, Contract, Intern), or a specific **Document Type**.
3. Toggle **"Show Incomplete Employees"** to see individual employee cards.
4. To export for management review, click **"Export to CSV"**.
5. **Immediate Result:** The complete missing mandatory report downloads as a spreadsheet, ready for distribution to department heads.

---

### Report 2: Expiring Documents Audit

#### Business Problem Solved
Employees' passports, visas, work permits, certifications, and driving licenses expire over time. If an employee continues working with an expired visa or medical license, the company faces severe regulatory penalties. The Expiring Documents Audit categorizes all upcoming expirations into standardized time horizons so HR can take action well before deadlines pass.

#### The Six Standardized Expiry Horizons:
Every expiring document is placed into a clear time horizon anchored to Indian Standard Time (IST):
- **Expired:** The document's expiration date has already passed. Immediate renewal required.
- **Due in 7 Days:** Critical priority. Expiration is imminent within the current week.
- **Due in 30 Days:** High priority. Expiration is within the current month.
- **Due in 60 Days:** Medium priority. Expiration is within two months.
- **Due in 90 Days:** Early planning horizon.
- **Later:** Expiring beyond 90 days.

#### Step-by-Step Workflow:
1. Navigate to **Documents** $\rightarrow$ **Compliance Reports** $\rightarrow$ **Expiring Documents**.
2. Select the **Time Horizon** (e.g., *"Within 30 Days"*, *"Within 60 Days"*, or *"Within 90 Days"*).
3. Optionally check **"Include Already Expired"** to review overdue items.
4. Review the summary metric cards showing how many documents fall into each horizon.
5. Click **"Export to CSV"** to generate a spreadsheet for chasing employees.

---

## 🔒 6. Feature 4: Data-Egress Audit Ledger

### What is this feature?
The Data-Egress Audit Ledger is a dedicated compliance registry that logs every bulk file export, CSV download, and employee exit pack generated across the system.

### Who can use it?
- **HR Administrators & Compliance Officers:** Full read access to inspect historical data exports.

### Why does it exist?
In modern enterprises, data protection standards (such as GDPR, ISO 27001, and SOC 2) require companies to maintain a strict audit trail of whenever employee personal information leaves the core database. The Data-Egress Ledger ensures that no bulk export can take place unnoticed.

### How the Ledger Operates (The Pre-Flight Security Gate):
1. **Registered Before Download:** Before the first byte of a spreadsheet or exit pack leaves the server, the system writes a formal job record with status `Started`.
2. **Hard Security Gate:** If the system cannot record the export in the audit ledger (for example, due to a database glitch), **the export is immediately halted with a security notice**. It is impossible for an untracked export to leave the system.
3. **Execution Tracking:** Once the download completes, the ledger updates the row with the exact number of rows exported, total file size in bytes, and completion timestamp.
4. **Forensic Metadata:** The ledger captures the requester's name, user ID, corporate email address, IP address, and the specific filters applied.

#### What HR Sees in the Export Ledger Table:
| Export ID | Report Type | Format | Requested By | Rows | File Size | Status | Timestamp |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `fa1b8c2e...` | Missing Mandatory | CSV | HR Lead | 15 | 2.4 KB | **Completed** | Sep 25, 2026, 15:20 IST |
| `c71a39b2...` | Employee Exit Pack | CSV | HR Operations | 7 | 1.1 KB | **Completed** | Sep 25, 2026, 15:35 IST |
| `8e3791a2...` | Document Search | CSV | HR Compliance | 142 | 18.5 KB | **Completed** | Sep 25, 2026, 15:45 IST |

---

## 🚪 7. Feature 5: Employee Offboarding & Exit Document Packs

### What is this feature?
When an employee resigns, is terminated, or completes their contract, HR must properly close their document lifecycle. The Offboarding feature provides an atomic, one-click document unwinding process that protects company compliance, stops automated emails, and packages the employee's records into an Exit Document Pack.

### Who can use it?
- **HR Administrators:** Full offboarding authority.

### Why does it exist?
Manually offboarding an employee's paperwork used to involve multiple disconnected tasks: manually archiving uploaded papers, tracking down which company policies they hadn't signed, cancelling open requests, and remembering to turn off reminder emails. If HR forgot to cancel reminders, a departed employee might continue receiving automated emails demanding that they sign an overdue employee handbook! The Offboarding feature automates all of this in a single transaction.

---

### The Four-Step Automated Offboarding Unwind:

When HR executes offboarding for a departing employee, the system performs four actions simultaneously:

1. **Archives Employee Documents:**
   - All active (`Available`) and `Expired` documents uploaded by the employee are transitioned to **`Archived`** status.
   - The files are safely preserved for legal retention periods but removed from active operational lists.
2. **Waives Pending Company Policy Acknowledgements:**
   - Any open or overdue company policy acknowledgements (such as an unsigned employee handbook) are automatically marked **`Waived`** with the official reason: *"Employee Offboarded"*.
   - **Signed Policies Untouched:** Any policy or agreement the employee previously signed or acknowledged remains permanently recorded as legal evidence.
3. **Cancels Open Document Requests:**
   - Any open or overdue requests asking the employee for documents are immediately transitioned to **`Cancelled`**.
4. **Silences Scheduled Email Reminders:**
   - Any automated email reminders waiting in the notification outbox for this employee are immediately marked **`Skipped`**, ensuring no further emails are dispatched to their inbox.

---

### Step-by-Step Workflows

#### Workflow A: HR Previews Offboarding Impact (Dry-Run Mode)
Before executing offboarding, HR can safely preview the impact without changing any data:
1. Navigate to **Employee Documents** and select the departing employee.
2. Click **"Offboard Documents"**.
3. Check the box: **"Preview Only (Dry Run)"**.
4. Click **"Run Preview"**.
5. **Immediate Result:** The screen displays a clear summary card:
   - *Documents to be archived: 6*
   - *Pending policy sign-offs to be waived: 2*
   - *Open requests to be cancelled: 1*
   - *Queued emails to be silenced: 3*
   No data is modified in the system.

#### Workflow B: HR Executes Live Offboarding
1. Uncheck the "Preview Only" box.
2. *(Optional)* Enter an administrative reason (e.g., *"Voluntary resignation; final clearance complete"*).
3. If the employee's last working day is in the future, check **"Force Early Offboarding"** if you intend to complete paperwork before their final day.
4. Click **"Execute Offboarding"**.
5. **Immediate Result:** The entire four-step unwind executes instantly. A success banner confirms: *"Offboarding Complete — 6 documents archived, 2 acknowledgements waived, 1 request cancelled, 3 notifications silenced."*

#### Workflow C: HR Generates an Exit Document Pack
HR can generate a complete exit pack for the employee's final personnel record or handover:
1. Open the employee's profile and click **"Generate Exit Pack"**.
2. Select the **Scope**:
   - **All Documents:** Includes both employee-uploaded papers and company-issued policies.
   - **Employee-Owned Only:** Includes only the employee's personal uploaded documents.
   - **Company-Issued Only:** Includes only policies, notices, and agreements assigned to them.
3. Choose the **Format**:
   - **Verified Digital Pack (JSON/Screen):** Generates an on-screen manifest with verified, secure download links (valid for 15 minutes) for each document.
   - **Spreadsheet Manifest (CSV):** Generates a downloadable CSV listing every document title, version, status, and date. *(Note: Download links are omitted from the spreadsheet to prevent security leaks).*
4. Click **"Download Exit Pack"**.
5. **Immediate Result:** The exit pack is generated and logged in the data-egress ledger.

---

### Automatic Nightly Offboarding Sweeper
In addition to on-demand execution by HR, the system runs an **automated offboarding sweeper every night at 02:10 IST**. 
- It automatically detects employees whose formal exit status is completed and whose last working day has arrived.
- It safely unwinds their documents automatically, ensuring departing personnel are never left in an incomplete state even if HR forgot to click the button.

---

## 📱 8. Feature 6: Unified Composed Documents Portfolio ("All My Documents")

### What is this feature?
The Unified Composed Portfolio provides employees with a single, consolidated dashboard—**"All My Documents"**—that brings together every document associated with their employment in one beautifully organized screen.

### Who can use it?
- **Every Employee & Manager:** To view their complete personal employment documentation.

### Why does it exist?
In traditional HR systems, employees have to visit three or four different menus to find what they need: one page for uploading identity documents, another page for reading company policies, a separate intranet page for blank claim forms, and another portal for payslips. The Unified Portfolio brings all of these together into one unified hub.

---

### The Four Portfolio Sections:

```text
┌─────────────────────────────────────────────────────────────┐
│                   ALL MY DOCUMENTS                          │
├──────────────────────────────┬──────────────────────────────┤
│ 📄 SECTION 1: MY DOCUMENTS   │ 🏢 SECTION 2: POLICIES       │
│ • Passport (Verified)        │ • Code of Conduct (Signed)   │
│ • Degree Certificate (Valid) │ • IT Security Policy (Action)│
├──────────────────────────────┼──────────────────────────────┤
│ 📥 SECTION 3: BLANK FORMS    │ 💰 SECTION 4: PAYSLIPS & TAX │
│ • Medical Claim Form 2026    │ • Payslip August 2026        │
│ • Conveyance Claim Template  │ • Form 16 (FY 2025-26)       │
└──────────────────────────────┴──────────────────────────────┘
```

1. **Section 1: My Documents (Personal Papers):**
   - Shows all personal documents uploaded by the employee (e.g., Passport, PAN Card, Academic Certificates).
   - Displays their current status (`Verified`, `Under Review`, `Action Required`).
   - If a re-upload is required, a direct **"Upload Now"** button appears right on the card.
2. **Section 2: Company Policies & Notices:**
   - Displays all company handbooks, notices, and agreements addressed to the employee.
   - Clearly flags items that require attention with an **"Action Required: Review & Sign"** badge.
3. **Section 3: Forms & Blank Templates:**
   - Provides direct access to download official company declaration forms, claim sheets, and policy templates.
4. **Section 4: Payslips & Tax Documents (if entitled):**
   - Directly surfaces finalized monthly payslips and annual Form 16 tax summaries.
   - Clicking any payslip opens the document viewer instantly.

---

### Seamless Performance & Fault Tolerance
- **Instant Screen Rendering:** The portfolio loads instantaneously. Document links are resolved on-demand only when clicked, ensuring the screen never buffers or freezes.
- **Graceful Section Isolation:** If one external service (such as the payroll database) is undergoing scheduled maintenance, that specific section displays a friendly note (*"Payroll documents currently updating"*), while the remaining three sections (personal papers, company policies, and blank forms) continue working perfectly.

---

## 🤝 9. Feature 7: Real-Time On-Join Policy Top-Up

### What is this feature?
When a newly hired employee accepts their digital company invitation and activates their profile, the system instantly evaluates all currently active, published company policies and handbooks matching their department, designation, and employment type, and assigns them immediately.

### Why does it exist?
In the past, when a new employee joined mid-month, HR had to manually remember to send them company policies, or wait for a scheduled weekly script to run. If an employee joined on a Wednesday, they might not receive the Employee Handbook or Security Policy until the following Monday. With Real-Time On-Join Top-Up, policy assignment occurs the exact moment their account is created.

### Fair Turnaround Deadlines
- The system automatically calculates the acknowledgment due date relative to the new hire's **actual join date**, rather than copying an older deadline from when the policy was originally published months prior.
- Example: If a company policy was originally published in January with a 14-day turnaround, an employee joining in September receives a fresh deadline 14 days from their own join date.

---

## 🏥 10. Feature 8: Cross-Module Leave Application Document Bridge

### What is this feature?
The Leave Application Document Bridge connects the Leave Management module directly with the Documents Module. Employees applying for sick leave, maternity leave, or bereavement leave can attach a verified medical certificate or supporting document directly from their document repository.

### Who can use it?
- **Employees:** Can attach any personal document in `Available` or `Pending Verification` status when submitting a leave application.
- **People Managers:** Can preview the attached document directly from the leave approval screen.
- **HR Administrators:** Can review the attached document during compliance reviews.

### Why does it exist?
Previously, when employees applied for sick leave, they had to upload a duplicate copy of their doctor's medical certificate in the Leave portal—even if they had already uploaded the exact same medical certificate to their Document repository. If a manager needed to verify the doctor's note, they had to ask the employee to email it or switch between multiple modules. The Leave Bridge eliminates duplicate uploads and provides instant, secure previews.

---

### Step-by-Step Workflows

#### Workflow A: An Employee Applies for Leave with Document Evidence
1. Navigate to **Leave** $\rightarrow$ **Apply for Leave**.
2. Select the leave category (e.g., *"Medical Leave (Sick Leave)"*).
3. Enter the requested dates and reason.
4. In the **"Supporting Document"** section, select **"Attach from My Documents"**.
5. Choose from your verified or pending certificates (e.g., *"Hospital Discharge & Medical Fitness Certificate"*).
6. Click **"Submit Leave Application"**.
7. **Immediate Result:** The leave application is submitted with a direct, secure attachment reference.

#### Workflow B: A Manager Reviews the Attached Medical Note
1. The manager receives the leave approval request in their **Manager Approvals** inbox.
2. Under the employee's request details, the manager sees: **"Attached Document: Hospital Discharge & Medical Fitness Certificate"**.
3. The manager clicks **"View Attachment"**.
4. **Immediate Result:** The document opens instantly in a secure browser preview tab. The manager does not need special permissions in the Document module; the system verifies that the employee reports to the manager and grants instant view access.
5. The manager reviews the doctor's note and clicks **"Approve Leave"**.

---

## ⚡ 11. Feature 9: High-Volume Asynchronous Policy Publishing

### What is this feature?
When an HR administrator in a large enterprise (with 10,000, 25,000, or 50,000+ employees) publishes a critical policy notice, the system handles the distribution smoothly in the background without causing the web browser to freeze or time out.

### How it Works:
1. **Intelligent Thresholding:**
   - If the target audience is under the organization's synchronous threshold (default: 20,000 employees), the policy is published and assigned to everyone in a single click within 1 to 2 seconds.
   - If the audience exceeds 20,000 employees, the system immediately marks the document **`Published`**, assigns the first 5,000 employees right away, and hands off the rest to a background worker.
2. **Live Progress Monitoring:**
   - The screen displays a friendly progress notification: *"Policy published! Assigning recipients in the background."*
   - HR can click **"View Progress"** to see a live progress bar:
     ```text
     Progress: [████████████░░░░░░░░] 60% Complete
     Recipients Assigned: 15,000 of 25,000 employees
     Status: In Progress (Next batch in 2 min)
     ```
3. **Resilient Background Processing:**
   - The background worker assigns 5,000 employees every 5 minutes until 100% complete.
   - Even if the server is restarted or updated during the process, it safely resumes exactly where it left off without skipping anyone or sending duplicate notices.

---

## 📋 12. User-Facing Statuses Explained

Phase 5 organizes document assets across four clear lifecycles:

### 1. Template Statuses (Company Blank Forms)
| Status | Meaning | What the User Can Do |
| :--- | :--- | :--- |
| **Draft** | Form is under preparation by HR; file upload may be pending. | HR can edit, upload, confirm, publish, or delete. |
| **Published** | Official active blank template available for company-wide use. | All employees can download; HR can replace or archive. |
| **Superseded** | Replaced by a newer version; preserved for historical audit. | HR can inspect version lineage; hidden from employees. |
| **Archived** | Permanently retired form; no longer in active company use. | Preserved in HR archive; hidden from employees. |

### 2. Employee Document Statuses (Personal Records)
| Status | Meaning | What the User Can Do |
| :--- | :--- | :--- |
| **Pending Upload** | Document placeholder created; file has not yet been uploaded. | Employee can upload the file. |
| **Pending Verification**| File uploaded; awaiting HR review and verification. | HR can verify or reject; employee can view/replace. |
| **Available (Verified)** | Formally verified and active document. | Employee and manager can view; HR can audit or tag. |
| **Rejected** | Document rejected by HR due to illegible scan or mismatch. | Employee can review rejection reason and re-upload. |
| **Expired** | Expiration date has passed. | Employee can upload a renewed copy. |
| **Archived** | Archived due to employee offboarding or replacement. | Read-only historical retention; locked from active views. |

### 3. Document Request Statuses
| Status | Meaning | What the User Can Do |
| :--- | :--- | :--- |
| **Open** | Active request awaiting employee submission. | Employee can upload; HR/Manager can cancel. |
| **Overdue** | Deadline has passed without submission. | Employee can fulfill urgently; HR can send reminder. |
| **Fulfilled** | Employee uploaded the document; request closed automatically. | Closed; linked document is under review. |
| **Cancelled** | Request was cancelled by HR or during offboarding. | Inactive historical record. |

### 4. Policy Recipient Obligation Statuses
| Status | Meaning | What the User Can Do |
| :--- | :--- | :--- |
| **Pending** | Mandatory policy waiting for employee review and signature. | Employee can read and sign. |
| **Overdue** | Turnaround due date has passed without sign-off. | Employee can sign urgently; HR receives alerts. |
| **Acknowledged** | Employee confirmed reading the policy. | Legally completed; view certificate. |
| **Signed** | Employee applied an official digital e-signature. | Legally completed; view signed document. |
| **Waived** | Obligation waived (e.g., employee offboarded or exempt). | No action required; reason recorded in audit log. |

---

## 🔄 13. What Changed Across Phases (Phase 1 → Phase 5)

The table below highlights how the Documents Module evolved across all five phases:

| Feature / Capability | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 (Complete) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Personal Employee Documents** | ✅ Basic Upload | ✅ Enhanced | ✅ Version Chains | ✅ Checklists | ✅ Fully Unified Portfolio |
| **Company Policies & Handbooks** | ❌ | ✅ Broadcast Notices | ✅ Targeted Lists | ✅ Mandatory Audits | ✅ High-Volume Bulk Publish |
| **Signatures & Acknowledgements** | ❌ | ❌ | ✅ Full E-Sign | ✅ Tracked Due Dates | ✅ Offboarding Auto-Waive |
| **Autonomous Chasing & Reminders** | ❌ | ❌ | ❌ | ✅ Nightly Crons | ✅ Auto-Silence on Exit |
| **Company Blank Forms & Templates** | ❌ | ❌ | ❌ | ❌ | ✅ **New in Phase 5** |
| **Global Enterprise Search & Tags** | ❌ | ❌ | ❌ | ❌ | ✅ **New in Phase 5** |
| **Workforce Compliance Reports** | ❌ | ❌ | ❌ | ❌ | ✅ **New in Phase 5** |
| **Data-Egress Audit Ledger** | ❌ | ❌ | ❌ | ❌ | ✅ **New in Phase 5** |
| **Automated Offboarding Unwind** | ❌ | ❌ | ❌ | ❌ | ✅ **New in Phase 5** |
| **Leave Management Attachment Bridge** | ❌ | ❌ | ❌ | ❌ | ✅ **New in Phase 5** |
| **Unified "All My Documents" Hub** | ❌ | ❌ | ❌ | ❌ | ✅ **New in Phase 5** |

---

## 💡 14. Real-World Practical Scenarios

### Scenario 1: Annual Medical Claim Form Update
* **Situation:** The company updates its health insurance claim sheet for the new financial year.
* **HR Action:** HR opens the Template Library, clicks "Replace with New Version" on the existing claim template, uploads the 2027 form, and clicks Publish.
* **System Result:** The 2027 form immediately becomes Version 2. The older Version 1 is cleanly marked Superseded.
* **Employee Experience:** An employee navigating to "Forms & Templates" downloads the new 2027 claim sheet immediately, with zero risk of downloading an outdated format.

### Scenario 2: External Statutory Compliance Audit
* **Situation:** Labor auditors request proof of all employees missing mandatory identity records and a list of all documents expiring within the next 30 days.
* **HR Action:** HR navigates to Compliance Reports, clicks "Missing Mandatory", and exports the CSV spreadsheet. Next, HR clicks "Expiring Documents", selects the "Within 30 Days" filter, and exports that CSV.
* **Compliance Result:** HR hands clean, formatted reports to the auditors in under 2 minutes. The company's data-egress ledger logs the exact time, employee count, and administrator who generated each export.

### Scenario 3: Employee Resignation & Clearance Handover
* **Situation:** An employee resigns, completes their knowledge transfer, and reaches their final working day.
* **HR Action:** During exit clearance, HR selects the employee and clicks "Execute Offboarding".
* **System Result:** The employee's personal uploaded papers are safely archived. Their pending sign-off for an upcoming updated travel policy is automatically waived as "Employee Offboarded". A pending request for an updated home address proof is cancelled. All automated reminder emails queued for their inbox are permanently silenced.
* **Handover:** HR clicks "Generate Exit Pack" and provides the departing employee with a complete digital package of their employment papers.

### Scenario 4: Sick Leave Application with Doctor's Note
* **Situation:** An employee falls ill with dengue fever and is hospitalized for 5 days.
* **Employee Action:** The employee uploads their hospital discharge summary to their Document repository. When applying for Medical Leave in the Leave portal, they simply select "Attach Hospital Discharge Summary" from their existing repository documents.
* **Manager Action:** The manager receives the leave request and clicks the document link. The doctor's certificate opens in a secure preview immediately. The manager reviews it and approves the sick leave in one smooth workflow.

---

## ❓ 15. Frequently Asked Questions (FAQ)

#### Q1: Can employees see other employees' documents in the Template Library?
**No.** The Template Library contains **only company blank forms** (such as empty claim sheets or statutory declaration formats). It never contains personal employee documents or personal information.

#### Q2: What happens if an employee tries to download an older version of a template?
Employees can only see and download the currently **Published** version. Older versions (marked *Superseded*) and draft versions are strictly hidden from employees.

#### Q3: Does exporting a search result or compliance report include sensitive bank or national ID numbers?
**No.** To comply with strict data privacy regulations, all CSV exports and search results deliberately omit sensitive raw document numbers and internal storage keys.

#### Q4: What happens if an employee leaves the company before signing a mandatory company policy?
During offboarding, the system automatically marks the unsigned policy as **Waived** with the official reason *"Employee Offboarded"*. This ensures the company's compliance statistics are clean and no reminder emails are sent to departed personnel. Any policy the employee signed earlier remains permanently stored.

#### Q5: Can HR undo an offboarding action?
Offboarding is an irreversible transition designed to lock departed records into permanent retention. While HR can always inspect archived documents, they cannot be reverted back to active status without creating a new document record.

#### Q6: What is the difference between an Exit Pack in JSON format and CSV format?
- **Digital Pack (Screen/JSON):** Designed for active handovers; includes secure, short-lived download links (valid for 15 minutes) for each document.
- **Spreadsheet Manifest (CSV):** Designed for physical personnel files and spreadsheet archives; lists metadata only (titles, dates, statuses) and intentionally excludes links to prevent long-term security leaks.

#### Q7: Why do some sections in "All My Documents" say "Action Required"?
An "Action Required" badge appears whenever your input is needed—for example, if a personal document was rejected and requires a clear re-upload, or if a newly published company policy requires your digital signature.

#### Q8: Can a manager search across all company documents using Enterprise Search?
**No.** Enterprise Search is strictly restricted to **HR Administrators**. People Managers only have access to their direct reports' documents through their designated Team Documents menu.

#### Q9: What happens if an employee's medical certificate attached to a leave application is rejected?
If HR rejects the underlying document due to an illegible scan or invalid date, the document status changes to *Rejected*. The leave application remains linked, but the approver will see that the evidence is no longer verified.

#### Q10: How does the system handle company-wide policies for 30,000 employees without crashing?
For audiences exceeding 20,000 employees, the system publishes the policy immediately, assigns the first 5,000 employees on the spot, and smoothly delegates the remaining assignments to a background worker in batches of 5,000 every 5 minutes. HR can track live progress on the screen.

#### Q11: How many tags can be added to a single document?
A document can have up to **10 tags**. Each tag can be up to 64 characters long and must be lowercase alphanumeric.

#### Q12: Why did an export fail with an "Export Too Large" message?
To protect system performance and prevent runaway downloads, bulk exports are capped at **10,000 rows**. If a search or report matches more than 10,000 rows, simply narrow your date range, department, or status filters and try again.

#### Q13: Does the Data-Egress Ledger record who downloaded an individual employee's passport?
The Data-Egress Ledger specifically records **bulk data exports and reports** (search CSVs, missing mandatory reports, expiring reports, and exit packs). Individual document downloads continue to be tracked in the individual document's detailed audit history.

#### Q14: What time zone is used for the Expiring Documents Report?
All document expiration calculations, warning buckets, and daily automated checks are strictly anchored to **Indian Standard Time (IST / Asia/Kolkata)**.

#### Q15: Can an employee delete a published template?
**No.** Regular employees only have read and download permissions for templates. Only HR administrators can create, version, or archive templates.

#### Q16: What happens if an employee is missing multiple mandatory documents during an audit?
HR can open the Missing Mandatory Report and see the exact list of missing items for that employee. Using the Phase 4 checklist integration, HR can send a bulk request for all missing items with a single click.

#### Q17: Can an employee access their payslips through the "All My Documents" portal?
**Yes.** If your organization is subscribed to the Payroll module, finalized monthly payslips and annual Form 16 certificates appear directly under Section 4 of your unified documents portfolio.

#### Q18: What should I do if a template file upload fails?
Ensure the file is an allowed format (PDF, Word, or Excel) and does not exceed the organization's maximum file size limit (typically 10 MB to 25 MB). If the issue persists, check your internet connection and re-issue the upload.
