# HR Clouds — Employee Panel UI/UX, Data-Parity & API Utilization Audit

**Role:** Employee · **Account:** rishi@gmail.com (test account) · **Org:** HR-Vista Soft Solutions Private Limited
**Date:** 2026-10-14 (IST) · **Method:** Read-only — live-browser UI walkthrough (nothing submitted) + direct API capture (login + org-select POSTs, then GETs only).
**Scores:** UI/UX 6/10 · API Data Utilization 5/10 · **Findings:** 24 (1 Critical, 6 High, 12 Medium, 5 Low).

## Contents

| File | What it is |
| :--- | :--- |
| `employee-panel-audit-report.md` | Main report (§1 Executive Summary, §2 Page-by-Page Parity, §3 Defects Log, §4 Recommendations, §5 Console/Network) |
| `employee-panel-audit-report.pdf` | Same report as PDF |
| `employee-panel-findings.xlsx` | Findings, parity, endpoints, performance in workbook form |
| `network-capture.json` | 55 redacted API records (PII redacted, tokens removed, script-text payloads described not reproduced) |
| `api-ui-data-mapping.json` | 15 API ↔ UI route mappings with parity status |
| `findings/*.md` | One file per finding (E-01 … E-24) |
| `evidence/regularizations-duplicate-rows.png` | Browser screenshot: Regularizations page, duplicated 31 Dec 2026 rows |
| `inspection-log.md` | Timestamped log of what was done |

## Key findings (see report §3 for detail)

1. **E-01 (Critical)** — Stored script-text payloads in profile address + a leave reason; injection-probe task text.
2. **E-02** — Negative `effective_hours` (-0.04) with formatted `-1h 58m`; `absent` despite punches.
3. **E-03** — Sick Leave 10 − 2 shows balance 10.
4. **E-04 / E-05** — September paid but all tax fields zero; Sep payslip statutory `not_applied`.
5. **E-06** — Triplicated upcoming bonus/recovery adjustments + a `TEST_PERF_BONUS` row.
6. **E-07** — EPS equals PF instead of 8.33% of PF wage.

## NOT VERIFIED (do not treat as clean)

- Browser console errors/warnings (no DevTools in tooling).
- Duplicate API requests per user action (no DevTools network timeline).
- Mobile-device layout (recommendation only).
- Compunic org (second workspace on the same account) — not audited.

## Boundaries

Read-only throughout. No leave applied, no regularization requested, no profile edited, no punch in/out, no PDF content saved. Credentials/tokens were transient and appear nowhere in this package. PII (PAN, UAN, contacts, addresses, DOB, bank identifiers) is redacted.
