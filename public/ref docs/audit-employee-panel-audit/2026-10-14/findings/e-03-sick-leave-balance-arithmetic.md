# E-03 — Leaves — Sick Leave balance does not add up

- **Severity:** High
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Sick Leave: total_accrued '10.00', total_used '2.00', carried_forward '0.00', but current_balance '10.00' (expected 8.00). All other five balances reconcile (Annual 15−4=11, Casual 5−0=5, LWP 365, ECL 1.50, Paternity 3.50). A 2-day error on a paid balance is payroll-adjacent.

- **Expected fix:**

Fix the balance computation (or the stale balance write) and add a server-side invariant test: balance == accrued + carried_forward − used − lapsed. Show the breakdown in UI so errors are visible.

- **Evidence / corroboration:**

Browser: Sick Leave card shows 10 with used 2 — same contradiction visible in UI.

- **Status:** Observed during audit. No data was modified.
