# Change Record: Annual Statement / Form 16 / F&F PDFs — Letterhead Branding

**Document Date:** October 8, 2026
**Status:** Implemented & Verified (full unit suite green — 2984 tests; render-verified through the renderer + Lambda fonts + Chrome)
**Module:** Payroll (`src/modules/payroll`)
**Audience:** Frontend engineers who download/preview these documents, and QA.

> Companion to `2026-10-07_payslip_pdf_letterhead_alignment_and_branding_freeze.md`. The payslip
> redesign is extended here to the three **employee-facing formal payroll documents**.

---

## 0. TL;DR — What Changed

| Document | Endpoint (unchanged) | Change |
| :-- | :-- | :-- |
| Annual Salary Statement | `GET …/annual-statement…/pdf` | Now renders with the same letterhead, typography and branding system as the Document-module **letter** templates and the payslip. |
| Form 16 Part B | `GET …/form16…/pdf` | Same visual redesign. |
| Full & Final Settlement Statement | `GET …/exits/:id/settlement-statement/pdf` | Same visual redesign (keeps its two-party signature — employee acknowledgement + authorised signatory). |

**Visual only.** The bank advice and payroll register PDFs are **unchanged** (they stay ink-first monochrome
— internal/operational documents).

**There is NO JSON API request/response change.** No endpoint gained, lost or renamed a field; no new
parameter; no validation change. The documents are server-rendered; the only observable difference is that
the **downloaded PDF looks different** (branded letterhead, accent colour, statutory identifiers, an
authorised-signatory block where the org has configured one, and the org's footer note).

---

## 1. Where the branding comes from

- The org's letterhead is read from its existing **`document_letter_branding`** row (the same letterhead its
  letters use) and resolved **at render time** — unlike the payslip, which freezes its branding into the
  payslip snapshot at publish. These three documents carry no durable snapshot, so each render reflects the
  **current** branding.
- An org that never configured letter branding gets a **text-letterhead fallback** (org name + address from
  the document's employer block) — the document still renders as a proper letterhead, not a bare table.
- A logo/signature image is embedded only if ≤ 64 KB (inlined as a data URI); larger assets are dropped.
  The whole step is **failure-tolerant**: if storage is unavailable or branding can't be read, the document
  falls back to the text letterhead. **Branding never blocks a document render.**
- **Finalised Form 16** is cacheable: the branding in effect at the first render is captured in that cached
  artefact (matching a fixed, finalised tax document). Provisional Form 16, the annual statement and the F&F
  statement are never cached and always reflect current branding.

No migration and no new dependency.

---

## 2. Nothing in the frontend integration needs to change

Same URLs, same auth, same `application/pdf` responses, same filenames. If you cache a previously rendered
PDF by URL, the old design remains until that cache entry ages out.
