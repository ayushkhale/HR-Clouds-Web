# Phase 3: Documents Module (Compliance, Acknowledgement & Signatures) — Business Walkthrough & User Guide

This document provides a comprehensive, user-facing guide to **Phase 3 of the Documents Module**. It explains how the compliance, acknowledgement, and digital signature features operate, how they solve corporate governance and regulatory audit challenges, and how HR administrators, people managers, and employees interact with mandatory policy acknowledgements, digital typed signatures, compliance dashboards, and audit-ready reports.

This guide is written in clear, accessible business language for HRMS users, team managers, and enterprise stakeholders. It describes the exact user experience, workflows, permissions, and guardrails without exposing technical code, API routes, or developer-only jargon.

---

## 🚀 What Document Module Phase 3 Provides

While Phase 1 established the foundation for **employee personal documents** (identities, education certificates, and tax proofs) and Phase 2 introduced **organization-issued policies and notices**, Phase 3 closes the compliance loop. It transforms issued company documents into enforceable, verifiable corporate agreements.

Phase 3 introduces:

* **Official Digital Policy Acknowledgements:** Employees can formally confirm that they have read, understood, and agreed to company policies, notices, and handbook updates with a single, clear action.
* **Legally Evidenced Digital Signatures (Typed Signatures):** For sensitive documents, contracts, and addenda that demand a formal signature, employees can type their legal name. The system verifies this name against their official employee profile, creating an immutable legal record.
* **Tamper-Proof Compliance Ledger:** Every acknowledgement and signature is permanently frozen. Neither HR administrators, managers, nor employees can edit, alter, or delete an acknowledgement or signature once submitted.
* **Live Digital Receipts for Employees:** Employees can open any signed or acknowledged document in "My HR Documents" and view their official compliance receipt, verifying the exact timestamp, policy version, and verification status.
* **Dynamic Action Prompts for Employees (`Next Action`):** Employees see immediate visual cues on their dashboard—clearly displaying whether a policy requires an `"Acknowledge"` or `"Sign"` action, or whether compliance is already `"Completed"`.
* **Intelligent Overdue & Deadline Derivation:** Policies calculate remaining days and overdue warnings dynamically based on the current calendar date. Employees and HR see clear signals (e.g., "Due in 5 days" or "Overdue by 3 days") without delays or background system errors.
* **Fallback Deadlines for Mandatory Compliance:** If an HR administrator issues a mandatory policy without specifying a custom due date, the company's default deadline setting (e.g., 7 days) automatically applies.
* **Company-Wide Compliance Dashboard for HR:** HR Administrators gain a real-time, bird's-eye view of organizational compliance across every active policy, complete with completion percentages, pending tallies, and overdue counts.
* **One-Click Audit-Ready CSV Export:** HR can download detailed compliance reports with complete timestamps, employee IDs, and status breakdowns, fully formatted for audit review and secured against spreadsheet tampering.
* **Individual Employee Forensic Evidence Viewer:** In case of audits or disputes, HR can inspect the complete legal evidence for any specific employee on any policy.
* **Manager Team Compliance View (Tier-A View):** People Managers can monitor compliance across their direct reports—identifying who is pending or overdue on required policies—while strict privacy controls ensure managers never see confidential policies.
* **Flexible Organizational Compliance Settings:** HR can configure the company's default acknowledgement window (1 to 365 days), choose between signature providers, and configure compliance blocking visibility.

---

## 🔑 Key Concepts & Compliance Lifecycle

Understanding the core concepts of Phase 3 ensures smooth administration, transparent employee communication, and seamless audit readiness.

### 1. The Dual Obligation Model: Acknowledgement vs. Signature

Organization policies can require either an Acknowledgement, a Digital Signature, or neither:

| Obligation Type | Business Meaning | Typical Document Examples | Employee Action |
| :--- | :--- | :--- | :--- |
| **No Obligation** | Informational document; reading is recommended but not legally tracked. | General Company Announcements, Holiday Calendars, Canteen Guidelines. | Read / Download only. Status remains `Viewed`. |
| **Requires Acknowledgement** | Statutory notice or operational policy where proof of employee notice is mandatory. | Employee Handbook, POSH Policy, IT Security Standards, Leave Encashment Rules. | Employee clicks **"Acknowledge Document"** to confirm receipt and understanding. |
| **Requires Signature** | Formal contract or bilateral agreement requiring an explicit personal signature. | Employment Offer Letter, Non-Disclosure Agreement (NDA), Compensation Revision Letter, Performance Improvement Plan (PIP). | Employee types their legal name, verified against their official company profile. |

> [!NOTE]
> **Monotonic Progression Rule:** Signing is legally stronger than acknowledgement. If a document requires both or previously required acknowledgement, submitting a **Signature** automatically satisfies and completes all acknowledgement obligations.

---

### 2. Recipient Status vs. Compliance Verdict

To provide crystal-clear tracking for both users and administrators, Phase 3 distinguishes between the **stored status** of an employee's copy and the **dynamic compliance verdict**:

#### Recipient Lifecycle Statuses

```text
 ┌─────────┐   Open / Download    ┌────────┐    Acknowledge (#73)   ┌──────────────┐
 │ Pending ├─────────────────────►│ Viewed ├───────────────────────►│ Acknowledged │ [COMPLETED]
 └────┬────┘                      └───┬────┘                        └──────┬───────┘
      │                               │                                    │
      │ (HR Waive)                    │ (HR Waive)                         │ Sign (#74)
      └──────────────┬────────────────┘                                    │
                     ▼                                                     ▼
               ┌───────────┐                                         ┌───────────┐
               │  Waived   │ [COMPLETED]                             │  Signed   │ [COMPLETED]
               └───────────┘                                         └───────────┘
```

* **`Pending`**: The document has been published to the employee's portal, but the employee has not yet opened or viewed it.
* **`Viewed`**: The employee has clicked to view or download the document. The system automatically records the exact date and time of first viewing.
* **`Acknowledged`**: The employee has submitted their formal acknowledgement.
* **`Signed`**: The employee has submitted their verified digital typed signature.
* **`Waived`**: HR has granted an official administrative waiver excusing the employee from complying (e.g., sabbatical, extended medical leave).

#### Dynamic Compliance Verdicts (Evaluated Daily)

On any given day, an employee's compliance state for an active document is evaluated against the calendar:

| Compliance Verdict | Meaning | What the Employee Sees | What HR / Manager Sees |
| :--- | :--- | :--- | :--- |
| **`Completed`** | The obligation has been fully discharged via Acknowledgement or Signature. | `"Completed"` (Badge) with `"View Receipt"` action. | Counted under **Completed**. Compliant. |
| **`Pending`** | The document still requires action, but the deadline has not yet passed (or no deadline was set). | `"Action Required"` with remaining countdown (e.g., `"Due in 4 days"`). | Counted under **Pending**. Awaiting action within allowable window. |
| **`Overdue`** | The deadline date has passed and the document has not been acknowledged or signed. | High-priority amber/red alert: `"Overdue by X days"`. | Counted under **Overdue**. Actionable escalation needed. |
| **`Waived`** | The employee was officially excused by HR. | `"Excused / Waived"` (Badge). No further action needed. | Counted under **Waived**. Excluded from pending/overdue tallies. |

> [!IMPORTANT]
> **Strict Deadline Rule:** A document is **NOT overdue on the day it is due**. Overdue status triggers strictly on the day *after* the due date.

---

### 3. Tamper-Proof Legal Evidence

When an employee acknowledges or signs a document, the system does not simply flip a toggle switch. It generates an immutable, legally defensible audit record containing:

1. **Exact Policy Version:** Proof of whether the employee signed Version 1 ($v1$), Version 2 ($v2$), etc.
2. **Cryptographic Content Fingerprint:** A unique digital fingerprint (checksum) of the exact PDF file served to the employee. If a policy file is later replaced, the original signature remains tied to the exact bytes agreed upon.
3. **Official Server Timestamp:** Exact UTC date, hour, minute, and second of submission.
4. **Signer Identity:** For signatures, the exact typed name entered by the employee.
5. **Technical Context:** Client IP address and browser context recorded for audit verification.

Once committed, this evidence cannot be modified, overwritten, or erased by any user in the system.

---

## 👤 1. Employee Self-Service Workflows

Employees interact with company policies and compliance requirements through the **"My HR Documents"** section of the employee portal.

---

### 1.1 Reviewing Issued Documents & Action Badges

**Purpose:** Easily identify which company policies require your attention, which are optional, and which have impending deadlines.

* **Where to find it:** Navigate to **Documents > My HR Documents**.
* **What you see:** A clean list of all institutional documents, policies, and letters issued to you, displaying:
  * Document Title and Description
  * Publication Date & Policy Version (e.g., $v1$, $v2$)
  * Obligation Type (`Acknowledgement Required`, `Signature Required`, or `Informational`)
  * Due Date & Countdown (e.g., `"Due on Oct 15, 2026 — 5 days remaining"`)
  * Compliance Status Badge (`Pending`, `Overdue`, `Completed`, or `Waived`)
  * Next Action Button (`Acknowledge`, `Sign`, `View Receipt`, or `Read`)
* **Filtering Options:**
  * Filter by Compliance Status: **All**, **Pending**, **Overdue**, **Completed**, or **Waived**.
  * Filter by Document Category (e.g., Policies, Onboarding, Disciplinary).

---

### 1.2 Acknowledging a Policy

**Purpose:** Confirm that you have received, read, and understood an issued organizational policy.

* **Step-by-Step Workflow:**
  1. Open **Documents > My HR Documents**.
  2. Locate the policy displaying an amber badge: **"Action Required: Acknowledge"**.
  3. Click **"View Document"** to open and review the policy document in your browser.
  4. At the bottom of the document viewer, click the button: **"Acknowledge Document"**.
  5. An optional confirmation checkbox is presented: *"I confirm that I have read and agree to comply with this policy"*.
  6. Click **"Submit Acknowledgement"**.
* **What happens immediately:**
  * Your status instantly updates to **"Completed"** with a green checkmark.
  * The action button changes to **"View Receipt"**.
  * The policy is removed from your pending tasks and is reflected as completed on your manager's and HR's dashboards.
* **What can go wrong?**
  * *Policy Expired:* If the policy has passed its active validity period, the system will inform you: *"This document is no longer actionable"*. Contact HR for assistance.
  * *Already Waived:* If HR already excused you from this policy, the system notifies you: *"This document has been waived for you"*.

---

### 1.3 Digitally Signing a Document (Typed Signature)

**Purpose:** Submit a verified, legally binding digital signature on contracts, addenda, or disciplinary documents.

* **Step-by-Step Workflow:**
  1. Open **Documents > My HR Documents**.
  2. Locate the document displaying the badge: **"Action Required: Sign"**.
  3. Click **"Review & Sign"** to read the full document.
  4. Click the primary button: **"Sign Document"**.
  5. A secure signature modal opens:
     * Your official name as registered with the company is displayed as guidance.
     * A text box labeled **"Type Your Full Legal Name"** appears.
  6. Type your name exactly as registered (e.g., *"Asha Rao"*).
  7. Click **"Confirm & Sign"**.
* **What happens immediately:**
  * The system verifies that the typed name matches your official profile name.
  * Upon verification, the document status permanently transitions to **"Signed"** (`Completed`).
  * An immutable legal signature certificate is recorded with your name, date, time, and IP address.
  * The document action button updates to **"View Receipt"**.
* **What can go wrong?**
  * *Name Mismatch:* If you misspell your name or enter a nickname, the system prompts: *"The typed name does not match your profile"*. You must type your legal first and last name or your registered display name.
  * *Signature Not Required:* If the document was previously modified to not require a signature, the system notifies you accordingly.

---

### 1.4 Viewing Your Compliance Receipt

**Purpose:** Inspect and verify your proof of compliance for any completed document at any time.

* **Step-by-Step Workflow:**
  1. In **My HR Documents**, find any policy marked **"Completed"**.
  2. Click **"View Receipt"**.
  3. A clean, formatted digital receipt modal appears, displaying:
     * **Document Title:** e.g., "Anti-Harassment & POSH Policy 2026"
     * **Policy Version:** e.g., Version 2 ($v2$)
     * **Compliance Form:** "Acknowledged" or "Digitally Signed"
     * **Typed Signer Name:** e.g., "Asha Rao" (for signatures)
     * **Submission Timestamp:** e.g., "September 24, 2026 at 11:45 AM IST"
     * **Document Fingerprint:** Digital checksum proving the exact file version you reviewed
* **Result:** You have permanent, verifiable proof that you complied with the policy requirement.

---

## 👥 2. People Manager Workflows (Tier-A Compliance)

People Managers possess oversight responsibility for their direct reporting teams. Phase 3 equips managers with dedicated tools to track team readiness and policy compliance without compromising employee privacy.

---

### 2.1 Viewing Team Policy Compliance

**Purpose:** Monitor which team members have read and signed mandatory company policies, and identify who has overdue items requiring attention.

* **Who uses it:** People Managers with active direct reports.
* **Where to find it:** Navigate to **Documents > Team Compliance**.
* **What you see:** A structured compliance roster grouped by team member:
  * **Employee Name & Code:** e.g., "Asha Rao (EMP-042)"
  * **Pending Count:** Total number of active policies awaiting action within their allowed deadline.
  * **Overdue Count:** Total number of policies that have passed their deadline without action.
  * **Document List:** An expandable list showing each outstanding policy, its title, due date, and days remaining.
* **Filtering & Search:**
  * **Search by Team Member:** Filter the view to focus on a specific direct report.
  * **"Overdue Only" Toggle:** Instantly filter the team view to display only team members who have at least one overdue policy.

---

### 2.2 Strict Manager Privacy Safeguards

To prevent sensitive personnel matters from becoming general knowledge, Phase 3 enforces strict privacy rules on the manager view:

1. **Confidential Policies are Excluded:** If HR issues a confidential document (such as a private grievance letter or confidential performance notice), it is **completely hidden from the team compliance view**. Managers only see standard team-wide and department-wide policies.
2. **Hierarchy Isolation:** A manager can only view employees who officially report to them in the company hierarchy. Entering an employee ID belonging to another department displays an empty result without confirming or denying that employee's existence.
3. **Company Policy Oversight Setting:** If the organization disables the setting *"Allow managers to view team documents"*, the Team Compliance menu is deactivated for all managers.

---

## 🏢 3. HR Administrator Workflows

HR Administrators govern organizational compliance, monitor company-wide completion rates, generate audit reports, and inspect legal evidence.

---

### 3.1 Monitoring the Company-Wide Compliance Dashboard

**Purpose:** Assess organization-wide compliance posture across all published company policies.

* **Where to find it:** Navigate to **Documents > Compliance Dashboard**.
* **What you see:** A centralized table listing every published policy that carries an acknowledgement or signature obligation:
  * **Document Title & Code:** e.g., "Code of Business Conduct 2026"
  * **Target Audience:** Department, Location, or All Employees
  * **Publication Date:** Date when the live version was distributed
  * **Total Targeted:** Total number of active employees assigned to this document
  * **Completed:** Number of employees who have acknowledged or signed
  * **Pending:** Number of employees within their allowable compliance window
  * **Overdue:** Number of employees who have missed their deadline
  * **Waived:** Number of employees administratively excused
  * **Completion Rate (%):** Visual progress bar and percentage (e.g., `85.4%`)
* **Filtering Tools:**
  * Filter by **Document Type** (e.g., Code of Conduct, Safety, HR Policies).
  * Filter by **Target Department** (e.g., Engineering, Sales, Human Resources).
  * Toggle **"Overdue Only"** to highlight policies requiring administrative follow-up.

---

### 3.2 Inspecting a Policy's Full Recipient Roster

**Purpose:** Drill down into a specific policy to see every employee's status and evidence.

* **Step-by-Step Workflow:**
  1. In the **Compliance Dashboard**, click on any policy row.
  2. Select **"View Recipient Roster"**.
  3. A detailed table of all targeted employees opens, displaying:
     * Employee Name, Email, and Department
     * Current State (`Pending`, `Viewed`, `Acknowledged`, `Signed`, `Waived`)
     * Due Date & Days Remaining
     * First Viewed Timestamp
     * Completed Timestamp (Date & Time of acknowledgement or signature)
     * Quick Action: **"View Evidence"** or **"Waive"** (if pending)

---

### 3.3 Exporting Audit-Ready Compliance Reports (CSV)

**Purpose:** Generate formal compliance spreadsheets for regulatory bodies, executive leadership, or external auditors.

* **Step-by-Step Workflow:**
  1. Open **Documents > Compliance Dashboard**.
  2. Apply any desired filters (e.g., select a specific department or toggle "Overdue Only"). Leave filters empty to export the entire organization.
  3. Click **"Export Compliance (CSV)"**.
  4. The system immediately generates and downloads a file named:
     `document-compliance-YYYY-MM-DD.csv`
* **What the Export Contains:**
  The downloaded CSV file includes 16 standardized columns:
  * Document ID, Title, and Version
  * Employee Code and User ID
  * Stored Status (`Pending`, `Viewed`, `Acknowledged`, `Signed`, `Waived`)
  * Compliance State (`Completed`, `Pending`, `Overdue`, `Waived`)
  * Due Date and Days Remaining
  * First Viewed Timestamp
  * Acknowledged Timestamp & Version
  * Signed Timestamp & Signature Provider
  * Waiver Timestamp & Reason (if applicable)
* **Built-in Security Guardrails:**
  * **Excel-Safe Formatting:** The CSV includes an automatic character encoding marker so employee names with special characters or accents display properly in Microsoft Excel and Google Sheets.
  * **Formula-Injection Shield:** Any text cell beginning with characters like `=`, `+`, or `-` is safely escaped, protecting HR computers from spreadsheet security vulnerabilities.
  * **Large-Dataset Protection:** Exports are supported up to 50,000 records per file. For massive enterprise workforces, filtering by department or policy ensures fast, reliable downloads.

---

### 3.4 Inspecting Individual Legal Evidence (Dispute & Audit Review)

**Purpose:** Retrieve definitive legal proof of acknowledgement or signature for a specific employee in case of a legal dispute or formal audit inquiry.

* **Step-by-Step Workflow:**
  1. In the **Compliance Dashboard**, open the policy and locate the employee in the Recipient Roster.
  2. Click **"View Legal Evidence"**.
  3. An evidentiary report modal opens, displaying:
     * **Signer Information:** Employee Full Name, User ID, and Employee Code.
     * **Policy Verification:** Title, Version Number, and SHA-256 Cryptographic File Hash.
     * **Acknowledgement Details:** Exact timestamp of submission and Client IP address.
     * **Signature Details:** Typed signature string as entered by the employee and confirmation timestamp.
* **Result:** HR has incontrovertible proof that the employee received, accessed, and agreed to the specific policy version.

---

### 3.5 Configuring Organization Compliance Settings

**Purpose:** Tailor compliance rules, default deadlines, and signature options to match corporate policy.

* **Where to find it:** Navigate to **Documents > Settings > Compliance & Signatures**.
* **Available Settings:**
  1. **Default Acknowledgement Due Days:**
     * Defines the standard compliance window (between 1 and 365 days; default: **7 days**).
     * When HR publishes a mandatory policy without specifying a custom deadline, this default window is automatically assigned.
  2. **Compliance Blocking Alerts:**
     * Toggle `ON` to flag overdue policies with high-priority visual alerts in the employee portal.
  3. **Digital Signature Provider:**
     * Configures the active digital signature mechanism (Default: **Internal Typed Signatures**).
* **Step-by-Step:**
  1. Adjust the required parameters.
  2. Click **"Save Settings"**.
  3. Changes apply immediately to all newly published policies.

---

## 📊 Summary of Statuses & Indicators

To help all users understand what they see on screen, here is the complete reference of statuses across the Documents Module:

### 1. Document Lifecycle Statuses (Policy-Level)

| Status | Meaning | Can Employees See It? | Available Actions |
| :--- | :--- | :--- | :--- |
| **`Draft`** | The policy is being authored or revised. | No (Hidden) | HR/Manager can edit details, attach files, update targeting, or delete. |
| **`Published`** | The policy is official, live, and legally active. | Yes (Eligible recipients) | Employees can view, acknowledge, or sign. HR can replace or retire. |
| **`Superseded`** | A newer version ($v+1$) has been published. | Yes (Historical read-only) | Employees can view what they previously agreed to. Cannot be newly acknowledged. |
| **`Retired`** | The policy was officially withdrawn by HR. | Yes (Historical read-only) | Read-only archive for past recipients. Deactivated from compliance dashboards. |
| **`Rejected`** | A manager proposal was reviewed and declined by HR. | Proposing Manager & HR only | Manager can review feedback and submit a new proposal. |

---

### 2. Recipient Compliance States (Employee-Level)

| State Badge | Meaning | Who Sees It | What Can the User Do? |
| :--- | :--- | :--- | :--- |
| **`Pending`** | Assigned to the employee; waiting for action within allowable deadline. | Employee, Manager, HR | Employee: Open and Acknowledge or Sign.<br>HR: Grant administrative waiver. |
| **`Viewed`** | The employee opened the document, but has not yet acknowledged or signed. | Employee, Manager, HR | Employee: Complete Acknowledgement or Signature.<br>HR: Grant administrative waiver. |
| **`Overdue`** | The compliance deadline has passed without completion. | Employee, Manager, HR | Employee: Complete the overdue requirement immediately.<br>Manager/HR: Follow up. |
| **`Completed`** | The employee has successfully acknowledged or signed the policy. | Employee, Manager, HR | Employee: View digital compliance receipt.<br>HR: View legal forensic audit trail. |
| **`Waived`** | The employee was officially excused by HR. | Employee, Manager, HR | Read-only. No further compliance action required. |

---

## 🛡️ User-Facing Validation Rules & Safeguards

The system includes built-in safeguards to ensure data integrity and prevent user errors:

1. **Exact Name Matching for Signatures:**
   * When signing a document, you must type your full legal name or your official company display name.
   * Typing initials, nicknames, or another person's name will be rejected.
2. **Expired Documents Cannot Be Acknowledged:**
   * If a policy reaches its expiration date, it remains accessible for reading, but the "Acknowledge" button is disabled. Contact HR for the updated policy.
3. **Completed Documents Cannot Be Waived:**
   * Once an employee has submitted an acknowledgement or signature, HR cannot retroactively waive the document. The legal record is permanent.
4. **Waived Documents Cannot Be Signed:**
   * If an employee has been excused from a policy, they cannot submit an acknowledgement or signature for that version.
5. **Single Active Policy Version:**
   * There can only be one published version of a policy group live at any time. When Version 2 is published, Version 1 is automatically archived.
6. **No Duplicate Signatures:**
   * Clicking "Sign" or "Acknowledge" multiple times or on a slow network connection will safely register your submission once without creating duplicate records or error alerts.

---

## 🔄 Evolution Across Phases (Phase 1 → Phase 2 → Phase 3)

Understanding how Phase 3 connects with earlier phases provides a complete picture of the Documents Module:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Employee-Owned Plane                                          │
│ • Personal documents (PAN, Passport, Degrees, Form 16)                 │
│ • Two-tier Maker-Checker verification (Manager recommend -> HR verify) │
│ • Secure upload links & file expiration tracking                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 2: Organization-Issued Plane                                     │
│ • Company-wide policies, handbooks, and targeted letters               │
│ • Audience targeting (Department, Location, Employment Type)           │
│ • Policy versioning (v1 -> v2) and automated read/view tracking        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 3: Compliance & Legal Signatures                                 │
│ • Official digital policy acknowledgements                             │
│ • Verified digital typed signatures with profile name matching         │
│ • Real-time compliance dashboards & manager team tracking              │
│ • Audit-ready CSV export & forensic evidence ledgers                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Differences in Phase 3
* **From Viewing to Agreeing:** In Phase 2, opening a document marked it as `Viewed`. In Phase 3, viewing is merely the first step; formal `Acknowledgement` or `Signature` is tracked as legal compliance.
* **From Static Due Dates to Dynamic Overdue Tracking:** Phase 3 introduces intelligent, daily-evaluated compliance states, accurately identifying who is on schedule and who is overdue.
* **From Operational Lists to Audit Dashboards:** Phase 3 provides dedicated compliance consoles for HR and Managers, replacing manual spreadsheets with real-time analytics and one-click audit exports.

---

## ❓ Frequently Asked Questions (FAQ)

### For Employees

**Q: Where do I find policies that I need to sign or acknowledge?**  
**A:** Log into your employee portal and navigate to **Documents > My HR Documents**. Any policy requiring your attention will display an amber **"Action Required"** badge.

**Q: Why was my typed signature rejected?**  
**A:** Your typed signature must match your official company profile name (either your registered First and Last Name or your official Display Name). Check the spelling and try again.

**Q: Can I change or delete my signature after submitting?**  
**A:** No. To maintain legal compliance and evidentiary integrity, digital signatures and acknowledgements are permanent and cannot be modified or deleted.

**Q: What happens if a policy is updated to Version 2 ($v2$)? Do I need to sign it again?**  
**A:** If HR publishes a new version that requires acknowledgement, Version 2 will appear in your "My HR Documents" with an "Action Required" notice. You can always view your previous Version 1 agreement in your history.

---

### For People Managers

**Q: Can I acknowledge or sign a policy on behalf of one of my team members?**  
**A:** No. Compliance acts must be personally executed by the individual employee to remain legally valid.

**Q: Why don't I see confidential warning letters in my Team Compliance dashboard?**  
**A:** To protect employee privacy, the Team Compliance view strictly excludes confidential personnel documents. Confidential documents are managed directly between HR, the issuing manager, and the employee.

**Q: What should I do if a team member is marked as "Overdue"?**  
**A:** Remind the team member to open their portal, review the policy, and complete their acknowledgement or signature.

---

### For HR Administrators

**Q: What happens if I publish a policy without specifying an acknowledgement due date?**  
**A:** The system automatically applies the organization's **Default Acknowledgement Due Days** (configured in Documents > Settings, typically 7 days). This ensures every mandatory policy has a clear deadline.

**Q: Can I excuse an employee from acknowledging a policy?**  
**A:** Yes. Open the policy's Recipient Roster, locate the employee, and click **"Waive"**. You must enter a mandatory business reason (e.g., sabbatical or extended sick leave).

**Q: Can I waive an employee who has already signed the document?**  
**A:** No. Once an employee has signed or acknowledged a document, their legal record is permanent and cannot be waived.

**Q: How do I provide proof of compliance to an external auditor?**  
**A:** Open **Documents > Compliance Dashboard**, apply any desired filters, and click **"Export Compliance (CSV)"**. The resulting spreadsheet contains complete timestamps, employee IDs, policy versions, and compliance statuses.

---

## 📋 Final Feature Verification Summary

| Feature Area | User Roles | Primary Benefit | Implementation Status |
| :--- | :--- | :--- | :--- |
| **Policy Acknowledgements** | Employee | Formal, one-click confirmation of company policies | Fully Implemented |
| **Digital Typed Signatures** | Employee | Legally verified signatures matched to profile records | Fully Implemented |
| **Employee Compliance Receipts** | Employee | Self-service proof of compliance with version tracking | Fully Implemented |
| **Manager Team Compliance View** | Manager, HR | Oversight of direct reports' pending & overdue items | Fully Implemented |
| **HR Compliance Dashboard** | HR | Real-time organization-wide metrics & completion rates | Fully Implemented |
| **Audit CSV Export** | HR | One-click spreadsheet download with formula protection | Fully Implemented |
| **Forensic Evidence Readout** | HR | Defensible legal proof showing timestamps, IP, & hashes | Fully Implemented |
| **Fallback Deadlines** | HR, System | Automatic assignment of default due dates to policies | Fully Implemented |
| **Waiver Protection Guard** | HR | Prevents accidental alteration of completed records | Fully Implemented |
| **Compliance Settings** | HR | Organization-level due days, providers, & alert flags | Fully Implemented |
