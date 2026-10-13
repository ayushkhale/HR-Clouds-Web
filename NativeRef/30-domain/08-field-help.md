# 08 · ⓘ field help and "Ask Maya"

**Ship every screen with its ⓘ help already in it — nobody has to ask.**

A screen, form, sheet, column or tile is not done until it has had a field-help
pass. Same task, same commit, same lint run. Treat it like the empty state or
the loading skeleton.

The same pass runs when you **change** what an existing field means — a reworded
label, a new status, a changed calculation — because the old hint is now wrong,
not missing.

---

## The good news: the hints are already written

`50-starter/src/fieldHelp/fieldHelp.employee.json` was **generated from the web
app's live config**, filtered to entries the `employee` workspace actually sees:

- **24 surfaces**
- **36 fields**
- **36 Ask Maya questions** — every entry has one; none are disabled

The HR onboarding tier (hundreds of beginner hints) is gated to the `hr`
workspace and is correctly **excluded**. That is why this is 36 entries and not
300.

Your job is to **wire** them, not write them. If you find a field that
qualifies and has no entry, add one — but check the list first.

```js
import { getFieldHelp } from '@/fieldHelp/fieldHelpMeta';

getFieldHelp('payroll.bank_details', 'ifsc_code', 'employee');
// → { hint: 'An 11-character code for your bank branch, such as SBIN0001234. …',
//     question: 'What is an IFSC code and where do I find mine?' }
// → null when there is no entry → the ⓘ renders NOTHING
```

That `null` is the whole design: **no entry for this surface, field or workspace
means the ⓘ is simply absent.** It is what makes it safe to wire help by data
key into a shared component.

---

## How much help a thing gets

Walk the new surface and rate each field on how far it sits from everyday
knowledge:

| The field is… | Do |
|---|---|
| **Ordinary** — name, date, title, amount, reason, search, notes | **No ⓘ. Never.** |
| **Ours** — a system-specific field, toggle or state set we invented | ⓘ saying what it changes for the person, plus an Ask Maya question |
| **Domain** — a payroll, tax, leave, attendance or compliance term | ⓘ in plain words (§6 wording), plus Ask Maya |
| **Derived** — a figure we computed (balances, pro-rata, net, accruals) | ⓘ saying what it is worked out from, plus Ask Maya |

### Never on everyday data people read daily

User decision, 2026-10-01 — these were **removed as annoying**:

- dashboard counts (present / absent / late)
- live attendance
- attendance status / hours / effective / late / overtime columns
- day inspectors
- routine queue status columns

Seen every day, understood after the first; an ⓘ there is noise. **Help belongs
on setup, payroll and rarer screens** — which is exactly the shape of the 24
surfaces below.

### The cap

- **At most 4 per screen state.**
- **Once per concept** — if "given so far" is explained on the balance heading,
  it is not explained again on each card.
- **Nothing where the screen already explains itself.** An inline range, a
  format hint or a helper line *is* an explanation.
- If the whole surface is ordinary fields, **it gets none** — and you say so in
  the hand-off rather than forcing one in.

---

## The 24 employee surfaces

| Surface id | Kind | Fields | What it covers |
|---|---|---|---|
| `attendance.anomalies` | data | `type` | My Flags › the Flag column |
| `attendance.regularization` | form | `work_mode` | Correction request form |
| `attendance.summary` | data | `punctuality_percentage` | Home › My month headline |
| `documents.company_documents` | data | `compliance_state` | Company Documents › status filter |
| `documents.my_documents` | data | `status` | Personal Documents › status filter |
| `documents.upload` | form | `document_number` · `is_confidential` | Upload / new version |
| `leaves.apply` | form | `leave_type_id` · `pending_hold` | Apply for leave + the balance strip |
| `leaves.balances` | data | `total_accrued` | One ⓘ on the Leave Balances heading |
| `leaves.request_detail` | data | `unpaid_days` | Leave detail › Unpaid headline |
| `organization.company_profile` | data | `total_active_members` | Company Profile › People |
| `organization.org_chart` | data | `depth` · `biggest_team` · `reporting_to_id` · `team_size` · `level` | Org Chart tiles + person sheet |
| `payroll.bank_details` | form | `ifsc_code` · `account_type` | Salary bank account editor |
| `payroll.encashment` | data | `divisor_days` | Leave Payout › "Month divided by" |
| `payroll.form16` | data | `form16` | Tax › Form 16 card |
| `payroll.loans` | data | `interest_method` | Loan detail › "How interest is worked out" |
| `payroll.my_salary` | data | `annual_ctc` · `take_home_monthly` | My Salary headline |
| `payroll.payslip` | data | `payable_days` | Payslip detail › figures |
| `payroll.reimbursement_claim` | form | `category_id` | Claim expense line |
| `payroll.reimbursement_limits` | data | `period_limit` | Claims › Limits |
| `payroll.statutory` | data | `pf` · `pt` | Statutory deduction lines |
| `payroll.tax_declaration` | form | `section` · `proof_reference` · `verified_amount` | Declaration rows |
| `payroll.tax_projection` | data | `standard_deduction` | Tax › Projection |
| `payroll.tax_regime` | form | `regime_code` | Old vs new regime |
| `payroll.tax_summary` | data | `remaining_tds` · `previous_employer` | Tax › Summary |

Note the distribution: **16 of 24 surfaces are pay or tax.** That is the right
shape — those are the screens where an employee genuinely doesn't know what a
number means.

And note what has **no** entries: Home's attendance counts, the attendance list,
the day log, overtime, earned leave status columns. Deliberately.

### Three examples of the voice

| Field | Hint |
|---|---|
| `payroll.bank_details.ifsc_code` | "An 11-character code for your bank branch, such as SBIN0001234. It's on your cheque book or passbook and in your bank's app." |
| `payroll.tax_declaration.verified_amount` | "The amount HR accepted after checking your proof. It can be lower than what you declared if a receipt is missing or doesn't cover it all." |
| `payroll.tax_regime.regime_code` | "The set of rules used to work out your income tax. Under the old one your declared savings count; under the new one most don't." |

Consequence, not mechanism. Second person. Under 160 characters. No figure that
changes with law, state or year.

---

## Config shape

One source: `fieldHelp/fieldHelp.employee.json` (v2 `surfaces`).

```jsonc
{
  "version": 2,
  "surfaces": {
    "payroll.bank_details": {
      "kind": "form",                       // "form" (filled in) | "data" (read)
      "description": "Salary bank account editor — My Salary › Bank details",
      "workspaces": ["employee"],
      "fields": {
        "ifsc_code": {
          "hint": "An 11-character code for your bank branch, such as SBIN0001234. …",
          "askMaya": { "enabled": true, "question": "What is an IFSC code and where do I find mine?" }
        }
      }
    }
  }
}
```

### Keys

- **Surface ids name the domain, not the role** — `attendance.anomalies`, not
  `employee.flags`. The same surface serves every workspace that renders the
  component.
- **Field keys are the API payload/response key**, never the visible label.
  Labels get reworded (wording §6) and a label key would silently orphan the
  entry.
- A **derived** figure with no API key gets a stable concept key, explained in
  the surface's `description` — e.g. `take_home_monthly`, `pending_hold`,
  `team_size`.
- **No hint text in JSX.** Ever.

### The dev validator

`fieldHelpMeta.js` ships a dev-only pass that **warns, never throws** — a typo
in help copy must not break a screen. It flags: a missing hint, a hint over 160
chars, an unknown workspace, an unknown `kind`, a missing or over-long Ask Maya
question, and a question that looks like it carries data.

Run it on app start in `__DEV__` and read the console once per session.

---

## Wiring

```jsx
// A form field — BESIDE the label, never inside it
<Field label="IFSC code" help={{ surface: 'payroll.bank_details', field: 'ifsc_code' }}>
  <TextField … />
</Field>

// A tile, heading or table header
<HelpLabel text="Income tax so far" help={{ surface: 'payroll.tax_summary', field: 'remaining_tds' }} />

// A sheet grid / stats item — the `help` key on the item
<SheetGrid items={[
  { label: 'Annual CTC', value: formatMoney(s.ctc),
    help: { surface: 'payroll.my_salary', field: 'annual_ctc' } },
]} />

// A whole section
<SheetSection title="PF, ESI and tax" help={{ surface: 'payroll.statutory', field: 'pf' }}>

// A sheet table column
{ header: 'Period limit', help: { surface: 'payroll.reimbursement_limits', field: 'period_limit' } }
```

**List-shaped data is wired by key, and the config chooses which rows get one.**
`payroll.statutory` is the model: the statutory table passes every line's `key`
to `HelpLabel`, and only `pf` and `pt` have entries, so only those two show an ⓘ.
That is why wiring is cheap — you wire the *mechanism* once, and the config
decides.

---

## Placement rules

These keep the ⓘ from distorting the screen it's added to.

| Rule | Why |
|---|---|
| **Beside a label, never inside it** | Inside, it becomes part of the input's accessible name: "IFSC code What is an IFSC code?" |
| **Never inside another pressable** — a button, a row, a `FilterTabs` tablist, a `SheetSection` fold toggle | Nested controls are invalid and a tap fires both. On web, an ⓘ in a fold toggle *collapsed the section* |
| **On the label, never on the number** | A number is scanned; a label is read |
| **In a column header, never per row** | 20 rows × one ⓘ is visual noise and 20 tap targets |
| **Group label + ⓘ** so the icon can't wrap onto its own line | A wrapped ⓘ makes the host a line taller |
| **No layout shift.** Measure at **360dp** and again at large text | An ⓘ that pushes a label onto two lines has broken the screen it was helping |
| **`overlay` where a label would wrap** | Takes the ⓘ out of layout (zero width) and draws it in padding the host already has. Not for right-aligned labels — it would hang past the edge |
| **`tone="onDark"` on purple surfaces** | The default slate icon disappears on purple-600 |
| **Headers, not cells** | |
| **Once per concept per screen** | |
| **At most 4 per screen state** | |
| **Not where the screen already explains it** | |

Native specifics:

- The popover is **portalled** above everything, so a sheet's `overflow: hidden`
  can't clip it.
- Its layer comes from the sheet that hosts it (`theme.layer`): `155` over
  anything up to `150`, and `host + 15` above a higher host. Maya goes to the
  same host layer, so she opens above that sheet too.
- **Tap only** — touch has no hover. A tap opens *and pins* it; tap outside, the
  X, or Android back closes it. (The web version also opens on hover after
  150 ms with a 200 ms grace period; that behaviour has no mobile analogue.)
- **Only one ⓘ popover is open at a time, app-wide.**
- `hitSlop` to a 44×44 target around a 16px icon.

---

## Ask Maya

```jsx
// Inside the popover, when the config supplies a question AND Maya can take it
<Pressable onPress={() => askMaya({ question, source: { surface, field }, layer })}>
  <Text>Ask Maya about this</Text>
</Pressable>
```

| Rule | Detail |
|---|---|
| **Every hint has one** | User decision, 2026-10-01. `"enabled": false` is no longer an option, and the validator warns on any entry without a question |
| **Maya never auto-sends** | The question is **pre-filled in her input**. The person presses Send |
| **Questions are static and conceptual** | Never a name, amount, balance, account number or id. Maya is an external service that cannot see anyone's records |
| **Absent, not broken** | No API key, Maya hidden in settings, or a question longer than her live `maxQueryLength` → the link is **left out**. Never a dead link |
| **Phrased for the workspace** | In this app, always to the employee about their own data |
| **`source` is telemetry only** | Never shown, never sent to Maya |
| **`layer`** | The sheet's layer, so she opens above it rather than behind |

The bridge (`maya/mayaBridge.js`, ported) exists because Maya is mounted once,
outside the navigation tree, and keeps her input state to herself. `askMaya()`
puts the question in a **pending slot** *and* fires an event — an event fired
before the lazy widget mounts is simply lost, so the slot is re-read on mount
and the first tap after a cold start still lands. Stale asks (over 30 s) are
dropped so a question can't surface minutes later.

---

## The hand-off line

**Every hand-off of new UI states the field-help outcome in one line.** A
hand-off that doesn't mention ⓘ help is unfinished.

Good:

> `payroll.my_salary` — 2 hints (`annual_ctc`, `take_home_monthly`), 2 Ask Maya
> questions. `payroll.bank_details` — 2 hints (`ifsc_code`, `account_type`).
> Account holder name, bank name, account number and branch are ordinary fields
> and got none.

Also good:

> My Overtime — **no field qualifies.** Date, hours and status are everyday
> attendance data that §10 explicitly excludes; the empty state already explains
> where overtime comes from.

---

## Per-screen ⓘ checklist

- [ ] Walked every field and rated it: ordinary / ours / domain / derived
- [ ] Every qualifying field wired, by **API key**
- [ ] Surface ids and field keys match the JSON exactly
- [ ] No ⓘ on everyday attendance data
- [ ] ≤ 4 per screen state, once per concept
- [ ] No layout shift at 360dp or at 200% text
- [ ] Not inside a label, a row, a tablist or a fold toggle
- [ ] `tone="onDark"` on the purple hero; `overlay` where a label would wrap
- [ ] 44×44 tap target
- [ ] Each hint ≤ 160 chars, consequence not mechanism, no volatile figures
- [ ] Ask Maya question present, static, conceptual, no data
- [ ] Maya doesn't auto-send, and the link is absent when she can't take it
- [ ] The dev validator is silent
- [ ] The hand-off line written
