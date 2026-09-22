# Phase 1: Documents Module (Core Foundation) — Business Walkthrough & User Guide

This document provides a comprehensive, user-facing guide to **Phase 1 of the Documents Module**. It explains how the document management system operates, how it solves real-world administrative and compliance challenges, and how HR administrators, people managers, and employees interact with document policies, uploads, verification workflows, version control, and secure viewing.

This guide is written in clear business language for HRMS users and stakeholders. It describes the exact user experience, workflows, permissions, and guardrails implemented in Phase 1 without exposing internal source code or developer-only technical details.

---

## 🚀 What Document Module Phase 1 Provides

Phase 1 establishes the enterprise-grade foundation for document management across the organization. It introduces:

* **Standard Document Type Catalog:** A centralized platform library of pre-configured statutory and standard company document templates (e.g., PAN Card, Aadhaar Card, Passport, Degree Certificates, Form 16) that organizations can activate with a single click.
* **Custom Document Type Builder:** Complete administrative flexibility for HR to define organization-specific document types (e.g., Non-Disclosure Agreements, Laptop Handover Receipts, Disciplinary Notices) with customized file size, format, confidentiality, and verification rules.
* **Encrypted, Binary-Free Storage:** High-security file transfers where document files upload directly from the user's browser to dedicated, encrypted cloud storage. Files never pass through or linger on web application servers, eliminating bandwidth bottlenecks and data breach risks.
* **Two-Tier Maker-Checker Verification:** A structured review process where People Managers (Tier B) inspect physical or original copies and provide recommendations, while HR Administrators (Tier C) perform final legal and compliance verification.
* **Direct Manager Authority Mode:** An optional organization setting allowing companies to empower managers to directly approve non-statutory team documents without escalating to HR.
* **Strict Version History ($v1 \rightarrow v2 \rightarrow v3$):** Transparent document replacement where outdated, expired, or rejected documents can be replaced with updated versions. Predecessor files are preserved in an immutable historical version chain.
* **External Reference Linking:** The ability for HR to register and link externally hosted secure documents (e.g., DocuSign agreements, DigiLocker references) without needing to download and re-upload raw binary files.
* **Statutory Compliance Protection:** Built-in safeguards that permanently lock verified statutory documents (such as tax identities and statutory proofs) against accidental or unauthorized employee deletion.
* **Immutable Audit Trail:** Comprehensive logging of every document event (upload issued, verified, rejected, viewed, replaced, or deleted), capturing the actor, timestamp, IP address, and administrative reason.

---

## 🔑 Key Concepts & Document Lifecycle

To navigate Phase 1 effectively, users must understand the core concepts governing how documents are organized, processed, and tracked.

### 1. Document Types vs. Document Instances
* **Document Type:** The administrative policy template defining *what* a document is (e.g., "PAN Card"). It dictates which file formats are allowed (e.g., PDF, JPEG), the maximum file size (e.g., 10 MB), whether an expiration date is required, whether employees can self-upload, whether managers can view it, and whether HR verification is mandatory.
* **Document Instance:** An actual uploaded file belonging to a specific employee that adheres to the rules of its Document Type (e.g., "Jane Doe's PAN Card uploaded on March 15, 2026").

### 2. Document Groups & Versioning
When an employee uploads a document, the system assigns it to a **Document Group**. 
* If the document is later updated or replaced (e.g., a renewed Passport), the new file is added to the same Document Group as **Version 2 ($v2$)**.
* The previous version ($v1$) is marked as **Superseded**. It remains visible in the document's version history for legal and compliance auditability, but is no longer considered the active document.
* For single-instance document types (e.g., PAN Card), only one document can be active at any time.

### 3. Document Statuses Explained

Every document progresses through defined lifecycle statuses:

| Status | What It Means | Who Can See It | Available Actions |
| :--- | :--- | :--- | :--- |
| **`pending_upload`** | The upload was initiated and the secure upload link was generated, but the file transfer to storage has not yet completed. | Uploader, HR | Complete file upload or abandon. Stale pending uploads are automatically purged. |
| **`pending_verification`** | The file has been successfully uploaded to secure storage and is waiting in the review queue for manager recommendation or HR verification. | Employee, Manager (if report), HR | View file, Recommend (Manager), Verify (HR), Reject (HR), Delete (Employee/HR). |
| **`available`** | The document has been reviewed, verified, and accepted as an active, valid compliance document. | Employee, Manager (if non-confidential), HR | View file, Download, Replace with new version, Delete (subject to statutory rules). |
| **`expiring_soon`** | Display status indicating that the document is active (`available`) but will reach its expiration date within the configured reminder window (e.g., within 30, 15, or 7 days). | Employee, Manager, HR | View file, Replace with renewed version. |
| **`expired`** | The document's expiration date has passed. It is no longer legally active or compliant. | Employee, Manager, HR | View file, Replace with renewed version. |
| **`rejected`** | HR or a Manager reviewed the document and declined it (e.g., blurry image, incorrect name, expired document). A mandatory explanation is recorded. | Employee, Manager, HR | View rejection reason, View file, Replace / Re-upload. |
| **`superseded`** | A newer version ($v2$) of this document has been uploaded and confirmed. This older version ($v1$) is archived in the version history. | Employee, HR | View historical file, View audit history. Cannot be re-verified or re-activated. |
| **`deleted`** | The document was removed by the employee (if permitted) or by HR. It is soft-deleted from operational views while preserving compliance logs. | HR (Audit only) | View audit trail of deletion. File is inaccessible in standard lists. |

### 4. The Two-Tier Verification Flow (Maker-Checker)
Phase 1 implements a structured Maker-Checker workflow:
1. **Tier A (Initiation / Subject):** The employee or manager uploads the document. Once uploaded, the document enters `pending_verification`.
2. **Tier B (Manager Recommendation):** The employee's direct manager reviews the document (e.g., verifying a physical degree certificate in a 1-on-1). The manager records a recommendation (`verify` or `reject`) with review notes.
3. **Tier C (HR Final Verification):** The document appears in HR's central verification queue, prominently displaying the manager's recommendation and notes. HR performs final compliance sign-off, transitioning the document to `available`.
4. *Direct Authority Exception:* If organization settings enable "Manager Direct Authority", the manager's review acts as final verification immediately, bypassing the HR queue for designated non-statutory types.

---

## 🏢 1. HR Administrator Workflows

HR Administrators possess organizational authority over document governance, catalog configuration, verification queues, administrative uploads, and compliance auditing.

---

### 1.1 Browsing & Activating the Document Catalog
**Purpose:** Quickly configure standard statutory and corporate document types without creating them from scratch.

* **Who uses it:** HR Administrators.
* **Where to find it:** Navigate to **Documents > Document Catalog**.
* **What you see:** A searchable grid of platform-standard templates (e.g., PAN Card, Aadhaar Card, Passport, Driving License, Voter ID, Degree Certificate, Previous Employment Relieving Letter, Form 16) displaying:
  * Document Name & Code
  * Functional Group (Identity, Education, Employment History, Financial, Medical, etc.)
  * Statutory Flag (whether legally mandated by government regulations)
  * Pre-configured Defaults (file size limits, allowed formats, retention windows)
  * Activation Status (`Activated` or `Not Activated`)
* **Step-by-Step Workflow:**
  1. Use the search bar or filters (Filter by Group, Jurisdiction/Country, or Plane) to locate desired documents.
  2. Click **"Preview"** on any catalog item to inspect its default policies, reminder schedules, and retention terms.
  3. Select the checkboxes next to the document types you wish to collect (e.g., "PAN Card" and "Aadhaar Card").
  4. Click **"Activate Selected Types"**.
* **What happens next:** The system instantiates these document types for your organization. They immediately become active and available for employees and managers to upload.
* **What can go wrong?** If a selected document type was already active, the system safely ignores it and activates the remaining selections without error.

---

### 1.2 Creating Custom Document Types
**Purpose:** Define unique, company-specific document types that are not part of the standard platform catalog.

* **Who uses it:** HR Administrators.
* **Where to find it:** Navigate to **Documents > Settings > Document Types > Add Custom Type**.
* **Required Inputs:**
  * **Document Code:** A unique system code starting with a letter (e.g., `company_nda_2026`, `laptop_agreement`).
  * **Document Title:** Human-readable name shown to employees (e.g., "Company NDA 2026").
  * **Functional Group:** Select from Identity, Education, Employment History, Financial, Medical, Background Check, Onboarding, Policy, Disciplinary, or Exit.
  * **Description / Instructions:** Helpful guidelines displayed to employees during upload (e.g., "Please upload all 3 pages signed and dated").
* **Configurable Policy Toggles:**
  * **Confidential Document:** Toggle `ON` to restrict visibility strictly to HR and the employee. Managers cannot view confidential documents even if the employee is their direct report.
  * **Employee Self-Upload:** Toggle `ON` to allow employees to upload this document in their self-service portal.
  * **Employee Can View:** Toggle `ON` to allow employees to view and download their copy.
  * **Employee Can Delete:** Toggle `ON` to allow employees to delete an active document (only allowed for non-statutory documents).
  * **Manager Can View:** Toggle `ON` to permit direct people managers to view team submissions.
  * **Manager Can Request / Upload:** Toggle `ON` to allow managers to upload this document on behalf of their direct reports (e.g., Performance Appraisals).
  * **Requires HR Verification:** Toggle `ON` so new uploads enter the verification queue before becoming active.
  * **Tracks Expiration:** Toggle `ON` if the document has an expiry date (e.g., Visas, Certifications). When enabled, an expiration date is strictly required on upload.
  * **Expiration Reminder Schedule:** Specify how many days before expiration reminder notifications are dispatched (e.g., 30, 15, and 7 days).
  * **Allows Multiple Active Copies:** Toggle `ON` if an employee can have more than one active document of this type (e.g., Multiple Degree Certificates). Leave `OFF` for single-instance documents (e.g., PAN Card).
  * **Maximum File Size:** Configure size cap between 1 KB and 25 MB (default: 10 MB).
  * **Allowed File Formats:** Select allowed MIME formats (PDF, JPEG, PNG, WEBP, DOCX, XLSX).
  * **Retention Period:** Set retention duration in days (default: 2,555 days / 7 years).
* **What happens next:** The custom document type is saved and immediately visible in the active document policy registry.
* **Important Guardrails:**
  * Custom document types **cannot be marked statutory**. Platform rules ensure only official catalog templates carry the statutory compliance flag.
  * Custom document codes cannot duplicate existing platform catalog codes or previously created custom codes.

---

### 1.3 Managing Existing Document Types (Edit, Deactivate, Reactivate)
**Purpose:** Adjust policies as company rules evolve, or retire document types no longer collected.

* **Where to find it:** Navigate to **Documents > Settings > Document Types**.
* **Editing a Document Type:**
  * HR can click **"Edit"** on any document type to adjust mutable settings: name, description, file size limits, allowed formats, manager viewing permissions, and verification requirements.
  * **Immutable Fields:** To preserve historical and legal data integrity, the system permanently locks the following fields against editing: `Code`, `Plane`, `Source`, and `Statutory Flag`. If you need a different code or plane, create a new document type.
* **Deactivating a Document Type:**
  * When an organization stops collecting a document (e.g., "Old Policy 2023"), HR clicks **"Deactivate"**.
  * **What happens:** Employees and managers can no longer initiate new uploads for this document type. However, all previously uploaded documents of this type remain intact, viewable, and legally audited.
* **Reactivating a Document Type:**
  * If the organization resumes collection, HR clicks **"Reactivate"**.
  * **What happens:** The document type is restored to active status, retaining all previously customized policies.

---

### 1.4 Configuring Organization-Wide Document Settings
**Purpose:** Establish company-wide security, privacy, and maker-checker rules.

* **Where to find it:** Navigate to **Documents > Settings > General Settings**.
* **Configurable Settings:**
  1. **Manager Team Document Visibility:** Master switch allowing managers to view non-confidential documents of their direct reports. (Default: `ON`).
  2. **Manager Direct Verification Authority:** When enabled, managers can directly approve/verify documents for their team without escalating to HR. (Default: `OFF`).
  3. **Separate Checker Requirement (Maker-Checker):** When enabled, an HR user who uploads or proposes a document cannot be the one who verifies or approves it. Another HR administrator must review it. (Default: `OFF`).
  4. **Document View Link Expiry (TTL):** Number of seconds a secure document viewing link remains valid in the browser before expiring (Range: 30 to 900 seconds; Default: 300 seconds / 5 minutes).
  5. **Document Upload Link Expiry (TTL):** Number of seconds a secure upload link remains valid before timing out (Range: 30 to 3,600 seconds; Default: 600 seconds / 10 minutes).
  6. **Global Maximum File Size:** Global organization cap on file uploads (Range: 1 KB to 25 MB; Default: 10 MB).
  7. **Employee Deletion of Verified Documents:** Master toggle controlling whether employees can delete active, verified non-statutory documents. (Default: `OFF`).
  8. **Default Verification Requirement:** Default verification setting for newly activated document types. (Default: `ON`).
* **Built-in Business Guardrails:**
  * **Sufficient Checkers Guard:** Enabling `Separate Checker Requirement` strictly requires at least **two active HR administrators** in the organization. If only one HR user exists, the system rejects the update to prevent permanent approval deadlocks.
  * **Authority Conflict Guard:** `Separate Checker Requirement` and `Manager Direct Verification Authority` **cannot both be enabled simultaneously**. If managers could directly verify documents they requested or uploaded, it would violate the separate checker principle.

---

### 1.5 Directly Uploading Documents for an Employee
**Purpose:** HR directly uploads a signed contract, ID proof, or onboarding document to an employee's file.

* **Where to find it:** Navigate to **Employees > [Select Employee] > Documents > Upload Document**.
* **Required Inputs:**
  * Select Document Type from the active list.
  * Document Title (e.g., "Signed Offer Letter").
  * Select File from computer.
  * Optional: Document Number (e.g., Aadhaar number, PAN number).
  * Optional / Required: Issue Date and Expiration Date (mandatory if type tracks expiry).
  * Confidential Toggle: Check to keep document hidden from managers.
* **What happens behind the scenes:**
  1. The system validates the file format and size against the document type's rules.
  2. The browser uploads the file directly to encrypted cloud storage via a secure, time-limited cryptographic link.
  3. Once the upload finishes, the system verifies the file size and MIME type with storage and confirms the document.
  4. If verification is required, it enters the queue; otherwise, it becomes `available` immediately.
  5. The document number is securely masked (e.g., showing only `••••••••9012`).

---

### 1.6 Linking Externally Hosted Documents (DocuSign, DigiLocker)
**Purpose:** Record external digital documents without downloading and storing duplicate copies.

* **Where to find it:** Navigate to **Employees > [Select Employee] > Documents > Link External Reference**.
* **Required Inputs:**
  * Select Document Type.
  * Document Title (e.g., "DocuSign Executed Employment Agreement").
  * **Reference URL:** Must be a secure HTTPS web address (e.g., `https://na2.docusign.net/...`).
  * Optional: Document Number, Issue Date, Expiration Date.
* **What happens next:** The system creates the document record directly in `available` status. When users click "View", they are securely directed to the external link. No binary files are stored in HRMS cloud storage.

---

### 1.7 Managing the Central Verification Queue
**Purpose:** Review, verify, or reject newly uploaded employee documents.

* **Where to find it:** Navigate to **Documents > Verification Queue**.
* **What you see:** A unified list of all documents awaiting review across the organization, sorted oldest-first:
  * Employee Name & ID
  * Document Type & Title
  * Submission Date & Source (Self-Upload, Manager Upload, HR Upload)
  * Manager Recommendation: Shows whether the employee's manager has recommended `Verify` or `Reject`, along with the manager's review note.
* **Reviewing a Document:**
  1. Click on a document row to open the review pane.
  2. The secure preview loads the document inline (PDF or image).
  3. Inspect the employee's entered details (document number, issue date, expiry date) against the preview.
* **Taking Action:**
  * **Action 1: Verify:**
    * Click **"Verify Document"**.
    * The document transitions to `available` (or `expired` if its expiration date has already passed).
    * The document disappears from the verification queue and appears as active in the employee's file.
    * *Stale Manager Recommendation Notice:* If the manager who recommended the document has changed roles or no longer manages that employee, the system prompts HR to acknowledge the organizational change before proceeding.
  * **Action 2: Reject:**
    * Click **"Reject Document"**.
    * **Mandatory Reason:** HR must enter a clear explanation (minimum 10 characters, max 500 characters, e.g., "Document image is blurred; please upload a clear color scan of the front and back").
    * The document transitions to `rejected`.
    * The employee is notified and can see the exact rejection reason on their dashboard.

---

### 1.8 Replacing a Document (Version Upgrades)
**Purpose:** Upload a renewed, corrected, or updated version of an existing document.

* **Where to find it:** Open an existing document's detail view and click **"Replace / Upload New Version"**.
* **Workflow:**
  1. HR selects the replacement file and confirms the metadata (e.g., new expiration date for a renewed passport).
  2. The system increments the version ($v1 \rightarrow v2$).
  3. **Safety Guarantee:** The original document ($v1$) remains active and valid while the new version is uploading.
  4. Once the new version is confirmed and verified, the system atomically marks $v1$ as **`superseded`** and activates $v2$.

---

### 1.9 Deleting Documents & Viewing Immutable Audit Trails
* **Deleting Documents:**
  * HR administrators have the authority to soft-delete erroneous or duplicate documents by clicking **"Delete"**.
  * Deleted documents are removed from active employee views.
* **Viewing Audit Trails:**
  * Click **"View Audit Trail"** on any document detail page.
  * HR sees an immutable chronological ledger of every action taken on that document:
    * When the upload was requested
    * When the file was confirmed in cloud storage
    * Who viewed the file and when
    * Manager recommendations and notes
    * HR verification or rejection timestamps
    * Soft-deletion records
    * IP addresses and request IDs for compliance audits

---

## 👥 2. People Manager Workflows

People managers play a vital role in validating team submissions (Tier B review) while being bounded by strict privacy and organizational hierarchy rules.

---

### 2.1 Viewing Team Document Policies
**Purpose:** Understand which documents direct reports are required or allowed to submit.

* **Where to find it:** Navigate to **My Team > Team Documents > Document Types**.
* **What managers see:** A tailored list of document types that managers have permission to view or request.
* **Privacy Filtering:** Confidential document types (e.g., Medical Records, Compensation Letters) are automatically hidden from this list.

---

### 2.2 Viewing Direct Reports' Document Repository
**Purpose:** Check whether team members have completed their required document submissions.

* **Where to find it:** Navigate to **My Team > Team Documents**.
* **What managers see:** A consolidated grid of documents belonging to their direct reporting hierarchy showing:
  * Team Member Name
  * Document Title & Type
  * Status (`Available`, `Pending Verification`, `Expired`)
  * Expiry Dates & Expiration Warnings
* **Strict Hierarchy Scoping:** Managers can only see documents for employees who report directly (or indirectly) to them. Attempting to access an employee outside their reporting line results in an immediate access block.

---

### 2.3 Reviewing & Recommending Team Documents (Tier B)
**Purpose:** Conduct first-line inspection of team documents to assist HR.

* **Where to find it:** Navigate to **My Team > Document Recommendations** or open a document marked `pending_verification`.
* **Step-by-Step Workflow:**
  1. The manager clicks on a pending document to view the file.
  2. The manager inspects the document (e.g., verifying that the name matches company records or checking an original certificate in person).
  3. Click **"Submit Recommendation"**.
  4. Select **"Recommend Verification"** or **"Recommend Rejection"**.
  5. Enter an optional note (e.g., "Inspected original degree certificate during onboarding 1-on-1; verified genuine").
* **What happens next:**
  * The document remains in `pending_verification`, but now displays the manager's recommendation and note.
  * The document moves forward to the HR Verification Queue.
  * The manager can track all their submitted, pending recommendations under **My Team > Open Recommendations**.

---

### 2.4 Delegated Direct Verification (When Enabled)
**Purpose:** Fast-track team document approvals without involving HR.

* **When this applies:** Only if HR has enabled **"Manager Direct Verification Authority"** in General Settings.
* **Workflow:** When the manager clicks "Verify Document", the document **immediately transitions to `available`**. It does not go to the HR queue.
* **Best Use Case:** Streamlining routine internal forms, team equipment handovers, and project sign-offs.

---

### 2.5 Uploading Documents for Direct Reports
**Purpose:** Managers upload documents related to team management (e.g., Annual Performance Reviews, PIP Letters, Training Certifications).

* **Where to find it:** Navigate to **My Team > [Select Employee] > Upload Document**.
* **Workflow:**
  1. The manager selects an eligible document type (must have `manager_can_request = true`).
  2. Enters title, selects the file, and submits.
  3. The file is uploaded to secure cloud storage and enters the verification queue.
* **Restriction:** Managers cannot upload document types reserved exclusively for HR or Employee self-service.

---

### 2.6 Privacy & Confidentiality Boundaries
To comply with workplace data protection regulations, Phase 1 enforces strict privacy walls:
* **Confidential Documents Are Invisible:** If a document is flagged as confidential (e.g., personal medical reports, background check findings), it is completely invisible to managers. The system returns a "Document Not Found" notice rather than revealing its existence.
* **Masked Sensitive Numbers:** Managers only see masked document numbers (e.g., `••••••••1234`).
* **No Cross-Department Access:** A manager cannot view documents of peers or employees in other departments.

---

## 🧑‍💻 3. Employee Self-Service Workflows

Phase 1 provides employees with an intuitive, transparent portal to manage personal compliance documents, review verification statuses, and replace expired files.

---

### 3.1 Viewing Required & Uploadable Document Types
**Purpose:** Understand what documents you need to submit and the technical requirements for each.

* **Where to find it:** Navigate to **Self Service > My Documents > Upload New**.
* **What you see:** A clear card-based list of allowed document types displaying:
  * Document Name & Description (e.g., "PAN Card: Upload clear front side showing photo and signature").
  * Allowed Formats (e.g., PDF, JPEG, PNG).
  * Maximum Allowed File Size (e.g., Max 10 MB).
  * Verification Requirements (whether HR reviews this document).
  * Expiry Notice (whether you must supply an expiration date).

---

### 3.2 Viewing Personal Documents & Statuses
**Purpose:** Track the status of all your submitted documents.

* **Where to find it:** Navigate to **Self Service > My Documents**.
* **What you see:** A personal dashboard organized by status tabs:
  * **Active Documents (`Available`):** Verified documents currently in good standing.
  * **In Review (`Pending Verification`):** Documents uploaded and waiting for manager or HR review.
  * **Expiring Soon (`Expiring Soon`):** Documents nearing their expiration date, flagged with yellow alert banners.
  * **Expired (`Expired`):** Documents whose validity has lapsed, flagged with red banners prompting renewal.
  * **Action Required (`Rejected`):** Documents declined by HR, displaying the exact reason for rejection so you can fix and re-upload.

---

### 3.3 Uploading Documents via Self-Service
**Purpose:** Submit an identity, educational, or compliance document.

* **Step-by-Step Workflow:**
  1. Navigate to **My Documents** and click **"Upload Document"**.
  2. Select the Document Type from the dropdown (e.g., "Degree Certificate").
  3. Enter a Title (e.g., "Bachelor of Technology Certificate").
  4. Enter the Document Number (optional/required depending on type, e.g., University Roll Number).
  5. Select the Issue Date and Expiry Date (if applicable).
  6. Drag and drop your file or click to browse.
  7. Click **"Submit"**.
* **What happens next:**
  * Your browser uploads the file directly to secure encrypted storage.
  * The document appears immediately on your dashboard with status **`Pending Verification`**.
  * Your manager and HR receive notifications in their respective review queues.
* **User-Facing Validations:**
  * **Wrong Format:** If you try to upload a `.zip` or `.exe` file, the system immediately notifies you: *"Format not allowed. Please upload PDF, JPEG, or PNG."*
  * **File Too Large:** If your file exceeds the limit (e.g., 14 MB when limit is 10 MB), the system blocks the upload: *"File size exceeds the 10 MB limit."*
  * **Missing Expiry:** If uploading a Passport or Driving License without an expiration date, the system prompts: *"Expiration date is required for this document type."*
  * **Duplicate Slot:** If you already have an active PAN Card and try to upload another through this form, the system directs you: *"A live document of this type already exists. Please use the Replace option to update it."*

---

### 3.4 Securely Viewing and Downloading Uploaded Documents
**Purpose:** Retrieve a copy of a previously uploaded document.

* **Where to find it:** Click on any document in **My Documents** and select **"View"** or **"Download"**.
* **How it works:**
  * When you click "View", the system generates a temporary, encrypted link that opens the document in your browser tab.
  * **Security Feature:** The link automatically expires after 5 minutes. If someone copies the link from your browser history later, it will not open.

---

### 3.5 Replacing Expired, Rejected, or Updated Documents
**Purpose:** Upload a fresh copy when a document expires, changes, or was rejected by HR.

* **Step-by-Step Workflow:**
  1. Navigate to **My Documents**.
  2. Locate the expired, rejected, or outdated document.
  3. Click **"Replace / Re-upload"**.
  4. Review the previous details and select your new file (e.g., your renewed Passport scan).
  5. Update the expiration date to match the new document.
  6. Click **"Submit Replacement"**.
* **What happens next:**
  * The new file uploads as **Version 2 ($v2$)** and enters `Pending Verification`.
  * If replacing an expired or rejected document, the previous version remains archived in your version history.
  * Once HR approves $v2$, it becomes your active document.

---

### 3.6 Deleting Documents & Statutory Protection Rules
**Purpose:** Remove an uploaded file that is no longer needed or was uploaded by mistake.

* **Deleting an Unverified Document:**
  * If you uploaded a file by mistake and it is still **`Pending Verification`**, you can click **"Delete"** at any time. The file is immediately removed.
* **Deleting a Verified Document:**
  * **Statutory Document Lockout:** If a document is marked **Statutory** (e.g., PAN Card, Aadhaar Card, Form 16) and has already been verified, **employees cannot delete it**. The "Delete" button is disabled with the explanation: *"Statutory compliance documents cannot be deleted. Please contact HR if a correction is needed."*
  * **Company Policy Documents:** Non-statutory documents (e.g., optional certifications) can only be deleted if both the Document Type and Organization Settings permit employee deletion. Otherwise, deletion must be performed by HR.

---

## 🔄 4. Real-World Business Scenarios

---

### Scenario A: The Golden Path — New Employee Identity Onboarding
**Situation:** Rahul joins the company as a Senior Software Engineer. During his first week, he must submit his PAN Card and Aadhaar Card for payroll and statutory compliance.

1. **Self-Service Submission:** Rahul logs into the employee portal, navigates to *My Documents > Upload New*, and selects "PAN Card". He enters his PAN number and uploads a clean PDF scan.
2. **Direct Secure Transfer:** The file uploads directly to encrypted storage. His dashboard immediately displays the PAN Card under `Pending Verification`.
3. **Queue Notification:** The submission lands in HR's Verification Queue.
4. **HR Review & Approval:** An HR administrator opens the verification queue, clicks on Rahul's submission, and previews the PDF. The name, photo, and PAN number match his onboarding records.
5. **Finalization:** HR clicks **"Verify Document"**. 
6. **Result:** Rahul's PAN Card transitions to **`Available`**. Rahul receives a notification that his document was verified. The PAN number is masked for ongoing privacy, and payroll can now process his salary without statutory compliance flags.

---

### Scenario B: Two-Tier Review of an Educational Degree
**Situation:** Priya is hired into the Data Science team. Company policy requires that people managers physically inspect original degree certificates during the initial 30-day review, while HR maintains final verification.

1. **Employee Upload:** Priya uploads her Master's Degree certificate PDF via the portal. The document enters `Pending Verification`.
2. **Manager Inspection (Tier B):** During their first monthly 1-on-1, Priya brings her original degree parchment. Her manager, Vikram, inspects it.
3. **Manager Recommendation:** Vikram opens *My Team > Document Recommendations*, previews Priya's uploaded scan, and clicks **"Recommend Verification"**, typing: *"Original certificate inspected in person; degree and university match."*
4. **HR Verification Queue (Tier C):** The HR administrator opens the queue. Priya's submission is flagged with: *"Manager Recommendation: Verify — Original certificate inspected in person."*
5. **Final Sign-off:** With manager confirmation in hand, HR clicks **"Verify"**.
6. **Result:** The document enters `Available`. Both Priya and Vikram can see that the degree verification is complete.

---

### Scenario C: Blurry Image Rejection & Seamless Re-Submission
**Situation:** Amit uploads a photo of his Driving License taken with a low-light phone camera. The text and license number are unreadable.

1. **HR Review:** The HR administrator opens Amit's submission in the verification queue. The image is blurred and dark.
2. **Rejection with Feedback:** HR clicks **"Reject Document"** and enters the reason: *"Image is too blurry. Text and license number cannot be read. Please upload a clear, well-lit photo or color PDF scan."*
3. **Employee Notification:** Amit receives an alert: *"Your Driving License was rejected by HR."*
4. **Dashboard Feedback:** Amit opens *My Documents > Action Required*. He sees his Driving License highlighted in red with HR's exact feedback.
5. **Re-upload:** Amit clicks **"Replace / Re-upload"**, takes a crisp, well-lit photo, and submits it.
6. **Result:** The new version ($v2$) enters `Pending Verification`. HR reviews the clear image and approves it.

---

### Scenario D: Passport Expiry Notification & Annual Renewal
**Situation:** Sneha's Passport is set to expire on April 30, 2026. The organization requires valid passports for employees traveling to client sites.

1. **Automated Expiry Warning:** On March 31 (30 days before expiry), Sneha's dashboard displays a yellow banner: *"Your Passport expires in 30 days. Please upload your renewed passport once available."*
2. **Post-Expiry Status:** On May 1, Sneha has not yet renewed it. The system automatically marks the document as **`Expired`** with a red alert.
3. **Renewed Passport Submission:** In June, Sneha receives her renewed Passport. She navigates to her expired passport and clicks **"Replace / Upload New Version"**.
4. **Metadata Update:** She enters her new expiration date (May 2036) and uploads the new scan.
5. **Approval & Archival:** HR verifies the renewal. Version 2 ($v2$) becomes `Available`. Version 1 ($v1$) is marked `Superseded`. HR can still view the $v1$ scan in history if required for past travel audits.

---

### Scenario E: Linking a C-Level Employment Agreement (DocuSign)
**Situation:** The Chief Technology Officer signs an executive employment contract via DocuSign. The document contains complex stock option exhibits and is 60 pages long. HR wants it linked in the HRMS without duplicating large binary files.

1. **HR Reference Action:** HR navigates to the CTO's profile and selects *Link External Reference*.
2. **Configuration:** HR selects "Employment Contract", enters title "Executive Employment Agreement 2026", pastes the secure DocuSign URL (`https://na2.docusign.net/...`), and toggles **Confidential Document: ON**.
3. **Immediate Availability:** The document is created directly in **`Available`** status.
4. **Result:** When HR clicks "View", they are redirected to DocuSign. Because it is marked confidential, no managers can see the record.

---

### Scenario F: Statutory Compliance Protection in Action
**Situation:** An employee, Rohit, is updating his personal profile. He attempts to delete his verified PAN Card and Aadhaar Card.

1. **User Action:** Rohit opens his verified PAN Card in *My Documents* and looks for the delete button.
2. **System Safeguard:** The "Delete" button is disabled. A tooltip explains: *"Statutory documents cannot be deleted once verified."*
3. **Security Rationale:** Income tax and labor regulations require employers to retain proof of identity and tax declarations for 7 years. The system protects both the employee and the employer by blocking unauthorized deletion.

---

### Scenario G: Maker-Checker Fraud Prevention in the HR Team
**Situation:** An organization with multiple HR administrators enables the "Separate Checker Requirement" to prevent payroll and document tampering.

1. **Upload:** HR Executive Ananya uploads a relocation reimbursement proof for a new executive. Ananya's user ID is recorded as the proposer (`proposed_by`).
2. **Self-Approval Attempt:** Ananya attempts to open the verification queue and click "Verify" on the document she just uploaded.
3. **System Block:** The system halts the action with a clear prompt: *"Separate checker required. You cannot verify a document that you uploaded. Another HR administrator must review and approve this document."*
4. **Checker Sign-off:** HR Director Rajesh opens the queue, reviews the file independently, and approves it.

---

## 🔗 Connection to the HRMS Ecosystem

Phase 1 integrates deeply with other core modules in the HRMS suite:

* **Organization Hierarchy & Reporting Lines:** The Document Module automatically queries the central reporting structure (`hierarchyAccess`). When an employee changes managers, the new manager immediately gains visibility into their direct reports' non-confidential documents, while the previous manager's access is revoked.
* **Role-Based Access Control (RBAC):** Permissions are strictly bound to platform roles (`hr`, `manager`, `employee`). Platform administrative accounts (`admin`, `super-admin`) are barred from tenant document data to maintain zero-trust tenant isolation.
* **Feature Flag Entitlement:** Access to all document APIs and interfaces is governed by the `documents.access` feature flag, allowing tenants to enable or disable document capabilities as part of their subscription package.
* **Audit & Compliance Framework:** Every document interaction connects to the central audit subsystem, providing verifiable records for ISO, SOC 2, and statutory compliance audits.

---

## ❓ Frequently Asked Questions (FAQ)

**Q1: What happens if an employee's internet disconnects while uploading a large 20 MB PDF?**  
**A:** The upload will fail before reaching cloud storage. The document remains in `pending_upload` status. If the employee does not resume or re-upload the file within the upload window (default: 10 minutes), the system automatically sweeps and removes the abandoned placeholder. The employee can simply click "Upload" again.

**Q2: Can an employee delete a document after submitting it?**  
**A:** Yes, if the document is still `Pending Verification`. However, once a document has been **verified** by HR, it can only be deleted if:
1. It is **not statutory** (e.g., certifications, portfolio samples).
2. The Document Type has `employee_can_delete = true`.
3. The Organization Setting `employee_can_delete_verified_documents` is enabled.  
Verified statutory documents (PAN, Aadhaar) can **never** be deleted by employees.

**Q3: Why can't a manager see an employee's Medical Certificate?**  
**A:** Medical certificates are configured by default as **Confidential Documents** (`is_confidential = true`). To protect employee health privacy, confidential documents are visible exclusively to HR and the employee. Managers cannot view them even if the employee is their direct report.

**Q4: Can HR edit the code of an existing document type (e.g., change `pan_card` to `pan_india`)?**  
**A:** No. Document codes, planes (`employee`/`org`), sources (`catalog`/`custom`), and statutory flags are permanently immutable. Changing these on active systems would break historical records and database references. If you need a different code, create a new custom document type.

**Q5: Why did the system prevent HR from enabling the "Separate Checker" setting?**  
**A:** The "Separate Checker" setting requires at least **two active HR administrator accounts** in the organization. If only one HR user exists, enabling this setting would make it impossible to approve documents (since the lone HR user could not verify what they uploaded). Add a second HR administrator first, then enable the setting.

**Q6: What does "Display Status: Expiring Soon" mean?**  
**A:** It means the document is currently valid and active (`available`), but its expiration date is approaching within the reminder window (e.g., within 30 days). This gives the employee and HR time to arrange for a renewal before the document lapses into `expired` status.

**Q7: How long do document view links last? Can someone email a view link to an unauthorized person?**  
**A:** Document view links are cryptographic, time-limited URLs that expire after a configurable duration (default: 5 minutes / 300 seconds). If someone copies and emails the link, it will stop working after 5 minutes. Furthermore, all view requests require an authenticated user session, and every link generation is logged in the audit trail.

**Q8: Can a manager approve their own documents?**  
**A:** No. An individual acting as a manager can only review documents for their **subordinates**. When viewing their own personal documents, managers operate under the Employee Self-Service plane and must have their documents reviewed by HR.

---

*(End of Business Walkthrough)*
