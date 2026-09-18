# Update Notice: Payroll Self-Service Endpoints Correction (2026-09-19)

**Target Audience:** Frontend Engineers, Mobile Engineers, QA Teams  
**Module:** Payroll Self-Service (`/api/v1/payroll/me`)  
**Reference Document:** [`public/md_payrolls/payroll_self_endpoints_frontend_guide.md`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_payrolls/payroll_self_endpoints_frontend_guide.md)

---

## Summary of Changes

Documentation for 5 employee self-service endpoints contained an accidental extra `/self/` segment in legacy Phase 6/7 drafts (`/api/v1/payroll/self/me/...`). In the live backend implementation, all employee self routes are mounted at `/api/v1/payroll/me/...`.

Calling the legacy URL will return **`404 Not Found`**.

---

## Route Mapping Table

| API # | Purpose | Method | ❌ Legacy Doc Path | ✅ Correct Backend Path |
| :---: | :--- | :---: | :--- | :--- |
| **#191** | Download Own Payslip PDF | `GET` | `/api/v1/payroll/self/me/payslips/:runId/pdf` | **`/api/v1/payroll/me/payslips/:runId/pdf`** |
| **#192** | Get Own Annual Statement (JSON) | `GET` | `/api/v1/payroll/self/me/annual-statement` | **`/api/v1/payroll/me/annual-statement`** |
| **#193** | Download Own Annual Statement (PDF) | `GET` | `/api/v1/payroll/self/me/annual-statement/pdf` | **`/api/v1/payroll/me/annual-statement/pdf`** |
| **#194** | Download Own Form 16 Part B (PDF) | `GET` | `/api/v1/payroll/self/me/tax/form16/:financialYear/pdf` | **`/api/v1/payroll/me/tax/form16/:financialYear/pdf`** |
| **#218** | List Own Encashments (History) | `GET` | `/api/v1/payroll/self/me/encashments` | **`/api/v1/payroll/me/encashments`** |

---

## Instructions for Frontend Engineers

1. **Global Search & Replace**:
   - Search your codebase for `/payroll/self/me` or `payroll/self`.
   - Replace with `/payroll/me`.

2. **Binary Downloads (`responseType: 'blob'`)**:
   - Endpoints **#191**, **#193**, and **#194** stream binary PDF files. Ensure Axios or Fetch is configured with `responseType: 'blob'`.

3. **Status Code Handling**:
   - **403 FORBIDDEN** on `#191`: Payslip visibility has been held/gated by HR. Show: *"Payslip is pending HR release."*
   - **404 FORM16_NOT_FINALIZED** on `#194`: Form 16 Part B is only downloadable after HR has finalized the financial year. Show: *"Form 16 for this financial year has not yet been published."*
