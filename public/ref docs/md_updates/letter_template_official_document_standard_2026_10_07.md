# Letter templates — official-document standard pass (2026-10-07)

## TL;DR for frontend

**No API change. Nothing to integrate.** No request field, response field, validation rule,
query parameter, template code or template version changed. `current_version` is still `1`
for all 15 letter types, and every `{{token}}` in every template is byte-identical to the
previous release (verified by diffing the token set of each template against `HEAD`).

The only visible difference is in the **rendered PDF**: letters are typographically more
consistent and the Performance Improvement Plan now fits on one sheet.

If your UI caches or snapshots letter PDFs for comparison, those snapshots will differ.

---

## What changed

### 1. Shared stylesheet (`_partials/base.css.html`)

Spacing is now expressed as named role tokens instead of ad-hoc pixel values, so the
vertical rhythm is enforceable rather than per-template:

| token | value | used for |
|---|---|---|
| `--gap-tight` | 3px | label→value, inside cards and meta strips |
| `--gap-text` | 6px | paragraph spacing |
| `--gap-block` | 8px | between body blocks (cards, callouts, grids, tables, lists) |
| `--gap-section` | 12px | above a section title |
| `--gap-panel` | 16px | body→signature panel→footer |
| `--pad-cell` | 3px 10px | table cells, fact-grid cells |
| `--pad-panel` | 6px 10px | cards, callouts |
| `--pad-band` | 6px 14px | banners, amount hero |

Off-scale values were pulled onto the scale: four `10px` block margins became `8px`
(`.subject`, `.fact-grid`, `table.comp`, `ol.clauses`), the footer's `4px` top padding
became `3px`, and `.doc-head`'s `10px` top padding became `8px`. Two one-off type sizes
were removed (`.cert-role` 10.5pt → 10pt, `.for-org` 8.5pt → 8pt) and four stray
line-heights collapsed onto the ratified set (1.2→1.25, 1.3→1.35, 1.4→1.45 ×2).

All of these reduce height, so no letter can be pushed onto an extra page by them.

Two behavioural additions:

- `ol.clauses li { page-break-inside: avoid }` — a numbered clause is never cut in half
  across sheets. A clause is a legal unit and must be readable as one.
- `.timeline-item` rows are now a single line (step number, label left, date right) instead
  of a stacked label-over-value block. Only the PIP uses this component.

### 2. Performance Improvement Plan — now one sheet

Previously 2 sheets in every realistic branding variant, with the second sheet carrying a
single clause plus the signatures. Its `Employee Details` grid listed the employee's name
and designation, both of which already appear two lines above it (in the salutation and in
the opening paragraph). The grid now carries the three *non-duplicated* facts — Employee
Code, Designation, Department — on one row.

The employee's name still appears in the salutation and on the acknowledgement signature
line, so nothing is lost from the record.

Result: 1 sheet in all five realistic variants, with ~29px of headroom before it breaks
again. A deliberately extreme stress case (500-character free-text fields) still takes 2
sheets, as expected.

### 3. Two consistency fixes

- `salary_certificate` wrapped its `Ref` row in `{{#if employee_code}}`, but
  `employee_code` is a **required** field for that template, so the guard was dead code.
  Removed. (All 14 other templates already matched the rule: required ⇒ unconditional,
  optional ⇒ conditional, undeclared ⇒ absent.)
- `relieving_letter` was the only template where the red stamp style carried a *status*
  ("Separation Record") rather than a confidentiality marker — everywhere else red means
  "Private & Confidential". It now uses the neutral accent stamp, matching its sibling
  `experience_letter` ("Tenure Completed"). Wording unchanged.
- `_branding_probe` printed its meta labels as `Ref:` / `Date:` with trailing colons while
  all 15 real letters print `Ref` / `Date`. Since the probe exists to show an organisation
  what its letters will look like, it now matches them.

---

## Verification

| check | result |
|---|---|
| Unit tests (full suite) | 2928 pass / 0 fail |
| Unit tests (PDF suite) | 571 pass / 0 fail — same count as before the change |
| Template lint (10 rules) | 0 violations |
| Golden fixtures | all 15 regenerated deliberately |
| Token set vs `HEAD` | identical in all 17 templates and 4 partials |
| Render matrix | 119 renders (17 templates × 7 branding/data variants) through the production assembler, the renderer's own template service, the Lambda font set and headless Chromium |
| Page counts | 133 sheets → 128; single-page renders 105 → 110; **0 regressions, 5 improvements** |
| Orphaned signatures / footers | none |
| Content clipping | none (the two reported overflows are the intentional `clip-path` that trims the trailing separator on the contact line) |
| Colour independence | checked under `emulateVisionDeficiency('achromatopsia')`; semantic callouts stay distinguishable by border weight |
| Largest assembled template | 22,624 bytes vs the 262,144-byte lint cap |

---

## Known, not fixed

- **Opaque logos still print a faint rectangle.** The letterhead watermark renders the
  organisation's logo at 4% opacity. If the logo is an opaque PNG/JPEG rather than a
  transparent one, its background plate is faintly visible behind the body text. The CSS
  fix for this (`mix-blend-mode: multiply`) was tried and **reverted**: it makes Chromium
  rasterise the entire sheet, so the PDF loses every text object and becomes unsearchable
  and unselectable. This needs a product decision — either enforce/convert transparency at
  logo upload, or draw the watermark from the organisation's name instead of its logo.
- **Non-Latin names will not render in production.** The renderer's font layer contains
  only Open Sans, which has no Devanagari or Tamil coverage, so a non-Latin employee name
  renders as tofu. A local render looks fine because Windows substitutes a fallback font —
  do not judge this from a local render. Fixing it means adding a font to the Lambda layer.
- **No page numbering.** Multi-sheet letters carry no "Page 1 of 2". This is reachable
  without a renderer deploy (the renderer allowlists `footerTemplate` from each template's
  `pdf_config`), but page margins are `0mm` with all margin held in the page's own padding,
  so switching on a printed footer shifts every letter's geometry and all 15 goldens.
  Deferred as a deliberate decision, not an oversight.
