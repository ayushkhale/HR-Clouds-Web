# Payroll Frontend — Phase 5 & 6 Code Audit

**Scope:** Self-review of all code produced during the Phase 5 (governance & trust) and Phase 6 (reimbursements/benefits/reports & delivery) tasks.
**Date:** 2026-09-12
**Reviewer stance:** Senior frontend review — hunting for technical and logical defects, not restating intent.
**Passes:** Two. Pass 1 caught **D1** (audit-log page-size coupling). Pass 2 — a deeper re-read against the plan requested afterward — caught **D2** (bank-verification error state). Both were fixed before this write-up; the file reflects the final state.

---

## 1. Method & limitations

Asserted by this review: static line-by-line reading (two passes), `vite build` success (repeated after every fix — final: 1162 modules, clean), and `react-icons/hi` export existence for all 30 icons used across the touched files.

Not assertable without a live backend / sample responses: the exact JSON shapes for `#24` bank account, `#26` audit-log records and their pagination envelope, `#59` adjustment, `#68` bonus rule, and `#77` loan. Every one is read **defensively** with safe fallbacks; the open questions are catalogued in §5.

**Two defects were found across the two review passes and fixed before writing this** — see §2.

---

## 2. Defects found and fixed during review

### D1 — Audit-log page: response-driven page size fed back into the fetch dependency (Medium) — FIXED
`PayrollAuditLogPage` stored `limit` inside `pageInfo`, **sent** it in the request (`limit: pageInfo.limit`), **overwrote** it from the response (`setPageInfo({ ..., limit })`), and listed `pageInfo.limit` in `loadLogs`'s `useCallback` deps. If the server ever echoed a limit different from the one requested, `pageInfo.limit` would change → `loadLogs` identity would change → the fetch effect would re-fire. It would settle after one extra round-trip (not an infinite loop, since the echo stabilises), but it is a fragile response→request coupling and a wasted request.
**Fix:** the request page size is now a module constant `PAGE_SIZE = 20` (the user never changes it), and `pageInfo` holds only response-derived `{ total, pages }`. `loadLogs` no longer depends on any value it writes. Loop risk eliminated.

### D2 — Bank verification: a failed `#24` fetch was reported as "No account on file" (Medium) — FIXED
`BankVerificationPage` fans out one `#24` per employee with `Promise.allSettled` and, in the reducer, mapped **both** a fulfilled-`null` and a **rejected** fetch to `null` — which `accountState()` then collapsed into `"No account on file"`. On a verification queue that is a genuine logical error: a transient 5xx (or any network blip) would tell HR the employee has no bank account, sending them to chase someone who is actually payable, or to wrongly treat them as un-payable. A latent second bug rode along — `STATE` had no `loading`/`error` entry, so any non-{verified,unverified,none} state would have dereferenced `STATE[state].pill` on `undefined` and crashed the row.
**Fix:** rejected fetches now store a distinct `LOAD_ERROR` sentinel (a `Symbol`); `accountState()` returns `"error"` for it, `"loading"` for not-yet-loaded, and `"none"` **only** for a fulfilled explicit null. `STATE` gained `error` ("Couldn't load") and `loading` entries (closing the crash path). Errored/loading rows are excluded from the verified/unverified/none tallies (`if (st in c)`), and the detail-drawer button now opens only for a real account object (`hasAccount()`), never for the error sentinel.

---

## 3. Phase 5 — Governance & trust: correctness confirmed

- **Bank verification is honest about every distinct state.** After D2, `accountState()` separates verified / awaiting / no-account-on-file / **couldn't-load** / loading — so neither a transient fetch error nor an employee who hasn't added details is ever mislabelled as the other, and none is mistaken for "unverified". The verify action and detail drawer appear only for a real account object.
- **No list endpoint invented.** `#24` has no bulk variant, so the queue fans out one `#24` per employee via `Promise.allSettled` (the same failure-isolated pattern as the roster CTC enrichment) — one failed fetch never blanks the table.
- **Verify is treated as idempotent (matches the contract).** On success the row is updated from `res.data`, falling back to flipping `is_verified` locally, so the UI is correct whether the server returns the account or an empty body.
- **Audit log filters are committed, not live.** A draft→committed filter split means typing in the Action box doesn't refetch on every keystroke — the query fires only on Apply, resetting to page 1. Server-side pagination with prev/next; `canNext` degrades gracefully when the server omits `total`/`pages` (falls back to "a full page came back").
- **Audit rows never surface raw UUIDs as identity.** Actor and target resolve through the employee directory; entity type maps through a label table. The raw `entity_id` appears only inside the expanded technical panel, correctly labelled.
- **Template component inline edit obeys the contract (#13).** The body always carries `calculation_type`; `value` is included for every calc type **except** `balancing` (where a value is meaningless), satisfying the "min 1 field" rule and never sending a stray value for a balancing line. Editing is single-row (`editingCompId`), and both the template and the roster are re-fetched on save.
- **Detail drawers fetch on click, never in an effect.** Adjustment (`#59`), bonus rule (`#68`), and loan (`#77`) all fetch from the click handler and store the result — so the Phase-3/4 D1 refetch-loop class of bug **cannot** recur here regardless of `showToast` identity. Each drawer shows the list row immediately, then fills in the fuller server object, with a "loading full detail" hint for the audit-trail section.
- **Loan detail merges `#77`+`#78` without letting either failure hide the other.** `openSchedule` uses `allSettled`; it only aborts when *both* the metadata and the schedule fail, otherwise it shows whatever came back.
- **`useEffect` dependency arrays audited.** After D1, every fetching effect depends only on stable primitives or `useCallback`-memoised functions; `showToast` is `useCallback([])` in both new pages.

---

## 4. Phase 6 — Reimbursements, Benefits, Reports & Delivery: handled as BLOCKED

Phase 6 has **no backend contract**. Verified this review, three independent ways:
1. `public/ref docs/md_payrolls/phases/` contains only `phase1`–`phase4` docs — no phase 5/6 spec.
2. `combined_api_analysis-2.md` (the 127-endpoint contract) contains **no** reimbursement, benefit, report, NEFT, or payslip-PDF **endpoint** — "reimbursement" appears only as a `salary_components.component_type` enum value.
3. The speculative endpoints remain commented out under the dated `⚠️ UNVERIFIED` block in `payroll.api.js` — **left untouched** by this phase (confirmed still 3 stubs present).

Proceeding "as per the plan" (which marks Phase 6 blocked pending contract B1/B2) therefore meant **wiring zero APIs and fabricating zero data**. The four surfaces stay on the honest `FeatureNotAvailable` placeholder rather than pretending to be empty working features. The only change was to **upgrade those placeholders into truthful capability previews**:

- `FeatureNotAvailable` gained an optional `capabilities` list and `note`; the existing signature is backward-compatible.
- The four pages (HR `BenefitsAndReimbursementsPage` + `PayrollReportsPage`, manager `TeamReimbursementsPage`, employee `MyReimbursementsPage`) now describe exactly what each feature *will* do — drawn verbatim from the plan's Phase 5/6 scope (multi-level claim approval, auto-payout into the next run, benefit enrollments; payslip PDFs, register/distribution/deduction reports, CSV/NEFT exports with an export audit).
- Every card carries an explicit "Coming soon" badge and a note that nothing shown is live data — so no capability preview can be mistaken for a working feature or a verified empty result.

**No `window.claude`, no fake tables, no speculative fetches.** This is the maximum honest work available for Phase 6 until the backend ships.

---

## 5. Verify against a live server (assumptions, not defects)

| # | Assumption | Where | If wrong, current behaviour | Severity |
|---|---|---|---|---|
| V1 | `#24` returns `{ masked_account_number, is_verified, bank_name, ifsc_code, ... }`; a **200 with `null` body** when none on file (a genuinely-missing account is not a 404) | `BankVerificationPage` | Missing field → "—". A fulfilled null → "No account on file"; a rejection (incl. a 404-for-none, if the API chose that) → "Couldn't load". If the API returns 404 to mean "no account", those rows read "Couldn't load" instead of "No account" — confirm the not-found convention | **Medium** |
| V2 | `#25` returns the (now-verified) account, or an empty success body | `BankVerificationPage.handleVerify` | Falls back to flipping `is_verified` locally — row still shows Verified | Low |
| V3 | `#26` returns `{ records\|logs, total\|pagination.total, pages\|pagination.pages }` and rows carry `created_at`, `action`, `entity_type`, `actor_*`, `target_user_id`, and a `changes\|metadata\|details\|diff` blob | `PayrollAuditLogPage` | Missing pagination → prev/next degrade to "full-page" heuristic; missing detail blob → "No additional detail recorded"; unknown field names → that column shows "—" | **Medium** |
| V4 | Audit filter query keys are `entity_type`, `action`, `target_user_id`, `from`, `to` (per the contract) | `PayrollAuditLogPage` | If a key differs, that filter silently no-ops server-side; UI still works | Low |
| V5 | `#59` adjustment carries `created_by/approved_by(_name)`, `rejection_reason`, `batch_id`, `bonus_rule_id`, `applied_run_id` | Adjustment drawer | Absent fields are simply omitted from the metadata list | Low |
| V6 | `#68` bonus rule nests eligibility under `eligibility_config.{department_ids,user_ids,min_tenure_months}` | Bonus drawer | Empty config → "—"; ids that don't resolve fall back to the raw id | Low |
| V7 | `#77` loan exposes `recovered_amount`/`total_recovered` and one of `outstanding_principal`/`outstanding_balance`/`remaining_balance` | Loan drawer summary | Missing → `₹0`; the schedule (from `#78`) still renders independently | Low |
| V8 | Bank-account fan-out (N× `#24`) is acceptable for org size | `BankVerificationPage` | N parallel requests on load; fine for typical orgs, heavy at hundreds of employees | Low (perf) |

V3 is the one worth confirming first; the rest fail cosmetically.

---

## 6. Minor observations (non-blocking)

- **Bank verification summary tiles briefly read "No account: N" during enrichment.** Before the `#24` fan-out resolves, `acctByUser` is empty so every employee counts as "none" for a moment; the per-row status shows "checking…" correctly in the meantime, and the tiles self-correct when enrichment lands. Could be masked with a tile-level loading state; left as-is (transient, and the row-level state is already honest).
- **Template inline edit keeps the last numeric value when toggling to `balancing` and back.** Harmless — the value is simply re-shown; on save under `balancing` it is never sent.
- **`AccountDrawer`'s "no account" branch is effectively unreachable** (the view button only renders when an account exists) but is kept as a defensive fallback.

---

## 7. Verdict

Phase 5 is **correct and free of technical or logical errors** after fixing **D1** (audit-log page-size coupling) and **D2** (bank-verification error state, plus its latent `STATE[state]` crash path). Phase 6 is **correctly handled as blocked** — no invented endpoints, no fabricated data, honest capability previews only. All remaining open items are response-shape assumptions that require a live backend to confirm (§5), and all fail soft.

Also verified this pass: the plan's Phase 5 target APIs are each reachable from the UI — `#24/#25` (Bank Verification), `#26` (Audit Log), `#13` (template inline edit), `#59/#68/#77` (HR detail drawers), `#90` (manager loan drawer, shipped in Phase 4). Forward `const`-function references at click time (e.g. `handleOpenComponentModal → cancelEditComponent`) are safe — every `const` in the component body is defined before any handler fires.

**Recommended before merge to a real environment:**
1. Confirm **V3** — the `#26` audit-log record shape, field names, and pagination envelope (drives the table columns and prev/next).
2. Confirm **V1** — the `#24` "no account" convention (200-with-null vs 404); the D2 fix assumes the former per the contract.
3. Capture one sample response each for `#59`, `#68`, `#77` to close V5/V6/V7.
4. Keep Phase 6 blocked until the reimbursements/benefits and reports/delivery contracts (B1/B2) are published; then the commented-out `payroll.api.js` stubs are the starting point.
