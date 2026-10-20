# Payroll PDFs — Visual Refresh (change record)

**Date:** 2026-10-02
**Module:** Payroll → PDF documents
**Audience:** Frontend / API consumers
**Endpoints touched:** none. **Frontend action:** none.

---

## 1. What changed

All six payroll PDF templates now use the same design as the letter templates (`2026-10-02_letter_template_visual_refresh.md`):

- payslip
- annual salary statement
- Form 16 Part B
- payroll register report
- salary disbursement (bank) advice
- payroll F&F settlement statement

The design is monochrome, because payroll documents have no branding accent. It uses:

- a ruled employer header, with the address lines on one wrapping strip;
- a centred, tracked title;
- a boxed two-column employee/reference grid;
- table headers in white on dark;
- one dark net-pay block per document;
- a ruled footer.

This is a **visual change only**:

| Area | Change |
| --- | --- |
| Endpoints, query parameters, response headers, file names | None |
| View-model fields, figures, labels, wording | None |
| Template versions (`v1`) and error codes | None |
| CSV exports | None |

## 2. Effect on documents

- **Already-cached payslip PDFs keep their old design.** The PDF cache key depends on the payslip, its snapshot and the template version, not on the template's look, so a cached PDF is served as before. Payslips rendered from now on, and documents generated on each download (annual statement, Form 16, bank advice, F&F statement, payroll register), use the new design. For a while, an employee may see old and new payslip designs side by side.
- Table text is larger and easier to read: 7–8pt, up from about 6–7pt. With many rows, a long bank advice or Form 16 can run to an extra page. Single-page documents stay single-page.
- **Bank advice: the TOTAL row now prints once, at the end.** Previously, on a multi-page advice the "TOTAL (N records)" grand total printed at the bottom of every page, under that page's partial list, where it read like a page total. The column headers still repeat on every page. The authorised-signatory block is now kept together with the TOTAL row, so it can never land alone on the last page.
- Continuation pages of a long payslip now keep the top margin. Previously, text on page 2 started at the very edge of the sheet.

## 3. Frontend checklist

- [ ] Nothing to change. PDF downloads and previews work as before.
