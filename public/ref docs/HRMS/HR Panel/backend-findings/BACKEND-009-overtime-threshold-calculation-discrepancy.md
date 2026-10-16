# Backend Finding: BACKEND-009 — Overtime Calculated Against Policy Minimum Hours Rather Than Shift Schedule

**Finding ID:** BACKEND-009  
**Module:** Attendance / Overtime  
**Page:** HR Inbox (/dashboard/hr/inbox)  
**API:** `GET /api/v1/attendance/manager/overtime/pending`  
**HTTP Method:** `GET`  
**Endpoint:** `/api/v1/attendance/manager/overtime/pending`  
**Status:** **CONFIRMED BACKEND CALCULATION ISSUE**  

---

## 1. Business Functionality
Automatic calculation of employee overtime hours based on daily attendance punches.

## 2. Observed Frontend Problem
Pending overtime row for Rishi Ganeshe shows: SHIFT 'Morning Shift 10:00 am – 06:00 pm' (8h), WORKED '09:56 am – 07:28 pm' (9h 32m), but OVERTIME is displayed as '2h 32m' instead of 1h 32m.

## 3. Actual API Request
```http
GET /api/v1/attendance/manager/overtime/pending
Headers: Authorization: Bearer <token>
```

## 4. Actual API Response
```json
{
  "date": "2026-09-20",
  "worked_hours": "9h 32m",
  "shift_name": "Morning Shift",
  "shift_hours": "8h",
  "overtime_minutes": 152
}
```

## 5. Expected API Response
If overtime is defined as work beyond the assigned shift duration (8h), overtime should be 92 minutes (1h 32m). If defined against policy full_day_min_hours (7h), the API should document the threshold basis.

## 6. Missing / Incorrect Field
overtime_minutes is calculated as 152 (2h 32m) because the engine subtracted 7h (full_day_min_hours) rather than 8h (scheduled shift).

## 7. Backend Behavior & Implementation
In `attendance_records`, `overtime_minutes` is populated as 152. The backend overtime calculation logic used `effective_hours - full_day_min_hours` (9.54h - 7.00h = 2.54h = 152m) rather than calculating against the scheduled shift end time.

## 8. Why This Is a Backend Issue
The frontend accurately renders `152` minutes as `2h 32m`. The calculation logic and stored value originate in the backend attendance punch processor.

## 9. Frontend Impact
Apparent mathematical contradiction in the UI where 9h 32m worked on an 8h shift displays 2h 32m overtime.

## 10. Root Cause
Overtime engine logic discrepancy between shift-duration-based overtime and policy-minimum-hours-based overtime.

## 11. Evidence
SQL Query: SELECT overtime_minutes FROM attendance_records WHERE user_id = 'f5eccc72-9e78-490c-93d7-0eb84210de45' AND date = '2026-09-19' returned 152.

## 12. Reproduction Steps
- 1. Navigate to /dashboard/hr/inbox.
- 2. Click '1 Overtime' card.
- 3. Compare WORKED (9h 32m), SHIFT (8h), and OVERTIME (2h 32m).

## 13. Related APIs
- `POST /api/v1/attendance/clock-out`
- `GET /api/v1/attendance/manager/overtime/pending`

## 14. Recommended Backend Fix
Align the overtime calculation engine in `clock.service.js` with business specifications: either calculate overtime strictly after scheduled shift end time (`shift.end_time`), or provide clear metadata in the API response explaining the policy threshold basis.

## 15. Frontend Impact After Fix
The overtime column will reconcile with the shift and worked hours.
