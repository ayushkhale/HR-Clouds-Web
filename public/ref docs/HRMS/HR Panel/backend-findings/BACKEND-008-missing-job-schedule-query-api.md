# Backend Finding: BACKEND-008 — Backend Lacks GET Endpoint for Automated Job Schedules & Status

**Finding ID:** BACKEND-008  
**Module:** Payroll / Automation  
**Page:** Payroll Automation (/dashboard/hr/payroll/automation)  
**API:** `N/A (Missing GET Endpoint)`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/payroll/jobs (MISSING)`  
**Status:** **CONFIRMED BACKEND CAPABILITY GAP**  

---

## 1. Business Functionality
Monitoring automated payroll background jobs, cron schedules, and next run times.

## 2. Observed Frontend Problem
Payroll reminders job displays 'SCHEDULE: UNKNOWN'.

## 3. Actual API Request
```http
None available for job schedules.
```

## 4. Actual API Response
```json
N/A
```

## 5. Expected API Response
A GET endpoint returning configured cron expressions, last run timestamps, and execution statuses for automated jobs.

## 6. Missing / Incorrect Field
No endpoint exists to retrieve cron job metadata.

## 7. Backend Behavior & Implementation
Backend defines cron jobs in code and exposes manual trigger endpoints (`POST /jobs/.../run`), but provides no `GET` API to read schedules.

## 8. Why This Is a Backend Issue
The frontend cannot display the schedule because the backend does not provide an API to query it.

## 9. Frontend Impact
HR cannot verify when automated payroll reminders or auto-draft jobs are scheduled to execute.

## 10. Root Cause
Backend implemented Phase 7 automation triggers without a corresponding read API for job configurations.

## 11. Evidence
Inspection of `payroll_hr.routes.js` confirmed only POST endpoints exist for jobs.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/payroll/automation.
- 2. Look at Payroll reminders job card.

## 13. Related APIs
- `POST /api/v1/payroll/jobs/calendar-reminders/run`
- `POST /api/v1/payroll/jobs/auto-draft/run`

## 14. Recommended Backend Fix
Create `GET /api/v1/payroll/jobs` endpoint returning job metadata, cron expressions, and last execution logs.

## 15. Frontend Impact After Fix
Frontend will display the exact cron schedule (e.g. 'Every month on 25th at 09:00 AM') instead of 'UNKNOWN'.
