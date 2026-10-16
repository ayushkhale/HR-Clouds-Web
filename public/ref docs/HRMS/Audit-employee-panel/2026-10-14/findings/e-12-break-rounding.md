# E-12 — Attendance — sub-second breaks rounded up to whole minutes

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

2026-10-14 has 3 breaks of ~1.4 s, ~0.8 s and ~1.4 s, each stored as duration_minutes 1. Total break_duration_minutes 3 exceeds the entire 23-second session. Minute-level rounding inflates breaks whenever sessions are short or break punches are rapid.

- **Expected fix:**

Store break durations in seconds, round only at display, and guard: break total must not exceed session length.

- **Evidence / corroboration:**

API-verified (today + daily-log breaks arrays).

- **Status:** Observed during audit. No data was modified.
