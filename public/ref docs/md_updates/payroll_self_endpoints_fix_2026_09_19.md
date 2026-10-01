# Update Notice: Payroll Self-Service Endpoints Correction (2026-09-19)

**Target Audience:** Frontend Engineers, Mobile Engineers, QA Teams  
**Module:** Payroll Self-Service (`/api/v1/payroll/me`)  
**Status:** **ACTIVE & LIVE**

---

## 1. Summary of Changes

Documentation for 5 employee self-service endpoints contained an accidental extra `/self/` segment in legacy Phase 6/7 drafts (`/api/v1/payroll/self/me/...`). In the live backend implementation, all employee self routes are mounted at `/api/v1/payroll/me/...`.

Calling the legacy URL will return **`404 Not Found`**.

---

## 2. Route Mapping Table

| API # | Phase | Purpose | Method | ❌ Legacy Doc Path | ✅ Correct Backend Path | Frontend Priority |
| :---: | :---: | :--- | :---: | :--- | :--- | :--- |
| **#191** | Phase 6 | Download Own Payslip PDF | `GET` | `/api/v1/payroll/self/me/payslips/:runId/pdf` | **`/api/v1/payroll/me/payslips/:runId/pdf`** | **Immediate** (Fix existing link) |
| **#192** | Phase 6 | Get Own Annual Statement (JSON) | `GET` | `/api/v1/payroll/self/me/annual-statement` | **`/api/v1/payroll/me/annual-statement`** | **Immediate** (Fix existing call) |
| **#193** | Phase 6 | Download Own Annual Statement (PDF) | `GET` | `/api/v1/payroll/self/me/annual-statement/pdf` | **`/api/v1/payroll/me/annual-statement/pdf`** | **Immediate** (Fix existing link) |
| **#194** | Phase 6 | Download Own Form 16 Part B (PDF) | `GET` | `/api/v1/payroll/self/me/tax/form16/:financialYear/pdf` | **`/api/v1/payroll/me/tax/form16/:financialYear/pdf`** | **Immediate** (Fix existing link) |
| **#218** | Phase 7 | List Own Encashments (History) | `GET` | `/api/v1/payroll/self/me/encashments` | **`/api/v1/payroll/me/encashments`** | **Phase 7 UI** (Build when scheduled) |

> **Note on Phase Scope:** 
> * **#191–#194 belong to Phase 6 (Delivery Layer)**. If your frontend currently supports payslips and tax document downloads, simply update these 4 URLs.
> * **#218 belongs to Phase 7 (Encashments)**. If your frontend has not started Phase 7 UI features yet, **do not build the tab now**. The schema below is provided so you have the exact backend record shape when Phase 7 UI development begins.

---

## 3. API #218 Schema & Contract Specification

**Endpoint:** `GET /api/v1/payroll/me/encashments`  
**Authentication:** Bearer Token (`req.user.id`)  
**Feature Flag:** `payroll.access`  
**Query Parameters:** None (returns caller's personal history, up to 200 records sorted newest first).

### TypeScript Interface
```typescript
export interface SelfEncashmentRecord {
  id: string;                      // UUID of the encashment request
  org_id: string;                  // Organization UUID
  user_id: string;                 // Employee UUID (caller)
  source_kind: 'comp_off' | 'leave_balance'; // Source entitlement type
  comp_off_ids: string[];          // Array of comp-off attendance record UUIDs (empty for leave_balance)
  leave_type_id: string | null;    // UUID of leave type (if leave_balance)
  leave_type_code: string | null;  // e.g. "PL", "CL" (if leave_balance)
  balance_year: number | null;     // Entitlement year (e.g. 2026)
  days: string;                    // Encashment days requested/approved (e.g. "1.00")
  rate_basis: string;              // "basic" or "gross"
  divisor_basis: string;           // "fixed_30", "calendar_days", or "working_days"
  divisor_days: number;            // Divisor used in rate calculation (e.g. 30)
  per_day_amount: string;          // Daily cash value in INR (e.g. "1000.00")
  amount: string;                  // Total payout in INR (e.g. "1000.00")
  period_month: string;            // Target payroll disbursement month ("YYYY-MM")
  component_id: string;            // Salary component UUID linked to payout
  component_code: string;          // e.g. "COMP_OFF_ENCASH", "LEAVE_ENCASH"
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  proposed_by: string | null;      // Manager UUID if proposed by manager; null if HR-direct
  approved_by: string | null;      // HR Approver UUID
  rejected_by: string | null;      // Rejecting User UUID
  rejection_reason: string | null; // Explanation if rejected
  adjustment_id: string | null;    // Linked payroll adjustment UUID once approved
  exit_id: string | null;          // Linked exit UUID if part of F&F settlement
  created_at: string;              // ISO Timestamp
  updated_at: string;              // ISO Timestamp
}

export interface SelfEncashmentsResponse {
  success: boolean;
  message: string;
  data: SelfEncashmentRecord[];
}
```

### Example JSON Payload (Live Backend Response)
```json
{
  "success": true,
  "message": "Encashments fetched",
  "data": [
    {
      "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "org_id": "o1o2o3o4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "source_kind": "comp_off",
      "comp_off_ids": [
        "c1c2c3c4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
      ],
      "leave_type_id": null,
      "leave_type_code": null,
      "balance_year": null,
      "days": "1.00",
      "rate_basis": "basic",
      "divisor_basis": "fixed_30",
      "divisor_days": 30,
      "per_day_amount": "1000.00",
      "amount": "1000.00",
      "period_month": "2026-03",
      "component_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "component_code": "COMP_OFF_ENCASH",
      "status": "approved",
      "proposed_by": "m1m2m3m4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "approved_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "rejected_by": null,
      "rejection_reason": null,
      "adjustment_id": "a1a2a3a4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "exit_id": null,
      "created_at": "2026-03-12T10:00:00.000Z",
      "updated_at": "2026-03-12T11:30:00.000Z"
    }
  ]
}
```

---

## 4. UI Column Recommendations for Frontend Table (When Implementing Phase 7)

When Phase 7 UI is implemented, the recommended columns for the employee self-service encashment table are:

| UI Column Header | Data Source Property | Display Format / Logic |
| :--- | :--- | :--- |
| **Request Date** | `created_at` | Format as `DD MMM YYYY` (e.g. "12 Mar 2026") |
| **Type** | `source_kind` | "Compensatory Off" if `'comp_off'`, "Leave Balance" if `'leave_balance'` |
| **Days** | `days` | e.g. `1.0 day` or `2.5 days` |
| **Payout Month** | `period_month` | e.g. "March 2026" |
| **Amount (₹)** | `amount` | Formatted currency (e.g. `₹1,000.00`) |
| **Status** | `status` | Badge: `'pending'` (yellow), `'approved'` (green), `'rejected'` (red), `'cancelled'` (gray) |
| **Remarks / Reason** | `rejection_reason` | Shown in tooltip or expander if status is `'rejected'` |
