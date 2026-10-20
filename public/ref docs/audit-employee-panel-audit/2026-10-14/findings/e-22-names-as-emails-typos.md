# E-22 — Directory — actor names render as email addresses; dept typo

- **Severity:** Low
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

reporting_person_details.name, HR contact name, task assigner name and overtime/regularization approver display all equal the person's email (abhishekganeshe33@gmail.com). HR department reads 'Solid Waste Managment' (missing 'e'). Employee code 'EMP=002' breaks the EMP-00N pattern (see also E-09 hierarchy).

- **Expected fix:**

Resolve actor ids to display names (the hierarchy endpoint already has real names); fix the department spelling; normalise employee codes.

- **Evidence / corroboration:**

API-verified across profile, org details, hierarchy, tasks, overtime, regularizations.

- **Status:** Observed during audit. No data was modified.
