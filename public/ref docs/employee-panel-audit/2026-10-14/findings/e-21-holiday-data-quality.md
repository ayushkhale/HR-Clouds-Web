# E-21 — Calendar — test-named holiday; optional/mandatory typing is odd

- **Severity:** Low
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Holidays include 'Invalid Day Holiday' (2026-03-02, public) — a test name in production-seed data. Diwali (2026-11-08) and Dussehra (2026-10-20) are typed 'optional' while 'Festival Holiday' (2026-10-15) is 'public'. Graph-data final_leave_days (12) counts holidays + weekly offs as leave, inflating the leave total.

- **Expected fix:**

Remove/rename test holidays, confirm optional vs mandatory typing with HR, and stop counting holidays/weekly-offs in final_leave_days.

- **Evidence / corroboration:**

API-verified. Upcoming: Festival Holiday 15 Oct (public), Dussehra 20 Oct, Diwali 8 Nov, Guru Nanak 24 Nov, Christmas 25 Dec.

- **Status:** Observed during audit. No data was modified.
