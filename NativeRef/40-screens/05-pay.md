# 05 · Pay — PayHome · Salary · BankAccount · Payslips · Claims · ClaimForm · Loans · Tax · DeclarationForm

Phase 6. The biggest spec: nine screens. Web ancestors in
`roles/employee/payroll/screens/` — `MySalaryPage`, `MyPayslipsPage`,
`MyReimbursementsPage`, `MyLoansAndAdvancesPage`, `MyTaxAndInvestmentsPage`.

**Money has its own rules, and they apply to all nine:**

- Earnings and deductions are **side by side**, never one list (§3).
- **rose only for deductions**, violet for what's added, indigo for info.
- Net Pay reads **"what reaches the bank"**; Gross reads **"before deductions —
  not take-home"**; TDS YTD reads **"Income tax so far"** (§6).
- `errorCode` is the error key here, **not `code`** — payroll and documents use
  one spelling, attendance and leave the other. `lib/errors` dispatches by
  domain so a screen can't read the wrong one.
- Binary downloads **never** go through `request()` — `downloadFile()` only.

---

# PayHome

**For:** a menu, because five pay screens have no natural default.

### Data

One cheap read per card, so each summary line is real:
`getMyPayslips({ limit: 1 })` · `getMyCurrentStructure()` ·
`getMyReimbursementClaims({ limit: 1 })` · `getMyLoans({ limit: 1 })` ·
`getMyTaxSummary()`. All non-blocking; a failed one drops to the plain label.

### Layout

```
5 × Card rows, each: icon · title · one live summary line · chevron
  Payslips           September · ₹87,432 reached your bank
  My Salary          Revised 1 Apr 2026
  Claims & Benefits  1 waiting · ₹2,400
  Loans & Advances   ₹18,000 still to repay
  Tax & Investments  Income tax so far ₹41,200
```

The summary line is the whole reason this is a menu and not a tab strip. A card
whose read failed shows the title alone — **never "N/A ·"** padding.

### States

Loading (skeleton lines inside each card) · loaded · partial · offline (titles
only, one indigo line at the top).

### Field help

**No field qualifies.** Five labels and five figures that each screen explains
in full. §10: nothing where the screen already explains itself.

---

# Salary

**For:** what the person is paid and how it's made up.

### Data

`getMyCurrentStructure()` · `getMyStructureHistory()` (folded section)

### Layout

```
PageHeader-less; native header "My Salary"
SheetStats-style tiles  Gross (before deductions) · Net (what reaches the bank)
Card "Earnings"            Card "Deductions"      ← side by side at ≥ 360pt,
  Basic        ₹40,000       PF        ₹1,800        stacked below that
  HRA          ₹20,000       Income tax ₹3,200
SheetSection "How it's worked out"  folded, the formula in words
SheetSection "Past revisions"       folded, totals in the title
Row → RecordSheet per revision (the web's salary-history dialog, the §3 reference)
```

### States

Loading · loaded · **no structure assigned yet** ("Your salary details haven't
been set up yet. HR will add them." — nothing on file, not an error) ·
couldn't load (**"Couldn't load"**, distinctly) · offline.

That distinction matters more here than anywhere: "Not set" next to somebody's
salary invites a duplicate assignment (§7).

### Actions

None. It is read-only by design — a footer note says so:
> Salary is set by HR. If something looks wrong, raise it with them.

### Field help — 3 entries

```json
"payroll.my_salary": {
  "kind": "screen", "workspaces": ["employee"],
  "description": "My salary structure (MySalaryPage)",
  "fields": {
    "gross_salary": { "hint": "Your full pay before anything is taken off. This is not what reaches your bank.",
      "askMaya": { "enabled": true, "question": "What is the difference between gross salary, net pay and cost to company?" } },
    "net_salary":   { "hint": "What reaches your bank after PF, ESI, income tax and anything else due.",
      "askMaya": { "enabled": true, "question": "How is my net pay worked out from my gross salary each month?" } },
    "effective_from": { "hint": "The month this pay started applying. Anything earlier was paid on the previous structure.",
      "askMaya": { "enabled": true, "question": "What does ‘effective from’ mean on a salary revision, and will a backdated revision be paid as arrears?" } }
  }
}
```

Component names (Basic, HRA) are the org's own labels — they come from the API
and get no ⓘ each; one ⓘ on "How it's worked out" would duplicate the section,
which already explains itself.

### Traps

- **Never show a component id**, and never the structure id.
- Component order comes from the API. Don't sort alphabetically — payroll
  statements have a conventional order and re-sorting makes a payslip
  unrecognisable.
- A zero-value component is **₹0**, not hidden and not a dash.

---

# BankAccount

Modal form. `getMyBankAccount()` / `upsertMyBankAccount()`.

### Layout — gridded, 5 fields

```
FormGrid
  TextField "Account holder's name"        full width
  TextField "Account number"  TextField "Confirm account number"   side by side
  TextField "IFSC"  ⓘ         ReadOnlyField "Bank"  (resolved from IFSC)
  Select    "Account type"
footer [Cancel] [Save]
```

### Validation

Account number typed twice and compared — a mistyped account number pays a
stranger. IFSC checked for **shape** only (4 letters, 0, 6 alphanumerics); the
bank name resolution is the real check and is shown, not validated against.

```js
if (acc !== confirm) problems.confirm_account_number = 'These don’t match. Check both.';
```

### States

Loading · **nothing on file** (an empty form, with a line: "Add your account so
your salary can reach you.") · on file (the existing one, account number
**masked to the last 4**) · editing · saving · couldn't load (an error, and the
form is **not** offered — saving over a failed read could overwrite a real
account).

That last state is the §7 sentinel rule with real money behind it.

### Field help — 2 entries

`ifsc_code` ("The code that identifies your bank branch. It's on your cheque
book and your bank's app.") and `account_type`. Both have Ask Maya questions.
Account holder's name and number are ordinary.

### Traps

- **Mask the stored number**, show the last 4 only.
- A save must re-read, not assume. A pending-verification state exists on some
  orgs and the UI should reflect what came back.

---

# Payslips

`TabStrip`: **Payslips · Annual statement · Form 16**.

### Data

`getMyPayslips({ page, limit })` · `getMyPayslip(id)` ·
`getMyAnnualStatement({ year })` · `getMyForm16({ year })`
PDFs: `myPayslipPdf` · `myAnnualStatementPdf` · `myForm16Pdf` —
**through `downloadFile()`**, never `request()`.

### Layout

```
FilterTabs / year stepper per tab
FlatList of Row
  │ September 2026        ● Paid        │
  │ ₹87,432 reached your bank           │
  └ Download ───────────────────────────┘   ← a real action, stays in the row
  tap → RecordSheet: the full payslip
RecordSheet
  SheetStats  Gross · Deductions · Net
  SheetMoneySplit   Earnings | Deductions        side by side
  SheetSection "Days"      paid · unpaid days · leave taken
  SheetSection "Year to date"  folded
  footer  [Download PDF]  [Share]
```

### States

Loading · loaded · **payroll not run for this month** ("September's payroll
hasn't been run yet.") · empty (new joiner: "Your first payslip appears after
your first payroll run.") · couldn't load · download failed (a toast, the row
unchanged) · offline (list from last fetch, download fails clearly).

### Actions

**Download** → `downloadFile(myPayslipPdf(id), { filename, open: true })`.
Opens in the OS viewer. The cache is cleared on sign-out — somebody else's
salary must not be readable on a shared phone
([60-ops/01-storage-and-security.md](../60-ops/01-storage-and-security.md)).

**Share** → the OS share sheet. Worth having: most people's reason for opening
a payslip on a phone is to send it to a landlord or a bank.

### Field help — 3 entries

`net_pay` ("what reaches your bank after everything due is taken off"),
`lop_days` → labelled **"Unpaid days"** ("Days in this month you weren't paid
for, such as leave without balance."), and `ytd` → **"Income tax so far"**.
All three are domain or derived. Wire them on the `SheetSection`/`SheetTable`
**column headers**, not the cells.

### Traps

- **`downloadFile()`, never `request()`** — `request()` is JSON-only and will
  mangle a PDF into a parse error that looks like a server fault.
- Array params: `download.js` appends a one-item array once while the api
  layer's `qs()` repeats it. Route array params through `repeatSingles()` —
  don't change `download.js`.
- A presigned URL dies in ~5 minutes. **Fetch it fresh on every open**; never
  cache one from a list payload.
- "LOP"/"LWP" never reaches the screen. It is **unpaid days**.

---

# Claims

**For:** money spent for work, claimed back.
Word: **Claims & Benefits**; the action is "Make a claim".

### Data

`getMyReimbursementCategories()` · `getMyReimbursementClaims({ page, limit })` ·
`getMyReimbursementClaim(id)` · `createMyReimbursementClaim` ·
`replaceMyReimbursementClaim` · `submitMyReimbursementClaim` ·
`cancelMyReimbursementClaim` · `requestClaimReceiptUpload` ·
`getMyBenefits()`

### Layout

```
2 tiles  Waiting · Paid this year
Button primary "Make a claim"
FilterTabs  All · Draft · Waiting · Approved · Paid · Declined
FlatList of Row  →  RecordSheet (lines, receipts, the decision trail)
  row actions: Submit (draft only) · Cancel (waiting only)
SheetSection "Benefits" — if getMyBenefits returns anything
```

### The two-step write, which is the trap

A claim is **created, then submitted**. `createMyReimbursementClaim` leaves a
**draft** — it is not in anybody's queue. A screen that creates and reports
"Claim sent" leaves money sitting in a draft nobody sees. Either:

1. create → upload receipts → `submitMyReimbursementClaim`, all on Save, or
2. create as an explicit draft, with **Submit** in the row.

Do both: Save sends it, and a draft that failed at submit keeps its Submit
action. `replaceMyReimbursementClaim` is a **full replace** — send every line,
not a patch, or the lines you omit are deleted.

### States

Loading · loaded · empty · **no categories configured** (Make a claim hidden) ·
draft present · submitting · receipt upload failed (the claim survives as a
draft, and says so) · couldn't load · offline.

### Field help — 1 new entry

`payroll.reimbursement_claim` → `category_id` **already exists**. Add:

```json
"receipt_required": {
  "hint": "This category needs a receipt before it can be approved. Add it now or the claim waits.",
  "askMaya": { "enabled": true, "question": "When does a reimbursement claim need a receipt, and what happens if I don't have one?" }
}
```

---

# ClaimForm

Modal, gridded. Category ⓘ · date · amount · description · receipt picker ·
multiple lines (add/remove).

### Validation

Amount > 0 · category chosen · date not in the future · a receipt when the
category requires one (`_receipt`) · at least one line (`_lines`). Over a
category limit → our sentence, not the server's `amount_exceeds_limit`.

**Amount uses `kind="amount"`** → `decimal-pad`, not `numeric`. The numeric
keypad on iOS has no decimal point, so `12.50` cannot be typed.

---

# Loans

**For:** money advanced, and what's still owed.
Words: **monthly repayment** (not EMI), **still to repay**, **money paid out
on** (not disbursement).

### Data

`getMyLoans({ page, limit })` · `getMyLoanInstallments(loanId)`

### Layout

```
2 tiles  Still to repay · Next repayment
FlatList of Row  →  RecordSheet
  SheetStats  Borrowed · Still to repay · Monthly repayment
  SheetSection "How it's worked out"    folded
  SheetSection "Repayments"             SheetTable, folded, total in the title
```

### States

Loading · loaded · **no loans** ("You don't have any loans or advances." — a
clean empty state, not an error) · couldn't load · offline.

### Field help — 2 entries

`outstanding_amount` → **"Still to repay"** ("What's left of the loan,
including this month's repayment if it hasn't been taken yet.") and
`emi_amount` → labelled **"Monthly repayment"** ("Taken out of your pay each
month until the loan is cleared."). Both derived, both with Ask Maya.

---

# Tax

`TabStrip`: **Summary · Declarations · Form 16**.
Title: **Tax & Investments**. Never "Statutory & Tax" (that's HR's screen and
it reads "Tax & Legal Deductions").

### Data

`getMyTaxSummary()` · `getMyTaxProjection()` · `getMyMonthlyTax({ month })` ·
`getMyDeclaration()` · `upsertMyDeclaration` · `submitMyDeclaration` ·
`recordMyDeclarationProofs` · `requestDeclarationProofUpload` ·
`switchMyRegime` · `getMyForm16({ year })`

### Layout

```
Summary tab
  tiles   Income tax so far · Expected for the year · Regime
  SheetSection "Month by month"   folded, a table
  Row "Tax regime: New"  →  switch, behind a confirm
Declarations tab
  Button "Declare an investment"
  FlatList by section (80C, 80D, …) with declared vs proved amounts
  a deadline banner when the window is closing
Form 16 tab
  one row per year  →  Download
```

### The regime switch — the most dangerous action in the app

```
Switch to the old regime?
Your income tax is worked out differently from next month, and it changes
what reaches your bank. Your organisation may only allow this once a year.
[Keep the new regime] [Switch]
```

`await useConfirm()`. After success, **refetch the summary** — every number on
the screen just changed. Gate the control on the response saying it is allowed;
if the server doesn't offer it, the row is absent, not disabled (§2).

### States

Loading · loaded · **declaration window closed** (the list is read-only with
one line saying when it closed — not a disabled button with no explanation) ·
no declaration yet · proofs pending · couldn't load · offline.

### Field help — 4 entries (at the cap)

`payroll.tax_declaration` → `section` and `proof_reference` **already exist**.
Add on the summary tab:

```json
"tds_ytd":     { "hint": "Income tax taken from your pay so far this year. It changes as your pay and declarations change.",
  "askMaya": { "enabled": true, "question": "How is the income tax taken from my salary each month worked out, and why does it change?" } },
"tax_regime":  { "hint": "Which set of tax rules your pay is worked out under. Switching changes what reaches your bank.",
  "askMaya": { "enabled": true, "question": "What is the difference between the old and new tax regimes, and how do I choose?" } }
```

**No figures in a hint** — no slab, no rate, no limit. They change with the law
and the year, and a hint is not a place anybody updates (§10).

### Traps

- **`errorCode`, not `code`.**
- A declaration is **upsert then submit** — same two-step trap as claims.
- Proofs use the three-step presigned upload. Upload before recording.
- Never print the declaration id or a section id; the section *name* (80C) is
  a real label and is fine.

---

# DeclarationForm

Modal, gridded: section ⓘ · amount · proof reference ⓘ · a proof file.
Both ⓘ entries already exist in `fieldHelp.employee.json`.

Validate: section chosen, amount > 0, proof when the section requires one
(`_proof`), and the **window open** — a closed window disables the button with
a `disabledReason`, which is the §11-legal case (the person cannot fix it by
pressing).

---

## Field-help outcome for this spec

| Surface | Entries |
|---|---|
| `payroll.pay_home` | **0** — the screen explains itself |
| `payroll.my_salary` | **3 new** |
| `payroll.bank_account` | **2 new** |
| `payroll.payslip` | **3 new** |
| `payroll.reimbursement_claim` | 1 shipped + **1 new** |
| `payroll.loans` | **2 new** |
| `payroll.tax_declaration` | 2 shipped + **2 new** (summary) |

15 entries across nine screens, every one at or under 4 per screen state, every
one with an Ask Maya question, no figures that move with the law.
