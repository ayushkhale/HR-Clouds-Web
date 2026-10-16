# Senior Backend Architecture & Implementation Plan: Aligning Payslip UI/UX with Document Letter Templates

**Document Date:** October 7, 2026  
**Status:** Architecture Blueprint & Implementation Specification  
**Modules Affected:**  
- Payroll PDF Engine (`src/modules/payroll/pdf-templates/`, `src/modules/payroll/services/payroll_pdf.service.js`)  
- Document Branding Bridge (`src/modules/document/services/document_letter_branding.service.js`)  
- View Model Builders (`src/modules/payroll/utils/pdf/views/payslip_view.utils.js`)  
**Audience:** Senior Backend Engineers, Full-Stack Engineers, AI Implementation Agents  

---

## 1. Problem Statement & Architectural Goal

### 1.1 The Disconnect
Currently, all official organization letters (Appointment Letters, Offer Letters, Experience Certificates, Salary Revision Letters) in [`src/modules/document/letter-templates/`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/document/letter-templates) share a unified, premium corporate identity:
* Official company letterhead with high-resolution logo (`branding.logo_src`)
* Custom corporate brand accent colors (`--primary: {{branding.accent_color}}`)
* Standardized metadata badges, cards, and callout blocks
* Formal authorized signatory block (`signatures.html`) with digital seal and signature images
* Standardized typography (`base.css.html`) and A4 margins

In contrast, the **Payslip** (`src/modules/payroll/pdf-templates/payslip/v1.html`) was historically built as an isolated, monochrome, black-and-white accounting table:
* No company logo image (only plain text employer name)
* Zero brand colors (hardcoded ink-monochrome grey `#111827`)
* Hairline raw table borders that look unpolished compared to letter templates
* No signatory block or digital seal stamp

### 1.2 The Goal
Refactor the **Payslip template and rendering pipeline** so that the payslip PDF **matches the exact UI/UX structure, branding, letterhead, typography, and visual excellence** of the Document Module letter templates, while strictly preserving all financial snapshot data and calculations.

---

## 2. Architectural Design & Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                    Payroll Publish / Read                   │
│   (payslips.snapshot: earnings, deductions, net_pay, etc.)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Payroll PDF Service (payroll_pdf.service.js)    │
│  1. Injects Organization Branding (document_letter_branding)│
│  2. Resolves S3 Presigned / Data URIs for Logo & Signature  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│         Payslip View Builder (payslip_view.utils.js)        │
│  Constructs unified View Model:                             │
│  { branding, header, employer, identity_grid, earnings, ... }│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│         Payroll PDF Template Engine (payslip/v1.html)       │
│  Uses standardized partials:                                │
│  - <!--#include partial="base.css" -->                      │
│  - <!--#include partial="letterhead" -->                    │
│  - Professional Earnings / Deductions / Hero Net Pay        │
│  - <!--#include partial="signature_block" -->               │
│  - <!--#include partial="footer" -->                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Headless Chromium Microservice                │
│             Generates Premium Branded A4 PDF                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component-by-Component Implementation Plan

### Step 1: Branding Bridge in `payroll_pdf.service.js`
* **File:** [`src/modules/payroll/services/payroll_pdf.service.js`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_pdf.service.js)
* **Objective:** Allow the payroll renderer to fetch the organization's letterhead branding without creating circular dependencies.
* **Execution:**
  1. Load the organization's branding row via `documentLetterBrandingRepo.findByOrgId(orgId)`.
  2. If branding exists and `letterhead_enabled !== false`:
     * Resolve asset source URLs (`logo_src`, `signature_src`, `seal_src`) using `documentLetterBrandingService.resolveAssetSrcs(brandingRow)`.
     * Merge with the organization's profile (`org_name`, registered address, CIN, GSTIN, PAN, TAN).
     * Construct the `branding` object using `resolveBranding(profile, brandingRow, assetSrcs)`.
  3. If branding is not configured, supply a safe fallback (using `employer.name` and default dark accent) so existing rendering never breaks.

### Step 2: View Model Enrichment in `payslip_view.utils.js`
* **File:** [`src/modules/payroll/utils/pdf/views/payslip_view.utils.js`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/utils/pdf/views/payslip_view.utils.js)
* **Objective:** Pass the `branding` object through to the template and format additional presentation helpers.
* **Execution:**
  1. Accept `branding` in `buildPayslipView(snapshot, publishedAt, branding = null)`.
  2. Attach `branding` to the root view model (`vm.branding = branding || fallbackBranding`).
  3. Add `net_pay_in_words` (e.g. *"Rupees Fifty-Two Thousand Eight Hundred Only"*) to provide official bank/legal certification on the payslip.
  4. Format attendance summary badges (`paid_days`, `lop_days`, `total_days`).

### Step 3: Aligning Partials in `src/modules/payroll/pdf-templates/_partials/`
* **Files:**
  * [`src/modules/payroll/pdf-templates/_partials/base.css.html`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/pdf-templates/_partials/base.css.html) (new or upgraded `head.html`)
  * [`src/modules/payroll/pdf-templates/_partials/letterhead.html`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/pdf-templates/_partials/letterhead.html) (new)
  * [`src/modules/payroll/pdf-templates/_partials/signature_block.html`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/pdf-templates/_partials/signature_block.html) (new)
  * [`src/modules/payroll/pdf-templates/_partials/footer.html`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/pdf-templates/_partials/footer.html) (new)
* **Objective:** Replicate the styling tokens of `document/letter-templates/_partials/` into the payroll template subsystem.
* **Execution:**
  1. Add CSS root variables:
     ```css
     :root {
       --primary: {{branding.accent_color}};
       --primary-ink: #111827;
       --ink: #111827;
       --text: #1f2937;
       --muted: #4b5563;
       --rule: #d1d5db;
       --rule-soft: #e5e7eb;
     }
     ```
  2. Implement the standard corporate letterhead layout (Logo on left, Company Legal Details and Address on right, hairline divider with CIN/GSTIN).
  3. Implement the signature block with support for signatory name, designation, and signature image.

### Step 4: Redesigning `payslip/v1.html`
* **File:** [`src/modules/payroll/pdf-templates/payslip/v1.html`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/pdf-templates/payslip/v1.html)
* **Objective:** Transform the payslip into a stunning, executive-ready document matching the UI/UX of official letters.
* **New Layout Structure:**
  1. `<!--#include partial="base.css" -->`
  2. `<!--#include partial="letterhead" -->`
  3. **Document Title Banner:**
     * Eyebrow: `CONFIDENTIAL SALARY STATEMENT`
     * Title: `Salary Payslip`
     * Subtitle / Period: `For the month of {{header.subtitle}}`
     * Badges: `[Private & Confidential]`
  4. **Employee Verification Grid (3-column Modern Fact Cards):**
     * Employee Name, Employee ID, Designation, Department
     * Date of Joining, Bank Name, Bank Account (Masked), IFSC
     * PAN, UAN, Total Days in Month, Paid Days, LWP Days
  5. **Financial Breakdown (Structured Modern Tables):**
     * Side-by-side or stacked Earnings and Deductions cards
     * Clear currency formatting (`₹ 60,000.00`)
     * Employer contributions clearly designated
  6. **Net Take-Home Pay Callout ("Amount Hero" Card):**
     * Large highlighted card with `--primary` border and soft background
     * Net Amount figure prominently centered (`₹ 52,800.00`)
     * Amount in words formatted underneath
  7. **Sign-off / Verification Block:**
     * Authorized signatory signature image / company stamp
     * Statutory audit note: *"This is an electronically generated salary payslip issued by {{branding.org_name}}."*
  8. `<!--#include partial="footer" -->` with page numbering and template marker.

### Step 5: Updating Registry & Unit Tests
* **Files:**
  * [`src/modules/payroll/pdf-templates/registry.js`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/pdf-templates/registry.js)
  * [`tests/unit/pdf/payroll_pdf_templates.test.js`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/tests/unit/pdf/payroll_pdf_templates.test.js)
* **Execution:**
  1. Add `branding` to `required_fields` or `optional_fields` in `registry.js`.
  2. Update sample view model in `registry.js` with mock `branding` data.
  3. Run `node --test tests/unit/pdf/payroll_pdf_templates.test.js` to ensure 100% tests pass.

---

## 4. Master Prompt for AI Implementation Agent

The following ready-to-run prompt can be copied and provided to any AI agent (or executed directly) to carry out the entire task with senior-grade precision:

```markdown
### TASK: ALIGN PAYSLIP PDF TEMPLATE WITH DOCUMENT MODULE LETTER TEMPLATES

You are acting as a Senior UI/UX Designer and Principal Backend Software Engineer.
Your objective is to upgrade the Salary Payslip PDF template in the Payroll module so that its visual design, typography, letterhead, and branding EXACTLY match the organization letter templates in `src/modules/document/letter-templates/`.

#### CONTEXT & CODEBASE LOCATIONS:
1. Target Payslip Template: `src/modules/payroll/pdf-templates/payslip/v1.html`
2. Target Partials: `src/modules/payroll/pdf-templates/_partials/` (`head.html`, `money_table.html`, `page_frame.html`)
3. Target Registry: `src/modules/payroll/pdf-templates/registry.js`
4. Target View Model Builder: `src/modules/payroll/utils/pdf/views/payslip_view.utils.js`
5. Target Render Service: `src/modules/payroll/services/payroll_pdf.service.js`
6. Reference Design Standards:
   - `src/modules/document/letter-templates/_partials/base.css.html`
   - `src/modules/document/letter-templates/_partials/letterhead.html`
   - `src/modules/document/letter-templates/_partials/signature_block.html`
   - `src/modules/document/letter-templates/_partials/footer.html`
   - `src/modules/document/letter-templates/salary_certificate/v1.html`

#### DETAILED REQUIREMENTS:

1. BRANDING INTEGRATION:
   - In `src/modules/payroll/services/payroll_pdf.service.js`, resolve the organization's branding using the existing `document_letter_branding` repository/service or organization profile.
   - Inject the resolved `branding` object (`org_name`, `logo_src`, `accent_color`, `address_lines`, `contact_email`, `contact_phone`, `website`, `identifiers`, `signatory_name`, `signatory_designation`, `signature_src`, `letterhead_enabled`, `footer_note`) into the payslip rendering pipeline.
   - Maintain a robust fallback so that if an organization has not configured letter branding, the payslip falls back cleanly to the snapshot employer details without crashing.

2. CSS & DESIGN SYSTEM ALIGNMENT:
   - Update `src/modules/payroll/pdf-templates/_partials/head.html` (or create `base.css.html`) to incorporate the design tokens from `src/modules/document/letter-templates/_partials/base.css.html`:
     - `--primary: {{branding.accent_color}}`
     - Typography (Open Sans, crisp font scales, clean line heights)
     - Professional borders, soft dividers, table headers, and badges (`pill-danger`, `pill-success`)
     - Print-safe page-break guards (`page-break-inside: avoid;` on table rows, cards, net pay banner, and signature block)

3. TEMPLATE REDESIGN (`payslip/v1.html`):
   - Include standard partials: `letterhead.html`, `signature_block.html`, and `footer.html`.
   - Add a sleek Document Header with eyebrow, document title ("SALARY PAYSLIP"), pay period subtitle, and a "Private & Confidential" pill badge.
   - Redesign the employee identity grid into a modern multi-column card layout (`.fact-grid` or styled table) covering: Employee Name, Employee ID, Designation, Department, Date of Joining, Bank Details, PAN, UAN, Days in Month, Paid Days, and LWP.
   - Modernize the Earnings and Deductions tables with styled table headers, clean borders, and proper number formatting.
   - Implement an `.amount-hero` card for the Net Pay section highlighting the final take-home figure with brand accent border and amount in words.
   - Include the authorized signature block / digital verification stamp at the bottom.

4. VIEW MODEL & REGISTRY UPDATES:
   - Update `src/modules/payroll/utils/pdf/views/payslip_view.utils.js` to accept `branding` and pass it to the view model. Add `net_pay_in_words` conversion if not already present.
   - Update `src/modules/payroll/pdf-templates/registry.js` so that `branding` is properly declared and sample fixtures are updated.

5. QUALITY & REGRESSION TESTING:
   - Run the unit tests: `node --test tests/unit/pdf/payroll_pdf_templates.test.js`.
   - Ensure all existing assertions pass and update view model tests to verify branding integration.
   - Verify that generated PDFs fit neatly on A4 paper without awkward orphan pages or broken footers.
```
