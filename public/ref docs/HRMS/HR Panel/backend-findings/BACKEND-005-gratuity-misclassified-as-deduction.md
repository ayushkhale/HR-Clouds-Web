# Backend Finding: BACKEND-005 — Gratuity Stored with component_type = 'deduction' Instead of Employer Contribution

**Finding ID:** BACKEND-005  
**Module:** Payroll / Salary Components  
**Page:** Salary Components (/dashboard/hr/payroll/components)  
**API:** `GET /api/v1/payroll/components`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/components`  
**Status:** **CONFIRMED BACKEND BUG**  

---

## 1. Business Functionality
Classification of salary components as earnings, deductions, or employer contributions.

## 2. Observed Frontend Problem
Gratuity (GRT) is categorized and displayed under 'Deductions' instead of 'Employer Contributions'.

## 3. Actual API Request
```http
GET /api/v1/payroll/components
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "code": "GRT",
  "name": "Gratuity",
  "component_type": "deduction",
  "calculation_type": "flat",
  "value": "1800.0000"
}
```

## 5. Expected API Response
Gratuity should have component_type: 'employer_contribution' (or benefit liability), not employee deduction.

## 6. Missing / Incorrect Field
component_type is 'deduction'.

## 7. Backend Behavior & Implementation
Database table `salary_components` stores `component_type = 'deduction'` for the Gratuity component.

## 8. Why This Is a Backend Issue
The frontend groups components by `component_type`. Because the backend returns 'deduction', the frontend places it in the Deductions table.

## 9. Frontend Impact
Gratuity appears as an employee salary deduction rather than an employer CTC cost liability, creating legal and payroll calculation confusion.

## 10. Root Cause
Incorrect component type enumeration assigned during component creation.

## 11. Evidence
SQL Query: SELECT code, component_type FROM salary_components WHERE code = 'GRT' returned 'deduction'.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/payroll/components.
- 2. Look at Deductions table row 3.

## 13. Related APIs
- `POST /api/v1/payroll/components`
- `GET /api/v1/payroll/templates`

## 14. Recommended Backend Fix
Update `salary_components` SET component_type = 'employer_contribution' WHERE code = 'GRT'.

## 15. Frontend Impact After Fix
Gratuity will automatically render under Employer Contributions.
