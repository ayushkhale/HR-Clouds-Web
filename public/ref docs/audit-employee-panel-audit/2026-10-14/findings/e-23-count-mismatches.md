# E-23 — Org — stats disagree with list endpoints; work-mode and punctuality disagree

- **Severity:** Low
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Org details stats: department_count 9 vs 16 department rows; location_count 15 vs 18 location rows. Profile work_mode 'hybrid' vs today record work_mode 'office'. Punctuality: summary/graph 83.33 vs trends top-level 87.8. Attendance % 66.67 with final_present 6 / final_absent 3 / final_leave 12 (sums past eligible 21).

- **Expected fix:**

Derive stats from the same queries as the lists, define punctuality once, and document what final_* counts include.

- **Evidence / corroboration:**

API-verified.

- **Status:** Observed during audit. No data was modified.
