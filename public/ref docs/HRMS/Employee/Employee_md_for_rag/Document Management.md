---
title: "Document Management — Availability Status for the Employee Role"
role: "employee"
module: "none"
status: "not-implemented"
ui_available: "none"
source_document: "Document Management.md"
last_verified: "2026-09-10"
tags: ["document management", "upload documents", "hr documents", "offer letter", "aadhar", "pan card", "e-signature", "acknowledgment", "certificates", "not available"]
---

# Document Management — Availability Status for the Employee Role

**Document Information**
Role: Employee · Availability: Not currently available · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. Current Availability of Document Management

**Status: Not currently available.** There is no document management capability for the Employee role in the platform today. An employee cannot store, upload, view, download, acknowledge, or electronically sign HR documents through the platform, because no document management feature is implemented.

## 2. What This Means for an Employee Today

An employee has no document library, no personal document upload area, and no acknowledgment or e-signature workflow in the platform. Documents such as an appointment letter, employment contract, policy document, PAN card, or Aadhaar card cannot be uploaded to or retrieved from the platform by an employee. Any handling of these documents happens through whatever process an employee's organization uses outside the platform.

There is one narrow, related capability that does exist, and it belongs to Leave, not to Document Management: see Section 4.

## 3. Capabilities Described in Planning Documents but Not Implemented

The following were described in a requirements document and are not available to an employee:

- Centralized access to HR documents (appointment letters, employment contracts, non-disclosure agreements, company policies, promotion or increment letters)
- Uploading personal or statutory documents (PAN card, Aadhaar card, educational certificates, experience letters, medical certificates)
- Digital signature and e-signature on offer letters, agreements, or policy updates
- Acknowledgment tracking for policies, with legal audit trail
- Automated document expiry and renewal reminders
- Downloadable templates and forms
- Document-level role-based access control

## 4. Where Related Needs Are Handled Today

There is exactly one genuine, verified alternative, and it is limited:

- **A supporting document can be attached to a leave request** as a web link. When a leave type requires supporting evidence, the leave application accepts a document reference in the form of a URL (a link to a document that is already hosted somewhere). This is a link reference only — it is **not** a file upload, and it is not a general document store. It is described in the Leave Management document.

For every other document need — storing an offer letter, uploading identity proof, acknowledging a policy, or signing a document — there is no platform feature. An employee should follow the process their HR or administration team provides outside the platform.

## 5. Common Employee Questions About Document Management

### How do I upload my Aadhaar card or PAN card in the system?
There is no facility to upload identity documents such as an Aadhaar card or PAN card in the platform. No document upload feature exists for employees. Provide these documents to your HR team through the process your organization uses.

### Where can I find and download my offer letter or employment contract?
The platform does not store or provide HR documents such as offer letters or employment contracts for employees to download. There is no document library. Contact your HR team to obtain these documents.

### How do I acknowledge or e-sign a company policy?
Policy acknowledgment and electronic signing are not available in the platform. There is no acknowledgment or e-signature feature. Your organization will tell you how it records policy acknowledgments.

### Can I attach a document anywhere in the platform?
The only place a document reference can be attached is a leave request, and only as a web link to an already-hosted document — not as an uploaded file. This is part of Leave Management, not a document management feature. See the Leave Management document.

### Will I get reminders when my ID proof or certificate is about to expire?
No. The platform does not track document expiry and does not send renewal reminders, because no document management feature exists.

## 6. Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application source code and API documentation.

**Confirmed unavailable:** Document storage, document upload, HR document access/download, e-signature, acknowledgment tracking, expiry reminders, document templates.
**Related capability that exists elsewhere:** A document **link** (URL) may be attached to a leave request when the leave type requires it — documented under Leave Management.
**Search notes:** A search for document-related code across the platform returns matches only in the Leave module (leave supporting-document links) and in Payroll statutory logic. No document management feature exists — these matches are unrelated to a document store.
**Could not be verified (excluded from this document):** None.
