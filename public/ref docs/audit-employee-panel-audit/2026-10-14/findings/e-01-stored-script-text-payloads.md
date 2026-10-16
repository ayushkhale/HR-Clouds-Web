# E-01 — Security — stored script-text / injection probes

- **Severity:** Critical
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Backend returns raw script markup in two employee-visible fields: /organizations/me current_address and one /leaves/my-requests reason (pending Annual Leave, 5–6 Nov 2026). A third probe string (SQLi/XSS test text) sits in a /tasks/me task description. The browser saw the profile address rendered as inert text (no execution observed), but the API stores executable-looking markup verbatim.

- **Expected fix:**

Treat as stored-XSS risk until proven otherwise: server-side sanitise on write, encode on render everywhere (never dangerouslySetInnerHTML for these fields), add output-encoding tests, and purge the seeded probe records. Mark console verification NOT VERIFIED (no DevTools).

- **Evidence / corroboration:**

Browser: profile Current Address shows the script text as text. API: values returned verbatim in JSON.

- **Status:** Observed during audit. No data was modified.
