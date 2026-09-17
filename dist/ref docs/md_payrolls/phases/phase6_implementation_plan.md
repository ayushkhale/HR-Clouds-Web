# Payroll Module — Phase 6 Implementation Plan
### Payslips, PDF Rendering, Reports, Exports & Bank Advice

> **Status:** Source of truth for Phase 6 development.
> **Parent:** `public/md_payrolls/implementation_plan.md` §8 (Phase 6), §9 (EC-24, EC-26), §10 (settings), §11 (dependencies).
> **Predecessors:** `phase1_implementation_plan.md` … `phase5_implementation_plan.md`.
> **Conflict rule (unchanged since Phase 2):** where this document and the parent disagree, the parent wins *unless* this document records an explicit ruling in §11 with the technical reason. All such rulings are listed there; none are silent.

**Counters at Phase 6 start (verified against the tree, not the docs):**

| Counter | Value | Verified from |
|---|---|---|
| Next endpoint number | **#167** | `payroll_{hr,manager,self}.routes.js` end at #166; `md_system/api_registry.md` and `md_payrolls/combined_api_analysis.md` current through #166 |
| Next decision ID | **D-38** | Phase 5 closed at D-37 |
| Next migration | **`00047`** | last on disk is `00046-drop-dead-shift-template-columns.js` |
| Next org-settings registry entry | **#54** | registry current through #50 — **#51–#53 are Phase 5 documentation debt, see Step 0** |
| Test baseline | **513 passing / 0 failing** | `npm test`, run at plan time |
| `engine_version` | **stays 5** | Phase 6 adds no arithmetic to the engine |

---

## 1. Goal & Boundary

### 1.1 What Phase 6 is

Phase 6 is the **delivery layer**. Phases 1–5 built an engine that computes and persists every number a payslip needs. Phase 6 does not compute a single new rupee. It:

1. **Freezes** what the engine produced — plus the *non-payroll identity context* the engine never captured — into a `payslips` row at run approval.
2. **Renders** that frozen snapshot as PDF, CSV and ZIP, on demand, deterministically, storing no blob (D-6).
3. **Aggregates** persisted run data into four report families, scoped by the Phase-1 authority machinery.
4. **Audits** every byte that leaves the system in `payroll_report_exports`.
5. **Emits** the bank advice / NEFT file for a paid run — the only place a decrypted account number is ever materialised.
6. **Closes EC-26** — a run with missing bank details may calculate, but may not be marked `paid`.

**The safety property of this phase:** *engine output is byte-identical before and after Phase 6.* No service beneath `payroll_run.service.calculate()`, no `statutory_*`, no `salary_*`, no `reimbursement_*`/`benefit_*` computation changes. If a Phase 6 change would alter a figure the engine already persists, it is out of scope by construction. This is why the D-37 tax items are reassigned in §11.

### 1.2 What Phase 6 is **not** — deferred to Phase 7 or later

| Deferred | Why |
|---|---|
| **D-37 tax gaps** — taxing an employer benefit contribution as a perquisite; auto-crediting a benefit premium toward §80D | Phase-4 engine surgery (`statutory_calculation.service.js:163` builds `taxable_earnings` from `realEarningLines` only, so an `employer_contribution` line cannot reach it by flag). Incompatible with §1.1's safety property. **Ruling D-38 in §11.** |
| `.xlsx` export | Parent §11: deferred; would need a second dependency. CSV only. |
| Bank-specific NEFT layouts (HDFC / ICICI / Axis fixed-width) | Parent says "bank advice / NEFT export file" with no bank named. One canonical CSV layout ships; per-bank templates are a Phase-7 configuration concern. |
| Payroll journal / GL posting; cost-centre codes beyond `department_id` / `location_id` | Not in the parent's Phase 6 list. |
| Form 16 **Part A** (TRACES-issued) | Only Part B is derivable from our data. Parent D-29 scope is Part B. |
| Scheduled report delivery / report subscriptions | Not requested. |
| Arrears settlement of a corrected closed run | D-12; Phase 7. |
| Retention / purge of old payslip snapshots | No requirement stated; snapshots are append-only in Phase 6. |

### 1.3 Scope reconstruction — what the parent assigned Phase 6 vs. what actually remains

The parent's §8 list was written before Phases 2–5 existed. Several of its line items were delivered early. **This table, not parent §8, drives the build.**

| # | Parent §8 line item | Actual state in the tree today | Phase 6 action |
|---|---|---|---|
| 1 | `payslips` table — "frozen JSONB snapshot written at run approval" | **Partially pre-empted.** Phase 2 already freezes *all money* on `payroll_run_items` + `payroll_run_item_components` (`structure_snapshot`, `attendance_snapshot`, `statutory_snapshot`, `calculation_warnings`). No `payslips` model exists. | **NEW, but narrower than it reads.** The table's job is *not* to re-freeze money — it freezes the **identity + employer context** the engine never captured (name, code, designation, `department_id`, `location_id`, PAN, UAN, bank last-4, employer name/address/PAN) and adds **versioning, publication state and email state**. See **D-39**. |
| 2 | Payslip **PDF** for an employee | Does not exist. No PDF code anywhere in `src/`. | **NEW** — the whole renderer stack. |
| 3 | Payslip **history** for an employee | **DONE (#55)** — `payslip_read.listForUser()`. | **Not re-planned.** Source switches to snapshot-first with live fallback; PDF sibling added. |
| 4 | Payslip JSON detail, self and manager | **DONE (#53–#56)** — `getForUser`, `teamSummary`, `teamItems`, EC-24 already enforced. | **Not re-planned.** Source switch only; response shape unchanged. |
| 5 | **Annual salary statement** with cumulative breakdown | Does not exist. `#116 /me/tax/monthly` is a *tax* view; `getForm16` is Part-B only. | **NEW** (JSON + PDF; self / manager-scoped / HR). |
| 6 | Admin **bulk payslip download (streamed ZIP)** | Does not exist. No ZIP code; `archiver` not installed. | **NEW** — hand-written streaming ZIP (**D-41**). |
| 7 | **Email dispatch** via `@aws-sdk/client-ses` / `email.utils.js` | Infrastructure exists but **cannot attach files** — `aws-ses.provider.js` uses `SendEmailCommand` only. | **NEW, redefined:** notification-with-deep-link, not PDF attachment (**D-42**). Queued and idempotent (**D-43**). |
| 8 | Report: **payroll register** | Does not exist. | **NEW.** |
| 9 | Report: **cost-centre / department distribution** | **Partially pre-empted.** `payroll_run.service.preview()` returns a live `department_breakdown` via `_loadDepartmentMap()` — which reads **live `employee_profiles`**, so it is a pre-approval estimate, not a historical report. | **NEW report**, sourced from the frozen snapshot (**D-46**). `preview()`'s breakdown is left exactly as-is; it is a pre-approval tool and must stay live. |
| 10 | Report: **deduction summary** | **Partially pre-empted.** `#118 getOrgStatutorySummary` gives FY month-by-month org statutory *challan* totals. | **NEW but repositioned:** per-run / per-period, **per component code**, across *all* deduction and employer-contribution lines — summing `payroll_run_item_components`, not item columns, so `PF_ADMIN_CHARGES` and `EDLI` are included (Phase 4 §338). #118 is untouched and remains the FY challan view. |
| 11 | Report: **filterable custom reports** (date range, department, employee, component) | Does not exist. | **NEW.** |
| 12 | Reports HR org-wide; manager auto-scoped via `getAccessibleUserIds` | **Machinery DONE** (Phase 1 `getAccessibleUserIds`, `decideAuthority`, `TENANT_GLOBAL_ROLES`, EC-24 / EC-25). | **Consume it.** No new authority code; the report service calls the same chokepoint. |
| 13 | **Exports** CSV (hand-written) + PDF | Does not exist. | **NEW.** |
| 14 | `payroll_report_exports` — who exported what, when | Does not exist. | **NEW.** |
| 15 | **Bank advice / NEFT file** for a `paid` run | `employee_bank_accounts.scopes.withSecret` and `bank_encryption.decrypt()` exist, explicitly commented *"used by Phase 6's bank-advice generation"* — **wired, never called**. | **NEW consumer** of existing primitives. No crypto is written. |
| 16 | §9 **EC-26** — missing bank details block `paid` | `_missingBankCount()` exists (`payroll_run.service.js:228`) and surfaces in `preview()` as an **advisory only**. `pay()` performs **no** bank check. | **NEW enforcement** in `pay()`. Deliberate behaviour change — §13.4. |
| 17 | §10 org setting "Payslip auto-publish and auto-email on run approval" | Does not exist. | **NEW** — registry **#54**, two boolean columns. |
| 18 | §11 item 2 — confirm `pdfkit` before Phase 6 | `pdfkit` **not installed**; `archiver` / `exceljs` / `jszip` also absent. | **Step 0 gate.** Exactly one dependency, `pdfkit`, per D-11. Nothing else. |
| 19 | D-29 — Form 16 PDF | `#114/#126` return the Part-B **dataset**; `employer.tan` is hard-`null` because `organization_profiles` has no TAN column. | **NEW renderer** over the existing dataset. TAN gap handled by **D-47**. |
| — | *(not in parent §8)* | `payroll_settings.model.js` is missing three columns that exist in migration `00044` and in `payroll_hr.validator.js` | **Step 0 carry-over defect fix.** Not Phase 6 feature scope — §2 fact 23, §12 Step 0. |

**Net:** two new tables, one new dependency, one new cron, 28 new endpoints (#167–#194), four report families, four PDF renderers, one behaviour change to `pay()`, and one two-line change outside the payroll module.

---

## 2. Pre-Flight Checks

Twenty-eight facts established by reading the tree at plan time. Each is load-bearing for a decision below. **Re-verify 1–4 and 7 immediately before Step 1; the rest are structural.**

1. **Endpoint numbering ends at #166.** `payroll_self.routes.js` ends with `#166 GET /me/benefits`. `md_system/api_registry.md` and `md_payrolls/combined_api_analysis.md` are both current through #166. Phase 6 numbers **#167–#194**.
2. **Decisions run D-1…D-37.** Phase 6 opens at **D-38**.
3. **Latest migration is `00046`.** Payroll migration numbers are *not* contiguous with payroll phases (payroll owns `00040`–`00045`; `00046` is an attendance cleanup). Phase 6 is **`00047`**.
4. **`npm test` → 513 passing, 0 failing** (`node --test "tests/unit/**/*.test.js"`, 6.3 s). Phase 6 must not reduce this number.
5. **No `payslips` model and no `payroll_report_exports` model exist.** `src/modules/payroll/models/` holds 32 models; neither name is among them.
6. **There is no PDF, CSV, ZIP or streaming code anywhere in `src/`.** A repo-wide grep for `setHeader` / `Content-Disposition` / `.pipe(res` returns exactly **two** hits, both *comments* in `payroll/utils/attachment_storage.utils.js` describing the S3 pre-signed GET. **Phase 6 writes the project's first non-JSON HTTP response.** Everything about binary responses — headers, disposition, mid-stream error handling — is new ground, specified in **D-40 / D-41**.
7. **Dependencies:** `pdfkit`, `archiver`, `exceljs`, `jszip` are **all absent**. Present and relevant: `@aws-sdk/client-ses`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, **`node-cron`**, `dayjs`, `joi`, `sequelize`, `pg`.
8. **`node-cron` is already a dependency with an established pattern.** `src/cron-jobs/` holds five crons (`auto_clock_out`, `auto_mark_absent`, `comp_off_expiry_sync`, `leave_monthly_accrual`, `leave_year_end_rollover`), each a bare `cron.schedule(expr, fn, { timezone: 'Asia/Kolkata' })` module `require`d from `src/server.js:25-29`. **Phase 6 may ship a cron with zero new dependencies.** (Crons run in-process and would double-fire on a multi-instance deploy; the existing five share that property. Phase 6's dispatcher is safe regardless, because of its atomic claim — **D-43**.)
9. **`errorHandlerMiddleware` has no `res.headersSent` guard.** `src/common/middlewares/error.middleware.js` unconditionally calls `res.status(statusCode).json(response)`. A failure after the first streamed byte would throw `ERR_HTTP_HEADERS_SENT` *inside the error handler*, losing the original error and leaving the socket half-open. **This is the only file outside `modules/payroll/` that Phase 6 modifies** (**D-41**).
10. **SES cannot attach.** `src/infrastructure/aws-ses/aws-ses.provider.js` exposes `sendEmail({ to, subject, htmlBody, textBody })` built on `SendEmailCommand`. Attachments would require `SendRawEmailCommand` + hand-built MIME. → **D-42.**
11. **`email.utils.js` pattern:** exports `sendOtpEmail` and `sendInvitationEmail`; `TEMPLATE_MAP` contains only `registration` and `forgot_password`; templates are HTML files in `src/common/templates/`. Phase 6 adds one function + one template, following this shape exactly.
12. **`payslip_read.service.js` projects live from run items.** `VISIBLE_RUN_STATUSES = ['approved','paid']`; methods `listForUser`, `getForUser`, `teamSummary`, `teamItems`. Its own file header states: *"Phase 6 adds the `payslips` table and PDF renderer over the SAME data, so the paths are named `/payslips` now and only the source changes later."* Phase 6 honours that contract literally — **the response shape does not change.**
13. **`payroll_run.service.pay()` performs no bank-account check.** `approve()` at 1626–1721, `cancel()` at 1730–1777, `pay()` at 1781–1842. All three are extended by Phase 6; none is restructured.
14. **`_missingBankCount()` exists** at `payroll_run.service.js:228-234` and is surfaced by `preview()` (1003–1099) as `missing_bank_account_count` — an advisory number enforcing nothing.
15. **`preview()` already returns `department_breakdown`**, built from `_loadDepartmentMap()` (line 208) which reads **live `employee_profiles`**. Re-running it after a transfer re-buckets history. → **D-46** (reports read the frozen snapshot; `preview()` is untouched).
16. **`payroll_run_item_components.source` already contains `arrear`**; `component_type` contains `earning | deduction | employer_contribution | reimbursement`. Phase 6 adds **no values** to either enum.
17. **`pf_admin_charges` and `edli_charges` are not item columns.** Phase 4 §338 records that they live in `statutory_snapshot` and as component lines. The deduction and cost reports therefore aggregate **`payroll_run_item_components`**, never item columns, or employer charges silently vanish.
18. **`component_id` is retained on component rows** specifically for Phase-6 report joins (Phase 4). Reports group by `component_code` (stable across structure edits) and carry `component_id` for drill-through.
19. **`is_part_of_ctc` is persisted** on component rows specifically for Phase-6 cost reports (Phase 4). `ctc_cost` legitimately exceeds `annual_ctc / 12`; Phase 4 explicitly says **do not "correct" it** — the register prints it as stored.
20. **Bank secrecy primitives are in place and unused.** `employee_bank_accounts.defaultScope` excludes `account_number_encrypted`; `scopes.withSecret` re-includes it. `bank_encryption.utils.js` exports `assertKeyConfigured / encrypt / decrypt / last4 / mask`; `payroll.index.js` calls `assertKeyConfigured()` at module load, so a misconfigured `PAYROLL_ENCRYPTION_KEY` (64 hex chars) fails the process at boot, not at export time.
21. **`payroll_access.utils.js`:** `TENANT_GLOBAL_ROLES = ['hr']` (D-14 — `admin` / `super-admin` are platform roles and receive no tenant payroll data); `decideAuthority()` returns `canViewBankAccount: false` for scope `report`. **Managers never see bank data, including in reports and bank advice.**
22. **`attachment_storage.utils.js` already provides `sanitizeFileName()` and `buildContentDisposition()`** (pure, unit-tested). Phase 6 **reuses** them for download filenames rather than writing a second implementation.
23. **Carry-over defect (HIGH) — three Phase-5 settings columns are undeclared on the model.** `reimbursement_approval_levels`, `reimbursement_payout_lookahead_months` and `benefit_deductions_enabled` exist in migration `00044` (lines 427–443, with a CHECK constraint) and in `payroll_hr.validator.js` (lines 195–198), but `payroll_settings.model.js` declares none of them. Because `payroll_settings.repository.js` uses plain `findOne / findOrCreate / update`, they are **unreadable and unwritable through Sequelize**. Traced impact: `benefit_deductions_enabled` reads `undefined`, so `=== true` is false at `payroll_run.service.js:349` and `:570` → **benefit deduction lines are never emitted; the Phase-5 benefits feature is inert**. `reimbursement_approval_levels` is silently pinned at 2 (`|| 2`, `reimbursement_claim.service.js:311`); `reimbursement_payout_lookahead_months` silently pinned at 2 (`reimbursement_approval.service.js:438-439`). `PUT /hr/settings` accepts all three and silently no-ops. **Fixed in Step 0** — the DB columns and CHECK already exist, so this is a model-only change.
24. **Model/DB drift on `engine_version`.** Migration `00044` set the `payroll_runs.engine_version` DB default to **5**; `payroll_runs.model.js:41-45` still declares `defaultValue: 4`. Harmless today because `create()` writes 5 explicitly, but a row created any other way would be mislabelled. **Fixed in Step 0** (model-only, no migration).
25. **`src/app.js`:** `express.json({ limit: '10mb' })`, `trust proxy` on, CORS allow-list with `credentials: true`, `allowedHeaders: ['Content-Type','Authorization']` and **no `exposedHeaders`**. A browser therefore cannot read `Content-Disposition` off a Phase-6 download response. → **D-40** adds `exposedHeaders: ['Content-Disposition']`.
26. **`#118 getOrgStatutorySummary` already exists** (`employee_tax.service.js:1138+`) and returns FY month-by-month org totals for `pf_employee, pf_employer, eps, esi_employee, esi_employer, professional_tax, tds`. Phase 6's deduction report must **not** duplicate it (§1.3 row 10).
27. **`getForm16` returns `employer: { name, pan, tan: null }`** — `organization_profiles` has no TAN column (it has `org_name, address_line_1/2, city, state, country, zip_code, logo_url, gst_number, company_pan_number`). `employee_profiles` has `employee_code, department, department_id, designation, joining_date, location_id, pan_number, uan_number, state` and **no `exit_date`**. → **D-47**.
28. **`payroll_audit_logs` is append-only** with `proposed_by` / `approved_by` columns, and audit writes happen **inside** the state-changing transaction. Phase 6 keeps both properties.

---

## 3. Directory Structure

### 3.1 New files

```
src/modules/payroll/
├── models/
│   ├── payslips.model.js                         NEW
│   └── payroll_report_exports.model.js           NEW
├── repositories/
│   ├── payslip.repository.js                     NEW
│   ├── payroll_report_export.repository.js       NEW
│   └── payroll_report.repository.js              NEW  (read-only cross-model query spine — see §3.3)
├── services/
│   ├── payslip.service.js                        NEW  (compose · publish · reissue · revoke · backfill · bulk)
│   ├── payslip_dispatch.service.js               NEW  (email queue drain, atomic claim)
│   ├── payroll_report.service.js                 NEW  (4 report families + scope resolution + export audit)
│   ├── annual_statement.service.js               NEW  (FY salary statement dataset)
│   └── bank_advice.service.js                    NEW  (EC-26 + decrypt-and-stream)
├── utils/
│   ├── csv_writer.utils.js                       NEW  PURE  (RFC 4180 + formula-injection guard)
│   ├── zip_writer.utils.js                       NEW  PURE  (streaming STORE-only ZIP)
│   ├── payslip_snapshot.utils.js                 NEW  PURE  (compose + canonicalise + hash)
│   ├── report_shaper.utils.js                    NEW  PURE  (grouping / rollup in paise)
│   ├── bank_advice.utils.js                      NEW  PURE  (advice row builder; takes plaintext as an arg)
│   ├── download_headers.utils.js                 NEW  PURE  (Content-Type / Disposition / nosniff triples)
│   └── pdf/
│       ├── pdf_layout.utils.js                   NEW  (shared pdfkit primitives: header, table, kv-grid, footer)
│       ├── payslip_pdf.utils.js                  NEW  (snapshot → Buffer)
│       ├── annual_statement_pdf.utils.js         NEW
│       └── form16_pdf.utils.js                   NEW  (Part B, over the existing #114 dataset)
src/cron-jobs/
└── payslip_email_dispatch.cron.js                NEW  (registered in src/server.js, pattern of fact 8)
src/common/templates/
└── payslip_available.html                        NEW
src/infrastructure/postgres-sql/migrations/
└── 00047-create-payroll-payslips-and-report-exports.js   NEW
```

### 3.2 Extended files

| File | Change | Why |
|---|---|---|
| `models/payroll_settings.model.js` | **Step 0:** declare the 3 missing Phase-5 columns. **Phase 6:** add `payslip_auto_publish`, `payslip_auto_email` | fact 23; registry #54 |
| `models/payroll_runs.model.js` | **Step 0:** `engine_version` default 4 → 5 | fact 24 |
| `services/payroll_run.service.js` | `approve()` composes + persists payslips in-transaction; `cancel()` revokes them in-transaction; `pay()` enforces EC-26 | §1.3 rows 1, 16 |
| `services/payslip_read.service.js` | snapshot-first read with live-projection fallback; adds `snapshot_source` | §1.3 rows 3–4, **D-45** |
| `services/employee_tax.service.js` | no logic change; expose the existing Part-B dataset to the Form 16 renderer | §1.3 row 19 |
| `repositories/payroll_run_item.repository.js` | add `findApprovedItemsForSnapshot(runId, userIds, {transaction})` (cohort-batched, `withComponents`) | snapshot composition |
| `controllers/payroll_hr.controller.js` | +19 handlers | §6.1 |
| `controllers/payroll_manager.controller.js` | +5 handlers | §6.2 |
| `controllers/payroll_self.controller.js` | +4 handlers | §6.3 |
| `routes/payroll_{hr,manager,self}.routes.js` | +28 routes | §6 |
| `validators/payroll_{hr,manager,self}.validator.js` | param + query schemas; 2 settings keys | §6.5 |
| `common/utilities/email.utils.js` | `sendPayslipNotificationEmail()`; `TEMPLATE_MAP.payslip_available` | **D-42** |
| **`common/middlewares/error.middleware.js`** | **`res.headersSent` guard** — the only file outside `modules/payroll/` | fact 9, **D-41** |
| `src/app.js` | CORS `exposedHeaders: ['Content-Disposition']` | fact 25, **D-40** |
| `src/server.js` | register the dispatch cron | fact 8 |
| `package.json` | `+ pdfkit` (exactly one) | D-11, §1.3 row 18 |

### 3.3 Layer responsibilities

| Layer | Owns | Must not |
|---|---|---|
| **Route** | path, auth stack, `validate()` for `params` / `body` | contain logic; declare a bare `:param` under a shared static prefix |
| **Controller** | `req.query` validation via `validateOrThrow` (Express 5 getter-only), envelope vs. stream selection, header emission, `try/catch → next(error)` **before first byte** and `res.destroy()` **after** | build SQL; decide authority; compose snapshots |
| **Service** | authority resolution (`decideAuthority` + `getAccessibleUserIds`), transaction boundaries, advisory locks, audit writes, export-audit rows, orchestration of pure utils | emit HTTP headers; know about `res` |
| **Repository** | query construction only, `transaction` passthrough, cohort batching | contain business rules |
| **Pure util** | deterministic transforms — snapshot composition, CSV/ZIP bytes, PDF bytes, grouping maths | import `db`; call `Date.now()`; touch `fs` / `res` |

`payroll_report.repository.js` is a **cross-model read-only repository** — it has no model of its own and queries `PayrollRunItem` ⋈ `PayrollRunItemComponent` ⋈ `PayrollRun` with aggregates. This departs from the one-repo-per-model convention used since Phase 1. **Ruling:** justified and bounded — it remains query-construction-only, holds no business rules, and the alternative (four report queries scattered across four model repositories) would fragment a single index-sensitive query spine. It is the only such repository; do not generalise the pattern.

---

## 4. Database Schema — migration `00047`

`00047-create-payroll-payslips-and-report-exports.js`. Single managed transaction, `up` and `down` both reversible. **The user runs migrations; this plan hands the file back and verifies statically plus by unit test.**

Order inside `up`: enums → `payslips` → `payslips` indexes → `payroll_report_exports` → its indexes → `payroll_settings` columns. `down` is the exact inverse.

### 4.1 `payslips`

The publication and identity-freeze record. **Money is not duplicated here for storage's sake** — it is copied into `snapshot` so the rendered document is reproducible, but `payroll_run_items` remains the arithmetic source of truth and the reconciliation target (§8.4).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `defaultValue: UUIDV4` |
| `org_id` | UUID NOT NULL | FK `organizations` ON DELETE CASCADE |
| `run_id` | UUID NOT NULL | FK `payroll_runs` ON DELETE CASCADE |
| `run_item_id` | UUID NOT NULL | FK `payroll_run_items` ON DELETE CASCADE — a payslip without its item is meaningless. (Item pruning only happens during `calculate()`, which requires `draft`/`calculated`/`failed`, so it can never orphan a payslip of an approved run.) |
| `user_id` | UUID NOT NULL | FK `users` ON DELETE CASCADE |
| `period_month` | STRING(7) NOT NULL | denormalised from the run for history queries without a join |
| `version` | INTEGER NOT NULL DEFAULT 1 | CHECK `version >= 1` |
| `status` | ENUM `active` \| `superseded` \| `revoked` | NOT NULL DEFAULT `active` |
| `visible_to_employee` | BOOLEAN NOT NULL DEFAULT true | the auto-publish switch (**D-44**) |
| `snapshot` | JSONB NOT NULL | the render-ready document (§5.1) |
| `snapshot_hash` | STRING(64) NOT NULL | SHA-256 of the canonical serialisation (§5.2) |
| `engine_version` | INTEGER NOT NULL | copied from the run; lets a future renderer branch on layout era |
| `published_at` | TIMESTAMPTZ NULL | set when `visible_to_employee` first becomes true; also the PDF's pinned creation date (**D-40**) |
| `published_by` | UUID NULL | FK `users` ON DELETE SET NULL |
| `superseded_at` | TIMESTAMPTZ NULL | |
| `superseded_by_payslip_id` | UUID NULL | FK `payslips` ON DELETE SET NULL (self-reference) |
| `reissue_reason` | TEXT NULL | mandatory on the *new* version when `version > 1` |
| `revoked_at` | TIMESTAMPTZ NULL | |
| `revoked_by` | UUID NULL | FK `users` ON DELETE SET NULL |
| `revocation_reason` | TEXT NULL | |
| `email_status` | ENUM `not_requested` \| `pending` \| `sending` \| `sent` \| `failed` | NOT NULL DEFAULT `not_requested` |
| `email_attempts` | SMALLINT NOT NULL DEFAULT 0 | bounded at `PAYSLIP_EMAIL_MAX_ATTEMPTS = 5` |
| `email_claimed_at` | TIMESTAMPTZ NULL | staleness reclaim (**D-43**) |
| `email_sent_at` | TIMESTAMPTZ NULL | |
| `email_last_error` | TEXT NULL | truncated to 500 chars; never contains recipient PII beyond the address already in the row's user |
| `created_at` / `updated_at` | TIMESTAMPTZ | `paranoid: false` — payslips are never soft-deleted; revocation is a status |

**Indexes**

| Name | Definition | Purpose |
|---|---|---|
| `payslips_run_user_active_uniq` | **UNIQUE** `(run_id, user_id)` **WHERE `status = 'active'`** | exactly one live payslip per employee per run — the backstop against a double-approve or a concurrent reissue |
| `payslips_org_user_period_idx` | `(org_id, user_id, period_month)` | employee history (#55), annual statement |
| `payslips_org_run_idx` | `(org_id, run_id)` | run payslip index (#167), bulk ZIP (#174) |
| `payslips_dispatch_idx` | `(org_id, email_status, email_claimed_at)` **WHERE `email_status IN ('pending','sending','failed')`** | the dispatcher's claim scan stays off the hot table |

`snapshot` is **not** indexed. No report reads it with a JSONB operator; reports use the relational spine (§5.5).

### 4.2 `payroll_report_exports`

An **audit record of data leaving the system**, not a job table (**D-48**).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL | FK `organizations` CASCADE |
| `report_type` | ENUM | `payroll_register`, `department_distribution`, `deduction_summary`, `component_report`, `bank_advice`, `payslip_bulk`, `payslip_single`, `annual_statement`, `form16` |
| `format` | ENUM `json` \| `csv` \| `pdf` \| `zip` | |
| `scope` | ENUM `org` \| `team` \| `self` | which authority plane produced it |
| `filters` | JSONB NOT NULL | the **normalised, post-validation** filter set: ids, codes, period bounds. **Never row data.** |
| `run_id` | UUID NULL | FK `payroll_runs` ON DELETE SET NULL |
| `period_from` / `period_to` | STRING(7) NULL | |
| `subject_user_id` | UUID NULL | FK `users` SET NULL — set for single-employee exports (payslip PDF, annual statement, Form 16) |
| `requested_by` | UUID NOT NULL | FK `users` ON DELETE RESTRICT — an export's actor must never become unattributable |
| `requested_role` | STRING(20) NOT NULL | role at request time |
| `row_count` | INTEGER NULL | filled on completion |
| `byte_count` | BIGINT NULL | filled on completion |
| `status` | ENUM `started` \| `completed` \| `failed` | NOT NULL DEFAULT `started` |
| `failure_reason` | TEXT NULL | truncated to 500 chars |
| `started_at` | TIMESTAMPTZ NOT NULL | |
| `completed_at` | TIMESTAMPTZ NULL | |
| `ip_address` | STRING(45) NULL | `req.ip` (`trust proxy` is on) |
| `created_at` / `updated_at` | | `paranoid: false`, append-only in spirit; only `status`/`row_count`/`byte_count`/`completed_at`/`failure_reason` are ever updated |

**Indexes:** `(org_id, created_at DESC)`, `(org_id, report_type, created_at DESC)`, `(org_id, requested_by, created_at DESC)`.

`requested_by` is **RESTRICT**, unlike most FKs in this module. An export row that loses its actor is an audit hole; deleting a user who has exported salary data must fail loudly rather than silently anonymise the record.

### 4.3 `payroll_settings` additions (registry #54)

| Column | Type | Default | Meaning |
|---|---|---|---|
| `payslip_auto_publish` | BOOLEAN NOT NULL | **`true`** | on run approval, payslips are immediately visible to employees. `true` preserves today's behaviour exactly (#55/#56 show every approved run the moment it is approved). `false` holds them for an explicit HR release (#171). |
| `payslip_auto_email` | BOOLEAN NOT NULL | **`false`** | on run approval, enqueue a notification email per payslip. Default `false` because enabling outbound mail to every employee must be a deliberate act, and because SES sending limits are per-tenant operational concerns. |

**Step 0 also declares** (no migration — the columns already exist in `00044`): `reimbursement_approval_levels` (INTEGER, default 2), `reimbursement_payout_lookahead_months` (INTEGER, default 2), `benefit_deductions_enabled` (BOOLEAN, default — **read the actual default from `00044` and mirror it exactly; do not guess**).

### 4.4 What the migration does **not** do

- No backfill of `payslips` for already-approved runs. The snapshot composition is code, and the migration runs before the code deploy. Historical runs are covered by the read fallback (**D-45**) and the explicit backfill endpoint (#172).
- No change to any Phase 1–5 table other than the two `payroll_settings` booleans.
- No new values on `payroll_run_item_components.source` or `.component_type` (fact 16).
- No index on `payslips.snapshot`.

---

## 5. Core Logic

### 5.1 The payslip snapshot (D-39)

**The problem Phase 6 actually solves.** The engine froze money; it never froze *who the money was for*. Employee name, `employee_code`, designation, `department_id`, `location_id`, PAN, UAN, bank last-4 and the employer's name/address/PAN all live in mutable, unversioned tables (`user_profiles`, `employee_profiles`, `organization_profiles`). A payslip rendered from live joins silently changes after a transfer, a rename or an address correction — which breaks the parent's own exit criterion that *a regenerated PDF is byte-comparable in content to the original*.

`snapshot` shape (canonical key order fixed by `payslip_snapshot.utils.js`):

```
{
  schema_version: 1,
  payslip: { version, period_month, run_id, run_item_id, engine_version, generated_for: <user_id> },
  employer: { org_id, name, address_lines[], city, state, country, zip_code, pan, logo_url },
  employee: { user_id, full_name, employee_code, designation, department_id, department_name,
              location_id, location_name, joining_date, pan_number, uan_number,
              bank: { bank_name, last4, ifsc } | null },
  period:   { month, days_in_month, paid_days, lop_days, present_days, run_type },
  earnings:      [ { code, name, amount, is_taxable, is_part_of_ctc, source, display_order } ],
  deductions:    [ { code, name, amount, source, display_order } ],
  employer_contributions: [ { code, name, amount, source, display_order } ],
  reimbursements: [ { code, name, amount, claim_id } ],
  figures:  { gross_earnings, total_deductions, employer_cost, net_pay, ctc_cost, ... },
  statutory: { ...statutory_snapshot as persisted... },
  warnings: [ ...calculation_warnings... ],
  notes:    { statutory_note }        // the existing _statutoryNote() honesty guard
}
```

Composition rules:
- **Money fields are copied verbatim** from `payroll_run_items` / `payroll_run_item_components`. No rounding, no re-derivation, no re-ordering of amounts. Component arrays are ordered by `(display_order, code)` so the array order is deterministic regardless of row-return order.
- `bank` carries **`last4` only** — produced by `bank_encryption.last4()`. The ciphertext and the plaintext never enter a snapshot. If the employee has no bank record, `bank: null`; the PDF prints "—".
- `day_ledger` is **not** embedded (it is large and attendance-owned). The JSON detail endpoint keeps serving it live from the run item, as it does today.
- The composer is a **pure function** — `compose({ run, item, components, employee, employer, department, location, bankLast4 })` → object. It calls no DB, no clock. Its test suite asserts no `db` import, per the Phase 1–5 convention.

### 5.2 Canonicalisation and `snapshot_hash`

`canonicalize(obj)` → a deterministic JSON string: keys sorted lexicographically at every level, arrays left in composed order, numbers emitted as integers (paise) or `DECIMAL(14,2)` strings exactly as stored — **never** via `Number.prototype.toString()` on a float. `snapshot_hash = sha256(canonicalize(snapshot))`, hex, via `node:crypto`.

The hash is the contract for three things:
1. **Immutability proof** — §10 exit criterion: recompose a snapshot from unchanged inputs, hash it, compare to the stored hash.
2. **Reissue integrity** — on reissue, the *money sub-object* is hashed separately (`money_hash`, computed on demand, not stored) and compared to the superseded version's. A mismatch means a closed run was mutated (a D-12 violation) → `409 PAYSLIP_FIGURES_CHANGED`, refuse.
3. **Backfill idempotency** — re-running backfill over a run that already has active payslips is a no-op, not a version bump.

### 5.3 PDF rendering (D-40)

`pdfkit` only, built-in Helvetica/Helvetica-Bold only (no external font file — a font file is a second artefact to ship and a second source of nondeterminism). `pdf_layout.utils.js` provides `drawHeader`, `drawKeyValueGrid`, `drawTable`, `drawTotalsRow`, `drawFooter`; the four renderers compose those.

**Determinism.** Each renderer is `render(snapshot, { creationDate }) → Promise<Buffer>`:
- `creationDate` is **always `payslips.published_at`** (or the export's subject date for Form 16 / annual statement) — never `new Date()`. It is passed to `new PDFDocument({ info: { CreationDate: creationDate, ModDate: creationDate, ... } })`.
- No page numbers derived from wall-clock, no "generated on" line except the pinned date.
- Money formatted by a single shared helper over integer paise (`money.utils.fromPaise`), never `toLocaleString` (locale-dependent).

**Honest statement of the exit criterion.** The parent asks that a regenerated PDF be *"byte-comparable in content"*. With `CreationDate`/`ModDate` pinned, two renders of the same snapshot are expected to be byte-identical. PDFKit may still emit a `/ID` array derived from nondeterministic input; the test therefore asserts **(a)** byte-equality of the two buffers with the `/ID` object excluded, and **(b)** exact equality of `snapshot_hash`. If PDFKit turns out to emit a stable `/ID` for identical input, the test tightens to full byte-equality. **Do not claim byte-identity until the Step-4 test actually shows it.**

**Memory.** A payslip PDF is one to two pages, well under 100 KB. Rendering to a Buffer is acceptable for a single document. The bulk path (§5.4) renders **one payslip at a time** and releases the buffer before the next, so peak memory is O(1) in employee count.

### 5.4 Streaming ZIP (D-41)

`zip_writer.utils.js` — a pure, incremental ZIP writer, **method 0 (STORE)**:

- `createZipWriter()` → `{ addEntry(name, buffer) → Buffer, finish() → Buffer }`. Each call returns the bytes to write; the writer holds only the central-directory records (≈ 60 bytes + filename per entry), never the payloads.
- CRC-32 computed with a generated 256-entry table (≈ 15 lines).
- Local file header + data + central directory + EOCD. No data descriptors (sizes are known before writing each entry).
- **Why STORE, not DEFLATE:** PDFKit already deflates its content streams, so re-compressing buys a few percent for meaningful CPU. (`zlib.deflateRaw` is built-in and could be swapped in later without changing the container format.)
- **Bounds:** EOCD's 16-bit entry count caps a non-ZIP64 archive at 65 535 entries. A run exceeding `ZIP_MAX_ENTRIES = 20000` is rejected with `422 EXPORT_TOO_LARGE` rather than producing a subtly-corrupt archive. 20 000 payslips at ~80 KB is ~1.6 GB streamed — well past any realistic tenant, and the cap is the honest failure rather than silent truncation.
- Filenames from `attachment_storage.utils.sanitizeFileName()` (fact 22), shaped `{employee_code}_{period_month}.pdf`, de-duplicated with a `-2`, `-3` suffix if two employees share a code.

### 5.5 The report query spine (D-46)

All four reports run one shape of query over `payroll_run_items` joined to `payroll_run_item_components`, filtered to runs in `('approved','paid')`, plus a scope filter.

| Report | Grain | Source of dimensions | Notes |
|---|---|---|---|
| **Payroll register** | one row per employee per run | snapshot `employee.*` | columns: code, name, department, location, paid/LOP days, each earning code, each deduction code, gross, deductions, net, employer cost, CTC cost |
| **Department distribution** | one row per `department_id` (× `location_id` when `group_by=department,location`) | snapshot `employee.department_id` / `location_id` | headcount, gross, deductions, employer cost, net, CTC cost |
| **Deduction summary** | one row per `component_code` | component rows | `component_type IN ('deduction','employer_contribution')`; includes `PF_ADMIN_CHARGES` / `EDLI` because it sums **component lines** (fact 17) |
| **Component report** | configurable — per employee × component, or rolled up | both | filters: `period_from/to`, `department_id[]`, `location_id[]`, `user_id[]`, `component_code[]`, `component_type[]`, `source[]` |

**Dimension freezing.** Grouping dimensions come from `payslips.snapshot.employee` for every run that has a payslip, falling back to live profiles only for pre-Phase-6 runs (**D-45**). This is what stops a department transfer from retroactively re-bucketing last March's register. `preview()`'s live `department_breakdown` is deliberately left alone — it is a pre-approval estimate about *today's* org chart, which is exactly what it should be (fact 15).

**Aggregation.** All sums are performed in **integer paise** in `report_shaper.utils.js`, converted once at the edge via `money.utils.fromPaise`. Never `SUM()` a `DECIMAL` in SQL and then float-add in JS.

**Bounds.** Every report requires either `run_id` or a `period_from`/`period_to` pair spanning at most **12 months** (`REPORT_MAX_MONTHS`). Wider → `422 REPORT_RANGE_TOO_LARGE`. Row output is capped at `REPORT_MAX_ROWS = 50000`; exceeding → `422 EXPORT_TOO_LARGE` with the count, so the caller narrows rather than receiving a truncated file. Employee-grain queries are cohort-batched at `AGGREGATOR_COHORT_SIZE` (≈ 200) as everywhere else.

### 5.6 Bank advice (D-49)

Runs only for a run in status **`paid`**. Sequence:

1. Load `calculated` items for the run with `net_pay > 0`.
2. Load `employee_bank_accounts` **under `scopes.withSecret`** for exactly those `user_id`s, primary account only.
3. Any item without a bank account → the whole export fails `409 MISSING_BANK_ACCOUNTS` with the count and the list of `employee_code`s. (EC-26 already blocks the transition to `paid`, so this is a defence-in-depth check for accounts deleted after payment.)
4. `bank_encryption.decrypt()` per row, **in a loop, into a local**. The plaintext is passed to `bank_advice.utils.buildRow()` (pure — it takes the plaintext as an argument and imports no crypto and no `db`, so its test suite stays DB-free and key-free), written to the CSV stream, and the local goes out of scope.
5. Columns: `sr_no, employee_code, beneficiary_name, account_number, ifsc, bank_name, amount, payment_ref, narration` where `narration = "SALARY {period_month}"` and `payment_ref = {run_id-short}-{sr_no}`.
6. Totals row: record count and total amount, echoed in the audit log and the `payroll_report_exports` row (**counts only, never account data**).

**Secrecy invariants (non-negotiable):**
- `hr` only. `decideAuthority` gives `canViewBankAccount: false` for scope `report`; the bank-advice service additionally hard-asserts `authority.scope === 'global'` and `role === 'hr'` (fact 21).
- A decrypted account number never enters: a log line, an `AppError` message, `payroll_audit_logs.new_values`, `payroll_report_exports.filters`, or a stack trace. `bank_advice.service` wraps its body so any thrown error is re-raised as a message-sanitised `AppError`.
- No `?format=json` variant. Bank advice is CSV-only, `Content-Disposition: attachment`, so it cannot be rendered in a browser tab or cached by a JSON client.

### 5.7 CSV writing

`csv_writer.utils.js`, RFC 4180: `"` doubled, fields containing `, " \r \n` quoted, `\r\n` line endings, UTF-8 BOM prefix (Excel misreads UTF-8 without it).

**Formula-injection guard.** HR opens these in Excel. Any cell whose first character is `= + - @ \t \r` is prefixed with a single quote before quoting. This applies to every string cell — employee names and component names are user-controlled.

### 5.8 Annual salary statement

`GET /me/annual-statement?financial_year=YYYY-YY`. Reuses `tax_period.utils.fyMonths(fy, settings.financial_year_start_month)` and the existing `payrollRunItemRepo` FY readers. Output: one row per FY month (gross, each earning code, each deduction code, statutory heads, reimbursements, net) plus an FY totals row and an opening/closing summary. **Months with no approved run render as zeros, not as missing rows** — a gap in the middle of a statement reads as data loss to an employee.

Source precedence is the same as everywhere: payslip snapshot where present, live item projection for pre-Phase-6 runs, with `snapshot_source` reported per month.

---

## 6. API Surface — #167 … #194

**Conventions carried forward unchanged:** response envelope `{success, message, data}` / `{success:false, message, errorCode[, details]}`; `AppError(status, message, errorCode)`; singleton controller instances with `try/catch → next(error)`; `req.query` validated **inside the controller** via `validateOrThrow` (Express 5 `req.query` is getter-only); route-order rule — static segments before `:param`, never a bare `:param` under a shared static prefix.

**New convention — binary endpoints (D-41).** Endpoints marked **⤓** may return a non-JSON body. They all accept `?format=`; `format=json` returns the normal envelope, `format=csv|pdf|zip` returns a stream. Authority, existence and status checks complete **before** the first byte. See §7.5 for the mid-stream failure contract.

### 6.1 HR — `/api/v1/payroll/hr` — `[authenticate, authorize(['hr']), requireFeature('payroll.access')]`

| # | Method | Path | Purpose |
|---|---|---|---|
| 167 | GET | `/runs/:id/payslips` | payslip index for a run — paginated; filters `status`, `visible_to_employee`, `email_status`, `department_id`, `q` |
| 168 | GET | `/employees/:userId/payslips` | one employee's payslip history, all versions |
| 169 | GET | `/employees/:userId/payslips/:runId` | payslip detail (JSON, from snapshot) |
| 170 ⤓ | GET | `/employees/:userId/payslips/:runId/pdf` | payslip PDF; `?version=` for a superseded copy |
| 171 | POST | `/runs/:id/payslips/publish` | release held payslips to employees (when `payslip_auto_publish = false`) |
| 172 | POST | `/runs/:id/payslips/backfill` | compose snapshots for a run approved before Phase 6 — idempotent |
| 173 | POST | `/payslips/:id/reissue` | version N+1 with a mandatory `reason`; money asserted unchanged |
| 174 ⤓ | GET | `/runs/:id/payslips/download` | bulk payslip **ZIP**, streamed |
| 175 | POST | `/runs/:id/payslips/dispatch` | drain a bounded batch of the email queue now |
| 176 | GET | `/runs/:id/payslips/dispatch-status` | counts by `email_status` + the last N failures |
| 177 ⤓ | GET | `/reports/payroll-register` | `?run_id` \| `?period_from&period_to`; `format=json\|csv\|pdf` |
| 178 ⤓ | GET | `/reports/department-distribution` | `?group_by=department\|department,location` |
| 179 ⤓ | GET | `/reports/deduction-summary` | per component code, per run/period |
| 180 ⤓ | GET | `/reports/components` | the filterable custom report |
| 181 ⤓ | GET | `/runs/:id/bank-advice` | NEFT CSV for a **paid** run — CSV only, no JSON variant |
| 182 | GET | `/exports` | `payroll_report_exports` audit list, paginated, filterable |
| 183 | GET | `/employees/:userId/annual-statement` | FY salary statement (JSON) |
| 184 ⤓ | GET | `/employees/:userId/annual-statement/pdf` | FY salary statement PDF |
| 185 ⤓ | GET | `/employees/:userId/tax/form16/:financialYear/pdf` | Form 16 **Part B** PDF over the existing #114 dataset |

**Route order for `/payslips`:** `/payslips/:id/reissue` is the only route at the HR root's `/payslips` prefix, and it is two segments deep; `/runs/:id/payslips*` sits under `/runs/:id`. No collision. `/reports/*` and `/exports` are fully static prefixes with no sibling `:param`.

### 6.2 Manager — `/api/v1/payroll/manager` — `[authenticate, authorize(['manager','hr']), requireFeature('payroll.access')]`

| # | Method | Path | Purpose |
|---|---|---|---|
| 186 ⤓ | GET | `/employees/:userId/payslips/:runId/pdf` | direct report's payslip PDF |
| 187 ⤓ | GET | `/reports/payroll-register` | auto-scoped to `getAccessibleUserIds` |
| 188 ⤓ | GET | `/reports/department-distribution` | auto-scoped |
| 189 ⤓ | GET | `/reports/deduction-summary` | auto-scoped |
| 190 ⤓ | GET | `/reports/components` | auto-scoped |

Managers get **no** bulk ZIP, **no** bank advice, **no** exports audit list, **no** reissue/publish/dispatch — those are Tier C (HR-exclusive) per D-13 and the parent's "org-wide data and bulk export stay HR".

`hr` is admitted to this router as it is today and resolves to scope `global` via `decideAuthority`, so an HR user sees org-wide figures here without a second token.

**EC-25 interaction:** when `manager_can_view_team_compensation = false`, manager report endpoints return **aggregates only** — `department-distribution` and `deduction-summary` work unchanged; `payroll-register` and `components` collapse to totals with per-employee rows omitted, and the PDF (#186) returns `403 COMPENSATION_VIEW_DISABLED`. Same rule `teamItems` already applies.

### 6.3 Self — `/api/v1/payroll` — `[authenticate, requireFeature('payroll.access')]`, no `authorize()`

| # | Method | Path | Purpose |
|---|---|---|---|
| 191 ⤓ | GET | `/me/payslips/:runId/pdf` | own payslip PDF |
| 192 | GET | `/me/annual-statement` | own FY salary statement (JSON) |
| 193 ⤓ | GET | `/me/annual-statement/pdf` | own FY salary statement PDF |
| 194 ⤓ | GET | `/me/tax/form16/:financialYear/pdf` | own Form 16 Part B PDF |

Target is always `req.user.id`; no route accepts a `userId` (D-1 / EC-24). All four sit deeper than, or disjoint from, existing routes: `/me/payslips/:runId` (#56) already exists and `/pdf` is one segment deeper; `/me/tax/form16/:financialYear` (#126) likewise. `/me/annual-statement` is a new static prefix with no sibling `:param`.

Self payslip access additionally requires `visible_to_employee = true` (D-44). A held payslip returns the same `403 PAYSLIP_NOT_ACCESSIBLE` as a non-existent one (EC-24 — out-of-scope and non-existent are byte-identical).

### 6.4 Extended existing endpoints (no new numbers)

| Endpoint | Change | Backward compatibility |
|---|---|---|
| **#53 / #54** manager payslip list + detail | source becomes the snapshot; response gains `snapshot_source` and `payslip_version` | **additive only** — no field removed, no field re-typed |
| **#55 / #56** self payslip list + detail | same | same |
| **#51 / #52** team summary / team items | unchanged | — |
| **#42** run preview | unchanged — `department_breakdown` stays live (fact 15) | — |
| **#46** run approve | now also writes payslips in-transaction; response gains `payslips_created` | additive |
| **#47** run cancel | now also revokes payslips in-transaction; response gains `payslips_revoked` | additive |
| **#48** run pay | now enforces EC-26 | **behaviour change** — §13.4 |
| **#?** `PUT /hr/settings` | accepts `payslip_auto_publish`, `payslip_auto_email`; **and the three Phase-5 keys start working** (Step 0) | the Phase-5 keys were accepted-and-ignored; they now take effect — §13.4 |
| **#118** org statutory summary | unchanged | — |
| **#114 / #126** Form 16 dataset | unchanged; a PDF sibling is added | — |

### 6.5 Validation

- **Params:** `idParamSchema`, `userIdParamSchema`, `userRunParamSchema`, `runIdParamSchema` — reuse the existing schemas; add `payslipIdParamSchema` and `userFyParamSchema` where no equivalent exists.
- **Query (validated in-controller):** `format ∈ {json,csv,pdf,zip}` per endpoint's allowed subset; `period_from`/`period_to` as `YYYY-MM` with `from <= to` and span ≤ 12 months; `financial_year` as `YYYY-YY` via the existing `_assertFy` convention; arrays (`department_id[]`, `user_id[]`, `component_code[]`) capped at 200 elements each; `version` as a positive integer; pagination `page`/`limit` with `limit ≤ 100`.
- **Bodies:** `publishPayslipsSchema` (`{ user_ids?: uuid[] }` — omitted means the whole run), `reissuePayslipSchema` (`{ reason: string(10..500) }` — **required**), `dispatchPayslipsSchema` (`{ limit?: 1..500, user_ids?: uuid[], include_failed?: boolean }`), and two boolean keys added to `updateSettingsSchema`.
- **Rejection is `422` with `errorCode` and `details`**, as everywhere else. An invalid `format` is `422 UNSUPPORTED_FORMAT`, never a silent fallback to JSON.

### 6.6 Response headers for ⤓ endpoints (D-40)

Set by `download_headers.utils.js` (pure — returns a header object; the controller applies it):

| Header | Value |
|---|---|
| `Content-Type` | `application/pdf` \| `text/csv; charset=utf-8` \| `application/zip` |
| `Content-Disposition` | `attachment; filename="..."; filename*=UTF-8''...` via `attachment_storage.utils.buildContentDisposition()` — **always `attachment`, never `inline`** (a CSV served inline is a stored-XSS vector) |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `private, no-store` — payslips and reports must not be cached by intermediaries |
| `Content-Length` | set for PDF and CSV (fully buffered, bounded); **omitted for ZIP** (chunked) |

`src/app.js` gains `exposedHeaders: ['Content-Disposition']` so a browser client can read the filename (fact 25).

---

## 7. Transactional Behaviour & Concurrency

### 7.1 Lock order (extends the Phase-5 block — total order, acquire top-down, never reverse)

```
1. pg_advisory_xact_lock(hashtext('payroll:run:'   || run_id))
2. pg_advisory_xact_lock(hashtext('payroll:period:'|| org_id || ':' || period_month))
3. pg_advisory_xact_lock(hashtext('payroll:payslip:' || payslip_id))        <- NEW (Phase 6)
4. row locks: payroll_runs -> payroll_run_items -> payroll_run_item_components
              -> payslips -> payroll_audit_logs                             <- payslips NEW
```

`payroll:payslip:*` sits **below** run and period locks so a reissue (which takes only #3) can never deadlock against an approval (which takes #1 and #2). No Phase 6 path acquires #3 then #1.

### 7.2 Transaction boundaries

| Operation | Transaction | Locks | Notes |
|---|---|---|---|
| **Run approve** (#46) | **extends the existing approval transaction** | existing run + period locks | snapshot composition + `bulkCreate` of payslips, cohort-batched at 200, inserted after `_commitVariablePay` and before the status flip. Audit `run.payslips_published` with the count. |
| **Run cancel** (#47) | extends the existing cancel transaction | existing | `UPDATE payslips SET status='revoked', revoked_at, revoked_by, revocation_reason WHERE run_id=? AND status='active'` |
| **Run pay** (#48) | extends the existing pay transaction | existing | EC-26 re-check inside the transaction, before the status flip (§7.4) |
| **Publish** (#171) | own transaction | run lock | `UPDATE ... SET visible_to_employee=true, published_at=NOW(), published_by=? WHERE run_id=? AND status='active' AND visible_to_employee=false` — idempotent by the WHERE clause; one audit row with the affected count |
| **Backfill** (#172) | own transaction per cohort | run lock | skips `(run_id, user_id)` pairs that already have an active payslip |
| **Reissue** (#173) | own transaction | `payroll:payslip:{id}`, then `SELECT … FOR UPDATE` on the payslip | supersede N + insert N+1 + audit, atomically |
| **Dispatch** (#175 / cron) | **three short transactions per payslip, never one** | none | claim → send (outside any transaction) → record. §7.6 |
| **Reports / exports** (#177–#181, #183–#185) | read-only; the audit row is written in its own short transaction **before** the stream and updated in another **after** | none | deliberately not atomic with the stream — §7.7 |

### 7.3 Why payslip creation is inside the approval transaction

A payslip that disagrees with its approved run is a correctness failure an employee sees. Writing it post-commit creates a window where the run is `approved` and the employee's payslip does not exist.

**The cost, stated plainly:** a 3 000-employee run adds ~3 000 JSONB inserts of ~4–8 KB (≈ 12–24 MB) to a transaction that already holds the period advisory lock. This is a real increase in lock hold time, not a rounding error. Mitigations: cohort-batched `bulkCreate` (200/batch); snapshot composition done in memory before the first insert; no `snapshot` index to maintain.

**Measurable fallback.** §10 requires a timed approval of a 3 000-employee run. If the added time exceeds **+40 % of the pre-Phase-6 approval duration**, the documented fallback is to move composition behind the commit into a bounded post-commit task, relying on #172 backfill and the D-45 read fallback for the crash window. **Do not pre-emptively build the fallback.** Build the in-transaction path, measure it, and switch only if the measurement demands it.

### 7.4 EC-26 enforcement in `pay()` (D-50)

Inside the existing pay transaction, after the status guard and before the flip:

1. Re-run `_missingBankCount(runId, { transaction })` over items in status `calculated` with `net_pay > 0`.
2. `> 0` → throw `AppError(409, '…', 'MISSING_BANK_ACCOUNTS')` with `details: { count, employee_codes: [...] }` (HR-only endpoint, so codes are safe to return).
3. The transaction rolls back; the run stays `approved`.

The check must be **inside** the transaction, not before it. Checking outside leaves a window where an account is deleted between the check and the flip, producing a `paid` run whose bank advice cannot be generated.

**Remedies for HR** (no bypass flag exists — the parent says the run *cannot* be marked paid): add the missing bank accounts, or exclude the affected items via the existing exclusion endpoint (#45) and re-approve.

### 7.5 Mid-stream failure (D-41)

Once the first byte of a ⤓ response is written, the envelope is no longer available. The contract:

1. **All** authority, existence, status and bound checks run before any header is set. By construction, everything that can produce a 4xx happens first.
2. After headers are sent, the controller does **not** call `next(error)`. It logs with the `payroll_report_exports.id` for correlation, marks that row `failed`, and calls `res.destroy(error)` — the client sees a truncated response and a connection reset, which is the only honest signal available.
3. `error.middleware.js` gains the guard:
   ```js
   if (res.headersSent) return next(error)   // delegate to Express's default handler
   ```
   placed at the top of the handler. Two lines; the only change outside `modules/payroll/`. Without it, a mid-stream throw raises `ERR_HTTP_HEADERS_SENT` *inside* the error handler and the original error is lost (fact 9).
4. A truncated ZIP is detectable by the client: the EOCD record is written last, so a truncated archive fails to open rather than opening with missing files.

### 7.6 Email dispatch concurrency (D-43)

Three phases per payslip; an SES call is **never** made inside a transaction.

```
CLAIM   UPDATE payslips
          SET email_status='sending', email_claimed_at=NOW(), email_attempts=email_attempts+1
        WHERE id = :id
          AND email_status IN ('pending','failed')
          AND email_attempts < 5
        RETURNING id;                      -- zero rows returned => another worker owns it, skip
SEND    await email.sendPayslipNotificationEmail(...)   -- outside any transaction, with a timeout
RECORD  UPDATE payslips SET email_status='sent', email_sent_at=NOW()        -- on success
        UPDATE payslips SET email_status='failed', email_last_error=...     -- on failure
```

- **Duplicate dispatch requests and a double-firing cron are both safe** — the conditional `UPDATE … RETURNING` is the claim, and only one transaction can win it.
- **Stale claims:** a row in `sending` with `email_claimed_at < NOW() - PAYSLIP_EMAIL_STALE_MS (10 min)` is reclaimable, mirroring the existing `STALE_CALCULATION_MS` convention. A crash between SEND and RECORD can therefore re-send at most one duplicate notification — acceptable, because the email contains no payload, only a link (D-42).
- **Bounded retry:** `email_attempts < 5`. Exhausted rows stay `failed` and surface in #176 for manual handling. There is no unbounded retry loop.
- **Batch bound:** `limit ≤ 500` per invocation; the cron uses 200.

### 7.7 Why the export audit row is not transactional with the stream

The `payroll_report_exports` row is committed **before** the first byte. If it were written in the same transaction as the read, a crash mid-stream would roll it back and leave **no record that salary data left the system** — exactly the audit hole the table exists to close. A `started` row with no `completed_at` is a meaningful, investigable state; a missing row is not.

### 7.8 Idempotency and duplicate-request matrix

| Action | Duplicate / concurrent behaviour | Mechanism |
|---|---|---|
| Approve ×2 | second fails the status guard; if it raced past, the partial unique index raises `23505` and the whole approval rolls back — correct, since a half-written payslip set is worse than a retry | status guard + `payslips_run_user_active_uniq` |
| Publish ×2 | idempotent no-op | `WHERE visible_to_employee = false` |
| Backfill ×2 | idempotent; no version bump | skip pairs with an existing `active` payslip |
| Reissue ×2 concurrent | one wins; the other gets `409 PAYSLIP_ALREADY_SUPERSEDED` | advisory lock + `FOR UPDATE` + partial unique index |
| Dispatch ×2 concurrent | each payslip emailed once | atomic claim (§7.6) |
| Cancel then re-approve | old payslips `revoked`; new ones created with `version = max(version)+1` so history stays monotone and no unique-index collision occurs (the index is partial on `status='active'`) | version derived from `MAX(version)` per `(run_id, user_id)` |
| Export ×2 | **not** idempotent by design — each request is a new audit row | exports are reads; deduplicating them would destroy the audit trail |
| PDF re-render | byte-stable (§5.3) | pinned `CreationDate` from `published_at` |

### 7.9 Race conditions explicitly handled

| Race | Outcome |
|---|---|
| Approve while an employee's profile is being edited | snapshot captures whatever is committed at approval time; later profile edits never alter the payslip (D-39). This is the point of the table. |
| Reissue while the run is being cancelled | cancel takes the run lock and revokes; reissue takes the payslip lock and re-reads `status` under `FOR UPDATE` — if it reads `revoked`, it aborts with `409 PAYSLIP_REVOKED` |
| Bank account deleted between `approve` and `pay` | EC-26 re-check inside the pay transaction catches it (§7.4) |
| Bank account deleted between `pay` and bank-advice generation | bank advice fails `409 MISSING_BANK_ACCOUNTS` rather than emitting a short file |
| Two HR users export the same report simultaneously | both succeed; two audit rows — correct |
| Run approved while a bulk ZIP of a different run streams | independent; no shared lock |
| Employee opens their payslip while HR reissues it | the read sees either version N or N+1, never a torn state — both are complete rows |

---

## 8. Edge Cases — EC-57 … EC-72

Continuing the parent's register (highest existing is **EC-56**, verified across the parent and all five phase documents).

| EC | Scenario | Required behaviour |
|---|---|---|
| **EC-57** | Run approved **before** the Phase 6 deploy — no `payslips` row exists | `payslip_read` falls back to the live projection and reports `snapshot_source: 'live_projection'`. PDF endpoints compose an **ephemeral** snapshot from live data, render it, and **do not persist** it. HR may persist it explicitly via #172. Never a 404. (**D-45**) |
| **EC-58** | Employee's department changes after approval | The register, distribution report and re-rendered PDF all show the department **as at approval**. Only #42 `preview()` reflects the new one. (**D-46**) |
| **EC-59** | Employee has no bank account at approval | `snapshot.employee.bank = null`; PDF prints "—". Approval is **not** blocked. `pay()` is blocked (EC-26 / **D-50**). |
| **EC-60** | Employee has no `employee_profiles` row at all | Snapshot composes with `employee_code: null`, `department_id: null`; a `warnings` entry `MISSING_EMPLOYEE_PROFILE` is appended. Approval proceeds — a payroll run must not fail on a profile gap. The register groups such rows under a literal `UNASSIGNED` bucket. |
| **EC-61** | Org profile lacks address / PAN | PDF prints blank lines rather than the string `null` or `undefined`. Form 16 PDF prints `TAN: —` (**D-47**). |
| **EC-62** | Run cancelled after approval | All active payslips → `revoked` in the cancel transaction. Employee and manager reads return the same `403` as a non-existent payslip (EC-24). Reports exclude the run because it leaves `('approved','paid')`. |
| **EC-63** | Reissue attempted on a run whose figures changed | `409 PAYSLIP_FIGURES_CHANGED`. Refuse and surface it — a changed closed run is a **D-12 violation** and must be investigated, not papered over by issuing a corrected payslip. |
| **EC-64** | Reissue of a revoked payslip | `409 PAYSLIP_REVOKED`. |
| **EC-65** | Bulk ZIP requested for a run with zero payslips | `422 NO_PAYSLIPS_FOR_RUN`. Never a valid-but-empty ZIP — an empty archive reads as "everyone has an empty payslip". |
| **EC-66** | Report period spans more than 12 months, or yields > 50 000 rows | `422 REPORT_RANGE_TOO_LARGE` / `422 EXPORT_TOO_LARGE`, with the computed bound in `details`. Never a silently truncated file. |
| **EC-67** | Manager requests a report while `manager_can_view_team_compensation = false` | Aggregate reports work; per-employee grain collapses to totals; the payslip PDF returns `403 COMPENSATION_VIEW_DISABLED`. (EC-25) |
| **EC-68** | Manager requests a payslip PDF for a non-report, or for a user who does not exist | **Byte-identical** `403 PAYSLIP_NOT_ACCESSIBLE` in both cases (EC-24). No timing or message difference. |
| **EC-69** | SES rejects a payslip notification (bounce, suppression, throttle) | `email_status='failed'`, `email_last_error` truncated to 500 chars, `email_attempts` incremented. After 5 attempts the row stays `failed` and appears in #176. **The payslip itself remains published** — email failure never affects visibility. |
| **EC-70** | Dispatcher crashes between SEND and RECORD | The row stays `sending`; after 10 minutes it is reclaimable, producing at most one duplicate **notification** (no payload — D-42). Recorded as an accepted at-least-once property. |
| **EC-71** | Two payslips in one run share an `employee_code` (bad data) | ZIP filenames de-duplicated with `-2`, `-3` suffixes. The archive never contains two identical entry names. |
| **EC-72** | Employee's name or a component name begins with `=`, `+`, `-` or `@` | CSV writer prefixes the cell with `'` before quoting (§5.7). Verified by unit test with a payload such as `=cmd\|'/c calc'!A1`. |

---

## 9. Tests

Runner and conventions unchanged: `node --test "tests/unit/**/*.test.js"`, no DB, no network, pure utils asserted DB-free. **Baseline 513 must not regress.**

### 9.1 New pure-util suites (the bulk of the value)

| Suite | Asserts |
|---|---|
| `csv_writer.utils.test.js` | RFC 4180 escaping (quotes, commas, CRLF, embedded newlines); BOM; **formula-injection guard for all of `= + - @ \t \r`**; null/undefined → empty cell; numeric cells unquoted |
| `zip_writer.utils.test.js` | local header + central directory + EOCD byte layout; CRC-32 against known vectors; entry count and offsets; **the produced buffer is parseable by `unzip -t`** (fixture-based byte assertions, no external tool at test time); `ZIP_MAX_ENTRIES` rejection; duplicate-name suffixing |
| `payslip_snapshot.utils.test.js` | composition from fixtures; **canonicalisation is key-order independent** (compose from two differently-ordered inputs → identical hash); money copied verbatim, never re-rounded; `bank` carries `last4` only and **never** a full number or ciphertext; missing profile → `MISSING_EMPLOYEE_PROFILE` warning; no `db` import |
| `report_shaper.utils.test.js` | grouping by department / department+location; paise-integer summation with no float drift over 10 000 rows; `UNASSIGNED` bucket; employer-contribution lines included in the deduction summary; totals reconcile to the input sum exactly |
| `bank_advice.utils.test.js` | row shape, narration and payment-ref format; totals; **no `db` and no crypto import** (plaintext arrives as an argument) |
| `download_headers.utils.test.js` | correct triple per format; `attachment` always, `inline` never; `nosniff`; UTF-8 filename encoding; `no-store` |
| `payslip_pdf.utils.test.js` | **two renders of the same snapshot with the same pinned `creationDate` produce identical bytes** (modulo `/ID`, §5.3); output begins `%PDF-`; a snapshot with 40 components paginates without throwing; zero-amount and null-bank snapshots render |
| `annual_statement_pdf.utils.test.js` / `form16_pdf.utils.test.js` | render from fixture datasets; missing TAN prints `—`, never `null` |

### 9.2 Extended existing suites

- `payroll_access.utils.test.js` — report scope resolution: manager → `getAccessibleUserIds`, HR → `null` (global), `canViewBankAccount` false for every report path.
- Run-service suites — approve emits the payslip payload; cancel revokes; **pay throws `MISSING_BANK_ACCOUNTS` when the count is non-zero**.
- Settings suite — the three Step-0 columns round-trip through `getOrCreate`/`update`, and `benefit_deductions_enabled: true` now reaches `payroll_run.service.js:349`.

### 9.3 Service-level tests (mocked repositories, as in Phases 2–5)

- Snapshot-first read with live fallback, and the `snapshot_source` flag in both branches.
- Reissue: happy path, figures-changed rejection, revoked rejection, concurrent-loser `409`.
- Dispatch claim: a second claim on a `sending` row returns zero rows; a stale claim is reclaimable; attempts cap at 5.
- Backfill idempotency: second invocation creates zero rows.
- Report scoping: a manager's register never contains a non-report's `user_id` — asserted by set difference against `getAccessibleUserIds`, driven by an ID-substitution fixture.

### 9.4 Reconciliation test (the one that matters most)

For a fixture run: `sum(payslips.snapshot.figures.net_pay)` **exactly equals** `sum(payroll_run_items.net_pay)` equals the payroll register's total equals the bank advice's total. Any drift here means the delivery layer disagrees with the engine, which is the single failure mode Phase 6 must not have.

---

## 10. Exit Criteria

The parent's §8 criteria first, then this phase's additions. All must be demonstrated, not asserted.

- [ ] **A regenerated payslip PDF is byte-comparable in content to the original for an unchanged snapshot** — demonstrated by the §9.1 determinism test, with the `/ID` caveat of §5.3 stated in the result rather than glossed over.
- [ ] **500 payslips stream as a ZIP without exhausting memory** — measured RSS delta stays under 150 MB for a 500-payslip archive; the per-payslip buffer is released between entries.
- [ ] **An employee can retrieve only their own payslip; a manager only a direct report's** — verified by ID substitution against a known non-report, expecting `403` byte-identical to the non-existent case.
- [ ] **A manager's report never includes a non-report's figures** — verified by set difference, not by eyeballing.
- [ ] **Every export is audit-logged** — a `payroll_report_exports` row exists for every ⤓ response, including failed ones.
- [ ] `payslips` written for every `calculated` item at approval; count echoed in the #46 response.
- [ ] `payslip_auto_publish = true` (default) reproduces today's #55/#56 behaviour exactly — no employee sees a change.
- [ ] A run approved before the deploy still serves #55/#56 and now a PDF, via the D-45 fallback.
- [ ] `pay()` refuses a run with a missing bank account (`409 MISSING_BANK_ACCOUNTS`); the run remains `approved`.
- [ ] Bank advice totals reconcile to the run's `net_pay` total to the paise.
- [ ] No decrypted account number appears in any log line, audit row, export row or error message — verified by grepping a captured log of a full bank-advice export.
- [ ] Deduction summary includes `PF_ADMIN_CHARGES` and `EDLI` (proves it sums component lines, not item columns — fact 17).
- [ ] A double-fired dispatcher sends each notification once.
- [ ] Approval timing on a 3 000-employee run measured and recorded against the §7.3 threshold.
- [ ] `npm test` ≥ 513 + new tests, 0 failing.
- [ ] Exactly one new dependency in `package.json`: `pdfkit`.
- [ ] Registry entries #51–#54 present in `org_settings_registry.md`; #167–#194 in `api_registry.md` and `combined_api_analysis.md`.

---

## 11. Risks & Decisions

### 11.1 Decisions — D-38 … D-50

**D-38 — The D-37 tax items are reassigned out of Phase 6.**
Phase 5 §1.2 / §11-10a deferred two tax behaviours to "Phase 6": taxing an employer benefit contribution as a perquisite, and auto-crediting a benefit premium toward §80D. The parent never assigns them to Phase 6. Both require Phase-4 engine surgery — `statutory_calculation.service.js:163` builds `taxable_earnings` from `realEarningLines` only, so an `employer_contribution` line cannot reach it by flag alone. Phase 6's safety property is that engine output does not change (§1.1); these two items would change it. **Ruling:** reassign to Phase 7 or a dedicated statutory follow-up. **Parent amendment required** — §8 and §9 must record the reassignment so the next phase does not lose them.

**D-39 — `payslips` freezes identity, versioning and publication state; `payroll_run_items` remains the arithmetic source of truth.**
Phase 2 already froze the money (§1.3 row 1). The genuinely unfrozen data is the non-payroll identity context, which lives in mutable unversioned tables. Without the freeze, a regenerated payslip silently changes after a transfer or rename, breaking the parent's own exit criterion. Money is copied into the snapshot for reproducibility, and §9.4 asserts the two never diverge.

**D-40 — Binary responses: pinned dates, attachment-only, `no-store`, `exposedHeaders`.**
PDF creation dates are pinned to `published_at` so renders are reproducible. Every download is `Content-Disposition: attachment` (never `inline` — an inline CSV or PDF is a stored-XSS vector) with `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`. `src/app.js` gains `exposedHeaders: ['Content-Disposition']`, without which browser clients cannot read the filename (fact 25).

**D-41 — Hand-written streaming ZIP (STORE) + a `res.headersSent` guard in the shared error middleware.**
`archiver` is absent and D-11 permits exactly one new dependency, spent on `pdfkit`. A STORE-only ZIP writer is ~120 lines of pure, testable code, and PDFKit already deflates its streams so compression buys little. The middleware guard is two lines and is the only change outside `modules/payroll/`; without it a mid-stream failure throws inside the error handler and destroys the original error (fact 9).
*Alternative considered:* add `archiver`. Rejected under D-10/D-11, but the decision is cheap to reverse — the ZIP writer is behind one util interface. **If the user prefers a second dependency, this is the one place to spend it.**

**D-42 — Payslip email is a notification with a deep link, not a PDF attachment.**
`aws-ses.provider.js` uses `SendEmailCommand`, which cannot attach files (fact 10). Attaching would require switching a **shared** provider — used by auth OTP and invitations — to `SendRawEmailCommand` with hand-built MIME, and would place unencrypted salary documents in personal inboxes and mail-server logs. The parent's wording ("email dispatch via the existing `@aws-sdk/client-ses` utility / `email.utils.js`") is satisfied literally: Phase 6 adds `sendPayslipNotificationEmail()` to that utility. **Open to the user:** if attachments are genuinely required, that is a scoped follow-up against the SES provider, not a Phase 6 side effect.

**D-43 — Email dispatch is a claim-based queue on `payslips`, drained by a cron and an HR endpoint.**
Fanning 500 SES calls out inside the approval transaction would hold the period lock across network I/O with no retry and no partial-failure story. Instead, approval only sets `email_status='pending'`; a conditional `UPDATE … RETURNING` claims each row (§7.6). `node-cron` and `src/cron-jobs/` already exist (fact 8), so the cron costs no dependency. The HR endpoint (#175) exists for immediate dispatch and for draining `failed` rows; Phase 7 may add nothing here.

**D-44 — `payslip_auto_publish` controls *visibility*, not *existence*.**
The snapshot row is **always** written at approval — it is the immutable record, not a publication choice. `visible_to_employee` gates employee and manager reads. Default `true` preserves today's behaviour exactly (#55/#56 currently show every approved run immediately). Had auto-publish gated row creation, setting it `false` would leave an approved run with no immutable record at all, defeating D-6.

**D-45 — Snapshot-first read with a permanent live-projection fallback, plus an explicit backfill endpoint.**
Runs approved before the deploy have no `payslips` row, and the migration cannot backfill them (composition is code). `payslip_read` therefore reads the snapshot when present and falls back to today's live projection otherwise, reporting `snapshot_source`. This is **not** a migration hack — it is also what makes the deploy reversible (§13.3) and what keeps the crash window of §7.3 recoverable. #172 lets HR persist snapshots for historical runs deliberately.

**D-46 — Reports group by frozen snapshot dimensions; `preview()` stays live.**
`_loadDepartmentMap()` reads live `employee_profiles` (fact 15), so a report built on it would re-bucket history after a transfer. Reports read `snapshot.employee.department_id` / `location_id`. Grouping is always by **`department_id`**, never the free-text `department` column. `preview()` is left untouched: it is a pre-approval estimate about today's org chart, which is the correct semantics for it.

**D-47 — Missing employer fields are rendered as em-dashes, not invented.**
`organization_profiles` has no TAN column (fact 27) and `getForm16` already returns `tan: null`. Phase 6 renders `TAN: —`. It does **not** add a TAN column — that is an organization-module schema change with its own validation and settings surface, outside this phase's boundary. Flagged to the product owner: **a Form 16 Part B without a TAN is not submission-grade**; adding TAN to `organization_profiles` should be scheduled before Form 16 PDFs are relied on for filing. Same treatment for `exit_date`, which `employee_profiles` lacks — the annual statement shows months with no run as zeros rather than inferring an exit.

**D-48 — `payroll_report_exports` is an audit table, written before the stream.**
See §7.7. `requested_by` is `ON DELETE RESTRICT` — unlike most FKs in this module — because an export row that loses its actor is an audit hole.

**D-49 — Bank advice: one canonical CSV, generated on demand, never stored, HR-only.**
No blob, no JSON variant, no `inline` disposition. Plaintext account numbers exist only as loop-locals between `decrypt()` and the CSV row (§5.6). Bank-specific fixed-width layouts are Phase 7.

**D-50 — EC-26 is enforced in `pay()`, inside the transaction, with no bypass flag.**
The parent states a run with missing bank details "may calculate, but cannot be marked `paid`". No override setting is added — inventing one would contradict the parent. HR's remedies are to add the accounts or exclude the items via the existing #45. The check must be inside the transaction to close the delete-between-check-and-flip window (§7.4).

### 11.2 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Approval transaction lengthens materially on large runs (§7.3) | **HIGH** | cohort-batched inserts; **measured** against a +40 % threshold in §10; documented post-commit fallback, built only if the measurement demands it |
| 2 | Hand-written ZIP produces a subtly-invalid archive | **HIGH** | byte-layout unit tests against known vectors; a manual `unzip -t` on a 500-entry fixture archive is a **required Step-4 gate**, not optional |
| 3 | PDF rendering is not actually byte-stable because of PDFKit's `/ID` | **MEDIUM** | §5.3 states the caveat up front; the test asserts what is true rather than what was hoped. Report the real result. |
| 4 | Report queries scan large ranges and degrade the DB | **MEDIUM** | 12-month and 50 000-row bounds (EC-66); cohort batching; verify index usage with `EXPLAIN` on the register query before merge |
| 5 | EC-26 blocks a tenant who legitimately pays some employees outside NEFT | **MEDIUM** | documented remedy (#45 exclusion); called out in the release note (§13.4). If this proves to be a real workflow, it is a scoped follow-up, not a silent bypass |
| 6 | Step-0 settings fix **switches on** the dormant Phase-5 benefits feature | **MEDIUM** | this is the fix, not a side effect — but it changes run output for any tenant that set `benefit_deductions_enabled`. §13.4 requires checking which tenants have it set and telling them before deploy |
| 7 | Mid-stream failure leaves a truncated download | **LOW** | EOCD written last so a truncated ZIP fails to open; `res.destroy()`; the `failed` audit row is the record |
| 8 | Duplicate payslip notification after a dispatcher crash | **LOW** | accepted at-least-once (EC-70); the email has no payload |
| 9 | `pdfkit` rejected by the user | **BLOCKING if it happens** | Step 0 is a gate. Without it, PDF scope (#170, #184, #185, #191, #193, #194) cannot ship; CSV reports, ZIP-of-nothing and bank advice would be the only deliverable. **Confirm before Step 1.** |

---

## 12. Build Order & Dependencies

Each step is independently verifiable. Do not start a step before its predecessor's verification passes.

| Step | Work | Verify |
|---|---|---|
| **0** | **Gates & carry-over.** (a) Confirm `pdfkit` with the user and install it — nothing else. (b) Declare the three missing Phase-5 columns on `payroll_settings.model.js`, mirroring `00044`'s types and defaults exactly (fact 23). (c) `payroll_runs.model.js` `engine_version` 4 → 5 (fact 24). (d) Add org-settings registry entries **#51–#53** (Phase 5 debt). | settings round-trip test passes; `benefit_deductions_enabled: true` reaches `payroll_run.service.js:349`; `npm test` still 513 |
| **1** | Migration `00047` + `payslips.model.js` + `payroll_report_exports.model.js` + the two settings columns + registry **#54** | migration reads cleanly in both directions; models load via `models.index.js`; **hand the migration to the user to run** |
| **2** | Repositories: `payslip`, `payroll_report_export`, `payroll_report`; `findApprovedItemsForSnapshot` on the run-item repository | unit-testable query shapes; `EXPLAIN` the register query |
| **3** | Pure utils: `csv_writer`, `zip_writer`, `payslip_snapshot`, `report_shaper`, `bank_advice`, `download_headers` + their suites | §9.1 suites green; every suite asserts no `db` import |
| **4** | PDF: `pdf_layout` + the three renderers + determinism suite | two renders byte-equal (modulo `/ID`); **`unzip -t` on a 500-entry fixture archive** (risk 2 gate) |
| **5** | `payslip.service`: compose + persist; wire into `approve()`; revoke in `cancel()`; `#172` backfill | approve creates N payslips in-transaction; cancel revokes; **timed 3 000-employee approval recorded** (§7.3) |
| **6** | `payslip_read.service` source switch + D-45 fallback + `snapshot_source` | #53–#56 responses unchanged except the two additive fields; pre-Phase-6 run still serves |
| **7** | `payslip_dispatch.service` + `email.utils.sendPayslipNotificationEmail` + `payslip_available.html` + the cron + `server.js` registration | atomic claim proven by a concurrent-claim test; attempts cap at 5; stale reclaim works |
| **8** | `payroll_report.service` + `annual_statement.service` + export-audit writes | §9.4 reconciliation test; manager set-difference test |
| **9** | `bank_advice.service` + EC-26 in `pay()` | `pay()` rejects with `MISSING_BANK_ACCOUNTS`; advice totals reconcile; log grep finds no account number |
| **10** | Controllers, routes, validators — HR → Manager → Self; `error.middleware.js` guard; `app.js` `exposedHeaders` | route-order review (static before `:param`); every ⤓ endpoint writes an audit row; `403` byte-identity check for EC-68 |
| **11** | Documentation: `api_registry.md` #167–#194, `combined_api_analysis.md`, `org_settings_registry.md`, parent amendments (D-38 reassignment; §8 scope reconciliation; D-47 TAN flag) | registries reconcile with the route files by count and by path |

**Dependency edges:** 0 → 1 → 2 → 3 → 4 → 5 → {6, 7} → 8 → 9 → 10 → 11. Steps 6 and 7 are parallelisable after 5. Step 4 gates every ⤓ endpoint. Step 0(a) gates step 4.

**Phase 1–5 components consumed (not modified):** `getAccessibleUserIds`, `decideAuthority`, `TENANT_GLOBAL_ROLES`, `AppError`, `validateOrThrow`, `money.utils`, `tax_period.utils.fyMonths`, `bank_encryption.utils`, `attachment_storage.utils.{sanitizeFileName,buildContentDisposition}`, `payroll_audit_logs`, `aws-ses.provider.sendEmail`, `requireFeature`, the run/item/component repositories, `employee_tax.service.getForm16`.

---

## 13. Deployment & Production Readiness

### 13.1 Deploy order

1. **Step 0 model fixes deploy first, on their own.** They are a defect fix with no schema change and must be observable in isolation — specifically, whether any tenant's run output changes once `benefit_deductions_enabled` starts being read (risk 6).
2. User runs migration `00047`. It is purely additive (two new tables, two new nullable-with-default settings columns) and safe to run against a live system.
3. Deploy Phase 6 code. Both new settings default to the behaviour-preserving values (`auto_publish=true`, `auto_email=false`), so nothing changes for an employee at deploy time.
4. Register the cron (`server.js`). With `payslip_auto_email=false` everywhere, it drains an empty queue until a tenant opts in.

### 13.2 Configuration

| Setting | Where | Default |
|---|---|---|
| `PAYROLL_ENCRYPTION_KEY` | env, already required at boot | — (existing) |
| `PAYSLIP_EMAIL_MAX_ATTEMPTS` | code constant | 5 |
| `PAYSLIP_EMAIL_STALE_MS` | code constant | 600 000 |
| `PAYSLIP_DISPATCH_BATCH` | code constant | 200 (cron) / `limit` ≤ 500 (#175) |
| `REPORT_MAX_MONTHS` | code constant | 12 |
| `REPORT_MAX_ROWS` | code constant | 50 000 |
| `ZIP_MAX_ENTRIES` | code constant | 20 000 |
| `payslip_auto_publish` / `payslip_auto_email` | per-org settings, registry #54 | `true` / `false` |
| App deep-link base URL for the notification email | existing config used by `sendInvitationEmail` — **reuse it, do not add a new one** | — |

### 13.3 Rollback

Code rollback is safe at any point: `payslips` rows are inert to Phase 1–5 code, and `payslip_read` reverts to the live projection it uses today. The migration's `down` drops both tables and the two settings columns; run it only if the tables are genuinely unwanted, since dropping `payslips` discards frozen identity context that cannot be reconstructed after a profile change. **Prefer code rollback without migration rollback.**

### 13.4 Behaviour changes to announce

Three, and they are the only ones:

1. **`pay()` now refuses a run with missing bank accounts** (`409 MISSING_BANK_ACCOUNTS`). A tenant that could mark such a run paid yesterday cannot today. Remedy: add the accounts, or exclude the items via #45. *(EC-26, D-50.)*
2. **The three Phase-5 settings keys start taking effect.** `PUT /hr/settings` accepted and ignored them; after Step 0 they are honoured. Most significant: a tenant that set `benefit_deductions_enabled: true` will begin seeing benefit deduction lines on runs. **Before deploying Step 0, check which tenants have a non-default value and tell them.**
3. **Payslip responses gain `snapshot_source` and `payslip_version`.** Purely additive; no field removed or re-typed.

### 13.5 Observability

Structured log events (existing logger, existing shape):

| Event | Fields |
|---|---|
| `payslip.published` | `run_id, org_id, count, duration_ms` |
| `payslip.reissued` | `payslip_id, user_id, from_version, to_version, actor_id` |
| `payslip.revoked` | `run_id, count, actor_id` |
| `payslip.email.sent` / `.failed` | `payslip_id, attempts, error_code` (**never the address or the body**) |
| `payslip.backfilled` | `run_id, created, skipped` |
| `report.exported` | `export_id, report_type, format, scope, row_count, byte_count, duration_ms, actor_id` |
| `bank_advice.generated` | `run_id, row_count, total_amount_paise, actor_id` — **counts and totals only** |
| `export.stream_failed` | `export_id, bytes_written, error_code` |

Metrics worth a dashboard: payslips with `email_status='failed'` (should trend to zero), export p95 duration by `report_type`, approval duration by employee count (risk 1), bank-advice generations per month (should equal paid runs).

**Never logged:** decrypted account numbers, snapshot bodies, PDF/CSV/ZIP contents, email bodies, `Content-Disposition` values containing employee names.

### 13.6 Security checklist

- [ ] Every ⤓ endpoint resolves authority through `decideAuthority` before any header is set.
- [ ] `403` for out-of-scope is byte-identical to `403` for non-existent (EC-24, EC-68).
- [ ] `admin` / `super-admin` reach no Phase 6 endpoint (D-14).
- [ ] Managers reach no bank data by any path, including reports and the register.
- [ ] Self endpoints never accept a `userId`.
- [ ] CSV formula-injection guard applied to every string cell.
- [ ] All downloads are `attachment` + `nosniff` + `no-store`.
- [ ] `payroll_report_exports.filters` contains ids and codes only — no names, no amounts, no account data.
- [ ] Decrypted account numbers exist only as loop-locals in `bank_advice.service`.
- [ ] Report array filters bounded at 200 elements; period bounded at 12 months; rows bounded at 50 000.

---

## 14. Error Code Reference

New codes introduced by Phase 6. Existing codes are reused wherever they fit — no synonyms are created.

| Code | HTTP | Raised when |
|---|---|---|
| `PAYSLIP_NOT_ACCESSIBLE` | 403 | out-of-scope, non-existent, or not yet published — **byte-identical in all three cases** |
| `COMPENSATION_VIEW_DISABLED` | 403 | manager PDF / per-employee report grain while `manager_can_view_team_compensation = false` |
| `PAYSLIP_REVOKED` | 409 | reissue or read of a payslip whose run was cancelled |
| `PAYSLIP_ALREADY_SUPERSEDED` | 409 | concurrent reissue loser |
| `PAYSLIP_FIGURES_CHANGED` | 409 | reissue found the run item's money differs from the superseded snapshot (D-12 violation) |
| `MISSING_BANK_ACCOUNTS` | 409 | `pay()` (EC-26) or bank-advice generation found items without a bank account |
| `RUN_NOT_PAID` | 409 | bank advice requested for a run not in status `paid` |
| `NO_PAYSLIPS_FOR_RUN` | 422 | bulk ZIP or publish for a run with zero payslips |
| `REPORT_RANGE_TOO_LARGE` | 422 | period span exceeds `REPORT_MAX_MONTHS` |
| `EXPORT_TOO_LARGE` | 422 | result exceeds `REPORT_MAX_ROWS` or `ZIP_MAX_ENTRIES` |
| `UNSUPPORTED_FORMAT` | 422 | `format` not in the endpoint's allowed set |
| `PAYSLIP_VERSION_NOT_FOUND` | 404 | `?version=` refers to a version that does not exist for that payslip |
| `REISSUE_REASON_REQUIRED` | 422 | reissue without a reason (also caught by the body schema) |

---

## 15. Final Acceptance Criteria

Phase 6 is complete when **all** of the following hold:

1. Every §1.3 row marked **NEW** is implemented; no row marked **DONE** was re-planned or rewritten.
2. Endpoints **#167–#194** exist, are numbered and are recorded in `api_registry.md` and `combined_api_analysis.md`; the route files and the registries reconcile exactly.
3. `org_settings_registry.md` contains **#51–#54** (three carried over from Phase 5, one new).
4. Migration `00047` has been run by the user and both new tables exist with the indexes of §4.
5. `package.json` gained **exactly one** dependency: `pdfkit`.
6. Every §10 exit criterion is checked, with the measured values recorded — particularly the approval-duration measurement (risk 1) and the actual PDF byte-stability result including the `/ID` caveat (risk 3).
7. `npm test` passes with **no** reduction from 513 and with every §9.1 suite present.
8. §9.4 reconciliation holds: run items, payslip snapshots, the payroll register and the bank advice all agree to the paise.
9. The three §13.4 behaviour changes are documented in the release note and the affected tenants identified.
10. The parent document is amended: D-38's reassignment of the D-37 tax items, the §8 scope reconciliation of §1.3, and D-47's TAN flag.
11. No file outside `src/modules/payroll/` is modified except `common/middlewares/error.middleware.js` (two lines), `common/utilities/email.utils.js` (one function), `common/templates/payslip_available.html` (new), `src/app.js` (one CORS key), `src/server.js` (one `require`), `src/cron-jobs/payslip_email_dispatch.cron.js` (new), and `package.json`.
12. No engine service produces a different number than it did before Phase 6 — the phase's safety property (§1.1), demonstrated by re-running an existing run fixture and diffing the persisted items.
