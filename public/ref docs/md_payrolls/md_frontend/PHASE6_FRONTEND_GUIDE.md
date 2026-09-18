# Phase 6 — Payslips, Reports, Exports & Bank Advice: How to Use It

What the delivery layer looks like in the app, screen by screen, for HR, managers and employees.
Written for the people who will actually run payroll each month.

> Frontend for API #167–#194. Every screen here needs the Phase 6 backend deployed; until it is,
> these pages load but the requests fail with the usual error banner.

---

## Where everything lives

| Who | Menu path | What it does |
|---|---|---|
| HR | **Payroll → Payroll Runs → [open a run]** | Release payslips, send emails, download all payslips, generate the bank file |
| HR | **Payroll → Payslips & Documents** | One employee's payslip history, PDFs, reissues, annual statement, Form 16 |
| HR | **Insights → Payroll Reports** | The four reports, on screen or as CSV / PDF |
| HR | **Insights → Exports** | Who downloaded what, and whether it finished |
| HR | **Setup → Pay → Payroll Settings** | The two payslip-delivery switches |
| Manager | **Payroll & Comp → Team Payslips** | A report's payslip, plus its PDF |
| Manager | **Payroll & Comp → Team Reports** | The same four reports, limited to your team |
| Employee | **Payroll & Comp → My Payslips** | Payslips, PDFs, annual statement, Form 16 |

---

## 1. HR — the monthly cycle

### 1.1 Release payslips (the review gate)

Open **Payroll Runs → [the month] →** the **Payslips & delivery** panel, which appears once the run is approved.

- With **"Release payslips as soon as a run is approved"** ON (the default), payslips are already visible; the panel is there for downloads and email.
- With it **OFF**, every payslip is created and frozen but **Held back**. Nobody outside HR sees anything. Check the figures, then press **Release to employees**.
- Releasing is safe to repeat — a second press releases nothing and never moves the original release date.

**Why hold them?** It is the last moment where a wrong number costs nothing. Once released, employees see it.

### 1.2 Send the notification emails

Press **Send emails** on the same panel.

- The email contains a **link to this portal, never the PDF** — salary documents should not sit in personal inboxes.
- The strip above the table shows the queue: Not sent · Queued · Sending · Sent · Failed.
- Pressing it again retries the failures. After five tries a row stays **Failed** and needs a person — usually the employee has no email address on file.
- **A failed email never hides a payslip.** The payslip stays released.

### 1.3 Download everything

- **Download all (ZIP)** — every payslip in the run as PDFs in one archive.
- **PDF** on any row — that one payslip.
- **Bank file (CSV)** — appears **only when the run is marked paid**, and produces the NEFT upload file.

If an employee has no bank account, the run cannot be marked paid at all, and the bank file refuses to generate. Add the account, or exclude that person from the run and approve again.

### 1.4 A run approved before Phase 6 existed

Its payslips were never frozen. The panel shows nothing until you press **Rebuild**, which creates the frozen copies from the run. It is safe to press twice — it skips anyone who already has one.

### 1.5 Fixing a wrong name on a payslip

**Payroll → Payslips & Documents →** pick the employee **→** click the payslip **→ Reissue…**

- Write a reason (kept for audit). A new version is issued and the old one is marked **Replaced**.
- **A reissue cannot change money.** If any figure moved, it is refused. That means the closed run changed, which is a problem to investigate — not something to paper over. To correct pay: cancel the run, recalculate, approve again.

### 1.6 Reports

**Insights → Payroll Reports.** Pick one of four:

| Report | One row is | Use it for |
|---|---|---|
| Payroll register | one employee in one month | the full detail, with a column per salary component |
| Department distribution | one department | what each team cost |
| Deduction summary | one deduction code | PF, ESI, PT, TDS totals — including PF admin and EDLI charges |
| Component report | one employee × one component | "show me only HRA and Special Allowance" |

Then choose **one payroll run** or **a period** (at most 12 months), optionally narrow by department or location, and either **Show report** on screen or **Download CSV / PDF**.

Departments come from the payslip as it was **at approval**, so someone transferring in May never re-writes March's report.

### 1.7 Who exported what

**Insights → Exports.** Every PDF, ZIP and CSV — including ones that failed halfway — with who took it, what it covered, how many rows and its size. Only ids and codes are recorded; never names, amounts or account numbers.

### 1.8 The two settings

**Setup → Pay → Payroll Settings → Payslip Delivery**

- **Release payslips as soon as a run is approved** — ON by default (today's behaviour).
- **Email employees when their payslip is released** — OFF by default. Turning it on starts sending mail to every employee, so it is a deliberate act.

---

## 2. Managers

- **Team Payslips** — pick a report, see their finalised payslips, open one, or download the **PDF**.
- **Team Reports** — the same four reports, over a period, always limited to your own reporting line no matter what you ask for.

Two things to expect:

- You only ever see payslips HR has **released**. A held one looks exactly like one that doesn't exist — deliberately, so the error can't be used to find out that payroll is done but withheld.
- If your organisation has manager compensation visibility switched off, the per-employee reports come back as **totals only**, and the payslip PDF is refused.
- Bank details never appear in any manager report.

---

## 3. Employees

**Payroll & Comp → My Payslips**, which now has three tabs.

- **Payslips** — a card per month; **View details** for the breakdown on screen, **PDF** for the official document.
- **Annual statement** — every month of the financial year with gross, deductions and net, plus a year-to-date total, downloadable as a PDF. This is the document to give a bank or an embassy.
- **Form 16** — Part B, downloadable once HR has closed the financial year. Part A comes from the tax department separately.

Two honest notes built into the screens:

- Every payslip states whether PF/PT/TDS were actually deducted, so net pay is never misleading.
- An old payslip shows your **old** name or department. That is intentional: it is frozen as it was on the day you were paid, which is what makes it a legal record.

---

## 4. Things that will surprise you

| Situation | What happens |
|---|---|
| You changed an employee's name in May and reprint February's payslip | It prints the **February** name. Frozen on purpose. |
| Payslip shows on a manager's screen but not the employee's | It isn't released yet, or the employee's own run is held. |
| Bank file button missing | The run isn't **paid** yet. Reports are the way to check totals beforehand. |
| Report refuses to run | Over 12 months, or over 50,000 rows. Narrow the period or the filters. |
| Reissue refused | The money changed. Cancel and recalculate the run instead. |
| Email says Failed for one person | They likely have no email address. The payslip itself is fine and visible. |

---

## 5. What is not in this phase

Excel (.xlsx) export, bank-specific fixed-width NEFT layouts, scheduled/subscribed report delivery, Form 16 **Part A** generation, and GL/journal posting. Form 16 Part B also prints `TAN: —` until a TAN field exists on the organisation profile — worth adding before anyone files with it.
