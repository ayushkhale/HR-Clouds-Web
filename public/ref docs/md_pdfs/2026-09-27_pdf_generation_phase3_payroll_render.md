# Frontend Change Record — Payroll PDF Generation (Phase 3)

**Date:** 2026-09-27
**Module:** Payroll (payslips, annual statement, Form 16 Part B)
**Audience:** Frontend engineers integrating the payroll PDF and settings endpoints
**Scope:** One client-visible response change (`#174`), two new HR endpoints (`#219`, `#220`), four new org-settings keys, and one layout note. Everything else is unchanged.

---

## 1. What did NOT change (read this first)

These endpoints keep their path, method, auth, parameters, status codes, headers, filename convention and export-ledger behaviour **exactly**. The frontend needs to touch none of them:

- `#170 GET /api/v1/payroll/hr/runs/:runId/payslips/:userId/pdf`
- `#184 GET /api/v1/payroll/hr/employees/:userId/annual-statement/pdf`
- `#185 GET /api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/pdf`
- `#186 GET /api/v1/payroll/manager/payslips/:runId/:userId/pdf`
- `#191 GET /api/v1/payroll/me/payslips/:runId/pdf`
- `#193 GET /api/v1/payroll/me/annual-statement/pdf`
- `#194 GET /api/v1/payroll/me/tax/form16/:financialYear/pdf`

Under the default engine (`pdf_render_engine = 'pdfkit'` — every org's state today) these still stream a PDF exactly as before. The bytes may come from a cache when an org opts into the HTML engine, but the HTTP contract is identical.

## 2. The one client-visible change — `#174` may return `202`

`#174 GET /api/v1/payroll/hr/runs/:id/payslips/download` normally streams a ZIP (`application/zip`).

For an org with **`pdf_render_engine = 'html'`** whose uncached cohort exceeds **`pdf_bulk_inline_miss_threshold`**, it instead returns:

```
202 Accepted
{
  "success": true,
  "message": "Bulk payslip generation enqueued",
  "data": {
    "run_id": "<uuid>",
    "batch_id": "<uuid>",
    "total": 1200,
    "ready": 50,
    "queued": 1150,
    "poll_url": "/api/v1/payroll/hr/runs/<run_id>/payslips/render-status"
  }
}
```

**Frontend handling:** on `202`, do not treat it as an error. Poll `poll_url` (`#220`) until `will_stream` is `true`, then re-request `#174` to download the full ZIP. This branch is **unreachable for any org that has not opted into the HTML engine**, so the default experience is unchanged.

## 3. New endpoint — `#219 POST /api/v1/payroll/hr/jobs/payslip-render/run`

- **Auth:** `hr` only (tenant plane); requires the `payroll.access` feature.
- **Body:** `{ "run_id"?: "<uuid>" }` (optional). With `run_id`, enqueues that run's released payslips first, then drains; without it, drains the org's queue.
- **Response `200`:** `{ engine, enqueued, claimed, done, failed, remaining }`.
- **Engine off:** `200` with `{ engine: "pdfkit", enqueued: 0, claimed: 0, done: 0, failed: 0, remaining: 0 }` — informative, not an error.
- **Idempotent:** safe to call repeatedly.

## 4. New endpoint — `#220 GET /api/v1/payroll/hr/runs/:runId/payslips/render-status`

- **Auth:** `hr` only. A cross-org or missing run returns the same `404` as the other run endpoints.
- **Query:** `batch_id?` (uuid).
- **Response `200`:**

```json
{
  "run_id": "<uuid>",
  "engine": "html",
  "total": 1200,
  "ready": 1200,
  "pending": { "queued": 0, "claimed": 0 },
  "failed": 0,
  "uncacheable": 0,
  "will_stream": true,
  "batch": { "queued": 0, "claimed": 0, "done": 1150, "failed": 0, "cancelled": 0 }
}
```

`will_stream` (`ready + uncacheable === total`) means a `#174` call will now stream a full ZIP. `batch` is `null` when no `batch_id` is supplied.

## 5. New settings keys on `#22 GET` / `#23 PUT /api/v1/payroll/hr/settings`

Four additive keys (existing keys are untouched):

| Key | Type | Bounds | Default |
|---|---|---|---|
| `pdf_render_engine` | string enum | `'pdfkit'` \| `'html'` | `'pdfkit'` |
| `payslip_prerender_on_publish` | boolean | — | `true` |
| `pdf_bulk_inline_miss_threshold` | integer | 1–500 | `50` |
| `pdf_cache_retention_days` | integer | 30–3650 | `400` |

Switching `pdf_render_engine` to `'html'` while the renderer is not configured returns `409 PDF_RENDERER_NOT_CONFIGURED`. Switching back to `'pdfkit'` is always allowed (the documented rollback).

## 6. Layout difference after opting into the HTML engine

An HTML-rendered payslip is **field-identical** to the PDFKit one (same labels, same values, same money formatting — proven field-by-field) but **not pixel-identical**: typography and spacing differ. Anyone comparing an old download with a new one will notice. Additionally, a **held** payslip reviewed by HR is PDFKit-rendered while the released employee copy is HTML-rendered — same fields, different layout. Communicate this in the pilot rollout note.
