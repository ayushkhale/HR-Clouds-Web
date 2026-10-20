# Backend Update Record: CTC-Inclusive Balancing & Statutory Precision Engine

**Date:** 2026-10-19  
**Author:** Senior Principal Backend Engineer  
**Status:** Implemented & Verified in Production Test Suite  
**Affects:** Salary Structure Template Preview, Salary Structure Assignment, Statutory Breakdown Projections  

---

## 1. Executive Summary

When creating or previewing a CTC-inclusive salary structure (Option A: strict budget ceiling, where the entered CTC is the hard upper limit), users observed a warning banner in the UI:
> *"Costs ₹1,81,959.72 — ₹1,959.72 a year more than the ₹1,80,000 entered (1.1% over). The balancing component takes whatever is left of the CTC, so the whole CTC becomes gross pay and the employer's share is added on top of it."*

We investigated the arithmetic engine and discovered that while the backend supported CTC-inclusive statutory reservation for fixed components (Basic, HRA, etc.), it excluded the **balancing component itself** (`SPECIAL_ALLOWANCE`) when calculating the employer statutory reserve. Because `SPECIAL_ALLOWANCE` carries `esi_applicable: true` in the catalog (as required by Section 2(22) of the Indian ESI Act), the employer ESI on the balancing allowance ($₹5,025.00 \times 3.25\% = ₹163.31/\text{month}$) was never carved out of the CTC and leaked into `ctc_cost` as an unreserved expense added on top of the salary.

We updated `src/modules/payroll/utils/component_evaluator.utils.js` to algebraically account for statutory liabilities of the balancing component itself and aligned `annual_ctc_check` with the reconciled CTC.

---

## 2. Technical Root Cause Analysis

### The Arithmetic Leak

1. **Entered CTC:** ₹1,80,000/year (₹15,000/month).
2. **Fixed Components:**
   - Basic (40%): ₹6,000.00/month (PF: Yes, ESI: Yes).
   - HRA (20%): ₹3,000.00/month (PF: No, ESI: No).
3. **Statutory Reserve Computed Previously:**
   - Employer PF (12% of Basic): ₹720.00
   - EDLI (0.5% of Basic): ₹30.00
   - Admin Charge (0.5% of Basic): ₹30.00
   - Employer ESI on Basic (3.25% of ₹6,000): ₹195.00
   - **Total Fixed Reserve:** ₹975.00/month.
4. **Balancing Component Sizing (Previous):**
   $$\text{Special Allowance} = ₹15,000 - ₹9,000 - ₹975 = \mathbf{₹5,025.00/\text{month}}$$
5. **The Breakdown Mismatch:**
   - `SPECIAL_ALLOWANCE` has `esi_applicable: true`.
   - When the breakdown service computed ESI, it calculated:
     $$\text{ESI Base} = \text{Basic (₹6,000)} + \text{Special Allowance (₹5,025)} = \mathbf{₹11,025.00}$$
     $$\text{Employer ESI (3.25\% of ₹11,025)} = \mathbf{₹358.31/\text{month}}$$
   - Because the evaluator only reserved **₹195.00**, there was an unreserved shortfall of:
     $$₹358.31 - ₹195.00 = \mathbf{₹163.31/\text{month}} \quad (\times 12 = \mathbf{₹1,959.72/\text{year}})$$
   - That shortfall was added on top of Gross Pay, pushing `ctc_cost` to **₹15,163.31/month (₹181,959.72/year)**.

---

## 3. What Was Changed in the Backend

### File: `src/modules/payroll/utils/component_evaluator.utils.js`

1. **Balancing Tier Statutory Accounting:**
   - If the balancing component carries `esi_applicable: true` or `pf_applicable: true` and the statutory head is enabled in `statutoryConfig`, the evaluator calculates the effective employer statutory rate $r$ applying to the balancing plug.
   - Using closed-form algebraic reservation:
     $$S_{\text{candidate}} = \frac{\text{Remaining Budget}}{1 + r}$$
   - The combined monthly base (`pfBaseMonthly` and `esiBaseMonthly`) is passed into `computeEmployerReservationMonthly()` to evaluate the exact employer statutory reserve under statutory ceilings, thresholds, and rounding rules.
   - Sizing the balancing component as:
     $$\text{annualPaise} = \text{annualCtcPaise} - \text{others} - \text{employerReserveAnnualPaise}$$
   - A deterministic 1-pass boundary check ensures exact paise-level alignment.

2. **Reconciliation Check (`annualCtcCheck`):**
   - In CTC-inclusive mode, `ctcParts` equals the gross components (`annualCtcPaise - employerReserveAnnualPaise`).
   - Previously, `annualCtcCheck` returned `fromPaise(ctcParts)` (e.g. `"168300.00"`), which gave the appearance of a discrepancy against `annual_ctc: "180000.00"`.
   - Updated to:
     ```javascript
     annualCtcCheck: fromPaise(ctcParts + employerReserveAnnualPaise)
     ```
     Now `annual_ctc_check` returns `"180000.00"` in CTC-inclusive mode and matches `annual_ctc` exactly.

---

## 4. Frontend Integration & Impact Guide

### ⚠️ Are There Any Breaking Changes to Response Fields?
**NO.** The response JSON schema, field names, and data types remain **100% identical**. No frontend TypeScript interfaces or API response parsers need to be updated.

### Summary of Values Before vs. After (Sample CTC = ₹1,80,000)

| Field Path | Previous Value (With Overrun) | New Value (Exact CTC-Inclusive) | Explanation |
| :--- | :--- | :--- | :--- |
| `data.annual_ctc` | `"180000.00"` | `"180000.00"` | Unchanged (entered CTC). |
| `data.annual_ctc_check` | `"168300.00"` | `"180000.00"` | **Fixed**: Now matches `annual_ctc` exactly. |
| `data.reconciled` | `true` | `true` | Preserved. |
| `data.monthly_gross` | `"14025.00"` | `"13866.83"` | Absorbs the employer ESI on the balancing allowance. |
| `data.annual_gross` | `"168300.00"` | `"166401.96"` | Monthly gross $\times 12$. |
| `data.lines[SPECIAL_ALLOWANCE].monthly_amount` | `"5025.00"` | `"4866.83"` | Precisely sized ($5,025 / 1.0325$). |
| `data.lines[SPECIAL_ALLOWANCE].annual_amount` | `"60300.00"` | `"58401.96"` | Monthly amount $\times 12$. |
| `statutory_breakdown.figures.monthly_gross` | `"14025.00"` | `"13866.83"` | Matches `data.monthly_gross`. |
| `statutory_breakdown.figures.total_employer_contributions` | `"1138.31"` | `"1133.17"` | PF (780.00) + ESI (353.17). |
| `statutory_breakdown.figures.ctc_cost` | **`"15163.31"` (Leaked)** | **`"15000.00"` (Exact)** | **Fixed**: $₹15,000 \times 12 = \mathbf{₹1,80,000.00}$ (0 paise error). |

### Frontend UI Behavior Note:
- If your frontend UI displays an alert or warning banner comparing `figures.ctc_cost * 12` against `annual_ctc`, **the warning banner will now automatically disappear** because `ctc_cost * 12` equals `annual_ctc` down to the exact paise.

---

## 5. Verification & Test Suite

The following test suites were executed and verified:
1. `tests/unit/payroll/component_evaluator.test.js`:
   - `CTC-inclusive: balancing component with esi_applicable: true reserves its own ESI with zero budget overrun` (PASSED).
   - All 18 unit tests passing.
2. `tests/unit/payroll/preview_template_statutory_breakdown.test.js`:
   - `CTC-inclusive preview with ESI-applicable balancing component reconciles to exactly CTC/month with zero overrun` (PASSED).
   - All 3 integration tests passing.
3. `tests/unit/payroll/salary_structure_statutory_breakdown.test.js`:
   - All 3 dynamic statutory breakdown tests passing.
4. Full payroll test suite:
   - 1017 passing tests, 0 failures.
