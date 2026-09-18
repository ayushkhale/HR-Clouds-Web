# Frontend Integration Guide: Dynamic Statutory Breakdown & Net Take-Home Pay

## Document Metadata
* **Status**: Production Ready
* **Target Audience**: Frontend Engineers, Mobile Engineers, QA, Product Team
* **Module**: Payroll Module (`Phase 1` & `Phase 4` cross-plane integration)
* **Date**: September 2026

---

## 1. Executive Summary: What Changed?

### Was a new API created or were existing APIs updated?
> **STATUS: UPDATED (100% Backward Compatible)**
> No existing API routes were broken or removed. No existing fields were renamed or deleted.
> 
> Three existing salary structure read endpoints have been **enriched** with a new dynamic object: **`statutory_breakdown`**.

### Affected Endpoints
| # | Method | Endpoint | Allowed Roles | Plane | Status |
|---|---|---|---|---|---|
| 33 | `GET` | `/api/v1/payroll/me/salary-structure` | Any tenant user (`self`) | Employee Self-Service | **UPDATED** (Enriched with `statutory_breakdown`) |
| 18 | `GET` | `/api/v1/payroll/hr/employees/:userId/salary-structures/current` | `hr` | HR Administration | **UPDATED** (Enriched with `statutory_breakdown`) |
| 29 | `GET` | `/api/v1/payroll/manager/employees/:userId/salary-structures/current` | `manager, hr` | Team Management | **UPDATED** (Enriched with `statutory_breakdown`) |

---

## 2. Why Statutory PF & Tax Cannot Be Hardcoded in the Database

When viewing an employee's salary structure, frontend developers often ask:
*"Why don't we just store 'PF Employee Deduction' or 'Income Tax' as fixed line-items in the `components` list alongside Basic and HRA?"*

Hardcoding statutory deductions into the base database structure breaks labor compliance and tax laws:

1. **Contractual Earnings vs. Statutory Withholdings:**
   - The `components` array contains **contractual earnings for 100% attendance** (Basic, HRA, Conveyance, Allowances).
   - **PF, ESI, PT, and TDS** are **statutory withholdings**, governed by dynamic statutory regulations.
2. **EPF Act (1952) Rules:**
   - Employee PF is 12% of the PF-applicable wage, capped at the statutory ceiling (₹15,000/month → ₹1,800/month maximum) unless configured otherwise by the organization.
   - Employer PF (12%) is not a simple deduction—it is dynamically split by law into **EPS (Pension: 8.33% up to ₹1,250)** and **EPF (Employer: remainder 3.67%)**, plus EDLI and Admin charges.
   - If an employee takes unpaid leave (Loss of Pay / LOP), the PF wage ceiling and deduction are prorated dynamically. Hardcoding a static number causes incorrect deductions or double deductions when actual payroll runs.
3. **Income Tax Act (1961) Section 192 Dynamic True-Up:**
   - Monthly TDS is **never a fixed monthly number**. It is calculated by projecting annual income, subtracting standard deductions (₹50,000 / ₹75,000), applying the employee's elected regime (**Old vs. New Section 115BAC**), factoring in Chapter VI-A investment declarations (80C, 80D), Section 87A rebate, and subtracting YTD tax already deducted in previous months.
4. **Organization-Level Configurations:**
   - Organizations frequently update their statutory configuration (`statutory_configs`), such as toggling the ₹15,000 ceiling, updating State PT slabs, or changing contribution rates. Hardcoding static rows into thousands of employee database records would create massive data corruption whenever policy changes.

### The Architectural Solution:
The backend keeps the database pure and runs pure, deterministic calculations on read. The response includes the existing `components` (earnings) and adds the dynamic **`statutory_breakdown`** object.

---

## 3. Full API Specification & Response Shape

### Endpoint: `GET /api/v1/payroll/me/salary-structure`
* **Headers**:
  * `Authorization`: `Bearer <jwt_token>`
  * `Content-Type`: `application/json`

### Complete Expected Response JSON
```json
{
  "success": true,
  "message": "Salary structure fetched",
  "data": {
    "id": "27567ff1-67ea-4a25-91e5-44124ea5a833",
    "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
    "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
    "template_id": "d8d0c3b7-2e9c-46bb-ab21-5415d4bd1d87",
    "annual_ctc": "350000.00",
    "monthly_gross": "29166.67",
    "currency": "INR",
    "effective_from": "2026-09-15",
    "effective_to": null,
    "version": 3,
    "revision_type": "correction",
    "revision_reason": "Correction",
    "status": "approved",
    "proposed_by": "71639be3-1a97-4408-8bac-5b8039336755",
    "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
    "actioned_at": "2026-09-18T00:43:21.841Z",
    "rejection_reason": null,
    "created_at": "2026-09-18T00:43:21.651Z",
    "updated_at": "2026-09-18T00:43:21.841Z",
    "components": [
      {
        "id": "14f24efb-8afb-47e0-af84-482a47291a2e",
        "component_name": "Basic",
        "component_code": "BASIC",
        "component_type": "earning",
        "calculation_type": "flat",
        "monthly_amount": "14583.33",
        "annual_amount": "174999.96",
        "is_taxable": true,
        "is_lop_applicable": true,
        "pf_applicable": true,
        "esi_applicable": true,
        "is_part_of_ctc": true,
        "display_order": 10
      },
      {
        "id": "c869966b-4e14-419b-b5d1-fe14581f1ba4",
        "component_name": "HRA",
        "component_code": "HRA",
        "component_type": "earning",
        "calculation_type": "flat",
        "monthly_amount": "5833.33",
        "annual_amount": "69999.96",
        "is_taxable": true,
        "is_lop_applicable": true,
        "pf_applicable": false,
        "esi_applicable": true,
        "is_part_of_ctc": true,
        "display_order": 20
      },
      {
        "id": "3e981320-a7d5-455b-bfb4-d5f0b5d5cf38",
        "component_name": "Conveyance",
        "component_code": "CONVEYANCE",
        "component_type": "earning",
        "calculation_type": "flat",
        "monthly_amount": "1600.00",
        "annual_amount": "19200.00",
        "is_taxable": true,
        "is_lop_applicable": true,
        "pf_applicable": false,
        "esi_applicable": true,
        "is_part_of_ctc": true,
        "display_order": 30
      },
      {
        "id": "67fdbdc5-520e-4a6c-9411-cf0da0a6f443",
        "component_name": "Special Allowance",
        "component_code": "SPECIAL_ALLOWANCE",
        "component_type": "earning",
        "calculation_type": "balancing",
        "monthly_amount": "7150.01",
        "annual_amount": "85800.12",
        "is_taxable": true,
        "is_lop_applicable": true,
        "pf_applicable": false,
        "esi_applicable": true,
        "is_part_of_ctc": true,
        "display_order": 90
      }
    ],
    "statutory_breakdown": {
      "status": "estimated",
      "pf_wage": "14583.33",
      "esi_wage": "0.00",
      "taxable_earnings": "29166.67",
      "esi_covered": false,
      "pf_employee_amount": "1750.00",
      "pf_employer_amount": "1750.00",
      "eps_amount": "1214.79",
      "esi_employee_amount": "0.00",
      "esi_employer_amount": "0.00",
      "professional_tax_amount": "0.00",
      "income_tax_amount": "0.00",
      "statutory_snapshot": {
        "v": 4,
        "pf": {
          "enabled": true,
          "wage": "14583.33",
          "employee": "1750.00",
          "employer": "1750.00",
          "eps": "1214.79",
          "epf_employer": "535.21",
          "edli": "72.92",
          "admin_charges": "500.00",
          "restricted": true,
          "ceiling_applied": false,
          "lop_reduces_ceiling": true,
          "employee_rate": "12.00",
          "employer_rate": "12.00"
        },
        "esi": {
          "enabled": false,
          "wage": "0.00",
          "employee": "0.00",
          "employer": "0.00",
          "covered": false,
          "employee_rate": "0.75",
          "employer_rate": "3.25"
        },
        "pt": {
          "enabled": false,
          "state_code": null,
          "amount": "0.00"
        },
        "tax": {
          "enabled": true,
          "regime": "new",
          "annual_taxable_estimate": "350000.00",
          "annual_tax_liability": "0.00",
          "monthly_tds": "0.00"
        },
        "warnings": []
      },
      "figures": {
        "monthly_gross": "29166.67",
        "total_deductions": "1750.00",
        "total_employer_contributions": "1750.00",
        "net_pay": "27416.67",
        "ctc_cost": "30916.67"
      }
    }
  }
}
```

---

## 4. Field Guide for Frontend Developers

### 4.1. Top-Level Summary: `statutory_breakdown.figures`
Use this block to render the primary headline cards/widgets on the Salary Structure page:

| Field | Type | Description | Frontend Display Recommendation |
|---|---|---|---|
| `monthly_gross` | String | Total contractual monthly earnings before any deductions | **Gross Salary** badge (e.g., `₹29,166.67`) |
| `total_deductions` | String | Sum of employee deductions (`pf_employee` + `esi_employee` + `pt` + `monthly_tds`) | **Total Estimated Deductions** (e.g., `₹1,750.00`) |
| `net_pay` | String | Estimated monthly take-home pay (`monthly_gross - total_deductions`) | **Estimated Take-Home (Net Pay)** (e.g., `₹27,416.67`) |
| `total_employer_contributions` | String | Employer's statutory compliance cost (`pf_employer` + `esi_employer`) | **Employer Contributions** (e.g., `₹1,750.00`) |
| `ctc_cost` | String | Total monthly company cost (`monthly_gross + total_employer_contributions`) | **Total Monthly CTC Cost** (e.g., `₹30,916.67`) |

### 4.2. Flat Statutory Head Amounts
These fields match the exact naming used in the Payslip & Payroll Run Item APIs:

| Field | Type | Description |
|---|---|---|
| `pf_wage` | String | The calculated wage base on which PF was computed (after checking ceiling). |
| `pf_employee_amount` | String | Employee Provident Fund monthly deduction (12% of PF wage). |
| `pf_employer_amount` | String | Total Employer Provident Fund contribution (12% of PF wage). |
| `eps_amount` | String | Portion of employer PF routed to Employee Pension Scheme (8.33%). |
| `esi_covered` | Boolean | `true` if employee is covered under ESI (gross <= ₹21,000 threshold). |
| `esi_employee_amount` | String | Employee ESI deduction (0.75% of ESI wage). |
| `esi_employer_amount` | String | Employer ESI contribution (3.25% of ESI wage). |
| `professional_tax_amount` | String | State-mandated monthly Professional Tax deduction based on slabs. |
| `income_tax_amount` | String | Estimated monthly TDS withheld under Indian Income Tax Act. |

### 4.3. Detailed Inspection: `statutory_snapshot`
Use this block when rendering accordion drawers or "View Calculation Breakdown" modals:
- **`pf`**: Contains rate percentages (`12.00`), EPS amount, EPF employer residue, EDLI, admin charges, and ceiling flags.
- **`esi`**: Contains rates (`0.75%` / `3.25%`), coverage status, and eligibility wage.
- **`pt`**: Contains resolved state code (e.g., `"MH"`, `"KA"`) and monthly tax amount.
- **`tax`**: Contains active regime code (`"new"` vs `"old"`), projected annual gross, annual tax liability, and monthly TDS.

---

## 5. Frontend UI Component Integration Example (React / TypeScript)

```tsx
import React from 'react';

interface StatutoryBreakdown {
  status: string;
  pf_wage: string;
  pf_employee_amount: string;
  pf_employer_amount: string;
  eps_amount: string;
  esi_covered: boolean;
  esi_employee_amount: string;
  esi_employer_amount: string;
  professional_tax_amount: string;
  income_tax_amount: string;
  statutory_snapshot: {
    pf: { enabled: boolean; employee_rate: string; epf_employer: string; admin_charges: string };
    esi: { enabled: boolean; covered: boolean };
    pt: { enabled: boolean; state_code: string | null; amount: string };
    tax: { enabled: boolean; regime: string; annual_tax_liability: string; monthly_tds: string };
  };
  figures: {
    monthly_gross: string;
    total_deductions: string;
    total_employer_contributions: string;
    net_pay: string;
    ctc_cost: string;
  };
}

interface SalaryComponent {
  id: string;
  component_name: string;
  component_type: string;
  monthly_amount: string;
}

interface SalaryStructureData {
  annual_ctc: string;
  monthly_gross: string;
  components: SalaryComponent[];
  statutory_breakdown?: StatutoryBreakdown;
}

export const SalaryStructureCard: React.FC<{ structure: SalaryStructureData }> = ({ structure }) => {
  const breakdown = structure.statutory_breakdown;
  const figures = breakdown?.figures;

  return (
    <div className="salary-structure-container p-6 bg-white rounded-xl shadow-md space-y-6">
      {/* Top Headline Figures */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg">
          <span className="text-sm text-gray-500">Gross Monthly Earnings</span>
          <p className="text-2xl font-bold text-blue-900">₹{figures?.monthly_gross || structure.monthly_gross}</p>
        </div>
        <div className="p-4 bg-red-50 rounded-lg">
          <span className="text-sm text-gray-500">Estimated Monthly Deductions</span>
          <p className="text-2xl font-bold text-red-600">- ₹{figures?.total_deductions || '0.00'}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <span className="text-sm text-gray-500">Estimated Take-Home (Net Pay)</span>
          <p className="text-2xl font-bold text-green-700">₹{figures?.net_pay || structure.monthly_gross}</p>
        </div>
      </div>

      {/* Two Column Layout: Earnings vs Deductions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Earnings Column */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 mb-3 border-b pb-2">Contractual Earnings</h3>
          <ul className="space-y-2">
            {structure.components.map((comp) => (
              <li key={comp.id} className="flex justify-between text-sm">
                <span className="text-gray-600">{comp.component_name}</span>
                <span className="font-medium text-gray-900">₹{comp.monthly_amount}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Deductions Column (Powered by statutory_breakdown) */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold text-gray-700 mb-3 border-b pb-2">Estimated Statutory Deductions</h3>
          {breakdown ? (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-gray-600">Provident Fund (Employee EPF)</span>
                <span className="font-medium text-red-600">- ₹{breakdown.pf_employee_amount}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-gray-600">Employee State Insurance (ESI)</span>
                <span className="font-medium text-red-600">- ₹{breakdown.esi_employee_amount}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-gray-600">Professional Tax (PT)</span>
                <span className="font-medium text-red-600">- ₹{breakdown.professional_tax_amount}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-gray-600">Income Tax (Estimated TDS)</span>
                <span className="font-medium text-red-600">- ₹{breakdown.income_tax_amount}</span>
              </li>
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No statutory withholdings configured.</p>
          )}
        </div>
      </div>

      {/* Employer Contribution Summary */}
      {breakdown && breakdown.statutory_snapshot.pf.enabled && (
        <div className="text-xs text-gray-500 bg-gray-100 p-3 rounded">
          <strong>Employer Contributions (included in CTC):</strong> Provident Fund: ₹{breakdown.pf_employer_amount} (EPS: ₹{breakdown.eps_amount}, EPF: ₹{breakdown.statutory_snapshot.pf.epf_employer}).
        </div>
      )}
    </div>
  );
};
```

---

## 6. Verification & Support
* All backend calculations are 100% covered by automated tests in `tests/unit/payroll/salary_structure_statutory_breakdown.test.js`.
* If you have questions about specific statutory edge cases (e.g. Maharashtra February PT override or Section 115BAC New Tax Regime rules), consult the backend team or review `public/md_payrolls/combined_api_analysis.md`.
