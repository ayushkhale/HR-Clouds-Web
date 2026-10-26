# 02 · Glossary

Three kinds of word in this product, and mixing them up is how wrong copy ships.

- **What the API calls it** — the payload key or enum. Never on screen.
- **What we call it on screen** — the only words a person sees.
- **What it means** — so you can write a hint or an empty state without guessing.

When the two names differ, the API name is in `code`.

---

## Attendance

| On screen | API | Means |
|---|---|---|
| **Clock in / Clock out** | `clock_in`, `clock_out` | the punch. "Punch" is fine internally, never on screen |
| **Working / Not clocked in / Done** | `today.status` | the state machine. **Server-owned**, never derived locally |
| **Worked** | `worked_minutes` | time between in and out, less breaks |
| **Effective hours** | `effective_hours` | what counts towards the day, after policy rounding |
| **Late** | `late_minutes` | after the shift start, past any grace |
| **Overtime** | `overtime_minutes` | beyond the shift. Minutes are canonical |
| **Worked from** | `work_mode` | office · remote · field · hybrid. The **contract** decides unless it's hybrid |
| **Work location** | geofence / `assigned_office` | where a punch is expected to happen |
| **Flags** | `anomalies` | things the system noticed. Never "anomaly" on screen |
| **Correction** | `regularization` | "that day is recorded wrongly". **Never "regularization" on screen** |
| **Earned Leave** | `comp_off` | a day earned by working a holiday or weekly off. Never "comp-off" on screen |
| **Weekly off** | `weekly_off` | a non-working day in the shift pattern |
| **Unpaid days** | `lop_days`, `lwp` | days not paid for. **Never "LOP" or "LWP"** |
| **Shift** | `shift` | the expected working window |
| **Grace** | `grace_minutes` | lateness forgiven before it counts |

**Geofence has four outcomes, none an error.** `evaluated: false` → show
nothing. Inside → violet. Outside → fuchsia. Unknown → fuchsia. The punch
succeeded in all four.

---

## Leave

| On screen | API | Means |
|---|---|---|
| **Leave** | `leave` | time off against a balance |
| **Given so far** | `accrued_days` | **never "accrued"** |
| **Left** | `available_days` | after what's used and what's waiting |
| **All at once / Every month** | `upfront` / `monthly` | how a balance arrives |
| **Kept for next year** | `carry_forward` | never "carry forward" on screen |
| **Wait after joining** | `probation` | never "probation" on screen |
| **Extra days below zero** | `overdraft` | leave allowed past a zero balance |
| **Leave Payout** | `encashment` | the action is "pay out" — never "encash" or "cash out" |
| **Customise Leave Rules** | `override_config` | HR-side; listed so nobody reintroduces "Override Config" |
| **Half day** | `is_half_day` | half a day of balance; which half follows the shift |
| **Holiday** | `holiday` | office closed |
| **Optional holiday** | `is_optional` | a holiday the person may choose to take |

**A day is whole or half, never a decimal.** `formatDayCount()` is the only way
to print one: `0.5` → "1/2 d", `1` → "1d", `2.5` → "2d and 1/2 d". The phrase
carries its own unit, so no "days" caption beside it; a fallback is `"0d"`.

---

## Pay

| On screen | API | Means |
|---|---|---|
| **What reaches the bank** | `net_pay` | after everything due is taken off |
| **Before deductions — not take-home** | `gross_salary` | full pay before anything comes off |
| **PF, ESI and tax** | `statutory_deductions` | "deductions required by law" also fine |
| **Tax & Legal Deductions** | "Statutory & Tax" | the HR screen's title. Named here so it isn't reused for the employee one |
| **Income tax so far** | `tds_ytd` | tax taken from pay so far this year |
| **Monthly repayment** | `emi_amount` | **never "EMI"** |
| **Still to repay** | `outstanding_amount` | what's left of a loan |
| **Money paid out on** | `disbursement_date` | **never "disbursement"** |
| **Backdated pay** | `arrear` | pay for an earlier month, paid now |
| **Claims & Benefits** | `reimbursements` | money spent for work, claimed back. The action is "Make a claim" |
| **Payslip** | `payslip` | the monthly statement |
| **Tax regime** | `tax_regime` | which set of rules the tax is worked out under |
| **Exits & Final Pay** | "Exits & Settlements" | HR-side; listed so the old title doesn't come back |
| **How it's worked out** | — | the house label for any derived figure's explanation |

Earnings and deductions are **side by side**, never one list. rose is for
deductions and errors; nothing else.

---

## Documents

| On screen | API | Means |
|---|---|---|
| **My Documents** | `my_documents` | what the person gave the organisation |
| **Company Documents** | `issued_documents` | what the organisation issued **to** them |
| **Needs you** | `compliance_state: pending` | still wants an acknowledgement or a signature |
| **I acknowledge** | `acknowledge` | "I've read this", with a recorded time |
| **Sign** | `sign` | a signature — a different record from an acknowledgement |
| **Document Requests** | `document_requests` | HR has asked the person for a document |
| **Forms & Templates** | `published_templates` | blank forms to download |
| **Keep this private from my manager** | `is_confidential` | **one-way.** It can't be undone |
| **Version** | `version` | a replacement keeps the history |

---

## Org and people

| On screen | API | Means |
|---|---|---|
| **Employee code** | `employee_code` | the one identifier that may be shown |
| **Directory** | `/organizations/directory` | the employee-visible roster. `/employees` **403s** for an employee |
| **Reports to** | `manager_id` | resolved to a name, never shown as an id |
| **Loading…** | — | a name that hasn't resolved yet. Never "not found", never the id |
| **Unknown employee** | — | an id that can't be resolved |
| **N/A** | — | unknown. **Never a dash** |
| **0m** | — | an unmeasured duration |

---

## Ours — words we invented, which therefore always get an ⓘ

| Term | Means |
|---|---|
| **Workspace** | the one product surface a role gets. employee · manager · hr · guest. **One role, one workspace** |
| **Viewer** | the prop that picks endpoints on a shared component without changing the layout |
| **Plane** | the adapter that puts `null` where a role lacks a capability, so the UI hides the control |
| **Field help (ⓘ)** | the hint beside a label. Ships with the feature, never as a follow-up |
| **Ask Maya** | the question attached to every hint. **Shown, then sent — never auto-sent** |
| **Onboarding tier** | the HR-only field-help tier, exempt from the 4-per-screen cap. Not in this app |
| **Record inspector** | `DetailDialog` on the web, `RecordSheet` here. The house standard for every popup showing data |
| **The event bus** | `emitAttendanceChanged` / `INBOX_EVENT_KINDS`. App-wide despite the folder name |
| **State reconciliation** | the server saying "you're already clocked in". Not an error — refresh, show nothing |
| **The role gate** | the exact, fail-closed check that a role may render this app |

---

## Native-only

| Term | Means |
|---|---|
| **Bare / CLI** | React Native without Expo. This project |
| **Hermes** | the JS engine. On, both platforms |
| **New Architecture** | Fabric + TurboModules. On |
| **Insets** | the safe-area padding. The tab bar is `56 + insets.bottom` |
| **Presentation** | `modal` (a full-screen form) vs a pushed screen. A sheet is neither — it's local state |
| **`backBehavior: 'firstRoute'`** | step 5 of the Android back chain: a non-first tab goes to Home, not out |
| **Presigned URL** | a short-lived file link, ~5 minutes. Fetched fresh on every open, never cached |
| **`stripUnknown`** | the server silently dropping a field not in the schema. The product's main API trap |
| **`code` vs `errorCode`** | attendance and leave use `code`; payroll and documents use `errorCode` |

---

## Words that are banned on screen

regularization · anomaly · comp-off · encash / cash out · LOP · LWP · EMI ·
disbursement · arrear (alone) · accrued · carry forward · probation ·
overdraft · statutory (alone) · Override Config · any UUID · any raw enum ·
any dash where a value is unknown · any decimal day count.
