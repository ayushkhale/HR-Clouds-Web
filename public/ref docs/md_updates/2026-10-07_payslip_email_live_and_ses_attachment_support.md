# Change Record: Payslip Notification Email Goes Live + SES Attachment Support

**Document Date:** October 7, 2026
**Status:** Implemented & Tested (2955 unit tests green)
**Target Modules:**
- Core Email Transport (`src/infrastructure/aws-ses/aws-ses.provider.js`)
- Core Email Utility (`src/common/utilities/email.utils.js`)
**Audience:** Backend Team, DevOps/Operations

---

## 1. Summary

Two changes, both backend-only. **No HTTP API request/response shape, field, parameter, or
validation changed** — the payslip dispatch endpoints (`POST /api/v1/payroll/hr/runs/:id/payslips/email-dispatch`,
`GET .../email-status`) return exactly the same payloads as before. This record exists because the
*observable behaviour* of the system changed (emails that were silently dropped now actually send)
and because a new transport capability was added that other backend flows may consume.

### 1.1 Payslip notification email was a stub — now it sends for real

`emailUtils.sendPayslipNotificationEmail` was a bare `console.log` placeholder that resolved without
sending. The payslip dispatcher (`payslip_dispatch.service`) treats a resolved promise as a
successful send, so it was marking rows `email_status = 'sent'` and recording `payslip.email.sent`
audit entries **while zero mail left the server**. Every unit test passed because the dispatcher
tests stub this function wholesale.

It now reads `payslip_available.html`, substitutes the placeholders
(`EMPLOYEE_NAME`, `PERIOD_MONTH`, `ORG_NAME`, `PAYSLIP_LINK`, `YEAR`), and sends through
`emailProviderFactory.sendEmail`, exactly like `sendInvitationEmail`. The argument contract is
unchanged, so the dispatcher needed no change.

**Decision D-42 is preserved:** the notification is a deep link ONLY — no PDF, no figures, not even
net pay. This is deliberate and load-bearing: the dispatcher's at-least-once delivery is safe
*because* a duplicate notification is a duplicate link, not a second copy of someone's salary in a
mailbox. The payslip PDF is **not** attached here.

### 1.2 SES transport can now carry attachments (opt-in, additive)

`aws-ses.provider.js#sendEmail` gained an optional `attachments` parameter:

```js
sendEmail({ to, subject, htmlBody, textBody, attachments })
// attachments: [{ filename, contentType, content: Buffer | string }]
```

- **Without `attachments` (or an empty array):** the existing SES v1 `SendEmailCommand` path, byte
  for byte unchanged. All six live flows (OTP, invitation, two payroll reminders, document
  notification, payslip) are unaffected.
- **With `attachments`:** the provider composes a raw MIME message
  (`multipart/mixed` → `multipart/alternative` text+html, then one base64 part per file) and sends
  via `SendRawEmailCommand`, because the simple API cannot carry files.

Nothing in the codebase passes `attachments` today — this is the enabling capability only. No
existing flow was wired to send a PDF. The audit noted a "might need attachments" requirement; the
transport is now ready for it without forcing a PDF onto the payslip notification (which would
violate D-42).

---

## 2. Edge Cases Handled in the Raw-MIME Path

| Concern | Handling |
| :--- | :--- |
| Message size | Decoded attachment bytes capped at **7 MB** (SES hard limit is 10 MB post-encoding; base64 inflates ~37%). Oversized sends throw before touching SES. |
| Non-ASCII subject | RFC 2047 `B`-encoded; ASCII subjects emitted verbatim. |
| Header injection (CR/LF) | Every constructed header is hardened: `From`/`To` have CR/LF folded to a space; the subject is CR/LF-stripped **before** the ASCII test (so an ASCII `\r\nBcc:` can't slip through un-encoded); filenames are reduced to a safe ASCII set; `contentType` is validated to `type/subtype` or collapsed to `application/octet-stream`. A caller forwarding an uploaded file's self-declared name/MIME cannot smuggle a header. |
| Boundary collision / long lines | Every body + attachment part is base64, so the random hex boundary cannot appear in content and no line exceeds the SMTP 998-octet limit; base64 wrapped at 76 columns (RFC 2045). |
| Line endings | CRLF throughout. |
| Missing `contentType` | Defaults to `application/octet-stream`. |

---

## 3. Operational Notes (unchanged by this work, but relevant to go-live)

1. **SES Sandbox:** if the AWS account is still in the SES sandbox, mail only reaches
   **verified** addresses; unverified recipients fail with `MessageRejected`. Request SES
   **Production Access** before relying on payslip notifications in production.
2. **`AWS_SES_FROM_EMAIL`** must be set or every send throws (currently `no-reply@hrclouds.in`).
3. **Cron gating:** the payslip dispatch cron only runs on **Linux** (`src/server.js`). On Windows/
   macOS dev the queue drains only via the manual HTTP endpoint.

---

## 4. Tests

- `tests/unit/system/email_utils.test.js` — payslip notification reads the template, substitutes
  every placeholder, sends with no attachment (D-42), text body leaks no figures, validates inputs.
- `tests/unit/system/aws_ses_provider.test.js` — simple path uses `SendEmailCommand`; attachment
  path uses `SendRawEmailCommand` with correct envelope/MIME; size cap, filename sanitisation,
  subject encoding, and 76-column wrapping.
- Existing `tests/unit/payroll/payslip_dispatch.test.js` and all other suites remain green
  (2955 passed, 0 failed).
