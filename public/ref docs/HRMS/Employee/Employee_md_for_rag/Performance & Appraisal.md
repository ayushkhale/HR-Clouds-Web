---
title: "Performance & Appraisal — Availability Status for the Employee Role"
role: "employee"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Performance & Appraisal.md"
last_verified: "2026-09-10"
tags: ["performance", "appraisal", "kpi", "goals", "self-assessment", "performance rating", "feedback", "review cycle", "not available"]
---

# Performance & Appraisal — Availability Status for the Employee Role

**Document Information**
Role: Employee · Availability: Not currently available · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Performance & Appraisal

**Status: Not currently available.** There is no performance or appraisal capability for the Employee role in the platform today. An employee cannot view a performance rating, track goals or KPIs, submit a self-assessment, or take part in an appraisal cycle, because no performance and appraisal feature is implemented.

## 2. What This Means for an Employee Today

An employee has no performance dashboard, no goal or KPI tracker, no self-assessment form, and no appraisal history in the platform. Performance reviews, ratings, and feedback are handled through whatever process an employee's organization runs outside the platform.

## 3. Capabilities Described in Planning Documents but Not Implemented

The following were described in a requirements document and are not available to an employee:

- A performance review dashboard with past and current results
- KPI and goal tracking, weightage, milestones, and deadline reminders
- Manager, peer, and 360-degree feedback
- A self-assessment portal for appraisal cycles
- An appraisal cycle tracker (Pending, Under Review, Completed) and historical reports
- Rating bands, performance grades, and downloadable performance reports
- A dispute or clarification loop on appraisals

## 4. Where Related Needs Are Handled Today

There is no in-platform performance or appraisal feature. An employee should follow their organization's own review process outside the platform.

One related point prevents confusion: the platform's Payroll module supports **performance-linked bonus rules**, which are set up and configured by HR. If a bonus results from such a rule, an employee may see that bonus amount in the Payroll, Salary & Tax section. This is a payroll outcome only — it is **not** an appraisal feature, and it does not let an employee view ratings, set goals, or complete a review. Bonuses are described in the Payroll, Salary & Tax document.

## 5. Common Employee Questions About Performance & Appraisal

### Where do I see my performance rating?
Performance ratings are not available in the platform. There is no performance or appraisal feature, so no rating is shown. Your organization will share appraisal outcomes through its own process.

### How do I submit my self-appraisal or self-assessment?
There is no self-assessment feature in the platform. Self-appraisals are handled through your organization's own review process, not here.

### How do I set or track my goals and KPIs?
Goal and KPI tracking is not available in the platform, because no performance feature is implemented. Track goals through whatever method your organization uses.

### I received a bonus — was that from an appraisal in the system?
Not from an appraisal feature — none exists. A bonus may come from a performance-linked bonus rule that HR configures in Payroll, and you may see the resulting amount in the Payroll, Salary & Tax section. There is still no rating, review, or appraisal record for you to view.

### Can I give or see peer feedback?
No. Peer and manager feedback tools are not available in the platform, because no performance and appraisal feature exists.

## 6. Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and API documentation.

**Confirmed unavailable:** Performance dashboard, KPI/goal tracking, self-assessment, appraisal cycles, ratings, feedback tools, appraisal disputes.
**Related capability that exists elsewhere:** Performance-linked **bonus rules** exist in Payroll and are configured by HR; a resulting bonus may appear in the Payroll, Salary & Tax section. This is not an appraisal feature.
**Search notes:** No appraisal module exists. A search for "performance" returns matches only in the Payroll module, all relating to **bonus rules** — an unrelated concept.
**Could not be verified (excluded from this document):** None.
