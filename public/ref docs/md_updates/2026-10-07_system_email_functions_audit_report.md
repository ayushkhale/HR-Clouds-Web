# Comprehensive System Email Infrastructure & Payroll Email Audit Report

**Document Date:** October 7, 2026  
**Auditor:** Principal Backend Software Engineer  
**Status:** Complete Technical Audit & Vulnerability Assessment  
**Modules Audited:**  
- Core Email Utility & Transport (`src/common/utilities/email.utils.js`, `src/infrastructure/aws-ses/`)
- Payroll Module (`src/modules/payroll/services/payslip_dispatch.service.js`, `payroll_automation.service.js`)
- Authentication Module (`src/modules/auth/services/auth.service.js`)
- Organization Module (`src/modules/organization/services/invitation.service.js`)
- Document Module (`src/modules/document/services/document_notification.service.js`)
- Leave & Attendance Modules (`src/modules/leave/`, `src/modules/attendance/`)

---

## 1. Executive Summary & Verdict

We performed a line-by-line audit of all email-dispatching functions across the entire repository to answer: **"If an email function is invoked in production, is an email actually sent or is it dummy / mocked?"**

### The Core Verdict:
1. **Critical Flaw in Payroll Payslip Notification (`sendPayslipNotificationEmail`):**
   * **STATUS: 🔴 DUMMY / PLACEHOLDER (FAILS SILENTLY WITH FAKE SUCCESS).**
   * The function that is supposed to notify employees that their payslip is available is a **bare `console.log` stub**.
   * When the background dispatch service (`payslip_dispatch.service.js`) or manual dispatch endpoint runs, it calls this function. Because the function logs to console and returns `undefined` (a resolved promise), the dispatcher **believes the email was sent successfully**. It marks the database row as **`email_status = 'sent'`** and records `email_sent_at`.
   * **Reality:** The queue is drained, database rows say "sent", but **ZERO emails ever leave the server**!
2. **Other Payroll Reminders (`sendPayrollCutoffReminderEmail`, `sendPayrollActionReminderEmail`):**
   * **STATUS: 🟢 REAL IMPLEMENTATION.**
   * These functions read real HTML templates, substitute variables, and issue real `@aws-sdk/client-ses` `SendEmailCommand` requests.
3. **Authentication & Organization Emails (`sendOtpEmail`, `sendInvitationEmail`):**
   * **STATUS: 🟢 REAL IMPLEMENTATION.**
   * User registration OTP, password reset OTP, and employee/manager invitations actually send live emails via AWS SES.
4. **Document Notifications (`sendDocumentNotificationEmail`):**
   * **STATUS: 🟢 REAL IMPLEMENTATION.**
   * Outbox pattern with real SES transmission for document uploads, expirations, acknowledgements, and letter issuances.
5. **Leave & Attendance Modules:**
   * **STATUS: ⚪ NOT IMPLEMENTED (ZERO EMAILS).**
   * Neither the Leave module nor the Attendance module contains any email dispatch calls.

---

## 2. Master Email Functions Audit Matrix

| Module | Function Name | Location | Real or Dummy? | Actually Sends Email via SES? | Template Used |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Payroll** | `sendPayslipNotificationEmail` | `src/common/utilities/email.utils.js:143` | 🔴 **DUMMY STUB** | ❌ **NO.** Logs to console, returns resolved promise. DB falsely marks `sent`. | `payslip_available.html` exists but is **NEVER loaded**. |
| **Payroll** | `sendPayrollCutoffReminderEmail` | `src/common/utilities/email.utils.js:158` | 🟢 **REAL** | ✅ **YES.** Sends to HR on attendance cut-off day via SES. | `payroll_cutoff_reminder.html` |
| **Payroll** | `sendPayrollActionReminderEmail` | `src/common/utilities/email.utils.js:199` | 🟢 **REAL** | ✅ **YES.** Sends Pay-day, Declaration, and Proof reminders via SES. | `payroll_action_reminder.html` |
| **Auth** | `sendOtpEmail` (Registration) | `src/common/utilities/email.utils.js:51` | 🟢 **REAL** | ✅ **YES.** Sends 6-digit registration OTP via SES. | `registration.html` |
| **Auth** | `sendOtpEmail` (Forgot Password) | `src/common/utilities/email.utils.js:51` | 🟢 **REAL** | ✅ **YES.** Sends password reset OTP via SES. | `forgot_password.html` |
| **Org** | `sendInvitationEmail` | `src/common/utilities/email.utils.js:91` | 🟢 **REAL** | ✅ **YES.** Sends onboarding invitation link via SES. | `invitation.html` |
| **Document**| `sendDocumentNotificationEmail` | `src/common/utilities/email.utils.js:244` | 🟢 **REAL** | ✅ **YES.** Sends 6 notification events via SES. | `document_notification.html` |
| **Leave** | *Any leave emails* | — | ⚪ **NONE** | ❌ No email code exists in `src/modules/leave/`. | None |
| **Attendance**| *Any attendance emails* | — | ⚪ **NONE** | ❌ No email code exists in `src/modules/attendance/`. | None |

---

## 3. Deep Dive: The Critical Payroll Payslip Defect

### 3.1 The Code in `email.utils.js` (Lines 143–150)
```javascript
/**
 * Payslip availability notification (Payroll D-42).
 *
 * PLACEHOLDER — deliberately does NOT send. The deep-link delivery mechanics are being settled
 * separately, so this resolves after logging the invocation and nothing reaches SES. The dispatcher
 * that calls it (payslip_dispatch.service) treats a resolved promise as a successful send and will
 * mark rows `email_status = 'sent'`, so until the body below is implemented an org that turns on
 * `payslip_auto_email` drains its queue without any employee receiving mail.
 */
exports.sendPayslipNotificationEmail = async ({ email, employeeName, orgName, periodMonth, payslipLink }) => {
  if (!email || !orgName || !periodMonth || !payslipLink) {
    throw new Error('Missing email, orgName, periodMonth, or payslipLink')
  }

  console.log(`[EMAIL PLACEHOLDER] sendPayslipNotificationEmail invoked for ${orgName} / ${periodMonth} (not sent)`)
}
```

### 3.2 How This Causes False Accounting in Production
When a payroll run is approved or published:
1. `payslip.repository.js` creates or sets payslip rows with `email_status = 'pending'`.
2. The cron job `src/cron-jobs/payslip_email_dispatch.cron.js` (or manual trigger `POST /api/v1/payroll/hr/runs/:id/payslips/email-dispatch`) invokes `payslip_dispatch.service.js#dispatch`.
3. `payslip_dispatch.service.js` executes:
   ```javascript
   await withTimeout(emailUtils.sendPayslipNotificationEmail({ ... }), EMAIL_SEND_TIMEOUT_MS)
   await this._record(orgId, payslipId, true) // Marks email_status = 'sent'
   ```
4. Because `sendPayslipNotificationEmail` prints a `console.log` and resolves immediately:
   * The dispatcher marks the payslip as `email_status = 'sent'`.
   * The audit log records `payslip.email.sent`.
   * **No employee receives any email notification whatsoever.**
   * Because unit tests stubbed `emailUtils.sendPayslipNotificationEmail`, all unit tests passed with 100% green status, hiding this stub in plain sight!

### 3.3 The Existing Unused Template
An HTML email template already exists in [`src/common/templates/payslip_available.html`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/common/templates/payslip_available.html) (124 lines, styled HTML with logo, button, and responsive layout). It expects:
- `{{EMPLOYEE_NAME}}`
- `{{PERIOD_MONTH}}`
- `{{ORG_NAME}}`
- `{{PAYSLIP_LINK}}`
- `{{YEAR}}`

All parameters are already provided by `payslip_dispatch.service.js`, but `sendPayslipNotificationEmail` was left as a stub.

---

## 4. Deep Dive: Other Email Functions in the System

### 4.1 Payroll Automation Reminders (`payroll_automation.service.js`)
* **`sendPayrollCutoffReminderEmail`:**
  * Runs on the attendance cut-off day configured in payroll settings (e.g., 25th of month).
  * Finds all active HR users with email identifiers.
  * Injects `{{ORG_NAME}}`, `{{PERIOD_MONTH}}`, `{{CUTOFF_DAY}}` into `payroll_cutoff_reminder.html`.
  * Transmits directly via `emailProviderFactory.sendEmail` to AWS SES.
  * **Result:** **LIVE & WORKING.**
* **`sendPayrollActionReminderEmail`:**
  * Handles three automated reminders:
    1. **Pay-Day Reminder:** Alerts HR if pay day has arrived and the payroll run is not yet approved.
    2. **Declaration Window Reminder:** Alerts employees who haven't submitted their IT declaration for the financial year.
    3. **Proof-of-Investment Reminder:** Alerts employees 14 days before the proof submission deadline.
  * Injects `{{HEADLINE}}` and `{{BODY}}` into `payroll_action_reminder.html`.
  * Transmits directly via `emailProviderFactory.sendEmail` to AWS SES.
  * **Result:** **LIVE & WORKING.**

### 4.2 Authentication OTP (`auth.service.js`)
* **`sendOtpEmail`:**
  * Used for:
    - User self-registration email verification (`registerInitiate`)
    - Forgot password OTP verification (`forgotPassword`)
    - Resending verification code (`resendOtp`)
  * Reads `registration.html` or `forgot_password.html`.
  * Injects 6-digit cryptographic OTP.
  * Directly awaits `emailProviderFactory.sendEmail`.
  * If SES fails, the API throws and rolls back the registration transaction.
  * **Result:** **LIVE & WORKING.**

### 4.3 Organization Invitations (`invitation.service.js`)
* **`sendInvitationEmail`:**
  * Dispatched when HR/Admin invites a new employee, manager, or HR to join the organization.
  * Generates a signed invitation token and deep link (`https://frontend.dev.hrclouds.in/invitation/accept?token=...`).
  * Injects `{{ORG_NAME}}`, `{{ROLE_NAME}}`, `{{INVITE_LINK}}` into `invitation.html`.
  * Sends via AWS SES.
  * Uses a ledger tracking system: if SES fails, logs `[EMAIL DISPATCH] Failed...` and records `deliveryStatus = 'failed'` in `invitation_ledger`, allowing resend or manual link retrieval.
  * **Result:** **LIVE & WORKING.**

### 4.4 Document Notifications (`document_notification.service.js`)
* **`sendDocumentNotificationEmail`:**
  * Outbox queue pattern with background worker (`document_notification_dispatch.cron.js`).
  * Dispatches on:
    - `document_uploaded`
    - `document_expiring`
    - `acknowledgement_pending`
    - `document_request_raised`
    - `document_request_overdue`
    - `letter_issued`
  * Reads `document_notification.html` and sends via AWS SES.
  * **Result:** **LIVE & WORKING.**

---

## 5. Transport Layer & AWS SES Infrastructure Audit

All email sending terminates at [`src/infrastructure/aws-ses/aws-ses.provider.js`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/infrastructure/aws-ses/aws-ses.provider.js).

### 5.1 Architecture & Command Used
```javascript
const { SendEmailCommand } = require('@aws-sdk/client-ses')
const sesClient = require('./aws-ses.config')

const sendEmail = async ({ to, subject, htmlBody, textBody }) => {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL
  if (!fromEmail) throw new Error('AWS_SES_FROM_EMAIL environment variable is missing')

  const params = {
    Source: fromEmail,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' }
      }
    }
  }

  const command = new SendEmailCommand(params)
  await sesClient.send(command)
}
```

### 5.2 Critical Limitations & Operational Realities

1. **NO ATTACHMENT SUPPORT (No PDF Emails):**
   * The provider uses `SendEmailCommand`. This AWS SES API command **cannot send file attachments**.
   * Therefore, **no email in this entire system attaches payslip PDFs, offer letters, or tax Form 16 files**.
   * By architectural design (Decision D-42), all emails contain secure deep links requiring the user to authenticate before downloading sensitive salary/personal documents.
2. **Hard Dependency on `AWS_SES_FROM_EMAIL`:**
   * If `AWS_SES_FROM_EMAIL` is missing from `.env`, the provider immediately throws a fatal exception.
   * In `.env`, this is currently configured to: `no-reply@hrclouds.in`.
3. **AWS SES Sandbox Mode Trap:**
   * If the AWS account credentials (`AKIAZEVCNIYOYNBE24PW`) are in the **SES Sandbox** (the default state for all new AWS accounts):
     * Emails can **ONLY** be sent to email addresses that have been **manually verified in the AWS SES Console**.
     * Sending to an unverified customer/employee email address will fail with `MessageRejected: Email address is not verified`.
     * To send to any recipient, the AWS SES account must request **Production Access** in AWS SES.
4. **OS Platform Cron Gating in `server.js`:**
   * In `src/server.js:29`:
     ```javascript
     const cronJobsEnabled = process.env.ENABLE_CRON_JOBS !== 'false'
     if (os.platform() === 'linux' && cronJobsEnabled) {
       require('./cron-jobs/payslip_email_dispatch.cron')
       require('./cron-jobs/payroll_calendar_reminders.cron')
       require('./cron-jobs/document_notification_dispatch.cron')
     }
     ```
   * **On Windows or MacOS local development, background email crons do NOT run automatically.** They only execute in a Linux deployment or when manually triggered via HTTP endpoints.

---

## 6. How to Fix `sendPayslipNotificationEmail` (Production Ready)

To convert `sendPayslipNotificationEmail` from a dummy stub into a live, fully functional SES email, update lines 143–150 of `src/common/utilities/email.utils.js`:

```javascript
exports.sendPayslipNotificationEmail = async ({ email, employeeName, orgName, periodMonth, payslipLink }) => {
  if (!email || !orgName || !periodMonth || !payslipLink) {
    throw new Error('Missing email, orgName, periodMonth, or payslipLink')
  }

  const templateConfig = TEMPLATE_MAP.payslip_available
  const templatePath = path.join(__dirname, '..', 'templates', templateConfig.file)
  let htmlBody

  try {
    htmlBody = fs.readFileSync(templatePath, 'utf8')
  } catch (err) {
    console.error('[EMAIL TEMPLATE ERROR] Failed to read payslip template:', err.message)
    htmlBody = `
      <h2>Your payslip is ready</h2>
      <p>Hi ${employeeName || 'there'}, your ${periodMonth} payslip from ${orgName} is published.</p>
      <p><a href="${payslipLink}">View Payslip</a></p>
    `
  }

  htmlBody = htmlBody
    .replace(/{{EMPLOYEE_NAME}}/g, employeeName || 'Employee')
    .replace(/{{PERIOD_MONTH}}/g, periodMonth)
    .replace(/{{ORG_NAME}}/g, orgName)
    .replace(/{{PAYSLIP_LINK}}/g, payslipLink)
    .replace(/{{YEAR}}/g, new Date().getFullYear())

  const textBody = `Hi ${employeeName || 'there'},\n\nYour ${periodMonth} payslip from ${orgName} is available.\nView it here: ${payslipLink}\n\nSign in to view or download it. No pay details are included in this email.`

  await emailProviderFactory.sendEmail({
    to: email,
    subject: `Your ${periodMonth} payslip is ready — ${orgName}`,
    htmlBody,
    textBody
  })
}
```

---

## 7. Final Summary Checklist

| Component | Status | Finding | Action Needed |
| :--- | :--- | :--- | :--- |
| **Payslip Notification** | ❌ **BROKEN / STUB** | `sendPayslipNotificationEmail` logs to console; DB marks `sent`, but no mail is sent. | Wire up `emailProviderFactory.sendEmail` with `payslip_available.html`. |
| **Payroll Reminders** | ✅ **WORKING** | Cutoff, Payday, Declaration, and Proof reminders send real SES emails. | Verify AWS SES Production Access. |
| **Auth OTP** | ✅ **WORKING** | Registration and password reset send real SES emails. | Verified. |
| **Invitations** | ✅ **WORKING** | Employee/Manager onboarding invitations send real SES emails. | Verified. |
| **Documents** | ✅ **WORKING** | Outbox queue sends real SES notification emails. | Verified. |
| **PDF Attachments** | ℹ️ **BY DESIGN** | AWS SES uses `SendEmailCommand` (plain HTML/text only, no attachments). | Uses secure deep links instead. |
| **Leave / Attendance** | ⚠️ **NONE** | No email notifications exist for leave or attendance events. | Backlog item if emails are needed. |
