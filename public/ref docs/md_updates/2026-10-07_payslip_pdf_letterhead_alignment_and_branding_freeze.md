# Change Record: Payslip PDF Redesign + Frozen Letterhead Branding

**Document Date:** October 7, 2026
**Status:** Implemented & Verified in Backend (1574 payroll + PDF unit tests green; render-verified)
**Module:** Payroll (`src/modules/payroll`)
**Audience:** Frontend Engineers who download/preview payslips, and QA.

> This is the completion record for the plan in
> `2026-10-07_payslip_template_ui_ux_letter_alignment_plan.md`. It supersedes that plan wherever the
> two differ (notably the branding-sharing approach — see §3).

---

## 0. TL;DR — What Changed

| Area | Change | Frontend impact |
| :-- | :-- | :-- |
| Payslip PDF design | The payslip now renders with the same letterhead, typography and branding system as the Document-module **letter** templates (logo, accent colour, signatory block, registered-office identifiers, footer note). | **Visual only.** The download/preview endpoints, their URLs, parameters and response shapes are unchanged. |
| Payslip data completeness | The PDF now carries a text letterhead, employee name + code in the header, an "amount in words" line under net pay, and a signatory block — the fields a real payslip must show. | None (server-rendered). |
| Frozen branding | At publish/approval the org's letterhead is **frozen into the payslip snapshot**, so a reprint months later shows the branding as it was the day the payslip was issued. | None directly; see §2 for the one behavioural note. |

**There is NO JSON API request/response change.** No endpoint gained, lost or renamed a field; no new
parameter; no validation change. The payslip **detail JSON** (`GET …/payslips/:id`) does **not** expose
the new `branding` block — it stays internal to PDF rendering. The only observable difference to a
user is that the **downloaded PDF looks different**.

---

## 1. Endpoints — unchanged

- `GET …/payslips/:id` (detail JSON) — same fields as before.
- Payslip PDF download / preview / bulk — same URLs, same auth, same response (`application/pdf`).
- `POST …/runs/:id/approve`, `…/publish`, `…/payslips/:id/reissue`, backfill — same request and
  response payloads. `approve` still returns `{ ...run, payslips_created }`.

Nothing in the frontend integration needs to change. If you cache a previously rendered payslip PDF by
URL, the old design remains until that cache entry ages out (the render cache key is unchanged by
design — published payslips are stable artefacts).

---

## 2. One behavioural note (server-side, non-breaking)

Approval, reissue, backfill and on-demand (ephemeral) composition now resolve the org's letter
branding **before** opening their database transaction and freeze it into the snapshot:

- Branding is read from the org's existing **`document_letter_branding`** row (the same letterhead its
  letters use). An org that never configured letter branding gets the **text-letterhead fallback**
  (org name + address + PAN from the employer block) — exactly what shipped in the first pass.
- A logo/signature image is embedded **only if it is ≤ 64 KB** (inlined as a data URI); a larger asset
  is dropped and the letterhead shows the org name in text. This keeps the frozen record
  self-contained (no expiring presigned URLs).
- The whole step is **failure-tolerant**: if storage is unavailable or branding can't be read, the
  payslip falls back to the text letterhead. **Branding never blocks a run approval or a payslip.**

No migration and no new dependency.

---

## 3. For maintainers — the design choice that differs from the plan

The plan proposed relocating the pure branding builder to a shared `common` module and re-exporting it
from the document module so payroll could import it. **That was not done.** Instead the small branding
projection was **duplicated** into `src/modules/payroll/utils/payslip_branding.utils.js`
(`buildBrandingView`), because:

1. A payroll file importing from `src/modules/document` is forbidden by a passing architecture test
   (`tests/unit/pdf/phase3_invariants.test.js`); and
2. This codebase deliberately **duplicates frozen-snapshot projections rather than coupling** to a live
   service (the same reason `statutory_note` is duplicated in `payslip_snapshot.utils.js`) — a frozen
   record must not silently change when the letter builder is later edited.

The letter path (`src/modules/document/builders/branding.builder.js`) is untouched; only the payslip
golden fixture changed among the six payroll templates.
