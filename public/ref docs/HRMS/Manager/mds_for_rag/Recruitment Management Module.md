---
title: "Recruitment Management — Availability Status for the Manager Role"
role: "manager"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Recruitment Management Module.md"
last_verified: "2026-09-10"
tags: ["manager recruitment", "job posting", "interview", "candidate", "hiring", "offer letter", "onboarding", "applicant tracking", "not available", "not implemented"]
---

# Recruitment Management — Availability Status for the Manager Role

**Document Information**
Role: Manager · Availability: Not currently available · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. This document states the verified availability of recruitment
> management for the Manager role.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Recruitment Management

**Status: Not currently available.** There is no recruitment capability for the Manager role in the platform today. A Manager cannot create or post job openings, schedule interviews, assign interview panels, track candidate progress, or manage offer letters, because **no recruitment feature is implemented**. There is no recruitment module, endpoint, or screen.

## 2. What This Means for a Manager Today

A Manager has no job-posting tool, no interview scheduler, no candidate pipeline, and no offer-management workflow. Hiring is handled through whatever process the organization runs outside the platform.

## 3. Capabilities Described in Planning Documents but Not Implemented

The following were described in older material and are **not** available to a Manager:

- Creating and posting job openings.
- Scheduling interviews and assigning panels.
- Tracking candidate progress through a pipeline.
- Managing offer letters and onboarding documents for candidates.

## 4. A Distinction That Prevents Confusion

The organization module has **user onboarding** and **invitation** features — but these invite and set up **existing hires as users of the organization**; they are not recruitment (there is no job posting, applicant tracking, or interview management). Inviting a person to join the organization as a user is not the same as recruiting a candidate. Organization onboarding and invitations are described in the organization/employee documentation, not here.

## 5. Where Related Needs Are Handled Today

There is no in-platform recruitment feature. A Manager should follow the organization's own hiring process outside the platform. Once a hire exists as an organization user, HR handles employee setup (see Employee Management Panel — note that adding employees is HR-only, not a Manager capability).

## 6. Related Manager Documents

- **Employee Management Panel** — how existing employees are viewed/edited (HR adds them); onboarding/invitation is an organization function, not recruitment.
- **HRMS Manager Panel** — the overall capability index.

## 7. Common Manager Questions

### Can I post a job opening?
No. Job posting is not available, because no recruitment feature is implemented.

### Can I schedule an interview or assign a panel?
No. There is no interview scheduling or panel assignment in the platform.

### Can I track candidates through a hiring pipeline?
No. There is no applicant tracking or candidate pipeline.

### Isn't sending an invitation the same as recruiting someone?
No. The organization's invitation/onboarding feature adds an existing hire as a user of the organization; it is not recruitment. There is no job posting, applicant tracking, or interview management.

### How do I make an offer to a candidate?
Offer-letter management is not available in the platform. Handle offers through your organization's own process.

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and route definitions across the mounted modules.

**Confirmed unavailable:** Job postings, interview scheduling, panel assignment, candidate/applicant tracking, offer-letter management.
**Related but different:** The organization module's onboarding and invitation features add existing hires as org users; they are not recruitment.
**Search notes:** No recruitment/interview/job/applicant module exists. The term "candidate" appears only inside payroll bonus-rule population logic (an internal concept), never as a job candidate.
**Could not be verified (excluded from this document):** None.
