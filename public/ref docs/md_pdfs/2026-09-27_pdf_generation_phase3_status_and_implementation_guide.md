# PDF Generation Module — Phase 3 Status, Audit & Handover Implementation Guide

**Date:** 2026-09-27  
**Author:** Senior Backend Software Engineer  
**Document Status:** Absolute Source of Truth for Phase 3 Handover  
**Target Audience:** Succeeding AI Agents & Backend Engineers  
**Target Path:** `public/md_updates/2026-09-27_pdf_generation_phase3_status_and_implementation_guide.md`  
**Parent Implementation Plans:**  
- [implementation_plan.md](../md_pdf-generation/implementation_plan.md) (Master Plan)  
- [phase3_implementation_plan.md](../md_pdf-generation/phases/phase3_implementation_plan.md) (Phase 3 Detailed Plan)  

---

## 1. Executive Summary & Current Progress

Phase 3 transitions the three employee-facing Payroll documents (**Payslips**, **Annual Salary Statements**, and **Form 16 Part B**) from in-process PDFKit drawing to the unified HTML→Puppeteer pipeline. It introduces a **durable S3 artifact cache** for released payslips and a **background claim-queue (`pdf_render_jobs`)** for bulk processing and prerendering.

### Completion Status: ~38% (Steps 0–5 Completed; Steps 6–16 Outstanding)

```
[██████████████░░░░░░░░░░░░░░░░░░░░░░░░] 6 / 17 Steps Done (Steps 0–5 Complete)
• Total Unit Tests Written for Phase 3: 93 tests (100% PASSING, 0 FAILING)
• Total Phase 3 Deliverable Files Created: 16 files
• Total Files Remaining to Create/Extend: 15 files
```

| Step # | Work Item | Status | Verified By Tests |
|---|---|---|---|
| **Step 0** | Pre-Flight Checks P-1…P-10 | ✅ **COMPLETED** | Verified clean baseline, free slots, open D-14 |
| **Step 1** | Migration `00057`, `pdf_render_jobs` model, `payroll_settings` additions & transition guard | ✅ **COMPLETED** | [migration_00057.test.js](../../tests/unit/pdf/migration_00057.test.js) (16 passed)<br>[payroll_settings_engine_guard.test.js](../../tests/unit/payroll/payroll_settings_engine_guard.test.js) (10 passed) |
| **Step 2** | Promote template loader to `common/utilities/`, rebind document module | ✅ **COMPLETED** | [template_loader_promotion.test.js](../../tests/unit/pdf/template_loader_promotion.test.js) (4 passed) |
| **Step 3** | Payroll template registry, lint audience option, `payslip/v1.html`, partials & `buildPayslipView` | ✅ **COMPLETED** | [payroll_pdf_templates.test.js](../../tests/unit/pdf/payroll_pdf_templates.test.js) (15 passed) |
| **Step 4** | `pdf_text.js` stream extractor & field-level payslip parity harness (35 assertions) | ✅ **COMPLETED** | [payslip_parity.test.js](../../tests/unit/pdf/payslip_parity.test.js) (35 passed) |
| **Step 5** | Extend `pdf_render.service.js` (`engine`, `renderForSource`) & 6 repository methods in `pdf_render_artifact.repository.js` | ✅ **COMPLETED** | [artifact_repository_phase3.test.js](../../tests/unit/pdf/artifact_repository_phase3.test.js) (11 passed)<br>[pdf_render_service_phase3.test.js](../../tests/unit/pdf/pdf_render_service_phase3.test.js) (5 passed) |
| **Step 6** | `payroll_pdf.service.js` single engine branch; wire `#170`, `#186`, `#191` | ❌ **PENDING** | Outstanding |
| **Step 7** | `pdf_render_job.repository.js`, `pdf_render_worker.service.js`, `pdf_render_worker.cron.js`, `payrollAutomation.runPayslipRender`, register in `server.js` | ❌ **PENDING** | Outstanding |
| **Step 8** | Warm-up enqueue hooks in `payslip.service.js` (`createForApproval` & `publish`) | ❌ **PENDING** | Outstanding |
| **Step 9** | Endpoints `#219` (drain) and `#220` (status) routes, controllers, schemas | ❌ **PENDING** | Outstanding |
| **Step 10** | Bulk ZIP `#174` cache streaming and threshold-based `202` response | ❌ **PENDING** | Outstanding |
| **Step 11** | EC-19: Request-path detection + repair enqueue, worker repair, `runArtifactVerification` in sweeper | ❌ **PENDING** | Outstanding |
| **Step 12** | `pdf_cache_purge.cron.js` + queue cleanup older than 90 days, register in `server.js` | ❌ **PENDING** | Outstanding |
| **Step 13** | Annual Statement template (`annual_statement/v1.html`), view builder, parity test, wire `#184`/`#193` | ❌ **PENDING** | Outstanding |
| **Step 14** | Form 16 Part B template (`form16_part_b/v1.html`), view builder, parity test, wire `#185`/`#194` | ❌ **PENDING** | Outstanding |
| **Step 15** | Full test suite verification & invariant grep tests | ❌ **PENDING** | Outstanding |
| **Step 16** | Documentation deliverables (API Analysis, Business Walkthrough, Completion Report, Registries) | ❌ **PENDING** | Outstanding |

---

## 2. In-Depth Senior Developer Audit: What Is Already Done

A line-by-line review of the active codebase confirms that Steps 0 through 5 adhere strictly to the project's Architectural and Modular Monolith rules. All 93 unit tests pass without error (`exit code 0`).

### 2.1 Database & Schema (Step 1)
1. **Migration File:** [00057-create-pdf-render-jobs.js](../../src/infrastructure/postgres-sql/migrations/00057-create-pdf-render-jobs.js)
   - Creates `pdf_render_jobs` with UUID primary key, org scoping, `source_type` ENUM matching `pdf_render_artifacts`, `engine`, `status`, priority, scheduling, attempt tracking, and worker diagnostics.
   - Adds partial indexes: `pdf_render_jobs_claim_idx` and `pdf_render_jobs_live_source_uq` (which makes all enqueues idempotent via `ON CONFLICT DO NOTHING`).
   - Adds 4 columns to `payroll_settings`: `pdf_render_engine` (default `'pdfkit'`), `payslip_prerender_on_publish` (default `true`), `pdf_bulk_inline_miss_threshold` (default `50`), and `pdf_cache_retention_days` (default `400`).
   - Fully reversible with a safe `down()` function that destroys only operational queue state and non-evidence settings.
2. **Model Definition:** [pdf_render_jobs.model.js](../../src/modules/document/models/pdf_render_jobs.model.js)
   - Correctly placed under `src/modules/document/models/` beside its sibling `pdf_render_artifacts.model.js` (loaded globally by `models.index.js`, so no require edge).
3. **Settings Model & Validator:**
   - [payroll_settings.model.js](../../src/modules/payroll/models/payroll_settings.model.js#L366-L389) defines all four columns.
   - [payroll_hr.validator.js](../../src/modules/payroll/validators/payroll_hr.validator.js#L245-L248) validates the 4 keys matching exact database check ranges.
   - [payroll_settings.service.js](../../src/modules/payroll/services/payroll_settings.service.js#L92-L101) implements the transition guard: attempting to switch `pdf_render_engine` to `'html'` when `pdfRendererConfig.isConfigured()` is false throws `409 PDF_RENDERER_NOT_CONFIGURED`.

### 2.2 Template Loader Promotion (Step 2)
1. **Promoted Utility:** [src/common/utilities/template_loader.utils.js](../../src/common/utilities/template_loader.utils.js)
   - Exposes `createLoader({ templatesRoot, partialsRoot })` with in-memory caching and partial resolution.
2. **Re-Export Shim:** [src/modules/document/utils/template_loader.utils.js](../../src/modules/document/utils/template_loader.utils.js)
   - Binds to the document letter templates root and re-exports original function signatures. Backward compatibility is 100% maintained.

### 2.3 Templates, Partials & View Builder (Step 3)
1. **Lint Harness:** [tests/unit/pdf/helpers/lint_template.js](../../tests/unit/pdf/helpers/lint_template.js) extended with `audience: 'payroll'` (allowing `pinned_date_text` and bypassing letter-specific preview watermark requirements).
2. **Payroll Registry & Partials:**
   - [registry.js](../../src/modules/payroll/pdf-templates/registry.js) defines the `payslip` template (`v1.html`), A4 format, zero margins, and view-model validator.
   - Partials created: [_partials/head.html](../../src/modules/payroll/pdf-templates/_partials/head.html), [_partials/page-frame.html](../../src/modules/payroll/pdf-templates/_partials/page-frame.html), [_partials/money-table.html](../../src/modules/payroll/pdf-templates/_partials/money-table.html).
   - Template: [payslip/v1.html](../../src/modules/payroll/pdf-templates/payslip/v1.html).
3. **Pure View Builder:** [payslip_view.utils.js](../../src/modules/payroll/utils/pdf/views/payslip_view.utils.js)
   - Pure function `buildPayslipView(snapshot, publishedAt)`. No clock, no database, no side effects. Emits masked bank accounts, earnings, deductions, reimbursements, employer contributions, and pinned-date footer.

### 2.4 Parity Verification Harness (Step 4)
1. **PDFKit Text Extractor:** [tests/unit/pdf/helpers/pdf_text.js](../../tests/unit/pdf/helpers/pdf_text.js) inflates PDFKit output streams using Node's native `zlib` to extract text operators without third-party dependencies.
2. **Parity Assertions:** [payslip_parity.test.js](../../tests/unit/pdf/payslip_parity.test.js) verifies 5 critical invariants across 7 snapshot fixtures (`minimal`, `full`, `reissued`, `lop`, `zeroNet`, `longName`, `fortyComponent`).

### 2.5 Core Render Service & Repository Additions (Step 5)
1. **Render Service:** [pdf_render.service.js](../../src/common/services/pdf_render.service.js)
   - `renderForSource({ persist, retentionClass, sourceType, sourceId, engine, ... })`: cache-aware entry point returning the pipeline artifact or streaming buffer.
   - `loadStoredBytes(artifactId, orgId)`: safely returns `null` when S3 object is absent (triggering EC-19 repair).
2. **Artifact Repository Methods:** [pdf_render_artifact.repository.js](../../src/common/repositories/pdf_render_artifact.repository.js)
   - `findReadyBySource`: cached read by `(org_id, source_type, source_id)`.
   - `findReadyBySourceIds`: batch lookup for ZIP downloads.
   - `findPurgeCandidates`: identifies expired cache-class artifacts.
   - `findReadyRecordsForVerification`: keyset-paginated read for EC-19 sweep.
   - `markPurged`: conditional update setting `status = 'purged'`.
   - `repairReady`: updates `content_hash`, `size_bytes`, `render_ms`, and increments `attempt_count` *strictly guarded* by `retention_class = 'cache'`.

---

## 3. Gap Analysis: What Remains To Be Built (Steps 6–16)

The succeeding AI agent must implement the remaining 11 steps strictly in sequence:

```
Step 6:  payroll_pdf.service.js + Controller wiring (#170, #186, #191)
Step 7:  pdf_render_job.repository.js + pdf_render_worker.service.js + worker cron + payrollAutomation
Step 8:  Enqueue warm-up hooks in payslip.service.js (createForApproval & publish)
Step 9:  New endpoints #219 (drain) & #220 (status) in payroll_hr
Step 10: Bulk ZIP (#174) cache streaming & 202 queued response
Step 11: EC-19 self-repair integration & sweeper verification pass
Step 12: pdf_cache_purge.cron.js (cache retention & 90-day job cleanup)
Step 13: Annual Statement HTML template + view builder + parity + wiring (#184, #193)
Step 14: Form 16 Part B HTML template + view builder + parity + wiring (#185, #194)
Step 15: Full test suite regression run + invariant grep tests
Step 16: Documentation & registry synchronization
```

---

## 4. Prescriptive Implementation Instructions for Succeeding AI Agent

### Step 6: `payroll_pdf.service.js` & Single-Payslip Endpoint Wiring

#### 1. Create `src/modules/payroll/services/payroll_pdf.service.js`
This file is the **single engine branch** for Payroll (D-24). It must be the only file in `src/modules/payroll/` that references `'pdfkit'` or `'html'`.
- **Public Methods**:
  - `renderPayslip({ orgId, actorId, requestId, resolved })`: returns `{ buffer, sizeBytes, engine, cacheHit, artifactId }`.
  - `renderAnnualStatement({ orgId, actorId, requestId, dataset, employee, pinnedDate })`: returns buffer shape.
  - `renderForm16({ orgId, actorId, requestId, dataset, employee, pinnedDate })`: returns buffer shape.
  - `planBulkPayslips({ orgId, rows })`: checks `findReadyBySourceIds`.
  - `renderPayslipForJob({ orgId, job })`: worker entry point.
- **Cacheability Check**:
  ```js
  function isCacheable(resolved) {
    return resolved.persisted === true &&
           resolved.payslip_id != null &&
           resolved.visible_to_employee === true &&
           resolved.published_at != null
  }
  ```
- **Engine Logic**:
  - If `settings.pdf_render_engine === 'pdfkit'` $\rightarrow$ call existing `payslipPdf.render(resolved.snapshot, { creationDate })`.
  - If `settings.pdf_render_engine === 'html'`:
    - If `!isCacheable(resolved)` and reason is "held" (`published_at` is null) $\rightarrow$ **must fall back to PDFKit** (DV-3). Never cache a held payslip.
    - If `!isCacheable(resolved)` and ephemeral $\rightarrow$ render HTML with `persist: false, sourceId: null`.
    - If cacheable $\rightarrow$ check `artifactRepo.findReadyBySource(orgId, 'payslip', resolved.payslip_id)`.
      - If hit $\rightarrow$ `loadStoredBytes(art.id, orgId)`. If bytes found, return cache hit. If bytes null (EC-19) $\rightarrow$ enqueue repair, render inline `persist: false`.
      - If miss $\rightarrow$ render via `pdfRenderService.renderForSource({ persist: true, retentionClass: 'cache', sourceType: 'payslip', sourceId: resolved.payslip_id, engine: 'html', ... })`. Handle 409 conflicts gracefully by rendering inline.

#### 2. Wire Controllers for #170, #186, #191
- In [payroll_hr.controller.js](../../src/modules/payroll/controllers/payroll_hr.controller.js) (method for `#170`):
  Replace direct call to `payslipPdf.render()` with `payrollPdfService.renderPayslip(...)`. Send buffer via `downloadHelper.sendBuffer`.
- In [payroll_manager.controller.js](../../src/modules/payroll/controllers/payroll_manager.controller.js) (method for `#186`): Wire identically.
- In [payroll_self.controller.js](../../src/modules/payroll/controllers/payroll_self.controller.js) (method for `#191`): Wire identically.

---

### Step 7: Queue Repository, Worker Service & Worker Cron

#### 1. Create `src/common/repositories/pdf_render_job.repository.js`
Follow the exact pattern of `document_notification.repository.js`:
- `enqueueMany(orgId, rows, transaction)`: `INSERT ... ON CONFLICT ON CONSTRAINT pdf_render_jobs_live_source_uq DO NOTHING`.
- `enqueueForRun(orgId, runId, { batchId, templateCode, templateVersion, engine, priority, createdBy }, transaction)`:
  Execute raw `INSERT INTO pdf_render_jobs (...) SELECT ... FROM payslips WHERE run_id = :runId AND org_id = :orgId AND status = 'active' AND visible_to_employee = true AND published_at IS NOT NULL ON CONFLICT ON CONSTRAINT pdf_render_jobs_live_source_uq DO NOTHING`.
- `claimBatch(orgId, { now, staleMs, limit, workerToken, transaction })`:
  `UPDATE pdf_render_jobs SET status = 'claimed', attempts = attempts + 1, claimed_at = :now, claimed_by = :workerToken WHERE id IN (SELECT id FROM pdf_render_jobs WHERE org_id = :orgId AND scheduled_for <= :now AND (status = 'queued' OR (status = 'claimed' AND claimed_at < :staleThreshold)) AND attempts < max_attempts ORDER BY priority ASC, scheduled_for ASC LIMIT :limit FOR UPDATE SKIP LOCKED) RETURNING *`.
- `markDone(id, orgId, { artifactId, at }, transaction)`: update `status = 'done', finished_at = :at, artifact_id = :artifactId WHERE id = :id AND org_id = :orgId AND status = 'claimed'`.
- `recordFailure(id, orgId, { failureCode, failureReason, retryAt }, transaction)`: if `retryAt` and attempts < max, revert to `'queued'`, else set `'failed'`.
- `cancelLiveForSource(orgId, sourceType, sourceId, { reason }, transaction)`.
- `countByBatch(orgId, batchId)`: aggregation query for `#220`.

#### 2. Create `src/common/services/pdf_render_worker.service.js`
- Generic claim loop:
  1. Transaction 1: Claim batch (`jobRepo.claimBatch`). Commit immediately.
  2. For each job (bounded concurrency $\le 4$):
     - Execute render callback outside any transaction (`await render(job)`).
  3. Transaction 2: Mark done or record failure per job.

#### 3. Create `src/cron-jobs/pdf_render_worker.cron.js` & Method in `payroll_automation.service.js`
- In [payroll_automation.service.js](../../src/modules/payroll/services/payroll_automation.service.js): Add `runPayslipRender({ orgId = null })`. Iterate orgs with `_forEachOrg`, skip if `pdf_render_engine !== 'html'`, call worker with `payrollPdfService.renderPayslipForJob`.
- In `src/cron-jobs/pdf_render_worker.cron.js`:
  > [!IMPORTANT]
  > **Cron Timing Constraint:** In accordance with the system-wide compute-hour preservation rule, configure the cron schedule with at least 15-minute intervals (e.g., `cron.schedule('*/15 * * * *', ...)`). Register in [server.js](../../src/server.js).

---

### Step 8: Warm-Up Enqueue Hooks in Payslip Lifecycle

In [src/modules/payroll/services/payslip.service.js](../../src/modules/payroll/services/payslip.service.js):
1. In `createForApproval`: If run is auto-published (`visible_to_employee = true`):
   - Check `settings = await payrollSettingsService.getOrCreate(orgId, transaction)`.
   - If `settings.pdf_render_engine === 'html' && settings.payslip_prerender_on_publish`:
     Call `pdfRenderJobRepo.enqueueForRun(orgId, runId, { batchId: uuidv4(), ... }, transaction)`.
2. In `publish` (`#171`):
   - Immediately after `payslipRepo.publishRun`, perform the identical conditional enqueue within the same transaction.

---

### Step 9: Add Endpoints #219 and #220

1. **Endpoint #219: `POST /api/v1/payroll/hr/jobs/payslip-render/run`**
   - Handler in `payroll_hr.controller.js`: Validates optional `{ run_id: uuid }`. If `run_id` is supplied, optionally enqueues at priority 50. Drains the org's queue via `payrollAutomationService.runPayslipRender({ orgId })`. Returns `{ success: true, message: "Payslip render queue processed", data: summary }`.
2. **Endpoint #220: `GET /api/v1/payroll/hr/runs/:runId/payslips/render-status`**
   - Query validation: extracts `batch_id` (optional).
   - Counts total payslips in run, ready artifacts, and live queued/claimed jobs.
   - Returns `{ run_id, total, ready, queued, claimed, failed, will_stream: ready === total }`.
3. **Mount in Routes:** [payroll_hr.routes.js](../../src/modules/payroll/routes/payroll_hr.routes.js) with `hrAuth`.

---

### Step 10: Bulk ZIP Delivery (#174)

In `payroll_hr.controller.js` (method for `#174`):
1. If `settings.pdf_render_engine === 'pdfkit'` $\rightarrow$ keep existing `buildRunZip` generator.
2. If `settings.pdf_render_engine === 'html'`:
   - Call `payrollPdfService.planBulkPayslips({ orgId, rows })`.
   - Count misses: `const inlineCount = plan.misses.length + plan.repairs.length`.
   - If `inlineCount > settings.pdf_bulk_inline_miss_threshold`:
     - Mint `batchId = uuidv4()`.
     - Enqueue misses at priority 50.
     - **Return 202 Accepted:**
       ```json
       {
         "success": true,
         "message": "Bulk payslip generation enqueued",
         "data": {
           "run_id": "...",
           "batch_id": "...",
           "total": rows.length,
           "ready": plan.hits.size,
           "queued": inlineCount,
           "poll_url": "/api/v1/payroll/hr/runs/:runId/payslips/render-status"
         }
       }
       ```
   - Else stream ZIP: For each entry in generator, if hit $\rightarrow$ `loadStoredBytes(artifactId)`; if miss $\rightarrow$ render inline and cache; if uncacheable (held) $\rightarrow$ render via PDFKit. Pipe through `streamChunks`.

---

### Step 11: EC-19 Object Loss & Verification Pass

1. **Request-Path Self-Repair:**
   - In `payroll_pdf.service.js`: when `loadStoredBytes` returns `null` for a ready artifact, enqueue a single-flight repair job (`live_source_uq` acts as mutex), then render inline with `persist: false` to serve the user without failing their download.
2. **Scheduled Sweeper Extension:**
   - In [document_automation.service.js](../../src/modules/document/services/document_automation.service.js): Add `runArtifactVerification({ orgId = null })`.
   - Call `artifactRepo.findReadyRecordsForVerification({ orgId, limit: 200, afterId })`.
   - For each: perform S3 `headObject`. If missing, log `ERROR pdf.record.object_missing` (report-only, no row mutations for record-class).
   - In [pdf_artifact_sweeper.cron.js](../../src/cron-jobs/pdf_artifact_sweeper.cron.js): Call `documentAutomationService.runArtifactVerification({})` following the stale-pending sweep.

---

### Step 12: Cache Purge Cron

Create `src/cron-jobs/pdf_cache_purge.cron.js`:
- Schedule at **04:15 IST** (at least 15 min after `pdf_artifact_sweeper` at 04:00 IST).
- For each org:
  - Query candidates via `artifactRepo.findPurgeCandidates({ orgId, olderThan: cutoff, limit: 500 })`.
  - For each: S3 `deleteObject` $\rightarrow$ `artifactRepo.markPurged(id, orgId, { at: now })` (Object first, row second).
  - Clean up terminal jobs (`status IN ('done', 'failed', 'cancelled')`) older than 90 days.
- Register in [src/server.js](../../src/server.js).

---

### Step 13 & 14: Annual Statement and Form 16 Part B Templates

1. **Annual Statement:**
   - Create `src/modules/payroll/pdf-templates/annual_statement/v1.html` (compact portrait A4 layout).
   - Create `src/modules/payroll/utils/pdf/views/annual_statement_view.utils.js` (`buildAnnualStatementView(dataset, pinnedDate)`). Always emit all 12 months.
   - Register in `registry.js`.
   - Add parity tests in `tests/unit/pdf/annual_statement_parity.test.js`.
   - Wire endpoints `#184` (HR) and `#193` (Self) through `payrollPdfService.renderAnnualStatement`.
2. **Form 16 Part B:**
   - Create `src/modules/payroll/pdf-templates/form16_part_b/v1.html`.
   - Create `src/modules/payroll/utils/pdf/views/form16_view.utils.js` (`buildForm16View(dataset, employee, pinnedDate)`). Support provisional vs finalised.
   - Register in `registry.js`.
   - Add parity tests in `tests/unit/pdf/form16_parity.test.js`.
   - Wire endpoints `#185` (HR) and `#194` (Self) through `payrollPdfService.renderForm16`.

---

### Step 15 & 16: Verification, Grep Invariants & Documentation

1. **Grep Invariant Tests:**
   - Assert only ONE file in `src/modules/payroll/` branches on `pdfkit`: `payroll_pdf.service.js`.
   - Assert no escape hatch methods (`findPurgeCandidates`, `findReadyRecordsForVerification`) are called from controllers.
   - Assert no raw PII in log strings.
2. **Registries & Documentation Synchronization:**
   - Add `#219` and `#220` to [public/md_system/api_registry.md](../md_system/api_registry.md).
   - Add settings `#87`–`#90` to [public/md_settings/org_settings_registry.md](../md_settings/org_settings_registry.md).
   - Add migration `00057` to [public/md_system/migration_registry.md](../md_system/migration_registry.md).
   - Add crons to [public/md_system/cron_registry.md](../md_system/cron_registry.md).
   - Author companions in `public/md_pdf-generation/phases/`:
     - `phase3_api_analysis.md`
     - `phase3_business_walkthrough.md`
     - `phase3_completion_report.md` (including the unrun migration hand-back note).

---

## 5. Verification Commands for the Handover Agent

The following suite of commands must run green before Phase 3 can be marked complete:

```bash
# 1. Existing Phase 3 Foundation Tests (Must Remain 100% Green)
node --test tests/unit/pdf/migration_00057.test.js
node --test tests/unit/payroll/payroll_settings_engine_guard.test.js
node --test tests/unit/pdf/template_loader_promotion.test.js
node --test tests/unit/pdf/payroll_pdf_templates.test.js
node --test tests/unit/pdf/payslip_parity.test.js
node --test tests/unit/pdf/artifact_repository_phase3.test.js
node --test tests/unit/pdf/pdf_render_service_phase3.test.js

# 2. Steps 6–15 Verification Tests (To Be Executed As Implemented)
node --test tests/unit/payroll/payroll_pdf_service.test.js
node --test tests/unit/payroll/pdf_render_job_repository.test.js
node --test tests/unit/payroll/pdf_render_worker.test.js
node --test tests/unit/payroll/payslip_download_endpoints.test.js
node --test tests/unit/payroll/bulk_zip_render.test.js
node --test tests/unit/pdf/annual_statement_parity.test.js
node --test tests/unit/pdf/form16_parity.test.js
node --test tests/unit/pdf/pdf_cache_purge.test.js

# 3. Full Project Test Suite
node --test tests/unit/**/*.test.js
```

---

## 6. Summary for the Succeeding AI Agent

You have a rock-solid, fully tested foundation:
- Schema, models, settings, validators, template partials, view builders, and parity engines are complete.
- **Your immediate starting point is Step 6**: build `src/modules/payroll/services/payroll_pdf.service.js` and wire endpoints `#170`, `#186`, and `#191`.
- Proceed sequentially through Step 16. Do not jump ahead, do not skip tests, and adhere strictly to the established layer boundaries and cron gap constraints.
