# Salary Structure & Template Preview Updates (2026-09-20)

**Target Audience:** Frontend Engineers, QA, API consumers  
**Auth:** `hr` / `manager` / `employee` roles  
**Status:** ✅ Backend shipped and correct. **Frontend display/labelling fixes and API request updates are required.**

This document merges the API changes to the template preview endpoint and the UI fixes required for salary structure figures and take-home labelling.

---

## 1. Overview of Changes

1. **API Breaking Change:** `POST /api/v1/payroll/hr/structure-templates/:id/preview` now requires `user_id` and returns a full `statutory_breakdown` block.
2. **UI Data Sourcing & Labelling Bug:** The Salary tab is showing incorrect take-home amounts due to conflating Gross with Net Pay and rendering stale cached data.
3. **Revise Form Updates:** The assignment/revise flow must now use the updated preview endpoint to show accurate statutory breakdowns *before* assignment.

---

## 2. API Change: Template Preview Endpoint

**Endpoint:** `POST /api/v1/payroll/hr/structure-templates/:id/preview`

### 2.1 Request — `user_id` is now REQUIRED

Because PT depends on the employee's **work state** and TDS depends on their **tax declarations**, the preview must know *who* it is for.

```json
POST /api/v1/payroll/hr/structure-templates/:id/preview
{
  "annual_ctc": "1500000",
  "user_id": "936dfc38-4c48-469c-8e88-f3f2604b2a9e"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `annual_ctc` | positive money-like | ✅ | The CTC to evaluate. |
| `user_id` | UUID | ✅ **(new)** | The employee the breakdown is for. **Org‑scoped**: a `user_id` outside the caller's org → `404 EMPLOYEE_NOT_FOUND`. |

> ⚠️ **Frontend action required:** send `user_id` on every preview call. On the Revise/Assign flow this is the employee whose salary tab you are on. Without it the request now fails validation.

### 2.2 Response — new `statutory_breakdown` block

The response gains `user_id` (echoed back) and a `statutory_breakdown` object **identical in shape** to `GET /api/v1/payroll/me/salary-structure`. This ensures the panel HR sees before assigning matches the one the employee sees after.

```jsonc
{
  "success": true,
  "data": {
    "template_id": "cf0c5cec-a63e-4c64-b250-83d261106eb0",
    "user_id": "936dfc38-4c48-469c-8e88-f3f2604b2a9e",
    "annual_ctc": "1500000.00",
    "monthly_gross": "125000.00",
    "annual_gross": "1500000.00",
    "annual_ctc_check": "1500000.00",
    "reconciled": true,
    "gross_definition": "percent_of_gross resolves against the subtotal of earnings from tiers 1–3 ...",
    "lines": [
      {
        "component_id": "d5f49e1a-8c11-4a12-8e12-b1e1a1234567",
        "component_code": "BASIC",
        "name": "Basic Salary",
        "calculation_type": "flat",
        "value": "50000.00",
        "monthly_amount": "50000.00",
        "annual_amount": "600000.00",
        "is_taxable": true,
        "pf_applicable": true,
        "esi_applicable": true
      }
      // ... other components
    ],
    "statutory_breakdown": {
      "status": "estimated",
      "pf_wage": "15000.00",
      "esi_wage": "0.00",
      "taxable_earnings": "125000.00",
      "esi_covered": false,
      "pf_employee_amount": "1800.00",
      "pf_employer_amount": "1800.00",
      "eps_amount": "1249.50",
      "esi_employee_amount": "0.00",
      "esi_employer_amount": "0.00",
      "professional_tax_amount": "200.00",
      "income_tax_amount": "0.00",
      "statutory_snapshot": {
        "v": 4,
        "pf": {}, 
        "esi": {}, 
        "pt": {}, 
        "tax": {}, 
        "warnings": []
      },
      "figures": {
        "monthly_gross": "125000.00",
        "total_deductions": "2000.00",
        "total_employer_contributions": "1800.00",
        "net_pay": "123000.00",
        "ctc_cost": "125000.00"
      }
    }
  }
}
```

**Note on `status: "estimated"`:**
The breakdown is a projection based on live config and current tax declarations. It is an accurate *estimate*, not a persisted/frozen snapshot.

---

## 3. UI Fixes: Data Sourcing & Labelling

The Salary tab UI currently has a labelling and data-sourcing bug where "Gross" is labelled as "Take-home", and stale amounts are being rendered. 

### 3.1 Canonical field → label mapping

Use these labels everywhere (current view, revise form summary, and pre‑assignment preview). 

| UI Label | Source field | Notes |
| :--- | :--- | :--- |
| **Cost to Company (CTC), annual** | `data.annual_ctc` | The agreed CTC. |
| **CTC / month** | `annual_ctc ÷ 12` | Derived; do **not** call this take‑home. |
| **Gross (monthly)** | `data.monthly_gross` = `figures.monthly_gross` | Sum of earnings, **before** deductions. |
| **Employee Deductions** | `figures.total_deductions` | Employee PF + ESI + PT + TDS. |
| **Net Take‑Home (In‑Hand)** | `figures.net_pay` | ✅ This is the actual take‑home. |
| **Employer Contributions** | `figures.total_employer_contributions` | Employer statutory contributions. Part of CTC, not paid to the employee. |
| **Total Cost to Company (computed)** | `figures.ctc_cost` | Should equal **CTC/month**. |

> **Rule:** Take‑home is `net_pay`. Gross is `monthly_gross`. CTC is `annual_ctc`. Do not conflate the three.

### 3.2 Handling stale data and balancing components

1. **Always use freshly-fetched data:** After a revise/approve, **refetch** `.../salary-structures/current`. Never keep numbers computed from a prior version in component state.
2. **Balancing components:** For `calculation_type: "balancing"`, `value` is a stored rule input, **not** the resolved amount. **Always display `monthly_amount` / `annual_amount`, never `value`, for balancing rows.**

---

## 4. Add a "recalculation pending" banner (stale structure detection)

For older structures predating the **CTC-inclusive** model, the employer contributions were not carved out of the CTC, so `ctc_cost` will not equal `annual_ctc ÷ 12`.

**Detection (client‑side):**

```ts
const monthlyCtcPaise = Math.round(Number(data.annual_ctc) * 100 / 12);
const ctcCostPaise   = Math.round(Number(data.statutory_breakdown.figures.ctc_cost) * 100);
const needsRecalc = Math.abs(ctcCostPaise - monthlyCtcPaise) > 1; // >1 paise tolerance
```

When `needsRecalc` is true, show a non‑blocking banner:
> ⚠️ *This salary structure was created under the previous cost model and is pending recalculation. The figures below may not reflect the final cost‑to‑company. Re‑save (revise) the structure to refresh it.*

---

## 5. The Revise Form + Pre‑Assignment Breakdown

Flow: **Salary tab → Revise → form opens → fill CTC + components → breakdown shown → confirm assignment.**

1. **Drive the breakdown from the backend, not the client.** Before assignment, call the updated **preview** endpoint (`POST /structure-templates/:templateId/preview` with `{ annual_ctc, user_id }`) and render its returned `lines` + figures. Do not re‑implement math in the UI.
2. **The Special Allowance (balancing) amount is backend‑computed.** In the form, render it **read‑only** and populate it from the preview response’s `SPECIAL_ALLOWANCE` line `monthly_amount`. Never let the user type it.
3. **Show the same six canonical figures** in the confirmation panel as defined in Section 3.1.
4. **Validate before enabling "Assign":** the preview’s `reconciled` flag must be `true`, and `Total CTC (ctc_cost) === CTC/month` (with 1 paise tolerance). If not, block submission and surface the backend error message (e.g. `CTC_BELOW_FIXED_COMPONENTS`).
5. **After successful assign/approve:** refetch `current` and re‑render.

---

## 6. API Error Codes (Preview)

| HTTP | Code | When |
| :--- | :--- | :--- |
| 400 | validation | `user_id` missing/not a UUID, or `annual_ctc` missing/non‑positive. |
| 404 | `EMPLOYEE_NOT_FOUND` | `user_id` is not an employee/manager/HR profile in the caller's org. |
| 404 | `TEMPLATE_NOT_FOUND` | Unknown template id. |
| 422 | `TEMPLATE_HAS_NO_COMPONENTS`, `STATUTORY_COMPONENT_NOT_ASSIGNABLE`, `NO_BASIC_COMPONENT`, `INVALID_PERCENTAGE`, `CTC_BELOW_FIXED_COMPONENTS`, `CTC_RECONCILIATION_FAILED`, `MULTIPLE_BALANCING_COMPONENTS`, `NO_EARNING_COMPONENTS` | Evaluator / template guards. |

---

## 7. QA & Acceptance Checklist

### API & Backend
- [ ] Preview call without `user_id` → 400 validation error.
- [ ] Preview with a `user_id` from another org → 404 `EMPLOYEE_NOT_FOUND`.
- [ ] Preview response shape matches `GET /me/salary-structure` `statutory_breakdown` (same keys).

### Frontend UI & Data Sourcing
- [ ] Only `figures.net_pay` is labelled “Take‑home / In‑hand”; `monthly_gross` is labelled “Gross”; `annual_ctc` is labelled “CTC”.
- [ ] No screen shows a salary figure sourced from anything other than the latest fetched `current` (or `preview`) response.
- [ ] The screen refetches `current` after revise/approve.
- [ ] Balancing rows display `monthly_amount`/`annual_amount`, never `value`.
- [ ] “Recalculation pending” banner shows when `ctc_cost ≠ annual_ctc ÷ 12`.
- [ ] Revise form: Special Allowance is read‑only and populated from the preview; “Assign” is blocked unless `reconciled === true` and `ctc_cost === annual_ctc ÷ 12`.
- [ ] Revise/Assign form renders **Net Take‑Home** from `figures.net_pay`, not `monthly_gross`.
- [ ] For a CTC‑inclusive template, `figures.ctc_cost` ≈ `annual_ctc ÷ 12`.
