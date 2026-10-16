# Backend Finding: BACKEND-003 — Payroll Run Marked 'PAID' With ₹0 Totals and Excluded Employee

**Finding ID:** BACKEND-003  
**Module:** Payroll / Runs & Reports  
**Page:** Payroll Runs (/dashboard/hr/payroll/runs) & Reports  
**API:** `GET /api/v1/payroll/runs`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/runs`  
**Status:** **CONFIRMED BACKEND BUG**  

---

## 1. Business Functionality
Monthly salary execution, review, approval, and disbursement tracking.

## 2. Observed Frontend Problem
The August 2026 payroll run is displayed as 'PAID' on 14 Sept 2026 with ₹0 Gross, ₹0 Deductions, ₹0 Net, and '1 excluded'. Consequently, Payroll Reports says 'No approved or paid runs yet'.

## 3. Actual API Request
```http
GET /api/v1/payroll/runs
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "success": true,
  "data": [
    {
      "id": "cfbd529a-76d9-4882-894d-10684b998cb1",
      "period_month": "2026-08",
      "status": "paid",
      "total_employees": 1,
      "excluded_count": 1,
      "total_gross": "0.00",
      "total_deductions": "0.00",
      "total_net": "0.00",
      "paid_at": "2026-09-14T02:56:08.072Z"
    }
  ]
}
```

## 5. Expected API Response
A run in 'paid' status must have processed non-zero compensation items, or empty/dummy runs must be marked 'cancelled'.

## 6. Missing / Incorrect Field
status is 'paid' while total_gross, total_deductions, total_net are 0.00 and processed_count is 0.

## 7. Backend Behavior & Implementation
The state machine allowed a run where the only employee was excluded (reason: 'company does not existed in last month') to be approved and marked paid.

## 8. Why This Is a Backend Issue
The frontend reflects the backend status. Furthermore, the report generation engine correctly requires non-zero processed items, leading to the conflict where a 'PAID' run cannot produce a report.

## 9. Frontend Impact
Payroll history shows confusing ₹0 disbursements; Payroll Reports dropdown is disabled with 'No approved or paid runs yet'.

## 10. Root Cause
Lack of guardrails in `payroll_run.service.js`: `approveRun` and `markRunPaid` did not assert `processed_count > 0` or `total_net > 0`.

## 11. Evidence
SQL Query: SELECT * FROM payroll_run_items WHERE run_id = 'cfbd529a-76d9-4882-894d-10684b998cb1' confirmed 1 item with status='excluded' and exclusion_reason='company does not existed in last month'.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/payroll/runs.
- 2. Inspect August 2026 run card.
- 3. Navigate to /dashboard/hr/payroll/reports and inspect run selector.

## 13. Related APIs
- `POST /api/v1/payroll/runs/:id/approve`
- `POST /api/v1/payroll/runs/:id/pay`
- `GET /api/v1/payroll/reports/payroll-register`

## 14. Recommended Backend Fix
1. Update August 2026 run status to 'cancelled'. 2. In `payroll_run.service.js`, throw an error if `approveRun` is called on a run with 0 payable employees.

## 15. Frontend Impact After Fix
Payroll history will show the run as Cancelled or Draft, and Payroll Reports will not exhibit contradictory messaging.
