# Payroll Frontend — Phase 3 & 4 Code Audit

**Scope:** Self-review of all code produced during the Phase 3 (salary-structure visibility) and Phase 4 (manager surface completion) fixing tasks.
**Date:** 2026-09-12
**Reviewer stance:** Senior frontend review — hunting for technical and logical defects, not restating intent.

---

## 1. Method & limitations

Asserted by this review: static line-by-line reading, `vite build` success, per-module dev-transform (200 on every touched file), and `react-icons/hi` export existence for all 17 icons used.

Not assertable without a live backend / sample responses: exact JSON shapes for `#27` team-salary aggregates, `#28/#29` report structure, `#31` proposals, `#51/#52` team-run summary/items, `#54` report payslip, and `#90` team loan. Every one of these is read **defensively** with safe fallbacks; the open questions are catalogued in §4.

**Two defects were found during this review and fixed before writing it** — see §2.

---

## 2. Defects found and fixed during review

### D1 — Re-fetch loop on the team-loan detail modal (Medium) — FIXED
`ManagerAdjustmentsPage` defined `showToast` as a plain function (new identity every render). The `LoanDetailModal` I added lists `showToast` in its fetch `useEffect` deps. On the error path this is a loop: a failed `getTeamLoan` calls `showToast` → sets toast state → parent re-renders → new `showToast` identity → effect re-runs → fetch again. Even on the success path, the 4-second toast auto-clear would trigger a redundant refetch.
**Fix:** wrapped `showToast` in `useCallback([])` so its identity is stable, matching the pattern used in the other rewritten screens.

### D2 — Member identity resolver too narrow (Low/robustness) — FIXED
`TeamSalaryPage`'s `memberUser` resolved `m.user || m.employee || {}`. If the `#27` `members[]` shape were flat (`{ id, name, current_ctc }`) rather than the documented `{ user, current_ctc }`, `.id` would be `undefined` and both **Propose** and **History** would call the API with an undefined userId.
**Fix:** fall back to the member object itself (`m.user || m.employee || m`), so both the nested and flat shapes resolve correctly.

---

## 3. Correctness — confirmed solid

- **Contract bug corrected (the point of Phase 4).** `TeamSalaryPage` previously treated the `#27` response as an array; it is `{ headcount, team_ctc_total, team_ctc_average, members? }`. Now parsed correctly, aggregates always shown.
- **Visibility toggle honoured in both states.** `compHidden = !!teamData && !members` distinguishes "comp view off" (members omitted → aggregates-only banner, no per-head figures) from "comp view on, no reports" (empty `members[]` → empty table). `TeamRunModal` independently detects money-stripped items (`every item has null net/gross`) and hides the money columns. `HistoryModal` handles `403 COMPENSATION_VIEW_DISABLED` via an `allSettled` reason-code check.
- **No UUIDs surfaced.** Proposal rows map `user_id → name` from the loaded members; both salary timelines and the loan modal render names/labels, never raw IDs. `proposalName` falls back to "Team member", never an id.
- **Preview-before-commit is correct (#15).** `EmployeeSalaryStructuresPage` previews via `previewTemplate`, shows the line split + `reconciled` badge, and invalidates the preview when the template or CTC changes. Evaluator `422`s surface through the shared error helper at preview time, before submit.
- **Conditional `revision_reason` matches the backend rule.** Required only when a current approved structure exists (version ≥ 2); optional for the initial assignment. Payload always sends a real `template_id` and never `components`, so the XOR rule can't trip.
- **Maker-checker outcome surfaced.** The assign flow reads back the returned `status` and tells HR when a revision landed `proposed` (needs a second checker) vs `approved`.
- **Effect dependency arrays are now all correct.** Every fetching effect across the five files depends only on stable values (primitives or `useCallback`-memoised functions). Audited individually — no other unstable-dependency coupling remains after D1.
- **`allSettled` failure isolation.** The HR roster CTC enrichment and the report history load both use `Promise.allSettled`, so one failing per-employee call never blanks the table or the modal.
- **Pre-existing self-service bugs fixed in passing.** `MySalaryPage` now reads `masked_account_number` (the API never returns the full number) and the `is_verified` boolean (was `verification_status === 'verified'`), and no longer tries to pre-fill the unavailable account number on edit.

**No crashes, no contract violations, and — after D1/D2 — no logical errors remain in the reviewed code.**

---

## 4. Verify against a live server (assumptions, not defects)

| # | Assumption | Where | If wrong, current behaviour | Severity |
|---|---|---|---|---|
| V1 | `#27` members are `{ user, current_ctc }` (or flat, now both handled) | `TeamSalaryPage` | Names/CTC fall back to "—"/"Not set"; id resolves via nested-or-flat | Low |
| V2 | `#53` report payslip list uses `gross_earnings` | `TeamPayslipsPage` | Hedged with `?? gross_pay`; other fields → `₹0` if absent | Low |
| V3 | `getEmployees({ purpose: "shift_assignment" })` returns the manager's **direct reports** | `TeamPayslipsPage` selector | If it returns non-reports, selecting one yields `403` on `#53/#54` (toast, no crash). Pre-existing behaviour, retained | **Medium** |
| V4 | `#54` payslip detail nests lines under `components` / `snapshot.lines` with `amount`/`calculated_amount` | `PayslipDetailModal` | Empty earnings/deductions lists render "No … lines"; summary tiles still show | Low |
| V5 | `#51` team-summary exposes `total_gross`/`total_net`/`total_lop_days`; `#52` items carry `net_pay`/`gross_earnings` when visible | `TeamRunModal` | Missing money → `₹0`; money-hidden detection may misfire only if the API returns `0` instead of `null` for a real zero | Low–Medium |
| V6 | Payslip rows carry a run id (`run_id`/`payroll_run.id`) | `TeamPayslipsPage` | "Team" action hidden when no run id resolves; "Payslip" detail guarded on `runId` truthiness | Low |
| V7 | `#90` team loan nests `installments[]` with `period_month` + `amount`/`emi_amount` | `LoanDetailModal` | "No installments scheduled yet"; summary tiles still render | Low |
| V8 | Roster CTC enrichment fan-out (N× `#18`) is acceptable for org size | `EmployeeSalaryStructuresPage` | N parallel requests on load; fine for typical orgs, heavy at hundreds of employees | Low (perf) |

V3 and V5 are the two worth confirming first; the rest fail cosmetically.

---

## 5. Minor observations (non-blocking)

- **`MySalaryPage.showToast` is a plain function.** Unlike the other screens it is not `useCallback`-wrapped, but nothing coupled to it via effect deps (the only effect is `loadData`, which is `useCallback([])` and merely closes over it). No loop is possible; left as-is to keep the diff minimal. Could be memoised for consistency.
- **Roster CTC fan-out (V8).** If the employee-list endpoint later returns current CTC inline, the per-row `getEmployeeCurrentStructure` calls can be dropped. The plan explicitly asked for the CTC column, so the fan-out is intentional for now.
- **Manager propose always requires a reason.** Harmless — the backend accepts a reason on an initial (v1) structure and requires it from v2; managers overwhelmingly propose revisions.

---

## 6. Verdict

Phase 3 and Phase 4 are **correct and free of technical or logical errors** after fixing **D1** (the re-fetch loop) and **D2** (the member resolver) during this review. All remaining open items are response-shape assumptions that require a live backend to confirm (§4), and all fail soft.

**Recommended before merge to a real environment:**
1. Confirm **V3** — that the manager's employee selector is scoped to direct reports (otherwise non-reports 403 on payslip endpoints).
2. Confirm **V5** — `#51/#52` field names and whether a real zero comes back as `0` or `null` (affects the money-hidden heuristic).
3. Capture one sample response each for `#27`, `#51`, `#52`, `#54`, `#90` to close V1/V2/V4/V6/V7.

Once §4 is confirmed, this work is ready to proceed to **Phase 5 — governance & trust** (bank verification queue `#24/#25`, audit log viewer `#26`, template-component inline edit `#13`, and detail drawers `#59/#68/#77/#90`).
