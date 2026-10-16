---
title: "Performance Management — Availability Status for the Manager Role"
role: "manager"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Performance Management.md"
last_verified: "2026-09-10"
tags: ["manager performance", "appraisal", "okr", "kpi", "performance review", "goal tracking", "feedback", "performance report", "training needs", "not available", "not implemented"]
---

# Performance Management — Availability Status for the Manager Role

**Document Information**
Role: Manager · Availability: Not currently available · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. This document states the verified availability of performance
> management for the Manager role.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Performance Management

**Status: Not currently available.** There is no performance or appraisal capability for the Manager role in the platform today. A Manager cannot set or track OKRs or KPIs, schedule or record appraisals, view performance reviews or feedback, generate performance reports, or identify training needs, because **no performance and appraisal feature is implemented**.

## 2. What This Means for a Manager Today

A Manager has no performance dashboard, no goal or KPI tracker, no appraisal cycle, no review or feedback tools, and no performance reports. Performance reviews, ratings, and feedback are handled through whatever process the organization runs outside the platform.

## 3. Capabilities Described in Planning Documents but Not Implemented

The following were described in older material and are **not** available to a Manager:

- Setting and tracking OKRs / KPIs for the team.
- Scheduling and recording appraisals.
- Viewing performance reviews and feedback.
- Generating performance reports.
- Identifying training needs.

## 4. One Related Point That Prevents Confusion

The platform's Payroll module supports **performance-linked bonus rules** as one concept in bonus configuration. This is a **payroll** mechanism, not an appraisal feature: it does not let a Manager set goals, record ratings, or run a review. In fact, within the manager bonus-rule workflow, a manager's targets must use a **manual** eligibility source, and a general "performance rating" population source is not usable there. Any bonus outcome is a payroll result only, described in the Payroll & Compensation document.

## 5. Where Related Needs Are Handled Today

There is no in-platform performance or appraisal feature. A Manager should follow the organization's own review process outside the platform. The nearest real levers a Manager has over their team are attendance/leave oversight (see Attendance & Leave Management) and proposing bonuses (see Payroll & Compensation) — neither is a performance-review feature.

## 6. Related Manager Documents

- **Payroll & Compensation** — performance-linked bonus rules live here as a payroll concept.
- **Attendance & Leave Management** — team oversight a Manager does have.
- **HRMS Manager Panel** — the overall capability index.

## 7. Common Manager Questions

### How do I run an appraisal for my team?
Appraisals are not available in the platform. There is no performance or appraisal feature, so a Manager cannot schedule or record one. Use your organization's own review process.

### Where do I set my team's goals or KPIs?
Goal and KPI tracking is not available, because no performance feature is implemented.

### Can I see or give performance feedback?
No. Review and feedback tools are not available in the platform for Managers.

### I proposed a performance-linked bonus — is that an appraisal?
No. Performance-linked bonus rules are a payroll concept configured through the bonus workflow, not an appraisal. For a manager's bonus proposal, targets use a manual eligibility source. There is no rating, review, or appraisal record.

### Can I generate a performance report for my team?
No. Performance reports are not available, because no performance feature exists.

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and route definitions across the mounted modules.

**Confirmed unavailable:** Performance dashboard, OKR/KPI tracking, appraisal scheduling/recording, reviews, feedback tools, performance reports, training-need identification.
**Related capability elsewhere:** Performance-linked **bonus rules** exist in Payroll as a payroll concept; a bonus is a payroll outcome, not an appraisal.
**Search notes:** No appraisal/OKR/KPI module exists. The only "performance" reference is the string `performance_rating` in payroll bonus-rule configuration — an unrelated concept, not usable as a manager bonus-rule population source.
**Could not be verified (excluded from this document):** None.
