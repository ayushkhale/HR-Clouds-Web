# Documents Module — Phase 4 Implementation Plan

**Phase:** 4 of 5 — Requests, Checklists, Expiry Engine, Notification Outbox, Retention
**Status:** PLANNED (not started)
**Authored:** 2026-09-24
**Prerequisite phases:** Phase 1 (#1–#42) COMPLETE · Phase 2 (#43–#72) COMPLETE · Phase 3 (#73–#79) COMPLETE
**Parent specification:** `public/md_documents/implementation_plan.md` §9 (Phase 4), §4.1, §11, §12
**Baseline at authoring time:** 312 document unit tests pass / 0 fail · last migration on disk `00051` · last endpoint `#79` · last org-settings registry row `#70` · zero document cron jobs exist

---

## 0. How this plan was derived (Scope Reconstruction)

This plan is **not** a copy of §9 of the parent plan. It was reconstructed by reading the shipped source tree
(`src/modules/document/` — 56 files, `src/infrastructure/postgres-sql/migrations/00049–00051`,
`src/infrastructure/aws-s3/`, `src/modules/payroll/` precedents, `src/cron-jobs/`, `src/server.js`)
and comparing what is **actually on disk** against what §9 assigns to Phase 4.

Four outcomes were possible for each parent-plan Phase-4 line item, and every one is classified in §3:

| Verdict | Meaning | Action in this plan |
|---|---|---|
| **DONE** | Already implemented in P1/P2/P3. | Recorded in §3.2 with the file and symbol that proves it. **Not planned again.** |
| **PARTIAL** | Half the mechanism shipped; P4 completes it. | The *delta only* is planned, with the shipped half named as a dependency. |
| **NEW** | Genuinely unbuilt. | Full dossier in §10. |
| **VOID** | No longer applicable, or the responsibility moved. | Recorded in §3.5 with the reason. |

**Honesty guard.** Every "already shipped" claim below cites a file and symbol that was opened and read
during scope reconstruction. Nothing in §3.2 is inferred from a phase plan; phase plans describe intent,
source describes reality, and where the two disagreed the source won (see §3.6, contradictions K-1…K-8).
No statement in this document asserts that code was executed, tested, or migrated unless it says so explicitly.

---

## 1. Goal & Boundary

### 1.1 Goal

Make the Documents module **act on time** rather than only on request. Phases 1–3 built a complete
request/response system: documents can be uploaded, versioned, verified, targeted, acknowledged and signed,
but every state change requires a human to call an endpoint. Phase 4 adds the four things that move state
without a caller:

1. **Document requests** — HR or a manager formally asks a named employee for a named document type by a
   due date; the request closes itself when the matching document lands.
2. **Required-document checklists** — derive, per employee, which types are mandatory *for that employee*
   from `document_types.is_mandatory` + `mandatory_for`, and express it as an onboarding completeness figure.
3. **Expiry engine** — a daily job that persists `available → expired`, complementing the read-time
   derivation that already ships.
4. **Notification outbox + drain** — a durable, deduplicated, retry-bounded queue for the four notice
   classes the parent plan names, plus the reminder generators that fill it, plus the retention/abandonment
   sweeper that keeps storage and the database in agreement.

### 1.2 In scope

| # | Item | Verdict | Dossier |
|---|---|---|---|
| 1 | `document_requests` table, lifecycle, HR/manager/self surfaces | NEW | F-1 |
| 2 | Auto-fulfilment of an open request on upload confirm / reference link | NEW | F-2 |
| 3 | Required-document checklist + onboarding completeness | NEW | F-3 |
| 4 | Expiry persistence cron (`available → expired`) | PARTIAL (read-side done) | F-4 |
| 5 | `document_notifications` outbox + drain cron + email templates | NEW | F-5 |
| 6 | Reminder generation: expiry, pending acknowledgement, overdue request, new-upload-to-HR | NEW | F-6 |
| 7 | Retention sweeper: abandoned `pending_upload` > 24h, soft-deleted past retention | PARTIAL (inline reap done) | F-7 |
| 8 | On-join recipient top-up for published org documents | PARTIAL (`syncRecipients` done) | F-8 |
| 9 | Cron registration, `runStartupCatchUp()`, manual HR job triggers | NEW | F-9 |
| 10 | Org settings #71–#78 | NEW | §21 |
| 11 | EC-11 closure: block type deactivation while open requests exist | NEW (structurally impossible before F-1) | F-1 |

### 1.3 NOT in scope (and why)

| Item | Why not |
|---|---|
| Malware scanning integration | Parent Open Decision 3 said "confirm before Phase 4". Resolved in §27 O-1 as **no scanner in P4**. The `SCAN_PROVIDER_NOT_CONFIGURED` guard shipped in P1 stays; `screenDocument` already denies only `infected`, so the module is scanner-ready without a scanner. |
| External signature provider adapters, webhooks, reconciliation | P3 §26.3 deferred these to Phase 5, not Phase 4. |
| `document_export_jobs` / async export | P3 §26.3 deferred to Phase 5. |
| Broad compliance reporting beyond the per-employee checklist | P3 shipped per-document compliance (#75–#78). Cross-org compliance reporting is Phase 5. |
| Offboarding archive, exit waivers | P3 §26.3 deferred to Phase 5. |
| In-app / push / SMS notification channels | The parent plan names email only (D-16). The outbox schema is channel-agnostic but P4 implements `email` alone. |
| Manager "nudge" as a separate concept | Subsumed: a manager raising a request (#93) covers the intent without a second entity. See §3.5 V-3. |
| Any change to the S3 provider, upload-URL issuance, or the confirm handshake | P1 owns these and they are correct. P4 only *hooks* the confirm path (F-2, F-6 N-1). |
| Fixing carry-over defects D-2, D-3, D-4 from P1/P2 | Outside P4's request. Re-registered in §27 so they are not lost. |

### 1.4 Boundary statements

- **No binary ever transits Node.** Unchanged from P1. P4 adds no upload or download path; the sweeper
  deletes S3 objects by key and never reads them.
- **`storage_key` remains unreturned, unlogged and unaudited (D-20).** P4 adds exactly one new place that
  reads storage keys (the sweeper) and one new serialisation surface (`document_notifications.payload`),
  which is guarded by an explicit forbidden-key list and a test (§13.5).
- **Zero new npm dependencies (D-19).** `node-cron` and `nodemailer` are already present and used by payroll.
- **Nothing in Phase 4 may assume a cron has run.** This is P1 §17's rule and it survives: every read path
  keeps deriving expiry and overdue status on read (`resolveDisplayStatus`, `isOverdue`). A cron that never
  fires must degrade to "no emails were sent", never to "a document looked valid when it was not".

---

## 2. Pre-Flight Checks

Each check is a precondition that must hold before the corresponding implementation step begins.
`VERIFIED` means it was confirmed by reading source during scope reconstruction on 2026-09-24.
`TO VERIFY` means the implementer must confirm it at the moment of implementation.

| ID | Check | Status | Evidence / How |
|---|---|---|---|
| P-1 | Next migration number is `00053` | VERIFIED | Migration directory ended at `00051-create-document-acknowledgements.js` when this plan was written. `00052-create-organization-invitations.js` (the invitation ledger, unrelated to documents) landed on 2026-09-24 and took that slot, so this plan's migration was renumbered `00052` -> `00053`. |
| P-2 | Migrations `00050` and `00051` are **not yet applied** to any environment | VERIFIED (operator-reported) | `00053` must be applied strictly after them; see §25.1. `00051.down()` destroys evidence tables — never run it to reach `00053`. |
| P-3 | Next endpoint number is `#80` | VERIFIED | P1 = #1–#42, P2 = #43–#72, P3 = #73–#79 per `public/md_system/api_registry.md`. |
| P-4 | Next org-settings registry row is `#71` | VERIFIED | `public/md_settings/org_settings_registry.md` ends at #70. |
| P-5 | The partial expiry index already exists | VERIFIED | `00049`: `CREATE INDEX "employee_documents_org_expiry_idx" ON "employee_documents" ("org_id","expires_on") WHERE "status" = 'available' AND "expires_on" IS NOT NULL`. F-4's and F-6 N-2's scan predicates must match it exactly. |
| P-6 | The pending-acknowledgement scan index already exists | VERIFIED (existence) / TO VERIFY (predicate fit) | `00050`: `org_document_recipients_org_due_idx ("org_id","due_on") WHERE …`. Confirm the partial predicate admits `state IN ('pending','viewed')`; if not, F-6 N-3 falls back to a bounded scan (§10 F-6). |
| P-7 | `org_documents_org_status_idx` exists for the top-up scan | VERIFIED | `00050` line 160. |
| P-8 | `document_audit_logs.entity_type` is a free `STRING(50)` | VERIFIED | `00049`. New entity types `document_request` and `document_notification` need **no** migration. |
| P-9 | `s3.deleteObject` takes a **positional string key**, not an object | VERIFIED | `src/infrastructure/aws-s3/aws-s3.provider.js`. The payroll sweeper calls it with `{ key }` and therefore deletes nothing (§27 D-7). F-7 must call `deleteObject(storageKey)`. |
| P-10 | `document_types` already carries `expiry_reminder_days`, `is_mandatory`, `mandatory_for`, `retention_days` | VERIFIED | `models/document_types.model.js`. **No ALTER needed**; P4 is their first reader. |
| P-11 | `document_targeting.utils.matchesCriteria` accepts `{user_id, department_id, location_id, employment_type, job_status}` | VERIFIED | The same shape `mandatory_for` needs. Reuse verbatim; do not invent a second audience language. |
| P-12 | `document_audit.service.record(entry, transaction)` throws without a transaction | VERIFIED | All P4 audit writes must be inside a transaction, or use `recordDetached`. |
| P-13 | No document cron files exist | VERIFIED | `src/cron-jobs/` holds 10 crons, none document-scoped. |
| P-14 | `server.js` registers crons only when `os.platform() === 'linux'` | VERIFIED | P4 crons follow the same guard; local dev never fires them. |
| P-15 | Baseline test suite is green | VERIFIED 2026-09-24 | `node --test tests/unit/document/*.test.js` → 312 pass / 0 fail. Re-run before the first P4 commit; if it is not 312/0, stop and reconcile before adding tests. |
| P-16 | `email.utils.TEMPLATE_MAP` has 5 entries; `src/common/templates/` has 6 HTML files | VERIFIED | P4 adds 1 template file and 5 map entries. |
| P-17 | `employee_profiles` exposes `department_id`, `location_id`, `employment_type`, `job_status`, `joining_date` | VERIFIED | Checklist matching and top-up both read these. Group and filter by `department_id` only, never the free-text `department`. |
| P-18 | No index supports a status-first scan of `employee_documents` for `pending_upload`, nor a scan of soft-deleted rows | VERIFIED | `employee_documents_org_user_status_idx` is `(org_id, user_id, status)` — unusable for the sweeper. `00053` adds two partial indexes (§6.5). |
| P-19 | `document_settings` has 13 mutable columns and `MUTABLE_FIELDS` lists exactly those | VERIFIED | §21 extends both to 21. |
| P-20 | No `DOCUMENTS_API_CONTRACT.md` exists and no phase completion report exists | VERIFIED | P3 §27 deliverables 3–5 are unfulfilled. Carried as D-5 in §27; P4 §28 creates the contract document because P4 is the first phase to add a durable async surface clients must poll. |

---

## 3. Completed-vs-Remaining Analysis

### 3.1 Parent §9 line items, adjudicated

| Parent §9 item | Verdict | Where it stands |
|---|---|---|
| `document_requests` table, `open → fulfilled → cancelled → overdue`, links to the uploaded document on fulfilment | **NEW** | Nothing exists. Full build: F-1, F-2. |
| Required-document checklist from `is_mandatory` + `mandatory_for` matched against the employee profile; onboarding completeness percentage | **NEW** (inputs DONE) | The two columns ship and are stored but **never read** by any code path. `matchesCriteria` ships and is the matcher. F-3 is the first consumer. |
| Expiry engine: daily cron flips `available → expired`; read paths also treat `expires_on < today` as expired | **PARTIAL** | The read half is **DONE** — `utils/document_expiry.utils.js: resolveDisplayStatus` already reports `expired` for a past `expires_on` regardless of the stored column. Only the persistence cron is missing. F-4. |
| `document_notifications` outbox + drain cron (D-16) | **NEW** | No table, no service, no cron. F-5. |
| New-upload notice to HR | **NEW** | F-6 N-1. |
| Expiry reminders at `expiry_reminder_days` | **NEW** (column DONE) | F-6 N-2. |
| Pending-acknowledgement reminders | **NEW** (due-date + overdue derivation DONE) | P3 shipped `due_on`, `isOverdue`, `daysRemaining` and the scan index. F-6 N-3 adds only the generator. |
| Overdue-request reminders | **NEW** | Depends on F-1. F-6 N-4. |
| Email templates in `TEMPLATE_MAP` | **NEW** | F-5. |
| Linux-guarded cron registration, `runStartupCatchUp()`, manual HR triggers for every cron | **NEW** | F-9. |
| Retention sweeper: abandoned `pending_upload` > 24h (object + row) | **PARTIAL** | `utils/document_version.utils.js: isStaleUpload` already reaps a stale row **inline** at issue/replace time. That covers the common case; it cannot cover a user who never returns. F-7 adds the batch sweep. |
| Retention sweeper: soft-deleted rows past `type.retention_days` | **NEW** (column DONE) | F-7. |
| Statutory types excluded unconditionally | **NEW** | `is_statutory` ships and is read by P1's delete rules, but there is no purge path to exclude from yet. F-7, R-24. |
| Phase-4 settings: expiry reminder schedule, notification toggles, request default due days, onboarding mandatory set + threshold | **NEW**, one **VOID** | §21. "Onboarding mandatory-document set" is **not** a new setting — it is `type.is_mandatory` + `mandatory_for`, which already ship per type. An org-level set would create a second source of truth. See §3.5 V-1. |

### 3.2 Already shipped — do NOT re-plan (with proof)

| # | Capability | Shipped in | Proof |
|---|---|---|---|
| D-a | S3 `deleteObject(key)` | P1 | `src/infrastructure/aws-s3/aws-s3.provider.js` exports it. Parent D-6 is satisfied. |
| D-b | Partial index for the expiry scan | P1 | `00049`, `employee_documents_org_expiry_idx`. The Phase-4 exit criterion "the expiry cron's query uses only the partial index" is achievable with **no new index**, provided the predicate matches (§6.5, T-19). |
| D-c | Derive-on-read expiry | P1 | `resolveDisplayStatus(row, todayIst)`. EC-17's compensation is live; F-4 adds persistence, not correctness. |
| D-d | Inline reaping of abandoned uploads | P1 | `isStaleUpload(row, uploadTtlSeconds, now)` consulted at issue and replace. EC-1 is half-discharged. |
| D-e | `expiry_reminder_days` / `is_mandatory` / `mandatory_for` / `retention_days` / `has_expiry` / `is_statutory` columns | P1 | `models/document_types.model.js`. No ALTER in `00053` for any of them. |
| D-f | `document_scan_required` setting and its `SCAN_PROVIDER_NOT_CONFIGURED` guard | P1 | `services/document_settings.service.js`. |
| D-g | Scan grandfathering | P1 | `screenDocument` denies only `scanStatus === 'infected'`; `not_scanned` passes. EC-26 is **structurally** discharged — enabling scanning later cannot retroactively hide existing documents. |
| D-h | New-joiner acknowledgement due dates computed from sync time, not publish time | P2 | `services/document_recipient.service.js: syncRecipients` → `resolveDueOn(new Date(), dueDays)`. **EC-13's "never retroactively marked non-compliant before their join date" is already discharged.** F-8's cron only has to *call* this; it must not re-derive due dates. |
| D-i | Audience matching language | P2 | `utils/document_targeting.utils.js`: `CRITERIA_KEYS`, `normaliseCriteria`, `matchesCriteria`, `isOrgWide`, `describeTargeting`, `diffCriteria`. F-3 reuses it for `mandatory_for`. |
| D-j | Overdue derivation + the scan index for pending acknowledgements | P3 | `utils/document_compliance.utils.js: isOverdue, daysRemaining, resolveComplianceState`; `org_document_recipients_org_due_idx`. F-6 N-3 needs **no new index and no new predicate logic**. |
| D-k | Append-only audit spine with free-text `entity_type` | P1 | `services/document_audit.service.js`, `00049`. |
| D-l | Uniform denial discipline (`/:id` → 404, `/:userId` → 403) | P1/P2 | `utils/document_authority.utils.js` + controllers. P4 inherits it unchanged. |
| D-m | Manager scoping via `getAccessibleUserIds(orgId, requesterUser)`; `null` never grants scope | P1 | Enforced in every manager controller. F-1/F-3 manager surfaces reuse it verbatim. |
| D-n | CSV writer and download-header helpers | payroll | `payroll/utils/csv_writer.utils.js`, `payroll/utils/download_headers.utils.js`. P4 needs neither (no new export), but they remain the answer if one is added later. |
| D-o | Org settings singleton via `getOrCreate(orgId)`, `MUTABLE_FIELDS`, `assertCap` | P1 | `services/document_settings.service.js`. §21 extends the same three structures. |
| D-p | Outbox drain pattern (CLAIM → SEND → RECORD) | payroll | `payroll/services/payslip_dispatch.service.js`. F-5 mirrors it; it is not re-derived. |
| D-q | Same-day watermark claim via conditional UPDATE | payroll | `payroll/repositories/payroll_settings.repository.js: claimReminderWatermark`. F-6 uses the technique at **entity** granularity, not org granularity (§17.3 explains why). |
| D-r | Two-pass sweeper shape (pending > 24h; retention purge, object first, keep row on failure) | payroll | `payroll/services/payroll_automation.service.js: sweepAttachments`. F-7 mirrors the shape but **fixes the argument bug** (P-9). |
| D-s | Linux-guarded cron registration + 30 s-delayed `runStartupCatchUp()` | payroll | `src/server.js`. F-9 appends to the same block. |
| D-t | HR-only manual job triggers | payroll | `payroll/routes/payroll_hr.routes.js` `POST /jobs/{name}/run`. F-9 mirrors the shape at `/api/v1/documents/hr/jobs/{name}/run`. |

### 3.3 Partially implemented — the delta P4 owns

| Item | Shipped half | P4 delta | Dossier |
|---|---|---|---|
| Expiry engine | Read-time derivation (`resolveDisplayStatus`) + the scan index | Persist the flip; audit it; emit no notification from the flip itself | F-4 |
| Abandoned-upload cleanup | Inline reap when the same user/type is touched again | Batch sweep of rows nobody ever touches again, including the S3 object | F-7 |
| On-join recipient top-up | `syncRecipients` (idempotent, correct due dates) | A cron that finds published, still-effective org documents and calls it | F-8 |
| Pending-acknowledgement compliance | Due dates, overdue derivation, compliance reads | The reminder generator + per-recipient watermark columns | F-6 N-3 |
| Retention | `retention_days` per type + `document_retention_days` org setting (both stored, neither read) | A purge that reads both, taking the **larger** as effective (R-26) | F-7 |
| Type policy resolution | `resolveEffectivePolicy(type, settings)` covers size, content types, visibility, verification | It does **not** resolve `is_mandatory` / `mandatory_for` / `expiry_reminder_days` / `retention_days`. P4 adds these as separate pure resolvers rather than widening the existing one, so no existing caller's return shape changes | F-3, F-6, F-7 |

### 3.4 Requirements that moved between phases

| Requirement | Parent plan placed it in | Actually landed in | Consequence for P4 |
|---|---|---|---|
| `deleteObject` on the storage provider | Phase 4 (D-6) | Phase 1 | F-7 consumes it; does not build it. |
| Expiry derive-on-read | Phase 4 | Phase 1 | F-4 shrinks to a persistence job. |
| `expiry_reminder_days` column | Phase 4 | Phase 1 | No ALTER. |
| Acknowledgement due dates and overdue state | Phase 4 | Phase 3 | F-6 N-3 shrinks to a generator. |
| Audience/criteria matching | Phase 4 (for `mandatory_for`) | Phase 2 (for org-document targeting) | F-3 reuses, does not rebuild. |

### 3.5 No longer applicable (VOID)

| ID | Parent item | Why void |
|---|---|---|
| V-1 | Org setting: "Onboarding mandatory-document set" | `document_types.is_mandatory` + `mandatory_for` already express exactly this, per type, per org, with criteria. A parallel org-level set would be a second source of truth that could disagree with the type catalogue. **Only the completeness *threshold* becomes a setting (#78).** Business intent preserved: an org still decides which documents are mandatory for whom — through the type editor it already has (#14–#22). |
| V-2 | A stored recipient list for the new-upload-to-HR notice | HR membership is already derivable from `user_roles` (the query exists in `document_settings.service.countActiveHrUsers`). A stored list would drift as HR staff join and leave. F-6 N-1 resolves recipients at send time (§10 F-5). |
| V-3 | Manager "nudge" as a distinct entity (P3 §26.3 wording) | A nudge is a request without a record. Since F-1 gives managers real requests, a separate ephemeral nudge would be a second, unauditable path to the same outcome. Managers get #93 (raise) and #95 (cancel); re-reminding is HR-only (#85) to bound outbound email volume. Intent preserved, mechanism unified. |
| V-4 | A per-type "expiry reminders on/off" flag | The parent plan puts reminder *scheduling* on the type (`expiry_reminder_days`) and reminder *enablement* on the org (§11). A type-level on/off was never specified, and an empty `expiry_reminder_days` array already means "no expiry reminders for this type" (R-14). |

### 3.6 Contradictions found and how they are resolved

| ID | Contradiction | Resolution |
|---|---|---|
| K-1 | Parent §9 assigns the expiry *read-path* treatment to Phase 4; P1 shipped it. | Source wins. P4 plans only the write-path flip. Recorded in §3.3. |
| K-2 | Parent D-6 assigns `deleteObject` to Phase 4; P1 shipped it. | Source wins. |
| K-3 | Parent §11 lists "onboarding mandatory-document set" as a Phase-4 setting, but P1 shipped the same decision as type columns. | Type columns win (V-1). Only the threshold is a setting. |
| K-4 | Parent EC-13 is tagged Phase 4 "2/4", but P2's `syncRecipients` already dates new joiners from sync time. | EC-13 is discharged for the *acknowledgement* plane by P2. P4 discharges the remaining part: the **top-up must exist at all** for a new joiner to receive anything (F-8). |
| K-5 | Parent EC-11 requires type deactivation to be blocked when open requests exist, but `document_requests` did not exist in P1. | P1 could not implement it; the guard was absent, not waived. P4 adds it to `document_type.service.setActive` (R-9). This makes endpoint #22 able to return a new `409 DOCUMENT_TYPE_IN_USE` → contract change, §26.2. |
| K-6 | Parent §11 says "notification toggles per event"; P1 shipped no notification settings at all. | Five boolean toggles, one per event class, all defaulting **false** (§21). Defaulting off means deploying P4 sends zero email until an org opts in — the safe default for a feature whose failure mode is mass unsolicited mail to real employees. |
| K-7 | The parent plan implies the expiry *cron* is what makes expiry correct; P1's exit criteria say "nothing may assume a cron runs". | The cron is an optimisation for query cost and audit clarity, never a correctness dependency. Restated as a boundary in §1.4 and tested by T-21. |
| K-8 | P3 §26.3 lists "manager nudge" as deferred to P4/P5 without defining it. | Resolved as V-3. |

---

## 4. Dependency Analysis — P1 → P2 → P3 → P4

### 4.1 What P4 consumes from each phase

**From Phase 1 (employee-document plane):**
- `employee_documents` and its `status`, `expires_on`, `storage_key`, `deleted_at`, `document_type_id`,
  `user_id`, `version`, `group_id` columns — read by F-2, F-4, F-6 N-2, F-7.
- `document_types` — `is_mandatory`, `mandatory_for`, `expiry_reminder_days`, `retention_days`,
  `is_statutory`, `has_expiry`, `allows_multiple` — read by F-3, F-6, F-7.
- `document_upload.service.confirmUpload` and `linkReference` — **hooked** by F-2 (auto-fulfil) and
  F-6 N-1 (enqueue). Both hooks run inside the caller's existing transaction.
- `document_type.service.setActive` — **extended** by F-1 with the EC-11 guard.
- `employee_document.repository.findByIdForStorage` — the sole storage-key chokepoint. F-7 must **not**
  route its batch scan through it (a batch of 500 would break P2's "exactly three call sites" chokepoint
  test); F-7 adds `findSweepCandidates`, a separate, explicitly-justified storage-key reader (§19.2).
- `document_authority.utils` — extended with request action sets, not replaced.
- `document_audit.service.record / recordDetached` — every P4 state change writes through it.
- `document_settings.service` — extended with 8 keys.
- `utils/document_expiry.utils.toIstDateString` — the single source of "today" for every P4 job.

**From Phase 2 (org-document plane):**
- `document_targeting.utils.matchesCriteria / normaliseCriteria` — F-3's matcher.
- `document_recipient.service.syncRecipients` — F-8 calls it unchanged.
- `org_documents` + `org_documents_org_status_idx` — F-8's scan.
- `document_recipient.service.resolveAudience` — used transitively by `syncRecipients`; F-8 does not call
  it directly and must not, because `syncRecipients` owns the transaction and advisory-lock discipline.

**From Phase 3 (acknowledgement / signature plane):**
- `org_document_recipients.due_on`, `state`, and `org_document_recipients_org_due_idx` — F-6 N-3's scan.
- `document_compliance.utils.isOverdue / daysRemaining / resolveComplianceState` — F-6 N-3's predicate and
  F-3's compliance colouring.
- `document_settings.document_acknowledgement_due_days` — already consumed by P2/P3; F-6 reads it only to
  describe the deadline in email copy.

**From payroll (pattern reuse, no coupling):**
`payslip_dispatch.service` drain shape, `payroll_automation.service` sweeper shape,
`payroll_settings.repository.claimReminderWatermark` technique, `payroll_hr.routes` manual-trigger shape.
P4 **re-implements these shapes inside the document module**; it does not import payroll code.
Cross-module imports would couple two independently-evolving domains and were deliberately avoided in P1–P3.

### 4.2 Strict build order implied by the dependency graph

```
00053 migration
   |-- document_requests model + repository ------+
   |-- document_notifications model + repository -+
   +-- settings + recipient ALTERs ---------------+
                                                  |
pure utils (checklist, reminder, notification) ----+  (no DB - build these first)
                                                  |
   F-1 requests service/controllers/routes  <-----+
   F-3 checklist service                    <-----+ (needs types + profiles only)
   F-5 notification service (enqueue+drain) <-----+
        |
        |-- F-2 auto-fulfil hook        (needs F-1)
        |-- F-6 reminder generators     (needs F-1 for N-4, F-5 for all)
        |-- F-4 expiry cron             (needs only P1)
        |-- F-7 sweeper                 (needs only P1 + 00053 indexes)
        +-- F-8 top-up cron             (needs only P2)
                 |
                 +-- F-9 cron registration + manual triggers + startup catch-up
```

F-4, F-7 and F-8 have no dependency on F-1/F-5 and may land first if early value is wanted.
F-9 must land **last** because it registers jobs that must already exist.

### 4.3 What P4 must not disturb

| Component | Rule |
|---|---|
| `employee_document.repository.LIST_ATTRIBUTES` | Do not modify. F-7's sweep uses its own attribute list. |
| The three existing `findByIdForStorage` call sites | The count must stay three. F-7 uses a new method (§19.2). |
| `document_authority.utils.screenDocument` | Do not change the `infected`-only rule (D-g). |
| `resolveDisplayStatus` | Do not "simplify" it now that a cron persists the flip. It is the correctness guarantee (K-7). |
| `syncRecipients`' due-date derivation | Do not pass a publish date. It is EC-13's discharge (D-h). |
| `resolveEffectivePolicy` return shape | Do not widen it. New resolvers are separate functions (§3.3). |
| Mount order in `document.index.js` | New routers mount at the same three bases. Their literal prefixes (`/document-requests`, `/employees/:userId/document-requests`, `/employees/:userId/checklist`, `/me/document-requests`, `/me/checklist`, `/jobs`, `/notifications`) do not collide with any existing `:id` route, but each new router must mount immediately after its sibling plane router to keep the HR → manager → self grouping intact. |
| Existing response shapes #1–#79 | Unchanged, with the two additive exceptions in §26.2. |

---

## 5. Directory Structure

`NEW` = create · `MOD` = edit an existing file · everything else is untouched.

```
src/modules/document/
  document.index.js                                  MOD  mount 3 new routers
  models/
    document_requests.model.js                       NEW
    document_notifications.model.js                  NEW
    document_settings.model.js                       MOD  +8 columns
    org_document_recipients.model.js                 MOD  +2 columns
  repositories/
    document_request.repository.js                   NEW
    document_notification.repository.js              NEW
    employee_document.repository.js                  MOD  +findExpiryFlipCandidates, +findExpiryReminderCandidates,
                                                          +findSweepCandidates, +findAbandonedUploads,
                                                          +bulkExpire, +hardDeleteById, +findLiveByUserAndTypes
    org_document_recipient.repository.js             MOD  +findAckReminderCandidates, +claimReminderWatermark
    org_document.repository.js                       MOD  +findTopUpCandidates
    document_type.repository.js                      MOD  +findActiveForChecklist
  services/
    document_request.service.js                      NEW  F-1
    document_checklist.service.js                    NEW  F-3
    document_notification.service.js                 NEW  F-5 (enqueue + drain)
    document_automation.service.js                   NEW  F-4/F-6/F-7/F-8/F-9 job bodies + runStartupCatchUp
    document_upload.service.js                       MOD  F-2 fulfil hook + N-1 enqueue
    document_type.service.js                         MOD  EC-11 guard in setActive
    document_settings.service.js                     MOD  +8 mutable keys, +caps, +array validation
  utils/
    document_checklist.utils.js                      NEW  pure
    document_reminder.utils.js                       NEW  pure
    document_notification.utils.js                   NEW  pure
    document_defaults.js                             MOD  +defaults, +caps, +enums
    document_authority.utils.js                      MOD  +REQUEST_* action sets, +resolveRequestAuthority
  controllers/
    document_request_hr.controller.js                NEW  #80-#86
    document_request_manager.controller.js           NEW  #93-#96
    document_request_self.controller.js              NEW  #97-#98
    document_job_hr.controller.js                    NEW  #87-#92
  validators/
    document_request.validator.js                    NEW
    document_hr.validator.js                         MOD  settings keys + mandatory_for criteria schema
  routes/
    document_request_hr.routes.js                    NEW
    document_request_manager.routes.js               NEW
    document_request_self.routes.js                  NEW

src/cron-jobs/
  document_expiry_sweeper.cron.js                    NEW
  document_reminder.cron.js                          NEW
  document_notification_dispatch.cron.js             NEW
  document_sweeper.cron.js                           NEW
  document_recipient_topup.cron.js                   NEW

src/server.js                                        MOD  5 requires inside the linux guard + startup catch-up
src/common/utilities/email.utils.js                  MOD  +5 TEMPLATE_MAP entries, +sendDocumentNotificationEmail
src/common/templates/document_notification.html      NEW  one generic shell, five subjects

src/infrastructure/postgres-sql/migrations/
  00053-create-document-requests-and-notifications.js  NEW

tests/unit/document/
  document_checklist.utils.test.js                   NEW
  document_reminder.utils.test.js                    NEW
  document_notification.utils.test.js                NEW
  document_request.service.test.js                   NEW
  document_notification.service.test.js              NEW
  document_automation.service.test.js                NEW
  document_request.validator.test.js                 NEW
  document_authority.utils.test.js                   MOD  request action sets
  document_settings.service.test.js                  MOD  new keys + caps
  migration_00053.test.js                            NEW  static shape assertions

public/md_documents/DOCUMENTS_API_CONTRACT.md        NEW  (§28)
public/md_documents/phase4_completion_report.md      NEW  (§28)
public/md_updates/documents_phase4_requests_and_notifications_2026_09_XX.md  NEW  (§28)
public/md_settings/org_settings_registry.md          MOD  +#71-#78
public/md_system/api_registry.md                     MOD  +#80-#98
```

**Why four new controller files rather than extending the existing six.** The existing HR controller is
already the largest file in the module. Requests, checklists and job control are three distinct nouns with
three distinct authorization shapes (subject-scoped, subject-scoped, org-scoped-HR-only). Splitting follows
the module's existing controller-per-concern grain (`document_hr` / `org_document_hr` are already split the
same way) and keeps each file independently testable.

**Why one `document_automation.service.js` for five jobs rather than five services.** All five jobs share
the same per-org iteration skeleton, the same `CRON_ORG_LIMIT` bound, the same `toIstDateString` clock and
the same result-envelope shape. Payroll's precedent (`payroll_automation.service.js` hosts the sweeper, the
auto-draft and the calendar reminders together) is the house pattern. The notification **drain** lives in
`document_notification.service.js` instead, because it is the outbox's own machinery and is called by both
the cron and, in tests, directly.

---

## 6. Database Schema Changes & Migration `00053`

**File:** `src/infrastructure/postgres-sql/migrations/00053-create-document-requests-and-notifications.js`
**Applies after:** `00051`. See §25.1 for the ordering hand-back.
**Shape:** single `queryInterface.sequelize.transaction(async (t) => { … })` in `up`; `down` reverses in
exact inverse order. Follows `00049`'s idiom: `createTable` → `addIndex` for plain indexes →
`sequelize.query('CREATE …INDEX …')` for partial indexes → `sequelize.query('ALTER TABLE … ADD CONSTRAINT … CHECK …')`.

### 6.1 `document_requests` (new)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `org_id` | UUID | NO | — | FK → `organizations.id`, `ON DELETE CASCADE` |
| `user_id` | UUID | NO | — | subject employee; FK → `users.id`, `ON DELETE CASCADE` |
| `document_type_id` | UUID | NO | — | FK → `document_types.id`, `ON DELETE RESTRICT` |
| `note` | TEXT | YES | NULL | free text from the requester; max 1000 chars enforced at Joi |
| `due_on` | DATEONLY | NO | — | IST date |
| `status` | ENUM | NO | `'open'` | `enum_document_requests_status`: `open`, `fulfilled`, `cancelled`, `overdue` |
| `fulfilled_document_id` | UUID | YES | NULL | FK → `employee_documents.id`, `ON DELETE SET NULL` |
| `fulfilled_at` | TIMESTAMPTZ | YES | NULL | |
| `cancelled_at` | TIMESTAMPTZ | YES | NULL | |
| `cancelled_by` | UUID | YES | NULL | FK → `users.id`, `ON DELETE SET NULL` |
| `cancel_reason` | TEXT | YES | NULL | |
| `requested_by` | UUID | NO | — | FK → `users.id`, `ON DELETE RESTRICT` |
| `requested_by_role` | ENUM | NO | — | `enum_document_requests_requested_by_role`: `hr`, `manager` |
| `last_reminder_on` | DATEONLY | YES | NULL | per-entity reminder watermark (§17.3) |
| `reminder_count` | INTEGER | NO | `0` | capped by `DOCUMENT_REQUEST_MAX_REMINDERS` |
| `created_at` / `updated_at` | TIMESTAMPTZ | NO | `NOW()` | |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | paranoid; **only** written by the retention purge, never by a user action |

**`ON DELETE RESTRICT` on `document_type_id`** is deliberate: it is the database-level backstop for EC-11.
The service-level guard (R-9) blocks *deactivation*; the FK blocks *deletion*. Neither alone is sufficient —
the service guard can be bypassed by a direct DB edit, and the FK cannot express "deactivation".

**`ON DELETE SET NULL` on `fulfilled_document_id`** rather than `RESTRICT`: an employee may delete a
document they uploaded (subject to P1's rules), and that must not be blocked by a historical request record.
The request stays `fulfilled` with a null link; the audit trail retains the original document id.

### 6.2 `document_notifications` (new)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `org_id` | UUID | NO | — | FK → `organizations.id`, `ON DELETE CASCADE` |
| `event_type` | ENUM | NO | — | `enum_document_notifications_event_type`: `document_uploaded`, `document_expiring`, `acknowledgement_pending`, `document_request_raised`, `document_request_overdue` |
| `channel` | ENUM | NO | `'email'` | `enum_document_notifications_channel`: `email`. Single-valued today; the enum exists so a second channel is an enum add, not a table change. |
| `recipient_user_id` | UUID | YES | NULL | FK → `users.id`, `ON DELETE CASCADE` |
| `recipient_role` | STRING(30) | YES | NULL | e.g. `'hr'`; fan-out resolved at send time (V-2) |
| `subject_user_id` | UUID | YES | NULL | the employee the notice is *about*; FK → `users.id`, `ON DELETE CASCADE` |
| `entity_type` | STRING(50) | NO | — | `employee_document`, `org_document_recipient`, `document_request` |
| `entity_id` | UUID | NO | — | intentionally **not** an FK — the outbox must survive the purge of what it refers to |
| `dedupe_key` | STRING(200) | NO | — | see §17.2 |
| `payload` | JSONB | NO | `'{}'` | rendering inputs only; forbidden-key guarded (§13.5) |
| `status` | ENUM | NO | `'pending'` | `enum_document_notifications_status`: `pending`, `sending`, `sent`, `failed`, `skipped` |
| `attempts` | INTEGER | NO | `0` | consumed **at claim**, not at send (§17.4) |
| `last_error` | TEXT | YES | NULL | redacted (§18.4) |
| `scheduled_for` | TIMESTAMPTZ | NO | `NOW()` | the drain only claims rows whose `scheduled_for <= now()` |
| `claimed_at` | TIMESTAMPTZ | YES | NULL | staleness reclaim input |
| `sent_at` | TIMESTAMPTZ | YES | NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | NO | `NOW()` | |

**Not paranoid.** Like `document_audit_logs`, the outbox is an operational ledger. Rows are purged by age by
F-7 pass 3, not soft-deleted.

**`entity_id` is deliberately not a foreign key.** If a document is purged by retention while an unsent
notification still references it, an FK would either block the purge or cascade-delete evidence that a
notification was attempted. The drain resolves the entity at send time and marks the row `skipped` when the
entity has vanished (§18.3 E-6).

**CHECK constraint `document_notifications_recipient_ck`:**
```sql
ALTER TABLE "document_notifications"
  ADD CONSTRAINT "document_notifications_recipient_ck"
  CHECK ( ("recipient_user_id" IS NOT NULL)::int + ("recipient_role" IS NOT NULL)::int = 1 );
```
Exactly one addressing mode per row. This is what makes the O(1) enqueue on the hot upload path possible:
one row addressed to `recipient_role = 'hr'` instead of N rows addressed to N HR users.

### 6.3 `document_settings` — ALTER (8 columns)

All `NOT NULL` with defaults, so existing rows are backfilled by the default and no data migration runs.

| Column | Type | Default |
|---|---|---|
| `document_expiry_reminder_days` | `INTEGER[]` | `ARRAY[30,15,7]` |
| `document_notify_hr_on_upload` | BOOLEAN | `false` |
| `document_notify_expiry` | BOOLEAN | `false` |
| `document_notify_pending_acknowledgement` | BOOLEAN | `false` |
| `document_notify_request_raised` | BOOLEAN | `false` |
| `document_notify_request_overdue` | BOOLEAN | `false` |
| `document_request_default_due_days` | INTEGER | `7` |
| `document_onboarding_completeness_threshold` | INTEGER | `100` |

**CHECK constraints** (mirroring P1's practice of enforcing caps at all three layers — Joi, `SETTINGS_CAPS`,
and the database):
```sql
ALTER TABLE "document_settings"
  ADD CONSTRAINT "document_settings_request_due_days_ck"
    CHECK ("document_request_default_due_days" BETWEEN 1 AND 365),
  ADD CONSTRAINT "document_settings_completeness_threshold_ck"
    CHECK ("document_onboarding_completeness_threshold" BETWEEN 0 AND 100),
  ADD CONSTRAINT "document_settings_expiry_reminder_days_ck"
    CHECK (array_length("document_expiry_reminder_days", 1) IS NULL
           OR (array_length("document_expiry_reminder_days", 1) <= 6
               AND 0 <= ALL("document_expiry_reminder_days")
               AND 365 >= ALL("document_expiry_reminder_days")));
```
`array_length(…) IS NULL` admits the empty array, which means "no expiry reminders at org level" (R-14).

### 6.4 `org_document_recipients` — ALTER (2 columns)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `last_reminder_on` | DATEONLY | YES | NULL | per-recipient same-day claim watermark |
| `reminder_count` | INTEGER | NO | `0` | capped by `DOCUMENT_ACK_MAX_REMINDERS` |

These live on the recipient row rather than in a side table because the reminder decision is already a
per-recipient read and the claim must be atomic with it (§16 C-4).

### 6.5 Indexes created by `00053`

| Index | Table | Definition | Serves |
|---|---|---|---|
| `document_requests_open_unique_idx` | `document_requests` | `UNIQUE (org_id, user_id, document_type_id) WHERE status IN ('open','overdue') AND deleted_at IS NULL` | R-4 duplicate-request guard; also the EC-31 concurrency guard (C-1) |
| `document_requests_org_status_due_idx` | `document_requests` | `(org_id, status, due_on)` | the HR/manager list filters and the overdue flip scan |
| `document_requests_org_user_idx` | `document_requests` | `(org_id, user_id, status)` | the self list and the checklist join |
| `document_requests_reminder_idx` | `document_requests` | `(org_id, due_on) WHERE status = 'overdue' AND deleted_at IS NULL` | F-6 N-4's scan |
| `document_notifications_dedupe_unique_idx` | `document_notifications` | `UNIQUE (org_id, dedupe_key)` | §17.2 — the sole exactly-once guarantee for content-addressed notices |
| `document_notifications_drain_idx` | `document_notifications` | `(org_id, scheduled_for) WHERE status IN ('pending','sending')` | F-5's claim scan; stays small because sent/failed rows leave the partial index |
| `employee_documents_pending_upload_idx` | `employee_documents` | `(org_id, created_at) WHERE status = 'pending_upload'` | F-7 pass 1. **New index on a P1 table** — additive only, see §26.1 |
| `employee_documents_purge_idx` | `employee_documents` | `(org_id, deleted_at) WHERE deleted_at IS NOT NULL` | F-7 pass 2. Additive only |

**No index is created for the expiry scan** — `employee_documents_org_expiry_idx` from `00049` already
serves both F-4 and F-6 N-2, provided both queries include `status = 'available' AND expires_on IS NOT NULL`
verbatim so the planner can match the partial predicate. T-19 asserts the predicate text; the `EXPLAIN`
confirmation named in the parent's exit criteria is an operator step (§29 PR-11), not something this plan
claims to have performed.

**No index is created for the pending-acknowledgement scan** — `org_document_recipients_org_due_idx` from
`00050` already serves F-6 N-3, subject to P-6.

### 6.6 `down()` migration

`down` drops, in inverse order: the two `employee_documents` partial indexes, the four
`org_document_recipients`/`document_settings` constraint+column groups, `document_notifications`,
`document_requests`, and then the four new ENUM types
(`enum_document_requests_status`, `enum_document_requests_requested_by_role`,
`enum_document_notifications_event_type`, `enum_document_notifications_channel`,
`enum_document_notifications_status` — five in total). Dropping the two new columns from
`org_document_recipients` and the eight from `document_settings` is **destructive of configuration**, not of
evidence; that is acceptable for a `down` and is called out in §25.2.

---

## 7. Model Changes

### 7.1 `models/document_requests.model.js` (new)

Mirrors `employee_documents.model.js`'s conventions: `underscored: true`, `tableName: 'document_requests'`,
`paranoid: true`, `defaultScope` absent (P1 avoids default scopes so that repositories stay explicit).

Associations, registered in the same place the module's other associations are:
- `belongsTo(User, { as: 'subject', foreignKey: 'user_id' })`
- `belongsTo(User, { as: 'requester', foreignKey: 'requested_by' })`
- `belongsTo(DocumentType, { foreignKey: 'document_type_id' })`
- `belongsTo(EmployeeDocument, { as: 'fulfilledDocument', foreignKey: 'fulfilled_document_id' })`

### 7.2 `models/document_notifications.model.js` (new)

`paranoid: false`. No associations are declared for `entity_id` (§6.2). `recipient_user_id` gets a
`belongsTo(User, { as: 'recipient' })` so the drain can resolve an email in one query.

### 7.3 `models/document_settings.model.js` (MOD)

Add the 8 columns from §6.3 with model-level defaults identical to the DB defaults, so that a row created
through `getOrCreate` before the migration's defaults are observed still lands on the same values.
`document_expiry_reminder_days` is `DataTypes.ARRAY(DataTypes.INTEGER)`, matching how
`document_types.expiry_reminder_days` is already declared.

### 7.4 `models/org_document_recipients.model.js` (MOD)

Add `last_reminder_on: DATEONLY` and `reminder_count: INTEGER NOT NULL DEFAULT 0`.
**These two columns must not appear in any recipient projection returned to a non-HR caller.** P3's
recipient list projections enumerate attributes explicitly, so this is satisfied by not adding them; T-24
asserts it.

---

## 8. Core Logic — pure, DB-free utilities

Following the module's established discipline, all decision logic lands in pure modules that are unit-tested
with no database. Each function below is total (never throws for in-range input), deterministic, and takes
its clock as a parameter.

### 8.1 `utils/document_checklist.utils.js` (new)

```
resolveRequiredTypes(types, profile) -> Array<type>
```
Filters `types` to those with `is_mandatory === true` **and** `matchesCriteria(normaliseCriteria(type.mandatory_for), profile)`.
`profile` is `{ user_id, department_id, location_id, employment_type, job_status }` — the exact shape
`matchesCriteria` already consumes (P-11). An empty/`{}` `mandatory_for` means "mandatory for everyone",
because `isOrgWide({})` is already true in P2's semantics; this keeps one meaning of "no criteria" across
both document planes.

```
classifyChecklistItem(type, liveDocs, openRequests, todayIst) -> { state, document_id, request_id, expires_on }
```
`state` is one of `satisfied | expiring | expired | pending_upload | requested | missing`, decided in this
order:
1. a live doc of that type exists and `resolveDisplayStatus(doc, todayIst) === 'expired'` → `expired`
2. a live doc exists, has `expires_on`, and `daysUntil <= min(effective schedule)` → `expiring`
3. a live doc exists in `available` or `pending_verification` → `satisfied`
4. a row exists in `pending_upload` → `pending_upload`
5. an `open`/`overdue` request exists → `requested`
6. otherwise → `missing`

Rule ordering matters: `expired` outranks `satisfied` so that EC-25 (a document uploaded already past its
expiry date) is never counted as complete.

```
computeCompleteness(items) -> { required, satisfied, percent }
```
`percent = required === 0 ? 100 : round(satisfied / required * 100)`. `satisfied` counts only `satisfied`
and `expiring`. **Integer rounding is half-up and the value is clamped to [0,100]**; when `required > 0` and
`satisfied < required`, the result is capped at 99 so that "99%" never means "done" — a 199/200 rounding to
100% would defeat the threshold check (R-19).

### 8.2 `utils/document_reminder.utils.js` (new)

```
resolveExpirySchedule(type, settings) -> number[]
```
Effective schedule = `type.expiry_reminder_days` when it is a non-empty array, else
`settings.document_expiry_reminder_days`. Returns a **descending, de-duplicated, non-negative** array.
Type overrides org; an explicitly empty type array means "this type never reminds" (R-14), which is why the
check is "non-empty array" rather than "array is present".

```
resolveReminderBucket(expiresOn, todayIst, schedule) -> number | null
```
`daysUntil = dateDiff(expiresOn, todayIst)`. If `daysUntil < 0` → `null` (already expired; F-4 owns it, not
the reminder). Otherwise return `min{ o ∈ schedule : o >= daysUntil }`, or `null` when no offset qualifies.

This single definition is what satisfies **both halves** of the parent's exit criterion:
- *A missed cron day does not lose a reminder.* If the job does not run on the D-30 day, then on D-29 the
  bucket is still `30` (the smallest offset ≥ 29), so the D-30 reminder is emitted one day late rather than
  never.
- *A missed cron day does not send a stale one.* Once the job runs and the D-30 notice is recorded under
  `expiry:{docId}:30`, every subsequent day until D-15 resolves to bucket `30` again and the unique dedupe
  index rejects the second insert. No catch-up burst, no duplicate.
- *No duplicate on a same-day double-fire.* Same mechanism — the key is content-addressed, not time-addressed.

```
resolveRetentionDays(type, settings) -> number
```
`max(type.retention_days ?? settings.document_retention_days, settings.document_retention_days)` — see R-26.

```
retentionCutoff(todayIst, retentionDays) -> ISO date string
```

```
isAbandonedUpload(row, nowMs, graceMs) -> boolean
```
`row.status === 'pending_upload' && nowMs - row.created_at >= graceMs`, with `graceMs` defaulting to 24 h
per the parent plan. Note this is **not** the same predicate as P1's `isStaleUpload`, which uses the
*upload-URL TTL* (600 s default) and is correct for its inline use; the sweeper uses the longer 24 h grace so
that a slow but genuine client is never reaped mid-upload. Both predicates coexist deliberately; T-16 pins
the distinction.

### 8.3 `utils/document_notification.utils.js` (new)

```
DEDUPE_BUILDERS = {
  document_uploaded:        (d) => `upload:${d.documentId}`,
  document_expiring:        (d) => `expiry:${d.documentId}:${d.bucket}`,
  acknowledgement_pending:  (d) => `ack:${d.recipientId}:${d.onDate}`,
  document_request_raised:  (d) => `request:${d.requestId}`,
  document_request_overdue: (d) => `reqoverdue:${d.requestId}:${d.onDate}`
}
```
Two families, deliberately different (§17.2):
- **Content-addressed** (`document_uploaded`, `document_expiring`, `document_request_raised`) — the key
  encodes *what happened*; the unique index alone gives exactly-once for all time.
- **Cadence-addressed** (`acknowledgement_pending`, `document_request_overdue`) — the key encodes
  *what + which day*; these are recurring nags, so the key must admit tomorrow's while rejecting today's
  second attempt. The per-entity `last_reminder_on` watermark is the primary guard and the dated key is the
  backstop; either alone would be sufficient, and having both means a watermark write that loses a race
  still cannot produce a duplicate email.

```
NOTIFICATION_FORBIDDEN_KEYS = ['storage_key', 'document_number', 'reference_url', 'password', 'token']
assertPayloadClean(payload) -> throws AppError(500, …, 'NOTIFICATION_PAYLOAD_UNSAFE')
buildPayload(eventType, input) -> object   // whitelist-built, then assertPayloadClean'd
```
`buildPayload` constructs from an explicit per-event whitelist rather than filtering an arbitrary object;
`assertPayloadClean` is the belt-and-braces assertion that runs in the enqueue path in all environments.
The forbidden-key list is duplicated from `document_audit.service.SCRUBBED_KEYS` rather than imported,
because that constant is not exported and exporting it would mean editing the audit service — out of scope
under §4.3. T-13 asserts the duplicated list is a superset of the audit list by literal value, so the two
cannot silently drift.

```
redactError(err) -> string   // message only, truncated to 500 chars, email addresses masked
```
Reuses payroll's dispatch redaction regex shape (local re-implementation, per §4.1).

### 8.4 `utils/document_defaults.js` (MOD)

Additions only — no existing constant changes value.

```
DOCUMENT_SETTINGS_DEFAULTS += {
  document_expiry_reminder_days: [30, 15, 7],
  document_notify_hr_on_upload: false,
  document_notify_expiry: false,
  document_notify_pending_acknowledgement: false,
  document_notify_request_raised: false,
  document_notify_request_overdue: false,
  document_request_default_due_days: 7,
  document_onboarding_completeness_threshold: 100
}

SETTINGS_CAPS += {
  document_request_default_due_days: { min: 1, max: 365 },
  document_onboarding_completeness_threshold: { min: 0, max: 100 }
}

DOCUMENT_REQUEST_STATUS = { OPEN:'open', FULFILLED:'fulfilled', CANCELLED:'cancelled', OVERDUE:'overdue' }
DOCUMENT_REQUEST_OPEN_STATUSES = ['open', 'overdue']
NOTIFICATION_EVENT = { … five values … }
NOTIFICATION_STATUS = { PENDING, SENDING, SENT, FAILED, SKIPPED }

EXPIRY_REMINDER_DAYS_MAX_ENTRIES = 6
EXPIRY_REMINDER_DAY_MAX = 365
DOCUMENT_REQUEST_MAX_REMINDERS = 5
DOCUMENT_ACK_MAX_REMINDERS = 5
NOTIFICATION_MAX_ATTEMPTS = 5
NOTIFICATION_STALE_MS = 600000          // 10 min, matches PAYSLIP_EMAIL_STALE_MS
NOTIFICATION_DISPATCH_BATCH = 200
NOTIFICATION_RETENTION_DAYS = 90
EMAIL_SEND_TIMEOUT_MS = 15000
CRON_ORG_LIMIT = 100
SWEEP_BATCH = 500
EXPIRY_FLIP_BATCH = 1000
ABANDONED_UPLOAD_GRACE_MS = 86400000    // 24 h, parent plan
REMINDER_SCAN_BATCH = 500
```

`DOCUMENT_REQUEST_OPEN_STATUSES` is a single exported constant because five separate call sites
(the duplicate guard, the EC-11 type guard, the checklist join, the overdue flip and the cancel guard) must
agree on whether `overdue` still counts as open. It does — an overdue request is an open request past its
date, not a closed one.

### 8.5 `utils/document_authority.utils.js` (MOD)

Additions, following the file's existing `resolveXAuthority(actor, row, ctx) -> { allowed, reason }` shape:

```
REQUEST_WRITE_ACTIONS = { create: true, cancel: true, remind: true }
REQUEST_READ_ACTIONS  = { view: true }
resolveRequestAuthority(action, { actorRole, isSubject, isRequester, inManagerScope, status, settings })
```
Rules encoded (all restated as R-5…R-8 in §12):
- `hr` may do everything on any request in the org.
- `manager` may `create` only when `inManagerScope`; may `cancel` only when `inManagerScope` **and**
  `isRequester`; may `view` only when `inManagerScope`; may never `remind`.
- The subject employee may `view` their own requests and nothing else.
- No action other than `view` is permitted on a `fulfilled` or `cancelled` request.

---

## 9. Layer Responsibilities

| Layer | Owns | Must not |
|---|---|---|
| **Routes** | Path, HTTP verb, auth middleware chain, role gate, `asyncHandler` wrapping. | Contain any conditional logic. |
| **Controllers** | Reading `req.params` / `req.body` / `req.query`; **validating query inside the controller with `validateOrThrow`** (Express 5 makes `req.query` getter-only, so it cannot be reassigned by middleware); resolving manager scope via `getAccessibleUserIds`; choosing the denial shape (404 for `/:id`, 403 for `/:userId`); shaping the HTTP response. | Open transactions, touch models, or build SQL. |
| **Services** | Transaction boundaries, advisory locks, invariant enforcement, audit writes, notification enqueues, orchestration across repositories. | Read `req`, format HTTP responses, or know about status codes beyond throwing `AppError`. |
| **Repositories** | Every model access, every explicit attribute list, every `FOR UPDATE`, every raw SQL. Accept and pass through `transaction`. | Contain business rules, decide authorization, or write audit rows. |
| **Pure utils** | All decisions: schedules, buckets, classifications, dedupe keys, authority. | Import `db`, `s3`, or anything with I/O. |
| **Cron files** | A `cron.schedule(expr, fn, { timezone: 'Asia/Kolkata' })` registration and nothing else. | Contain job logic — they call `document_automation.service`. |
| **Storage adapter** | `deleteObject(key)` only, for P4. | Be called from anywhere but `document_automation.service`'s sweeper. |

### 9.1 Service-by-service responsibilities

**`document_request.service.js`**
`create` · `createFromChecklist` · `list` · `getById` · `cancel` · `remind` · `fulfilIfOpen(userId, typeId, documentId, actor, t)` · `assertNoOpenRequestsForType(orgId, typeId, t)`.
Owns the `document_requests` transaction boundary. `fulfilIfOpen` is the only method that is called from
*another* service (`document_upload`), and it is explicitly designed to be transaction-passive: it takes the
caller's transaction, never opens one, and never commits.

**`document_checklist.service.js`**
`forUser(orgId, userId, actor)` · `forUsers(orgId, userIds)` (batched, used by F-6 N-4's copy and by any
future bulk surface). Read-only; opens no transaction; writes only a `recordDetached` audit entry for the
HR-plane read of another employee's checklist (consistent with P1's treatment of confidential reads).

**`document_notification.service.js`**
`enqueue(entry, transaction)` — requires a transaction, exactly like `document_audit.record`, because an
enqueue is only meaningful if the business change it announces commits.
`enqueueDetached(entry)` — for generators that have no business transaction of their own.
`drain({ orgId, limit })` — the CLAIM → SEND → RECORD loop.
`purgeOld(orgId, cutoff)` — called by F-7 pass 3.

**`document_automation.service.js`**
`runExpiryFlip(opts)` · `runReminders(opts)` · `runNotificationDispatch(opts)` · `runSweeper(opts)` ·
`runRecipientTopUp(opts)` · `runStartupCatchUp()`.
Each returns a plain result envelope `{ ok, orgs_scanned, … , errors: [] }` used both by the cron's log line
and by the manual-trigger endpoints' response bodies.

**`document_upload.service.js` (MOD)** — two hooks, both inside the existing transaction, both after the
document row reaches a live status:
1. `await documentRequestService.fulfilIfOpen(…, t)` (F-2)
2. `await notificationService.enqueue({ event_type: 'document_uploaded', … }, t)` (F-6 N-1)
Neither hook may throw a business error that aborts the upload — see §18.2 for the containment rule.

**`document_type.service.js` (MOD)** — `setActive(id, false)` first calls
`documentRequestService.assertNoOpenRequestsForType(orgId, typeId, t)` inside its existing transaction.

**`document_settings.service.js` (MOD)** — `MUTABLE_FIELDS` grows from 13 to 21; `assertCap` gains the two
new numeric caps; a new `assertReminderSchedule` validates the integer array (length ≤ 6, each value
0…365, no duplicates after normalisation). No new guard of the `SCAN_PROVIDER_NOT_CONFIGURED` kind is
needed: every new toggle is safe to enable at any time, because enabling a toggle only starts *sending*,
never starts *state transitions* (R-16).

---

## 10. Feature Dossiers

Each dossier follows the Implementation-Ready chain:
**Requirement → Existing Dependency → Database Impact → API Impact → Business Logic → Validation →
Authorization → Storage/File Impact → Failure Handling → Testing → Acceptance Criteria.**
Where a link does not apply, it says so explicitly rather than being omitted.

---

### F-1 — Document Requests

**Requirement.** HR or a manager formally asks a named employee for a named document type by a due date.
The request has the lifecycle `open → fulfilled | cancelled` with `open → overdue` as a time-driven
intermediate. Fulfilment links the request to the document that satisfied it.

**Existing dependency.**
`document_types` (the type must exist, be active, and be visible to the requester's plane) ·
`getAccessibleUserIds` for manager scoping (D-m) · `document_audit.service.record` (D-k) ·
`document_settings.getOrCreate` for `document_request_default_due_days` · `AppError` and the module's
existing denial discipline (D-l). Nothing is rebuilt.

**Database impact.** New table `document_requests` (§6.1) with four indexes (§6.5). No change to any
existing table. The `ON DELETE RESTRICT` on `document_type_id` is the EC-11 backstop.

**API impact.** Nine new endpoints — HR #80, #81, #82, #83, #84, #85; manager #93, #94, #95; self #97.
One existing endpoint gains a new failure mode: #22 (deactivate type) can now return
`409 DOCUMENT_TYPE_IN_USE` (§26.2). No existing success response shape changes.

**Business logic.**
- `create(orgId, userId, { document_type_id, due_on, note }, actor)`:
  1. open transaction;
  2. load the type `FOR SHARE` and assert `is_active = true` and that the actor's plane may request it
     (`resolveEffectivePolicy(type, settings).managerCanRequest` for managers; HR is unconditional);
  3. assert the subject is an active employee of the org;
  4. `due_on` defaults to `today + document_request_default_due_days` when absent;
  5. **short-circuit**: if a live document of that type already satisfies the request (R-3), return
     `409 DOCUMENT_ALREADY_PRESENT` rather than creating a request nobody can fulfil;
  6. insert; a unique-violation on `document_requests_open_unique_idx` is translated to
     `409 DUPLICATE_REQUEST` carrying the existing request's id;
  7. audit `document_request.created`;
  8. enqueue `document_request_raised` inside the same transaction;
  9. commit.
- `createFromChecklist(orgId, userId, actor)`: computes the checklist (F-3), takes the items in state
  `missing` or `expired`, and creates one request per item **in a single transaction**, skipping (not
  failing on) any item that already has an open request. Returns `{ created: [...], skipped: [...] }`.
  Bounded at 50 items per call.
- `cancel(id, { reason }, actor)`: `SELECT … FOR UPDATE`; reject unless `status IN ('open','overdue')`
  with `409 REQUEST_NOT_OPEN`; set `cancelled`, `cancelled_at`, `cancelled_by`, `cancel_reason`; audit.
- `remind(id, actor)` (HR only): claims the same-day watermark on the request row (§17.3) and enqueues a
  `document_request_overdue` notice; if the watermark is already today's, returns `200` with
  `{ reminded: false, reason: 'already_reminded_today' }` rather than an error — a double-click must not
  look like a failure.
- `fulfilIfOpen(orgId, userId, typeId, documentId, actor, t)`: see F-2.
- `assertNoOpenRequestsForType(orgId, typeId, t)`: `COUNT(*) WHERE status IN ('open','overdue')`;
  throws `409 DOCUMENT_TYPE_IN_USE` with the count.

**Validation.**
`document_type_id` UUID required · `due_on` ISO date, `>= today` (IST), `<= today + 365` ·
`note` string, ≤ 1000 chars, trimmed, optional · `cancel_reason` ≤ 500 chars, required on cancel ·
list filters: `status` (enum, repeatable), `user_id` (UUID), `document_type_id` (UUID), `overdue_only`
(boolean), `page`/`limit` (limit ≤ 100, default 20). Query validation happens **in the controller** via
`validateOrThrow` because `req.query` is getter-only in Express 5.

**Authorization.** `resolveRequestAuthority` (§8.5). Manager list and create are additionally constrained
to `getAccessibleUserIds`; a `null` scope grants nothing (D-m). Addressing-mode denial discipline:
`/document-requests/:id` returns a byte-identical `404 REQUEST_NOT_FOUND` whether the row is absent or
out of scope; `/employees/:userId/document-requests` returns `403 FORBIDDEN` when the user is outside scope.

**Storage/file impact.** **Not applicable.** A request references a document type, never an object. No
storage key is read, written, or returned on any request surface.

**Failure handling.** Unique-violation → `409 DUPLICATE_REQUEST` (never a 500). Type FK violation →
`404 DOCUMENT_TYPE_NOT_FOUND`. Any throw rolls the transaction back; `if (!t.finished) await t.rollback()`
in every catch. The notification enqueue in step 8 is contained (§18.2): a queue failure must not lose the
request.

**Testing.** T-1 (service, all six methods), T-2 (validator), T-3 (authority matrix), T-4 (duplicate-guard
translation), T-5 (EC-11 guard), T-27 (concurrent create).

**Acceptance criteria.**
1. Two HR users creating the same (employee, type) request concurrently produce exactly one row and one
   `409 DUPLICATE_REQUEST`.
2. A manager cannot create a request for an employee outside their scope, and the denial is `403`.
3. A manager cannot cancel a request they did not raise.
4. Deactivating a type with one open request returns `409 DOCUMENT_TYPE_IN_USE` and the type stays active.
5. `due_on` in the past is rejected at validation, not at the database.
6. Cancelling a `fulfilled` request returns `409 REQUEST_NOT_OPEN` and changes nothing.

---

### F-2 — Auto-fulfilment on upload

**Requirement.** Parent §9: the request "links to the uploaded document on fulfilment" and the exit
criterion "a fulfilled request closes automatically on upload".

**Existing dependency.** `document_upload.service.confirmUpload` and `linkReference` — both already run
inside an unmanaged transaction that ends with the document row in a live status. F-2 adds one call inside
each, immediately before the existing audit write.

**Database impact.** No schema change beyond F-1's table. The write is
`UPDATE document_requests SET status='fulfilled', fulfilled_document_id=:id, fulfilled_at=NOW() WHERE org_id=:o AND user_id=:u AND document_type_id=:tt AND status IN ('open','overdue') AND deleted_at IS NULL`
— a single guarded statement, no prior SELECT, so it is race-free by construction.

**API impact.** Additive: the confirm and link responses gain `fulfilled_request_id: string | null`
(§26.2). No field is removed or retyped.

**Business logic.** The guarded UPDATE uses `RETURNING id` and returns at most one id — the partial unique
index guarantees at most one open request per (org, user, type), so "at most one" is a database property,
not an application assumption. When a row is returned, an audit entry `document_request.fulfilled` is
written with `actor = the uploader` and `metadata = { document_id, auto: true }`. When no row is returned,
nothing happens and no audit entry is written — an upload with no outstanding request is the normal case
and must not generate audit noise.

**Validation.** **Not applicable** — F-2 has no external input; its inputs are the already-validated
parameters of the calling upload path.

**Authorization.** **Not applicable as a separate check.** The caller has already been authorized to
upload a document of this type for this user; fulfilment is a consequence, not an action the caller
requests. Notably, an employee uploading their own document closes an HR-raised request — which is the
intended behaviour and is why fulfilment is not gated on the uploader's role.

**Storage/file impact.** **Not applicable** — F-2 runs after the storage handshake completes and touches
no object.

**Failure handling.** The UPDATE runs inside the upload's existing transaction. If it throws, the upload
rolls back — which is correct: a document row that exists while its request still says `open` would be a
silent compliance lie, and the client can retry the confirm (which is idempotent in P1). This is the one
place in P4 where a hook is *allowed* to fail its caller; it is a single-statement UPDATE against an
indexed predicate, so its failure modes are the same as the transaction's own.

**Testing.** T-6 (fulfils an open request), T-7 (fulfils an `overdue` request), T-8 (no-op with no request,
no audit row), T-9 (a second confirm of the same document does not double-fulfil or re-audit),
T-10 (fulfilment is visible in the same transaction as the document).

**Acceptance criteria.**
1. Uploading a document of the requested type closes the request in the same transaction, with
   `fulfilled_document_id` set.
2. An `overdue` request is closed by an upload just as an `open` one is.
3. An upload with no matching request writes no `document_request.*` audit row.
4. Rolling back the upload leaves the request `open`.

---

### F-3 — Required-document checklist and onboarding completeness

**Requirement.** Parent §9: "Required-document checklist per employee, derived from `type.is_mandatory` +
`mandatory_for` matched against the employee's profile; onboarding completeness percentage."

**Existing dependency.** `document_types.is_mandatory` / `mandatory_for` (D-e, stored since P1, never
read) · `document_targeting.utils.matchesCriteria` + `normaliseCriteria` (D-i) ·
`employee_profiles.department_id` / `location_id` / `employment_type` / `job_status` (P-17) ·
`resolveDisplayStatus` for expiry state (D-c) · `employee_document.repository.findLiveByUserAndType`
(extended to `findLiveByUserAndTypes`, plural, so the checklist is one query, not N).

**Database impact.** **No schema change.** Three reads: active types for the org, the employee's profile,
the employee's live documents for the required type ids, plus open requests for those type ids.
All four hit existing indexes.

**API impact.** Three new endpoints — HR #86, manager #96, self #98. Response:
```json
{
  "user_id": "…",
  "completeness": { "required": 6, "satisfied": 5, "percent": 83, "threshold": 100, "meets_threshold": false },
  "items": [
    { "document_type_id":"…", "name":"Aadhaar", "is_statutory":true, "state":"satisfied",
      "document_id":"…", "expires_on":"2027-03-01", "days_until_expiry":158, "request_id":null }
  ]
}
```
`document_number` is **never** present; `storage_key` is never present. `document_id` is present because
every plane that can see the checklist can already see that document's detail endpoint — except where the
type is confidential and the caller is a manager, in which case `document_id` is nulled and `state` is
reported as `satisfied` without a link (R-21).

**Business logic.** `resolveRequiredTypes` → `findLiveByUserAndTypes` → `findOpenRequestsByTypes` →
`classifyChecklistItem` per type → `computeCompleteness`. All decisions are in the pure util (§8.1); the
service is orchestration only. Types are fetched once per (org, request) and not cached across requests —
a cache would have to be invalidated on every type edit and the query is a single indexed read.

**Validation.** `:userId` UUID. No body. **No query parameters** — the checklist is not filterable or
paginated; it is bounded by the number of mandatory types in the org, which is bounded by the type
catalogue.

**Authorization.** HR: any employee in the org. Manager: only `getAccessibleUserIds`, denial `403`.
Self: own only, at `/me/checklist` with no id in the path at all. Confidential types are included in the
manager's checklist (the manager must know a document is missing) but the `document_id` link is withheld
(R-21) — the existing `resolveEffectivePolicy(type, settings).managerCanView` decides this, so no new
policy concept is introduced.

**Storage/file impact.** **Not applicable** — the checklist reports existence and expiry, never keys or URLs.

**Failure handling.** A profile row missing for the user → treat all profile-derived criteria as
non-matching, which yields the *smallest* required set. Chosen over throwing because a checklist that
errors is worse than one that under-reports for an employee whose profile is mid-setup, and the HR plane
already surfaces profile completeness separately. The response includes
`"profile_incomplete": true` in that case so the caller can say why.

**Testing.** T-11 (pure classification, all six states incl. EC-25 ordering), T-12 (completeness rounding
and the 99% cap), T-25 (confidential-type link withholding), T-26 (missing profile).

**Acceptance criteria.**
1. A type with `is_mandatory=false` never appears, regardless of `mandatory_for`.
2. A type with `is_mandatory=true` and `mandatory_for={}` appears for every employee.
3. A type restricted to `target_departments:[X]` appears only for employees whose `department_id` is X —
   matched on `department_id`, never on the free-text `department`.
4. A document uploaded with an already-past `expires_on` is `expired`, not `satisfied`, and does not count
   toward completeness (EC-25).
5. `percent` is 100 only when every required item is satisfied.

---

### F-4 — Expiry engine (persistence)

**Requirement.** Parent §9: "daily cron flips `available → expired`; read paths also treat
`expires_on < today` as expired."

**Existing dependency.** `resolveDisplayStatus` already implements the read half (D-c) — **do not touch it**
(§4.3). `employee_documents_org_expiry_idx` already exists (D-b). `toIstDateString` supplies the clock.

**Database impact.** **No schema change.** One statement per batch:
```sql
UPDATE employee_documents
   SET status = 'expired', updated_at = NOW()
 WHERE id IN (
   SELECT id FROM employee_documents
    WHERE org_id = :orgId
      AND status = 'available'
      AND expires_on IS NOT NULL
      AND expires_on < :todayIst
      AND deleted_at IS NULL
    ORDER BY expires_on
    LIMIT :batch
    FOR UPDATE SKIP LOCKED
 )
 RETURNING id, user_id, document_type_id;
```
The inner predicate is written to match `employee_documents_org_expiry_idx`'s partial predicate verbatim.
`FOR UPDATE SKIP LOCKED` means two instances running the job concurrently divide the work instead of
blocking, and neither can flip the same row twice.

**API impact.** One new endpoint, #88 (`POST /hr/jobs/expiry-sweep/run`). **No read endpoint's output
changes** — every read already reported `expired` for these rows before the flip (K-7). This is the central
backward-compatibility property of F-4.

**Business logic.** Per org (bounded by `CRON_ORG_LIMIT`), loop the batched UPDATE until it returns fewer
than `EXPIRY_FLIP_BATCH` rows or a per-org cap of 20 batches is reached. Each batch is its own transaction.
Audit: one `employee_document.expired` entry per flipped row, written in the same batch transaction, with
`metadata = { expires_on, source: 'cron' }` — the row count is bounded by the batch size, so the audit
write is bounded too. **No notification is enqueued by F-4**: expiry reminders are anticipatory (F-6 N-2)
and firing a notice at the moment of expiry would duplicate the D-0 bucket if `0` is in the schedule.

**Validation.** **Not applicable** for the cron. For #88: optional `org_id` body field (HR may only pass
their own org; the field exists for symmetry with the payroll triggers and is ignored if it does not match).

**Authorization.** #88 is `hr`-only. Platform roles (`admin`, `super-admin`) are denied — they have no
tenant data access (D-10). The cron itself runs with no actor; its audit entries record
`actor_user_id = NULL, actor_role = 'system'`, matching how P1 records system-attributed entries.

**Storage/file impact.** **Not applicable** — expiry changes a status column only. The object stays;
retention (F-7), not expiry, decides deletion. A user may still need to download an expired passport.

**Failure handling.** A batch failure rolls back that batch only; the loop records the error in the result
envelope and continues to the next org. Because the predicate is idempotent (`status='available'`), a
failed batch is simply re-attempted on the next run — there is no partial-flip state to repair.

**Testing.** T-17 (batching and loop termination), T-18 (idempotent second run flips zero rows),
T-19 (predicate text matches the index predicate — asserted against the migration source string),
T-21 (a read of a past-expiry `available` row reports `expired` **before** the cron runs).

**Acceptance criteria.**
1. Running the job twice on the same day flips rows the first time and zero rows the second.
2. A row with `expires_on = today` is **not** flipped (expiry is end-of-day inclusive; `< today`, not `<=`).
3. A soft-deleted row is never flipped.
4. A `pending_verification` row with a past `expires_on` is not flipped (only `available` is in scope),
   and is still *reported* as expired by `resolveDisplayStatus`.

---

### F-5 — Notification outbox and drain

**Requirement.** Parent §9 / D-16: a `document_notifications` outbox filled transactionally by business
operations and drained by a cron that sends email outside any transaction.

**Existing dependency.** The queue-and-drain pattern from `payslip_dispatch.service` (D-p) — re-implemented
locally, not imported (§4.1). `email.utils` and its `TEMPLATE_MAP` (P-16). `AppError`. `document_audit.service`.

**Database impact.** New table `document_notifications` (§6.2) with the unique dedupe index and the
partial drain index (§6.5).

**API impact.** Two new endpoints: #87 (`GET /hr/notifications`, an observability list) and #90
(`POST /hr/jobs/notification-dispatch/run`). #87 returns `event_type`, `status`, `attempts`,
`scheduled_for`, `sent_at`, `last_error`, `entity_type`, `entity_id`, the **masked** recipient
(local-part-truncated email or the role name) and `payload` — which is safe to return only because
`buildPayload` whitelists it (§8.3). It does **not** return `dedupe_key`, to avoid handing a caller the
exact string needed to pre-poison the unique index.

**Business logic — enqueue.**
```
INSERT INTO document_notifications (…) VALUES (…) ON CONFLICT (org_id, dedupe_key) DO NOTHING RETURNING id
```
`ON CONFLICT DO NOTHING` is **mandatory, not an optimisation**. An enqueue runs inside a business
transaction (an upload, a request creation). If a duplicate key raised a unique-violation, PostgreSQL would
mark the whole transaction as aborted and the upload would fail because a *duplicate email was avoided* —
an absurd and production-hostile coupling. `DO NOTHING` returns zero rows and the business transaction
continues untouched. This is the single most important line in F-5.

The enqueue is also gated on the settings toggle for its event type: `enqueue` loads settings (from the
caller's already-loaded settings object where one is available, to avoid a second read on the upload hot
path) and returns `{ enqueued: false, reason: 'disabled' }` without inserting when the toggle is off.
Gating at enqueue rather than at send keeps the outbox free of rows that will never be sent.

**Business logic — drain.** Three transactions per row, exactly as payroll does:

1. **CLAIM** — one transaction, one statement:
```sql
UPDATE document_notifications
   SET status='sending', attempts = attempts + 1, claimed_at = NOW()
 WHERE id IN (
   SELECT id FROM document_notifications
    WHERE org_id = :orgId
      AND scheduled_for <= NOW()
      AND ( status = 'pending'
            OR (status = 'sending' AND claimed_at < NOW() - :staleMs * INTERVAL '1 millisecond') )
      AND attempts < :maxAttempts
    ORDER BY scheduled_for
    LIMIT :batch
    FOR UPDATE SKIP LOCKED )
 RETURNING *;
```
Attempts are consumed **at claim**, so a process that dies mid-send still burns an attempt and a poison row
cannot loop forever. `SKIP LOCKED` plus the stale-reclaim clause make the drain safe to run on N instances.

2. **SEND** — **outside any transaction**, with `EMAIL_SEND_TIMEOUT_MS` wrapped via `Promise.race`.
   Recipient resolution happens here, not at enqueue (V-2): `recipient_user_id` → one address;
   `recipient_role` → the active users holding that role right now. A row addressed to a role sends
   sequentially to each address.

3. **RECORD** — one transaction per row: `sent` + `sent_at` on success; on failure `pending` with
   `last_error = redactError(e)` and `scheduled_for = NOW() + backoff(attempts)` when `attempts < max`,
   else `failed`. Backoff is `min(2^attempts, 60) minutes`. A `recordDetached` audit entry
   `document_notification.sent` / `.failed` is written here.

Role fan-out partial success: a row is `sent` only when every address succeeded; otherwise it is retried and
the already-delivered addresses receive a duplicate. This is a conscious trade — bounded by
`NOTIFICATION_MAX_ATTEMPTS = 5` and applying only to the HR fan-out, where a duplicate is an annoyance and a
miss is a compliance gap. It is stated here so nobody discovers it in production and calls it a bug.

**Validation.** `enqueue` asserts: a known `event_type`; exactly one of `recipient_user_id` / `recipient_role`;
a non-empty `dedupe_key` ≤ 200 chars; `assertPayloadClean(payload)`. All four are programmer errors if
violated, so they throw `AppError(500, …)` and are covered by tests rather than by user-facing messages.
#87's query is validated in the controller (`status`, `event_type`, `from`, `to`, `page`, `limit ≤ 100`).

**Authorization.** #87 and #90 are `hr`-only, org-scoped. The outbox is never exposed to managers or
employees — it contains other people's email addresses by reference and the operational state of the org's
communications.

**Storage/file impact.** **Not applicable.** `payload` may never contain a storage key, a signed URL, or a
document number; §8.3's whitelist and `assertPayloadClean` enforce it and T-13 tests it. Emails link to the
application, never to S3 — a signed URL in an inbox is a bearer credential with a TTL nobody controls.

**Failure handling.** See §18. The core guarantee: **a send failure never affects business state.** The
document is uploaded, the request is raised, the row is in the outbox; whether the email left the building
is a separate, retryable concern with its own bounded attempts and its own audit trail (EC-31).

**Testing.** T-13 (payload safety, forbidden-key superset), T-14 (dedupe `DO NOTHING` returns zero rows and
leaves the outer transaction usable), T-15 (claim consumes an attempt; stale reclaim; `attempts >= max` is
never reclaimed), T-22 (backoff schedule), T-23 (toggle-off enqueues nothing).

**Acceptance criteria.**
1. Two concurrent enqueues with the same `dedupe_key` produce one row and neither transaction aborts.
2. A send that throws leaves the row retryable with an incremented attempt count and a redacted error.
3. After five failed attempts the row is `failed` and is never claimed again.
4. Turning every notification toggle off results in zero rows entering the outbox while every state
   transition (expiry flip, overdue flip, fulfilment) continues normally.
5. No outbox row's `payload` contains `storage_key`, `document_number` or `reference_url`.

---

### F-6 — Reminder generation

**Requirement.** Parent §9 names four notice classes. Each has a distinct trigger and a distinct dedupe
family.

| ID | Event | Trigger | Recipient | Dedupe family |
|---|---|---|---|---|
| N-1 | `document_uploaded` | inline, on confirm/link | `recipient_role='hr'` | content: `upload:{docId}` |
| N-2 | `document_expiring` | daily reminder cron | the document's owner (`subject_user_id`) | content: `expiry:{docId}:{bucket}` |
| N-3 | `acknowledgement_pending` | daily reminder cron | the recipient user | cadence: `ack:{recipientId}:{today}` |
| N-4 | `document_request_overdue` | daily reminder cron | the subject employee | cadence: `reqoverdue:{requestId}:{today}` |
| N-5 | `document_request_raised` | inline, on request create | the subject employee | content: `request:{requestId}` |

(N-5 is the "a request was raised" notice. The parent lists four classes; N-5 is the inline counterpart of
N-4 and is required for the request feature to be usable at all — an employee who is never told a document
was requested cannot fulfil it. It is called out here rather than assumed.)

**Existing dependency.** N-2: `employee_documents_org_expiry_idx` (D-b) and `expiry_reminder_days` (D-e).
N-3: `org_document_recipients.due_on`, `org_document_recipients_org_due_idx`, `isOverdue`, `daysRemaining`
(D-j) — **the predicate and the index already exist; only the generator is new.**
N-4: F-1's `document_requests_reminder_idx`. All five: F-5's `enqueue`.

**Database impact.** No new table. Two new columns on `org_document_recipients` (§6.4) and two on
`document_requests` (§6.1) for the cadence watermarks.

**API impact.** One new endpoint, #89 (`POST /hr/jobs/document-reminders/run`). No read endpoint changes.

**Business logic — the reminder cron, per org:**

*Pass A — overdue flip (runs first, deliberately).*
```sql
UPDATE document_requests SET status='overdue', updated_at=NOW()
 WHERE org_id=:o AND status='open' AND due_on < :todayIst AND deleted_at IS NULL
 RETURNING id;
```
Audited per row as `document_request.overdue`. It runs before pass D so that a request that became overdue
today is reminded today rather than tomorrow.

*Pass B — expiry reminders (N-2).* Scan documents with
`status='available' AND expires_on IS NOT NULL AND expires_on >= :today AND expires_on <= :today + maxOffset`,
where `maxOffset` is the largest value across the org's default schedule and all type schedules (computed
once per org from the type catalogue, so the scan window is as tight as the configuration allows).
For each row: `schedule = resolveExpirySchedule(type, settings)`;
`bucket = resolveReminderBucket(expires_on, today, schedule)`; if `bucket === null`, skip;
else `enqueueDetached({ event_type:'document_expiring', dedupe_key:'expiry:'+id+':'+bucket, … })`.
The dedupe index does the rest. **No watermark column is used for N-2** — the content-addressed key is
strictly stronger, because it survives a database restore, a clock skew, and an operator running the job
manually at noon.

*Pass C — pending-acknowledgement reminders (N-3).* Scan `org_document_recipients` with
`state IN ('pending','viewed') AND due_on IS NOT NULL AND due_on <= :today + ackLeadDays`.
For each candidate, **claim the watermark and enqueue in one transaction**:
```sql
UPDATE org_document_recipients
   SET last_reminder_on = :today, reminder_count = reminder_count + 1
 WHERE id = :id
   AND (last_reminder_on IS NULL OR last_reminder_on <> :today)
   AND reminder_count < :maxReminders
 RETURNING id;
```
Zero rows → someone else already reminded today, or the cap is reached → skip silently.
One row → enqueue in the same transaction. This is the EC-18 exactly-once guarantee for cadence reminders.

*Pass D — overdue-request reminders (N-4).* Identical claim shape against `document_requests`
(`status='overdue'`, watermark `last_reminder_on`, cap `DOCUMENT_REQUEST_MAX_REMINDERS`).

**Why per-entity watermarks and not a per-org daily watermark.** Payroll claims a per-org watermark before
its reminder run. Copying that here would introduce a failure mode the document module does not need: if the
job crashes after claiming the org but before finishing its rows, that org loses the entire day's reminders
with no way to recover except a manual trigger. The per-entity claim has no such window — every row that was
reached is claimed, every row that was not is still eligible on the next run, and the same-day predicate
still prevents duplicates. This is a deliberate, documented divergence from the payroll precedent.

**Validation.** **Not applicable** for the cron. #89 takes no body.

**Authorization.** #89 is `hr`-only. The generator itself runs as `system`.

**Storage/file impact.** **Not applicable.** No pass reads a storage key.

**Failure handling.** Each pass is independently try/caught per org; a failure in pass B does not prevent
pass C. Errors accumulate in the result envelope and are logged once per org, never per row. A failed
enqueue for one document does not abort the scan.

**Testing.** T-20 (bucket resolution: exact day, missed day, no double-send, past expiry → null),
T-28 (watermark claim is single-winner under concurrency), T-29 (reminder cap stops the cadence),
T-30 (pass A runs before pass D), T-31 (an org with all toggles off still runs pass A).

**Acceptance criteria.** These are the parent's Phase-4 exit criteria, restated as tests:
1. A document expiring in 30 days, with schedule `[30,15,7]`, produces exactly one reminder on D-30 —
   and running the job twice that day produces no second one.
2. If the job does not run on D-30, the D-30 reminder is emitted on D-29 and is not emitted again before D-15.
3. Once the D-30 reminder exists, no further reminder is produced until the D-15 bucket opens.
4. Disabling `document_notify_expiry` stops all expiry email while pass A still flips overdue requests and
   F-4 still flips expired documents.

---

### F-7 — Retention and abandoned-upload sweeper

**Requirement.** Parent §9: "abandoned `pending_upload` > 24h (object + row), and soft-deleted rows past
`type.retention_days`. Statutory types excluded unconditionally." Exit criterion: "a statutory document is
never swept."

**Existing dependency.** `s3.deleteObject(key)` (D-a) — **called with a positional string**, per P-9.
`document_types.retention_days` and `is_statutory` (D-e). `document_settings.document_retention_days`
(shipped in P1, never read until now). The two-pass shape from `payroll_automation.sweepAttachments` (D-r).

**Database impact.** Two new partial indexes on `employee_documents` (§6.5). No column changes.
The purge issues a **hard** `DELETE` (not a paranoid destroy — the row is already soft-deleted; the purge
removes it).

**API impact.** One new endpoint, #91 (`POST /hr/jobs/document-sweeper/run`). No read endpoint changes.

**Business logic — three passes per org.**

*Pass 1 — abandoned uploads.* Select `status='pending_upload' AND created_at < now - 24h`, `LIMIT 500`,
ordered by `created_at`. For each: delete the S3 object **first**, then hard-delete the row, each row in its
own transaction. If the object delete fails, **skip the row and leave it for the next run** — the row is the
only remaining pointer to the object, and deleting it would orphan storage permanently (EC-29). Audit
`employee_document.sweep_abandoned` per row.

*Pass 2 — retention purge.* Select rows with `deleted_at IS NOT NULL`, joined to their type, `LIMIT 500`.
For each:
- if `type.is_statutory` → **skip unconditionally** (R-24), regardless of how old the row is and regardless
  of the org's retention setting. This is checked in the SQL predicate *and* re-asserted in the loop before
  the delete call, because a single-point check on a destructive operation is not enough.
- `retentionDays = resolveRetentionDays(type, settings)`;
  if `deleted_at >= today - retentionDays` → skip.
- otherwise: `deleteObject(storage_key)` first, then hard-delete the row, in its own transaction; on object
  failure, keep the row (EC-29). Rows with `storage_backend='reference'` have no object — skip straight to
  the row delete. Audit `employee_document.purged`, with **no storage key in the metadata** (D-20).

*Pass 3 — outbox purge.* `DELETE FROM document_notifications WHERE org_id=:o AND status IN ('sent','skipped')
AND created_at < now - NOTIFICATION_RETENTION_DAYS` (90 days). `failed` rows are **kept indefinitely** —
they are the evidence that a notice did not go out, and that is exactly what an auditor asks about.

**Order matters: object first, row second.** The reverse order can lose the only pointer to a live object.
This order can leave an object deleted while the row survives — which is detectable (a download of that row
will 404 from storage) and repairable, whereas an orphaned object is invisible and pays rent forever.

**Validation.** **Not applicable** for the cron. #91 takes no body.

**Authorization.** #91 is `hr`-only. Note this is an HR-triggerable *destructive* operation; the audit
entry records `actor_user_id` for the manual path and `NULL`/`system` for the cron path, so the two are
distinguishable after the fact.

**Storage/file impact.** This is the **only** P4 feature that touches storage. It reads `storage_key` via a
new repository method `findSweepCandidates`, which is the module's **fourth** storage-key reader. P2's
chokepoint test asserts exactly three `findByIdForStorage` call sites; that test stays valid and unmodified
because the sweeper does not call `findByIdForStorage`. The new method must be added to whatever list that
test enumerates as "methods permitted to select `storage_key`", and T-32 extends the chokepoint assertion to
four named readers rather than loosening it (§19.2).

**Failure handling.** Per-row transactions; a failure never aborts the pass. `StorageUnavailableError` from
the provider aborts the *pass* for that org (if S3 is down, continuing to attempt 499 more deletes is
pointless) but not the other orgs. All errors land in the result envelope.

**Testing.** T-16 (`isAbandonedUpload` vs `isStaleUpload` distinction), T-33 (statutory never swept, both
in the predicate and in the loop), T-34 (object-delete failure keeps the row), T-35 (`deleteObject` is
called with a string, not an object — a direct regression test for the payroll bug class, P-9),
T-36 (retention uses the larger of type and org), T-37 (`failed` outbox rows survive pass 3).

**Acceptance criteria.**
1. A `pending_upload` row 25 h old with a deletable object is removed, object first.
2. A `pending_upload` row 23 h old is untouched.
3. A soft-deleted statutory document 10 years past retention is untouched.
4. An S3 failure during purge leaves the row present and the run reports the error.
5. `deleteObject` receives a string key in every call site.

---

### F-8 — On-join recipient top-up

**Requirement.** Parent §9/EC-13 via P3 §26.3: an employee who joins after an org document was published
must still receive it, with a due date that does not retroactively make them non-compliant.

**Existing dependency.** `document_recipient.service.syncRecipients` — already idempotent, already takes the
advisory lock `docorg:{orgId}:{groupId}`, and already dates new recipients' `due_on` from sync time
(D-h). **This is the whole feature minus its trigger.**

**Database impact.** **No schema change.** F-8 adds a scan, not a structure.

**API impact.** One new endpoint, #92 (`POST /hr/jobs/recipient-topup/run`). No read endpoint changes.
Existing recipient and compliance reads simply begin to include the new rows.

**Business logic.** Per org: select published org documents that are still effective
(`status='published' AND (effective_to IS NULL OR effective_to >= :today)`) via
`org_documents_org_status_idx` (P-7), bounded to a sane per-run count. For each, call
`syncRecipients(orgId, doc, { actor: system })` unchanged. `syncRecipients` computes the audience, inserts
only the users who are not already recipients, and leaves existing rows alone.

**F-8 must not re-derive due dates, must not pass a publish date, and must not take its own advisory lock** —
`syncRecipients` owns all three. The cron is a loop and nothing more. Any temptation to "optimise" by
inlining the audience query re-opens EC-13.

**Validation.** **Not applicable.** #92 takes no body.

**Authorization.** #92 is `hr`-only; the cron runs as `system`.

**Storage/file impact.** **Not applicable.**

**Failure handling.** Per-document try/catch; one failing document does not stop the org. `syncRecipients`
already contains its own transaction and lock discipline, so a failure is fully contained.

**Testing.** T-38 (a user created after publication receives a recipient row on the next run),
T-39 (their `due_on` is dated from the sync, not the publication — asserted by comparing against the
document's `published_at`), T-40 (a second run inserts nothing), T-41 (an expired-effectivity document is
skipped).

**Acceptance criteria.**
1. An employee who joins on day 30 of a document published on day 1, with a 7-day acknowledgement window,
   has `due_on = joinDay + 7` and is never reported overdue for the 29 days before they existed.
2. Running the job twice inserts no duplicate recipients.
3. A document whose `effective_to` has passed gains no new recipients.

---

### F-9 — Job control surface

**Requirement.** Parent §9: "linux-guarded cron registration; `runStartupCatchUp()`; manual HR trigger
endpoints for every cron."

**Existing dependency.** `src/server.js`'s existing `if (os.platform() === 'linux')` block and its
30-second-delayed startup catch-up (D-s). `src/cron-jobs/`'s bare-require registration idiom (P-13).
`payroll_hr.routes`' `POST /jobs/{name}/run` shape (D-t).

**Database impact.** **None.**

**API impact.** Five new endpoints, #88–#92 (one per cron). Each returns `200` with the job's result
envelope. Each is synchronous and bounded — the same bounds the cron uses — so an HR user cannot trigger an
unbounded operation from a web request.

**Business logic — schedules** (all `timezone: 'Asia/Kolkata'`):

| Cron file | Expression | Job | Rationale |
|---|---|---|---|
| `document_expiry_sweeper.cron.js` | `30 0 * * *` | `runExpiryFlip` | Just after midnight IST, so the day's expiries are persisted before anyone reads. |
| `document_recipient_topup.cron.js` | `0 1 * * *` | `runRecipientTopUp` | After the flip, before reminders, so new recipients can be reminded the same day. |
| `document_reminder.cron.js` | `0 8 * * *` | `runReminders` | Business hours; mirrors payroll's reminder time. |
| `document_notification_dispatch.cron.js` | `*/15 * * * *` | `runNotificationDispatch` | Bounded latency for inline notices (a request raised at 10:00 is emailed by 10:15). |
| `document_sweeper.cron.js` | `30 3 * * *` | `runSweeper` | Off-peak, after all state has settled; it is the only destructive job. |

`runStartupCatchUp()` runs `runExpiryFlip` and `runNotificationDispatch` only — the two jobs whose omission
has ongoing consequences (stale statuses, unsent mail). It deliberately does **not** run the reminder
generator (a restart at 23:00 must not send a second day's reminders — though the watermarks would prevent
it, relying on that is worse than not calling it) and does **not** run the sweeper (never run a destructive
job as a side effect of a deploy).

**Validation.** Each trigger endpoint takes no body. Any body is ignored, not rejected, matching payroll.

**Authorization.** All five are `hr`-only and org-scoped: a manual trigger runs the job **for the caller's
org only**, never across orgs, even though the cron path iterates all orgs. This is the key difference from
the cron and prevents one org's HR user from causing work on behalf of others. `admin`/`super-admin` are
denied (D-10).

**Storage/file impact.** Indirect only, via F-7.

**Failure handling.** A cron body is wrapped so that a throw is logged and never escapes to crash the
process. The trigger endpoints return the envelope including `errors[]` with a `200`, not a `500` — a job
that processed 99 of 100 orgs succeeded at something, and a `500` would tell the caller nothing about what
happened. A job that could not start at all (settings unreadable, database down) does throw.

**Testing.** T-42 (each cron file registers exactly one schedule and contains no logic), T-43 (startup
catch-up calls exactly the two intended jobs), T-44 (manual triggers are org-scoped), T-45 (a job throwing
inside the cron does not propagate).

**Acceptance criteria.**
1. On a non-Linux host, no document cron is registered and no job runs.
2. Each cron file's only export is its registration side effect.
3. A manual trigger by an HR user in org A performs no work in org B.
4. A job that fails for one org still processes the others and reports the failure.

---

## 11. API Surface

### 11.1 New endpoints #80–#98

All paths are relative to the plane's mount base. Every endpoint goes through the module's existing
auth middleware chain and role gate. Every list endpoint is paginated with `page` / `limit` (limit ≤ 100,
default 20) and returns the module's standard `{ data, pagination }` envelope.

**HR plane — base `/api/v1/documents/hr`** (role: `hr`)

| # | Method & path | Purpose | Success | Notable failures |
|---|---|---|---|---|
| 80 | `POST /employees/:userId/document-requests` | Raise a request | `201` request object | `404 USER_NOT_FOUND` · `404 DOCUMENT_TYPE_NOT_FOUND` · `409 DUPLICATE_REQUEST` · `409 DOCUMENT_ALREADY_PRESENT` · `422` validation |
| 81 | `POST /employees/:userId/document-requests/bulk-from-checklist` | Raise one request per missing/expired mandatory item | `201 { created:[], skipped:[] }` | `404 USER_NOT_FOUND` · `409 NOTHING_TO_REQUEST` when the checklist is complete |
| 82 | `GET /document-requests` | Org-wide list | `200` | `422` validation |
| 83 | `GET /document-requests/:id` | Detail | `200` | `404 REQUEST_NOT_FOUND` |
| 84 | `POST /document-requests/:id/cancel` | Cancel | `200` request object | `404 REQUEST_NOT_FOUND` · `409 REQUEST_NOT_OPEN` |
| 85 | `POST /document-requests/:id/remind` | Re-send the overdue notice now | `200 { reminded: bool, reason? }` | `404 REQUEST_NOT_FOUND` · `409 REQUEST_NOT_OPEN` |
| 86 | `GET /employees/:userId/checklist` | Required-document checklist | `200` | `404 USER_NOT_FOUND` |
| 87 | `GET /notifications` | Outbox observability | `200` | `422` validation |
| 88 | `POST /jobs/expiry-sweep/run` | Manual trigger | `200` envelope | — |
| 89 | `POST /jobs/document-reminders/run` | Manual trigger | `200` envelope | — |
| 90 | `POST /jobs/notification-dispatch/run` | Manual trigger | `200` envelope | — |
| 91 | `POST /jobs/document-sweeper/run` | Manual trigger (destructive) | `200` envelope | — |
| 92 | `POST /jobs/recipient-topup/run` | Manual trigger | `200` envelope | — |

**Manager plane — base `/api/v1/documents/manager`** (role: `manager`, scoped by `getAccessibleUserIds`)

| # | Method & path | Purpose | Success | Notable failures |
|---|---|---|---|---|
| 93 | `POST /employees/:userId/document-requests` | Raise a request for a direct report | `201` | `403 FORBIDDEN` (out of scope) · `403 TYPE_NOT_REQUESTABLE` (type policy denies managers) · `409 DUPLICATE_REQUEST` |
| 94 | `GET /document-requests` | List requests for the manager's scope | `200` | — |
| 95 | `POST /document-requests/:id/cancel` | Cancel a request the manager raised | `200` | `404 REQUEST_NOT_FOUND` (out of scope **or** not the requester) · `409 REQUEST_NOT_OPEN` |
| 96 | `GET /employees/:userId/checklist` | Direct report's checklist | `200` | `403 FORBIDDEN` |

**Self plane — base `/api/v1/documents`** (any authenticated tenant user, all under `/me`)

| # | Method & path | Purpose | Success |
|---|---|---|---|
| 97 | `GET /me/document-requests` | My open/overdue/closed requests | `200` |
| 98 | `GET /me/checklist` | My required-document checklist and completeness | `200` |

**Denial-shape note.** #95 returns `404`, not `403`, for a request outside the manager's scope *or* raised
by someone else — because the addressing mode is `/:id` and the module's rule is that `/:id` denials are
byte-identical regardless of cause (D-l). #93 and #96 return `403` because the addressing mode is
`/:userId`, where the caller already knows the user exists.

### 11.2 Request/response shapes

**Request object** (returned by #80, #83, #84, #85, and in the lists #82, #94, #97):
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "employee": { "id": "uuid", "name": "…", "employee_code": "…" },
  "document_type": { "id": "uuid", "name": "…", "is_statutory": false, "has_expiry": true },
  "status": "open",
  "due_on": "2026-10-01",
  "days_until_due": 7,
  "note": "…",
  "requested_by": { "id": "uuid", "name": "…", "role": "hr" },
  "fulfilled_document_id": null,
  "fulfilled_at": null,
  "cancelled_at": null,
  "cancel_reason": null,
  "reminder_count": 0,
  "created_at": "…"
}
```
`days_until_due` is derived on read from `toIstDateString(now)`, never stored — consistent with the module's
derive-on-read discipline. `last_reminder_on` is **not** returned on the self plane (it reveals the
org's internal chasing cadence); it is returned on the HR plane only.

**Checklist object** — see F-3.

**Job envelope** (#88–#92):
```json
{ "job": "expiry_flip", "ok": true, "orgs_scanned": 1, "processed": 42,
  "skipped": 3, "errors": [], "duration_ms": 812 }
```

### 11.3 Modified existing endpoints

| # | Endpoint | Change | Breaking? |
|---|---|---|---|
| 9 / 30 / 41 (upload confirm and reference link, all three planes) | Response gains `fulfilled_request_id: string \| null` | **No** — additive field |
| 22 | `PATCH /hr/types/:id/deactivate` may now return `409 DOCUMENT_TYPE_IN_USE` | **Behavioural** — a previously-always-succeeding call can now fail. **Already shipped 2026-09-24**; P4 only adds `open_document_requests` to the existing `details` map. §26.2 |
| 16 / 17 | `POST /hr/types`, `PUT /hr/types/:id` — `mandatory_for` tightens from `Joi.object()` to the six-key criteria schema | **Potentially breaking** — a payload with unknown keys, previously stored, is now `400 VALIDATION_ERROR`. **Already shipped 2026-09-24**; nothing left for P4. §26.2 |
| 55 / 56 | `GET /hr/settings`, `PUT /hr/settings` — eight new keys | **No** — additive |

No other endpoint among #1–#79 changes in path, method, status code, request shape or response shape.

---

## 12. Business Rules

| ID | Rule | Enforced where |
|---|---|---|
| R-1 | A request may only target an **active** type in the caller's org. | `document_request.service.create`, type loaded `FOR SHARE` |
| R-2 | A request may only target an **active employee** of the org. | `create`, membership check |
| R-3 | A request may not be raised when a live, non-expired document of that type already exists for that employee. | `create`, pre-check → `409 DOCUMENT_ALREADY_PRESENT` |
| R-4 | At most one `open`-or-`overdue` request may exist per (org, user, type). | `document_requests_open_unique_idx` (database) + translation in `create` |
| R-5 | HR may create, view, cancel and remind any request in the org. | `resolveRequestAuthority` |
| R-6 | A manager may create and view only within `getAccessibleUserIds`; a `null` scope grants nothing. | controller + `resolveRequestAuthority` |
| R-7 | A manager may cancel only requests they themselves raised. | `resolveRequestAuthority` (`isRequester`) |
| R-8 | Only HR may trigger a manual reminder (#85). | `resolveRequestAuthority` (`remind` denied to manager and self) |
| R-9 | A document type may not be deactivated while any `open` or `overdue` request references it. | `document_type.service.setActive` → `assertNoOpenRequestsForType`; FK `ON DELETE RESTRICT` is the DB backstop (EC-11) |
| R-10 | Fulfilment is automatic and role-blind: any authorized upload of the requested type for that employee closes the request. | `fulfilIfOpen`, guarded UPDATE |
| R-11 | A `fulfilled` or `cancelled` request is terminal; no transition leaves it. | `cancel` guard, overdue-flip predicate (`status='open'` only) |
| R-12 | `open → overdue` happens only when `due_on < today` (IST). | reminder cron pass A |
| R-13 | An `overdue` request is still an open request for every purpose except display. | `DOCUMENT_REQUEST_OPEN_STATUSES` |
| R-14 | A type's `expiry_reminder_days` overrides the org default; an explicitly **empty** array means "never remind for this type". | `resolveExpirySchedule` |
| R-15 | Expiry reminders are anticipatory only; a document already past `expires_on` produces no reminder. | `resolveReminderBucket` → `null` for `daysUntil < 0` |
| R-16 | A notification toggle controls **sending only**. Turning every toggle off must not stop a single state transition. | enqueue-time gating; passes A/F-4/F-7 are unconditioned on toggles |
| R-17 | A notification payload may never contain `storage_key`, `document_number`, `reference_url`, a token or a password. | `buildPayload` whitelist + `assertPayloadClean` |
| R-18 | An email may never contain a signed storage URL. | template contains an application link only; T-13 asserts no `payload` URL field is passed to the template |
| R-19 | Onboarding completeness reports 100% only when every required item is satisfied; otherwise it is capped at 99. | `computeCompleteness` |
| R-20 | A mandatory type with empty `mandatory_for` is mandatory for every employee in the org. | `resolveRequiredTypes` via `isOrgWide` semantics |
| R-21 | A manager sees a confidential type's *presence* in a checklist but not its `document_id`. | `document_checklist.service`, using `resolveEffectivePolicy(...).managerCanView` |
| R-22 | Checklist and request surfaces group and filter employees by `department_id`, never the free-text `department`. | `resolveRequiredTypes` input shape; repository query |
| R-23 | Every state change P4 introduces writes an audit row inside the same transaction as the change. | `document_audit.record(entry, t)` |
| R-24 | A document whose type `is_statutory` is **never** purged, regardless of age, retention setting or manual trigger. | F-7 pass 2, checked in SQL and re-asserted in the loop |
| R-25 | During purge and abandonment sweep, the storage object is deleted **before** the row; a failed object delete keeps the row. | F-7 (EC-29) |
| R-26 | Effective retention is `max(type.retention_days, settings.document_retention_days)`. | `resolveRetentionDays` |
| R-27 | `failed` notification rows are never auto-purged. | F-7 pass 3 predicate |
| R-28 | A manual job trigger operates on the caller's org only. | job controller passes `req.user.org_id` |
| R-29 | A cron whose org loop fails for one org continues with the rest and reports the failure. | `document_automation.service` per-org try/catch |
| R-30 | No read path may depend on a cron having run. | `resolveDisplayStatus` and `isOverdue` retained on every read (K-7) |

**On R-26.** Both inputs default to 2555 days, so this rule changes nothing for any existing org on day one.
It is chosen over "type wins" because purge is irreversible: when two configured values disagree about how
long to keep evidence, the longer one is the only safe reading. It also makes the previously-inert
`document_retention_days` setting (#65) meaningful as an org-wide floor without touching any write path or
changing the Joi default on type creation.

---

## 13. Authorization & Security

### 13.1 Role planes

`hr` is the top of the tenant plane and sees everything in its org. `manager` sees only
`getAccessibleUserIds(orgId, requesterUser)`; a `null` return grants **nothing**, never "everything"
(D-m, D-10). Employees see only their own subject-anchored rows. `admin` and `super-admin` are platform
roles and are denied on every P4 endpoint — they are not org members and P4 adds no exception.

### 13.2 Denial shapes

| Addressing mode | Denial | Endpoints |
|---|---|---|
| `/:id` | byte-identical `404` regardless of whether the row is missing, in another org, or out of scope | #83, #84, #85, #95 |
| `/:userId` | `403 FORBIDDEN` | #80, #81, #86, #93, #96 |
| org-scoped collection | filtered list, never an error | #82, #87, #94, #97, #98 |

A `404` for a request in another org must not differ in body, headers or timing class from a `404` for a
nonexistent id. The controllers achieve this by resolving scope **before** the lookup and passing a scope
filter into the repository query, so the "wrong org" case and the "no such row" case take the same path.

### 13.3 Cross-tenant isolation

Every P4 query filters on `org_id` in its `WHERE` clause, including the cron paths. `org_id` comes from
`req.user`, never from the body or the query string — #88–#92 accept no org parameter (§F-9). Every new
index leads with `org_id`, so a missing tenant filter is a visible performance cliff as well as a
correctness bug.

### 13.4 Document access control

P4 introduces **no new document access path**. A checklist reports that a document exists; it does not
return a view URL, a download URL, or a storage key. To open the document the caller must still go through
the existing P1/P2 view/download endpoints and pass `screenDocument` / `resolveDocumentAuthority`
unchanged. This is deliberate: adding a fourth way to reach a file would create a fourth place for an
authorization bug.

### 13.5 The notification payload boundary

The outbox is the one new place in the module where document-derived data is serialised into a row that a
different subsystem (email) later reads. Three defences:
1. `buildPayload` constructs from a per-event **whitelist** — it does not filter an arbitrary object, so a
   new field cannot leak by being forgotten.
2. `assertPayloadClean` throws on any forbidden key at enqueue time, in all environments.
3. T-13 asserts the forbidden-key list is a superset of `document_audit.service`'s `SCRUBBED_KEYS` by
   literal value, so the two lists cannot drift apart silently.

Email addresses are resolved at send time and never stored in the outbox; `last_error` is passed through
`redactError` so a provider error echoing an address does not persist it.

### 13.6 Destructive-operation controls

F-7 is the only destructive feature. Controls: `hr`-only trigger; org-scoped when manual; statutory
exclusion checked twice; object-before-row ordering; per-row transactions; an audit row per purge naming
the actor (`system` for the cron, the HR user for a manual run); and `failed` outbox rows exempt from
purge. There is no "purge everything" parameter and no way to shorten retention below the org floor at
call time — retention comes from configuration only.

### 13.7 Abuse and volume bounds

| Vector | Bound |
|---|---|
| Bulk request creation (#81) | 50 items per call, and the checklist itself is bounded by the type catalogue |
| Manual reminder (#85) | same-day watermark; a double-click returns `reminded:false`, not a second email |
| Reminder cadence | `DOCUMENT_REQUEST_MAX_REMINDERS` / `DOCUMENT_ACK_MAX_REMINDERS` = 5 |
| Outbox growth | enqueue is gated by toggles (default off) and by dedupe keys; pass 3 purges sent rows at 90 days |
| Manual job triggers | synchronous, single-org, and bounded by the same batch caps the cron uses |
| Send retries | `NOTIFICATION_MAX_ATTEMPTS = 5`, attempts consumed at claim |

---

## 14. Document Lifecycle & State Transitions

### 14.1 `document_requests`

```
            create (#80/#93)
                  |
                  v
               [open] ----------- cancel (#84/#95) ------------> [cancelled]  (terminal)
                  |  \
   due_on < today |   \  upload of matching type (F-2)
     reminder cron|    \
      pass A      |     +-------------------------------------> [fulfilled]   (terminal)
                  v                                                 ^
             [overdue] ---- upload of matching type (F-2) ----------+
                  |
                  +------------- cancel (#84/#95) --------------> [cancelled]  (terminal)
```

| From | To | Trigger | Guard | Audit action |
|---|---|---|---|---|
| — | `open` | #80 / #81 / #93 | R-1, R-2, R-3, R-4 | `document_request.created` |
| `open` | `overdue` | reminder cron pass A | `due_on < today` | `document_request.overdue` |
| `open` \| `overdue` | `fulfilled` | F-2 guarded UPDATE | matching type + subject | `document_request.fulfilled` |
| `open` \| `overdue` | `cancelled` | #84 / #95 | R-7 for managers | `document_request.cancelled` |
| `fulfilled` \| `cancelled` | — | — | terminal (R-11) | — |

There is **no** `overdue → open` transition. Extending a due date is not in scope for P4; an org that needs
one cancels and re-raises, which leaves a clean audit trail of both acts.

### 14.2 `employee_documents` — the one transition P4 adds

```
[available] --(F-4 cron, expires_on < today)--> [expired]
```
No other status transition is introduced. In particular P4 never moves a document to `deleted` — the
sweeper hard-deletes rows that are *already* soft-deleted, and never soft-deletes anything itself.

`resolveDisplayStatus` continues to report `expired` for a past-dated `available` row **before** the cron
runs (R-30). The cron makes the stored column agree with what every reader already says; it does not create
the truth.

### 14.3 `document_notifications`

```
   enqueue --> [pending] --claim--> [sending] --send ok--> [sent]       (terminal)
                   ^                    |
                   |                    +--send fail, attempts<max--> [pending] (backoff)
                   |                    |
                   |                    +--send fail, attempts>=max--> [failed] (terminal, never purged)
                   |                    |
                   +--stale reclaim-----+
                                        |
                   entity vanished -----+--> [skipped]  (terminal)
```

### 14.4 `org_document_recipients` — no new states

P4 adds only the two watermark columns. The `pending → viewed → acknowledged | waived` lifecycle from P2/P3
is untouched; a reminder is an observation of the state, never a transition of it.

---

## 15. Workflows

### 15.1 HR requests a document and the employee supplies it

1. HR calls #80. Service: validate → check no live document (R-3) → insert → audit
   `document_request.created` → `enqueue(document_request_raised)` → commit. Response `201`.
2. Within 15 minutes the dispatch cron claims the row, resolves the employee's address, sends, records
   `sent`.
3. The employee sees the request at #97 and their checklist item at #98 in state `requested`.
4. The employee issues an upload URL (#37, P1), PUTs to S3, calls confirm (#38, P1).
5. Inside confirm's existing transaction: the document row reaches `pending_verification` or `available`;
   `fulfilIfOpen` closes the request; `document_request.fulfilled` is audited;
   `enqueue(document_uploaded)` addressed to `recipient_role='hr'`. Commit.
6. Confirm's response includes `fulfilled_request_id`.
7. The dispatch cron fans the upload notice out to every active HR user.
8. The checklist item moves to `satisfied` (or `expired`, if the uploaded document was already past its
   expiry date — EC-25).

### 15.2 A document approaches expiry

1. Day D-31: nothing. `resolveReminderBucket` returns `null` because no offset ≥ 31 exists in `[30,15,7]`.
2. Day D-30: the reminder cron resolves bucket `30`, enqueues `expiry:{docId}:30`. Sent within 15 minutes.
3. Day D-30, second run (operator trigger #89): bucket `30` again; `ON CONFLICT DO NOTHING`; zero rows.
4. Day D-29 … D-16: bucket `30` each day; all deduped. No further mail.
5. Day D-15: bucket `15`; new key; one reminder.
6. Day D+0: `expires_on = today`. F-4 does **not** flip (`< today`, not `<=`). `resolveReminderBucket`
   returns the smallest offset ≥ 0, i.e. `7` if the schedule contains no `0` — but `expiry:{docId}:7` was
   already used on D-7, so nothing is sent. No duplicate.
7. Day D+1: F-4 flips `available → expired`; `resolveReminderBucket` returns `null`; the document leaves the
   reminder scan's window permanently. The checklist reports `expired`; the employee is prompted to replace.

**If the cron misses D-30 entirely:** on D-29 the bucket is still `30`, so the reminder goes out one day
late and is then deduped for the rest of the window. The parent's exit criterion — "a missed cron day does
not lose a reminder *and* does not send a stale one" — is satisfied by this single property of
`resolveReminderBucket`, with no catch-up logic anywhere.

### 15.3 A request goes overdue

1. Reminder cron pass A flips `open → overdue` for `due_on < today`; audits each.
2. Pass D claims each overdue request's same-day watermark and enqueues
   `reqoverdue:{requestId}:{today}` while `reminder_count < 5`.
3. After five reminders the cadence stops; the request stays `overdue` and remains visible on every HR and
   manager list. Silence is not closure.
4. HR may force one more notice with #85, which uses the same watermark — so #85 on a day the cron already
   reminded returns `{ reminded: false, reason: 'already_reminded_today' }`.

### 15.4 A new employee joins after an org document was published

1. The top-up cron (01:00) finds the still-effective published document and calls `syncRecipients`.
2. `syncRecipients` computes the audience, finds the new user is not yet a recipient, inserts them with
   `due_on = today + acknowledgement_due_days` — dated from **now**, not from publication (D-h).
3. From 08:00, if the acknowledgement is still pending and the due date is near, pass C reminds them —
   never before, and never marked overdue for the period before they existed (EC-13).

### 15.5 Retention

1. 03:30 sweeper, pass 1: `pending_upload` rows older than 24 h → object deleted, then row hard-deleted.
2. Pass 2: soft-deleted rows past `max(type.retention_days, org floor)` → statutory skipped
   unconditionally; others object-first, row-second; an S3 failure leaves the row for tomorrow.
3. Pass 3: `sent`/`skipped` outbox rows older than 90 days deleted; `failed` rows kept.

### 15.6 A type is retired

1. HR calls #22 to deactivate a type.
2. `setActive` calls `assertNoOpenRequestsForType` inside its transaction. If any `open` or `overdue`
   request references the type → `409 DOCUMENT_TYPE_IN_USE` with the count, and the type stays active.
3. HR cancels the outstanding requests (#84) and retries. The deactivation now succeeds.
4. Existing documents of that type are unaffected — deactivation stops new uploads and new requests, not
   history. The checklist stops listing the type because `resolveRequiredTypes` reads active types only.

---

## 16. Transactions & Concurrency

### 16.1 Transaction inventory

Every P4 transaction is **unmanaged**, matching the module's convention:
```js
const t = await db.sequelize.transaction()
try { … ; await t.commit() }
catch (e) { if (!t.finished) await t.rollback(); throw e }
```

| Operation | Boundary | Contents | Notes |
|---|---|---|---|
| `request.create` | one | type lock, duplicate check, insert, audit, enqueue | The enqueue is inside so that a request that commits always has its notice queued |
| `request.createFromChecklist` | one, for the whole batch | N inserts + N audits + N enqueues | All-or-nothing: a partially-created checklist batch would be confusing to reconcile, and N ≤ 50 |
| `request.cancel` | one | `FOR UPDATE`, update, audit | |
| `request.remind` | one | watermark claim, enqueue | |
| `fulfilIfOpen` | **none of its own** | guarded UPDATE + audit, on the caller's `t` | Transaction-passive by design |
| `setActive` guard | the caller's existing transaction | `COUNT` | |
| Expiry flip | one **per batch** | guarded UPDATE + N audits | Batch size 1000 |
| Overdue flip (pass A) | one **per batch** | guarded UPDATE + N audits | |
| Expiry reminder (pass B) | one **per document** | enqueue | Cheap; a failure loses one document's reminder for one day, not the pass |
| Ack/request reminder (pass C/D) | one **per entity** | watermark claim + enqueue | The claim and the enqueue **must** share a transaction (C-4) |
| Notification CLAIM | one | guarded UPDATE | |
| Notification SEND | **none** | network I/O | Never inside a transaction (C-5) |
| Notification RECORD | one **per row** | status update + detached audit | |
| Sweeper pass 1/2 | one **per row** | hard delete | The S3 delete happens **before** the transaction opens (C-6) |
| Sweeper pass 3 | one **per batch** | bulk delete | |
| Top-up | `syncRecipients`' own | unchanged | F-8 opens no transaction |
| Checklist read | **none** | reads | Plus an optional `recordDetached` audit |

### 16.2 Concurrency cases

**C-1 — Two requesters, same (employee, type), same instant.**
Both pass the "no live document" pre-check and both attempt the insert. The partial unique index
`document_requests_open_unique_idx` admits exactly one; the loser's transaction receives a unique violation
which the service translates to `409 DUPLICATE_REQUEST`, re-reading the winning row to report its id.
**No advisory lock is needed** — the index is the serialisation point, and a lock would only move the
contention without adding a guarantee. (EC-31.)

**C-2 — Upload confirm races the cancel of the same request.**
`cancel` takes `SELECT … FOR UPDATE` on the request row; `fulfilIfOpen` issues a guarded UPDATE whose
predicate includes `status IN ('open','overdue')`. Whichever commits first wins; the second finds the
predicate unsatisfied. `cancel` losing the race raises `409 REQUEST_NOT_OPEN`; `fulfilIfOpen` losing the
race simply returns null and the upload proceeds — correctly, because a cancelled request should not be
resurrected by an upload.

**C-3 — Two instances run the expiry flip simultaneously.**
`FOR UPDATE SKIP LOCKED` in the inner select partitions the work. Neither instance can flip a row the other
holds, and the `status='available'` predicate means a row already flipped is not selected again. Running the
job twice in parallel is safe and produces the same end state as running it once.

**C-4 — Two instances run the reminder cron simultaneously.**
The watermark claim is a single conditional UPDATE with `RETURNING`; exactly one instance receives a row for
a given recipient/request on a given day. The claim and the enqueue share a transaction, so an instance
cannot claim the watermark and then fail to enqueue while the other instance is already excluded. For
expiry (pass B), which has no watermark, the unique dedupe key is the serialisation point and both
instances' inserts collapse to one row via `ON CONFLICT DO NOTHING`. (EC-18.)

**C-5 — Two instances drain the outbox simultaneously.**
`FOR UPDATE SKIP LOCKED` at claim, plus `status='sending'` excluding already-claimed rows, plus the
stale-reclaim window (10 min) that only re-admits rows whose claimer has plainly died. Attempts are consumed
at claim, so even a pathological reclaim loop terminates after five attempts.
**SEND is never inside a transaction** — a 15-second SMTP call holding a row lock is how a connection pool
dies.

**C-6 — Sweeper races a user restoring or downloading a document.**
Pass 1 only touches `pending_upload` rows older than 24 h; a user completing an upload after 24 h will find
their row gone and receive P1's existing `404`, then re-issue an upload URL. Pass 2 only touches rows that
are already soft-deleted and past retention; those are not reachable by any read path. The S3 delete happens
outside and before the row transaction, so no lock is held across network I/O.

**C-7 — A type is deactivated while a request against it is being created.**
`create` loads the type `FOR SHARE`; `setActive` updates the same row and therefore blocks until `create`
commits or rolls back. If `setActive` wins, `create` sees `is_active=false` and fails validation. If
`create` wins, `setActive`'s `assertNoOpenRequestsForType` sees the new row and returns
`409 DOCUMENT_TYPE_IN_USE`. Either order is correct; no interleaving produces an open request against an
inactive type.

**C-8 — The top-up cron races a manual `syncRecipients` from the P2 org-document surface.**
`syncRecipients` already takes `pg_advisory_xact_lock(hashtext('docorg:{orgId}:{groupId}'))`. F-8 inherits
it by calling the service rather than the repository. This is the reason §F-8 forbids inlining the audience
query.

### 16.3 Lock ordering

P4 introduces no new advisory lock. Where locks are taken, the order is unchanged from P1/P2:
**advisory lock → row lock**, and never the reverse. `fulfilIfOpen` takes no lock at all (its guarded UPDATE
acquires the row lock implicitly and releases it at the caller's commit), so it cannot introduce a cycle
with any existing lock holder. The only nested case is `setActive` (row lock on `document_types`) calling
`assertNoOpenRequestsForType` (a plain `COUNT` on `document_requests`, no lock), which is acyclic.

---

## 17. Idempotency, Retry and Duplicate Handling

### 17.1 The four idempotency mechanisms in P4

| Mechanism | Used by | Guarantee |
|---|---|---|
| Partial unique index | request creation | At most one open request per (org, user, type), for all time |
| Unique dedupe key + `ON CONFLICT DO NOTHING` | every notification enqueue | At most one notification per logical event |
| Same-day conditional watermark | ack and overdue-request reminders | At most one cadence reminder per entity per day |
| Guarded conditional UPDATE | expiry flip, overdue flip, fulfilment | The operation is a no-op when already applied |

There is **no request-level `Idempotency-Key` header** in P4, and none is added. The module has never used
one, the duplicate-sensitive operations are all protected by a database constraint, and introducing a fifth
mechanism for the two endpoints that do not need it would be a pattern nobody else in the codebase follows.

### 17.2 Dedupe key families

**Content-addressed** — `upload:{docId}`, `expiry:{docId}:{bucket}`, `request:{requestId}`.
The key names *what happened*. Once it exists the event can never be re-notified, even years later, even
after a restore. Correct for events that occur exactly once in a document's life.

**Cadence-addressed** — `ack:{recipientId}:{yyyy-mm-dd}`, `reqoverdue:{requestId}:{yyyy-mm-dd}`.
The key names *what + when*. Today's second attempt is rejected; tomorrow's is admitted. Correct for
recurring nags, which by definition must repeat.

Using a content-addressed key for a nag would send it once and never again. Using a cadence-addressed key
for expiry would send a reminder every day of the window. The distinction is load-bearing, which is why
`DEDUPE_BUILDERS` is a single exported map with a test per family (T-20, T-28).

### 17.3 Why per-entity watermarks rather than a per-org daily watermark

Payroll claims `payroll_settings.last_*_reminder_on` once per org before its run. Copying that here would
mean: crash after the claim, lose the whole org's reminders for that day, with no recovery short of a manual
trigger. The per-entity claim has no such window. Every entity the job reached is claimed; every entity it
did not reach is still eligible on the next run; the same-day predicate still prevents duplicates. This is a
deliberate, documented divergence from the payroll precedent, and it is why `00053` adds watermark columns to
`org_document_recipients` and `document_requests` rather than to `document_settings`.

### 17.4 Retry semantics

**Notification send.** Attempts are consumed **at claim**, not at send. A process killed between claim and
record has already burned its attempt, so a row that reliably crashes the sender cannot loop forever.
Backoff `min(2^attempts, 60)` minutes via `scheduled_for`. After `NOTIFICATION_MAX_ATTEMPTS = 5` the row is
`failed`, is never reclaimed, and is never purged (R-27).

**Job re-runs.** All five jobs are safe to run any number of times per day, in parallel, from the cron or
from the manual trigger. F-4 and pass A are guarded UPDATEs; F-6 is watermarked or content-deduped; F-5 uses
`SKIP LOCKED`; F-7's deletes are naturally idempotent (a second delete of a gone object or row is a no-op);
F-8 delegates to an already-idempotent service.

**Duplicate client requests.** A double-submitted #80 yields one request and one `409`. A double-submitted
#84 yields one cancellation and one `409 REQUEST_NOT_OPEN`. A double-submitted #85 yields one email and a
`200 { reminded:false }` — the only case where the second call reports success, because a re-reminder is a
best-effort convenience and a `409` would be a confusing response to "please remind them".
A double-submitted #81 creates only the items that are still missing, because each insert is guarded by the
same partial unique index and already-open items are skipped rather than failed.

### 17.5 Partial failure

| Partial failure | Outcome |
|---|---|
| Request inserted, enqueue fails | Contained (§18.2): the request commits, no notice is queued, the failure is logged. A request with no email is recoverable by #85; a lost request is not. |
| Enqueue succeeds, send fails | Retried with backoff; after 5 attempts `failed` and visible at #87. |
| Role fan-out sends to 2 of 3 HR users | Row is retried; the 2 receive a duplicate. Documented trade (§F-5). |
| Expiry flip commits, audit fails | Impossible — they share a transaction. |
| S3 object deleted, row delete fails | Row survives pointing at a gone object. Detectable on the next download (storage 404); the next sweeper run retries the row delete. Preferred over the inverse (§F-7). |
| Sweeper row deleted, object delete never attempted | Cannot occur — object-before-row is the invariant (R-25). |
| Top-up inserts half an audience | `syncRecipients` is transactional; it is all-or-nothing per document. The next run completes any document that failed. |

---

## 18. Error Handling & Failure Recovery

### 18.1 Error codes introduced

| Code | HTTP | Raised by |
|---|---|---|
| `REQUEST_NOT_FOUND` | 404 | #83, #84, #85, #95 |
| `DUPLICATE_REQUEST` | 409 | #80, #93 |
| `DOCUMENT_ALREADY_PRESENT` | 409 | #80, #93 |
| `REQUEST_NOT_OPEN` | 409 | #84, #85, #95 |
| `NOTHING_TO_REQUEST` | 409 | #81 |
| `TYPE_NOT_REQUESTABLE` | 403 | #93 |
| `DOCUMENT_TYPE_IN_USE` | 409 | #22 (existing endpoint, new code) |
| `NOTIFICATION_PAYLOAD_UNSAFE` | 500 | `assertPayloadClean` — a programmer error, never user-triggerable |

All reuse the module's existing `AppError(status, message, code, details)` signature. No new error class.

### 18.2 The containment rule for hooks

Two hooks run inside somebody else's transaction. They have opposite containment rules, and the difference
is deliberate:

- **`fulfilIfOpen` (F-2) is NOT contained.** If it throws, the upload rolls back. A document row that exists
  while its request still says `open` is a silent compliance lie, and the confirm endpoint is idempotent so
  the client can simply retry.
- **`enqueue` (F-5) IS contained.** A queue insert failure must never lose a business operation. The enqueue
  is wrapped so that any error is logged and swallowed, leaving the business transaction intact.
  A missing email is visible and recoverable; a lost upload is neither.

Containment is implemented as an explicit try/catch around the enqueue call at each of its call sites, not
as a swallow inside `enqueue` itself — because the generators (F-6) *do* want to see enqueue failures so
they can count them in the result envelope. The rule is therefore "contained at inline call sites, surfaced
at generator call sites", and it is stated in a comment at each of the three inline sites.

### 18.3 Failure scenarios and recovery

| ID | Scenario | Behaviour | Recovery |
|---|---|---|---|
| E-1 | The reminder cron does not run for three days | No reminders are sent. No state is wrong: overdue is still derived on read (`isOverdue`), expiry is still derived on read (`resolveDisplayStatus`). | The next run emits the bucket that is still current, once. Missed *intermediate* buckets are skipped by design — sending D-30's notice on D-14 would be the "stale reminder" the exit criteria forbid. |
| E-2 | SMTP is down for six hours | Rows accumulate in `pending`, attempts consumed as the drain retries with backoff. | Once SMTP returns, the backlog drains. Rows that exhausted attempts are `failed` and visible at #87 for manual follow-up. |
| E-3 | S3 is unreachable during the sweeper | `StorageUnavailableError` aborts the pass for that org; no row is deleted. | Next run. Nothing is orphaned because nothing was deleted. |
| E-4 | The database is unreachable when a cron fires | The job throws, the cron wrapper logs, the process survives. | Next scheduled run, or `runStartupCatchUp` after a restart. |
| E-5 | A notification's subject document is purged before the notice is sent | The drain finds no entity. | The row is marked `skipped` (not `failed`) — nothing went wrong, the news is simply no longer relevant. |
| E-6 | A notification's recipient user is deactivated | Resolution yields no address. | `skipped`, with `last_error = 'recipient_inactive'`. |
| E-7 | The process is killed mid-drain, rows left `sending` | Rows are invisible to the claim for 10 minutes. | The stale-reclaim clause re-admits them with an already-incremented attempt count. |
| E-8 | A clock skew makes an instance think it is tomorrow | Cadence watermarks may admit a second reminder for one entity. Content-addressed keys are unaffected. | Bounded to one extra email per entity; the reminder cap still applies. Accepted rather than engineered around, because the alternative (a database-side date) adds a round trip per row. |
| E-9 | `00053` is applied while the application is running old code | New columns have defaults; new tables are unused. No old code path reads or writes them. | None needed — this is the expand phase of expand/contract (§25). |
| E-10 | P4 code deploys before `00053` is applied | Every P4 endpoint and cron fails on a missing relation. | **This is the one unsafe ordering.** §25.1 makes migration-before-deploy a hard gate. |

### 18.4 Logging and redaction

Cron logs: one line per job per run, at completion, carrying the result envelope — never one line per row.
A job that did nothing logs nothing (matching the existing crons' silent-when-idle behaviour), except that a
job with a non-empty `errors[]` always logs.

`last_error` and all error logs pass through `redactError`: message only (never a stack in a database
column), truncated to 500 characters, with email addresses masked. Storage keys, document numbers and
reference URLs can never reach a log because they never enter a payload (R-17) and the sweeper's audit
metadata excludes the key explicitly (D-20).

---

## 19. Storage & DB↔Storage Consistency

### 19.1 What P4 does and does not do with storage

P4 **deletes objects** (F-7) and does nothing else. It issues no upload URL, no view URL, no download; it
reads no object body; it computes no checksum; it moves nothing between buckets.

### 19.2 The storage-key chokepoint

P1 established `employee_document.repository.findByIdForStorage` as the sole method permitted to select
`storage_key`, and P2 added a test asserting exactly three call sites. F-7 needs keys in batches of 500,
which that method cannot serve.

**Resolution:** add a second permitted reader, `findSweepCandidates(orgId, mode, cutoff, limit)`, which
selects `id, storage_key, storage_backend, document_type_id, deleted_at` and nothing else.
- P2's existing three-call-site test on `findByIdForStorage` stays **unmodified and still passes**.
- T-32 adds a parallel assertion: `findSweepCandidates` has exactly one call site, in
  `document_automation.service`, and no other repository method anywhere in the module selects `storage_key`.

This keeps the chokepoint property (a small, enumerable, tested set of readers) while admitting the one new
legitimate use. Loosening the original test instead would have traded a guarantee for a convenience.

### 19.3 Consistency invariants

| Invariant | How it holds |
|---|---|
| Every live `employee_documents` row with `storage_backend='s3'` points at an existing object | Preserved: P4 deletes objects only for rows it is about to delete, and only for rows that are already soft-deleted or abandoned |
| No object exists without a row pointing at it | Preserved by object-before-row ordering plus keep-row-on-failure (R-25). The failure mode is the *safe* one: a row with no object, which is visible and repairable |
| A statutory document's object is never deleted by P4 | R-24, checked in the SQL predicate and again in the loop |
| `storage_key` never leaves the backend | D-20 preserved; §19.2 and §13.5 are the two new surfaces and both are tested |

### 19.4 Orphan detection

P4 adds no orphan reconciliation job. The two ways an orphan could arise are both closed: abandoned uploads
are swept (F-7 pass 1) and purges delete the object first. A bucket-versus-database reconciliation sweep is
a Phase-5 concern and is not invented here.

---

## 20. Background Jobs, Events & Integrations

### 20.1 Jobs

See §F-9 for schedules and rationale. Structural rules:
- Each cron file contains a single `cron.schedule(...)` call and a `console.log('[Cron] Registered …')`,
  and imports its job from `document_automation.service`. No logic in the cron file.
- Registration is inside `server.js`'s existing `if (os.platform() === 'linux')` block via bare `require`.
- `runStartupCatchUp()` is appended to the existing 30-second-delayed startup call and runs
  `runExpiryFlip` + `runNotificationDispatch` only.
- Every job is bounded: `CRON_ORG_LIMIT = 100` orgs per run, plus a per-org batch cap.

### 20.2 Events

P4 introduces **no event bus, no pub/sub, and no webhook**. "Events" in this module are rows in
`document_notifications` and rows in `document_audit_logs`. Both are durable, queryable and ordered. Adding
an in-process emitter would create a second, non-durable notification path that a restart would lose.

### 20.3 Email integration

One new template, `src/common/templates/document_notification.html`: a generic shell with `{{HEADLINE}}`,
`{{BODY}}`, `{{CTA_LABEL}}`, `{{CTA_URL}}`, `{{ORG_NAME}}` placeholders, matching the structure of the
existing `payroll_action_reminder.html`.

Five `TEMPLATE_MAP` entries — one per `event_type` — all pointing at that one file, each carrying its own
subject line. Five near-identical HTML files would be five places to fix the same rendering bug; five map
entries give per-event subjects without that cost.

One new sender, `sendDocumentNotificationEmail({ email, orgName, headline, body, ctaLabel, ctaUrl })`,
modelled on the existing `sendPayrollActionReminderEmail`.

**`{{CTA_URL}}` is always an application route** (e.g. `/documents/requests/{id}`), never a signed storage
URL (R-18). A signed URL in an inbox is a bearer credential with a TTL nobody controls and a forwarding
behaviour nobody can audit.

### 20.4 External integrations

**None.** No signature provider, no scanner, no SMS gateway, no calendar. All are Phase 5 or out of scope
(§1.3).

---

## 21. Org Settings

Eight new rows, **#71–#78**, appended to `public/md_settings/org_settings_registry.md`.
All are enforced at three layers, as P1 established: Joi in `document_hr.validator`, `SETTINGS_CAPS` /
`assertReminderSchedule` in `document_settings.service`, and a CHECK constraint in `00053` (§6.3).

| # | Key | Type | Default | Cap | Consumed by |
|---|---|---|---|---|---|
| 71 | `document_expiry_reminder_days` | `int[]` | `[30,15,7]` | ≤ 6 entries, each 0–365, de-duplicated, descending | `resolveExpirySchedule` (F-6 N-2), fallback when the type's array is empty |
| 72 | `document_notify_hr_on_upload` | bool | `false` | — | F-6 N-1 enqueue gate |
| 73 | `document_notify_expiry` | bool | `false` | — | F-6 N-2 enqueue gate |
| 74 | `document_notify_pending_acknowledgement` | bool | `false` | — | F-6 N-3 enqueue gate |
| 75 | `document_notify_request_raised` | bool | `false` | — | F-6 N-5 enqueue gate |
| 76 | `document_notify_request_overdue` | bool | `false` | — | F-6 N-4 enqueue gate |
| 77 | `document_request_default_due_days` | int | `7` | 1–365 | `request.create` when `due_on` is omitted |
| 78 | `document_onboarding_completeness_threshold` | int (%) | `100` | 0–100 | `computeCompleteness` → `meets_threshold` |

**Why every toggle defaults to `false`.** Deploying P4 must send zero email until an org deliberately opts
in. The failure mode of the opposite default — a migration silently enabling outbound mail to every employee
in every tenant on deploy day — is unrecoverable and reputationally expensive. The state machine runs
regardless (R-16), so an org that enables a toggle a month later starts receiving accurate notices
immediately, with no backfill and no burst (the content-addressed dedupe keys mean an org enabling
`document_notify_expiry` gets only the buckets that are current, not every bucket that has passed).

**Setting #65 `document_retention_days` becomes live.** It has shipped since P1 and has never been read.
R-26 makes it the org-wide retention **floor**. Because both it and `document_types.retention_days` default
to 2555, no existing org's behaviour changes. The registry entry for #65 must be updated to say it is now
consumed, by F-7.

**No new guard of the `SCAN_PROVIDER_NOT_CONFIGURED` kind is required.** Every new setting is safe to change
at any time: toggles only gate sending, the schedule only shapes future buckets, the due-days default only
affects new requests, and the threshold only affects a derived display field. None of them can invalidate
existing rows.

---

## 22. Edge-Case Discharge

The parent plan tags nine edge cases to Phase 4. Each is discharged below with the specific mechanism, and
each has a test.

| EC | Parent statement | Discharge | Test |
|---|---|---|---|
| **EC-1** (1/4) | Abandoned `pending_upload` rows must not accumulate | Half discharged in P1 by `isStaleUpload`'s inline reap. P4 adds F-7 pass 1, which is the only thing that can reach a row nobody ever touches again. The two predicates are deliberately different (`isStaleUpload` = URL TTL; `isAbandonedUpload` = 24 h grace) so a slow-but-genuine client is never reaped mid-upload. | T-16 |
| **EC-13** (2/4) | A new joiner must receive org documents published before they joined, and must never be retroactively non-compliant | Already discharged in P2 by `syncRecipients` dating `due_on` from sync time (D-h). P4 supplies the missing trigger (F-8). F-8 is forbidden from re-deriving due dates, which is what would re-open it. | T-38, T-39 |
| **EC-17** | A missed cron day must never produce a compliance false-negative | Already discharged in P1/P3 by `resolveDisplayStatus` and `isOverdue`. P4's contribution is **not to regress it**: §4.3 forbids simplifying those functions now that a cron persists the flip. | T-21 |
| **EC-18** | Exactly-once reminders across multiple instances and same-day double-fires | Two mechanisms by family: the unique dedupe index for content-addressed notices, the same-day conditional watermark claim for cadence notices. Both are database-level; neither relies on instance coordination. | T-20, T-28 |
| **EC-25** (1/4) | A document uploaded already past its expiry date | `classifyChecklistItem` orders `expired` above `satisfied`, so it never counts toward completeness. `resolveReminderBucket` returns `null` for a negative `daysUntil`, so it produces no reminder. F-4 flips it on the next run. | T-11 |
| **EC-26** | Enabling scanning later must not retroactively hide existing documents | Already structurally discharged in P1: `screenDocument` denies only `scan_status === 'infected'`; `not_scanned` passes. P4 adds no scanner (O-1) and changes nothing here. Recorded so a future phase does not "tighten" it by accident. | T-46 (asserts `not_scanned` passes) |
| **EC-28** | Statutory documents must never be swept | R-24: excluded in the SQL predicate **and** re-asserted in the loop before the delete call. A single check on an irreversible operation is not enough. | T-33 |
| **EC-29** | A storage delete failure must not orphan an object | Object-before-row ordering plus keep-row-on-failure (R-25). The surviving failure mode — a row with no object — is visible and repairable; the inverse is neither. | T-34 |
| **EC-31** | Concurrent duplicate requests | The partial unique index `document_requests_open_unique_idx` serialises; the loser gets `409 DUPLICATE_REQUEST` carrying the winner's id. No advisory lock. | T-27 |

**EC-11** is not in the parent's Phase-4 list but is discharged here because it was structurally impossible
before `document_requests` existed (K-5): R-9 blocks deactivation, and the `ON DELETE RESTRICT` FK blocks
deletion. Test T-5.

---

## 23. Implementation Sequence

Sixteen steps (0–15). Each names its verification. No step may begin before its predecessors are green.

| Step | Work | Verify |
|---|---|---|
| **0** | Re-run the baseline: `node --test tests/unit/document/*.test.js`. Confirm 312 pass / 0 fail. | If it is not 312/0, stop and reconcile before writing any P4 code. |
| **1** | Pure utils: `document_checklist.utils.js`, `document_reminder.utils.js`, `document_notification.utils.js`; constants in `document_defaults.js`. | T-11, T-12, T-13, T-16, T-20 green with no database. |
| **2** | Migration `00053` (tables, ALTERs, indexes, CHECKs, `down`). | T-47 (static shape assertions on the migration source). **Do not run it** — hand back per §25.1. |
| **3** | Models: `document_requests`, `document_notifications`; ALTER the two existing models. | Model definitions load; `db` initialises in the existing model-loading test. |
| **4** | Repositories: `document_request.repository`, `document_notification.repository`; new methods on `employee_document`, `org_document_recipient`, `org_document`, `document_type` repositories. | Unit tests with a stubbed model layer; attribute lists asserted. |
| **5** | `document_authority.utils` request action sets + `resolveRequestAuthority`. | T-3, full role × action × state matrix. |
| **6** | `document_request.service` (F-1) + validator. | T-1, T-2, T-4, T-27. |
| **7** | EC-11 guard in `document_type.service.setActive`. | T-5. |
| **8** | `document_checklist.service` (F-3). | T-25, T-26. |
| **9** | `document_notification.service` (F-5): enqueue, drain, purge. | T-14, T-15, T-22, T-23. |
| **10** | F-2 hooks in `document_upload.service`; containment comments at both inline sites. | T-6…T-10. |
| **11** | `document_automation.service`: `runExpiryFlip`, `runReminders`, `runSweeper`, `runRecipientTopUp`, `runNotificationDispatch`, `runStartupCatchUp`. | T-17…T-19, T-28…T-41. |
| **12** | Controllers, validators, routes for #80–#98; mount in `document.index.js`. | T-24, T-44; route-table assertion that all 19 paths resolve and that no new path shadows an existing one. |
| **13** | Settings: 8 keys through model, defaults, caps, `MUTABLE_FIELDS`, validator. | T-48 (each key round-trips; each cap rejects out-of-range; the array validator rejects 7 entries and accepts an empty array). |
| **14** | Email: template file, 5 `TEMPLATE_MAP` entries, `sendDocumentNotificationEmail`. Cron files. `server.js` registration + startup catch-up. | T-42, T-43, T-45. |
| **15** | Documentation: §28's five deliverables. | Files exist and are accurate; registries updated. |

**Steps 1–2 can be done in parallel with nothing else; steps 6, 8 and 9 are independent of each other
and can be parallelised across people. Step 14 must be last.**

**Full-suite gate.** After each of steps 6, 9, 11, 12 and 14, re-run the whole document suite. The count
must be 312 + (tests added so far), with zero failures and **zero modifications to the 312 pre-existing
assertions** other than the two explicitly sanctioned edits (`document_authority.utils.test.js` and
`document_settings.service.test.js`, both additive). If a pre-existing test needs changing for any other
reason, that is a signal that P4 has broken a P1–P3 contract; stop and re-examine.

---

## 24. Testing Requirements

All tests are `node --test` unit tests under `tests/unit/document/`, consistent with the module's existing
312. No test requires a database connection; repository and provider interactions are stubbed. The
migration is verified by **static assertions against its source text**, not by execution — the operator owns
execution (§25.1).

### 24.1 Test register

| ID | Subject | Asserts |
|---|---|---|
| T-1 | `document_request.service` | create / list / get / cancel / remind / createFromChecklist happy paths and every guard |
| T-2 | `document_request.validator` | due-date bounds, note length, cancel reason required, list filter enums |
| T-3 | `resolveRequestAuthority` | full matrix: {hr, manager-in-scope, manager-out-of-scope, manager-not-requester, subject, other} × {create, view, cancel, remind} × {open, overdue, fulfilled, cancelled} |
| T-4 | duplicate translation | a unique-violation becomes `409 DUPLICATE_REQUEST` with the existing id, never a 500 |
| T-5 | EC-11 | `setActive(false)` throws `409 DOCUMENT_TYPE_IN_USE` with one open request; succeeds with zero; an `overdue` request also blocks |
| T-6 | F-2 | an `open` request is fulfilled by a matching upload |
| T-7 | F-2 | an `overdue` request is fulfilled |
| T-8 | F-2 | no matching request ⇒ no update, **no audit row** |
| T-9 | F-2 | a second confirm does not re-fulfil or re-audit |
| T-10 | F-2 | the fulfilment shares the caller's transaction object |
| T-11 | `classifyChecklistItem` | all six states; `expired` outranks `satisfied` (EC-25); `requested` outranks `missing` |
| T-12 | `computeCompleteness` | 0 required ⇒ 100; 199/200 ⇒ 99, not 100; clamping |
| T-13 | payload safety | `buildPayload` whitelist; `assertPayloadClean` throws on each forbidden key; the forbidden list is a superset of the audit `SCRUBBED_KEYS` values; no template input field carries a URL other than the app CTA |
| T-14 | enqueue dedupe | a duplicate key returns zero rows and the outer transaction remains usable (asserted via the stub recording no rollback) |
| T-15 | claim | attempts consumed at claim; `attempts >= max` never claimed; stale `sending` reclaimed after the window; fresh `sending` not reclaimed |
| T-16 | abandonment predicates | `isAbandonedUpload` at 23 h / 24 h / 25 h; distinct from `isStaleUpload` at the URL TTL |
| T-17 | expiry flip | batching, loop termination, per-org cap |
| T-18 | expiry flip | a second run flips zero rows |
| T-19 | expiry flip | the query's predicate string contains `status = 'available'` and `expires_on IS NOT NULL`, matching `00049`'s index predicate (asserted against the migration source) |
| T-20 | `resolveReminderBucket` | exact-day hit; missed day still yields the same bucket; no bucket once recorded; `null` past expiry; `null` outside the window; `min` selection with an unsorted schedule |
| T-21 | EC-17 | `resolveDisplayStatus` reports `expired` for an `available` row with a past date, with **no** cron having run |
| T-22 | backoff | `min(2^attempts, 60)` minutes; `failed` at the cap |
| T-23 | toggles | every toggle off ⇒ zero enqueues; pass A still flips; F-4 still flips |
| T-24 | projections | `last_reminder_on` and `reminder_count` appear in no recipient or self-plane projection |
| T-25 | confidential checklist | a manager gets `state` but `document_id: null` for a type whose policy denies manager view |
| T-26 | missing profile | checklist returns the smallest required set and `profile_incomplete: true` |
| T-27 | EC-31 | two concurrent creates ⇒ one row, one `409` |
| T-28 | EC-18 | the watermark claim returns a row exactly once per entity per day under simulated concurrency |
| T-29 | cadence cap | reminders stop at `MAX_REMINDERS`; the entity stays visible |
| T-30 | pass ordering | pass A runs before pass D, so a request that goes overdue today is reminded today |
| T-31 | job independence | a throw in pass B does not prevent pass C |
| T-32 | storage chokepoint | `findSweepCandidates` has exactly one call site; no other repository method selects `storage_key`; the pre-existing `findByIdForStorage` three-call-site test is unchanged and still passes |
| T-33 | EC-28 | a statutory type is excluded by the predicate **and** by the in-loop re-assertion (tested by feeding the loop a statutory row the predicate "missed") |
| T-34 | EC-29 | an object-delete failure leaves the row and reports the error |
| T-35 | provider contract | `deleteObject` is called with a string in every call site (guards the payroll bug class) |
| T-36 | retention | effective days = `max(type, org)`; both defaults ⇒ 2555 |
| T-37 | outbox purge | `sent`/`skipped` purged past 90 days; `failed` never purged |
| T-38 | F-8 | a user created after publication gains a recipient row |
| T-39 | F-8 | `due_on` is dated from the sync, not from `published_at` |
| T-40 | F-8 | a second run inserts nothing |
| T-41 | F-8 | a document past `effective_to` is skipped |
| T-42 | cron files | each registers exactly one schedule, with the IST timezone, and contains no job logic |
| T-43 | startup catch-up | calls exactly `runExpiryFlip` and `runNotificationDispatch` |
| T-44 | manual triggers | org-scoped from `req.user.org_id`; a body `org_id` is ignored |
| T-45 | cron safety | a job that throws does not propagate out of the cron wrapper |
| T-46 | EC-26 | `screenDocument` passes `not_scanned` (regression guard on a P1 property P4 must not break) |
| T-47 | migration `00053` | static: table names, column names and types, the five ENUMs, all eight indexes with their exact predicates, the three CHECK constraints, and a `down` that reverses every `up` action |
| T-48 | settings | all 8 keys round-trip; caps reject out-of-range at Joi and at `assertCap`; the array validator rejects 7 entries, rejects 400, accepts `[]`, and de-duplicates |

### 24.2 Coverage requirements

- Every pure util function: 100 % branch coverage. They are where the decisions live.
- Every business rule R-1…R-30: at least one test that fails if the rule is removed.
- Every edge case EC-1, 11, 13, 17, 18, 25, 26, 28, 29, 31: a named test (§22).
- Every new error code: one test asserting the code, not just the status.
- Every concurrency case C-1…C-8: a test or a documented reason it is untestable at the unit level
  (C-3, C-5 and C-6 depend on `SKIP LOCKED` semantics and are asserted at the *query-shape* level —
  the test checks the SQL contains `FOR UPDATE SKIP LOCKED`, and the runtime behaviour is an operator
  verification item, §29 PR-12).

### 24.3 What is explicitly not tested here

Integration against a live database and a live S3, and the `EXPLAIN` confirmation of index usage. Both
require the remote environment the operator owns. They are listed as operator verification steps in §29,
and this plan makes no claim about them.

---

## 25. Migration & Deployment

### 25.1 Migration ordering — operator hand-back

`00053` **must not be run by the implementer.** Per standing project policy, migrations are executed by the
operator against the remote database. The implementer's obligations are: write it, verify it statically
(T-47), and hand it back with this note.

**Required order:**
```
00050  (document module, org documents)      ← still unrun
00051  (acknowledgements, signatures)        ← still unrun
00053  (requests, notifications)             ← new in this phase
```
`00053` depends on `00050` (it ALTERs `org_document_recipients`) and on `00049` (it ALTERs
`document_settings` and adds indexes to `employee_documents`). It does not depend on `00051`, but it must
still be applied after it to keep the sequence linear.

**Do not run `00051.down()` for any reason** — it destroys the acknowledgement and signature evidence
tables. If `00053` needs to be re-applied, run `00053.down()` and `00053.up()` only.

**Hard gate: `00053` must be applied before any P4 code is deployed** (E-10). The reverse order leaves every
P4 endpoint and cron failing on a missing relation. There is no graceful-degradation path and none should
be built — a feature flag that hides a missing table would hide a real deployment error.

### 25.2 Expand / contract

`00053` is a pure **expand**: new tables, new nullable-or-defaulted columns, new indexes. It removes
nothing and rewrites no data. Old code running against the new schema is unaffected (E-9), which makes a
rolling deploy safe.

`00053.down()` is destructive **of configuration only** — it drops the eight settings columns and the four
watermark/count columns. No document, acknowledgement, signature or audit row is touched. That is an
acceptable `down`, but an org that has customised its notification settings will lose those choices on a
rollback and must re-enter them.

### 25.3 Index creation cost

The two new indexes on `employee_documents` are partial and narrow, but `employee_documents` is the module's
largest table. If the operator's environment cannot tolerate the lock, both can be created with
`CREATE INDEX CONCURRENTLY` **outside** the migration transaction — noted here as an operator option, not
prescribed, because `CONCURRENTLY` cannot run inside the transaction the rest of `00053` needs.

### 25.4 Deployment sequence

1. Apply `00053`. Verify the eight indexes and three CHECK constraints exist.
2. Deploy the application. All notification toggles default `false`, so nothing is sent.
3. Confirm the five crons registered (Linux only) via the `[Cron] Registered …` log lines.
4. Trigger #88 (expiry flip) manually for one org. Expect a bounded flip count and matching audit rows.
   `EXPLAIN` the flip query and confirm `employee_documents_org_expiry_idx` is used (PR-11).
5. Trigger #92 (top-up) for one org. Expect new recipient rows only for employees who joined after a
   publication, with due dates in the future.
6. Trigger #91 (sweeper) for one org during a low-traffic window. **Review the candidate counts before
   accepting the run** — this is the only destructive job.
7. Enable notification toggles for **one pilot org**. Watch #87 for `failed` rows over 24 hours.
8. Roll toggles out to remaining orgs.

### 25.5 Rollback

Code rollback is safe at any point: the tables become unused, the crons stop, and every read path reverts to
pure derive-on-read, which was already correct. Schema rollback (`00053.down()`) should only follow a code
rollback, and costs the configuration described in §25.2.

There is no rollback for a sent email. This is the reason toggles default off and step 7 pilots one org.

---

## 26. Backward Compatibility

### 26.1 Non-breaking changes

| Change | Why it is safe |
|---|---|
| Two new tables | Nothing reads them but new code |
| 8 new `document_settings` columns | All `NOT NULL DEFAULT`; `getOrCreate` backfills by default; existing GET responses gain fields, which the module's clients tolerate (they have gained fields in P2 and P3) |
| 2 new `org_document_recipients` columns | Excluded from every projection (T-24) |
| 2 new partial indexes on `employee_documents` | Read performance only |
| 19 new endpoints | Additive; no existing path is shadowed (T-12 route assertion) |
| `fulfilled_request_id` on three confirm/link responses | Additive nullable field |
| Five new `TEMPLATE_MAP` entries and one sender | Additive |
| Setting #65 becoming live | Both sources default to 2555, so no org's retention changes on day one |

### 26.2 Behavioural changes that need a client change record

> **STATUS — both shipped ahead of P4 on 2026-09-24**, recorded in
> `public/md_updates/invitation_list_manager_daily_log_and_type_contracts_2026_09_24.md`.
> Three details differ from the description below, because it was written against P4's world:
>
> * the endpoint is **`PATCH /hr/types/:id/deactivate`** (reactivation is a separate route,
>   `PATCH /hr/types/:id/activate`) — there is no `/activation` route in the current router;
> * the `409` detail is **`{ open_employee_documents, open_org_documents }`**, not
>   `{ open_request_count }` — `document_requests` does not exist yet, so the guard counts the work
>   that does: employee documents in `pending_upload`/`pending_verification` and org documents in
>   `draft`. When P4 lands, add `open_document_requests` to the same `details` map and the same
>   error code; no client change is then needed beyond reading the new counter;
> * the validation rejection is **`400 VALIDATION_ERROR`**, not `422` — `validateOrThrow` throws
>   `400` for every Joi failure in this codebase, and deviating for one endpoint would be worse than
>   the theoretical status-code purity.
>
> Guarded by `tests/unit/document/type_deactivation_guard.test.js` and
> `tests/unit/document/type_mandatory_for_validator.test.js`.

Two, both requiring a dated record in `public/md_updates/` per standing project policy:

**1. Endpoint #22 (`PATCH /hr/types/:id/activation`) can now fail with `409 DOCUMENT_TYPE_IN_USE`.**
A call that always succeeded can now be rejected. Clients must surface the error and its
`{ open_request_count }` detail rather than assuming success. This is required by EC-11 (K-5) and is the
point of the feature — an org must not be able to retire a type it is still actively chasing.

**2. Endpoints #16 / #17 tighten `mandatory_for` from `Joi.object()` to the six-key criteria schema.**
Keys outside `CRITERIA_KEYS` (`target_departments`, `target_locations`, `target_employment_types`,
`target_job_statuses`, `included_users`, `excluded_users`) now produce `422`. Previously any object was
stored — and, because nothing read it, silently ignored. P4 is the first reader (F-3), so an unvalidated
`mandatory_for` would now silently produce a wrong checklist. Tightening at the boundary is the only way to
make the field mean something.

**Migration risk:** existing rows may already contain arbitrary JSON, written while validation was loose.
`normaliseCriteria` ignores unknown keys on read, so existing rows produce a defined (possibly
over-broad — `{}` means "everyone") result rather than an error. The change record must tell clients to
review any type whose `mandatory_for` was set before this release. **No data migration is performed**, because
rewriting stored tenant configuration based on a guess about intent is worse than reporting it.

### 26.3 What explicitly does not change

Every endpoint #1–#79 keeps its path, method, success status, request shape and response shape, except for
the two entries above and the additive fields in §26.1. No existing error code changes meaning. No existing
status enum gains or loses a value. No existing column is dropped, renamed or retyped. `resolveDisplayStatus`,
`isOverdue`, `screenDocument`, `resolveEffectivePolicy`, `matchesCriteria`, `syncRecipients` and
`findByIdForStorage` all keep their exact current signatures and semantics.

---

## 27. Open Decisions, Risks and Carry-over

### 27.1 Open decisions resolved in this plan

| ID | Decision | Resolution | Rationale |
|---|---|---|---|
| O-1 | Parent Open Decision 3: malware scanning, "confirm before Phase 4" | **No scanner in Phase 4.** The `document_scan_required` setting stays, still guarded by `SCAN_PROVIDER_NOT_CONFIGURED`; `screenDocument` keeps denying only `infected`. | No provider is configured, none is procured, and EC-26's grandfathering property is already structural. Building an adapter with no provider behind it is speculative work. Revisit in Phase 5 with a named provider. |
| O-2 | Notification channels | **Email only**, with a `channel` enum on the table so a second channel is an enum addition. | The parent names email. A channel abstraction with one implementation is the "flexibility that wasn't requested". |
| O-3 | Reminder dedupe granularity | **Two families** (§17.2). | One family cannot serve both one-shot and recurring notices. |
| O-4 | Watermark placement | **Per entity**, not per org (§17.3). | A per-org watermark introduces a crash window that loses a whole day, for no added guarantee. |
| O-5 | Retention when type and org disagree | **The larger wins** (R-26). | Purge is irreversible. |
| O-6 | Onboarding mandatory set as a setting | **Void** (V-1); only the threshold becomes a setting. | Avoids a second source of truth. |
| O-7 | Due-date extension on a request | **Not in scope.** Cancel and re-raise. | Two auditable acts beat one mutable field; nothing in the parent asks for extension. |

### 27.2 Open decisions deferred

| ID | Question | Deferred to | Why it can wait |
|---|---|---|---|
| O-8 | Should a fulfilled request re-open if the fulfilling document is later deleted or rejected? | Phase 5 | `fulfilled_document_id` is `ON DELETE SET NULL`, so the case is representable and recoverable by raising a new request. Auto-reopening needs a policy decision (does a *rejected* verification reopen it? a *replaced* version?) that nobody has stated. |
| O-9 | Should managers receive the new-upload notice for their reports? | Phase 5 | The parent says "new-upload notice to HR". Adding managers multiplies outbound volume and needs its own toggle. |
| O-10 | Digest emails (one daily summary instead of N notices) | Phase 5 | The outbox schema supports grouping later. Building it now is speculative. |
| O-11 | Orphan reconciliation between the bucket and the database | Phase 5 | §19.4: both orphan-creating paths are closed by P4. |

### 27.3 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RK-1 | The first org to enable notifications receives a burst | Low | Medium | Content-addressed dedupe means only *current* buckets fire, not historical ones. Step 7 of §25.4 pilots one org. |
| RK-2 | The sweeper deletes something it should not | Low | **Severe, irreversible** | Statutory checked twice; retention floor takes the larger value; per-row transactions; object-before-row; audit per row; manual trigger is org-scoped and its candidate counts are reviewed before acceptance (§25.4 step 6). |
| RK-3 | `mandatory_for` tightening rejects a client's existing payload | Medium | Low | Documented change record; `normaliseCriteria` still tolerates legacy stored values on read. |
| RK-4 | The expiry scan does not use the partial index because the predicate drifted | Low | Medium | T-19 asserts the predicate text against the migration source; PR-11 is the operator's `EXPLAIN` confirmation. |
| RK-5 | Cadence reminders duplicate across instances under clock skew | Low | Low | E-8: bounded to one extra email per entity per skew event; the reminder cap still applies. |
| RK-6 | Role fan-out duplicates on retry | Medium | Low | Documented in §F-5; bounded by 5 attempts; affects HR staff only. |
| RK-7 | `00053` is deployed after the code | Low | High | §25.1 hard gate; §25.4 step ordering. |

### 27.4 Carry-over defects — found, **not fixed** by this phase

These were observed while reading source for scope reconstruction. None is in P4's scope; all are recorded
so they are not lost, and **none should be copied as a pattern**.

| ID | Defect | Location | Note |
|---|---|---|---|
| D-2 | A duplicated `requires_verification` OR expression | `document_upload.service.js` ~line 335 | Carry-over from P1. Harmless, redundant. |
| D-3 | `reference_url` remains in `LIST_ATTRIBUTES` | `employee_document.repository.js` ~line 23 | Carry-over from P2. `reference_url` is on the audit scrub list but is returned in list responses. Worth a decision in Phase 5. |
| D-4 | A mid-function `require` | `document_audit.service.js` ~line 70 | Carry-over. Style only. |
| D-5 | `DOCUMENTS_API_CONTRACT.md` and the P1/P2/P3 completion reports do not exist | `public/md_documents/` | P3 §27 deliverables 3–5. **P4 discharges the contract document** (§28) because P4 is the first phase to add a durable async surface clients must poll; the missing P1–P3 completion reports remain outstanding. |
| D-6 | `aws-s3.config.js` reads `process.env.PAYROLL_S3_BUCKET \|\| null` with **no `APP_S3_BUCKET` fallback**, although the warning text mentions one | `src/infrastructure/aws-s3/aws-s3.config.js` | Parent D-5 was only half implemented. The document module therefore shares payroll's bucket. Functional today; a surprise for whoever tries to split them. |
| D-7 | ~~`_bestEffortDeleteObject` calls `s3.deleteObject({ key })` against a **positional-string** provider signature~~ **FIXED 2026-09-24** — the key is now passed positionally, and the object is deleted *before* the pointer row so a failed delete keeps the row for the next pass instead of orphaning the object. Regression tests added to `tests/unit/payroll/attachment_sweeper.test.js`. | `payroll/services/payroll_automation.service.js` | The call threw, is caught, returns `false` — so **payroll's attachment retention sweep currently deletes no S3 objects at all**. Outside P4's scope (different module), but P4's F-7 must not copy it, and T-35 exists specifically to catch this bug class in the document module. This is worth raising with whoever owns payroll. |

D-1 from the earlier carry-over list (a leaked transaction in `setActive`) appears to have been **fixed**;
since P4 modifies `setActive`, the implementer should confirm the transaction is still correctly closed
after adding the EC-11 guard.

---

## 28. Documentation Deliverables

Six artefacts. The phase is not complete without them.

| # | File | Contents |
|---|---|---|
| 1 | `public/md_documents/phases/phase4_implementation_plan.md` | This document. |
| 2 | `public/md_updates/documents_phase4_requests_and_notifications_<YYYY_MM_DD>.md` | The frontend change record required by standing project policy. Must cover: the 19 new endpoints with request/response shapes; the additive `fulfilled_request_id` field; **the two behavioural changes in §26.2** (the new `409` on #22, and the `mandatory_for` tightening with its "review your existing types" advisory); the 8 new settings keys. |
| 3 | `public/md_documents/DOCUMENTS_API_CONTRACT.md` | The authoritative endpoint contract for #1–#98, modelled on `ATTENDANCE_API_CONTRACT.md`. Discharges part of carry-over D-5. Needed now because P4 is the first phase whose behaviour is asynchronous — clients must know what polls, what arrives by email, and what is derived on read. |
| 4 | `public/md_settings/org_settings_registry.md` | Append #71–#78. **Also update #65** to record that `document_retention_days` is now consumed by F-7 as the org-wide retention floor. |
| 5 | `public/md_system/api_registry.md` | Append #80–#98 under the Document Module's HR / Manager / Self sections. |
| 6 | `public/md_documents/phase4_completion_report.md` | Written at the end: what shipped, the final test count, the EC-1…EC-31 coverage table, the operator hand-backs still outstanding, and an explicit statement of what was verified versus what was not. |

---

## 29. Production-Readiness Checklist

| ID | Item | Owner | Done when |
|---|---|---|---|
| PR-1 | 312 pre-existing tests still pass, unmodified except the two sanctioned additive edits | implementer | full suite green |
| PR-2 | Every new endpoint enforces `org_id` from `req.user`, never from input | implementer | route/controller review + T-44 |
| PR-3 | Every `/:id` denial is byte-identical regardless of cause | implementer | T-3 and a controller review |
| PR-4 | No P4 response, log, audit row or notification payload contains `storage_key`, `document_number` or `reference_url` | implementer | T-13, T-24, T-32 |
| PR-5 | Every new transaction has `if (!t.finished) await t.rollback()` in its catch | implementer | grep + review |
| PR-6 | Every state change writes an audit row in the same transaction | implementer | T-1, T-6, T-17 |
| PR-7 | All five jobs are idempotent and safe to run concurrently | implementer | T-15, T-17, T-18, T-28, T-40 |
| PR-8 | Every notification toggle defaults `false` | implementer | T-48 |
| PR-9 | `deleteObject` is called with a string at every call site | implementer | T-35 |
| PR-10 | `00053` applied to the target environment, after `00050` and `00051` | **operator** | migration log |
| PR-11 | `EXPLAIN` confirms the expiry flip and expiry reminder scans use `employee_documents_org_expiry_idx` | **operator** | `EXPLAIN` output attached to the completion report |
| PR-12 | Concurrent-drain behaviour verified with two application instances | **operator** | no duplicate email observed over a 24 h window |
| PR-13 | Cron registration confirmed in the Linux environment | **operator** | five `[Cron] Registered …` lines in the startup log |
| PR-14 | Pilot org's notification volume reviewed over 24 h; zero `failed` rows unexplained | **operator** | #87 review |
| PR-15 | Sweeper dry-run candidate counts reviewed before the first destructive run | **operator** | §25.4 step 6 |
| PR-16 | All six documentation deliverables exist and are accurate | implementer | §28 |

Items marked **operator** cannot be performed by the implementer under this project's standing constraint
that migrations and remote-database operations are the operator's. This plan makes **no claim** that any of
PR-10…PR-15 has been done.

---

## 30. Final Acceptance Criteria

Phase 4 is complete when every one of the following holds and has been demonstrated, not assumed.

**Functional**

1. HR can raise, list, view, cancel and re-remind a document request; a manager can raise, list and cancel
   their own within their scope; an employee can list their own.
2. Uploading a document of the requested type closes the matching `open` or `overdue` request in the same
   transaction, and the confirm response reports the closed request's id.
3. A per-employee checklist derives its required set from `is_mandatory` + `mandatory_for` matched on
   `department_id`, `location_id`, `employment_type`, `job_status` and explicit include/exclude lists, and
   reports a completeness percentage that reaches 100 only when every required item is satisfied.
4. A daily job flips `available → expired` for past-dated documents, is idempotent, and is not required for
   any read to be correct.
5. Four notice classes plus the request-raised notice enqueue durably, drain outside any transaction, retry
   with bounded backoff, and end in `sent`, `failed` or `skipped`.
6. A daily job flips `open → overdue` and emits cadence reminders for overdue requests and pending
   acknowledgements, capped at five per entity.
7. A nightly sweeper removes abandoned uploads older than 24 h and purges soft-deleted rows past retention,
   object before row, never touching a statutory type.
8. A nightly top-up gives newly joined employees their recipient rows for still-effective published org
   documents, with due dates that never make them retroactively overdue.
9. All five jobs are registered under the Linux guard in IST, have manual HR triggers scoped to the caller's
   org, and two of them run at startup.

**The parent's Phase-4 exit criteria, verbatim**

10. An Aadhaar expiring in 30 days produces exactly one reminder per configured interval and never a
    duplicate on a same-day double-fire. *(§15.2, T-20)*
11. A missed cron day does not lose a reminder **and** does not send a stale one. *(`resolveReminderBucket`,
    §15.2, T-20)*
12. A fulfilled request closes automatically on upload. *(F-2, T-6, T-7)*
13. A statutory document is never swept. *(R-24, T-33)*
14. The expiry cron's query uses only the partial index, verified by `EXPLAIN`. *(T-19 for the predicate;
    PR-11 for the `EXPLAIN` — **operator**)*
15. Disabling notifications in settings stops sending without stopping state transitions. *(R-16, T-23)*

**Non-functional**

16. Zero new npm dependencies.
17. No existing endpoint among #1–#79 changes its path, method, success status, request shape or response
    shape, apart from the additive `fulfilled_request_id` field and the two documented behavioural changes
    in §26.2.
18. The 312 pre-existing document tests pass unmodified, apart from the two sanctioned additive edits.
19. Every edge case EC-1, 11, 13, 17, 18, 25, 26, 28, 29, 31 has a named discharge and a named test (§22).
20. All six documentation deliverables (§28) exist, including the dated `md_updates` change record and the
    completion report stating explicitly what was verified and what was handed to the operator.
21. `00053` is handed back unrun, with the ordering note in §25.1, and the completion report says so.

---

*End of Phase 4 implementation plan.*
