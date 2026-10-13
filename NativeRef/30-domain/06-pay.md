# 06 · Pay domain

Five screens, 33 endpoints, and the module where wrong wording does the most
damage — someone will read these numbers and decide whether to query their
salary with HR.

**Every figure must match the web app character for character.**

---

## The five screens

| Screen | Endpoints | Web file |
|---|---|---|
| My Salary & Bank | `/payroll/me/salary-structure`, `…/history`, `…/bank-account` | `MySalaryPage.jsx` |
| My Payslips | `…/payslips`, `…/annual-statement`, `…/tax/form16/:fy` + 3 PDFs | `MyPayslipsPage.jsx` |
| My Claims & Benefits | `…/reimbursements/*`, `…/benefits`, `…/attachments/*` | `MyReimbursementsPage.jsx` |
| My Loans & Variable Pay | `…/loans`, `…/loans/:id/installments`, `…/bonuses`, `…/adjustments` | `MyLoansAndAdvancesPage.jsx` |
| My Tax & Investments | `…/tax/*` (10 endpoints) | `MyTaxAndInvestmentsPage.jsx` |

Plus **Leave Payouts** (`…/encashments`), which the web app surfaces inside
Payslips.

---

## 1. Wording — the load-bearing translations

| API / payroll word | On screen |
|---|---|
| Net Pay | **what reaches the bank** |
| Gross | **before deductions — not take-home** |
| TDS YTD | **Income tax so far** |
| Statutory & Tax | **Tax & Legal Deductions** |
| statutory deductions | **PF, ESI and tax** (or "deductions required by law") |
| LOP / LWP | **unpaid days** |
| EMI / instalment amount | **monthly repayment** |
| outstanding principal | **Still to repay** |
| disbursement / disbursed on | **money paid out on** |
| arrear / arrears | **backdated pay** |
| encashment | **Leave Payout** (the action is **pay out**) |
| Exits & Settlements | **Exits & Final Pay** |

"Gross" in particular: it is the number people mistake for their salary. The
label itself carries the correction — **"before deductions — not take-home"** —
rather than relying on an ⓘ nobody taps.

---

## 2. My Salary & Bank

### The structure

```js
payrollAPI.getMyCurrentStructure()   // { structure, statutory_breakdown }
payrollAPI.getMyStructureHistory()   // revisions, newest first
```

Layout:

```
SheetStats / tiles:  Annual CTC ⓘ  |  Monthly take-home ⓘ
Section "What makes up your pay"     → Earnings (component · how it's worked out · monthly · annual)
Section "What's taken off"           → Deductions
Section "PF, ESI and tax" ⓘ (folded) → StatutoryBreakdown
Section "Pay history" (folded)       → rows → a revision sheet
Section "Where your salary goes"     → bank account + Edit
```

- **Earnings before Deductions**, always. Stacked on a phone.
- `take_home_monthly` is **derived** by `statutoryTotals()` — gross minus
  statutory and salary deductions. It has an ⓘ because it's computed, and it
  must agree with the web app's figure exactly.
- A component's value renders through `formatComponentValue()`: `flat` → money,
  `balancing` → **"Auto (remainder)"**, otherwise a rate.
- Component codes **never appear raw** — `prettifyCode()`.
- **`statutory_breakdown` may be absent.** Hide the section with a quiet notice
  (`StatutoryUnavailableNotice`); never an empty card, never a crash.

### Revision history

Each revision: type (`REVISION_LABELS` → Initial / Increment / Promotion /
Correction / Restructure), effective date, reason, old → new CTC. The reference
implementation is the salary history dialog in the HR screen — match its shape.

### Bank account

```js
payrollAPI.getMyBankAccount()
payrollAPI.upsertMyBankAccount({
  account_holder_name, bank_name, account_number, ifsc_code, branch_name,
  account_type: 'savings',     // EXACTLY 'savings' | 'current', lowercase (T18)
})
```

- `account_type` defaults to **savings** — that's what salary is almost always
  paid into. `"SAVINGS"` or `"salary"` is refused.
- `ifsc_code` has an ⓘ: "An 11-character code for your bank branch, such as
  SBIN0001234. It's on your cheque book or passbook and in your bank's app."
- **"Nothing on file" vs "couldn't load"** must look different. "Not set" after
  a failed read invites someone to add a second account.
- Mask the account number in the read view (`•••• 4821`), full value only while
  editing.
- This is the one genuinely consequential write in the app — get it wrong and
  someone isn't paid. Confirm before saving, and show the saved values back.

---

## 3. My Payslips

Three tabs: **Payslips · Annual statement · Form 16**.

```js
payrollAPI.getMyPayslips()
payrollAPI.getMyPayslip(runId)
payrollFiles.myPayslipPdf(runId)               // → downloadFile()
payrollAPI.getMyAnnualStatement({ financial_year })
payrollFiles.myAnnualStatementPdf()
payrollAPI.getMyForm16(fy)
payrollFiles.myForm16Pdf(fy)
```

Accessors, because the key moves:

```js
const slipRunId = (s) => s.run_id || s.payroll_run?.id || s.runId;
const slipPeriod = (s) => s.period_month || s.payroll_run?.period_month;
```

### Rows and the sheet

```
Row:    September 2026                    ₹87,432
        30 Days paid                   ● Paid

Sheet:  SheetStats   what reaches the bank | before deductions | taken off | Payable days ⓘ
        Section "Earnings"      → SheetTable
        Section "Deductions"    → SheetTable
        Section "Days"          → paid / unpaid days (formatDayCount)
        footer: [ Download PDF ] [ Share ]
```

`payable_days` has an ⓘ (`payroll.payslip`). Day counts through
`formatDayCount()` — `30` → "30 Days", never "30.00".

### PDF download

```js
const { filename } = await downloadFile(payrollFiles.myPayslipPdf(runId), {
  filename: `payslip-${slipPeriod(slip)}.pdf`,
});
await FileViewer.open(path, { showOpenWithDialog: true });
```

Never a webview. A 403 on a **held** payslip goes through
`payslipDownloadMessage()`, which says "not released yet" rather than "not
found" — the only place that distinction surfaces, and only because the person
explicitly asked for that file (T20).

### A held payslip is invisible

By design. **Don't** invent a "held" badge or a "coming soon" row. If it isn't
in the list, it isn't there.

### Form 16 and the annual statement

Both are financial-year scoped. Use the FY selector (`currentFY()`,
`fyOptions()` ported from the web payroll meta) and **always pass the FY
explicitly** rather than relying on the server's idea of the current year.
`form16` has an ⓘ.

---

## 4. My Loans & Variable Pay

```js
payrollAPI.getMyLoans({ status })
payrollAPI.getMyLoanInstallments(id)
payrollAPI.getMyBonuses()
payrollAPI.getMyAdjustments()
```

```js
const outstanding = (l) => l.outstanding_principal ?? l.outstanding_balance ?? l.remaining_balance ?? 0;
```

### Wording, verbatim

| Figure | Label |
|---|---|
| `outstanding_principal` | **Still to repay** |
| `installment_amount` | **monthly repayment** |
| `disbursed_on` | **money paid out on** |
| `interest_method` | **How interest is worked out** ⓘ |
| adjustments of type arrear | **backdated pay** |

`interest_method` renders through `interestMethodLabel()` and carries an ⓘ
(`payroll.loans`) — "flat vs reducing balance" is a genuine domain term.

### Loan sheet

```
SheetStats:  Still to repay ⓘ | monthly repayment | Months left
Section "How interest is worked out" ⓘ
Section "Repayment schedule" (folded, total in the title) → SheetTable
Section "What you borrowed"  → amount, date money paid out on, tenure, rate
```

Status tones: `pending` fuchsia · `active` violet · `closed` slate — the same
tones as HR's loan register, so a loan reads the same to both sides.

### Variable pay

Bonuses and adjustments are read-only lists. An adjustment's `reason` matters
more than its code — lead with the reason, show the amount, and say which
payslip it landed on.

---

## 5. My Tax & Investments

The most jargon-dense screen in the app, and the one most in need of its ⓘs.

```js
payrollAPI.getMyTaxSummary({ financial_year })
payrollAPI.getMyTaxProjection({ financial_year })
payrollAPI.getMyMonthlyTax({ financial_year })
payrollAPI.getMyDeclaration({ financial_year })
payrollAPI.upsertMyDeclaration(payload, { financial_year })
payrollAPI.submitMyDeclaration({ financial_year })
payrollAPI.switchMyRegime({ regime_code }, { financial_year })
payrollAPI.recordMyDeclarationProofs(payload, { financial_year })
payrollAPI.requestDeclarationProofUpload(itemId, payload)
```

Tabs: **Summary · Projection · Declarations · Regime · Form 16**.

### Summary

| Field | Label | ⓘ |
|---|---|---|
| TDS YTD | **Income tax so far** | — |
| `remaining_tds` | **Still to be deducted this year** | ✔ |
| `previous_employer` | **Tax from a previous employer this year** | ✔ |

### Projection

`standard_deduction` has an ⓘ. Everything else is a figure with a plain label:
"Expected income this year", "Expected tax", "Already deducted".

> **No hint may contain a figure that changes with law, state or year.** The
> standard deduction amount is in the data, not in the hint.

### Declarations

A list of declared savings → a `FormSheet` per row.

| Field | ⓘ |
|---|---|
| `section` | ✔ "The part of the income-tax law this saving comes under. It decides how much of it can lower your tax." |
| `proof_reference` | ✔ "A link or receipt number that shows you paid. HR checks it before the amount counts towards your tax saving." |
| `verified_amount` | ✔ "The amount HR accepted after checking your proof. It can be lower than what you declared if a receipt is missing or doesn't cover it all." |
| amount, description | — ordinary |

Lifecycle: **draft → submit → HR verifies**. After submit, rows are read-only.
`verified_amount` can be **lower** than declared — that's the ⓘ's whole job, and
it must be visible without tapping anything when it differs.

Proof uploads use the three-step presigned flow (§7 below).

### Regime

`regime_code`: `old` → **Old regime**, `new` → **New regime**, with the ⓘ: "The
set of rules used to work out your income tax. Under the old one your declared
savings count; under the new one most don't."

Switching regimes changes someone's take-home. **Confirm it**, and say what
changes:

> **Switch to the new regime?** · Your declared savings will stop lowering your
> tax from the next payroll run.

---

## 6. My Claims & Benefits

```js
payrollAPI.getMyReimbursementCategories()      // with limits + headroom
payrollAPI.createMyReimbursementClaim(payload)
payrollAPI.getMyReimbursementClaims({ status, period, page, limit })
payrollAPI.getMyReimbursementClaim(id)
payrollAPI.replaceMyReimbursementClaim(id, payload)   // REPLACES — send it all
payrollAPI.submitMyReimbursementClaim(id)
payrollAPI.cancelMyReimbursementClaim(id, reason)
payrollAPI.requestClaimReceiptUpload(claimId, itemId, payload)
payrollAPI.getMyBenefits()
```

Tabs: **Claims · Limits · Benefits**.

### Claim lifecycle

```
draft ──submit──► pending ──approve──► approved ──run──► paid
  │                  │                     
  └──── cancel ──────┴──reject──► rejected
```

Only `draft` is editable. `claimActions(claim)` and `claimStage(claim)` from the
ported `reimbursementMeta.js` decide which buttons show — **never** branch on
the raw status in a component.

### A claim is a header plus expense lines

Each line: category ⓘ, date, amount, description, receipt. Validate against the
category's rules **before** submitting:

```js
receiptNeeded(category, amount)     // is a receipt required?
receiptRuleText(category)           // "Receipt required above ₹1,000"
claimLimitText(category)            // per-claim limit
periodLimitText(category)           // per-period limit ⓘ
limitViolations(claim, categories)  // → messages to show inline
receiptProblem(item)                // a missing or unconfirmed receipt
```

`period_limit` has an ⓘ (`payroll.reimbursement_limits`). `category_id` has one
on the form (`payroll.reimbursement_claim`).

### Receipts — the camera path

This is where the mobile app beats the web app. Camera → `image-picker` → the
three-step presigned upload → `confirmMyAttachment`.

Compress before upload (quality 0.8, max 2000px). A 12 MP photo of a taxi
receipt is 5 MB of nothing.

### Benefits

Read-only enrolments: plan name, status, the employee's and employer's
contribution. Through `normalizeMyBenefits()`, `benefitTypeLabel()`,
`enrollmentStatusMeta()`, `effectiveContribution()` — all ported.

---

## 7. Attachments — one flow, four callers

Claims receipts, tax proofs, personal documents and the avatar all use it:

```js
// 1. ask for a slot
const { attachment_id, upload_url } = await payrollAPI.requestClaimReceiptUpload(
  claimId, itemId, { file_name, content_type, file_size },
);

// 2. PUT the bytes straight to upload_url — NO Bearer token, NOT api/client.js.
//    Content-Type must EXACTLY match what you declared, or the signature fails.
await fetch(upload_url, { method: 'PUT', body: blob, headers: { 'Content-Type': content_type } });

// 3. confirm
await payrollAPI.confirmMyAttachment(attachment_id);
```

**Miss step 3 and the file is in storage but not on the record.** The record
looks like it has no receipt, and nobody can tell why.

Viewing: `getMyAttachmentViewUrl(id)` → a **short-lived** signed URL. Fetch it
at the moment of use and **never cache it** (T21).

Deleting: `deleteMyAttachment(id)` — behind a confirm.

---

## 8. Money formatting — the rule that gets broken

```js
formatMoney(57559.4)   // "₹57,559.40"
formatMoney(57559)     // "₹57,559"
formatMoney(1234567)   // "₹12,34,567"   ← Indian grouping, not "1,234,567"
```

- Whole rupees: **no decimals**. With paise: **exactly two**, so a column lines
  up.
- A deduction shows as a **positive** number inside a Deductions section. The
  section carries the sign; a column of negatives is harder to read and invites
  double-negative mistakes.
- **Decimals arrive as strings** (`"57559.40"`). Parse before arithmetic (T14).
- `null` → `₹0` only where zero is the truth. Where the figure is *unknown*,
  `displayValue()` → **N/A**.

---

## 9. Refresh

```js
emitAttendanceChanged(ATTENDANCE_EVENTS.CLAIM);             // claim write
emitAttendanceChanged(ATTENDANCE_EVENTS.LOAN);              // (HR-side, but subscribe)
emitAttendanceChanged(ATTENDANCE_EVENTS.TAX_DECLARATION);   // declaration submit
```

---

## 10. Pay checklist

- [ ] Every figure matches the web app character for character
- [ ] "what reaches the bank", never "Net Pay"
- [ ] "before deductions — not take-home", never bare "Gross"
- [ ] "Income tax so far", "unpaid days", "monthly repayment", "Still to repay",
      "money paid out on", "backdated pay", "Leave Payout"
- [ ] Earnings before Deductions, everywhere
- [ ] Component and section codes through `prettifyCode()` / `humanizeCode()`
- [ ] `formatMoney()` for every amount; `formatDayCount()` for every day figure
- [ ] Decimal strings parsed before arithmetic
- [ ] `account_type` exactly `savings` / `current`, lowercase
- [ ] Bank account: masked when read, confirmed when saved, values shown back
- [ ] "Nothing on file" distinguishable from "couldn't load"
- [ ] `statutory_breakdown` absent → section hidden with a notice
- [ ] PDFs through `files.js` → OS viewer; held payslip 403 mapped
- [ ] No "held" badge invented for a missing payslip
- [ ] FY passed explicitly on every tax and statement call
- [ ] Regime switch confirmed, with its consequence stated
- [ ] `verified_amount` difference visible without tapping
- [ ] Claims: only drafts editable, via `claimActions()`
- [ ] Receipts compressed, uploaded in three steps, **confirmed**
- [ ] No signed URL cached
- [ ] All 13 pay ⓘ surfaces wired
