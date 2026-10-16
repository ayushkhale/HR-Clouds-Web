# PDF Generation Module — Phase 4 Implementation Plan

**STATUS:** Not started. Phases 1, 2 and 3 are implemented and verified on disk.

**DATE:** 2026-09-27

**SCOPE:** Letters at scale and letters that issue themselves — bulk issuance, auto-issue on exit,
manager→HR maker–checker, the letter-issued notification, the four remaining templates, the deferred
document-plane render-queue drain (`#147`), and the deferred "print the reference number" item
(OD-P2-1).

**REVIEW STATUS:** An adversarial review of this plan against the shipped code found eighteen
defects and edge cases, four of them CRITICAL (**R-1** … **R-18**).
All eighteen are corrected inline throughout this document (marked **[R-n]**), and their complete
technical problem analyses, failure scenarios, exact code solutions, test specifications, and the
Consolidated Remediation Plan (Phases A–D) are fully integrated into **§33 (Architectural Plan Review — Defects, Edge Cases & Remediation)**.
This document is completely self-contained; no separate review file is required.

**AUTHORITY:** This document is the **Source of Truth for PDF Generation Module Phase 4**. Where it
disagrees with `public/md_pdf-generation/implementation_plan.md` (the main plan), §5 states the
contradiction and the resolution; the resolution is binding.

---

## 0. Document Control

### 0.1 Reference documents reviewed

| Document | Status |
|---|---|
| `public/md_pdf-generation/implementation_plan.md` | Main plan, 1001 lines. §11 Phase 4 = the starting scope; §4, §8.4, §9.1, §12 constrain it |
| `public/md_pdf-generation/phases/phase1_implementation_plan.md` | 1881 lines. Renderer transport, S3 `putObject`/`getObject`, artifact table, branding, templates, preview |
| `public/md_pdf-generation/phases/phase2_implementation_plan.md` | 2222 lines. Issuance, reference numbering, reissue, `origin` guards, sweeper. §1.2 defers **#143–#146**, the notification and the remaining templates to Phase 4 |
| `public/md_pdf-generation/phases/phase3_implementation_plan.md` | 1768 lines. Payroll migration, `pdf_render_jobs`, worker, cache purge. §1.3 defers **#147** to Phase 4 |
| `public/md_pdf-generation/combined_api_analysis.md`, `phases/phase{1,2,3}_api_analysis.md`, `phases/phase{1,2,3}_business_walkthrough.md` | Read for contract shape and terminology |
| `public/md_payrolls/phases/phase{2,3}_implementation_plan.md`, `public/md_leave/md_phases/phase{2,3}_implementation_plan.md` | Read for planning methodology (feature chains, traceability tables, deviation registers, acceptance criteria) |
| `public/md_system/api_registry.md`, `public/md_settings/org_settings_registry.md`, `public/md_system/background-jobs.md` | High-water marks verified |

**No `phase4_*` document of any kind exists in `public/md_pdf-generation/phases/`.** The expected
structure in the task brief lists `phase4_implementation_plan.md`; on disk only phases 1–3 exist.
This file creates it.

### 0.2 Verified repository baseline (read 2026-09-27, not inferred from documentation)

| Fact | Evidence |
|---|---|
| Migrations high-water | `00057-create-pdf-render-jobs.js` |
| Seeder high-water | `011` is free; `010-seed-letter-document-types.js` is the latest |
| Documents API high-water | **#142** (`api_registry.md` line 960) |
| Payroll API high-water | **#220** |
| Org settings high-water | **#90** (`org_settings_registry.md`, `### 90. PDF Cache Retention Days`) |
| Renderer transport | `src/infrastructure/pdf-renderer/{pdf-renderer.config.js, pdf-renderer.provider.js}` |
| Render pipeline | `src/common/services/pdf_render.service.js` (374 lines) — `renderAndRecord({ …, persist, onReady, writeAudit })` |
| Artifact store | `src/common/repositories/pdf_render_artifact.repository.js` (15 methods), `src/modules/document/models/pdf_render_artifacts.model.js` |
| Render queue | `src/common/repositories/pdf_render_job.repository.js`, `src/common/services/pdf_render_worker.service.js`, `src/modules/document/models/pdf_render_jobs.model.js` |
| Letter issuance | `src/modules/document/services/document_letter.service.js` (773 lines) — `issue`, `reissue`, `list`, `getById` |
| Letter facts | `src/modules/document/services/document_letter_facts.service.js` (201 lines) |
| Builders | `src/modules/document/builders/{branding.builder.js, letter_issue.builder.js}` |
| Letter templates | `registry.js` + **five** templates: `experience_letter`, `appointment_letter`, `bonafide_letter`, `relieving_letter`, `confirmation_letter`, plus `_branding_probe` |
| Letter routes | `src/modules/document/routes/document_letter.routes.js` — **#130–#142 only**; no `/letters/bulk`, no manager plane |
| Crons | `pdf_render_worker.cron.js` (*/15 IST), `pdf_artifact_sweeper.cron.js` (04:00 IST), `pdf_cache_purge.cron.js` (04:15 IST), `document_offboarding_archiver.cron.js` |
| Test suite | **201 files** under `tests/unit/`, **42** under `tests/unit/pdf/` |

**Test baseline, measured, not asserted.** `PostGre_DATABASE_URL=<dummy> npm test` →
**2231 tests, 2226 pass, 5 fail.** All five failures are `tests/unit/organization/*` and abort at
require-time with `Error: Razorpay credentials are missing in environment variables` — an environment
gap, not a code defect, and unrelated to this module. **Zero PDF-module failures.** Without
`PostGre_DATABASE_URL` set, 102 files fail at require-time inside `connection.pgsqldb.js`; that is
also environmental. Phase 4's regression gate is **2226 passing with the same 5 environment
failures**, plus its own new tests.

### 0.3 What Phase 4 delivers

1. Bulk letter issuance — validate-then-queue, one code path with single issue (`#143`, `#144`).
2. Auto-issue of relieving / experience letters at exit, exactly once per `(exit, template)`.
3. Manager proposes → HR approves and issues, with scope re-checked **at approval** (`#145`–`#150`).
4. `letter_issued` notification through the existing outbox, enqueued in the issuing transaction.
5. Four templates: `warning_letter`, `internship_certificate`, `noc`, `salary_certificate`.
6. `#147` — the document-plane render-queue drain Phase 3 deferred.
7. The reference number **printed on the PDF** (OD-P2-1), as `v2` templates behind `pinned_version`.
8. Two correctness fixes Phase 4 depends on and cannot work around (§5 C-9, C-10).

---

## 1. Goal & Boundary

### 1.1 Goal

An HR team issues 200 confirmation letters in one action and every one is byte-for-byte what the
single-issue path produces; an employee's exit produces a relieving letter exactly once without
anyone clicking; a manager can ask for a letter and HR decides. Nothing in Phases 1–3 changes
behaviour for an org that enables none of it.

### 1.2 Explicitly in scope

| # | Item | Endpoint / artefact |
|:--:|---|---|
| 1 | Bulk issuance: cohort validation, batch header, per-subject items, queue fan-out | `#143`, `#144` |
| 2 | Batch re-submission that runs only the unfinished subjects | `#143` (same idempotency key) |
| 3 | Auto-issue on exit, per-org template list | `document_automation.runLetterAutoIssue` |
| 4 | Manager proposal + HR approve/reject | `#145`, `#146`, `#148`, `#149`, `#150` |
| 5 | Document-plane queue drain | `#147` |
| 6 | `letter_issued` outbox event + toggle | `document_notification.service` |
| 7 | Four templates and their registry entries | `letter-templates/` |
| 8 | Seeder `011` for the two missing document types | `internship_certificate_issued`, `noc_issued` |
| 9 | Reference number printed on the page | `v2` of all nine templates |
| 10 | Migration `00058` — three tables, four settings columns, one enum label | authored, **not run** |
| 11 | Org settings `#91`–`#94` | `document_settings` |
| 12 | C-9 idempotency-key stability fix; C-10 queue source-type scoping | §5 |

### 1.3 Explicitly NOT in scope — do not build here

| Excluded | Deferred to | Why not now |
|---|---|---|
| Renderer authentication hardening (**D-14**) | **Phase 5** | Still the module's release blocker, owned by ops. Phase 4 must not be *enabled* in production before it lands (§27). |
| `record`-class retention and purge, the acknowledgement-obligation exclusion (**D-23**, EC-42, EC-43) | **Phase 5** | Phase 4 creates more `record` artifacts; it does not change how they are retired. |
| Rate limiting on bulk beyond `letter_bulk_max_subjects`; observability dashboards; performance measurement against §10 targets | **Phase 5** | Main plan §11 assigns all three to Phase 5 explicitly. |
| Emailing the PDF as an attachment | **never** | Main plan §2.3: email is deep links only. The notification carries a link, not bytes. |
| `transfer_letter` template and `transfer_letter_issued` type | **not planned** | Main plan §11 Phase 4 names four templates; transfer is not one. **D-17** mentions the type; seeding a type with no template is a dead catalog row in every tenant (seeder `010`'s own rule). |
| Report-family templates (`#177`–`#180`) | **OD-P3-5**, unowned | Never in any phase's template list. |
| Changing `#139`/`#140`/`#141`/`#142` request or response contracts | **never** | §26 is the guarantee. `#139` gains one optional internal parameter that is not exposed on the wire. |
| Editing an issued letter | **never** | **D-11**: a change is a reissue. |
| Bulk **reissue** | **not planned** | No requirement in the main plan. Reissue stays one-at-a-time. |
| Bulk cancel / batch abort endpoint | **not planned** | No requirement. A batch drains or fails per subject; `letter_bulk_max_subjects` bounds the blast radius. |
| `admin` / `super-admin` access of any kind | **never** | Documents D-10; role-planes rule. |
| Fixing `document_automation.runOffboardingArchive`'s `status === 'completed'` predicate | **Documents module backlog** | A real defect (§5 C-5) in a file Phase 4 also edits, but not this module's. Reported, not silently fixed; Phase 4 is designed to be correct whether or not it is fixed. |

### 1.4 Honesty guard — six stated gaps, not hidden ones

1. **`renderer_version` is still `NULL`.** Inherited from P1 §1.3(1) and P2 §1.3(1) and unchanged
   here. Every Phase 4 artifact inherits the same gap in the eight-year explainability story.
2. **Auto-issue depends on a payroll table the document module reaches through a lazy require.**
   `document_letter_facts._loadLiveExit` and `document_offboarding._resolveContext` both `require`
   `payroll/repositories/employee_exit.repository` inside a `try`. If that module is unavailable the
   facts are simply absent and `experience_letter` / `relieving_letter` fail their required-field
   check. Auto-issue therefore records a skip, not a crash — but it also silently does nothing. The
   sweep logs `letter.auto_issue.exit_source_unavailable` so the silence is visible.
3. **A subject who has already been removed cannot receive a letter.** `factsService.resolve` 404s on
   a subject with no profile and no user row (paranoid default scope). Auto-issue triggered on the
   last working day normally runs while the profile still exists, but an org that deactivates on the
   LWD itself will get `subject_unresolvable` skips. This is stated, bounded (§14.2 rule 6) and not
   worked around — a letter for a person the system can no longer describe is not a letter.
4. **Printing the reference number burns numbers on render failure.** OD-P2-1's mechanism allocates
   before the render. **D-20** already accepts gaps; Phase 4 makes them more likely for
   `prints_reference` templates. §11.4 of the Phase 2 plan remains the authority on when a number is
   burned; §16.4 here extends it.
5. **Bulk letters are not transactionally atomic across subjects, by design.** Main plan §8.4:
   partial failure is explicit. A batch can end `done: 197, failed: 3`. The three are individually
   retryable; the 197 are real, issued, numbered letters that are never rolled back.
6. **The notification's `event_type` enum label cannot be added inside the migration's
   transaction.** `ALTER TYPE … ADD VALUE` is not transactional-safe for immediate use in
   PostgreSQL. §6.5 splits `00058` accordingly, which makes its `up()` **partly non-atomic** — the
   only migration in this module with that property, and it is called out in the hand-back note.

### 1.5 Deviations from the main plan — stated, not silent

| # | Main plan says | Phase 4 does | Why |
|:--:|---|---|---|
| DV-1 | §9.1 gives maker–checker exactly two endpoints: `#145` manager POST, `#146` manager GET | Adds **three HR endpoints**: `#148` list proposals, `#149` approve, `#150` reject | Requirement 14 is "a manager **proposes** a letter; **HR approves and issues**". With only `#145`/`#146` there is no way for HR to see a proposal or act on it. The feature is unimplementable as tabled. |
| DV-2 | §4.2 gives `pdf_render_jobs` a `payload JSONB NOT NULL` column | No `payload`. A letter job carries `source_id = the prospective org_documents.id`; every other input lives on `document_letter_batch_items` | `00057` shipped without `payload` (verified). Re-adding it would duplicate the batch-item row. The shipped schema wins (§5 C-2). |
| DV-3 | §4.2 indexes jobs `UNIQUE (org_id, source_type, source_id, batch_id)` | Keeps the shipped `pdf_render_jobs_live_source_uq` — `(org_id, source_type, source_id) WHERE source_id IS NOT NULL AND status IN ('queued','claimed')`. EC-38 is served by `document_letter_batch_items UNIQUE (org_id, batch_id, subject_user_id)` plus the batch idempotency key | The shipped index is strictly stronger for the property that matters (at most one live job per prospective letter) and is what the enqueue's `ON CONFLICT DO NOTHING` infers. |
| DV-4 | §11 P4: "auto-issue … **on exit finalisation**", implying a synchronous hook | A **daily sweep**, `document_automation.runLetterAutoIssue`, running after the offboarding archive in the same cron tick | Main plan §10 Graceful degradation: "the renderer is never called during payroll calculation, publish, or any other state machine's critical section". Exit finalisation lives in `payroll_run.service.js`; a renderer call there would let a Lambda timeout fail an F&F run. A sweep is also the only shape that survives the renderer being down at the moment of the exit. |
| DV-5 | **D-6**: generated letters reuse `org_documents`' maker–checker columns (`proposed_by`, `approved_by`) | A proposal is a row in a new `document_letter_proposals` table; only the **issued** letter is an `org_documents` row | `00056` added `org_documents_generated_chk`: `origin='generated'` requires `generation_artifact_id IS NOT NULL AND reference_number IS NOT NULL AND storage_backend='s3'`. A proposal has none of the three — nothing has been rendered. Storing it as a generated draft is structurally impossible (§5 C-7). |
| DV-6 | §8.4: "enqueues one `pdf_render_jobs` row per subject … and returns `202`" | Also writes one `document_letter_batch_items` row per subject, **before** the jobs | The queue row cannot carry the subject, the per-subject failure reason, or the re-submission identity. `#144`'s "per-subject failures" and EC-38 both require the item row. |
| DV-7 | §12 EC-10 covers a logo presigned URL expiring mid-render for a single render | Extends it to a batch: branding **content** is frozen per batch, branding **asset transport** is re-resolved when older than `BRANDING_ASSET_REUSE_MS` (180 s against the 300 s TTL) | Verified: `document_letter_branding.service._resolveOneAsset` mints a 300 s presigned GET for any asset over 64 KB. A 200-letter batch outruns that. |
| DV-8 | §11 P4 scope does not mention printing the reference number | Includes it (OD-P2-1), as `v2` templates with a `prints_reference` registry flag | Phase 2 §34.2 assigns OD-P2-1 to "Phase 4, with the bulk/email work". It is remaining Phase 4 scope by the completed phases' own reckoning, not an invention. |

---

## 2. Pre-Flight Checks — before writing any code

Run these and record the answers in the completion report. Each one can invalidate a design choice
below.

| # | Check | Command / file | Expected | If different |
|:--:|---|---|---|---|
| PF-1 | Test baseline | `PostGre_DATABASE_URL=postgres://u:p@localhost:5432/x npm test` | 2231 tests / 2226 pass / 5 env failures | Investigate before writing code; Phase 4 must not inherit a red suite |
| PF-2 | Documents API high-water is still #142 | `public/md_system/api_registry.md` | `#142` is the last documents row | Renumber `#143`–`#150` from the real high-water |
| PF-3 | Org settings high-water is still #90 | `public/md_settings/org_settings_registry.md` | `### 90.` is last | Renumber `#91`–`#94` |
| PF-4 | Migration high-water is still `00057` | `src/infrastructure/postgres-sql/migrations/` | yes | Rename `00058` |
| PF-5 | `pdf_render_jobs.source_id` is nullable and `source_type` includes `'letter'` | `00057`, `pdf_render_jobs.model.js` | yes to both | Re-derive §6.1 |
| PF-6 | `drain`/`claimBatch` still have **no** `source_type` filter | `pdf_render_worker.service.js`, `pdf_render_job.repository.js` | no filter | If one exists, C-10 is already fixed — skip that work item |
| PF-7 | `_computeIdempotencyKey` still hashes the whole `branding` object | `document_letter.service.js` | it does | If already projected, C-9 is fixed — skip |
| PF-8 | `_resolveOneAsset` still presigns above 64 KB with a 300 s TTL | `document_letter_branding.service.js` | `INLINE_ASSET_MAX_BYTES = 65536`, `ASSET_VIEW_TTL_SECONDS = 300` | Re-derive DV-7's window |
| PF-9 | `document_notifications.event_type` is a DB ENUM of exactly five labels | `document_notifications.model.js`, `00053` | yes | If it is a STRING, drop the enum ALTER from `00058` |
| PF-10 | `employee_exits.status` enum is `recorded/prepared/settled/cancelled` | `employee_exits.model.js` | yes | Re-derive §14.2's trigger |
| PF-11 | `org_documents_generated_chk` still forbids an artifact-less generated row | `00056` | yes | DV-5 may be revisited |
| PF-12 | Renderer reachable and `PDF_RENDERER_BASE_URL` set in the target environment | ops | set, with `PDF_RENDERER_API_KEY` | Phase 4 is buildable but not releasable (D-14) |

---

## 3. Completed vs Remaining — the reconstruction

### 3.1 Already implemented in Phase 1 — **DO NOT RE-PLAN**

| Capability | Where it lives |
|---|---|
| HTML→PDF transport with retry/timeout/magic-byte/secret-hygiene rules | `src/infrastructure/pdf-renderer/pdf-renderer.{config,provider}.js` |
| `putObject` / `getObject` on the S3 provider | `src/infrastructure/aws-s3/aws-s3.provider.js` |
| `pdf_render_artifacts` table, model, repository, the `pending → ready/failed` machine | `00055`, `pdf_render_artifacts.model.js`, `pdf_render_artifact.repository.js` |
| The render pipeline with `persist` / `onReady` / `writeAudit` hooks and the no-network-in-transaction rule | `src/common/services/pdf_render.service.js` |
| Money/date/text formatters | `src/common/utilities/pdf_format.utils.js` |
| Template loader (promoted to `common/`), lint, `_partials/`, three templates | `src/common/utilities/template_loader.utils.js`, `tests/unit/pdf/template_lint.test.js` |
| Branding profile, asset handshake, inline-vs-presign rule, preview + rate limit | `document_letter_branding.service.js`, routes `#130`–`#134` |
| Per-template config, catalog reads, preview | `document_letter_template.service.js`, routes `#135`–`#138` |

Phase 4 **consumes** all of it and adds nothing to this list.

### 3.2 Already implemented in Phase 2 — **DO NOT RE-PLAN**

| Capability | Where it lives |
|---|---|
| Single-letter issuance end to end (`#139`) with the pending→render→S3→commit ordering | `document_letter.service.issue` |
| Reference numbering: table, pattern validator, `FOR UPDATE` allocation, FY resolution | `document_letter_sequences`, `letter_reference.utils.js`, `document_letter_sequence.repository.js` |
| `org_documents.origin` / `generation_artifact_id` / `reference_number` + the generated CHECK + the `#140` partial index | `00056` |
| `origin='generated'` guards on the upload handshake (EC-28) | `document_upload.service.js`, `document_org.service.js` |
| Reissue / supersede with the group advisory lock (`#142`) | `document_letter.service.reissue` |
| Facts resolution (profile / department / manager / exit / salary) and the pure issue builder | `document_letter_facts.service.js`, `letter_issue.builder.js`, `letter_derived_fields.js` |
| HR letter list and detail (`#140`, `#141`) | `document_letter.service.{list,getById}`, `org_document.repository.{listGenerated,findGeneratedById}` |
| Seeder `010` — seven org-plane letter types | `010-seed-letter-document-types.js` |
| Two more templates (`relieving_letter`, `confirmation_letter`) | `letter-templates/` |
| Stale-`pending` artifact sweeper (EC-20) | `pdf_artifact_sweeper.{service,cron}.js` |
| Settings `#84`–`#86` and the `#82`/`#83` mutability gap | `document_settings.service.js` |

**The single-issue path is Phase 4's engine.** Bulk, auto-issue and approval all call it. Phase 4
adds **one optional parameter** to it and **no second issuance implementation**.

### 3.3 Already implemented in Phase 3 — **DO NOT RE-PLAN**

| Capability | Where it lives |
|---|---|
| `pdf_render_jobs` table with the live-source unique index, claim-at-attempt semantics and stale reclaim | `00057`, `pdf_render_job.repository.js` |
| The generic claim/render/record worker with bounded concurrency and deterministic-vs-transient failure classification | `pdf_render_worker.service.js` |
| The worker cron | `pdf_render_worker.cron.js` |
| `renderForSource` / `loadStoredBytes` / `repairReady` and the EC-19 split by retention class | `pdf_render.service.js`, `pdf_artifact_sweeper.service.js`, `document_automation.runArtifactVerification` |
| Cache purge and terminal-job reaping | `pdf_cache_purge.cron.js` |
| Payroll engine facade and templates | `payroll_pdf.service.js`, `payroll/pdf-templates/` |

**The queue is Phase 4's fan-out mechanism.** Phase 4 adds a **source-type filter** and a **second
producer/consumer pair**; it builds no second queue.

### 3.4 Partially implemented — Phase 4 completes

| Item | What exists | What Phase 4 adds |
|---|---|---|
| Maker–checker frame | `org_documents.proposed_by` / `approved_by`, `org_document.repository.findProposals`, `document_require_separate_checker` (#60), `document_review.service._recommenderIsStale` | A letter-proposal record the generated-row CHECK permits, and the approval path that issues |
| Notification outbox | Five events, per-event toggles, claim/drain/retry, `enqueue(entry, transaction)` | A sixth event, its toggle, its subject/body branch and its recipient rule |
| Document types for letters | Nine of eleven exist (`009` + `010`) | `internship_certificate_issued`, `noc_issued` via seeder `011` |
| Reference number | Allocated, unique, persisted, returned by `#139`–`#142` | **Printed on the page** (OD-P2-1) |
| Render queue consumers | Payroll only | The document plane (letters), scoped so the two never claim each other's work |

### 3.5 Requirements the main plan gave Phase 4 that are **NO LONGER APPLICABLE**

| Main-plan item | Verdict | Reason |
|---|---|---|
| "Bulk … through the same single-issue path — one code path" as *new architecture* | **Already true** | `document_letter.service.issue` is that path; Phase 4 reuses it rather than building a bulk variant. The requirement survives as a **test** (§24 T-B7), not as a build item. |
| A bulk-specific render pipeline / a second queue | **Dropped** | `pdf_render_jobs` + `pdf_render_worker.service` exist and are generic (Phase 3). |
| A letter-specific employee or manager **read** endpoint for bulk-issued letters | **Dropped** | Main plan §9.1: "Employee and manager reads add no endpoints." A bulk letter is an ordinary `org_document`; `document_org_read.service.{listForEmployee,detailForEmployee,viewUrl}` already serve it. Verified in Phase 2 §3.3 and unchanged. |
| A new `source_type` enum label for letter jobs | **Dropped** | `pdf_render_jobs.source_type` already includes `'letter'` (`00057`). No enum ALTER on that column. |
| A new `entity_type`/`action` enum for the Phase 4 audit actions | **Dropped** | `document_audit_logs.entity_type` and `.action` are `STRING(50)`. No migration. |
| Seeding `warning_letter` and `salary_certificate_issued` | **Dropped** | `warning_letter` is in seeder `009` (plane `org`, group `disciplinary`, confidential, allows-multiple); `salary_certificate_issued` is in seeder `010`. Only two types are missing. |
| A bulk-specific confidentiality or acknowledgement mechanism | **Dropped** | `letter_default_confidential` (#85) and `letter_requires_acknowledgement_default` (#86) are already frozen onto every issued row by `_resolveIssuanceContext`. |
| A letter-specific audit reader for batches | **Dropped** | `document_audit.service.findByEntity(orgId, entityType, id)` serves `document_letter_batch` like any other entity type. |

### 3.6 Genuinely remaining — the Phase 4 work list

Migration `00058` · seeder `011` · C-9 idempotency-key stability fix · C-10 queue source-type
scoping · `_resolveIssuanceContext` split into org-scope + subject-scope · bulk batch service,
repository, two tables, routes `#143`/`#144` · letter render callback and the document-plane drain
(`#147`) · auto-issue sweep · proposal table, service and routes `#145`/`#146`/`#148`/`#149`/`#150`
· `letter_issued` notification event, toggle and template branch · four templates · nine `v2`
templates for the printed reference number · settings `#91`–`#94` · the tests for all of it.

---

## 4. Phase 1 → 2 → 3 → 4 Dependency Analysis

### 4.1 What Phase 4 consumes, and how

| Phase 4 feature | Depends on | Existing component | How Phase 4 consumes it |
|---|---|---|---|
| Bulk issuance | P2 | `document_letter.service.issue` | Called once per batch item by the worker callback, with an explicit `idempotencyKey` and a caller-supplied `documentId` |
| Bulk issuance | P2 | `_resolveIssuanceContext` | **Split** into `_resolveOrgIssuanceContext(orgId, templateCode)` (once per batch) and `_resolveSubjectIssuanceContext(orgCtx, subjectUserId, overrides, effectiveDate)` (once per subject). `_resolveIssuanceContext` is retained as the composition of the two, so `#139`/`#142` are behaviourally unchanged |
| Bulk fan-out | P3 | `pdf_render_job.repository.enqueueMany` | One row per item, `source_type='letter'`, `source_id = item.document_id`, inside the batch transaction |
| Bulk drain | P3 | `pdf_render_worker.service.drain` | New caller `document_automation.runLetterRender`, passing `sourceTypes: ['letter']` and a letter render callback |
| Bulk progress | P3 | `pdf_render_job.repository.countByBatch` | Cross-checked against the item ledger; the **item ledger is authoritative** for `#144` |
| Auto-issue | P2 | `document_letter.service.issue` | Same call, `idempotency_key = 'autoexit:{exitId}:{templateCode}'` |
| Auto-issue | Documents | `document_automation._forEachOrg`, `document_offboarding.archiveForUser` | A new pass appended **after** the archive pass in the same cron tick (§14.2 rule 3) |
| Auto-issue | Payroll | `employee_exit.repository.findLiveForOrg` | Read-only, lazy-required behind the D-18 graceful pattern already used by `document_letter_facts._loadLiveExit` |
| Maker–checker | Documents | `hierarchy_access.getAccessibleUserIds` | Scope at propose **and** re-checked at approve, exactly as `document_review.service._recommenderIsStale` does |
| Maker–checker | Documents | `document_settings.document_require_separate_checker` (#60) | Reused verbatim: approver ≠ proposer when on |
| Approval → issue | P2 | `document_letter.service.issue` | Called by the approval service inside no transaction; the proposal row is closed in the `onReady` transaction |
| Notification | Documents | `document_notification.service.enqueue(entry, t)` | Called inside the issuing `onReady` transaction |
| Reference printing | P2 | `document_letter_sequence.repository.allocate`, `letter_reference.utils.renderPattern` | Allocation moves to a short pre-render transaction **only** for `prints_reference` template versions |
| All rendering | P1 | `pdf_render.service.renderAndRecord` | Unchanged signature; Phase 4 passes the same `persist: true` + `onReady` shape Phase 2 uses |
| Asset delivery | P1 | `document_letter_branding.service.resolveAssetSrcs` | Called per batch, re-called when older than `BRANDING_ASSET_REUSE_MS` (DV-7) |

### 4.2 Components to EXTEND, never duplicate — the anti-duplication contract

A Phase 4 change that creates a parallel version of anything on the left must be rejected in review.

| Existing component | Phase 4 extension | Forbidden alternative |
|---|---|---|
| `document_letter.service.issue` | one optional `documentId`, one optional `explicitIdempotencyKey` already supported via `payload.idempotency_key`, and the context split | a `bulkIssue` / `autoIssue` / `approveAndIssue` that re-implements issuance |
| `document_letter.service._resolveIssuanceContext` | split into org-scope + subject-scope, composition retained | a second context resolver in the batch service |
| `pdf_render_job.repository.claimBatch` | an optional `sourceTypes` predicate | a letter-only claim query |
| `pdf_render_worker.service.drain` | an optional `sourceTypes` pass-through | a `letter_render_worker.service.js` |
| `src/cron-jobs/pdf_render_worker.cron.js` | one added call to the document-plane drain | a second render cron |
| `src/cron-jobs/document_offboarding_archiver.cron.js` | one added call to `runLetterAutoIssue`, after the archive | a standalone auto-issue cron with an implicit time dependency |
| `document_automation.service.js` (`_forEachOrg`) | `runLetterRender`, `runLetterAutoIssue` | a new automation service |
| `document_notification.service` (`NOTIFICATION_EVENT`, `EVENT_SETTING_TOGGLE`, `buildMessage`) | a sixth event | a letter-specific mailer |
| `document_letter_branding.service.{resolveAssetSrcs, checkPreviewRate}` | reused as-is | a batch-local asset resolver |
| `hierarchy_access.getAccessibleUserIds` | reused as-is for propose and approve | a letter-specific hierarchy query |
| `letter-templates/registry.js` | four entries, `prints_reference` flag, `current_version: 2` | a second registry |
| `tests/unit/pdf/helpers/lint_template.js` | reused unchanged for the four new templates and the `v2` set | a second linter |
| `org_document.repository` | one method (`listGeneratedByIds`) if `#144` needs letter titles | direct `OrgDocument.findAll` from the batch service |
| `document_audit.service.record` | reused for every new action | a batch-local audit writer |

### 4.3 What Phase 4 must NOT duplicate or re-derive

* **Reference numbering.** One allocator (`document_letter_sequence.repository.allocate`), one
  pattern renderer. Bulk does not get its own numbering.
* **Confidentiality / acknowledgement resolution.** Frozen by `_resolveIssuanceContext` from
  settings. Bulk, auto-issue and approval all inherit it.
* **The `origin='generated'` guards.** Already on the upload handshake; Phase 4 adds none.
* **Recipient materialisation.** `recipientService.materialise` inside the issuing transaction, one
  user, exactly as Phase 2 does.
* **The uniform 404.** `orgRepo.findGeneratedById` returns `null` for cross-org, uploaded or
  soft-deleted rows; every Phase 4 read uses it.

---

## 5. Contradictions Found and Resolved

Each is resolved in favour of **what actually shipped**, preserving the original business intent.
Each names the evidence.

**C-1 — The main plan's Phase 4 template list contradicts seeder `010`'s header.**
Main plan §11 P4: "Remaining templates: `warning_letter`, `internship_certificate`, `noc`,
`salary_certificate`." Seeder `010`'s header comment: "D-17 also names internship_certificate, noc
and transfer; they are **NOT** seeded because nothing in Phases 1–4 issues them."
**Resolution:** the main plan wins on scope; `010` wins on the no-edit rule. Seeder **`011`** adds
`internship_certificate_issued` and `noc_issued` only. `transfer_letter_issued` stays unseeded
because no phase ships a transfer template (§1.3). `warning_letter` (seeder `009`, plane `org`) and
`salary_certificate_issued` (seeder `010`) already exist and are **not** re-seeded.

**C-2 — `pdf_render_jobs.payload` exists in the main plan and not on disk.**
Main plan §4.2 declares `payload JSONB NOT NULL`. `00057` has no such column (verified).
**Resolution:** shipped schema wins (DV-2). The batch item is the payload; the job finds it by
`source_id`. No column is added to a generic queue table for one domain's data.

**C-3 — The jobs uniqueness contract differs.**
Main plan §4.2: `UNIQUE (org_id, source_type, source_id, batch_id)`. On disk:
`pdf_render_jobs_live_source_uq` on `(org_id, source_type, source_id) WHERE source_id IS NOT NULL
AND status IN ('queued','claimed')`.
**Resolution:** shipped index wins (DV-3). It gives at-most-one **live** job per prospective letter,
which is the property bulk needs; the main plan's version would permit two live jobs for the same
letter in two batches. EC-38's "only the unfinished subjects run" is served by
`document_letter_batch_items UNIQUE (org_id, batch_id, subject_user_id)` plus
`document_letter_batches UNIQUE (org_id, idempotency_key)`.

**C-4 — "On exit finalisation" has no single meaning in this codebase.**
Main plan §11 P4 says the hook fires "on exit finalisation". `employee_exits.status` is
`recorded | prepared | settled | cancelled` (`employee_exits.model.js`); `settled` is stamped only
when the F&F payroll run reaches paid (`payroll_run.service.js:2075`). An exit can sit `recorded`
for months past the last working day and never reach `settled` if no F&F run is processed.
**Resolution:** the trigger is **a non-cancelled exit whose `last_working_day` has arrived
(IST)** — the same predicate `document_offboarding.resolveArchiveTrigger` already uses for the
archive. A relieving letter belongs to the last working day, not to the payment of dues. Recorded
explicitly as **BR-A3** (§11).

**C-5 — `document_automation.runOffboardingArchive` filters on a status that does not exist.**
`document_automation.service.js` Pass A: `liveExits.filter((e) => e.status === 'completed' && …)`.
`employee_exits.status` has no `'completed'` label. Pass A therefore matches **nothing**; the archive
only ever runs via Pass B (inactive members) or the direct call from
`organization.service.js:672`.
**Resolution:** **reported, not fixed here** — it is a Documents-module defect in a file Phase 4
also edits, and CLAUDE.md forbids repairing unrelated behaviour. Phase 4's design is correct either
way: `runLetterAutoIssue` uses its own correct predicate (C-4) and runs **after** the archive pass in
the same tick, so if the defect is later fixed the ordering guarantee of §14.2 rule 3 still holds.
Raised as **OD-P4-5**.

**C-6 — The main plan's maker–checker endpoint set is incomplete.**
§9.1 lists only `#145` (manager POST) and `#146` (manager GET) for requirement 14, which also says
"HR approves and issues".
**Resolution:** DV-1 — add `#148`/`#149`/`#150` on the HR plane. Documents API high-water becomes
**#150**.

**C-7 — D-6 assumes a proposal can be an `org_documents` row.**
D-6 says generated letters inherit the org-document lifecycle including its maker–checker columns.
`00056` added `org_documents_generated_chk`: `origin <> 'generated' OR (generation_artifact_id IS
NOT NULL AND reference_number IS NOT NULL AND storage_backend = 's3')`. A proposal has no artifact,
no number and no object.
**Resolution:** DV-5 — `document_letter_proposals` holds the proposal; the CHECK stays untouched;
`org_documents` gains **no** column in Phase 4. The business intent (HR decides, the manager asks)
is preserved exactly.

**C-8 — "Reuse the existing notification outbox" is not free.**
Main plan §11 P4: "Notification of an issued letter through the existing document notification
outbox." On disk `document_notifications.event_type` is a **DB ENUM of five labels**,
`NOTIFICATION_EVENT` is a frozen constant, and `EVENT_SETTING_TOGGLE` requires every event to map to
a boolean settings column or `enqueue` throws `500 NOTIFICATION_EVENT_UNKNOWN`.
**Resolution:** the outbox is reused, and Phase 4 pays its entry price: one enum label, one settings
column (`#94`), one constant, one toggle entry, one `buildMessage` branch, one recipient rule. Phase
2 §1.2 predicted exactly this. See §6.5 for the non-transactional enum ALTER.

**C-9 — The derived idempotency key is not stable for orgs with a large logo. (Defect, blocking.)**
`document_letter.service._computeIdempotencyKey` computes
`branding_hash: sha256(canonicalJson(branding))`, where `branding` is the output of
`_resolveBranding` → `resolveBranding(profile, row, assetSrcs)`, and `branding.builder.js` copies
`assetSrcs.logo_src` / `signature_src` straight into the view model. For an asset **above 64 KB**,
`document_letter_branding.service._resolveOneAsset` returns
`s3Provider.getViewUrl({ ttlSeconds: 300 })` — an AWS SigV4 presigned URL whose `X-Amz-Date` and
`X-Amz-Signature` change on **every mint**. The derived key therefore changes between two otherwise
identical `POST /hr/letters` calls, and **EC-17 ("two concurrent issues without a key … the derived
key is identical") is violated for those orgs**: a double-click issues two letters with two
reference numbers. `tests/unit/pdf/letter_issue_service.test.js` T-28 asserts the key *changes* with
branding; no test asserts it is *stable* across two mints, which is why this survived.
**Resolution — the smallest safe change:** hash a **stable branding projection**. Add a pure
`stableBrandingIdentity(branding, brandingRow)` beside `branding.builder.js` that returns the
branding view model with `logo_src` / `signature_src` **replaced** by
`logo_asset: sha256(brandingRow.logo_storage_key ?? '')` and
`signature_asset: sha256(brandingRow.signature_storage_key ?? '')`, and feed *that* to
`branding_hash`. Properties: the key still changes when the logo is replaced (the key changes), still
changes for every branding content edit, and no longer changes with the clock. A data URI is already
stable, so small-asset orgs are unaffected. Storage keys are hashed, never hashed-in raw, so no key
material enters the idempotency column. **One-time effect:** derived keys change once at deploy, so
an issue request in flight across the deploy could produce a second letter — deploy during a quiet
window and state it in the hand-back note (§25).
Phase 4 **cannot be built without this fix**: bulk, auto-issue and the worker all depend on a derived
or explicit key being stable across retries.

**C-10 — The render queue has no source-type scoping, and the only drain is payroll's. (Defect, blocking.)**
`pdf_render_job.repository.claimBatch` selects by `org_id`, `scheduled_for`, `status` and `attempts`
only — **no `source_type` predicate**. `pdf_render_worker.service.drain` passes the claimed rows to
whatever `render` callback the caller supplied. The only caller today is
`payroll_automation.runPayslipRender`, whose callback is
`payrollPdfService.renderPayslipForJob({ orgId, job })`, which does
`payslipRepo.findByIdAndOrgId(job.source_id, orgId)`. Given a letter job it finds no payslip, calls
`cancelLiveForSource(orgId, 'payslip', job.source_id)` — which matches nothing, because the job's
`source_type` is `'letter'` — and returns `{ cancelled: true }`. The worker then records **nothing**:
neither `markDone` nor `recordFailure` runs. The letter job stays `claimed` until the stale window
elapses, is re-claimed, burns another attempt, and is silently abandoned at `max_attempts`.
A second, independent problem: `runPayslipRender` skips any org whose `pdf_render_engine` is not
`html` (the default). Letters are always HTML, so in a default-configured org **no drain would ever
run at all**.
**Resolution:** two additive changes.
(a) `claimBatch(orgId, { …, sourceTypes })` adds `AND source_type IN (:sourceTypes)` when the array
is non-empty; `drain({ …, sourceTypes })` passes it through. Default remains "all", so the signature
is backward compatible — but `runPayslipRender` **must** be updated to pass `['payslip']` in the same
change, or the hazard merely reverses direction. This is the one Phase 3 file Phase 4 edits, and the
edit is two lines.
(b) A second drain, `document_automation.runLetterRender`, passing `sourceTypes: ['letter']` and the
letter callback, invoked from the same `pdf_render_worker.cron.js` tick and from `#147`. It is
**not** gated on `pdf_render_engine`.

**C-11 — EC-10's 300-second asset window does not survive a batch.**
EC-10 sizes the presigned asset TTL (300 s) against a single render's 20 s budget. A 200-subject
batch drained at concurrency 4 over several minutes reuses one resolved branding object.
**Resolution:** DV-7 — freeze branding **content** per batch (it is part of the frozen
`input_snapshot` anyway, per D-5) and re-resolve **asset srcs** whenever they are older than
`BRANDING_ASSET_REUSE_MS = 180_000`. Because C-9 removes `logo_src` from the idempotency input, a
refreshed asset URL does **not** change the key — the two fixes compose, and neither works properly
without the other.

**C-12 — OD-P2-1 is assigned to Phase 4 by Phase 2 but absent from the main plan's Phase 4 scope.**
**Resolution:** DV-8 — in scope, sequenced last, and structured so it can be dropped without
touching anything else (§22 F-9).

---

## 6. Database — Migration `00058-create-letter-batches-and-proposals.js`

One migration file. Creates **three** tables, alters **two**, and adds **one** enum label. Authored
and handed back **unrun** (standing constraint). Every index and CHECK is named so `down()` can drop
it deterministically, matching `00055`–`00057`.

### 6.1 `document_letter_batches` — the bulk request record

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | the `batch_id` returned by `#143` |
| `org_id` | UUID NOT NULL, FK `organizations` | in every predicate |
| `template_code` | STRING(64) NOT NULL | no FK — the catalog is a repo asset (D-2), exactly as `document_letter_configs` does |
| `template_version` | INTEGER NOT NULL | **pinned at batch creation** so a mid-batch deploy cannot split one batch across two template versions (main plan §4.2's stated intent) |
| `document_type_id` | UUID NOT NULL, FK `document_types` | resolved once; re-asserted per item at issue (EC-23) |
| `idempotency_key` | STRING(120) NOT NULL | `UNIQUE (org_id, idempotency_key)` — EC-38 |
| `field_overrides` | JSONB NOT NULL DEFAULT `{}` | applied to every subject; validated against the template's declared, non-derived fields |
| `pinned_date` | DATEONLY **NOT NULL** | **[R-13]** the date printed on every letter in the batch, **resolved once at creation** (the request's `effective_date`, else today UTC) and stored. It is never re-derived at render time — a derivation would let a batch draining across 00:00 UTC stamp two dates, and in the worst case two financial-year buckets, on one cohort. `renderItem` always passes `effective_date: batch.pinned_date` to `issue()` |
| `branding_snapshot` | JSONB NOT NULL | the frozen branding **content** (C-11), stored with `logo_src` / `signature_src` **stripped** so no presigned URL is persisted. **[R-10]** It is not decoration: `renderItem` passes it to `_resolveOrgIssuanceContext({ brandingOverride })`, which uses it instead of re-deriving branding, and merges freshly-resolved asset srcs over it. Without that wiring the column is dead weight and BR-B7 / EC-P4-8 are false |
| `total_count` | INTEGER NOT NULL | subjects accepted at validation |
| `status` | ENUM `queued, running, completed, completed_with_failures, cancelled` NOT NULL DEFAULT `queued` | derived by the drain from the item ledger, never by a client |
| `source` | ENUM `hr_bulk` NOT NULL DEFAULT `hr_bulk` | one label today; the column exists so auto-issue or a future importer can share the ledger without an ALTER |
| `created_by` | UUID NOT NULL, FK `users` | the HR actor |
| `completed_at` | DATE NULL | set when no item is `pending` |
| `created_at` / `updated_at` | DATE NOT NULL | |

**Indexes.** `UNIQUE (org_id, idempotency_key)` → `document_letter_batches_idem_uq`;
`(org_id, created_at DESC)` → `document_letter_batches_org_idx`.
**CHECK.** `document_letter_batches_total_chk`: `total_count BETWEEN 1 AND 2000` — an absolute
ceiling above the configurable `letter_bulk_max_subjects` (#91, default 500, max 2000), so a settings
bug cannot enqueue an unbounded batch.

### 6.2 `document_letter_batch_items` — the per-subject ledger

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL, FK `organizations` | |
| `batch_id` | UUID NOT NULL, FK `document_letter_batches` ON DELETE CASCADE | |
| `subject_user_id` | UUID NOT NULL, FK `users` | |
| `document_id` | UUID NOT NULL | **pre-generated** `org_documents.id`; becomes the job's `source_id` and the artifact's `source_id`. No FK — the row does not exist until the letter is issued |
| `status` | ENUM `pending, issued, failed, skipped` NOT NULL DEFAULT `pending` | the business outcome; the job row holds the attempt mechanics |
| `letter_id` | UUID NULL, FK `org_documents` ON DELETE SET NULL | set on success; equals `document_id` |
| `artifact_id` | UUID NULL, FK `pdf_render_artifacts` ON DELETE SET NULL | |
| `reference_number` | STRING(64) NULL | denormalised for `#144` so the progress read never joins `org_documents` |
| `failure_code` | STRING(64) NULL | the stable code; never a payload |
| `failure_reason` | STRING(500) NULL | truncated, never HTML, never a view model |
| `issued_at` | DATE NULL | |
| `created_at` / `updated_at` | DATE NOT NULL | |

**Indexes.** `UNIQUE (org_id, batch_id, subject_user_id)` → `document_letter_batch_items_subject_uq`
(**EC-38**); `UNIQUE (org_id, document_id)` → `document_letter_batch_items_document_uq` (the
worker's lookup key); `(org_id, batch_id, status)` → `document_letter_batch_items_status_idx` (the
`#144` aggregate).
**CHECK.** `document_letter_batch_items_issued_chk`: `status <> 'issued' OR (letter_id IS NOT NULL
AND artifact_id IS NOT NULL AND reference_number IS NOT NULL)` — the same shape as
`org_documents_generated_chk`: an "issued" item that cannot name its letter is not issued.

### 6.3 `document_letter_proposals` — manager maker–checker (DV-5, C-7)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL, FK `organizations` | |
| `template_code` | STRING(64) NOT NULL | resolved against the registry at propose **and** at approve |
| `subject_user_id` | UUID NOT NULL, FK `users` | must be the proposer's active direct report at propose **and** at approve |
| `field_overrides` | JSONB NOT NULL DEFAULT `{}` | only declared, non-derived fields (BR-20 reused) |
| `reason` | STRING(500) NULL | why the manager is asking |
| `status` | ENUM `pending, approved, rejected, cancelled` NOT NULL DEFAULT `pending` | |
| `proposed_by` | UUID NOT NULL, FK `users` | |
| `decided_by` | UUID NULL, FK `users` | |
| `decided_at` | DATE NULL | |
| `decision_note` | STRING(500) NULL | HR's reason on reject, or the stale-scope acknowledgement note |
| `letter_id` | UUID NULL, FK `org_documents` ON DELETE SET NULL | the letter the approval issued |
| `created_at` / `updated_at` | DATE NOT NULL | |

**[R-16] No `template_version` column, deliberately.** A proposal is a request to issue, not a
frozen document. The version is resolved at **approval**, like every other issue (EC-15), so a
proposal made under `v1` and approved after `v2` ships renders `v2`. Stated here because it will
otherwise be found later and re-litigated; pinning at proposal time would be a new requirement.

**Indexes.** `UNIQUE (org_id, template_code, subject_user_id) WHERE status = 'pending'` →
`document_letter_proposals_live_uq` (one open proposal per subject per template — a manager cannot
flood HR by re-submitting); `(org_id, status, created_at DESC)` →
`document_letter_proposals_queue_idx` (the `#148` HR queue); `(org_id, proposed_by, created_at DESC)`
→ `document_letter_proposals_mine_idx` (the `#146` manager read).
**CHECK.** `document_letter_proposals_decided_chk`: `status = 'pending' OR (decided_by IS NOT NULL
AND decided_at IS NOT NULL)`; `document_letter_proposals_approved_chk`: `status <> 'approved' OR
letter_id IS NOT NULL`.

### 6.4 `document_settings` — four added columns (`#91`–`#94`)

| Column | Type | Default | Registry |
|---|---|---|---|
| `letter_bulk_max_subjects` | INTEGER NOT NULL | `500` | #91 |
| `letter_auto_issue_on_exit` | JSONB NOT NULL | `[]` | #92 |
| `manager_can_propose_letters` | BOOLEAN NOT NULL | `false` | #93 |
| `document_notify_letter_issued` | BOOLEAN NOT NULL | `false` | #94 |

**CHECKs.** `document_settings_letter_bulk_max_subjects_chk`: `BETWEEN 1 AND 2000`.
`document_settings_letter_auto_issue_on_exit_chk`: `jsonb_typeof(letter_auto_issue_on_exit) =
'array' AND jsonb_array_length(letter_auto_issue_on_exit) <= 5`. The **membership** of that array
(which template codes are legal) is validated in `document_settings.service` against the registry,
not in SQL — the catalog is a repo asset with no table to reference.

Every default reproduces today's behaviour: no org bulk-issues, auto-issues, accepts proposals or
emails a letter until someone turns it on. `document_notify_letter_issued` defaults `false` to match
the five existing `document_notify_*` columns, all of which default `false`.

### 6.5 `document_notifications.event_type` — one added enum label

`ALTER TYPE "enum_document_notifications_event_type" ADD VALUE IF NOT EXISTS 'letter_issued';`

**This statement runs OUTSIDE the migration's transaction.** PostgreSQL forbids using a newly added
enum value in the same transaction that added it, and older majors forbid `ADD VALUE` inside a
transaction block entirely. `00058.up()` therefore has this shape, and the hand-back note says so:

```
up():
  1. ALTER TYPE … ADD VALUE IF NOT EXISTS 'letter_issued'   // NO transaction
  2. const t = await queryInterface.sequelize.transaction()
     … create the three tables, the four columns, every index and CHECK …
     commit / rollback
```

**Consequence, stated plainly:** if step 2 fails and rolls back, the enum label remains. That is
harmless and idempotent (`IF NOT EXISTS`); re-running `up()` succeeds. `down()` drops the three
tables, the four columns and the three created enum types `CASCADE`, and **does not remove the
`letter_issued` label** — PostgreSQL cannot drop an enum value, and leaving it is inert because no
row will reference it once `document_notify_letter_issued` is gone. The hand-back note must say this
so the operator does not expect a symmetric `down()`.

### 6.6 What `00058` does **not** do

* No column on `org_documents` (C-7 / DV-5).
* No column on `pdf_render_artifacts`.
* No column and no enum change on `pdf_render_jobs` — `source_type` already has `'letter'` and
  `source_id` is already nullable (`00057`'s own comment anticipates Phase 4).
* No change to `document_letter_sequences`, `document_letter_configs` or `document_letter_branding`.
* No index on `org_documents` (the `#140` partial index from `00056` already covers `#144`'s reads,
  which go through the item ledger anyway).
* No backfill of any kind. Every added column has a constant default, so on PostgreSQL 11+ each
  `ADD COLUMN` is metadata-only and does not rewrite `document_settings`.

### 6.7 Seeder `011-seed-remaining-letter-types.js`

Adds exactly two rows, `INSERT … ON CONFLICT (code) DO NOTHING` (re-runnable), with `BASE_DEFAULTS`
copied verbatim from `010` and the same header rule (`009` and `010` are never edited):

| code | name | plane | group | confidential | allows_multiple | requires_verification |
|---|---|---|---|:--:|:--:|:--:|
| `internship_certificate_issued` | Internship Certificate (Issued) | `org` | `employment_history` | false | true | false |
| `noc_issued` | No Objection Certificate (Issued) | `org` | `employment_history` | false | true | false |

Seeding a type does **not** activate it in any org; `409 DOCUMENT_TYPE_NOT_ACTIVATED` at issue
remains the actionable error (**D-17**). Handed back **unrun** with `00058`.

---

## 7. Models & Repositories

### 7.1 New models — `src/modules/document/models/`

| File | Table | Notes |
|---|---|---|
| `document_letter_batches.model.js` | `document_letter_batches` | Not paranoid. `branding_snapshot` and `field_overrides` are **service-layer only** — excluded from every list projection, mirroring the `input_snapshot` rule |
| `document_letter_batch_items.model.js` | `document_letter_batch_items` | Not paranoid. Associations: `belongsTo(DocumentLetterBatch, as: 'batch')`, `belongsTo(User, as: 'subject')` |
| `document_letter_proposals.model.js` | `document_letter_proposals` | Not paranoid — a withdrawn proposal is `cancelled`, not deleted. Associations: `belongsTo(User, as: 'proposer'/'decider'/'subject')` |

None of the three is `paranoid`: a soft-deletable batch, item or proposal is not a record
(§4.7 of the main plan, applied consistently).

### 7.2 New repositories

**`src/modules/document/repositories/document_letter_batch.repository.js`**

| Method | Contract |
|---|---|
| `findByOrgAndKey(orgId, idempotencyKey, { transaction })` | the EC-38 probe |
| `create(data, transaction)` | requires a transaction |
| `findById(orgId, id, { transaction })` | uniform-404 source for `#144`; never returns `branding_snapshot` |
| `updateStatus(orgId, id, { status, completedAt }, transaction)` | conditional on the current status not already terminal |
| `findRunnableForOrg(orgId, { limit })` | batches with `status IN ('queued','running')`, for the drain's status roll-up |

**`src/modules/document/repositories/document_letter_batch_item.repository.js`**

| Method | Contract |
|---|---|
| `bulkCreate(orgId, rows, transaction)` | `ignoreDuplicates: true` → `ON CONFLICT DO NOTHING` on `document_letter_batch_items_subject_uq`, so a re-submitted batch inserts only the missing subjects |
| `findByDocumentId(orgId, documentId, { transaction })` | the worker's lookup (`document_letter_batch_items_document_uq`) |
| `findPendingForBatch(orgId, batchId, { limit })` | re-enqueue on re-submission |
| `markIssued(orgId, id, { letterId, artifactId, referenceNumber, issuedAt }, transaction)` | conditional on `status = 'pending'`; returns rows changed |
| `markFailed(orgId, id, { failureCode, failureReason }, transaction)` | conditional on `status = 'pending'` |
| `markSkipped(orgId, id, { failureCode, failureReason }, transaction)` | for a subject that stopped being issuable (EC-P4-4). **[R-3]** Always paired, in the same transaction, with `jobRepo.cancelLiveForSource(orgId, 'letter', job.source_id, …)` — never with `markDone`, which `pdf_render_jobs_done_chk` forbids without an `artifact_id` |
| `countByBatch(orgId, batchId, { transaction })` | returns a fully-populated `{ pending, issued, failed, skipped }` so an absent status reads `0`, matching `pdf_render_job.repository.countByBatch`'s shape |
| `listFailures(orgId, batchId, { limit, offset })` | the `#144` per-subject failure list |

**`src/modules/document/repositories/document_letter_proposal.repository.js`**

| Method | Contract |
|---|---|
| `create(data, transaction)` | maps a `document_letter_proposals_live_uq` violation to `409 LETTER_PROPOSAL_EXISTS` |
| `findById(orgId, id, { lock, transaction })` | `lock: true` → `FOR UPDATE` for the approval path |
| `listForProposer(orgId, proposerId, { status, limit, offset })` | `#146` |
| `listPending(orgId, { templateCode, subjectUserId, limit, offset })` | `#148` |
| `decide(orgId, id, { status, decidedBy, decidedAt, decisionNote, letterId }, transaction)` | conditional on `status = 'pending'`; returns rows changed so a lost race is detected, not silently won |

### 7.3 Extended repositories — additive only

| File | Addition | Rule |
|---|---|---|
| `src/common/repositories/pdf_render_job.repository.js` | `claimBatch(orgId, { …, sourceTypes = [] })` adds `AND source_type IN (:sourceTypes)` when non-empty (**C-10a**) | No other method changes. `enqueueMany` already accepts `source_type`/`source_id`/`batch_id` and needs nothing |
| `src/modules/document/repositories/org_document.repository.js` | `listGeneratedByIds(orgId, ids, { transaction })` — projected rows for a set of letter ids, `LIST_ATTRIBUTES` unchanged (no `storage_key`) | Only if `#144` is specified to echo letter titles; otherwise omitted (§10.2) |

`pdf_render_artifact.repository.js`, `document_letter_sequence.repository.js`,
`document_letter_config.repository.js` and `document_letter_branding.repository.js` are
**unchanged**.

---

## 8. Templates & Registry

### 8.1 Four new templates

Each is `src/modules/document/letter-templates/<code>/v1.html` plus a registry entry. All obey the
eight lint rules unchanged (`tests/unit/pdf/helpers/lint_template.js`, reused, not copied).

| code | title | `document_type_code` | `reference_token` | Derived fields needed | Confidential |
|---|---|---|---|---|:--:|
| `warning_letter` | Warning Letter | `warning_letter` *(seeder `009`, plane `org`)* | `WRN` | `employee_name`, `employee_code`, `designation`, `department_name` | yes (type default) |
| `internship_certificate` | Internship Certificate | `internship_certificate_issued` *(seeder `011`)* | `INT` | `employee_name`, `designation`, `joining_date_text`, `relieving_date_text`, `department_name` | no |
| `noc` | No Objection Certificate | `noc_issued` *(seeder `011`)* | `NOC` | `employee_name`, `employee_code`, `designation` | no |
| `salary_certificate` | Salary Certificate | `salary_certificate_issued` *(seeder `010`)* | `SAL` | `employee_name`, `employee_code`, `designation`, `joining_date_text`, `annual_ctc_text`, `compensation_lines` | yes (type default) |

Notes that bind:

* **No new derived field is introduced.** Every field above already exists in
  `letter_derived_fields.js` `DERIVED_SPEC`. If a template wants something that is not there, it is a
  **narrative** field filled from `saved_fields` or `field_overrides`, never a new fact source — a
  new source is a scope change, not a template.
* `warning_letter` is the only template whose narrative body is materially HR-authored per issue
  (`incident_summary`, `expected_correction`, `response_due_text`). Those are `optional_fields`
  fillable by `field_overrides`; they are **escaped by double-stash** like every other value
  (EC-6), and the hostile-input fixture set must cover them.
* `salary_certificate` is compensation-bearing: it reuses `SOURCES.SALARY`, so a subject with no
  salary structure fails with `422 LETTER_FACTS_MISSING` naming `annual_ctc` (**EC-24**) and no
  letter is issued. It must be seeded confidential and must **not** be added to
  `letter_auto_issue_on_exit`'s permitted set (§11 BR-A2).
* `internship_certificate` needs `relieving_date_text`, which comes from `SOURCES.EXIT`. An intern
  with no `employee_exits` row therefore cannot receive one — stated, not worked around.

### 8.2 Registry changes — `src/modules/document/letter-templates/registry.js`

Additive, in this order:

1. Four new `ENTRIES` rows in the shape Phase 1 established (`code`, `title`,
   `document_type_code`, `reference_token`, `current_version`, `audience: 'letter'`,
   `required_fields`, `optional_fields`, `derived_fields`, `saved_field_schema` (Joi),
   `sample_data` (complete, realistic, **PII-free**), `pdf_config`).
2. A new per-entry boolean **`prints_reference`** (default `false`), consumed only by F-9.
3. For F-9, `current_version: 2` on every entry that ships a `v2`, with `v1` files **kept forever**
   (**D-2**).

The registry↔catalog consistency test (`tests/unit/pdf/letter_registry_catalog.test.js`) is extended
to assert that every entry's `document_type_code` exists in seeder `009`, `010` **or** `011`. That
test is what makes C-1 impossible to reintroduce.

**[R-12]** The same test gains a second assertion: every entry's `reference_token` is **unique**
across the registry, non-empty, and matches `^[A-Z]{2,8}$`. Sequences are keyed by
`template_code` but the rendered number is keyed by `reference_token`, so two templates sharing a
token draw from two independent counters into one number space — guarded only by
`org_documents_reference_number_uq`, i.e. by a `409 LETTER_REFERENCE_CONFLICT` that looks like a
transient glitch on a single issue and like a wall of failures on a 200-letter batch. Phase 4 adds
four tokens to five existing ones with nothing preventing a collision today.

### 8.3 `v2` templates for the printed reference number (F-9)

* `v2` of each of the nine templates is a **new file**, `…/<code>/v2.html`; `v1` is never edited
  (**D-2**).
* The only difference is a reference line in the letterhead block — `Ref. No.: {{reference_number}}`
  — plus `reference_number` added to `required_fields` and **not** to `derived_fields` (it is
  supplied by the service, and `field_overrides` must not reach it: it is added to a new
  `service_fields` list the override validator rejects alongside `derived_fields`).
* `prints_reference: true` and `current_version: 2` on the entry.
* An org pinned to `pinned_version: 1` keeps rendering `v1` and never gets a printed number — that
  is the backward-compatibility escape hatch, and it is the reason `pinned_version` exists (EC-15).
* The lint's declared-vs-used rule (rule 5) is what proves the placeholder is wired; a runtime
  required-field assertion is the second defence (EC-5).

---

## 9. Services — New and Changed

### 9.1 `document_letter.service.js` — four additive changes, no behaviour change to `#139`–`#142`

| # | Change | Why | Risk control |
|:--:|---|---|---|
| 1 | Split `_resolveIssuanceContext` into `_resolveOrgIssuanceContext(orgId, templateCode)` (registry entry, config, enabled check, version, type, settings, branding, reference pattern, org code, confidentiality/ack flags) and `_resolveSubjectIssuanceContext(orgCtx, { subjectUserId, overrides, effectiveDate })` (override validation, pinned date, facts, view model, FY, title, filename). `_resolveIssuanceContext` is retained verbatim as the composition of the two | Bulk must resolve the org-scoped half **once** for 500 subjects, not 500 times. Without the split the batch either duplicates the logic or makes 500 redundant settings/branding/S3 reads | `#139` and `#142` call the composition; a test asserts the composed result is deep-equal to the pre-split result for a fixture |
| 2 | `issue(...)` accepts optional `documentId` (default `crypto.randomUUID()`) and optional `orgContext` (default: resolve it) | The batch pre-generates `document_id` for the job's `source_id`; the worker passes the batch's cached org context | Both default to today's behaviour; no route passes either |
| 3 | `_computeIdempotencyKey` hashes `stableBrandingIdentity(...)` instead of the raw branding view model (**C-9**), **and** the same projection is passed as `renderAndRecord`'s `inputSnapshot` (**[R-11]**) | Key stability; and `input_snapshot` currently freezes the full view model — including a presigned `logo_src` that embeds the bucket and object key — into a `record`-class row kept for years, contradicting the module's "`storage_key` never leaves the service layer" rule. `pdf_render.service` already supports a redacted `inputSnapshot`; the letter path simply never passes one | §24 T-C9 asserts two mints of a >64 KB-logo branding yield one key; T-R11 asserts no snapshot contains `X-Amz-Signature` |
| 4 | `_resolveBranding` returns `{ branding, resolvedAt }` and gains `refreshAssets(branding, brandingRow)` (**C-11**) | Batch asset refresh | `#139`/`#142` ignore `resolvedAt`; only the worker consults it |

`issue`'s transaction shape, lock order, audit rows, error codes and response body are **unchanged**.

### 9.2 `document_letter_batch.service.js` — new

| Method | Responsibility |
|---|---|
| `validateCohort({ orgId, payload })` | Resolve the org context once; for each subject run `_resolveSubjectIssuanceContext` read-only. Collect `{ subject_user_id, error_code, message, fields? }` per failure. **No render, no write.** |
| `create({ orgId, actorId, payload, ipAddress, requestId })` | `#143`. Validate → if any failure, `422` with the full list and **nothing written** (EC-37). Else one transaction: batch header, items, job rows, audit. Returns `202 { batch_id, total, reused }` |
| `progress({ orgId, batchId })` | `#144`. Item-ledger aggregate + the failure list + the batch header |
| `renderItem({ orgId, job, orgContext })` | The worker callback. Loads the item by `job.source_id`, re-asserts issuability, calls `letterService.issue`, records the item outcome |
| `rollUpStatus({ orgId, batchId })` | `pending > 0` ⇒ `running`; else `failed+skipped = 0` ⇒ `completed`; else `completed_with_failures`; sets `completed_at`. **[R-8]** Run it at the end of every drain tick over **every** batch from `findRunnableForOrg(orgId)`, **not only** the batches a job was claimed for: when the last job of a batch goes terminal, the next tick claims nothing for it, so a "touched batches only" roll-up would leave that batch `running` and `completed_at` NULL forever |

### 9.3 `document_letter_proposal.service.js` — new

| Method | Responsibility |
|---|---|
| `propose({ orgId, actorId, actorRole, payload })` | `#145`. Gate on `manager_can_propose_letters` (#93) → `403 LETTER_PROPOSALS_DISABLED`; scope via `hierarchyAccess`; template must exist, be enabled and map to an active org-plane type; overrides validated; one open proposal per `(template, subject)` |
| `listMine({ orgId, actorId, query })` | `#146`. Hierarchy-scoped; a manager sees only their own proposals |
| `listPending({ orgId, query })` | `#148`. HR queue |
| `approve({ orgId, actorId, id, payload })` | `#149`. Lock the proposal; re-check the proposer's scope **now** (EC-40); separate-checker guard (#60); call `letterService.issue`; close the proposal in the issuing transaction |
| `reject({ orgId, actorId, id, payload })` | `#150`. Lock, require `pending`, write `rejected` + note + audit in one transaction |

### 9.4 `document_automation.service.js` — two additive passes

| Method | Responsibility |
|---|---|
| `runLetterRender({ orgId = null, batchId = null, limit })` | `_forEachOrg` → `workerService.drain({ orgId, sourceTypes: ['letter'], render })`, then `rollUpStatus` for every touched batch. **Not** gated on `pdf_render_engine` (C-10b). Resolves the org issuance context once per (org, template) and threads it into the callback |
| `runLetterAutoIssue({ orgId = null })` | §14.2. Per org: read `letter_auto_issue_on_exit` (#92); if empty, return immediately; else find due exits and issue each configured template with the fixed key |

Both follow `_forEachOrg`'s contract exactly: bounded by `CRON_ORG_LIMIT`, per-org errors collected
and logged, never rethrown.

### 9.5 `document_notification.service.js` — one event (C-8)

| Change | Detail |
|---|---|
| `document_defaults.js` | `NOTIFICATION_EVENT.LETTER_ISSUED = 'letter_issued'` |
| `EVENT_SETTING_TOGGLE` | `[LETTER_ISSUED]: 'document_notify_letter_issued'` (#94) |
| `buildMessage` | A sixth `case`: subject `"A new document has been issued to you"`, body naming the letter title and reference number, CTA to the employee's document detail deep link. **No PDF, no storage key, no presigned URL** — main plan §2.3: deep links only |
| Recipient rule | `recipient_user_id = the letter's subject`. Not HR, not the manager: the five existing events target HR or a requester; this one targets the employee, which the row model already supports (`_resolveRecipients` resolves a direct `recipient_user_id` to that user's email). **Caveat, verified:** that query requires `u.status = 'active'`, so a leaver already deactivated resolves to zero addresses and the row is recorded `skipped` / `recipient_inactive` — correct behaviour, but it means an auto-issued relieving letter may notify nobody if the org deactivates on the last working day (§1.4 gap 3's sibling) |
| Enqueue site | Inside the issuing `onReady` transaction, after the audit rows (§15.1), passing the already-loaded `context.settings` (the `enqueue` signature accepts `settings` precisely to avoid a second read inside the letter transaction) |
| **[R-9] `dedupeKey`** | **Required** — `enqueue` throws `500 NOTIFICATION_DEDUPE_INVALID` without a non-empty string of ≤ 200 chars. Use `` `letter_issued:${orgDocumentId}` `` (58 chars). The repository's `ON CONFLICT (org_id, dedupe_key) DO NOTHING` then makes a retried issue enqueue exactly one row |
| **[R-9] `PAYLOAD_WHITELIST`** | **Required** — `buildPayload` throws on an event type it has no entry for. Add `[LETTER_ISSUED]: ['letter_title', 'reference_number', 'document_type_name']`. No employee name, no compensation, no storage key; `assertPayloadClean` is the backstop, not the filter |
| **[R-9] `CTA_PATH_BY_ENTITY`** | **Required** — the map has no `org_document` key today, so `buildCtaUrl` would fall back to `/documents/{id}`, the **employee-plane** route, and send every notified employee to the wrong page. Add the org-document detail route — **OD-P4-9: confirm the exact path with the frontend before enabling `#94`** |

### 9.6 `document_settings.service.js` — four keys

Add `letter_bulk_max_subjects`, `letter_auto_issue_on_exit`, `manager_can_propose_letters`,
`document_notify_letter_issued` to `MUTABLE_FIELDS`; a `SETTINGS_CAPS` entry for
`letter_bulk_max_subjects` (`{ min: 1, max: 2000 }`); and one bespoke validator for
`letter_auto_issue_on_exit`: an array of at most five **distinct** strings, every one a registry
template code whose `document_type_code` resolves to an **active org-plane type in this org**, and
none of them a compensation-bearing template (BR-A2) → otherwise
`422 SETTING_OUT_OF_RANGE` naming the offending code.

### 9.7 `pdf_render_worker.service.js` — one pass-through (C-10a)

`drain({ orgId, render, sourceTypes = [], limit, staleMs, concurrency })` forwards `sourceTypes` to
`claimBatch`. Nothing else changes: the claim-commit-render-record ordering, the deterministic-code
set, the backoff schedule and the pool are untouched.

### 9.8 `payroll_automation.service.js` — two lines (C-10a, mandatory)

`runPayslipRender` passes `sourceTypes: ['payslip']` to `drain`. This is the **only** payroll file
Phase 4 edits, and the edit exists solely to stop payroll claiming letter jobs. Its regression gate
is that every `tests/unit/payroll/**` and `tests/unit/pdf/**` test passes unchanged.

### 9.9 Layer responsibilities

| Layer | Owns | Never does |
|---|---|---|
| **Controller** (`document_letter_batch.controller.js`, `document_letter_proposal.controller.js`, additions to `document_letter.controller.js`) | Shape validation via `validateOrThrow`; `orgId`/`actorId` from the token only; status-code selection; the `{ success, message, data }` envelope | Business rules, DB access, any `org_id` from the body |
| **Service** | Every invariant, every transaction boundary, every audit row, every authorization decision beyond the route's role gate | Open a transaction across a network call; touch S3 or the renderer directly |
| **Repository** | Scoped queries, projections, conditional writes, unique-violation translation | Business rules; returning `storage_key`, `input_snapshot`, `branding_snapshot` |
| **Builder / utils** (pure) | View models, reference patterns, stable branding identity | I/O, clock reads |
| **Provider** | HTML in, bytes out | Anything else (**D-1**, unchanged) |

---

## 10. API Surface — `#143` … `#150`

All document-plane routes keep the existing gate
`[authenticate, authorize([...]), requireFeature('documents.access')]` and mount under
`/api/v1/documents`. Query parameters are validated **inside controllers** (Express 5 `req.query` is
getter-only). No response ever carries a `storage_key`, an `input_snapshot`, a `branding_snapshot`, a
presigned URL, a renderer URL or an API key.

### 10.1 Route table

| # | Path | Method | Roles | Router file | Notes |
|:--:|---|---|---|---|---|
| 143 | `/documents/hr/letters/bulk` | POST | `hr` | `document_letter.routes.js` | `202 { batch_id, total, reused }`; `422` with the full per-subject error list when any subject fails validation |
| 144 | `/documents/hr/letters/bulk/:batchId` | GET | `hr` | `document_letter.routes.js` | progress + per-subject failures |
| 145 | `/documents/manager/letters` | POST | `manager`, `hr` | `document_letter_manager.routes.js` (new) | propose |
| 146 | `/documents/manager/letters` | GET | `manager`, `hr` | `document_letter_manager.routes.js` | own proposals, hierarchy-scoped |
| 147 | `/documents/hr/jobs/pdf-render/run` | POST | `hr` | `document_letter.routes.js` | drain this org's **letter** queue (inherited from Phase 3, DV-1 of that plan) |
| 148 | `/documents/hr/letters/proposals` | GET | `hr` | `document_letter.routes.js` | HR queue (**DV-1**) |
| 149 | `/documents/hr/letters/proposals/:id/approve` | POST | `hr` | `document_letter.routes.js` | approve → issues (**DV-1**) |
| 150 | `/documents/hr/letters/proposals/:id/reject` | POST | `hr` | `document_letter.routes.js` | reject (**DV-1**) |

**Route ordering is load-bearing.** `document_letter.routes.js` is mounted first at
`/api/v1/documents/hr`, and inside it the literal segments must precede the parameterised ones that
already exist:

```
/letters/bulk                       (#143)      before  /letters/:id
/letters/bulk/:batchId              (#144)      before  /letters/:id
/letters/proposals                  (#148)      before  /letters/:id
/letters/proposals/:id/approve      (#149)
/letters/proposals/:id/reject       (#150)
/jobs/pdf-render/run                (#147)      static, no collision
/letters                            (#139,#140) existing
/letters/:id/reissue                (#142)      existing
/letters/:id                        (#141)      existing, LAST
```

A router test asserts this exact order, extending the existing "no new HR router path duplicates an
existing route on the same base" test.

The manager plane gets a **new router file** rather than additions to `document_manager.routes.js`,
matching how `document_letter.routes.js` was carved out for the HR plane in Phase 1. It is added to
`document.index.js` alongside the other manager routers (line 27). **[R-14]** An earlier draft
claimed it must be mounted *first* so the literal `letters` segment is not swallowed; that
rationale is false and has been removed. `document_manager.routes.js` declares no root-level
`/:param` (its routes are `/types`, `/team/documents`, `/employees/:userId/documents`,
`/documents/recommendations`, `/documents/:id…`), so no ordering constraint applies today. The
router-order test is what will catch it if one is ever introduced — a false constraint in a plan
is worse than none, because the next author trusts it instead of re-checking.

### 10.2 Contracts

**`#143 POST /api/v1/documents/hr/letters/bulk`**

```jsonc
// request
{
  "template_code": "confirmation_letter",
  "subject_user_ids": ["<uuid>", "…"],          // 1..letter_bulk_max_subjects, distinct
  "field_overrides": { "closing_note": "…" },   // optional, applied to every subject
  "effective_date": "2026-10-01",               // optional; pins every letter's date
  "idempotency_key": "…"                        // optional; derived when absent
}
// 202
{ "success": true, "message": "Bulk issuance queued",
  "data": { "batch_id": "<uuid>", "total": 200, "reused": false,
            "counts": { "pending": 200, "issued": 0, "failed": 0, "skipped": 0 } } }
// 200 (re-submission of an identical batch)  → same body, reused: true, live counts
// 422 LETTER_BULK_VALIDATION_FAILED
{ "success": false, "message": "…", "errorCode": "LETTER_BULK_VALIDATION_FAILED",
  "details": { "failures": [ { "subject_user_id": "…", "error_code": "LETTER_FACTS_MISSING",
                               "message": "…", "fields": ["annual_ctc"] } ] } }
```

Error codes: `409 LETTER_TEMPLATE_DISABLED`, `409 DOCUMENT_TYPE_NOT_ACTIVATED`,
`409 DOCUMENT_TYPE_INACTIVE`, `422 DOCUMENT_TYPE_PLANE_MISMATCH`, `422 LETTER_FIELD_UNKNOWN`,
`422 LETTER_FIELD_NOT_OVERRIDABLE`, `422 LETTER_BULK_TOO_MANY_SUBJECTS`,
`422 LETTER_BULK_VALIDATION_FAILED`, `404 DOCUMENT_NOT_FOUND` (any subject outside the org — see
§12.3 for why this is uniform and not per-subject), plus the standard renderer/storage codes only if
the request somehow reaches a render, which it cannot: `#143` never renders.

**`#144 GET /api/v1/documents/hr/letters/bulk/:batchId`**

```jsonc
{ "batch": { "id": "…", "template_code": "…", "template_version": 2, "status": "running",
             "total": 200, "created_by": "…", "created_at": "…", "completed_at": null },
  "counts": { "pending": 3, "issued": 195, "failed": 2, "skipped": 0 },
  "queue":  { "queued": 3, "claimed": 0, "done": 195, "failed": 2, "cancelled": 0 },
  "failures": [ { "subject_user_id": "…", "failure_code": "PDF_RENDERER_UNAVAILABLE",
                  "failure_reason": "…", "updated_at": "…" } ] }
```

`counts` comes from the **item ledger** and is authoritative; `queue` comes from
`pdf_render_job.repository.countByBatch` and is diagnostic. A divergence between them is itself a
signal and is logged (§20). `failures` is paginated (`limit` ≤ 100, `offset`). `404
DOCUMENT_NOT_FOUND` for a batch id from another org — uniform, byte-identical to a non-existent id.

**`#145 POST /api/v1/documents/manager/letters`**

```jsonc
// request
{ "template_code": "experience_letter", "subject_user_id": "<uuid>",
  "field_overrides": { "closing_note": "…" }, "reason": "Leaving on 31 Oct" }
// 201
{ "proposal": { "id": "…", "template_code": "…", "subject_user_id": "…",
                "status": "pending", "created_at": "…" } }
```

Errors: `403 LETTER_PROPOSALS_DISABLED` (#93 off), `403 FORBIDDEN` (subject is not a direct
report — addressed by `userId`, so `403` not `404`, per main plan §9.3),
`409 LETTER_PROPOSAL_EXISTS`, `409 LETTER_TEMPLATE_DISABLED`, `409 DOCUMENT_TYPE_*`,
`422 LETTER_FIELD_*`.

**`#146 GET /api/v1/documents/manager/letters`** — `{ proposals: [...], total }`, filters
`status`, `template_code`; always `proposed_by = caller` for a manager. An `hr` caller on this route
sees their own proposals only (the HR queue is `#148`), so the route's meaning does not change with
the caller's role.

**`#147 POST /api/v1/documents/hr/jobs/pdf-render/run`** — `{ batch_id? , limit? }` in the body;
returns `{ claimed, done, retried, failed, cancelled, remaining }` where `remaining =
countLiveForOrg(orgId, { sourceType: 'letter' })`. Scoped to the caller's org. Rate-limited by
reusing `brandingService.checkPreviewRate(orgId, letter_preview_rate_per_hour)`? **No** — a drain is
not a render request and must not consume the preview budget; instead it is bounded by `limit ≤ 200`
and by the queue itself. Stated so the implementer does not improvise.

**`#148 GET /api/v1/documents/hr/letters/proposals`** — `{ proposals: [...], total }`, filters
`status` (default `pending`), `template_code`, `subject_user_id`, `proposed_by`.

**`#149 POST /api/v1/documents/hr/letters/proposals/:id/approve`**

```jsonc
// request
{ "field_overrides": { … },                       // optional; replaces the manager's when present
  "effective_date": "2026-10-31",                  // optional
  "acknowledge_stale_scope": false,                // required true to override EC-40
  "idempotency_key": "…" }                         // optional
// 201 — same letter/artifact body shape as #139, plus proposal:{ id, status:'approved' }
// 200 — reused: true on an idempotent replay
```

Errors add `409 LETTER_PROPOSAL_NOT_PENDING`, `409 PROPOSAL_SCOPE_STALE` (EC-40, cleared by
`acknowledge_stale_scope: true`), `409 SELF_APPROVAL_NOT_ALLOWED` (#60 on and approver = proposer),
plus every `#139` error verbatim — because `#149` **is** `#139` underneath.

**`#150 POST /api/v1/documents/hr/letters/proposals/:id/reject`** — `{ reason }` (required,
≤ 500 chars) → `200 { proposal: { id, status: 'rejected', decided_at } }`.

### 10.3 What is deliberately **not** added

* No employee-plane and no additional manager-plane **read** endpoints (§3.5).
* No bulk **download** endpoint. A batch produces 200 ordinary `org_documents`; each is downloaded
  through the existing `#57` view-url. A letter ZIP is not in any phase's scope.
* No `DELETE`/cancel on a batch or an item (§1.3).
* No change to `#139`–`#142` request or response shapes (§26).

### 10.4 Frontend change record — mandatory

Create `public/md_updates/pdf_letters_phase4_2026_XX_XX.md` (repository-relative; CLAUDE.md's
absolute Windows path is superseded by the repository-aware rule of this task) naming: the eight new
endpoints with full request/response shapes and error codes; the four new settings keys on
`GET`/`PUT /documents/hr/settings`; the new `template_code` values returned by `#135`/`#136`; the
fact that `#139`–`#142` are **unchanged**; and the one user-visible change — a letter rendered from a
`v2` template now prints `Ref. No.` on the page (F-9), which is additive and does not alter any
response field.

---

## 11. Business Rules & Validations

Numbered so tests and review can cite them. BR-1 … BR-33 belong to Phase 2 and are unchanged.

### Bulk (BR-B*)

| # | Rule | Enforced in |
|---|---|---|
| BR-B1 | `subject_user_ids` is 1..`letter_bulk_max_subjects` (#91, default **200** — **[R-6]**), **distinct**, all UUIDs. Duplicates are a `422`, not silently de-duplicated — a caller who sent the same person twice has a bug worth surfacing | validator + service |
| BR-B2 | The template must be enabled for the org (`LETTER_TEMPLATE_DISABLED`) and its type active and org-plane, checked **once** before any subject work | `_resolveOrgIssuanceContext` |
| BR-B3 | The whole cohort is validated **before** anything is written. Any failure ⇒ `422` with every failure listed, zero rows written, zero renders spent (**EC-37**) | `validateCohort` |
| BR-B4 | `field_overrides` apply to every subject and obey BR-20 (declared, non-derived, non-service fields) | `_resolveSubjectIssuanceContext` |
| BR-B5 | `template_version` is resolved **once** and frozen on the batch; every item renders that version even if the registry moves mid-drain (**EC-15**) | batch header |
| BR-B6 | The pinned date is frozen at batch creation (`effective_date`, else the creation date) so a batch draining across midnight does not split dates | batch header |
| BR-B7 | Branding **content** is frozen on the batch; asset **transport** is refreshed above `BRANDING_ASSET_REUSE_MS` (**C-11**) | `renderItem` |
| BR-B8 | Each item's letter is issued through `document_letter.service.issue` with `idempotency_key = 'batch:{batch_id}:{subject_user_id}'` and `documentId = item.document_id`. **No second issuance implementation exists** | `renderItem` |
| BR-B9 | A re-submitted batch (same derived or explicit key) returns the existing `batch_id` and enqueues only items still `pending` (**EC-38**) | `create` |
| BR-B10 | A batch is never rolled back after creation. Per-subject failures are recorded; the issued letters stand | `renderItem` |
| BR-B11 | An item whose subject stopped being issuable at render time (deleted, type deactivated) is `skipped`, not `failed`: it will never succeed on retry and must not burn attempts | `renderItem` |
| BR-B12 | `#144` reports the **item ledger** as truth | `progress` |

### Auto-issue (BR-A*)

| # | Rule | Enforced in |
|---|---|---|
| BR-A1 | The sweep is a no-op unless `letter_auto_issue_on_exit` (#92) is a non-empty array | `runLetterAutoIssue` |
| BR-A2 | Only non-compensation-bearing templates may be configured. `appointment_letter`, `salary_certificate` and any future template whose `derived_fields` include a `SOURCES.SALARY` field are refused at settings-write time with `422 SETTING_OUT_OF_RANGE`. Rationale: an automatic, unreviewed letter must not state a salary | `document_settings.service` |
| BR-A3 | Trigger = a **non-cancelled** `employee_exits` row whose `last_working_day <= today (IST)` (**C-4**), for a subject who is still resolvable | `runLetterAutoIssue` |
| BR-A4 | Idempotency is the explicit key `autoexit:{exit_id}:{template_code}`, so the same exit can never produce two of the same letter however often the sweep runs (**EC-39**) | `runLetterAutoIssue` |
| BR-A5 | A configured template that is disabled, unmapped or whose type is inactive is **skipped with a log line**, never an error that aborts the sweep for the rest of the org | `runLetterAutoIssue` |
| BR-A6 | The sweep runs **after** the offboarding archive in the same tick, so a freshly issued letter's recipient obligation is not waived by the archive (§14.2 rule 3) | cron ordering |
| BR-A7 | A subject who can no longer be resolved (`404` from the facts resolver) is logged as `subject_unresolvable` and not retried within the same run | `runLetterAutoIssue` |
| BR-A8 | Each auto-issued letter is bounded: at most `AUTO_ISSUE_BATCH = 50` exits per org per run, so a backlog drains over days rather than storming the renderer | `runLetterAutoIssue` |

### Maker–checker (BR-M*)

| # | Rule | Enforced in |
|---|---|---|
| BR-M1 | Proposing requires `manager_can_propose_letters` (#93) `true` | `propose` |
| BR-M2 | The subject must be in `hierarchyAccess.getAccessibleUserIds(orgId, actor)` at propose. An `hr` caller on `#145` is a global approver (`null`) and may propose for anyone | `propose` |
| BR-M3 | One open proposal per `(org, template_code, subject_user_id)` | partial unique index |
| BR-M4 | Scope is re-checked **at approval** against the **proposer**, not the approver (**EC-40**). Stale ⇒ `409 PROPOSAL_SCOPE_STALE` unless `acknowledge_stale_scope: true`, which writes an audit row | `approve` |
| BR-M5 | `document_require_separate_checker` (#60) applies: approver ≠ proposer | `approve` |
| BR-M6 | Approval issues through `document_letter.service.issue` with `idempotency_key = 'proposal:{proposal_id}'`, so a double-click approves once and issues once | `approve` |
| BR-M7 | The proposal is closed (`approved`, `decided_by`, `decided_at`, `letter_id`) **inside the issuing transaction**. A proposal can never be `approved` without a letter, nor a letter exist with the proposal still `pending` | `approve` `onReady` |
| BR-M8 | Rejection requires a reason and is terminal | `reject` |
| BR-M9 | A manager never sees another manager's proposals, and never sees the issued letter unless the type's confidentiality allows it — unchanged, resolved by the existing manager read rules | `listMine`, existing reads |

### Reference printing (BR-R*)

| # | Rule |
|---|---|
| BR-R1 | Only a template version with `prints_reference: true` allocates before the render |
| BR-R2 | `reference_number` is a **service field**: it may not be supplied by `field_overrides` and is not a derived field |
| BR-R3 | The allocated number is excluded from the idempotency-key input (**BR-31**, unchanged), so retry semantics are exactly as today |
| BR-R4 | A render failure after allocation burns the number. Gaps are accepted (**D-20**) and the burn is logged at `warn` with the template, FY and number so an auditor can explain the gap |
| BR-R5 | An org on `pinned_version: 1` is unaffected in every respect |

---

## 12. Authorization & Security

### 12.1 Role planes

| Endpoint | Roles | Feature gate |
|---|---|---|
| `#143`, `#144`, `#147`, `#148`, `#149`, `#150` | `hr` | `documents.access` |
| `#145`, `#146` | `manager`, `hr` | `documents.access` |

`admin` / `super-admin` have **no** access to any of them — platform roles hold no tenant data
(Documents D-10). No new feature flag (**D-22**).

### 12.2 Tenant isolation

`org_id` is in every predicate, every index and every FK of the three new tables. The batch id, the
item id, the proposal id and the subject id are all resolved with `org_id` in the `WHERE`. A batch id
from another org loads as `null` and is denied **identically** to a non-existent id. The letters a
batch produces inherit the isolation the artifact and storage keys already carry (`org_id` is in the
idempotency key, the storage key and every predicate — **EC-46**, unchanged).

### 12.3 Uniform denial

| Situation | Response |
|---|---|
| A batch / proposal id from another org, soft-deleted, or not visible | `404 DOCUMENT_NOT_FOUND`, byte-identical in all three cases |
| A manager proposing for a non-report | `403 FORBIDDEN` — addressed by `subject_user_id`, so scope is checked **before** existence (main plan §9.3) |
| A manager acting on a proposal id that is not theirs | `404 DOCUMENT_NOT_FOUND` — addressed by id |
| `#143` with a `subject_user_id` outside the org | The cohort validation reports it as `404 DOCUMENT_NOT_FOUND` **for that subject** inside the failure list, and the batch is refused. This deliberately does **not** disclose more than the single-issue path already does: `#139` for the same id returns the same code, so the bulk list reveals nothing new |
| Any error | Never discloses a storage key, an `input_snapshot`, a `branding_snapshot`, a renderer URL, an API key, or whether a template exists but is disabled in another org |

### 12.4 PDF access control

Unchanged by Phase 4. A bulk-issued, auto-issued or approval-issued letter is an `org_documents` row
with `is_confidential` frozen from `letter_default_confidential` (#85) and a single materialised
recipient. It is served by the existing `#57` view-url through `findByIdForStorage` — the only
storage-key-reading method — with the org's `document_view_url_ttl_seconds` (#61) and the provider's
900 s hard cap. Phase 4 mints **no** new download path and reads **no** bytes back.

### 12.5 Injection and hostile input

* Every new template field is double-stash only; the lint bans triple-stash and the hostile-input
  fixture set is extended to the four new templates and the nine `v2` files (**EC-6**).
* `warning_letter`'s narrative overrides are the largest new attack surface in this phase: they are
  free text from an HR request body that lands in a rendered document. They are escaped by
  Handlebars, length-capped by the validator, and covered by the hostile-string fixture.
* `reason` / `decision_note` on proposals are `STRING(500)`, never rendered into a PDF, and never
  placed in an audit row's free-text position without truncation.
* `letter_auto_issue_on_exit` is validated as an allow-list of registry codes — an arbitrary string
  can never reach the loader.

### 12.6 Secrets and PII

* `branding_snapshot` on the batch holds branding **content** only; asset srcs (which may be
  presigned URLs) are stripped before it is stored, and the column never leaves the service layer.
* The batch item's `failure_reason` is truncated at 500 chars and is written from the same
  `mapRenderError` output the artifact uses — it can never carry a view model, HTML or a key.
* Log lines carry ids, codes, counts and durations. Never `data`, never HTML, never the API key
  (**D-15**, enforced by the existing `renderer_secret_hygiene.test.js`, which is extended to the
  new service files).

---

## 13. Lifecycle & State Transitions

### 13.1 Batch

```
                 create (#143, validation passed)
                        │
                     [queued] ──── first drain claims an item ───▶ [running]
                        │                                              │
                        │                                    all items terminal
                        ▼                                              ▼
                  (no items pending, none failed)              [completed]
                                                                       │
                                            some failed / skipped ─────▶ [completed_with_failures]
```

`cancelled` exists on the enum but has **no producer in Phase 4** (§1.3). It is present so a future
cancel does not need an enum ALTER; a unit test asserts no Phase 4 code writes it.
`rollUpStatus` is idempotent and recomputes from the item ledger every tick; a terminal batch is
never moved back.

### 13.2 Batch item

```
[pending] ──issue succeeded──▶ [issued]      (letter_id, artifact_id, reference_number, issued_at)
    │
    ├──transient failure────▶ stays [pending]; the JOB backs off and retries (2 / 10 / 30 min)
    │
    ├──attempts exhausted───▶ [failed]       (failure_code, failure_reason)
    │
    └──never issuable───────▶ [skipped]      (subject gone, type inactive, template disabled)
```

The item is the **business outcome**; the job is the **attempt**. They are deliberately separate:
the job's retry/backoff mechanics already exist and are proven (Phase 3), and overloading the item
with them would fork that logic.

### 13.3 Proposal

```
[pending] ──#149 approve──▶ [approved]  (decided_by, decided_at, letter_id)
    │
    ├──#150 reject────────▶ [rejected]  (decided_by, decided_at, decision_note)
    │
    └── cancelled: no producer in Phase 4 (reserved, as above)
```

Every transition out of `pending` is conditional on `status = 'pending'` under `FOR UPDATE`, so two
concurrent approvals produce one letter and one `409 LETTER_PROPOSAL_NOT_PENDING`.

### 13.4 Artifact and job lifecycles

**Unchanged.** Phase 4 produces `retention_class = 'record'`, `source_type = 'letter'` artifacts
through the identical `pending → ready | failed` machine Phase 1 built and Phase 2 uses, and
identical `queued → claimed → done | failed | cancelled` jobs from Phase 3. No new state, no new
edge.

### 13.5 Invalid states and how each is prevented

| Invalid state | Prevention |
|---|---|
| An `issued` item with no letter | `document_letter_batch_items_issued_chk` |
| An `approved` proposal with no letter | `document_letter_proposals_approved_chk` |
| A decided proposal with no decider | `document_letter_proposals_decided_chk` |
| Two open proposals for one `(template, subject)` | `document_letter_proposals_live_uq` |
| Two items for one `(batch, subject)` | `document_letter_batch_items_subject_uq` |
| Two live jobs for one prospective letter | `pdf_render_jobs_live_source_uq` (Phase 3) |
| Two letters from one batch item | `pdf_render_artifacts UNIQUE (org_id, idempotency_key)` + BR-B8's fixed key |
| Two letters from one exit + template | BR-A4's fixed key + the same unique index |
| Two letters from one proposal | BR-M6's fixed key + the same unique index |
| A batch that exceeds the configured cap | validator (#91) + `document_letter_batches_total_chk` |
| A letter job claimed by the payroll drain | C-10a `sourceTypes` scoping |
| A generated `org_documents` row without artifact/number/s3 | `org_documents_generated_chk` (Phase 2, untouched) |

---

## 14. Workflows — End to End

### 14.1 Bulk issuance (`#143` → drain → `#144`)

```
HR: POST /api/v1/documents/hr/letters/bulk
    { template_code, subject_user_ids[], field_overrides?, effective_date?, idempotency_key? }

 A. authorize(['hr']) + requireFeature('documents.access')            [controller]
 B. shape validation; distinct ids; count <= letter_bulk_max_subjects (#91)   → 422
 C. derive idempotency_key when absent:
       sha256(canonical{ org, template_code, template_version, sorted subject ids,
                         field_overrides, effective_date, pinned_date })
 D. probe document_letter_batches by (org_id, idempotency_key)
       hit → skip to step I with reused: true                          [EC-38]
 E. _resolveOrgIssuanceContext(orgId, template_code)                   ── reads only
       template enabled? type active + org-plane? settings? branding?  → 409 / 422
 F. for each subject: _resolveSubjectIssuanceContext(orgCtx, …)        ── reads only
       collect failures; NOTHING is rendered and NOTHING is written    [EC-37]
 G. failures.length > 0  →  422 LETTER_BULK_VALIDATION_FAILED, full list, no state change
 H. BEGIN                                                              ── no network inside
      insert document_letter_batches (status='queued', frozen version / date / branding)
      insert document_letter_batch_items (one per subject, document_id pre-generated)
                                          -- ON CONFLICT DO NOTHING; a re-submission adds none
      [R-5] pending = itemRepo.findPendingForBatch(org, batch.id, { limit: cap }, t)
            -- THE LEDGER IS AUTHORITATIVE. Enqueue from `pending`, never from the freshly
               generated candidates: on a re-submission the items already exist with their
               ORIGINAL document_ids, and enqueueing the new ids would point every job at a
               document no item owns, so renderItem cancels them and EC-38 silently fails.
      jobRepo.enqueueMany(org, rows: { source_type:'letter',
                                       source_id: item.document_id,
                                       batch_id, template_code, template_version,
                                       engine:'html', priority: 100 }, t)   -- ON CONFLICT DO NOTHING
      audit: letter_batch.created  (entity_type 'document_letter_batch')
    COMMIT
 I. 202 { batch_id, total, reused, counts }

--- later, every 15 minutes, and on demand via #147 ---

pdf_render_worker.cron  →  document_automation.runLetterRender({})
  per org:
    drain({ orgId, sourceTypes: ['letter'], render: renderItem })
      [txn 1] claimBatch (attempt consumed at claim)  → COMMIT
      per claimed job, bounded concurrency (default 4), NO transaction open:
         renderItem(job):
           1. item = itemRepo.findByDocumentId(org, job.source_id)     → no item ⇒ cancel the job
           2. item.status !== 'pending'                                 → job done, no-op
           3. orgCtx = cached per (org, template_code, template_version)
           4. asset refresh if resolvedAt older than BRANDING_ASSET_REUSE_MS   [C-11]
           5. letterService.issue({ orgId, actorId: batch.created_by,
                                    payload: { template_code, subject_user_id,
                                               field_overrides, effective_date,
                                               idempotency_key: 'batch:{b}:{s}' },
                                    documentId: item.document_id, orgContext: orgCtx })
              └─ this is the EXACT #139 path: pending artifact → render → S3 → txn B
                 (advisory lock, subject re-check, type re-check, number, letter row,
                  recipient, audits, notification enqueue)
           6. [txn] itemRepo.markIssued(...)                            → artifactId back to the worker
           failure → classify:
              never-issuable (404 subject / 409 type / 409 template)  → [R-3] one txn:
                   itemRepo.markSkipped(...)  +  jobRepo.cancelLiveForSource(org,'letter',
                                                    job.source_id, { reason })
                   then return { artifactId: null, cancelled: true }
                   (markDone with a null artifact violates pdf_render_jobs_done_chk, and a
                    bare { cancelled: true } records NOTHING, leaving the job 'claimed')
              deterministic (PDF_TEMPLATE_INVALID …)                  → markFailed + job failed
              transient (renderer / storage / network)                 → item stays pending;
                                                                         job backs off and retries
      [txn 2] markDone | recordFailure, one transaction per job
    rollUpStatus(org, each touched batch_id)
```

**Why step 6 is a separate transaction from the letter's transaction B.** `renderAndRecord`'s
`onReady` transaction is owned by `pdf_render.service` and is the one that must contain the artifact
flip, the number, the letter row, the recipient and the audits. Adding the item write to it would
require threading a document-module concern through a `common/` service that must not know about
letters. The consequence is a two-transaction window: a crash between them leaves a **letter issued
and its item still `pending`**. That is recoverable and non-duplicating, because the next drain
re-runs `renderItem`, `issue` finds the `ready` artifact under the same key, returns `reused: true`
with the existing letter, and step 6 then marks the item `issued`. This is the same
converge-on-retry property Phase 2 designed for `#139`, and it is the reason BR-B8's key is fixed
rather than derived.

### 14.2 Auto-issue on exit

```
document_offboarding_archiver.cron (daily, IST)
  1. document_automation.runOffboardingArchive({})          -- existing, unchanged
  2. document_automation.runLetterAutoIssue({})             -- NEW, strictly after (1)

runLetterAutoIssue, per org (bounded by CRON_ORG_LIMIT):
  a. settings = document_settings.getOrCreate(org)
     templates = settings.letter_auto_issue_on_exit          → [] ⇒ return immediately   [BR-A1]
  b. exits = employee_exit.repository.findLiveForOrg(org)    -- lazy-required, D-18 guarded
        filter: status <> 'cancelled'
                AND last_working_day IS NOT NULL
                AND toIstDateString(last_working_day) <= todayIst                        [BR-A3, C-4]
        [R-4] DO NOT use findLiveForOrg + .slice(): it has no ORDER BY and no LIMIT, returns
              every non-cancelled exit the org ever recorded, and an arbitrary-order slice
              means that past ~50 historical exits the sweep re-probes the same rows daily
              and NEVER reaches a new leaver. Use instead:
                employee_exit.repository.findDueForLetterAutoIssue(org, {
                  onOrBefore: todayIst,
                  notBefore : todayIst - AUTO_ISSUE_LOOKBACK_DAYS (30),
                  limit     : AUTO_ISSUE_BATCH (100) })
                -- SQL-filtered, ORDER BY last_working_day DESC, LIMIT.                [BR-A8]
              warn `letter.auto_issue.window_saturated` when due_count === limit.
  c. for each exit × each configured template:
        [R-2] org_documents.created_by is NOT NULL, so actorId MUST NOT be null:
              attribution = exit.recorded_by;  null  ⇒ skip the exit with
              `letter.auto_issue.no_attributable_actor` and render NOTHING.
              systemOrigin:true makes the audit row carry actor_id:null + the reason,
              so the trail still says no human clicked.
        letterService.issue({ orgId, actorId: attribution, systemOrigin: true,
                              payload: { template_code, subject_user_id: exit.user_id,
                                         effective_date: exit.last_working_day,
                                         idempotency_key: 'autoexit:{exit.id}:{code}' } })
        → already issued  ⇒ returns reused:true, no render, no number, no row      [EC-39]
        → 404 subject     ⇒ log letter.auto_issue.subject_unresolvable, continue    [BR-A7]
        → 409 template/type ⇒ log letter.auto_issue.template_unavailable, continue  [BR-A5]
        → 503 renderer    ⇒ log and continue; tomorrow's sweep retries
  d. return { orgs_scanned, exits_scanned, issued, skipped, errors }
```

Rules that bind:

1. `actorId` is `null` — a cron-originated render, exactly as `pdf_render_artifacts.created_by`
   already documents for cron renders. The audit row records the action with a null actor and a
   `reason` of `auto_issue_on_exit`.
2. `effective_date` is the exit's `last_working_day`, so the letter's pinned date is the business
   date and is stable across sweeps.
3. **Ordering with the archive is load-bearing.** `document_offboarding.archiveForUser` step 3 calls
   `recipientRepo.bulkWaiveForUser` and step 5 `notificationRepo.skipPendingForUser`. A letter issued
   *before* the archive in the same tick would have its recipient obligation waived and its
   notification skipped — the employee would never be asked to acknowledge and never be emailed.
   Issuing *after* is correct: the new recipient row and the new outbox row are created after the
   sweep has passed. This is why the pass is appended to the existing cron rather than given its own
   schedule, where a clock change could silently invert the order.
4. The sweep never throws out of `_forEachOrg`; a per-org error is collected and logged.
5. The renderer being down degrades to "no letters today", never to a failed cron or a partial write.
6. A subject already removed from the org is skipped, not retried forever (§1.4 gap 3).

### 14.3 Manager proposal → HR approval

```
Manager: POST /api/v1/documents/manager/letters                                   #145
  1. authorize(['manager','hr']) + requireFeature('documents.access')
  2. settings.manager_can_propose_letters (#93)             → 403 LETTER_PROPOSALS_DISABLED
  3. ids = hierarchyAccess.getAccessibleUserIds(org, actor)
       null (hr/global) ⇒ allowed; array not containing subject ⇒ 403 FORBIDDEN     [BR-M2]
  4. template exists, enabled, type active + org-plane      → 409 / 422
  5. field_overrides declared + non-derived + non-service   → 422
  6. BEGIN  insert proposal (pending)  + audit letter_proposal.created  COMMIT
       23505 on document_letter_proposals_live_uq           → 409 LETTER_PROPOSAL_EXISTS
  7. 201 { proposal }

HR: POST /api/v1/documents/hr/letters/proposals/:id/approve                       #149
  1. authorize(['hr'])
  2. [R-15] proposalRepo.findById(org, id)   -- PLAIN READ, no lock, no transaction
                 null            ⇒ 404 uniform
                 not 'pending'   ⇒ 409 LETTER_PROPOSAL_NOT_PENDING
     -- a COURTESY pre-check only, for a fast 404/409. The authoritative check is the
        conditional decide() inside onReady. An earlier draft took FOR UPDATE here and
        then rendered; the lock buys nothing and one refactor away it is held across a
        20 s Lambda call, which is the one rule this module states most emphatically.
        §24.4 asserts no `{ lock: true }` appears in the same function body as an
        `issue(` call.
  3. separate-checker (#60): decided_by === proposed_by         → 409 SELF_APPROVAL_NOT_ALLOWED  [BR-M5]
  4. stale-scope: hierarchyAccess.getAccessibleUserIds(org, { id: proposal.proposed_by,
                                                              role: 'manager' })
       does not include the subject, and acknowledge_stale_scope !== true
                                                               → 409 PROPOSAL_SCOPE_STALE  [BR-M4, EC-40]
       acknowledged ⇒ audit letter_proposal.stale_scope_overridden
  5. letterService.issue({ orgId, actorId: hrUserId,
                           payload: { template_code, subject_user_id,
                                      field_overrides: request ?? proposal.field_overrides,
                                      effective_date,
                                      idempotency_key: 'proposal:{id}' },
                           onIssued: (ctx, t) => proposalRepo.decide(org, id,
                                       { status:'approved', decidedBy, decidedAt,
                                         letterId: ctx.documentId }, t)  })
       -- the decide() call runs inside the SAME onReady transaction as the letter row, and
          is conditional on status='pending'; 0 rows changed ⇒ throw, rolling the letter back.
          A proposal can therefore never be approved without a letter, nor vice versa.  [BR-M7]
  6. 201 (or 200 reused:true) { letter, artifact, proposal }
```

`onIssued` is a **second optional hook** on `document_letter.service.issue`, invoked inside the
existing `onReady` transaction after `_writeLetterRow`. It is the minimal extension point that keeps
BR-M7 atomic without the proposal service opening a transaction of its own around a render.

---

## 15. Transactions & Concurrency

### 15.1 The rule, restated because it binds

**No network call — renderer or S3 — ever happens inside a transaction.** Phase 4 adds three new
transaction sites and every one of them is pure DB work.

| Site | Contents | Duration |
|---|---|---|
| Batch create (§14.1 H) | header + N items + N job rows + one audit | One statement per kind (`bulkCreate`), bounded by `letter_bulk_max_subjects` |
| Item outcome (§14.1 step 6) | one conditional UPDATE | microseconds |
| Proposal create / reject | one insert or one conditional UPDATE + one audit | microseconds |
| Letter issuance `onReady` | **unchanged from Phase 2**, now additionally carrying the notification enqueue and, on the approval path, `proposalRepo.decide` | unchanged |
| Batch roll-up | one conditional UPDATE | microseconds |

Unmanaged transactions only (`const t = await db.sequelize.transaction()` … `commit()`/`rollback()`,
with `if (!t.finished) await t.rollback()` in the catch), matching every other service in the module.

### 15.2 Lock ordering

Unchanged from Phase 2, extended by one rung at the top:

```
proposal row (FOR UPDATE, #149 only)
  → document group advisory lock  (pg_advisory_xact_lock)
    → org_documents row           (FOR UPDATE, reissue only)
      → document_letter_sequences (FOR UPDATE, LAST)
```

Batch and item rows take **no** lock beyond the conditional-UPDATE predicate: they are
single-writer-per-row by construction (one worker holds the job claim). This is deliberate — adding
a row lock there would put a lock in the same transaction as nothing else and buy no property.

### 15.3 Concurrency scenarios

| Scenario | Outcome |
|---|---|
| Two HR users POST the same bulk cohort simultaneously | `UNIQUE (org_id, idempotency_key)` on the batch header: one creates, the loser's insert raises 23505, is caught, re-reads and returns the winner's batch with `reused: true` |
| Two workers drain the same org | `FOR UPDATE SKIP LOCKED` in `claimBatch` gives disjoint sets (Phase 3, unchanged) |
| A worker dies holding claims | Attempts were consumed at claim; the stale window (`PDF_WORKER_STALE_MS`, 10 min) makes the rows re-claimable; the item is still `pending`, so the retry converges |
| Two drains render the same item | `pdf_render_jobs_live_source_uq` prevents two live jobs for one `document_id`; even if it were bypassed, `issue`'s fixed key yields one artifact and one letter, and the second `markIssued` changes 0 rows and is logged |
| A batch re-submitted while the first is still draining | The probe returns the running batch; `bulkCreate` with `ignoreDuplicates` inserts nothing; `enqueueMany`'s `ON CONFLICT DO NOTHING` re-queues only subjects with no live job |
| Two HR users approve the same proposal | The `onReady` `decide()` is conditional on `status='pending'`; the loser changes 0 rows, throws, and its letter transaction rolls back. Exactly one letter exists |
| A manager's report changes between propose and approve | Re-checked at approval (BR-M4, EC-40) |
| Auto-issue sweep overlaps a manual `#139` for the same subject and template | Different idempotency keys (`autoexit:…` vs derived) ⇒ **two letters**. This is correct and intended: an HR user who explicitly issued a relieving letter and an automatic one are two acts. The `allows_multiple` flag on every letter type permits it. Documented as EC-P4-6 rather than prevented |
| Two auto-issue sweeps overlap (cron overrun) | Fixed key ⇒ the second finds the `ready` artifact and returns `reused: true` |
| The reference sequence under a 500-letter batch | `FOR UPDATE` on one row per `(org, template, FY)` serialises allocation; at concurrency 4 this is the drain's throughput ceiling and is acceptable. Gaps remain accepted (**D-20**, **EC-18**) |

---

## 16. Idempotency, Retry & Duplicate Requests

### 16.1 Key derivation, per entry point

| Entry point | Key | Stability |
|---|---|---|
| `#143` batch | explicit, or `sha256(canonical{org, template, version, sorted subjects, overrides, effective_date, pinned_date})` | Stable — no branding, no clock beyond the pinned date |
| Batch item → `issue` | **`keyBase = batch:{batch_id}:{subject_user_id}`** | Stable by construction, **and salted** — **[R-1]** |
| Auto-issue → `issue` | **`keyBase = autoexit:{exit_id}:{template_code}`** | Stable by construction, **and salted** — **[R-1]** |
| Approval → `issue` | **`keyBase = proposal:{proposal_id}`** | Stable by construction, **and salted** — **[R-1]** |
| `#139` / `#142` | unchanged (derived, or client-supplied) | **Made stable by C-9** |

**[R-1] — the correction that matters most in this document.** An earlier draft passed these as
*client* keys and argued that bypassing the failure salt was desirable. That is inverted, and it
would have been a production outage. The shipped code is unambiguous:
`_computeIdempotencyKey` does `if (clientKey) return baseKey` — no salt, ever — and
`pdf_render.service` answers a `failed` row under that key with `throw failedRowError(probe)`,
never a re-render. Since `safeMarkFailed` marks the artifact `failed` on **every** render failure,
transient ones included, a single renderer timeout would poison that subject's, that exit's or that
proposal's key **permanently**: three worker retries, three `504`s without a render, job dead, item
stranded, and a batch re-submission wedged on the same row.

So Phase 4 passes a deterministic **`keyBase`**, not a client key, and `keyBase` goes through the
same bounded salt as a derived key:

```js
const keySuffix = clientKey ?? keyBase ?? <derived digest>
const baseKey   = sha256(`letter:issue:${orgId}:${keySuffix}`).slice(0, 64)
if (clientKey) return baseKey                                   // external callers: unchanged
const failed = await artifactRepo.countFailedByKeyPrefix(orgId, baseKey)   // LIKE '<base>%', failed only
if (failed >= SALT_CEILING) throw new AppError(409, …, 'PDF_RETRY_LIMIT_EXCEEDED')
return failed === 0 ? baseKey : `${baseKey}:r${failed}`
```

Exactly-once survives: attempt 1 fails → `base` is `failed`; attempt 2 → count 1 → `base:r1` →
renders; a duplicate attempt 3 → count still 1 → `base:r1` → `ready` → `reused: true`. One letter,
whatever the retry count, and a bounded five-step poison ceiling. `#139`'s own derived-key
stability still depends on C-9, which remains blocking.

### 16.2 Retry semantics by failure point

| Failure point | Who retries | Effect |
|---|---|---|
| `#143` before the transaction | The client | Nothing was written; safe |
| `#143` transaction fails | The client | Nothing committed; the derived key makes a re-POST converge |
| Renderer 5xx / timeout during `renderItem` | The worker, after 2 / 10 / 30 min backoff | The item stays `pending` and the next attempt re-renders under the **salted** key (**[R-1]**). **[R-7]** The stale-`pending` artifact left by a *crashed* worker is a different case and the plan's original answer was wrong: `pdf_artifact_sweeper` has a 30-minute threshold but runs **once a day at 04:00 IST**, while `pdf_render.service` answers a `pending` row with `409 PDF_RENDER_IN_PROGRESS`, which the worker treats as transient. All three attempts are spent in ~42 minutes and the item is stranded for up to 20 hours. Required: (a) extend `findStalePendingForSweep` / `pdfArtifactSweeperService.run` with an optional `sourceTypes` filter and call `run({ orgId, sourceTypes: ['letter'] })` at the **head** of `runLetterRender` — recovery, not purge, and payroll's cadence is untouched; (b) enqueue letter jobs with `max_attempts: 5` so the backoff spans ~100 minutes and outlasts the 30-minute window |
| Renderer 400 (`PDF_TEMPLATE_INVALID`) | **Nobody** | Deterministic; the job fails immediately without burning attempts (Phase 3's `DETERMINISTIC_CODES`), the item is marked `failed`, and it is alertable — it means our template or data is wrong |
| S3 write fails | The worker | `503`; no letter row, no number consumed; converges on retry |
| Commit fails after the S3 write | The worker | `pending` artifact + an object under the deterministic key; the sweeper resolves it; the retry overwrites identical bytes rather than duplicating (**EC-20**, unchanged) |
| Crash between the letter commit and `markIssued` | The worker | The letter exists; the next attempt's `issue` returns `reused: true` and `markIssued` completes (§14.1) |
| `#149` approve fails after the letter committed | The client | Impossible: `decide()` is in the same transaction (BR-M7) |
| Notification enqueue fails | Nobody — it cannot | It is inside the issuing transaction, so it either commits with the letter or the letter does not exist. The **send** is the outbox drain's problem and is retried there (**EC-41**) |

### 16.3 What is deliberately not idempotent

* **`#142` reissue** — unchanged from Phase 2: a deliberate second copy needs a distinct key.
* **`#150` reject** — terminal and conditional; a second reject is a `409`, not a no-op.
* **`#147` drain** — running it twice drains twice. That is its purpose.

### 16.4 Reference-number burn (F-9 only)

With `prints_reference: true`, the number is allocated in a short transaction **before** the render.
Burned when: the render fails; the S3 write fails; the `onReady` transaction rolls back. Not burned
when: the idempotency probe short-circuits (no allocation happens at all). Every burn is logged at
`warn` with `{ org_id, template_code, financial_year, reference_number, failure_code }` so a gap in
an auditor's sequence has a matching log line. **D-20** already declares gaps acceptable; F-9 makes
them observable.

---

## 17. Timeout & Resource Management

| Concern | Control | Value |
|---|---|---|
| Renderer call | Inherited from P1 | 20 s client timeout, 2 attempts, 500 ms + jitter |
| Worker concurrency | Inherited from P3 | `PDF_WORKER_CONCURRENCY`, default 4, hard-capped at 4 |
| Jobs claimed per drain | Inherited from P3 | `PDF_WORKER_LIMIT`, default 50 |
| Stale claim reclaim | Inherited from P3 | `PDF_WORKER_STALE_MS`, default 10 min |
| Batch size | **New** | `letter_bulk_max_subjects` (#91, default 500), DB CHECK ≤ 2000 |
| Auto-issue per org per run | **New** | `AUTO_ISSUE_BATCH = 50` exits |
| Branding asset reuse | **New** (C-11) | `BRANDING_ASSET_REUSE_MS = 180_000` against the 300 s presign TTL |
| `#143` cohort validation wall time | **New** | See **[R-6]** below; do **not** move validation to the background — EC-37 requires it to be synchronous |
| **[R-6] Connection-pool safety** | **New, and the real constraint** | `configs/default.json` sets `poolMax: 10` and `poolAcquire: 20000` **for the whole process**. `factsService.resolve` is 6–11 queries per subject and `_loadIdentity` fires **four in parallel**, so a naive per-subject loop over 500 subjects is ~4,000 round trips holding up to four pooled connections. Two concurrent `#143` calls, or one alongside a drain at concurrency 4, can starve the pool and time out **unrelated** payroll, attendance and auth requests. Mitigations, all required: (a) `factsService.resolveMany(orgId, ids, { needs, required })` batch-loads each source with `WHERE user_id IN (…)` chunked at 200, cutting validation to ~8 queries per chunk; (b) validation stays **serial** within a request — never a `Promise.all` over subjects; (c) `#91` defaults to 200 until a real p95 is measured. `resolveMany` is for validation only: `renderItem` handles one subject and must keep using `resolve` |
| `#144` failure list | **New** | `limit ≤ 100`, offset-paginated |
| Memory | | A batch never holds more than one rendered PDF per concurrent worker (≤ 4 × ~5 MB). Items and jobs are written set-based, never accumulated as model instances beyond the insert |

**Temporary files: none.** Phase 4 writes no temp file, spawns no process and opens no stream. The
renderer is a remote HTTP call; the PDF exists as one `Buffer` that is written to S3 and released.
The rendering-engine (Chromium) lifecycle is the Lambda's, outside this process — Phase 4 changes
nothing about it. The only lifecycle Phase 4 owns is the job claim, and it is bounded by the stale
window.

---

## 18. Error & Failure Handling

### 18.1 New error codes

| Code | Status | Meaning |
|---|---|---|
| `LETTER_BULK_TOO_MANY_SUBJECTS` | 422 | Over `letter_bulk_max_subjects` |
| `LETTER_BULK_DUPLICATE_SUBJECT` | 422 | The same subject appears twice |
| `LETTER_BULK_VALIDATION_FAILED` | 422 | One or more subjects failed cohort validation; `details.failures` carries the list |
| `LETTER_PROPOSALS_DISABLED` | 403 | `manager_can_propose_letters` is off |
| `LETTER_PROPOSAL_EXISTS` | 409 | An open proposal already exists for this `(template, subject)` |
| `LETTER_PROPOSAL_NOT_PENDING` | 409 | Already approved, rejected or cancelled |
| `PROPOSAL_SCOPE_STALE` | 409 | The proposer no longer manages the subject (EC-40) |

Reused unchanged: `LETTER_TEMPLATE_DISABLED`, `LETTER_TEMPLATE_UNKNOWN`,
`DOCUMENT_TYPE_NOT_ACTIVATED`, `DOCUMENT_TYPE_INACTIVE`, `DOCUMENT_TYPE_PLANE_MISMATCH`,
`LETTER_FIELD_UNKNOWN`, `LETTER_FIELD_NOT_OVERRIDABLE`, `LETTER_FACTS_MISSING`,
`PDF_DATA_INCOMPLETE`, `PDF_TEMPLATE_INVALID`, `PDF_RENDER_TIMEOUT`, `PDF_RENDERER_UNAVAILABLE`,
`PDF_RENDERER_NOT_CONFIGURED`, `STORAGE_UNAVAILABLE`, `DOCUMENT_NOT_FOUND`,
`SELF_APPROVAL_NOT_ALLOWED`, `SETTING_OUT_OF_RANGE`.

### 18.2 Failure matrix

| Failure | Client sees | State left behind | Recovery |
|---|---|---|---|
| Cohort validation fails | `422` + full list | **Nothing** | HR fixes the data and re-POSTs |
| Batch transaction fails | `500`/`503` | Nothing committed | Re-POST converges on the derived key |
| Renderer down when `#143` is called | `202` — the batch is queued regardless | Batch + items + jobs | The drain retries until the renderer returns |
| Renderer down during the drain | — (async) | Items `pending`, jobs backing off, pending artifacts swept | Automatic |
| Renderer down during `#149` approve | `503` | Proposal still `pending`, no letter | HR retries; the fixed key means one letter eventually |
| Renderer returns 400 for one subject | — (async) | That item `failed`, alertable | A human fixes the template or the data; other subjects are unaffected |
| S3 down during the drain | — (async) | Item `pending`, artifact `pending` → swept to `failed` + object deleted | Automatic on the next attempt |
| A subject is deleted mid-batch | — (async) | Item `skipped`, reason recorded | None needed |
| The document type is deactivated mid-batch | — (async) | Remaining items `skipped` with `DOCUMENT_TYPE_INACTIVE` | HR reactivates and re-POSTs the batch; only the skipped subjects run |
| Notification send fails | Nothing | Outbox row `failed`, retried by the dispatcher | Automatic (**EC-41**) — the letter is never rolled back or hidden |
| `document_automation` throws for one org | Nothing (cron) | Other orgs unaffected; error logged | Next tick |
| Enum ALTER applied, table creation rolled back | Operator sees the migration error | The `letter_issued` label exists, nothing else | Re-run `up()`; it is idempotent (§6.5) |

### 18.3 Never done on failure

* Never mark an item `issued` without a letter id, an artifact id and a reference number.
* Never mark a proposal `approved` outside the letter's transaction.
* Never roll back an issued letter because a sibling in the batch failed.
* Never delete a `failed` item or job row — they are the evidence `#144` reports.
* Never retry a deterministic render failure.
* Never let a notification failure touch business state.

---

## 19. Background Jobs, Events & Integrations

### 19.1 Cron changes — two files, two added calls, no new cron

| File | Change | Ordering |
|---|---|---|
| `src/cron-jobs/pdf_render_worker.cron.js` | After `payrollAutomationService.runPayslipRender({})`, call `documentAutomationService.runLetterRender({})`. Both inside the same `try`, each with its own inner `try` so a payroll failure never suppresses the letter drain | Payroll first (existing behaviour preserved), letters second |
| `src/cron-jobs/document_offboarding_archiver.cron.js` | After `runOffboardingArchive({})`, call `runLetterAutoIssue({})` | **Strictly after** — §14.2 rule 3. This ordering is a correctness property, not a preference, and carries an explaining comment |

Neither cron may rethrow (a throwing cron takes the process down — the existing rule). Both keep the
`os.platform()` guard and the IST timezone. The ≥15-minute interval on the render worker is
unchanged; letters inherit it, which means a bulk batch begins draining within 15 minutes or
immediately via `#147`.

### 19.2 Events and notifications

The only new event is `letter_issued` (§9.5), enqueued inside the issuing transaction for **every**
issuance path — `#139`, `#142`, bulk, auto-issue and approval — because it lives inside
`_writeLetterRow`'s transaction, not in any one caller. Consequences, stated:

* A 200-letter batch enqueues 200 outbox rows. The existing dispatcher claims
  `NOTIFICATION_DISPATCH_BATCH` at a time with its own retry and stale handling; no new throttle is
  added, and none is needed — the outbox is exactly the mechanism that keeps a burst off the mail
  path's critical section.
* The toggle (#94) defaults `false`, so no org sends anything until it opts in. An org that enables
  it **and** runs a large batch will email that many people; the settings registry entry says so.
* Auto-issued letters notify the leaver. That is correct — the whole point is that they receive
  their relieving letter — but two verified constraints apply. `archiveForUser` step 5 calls
  `notificationRepo.skipPendingForUser` for an offboarded user, which is precisely why §14.2 rule 3
  orders auto-issue **after** the archive; and `_resolveRecipients` requires `u.status = 'active'`,
  so a leaver deactivated on the last working day resolves to no address and the row is recorded
  `skipped` / `recipient_inactive`. Neither is a failure, and neither touches the letter.

### 19.3 Downstream consumers that pick Phase 4 letters up with no change

| Consumer | Why it just works |
|---|---|
| `document_org_read.service.{listForEmployee, detailForEmployee, viewUrl}` | A bulk/auto/approved letter is an ordinary published `org_document` with one materialised recipient |
| `document_acknowledgement.service` | Enters the flow automatically when the type requires acknowledgement |
| `document_composer.service`, `document_report.service`, `document_compliance.service` | Read `org_documents`; `origin` is irrelevant to them |
| `document_audit.service.findByEntity` | Serves `document_letter_batch` and `document_letter_proposal` like any other entity type (both columns are `STRING(50)`) |
| `document_offboarding.exitPack` | Includes the issued letters in the leaver's pack |
| `pdf_artifact_sweeper` / `runArtifactVerification` | Sweep and verify Phase 4 artifacts identically — they are `record`-class `letter` artifacts with nothing special about them |

### 19.4 The one integration that must be re-verified, not assumed

`document_automation.runArtifactVerification` walks `ready` **record**-class artifacts keyset-
paginated by id and reports missing objects. Phase 4 multiplies record-class artifacts by whatever
factor bulk issuance is used at. Before release, confirm the pass's `limit` still completes inside
its window at the expected volume, and raise the limit if not. This is a configuration check, not a
code change, and it belongs in the completion report's evidence.

---

## 20. Audit, Logging & Observability

### 20.1 Audit rows — all inside the transaction that causes them

| Action | `entity_type` / `entity_id` | Written by | Payload |
|---|---|---|---|
| `letter_batch.created` | `document_letter_batch` / batch id | `#143` | `template_code`, `template_version`, `total_count`, `idempotency_key` (the key, not its inputs) |
| `letter_batch.completed` | `document_letter_batch` / batch id | `rollUpStatus`, on the transition to a terminal status | `issued`, `failed`, `skipped` counts |
| `letter_proposal.created` | `document_letter_proposal` / proposal id | `#145` | `template_code`, `subject_user_id` |
| `letter_proposal.approved` | `document_letter_proposal` / proposal id | `#149`, inside `onReady` | `letter_id`, `reference_number`, and **[R-18]** when the approval supplied its own `field_overrides`, `overrides_replaced: true` plus the **key names** — never the values, which are free text bound for a legal document and do not belong in an audit row |
| `letter_proposal.rejected` | `document_letter_proposal` / proposal id | `#150` | `decision_note` |
| `letter_proposal.stale_scope_overridden` | `document_letter_proposal` / proposal id | `#149` when acknowledged | `proposed_by` |
| `letter.generated` / `letter.issued` | **unchanged** | `_writeLetterRow` | unchanged; auto-issue adds `reason: 'auto_issue_on_exit'` and a null actor |

**Never in an audit row:** a storage key, an `input_snapshot`, a `branding_snapshot`, rendered HTML,
a presigned URL, the renderer URL, the API key, or the full subject-id list of a large batch (the
counts suffice; the ids are in the item ledger).

### 20.2 Structured log lines

| Line | When | Fields |
|---|---|---|
| `pdf.letter.batch_created` | `#143` | `org_id`, `batch_id`, `template_code`, `template_version`, `total`, `reused` |
| `pdf.letter.batch_validation_failed` | `#143` 422 | `org_id`, `template_code`, `total`, `failure_count` — **not** the subject ids |
| `pdf.letter.item_issued` | per item | `org_id`, `batch_id`, `item_id`, `artifact_id`, `render_ms`, `size_bytes` |
| `pdf.letter.item_failed` | per item | `org_id`, `batch_id`, `item_id`, `failure_code`, `attempts` |
| `pdf.letter.item_skipped` | per item | `org_id`, `batch_id`, `item_id`, `failure_code` |
| `pdf.letter.batch_rolled_up` | per drain | `org_id`, `batch_id`, `status`, counts |
| `pdf.letter.ledger_divergence` | when `#144`'s item counts and queue counts disagree | `org_id`, `batch_id`, both count objects — a standing signal that something wrote outside the designed path |
| `letter.auto_issue.summary` | per sweep | `orgs_scanned`, `exits_scanned`, `issued`, `skipped`, `errors` |
| `letter.auto_issue.subject_unresolvable` / `.template_unavailable` / `.exit_source_unavailable` | per skip | `org_id`, `exit_id`, `template_code` |
| `pdf.letter.reference_burned` | F-9 only | `org_id`, `template_code`, `financial_year`, `reference_number`, `failure_code` |

**Never in a log line:** `data`, HTML, a storage key, a presigned URL, the API key. The existing
`renderer_secret_hygiene.test.js` is extended to cover the new service files.

### 20.3 The questions an operator must be able to answer without reading logs

1. *Is a batch progressing?* → `#144`: `counts.pending` falling, `status` moving `queued → running`.
2. *Why did these three subjects fail?* → `#144`'s `failures[]`, each with a stable code.
3. *Is the letter queue backing up?* → `#147`'s `remaining`.
4. *Is auto-issue doing anything?* → the daily `letter.auto_issue.summary` line, which is emitted
   even when the counts are zero **only if** the org has a non-empty config — silence for an
   unconfigured org is correct, silence for a configured one is a signal.

---

## 21. Org Settings — `#91` … `#94`

Register each in `public/md_settings/org_settings_registry.md` under the existing `## Document
Module` section, continuing its numbering and using its exact field structure (Configuration Level,
Data Type, Default Value, Enforcement Point, Deep Explanation, Applicable (ON), Not-Applicable
(OFF), Range where numeric).

| # | Key | Store | Type | Default | Enforcement point |
|:--:|---|---|---|---|---|
| 91 | `letter_bulk_max_subjects` | `document_settings` | Integer `1..2000` | **`200`** (**[R-6]**; was 500) | `document_letter_batch.service.create` (`422 LETTER_BULK_TOO_MANY_SUBJECTS`); `SETTINGS_CAPS`; DB CHECK |
| 92 | `letter_auto_issue_on_exit` | `document_settings` | Array of template codes, ≤ 5, distinct | `[]` | `document_automation.runLetterAutoIssue`; membership validated in `document_settings.service` against the registry + BR-A2 |
| 93 | `manager_can_propose_letters` | `document_settings` | Boolean | `false` | `document_letter_proposal.service.propose` (`403 LETTER_PROPOSALS_DISABLED`) |
| 94 | `document_notify_letter_issued` | `document_settings` | Boolean | `false` | `document_notification.service.enqueue` via `EVENT_SETTING_TOGGLE` |

Main plan §13 names the first three with these exact defaults. `#94` is the notification toggle
**C-8** shows the outbox requires; it is a consequence of the main plan's own "notify through the
existing outbox" requirement, not a new feature.

All four are added to `MUTABLE_FIELDS` and exposed by the existing `GET`/`PUT
/api/v1/documents/hr/settings`, which is why §10.4's change record must list them.

---

## 22. Feature Chains

Each chain states **Requirement → Existing Dependency → Database → API → Business Logic →
Validation → Authorization → PDF Generation → Storage → Failure → Testing → Acceptance**. Where an
item does not apply it says so and why.

### F-0 — Blocking correctness fixes (C-9, C-10)

* **Requirement.** Bulk, auto-issue and approval all depend on a stable idempotency key and on the
  letter queue not being claimed by payroll.
* **Existing dependency.** `document_letter.service._computeIdempotencyKey`,
  `branding.builder.resolveBranding`, `pdf_render_job.repository.claimBatch`,
  `pdf_render_worker.service.drain`, `payroll_automation.runPayslipRender`.
* **Database.** *Not applicable* — both fixes are code-only.
* **API.** *Not applicable* — no contract changes. `#139`'s observable behaviour becomes **more**
  correct (a double-click now returns the same letter for large-logo orgs).
* **Business logic.** `stableBrandingIdentity()` replaces asset srcs with hashed storage keys;
  `claimBatch` gains `AND source_type IN (:sourceTypes)`; `drain` passes it through;
  `runPayslipRender` passes `['payslip']`.
* **Validation.** *Not applicable.*
* **Authorization.** *Not applicable.*
* **PDF generation.** Unchanged — the rendered branding still carries the live asset src; only the
  *hashed identity* changes.
* **Storage.** *Not applicable.*
* **Failure.** A missing storage key hashes the empty string, which is stable and distinct from any
  real key.
* **Testing.** T-C9a two mints of a >64 KB-asset branding → one key. T-C9b replacing the logo
  changes the key. T-C9c a data-URI org's key is unchanged from today (no regression).
  T-C10a `claimBatch` with `sourceTypes: ['payslip']` never returns a letter job and vice versa.
  T-C10b `runPayslipRender` passes the filter.
* **Acceptance.** `#139` issued twice in a row for a large-logo org produces **one** letter; the
  payroll drain leaves letter jobs untouched.

### F-1 — Migration `00058` and settings `#91`–`#94`

* **Requirement.** Storage for batches, items and proposals; four org knobs.
* **Existing dependency.** `00055`–`00057`'s migration idiom; `document_settings.service`.
* **Database.** §6.1–§6.5.
* **API.** The four keys appear on `GET`/`PUT /documents/hr/settings`.
* **Business logic.** `letter_auto_issue_on_exit` membership validation (BR-A2).
* **Validation.** `SETTINGS_CAPS` for `#91`; bespoke array validator for `#92`; DB CHECKs as a floor.
* **Authorization.** `hr` only, unchanged.
* **PDF generation / Storage.** *Not applicable.*
* **Failure.** §6.5's non-atomic enum step and its idempotent re-run.
* **Testing.** A `migration_00058.test.js` in the shape of `migration_0005{5,6,7}.test.js`: every
  table, column, index, CHECK and enum label present in `up()`, every one reversed in `down()`
  except the enum label, and the enum ALTER outside the transaction.
* **Acceptance.** Migration and seeder hand back unrun with a note; settings round-trip through
  `PUT`/`GET`; every existing settings test passes unchanged.

### F-2 — The issuance-context split and `issue`'s two optional parameters

* **Requirement.** One issuance implementation, reusable per-subject without per-subject org reads.
* **Existing dependency.** `document_letter.service._resolveIssuanceContext`.
* **Database / API.** *Not applicable* — internal.
* **Business logic.** §9.1 changes 1 and 2, plus the `onIssued` hook (§14.3).
* **Validation / Authorization / Storage.** *Not applicable* — unchanged.
* **PDF generation.** Unchanged.
* **Failure.** *Not applicable.*
* **Testing.** T-F2a the composed context is deep-equal to a golden fixture of the pre-split result.
  T-F2b `issue` with an explicit `documentId` writes the letter under that id. T-F2c `onIssued` runs
  inside the same transaction and its throw rolls the letter back.
* **Acceptance.** Every `tests/unit/pdf/letter_issue_service.test.js` and `letter_reissue.test.js`
  test passes **unmodified**.

### F-3 — Bulk issuance (`#143`, `#144`)

* **Requirement.** Main plan requirement 12, §8.4.
* **Existing dependency.** F-2; `pdf_render_job.repository.enqueueMany`; `document_audit.service`.
* **Database.** `document_letter_batches`, `document_letter_batch_items`.
* **API.** `#143`, `#144` (§10.2).
* **Business logic.** §14.1; BR-B1…BR-B12.
* **Validation.** Joi shape + cohort validation; `#91` cap.
* **Authorization.** `hr`; uniform 404 on a cross-org batch id.
* **PDF generation.** None at request time — `#143` never renders. Rendering is the drain's.
* **Storage.** None at request time.
* **Failure.** §18.2 rows 1–3, 8, 9.
* **Testing.** §24 T-B1…T-B12.
* **Acceptance.** 200 confirmation letters from one action; every one identical to what `#139`
  produces for the same subject; failures visible per subject; a re-POST issues nothing new.

### F-4 — Letter render callback and the document-plane drain (`#147`)

* **Requirement.** Consume the queue; the `#147` Phase 3 deferred.
* **Existing dependency.** F-0 (C-10), `pdf_render_worker.service.drain`,
  `document_automation._forEachOrg`.
* **Database.** *Not applicable* — reads and conditional updates only.
* **API.** `#147`.
* **Business logic.** §14.1 drain block; `renderItem`'s three-way failure classification;
  `rollUpStatus`.
* **Validation.** `limit ≤ 200` on `#147`.
* **Authorization.** `hr`, caller's org only.
* **PDF generation.** One render per item through the unchanged pipeline.
* **Storage.** One `putObject` per item through the unchanged pipeline.
* **Failure.** §18.2 rows 4–7; the two-transaction convergence of §14.1.
* **Testing.** §24 T-B6…T-B11, T-C10a/b.
* **Acceptance.** A queued batch drains to completion on the cron with no manual step; `#147`
  drains on demand and reports `remaining`.

### F-5 — Auto-issue on exit

* **Requirement.** Main plan requirement 13.
* **Existing dependency.** F-2; `employee_exit.repository.findLiveForOrg` (lazy-required);
  `document_offboarding.archiveForUser` (ordering only); `document_automation._forEachOrg`.
* **Database.** *Not applicable* — **no new table**. Idempotency is the explicit key (BR-A4), which
  is the point of **D-11** being structural.
* **API.** *Not applicable* — no endpoint. Deliberate: an HR-triggered auto-issue is
  indistinguishable from `#139` and would only add a way to get it wrong.
* **Business logic.** §14.2; BR-A1…BR-A8.
* **Validation.** `letter_auto_issue_on_exit` membership (BR-A2).
* **Authorization.** *Not applicable* — cron-originated and org-scoped by `_forEachOrg`. **[R-2]**
  The row's `created_by` is `exit.recorded_by` (the column is NOT NULL); the *audit* row carries
  `actor_id: null` plus `reason: 'auto_issue_on_exit'`.
* **PDF generation.** Through the unchanged pipeline.
* **Storage.** Unchanged.
* **Failure.** Every failure is a logged skip; the sweep never throws and never partially writes.
* **Testing.** §24 T-A1…T-A8.
* **Acceptance.** An employee exit produces a relieving letter exactly once, however many times the
  sweep runs; an org with `[]` configured is untouched.

### F-6 — Manager maker–checker (`#145`, `#146`, `#148`, `#149`, `#150`)

* **Requirement.** Main plan requirement 14; DV-1.
* **Existing dependency.** F-2 (`onIssued`); `hierarchy_access.getAccessibleUserIds`;
  `document_require_separate_checker` (#60); `document_review.service`'s stale-scope precedent.
* **Database.** `document_letter_proposals`.
* **API.** Five endpoints (§10.2).
* **Business logic.** §14.3; BR-M1…BR-M9.
* **Validation.** Template/type/override validation reused from the issue path.
* **Authorization.** §12.1–§12.3; scope at propose **and** at approve.
* **PDF generation.** Only at approval, through the unchanged pipeline. A proposal renders nothing.
* **Storage.** Only at approval.
* **Failure.** §18.2 row 5; the conditional `decide()` making BR-M7 atomic.
* **Testing.** §24 T-M1…T-M10.
* **Acceptance.** A manager proposes; HR sees it, approves, and a letter is issued with the proposal
  closed in the same transaction; a proposal whose subject left the proposer's team is blocked at
  approval.

### F-7 — `letter_issued` notification

* **Requirement.** Main plan requirement: "Notification of an issued letter through the existing
  document notification outbox (queue-and-drain, outside the transaction)."
* **Existing dependency.** `document_notification.service`, its repository, dispatcher and cron.
* **Database.** One enum label (§6.5) and one settings column (#94).
* **API.** *Not applicable* — no endpoint; the toggle rides the existing settings endpoints.
* **Business logic.** §9.5; enqueued inside `_writeLetterRow`'s transaction; **sent** by the existing
  dispatcher, which is the "outside the transaction" the main plan means.
* **Validation.** *Not applicable.*
* **Authorization.** Recipient is the letter's subject; no other party is notified.
* **PDF generation.** *Not applicable.*
* **Storage.** *Not applicable* — deep link only, never an attachment, never a presigned URL in an
  email.
* **Failure.** **EC-41**: a send failure is retried by the dispatcher and never rolls back or hides
  the letter.
* **Testing.** §24 T-N1…T-N4.
* **Acceptance.** With `#94` on, issuing a letter enqueues exactly one outbox row for the subject;
  with it off, zero; a forced send failure leaves the letter published.

### F-8 — Four templates and seeder `011`

* **Requirement.** Main plan §11 P4 template list.
* **Existing dependency.** `registry.js`, `_partials/`, the lint helper, the golden-fixture harness.
* **Database.** *Not applicable* — templates are repo assets (**D-2**). Two catalog rows via seeder
  `011`.
* **API.** `#135`/`#136` return four more entries; no contract change.
* **Business logic.** *Not applicable* — no new fact source, no new derived field (§8.1).
* **Validation.** Joi `saved_field_schema` per entry; lint rules 1–8 unchanged.
* **Authorization.** *Not applicable.*
* **PDF generation.** Four new render paths through the unchanged pipeline.
* **Storage.** *Not applicable.*
* **Failure.** A template whose type is not activated in an org fails with
  `409 DOCUMENT_TYPE_NOT_ACTIVATED` at issue — actionable, per **D-17**.
* **Testing.** Lint over all files; golden fixtures per template; hostile-input fixtures for
  `warning_letter`'s narrative fields; the registry↔catalog consistency test extended to `011`.
* **Acceptance.** All four preview correctly with **and** without optional data, with no logo and no
  signature; `salary_certificate` refuses a subject with no salary structure.

### F-9 — The printed reference number (OD-P2-1, DV-8)

* **Requirement.** Phase 2 §34.2 OD-P2-1, assigned to Phase 4.
* **Existing dependency.** `document_letter_sequence.repository.allocate`,
  `letter_reference.utils.renderPattern`, `pinned_version` (EC-15).
* **Database.** *Not applicable* — no schema change. The number already has a column
  (`org_documents.reference_number`, Phase 2 DV-1).
* **API.** *Not applicable* — no response field changes. The change is on the page.
* **Business logic.** `prints_reference` on the registry entry; allocation moves to a short
  pre-render transaction for those versions only; `reference_number` enters the view model as a
  **service field**; BR-R1…BR-R5.
* **Validation.** `reference_number` rejected in `field_overrides` (BR-R2); lint rule 5 proves the
  placeholder is declared and used.
* **Authorization.** *Not applicable.*
* **PDF generation.** `v2` of nine templates; `v1` kept forever.
* **Storage.** *Not applicable.*
* **Failure.** A burned number on render failure, logged (§16.4). Gaps accepted (**D-20**).
* **Testing.** T-R1 the key is unchanged by the number (BR-R3). T-R2 a `v1`-pinned org renders no
  number. T-R3 a render failure after allocation logs the burn and issues nothing. T-R4 the number
  on the page equals the number on the row.
* **Acceptance.** A letter issued from a `v2` template prints its `Ref. No.`; an org pinned to `v1`
  is byte-for-byte unaffected.

**F-9 is severable.** It touches no table, no endpoint and no other feature. If the phase runs long,
it is the item to drop, and dropping it leaves Phase 4 complete against the main plan's own §11 P4
scope (which does not list it).

---

## 23. Implementation Sequence

Dependency-ordered. Each step ends with a verifiable check; do not start the next until it passes.

| # | Step | Verify |
|:--:|---|---|
| 0 | **Review Phase B** — fold the schema corrections (`pinned_date` NOT NULL, `branding_snapshot` read path) into the `00058` design **before** the migration is authored, so it is written once | §6 reflects **[R-10]**, **[R-13]** |
| 1 | **F-0(a)** `stableBrandingIdentity` + `_computeIdempotencyKey`, including the `keyBase` salt path (**[R-1]**) and the redacted `inputSnapshot` (**[R-11]**) | T-C9a/b/c, T-R1-a/b/c, T-R11-a green; every existing `letter_issue_service` / `letter_reissue` test green |
| 2 | **F-0(b)** `claimBatch` + `drain` `sourceTypes`; `runPayslipRender` passes `['payslip']` (C-10); **plus** `sourceTypes` on `findStalePendingForSweep` / `pdfArtifactSweeperService.run` (**[R-7]**) and the `reference_token` uniqueness assertion (**[R-12]**) | T-C10a/b, T-R7-b, T-R12-a/b green; **every** `tests/unit/payroll/**` and `tests/unit/pdf/**` test green unchanged |
| 3 | **F-1** Migration `00058` + seeder `011` (authored, not run) | `migration_00058.test.js` green; seeder shape test green |
| 4 | **F-1** Models + the three repositories | Repository contract tests green |
| 5 | **F-1** Settings `#91`–`#94` in `MUTABLE_FIELDS`, caps, the `#92` validator | Settings tests green, including BR-A2's refusal of a compensation-bearing template |
| 6 | **F-2** Context split + `documentId` / `orgContext` / `onIssued` | T-F2a/b/c green; the pre-split golden fixture matches |
| 7 | **F-8** Four templates + registry entries + `011` catalog consistency | Lint green over every file; golden and hostile fixtures green; `#136` returns each |
| 8 | **F-3** Batch service + `#143` + `#144` + routes + validators, with `resolveMany` (**[R-6]**), the ledger-authoritative enqueue (**[R-5]**) and the frozen-branding read path (**[R-10]**) | T-B1…T-B5, T-B12, T-R5-a/b, T-R6-a/b, T-R10-a/b green; the router-order test green |
| 9 | **F-4** `renderItem` + `runLetterRender` + `#147` + the cron call, with the skip/cancel pairing (**[R-3]**), the leading scoped sweep and `max_attempts: 5` (**[R-7]**) and the unconditional roll-up sweep (**[R-8]**) | T-B6…T-B11, T-R3-a/b, T-R7-a, T-R8-a green; an end-to-end in-process batch drains with a stubbed renderer |
| 10 | **F-7** `letter_issued` event, toggle, message branch, enqueue site, **plus the three prerequisites [R-9]**: `dedupeKey`, `PAYLOAD_WHITELIST` entry, `CTA_PATH_BY_ENTITY` entry | T-N1…T-N4, T-R9-a/b/c green; the five existing notification events unchanged |
| 11 | **F-6** Proposal table wiring, service, five endpoints, manager router; unlocked approval probe (**[R-15]**) and the override audit (**[R-18]**) | T-M1…T-M10 green |
| 12 | **F-5** `runLetterAutoIssue` + the offboarding cron call, with the attribution actor (**[R-2]**) and the windowed, ordered, bounded exit finder (**[R-4]**) | T-A1…T-A8, T-R2-a/b, T-R4-a/b/c green; the ordering test green |
| 13 | **F-9** `prints_reference`, early allocation, nine `v2` templates | T-R1…T-R4 green; lint green over the `v2` set |
| 14 | Registries, the `md_updates` change record, the completion report | §31 complete; full suite at the §0.2 baseline plus the new tests |

Steps 1 and 2 come first because every later step's correctness rests on them, and because they are
the two changes that touch already-shipped behaviour — landing them early maximises the time they
spend under the rest of the phase's tests.

---

## 24. Testing Requirements

**Runner.** `node --test`; `npm test` over `tests/unit/**/*.test.js`. **DB-free.** The renderer is
**always** stubbed by injecting `fetch`; **no test in `tests/unit/**` may make a real HTTP call or
open a real database connection.** Set `PostGre_DATABASE_URL` to a dummy value so the models module
loads (§0.2).

### 24.1 New test files

| File | Covers |
|---|---|
| `tests/unit/pdf/letter_idempotency_stability.test.js` | T-C9a/b/c |
| `tests/unit/pdf/render_queue_scoping.test.js` | T-C10a/b |
| `tests/unit/pdf/migration_00058.test.js` | F-1 schema, in the shape of `migration_00057.test.js` |
| `tests/unit/pdf/letter_batch_service.test.js` | T-B1…T-B5, T-B12 |
| `tests/unit/pdf/letter_batch_worker.test.js` | T-B6…T-B11 |
| `tests/unit/pdf/letter_auto_issue.test.js` | T-A1…T-A8 |
| `tests/unit/pdf/letter_proposal_service.test.js` | T-M1…T-M10 |
| `tests/unit/pdf/letter_notification.test.js` | T-N1…T-N4 |
| `tests/unit/pdf/letter_reference_printing.test.js` | T-R1…T-R4 |
| `tests/unit/pdf/phase4_invariants.test.js` | Grep/architecture assertions (§24.4) |
| `tests/unit/document/letter_batch_routes.test.js` | Route order, role gates, feature gate |
| `tests/unit/pdf/phase4_review_findings.test.js` | **T-R1…T-R13** — the review's regression tests: salted `keyBase` recovery, auto-issue attribution, skip/cancel pairing, windowed exit finder, ledger-authoritative enqueue, `resolveMany` query bound, stale-pending recovery, roll-up sweep, notification prerequisites, frozen branding, redacted snapshot, token uniqueness, frozen pinned date |

Extended, not replaced: `template_lint.test.js` (four new templates + nine `v2`),
`letter_registry_catalog.test.js` (seeder `011`), `builders.test.js` (four new golden fixtures),
`letter_security.test.js` (hostile input into `warning_letter`'s narrative fields),
`renderer_secret_hygiene.test.js` (the new service files).

### 24.2 The assertions that matter most

**Bulk**

| ID | Assertion |
|---|---|
| T-B1 | A cohort with one invalid subject is rejected `422` with **every** failure listed, and **zero** batch, item, job or artifact rows are written (**EC-37**) |
| T-B2 | Over `letter_bulk_max_subjects` ⇒ `422 LETTER_BULK_TOO_MANY_SUBJECTS`, nothing written |
| T-B3 | A duplicate subject id ⇒ `422 LETTER_BULK_DUPLICATE_SUBJECT` |
| T-B4 | A valid cohort writes exactly one batch, N items and N jobs in **one** transaction, and renders **nothing** |
| T-B5 | Re-POSTing the identical cohort returns the same `batch_id`, `reused: true`, and inserts zero new items |
| T-B6 | `renderItem` calls `letterService.issue` with `idempotency_key = 'batch:{b}:{s}'` and `documentId = item.document_id` |
| T-B7 | **The letter a batch produces is identical to the letter `#139` produces for the same subject** — same view model, same template version, same pinned date, same frozen flags. Asserted by deep-equal on the view model handed to the renderer stub |
| T-B8 | A transient renderer failure leaves the item `pending` and the job re-queued with backoff; a deterministic failure marks the item `failed` without burning attempts |
| T-B9 | A subject deleted between validation and render marks the item `skipped`, not `failed` |
| T-B10 | A crash between the letter commit and `markIssued` converges: the next `renderItem` gets `reused: true` and marks the item `issued`, producing **one** letter |
| T-B11 | `rollUpStatus` moves `queued → running → completed` / `completed_with_failures` and never moves a terminal batch |
| T-B12 | `#144` reports the item ledger as `counts` and the queue as `queue`, and logs `ledger_divergence` when they disagree |

**Auto-issue**

| ID | Assertion |
|---|---|
| T-A1 | `letter_auto_issue_on_exit = []` ⇒ the sweep performs zero reads beyond settings |
| T-A2 | A due, non-cancelled exit issues each configured template exactly once |
| T-A3 | Running the sweep three times issues **one** letter per `(exit, template)` (**EC-39**) |
| T-A4 | A `cancelled` exit is never swept |
| T-A5 | An exit whose `last_working_day` is in the future is never swept |
| T-A6 | A subject the facts resolver 404s is logged `subject_unresolvable` and does not abort the org's remaining exits |
| T-A7 | A renderer 503 leaves nothing written and the next sweep retries |
| T-A8 | The cron calls `runOffboardingArchive` **before** `runLetterAutoIssue` (asserted on call order with both stubbed) |

**Maker–checker**

| ID | Assertion |
|---|---|
| T-M1 | `manager_can_propose_letters = false` ⇒ `403 LETTER_PROPOSALS_DISABLED` |
| T-M2 | A manager proposing for a non-report ⇒ `403 FORBIDDEN`, scope checked before existence |
| T-M3 | A second open proposal for the same `(template, subject)` ⇒ `409 LETTER_PROPOSAL_EXISTS` |
| T-M4 | A proposal id from another org ⇒ `404 DOCUMENT_NOT_FOUND`, byte-identical to a missing id |
| T-M5 | Approval issues through `letterService.issue` with `idempotency_key = 'proposal:{id}'` |
| T-M6 | **A proposal whose subject has left the proposer's team is blocked at approval** with `409 PROPOSAL_SCOPE_STALE` (**EC-40**); `acknowledge_stale_scope: true` proceeds and writes the override audit row |
| T-M7 | `document_require_separate_checker = true` and approver = proposer ⇒ `409 SELF_APPROVAL_NOT_ALLOWED` |
| T-M8 | Two concurrent approvals: one letter, one `409 LETTER_PROPOSAL_NOT_PENDING`; the loser's letter transaction rolls back (simulated at the repository contract level, as Phase 2 does) |
| T-M9 | A `decide()` that changes 0 rows throws and rolls the letter back — no approved proposal without a letter, no letter with a pending proposal (**BR-M7**) |
| T-M10 | Rejecting requires a reason and is terminal |

**Notification**

| ID | Assertion |
|---|---|
| T-N1 | `#94` off ⇒ `enqueue` returns `{ enqueued: false, reason: 'disabled' }` and writes no row |
| T-N2 | `#94` on ⇒ exactly one row per issued letter, `recipient_user_id` = the subject, `event_type = 'letter_issued'` |
| T-N3 | The row is written **inside** the issuing transaction — a rolled-back issue leaves no outbox row |
| T-N4 | A forced send failure marks the row `failed` and leaves the letter published (**EC-41**) |

### 24.3 Tests that must pass **unmodified**

The whole of `tests/unit/pdf/` (42 files) and `tests/unit/document/` as they stand, plus every
payroll test. Any diff to an existing test file other than the five named as *extended* in §24.1 is
a design error, not a test fix — with one exception, stated so it is not discovered in review:
**`letter_issue_service.test.js` T-28** asserts the derived key changes with branding. C-9 keeps
that true (content still feeds the hash), so the test should pass unchanged; if it does not, the
`stableBrandingIdentity` projection is wrong and the **fix belongs in the projection**, not in the
test.

### 24.4 Grep / architecture assertions (`phase4_invariants.test.js`)

1. No file under `src/common/` requires anything from `src/modules/document/` at module top level
   (the Phase 3 rule, re-asserted because F-4 adds a document-plane consumer of a `common/` worker).
2. `document_letter_batch.service` and `document_letter_proposal.service` contain **no** call to
   `renderAndRecord`, `renderPdf`, `putObject` or `getObject` — every render goes through
   `document_letter.service.issue`.
3. No `await db.sequelize.transaction` appears in the same function body as a `renderPdf` /
   `putObject` / `issue` call in any new service file.
4. `document_letter_batches.status = 'cancelled'` and `document_letter_proposals.status =
   'cancelled'` are never written by any `src/` file (reserved labels, §13.1).
5. `pdf_render_jobs` enum label sets still match `pdf_render_artifacts`' (the Phase 3 invariant,
   which Phase 4 must not break — it is a reason `letter_batch_item` was rejected as a
   `source_type`, §5 C-3 / DV-3).
6. Neither new service logs `data`, `viewModel`, `templateHtml` or anything named `*_snapshot`.

### 24.5 Fixture matrix

Every new template is exercised with: complete data; every optional field absent; no logo; no
signature; a one-line address; a 300-character name; an RTL name; an emoji name; a name with
combining characters; `<script>` and `</style>` in every free-text field; and a body long enough to
push the signature block toward a page break (**EC-25**, **EC-26**, **EC-27**, **EC-6**).

### 24.6 Manual verification (evidence, not a test)

One documented end-to-end run against the live renderer, recorded in the completion report:
a 5-subject bulk batch drained to `completed`; one auto-issue sweep against a seeded exit; one
propose→approve round trip; one `v2` letter inspected by eye for the `Ref. No.` line, the
letterhead, the signature block and the page breaks.

---

## 25. Migration & Deployment

### 25.1 Deploy order

1. Deploy the code with all four settings defaulting to off/empty. Nothing changes for any org.
2. Hand back `00058` and `011` **unrun**, with the note below.
3. Operator runs `00058`, then `011`.
4. Per pilot org, HR enables what they want: a bulk issue (`#91` already defaults to 500), or `#92`,
   `#93`, `#94`.

Steps 1 and 2 are safe in either order; step 3 must precede any use of `#143`–`#150`, because the
tables do not exist until it runs. Calling `#143` before the migration yields a Sequelize error, not
a corrupt state — but the operator note says to run the migration first so it never happens.

### 25.2 Migration hand-back note (copy into the completion report)

> `00058-create-letter-batches-and-proposals.js` and `011-seed-remaining-letter-types.js` are
> authored and **have not been run**. Run `00058` first, then `011`.
>
> **`00058.up()` is not fully atomic.** Its first statement,
> `ALTER TYPE "enum_document_notifications_event_type" ADD VALUE IF NOT EXISTS 'letter_issued'`,
> runs **outside** the transaction, because PostgreSQL will not let a value added inside a
> transaction be used in that same transaction. Everything else — three tables, four
> `document_settings` columns, every index and CHECK — is inside one transaction. If that
> transaction fails, the enum label remains; this is harmless and `up()` is safe to re-run.
>
> **`down()` is asymmetric by necessity.** It drops the three tables, the four columns and the
> created enum types `CASCADE`, but **cannot** remove the `letter_issued` enum label — PostgreSQL
> has no `DROP VALUE`. The orphaned label is inert.
>
> **`down()` destroys business records**, unlike `00057`'s: batch ledgers and proposals are
> evidence of who asked for what and what was issued. The letters themselves live in
> `org_documents` and are untouched. Treat `down()` as a last resort.
>
> Every added column has a constant default, so on PostgreSQL 11+ the `document_settings` ALTERs
> are metadata-only and do not rewrite the table. No backfill is required or performed.
>
> `011` is `ON CONFLICT (code) DO NOTHING` and re-runnable. Seeding a type does **not** activate it
> in any org.
>
> **One behavioural note that is not a migration.** The C-9 fix changes how `#139`'s derived
> idempotency key is computed. Deploy during a quiet window: an issue request retried across the
> deploy boundary could derive a different key and produce a second letter. After the deploy the key
> is stable, which is the point.

### 25.3 Feature-flag posture

No new feature flag (**D-22**). Letters sit under `documents.access`. Every Phase 4 capability is
off by default via its org setting, so an org with the Documents feature sees no change until HR
acts. `#143` and `#147` are reachable immediately after the migration — that is intended, and
`#91`'s default of 500 is the only guard they need.

### 25.4 Rollback

| Scenario | Action |
|---|---|
| Bulk misbehaving | Set `letter_bulk_max_subjects` low, or revert the deploy. Issued letters stand — they are correct letters |
| Auto-issue misbehaving | Set `letter_auto_issue_on_exit = []`. The next sweep is a no-op |
| Proposals misbehaving | Set `manager_can_propose_letters = false`. Open proposals remain readable and rejectable |
| Notifications misbehaving | Set `document_notify_letter_issued = false`. **Verified: the toggle is checked at enqueue only** (`EVENT_SETTING_TOGGLE` in `enqueue`), not re-checked in `_sendAndRecord`, so rows already in the outbox **will still send**. To stop an in-flight burst the operator must also clear the pending rows, or accept that the queued batch lands. Stated here because "turn the toggle off" is not by itself a kill switch |
| `v2` templates misbehaving | Set `pinned_version = 1` on the affected `document_letter_configs` row. No deploy needed |
| Everything | Revert the deploy. The three new tables become inert; `00058` need not be reversed |

There is **no** scenario in which rollback requires un-issuing a letter. That is the dividend of
every path going through the same issuance transaction.

---

## 26. Backward Compatibility

### 26.1 Guarantees

1. `#139`, `#140`, `#141`, `#142` keep their paths, parameters, response shapes and error codes.
   `#139` gains two **internal** optional parameters that no route passes.
2. `#130`–`#138` are untouched.
3. Every payroll endpoint is untouched. The single payroll edit (§9.8) narrows what the payroll
   drain claims to what it already intended to claim.
4. `org_documents`, `pdf_render_artifacts`, `pdf_render_jobs`, `document_letter_sequences`,
   `document_letter_configs` and `document_letter_branding` gain **no** column.
5. Every template `v1` file is kept forever and still renders (**D-2**).
6. An org that enables nothing behaves exactly as it does today.
7. The five existing notification events, their toggles and their messages are unchanged.

### 26.2 The behaviour changes a user could notice, all of them intended

| Change | Who sees it | Control |
|---|---|---|
| A letter from a `v2` template prints `Ref. No.` | Anyone reading a letter | `pinned_version = 1` |
| An employee receives an email when a letter is issued | The subject | `#94`, default off |
| `#139` issued twice in quick succession now returns **one** letter for large-logo orgs | HR | None — this is the C-9 defect being fixed, and the old behaviour was wrong |
| `#135`/`#136` list four more templates | HR | None; a template must still be enabled before it can be issued |

---

## 27. Production-Readiness Checklist

| # | Item | Done when |
|:--:|---|:--:|
| 1 | C-9 fixed and covered | ☐ |
| 2 | C-10 fixed, payroll drain scoped, payroll suite green | ☐ |
| 3 | `00058` + `011` authored, tested, handed back unrun with the §25.2 note | ☐ |
| 4 | Settings `#91`–`#94` mutable, capped, validated, registered | ☐ |
| 5 | Cohort validation writes nothing on failure (EC-37 proven) | ☐ |
| 6 | Bulk letter deep-equals the single-issue letter (T-B7) | ☐ |
| 7 | Batch re-submission issues nothing new (EC-38 proven) | ☐ |
| 8 | Auto-issue exactly-once across repeated sweeps (EC-39 proven) | ☐ |
| 9 | Cron ordering (archive → auto-issue) asserted, not assumed | ☐ |
| 10 | Stale-scope blocked at approval (EC-40 proven) | ☐ |
| 11 | Notification failure never touches the letter (EC-41 proven) | ☐ |
| 12 | No transaction is open across any render or S3 call (invariant test 3) | ☐ |
| 13 | No secret, key, snapshot or payload in any log or audit row | ☐ |
| 14 | Lint green over four new templates and nine `v2` files | ☐ |
| 15 | Hostile-input fixtures green for every new free-text field | ☐ |
| 16 | Uniform 404 verified for cross-org batch and proposal ids | ☐ |
| 17 | `runArtifactVerification` volume re-checked (§19.4) | ☐ |
| 18 | Full suite at the §0.2 baseline + the new tests, with the same 5 environment failures | ☐ |
| 19 | `md_updates` change record written (§10.4) | ☐ |
| 20 | All four registries updated (§31) | ☐ |
| 21 | Manual end-to-end evidence recorded (§24.6) | ☐ |
| 22 | **D-14 renderer authentication** confirmed present in the target environment before any real employee data flows | ☐ |

Item 22 is not Phase 4 work (§1.3) but it **is** a Phase 4 release gate: bulk and auto-issue
multiply how much employee data crosses the renderer boundary. Phase 4 may ship to a dev environment
without it and must not ship to production with it outstanding.

---

## 28. Acceptance Criteria

Phase 4 is complete when every one of these is demonstrably true.

1. HR issues confirmation letters to 200 employees in one action. Every one of the 200 is the
   document the single-issue path produces for that subject, with its own reference number, its own
   artifact and its own recipient row.
2. A cohort containing one subject with no salary structure is refused in full, with that subject
   named, **before any render is spent** and with nothing written.
3. `#144` shows live progress and names every failed subject with a stable error code. A failed
   subject is retried by re-POSTing the batch; the 197 that succeeded are untouched.
4. Re-submitting a completed batch issues nothing and returns the original `batch_id`.
5. An employee exit whose last working day has arrived produces a relieving letter **exactly once**,
   however many times the sweep runs, with the letter's date pinned to the last working day.
6. An org with `letter_auto_issue_on_exit = []` is completely unaffected by the sweep.
7. A manager proposes an experience letter for a direct report; HR sees it in the queue, approves,
   and a letter is issued with the proposal closed in the same transaction.
8. A proposal whose subject has stopped reporting to the proposer is blocked at approval and can
   only proceed with an explicit acknowledgement, which is audited.
9. Two HR users approving the same proposal simultaneously produce exactly one letter.
10. With the notification toggle on, an issued letter enqueues exactly one outbox row for the
    subject; a forced send failure leaves the letter published and the row retried.
11. All four new templates preview correctly with and without optional data, and
    `salary_certificate` refuses a subject with no salary structure.
12. A letter issued from a `v2` template prints its reference number; an org pinned to `v1` renders
    exactly as before.
13. The renderer being down blocks nothing irreversibly: `#143` still queues, the drain retries,
    `#149` returns `503` with the proposal still pending, and no partial state survives anywhere.
14. Payroll's drain never claims a letter job, and the letter drain never claims a payslip job.
15. Two identical `#139` calls for a large-logo org produce one letter.
16. Every pre-existing test passes unchanged; the suite is at the §0.2 baseline plus Phase 4's own
    tests.
17. The migration and seeder are handed back unrun with the §25.2 note, and all four registries plus
    the `md_updates` change record are current.

---

## 29. Edge-Case Traceability

### 29.1 The main plan's register, Phase 4's assigned cases

| # | Edge case | Where Phase 4 discharges it |
|---|---|---|
| EC-37 | Bulk issuance where one subject is invalid → whole batch rejected before a render is spent | §14.1 steps F–G; BR-B3; T-B1 |
| EC-38 | Batch re-submitted after a partial failure → only the unfinished subjects run | `document_letter_batches_idem_uq` + `document_letter_batch_items_subject_uq` + `enqueueMany`'s `ON CONFLICT DO NOTHING`; BR-B9; T-B5. **Implemented differently from the main plan's index** — DV-3 / C-3 |
| EC-39 | Offboarding hook fires twice → exactly one relieving letter | BR-A4's fixed key + `pdf_render_artifacts UNIQUE (org_id, idempotency_key)`; T-A3 |
| EC-40 | Manager proposal approved after the subject stops reporting to the proposer → blocked | BR-M4; §14.3 step 4; T-M6 |
| EC-41 | Notification send fails after issuance → retried, never rolls back or hides the letter | §9.5 (enqueue in-transaction, send by the dispatcher); T-N4 |

### 29.2 Inherited cases Phase 4 must not break

| # | Case | Phase 4's obligation |
|---|---|---|
| EC-10 | Asset presigned URL expires mid-render | Extended to batches by C-11 / DV-7 |
| EC-15 | Template version bumped mid-flight | `template_version` frozen on the batch (BR-B5) and resolved once per issue (unchanged) |
| EC-17 | Two concurrent issues without a key → identical derived key | **Repaired** by C-9; was broken for large-logo orgs |
| EC-18 | Reference sequence contention under bulk | `FOR UPDATE` per `(org, template, FY)`; gaps accepted; §15.3 |
| EC-19 | Artifact `ready`, object gone | Unchanged: report-only for `record` class (Phase 3 §12.2). Phase 4 creates more record artifacts; §19.4 re-checks the sweep's volume |
| EC-20 | Crash between the S3 write and the commit | Unchanged; the sweeper resolves it; the worker's retry converges |
| EC-22 | Subject soft-deleted mid-flight | Re-checked inside `onReady` (unchanged); in bulk it becomes a `skipped` item (BR-B11) |
| EC-23 | Type deactivated between config and issue | Re-checked inside `onReady` (unchanged); in bulk it becomes a `skipped` item |
| EC-24 | Compensation-bearing letter with no salary structure | `422 LETTER_FACTS_MISSING` at cohort validation, so the batch is refused before any render |
| EC-25 / EC-26 / EC-27 | Hostile names, overflowing addresses, split signature blocks | The fixture matrix (§24.5) covers all four new templates and the nine `v2` files |
| EC-28 | A generated letter file-replaced through the upload handshake | Unchanged; Phase 4 adds no write path to `org_documents` outside `issue` |
| EC-46 | A tenant's letter served to another tenant | Unchanged and structurally impossible; the three new tables carry `org_id` in every predicate and index |

### 29.3 New edge cases Phase 4 introduces

| # | Case | Resolution |
|---|---|---|
| EC-P4-1 | A letter job is claimed by the payroll drain and silently abandoned | **C-10a** `sourceTypes` scoping; T-C10a |
| EC-P4-2 | A default-configured org (`pdf_render_engine = 'pdfkit'`) never drains its letter queue | **C-10b** a separate, engine-independent letter drain |
| EC-P4-3 | The derived idempotency key changes between two mints for an org with a logo above 64 KB | **C-9** stable branding identity; T-C9a |
| EC-P4-4 | A batch item whose subject or type stopped being issuable retries until `max_attempts` | `skipped`, not `failed`; BR-B11; T-B9 |
| EC-P4-5 | A crash between the letter commit and `markIssued` leaves an issued letter with a `pending` item | The next drain converges via the fixed key; T-B10 |
| EC-P4-6 | Auto-issue and a manual `#139` produce two relieving letters for one exit | **Accepted, not prevented.** Different keys, and every letter type is `allows_multiple`. An explicit HR act and an automatic one are two acts; HR can retire one through the existing lifecycle |
| EC-P4-7 | A batch drains across midnight and letters carry two different dates | Prevented: the pinned date is frozen on the batch (BR-B6) |
| EC-P4-8 | A branding edit lands mid-batch and half the letters carry the old letterhead | Prevented: branding **content** is frozen on the batch (BR-B7). Asset transport refreshes, which changes no printed value |
| EC-P4-9 | A 500-subject cohort validation times out the HTTP request | Bounded by `#91`; the org context is resolved once; if p95 exceeds 10 s, lower `#91` — never move validation to the background (EC-37 forbids it) |
| EC-P4-10 | A batch's notification burst floods the mailer | The outbox absorbs it; the dispatcher's existing batch size and retry are the throttle; `#94` defaults off |
| EC-P4-11 | Two concurrent approvals of one proposal | Conditional `decide()`; the loser's letter rolls back; T-M8/T-M9 |
| EC-P4-12 | `#149` approves while the manager's team changed seconds earlier | Re-checked under lock at approval; EC-40's mechanism, not a race |
| EC-P4-13 | A reference number is burned by a `v2` render failure and an auditor sees a gap | Accepted (**D-20**) and made explainable by the `pdf.letter.reference_burned` log line (§16.4) |
| EC-P4-14 | `00058`'s enum ALTER succeeds, the table transaction fails | Harmless and idempotent; `up()` re-runs cleanly (§6.5, §25.2) |
| EC-P4-15 | Auto-issue runs before the archive and the letter's obligation is waived | Prevented by cron ordering (§14.2 rule 3); T-A8 asserts the order |
| EC-P4-16 | **[R-17]** Two *different* batches for the same template overlap on some subjects | **Accepted, not prevented.** Different `batch_id` ⇒ different `keyBase` ⇒ two letters with two reference numbers for the overlapping people. Two cohorts are two deliberate acts, every letter type is `allows_multiple`, and HR retires a duplicate through the existing lifecycle. Preventing it would need an org-wide "one letter per subject per template per day" rule no requirement states, which would also block a legitimate reissue |

---

## 30. Open Decisions

### 30.1 Inherited decisions Phase 4 closes

| OD | Question | Phase 4's answer |
|---|---|---|
| OD-P2-1 | Print the reference number on the PDF? | **Yes**, as F-9: `prints_reference` on the registry entry, `v2` templates, allocation moved before the render for those versions only, `pinned_version = 1` as the opt-out. Burned numbers are accepted and logged |
| OD-11 | Should managers be able to propose letters at all? | **Yes**, behind `manager_can_propose_letters` (#93), default **off** — exactly the main plan's own recommendation and consistent with how this product treats managers elsewhere |
| OD-P2-5 | Should HR be able to trigger the sweeper manually? | **Still no.** `#147` drains the render queue, which is not destructive. A cross-org destructive sweep behind an HR endpoint still needs a scope argument and an audit row first, and nobody has asked |

### 30.2 Decisions Phase 4 opens

| OD | Question | Recommendation | Needed by |
|---|---|---|---|
| OD-P4-1 | Which templates should an org actually put in `letter_auto_issue_on_exit`? | `relieving_letter` and `experience_letter` — the two the main plan names. BR-A2 already forbids compensation-bearing ones | First pilot org |
| OD-P4-2 | Is `letter_bulk_max_subjects = 500` the right default? | Yes to start. Revisit once a real batch's drain wall-time is measured; the DB CHECK caps it at 2000 regardless | After the first large batch |
| OD-P4-3 | Should the `letter_issued` email name the letter type, or only say "a document"? | Name the type. A leaver deserves to know their relieving letter is ready. Confidentiality lives in who can *open* it, not in the subject line — and the recipient is the subject | Before `#94` is enabled anywhere |
| OD-P4-4 | Should a bulk batch be cancellable mid-drain? | Not in Phase 4 (§1.3). The `cancelled` status label is reserved so adding it later needs no enum ALTER | If an operator asks |
| OD-P4-5 | `document_automation.runOffboardingArchive` Pass A filters on `status === 'completed'`, which `employee_exits` does not have (**C-5**) | Fix it in the **Documents module's** backlog, not here. Phase 4 is correct either way. The fix would make Pass A start matching, which is why §14.2 rule 3's ordering is specified now rather than after the fix | Documents module owner |
| OD-P4-6 | Auto-issue plus a manual issue can produce two letters for one exit (**EC-P4-6**). Is that acceptable? | Yes. Both are real acts by real actors. Preventing it would require a semantic "one relieving letter per exit" rule that no requirement states and that would block a legitimate reissue | Business sign-off before `#92` is enabled |
| OD-P4-7 | Should the `v2` reference line also carry the issue date? | No — the date is already in the letterhead of every template. One change per version (**D-2**) | F-9 |
| OD-P4-8 | Does the volume of `record`-class artifacts after bulk adoption need a bigger `runArtifactVerification` limit? | Measure at the first pilot org (§19.4); raise the limit if the pass does not complete its window | Before wide rollout |

---

## 31. Registry & Documentation Updates

| Registry | Update |
|---|---|
| `public/md_system/api_registry.md` | `#143`–`#150` with roles, router/controller/service columns and full error lists. **Documents high-water becomes #150.** Payroll stays at `#220`. Add a note on the `#139` row that it gained two internal optional parameters with no wire change |
| `public/md_settings/org_settings_registry.md` | `#91 letter_bulk_max_subjects`, `#92 letter_auto_issue_on_exit`, `#93 manager_can_propose_letters`, `#94 document_notify_letter_issued`, in the `## Document Module` section, in that file's exact field structure. **High-water becomes #94** |
| `public/md_system/background-jobs.md` | The letter drain added to the PDF Render Worker entry (`*/15 * * * *` IST, engine-independent); `runLetterAutoIssue` added to the offboarding archiver entry **with its ordering constraint stated** |
| `public/md_system/database.md` | The three new tables, their indexes and CHECKs; the four `document_settings` columns; the `letter_issued` enum label |
| `public/md_updates/pdf_letters_phase4_<YYYY_MM_DD>.md` | The frontend change record of §10.4 |
| `public/md_pdf-generation/implementation_plan.md` | §11's Phase 4 bullet gains a pointer to this document as the authoritative scope; §9.1's `#147` annotated as delivered here; §13's three Phase 4 settings annotated with their real numbers `#91`–`#93` plus the added `#94`; §12's EC-37…EC-41 annotated with where they are discharged. **Date the amendment** |
| `public/md_pdf-generation/phases/phase4_api_analysis.md` | To be written alongside the build, in the shape of `phase3_api_analysis.md` |
| `public/md_pdf-generation/phases/phase4_business_walkthrough.md` | To be written alongside the build |
| `public/md_pdf-generation/phases/phase4_completion_report.md` | Pre-flight answers, deviations as built, test counts before/after, the manual end-to-end evidence, the migration hand-back note verbatim, and the closure of OD-P2-1 and OD-11 |

There is **no** `migration_registry.md` and **no** `cron_registry.md` in this repository, despite the
Phase 3 plan's §31 naming both. Migrations are recorded in `public/md_system/database.md` and crons
in `public/md_system/background-jobs.md`; those are the files to update. This correction is itself
worth carrying into the Phase 3 document's errata when someone next touches it.

---

## 32. Summary — the actual remaining Phase 4 work in one page

After subtracting everything Phases 1, 2 and 3 actually built, Phase 4 is **two correctness fixes,
one migration, one seeder, three tables, eight endpoints, three workflows, four templates and one
notification event**:

1. **Two blocking fixes** the later work cannot be correct without: a stable idempotency key
   (**C-9** — the derived key currently moves with a presigned URL's signature for any org whose
   logo exceeds 64 KB) and a source-type-scoped render queue (**C-10** — payroll's drain would
   otherwise claim and silently abandon every letter job, and a default-configured org would never
   drain letters at all).
2. **One migration** (`00058`) for a batch header, a per-subject item ledger, a proposal table, four
   org knobs and one notification enum label — with its enum step deliberately outside the
   transaction and its asymmetry documented.
3. **One seeder** (`011`) for the only two document types the four new templates need; seven of the
   nine already exist in `009` and `010`.
4. **Bulk issuance** that validates the whole cohort synchronously, writes a ledger, fans out onto
   the **existing** Phase 3 queue, and renders each subject through the **existing** Phase 2
   single-issue path — so a bulk letter and a single letter are the same document by construction,
   not by comparison.
5. **Auto-issue on exit** as a bounded daily sweep ordered strictly after the offboarding archive,
   made exactly-once by an explicit idempotency key rather than a new table — the one place where
   **D-11** being *structural* pays for itself.
6. **Maker–checker** in its own table, because `org_documents_generated_chk` makes a
   letter-shaped draft impossible, with the proposer's scope re-checked at approval and the
   proposal closed inside the letter's own transaction.
7. **Four templates**, one notification event, and the reference number finally printed on the page
   as `v2` files behind `pinned_version`.

Everything else the main plan once listed under Phase 4 either already shipped in Phases 1–3, was
dropped because the shipped architecture made it unnecessary (§3.5), or belongs to Phase 5.
Nothing user-visible changes until HR enables a setting, and every capability has an independent
off switch that needs no deploy.

---

## 33. Architectural Plan Review — Complete Defects, Edge Cases & Remediation (R-1 … R-18)

**DATE:** 2026-09-27  
**METHOD:** Adversarial re-read of the plan against the shipped code, asking of every step "how does this fail, what is left behind, and who recovers it?" — not "does the happy path work?"  
**VERDICT:** The plan's *scope reconstruction* holds. Its *mechanics* contained **four defects that would reach production** and four more that would strand work in a way no operator could recover without a DBA. Eighteen findings follow; every one names a verified line of shipped code, a plausible execution path, and a concrete fix. All eighteen are annotated inline throughout this plan (marked `[R-n]`), with their full reasoning, code evidence, failure scenarios, and test specifications detailed here.

### 33.1 Severity Summary

| Severity | Count | IDs |
|---|:--:|---|
| CRITICAL | 4 | R-1, R-2, R-3, R-4 |
| HIGH | 4 | R-5, R-6, R-7, R-8 |
| MEDIUM | 5 | R-9, R-10, R-11, R-12, R-13 |
| LOW | 5 | R-14 … R-18 |

---

### 33.2 Detailed Findings & Remediation Specifications

#### R-1 — Explicit idempotency keys bypass the failure salt and wedge permanently

**Severity:** CRITICAL · **Type:** BUG (design defect in the plan)  
**Location:** plan §16.1; `src/modules/document/services/document_letter.service.js` `_computeIdempotencyKey`; `src/common/services/pdf_render.service.js` lines 237–241, 290.

**Problem.** An earlier draft of the plan gave all three new paths an **explicit** idempotency key (`batch:{b}:{s}`, `autoexit:{e}:{t}`, `proposal:{id}`) and argued in §16.1 that this was *desirable* because "an explicit key bypasses the bounded failure salt … which is correct here because the retry is the worker's". That reasoning was exactly backwards. The shipped code says:

```js
// document_letter.service.js
if (clientKey) return baseKey          // ← no salt, ever

// pdf_render.service.js
if (probe && probe.status === 'failed') {
  throw failedRowError(probe)          // ← never re-renders under this key
}
```

and `safeMarkFailed` marks the artifact `failed` on **every** render failure, transient ones included (`RENDERER_TIMEOUT`, `RENDERER_UNREACHABLE`, `STORAGE_WRITE_FAILED`).

**Failure scenario.** A 200-letter batch runs while the renderer Lambda cold-starts past 20 s for one subject. That subject's artifact is marked `failed`. The job retries at +2 min: `issue` computes the same fixed key, `pdf_render.service` finds the `failed` row and throws `504 PDF_RENDER_TIMEOUT` **without rendering**. Same at +10 min and +30 min. The job exhausts `max_attempts` and dies. The item is stuck `pending` forever. Re-POSTing the batch re-enqueues a job that hits the same wedge. **That subject can never receive that letter** — the key is poisoned for all time. The same single transient blip permanently blocks an exit's relieving letter and a manager's approved proposal.

**Fix.** Do not pass these keys as *client* keys. Add a third input to `_computeIdempotencyKey`:

```js
async _computeIdempotencyKey({ orgId, entry, version, subjectUserId, pinnedDate,
                               overrides, savedFields, branding,
                               clientKey, keyBase = null, reissueOf = null }) {
  const keySuffix = clientKey ?? keyBase ?? <derived digest, unchanged>
  const baseKey   = sha256(`letter:issue:${orgId}:${keySuffix}`).slice(0, 64)
  if (clientKey) return baseKey                    // external clients: unchanged behaviour
  const failed = await artifactRepo.countFailedByKeyPrefix(orgId, baseKey)   // ← now also for keyBase
  if (failed >= SALT_CEILING) throw new AppError(409, …, 'PDF_RETRY_LIMIT_EXCEEDED')
  return failed === 0 ? baseKey : `${baseKey}:r${failed}`
}
```

`issue()` gains `keyBase` (not `payload.idempotency_key`); bulk passes `batch:{b}:{s}`, auto-issue `autoexit:{e}:{t}`, approval `proposal:{id}`. Verified safe against `countFailedByKeyPrefix`, which is `LIKE '<base>%'` over `status = 'failed'` only — so `ready` and `pending` rows never advance the salt.

**Why exactly-once still holds.** Attempt 1 fails → row `base` is `failed`. Attempt 2 → count = 1 → key `base:r1` → renders → `ready`. Attempt 3 (a duplicate, e.g. a crash before `markIssued`) → count is still 1 → `base:r1` → `ready` → `reused: true`, the existing letter returned. One letter, whatever the retry count. `SALT_CEILING = 5` bounds the poison case; the job's `max_attempts` bounds it sooner.

**Test.** T-R1-a: a transient failure followed by a retry renders a second time and issues exactly one letter. T-R1-b: five consecutive failures then a sixth attempt yields `409 PDF_RETRY_LIMIT_EXCEEDED`, not a silent wedge. T-R1-c: a successful render followed by two duplicate attempts issues one letter.

---

#### R-2 — Auto-issue passes `actorId: null` into a NOT NULL column

**Severity:** CRITICAL · **Type:** BUG  
**Location:** plan §14.2 step c and F-5 ("cron-originated, `actorId: null`"); `src/modules/document/models/org_documents.model.js:76`.

**Problem.**

```js
created_by: { type: DataTypes.UUID, allowNull: false },   // org_documents
published_by: { type: DataTypes.UUID, allowNull: true },
```

`_writeLetterRow` sets both from the single `actorId`. The original plan handed it `null`.

**Failure scenario.** The very first auto-issue attempt raises `SequelizeDatabaseError: null value in column "created_by" violates not-null constraint` inside the letter transaction. Every exit fails, every day. `_forEachOrg` swallows and logs it, so the feature is silently 100 % broken and the only symptom is a log line. Worse, the failure happens **inside `onReady`**, i.e. *after* a successful render and S3 write — so every sweep burns a Lambda invocation and leaves a `pending` artifact for the daily sweeper to clean up.

**Fix.** Auto-issue must resolve an attributable actor, and skip when it cannot:

1. `attributionUserId = exit.recorded_by` (the HR user who recorded the exit).
2. If `recorded_by` is `NULL`, **skip the exit** with `letter.auto_issue.no_attributable_actor` and do not retry it in this run. (`employee_exits.recorded_by` is `allowNull: true`, verified.)
3. Pass `issue({ actorId: attributionUserId, systemOrigin: true, … })`. `systemOrigin` makes `_writeLetterRow` record the audit rows with `actor_id: null` (`document_audit_logs.actor_id` is nullable, verified) and `reason: 'auto_issue_on_exit'`, so the audit trail says plainly that no human clicked while the row still satisfies its NOT NULL invariant.

Do **not** relax `created_by` to nullable: it is a Phase-2-era invariant on a table with many writers, and weakening it to serve one cron is the wrong trade.

**Test.** T-R2-a: an exit with `recorded_by` set issues a letter whose `created_by` is that user and whose audit row has `actor_id: null` and `reason: 'auto_issue_on_exit'`. T-R2-b: an exit with `recorded_by: null` is skipped with the named log line and **no** render is attempted.

---

#### R-3 — "markSkipped + job done" violates a DB CHECK, and a cancelled callback leaves the job claimed

**Severity:** CRITICAL · **Type:** BUG  
**Location:** plan §13.2 and §14.1 ("never-issuable → `markSkipped` + job done"); `00057` `pdf_render_jobs_done_chk`; `pdf_render_worker.service.drain`.

**Problem.** Two separate mistakes in one line.

```sql
-- 00057
ALTER TABLE "pdf_render_jobs" ADD CONSTRAINT "pdf_render_jobs_done_chk"
  CHECK ("status" <> 'done' OR "artifact_id" IS NOT NULL);
```

A skipped item has no artifact, so marking its job `done` raises a CHECK violation. And the worker never calls `markDone` without an artifact anyway:

```js
if (result && result.cancelled === true) { summary.cancelled++; return }   // records NOTHING
const artifactId = result && result.artifactId
if (!artifactId) { await this._recordFailure(…, 'PDF_RENDER_NO_ARTIFACT', …); return }
```

So returning `{ cancelled: true }` **records nothing at all** — the job stays `claimed`, is re-claimed after the 10-minute stale window, burns another attempt, and repeats until `max_attempts`, at which point it is abandoned with no terminal marker.

**Failure scenario.** HR deactivates the document type mid-drain. Every remaining item is "never issuable". Each job cycles claimed → stale → claimed three times over ~30 minutes, doing nothing, then vanishes from the queue with `status = 'claimed'` and `finished_at IS NULL` — invisible to `countByBatch`'s terminal buckets and to `countLiveForOrg`'s live buckets alike.

**Fix.** Copy payroll's proven pattern exactly (`payroll_pdf.service.renderPayslipForJob`):

```js
// renderItem, never-issuable branch
await db.sequelize.transaction(async (t) => {
  await itemRepo.markSkipped(orgId, item.id, { failureCode, failureReason }, t)
  await jobRepo.cancelLiveForSource(orgId, 'letter', job.source_id, { reason: failureCode }, t)
})
return { artifactId: null, cancelled: true }
```

`cancelLiveForSource` sets `status='cancelled'` **and** `finished_at`, satisfying `pdf_render_jobs_terminal_chk`, and the worker's `cancelled` counter then means what it says.

**Test.** T-R3-a: a never-issuable item leaves the job `cancelled` with `finished_at` set and the item `skipped`. T-R3-b: no code path calls `markDone` with a null `artifactId` (asserted by a repository-contract test).

---

#### R-4 — The auto-issue sweep silently stops reaching new exits

**Severity:** CRITICAL · **Type:** BUG  
**Location:** plan §14.2 step b; `employee_exit.repository.findLiveForOrg`.

**Problem.** The plan reuses `runOffboardingArchive`'s shape:

```js
async findLiveForOrg(orgId, transaction = null) {
  return EmployeeExit.findAll({ where: { org_id: orgId, status: { [Op.ne]: 'cancelled' } }, transaction })
}
```

**No `ORDER BY`. No `LIMIT`.** It returns every non-cancelled exit the org has ever recorded. The original plan then filtered in JS and took `.slice(0, AUTO_ISSUE_BATCH = 50)`.

**Failure scenario.** An org accumulates 300 settled exits over two years. Every one has a last working day in the past, so all 300 pass the filter. `.slice(0, 50)` takes the first 50 **in whatever order Postgres returns them** — in practice heap order, which is stable until a row is updated. The sweep re-probes those same 50 already-issued exits every day forever, and an employee who leaves tomorrow **is never reached**. The feature appears to work for a year and then quietly stops, with no error and no log line saying so. Secondary problem: the unbounded `findAll` loads every exit row into memory on every tick for every org.

**Fix.** Three changes, all additive:

1. Add a bounded finder to the payroll repository that owns exits — additive, SQL-filtered, and the only cross-module edit F-5 needs:
   ```js
   // src/modules/payroll/repositories/employee_exit.repository.js
   async findDueForLetterAutoIssue(orgId, { onOrBefore, notBefore, limit = 100 }) {
     return EmployeeExit.findAll({
       where: { org_id: orgId, status: { [Op.ne]: 'cancelled' },
                last_working_day: { [Op.lte]: onOrBefore, [Op.gte]: notBefore } },
       order: [['last_working_day', 'DESC'], ['id', 'DESC']],
       limit
     })
   }
   ```
2. Bound the window: `AUTO_ISSUE_LOOKBACK_DAYS = 30`. Only exits whose last working day falls in the last 30 days are candidates, so the candidate set is naturally bounded and a new exit is always inside it. `ORDER BY last_working_day DESC` guarantees the newest are processed first.
3. Emit `letter.auto_issue.window_saturated` at `warn` when the due count equals the limit, so a backlog is visible rather than silent.

**Stated consequence, not hidden.** An exit whose letter fails for 30 consecutive days (a renderer outage of that length) falls out of the window and is never auto-issued. HR issues it manually through `#139`. That is an acceptable, bounded, visible failure; an unbounded scan that silently starves is not.

**Test.** T-R4-a: with 300 past-LWD exits, an exit created today is issued on the next sweep. T-R4-b: an exit older than the lookback window is not considered. T-R4-c: the repository query carries both an `ORDER BY` and a `LIMIT` (grep assertion).

---

#### R-5 — Batch re-submission enqueues jobs pointing at documents that do not exist

**Severity:** HIGH · **Type:** BUG  
**Location:** plan §14.1 step H and BR-B9.

**Problem.** Step H previously read: generate a `document_id` per subject → insert items (`ON CONFLICT DO NOTHING`) → `enqueueMany` with `source_id = item.document_id`. On a **re-submission** the item rows already exist, carrying their **original** `document_id`s; `ON CONFLICT DO NOTHING` correctly inserts nothing. But the `enqueueMany` call still used the **freshly generated** ids from this request.

**Failure scenario.** A batch partially fails; HR re-POSTs it to retry the stragglers. New jobs are enqueued with brand-new `source_id`s that match no item. `renderItem` does `itemRepo.findByDocumentId(org, job.source_id)` → `null` → cancels the job. The re-submission appears to be accepted (`202`, `reused: true`) and accomplishes **nothing**. EC-38 — the one edge case §8.4 of the main plan is most explicit about — is not satisfied.

**Fix.** Make the enqueue read from the persisted ledger, never from the in-memory candidates:

```
BEGIN
  batch = findByOrgAndKey(org, key) ?? create(...)
  itemRepo.bulkCreate(org, candidates, t)                    // ON CONFLICT DO NOTHING
  pending = itemRepo.findPendingForBatch(org, batch.id, { limit: cap }, t)   // ← authoritative
  jobRepo.enqueueMany(org, pending.map(i => ({ source_type: 'letter',
                                               source_id: i.document_id, batch_id: batch.id, ... })), t)
COMMIT
```

`pdf_render_jobs_live_source_uq` then makes the enqueue idempotent for items that already have a live job, and items whose previous job went terminal get a fresh one — which is exactly the retry semantics EC-38 asks for. This also removes the implicit assumption that the candidate list and the ledger agree.

**Test.** T-R5-a: re-POSTing a batch with two failed subjects enqueues exactly two jobs, whose `source_id`s equal the **original** items' `document_id`s. T-R5-b: re-POSTing a fully-issued batch enqueues zero jobs.

---

#### R-6 — Cohort validation is an N+1 against a 10-connection pool

**Severity:** HIGH · **Type:** RISK (availability)  
**Location:** plan §14.1 step F, §17 ("if measured p95 exceeds 10 s, reduce `letter_bulk_max_subjects`"); `configs/default.json` (`poolMax: 10`, `poolAcquire: 20000`); `document_letter_facts.service._loadIdentity`.

**Problem.** `_resolveSubjectIssuanceContext` calls `factsService.resolve` once per subject, and `resolve` is 6–11 queries per subject — of which `_loadIdentity` fires **four in parallel** (`EmployeeProfile`, `ManagerProfile`, `HrProfile`, `UserProfile` under `Promise.all`), plus a department lookup, plus a second full `_loadIdentity` for the reporting manager, plus exit and salary reads. At a cap of 500 subjects that is roughly **3,000–5,500 round trips**, and at any instant the request holds up to four pooled connections.

The plan's earlier mitigation ("lower the cap if p95 exceeds 10 s") addressed latency and missed the real hazard, which is **pool starvation**: `poolMax` is 10 for the whole process. Two or three concurrent `#143` calls, or one `#143` alongside a letter drain running at concurrency 4, can hold every connection. `poolAcquire` is 20 s, after which **unrelated requests across payroll, attendance and auth fail**. A bulk-issue button becomes an application-wide outage.

**Fix.** Three changes, in order of value:

1. **Batch the reads.** Add `factsService.resolveMany(orgId, subjectUserIds, { needs, required })` that loads each source once with `WHERE user_id IN (:ids)` — chunked at 200 ids — and then runs the existing per-subject assembly and required-field checks over the in-memory maps. This reuses `DERIVED_SPEC` and the existing `isBlank`/`fullNameOf` helpers verbatim; it is the same logic with the I/O hoisted. Validation drops from ~4,000 queries to **~8 per chunk**.
2. **Never widen concurrency to compensate.** Validation stays serial within a request; the fix is fewer queries, not more connections. Explicitly forbid a `Promise.all` over subjects.
3. **Lower the default.** `letter_bulk_max_subjects` default **200**, not 500, until a real p95 is measured on a real cohort. The DB CHECK ceiling stays 2000. Raising a default after evidence is cheap; discovering the ceiling in production is not.

**Note on the drain.** The same arithmetic applies there: four concurrent `renderItem` calls each doing a per-subject `resolve` can hold 16 connections against a pool of 10. Because `PDF_WORKER_CONCURRENCY` is already hard-capped at 4 and each render spends most of its time in a 20 s network call rather than in the pool, this is tolerable — but it is the reason `resolveMany` must **not** be used inside `renderItem` (one subject at a time is correct there) and the reason the worker's concurrency must not be raised without re-measuring.

**Test.** T-R6-a: `resolveMany` over 200 subjects issues a bounded number of queries (asserted with a counting stub), and its per-subject output is deep-equal to `resolve`'s for the same fixtures. T-R6-b: no new service file contains a `Promise.all` over a subject list.

---

#### R-7 — A crashed worker strands a batch item for up to 24 hours

**Severity:** HIGH · **Type:** BUG  
**Location:** plan §16.2 ("the pending artifact is swept by `pdf_artifact_sweeper` … the item stays `pending`; the next attempt re-renders"); `pdf_artifact_sweeper.cron.js` (`0 4 * * *`); `pdf_artifact_sweeper.service` (`OLDER_THAN_MINUTES = 30`).

**Problem.** The sweeper is the recovery mechanism, but the staleness threshold is 30 minutes while the cron runs **once a day at 04:00 IST**. Meanwhile `pdf_render.service` refuses to touch a `pending` row held by another attempt:

```js
if (probe && probe.status === 'pending') {
  throw new AppError(409, '…already being generated', 'PDF_RENDER_IN_PROGRESS')
}
```

**Failure scenario.** A deploy restarts the process mid-batch. Thirty items are left with `pending` artifacts. Their jobs are re-claimed after the 10-minute stale window and every attempt throws `409 PDF_RENDER_IN_PROGRESS`, which is not in the worker's `DETERMINISTIC_CODES`, so it is treated as transient: attempts at +2, +10 and +30 minutes all fail the same way. All three attempts are spent within ~42 minutes; the sweeper will not run for another 20 hours. Thirty items are stranded with dead jobs, and re-POSTing the batch does not help — the new job hits the same `pending` row.

**Fix.** Two changes:

1. **Scope the sweeper and call it at the head of the drain.** Extend `pdfArtifactSweeperService.run({ orgId, sourceTypes })` (and `artifactRepo.findStalePendingForSweep({ …, sourceTypes })`) with an optional source-type filter, then have `runLetterRender` call `run({ orgId, sourceTypes: ['letter'] })` before draining. This is recovery, not purge: it only touches rows already `pending` for 30+ minutes and deletes only the objects those rows own. Payroll's sweep cadence is unchanged, so no Phase 3 behaviour moves.
2. **Give letter jobs headroom.** Enqueue them with `max_attempts: 5` (the column is per-row and `enqueueMany` already accepts it), so the backoff schedule spans ~100 minutes and comfortably outlasts the 30-minute staleness window even without change 1.

Both are needed: change 1 is the cure, change 2 keeps a single unlucky item from dying between drain ticks.

**Test.** T-R7-a: an artifact left `pending` for 31 minutes is swept by the drain's leading sweep and the following attempt renders. T-R7-b: the scoped sweep does not touch `payslip` artifacts.

---

#### R-8 — A batch can stay `running` forever

**Severity:** HIGH · **Type:** BUG  
**Location:** plan §9.2 `rollUpStatus` and §14.1 ("`rollUpStatus(org, each touched batch_id)`").

**Problem.** If the roll-up runs only for batches whose jobs were claimed in that tick, then when the last job of a batch reaches a terminal state, the *next* tick claims nothing for that batch, so the batch is never "touched" and never rolled up.

**Failure scenario.** The final three items of a batch fail permanently. Their jobs go `failed`. The next drain claims nothing. The batch's `status` stays `running` and `completed_at` stays `NULL` — forever. `#144` reports a batch that is permanently in progress although nothing is pending. Any operator dashboard or alert keyed on "batches still running" fires indefinitely.

**Fix.** Make the roll-up a sweep, not a side effect:

```js
// end of runLetterRender, per org — unconditionally, even when 0 jobs were claimed
for (const b of await batchRepo.findRunnableForOrg(orgId, { limit: 50 })) {
  await batchService.rollUpStatus({ orgId, batchId: b.id })
}
```

`rollUpStatus` is already specified as idempotent and conditional, so running it over every runnable batch every tick is safe and costs one aggregate query per open batch.

**Test.** T-R8-a: a batch whose last item failed in a previous tick is moved to `completed_with_failures` on a tick that claims zero jobs.

---

#### R-9 — The notification integration is under-specified and would fail at runtime

**Severity:** MEDIUM · **Type:** BUG  
**Location:** plan §9.5 and F-7; `document_notification.service.enqueue`, `document_notification.utils.buildPayload`, `buildCtaUrl`.

**Problem.** The plan named two of the five things a new outbox event needs. The shipped code requires all five, and three of the omissions are hard failures:

| Required | Shipped constraint | Plan |
|---|---|---|
| `NOTIFICATION_EVENT` label + `EVENT_SETTING_TOGGLE` entry | `enqueue` throws `500 NOTIFICATION_EVENT_UNKNOWN` without the toggle | ✔ named |
| `buildMessage` / `buildEmailContent` branch | throws `500` on an unknown `row.event_type` | ✔ named |
| **`dedupeKey`** | `if (!dedupeKey \|\| typeof dedupeKey !== 'string' \|\| dedupeKey.length > 200) throw AppError(500, …, 'NOTIFICATION_DEDUPE_INVALID')` | ✘ **missing** |
| **`PAYLOAD_WHITELIST[eventType]`** | `buildPayload` throws on an unknown event type | ✘ **missing** |
| **`CTA_PATH_BY_ENTITY[entityType]`** | falls back to `/documents/{id}` — the *employee-plane* document route, wrong for an `org_document` | ✘ **missing** |

**Failure scenario.** The first letter issued after `#94` is enabled throws `500 NOTIFICATION_DEDUPE_INVALID` **inside the issuing transaction**, rolling back a letter that was already rendered and written to S3. Enabling an email toggle breaks letter issuance outright.

**Fix.** Specify all five:

1. `NOTIFICATION_EVENT.LETTER_ISSUED = 'letter_issued'`; `EVENT_SETTING_TOGGLE[LETTER_ISSUED] = 'document_notify_letter_issued'`.
2. `PAYLOAD_WHITELIST[LETTER_ISSUED] = ['letter_title', 'reference_number', 'document_type_name']` — no employee name, no salary, no storage key; `assertPayloadClean` is the backstop.
3. `CTA_PATH_BY_ENTITY.org_document = '/documents/org'` (or whatever the frontend's employee org-document detail route is — **confirm with the frontend before implementing**; recorded as OD-P4-9).
4. `dedupeKey = \`letter_issued:${orgDocumentId}\`` — 22 + 36 = 58 chars, inside the 200 cap, and unique per letter, so the repository's `ON CONFLICT (org_id, dedupe_key) DO NOTHING` makes a retried issue enqueue exactly one row.
5. Pass the already-loaded `settings` object (`enqueue` accepts `settings` precisely to avoid a second read) so the letter transaction does not add a settings query per letter.

**Test.** T-R9-a: issuing with `#94` on writes exactly one outbox row with the expected `dedupe_key`, payload keys and `entity_type`. T-R9-b: issuing the same letter twice writes one row. T-R9-c: `buildEmailContent` for the new event returns a CTA URL on the org-document route.

---

#### R-10 — `branding_snapshot` is written but never read, so BR-B7 and EC-P4-8 are not implemented

**Severity:** MEDIUM · **Type:** BUG (spec inconsistency)  
**Location:** plan §6.1 (`branding_snapshot` column), BR-B7, EC-P4-8 ("Prevented: branding content is frozen on the batch").

**Problem.** Storing `branding_snapshot` on the batch without reading it means `renderItem` using "the cached org context" re-derives branding live per drain tick. So a branding edit landing mid-batch changes the letterhead of remaining letters — exactly what EC-P4-8 claims is prevented.

**Fix.** Thread it, so the column earns its place and the claim becomes true:

1. `_resolveOrgIssuanceContext(orgId, templateCode, { brandingOverride = null })` — when supplied, use `brandingOverride` as the branding **content** instead of re-deriving it from `organization_profiles` + `document_letter_branding`.
2. `renderItem` passes `brandingOverride = { ...batch.branding_snapshot, ...freshAssetSrcs }`, where `freshAssetSrcs` comes from `brandingService.resolveAssetSrcs(brandingRow)` re-run when older than `BRANDING_ASSET_REUSE_MS` (the C-11 rule, unchanged).
3. `document_letter_batch.service.create` stores the snapshot with asset srcs **stripped**, so the column never holds a presigned URL.

Content frozen, transport refreshed — which is what DV-7 always said. Because R-11's fix removes asset srcs from the idempotency input, the refresh does not perturb the key.

**Test.** T-R10-a: editing branding mid-batch does not change the letterhead content of the remaining letters. T-R10-b: `branding_snapshot` contains no `logo_src` / `signature_src`.

---

#### R-11 — `input_snapshot` persists a presigned URL containing the branding asset's storage key

**Severity:** MEDIUM · **Type:** RISK (data hygiene / secret at rest)  
**Location:** `document_letter.service` (no `inputSnapshot` passed); `pdf_render.service` line 267 `input_snapshot: inputSnapshot ?? viewModel`; `document_letter_branding.service._resolveOneAsset`.

**Problem.** `pdf_render.service` supports a redacted `inputSnapshot` projection and `document_letter.service` never passed one, so the **full view model** was frozen into the artifact row. For any org whose logo or signature exceeds `INLINE_ASSET_MAX_BYTES` (64 KB), `branding.logo_src` is an S3 presigned GET — a URL embedding the bucket, the object key and a SigV4 signature. That contradicts the module's standing rule that `storage_key` never leaves the service layer, and it is a `record`-class row kept for years.

**Mitigating facts.** `input_snapshot` is excluded from every read projection; the signature expires in 300 seconds; no API returns the column. The harm is an at-rest record of internal storage paths, not a live credential.

**Fix.** Pass the same projection C-9 requires:

```js
renderAndRecord({ …, viewModel,
  inputSnapshot: { ...viewModel, branding: stableBrandingIdentity(viewModel.branding, brandingRow) } })
```

One line, reusing a function the plan already mandates. Note the shipped comment at `pdf_render.service:219` already warns that a future reader must not assume `sha256(canonicalJson(input_snapshot)) === input_hash` — so a redacted snapshot is the designed behaviour, merely previously omitted.

**Test.** T-R11-a: no `pdf_render_artifacts.input_snapshot` written by the letter path contains the substring `X-Amz-Signature` or a bucket path.

---

#### R-12 — Nothing asserts `reference_token` uniqueness across the registry

**Severity:** MEDIUM · **Type:** RISK  
**Location:** `letter-templates/registry.js`; `letter_reference.utils.renderPattern`; `00056` `org_documents_reference_number_uq`.

**Problem.** The default pattern is `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}`, where `{TYPE}` is the entry's `reference_token`. Sequences are keyed by `template_code`, but the **rendered number** is keyed by `reference_token`. Two templates sharing a token therefore draw from two independent counters into one number space, guarded only by `org_documents_reference_number_uq` → `409 LETTER_REFERENCE_CONFLICT`. Phase 4 adds four tokens (`WRN`, `INT`, `NOC`, `SAL`) to five existing ones with nothing preventing a collision, now or in a later phase.

**Failure scenario.** A future template is added with `reference_token: 'EXP'`. Single issues collide occasionally and look like a transient glitch; a 200-letter batch collides on most items and reports a wall of `LETTER_REFERENCE_CONFLICT` failures with no obvious cause.

**Fix.** One assertion in `letter_registry_catalog.test.js`: every entry's `reference_token` is unique across the registry, non-empty, and matches `^[A-Z]{2,8}$`. Cheap, permanent, and it fails the build rather than a batch.

**Test.** T-R12-a: the assertion itself; T-R12-b: a fixture registry with a duplicated token fails it.

---

#### R-13 — A batch with no `effective_date` can split dates across midnight

**Severity:** MEDIUM · **Type:** BUG  
**Location:** plan §6.1 (`effective_date … NULL ⇒ each item pins the batch's created_at date`), BR-B6, EC-P4-7.

**Problem.** Stating that "each item pins the batch's `created_at` date (UTC)" as a derivation at render time invites reaching for `todayIso()` — which is what `issue()` does when `effective_date` is absent. A batch draining across 00:00 UTC would stamp two different dates on one cohort, producing two different reference-number financial-year buckets in the worst case.

**Fix.** Do not derive; store. Replace the nullable `effective_date` with:

```
pinned_date  DATEONLY NOT NULL   -- resolved at creation: request effective_date, else today (UTC)
```

`renderItem` always passes `effective_date: batch.pinned_date` to `issue()`, so the derivation happens exactly once, in one place, and is visible in the row. The request's `effective_date` is echoed by `#144` from `pinned_date`; no separate column is needed.

**Test.** T-R13-a: a batch created with no `effective_date` has a non-null `pinned_date`, and every item's letter carries that date under a clock stubbed to cross midnight mid-drain.

---

#### R-14 — The manager router's mount-order rationale is false

**Severity:** LOW · **Type:** IMPROVEMENT (spec accuracy)  
**Location:** plan §10.1 ("mounts at `/api/v1/documents/manager` **before** the existing manager router so the literal `letters` segment is not swallowed").

**Problem.** In `document_manager.routes.js`, the routes are `/types`, `/team/documents`, `/employees/:userId/documents`, `/documents/recommendations`, `/documents/:id`, `/documents/:id/view-url`, `/documents/:id/recommend`. There is **no** root-level parameterised route, so `/letters` cannot be swallowed and the ordering is irrelevant.

**Fix.** Mount the new router alongside the others at `document.index.js:27`; state that no ordering constraint applies today because the existing manager router declares no root-level `/:param`, and that the router-order test will catch it if one is added later.

---

#### R-15 — The approval probe's `FOR UPDATE` invites a lock-then-render pattern

**Severity:** LOW · **Type:** RISK  
**Location:** plan §14.3 step 2 (`proposalRepo.findById(org, id, { lock: true })`, annotated "READ-ONLY … no lock is held across the render").

**Problem.** Taking `FOR UPDATE` and committing immediately is harmless, but an implementer reading "lock the proposal, then call `issue`" is one refactor away from holding the row lock across a 20-second Lambda call — the single rule this module states most emphatically. The lock buys nothing: the authoritative check is the conditional `decide()` inside `onReady`.

**Fix.** Make the probe a plain read (`findById` without `lock`), and annotate it as a **courtesy pre-check for a fast 404/409 only**. Add the invariant to §24.4's grep assertions: no `{ lock: true }` appears in the same function body as an `issue(` call.

---

#### R-16 — A proposal carries no `template_version`; approval renders whatever is current

**Severity:** LOW · **Type:** RISK (documented behaviour, not a defect)  
**Location:** plan §6.3 (`document_letter_proposals` has no version column).

**Problem.** A manager proposes under `v1`; HR approves a week later after `v2` ships; the letter renders `v2`. EC-15 says the version is resolved once **at issue**, and approval *is* the issue — but stating it explicitly avoids future re-litigation.

**Fix.** Stated explicitly in §6.3 and §14.3: a proposal is a request to issue, not a frozen document, and the template version is resolved at approval like every other issue. No column, no change.

---

#### R-17 — Two different batches containing the same subject double-issue

**Severity:** LOW · **Type:** RISK (accepted)  
**Location:** plan §15.3 (covers concurrent submissions of the *same* cohort only).

**Problem.** HR submits cohort A (100 people) and cohort B (80 people) for the same template, with 12 people in both. Different `batch_id` ⇒ different key bases ⇒ two letters each for those 12, with two reference numbers.

**Fix.** Accept and document, alongside EC-P4-6: two batches are two deliberate acts, every letter type is `allows_multiple`, and HR can retire a duplicate through the existing lifecycle. Formally documented as **EC-P4-16**.

---

#### R-18 — HR's override of a manager's `field_overrides` at approval is not audited

**Severity:** LOW · **Type:** IMPROVEMENT  
**Location:** plan §10.2 `#149` ("`field_overrides` … optional; replaces the manager's when present").

**Problem.** HR can silently change the narrative content the manager proposed, and the audit row specified for `letter_proposal.approved` recorded only `letter_id` and `reference_number`.

**Fix.** When the approval supplies `field_overrides`, record `overrides_replaced: true` plus the **key names** (never the values — they are free text destined for a legal document and do not belong in an audit row) on the `letter_proposal.approved` audit row.

---

### 33.3 Consolidated Remediation Plan

#### Phase A — Before Any Phase 4 Feature Work (Blocks Everything)

| Step | Change | Files | Verify |
|:--:|---|---|---|
| A1 | `keyBase` parameter through the salt path (**R-1**) | `document_letter.service.js` | T-R1-a/b/c |
| A2 | `stableBrandingIdentity` also passed as `inputSnapshot` (**R-11**, folds into C-9) | `document_letter.service.js`, new pure helper beside `branding.builder.js` | T-C9-a/b/c, T-R11-a |
| A3 | `sourceTypes` on `claimBatch` / `drain`; `runPayslipRender` passes `['payslip']` (C-10) | `pdf_render_job.repository.js`, `pdf_render_worker.service.js`, `payroll_automation.service.js` | T-C10-a/b; payroll suite unchanged |
| A4 | `sourceTypes` on `findStalePendingForSweep` / `pdfArtifactSweeperService.run` (**R-7**) | `pdf_render_artifact.repository.js`, `pdf_artifact_sweeper.service.js` | T-R7-b |
| A5 | `reference_token` uniqueness assertion (**R-12**) | `tests/unit/pdf/letter_registry_catalog.test.js` | T-R12-a/b |

A1–A5 are all additive, all independently testable, and none changes an endpoint contract. Landing them first means every later step is built on mechanics that work reliably.

#### Phase B — Schema Corrections Before `00058` Is Authored

| Step | Change | Rationale |
|:--:|---|---|
| B1 | `document_letter_batches.effective_date` (nullable) → **`pinned_date DATEONLY NOT NULL`** | **R-13** |
| B2 | Keep `branding_snapshot`, and specify it is written **asset-src-stripped** and **read** by `renderItem` | **R-10** |
| B3 | No other schema change; `document_letter_batch_items` and `document_letter_proposals` stand as specified | — |

#### Phase C — Service-Layer Corrections

| Step | Change | Finding |
|:--:|---|:--:|
| C1 | `factsService.resolveMany(orgId, ids, { needs, required })`, chunked at 200, used **only** by cohort validation | R-6 |
| C2 | `letter_bulk_max_subjects` default **500 → 200** (CHECK ceiling unchanged at 2000) | R-6 |
| C3 | Batch create enqueues from `findPendingForBatch`, never from in-memory candidates | R-5 |
| C4 | Letter jobs enqueued with `max_attempts: 5` | R-7 |
| C5 | `renderItem` never-issuable branch: `markSkipped` + `cancelLiveForSource` + `{ cancelled: true }` | R-3 |
| C6 | `runLetterRender`: leading scoped stale-pending sweep; trailing roll-up over `findRunnableForOrg`, unconditionally | R-7, R-8 |
| C7 | `_resolveOrgIssuanceContext({ brandingOverride })`; `renderItem` passes the frozen snapshot + fresh asset srcs | R-10 |
| C8 | Auto-issue: `exit.recorded_by` attribution, skip on null, `systemOrigin: true` for the audit | R-2 |
| C9 | Auto-issue: `employee_exit.repository.findDueForLetterAutoIssue` with window, `ORDER BY`, `LIMIT`; saturation warning | R-4 |
| C10 | Notification: `dedupeKey`, `PAYLOAD_WHITELIST`, `CTA_PATH_BY_ENTITY`, pass `settings` | R-9 |
| C11 | Approval probe without `{ lock: true }`; grep assertion | R-15 |
| C12 | `letter_proposal.approved` audit records `overrides_replaced` + key names | R-18 |

#### Phase D — Documentation Corrections

R-14 (mount-order rationale), R-16 (proposal version resolution), R-17 (EC-P4-16), and the §16.1 paragraph whose reasoning R-1 inverts.

#### Revised Implementation Sequence

The plan's §23 sequence integrates the review at two critical junctures:

* **Steps 1–2 become steps A1–A5**, and step 2's "C-10" expands to include A4.
* **A step 0** precedes everything: apply the B-series schema corrections to the `00058` design before the migration is authored, so it is written once.

Everything from the plan's step 3 onward keeps its order, with the C-series corrections folded into the step that builds the corresponding feature (C1–C7 into steps 8–9, C8–C9 into step 12, C10 into step 10, C11–C12 into step 11).

#### New Open Decision

| OD | Question | Owner | Default if unanswered |
|---|---|---|---|
| OD-P4-9 | What is the frontend route for an employee's **org-document** detail page? `CTA_PATH_BY_ENTITY` needs it, and the existing fallback (`/documents/{id}`) is the employee-plane route, which is wrong for a letter (**R-9**) | Frontend | Do not enable `#94` until answered; a wrong CTA sends every notified employee to a 404 |

---

### 33.4 What This Review Did Not Find (Verified Safe)

Stated so the absence is evidence, not an oversight:

* **Tenant isolation.** Every new table carries `org_id` in its PK-adjacent indexes and every specified query is org-scoped. No IDOR path was found in `#143`–`#150`.
* **Recipient materialisation for leavers.** `document_recipient.service.materialise` inserts unconditionally for the supplied `userIds` with no active-membership filter (verified), so an auto-issued letter for an exited employee **does** get its recipient row.
* **Transaction/network separation.** No specified transaction in the plan contains a renderer or S3 call. The two-transaction window in §14.1 is real, converges on retry, and is correctly documented.
* **Reference-number allocation under bulk.** `FOR UPDATE` on one row per `(org, template, FY)` serialises correctly; the allocation is after the render and inside the `onReady` transaction, so the lock is held for microseconds, not for the render.
* **The uniform-404 denial matrix.** Consistent with the document module's existing rules throughout.
* **`org_documents_generated_chk`, `pdf_render_jobs_live_source_uq` and the artifact unique index.** All three do the work the plan assigns them; the decision to prefer the shipped index stands.

---

*End of the Phase 4 implementation plan. §§1–5 reconstruct the scope and resolve the contradictions; §§6–22 define the build; §§23–28 define correctness, sequence and release; §§29–32 define the edges, the open questions and the registries; §33 integrates the complete architectural review, defect analyses, code remediations (R-1 … R-18), and the phased remediation plan. A developer should be able to implement from §23 and §33 outward, reading the referenced sections as each step begins.*
