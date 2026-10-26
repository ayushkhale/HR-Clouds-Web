# Branding Asset 2MB Cap & Letterhead Sizing / Layout Enhancements

**Date:** 2026-10-08  
**Scope:** Document Module (`letter-templates`), Payroll Module (`payslip.service`), Branding Upload API (`#132`, `#133`)

---

## 1. Overview & Problem Statement
When HR users uploaded organizational branding assets (logo, seal, digital signature):
1. The previous upload limit capped logos at 512 KB and signatures at 256 KB. High-resolution seal/signature scans often exceed 500 KB to 1 MB, triggering `413 FILE_TOO_LARGE`.
2. The letterhead logo was constrained to `max-height: 48px`, making company logos look diminutive relative to the multi-line address header.
3. The seal and signature block was constrained to a fixed `height: 44px`. For circular stamps / rubber seals (1:1 aspect ratio), this scaled stamps down to only $1.16\text{ cm} \times 1.16\text{ cm}$, rendering seal text unreadable.
4. On standard appointment letters, the signature block sat floating in the middle-lower body with only `16px` of top margin, leaving a large empty gap at the bottom of the A4 page.

---

## 2. Changes Made

### A. Upload Size Limits Raised to 2 MB
* In `src/modules/document/services/document_letter_branding.service.js`:
  - `ASSET_SIZE_CAPS.logo` raised to `2 * 1024 * 1024` (2 MB / 2,097,152 bytes).
  - `ASSET_SIZE_CAPS.signature` raised to `2 * 1024 * 1024` (2 MB / 2,097,152 bytes).
  - `INLINE_ASSET_MAX_BYTES` raised to `2 * 1024 * 1024` (ensuring images up to 2 MB are inlined as base64 data URIs for self-contained, offline-safe PDF rendering).
* In `src/modules/payroll/services/payslip.service.js`:
  - `INLINE_BRANDING_ASSET_MAX_BYTES` raised to `2 * 1024 * 1024` (matches 2 MB limit for payslips, Form 16, and statements).

### B. Image Sizing & Layout Improvements
* **Document Letters (`src/modules/document/letter-templates/_partials/base.css.html`):**
  - **Logo Sizing:** `.letterhead .logo` increased from `max-height: 48px; max-width: 200px;` to `max-height: 62px; max-width: 220px;` (~30% increase in height, ~70% increase in area).
  - **Seal / Signature Sizing:** `.signature-block .sign-img` and `.sign-space` increased from `height: 44px;` to `height: 64px; max-width: 100%;` (~45% linear increase, >2x surface area for clear stamp legibility).
  - **Symmetrical Acceptance Column:** `.sign-row .sign-space` set to `64px` so the employee acceptance column line perfectly aligns horizontally with the authorized signatory line.
  - **Bottom Positioning:** `.sign-row` and `.body + .signature-block` margin-top increased to `20mm` (~2.0 cm), pushing the signing panel down near the bottom of standard letters.
  - **Footer Placement:** `.footer` margin-top set to `10mm`, anchoring the document close to the bottom paper edge.
* **Payroll Templates (`src/modules/payroll/pdf-templates/_partials/base.css.html` & `fnf_statement/v1.html`):**
  - **Full Structural Parity:** All 4 executive payroll templates (`payslip`, `form16_part_b`, `fnf_statement`, `annual_statement`) consume the same unified sizing and bottom alignment.
  - **Logo Sizing:** `.letterhead .logo` increased to `max-height: 56px; max-width: 220px;`.
  - **Seal / Signature Sizing:** `.signature-block .sign-img` and `.sign-space` increased to `height: 56px;` (up from 38px, giving stamps ~47% linear enlargement and double the surface area).
  - **Bottom Placement:** `.bottom-split` margin-top set to `18mm`, and `.footer` margin-top set to `8mm`.
  - **F&F Settlement (`fnf_statement`):**
    - The signature panel (`.fnf-sign`) now has `margin-top: 18mm;` (up from 10px / `var(--gap-panel)`), positioning it towards the bottom of the page.
    - Reserved signing space (`.fnf-sign-space`) increased to `56px` (up from 44px).
    - The Authorised Signatory column now renders `branding.signature_src` (`height: 56px`) if an organization has configured a digital signature/seal asset, while preserving the Employee Acknowledgement column for physical/counter signature.
    - Page break guards (`page-break-inside: avoid; break-inside: avoid; page-break-before: avoid; break-before: avoid;`) are applied to prevent the settlement signing table from splitting across sheets.

### C. Multi-Page Safety Protections
* Strengthened page-break guards with `break-inside: avoid;` and `page-break-inside: avoid;` across:
  - Both Document letters and Payroll templates (`.signature-block`, `.sign-row`, `.bottom-split`, `.footer`).
  - `.sign-row > .signature-block` and `.sign-row > .ack-signature` in letters.
  - Guarantees company signatory and employee acceptance columns never break onto separate pages.
  - `.sign-row` and `.signature-block` retain `page-break-before: avoid; break-before: avoid;` coupled with preceding body guards, guaranteeing that the signature block never appears orphaned alone on a subsequent sheet.

---

## 3. Frontend Integration Guidance
1. **File Upload Validator:** Frontend forms can now permit file uploads up to `2 MB` (2,097,152 bytes) for both the organization logo and the authorized signatory / seal asset.
2. **Recommended Asset Format:**
   - **Logo:** PNG with transparent background, recommended height ~200px - 400px.
   - **Seal & Signature:** Transparent PNG, cropped tightly to the outer ink boundaries (no excess white margin). Recommended dimensions: $600 \times 200\text{ px}$ (aspect ratio 2.5:1 to 3:1) with the rubber stamp on the left and handwritten signature on the right.
