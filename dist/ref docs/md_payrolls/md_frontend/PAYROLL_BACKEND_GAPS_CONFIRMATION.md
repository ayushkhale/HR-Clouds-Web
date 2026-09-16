# Payroll: Frontend Reply on Gaps G-1 … G-8

**From:** Frontend (HR panel)
**To:** Backend (Payroll module)
**Date:** 2026-09-15
**Re:** `PAYROLL_BACKEND_GAPS_RESPONSE.md`, Appendix: "What I need from you"

## Summary

- **Order:** go on Wave 1 (G-5 → G-7 → G-1) now.
- **Fast-track:** please run G-8 in parallel with Wave 1. G-2 can follow Waves 2–3.
- **Key names:** every name in your §0.2 is confirmed as final.
- **Frontend readiness:** all eight gaps are coded against your contracts, and none needs a coordinated release. Each field is read only when present; until then, today's behaviour stays.

## 1. Order

We agree with shipping by safety and effort first. Please start Wave 1 as one PR.

## 2. Fast-tracking

- **G-8, yes.** It is independent of the other gaps, and the "Unknown" name is visible to HR every day. We need one thing back: a note per environment (development, staging, production) once the backfill has run. We will delete our interim "Unknown" fallback after the last one.
- **G-2, no rush.** It can stay in Wave 5. Our screens keep loading the organisation list until it ships, so nothing breaks while we wait.

## 3. Key names: confirmed

| Gap | Key | What the frontend does with it |
|---|---|---|
| G-2 | `employee` = `{ user_id, name, employee_code, department, is_active }` | Name, code and department on rows. Preferred over our own lookup. |
| G-2 | `<actor>_user` = `{ user_id, name }` | "Proposed by" and "Approved or rejected by" on adjustments and bonus rules. |
| G-2 / G-6 | `?include=employee` (comma list) | We send `include=employee` only; we never need `snapshots` on lists. |
| G-5 | no override flag | The form already caps percentages at 100% and asks for confirmation above 50%. |
| G-3 | `failure_code` | A "What to do" line for the nine codes you listed. Unknown codes show `failure_reason` only. |
| G-4 | `error_context.inferred_last_working_day` (`null` when unknown) | Prefills the last paid day. A present `null` is final: we don't parse the sentence then. |
| G-1 | `details: [{ path, message }]` on `VALIDATION_ERROR` only | Per-field messages on the adjustment and bonus rule forms, plus every message in the banner. We branch on `errorCode`, never on the type of `details`. |
| G-7 | `capped`, `uncapped_amount` | "At limit" follows `capped`. The uncapped amount is shown in the tooltip. |

## 4. What the frontend already sends and reads

`include=employee` is already sent on these endpoints. Your note says unknown params are stripped, so this is safe before G-2 ships.
- `GET /payroll/hr/runs/:id/items` and `/items/:itemId`
- `GET /payroll/hr/runs/:id/preview`
- `GET /payroll/hr/adjustments` and `/adjustments/:id`
- `POST /payroll/hr/bonus-rules/:id/preview-impact`

When every row on the run page carries `employee`, that page stops loading the organisation list altogether. The adjustment and bonus rule pages still load it, because their employee pickers need it.

## 5. Two small asks, both optional

1. **Actor names on bonus rules.** Could `GET /payroll/hr/bonus-rules/:id` also honour `?include=employee`, so that `proposed_by_user` and `approved_by_user` appear there too? It isn't in your G-2 endpoint list. We already read those keys if they appear.
2. **Samples on `development`.** When each wave lands, please capture one sample per gap and post it against your document. We'll run our contract checks against the samples.

## 6. Calendar

Please cut dated tickets for Wave 1 and G-8 now. Waves 2–3 and G-2 can be scheduled after those land.
