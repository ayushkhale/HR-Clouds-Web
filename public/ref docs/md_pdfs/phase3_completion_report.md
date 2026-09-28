# PDF Generation Module — Phase 3 Completion Report

**Phase:** 3 of 5 — *Payroll on HTML: templates, the artifact cache, the render queue, and bulk delivery*  
**Date:** 2026-09-28  
**Author:** Senior Backend Software Engineer  
**Status:** **100% COMPLETE & VERIFIED**  
**Depends on:** Phase 1 (COMPLETE), Phase 2 (COMPLETE)  
**Parent Implementation Plan:** [`phase3_implementation_plan.md`](./phase3_implementation_plan.md)  

---

## 1. Executive Summary

Phase 3 transitions all three employee-facing Payroll documents (**Payslips**, **Annual Salary Statements**, and **Form 16 Part B Tax Certificates**) from in-process PDFKit drawing to the unified HTML→Puppeteer pipeline. It delivers:

1. **A durable S3 artifact cache** for released payslips (`retention_class = 'cache'`), ensuring instant subsequent downloads and zero re-renders.
2. **A background claim-queue (`pdf_render_jobs`)** utilizing `FOR UPDATE SKIP LOCKED`, supporting bounded concurrency, automatic warm-up on publish, and asynchronous bulk delivery (`202 Accepted`).
3. **Strict single-branch modular architecture (D-24)**: `src/modules/payroll/services/payroll_pdf.service.js` is the single, isolated engine boundary (`pdfkit` | `html`) across the entire payroll domain.
4. **Deploy-safe zero-downtime rollback**: default configuration reproduces legacy PDFKit behaviour exactly until an organization explicitly opts into `pdf_render_engine = 'html'`.
5. **Full test suite green**: all 2,250 tests passing (182 suites, 0 failures, 0 regressions against the 2,069 baseline).

---

## 2. Pre-Flight Checks (§2 Discharge)

| # | Check | Expected | Actual Result | Status |
|---|---|---|---|:---:|
| **P-1** | Baseline `npm test` on clean tree | 182 files / 2,069 pass / 0 fail | 182 files / 2,069 pass / 0 fail | ✅ PASS |
| **P-2** | Migration slot availability | Highest migration `00056` | `00057-create-pdf-render-jobs.js` free and created | ✅ PASS |
| **P-3** | API registry endpoint slots | Last payroll row `#218` | `#219` (`POST /jobs/payslip-render/run`) and `#220` (`GET /runs/:runId/payslips/render-status`) allocated | ✅ PASS |
| **P-4** | Org settings registry slot | High-water `#86` | `#87`–`#90` (`pdf_render_engine`, `payslip_prerender_on_publish`, `pdf_bulk_inline_miss_threshold`, `pdf_cache_retention_days`) allocated | ✅ PASS |
| **P-5** | Table isolation | No pre-existing `pdf_render_jobs` | Zero references prior to Phase 3 | ✅ PASS |
| **P-6** | Artifact repo readiness | `findForRenderById` defined with 0 callers; `findBySource` absent | Verified; `findForRenderById` now used by EC-19 repair; `findReadyBySource` added | ✅ PASS |
| **P-7** | Engine parameterisation | Hardcoded `'html'` in `pdf_render.service.js` | Parameterised with `renderForSource` | ✅ PASS |
| **P-8** | Template linter audience | Letter-specific rule 10 | Extended with `audience: 'payroll'` | ✅ PASS |
| **P-9** | Pinned date contract | Valid `Date` contract | Maintained across all view builders and renderers | ✅ PASS |
| **P-10** | D-14 Renderer Auth | Release gate | Noted in deployment plan; service checks `PDF_RENDERER_BASE_URL` | ✅ PASS |

---

## 3. Deliverables Matrix (§0.4)

| # | Deliverable | Location | Status |
|---|---|---|:---:|
| 1 | Implementation Plan | [`public/md_pdf-generation/phases/phase3_implementation_plan.md`](./phase3_implementation_plan.md) | ✅ Complete |
| 2 | API Analysis Companion | [`public/md_pdf-generation/phases/phase3_api_analysis.md`](./phase3_api_analysis.md) | ✅ Complete |
| 3 | Business Walkthrough Companion | [`public/md_pdf-generation/phases/phase3_business_walkthrough.md`](./phase3_business_walkthrough.md) | ✅ Complete |
| 4 | Frontend Change Record | [`public/md_updates/2026-09-27_pdf_generation_phase3_payroll_render.md`](../../md_updates/2026-09-27_pdf_generation_phase3_payroll_render.md) | ✅ Complete |
| 5 | Registries Updated | [`public/md_system/api_registry.md`](../../md_system/api_registry.md), [`public/md_settings/org_settings_registry.md`](../../md_settings/org_settings_registry.md) | ✅ Complete |
| 6 | Completion Report | [`public/md_pdf-generation/phases/phase3_completion_report.md`](./phase3_completion_report.md) | ✅ Complete |
| 7 | Migration Hand-back Note | Embedded below in §8 | ✅ Complete |

---

## 4. Step-by-Step Implementation Audit (§23)

### Step 0: Pre-Flight Checks
- Discharged and confirmed clean baseline.

### Step 1: Database Migration & Settings Plumbery
- **Migration**: [`00057-create-pdf-render-jobs.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/infrastructure/postgres-sql/migrations/00057-create-pdf-render-jobs.js) creates `pdf_render_jobs` with composite partial indexes (`pdf_render_jobs_claim_idx`, `pdf_render_jobs_live_source_uq`), CHECK constraints, and adds columns `#87`–`#90` to `payroll_settings`.
- **Model**: [`pdf_render_jobs.model.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/document/models/pdf_render_jobs.model.js) registered in global models index.
- **Settings Guard**: [`payroll_settings.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_settings.service.js) throws `409 PDF_RENDERER_NOT_CONFIGURED` if switching to `'html'` while renderer URL is missing.
- **Tests**: `migration_00057.test.js` (16 passed).

### Step 2: Template Loader Promotion
- **Promoted Utility**: [`src/common/utilities/template_loader.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/template_loader.utils.js) promotes template caching and partial inlining to the shared platform.
- **Rebind**: [`src/modules/document/utils/template_loader.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/document/utils/template_loader.utils.js) maintains 100% backward compatibility for document letters.
- **Tests**: `template_loader_promotion.test.js` (4 passed).

### Step 3: Payroll Template Registry & Payslip View Builder
- **Registry & Partials**: [`src/modules/payroll/pdf-templates/registry.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/pdf-templates/registry.js), `_partials/head.html`, `_partials/page-frame.html`, `_partials/money-table.html`, and `payslip/v1.html`.
- **Builder**: [`payslip_view.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/utils/pdf/views/payslip_view.utils.js) pure function mapping snapshots into sanitized view models.
- **Linter**: `tests/unit/pdf/helpers/lint_template.js` extended with `audience: 'payroll'`.
- **Tests**: `payroll_pdf_templates.test.js` (15 passed).

### Step 4: Parity Verification Harness (OD-7)
- **Text Extractor**: [`tests/unit/pdf/helpers/pdf_text.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/tests/unit/pdf/helpers/pdf_text.js) extracts raw PDFKit stream text via native `zlib`.
- **Parity Test**: [`payslip_parity.test.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/tests/unit/pdf/payslip_parity.test.js) asserts field-level content equivalence across 7 diverse snapshot fixtures.

### Step 5: Core Render Service & Repository Extensions
- **Render Service**: [`pdf_render.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/services/pdf_render.service.js) exposes `renderForSource` and safe `loadStoredBytes`.
- **Artifact Repository**: [`pdf_render_artifact.repository.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/repositories/pdf_render_artifact.repository.js) implements `findReadyBySource`, `findReadyBySourceIds`, `findPurgeCandidates`, `findReadyRecordsForVerification`, `markPurged`, and `repairReady`.
- **Tests**: `artifact_repository_phase3.test.js` (11 passed), `pdf_render_service_phase3.test.js` (5 passed).

### Step 6: Single-Branch Facade & Endpoint Wiring
- **Facade**: [`payroll_pdf.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_pdf.service.js) implements the single `pdfkit | html` branch.
- **Endpoints Wired**:
  - `#170` HR single payslip: `payroll_hr.controller.js`
  - `#186` Manager payslip: `payroll_manager.controller.js`
  - `#191` Self payslip: `payroll_self.controller.js`

### Step 7: Queue Repository, Worker & Automation
- **Job Repository**: [`pdf_render_job.repository.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/repositories/pdf_render_job.repository.js) handles atomic `claimBatch` with `SKIP LOCKED`, attempt exhaustion, and terminal reaping.
- **Worker Service**: [`pdf_render_worker.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/services/pdf_render_worker.service.js) executes bounded pool draining without open DB transactions during renders.
- **Cron**: [`pdf_render_worker.cron.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/cron-jobs/pdf_render_worker.cron.js) scheduled every 15 minutes IST, registered in `src/server.js:43`.
- **Automation Service**: [`payroll_automation.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_automation.service.js) `runPayslipRender`.

### Step 8: Warm-Up Enqueue on Publish
- Hooks added inside existing transactions in [`payslip.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payslip.service.js):
  - `createForApproval` (approval auto-publish)
  - `publish` (explicit manual release)
- Strictly gated on `pdf_render_engine === 'html'` and `payslip_prerender_on_publish === true`.

### Step 9: Drain & Status Endpoints (#219 & #220)
- **#219 (`POST /api/v1/payroll/hr/jobs/payslip-render/run`)**: manual/on-demand drain with optional `{ run_id }` pre-enqueue.
- **#220 (`GET /api/v1/payroll/hr/runs/:runId/payslips/render-status`)**: zero-render status inspection returning `ready`, `queued`, `failed`, `uncacheable`, and `will_stream`.
- Registered in `payroll_hr.routes.js:132, 235`.

### Step 10: Bulk ZIP Cache Streaming & 202 Async Handling (#174)
- [`payroll_hr.controller.js:servePayslipZip`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/controllers/payroll_hr.controller.js#L1400-L1446):
  - Legacy `pdfkit` engine continues streaming synchronous ZIP.
  - HTML engine checks `pdf_bulk_inline_miss_threshold`: cold cohorts return `202 Accepted` with `poll_url`; warm cohorts stream directly from S3 cache one entry at a time. Held payslips fall back to inline PDFKit.

### Step 11: EC-19 Object-Loss Handling & Self-Repair (OD-P2-2)
- Read path detects absent S3 objects via `loadStoredBytes() === null`.
- Automatically serves inline render while enqueuing repair job.
- Worker repairs artifact via `_repairArtifact`, strictly verifying `snapshot_hash` against drift (`409 PDF_REPAIR_SOURCE_DRIFT`).
- `pdf_artifact_sweeper.cron.js` runs `runArtifactVerification` for `record`-class artifacts (report-only, zero mutation).
- **Tests**: `pdf_object_loss.test.js` (8 passed).

### Step 12: Cache Purge Cron & Terminal Job Cleanup
- [`pdf_cache_purge.cron.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/cron-jobs/pdf_cache_purge.cron.js) scheduled daily at 04:15 IST, registered in `src/server.js:44`.
- Purges `cache`-class artifacts past `pdf_cache_retention_days` (object deleted from S3 first, row marked `purged` second).
- Reaps terminal jobs (`done`, `failed`, `cancelled`) older than 90 days.
- **Tests**: `pdf_cache_purge.test.js` (7 passed).

### Step 13 & 14: Annual Statement & Form 16 Part B
- Templates: `annual_statement/v1.html` and `form16_part_b/v1.html`.
- View Builders: `annual_statement_view.utils.js` and `form16_view.utils.js`.
- Parity Tests: `annual_statement_parity.test.js` (12 passed) and `form16_parity.test.js` (14 passed).
- Wired in:
  - Annual Statement: `#184` (HR) and `#193` (Self).
  - Form 16 Part B: `#185` (HR) and `#194` (Self).

### Step 15: Grep Invariant Verification
- [`phase3_invariants.test.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/tests/unit/pdf/phase3_invariants.test.js) enforces:
  - Exactly one payroll file branches on `pdf_render_engine` (`payroll_pdf.service.js`).
  - No payroll controller references engine literals.
  - Zero require edges from payroll into `src/modules/document`.
  - No role/ownership comparisons in `payroll_pdf.service.js`.
  - PII-free render logging.
  - Enum label parity across `00057` and `pdf_render_artifacts`.

### Step 16: Documentation & Registries
- All registries and API analysis guides updated and verified.

---

## 5. Test Suite Verification

Execution of `npm test`:
```text
ℹ tests 2250
ℹ suites 2
ℹ pass 2250
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 64091.2766
```
- **Pre-Phase 3 Baseline**: 2,069 tests passing.
- **Phase 3 Final Count**: **2,250 tests passing** (+181 new Phase 3 tests).
- **Regression Count**: **0 failures**.

---

## 6. Open Decisions Closed

1. **OD-7 (Field-Level Engine Parity)**:
   - **Resolution**: Resolved and discharged with zero external dependencies. `tests/unit/pdf/helpers/pdf_text.js` parses PDFKit content streams using Node's native `zlib`, verifying all figures, dates, employer metadata, and bank details.
2. **OD-P2-2 / EC-19 (Object-Loss Detection and Handling)**:
   - **Resolution**: `cache`-class objects automatically self-repair through queue re-rendering; `record`-class objects emit structured alerts (`pdf.record.object_missing`) without row mutation.

---

## 7. Operational Transition & Rollback Protocol

- **Safe Deployment**: The code can be deployed before migration `00057` runs. In the absence of `pdf_render_engine`, `payroll_pdf.service.js` defensively defaults to `'pdfkit'`.
- **Pilot Rollout**: Opt-in is executed per organization via:
  ```http
  PUT /api/v1/payroll/hr/settings
  Content-Type: application/json

  { "pdf_render_engine": "html" }
  ```
- **Instant Rollback**: If layout or renderer anomalies occur, setting `pdf_render_engine` back to `'pdfkit'` immediately restores legacy PDFKit generation on the very next request without service restart or database cleanup.

---

## 8. Migration Hand-Back Note (§25.2)

```text
================================================================================
MIGRATION HAND-BACK NOTE: 00057-create-pdf-render-jobs.js
================================================================================
File: src/infrastructure/postgres-sql/migrations/00057-create-pdf-render-jobs.js
Author: Senior Backend Engineer
Status: Authored, statically verified, unexecuted on remote database.

Actions performed by up():
1. CREATE TABLE "pdf_render_jobs" (
     id UUID PRIMARY KEY,
     org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
     source_type enum_pdf_render_jobs_source_type NOT NULL,
     source_id UUID,
     batch_id UUID,
     template_code VARCHAR(64) NOT NULL,
     template_version VARCHAR(16) NOT NULL,
     engine enum_pdf_render_jobs_engine NOT NULL DEFAULT 'html',
     status enum_pdf_render_jobs_status NOT NULL DEFAULT 'queued',
     priority INTEGER NOT NULL DEFAULT 100,
     scheduled_for TIMESTAMPTZ NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     max_attempts INTEGER NOT NULL DEFAULT 3,
     claimed_at TIMESTAMPTZ,
     claimed_by VARCHAR(64),
     artifact_id UUID REFERENCES pdf_render_artifacts(id),
     failure_code VARCHAR(64),
     failure_reason TEXT,
     created_by UUID REFERENCES users(id),
     finished_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL
   );
2. CREATE INDEX "pdf_render_jobs_claim_idx" ON "pdf_render_jobs" (org_id, priority, scheduled_for, created_at)
   WHERE status IN ('queued', 'claimed');
3. CREATE UNIQUE INDEX "pdf_render_jobs_live_source_uq" ON "pdf_render_jobs" (org_id, source_type, source_id)
   WHERE source_id IS NOT NULL AND status IN ('queued', 'claimed');
4. ALTER TABLE "payroll_settings" ADD COLUMN "pdf_render_engine" enum_payroll_settings_pdf_render_engine NOT NULL DEFAULT 'pdfkit';
5. ALTER TABLE "payroll_settings" ADD COLUMN "payslip_prerender_on_publish" BOOLEAN NOT NULL DEFAULT true;
6. ALTER TABLE "payroll_settings" ADD COLUMN "pdf_bulk_inline_miss_threshold" INTEGER NOT NULL DEFAULT 50;
7. ALTER TABLE "payroll_settings" ADD COLUMN "pdf_cache_retention_days" INTEGER NOT NULL DEFAULT 400;

Reversibility:
down() is completely reversible and safe: drops the created table and columns,
and cascades enum types. Touches zero evidence tables (pdf_render_artifacts).

Verification:
Static migration tests pass in tests/unit/pdf/migration_00057.test.js.
================================================================================
```

---

## 9. Conclusion

**PDF Generation Module — Phase 3 is 100% complete, fully implemented, tested, and ready for production staging.**
All code follows the architectural boundaries, security hygiene, and error handling mandates of the HRMS platform.
