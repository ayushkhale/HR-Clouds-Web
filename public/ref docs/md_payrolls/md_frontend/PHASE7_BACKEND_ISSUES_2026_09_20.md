# Phase 7 — Backend issues found during frontend integration

**Date:** 2026-09-20
**From:** Frontend
**Tested against:** `https://development.hrclouds.in/api/v1`
**Auth used:** HR token · org `b782fd72-493e-415d-8b5b-9194b81d294e`
**Scope:** APIs #195–#218 (Phase 7) and the Phase 6 delivery layer, **read operations only** — no exits, settlements, encashments or jobs were created or triggered.

---

## Summary

| # | Issue | API | Severity |
|:-:|---|---|:-:|
| **B-1** | `listEncashmentsQuerySchema is not defined` → every call 500s | **#217** | 🔴 Blocker |
| **B-2** | Settings key names differ from the spec — 5 keys renamed, 3 undocumented | #23 / §7 | 🔴 Blocker |
| **B-3** | Settings group #56 (Automation) not implemented — 8 keys absent | #23 / §7 | 🟠 High |
| **B-4** | 2 documented F&F settings keys absent | #23 / §7 | 🟡 Medium |
| **B-5** | `loan_recovery.mode` returns `"manual"`, spec says `"manual_recovery"` | **#200** | 🟡 Medium |
| **B-6** | List endpoints return no pagination metadata | #196 #205 #207 | 🟢 Low |

Everything else tested **works correctly** — see [What is working](#what-is-working) at the end.

---

## B-1 🔴 `#217 GET /payroll/manager/encashments` — 500 on every call

**This blocks the whole Team Encashments screen.** It is the only endpoint behind that page, so managers currently see an error state and nothing else.

### Repro

```bash
curl -H "Authorization: Bearer <HR_OR_MANAGER_TOKEN>" \
  "https://development.hrclouds.in/api/v1/payroll/manager/encashments?page=1&limit=20"
```

### Actual — HTTP 500

```json
{
  "success": false,
  "message": "listEncashmentsQuerySchema is not defined",
  "errorCode": "INTERNAL_ERROR"
}
```

### Expected — HTTP 200

```json
{ "success": true, "message": "Encashments fetched", "data": [ ... ] }
```

### Likely cause

A `ReferenceError` — the validator is used but never imported (or is named differently) in the manager plane. `#207` (the HR equivalent) works fine, so the schema exists somewhere; it just is not in scope here.

**Where to look:** `payroll_manager.controller.js` → `listEncashments`, and its import of `listEncashmentsQuerySchema`. Compare with `payroll_hr.controller.js`, which works.

> Note: tested with an **HR** token. The registry lists #217 as `manager, hr`, so HR should be allowed. The error is a reference error, not an authorisation one — it will fail for managers too.

---

## B-2 🔴 Payroll settings — key names do not match the spec

`phase7_api_analysis.md` §7 (registry #55/#57) documents one set of key names. `GET /payroll/hr/settings` returns different ones.

This is a **silent data-loss bug for us**: we were sending the documented names, the server dropped them, and the settings appeared to save and then reverted on reload. We have already switched the frontend to the names below, but please confirm which set is intended.

### Renamed

| Spec (§7) | Server actually returns | Current value |
|---|---|---|
| `fnf_notice_recovery_basis` | `fnf_notice_recovery_rate_basis` | `"basic"` |
| `fnf_leave_encashment_types` | `fnf_encashment_leave_type_codes` | `[]` |
| `fnf_leave_encashment_rate_basis` | `fnf_encashment_rate_basis` | `"basic"` |
| `fnf_leave_encashment_divisor_basis` | `fnf_encashment_divisor` | `"fixed_30"` |
| `compoff_encashment_divisor_basis` | `compoff_encashment_divisor` | `"fixed_30"` |

### On the server but **not** in the spec

| Key | Value | Why it matters |
|---|---|---|
| `fnf_notice_recovery_enabled` | `false` | **Important.** This is the master switch for recovering short notice. It is not in §7 at all, so we were not rendering it — meaning HR had no way to turn notice recovery on. Now added to our form. |
| `fnf_encashment_component_id` | `null` | Presumably the component leave encashment is paid through, mirroring `fnf_notice_recovery_component_id`. Please confirm. |
| `fnf_encashment_max_days` | `null` | Cap on F&F leave encashment days. |
| `compoff_encashment_component_id` | `null` | Same, for comp-off. |

### Repro

```bash
curl -H "Authorization: Bearer <HR_TOKEN>" \
  "https://development.hrclouds.in/api/v1/payroll/hr/settings"
```

### Ask

1. Confirm the server names are correct and §7 should be updated — **or** rename the columns to match §7.
2. Document the four undocumented keys, especially `fnf_notice_recovery_enabled`.
3. Confirm whether `PUT /settings` **rejects** unknown keys or **silently ignores** them. If it ignores them, an HR user gets a success toast for a setting that was never stored. A `422` naming the unknown key would be much safer.

---

## B-3 🟠 Settings group #56 (Automation) is not implemented

§7 documents eight automation keys. **None are returned** by `GET /payroll/hr/settings`:

```
auto_draft_enabled
auto_draft_day_of_month
auto_draft_days_before_period_end
stale_run_sweep_enabled
stale_run_sweep_threshold_hours
attachment_retention_days
attachment_purge_enabled
payroll_calendar_reminders_enabled
```

### Impact

The manual job triggers **#212–#215 exist and are reachable**, but there is no way to configure whether those jobs run on a schedule, or with what thresholds.

On our side this also caused a wrong claim: reading an absent key gives `undefined`, and `undefined !== false` is `true`, so the UI was labelling all four jobs *"Runs on its own"*. We have changed that to *"Schedule unknown"* until these keys exist.

### Ask

Are these planned, or is scheduling configured elsewhere (env / cron config rather than per-org settings)? If they are not coming, say so and we will drop the wording about schedules entirely.

---

## B-4 🟡 Two documented F&F settings keys are absent

| Key | Documented in | Status |
|---|---|---|
| `fnf_settlement_window_days` | §7 #55 (default `45`) | Not returned |
| `fnf_gratuity_auto_credit_enabled` | §7 #55 (default `false`) | Not returned |

Both removed from our Settings form for now.

**Related question on gratuity:** `#200 settlement-preview` has no gratuity field in its response, and `fnf_gratuity_auto_credit_enabled` does not exist. Is gratuity in scope for Phase 7 at all, or deferred? We need to know whether to build a gratuity line into the settlement screen.

---

## B-5 🟡 `#200` — `loan_recovery.mode` value differs from the spec

### Actual

```bash
GET /payroll/hr/exits/c602481f-8269-4478-b8c9-b0c02367fecd/settlement-preview
```

```json
"loan_recovery": { "mode": "manual", "loans": [] }
```

### Spec

§7 #55 defines `fnf_loan_recovery_mode` as `'recover_via_payroll' | 'manual_recovery'`.
The settlement preview returns **`"manual"`**, and `GET /settings` also stores **`"manual"`**.

So the enum is really `"payroll" | "manual"` (please confirm the first value — we have not seen it, since this org is set to `manual`).

### Impact

We branch on this to decide whether to show *"Collected separately, outside payroll — not taken from this payment."* With the spec's spelling the note never rendered. Invisible while there are no loans; wrong as soon as an employee has one.

We now accept both spellings, but please align the enum and confirm the `payroll` value.

---

## B-6 🟢 List endpoints return no pagination metadata

**Affects:** `#196` exits · `#205` arrears · `#207` encashments

These accept `page` and `limit` (and honour them — page 2 correctly returns different rows), but `data` is a bare array with no `pagination` object.

> This matches the documented response shape, so it is **not a contract violation** — raising it only as a usability gap.

### Consequence

We cannot show a total count or a real page count. We fall back to *"there may be more"* if a full page comes back, which means the pager can show a "Next" that turns out to be empty.

### Ask (nice to have, not blocking)

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "total_pages": 3 }
}
```

Same shape the attendance history endpoints already use.

---

## What is working

Confirmed good, so you can ignore these:

| API | Result |
|---|---|
| `#196` GET exits | 200 — row renders correctly end to end |
| `#197` GET exit detail | 200 |
| `#200` GET settlement-preview | 200 — structure correct apart from B-5 |
| `#203` GET arrears/drift | 200 — empty month returns `employees: []` with correct `source`/`target` months |
| `#205` GET arrears | 200 |
| `#207` GET encashments (HR) | 200 |
| `#218` GET me/encashments | 200 |
| `#39` GET runs | 200 — `run_type` present and correct |
| Phase 6 payslips, run preview, run items, me/payslips, me/salary-structure, me/annual-statement | 200 |
| `RUN_NOT_PAID` on bank advice, `FORM16_NOT_FINALIZED` on Form 16 | Correct refusals |

**Test data note:** this org currently has 1 exit, 0 encashments, 0 arrears and no approved run, so all list screens rendered their empty state. Logic is verified; nothing has been seen with real rows in it yet. If you can seed a few records on development we will re-test the populated views.

---

## Not yet tested — write operations

Deliberately not run, to avoid creating real records and debiting leave balances on development:

```
#195 POST   /exits
#198 PATCH  /exits/:id
#199 POST   /exits/:id/cancel
#201 POST   /exits/:id/prepare-settlement
#202 POST   /exits/:id/settlement/reset
#204 POST   /arrears/reconcile
#206 POST   /employees/:userId/encashments
#209 POST   /encashments/:id/approve
#210 POST   /encashments/:id/reject
#211 POST   /encashments/:id/cancel
#212 POST   /jobs/calendar-reminders/run   ← sends real emails
#213 POST   /jobs/auto-draft/run
#214 POST   /jobs/run-sweeper/run
#215 POST   /jobs/attachment-sweeper/run   ← permanently deletes files
#216 POST   /manager/employees/:userId/encashments
```

Tell us when development is safe to write against and we will cover these too.

---

## Priority order

1. **B-1** — one-line fix, unblocks an entire screen.
2. **B-2** — confirm the key names so settings stop silently failing.
3. **B-3 / B-4** — tell us if these are planned or dropped, so we can word the UI honestly.
4. **B-5** — align the enum.
5. **B-6** — whenever convenient.
