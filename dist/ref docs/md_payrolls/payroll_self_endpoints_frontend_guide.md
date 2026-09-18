# Frontend Integration Guide: Payroll Self-Service Endpoints Correction

**Target Audience:** Frontend Developers, Mobile App Engineers, QA Engineers  
**Scope:** Employee Self-Service Payroll Endpoints (Payslips, Annual Statements, Form 16, Encashments)  
**Date:** September 19, 2026  
**Status:** **ACTIVE & LIVE**

---

## 1. Overview & Context

During documentation audits, an erroneous `/self/` prefix was identified in early draft documentation for 5 employee self-service endpoints (#191–#194 and #218). 

* **The Cause:** Early Phase 6 & Phase 7 documentation drafts incorrectly documented the routes as `/api/v1/payroll/self/me/...`.
* **The Reality:** In Express (`src/modules/payroll/payroll.index.js`), employee self-service routes are mounted at `/api/v1/payroll`, and all self endpoints are registered directly under `/me/...`.
* **Result if called with `/self/`:** Calling `/api/v1/payroll/self/me/...` results in an immediate **`404 Not Found`** because Express has no route handler matching `/self`.

All documentation files (`api_registry.md`, `combined_api_analysis.md`, `phase6_api_analysis.md`, and `phase7_api_analysis.md`) have been updated to reflect the live backend routes.

---

## 2. Endpoint Diff & Mapping Matrix

Update your frontend API service/client constants according to the table below:

| API # | Feature / Purpose | Method | ❌ Wrong (Legacy Docs) | ✅ Correct Live Backend Route |
| :---: | :--- | :---: | :--- | :--- |
| **#191** | Download Own Payslip PDF | `GET` | `/api/v1/payroll/self/me/payslips/:runId/pdf` | **`/api/v1/payroll/me/payslips/:runId/pdf`** |
| **#192** | Get Own Annual Statement (JSON) | `GET` | `/api/v1/payroll/self/me/annual-statement` | **`/api/v1/payroll/me/annual-statement`** |
| **#193** | Download Own Annual Statement (PDF) | `GET` | `/api/v1/payroll/self/me/annual-statement/pdf` | **`/api/v1/payroll/me/annual-statement/pdf`** |
| **#194** | Download Own Form 16 Part B (PDF) | `GET` | `/api/v1/payroll/self/me/tax/form16/:financialYear/pdf` | **`/api/v1/payroll/me/tax/form16/:financialYear/pdf`** |
| **#218** | List Own Encashments (History) | `GET` | `/api/v1/payroll/self/me/encashments` | **`/api/v1/payroll/me/encashments`** |

> **Note on Existing Endpoints:** All other employee self-service endpoints (such as `#55 List Payslips`, `#91 List Bonuses`, `#119 Tax Summary`, `#122 Declarations`, `#154 Reimbursements`, and `#166 Benefits`) were already using `/api/v1/payroll/me/...`. These 5 endpoints now follow the exact same consistent pattern.

---

## 3. Frontend Implementation Instructions

### 3.1. API Client Base URL Configuration
Ensure your API clients or Axios instances construct paths against the standard payroll prefix:

```typescript
// Example: src/api/payrollSelf.api.ts
const PAYROLL_BASE = '/api/v1/payroll/me';

export const PayrollSelfApi = {
  // #191: Download payslip PDF
  getPayslipPdfUrl: (runId: string) => `${PAYROLL_BASE}/payslips/${runId}/pdf`,

  // #192: Get annual statement JSON breakdown
  getAnnualStatement: (financialYear?: string) => 
    `${PAYROLL_BASE}/annual-statement${financialYear ? `?financial_year=${financialYear}` : ''}`,

  // #193: Download annual statement PDF
  getAnnualStatementPdfUrl: (financialYear?: string) => 
    `${PAYROLL_BASE}/annual-statement/pdf${financialYear ? `?financial_year=${financialYear}` : ''}`,

  // #194: Download Form 16 Part B PDF
  getForm16PdfUrl: (financialYear: string) => 
    `${PAYROLL_BASE}/tax/form16/${financialYear}/pdf`,

  // #218: List personal encashments
  getEncashments: () => `${PAYROLL_BASE}/encashments`,
};
```

---

### 3.2. Handling Binary PDF Downloads (#191, #193, #194)

The PDF endpoints stream raw binary content (`application/pdf`) directly. Frontend applications must handle these streams as **Blobs** or **ArrayBuffers**:

```typescript
import axios from 'axios';

/**
 * Downloads a binary PDF file and triggers browser save dialog
 */
export async function downloadPayrollPdf(endpointUrl: string, fallbackFileName: string): Promise<void> {
  try {
    const response = await axios.get(endpointUrl, {
      responseType: 'blob',
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    // Extract filename from Content-Disposition header if provided
    let fileName = fallbackFileName;
    const disposition = response.headers['content-disposition'];
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        fileName = match[1];
      }
    }

    // Create a temporary object URL and click invisible anchor
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error: any) {
    handlePdfDownloadError(error);
  }
}
```

---

### 3.3. Key Error Handling Scenarios for UI/UX

When invoking these endpoints, expect standard JSON error responses when exceptions occur:

| Endpoint | HTTP Status | Error Code | UI/UX Action / Guidance |
| :--- | :---: | :--- | :--- |
| **#191** (`/me/payslips/:runId/pdf`) | `403` | `FORBIDDEN` | Show message: *"Payslip is currently hidden by HR pending final publication."* (occurs if `visible_to_employee = false`). |
| **#191** (`/me/payslips/:runId/pdf`) | `404` | `PAYSLIP_NOT_FOUND` | Occurs if `runId` is invalid or employee was excluded from this run. |
| **#194** (`/me/tax/form16/:fy/pdf`) | `404` | `FORM16_NOT_FINALIZED` | Show message: *"Form 16 for this financial year has not yet been finalized by HR."* |
| **#192/#193** (`/me/annual-statement`) | `400` | `INVALID_FINANCIAL_YEAR` | Ensure query param matches `YYYY-YY` (e.g. `2025-26`). If omitted, defaults to the current active FY. |
| **All Endpoints** | `403` | `FEATURE_NOT_AVAILABLE` | Tenant organization does not have the `payroll.access` feature flag enabled. |

---

## 4. Verification Checklist for Frontend PRs

- [ ] Search codebase for any instances of `/payroll/self` and replace with `/payroll/me`.
- [ ] Verify payslip PDF download button triggers `GET /api/v1/payroll/me/payslips/:runId/pdf`.
- [ ] Verify tax dashboard annual statement calls `GET /api/v1/payroll/me/annual-statement`.
- [ ] Verify Form 16 Part B button calls `GET /api/v1/payroll/me/tax/form16/:financialYear/pdf`.
- [ ] Verify employee self-service encashment history tab calls `GET /api/v1/payroll/me/encashments`.
- [ ] Confirm no `404` responses are received in network tab for self-service payroll flows.
