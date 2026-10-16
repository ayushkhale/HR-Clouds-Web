# E-17 — Attendance — 96 anomalies, all unresolved, incl. 415 km out-of-bounds

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

/attendance/anomalies/mine: total 96, sampled records all is_resolved=false. Includes out_of_bounds clock-ins/outs ~415 km from the assigned office ('Nearest: HR-VISTA JABALPUR OFFICE at 415443m, radius 100m') on days the employee is otherwise 'present', and a future 31 Dec anomaly.

- **Expected fix:**

Surface an anomalies inbox with one-tap regularization per anomaly, resolve/age them, and explain geofence failures (assigned Bhopal office vs Jabalpur nearest) instead of leaving 96 silent rows.

- **Evidence / corroboration:**

API-verified; UI regularization page shows the queue.

- **Status:** Observed during audit. No data was modified.
