# Backend Finding: BACKEND-001 — Orphaned Adjustments Referencing Foreign Tenant User ('Employee not found N/A')

**Finding ID:** BACKEND-001  
**Module:** Payroll / Adjustments  
**Page:** Salary Adjustments (/dashboard/hr/payroll/adjustments)  
**API:** `GET /api/v1/payroll/adjustments`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/adjustments`  
**Status:** **CONFIRMED BACKEND BUG**  

---

## 1. Business Functionality
One-time salary additions, bonuses, and deductions management for organization employees.

## 2. Observed Frontend Problem
On Page 1 of Salary Adjustments, two approved adjustment rows (Sept 'Ganesh Chaturthy' +₹500 and Oct 'Diwali Bonus' +₹2,000) display EMPLOYEE as 'Employee not found N/A'.

## 3. Actual API Request
```http
GET /api/v1/payroll/adjustments?page=1&limit=20
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "success": true,
  "data": [
    {
      "id": "d7b49c4f-ad15-46ef-a88f-18c2f80cfee6",
      "user_id": "03f0ed9f-3ca7-4d03-8418-0f6aea942df9",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "period_month": "2026-10",
      "reason": "Diwali Bonus For All",
      "amount": "2000.00",
      "status": "approved"
    }
  ]
}
```

## 5. Expected API Response
All adjustment rows returned for an organization must reference user_ids that possess an active UserRole within that organization.

## 6. Missing / Incorrect Field
user_id references a user (03f0ed9f-3ca7-4d03-8418-0f6aea942df9) whose active UserRole belongs to a different tenant (org_id = a3069268-0d1d-426f-bd31-d86eb2bf67bb).

## 7. Backend Behavior & Implementation
payroll_adjustments table contains records stamped with org_id 'b782fd72-493e-415d-8b5b-9194b81d294e' but user_id '03f0ed9f-3ca7-4d03-8418-0f6aea942df9' (abhishek@gmail.com). The list endpoint queries payroll_adjustments by org_id without verifying that user_id has an active membership in the tenant.

## 8. Why This Is a Backend Issue
The frontend fetches adjustments by org_id and maps user_id to its employee roster. Because the user belongs to another organization, the lookup fails and falls back to 'Employee not found N/A'. The data corruption exists entirely in the backend database.

## 9. Frontend Impact
HR views approved bonuses allocated to 'Employee not found N/A', causing confusion, audit concerns, and potential misallocation of payroll funds.

## 10. Root Cause
Cross-tenant data pollution during mass bonus rule execution or database seeding. The bonus application engine failed to enforce a tenant membership check on user_id.

## 11. Evidence
SQL Query: SELECT * FROM user_roles WHERE user_id = '03f0ed9f-3ca7-4d03-8418-0f6aea942df9' confirmed the user only has role in org 'a3069268-0d1d-426f-bd31-d86eb2bf67bb'.

## 12. Reproduction Steps
- 1. Query GET /api/v1/payroll/adjustments for org b782fd72-493e-415d-8b5b-9194b81d294e.
- 2. Observe returned user_id '03f0ed9f-3ca7-4d03-8418-0f6aea942df9'.
- 3. Cross-reference with user_roles table to verify tenant membership.

## 13. Related APIs
- `POST /api/v1/payroll/bonus-rules/:id/apply`
- `GET /api/v1/payroll/runs/:id`

## 14. Recommended Backend Fix
1. Run a migration script to delete or reassign orphaned payroll_adjustments records where user_id does not belong to the org. 2. In payrollAdjustmentService and bonusRuleService, add validation: verify that target user_id has an active UserRole for the given org_id.

## 15. Frontend Impact After Fix
The adjustments table will only display adjustments for valid organization members, completely resolving 'Employee not found N/A'.
