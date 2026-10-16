# PDF Generation Module — Phase 3 Implementation Plan

**Phase:** 3 of 5 — *Payroll on HTML: templates, the artifact cache, the render queue, and bulk delivery*
**Status:** PLANNED (no code written)
**Authored:** 2026-09-27
**Depends on:** Phase 1 (COMPLETE), Phase 2 (COMPLETE)
**Source of truth:** this document supersedes §11 "Phase 3" of `public/md_pdf-generation/implementation_plan.md` for all Phase 3 work. Where the two disagree, §1.4 records the resolution and the reason.

---

## 0. Document Control

### 0.1 What this document is

The reconstructed, implementation-ready scope of Phase 3 **after** subtracting everything Phases 1 and 2 actually shipped. It is not a copy of the main plan's Phase 3 section: that section was written before P1 and P2 existed, and six P1 deviations plus seven P2 deviations moved work across phase boundaries in both directions.

A developer should be able to implement Phase 3 from this document alone, in the order given in §23, without re-reading the main plan to decide *what* to build — only to confirm *why* a decision binds (D-1…D-24).

### 0.2 Reference documents reviewed

| Document | Lines | Why it was read |
|---|---|---|
| `public/md_pdf-generation/implementation_plan.md` | 1001 | Module source of truth: D-1…D-24, EC-1…EC-46, §11 phase split, §9 route allocation, §13 org settings |
| `public/md_pdf-generation/phases/phase1_implementation_plan.md` | 1881 | Completed P1 + its six deviations (§1.4) that push work into P3 |
| `public/md_pdf-generation/phases/phase2_implementation_plan.md` | 2222 | Completed P2 + its seven deviations, §22.6 (EC-19 handed to P3), §34.2 open decisions OD-P2-2 / OD-P2-5 |
| `public/md_payrolls/phases/phase2_implementation_plan.md` | 560 | Planning methodology: pre-flight checks, migration-section shape, settings-registry numbering |
| `public/md_payrolls/phases/phase3_implementation_plan.md` | 690 | Planning methodology: in/out-of-scope boundary, per-endpoint responsibility tables, build order |
| `public/md_leave/md_phases/phase2_implementation_plan.md` | 87 | Depth calibration for a small phase |
| `public/md_leave/md_phases/phase3_implementation_plan.md` | 148 | Edge-case-first section ordering |
| On-disk code | — | `src/common/services/pdf_render.service.js`, `src/common/repositories/pdf_render_artifact.repository.js`, `src/modules/document/{letter-templates,services,repositories,utils}`, `src/modules/payroll/{controllers,services,repositories,models,utils/pdf}`, `src/cron-jobs/`, migrations `00055`/`00056`, `tests/unit/pdf/helpers/lint_template.js` |

### 0.3 Verified baseline

`npm test` on the current `development` HEAD (`05f3161`): **182 test files, 2069 tests, 2069 pass, 0 fail, exit 0**. Phase 3 must end green on a superset of this. Every statement in this document about *existing* code was read off disk, not inferred.

### 0.4 Phase 3 deliverables

| # | Deliverable | Path |
|---|---|---|
| 1 | This implementation plan | `public/md_pdf-generation/phases/phase3_implementation_plan.md` |
| 2 | API analysis companion | `public/md_pdf-generation/phases/phase3_api_analysis.md` |
| 3 | Business walkthrough companion | `public/md_pdf-generation/phases/phase3_business_walkthrough.md` |
| 4 | Frontend change record (§26.4) | `public/md_updates/pdf_generation_phase3_payroll_render_2026_xx_xx.md` |
| 5 | Registry updates | `public/md_system/api_registry.md`, `org_settings_registry.md`, `migration_registry.md`, `cron_registry.md` |
| 6 | Completion report | `public/md_pdf-generation/phases/phase3_completion_report.md` |
| 7 | Migration hand-back note | in the completion report, per §25.2 |

---

## 1. Goal & Boundary

### 1.1 Goal

Move payroll's three employee-facing documents from in-process PDFKit drawing to the Phase 1/2 HTML→PDF pipeline, **behind a per-org engine flag that defaults to the existing behaviour**, and give payroll the two things letters did not need: a **durable cache of rendered bytes** keyed to an immutable payslip, and a **background render queue** so that a 3 000-employee ZIP is not 3 000 synchronous Lambda calls (D-9).

Nothing an employee, manager or HR user can see changes. Every payroll PDF endpoint keeps its path, parameters, authorization and response shape. The single exception is documented in §1.4 C-10 and §26.

### 1.2 Explicitly in scope

1. Migration `00057` — `pdf_render_jobs` table + four `payroll_settings` columns (org settings **#87–#90**).
2. A payroll template registry and three A4 templates: `payslip/v1.html`, `annual_statement/v1.html`, `form16_part_b/v1.html`, with `_partials` shared through the promoted loader.
3. Three pure view builders: `buildPayslipView`, `buildAnnualStatementView`, `buildForm16View`.
4. `payroll_pdf.service.js` — the one and only place in payroll that branches `pdfkit | html` (D-24).
5. Artifact cache reads: a new `findReadyBySource` repository method, cache-hit byte serving from S3, cache-miss inline render + persist.
6. `pdf_render_jobs` queue: repository (claim/complete/fail via `FOR UPDATE SKIP LOCKED`), worker service, cron, the HR drain endpoint **#219** and its poll target **#220**.
7. Warm-up enqueue at payslip publish — both the auto-publish path and the explicit `#171` release.
8. Bulk ZIP `#174` served from cache, with the inline-miss threshold and a `202` queued response when the engine is `html` and the cohort is cold.
9. `pdf_cache_purge.cron.js` — retention purge for **`cache`-class** artifacts only.
10. **EC-19 / OD-P2-2**: object-loss handling — self-repair for `cache` class, report-only detection for `record` class, added to the **existing** `pdf_artifact_sweeper`.
11. A dependency-free **field-level parity harness** between the PDFKit and HTML engines (D-19; OD-7 resolved as field-level).
12. Docs and registry updates per §0.4.

### 1.3 Explicitly NOT in scope (do not build)

| Not in scope | Why |
|---|---|
| Report-family templates (`#177`–`#180`) | Main plan §11 lists exactly three P3 templates. Reports are landscape grids with no immutable cacheable source. Deferred — §30 OD-P3-5. |
| `POST /documents/hr/jobs/pdf-render/run` (main plan's `#147`) | §1.4 C-2: Phase 3 has no document-plane queue producer. Moves to Phase 4 with bulk letters. |
| Bulk letter generation, letter batches | Phase 4. |
| `record`-class retention/purge and the acknowledgement-obligation exclusion | Phase 5 (D-23). Phase 3 purges only what Phase 3 creates. |
| Removing PDFKit | D-8: PDFKit is retained for the whole parity window and remains the default engine after Phase 3. Removal is a post-Phase-5 decision. |
| Changing payslip / annual-statement / Form 16 **content** | Parity means the HTML output prints the same fields with the same values. Content changes are payroll work, not PDF-module work. |
| New dependencies of any kind | D-19. The parity harness, the ZIP path and the queue are built on Node builtins and existing utilities. |
| Renderer authentication hardening (D-14) | Still the module's release blocker, owned by ops. Phase 3 must not be *enabled* in production before it lands (§27). |
| Any database execution | Standing constraint: migrations are authored and handed back. Phase 3 runs no `db:migrate` and opens no connection to the remote database. |

### 1.4 Contradictions found and resolved

The main plan, P1 and P2 disagree in twelve places. Each is resolved **in favour of the architecture that actually shipped**, preserving the original business intent.

**C-1 — The endpoint numbers in the main plan's Phase 3 scope are wrong.**
Main plan §11 names "`#173` single payslip PDF, `#174` bulk ZIP, `#191` self payslip". On disk `#173` is *payslip reissue*; the HR single-payslip PDF is **`#170`**. The complete set of payroll endpoints that emit PDF bytes is:

| # | Method & path | Plane | Document |
|---|---|---|---|
| 170 | `GET /payroll/hr/runs/:runId/payslips/:userId/pdf` | HR | payslip |
| 174 | `GET /payroll/hr/runs/:runId/payslips/download` | HR | payslip ZIP |
| 184 | `GET /payroll/hr/employees/:userId/annual-statement/pdf` | HR | annual statement |
| 185 | `GET /payroll/hr/employees/:userId/form16/pdf` | HR | Form 16 Part B |
| 186 | `GET /payroll/manager/payslips/:runId/:userId/pdf` | Manager | payslip |
| 191 | `GET /payroll/me/payslips/:runId/pdf` | Self | payslip |
| 193 | `GET /payroll/me/annual-statement/pdf` | Self | annual statement |
| 194 | `GET /payroll/me/form16/pdf` | Self | Form 16 Part B |

**Resolution:** Phase 3 routes all eight through the facade. The main plan's three-endpoint list is illustrative, not exhaustive; shipping only three would leave five endpoints on PDFKit while the org flag says `html` — exactly the mixed-engine state EC-35 forbids.

**C-2 — `#147` cannot be allocated in Phase 3.**
Main plan §9.1 assigns `#147 POST /documents/hr/jobs/pdf-render/run` to Phase 3. The documents API registry high-water mark is **`#142`**, so `#147` would open an unexplained gap; and Phase 3 has **no document-plane producer** — nothing in Phase 3 enqueues a letter job, so the endpoint would drain a permanently empty queue.
**Resolution:** Phase 3 ships the payroll drain endpoint **`#219`** only. The document-plane drain endpoint is deferred to Phase 4 (bulk letters) and will take the next free documents number at that time. Recorded as deviation DV-1.

**C-3 — `pdf_render_jobs` migration ownership.**
Main plan §7 puts the jobs table in the Phase 1 migration. P1 §1.4(1) explicitly deferred it: `00055` created only `pdf_render_artifacts`, `pdf_branding_profiles`, `pdf_template_configs` and two `document_settings` columns.
**Resolution:** Phase 3 writes **`00057-create-pdf-render-jobs.js`** (`00056` is Phase 2's).

**C-4 — Payroll settings migration ownership.**
The same P1 deviation deferred the four `payroll_settings` knobs to "P3's migration".
**Resolution:** the four columns ship inside `00057` and are registered as org settings **#87–#90** (registry high-water is `#86`).

**C-5 — A held payslip has no immutable pinned date, and the artifact table permits only one live artifact per source. (The sharpest finding.)**
`payslips.published_at` is `NULL` until release. `payslip_read.service.hrResolveForRender` pins `published_at || run.approved_at`, so a held payslip's PDF carries `approved_at` today and `published_at` after `#171` — *a different document date for the same payslip id*. The partial unique index `(org_id, source_type, source_id) WHERE source_id IS NOT NULL AND status <> 'failed'` allows exactly one live artifact per payslip, so caching the held render would (a) collide with the post-release render and (b) serve a stale pinned date forever.
**Resolution — the cacheability rule (§8.2):** an artifact is created for a payslip **only when `visible_to_employee = true` AND `published_at IS NOT NULL`**, at which point the pinned date is immutable (`payslipRepo.publishRun`'s `WHERE … visible_to_employee = false` makes `published_at` write-once). A **held** payslip is rendered by **PDFKit regardless of the org engine flag** and is never persisted. This preserves today's behaviour exactly for the review-before-release workflow, keeps the cache keyed to immutable input, and avoids both alternative failure modes — a Lambda storm on a 3 000-row held ZIP, or refusing a download HR can perform today. Accepted consequence in §30 OD-P3-1.

**C-6 — EC-19 object loss was deferred out of Phase 2 into Phase 3.**
P2 §22.6: "A Phase 3 entry, not a Phase 2 checkbox: a scheduled `HeadObject` sweep over `ready` record artifacts, reporting mismatches for repair." OD-P2-2 confirms it.
**Resolution:** Phase 3 owns it, in two halves — see C-11 for why the halves differ.

**C-7 — Ephemeral payslips have no `source_id`.**
`payslip_read.service.resolveForRender` can return `{ persisted: false, payslip_id: null }` for a run approved before payslip rows existed (via `payslipService.composeEphemeral`).
**Resolution:** an ephemeral snapshot is rendered inline with `sourceId = null`, `persist = false`, `retentionClass = 'cache'`, and is never enqueued. Cacheability requires a durable row (§8.2).

**C-8 — Purge cron ownership.**
Main plan §11 lists `pdf_cache_purge.cron.js` under Phase 3; D-23 and §11's Phase 5 line say "retention and purge for both classes".
**Resolution:** Phase 3 owns **`cache`-class** purge — it is the first phase that creates cache-class objects at rest. Phase 5 keeps `record`-class retention including the acknowledgement-obligation exclusion, and may fold the two crons together then.

**C-9 — "Field-level parity" with zero new dependencies.**
OD-7 resolved parity as field-level, but D-19 forbids a PDF-parsing dependency.
**Resolution (§21):** PDFKit text is extracted by inflating the content streams with Node's builtin `zlib` and reading the text-showing operators; the HTML side is asserted against the view model the template provably consumes (lint rule 5 already proves every declared field is used and every used field is declared). The residual risk — HTML *layout* correctness — is discharged by the once-per-template manual visual check required in §24.6, not by a unit test. Stated as a limit, not hidden.

**C-10 — `#174` "contract does not change" vs. the `202` queued response.**
Main plan §9.2 says the payslip endpoints "keep their paths, parameters and response shapes. Their contract does not change"; D-9 / §8.3 say a cold bulk request returns `202 { batch_id }`.
**Resolution:** both are true under different flags, and the difference must be published. With `pdf_render_engine = 'pdfkit'` — the default, and the state of every org on the day Phase 3 ships — `#174` is exactly the endpoint it is today. With `pdf_render_engine = 'html'`, a cohort whose uncached count exceeds `pdf_bulk_inline_miss_threshold` returns `202` with a poll target instead of a ZIP. That is a frontend-visible change, so it gets an `md_updates` record (§26.4) and is reachable only for an org that opted into the flag.

**C-11 — EC-19's "compare `content_hash`, never substitute" is unimplementable for the HTML engine.**
EC-19 assumes a re-render reproduces identical bytes. D-16 says the opposite for Chromium: determinism is *recorded, not assumed*.
**Resolution:** the rule splits by retention class.
- `cache` class (payroll, this phase): a missing object is **repaired** — re-render from the frozen `payslips.snapshot`, overwrite the object at the same key, and **update** `content_hash`, `size_bytes`, `render_ms`, `attempt_count`. Permitted precisely because a cache artifact is regenerable and is not a document of record. Every repair emits a `WARN` with the artifact id.
- `record` class (letters, Phase 2): the sweep **only reports**. No re-render, no substitution, no row mutation. A letter is evidence; a regenerated letter is not the same letter.
This qualifies the main plan's §10 immutability rule, which must henceforth be read as "immutable for `record` class".

**C-12 — Where does the jobs model live?**
`pdf_render_artifacts.model.js` sits in `src/modules/document/models/`, but P1 deviation 6 moved the render *service* to `src/common/services/` precisely so payroll never requires from `modules/document`.
**Resolution:** the model file follows its sibling into `src/modules/document/models/pdf_render_jobs.model.js` (models are loaded globally by `models.index`, so this creates no require edge), while the **repository** goes to `src/common/repositories/pdf_render_job.repository.js` beside the artifact repository. Payroll requires only from `src/common/`.

### 1.5 Planned deviations from the main plan

| ID | Deviation | Reason |
|---|---|---|
| DV-1 | `#147` not shipped; only `#219` (+ `#220`) | C-2 — no Phase 3 document-plane producer |
| DV-2 | One endpoint beyond the main plan: `#220 GET /payroll/hr/runs/:runId/payslips/render-status` | A `202` with no poll target is not implementable by a client. Minimal, read-only. |
| DV-3 | Held payslips fall back to PDFKit even when the engine is `html` | C-5 |
| DV-4 | `cache`-class artifacts may have `content_hash` rewritten by a repair | C-11 |
| DV-5 | Payroll artifacts store a **reference stub** in `input_snapshot`, not the view model | §8.5 — the reproducibility record already exists in `payslips.snapshot`; duplicating it doubles salary PII at rest for no gain (D-17: minimise PII) |
| DV-6 | `pdf_cache_purge` narrowed to `cache` class | C-8 |
| DV-7 | EC-19 detection added to the existing `pdf_artifact_sweeper` rather than a new cron | Reuse over creation; the sweeper already owns the only cross-org escape hatch and already runs daily at 03:50 IST |

---

## 2. Pre-Flight Checks (do these before writing code)

Run each and record the answer in the completion report. Every one is a `grep` or a file read — none touches the database.

| # | Check | Expected | Why it matters |
|---|---|---|---|
| P-1 | `npm test` on a clean tree | 182 files / 2069 pass / 0 fail | The baseline every later step is compared against |
| P-2 | `ls src/infrastructure/postgres-sql/migrations/ \| tail -3` | highest is `00056` | Confirms `00057` is free |
| P-3 | Last payroll row in `public/md_system/api_registry.md` | `#218` | Confirms `#219`/`#220` are free |
| P-4 | Org settings registry high-water | `#86` | Confirms `#87`–`#90` are free |
| P-5 | `grep -rn "pdf_render_jobs" src/` | no hits | Confirms the table genuinely does not exist yet |
| P-6 | `grep -rn "findForRenderById\|findBySource" src/` | `findForRenderById` defined with **0 callers**; `findBySource` absent | Confirms §6.2's repository tasks |
| P-7 | `grep -n "engine:" src/common/services/pdf_render.service.js` | hardcoded `'html'` | Confirms §8.1 must parameterise it |
| P-8 | Read `RESERVED_ROOTS` and rule 10 in `tests/unit/pdf/helpers/lint_template.js` | letter-specific | Confirms §7.3's audience option |
| P-9 | `grep -n "creationDate" src/modules/payroll/utils/pdf/pdf_layout.utils.js` | throws unless a valid `Date` | Confirms the pinned-date contract the HTML path must match |
| P-10 | D-14 renderer-auth status | still open | If open, Phase 3 may merge but must not be enabled in production (§27) |

---

## 3. Inherited State — what exists, what is partial, what is dead

### 3.1 DONE in Phase 1 — do not re-plan

| Component | Path | Phase 3 relationship |
|---|---|---|
| `pdf_render_artifacts` table, enums, indexes, CHECKs | migration `00055` | **Used as-is. No schema change.** |
| `pdf_branding_profiles`, `pdf_template_configs` | `00055` | Untouched (payroll templates are self-contained, §7.7) |
| `document_settings` PDF columns | `00055` | Untouched |
| `pdf_render.service.js` pipeline: probe → pending → render → S3 → `markReady`, failure salt, `%PDF-`/`%%EOF` verification, size caps, 2-attempt retry policy | `src/common/services/` | **Extended** (§8.1): one new `engine` parameter and one cache-aware entry point. No behavioural change for existing callers. |
| `pdf_render_artifact.repository.js` with `SAFE_ATTRIBUTES` containment | `src/common/repositories/` | **Extended** (§6.2) with six methods |
| Renderer HTTP client, timeouts, retry classification | P1 | Used unchanged |
| `pdf_format.utils.js` (`EMPTY`, `formatMoney`, `text`) promoted to `src/common/utilities/` | P1, D-4 done | **The parity anchor**: both engines already format money through one function |
| Template lint harness (10 rules) | `tests/unit/pdf/helpers/lint_template.js` | **Extended** (§7.3), not forked |
| `pdf_artifact_sweeper.cron.js` (stale pending, 03:50 IST) | `src/cron-jobs/` | **Extended** (§12.2) with the EC-19 verification pass |
| Preview endpoint streaming bytes with no S3 object | P1 deviation 3 | Unchanged |

### 3.2 DONE in Phase 2 — do not re-plan

| Component | Phase 3 relationship |
|---|---|
| Ten seeded letter document types, letter registry, `document_letter.service.js` issuance/reissue | Untouched. Read as the **reference implementation** of a `renderAndRecord` caller (§8.3). |
| `record`-class persistence: S3 `putObject`, key `org/{orgId}/pdf/{sourceType}/{artifactId}.pdf` | Key builder reused verbatim for payroll |
| `loadStoredBytes` (returns `null` when the object is gone) | **The EC-19 trigger point** (§8.6) |
| `inputSnapshot` redaction parameter | Reused with a payroll-specific stub (DV-5) |
| Migration `00056`; seeders through `010` | Untouched |
| Uniform-denial semantics on letter download | Pattern retained; payroll keeps its own EC-24 uniform `403 PAYSLIP_NOT_ACCESSIBLE` |

### 3.3 Partially implemented — Phase 3 completes

| Item | State after P2 | Phase 3 completes it by |
|---|---|---|
| `pdf_render_artifacts.engine` column | Exists; every row is `'html'` because the service hardcodes it | Parameterising `engine`. Note: PDFKit renders are **never persisted** in Phase 3, so the column needs no back-fill to stay meaningful. |
| `findForRenderById` | Defined, zero callers | The EC-19 repair path calls it (§8.6) |
| `pdf_render_jobs` | Designed in the main plan, never created | Migration `00057` (§5.1) |
| Four `payroll_settings` knobs | Designed, never created | Migration `00057` (§5.2) + service/validator exposure |
| Cache-hit serving | `loadStoredBytes` exists; nothing looks an artifact up **by source** | `findReadyBySource` (§6.2) |
| EC-19 | Proven impossible in P2, handed forward | §8.6 + §12.2 |
| Engine parity | Not started | §21 |

### 3.4 No longer applicable — and why

| Main-plan Phase 3 item | Verdict | Reason |
|---|---|---|
| "Create `pdf_render_jobs` in the Phase 1 migration, use it in Phase 3" | Rewritten | P1 deferred creation; Phase 3 creates *and* uses it (C-3) |
| `#147 /documents/hr/jobs/pdf-render/run` | Dropped from Phase 3 | C-2 / DV-1 |
| "`#173` single payslip PDF" | Renumbered | `#173` is reissue; the endpoint is `#170` (C-1) |
| "Cache-hit serving for all payslip renders" | Narrowed | Only released payslips are cacheable (C-5) |
| "EC-19: compare `content_hash`; mismatch ⇒ hard error" | Split by retention class | C-11 |
| "`pdf_cache_purge.cron.js` purges per `pdf_cache_retention_days`" | Narrowed to `cache` class | C-8 |
| Branding-profile integration for payslips | Not applicable in Phase 3 | `pdf_layout.drawHeader` draws **no logo** (verified). Parity therefore needs no asset handshake; adding a logo would be a content change (§1.3). `snapshot.employer.logo_url` stays unused, as today. |

### 3.5 Components to EXTEND, never duplicate

This table is the anti-duplication contract. A Phase 3 PR that creates a parallel version of anything on the left must be rejected.

| Existing component | Phase 3 extension | Forbidden alternative |
|---|---|---|
| `src/common/services/pdf_render.service.js` | `engine` param + `renderForSource` entry point | a payroll-local render pipeline |
| `src/common/repositories/pdf_render_artifact.repository.js` | six methods; `SAFE_ATTRIBUTES` unchanged | direct `PdfRenderArtifact.findOne` from payroll |
| `src/modules/document/utils/template_loader.utils.js` | **promote** to `src/common/utilities/template_loader.utils.js` with roots injected; document module re-exports | a copy-pasted loader in payroll |
| `tests/unit/pdf/helpers/lint_template.js` | an `audience` option; letter rules stay default-on | a second lint file |
| `document_notification.repository.claimBatch` | **copy the SQL shape** into the jobs repository | a bespoke poll, or `SELECT`-then-`UPDATE` without `SKIP LOCKED` |
| `src/cron-jobs/pdf_artifact_sweeper.cron.js` | add the EC-19 verification pass | a new `pdf_object_verify.cron.js` |
| `payroll_automation.service.js` (`_forEachOrg`, `runStartupCatchUp`) | add `runPayslipRender({ orgId })` | a new automation service |
| `payroll/controllers/helpers/download.helper.js` (`sendBuffer`, `streamChunks`) | used unchanged by every PDF endpoint | ad-hoc `res.write` in the facade |
| `payroll/utils/zip_writer.utils.js` | used unchanged; entries now come from cache or S3 | a second ZIP implementation |
| `src/common/utilities/pdf_format.utils.js` | used by both engines | a template-local money filter |
| `payroll/utils/pdf/*.utils.js` (PDFKit) | left **untouched**; still the default engine | deleting or rewriting them |

---

## 4. Directory Structure

### 4.1 New files

```
src/infrastructure/postgres-sql/migrations/
  00057-create-pdf-render-jobs.js                  § 5

src/modules/document/models/
  pdf_render_jobs.model.js                         § 6.1   (C-12: model beside its sibling)

src/common/repositories/
  pdf_render_job.repository.js                     § 6.3

src/common/utilities/
  template_loader.utils.js                         § 7.2   (promoted from modules/document)

src/common/services/
  pdf_render_worker.service.js                     § 10.3  (engine-agnostic claim loop)

src/modules/payroll/pdf-templates/
  registry.js                                      § 7.1
  payslip/v1.html                                  § 7.4
  annual_statement/v1.html                         § 7.5
  form16_part_b/v1.html                            § 7.6
  _partials/head.html                              § 7.7
  _partials/page-frame.html                        § 7.7
  _partials/money-table.html                       § 7.7

src/modules/payroll/utils/pdf/views/
  payslip_view.utils.js           buildPayslipView(snapshot, publishedAt)           § 7.4
  annual_statement_view.utils.js  buildAnnualStatementView(dataset, pinnedDate)     § 7.5
  form16_view.utils.js            buildForm16View(dataset, employee, pinnedDate)    § 7.6

src/modules/payroll/services/
  payroll_pdf.service.js                           § 8      (the single engine branch, D-24)

src/cron-jobs/
  pdf_render_worker.cron.js                        § 10.4
  pdf_cache_purge.cron.js                          § 12.1
```

### 4.2 Extended files (additive only)

| File | Change |
|---|---|
| `src/common/services/pdf_render.service.js` | `engine` parameter (default `'html'`); `renderForSource()` cache-aware entry point; repair path |
| `src/common/repositories/pdf_render_artifact.repository.js` | `findReadyBySource`, `findReadyBySourceIds`, `findPurgeCandidates`, `findReadyRecordsForVerification`, `markPurged`, `repairReady` |
| `src/modules/document/utils/template_loader.utils.js` | becomes a thin re-export bound to the letter roots |
| `src/modules/document/services/document_automation.service.js` | `runArtifactVerification({ orgId })` — the `record`-class report pass |
| `src/cron-jobs/pdf_artifact_sweeper.cron.js` | calls the verification pass after the stale-pending pass |
| `src/modules/payroll/models/payroll_settings.model.js` | four columns |
| `src/modules/payroll/validators/payroll_hr.validator.js` | four keys on the settings patch schema |
| `src/modules/payroll/services/payroll_settings.service.js` | `pdf_render_engine` transition guard (§9.4) |
| `src/modules/payroll/services/payslip.service.js` | enqueue hook in `createForApproval` (auto-publish) and in `publish` |
| `src/modules/payroll/services/payroll_automation.service.js` | `runPayslipRender({ orgId })` |
| `src/modules/payroll/controllers/payroll_hr.controller.js` | `#170`, `#174`, `#184`, `#185` through the facade; `#219`, `#220` handlers |
| `src/modules/payroll/controllers/payroll_manager.controller.js` | `#186` through the facade |
| `src/modules/payroll/controllers/payroll_self.controller.js` | `#191`, `#193`, `#194` through the facade |
| `src/modules/payroll/routes/payroll_hr.routes.js` | `#219`, `#220` |
| `src/server.js` | register two crons |
| `tests/unit/pdf/helpers/lint_template.js` | `audience` option |

---

## 5. Database — Migration `00057-create-pdf-render-jobs.js`

One migration, one transaction, authored by Phase 3 and **handed back to the operator unrun** (§25.2).

### 5.1 `pdf_render_jobs`

The claim-based queue. Its job is to hold *intent to render*, never bytes.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | no | `UUIDV4` | PK |
| `org_id` | UUID | no | — | FK `organizations.id`, `ON DELETE CASCADE`. Every query is org-scoped. |
| `source_type` | enum `enum_pdf_render_jobs_source_type` | no | — | Same label set as `pdf_render_artifacts.source_type`: `preview, letter, payslip, form16, annual_statement, report`. Phase 3 only ever writes `payslip`. |
| `source_id` | UUID | yes | — | `payslips.id` for a payslip job. Nullable so Phase 4 can enqueue sourceless work; a Phase 3 job with a NULL `source_id` is invalid and is rejected by the enqueue validator. |
| `batch_id` | UUID | no | — | Groups one enqueue action. `#220` counts progress by it; `#174`'s `202` returns it. |
| `template_code` | VARCHAR(64) | no | — | e.g. `payslip` |
| `template_version` | INTEGER | no | — | Pinned at enqueue so a mid-flight registry bump cannot change what a queued job renders (EC-P3-5) |
| `engine` | enum `enum_pdf_render_jobs_engine` | no | `'html'` | Same labels as the artifact table. A `pdfkit` job is never enqueued in Phase 3 (§8.2). |
| `status` | enum `enum_pdf_render_jobs_status` | no | `'queued'` | `queued, claimed, done, failed, cancelled` |
| `priority` | SMALLINT | no | `100` | Lower runs first. Warm-up = `100`; an HR-triggered drain for one run enqueues at `50`. |
| `scheduled_for` | TIMESTAMPTZ | no | `NOW()` | Claim filter `scheduled_for <= now`; a retry pushes it forward (§15.3) |
| `attempts` | INTEGER | no | `0` | Incremented **by the claim**, exactly as `document_notifications` does |
| `max_attempts` | INTEGER | no | `3` | Per-row cap so one poison snapshot cannot loop |
| `claimed_at` | TIMESTAMPTZ | yes | — | Stale-claim reclaim compares against this |
| `claimed_by` | VARCHAR(64) | yes | — | `hostname:pid` of the worker; diagnostic only, never a correctness input |
| `artifact_id` | UUID | yes | — | FK `pdf_render_artifacts.id` `ON DELETE SET NULL`. Set when the job completes. |
| `failure_code` | VARCHAR(64) | yes | — | Mirrors the artifact failure taxonomy |
| `failure_reason` | TEXT | yes | — | Truncated to 500 chars by the worker, as P1 does for artifacts |
| `finished_at` | TIMESTAMPTZ | yes | — | Set on `done` / `failed` / `cancelled` |
| `created_by` | UUID | yes | — | Actor for an HR-triggered enqueue; NULL for an automatic warm-up |
| `created_at` / `updated_at` | TIMESTAMPTZ | no | `NOW()` | |

**Indexes and constraints**

| Name | Definition | Purpose |
|---|---|---|
| `pdf_render_jobs_claim_idx` | `(org_id, priority, scheduled_for) WHERE status IN ('queued','claimed')` | The only index the claim query needs; partial, so completed rows stop bloating it |
| `pdf_render_jobs_live_source_uq` | `UNIQUE (org_id, source_type, source_id) WHERE source_id IS NOT NULL AND status IN ('queued','claimed')` | Makes every enqueue `ON CONFLICT DO NOTHING`-idempotent: a payslip can have at most one live job, so a double publish, a cron catch-up and an HR drain cannot stack three renders of the same document |
| `pdf_render_jobs_batch_idx` | `(org_id, batch_id)` | `#220` progress counting |
| `pdf_render_jobs_source_idx` | `(org_id, source_type, source_id)` | History lookups, and the purge's job cleanup |
| `pdf_render_jobs_terminal_chk` | `CHECK (status IN ('queued','claimed') OR finished_at IS NOT NULL)` | A terminal row always records when it ended |
| `pdf_render_jobs_done_chk` | `CHECK (status <> 'done' OR artifact_id IS NOT NULL)` | A completed job always points at the artifact it produced |

**DV-8 — the main plan's `UNIQUE (org_id, source_type, source_id, batch_id)` is not shipped.** It is status-independent, so it would raise an unabsorbable `23505` when a payslip legitimately needs re-enqueueing in a later batch (for example after a cache purge), and for payroll it never fires because every enqueue action mints a fresh `batch_id`. Batch-scoped uniqueness becomes meaningful in Phase 4, where a batch is the unit of work; it is deferred to Phase 4's migration.

### 5.2 `payroll_settings` additions — org settings registry **#87–#90**

| # | Column | Type | Null | Default | CHECK | Meaning |
|---|---|---|---|---|---|---|
| 87 | `pdf_render_engine` | enum `enum_payroll_settings_pdf_render_engine` (`pdfkit`, `html`) | no | `'pdfkit'` | — | Which engine renders this org's payroll PDFs. The default reproduces today's behaviour exactly (D-8). |
| 88 | `payslip_prerender_on_publish` | BOOLEAN | no | `true` | — | Enqueue warm-up jobs when payslips become visible. Consulted only when the engine is `html`. |
| 89 | `pdf_bulk_inline_miss_threshold` | INTEGER | no | `50` | `BETWEEN 1 AND 500` | How many uncached payslips one `#174` request will render inline before returning `202` |
| 90 | `pdf_cache_retention_days` | INTEGER | no | `400` | `BETWEEN 30 AND 3650` | Age at which a `cache`-class artifact's object is purged. 400 ≈ 13 months, so a full financial year plus a month of grace survives. |

All four live in `payroll_settings` — the org's payroll singleton — not in `document_settings`, because they configure payroll behaviour and are read by payroll code. `getOrCreate` already materialises the row lazily, so no backfill is needed.

### 5.3 What does **not** change

- **`pdf_render_artifacts` is untouched.** No new column, no new index, no enum change. The cache lookup rides the existing partial unique index `(org_id, source_type, source_id) WHERE source_id IS NOT NULL AND status <> 'failed'`, which is precisely the access path `findReadyBySource` needs.
- **`payslips` is untouched.** No `artifact_id` column. The artifact points at the payslip, never the reverse: a payslip must not acquire a nullable pointer to a regenerable cache row, and adding one would put a write into the publish transaction that does not need to be there.
- **No new enum labels anywhere.** `source_type` already carries `payslip`, `form16` and `annual_statement` from P1.

Because Sequelize names enum types `enum_<table>_<column>`, the jobs table gets its own `source_type` and `engine` types rather than sharing the artifact table's. A unit test must assert the two label sets are identical, so the pair cannot drift.

### 5.4 Migration hygiene

1. A single `queryInterface.sequelize.transaction`; every statement inside it.
2. Column and index creation guarded so a partially applied migration can be re-run — `IF NOT EXISTS` on indexes, `describeTable` before `addColumn`, the pattern `00055` already uses.
3. Adding a `NOT NULL` column with a constant default is metadata-only on PostgreSQL 11+, so the four `payroll_settings` columns do not rewrite the table. Note this in the hand-back so an instant migration is not mistaken for a no-op.
4. `down()` drops `pdf_render_jobs`, the four columns and the five enum types. **This `down()` is safe** — unlike `00055`'s, it destroys only queue state and configuration, never render evidence. Say so explicitly in the hand-back so the operator can tell the two apart.
5. No data migration, no backfill, no `UPDATE`.
6. Registered in `public/md_system/migration_registry.md` as `00057`, with the safe-`down()` note.

---

## 6. Models & Repositories

### 6.1 `src/modules/document/models/pdf_render_jobs.model.js`

A plain Sequelize definition mirroring §5.1: `tableName: 'pdf_render_jobs'`, `underscored: true`, `timestamps: true`. No `defaultScope` — P1 established that a `defaultScope` is silently bypassed by `raw: true` and by any explicit attribute list. No associations are declared; `artifact_id` is joined explicitly where needed.

### 6.2 `pdf_render_artifact.repository.js` — six additions

`SAFE_ATTRIBUTES` is unchanged. Two of the six read `storage_key` and must be named so they stay greppable, following P1's escape-hatch convention.

| Method | Reads the key? | Purpose |
|---|---|---|
| `findReadyBySource(orgId, sourceType, sourceId, { transaction })` | no (`SAFE_ATTRIBUTES`) | The cache probe. `WHERE org_id, source_type, source_id, status = 'ready'`. Returns at most one row by the existing partial unique index. A caller that then needs bytes passes `row.id` to `loadStoredBytes`. |
| `findReadyBySourceIds(orgId, sourceType, sourceIds[], { transaction })` | no | The batched form for `#174` and `#220`: one query for up to `ZIP_MAX_ENTRIES` ids returning `{ source_id, id, size_bytes, content_hash }`, so a 3 000-row cohort costs one round trip instead of 3 000. |
| `findPurgeCandidates({ orgId = null, olderThan, limit = 500 })` | **yes** (escape hatch) | Cache purge (§12.1). `WHERE retention_class = 'cache' AND status = 'ready' AND object_purged_at IS NULL AND created_at < :olderThan`, oldest-first, bounded. Cron-only; cross-org when `orgId` is null, carrying the same containment note as `findStalePendingForSweep`. |
| `findReadyRecordsForVerification({ orgId = null, limit = 200, afterId = null })` | **yes** (escape hatch) | EC-19 `record`-class verification (§12.2). Keyset-paginated by `id` so successive daily runs advance through the table. Cron-only. |
| `markPurged(id, orgId, { at }, transaction)` | no | Sets `object_purged_at` and `status = 'purged'`, conditional on `status = 'ready'` in the `WHERE`, so a concurrent repair cannot be clobbered. |
| `repairReady(id, orgId, { contentHash, sizeBytes, renderMs, pageCount }, transaction)` | no | DV-4: the **only** method permitted to rewrite a `ready` artifact's hash, and only for `retention_class = 'cache'`. Increments `attempt_count`. |

`repairReady`'s `WHERE` clause, stated explicitly because it is the guard that keeps letters immutable:

```
WHERE id = :id AND org_id = :orgId AND status = 'ready' AND retention_class = 'cache'
```

The class predicate is in SQL, not in JavaScript, so no caller can bypass it. A test must assert that `repairReady` against a `record`-class artifact changes zero rows and returns `null`.

### 6.3 `src/common/repositories/pdf_render_job.repository.js`

Modelled directly on `document_notification.repository.js` — the codebase's proven claim queue.

| Method | Contract |
|---|---|
| `enqueueMany(orgId, rows, transaction)` | Set-based `INSERT … ON CONFLICT ON CONSTRAINT pdf_render_jobs_live_source_uq DO NOTHING`, returning the inserted count. Requires a transaction; it is always called inside a business transaction. |
| `enqueueForRun(orgId, runId, { batchId, templateCode, templateVersion, engine, priority, createdBy }, transaction)` | The warm-up primitive: one `INSERT … SELECT` from `payslips` `WHERE run_id = :runId AND org_id = :orgId AND status = 'active' AND visible_to_employee = true AND published_at IS NOT NULL`, with the same `ON CONFLICT DO NOTHING`. One statement, no id list crossing the process boundary — which matters because `payslipRepo.publishRun` returns a **count, not ids** (verified on disk). |
| `claimBatch(orgId, { now, staleMs, limit, workerToken, transaction })` | Requires a transaction. The `document_notifications` SQL shape verbatim: `UPDATE … SET status='claimed', attempts = attempts + 1, claimed_at = :now, claimed_by = :workerToken WHERE id IN (SELECT id FROM pdf_render_jobs WHERE org_id = :orgId AND scheduled_for <= :now AND (status='queued' OR (status='claimed' AND claimed_at < :now - :staleMs)) AND attempts < max_attempts ORDER BY priority, scheduled_for LIMIT :limit FOR UPDATE SKIP LOCKED) RETURNING *`. `attempts` is compared against the **column** `max_attempts`, not a parameter. |
| `markDone(id, orgId, { artifactId, at }, transaction)` | `status='done'`, `finished_at`, `artifact_id`; conditional on `status = 'claimed'`. Returns the changed count so a stale worker's late write is detected and logged rather than silently winning. |
| `recordFailure(id, orgId, { failureCode, failureReason, retryAt }, transaction)` | With a `retryAt` and `attempts < max_attempts`: back to `queued` with `scheduled_for = retryAt`. Otherwise `failed` + `finished_at`. Never throws on a missing row. |
| `cancelLiveForSource(orgId, sourceType, sourceId, { reason }, transaction)` | Marks live jobs for one source `cancelled`. Called when the source stops being renderable — a run cancel or a payslip revoke (§13.4). |
| `countByBatch(orgId, batchId)` | `{ queued, claimed, done, failed, cancelled }` for `#220`. |
| ~~`reclaimStale`~~ | **Deliberately absent.** Reclaim lives inside `claimBatch`'s predicate, exactly as `document_notifications` does it. A separate reclaim pass is a second code path that can disagree with the first. |

---

## 7. Templates, View Builders and the Loader

### 7.1 `src/modules/payroll/pdf-templates/registry.js`

Same *shape* as the letter registry, minus everything that is letter-specific. A payroll entry has **no** `document_type_code`, **no** `reference_token` and **no** `saved_field_schema`: payroll documents are not `org_documents`, they are not reference-numbered, and HR configures nothing about them (D-3 — HR configures data, not markup; in Phase 3 there is no payroll-side configurable field at all).

```js
{
  code: 'payslip',
  title: 'Salary Payslip',
  audience: 'payroll',            // drives the lint rule set (§7.3)
  source_type: 'payslip',         // artifact source_type
  retention_class: 'cache',       // D-23
  current_version: 1,
  required_fields: [...],         // outer view-model roots the template must consume
  optional_fields: [...],
  pdf_config: A4_CONFIG,          // A4 portrait, zero page margins, no header/footer
  sample_data: { ... }            // a complete view model; drives the lint and golden tests
}
```

Exports `{ list, get, has, ENTRIES }` and an `assertValidEntry` run at module load, mirroring the letter registry so a malformed entry fails at require time rather than at render time.

`A4_CONFIG` is declared locally and is byte-identical to the letter registry's (`format: 'A4'`, all four margins `'0mm'`, `displayHeaderFooter: false` — the template owns its own padding in CSS). It is **not** promoted to a shared constant: the two registries may legitimately diverge later. Instead, a test asserts the payroll config deep-equals the letter config, so accidental drift is caught while intentional divergence is a one-line test change.

Three entries: `payslip` (source_type `payslip`, cacheable), `annual_statement` (source_type `annual_statement`, `retention_class: 'cache'`, **never persisted** — §8.2), `form16_part_b` (source_type `form16`, cacheable only when the summary is finalised).

### 7.2 Promoting the template loader

`src/modules/document/utils/template_loader.utils.js` hardcodes `TEMPLATES_ROOT = letter-templates` and `PARTIALS_ROOT = _partials`. Payroll needs identical behaviour over a different root, so the loader is **promoted, not copied** (§3.5).

`src/common/utilities/template_loader.utils.js`:

```js
createLoader({ templatesRoot, partialsRoot }) -> { assembleTemplate(code, version), clearCache() }
```

Behaviour carried over verbatim — `<!--#include partial="x" -->` one-level substitution, a throw on any unresolved marker, a throw on a missing template file rather than a blank string, a module-level `Map` cache bypassed when `NODE_ENV === 'development'`. Two changes only: the roots are injected, and **each loader instance owns its own cache Map**, so `payslip` in the payroll root can never be served for `payslip` in the letter root.

`src/modules/document/utils/template_loader.utils.js` becomes a thin binding that re-exports exactly the names it exports today, bound to the letter roots. **No document-module caller changes, and no document-module test changes.** The existing loader tests (`assembles byte-identically to its golden fixture`, `cached outside development and cleared on demand`, `development bypasses the cache`, `an unresolved include marker throws`) must pass untouched — that is the acceptance criterion for the promotion.

### 7.3 Lint extension — one option, not a second linter

`tests/unit/pdf/helpers/lint_template.js` gains a third parameter: `lintTemplate(html, entry, { audience = 'letter' })`. The default preserves every current letter assertion.

| Rule | `audience: 'letter'` | `audience: 'payroll'` |
|---|---|---|
| 1–4 (no triple-stash, no external URL, no `<script>`, size ≤ 256 KB) | unchanged | unchanged |
| 5 (declared ⇄ used field bijection) | unchanged | unchanged — this is the rule that makes §21's parity argument sound |
| 6 (no `{{> partial}}`) | unchanged | unchanged |
| 7 (registered helpers only: `eq ne lt gt if unless each with log else`) | unchanged | unchanged |
| 8 (page-break guard present) | unchanged | unchanged |
| 9 (`pdf_config` has `format` and all four margins) | unchanged | unchanged |
| 10 (PREVIEW watermark block **and** version marker) | unchanged | **version marker only** — payroll templates have no preview surface in Phase 3, so requiring a watermark block would force dead markup |
| `RESERVED_ROOTS` | `branding, is_preview, issued_on_text, template_marker` | `pinned_date_text, template_marker` |

The existing `every registered template file passes the lint` test is extended to iterate both registries, passing the matching audience.

### 7.4 `payslip/v1.html` + `buildPayslipView(snapshot, publishedAt)`

**The builder is pure**: `(snapshot, publishedAt) -> viewModel`. No clock, no repository, no settings, no `Date.now()`. Same discipline as `payslip_pdf.utils.render`, which takes only `(snapshot, { creationDate })`.

All formatting happens in the builder (D-3: server-side formatting only). The template prints strings and iterates arrays; it never computes, sums, rounds or formats. Money goes through the already-shared `src/common/utilities/pdf_format.utils.js` `formatMoney`, which is what makes field-level parity provable rather than approximate.

View model:

| Key | Type | Source |
|---|---|---|
| `template_marker` | `'payslip/v1'` | constant (lint rule 10) |
| `pinned_date_text` | string | `publishedAt`, formatted exactly as `drawFooter` formats it today |
| `doc_title` | string | mirrors `createDocument`'s `title`: `Payslip {period_month} - {employee_code}` |
| `header` | `{ title: 'PAYSLIP', subtitle }` | `subtitle` includes `Revised (version N)` when `snapshot.payslip.version > 1` — same predicate as the PDFKit renderer |
| `employer` | `{ name, address_lines[] }` | `snapshot.employer`. `logo_url` is **not** consumed: the PDFKit header draws no logo (§3.4). |
| `identity_grid` | `[{ label, value }]` — 14 pairs | the exact 14 pairs `identityPairs(snapshot)` emits, in the same order, including the masked bank account `XXXX{last4}` **masked in the builder** |
| `earnings` | `{ rows: [{ code, name, amount_text }], total_text, total_label }` | `snapshot.earnings` + `figures.gross_earnings` |
| `deductions` | same shape | `snapshot.deductions` + `figures.total_deductions` |
| `reimbursements` | same shape or `null` | present only when the PDFKit renderer prints the section |
| `employer_contributions` | same shape or `null` | present only when the PDFKit renderer prints the section |
| `net_pay` | `{ label, amount_text }` | `figures.net_pay` |
| `notes` | `string[]` | `snapshot.notes` then `snapshot.warnings`, in the PDFKit order |
| `footer_text` | string | as `drawFooter` composes it |

**Implementation rule:** build this by walking `payslip_pdf.utils.js` section by section and emitting one view key per printed string. Where this table and the PDFKit renderer disagree, **the PDFKit renderer wins** and this table is wrong — it is a description of existing output, not a redesign of it. The parity test (§21) is the arbiter, and it must fail if a printed value exists on one side only.

`payslip/v1.html` renders exactly those keys: `_partials/head.html` for the `<style>` block, `_partials/page-frame.html` for the page container and the page-break guard, `_partials/money-table.html` for the four identical money tables. Self-contained CSS, no webfont, no external URL (D-18, lint rules 2 and 4).

### 7.5 `annual_statement/v1.html` + `buildAnnualStatementView(dataset, pinnedDate)`

`dataset` is exactly what `annual_statement_pdf.utils.render` consumes: `{ financial_year, employer{}, employee{}, months[12], earnings[], deductions[], employer_contributions[], totals{}, notes[] }`. **All twelve months are always emitted, zero-filled, never gapped** — preserved in the view model, because a missing month in a statement reads as a missing salary.

The twelve-month grid is a 13-column table. In PDFKit it is portrait A4 via `drawTable`; the HTML template must stay portrait to match, using a compact type scale rather than a landscape page. If the grid cannot be made legible in portrait, that is a content/layout decision to raise with the business (§30 OD-P3-4), not a silent switch to landscape.

An annual statement has **no durable row** — it is computed on demand from runs — so `source_id` is always `null` and it is **never persisted** (§8.2). It gets the HTML engine but not the cache.

### 7.6 `form16_part_b/v1.html` + `buildForm16View(dataset, employee, pinnedDate)`

`dataset` is exactly `employee_tax.service.getForm16()` output. Two facts carried straight through: `employer.tan` is always `null` (D-47), and a non-finalised dataset arrives with `is_provisional: true`, which the PDFKit header turns into `FORM 16 — PART B (PROVISIONAL)`. The view model keeps `is_provisional` and the template selects the same two titles — the *only* conditional the payroll templates contain.

Cacheable **only** when the dataset came from a finalised `employee_tax_summaries` row (frozen `form16_snapshot`, non-null `finalized_at`); then `source_type = 'form16'` and `source_id = <summary id>`. A provisional Form 16 changes whenever payroll changes and must never be cached (§8.2).

### 7.7 Partials and template versioning

Three partials, all payroll-local: `head.html` (the shared `<style>`), `page-frame.html` (page container + the rule-8 page-break guard), `money-table.html` (the code/name/amount table used four times by the payslip and three times by the statement).

Versioning rules (D-2, unchanged from P1/P2):

1. A shipped template file is **immutable**. Any change to markup or CSS means a new file `v2.html` and a `current_version` bump in the registry.
2. `pdf_render_jobs.template_version` is pinned at enqueue, so a bump mid-drain cannot change what a queued job renders (EC-P3-5).
3. Every artifact records the `template_version` that produced it.
4. **A template version bump does not invalidate the cache.** An artifact rendered from `v1` keeps serving. Because parity and content are guaranteed field-by-field and only layout can change, an employee who re-downloads an old payslip after a bump may get `v1` bytes while a colleague's freshly rendered payslip is `v2`. Accepted — recorded as EC-P3-4. Purging to force a re-render is explicitly *not* offered, because for a `purged` source the cache can never be repopulated (§8.6).

---

## 8. `payroll_pdf.service.js` — the single engine branch

D-24: one facade per domain over one shared render service. This file is the **only** place in payroll that mentions `pdfkit` or `html`. No controller, no other service, no utility branches on the engine. A test greps `src/modules/payroll/` and asserts exactly one file matches `/pdf_render_engine|'pdfkit'/`.

### 8.1 Public API

| Method | Called by | Returns |
|---|---|---|
| `renderPayslip({ orgId, actorId, requestId, resolved })` | `#170`, `#186`, `#191` | `{ buffer, sizeBytes, engine, cacheHit, artifactId }` |
| `renderAnnualStatement({ orgId, actorId, requestId, dataset, employee, pinnedDate })` | `#184`, `#193` | same shape, `cacheHit` always `false` |
| `renderForm16({ orgId, actorId, requestId, dataset, employee, pinnedDate })` | `#185`, `#194` | same shape |
| `planBulkPayslips({ orgId, rows })` | `#174` | `{ engine, hits: Map<payslipId, artifactId>, misses: [...], repairs: [...] }` |
| `renderPayslipForJob({ orgId, job })` | the worker | `{ artifactId }` |

`resolved` is passed through unchanged from `payslip_read.service` (`resolveForRender` / `hrResolveForRender`), so the facade inherits every existing access decision and re-derives none of them (§18).

`pdf_render.service.js` gains one parameter, `engine`, defaulting to `'html'` so no existing caller changes. Phase 3 never passes `'pdfkit'`: **a PDFKit render never enters the pipeline and never creates an artifact row.** PDFKit output is produced by the existing utilities and streamed straight to the response, exactly as today. This keeps the `engine` column honest without a back-fill and keeps the default-engine path free of any new failure mode.

### 8.2 The cacheability rule (C-5, C-7)

```
cacheable(payslip) ==
     resolved.persisted === true
  && resolved.payslip_id != null
  && resolved.visible_to_employee === true
  && resolved.published_at != null
```

| Document | Engine when setting is `html` | Persisted? | `source_id` |
|---|---|---|---|
| Released payslip (`visible`, `published_at` set) | html | **yes**, `cache` class | `payslips.id` |
| Held payslip (`published_at IS NULL`) | **pdfkit** (DV-3) | no | — |
| Ephemeral payslip (`persisted: false`) | html | no | `null` |
| Superseded payslip version | html | yes — a distinct `payslips.id`, so a distinct artifact | that version's id |
| Revoked payslip | never rendered — the read service already refuses it | — | — |
| Annual statement | html | **no** | `null` |
| Form 16, finalised | html | **yes**, `cache` class | `employee_tax_summaries.id` |
| Form 16, provisional | html | no | `null` |
| A source whose artifact is `purged` | html | **no** (§8.6) | `null` |

The held-payslip fallback to PDFKit is the load-bearing decision of this phase. Without it, either a held run's ZIP becomes thousands of synchronous renders, or HR loses a download they have today, or the cache serves a stale document date forever.

### 8.3 Single-payslip algorithm

```
1  settings = payrollSettingsService.getOrCreate(orgId)          // one read per request
2  if settings.pdf_render_engine === 'pdfkit'  OR  not cacheable(resolved):
3      if engine is 'html' and not cacheable and the reason is "held"   -> PDFKit render, return
4      else if engine is 'html' and not cacheable (ephemeral / purged)  -> html render, persist:false
5      else                                                             -> PDFKit render, return
6  art = artifactRepo.findReadyBySource(orgId, 'payslip', payslipId)
7  if art:
8      bytes = pdfRender.loadStoredBytes(art.id, orgId)
9      if bytes  -> return { buffer: bytes, cacheHit: true, artifactId: art.id }
10     else      -> EC-19: enqueue a single-flight repair job, then html render persist:false, return
11 // cache miss
12 try  pdfRender.renderForSource({ persist: true, retentionClass: 'cache',
13        sourceType: 'payslip', sourceId: payslipId, engine: 'html',
14        templateCode, templateVersion, templateHtml, viewModel,
15        pinnedDate, idempotencyKey, inputSnapshot: stub, actorId, requestId })
16 catch PDF_RENDER_IN_PROGRESS (409)  -> html render with sourceId:null, persist:false, key `${base}:inline`
17 catch 23505 on the source unique index -> re-probe from step 6 (someone else just won the race)
18 catch PDF_IDEMPOTENCY_CONFLICT (409)  -> re-probe from step 6; if still conflicting, 500 + alert (§16.4)
```

Step 16 is the concurrency decision that matters to a user: **a duplicate in-flight render never becomes a `409` for an employee downloading a payslip.** It costs one extra render and produces one reusable ephemeral artifact row (the same shape P1's preview path already creates), instead of an error page.

Steps 4 and 16 pass `templateHtml` directly. `assembleTemplateHtml` in `pdf_render.service.js` already requires the document template loader **lazily, only when `templateHtml` is absent** (verified), so payroll passing its own HTML keeps payroll free of any require-edge into `modules/document`.

### 8.4 Idempotency key (D-15, structural)

```
payslip:  sha256(['payslip', orgId, payslipId, version, snapshot_hash,
                  templateCode, templateVersion, pinnedDateISO, 'html'].join('|'))
form16:   sha256(['form16', orgId, summaryId, form16_snapshot_hash, ...same tail].join('|'))
```

Purely structural — no clock, no counter, no random component — so the same request computes the same key on every retry (that is what makes step 6 of §8.3 idempotent). A reissue produces a different `payslipId`, so it never collides. A pinned-date change for the same id is impossible under §8.2, which is why `PDF_IDEMPOTENCY_CONFLICT` at step 18 is treated as a genuine invariant violation worth an alert rather than a recoverable case.

P1's failure-salt mechanism (`countFailedByKeyPrefix` → `:r{n}`) is inherited unchanged: a same-key retry after a hard failure derives a salted key, so a `failed` row never blocks a legitimate retry. The source-level partial unique index excludes `status = 'failed'`, so a failed artifact likewise never blocks a new pending row for the same payslip.

### 8.5 `input_snapshot` for payroll — a reference stub (DV-5)

The full payslip view model is ~4–8 KB of salary detail. Storing it in `input_snapshot` would duplicate at rest PII that already lives, immutably and hashed, in `payslips.snapshot`. D-17 says minimise PII leaving the process; storing a second copy is the same mistake in a different place. So payroll passes:

```json
{ "ref": "payslip", "payslip_id": "...", "version": 2, "snapshot_hash": "...",
  "schema_version": 3, "pinned_date": "2026-09-05T...Z",
  "template_code": "payslip", "template_version": 1, "engine": "html",
  "view_hash": "<the input_hash>" }
```

`input_hash` is still computed over the **full** view model, so idempotency and cache validity are unaffected. Reproducibility is preserved because the re-render path rebuilds the view model from `payslips.snapshot` + `published_at` through the same pure builder, and asserts `snapshot_hash` still matches. If it does not, the repair is **refused** with `PDF_REPAIR_SOURCE_DRIFT` (§16.5) rather than silently producing a different document.

### 8.6 EC-19 / OD-P2-2 — the object is gone

`loadStoredBytes` already returns `null` when the object cannot be fetched (verified). Phase 3 gives that `null` a meaning, differently per retention class (C-11).

**`cache` class, request path.** Serve the user first, repair out of band:

1. Log `WARN pdf.cache.object_missing { artifactId, sourceType, sourceId }` and increment a counter.
2. Enqueue a repair job. **The live-source partial unique index is the mutex** — `ON CONFLICT DO NOTHING` guarantees at most one repair is ever in flight for a payslip, so two concurrent detections cannot both re-render and race each other's `putObject` to the same key. No advisory lock is needed and no network call happens inside a transaction.
3. Render inline (`persist: false`, `sourceId: null`) and return the bytes. The user's download succeeds.

**`cache` class, worker path (the actual repair).** `findForRenderById` (the P1 escape hatch that currently has zero callers) reads `storage_key` + `input_snapshot`; the worker rebuilds the view model from `payslips.snapshot`, checks `snapshot_hash`, re-renders, `putObject`s to the **same key**, then `repairReady` updates `content_hash`, `size_bytes`, `render_ms` and `attempt_count`. `content_hash` changes because Chromium is not byte-reproducible (D-16) — that is DV-4, and it is sound precisely because a cache artifact is regenerable and is not evidence.

**`record` class (letters).** Detection only. The sweeper (§12.2) reports a missing object; it never re-renders, never substitutes, never mutates the row. A letter is evidence, and a regenerated letter is a different letter.

**`purged` sources.** Because the source-level unique index excludes only `status = 'failed'`, a `purged` artifact permanently occupies its source slot: no new artifact can be inserted for that payslip. The facade therefore treats a `purged` artifact as "render inline, never persist" (§8.2, last row). This is a deliberate accepted consequence of leaving `00055` untouched, and it is benign: a payslip old enough to be purged is downloaded rarely, and the inline render is exactly the pre-Phase-3 behaviour. Recorded as EC-P3-6; revisit in Phase 5 if usage says otherwise.

---

## 9. API Surface

### 9.1 Existing endpoints — behaviour preserved, byte source changed

All eight keep their path, method, auth middleware, parameters, status codes, headers, filename convention and export-ledger behaviour. The only change is where the bytes come from.

| # | Endpoint | Change | Resolver (unchanged) |
|---|---|---|---|
| 170 | `GET /payroll/hr/runs/:runId/payslips/:userId/pdf` | `payslipPdf.render(...)` → `payrollPdf.renderPayslip({ resolved })` | `payslipReadService.hrResolveForRender` |
| 174 | `GET /payroll/hr/runs/:runId/payslips/download` | §11 | `payslipReadService.hrPayslipsForDownload` |
| 184 | `GET /payroll/hr/employees/:userId/annual-statement/pdf` | → `renderAnnualStatement` | unchanged |
| 185 | `GET /payroll/hr/employees/:userId/form16/pdf` | → `renderForm16` | `employeeTaxService.getForm16` |
| 186 | `GET /payroll/manager/payslips/:runId/:userId/pdf` | → `renderPayslip` | `payslipReadService.resolveForRender` |
| 191 | `GET /payroll/me/payslips/:runId/pdf` | → `renderPayslip` | `payslipReadService.resolveForRender` |
| 193 | `GET /payroll/me/annual-statement/pdf` | → `renderAnnualStatement` | unchanged |
| 194 | `GET /payroll/me/form16/pdf` | → `renderForm16` | unchanged |

**Ordering is preserved exactly:** resolve access → resolve bytes → `startExport` → `sendBuffer` → `completeExport`. Today the buffer is produced before the export row opens; with a cache hit the "production" is an S3 read instead of a render, and it still happens before `startExport`. Nothing about the export ledger's semantics changes, and a render/fetch failure still fails **before** an export row exists.

`creationDate` handling is likewise untouched: `#170` keeps `published_at || run.approved_at`, `#184`/`#185`/`#193`/`#194` keep `new Date()`. The facade receives the pinned date; it does not invent one. (Consequence: annual statements and Form 16s pin "now", which is another reason they are not cached — a cached artifact with a `now` pinned date would serve a stale date. §8.2 already forbids it; this is the second, independent reason.)

### 9.2 `#219` — `POST /api/v1/payroll/hr/jobs/payslip-render/run`

| Aspect | Definition |
|---|---|
| Auth | `hrAuth`, tenant `hr` plane only. `admin`/`super-admin` are platform roles and get no tenant data — they must not reach this route. |
| Feature gate | existing payroll feature access check, as every payroll HR route has |
| Body | `{ run_id?: uuid }` — optional. Absent: drain the org's whole queue, bounded. Present: enqueue any missing jobs for that run first (priority 50), then drain. Validated by a Joi schema in `payroll_hr.validator.js`. |
| Behaviour | Calls `payrollAutomationService.runPayslipRender({ orgId, runId, limit })`. Bounded by the same per-invocation limit the cron uses; never unbounded. |
| Response | `200 { enqueued, claimed, done, failed, remaining }` |
| Engine off | `200` with `{ engine: 'pdfkit', enqueued: 0, claimed: 0, done: 0, failed: 0, remaining: 0 }` — informative, not an error. Nothing to do is not a failure. |
| Audit | One audit row, mirroring `#215` (payroll calendar reminders) exactly: same action-naming scheme, same payload shape with the counts. |
| Idempotency | Safe to call repeatedly. `ON CONFLICT DO NOTHING` prevents duplicate jobs; `FOR UPDATE SKIP LOCKED` prevents two concurrent calls (or a call racing the cron) from claiming the same job. |
| Precedent | `#125`, `#129`, `#215` — the existing `/jobs/*/run` HR endpoints |

### 9.3 `#220` — `GET /api/v1/payroll/hr/runs/:runId/payslips/render-status` (DV-2)

Exists because a `202` with no poll target is not implementable by a client.

| Aspect | Definition |
|---|---|
| Auth | `hrAuth`; the run is resolved org-scoped, and a cross-org or missing run returns the same `404` the other run endpoints return (uniform denial) |
| Query | `batch_id?` (uuid). Express 5 makes `req.query` getter-only, so it is validated **inside the controller**, not by a mutating middleware. |
| Response | `200 { run_id, engine, total, ready, pending: { queued, claimed }, failed, uncacheable, batch: { id, queued, claimed, done, failed, cancelled } \| null }` |
| Semantics | `total` = active payslips of the run; `ready` = rows with a `ready` artifact; `uncacheable` = held/ephemeral rows that will always render inline. `ready + uncacheable === total` means a `#174` call will now stream a full ZIP. |
| Cost | Two aggregate queries — `findReadyBySourceIds` over the run's payslip ids, and `countByBatch`. No render, no S3 call. |
| Audit | None. It is a read. |

### 9.4 Settings exposure — `#22`/`#23` (`GET`/`PUT /payroll/hr/settings`)

The four new keys appear in the `GET` response and are accepted by the `PUT` patch schema. Validation lives in `payroll_hr.validator.js` beside `payslip_auto_publish`:

```js
pdf_render_engine: Joi.string().valid('pdfkit', 'html'),
payslip_prerender_on_publish: Joi.boolean(),
pdf_bulk_inline_miss_threshold: Joi.number().integer().min(1).max(500),
pdf_cache_retention_days: Joi.number().integer().min(30).max(3650)
```

`payroll_settings.service.update` already audits old→new inside one transaction; the four keys inherit that with no new code. One guard is added: switching `pdf_render_engine` to `'html'` requires the renderer to be configured (`PDF_RENDERER_BASE_URL` present) — otherwise `409 PDF_RENDERER_NOT_CONFIGURED`. Without it an org can turn on an engine that cannot render and break every payslip download. Switching back to `'pdfkit'` is always allowed and is the documented rollback (§25.4); existing artifacts are left alone and simply stop being read.

---

## 10. Background Jobs, Events and Integrations

### 10.1 Enqueue points (the only two producers)

| Point | Where | Condition | Mechanism |
|---|---|---|---|
| Auto-publish at approval | `payslip.service.createForApproval`, inside the existing approval transaction | `pdf_render_engine = 'html'` AND `payslip_prerender_on_publish` AND the cohort was created visible | `jobRepo.enqueueForRun(orgId, runId, …, transaction)` |
| Explicit release | `payslip.service.publish` (`#171`), inside the existing publish transaction, **after** `payslipRepo.publishRun` | same two settings | same call |

Both use the same single `INSERT … SELECT … ON CONFLICT DO NOTHING`, which is why `publishRun` returning a count rather than ids costs nothing. Properties that follow:

- **Atomic with the business fact.** If the approval or publish transaction rolls back, no job exists. There is no window in which a job references a payslip that was never released.
- **No network I/O is added to either transaction.** The enqueue is pure SQL. The renderer is never called from inside a transaction (the module-wide rule).
- **Idempotent.** A retried publish, a partial publish followed by a full one, or the cron catching up all converge on one live job per payslip via `pdf_render_jobs_live_source_uq`.
- **Held rows are excluded by the `WHERE`**, not by application logic, so the §8.2 rule is enforced in SQL.
- **Settings are read with the transaction** (`payrollSettingsService.getOrCreate(orgId, transaction)`), so a concurrent settings change cannot half-apply.
- **A settings flip does not retro-enqueue.** An org that switches to `html` after publishing warms up lazily: the first download of each payslip is a miss that persists. HR can force warm-up with `#219 { run_id }`.

### 10.2 What is deliberately **not** enqueued

Annual statements, Form 16s (finalised or not), report families, held payslips, ephemeral payslips, and anything for an org on the `pdfkit` engine. The queue exists for one reason — to keep bulk payslip delivery off the request path.

### 10.3 `src/common/services/pdf_render_worker.service.js`

Generic claim loop, dependency-injected so `common` never requires from a module:

```js
drain({ orgId, sourceType, limit, staleMs, concurrency, render })
//   render(job) -> { artifactId }     injected by the caller (payroll)
```

Sequence, per invocation:

```
[txn 1]  jobs = jobRepo.claimBatch(orgId, { now, staleMs, limit, workerToken })   // commits immediately
         for each job, at most `concurrency` in flight:
              artifactId = await render(job)                                       // NO transaction open
[txn 2]      jobRepo.markDone(job.id, orgId, { artifactId, at })                   // one txn per job
         on error:
[txn 2']     jobRepo.recordFailure(job.id, orgId, { failureCode, failureReason, retryAt })
```

Rules:

1. **The claim commits before any render starts.** Holding a transaction across an HTTP call to the renderer is the failure mode the module-wide rule exists to prevent.
2. **Bounded concurrency**, default 4 (`PDF_WORKER_CONCURRENCY`), matching D-9's bounded-fan-out requirement. A simple index-advancing pool — no new dependency.
3. **One transaction per job completion.** A poison job cannot roll back its siblings' results.
4. **A crashed worker self-heals.** Its `claimed` rows are reclaimed by the next `claimBatch` once `claimed_at` is older than `staleMs` (default 10 minutes, ≈ 30× the p99 render). `attempts` was already incremented by the claim, so a repeatedly crashing job exhausts `max_attempts` and stops.
5. **The render callback never throws for a business reason it can absorb.** A payslip that has since been revoked, or a run that was cancelled, resolves to `cancelLiveForSource` and a `cancelled` job, not a failure.
6. `render(job)` = `payrollPdf.renderPayslipForJob({ orgId, job })`, which re-reads the payslip and its snapshot, re-checks §8.2 cacheability, and either persists a new artifact or performs the in-place repair of §8.6.

### 10.4 `src/cron-jobs/pdf_render_worker.cron.js`

Copies `document_notification_dispatch.cron.js` exactly: `cron.schedule('*/5 * * * *', …)`, `timezone: 'Asia/Kolkata'`, a `try/catch` that logs and **never rethrows**, a summary log only when something happened, and a registration log line at require time. It calls `payrollAutomationService.runPayslipRender({ orgId: null })`, which uses the existing `_forEachOrg` to iterate tenants, skipping any org whose engine is not `html`.

No startup catch-up is added. Stale-claim reclaim inside `claimBatch` already recovers everything a restart could have interrupted, and the 5-minute cadence bounds the delay. Registered in `src/server.js` beside the existing sweeper, and in `public/md_system/cron_registry.md`.

---

## 11. Bulk Payslip ZIP (`#174`)

### 11.1 Algorithm

```
1  rows = payslipReadService.hrPayslipsForDownload(orgId, runId)          // unchanged
2  empty-run check and ZIP_MAX_ENTRIES check                             // unchanged, still BEFORE the export row opens
3  engine = settings.pdf_render_engine
4  if engine === 'pdfkit':  existing buildRunZip generator, byte-for-byte today's behaviour.  DONE.
5  plan = payrollPdf.planBulkPayslips({ orgId, rows })
6  inlineCost = plan.misses.length + plan.repairs.length
7  if inlineCost > settings.pdf_bulk_inline_miss_threshold:
8       batchId = uuid();  enqueue misses + repairs at priority 50        // one txn, ON CONFLICT DO NOTHING
9       return 202 { run_id, batch_id, total, ready, queued, poll_url }   // no export row is opened
10 else stream the ZIP in the existing stable order, one entry at a time:
11       cache hit   -> pdfRender.loadStoredBytes(artifactId, orgId)
12       object gone -> enqueue repair (single-flight) + inline html render, persist:false
13       miss        -> renderForSource(persist:true)                     // warms the cache as a side effect
14       uncacheable -> payslipPdf.render(snapshot, { creationDate })      // PDFKit, held/ephemeral rows
```

### 11.2 Properties

- **Memory stays O(1) in the cohort.** The existing async-generator + `streamChunks` shape is kept, so exactly one PDF buffer (≤ 6 MB) is alive at a time regardless of whether the cohort is 5 or 5 000. This is why the ZIP path streams from S3 per entry rather than pre-fetching.
- **A mixed-engine ZIP is legal; a mixed-engine document is not.** EC-35 forbids one *document* being produced partly by each engine. A held payslip rendered by PDFKit sitting beside a released payslip rendered from the HTML cache is each wholly one engine, and each records which.
- **Entry order and filenames are unchanged**, so a diff of two ZIPs from the two engines compares like for like.
- **The `202` opens no export row**, consistent with the existing D-48 discipline that the entry cap and empty-run cases are settled before the audit row opens. Nothing was exported, so nothing is ledgered.
- **Mid-stream failure keeps the existing contract**: `failExport` + `res.destroy()`, and a rethrow only if no byte has been written yet. A cache read or an inline render failing on entry 900 of 1 000 behaves exactly as a PDFKit render failing there does today.
- **Repeated `#174` calls are safe.** Each recomputes the plan; a warm cohort streams, a cold one returns the same `batch_id` set of jobs (idempotent enqueue), not a new pile of work.

### 11.3 Why a threshold at all

At `pdf_bulk_inline_miss_threshold = 50` and a ~1.5 s p50 render, a worst-case inline ZIP is ~75 s of renderer time in one request — inside a typical gateway timeout but not comfortably. Above that the request cannot finish honestly, so it returns work-queued instead of a slow half-truth. With warm-up on publish (§10.1) the common path never reaches the threshold: by the time HR downloads, the run is already rendered.

---

## 12. Retention, Purge and Object Verification

### 12.1 `pdf_cache_purge.cron.js` — `cache` class only (C-8, DV-6)

Daily at **04:10 IST**, 20 minutes after the existing artifact sweeper, so the two never contend.

Per org (via `_forEachOrg`), with `retentionDays = payroll_settings.pdf_cache_retention_days`:

```
candidates = artifactRepo.findPurgeCandidates({ orgId, olderThan: now - retentionDays, limit: 500 })
for each:  deleteObject(storage_key)   ->   markPurged(id, orgId, { at: now })
```

Rules:

1. **`retention_class = 'cache'` is in the SQL predicate.** A `record`-class letter can never be selected. A test asserts a `record` artifact is never returned by `findPurgeCandidates`.
2. `storage_key IS NOT NULL` is also in the predicate — preview and ephemeral artifacts are `ready` with no object, and asking S3 to delete a key that never existed is a pointless error every night.
3. **Object first, row second** — the `document_automation` sweeper precedent. A crash between them leaves a `ready` row whose object is gone, which EC-19 already handles (§8.6). The reverse order would leave an orphaned object no code can ever find.
4. A delete failure leaves the row untouched; the next night retries. Bounded at 500 per org per run so a large backlog drains predictably instead of spiking S3.
5. The same cron deletes terminal `pdf_render_jobs` (`done`, `failed`, `cancelled`) older than 90 days, bounded, so the queue table does not grow without limit. Queue rows are operational, not evidence.
6. `record`-class retention, and the acknowledgement-obligation exclusion, remain **Phase 5** (D-23). This cron must not grow a `record` branch.

### 12.2 EC-19 detection for `record` class — inside the existing sweeper (DV-7)

`document_automation.service.runArtifactVerification({ orgId = null })`, called by `pdf_artifact_sweeper.cron.js` after its existing stale-pending pass:

- `findReadyRecordsForVerification({ orgId, limit: 200, afterId })` — keyset-paginated by `id`, so successive nightly runs advance through the table rather than re-checking the newest 200 forever. The cursor is held in memory for the run and logged at the end; no new table, no new column. A restart simply restarts the walk, which is harmless for a report-only pass.
- For each: `HeadObject(storage_key)`.
- Present → nothing. Missing → `ERROR pdf.record.object_missing { artifactId, orgId, sourceType, sourceId, storageKeyPresent: true }` plus a counter increment, and it is counted in the cron's summary line.
- **No mutation. No re-render. No substitution.** Report only, per C-11.
- Bounded at 200 objects per run, which is one `HeadObject` every few seconds — invisible against normal traffic.

This closes OD-P2-2. OD-P2-5 (an HR-triggered sweep endpoint) stays closed: no operator has asked, and `#219` already gives HR a way to force payroll renders. Adding an endpoint nobody requested would be speculative.

---

## 13. Lifecycle & State Transitions

### 13.1 Artifact lifecycle (P1's machine, one new edge)

```
                         (renderer 4xx / verification fail / size cap)
        insertPending ──────────────────────────────────────────────► failed  [terminal]
             │
             │ render OK + putObject OK
             ▼
           ready ──────────────► purged  [terminal for caching purposes]
             │   (cache purge)
             │
             └──► ready'   NEW IN PHASE 3: in-place cache repair (DV-4)
                  content_hash / size_bytes / render_ms / attempt_count rewritten;
                  only for retention_class = 'cache'; only via repairReady;
                  only from the worker, single-flighted by the job queue
```

`ready → purged` is terminal **for that source**: the source-level partial unique index excludes only `failed`, so a purged row keeps occupying its slot and the source is served inline from then on (§8.6, EC-P3-6).

### 13.2 Job lifecycle

```
queued ──claimBatch──► claimed ──markDone──► done       [terminal]
  ▲                       │
  │  recordFailure        ├──recordFailure(retryAt, attempts < max)──► queued   (backoff)
  │  with retryAt         ├──recordFailure(no retry / attempts = max)─► failed   [terminal]
  │                       └──cancelLiveForSource────────────────────► cancelled [terminal]
  │
  └── stale reclaim: a `claimed` row with claimed_at < now - staleMs is re-claimable
      by the same predicate that claims a queued row (no separate reclaim path)
```

### 13.3 Payslip events and their PDF consequences

| Payslip event | Artifact consequence | Job consequence |
|---|---|---|
| Run approved, auto-publish **on** (rows visible, `published_at` stamped) | none yet | `enqueueForRun` inside the approval transaction |
| Run approved, auto-publish **off** (rows held) | none — held rows are not cacheable | none. `WHERE` excludes them |
| `#171 publish` releases held rows | none yet | `enqueueForRun` inside the publish transaction |
| `#171 publish` called again (nothing to release) | none | `publishRun` reports 0; `ON CONFLICT DO NOTHING` inserts 0. A no-op, not an error. |
| First download of an uncached released payslip | `pending → ready` inline | none |
| `#173 reissue` (version N+1) | a **new** payslip id ⇒ a **new** artifact. The superseded version's artifact is untouched and still serves. | the new id is enqueued on its release |
| Payslip revoked | the artifact is **not** deleted (it is still evidence of what was issued) but is never served again — the read service refuses the payslip before the facade is reached | `cancelLiveForSource` |
| Run cancelled (`#49`) | artifacts untouched; the run's payslips are revoked by existing logic | `cancelLiveForSource` for each |
| `pdf_cache_retention_days` elapses | `ready → purged`, object deleted | terminal jobs older than 90 days deleted |
| Object lost from S3 | `ready → ready'` by in-place repair | one single-flight repair job |
| `pdf_render_engine` switched to `pdfkit` | artifacts stay, stop being read | live jobs are left to drain; they are harmless. The worker skips the org on its next pass, so any remaining `queued` rows simply age. |

### 13.4 Invalid states — how each is prevented

| Invalid state | Prevention |
|---|---|
| Two live artifacts for one payslip | existing partial unique index `(org_id, source_type, source_id) WHERE source_id IS NOT NULL AND status <> 'failed'` |
| Two live jobs for one payslip | `pdf_render_jobs_live_source_uq` |
| A job for a payslip that was never released | the enqueue `WHERE` requires `visible_to_employee = true AND published_at IS NOT NULL` |
| A `done` job with no artifact | `pdf_render_jobs_done_chk` |
| A terminal job with no `finished_at` | `pdf_render_jobs_terminal_chk` |
| A `ready` artifact with no `content_hash`/`size_bytes` | P1's existing `ready` CHECK |
| A cached artifact whose pinned date no longer matches the payslip | impossible: `published_at` is write-once (`publishRun`'s `WHERE … visible_to_employee = false`) and it is in the idempotency key |
| A `record` artifact mutated by a repair | `repairReady`'s SQL predicate `retention_class = 'cache'` |
| A payroll render reaching the document template loader | `templateHtml` is always provided; `assembleTemplateHtml` requires the document loader lazily only when it is absent |
| An orphaned S3 object no row references | purge deletes the object **before** marking the row |
| An artifact row whose object is gone | permitted and handled — EC-19 (§8.6), not treated as corruption |

---

## 14. Transactions & Concurrency

### 14.1 The transaction map

| Boundary | Contents | Notes |
|---|---|---|
| Approval transaction (existing) | run approval + payslip cohort + **enqueue** | one extra `INSERT … SELECT`. No network I/O added. |
| Publish transaction (existing, `#171`) | `publishRun` + audit + **enqueue** | same |
| Render pipeline `[txn 1]` (P1) | idempotency probe + `insertPending` | commits **before** the renderer is called |
| Render, S3 put | **no transaction open** | the module-wide rule |
| Render pipeline `[txn 2]` (P1) | `markReady` (+ `onReady` work) | payroll passes no `onReady`; there is no payroll row to write |
| Worker claim `[txn 1]` | `claimBatch` | commits immediately; the render happens outside |
| Worker completion `[txn 2]` | `markDone` **or** `recordFailure` | one transaction per job |
| Repair completion | `repairReady` | its own transaction, after the `putObject` |
| Purge | `markPurged` | its own transaction, after the `deleteObject` |
| Settings update | existing single transaction with old→new audit | unchanged |

**No transaction in Phase 3 spans a renderer call or an S3 call.** A test asserts the worker's render callback is invoked with no active transaction argument.

### 14.2 Lock ordering

Phase 3 introduces no new advisory lock. The letter path's advisory-lock-then-row-lock ordering is untouched. The only row locks Phase 3 takes are `FOR UPDATE SKIP LOCKED` inside `claimBatch`, which by construction blocks on nothing: a contended row is skipped, not waited on. Consequently Phase 3 cannot deadlock against payroll's existing lock order, and it does not need to join it.

### 14.3 Concurrency scenarios and their outcomes

| Scenario | Outcome |
|---|---|
| Two employees download the same uncached payslip simultaneously | one wins `insertPending`; the other gets `409 PDF_RENDER_IN_PROGRESS` from the probe and is converted by §8.3 step 16 into an inline non-persisted render. Both downloads succeed. One extra render. |
| An employee download races the worker | identical to the above; whichever inserted the pending row first persists. |
| Two workers (two app instances) claim concurrently | `FOR UPDATE SKIP LOCKED` gives them disjoint sets. No job is rendered twice. |
| The cron races `#219` | same mechanism. `#219` may report `claimed: 0` if the cron just took everything — accurate, not an error. |
| Two publishes race (`#171` twice) | `publishRun` is idempotent by `WHERE`; the loser releases 0 rows and enqueues 0 jobs. |
| A publish races a download of a held payslip | the download resolved its `pinned_date` before the publish committed, so it renders the held document with PDFKit and persists nothing. No stale cache can result. |
| Two detections of a missing object | the live-source unique index admits exactly one repair job. |
| A settings flip races an in-flight ZIP | the ZIP read its engine once at the start and completes coherently under it. |
| A reissue races a download of version N | version N is a distinct payslip id with its own artifact; both are correct. |
| A run cancel races a queued job | the worker re-reads the payslip, finds it revoked, and marks the job `cancelled`. |
| A repair races a purge | `markPurged` requires `status = 'ready'` and `repairReady` requires `status = 'ready'`; whichever commits second changes zero rows and logs. Neither corrupts the other. |

---

## 15. Idempotency, Retries and Duplicate Requests

### 15.1 Per-operation idempotency

| Operation | Idempotency mechanism | Duplicate request result |
|---|---|---|
| Single payslip PDF (`#170`/`#186`/`#191`) | structural idempotency key (§8.4) + the source unique index | second request is a cache hit, or an inline render; never an error |
| Bulk ZIP (`#174`) | none needed — it is a `GET`; the enqueue inside it is `ON CONFLICT DO NOTHING` | a second cold call returns `202` again without duplicating work |
| Enqueue (publish / approval / `#219`) | `pdf_render_jobs_live_source_uq` + `ON CONFLICT DO NOTHING` | 0 rows inserted |
| Claim | `FOR UPDATE SKIP LOCKED` + `attempts < max_attempts` | a job is claimed once per attempt |
| `markDone` | conditional on `status = 'claimed'` | a stale worker's late write changes 0 rows and is logged |
| Repair | one live job per source | one repair |
| Purge | `markPurged` conditional on `ready`; `deleteObject` is idempotent in S3 | a re-run purges nothing twice |
| Settings `PUT` | existing old→new audit; the value is absolute, not a delta | last write wins, both audited |

### 15.2 Renderer retries (P1, inherited unchanged)

Two attempts. Retry **only** on a network error, a timeout, `429`, or `5xx`. **Never** on a `400` — a `400` means the HTML is wrong and a retry will be wrong identically. Timeout 20 s per attempt.

### 15.3 Job retries

`recordFailure` with `retryAt = now + backoff(attempts)`, backoff `2 min → 10 min → 30 min`, capped by `max_attempts = 3`. Retry is chosen by the **same classification** the renderer client uses: transient → retry; deterministic (`400`, template lint failure, a `snapshot_hash` mismatch, a missing payslip) → `failed` immediately, without burning the remaining attempts. A job that exhausts its attempts sits `failed` and is surfaced by `#220` and by the failure counter (§20); it never blocks the queue, and the payslip remains downloadable inline.

### 15.4 What is deliberately not idempotency-keyed

The three read endpoints for annual statements and Form 16s take no client idempotency key and create no persisted artifact when provisional. Adding a key to a `GET` that renders a "now"-pinned document would imply a durability guarantee the document does not have.

---

## 16. Error & Failure Handling

### 16.1 New error codes

| Code | Status | When |
|---|---|---|
| `PDF_RENDERER_NOT_CONFIGURED` | 409 | switching `pdf_render_engine` to `html` with no renderer configured (§9.4) |
| `PDF_REPAIR_SOURCE_DRIFT` | — (internal) | a repair found `snapshot_hash` no longer matching; the repair is refused and alerted |

Everything else reuses P1/P2's taxonomy: `PDF_RENDER_IN_PROGRESS`, `PDF_IDEMPOTENCY_CONFLICT`, the renderer failure codes, and payroll's existing `PAYSLIP_NOT_ACCESSIBLE` / `404` semantics. **Phase 3 introduces no new user-visible error for a normal download path** — that is deliberate: every foreseeable failure is either converted into a successful inline render or is an existing payroll error.

### 16.2 Failure matrix — single payslip download

| Failure | Behaviour |
|---|---|
| Renderer timeout (both attempts) | artifact `failed` (own transaction, P1's `safeMarkFailed`); the request fails with the existing render-failure response. **No payslip state changes** (D-10: renderer failure = no state change). |
| Renderer `400` | `failed` immediately, no retry; alerted as a template defect |
| Output fails `%PDF-` / `%%EOF` verification | `failed`; bytes are never served or stored |
| Output over 6 MB | `failed` with the size code; nothing stored |
| S3 `putObject` fails | artifact `failed`; nothing partially visible. The next request re-probes, finds `failed`, derives a salted key, and tries again. |
| `markReady` fails after a successful `putObject` | P1's known window: a `pending` row with an object at a derivable key. The existing sweeper already owns this case; Phase 3 adds nothing and breaks nothing. |
| Cache hit but object gone | §8.6 — serve inline, enqueue repair. The user sees a successful download. |
| S3 `getObject` fails transiently (not a 404) | treated as a transient read error, **not** as object loss: no repair is enqueued, the request falls back to an inline render, and a distinct counter is incremented. Mis-classifying a 500 as a missing object would queue pointless repairs. |
| Payslip revoked between resolve and render | the read service refuses first; the facade is never reached |

### 16.3 Failure matrix — bulk ZIP

| Failure | Behaviour |
|---|---|
| Plan query fails | error before the export row opens; nothing ledgered |
| A single entry's render fails before the first byte | rethrow; a normal error response |
| A single entry's render fails mid-stream | existing contract: `failExport` + `res.destroy()`. The client sees a truncated download and the export row records the failure. Unchanged from today. |
| Enqueue fails on the `202` path | error response; no partial `202`. The enqueue is one statement in one transaction. |
| The renderer is down entirely and the cohort is cold | `202` is returned (the threshold is exceeded long before the renderer is exercised), jobs accumulate, and the failure surfaces as job failures plus the `#220` counts — not as a hung request. |

### 16.4 Failure matrix — worker

| Failure | Behaviour |
|---|---|
| Render fails transiently | `recordFailure` with backoff; `attempts` already incremented by the claim |
| Render fails deterministically | `failed` immediately |
| Worker process dies mid-render | the `claimed` row is reclaimed after `staleMs`; a half-written S3 object is overwritten by the retry at the same key |
| `markDone` fails after a successful put + `markReady` | the job is re-claimed later, finds the artifact already `ready`, and completes by pointing at it — the render is not repeated |
| A whole org's settings are unreadable | that org is skipped with a log; `_forEachOrg` continues. One tenant cannot stop the sweep. |
| `PDF_IDEMPOTENCY_CONFLICT` on the same source twice | treated as an invariant violation: `failed` + `ERROR` log + alert. It should be unreachable given §8.4, so it is worth knowing about rather than absorbing. |

### 16.5 Alert-worthy conditions

`PDF_REPAIR_SOURCE_DRIFT`; `pdf.record.object_missing`; a job failure rate above 5 % over an hour; a cache-miss rate above 50 % for an org 24 h after warm-up (suggests the enqueue or the purge is misbehaving); any `PDF_IDEMPOTENCY_CONFLICT` on a payslip source.

---

## 17. Temp Files, Memory and Resource Cleanup

1. **No temp file is ever written.** Every PDF exists only as a `Buffer` in memory, exactly as P1/P2 do. There is therefore no temp directory to clean, no `fs` handle to leak, and no partially written file to reap. This is stated positively because the main plan's checklist asks about temp-file cleanup and the honest answer is that the design has none.
2. **Bounded memory per request.** One PDF at a time, capped at `MAX_PDF_BYTES = 6 MB`; assembled HTML capped at `MAX_ASSEMBLED_BYTES = 256 KB`. A 5 000-entry ZIP therefore peaks at roughly one buffer plus the ZIP writer's small central directory.
3. **Bounded memory per worker pass.** `limit` jobs claimed per invocation (default 50) × `concurrency` 4 in flight = at most 4 buffers alive.
4. **S3 read is drained fully or destroyed.** `loadStoredBytes` collects the body to a buffer; on error the stream is destroyed rather than abandoned, so no socket is held.
5. **The ZIP writer is always finished or the response destroyed.** The existing generator already guarantees `finish()` on the success path and `res.destroy()` on the mid-stream failure path; `addEntry` after `finish` throws, which the tests already cover.
6. **Cache maps are bounded by the template count.** Each loader instance caches assembled strings for at most three (payroll) or ten (letters) templates, cleared on demand and bypassed in development.
7. **The renderer call always has a deadline.** 20 s per attempt, 2 attempts, so no request can hang on the Lambda.

---

## 18. Authorization & Access Control

### 18.1 The rule

**Phase 3 makes no authorization decision of its own.** Every decision is already made by `payslip_read.service` and by the existing route middleware, and the facade receives the *result*. A test asserts `payroll_pdf.service.js` contains no reference to a role, a user id comparison, or a manager-scope check.

| Plane | Resolver | Denial semantics (unchanged) |
|---|---|---|
| Self (`#191`, `#193`, `#194`) | `resolveForRender` | uniform `403 PAYSLIP_NOT_ACCESSIBLE` (EC-24) covering not-yours, held, revoked and missing alike |
| Manager (`#186`) | `resolveForRender` | same uniform `403`; the subordinate check is the existing manager→employee scoping |
| HR (`#170`, `#174`, `#184`, `#185`, `#219`, `#220`) | `hrResolveForRender` / `hrPayslipsForDownload` | `404` for cross-org, deleted or absent — HR gets the truthful shape because HR is the top of the org |
| Platform (`admin`, `super-admin`) | — | no tenant data. These roles never reach a payroll PDF route. |

### 18.2 PDF access control specifics

- **Artifact ids are never exposed.** No response body in Phase 3 contains an `artifact_id`. `#220` returns counts only. There is no "download by artifact id" endpoint for payroll, so an artifact id cannot be used as a handle.
- **Storage keys never leave the repository layer.** `SAFE_ATTRIBUTES` omits `storage_key`; the two escape hatches are grep-named and are called only by the worker, the repair path and the crons. The Phase 1 test that greps controllers for the escape hatches is extended to cover the payroll controllers.
- **No presigned URL is issued.** Payroll streams bytes through the API, which means access is re-checked on every single download and there is no URL to leak. (D-13's presigned-GET path is for template assets, not for delivered documents.)
- **A cache hit is authorized identically to a miss.** The bytes are fetched only after the resolver has returned; there is no path that reads an artifact before access is decided. This is the IDOR/BOLA-critical property of the whole phase, and it is why the facade takes `resolved` rather than ids.
- **Cross-org reads are structurally impossible**: every repository method takes `orgId` and puts it in the `WHERE`; `findReadyBySource` is no exception.
- **The queue is org-scoped**: `claimBatch` takes `orgId` and the cron iterates orgs one at a time, so one tenant's backlog cannot be rendered under another tenant's settings.

---

## 19. Audit & Logging

### 19.1 What gets an audit row

| Action | Audit row | Rationale |
|---|---|---|
| Settings change (the four new keys) | **yes** — existing old→new audit in `payroll_settings.service.update` | it changes org behaviour |
| `#219` drain | **yes** — one row with the counts, mirroring `#215` | an HR-initiated operation |
| PDF download (`#170`, `#174`, `#184`, `#185`, `#186`, `#191`, `#193`, `#194`) | **unchanged** — the existing export-ledger rows continue to be the record of who downloaded what | no new audit row; a cache hit is not a new business event |
| Render, cache hit, cache miss, repair, purge, job transitions | **no audit row** | these are infrastructure events and belong in logs and metrics. P1 already deprecated the render-time `writeAudit` alias for exactly this reason; Phase 3 does not resurrect it. |
| `#220` | no | a read |

Audit ordering rules from the payroll module are unchanged: the export row opens after the bytes are resolved, and the 4xx cases are settled before it opens.

### 19.2 Log lines (all structured, all carrying `requestId` and `orgId`)

| Level | Event | Fields |
|---|---|---|
| INFO | `pdf.payroll.render` | `sourceType, sourceId, engine, cacheHit, sizeBytes, renderMs, templateVersion` |
| INFO | `pdf.bulk.plan` | `runId, total, hits, misses, repairs, uncacheable, decision: 'stream'\|'queued'` |
| INFO | `pdf.job.claimed` / `pdf.job.done` | `jobId, sourceId, attempts, renderMs` |
| WARN | `pdf.cache.object_missing` | `artifactId, sourceType, sourceId` |
| WARN | `pdf.render.in_progress_fallback` | `sourceId` — the §8.3 step-16 path |
| WARN | `pdf.job.retry` | `jobId, attempts, failureCode, retryAt` |
| ERROR | `pdf.job.failed` | `jobId, sourceId, failureCode, failureReason` |
| ERROR | `pdf.record.object_missing` | `artifactId, sourceType, sourceId` |
| ERROR | `pdf.repair.source_drift` | `artifactId, payslipId, expectedHash, actualHash` |
| INFO | `pdf.cache.purge` | `orgId, purged, failed, retentionDays` |

**No log line may contain a salary figure, an employee name, a bank detail or a storage key.** Identifiers only. A test greps the new log call sites for the forbidden field names, in the spirit of D-17.

### 19.3 Cron summary lines

Both new crons follow the `document_notification_dispatch` shape: a registration line at require time, a summary line **only when something happened**, and a caught-and-logged error that never rethrows (a throwing cron takes the process down).

---

## 20. Observability

### 20.1 Counters

| Counter | Labels | Why it matters |
|---|---|---|
| `pdf_render_total` | `sourceType, engine, outcome` | render volume and failure rate per engine |
| `pdf_cache_hit_total` / `pdf_cache_miss_total` | `sourceType` | whether warm-up is working; a rising miss rate means the enqueue or the purge is wrong |
| `pdf_cache_object_missing_total` | `retentionClass` | EC-19 frequency; a non-zero `record` value is an incident |
| `pdf_job_claimed_total` / `pdf_job_done_total` / `pdf_job_failed_total` | `sourceType` | queue throughput and failure rate |
| `pdf_job_queue_depth` | `orgId` (bounded cardinality: report only orgs with depth > 0) | backlog; the alert signal for a stalled worker |
| `pdf_bulk_queued_total` | — | how often HR hits the `202` path; sustained non-zero means the threshold or the warm-up needs tuning |
| `pdf_repair_total` | `outcome` | repairs and refusals |
| `pdf_cache_purged_total` | — | retention is actually running |

### 20.2 Durations

`pdf_render_duration_ms` (labelled by engine and source type), `pdf_cache_fetch_duration_ms`, `pdf_bulk_zip_duration_ms`. Each render's duration is also persisted in `pdf_render_artifacts.render_ms`, so slow-render analysis is possible from the database alone without a metrics backend — which matters because the deployment may not have one.

### 20.3 Tracing

`requestId` is already threaded into `pdf_render.service`; Phase 3 threads it through the facade and, for a queued render, records the enqueuing request's id in the job's `created_by`/log line so a `202` can be followed to the renders it caused. No new tracing dependency (D-19).

### 20.4 The three questions an operator must be able to answer

1. *Is the queue draining?* — `pdf_job_queue_depth` plus the cron summary lines.
2. *Is any org silently failing to render?* — `pdf_job_failed_total` by org, plus `#220` for a specific run.
3. *Did we lose objects?* — `pdf_cache_object_missing_total` and `pdf.record.object_missing`.

If any of the three cannot be answered after Phase 3 ships, the observability work is not done.

---

## 21. Engine Parity Harness (C-9, OD-7)

### 21.1 What parity means here

**Field-level, not pixel-level.** The claim Phase 3 makes is: *for the same input, the HTML engine prints the same set of labelled values as the PDFKit engine.* It does **not** claim identical layout, pagination or bytes — D-16 already records that Chromium output is not byte-reproducible.

### 21.2 Mechanism, with zero new dependencies

```
tests/unit/pdf/helpers/pdf_text.js        extractText(buffer) -> string[]
```

PDFKit compresses its content streams, and `zlib` is a Node builtin, so the extractor: walks the PDF bytes for stream objects, `inflateSync`s those with `/FlateDecode`, and collects the operands of the text-showing operators (`Tj`, `TJ`, `'`, `"`). Because `pdf_layout.createDocument` uses only the built-in Helvetica faces (verified — no embedded subset), the operands are literal WinAnsi strings, so no font-decoding is needed. Roughly 60 lines, no dependency, and it is test-only code that never ships in a request path.

The HTML side is **not** rendered in unit tests — the renderer is stubbed, and there is no Chromium in CI. Its printed values are taken from the view model, which is sound because lint rule 5 already proves a bijection between declared fields and fields the template consumes: a value in the view model is printed, and a printed value is in the view model.

### 21.3 The assertions

For each of the three documents, over a fixture matrix (§24.3):

1. **No printed value is lost.** Every money/date/identity token `extractText(pdfkitBuffer)` contains appears in the flattened view model.
2. **No value is invented.** Every leaf string in the view model appears in the PDFKit text, except keys on an explicit allow-list of HTML-only scaffolding (`template_marker`, CSS-bearing keys).
3. **Money formatting is identical**, because both sides call the same `formatMoney`. Asserted by equality of the sorted multiset of money-shaped tokens, which catches a sign flip, a rounding change or a dropped total.
4. **Section presence matches**: a section the PDFKit renderer omits for empty data is `null` in the view model, and vice versa.
5. **The pinned date matches** — the same string on both sides.
6. **Row counts match** per table.

### 21.4 The limit, stated plainly

This harness proves *content* parity. It cannot prove that the HTML renders legibly, paginates sensibly, or fits A4. That is discharged by a **manual visual check, once per template, recorded as evidence in the completion report** (§24.6): a real render of each of the three templates against the fixture matrix, eyeballed side by side with the PDFKit output, with the reviewer and date noted. This is a deliberate, documented limit of a zero-dependency approach, not an oversight. Anyone who later wants automated layout regression must add a dependency, and that is a D-19 conversation, not a Phase 3 one.

---

## 22. Feature Chains

Every significant feature is traced through the full chain. A link that genuinely does not apply says **not applicable** and why — an empty cell would be ambiguous.

### F-1 — Migration `00057` and the four org settings

| Link | Detail |
|---|---|
| Requirement | Phase 3 needs a durable queue and four per-org knobs; P1 deferred both (C-3, C-4) |
| Existing dependency | `payroll_settings` singleton and its `getOrCreate`; migration `00056` as the predecessor; `organizations` for the FK |
| Database impact | New table `pdf_render_jobs` (§5.1); four columns on `payroll_settings` (§5.2); five new enum types; six indexes/CHECKs. No change to `pdf_render_artifacts` or `payslips`. |
| API impact | `#22`/`#23` gain four keys (§9.4). No other endpoint changes. |
| Business logic | Defaults reproduce today's behaviour exactly: `pdf_render_engine = 'pdfkit'`. Turning Phase 3 on is an explicit org decision. |
| PDF generation impact | None directly — the migration only makes the later features possible |
| Validation | Joi on the four keys (§9.4); DB CHECKs on the two integers; the engine transition guard `PDF_RENDERER_NOT_CONFIGURED` |
| Authorization | `#23` is `hrAuth` only; platform roles cannot reach it |
| Storage/file impact | Not applicable — no object storage involvement |
| Failure handling | Single transaction; guarded DDL so a partial apply is re-runnable; a safe `down()` (§5.4) |
| Testing | Static migration test (up/down symmetry, index and CHECK names, enum label sets equal to the artifact table's); settings validator tests for each bound; a test that defaults leave behaviour unchanged |
| Acceptance | `00057` exists, is **not run** by the implementer, is registered in `migration_registry.md`, and the four keys appear in the org settings registry as `#87`–`#90` with defaults documented |

### F-2 — Template loader promotion

| Link | Detail |
|---|---|
| Requirement | Payroll needs identical assembly semantics over a different root without copying the loader (§3.5) |
| Existing dependency | `src/modules/document/utils/template_loader.utils.js` and its four existing tests |
| Database impact | Not applicable |
| API impact | Not applicable — internal utility |
| Business logic | Not applicable — no business rule |
| PDF generation impact | Both engines' HTML paths assemble through one implementation, so an include bug cannot exist in one place only |
| Validation | A throw on an unresolved `<!--#include -->` marker and on a missing file, preserved verbatim |
| Authorization | Not applicable |
| Storage/file impact | Reads template files from disk only; per-instance cache Map so the two roots cannot collide |
| Failure handling | Unchanged: throws rather than emitting a blank template — a blank PDF is worse than an error |
| Testing | The four existing document loader tests must pass **unchanged**; new tests for root isolation and for the payroll root |
| Acceptance | `src/common/utilities/template_loader.utils.js` exists, the document module is a thin binding, no document caller or test was edited |

### F-3 — Payroll registry, `payslip/v1.html`, `buildPayslipView`

| Link | Detail |
|---|---|
| Requirement | An HTML payslip that prints exactly what the PDFKit payslip prints (§7.4) |
| Existing dependency | `payslip_pdf.utils.js` (the behavioural spec), `payslip_snapshot.utils.js` (the input), `pdf_format.utils.js` (shared formatting), the lint harness |
| Database impact | Not applicable — reads `payslips.snapshot`, writes nothing |
| API impact | None yet; F-6 wires the endpoints |
| Business logic | Formatting, masking (`XXXX{last4}`) and section-presence decisions live in the builder; the template only prints (D-3) |
| PDF generation impact | The A4 portrait template plus three partials; self-contained CSS, no webfont, no external URL (D-18) |
| Validation | Ten lint rules with `audience: 'payroll'` (§7.3); the builder throws on a snapshot missing `SCHEMA_VERSION` or `figures` |
| Authorization | Not applicable — a pure function of an already-authorized snapshot |
| Storage/file impact | Not applicable |
| Failure handling | A builder throw happens before any renderer call, so a malformed snapshot costs nothing and creates no artifact |
| Testing | Lint; golden assembled-HTML fixture; builder unit tests over the §24.3 matrix; the F-14 parity assertions |
| Acceptance | The template lints, assembles byte-identically to its golden fixture, and parity passes for every fixture |

### F-4 — `annual_statement/v1.html`, `buildAnnualStatementView`

| Link | Detail |
|---|---|
| Requirement | An HTML annual statement matching `annual_statement_pdf.utils.js` |
| Existing dependency | that renderer, and the dataset shape it documents |
| Database impact | Not applicable |
| API impact | `#184`/`#193` change byte source only (F-6) |
| Business logic | **All twelve months are always emitted, zero-filled, never gapped** — a missing month reads as missing salary |
| PDF generation impact | A 13-column grid in portrait A4, matching the PDFKit layout choice |
| Validation | Lint; the builder asserts exactly twelve month entries |
| Authorization | Not applicable |
| Storage/file impact | **Never persisted** — no durable source row and a `now` pinned date (§8.2) |
| Failure handling | As F-3 |
| Testing | Lint, golden fixture, builder tests including an all-zero year and a mid-year joiner, parity |
| Acceptance | Parity passes; no artifact row is ever created for an annual statement (asserted) |

### F-5 — `form16_part_b/v1.html`, `buildForm16View`

| Link | Detail |
|---|---|
| Requirement | An HTML Form 16 Part B matching `form16_pdf.utils.js` |
| Existing dependency | `employee_tax.service.getForm16()`, `employee_tax_summaries` (`form16_snapshot`, `finalized_at`) |
| Database impact | Not applicable — read only |
| API impact | `#185`/`#194` change byte source only |
| Business logic | `is_provisional` selects the `(PROVISIONAL)` title — the only conditional in the payroll templates. `employer.tan` is always `null` (D-47) and is rendered as such, not omitted. |
| PDF generation impact | A4 portrait template |
| Validation | Lint; the builder requires `financial_year` and the totals block |
| Authorization | Not applicable |
| Storage/file impact | Persisted **only** when finalised, `source_type = 'form16'`, `source_id = <summary id>`. A provisional Form 16 is never cached. |
| Failure handling | As F-3 |
| Testing | Lint, golden fixture, provisional and finalised fixtures, an assertion that a provisional render creates no artifact, parity |
| Acceptance | Parity passes for both states; no provisional artifact exists |

### F-6 — `payroll_pdf.service.js` and the engine flag

| Link | Detail |
|---|---|
| Requirement | One place in payroll that chooses an engine (D-24), so the rest of payroll cannot learn about engines |
| Existing dependency | `pdf_render.service.js`, `payroll_settings.service.js`, `payslip_read.service.js`, the three PDFKit utilities, the three builders |
| Database impact | Reads `payroll_settings`; reads/writes `pdf_render_artifacts` through the repository |
| API impact | Eight endpoints swap their render call for a facade call. **No path, parameter, status code, header, filename or ledger change.** |
| Business logic | Engine selection (§8.1) and the cacheability rule (§8.2), including the held-payslip PDFKit fallback (DV-3) and the purged-source fallback |
| PDF generation impact | The single `pdfkit \| html` branch; `engine` is threaded into the pipeline |
| Validation | Asserts `resolved` carries a snapshot and a pinned date; refuses to render without a pinned date, matching `createDocument`'s existing contract |
| Authorization | **Inherits only.** Takes `resolved` from the read service and makes no access decision; a test asserts the file contains no role or ownership comparison |
| Storage/file impact | Persists via `renderForSource` for cacheable sources; otherwise renders without persisting |
| Failure handling | §8.3 steps 16–18: `PDF_RENDER_IN_PROGRESS` and a source-index `23505` become successful inline renders, never user-visible errors |
| Testing | Engine-matrix tests for all eight endpoints; held/ephemeral/purged/revoked fallback tests; a grep test proving exactly one file in `src/modules/payroll/` mentions an engine |
| Acceptance | With the default setting, every existing payroll PDF test passes unmodified; with `html`, every endpoint returns a verified PDF |

### F-7 — The payslip artifact cache

| Link | Detail |
|---|---|
| Requirement | Serve a released payslip's bytes from storage instead of re-rendering (the point of the phase) |
| Existing dependency | `pdf_render_artifacts` and its partial unique index; `loadStoredBytes`; `buildGeneratedPdfKey` |
| Database impact | No schema change. Six repository additions (§6.2), two of them grep-named escape hatches. |
| API impact | Not applicable — invisible to clients except as latency |
| Business logic | Cacheability (§8.2); one live artifact per payslip; a superseded version keeps its own artifact |
| PDF generation impact | A hit performs no render at all |
| Validation | `input_hash` equality is what makes a hit valid; a mismatch is a `PDF_IDEMPOTENCY_CONFLICT`, which §8.4 argues is unreachable and §16.4 therefore alerts on |
| Authorization | The cache is read **only after** the resolver returns (§18.2) — the IDOR-critical property of the phase |
| Storage/file impact | `putObject` on a miss, `getObject` on a hit, same key scheme as letters; `storage_key` never leaves the repository |
| Failure handling | Object gone → §8.6; transient `getObject` error → inline render, no repair enqueued, separate counter |
| Testing | Hit/miss/repair paths; a cross-org probe returning nothing; a `SAFE_ATTRIBUTES` leak test; a `repairReady`-on-`record` no-op test |
| Acceptance | A second download of the same released payslip performs zero renderer calls (asserted with a stubbed renderer counter) |

### F-8 — Render queue, worker and cron

| Link | Detail |
|---|---|
| Requirement | D-9: bulk must never be N synchronous renders on a request thread |
| Existing dependency | `document_notification.repository.claimBatch` (the proven SQL shape), `document_notification_dispatch.cron.js` (the cron shape), `payroll_automation.service._forEachOrg` |
| Database impact | `pdf_render_jobs` (F-1); no other table |
| API impact | Not applicable here — `#219`/`#220` are F-10 |
| Business logic | Claim-with-increment, bounded concurrency 4, `max_attempts` 3, backoff 2/10/30 min, stale reclaim at 10 min, transient-vs-deterministic failure classification (§15.3) |
| PDF generation impact | The worker calls the same facade path a request would, so a queued render and an inline render cannot diverge |
| Validation | A Phase 3 job with a NULL `source_id` is rejected at enqueue; `template_version` is pinned at enqueue (EC-P3-5) |
| Authorization | Not applicable for the cron (system context). `#219`'s authorization is F-10. The worker is org-scoped by `claimBatch(orgId)`, so no cross-tenant render is possible. |
| Storage/file impact | Persists artifacts exactly as an inline miss does |
| Failure handling | §16.4 — including the "`markDone` failed after `markReady` succeeded" case, which completes on re-claim without re-rendering |
| Testing | Two concurrent claims returning disjoint sets; stale reclaim; attempt exhaustion; a poison job not blocking its siblings; a test asserting no transaction is open during the render callback |
| Acceptance | A 500-payslip cold run drains through the cron with a bounded 4-in-flight profile and zero duplicate renders |

### F-9 — Warm-up enqueue on publish

| Link | Detail |
|---|---|
| Requirement | By the time HR downloads, the run should already be rendered (§11.3) |
| Existing dependency | `payslip.service.createForApproval` and `publish` (`#171`); `payslipRepo.publishRun`; `payrollSettingsService.getOrCreate(orgId, transaction)` |
| Database impact | One `INSERT … SELECT … ON CONFLICT DO NOTHING` inside each existing transaction |
| API impact | None. `#171`'s response is unchanged. |
| Business logic | Gated on `pdf_render_engine = 'html'` **and** `payslip_prerender_on_publish`; the `WHERE` enforces `visible_to_employee = true AND published_at IS NOT NULL`, so held rows are excluded in SQL, not in JavaScript |
| PDF generation impact | Shifts rendering from download time to publish time |
| Validation | Not applicable — no user input |
| Authorization | Inherited from `#171` (`hrAuth`) |
| Storage/file impact | Indirect: objects appear as the queue drains |
| Failure handling | Atomic with publish — a rollback leaves no jobs. An enqueue failure fails the publish, which is correct: publishing is the business fact, and if we cannot record the intent to render we should not pretend we did. A retried publish re-enqueues idempotently. |
| Testing | Auto-publish on/off; explicit release; double publish inserting zero the second time; a rollback leaving zero jobs; engine `pdfkit` enqueuing nothing; a settings flip after publish enqueuing nothing (lazy warm-up) |
| Acceptance | One live job per released payslip, never two, and never one for a held payslip |

### F-10 — `#219` drain and `#220` status

| Link | Detail |
|---|---|
| Requirement | HR needs to force a warm-up (after a settings flip) and to see progress behind a `202` |
| Existing dependency | `#215` calendar-reminders as the `/jobs/*/run` precedent; `payroll_hr.validator.js`; `payroll_hr.routes.js` |
| Database impact | Reads and writes `pdf_render_jobs`; reads `pdf_render_artifacts` and `payslips` for the counts |
| API impact | **Two new endpoints**, `#219` and `#220` (DV-1, DV-2). Both additive; nothing existing changes. |
| Business logic | `#219` optionally enqueues a run at priority 50 then drains, bounded. `#220` reports `ready + uncacheable === total` as the "ZIP will stream" condition. |
| Validation | Joi body `{ run_id?: uuid }` for `#219`; `#220` validates `batch_id` **inside the controller** because Express 5 makes `req.query` getter-only |
| Authorization | `hrAuth` + the payroll feature gate; the run is resolved org-scoped with the existing uniform `404`; platform roles never reach either route |
| Storage/file impact | Indirect, via the renders it triggers |
| Failure handling | `#219` with the engine off returns `200` with zero counts, not an error. A per-job failure is reported in the counts, not thrown. |
| Testing | Auth matrix (self/manager/platform/cross-org all denied); engine-off response; concurrent `#219` and cron; `#220` counts across every payslip state |
| Acceptance | Both endpoints registered in the API registry as `#219`/`#220` with the auth matrix documented |

### F-11 — Bulk ZIP from cache, with the `202`

| Link | Detail |
|---|---|
| Requirement | Serve a run's ZIP without N synchronous renders, while preserving today's behaviour for `pdfkit` orgs |
| Existing dependency | `buildRunZip`, `zip_writer.utils.js` (`ZIP_MAX_ENTRIES = 20000`), `download.helper.streamChunks`, `hrPayslipsForDownload` |
| Database impact | One batched `findReadyBySourceIds`; one enqueue transaction on the `202` path |
| API impact | `#174` **may return `202 application/json`** when the engine is `html` and the cohort is cold (C-10). This is the phase's only client-visible change and requires the `md_updates` record (§26.4). |
| Business logic | §11.1. The threshold counts only renders the queue could satisfy; held/ephemeral rows render inline via PDFKit and are not counted, because no queue path can ever satisfy them |
| PDF generation impact | A mixed-engine ZIP is legal; a mixed-engine document is not (EC-35) |
| Validation | The empty-run and `ZIP_MAX_ENTRIES` checks stay exactly where they are — **before** the export row opens (D-48) |
| Authorization | Unchanged `hrAuth` + the existing run resolution |
| Storage/file impact | One `getObject` per hit, streamed one entry at a time; O(1) memory in the cohort |
| Failure handling | §16.3, including the unchanged mid-stream contract (`failExport` + `res.destroy`, rethrow only before the first byte) |
| Testing | `pdfkit` engine byte-identical to today; all-hit, all-miss, mixed, held-only, over-threshold, exactly-at-threshold; mid-stream failure; repeated cold calls not duplicating jobs; entry order and filenames stable |
| Acceptance | For a `pdfkit` org the existing `#174` tests pass unmodified; for an `html` org a warm run streams with zero renderer calls |

### F-12 — Cache purge cron

| Link | Detail |
|---|---|
| Requirement | Cache objects must not accumulate forever (D-23, narrowed by C-8) |
| Existing dependency | `document_automation`'s object-before-row sweep discipline; `_forEachOrg`; the S3 client |
| Database impact | `markPurged` updates; bounded deletes of terminal jobs older than 90 days |
| API impact | Not applicable |
| Business logic | Per-org `pdf_cache_retention_days` (default 400 ≈ 13 months); `cache` class only; 500 per org per run |
| PDF generation impact | A purged source renders inline thereafter and can never be re-cached (EC-P3-6) |
| Validation | `retention_class = 'cache'` and `storage_key IS NOT NULL` are **SQL predicates**, not JavaScript guards |
| Authorization | Not applicable — system cron, cross-org by design through the named escape hatch |
| Storage/file impact | `deleteObject` **then** `markPurged`; the reverse order would orphan objects forever |
| Failure handling | A delete failure leaves the row for tomorrow; a crash between the two steps leaves an EC-19 case, which is already handled |
| Testing | A `record` artifact is never a candidate; a preview/ephemeral row with no key is never a candidate; delete-then-mark ordering; the bound is respected; a purge racing a repair changes nothing twice |
| Acceptance | Registered in `cron_registry.md` at 04:10 IST; a `record` artifact is provably unreachable from this cron |

### F-13 — EC-19 object-loss handling

| Link | Detail |
|---|---|
| Requirement | P2 handed object-loss detection to Phase 3 (OD-P2-2, §22.6) |
| Existing dependency | `loadStoredBytes` returning `null`; `findForRenderById` (zero callers until now); `pdf_artifact_sweeper.cron.js` |
| Database impact | No schema change. `repairReady` for `cache`; **no mutation at all** for `record`. |
| API impact | Not applicable — the user's download succeeds either way |
| Business logic | C-11: `cache` self-repairs, `record` is report-only. The live-source unique index is the repair mutex, so no advisory lock and no network call inside a transaction. |
| PDF generation impact | A repair re-renders from the frozen snapshot; the new bytes may differ (D-16), which is why `content_hash` is rewritten (DV-4) |
| Validation | `snapshot_hash` must still match; otherwise `PDF_REPAIR_SOURCE_DRIFT`, refuse, alert |
| Authorization | The request path's repair is triggered only after authorization; the sweeper is system context |
| Storage/file impact | Overwrites the same key; never writes a second key for the same artifact |
| Failure handling | A failed repair leaves the artifact `ready` with a missing object, so the next download repeats the cycle and the counter keeps rising — visibly, not silently |
| Testing | Missing object serving an inline render + enqueuing exactly one repair; two concurrent detections enqueuing one job; a drifted snapshot refusing repair; a `record` artifact only logging; a transient `getObject` 500 not enqueuing a repair |
| Acceptance | `pdf_cache_object_missing_total` and `pdf.record.object_missing` both exist and fire in tests; OD-P2-2 is closed in the completion report |

### F-14 — Parity harness

| Link | Detail |
|---|---|
| Requirement | OD-7: prove the HTML engine prints what PDFKit prints, before any org is switched |
| Existing dependency | the three PDFKit renderers, the three builders, `pdf_format.utils.js`, Node's `zlib` |
| Database impact | Not applicable — test-only |
| API impact | Not applicable |
| Business logic | Not applicable — it asserts existing logic rather than adding any |
| PDF generation impact | It is the gate that allows `pdf_render_engine = 'html'` to be recommended at all |
| Validation | Six assertions (§21.3) over the §24.3 fixture matrix |
| Authorization | Not applicable |
| Storage/file impact | Not applicable — no file is written; buffers only |
| Failure handling | A parity failure fails the build. It is not advisory. |
| Testing | It *is* the test. Plus a self-test of the extractor against a hand-built PDFKit document with known strings, so a silently-returning-empty extractor cannot make parity pass vacuously. |
| Acceptance | Parity green for all three documents across every fixture; the extractor self-test proves it is not vacuous; the manual visual check is recorded with reviewer and date |

---

## 23. Implementation Sequence

Each step ends in a verifiable state. Do not start a step before its predecessor verifies. The order is chosen so that nothing user-visible changes until step 6, and so that parity is proven (step 4) before any endpoint can serve HTML.

| Step | Work | Verify |
|---|---|---|
| **0** | Pre-flight checks P-1…P-10 (§2) | all ten recorded in the completion report |
| **1** | Migration `00057`; `pdf_render_jobs` model; the four `payroll_settings` columns; settings validator + registry entries `#87`–`#90` | migration static tests pass; settings `GET`/`PUT` tests pass; **migration not run**; full suite still green |
| **2** | Promote the template loader; rebind the document module | the four existing loader tests pass **unmodified**; root-isolation test passes |
| **3** | Payroll registry; lint `audience` option; `payslip/v1.html` + `buildPayslipView` + golden fixture | lint green for both registries; golden fixture byte-identical; builder unit tests green |
| **4** | `pdf_text.js` extractor + its self-test; payslip parity assertions | parity green over the fixture matrix; the extractor self-test proves non-vacuity |
| **5** | `pdf_render.service` `engine` param + `renderForSource`; the six artifact repository methods | existing P1/P2 render tests pass unmodified; new repository tests green, including the `repairReady`-on-`record` no-op |
| **6** | `payroll_pdf.service.js`; wire `#170`, `#186`, `#191` | with the default engine, every existing payslip PDF test passes **unmodified**; with `html`, a released payslip returns a verified PDF and a second call performs zero renderer calls; a held payslip uses PDFKit |
| **7** | Jobs repository; `pdf_render_worker.service.js`; `pdf_render_worker.cron.js`; `payrollAutomation.runPayslipRender`; register the cron | claim/reclaim/backoff/exhaustion tests green; a disjoint-claim test green; the no-open-transaction-during-render test green |
| **8** | Warm-up enqueue in `createForApproval` and `publish` | one live job per released payslip; zero for held; a rollback leaves zero; a double publish inserts zero the second time |
| **9** | `#219` and `#220` + routes, validator, registry | auth matrix green; engine-off response green; `#220` counts correct across every payslip state |
| **10** | `#174`: plan, threshold, `202`, cache streaming, PDFKit fallback for held rows | `pdfkit` path byte-identical to today; `html` warm path zero renderer calls; over-threshold returns `202` and enqueues once; mid-stream failure contract unchanged |
| **11** | EC-19: request-path detection + repair enqueue; worker repair; `runArtifactVerification` in the existing sweeper | one repair job per loss; drift refused; `record` class only logged; transient 500 not mistaken for loss |
| **12** | `pdf_cache_purge.cron.js` + terminal-job cleanup; register the cron | `record` artifacts unreachable; delete-then-mark ordering asserted; bounds respected |
| **13** | Annual statement template + builder + parity; wire `#184`/`#193` | parity green; no artifact row ever created for an annual statement |
| **14** | Form 16 template + builder + parity; wire `#185`/`#194` | parity green for provisional and finalised; no provisional artifact |
| **15** | Full suite; grep tests (single engine branch, no PII in logs, escape hatches not called from controllers) | **2069 + new tests, 0 failures** |
| **16** | Docs: `md_updates` record, four registries, `phase3_api_analysis.md`, `phase3_business_walkthrough.md`, completion report incl. the manual visual-check evidence and the migration hand-back | every §0.4 deliverable exists |

Steps 13 and 14 come last deliberately: the payslip is the high-volume, cache-critical document, and the other two are read-only, uncached (or rarely cached) variations on the same machinery. If the phase has to be cut short, stopping after step 12 leaves a coherent, shippable system.

---

## 24. Testing Requirements

`node:test`, unit only, no database, no network — the module's existing discipline (D-10). The renderer and S3 are stubbed; every stub counts its calls, because "zero renderer calls on a cache hit" is an assertion, not a hope.

### 24.1 New test files

```
tests/unit/pdf/helpers/pdf_text.js                     (helper + its own self-test)
tests/unit/pdf/payroll_template_lint.test.js
tests/unit/pdf/payroll_template_assembly.test.js
tests/unit/pdf/payslip_view_builder.test.js
tests/unit/pdf/annual_statement_view_builder.test.js
tests/unit/pdf/form16_view_builder.test.js
tests/unit/pdf/engine_parity_payslip.test.js
tests/unit/pdf/engine_parity_annual_statement.test.js
tests/unit/pdf/engine_parity_form16.test.js
tests/unit/pdf/template_loader_promotion.test.js
tests/unit/payroll/payroll_pdf_service.test.js
tests/unit/payroll/payroll_pdf_cache.test.js
tests/unit/payroll/payslip_render_queue.test.js
tests/unit/payroll/payslip_warmup_enqueue.test.js
tests/unit/payroll/payroll_bulk_zip_engine.test.js
tests/unit/payroll/payroll_render_jobs_endpoints.test.js
tests/unit/pdf/pdf_cache_purge.test.js
tests/unit/pdf/pdf_object_loss.test.js
tests/unit/migrations/00057_pdf_render_jobs.test.js
```

### 24.2 Tests that must pass **unmodified**

This list is the backward-compatibility proof. If any of these needs editing, the change is not backward compatible and must be justified in the change record.

- every existing payroll PDF test (`#170`, `#174`, `#184`, `#185`, `#186`, `#191`, `#193`, `#194`)
- every existing PDFKit renderer and `pdf_layout` test
- the four document template-loader tests
- every P1/P2 `pdf_render.service` and artifact-repository test
- the existing letter lint tests
- the existing `pdf_artifact_sweeper` tests

### 24.3 Fixture matrix (used by the builders and by parity)

| Fixture | Exercises |
|---|---|
| Minimal payslip | one earning, one deduction, no reimbursements, no employer contributions, no notes |
| Full payslip | every section populated, multiple notes and warnings |
| Reissued payslip (`version = 2`) | the `Revised (version N)` subtitle |
| LOP payslip | `lop_amount` non-zero |
| Zero-net payslip | `net_pay = 0`, and a negative net if the engine permits one |
| Long-name payslip | a 120-character employee name and a 10-line employer address (overflow) |
| Unicode payslip | Devanagari name and address (font coverage — a known risk, §29) |
| Held payslip | `published_at = null` ⇒ PDFKit fallback |
| Ephemeral payslip | `persisted: false` ⇒ no `source_id` |
| 40-component payslip | pagination and the page-break guard |
| Annual statement, full year | twelve populated months |
| Annual statement, mid-year joiner | zero-filled leading months |
| Form 16 provisional | `is_provisional: true` |
| Form 16 finalised | frozen `form16_snapshot`, cacheable |

### 24.4 Concurrency and failure tests (the ones that matter most)

Every row of §14.3 and §16.2–§16.4 gets a test. Specifically: two concurrent uncached downloads both succeeding with one persisted artifact; two workers claiming disjoint sets; a stale claim reclaimed; attempts exhausted; a publish rollback leaving no jobs; a double publish; object loss enqueuing exactly one repair; a purge racing a repair; a renderer `400` never retried; a `%PDF-` verification failure never served.

### 24.5 Grep/architecture tests

1. Exactly one file under `src/modules/payroll/` matches `/'pdfkit'|pdf_render_engine/`.
2. No file under `src/modules/payroll/` requires from `src/modules/document/`.
3. `findByIdWithKey`, `findForRenderById`, `findStalePendingForSweep`, `findPurgeCandidates` and `findReadyRecordsForVerification` are not referenced from any `controllers/` directory.
4. `payroll_pdf.service.js` contains no role name and no user-id comparison.
5. The new log call sites contain none of the forbidden PII field names.
6. Both enum label sets in `00057` equal the artifact table's.

### 24.6 Manual verification (recorded as evidence, not automated)

Because the renderer is stubbed in CI, these must be performed once against a real renderer and written into the completion report with the date and the reviewer:

1. Render all three templates against the full fixtures and confirm they are legible, correctly paginated A4, and field-identical to the PDFKit output side by side.
2. Confirm the Unicode fixture renders without tofu, or record the limitation explicitly (§29).
3. Confirm a 500-payslip cold run drains through the worker and that the subsequent `#174` streams a complete, openable ZIP.
4. Confirm a deliberately deleted S3 object produces a successful download plus exactly one repair, and that the repaired object is readable afterwards.

---

## 25. Migration & Deployment

### 25.1 Deployment order

1. Deploy the code. With `pdf_render_engine` absent (pre-migration) the settings read falls back to `'pdfkit'`, so **the code is safe to deploy before the migration runs**. Every payroll PDF path behaves exactly as it does today.
2. Operator runs `00057`.
3. The two new crons begin running. Both are no-ops for every org until an engine is switched: the worker skips non-`html` orgs, and the purge finds no `cache`-class artifacts because none exist.
4. Enable one pilot org: `PUT /payroll/hr/settings { "pdf_render_engine": "html" }`.
5. Warm it up with `#219 { run_id }` for a recent run, then compare a downloaded payslip against the PDFKit output for the same payslip (the manual check of §24.6).
6. Roll forward org by org.

The settings fallback in step 1 must be explicit in the service, not accidental: read the column defensively (`settings.pdf_render_engine || 'pdfkit'`) so an unmigrated database cannot produce `undefined` and fall into the `html` branch. A test covers a settings object with the key absent.

### 25.2 Migration hand-back (standing constraint)

**The implementer does not run `00057`, does not run `db:migrate`, and makes no connection to the remote database.** Verification is static plus unit tests. The completion report must hand back:

- the file path `src/infrastructure/postgres-sql/migrations/00057-create-pdf-render-jobs.js`
- what it creates: one table, four columns, five enum types, four indexes, two CHECKs
- that adding the four `payroll_settings` columns is metadata-only on PostgreSQL 11+ (§5.4.3), so a fast migration is expected
- that `down()` is **safe** — it destroys queue state and configuration only, never render evidence, unlike `00055`'s `down()`
- the unrun-migration backlog it joins: `00050`, `00051` (whose `down()` destroys evidence tables), `00053`, `00055`, `00056`, seeder `010`, and now `00057`

### 25.3 Feature flag posture (D-22)

Three independent gates, all defaulting to today's behaviour:

| Gate | Default | Effect when off |
|---|---|---|
| `pdf_render_engine` | `pdfkit` | the entire phase is inert for that org |
| `payslip_prerender_on_publish` | `true` | no warm-up; the cache fills lazily on first download |
| `pdf_bulk_inline_miss_threshold` | `50` | raise it to force inline streaming; lower it to force the `202` path |

### 25.4 Rollback

**Code rollback:** safe at any time. Artifacts and jobs are additive rows; the previous code ignores them.

**Behavioural rollback (the one that matters operationally):** set `pdf_render_engine` back to `'pdfkit'`. Takes effect on the next request, requires no deploy, and needs no data cleanup. Existing artifacts stop being read; queued jobs age harmlessly; the purge eventually reclaims the objects. This is the documented incident response for "the HTML payslip looks wrong" or "the renderer is down", and it is why the flag is per-org rather than global.

**Migration rollback:** `down()` is safe (§25.2) but unnecessary — the schema is inert while the flags are off.

---

## 26. Backward Compatibility

### 26.1 Guarantees

| Surface | Guarantee |
|---|---|
| The eight PDF endpoints | path, method, auth, parameters, status codes, headers, filenames and export-ledger behaviour unchanged |
| `#171` publish | response unchanged; one extra `INSERT … SELECT` inside its existing transaction |
| `#22`/`#23` settings | four additive keys; every existing key untouched |
| PDFKit renderers and `pdf_layout` | not edited at all |
| Document module | only the loader binding changes; no caller and no test edited |
| `pdf_render.service` / artifact repository | additive only; the new `engine` parameter defaults to `'html'`, preserving every P1/P2 call site |
| Database | purely additive; no column dropped, renamed or re-typed; no backfill |
| Existing tests | the §24.2 list must pass **unmodified** |

### 26.2 The one client-visible change

`#174` may return `202 application/json` instead of a ZIP — **only** for an org with `pdf_render_engine = 'html'` **and** a cohort colder than the threshold. Unreachable for any org that has not opted in.

### 26.3 Two behaviour differences a user could notice after opting in

1. **Layout.** An HTML payslip is not pixel-identical to a PDFKit payslip. Content is field-identical and proven so; typography and spacing differ. Anyone comparing an old download with a new one will see it. This must be in the change record and in the pilot communication — discovering it from a support ticket is worse than reading it in a release note.
2. **Held vs released review copies.** A held payslip reviewed by HR is PDFKit-rendered; after release, the employee's copy is HTML-rendered (DV-3/C-5). Same fields, same values, different layout. §30 OD-P3-1 asks the business to confirm this is acceptable.

### 26.4 `md_updates` change record (required)

`public/md_updates/pdf_generation_phase3_payroll_render_2026_xx_xx.md`, dated on the day of the change, containing:

- `#174` may return `202 { run_id, batch_id, total, ready, queued, poll_url }` when the engine is `html` and the cohort is cold — with the exact body shape and the advice to poll `#220`
- `#219` and `#220`: full request/response shapes, auth, error codes
- `#22`/`#23`: the four new settings keys with types, bounds and defaults
- an explicit statement that `#170`, `#184`, `#185`, `#186`, `#191`, `#193`, `#194` are **unchanged** in every respect — frontends need to know what they do *not* have to touch
- the layout-difference warning from §26.3

---

## 27. Production-Readiness Checklist

Phase 3 is not production-ready until every line is true.

**Correctness**
- [ ] Parity green for all three documents across the full fixture matrix; the extractor self-test proves non-vacuity
- [ ] Manual visual check recorded with reviewer and date (§24.6)
- [ ] With the default engine, every test in §24.2 passes unmodified
- [ ] A second download of a released payslip performs zero renderer calls
- [ ] No artifact is ever created for a held, ephemeral or provisional document

**Concurrency & integrity**
- [ ] Every row of §14.3 has a passing test
- [ ] No transaction spans a renderer or S3 call (asserted)
- [ ] One live job and one live artifact per payslip (index-enforced, tested)
- [ ] A publish rollback leaves zero jobs

**Failure handling**
- [ ] A renderer `400` is never retried; a timeout is retried exactly once
- [ ] Bytes failing `%PDF-`/`%%EOF` verification are never served or stored
- [ ] Object loss produces a successful download plus exactly one repair
- [ ] `record`-class artifacts are never mutated by any Phase 3 code path (asserted)
- [ ] Mid-stream ZIP failure keeps the existing contract

**Security**
- [ ] `payroll_pdf.service.js` makes no authorization decision (asserted)
- [ ] No response contains an artifact id or a storage key
- [ ] Escape-hatch repository methods are unreachable from controllers (asserted)
- [ ] Cross-org probes return nothing; uniform denial preserved on all three planes
- [ ] No new log line contains salary, name, bank or key data (asserted)
- [ ] **D-14 renderer authentication is in place.** This is the module's release blocker: no org may be switched to `html` while the renderer is unauthenticated.

**Operations**
- [ ] `00057` authored, registered, handed back **unrun**
- [ ] Both crons registered in `src/server.js` and `cron_registry.md`; neither rethrows
- [ ] All eight counters and the three durations emit
- [ ] The three operator questions of §20.4 are answerable
- [ ] Rollback tested: flipping back to `pdfkit` restores prior behaviour with no deploy and no cleanup

**Documentation**
- [ ] All seven §0.4 deliverables exist
- [ ] Four registries updated (API `#219`/`#220`; org settings `#87`–`#90`; migration `00057`; crons ×2)
- [ ] `md_updates` record written per §26.4

---

## 28. Acceptance Criteria

Phase 3 is complete when all of the following are objectively true.

1. Migration `00057` exists, is registered, and has **not** been run by the implementer.
2. Org settings `#87`–`#90` exist with the defaults in §5.2 and are readable and writable through `#22`/`#23` with validation.
3. Three payroll templates exist, lint clean under `audience: 'payroll'`, and assemble byte-identically to their golden fixtures.
4. Three pure view builders exist and are covered by the full fixture matrix.
5. Field-level parity between the two engines is proven for all three documents, and the manual visual check is recorded.
6. `payroll_pdf.service.js` is the only file in `src/modules/payroll/` that names an engine (asserted by a grep test).
7. All eight PDF endpoints route through the facade with no change to path, parameters, auth, status codes, headers, filenames or ledger behaviour.
8. With `pdf_render_engine = 'pdfkit'`, behaviour is indistinguishable from the pre-Phase-3 system, and every test in §24.2 passes unmodified.
9. With `pdf_render_engine = 'html'`, a released payslip is rendered once and served from cache thereafter; a held payslip renders through PDFKit; an ephemeral payslip renders without persisting.
10. `pdf_render_jobs` drains through the worker with bounded concurrency, stale-claim reclaim, capped attempts and backoff, and no duplicate renders under concurrent workers.
11. Warm-up enqueues exactly one live job per released payslip, atomically with publish, and zero for held payslips.
12. `#219` and `#220` exist, are `hr`-only, and are registered.
13. `#174` streams from cache when warm and returns `202` with a poll target when cold and over threshold; the `pdfkit` path is unchanged.
14. EC-19 is closed: `cache`-class self-repair (single-flighted by the job index) and `record`-class report-only detection in the existing sweeper. OD-P2-2 is marked resolved.
15. `cache`-class purge runs daily, object-before-row, bounded, and provably cannot touch a `record` artifact.
16. The full suite is green: **2069 pre-existing tests plus the new ones, zero failures**, with the counts recorded in the completion report.
17. Every §27 checklist line is ticked, including D-14.
18. Every §0.4 deliverable is written, including the `md_updates` record.

---

## 29. Edge-Case Traceability

### 29.1 Phase 3's assigned edge cases, verbatim from the main plan's register

| EC | Requirement | Where it is handled | Refinement |
|---|---|---|---|
| EC-19 | Artifact `ready` but the S3 object is gone → re-render, compare `content_hash`; equal ⇒ repair silently, different ⇒ hard error, never a silent substitution (assigned to Phase 2, deferred to 3) | §8.6, §12.2, F-13 | **Split by retention class (C-11).** The hash comparison is impossible for Chromium output (D-16), so `cache` class repairs in place and rewrites the hash (DV-4), while `record` class is report-only and never mutated. The "never a silent substitution" intent is preserved exactly where it matters — evidence. |
| EC-29 | Payslip re-rendered after the employee's department changes → impossible: the builder reads only the frozen snapshot | §7.4 (`buildPayslipView` is pure over `snapshot`) | None. Also why `department_id` never enters the render path. |
| EC-30 | Payslip published but never downloaded → warm-up still renders it; the cache purge later reclaims the object and the row records it | §10.1, §12.1 | None |
| EC-31 | Bulk ZIP with 500 cache misses → over threshold ⇒ `202` + batch; under ⇒ inline renders bounded by the concurrency cap; never a silently short archive | §11.1 | The threshold counts only queue-satisfiable misses; held rows render inline via PDFKit because no queue path can ever satisfy them (C-5) |
| EC-32 | Renderer degraded during a ZIP stream after bytes were written → the existing `streamChunks` mid-stream contract applies; the ledger records the failure and the connection is destroyed rather than emitting a corrupt-but-complete ZIP | §11.2, §16.3 | None — the existing contract is reused verbatim |
| EC-33 | Worker instance dies holding claims → stale claims reclaimed after the claim timeout; `attempts` still increments so a poison job cannot loop forever | §10.3 rule 4, §13.2 | Reclaim lives inside `claimBatch`'s predicate rather than in a separate pass |
| EC-34 | Poison job → attempt cap → `failed` with a reason, alertable, never blocking the queue | §15.3, §16.4 | Deterministic failures fail immediately instead of burning three attempts |
| EC-35 | Org switches engine mid-month → artifacts record their `engine`; payslips already cached under `pdfkit` are served as they are, new ones render as HTML; no mixed document is ever produced | §8.1, §13.3 | **A PDFKit render is never persisted at all** (§8.1), so "already cached under `pdfkit`" cannot arise. The no-mixed-document invariant holds trivially. Simpler than the register assumed. |
| EC-36 | Migration run while payslips are being downloaded → all schema changes are additive; the `pdfkit` default means behaviour is unchanged until an org opts in | §5, §25.1 | The settings read is defensive (`|| 'pdfkit'`) so the code is also safe **before** the migration runs |

### 29.2 New edge cases discovered while reconstructing the scope

| ID | Case | Handling |
|---|---|---|
| EC-P3-1 | A held payslip has no immutable pinned date, yet only one live artifact per source is permitted | PDFKit fallback, never persisted (C-5, DV-3). The load-bearing decision of the phase. |
| EC-P3-2 | An ephemeral payslip has no `payslip_id` | rendered with `sourceId: null`, `persist: false`; never enqueued (C-7) |
| EC-P3-3 | Two concurrent downloads of the same uncached payslip | the loser's `409 PDF_RENDER_IN_PROGRESS` becomes a successful inline render, not an error (§8.3 step 16) |
| EC-P3-4 | A template version bump after artifacts exist | the cache is **not** invalidated; an old payslip may serve `v1` bytes while a new one is `v2`. Content parity makes this safe; forcing a re-render is not offered because a purged source can never be re-cached. |
| EC-P3-5 | A registry version bump while jobs are queued | `template_version` is pinned in the job row at enqueue |
| EC-P3-6 | A purged source can never be re-cached, because the source-level unique index excludes only `failed` | the facade treats a `purged` artifact as "render inline, never persist". Benign for payslips old enough to be purged; revisit in Phase 5. |
| EC-P3-7 | A transient S3 `getObject` 500 mistaken for object loss | classified separately: inline fallback, a distinct counter, **no** repair enqueued (§16.2) |
| EC-P3-8 | An annual statement or provisional Form 16 pins "now" | never cached — a cached artifact would serve a stale document date (§9.1) |
| EC-P3-9 | An org flips to `html` after publishing a run | no retro-enqueue; the cache fills lazily, or HR forces it with `#219 { run_id }` |
| EC-P3-10 | A repair races a purge | both updates are conditional on `status = 'ready'`; the loser changes zero rows and logs |
| EC-P3-11 | Devanagari or other non-Latin names | PDFKit is limited to Helvetica built-ins today, so this is an **existing** limitation, not one Phase 3 introduces. The HTML engine may render it *better*, which would itself be a visible difference. Verify in §24.6 step 2 and record the finding rather than assuming either outcome. |

---

## 30. Open Decisions

| ID | Question | Owner | Default if unanswered |
|---|---|---|---|
| OD-P3-1 | Is it acceptable that HR's held-payslip review copy is PDFKit-rendered while the released employee copy is HTML-rendered (same fields, different layout)? | Business / HR | **Yes** — proceed as in DV-3. The alternatives are worse: a Lambda storm on a large held ZIP, or removing a download HR has today. |
| OD-P3-2 | Should `pdf_bulk_inline_miss_threshold` default to 50? | Ops | 50. Revisit after the first pilot org's real render latency is known. |
| OD-P3-3 | Is 400 days the right cache retention? | Business | 400 (13 months). Long enough for a full financial year plus a month. |
| OD-P3-4 | Can a twelve-month annual statement grid be made legible in portrait A4, or should it move to landscape? | Design + Business | Portrait, matching PDFKit. Landscape would be a content/layout change (§1.3), so raise it rather than switch silently. |
| OD-P3-5 | Do report families (`#177`–`#180`) move to HTML, and in which phase? | Product | Out of Phase 3. They have no immutable cacheable source and were never in the main plan's Phase 3 template list. |
| OD-P3-6 | Should a purged payslip be re-cacheable (needing a `00055` index change to exclude `purged`)? | Ops, after usage data | No change in Phase 3. Inline rendering of very old payslips is acceptable; revisit in Phase 5 if the miss rate says otherwise. |
| OD-P2-2 | *(inherited)* Object-loss detection | — | **CLOSED by this phase** (§8.6, §12.2) |
| OD-P2-5 | *(inherited)* An HR-triggered sweeper endpoint | — | **Remains closed.** Nobody has asked, and `#219` already lets HR force payroll renders. |
| OD-7 | *(inherited)* Parity definition | — | **CLOSED**: field-level, with a documented manual layout check (§21.4) |

---

## 31. Registry & Documentation Updates

| Registry | Update |
|---|---|
| `public/md_system/api_registry.md` | `#219 POST /api/v1/payroll/hr/jobs/payslip-render/run`; `#220 GET /api/v1/payroll/hr/runs/:runId/payslips/render-status`. Payroll high-water becomes **#220**. Documents stays at **#142** (DV-1). |
| `public/md_system/org_settings_registry.md` | `#87 pdf_render_engine`, `#88 payslip_prerender_on_publish`, `#89 pdf_bulk_inline_miss_threshold`, `#90 pdf_cache_retention_days` — all in `payroll_settings`, with defaults and bounds. High-water becomes **#90**. |
| `public/md_system/migration_registry.md` | `00057-create-pdf-render-jobs.js`, handed back unrun, with the safe-`down()` note. High-water becomes **00057**. |
| `public/md_system/cron_registry.md` | `pdf_render_worker.cron.js` (`*/5 * * * *`, IST) and `pdf_cache_purge.cron.js` (04:10 IST); note the verification pass added to `pdf_artifact_sweeper.cron.js` |
| `public/md_updates/…` | the change record of §26.4 |
| `public/md_pdf-generation/implementation_plan.md` | §11's Phase 3 bullet gains a pointer to this document as the authoritative scope, and §9.1's `#147` is annotated as deferred to Phase 4 |
| `public/md_pdf-generation/phases/phase3_completion_report.md` | pre-flight answers, deviations as built, test counts, the manual visual-check evidence, the migration hand-back, and the closure of OD-P2-2 and OD-7 |

---

## 32. Summary — the actual remaining Phase 3 work in one page

After subtracting P1 and P2, Phase 3 is **five pieces of machinery and three templates**:

1. **One migration** (`00057`) for a queue table and four org knobs that P1 deferred.
2. **Three templates and three pure view builders** that print exactly what the existing PDFKit renderers print, proven field-by-field by a zero-dependency parity harness and confirmed once by eye.
3. **One facade** (`payroll_pdf.service.js`) holding the single `pdfkit | html` branch, plus the cacheability rule that only an *immutable* payslip — visible and `published_at`-stamped — may be cached.
4. **One queue** (repository, injected worker, cron, two HR endpoints) whose live-source unique index doubles as the mutex for warm-up, HR drains and EC-19 repairs alike.
5. **Two lifecycle jobs**: `cache`-class purge, and the EC-19 object-loss work that Phase 2 explicitly handed forward — self-repairing for cache, report-only for evidence.

Everything else the main plan once listed under Phase 3 either already shipped in P1/P2, moved to Phase 4 (`#147`, bulk letters), stayed in Phase 5 (`record`-class retention), or was never Phase 3's (report families). Nothing user-visible changes until an org sets `pdf_render_engine = 'html'`, and setting it back is the whole of the rollback.
