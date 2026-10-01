# HTML-Only PDF Generation — Migration Plan (retire PDFKit)

**Date:** 2026-09-30
**Scope:** Every PDF the backend produces
**Status:** Implemented in the same change set. See §9 for verification and §10 for work handed back.

---

## 1. Goal

Generate every PDF through one path: the HTML→PDF renderer service. That means Handlebars HTML templates, rendered by the external renderer, using the `pdf_render.service` pipeline.

In-process PDFKit is removed, along with the `pdfkit` dependency and the per-org `pdf_render_engine` switch.

Bulk PDF generation is **temporarily blocked** behind one ops switch until the renderer's fan-out capacity is proven.

## 2. Inventory — before and after

| Document | Endpoint(s) | Before | After |
| --- | --- | --- | --- |
| Letters (15 templates) | #138 preview, #139 issue, #145 proposal, auto-issue on exit | HTML | HTML (unchanged) |
| Letter bulk issue | #143 | HTML via the render queue | **Blocked** (503) while the switch is off |
| Payslip, released | #170 HR, #186 manager, #191 self | PDFKit by default; HTML + cache if the org opted in | HTML + S3 cache, always |
| Payslip, held (HR only) | #170 | PDFKit, even on the HTML engine (DV-3) | HTML inline, never persisted |
| Payslip, ephemeral | #170 / #191 | PDFKit, or HTML inline | HTML inline |
| Annual salary statement | #184, #193 | PDFKit by default | HTML inline |
| Form 16 Part B | #185, #194 | PDFKit by default | HTML (cached when finalised) |
| Payroll reports, `format=pdf` | #177–#180 (manager / self variants too) | PDFKit only | **New** HTML template `payroll_report/v1` |
| Bulk payslip ZIP | #174 | PDFKit ZIP, or the HTML stream / 202 queue | **Blocked** (503) while the switch is off |
| Payslip prerender on publish | publish / approve transaction | Enqueue, HTML orgs only | Skipped while the switch is off |
| `#219` with `run_id` | `POST /payroll/hr/jobs/payslip-render/run` | Enqueue the run, then drain | **Blocked** (503) while the switch is off. Without `run_id` it still drains. |
| Statutory contributions summary | #222 (added later the same day) | — (JSON only, #118) | **New** HTML, reuses `payroll_report/v1` |
| Bank advice covering copy | #223 (added later the same day) | — (CSV only, #181) | **New** HTML template `bank_advice/v1`, account numbers masked |
| F&F settlement statement | #224 (added later the same day) | — | **New** HTML template `fnf_statement/v1` |

Nothing else in the codebase generates a PDF. The last three rows (#222–#224) were added after this plan was implemented. They follow the same pipeline and are described in `payroll_fnf_bank_advice_statutory_pdfs_2026_09_30.md`. Statutory **e-filing** formats (ECR, ESI return, 24Q/FVU) are still not generated.

## 3. Design decisions

**D1 — One engine, no per-org switch.**
- `payroll_pdf.service` stops reading `pdf_render_engine`.
- The column, the model attribute and the validator entry stay in place. The validator still accepts both values so an existing settings form keeps saving, but the value is **ignored**.
- No migration is required, so the deploy is code-only.
- Dropping the column is a later cleanup migration, once the frontend no longer sends the field.

**D2 — Held payslips render as HTML inline (`persist:false`, `sourceId:null`).**
- A held payslip is not immutable (DV-3), so it is never cached.
- Inline rendering gives the same bytes-on-demand behaviour PDFKit gave, with no stored object.

**D3 — Reports get a generic landscape grid template.**
- `payroll_report/v1.html` is registered in the payroll registry (`source_type: 'report'`, which already exists in the artifact ENUM).
- The column-fitting rule from `report_pdf.utils` moves into a pure view builder, so the same columns are kept or dropped as before:
  - 762 pt of landscape content width;
  - a 46 pt legibility floor;
  - a note pointing to the CSV export when columns are dropped.
- The `REPORT_PDF_MAX_ROWS = 2000` cap and the `422 EXPORT_TOO_LARGE` error are unchanged.
- Rendered inline, never persisted. The artifact row stores a **reference stub**, not the salary grid (no salary PII at rest).

**D4 — Bulk kill switch is an ops env flag, not an org setting.**
- `PDF_BULK_GENERATION_ENABLED` defaults to off. Only the exact string `true` re-enables bulk.
- It is a platform capacity decision about the shared third-party renderer, not a business choice for each org.
- One flag covers every fan-out entry point in §2, and a blocked call fails fast with a single error: `503 PDF_BULK_GENERATION_DISABLED`.
- Work that was already accepted keeps draining: queued jobs, EC-19 repair jobs, letter batches accepted earlier, and `#147` re-enqueueing stragglers of an accepted batch. Blocking is only at the point where new work is accepted.

**D5 — Failed renders must not poison a document (bug fix, required by D1).**
- Every payroll render key is structural (deterministic). `renderAndRecord` re-surfaces a `failed` row for a repeated key and never re-renders it (§20.4).
- So **one transient renderer failure made that payslip (or Form 16) permanently un-downloadable**, and the worker's retries for it failed the same way.
- This was masked while PDFKit was the default. Once HTML is the only engine it becomes a production outage per document.
- Fix: the facade computes the base key. Only if that exact key holds a `failed` row (one indexed lookup) does it move to a bounded retry key `base:r{n}`, where `n` is the count of failed attempts. This is the same scheme letters already use.
- No retry ceiling for payroll: an employee must never be locked out of their payslip. Each failed attempt is a real renderer call triggered by a user or a job, so the number of rows grows only as fast as attempts do.
- The inline key is hashed separately from the cache key, so failed inline attempts do not move the cache key.

**D6 — PDFKit code is deleted, not kept as a fallback.**
- A fallback would keep two engines alive indefinitely, and the per-org switch that selected it is gone.
- The renderer is the single dependency. Its availability is addressed by retries and timeouts in the provider, and by the S3 cache, which serves released payslips without calling the renderer.
- Rollback is a code revert (§8), not a flag.

## 4. Changes, file by file

| File | Change |
| --- | --- |
| `infrastructure/pdf-renderer/pdf-renderer.config.js` | Add `bulkGenerationEnabled`, read from `PDF_BULK_GENERATION_ENABLED`. |
| `common/services/pdf_render.service.js` | Add `isBulkGenerationEnabled()` and `assertBulkGenerationEnabled()` (throws the 503). |
| `payroll/services/payroll_pdf.service.js` | Remove engine branching, the PDFKit import, `_engineOf` and `isHtmlEngine`. Held payslips → `_renderInline`. Add failure-salted keys (D5). Add `renderReport()` (D3). `renderStatus.engine` is always `'html'`; `planBulkPayslips` drops `legacy`. |
| `payroll/utils/pdf/views/report_view.utils.js` (new) | Pure `buildReportView(dataset, pinnedDate)`, plus `fittedColumns` ported from `report_pdf.utils`. |
| `payroll/pdf-templates/payroll_report/v1.html` (new) + `registry.js` | Landscape A4 grid template and its registry entry. |
| `payroll/services/payroll_report.service.js` | `buildPdf` renders through the facade (HTML). Signature gains an optional `actorId`. Return shape is unchanged. |
| `payroll/controllers/payroll_hr.controller.js` | Delete `buildRunZip` and the PDFKit imports. #174 asserts the bulk switch first; the legacy branch is removed. |
| `payroll/controllers/payroll_{manager,self}.controller.js` | Remove the unused PDFKit imports. |
| `payroll/services/payslip.service.js` | Warm-up enqueue is gated on the bulk switch and `payslip_prerender_on_publish`, not on the engine. |
| `payroll/services/payroll_automation.service.js` | `runPayslipRender` drains every org (no engine skip, no settings read). A `run_id` asserts the bulk switch. |
| `payroll/services/payroll_settings.service.js` | Remove the `pdf_render_engine` 409 guard; the setting is inert. |
| `document/services/document_letter_batch.service.js` | #143 `create` asserts the bulk switch first. |
| `payroll/utils/pdf/{pdf_layout,payslip_pdf,annual_statement_pdf,form16_pdf,report_pdf}.utils.js` | **Deleted.** |
| `package.json` / lockfile | `pdfkit` removed. |
| Tests | Delete the PDFKit renderer and parity suites. Port their content rules to view-model tests. Update the facade, cache, bulk, settings, worker and invariant suites. Add tests for the kill switch, held inline rendering, failure salting and the report template. |

## 5. Failure modes and how each is handled

| Failure | Behaviour |
| --- | --- |
| Renderer not configured (`PDF_RENDERER_BASE_URL` unset) | Every PDF endpoint returns `503 PDF_RENDERER_NOT_CONFIGURED`. Boot logs one error line. **An ops prerequisite for deploy** (§7). |
| Renderer timeout | `504 PDF_RENDER_TIMEOUT` (not retried in-process). The next request re-renders under a salted key (D5). |
| Renderer 5xx, network error or throttling | The provider retries (bounded, `PDF_RENDERER_MAX_ATTEMPTS`), then returns `502 PDF_RENDERER_UNAVAILABLE`. The next request re-renders (D5). |
| Released payslip whose cached object was lost | Served inline and repaired out of band (EC-19). Unchanged. |
| S3 read error on a cache hit | Served inline, no repair (EC-P3-7). Unchanged. |
| Two identical requests in flight | Cacheable path: the loser serves the winner's bytes, or renders inline. **Inline path** (held, ephemeral, annual, report): the loser gets `409 PDF_RENDER_IN_PROGRESS`, and a retry after about 2 s succeeds. |
| Process crash mid-render | The pending row is marked failed by the sweeper. The next request salts past it (D5). |
| Report too large | `422 EXPORT_TOO_LARGE` above 2000 rows (unchanged). The payload cap `PDF_PAYLOAD_TOO_LARGE` is a backstop. |
| Bulk call while blocked | `503 PDF_BULK_GENERATION_DISABLED` before any DB write or renderer call. |

There is **no in-process fallback** during a renderer outage.
- Released payslips that are already cached keep downloading.
- Everything else fails with 502/503/504 until the renderer recovers.
- This is the deliberate trade in D6.

## 6. Security

- **D-14 (renderer does not authenticate the `x-api-key` header) is still the release blocker.** This change makes the renderer mandatory for all payroll PDFs, which raises the stakes on it. Payload data (salary figures) travels to the renderer over HTTPS; the config refuses plain HTTP outside development.
- Salary PII is not written at rest by this change. Every payroll artifact row stores a reference stub (`input_snapshot`), never the view model.
- Authorization is unchanged. The facade still receives an already-resolved, already-authorized source and makes no access decision.

## 7. Rollout

1. **Ops prerequisites:**
   - `PDF_RENDERER_BASE_URL` (https) and `PDF_RENDERER_API_KEY` are set in every environment.
   - D-14 is closed on the renderer side.
   - Renderer concurrency is sized for the peak single-document load: payslip downloads on payday.
2. Deploy. There is no migration and no seeder, and `PDF_BULK_GENERATION_ENABLED` stays unset.
3. Watch these metrics:
   - `pdf.render.failed` / `pdf.render.unavailable`, by `source_type`;
   - `evt:"pdf.render"` `render_ms`;
   - `[pdf.payroll.render] cacheHit=`.
4. To re-enable bulk later, set `PDF_BULK_GENERATION_ENABLED=true` and restart. Prerequisites:
   - Load-test the renderer at `pdf_bulk_inline_miss_threshold` concurrent inline renders.
   - Decide how held rows count against the #174 inline threshold. They cannot be queued, so a fully held run streams N renderer calls synchronously.

## 8. Rollback

Revert the change set. PDFKit returns with `pdfkit` in `package.json` again.
- No data needs to be reverted: no schema changed.
- Artifact rows written in the meantime are ordinary `html` rows that the reverted code already understands.

## 9. Verification

- **Unit suites:**
  - The facade has no engine branch.
  - Held payslips render as HTML with `persist:false`.
  - A failed key is salted and re-rendered.
  - Every bulk entry point returns 503 when the switch is off and proceeds when it is on.
  - Reports render through the renderer with a stub snapshot.
  - The template lint and golden fixture pass for `payroll_report`.
  - Content rules that were previously asserted against PDFKit text are asserted against the view models.
- **Static:**
  - `grep -r pdfkit src` returns nothing.
  - `pdfkit` is absent from `package.json`.
- **Manual:** the `payroll_report` template is rendered through headless Chrome (portrait vs landscape, dropped-column note, 60-page register).
- **Full suite:** `npm test`.

## 10. Out of scope / handed back

- Operator: environment variables in §7, and D-14 on the renderer.
- Later cleanup migration: drop `payroll_settings.pdf_render_engine` once the frontend stops sending it.
- ~~Not built: an F&F statement PDF, a bank-advice PDF, statutory PDFs~~. Built as #222–#224 on 2026-09-30 (migration `00063` required, unrun). Statutory e-filing formats remain out of scope.

---

## 11. Frontend integration contract

This section gives the frontend everything it needs for this change. The same content, in shorter form, is in `pdf_html_only_migration_2026_09_30.md`. **No request shape changed.** What changed: which errors a download can return, three blocked bulk calls, two constant response fields, and one ignored setting.

All JSON errors use the standard envelope:

```json
{ "success": false, "message": "Human-readable text", "errorCode": "PDF_RENDER_TIMEOUT", "details": { } }
```

`details` is present only for some codes. A PDF download returns either PDF bytes (`200`, `Content-Type: application/pdf`) or this JSON body. **Check the status or `Content-Type` before treating the response as a file.** With `responseType: 'blob'`, parse the blob as JSON when the status is not `200`.

### 11.1 Bulk calls blocked — `503 PDF_BULK_GENERATION_DISABLED`

```json
{ "success": false,
  "message": "Bulk PDF generation is temporarily disabled. Download documents individually.",
  "errorCode": "PDF_BULK_GENERATION_DISABLED" }
```

| # | Call | Refused when |
|:--:|---|---|
| 174 | `GET /api/v1/payroll/hr/runs/:id/payslips/download` | always |
| 143 | `POST /api/v1/documents/hr/letters/bulk` | always |
| 219 | `POST /api/v1/payroll/hr/jobs/payslip-render/run` | only when the body has `run_id` |

- Do **not** auto-retry: this is an ops switch, not a transient fault.
- Hide or disable "Download all payslips (ZIP)" and "Bulk issue letters", or show the message.
- Still working: #219 without `run_id`; documents #144 `GET /api/v1/documents/hr/letters/bulk/:batchId` (batch progress); documents #147 `POST /api/v1/documents/hr/jobs/pdf-render/run` (letter queue drain); #220 render status. Jobs accepted before the switch still finish.

**When ops re-enables bulk** (no frontend release needed), #174 answers in one of two ways:
- `200` with a streamed ZIP (`application/zip`);
- `202` when too many payslips are not yet rendered:

```json
{ "success": true, "message": "Bulk payslip generation enqueued",
  "data": { "run_id": "<uuid>", "batch_id": "<uuid>", "total": 120, "ready": 40, "queued": 80,
            "poll_url": "/api/v1/payroll/hr/runs/<uuid>/payslips/render-status" } }
```

On `202`, poll `poll_url` (#220) until `will_stream` is `true`, then call #174 again. Handle both responses now, so the UI works the day the switch is turned on.

### 11.2 Single-document downloads — new failure modes

| Document | Endpoints |
|---|---|
| Payslip | `GET /api/v1/payroll/hr/employees/:userId/payslips/:runId/pdf`, `GET /api/v1/payroll/manager/employees/:userId/payslips/:runId/pdf`, `GET /api/v1/payroll/me/payslips/:runId/pdf` |
| Annual statement | `GET /api/v1/payroll/hr/employees/:userId/annual-statement/pdf`, `GET /api/v1/payroll/me/annual-statement/pdf` |
| Form 16 Part B | `GET /api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/pdf`, `GET /api/v1/payroll/me/tax/form16/:financialYear/pdf` |
| Reports | `GET /api/v1/payroll/{hr,manager}/reports/{payroll-register,department-distribution,deduction-summary,components}?format=pdf` |
| New (#222–#224) | see `payroll_fnf_bank_advice_statutory_pdfs_2026_09_30.md` |

| Status | errorCode | Meaning | UI |
|:--:|---|---|---|
| 409 | `PDF_RENDER_IN_PROGRESS` | the same document is being generated by another request | retry once after ~2 s |
| 422 | `EXPORT_TOO_LARGE` `details { row_count, max_rows, format }` | report above 2000 rows (unchanged) | suggest the CSV export |
| 500 | `PDF_RENDER_FAILED` | the renderer rejected the document | "Could not generate the PDF"; offer a manual retry |
| 500 | `PDF_PAYLOAD_TOO_LARGE` | the document data exceeded the renderer's input cap | suggest CSV / a narrower filter; do not retry |
| 502 | `PDF_RENDERER_UNAVAILABLE` | renderer failed or returned a bad document | "Please try again shortly"; manual retry |
| 502 | `STORAGE_UNAVAILABLE` | the generated PDF could not be stored | same as above |
| 503 | `PDF_RENDERER_NOT_CONFIGURED` | renderer not configured on this environment | "PDF generation is unavailable"; no retry |
| 504 | `PDF_RENDER_TIMEOUT` | renderer timed out | offer a manual retry |

- Existing errors (`403`, `404`, validation) are unchanged.
- A manual retry after `502`/`504` is safe: it does not create duplicates, and a failed attempt does not block later attempts (D5).
- Success responses are unchanged: `200`, `application/pdf`, the same filenames.
- There is **no fallback during a renderer outage.** Released payslips that were already cached keep downloading; everything else fails with 502/503/504. A status banner is worth having.

### 11.3 Response fields that are now constant

| Endpoint | Field | Value now |
|---|---|---|
| #220 `GET /api/v1/payroll/hr/runs/:runId/payslips/render-status` | `engine` | always `"html"` |
| #219 `POST /api/v1/payroll/hr/jobs/payslip-render/run` | `engine` | always `"html"` |
| #219 | `engine_html_orgs` | counts every org drained |

Remove any UI branch on `engine === 'pdfkit'`.

### 11.4 Settings

`PUT /api/v1/payroll/hr/settings`:
- `pdf_render_engine` still validates (`"pdfkit"` / `"html"`) and is still returned by GET, but has **no effect**. Saving `"html"` no longer returns `409 PDF_RENDERER_NOT_CONFIGURED`.
- **Remove the engine toggle** and stop sending the field; the column will be dropped in a later release.
- `payslip_prerender_on_publish` saves normally but does nothing while bulk is off. Show it as disabled with a hint, or hide it.

### 11.5 Visual-only changes (no contract change)

- Held payslips (HR only) now use the same HTML design as released ones.
- Payroll report PDFs use a new landscape layout. Columns that don't fit are dropped, with a note pointing to the CSV.
- Orgs that were still on the old engine now get the HTML payslip, annual-statement and Form 16 layout; the figures are the same.

### 11.6 Frontend checklist

- [ ] Handle `503 PDF_BULK_GENERATION_DISABLED` on #174, #143, and #219 with `run_id`; no auto-retry.
- [ ] Handle #174's `202` + polling path for when bulk is re-enabled.
- [ ] On every PDF download, branch on status before saving the blob; map the §11.2 codes to messages.
- [ ] Retry once on `409 PDF_RENDER_IN_PROGRESS`; offer manual retry on 500 `PDF_RENDER_FAILED`, 502 and 504; no retry on 503 `PDF_RENDERER_NOT_CONFIGURED` or 500 `PDF_PAYLOAD_TOO_LARGE`.
- [ ] Remove the `pdf_render_engine` toggle; grey out `payslip_prerender_on_publish` while bulk is off.
- [ ] Drop `engine === 'pdfkit'` branches.
- [ ] Wire the three new downloads (#222–#224) per their change record.
