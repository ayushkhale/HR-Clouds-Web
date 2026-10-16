# PDF Generation Module — Phase 5 (Retention, Rate Limits & Observability)

**Date:** 2026-09-29
**Module:** PDF Generation (Documents + Payroll planes)
**Audience:** Frontend engineers

---

## 1. The one thing the frontend MUST handle — `#143` can now return `429`

`POST /api/v1/documents/hr/letters/bulk` (`#143`, bulk-letter create) can now be **refused for rate**:

- **Status:** `429`
- **Error code:** `LETTER_BULK_RATE_EXCEEDED`
- **Header:** `Retry-After` (seconds until the next UTC hour boundary, when the window resets)

The ceiling is per org per fixed UTC clock-hour (the counter resets at the top of each hour, not on a
sliding 60-minute window), configurable via the new setting
`letter_bulk_rate_per_hour` (`#96`, default **10**). The check runs **before** any subject data is
read, so a rate-limited call reveals nothing about the cohort.

**Do not retry a `429` in a tight loop.** Respect `Retry-After`. Note that an idempotent
re-submission of an existing batch still consumes a token — the limiter cannot know a request is a
replay without reading, and reading is exactly what the limit protects. Surface the wait to the user
rather than auto-retrying.

`#143`'s existing size cap (`#91`, `LETTER_BULK_TOO_LARGE`) still applies below the rate limit — a
request can be refused for rate *or* for size.

## 2. Two new read-only endpoints — queue health

Both are `GET`, `hr`-only, no body, no path params. Optional query `?window_hours` (integer 1–168,
default 24; anything else ⇒ `400 VALIDATION_ERROR`).

| # | Endpoint | Plane | Feature gate |
|:--:|---|---|---|
| 151 | `GET /api/v1/documents/hr/jobs/pdf-render/health` | Documents | `documents.access` |
| 221 | `GET /api/v1/payroll/hr/jobs/payslip-render/health` | Payroll | `payroll.access` |

Response shape (identical between the two, scoped to `letter` vs `payslip`):

```jsonc
{
  "success": true,
  "data": {
    "scope": "letter",
    "window_hours": 24,
    "renderer": { "configured": true, "authenticated": true },
    "queue": {
      "queued": 4, "claimed": 1, "done": 812, "failed": 3, "cancelled": 0,
      "oldest_queued_at": "2026-09-29T04:10:00.000Z",
      "oldest_queued_age_seconds": 900
    },
    "failure_rate": { "terminal": 815, "failed": 3, "rate": 0.0037 },
    "counters": { "pdf.render.total|engine=html": 812, "...": 0 },
    "counters_note": "Per-process and reset on deploy; queue and failure_rate are database-derived and fleet-wide."
  }
}
```

Notes for the UI:
- `failure_rate.rate` is **`null`** when `terminal === 0` (an empty/never-processed queue reports no
  false "healthy 0%"). Render `null` as "no data", not as `0%`.
- `renderer.authenticated` is `Boolean(config.apiKey)` on the server — "are we configured to
  authenticate to the renderer in this environment". It does **not** call the renderer.
- `counters.*` are per-process and reset on deploy; treat `queue` and `failure_rate` as the reliable,
  fleet-wide signal.
- The response never contains storage keys, payloads, rendered HTML, subject ids, or error text.

## 3. Two new org settings (Document Module)

| # | Key | Type | Default | Effect |
|:--:|---|---|---|---|
| 95 | `letter_record_retention_days` | INTEGER, nullable | `NULL` (inherit `document_retention_days`) | Retention for soft-deleted generated letters. `NULL` or `>= 365`. **Lowering it makes older soft-deleted letters purge candidates on the next nightly run — irreversible.** |
| 96 | `letter_bulk_rate_per_hour` | INTEGER | `10` | Bulk-letter batches per org per hour (1–500); drives the `#143` `429`. |

Out-of-range writes are refused `400 VALIDATION_ERROR` (the settings endpoint validates with Joi
before the service layer; a `422 SETTING_OUT_OF_RANGE` backstop exists server-side but the request
never reaches it).

## 4. Explicitly UNCHANGED

- `#130`–`#150` are unchanged **except** `#143` can now return `429` (above).
- `#173`, `#174`, `#191`, `#219` (payslip download/report surfaces) are unchanged.
- Every existing response shape, field, validation and error on those endpoints is identical.
- Orgs on `pdf_render_engine = 'pdfkit'` (the default) are unaffected by every Phase 5 feature.
- An org that changes no setting sees no purge (`#95` NULL) and no behaviour change of any kind.

## 5. Decisions closed (durable record, per C-5)

- **OD-1, OD-2, OD-8, OD-12, OD-P3-6, OD-P4-8** are closed by Phase 5; see the main-plan amendment
  (`public/md_pdf-generation/implementation_plan.md`) for the resolutions.
