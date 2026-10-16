# Runbook — PDF Renderer Outage

**Owner:** On-call / Ops
**Applies to:** PDF Generation module (letters `#139`/`#142`/`#143`/`#149`, `html`-engine payslips)
**Related:** [`renderer_key_rotation.md`](renderer_key_rotation.md) · [`pdf_retention_purge.md`](pdf_retention_purge.md) · [`background-jobs.md`](../background-jobs.md)

---

## What "renderer outage" means

The self-hosted Chromium HTML→PDF renderer (`pdf-generation` AWS Lambda) is unreachable, erroring, or
timing out. HRMS calls it synchronously for letter issuance and for `html`-engine payslip render.

## Detection

Check the queue-health readouts — they are the signal (fleet-wide, DB-derived, survive restarts):

- `GET /api/v1/documents/hr/jobs/pdf-render/health` (`#151`) — letters
- `GET /api/v1/payroll/hr/jobs/payslip-render/health` (`#221`) — payslips

Outage symptoms:
- `failure_rate.rate` climbs.
- `queue.oldest_queued_age_seconds` grows.
- `renderer.configured = false` is a **different** fault — the renderer URL is unset, not down.
- `renderer.authenticated = false` after a rotation is a **key** problem → go to [`renderer_key_rotation.md`](renderer_key_rotation.md).

## Blast radius (by design)

| Surface | Behaviour during outage |
|---|---|
| Single letter (`#139`, `#142`, `#149`) | `503 PDF_RENDERER_UNAVAILABLE`. **No state change.** Letters cannot be issued while the renderer is down — there is no fallback, by design (**D-10**). |
| Bulk letters (`#143`) | Still accepts and queues (`202`). Items stay `queued`; the render worker retries to the attempt cap, then `failed` and individually retryable. |
| Payslips | **Unaffected** if the org is on `pdfkit` (the default). If on `html`, switch to `pdfkit` (see below). |
| Payroll calculate / publish / F&F | **Never touched.** The renderer is not in any state machine's critical section. |

## Operator actions, in order

1. **Check the renderer directly:** `GET /health` on the renderer.
   - `401` → it is the **key**. Go to [`renderer_key_rotation.md`](renderer_key_rotation.md).
   - `5xx` / timeout → it is the **Lambda** (cold start, crash, throttle, deploy). Continue.
2. **Protect payslips:** for any org on `pdf_render_engine = 'html'`, set `pdf_render_engine = 'pdfkit'`.
   This is an instant, **data-migration-free** rollback (Phase 3's exit criterion) — payslips render
   in-process again immediately.
3. **Leave letter batches queued.** Do **not** replay by hand. Queued items drain themselves on the
   render worker's next pass (`*/15 * * * *` IST) once the renderer recovers.
4. **Do not** deploy an unauthenticated renderer to "recover" — that reopens release blocker **D-14**.
   Recover the Lambda or fix the key instead.

## Recovery verification

- `#151`/`#221`: `failure_rate.rate` returns to baseline; `oldest_queued_age_seconds` falls as the
  queue drains.
- A fresh single-letter issue returns `201` with a non-null `renderer_version`.
- Re-enable any org you moved to `pdfkit` only if it was deliberately on `html` and you have confirmed
  the renderer is stable.

## What NOT to do

- Do not manually mark queued/failed jobs as `done`.
- Do not delete queued render jobs to "clear" the queue.
- Do not disable renderer auth.
