# Payroll: Requesting Backend Gaps G-1 to G-8

**From:** Frontend (HR panel)
**To:** Backend (Payroll module)
**Date:** 2026-09-14
**Follows:** `PAYROLL_BACKEND_RESPONSES.md`, Appendix B. You listed these gaps and asked us to say which we want, and in what order.

## Summary

We want all eight. All are additive, so nothing existing breaks. For each gap below:
- the order we'd like it in
- the response shape we will read (your proposal, unless noted)
- what the frontend already does

Where "Frontend ready" says **yes**, the screens already read the proposed field and fall back to today's behaviour when it's absent. Shipping it needs no frontend release.

| Order | Gap | Why it matters to HR | Frontend ready |
|---|---|---|---|
| 1 | **G-2** Names in payroll responses | Every payroll table loads the whole organisation just to show names. A missed lookup shows "Employee not found". | Partly |
| 2 | **G-8** Profile row for the HR who signed the organisation up | That person's name shows as "Unknown" in attendance. | Yes (a fallback shows their email) |
| 3 | **G-5** Cap percentage bonuses | A typo like `500` instead of `5` pays 5× salary to everyone. | Yes (UI caps at 100%) |
| 4 | **G-3** `failure_code` on a failed run | HR only gets a sentence and no fix for a failed run. | Yes |
| 5 | **G-4** Structured inferred exit date | We read the date out of an English sentence. | Yes |
| 6 | **G-1** Every invalid field in a validation error | Only the first problem is reported, so users fix one field at a time. | Yes (messages); field highlighting to follow |
| 7 | **G-7** `capped` flag on bonus awards | "At limit" is currently a guess. | Yes |
| 8 | **G-6** Lean list projections | 200-row item pages carry every snapshot. | Nothing needed |

---

## G-2: Employee and actor names in payroll responses (highest priority)

**Today:** run items, preview `error_items` / `excluded_items` / `warning_items`, adjustments, bonus awards and skips all carry only `user_id`. Actor fields (`proposed_by`, `approved_by`, `excluded_by`, …) are also bare UUIDs. To show names, each screen pages through `GET /organizations/employees?purpose=emp_report&include_inactive=true` (100 per page). That is five requests for 500 people, and it pulls PII the screen doesn't need.

**Please add** an opt-in `?include=employee` on these endpoints:
- `GET /payroll/hr/runs/:id/items`
- `GET /payroll/hr/runs/:id/items/:itemId`
- `GET /payroll/hr/runs/:id/preview`
- `GET /payroll/hr/adjustments` and `/:id`
- `POST /payroll/hr/bonus-rules/:id/preview-impact`

Row shape we will read:

```json
"employee": { "name": "Aarav Mehta", "employee_code": "EMP-0042", "department": "Engineering", "is_active": true }
```

- For actors, a sibling object per actor field would be ideal, e.g. `"approved_by_user": { "name": "Kavya Iyer" }`. Please confirm the key names you choose.
- Leavers must still resolve. That means applying no active-only filter, so `is_active` can be `false`.

**Frontend ready:** partly.
- **Already works:** our name, code and department helpers read a nested `employee` object when it is present.
- **Remaining:** once you confirm the keys and endpoints, we will send `include=employee` and stop loading the organisation list on those screens. Today that parameter would just be stripped, so it is safe for you to ship first.

## G-8: The HR who signed the organisation up shows as "Unknown"

**Today:** organisation sign-up creates the HR role profile but no `user_profiles` row. So `GET /attendance/hr/hrs/attendance` composes `name: "Unknown"`.

**Please:**
- create the `user_profiles` row at organisation creation
- backfill it for existing organisations

**Frontend ready:** yes, as an interim. When a row's `name` is exactly `"Unknown"`, the HR attendance tab looks the person up in the organisation list, which falls back to their email. Remove the literal `"Unknown"` fallback once the backfill is done, or tell us what it becomes.

## G-5: Bound bonus percentages

**Please** reject `value > 100` for `percent_of_gross` / `percent_of_basic` on `POST` and `PUT /bonus-rules` (400 `VALIDATION_ERROR`). If some organisations genuinely need more, add an explicit override flag; please tell us its name.

**Frontend ready:** yes. The form refuses anything above 100% and asks for confirmation above 50%. This protects only our UI, not direct API calls.

## G-3: `failure_code` on the run header

**Please add** `failure_code` (string or `null`) next to `failure_reason` on every run header response. It should be the `errorCode` that failed the run, e.g. `TAX_TABLES_MISSING`, `CALCULATION_FAILED`, `ITEM_PERSIST_FAILED`.

**Frontend ready:** yes. When `failure_code` is present and known, the failed-run banner adds a "What to do" line. `failure_reason` is still always shown.

## G-4: Structured inferred last working day

**Please add** this on `EXIT_DATE_REQUIRED` items (list, detail and eligibility `exit_date_required[]`):

```json
"error_context": { "inferred_last_working_day": "2026-08-14" }
```

Use `null` when it can't be inferred, instead of the word `unknown`.

**Frontend ready:** yes.
- **When present:** the "Set last working day" picker uses `error_context.inferred_last_working_day`.
- **Fallback:** it parses the sentence, as today.

## G-1: All validation problems, with field paths

**Please add** `details` on `VALIDATION_ERROR`, keeping `message` unchanged:

```json
{
  "success": false,
  "message": "\"cancellation_reason\" is required",
  "errorCode": "VALIDATION_ERROR",
  "details": [
    { "path": "cancellation_reason", "message": "\"cancellation_reason\" is required" },
    { "path": "amount", "message": "\"amount\" must be a positive number" }
  ]
}
```

- `path` should be dot-joined for nested keys, e.g. `eligibility_config.min_tenure_months`.
- Please also confirm that the CSV codes keep their current `details.errors` shape, so the two don't clash.

**Frontend ready:** yes, for messages. When `details` is an array, every message is shown, not just the first. Field highlighting will use `path` once this ships.

## G-7: `capped` and `uncapped_amount` on bonus awards

**Please add** to each `awards[]` row of `preview-impact`:

```json
{ "user_id": "…", "amount": "25000.00", "capped": true, "uncapped_amount": "34986.00", "basis": "structure_basic", "basis_amount": "420000.00" }
```

**Frontend ready:** yes.
- **When present:** "At limit" uses `capped`.
- **Fallback:** without it, we still compare `amount` with the rule's cap, which is wrong when the uncapped amount lands exactly on the cap.

## G-6: Lean list projections

**Please** leave out `settings_snapshot` from `GET /runs` rows, and `structure_snapshot` / `attendance_snapshot` / `statutory_snapshot` from `GET /runs/:id/items` rows. Return them only with `?include=snapshots`. The detail endpoints stay unchanged.

**Frontend ready:** nothing needed. Lists never read the snapshots; the payslip view reads them from `GET /runs/:id/items/:itemId`.

---

## Please reply with

1. The order you'll ship these in, and a rough date for G-2 and G-8.
2. The final key names for G-2 (`employee`, actor objects) and the G-5 override flag, if any.
3. One sample response for each gap once it's on `development`.
