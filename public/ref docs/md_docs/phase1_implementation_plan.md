# Documents Module — Phase 1 Implementation Plan

**Foundation: type catalog → org activation → employee document lifecycle**

> **Status:** Source of Truth for Documents Phase 1. Supersedes §9 "Phase 1" of
> [implementation_plan.md](../implementation_plan.md) wherever the two differ in detail; the parent
> remains authoritative for the module-wide decisions D-1…D-20 and the EC register.
> **Written:** 2026-09-22 · **Depends on:** parent plan as amended 2026-09-22 (D-3 catalog/activation,
> D-11 index correction, §6 uniform denial codes).
>
> **Rule inherited from Leave and Payroll: no phase begins until the previous one is tested and verified.**
> Phase 1 has no predecessor phase, but it does have Open Decisions that must be answered before
> Step 1 (§22).

---

## 1. Goal & Boundary

### 1.0 Goal

Stand the module up and make **one person's one document** correct and secure — issue → upload →
confirm → verify/reject → replace → delete → view — before anything is distributed, acknowledged,
signed, requested or reported.

Phase 1 is the phase in which the module's **security posture is fixed**: the object-key builder, the
content-type allow-list, the authority chokepoint, the uniform denial codes, the audit spine and the
transaction discipline are all created here. Phases 2–5 add surfaces on top of them and must not
re-decide them.

Phase 1 also answers the question the parent plan's D-3 amendment raised: **what documents does an org
actually accept?** The answer is a platform-curated catalog that HR activates from, plus org-defined
custom types. Nothing is auto-activated; a fresh org starts with an empty — and valid — type list.

### 1.1 Explicitly in scope

| # | Deliverable | Why it is Phase 1 |
|---|---|---|
| 1 | `document_type_catalog` (system-scoped) + seeder `009` | Without a type there is nothing to upload against. D-3. |
| 2 | `document_types` (per-org) — activate from catalog, create custom, edit, deactivate/reactivate | The org's acceptance policy. Every upload reads it. |
| 3 | `employee_documents` — the storage core and its full lifecycle | The module's spine. D-4. |
| 4 | `document_audit_logs` + repository, **wired from the first write** | Fixes the unwired `attendance_audit_logs` precedent. Retrofitting audit is how audit gaps happen. |
| 5 | `document_settings` org singleton (registry #58–#67) | Seven of the ten settings gate Phase-1 code paths. |
| 6 | Infrastructure: D-5 config generalisation, D-6 `deleteObject`, D-7 util promotion, per-call TTL | Shared-file touches; verified in isolation now, not alongside four new features later. |
| 7 | Three route audiences mounted per D-1 (`/hr`, `/manager`, bare + `/me`) | Mount order and path shape are cheap now, breaking later. |
| 8 | Five pure util modules + `tests/unit/document/` | The authority matrix must be DB-free testable from day one. |
| 9 | Seeder `008-seed-document-feature.js` (`documents.access` → all plans) | `requireFeature` on every route needs the feature row and plan mapping to exist. |

### 1.2 Explicitly NOT in scope — do not build these here

| Excluded | Deferred to | Why not now |
|---|---|---|
| `org_documents`, `org_document_recipients`, publish / targeting / retire | **Phase 2** | Targeting is a second authority model (audience-anchored, not subject-anchored). Mixing it in doubles the authority surface before the first one is proven. |
| "My HR Documents" read-side composer | **Phase 2** | Needs both planes to exist. |
| `document_acknowledgements`, `document_signature_requests` | **Phase 3** | Acknowledgment is evidence against a *published* document. |
| `document_requests` (HR/manager asks an employee for a document), nudges | **Phase 4** | Needs the notification outbox (D-16). |
| Expiry cron, reminder cron, abandoned-upload sweeper, retention purge | **Phase 4** | See §18 — Phase 1 ships the *read-side* expiry derivation so a missing cron is never a compliance false-negative, but registers **no cron**. |
| Malware scanning | **Phase 4** | D-8. Phase 1 is scan-**ready**: the column exists, the setting exists and is guard-railed OFF. |
| `document_templates`, metadata search, compliance reports, CSV export | **Phase 5** | |
| Leave `document_url` bridge | **Phase 5** | D-17, opt-in and non-breaking. |
| Onboarding / offboarding document packs, `employee_exits` archive trigger | **Phase 4/5** | D-18. |
| Evaluation of `mandatory_for` (who must hold which type) | column ships Phase 1, **read** in Phase 4 | The column is part of the catalog contract and cannot be added later without a second migration over a seeded table. Nothing in Phase 1 reads it. |
| Bulk operations of any kind (bulk upload, bulk verify, bulk export) | **Phase 5** | |
| `admin` / `super-admin` access of any kind | **never** | D-10. |

### 1.3 Honesty guard

Four things in this plan are **stated as gaps, not hidden**:

1. **`document_scan_required` is inert in Phase 1.** The column and the setting exist; no scanner does.
   Turning it ON would strand every document in `pending_verification` forever, so `PUT /settings`
   **rejects** enabling it (`409 SCAN_PROVIDER_NOT_CONFIGURED`). The setting is registered now because
   D-8 requires no migration to turn scanning on later.
2. **`mandatory_for`, `expiry_reminder_days`, `requires_acknowledgement`, `requires_signature` and
   `retention_days` are stored and validated in Phase 1 but read by nothing.** They are catalog
   contract columns. Each is marked *write-only-for-now* in §6.2.
3. **An object whose row never committed is not reclaimable by this application.** `issueUploadUrl`
   signs the PUT inside the creating transaction (payroll precedent); if that commit then fails, the
   client may still upload to a key with no row. Phase 1's mitigation is an **S3 lifecycle rule on the
   `documents/` prefix** (ops hand-back, §21) — not application code. This is the same residue payroll
   already carries, restated rather than rediscovered.
4. **Adding `deleteObject` (D-6) is not behaviour-neutral for payroll.** It activates
   `payroll_attachment_sweeper`, which has never deleted anything because it probes for the function.
   Real-world blast radius today is zero (no soft-deleted payroll attachment is 7 years old), but this
   must appear in the Phase 1 completion notes, not be discovered.

---

## 2. Pre-Flight Checks — do before writing any code

| # | Check | Command / location | Expected |
|---|---|---|---|
| 1 | Open Decisions 1, 2, 6 answered | §22 | shared `deleteObject` vs. document-only · util promotion yes/no · bucket-region residency |
| 2 | No name collision | `grep -ril "document_type\|employee_document" src/` | no hits |
| 3 | Migration counter | `ls src/infrastructure/postgres-sql/migrations \| tail -1` | `00048-…` → this phase writes **`00049`** |
| 4 | Seeder counter | `ls src/infrastructure/postgres-sql/seeders \| tail -1` | `007-…` → this phase writes **`008`** and **`009`** |
| 5 | `MODEL_ROOTS` shape | `src/infrastructure/postgres-sql/models.index.js` | ends with `modules/leave/models`, `modules/payroll/models` |
| 6 | Mount list | `src/app.js` lines 42–46 | five modules; documents becomes line 47 |
| 7 | Org-settings registry tail | `public/md_settings/org_settings_registry.md` | ends at **#57** → Documents start at **#58** |
| 8 | Payroll tests green **before** any shared-file edit | `npm test` | record the pass count; this is the "before" half of the D-5/D-7 regression gate |
| 9 | `.env` has `PAYROLL_S3_BUCKET` or `APP_S3_BUCKET` | `aws-s3.config.js` | if neither is set, storage endpoints must return `503`, observed — not crash |

---

## 3. Dependencies on Existing HRMS Components

Phase 1 **consumes** these. Except for the five files listed in §4, it modifies none of them.

| Component | Path | Used for | Contract Phase 1 relies on |
|---|---|---|---|
| `authenticate` | `src/common/middlewares/auth.middleware.js` | every route | frozen `req.user` whose org key is **`orgId`** (not `org_id`), plus `id`, `role` |
| `authorize([roles])` | same file | HR and manager planes | role strings `'hr'`, `'manager'`, `'employee'` |
| `requireFeature(key)` | `src/common/middlewares/require_feature.middleware.js` | every route | needs a `features` row **and** a `plan_features` mapping → seeder `008` |
| `HierarchyAccess.getAccessibleUserIds` | `src/common/utilities/hierarchy_access.utils.js` | manager scoping | `null` = global · `[]` = none · `[ids]` = active direct reports minus global-approver holders. Resolved **only** from `user_reporting_mappings`. |
| `validateOrThrow` | `src/common/utilities/validator.utils.js` | all validation | throws the shape the error middleware understands |
| `AppError` | `src/common/utilities/appError.utils.js` | all failures | `(status, message, errorCode, details?)` |
| `NotFoundError` / `ConflictError` | `src/common/errors/` | where the surrounding idiom already uses them | |
| `error.middleware.js` | `src/common/middlewares/` | response envelope | `{ success:false, message, errorCode }` |
| S3 provider | `src/infrastructure/aws-s3/aws-s3.provider.js` | presigned URLs | `StorageUnavailableError`, `getUploadUrl`, `getViewUrl`, `headObject` (3 s timeout, no retry, `null` on 404) |
| S3 config | `src/infrastructure/aws-s3/aws-s3.config.js` | bucket / KMS / TTL | **modified in Phase 1** per D-5 |
| `object_storage.utils` | created at `src/common/utilities/` | key building, allow-list, sanitisation | promoted from payroll per D-7 |
| `Organization`, `User`, `Role`, `UserRole` | auth / organization modules | FK targets + the HR-count guard rail | `organizations.id` CASCADE · `users.id` RESTRICT |
| `EmployeeProfile` / `ManagerProfile` / `HrProfile` | | subject-exists check | the three-way fallback idiom of `leave_assignment.service.js:112-114` |
| `sequelize` | `models.index.js` | transactions, advisory locks | unmanaged `sequelize.transaction()` |

**Explicitly NOT depended on in Phase 1:** `employee_exits` (D-18 → Phase 4/5), `organization_departments` /
`organization_locations` (Phase 2 targeting), the SES/email layer (Phase 4), node-cron (Phase 4), any
payroll service.

**Integration direction is one-way.** No existing module gains a dependency on `modules/document`.
The only outward-facing changes are the two infrastructure files and payroll's util re-export, all of
which are behaviour-preserving by construction and gated by the payroll regression run.

---

## 4. Directory Structure & Wiring

```
src/modules/document/
├── document.index.js
├── controllers/
│   ├── document_hr.controller.js
│   ├── document_manager.controller.js
│   └── document_self.controller.js
├── models/
│   ├── document_type_catalog.model.js
│   ├── document_types.model.js
│   ├── employee_documents.model.js
│   ├── document_audit_logs.model.js
│   └── document_settings.model.js
├── repositories/
│   ├── document_type_catalog.repository.js
│   ├── document_type.repository.js
│   ├── employee_document.repository.js
│   ├── document_audit_log.repository.js
│   └── document_settings.repository.js
├── routes/
│   ├── document_hr.routes.js
│   ├── document_manager.routes.js
│   └── document_self.routes.js
├── services/
│   ├── document_type.service.js
│   ├── document_upload.service.js
│   ├── document_read.service.js
│   ├── document_review.service.js
│   ├── document_settings.service.js
│   └── document_audit.service.js
├── utils/
│   ├── document_authority.utils.js
│   ├── document_type_rules.utils.js
│   ├── document_version.utils.js
│   ├── document_expiry.utils.js
│   ├── document_storage.utils.js
│   └── document_defaults.js
└── validators/
    ├── document_hr.validator.js
    ├── document_manager.validator.js
    └── document_self.validator.js
```

### 4.1 Shared-file edits — exactly five, each individually reversible

| File | Edit | Risk gate |
|---|---|---|
| `src/infrastructure/postgres-sql/models.index.js` | append `path.join(__dirname, '../../modules/document/models')` to `MODEL_ROOTS` | a model under an unregistered root **silently vanishes** — no error, just an undefined model at runtime |
| `src/app.js` | line 47: `require('./modules/document/document.index')(app)` | must come after `organization` so feature/plan rows resolve |
| `src/infrastructure/aws-s3/aws-s3.config.js` | D-5 fallback chain, per-module TTL exports, de-"Payroll" the warning string | payroll regression gate |
| `src/infrastructure/aws-s3/aws-s3.provider.js` | D-6 `deleteObject`; **additive optional** `ttlSeconds` on `getUploadUrl` / `getViewUrl` | payroll regression gate + D-6's documented payroll side effect |
| `src/modules/payroll/utils/attachment_storage.utils.js` | reduce to a one-line re-export of the promoted shared util | payroll regression gate + the **allow-list isolation test** |

### 4.2 `document.index.js`

```js
'use strict'
const hrRoutes      = require('./routes/document_hr.routes')
const managerRoutes = require('./routes/document_manager.routes')
const selfRoutes    = require('./routes/document_self.routes')

module.exports = (app) => {
  app.use('/api/v1/documents/hr', hrRoutes)
  app.use('/api/v1/documents/manager', managerRoutes)
  app.use('/api/v1/documents', selfRoutes)   // every self path lives under /me
}
```

Mirrors `payroll.index.js` exactly. Unlike payroll, this module has **no module-level assertion** at
require time (payroll calls `bankEncryption.assertKeyConfigured()`): an unset bucket must degrade to
`503` per request, not prevent the whole app from booting, because documents is a subscription-gated
feature that many orgs will not have enabled.

### 4.3 Route-ordering traps

Static segments must be declared before `:id` **within the same router**:

| Router | Must be declared first | Would otherwise be swallowed by |
|---|---|---|
| HR | `GET /documents/verification-queue` | `GET /documents/:id` |
| Manager | `GET /documents/recommendations` | `GET /documents/:id` |
| Self | `GET /me/documents/types` | `GET /me/documents/:id` |

### 4.4 Express 5 query gotcha

`req.query` is getter-only in Express 5. Every list endpoint validates its query **inside the
controller** via `validateOrThrow(schema, req.query)`, assigning the result to a local — never back
onto `req.query`. Route files carry `// query validated in controller`, matching
`payroll_manager.routes.js`.
---

## 5. Infrastructure Changes (D-5, D-6, D-7) — do these first, in isolation

These three touch files payroll depends on. They land as **Step 1**, with `npm test` green before and
after, so that if a payroll attachment test breaks, the cause is one of five lines — not one of forty
new files.

### 5.1 `aws-s3.config.js` — generalise (D-5)

```
bucket   = process.env.APP_S3_BUCKET        || process.env.PAYROLL_S3_BUCKET        || null
kmsKeyId = process.env.APP_S3_KMS_KEY_ID    || process.env.PAYROLL_S3_KMS_KEY_ID    || null
region   = process.env.AWS_REGION                                    // unchanged
```

Add, alongside the existing payroll TTL exports:

```
documentUploadTtlSeconds = Number(process.env.DOCUMENT_UPLOAD_TTL_SECONDS) || uploadTtlSeconds
documentViewTtlSeconds   = Number(process.env.DOCUMENT_VIEW_TTL_SECONDS)   || viewTtlSeconds
```

The startup warning string changes from `[Payroll S3] PAYROLL_S3_BUCKET is not set …` to
`[S3] No object-storage bucket configured (APP_S3_BUCKET / PAYROLL_S3_BUCKET) …`.
`isConfigured` semantics are unchanged.

**Behaviour contract:** a deployment that sets only `PAYROLL_S3_BUCKET` resolves every value exactly as
it does today. That is the assertion in the regression run, not a hope.

### 5.2 `aws-s3.provider.js` — two additive changes

**(a) `deleteObject(key)` (D-6).** Same `S3Client`, same `maxAttempts: 1`, same
`StorageUnavailableError` mapping. Deleting a non-existent key is a **success** in S3 and must remain a
success here — the caller (a future sweeper) must be able to retry safely.

**(b) Optional per-call `ttlSeconds` — a gap not recorded in the parent plan.** Today
`getUploadUrl` / `getViewUrl` read their TTL from module-load config and expose **no per-call
override**. The parent plan registers `document_view_url_ttl_seconds` and
`document_upload_url_ttl_seconds` as *org* settings, which is unimplementable against the current
signature. Fix, additively:

```js
async function getViewUrl({ key, contentType, contentDisposition, ttlSeconds })
// expiresIn = clampTtl(ttlSeconds) ?? config.viewTtlSeconds
```

Omitting `ttlSeconds` yields today's behaviour byte-for-byte, so payroll is untouched. `clampTtl`
rejects non-integers, values `< 30`, and values above the hard cap (view 900 s, upload 3600 s) —
the cap lives in the provider, so no caller and no org setting can exceed it (**D-20**).

### 5.3 Promote the storage utils (D-7)

Create `src/common/utilities/object_storage.utils.js` containing, verbatim from
`src/modules/payroll/utils/attachment_storage.utils.js`:
`isAllowedContentType` · `verifiedContentTypeMatches` · `buildObjectKey` · `isSafeReferenceUrl` ·
`sanitizeFileName` · `buildContentDisposition`, plus its security header comment.

Then reduce the payroll file to:

```js
module.exports = require('../../../common/utilities/object_storage.utils')
```

Three changes are made **in the shared file**:

1. **`ALLOWED_CONTENT_TYPES` gains three office types** — `application/msword`,
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
   `image/svg+xml`, `text/html`, `text/xml` **stay excluded forever** (script-capable → stored XSS on
   the bucket origin). The header comment's *"Do not widen this set"* is amended to
   *"Widening this set requires an amendment to D-7 and a passing allow-list isolation test"* — not deleted.
2. **`isAllowedContentType(type, allowed = ALLOWED_CONTENT_TYPES)`** gains an optional second
   parameter. Payroll passes its own frozen 4-type list explicitly, so **widening the shared constant
   cannot widen payroll**. This is a test requirement (§19), not a comment.
3. **`buildContentDisposition` forces `attachment`** for any content type that is not PDF or an image,
   regardless of what the caller asks. A `.docx` is never rendered inline.

**`buildObjectKey` gains an alternate call shape.** The parent plan's key is
`org/{orgId}/documents/{plane}/{subjectId}/{documentId}` — five segments. The existing signature
`{ orgId, ownerType, ownerId, attachmentId }` produces four and rejects `/` inside any id, so it
cannot express that key. Add an additive variant:

```js
buildObjectKey({ orgId, segments: ['documents', 'employee', userId, documentId] })
// → org/{orgId}/documents/employee/{userId}/{documentId}
```

Every segment is validated by the **same** rules as today (reject `/`, `\`, NUL, `..`, empty). The old
shape keeps working unchanged; `ownerType`/`ownerId`/`attachmentId` is internally just
`segments: [ownerType, ownerId, attachmentId]`. **`file_name` is still never read by the key builder.**

### 5.4 `document_storage.utils.js` — the module's thin wrapper

Not a re-implementation. It re-exports the shared functions and adds only module-local constants:

* `DOCUMENT_ALLOWED_CONTENT_TYPES` — the 7-type frozen set this module accepts (4 payroll types + 3 office).
* `buildDocumentKey({ orgId, plane, subjectId, documentId })` → the `segments` call above.
* `DOCUMENT_PLANE = Object.freeze({ EMPLOYEE: 'employee', ORG: 'org' })` — `'org'` is declared now so
  Phase 2 does not have to change the key shape of already-stored objects.

---

## 6. Database Schema — Migration `00049-create-document-module.js`

One migration, one `queryInterface.sequelize.transaction()`, tables created in FK dependency order,
`down()` dropping in reverse plus `DROP TYPE IF EXISTS enum_… CASCADE;`. This is the
`00030-create-leave-module.js` shape.

Creation order: `document_type_catalog` → `document_types` → `employee_documents` →
`document_audit_logs` → `document_settings`.

**Conventions applied to all five tables:** UUID PK with `defaultValue: Sequelize.UUIDV4`;
`created_at` / `updated_at` (`underscored: true`); `org_id` UUID NOT NULL FK → `organizations(id)`
`ON DELETE CASCADE` on the four tenant tables; `paranoid` (soft delete) on user-authored tables only.

### 6.1 `document_type_catalog` — platform master list (system-scoped)

**No `org_id`.** Precedented by `roles`, `features`, `subscription_plans`. Not paranoid — a retired
catalog entry is `is_active = false`, never removed, because `document_types.catalog_id` references it
for provenance forever.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `code` | STRING(64) NOT NULL **UNIQUE** | stable machine key, e.g. `aadhaar_card`, `pan_card`, `offer_letter`. Lowercase snake, `^[a-z][a-z0-9_]{2,63}$`. **The activation key** — never renamed. |
| `name` | STRING(150) NOT NULL | display label |
| `plane` | ENUM(`employee`,`org`) NOT NULL | D-2. Phase 1 uses only `employee` at runtime; `org` rows are seeded for Phase 2. |
| `group` | ENUM(`identity`,`education`,`employment_history`,`financial`,`medical`,`background_check`,`onboarding`,`policy`,`disciplinary`,`exit`) NOT NULL | delivers "smart categorization by document type" (§1.1 #2 of the parent) |
| `description` | TEXT NULL | shown in the activation picker |
| `country_code` | STRING(2) NULL | `IN` for Aadhaar/PAN/UAN; NULL = universal |
| `is_statutory` | BOOLEAN NOT NULL default false | **platform-curated, never org-settable** |
| `default_is_confidential` | BOOLEAN default false | |
| `default_employee_can_upload` | BOOLEAN default true | |
| `default_employee_can_view` | BOOLEAN default true | |
| `default_employee_can_delete` | BOOLEAN default false | |
| `default_manager_can_view` | BOOLEAN default false | |
| `default_manager_can_request` | BOOLEAN default false | |
| `default_requires_verification` | BOOLEAN default true | |
| `default_requires_acknowledgement` | BOOLEAN default false | *write-only in P1* |
| `default_requires_signature` | BOOLEAN default false | *write-only in P1* |
| `default_has_expiry` | BOOLEAN default false | |
| `default_expiry_reminder_days` | INTEGER[] default `{30,15,7}` | *write-only in P1* |
| `default_is_mandatory` | BOOLEAN default false | *write-only in P1* |
| `default_mandatory_for` | JSONB default `{}` | *write-only in P1* |
| `default_allows_multiple` | BOOLEAN default false | |
| `default_max_file_size_bytes` | INTEGER default 10485760 | |
| `default_allowed_content_types` | STRING[] default `{application/pdf,image/jpeg,image/png}` | |
| `default_retention_days` | INTEGER default 2555 | *write-only in P1* |
| `display_order` | INTEGER default 0 | |
| `is_active` | BOOLEAN default true | |

Indexes: `UNIQUE(code)` · `(plane, group, display_order)` · `(is_active)`.

### 6.2 `document_types` — the org's activated set

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL FK → organizations CASCADE | |
| `source` | ENUM(`catalog`,`custom`) NOT NULL | |
| `catalog_id` | UUID NULL FK → `document_type_catalog(id)` **ON DELETE RESTRICT** | **provenance only — never read at runtime** (D-3: activation copies, does not inherit) |
| `code` | STRING(64) NOT NULL | unique per org; for `source='catalog'` it equals the catalog code |
| `name` | STRING(150) NOT NULL | |
| `plane` | ENUM(`employee`,`org`) NOT NULL | immutable after create |
| `group` | ENUM(same 10) NOT NULL | editable |
| `description` | TEXT NULL | |
| `is_statutory` | BOOLEAN NOT NULL default false | copied from catalog; **rejected in every org write path** |
| `is_confidential` | BOOLEAN default false | |
| `employee_can_upload` | BOOLEAN default true | |
| `employee_can_view` | BOOLEAN default true | |
| `employee_can_delete` | BOOLEAN default false | |
| `manager_can_view` | BOOLEAN default false | |
| `manager_can_request` | BOOLEAN default false | |
| `requires_verification` | BOOLEAN default true | |
| `requires_acknowledgement` | BOOLEAN default false | *write-only in P1* |
| `requires_signature` | BOOLEAN default false | *write-only in P1* |
| `has_expiry` | BOOLEAN default false | |
| `expiry_reminder_days` | INTEGER[] default `{30,15,7}` | *write-only in P1* |
| `is_mandatory` | BOOLEAN default false | *write-only in P1* |
| `mandatory_for` | JSONB default `{}` | `{ employment_types:[], department_ids:[], job_statuses:[] }`. *write-only in P1*; **`department_ids`, never the free-text `department`.** |
| `allows_multiple` | BOOLEAN default false | |
| `max_file_size_bytes` | INTEGER default 10485760 | may only narrow the org ceiling |
| `allowed_content_types` | STRING[] NOT NULL | may only narrow the global set |
| `retention_days` | INTEGER default 2555 | *write-only in P1* |
| `display_order` | INTEGER default 0 | |
| `is_active` | BOOLEAN NOT NULL default true | soft deactivate, never delete |
| `created_by` | UUID NOT NULL FK → users RESTRICT | |
| `updated_by` | UUID NULL FK → users RESTRICT | |
| `deleted_at` | TIMESTAMPTZ NULL | paranoid; in practice unused — deactivation is the supported path |

Indexes:
* `UNIQUE (org_id, code) WHERE deleted_at IS NULL` — name `document_types_org_code_unique_idx`
* `(org_id, plane, is_active, display_order)` — the type picker's only scan
* `(org_id, catalog_id)` — "is this catalog entry activated?" without a code join

### 6.3 `employee_documents` — the storage core

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | generated **in the service** before the transaction — it is a component of the object key |
| `org_id` | UUID NOT NULL FK CASCADE | in every predicate, every index |
| `user_id` | UUID NOT NULL FK → users RESTRICT | **the subject; the scoping key for every read** |
| `document_type_id` | UUID NOT NULL FK → `document_types(id)` **RESTRICT** | a type with documents can never be hard-deleted |
| `document_group_id` | UUID NOT NULL | stable across versions; v1 sets it to its own `id` |
| `version` | INTEGER NOT NULL default 1 | |
| `supersedes_id` | UUID NULL FK → `employee_documents(id)` RESTRICT | |
| `allows_multiple` | BOOLEAN NOT NULL | **snapshotted from the type at row creation.** Required because a Postgres partial-index predicate can only reference its own table's columns (D-11 correction). Per EC-35, flipping the type flag applies to new uploads only. |
| `title` | STRING(200) NOT NULL | user-supplied label |
| `file_name` | STRING(255) NULL | `sanitizeFileName`'d; **never a path component** |
| `content_type` | STRING(100) NULL | declared at issue, re-verified at confirm |
| `size_bytes` | INTEGER NULL | declared at issue, re-verified at confirm |
| `checksum_sha256` | STRING(64) NULL | single-part ETag only; NULL if multipart |
| `storage_backend` | ENUM(`s3`,`reference`) NOT NULL default `s3` | |
| `storage_key` | TEXT NULL | **never returned, never logged, never audited** |
| `reference_url` | TEXT NULL | only when `storage_backend='reference'`; https-only |
| `status` | ENUM(`pending_upload`,`pending_verification`,`available`,`expired`,`superseded`,`rejected`,`quarantined`,`archived`,`deleted`) NOT NULL default `pending_upload` | |
| `scan_status` | ENUM(`not_scanned`,`pending`,`clean`,`infected`,`failed`) NOT NULL default `not_scanned` | D-8 hook; inert in P1 |
| `document_number` | STRING(100) NULL | Aadhaar/PAN/licence. **Never in a list projection**; detail returns only the masked form |
| `document_number_last4` | STRING(4) NULL | derived at write; what reads actually return (the `employee_bank_accounts` precedent) |
| `issued_on` | DATEONLY NULL | |
| `expires_on` | DATEONLY NULL | required when the type has `has_expiry` |
| `is_confidential` | BOOLEAN NOT NULL default false | per-document override; **tighten-only** (D-12) |
| `source` | ENUM(`self_upload`,`hr_upload`,`manager_upload`,`onboarding`,`migrated`) NOT NULL | |
| `uploaded_by` | UUID NOT NULL FK → users RESTRICT | the actor, which may differ from `user_id` |
| `confirmed_at` | TIMESTAMPTZ NULL | set when HeadObject proved the object landed |
| `recommendation` | ENUM(`none`,`verify`,`reject`) NOT NULL default `none` | Tier-B manager proposal (D-15) |
| `recommended_by` | UUID NULL FK → users RESTRICT | |
| `recommended_at` | TIMESTAMPTZ NULL | |
| `recommendation_note` | STRING(500) NULL | |
| `proposed_by` | UUID NULL FK → users RESTRICT | the D-15 quartet |
| `approved_by` | UUID NULL FK → users RESTRICT | the HR decider |
| `actioned_at` | TIMESTAMPTZ NULL | |
| `rejection_reason` | STRING(500) NULL | mandatory on reject |
| `deleted_at` | TIMESTAMPTZ NULL | paranoid |

**Indexes**

| Index | Definition | Purpose |
|---|---|---|
| `employee_documents_org_user_status_idx` | `(org_id, user_id, status)` | every self and per-subject read |
| `employee_documents_org_type_status_idx` | `(org_id, document_type_id, status)` | verification queue, type-filtered lists |
| `employee_documents_org_group_idx` | `(org_id, document_group_id)` | version history |
| `employee_documents_org_expiry_idx` | `(org_id, expires_on) WHERE status='available' AND expires_on IS NOT NULL` | the Phase-4 expiry cron's only scan; created now so the cron needs no migration |
| `employee_documents_live_version_unique_idx` | `UNIQUE (org_id, document_group_id) WHERE status IN ('pending_verification','available','expired') AND deleted_at IS NULL` | **one live version per logical document** |
| `employee_documents_single_instance_unique_idx` | `UNIQUE (org_id, user_id, document_type_id) WHERE allows_multiple = false AND status IN ('pending_verification','available','expired') AND deleted_at IS NULL` | **one live document per type per person** |

`pending_upload` is deliberately **outside both predicates**: a replacement is born `pending_upload`, so
the previous version stays current until the new object is verified, and an abandoned replace leaves
the existing document intact (D-11).

### 6.4 `document_audit_logs`

The `payroll_audit_logs` schema **verbatim**: `id`, `org_id`, `actor_id`, `target_user_id`,
`entity_type` (STRING), `entity_id` (UUID), `action` (STRING), `old_values` JSONB, `new_values` JSONB,
`reason` TEXT, `ip_address`, `request_id`, `proposed_by`, `approved_by`, `created_at`.
Append-only, **not paranoid**, no `updated_at`. Indexes: `(org_id, entity_type, entity_id, created_at)`
and `(org_id, actor_id, created_at)`.

`storage_key` and `document_number` are **never** written into `old_values`/`new_values` — the audit
service strips both keys before serialising (§13).

### 6.5 `document_settings` — org singleton

`id`, `org_id` UUID NOT NULL with a **`UNIQUE (org_id)`** index (the race backstop for
`findOrCreate`), `updated_by`, `created_at`, `updated_at`, plus the ten §20 columns. Not paranoid.

### 6.6 Migration hygiene

* All `addIndex` calls pass `{ transaction }` and an explicit `name` — an unnamed partial index is
  undroppable in a clean `down()`.
* Partial uniques are created with raw `queryInterface.sequelize.query(...)` where Sequelize's `where`
  option cannot express `status IN (...) AND deleted_at IS NULL` — the leave migration already mixes
  both styles.
* `down()` drops tables in reverse order and then
  `DROP TYPE IF EXISTS enum_employee_documents_status CASCADE;` (and its siblings) — Postgres leaves
  enum types behind, and a re-run of `up()` fails without this.
* **The migration is never run by this project's agents.** It is verified statically and by unit tests,
  then handed back to the user (§21).

---

## 7. Seeders

### 7.1 `008-seed-document-feature.js`

Mirrors `007-seed-leave-feature.js` exactly: insert one `features` row
(`key: 'documents.access'`, `name: 'Document Management'`, `module: 'document'`, `is_active: true`,
`id: Sequelize.literal('gen_random_uuid()')`), then query `features` and `subscription_plans` and map
the feature to **all** plans in `plan_features` with `enabled: true`. `down()` deletes `plan_features`
rows first, then the `features` row.

Without this, every document route returns the `requireFeature` denial and the module appears broken.

### 7.2 `009-seed-document-type-catalog.js`

Inserts the platform catalog. ~45 rows across the ten groups, `country_code = 'IN'` on the
India-specific ones. Representative set:

| group | codes |
|---|---|
| `identity` | `aadhaar_card`(IN, statutory, confidential) · `pan_card`(IN, statutory, confidential) · `passport`(expiry) · `driving_licence`(expiry) · `voter_id`(IN) · `photograph` |
| `education` | `tenth_marksheet` · `twelfth_marksheet` · `graduation_certificate` · `post_graduation_certificate` · `professional_certification`(multiple, expiry) |
| `employment_history` | `previous_offer_letter` · `relieving_letter`(multiple) · `experience_letter`(multiple) · `last_three_payslips`(multiple) · `form_16_previous_employer`(IN) |
| `financial` | `cancelled_cheque`(confidential) · `bank_passbook`(confidential) · `uan_document`(IN) · `pf_nomination_form`(IN, statutory) · `esic_document`(IN, statutory) · `investment_proof`(multiple) |
| `medical` | `medical_fitness_certificate`(expiry) · `vaccination_certificate` · `health_insurance_card`(expiry) · `disability_certificate`(confidential) |
| `background_check` | `police_verification`(confidential, expiry) · `background_verification_report`(confidential) · `reference_check_form` |
| `onboarding` | `signed_offer_acceptance` · `joining_report` · `emergency_contact_form` · `asset_acknowledgement`(multiple) |
| `policy` (`plane='org'`) | `employee_handbook`(ack) · `code_of_conduct`(ack) · `posh_policy`(IN, ack) · `it_security_policy`(ack) · `leave_policy` · `travel_policy` |
| `disciplinary` (`plane='org'`) | `warning_letter`(confidential, multiple) · `show_cause_notice`(confidential) · `performance_improvement_plan`(confidential) |
| `exit` | `resignation_letter` · `exit_interview_form` · `relieving_letter_issued`(`plane='org'`) · `experience_letter_issued`(`plane='org'`) · `full_and_final_statement`(`plane='org'`, confidential) |

**Binding rule:** future catalog additions ship as a **new numbered seeder**, never as an edit to `009`.
An already-executed seeder does not re-run, so editing it changes nothing on existing installs and
silently diverges new ones. Each new seeder uses `INSERT … ON CONFLICT (code) DO NOTHING` so it is
re-runnable.

`down()` deletes only the codes this seeder inserted, and only where no `document_types.catalog_id`
references them — otherwise the RESTRICT FK correctly refuses, which is the intended protection.
---

## 8. Core Logic — the pure modules

Every one is **DB-free** and unit-tested without a database. Nothing in `utils/` imports
`models.index`. This is the payroll convention and it is what makes the authority matrix testable.

### 8.1 `document_authority.utils.js` — the chokepoint

Mirrors `attachment_authority.utils.js` in shape, not in denial codes (§13).

```js
screenDocument({ audience, status, scanStatus, effectiveConfidential })
  → { deny: { status, errorCode } } | { needsSubject: true }
```
Runs **before** the subject is loaded, so the response is identical whether or not the id exists:
* `status` not in the audience's visible set → deny.
* `audience === 'manager'` and `effectiveConfidential` → deny. **Before** the subject load (D-12).
* `scanStatus === 'infected'` → deny for every audience including HR (HR reaches it only through the
  quarantine surface, which is Phase 4).

```js
resolveDocumentAuthority({ audience, action, subjectUserId, actorUserId,
                           accessibleUserIds, typeFlags, settingsFlags })
  → { allowed: true } | { deny: { status, errorCode } }
```

Visible-status sets, by audience:

| Audience | May see |
|---|---|
| `self` | every status of their own rows except `deleted` — including `pending_upload` (their own "in progress" view) |
| `manager` | `available`, `expired`, and `pending_verification` **only** when `manager_can_view` is on (so a recommendation is actionable) |
| `hr` | everything except `deleted`; `deleted` only via the audit trail |

Hard rules encoded here, not in controllers:
* **`accessibleUserIds === null` is not sufficient for global scope.** Documents additionally assert
  `role === 'hr'`, because the shared util returns `null` for `admin`/`super-admin` too and Attendance
  and Leave depend on that shape. **Do not narrow `GLOBAL_APPROVER_ROLES`** (D-10).
* `accessibleUserIds === []` → the manager manages nobody → deny every scoped action.
* Manager read requires `typeFlags.manager_can_view && settingsFlags.manager_can_view_team_documents`.
* Manager on-behalf upload requires `typeFlags.manager_can_request`.

### 8.2 `document_type_rules.utils.js` — effective policy

`resolveEffectivePolicy(type, settings)` → the single object every write path consults:

| Field | Rule |
|---|---|
| `maxFileSizeBytes` | `min(type.max_file_size_bytes, settings.document_max_file_size_bytes)` — a type may only **narrow** |
| `allowedContentTypes` | `intersection(DOCUMENT_ALLOWED_CONTENT_TYPES, type.allowed_content_types)`. **Empty → `422 DOCUMENT_TYPE_NO_USABLE_CONTENT_TYPE`**, not a silent open door |
| `isConfidential` | `type.is_confidential` — the floor |
| `managerCanView` | `type.manager_can_view && settings.manager_can_view_team_documents` |
| `requiresVerification` | `type.requires_verification` |
| `employeeCanDelete` | `type.employee_can_delete && settings.employee_can_delete_verified_documents && !type.is_statutory` |

Also here:
* `resolveEffectiveConfidential(type, doc)` → `type.is_confidential || doc.is_confidential` (D-12,
  tighten-only). A write attempting `is_confidential: false` on a confidential type is **ignored, not
  rejected** — rejecting leaks the type's confidentiality to a caller who may not be allowed to know it.
* `assertTypeCodeAvailable(code, catalogCodes, orgCodes)` → a custom type may not take a code the
  catalog owns (`409 DOCUMENT_TYPE_CODE_RESERVED`), or the org would be unable to activate that
  catalog entry later.
* `IMMUTABLE_TYPE_FIELDS = ['code','plane','source','catalog_id','is_statutory']`.

### 8.3 `document_version.utils.js`

* `nextVersion(predecessor)` → `{ document_group_id, version, supersedes_id }`.
* `isReplaceable(status)` → `status === 'available' || status === 'expired'`.
  `pending_verification` is **not** replaceable — the correct action is delete-and-re-upload, which
  keeps the invariant "one live version" free of an in-flight second candidate.
* `isStaleUpload(row, uploadTtlSeconds, now)` → `status === 'pending_upload' && row.created_at < now - ttl`.
  This is what lets a second attempt reap an abandoned first one instead of being blocked by it, with
  no cron.

### 8.4 `document_expiry.utils.js`

* `isExpired(expiresOn, today)` — date-only comparison in **`Asia/Kolkata`**, matching every other
  cron and period boundary in the product.
* `resolveDisplayStatus(row, today)` → `'expired'` when `row.status === 'available' && isExpired(...)`,
  else `row.status`. **Every read applies this**, so a missed Phase-4 cron run is never a compliance
  false-negative (EC-17). The persisted value is corrected by the cron; the read is correct meanwhile.
* `requiresExpiryDate(type)` → `type.has_expiry`.

### 8.5 `document_storage.utils.js` and `document_defaults.js`

§5.4 covers the former. `document_defaults.js` holds the settings defaults object consumed by
`findOrCreate`, the frozen status/enum sets, and `maskDocumentNumber(value)` → last 4 characters,
`null`-safe, never throwing on short input.

---

## 9. Layer Responsibilities

The rule: **controllers do not make decisions, repositories do not make decisions, services make all
of them, utils make the pure ones.** Any authority check found in a controller or a repository is a
defect, not a shortcut.

### 9.1 Controllers

* Read `req.user` (`orgId`, `id`, `role`) and path params. Validate query via `validateOrThrow` (§4.4).
* Resolve the **audience** from which router they belong to — never from a request field.
* For manager routes: call `getAccessibleUserIds` and pass the result down. The controller does not
  interpret it.
* Call exactly one service method, shape the `{ success, message, data }` envelope, and pass errors to
  `next`.
* **Never** touch `models.index`, never build a where-clause, never decide a status code beyond the
  happy path.

### 9.2 Services

| Service | Owns |
|---|---|
| `document_type.service.js` | catalog browse with activation state; activate (idempotent, bulk); custom create; update with the immutable-field guard; deactivate/reactivate |
| `document_upload.service.js` | `issueUploadUrl`, `confirmUpload`, `issueReplaceUrl`, `linkReference`, `deleteDocument` |
| `document_read.service.js` | list/detail/view-url across all three audiences; masking; `resolveDisplayStatus`; the verification queue |
| `document_review.service.js` | `verify`, `reject`, `recommend` — the maker–checker surface |
| `document_settings.service.js` | `findOrCreate` defaults, caps, the three guard rails |
| `document_audit.service.js` | `record(entry, transaction)` with a **mandatory** transaction argument (payroll precedent), plus `recordDetached(entry)` for read-observing events that have no enclosing write |

Services own: authority resolution, transaction boundaries, advisory locks, idempotency, S3 calls,
audit writes, and the mapping of Sequelize errors to `AppError`.

### 9.3 Repositories

Data access only. Every method takes `orgId` as its **first** parameter and puts it in the `where` —
there is no repository method that can read across orgs. Every method accepts
`{ transaction, lock }`.

**Projection allow-lists are a repository responsibility.** Two frozen attribute arrays:

```js
LIST_ATTRIBUTES   // excludes storage_key, document_number, reference_url
DETAIL_ATTRIBUTES // excludes storage_key, document_number; includes document_number_last4
```

`storage_key` is readable **only** through `findByIdForStorage(orgId, id, opts)`, which exists solely
to feed the S3 provider and is called by exactly two services. That single choke point is what makes
"grep the responses for `storage_key`" a meaningful test (§19).

### 9.4 Models

Declarations plus `associate`. No hooks, no defaultScope that hides rows (a hidden `deleted_at` scope
plus `paranoid` is how a soft-deleted row becomes invisible to the very audit query meant to find it —
`paranoid: true` alone is sufficient and is what the rest of the project uses).

---

## 10. API Surface — 42 endpoints

Middleware stacks, matching `payroll_*.routes.js`:

```js
const hrAuth      = [authenticate, authorize(['hr']),               requireFeature('documents.access')]
const managerAuth = [authenticate, authorize(['manager','hr']),     requireFeature('documents.access')]
const selfAuth    = [authenticate,                                  requireFeature('documents.access')]
```

`selfAuth` has **no `authorize()`** — any authenticated org member acts on their own documents (D-1).
`admin` / `super-admin` appear in no list (D-10); because `authorize` is role-exact, they receive `403`
from the middleware and never reach a service.

### 10.1 HR — `/api/v1/documents/hr`

| # | Method | Path | Purpose |
|---:|---|---|---|
| 1 | GET | `/catalog` | browse the platform catalog. Filters `plane`, `group`, `country_code`, `q`, `activated`. Each row carries `is_activated` and `org_type_id`. |
| 2 | GET | `/catalog/:code` | one catalog entry with its `default_*` values, for the activation preview |
| 3 | POST | `/types/activate` | **idempotent bulk activation**: `{ codes: string[] }` → `{ activated, reactivated, already_active }` |
| 4 | POST | `/types` | create a custom type |
| 5 | GET | `/types` | the org's types. Filters `plane`, `group`, `source`, `is_active`. **An empty list is a valid 200**, never a 404. |
| 6 | GET | `/types/:id` | detail |
| 7 | PUT | `/types/:id` | edit policy fields; immutable fields rejected |
| 8 | PATCH | `/types/:id/deactivate` | soft deactivate |
| 9 | PATCH | `/types/:id/activate` | reactivate **without resetting the org's edits** |
| 10 | POST | `/employees/:userId/documents` | issue an upload URL on behalf of a subject (`source='hr_upload'`) |
| 11 | POST | `/documents/:id/confirm` | confirm |
| 12 | POST | `/employees/:userId/documents/link-reference` | register an externally-hosted document (`storage_backend='reference'`, born `available`) |
| 13 | GET | `/employees/:userId/documents` | a subject's documents. Filters `type_id`, `status`, `group`, `expiring_before`, pagination. |
| 14 | GET | `/documents/verification-queue` | org-wide `pending_verification`, oldest first, with the manager recommendation surfaced. **Declared before `/documents/:id`.** |
| 15 | GET | `/documents/:id` | detail (masked `document_number`) |
| 16 | GET | `/documents/:id/versions` | the version chain for the document's group |
| 17 | GET | `/documents/:id/view-url` | short-lived signed GET |
| 18 | POST | `/documents/:id/verify` | approve |
| 19 | POST | `/documents/:id/reject` | reject with a mandatory reason |
| 20 | POST | `/documents/:id/replace` | issue a replacement upload URL (v+1) |
| 21 | DELETE | `/documents/:id` | soft delete (any status) |
| 22 | GET | `/documents/:id/audit-logs` | this document's audit trail |
| 23 | GET | `/settings` | org settings (`findOrCreate`) |
| 24 | PUT | `/settings` | update, with the §20 guard rails |

### 10.2 Manager — `/api/v1/documents/manager`

Every endpoint calls `getAccessibleUserIds` and rejects out-of-scope ids **before any existence
lookup**. No manager endpoint deletes, verifies, rejects or replaces.

| # | Method | Path | Purpose |
|---:|---|---|---|
| 25 | GET | `/types` | types the caller may act on: `manager_can_view` for read, `manager_can_request` for upload. Empty when `manager_can_view_team_documents` is OFF. |
| 26 | GET | `/team/documents` | all direct reports' visible documents; filters as #13 plus `user_id` |
| 27 | GET | `/employees/:userId/documents` | one report's visible documents |
| 28 | GET | `/documents/recommendations` | the caller's own open recommendations. **Declared before `/documents/:id`.** |
| 29 | GET | `/documents/:id` | detail |
| 30 | GET | `/documents/:id/view-url` | signed GET |
| 31 | POST | `/employees/:userId/documents` | on-behalf upload in a `manager_can_request` type (`source='manager_upload'`) |
| 32 | POST | `/documents/:id/confirm` | confirm the upload the caller issued |
| 33 | POST | `/documents/:id/recommend` | Tier-B: `{ recommendation: 'verify' \| 'reject', note }` |

### 10.3 Self — `/api/v1/documents` (all under `/me`)

| # | Method | Path | Purpose |
|---:|---|---|---|
| 34 | GET | `/me/documents/types` | types the caller may upload (`employee_can_upload`, active, `plane='employee'`), each with its effective size/content-type policy so the client validates before choosing a file. **Declared before `/me/documents/:id`.** |
| 35 | GET | `/me/documents` | own documents including `pending_upload` |
| 36 | POST | `/me/documents` | issue an upload URL (`source='self_upload'`) |
| 37 | POST | `/me/documents/:id/confirm` | confirm |
| 38 | GET | `/me/documents/:id` | detail |
| 39 | GET | `/me/documents/:id/versions` | own version chain |
| 40 | GET | `/me/documents/:id/view-url` | signed GET |
| 41 | POST | `/me/documents/:id/replace` | replace (v+1) |
| 42 | DELETE | `/me/documents/:id` | delete, subject to §11.4 |

### 10.4 Request / response contracts for the three that carry real weight

**#36 / #31 / #10 — issue upload URL**

```
POST body:
  document_type_id : uuid, required
  title            : string(3..200), required
  file_name        : string(1..255), required
  content_type     : string, required — must be in the effective allow-list
  size_bytes       : integer, 1 .. effective max, required
  issued_on        : date, optional
  expires_on       : date, optional — REQUIRED when type.has_expiry
  document_number  : string(1..100), optional
  is_confidential  : boolean, optional, tighten-only

200 data:
  document_id, upload_url, expires_at,
  required_headers: { "Content-Type": <declared>, "Content-Length": <declared> }
```

The response **never** contains `storage_key`. The client PUTs the bytes with exactly those headers.

**#37 / #32 / #11 — confirm**

No body. Returns the document detail. Calling it twice returns the same detail (§16).

**#40 / #30 / #17 — view-url**

```
query: disposition = inline | attachment   (default: inline for pdf/image, forced attachment otherwise)
200 data: { view_url, expires_at, file_name, content_type }
```

The signed GET pins `ResponseContentType` and `ResponseContentDisposition` server-side, so the browser
cannot be talked into rendering a `.docx` inline or into treating a PDF as HTML.

### 10.5 Frontend change record

Documents is a new module: there is no existing endpoint whose request or response changes. The
CLAUDE.md `md_updates` rule therefore triggers on exactly one thing — **nothing in Phase 1 alters an
existing API**. The infrastructure edits (§5) are behaviour-preserving by construction and by test.
If the payroll regression run reveals any observable difference, that difference **is** an existing-API
change and requires a dated record in `public/md_updates/` before the phase can close.
---

## 11. Business Rules & Validations

### 11.1 Type catalog & activation

| # | Rule | Enforcement |
|---:|---|---|
| R-1 | Activation **copies** `default_*` into the org row; `catalog_id` is provenance only and is never read at runtime | `document_type.service.activate` |
| R-2 | Activation is **idempotent**. Already-active → untouched, reported as `already_active`. Deactivated → `is_active = true` and **no other column changed**, reported as `reactivated` | service + `UNIQUE (org_id, code)` backstop |
| R-3 | A batch that names a non-existent or platform-inactive code fails **whole** (`404 CATALOG_ENTRY_NOT_FOUND` / `409 CATALOG_ENTRY_INACTIVE`) — one transaction, all-or-nothing | service |
| R-4 | A custom type may not use a code the catalog owns → `409 DOCUMENT_TYPE_CODE_RESERVED` | `assertTypeCodeAvailable` |
| R-5 | `code`, `plane`, `source`, `catalog_id`, `is_statutory` are immutable after create → `409 DOCUMENT_TYPE_FIELD_IMMUTABLE` listing the offending fields in `details` | service, from `IMMUTABLE_TYPE_FIELDS` |
| R-6 | Custom types are always `is_statutory = false`; the field is stripped from the payload, not rejected | service |
| R-7 | `allowed_content_types` must be a non-empty subset of the module's 7-type set → `422 DOCUMENT_TYPE_NO_USABLE_CONTENT_TYPE` | Joi + `resolveEffectivePolicy` |
| R-8 | `max_file_size_bytes` may only narrow the org ceiling; a larger value is **clamped**, and the clamp is reported in the response | `resolveEffectivePolicy` |
| R-9 | A type is deactivated, never deleted. Deactivation does **not** touch existing documents | service |
| R-10 | An inactive type cannot receive a new upload (`409 DOCUMENT_TYPE_INACTIVE`) but its existing documents stay fully readable and verifiable | upload service / read service |
| R-11 | A fresh org has **zero** types. Every list endpoint renders an empty list as a `200`, never a `404` and never an implicit seed | read service |
| R-12 | `plane` must be `employee` for every Phase-1 document operation → `422 DOCUMENT_TYPE_PLANE_MISMATCH` | upload service |

### 11.2 Upload

| # | Rule |
|---:|---|
| R-13 | `content_type` must be in `intersection(module set, type.allowed_content_types)` — checked at Joi, pinned into the signed PUT, and re-checked against HeadObject. **Three points, each alone defeatable.** |
| R-14 | `size_bytes` must be `1 .. min(type, settings)` — same three points. |
| R-15 | `expires_on` is **required** when `type.has_expiry`, and must be `> issued_on` when both are present. |
| R-16 | `expires_on` in the past is **accepted** (backfilling an already-lapsed certificate is legitimate) and the document lands `expired`, not `available`. |
| R-17 | `file_name` is `sanitizeFileName`'d and is **never** a path component. |
| R-18 | `is_confidential` may only tighten (D-12). A `false` against a confidential type is ignored silently. |
| R-19 | Single-instance types (`allows_multiple = false`): a second upload while one is live → `409 DOCUMENT_ALREADY_EXISTS` naming the existing document's id, with the guidance that the action is *replace*. |
| R-20 | Self-plane upload requires `type.employee_can_upload`; manager on-behalf requires `type.manager_can_request`; HR requires neither. |
| R-21 | `link-reference` (HR only): `isSafeReferenceUrl` — **https only**, ≤ 1000 chars, no control characters. Born `available` with `storage_key = NULL`. `422 INVALID_REFERENCE_URL` otherwise. |

### 11.3 Verification

| # | Rule |
|---:|---|
| R-22 | Only `pending_verification` may be verified or rejected → `409 DOCUMENT_NOT_PENDING_VERIFICATION`. |
| R-23 | Reject requires a `reason` of 10..500 characters. An empty rejection is not an audit record. |
| R-24 | With `document_require_separate_checker` ON, `approved_by` must differ from `proposed_by` → `409 SELF_APPROVAL_NOT_ALLOWED`. |
| R-25 | On verify, if `expires_on < today` the resulting status is `expired`, not `available` (EC-25). Verification is about authenticity, not currency. |
| R-26 | A stale manager recommendation (the recommender no longer manages the subject, EC-19) blocks the decision with `409 RECOMMENDATION_SCOPE_STALE` unless the HR caller passes `acknowledge_stale_recommendation: true`, which is audited as `document.stale_recommendation_overridden`. |
| R-27 | Verifying clears `recommendation` back to `none` and stamps `approved_by` / `actioned_at`. |

### 11.4 Deletion

| # | Rule |
|---:|---|
| R-28 | Delete is always **soft** (`status='deleted'` + `deleted_at`). The object survives for the Phase-4 retention sweeper, so an accidental delete is recoverable by HR through the audit trail. |
| R-29 | The subject may delete while `pending_upload` or `pending_verification` — always. |
| R-30 | The subject may delete an `available` document only when `type.employee_can_delete && settings.employee_can_delete_verified_documents && !type.is_statutory`. Otherwise `409 DOCUMENT_NOT_DELETABLE`. |
| R-31 | A **statutory** type is never subject-deletable once verified, whatever the settings say. |
| R-32 | A manager can never delete. There is no manager delete route, and `resolveDocumentAuthority` denies the action even if one were added. |
| R-33 | HR may delete any status. Deleting a `superseded` version is allowed and does not disturb the live one. |
| R-34 | Deleting the live version of a group frees both partial unique indexes, so a fresh upload of that type becomes possible again. This is intended. |
| R-35 | Delete is idempotent: an already-`deleted` row returns `200` with the same body, no second audit row. |

### 11.5 Cross-cutting data rules

* **`document_number` is written once and masked on every read.** `document_number_last4` is derived
  at write. The full value is never in a list projection, never in an audit `new_values`, never in a
  log line. It exists for Phase-4 duplicate detection.
* **`storage_key` leaves the database exactly twice** — into `getUploadUrl` and into `getViewUrl`.
* **`allows_multiple` is snapshotted** at row creation and never updated afterwards, even if the type
  changes (EC-35). The partial index depends on it, so mutating it on existing rows could
  retroactively violate a unique constraint.
* **Dates are `Asia/Kolkata` date-only**, consistent with every other module boundary.

---

## 12. Authorization & Security

### 12.1 The order that matters

Every scoped handler follows exactly this order. Reversing steps 2 and 3 is an IDOR.

```
1. authenticate         → frozen req.user (orgId, id, role)
2. authorize / scope    → role gate, then getAccessibleUserIds for the manager plane
3. screenDocument       → status + confidentiality, BEFORE the subject is loaded
4. existence lookup     → always org-scoped: WHERE org_id = :orgId AND id = :id
5. resolveDocumentAuthority
6. act
```

### 12.2 Uniform denial codes (parent §6, amended 2026-09-22)

The denial code is fixed **per addressing mode**, not per reason — otherwise the code itself is the
oracle.

| Endpoint shape | Every denial returns | Covers |
|---|---|---|
| `…/manager/documents/:id` | `404 DOCUMENT_NOT_FOUND` | non-existent · cross-org · out-of-scope subject · confidential · non-visible status |
| `…/manager/employees/:userId/…` | `403 FORBIDDEN` | non-existent user · cross-org user · not a direct report |
| `…/me/documents/:id` | `404 DOCUMENT_NOT_FOUND` | non-existent · cross-org · not the caller's |
| `…/hr/documents/:id` | `404 DOCUMENT_NOT_FOUND` | non-existent · cross-org |

The message string must be identical too — `"Document not found"` — with no `details`. A differing
message is the same oracle with extra steps. **This is stricter than payroll's
`attachment_authority.utils`, deliberately (documents carry Aadhaar/PAN-grade PII), and must not be
"harmonized" back.**

### 12.3 Tenancy

`org_id` is in every `where`, every index and every FK. No repository method omits it. A cross-org id
is indistinguishable from a non-existent one because the org predicate runs in the same query as the
id predicate — not as a second check on a loaded row.

### 12.4 Storage-layer security

| Control | Where |
|---|---|
| Object key from server-owned ids only; `file_name` never a path component | `buildObjectKey` — rejects `/`, `\`, NUL, `..` per segment |
| Content-type allow-list as an XSS control; SVG/HTML/XML excluded forever | `object_storage.utils` header comment + test |
| Office types forced to `attachment` disposition | `buildContentDisposition` |
| Signed GET pins `ResponseContentType` + `ResponseContentDisposition` server-side | `getViewUrl` |
| TTL hard caps (view 900 s, upload 3600 s) enforced in the **provider**, below any org setting | `clampTtl` (D-20) |
| `storage_key` never returned/logged/audited | repository projection allow-lists + the audit scrubber |
| Storage is never the authorization source | authority is resolved from the DB **before** any S3 call (D-20) |

### 12.5 Audit

Every state change writes a `document_audit_logs` row **inside the same transaction as the change**.
A committed change with no audit row is impossible by construction, which is the whole point of the
mandatory-transaction argument on `record()`.

Actions written in Phase 1:

```
document_type.activated        document_type.reactivated      document_type.created
document_type.updated          document_type.deactivated
document.upload_issued         document.confirmed             document.verification_failed
document.replace_issued        document.upload_abandoned      document.reference_linked
document.verified              document.rejected              document.recommended
document.stale_recommendation_overridden
document.deleted               document.viewed
document_settings.updated
```

* `document.viewed` (every signed-URL issuance) is a **read-observing** event with no enclosing write.
  It uses `recordDetached`, which opens its own short transaction — payroll's `_recordAudit` pattern.
  If that audit write fails, the view-url call still succeeds and the failure is logged; an audit
  failure must not deny a legitimate read.
* `old_values` / `new_values` are passed through a scrubber that deletes `storage_key`,
  `document_number` and `reference_url` before serialising.
* `ip_address` and `request_id` come from the request context on every actor-initiated action.

---

## 13. Workflows & State Transitions

### 13.1 Employee document state machine

```
                 issue upload URL
        (nothing) ───────────────▶ pending_upload
                                        │
             ┌──────────────────────────┼───────────────────────────┐
             │ confirm: HeadObject OK   │ delete (subject or HR)    │ stale > upload TTL
             │ type.requires_verification│                          │ (reaped by the next
             ▼                          ▼                           │  issue/replace attempt,
   pending_verification              deleted                        │  or the Phase-4 sweeper)
             │                                                      ▼
   ┌─────────┼─────────┐                                        deleted
   │ verify  │ reject  │
   ▼         ▼         │
available  rejected    │      confirm when requires_verification = false
   │                   └──────────────────────────────────────▶ available
   │
   ├── expires_on passes (cron, or derived on read) ──▶ expired
   ├── replacement confirmed ─────────────────────────▶ superseded
   ├── scan finds malware (Phase 4) ──────────────────▶ quarantined
   ├── subject exits + HR archives (Phase 5) ─────────▶ archived
   └── HR deletes ────────────────────────────────────▶ deleted
```

**Legal transitions — anything else is `409`:**

| From | To | Actor |
|---|---|---|
| `pending_upload` | `pending_verification` \| `available` \| `expired` | confirm (any plane that owns the row) |
| `pending_upload` | `deleted` | subject or HR |
| `pending_verification` | `available` \| `expired` | HR verify (or manager when `manager_direct_document_authority` is ON) |
| `pending_verification` | `rejected` | HR reject (same) |
| `pending_verification` | `deleted` | subject or HR |
| `available` \| `expired` | `superseded` | the confirm of a successor version, **never a direct call** |
| `available` | `expired` | derived on read; persisted by the Phase-4 cron |
| `available` \| `expired` \| `rejected` \| `superseded` | `deleted` | HR |
| `rejected` | — | terminal for this row; the subject uploads a new document, not a replacement |
| `quarantined` | — | terminal (Phase 4) |

**No transition may be requested directly by a client.** There is no `PATCH /documents/:id/status`.
Status is a consequence of a named business action, which is what makes the audit trail readable.

### 13.2 Upload → confirm workflow (the common path)

```
1. POST …/documents
   ├─ Joi: type, title, file_name, content_type, size_bytes, dates
   ├─ authority: self | manager(scope) | hr
   ├─ load type (org-scoped) → active? plane='employee'?
   ├─ effective policy = min(type, settings)
   ├─ [advisory lock when allows_multiple = false]
   ├─ single-instance guard (reaping any stale pending_upload)
   ├─ INSERT status=pending_upload, allows_multiple snapshotted
   ├─ sign PUT (503 → rollback, no row)
   ├─ audit document.upload_issued
   └─ COMMIT → { document_id, upload_url, expires_at, required_headers }

2. PUT <upload_url>           (client → S3 directly; the binary never enters Node)

3. POST …/documents/:id/confirm
   ├─ load + authority
   ├─ already pending_verification/available/expired → return it, no S3 call   [idempotent]
   ├─ HeadObject                                     [OUTSIDE any transaction, 3 s, no retry]
   │    null            → 422 DOCUMENT_OBJECT_NOT_FOUND, row stays pending_upload (retryable)
   │    unavailable     → 503, no state change
   │    size/type differ→ audit document.verification_failed; 422; row stays pending_upload
   ├─ checksum = single-part ETag or null
   └─ TRANSACTION
        ├─ advisory lock on the document group
        ├─ re-read FOR UPDATE, re-check status
        ├─ if version > 1: supersede the predecessor  ← must precede the promotion
        ├─ status = requires_verification ? pending_verification
        │                                 : (expired? expired : available)
        ├─ audit document.confirmed
        └─ COMMIT
```

### 13.3 Replace workflow (D-11 — supersede happens at confirm, not at replace-issue)

```
POST …/documents/:id/replace
   ├─ authority; isReplaceable(status)  → else 409
   └─ TRANSACTION
        ├─ advisory lock on the group
        ├─ re-read predecessor FOR UPDATE
        ├─ open pending_upload for this group?
        │     fresher than the upload TTL → 409 REPLACE_ALREADY_IN_PROGRESS
        │     staler                      → mark it deleted + audit document.upload_abandoned
        ├─ effective-policy checks against the type's CURRENT config
        ├─ INSERT v(n+1): same document_group_id, supersedes_id = predecessor.id,
        │                 status = pending_upload, allows_multiple re-snapshotted,
        │                 is_confidential = predecessor.is_confidential || type.is_confidential
        ├─ sign PUT
        ├─ audit document.replace_issued
        └─ COMMIT
```

The predecessor stays `available` throughout. If the employee abandons the replace, they still have
their document — the failure mode is "nothing happened", not "I lost my PAN card".

### 13.4 Maker–checker (D-15, deliberately thin)

There is **no generic approval table**. The quartet `recommendation` / `recommended_by` /
`proposed_by` / `approved_by` lives on `employee_documents`.

```
Manager: POST …/manager/documents/:id/recommend { recommendation, note }
   ├─ scope check BEFORE existence lookup
   ├─ status must be pending_verification
   ├─ set recommendation, recommended_by, recommended_at, note, proposed_by = actor
   └─ if settings.manager_direct_document_authority = ON
        → apply immediately as if HR had acted, approved_by = actor
        → audit document.verified / document.rejected with proposed_by = approved_by = actor
      else
        → audit document.recommended; the document appears in HR's verification queue
          annotated with the recommendation
```

**Settings interaction, resolved once:** `manager_direct_document_authority = ON` together with
`document_require_separate_checker = ON` would make every manager action a self-approval. `PUT
/settings` therefore rejects that combination with `409 SETTINGS_CONFLICT` rather than letting it
produce an unexplainable runtime `409` later.

### 13.5 Type activation workflow

```
POST /hr/types/activate { codes: [...] }
   └─ TRANSACTION
        ├─ advisory lock on the org's type namespace
        ├─ load catalog rows by code   → any missing → 404 (whole batch fails)
        │                              → any platform-inactive → 409 (whole batch fails)
        ├─ load the org's existing types for those codes
        ├─ per code:
        │     active   → skip                       → already_active[]
        │     inactive → is_active = true ONLY      → reactivated[]
        │     absent   → INSERT copying default_*   → activated[]
        ├─ one audit row per code with its outcome
        └─ COMMIT → { activated, reactivated, already_active }
```

A retry of the same request returns every code in `already_active` — the observable proof of
idempotency, and the assertion in the test.
---

## 14. Transactions & Concurrency

### 14.1 The locking protocol — one rule, no deadlocks

> **Every write that touches a document group takes
> `pg_advisory_xact_lock(hashtext('docgrp:' || org_id || ':' || document_group_id))` first, then row
> locks in ascending `id` order.**

Advisory locks are transaction-scoped (`_xact_`), so they release on commit or rollback with no
cleanup path to forget. Because the advisory lock is always taken before any row lock, and row locks
are always taken in a total order, no two document operations can deadlock against each other.

Three lock namespaces exist:

| Key | Taken by | Protects |
|---|---|---|
| `docgrp:{orgId}:{groupId}` | confirm, replace, verify, reject, recommend, delete | the version chain and the live-version invariant |
| `docslot:{orgId}:{userId}:{typeId}` | issue upload URL when `allows_multiple = false` | the single-instance slot, *before* a row exists to lock |
| `doctypes:{orgId}` | activate, create custom type | the org's type-code namespace |

### 14.2 Transaction boundaries

| Operation | Boundary | Outside the transaction |
|---|---|---|
| issue upload URL | one transaction: lock → guard → insert → sign → audit → commit | — (the sign is inside; see §14.4) |
| **confirm** | **HeadObject first, transaction second** | the HeadObject call — a 3 s network call must never hold a row lock |
| replace | one transaction: lock → re-read → reap-or-reject → insert → sign → audit | — |
| verify / reject / recommend | one transaction: lock → `FOR UPDATE` → guards → update → audit | — |
| delete | one transaction: lock → `FOR UPDATE` → guards → update → audit | — |
| view-url | **no transaction** for the read; the `document.viewed` audit uses its own short one | the `getViewUrl` call |
| activate types | one transaction for the whole batch | — |
| settings update | one transaction: `findOrCreate` with `lock` → guards → update → audit | the active-HR count query (read-only, taken inside for snapshot consistency) |

All transactions are **unmanaged**, with the project's standard epilogue:

```js
} catch (err) {
  if (!t.finished) await t.rollback()
  throw err
}
```

### 14.3 Race conditions, named and handled

| # | Race | Outcome |
|---:|---|---|
| C-1 | Two concurrent uploads of a single-instance type | `docslot` advisory lock serialises them; the second sees a live row and gets `409 DOCUMENT_ALREADY_EXISTS`. The partial unique index is the backstop if the lock is ever removed. |
| C-2 | Two concurrent confirms of the same document | `docgrp` lock + `FOR UPDATE`; the loser re-reads a non-`pending_upload` status and returns the winner's result idempotently. Exactly one `document.confirmed` audit row. |
| C-3 | Confirm racing a replace on the same group | Both take `docgrp`. If replace wins, the predecessor is still live and the confirm supersedes it correctly. If confirm wins, replace re-reads and either proceeds from the new live version or returns `409 REPLACE_ALREADY_IN_PROGRESS`. |
| C-4 | Confirm racing HR verify | Both take `docgrp` then the row lock. Verify re-checks `status === 'pending_verification'`; if confirm had not yet landed it sees `pending_upload` and returns `409 DOCUMENT_NOT_PENDING_VERIFICATION`. |
| C-5 | Two HR users verifying the same document | `FOR UPDATE`; the loser sees `available` and gets `409 DOCUMENT_NOT_PENDING_VERIFICATION`. Never two `approved_by` values, never two audit rows. |
| C-6 | Manager recommends while HR verifies | Same row lock. Whichever commits second sees a status it cannot act on and gets a deterministic `409`. |
| C-7 | Two concurrent activations of overlapping code sets | `doctypes` lock serialises; the second reports everything as `already_active`. `UNIQUE (org_id, code)` is the backstop. |
| C-8 | Two concurrent first-access settings reads | `findOrCreate` + `UNIQUE (org_id)`; one creates, the loser re-reads. The payroll `payroll_settings` precedent. |
| C-9 | A type is deactivated while an upload URL for it is outstanding | The confirm succeeds — the policy was evaluated at issue time (EC-35). Deactivation stops *new* uploads, it does not strand an in-flight one. |
| C-10 | A subject is deactivated / moves managers between recommend and verify | Caught by R-26's scope re-check at approval (EC-19), not by a stale snapshot. |
| C-11 | Settings `document_max_file_size_bytes` lowered while an upload is outstanding | The signed PUT already pins the old `Content-Length`; HeadObject compares against the *row's* declared size, so the upload completes. New uploads see the new ceiling. Documented, not accidental. |

### 14.4 The one accepted residue

`issueUploadUrl` signs the PUT **inside** the transaction (payroll precedent). If the commit then
fails, the client holds a URL for a key with no row. The object becomes unreferenced garbage.

Alternatives considered and rejected: signing after commit needs a second transaction to record
`upload_url_issued_at` (two commits, same class of problem, one more failure point); a two-phase
"reserve then sign" doubles the round trips for a failure that requires a DB outage in a 5 ms window.

**Mitigation is operational:** an S3 lifecycle rule expiring objects under
`org/*/documents/*` that are older than the upload TTL **and** never transitioned — combined with the
Phase-4 sweeper for rows. This is in the ops hand-back (§21) and is flagged in §1.3 as a known gap.

---

## 15. Idempotency & Retry Behaviour

No `Idempotency-Key` header is introduced. Every state-changing endpoint is made **naturally
idempotent** by keying on state that already exists, which is the pattern the rest of the product uses.

| Endpoint | Retry semantics |
|---|---|
| `POST /types/activate` | Fully idempotent by code. A retry returns the same three arrays with everything in `already_active`. Never duplicates, never resets an org's edits. |
| `POST /types` (custom) | **Not** idempotent — a retry hits `UNIQUE (org_id, code)` and returns `409 DOCUMENT_TYPE_CODE_EXISTS`, which is the correct answer to "create this twice". |
| `POST …/documents` (issue URL) | **Not** idempotent by design for `allows_multiple` types — a second call is a second document. For single-instance types the slot guard makes the second call a deterministic `409`, and if the first call's `pending_upload` is stale it is reaped and the retry succeeds. A client that retries on timeout therefore either gets the slot or a clear conflict, never two live documents. |
| `POST …/:id/confirm` | **Fully idempotent.** Already-confirmed → returns the current representation, no S3 call, no second audit row. Safe to retry on any network failure. A failed verification leaves the row `pending_upload`, so a corrected re-upload + re-confirm is the recovery path. |
| `POST …/:id/replace` | Guarded, not idempotent: a second call while a fresh `pending_upload` exists returns `409 REPLACE_ALREADY_IN_PROGRESS`. After the upload TTL, the stale attempt is reaped and a retry succeeds. **A retry can never produce two live v2 rows** — the live-version partial unique index forbids it. |
| `POST …/:id/verify` / `/reject` | Idempotent-by-state: the second call sees a non-`pending_verification` status and returns `409`. Callers that want "make sure it is verified" read the detail. |
| `POST …/:id/recommend` | Last-write-wins on the same manager's own recommendation (overwriting `verify` with `reject` is legitimate); a different manager cannot overwrite because they cannot pass the scope check for the same subject. One audit row per call — the history of changed minds is itself the record. |
| `DELETE …/:id` | Fully idempotent. Already-`deleted` → `200`, same body, no second audit row. |
| `PUT /settings` | Naturally idempotent (full replace of the mutable set). An unchanged update still writes an audit row with equal `old_values`/`new_values` — a deliberate "HR looked and confirmed" record. |
| `GET …/view-url` | Not idempotent by definition (each call mints a new URL) and **each issuance is audited**. This is intentional: who requested access to a confidential document, and when, is the compliance question. |

**Retry-safety of the S3 calls:** `headObject` has a 3 s timeout and `maxAttempts: 1` — it never
retries internally, so a slow S3 cannot pile up connections. The caller retries by re-invoking
`confirm`, which is idempotent. `deleteObject` on a missing key succeeds, so the future sweeper is
retry-safe.

---

## 16. Error & Failure Handling

### 16.1 Error code register

| Code | HTTP | Raised by |
|---|:--:|---|
| `DOCUMENT_NOT_FOUND` | 404 | every `:id` addressing mode, for every denial reason (§12.2) |
| `FORBIDDEN` | 403 | every `:userId` addressing mode |
| `CATALOG_ENTRY_NOT_FOUND` | 404 | activate / catalog detail |
| `CATALOG_ENTRY_INACTIVE` | 409 | activate |
| `DOCUMENT_TYPE_NOT_FOUND` | 404 | type detail / update / upload |
| `DOCUMENT_TYPE_INACTIVE` | 409 | upload against a deactivated type |
| `DOCUMENT_TYPE_CODE_EXISTS` | 409 | custom create, duplicate org code |
| `DOCUMENT_TYPE_CODE_RESERVED` | 409 | custom create using a catalog-owned code |
| `DOCUMENT_TYPE_FIELD_IMMUTABLE` | 409 | type update touching `code`/`plane`/`source`/`catalog_id`/`is_statutory` |
| `DOCUMENT_TYPE_PLANE_MISMATCH` | 422 | employee-document operation against an `org`-plane type |
| `DOCUMENT_TYPE_NO_USABLE_CONTENT_TYPE` | 422 | empty intersection of allow-lists |
| `DOCUMENT_TYPE_IN_USE` | 409 | (reserved) hard-delete attempt — the RESTRICT FK's friendly form |
| `DOCUMENT_CONTENT_TYPE_NOT_ALLOWED` | 422 | issue upload URL |
| `DOCUMENT_TOO_LARGE` | 422 | issue upload URL |
| `DOCUMENT_EXPIRY_REQUIRED` | 422 | `has_expiry` type with no `expires_on` |
| `DOCUMENT_ALREADY_EXISTS` | 409 | single-instance slot taken |
| `DOCUMENT_NOT_AWAITING_UPLOAD` | 409 | confirm on a terminal status |
| `DOCUMENT_OBJECT_NOT_FOUND` | 422 | confirm, HeadObject returned null |
| `DOCUMENT_VERIFICATION_FAILED` | 422 | confirm, size/type mismatch |
| `DOCUMENT_NOT_PENDING_VERIFICATION` | 409 | verify / reject / recommend |
| `DOCUMENT_NOT_REPLACEABLE` | 409 | replace from a non-`available`/`expired` status |
| `REPLACE_ALREADY_IN_PROGRESS` | 409 | replace with a fresh `pending_upload` on the group |
| `DOCUMENT_NOT_DELETABLE` | 409 | subject deleting a verified/statutory document |
| `SELF_APPROVAL_NOT_ALLOWED` | 409 | separate-checker violation |
| `RECOMMENDATION_SCOPE_STALE` | 409 | EC-19 re-check at approval |
| `INVALID_REFERENCE_URL` | 422 | link-reference |
| `DOCUMENT_STORAGE_UNAVAILABLE` | 503 | any `StorageUnavailableError` |
| `SCAN_PROVIDER_NOT_CONFIGURED` | 409 | enabling `document_scan_required` in Phase 1 |
| `INSUFFICIENT_CHECKERS` | 409 | enabling `document_require_separate_checker` with < 2 active HR |
| `SETTINGS_CONFLICT` | 409 | separate-checker + manager-direct-authority both ON |
| `SETTING_OUT_OF_RANGE` | 422 | a settings value above its hard cap |

### 16.2 Failure modes and recovery

| Failure | Behaviour | Recovery |
|---|---|---|
| S3 unreachable at issue | `503`, transaction **rolled back**, no row | client retries; nothing is left behind |
| S3 unreachable at confirm | `503`, **no state change**, row stays `pending_upload` | retry confirm; idempotent |
| S3 unreachable at view-url | `503` | retry; no state to repair |
| HeadObject returns null (client never PUT, or PUT failed) | `422 DOCUMENT_OBJECT_NOT_FOUND`, row stays `pending_upload` | re-PUT and re-confirm within the upload TTL; after that, the stale row is reaped by the next attempt |
| Size or content-type mismatch at confirm | `422 DOCUMENT_VERIFICATION_FAILED` + `document.verification_failed` audit; row stays `pending_upload` | upload the correct bytes and re-confirm. **This is a security event and is audited even though it fails.** |
| DB commit fails after the PUT is signed | orphan object, no row | S3 lifecycle rule (§14.4, §21) |
| DB commit fails mid-activation | whole batch rolled back; no partial type set | retry — idempotent |
| Audit write fails inside a write transaction | the whole transaction rolls back; the change does not happen | by design (D-16 / payroll precedent) |
| Audit write fails for `document.viewed` | logged, **read still succeeds** | the read is not denied by a telemetry failure |
| Unique-constraint violation surfacing despite the locks | mapped by constraint **name** to `DOCUMENT_ALREADY_EXISTS` or `DOCUMENT_VERSION_CONFLICT`; the raw Postgres message is never returned | indicates a lock-protocol bug — the mapping is the safety net, not the design |
| `documents.access` not on the org's plan | `requireFeature` denial before any handler | ops: check `plan_features` |
| No bucket configured | `503 DOCUMENT_STORAGE_UNAVAILABLE` per request; **the app still boots** | ops: set `APP_S3_BUCKET` |

### 16.3 Observability & logging

No logger abstraction exists in this project; the convention is `console.error` with a bracketed
module tag (`[PayrollAutomation]`). Documents uses **`[Document]`**.

| Event | Level | Line |
|---|---|---|
| Storage unavailable | error | `[Document] storage unavailable op=<issue\|confirm\|view> org=<id> doc=<id> err=<name>` |
| HeadObject mismatch | warn | `[Document] verification failed doc=<id> declared=<type>/<size> actual=<type>/<size>` |
| Unique violation reaching the handler | error | `[Document] constraint=<name> doc=<id>` — signals a lock-protocol bug |
| Detached audit failure | error | `[Document] audit write failed action=<action> doc=<id> err=<name>` |
| Settings guard-rail rejection | info | `[Document] settings rejected org=<id> reason=<code>` |

**Never logged, in any line:** `storage_key`, `document_number`, `reference_url`, presigned URLs
(a presigned URL in a log file is a credential in a log file), file bytes, `req.user` beyond ids.

Every error carries the `request_id` already present in the request context, so a `503` a user reports
is findable in both the log and `document_audit_logs`.

---

## 17. Background Jobs, Events & Integrations

**Phase 1 registers no cron.** This is a deliberate scope line, and the design compensates for it:

| Job | Phase | Phase-1 compensation |
|---|:--:|---|
| Expiry flip (`available` → `expired`) | 4 | `resolveDisplayStatus` derives expiry **on every read**, so a document past `expires_on` reads as expired the moment it lapses, with or without a cron (EC-17). The supporting partial index ships now. |
| Abandoned-upload sweeper | 4 | `isStaleUpload` lets the **next** issue/replace attempt reap a stale `pending_upload` inline. Nothing accumulates in a way that blocks a user. |
| Retention purge | 4 | `deleteObject` ships now (D-6); nothing calls it in this module yet. |
| Expiry reminder emails | 4 | none; `expiry_reminder_days` is stored and unread. |

When the crons arrive in Phase 4 they follow the established shape: bare `require` in `server.js`,
registered **only when `os.platform() === 'linux'`**, `timezone: 'Asia/Kolkata'`, with a
`runStartupCatchUp()` compensating for missed runs and a watermark column claimed by
`column IS DISTINCT FROM :today` so a double-fire updates zero rows. **Nothing in Phase 1 may assume
a cron runs.**

**Events:** no event bus exists in this product and none is introduced (D-19 — zero new dependencies).
Cross-module reactions in later phases use the outbox/status-column + cron-drain pattern (D-16).

**Integrations in Phase 1:** S3 only. No SES, no Redis key, no webhook, no scanner.

---

## 18. Org Settings — registry #58 … #67

Add a new `## Document Module` section to `public/md_settings/org_settings_registry.md`, numbered from
**#58** (the file currently ends at #57), using that file's exact `### N. Title (\`key\`)` structure.
Register these **in Phase 1**; the Phase 3/4/5 settings are registered by those phases.

| # | Key | Type | Default | Hard cap / guard rail |
|---:|---|---|---|---|
| 58 | `manager_can_view_team_documents` | boolean | **ON** | AND-ed with `type.manager_can_view`; OFF makes every manager read endpoint return empty, not error |
| 59 | `manager_direct_document_authority` | boolean | **OFF** | cannot be ON while #60 is ON → `409 SETTINGS_CONFLICT` |
| 60 | `document_require_separate_checker` | boolean | **OFF** | requires ≥ 2 active `hr` users → `409 INSUFFICIENT_CHECKERS`; cannot be ON while #59 is ON |
| 61 | `document_view_url_ttl_seconds` | integer | 300 | 30 … **900**, capped in the provider |
| 62 | `document_upload_url_ttl_seconds` | integer | 600 | 60 … **3600**, capped in the provider |
| 63 | `document_max_file_size_bytes` | integer | 10485760 | 1 MB … **26214400** (25 MB); a type may only narrow it |
| 64 | `document_scan_required` | boolean | **OFF** | **enabling is rejected in Phase 1** → `409 SCAN_PROVIDER_NOT_CONFIGURED` (§1.3) |
| 65 | `document_retention_days` | integer | 2555 | ≥ 30; *write-only in P1* — the purge is Phase 4 |
| 66 | `employee_can_delete_verified_documents` | boolean | **OFF** | AND-ed with `type.employee_can_delete` and `!type.is_statutory` |
| 67 | `document_default_verification_required` | boolean | **ON** | the default copied into a **custom** type's `requires_verification` at create; does not retroactively change existing types |

Every value is validated twice: by Joi against its range, and by `document_settings.service` against
the cross-field guard rails. The provider's `clampTtl` is the third and final line for #61/#62, so
even a direct DB edit cannot mint a 24-hour URL (**D-20**).
---

## 19. Implementation Sequence

Eleven steps. Each has a **verify** gate; do not start step *n+1* until step *n* verifies. The order is
dictated by dependency, not by preference: infrastructure before schema (shared-file risk isolated),
schema before utils (column names are the utils' contract), utils before services (services are only
glue once the pure logic is proven), self plane before HR plane (the simplest authority first), HR
before manager (the manager plane composes HR's read logic with scoping).

| Step | Work | Verify |
|:--:|---|---|
| **0** | Answer Open Decisions 1, 2, 6 (§22) | written answers recorded in this file |
| **1** | Infrastructure (§5): config fallback chain, `deleteObject`, `ttlSeconds` param, util promotion + payroll re-export, allow-list second parameter | `npm test` — **payroll pass count identical to the §2 baseline**; the allow-list isolation test added and passing |
| **2** | Migration `00049`, five models, `MODEL_ROOTS` entry | migration parses; `require('models.index')` exposes all five models; **static verification only — the migration is handed to the user, never run here** |
| **3** | Seeders `008` (feature) and `009` (catalog) | both parse; `009` is idempotent under `ON CONFLICT (code) DO NOTHING`; `008` maps to every plan |
| **4** | Pure utils (§8) + `tests/unit/document/` | `npm test` green; the five util test files exist and cover the §20 matrix |
| **5** | Repositories with frozen projection allow-lists; `document_audit.service` | `grep -n "storage_key" src/modules/document/` returns hits only in the model, the migration and `findByIdForStorage` |
| **6** | `document_settings.service` + HR settings endpoints (#23, #24) with all three guard rails | enabling `document_scan_required` → `409`; separate-checker with 1 HR → `409`; #59+#60 together → `409`; TTL above cap → `422` |
| **7** | Catalog browse, activation, type CRUD (#1–#9) | activate the same batch twice → second response is all `already_active`, row count unchanged; deactivate → edit → reactivate → the edits survive |
| **8** | Self plane (#34–#42): issue → confirm → detail → view-url → replace → delete | the full happy path; confirm twice → identical body, one audit row; abandoned upload never appears in `GET /me/documents` with a status other than `pending_upload` |
| **9** | HR plane documents (#10–#22): on-behalf upload, verify, reject, replace, delete, queue, versions, audit-logs, link-reference | verify → `available`; reject without a reason → `422`; an expired-on-verify document lands `expired` |
| **10** | Manager plane (#25–#33): scoped reads, on-behalf upload, recommend | id-substitution sweep returns a byte-identical `404`; a non-report `:userId` returns `403`; no delete/verify route exists |
| **11** | Documentation deliverables (§23) + `org_settings_registry.md` #58–#67 + the completion report | every §24 checkbox ticked; the D-6 payroll side effect written into the completion notes |

---

## 20. Testing Requirements

**Runner:** `node --test` via `npm test` (`node --test "tests/unit/**/*.test.js"`), zero dependencies,
`node:test` + `node:assert`. New directory: `tests/unit/document/`.

### 20.1 Required test files

| File | Must cover |
|---|---|
| `object_storage.utils.test.js` | key building from the `segments` shape and the legacy shape · rejection of `/`, `\`, NUL, `..`, empty per segment · `file_name` is never read by the builder · the 7-type allow-list · **SVG / HTML / XML rejected** · office types forced to `attachment` · `isSafeReferenceUrl` rejects `javascript:`, `data:`, `http:`, > 1000 chars, control characters (EC-23) · `sanitizeFileName` strips CR/LF, quotes, backslashes, control chars and truncates to 200 (EC-3) · `buildContentDisposition` output for every disposition × type pair |
| `allowlist_isolation.test.js` | **the D-7 contract:** widening `ALLOWED_CONTENT_TYPES` does not widen payroll — payroll's explicit 4-type list still rejects `application/msword`. This test is the reason the second parameter exists. |
| `document_authority.test.js` | the full matrix: audience (`self`/`manager`/`hr`) × status (all 9) × `effectiveConfidential` × `accessibleUserIds` (`null` / `[]` / `[ids]`) × action. Plus three properties: **(a)** a manager's deny for confidential is byte-identical to the deny for non-existent; **(b)** `accessibleUserIds === null` with `role !== 'hr'` does **not** grant global scope (D-10); **(c)** `[]` denies everything scoped |
| `document_type_rules.test.js` | `min()` size, allow-list intersection, empty intersection → `DOCUMENT_TYPE_NO_USABLE_CONTENT_TYPE`, tighten-only confidentiality (a `false` against a confidential type is ignored, not thrown), `manager_can_view` AND-ed with the org setting, `employee_can_delete` AND-ed with the setting and `!is_statutory` (EC-7), reserved-code detection, the immutable-field list |
| `document_version.test.js` | `nextVersion` chain (v1 group = own id; v3 supersedes v2, group unchanged) · `isReplaceable` rejects `pending_verification` · `isStaleUpload` boundary at exactly the TTL · the **one-live-version** property asserted over a simulated sequence of issue/confirm/replace events (EC-6, EC-24) |
| `document_expiry.test.js` | `isExpired` at the `Asia/Kolkata` day boundary · `resolveDisplayStatus` returns `expired` for a lapsed `available` row with no cron having run (EC-17) · a past `expires_on` at upload lands `expired`, not `available` (EC-25) · `requiresExpiryDate` |
| `document_masking.test.js` | `maskDocumentNumber` on a 12-digit Aadhaar, a 10-char PAN, a 3-char value, empty, `null` (EC-27) · the frozen `LIST_ATTRIBUTES` / `DETAIL_ATTRIBUTES` arrays **do not contain** `storage_key`, `document_number` or `reference_url` |

### 20.2 Edge cases from the parent register, and where Phase 1 discharges each

| EC | Discharged by |
|---|---|
| EC-2 (declared PDF, uploaded SVG) | confirm's HeadObject comparison → `422`, row stays `pending_upload` |
| EC-3 (`../`, NUL, CRLF in `file_name`) | `buildObjectKey` never reads it; `sanitizeFileName` for `Content-Disposition` |
| EC-4 (oversize file) | Joi · signed `Content-Length` · HeadObject |
| EC-5 (two concurrent confirms) | `docgrp` advisory lock + `FOR UPDATE` (C-2) |
| EC-6 (two concurrent replaces) | `docgrp` lock + `REPLACE_ALREADY_IN_PROGRESS` + the live-version index (C-3) |
| EC-7 (employee deletes a verified statutory document) | R-30 / R-31 → `409 DOCUMENT_NOT_DELETABLE` |
| EC-8 / EC-9 (confidential vs. non-report) | §12.2 uniform denial codes |
| EC-10 (cross-org id) | `org_id` in the same predicate as `id` |
| EC-11 (type deactivated with live documents) | R-9 / R-10 — soft deactivate; existing documents unaffected. *(The "open requests" half of EC-11 is Phase 4; `document_requests` does not exist yet.)* |
| EC-19 (subject stops reporting before approval) | R-26 scope re-check at approval |
| EC-20 (`manager_direct_document_authority` ON) | §13.4 — applied immediately, audited with both actor ids |
| EC-21 (S3 outage) | §16.2 — `503`, no state change, every path |
| EC-22 (signed URL shared externally) | TTL cap in the provider + `document.viewed` audit on every issuance |
| EC-23 (`javascript:` / `data:` reference URL) | `isSafeReferenceUrl` in **both** the Joi schema and the service |
| EC-24 (duplicate single-instance upload) | `docslot` lock + `409` + the partial unique index |
| EC-25 (`expires_on` already past) | R-16 / R-25 |
| EC-27 (Aadhaar/PAN masking) | `maskDocumentNumber` + projection allow-lists |
| EC-35 (type policy changed later) | policy evaluated at issue time; `allows_multiple` snapshotted |
| EC-17 (expiry cron missed) | **compensated** in P1 by `resolveDisplayStatus`; the cron itself is Phase 4 |
| EC-28 (statutory exempt from purge) | `is_statutory` ships and is platform-curated; the **purge** is Phase 4 |

### 20.3 Manual verification required before the phase closes

Unit tests cannot reach these. Each must be **demonstrated and recorded**, not asserted.

1. Payroll attachment upload → confirm → view, end to end, against the modified infrastructure.
2. IDOR sweep: for every `:id` endpoint in all three audiences, substitute (a) a fabricated UUID,
   (b) another org's document id, (c) a non-report's document id, (d) a confidential document id —
   and diff the four responses byte for byte. They must be identical.
3. Content-type bypass: declare `application/pdf`, PUT an HTML file, confirm → must `422` and leave
   the row `pending_upload`.
4. `grep -r "storage_key"` across captured HTTP responses, the application log and
   `document_audit_logs` rows → zero hits.
5. A signed view URL for document A must not resolve document B; the URL must stop working after its
   TTL.
6. Abandoned upload: issue a URL, never PUT, then list → the row appears only in the subject's own
   view with status `pending_upload`, and in no manager or HR list.

---

## 21. Migration & Deployment Considerations

**Migrations are never run by this project's agents.** The database is remote; `00049`, `008` and
`009` are verified statically and by unit tests, then **handed back to the user** with the exact
commands. Nothing in this phase may be reported as verified against a live database.

### Deployment order

```
1. Deploy code with the documents routes present but the feature unseeded
      → every document route returns the requireFeature denial. Harmless.
2. Run migration 00049
3. Run seeder 008  (documents.access → all plans)   → routes become reachable
4. Run seeder 009  (platform type catalog)          → HR can activate types
5. Set APP_S3_BUCKET (optional — the fallback chain keeps PAYROLL_S3_BUCKET working)
```

Steps 2 and 3 are separable on purpose: the feature is dark until the schema exists.

### Backward compatibility

| Surface | Impact |
|---|---|
| Existing API request/response shapes | **none** — documents adds only new paths |
| `aws-s3.config.js` | resolves identically when only `PAYROLL_S3_BUCKET` is set (asserted by the regression run) |
| `aws-s3.provider.js` | `ttlSeconds` is optional; omitting it reproduces today's behaviour exactly |
| `attachment_storage.utils.js` | same module surface via re-export; payroll's allow-list stays 4 types via the explicit-list parameter |
| **`payroll_attachment_sweeper`** | **behaviour changes** — it begins hard-deleting soft-deleted payroll attachments older than `payroll_attachment_retention_days` (default 2555 days). No row is that old today, so the practical effect is zero, but this is a real change and belongs in the release notes (D-6) |
| Rollback | `00049` `down()` drops five tables and their enum types. Objects already written to S3 are **not** removed by the rollback — they must be cleaned manually, or left for the lifecycle rule |

### Ops hand-back (the application cannot enforce these — D-20)

1. Run `00049`, then seeders `008` and `009`.
2. S3 bucket: **Block Public Access ON**, **SSE-KMS**, **versioning ON** (versioning is what makes a
   soft delete genuinely recoverable), lifecycle rules aligned with `document_retention_days`.
3. **Lifecycle rule on `org/*/documents/*`** expiring never-referenced objects older than the upload
   TTL — this is the mitigation for §14.4's accepted residue.
4. CORS on the bucket must allow `PUT` from the app origins with the `Content-Type` and
   `Content-Length` headers, or browser upload fails at step 2 of §13.2.
5. Confirm the IAM role grants `s3:DeleteObject` before D-6's `deleteObject` is relied on.
6. Confirm the bucket region satisfies data-residency expectations for Aadhaar/PAN (Open Decision 6).

---

## 22. Open Decisions — required before Step 1

| # | Decision | Recommendation | Blocks |
|:--:|---|---|---|
| 1 | Shared `deleteObject` (D-6) vs. a document-only export | **Add the shared one.** It fixes a real payroll bug; today's blast radius is zero. | Step 1 |
| 2 | Promote the storage utils to `src/common/` (D-7) | **Do it.** Forking a security control is the worse option. | Step 1 |
| 6 | Bucket region vs. Indian PII residency | Confirm `AWS_REGION` is acceptable for Aadhaar/PAN, or provision a regional bucket before any real document is uploaded. | go-live, not Step 1 |

Decisions 3 (scanner), 4 (e-signature vendor) and 5 (bulk-publish threshold) belong to Phases 3–5 and
do not block Phase 1.

**Risks carried into the phase:**

| Risk | Mitigation |
|---|---|
| A shared-file edit breaks payroll silently | the §2 baseline + Step 1's identical-pass-count gate |
| The two partial unique indexes conflict with the version flow | `pending_upload` sits outside both predicates by design; `document_version.test.js` asserts the one-live-version property over a simulated event sequence |
| `document_scan_required` is turned on and strands every document | `PUT /settings` rejects it (§1.3) |
| The catalog seeder is edited later instead of appended to | stated as binding in §7.2; future seeders use `ON CONFLICT DO NOTHING` |
| Denial codes get "harmonized" toward payroll's mixed 404/403 | §12.2 states the divergence is deliberate; `document_authority.test.js` asserts the byte-identical property |

---

## 23. Documentation Deliverables — part of the phase, not afterwork

| Deliverable | Path |
|---|---|
| Org settings entries #58–#67 | `public/md_settings/org_settings_registry.md` |
| Phase 1 completion report (what shipped, what is inert, the D-6 payroll side effect, test counts) | `public/md_documents/phases/phase1_completion_report.md` |
| API reference for the 42 endpoints (request/response/error codes) | `public/md_documents/DOCUMENTS_API_CONTRACT.md` |
| Ops hand-back note (migration commands, bucket policy, CORS, lifecycle rule) | `public/md_documents/phases/phase1_ops_handback.md` |
| Frontend change record — **only if** the payroll regression run reveals any observable difference | `public/md_updates/<YYYY-MM-DD>-<name>.md` |
| Amendments to the parent plan, dated, if any Phase-1 finding contradicts a decision | `public/md_documents/implementation_plan.md` |

---

## 24. Production-Readiness Checklist

**Security**
- [ ] No route admits `admin` or `super-admin` (D-10)
- [ ] `accessibleUserIds === null` alone never grants global scope; `role === 'hr'` is asserted
- [ ] Scope is checked **before** every existence lookup
- [ ] Denial codes are uniform per addressing mode, including the message string
- [ ] `storage_key`, `document_number` and `reference_url` appear in no response, log or audit row
- [ ] Presigned URLs appear in no log line
- [ ] Allow-list excludes SVG/HTML/XML; office types are `attachment`-only
- [ ] TTL caps are enforced in the provider, below any org setting
- [ ] `org_id` is in every repository predicate

**Correctness**
- [ ] Both partial unique indexes exist with explicit names and the corrected predicates
- [ ] `allows_multiple` is snapshotted, never back-filled from the type
- [ ] Supersede happens at confirm, never at replace-issue
- [ ] Expiry is derived on read as well as persisted
- [ ] A fresh org with zero types renders every list as an empty `200`

**Concurrency**
- [ ] Every group-touching write takes the `docgrp` advisory lock before any row lock
- [ ] Row locks are acquired in ascending `id` order
- [ ] HeadObject is outside every transaction
- [ ] Confirm and delete are idempotent; activate is idempotent
- [ ] Unique violations are mapped by constraint name, never surfaced raw

**Auditability**
- [ ] Every state change writes an audit row inside the same transaction
- [ ] Every view-url issuance is audited
- [ ] A failed verification is audited even though the request fails
- [ ] Audit values are scrubbed of secrets

**Operability**
- [ ] The app boots with no bucket configured; storage endpoints return `503`
- [ ] Every failure path names its error code and leaves no partial state
- [ ] Ops hand-back written; migration handed to the user, not run

**Regression**
- [ ] `npm test` pass count ≥ baseline, with payroll attachment tests unchanged
- [ ] Allow-list isolation test present and passing
- [ ] Payroll upload → confirm → view demonstrated end to end
- [ ] The D-6 payroll sweeper change is in the completion notes

---

## 25. Final Phase 1 Acceptance Criteria

Phase 2 does not begin until **every** line below is demonstrated — not asserted.

**Type catalog & activation**
1. A fresh org's `GET /hr/types` returns `{ data: [] }` with `200`. Nothing is auto-activated.
2. `GET /hr/catalog` lists the seeded platform types, each flagged with whether this org has activated it.
3. `POST /hr/types/activate { codes: ["pan_card","aadhaar_card"] }` creates two org types carrying the
   catalog's `default_*` values. **Repeating the identical call** returns both codes in
   `already_active` and the org's row count is unchanged.
4. Editing an activated type, deactivating it, then reactivating it **preserves the edits**.
5. A later change to a `document_type_catalog` default does **not** alter any already-activated org type.
6. Creating a custom type with a catalog-owned code returns `409 DOCUMENT_TYPE_CODE_RESERVED`.
7. `PUT /hr/types/:id` attempting `code`, `plane`, `source`, `catalog_id` or `is_statutory` returns
   `409 DOCUMENT_TYPE_FIELD_IMMUTABLE` naming the offending fields.

**Employee document lifecycle**
8. An employee uploads a PAN card and sees it `pending_verification`; HR verifies it and it becomes `available`.
9. The employee **cannot** delete it once verified (`409 DOCUMENT_NOT_DELETABLE`) but **can** while pending.
10. A replace produces v2 and leaves v1 `superseded` with its object intact and its signed URL still resolving v1.
11. An **abandoned** replace leaves v1 `available` — the employee never loses a document in exchange for nothing.
12. A second upload of a single-instance type while one is live returns `409 DOCUMENT_ALREADY_EXISTS`
    naming the existing document.
13. Confirming twice returns the identical body and writes exactly one `document.confirmed` audit row.
14. Declaring `application/pdf` and uploading HTML fails confirm with `422`, leaves the row
    `pending_upload`, and writes a `document.verification_failed` audit row.
15. A document uploaded with a past `expires_on` lands `expired`, never `available`.
16. An abandoned pre-signed upload appears in **no** list except its own subject's, as `pending_upload`.

**Authorization**
17. A manager sees a direct report's non-confidential document.
18. A manager's request for a **confidential** document, a **non-report's** document, a **cross-org**
    document and a **fabricated** id return four byte-identical `404 DOCUMENT_NOT_FOUND` responses.
19. A manager addressing a non-report by `:userId` receives `403 FORBIDDEN`, and the same `403` for a
    user id that does not exist.
20. No manager route can verify, reject, replace or delete.
21. `admin` and `super-admin` tokens receive `403` from the middleware on every document route.
22. With `manager_can_view_team_documents` OFF, every manager read returns an empty list — not an error.

**Settings guard rails**
23. Enabling `document_scan_required` returns `409 SCAN_PROVIDER_NOT_CONFIGURED`.
24. Enabling `document_require_separate_checker` with fewer than two active HR users returns
    `409 INSUFFICIENT_CHECKERS`.
25. Enabling both `document_require_separate_checker` and `manager_direct_document_authority` returns
    `409 SETTINGS_CONFLICT`.
26. A `document_view_url_ttl_seconds` above 900 is rejected; a value set directly in the database above
    the cap is still clamped by the provider.

**Data protection**
27. `storage_key` appears in no response, no log line and no audit row.
28. `document_number` appears in no list projection; detail returns only `document_number_last4`.
29. Every `view-url` issuance has a matching `document.viewed` audit row naming the actor.

**Regression**
30. Payroll attachment upload, confirm and view still pass their existing tests unchanged, and the
    D-5/D-7 regression gate is recorded with before/after pass counts.
31. The allow-list isolation test proves the three new office types are **not** accepted by
    `payroll_attachments`.
