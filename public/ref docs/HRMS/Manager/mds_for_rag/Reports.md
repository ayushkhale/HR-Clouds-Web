---
title: "Reports & Analytics — Availability Status for the Manager Role"
role: "manager"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Reports.md"
last_verified: "2026-09-10"
tags: ["manager reports", "analytics", "report builder", "export", "excel", "pdf", "headcount report", "turnover report", "automated reports", "team summary", "not available", "not implemented"]
---

# Reports & Analytics — Availability Status for the Manager Role

**Document Information**
Role: Manager · Availability: Not currently available (no reporting feature for Managers) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. This document states the verified availability of reports and
> analytics for the Manager role.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Reports & Analytics for a Manager

**Status: Not currently available.** There is no reporting or analytics feature for the Manager role. A Manager cannot build custom reports, export data to Excel or PDF, generate HR reports (headcount, turnover, leave, payroll), or schedule automated reports, because **no reporting module is implemented for Managers**.

## 2. Important Distinction — "Reports" vs "Direct Reports"

The word "reports" is used two ways in this platform, and they must not be confused:

- **Reports (documents/analytics):** downloadable or built reports and dashboards — **not implemented for Managers**.
- **Direct reports (people):** the employees who report to a Manager in the org hierarchy — a core, implemented concept used throughout attendance, leave, and payroll.

Almost everything in the codebase that mentions "report" refers to the **reporting hierarchy** (direct reports), not to report documents. This document is about report **documents/analytics**, which do not exist for Managers.

## 3. What Does Exist — In-Product Team Views (Not a Reporting Feature)

A Manager does have some **aggregated views** built into the operational screens, but these are not a reporting feature and cannot be built, scheduled, or exported:

- **Team attendance summary and trend** (Dashboard / Attendance & Leave Management).
- **Team payroll summary** for an approved/paid run (Payroll & Compensation).

These are read-only operational views. There is no report builder, no custom report, no scheduled/automated report, and no export to Excel or PDF for a Manager.

## 4. Capabilities Described in Planning Documents but Not Implemented

The following were described in older material and are **not** available to a Manager:

- HR reports: headcount, turnover, leave, payroll.
- A custom report builder.
- Export to Excel / PDF.
- Automated monthly reports.

## 5. A Note on Attendance Reports

The attendance module does contain report endpoints (daily, monthly, and per-employee attendance reports), but these are **HR-only** — they are not exposed to the Manager role. A Manager cannot generate these attendance reports.

## 6. Where Related Needs Are Handled Today

There is no Manager reporting feature. For day-to-day oversight, a Manager uses the in-product team summaries on the dashboard and the payroll/attendance team views. For formal reports (headcount, turnover, exports), those are HR functions where they exist at all.

## 7. Related Manager Documents

- **Dashboard Overview** — the team attendance trend and status views.
- **Attendance & Leave Management** — team attendance summaries (HR owns the formal attendance reports).
- **Payroll & Compensation** — team payroll summaries for finalized runs.
- **HRMS Manager Panel** — the overall capability index.

## 8. Common Manager Questions

### Can I export a headcount or turnover report?
No. There is no reporting or export feature for Managers. Headcount/turnover/leave/payroll reports and Excel/PDF export are not available.

### Can I build a custom report?
No. There is no report builder in the platform for Managers.

### But I can see a team attendance summary — isn't that a report?
That is an in-product operational view, not a reporting feature. You cannot customize, schedule, or export it. There is no report builder or export for Managers.

### Can I generate the daily or monthly attendance report?
No. Those attendance report endpoints exist but are HR-only; a Manager cannot generate them.

### When people say "reports", do they mean my team?
Often, yes — "direct reports" means the people who report to you, which is a core implemented concept. Report **documents/analytics**, by contrast, are not implemented for Managers.

## 9. Known Documentation Corrections

| Previously stated (source feature document) | Verified reality |
| --- | --- |
| HR Reports: Headcount, Turnover, Leave, Payroll | Not available to Managers |
| Custom Report Builder | Not implemented |
| Export to Excel/PDF | Not available to Managers |
| Automated Monthly Reports | Not implemented |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and route definitions across the mounted modules.

**Confirmed unavailable to Managers:** Custom report builder, HR reports, Excel/PDF export, automated/scheduled reports.
**Confirmed to exist as operational views (not a reporting feature):** Team attendance summary/trend and team payroll summary — read-only, not exportable or configurable.
**Confirmed HR-only:** Attendance report endpoints (daily/monthly/per-employee).
**Search notes:** Nearly all "report" references in the codebase are the reporting hierarchy (direct reports), not report documents.
**Could not be verified (excluded from this document):** None.
