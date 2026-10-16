---
title: "Communication & Collaboration — Availability Status for the Employee Role"
role: "employee"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Communication & Collaboration.md"
last_verified: "2026-09-10"
tags: ["communication", "collaboration", "chat", "messaging", "announcements", "notifications", "surveys", "suggestion box", "feedback", "not available"]
---

# Communication & Collaboration — Availability Status for the Employee Role

**Document Information**
Role: Employee · Availability: Not currently available · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Communication & Collaboration

**Status: Not currently available.** There is no communication or collaboration capability for the Employee role in the platform today. An employee cannot chat or message colleagues, receive announcements or push notifications, or use surveys or a suggestion box, because no communication and collaboration feature is implemented.

## 2. What This Means for an Employee Today

An employee has no messaging or chat, no group conversations, no announcement board, no in-platform notifications, and no survey or suggestion tools. Communication within an organization happens through whatever tools an employee's organization already uses outside the platform.

## 3. Capabilities Described in Planning Documents but Not Implemented

The following were described in a requirements document and are not available to an employee:

- One-on-one and group chat or messaging, with message history and file sharing
- A company-wide announcement or bulletin board
- Push notifications and targeted or segment-based messaging
- A suggestion box with idea voting
- Surveys and structured feedback forms

## 4. Where Related Needs Are Handled Today

There is no in-platform communication or collaboration feature. An employee should use their organization's existing communication tools outside the platform.

One point prevents a misunderstanding: some workflows include a free-text **remarks** or **reason** field — for example, the reason on a leave request or a regularization request. Those fields describe a specific request to the person reviewing it; they are **not** a messaging or chat feature and cannot be used to communicate with colleagues generally. They are described in the Leave Management and Attendance documents.

## 5. Common Employee Questions About Communication & Collaboration

### How do I message or chat with a colleague in the platform?
Messaging and chat are not available in the platform. There is no communication or collaboration feature. Use your organization's existing communication tools.

### Where do I see company announcements?
The platform does not have an announcement or bulletin board, because no communication feature is implemented. Company announcements are shared through your organization's own channels.

### Will I get notifications inside the platform?
No. There is no in-platform notification system, because no communication and collaboration feature exists.

### How do I submit an idea or suggestion, or respond to a survey?
A suggestion box and surveys are not available in the platform. There is no such feature. Your organization will tell you how it collects ideas and feedback.

### The leave form has a remarks box — is that a way to message HR?
No. The remarks or reason field on a leave or regularization request is only a note attached to that specific request for the reviewer. It is not a messaging feature and cannot be used for general communication.

## 6. Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and API documentation.

**Confirmed unavailable:** Chat and messaging, group conversations, file sharing, announcements, push notifications, surveys, suggestion box, feedback forms.
**Related detail:** Free-text remarks/reason fields exist within the Leave and Attendance-regularization workflows; these are per-request notes, not a messaging feature.
**Search notes:** No chat, messaging, announcement, notification, or survey code exists anywhere in the platform.
**Could not be verified (excluded from this document):** None.
