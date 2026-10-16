# Documents Module — Phase 5 Implementation Plan

**Phase:** 5 of 5 — Templates, Search & Reporting, Offboarding Archive, Integration & Hardening
**Status:** PLANNED (not started)
**Authored:** 2026-09-25
**Prerequisite phases:** Phase 1 (#1–#42) COMPLETE · Phase 2 (#43–#72) COMPLETE · Phase 3 (#73–#79) COMPLETE · Phase 4 (#80–#98) COMPLETE
**Parent specification:** `public/md_documents/implementation_plan.md` §9 (Phase 5), §4, §8, §10, §11, §12, §13
**Baseline at authoring time (measured, not assumed):**
`npx node --test "tests/unit/document/**/*.test.js"` → **540 pass / 0 fail** (re-run 2026-09-25) ·
last migration on disk `00053-create-document-requests-and-notifications.js` ·
last endpoint `#98` · last org-settings registry row `#78` · 5 document cron files exist ·
migrations `00050`, `00051`, `00053` are written but **UNRUN** in the target environment.

> ### Read §31 before writing any code
>
> **§31 "Implementation Hazards — Known Bugs and Traps"** catalogues eighteen defects (B-1 … B-17, plus B-15a)
> that were present in an earlier draft of this plan and have been corrected above. Three of them
> were **fatal** — code that would have thrown on a normal path — and several describe traps in the
> existing P1–P4 code that any Phase 5 change will meet again. Each entry gives the wrong version,
> the right version and the evidence. §31.1 distils them into five checks worth applying to code
> this plan does not cover.
>
> The highest-risk single item for the web client is **B-11** (the leave bridge stores a *relative*
> path in `leave_requests.document_url`). It must be the opening section of change record §28 D-4.

---

## 0. How this plan was derived (Scope Reconstruction)

This plan is **not** a copy of §9 (Phase 5) of the parent. It was reconstructed by reading the
shipped source tree — `src/modules/document/` (76 files), migrations `00049`–`00053`,
`src/modules/payroll/` (the precedent module), `src/modules/leave/`,
`src/modules/organization/services/`, `src/cron-jobs/`, `src/server.js` — and comparing what is
**actually on disk** against every line item §9 assigns to Phase 5, plus every Phase-5-tagged row
in the parent's §10 Edge Case Register, §11 settings table and §13 Open Decisions.

Four verdicts are possible for each parent Phase-5 line item; every one is classified in §3:

| Verdict | Meaning | Action in this plan |
|---|---|---|
| **DONE** | Already implemented in P1/P2/P3/P4. | Recorded in §3.2 with the file and symbol that proves it. **Not planned again.** |
| **PARTIAL** | Half the mechanism shipped; P5 completes it. | Only the *delta* is planned; the shipped half is named as a dependency. |
| **NEW** | Genuinely unbuilt. | Full dossier in §10. |
| **VOID** | No longer applicable, or the responsibility moved. | Recorded in §3.5 with the reason. |

**Honesty guard.** Every "already shipped" claim below cites a file and a symbol. The test count in
the header was produced by running the suite, not by reading a previous report. Nothing here is
asserted as verified against a database: per the parent §12 and the standing project rule,
**migrations are handed back to the operator** and this plan assumes no direct DB access.

---

## 1. Goal & Boundary

### 1.1 Goal

Phases 1–4 built the module's write and automation spine. What is missing is everything an
**auditor, an HR administrator with 800 employees, and a departing employee** need:

1. **Templates** — HR publishes blank forms (reimbursement form, leave application format) that
   employees download. The one requirement from parent §1.1 row 10 that no phase has touched.
2. **Search and reporting** — find a document by metadata; answer "who is missing what" and
   "what expires in the next 60 days"; export any of it as CSV; and keep a durable record of
   **who exported what**.
3. **Offboarding** — when someone leaves, their documents are archived, their open requests are
   cancelled, their unacknowledged policies are waived (never deleted), and HR gets an exit pack.
4. **Integration** — the Leave `document_url` bridge (D-17), the employee-facing composed view that
   also surfaces payroll-owned documents read-only (parent §1.3, D-4), and the on-join recipient
   top-up hook that complements P4's daily cron.
5. **Hardening** — discharge the full §10 edge-case register, measure the §8 performance targets,
   run the §12 security pass, close the documentation debt, and fix the carry-over defects that
   four phases have now recorded and not fixed.

### 1.2 In scope

| # | Item | Verdict | Dossier |
|---|---|---|---|
| 1 | `document_templates` — versioned, type-gated, HR-published downloadable forms | NEW | F-1 |
| 2 | Metadata search over employee documents (title, type, owner, tags, date ranges) + `tags` column | NEW | F-2 |
| 3 | Compliance reports: missing-mandatory roll-up, expiring-in-N-days; CSV for each | PARTIAL (per-employee checklist and per-document acknowledgement report shipped) | F-3 |
| 4 | `document_export_jobs` — the data-egress ledger; retro-wired into the P3 compliance export | NEW | F-3 |
| 5 | Offboarding archive, recipient waiving, open-request cancellation, exit pack | NEW | F-4 |
| 6 | Composed employee document view, incl. read-only delegation to payroll-owned documents | NEW (P2's "read-side composer" was never built — §3.4) | F-5 |
| 7 | Bulk-publish threshold as an org setting + `202` async materialisation path (EC-16) | PARTIAL (`ORG_PUBLISH_SYNC_LIMIT` hard-refuses today) | F-6 |
| 8 | On-join recipient top-up hook (EC-13) | PARTIAL (P4's daily cron shipped) | F-7 |
| 9 | Leave `document_id` bridge (D-17, EC-34) + audience-neutral attachment view-url | NEW | F-8 |
| 10 | Hardening: §10 regression, §8 performance measurement, §12 security pass, carry-over defect fixes | NEW | F-9 |
| 11 | Org settings #79–#81 | NEW | §21 |
| 12 | Documentation close-out incl. the P1/P2/P3 reports that carry-over D-5 has tracked since P3 | NEW | §28 |

### 1.3 NOT in scope (and why)

| Item | Why not |
|---|---|
| Third-party e-signature adapters (DocuSign / Adobe Sign), webhooks, reconciliation | Parent §1.3 lists this as explicitly out of scope and parent Open Decision 4 is **still unanswered** — no vendor, no account, no dependency budget. P3 shipped the `provider` enum and the `503` gate; that seam stays unused. Recorded as VOID-for-P5 in §3.5, not as work. |
| Malware scanning | Parent Open Decision 3 said "confirm before Phase 4"; P4 deferred it to P5 *"with a named provider"*. No provider has been named. The module stays scan-**ready** (`scan_status`, `SCAN_PROVIDER_NOT_CONFIGURED`, `screenDocument` denying only `infected`). §27 O-1. |
| OCR, content extraction, auto-classification, full-text search inside document bodies | Parent §1.3. F-2 is **metadata** search only. |
| Migrating `payroll_attachments` / payslips / Form 16 into this module | Parent §1.3 and D-4. F-5 **delegates**, read-only; no row moves, and this module never signs a payroll object's URL. |
| A ZIP exit pack containing the binaries | Would require `GetObject` streaming every object through Node, breaking P1's "binary never transits Node" boundary. §27 O-2 resolves the exit pack to a **manifest**. |
| Digest emails, manager copies of the new-upload notice | P4 O-9/O-10. Neither is in the parent; both multiply outbound volume and need their own toggles. §27 O-5/O-6. |
| Re-opening a fulfilled request when its document is later deleted or rejected | P4 O-8. Resolved as **no auto-reopen** in §27 O-4; raising a new request is the auditable act. |
| SMS / in-app / push channels | Parent D-16 names email. Unchanged. |
| Any change to the S3 provider's upload/confirm handshake, or to P1's authority matrix | P1 owns both and both are correct. F-8's audience-neutral endpoint **calls** `documentReadService.viewUrl` and adds no new authority rule. |
| New dependencies | D-19. CSV via the existing hand-written `csv_writer.utils`; zero packages added. |

### 1.4 Boundary statements

- **`storage_key` remains unreturned, unlogged and unaudited (D-20).** P5 adds exactly **one** new
  storage-key reader — `document_template.repository.findByIdForStorage` — confined to the template
  service, exactly as `findByIdForStorage` is confined today. The P4 chokepoint test (`tests/unit/document/org_repository_projection.test.js`) is
  **extended**, not replaced, to cover it (§24).
- **No binary transits Node.** Templates use the same pre-signed PUT / HeadObject / pre-signed GET
  handshake as P1 and P2. The exit pack is a manifest of short-TTL signed URLs, not bytes.
- **No Phase-1–4 contract changes** except the additive ones enumerated in §26.1 and the two
  behavioural ones in §26.2 (both of which require the change record).
- **Zero new dependencies (D-19).**
- **Cross-module edits are three files**, each additive: `leave_application.service.js` (F-8),
  `invitation.service.js` (F-7), `employee_tax_summary.repository.js` (F-5, one read method).
  Every hook is contained so a document-module failure cannot fail the host operation — except
  F-8's validation, which is deliberately blocking and explained in §10 F-8.

---

## 2. Pre-Flight Checks

`VERIFIED` means confirmed by reading source during scope reconstruction on 2026-09-25.
`TO VERIFY` means the implementer must confirm at the moment of implementation.

| ID | Check | Status | Evidence / How |
|---|---|:--:|---|
| P-1 | Next migration number is `00054` | VERIFIED | Directory ends at `00053-create-document-requests-and-notifications.js`. If another module claims `00054` first, renumber — the DDL below is number-independent. |
| P-2 | `00050`, `00051`, `00053` are **not yet applied** | VERIFIED (operator-reported) | `00054` must be applied strictly after all three. `00051.down()` destroys legal evidence tables — never roll back past it. |
| P-3 | Next endpoint number is `#99` | VERIFIED | `public/md_system/api_registry.md` Document Module ends at `#98` (`GET /api/v1/documents/me/checklist`). |
| P-4 | Next org-settings registry row is `#79` | VERIFIED | `public/md_settings/org_settings_registry.md` ends at `### 78. Document Onboarding Completeness Threshold`. |
| P-5 | Baseline document suite is green | VERIFIED 2026-09-25 | `npx node --test "tests/unit/document/**/*.test.js"` → 540 pass / 0 fail. **Re-run before the first P5 commit**; if it is not 540/0, reconcile before adding tests. |
| P-6 | `csv_writer.utils.createCsvWriter(headers)` exists and is already consumed cross-module | VERIFIED | `src/modules/payroll/utils/csv_writer.utils.js`; `document_compliance.service.js:13` already requires it. F-3 reuses it; **do not fork a second CSV writer**. |
| P-7 | `download_headers.utils.buildDownloadHeaders({format, fileName, byteLength})` exists and handles `csv` | VERIFIED | `src/modules/payroll/utils/download_headers.utils.js`; `document_org_hr.controller.js:290` already uses it for #77. |
| P-8 | `payroll_report_exports` is the egress-ledger precedent (`started`→`completed`/`failed`, row written **before** the first byte) | VERIFIED | `src/modules/payroll/models/payroll_report_exports.model.js` header comment; `payroll_report_export.repository.{create,complete,fail}`. F-3's `document_export_jobs` mirrors it exactly. |
| P-9 | `employee_exit.repository` exposes `findLiveByUserId`, `findLiveByUserIds`, `findLiveForOrg` | VERIFIED | `src/modules/payroll/repositories/employee_exit.repository.js`. D-18 mandates reading exits **through this repository**, never the model. `last_working_day` is the date F-4 keys on. |
| P-10 | `payslip_read.service.listForUser(orgId, userId)` exists for F-5's delegation | VERIFIED | `src/modules/payroll/services/payslip_read.service.js:376`. |
| P-11 | No payroll method lists a user's finalized Form-16 financial years | VERIFIED | `employee_tax_summary.repository` has `findByOrgUserFy` / `findByOrgFy` but no per-user FY list. F-5 adds **one** additive read method there (§10 F-5). |
| P-12 | `leave_requests.document_url` is `STRING(255)`, validated by `Joi.string().uri().max(255).allow('', null)` | VERIFIED | `leave_request.model.js:56`; `leave_request.validator.js:22`. F-8's generated path is well inside the limit. |
| P-13 | `leave_application.service.submitLeaveRequest` destructures `document_url` at line 171 and passes it to `_assertDocumentRequirement` before the balance check | VERIFIED | `src/modules/leave/services/leave_application.service.js:171, 363, 425`. F-8 must resolve `document_id` **before** that call. |
| P-14 | `invitation.service.acceptInvitation` commits membership, then consumes the token | VERIFIED | `src/modules/organization/services/invitation.service.js:626`. F-7's hook goes **after** the commit, before the return, inside a swallowing try/catch. |
| P-15 | `organization.service.softDeleteEmployee` already unwinds leaves via `_unwindEmployeeLeaves` inside its transaction | VERIFIED | `organization.service.js` (~line 653). F-4's EC-30 hook follows that precedent but runs **after commit** (§10 F-4 explains why). |
| P-16 | `document_read.service.viewUrl({orgId, documentId, audience, actorRole, actorUserId, accessibleUserIds, disposition})` resolves the full P1 authority matrix | VERIFIED | `document_read.service.js:166`. F-8's audience-neutral endpoint is a controller over this — **no new authority logic**. |
| P-17 | `document_authority.utils` exports `screenDocument`, `resolveDocumentAuthority`, `DENY_NOT_FOUND`, `DENY_FORBIDDEN`, `OK` | VERIFIED | `document_authority.utils.js:332-348`. F-1 adds `resolveTemplateAuthority` **additively** to that file. |
| P-18 | `document_storage.utils.DOCUMENT_PLANE` has `EMPLOYEE` and `ORG` only; `buildDocumentKey` takes `{orgId, plane, subjectId, documentId}` | VERIFIED | `document_storage.utils.js:19-36`. F-1 adds `TEMPLATE` as a third plane value — **additive**; no stored key changes shape. |
| P-19 | `document_settings.service.MUTABLE_FIELDS` holds 21 keys; `document_defaults.SETTINGS_CAPS` gates integers | VERIFIED | P4 Step 13 raised it 13→21. §21 raises it 21→24. |
| P-20 | `document_settings.repository.findAllOrgIds()` exists (P4) and is how every cron enumerates orgs | VERIFIED | Added in P4 Step 11. F-4's and F-6's crons reuse it via `documentAutomationService._forEachOrg`. |
| P-21 | `document_automation.service` exposes `runExpiryFlip / runReminders / runNotificationDispatch / runSweeper / runRecipientTopUp / runStartupCatchUp` and owns **every** cron body | VERIFIED | P4 Steps 11/14. P5 adds two methods there rather than creating a second automation service. |
| P-22 | `org_document_recipient.repository.waive(orgId, id, {waivedBy, waivedReason, waivedAt}, …)` exists and is per-row | VERIFIED | `org_document_recipient.repository.js:309`. F-4 adds a bounded bulk variant beside it. |
| P-23 | `document_request.repository` has `findList`, `countOpenByType`, `findOpenRequestsByTypes`; `DOCUMENT_REQUEST_OPEN_STATUSES` is exported from `document_defaults` | VERIFIED | P4 Steps 4/13. F-4's bulk cancel reuses the status set, never a literal. |
| P-24 | `employee_documents` has **no** `tags` column; `findList` supports only `userIds/typeId/statuses/groupId/expiringBefore/verificationQueue` | VERIFIED | `employee_documents.model.js`; `employee_document.repository.js:74`. F-2 adds the column and the filters. |
| P-25 | `org_documents` has no materialisation state; `document_org.service.publish` throws `422 RECIPIENT_SET_TOO_LARGE` above `ORG_PUBLISH_SYNC_LIMIT = 20000` | VERIFIED | `document_org.service.js:527`; `document_org_rules.utils.js:44`. F-6 turns the hard refusal into a threshold plus an async path. |
| P-26 | Express matches routers in **mount order**; `document_hr.routes` (mounted first at `/api/v1/documents/hr`) already owns `/documents/:id` | VERIFIED | `document.index.js`. **Hard rule:** any new `/documents/...` static-prefix HR route (`/documents/search`) MUST be declared inside `document_hr.routes.js` before `/documents/:id`; a later-mounted router would be unreachable. §11.4. |
| P-27 | S3 bucket resolution has no `APP_S3_BUCKET` fallback despite parent D-5 | VERIFIED (carry-over D-6) | `src/infrastructure/aws-s3/aws-s3.config.js`. F-9 closes it; purely additive (unset env ⇒ identical behaviour). |
| P-28 | `pg_trgm` is **not** installed and no migration creates an extension | TO VERIFY (operator) | F-2's title search is therefore prefix-anchored against a `lower(title) text_pattern_ops` functional index, not a trigram `ILIKE '%…%'`. §6.5. |

---

## 3. Completed-vs-Remaining Analysis

### 3.1 Parent §9 Phase-5 line items, adjudicated

| Parent §9 Phase-5 line | Verdict | Where it stands | P5 action |
|---|:--:|---|---|
| `document_templates` — HR downloadable forms; versioned; type-gated | **NEW** | Nothing exists. No table, no model, no route. | Full build: F-1 |
| Metadata search (name, type, tags, owner, date ranges) | **NEW** | `employee_document.repository.findList` filters by type/status/group/expiry only; **no `tags` column exists at all**. | F-2 |
| Compliance report — acknowledgment status | **DONE (P3)** | #76 `GET /hr/org-documents/compliance`, #77 CSV, #78 per-user evidence, #79 manager Tier-A. `document_compliance.service`. | **Not re-planned.** F-3 only adds the export-ledger row to #77 (§26.2). |
| Compliance report — missing mandatory documents | **PARTIAL** | P4 shipped the **per-employee** checklist (`document_checklist.service.forUser/forUsers`, #89/#94/#98). There is no org-wide roll-up and no CSV. | F-3 adds the roll-up over `forUsers`, reusing the same classifier. |
| Compliance report — expiring in N days | **PARTIAL** | `employee_document.repository.findList({expiringBefore})` and `findExpiryReminderCandidates` exist; no report endpoint, no CSV, no grouping. | F-3 adds the report over a new bounded repository read. |
| CSV export (hand-written, D-19) | **PARTIAL** | `csv_writer.utils` reused from payroll; P3's #77 already streams CSV with `buildDownloadHeaders`. | F-3 reuses both verbatim for three more exports. **No new CSV machinery.** |
| `document_export_jobs` auditing who exported what | **NEW** | #77 records the export in `document_audit_logs` (`org_document.compliance_exported`) only. No table. P3's own comment at `document_org_hr.controller.js:279` says "this module has no export-job table (that is Phase 5)". | F-3 |
| Offboarding archive (Manager §2.2): bulk-archive documents, waive open recipient rows, exit pack | **NEW** | Nothing. `employee_documents.status` already has `archived` as a legal value (P1 enum) but no code writes it. | F-4 |
| Exit dates via the `employee_exits` repository (D-18) | **NEW (consumer)** | The repository exists and is complete (payroll P7). This module has never read it. | F-4 |
| Leave bridge (D-17): optional `document_id` resolved into `document_url` | **NEW** | Phases 1–4 touch Leave nowhere. `leave_requests.document_url` still accepts only a raw URI. | F-8 |
| Employee composed view extended to payroll-owned documents | **NEW** | Not only the payroll extension: the **composer itself** was never built. `/me/documents` (P1) and `/me/hr-documents` (P2) are two separate lists with different shapes. See §3.4. | F-5 |
| On-join hook for recipient top-up | **PARTIAL** | P4 F-8 shipped the **daily cron** (`runRecipientTopUp` → `findTopUpCandidates` → `syncRecipients`). The join-time hook does not exist. | F-7 |
| Full edge-case regression (§10) | **PARTIAL** | P4's completion report covers EC-1/11/13/17/18/25/26/28/29/31. EC-2…EC-10, EC-12, EC-14…EC-16, EC-19…EC-24, EC-27, EC-30, EC-32…EC-36 are covered by individual phase tests but have never been swept as one register. | F-9 + §22 |
| Performance measurement against §8 targets | **NEW** | Never measured. Four phases have said "unmeasured". | F-9 (DB-gated; operator hand-back) |
| Security pass (IDOR, confidentiality leakage, signed-URL scope, content-type bypass) | **PARTIAL** | Each phase spot-checked its own surface. No cross-phase sweep over all 128 endpoints. | F-9 |
| Documentation close-out: `api_registry.md`, `org_settings_registry.md`, `combined_api_analysis.md`, completion report | **PARTIAL** | Registries are current through #98/#78; `DOCUMENTS_API_CONTRACT.md` covers #1–#98; P4 has a completion report. **P1, P2 and P3 completion reports and the P1 change record still do not exist** (carry-over D-5). | §28 |
| EC-16 / Open Decision 5: bulk-publish threshold, sync vs `202` + worker, *measured* | **PARTIAL** | A hard-coded `ORG_PUBLISH_SYNC_LIMIT = 20000` **refuses** the publish with `422`. The parent requires a threshold **setting** and a `202` path. | F-6 (mechanism) + operator measurement (§25.6) |
| EC-14 (exiting employee's unacknowledged policies → waived with reason) | **NEW** | `recipientRepo.waive` exists per-row and is exposed as #61, but nothing drives it from an exit. | F-4 |
| EC-30 (employee soft-deleted holding open requests + pending acknowledgements) | **NEW** | `organization.service.softDeleteEmployee` unwinds leaves only. | F-4 |
| EC-34 (leave passes both `document_url` and `document_id`) | **NEW** | Precondition (`document_id`) does not exist yet. | F-8 |
| Settings: bulk-publish recipient threshold | **NEW** | — | #79 |
| Settings: offboarding archive policy (archive vs retain-in-place; exit pack contents) | **NEW** | — | #80, #81 |

### 3.2 Already shipped — do NOT re-plan (with proof)

| Capability a reader might assign to P5 | Shipped in | Proof |
|---|:--:|---|
| Acknowledgement matrix, pending list, and its CSV export | P3 | `document_compliance.service.{listForHr,exportCsvForHr,listForManager}`; routes #76/#77/#79 in `document_org_hr.routes.js:16-17` and `document_org_manager.routes.js:13` |
| Per-employee required-document checklist and onboarding completeness | P4 | `document_checklist.service.{forUser,forUsers}`; #89/#94/#98 |
| Expiry persistence, read-time expiry derivation, expiry reminders | P4 / P1 | `document_automation.service.runExpiryFlip`; `employee_document.repository.bulkExpire`; `document_expiry.utils` |
| Retention and abandoned-upload sweeper, statutory exclusion | P4 | `document_automation.service.runSweeper`; `findSweepCandidates(mode)` |
| Notification outbox, drain, backoff, email template and 5 crons | P4 | `document_notification.service`; `src/cron-jobs/document_*.cron.js`; `email.utils.sendDocumentNotificationEmail` |
| Daily recipient top-up for employees who joined after publication | P4 | `runRecipientTopUp` → `org_document.repository.findTopUpCandidates` → `document_recipient.service.syncRecipients` |
| Versioning / supersede for employee documents **and** org documents | P1 / P2 | `document_version.utils`; `document_org.service.replace` |
| Confidentiality tighten-only, uniform denial by addressing mode, manager scoping | P1 | `document_authority.utils`; `hierarchy_access.utils.getAccessibleUserIds` |
| Signed view URLs with TTL, audited at issuance | P1 | `document_read.service.viewUrl` + `document.view_url_issued` audit |
| `document_number` masking | P1 | `document_defaults.maskDocumentNumber` |
| Manual HR trigger endpoints for every existing cron | P4 | `document_request_hr.routes.js` `/jobs/*/run` (#88–#92) |
| Type deactivation guard counting open documents **and** open requests | P1 + P4 | `document_type.service` aggregate `409 DOCUMENT_TYPE_IN_USE` |
| Signature provider seam returning `503` for external providers | P3 | `document_compliance.utils.isProviderAvailable`; `document_acknowledgement.service.sign` |

### 3.3 Partially implemented — the exact delta P5 owns

| Area | Shipped half (do not rebuild) | P5 delta |
|---|---|---|
| Missing-mandatory reporting | `document_checklist.service.forUsers(orgId, userIds)` classifies present / open-request / missing per user and computes completeness | An org-wide roll-up: page the active roster, call `forUsers` in bounded chunks, aggregate by type and by department, return a report + CSV. **The classifier is not reimplemented.** |
| Expiring reporting | `findExpiryReminderCandidates` (reminder-shaped: watermark columns, reminder caps) | A report-shaped bounded read `findExpiringForReport(orgId,{fromIst,toIst,typeId,departmentId,limit,offset})` using the **same** partial index predicate (`status='available' AND expires_on IS NOT NULL`). Reminder state is not touched. |
| CSV | `createCsvWriter`, `buildDownloadHeaders`, the pre-header `EXPORT_TOO_LARGE` guard pattern in `exportCsvForHr` | Three more exports following the identical shape, plus the ledger row that P3 could not write. |
| Recipient top-up | `syncRecipients({orgId, docId, actorId})` — advisory-locked, frozen-snapshot, add-only, `due_on` from sync date | `topUpForUser({orgId, userId})` — the transpose (one user, many documents), reusing `matchesCriteria` and `bulkInsert`. And `materialisePending(...)` for F-6. |
| Bulk publish | `publish` resolves the audience, freezes the snapshot, materialises in batches inside one transaction | Threshold becomes setting #79; above it the publish commits with `materialisation_state='pending'` and returns `202`; a worker finishes the job. The sync path below the threshold is **byte-for-byte unchanged**. |
| Edge-case register | Per-phase coverage | One consolidated §22 table with a named test per row. |

### 3.4 Requirements that moved between phases

| Requirement | Originally | Actually | Consequence |
|---|---|---|---|
| **The read-side composer** ("merging own `employee_documents` and addressed `org_documents` into one list with a uniform shape") | Parent §9 **Phase 2** | **Not built.** P2 shipped `/me/documents` (#4-ish, P1) and `/me/hr-documents` (#70) as two independent lists with different projections. | P5 owns it, because parent §9 Phase 5 already requires extending "the employee-facing composed view" to payroll — and you cannot extend something that does not exist. F-5 builds it as an **additive third endpoint**; #70 and the P1 self list are untouched. |
| Bulk-publish `202` + worker (EC-16) | Parent §10 lists EC-16 as "2 / 5" | P2 shipped only the refusal half | P5 owns the `202` half. F-6. |
| On-join top-up (EC-13) | Parent §10 lists EC-13 as "2 / 4" | P2 shipped `syncRecipients`; P4 shipped the cron | P5 owns only the join-time hook. F-7. |
| EC-1 abandoned upload | Parent §10 lists "1 / 4" | P1 made the row inert; P4 shipped the sweeper | **Fully discharged.** No P5 work. |
| `DOCUMENTS_API_CONTRACT.md` | P3 deliverable | P3 created it for #73–#79; **P4 rewrote it to cover #1–#98** | P5 extends to #128 rather than creating. |
| `document_export_jobs` | Parent §4 lists it as a Phase-5 table | P3 explicitly deferred it in a source comment | Confirmed P5. F-3. |

### 3.5 No longer applicable (VOID)

| ID | Item | Why VOID |
|---|---|---|
| V-1 | External e-signature adapters, webhooks and a reconciliation job | Parent §1.3 puts them out of scope and parent Open Decision 4 has never been answered. Building an adapter with no vendor behind it is the definition of speculative. The seam (`provider` enum, `provider_reference` column, `503` gate) is already in place, so this is a future phase's one-adapter change, not a P5 omission. |
| V-2 | Malware scanner integration | Parent Open Decision 3, unanswered through two deferrals. §27 O-1. |
| V-3 | A separate "exit pack" *entity* with its own lifecycle | The parent asks to "produce an exit document pack", not to store one. F-4 produces it on demand from live data and records the egress in `document_export_jobs`. A stored pack would be a stale copy of PII with its own retention problem. |
| V-4 | "Bulk-publish recipient threshold … measured" as an in-plan number | The parent (Open Decision 5, §8) requires it to be **measured with real numbers**, and this environment has no DB access. P5 ships the setting and the mechanism with the default at today's effective value (20000 ⇒ no behaviour change), and hands the measurement procedure to the operator (§25.6). Guessing a new number here would violate the parent's own instruction. |
| V-5 | A second CSV writer, a second audit service, a second targeting engine | All three exist and are reused. |

### 3.6 Contradictions found, and how they are resolved

| ID | Contradiction | Resolution |
|---|---|---|
| **K-1** | Parent §4 names the table `document_export_jobs`; the behaviour it describes ("auditing who exported what") is an **egress ledger**, and the only precedent in the codebase (`payroll_report_exports`) is a ledger, not a queue. P3's source comment also calls it an "export-job table". | **Keep the parent's table name `document_export_jobs`** — deviating from the parent's data-model index for a naming preference is gratuitous churn — but implement the **ledger semantics** exactly: the row is created `started` *before the first byte* and updated to `completed`/`failed` afterwards, deliberately **not** in the same transaction as the read. There is no queue, no polling endpoint, and no worker. §6.2 and §10 F-3 state this in the table's own header comment so no future reader expects a job runner. |
| **K-2** | Parent §9 P2 assigns the "read-side composer" to Phase 2; it does not exist. Parent §9 P5 says the composed view is "extended" to payroll. | Build the composer in P5 (§3.4). It is **additive**: a new endpoint (#126). `/me/documents` and `/me/hr-documents` keep their exact current shapes, because clients are already built against them. |
| **K-3** | Parent §8 says a publish above the threshold "returns `202` and completes via the same worker used by the top-up cron"; P4's top-up cron worker is `syncRecipients`, which itself **refuses** above `ORG_PUBLISH_SYNC_LIMIT` with `422`. Using it unchanged would make the async path fail exactly where it is needed. | Add `document_recipient.service.materialisePending({orgId, docId, batchSize})` beside `syncRecipients`: same primitives (`resolveAudience`, `findRecipientUserIds`, `bulkInsert`, advisory lock, frozen snapshot), but it inserts at most `batchSize` missing rows per call and returns `{added_count, remaining}`. `syncRecipients`' contract — including its `422` — is **unchanged**, so #60 behaves exactly as today. |
| **K-4** | Parent §9 P5 says "on employee exit, bulk-archive their documents" (driven by `employee_exits`, D-18); parent EC-30 says the same unwinding must happen when an employee is **soft-deleted** (an organization-module action with no exit record). | One service operation, `document_offboarding.service.archiveForUser`, with **three** triggers: the HR endpoint (#122), the daily exits cron (last working day passed), and a contained post-commit hook in `organization.service.softDeleteEmployee`. The operation is idempotent (§17), so two triggers firing for the same user is a no-op the second time. |
| **K-5** | Parent §9 P5 says "produce an exit document pack"; D-19 forbids new dependencies and P1 forbids binaries transiting Node. Payroll's hand-written `zip_writer.utils` exists, but feeding it would require `GetObject` on every document. | The exit pack is a **manifest** (JSON at #123, CSV at #124): one row per document with title, type, status, issued/expiry dates and a short-TTL signed URL issued through the existing `documentReadService.viewUrl` path. No bytes move through Node; every URL is audited at issuance exactly as #57/#110 are. Recorded as O-2 in §27 with the ZIP alternative explicitly rejected. |
| **K-6** | Parent §11 lists `tags` as searchable, but no phase ever created a `tags` column, and no phase specified who writes tags. | F-2 adds `tags TEXT[] NOT NULL DEFAULT '{}'` to `employee_documents` only (the plane that has an "owner"), writable by **HR only** via one new endpoint (#121) and settable at upload by HR/manager on-behalf paths. Employees cannot tag their own documents: a tag is an HR classification aid, and letting the subject write it would make search results subject-controlled. |
| **K-7** | Parent D-17 calls the Leave bridge "opt-in". Read as an org setting, that would be a fourth setting; read as caller-opt-in, it is just the new optional field. | Read as **caller-opt-in**: `document_id` is an optional request field. No setting. This matches D-17's own sentence "Existing callers passing a raw URL continue to work unchanged", which describes a field, not a switch. |
| **K-8** | Parent EC-34 asks for an "explicit precedence rule" when a leave application passes both `document_url` and `document_id`; a `400` would also be "explicit". | **`document_id` wins; the supplied `document_url` is ignored** and the response echoes the resolved value. "Precedence" is the parent's own word. The `400` alternative was considered and rejected in §27 O-3 because it converts a harmless client redundancy into a failed leave application. |
| **K-9** | Parent §9 P5 says the composed view surfaces "payslips, Form 16" — but `getForm16` for the self plane throws `404 FORM16_NOT_FINALIZED` until the FY is finalized, and no payroll method lists a user's finalized FYs. | F-5 adds one additive read to `employee_tax_summary.repository` (`findFinalizedFysForUser`) and lists **only finalized** years. A provisional Form 16 is not a document. If the org has no `payroll.access` entitlement, the payroll section is omitted entirely, not errored. |

---

## 4. Dependency Analysis — P1 → P2 → P3 → P4 → P5

### 4.1 What P5 consumes from each phase

**From Phase 1**
- `document_authority.utils.{screenDocument, resolveDocumentAuthority, DENY_NOT_FOUND, DENY_FORBIDDEN, OK}` — F-1 adds `resolveTemplateAuthority` to this file; F-8 consumes the existing matrix unchanged.
- `document_read.service.{detail, viewUrl, listBySubject}` — F-5 and F-8 delegate to these; neither reimplements screening.
- `document_storage.utils.{buildDocumentKey, DOCUMENT_PLANE, isAllowedContentType, sanitizeFileName, buildContentDisposition}` — F-1 adds `TEMPLATE` and `buildTemplateKey`.
- `document_type_rules.utils.{resolveEffectivePolicy, assertUploadAllowed}` — F-1 gates template uploads with the same content-type/size policy; F-2's search honours `manager_can_view` the same way the checklist does.
- `document_audit.service.{record, recordDetached}` — every P5 write audits inside its transaction. `record` still throws without a transaction (P4 P-12).
- `employee_document.repository` projections `LIST_ATTRIBUTES` / detail — F-2's search and F-4's archive reuse them; the search projection must **not** widen them (it narrows: no `document_number`, no `reference_url` once carry-over D-3 is fixed).
- `document_settings.service.getOrCreate` + `document_defaults.SETTINGS_CAPS` — §21 extends both.
- `employee_documents.status` enum already contains `archived` — F-4 needs **no enum ALTER**.

**From Phase 2**
- `document_targeting.utils.{normaliseCriteria, matchesCriteria}` — F-7's join hook matches a single joiner against each published document's **frozen** snapshot. Keyed on `department_id`, never the free-text `department`.
- `document_recipient.service.{resolveAudience, materialise, syncRecipients}` — F-6 adds `materialisePending` beside them; F-7 adds `topUpForUser`.
- `document_org.service.publish` — F-6 modifies its over-threshold branch only.
- `org_document.repository.{findList, findPublishedByGroup, findTopUpCandidates}` — F-7 reuses `findTopUpCandidates`' visibility predicate for the single-user transpose.
- `document_org_rules.utils.ORG_PUBLISH_SYNC_LIMIT` — becomes the **default** of setting #79; the constant stays as the hard ceiling (§21 caps).

**From Phase 3**
- `document_compliance.service.{listForHr, exportCsvForHr, recordExport}` — F-3 leaves the readouts alone and adds the ledger row to the export path.
- `document_compliance.utils.{resolveComplianceState, daysRemaining, COMPLIANCE_EXPORT_MAX_ROWS}` — F-3's new exports reuse the same row cap constant so all four exports share one bound.
- Acknowledgement / signature evidence tables — F-4 **never** deletes, archives or waives an evidence row. Waiving touches `org_document_recipients` only.

**From Phase 4**
- `document_checklist.service.forUsers` — F-3's missing-mandatory roll-up is a pager over it.
- `document_automation.service.{_forEachOrg, runStartupCatchUp}` — F-4 and F-6 add methods here.
- `document_notification.service.enqueue/enqueueDetached` + `document_notification.utils` whitelists — F-4 sends **no** new notification class (§20.2 explains why); F-6 sends none either.
- `document_settings.repository.findAllOrgIds` — the org enumeration for both new crons.
- `document_request.repository` + `DOCUMENT_REQUEST_OPEN_STATUSES` — F-4's bulk cancel.
- `employee_document.repository.findSweepCandidates` — **unchanged**; F-4 does not delete objects, it archives rows.

**From outside the module**
- `payroll/repositories/employee_exit.repository.findLiveByUserId|findLiveForOrg` (D-18) — F-4.
- `payroll/services/payslip_read.service.listForUser` and `payroll/repositories/employee_tax_summary.repository.findFinalizedFysForUser` (new, additive) — F-5.
- `payroll/utils/csv_writer.utils.createCsvWriter`, `payroll/utils/download_headers.utils.buildDownloadHeaders` — F-3, F-4.
- `common/utilities/hierarchy_access.utils.getAccessibleUserIds` — every manager-plane read.
- `billing/services/entitlement.service.hasFeature` (via `requireFeature`) — F-5 checks `payroll.access` before delegating.

### 4.2 Strict build order implied by the dependency graph

```
Step 0  operator: run 00050 → 00051 → 00053            (hard gate, §25.1)
        │
Step 1  migration 00054 (static only)                  ← nothing depends on it at unit level
        │
Step 2  models (2 new, 3 ALTERed)
        │
Step 3  pure utils: template rules, report utils, offboarding utils, defaults+caps
        │        └── testable with zero DB; everything below depends on these
        │
Step 4  repositories: document_template, document_export_job,
        │             additive methods on employee_document / org_document /
        │             org_document_recipient / document_request
        │
   ┌────┴─────────────────┬──────────────────┬───────────────────┬──────────────┐
   │                      │                  │                   │              │
Step 5 F-1 template   Step 6 F-3 export   Step 7 F-2 search   Step 8 F-6    Step 9 F-7
       service            ledger service         service          materialise     join hook
   │                      │                  │                   │              │
   │                 Step 10 F-3 report service (needs export ledger + search reads)
   │                      │
   │                 Step 11 F-4 offboarding service (needs export ledger for the pack)
   │                      │
   └──────────────┬───────┘
                  │
            Step 12 F-5 composer (needs template read + org read + employee read)
                  │
            Step 13 controllers / validators / routes / index wiring
                  │
            Step 14 F-6 + F-4 cron methods on document_automation.service, 2 cron files,
                    server.js registration, startup catch-up extension
                  │
            Step 15 F-8 leave bridge + audience-neutral endpoint (last, so the document side is stable)
                  │
            Step 16 §21 settings #79–#81
                  │
            Step 17 F-9 hardening: carry-over fixes, §22 regression sweep, §24.4 security sweep
                  │
            Step 18 documentation (§28)
```

Rationale for the two non-obvious orderings:
- **Export ledger (Step 6) before the reports (Step 10)** — every report's CSV variant writes a
  ledger row, and retro-fitting the ledger into three finished controllers is how you end up with
  one of them missing it.
- **Leave bridge last (Step 15)** — it is the only cross-module *blocking* change. Building it after
  the document-side read path is stable means a failing leave test can only be caused by the bridge
  itself.

### 4.3 What P5 must not disturb

| Invariant | Enforced by |
|---|---|
| `syncRecipients` contract, including its `422` above the limit (#60) | F-6 adds a sibling method; **T-32** asserts `syncRecipients`' signature and throw behaviour are unchanged |
| Synchronous publish (#47) below the threshold | **T-33** asserts an identical response body and recipient count for a 10-recipient publish before and after F-6 |
| `/me/documents` (P1) and `/me/hr-documents` (#70) response shapes | F-5 is a **new** endpoint; **T-53** snapshot-asserts both existing projections |
| Uniform denial by addressing mode (`:id` → 404, `:userId` → 403) | Every new endpoint inherits it; the §24.4 sweep covers all 31 |
| `storage_key` absent from every response, log and audit row | **T-51** + the **extended `org_repository_projection.test.js`** (the existing P4 chokepoint test — it is extended in place and keeps its own assertions; it is *not* assigned a P5 `T-` number) + the §24.4 grep |

> **B-15 — test identifiers.** §24.2 is the **single canonical numbering** for T-01…T-54. Earlier
> drafts of this plan used `T-31/T-32/T-33` loosely for both the composer tests and the publish
> tests; that is corrected above. Two rules: (a) a `T-` number always means the entry in §24.2, and
> (b) **existing P1–P4 tests that P5 extends are referred to by file name, never by a P5 `T-`
> number** — extending `org_repository_projection.test.js` is not "writing T-32".
| Acknowledgement and signature rows are append-only | F-4 touches `org_document_recipients` only; T-27 asserts the offboarding service references no evidence repository |
| `document_audit_logs` append-only, written in-transaction | Unchanged; `record` still refuses a missing transaction |
| Payroll's `attachment_storage.utils` 4-type allow-list is not widened by the module's 7-type list | Existing `shared_allow_list_isolation.test.js` — **must stay green**; F-1 uses `DOCUMENT_ALLOWED_CONTENT_TYPES`, not the shared constant directly |
| Existing leave behaviour for callers that pass only `document_url` | T-36; plus the whole existing leave suite must stay green |
| Existing payroll behaviour | F-5 only *reads*; the one payroll write is a new repository **method**, not a change to an existing one |

---

## 5. Directory Structure

New files are marked **NEW**; existing files that gain additive code are marked **MOD**.

```
src/infrastructure/postgres-sql/migrations/
  00054-create-document-templates-and-exports.js                        NEW

src/infrastructure/aws-s3/
  aws-s3.config.js                                                      MOD  (F-9: APP_S3_BUCKET fallback)

src/modules/document/
  models/
    document_templates.model.js                                         NEW
    document_export_jobs.model.js                                       NEW
    employee_documents.model.js                                         MOD  (+tags)
    org_documents.model.js                                              MOD  (+materialisation_state, +materialised_at, +recipient_target_count)
    document_settings.model.js                                          MOD  (+3 keys)

  repositories/
    document_template.repository.js                                     NEW
    document_export_job.repository.js                                   NEW
    employee_document.repository.js                                     MOD  (search, expiring-report, bulk archive, tags update, findManyForPack)
    org_document.repository.js                                          MOD  (findPendingMaterialisation, markMaterialised, findPublishedForUserMatch)
    org_document_recipient.repository.js                                MOD  (bulkWaiveForUser, findOpenForUser)
    document_request.repository.js                                      MOD  (bulkCancelOpenForUser)

  services/
    document_template.service.js                                        NEW  (F-1: writes + reads; §9 explains the single-service choice)
    document_export.service.js                                          NEW  (F-3: the egress ledger — begin/complete/fail)
    document_report.service.js                                          NEW  (F-2 search + F-3 reports + their CSV builders)
    document_offboarding.service.js                                     NEW  (F-4)
    document_composer.service.js                                        NEW  (F-5)
    document_recipient.service.js                                       MOD  (F-6 materialisePending, F-7 topUpForUser)
    document_org.service.js                                             MOD  (F-6 threshold branch in publish)
    document_read.service.js                                            MOD  (F-8 resolveForLeaveAttachment)
    document_compliance.service.js                                      MOD  (F-3 ledger row on #77)
    document_automation.service.js                                      MOD  (runPublishMaterialisation, runOffboardingArchive, catch-up)
    document_settings.service.js                                        MOD  (§21: MUTABLE_FIELDS 21→24)

  utils/
    document_template_rules.utils.js                                    NEW  (pure)
    document_report.utils.js                                            NEW  (pure)
    document_offboarding.utils.js                                       NEW  (pure)
    document_storage.utils.js                                           MOD  (TEMPLATE plane + buildTemplateKey)
    document_authority.utils.js                                         MOD  (resolveTemplateAuthority)
    document_defaults.js                                                MOD  (3 settings defaults + caps + new enums/consts)

  controllers/
    document_template_hr.controller.js                                  NEW
    document_template_self.controller.js                                NEW
    document_report_hr.controller.js                                    NEW
    document_offboarding_hr.controller.js                               NEW
    document_composer_self.controller.js                                NEW
    document_attachment.controller.js                                   NEW  (F-8 audience-neutral #128)
    document_hr.controller.js                                           MOD  (#113/#114 search, #121 tags)
    document_org_hr.controller.js                                       MOD  (#47 → 202 body, #77 ledger)

  validators/
    document_template.validator.js                                      NEW
    document_report.validator.js                                        NEW
    document_offboarding.validator.js                                   NEW
    document_hr.validator.js                                            MOD  (search + tags schemas)

  routes/
    document_template_hr.routes.js                                      NEW
    document_template_self.routes.js                                    NEW
    document_report_hr.routes.js                                        NEW
    document_offboarding_hr.routes.js                                   NEW
    document_attachment.routes.js                                       NEW
    document_hr.routes.js                                               MOD  (#113/#114/#121 — MUST live here, P-26)
  document.index.js                                                     MOD  (6 new mounts, order matters — §11.4)

src/cron-jobs/
  document_publish_materialiser.cron.js                                 NEW
  document_offboarding_archive.cron.js                                  NEW
src/server.js                                                           MOD  (2 requires inside the linux guard)

src/modules/leave/
  services/leave_application.service.js                                 MOD  (F-8)
  validators/leave_request.validator.js                                 MOD  (F-8: optional document_id)

src/modules/organization/
  services/invitation.service.js                                        MOD  (F-7: post-commit hook)

src/modules/payroll/
  repositories/employee_tax_summary.repository.js                       MOD  (F-5: findFinalizedFysForUser)

tests/unit/document/                                                    12 new test files (§24)
```

**Deliberate non-additions:** no new `*_manager.*` template or report files. Managers already have
their scoped surfaces (#79 Tier-A compliance, #94 checklist, #95 requests); nothing in the parent's
manager section asks for manager reporting or manager template administration, and adding it would
be speculative surface with a hierarchy-scoping cost.

---

## 6. Database Schema Changes & Migration `00054`

**File:** `src/infrastructure/postgres-sql/migrations/00054-create-document-templates-and-exports.js`
**Shape:** same as `00049`–`00053` — `queryInterface.sequelize.transaction`, explicit
`CREATE INDEX` via `queryInterface.sequelize.query` for partial and functional indexes, explicit
`CHECK` constraints, and a `down()` that reverses in exact inverse order.

### 6.1 `document_templates` (new)

| Column | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `id` | UUID PK | no | `gen_random_uuid()` | |
| `org_id` | UUID | no | | FK → `organizations(id)` ON DELETE CASCADE |
| `template_group_id` | UUID | no | | Stable across versions. **Generated fresh at create; never equal to `id`** (the P2 lesson recorded in `document_org.service.createDraft`). |
| `version` | INTEGER | no | `1` | |
| `supersedes_id` | UUID | yes | | FK → `document_templates(id)` ON DELETE SET NULL |
| `document_type_id` | UUID | yes | | FK → `document_types(id)` ON DELETE RESTRICT. **NULL = general-purpose template** (visible to everyone); non-null = *type-gated* (§12 R-6). |
| `title` | STRING(200) | no | | |
| `description` | TEXT | yes | | |
| `status` | ENUM(`draft`,`published`,`superseded`,`archived`) | no | `draft` | **B-5.** `superseded` = replaced by a newer version; `archived` = manually retired with no successor. The module already draws this distinction for employee documents (`superseded`) and org documents (`superseded`/`retired`); collapsing both into `archived` would make a version chain unreadable. |
| `storage_backend` | ENUM(`s3`,`reference`) | no | `s3` | Mirrors `employee_documents` / `org_documents`. |
| `storage_key` | TEXT | yes | | Never leaves the service layer (D-20). |
| `reference_url` | TEXT | yes | | https-only, enforced at schema **and** service (EC-23). |
| `file_name` | STRING(255) | yes | | Sanitised only for `Content-Disposition` (EC-3). |
| `content_type` | STRING(100) | yes | | |
| `size_bytes` | INTEGER | yes | | |
| `checksum_sha256` | STRING(64) | yes | | Single-part ETag only, as P1/P2. |
| `confirmed_at` | TIMESTAMPTZ | yes | | Set by HeadObject confirmation; the idempotency key for confirm. |
| `is_employee_visible` | BOOLEAN | no | `true` | `false` = HR-internal form. |
| `download_count` | INTEGER | no | `0` | Incremented on every issued download URL, HR and self. Cheap usage signal; **not** a security control. |
| `created_by` | UUID | no | | |
| `published_by` / `published_at` | UUID / TIMESTAMPTZ | yes | | |
| `archived_by` / `archived_at` | UUID / TIMESTAMPTZ | yes | | |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | | | **paranoid** — a template is user-authored content (parent §4). |

**CHECK constraints** (named, mirroring `00049`):
- `document_templates_storage_chk`: `(storage_backend = 's3' AND storage_key IS NOT NULL) OR (storage_backend = 'reference' AND reference_url IS NOT NULL)`
- `document_templates_version_chk`: `version >= 1`
- `document_templates_download_count_chk`: `download_count >= 0`

### 6.2 `document_export_jobs` (new)

> **Header comment required verbatim in the model and the migration:** *"An audit record of data
> LEAVING the system. Despite the `_jobs` suffix inherited from the parent plan's §4 data model,
> this is NOT a job queue: there is no worker, no claim, no polling endpoint. The row is committed
> `started` BEFORE the first byte is streamed and updated afterwards, deliberately NOT atomically
> with the read — a crash mid-stream must leave an investigable `started` row, not no row at all.
> Mirrors `payroll_report_exports` (D-48)."*

| Column | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `id` | UUID PK | no | `gen_random_uuid()` | |
| `org_id` | UUID | no | | FK → `organizations(id)` CASCADE |
| `export_type` | ENUM(`acknowledgement_compliance`,`missing_mandatory`,`expiring`,`document_search`,`exit_pack`) | no | | |
| `format` | ENUM(`csv`,`json`) | no | | |
| `scope` | ENUM(`org`,`team`,`self`) | no | | Which authority plane produced it. P5 only ever writes `org` (every export endpoint is HR-only), but the column exists so a future manager export is a value, not a migration. |
| `filters` | JSONB | no | | The **normalised, post-validation** filter set: ids, codes, date bounds. Never row data, never names, never `document_number` (§13.5). |
| `subject_user_id` | UUID | yes | | Only for `exit_pack`. |
| `requested_by` | UUID | no | | |
| `status` | ENUM(`started`,`completed`,`failed`) | no | `started` | |
| `row_count` | INTEGER | yes | | |
| `byte_count` | INTEGER | yes | | |
| `started_at` | TIMESTAMPTZ | no | `NOW()` | |
| `completed_at` | TIMESTAMPTZ | yes | | |
| `failure_reason` | STRING(500) | yes | | Message only — never a stack, never a key. |
| `ip_address` | STRING(45) | yes | | |
| `request_id` | STRING(100) | yes | | |
| `created_at` / `updated_at` | TIMESTAMPTZ | no | | **NOT paranoid** — a soft-deletable audit row is not an audit row. |

**CHECK:** `document_export_jobs_exit_pack_chk`: `(export_type = 'exit_pack') = (subject_user_id IS NOT NULL)`
— an exit pack always names its subject and nothing else ever does.

### 6.3 `employee_documents` — ALTER (1 column)

| Column | Type | Null | Default | Why |
|---|---|:--:|---|---|
| `tags` | `ARRAY(STRING(40))` | no | `'{}'` | F-2 / K-6. `NOT NULL DEFAULT '{}'` so no read path has to handle `null`, and the backfill is free (Postgres stores the default without a table rewrite for a non-volatile default). |

No other column is added. Archiving reuses the existing `archived` value of the `status` enum, and
the who/when/why of an archive lives in `document_audit_logs` — the module's established answer
for that question (§19.3).

### 6.4 `org_documents` — ALTER (3 columns)

| Column | Type | Null | Default | Why |
|---|---|:--:|---|---|
| `materialisation_state` | ENUM(`not_required`,`pending`,`complete`) | no | `not_required` | F-6. Every existing row (and every synchronous publish) stays `not_required`, so no client sees a change unless it opted into a large publish. |
| `materialised_at` | TIMESTAMPTZ | yes | | Set when the worker finishes. |
| `recipient_target_count` | INTEGER | yes | | The audience size resolved at publish. Lets the client render progress as `recipients_created / recipient_target_count` without a second count query. |

**No CHECK constraint on `materialisation_state`.** The obvious one —
`(materialisation_state <> 'pending') OR (status = 'published')` — is a **trap (B-3)** and must not
be written. `org_documents.status` is `draft | published | superseded | retired | rejected`
(verified), and P2's existing `replace` moves a predecessor `published → superseded`
(`document_org.service.js:550`). If that predecessor were mid-materialisation, the CHECK would abort
an existing, previously-working P2 code path with a constraint violation. The invariant is instead
enforced in code: `materialisePending` re-reads the row `FOR UPDATE` and halts on any non-`published`
status (§10 F-6).

### 6.5 `document_settings` — ALTER (3 columns)

| Column | Type | Null | Default |
|---|---|:--:|---|
| `document_publish_sync_threshold` | INTEGER | no | `20000` |
| `document_offboarding_archive_mode` | STRING(20) | no | `'archive'` |
| `document_offboarding_exit_pack_scope` | STRING(20) | no | `'all'` |

The two string columns follow `document_signature_provider`'s precedent (P3 #70): a `STRING(20)`
validated by a frozen JS constant rather than a PG enum, so adding a value later is a code change,
not a migration. `document_publish_sync_threshold`'s default equals today's hard-coded
`ORG_PUBLISH_SYNC_LIMIT`, which is what makes F-6 a no-op for every existing org (§26.1).

### 6.6 Indexes created by `00054`

| Index | Table | Definition | Serves |
|---|---|---|---|
| `document_templates_org_status_idx` | `document_templates` | `(org_id, status)` | #107 HR list, #111 self list |
| `document_templates_org_group_idx` | `document_templates` | `(org_id, template_group_id)` | #109 version chain, replace |
| `document_templates_group_version_uq` | `document_templates` | **UNIQUE** `(org_id, template_group_id, version) WHERE deleted_at IS NULL` | **B-6.** Without it, two `replace` calls each read the same published predecessor and both mint `version = predecessor.version + 1`, producing two rows claiming the same version. |
| `document_templates_org_published_uq` | `document_templates` | **UNIQUE** `(org_id, template_group_id) WHERE status = 'published' AND deleted_at IS NULL` | The one-current-version invariant (§12 R-4); the DB, not the service, is what makes a concurrent double-publish impossible (§16.2 C-1) |
| `document_templates_org_type_idx` | `document_templates` | `(org_id, document_type_id) WHERE status = 'published' AND deleted_at IS NULL` | Type-gated lookup from the composer and #111 |
| `document_export_jobs_org_created_idx` | `document_export_jobs` | `(org_id, created_at DESC)` | #119 ledger list |
| `document_export_jobs_org_type_idx` | `document_export_jobs` | `(org_id, export_type, created_at DESC)` | #119 filtered |
| `employee_documents_tags_gin` | `employee_documents` | `USING GIN (tags)` | F-2 tag overlap (`tags && ARRAY[...]`) |
| `employee_documents_org_title_idx` | `employee_documents` | `(org_id, lower(title) text_pattern_ops)` | F-2 prefix title search **without** `pg_trgm` (P-28). An unanchored `%…%` will not use it and is explicitly not offered. **B-12:** PostgreSQL can only extract the constant prefix from a `LIKE` pattern when the pattern is known at plan time. If the pattern arrives as a bound parameter under a *generic* plan, the optimisation is lost and this degrades to a sequential scan. Pass the pattern through Sequelize **`replacements`** (which escapes and inlines it, so the planner sees a literal), **not `bind`** — and confirm with `EXPLAIN` in §25.6 statement 1 that the index is chosen. If it is not, fall back to the explicit range form `lower(title) >= :p AND lower(title) < :p_upper`, which is plan-stable because it uses plain comparisons; `text_pattern_ops` gives those comparisons C-collation byte ordering, which is what makes the range correct. |
| `employee_documents_org_type_expiry_idx` | `employee_documents` | `(org_id, document_type_id, expires_on) WHERE status = 'available' AND expires_on IS NOT NULL` | F-3 expiring report grouped by type. **The `WHERE` clause is byte-identical to `00049`'s `employee_documents_org_expiry_idx`** so the two are interchangeable to the planner and the expiry cron is unaffected. |
| `org_documents_materialisation_idx` | `org_documents` | `(org_id) WHERE materialisation_state = 'pending'` | F-6 worker scan — a tiny index that is empty in steady state |

### 6.7 `down()` migration

Reverse order: drop the four `employee_documents`/`org_documents` indexes, drop the three
`document_settings` columns, drop the three `org_documents` columns and their CHECK, drop
`employee_documents.tags` and its GIN index, drop `document_export_jobs`, drop `document_templates`,
then drop the four created ENUM types (`enum_document_templates_status`,
`enum_document_templates_storage_backend`, `enum_document_export_jobs_*`,
`enum_org_documents_materialisation_state`) — Postgres does not drop them with the table.

**`down()` is destructive for `document_export_jobs` and `document_templates`.** The export ledger
is an egress audit trail; dropping it destroys the record of who took data out of the system. Treat
it with the same caution as `00051.down()` (§25.5).

---

## 7. Model Changes

### 7.1 `models/document_templates.model.js` (NEW)

`sequelize.define('DocumentTemplate', {...}, { tableName: 'document_templates', underscored: true,
paranoid: true, timestamps: true })`. Associations: `belongsTo(DocumentType, { foreignKey:
'document_type_id' })`, `belongsTo(DocumentTemplate, { as: 'supersedes', foreignKey:
'supersedes_id' })`. Auto-loads via the `*.model.js` directory scan — **no `models.index.js` edit**
(the P2/P4 finding).

### 7.2 `models/document_export_jobs.model.js` (NEW)

`paranoid: false`. **No association on `subject_user_id`** — deliberately, following
`document_notifications.entity_id`: an audit row must survive the disappearance of what it
references, and an association would invite a JOIN that re-introduces PII into the ledger read.

### 7.3 `models/employee_documents.model.js` (MOD)

Add `tags: { type: DataTypes.ARRAY(DataTypes.STRING(40)), allowNull: false, defaultValue: [] }`.
Nothing else. `LIST_ATTRIBUTES` in the repository gains `tags` (§26.1 — additive field on existing
list responses; it is in the change record).

### 7.4 `models/org_documents.model.js` (MOD)

Add the three F-6 columns. `document_org_read.service.toClient` must expose
`materialisation_state`, `materialised_at` and `recipient_target_count` and continue to scrub
`storage_key` / `reference_url`.

### 7.5 `models/document_settings.model.js` (MOD)

Add the three §6.5 columns with identical defaults (model defaults and migration defaults must
match — a mismatch is how `getOrCreate` starts producing rows that differ from the DDL).

---

## 8. Core Logic — pure, DB-free utilities

Every function below is synchronous, takes plain data and is unit-tested without a database, per
parent §12.

### 8.1 `utils/document_template_rules.utils.js` (NEW)

```
TEMPLATE_STATUS              = { DRAFT:'draft', PUBLISHED:'published',
                                 SUPERSEDED:'superseded', ARCHIVED:'archived' }
TEMPLATE_TRANSITIONS         = { draft:['published'],
                                 published:['superseded','archived'],
                                 superseded:[], archived:[] }
TEMPLATE_VISIBLE_STATUS      = ['published']           // what a non-HR caller may ever see

canTransition(from, to)                      -> boolean
isPublishable(row)                           -> { ok, reason }   // draft + confirmed_at (s3) or reference_url
isTemplateReplaceable(row)                   -> boolean          // published only
resolveTemplateVisibility(row, { audience, typePolicy })
                                             -> 'visible' | 'hidden'
describeTemplate(row)                        -> { has_file, backend }
```

`resolveTemplateVisibility` is the whole of F-1's authorization logic in pure form:

| audience | rule |
|---|---|
| `hr` | every status, every template |
| `manager`, `self` | `status = 'published'` **and** `is_employee_visible = true` **and**, when `document_type_id` is non-null, the gating type is **active** and its effective policy grants the audience `view` (`employee_can_view` for self; `manager_can_view AND manager_can_view_team_documents` for manager) |

A hidden template is `404 TEMPLATE_NOT_FOUND`, never `403` — templates are `:id`-addressed, so the
P1 uniform-denial rule applies unchanged.

### 8.2 `utils/document_report.utils.js` (NEW)

```
SEARCH_MAX_LIMIT        = 100
SEARCH_MIN_QUERY_LEN    = 2
REPORT_MAX_HORIZON_DAYS = 365
EXPORT_MAX_ROWS         = COMPLIANCE_EXPORT_MAX_ROWS   // re-exported, NOT redeclared (one bound, four exports)

normaliseSearchFilters(raw, { todayIst })
    -> { q, typeId, userIds, statuses, tags, issuedFrom, issuedTo,
         expiresFrom, expiresTo, createdFrom, createdTo, limit, offset }
    // trims q, lower-cases it, rejects < SEARCH_MIN_QUERY_LEN, clamps limit,
    // orders each date pair (from <= to) and rejects inverted ranges,
    // dedupes + lower-cases + bounds tags (max 10)

resolveExpiryBucket(expiresOn, todayIst)      -> 'expired' | 'due_7' | 'due_30' | 'due_60' | 'due_90' | 'later'
summariseMissingMandatory(perUserResults)     -> { employees_total, employees_complete,
                                                   employees_incomplete, by_type[], by_department[] }
SEARCH_CSV_COLUMNS / MISSING_CSV_COLUMNS / EXPIRING_CSV_COLUMNS / EXIT_PACK_CSV_COLUMNS
toSearchCsvRow / toMissingCsvRow / toExpiringCsvRow / toExitPackCsvRow
```

`summariseMissingMandatory` takes the array `document_checklist.service.forUsers` already returns —
it does not re-derive mandatory-ness, which is exactly the duplication §4.3 forbids.

### 8.3 `utils/document_offboarding.utils.js` (NEW)

```
ARCHIVE_MODE     = { ARCHIVE:'archive', RETAIN:'retain' }
EXIT_PACK_SCOPE  = { ALL:'all', ORG_ISSUED:'org_issued', EMPLOYEE_OWNED:'employee_owned' }
ARCHIVABLE_STATUSES = ['pending_verification','available','expired']   // NOT superseded/rejected/
                                                                       // quarantined/archived/pending_upload
WAIVE_REASON_EXIT    = 'Employee exited the organisation'
WAIVE_REASON_REMOVED = 'Employee removed from the organisation'
OFFBOARDING_BATCH    = 200
// B-1: the UNACKNOWLEDGED recipient statuses. `org_document_recipients.status` is
// ('pending','viewed','acknowledged','signed','waived') — there is NO 'overdue' value;
// 'overdue' is a DERIVED filter keyword (org_document_recipient.repository.js:65),
// not a stored status. `viewed` means "opened but not acknowledged" and MUST be waived.
WAIVABLE_RECIPIENT_STATUSES = ['pending', 'viewed']
AUDIT_ID_SAMPLE_MAX  = 100

isArchivable(status)                              -> boolean
resolveArchiveTrigger({ exitRow, membershipActive, todayIst })
    -> { should_archive, trigger: 'exit'|'membership_removed'|null, effective_on }
resolveWaiveReason(trigger)                       -> string
partitionPackItems(items, scope)                  -> { employee_owned[], org_issued[] }
```

`resolveArchiveTrigger` is the D-18 graceful-degradation rule in pure form: **no exit record and an
active membership ⇒ `should_archive:false`**; an exit record whose `last_working_day <= today` ⇒
`trigger:'exit'`; no exit record but the membership is gone ⇒ `trigger:'membership_removed'`.

### 8.4 `utils/document_storage.utils.js` (MOD)

```
DOCUMENT_PLANE = { EMPLOYEE:'employee', ORG:'org', TEMPLATE:'template' }   // + TEMPLATE

buildTemplateKey({ orgId, templateGroupId, templateId })
  -> shared.buildObjectKey({ orgId, segments: ['documents','template', templateGroupId, templateId] })
```

Identical 4-segment shape to `buildDocumentKey`, so every existing traversal / NUL / separator
rejection test applies unchanged. Keys already stored under `employee` and `org` are untouched.

### 8.5 `utils/document_authority.utils.js` (MOD — additive)

```
TEMPLATE_READ_ACTIONS = ['view','download']
resolveTemplateAuthority({ row, audience, actorRole, typePolicy, action })
    -> { allowed: boolean, reason: 'ok' | 'not_found' }
```
Additive export only. The existing employee-plane, org-plane and request-plane resolvers are not
touched — the file has grown additively in P2, P3 and P4 and continues to.

### 8.6 `utils/document_defaults.js` (MOD)

Additions: the three settings defaults into `DOCUMENT_SETTINGS_DEFAULTS`; `SETTINGS_CAPS` entry
`document_publish_sync_threshold: { min: 100, max: 20000 }` (the max is `ORG_PUBLISH_SYNC_LIMIT` —
an org may lower the sync threshold but never raise it past the code ceiling); the frozen constants
`OFFBOARDING_ARCHIVE_MODES`, `EXIT_PACK_SCOPES`, `TEMPLATE_STATUS`, `EXPORT_TYPE`, `EXPORT_FORMAT`,
`EXPORT_SCOPE`, `EXPORT_STATUS`, `TAG_MAX_LEN = 40`, `TAGS_MAX_PER_DOCUMENT = 10`,
`MATERIALISE_BATCH = 5000`, `MATERIALISE_DOC_LIMIT = 20`.

---

## 9. Layer Responsibilities

| Layer | Owns | Must never |
|---|---|---|
| **Route** | Path, plane middleware (`authenticate` + `authorize([...])` + `requireFeature('documents.access')`), declaration order relative to `:id` siblings | Contain logic |
| **Validator** | Joi shape, bounds, enum membership, date ordering, `stripUnknown` | Read the DB, know about authority |
| **Controller** | `ctx(req)`, hierarchy resolution (`getAccessibleUserIds`), audience selection, response envelope, **download header emission and the mid-stream failure branch** | Contain business rules, open transactions |
| **Service** | Transactions, authority resolution, state transitions, audit writes, ledger begin/complete/fail, S3 signing calls | Emit HTTP, format CSV rows into a response |
| **Repository** | SQL, projections, locks, pagination, chunked writes | Throw `AppError`, know the caller's plane |
| **Pure utils** | Decisions with no I/O | Require a model, a repo or `db` |

### 9.1 Service-by-service responsibilities

| Service | Responsibility | Explicitly not its job |
|---|---|---|
| `document_template.service` | Template lifecycle (create/update/file/confirm/publish/replace/archive/delete), HR + self reads, download-URL issuance, the `download_count` bump | Employee documents, org documents, reporting |
| `document_export.service` | The `document_export_jobs` ledger: `begin({orgId, exportType, format, scope, filters, requestedBy, subjectUserId, ip, requestId})` → row id; `complete(id,{rowCount,byteCount})`; `fail(id, reason, {byteCount})`; `list` / `get` for #119/#120 | Producing any CSV; knowing what a report means |
| `document_report.service` | Search (#113), missing-mandatory (#115), expiring (#117) and the CSV variant of each — **calling `document_export.service` around every CSV** | Acknowledgement compliance (that is P3's `document_compliance.service`, untouched) |
| `document_offboarding.service` | `archiveForUser`, `exitPack`, `runForOrg` (the cron body's inner loop) | Deleting anything; touching evidence tables; S3 object deletion |
| `document_composer.service` | Merging the four sources into one uniform list; degrading when payroll is not entitled | Issuing any URL — it returns **endpoint paths**, not signed URLs (§13.4) |
| `document_recipient.service` (MOD) | `+ materialisePending`, `+ topUpForUser` | Changing `syncRecipients`' contract |
| `document_automation.service` (MOD) | `+ runPublishMaterialisation`, `+ runOffboardingArchive`, extended `runStartupCatchUp` | Holding business logic — it delegates, as it does for all five existing jobs |

---

## 10. Feature Dossiers

Each dossier follows the Implementation-Ready Standard:
**Requirement → Existing Dependency → Database Impact → API Impact → Business Logic → Validation →
Authorization → Storage/File Impact → Failure Handling → Testing → Acceptance Criteria.**
Where a heading does not apply it says so explicitly.

---

### F-1 — Document Templates

**Requirement.** Parent §1.1 row 10 and §9 Phase 5: *"HR-provided downloadable forms. Versioned.
Type-gated."* HR publishes a blank form; employees download it. The template is not anybody's
document — it is org reference material.

**Existing dependency.**
- Storage handshake: `document_org.service.issueFileUrl/confirmFile` (P2) is the pattern copied
  exactly — presign PUT, client uploads, HeadObject verifies, `confirmed_at` set.
- `document_storage.utils` (+`TEMPLATE` plane, `buildTemplateKey`).
- `document_type_rules.utils.assertUploadAllowed` for content-type/size gating.
- `document_version.utils` — **not reused.** Its supersede helper is written against
  `employee_documents`' status vocabulary; templates use `archived` where employee documents use
  `superseded`. F-1 uses `document_template_rules.utils.canTransition` instead. Recorded here so no
  reviewer flags it as a missed reuse.
- `document_audit.service.record`.
- `document_settings` `document_upload_url_ttl_seconds` / `document_view_url_ttl_seconds`.

**Database impact.** `document_templates` (§6.1) + four indexes (§6.6), including the partial unique
index that enforces one published version per group.

**API impact.** 14 new endpoints, #99–#112 (exact paths in §11.1): HR create, update, file-url,
confirm, publish, replace, archive, delete, list, detail, download-url; self list, detail,
download-url.

**Business logic.**

*Create (draft).* `template_group_id = randomUUID()` (never `id`), `version = 1`, `status = 'draft'`.
If `document_type_id` is supplied it must exist, belong to the org and be **active**
(`404 DOCUMENT_TYPE_NOT_FOUND` if not — a `:id`-addressed sub-resource).

*Attach a file.* Two backends, exactly as org documents:
- `s3`: `issueFileUrl` → presigned PUT (draft only; `422 TEMPLATE_NOT_DRAFT` otherwise) →
  `confirmFile` verifies with HeadObject and writes
  `{size_bytes, content_type, checksum_sha256, confirmed_at}`.
- `reference`: `reference_url` must be `https:` (EC-23), max 2048 chars, no credentials in the URL.

*Publish.* Guarded by `isPublishable`: status is `draft` **and** (`storage_backend='s3'` with
`confirmed_at IS NOT NULL`) or (`storage_backend='reference'` with a `reference_url`). Publishing a
draft whose file was never confirmed is `422 TEMPLATE_FILE_MISSING` — the exact failure P2 saw when
a draft org document was published after an abandoned upload.

**Statement order inside the publish transaction is load-bearing (B-2): demote the predecessor
FIRST, promote the new row SECOND.**

```
1. UPDATE predecessor SET status='superseded', superseded_at=NOW()    ← must come first
2. UPDATE new         SET status='published',  published_by/at
```

`document_templates_org_published_uq` is a **partial unique index**, and a partial unique index
cannot be declared `DEFERRABLE` in PostgreSQL — it is checked at the end of each *statement*, not at
commit. Promoting first would leave two `published` rows in the group between statements 1 and 2 and
raise a unique violation immediately. P2 already gets this right: `document_org.service.js:550`
supersedes the predecessor before line 583 publishes the successor. Mirror it exactly.

*Replace (new version).* On a **published** template: inside one transaction, advisory-lock
`hashtext('document_template_group:' || template_group_id)`, then:

1. **Refuse if an unpublished draft already exists in the group** → `409 TEMPLATE_DRAFT_EXISTS`
   (**B-6**). Two replaces in a row would otherwise both read the same published predecessor and
   both mint the same version number. One in-flight draft per group.
2. `SELECT … FOR UPDATE` the current published row.
3. Compute `version = (SELECT MAX(version) FROM document_templates WHERE org_id = :o AND
   template_group_id = :g) + 1` — **from the group's maximum, not from the predecessor's version**
   (**B-6**). Deriving it from the predecessor is what makes step 1's guard load-bearing rather
   than merely tidy.
4. Insert a new `draft` with that version, `supersedes_id = current.id`, the same
   `template_group_id`, and the same `document_type_id` unless overridden.

The **old version stays published** until the new one is published. This is deliberate: a template
is a form people are mid-way through filling in, and having no current version for the duration of
an upload is worse than briefly having an outdated one.

*Archive.* `published → archived`, sets `archived_by/at`. Archived templates vanish from every
non-HR read. The S3 object is **retained** — the retention sweeper does not know about templates
and F-1 does not teach it (§19.4 explains why and what the operator must do instead).

*Delete.* Soft delete (`paranoid`) allowed on a `draft` **only**. A published or archived template
must be archived, not deleted: `422 TEMPLATE_NOT_DELETABLE`.

*Download.* `GET …/download-url` returns `{ url, expires_at, file_name }` for an `s3` template, or
`{ url: reference_url, expires_at: null }` for a `reference` one. Always `attachment` disposition —
a blank form is meant to be saved, never rendered inline. `download_count` is incremented with an
atomic `increment` **outside** the URL-issuing transaction and inside a swallowing try/catch: a
counter must never cost a user their download.

**Validation.**

| Field | Rule |
|---|---|
| `title` | required, trimmed, 3–200 |
| `description` | optional, ≤ 2000 |
| `document_type_id` | optional UUID; must be an active org type |
| `is_employee_visible` | boolean, default `true` |
| `storage_backend` | `s3` \| `reference`, default `s3` |
| `reference_url` | required when backend is `reference`; `Joi.string().uri({ scheme: ['https'] }).max(2048)` |
| `file_name` | required on `file-url`; sanitised; extension must match the content type |
| `content_type` | required on `file-url`; must be in the effective allow-list for the gating type, or `DOCUMENT_ALLOWED_CONTENT_TYPES` when the template is untyped |
| `size_bytes` | required on `file-url`; ≤ the effective max |

**Authorization.**
- HR write and full read: `authorize(['hr'])`. No manager write plane (§5 rationale).
- Self and manager read: only `published` + `is_employee_visible` + type-gate satisfied
  (`resolveTemplateVisibility`). Everything else is `404 TEMPLATE_NOT_FOUND` — templates are
  `:id`-addressed, so the P1 uniform-denial rule applies.
- Templates hold **no employee PII**, so there is no hierarchy scoping on the read: every employee
  in the org sees the same published set. This is a deliberate divergence from every other read
  surface in the module and is stated so no reviewer reads it as a missing `getAccessibleUserIds`.
- `requireFeature('documents.access')` on every route.

**Storage/file impact.** New key prefix `org/{orgId}/documents/template/{templateGroupId}/{templateId}`.
`storage_key` never appears in a response, a log or an audit row; only
`document_template.repository.findByIdForStorage` (attributes `['id','org_id','storage_key',
'storage_backend','file_name','content_type','confirmed_at','status']`) reads it, and only
`document_template.service` calls that method. `org_repository_projection.test.js` is extended to assert exactly this.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| Presign succeeds, client never uploads | Draft stays unconfirmed and unpublishable. It is **not** swept (§19.4) — HR deletes the draft. Accepted, and stated in the completion report. |
| Client uploads, `confirmFile` never called | Same as above. Re-calling `file-url` presigns to the **same key** (key is derived from ids, not random), so the retry overwrites rather than orphaning. |
| `confirmFile` called twice | Idempotent on `confirmed_at`: second call returns the same payload, writes nothing, audits nothing. |
| HeadObject 404 | `422 TEMPLATE_FILE_NOT_UPLOADED`. No DB write. |
| HeadObject reports a size over the cap | `422 FILE_TOO_LARGE`, no DB write, object left for the operator's bucket lifecycle rule. |
| Two HR users publish two drafts of the same group concurrently | The advisory lock serialises them; the loser re-reads and gets `422 TEMPLATE_NOT_DRAFT`. If the lock is somehow bypassed, `document_templates_org_published_uq` raises a unique violation, mapped to `409 TEMPLATE_PUBLISH_CONFLICT`. Two independent guarantees. |
| S3 unconfigured | `assertS3Configured()` → `503 STORAGE_NOT_CONFIGURED`, the existing P1 behaviour. |
| `document_type` deactivated while templates reference it | Templates remain; the type-gate hides them from employees (an inactive type grants nobody `view`). HR still sees them. **The type-deactivation guard is not extended to count templates** — a blank form is not employee data and must not block a type from being retired. |

**Testing.** T-01…T-06 (§24.2).

**Acceptance criteria.**
1. HR can create → attach → confirm → publish → download a template, and an employee can download the published version.
2. At most one `published` row exists per `(org_id, template_group_id)` — enforced by the partial unique index, proven by a concurrent-publish test.
3. A draft, an archived, or an `is_employee_visible=false` template returns `404` to a non-HR caller.
4. A type-gated template is invisible to an employee whose effective policy denies `view` on that type.
5. `storage_key` appears in no response, log or audit row (T-51 + the extended `org_repository_projection.test.js`).
6. Publishing an unconfirmed draft is refused.

---

### F-2 — Document Metadata Search

**Requirement.** Parent §9 Phase 5: *"Metadata search (name, type, tags, owner, date ranges)."*

**Existing dependency.** `employee_document.repository.findList` (P1) — the model for the query
shape, projection and 200-row cap; `document_authority.utils` for the confidentiality screen;
`hierarchy_access.utils.getAccessibleUserIds` (manager plane, though §13.2 explains why search is
HR-only in P5); `document_compliance.service.exportCsvForHr` for the CSV shape.

**Database impact.** `employee_documents.tags` (§6.3), the GIN index and the
`lower(title) text_pattern_ops` index (§6.6).

**API impact.** #113 `GET /hr/documents/search`, #114 `GET /hr/documents/search.csv`,
#121 `PATCH /hr/documents/:id/tags`. Additive `tags` field on existing employee-document list and
detail responses (§26.1 — in the change record).

**Business logic.**

`document_report.service.search(orgId, actor, filters)`:
1. `normaliseSearchFilters` (pure).
2. `employee_document.repository.search(orgId, normalised)` — one query, `ORDER BY created_at DESC, id DESC` (a stable tiebreak; `created_at` alone is not unique and pagination without a tiebreak silently repeats rows), `LIMIT` ≤ 100.
3. Screen every row through `screenDocument` with the actor's audience — as **defence in depth only**.

   **B-7: every row-excluding predicate must be in SQL, before `LIMIT`.** The visible-status set
   (`VISIBLE_STATUS`, which excludes `quarantined` and soft-deleted rows) goes into the `WHERE`
   clause, not into a post-query filter. Filtering after the database has already applied
   `LIMIT`/`OFFSET` silently returns short pages, makes `offset` skip rows that were never shown,
   and makes any `total` a lie. `screenDocument` is then a defensive assertion that should never
   remove a row on the HR plane; if it ever does, that is a SQL/authority mismatch and the service
   logs it at `warn` with the document id rather than quietly dropping it.
4. Project: `id, title, document_type:{id,code,name}, owner:{user_id,name,employee_code,department_id}, status, tags, issued_on, expires_on, is_confidential, created_at, verified_at`. **Never** `document_number` (even masked — a search result set is a bulk surface, and P1's masking was designed for single-record display), **never** `reference_url`, **never** `storage_key`.

Search predicates (all AND-ed; all optional; at least one of `q`/`type_id`/`user_id`/`tags` is required so the endpoint can never become an unbounded table scan):

| Filter | SQL |
|---|---|
| `q` | `lower(title) LIKE lower(:q) \|\| '%'` — **prefix only** (P-28). See B-12 on making the index actually get used. |
| `type_id` | `document_type_id = :id` |
| `user_id` (repeatable, ≤ 50) | `user_id IN (…)` |
| `department_id` | join the profile and filter on `department_id` — **never** the free-text `department` |
| `status` (repeatable) | `status IN (…)`, intersected with `VISIBLE_STATUS` |
| `tags` (repeatable, ≤ 10) | `tags && ARRAY[:tags]::varchar[]` (overlap = any) |
| `issued_from/to`, `expires_from/to`, `created_from/to` | inclusive `BETWEEN` on the respective column |

`PATCH /hr/documents/:id/tags` replaces the whole array (`{ tags: [...] }`, ≤ 10, each ≤ 40 chars,
lower-cased, trimmed, de-duplicated, `^[a-z0-9][a-z0-9 _-]*$`). Replace-not-merge because a merge
API needs add/remove verbs and nobody asked for them. Audited as `document.tags_updated` with old
and new arrays.

**Validation.** As the table above; `limit` ≤ 100 default 25; `offset` ≥ 0 with
`offset + limit ≤ 10000` (a deep-paging bound, `422 PAGINATION_TOO_DEEP`); every date pair ordered;
`q` ≥ 2 chars after trim.

**Authorization.** `authorize(['hr'])` only, in P5.
Rationale (§13.2): a manager search would have to intersect every predicate with
`getAccessibleUserIds` **and** re-screen confidentiality per row, and the parent's manager section
(§2.2) asks for team compliance visibility, not search. Adding it speculatively is exactly the
"invented feature" the task forbids. Recorded as O-7 in §27 with the design sketch so a later phase
does not start from zero.

**Storage/file impact.** **Not applicable** — search returns metadata only and issues no URL. A
caller wanting the file uses the existing #57 / #128.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| No filter supplied | `400 SEARCH_FILTER_REQUIRED`. |
| `q` shorter than 2 chars | `400 SEARCH_QUERY_TOO_SHORT`. |
| Result set exceeds the CSV cap | `422 EXPORT_TOO_LARGE` with `{row_count, max_rows}` — **before** any byte, exactly as P3's `exportCsvForHr`. |
| Query slower than the §8 target | Not a runtime failure; §25.6 hands the operator the `EXPLAIN` procedure. |
| Tag array written concurrently by two HR users | Last-write-wins on a whole-array replace. Both writes are audited, so the sequence is reconstructable. No lock — a tag is not an invariant. |

**Testing.** T-07…T-11.

**Acceptance criteria.**
1. Search by each filter independently and in combination returns only that org's rows.
2. `document_number`, `reference_url` and `storage_key` are absent from every search response (asserted field-by-field, not by a substring grep).
3. An unfiltered search is refused.
4. Deep paging past 10000 is refused.
5. CSV output has the same rows as JSON for the same filters, and writes exactly one `completed` ledger row.
6. Tags are normalised, capped at 10, and the update is audited with before/after.

---

### F-3 — Compliance Reports, CSV Exports, and the Export Ledger

**Requirement.** Parent §9 Phase 5: compliance reports (missing mandatory, expiring in N days,
acknowledgment status), CSV export, and `document_export_jobs` *"auditing who exported what"*.

**Existing dependency.**
- **Acknowledgment status is DONE** (P3 #76/#77/#78/#79). F-3 adds *only* the ledger row to #77.
- `document_checklist.service.forUsers` (P4) — the missing-mandatory classifier, reused verbatim.
- `employee_document.repository` expiry predicate (P1/P4).
- `csv_writer.utils.createCsvWriter`, `download_headers.utils.buildDownloadHeaders` (payroll).
- `payroll_report_exports` + `download.helper` — the ledger and mid-stream-failure precedent.
- `COMPLIANCE_EXPORT_MAX_ROWS` (P3) — re-exported, not redeclared.

**Database impact.** `document_export_jobs` (§6.2) + two indexes; the composite expiry index (§6.6).

**API impact.** #115 missing-mandatory JSON, #116 its CSV, #117 expiring JSON, #118 its CSV,
#119 export-ledger list, #120 export-ledger detail. Plus the behavioural addition to #77 (§26.2).

**Business logic.**

*Export ledger (the spine).* Every CSV endpoint follows one shape, and it is the shape
`payroll/controllers/helpers/download.helper.js` already uses:

```
1. validate + normalise filters
2. count rows            → if count > EXPORT_MAX_ROWS → 422 EXPORT_TOO_LARGE   (no ledger row:
                                                                                nothing left)
3. exportService.begin({...})          → COMMITTED before any byte
4. build the CSV in memory (bounded by step 2)
5. res.set(buildDownloadHeaders(...)); res.send(buffer)
6. exportService.complete(id, { rowCount, byteCount })        ← detached, swallowing
   rowCount is the number of rows ACTUALLY written, not the step-2 pre-count; the two can
   differ if the data changed between the count and the build, and the ledger must record
   what left the system.
   on throw between 3 and 5 → exportService.fail(id, err.message)   ← detached, swallowing
```

Step 3 is deliberately **not** in the read's transaction: the ledger must record an export that
crashed. Steps 6's swallow is deliberate too — a ledger-update failure must not turn a delivered
export into a `500` the client retries, producing a second export. A row stuck at `started` is the
correct signal for an operator, and §29 lists the alert.

*Missing-mandatory roll-up.* `document_report.service.missingMandatory(orgId, filters)`:
page the active roster (`user_id`, `department_id`) in chunks of `CHECKLIST_CHUNK = 100`, call
`documentChecklistService.forUsers(orgId, chunkIds)`, accumulate with
`summariseMissingMandatory`. Returns `{ summary:{employees_total, employees_complete,
employees_incomplete, completeness_pct}, by_type:[{type, required_for, missing_count,
open_request_count}], by_department:[{department_id, department_name, employees_total,
employees_incomplete}], employees:[...] }` where `employees` is present only when
`include_employees=true`, and is then a **paged window**: `employees_limit` (≤ 500, default 100) and
`employees_offset`, returned alongside `has_more` (**B-16**). An earlier draft returned `has_more`
with no offset parameter, which tells a client there is more data and gives it no way to fetch it.
The `summary`, `by_type` and `by_department` blocks are always computed over the **whole** roster
regardless of this window. Filters: `department_id`, `document_type_id`, `employment_type`,
`include_employees`, `employees_limit`, `employees_offset`.

The roster is read **once**; chunked checklist calls are sequential, not parallel — 8 concurrent
`forUsers` calls against the same pool is how a report takes down the API for everyone else.

*Expiring report.* `document_report.service.expiring(orgId, {withinDays = 30, typeId,
departmentId, includeExpired = false, limit, offset})`. `within_days` ≤ 365
(`REPORT_MAX_HORIZON_DAYS`). Uses `findExpiringForReport`, which shares `00049`'s partial-index
predicate. Each row gets `resolveExpiryBucket` and `days_remaining` computed from **IST today** via
the existing `document_expiry.utils` helpers — not from `NOW()` in SQL, so the report and the expiry
cron can never disagree about what day it is. Response carries a `buckets` roll-up
(`expired/due_7/due_30/due_60/due_90`) plus the rows.

*Ledger reads.* #119 `GET /hr/exports` — filters `export_type`, `status`, `from`, `to`; paged;
`ORDER BY created_at DESC, id DESC`. #120 `GET /hr/exports/:id`. Both return the `filters` JSONB
as-is (it holds only ids and bounds, §13.5).

**Validation.** `within_days` 1–365; `department_id`/`document_type_id` UUIDs that exist in the org;
`include_employees` boolean; `limit` ≤ 100; ledger date range ≤ 366 days.

**Authorization.** All six endpoints `authorize(['hr'])` + `requireFeature('documents.access')`.
The ledger is HR-only and **read-only over HTTP** — there is no endpoint that creates, edits or
deletes a ledger row, by design.

**Storage/file impact.** **Not applicable** — CSVs are built in memory and streamed; nothing is
written to S3. This is the deliberate difference from payroll's report exports, which persist
artefacts: a document compliance CSV is a point-in-time read of PII and storing it creates a second
copy with its own retention and access problem.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| Row count over the cap | `422 EXPORT_TOO_LARGE` before the ledger row exists. Client narrows the filter. |
| Crash after `begin`, before `send` | `fail(id, message)`; the row shows `failed` with a reason. |
| Crash mid-`send` (socket dies) | Headers are already out; `fail` records `failed` with `byte_count` = bytes written. Mirrors `download.helper`'s mid-stream branch. |
| `begin` itself fails (DB down) | `503`; **no export is produced.** The ledger is a hard gate: if we cannot record the egress, we do not perform it. This is the one place the ledger is allowed to block. |
| `complete` fails after a successful send | Swallowed and logged at `warn`. Row stays `started`. §29 alerts on `started` rows older than 15 minutes. |
| Duplicate submit (double-click) | Two ledger rows, two identical CSVs. **Correct** — two exports happened and the ledger records exports, not intentions. Not de-duplicated (§17.3). |
| Roster changes mid-report | Accepted skew; the response carries `generated_at` and the report is documented as point-in-time. |
| An employee's checklist call throws | The chunk's error propagates; the whole report fails with `500`. Partial reports are worse than no report for a compliance surface. |

**Testing.** T-12…T-18.

**Acceptance criteria.**
1. Every CSV endpoint (including the retro-wired #77) writes exactly one ledger row, `started` before the first byte and `completed` after.
2. A forced mid-build throw leaves a `failed` row with a reason and no partial success response.
3. `EXPORT_TOO_LARGE` leaves **no** ledger row.
4. Missing-mandatory totals match a per-employee #94 call for the same roster.
5. The expiring report's buckets agree with `document_expiry.utils` for the same IST date.
6. The ledger's `filters` contains no names and no `document_number` (asserted structurally).
7. #119/#120 are HR-only; every other plane gets `403`.

---

### F-4 — Offboarding Archive, Waivers and the Exit Pack

**Requirement.** Parent §9 Phase 5 (Manager §2.2): *"bulk-archive documents on exit, waive open
recipient rows with a reason, produce an exit document pack"*; exit dates via the `employee_exits`
repository (D-18). Plus EC-14 and EC-30.

**Existing dependency.** `employee_exit.repository.{findLiveByUserId,findLiveForOrg}` (D-18);
`org_document_recipient.repository.waive` (P2 #61); `document_request.repository` +
`DOCUMENT_REQUEST_OPEN_STATUSES` (P4); `employee_documents.status='archived'` (P1 enum);
`document_audit.service.record`; `document_export.service` (F-3) for the pack's ledger row;
`document_read.service.viewUrl` for the pack's URLs; `organization.service.softDeleteEmployee`
(the EC-30 trigger); `document_settings` #80/#81.

**Database impact.** No new table and **no enum change** — `archived` already exists on
`employee_documents.status`. Only the two new settings columns (§6.5) and the two bulk repository
methods.

**API impact.** #122 `POST /hr/employees/:userId/offboard-documents`,
#123 `GET /hr/employees/:userId/exit-pack`, #124 `GET /hr/employees/:userId/exit-pack.csv`,
#125 `POST /hr/jobs/offboarding-archive/run`.

**Business logic.**

`document_offboarding.service.archiveForUser({orgId, userId, actorId, trigger, reason, dryRun})`
— **one transaction**, in this order:

```
BEGIN
  pg_advisory_xact_lock(hashtext('document_offboarding:' || orgId || ':' || userId))
  1. resolve the trigger        (exit row via employee_exit.repository, or membership state)
     → if resolveArchiveTrigger says no, ROLLBACK and return { skipped:'not_offboarding' }
  2. if settings.document_offboarding_archive_mode = 'archive':
        employee_document.repository.bulkArchiveForUser(orgId, userId,
            { statuses: ARCHIVABLE_STATUSES, archivedBy: actorId }, { transaction })
        → UPDATE … SET status='archived', updated_at=NOW()
          WHERE org_id=:o AND user_id=:u AND status IN (...) AND deleted_at IS NULL
        → returns the affected ids (RETURNING id) so the audit rows can name them
     else ('retain'): archived_count = 0
  3. org_document_recipient.repository.bulkWaiveForUser(orgId, userId,
            { waivedBy: actorId, waivedReason: resolveWaiveReason(trigger), waivedAt: NOW() })
        → WHERE status IN ('pending','viewed')          ← WAIVABLE_RECIPIENT_STATUSES (B-1)
        → acknowledged / signed / already-waived rows untouched (EC-14)
  4. document_request.repository.bulkCancelOpenForUser(orgId, userId,
            { cancelledBy: actorId, reason }) over DOCUMENT_REQUEST_OPEN_STATUSES
  5. mark this user's undelivered notifications as 'skipped' (B-10):
        document_notification.repository.skipPendingForUser(orgId, userId,
            { statuses: ['pending','failed'], reason: 'recipient_offboarded' })
        → WHERE recipient_user_id = :u AND status IN ('pending','failed')
        → 'skipped' is an existing value of the document_notifications status enum
          ('pending','sending','sent','failed','skipped'), so NO enum change is needed.
          'sending' is deliberately excluded: it is claimed by a dispatcher worker and
          stealing it would race the outbox CLAIM→SEND→RECORD protocol.
  6. audit ONE row per affected entity kind, not per entity:
        document.bulk_archived         newValues { user_id, count, document_ids: [...] }
        org_document.recipients_waived newValues { user_id, count, reason }
        document_request.bulk_cancelled newValues { user_id, count }
     (three rows, each carrying a SAMPLE of its id list — per-entity rows would put 400 rows
      in document_audit_logs for one offboarding and drown the real signal)

     B-8: the id list is capped at AUDIT_ID_SAMPLE_MAX = 100 and carries
          { count, document_ids: [...first 100...], ids_truncated: true|false }.
          Uncapped, an employee with 2 000 documents writes ~72 KB of UUIDs into one JSONB
          column. `count` is always exact; the array is a sample for investigation, and the
          authoritative per-document record is each document's own row plus this audit row's
          timestamp.
COMMIT
```

`dryRun: true` runs steps 1–4 as counts only (`SELECT count(*)` instead of the writes), rolls back,
and returns the projected numbers. HR sees what would happen before it happens; #122 accepts
`?dry_run=true`.

**Invariants this preserves.** Nothing is deleted. Acknowledgement rows, signature evidence rows
and audit rows are never touched. Waived recipients keep their history (`waived_reason`,
`waived_by`, `waived_at`) — the parent's EC-14 wording, *"never deleted"*, is the hard rule.
S3 objects are untouched: retention, not offboarding, decides object deletion. Notifications are
moved to `skipped`, never deleted, so the outbox remains a complete record of what was and was not
sent.

**Why step 5 exists (B-10).** Without it, offboarding waives the obligation but leaves the queued
reminder rows alone, and the dispatch cron then emails a departed employee "please acknowledge your
policy" for an obligation that no longer exists — possibly to a mailbox that has been deactivated,
generating bounces. The outbox dispatcher does not re-check recipient state before sending, so the
cancellation has to happen here.

*Exit pack.* `document_offboarding.service.exitPack({orgId, userId, actorId, scope, ip, requestId})`:
- `scope` defaults to `document_offboarding_exit_pack_scope` (#81) and may be overridden per call.
- Gathers, per `partitionPackItems`: the employee's `employee_documents` in
  `['available','expired','archived']`, and their `org_document_recipients` joined to published
  `org_documents`.
- **Caps the item count at `EXIT_PACK_MAX_ITEMS = 500`** (B-17); above it, `422 EXIT_PACK_TOO_LARGE`
  with `{item_count, max_items}` and a suggestion to narrow `scope`. Without a cap, a long-tenured
  employee's pack would issue an unbounded number of signatures and return a multi-megabyte JSON
  body of live credentials.
- For each item, issues a signed URL through `documentReadService.viewUrl` with the **HR** audience,
  `disposition='attachment'` and a TTL of `min(document_view_url_ttl_seconds, 900)` — the pack is
  a bulk disclosure, so it gets the shorter of the configured TTL and 15 minutes.
- Because `viewUrl` audits each issuance, a 40-document pack writes 40 `document.view_url_issued`
  rows **plus** one `document_export_jobs` row of type `exit_pack`. Both are intended: the ledger
  answers "who pulled a pack", the audit rows answer "which documents were in it".
- CSV variant (#124) omits the URLs and lists metadata only — a CSV of live signed URLs is a file
  full of bearer tokens that outlives its own TTL in somebody's downloads folder.

*Cron.* `document_automation.service.runOffboardingArchive()` — daily 02:10 IST, after the
02:00 expiry flip so a document expiring on the last working day is flipped before it is archived.
Per org it runs **two** passes:

- **Pass A — exits.** `employee_exit.repository.findLiveForOrg(orgId, { lastWorkingDayOnOrBefore:
  todayIst, status: 'completed' })` → `archiveForUser({trigger:'exit'})`.
- **Pass B — removed members (B-9).**
  `employee_document.repository.findInactiveMembersWithArchivableDocuments(orgId, { statuses:
  ARCHIVABLE_STATUSES, limit: OFFBOARDING_BATCH })` — users who hold archivable documents but whose
  org membership is inactive or soft-deleted → `archiveForUser({trigger:'membership_removed'})`.

**Pass B is not optional.** §18.2 promises that a failed EC-30 post-commit hook is caught by the
next cron run, and Pass A alone cannot deliver that promise: a soft-deleted employee has no
`employee_exits` row, so Pass A never sees them and the "backstop" would be fiction. Pass B is the
query that makes the guarantee real. It is also self-limiting — once a user's documents are
archived they stop matching, so the scan shrinks to nothing in steady state.

Each pass is bounded at `OFFBOARDING_BATCH = 200` users per org per run; the remainder is picked up
the next day and the run logs `remaining` per pass.

*EC-30 hook.* In `organization.service.softDeleteEmployee`, **after** the existing transaction
commits, inside a swallowing try/catch:
`documentOffboardingService.archiveForUser({orgId, userId, actorId, trigger:'membership_removed'})`.
Post-commit rather than in-transaction, because the document work touches four tables and a
document-side failure must never prevent an employee from being removed from the organisation. If
the hook fails, the daily cron's `membership_removed` branch catches the user the next morning —
so the guarantee is eventual, not immediate, and that is stated in the completion report.

**Validation.** `userId` is a UUID and an org member (current or former); `reason` optional ≤ 500;
`scope` ∈ `EXIT_PACK_SCOPES`; `dry_run` boolean.

**Authorization.** All four endpoints `authorize(['hr'])`.
**Managers are read-only here.** The parent's §2.2 places offboarding under the manager section, but
archiving documents, waiving compliance obligations and pulling a full PII pack are irreversible
org-level acts; P5 keeps them HR-only and records the manager-propose/HR-approve variant as O-8 in
§27. Managers retain their existing team visibility (#79, #94, #95) over the same employee.
`:userId`-addressed ⇒ denial is `403 FORBIDDEN`, not `404`.

**Storage/file impact.** No object is created, moved or deleted. Only short-TTL GET URLs are issued
through the existing signer.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| Called twice for the same user | Idempotent: pass 2 archives 0 (no rows left in `ARCHIVABLE_STATUSES`), waives 0, cancels 0, and returns zero counts. The advisory lock serialises concurrent calls. Audit rows are written **only when a count is non-zero** — otherwise a nightly cron writes three no-op audit rows per ex-employee forever. |
| No exit record and the membership is still active | `422 NOT_OFFBOARDING` on the endpoint; skipped silently by the cron. Prevents archiving a current employee's documents by typo. |
| Exit record exists but `last_working_day` is in the future | Cron skips; the endpoint allows it with an explicit `force=true` (HR sometimes offboards early). Without `force`, `422 EXIT_DATE_IN_FUTURE`. |
| Employee has 2000 documents | `bulkArchiveForUser` is a single `UPDATE … WHERE`, not a loop. One statement, one lock set. |
| Exit pack requested for someone with no documents | `200` with an empty `items` array and a ledger row with `row_count: 0`. Not a `404` — "this person has no documents" is a valid, useful answer. |
| A `viewUrl` call inside the pack throws | The item is returned with `url: null` and `url_error: 'UNAVAILABLE'`; the pack still renders. One unreadable object must not fail an offboarding. |
| Payroll's `employee_exits` table is absent (module not installed) | `resolveArchiveTrigger` degrades to the membership check; the cron logs `exits_unavailable` once per run and continues. D-18's graceful-degradation rule. |
| Rehire after offboarding | Archived documents stay archived (they are historical); the rejoin's recipient top-up (F-7) creates fresh recipient rows. Un-archiving is not offered — re-upload is the auditable act. Stated in §14.3. |

**Testing.** T-19…T-27.

**Acceptance criteria.**
1. Offboarding archives exactly the `ARCHIVABLE_STATUSES` rows, waives only `pending`/`overdue` recipients, cancels only open requests — in one transaction.
2. Nothing is deleted; acknowledgement and signature evidence row counts are unchanged (asserted).
3. Re-running is a no-op and writes no audit rows.
4. `retain` mode archives nothing but still waives and cancels.
5. The exit pack's URLs expire within 15 minutes and each issuance is audited.
6. The pack CSV contains no URLs.
7. Soft-deleting an employee triggers the same unwinding, and a forced hook failure does not fail the soft delete.
8. Concurrent calls for the same user produce one set of effects.

---

### F-5 — Composed Employee Document View (incl. payroll delegation)

**Requirement.** Parent §1.3 / D-4 / §9 Phase 5: one employee-facing view that surfaces the
employee's own documents, the org documents addressed to them, available templates, and
payroll-owned documents (payslips, Form 16) **read-only, by delegation — no rows move**.

**Existing dependency.** `document_read.service.listBySubject` (P1); `document_org_read.service`
self list (#70, P2); `document_template.service` self list (F-1);
`payslip_read.service.listForUser` (payroll); `employee_tax_summary.repository` (payroll, + one new
method); `entitlement.service` via `requireFeature`.

**Database impact.** **None.** The one DB-adjacent change is the additive payroll repository read
in §10 F-5 below.

**API impact.** #126 `GET /me/documents/all`. Additive only: `/me/documents` and `/me/hr-documents`
keep their exact shapes (§26.1).

**Business logic.**

`document_composer.service.compose({orgId, userId, sections})` returns four independently-degradable
sections in one envelope:

```json
{
  "sections": {
    "my_documents":   { "available": true, "items": [...] },
    "org_documents":  { "available": true, "items": [...] },
    "templates":      { "available": true, "items": [...] },
    "payroll":        { "available": false, "reason": "NOT_ENTITLED", "items": [] }
  },
  "generated_at": "2026-09-25T…Z"
}
```

Every item shares one shape, which is the whole point of the composer:

```
{ source: 'employee'|'org'|'template'|'payroll',
  id, title, category, status, issued_on, expires_on, requires_action,
  action: 'acknowledge'|'upload'|null,
  access: { kind: 'document'|'org_document'|'template'|'payroll_payslip'|'payroll_form16',
            path: '/api/v1/documents/attachments/<id>/view-url' | '<module path>' } }
```

`access.path` is a **path, not a URL**. The composer issues no signed URL — a composed list of 60
items would mean 60 signing calls and 60 audit rows for a screen the user is merely scrolling. The
client calls the path when the user actually opens something, and that call audits. This also keeps
the payroll sections honest: the document module never signs a payroll object, it hands back
payroll's own endpoint path (D-4).

Section sourcing:
- `my_documents` — `documentReadService.listBySubject(orgId, userId, {audience:'self'})`, unchanged screening.
- `org_documents` — the same reader that backs #70; `requires_action: true` when the recipient row is `pending`/`overdue`.
- `templates` — `documentTemplateService.listForEmployee(orgId, userId)` (F-1).
- `payroll` — only if `hasFeature(orgId, 'payroll.access')`:
  `payslipReadService.listForUser(orgId, userId)` → items with
  `access.path = '/api/v1/payroll/me/payslips/<id>/download'`; and
  `employeeTaxSummaryRepository.findFinalizedFysForUser(orgId, userId)` → one item per **finalized**
  FY with `access.path = '/api/v1/payroll/me/form16/<fy>'`.

The new payroll repository method — the only payroll-side addition in P5:

```js
// employee_tax_summary.repository.js  (additive)
async function findFinalizedFysForUser (orgId, userId, { transaction } = {}) {
  return EmployeeTaxSummary.findAll({
    where: { org_id: orgId, user_id: userId, status: 'finalized' },
    attributes: ['financial_year', 'finalized_at'],
    order: [['financial_year', 'DESC']],
    transaction
  })
}
```
Read-only, additive, no existing method changed. If payroll's status vocabulary differs at
implementation time, match it — the intent is "years where a Form 16 can actually be produced".

**Validation.** Optional `sections` query param: a comma-separated subset of
`my_documents,org_documents,templates,payroll`; unknown names are `400 INVALID_SECTION`. Default is
all four. Per-section `limit` ≤ 100, default 50, with `has_more` — a composed view must not become
the module's one unbounded endpoint.

**Authorization.** `authenticate` + `requireFeature('documents.access')`; **self plane only** — the
route is `/me/...` and `userId` comes from `req.user`, never from the request. There is no
`/hr/employees/:userId/documents/all`: HR already has #113 search, #94 checklist and #123 exit pack,
and a composed HR view of another person's payslips would be a new payroll disclosure surface this
module has no authority to create.

**Storage/file impact.** **Not applicable** — no URL is issued and no key is read.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| Payroll module absent / not entitled / throws | `payroll: { available: false, reason: 'NOT_ENTITLED' \| 'UNAVAILABLE', items: [] }`. **Never** a `500`. `require`d lazily inside a try/catch so a missing module is a soft failure. |
| Any one section throws | That section degrades with `available: false, reason: 'UNAVAILABLE'`; the others render. Logged at `warn` with the section name. |
| Templates feature not configured | Empty `items`, `available: true` — no templates is a legitimate state, not a failure. |
| Employee has 500 documents | Each section is capped and paged independently. |

**Testing.** T-28…T-31.

**Acceptance criteria.**
1. All four sections return with one uniform item shape.
2. No signed URL is issued (asserted: the S3 signer is never called during compose).
3. With `payroll.access` absent, the payroll section degrades and the response is still `200`.
4. A thrown payroll error degrades that section only.
5. `/me/documents` and `/me/hr-documents` responses are byte-identical before and after P5 (snapshot test).
6. The composer reads no payroll `storage_key` and constructs no payroll URL.

---

### F-6 — Bulk-Publish Threshold and Async Materialisation (EC-16, Open Decision 5)

**Requirement.** Parent §8 and EC-16: above a threshold, publish returns `202` and completes in the
background; the threshold is an org setting, **measured** in Phase 5.

**Existing dependency.** `document_org.service.publish` (P2); `document_recipient.service.
{resolveAudience, materialise, syncRecipients}` (P2); `document_org_rules.utils.
ORG_PUBLISH_SYNC_LIMIT` (P2); `document_automation.service._forEachOrg` (P4);
`document_settings` #79.

**Database impact.** `org_documents.{materialisation_state, materialised_at,
recipient_target_count}` + the partial index + the CHECK (§6.4).

**API impact.** #47 `POST /hr/org-documents/:id/publish` gains a **`202`** response shape for large
audiences (§26.2 — behavioural, in the change record). #127
`GET /hr/org-documents/:id/materialisation` reports progress. #129
`POST /hr/jobs/publish-materialisation/run` is the manual trigger, grouped with F-4's #125.

**Business logic.**

`publish` today: resolve audience → if `resolved.length > ORG_PUBLISH_SYNC_LIMIT` throw `422` →
else materialise in batches inside the transaction. After F-6:

```
resolve audience → target = resolved.length
threshold = settings.document_publish_sync_threshold        (default 20000)

if target <= threshold:                       ← UNCHANGED PATH, byte for byte
    materialise all inside the publish transaction
    materialisation_state = 'not_required'
    → 200 { status:'published', recipients_created: N }

else if target <= ORG_PUBLISH_SYNC_LIMIT:     ← the async path
    inside the publish transaction:
        status='published', published_at, frozen audience snapshot,
        materialisation_state='pending', recipient_target_count = target
        materialise the FIRST batch (MATERIALISE_BATCH = 5000) so an operator sees
        immediate progress and a misconfigured audience fails loudly at once
    COMMIT
    → 202 { status:'published', materialisation_state:'pending',
            recipient_target_count: target, recipients_created: <first batch>,
            poll: '/api/v1/documents/hr/org-documents/<id>/materialisation' }

else:                                          ← target > the code ceiling
    422 RECIPIENT_SET_TOO_LARGE                ← unchanged, still a hard refusal
```

The document is **published** in both paths. That is the important decision: a published document
with incomplete recipients is recoverable (the worker finishes it); a document left in `draft`
while a worker runs is a state HR cannot reason about and cannot cancel.

`document_recipient.service.materialisePending({orgId, docId, batchSize})`:
advisory-lock the group → re-read the doc `FOR UPDATE` → if not `pending`, return
`{state:'complete', added:0}` → recompute the recipient set from the **frozen snapshot** (never
from live criteria — a department change mid-materialisation must not alter the audience) →
`findExistingRecipientUserIds` → insert at most `batchSize` of the difference via the existing
`bulkInsert` → if nothing remains, set `materialisation_state='complete'`, `materialised_at=NOW()`
→ return `{state, added, remaining}`.

Cron `document_publish_materialiser.cron.js` — every 5 minutes, delegating to
`documentAutomationService.runPublishMaterialisation()`: per org,
`org_document.repository.findPendingMaterialisation(orgId, { limit: MATERIALISE_DOC_LIMIT })`, then
`materialisePending` per document, one batch per document per tick (so one enormous publish cannot
starve the others). Also added to `runStartupCatchUp` so a crash mid-materialisation self-heals on
boot without waiting for the tick.

**Validation.** `document_publish_sync_threshold` ∈ [100, 20000] (`SETTINGS_CAPS`). The upper bound
is the code ceiling: an org may make itself more conservative, never less.

**Authorization.** Unchanged for #47 (`authorize(['hr'])`). #127 and the job trigger are HR-only.

**Storage/file impact.** **Not applicable** — materialisation writes recipient rows only.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| Worker crashes mid-batch | The batch's transaction rolls back; `materialisation_state` stays `pending`; the next tick redoes that batch. Inserts are add-only against the existing-recipient set, so a redo inserts nothing twice. |
| Two workers pick the same document | The advisory lock serialises them; the loser finds the state already `complete` or the batch already inserted and adds 0. |
| The document leaves `published` while `pending` — i.e. moves to `superseded` (P2 replace), `retired` or `rejected`. **There is no `archived` status on `org_documents`** (B-4): the enum is `draft \| published \| superseded \| retired \| rejected`. | `materialisePending` re-reads under `FOR UPDATE`; any non-`published` status ends materialisation and sets `materialisation_state='complete'` with `materialised_at` — the remaining recipients are intentionally never created. Audited as `org_document.materialisation_halted` with the observed status. This code-side guard is the **only** enforcement, because the equivalent CHECK constraint is a trap (§6.4, B-3). |
| A pending document never completes (bad criteria, empty resolution) | Each tick adds 0 and `remaining` stays > 0. §29 alerts on `pending` rows older than 1 hour. |
| An org lowers the threshold while a publish is pending | No effect — the threshold is read at publish time only. |
| Client polls #127 for a document that was published synchronously | `200 { materialisation_state: 'not_required', recipients_created: N, recipient_target_count: null }`. No error. |

**Testing.** T-32…T-36.

**Acceptance criteria.**
1. A publish at or below the threshold returns `200` with the **exact** P2 body (snapshot).
2. A publish above it returns `202`, the document is `published`, `materialisation_state='pending'`, and the first batch exists.
3. Running the worker to completion yields exactly `recipient_target_count` recipients with no duplicates.
4. A crash between batches loses nothing and duplicates nothing.
5. Above the code ceiling, the `422` is unchanged.
6. `syncRecipients`' signature and `422` behaviour are unchanged (asserted directly).

---

### F-7 — On-Join Recipient Top-Up

**Requirement.** Parent §9 Phase 5 and EC-13: an employee who joins after a document was published
must receive the open org documents that target them — **at join time**, not up to 24 hours later.

**Existing dependency.** `document_recipient.service.syncRecipients` + `document_targeting.utils.
{normaliseCriteria, matchesCriteria}` (P2); `org_document.repository.findTopUpCandidates` (P4);
`invitation.service.acceptInvitation` (organization).

**Database impact.** **None.**

**API impact.** **None** — this is an internal hook with no HTTP surface. (The existing P4 manual
trigger #90 already covers the cron.)

**Business logic.** `document_recipient.service.topUpForUser({orgId, userId})` — the transpose of
`syncRecipients` (one user × many documents instead of one document × many users):

```
1. load the user's profile facts once: department_id, designation_id, location_id,
   employment_type, date_of_joining
2. org_document.repository.findPublishedForUserMatch(orgId)
      → published, non-archived documents whose acknowledgement window is still open
        (the same visibility predicate findTopUpCandidates already uses — extracted, not rewritten)
3. for each, matchesCriteria(frozen_snapshot_criteria, userFacts)      ← frozen, not live
4. for the matches, one transaction:
      advisory lock hashtext('document_recipient_topup:' || orgId || ':' || userId)
      filter out documents where a recipient row already exists for this user
      bulkInsert the remainder with due_on computed from TODAY (the join date), not the
        original publication date — a new joiner gets a full acknowledgement window
      audit ONE org_document.recipients_topped_up row { user_id, count, document_ids }
   COMMIT
5. return { added_count }
```

Hook site — `invitation.service.acceptInvitation`, after the membership transaction commits and
after `invitationRepository.consume(rawToken)`, before the return:

```js
try {
  const { topUpForUser } = require('../../document/services/document_recipient.service')
  await topUpForUser({ orgId, userId })
} catch (err) {
  logger.warn('document recipient top-up failed after invitation accept', { orgId, userId, err: err.message })
}
```

Post-commit and swallowing, for the same reason as F-4's EC-30 hook: **an invitation must never fail
because of the document module**, and P4's daily cron is the backstop. The lazy `require` also keeps
the organization module from taking a hard load-time dependency on the document module.

**Validation.** Internal call; `orgId` and `userId` are UUIDs from the caller's own committed state.

**Authorization.** **Not applicable** — system-initiated, no actor plane. The audit row records
`actor_id = null` with `actor_type = 'system'`, exactly as the P4 crons do.

**Storage/file impact.** **Not applicable.**

**Failure handling.**

| Failure | Behaviour |
|---|---|
| Hook throws | Swallowed and logged; the daily cron (P4) catches the user within 24h. Documented as an eventual guarantee. |
| Hook and cron race for the same user | Advisory lock + the existing-recipient filter ⇒ one row each, no duplicates. The `(org_document_id, user_id)` unique constraint from `00050` is the final backstop. |
| A criteria snapshot references a department the joiner is not in | No match, no row. Correct. |
| The joiner has no `department_id` yet (profile completed later) | Only criteria that do not require it match now; the daily cron picks up the rest once the profile is filled. This is precisely why the cron is kept and not replaced. |
| 300 published documents in the org | One query plus one bounded insert; `matchesCriteria` is pure and in-memory. |

**Testing.** T-37…T-39.

**Acceptance criteria.**
1. Accepting an invitation creates recipient rows for every open, matching published document.
2. `due_on` is computed from the join date, not the publication date.
3. A forced throw in the hook does not fail `acceptInvitation` (the membership still exists).
4. Running the hook and then the P4 cron produces no duplicate recipients.
5. Exactly one audit row is written, and only when `added_count > 0`.

---

### F-8 — Leave Attachment Bridge (D-17, EC-34)

**Requirement.** Parent D-17: *"Leave applications may optionally reference a document by
`document_id`; the leave module resolves it into a `document_url`. Existing callers passing a raw
URL continue to work unchanged."* EC-34: define precedence when both are passed.

**Existing dependency.** `document_read.service.viewUrl` (P1 — the full authority matrix);
`document_authority.utils.screenDocument`; `leave_application.service.submitLeaveRequest` +
`_assertDocumentRequirement`; `leave_request.validator`.

**Database impact.** **None.** `leave_requests.document_url` (`STRING(255)`) is reused; no column,
no migration. The generated value is
`/api/v1/documents/attachments/<uuid>/view-url` — 48 characters, well inside the limit (P-12).

**API impact.**
- `POST /api/v1/leaves` (and the manager/HR on-behalf variants that share the service) accept an
  optional `document_id`.
- #128 `GET /api/v1/documents/attachments/:id/view-url` — **audience-neutral** (**B-14**: *not*
  "plane-neutral"; in this module "plane" means employee-owned vs org-issued per D-2, and #128
  serves the **employee plane only**). It works for the owner, their manager chain and HR, resolving
  the audience from `req.user` rather than from the path.
- #128 also accepts **`?redirect=true`**, which answers `302 Found` with the signed URL in
  `Location` instead of a JSON body (**B-11**, below).
- **Requires a dated change record in `public/md_updates`** (parent D-17 says so explicitly, and so
  does the project rule). §28 D-4.

**Why #128 exists, stated precisely (B-13).** It adds **no new capability**. All three audiences can
already obtain a view URL for an employee document today:

| Audience | Existing endpoint |
|---|---|
| HR | `GET /api/v1/documents/hr/documents/:id/view-url` (`document_hr.routes.js:36`) |
| Manager | `GET /api/v1/documents/manager/documents/:id/view-url` (`document_manager.routes.js:23`) |
| Self | `GET /api/v1/documents/me/documents/:id/view-url` (`document_self.routes.js:21`) |

What does not exist is **one path that is correct for every reader**, and that is precisely what a
leave record needs: `leave_requests.document_url` is a single string read by the applicant, their
manager and HR. Storing any of the three audience-specific paths above would be wrong for two of the
three readers. #128 is an audience-dispatching alias over `documentReadService.viewUrl`, and that is
its whole justification. The alternative — add a `document_id` column to `leave_requests` and let
each client pick its own endpoint — is arguably cleaner but requires a leave schema change that D-17
does not ask for; it is recorded as O-13 in §27.

**B-11 — the stored value is a relative path, and that has two consequences the implementer must
handle.**

1. **Existing clients that render `document_url` as an `href` will break.** Today the column holds
   an absolute URL that a browser can open directly. After the bridge it may hold
   `/api/v1/documents/attachments/<uuid>/view-url`, which returns `200 {url, expires_at}` — JSON,
   not a file. A link straight to it shows the user raw JSON. Two mitigations, both required:
   - `?redirect=true` returns `302` to the signed URL, so
     `/api/v1/documents/attachments/<uuid>/view-url?redirect=true` **is** directly linkable. Store
     the **plain** path in the column and let the client add the parameter, so the stored value
     stays useful to a JSON client; the change record spells out both forms.
   - The change record (§28 D-4) must call this out as a **frontend action item**, not bury it in a
     field list. This is the single highest-risk item in Phase 5 for the web client.
2. **`Joi.string().uri()` rejects relative paths.** `leave_request.validator.js:22` is
   `document_url: Joi.string().uri().max(255).allow('', null)`, and Joi's `uri()` requires a scheme
   unless `allowRelative: true`. Submission itself is safe — the service **derives** the value and
   writes it past the validator. But any flow that echoes a stored `document_url` back into
   `submitRequestSchema` (re-apply, duplicate-leave, "edit and resubmit") would be rejected with a
   validation error on a value this system itself produced. Relax the rule to:

   ```js
   document_url: Joi.alternatives()
     .try(
       Joi.string().uri({ scheme: ['http', 'https'] }),
       Joi.string().pattern(/^\/api\/v1\/documents\/attachments\/[0-9a-fA-F-]{36}\/view-url$/)
     )
     .max(255).allow('', null)
   ```

   Verified: `leave_requests.document_url` is a bare `STRING(255)` with **no** Sequelize validator
   (`leave_request.model.js:56`), and `_assertDocumentRequirement` only tests truthiness
   (`if (ctx.documentUrl) return`), so nothing else in the leave module inspects the value's shape.

**Business logic.**

In `submitLeaveRequest`, **before** `_assertDocumentRequirement` (P-13):

```
if (document_id) {
    resolved = await documentReadService.resolveForLeaveAttachment({
        orgId, documentId: document_id, actorUserId: requester.userId,
        actorRole: requester.role, subjectUserId: leaveSubjectUserId
    })
    effectiveDocumentUrl = resolved.attachment_path
} else {
    effectiveDocumentUrl = document_url || null
}
```

`document_read.service.resolveForLeaveAttachment` (new, thin):
1. `findById` scoped to `orgId` → not found ⇒ `404 DOCUMENT_NOT_FOUND`.
2. `screenDocument` for the actor's audience → denied ⇒ `404 DOCUMENT_NOT_FOUND` (`:id` addressing).
3. **The document must belong to the leave's subject.** Attaching someone else's medical certificate
   to your own leave is a disclosure, and this is the check that prevents it: `row.user_id !==
   subjectUserId` ⇒ `422 DOCUMENT_NOT_OWNED_BY_SUBJECT`.
4. Status must be in `['available','pending_verification']` ⇒ otherwise `422
   DOCUMENT_NOT_ATTACHABLE`. A rejected, quarantined, expired, archived or deleted document is not
   evidence.
5. Returns `{ document_id, attachment_path, title, document_type_code }`.

**Precedence (EC-34, resolving K-8): `document_id` wins.** If both are supplied, the raw
`document_url` is ignored, the response echoes the resolved path, and the service logs at `info`
once. The change record states this in one sentence. The alternative — `400` — was rejected in O-3:
a redundant field should not cost someone their leave application.

`_assertDocumentRequirement` then sees a non-empty `documentUrl` and passes, unchanged. A leave type
that requires a document is satisfied by either form — which is the entire point of D-17.

#128's controller resolves the audience from `req.user.role`
(`hr` → `hr`; otherwise `self` if `actorUserId === row.user_id`, else `manager` with
`getAccessibleUserIds`) and delegates to `documentReadService.viewUrl` with
`disposition = 'inline'`. **No new authority logic exists in this endpoint** — that is why it is
safe to expose one path to three planes. The issuance is audited by `viewUrl` exactly as #57 is.

**Validation.** `document_id: Joi.string().uuid().optional()` added to the leave submit schema.
`document_url` keeps its existing rule verbatim. Both optional; neither required by the schema
(requirement is a leave-type rule, not a schema rule).

**Authorization.**
- Attaching: the requester must be able to read the document **and** the document must belong to the
  leave's subject (step 3). An employee can only ever attach their own; HR or a manager applying on
  behalf can attach the subject's.
- Viewing (#128): the P1 matrix, unchanged. Confidential documents remain invisible to managers when
  the type says so — an approver who cannot see a confidential document sees `404`, and the leave
  still shows the attachment's presence. Documented as intended in the change record.

**Storage/file impact.** No new key, no new object. One additional signing call per view.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| `document_id` not found / not readable | `404 DOCUMENT_NOT_FOUND` — the leave is **not** created. Blocking, deliberately: silently dropping the attachment on a document-requiring leave type would produce an approved leave with no evidence. |
| Document belongs to someone else | `422 DOCUMENT_NOT_OWNED_BY_SUBJECT`. |
| Document deleted after the leave is submitted | The stored path stays; #128 then returns `404` at view time. The leave record is not mutated — rewriting history because a file vanished is worse than a dead link, and the audit trail explains it. |
| Document module unavailable | The resolution throws and the leave fails. Accepted: the caller asked for an attachment; producing a leave without it is a silent data-integrity loss. Callers who want resilience pass `document_url`. |
| Both fields supplied | `document_id` wins (above). |
| Existing caller passes only `document_url` | **Zero change** — the new branch is not entered. T-42 asserts this. |

**Testing.** T-40…T-44.

**Acceptance criteria.**
1. Submitting with `document_id` stores the attachment path and satisfies a document-requiring leave type.
2. Submitting with only `document_url` behaves exactly as before P5 (the existing leave suite stays green).
3. Both supplied ⇒ `document_id` wins, echoed in the response.
4. Another employee's document is refused.
5. A non-attachable status is refused.
6. #128 serves owner, manager and HR correctly and denies everyone else with `404`.
7. A dated change record exists in `public/md_updates`.

---

### F-9 — Hardening, Carry-over Defects, Performance and Security

**Requirement.** Parent §9 Phase 5: full §10 edge-case regression; performance measurement against
§8; a security pass (IDOR, confidentiality leakage, signed-URL scope, content-type bypass). Plus the
four defects P4's §27.4 carried forward.

**Existing dependency.** The whole module; P4's §27.4 defect list; parent §8 and §12.

**Database impact.** **None.**

**API impact.** **None**, except the D-3 decision below, which *removes* a field from an internal
projection and is therefore checked for response impact in §26.

**Business logic — the carry-over defects.**

| ID | Defect | Resolution |
|---|---|---|
| **D-2** | `document_upload.service.js` (~line 335) has a duplicated `requires_verification` condition in one OR. | Delete the redundant clause. Pure dead logic; no behaviour change. One test asserts the verification decision for all four input combinations before and after. |
| **D-3** | `reference_url` is in `employee_document.repository.LIST_ATTRIBUTES` (line 26). | **Remove it — and note this is a breaking field removal (verified, §26.3).** `DETAIL_ATTRIBUTES === LIST_ATTRIBUTES`, and `document_read.service.toClient` deletes only `storage_key` and `document_number`, so `reference_url` currently reaches **both** employee-document list and detail responses — despite that file's own header comment (line 29) claiming it is scrubbed. The org plane already made this fix (`org_document.repository.js:29`, comment "reference_url excluded — D-3 fix"); the employee plane is the straggler. Fix in two places for defence in depth: drop it from `LIST_ATTRIBUTES`, **and** add `delete plain.reference_url` to `toClient` so the header comment becomes true. `document_read.service.js:186` reads `full.reference_url` from `findByIdForStorage`, a different projection, and is unaffected. Requires a change-record entry (§28 D-5). |
| **D-4** | Mid-function `require` in `document_audit.service.js` (~line 70). | Hoist to the top of the file. Check for a circular-import reason first — if one exists, the `require` stays with a one-line comment explaining why, and the defect is closed as "by design". Do not silently reintroduce a cycle. |
| **D-5** | P1, P2 and P3 have no completion reports; P1 has no change record. | §28 D-5…D-8. Written from the shipped code, and each one says plainly that it was written retrospectively in P5 — a backdated report that pretends otherwise is worse than none. |
| **D-6** | `aws-s3.config.js` has no `APP_S3_BUCKET` fallback (parent D-5 requires one). | Add `process.env.APP_S3_BUCKET` as the last fallback in the existing resolution chain. Purely additive: with the variable unset, resolution is identical. |

**Business logic — the sweeps.**

*Edge-case regression (§22).* One table, EC-1…EC-36, each row naming the test that discharges it.
Any row whose test does not exist is written in P5 or explicitly marked "not discharged" with the
reason. No row is marked covered without a named test.

*Performance (§8 targets).* Cannot be measured here — no DB access. §25.6 hands the operator a
concrete procedure: the exact `EXPLAIN (ANALYZE, BUFFERS)` statements for search, the expiring
report, the missing-mandatory roll-up and the materialisation scan, the seed volumes
(50k documents / 5k employees / 300 org documents), the §8 target for each, and the decision rule
for setting #79 from the measurement. The completion report records these as **unmeasured** until
the operator returns numbers. Stating a measured number that was not measured is the one thing this
plan must not do.

*Security pass (§24.4).* Nine sweeps across all 129 endpoints:
1. Cross-org: every `:id` endpoint with a foreign-org id ⇒ `404`; every `:userId` endpoint ⇒ `403`.
2. Addressing-mode denial uniformity across the 31 new endpoints.
3. `storage_key` absent from every response, log line and audit row (the extended T-32 chokepoint plus a source grep for `storage_key` outside the four permitted service call sites).
4. `document_number` never in a bulk surface (search, reports, exports, composer, exit pack).
5. Signed-URL scope: every issued URL is single-object, time-bounded and `attachment`-dispositioned where §13.4 requires it.
6. Content-type bypass: extension/content-type mismatch refused on the template upload path.
7. Confidentiality: a manager never sees a confidential document through **any** new surface (search, exit pack, composer, #128).
8. Export ledger `filters` carries no PII.
9. Every new HR endpoint refuses `employee` and `manager`; `admin`/`super-admin` get no tenant data (the platform-plane rule).

**Validation / Authorization / Storage.** **Not applicable** — F-9 adds no surface.

**Failure handling.** Each defect fix is independently revertable and independently tested. The
sweeps are tests, not runtime code.

**Testing.** T-45…T-52 plus the §22 register.

**Acceptance criteria.**
1. All four code defects (D-2, D-3, D-4, D-6) are fixed or formally closed with a reason.
2. Every §22 row names a passing test or is explicitly marked not discharged.
3. All nine security sweeps pass.
4. The three missing completion reports and the P1 change record exist.
5. The performance procedure is documented and handed to the operator; the completion report marks the targets unmeasured until numbers come back.

---

## 11. API Surface

31 new endpoints, **#99–#129**. Every route carries `authenticate` and
`requireFeature('documents.access')`; the Role column lists the additional `authorize([...])`.
Base paths follow the established three-audience split: `/api/v1/documents/hr`,
`/api/v1/documents/manager`, `/api/v1/documents`.

### 11.1 Endpoint table

| # | Method | Path (after the base mount) | Role | Feature | Purpose | Denial |
|---|---|---|---|---|---|---|
| 99 | POST | `/hr/templates` | hr | F-1 | Create a draft template | — |
| 100 | PATCH | `/hr/templates/:id` | hr | F-1 | Update draft metadata | 404 |
| 101 | POST | `/hr/templates/:id/file-url` | hr | F-1 | Presigned PUT for the template file | 404 |
| 102 | POST | `/hr/templates/:id/confirm` | hr | F-1 | HeadObject verification of the upload | 404 |
| 103 | POST | `/hr/templates/:id/publish` | hr | F-1 | draft → published (archives the prior version) | 404 |
| 104 | POST | `/hr/templates/:id/replace` | hr | F-1 | Create the next draft version in the same group | 404 |
| 105 | POST | `/hr/templates/:id/archive` | hr | F-1 | published → archived | 404 |
| 106 | DELETE | `/hr/templates/:id` | hr | F-1 | Soft-delete a **draft** only | 404 |
| 107 | GET | `/hr/templates` | hr | F-1 | List (all statuses; filters: status, type, q) | — |
| 108 | GET | `/hr/templates/:id` | hr | F-1 | Detail | 404 |
| 109 | GET | `/hr/templates/:id/versions` | hr | F-1 | Version chain for the group | 404 |
| 110 | GET | `/hr/templates/:id/download-url` | hr | F-1 | Signed GET (attachment) | 404 |
| 111 | GET | `/templates` | any | F-1 | Published + employee-visible + type-gate-passed | — |
| 112 | GET | `/templates/:id/download-url` | any | F-1 | Signed GET for a visible template | 404 |
| 113 | GET | `/hr/documents/search` | hr | F-2 | Metadata search | — |
| 114 | GET | `/hr/documents/search.csv` | hr | F-2 | Search as CSV (+ ledger row) | — |
| 115 | GET | `/hr/reports/missing-mandatory` | hr | F-3 | Org-wide missing-mandatory roll-up | — |
| 116 | GET | `/hr/reports/missing-mandatory.csv` | hr | F-3 | Same as CSV (+ ledger row) | — |
| 117 | GET | `/hr/reports/expiring` | hr | F-3 | Expiring-in-N-days report with buckets | — |
| 118 | GET | `/hr/reports/expiring.csv` | hr | F-3 | Same as CSV (+ ledger row) | — |
| 119 | GET | `/hr/exports` | hr | F-3 | Export ledger list | — |
| 120 | GET | `/hr/exports/:id` | hr | F-3 | Export ledger detail | 404 |
| 121 | PATCH | `/hr/documents/:id/tags` | hr | F-2 | Replace a document's tag array | 404 |
| 122 | POST | `/hr/employees/:userId/offboard-documents` | hr | F-4 | Archive + waive + cancel (supports `dry_run`, `force`) | 403 |
| 123 | GET | `/hr/employees/:userId/exit-pack` | hr | F-4 | Exit pack manifest with short-TTL URLs | 403 |
| 124 | GET | `/hr/employees/:userId/exit-pack.csv` | hr | F-4 | Exit pack metadata CSV, **no URLs** (+ ledger row) | 403 |
| 125 | POST | `/hr/jobs/offboarding-archive/run` | hr | F-4 | Manual trigger for the offboarding cron | — |
| 126 | GET | `/me/documents/all` | any | F-5 | Composed four-section employee view | — |
| 127 | GET | `/hr/org-documents/:id/materialisation` | hr | F-6 | Materialisation progress | 404 |
| 128 | GET | `/attachments/:id/view-url` | any | F-8 | Audience-neutral signed view URL (owner / manager / HR) | 404 |
| 129 | POST | `/hr/jobs/publish-materialisation/run` | hr | F-6 | Manual trigger for the materialiser cron | — |

**Denial** column: `404` = the resource is `:id`-addressed, so scope failure is indistinguishable
from absence (P1 rule). `403` = `:userId`-addressed, so the caller is told they lack authority.
`—` = collection endpoints, which return an empty or scoped list rather than a denial.

### 11.2 Modified existing endpoints

| # | Change | Breaking? |
|---|---|---|
| #47 `POST /hr/org-documents/:id/publish` | May now return **`202`** with `{materialisation_state:'pending', recipient_target_count, poll}` when the audience exceeds setting #79. `200` below the threshold is unchanged. | Behavioural but **inert by default** — the default threshold equals today's hard limit, so no existing org can reach the new branch until it lowers #79. Change record required (§26.2). |
| #77 `GET /hr/org-documents/compliance.csv` | Now writes a `document_export_jobs` row. Response bytes unchanged. | No. Internal only; no change record needed for the response, but §28 D-1 mentions it. |
| #43/#44/#70 and the employee-document list/detail reads | Responses gain a `tags: []` array. | Additive; change record (§26.1). |
| `POST /api/v1/leaves` (+ on-behalf variants) | Accept an optional `document_id`. | Additive; change record required (§26.2, parent D-17). |

### 11.3 Standard response envelope

Unchanged from P1–P4: `sendSuccess(res, status, message, data)` / `AppError(status, message, code,
details)`. CSV endpoints bypass the envelope and emit raw bytes with `buildDownloadHeaders`, exactly
as #77 does today.

### 11.4 Route declaration and mount order — mandatory

Express matches in mount order, and `document_hr.routes.js` is mounted **first** at
`/api/v1/documents/hr` and already owns `GET /documents/:id` (P-26). Therefore:

| Route | Must be declared in | Reason |
|---|---|---|
| #113 `/documents/search`, #114 `/documents/search.csv` | **`document_hr.routes.js`, above the `/documents/:id` declaration** | A router mounted later would never be reached; a declaration below `:id` would be shadowed and `search` would be parsed as a document id → `404`. |
| #121 `/documents/:id/tags` | `document_hr.routes.js` | Same file as its sibling `:id` routes. |
| #127 `/org-documents/:id/materialisation` | `document_org_hr.routes.js` | Same file as the other `org-documents/:id/*` routes. |
| #99–#110 `/templates*` | new `document_template_hr.routes.js` | No collision — no existing HR route begins with `templates`. |
| #115–#120 `/reports/*`, `/exports*` | new `document_report_hr.routes.js` | No collision. |
| #122–#125 `/employees/:userId/*`, `/jobs/offboarding-archive/run` | new `document_offboarding_hr.routes.js` | `document_request_hr.routes.js` already owns `/jobs/*/run` paths but with **distinct** job names; distinct static segments do not collide. |
| #129 `/jobs/publish-materialisation/run` | `document_offboarding_hr.routes.js` (with #125) | Keeps the two new job triggers in one file. |
| #111–#112 `/templates*` (self) | new `document_template_self.routes.js` | **Verified:** `document_self.routes.js` declares no bare `/:id` — every self route is prefixed `/me/documents`. No collision, so mount order is immaterial for these two. |
| #126 `/me/documents/all` | **`document_self.routes.js`, declared above the `/me/documents/:id` line (currently line 19)** | **Verified & corrected (B-15a).** An earlier draft put #126 in a separate `document_composer_self.routes.js` mounted before `selfRoutes`. That works, but its correctness then depends on the *mount* order in `document.index.js`, which is invisible from the route file itself. `document_self.routes.js:13-14` already establishes the safer convention — `/me/documents/types` is declared **above** `/me/documents/:id` with the comment *“Static-prefix segment `types` declared BEFORE `:id` to avoid collision.”* Declare `/me/documents/all` on the line beneath it. `document_composer_self.routes.js` is therefore **not created**; the composer controller/service still are. |
| #128 `/attachments/:id/view-url` | new `document_attachment.routes.js` | No collision — no existing router owns a static `attachments` segment. Mount order immaterial. |

`document.index.js` mount order after P5:

```js
app.use('/api/v1/documents/hr', hrRoutes)               // now also #113/#114/#121
app.use('/api/v1/documents/hr', orgHrRoutes)            // now also #127
app.use('/api/v1/documents/hr', requestHrRoutes)
app.use('/api/v1/documents/hr', templateHrRoutes)       // NEW  #99–#110
app.use('/api/v1/documents/hr', reportHrRoutes)         // NEW  #115–#120
app.use('/api/v1/documents/hr', offboardingHrRoutes)    // NEW  #122–#125, #129
app.use('/api/v1/documents/manager', managerRoutes)
app.use('/api/v1/documents/manager', orgManagerRoutes)
app.use('/api/v1/documents/manager', requestManagerRoutes)
app.use('/api/v1/documents', templateSelfRoutes)        // NEW  #111–#112
app.use('/api/v1/documents', attachmentRoutes)          // NEW  #128
app.use('/api/v1/documents', selfRoutes)                // MODIFIED in place: #126 added above `/me/documents/:id`
app.use('/api/v1/documents', orgSelfRoutes)
app.use('/api/v1/documents', requestSelfRoutes)
```

A route-collision test (T-52) asserts that #113, #126 and #111 resolve to their own handlers and not
to a `:id` handler. This is cheap and it catches the one class of bug that silently returns `404`
for a correctly-implemented feature.

**Rule of thumb for this module, stated once.** Prefer *declaration* order inside the router that
already owns the conflicting `:id` to *mount* order across routers. Declaration order is local and
visible to the next reader of that file; mount order is action-at-a-distance in `document.index.js`
and survives exactly until someone reorders it. Use a separate router only when the new path shares
no prefix with any existing `:id` route (#99–#110, #115–#120, #122–#125, #128, #111–#112).

---

## 12. Business Rules

| ID | Rule | Enforced where |
|---|---|---|
| **R-1** | A template's file must be confirmed (`s3`) or referenced (`reference`) before it can be published. | `document_template_rules.isPublishable` + service guard |
| **R-2** | Template transitions are `draft→published→archived` only. No un-publish, no un-archive. | `canTransition` |
| **R-3** | A draft may be soft-deleted; a published or archived template may not. | Service guard, `422 TEMPLATE_NOT_DELETABLE` |
| **R-4** | At most one `published` template per `(org_id, template_group_id)`. | Partial unique index `document_templates_org_published_uq` **and** the advisory lock |
| **R-5** | Publishing version N archives version N−1 in the same transaction. | `document_template.service.publish` |
| **R-6** | A type-gated template is visible to a non-HR caller only if the gating type is active and grants that audience `view`. | `resolveTemplateVisibility` |
| **R-7** | Templates carry no employee PII, therefore no hierarchy scoping applies to template reads. | Documented divergence (§13.3) |
| **R-8** | Search requires at least one of `q` / `type_id` / `user_id` / `tags`. | `document_report.validator` |
| **R-9** | Search never returns `document_number` (masked or otherwise), `reference_url` or `storage_key`. | Repository projection + T-09 |
| **R-10** | Tags: ≤ 10 per document, ≤ 40 chars each, lower-case, `^[a-z0-9][a-z0-9 _-]*$`, de-duplicated, **HR-writable only**. | Validator + `document_report.utils` |
| **R-11** | Every CSV export writes exactly one ledger row: `started` before the first byte, then `completed` or `failed`. | `document_export.service` + the controller helper |
| **R-12** | An export whose row count exceeds `EXPORT_MAX_ROWS` is refused **before** any ledger row is written. | `document_report.service` count-first guard |
| **R-13** | If `document_export.service.begin` fails, the export does not happen. | Controller: `begin` is awaited and unguarded |
| **R-14** | The ledger's `filters` holds ids, codes and bounds only — never names, never `document_number`, never row data. | `normaliseSearchFilters` output is what is stored; T-16 asserts structurally |
| **R-15** | The export ledger is append-then-finalise. No HTTP surface edits or deletes a row; the table is not paranoid. | Model + route inventory |
| **R-16** | Offboarding archives only `pending_verification`, `available`, `expired`. | `ARCHIVABLE_STATUSES` |
| **R-17** | Offboarding waives recipients in `pending` **and `viewed`**; `acknowledged`, `signed` and already-`waived` rows are untouched. There is no `overdue` recipient status (B-1). | `bulkWaiveForUser` `WHERE status IN ('pending','viewed')` |
| **R-17b** | Offboarding moves the user's `pending`/`failed` notifications to `skipped`; `sending` rows are left to the dispatcher (B-10). | `skipPendingForUser` |
| **R-18** | Offboarding **never deletes** a document, a recipient, an acknowledgement, a signature or an audit row. | Repository methods are `UPDATE`-only; T-27 asserts the service imports no evidence repository |
| **R-19** | Offboarding is idempotent; a repeat run writes no audit rows. | Advisory lock + the non-zero-count audit guard |
| **R-20** | Offboarding requires an exit record with `last_working_day <= today`, or an inactive membership — unless `force=true`. | `resolveArchiveTrigger` + the endpoint's `force` flag |
| **R-21** | Exit-pack URLs live for `min(configured TTL, 900s)` and the CSV variant contains none. | `exitPack` + `toExitPackCsvRow` |
| **R-22** | Below setting #79 the publish path is unchanged; above it the document is published with `materialisation_state='pending'`; above `ORG_PUBLISH_SYNC_LIMIT` it is still refused. | `document_org.service.publish` |
| **R-23** | Materialisation always recomputes from the **frozen** audience snapshot, never from live criteria. | `materialisePending` |
| **R-24** | `materialisation_state='pending'` is only legal on a `published` document. | CHECK `org_documents_materialisation_chk` |
| **R-25** | On-join top-up computes `due_on` from the join date, not the publication date. | `topUpForUser` |
| **R-26** | Neither the join hook nor the EC-30 hook may fail its host operation. | Post-commit + swallowing try/catch |
| **R-27** | The composer issues no signed URL; it returns endpoint paths. | `document_composer.service` + T-29 |
| **R-28** | The composer never reads a payroll `storage_key` and never constructs a payroll object URL. | It calls payroll's service/repository reads only; T-31 |
| **R-29** | A section that fails degrades to `available:false`; the composed response is still `200`. | Per-section try/catch |
| **R-30** | A leave attachment must belong to the leave's subject and be `available` or `pending_verification`. | `resolveForLeaveAttachment` steps 3–4 |
| **R-31** | When both `document_id` and `document_url` are supplied, `document_id` wins. | `submitLeaveRequest` branch (EC-34) |
| **R-32** | A caller passing only `document_url` sees byte-identical behaviour to pre-P5. | The new branch is not entered; T-42 |
| **R-33** | #128 adds no authority logic; it delegates wholly to `documentReadService.viewUrl`. | Controller is a thin adapter; T-44 |
| **R-34** | No P5 surface returns `storage_key`, and no P5 audit or log line contains one. | T-51 + the extended `org_repository_projection.test.js` chokepoint + the source grep |
| **R-35** | All reporting and grouping uses `department_id`, never the free-text `department`. | Repository joins; T-11 |
| **R-36** | `admin` / `super-admin` receive no tenant document data on any P5 endpoint. | `authorize(['hr'])` excludes them; §24.4 sweep 9 |

---

## 13. Authorization & Security

### 13.1 Plane matrix for the new surface

| Surface | hr | manager | employee | admin / super-admin |
|---|:--:|:--:|:--:|:--:|
| Template administration (#99–#110) | full | — | — | — |
| Template read (#111, #112) | full | published + visible + type-gated | same as manager | — |
| Search & tags (#113, #114, #121) | full | — (O-7) | — | — |
| Reports & export ledger (#115–#120) | full | — | — | — |
| Offboarding & exit pack (#122–#125) | full | — (read-only via existing #79/#94/#95) | — | — |
| Composer (#126) | via their own `/me` | via their own `/me` | own only | — |
| Materialisation (#127, #129) | full | — | — | — |
| Attachment view-url (#128) | any document they may read | team documents per the P1 matrix | own only | — |

### 13.2 Why search and reporting are HR-only in Phase 5

A manager search would require intersecting every predicate with `getAccessibleUserIds`, then
re-screening each row for confidentiality, then suppressing counts that leak the existence of
hidden rows. The parent's manager scope (§2.2) asks for **team compliance visibility**, which
managers already have through #79 (Tier-A compliance), #94 (team checklist) and #95 (team requests).
Adding manager search now would be inventing surface. O-7 in §27 records the design so a later phase
can add it deliberately.

### 13.3 The one deliberate scoping divergence

Template reads are **not** hierarchy-scoped. Every employee in the org sees the same published,
visible, type-gate-passing set, because a template contains no employee data. This is stated
explicitly so that a reviewer does not read the absent `getAccessibleUserIds` call as an oversight.

### 13.4 Signed-URL discipline

| Surface | Disposition | TTL | Audited |
|---|---|---|---|
| Template download (#110, #112) | `attachment` always | `document_view_url_ttl_seconds` | `document_template.downloaded` |
| Exit pack (#123) | `attachment` | `min(configured, 900s)` | one `document.view_url_issued` per item **plus** one `exit_pack` ledger row |
| Attachment view (#128) | `inline` (`?disposition=attachment` allowed) | `document_view_url_ttl_seconds` | `document.view_url_issued` (by `viewUrl`, unchanged) |
| Composer (#126) | **issues none** | — | — |

Every URL is single-object and time-bounded; no P5 code path constructs a bucket-level or
prefix-level URL.

### 13.5 Data-minimisation rules for the new bulk surfaces

| Surface | Excluded |
|---|---|
| Search results | `document_number` (even masked), `reference_url`, `storage_key`, verifier notes |
| Missing-mandatory report | document ids and titles — it reports *absence*, so it names types and people only |
| Expiring report | `document_number`, `reference_url`, `storage_key` |
| Export ledger `filters` | any name, any free text, any `document_number`; ids, codes and bounds only |
| Exit pack CSV | signed URLs |
| Composer | `storage_key` and every payroll internal identifier beyond the payslip / FY id needed to build the path |

### 13.6 Threats addressed by P5, and where

| Threat | Control |
|---|---|
| IDOR on a template | `:id` + org scope + `resolveTemplateVisibility` ⇒ `404` |
| IDOR on an exit pack | `:userId` + `authorize(['hr'])` + org membership check ⇒ `403` |
| Cross-org search | Every predicate is AND-ed with `org_id`; T-08 |
| Confidentiality leak via search | `screenDocument` per row even on the HR plane |
| Confidentiality leak via #128 | The P1 matrix, unchanged — a manager denied a confidential type gets `404` |
| Attaching another employee's document to a leave | `DOCUMENT_NOT_OWNED_BY_SUBJECT` (F-8 step 3) |
| Signed URL from the exit pack shared outward | 15-minute ceiling + per-item audit + the ledger row |
| Content-type bypass on a template upload | `isAllowedContentType` + extension/MIME agreement + HeadObject verification of the real object |
| Exfiltration by repeated export | Every export is ledgered with actor, IP, request id, filters and row count |
| Tag-based enumeration of confidential documents | Tags are HR-written and only HR can search them |

---

## 14. Document Lifecycle & State Transitions

### 14.1 Template lifecycle (new)

```
            create                publish (file present)        archive (manual retire)
   (none) ──────────▶ draft ─────────────────────────▶ published ────────▶ archived
                       │                                   │
                       │ delete (soft)                     ├─ replace ──▶ new draft (v+1, same group)
                       ▼                                   │
                    deleted                                └─ successor published ──▶ superseded
```

`superseded` and `archived` are both terminal and both invisible to non-HR callers. They are kept
distinct so a version chain reads correctly: `superseded` means "a newer version exists",
`archived` means "this form was retired and has no successor" (**B-5**).

| From | To | Trigger | Guard |
|---|---|---|---|
| — | `draft` | #99 create, #104 replace | — |
| `draft` | `published` | #103 | `isPublishable`; archives the prior published version atomically |
| `draft` | (soft-deleted) | #106 | draft only |
| `published` | `superseded` | Automatically, when its successor publishes | Same transaction as the successor's promotion, and **before** it (B-2) |
| `published` | `archived` | #105, manual retirement | Only when no successor is being published |
| `superseded` / `archived` | — | terminal | No un-archive; publish a new version instead |

### 14.2 `employee_documents` — one new **entry** into an existing state

`archived` is already a legal status (P1) and P5 is the first code to write it, from
`pending_verification`, `available` or `expired`. No enum change. `archived` is terminal from the
offboarding path: nothing in P5 moves a document out of it.

### 14.3 Rehire

Archived documents stay archived. A rehired employee re-uploads, which produces a fresh document
with a fresh verification trail. Un-archiving would resurrect a document verified against a prior
employment and is not offered.

### 14.4 `org_documents` — a new orthogonal axis

`materialisation_state` is **not** part of the publication lifecycle; it is a property of a
`published` document.

```
not_required ──(publish above the threshold)──▶ pending ──(worker completes)──▶ complete
                                                   │
                                                   └──(document archived/unpublished)──▶ complete
                                                       + audit org_document.materialisation_halted
```

Existing rows and every synchronous publish are `not_required` forever.

### 14.5 Recipient lifecycle — no new states

`pending → acknowledged` and `pending|overdue → waived` already exist (P2). Offboarding drives the
existing `waived` transition with a system reason. No enum change.

### 14.6 Request lifecycle — no new states

P5 drives the existing `cancelled` transition in bulk. No enum change.

---

## 15. Workflows

### 15.1 Template publication

```
HR → #99 create draft
HR → #101 file-url      → presigned PUT (draft only, TTL = document_upload_url_ttl_seconds)
Client → PUT directly to S3
HR → #102 confirm       → HeadObject → size/content-type verified → confirmed_at set
HR → #103 publish       → BEGIN
                            advisory lock on template_group_id
                            SELECT current published FOR UPDATE
                            current.status='superseded', superseded_at   ← FIRST  (B-2)
                            new.status='published', published_by/at      ← SECOND
                            audit document_template.published (+ .superseded for the predecessor)
                          COMMIT
Employee → #111 list → #112 download-url → signed GET (attachment) → download_count++ (detached)
```

### 15.2 A CSV export

```
HR → #116
  validate → normalise filters
  count rows
    > EXPORT_MAX_ROWS → 422 EXPORT_TOO_LARGE, no ledger row, stop
  exportService.begin(...)                       → COMMITTED, status='started'
  build the report (bounded by the count)
  build the CSV via createCsvWriter
  res.set(buildDownloadHeaders({format:'csv', fileName, byteLength})); res.send(buffer)
  exportService.complete(id, {rowCount, byteCount})        (detached, swallowing)
  ─ on any throw between begin and send ─
  exportService.fail(id, err.message)                      (detached, swallowing)
```

### 15.3 Offboarding

```
Trigger A: HR → #122 (optionally ?dry_run=true / ?force=true)
Trigger B: cron 02:10 IST → findLiveForOrg(last_working_day <= today, status='completed')
Trigger C: organization.softDeleteEmployee → post-commit hook, trigger='membership_removed'
                            │
                            ▼
          document_offboarding.service.archiveForUser
                            │
            BEGIN ── advisory lock (org, user)
              resolveArchiveTrigger → skip if not offboarding
              bulkArchiveForUser      (mode='archive' only)
              bulkWaiveForUser        (pending|overdue → waived, system reason)
              bulkCancelOpenForUser   (open requests → cancelled)
              audit ×3, only for non-zero counts
            COMMIT
                            │
HR → #123 exit-pack → gather items → per item viewUrl (≤15 min, attachment)
                    → one exit_pack ledger row → manifest
HR → #124 exit-pack.csv → same items, metadata only, no URLs, ledger row
```

### 15.4 Large publish

```
HR → #47 publish
  resolve audience → target
  target <= #79           → 200, all recipients created in-transaction   (unchanged)
  target <= 20000         → BEGIN publish + snapshot + state='pending'
                                  + first batch (5000)
                            COMMIT → 202 { poll: #127 }
  target > 20000          → 422 RECIPIENT_SET_TOO_LARGE                  (unchanged)

cron every 5 min → runPublishMaterialisation
  per org: findPendingMaterialisation(limit 20)
    per doc: materialisePending(batch 5000)
      advisory lock → re-read FOR UPDATE → recompute from the FROZEN snapshot
      → insert the missing difference → when none remain: state='complete', materialised_at
HR → #127 → { materialisation_state, recipients_created, recipient_target_count, remaining }
```

### 15.5 Leave with a document attachment

```
Employee → POST /api/v1/leaves { leave_type_id, from, to, document_id }
  submitLeaveRequest
    resolveForLeaveAttachment(document_id)
       not found / screened out         → 404 DOCUMENT_NOT_FOUND
       belongs to someone else          → 422 DOCUMENT_NOT_OWNED_BY_SUBJECT
       status not attachable            → 422 DOCUMENT_NOT_ATTACHABLE
       ok → attachment_path = /api/v1/documents/attachments/<id>/view-url
    _assertDocumentRequirement(..., documentUrl: attachment_path)    ← unchanged
    persist document_url = attachment_path
Approver → GET the leave → sees document_url → GET #128 → signed URL (audited) → opens the file
```

### 15.6 On-join top-up

```
Invitee → POST /api/v1/organizations/invitations/accept
  membership transaction COMMITs
  invitationRepository.consume(token)
  try { documentRecipientService.topUpForUser({orgId, userId}) } catch { log warn }
  return
(daily P4 cron remains the backstop for profile data filled in later)
```

---

## 16. Transactions & Concurrency

### 16.1 Transaction boundaries

| Operation | Boundary | Rationale |
|---|---|---|
| Template create / update / archive / delete | One unmanaged txn; audit inside | Single-row + audit atomicity |
| Template confirm | Txn for the DB write; **HeadObject outside it** | Never hold a DB txn across a network call (the P1/P2 rule) |
| Template publish | One txn: advisory lock → `FOR UPDATE` current → publish new → archive old → 2 audit rows | R-4/R-5 must be atomic |
| Template replace | One txn: advisory lock → read current → insert the next draft | Version numbering must be serialised |
| Search / reports (read) | **No transaction** | Read-only; a txn would only pin a snapshot for no benefit |
| `exportService.begin` | Its **own** txn, committed before the read starts | The ledger must survive a crash in the read (R-13) |
| `exportService.complete` / `fail` | Own txn, detached, swallowing | Must not turn a delivered export into a `500` |
| Offboarding `archiveForUser` | **One** txn for archive + waive + cancel + audits | The parent's "all or nothing" for an exit |
| Exit pack | No txn (reads + signing) | No writes except the ledger, which owns its own |
| Publish (sync path) | Unchanged P2 txn | Do not disturb |
| Publish (async path) | One txn: publish + snapshot + state + first batch | Either the document is published and pending, or nothing happened |
| `materialisePending` | One txn per batch | A crash costs at most one batch; add-only makes the redo safe |
| `topUpForUser` | One txn for the filter + insert + audit | Prevents a duplicate row between the check and the insert |
| Leave attachment resolution | Read **before** the leave transaction opens | Never hold the leave txn across a cross-module read |
| EC-30 hook | **After** the organization txn commits | A document failure must not block employee removal |

### 16.2 Race conditions and their defences

| ID | Race | Defence |
|---|---|---|
| **C-1** | Two HR users publish two drafts of the same template group | `pg_advisory_xact_lock(hashtext('document_template_group:'||group_id))` + `SELECT … FOR UPDATE`; the partial unique index is the second, independent guarantee |
| **C-2** | Replace and publish interleave on the same group | Same lock; version numbers are assigned under it |
| **C-3** | Two workers materialise the same document | `pg_advisory_xact_lock(hashtext('org_document_group:'||group_id))` (the existing P2 key) + a `FOR UPDATE` state re-read |
| **C-4** | The join hook and the daily top-up cron run for the same user | `pg_advisory_xact_lock(hashtext('document_recipient_topup:'||org||':'||user))` + the existing-recipient filter + the `(org_document_id, user_id)` unique constraint |
| **C-5** | Offboarding endpoint and offboarding cron hit the same user | `pg_advisory_xact_lock(hashtext('document_offboarding:'||org||':'||user))`; the loser finds nothing to do |
| **C-6** | A document is uploaded while offboarding is archiving | The `UPDATE … WHERE status IN (...)` either catches it or does not. A document created after the archive stays `available` and the next cron run archives it. Eventual, and correct. |
| **C-7** | A recipient acknowledges while offboarding is waiving | `bulkWaiveForUser` filters `status IN ('pending','overdue')`; an acknowledgement that commits first wins and is never overwritten. Acknowledgement is the stronger fact. |
| **C-8** | Two HR users PATCH tags on the same document | Last-write-wins; both audited. No lock — tags are not an invariant. |
| **C-9** | A template is archived between the list read and the download-url call | The download service re-reads and re-screens ⇒ `404`. Never trust the list's snapshot. |
| **C-10** | An export runs while the underlying rows change | Accepted skew; `generated_at` in the response and `started_at` in the ledger bound it. |
| **C-11** | A document is deleted between the exit pack's gather and its `viewUrl` call | That item returns `url: null, url_error:'UNAVAILABLE'`; the pack still renders. |
| **C-12** | A leave is submitted while its attachment is being deleted | Resolution happens before the leave txn; if the document survives to resolution the leave is created and #128 later returns `404`. No corruption. |

### 16.3 Advisory-lock key inventory (P5 additions)

| Key expression | Used by |
|---|---|
| `hashtext('document_template_group:' \|\| template_group_id)` | template publish, replace, archive |
| `hashtext('document_offboarding:' \|\| org_id \|\| ':' \|\| user_id)` | `archiveForUser` |
| `hashtext('document_recipient_topup:' \|\| org_id \|\| ':' \|\| user_id)` | `topUpForUser` |
| `hashtext('org_document_group:' \|\| group_id)` (**existing P2 key, reused**) | `materialisePending` |

All are `pg_advisory_xact_lock` — transaction-scoped, released on commit or rollback, never
manually unlocked. Acquired **before** any row lock in the same transaction, which is the module's
existing rule and what keeps the lock order global and deadlock-free.

---

## 17. Idempotency & Retry

### 17.1 Naturally idempotent operations

| Operation | Key | Repeat behaviour |
|---|---|---|
| Template `confirm` | `confirmed_at IS NOT NULL` | Returns the same payload, writes nothing, audits nothing |
| Template `publish` | `status <> 'draft'` | `422 TEMPLATE_NOT_DRAFT` |
| Template `archive` | `status = 'archived'` | `422 TEMPLATE_NOT_PUBLISHED` |
| `archiveForUser` | Status filters | Zero counts, no audit rows, `200` |
| `materialisePending` | `materialisation_state` + the existing-recipient set | `{state:'complete', added:0}` |
| `topUpForUser` | The existing-recipient filter + the unique constraint | `{added_count: 0}` |
| Tag replace | Whole-array replace | Same array ⇒ same state (an audit row is still written; a PATCH that was received is a fact) |

### 17.2 Retry-safe by construction

- **Presign is free of side effects** — re-calling #101 issues a new URL for the **same** key (keys are derived from ids, not random), so a retried upload overwrites rather than orphaning.
- **Materialisation batches are add-only** — a redone batch inserts nothing twice.
- **Cron runs are convergent** — `runOffboardingArchive` and `runPublishMaterialisation` can be invoked at any frequency, and the manual triggers (#125, #129) exist so an operator can force convergence without waiting for the schedule.
- **`runStartupCatchUp`** gains both new jobs, so a restart mid-work self-heals.

### 17.3 Deliberately **not** idempotent

**Exports.** A repeated export produces a second CSV and a second ledger row. This is correct: the
ledger records *egress events*, and two people downloading the same report twice is two disclosures.
De-duplicating would make the ledger lie. Stated explicitly so nobody "fixes" it later.

### 17.4 No `Idempotency-Key` header

The module has never used one and P5 does not introduce one. Every state-changing P5 operation is
either naturally idempotent (17.1) or deliberately not (17.3). Adding a header mechanism for a
problem that does not exist is the kind of speculative infrastructure this plan avoids.

---

## 18. Error Handling & Failure Recovery

### 18.1 New error codes

| Code | HTTP | Raised by |
|---|:--:|---|
| `TEMPLATE_NOT_FOUND` | 404 | Any `:id` template route: absent, other org, or screened out |
| `TEMPLATE_NOT_DRAFT` | 422 | file-url / confirm / publish / delete on a non-draft |
| `TEMPLATE_NOT_PUBLISHED` | 422 | replace / archive on a non-published template |
| `TEMPLATE_FILE_MISSING` | 422 | Publish with no confirmed file and no `reference_url` |
| `TEMPLATE_FILE_NOT_UPLOADED` | 422 | HeadObject 404 during confirm |
| `TEMPLATE_NOT_DELETABLE` | 422 | Delete on a published or archived template |
| `TEMPLATE_PUBLISH_CONFLICT` | 409 | Unique-violation backstop on concurrent publish |
| `SEARCH_FILTER_REQUIRED` | 400 | Search with no filter |
| `SEARCH_QUERY_TOO_SHORT` | 400 | `q` under 2 chars |
| `PAGINATION_TOO_DEEP` | 422 | `offset + limit > 10000` |
| `INVALID_TAG` | 400 | Tag fails the pattern or the length bound |
| `TOO_MANY_TAGS` | 400 | More than 10 tags |
| `EXPORT_TOO_LARGE` | 422 | Row count over the cap (**reuses P3's code** — one code, one meaning) |
| `EXPORT_NOT_FOUND` | 404 | #120 with an unknown or other-org id |
| `REPORT_HORIZON_TOO_LARGE` | 422 | `within_days > 365` |
| `NOT_OFFBOARDING` | 422 | #122 for an active employee with no exit record and no `force` |
| `EXIT_DATE_IN_FUTURE` | 422 | Exit exists but `last_working_day > today` and no `force` |
| `INVALID_SECTION` | 400 | Unknown composer section name |
| `DOCUMENT_NOT_OWNED_BY_SUBJECT` | 422 | Leave attachment belonging to another employee |
| `DOCUMENT_NOT_ATTACHABLE` | 422 | Leave attachment in a non-attachable status |

**Reused unchanged:** `DOCUMENT_NOT_FOUND`, `FORBIDDEN`, `STORAGE_NOT_CONFIGURED`, `FILE_TOO_LARGE`,
`UNSUPPORTED_CONTENT_TYPE`, `DOCUMENT_TYPE_NOT_FOUND`, `RECIPIENT_SET_TOO_LARGE`,
`VALIDATION_ERROR`.

### 18.2 Partial-failure matrix

| Scenario | State left behind | Recovery |
|---|---|---|
| Template presigned, never uploaded | Unconfirmed draft, no object | HR deletes the draft. Not swept (§19.4). |
| Template uploaded, never confirmed | Object exists, `confirmed_at IS NULL` | Re-confirm, or delete the draft; the object is then orphaned and the operator's bucket lifecycle rule reclaims it (§19.4). |
| Publish txn fails after archiving the predecessor | Nothing — one transaction, full rollback | Retry |
| Export crashes mid-stream | Ledger row `failed`, partial bytes delivered | The client re-exports; both attempts are in the ledger |
| `complete` fails after a successful send | Row stuck `started` | §29 alert at 15 minutes; the operator reconciles from the audit log |
| Offboarding txn fails at step 3 | Nothing — full rollback | Cron retries tomorrow, or HR retries #122 |
| EC-30 hook fails | Employee soft-deleted, documents untouched | The daily cron's `membership_removed` branch catches it |
| Materialisation crashes mid-batch | `pending`, partial recipients | The next tick redoes the batch; add-only |
| Materialiser never converges | `pending` forever | §29 alert at 1 hour; #129 forces a run; HR can archive the document, which halts materialisation cleanly |
| Join hook fails | No recipients for the joiner | The P4 daily cron creates them within 24h |
| Payroll unavailable during compose | `payroll` section degraded | The user retries later; the other sections rendered |
| Leave attachment resolution fails | No leave created | Explicit `4xx`; the caller fixes the input or omits `document_id` |
| S3 down during an exit pack | Items carry `url_error` | Retry the pack; the manifest is regenerated from live data |

### 18.3 Observability

Structured logs at the existing levels, with `org_id`, `request_id` and the operation name:

| Event | Level | Fields |
|---|---|---|
| Export begun / completed / failed | info / info / error | `export_id, export_type, row_count, byte_count, duration_ms` |
| Offboarding completed | info | `user_id, trigger, archived, waived, cancelled, duration_ms` |
| Offboarding skipped | debug | `user_id, reason` |
| Materialisation batch | info | `document_id, added, remaining, duration_ms` |
| Materialisation halted | warn | `document_id, reason` |
| Join top-up | info (only when `added_count > 0`) | `user_id, added_count` |
| Join top-up failed | warn | `user_id, error` |
| EC-30 hook failed | warn | `user_id, error` |
| Composer section degraded | warn | `section, reason` |
| Leave attachment refused | info | `document_id, code` (**never the title**) |
| Slow report (> 3 s) | warn | `report, filters_hash, duration_ms` — the **hash**, not the filters, so a log line never carries a filter value |

No log line may contain `storage_key`, `document_number`, a signed URL, or a document title from a
denial path. The §24.4 sweep greps for the first three.

---

## 19. File Storage & DB↔Storage Consistency

### 19.1 The P5 key namespace

```
org/{orgId}/documents/employee/{userId}/{documentId}          (P1, unchanged)
org/{orgId}/documents/org/{orgDocumentGroupId}/{documentId}   (P2, unchanged)
org/{orgId}/documents/template/{templateGroupId}/{templateId} (P5, new)
```

Same 4-segment shape, same `shared.buildObjectKey` builder, so every existing traversal, NUL-byte
and separator rejection test applies to templates without modification.

### 19.2 Write ordering (unchanged discipline)

**DB row first, object second, confirmation third.** A row without an object is inert and
recoverable; an object without a row is invisible and unreferenced. P5 introduces no new ordering.

### 19.3 What P5 writes to storage

| Operation | Storage effect |
|---|---|
| Template create / update / publish / archive / delete | **None** except the presigned PUT the client performs |
| Search, all reports, all CSV exports | **None** — built in memory, streamed, never persisted |
| Offboarding archive | **None** — `UPDATE`s only; objects are untouched |
| Exit pack | **None** — GET URLs only |
| Materialisation | **None** |
| Composer | **None** |

**P5 deletes no object.** Object deletion stays entirely with P4's retention sweeper.

### 19.4 The template orphan gap — stated, not hidden

Abandoned template uploads and archived-template objects are **not** reclaimed by any automated
process. P4's sweeper is written against `employee_documents` and `org_documents`; teaching it a
third table is real work that nothing in the parent asks for, and a wrong sweeper deletes evidence.

Mitigations shipped in P5:
- Template keys share the `org/{orgId}/documents/` prefix, so a bucket lifecycle rule or an
  operator-run reconciliation can find them.
- §25.7 hands the operator a read-only reconciliation query (list objects under
  `documents/template/`, left-join `document_templates.storage_key`) to run before any cleanup.
- The completion report states the gap plainly.

Recorded as **O-11** in §27, which is also where P4's carried-over bucket↔DB reconciliation lands.
Volume makes this acceptable: templates are org-level forms numbering in the dozens, not per-employee
documents numbering in the tens of thousands.

### 19.5 The `storage_key` chokepoint after P5

Exactly five repository methods may select `storage_key`:

| Method | Sole caller |
|---|---|
| `employee_document.repository.findByIdForStorage` | `document_upload.service`, `document_read.service` |
| `org_document.repository.findByIdForStorage` | `document_org.service`, `document_org_read.service` |
| `document_template.repository.findByIdForStorage` | `document_template.service` **only** (new) |
| (P4 sweeper's storage projection) | `document_automation.service` |
| (P1 verification projection) | `document_verification.service` |

`org_repository_projection.test.js` — the P4 chokepoint test — is **extended** to assert the template addition, not rewritten. It keeps its own name; no P5 `T-` number is assigned to it.

---

## 20. Background Jobs, Events & Integrations

### 20.1 Cron inventory after P5 (7 jobs)

| File | Schedule (IST) | Delegates to | Phase |
|---|---|---|---|
| `document_expiry.cron.js` | `0 2 * * *` | `runExpiryFlip` | P4 |
| `document_reminder.cron.js` | `30 2 * * *` | `runReminders` | P4 |
| `document_notification_dispatch.cron.js` | `*/5 * * * *` | `runNotificationDispatch` | P4 |
| `document_retention_sweeper.cron.js` | `0 3 * * 0` | `runSweeper` | P4 |
| `document_recipient_topup.cron.js` | `0 1 * * *` | `runRecipientTopUp` | P4 |
| **`document_publish_materialiser.cron.js`** | `*/5 * * * *` | `runPublishMaterialisation` | **P5** |
| **`document_offboarding_archive.cron.js`** | `10 2 * * *` | `runOffboardingArchive` | **P5** |

Both new files follow the established pattern exactly: delegate-only body, `timezone:
'Asia/Kolkata'`, registered in `server.js` **inside the existing `os.platform() === 'linux'` guard**,
wrapped in try/catch so a throw cannot kill the process.

**Schedule reasoning.** Offboarding at 02:10 runs *after* the 02:00 expiry flip, so a document
expiring on the last working day is flipped to `expired` and then archived — not archived while
still `available` and left permanently mis-stated. The materialiser at `*/5` shares its cadence with
the notification dispatcher; they touch disjoint tables and the 20-document-per-org cap bounds the
work per tick.

### 20.2 Notifications — deliberately none

P5 adds **no** notification class:
- **Offboarding** — the employee is leaving; emailing them that their documents were archived is noise, and their mailbox may already be deactivated.
- **Waived recipients** — a waiver removes an obligation. Nobody needs telling that they no longer have to do something.
- **Materialisation complete** — HR polls #127 and already got a `202` telling them to.
- **Template published** — the parent does not ask for it, and an all-org email per form is exactly the kind of invented feature the task forbids.

This is a decision, not an omission, and it is recorded as such in the completion report.

### 20.3 Events and hooks

| Hook | Site | Contract |
|---|---|---|
| On-join top-up | `invitation.service.acceptInvitation`, post-commit | Lazy `require`, swallowing catch, cannot fail the invitation |
| EC-30 unwind | `organization.service.softDeleteEmployee`, post-commit | Lazy `require`, swallowing catch, cannot fail the delete |

No event bus is introduced. The module has none; adding one for two call sites would be
infrastructure in search of a problem.

### 20.4 Cross-module integrations

| Direction | Integration | Coupling |
|---|---|---|
| document → payroll | `employee_exit.repository` (F-4) | Read-only, via the repository (D-18); degrades if absent |
| document → payroll | `payslip_read.service`, `employee_tax_summary.repository` (F-5) | Read-only, entitlement-gated, degrades to `available:false` |
| document → payroll utils | `csv_writer`, `download_headers` | Pure utilities, already cross-imported by P3 |
| organization → document | Join hook (F-7), soft-delete hook (F-4) | Lazy `require`, swallowing |
| leave → document | `resolveForLeaveAttachment` (F-8) | **Blocking by design** (§10 F-8) |
| document → billing | `requireFeature('documents.access')`, `hasFeature('payroll.access')` | Existing middleware and service |

### 20.5 Startup catch-up

`runStartupCatchUp` gains `runPublishMaterialisation` and `runOffboardingArchive` after the existing
five, keeping the established order: expiry → reminders → top-up → **materialisation** →
**offboarding** → dispatch. Dispatch stays last so that notifications enqueued by the earlier jobs
go out in the same catch-up pass.

---

## 21. Org Settings

Three new keys, registry rows **#79–#81**, continuing the Document Module block that currently ends
at #78.

| # | Key | Type | Default | Cap / allowed | Owner | Effect |
|---|---|---|---|---|---|---|
| 79 | `document_publish_sync_threshold` | integer | `20000` | `SETTINGS_CAPS` min 100, max 20000 | F-6 | At or below ⇒ synchronous publish (`200`). Above ⇒ published + `202` + background materialisation. The max is the code ceiling `ORG_PUBLISH_SYNC_LIMIT`: an org may be more conservative, never less. |
| 80 | `document_offboarding_archive_mode` | string(20) | `'archive'` | `archive` \| `retain` | F-4 | `archive` sets eligible documents to `archived` on exit; `retain` leaves them in place. **Waiving and request cancellation happen in both modes** — they are compliance hygiene, not archival policy. |
| 81 | `document_offboarding_exit_pack_scope` | string(20) | `'all'` | `all` \| `org_issued` \| `employee_owned` | F-4 | Default contents of #123/#124; overridable per request via `?scope=`. |

**Defaults are chosen so that enabling P5 changes nothing.** #79's default equals today's effective
hard limit, so no existing org can reach the new `202` branch until it deliberately lowers the
threshold; #80 and #81 only matter once someone calls an offboarding endpoint that did not exist
before.

Implementation:
- `document_defaults.DOCUMENT_SETTINGS_DEFAULTS` — add the three keys with these values, matching the migration defaults exactly.
- `document_defaults.SETTINGS_CAPS` — add `document_publish_sync_threshold: { min: 100, max: 20000 }`.
- `document_settings.service.MUTABLE_FIELDS` — **21 → 24**.
- Validator: #79 integer within the caps; #80/#81 `Joi.string().valid(...)` against the frozen constants.
- `public/md_settings/org_settings_registry.md` — append rows 79–81 to the Document Module section (§28 D-2).

**Not added as settings, and why:**

| Candidate | Why not |
|---|---|
| Template retention period | Templates are org forms, not employee records; the parent asks for no template retention and an accidental purge of a live form is a worse failure than disk cost. |
| Search result cap / export row cap | `SEARCH_MAX_LIMIT` and `EXPORT_MAX_ROWS` are protective bounds on a shared database. An org-tunable bound is an org-tunable outage. |
| Exit-pack URL TTL | Already derived as `min(document_view_url_ttl_seconds, 900)` — it reuses an existing setting and applies a hard ceiling. |
| Leave-bridge enable flag | K-7: D-17's "opt-in" is per-caller (the optional field), not per-org. |
| Materialisation batch size / cadence | Operational tuning, not org policy. Constants in `document_defaults`. |

---

## 22. Edge-Case Discharge Register (EC-1 … EC-36)

Every row of the parent's §10 register, with its discharge status **after** P5. "Phase" is the phase
whose code discharges it. A row is only marked discharged if a named test exists or is written in P5.

| EC | Summary | Phase | Status after P5 | Test |
|---|---|:--:|---|---|
| EC-1 | Presigned upload never completed → inert row, swept | 1 / 4 | Discharged (P1 inert + P4 sweeper) | existing P4 sweeper tests |
| EC-2 | Declared PDF, uploads SVG → HeadObject mismatch → `422` | 1 | Discharged; **re-asserted for templates** | T-04 |
| EC-3 | `file_name` with `../`, NUL, CRLF, quotes | 1 | Discharged; re-asserted for templates | T-04 |
| EC-4 | File over the type limit | 1 | Discharged; re-asserted for templates | T-04 |
| EC-5 | Concurrent confirms | 1 | Discharged; template confirm is idempotent on `confirmed_at` | T-03 |
| EC-6 | Concurrent replaces → exactly one v2 | 1 | Discharged; **template analogue added** | T-05 |
| EC-7 | Employee deletes a verified statutory document → `403` | 1 | Discharged (P1) | existing |
| EC-8 | Manager fetches a confidential document → `404` | 1 | Discharged; **re-asserted across all P5 surfaces** | T-47 |
| EC-9 | `:id` → `404`, `:userId` → `403`, scope before existence | 1 | Discharged; re-asserted for #122–#124 and #128 | T-46 |
| EC-10 | Cross-org id denied identically | 1 | Discharged; re-asserted for all 31 new endpoints | T-45 |
| EC-11 | Type deactivated with live documents / open requests | 1 | Discharged. **Templates deliberately excluded from the guard** (§10 F-1) | T-06 |
| EC-12 | Policy v2 → v1 acknowledgments do not satisfy it | 3 | Discharged (P3) | existing |
| EC-13 | Employee joins after publication | 2 / 4 / **5** | **Discharged in P5** — the join hook completes the cron | T-37, T-38 |
| EC-14 | Exiting employee's unacknowledged policies → `waived`, never deleted | **5** | **Discharged in P5** | T-21, T-27 |
| EC-15 | Targeting resolves to zero recipients → publish succeeds with a warning | 2 | Discharged; the async path preserves it (`target = 0` ⇒ sync path) | T-33 |
| EC-16 | Publish to 5 000 → batched; above the threshold `202` + worker | 2 / **5** | **Discharged in P5** | T-33, T-34, T-35 |
| EC-17 | Expiry cron misses a day → read paths derive expiry | 4 | Discharged; the expiring **report** uses the same derivation | T-17 |
| EC-18 | Same-day double reminder → partial unique index | 4 | Discharged (P4) | existing |
| EC-19 | Tier-B proposal, subject stops reporting before approval | 1 / 2 | Discharged (P1/P2) | existing |
| EC-20 | `manager_direct_document_authority` ON | 1 | Discharged (P1) | existing |
| EC-21 | S3 outage → `503`, no state change | 1 | Discharged; re-asserted for templates and the exit pack | T-04, T-26 |
| EC-22 | Signed URL shared externally → short TTL, audited issuance | 1 | Discharged; **exit pack tightened to ≤ 900 s** | T-25 |
| EC-23 | `javascript:` / `data:` reference URL rejected | 1 | Discharged; re-asserted for template `reference_url` | T-02 |
| EC-24 | Duplicate upload for a single-instance type | 1 | Discharged (P1) | existing |
| EC-25 | `expires_on` already past at upload | 1 / 4 | Discharged; the expiring report buckets it as `expired` | T-17 |
| EC-26 | Scanning enabled mid-flight → grandfathered | 4 | Discharged (P4). No P5 change. | existing |
| EC-27 | `document_number` leaking into lists, logs, audits | 1 | Discharged; **extended to search, reports, exports, composer, exit pack** | T-09, T-16, T-50 |
| EC-28 | Retention purge excludes statutory documents | 4 | Discharged (P4) | existing |
| EC-29 | Object delete fails during purge → pointer kept | 4 | Discharged (P4) | existing |
| EC-30 | Employee soft-deleted holding open requests / pending acks | **5** | **Discharged in P5** | T-24 |
| EC-31 | SES down → retried by the drain cron | 4 | Discharged (P4). P5 adds no notification. | existing |
| EC-32 | Acknowledgment by a non-recipient → `403` before existence | 3 | Discharged (P3) | existing |
| EC-33 | External provider selected but unintegrated → `503` | 3 | Discharged (P3). V-1 keeps it that way. | existing |
| EC-34 | Leave passes both `document_url` and `document_id` | **5** | **Discharged in P5** — `document_id` wins (K-8), documented in the change record | T-41 |
| EC-35 | `allowed_content_types` changed after documents exist | 1 | Discharged (P1) | existing |
| EC-36 | Targeted department later deleted → frozen snapshot | 2 | Discharged; `materialisePending` recomputes from the **frozen** snapshot, preserving it | T-35 |

**Discharged by P5: EC-13, EC-14, EC-16, EC-30, EC-34.** Re-asserted on new surfaces: EC-2, EC-3,
EC-4, EC-5, EC-6, EC-8, EC-9, EC-10, EC-17, EC-21, EC-22, EC-23, EC-25, EC-27, EC-36. No row is
left undischarged.

---

## 23. Implementation Sequence

18 steps. Each states its verification. **Do not start a step until the previous step's
verification passes** — the sequencing exists because later steps depend on earlier contracts.

| Step | Work | Verify |
|---|---|---|
| **0** | **Operator gate.** Apply `00050`, then `00051`, then `00053`. Confirm `SELECT * FROM "SequelizeMeta" ORDER BY name DESC LIMIT 5`. | Operator confirms all three applied. **No P5 code is written against an unapplied schema.** |
| 1 | Write migration `00054` (§6). Static review only; **do not run it**. | `node -e "require('./src/infrastructure/postgres-sql/migrations/00054-...')"` parses; `up`/`down` are functions; a manual read confirms the `down` order is the exact inverse. |
| 2 | Models: 2 new, 3 ALTERed (§7). | `npx node --test tests/unit/document/models.test.js` (or the existing model-shape test) green; the auto-scan picks up both new models without an index edit. |
| 3 | Pure utils: `document_template_rules`, `document_report`, `document_offboarding`; extend `document_storage`, `document_authority`, `document_defaults` (§8). | T-01, T-07, T-19, T-20 written first and passing. Zero DB imports (asserted by a grep in the util test). |
| 4 | Repositories: `document_template`, `document_export_job`; additive methods on `employee_document`, `org_document`, `org_document_recipient`, `document_request` (§5). | Repository unit tests with a stubbed model layer; **every new method's `where` includes `org_id`** (asserted). |
| 5 | F-1 `document_template.service`. | T-01…T-06. |
| 6 | F-3 `document_export.service` (the ledger: `begin`/`complete`/`fail`/`list`/`get`). | T-12, T-13 — begin-before-bytes and the failure path. |
| 7 | F-2 search in `document_report.service`. | T-08…T-11. |
| 8 | F-6 `materialisePending` + the `publish` threshold branch. | T-32…T-36. Assert the sync body is unchanged **before** touching `publish`. |
| 9 | F-7 `topUpForUser`. | T-37, T-39. |
| 10 | F-3 reports (missing-mandatory, expiring) + their CSV builders. | T-14…T-18. |
| 11 | F-4 `document_offboarding.service` (archive + waive + cancel + exit pack). | T-19…T-27. |
| 12 | F-5 `document_composer.service` + the additive payroll repository read. | T-28…T-31, **T-53**. Payroll's own suite must stay green. |
| 13 | Controllers, validators, routes, `document.index.js` wiring (§11). | T-52 route-collision test; a manual route-table dump confirms #113/#126/#111 resolve to their own handlers. |
| 14 | Cron methods on `document_automation.service`, 2 cron files, `server.js` registration, `runStartupCatchUp` extension. | Cron-file tests assert delegate-only bodies and `Asia/Kolkata`; `server.js` diff shows both requires inside the linux guard. |
| 15 | F-8 leave bridge: `resolveForLeaveAttachment`, the `submitLeaveRequest` branch, the validator field, #128. | T-40…T-44 **plus the entire existing leave suite green**. |
| 16 | Settings #79–#81: defaults, caps, `MUTABLE_FIELDS` 21→24, validator. | Settings tests; a default-parity test asserts the model defaults equal `DOCUMENT_SETTINGS_DEFAULTS`. |
| 17 | F-9 hardening: D-2, D-3, D-4, D-6; the §22 sweep; the §24.4 security sweep. | T-45…T-52; full document suite green; full leave suite green; full payroll suite green. |
| 18 | Documentation (§28): 8 deliverables. | Each file exists on disk and is cross-checked against the shipped code, not against this plan. |

### 23.1 Parallelisation

Steps 5, 6, 7, 8 and 9 are independent once Step 4 lands and may be done in any order or in
parallel. Steps 10 and 11 need Step 6. Step 12 needs Step 5. Steps 13–18 are strictly sequential.

### 23.2 Suggested commit boundaries

One commit per step, each leaving the suite green. Step 15 gets its own commit so the cross-module
leave change can be reverted independently of everything else — it is the only change in P5 that can
break another module's happy path.

---

## 24. Testing Requirements

Runner: `node --test`. Location: `tests/unit/document/`. Style: the module's existing stubbed-layer
approach — no live DB, no live S3, no network.

### 24.1 Baseline

`npx node --test "tests/unit/document/**/*.test.js"` → **540 pass / 0 fail** (measured 2026-09-25).
**Re-run before the first P5 commit.** Target after P5: ≥ 640 with 0 failures, and the leave and
payroll suites unchanged and green.

### 24.2 New test files and cases

| File | Cases |
|---|---|
| `template_rules.utils.test.js` | **T-01** transitions, `isPublishable`, `resolveTemplateVisibility` across all audience × status × visibility × type-gate combinations |
| `template_service.test.js` | **T-02** create incl. `reference_url` scheme rejection; **T-03** confirm idempotency + HeadObject mismatch; **T-04** upload guards (content type, size, file name, S3 down); **T-05** publish archives the predecessor atomically + concurrent publish loses cleanly; **T-06** type-gated visibility and the deliberate absence of a template count in the type-deactivation guard |
| `report_search.test.js` | **T-07** `normaliseSearchFilters` bounds and date ordering; **T-08** cross-org isolation; **T-09** projection excludes `document_number`/`reference_url`/`storage_key` (field-by-field, not a substring grep); **T-10** no-filter and deep-paging refusals; **T-11** grouping uses `department_id` |
| `export_ledger.test.js` | **T-12** `begin` commits before the first byte; **T-13** `fail` on a mid-build throw; **T-14** `EXPORT_TOO_LARGE` writes **no** row; **T-15** `complete` failure is swallowed and the response still succeeds; **T-16** `filters` carries no PII |
| `report_compliance.test.js` | **T-17** expiring buckets agree with `document_expiry.utils`; **T-18** missing-mandatory totals equal the per-user #94 result for the same roster |
| `offboarding_utils.test.js` | **T-19** `resolveArchiveTrigger` across exit / no-exit / future-dated / inactive-membership; **T-20** `partitionPackItems` per scope |
| `offboarding_service.test.js` | **T-21** archive + waive + cancel in one transaction with the correct status filters; **T-22** idempotent repeat writes no audit rows; **T-23** `retain` mode archives nothing but still waives and cancels; **T-24** EC-30 hook failure does not fail the soft delete; **T-25** exit-pack TTL ≤ 900 s and each issuance is audited; **T-26** a failing `viewUrl` degrades one item, not the pack; **T-27** no evidence repository is imported and evidence row counts are unchanged |
| `composer_service.test.js` | **T-28** four sections, one uniform item shape; **T-29** no signer call during compose; **T-30** payroll degradation on both `NOT_ENTITLED` and a throw; **T-31** no payroll `storage_key` read and no payroll URL constructed |
| `publish_materialisation.test.js` | **T-32** `syncRecipients`' signature and `422` are unchanged; **T-33** sync path body is byte-identical to P2 (snapshot); **T-34** `202` shape and the first batch; **T-35** the worker converges to exactly `recipient_target_count` from the **frozen** snapshot, with a simulated crash between batches; **T-36** halting when the document is superseded or retired mid-materialisation |
| `recipient_topup_join.test.js` | **T-37** join hook creates the right rows with `due_on` from the join date; **T-38** hook + cron produce no duplicates; **T-39** hook failure does not fail `acceptInvitation` |
| `leave_attachment_bridge.test.js` | **T-40** happy path stores the attachment path and satisfies the leave-type requirement; **T-41** both fields ⇒ `document_id` wins; **T-42** `document_url`-only behaviour is unchanged; **T-43** foreign-owner and non-attachable refusals; **T-44** #128 for owner / manager / HR / stranger |
| `legacy_projection_snapshot.test.js` | **T-53** `/me/documents` and `/me/hr-documents` return exactly the P1/#70 field sets — a literal key-list snapshot that fails if F-5 or F-9 adds, removes or renames a field on either **existing** surface; **T-54** the employee-document `LIST_ATTRIBUTES`/`DETAIL_ATTRIBUTES` and `toClient` both exclude `reference_url` after D-3 (mirroring what `org_repository_projection.test.js` already asserts for the org plane) |
| `p5_security_sweep.test.js` | **T-45** cross-org on all 31 endpoints; **T-46** addressing-mode denial uniformity; **T-47** manager never sees a confidential document on any new surface; **T-48** `admin`/`super-admin` denied everywhere; **T-49** signed-URL scope and disposition; **T-50** `document_number` absent from every bulk surface; **T-51** no `storage_key` in responses, logs or audit rows; **T-52** route collisions (#113, #126, #111 reach their own handlers) |

### 24.3 Existing tests that must be updated, not replaced

| Test | Update |
|---|---|
| The P4 `storage_key` chokepoint test | **Extend** with `document_template.repository.findByIdForStorage` and its single permitted caller |
| The settings test | `MUTABLE_FIELDS` 21 → 24; default parity for the three new keys |
| Employee-document list/detail projection tests | Expect the additive `tags: []`; expect `reference_url` **gone** from both projections (D-3, §26.3), and add an assertion that `toClient` deletes it defensively |
| `document_org.service.publish` tests | Add the threshold branch; **keep every existing assertion** |
| `shared_allow_list_isolation.test.js` | Must stay green untouched — templates use the document allow-list, not the payroll one |
| The leave application suite | Must stay green untouched; T-40…T-43 are added alongside |

### 24.4 The security sweep (F-9)

Nine sweeps, implemented as `p5_security_sweep.test.js` plus two source greps run in CI:

```
grep -rn "storage_key" src/modules/document --include=*.js \
  | grep -v "repositories/" | grep -v "models/"        → only the permitted service call sites
grep -rn "document_number" src/modules/document/services/document_report.service.js \
        src/modules/document/services/document_composer.service.js \
        src/modules/document/services/document_offboarding.service.js   → no matches
```

### 24.5 Not tested, and why

| Area | Why |
|---|---|
| Real S3 round-trips | The module has never had integration tests; P5 does not introduce an infrastructure. The signer is stubbed, as everywhere else. |
| Real cron scheduling | Cron files are delegate-only; the delegate is tested directly, the schedule string is asserted as a string. |
| Performance | Requires a seeded database (§25.6). Explicitly **unmeasured** until the operator returns numbers. |
| Concurrency against a real Postgres | Advisory-lock and `FOR UPDATE` call sites are asserted structurally (the lock is acquired, with the right key, before the row lock). True concurrency needs a DB and belongs to the operator's smoke test (§25.4). |

---

## 25. Migration & Deployment

### 25.1 Hard prerequisite

`00050`, `00051` and `00053` are written but **UNRUN**. They must be applied, in that order, before
`00054`. `00051.down()` destroys evidence tables — **never roll back past it**.

### 25.2 Deployment order

```
1. Operator applies 00050 → 00051 → 00053            (P1–P4 debt)
2. Operator applies 00054                            (P5)
3. Deploy P5 code
4. Verify the 7 crons registered (linux hosts only)
5. Optional: lower setting #79 per org, AFTER §25.6's measurement
```

**Code must not be deployed before `00054`.** Unlike the P4 story, P5 code reads columns that do not
exist yet (`tags`, `materialisation_state`), so the schema genuinely has to land first. State this
in the hand-back.

### 25.3 Backfill

**None required.**
- `employee_documents.tags` — `NOT NULL DEFAULT '{}'`; every existing row reads as `[]`.
- `org_documents.materialisation_state` — `NOT NULL DEFAULT 'not_required'`; every existing published document is correctly described as not needing materialisation.
- The three settings columns — defaults match `DOCUMENT_SETTINGS_DEFAULTS`, so `getOrCreate` and the DDL agree.
- `document_templates` / `document_export_jobs` — start empty. The ledger has no history before P5 and the completion report says so, so nobody later reads an empty pre-P5 window as "no exports happened".

### 25.4 Post-deploy smoke checklist (operator)

1. `GET /hr/templates` → `200` with an empty list.
2. Create → file-url → confirm → publish → download a template; confirm the object lands under `documents/template/`.
3. `GET /hr/documents/search?q=ab` → `200`.
4. `GET /hr/reports/expiring?within_days=30` → `200`.
5. `GET /hr/reports/expiring.csv` → CSV downloads; `GET /hr/exports` shows one `completed` row.
6. `GET /me/documents/all` → four sections present; `payroll.available` matches the org's entitlement.
7. `POST /hr/employees/:id/offboard-documents?dry_run=true` on a real ex-employee → sane counts, nothing changed.
8. `SELECT COUNT(*) FROM org_documents WHERE materialisation_state = 'pending'` → `0`.
9. Confirm 7 cron jobs registered in the boot log.
10. Submit a leave with `document_id` → `document_url` is the attachment path; the approver can open it via #128.

### 25.5 Rollback

| Layer | Rollback |
|---|---|
| Code | Safe — reverting to P4 leaves the new columns unused. The one exception: an org that lowered #79 and has `pending` documents would stall, so **re-raise #79 to 20000 and let the materialiser drain before reverting code.** |
| `00054.down()` | **Destructive.** It drops `document_export_jobs` (the egress audit trail) and `document_templates` (HR-authored content). Treat it with `00051`-level caution: export both tables first. |
| Settings | Revert by value; no migration needed. |

### 25.6 Performance measurement — handed to the operator

The parent requires the §8 targets to be **measured**. There is no DB access here, so the procedure
is handed over and the results are recorded in the completion report when they return.

Seed: 5 000 employees, 50 000 employee documents, 300 org documents, 200 000 recipient rows.

| # | Statement | §8 target |
|---|---|---|
| 1 | `EXPLAIN (ANALYZE, BUFFERS)` the search query with `q` + `type_id` | < 500 ms |
| 2 | Same with a `tags &&` predicate (confirm the GIN index is chosen) | < 500 ms |
| 3 | The expiring report at `within_days=90` (confirm the partial index is chosen) | < 1 s |
| 4 | The missing-mandatory roll-up over 5 000 employees | < 10 s |
| 5 | `findPendingMaterialisation` (confirm the partial index; it should be near-instant when empty) | < 50 ms |
| 6 | One materialisation batch of 5 000 inserts | < 5 s |
| 7 | Offboarding for an employee with 200 documents | < 2 s |

**Setting #79 is then chosen as the largest audience whose synchronous materialisation completes
within the API timeout budget, rounded down.** Until statement 6 has a number, #79 stays at its
default and the completion report says "unmeasured".

### 25.7 Storage reconciliation — handed to the operator

Read-only, run before any cleanup:
```
list s3://<bucket>/org/*/documents/template/**
LEFT JOIN document_templates ON storage_key
→ objects with no row are orphans (abandoned or archived-template uploads)
```
Do not delete from this list automatically. §19.4 / O-11.

---

## 26. Backward Compatibility

### 26.1 Additive, non-breaking

| Change | Impact |
|---|---|
| 31 new endpoints | None on existing clients |
| `tags: []` on employee-document list and detail responses | Additive field; clients ignoring unknown keys are unaffected. **In the change record.** |
| `materialisation_state`, `materialised_at`, `recipient_target_count` on org-document responses | Additive; `not_required` / `null` for everything that exists today |
| 3 new settings | Defaults preserve current behaviour exactly |
| `document_id` accepted on leave submit | Optional; omitting it is the current behaviour |
| A ledger row written by #77 | Invisible in the response |
| `findFinalizedFysForUser` on payroll's repository | New method; no existing method changed |

### 26.2 Behavioural changes requiring a change record

| Change | Who is affected | Mitigation |
|---|---|---|
| #47 may return **`202`** instead of `200` | Any client that treats `!== 200` as failure | **Inert by default** — #79 defaults to today's hard limit, so no org can reach the branch without deliberately lowering it. The change record documents the `202` body and the `poll` path, and the settings row warns that lowering #79 changes #47's response class. |
| Leave submit accepts `document_id`, and `document_url` is derived when it is supplied | Leave clients | Additive; precedence documented (EC-34). Clients passing only `document_url` are byte-identical. |
| `reference_url` removed from employee-document list and detail responses (D-3) | Clients reading `reference_url` off a `reference`-backend document | The field is `null` for every `s3` document; the supported path has always been the view-url endpoint, which returns it as `view_url`. Named explicitly in the change record. |

### 26.3 One breaking removal — D-3 (verified 2026-09-25)

D-3 removes `reference_url` from `employee_document.repository.LIST_ATTRIBUTES`. This **is** a
breaking field removal, confirmed by reading the code rather than assumed:

- `LIST_ATTRIBUTES` (line 26) includes `reference_url`, and `DETAIL_ATTRIBUTES = LIST_ATTRIBUTES`
  (line 34) — so both list and detail carry it.
- `document_read.service.toClient` (line 45) deletes `storage_key` and `document_number` only. It
  does **not** delete `reference_url`, even though the file's header comment at line 29 states that
  responses are "scrubbed of `storage_key`, `document_number` (full) and `reference_url`". The
  comment describes an intent the code never implemented.
- The org plane already corrected this: `org_document.repository.js:29` carries the comment
  "reference_url excluded — D-3 fix". The employee plane was missed.

Consequence for P5: any client currently reading `reference_url` from an employee-document list or
detail response loses the field. The exposure is limited to `reference`-backend documents (it is
`null` for every `s3` document, which is the overwhelming majority), and the correct way to reach
such a document has always been the view-url endpoint, which returns the reference URL as
`view_url`. The removal therefore goes ahead, and it gets an explicit entry in the change record
(§28 D-5) naming the affected endpoints and the `view_url` replacement.

`document_read.service.js:186` reads `full.reference_url` from `findByIdForStorage` — a different,
service-internal projection — and is unaffected.

### 26.4 What is guaranteed unchanged

`/me/documents`; `/me/hr-documents` (#70); #47 below the threshold (byte-identical body);
`syncRecipients`' signature and its `422`; every P1 authority decision; every P3 acknowledgement and
signature contract; every P4 cron schedule and notification template; the uniform-denial rule; the
`storage_key` boundary; payroll's allow-list isolation.

---

## 27. Open Decisions, Risks & Carry-over

### 27.1 Decisions this plan makes (and why)

| ID | Decision | Alternative rejected |
|---|---|---|
| **O-1** | Malware scanning stays **not implemented**; the module remains scan-ready. | Picking a provider unilaterally. Parent Open Decision 3 is unanswered; a scanner is a procurement decision with a per-file cost. |
| **O-2** | The exit pack is a **manifest of short-TTL signed URLs**, not a ZIP. | A ZIP via payroll's `zip_writer.utils` — would stream every binary through Node, breaking P1's core boundary, and could produce a 2 GB response. |
| **O-3** | Leave passing both fields: **`document_id` wins**, `document_url` ignored. | `400`. A redundant field should not cost someone their leave application; the parent's own word is "precedence". |
| **O-4** | A fulfilled request is **not** reopened when its document is later deleted or rejected (P4 O-8). | Auto-reopen. It would resurrect a closed workflow item without an actor, and HR raising a new request is the auditable act. |
| **O-5** | No manager copy of the new-upload notice (P4 O-9). | Sending it. Not in the parent; multiplies volume; needs its own toggle. |
| **O-6** | No digest emails (P4 O-10). | Building a digest scheduler nobody asked for. |
| **O-7** | Search and reporting are **HR-only** in P5. | A manager plane. Requires scoping every predicate and re-screening every row; managers already have #79/#94/#95. Design sketch recorded below. |
| **O-8** | Offboarding is **HR-only**, despite the parent filing it under Manager §2.2. | Manager execution. Archiving documents and waiving compliance obligations are irreversible org-level acts. The manager maker-checker variant (propose → HR approve) fits the module's existing Tier-B pattern and is the natural next phase. |
| **O-9** | The export ledger is written **outside** the read transaction. | In-transaction. A crash would then leave no record of an export that partially reached the client — exactly the case the ledger exists for. |
| **O-10** | Tags are **HR-writable only**. | Employee-writable tags. The subject could then influence which searches surface their documents. |
| **O-11** | Template objects are **not** swept; reconciliation is an operator procedure. | Extending P4's sweeper to a third table. Real work nothing asks for, and a wrong sweeper deletes HR content. Volume is dozens of objects. |
| **O-12** | Setting #79 ships at today's effective value (20000) and is **measured by the operator**. | Guessing a smaller number. Parent Open Decision 5 says measure; guessing would change #47's response class for every org on deploy day. |
| **O-13** | The leave bridge stores a **relative attachment path** in the existing `leave_requests.document_url` column, and #128 grows a `?redirect=true` mode so the stored value is directly linkable. | Adding a `document_id` FK column to `leave_requests`. Cleaner — each client would call its own audience's view-url endpoint and no URL would be stored at all — but it is a **leave-module schema change**, which D-17 does not ask for and which this plan has no mandate to make. Recorded here so a later phase can take it deliberately. See **B-11**, §31. |

**O-7 design sketch for a later phase.** `GET /manager/documents/search`: resolve
`getAccessibleUserIds`; if `null` (global) behave as HR; if `[]` return an empty page; otherwise
intersect `userIds` with the accessible set **before** the query; keep `screenDocument` per row so
confidential types stay hidden; and never return a total count that includes screened-out rows —
a count is an oracle.

### 27.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:--:|:--:|---|
| `00050`/`00051`/`00053` remain unapplied and P5 is built on an imagined schema | Medium | High | Step 0 is a hard gate with operator confirmation |
| An org lowers #79 and a client breaks on `202` | Low | Medium | Default is inert; the change record and the settings row both warn |
| The missing-mandatory roll-up is slow at 5 000 employees | Medium | Medium | Chunked and sequential; `include_employees` off by default; §25.6 measures it; if it is slow the honest answer is an async export, which is a follow-up, not a P5 rewrite |
| The route-collision hazard (P-26) silently `404`s a new endpoint | Medium | Medium | §11.4 rules + T-52 |
| The leave bridge blocks leave submission in a way users find surprising | Low | Medium | Explicit `4xx` codes, documented precedence, change record; `document_url` remains the resilient path |
| Template orphan objects accumulate | Medium | Low | §19.4, §25.7, O-11; volume is small |
| Prefix-only title search disappoints users expecting substring search | Medium | Low | Stated in the change record and the API contract; `pg_trgm` is the documented upgrade path if the operator approves the extension |
| A ledger row stuck at `started` is mistaken for a hung job | Low | Low | The table's header comment says it is not a queue; §29 has the alert |

### 27.3 Carry-over into a future phase

| ID | Item |
|---|---|
| C-1 | External e-signature adapter + webhook + reconciliation (V-1; needs a vendor) |
| C-2 | Malware scanning (O-1; needs a provider) |
| C-3 | Manager search / reporting plane (O-7) |
| C-4 | Manager-proposed offboarding with HR approval (O-8) |
| C-5 | Template object reconciliation automation (O-11) |
| C-6 | Async export jobs if §25.6 shows the roll-up exceeds its budget |
| C-7 | Substring title search via `pg_trgm`, if the operator approves the extension |

### 27.4 Carry-over defects — **closed in P5**

D-2, D-3, D-4, D-6 are fixed in Step 17 (§10 F-9). D-5 (missing completion reports and the P1 change
record) is closed in Step 18 (§28). **The P5 completion report must state that P1–P3's reports were
written retrospectively**, because a report that pretends to be contemporaneous is worse than a
missing one.

---

## 28. Documentation Deliverables

| ID | File | Content |
|---|---|---|
| **D-1** | `public/md_system/api_registry.md` | Append #99–#129 to the Document Module block; note #47's `202` and #77's ledger row |
| **D-2** | `public/md_settings/org_settings_registry.md` | Append rows 79–81 with defaults, caps and the warning that lowering #79 changes #47's response class |
| **D-3** | `public/md_documents/DOCUMENTS_API_CONTRACT.md` | Extend from #98 to #129; document the `202` body, the prefix-only search semantics, and the composer's `access.path` contract |
| **D-4** | `public/md_updates/2026-09-25_leave_document_attachment_bridge.md` | **Required by parent D-17 and the project rule.** The optional `document_id`, the derived `document_url`, the EC-34 precedence rule, #128's contract and audiences, the new error codes, and the explicit statement that `document_url`-only callers are unaffected. **It must open with a `Frontend action required` heading covering B-11:** after this change `leave_requests.document_url` may hold a *relative API path*, not an absolute URL; a client that renders it as a bare `href` will show the user raw JSON. The document states both forms — plain (`200 {url, expires_at}`) and `?redirect=true` (`302` to the signed URL) — and says which one to put in an anchor tag |
| **D-5** | `public/md_updates/2026-09-25_documents_phase5_api_changes.md` | Additive `tags`; additive org-document materialisation fields; #47's `202`; the 31 new endpoints; **and the D-3 removal of `reference_url` from employee-document list/detail responses** (§26.3) — naming the affected endpoints and the `view_url` replacement |
| **D-6** | `public/md_documents/phases/phase5_completion_report.md` | What shipped, what did not, measured test counts, the unmeasured performance targets, every decision in §27.1 |
| **D-7** | `public/md_documents/phases/phase1_completion_report.md`, `phase2_…`, `phase3_…` | Carry-over D-5. Written from the shipped code. Each states that it was written retrospectively during P5 |
| **D-8** | `public/md_system/combined_api_analysis.md` | Refresh the Document Module section to 129 endpoints |

Every document is written from **the shipped code**, not from this plan. Where they disagree, the
code is right and this plan was wrong.

---

## 29. Production-Readiness Checklist

| # | Item | Done when |
|---|---|:--:|
| 1 | `00050`, `00051`, `00053` applied before `00054` | Operator confirms |
| 2 | `00054` reviewed statically; `down()` is the exact inverse; the destructive-rollback warning is in the hand-back | ☐ |
| 3 | Every new repository method scopes by `org_id` | ☐ |
| 4 | Every new endpoint carries `authenticate` + `authorize` + `requireFeature` | ☐ |
| 5 | Denial is uniform per addressing mode across all 31 | ☐ |
| 6 | `storage_key` absent from every response, log and audit row (chokepoint test + grep) | ☐ |
| 7 | `document_number` absent from every bulk surface | ☐ |
| 8 | Every multi-write operation is in one transaction with its audit rows | ☐ |
| 9 | Every advisory lock precedes its row locks and uses the §16.3 key | ☐ |
| 10 | Every cron body is delegate-only, IST, inside the linux guard, try/catch wrapped | ☐ |
| 11 | Both new jobs are in `runStartupCatchUp` | ☐ |
| 12 | Both new jobs have a manual HR trigger (#125, #129) | ☐ |
| 13 | Every CSV endpoint writes exactly one ledger row with the correct terminal status | ☐ |
| 14 | `EXPORT_TOO_LARGE` writes no ledger row | ☐ |
| 15 | Offboarding deletes nothing; evidence row counts are unchanged | ☐ |
| 16 | Offboarding is idempotent and writes no audit rows on a no-op run | ☐ |
| 17 | Exit-pack URLs are ≤ 900 s and audited; the CSV has no URLs | ☐ |
| 18 | The synchronous publish body is byte-identical to P2 | ☐ |
| 19 | `syncRecipients`' contract is unchanged | ☐ |
| 20 | Materialisation is add-only, crash-safe and frozen-snapshot-based | ☐ |
| 21 | The join hook and the EC-30 hook cannot fail their host operations | ☐ |
| 22 | Composer degrades per section and issues no URL | ☐ |
| 23 | Leave: `document_url`-only behaviour is unchanged; the whole leave suite is green | ☐ |
| 24 | Settings defaults preserve current behaviour; model and migration defaults agree | ☐ |
| 25 | `MUTABLE_FIELDS` is 24 | ☐ |
| 26 | All 36 EC rows are discharged or explicitly marked otherwise | ☐ |
| 27 | Carry-over defects D-2, D-3, D-4, D-6 closed | ☐ |
| 28 | Document suite ≥ 640 pass / 0 fail; leave and payroll suites green | ☐ |
| 29 | All 8 documentation deliverables on disk | ☐ |
| 30 | Zero new dependencies (`git diff package.json` is empty) | ☐ |
| 31 | Route-collision test passes | ☐ |
| 32 | Operator handed: `00054`, the §25.6 measurement procedure, the §25.7 reconciliation query | ☐ |
| 33 | Alerts configured: ledger rows `started` > 15 min; `org_documents` `pending` > 1 h; cron non-execution | ☐ |
| 34 | Performance targets recorded as **unmeasured** until the operator returns numbers | ☐ |

---

## 30. Final Acceptance Criteria

Phase 5 is complete when **all** of the following hold. Each is verifiable by a named test, a file
on disk, or an operator confirmation — none is a matter of opinion.

**Functional**
1. HR can create, version, publish, archive and delete templates; employees can list and download the published, visible, type-gate-passing set; everything else is `404`.
2. At most one published template exists per group, enforced by the DB, proven under concurrency.
3. HR can search employee documents by title prefix, type, owner, department, status, tags and three date ranges, and export the results as CSV.
4. HR can tag a document; tags are normalised, capped and audited.
5. The org-wide missing-mandatory roll-up and the expiring-in-N-days report exist in JSON and CSV, and their numbers agree with the per-employee checklist and `document_expiry.utils` respectively.
6. Every CSV export — including P3's #77 — writes exactly one `document_export_jobs` row, `started` before the first byte and `completed`/`failed` after.
7. Offboarding archives, waives and cancels atomically and idempotently, deletes nothing, honours `retain` mode, and is reachable from the HR endpoint, the daily cron and the soft-delete hook.
8. The exit pack is available as a URL manifest (≤ 900 s TTL, every issuance audited) and as a URL-free CSV.
9. `GET /me/documents/all` returns four uniformly-shaped sections and degrades the payroll section rather than failing when payroll is absent, unentitled or throwing.
10. A publish above setting #79 returns `202` with the document published and pending; the worker converges to exactly the target recipient count from the frozen snapshot; above the code ceiling the `422` is unchanged.
11. Accepting an invitation immediately creates recipient rows for open matching documents, with `due_on` from the join date.
12. A leave application can carry `document_id`; it resolves to an attachment path, `document_id` wins over `document_url`, and an approver can open the file through #128.

**Non-functional**
13. 31 endpoints at #99–#129, all registered in `api_registry.md` and the API contract.
14. Settings #79–#81 exist with caps, defaults that preserve current behaviour, and registry rows.
15. 7 crons registered on linux, all delegate-only, all in `runStartupCatchUp`, all manually triggerable.
16. Zero new dependencies.
17. All 36 EC rows discharged or explicitly marked, each naming its test.
18. All nine security sweeps pass.
19. Carry-over defects D-2, D-3, D-4, D-6 closed; D-5's four documents written and labelled retrospective.
20. Document suite ≥ 640 pass / 0 fail; leave and payroll suites green and unchanged.

**Integrity**
21. No P1–P4 contract broken. `/me/documents`, `/me/hr-documents`, #47-below-threshold and `syncRecipients` are byte-identical.
22. `storage_key` appears in no response, log or audit row; the chokepoint is five repository methods with named sole callers.
23. No acknowledgement, signature or audit row is ever deleted, archived or mutated by P5 code.
24. Every state-changing P5 operation is transactional, idempotent or explicitly documented as neither (§17.3).
25. Migration `00054` is handed to the operator **unrun**, with its prerequisites and its destructive-rollback warning stated.
26. The §8 performance targets are recorded as **unmeasured**, with the measurement procedure handed over — not asserted as met.


---

## 31. Implementation Hazards — Known Bugs and Traps

This section exists because an earlier draft of this plan **contained every defect listed below**
(B-1 … B-17, with B-15a split out of B-15 because it is a different kind of mistake). They were found in a senior review pass and the plan above has been corrected. They are
recorded here — with the wrong version, the right version and the evidence — for three reasons:

1. Most of them are **not obvious**. Several would have compiled, passed a happy-path test and
   failed in production against real data.
2. Several describe traps in the **existing P1–P4 code** that any Phase 5 change will walk into
   again. The fix in the plan does not disarm the trap; only knowing about it does.
3. If an implementer disagrees with a correction, they need the original reasoning to argue against.

**How to read the severity column.** *Fatal* = the code as originally planned throws or corrupts
data on a normal path. *Serious* = wrong behaviour on a real but less common path. *Correctness* =
right behaviour, wrong numbers or wrong contract. *Clarity* = would have caused an implementation
mistake downstream rather than being one.

| ID | Area | Severity | One-line summary | Fixed in |
|---|---|:--:|---|---|
| B-1 | F-4 offboarding | **Fatal** | Waiving on a status value that does not exist, while missing one that does | §10 F-4, §12 R-22 |
| B-2 | F-1 templates | **Fatal** | Publish promoted the new row before demoting the old one → unique-index violation | §10 F-1, §15 |
| B-3 | §6 migration | **Fatal** | A CHECK constraint that would abort an **existing P2 code path** | §6 `00054` |
| B-4 | F-6 | Clarity | Referred to an org-document status (`archived`) that does not exist | §10 F-6 |
| B-5 | F-1 templates | Correctness | Two different end-states collapsed into one status | §14 |
| B-6 | F-1 templates | **Serious** | Concurrent `replace` mints duplicate version numbers | §10 F-1, §16 C-4 |
| B-7 | F-2 search | **Serious** | Post-query screening breaks paging and totals | §10 F-2, §12 R-13 |
| B-8 | F-4 / audit | Serious | Unbounded id array written into an audit row | §10 F-4, §8 |
| B-9 | F-4 cron | Serious | The documented backstop could not actually back anything up | §18.2, §20 |
| B-10 | F-4 offboarding | Serious | A departed employee keeps receiving reminder emails | §10 F-4 step 5 |
| B-11 | F-8 leave bridge | **Serious** | The stored value is a relative path — breaks `href` rendering and fails its own validator | §10 F-8, O-13 |
| B-12 | F-2 search | Correctness | `LIKE` on a bound parameter silently loses the index | §10 F-2 |
| B-13 | #128 | Clarity | An endpoint justified as new capability that is not new capability | §10 F-8 |
| B-14 | Terminology | Clarity | "plane" used for two different things in one document | throughout |
| B-15 | §24 testing | Clarity | The same `T-` number meant two different tests | §4.3, §24.2 |
| B-15a | §11.4 routing | Serious | Collision safety depended on invisible mount order | §11.4 |
| B-16 | F-3 reports | Correctness | `has_more` with no way to ask for more | §10 F-3 |
| B-17 | F-4 exit pack | Serious | Unbounded response size and unbounded signing work | §10 F-4, §12 R-25 |

---

### B-1 — Waiving a status that does not exist, and missing one that does *(Fatal)*

**Wrong.** Offboarding archive waives recipient obligations with
`WHERE status IN ('pending', 'overdue')`.

**Why it is wrong, twice over.**

- `org_document_recipients.status` is
  `ENUM('pending', 'viewed', 'acknowledged', 'signed', 'waived')`
  (`org_document_recipients.model.js`). **There is no `overdue` value.** `overdue` is a *derived
  filter keyword* that `org_document_recipient.repository.js:65` translates into a `due_on < now()`
  predicate. Passing it as a status either throws an enum error or silently matches nothing,
  depending on how the query is built — and "silently matches nothing" is the dangerous outcome.
- `viewed` **was** omitted. `viewed` means "the employee opened the document but never acknowledged
  it": an obligation that is very much still open. A departed employee would keep an unacknowledged,
  unwaivable row forever, and every compliance report would keep counting them.

**Right.** `WAIVABLE_RECIPIENT_STATUSES = Object.freeze(['pending', 'viewed'])`.

**The trap generalises.** Everywhere in this module, *filter vocabulary* and *stored enum values*
overlap but are not the same set. `overdue` is a legal filter for recipients (derived) **and** a
legal stored status for `document_requests`
(`document_requests.model.js`: `ENUM('open','fulfilled','cancelled','overdue')`, and
`document_defaults.js:112`'s `DOCUMENT_REQUEST_OPEN_STATUSES = ['open','overdue']`). So the bulk
**request**-cancel in the same feature legitimately does use `('open','overdue')` — the two adjacent
blocks of code correctly use different sets. **Before writing any status filter, open the model file
and read the enum.** Do not pattern-match off the neighbouring query.

---

### B-2 — Template publish ordering violates a partial unique index *(Fatal)*

**Wrong.** In `publish`: insert/promote the new template to `active`, then demote the predecessor to
`superseded`.

**Why it is wrong.** The "one active template per group" rule is a **partial unique index**. In
PostgreSQL a partial unique index **cannot be declared `DEFERRABLE`** — it is checked at the end of
each *statement*, not at commit. The moment the new row becomes `active` there are two active rows
in the group and the statement aborts, inside the transaction, every time. Not a race: it fails on
the very first single-threaded call.

**Right.** Demote first, promote second. This is not a new idea — it is exactly what P2 already
does for org documents:

```js
// document_org.service.js:550  — demote the predecessor FIRST
await orgRepo.update(orgId, predecessor.id,
  { status: 'superseded', superseded_at: new Date() }, t)
// document_org.service.js:583  — then publish the successor
status: 'published', version, supersedes_id: supersedesId,
```

**Generalised rule for P5:** any time a uniqueness rule is expressed as a partial unique index,
**vacate before you occupy**, in separate statements, in one transaction.

---

### B-3 — A CHECK constraint that aborts an existing P2 path *(Fatal)*

**Wrong.** `00054` adds
`CHECK (materialisation_state <> 'pending' OR status = 'published')` to `org_documents`,
reasoning that a document cannot be mid-materialisation unless it is published.

**Why it is wrong.** P2's `replace` flow moves a document `published → superseded` while its
`materialisation_state` may still be `pending`. The constraint fires and the **existing, shipped,
unmodified** replace path starts throwing. The most dangerous kind of migration defect: the breakage
is in code the migration author never looked at.

**Right.** The constraint is **not added**. The invariant is enforced in the service layer, where it
can also express the legitimate exception (§10 F-6: the materialisation worker halts when it finds
the document superseded or retired — T-36 covers this).

**Generalised rule:** before adding a CHECK to a table that older code writes, `grep` every
`UPDATE`/`.update(` against that table and confirm each one can still satisfy the predicate. A CHECK
is a constraint on *all past and future code*, not on the feature you are building.

---

### B-4 and B-5 — Status vocabulary invented rather than read *(Clarity / Correctness)*

**B-4.** F-6 described an org document being "archived". `org_documents.status` is
`ENUM('draft','published','superseded','retired','rejected')` — **no `archived`**. The employee
plane has `archived` (`employee_documents.status`); the org plane does not. The two planes have
deliberately different vocabularies and this plan must not blur them.

**B-5.** The template lifecycle used a single `archived` end-state for two genuinely different
outcomes: *this template was replaced by a newer version* and *this template is withdrawn and no
newer version exists*. Merged, HR cannot tell a live lineage from a dead one, and the
`MAX(version)+1` calculation in B-6 loses its meaning. **Right:** `superseded` (replaced) and
`archived` (withdrawn) are separate terminal states — §14.

---

### B-6 — Concurrent `replace` mints duplicate versions *(Serious)*

**Wrong.** `replace` computed the new version as `predecessor.version + 1`.

**Why it is wrong.** Two HR users replacing the same active template within the same window both
read the same predecessor, both compute the same next version, and both write it. The lineage now
has two `version = 3` rows and "the latest version" is undefined.

**Right**, three parts, all needed:

1. A **draft is a lock**: a second `replace` while an unpublished draft exists in the group returns
   `409 TEMPLATE_DRAFT_EXISTS`. This is the actual fix — it makes the double-draft state
   unreachable rather than merely unlikely.
2. Version is `MAX(version) + 1` **over the whole group**, not `predecessor.version + 1`, so a
   deleted or skipped version never gets reused.
3. `document_templates_group_version_uq (org_id, template_group_id, version)` is the backstop that
   turns the remaining race into a clean constraint error instead of silent corruption.

> **Related observation in existing code — not fixed by this plan.** P2's org-document `replace`
> (`document_org.service.js`) appears to compute its version the same way and to carry the same
> latent collision. P5 does **not** change it: it is outside this phase's scope and altering it
> would modify shipped behaviour. It is flagged here so whoever touches the org replace path next
> knows to look. Do not "fix it while you're in there" as part of P5.

---

### B-7 — Screening after `LIMIT` breaks paging and totals *(Serious)*

**Wrong.** Fetch a page with `LIMIT/OFFSET`, then drop rows the caller may not see by running
`screenDocument` over the result.

**Why it is wrong.** Two distinct failures:

- **Short pages.** `limit = 20` returns 14 rows because 6 were screened out. The client sees a short
  page and reasonably concludes it has reached the end. Documents past that point are unreachable.
- **A count that is an oracle.** If `total` comes from the unscreened query, the caller learns *how
  many documents they are not allowed to see* — including, by narrowing filters, roughly what they
  are. A count is an information leak, which is why §27.1 O-7's sketch repeats the point.

**Right.** The visibility predicate goes **into the SQL**, so `LIMIT`, `OFFSET` and `COUNT` all
operate on the visible set. `screenDocument` stays as defence-in-depth, and if it ever removes a row
the query returned, that is a **bug in the predicate**: log a `warn` with the document id. The
screen should be a no-op in production; make it say so when it is not.

---

### B-8 — Unbounded id array in an audit row *(Serious)*

**Wrong.** The bulk archive/waive audit row carried `document_ids: [ ...every id... ]`.

**Why it is wrong.** A long-tenured employee can have thousands of documents. At 36 bytes per UUID
plus JSON overhead, 2 000 documents is roughly **72 KB in a single `document_audit_logs.details`
value** — per offboarding. Audit tables are append-only and never pruned. It bloats the table, slows
every audit read, and delivers no value: nobody reads a 2 000-element array.

**Right.** `AUDIT_ID_SAMPLE_MAX = 100`. Store an exact `count`, the first 100 ids as a sample, and
`ids_truncated: true|false`. The count is the auditable fact; the sample is for debugging.

**Generalised rule:** an audit `details` payload is bounded by **the number of employees**, never by
**the number of rows they touched**.

---

### B-9 — A backstop that could not back anything up *(Serious)*

**Wrong.** §18.2 claimed that if the synchronous offboarding hook (EC-30) fails, the nightly
offboarding cron will pick the employee up on the next run.

**Why it is wrong.** The cron's only query read `employee_exits`. If the failure happened *before*
the exit row existed — or for an employee deactivated without an exit record, which
`softDeleteEmployee` permits — the cron would never see them. The documented recovery path did not
exist. A false claim in a plan is worse than an acknowledged gap, because nobody builds a real
recovery for a problem they believe is already solved.

**Right.** The cron runs **two passes**: Pass A over `employee_exits` (as before), Pass B via
`findInactiveMembersWithArchivableDocuments` — inactive members who still hold non-archived
documents or open recipient obligations, regardless of whether an exit row exists. Pass B is what
makes the sentence in §18.2 true.

**Generalised rule:** when a plan says "the cron will catch it", open the cron and read its `WHERE`
clause. Recovery claims are the least-tested sentences in any design document.

---

### B-10 — Emailing a departed employee *(Serious)*

**Wrong.** Offboarding waived the recipient obligations but did nothing about the notification
outbox.

**Why it is wrong.** `document_notifications` rows already queued for that employee remain `pending`
and the outbox worker sends them. The organisation emails a person who left, about an obligation it
has just formally waived, to an address that may now bounce or belong to someone else. It also
reaches whoever inherited the mailbox.

**Right.** A new **step 5** in the offboarding sequence: `skipPendingForUser` moves that employee's
`pending` notifications to `skipped` — an existing value in
`document_notifications.status ENUM('pending','sending','sent','failed','skipped')`, so **no enum
change and no migration**. Two details that matter:

- Filter on `recipient_user_id`, not `subject_user_id`. A notification *about* the departing
  employee may be addressed *to* their manager or to HR, and those must still be delivered.
- **Exclude `sending`.** A row in `sending` has been claimed by a worker
  (`FOR UPDATE SKIP LOCKED`) and may already be in flight at the provider. Rewriting it under the
  worker races with the RECORD step and can mark a sent message as skipped. Leave it; it completes
  or fails on its own.

---

### B-11 — The leave bridge stores a relative path *(Serious — highest frontend risk in P5)*

**The situation.** The bridge derives `leave_requests.document_url` as
`/api/v1/documents/attachments/<uuid>/view-url`. The column previously held absolute URLs.

**Consequence 1 — existing clients break.** A client that renders `document_url` directly as an
`href` currently opens a file. After this change it opens an endpoint that returns
`200 {url, expires_at}` — the user sees raw JSON. Nothing throws; nothing logs; the feature simply
looks broken to the person using it. **Mitigations, both required:**

- #128 accepts **`?redirect=true`** and answers `302 Found` with the signed URL in `Location`, so
  the path *is* directly linkable when the client asks for it. Store the plain path; let the client
  append the parameter. That keeps the stored value useful to a JSON client too.
- The §28 D-4 change record opens with a **`Frontend action required`** heading. Do not bury this in
  a field table.

**Consequence 2 — the value fails its own validator on echo-back.**
`leave_request.validator.js:22` is `document_url: Joi.string().uri().max(255).allow('', null)`, and
Joi's `uri()` rejects relative paths unless `allowRelative: true`. Submission is safe because the
service derives the value *after* validation. But any flow that sends a stored `document_url` back
through `submitRequestSchema` — re-apply, duplicate-leave, edit-and-resubmit — is rejected on a
value this system produced. Relax it to accept both shapes (§10 F-8).

**Verified, so the implementer does not have to re-check:** `leave_requests.document_url` is a bare
`STRING(255)` with **no** Sequelize-level validator (`leave_request.model.js:56`), and
`_assertDocumentRequirement` only tests truthiness (`if (ctx.documentUrl) return`). Nothing else in
the leave module inspects the value's shape. Storing a relative path is safe **at the database and
service layers**; the entire risk is at the client and at the validator.

**Rejected alternative, recorded as O-13:** add a `document_id` column to `leave_requests` and store
no URL at all. Cleaner, but it is a leave-module schema change that D-17 does not authorise.

---

### B-12 — `LIKE` on a bound parameter loses the index *(Correctness)*

**Wrong.** Prefix search issued as `WHERE title LIKE $1` with `$1 = 'foo%'` via `bind`.

**Why it is wrong.** PostgreSQL can use a `text_pattern_ops` index for `LIKE 'literal%'` because it
rewrites the pattern into a range at **plan** time. With a bound parameter under a **generic plan**
the prefix is not known when the plan is made, so the rewrite does not happen and the planner falls
back to a sequential scan. It behaves perfectly in a single-shot `EXPLAIN` with a literal and
degrades only after the statement has been executed enough times to earn a generic plan — i.e. only
in production, only under load.

**Right.** Use Sequelize `replacements` (interpolated before planning) rather than `bind`, and if
the plan still disappoints, write the range predicate explicitly:
`title >= 'foo' AND title < 'fop'`. Confirm with `EXPLAIN` against realistic row counts, not an
empty table.

---

### B-13 — #128 is an alias, not a new capability *(Clarity)*

An earlier draft justified #128 as giving readers access to leave attachments. That is not true:
**every audience can already obtain a view URL for an employee document.**

| Audience | Existing endpoint |
|---|---|
| HR | `document_hr.routes.js:36` |
| Manager | `document_manager.routes.js:23` |
| Self | `document_self.routes.js:21` |

(The org plane has three more: `document_org_hr.routes.js:35` #57, `document_org_manager.routes.js:21`
#69, `document_org_self.routes.js:14` #72.)

What does **not** exist is *one path that is correct for every reader*, and that is exactly what a
leave record needs, because `document_url` is a single stored string read by the applicant, their
manager and HR. Storing any audience-specific path would be wrong for two of the three readers.
#128 is an **audience-dispatching alias** over `documentReadService.viewUrl`. State it that way, so
nobody later "discovers" the duplication and deletes one side of it.

---

### B-14 — "plane" means one thing in this module *(Clarity)*

Drafts described #128 as "plane-neutral". In this module **plane** is reserved by D-2 for
*employee-owned* vs *org-issued* documents. #128 is emphatically **not** neutral between those — it
serves the **employee plane only**. What it is neutral about is the **audience** (HR / manager /
self). The document now says **audience-neutral** throughout. Sloppy vocabulary here produces real
authorization bugs, because the two axes have different rules.

---

### B-15 — Test identifiers collided; B-15a — collision safety depended on mount order

**B-15.** Drafts used `T-31/T-32/T-33` for both the composer tests and the publish tests, and
additionally used "T-32" as a nickname for the **existing P4** chokepoint test. Two rules now hold:
**§24.2 is the single canonical numbering** for T-01…T-54, and **existing P1–P4 tests that P5
extends are named by file** (`tests/unit/document/org_repository_projection.test.js`), never given a
P5 `T-` number. T-53/T-54 were added for the legacy-projection snapshots that §4.3 promised but
§24.2 never listed.

**B-15a *(Serious)*.** An earlier draft placed #126 `/me/documents/all` in a new
`document_composer_self.routes.js` "mounted before `selfRoutes`". That is correct **only** as long as
nobody reorders `document.index.js`, and the route file itself gives the next reader no hint that
its correctness depends on a line in a different file. If the order is ever changed, `all` is parsed
as a document id and the endpoint returns `404` — a silent failure that looks like a missing feature.

**Verified, and corrected in §11.4:** `document_self.routes.js` already establishes the safer local
convention —

```js
// line 13-14
// Static-prefix segment `types` declared BEFORE `:id` to avoid collision.
router.get('/me/documents/types', selfAuth, controller.listMyUploadableTypes)
...
// line 19
router.get('/me/documents/:id', selfAuth, controller.detail)
```

So `/me/documents/all` is declared in **that same file, above line 19**, and
`document_composer_self.routes.js` is not created. **Prefer declaration order inside the owning
router to mount order across routers.** Declaration order is visible to whoever edits the file next;
mount order is action-at-a-distance.

---

### B-16 — `has_more` with no way to ask for more *(Correctness)*

**Wrong.** The missing-mandatory roll-up returned `has_more: true` when the employee list was
truncated, but exposed no offset parameter.

**Why it is wrong.** The flag tells the caller there is more data and gives them no means of
fetching it. Either the truncation is invisible (worse) or it is visible and useless (this).

**Right.** `employees_limit` and `employees_offset` parameters, with `has_more` computed against
them. Both are named distinctly from the report's own paging so the two cursors cannot be confused.

---

### B-17 — Unbounded exit pack *(Serious)*

**Wrong.** The exit pack returned a signed URL for every document the departing employee held.

**Why it is wrong.** Item count is unbounded by anything except tenure. A long-tenured employee can
produce hundreds of entries; each needs a signing round-trip, so the endpoint's latency and the
storage provider's load both scale with an uncontrolled number. The response can reach several
megabytes of URLs. It also hands out hundreds of live signed URLs in one call, which is a wider
blast radius than any other endpoint in the module.

**Right.** `EXIT_PACK_MAX_ITEMS = 500`, and above it a `422 EXIT_PACK_TOO_LARGE` that names the
count. Refusing loudly is better than a slow success nobody can consume, and the limit makes the
worst case something an operator can reason about. If a real org hits it, that is a signal to build
the async variant (§27.3 C-6), not to raise the constant.

---

### 31.1 The five habits these defects have in common

The implementer will write new code this plan does not cover. These are the checks that would have
caught most of the list:

1. **Read the enum before you filter on it.** B-1, B-4, B-5. Filter vocabulary ≠ stored values, and
   the two planes do not share a vocabulary.
2. **Vacate before you occupy.** B-2. Partial unique indexes cannot be deferred; uniqueness is
   enforced per statement.
3. **A new constraint constrains all existing code.** B-3. `grep` every writer of the table first.
4. **Authorization belongs in the query, not after it.** B-7. Anything applied after `LIMIT`
   corrupts paging, and any count over the unfiltered set is an information leak.
5. **Bound the unbounded.** B-8, B-16, B-17. Every list, array and payload whose size is a function
   of user data needs an explicit cap and an explicit behaviour at the cap.

And one that is not a habit but a rule: **when this plan claims a recovery path exists, open the
code and confirm it does** (B-9). That is the class of error that survives review.
---

### Appendix A — Verified facts underpinning this plan

Each was confirmed by reading source or running a command on 2026-09-25, not by consulting a prior
report.

| Fact | How confirmed |
|---|---|
| 540 document unit tests pass, 0 fail | `npx node --test "tests/unit/document/**/*.test.js"` |
| Last migration is `00053` | Directory listing |
| Last endpoint is #98 | `api_registry.md` Document Module block |
| Last settings row is #78 | `org_settings_registry.md` line 572 onward |
| P3 already ships a compliance CSV export | `document_compliance.service.exportCsvForHr` |
| There is no export-job table | `document_org_hr.controller.js:276-302` comment; no model, no migration |
| `employee_documents` has no `tags` column | `employee_documents.model.js` |
| `ORG_PUBLISH_SYNC_LIMIT = 20000` and `publish` throws above it | `document_org_rules.utils.js:44`; `document_org.service.js:527` |
| `employee_documents.status` already contains `archived` | `employee_documents.model.js` enum |
| `leave_requests.document_url` is `STRING(255)`, URI-validated | `leave_request.model.js:56`; `leave_request.validator.js:22` |
| `acceptInvitation` commits before consuming the token | `invitation.service.js:626` |
| `softDeleteEmployee` unwinds leaves in-transaction | `organization.service.js` ~line 653 |
| `employee_exit.repository` exposes the live-exit reads | `payroll/repositories/employee_exit.repository.js` |
| No payroll method lists a user's finalized Form-16 years | `employee_tax_summary.repository.js` |
| `document_read.service.viewUrl` resolves the full authority matrix | `document_read.service.js:166` |
| `document_hr.routes.js` owns `/documents/:id` and is mounted first | `document.index.js`; `document_hr.routes.js` |
| The document module's CSV writer is payroll's | `document_compliance.service.js:13` |
| `document_settings.service.MUTABLE_FIELDS` holds exactly 21 keys | Counted in source |
| `reference_url` is in `LIST_ATTRIBUTES`, `DETAIL_ATTRIBUTES === LIST_ATTRIBUTES`, and `toClient` does not scrub it | `employee_document.repository.js:26,34`; `document_read.service.js:45-56` |
| The org plane already excludes `reference_url` | `org_document.repository.js:29` |

### Appendix B — Facts NOT verified (operator must confirm)

| Assumption | Why it matters | How to confirm |
|---|---|---|
| `00050`, `00051`, `00053` are unapplied | Step 0 is a hard gate | `SELECT name FROM "SequelizeMeta" ORDER BY name DESC LIMIT 5` |
| `pg_trgm` is not installed | Decides prefix-only vs substring search | `SELECT * FROM pg_extension WHERE extname = 'pg_trgm'` |
| `00054` is the next free migration number | Another module may claim it first | Directory listing at implementation time |
| Payroll's tax-summary finalized status is spelled `finalized` | F-5's new repository read | Read `employee_tax_summary.model.js` when implementing |
| The §8 performance targets are met | Parent requires measurement | §25.6 |

**Nothing in this plan claims to have been verified against a running database.**
