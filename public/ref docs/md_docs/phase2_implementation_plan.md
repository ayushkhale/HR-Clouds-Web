# Documents Module — Phase 2 Implementation Plan

**Status:** PLAN — not yet implemented
**Authored:** 2026-09-23
**Supersedes for Phase 2 purposes:** §9 "Phase 2" of `public/md_documents/implementation_plan.md` (that section is the original intent; this document is the reconstructed, reconciled scope and is the Source of Truth for Phase 2 development).
**Predecessor:** `public/md_documents/phases/phase1_implementation_plan.md` (DELIVERED — verified against source, see §2/§3).

---

## 1. Goal & Boundary

### 1.1 Phase 2 goal (one sentence)

Deliver the **org-issued document plane** — HR authors a policy or letter once, targets it at an audience by `department_id` / location / employment type / job status / explicit include-exclude, publishes it inside a single transaction that freezes the targeting and materialises the exact recipient set, and every targeted employee sees it in "My HR Documents" while nobody else can reach it even by id.

### 1.2 In scope

| # | Capability | Why it is Phase 2 |
|---|---|---|
| S-1 | `org_documents` table + model + repository | Parent §4.1 assigns it to P2; nothing equivalent exists |
| S-2 | `org_document_recipients` table + model + repository | Parent §4.1, P2 |
| S-3 | Migration `00050-create-org-documents.js` | New tables only; no P1 table is altered |
| S-4 | Pure targeting engine (`document_targeting.utils.js`) replicating `attendance_holidays` / `calendar_resolver.utils.js` semantics, keyed on `department_id` | Parent P2 line: "always keying on `department_id`" |
| S-5 | Org-document lifecycle `draft → published → superseded → retired`, plus `rejected` for declined manager proposals | Parent P2 line: "draft → publish → supersede → retire" |
| S-6 | Publish transaction: advisory lock → re-read `FOR UPDATE` → resolve audience → batched recipient insert → freeze targeting snapshot → supersede predecessor → audit | Parent D-14 + P2 exit criteria |
| S-7 | Frozen targeting snapshot including department/location **label** capture (EC-36) | Parent P2 line + EC-36 |
| S-8 | Org-plane pre-signed upload / re-issue / confirm, reusing the P1 S3 contract verbatim | P1 delivered the employee-plane implementation; the org plane needs the same flow over a different table |
| S-9 | Employee read surface "My HR Documents" — the read-side composer of D-2 | Parent P2 line |
| S-10 | Recipient `pending → viewed` transition with `first_viewed_at` | `viewed` is a declared state in parent §4.1 and is unreachable without this |
| S-11 | HR recipient roster + `waive` + `sync` (join top-up, D-14 second half) | The roster is required to *verify* the P2 exit criteria; `waived` is a declared state that must be reachable; `sync` is the minimal discharge of "topped up on join" without inventing an event bus |
| S-12 | Manager Tier-B: draft an org document for a direct report; HR publishes or rejects | Parent P2 line |
| S-13 | EC-19 proposer-scope re-check at approval time | Parent tags EC-19 as 1/2 in P2 |
| S-14 | Extension (not fork) of `document_authority.utils.js` with a recipient-anchored branch and an org-plane `VISIBLE_STATUS` set | Reuse mandate; the chokepoint must stay single |
| S-15 | Uniform denial parity: org-document id-addressed routes return the **identical** `404 DOCUMENT_NOT_FOUND` / "Document not found" as the employee plane | Parent §12.2; a probe must not be able to distinguish planes |

### 1.3 NOT in scope (and where it lives)

| Excluded | Owner |
|---|---|
| Acknowledgement capture, acknowledgement dashboards, `document_acknowledgements` table | **Phase 3** (parent §4). P2 only *stores* `requires_acknowledgement` / `acknowledgement_due_days` and computes `due_on`; the employee cannot acknowledge yet. |
| E-signature request flow, `document_signature_requests` | **Phase 3**. P2 stores `requires_signature` and the `signed` recipient state exists in the enum; nothing writes it in P2. |
| Notification outbox, reminder crons, expiry cron, employee-joined event hook | **Phase 4** (parent D-16). P2 exposes `recipients/sync` as the manual equivalent and leaves the seam for the cron. |
| Document requests (HR asks an employee to upload), `document_requests` | **Phase 4**. |
| Templates, merge fields, async/bulk publish, export jobs, `document_export_jobs` | **Phase 5**. Parent explicitly defers the async-publish threshold measurement to P5 (EC-16). |
| Virus scanning | Parent §22 / setting #65 — still provider-less. `scan_status` is deliberately **not** added to `org_documents`; see §3.4. |
| Any change to `employee_documents` behaviour, columns, endpoints or responses | Out. P2 is purely additive. |
| New org settings | Parent §11 assigns **zero** new settings to Phase 2. Confirmed — §21. |
| New npm dependencies | D-19: zero. Confirmed — §21. |

### 1.4 Honesty guard

Three claims in this plan are *design intent*, not verified facts, and are called out where they appear:

1. **Recipient-set upper bound.** EC-16 posits 5,000 recipients. The chunked insert is designed for it, but the wall-clock cost of a 5,000-row publish on this database has **not** been measured (no DB access in this environment). §24.6 defines the measurement that must run before sign-off; `ORG_PUBLISH_SYNC_LIMIT` is a provisional guard, not a benchmarked number.
2. **"Read-side composer" interpretation.** D-2 says the two planes are "merged for the employee by a read-side composer". §10 F-8 states the concrete reading adopted here and §26.1 O-1 flags it as an open decision the architect may overrule before Step 6.
3. **Phase-1 carry-over defects.** §26.2 lists defects found by reading P1 source. They are **not** silently fixed by this plan. Each is a listed decision with a recommended disposition.

---

## 2. Pre-Flight Checks

Run before Step 1. Each is a concrete command with an expected result.

| # | Check | Command | Expected |
|---|---|---|---|
| P-1 | Working tree clean, on `development` | `git status --porcelain` | empty |
| P-2 | `00049` is the latest document migration; `00050` is free | `ls src/infrastructure/postgres-sql/migrations | tail -5` | no `00050-*` present |
| P-3 | Document unit suite green before any change | `npx node --test "tests/unit/document/**/*.test.js"` | `pass 52 / fail 0` |
| P-4 | Full-suite baseline recorded | `npm test` | `tests 1082 / pass 1076 / fail 6`. The 6 failures are pre-existing and belong to the attendance department-summary and employee PII-projection suites, **not** to documents. Phase 2 must not change that number except by adding passes. |
| P-5 | Org-plane catalog rows exist | `grep -c "plane: 'org'" src/infrastructure/postgres-sql/seeders/009-seed-document-type-catalog.js` | `12` |
| P-6 | Key builder already supports the org plane | `grep -n "ORG" src/modules/document/utils/document_storage.utils.js` | `DOCUMENT_PLANE.ORG = 'org'` present |
| P-7 | Audit `entity_type` is a free STRING (no enum ALTER needed) | `grep -n "entity_type" src/modules/document/models/document_audit_logs.model.js` | `DataTypes.STRING(50)` |
| P-8 | Targeting source columns exist on profiles | `grep -n "department_id\|location_id\|employment_type\|job_status" src/modules/employee/models/employee_profiles.model.js` | all four present |
| P-9 | Feature flag key is live | `grep -rn "documents.access" src/modules/document/routes/` | present on all three route files |

**Migration execution constraint (standing).** This environment must never run `db:migrate` or open a connection to the remote database. `00050` is verified **statically** (shape review, `down()` symmetry, enum-drop completeness) and by unit tests over the pure logic; the file is then **handed back to the operator** to run. Same protocol as payroll `00047`/`00048`.

---

## 3. Completed-vs-Remaining Analysis

This is the reconciliation the Phase 2 scope was reconstructed from. Every row was established by reading Phase 1 **source**, not the Phase 1 plan.

### 3.1 Originally assigned to Phase 2 — already delivered by Phase 1 (REMOVE from P2)

| Original P2 assumption | Reality after P1 | Consequence |
|---|---|---|
| The org plane needs a storage-key shape | `document_storage.utils.js` already exports `DOCUMENT_PLANE.ORG` and `buildDocumentKey({orgId, plane, subjectId, documentId})` produces `org/{orgId}/documents/org/{subjectId}/{documentId}` | **Zero** key-builder work. P2 only decides what `subjectId` means for the org plane (§19.1: it is `document_group_id`). |
| Org document types must be created | Seeder `009` ships **12 `plane:'org'` catalog rows** (`employee_handbook`, `code_of_conduct`, `posh_policy`, `it_security_policy`, `leave_policy`, `travel_policy`, `warning_letter`, `show_cause_notice`, `performance_improvement_plan`, `relieving_letter_issued`, `experience_letter_issued`, `full_and_final_statement`) | **Zero** seeder work in P2. |
| `document_types` needs org-plane columns | `plane`, `requires_acknowledgement`, `requires_signature`, `is_confidential`, `allowed_content_types`, `max_file_size_bytes`, `allows_multiple`, `has_expiry` all exist and are copied on activation | **Zero** `document_types` migration. `00050` adds tables only. |
| HR must be able to activate org types | `POST /documents/hr/types/activate` copies `plane` straight from the catalog; org-plane types are activatable today | **Zero** new type endpoints. P2 only starts *using* the `plane=org` filter. |
| An audit trail must be built | `document_audit.service.record(entry, transaction)` is entity-agnostic (`entity_type` is `STRING(50)`), mandates a transaction, scrubs `storage_key` / `document_number` / `reference_url`; `recordDetached` exists for read-observing events | **Reuse verbatim** with `entity_type ∈ {'org_document','org_document_recipient'}`. No audit changes. |
| Pre-signed upload/confirm must be designed | P1 built it end to end: issue → client PUT → `confirm` with `HeadObject` (3 s timeout, `maxAttempts: 1`) **outside** any transaction, then a short transaction to promote | **Reuse the contract.** P2 writes a second implementation over `org_documents` but must not re-derive the contract. |
| Settings, caps, masking, expiry derivation | `document_defaults.js`, `document_expiry.utils.js` (`toIstDateString`, `isExpired`, `resolveDisplayStatus`), `document_type_rules.utils.js` (`resolveEffectivePolicy`, `resolveEffectiveConfidential`, `ORG_CEILING_BYTES`) all exist | **Reuse.** P2 adds no parallel policy resolver. |
| Org settings #58–#67 | Registered in P1 | Parent §11 assigns **no** new settings to P2. Confirmed. |

### 3.2 Originally assigned to Phase 2 — partially addressed by Phase 1 (REDUCED scope)

| Item | What P1 gave us | What P2 must still do |
|---|---|---|
| Authorization chokepoint | `resolveDocumentAuthority` + `screenDocument` with `VISIBLE_STATUS.{self,manager,hr}` — **subject-anchored only** (`subjectUserId` vs `accessibleUserIds`) | Add a **recipient-anchored** branch and an org-plane visible-status set **in the same file**, as new named exports. Do not modify the existing two functions' signatures or behaviour. |
| Upload service | `_loadTypeAndPolicy` hard-rejects `type.plane !== 'employee'` with `422 DOCUMENT_TYPE_PLANE_MISMATCH`; `_assertContentTypeAndSize` is private | Parameterise the plane guard (`expectedPlane`, default `'employee'` — no call-site change, no error-code change) and promote `_assertContentTypeAndSize` into `document_type_rules.utils.js` so both planes share one size/MIME gate. |
| Versioning | `document_version.utils.nextVersion(predecessor)` and `isReplaceable(status)` (employee statuses only) | Add `isOrgReplaceable(status)` (only `'published'`) in the same file. **Version is assigned at publish, not at draft creation** — the org analogue of D-11's "supersede at confirm, not at replace-issue". |
| Read service | `document_read.service` screens, lists and signs view URLs for the employee plane; contains a local `todayIST()` | New `document_org_read.service.js`; it calls `document_expiry.utils.toIstDateString` rather than creating a third copy of `todayIST()`. |
| Advisory-lock protocol | Namespaces `docgrp:`, `docslot:`, `doctypes:` established with `pg_advisory_xact_lock(hashtext(...))` taken **before** row locks | Add exactly one namespace: `docorg:{orgId}:{documentGroupId}`. Same helper shape. |

### 3.3 Originally assigned to Phase 2 — still fully outstanding (the CORE of P2)

`org_documents` table · `org_document_recipients` table · migration `00050` · targeting engine · publish/supersede/retire lifecycle · frozen snapshot · batched materialisation · My-HR-Documents read surface · Manager Tier-B proposal flow · org-plane upload/confirm/view-url · recipient roster/waive/sync.

### 3.4 Originally assigned to Phase 2 — no longer applicable (DROP)

| Dropped | Reason |
|---|---|
| "Versioning of policies with supersede semantics" as a *separate* build item | It is not separable. It **is** the publish transaction (§10 F-4, step 7). Planning it as its own workstream would duplicate the advisory lock and the `FOR UPDATE` re-read. Folded into F-4. |
| A generic "document plane abstraction" / shared base repository | D-2 is explicit that the two planes are **never** a shared table. A shared repository base for two tables with different anchors and different lifecycles would be a single-use abstraction — rejected per the simplicity rule. The shared surface is the *utils* layer, which already exists. |
| `scan_status` on `org_documents` | `employee_documents.scan_status` exists because P1's employee uploads are user-supplied binaries. Org documents are authored by HR (a trusted role) and setting #65 (`document_scan_required`) is hard-blocked with `SCAN_PROVIDER_NOT_CONFIGURED` in P1 anyway. A permanently-`not_scanned` column is dead weight. If a scan provider lands (Phase 4+), the column is added then, together with the employee-plane wiring. **Recorded as a deliberate deviation from `employee_documents`' shape.** |

### 3.5 Responsibilities that MOVED between phases

| Responsibility | Was | Now |
|---|---|---|
| MIME/size gate | private `document_upload.service._assertContentTypeAndSize` | `document_type_rules.utils.assertUploadAllowed(policy, { contentType, sizeBytes })` — pure, unit-testable, used by both planes |
| Plane guard | hard-coded `'employee'` literal in the upload service | parameter `expectedPlane` on the same function, default `'employee'` |
| "Top-up on join" (D-14, 2nd half) | implied Phase 2 by D-14 | **split**: P2 ships the idempotent `syncRecipients` service method + HR endpoint; **Phase 4** wires it to the employee-created event / cron. P2 closes the compliance hole manually, P4 automates it. |
| Async bulk publish threshold | implied by EC-16 | stays **Phase 5** (parent: "measured in P5"). P2 ships a hard synchronous guard instead (§10 F-4). |

---

## 4. Phase 1 → Phase 2 Dependency Analysis

| P1 component | P2 dependency | Direction of change |
|---|---|---|
| `document_types` (table + repository) | `org_documents.document_type_id` FK; plane / confidentiality / ack / signature defaults read from it | **read-only** |
| `document_type_rules.utils.resolveEffectivePolicy` | supplies `maxFileSizeBytes`, `allowedContentTypes`, `isConfidential`, `managerCanRequest` for org uploads | **extend with `assertUploadAllowed`; no behaviour change** |
| `document_type_rules.utils.resolveEffectiveConfidential(type, doc)` | D-12 tighten-only applies identically to org documents | **read-only** |
| `document_storage.utils` (`buildDocumentKey`, `DOCUMENT_PLANE`) | org key = `org/{orgId}/documents/org/{groupId}/{documentId}` | **read-only** |
| `common/utilities/object_storage.utils` (presign PUT/GET, HeadObject, deleteObject) | identical usage | **read-only** |
| `document_audit.service` | `record(...)` in-transaction for every write; `recordDetached` for `org_document.viewed` | **read-only** |
| `document_settings.service.getOrCreate` | `document_view_url_ttl_seconds`, `document_upload_url_ttl_seconds`, `document_max_file_size_bytes`, `manager_can_view_team_documents` | **read-only** |
| `document_authority.utils` | the single authorization chokepoint | **additive exports only** |
| `document_version.utils` | `nextVersion` reused | **additive export `isOrgReplaceable`** |
| `document_expiry.utils` | `toIstDateString` for `due_on` and effective-window comparisons; `resolveDisplayStatus` pattern mirrored for the org variant | **read-only** |
| `document_upload.service._loadTypeAndPolicy` | needed with `plane='org'` | **parameterised (backward-compatible)** |
| `document.index.js` mounting | three new route groups hang off the three existing mounts | **additive route registration** |
| `hierarchy_access.getAccessibleUserIds(orgId, requesterUser)` | manager Tier-B scope + EC-19 re-check | **read-only**; EC-19 calls it with a synthetic proposer principal `{ id: proposed_by, orgId, role: 'manager' }` |
| `employee_profiles` (`department_id`, `location_id`, `employment_type`, `job_status`) | targeting resolution input | **read-only**; always `department_id`, never the free-text `department` |
| `organization_departments`, `organization_locations` | criteria validation + label snapshot | **read-only** |
| `requireFeature('documents.access')` | gates all new routes | **read-only** |

**Nothing in Phase 1 is deleted, renamed, or changed in observable behaviour by this plan.** The only edits to P1 files are: two additive exports in `document_authority.utils.js`, one additive export in `document_version.utils.js`, one additive export in `document_type_rules.utils.js`, one default-valued parameter in `document_upload.service.js`, and route registrations in `document.index.js` plus the manager and self route files.

---

## 5. Directory Structure & Wiring

### 5.1 New files

```
src/infrastructure/postgres-sql/migrations/
  00050-create-org-documents.js                 NEW

src/modules/document/models/
  org_documents.model.js                        NEW
  org_document_recipients.model.js              NEW

src/modules/document/repositories/
  org_document.repository.js                    NEW
  org_document_recipient.repository.js          NEW

src/modules/document/services/
  document_org.service.js                       NEW  writes: draft / update / file / confirm / publish / replace / retire / reject / delete
  document_org_read.service.js                  NEW  reads: HR list-detail-versions-view-url-roster, manager list, employee shelf
  document_recipient.service.js                 NEW  materialise / sync / waive / mark-viewed

src/modules/document/utils/
  document_targeting.utils.js                   NEW  (pure)
  document_org_rules.utils.js                   NEW  (pure)

src/modules/document/controllers/
  document_org_hr.controller.js                 NEW

src/modules/document/validators/
  document_org.validator.js                     NEW

src/modules/document/routes/
  document_org_hr.routes.js                     NEW
```

Manager-plane and self-plane org handlers are added to the **existing** manager/self controllers and route files rather than new ones: those surfaces gain 8 and 3 endpoints respectively, which does not justify a fourth and fifth route file, and both already own their audience's `ctx()` / `accessibleIds()` helpers.

### 5.2 Edits to existing files (exhaustive)

| File | Edit | Risk |
|---|---|---|
| `src/infrastructure/postgres-sql/models.index.js` | register `OrgDocument`, `OrgDocumentRecipient` + associations | none (additive) |
| `src/modules/document/document.index.js` | `app.use('/api/v1/documents/hr', orgHrRoutes)` mounted **after** the existing HR router | see 5.3 |
| `src/modules/document/routes/document_manager.routes.js` | 8 new routes under `/org-documents` | see 5.3 |
| `src/modules/document/routes/document_self.routes.js` | 3 new routes under `/me/hr-documents` | see 5.3 |
| `src/modules/document/controllers/document_manager.controller.js` | 8 new handlers | none |
| `src/modules/document/controllers/document_self.controller.js` | 3 new handlers | none |
| `src/modules/document/validators/document_manager.validator.js` | manager org-draft schemas | none |
| `src/modules/document/validators/document_self.validator.js` | `/me/hr-documents` list query schema | none |
| `src/modules/document/utils/document_authority.utils.js` | `+ ORG_VISIBLE_STATUS`, `+ screenOrgDocument`, `+ resolveOrgDocumentAuthority` | none (additive exports) |
| `src/modules/document/utils/document_version.utils.js` | `+ isOrgReplaceable` | none |
| `src/modules/document/utils/document_type_rules.utils.js` | `+ assertUploadAllowed` | low — `document_upload.service` is switched to call it; behaviour must be byte-identical (§24 T-1) |
| `src/modules/document/services/document_upload.service.js` | `_loadTypeAndPolicy(orgId, typeId, t, { expectedPlane = 'employee' } = {})`; `_assertContentTypeAndSize` delegates to the util | low — the default preserves every existing call |

### 5.3 Route-ordering traps

1. **Mount order.** `document_org_hr.routes.js` mounts on the *same* base (`/api/v1/documents/hr`) as `document_hr.routes.js`. Express matches routers in registration order. The existing router declares `/documents/:id`; the new one declares `/org-documents/:id`. The literal prefixes differ, so there is no collision — but the new router is mounted **after** the existing one so any future ambiguity resolves in favour of already-shipped P1 routes.
2. **Static before param, within the new router.** `/org-documents/proposals` and `/org-documents/groups/:groupId` must be declared **before** `/org-documents/:id`.
3. **Manager router.** `/org-documents` handlers must be declared before the existing `/documents/:id` group is *not* required (different literal prefix), but `/org-documents/mine` must precede `/org-documents/:id`.
4. **Self plane.** `/me/hr-documents` is a new literal sibling of `/me/documents`. Express does not prefix-match across segments, so `/me/documents/types` and `/me/hr-documents` cannot collide.
5. **Express 5 `req.query` is a getter — never assign to it.** Every list handler runs `validateOrThrow(schema, req.query)` and uses the returned object, exactly as the P1 controllers do.

---

## 6. Database Schema & Migration `00050`

### 6.0 Migration shape

One file, `00050-create-org-documents.js`, mirroring `00049` exactly:

- a single `queryInterface.sequelize.transaction()` wrapping `up()`;
- tables created in FK order (`org_documents` first, then `org_document_recipients`);
- every `addIndex` named explicitly and passed `{ transaction }`;
- partial-unique indexes and `CHECK` constraints issued as raw SQL with `{ transaction }`;
- `down()` drops the tables in reverse order and then `DROP TYPE IF EXISTS "<enum>" CASCADE` for **every** enum type created here (Postgres leaves enum types behind after `dropTable`) — `enum_org_documents_status`, `enum_org_documents_storage_backend`, `enum_org_document_recipients_state`, `enum_org_document_recipients_source`.

Self-referencing FK note: `org_documents.supersedes_id` references `org_documents(id)`. `00049` handles the identical case on `employee_documents` by declaring the FK inline in `createTable`; do the same.

### 6.1 `org_documents`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | UUID PK, `defaultValue: UUIDV4` | no | The service generates the id **before** the transaction because it is a component of the object key; the DB default exists only for direct inserts. Same comment as `employee_documents`. |
| `org_id` | UUID FK `organizations(id)` ON UPDATE CASCADE ON DELETE CASCADE | no | |
| `document_type_id` | UUID FK `document_types(id)` ON UPDATE CASCADE ON DELETE RESTRICT | no | must be `plane='org'`, enforced in the service (cross-table CHECK is not expressible) |
| `document_group_id` | UUID | no | stable across all versions of a policy; set to a fresh UUID at first draft, copied on replace |
| `version` | INTEGER, default 1 | no | **authoritative value assigned at publish**, not at draft creation |
| `supersedes_id` | UUID FK `org_documents(id)` ON DELETE RESTRICT | yes | set at publish |
| `title` | STRING(200) | no | |
| `description` | TEXT | yes | |
| `status` | ENUM(`draft`,`published`,`superseded`,`retired`,`rejected`) | no, default `draft` | see §3.4 and §14 for why there is no `pending_upload` and no `deleted` value |
| `effective_from` | DATEONLY | yes | IST date; null = effective immediately on publish |
| `effective_to` | DATEONLY | yes | IST date; null = no end |
| `target_departments` | ARRAY(UUID), default `[]` | no | editable while `draft`; frozen at publish |
| `target_locations` | ARRAY(UUID), default `[]` | no | |
| `target_employment_types` | ARRAY(STRING), default `[]` | no | values from `employee_profiles.employment_type` |
| `target_job_statuses` | ARRAY(STRING), default `[]` | no | values from `employee_profiles.job_status` |
| `included_users` | ARRAY(UUID), default `[]` | no | |
| `excluded_users` | ARRAY(UUID), default `[]` | no | |
| `targeting` | JSONB | yes | **frozen resolution record**, written once at publish, never updated. Shape in §6.3. Null while `draft`. |
| `requires_acknowledgement` | BOOLEAN, default false | no | seeded from the type at draft creation, overridable upward only (§12 R-40) |
| `acknowledgement_due_days` | INTEGER | yes | 1–365; required when `requires_acknowledgement` |
| `requires_signature` | BOOLEAN, default false | no | stored in P2; consumed in P3 |
| `is_confidential` | BOOLEAN, default false | no | D-12 tighten-only against the type |
| `storage_backend` | ENUM(`s3`,`reference`), default `s3` | no | |
| `storage_key` | TEXT | yes | never returned, logged or audited |
| `reference_url` | TEXT | yes | |
| `file_name` | STRING(255) | yes | never a path component |
| `content_type` | STRING(100) | yes | |
| `size_bytes` | INTEGER | yes | |
| `checksum_sha256` | STRING(64) | yes | |
| `confirmed_at` | TIMESTAMPTZ | yes | set when `HeadObject` verification succeeds |
| `published_by` | UUID FK `users(id)` ON DELETE RESTRICT | yes | |
| `published_at` | TIMESTAMPTZ | yes | |
| `superseded_at` | TIMESTAMPTZ | yes | |
| `retired_by` | UUID FK `users(id)` ON DELETE RESTRICT | yes | |
| `retired_at` | TIMESTAMPTZ | yes | |
| `retirement_reason` | STRING(500) | yes | |
| `proposed_by` | UUID FK `users(id)` ON DELETE RESTRICT | yes | D-15 quartet — the manager who drafted it |
| `approved_by` | UUID FK `users(id)` ON DELETE RESTRICT | yes | D-15 quartet — the HR user who published/rejected |
| `actioned_at` | TIMESTAMPTZ | yes | D-15 quartet |
| `rejection_reason` | STRING(500) | yes | D-15 quartet |
| `recipient_count` | INTEGER, default 0 | no | denormalised counter, written at publish and on every successful `sync`; a read convenience, never the authority (the authority is `COUNT(*)` on the roster) |
| `created_by` | UUID FK `users(id)` ON DELETE RESTRICT | no | |
| `updated_by` | UUID FK `users(id)` ON DELETE RESTRICT | yes | |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | | paranoid |

**Indexes**

| Name | Definition |
|---|---|
| `org_documents_org_status_idx` | `(org_id, status)` |
| `org_documents_org_group_idx` | `(org_id, document_group_id)` |
| `org_documents_org_type_status_idx` | `(org_id, document_type_id, status)` |
| `org_documents_published_group_unique_idx` | raw SQL: `CREATE UNIQUE INDEX ... ON org_documents (org_id, document_group_id) WHERE status = 'published' AND deleted_at IS NULL` |
| `org_documents_org_proposed_idx` | raw SQL, partial: `(org_id, proposed_by) WHERE status = 'draft' AND proposed_by IS NOT NULL AND deleted_at IS NULL` — the HR proposals queue and the manager's "my drafts" list |
| `org_documents_org_effective_to_idx` | raw SQL, partial: `(org_id, effective_to) WHERE status = 'published' AND effective_to IS NOT NULL AND deleted_at IS NULL` — created now so the Phase-4 expiry cron needs no migration |

`org_documents_published_group_unique_idx` is the structural guarantee behind "only one live version of a policy at a time". The advisory lock (§16 C-12) is the *ordering* mechanism; this index is the *correctness* backstop, and a `23505` on it is translated to `409 ORG_DOCUMENT_ALREADY_PUBLISHED`.

**CHECK constraints** (raw SQL, named)

| Name | Predicate |
|---|---|
| `org_documents_version_check` | `version >= 1` |
| `org_documents_backend_shape_check` | `(storage_backend = 's3' AND reference_url IS NULL) OR (storage_backend = 'reference' AND storage_key IS NULL)` |
| `org_documents_effective_window_check` | `effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from` |
| `org_documents_ack_shape_check` | `(requires_acknowledgement = false AND acknowledgement_due_days IS NULL) OR (requires_acknowledgement = true AND acknowledgement_due_days BETWEEN 1 AND 365)` |
| `org_documents_published_shape_check` | `status NOT IN ('published','superseded','retired') OR (published_at IS NOT NULL AND published_by IS NOT NULL AND targeting IS NOT NULL)` |
| `org_documents_rejected_shape_check` | `status <> 'rejected' OR (rejection_reason IS NOT NULL AND approved_by IS NOT NULL AND actioned_at IS NOT NULL)` |
| `org_documents_retired_shape_check` | `status <> 'retired' OR (retired_at IS NOT NULL AND retired_by IS NOT NULL)` |

`org_documents_published_shape_check` makes it structurally impossible to have a published document with no frozen targeting snapshot — the single most important invariant of this phase.

### 6.2 `org_document_recipients`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | UUID PK, `defaultValue: UUIDV4` | no | |
| `org_id` | UUID FK `organizations(id)` ON DELETE CASCADE | no | denormalised so the employee's shelf query never joins to `org_documents` for tenancy |
| `org_document_id` | UUID FK `org_documents(id)` ON UPDATE CASCADE ON DELETE RESTRICT | no | |
| `user_id` | UUID FK `users(id)` ON UPDATE CASCADE ON DELETE RESTRICT | no | |
| `state` | ENUM(`pending`,`viewed`,`acknowledged`,`signed`,`waived`) | no, default `pending` | `acknowledged` / `signed` are written in Phase 3; the enum carries them now so P3 needs no `ALTER TYPE` |
| `source` | ENUM(`publish`,`sync`) | no, default `publish` | distinguishes the original materialisation from a later top-up (D-14) |
| `first_viewed_at` | TIMESTAMPTZ | yes | |
| `due_on` | DATEONLY | yes | `published_at (IST date) + acknowledgement_due_days`; null when the document needs no acknowledgement |
| `waived_by` | UUID FK `users(id)` ON DELETE RESTRICT | yes | |
| `waived_at` | TIMESTAMPTZ | yes | |
| `waived_reason` | STRING(500) | yes | |
| `created_at` / `updated_at` | TIMESTAMPTZ | no | **no `deleted_at`** — a recipient row is never deleted; `waived` is the exit (D-14) |

**Indexes**

| Name | Definition |
|---|---|
| `org_document_recipients_doc_user_unique_idx` | `UNIQUE (org_document_id, user_id)` — the idempotency backstop for publish retries and for `sync` |
| `org_document_recipients_doc_state_idx` | `(org_document_id, state)` — roster filters and Phase-3 compliance counts |
| `org_document_recipients_org_user_state_idx` | `(org_id, user_id, state)` — the employee's "My HR Documents" list |
| `org_document_recipients_org_due_idx` | raw SQL, partial: `(org_id, due_on) WHERE state IN ('pending','viewed') AND due_on IS NOT NULL` — created now for the Phase-4 reminder cron |

**CHECK constraints**

| Name | Predicate |
|---|---|
| `org_document_recipients_waived_shape_check` | `state <> 'waived' OR (waived_reason IS NOT NULL AND waived_by IS NOT NULL AND waived_at IS NOT NULL)` |
| `org_document_recipients_viewed_shape_check` | `state = 'pending' OR first_viewed_at IS NOT NULL OR state = 'waived'` — any state past `pending` other than an administrative waive implies the employee actually opened it |

### 6.3 Frozen `targeting` snapshot shape

Written exactly once, inside the publish transaction, never mutated:

```json
{
  "snapshot_version": 1,
  "criteria": {
    "target_departments": ["<uuid>"],
    "target_locations": [],
    "target_employment_types": ["full_time"],
    "target_job_statuses": [],
    "included_users": [],
    "excluded_users": ["<uuid>"]
  },
  "labels": {
    "departments": [{ "id": "<uuid>", "name": "Engineering" }],
    "locations": []
  },
  "resolved_at": "2026-09-23T07:12:44.100Z",
  "resolved_count": 412,
  "scope": "departments"
}
```

`criteria` is a verbatim copy of the six array columns at publish time. `labels` exists **solely to discharge EC-36**: if a department is deleted or renamed later, the publish record stays intelligible without a join. `scope` is `describeTargeting`'s machine token (`all` | `departments` | `locations` | `employment_types` | `job_statuses` | `users` | `mixed`) and is a read convenience only.

The six array columns remain on the row after publish and are **immutable from that moment**. They are kept (rather than being nulled in favour of the JSONB) because they are the queryable form; `targeting.criteria` is the auditable form. Both are written from the same in-memory object inside one transaction, so they cannot diverge.

### 6.4 Model registration

`models.index.js` gains:

```js
OrgDocument.belongsTo(DocumentType, { foreignKey: 'document_type_id', as: 'documentType' })
OrgDocument.belongsTo(OrgDocument,  { foreignKey: 'supersedes_id',    as: 'predecessor' })
OrgDocument.hasMany(OrgDocumentRecipient, { foreignKey: 'org_document_id', as: 'recipients' })
OrgDocumentRecipient.belongsTo(OrgDocument, { foreignKey: 'org_document_id', as: 'document' })
```

No association to `User` is declared: the P1 document models deliberately avoid user associations and resolve actor names via explicit queries, and adding them here would change eager-load shapes elsewhere. `org_documents` is `paranoid: true`; `org_document_recipients` is not.

### 6.5 What migration `00050` does NOT do

- It does not alter `document_types`, `document_type_catalog`, `employee_documents`, `document_audit_logs` or `document_settings`.
- It does not add enum values to any existing type.
- It does not backfill anything — both tables start empty.
- It has no data-migration step, so `down()` is genuinely lossless-to-re-run on an empty schema and destructive only of Phase-2 data.

---

## 7. Models

Both models follow the P1 pattern exactly: `'use strict'`, a factory taking `(sequelize, DataTypes)`, explicit `tableName`, `underscored: true`, `timestamps: true`, `paranoid` only where the table has `deleted_at`, and **no** `defaultScope` (P1 keeps scoping in repositories so that `findByIdForStorage`-style escapes stay explicit).

`org_documents.model.js` mirrors `employee_documents.model.js` field-for-field where the fields are shared, so a reader can diff the two.

`org_document_recipients.model.js` declares `timestamps: true, paranoid: false` and documents in a header comment why there is no soft delete.

---

## 8. Core Logic — Pure Utility Modules

Both modules are **pure**: no `require` of `models.index`, no `Date.now()` outside an injected `now`, no I/O. Both are unit-tested with `node:test` under `tests/unit/document/`.

### 8.1 `document_targeting.utils.js`

```js
normaliseCriteria(input)            // -> frozen { target_departments: [], ... } with all six keys present,
                                    //    de-duplicated, order-stable
matchesCriteria(criteria, profile)  // -> boolean.  profile = { user_id, department_id, location_id,
                                    //    employment_type, job_status }
describeTargeting(criteria)         // -> { scope, summary }  e.g. { scope: 'departments',
                                    //    summary: '2 departments, 1 location' }
isOrgWide(criteria)                 // -> true when all six arrays are empty
diffCriteria(a, b)                  // -> { added: {...}, removed: {...} } for audit old/new values
```

`matchesCriteria` replicates `payroll/utils/calendar_resolver.utils.js` (itself mirroring `leave_calculator.utils.js`) exactly, in this order:

1. `excluded_users` contains `profile.user_id` → **false**. Exclusion wins outright, before everything else.
2. `included_users` non-empty and does **not** contain `profile.user_id` → **false**. A non-empty include list *restricts*; it does not override the attribute filters.
3. For each of `target_departments`→`department_id`, `target_locations`→`location_id`, `target_employment_types`→`employment_type`, `target_job_statuses`→`job_status`: an empty array matches everything; a non-empty array must contain the profile's value. A `null`/`undefined` profile value against a non-empty array → **false**.
4. Otherwise **true**.

Rule 2 is the semantics the payroll/leave resolvers already use and is the reason `included_users` alone cannot be used to "add" someone outside the department filter. Where HR wants exactly N named people, they clear the attribute filters and list the users — `describeTargeting` reports that as `scope: 'users'`.

**Departments are matched on `department_id` only.** The free-text `employee_profiles.department` column is never read by this module; the function signature does not even accept it.

`matchesCriteria` is used in two places and they must agree: the SQL predicate that the recipient resolver pushes to Postgres (§10 F-4 step 6) and this function. The resolver runs the SQL, then re-checks every returned row through `matchesCriteria` before insert. That double-check is cheap (an in-memory pass over rows already fetched) and is what makes the "no others" half of the exit criterion testable without a database (§24 T-9).

### 8.2 `document_org_rules.utils.js`

```js
ORG_DOCUMENT_STATUS            // frozen Set
ORG_TRANSITIONS                // frozen map: from -> Set(to)
canTransition(from, to)        // -> boolean
isPublishable(row)             // draft AND (storage_key && confirmed_at || reference_url)
isActionable(status)           // -> status === 'published'
resolveOrgDisplayStatus(row, todayIst)   // 'scheduled' | 'active' | 'expired' | row.status
resolveDueOn(publishedAtIst, ackDueDays) // DATEONLY string or null
assertEffectiveWindow(from, to)          // -> null | 'EFFECTIVE_WINDOW_INVALID'
```

`resolveOrgDisplayStatus` is the org analogue of P1's `resolveDisplayStatus` and exists for the same reason (EC-17): the *stored* status of a published document is `published` regardless of dates, and the effective window is applied **on read** so that a missed Phase-4 cron can never turn into a compliance false-negative. For `status = 'published'`:

- `effective_from > today` → `scheduled`
- `effective_to != null && effective_to < today` → `expired`
- otherwise → `active`

For any other status the stored value is returned unchanged. All comparisons are Asia/Kolkata date-only strings produced by `document_expiry.utils.toIstDateString`.

### 8.3 Additive exports on existing utils

`document_authority.utils.js`:

```js
const ORG_VISIBLE_STATUS = Object.freeze({
  self:    new Set(['published', 'superseded', 'retired']),
  manager: new Set(['draft', 'published', 'superseded', 'retired', 'rejected']),
  hr:      new Set(['draft', 'published', 'superseded', 'retired', 'rejected'])
})

screenOrgDocument({ audience, status, effectiveConfidential })
resolveOrgDocumentAuthority({
  audience, action, actorUserId, actorRole,
  status, isRecipient, proposedBy, accessibleUserIds,
  typeFlags = {}, settingsFlags = {}
})
```

`ORG_VISIBLE_STATUS.self` includes `superseded` and `retired` because the employee must retain history of a policy they were served — the P2 exit criterion says a retired document "stays visible in history but is not actionable". `draft` is absent from `self`, which is what makes a manager's unpublished warning letter invisible to its subject.

`ORG_VISIBLE_STATUS.manager` includes `draft` because a manager must see their own proposal; the *ownership* test (`proposedBy === actorUserId`) is applied inside `resolveOrgDocumentAuthority`, not by the status screen.

The manager branch keeps P1's D-10 rule verbatim: `accessibleUserIds` must be a non-empty array; `null` never grants global scope to a manager.

`document_version.utils.js` gains `isOrgReplaceable(status)` → `status === 'published'`.

`document_type_rules.utils.js` gains `assertUploadAllowed(policy, { contentType, sizeBytes })`, which is the body of P1's `_assertContentTypeAndSize` moved verbatim (same error codes, same messages, same order of checks). §24 T-1 pins that with a characterisation test written **before** the move.

---

## 9. Layer Responsibilities

| Layer | Owns | Must never |
|---|---|---|
| **Route** | path literal, audience middleware array (`authenticate` + `authorize` + `requireFeature('documents.access')`), declaration order | contain logic |
| **Controller** | `ctx(req)` extraction, `validateOrThrow` against the Joi schema, resolving `accessibleUserIds` via `hierarchy_access`, calling exactly one service method, wrapping in `envelope()` | touch a model, build a query, decide authorization, format dates |
| **Validator** | shape, types, enum membership, string lengths, array max-lengths, mutual-exclusion of fields, `unknown(false)` | hit the DB, know about org state |
| **Service** | transaction boundaries, advisory locks, lock ordering, authorization calls into `document_authority.utils`, orchestration of repository calls, audit writes, S3 calls, error translation | contain SQL string literals except the advisory-lock call and the recipient-resolution query, return raw model rows to the controller |
| **Repository** | attribute projections (`LIST_ATTRIBUTES` / `DETAIL_ATTRIBUTES` frozen arrays excluding `storage_key`), `where` construction, locking hints, pagination, bulk insert chunking | open transactions, decide authorization, call S3 |
| **Utils** | pure decisions: targeting match, transition legality, display status, due-date arithmetic, authority resolution | import `models.index`, read the clock, perform I/O |

Two service-layer conventions carried over from P1 and mandatory here:

1. **Unmanaged transactions only.** `const t = await db.sequelize.transaction()` … `await t.commit()` … `catch (err) { if (!t.finished) await t.rollback(); throw err }`. Never `sequelize.transaction(async t => …)`, because the P1 code base's audit contract depends on being able to inspect `t.finished`.
2. **Audit is written inside the same transaction** via `auditService.record(entry, t)`; the only exception is read-observing events, which use `recordDetached`.

### 9.1 Service ownership map

| Service | Methods |
|---|---|
| `document_org.service` | `createDraft`, `updateDraft`, `issueFileUrl`, `confirmFile`, `publish`, `replace`, `retire`, `reject`, `deleteDraft` |
| `document_recipient.service` | `resolveAudience` (pure-ish; query + `matchesCriteria` re-check), `materialise` (chunked insert, in a caller-supplied transaction), `syncRecipients`, `waive`, `markViewed` |
| `document_org_read.service` | `listForHr`, `detailForHr`, `versionChain`, `viewUrl`, `roster`, `auditLogs`, `listProposals`, `listForManager`, `detailForManager`, `listForEmployee`, `detailForEmployee` |

`document_recipient.service.materialise` takes a transaction as a **required** argument — it is never called outside one. `syncRecipients` opens its own.

---

## 10. Feature Dossiers

Each dossier follows the Implementation-Ready Standard: **Requirement → Existing Dependency → Database Impact → API Impact → Business Logic → Validation → Authorization → Storage/File Impact → Failure Handling → Testing → Acceptance Criteria.** Where a dimension does not apply it says so explicitly.

---

### F-1 — Org document draft creation

**Requirement.** HR creates an unpublished org document: pick an active `plane='org'` type, give it a title, optionally description / effective window / acknowledgement settings / targeting criteria, and receive a pre-signed upload URL (or supply a `reference_url`).

**Existing dependency.** `document_type.repository.findById`; `document_type_rules.resolveEffectivePolicy` + `resolveEffectiveConfidential`; `document_upload.service._loadTypeAndPolicy` with `expectedPlane: 'org'`; `document_storage.utils.buildDocumentKey`; `object_storage.utils` presigned PUT; `document_settings.service.getOrCreate` for `document_upload_url_ttl_seconds` and `document_max_file_size_bytes`; `document_audit.service.record`.

**Database impact.** One `INSERT` into `org_documents` with `status='draft'`, a freshly generated `id` and `document_group_id` (equal and independent — the group id is a *new* UUID, not the row id, so that a later version's group id is not confusable with a row id), `version = 1`, `targeting = NULL`, the six criteria arrays as supplied (default `[]`), `created_by = actorId`. Plus one `document_audit_logs` row, same transaction.

**API impact.** `POST /api/v1/documents/hr/org-documents`. New endpoint; no existing response shape changes. Response carries the draft plus, when `storage_backend='s3'`, `{ upload_url, upload_expires_at, required_headers: { 'Content-Type': … } }`.

**Business logic.** Generate `id` and `document_group_id` before opening the transaction (the key needs the id). Load and validate the type. Compute `is_confidential = type.is_confidential || payload.is_confidential` (D-12 tighten-only: the payload can only raise it). Seed `requires_acknowledgement` / `requires_signature` from the type, allow the payload to raise but not lower them (R-40). Build `storage_key = buildDocumentKey({ orgId, plane: 'org', subjectId: document_group_id, documentId: id })`. Insert. Commit. **Then** presign the PUT (outside the transaction — presigning is a local HMAC operation, but keeping every non-DB call out of the transaction is the P1 convention and keeps the transaction short).

**Validation.** `document_type_id` UUID required; `title` 1–200; `description` ≤ 5000; `effective_from`/`effective_to` ISO dates with `effective_to >= effective_from`; `acknowledgement_due_days` 1–365 and required iff `requires_acknowledgement`; `storage_backend` in (`s3`,`reference`) default `s3`; `reference_url` required iff backend is `reference` and forbidden otherwise; `content_type` required iff backend is `s3`; each targeting array ≤ 200 elements (R-51); `included_users` and `excluded_users` must be disjoint (R-50). Cross-DB validation in the service: the type exists, is active, `plane='org'`; every `target_departments` id exists in `organization_departments` for this org; every `target_locations` id exists in `organization_locations`; every user id in include/exclude is an active member of this org.

**Authorization.** `authorize(['hr'])` at the route + `requireFeature('documents.access')`. No per-subject check — an org document has no subject.

**Storage/file impact.** Writes **no** object. `storage_key` is recorded but the object does not exist until the client PUTs and `confirmFile` verifies it. A draft whose upload never happens leaves a DB row and no object — the benign direction of drift (§19.3).

**Failure handling.** Type not found / inactive / wrong plane → `422 DOCUMENT_TYPE_PLANE_MISMATCH` or `404 DOCUMENT_TYPE_NOT_FOUND` (the exact P1 codes). Unknown department/location id → `422 TARGET_DEPARTMENT_UNKNOWN` / `TARGET_LOCATION_UNKNOWN` with the offending ids in `details`. Presign failure after commit → the draft exists without an upload URL; the client recovers with `POST /:id/file` (F-2). That is deliberate: the row is the durable artefact, the URL is disposable.

**Testing.** Unit: confidentiality tighten-only; ack-flag raise-only; include/exclude disjointness; key shape. Integration (service-level, mocked repos): unknown department rejected before insert; presign failure does not roll back the draft.

**Acceptance criteria.** A draft is created with `status='draft'`, `targeting IS NULL`, `version=1`; the returned upload URL expires per setting #63; no `storage_key` appears anywhere in the response body.

---

### F-2 — Org file attach, re-issue and confirm

**Requirement.** Attach the actual file to a draft, re-issue the URL if the client lost it, and confirm the upload by verifying the object actually landed.

**Existing dependency.** P1's confirm contract verbatim: `HeadObject` with a 3 s timeout and `maxAttempts: 1`, executed **outside** any transaction; then a short transaction to record `file_name` / `content_type` / `size_bytes` / `checksum_sha256` / `confirmed_at`.

**Database impact.** `UPDATE org_documents SET file_name, content_type, size_bytes, checksum_sha256, confirmed_at, updated_by` where `status='draft'`, under `FOR UPDATE`. Plus an audit row `org_document.file_confirmed`.

**API impact.** `POST /hr/org-documents/:id/file` (re-issue) and `POST /hr/org-documents/:id/file/confirm`. Both new.

**Business logic.** Re-issue is allowed only while `status='draft'`; it returns a URL for the **same** `storage_key`, so a re-upload overwrites in place and cannot orphan an object. Confirm reads the object's `ContentLength` and `ContentType` from `HeadObject` and runs `assertUploadAllowed(policy, { contentType: head.ContentType, sizeBytes: head.ContentLength })` — the client's *claimed* content type at issue time is advisory; the **verified** one is what the rule is applied to. `checksum_sha256` is taken from the `ETag` only when it is a single-part MD5-shaped etag; otherwise left null (documented, not inferred).

**Validation.** `file_name` 1–255, no path separators (`/`, `\`), no leading dot. The service never uses `file_name` in the key.

**Authorization.** HR only (the manager equivalent is F-9, which routes through the same service methods with a manager authority check).

**Storage/file impact.** This is the only place in the org plane that reads the object's metadata. `storage_key` is fetched through a dedicated repository method `findByIdForStorage` — the same chokepoint discipline as P1, so "grep responses for `storage_key`" stays a meaningful test.

**Failure handling.** Object absent → `409 UPLOAD_NOT_FOUND` and the row is left untouched (the client re-PUTs and re-confirms; fully retryable). `HeadObject` times out → `503 STORAGE_UNAVAILABLE`, no DB write, retryable. Verified content type or size violates the policy → `422` with the P1 codes (`CONTENT_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE`) and the row stays unconfirmed; the operator can re-upload a conforming file over the same key. Confirm called twice → second call is a no-op returning the same row (idempotent, §17 I-2).

**Testing.** Unit on `assertUploadAllowed`. Service tests with a stubbed storage provider for: absent object, oversized object, timeout, double confirm.

**Acceptance criteria.** A draft cannot be published until `confirmed_at IS NOT NULL` (or backend is `reference`); a failed confirm never leaves a half-attached row.

---

### F-3 — Targeting criteria edit on a draft

**Requirement.** HR adjusts a draft's audience before publishing.

**Existing dependency.** `document_targeting.utils` (new, F-0 of the build order); `organization_departments` / `organization_locations` for id validation.

**Database impact.** `UPDATE org_documents` of the six arrays + metadata fields, `status='draft'` guarded, `FOR UPDATE`. Audit `org_document.updated` with `old_values`/`new_values` limited to the changed keys, using `diffCriteria` for the arrays so the audit payload stays small.

**API impact.** `PUT /hr/org-documents/:id`. New.

**Business logic.** Only a `draft` is editable. Editable fields: `title`, `description`, `effective_from`, `effective_to`, `is_confidential` (raise only), `requires_acknowledgement` (raise only), `acknowledgement_due_days`, `requires_signature` (raise only), and the six targeting arrays. `document_type_id` is **immutable** after creation (changing the type would change the policy, the key's plane, and the confidentiality floor — R-38).

**Validation.** As F-1, plus: `document_type_id` present in the payload and different from the stored one → `422 IMMUTABLE_FIELD` listing the field (mirroring P1's `detectImmutableFieldViolations` behaviour).

**Authorization.** HR. A manager editing their own proposal goes through F-9 and is additionally restricted to `included_users = [one direct report]`.

**Storage/file impact.** Not applicable.

**Failure handling.** Status not `draft` → `409 ORG_DOCUMENT_NOT_EDITABLE`. Concurrent edits → last writer wins on scalar fields; the `FOR UPDATE` serialises them so neither sees a torn row. This is acceptable because a draft has a single owner in practice; the audit log records both edits.

**Testing.** Unit: immutability of `document_type_id`; raise-only flags. Service: edit on a published row rejected.

**Acceptance criteria.** Editing a draft never touches `targeting`, `version`, `document_group_id`, `published_*` or `storage_key`.

---

### F-4 — Publish (the core transaction)

**Requirement.** Turn a confirmed draft into the single live version of its policy group, freeze its targeting, and materialise exactly the matching recipients — atomically.

**Existing dependency.** P1's advisory-lock protocol and lock ordering; `document_audit.service.record`; `document_version.utils.nextVersion`; `document_targeting.utils`; `document_org_rules.utils`; `document_expiry.utils.toIstDateString`; `hierarchy_access` (only when `proposed_by` is set — EC-19).

**Database impact.** Within one transaction: `UPDATE` on the predecessor (`status='superseded'`, `superseded_at`), `UPDATE` on the subject (`status='published'`, `version`, `supersedes_id`, `published_by`, `published_at`, `targeting`, `recipient_count`), chunked `INSERT` into `org_document_recipients`, one audit row.

**API impact.** `POST /hr/org-documents/:id/publish`. New. Response includes `recipient_count`, `version`, and a `warnings` array.

**Business logic — the exact sequence.**

```text
0.  Validate payload (no body, or { override_scope_change?: boolean }).          outside txn
1.  Read the row unlocked to obtain org_id + document_group_id.                  outside txn
2.  BEGIN
3.  SELECT pg_advisory_xact_lock(hashtext('docorg:{orgId}:{groupId}'))
4.  Re-read the subject row FOR UPDATE.
      - status 'published'  -> idempotent success, return current state,
                              already_published: true, COMMIT (no writes).
      - status not 'draft'  -> 409 INVALID_STATUS_TRANSITION.
      - not isPublishable() -> 409 ORG_DOCUMENT_FILE_MISSING.
5.  Re-read document_types row; assert is_active AND plane='org'.
      - else 409 DOCUMENT_TYPE_INACTIVE.
6.  Resolve the audience:
      SELECT p.user_id, p.department_id, p.location_id, p.employment_type, p.job_status
        FROM employee_profiles p
        JOIN users u ON u.id = p.user_id
       WHERE p.org_id = :orgId
         AND u.is_active = true AND u.deleted_at IS NULL
         AND (cardinality(:departments) = 0 OR p.department_id = ANY(:departments))
         AND (cardinality(:locations)   = 0 OR p.location_id   = ANY(:locations))
         AND (cardinality(:empTypes)    = 0 OR p.employment_type = ANY(:empTypes))
         AND (cardinality(:jobStatuses) = 0 OR p.job_status    = ANY(:jobStatuses))
         AND (cardinality(:included)    = 0 OR p.user_id = ANY(:included))
         AND NOT (p.user_id = ANY(:excluded))
       ORDER BY p.user_id
    then re-check every row through matchesCriteria() and drop any that fail.
7.  Guard: if resolved.length > ORG_PUBLISH_SYNC_LIMIT -> 422 RECIPIENT_SET_TOO_LARGE.
8.  EC-19: if proposed_by IS NOT NULL, recompute the proposer's accessible user ids
    and assert every included_users entry is still inside it.
      - mismatch and not override_scope_change -> 409 PROPOSER_SCOPE_CHANGED.
      - mismatch and override_scope_change     -> continue; the audit entry records
                                                  scope_override: true.
9.  Find the current published sibling:
      SELECT ... FROM org_documents
       WHERE org_id = :orgId AND document_group_id = :groupId
         AND status = 'published' AND deleted_at IS NULL
       FOR UPDATE
    (at most one row, guaranteed by org_documents_published_group_unique_idx).
      - if found: version = predecessor.version + 1; supersedes_id = predecessor.id;
                  UPDATE predecessor SET status='superseded', superseded_at=now().
      - if none:  version = 1 (or the draft's stored version if this group has a
                  superseded history and no live row — recomputed as
                  MAX(version)+1 over the group, still under the advisory lock).
10. Build the frozen targeting snapshot (criteria + labels + resolved_at +
    resolved_count + scope).  Labels are read from organization_departments /
    organization_locations inside this transaction.
11. UPDATE the subject to published.
12. Materialise recipients in chunks of 1000 via bulkCreate({ ignoreDuplicates: true }),
    due_on = resolveDueOn(published_at IST, acknowledgement_due_days), source='publish'.
13. UPDATE org_documents SET recipient_count = <n>.
14. auditService.record({ action: 'org_document.published', entityType: 'org_document',
      newValues: { version, recipient_count, scope, criteria, scope_override } }, t)
15. COMMIT
```

Step 9 comes **after** step 6 deliberately: resolving the audience is the longest operation, and taking the predecessor's row lock later shortens the window in which another transaction is blocked on that specific row. Both are already serialised on the group by the advisory lock at step 3, so no ordering hazard is introduced. Row locks within step 9 are taken in ascending `id` order when more than one row must be locked, per the P1 protocol.

**Validation.** Body is empty or `{ override_scope_change: boolean }`. Everything else was validated at draft time and is re-asserted here from the stored row, not from the request.

**Authorization.** `authorize(['hr'])`. A manager can never reach publish — there is no manager publish route and `resolveOrgDocumentAuthority` denies `action='publish'` for `audience='manager'` unconditionally, **including** when `manager_direct_document_authority` is ON. Publishing to an audience is an HR act by definition; setting #59 governs manager actions over *their reports' own documents*, not over org issuance. This is stated as a rule (R-70) so it cannot be "fixed" later by accident.

**Storage/file impact.** None. Publish does not touch S3. The object was verified at confirm.

**Failure handling.**

| Failure | Behaviour |
|---|---|
| Another publish on the same group commits first | This transaction blocks on the advisory lock, then sees the predecessor at step 9 and supersedes it correctly. No lost update. |
| `23505` on `org_documents_published_group_unique_idx` (advisory lock bypassed, e.g. a direct DB write) | Translate to `409 ORG_DOCUMENT_ALREADY_PUBLISHED`; the whole transaction rolls back, so no partial recipients. |
| `23505` on `org_document_recipients_doc_user_unique_idx` | Suppressed by `ignoreDuplicates`; makes a retry after a client timeout safe. |
| Zero recipients (EC-15) | **Publish succeeds.** `recipient_count = 0`, response `warnings: ['ZERO_RECIPIENTS']`, audit records it. Not an error — an empty department is a legitimate audience. |
| Recipient set over the limit (EC-16) | `422 RECIPIENT_SET_TOO_LARGE` with `{ resolved_count, limit }`. The whole transaction rolls back; HR narrows the targeting. Async bulk publish is Phase 5. |
| Client times out mid-transaction and retries | Second call blocks on the advisory lock; when the first commits, the second sees `status='published'` at step 4 and returns the idempotent success. |
| Process dies mid-transaction | Postgres rolls back; the advisory lock is released with the transaction (`_xact_` variant). The draft is untouched and re-publishable. |

**Testing.** The pure parts (`matchesCriteria`, `resolveDueOn`, `nextVersion`, snapshot builder) are unit-tested exhaustively. The transaction sequence is tested at service level with mocked repositories asserting **call order**: advisory lock before any `FOR UPDATE`; audit inside the transaction; `recipient_count` written after materialisation.

**Acceptance criteria.** Publishing to "Engineering + Sales" materialises exactly the union of active Engineering and Sales employees minus `excluded_users`, and no one else; `targeting` is non-null and immutable thereafter; exactly one row per group has `status='published'`; publishing v2 sets v1 to `superseded` and v1's recipient rows survive untouched.

---

### F-5 — Replace (new version of a policy)

**Requirement.** Issue v2 of a policy without taking v1 down first.

**Existing dependency.** F-1 (draft creation path), `document_version.utils.isOrgReplaceable`.

**Database impact.** One `INSERT` into `org_documents` with the **same** `document_group_id`, `status='draft'`, `version = predecessor.version + 1` (provisional — recomputed at publish), all metadata and targeting arrays copied from the predecessor, `storage_key` built from the new row's id, `targeting = NULL`, `supersedes_id = NULL` (set at publish, not now).

**API impact.** `POST /hr/org-documents/:id/replace`. New. Returns the new draft plus an upload URL.

**Business logic.** Only a `published` row is replaceable (`isOrgReplaceable`). The predecessor stays `published` — this is the deliberate divergence from the employee plane, where the predecessor is superseded at `confirm`. Rationale: an org policy must remain the live, enforceable version until its replacement is actually published; there is no verification limbo for org documents, and a half-finished v2 draft must never leave the org with no live policy. The supersede therefore happens in F-4 step 9.

If a `draft` already exists for this group (someone else is already preparing v2), `replace` returns `409 ORG_DOCUMENT_DRAFT_EXISTS` with the existing draft's id, so two people do not build competing v2s. The check runs under the `docorg:` advisory lock.

**Validation.** No body, or an optional `{ title, effective_from }` override.

**Authorization.** HR only.

**Storage/file impact.** A new key under the same group prefix: `org/{orgId}/documents/org/{groupId}/{newDocumentId}`. The predecessor's object is never touched.

**Failure handling.** Predecessor not `published` → `409 ORG_DOCUMENT_NOT_REPLACEABLE`. Duplicate replace clicks → the second gets `ORG_DOCUMENT_DRAFT_EXISTS` carrying the first draft's id, which the UI can treat as success.

**Testing.** Service: replace on draft/superseded/retired rejected; two concurrent replaces yield one draft and one 409; group id is preserved and the new key differs.

**Acceptance criteria.** After replace, the group has exactly one `published` row and one `draft` row; after publishing the draft, exactly one `published` and one `superseded`.

---

### F-6 — Retire

**Requirement.** Withdraw a live policy without deleting its history.

**Existing dependency.** `document_org_rules.canTransition`.

**Database impact.** `UPDATE org_documents SET status='retired', retired_by, retired_at, retirement_reason` under the `docorg:` advisory lock and `FOR UPDATE`. Recipient rows are **not** modified. Audit `org_document.retired`.

**API impact.** `POST /hr/org-documents/:id/retire`, body `{ reason }`. New.

**Business logic.** `published → retired` only. A `superseded` row is already historical and cannot be retired (`409`). Retiring frees the partial unique index, so a new v-next can be published into the group afterwards.

**Validation.** `reason` 1–500, required.

**Authorization.** HR only.

**Storage/file impact.** None. The object stays; employees who received the document keep read access through their recipient row (see F-8 — they see it as history and `is_actionable: false`).

**Failure handling.** Double retire → the second call sees `status='retired'` and returns idempotent success (§17 I-4).

**Testing.** Service: retire from each status; recipient rows untouched; employee detail after retire returns `is_actionable: false`.

**Acceptance criteria.** A retired document remains visible to its recipients in history and is not actionable; a new version can be published into the same group after retirement.

---

### F-7 — Recipient roster, waive and sync

**Requirement.** HR can see exactly who received a document, excuse an individual, and top up the roster when the workforce changes.

**Existing dependency.** `document_targeting.utils.matchesCriteria`; the same resolver query as F-4 step 6.

**Database impact.** Roster: read-only, paginated. Waive: `UPDATE org_document_recipients SET state='waived', waived_by, waived_at, waived_reason` under `FOR UPDATE`, plus audit `org_document_recipient.waived`. Sync: chunked `INSERT ... ON CONFLICT DO NOTHING` with `source='sync'`, plus `UPDATE org_documents SET recipient_count`, plus audit `org_document.recipients_synced` with `{ added_count }`.

**API impact.** `GET /hr/org-documents/:id/recipients`, `POST /hr/org-documents/:id/recipients/:userId/waive`, `POST /hr/org-documents/:id/recipients/sync`. All new.

**Business logic.**
- **Roster** filters by `state` and by `q` (name/employee-code prefix), returns `{ total, counts_by_state, rows }`. `counts_by_state` is a `GROUP BY state` on the indexed `(org_document_id, state)`, not a client-side tally.
- **Waive** is allowed from `pending` or `viewed` only. From `acknowledged`/`signed` it is `409 RECIPIENT_ALREADY_COMPLETED` (you cannot un-acknowledge). From `waived` it is an idempotent no-op.
- **Sync** re-runs the resolver against the **frozen** `targeting.criteria` — never against the live array columns and never against re-derived criteria — and inserts only users who are not already recipients. It **never removes** a recipient: someone who has left the targeted department keeps the obligation they were given. Sync runs under the `docorg:` advisory lock so it cannot interleave with a publish on the same group.
- **EC-13 half.** Rows inserted by sync get `source='sync'` and their `due_on` is computed from the **sync date**, not from the original `published_at`. A person who joined last week is never shown as having been overdue since the policy was published three months ago. This is the Phase-2 half of EC-13; Phase 4 adds the automatic trigger.

Sync is only meaningful for a `published` document. On `draft`/`superseded`/`retired` it is `409 ORG_DOCUMENT_NOT_SYNCABLE`.

**Validation.** Roster: `state` enum, `limit` 1–200 default 50, `offset` ≥ 0, `q` ≤ 100. Waive: `reason` 1–500 required.

**Authorization.** HR only for all three. Managers do not get a roster in P2 (team compliance views are Phase 3).

**Storage/file impact.** Not applicable.

**Failure handling.** Sync over the size limit → `422 RECIPIENT_SET_TOO_LARGE` on the *incremental* count, and nothing is inserted. A partially-failed sync is impossible: the whole insert is one transaction. Repeated sync is naturally idempotent via the unique index and reports `added_count: 0`.

**Testing.** Unit: waive transition matrix. Service: sync adds only the missing users; sync never deletes; sync on a retired document rejected; `added_count` accurate on the second run.

**Acceptance criteria.** The roster count equals `COUNT(*)` on `org_document_recipients` for the document; a waived recipient disappears from the pending count and keeps their row; sync is safe to run repeatedly.

---

### F-8 — "My HR Documents" (the read-side composer)

**Requirement.** An employee sees the org documents issued to them, with their own state, and can open the file. An employee who is not a recipient cannot reach the document even with its id.

**Existing dependency.** `document_authority.utils` (new org branch); `document_expiry.utils.toIstDateString`; `document_org_rules.resolveOrgDisplayStatus`; `document_settings` for `document_view_url_ttl_seconds`; `object_storage.utils` presigned GET; `document_audit.service.recordDetached`.

**Interpretation of D-2 adopted here.** The "read-side composer" is the service function that assembles the employee-facing row from three sources that are *never* one table — `org_documents` (the artefact), `org_document_recipients` (this employee's obligation and state), and `document_types` (the policy that governs display). Composition is per row, at read time. Phase 2 exposes it at `/me/hr-documents` and leaves `/me/documents` (employee plane, Phase 1) untouched. A single unified inbox spanning both planes is **not** built — see §26.1 O-1.

**Database impact.** Read-only, except the `pending → viewed` transition in F-8b.

**API impact.** `GET /me/hr-documents`, `GET /me/hr-documents/:id`, `GET /me/hr-documents/:id/view-url`. All new. No existing self-plane response changes.

**Business logic.** The list query is anchored on `org_document_recipients (org_id, user_id, state)` — the indexed path — and joins to `org_documents` filtered by `ORG_VISIBLE_STATUS.self`. Each composed row carries: document id, type code/name/group, title, description, `version`, `effective_from`/`effective_to`, `display_status` from `resolveOrgDisplayStatus`, `requires_acknowledgement`, `due_on`, `state`, `first_viewed_at`, and `is_actionable` = `status === 'published' && display_status === 'active' && state not in (acknowledged, signed, waived)`. It does **not** carry `storage_key`, `targeting`, `recipient_count`, `proposed_by`, `created_by` or any other internal field: the employee-facing projection is a frozen allow-list in the repository, not an exclude-list.

**F-8b — `pending → viewed`.** Issuing a view URL transitions the recipient row `pending → viewed` and stamps `first_viewed_at`. It runs in its **own** short transaction after the URL is signed, guarded as `UPDATE … WHERE id = :id AND state = 'pending'`, so concurrent double-clicks write exactly once and later states are never regressed. Audit is `recordDetached` with action `org_document.viewed`. The transition is attached to the view URL, not to list or detail, because that is the only call that evidences actual access to the content.

**Validation.** List query: `state` enum, `requires_acknowledgement` boolean, `type_id` UUID, `status` in (`active`,`scheduled`,`expired`,`retired`), `limit` 1–100 default 25, `offset` ≥ 0, `unknown(false)`.

**Authorization.** `authenticate` + `requireFeature('documents.access')` only — no `authorize()`, exactly as the rest of `/me`. The authority decision is `isRecipient`: the composer resolves the caller's recipient row **first**, and no recipient row means no document. There is no "org-wide readable" bypass.

**Storage/file impact.** Presigned GET on the document's `storage_key`, TTL from setting #62. For `storage_backend='reference'` the stored `reference_url` is returned instead and no signing happens — the same branch P1's `viewUrl` already implements.

**Failure handling.** **Uniform denial (parent §12.2).** Every failure on `/me/hr-documents/:id*` — document does not exist, belongs to another org, is a draft, is soft-deleted, or the caller is simply not a recipient — returns the identical `404` with `errorCode: 'DOCUMENT_NOT_FOUND'`, message `"Document not found"`, and **no `details`**. This is byte-identical to the employee plane's id-addressed denial, so a probe cannot even determine which plane an id belongs to. Storage unavailable on view-url → `503 STORAGE_UNAVAILABLE`; the `viewed` transition is skipped (it is only attempted after a successful sign).

**Testing.** Service tests for: a Finance employee getting `404` on an Engineering-only policy with a byte-comparison against the employee-plane 404 body; a draft invisible to its own subject; a retired document present with `is_actionable: false`; double view-url writing `first_viewed_at` once; an `acknowledged` row not regressed to `viewed`. Projection test: the response of every `/me/hr-documents*` endpoint contains none of `storage_key`, `targeting`, `recipient_count`, `proposed_by`.

**Acceptance criteria.** An employee in Finance cannot see an Engineering policy by id, and the `404` is indistinguishable from a non-existent id.

---

### F-9 — Manager Tier-B proposal

**Requirement.** A manager drafts an org-plane document (typically a `warning_letter`, `show_cause_notice` or `performance_improvement_plan`) addressed to one direct report; HR publishes or rejects it. The manager never publishes.

**Existing dependency.** `hierarchy_access.getAccessibleUserIds`; `document_type_rules.resolveEffectivePolicy` (`managerCanRequest`); `document_settings.manager_can_view_team_documents`; the D-15 quartet columns; F-1/F-2 service methods.

**Database impact.** Same `INSERT` as F-1 but with `proposed_by = managerId`, `included_users = [reportUserId]`, all other targeting arrays `[]`. Reject sets `status='rejected'`, `rejection_reason`, `approved_by`, `actioned_at`.

**API impact.** Eight new manager endpoints (§11) and one new HR endpoint (`POST /hr/org-documents/:id/reject`) plus an HR proposals list.

**Business logic.**
- The manager may only choose a type with `manager_can_request = true` **and** `plane = 'org'`. The `manager_can_view_team_documents` org setting gates the whole manager org surface: when it is off, the manager type list is empty and drafting returns `403 FORBIDDEN` (mirroring P1's behaviour of returning an empty list rather than an error for *reads*, and a denial for *writes*).
- The target must be in `getAccessibleUserIds(orgId, managerPrincipal)` at draft time. `null` (HR's global scope) never grants a manager global scope (D-10).
- Exactly one target: `included_users.length === 1`, every other array empty. A manager cannot address a department. Enforced in the validator (`array().length(1)`) and re-asserted in the service.
- The manager can edit, re-issue the file for, and confirm their own draft while `status='draft'` and `proposed_by = actorId`. They cannot publish, retire, replace, or sync.
- HR sees proposals at `GET /hr/org-documents/proposals` (the partial index `org_documents_org_proposed_idx` serves it), and publishes through F-4 or rejects through this dossier.
- **EC-19** is discharged in F-4 step 8: at publish, the proposer's accessible set is recomputed. If the report has moved out of the manager's team since the draft was written, publish fails `409 PROPOSER_SCOPE_CHANGED`; HR may proceed with `override_scope_change: true`, which is recorded in the audit entry. The manager's *own* authority is re-checked every time they touch the draft, so a demoted manager loses access to their own pending proposal immediately.

**Validation.** Manager draft schema is F-1's schema minus the targeting arrays, plus `target_user_id` (UUID, required) which the controller maps to `included_users: [target_user_id]`. The manager API never exposes raw targeting arrays.

**Authorization.** Route: `authorize(['manager','hr'])` + feature flag. Service: `resolveOrgDocumentAuthority({ audience: 'manager', action, actorUserId, proposedBy, accessibleUserIds, typeFlags, settingsFlags })`. Denials on `/manager/employees/:userId/...`-shaped addressing return `403 FORBIDDEN`; denials on `/manager/org-documents/:id` return the uniform `404 DOCUMENT_NOT_FOUND` — the parent §12.2 split by addressing mode, applied unchanged.

**Storage/file impact.** Identical to F-2, through the same service methods.

**Failure handling.** Manager attempts publish → there is no route; if one is ever added, the authority function denies it. Manager edits a draft after HR rejected it → `409 ORG_DOCUMENT_NOT_EDITABLE` (status is `rejected`); the manager creates a fresh draft. HR rejects twice → idempotent no-op.

**Testing.** Service: manager cannot draft for a non-report; cannot draft an `employee`-plane type; cannot draft a type with `manager_can_request=false`; cannot see another manager's proposal (uniform 404); EC-19 override path audits `scope_override: true`.

**Acceptance criteria.** A manager can move a warning letter from draft to HR's queue and no further; HR's publish of that draft materialises exactly one recipient.

---

### F-10 — HR read surface

**Requirement.** HR lists, filters, inspects, version-traces and audits org documents.

**Existing dependency.** `document_read.service`'s projection discipline and `document_audit_log.repository.findByEntity`.

**Database impact.** Read-only.

**API impact.** `GET /hr/org-documents`, `GET /hr/org-documents/:id`, `GET /hr/org-documents/:id/versions`, `GET /hr/org-documents/:id/view-url`, `GET /hr/org-documents/:id/audit-logs`, `GET /hr/org-documents/groups/:groupId`, `GET /hr/org-documents/proposals`. All new.

**Business logic.** `versions` returns the whole `document_group_id` chain ordered by `version` ascending, each entry carrying `status`, `published_at`, `superseded_at`, `recipient_count` — this is what makes "v1's history survives" observable. `audit-logs` returns `document_audit_logs` rows for `entity_type='org_document'` and `entity_id=:id`, ordered `created_at DESC, id DESC` (the P1 stable-ordering rule, so equal timestamps do not shuffle between pages).

**Validation.** List query: `status`, `type_id`, `document_group_id`, `proposed` (boolean), `q` (title prefix), `limit` 1–200 default 50, `offset`, `unknown(false)`.

**Authorization.** `authorize(['hr'])`. Platform roles (`admin`, `super-admin`) never reach these routes — they are not in any `authorize()` list in this module, consistent with the tenant/platform plane split.

**Storage/file impact.** Presigned GET for `view-url`, via `findByIdForStorage`.

**Failure handling.** Uniform `404 DOCUMENT_NOT_FOUND` for any id-addressed miss, including cross-org ids.

**Testing.** Projection tests asserting `storage_key` is absent from every HR response; ordering test on `audit-logs`; cross-org id returns 404.

**Acceptance criteria.** `GET /hr/org-documents/:id/versions` shows v1 `superseded` and v2 `published` after a replace-and-publish cycle, with v1's `recipient_count` intact.

---

### F-11 — Audit coverage

**Requirement.** Every state change is attributable and reconstructable.

**Existing dependency.** `document_audit.service` verbatim.

**Database impact.** Rows in `document_audit_logs` with `entity_type ∈ {'org_document','org_document_recipient'}`.

**Actions written.**

| Action | Entity | Written in | Transaction |
|---|---|---|---|
| `org_document.created` | `org_document` | F-1 | same txn |
| `org_document.updated` | `org_document` | F-3 | same txn |
| `org_document.file_confirmed` | `org_document` | F-2 | same txn |
| `org_document.published` | `org_document` | F-4 | same txn |
| `org_document.superseded` | `org_document` (the predecessor) | F-4 step 9 | same txn |
| `org_document.replaced` | `org_document` (the new draft) | F-5 | same txn |
| `org_document.retired` | `org_document` | F-6 | same txn |
| `org_document.rejected` | `org_document` | F-9 | same txn |
| `org_document.deleted` | `org_document` | F-12 | same txn |
| `org_document.recipients_synced` | `org_document` | F-7 | same txn |
| `org_document.viewed` | `org_document` | F-8b | `recordDetached` |
| `org_document_recipient.waived` | `org_document_recipient` | F-7 | same txn |

**Business logic.** `proposed_by` / `approved_by` on the audit row are populated for the Tier-B actions so the maker-checker pair is legible from the audit table alone. `storage_key` is already in `SCRUBBED_KEYS`, so it cannot leak into `old_values`/`new_values` even if a caller passes the whole row.

**Failure handling.** In-transaction audit failure aborts the business transaction — intended. `recordDetached` failure is logged and swallowed; a failed view-audit must not deny the employee their document.

**Acceptance criteria.** For any published document, the audit table alone reconstructs: who drafted it, who published it, what the targeting was, how many recipients it produced, and whether a proposer-scope override was used.

---

### F-12 — Draft deletion

**Requirement.** An abandoned draft can be removed without leaving an orphan object.

**Existing dependency.** P1's `deleteDocument` orphan-cleanup pattern.

**Database impact.** `UPDATE org_documents SET deleted_at = now()` (paranoid) under `FOR UPDATE`, plus audit. The row is never hard-deleted.

**API impact.** `DELETE /hr/org-documents/:id`. New.

**Business logic.** Allowed from `draft` and `rejected` only. After the transaction commits, a best-effort `deleteObject(storage_key)` runs **outside** the transaction; failure is logged and ignored.

**Authorization.** HR. A manager cannot delete their own proposal (they can only abandon it); this keeps the disciplinary paper trail intact. Stated as R-74.

**Storage/file impact.** Orphan object deletion is best-effort and after commit. The drift direction is "object exists, row soft-deleted" — harmless and sweepable later (§19.3).

**Failure handling.** Status `published`/`superseded`/`retired` → `409 ORG_DOCUMENT_NOT_DELETABLE`. Double delete → idempotent no-op.

**Acceptance criteria.** A published document can never be deleted through the API.

---

## 11. API Surface — Endpoints #43 … #72

Phase 1 delivered #1–#42. Phase 2 adds **30** endpoints. No Phase-1 endpoint's path, request shape or response shape changes.

### 11.1 HR plane — `/api/v1/documents/hr` · `[authenticate, authorize(['hr']), requireFeature('documents.access')]`

| # | Method | Path | Purpose | Dossier |
|---|---|---|---|---|
| 43 | POST | `/org-documents` | create draft (+ upload URL) | F-1 |
| 44 | PUT | `/org-documents/:id` | edit draft metadata + targeting | F-3 |
| 45 | POST | `/org-documents/:id/file` | re-issue upload URL | F-2 |
| 46 | POST | `/org-documents/:id/file/confirm` | verify + record the object | F-2 |
| 47 | POST | `/org-documents/:id/publish` | publish + materialise recipients | F-4 |
| 48 | POST | `/org-documents/:id/replace` | start v-next draft | F-5 |
| 49 | POST | `/org-documents/:id/retire` | withdraw a live policy | F-6 |
| 50 | POST | `/org-documents/:id/reject` | decline a manager proposal | F-9 |
| 51 | DELETE | `/org-documents/:id` | soft-delete a draft/rejected row | F-12 |
| 52 | GET | `/org-documents` | list + filter | F-10 |
| 53 | GET | `/org-documents/proposals` | manager-proposed drafts queue | F-9 / F-10 |
| 54 | GET | `/org-documents/groups/:groupId` | the full version chain of a policy group | F-10 |
| 55 | GET | `/org-documents/:id` | detail | F-10 |
| 56 | GET | `/org-documents/:id/versions` | version chain from any member | F-10 |
| 57 | GET | `/org-documents/:id/view-url` | presigned GET | F-10 |
| 58 | GET | `/org-documents/:id/audit-logs` | audit trail | F-11 |
| 59 | GET | `/org-documents/:id/recipients` | roster + counts by state | F-7 |
| 60 | POST | `/org-documents/:id/recipients/sync` | top-up against the frozen criteria | F-7 |
| 61 | POST | `/org-documents/:id/recipients/:userId/waive` | excuse one recipient | F-7 |

Declaration order inside `document_org_hr.routes.js`: #53, #54 (static prefixes) **before** any `/org-documents/:id` route; #60 before #61.

### 11.2 Manager plane — `/api/v1/documents/manager` · `[authenticate, authorize(['manager','hr']), requireFeature('documents.access')]`

| # | Method | Path | Purpose | Dossier |
|---|---|---|---|---|
| 62 | GET | `/org-documents/types` | org-plane types with `manager_can_request = true` | F-9 |
| 63 | POST | `/org-documents` | draft for one direct report (+ upload URL) | F-9 |
| 64 | PUT | `/org-documents/:id` | edit own draft | F-9 |
| 65 | POST | `/org-documents/:id/file` | re-issue upload URL for own draft | F-9 / F-2 |
| 66 | POST | `/org-documents/:id/file/confirm` | confirm own draft's upload | F-9 / F-2 |
| 67 | GET | `/org-documents/mine` | own proposals + their outcome | F-9 |
| 68 | GET | `/org-documents/:id` | detail of own proposal | F-9 |
| 69 | GET | `/org-documents/:id/view-url` | presigned GET for own proposal | F-9 |

Declaration order: #62 and #67 (static) before `/org-documents/:id`.

`#62` returns `[]` — not an error — when `manager_can_view_team_documents` is off, matching P1's `listTypes` behaviour exactly.

### 11.3 Self plane — `/api/v1/documents` · `[authenticate, requireFeature('documents.access')]`

| # | Method | Path | Purpose | Dossier |
|---|---|---|---|---|
| 70 | GET | `/me/hr-documents` | documents issued to me | F-8 |
| 71 | GET | `/me/hr-documents/:id` | detail (recipient-anchored) | F-8 |
| 72 | GET | `/me/hr-documents/:id/view-url` | presigned GET + `pending → viewed` | F-8 / F-8b |

### 11.4 Response envelope

All 30 endpoints use the existing `{ success, message, data }` envelope produced by the module's `envelope()` helper. List endpoints put `{ total, rows }` (and `counts_by_state` for #59) inside `data`. Errors use the platform `AppError` shape `{ success: false, message, errorCode, details? }`.

### 11.5 Frontend change record

Phase 2 adds endpoints but changes **no existing** request or response shape. Per the project rule, a dated change record is still required because the frontend gains a surface: `public/md_updates/2026-XX-XX-documents-phase2-org-documents.md`, written at Step 10 (§23), listing all 30 endpoints, their request/response schemas, the uniform-404 contract, and the fields the frontend must **not** expect (`storage_key`, `targeting` on employee responses).

---

## 12. Business Rules & Validations

Phase 1 owns R-1…R-35. Phase 2 adds R-36…R-75.

### 12.1 Type and plane

| # | Rule | Enforced at | Error |
|---|---|---|---|
| R-36 | An org document's type must have `plane='org'` | service, `_loadTypeAndPolicy({ expectedPlane: 'org' })` | `422 DOCUMENT_TYPE_PLANE_MISMATCH` |
| R-37 | The type must be `is_active=true` at draft creation **and** re-checked at publish | service | `409 DOCUMENT_TYPE_INACTIVE` |
| R-38 | `document_type_id` is immutable after creation | service | `422 IMMUTABLE_FIELD` |
| R-39 | `is_confidential` is tighten-only against the type (D-12) | service | silently raised, never lowered |
| R-40 | `requires_acknowledgement` and `requires_signature` may be raised above the type's default but never lowered below it | service | `422 FLAG_CANNOT_BE_LOWERED` |

### 12.2 Targeting

| # | Rule | Enforced at | Error |
|---|---|---|---|
| R-41 | Departments are matched on `employee_profiles.department_id` only; the free-text `department` column is never read | utils (signature) + service (query) | n/a — structural |
| R-42 | An empty array matches everything; a non-empty array must contain the profile's value | `matchesCriteria` | n/a |
| R-43 | `excluded_users` wins outright, evaluated before every other criterion | `matchesCriteria` | n/a |
| R-44 | A non-empty `included_users` restricts the result; it does not override the attribute filters | `matchesCriteria` | n/a |
| R-45 | All six targeting arrays empty = the whole active workforce (`scope: 'all'`) | `isOrgWide` | n/a |
| R-46 | Only active, non-deleted users with an `employee_profiles` row can be recipients | resolver SQL | n/a |
| R-47 | Every `target_departments` id must exist in `organization_departments` for this org | service | `422 TARGET_DEPARTMENT_UNKNOWN` |
| R-48 | Every `target_locations` id must exist in `organization_locations` for this org | service | `422 TARGET_LOCATION_UNKNOWN` |
| R-49 | Every id in `included_users` / `excluded_users` must be an active member of this org | service | `422 TARGET_USER_UNKNOWN` |
| R-50 | `included_users` and `excluded_users` must be disjoint | validator | `422 VALIDATION_ERROR` |
| R-51 | Each targeting array is capped at 200 elements | validator | `422 VALIDATION_ERROR` |
| R-52 | Targeting is editable **only** while `status='draft'` | service | `409 ORG_DOCUMENT_NOT_EDITABLE` |
| R-53 | After publish, `targeting` JSONB is immutable — no code path updates it | service (no update path exists) | n/a — structural |
| R-54 | `syncRecipients` resolves against `targeting.criteria` (frozen), never the live array columns | service | n/a — structural |

R-47 through R-49 exist because the DB cannot express an FK from an array element. They are the only guard against a typo silently producing a zero-recipient publish that looks successful.

### 12.3 Lifecycle

| # | Rule | Enforced at | Error |
|---|---|---|---|
| R-55 | Legal transitions: `draft→published`, `draft→rejected`, `published→superseded`, `published→retired`. Nothing else. | `canTransition` + service | `409 INVALID_STATUS_TRANSITION` |
| R-56 | Publish requires a confirmed file (`storage_key AND confirmed_at`) or a `reference_url` | `isPublishable` | `409 ORG_DOCUMENT_FILE_MISSING` |
| R-57 | At most one `published` row per `(org_id, document_group_id)` | partial unique index + advisory lock | `409 ORG_DOCUMENT_ALREADY_PUBLISHED` |
| R-58 | `version` is assigned at publish, under the advisory lock, as `MAX(version)+1` over the group | service | n/a |
| R-59 | At most one `draft` row per `(org_id, document_group_id)` at a time | service check under the advisory lock | `409 ORG_DOCUMENT_DRAFT_EXISTS` |
| R-60 | Only `draft` and `rejected` rows can be soft-deleted | service | `409 ORG_DOCUMENT_NOT_DELETABLE` |
| R-61 | `effective_to >= effective_from` when both are present | validator + DB CHECK | `422 EFFECTIVE_WINDOW_INVALID` |
| R-62 | The effective window is applied **on read** (`resolveOrgDisplayStatus`), never by mutating `status` | read service | n/a — structural |
| R-63 | A retired document stays readable by its recipients and is `is_actionable: false` | read service | n/a |

### 12.4 Recipients

| # | Rule | Enforced at | Error |
|---|---|---|---|
| R-64 | A recipient row is never deleted; `waived` is the only exit | no delete path exists; no `deleted_at` column | n/a — structural |
| R-65 | `waive` is legal from `pending` / `viewed` only | service | `409 RECIPIENT_ALREADY_COMPLETED` |
| R-66 | `due_on = IST(published_at) + acknowledgement_due_days`, null when acknowledgement is not required | `resolveDueOn` | n/a |
| R-67 | `pending → viewed` happens on view-url issue only, guarded by `WHERE state='pending'` | service | n/a |
| R-68 | A resolved recipient set larger than `ORG_PUBLISH_SYNC_LIMIT` is refused synchronously | service | `422 RECIPIENT_SET_TOO_LARGE` |
| R-69 | Zero recipients is a successful publish with a warning, never an error (EC-15) | service | n/a |
| R-75 | A recipient added by `sync` has `due_on` computed from the sync date, never from the original `published_at` (EC-13) | `resolveDueOn` call site | n/a |

### 12.5 Manager Tier-B

| # | Rule | Enforced at | Error |
|---|---|---|---|
| R-70 | A manager can never publish, retire, replace, sync or delete an org document — regardless of `manager_direct_document_authority` | `resolveOrgDocumentAuthority` + absence of routes | `403 FORBIDDEN` |
| R-71 | A manager draft must target exactly one user, who must be a direct report at draft time and at every subsequent touch | validator + service | `403 FORBIDDEN` |
| R-72 | The type must have `manager_can_request = true` | service, via `resolveEffectivePolicy` | `403 FORBIDDEN` |
| R-73 | At publish, the proposer's scope is re-verified (EC-19); a change blocks publish unless HR passes `override_scope_change` | service | `409 PROPOSER_SCOPE_CHANGED` |
| R-74 | A manager cannot delete their own proposal | no route; authority denies | `403 FORBIDDEN` |

---

## 13. Authorization & Security

### 13.1 The chokepoint

Every org-document read and write passes through `resolveOrgDocumentAuthority` in `document_authority.utils.js`. It is pure, DB-free and unit-tested as a matrix. No controller and no repository makes an authorization decision.

```text
resolveOrgDocumentAuthority({
  audience,            // 'self' | 'manager' | 'hr'
  action,              // 'view' | 'download' | 'create' | 'update' | 'publish' |
                       // 'retire' | 'replace' | 'reject' | 'delete' | 'sync' | 'waive'
  actorUserId,
  actorRole,
  status,              // org_documents.status
  isRecipient,         // boolean, self plane only
  proposedBy,          // org_documents.proposed_by
  accessibleUserIds,   // manager plane only; Array required, null never grants scope
  typeFlags,           // { managerCanRequest, isConfidential, ... }
  settingsFlags        // { managerCanViewTeamDocuments, ... }
}) -> { allowed: boolean, reason: string|null }
```

Branch summary:

| audience | read | write |
|---|---|---|
| `self` | `isRecipient === true` **and** `status ∈ ORG_VISIBLE_STATUS.self` | none in Phase 2 |
| `manager` | `settingsFlags.managerCanViewTeamDocuments` **and** `proposedBy === actorUserId` **and** `status ∈ ORG_VISIBLE_STATUS.manager` | `create`/`update`/`file`/`confirm` only, and only while `status='draft'` and `proposedBy === actorUserId` and the single target is in `accessibleUserIds` |
| `hr` | all statuses | all actions |

### 13.2 Uniform denial (parent §12.2, applied unchanged)

| Addressing mode | Denial |
|---|---|
| `/hr/org-documents/:id*`, `/manager/org-documents/:id*`, `/me/hr-documents/:id*` | **always** `404` · `errorCode: DOCUMENT_NOT_FOUND` · message `"Document not found"` · **no `details`** |
| `/manager/org-documents` with a `target_user_id` outside scope | `403` · `errorCode: FORBIDDEN` · message `"Forbidden"` |

The `404` body is byte-identical to the employee plane's, which is the point: an id probe cannot distinguish "does not exist", "other org", "other plane", "draft", or "not addressed to you".

### 13.3 Data-exposure rules

| Field | Rule |
|---|---|
| `storage_key` | never returned, never logged, never audited. Readable only through `org_document.repository.findByIdForStorage`. Excluded from the frozen `LIST_ATTRIBUTES` / `DETAIL_ATTRIBUTES`. |
| `reference_url` | excluded from list projections; returned only by `view-url` for `storage_backend='reference'`. (Note: P1's employee-plane `LIST_ATTRIBUTES` includes `reference_url`, which contradicts its own §12 — §26.2 D-3 records it; Phase 2 does **not** repeat it.) |
| `targeting`, `recipient_count`, `proposed_by`, `created_by`, `updated_by` | HR and manager responses only; **never** in `/me/hr-documents*` responses |
| Recipient identities | HR only (#59). An employee cannot discover who else received a document. |
| Presigned URLs | TTL from setting #62 (view) / #63 (upload); never persisted, never logged |

### 13.4 Tenancy

Every repository method takes `orgId` as its first argument and every `where` includes it. There is no code path that reads an `org_documents` or `org_document_recipients` row by id alone. Cross-org ids therefore resolve to "not found" before any authorization logic runs.

Platform roles (`admin`, `super-admin`) appear in no `authorize()` list in this module and get no tenant document data — consistent with the tenant/platform plane split.

### 13.5 Injection and input surface

All queries are Sequelize-built except the advisory lock and the audience resolver, both of which use bound `:replacements` exclusively. Targeting arrays reach the SQL as bound array parameters compared with `= ANY(:param)`; no array is ever interpolated into a string.

---

## 14. Document Lifecycle & State Transitions

### 14.1 `org_documents.status`

```text
                         (reject, HR)
            ┌──────────────────────────────► rejected ──┐
            │                                           │ (soft delete)
  [create] ─┴─► draft ──(publish)──► published ──┬──────►│
                 │                               │       │
                 │ (soft delete)                 ├─(retire)──► retired
                 └──────────────────────────► ✕  │
                                                 └─(a newer version publishes)──► superseded
```

| From | To | Trigger | Guard |
|---|---|---|---|
| — | `draft` | F-1 create, F-5 replace, F-9 manager draft | at most one draft per group (R-59) |
| `draft` | `published` | F-4 | `isPublishable`, type active, size limit, EC-19 |
| `draft` | `rejected` | F-9 HR reject | `proposed_by IS NOT NULL` |
| `published` | `superseded` | F-4 on a newer version of the same group | automatic, same transaction |
| `published` | `retired` | F-6 | reason required |
| `draft` / `rejected` | soft-deleted | F-12 | `deleted_at` set; status unchanged |

**Terminal states:** `superseded`, `retired`, `rejected`. Nothing transitions out of them. A group can receive a new `published` version after `retired` or `superseded`, because the partial unique index is free.

### 14.2 Derived display status (read-only, `status='published'` only)

| Condition (IST dates) | `display_status` |
|---|---|
| `effective_from > today` | `scheduled` |
| `effective_to IS NOT NULL AND effective_to < today` | `expired` |
| otherwise | `active` |

This is derived on every read and never persisted, so a missed Phase-4 cron cannot produce a compliance false-negative (the EC-17 discipline, applied to the org plane).

### 14.3 `org_document_recipients.state`

```text
  pending ──(view-url issued)──► viewed ──(P3)──► acknowledged ──(P3)──► signed
     │                             │
     └──────(HR waive)─────────────┴──────────► waived
```

| From | To | Trigger | Phase |
|---|---|---|---|
| `pending` | `viewed` | F-8b, guarded `WHERE state='pending'` | **2** |
| `pending` / `viewed` | `waived` | F-7 HR waive | **2** |
| `viewed` | `acknowledged` | employee acknowledges | 3 |
| `acknowledged` | `signed` | e-signature completes | 3 |

A recipient row is never deleted and never regresses. `acknowledged` and `signed` exist in the enum from `00050` so Phase 3 needs no `ALTER TYPE`.

---

## 15. Workflows

### 15.1 HR publishes a policy to two departments

```text
HR → POST /hr/org-documents { type: code_of_conduct, title, target_departments: [eng, sales],
                              requires_acknowledgement: true, acknowledgement_due_days: 14 }
   ← 201 { id, document_group_id, status: draft, upload_url }
HR → PUT  upload_url  (binary straight to S3; never transits Node)
HR → POST /hr/org-documents/:id/file/confirm { file_name: 'coc-v3.pdf' }
   ← 200 { confirmed_at, size_bytes, content_type }
HR → POST /hr/org-documents/:id/publish
   ← 200 { status: published, version: 1, recipient_count: 412, warnings: [] }
Employee (Engineering) → GET /me/hr-documents
   ← 200 { rows: [ { title, due_on: 2026-10-07, state: pending, is_actionable: true } ] }
Employee (Finance)     → GET /me/hr-documents/:id
   ← 404 { errorCode: DOCUMENT_NOT_FOUND, message: 'Document not found' }
```

### 15.2 HR publishes v2

```text
HR → POST /hr/org-documents/:v1Id/replace       ← 201 { id: v2Id, document_group_id: same, upload_url }
HR → PUT upload_url ; POST /hr/org-documents/:v2Id/file/confirm
HR → POST /hr/org-documents/:v2Id/publish
   ← 200 { version: 2, supersedes_id: v1Id, recipient_count: 418 }
HR → GET /hr/org-documents/:v2Id/versions
   ← 200 [ { version: 1, status: superseded, recipient_count: 412 },
            { version: 2, status: published,  recipient_count: 418 } ]
```

v1's 412 recipient rows are untouched — the acknowledgement history of v1 survives intact, which is the whole point of anchoring recipients on the document row rather than the group.

### 15.3 Manager Tier-B warning letter

```text
Manager → GET  /manager/org-documents/types            ← [ warning_letter, show_cause_notice, pip ]
Manager → POST /manager/org-documents { document_type_id: warning_letter,
                                        target_user_id: <direct report>, title }
        ← 201 { id, status: draft, proposed_by: <manager>, upload_url }
Manager → PUT upload_url ; POST /manager/org-documents/:id/file/confirm
HR      → GET  /hr/org-documents/proposals              ← [ the draft ]
HR      → POST /hr/org-documents/:id/publish
        ← 200 { status: published, recipient_count: 1, approved_by: <hr> }
   …or…
HR      → POST /hr/org-documents/:id/reject { reason }
        ← 200 { status: rejected, rejection_reason, approved_by: <hr>, actioned_at }
```

If the report changed managers between draft and publish, the publish returns `409 PROPOSER_SCOPE_CHANGED` and HR must pass `override_scope_change: true` to proceed — recorded in the audit entry as `scope_override: true`.

### 15.4 New joiner after publish

```text
(employee joins Engineering on 2026-10-01; the policy was published 2026-09-20)
HR → POST /hr/org-documents/:id/recipients/sync
   ← 200 { added_count: 1, recipient_count: 413 }
```

The sync resolves against the **frozen** `targeting.criteria`, so the new joiner is matched by the same rule the original audience was. Phase 4 replaces the manual call with an employee-created hook and a nightly catch-up; the service method it calls is the one built here.

---

## 16. Transactions & Concurrency

Phase 1 owns races C-1…C-11. Phase 2 adds C-12…C-22.

### 16.1 Transaction boundaries

| Operation | Boundary | Inside | Outside |
|---|---|---|---|
| F-1 create draft | one txn | insert + audit | presign (after commit) |
| F-2 confirm | one txn | `FOR UPDATE` re-read, update, audit | **`HeadObject`** (before the txn) |
| F-3 update draft | one txn | `FOR UPDATE`, update, audit | validation queries for dept/location ids run inside (they must see the same snapshot) |
| F-4 publish | **one txn** | advisory lock, both `FOR UPDATE` reads, audience resolution, label read, both updates, chunked recipient insert, counter, audit | nothing |
| F-5 replace | one txn | advisory lock, `FOR UPDATE`, draft-exists check, insert, audit | presign (after commit) |
| F-6 retire | one txn | advisory lock, `FOR UPDATE`, update, audit | nothing |
| F-7 waive | one txn | `FOR UPDATE` on the recipient row, update, audit | nothing |
| F-7 sync | one txn | advisory lock, `FOR UPDATE` on the document, resolution, chunked insert, counter, audit | nothing |
| F-8b mark viewed | its own short txn | guarded update + `recordDetached` | presign (before the txn) |
| F-12 delete | one txn | `FOR UPDATE`, soft delete, audit | `deleteObject` (best-effort, after commit) |

Publish is the only long transaction. Its cost is dominated by the audience query and the chunked insert; both are bounded by `ORG_PUBLISH_SYNC_LIMIT`. Everything that can be moved out (presign, `HeadObject`, `deleteObject`) is out — the P1 rule.

### 16.2 Lock protocol

```js
await db.sequelize.query(
  'SELECT pg_advisory_xact_lock(hashtext(:key))',
  { replacements: { key: `docorg:${orgId}:${groupId}` }, transaction: t }
)
```

Rules, inherited from P1 unchanged:

1. The advisory lock is taken **before** any row lock in the same transaction.
2. Only one namespace per transaction. A publish never also takes `docgrp:` or `docslot:` — those belong to the employee plane and no operation spans both planes.
3. When more than one `org_documents` row must be locked (publish: subject + predecessor), they are locked in ascending `id` order.
4. `pg_advisory_xact_lock` (not the session variant) so the lock is released by commit **and** by rollback, including on process death.

### 16.3 Race register

| # | Race | Outcome | Mechanism |
|---|---|---|---|
| C-12 | Two HR users publish two different drafts of the same group simultaneously | One becomes v-next; the other blocks, then supersedes it and becomes v-next+1. Both succeed, versions are contiguous. | `docorg:` advisory lock + `MAX(version)+1` recomputed inside the lock |
| C-13 | Two HR users publish the **same** draft simultaneously | First publishes; second blocks, re-reads `status='published'` at step 4 and returns the idempotent success. No duplicate recipients. | advisory lock + status re-read + `ignoreDuplicates` |
| C-14 | Publish races a direct DB insert that bypasses the lock | `23505` on `org_documents_published_group_unique_idx` → whole transaction rolls back → `409 ORG_DOCUMENT_ALREADY_PUBLISHED` | partial unique index |
| C-15 | Publish races an employee transfer (department changes mid-resolution) | The audience is whatever the transaction's snapshot sees. `READ COMMITTED` means the set is consistent within the statement. A transfer committed after the resolve is handled by `sync`, not by the publish. | documented semantics; `sync` is the remedy |
| C-16 | Publish races the type being deactivated | The type is re-read inside the transaction; if `is_active=false`, `409 DOCUMENT_TYPE_INACTIVE` and rollback. Deactivation holds `doctypes:{orgId}` which does not conflict, so this is a snapshot race, not a lock race — the re-read is the guard. | in-txn re-read |
| C-17 | Two `replace` calls on the same published row | First creates the draft; second blocks on `docorg:`, sees the draft, returns `409 ORG_DOCUMENT_DRAFT_EXISTS` with the first draft's id | advisory lock + draft-exists check |
| C-18 | `retire` races `publish` of v-next on the same group | Serialised by `docorg:`. Whichever runs second sees the other's committed state: retire-then-publish leaves the group with a retired v1 and a published v2; publish-then-retire leaves a superseded v1 and a retired v2. Both are coherent. | advisory lock |
| C-19 | `sync` races `publish` on the same group | Serialised by `docorg:`. Sync after publish sees the frozen criteria and adds nothing (the publish already materialised everyone). | advisory lock |
| C-20 | Two `sync` calls simultaneously | Second blocks; on resume it finds no missing users and reports `added_count: 0` | advisory lock + unique index |
| C-21 | Employee double-clicks view-url | Both presign; both attempt the update; the `WHERE state='pending'` guard means exactly one writes `first_viewed_at` | guarded update |
| C-22 | `waive` races the employee's view-url transition | Both take `FOR UPDATE` on the recipient row; serialised. If waive commits first, the view transition's `WHERE state='pending'` matches nothing and is a no-op — correct, a waived recipient is not moved back to `viewed`. | row lock + guarded update |

### 16.4 Isolation level

Default `READ COMMITTED` throughout. Nothing in Phase 2 needs `REPEATABLE READ`: every correctness-critical read inside a transaction is either row-locked (`FOR UPDATE`) or protected by the advisory lock, and the audience resolution is intentionally a point-in-time snapshot (C-15).

### 16.5 Chunked insert

`bulkCreate` in slices of **1000** rows with `{ ignoreDuplicates: true, transaction: t }`. Rationale: a single 5,000-row `INSERT` builds a very large parameter list and a very large statement; 1000 keeps each statement's parameter count near 8,000 (8 columns), comfortably under Postgres's 65,535 bind-parameter limit with headroom for future columns. All chunks are in the **same** transaction, so a failure in chunk 4 rolls back chunks 1–3 — there is no such thing as a partially materialised publish.

---

## 17. Idempotency & Retry

Phase 2 adds no idempotency-key infrastructure. Every state-changing endpoint is made safe by a **natural key or a state guard**, which is the P1 approach and needs no new table.

| # | Endpoint | Duplicate-request behaviour | Mechanism |
|---|---|---|---|
| I-1 | #43 create draft | **Not idempotent** — two POSTs create two drafts. Mitigated by R-59 (only one draft per group) for the `replace` path; a genuinely duplicated *first* draft is an HR-visible duplicate they can delete. Documented, not hidden. |
| I-2 | #46 confirm | Idempotent. Second call re-runs `HeadObject`, finds the same object, writes the same values, returns the same row. |
| I-3 | #47 publish | Idempotent. Second call sees `status='published'` and returns `already_published: true` with the current state and **no** new recipients or audit row. |
| I-4 | #49 retire | Idempotent. Already-retired returns the current row. |
| I-5 | #50 reject | Idempotent. Already-rejected returns the current row. |
| I-6 | #48 replace | Idempotent-ish: the second call returns `409 ORG_DOCUMENT_DRAFT_EXISTS` carrying the existing draft id, which a client treats as success. |
| I-7 | #51 delete | Idempotent. Already soft-deleted returns success. |
| I-8 | #60 sync | Naturally idempotent — `ON CONFLICT DO NOTHING` plus `added_count: 0` on the second run. |
| I-9 | #61 waive | Idempotent from `waived`; `409` from `acknowledged`/`signed`. |
| I-10 | #72 view-url | Presigning is stateless; the `viewed` transition is guarded so it writes at most once. |

**Retry guidance for clients** (goes in the change record, §11.5): all `5xx` and all `409 ORG_DOCUMENT_ALREADY_PUBLISHED` responses on publish are safe to treat as "re-read the document and reconcile"; `422` responses are never retryable without changing the request.

**Partial-failure inventory.** The only operations that touch two systems are confirm (S3 read + DB write), create/replace (DB write + presign) and delete (DB write + S3 delete). In every case the DB write is the authority and the S3 call is either before the transaction (confirm), after it (delete) or non-durable (presign). There is no ordering in which a committed DB state depends on an uncommitted S3 state.

---

## 18. Error & Failure Handling

### 18.1 Error-code register (new in Phase 2)

| Code | HTTP | Raised by | Meaning |
|---|---|---|---|
| `DOCUMENT_NOT_FOUND` | 404 | every id-addressed route | **reused from P1 verbatim**, including the message, for uniform denial |
| `DOCUMENT_TYPE_NOT_FOUND` | 404 | F-1 | reused from P1 |
| `DOCUMENT_TYPE_PLANE_MISMATCH` | 422 | F-1 | reused from P1 |
| `DOCUMENT_TYPE_INACTIVE` | 409 | F-1, F-4 | type deactivated between draft and publish |
| `FLAG_CANNOT_BE_LOWERED` | 422 | F-1, F-3 | attempt to lower `requires_acknowledgement` / `requires_signature` below the type |
| `IMMUTABLE_FIELD` | 422 | F-3 | `document_type_id` change attempt |
| `TARGET_DEPARTMENT_UNKNOWN` | 422 | F-1, F-3 | department id not in this org |
| `TARGET_LOCATION_UNKNOWN` | 422 | F-1, F-3 | location id not in this org |
| `TARGET_USER_UNKNOWN` | 422 | F-1, F-3 | include/exclude user not an active member |
| `EFFECTIVE_WINDOW_INVALID` | 422 | validator | `effective_to < effective_from` |
| `ORG_DOCUMENT_NOT_EDITABLE` | 409 | F-3 | status is not `draft` |
| `ORG_DOCUMENT_FILE_MISSING` | 409 | F-4 | publish attempted without a confirmed file |
| `ORG_DOCUMENT_ALREADY_PUBLISHED` | 409 | F-4 | unique-index violation on the live-version index |
| `ORG_DOCUMENT_NOT_REPLACEABLE` | 409 | F-5 | source row is not `published` |
| `ORG_DOCUMENT_DRAFT_EXISTS` | 409 | F-5 | a draft already exists for this group; `details: { draft_id }` |
| `ORG_DOCUMENT_NOT_DELETABLE` | 409 | F-12 | status is not `draft`/`rejected` |
| `ORG_DOCUMENT_NOT_SYNCABLE` | 409 | F-7 | sync attempted on a non-published document |
| `INVALID_STATUS_TRANSITION` | 409 | F-4, F-6, F-9 | `canTransition` refused |
| `RECIPIENT_SET_TOO_LARGE` | 422 | F-4, F-7 | `details: { resolved_count, limit }` |
| `RECIPIENT_ALREADY_COMPLETED` | 409 | F-7 | waive attempted from `acknowledged`/`signed` |
| `PROPOSER_SCOPE_CHANGED` | 409 | F-4 | EC-19; `details: { target_user_id }` |
| `UPLOAD_NOT_FOUND` | 409 | F-2 | reused from P1 |
| `CONTENT_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE` | 422 | F-2 | reused from P1 |
| `STORAGE_UNAVAILABLE` | 503 | F-2, view-url | reused from P1 |
| `FORBIDDEN` | 403 | manager subject-addressed routes | reused from P1 |

**No new code is invented where a P1 code already carries the meaning.** That is why `DOCUMENT_NOT_FOUND` and the upload codes are reused rather than prefixed with `ORG_`.

### 18.2 Failure-mode table

| Failure | Detection | Response | Recovery |
|---|---|---|---|
| S3 unreachable at presign | AWS SDK throws | `503 STORAGE_UNAVAILABLE` | client retries; for F-1 the draft already exists, so the client calls #45 |
| S3 unreachable at `HeadObject` | 3 s timeout, `maxAttempts: 1` | `503` | retry confirm |
| Object never uploaded | `HeadObject` 404 | `409 UPLOAD_NOT_FOUND` | re-PUT and re-confirm; the key is stable so nothing is orphaned |
| DB unavailable mid-publish | Sequelize throws | `500`, transaction rolled back by Postgres | retry publish; idempotent |
| Process killed mid-publish | — | Postgres rolls back; advisory lock released | retry publish |
| Audience resolution returns 0 rows | `resolved.length === 0` | `200` with `warnings: ['ZERO_RECIPIENTS']` | none needed (EC-15) |
| Audience resolution exceeds the limit | count check | `422 RECIPIENT_SET_TOO_LARGE` | HR narrows targeting |
| Chunk 4 of 5 fails on insert | Sequelize throws | whole transaction rolls back | retry; `ignoreDuplicates` makes it safe |
| `deleteObject` fails after a draft delete | SDK throws, caught | success is still returned | orphan object; logged; harmless (§19.3) |
| Detached view-audit write fails | caught in `recordDetached` | `console.error`, swallowed | the employee still gets their URL |

### 18.3 Observability

Structured `console.error` / `console.warn` prefixed `[Document]`, matching P1. Every log line carries `org_id`, `request_id`, `document_id` and **never** `storage_key`, `file_name` or any recipient's identity.

| Event | Level | Fields |
|---|---|---|
| Publish completed | info | `document_id`, `version`, `resolved_count`, `duration_ms`, `chunk_count` |
| Publish refused for size | warn | `document_id`, `resolved_count`, `limit` |
| Zero recipients published | warn | `document_id`, `scope` |
| Proposer scope changed | warn | `document_id`, `proposed_by`, `override` |
| Orphan object delete failed | error | `document_id` (not the key) |
| Detached audit failed | error | `document_id`, `action` |

`duration_ms` on publish is the metric that answers the §24.6 performance question; it must be emitted from day one so the EC-16 threshold can be set from data rather than guessed.

---

## 19. Storage / File Responsibilities & DB↔Storage Consistency

### 19.1 Key shape

```
org/{orgId}/documents/org/{documentGroupId}/{documentId}
```

Built exclusively by the existing `buildDocumentKey({ orgId, plane: DOCUMENT_PLANE.ORG, subjectId: documentGroupId, documentId })`. `subjectId` is the **group** id, so every version of a policy lives under one prefix — useful for lifecycle rules and for reasoning about a policy's whole history in the bucket. `file_name` is never a path component; it is metadata only.

Every component is server-owned: `orgId` from the token, `documentGroupId` and `documentId` generated server-side. No client-supplied string reaches the key.

### 19.2 Who may read `storage_key`

Exactly two call sites, both in services, both through `org_document.repository.findByIdForStorage`:

1. `document_org.service.confirmFile` — to run `HeadObject`.
2. `document_org_read.service.viewUrl` — to presign the GET.

(and `document_org.service.deleteDraft` for the best-effort orphan delete, which is the third and final site — enumerated here so the chokepoint test can assert exactly three.)

### 19.3 DB↔storage consistency matrix

| Scenario | DB | Storage | Drift direction | Handling |
|---|---|---|---|---|
| Draft created, client never PUTs | row exists, `confirmed_at IS NULL` | no object | **DB-only** | benign; the draft is unpublishable and HR deletes it |
| Client PUTs, confirm never called | row exists, `confirmed_at IS NULL` | object exists | **storage-only** | benign; a re-confirm reconciles it, or the draft is deleted and the object is swept |
| Confirm succeeds, transaction fails | row unchanged | object exists | **storage-only** | benign; retry confirm |
| Draft deleted, `deleteObject` fails | row soft-deleted | object exists | **storage-only** | logged; the object is unreachable (no row → no `storage_key` → no presign) |
| Object deleted out-of-band | row published | no object | **DB-only** | `view-url` presigns successfully and the GET 404s at S3. Accepted: detecting it would require a `HeadObject` on every view, which doubles view latency. Documented as a known limitation, not a defect. |

**The invariant:** a committed DB row is always the authority, and drift is always in the "object exists without a live row" direction, which is recoverable by a sweep and never produces a wrong answer to a user. There is no path in which a published document's row exists while its object was never verified — `org_documents_published_shape_check` plus `isPublishable` make that structurally impossible.

### 19.4 Large files and high volume

- Binary never transits Node, in either direction. Uploads are direct-to-S3 pre-signed PUTs; downloads are pre-signed GETs. Phase 2 adds no multipart handling and no `multer`.
- The per-type `max_file_size_bytes` ceiling and the org ceiling (`ORG_CEILING_BYTES = 25 MiB`) apply unchanged via `assertUploadAllowed`, evaluated against the **verified** `ContentLength`, not the claimed one.
- Volume is bounded per publish by `ORG_PUBLISH_SYNC_LIMIT`; beyond it, Phase 5's async path is required.

---

## 20. Background Jobs, Events & Integrations

### 20.1 Background jobs

**Phase 2 registers no cron and no worker.** This is deliberate and is the main reason the phase stays reviewable.

| Candidate job | Phase | Why not Phase 2 |
|---|---|---|
| Expiry sweep over `effective_to` | 4 | Expiry is derived on read (§14.2), so nothing is *wrong* without the cron. The partial index `org_documents_org_effective_to_idx` is created now so Phase 4 needs no migration. |
| Acknowledgement reminders | 4 | Depends on the notification outbox (D-16) and on Phase 3 acknowledgements. The partial index `org_document_recipients_org_due_idx` is created now. |
| Recipient top-up on join | 4 | The service method (`syncRecipients`) ships in Phase 2 and is exposed as an HR endpoint; Phase 4 wires the trigger. |
| Orphan-object sweep | 4+ | Drift is benign (§19.3) and low-volume. |

When those jobs are built, they follow the established platform rule: registered only when `os.platform() === 'linux'`, `timezone: 'Asia/Kolkata'`, with a `runStartupCatchUp()`. Nothing in this plan pre-empts that.

### 20.2 Events

No event bus exists in this code base and Phase 2 does not introduce one. The integration seam for Phase 4 is the exported service method, not an emitted event.

### 20.3 Integrations (read-only, all existing)

| System | Used for | Coupling |
|---|---|---|
| `employee_profiles` | audience resolution (`department_id`, `location_id`, `employment_type`, `job_status`) | a single SQL query in `document_recipient.service`; no writes |
| `users` | active/deleted filter on the audience; FK targets for actor columns | read-only |
| `organization_departments` / `organization_locations` | criteria validation + the EC-36 label snapshot | read-only |
| `hierarchy_access.getAccessibleUserIds` | manager scope and the EC-19 re-check | read-only |
| `requireFeature('documents.access')` | entitlement gate on all 30 routes | read-only |
| S3 (via `object_storage.utils`) | presigned PUT/GET, `HeadObject`, `deleteObject` | unchanged from P1 |

**Notifications are not sent in Phase 2.** Publishing a mandatory policy produces recipient rows and nothing else — no email, no in-app notification. That is a real functional gap and it is Phase 4's, not a defect of this plan; it is called out in the change record so the frontend knows the employee must discover the document by visiting `/me/hr-documents`.

---

## 21. Org Settings

**Phase 2 adds zero new org settings.** Parent §11 assigns none to this phase, and nothing in the reconstructed scope requires one.

Settings consumed (all existing, all Phase 1, unchanged semantics):

| # | Setting | Used by |
|---|---|---|
| #58 | `manager_can_view_team_documents` | gates the entire manager org surface (#62–#69) |
| #59 | `manager_direct_document_authority` | **explicitly ignored** for org documents — see R-70 |
| #62 | `document_view_url_ttl_seconds` | presigned GET TTL (#57, #69, #72) |
| #63 | `document_upload_url_ttl_seconds` | presigned PUT TTL (#43, #45, #63, #65) |
| #64 | `document_max_file_size_bytes` | org ceiling inside `resolveEffectivePolicy` |

`ORG_PUBLISH_SYNC_LIMIT` is a **code constant** in `document_org_rules.utils.js`, provisionally `20000`, not an org setting. Making it configurable before it has been measured would be premature (§26.1 O-2); parent §13.5 explicitly defers the threshold decision to Phase 5.

`public/md_settings/org_settings_registry.md` therefore needs **no edit** for Phase 2. It is re-read at Step 10 to confirm that, and the confirmation is recorded in the completion report rather than by adding rows.

---

## 22. Edge-Case Register Discharge

### 22.1 Parent-plan edge cases tagged for Phase 2

| EC | Text | Discharge |
|---|---|---|
| EC-13 (2/4) | Employee joins after a policy was published → topped up; never retroactively marked non-compliant before their join date | `syncRecipients` (#60) with `source='sync'` and `due_on` computed from the sync date (R-75). The automatic trigger is Phase 4's half. |
| EC-15 (2) | Targeting resolves to zero recipients → publish succeeds with a warning | F-4 failure table; `200` + `warnings: ['ZERO_RECIPIENTS']` + `recipient_count: 0`; asserted by test T-14. |
| EC-16 (2/5) | Publish to 5,000 recipients → batched inside the transaction; above the threshold, `202` + worker | Phase 2 batches at 1000 rows/chunk inside one transaction (§16.5) and refuses above `ORG_PUBLISH_SYNC_LIMIT` with `422`. The `202`+worker path and the measured threshold stay Phase 5. `duration_ms` is emitted from day one so Phase 5 has data (§18.3). |
| EC-19 (1/2) | Tier-B proposal whose subject stops reporting to the proposer before approval → scope re-checked at approval | F-4 step 8; `409 PROPOSER_SCOPE_CHANGED`; HR override is explicit and audited. |
| EC-36 (2) | Org document targeting a department that is later deleted → frozen snapshot keeps the publish record intelligible | `targeting.labels.departments[]` captures `{ id, name }` inside the publish transaction (§6.3); every HR read renders from the snapshot, never from a live join. |

### 22.2 Additional edge cases surfaced by this reconstruction

| # | Case | Handling |
|---|---|---|
| P2-EC-1 | The document type is deactivated between draft and publish | Re-read inside the publish transaction → `409 DOCUMENT_TYPE_INACTIVE` (C-16) |
| P2-EC-2 | A targeted department is deleted between draft and publish | The audience simply resolves to fewer people; if that is zero, EC-15 applies. Criteria validation (R-47) happens at draft/edit time, not at publish, so a deletion does not *block* the publish — it narrows it, and the snapshot records what was asked for. |
| P2-EC-3 | An employee has no `employee_profiles` row | Never a recipient (the resolver inner-joins profiles). Documented so it is not mistaken for a bug. |
| P2-EC-4 | An employee is deactivated after publish | Their recipient row survives. They cannot log in, so they cannot see it. `sync` never removes them. Compliance reporting (Phase 3) is responsible for excluding inactive users from denominators. |
| P2-EC-5 | A policy is retired, then a new version is published into the same group | Legal — the partial unique index is free after retirement. The version chain shows `retired` then `published`. |
| P2-EC-6 | `included_users` names someone the attribute filters exclude | They are **not** a recipient (R-44 — include restricts, it does not override). This is the payroll/leave semantics and is the most likely source of HR surprise; `describeTargeting` and the publish response's `resolved_count` make it visible immediately, and the change record calls it out for the UI. |
| P2-EC-7 | Two versions of a policy both have live recipient rows | Expected and correct: v1's recipients preserve v1's acknowledgement history. The employee's shelf shows the live version as actionable and older versions as history. |
| P2-EC-8 | A manager is removed from the manager role while holding a draft | Every manager touch re-resolves `getAccessibleUserIds`; the route's `authorize(['manager','hr'])` fails first. The draft remains visible to HR in the proposals queue. |
| P2-EC-9 | HR publishes a draft that a manager is concurrently editing | Both take `FOR UPDATE` on the row. Publish-first means the edit gets `409 ORG_DOCUMENT_NOT_EDITABLE`; edit-first means publish sees the edited row. Both outcomes are coherent and audited. |
| P2-EC-10 | `effective_from` in the past at publish time | Allowed. `display_status` is `active` immediately. Backdating a policy is a legitimate HR act and is recorded in the audit entry. |

---

## 23. Implementation Sequence

Eleven steps. Each has a **verify** gate that must pass before the next step starts. Steps 1–3 have no runtime dependency on each other and could be parallelised, but the order below keeps the test suite green at every commit.

| Step | Work | Verify |
|---|---|---|
| **0** | Pre-flight (§2). Record the `npm test` baseline in the PR description. | P-1…P-9 all pass |
| **1** | `document_targeting.utils.js` + `document_org_rules.utils.js`, pure, with their unit tests. No other file touched. | `npx node --test tests/unit/document/document_targeting.utils.test.js tests/unit/document/document_org_rules.utils.test.js` green; full suite unchanged |
| **2** | Characterisation test for P1's `_assertContentTypeAndSize` (T-1), **then** promote it to `document_type_rules.assertUploadAllowed` and repoint `document_upload.service`. Parameterise `_loadTypeAndPolicy` with `expectedPlane`. | T-1 green **before and after** the move; document suite still 52+ pass; full suite unchanged |
| **3** | Additive exports on `document_authority.utils` (`ORG_VISIBLE_STATUS`, `screenOrgDocument`, `resolveOrgDocumentAuthority`) and `document_version.utils` (`isOrgReplaceable`) + their matrix tests. | authority matrix test green; P1 authority tests unchanged and still green |
| **4** | Migration `00050` + both models + `models.index` registration. **Do not run it.** Static review against §6; `down()` symmetry check; enum-drop completeness check. | `node -e "require('./src/infrastructure/postgres-sql/models.index')"` loads without error; migration file reviewed against the §6 tables; handed to the operator |
| **5** | `org_document.repository` + `org_document_recipient.repository` with frozen projections. | projection unit test: `LIST_ATTRIBUTES` and `DETAIL_ATTRIBUTES` contain no `storage_key`; `findByIdForStorage` is the only method that does |
| **6** | `document_recipient.service` (`resolveAudience`, `materialise`, `syncRecipients`, `waive`, `markViewed`). | service tests with mocked repos: chunking at 1000, `ignoreDuplicates`, the `matchesCriteria` re-check drops non-matching rows, sync `due_on` uses the sync date |
| **7** | `document_org.service` (F-1, F-2, F-3, F-4, F-5, F-6, F-12) + HR controller/validator/routes #43–#58, #51. | publish call-order test (advisory lock before row locks; audit inside the txn); transition matrix; idempotent publish |
| **8** | Recipient HR surface #59–#61 + `document_org_read.service` HR reads. | roster counts, waive matrix, sync idempotency |
| **9** | Manager surface #62–#69 (F-9) including the EC-19 re-check in publish. | manager authority tests; EC-19 block and override paths |
| **10** | Self surface #70–#72 (F-8, F-8b). | uniform-404 byte-comparison test against the employee plane; projection test; double-view guard |
| **11** | Docs: `public/md_updates/<date>-documents-phase2-org-documents.md`; `public/md_system/api_registry.md` gains three "(Phase 2)" sections; `phase2_completion_report.md`; `DOCUMENTS_API_CONTRACT.md` extended with the org plane; ops hand-back note for migration `00050`. | registry diff reviewed; change record lists all 30 endpoints |

**Dependency graph (why this order).** Utils (1–3) have no dependencies and unblock everything. The migration and models (4) must precede repositories (5), which must precede services (6–7). `document_recipient.service` (6) precedes `document_org.service` (7) because publish calls `materialise`. The manager surface (9) depends on publish's EC-19 hook existing (7). The self surface (10) depends on recipients existing (6) and on the authority exports (3). Documentation (11) is last because it must describe what was actually built.

---

## 24. Testing Requirements

All tests are `node:test`, run by `npm test`, located under `tests/unit/document/`. There is no DB in the test environment, so tests are either **pure** (utils) or **service-level with mocked repositories**. That is the P1 pattern and it stays.

### 24.1 Pure unit tests (no mocks)

| # | Target | Cases |
|---|---|---|
| T-1 | `assertUploadAllowed` (characterisation, written **before** the move) | allowed type; disallowed type; exactly-at-limit; over-limit; missing content type — error code and message pinned byte-for-byte |
| T-2 | `matchesCriteria` | all-empty matches everyone; single department; two departments; department + location intersection; employment type; job status; `excluded_users` beats everything including `included_users`; non-empty `included_users` restricts; a null `department_id` against a non-empty filter fails; a profile matching every filter passes |
| T-3 | `normaliseCriteria` | missing keys defaulted to `[]`; duplicates removed; frozen result |
| T-4 | `describeTargeting` / `isOrgWide` | each scope token; mixed |
| T-5 | `diffCriteria` | added/removed on each array |
| T-6 | `canTransition` | the full 5×5 matrix, including every illegal pair |
| T-7 | `isPublishable` | s3 without confirm; s3 with confirm; reference; neither |
| T-8 | `resolveOrgDisplayStatus` | scheduled / active / expired / non-published passthrough; IST boundary (23:59 IST on the last effective day is still `active`) |
| T-9 | `resolveDueOn` | null when no acknowledgement; IST arithmetic across a month boundary; leap-year day |
| T-10 | `resolveOrgDocumentAuthority` | the full audience × action × status × `isRecipient` matrix; `accessibleUserIds: null` never grants manager scope; `manager_direct_document_authority: true` still denies `publish` |
| T-11 | `screenOrgDocument` | `draft` invisible to self; `retired` visible to self; `rejected` invisible to self |

### 24.2 Service tests (mocked repositories and storage)

| # | Target | Cases |
|---|---|---|
| T-12 | publish call order | advisory lock issued before any `FOR UPDATE`; audit called with the transaction; `recipient_count` written after `materialise` |
| T-13 | publish idempotency | second call on a published row makes no insert, no audit, returns `already_published: true` |
| T-14 | publish EC-15 | zero recipients → success + `warnings: ['ZERO_RECIPIENTS']` |
| T-15 | publish EC-16 | resolved count over the limit → `422 RECIPIENT_SET_TOO_LARGE`, no insert attempted |
| T-16 | publish supersede | predecessor updated to `superseded` in the same transaction; `supersedes_id` and `version` set from the predecessor |
| T-17 | publish EC-19 | proposer scope changed → `409`; with `override_scope_change` → succeeds and audits `scope_override: true` |
| T-18 | materialise chunking | 2,500 recipients → 3 `bulkCreate` calls of 1000/1000/500, all with the same transaction and `ignoreDuplicates` |
| T-19 | `resolveAudience` re-check | a row returned by the (stubbed) SQL that fails `matchesCriteria` is dropped before insert |
| T-20 | sync | adds only missing users; `source='sync'`; `due_on` from the sync date; `added_count` correct on the second run; rejected on a retired document |
| T-21 | waive matrix | pending→waived; viewed→waived; acknowledged→409; waived→idempotent |
| T-22 | confirm | absent object → `409 UPLOAD_NOT_FOUND`, no DB write; oversized verified object → `422`; timeout → `503`; double confirm idempotent |
| T-23 | replace | non-published source → `409`; existing draft → `409 ORG_DOCUMENT_DRAFT_EXISTS` with the draft id; group id preserved |
| T-24 | retire | published→retired; superseded→409; double retire idempotent; recipients untouched |
| T-25 | delete | draft/rejected only; published→409; `deleteObject` failure does not fail the request |
| T-26 | manager authority | non-report target → `403 FORBIDDEN`; employee-plane type → `422`; `manager_can_request=false` → `403`; another manager's draft → uniform `404` |

### 24.3 Contract / security tests

| # | Assertion |
|---|---|
| T-27 | **Uniform 404**: the response body for `/me/hr-documents/<other-org id>`, `<draft id>`, `<not-a-recipient id>` and `<random uuid>` are byte-identical to each other **and** to the employee plane's `/me/documents/<random uuid>` body |
| T-28 | **`storage_key` chokepoint**: a source scan asserts `storage_key` appears in exactly three service call sites, all via `findByIdForStorage` |
| T-29 | **Projection**: no `/me/hr-documents*` response contains `targeting`, `recipient_count`, `proposed_by`, `created_by`, `updated_by`, `storage_key` or `reference_url` |
| T-30 | **Audit scrub**: publishing a document whose row is passed wholesale into `newValues` produces an audit row with no `storage_key` |
| T-31 | **Tenancy**: every `org_document.repository` method's `where` includes `org_id` (source-level assertion, mirroring P1's equivalent) |

### 24.4 Regression guard

`npm test` must end at **at least** `pass 1076` with the same 6 pre-existing failures and no new ones. Any change to those 6 is a stop-the-line event: it means a Phase-2 edit touched the attendance or employee modules, which §1.3 forbids.

### 24.5 What is NOT tested (and why)

- Actual Postgres behaviour of the partial unique indexes, the CHECK constraints and `pg_advisory_xact_lock` — no DB in this environment. These are verified by **static review** of `00050` and by the operator's migration run. Listed in §28 as an operator verification item, not claimed as tested.
- Real S3 round-trips — the provider is stubbed. The pre-signed contract is unchanged from Phase 1, which is in production.
- End-to-end HTTP — the project has no integration harness; the controller layer is thin by design so that service tests carry the behaviour.

### 24.6 Performance measurement (required before sign-off, operator-run)

On a non-production environment with a seeded 5,000-employee org:

1. Publish an org-wide document; record `duration_ms` from the publish log line.
2. Repeat at 500 / 2,000 / 5,000 recipients.
3. Record the numbers in `phase2_completion_report.md`.

If the 5,000-recipient publish exceeds **10 s**, `ORG_PUBLISH_SYNC_LIMIT` must be lowered to the measured safe value before release and the Phase-5 async work escalated. This number is currently **unmeasured** — §1.4 point 1.

---

## 25. Migration, Deployment & Backward Compatibility

### 25.1 Deployment order

1. Deploy code. All 30 new routes will 500 on first use because the tables do not exist — acceptable only if step 2 is immediate, so prefer:
2. **Run `00050` first**, then deploy code. `00050` is purely additive (two new tables, no alters), so it is safe to run against the currently-deployed Phase-1 code: nothing reads or writes the new tables until the new code lands.

The migration is handed to the operator with the `down()` path documented. It is **not** run from this environment.

### 25.2 Rollback

| Scenario | Action |
|---|---|
| Code is bad, data is fine | Redeploy the previous build. The new tables sit unused; Phase-1 behaviour is unaffected because no Phase-1 code path reads them. |
| Migration must be reverted | `00050 down()` drops both tables and the four enum types. **Destructive of Phase-2 data only.** Because nothing else references these tables, the revert is clean — no FK from any Phase-1 table points at them. |
| Partial rollout | Not applicable; there is no feature flag beyond the existing `documents.access` entitlement, which already gates the whole module. |

### 25.3 Backward compatibility

| Surface | Status |
|---|---|
| Endpoints #1–#42 | **Unchanged** — paths, request shapes, response shapes, error codes, status codes |
| `employee_documents` table | **Unchanged** — no column added, removed or altered |
| `document_types`, `document_type_catalog`, `document_settings`, `document_audit_logs` | **Unchanged** |
| Org settings #58–#67 | **Unchanged** — no new setting, no changed default, no changed semantics |
| `document_upload.service` public behaviour | **Unchanged** — `_loadTypeAndPolicy` gains a defaulted parameter; every existing call site keeps `expectedPlane: 'employee'` and the identical error |
| `_assertContentTypeAndSize` → `assertUploadAllowed` | **Behaviour-identical**, pinned by T-1 written before the move |
| `document_authority.utils` | **Additive exports only**; the two existing functions are untouched |
| Seeders | **Unchanged** — `009` is never edited (binding rule) |

The one observable change to an existing surface is that `document_types` with `plane='org'` become *usable* rather than merely activatable. Nothing about their activation endpoint changes.

---

## 26. Open Decisions, Risks & Phase-1 Carry-Over

### 26.1 Open decisions (blocking the step shown)

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| O-1 | **Meaning of D-2's "read-side composer".** | (a) Separate `/me/hr-documents` surface; composition happens per row across `org_documents` + `org_document_recipients` + `document_types`. (b) A single unified `/me/documents` inbox returning both planes in one list. | **(a).** (b) would change an existing Phase-1 response shape, which §1.3 forbids, and would force one pagination cursor over two tables with different sort keys. (a) satisfies "never a shared table" and leaves (b) available later as an additive endpoint. | Step 10 |
| O-2 | **`ORG_PUBLISH_SYNC_LIMIT` value.** | 20,000 provisional / a measured value / an org setting. | **Constant at 20,000 for Phase 2**, revisited in Phase 5 with the §24.6 numbers. Parent §13.5 explicitly says the threshold must be measured, not guessed — so it must not become a configurable knob before it is measured. | Step 7 |
| O-3 | **`rejected` as a status value.** | Add it to the enum / reuse `draft` + `rejection_reason` / soft-delete rejected proposals. | **Add it.** Reusing `draft` makes a rejected proposal indistinguishable from a live one in the HR queue; soft-deleting loses the disciplinary paper trail. One enum value is the cheapest correct answer. | Step 4 (migration) |
| O-4 | **No `scan_status` on `org_documents`.** | Mirror `employee_documents` / omit. | **Omit** (§3.4). If this is wrong it is cheap to add later; adding it now creates a permanently-`not_scanned` column and implies a capability that does not exist. | Step 4 |
| O-5 | **Manager proposal deletion.** | Manager may soft-delete their own draft / only HR may. | **Only HR** (R-74). A manager who could delete their own warning-letter draft could erase evidence of an aborted disciplinary action. | Step 9 |

O-3 and O-4 change the migration and so must be settled before Step 4. O-1, O-2 and O-5 can be settled later but before their step.

### 26.2 Phase-1 carry-over — found by reading source, **not** fixed by this plan

These were discovered while establishing the Phase-1 baseline. Each is recorded with a recommended disposition. **None is silently fixed**; fixing any of them is a separate, explicitly-approved change.

| # | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| D-1 | **Leaked transaction in `document_type.service.setActive`.** When the requested `is_active` equals the current value, the method does `return current` from inside the `try`, after `await db.sequelize.transaction()` and an advisory lock — without `commit()` or `rollback()`. The connection is returned to the pool with an open transaction holding `doctypes:{orgId}`. | `src/modules/document/services/document_type.service.js`, the `if (current.is_active === isActive) return current` line | A no-op activate/deactivate leaks a pooled connection and an advisory lock until the pool recycles it. Under repeated no-op calls this can exhaust the pool. **Real production risk, Phase-1 code.** | Fix as a standalone one-line change (`await t.commit()` before the return) with a regression test, **before or alongside** Phase 2 — not folded into a Phase-2 commit. |
| D-2 | **`requires_verification` is OR-ed with the org default in two places.** `resolveEffectivePolicy` computes it as `type.requires_verification || settings.document_default_verification_required`, and `confirmUpload` repeats the same OR. | `document_type_rules.utils.js` and `document_upload.service.js` | (i) Setting #67 is described as a *default* for new types, but behaves as a global floor that a type cannot opt out of. (ii) The duplicated expression is a divergence risk. | Confirm the intended semantics of #67 with the product owner. If "default", the OR belongs only at type-creation time. Either way, remove the duplicate so one place owns it. Not a Phase-2 change. |
| D-3 | **`reference_url` is in the employee-plane `LIST_ATTRIBUTES`.** The repository's own header comment and parent §12/§20 say list projections exclude it. | `employee_document.repository.js` | A reference-backed document's external URL is returned in list responses, where the spec says it should only appear via `view-url`. Low severity (the URL is an HR-supplied link, not a credential), but it contradicts the stated contract. | Decide whether the contract or the code is right. Phase 2 follows the **contract** for the org plane (§13.3), which means the two planes will differ until this is settled. |
| D-4 | **`_toDetail`'s `includeDeleted` branch re-requires the repository module mid-function.** | `document_upload.service.js` | Style only; no correctness impact. | Leave alone. Noted so it is not mistaken for a pattern worth copying. |
| D-5 | **Phase-1 documentation deliverables are missing.** `public/md_documents/` contains `implementation_plan.md`, `phases/phase1_implementation_plan.md`, `phases/phase1_api_analysis.md`, `phases/phase1_business_walkthrough.md` and `combined_api_analysis.md` — but **no** `phase1_completion_report.md`, **no** `DOCUMENTS_API_CONTRACT.md`, and **no** ops hand-back note for migration `00049`. `public/md_updates/` contains no documents entry at all, although Phase 1 shipped 42 new endpoints. | directory listing | The frontend has no dated change record for 42 endpoints, and there is no authoritative API contract document for the module (attendance has `ATTENDANCE_API_CONTRACT.md` and it is authoritative there). | Write the Phase-1 change record and start `DOCUMENTS_API_CONTRACT.md` as part of Phase 2's Step 11, covering **both** phases. This is the one carry-over Phase 2 should absorb, because Phase 2 needs the contract document to exist anyway. |

### 26.3 Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RK-1 | The 5,000-recipient publish is slower than the request timeout | medium | publish appears to fail while actually committing | `duration_ms` logged from day one; §24.6 measurement is a release gate; the operation is idempotent so a client retry after a timeout is safe (T-13) |
| RK-2 | HR misunderstands `included_users` as "additionally include" (P2-EC-6) | **high** | a policy silently reaches fewer people than intended | the publish response returns `resolved_count` and `scope`; the change record documents the semantics explicitly; the roster (#59) makes the actual audience inspectable before anyone relies on it |
| RK-3 | No notification on publish (Phase 4 gap) | certain | employees do not learn a mandatory policy exists until they visit the shelf | documented in the change record; HR is expected to announce out-of-band until Phase 4 |
| RK-4 | Moving `_assertContentTypeAndSize` changes employee-plane behaviour | low | Phase-1 regression | T-1 characterisation test written **before** the move (Step 2) |
| RK-5 | The advisory-lock key collides with an unrelated `hashtext` value | very low | spurious serialisation, never incorrectness | accepted; the namespace prefix `docorg:` makes collisions statistically negligible and the consequence is only a brief wait |
| RK-6 | The migration cannot be verified against a real database here | certain | a shape error is only found at operator run time | static review checklist in §28; `down()` symmetry; the operator runs it on a non-production environment first |

---

## 27. Documentation Deliverables

| Deliverable | Path | Content |
|---|---|---|
| Frontend change record (mandatory project rule) | `public/md_updates/<yyyy_mm_dd>_documents_phase2_org_documents.md` | all 30 endpoints with request/response schemas; the uniform-404 contract; `included_users` semantics (RK-2); fields the frontend must not expect; the "no notification in Phase 2" note (RK-3) |
| Phase-1 change record (carry-over D-5) | `public/md_updates/<yyyy_mm_dd>_documents_phase1_endpoints.md` | the 42 Phase-1 endpoints, written retroactively |
| API contract | `public/md_documents/DOCUMENTS_API_CONTRACT.md` | authoritative contract for **both** planes and both phases, in the style of `ATTENDANCE_API_CONTRACT.md`; supersedes the numbered analysis files |
| API registry | `public/md_system/api_registry.md` | three new sections: `Document Module - HR Org Documents (Phase 2)`, `- Manager Org Proposals (Phase 2)`, `- Employee Issued Documents (Phase 2)` |
| Completion report | `public/md_documents/phases/phase2_completion_report.md` | what shipped, test counts before/after, the §24.6 performance numbers, EC discharge table, open items handed back |
| Ops hand-back | `public/md_documents/phases/phase2_ops_handback.md` | migration `00050` run instructions, the `down()` path, the post-migration smoke checks in §28.3 |
| Org settings registry | `public/md_settings/org_settings_registry.md` | **no edit** — Phase 2 adds no settings; the confirmation is recorded in the completion report |

---

## 28. Production-Readiness Checklist

### 28.1 Correctness

- [ ] Every publish writes `targeting` (enforced by `org_documents_published_shape_check`)
- [ ] At most one `published` row per `(org_id, document_group_id)` (partial unique index + advisory lock)
- [ ] At most one `draft` row per group (service check under the lock)
- [ ] `version` is contiguous within a group and assigned only under the lock
- [ ] Recipient rows are never deleted and never regress in state
- [ ] `due_on` for sync-added recipients uses the sync date, not `published_at`
- [ ] The effective window is derived on read, never persisted into `status`
- [ ] Every targeting comparison uses `department_id`; `employee_profiles.department` is never read

### 28.2 Security

- [ ] All 30 routes carry `requireFeature('documents.access')`
- [ ] HR routes carry `authorize(['hr'])`; manager routes carry `authorize(['manager','hr'])`; self routes carry no `authorize()`
- [ ] `admin` / `super-admin` appear in no `authorize()` list in this module
- [ ] Every id-addressed denial is a byte-identical `404 DOCUMENT_NOT_FOUND` (T-27)
- [ ] `storage_key` appears in exactly three service call sites, all via `findByIdForStorage` (T-28)
- [ ] No `/me/hr-documents*` response exposes `targeting`, `recipient_count`, `proposed_by` or recipient identities (T-29)
- [ ] Audit rows contain no scrubbed key (T-30)
- [ ] Every repository `where` includes `org_id` (T-31)
- [ ] No log line contains a storage key, a file name or a recipient identity

### 28.3 Operability

- [ ] `duration_ms`, `resolved_count` and `chunk_count` are logged on every publish
- [ ] Zero-recipient publishes are logged at `warn`
- [ ] Proposer-scope overrides are logged at `warn` and audited with `scope_override: true`
- [ ] Migration `00050` reviewed statically: FK order, named indexes, `{ transaction }` on every statement, `down()` drops both tables and all four enum types
- [ ] Post-migration smoke (operator, non-production first): create a draft → confirm → publish to one department → assert the roster count matches an independent `SELECT COUNT(*)` over the same criteria → publish v2 → assert v1 is `superseded` with its recipients intact
- [ ] §24.6 performance numbers recorded in the completion report

### 28.4 Process

- [ ] `npm test` ends at ≥ `pass 1076` with the same 6 pre-existing failures and no new ones
- [ ] No file outside the document module, `models.index.js` and the migrations directory is modified
- [ ] Migration handed to the operator; **not** run from this environment
- [ ] Change record written before the PR is opened

---

## 29. Final Phase 2 Acceptance Criteria

Phase 2 is complete when **all** of the following are demonstrably true. The first five are the parent plan's own exit criteria, restated as verifiable assertions.

1. **Targeting is exact.** A policy published to "Engineering + Sales" produces recipient rows for precisely the active employees whose `employee_profiles.department_id` is Engineering or Sales, minus `excluded_users` — and for no one else. Verified by comparing `GET /hr/org-documents/:id/recipients` `total` against an independent `SELECT COUNT(*)` over the same criteria.
2. **Isolation is total and indistinguishable.** An employee in Finance requesting that document by id receives a `404` whose body is byte-identical to the body returned for a randomly generated uuid, and to the employee plane's `404`.
3. **Versioning preserves history.** Publishing v2 of a policy sets v1 to `superseded` in the same transaction, sets v2's `supersedes_id` and `version`, and leaves every one of v1's recipient rows untouched. `GET /hr/org-documents/:id/versions` shows both with their original `recipient_count`s.
4. **Retirement is non-destructive.** A retired document remains visible to its recipients in `/me/hr-documents` with `is_actionable: false`, and a new version can subsequently be published into the same group.
5. **An empty audience is not a failure.** Targeting a department with zero active employees publishes successfully with `recipient_count: 0` and `warnings: ['ZERO_RECIPIENTS']`.
6. **Publish is atomic and idempotent.** No interruption can leave a document `published` with a partial recipient set; a duplicate publish request produces no second recipient set and no second audit row.
7. **Manager Tier-B is maker-checker.** A manager can draft and attach a file to an org document addressed to exactly one direct report, and cannot publish, retire, replace, sync or delete it — regardless of `manager_direct_document_authority`.
8. **EC-19 holds.** A proposal whose subject has left the proposer's team is blocked at publish with `409 PROPOSER_SCOPE_CHANGED`, and HR's explicit override is recorded in the audit trail.
9. **EC-36 holds.** Deleting a targeted department after publish does not degrade the publish record: the frozen snapshot still names the department.
10. **The frozen snapshot is immutable.** No code path updates `targeting` after publish; `sync` resolves against it rather than against the live columns.
11. **Phase 1 is untouched.** All 42 Phase-1 endpoints behave identically; the 52 Phase-1 document tests still pass; `npm test` shows no new failures.
12. **Storage and DB cannot disagree destructively.** No published document exists without a verified object, and every drift scenario in §19.3 resolves in the "object without a live row" direction.
13. **Everything is auditable.** For any published document the audit table alone reconstructs who drafted it, who published it, what the targeting was, how many recipients it produced, and whether a scope override was used.
14. **Documentation is complete.** The change record, the API registry sections, the completion report (including the §24.6 performance numbers) and the ops hand-back exist, and migration `00050` has been handed to the operator.

---

*End of Documents Module — Phase 2 Implementation Plan.*
