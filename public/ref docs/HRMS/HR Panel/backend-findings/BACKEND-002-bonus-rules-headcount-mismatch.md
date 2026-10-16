# Backend Finding: BACKEND-002 — Bonus Rules Engine Applied to 9 People When Tenant Headcount is 8

**Finding ID:** BACKEND-002  
**Module:** Payroll / Bonus Rules  
**Page:** Bonus Rules (/dashboard/hr/payroll/bonus-rules)  
**API:** `GET /api/v1/payroll/bonus-rules`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/bonus-rules`  
**Status:** **CONFIRMED BACKEND BUG**  

---

## 1. Business Functionality
Automated group bonus calculation and execution based on qualification rules.

## 2. Observed Frontend Problem
Bonus rules with qualification criteria 'Everyone' (e.g. Ganesh Chaturthy Bonus ₹500, Diwali Bonus ₹2,000) show status 'APPROVED · APPLIED · 9 PEOPLE', whereas the total organization headcount is 8.

## 3. Actual API Request
```http
GET /api/v1/payroll/bonus-rules
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "success": true,
  "data": [
    {
      "id": "rule-uuid",
      "name": "Diwali Bonus",
      "target_group": "everyone",
      "applied_count": 9,
      "status": "approved"
    }
  ]
}
```

## 5. Expected API Response
applied_count should equal the number of eligible active personnel in the organization (8).

## 6. Missing / Incorrect Field
applied_count returns 9 instead of 8.

## 7. Backend Behavior & Implementation
The bonus rule execution engine iterated over 9 users because user '03f0ed9f-3ca7-4d03-8418-0f6aea942df9' (abhishek@gmail.com) was included in the target cohort despite not belonging to this organization.

## 8. Why This Is a Backend Issue
The frontend merely formats `APPLIED · ${rule.applied_count} PEOPLE`. The count is calculated, stored, and returned directly by the backend bonus engine.

## 9. Frontend Impact
HR sees an impossible headcount figure on bonus rules, creating auditing discrepancies.

## 10. Root Cause
The bonus application logic in `bonus_rule.service.js` resolved the recipient cohort using an un-scoped user query or included a user from another tenant.

## 11. Evidence
Correlates directly with BACKEND-001 where abhishek@gmail.com was awarded an adjustment under this org.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/payroll/bonus-rules.
- 2. Observe 'APPLIED · 9 PEOPLE' badge on Diwali Bonus.
- 3. Count active employees in user_roles for org (8).

## 13. Related APIs
- `POST /api/v1/payroll/bonus-rules`
- `GET /api/v1/payroll/adjustments`

## 14. Recommended Backend Fix
In `bonus_rule.service.js`, ensure that the cohort generation query joins `user_roles` strictly with `where: { org_id, is_active: true }`.

## 15. Frontend Impact After Fix
The badge will accurately display 'APPLIED · 8 PEOPLE'.
