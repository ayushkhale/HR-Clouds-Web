# Backend Finding: BACKEND-007 — Revoked Payslips Retain visible_to_employee = true in Database

**Finding ID:** BACKEND-007  
**Module:** Payroll / Payslips  
**Page:** Payslips & Documents (/dashboard/hr/payroll/payslips)  
**API:** `GET /api/v1/payroll/payslips`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/payslips`  
**Status:** **CONFIRMED BACKEND BUG**  

---

## 1. Business Functionality
Employee payslip publication, revocation, and employee visibility management.

## 2. Observed Frontend Problem
4 withdrawn September 2026 payslips show 'STATUS: WITHDRAWN' but 'EMPLOYEE CAN SEE IT: Yes'.

## 3. Actual API Request
```http
GET /api/v1/payroll/payslips?user_id=170fc953-c3e9-4175-ba80-2e7407e797e6
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "success": true,
  "data": [
    {
      "id": "f8566099-5998-48c3-a43a-306fe77b811f",
      "period_month": "2026-09",
      "version": 1,
      "status": "revoked",
      "visible_to_employee": true
    }
  ]
}
```

## 5. Expected API Response
When a payslip is revoked or superseded, visible_to_employee must be set to false.

## 6. Missing / Incorrect Field
visible_to_employee remains true on revoked payslips.

## 7. Backend Behavior & Implementation
The payslip revocation service updates `status = 'revoked'` and `revoked_at = NOW()` but fails to update `visible_to_employee = false` in the database.

## 8. Why This Is a Backend Issue
The frontend displays 'EMPLOYEE CAN SEE IT: Yes' because the API response literally contains `visible_to_employee: true`.

## 9. Frontend Impact
Employees can potentially view superseded, incorrect, or withdrawn payslips in their self-service portal.

## 10. Root Cause
Omission of `visible_to_employee: false` in the Sequelize update statement inside `payslip_revocation.service.js`.

## 11. Evidence
SQL Query: SELECT id, status, visible_to_employee FROM payslips WHERE status = 'revoked' returned visible_to_employee = true for all 4 rows.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/payroll/payslips.
- 2. Select employee Pranay Patidar.
- 3. Inspect Payslip history table.

## 13. Related APIs
- `POST /api/v1/payroll/payslips/:id/revoke`
- `GET /api/v1/payroll/me/payslips`

## 14. Recommended Backend Fix
In `payslip.repository.js` / `service.js`, ensure `revokePayslip` includes `visible_to_employee: false` in the update payload. Run an UPDATE script to fix existing revoked rows.

## 15. Frontend Impact After Fix
Withdrawn payslips will accurately display 'EMPLOYEE CAN SEE IT: No'.
