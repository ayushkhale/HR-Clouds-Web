# E-11 — Attendance — future-dated 31 Dec 2026 records treated as real

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Anomalies, regularizations (3 identical 'Future date test' rows, two approved) and overtime (90 min, approved) all carry date 2026-12-31 — over two months in the future — with approval timestamps in the past. A future 'early_exit' anomaly and future overtime feed totals and the approvals queue.

- **Expected fix:**

Reject future dates for attendance/regularization/overtime creation (or quarantine them as test data), and add a date sanity check: approved_at must not precede the record date.

- **Evidence / corroboration:**

Browser: Regularizations page screenshot shows the duplicated 31 Dec 2026 rows.

- **Status:** Observed during audit. No data was modified.
