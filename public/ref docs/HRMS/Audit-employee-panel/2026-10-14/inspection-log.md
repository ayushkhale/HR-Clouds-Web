# Inspection log — Employee Panel audit (2026-10-14, IST, read-only)

## 07:56 — Brief received
- Prompt 2: Employee Panel UI/UX, Data-Parity & API Utilization Audit. Credentials supplied in-prompt (transient use only).

## 08:0x — Discovery
- Fetched https://frontend.dev.hrclouds.in/auth/login (Vite SPA, bundle index-LpB6Qxkm.js, 476 KB).
- API base confirmed: https://development.hrclouds.in/api/v1.
- Employee routes extracted from bundle: /dashboard/employee, /attendance (+anomalies/comp-offs/overtime/regularizations), /leaves, /payroll/{my-salary,my-payslips,tax,loans,reimbursements}, /documents(+/all), /company, /company-documents, /document-requests, /forms, /tasks, /org-chart, /dashboard/profile.
- API chunks (attendance.api, leave.api, payroll.api, documents.api, tasks.api) yielded the employee GET inventory used for the sweep.

## 08:0x — Authentication
- POST /api/v1/auth/login {identifier, password} → 200, requires_org_selection=true, 2 orgs (both role employee).
- Selected HR-Vista Soft Solutions Private Limited (org_id 8edac489…) via POST /api/v1/auth/select-organization (Bearer selection_token) → 200, role employee. Token kept in a memory-only /tmp file, never written to the workspace.
- Browser task steered to the same org on its workspace selector.

## 08:0x — API sweep (GET only)
- 52 endpoints swept: 40+ ×200; 403 on /leaves/types, /leaves/templates, /organizations/me/setup-status; 404 on bare /comp-offs, /overtime, /regularizations, /organizations/me/job-profile, /organizations/profile, /payroll/me/tax/regime, /documents/me.
- Detail checks: 2 payslip-detail GETs + 1 payslip-PDF header check (200, application/pdf, 92,908 bytes; body discarded).
- Total captured records: 55 (see network-capture.json, PII-redacted).

## 08:0x — Browser UI walkthrough
- Login → org selector (paused once for org choice; steered to HR-Vista) → all Employee routes visited; Apply Leave / Regularization / Edit Profile modals opened and Cancel-closed; nothing submitted, punched, downloaded or paid.
- Browser returned a structured summary + 1 screenshot (Regularizations page, duplicated rows). Its full per-page report was not delivered, so UI-only claims in the main report are labelled browser-observed and API-corroborated wherever possible; nothing was invented.
- DevTools Console/Network not accessible via browser tooling → marked NOT VERIFIED.

## 08:0x — Package build
- Compiled network-capture.json (redacted), api-ui-data-mapping.json (15 mappings), 24 findings/*.md, README.md, this log; generated XLSX + PDF; copied evidence screenshot; zipped.

## Not verified this pass
- Browser console errors (no DevTools in tooling).
- Duplicate API requests per user action (no DevTools network timeline).
- Mobile-device layout.
- Compunic org (second workspace).
- Historical months other than Oct 2026 (except trends Aug–Oct summaries).
