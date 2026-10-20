# E-02 — Attendance — negative effective hours & negative formatted duration

- **Severity:** High
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

2026-10-14: status 'absent' despite clock-in 01:14:26Z and clock-out 01:14:49Z (23 s session, 06:44 IST, before 09:30 shift start). effective_hours '-0.04', total_hours '0.01', early_exit_minutes 705. /attendance/daily-log worked_duration_formatted is '-1h 58m'. The same negative-hours defect class was found in the HR-panel audit (UI-002/API-002) — it persists employee-side.

- **Expected fix:**

Clamp effective_hours at >= 0 at calculation time; never format a negative duration — show '0h 0m' + an 'insufficient punch' flag. Reconcile status: a day with punches should not read plain 'absent' without explanation.

- **Evidence / corroboration:**

Browser: attendance status-vs-punch contradictions observed. API: -0.04 in today/history/weekly-calendar/daily-log.

- **Status:** Observed during audit. No data was modified.
