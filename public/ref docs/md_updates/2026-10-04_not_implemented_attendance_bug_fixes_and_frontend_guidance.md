# Frontend Integration Guidance: Attendance Bug Fixes & Architecture Updates

**Document Date:** 2026-10-04  
**Module:** Attendance (`/api/v1/attendance`)  
**Target Audience:** Frontend Web & Mobile Engineers  
**Related Backend Updates:** BUG-ATT-001 through BUG-ATT-007, Day-Status Provenance Contract  

---

## 1. Executive Notice: Attendance Adjustments & Manual Correction

> [!IMPORTANT]
> **No Direct Record Patching (`manual-correct` is NOT available):**  
> Direct manual correction (`PATCH /api/v1/attendance/hr/records/:id/manual-correct`) is **not supported and will not be provided**.  
> All attendance modifications, missed punch corrections, and past-day clock adjustments must continue to use the established **Attendance Regularization Workflow** (`/api/v1/attendance/regularizations/*`).

### Why Regularization Must Be Used:
1. **Leave & Quota Safety:** If an employee was marked `on_leave` with an approved leave request, converting them to present requires automated refunding of deducted leave quotas.
2. **Shift Boundary & Policy Accuracy:** Regularization resolves the employee's active shift rules and snapshots for that exact date, computing correct late arrivals, early departures, and overtime thresholds.
3. **Multi-Tier Audit & Approvals:** Ensures changes are tracked through approval chains with mandatory reasons.

**Frontend Action:** Do **not** build any UI modals or buttons targeting `manual-correct`. All HR attendance corrections should be directed through the Regularization Management screen.

---

## 2. Clock-In Concurrency & Duplicate Prevention (HTTP 409)

### Endpoint
`POST /api/v1/attendance/clock-in`

### Previous Behavior
Rapid double-taps on the "Clock In" button or network latency retries previously triggered an unhandled database unique constraint failure, returning HTTP `500 Internal Server Error`.

### Updated Behavior (Safe HTTP 409)
The backend now serializes concurrent requests and catches unique key collisions on `(org_id, user_id, date)`. If a clock-in is already recorded or in progress for today, the backend returns:

**Status:** `409 Conflict`  
**Payload:**
```json
{
  "success": false,
  "message": "Already clocked in for today",
  "errorCode": "ALREADY_CLOCKED_IN"
}
```

### Frontend Action Required
1. In your global API interceptor or clock-in hook:
   ```typescript
   try {
     const response = await api.post('/api/v1/attendance/clock-in', payload);
     toast.success('Clocked in successfully');
     refreshClockState();
   } catch (error: any) {
     if (error?.response?.status === 409 || error?.response?.data?.errorCode === 'ALREADY_CLOCKED_IN') {
       // Graceful reconciliation: Employee is already clocked in
       toast.info('You are already clocked in for today.');
       refreshClockState(); // Refresh UI to show the active "Clock Out" state
       return;
     }
     toast.error(error?.response?.data?.message || 'Failed to clock in');
   }
   ```
2. Disable the "Clock In" button immediately upon click to minimize double-tap duplicate requests.

---

## 3. Half-Day Flag (`is_half_day`) Synchronization

### Affected Endpoints
- `GET /api/v1/attendance/records`
- `GET /api/v1/attendance/hr/records`
- `GET /api/v1/attendance/hr/records/:id`
- `GET /api/v1/attendance/user/daily-log`
- `GET /api/v1/attendance/user/monthly`

### What Changed
Previously, when an employee worked between `half_day_min_hours` and `full_day_min_hours`, the `status` string was set to `'half_day'`, but the boolean column `is_half_day` remained `false`.

`is_half_day` is now strictly synchronized:
- When `status === 'half_day'`, `is_half_day` is guaranteed to be `true`.
- When `status !== 'half_day'`, `is_half_day` is `false`.

### Frontend Action
If your UI previously had conditional workarounds (e.g., checking both `record.status === 'half_day'` and `record.is_half_day`), you can now safely rely on either property.

---

## 4. Daily Report Roster Synthesis

### Endpoint
`GET /api/v1/attendance/hr/reports/daily?date=YYYY-MM-DD`

### What Changed
Previously, this report only included employees who had a physical row in the `attendance_records` table. Active employees who never clocked in were completely missing from the table.

The endpoint now returns a complete roster of all active employees:
1. **Clocked Employees:** Return their persisted database record with a valid UUID `id`.
2. **Unclocked Active Employees:** Return a synthesized record where:
   - `id`: `null`
   - `status`: `'absent'` (if date is in the past), `'weekly_off'`, `'holiday'`, or `'not_marked'` (if today / before joining date)
   - `status_source`: `'derived'`
   - `clock_in_time`: `null`
   - `clock_out_time`: `null`
   - `total_hours`: `0`
   - `effective_hours`: `0`
   - `user`: Complete employee profile object (`id`, `identifier`, `employee_profile`, etc.)

### Frontend Action Required
1. In the Daily Report table component, check whether `record.id` is present before attaching ID-dependent actions (such as viewing raw punch logs or anomaly details):
   ```typescript
   const canViewDetails = Boolean(record.id);
   ```
2. Display the `status` chip directly (`present`, `absent`, `half_day`, `holiday`, `weekly_off`, `not_marked`).

---

## 5. Day-Status Provenance Siblings Reference

As a reminder, all day-status payloads across Employee, Manager, and HR panels now return three provenance fields alongside `status`:

| Field | Type | Description |
|---|---|---|
| `status_source` | `'record' | 'derived'` | Indicates whether the status comes from a database row or dynamic calendar rules. |
| `status_reason` | `string` | Granular explanation: `'record'`, `'in_progress'`, `'before_joining'`, `'holiday'`, `'weekly_off'`, `'awaiting_absent_cron'`, `'pending_clock_in'`, `'upcoming'`. |
| `is_provisional` | `boolean` | `true` if the status is subject to change (e.g. today's pending clock-in or open session); `false` if finalized. |

Refer to [2026-10-04_attendance_day_status_provenance_contract.md](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/public/md_updates/2026-10-04_attendance_day_status_provenance_contract.md) for full rendering examples and badge designs.
