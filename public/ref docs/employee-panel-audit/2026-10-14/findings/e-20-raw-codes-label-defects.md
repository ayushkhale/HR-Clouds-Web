# E-20 — UI polish — raw codes and mislabelled components leak into the UI

- **Severity:** Low
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Browser: leave UI shows raw codes ECL_2026 and PAT_2026 instead of display names. Salary: component_code AI_RECHARGE is named 'Executive Special Performance Allowance' (code/name mismatch); BASIC and AI_RECHARGE share display_order 10; HRA row has is_hra=false.

- **Expected fix:**

Use display names everywhere; fix the AI_RECHARGE code or name; give every component a unique display_order; set is_hra=true for HRA.

- **Evidence / corroboration:**

Browser + API.

- **Status:** Observed during audit. No data was modified.
