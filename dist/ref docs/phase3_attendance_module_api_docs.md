# Phase 3: Core Attendance APIs 
**Frontend Integration & UI/UX Guide**

This document outlines the Phase 3 Attendance APIs for users (employees, managers, admins) to punch in/out and view their attendance. It is specifically designed to help the Frontend team design the UI/UX flows and integrate the backend seamlessly.

---

## 🧭 Global UI/UX Concepts for Attendance

1. **State-Driven UI**: The primary dashboard should be completely driven by the `/today` and `/shift` APIs. Do not rely solely on local storage to know if a user is clocked in; always fetch the server state on load.
2. **Server-Authoritative Time**: The backend uses its own timestamp for all punches. You can pass `client_timestamp` for auditing, but the server's time is final.
3. **Optimistic Updates vs Loading States**: Because clock-ins depend on network requests, use clear loading spinners on the "Clock In/Out" buttons. Avoid optimistic updates for punches to prevent desync if a validation fails (e.g., trying to clock out when not clocked in).
4. **Geolocation**: The API accepts `latitude` and `longitude`. The frontend should prompt the user for location permissions before they can clock in/out if the policy requires it.

---

## 1. Get Current Shift & Weekly Offs
**Endpoint:** `GET /api/v1/attendance/shift`

**Why we have this API:**
Before an employee even clocks in, they (and the UI) need to know what shift they are assigned to today, what time it starts/ends, and if today is their scheduled weekly off.

**How it works:**
The backend checks the `employee_shift_assignments` and evaluates any complex `rotation_patterns` to determine exactly which shift is active for the user *today*.

**UI/UX Recommendations:**
* **Dashboard Header:** Display this prominently: *"Your shift today: Morning Shift (09:00 AM - 05:00 PM)"*.
* **Weekly Off State:** If the response says today is a weekly off, show a friendly banner: *"It's your day off! You can still clock in if you are working overtime or comp-off."*

**Response:**
```json
{
  "success": true,
  "data": {
    "shift": { "name": "Standard", "start_time": "09:00", "end_time": "18:00" },
    "weekly_offs": [{ "day_of_week": 0 }, { "day_of_week": 6 }]
  }
}
```

---

## 2. Get Today's Status
**Endpoint:** `GET /api/v1/attendance/today`

**Why we have this API:**
This is the **most critical API for the frontend**. It tells the UI exactly what buttons to show (Clock In vs Clock Out vs Start Break vs End Break) and shows the user their accumulated hours for the day.

**How it works:**
Fetches the current day's `attendance_records` and `attendance_breaks` for the logged-in user.

**UI/UX Recommendations:**
* **Button Logic:**
  * If `clock_in_time` is null ➡️ Show **Clock In** button.
  * If `clock_in_time` has a value but `clock_out_time` is null:
    * If `active_break` is null ➡️ Show **Start Break** and **Clock Out** buttons.
    * If `active_break` has a value ➡️ Show **End Break** button (hide/disable Clock Out).
  * If `clock_out_time` has a value ➡️ Show **"Shift Completed"** state (disable all punch buttons).
* **Live Timer:** Use the `clock_in_time` and `active_break` start times to run a visual Javascript timer showing "Hours Worked Today" updating every minute.

---

## 3. Clock In
**Endpoint:** `POST /api/v1/attendance/clock-in`

**Why we have this API:**
Records the start of the user's workday. 

**How it works:**
Validates the user isn't already clocked in, captures the server time, evaluates if they are late based on their shift grace period, and creates an immutable log and session record.

**Request Payload:**
```json
{
  "source": "web", // or 'mobile'
  "latitude": 28.7041, // Optional but recommended
  "longitude": 77.1025,
  "work_mode": "office", // 'office', 'remote', 'field'
  "notes": "Traffic delayed me" // Optional
}
```

**UI/UX Recommendations:**
* **Location Prompt:** Prompt the browser's Geolocation API right when they click "Clock In". If they deny it, you can still send the request without lat/lng, but warn them.
* **Late Warning:** If the response returns `late_minutes > 0`, show a subtle toast: *"Clocked in successfully, but you are marked late by X minutes."*
* **Error Handling:** If it returns `409 ALREADY_CLOCKED_IN`, the UI is out of sync. Silently call `GET /today` to refresh the UI state.

---

## 4. Clock Out
**Endpoint:** `POST /api/v1/attendance/clock-out`

**Why we have this API:**
Ends the workday and triggers the heavy calculation engine to figure out effective hours, overtime, and final day status (Present/Half Day).

**How it works:**
If the user forgot to end a break, the backend will **auto-close** it. It then calculates the exact time worked, deducts break times, and flags any anomalies (like early exit).

**Request Payload:**
```json
{
  "source": "web",
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

**UI/UX Recommendations:**
* **Confirmation Modal:** Always ask *"Are you sure you want to clock out?"* to prevent accidental clicks.
* **End of Day Summary:** After a successful clock out, replace the dashboard buttons with a summary card showing `effective_hours`, `break_duration_minutes`, and their `status` (e.g., "Present").

---

## 5. Start Break
**Endpoint:** `POST /api/v1/attendance/break/start`

**Why we have this API:**
Allows users to pause their working hours (e.g., for lunch) without clocking out completely.

**UI/UX Recommendations:**
* **Visual State Change:** When a break starts, the main screen should change to a "Resting" state. The main timer should pause, and a new "Break Timer" should start ticking up.
* **Errors:** Handle `400 MAX_BREAKS_EXCEEDED` (if the HR policy only allows 2 breaks a day, show an alert).

---

## 6. End Break
**Endpoint:** `POST /api/v1/attendance/break/end`

**Why we have this API:**
Resumes the working hours.

**UI/UX Recommendations:**
* **Single Action:** The only primary action available on the dashboard during a break should be "End Break". Hide everything else to prevent confusion.
* **Warning:** If the break exceeded the allowed policy time, the backend creates a hidden anomaly, but the frontend doesn't need to alert the user aggressively. Just return to the working state.

---

## 7. Get History (Paginated)
**Endpoint:** `GET /api/v1/attendance/history?page=1&limit=20&from=2026-08-01&to=2026-08-15`

**Why we have this API:**
Populates the "My Attendance History" data table.

**UI/UX Recommendations:**
* **Filters:** Provide a Date Range picker (From/To) in the UI. 
* **Data Table:** Show columns for Date, Shift, In Time, Out Time, Effective Hours, and Status.
* **Status Badges:** Use color-coded badges for statuses:
  * 🟢 Present (Green)
  * 🟡 Half Day (Yellow)
  * 🔴 Absent (Red)
  * 🔵 Holiday / Weekly Off (Blue)

---

## 8. Get Monthly Summary
**Endpoint:** `GET /api/v1/attendance/summary?month=8&year=2026`

**Why we have this API:**
Provides aggregated stats for dashboard widgets or payroll previews.

**Response Data:**
```json
{
  "present_days": 18,
  "half_days": 2,
  "absent_days": 1,
  "late_days": 3,
  "total_hours_worked": 154.5,
  "total_overtime_minutes": 120
}
```

**UI/UX Recommendations:**
* **Donut Charts / Stat Cards:** Perfect for visual widgets at the top of the "My Attendance" page. 
* **Gamification:** Highlight `total_hours_worked` or "0 late days" to encourage good attendance behavior.

---

## 🚨 Standard Error Codes (For Global Axios Interceptor)

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `409` | `ALREADY_CLOCKED_IN` | User double-clicked or UI desync | Refresh `/today` state |
| `400` | `NOT_CLOCKED_IN` | Trying to break/clock out without active session | Refresh `/today` state |
| `423` | `ATTENDANCE_LOCKED` | HR locked payroll for this date | Show dialog: "Payroll locked" |
| `400` | `MAX_BREAKS_EXCEEDED` | Reached daily break limit | Show error toast |
