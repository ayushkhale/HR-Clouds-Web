# Backend Finding: BACKEND-006 — Export Engine Marks 0-Row Empty Exports as 'completed'

**Finding ID:** BACKEND-006  
**Module:** Payroll / Exports  
**Page:** Exports (/dashboard/hr/payroll/exports)  
**API:** `GET /api/v1/payroll/exports`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/exports`  
**Status:** **CONFIRMED BACKEND BUG**  

---

## 1. Business Functionality
Asynchronous payroll report and document export tracking.

## 2. Observed Frontend Problem
Two exports (Component report PDF and Payroll register PDF) show status 'COMPLETED' with '0 rows'.

## 3. Actual API Request
```http
GET /api/v1/payroll/exports
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "success": true,
  "data": [
    {
      "id": "ded29440-fab3-4289-a827-a559cb2193d3",
      "report_type": "component_report",
      "format": "pdf",
      "status": "completed",
      "row_count": 0,
      "byte_count": 2105
    }
  ]
}
```

## 5. Expected API Response
If an export contains no matching records, it should either indicate status 'empty' / 'no_data' or prevent file generation.

## 6. Missing / Incorrect Field
status is 'completed' despite row_count = 0.

## 7. Backend Behavior & Implementation
The export worker generates an empty PDF containing only headers, marks the export task as completed, and writes `row_count: 0`.

## 8. Why This Is a Backend Issue
The frontend displays the status and row count returned by the API.

## 9. Frontend Impact
HR downloads completed exports only to discover blank reports.

## 10. Root Cause
The export service generates documents even when dataset queries return 0 rows and unconditionally sets status to 'completed'.

## 11. Evidence
SQL Query: SELECT id, report_type, status, row_count FROM payroll_report_exports WHERE row_count = 0 returned 2 completed rows.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/payroll/exports.
- 2. Observe completed rows with '0 rows'.

## 13. Related APIs
- `POST /api/v1/payroll/exports/trigger`

## 14. Recommended Backend Fix
In `payroll_export.service.js`, if query yields 0 rows, set status to 'no_data' or notify caller rather than generating a 0-row file.

## 15. Frontend Impact After Fix
Exports list will clearly distinguish between successful data exports and empty runs.
