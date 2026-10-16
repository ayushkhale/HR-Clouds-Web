# Backend Finding: BACKEND-004 — Duplicate Conflicting Statutory Salary Components in Database

**Finding ID:** BACKEND-004  
**Module:** Payroll / Salary Components  
**Page:** Salary Components (/dashboard/hr/payroll/components)  
**API:** `GET /api/v1/payroll/components`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/components`  
**Status:** **CONFIRMED BACKEND BUG**  

---

## 1. Business Functionality
Organization salary component catalog management for earnings and deductions.

## 2. Observed Frontend Problem
Multiple redundant components exist for the same concept with conflicting rules (e.g. ESICE vs ESI_EMPLOYEE, PFE vs PF_EMPLOYEE, PFEY vs PF_EMPLOYER, TDDS vs TDS).

## 3. Actual API Request
```http
GET /api/v1/payroll/components
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "success": true,
  "data": [
    { "code": "ESICE", "name": "ESIC Employee", "calculation_type": "percent_of_ctc", "value": "0.2500", "is_system": false },
    { "code": "ESI_EMPLOYEE", "name": "Employees' State Insurance (Employee)", "calculation_type": "flat", "value": "0.0000", "is_system": true }
  ]
}
```

## 5. Expected API Response
A single canonical component per statutory deduction concept.

## 6. Missing / Incorrect Field
Coexistence of manual components (is_system: false) alongside system statutory components (is_system: true).

## 7. Backend Behavior & Implementation
Database table `salary_components` has 20 components, containing both manually seeded components and system bootstrapped components.

## 8. Why This Is a Backend Issue
The frontend queries the components list and renders whatever components exist in the database. The duplication exists in the backend data layer.

## 9. Frontend Impact
HR configuration risk: assigning the wrong component can cause incorrect percent-of-CTC deductions instead of statutory wage ceiling rules.

## 10. Root Cause
Seed scripts or previous bootstrapping iterations created duplicate component entries without unique constraints on statutory concepts.

## 11. Evidence
SQL Query: SELECT code, name, is_system, is_statutory FROM salary_components returned duplicate pairs.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/payroll/components.
- 2. Review the Deductions section.

## 13. Related APIs
- `POST /api/v1/payroll/components/bootstrap`
- `POST /api/v1/payroll/templates`

## 14. Recommended Backend Fix
Decommission or soft-delete the legacy/manual duplicate components (ESICE, ESICEY, PFE, PFEY, TDDS) and enforce canonical codes (ESI_EMPLOYEE, PF_EMPLOYEE, etc.).

## 15. Frontend Impact After Fix
The table will display a clean, unambiguous list of canonical components.
