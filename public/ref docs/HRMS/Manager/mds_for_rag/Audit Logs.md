---
title: "Audit Logs — Availability Status for the Manager Role"
role: "manager"
module: "none-for-manager"
status: "inaccessible-to-manager"
ui_available: "none"
source_document: "Audit Logs.md"
last_verified: "2026-09-10"
tags: ["manager audit logs", "audit trail", "activity history", "who did what", "compliance report", "action log", "manager actions recorded", "not available", "hr only"]
---

# Audit Logs — Availability Status for the Manager Role

**Document Information**
Role: Manager · Availability: Not accessible to Managers (audit logging exists but is HR-only) · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Manager role in the HRMS platform. At the time of writing, the platform is delivered
> as a backend API with a reference dashboard prototype; a full production user interface
> is not yet released. This document states the verified availability of audit logs for
> the Manager role.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Audit Logs for a Manager

**Status: Not accessible to Managers.** Audit logging exists in the platform, but there is **no audit-log view for the Manager role**. A Manager cannot view, search, or export an audit trail. The one exposed audit-log endpoint belongs to the payroll module and is restricted to **HR**; the Manager role is not admitted.

This is different from "not implemented": the capability exists, but it is reserved for HR.

## 2. Important Distinction — A Manager's Actions Are Still Recorded

A Manager cannot **read** audit logs, but a Manager's actions **are recorded**. Compensation proposals and similar state-changing manager actions capture an actor context (who acted, and request metadata) for auditing. In short: **your actions are logged; you just cannot open the log.** Reviewing that audit trail is an HR function.

## 3. What This Means for a Manager Today

- A Manager has **no audit-log screen** and **no audit-log API**.
- A Manager cannot see a history of "who changed what and when" across the organization or their team.
- A Manager cannot generate compliance or audit reports.
- If a Manager needs an audit record (for example, to confirm when a change was made), they must request it from HR, who holds audit-log access.

## 4. What Was Verified

- Audit **infrastructure** is present in the codebase (an audit service, audit-log models and repositories, and an audit-log query schema).
- The **only** exposed audit-log endpoint is a payroll HR endpoint, guarded for HR. No audit-log route in any mounted module admits the `manager` role.
- Manager payroll actions attach an actor context for audit purposes, confirming that manager actions are captured even though a Manager cannot read the log.

## 5. Capabilities Described in Planning Documents but Not Available to Managers

The following were described in older material and are **not** available to a Manager:

- Viewing all actions performed by managers.
- Tracking logins, changes, and approvals through a log.
- Generating audit reports for compliance.
- Any audit search, filter, or export.

## 6. Where Related Needs Are Handled Today

Audit-log access is an **HR** capability. A Manager who needs an audit record should contact HR. For visibility into their own pending and decided work, a Manager uses the Manager Dashboard's queues and their own payroll proposals list — these are operational views, not an audit trail.

## 7. Related Manager Documents

- **Payroll & Compensation** — where a Manager's proposals are recorded (and where the HR-only audit endpoint lives); see that document.
- **HRMS Manager Panel** — the overall capability index; see that document.

## 8. Common Manager Questions

### Can I view the audit logs for my team?
No. There is no audit-log view for the Manager role. Audit-log access is restricted to HR.

### Are my actions as a Manager recorded?
Yes. Your state-changing actions (such as compensation proposals) are captured with an actor context for auditing. You just cannot read the audit log yourself.

### How do I get an audit report for compliance?
A Manager cannot generate audit reports. Request the audit record from HR, who holds audit-log access.

### Can I see who changed an employee record and when?
Not through any Manager feature. That history is in the audit trail, which is HR-only.

### Is audit logging simply missing from the product?
No — audit logging exists and runs. It is available to HR, not to Managers. This is an access restriction, not a missing feature.

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code (audit service, audit-log models/repositories, and route definitions across the mounted modules).

**Confirmed unavailable to Managers:** Any audit-log view, search, export, or compliance report.
**Confirmed to exist but restricted:** A payroll audit-log endpoint guarded for HR; audit infrastructure (service, models, repositories) is present.
**Confirmed recorded:** Manager state-changing actions attach an actor context for auditing.
**Search notes:** The only audit-log route found is the HR payroll endpoint; no mounted module exposes an audit-log route admitting the `manager` role.
**Could not be verified (excluded from this document):** The complete set of manager action types written to audit storage beyond payroll proposals.
