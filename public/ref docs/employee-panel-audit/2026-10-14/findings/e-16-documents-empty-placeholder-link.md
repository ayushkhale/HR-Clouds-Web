# E-16 — Documents — repository empty; one leave doc link is a placeholder

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

/documents/me/documents, /documents/me/hr-documents and /documents/templates all return total 0 — no offer letter, appointment letter, policy documents or ID proofs for this employee. Meanwhile a leave request's document_url points to https://storage.example.com/docs/medical_cert.pdf — an example.com placeholder, likely unreachable from the UI.

- **Expected fix:**

Seed/link the real employee documents, validate document URLs on save (reject example.com/placeholder hosts), and add a 'Request document' CTA to the empty state.

- **Evidence / corroboration:**

Browser: documents pages empty. API: 0/0/0.

- **Status:** Observed during audit. No data was modified.
