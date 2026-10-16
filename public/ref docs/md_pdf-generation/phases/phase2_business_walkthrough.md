# Phase 2: PDF Generation Module (Letter Issuance & Reissue) — Business Walkthrough & User Guide

This document provides a comprehensive, user-facing business walkthrough of **Phase 2 of the PDF Generation Module**. It explains how organizations issue formal, legally numbered corporate letters to employees, how verified employee and salary facts are automatically assembled into tamper-evident documents, how issued letters are published to the employee self-service portal, and how human resources (HR) administrators reissue corrected letters under strict compliance versioning.

This guide is written in clear, accessible business language for HR professionals, company leadership, department managers, and employees. It describes the complete user experience, screen workflows, operational permissions, and business guardrails without exposing internal technical code or database implementations.

---

## 🚀 What PDF Generation Phase 2 Delivers

While **Phase 1** established the visual foundation—allowing HR to configure corporate letterheads, upload high-resolution logos and signatures, customize template fields, and generate sample previews with synthetic data—**Phase 2 unlocks full operational issuance of real, legally binding corporate letters for real employees.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PDF Generation Evolution                              │
├──────────────────────────────────────┬──────────────────────────────────────┤
│               PHASE 1                │               PHASE 2                │
│     "Letterhead & Visual Previews"   │      "Live Issuance & Reissue"       │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Configure branding & signatories   │ • Issue real letters to employees    │
│ • Sample visual tests with fake data │ • Automatic compilation of HR facts  │
│ • Diagonal "PREVIEW" watermark       │ • Sequential, legal reference numbers│
│ • No employee records touched        │ • Instant employee portal publishing │
│ • No legal reference numbers         │ • Immutable versioned reissue flow   │
│ • Previews not saved to personnel    │ • Audit-sealed corporate documents   │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### Core Business Capabilities in Phase 2:

1. **Direct Employee Letter Issuance:**
   HR administrators can issue official corporate letters (such as Bonafide Letters, Experience Letters, Relieving Certificates, and Appointment Letters) directly to specific employees in seconds.
2. **Automated Fact Compilation (Zero Manual Entry Errors):**
   The system automatically pulls verified employee facts—such as Official Designation, Employee Code, Department, Joining Date, Reporting Manager, and Approved Compensation Breakdowns—directly from the employee's active profile and payroll records. HR never has to re-type sensitive data.
3. **Strict Fact Integrity Safeguards:**
   To prevent fraud and unauthorized alterations, critical facts (such as salary figures, employee codes, and joining dates) are locked to official records. HR can provide narrative notes or specific purpose descriptions, but cannot manually manipulate verified facts during issuance.
4. **Sequential, Authoritative Reference Numbering:**
   Every issued letter is automatically assigned a unique, sequential corporate reference number (for example, `ACME/BON/2026-2027/0001` or `CORP/EXP/2026-2027/0042`). The numbering pattern follows the organization's corporate standards, increments predictably per financial year, and is guaranteed never to duplicate.
5. **Instant Employee Self-Service Publishing:**
   The moment a letter is issued, it is finalized, sealed, and immediately published to the employee's personal Document Portal. Employees can view, download, or digitally acknowledge the letter from their desktop or mobile browser.
6. **Immutable, Version-Controlled Reissue Flow:**
   If a letter contains a typographical error or needs an update (such as an updated bank purpose or revised relieving date), HR can "Reissue" the letter. The system preserves the original letter unchanged for legal compliance, marks it as `Superseded`, and mints a brand-new Version 2 with a new sequential reference number.
7. **Document Origin Protection:**
   To guarantee authenticity, generated corporate letters cannot be manually replaced or overwritten by uploading external files. Any update must follow the official, audited Reissue process.

---

## 👥 Who Can Use Phase 2? (Role Access Matrix)

Phase 2 introduces active workflows for both HR administrators and employees:

| Role | Access Level | Responsibilities & Available Capabilities |
| :--- | :---: | :--- |
| **HR Administrator** | **Full Administrative Access** | • Issue official letters to any active employee.<br>• Search and filter the organization-wide Issued Letters Register.<br>• Review complete letter details and generation audit trails.<br>• Reissue published letters to create corrected, superseding versions.<br>• Configure organization-wide reference numbering patterns and letterhead defaults. |
| **Employee** | **Self-Service Recipient Access** | • Access personal Document Portal to view and download issued letters.<br>• Complete digital acknowledgements if required by HR.<br>• Cannot see letters belonging to other employees or access administrative issuance tools. |
| **People Manager** | **Read-Only Team Access (Conditional)** | • View published, non-confidential letters belonging to direct reports if permitted by company settings.<br>• Cannot issue or reissue letters *(manager-initiated letter requests will be introduced in Phase 4)*. |
| **Platform Administrator / Super Admin** | **No Access** | • Platform administrators are strictly locked out of company document registries and employee records under tenant privacy rules. |

---

## 🔑 Key Business Concepts & Rules

Understanding these core business concepts will help your team manage corporate documentation efficiently and remain fully audit-compliant:

### 1. The Single Source of Truth for Employee Facts
When generating formal corporate letters, accuracy is paramount. A bank reviewing an employee's loan application or an embassy processing a visa expects exact information matching statutory tax filings and official payroll.
* The system pulls employee facts directly from verified records:
  * **Identity & Profile:** Full legal name, official employee code, designation, and joining date from the employee's approved profile.
  * **Department:** Official department name from the company organizational structure.
  * **Reporting Line:** Direct manager's name from reporting hierarchies.
  * **Exit Details:** Resignation date, notice period, and last working day from approved exit records.
  * **Compensation:** Annual Cost to Company (CTC) and itemized salary breakdown from the latest approved salary structure.
* **The Override Rule:** HR can provide narrative overrides (such as the specific purpose of a bonafide letter or special commendations), but **cannot override derived facts**. If an employee's designation or salary is incorrect, the underlying HR or Payroll profile must be corrected first. This ensures letters always match company records.

### 2. Sequential Reference Numbering
In corporate and statutory governance, official letters must carry an auditable serial number.
* Each organization defines a reference pattern (e.g., `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}`).
* The counter starts at `0001` each financial year and increments automatically per letter template.
* **No "Burned" Numbers:** If an issue request fails (for instance, due to a temporary internet disruption before the PDF is finished), the reference counter is **not** incremented. Your organization will never have mysterious gaps in its official document sequence.
* **Tamper-Evident Permanence:** Once a letter is issued, its reference number is permanent. It can never be reassigned, transferred to another employee, or edited.

### 3. Immediate Publication & First-Class Document Status
Unlike draft documents in other modules, an issued letter is an **authoritative legal instrument**:
* It is automatically published upon creation (`status: published`).
* It immediately appears in the recipient employee's Document Portal.
* It is registered in the organization's permanent document archive with a cryptographic checksum verifying that the PDF file has never been altered since generation.

### 4. The Golden Rule of Reissue: "Never Overwrite History"
In legal compliance, you can never erase an official letter that was previously delivered to an employee or third party.
* If a published letter needs a change, HR uses the **Reissue** workflow.
* The system changes the original letter's status to **`Superseded`**, preserving its original date, file, reference number, and audit log.
* The system creates **Version 2** linked to the same document history, assigns it a **new reference number**, and publishes the updated PDF to the employee.
* Anyone reviewing the employee's file can see the complete history: what was issued originally, who requested the correction, why it was reissued, and the active version.

---

## 🏢 1. Issuing a Formal Letter (HR Workflow)

HR administrators can issue a letter whenever an employee requires official verification, upon hiring, or during promotion and exit processes.

---

### 1.1 Accessing the Letter Issuance Screen
* **Navigation:** Open **HR Management > Documents > Issue New Letter** (or click the **"Issue Letter"** button at the top of the **Issued Letters** register).
* **Visual Interface:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  Issue Formal Employee Letter                                          │
├────────────────────────────────────────────────────────────────────────┤
│  1. Select Template & Recipient:                                       │
│  Letter Template: [ Bonafide Letter (Proof of Employment)       ▼ ]   │
│  Employee:        [ Search by name or employee code...          ▼ ]   │
│                   Selected: Asha Rao (EMP-1042)                        │
│                   Designation: Senior Software Engineer                │
│                   Department: Engineering                              │
│                   Joining Date: 14-Jan-2022                            │
│                                                                        │
│  2. Issuance Details:                                                  │
│  Date of Issue:   [ 2026-09-27 ] (Defaults to Today)                   │
│                                                                        │
│  3. Custom Information & Overrides:                                    │
│  Purpose of Letter:                                                    │
│  [ Opening a priority savings account with HDFC Bank             ]     │
│                                                                        │
│  Signing Authority:                                                    │
│  [✓] Use Organization Default Signatory (Rajesh Sharma, Director HR)   │
│                                                                        │
│  Confidentiality & Acknowledgement:                                    │
│  [✓] Mark Document as Confidential (Visible only to HR and Recipient)  │
│  [ ] Require Employee Digital Acknowledgement                          │
│                                                                        │
│  [ Cancel ]                                   [ Issue & Publish Letter ]
└────────────────────────────────────────────────────────────────────────┘
```

---

### 1.2 Step-by-Step Issuance Instructions

1. **Select the Letter Template:**
   Choose the required letter type from the dropdown (e.g., *Bonafide Letter*, *Experience Certificate*, *Appointment Letter*). Only templates activated by your organization will be listed.
2. **Select the Employee:**
   Search for the employee by name or employee code. As soon as you select an employee, the system displays a summary card showing their verified profile facts (Designation, Department, Date of Joining, etc.) so you can verify you have chosen the right person.
3. **Verify the Date of Issue:**
   The issue date defaults to today's date. You can select an effective date within 365 days of today if back-dating or forward-dating an official agreement.
4. **Enter Narrative Details:**
   Fill in any template-specific narrative fields. For example, for a Bonafide Letter, enter the specific *Purpose* (e.g., *"Applying for a Schengen Tourist Visa"* or *"Home Loan processing with State Bank of India"*).
5. **Review Delivery Settings:**
   * **Confidentiality:** Pre-selected based on company policy. Ensures the document is restricted strictly to HR and the individual employee.
   * **Acknowledgement:** Check this box if the employee must formally review and click "Acknowledge" upon receiving the document.
6. **Click "Issue & Publish Letter":**
   The system compiles the data, renders the PDF with official branding and signatures, assigns the next sequential reference number, and publishes the document.

---

### 1.3 What Happens Immediately After Issuance?

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Issuance Confirmation                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  ✓ Letter Successfully Issued & Published!                              │
│                                                                         │
│  Document Title:    Bonafide Letter — Asha Rao                          │
│  Reference Number:  ACME/BON/2026-2027/0001                             │
│  Recipient:         Asha Rao (EMP-1042)                                 │
│  Date Published:    27-Sep-2026 09:14 AM                                │
│  Document Status:   Published (Active)                                  │
│                                                                         │
│  The letter is now immediately available in the employee's Document     │
│  Portal. An email notification has been dispatched to the employee.     │
│                                                                         │
│  [ View in Registry ]      [ Download PDF ]      [ Issue Another ]      │
└─────────────────────────────────────────────────────────────────────────┘
```

* **Immediate System Actions:**
  1. The letter status is set to **`Published`**.
  2. The employee receives an immediate notification in their portal.
  3. The letter is permanently added to the company's **Issued Letters Register**.
  4. An audit log records the exact date, time, issuing HR administrator, and reference number.

---

## 📋 2. The Issued Letters Register (HR Registry)

The **Issued Letters Register** is the central dashboard where HR administrators monitor, search, and manage all corporate letters ever generated by the organization.

---

### 2.1 Navigating the Register
* **Where to Find It:** Navigate to **HR Management > Documents > Issued Letters**.
* **Visual Dashboard:**

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  Issued Letters Register                                             [ + Issue Letter ] │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Filters:                                                                               │
│  Template: [ All Templates    ▼ ]  Status: [ All Active ▼ ]  Employee: [ All         ▼ ]│
│  Ref No:   [ Search Ref...      ]  From:   [ 2026-09-01   ]  To:       [ 2026-09-27  ]│
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Reference No.         Recipient     Template         Issued On     Status     Actions  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  ACME/BON/2026-27/0002 Asha Rao      Bonafide Letter  27-Sep-2026   Published  [View] [⋮]
│  ACME/BON/2026-27/0001 Asha Rao      Bonafide Letter  25-Sep-2026   Superseded [View] [⋮]
│  ACME/EXP/2026-27/0014 Vikram Patel  Experience Cert  22-Sep-2026   Published  [View] [⋮]
│  ACME/APP/2026-27/0008 Priya Sharma  Appointment Ltr  15-Sep-2026   Published  [View] [⋮]
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Showing 1–4 of 4 letters                              [ First ] < 1 > [ Last ]         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Available Search & Filtering Options

HR administrators can filter through thousands of corporate records using targeted filters:
* **Template Filter:** Narrow records to specific letter types (e.g., show only *Relieving Letters* or only *Salary Revisions*).
* **Recipient Filter:** Search for all letters issued to a single employee over their entire tenure.
* **Status Filter:**
  * **`Published`:** Currently active, valid corporate letters.
  * **`Superseded`:** Older versions replaced by a newer reissue.
  * **`Retired`:** Documents formally archived or revoked.
* **Reference Number:** Search by exact corporate reference number (e.g., `ACME/BON/2026-27/0002`).
* **Date Range:** Filter letters issued within specific dates (e.g., Q2 audit window).

---

## 🔍 3. Viewing Letter Details & Audit Provenance

Clicking **"View"** on any record opens the **Letter Details Drawer**, presenting a complete 360-degree overview of the document, recipient compliance, and legal audit history.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Letter Details: Bonafide Letter — Asha Rao                            │
├────────────────────────────────────────────────────────────────────────┤
│  Document Overview:                                                    │
│  • Reference Number:  ACME/BON/2026-2027/0002                          │
│  • Current Version:   Version 2 (Supersedes ACME/BON/2026-2027/0001)   │
│  • Status:            Published (Active)                               │
│  • Recipient:         Asha Rao (EMP-1042)                              │
│  • Published By:      Rajesh Sharma (HR Operations)                    │
│  • Date of Issue:     27-Sep-2026 09:15 AM                             │
│                                                                        │
│  Recipient Tracking:                                                   │
│  • Delivery Status:   Delivered to Employee Portal                     │
│  • First Viewed:      27-Sep-2026 10:04 AM                             │
│  • Acknowledgement:   Not Required                                     │
│                                                                        │
│  Legal & Audit Integrity:                                              │
│  • Template Used:     bonafide_letter (Version 1)                      │
│  • File Checksum:     3a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e... (Verified) │
│  • Storage State:     Encrypted & Immutable                            │
│  • Reissue History:   Reissued to update bank loan purpose             │
│                                                                        │
│  [ Download Official PDF ]      [ Reissue Letter ]      [ Close ]      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 4. Reissuing an Issued Letter (Correction Flow)

In real-world business operations, circumstances change: an employee changes their loan application from one bank to another, a clerical typo is discovered in an address, or a resignation date is renegotiated.

Phase 2 provides a dedicated, audit-compliant **Reissue** workflow.

---

### 4.1 When Should You Reissue a Letter?
* An employee requests a change in the letter's purpose or recipient address.
* An underlying employee profile detail was updated after the original letter was printed.
* A typographical error needs correction in a published letter.

---

### 4.2 Step-by-Step Reissue Workflow

```
┌────────────────────────────────────────────────────────────────────────┐
│  Reissue Letter: ACME/BON/2026-2027/0001                               │
├────────────────────────────────────────────────────────────────────────┤
│  Predecessor Information:                                              │
│  Current Document: Bonafide Letter — Asha Rao (Version 1)              │
│  Current Status:   Published                                           │
│                                                                        │
│  Updated Information:                                                  │
│  Purpose of Letter:                                                    │
│  [ Opening a priority savings account with ICICI Bank            ]     │
│  (Previously: "Opening a salary account with HDFC Bank")               │
│                                                                        │
│  Reason for Reissue (Required for Audit Compliance):                   │
│  [ Employee switched bank application to ICICI Bank; requested   ]     │
│  [ updated bonafide verification.                                ]     │
│                                                                        │
│  Notice of Compliance:                                                 │
│  • Version 1 will be permanently marked as "Superseded".               │
│  • A new Version 2 will be minted with a fresh Reference Number.       │
│  • The employee's portal will update to display Version 2.             │
│                                                                        │
│  [ Cancel ]                                       [ Confirm Reissue ]  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Open the Letter:**
   Locate the original letter in the **Issued Letters Register** and click **Reissue**.
2. **Update the Information:**
   Modify the narrative fields (e.g., update the purpose, destination address, or notes). The employee name and template cannot be changed—reissuing always maintains continuity for the same employee and letter type.
3. **Provide a Reason for Reissue:**
   Enter a brief business justification (e.g., *"Corrected bank name requested by employee"*). This explanation is permanently recorded in the document audit history.
4. **Confirm Reissue:**
   Click **"Confirm Reissue"**.

---

### 4.3 What Happens Behind the Scenes During Reissue?

```
                         REISSUE LIFECYCLE
                         
 ┌─────────────────────────┐               ┌─────────────────────────┐
 │   ORIGINAL LETTER (V1)  │               │   NEW REISSUED DOC (V2) │
 │  Ref: .../0001          │   Reissued    │  Ref: .../0002          │
 │  Status: PUBLISHED      │ ────────────> │  Status: PUBLISHED      │
 │                         │               │                         │
 │  Status transitions to: │               │  Linked to Version 1    │
 │  "SUPERSEDED"           │               │  Shows in Active Portal │
 └─────────────────────────┘               └─────────────────────────┘
         │                                              │
         ▼                                              ▼
   Permanently Archived                         Active Official Document
  (Never deleted or altered)                   (Immediate Employee Access)
```

1. **Version 1 is Preserved:** The original PDF file is **not** deleted or modified. Its status transitions from `Published` to `Superseded`. It remains accessible in HR historical archives to prove what was originally printed.
2. **Version 2 is Minted:** A brand-new letter record is created with `version: 2`, linked to the original document group.
3. **New Reference Number:** Version 2 is assigned the next sequential number (e.g., `.../0002`).
4. **Portal Update:** The employee's portal automatically updates to display Version 2 as the active, current document.

---

## 📱 5. The Employee Self-Service Experience

Employees do not need to wait for physical letters to be delivered through inter-office mail or emailed as unencrypted attachments.

---

### 5.1 Viewing and Downloading Issued Letters
1. **Accessing the Portal:** The employee logs in to the HRMS and navigates to **My Documents > Official Letters**.
2. **Employee Document List:**
   The employee sees a clean card or list displaying every letter issued to them:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  My Official Letters & Certificates                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  📄 Bonafide Letter                                                     │
│     Reference: ACME/BON/2026-2027/0002 • Version 2                      │
│     Issued On: 27-Sep-2026 • Issued By: Human Resources                 │
│     Status:    Active / Verified                                        │
│     [ View Document ]                           [ Download PDF ]        │
│                                                                         │
│  📄 Appointment Letter with Compensation Annexure                       │
│     Reference: ACME/APP/2022-2023/0084 • Version 1                      │
│     Issued On: 14-Jan-2022 • Issued By: Human Resources                 │
│     Status:    Active / Verified • Acknowledged on 15-Jan-2022          │
│     [ View Document ]                           [ Download PDF ]        │
└─────────────────────────────────────────────────────────────────────────┘
```

3. **Downloading the Official PDF:**
   Clicking **"Download PDF"** instantly downloads the signed, high-resolution A4 document. The document contains official corporate letterhead, statutory CIN/GST numbers, clear date stamps, and the authorized signatory signature ready for submission to banks, consulates, or academic institutions.
4. **Digital Acknowledgement (If Required):**
   If HR flagged the letter as requiring acknowledgement, the document displays a prominent banner:
   *"Please review this document and confirm receipt."*
   The employee clicks **"I Acknowledge Receipt"**, which stamps the document with their name, date, time, and IP address.

---

## 🛡️ 6. Document Origin Protection & Security Guardrails

To prevent document tampering and ensure strict legal compliance, Phase 2 implements firm business guardrails:

### 1. No Upload Overwrites on Generated Letters
* In the general Document Management module, HR administrators can upload replacement PDF files for general policies or handbooks.
* **On Generated Corporate Letters, this is strictly prohibited.**
* If a user attempts to upload a manual file over an issued letter, the system halts with a clear notice:
  > *"A generated document cannot be replaced by an upload; reissue it instead."*
* **Why this matters:** Corporate letters carry verifiable digital signatures and system-generated reference numbers. Allowing a manual file upload would break the chain of custody and allow unverified files to masquerade as system-generated documents.

### 2. Guardrails Against Accidental Duplicate Issuance
* If an HR user accidentally double-clicks the "Issue Letter" button or submits the exact same request twice within a few seconds, the system detects the identical request.
* Instead of creating two duplicate letters with two different reference numbers, the system safely recognizes the second request and returns the already-issued letter without burning a second number.

### 3. Automatic Cleanup of Incomplete Requests
* If a letter generation attempt is interrupted halfway through (for example, due to a severe network disconnect or power loss), the system's automated background sentry detects the incomplete document after 30 minutes.
* It safely closes out the failed attempt and removes temporary files, ensuring incomplete drafts never pollute your employee records or consume official serial numbers.

---

## 📊 Document & Recipient Status Lifecycle

The following table summarizes the business statuses used across Phase 2:

| Status | Where It Appears | Business Meaning | Available Actions |
| :--- | :---: | :--- | :--- |
| **`Published`** | HR Register & Employee Portal | The letter is officially issued, active, legally numbered, and visible to the employee. | • HR can view, download, or **Reissue**.<br>• Employee can view, download, or acknowledge. |
| **`Superseded`** | HR Register & History Archive | An earlier version of a letter that was replaced by a newer reissued version. It is frozen for audit integrity. | • HR can view and download for historical audits.<br>• Cannot be reissued again (only the latest published version can be reissued). |
| **`Retired`** | HR Register | A letter that was formally withdrawn or cancelled by HR. | • Viewable only in historical HR archives.<br>• Hidden from the employee's active document list. |
| **`Pending`** | Employee Portal | The letter has been delivered to the employee, but a required digital acknowledgement is awaiting completion. | • Employee can review and click **"Acknowledge"**. |
| **`Acknowledged`** | HR Register & Employee Portal | The employee has formally signed off and confirmed receipt of the document. | • Document is permanently stamped with acknowledgement timestamp. |

---

## ⚠️ User-Facing Validations & "What Can Go Wrong?"

The system enforces clear, protective rules to ensure every issued letter is complete, accurate, and valid:

| Situation Encountered | Why It Happened | What the User Should Do Next |
| :--- | :--- | :--- |
| **"Required letter facts are missing: employee_code, joining_date"** | The selected employee does not have an employee code or date of joining recorded in their HR profile. | Open the employee's profile in **Employee Management**, fill in the missing profile fields, save the profile, and return to issue the letter. |
| **"Field 'designation' is derived and cannot be overridden"** | HR attempted to manually type a different job title into a custom override field. | Official job titles must come from the employee's profile. Update the employee's official designation under **Job Details** first, then issue the letter. |
| **"This letter template is disabled for your organization"** | The requested letter template has been toggled to "Disabled" in company template settings. | Navigate to **Document Settings > Letter Templates**, locate the template, and toggle it to **Enabled**. |
| **"Only a published letter can be reissued"** | HR attempted to click Reissue on a letter that has already been superseded by a newer version or retired. | Locate the latest **Published** version of the letter in the register and initiate the reissue from that active record. |
| **"A generated document cannot be replaced by an upload"** | A user attempted to use the manual file upload screen to upload a PDF file over a generated letter. | Generated letters cannot be overwritten via file upload. Use the **Reissue** workflow to generate an official updated version. |
| **"Date must be within 365 days of today"** | An entered issue date is more than one year in the past or future. | Enter a realistic effective date within the allowed 1-year window. |

---

## 🔄 Phase 1 vs. Phase 2: What Changed for Users?

The table below highlights the operational differences between Phase 1 and Phase 2:

| Feature / Capability | Phase 1 (Letterhead & Preview) | Phase 2 (Live Issuance & Reissue) | Business Impact |
| :--- | :--- | :--- | :--- |
| **Employee Targeting** | ❌ Synthetic sample data only (*"Asha Sample"*). Real employees could not be selected. | ✅ Real employee selection. Real facts pulled automatically. | Real letters can now be created for actual workforce members. |
| **Watermarking** | ⚠️ Mandatory diagonal `PREVIEW` watermark across all pages. | ✅ Clean, official corporate document with **zero watermark**. | Issued letters are 100% valid for external banks, visas, and legal use. |
| **Reference Numbers** | ❌ None. Documents carried no serial tracking. | ✅ Sequential corporate reference numbers (e.g. `ACME/BON/2026-27/0001`). | Complete audit traceability across financial years. |
| **Employee Portal Delivery** | ❌ None. Sample previews were discarded immediately. | ✅ Instant publishing to Employee Self-Service Document Portal. | Zero email delays; employees get instant digital access. |
| **Document History & Reissue** | ❌ None. Previews were ephemeral. | ✅ Immutable versioning. Version 1 is superseded; Version 2 is minted. | Flawless compliance; no accidental deletion of past records. |
| **Upload Protections** | ❌ Standard upload tools were unaware of generated documents. | ✅ Origin guards prevent file uploads from overwriting generated letters. | Guards against document tampering and fraudulent file replacement. |

---

## 📖 Real-World Business Examples

### Scenario A: Issuing an Urgent Bonafide Letter for an Employee's Home Loan
1. **The Request:** Employee *Asha Rao* informs HR that her mortgage lender requires an official Bonafide Letter confirming her employment, designation, and current office address within 24 hours.
2. **HR Action:**
   * HR administrator *Rajesh* opens **HR Management > Documents > Issue New Letter**.
   * He selects **"Bonafide Letter"** and searches for **"Asha Rao"**.
   * The system automatically confirms Asha is a *Senior Software Engineer* who joined on *14-Jan-2022*.
   * Under *Purpose*, Rajesh enters: *"Applying for a housing loan with HDFC Bank"*.
   * Rajesh clicks **"Issue & Publish Letter"**.
3. **The Result:**
   * The letter is assigned reference number `ACME/BON/2026-2027/0001`.
   * The PDF is rendered with the company crest, registered address, CIN/PAN details, and the HR Director's signature.
   * Asha receives an instant notification on her smartphone. She opens her portal, downloads the PDF, and forwards it to her loan officer 5 minutes after making the request.

---

### Scenario B: Correcting and Reissuing a Letter with an Updated Bank Name
1. **The Situation:** Two days later, Asha notifies HR that her loan was switched from HDFC Bank to ICICI Bank, and the bank requires the letter addressed specifically to ICICI Bank.
2. **HR Action:**
   * Rajesh opens the **Issued Letters Register** and locates letter `ACME/BON/2026-2027/0001`.
   * He clicks **Reissue**.
   * He updates the purpose to: *"Applying for a housing loan with ICICI Bank"*.
   * Under *Reason for Reissue*, he notes: *"Employee switched lender to ICICI Bank"*.
   * He clicks **Confirm Reissue**.
3. **The Result:**
   * The original letter (`.../0001`) is marked **`Superseded`**.
   * A new Version 2 is generated with reference number `ACME/BON/2026-2027/0002`.
   * Asha's portal now shows Version 2 as her active document, while company archives maintain a complete record of both documents for audit compliance.

---

## ❓ Frequently Asked Questions (FAQ)

### General & Access Questions

#### Q1: Who has permission to issue formal letters?
**A:** Only authorized **HR Administrators** with document management permissions can issue or reissue letters. Employees cannot generate letters for themselves, and managers cannot issue letters without HR review.

#### Q2: Can an employee see other employees' letters?
**A:** **Never.** The system enforces strict employee isolation. An employee logged into the self-service portal can only see documents explicitly addressed to their personal user account.

#### Q3: Can a People Manager see letters issued to their team members?
**A:** Managers can view non-confidential documents belonging to their direct reports only if your company has enabled the *"Manager Team Document Viewing"* setting. Highly confidential documents (such as salary certificates or disciplinary letters) remain restricted to HR and the individual employee.

---

### Generation & Fact Questions

#### Q4: Why can't I edit an employee's salary or job title directly on the issuance screen?
**A:** This is a core compliance safeguard. Official letters must represent true corporate records. If a salary figure or job title could be manually typed on the issuance form, human error or unauthorized promises could lead to legal liability. If an employee's title or salary has changed, update their official HR profile or approved salary structure first—the letter will then reflect the verified figures automatically.

#### Q5: Can I issue a letter dated in the past or future?
**A:** Yes. The *Effective Date* field allows you to select any date within 365 days (one year) before or after today. This allows HR to issue letters reflecting a past promotion or a future onboarding date.

#### Q6: What happens if an employee does not have a date of joining or employee code in the system?
**A:** The system will prevent issuance and display a clear message indicating which specific facts are missing (e.g., *"Required letter facts are missing: employee_code"*). Once you fill in the missing fields on the employee's profile, issuance will succeed immediately.

---

### Reference Number & Reissue Questions

#### Q7: Can a reference number ever be reused or reassigned?
**A:** **No.** Every reference number is uniquely sealed to that specific document record. Even if a letter is superseded or retired, its reference number is permanently retired with it to ensure complete audit integrity.

#### Q8: What is the difference between "Superseded" and "Retired"?
**A:** 
* **`Superseded`** means a letter was replaced by a newer, corrected version (Version 2, Version 3, etc.) through the Reissue process.
* **`Retired`** means a letter was withdrawn or cancelled entirely without being replaced.

#### Q9: Can I reissue a letter multiple times?
**A:** Yes. If a document requires multiple amendments over time, each reissue creates the next version in sequence (Version 2, Version 3, Version 4), always superseding the immediate predecessor while maintaining the complete historical chain.

#### Q10: Why did the system block me from uploading a replacement PDF file?
**A:** Generated letters are protected by origin guardrails. Because they carry verified signatures, official reference numbers, and cryptographic checksums, they cannot be overwritten with an uploaded file. If you need to change a generated letter, always use the **Reissue** button.

---

## 📋 Final Feature Verification Summary

| Feature / Capability | Operational Status | User Roles Supported | Primary Screen / Access Point |
| :--- | :---: | :---: | :--- |
| **Formal Letter Issuance (#139)** | **Live & Operational** | `HR Administrator` | **HR Management > Documents > Issue New Letter** |
| **Issued Letters Register (#140)** | **Live & Operational** | `HR Administrator` | **HR Management > Documents > Issued Letters** |
| **Letter Detail & Audit View (#141)**| **Live & Operational** | `HR Administrator` | **Issued Letters > [View Details]** |
| **Letter Reissue & Supersede (#142)**| **Live & Operational** | `HR Administrator` | **Issued Letters > [Reissue Letter]** |
| **Employee Self-Service Access** | **Live & Operational** | `Employee` | **Employee Portal > My Documents > Official Letters** |
| **Sequential Reference Engine** | **Live & Operational** | System Automated | Automatically embedded during issuance |
| **Origin Upload Guards** | **Live & Operational** | System Automated | Rejects manual file upload attempts on generated letters |
| **Background Orphan Sweeper** | **Live & Operational** | System Automated | Runs automatically in background to resolve stale drafts |
