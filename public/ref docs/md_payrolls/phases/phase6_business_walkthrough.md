# Phase 6: Payslips, Reporting, Exports & Bank Advice — Business Walkthrough

This document provides a comprehensive, user-facing guide to **Phase 6 of the Payroll module** (the Delivery Layer). It explains how the system translates the calculated payroll numbers into physical and digital documents like Payslips, Bank Advices, Tax Certificates, and Organizational Reports.

This guide is written for HR administrators, Managers, and Employees to understand how to interact with the system, the workflows involved, and how Phase 6 finalizes the payroll cycle.

---

## 🚀 What Phase 6 Provides
Phase 6 focuses exclusively on document delivery and reporting. It introduces:
* **Frozen Payslips (PDF & Digital):** A byte-stable, legally compliant payslip document that never changes after being published, even if the employee later changes their name or department.
* **Auto-Publish & Manual Release Gates:** Tools for HR to hold back payslip visibility until final reviews are complete.
* **Deep-Link Email Dispatch:** Automated, queued email notifications for employees when their payslip is ready.
* **Bank Advice Generation:** Instant CSV generation formatted for bulk NEFT bank uploads.
* **Audited Payroll Reports:** Organization-wide reporting (Payroll Register, Component Reports) with strict export tracking to monitor data access.
* **Annual Statements & Form 16:** Year-end employee tax and salary statements in PDF format.

---

## 🏢 1. HR Administration Workflows

HR users control the final release of payroll documents, dispatch emails, and handle reporting.

### 1.1 Reviewing and Releasing Payslips (The Release Gate)
**What it is:** The workflow to make payslips visible to employees after a payroll run is approved.
* **Who uses it:** HR Only.
* **How to start:** Navigate to *Payroll > Runs > [Select Run] > Payslips*.
* **Workflow:**
  1. Once a payroll run is `approved`, the system generates payslips in the background.
  2. If the organization's settings have `payslip_auto_publish` turned **OFF**, these payslips are generated but placed on **Hold**. 
  3. HR reviews the payslip index to verify the generated amounts.
  4. HR clicks **"Publish Payslips"** (either for the whole run or a selected list of employees).
* **What happens next:** The payslips become immediately visible on the employee and manager portals. The system also tags them with a permanent `published_at` timestamp.
* **Why this matters:** It gives HR a final sanity-check window. If a catastrophic error is found, HR can cancel the run *before* any employee sees a wrong number.

### 1.2 Dispatching Payslip Email Notifications
**What it is:** Sending notifications to employees that their payslip is ready to view.
* **Who uses it:** HR Only (or System Automations).
* **How to start:** Navigate to *Payroll > Runs > [Select Run] > Email Status*.
* **Workflow:**
  1. When payslips are published, they are added to a pending email queue.
  2. The system's background cron job automatically drains this queue and sends the emails.
  3. HR can monitor the **Email Status** dashboard to see how many are `sent`, `pending`, or `failed`.
  4. If needed, HR can click **"Dispatch Emails"** to manually force the queue to process or retry failed addresses.
* **Important Security Rule:** The email sent to the employee **does not contain the PDF**. It contains a secure "deep link" requiring them to log into the HR portal. This prevents sensitive salary data from sitting in personal email inboxes.

### 1.3 Correcting Presentation Errors (Reissuing Payslips)
**What it is:** Issuing a corrected version of a payslip (e.g., if an employee's name was spelled wrong).
* **How to start:** Navigate to *Payroll > Payslip Directory > [Select Payslip]*.
* **Workflow:**
  1. HR selects a published payslip and clicks **"Reissue"**.
  2. HR must provide a mandatory **Reason** (e.g., "Updated department name").
  3. The system generates a "Version 2" payslip and marks "Version 1" as superseded.
* **What can go wrong:** The system strictly checks the financial figures. If the net pay, earnings, or deductions have changed, the reissue will be **blocked**. A reissue is *only* for fixing presentation/profile data (like names and departments). Financial fixes require cancelling and recalculating the payroll run.

### 1.4 Exporting Payroll Reports
**What it is:** Downloading bulk organizational data like the Payroll Register, Department Distribution, or Deduction Summaries.
* **How to start:** Navigate to *Payroll > Reports*.
* **Workflow:**
  1. HR selects a report type (e.g., Payroll Register).
  2. HR selects a target run or a time period (e.g., March to June).
  3. HR chooses the format (CSV or PDF) and clicks **"Export"**.
* **What happens next:** The system generates the file. Crucially, before the download even begins, the system records an **Export Audit** row detailing exactly who downloaded the data and when.
* **Size Limits:** To prevent system crashes, CSV exports are capped at 50,000 rows, and PDF exports are capped at 2,000 rows.

### 1.5 Generating Bank Advice (NEFT CSV)
**What it is:** Creating the bank upload file to actually pay the employees.
* **How to start:** Navigate to *Payroll > Runs > [Select Paid Run] > Bank Advice*.
* **Workflow:** HR clicks "Download Bank Advice".
* **What happens next:** The system decrypts the employee bank account numbers on-the-fly and generates a CSV formatted for NEFT bulk upload. 
* **Important Restriction:** The run must be in the `paid` status. You cannot generate a bank advice for a draft or merely calculated run.

---

## 👥 2. Manager Actions (Visibility & Restrictions)

Managers need to see payroll data for their direct and indirect reports for budgeting and team management.

### 2.1 Viewing Team Payslips
**What it is:** Accessing a subordinate's payslip.
* **How to start:** Navigate to *Team > [Employee Profile] > Payroll*.
* **Workflow:** The manager clicks to view or download the payslip PDF for a specific month.
* **Privacy Restriction:** A manager can **only** see payslips that have been fully published/released by HR. If HR has placed a run on hold, the manager cannot see the payslips (the system will show a generic "Not Accessible" error to avoid revealing that the payroll is calculated but withheld).

### 2.2 Manager Reports
**What it is:** Accessing the Payroll Register or Department Distribution for their own team.
* **How to start:** Navigate to *Team > Reports*.
* **Workflow:** The manager runs the same reports HR uses.
* **Security Restriction:** The system automatically forces a filter. Even if the manager tries to request "All Departments", the system will intersect the query and **only** return data for the employees the manager officially oversees. 

---

## 🧑‍💻 3. Employee Self-Service

Phase 6 provides the final output documents directly to the employee.

### 3.1 Viewing & Downloading Payslips
**What it is:** The employee's monthly salary slip.
* **How to start:** Navigate to *My Payroll > Payslips*.
* **Workflow:** 
  1. The employee sees a grid of their historical payslips.
  2. They can click "View" to see the breakdown on-screen, or "Download PDF" to save the official document.
* **Honesty Note:** Every payslip includes a specific note explaining whether statutory taxes (PF/PT/TDS) were deducted or not, ensuring complete transparency about their take-home pay.

### 3.2 Annual Salary Statement
**What it is:** A month-by-month grid of earnings and deductions for the entire financial year.
* **How to start:** Navigate to *My Payroll > Annual Statement*.
* **Why it matters:** It serves as a comprehensive financial summary useful for loan applications or visa processing when a single payslip isn't enough. It can be viewed on-screen or downloaded as a PDF.

### 3.3 Downloading Form 16
**What it is:** The official government tax certificate (Part B) for filing Income Tax returns.
* **How to start:** Navigate to *My Payroll > Form 16*.
* **Workflow:** The employee selects the finalized financial year and downloads the PDF.
* **Restriction:** Employees can only download this *after* HR has officially finalized the financial year.

---

## 🔄 4. Real-World Workflows & Scenarios

### Scenario A: The Name Change
**Situation:** An employee legally changes their last name in May. They download their February payslip to apply for a bank loan.
**Resolution:** 
1. The employee navigates to their February payslip and clicks Download.
2. The PDF generated will display their **old** name.
3. This is intentional. The system "freezes" the payslip exactly as it was when the money was paid, preserving it as a legal historical snapshot.

### Scenario B: The HR Review Delay
**Situation:** The CEO asks HR to hold the January payroll release by three days pending a company announcement.
**Resolution:**
1. HR approves the run as normal so the bank file can be processed.
2. Because `payslip_auto_publish` is set to OFF, the payslips sit in a "held" state.
3. Employees and Managers checking their portals see no payslips for January.
4. Three days later, HR clicks "Publish". The payslips instantly appear for the employees, and the email queue begins sending the notification links.

### Scenario C: The Bulk ZIP Download
**Situation:** External auditors request the payslips for the entire engineering department for the month of March.
**Resolution:**
1. HR goes to the March Payroll Run.
2. They use the department filter to select "Engineering".
3. They click **"Download Bulk ZIP"**.
4. The system audits the export, compiles all the PDFs into a single ZIP file, and streams it to HR.

---

## ❓ 5. Frequently Asked Questions (FAQ)

**Q: Why didn't I get a PDF attachment in my payslip email?**
**A:** Sending sensitive salary PDFs via email is a major security risk. Instead, you receive a secure link that requires you to authenticate into the HR portal to view your document.

**Q: I found a mistake in an employee's basic salary on a published payslip. Can I use the "Reissue" button to fix it?**
**A:** No. The Reissue feature is only for fixing presentation details (like a wrong department name or spelling mistake). If the money is wrong, the payslip is financially invalid. You must cancel the payroll run, fix the salary structure, recalculate, and approve it again.

**Q: Can I generate a Bank Advice CSV for a draft run just to check the totals?**
**A:** No. Bank Advices can only be generated for runs in the `paid` status. This prevents accidental disbursement of unapproved or draft figures. To check totals, use the Payroll Register report instead.

**Q: Where can I see who downloaded the company's Payroll Register?**
**A:** HR can navigate to the **Exports Audit Log** (*Payroll > Exports*). This dashboard tracks every single CSV, PDF, and ZIP generated across the entire module, including who requested it, when, and whether it succeeded.
