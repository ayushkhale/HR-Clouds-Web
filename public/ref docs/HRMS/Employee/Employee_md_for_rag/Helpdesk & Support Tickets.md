---
title: "Helpdesk & Support Tickets — Availability Status for the Employee Role"
role: "employee"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Helpdesk & Support Tickets.md"
last_verified: "2026-09-10"
tags: ["helpdesk", "support ticket", "raise a ticket", "it ticket", "hr query", "sla", "ticket status", "not available"]
---

# Helpdesk & Support Tickets — Availability Status for the Employee Role

**Document Information**
Role: Employee · Availability: Not currently available · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Helpdesk & Support Tickets

**Status: Not currently available.** There is no helpdesk or support-ticket capability for the Employee role in the platform today. An employee cannot raise a ticket, track a ticket, or message a support team, because no helpdesk feature is implemented.

## 2. What This Means for an Employee Today

An employee has no way to log a support request — for HR, IT, Admin, Payroll, or Facilities — through the platform. There is no ticket form, no ticket categories or priorities, no ticket status to follow, and no in-platform messaging with a support team. Queries and service requests are handled through whatever channel an employee's organization already uses.

## 3. Capabilities Described in Planning Documents but Not Implemented

The following were described in a requirements document and are not available to an employee:

- Raising support tickets and choosing a category (HR, IT, Admin, Payroll, Facilities)
- Attaching screenshots or documents to a ticket
- Ticket categorization, priority levels, and auto-routing to a department
- Real-time ticket status tracking (Open, In Progress, Resolved, Closed) and history
- In-ticket messaging or chat with a support team
- Service Level Agreement (SLA) timers, escalation, and SLA reporting
- Post-resolution rating, mandatory feedback, and ticket reopening
- Ticket analytics and reports

## 4. Where Related Needs Are Handled Today

There is no in-platform helpdesk. An employee should raise HR, IT, or administrative requests through their organization's existing support channel — for example a shared mailbox, an internal portal, or a direct contact — as directed by their organization. The platform does not provide any of this.

## 5. Common Employee Questions About Helpdesk & Support Tickets

### How do I raise an IT support ticket?
Raising IT support tickets is not available in the platform. There is no helpdesk or ticketing feature. Use your organization's existing IT support channel.

### How do I raise an HR query or service request?
The platform has no ticketing or service-request feature, so HR queries cannot be logged here. Contact your HR team through the channel your organization uses.

### How do I check the status of a ticket I raised?
There is no ticket tracking in the platform because no helpdesk feature exists. Follow up through the same channel where you raised your request.

### Can I attach a screenshot to a support request?
No. There is no support-ticket feature and therefore no attachment capability for tickets. Share screenshots through your organization's existing support channel.

### Is there an SLA or escalation for my requests in the platform?
No. The platform does not track service-level agreements or escalations, because no helpdesk feature is implemented.

## 6. Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and API documentation.

**Confirmed unavailable:** Ticket submission, ticket categorization and priorities, ticket tracking, in-ticket messaging, SLA tracking, ticket feedback and analytics.
**Search notes:** No helpdesk or ticketing module exists anywhere in the platform. A search for "ticket" returns a single incidental match in the authentication code (an internal session token concept), which is unrelated to support tickets.
**Could not be verified (excluded from this document):** None.
