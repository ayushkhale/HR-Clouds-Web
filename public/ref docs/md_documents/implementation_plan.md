# Document Management Module — Implementation Plan

> **STATUS:** **Not started.** This document is written before any code exists. Phases 1–5 are all outstanding.
> **DATE:** 2026-09-21
> **SCOPE:** Employee Panel (Module 8 — *Document Management*) + the document surfaces of Manager Panel Module 2 (*Employee Management* → Documents tab, §2.3 "Upload Documents", offboarding document archive).
> **SOURCES:** `public/HRMS/Employee/Employee_md_original/Document Management.md`, `public/HRMS/Manager/Manager_md_original/Employee Management Panel.md` (§2.3, §3 Documents tab), `analysis/HRMS_FULL_PROJECT_UNDERSTANDING.md` (§3.4 M8, §6 RBAC matrix), and the live Attendance / Leave / Payroll code.
> **PRECEDENTS:** `public/md_payrolls/implementation_plan.md` (structure, decision style, maker–checker, tiering) and `public/md_leave/implementation_plan.md` (edge-case register style).

---

## 0. How to use this document

This file is the **single source of truth** for the Document Management module for its entire development lifecycle.

* **Do not** write per-phase detail here. When a phase starts, create `public/md_documents/phases/phase{N}_implementation_plan.md` (mirroring `public/md_payrolls/phases/`), plus the matching `phase{N}_api_analysis.md` and `phase{N}_business_walkthrough.md`.
* **Amend this file** whenever a decision changes — it must never go stale relative to the code. Date every amendment.
* **After every phase**, three registries must be updated (existing project rules):
  1. `public/md_system/api_registry.md` — one row per new endpoint, in a new `## Document Module` section with HR / Manager / Self sub-sections.
  2. `public/md_settings/org_settings_registry.md` — every new org-configurable knob, following its AI-INSTRUCTION field structure exactly. Document entries continue from **#58** (the file currently ends at #57).
  3. `public/md_documents/combined_api_analysis.md` — request/response contracts (create in Phase 1).
* **Per `CLAUDE.md`:** any change that affects an existing API's request/response must also get a dated `.md` change record in `public/md_updates/`. Phases 1–4 are purely additive and need none; **Phase 5's leave-module bridge does** (see D-17).

---

## 1. Scope & Requirements Traceability

### 1.1 Employee Panel — *Document Management Module*

| # | Requirement (from the source doc) | Delivered in |
|---|---|---|
| 1 | Centralized access to HR documents — appointment letters, contracts, NDAs, company policies, promotion/increment letters | **P2** |
| 2 | Smart categorization by document type or department | **P1** (type) / **P2** (department targeting) |
| 3 | Employee document uploads — PAN, Aadhaar, educational certificates, experience letters, medical/fitness proof | **P1** |
| 4 | HR gets real-time notifications for new uploads | **P4** (email + queue; "real-time" = queued-and-dispatched, D-16) |
| 5 | Digital signature & acknowledgment integration; e-sign on offer letters/NDAs | **P3** (acknowledgment + internal typed signature; external providers pluggable, D-13) |
| 6 | Acknowledgment tracking for policy compliance | **P3** |
| 7 | Legal validation with audit trail (timestamp, IP, user ID) | **P1** (`document_audit_logs`) → **P3** (signature evidence record) |
| 8 | Automated document reminders — expiry/renewal alerts for ID proofs, licenses | **P4** |
| 9 | Reminder emails/SMS for pending acknowledgments | **P4** (email; SMS deferred — D-16) |
| 10 | Downloadable templates & forms provided by HR | **P5** |
| 11 | Role-based access control; confidentiality for sensitive HR documents | **P1** (type-level) → enforced in every phase |

### 1.2 Manager Panel — *Employee Management* document surfaces

| # | Requirement | Delivered in |
|---|---|---|
| 1 | §2.3 Upload documents — offer letters, ID proofs, contracts, certifications | **P1** (employee-owned) / **P2** (org-issued) |
| 2 | §2.3 View, download, **replace**, or delete documents | **P1** (replace = new version, D-11) |
| 3 | §3 Employee profile → **Documents** tab | **P1** (manager read, scoped + type-gated) |
| 4 | §2.1 Option to upload documents during onboarding | **P4** (document requests + required-document checklist) |
| 5 | §2.2 Offboarding action: **document archive** | **P5** |
| 6 | "Only HR/Admin can add/remove and upload documents" (source doc line 107) | Reconciled by **D-9** — see that decision |
| 7 | Email alerts on document uploads / approvals needed | **P4** |

### 1.3 Explicitly out of scope (flag if requested later)

* **Third-party e-signature (DocuSign / Adobe Sign).** No vendor decision, no dependency, no account. We ship a **legally-evidenced internal acknowledgment/typed-signature** flow — which is precisely what the requirement's "audit trail (timestamp, IP, user ID)" describes — behind a pluggable `provider` enum so an external provider drops in later without a schema change (D-13).
* **OCR / content extraction / auto-classification.** "Smart categorization" is read as *structured categorization by type and department*, not machine classification.
* **Full-text search inside document bodies.** Metadata search only (name, type, tags, owner, dates). Postgres FTS over extracted text is a separate, dependency-bearing project.
* **Migrating `payroll_attachments` into this module.** Payroll attachments are *subordinate to a payroll entity* and derive their authority from it; documents are first-class entities. Two stores, one storage pattern — see **D-4**. Form 16 Part A and payslips stay owned by Payroll.
* **Virus/malware scanning.** No scanner exists in the stack and none is bundled. The module is built **scan-ready** (`scan_status` column, `available` gated behind it) so a ClamAV/GuardDuty/Lambda hook is a config change, not a migration — see **D-8** and **Open Decision 3**.
* **Document collaboration / in-place editing / comments.** Not in the requirement.

---

## 2. Verified Current-State Facts This Plan Depends On

Everything below was read from the live codebase on **2026-09-21** — do not re-derive it.

| Area | Fact | Consequence for Documents |
|---|---|---|
| Module scaffold | No `src/modules/document` exists. Existing modules: `attendance`, `auth`, `billing`, `employee`, `hr`, `leave`, `manager`, `organization`, `payroll` | Greenfield |
| Migrations | 48 files, latest `00048-create-payroll-exits-and-corrections.js`; one migration creates a whole module's tables | Next is **`00049-create-document-module.js`** |
| Seeders | 7 files, latest `007-seed-leave-feature.js` | Next is **`008-seed-document-feature.js`** |
| Feature flags | Seeded keys in use: `attendance.access` (10 route uses), `leave.access` (3), `payroll.access` (3). **No `documents.access` exists** | Must seed `documents.access` + plan-feature mapping, following the `007` pattern |
| Model autoload | `MODEL_ROOTS` in [models.index.js](src/infrastructure/postgres-sql/models.index.js) lists module roots explicitly | **Must add `modules/document/models`** or every model silently vanishes |
| Route mounting | [app.js:41-45](src/app.js#L41-L45) requires each `*.index.js` and invokes it with `app` | Add `require('./modules/document/document.index')(app)` |
| `req.user` | Frozen object from [auth.middleware.js](src/common/middlewares/auth.middleware.js); org key is **`orgId`**, not `org_id`. Also carries `orgStatus`, `tokenHash` | Use `req.user.orgId` |
| Manager scoping | [hierarchy_access.utils.js](src/common/utilities/hierarchy_access.utils.js) → `getAccessibleUserIds(orgId, requesterUser)`; `null` = global (`hr`/`admin`/`super-admin`), `[]` = none, `[ids]` = active direct reports minus any who hold a global-approver role. Resolved **only** from `user_reporting_mappings` | Documents re-export the same util. **Never** trust `employee_profiles.reporting_person` or `manager_id` |
| **Object storage EXISTS** | [aws-s3.config.js](src/infrastructure/aws-s3/aws-s3.config.js) + [aws-s3.provider.js](src/infrastructure/aws-s3/aws-s3.provider.js). Deps `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` are installed. Pattern is **pre-signed PUT direct-to-S3 → client uploads → HeadObject verification**. **No multer; the binary never transits Node** | **Reuse this exactly.** This is the single largest de-risking fact in the plan |
| Storage config is payroll-named | `PAYROLL_S3_BUCKET`, `PAYROLL_S3_KMS_KEY_ID`, `PAYROLL_ATTACHMENT_UPLOAD_TTL_SECONDS`, `PAYROLL_ATTACHMENT_VIEW_TTL_SECONDS`. `.env` sets `AWS_REGION`, `PAYROLL_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Generalise with backward-compatible fallback — **D-5** |
| **Provider has no delete** | The provider exports only `getUploadUrl`, `getViewUrl`, `headObject`. [payroll_automation.service.js:329](src/modules/payroll/services/payroll_automation.service.js#L329) guards with `typeof s3.deleteObject !== 'function'` and **returns false**, so the payroll retention sweep silently keeps every row forever | Documents need real deletion. Adding `deleteObject` **changes payroll behaviour** — **D-6**, must be deliberate |
| Attachment precedent | [payroll_attachments.model.js](src/modules/payroll/models/payroll_attachments.model.js) — polymorphic `owner_type` enum, `pending → available → deleted`, `storage_backend` (`s3`\|`reference`), checksum from single-part ETag, paranoid | Shape the documents table on this, with the differences in **D-4** |
| Storage security utils | [attachment_storage.utils.js](src/modules/payroll/utils/attachment_storage.utils.js) — **pure** functions: 4-type content allow-list (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`; SVG/HTML deliberately excluded as stored-XSS vectors), `buildObjectKey` (never uses `file_name`), `isSafeReferenceUrl` (https-only), `sanitizeFileName`, `buildContentDisposition` | Promote to `src/common/utilities/` and re-export — **D-7** |
| Authority precedent | [attachment_authority.utils.js](src/modules/payroll/utils/attachment_authority.utils.js) — two **pure** functions (`screenAttachment`, `resolveOwnerAuthority`), unit-tested without a DB, "out-of-scope == non-existent" | Copy the shape for `document_authority.utils.js` |
| Audit precedent | [payroll_audit_logs.model.js](src/modules/payroll/models/payroll_audit_logs.model.js) + [payroll_audit.service.js](src/modules/payroll/services/payroll_audit.service.js) — append-only, **not** paranoid, `proposed_by`/`approved_by` as real columns, written **inside the caller's transaction**. `attendance_audit_logs` exists but **no service ever writes to it** | Build `document_audit_logs` on this and wire writes from the first commit |
| Org settings precedent | `payroll_settings` is an org singleton via `getOrCreate(orgId)`; values that must not shift under a live process are **frozen into a snapshot** at the entity's creation | `document_settings` singleton, same pattern |
| Cron | `src/cron-jobs/*.cron.js`, no exports, registered by `require` in [server.js:24-35](src/server.js#L24-L35) **only when `os.platform() === 'linux'`**; `timezone: 'Asia/Kolkata'`. node-cron does not replay missed runs — payroll/leave add `runStartupCatchUp()` + manual HR trigger endpoints | Copy exactly |
| Email | [email.utils.js](src/common/utilities/email.utils.js) with an explicit `TEMPLATE_MAP` and HTML files in `src/common/templates/`. Outbound is a **queue-and-drain outbox**: a status column on the row + [payslip_email_dispatch.cron.js](src/cron-jobs/payslip_email_dispatch.cron.js) sending **outside** any transaction | Same pattern; add templates to `TEMPLATE_MAP` |
| SMS | [sms.utils.js](src/common/utilities/sms.utils.js) exists but no module uses it for notifications | SMS reminders are deferred (D-16) |
| Errors / envelope | `AppError(status, message, errorCode[, details])`; `{ success, message, data }` on success, `{ success:false, message, errorCode }` on error; controllers are class singletons, every handler `try/catch → next(error)` | Match exactly |
| Validation | `joi` + `validateOrThrow(schema, payload)` (`abortEarly:false`, `stripUnknown:true`). The `validate()` helper is re-declared per routes file — **use the payroll/leave version** with `try/catch` | Copy the payroll version verbatim |
| Express 5 gotcha | `req.query` is **getter-only** — `validate(schema, 'query')` throws. Payroll validates query **inside the controller** via `validateOrThrow` | Applies to every document list/search/report endpoint |
| Role planes | `hr` is the top tenant-plane role: the org creator is provisioned `hr`; invitation matrix runs `hr → employee \| manager \| hr`; `admin`/`super-admin` are `is_assignable: false` platform roles. Payroll routes use `authorize(['hr'])` / `authorize(['manager','hr'])`; Leave still uses the wider `['hr','admin','super-admin']` | Documents follow **Payroll**, not Leave — **D-10** |
| Profiles are role-split | `employee_profiles`, `manager_profiles`, `hr_profiles`, plus `user_profiles` (name/avatar). `employee_profiles` carries `joining_date`, `job_status`, `department_id`, `location_id`, `gender`, `pan_number`, `uan_number`. **No `exit_date` column exists** | Use the `_resolveRoleProfile` fallback idiom; exit dates come from `employee_exits` (payroll Phase 7) — D-18 |
| Department is dual-source | `employee_profiles` carries **both** free-text `department` and canonical `department_id` FK → `organization_departments` | Always target/filter by `department_id` |
| Existing document-ish fields | `leave_requests.document_url` — a `STRING(255)` URI, validated as `Joi.string().uri()`, enforced by `leave_types.requires_document_threshold`. **This is the only pre-existing document pointer outside payroll** | Do not break it — **D-17** |
| Tests | `npm test` → `node --test "tests/unit/**/*.test.js"`. **93 unit test files** across `tests/unit/{attendance,organization,payroll}` | Add `tests/unit/document/`; pure utils must be DB-free |
| Dependencies | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@aws-sdk/client-ses`, `joi`, `dayjs`, `node-cron`, `pdfkit`, `sequelize`, `uuid` all present | **Zero new dependencies required** — D-19 |
| CORS | [app.js:32](src/app.js#L32) already exposes `Content-Disposition` | Download headers work without an app.js change |

---

## 3. Architectural Decisions

> Each decision is binding. Changing one requires editing this section and dating the amendment.

### D-1 — Three route audiences, mounted by path

`src/modules/document/document.index.js` mounts at `/api/v1/documents`:

* `document_hr.routes.js` → `/api/v1/documents/hr` — `authorize(['hr'])`
* `document_manager.routes.js` → `/api/v1/documents/manager` — `authorize(['manager','hr'])`, every handler scoped by `getAccessibleUserIds`
* `document_self.routes.js` → `/api/v1/documents` (all routes under `/me`) — `[authenticate, requireFeature('documents.access')]`, **no `authorize()`** (any authenticated org member acts on their own documents)

The specific prefixes (`/hr`, `/manager`) **must** mount before the bare `/api/v1/documents`, and every self route lives under `/me`, so the bare mount can never swallow them. This is the exact `payroll.index.js` shape.

### D-2 — The module owns two distinct document planes

This is the core domain insight, and it is the decision most likely to be got wrong by collapsing them.

| | **Employee-owned documents** | **Org-issued documents** |
|---|---|---|
| Table | `employee_documents` | `org_documents` (+ `org_document_recipients`) |
| Examples | Aadhaar, PAN, degree certificate, experience letter, medical fitness | Appointment letter, contract, NDA, leave policy, promotion letter, HR template |
| Who creates | The employee (self-service) **or** HR/manager on their behalf | HR only |
| Authority anchor | the **subject** (`user_id`) | the **audience** (targeting rules → materialised recipients) |
| Cardinality | one row = one person's document | one row = one document, N recipients |
| Lifecycle verbs | upload → verify → expire → replace → archive | draft → publish → acknowledge/sign → supersede → retire |
| Deletable by subject | yes, while `pending_verification` | never |

Collapsing these into one table forces a nullable `user_id` whose NULL-ness silently changes the entire authorization path — the single most reliable way to ship an IDOR. They stay separate, share the storage core, the audit log and the type catalog, and are surfaced to the employee as one merged "My Documents" list by a **read-side composer**, not by a shared table.

### D-3 — A platform catalog of official document types, activated per org *(amended 2026-09-22)*

> **Amendment note.** The original D-3 had each org lazily seeded with a fixed default set on first access (the `getOrCreate` pattern). That is replaced by the **catalog → activation** model below. Reason: every org requires a *different* subset of documents, and an org must be able to see the full set of official types and choose, rather than receive a fixed list it then has to prune. The original wording also called the entity a "category"; the domain word — and the word used in both source requirement docs — is **type**. Tables renamed accordingly. No code existed at the time of this amendment, so the rename is free.

Two tables, one concept:

**1. `document_type_catalog` — platform-owned master list.** A curated set of the officially recognised document types (Aadhaar, PAN, degree certificate, offer letter, NDA, POSH policy, …), seeded by the platform. **System-scoped: no `org_id`**, exactly like `features`, `roles` and `subscription_plans`. Every policy column is a `default_*` — the catalog proposes, the org disposes. Carries `group` (identity / education / employment_history / financial / medical / background_check / onboarding / policy / disciplinary / exit) which is what delivers "smart categorization by document type" (§1.1 #2), and `country_code` (`IN` for Aadhaar/PAN/UAN, NULL = universal).

**2. `document_types` — the org's activated set.** `org_id` NOT NULL. Created two ways:
* **Activation** — HR picks catalog entries; each becomes an org row with the catalog's `default_*` values **copied in**, then freely editable.
* **Custom** — HR defines a type the catalog does not have (`source = 'custom'`, `catalog_id` NULL).

Columns: `plane` (`employee`\|`org`) · `source` (`catalog`\|`custom`) · `catalog_id` · `code` · `name` · `group` · `is_statutory` · `is_confidential` · `employee_can_upload` · `employee_can_view` · `employee_can_delete` · `manager_can_view` · `manager_can_request` · `requires_verification` · `requires_acknowledgement` · `requires_signature` · `has_expiry` · `expiry_reminder_days[]` · `is_mandatory` · `mandatory_for` (JSONB: employment types / departments / job statuses) · `allows_multiple` · `max_file_size_bytes` · `allowed_content_types[]` · `retention_days` · `display_order` · `is_active`.

Consequences, all binding:
* **Activation copies, it does not inherit.** A later platform edit to a catalog default must never silently change an org's configured behaviour. `catalog_id` is retained for **provenance only**, never for runtime resolution — the same snapshot-not-reference rule payroll applies to structure components.
* **Activation is idempotent.** Re-activating an already-active code returns the existing row untouched. Re-activating a **deactivated** type reactivates it **without resetting the org's edits**.
* **Confidentiality is a type property first**, with a per-document `is_confidential` override that can only tighten, never loosen (D-12).
* **`is_statutory` is platform-curated and not org-settable.** Custom types are always `is_statutory = false`. Statutory types are exempt from the retention purge (EC-28); letting an org self-declare statutory would let it exempt anything from retention.
* A type is **soft-deactivated, never deleted** (`is_active = false`), because documents reference it forever — the `leave_types` Edge-Case-26 precedent. Deactivation is blocked while an open document *request* targets it.
* **Nothing is auto-activated.** A fresh org starts with zero types and an onboarding step that asks which ones it needs. An empty type list is a valid state that every list endpoint must render, not an error.

### D-4 — A new documents store; `payroll_attachments` is **not** reused or migrated

Both stores follow the identical S3 pattern, but they are different kinds of thing and merging them is a mistake:

* `payroll_attachments` rows are **subordinate**: authority is resolved *against the owning payroll entity* (`resolveOwnerAuthority` loads the claim/declaration/summary), a row has no meaning alone, and its retention is governed by `payroll_settings.payroll_attachment_retention_days`.
* A document is **first-class**: it has its own type, expiry, verification state, versions, acknowledgments, signatures and retention. It has no owning entity to derive authority from.

Merging would mean an `owner_type = 'self'` that carries no authority, and would couple document retention to payroll settings. **What we reuse is the pattern and the pure utilities, not the table.** Payroll's Form 16 Part A and payslips remain owned by Payroll (§1.3); the employee-facing "all my documents" view composes across both at read time in Phase 5 without moving a single row.

### D-5 — Generalise the S3 config; one bucket, prefix-partitioned

`aws-s3.config.js` lives in `src/infrastructure/`, i.e. it is **shared infrastructure that happens to be payroll-named**. Documents use the **same bucket**; separation is by object-key prefix, which is already how payroll partitions (`org/{orgId}/{ownerType}/...`).

Change `aws-s3.config.js` to resolve each value through a fallback chain, preserving today's behaviour exactly:

```
bucket   = process.env.APP_S3_BUCKET || process.env.PAYROLL_S3_BUCKET || null
kmsKeyId = process.env.APP_S3_KMS_KEY_ID || process.env.PAYROLL_S3_KMS_KEY_ID || null
```

and export per-module TTLs (`DOCUMENT_UPLOAD_TTL_SECONDS` / `DOCUMENT_VIEW_TTL_SECONDS`, defaulting to the payroll values). A deployment that sets only `PAYROLL_S3_BUCKET` behaves **byte-identically** to today. The startup warning message is generalised off "Payroll".

**Exit criterion for this change:** with only the current `.env`, payroll attachment upload/view/confirm still work unchanged.

### D-6 — Add `deleteObject` to the provider — and accept that it activates payroll's dormant sweep

Documents require true deletion (retention windows, statutory purge, an employee exercising erasure). The provider has no delete, and [payroll_automation.service.js:327-337](src/modules/payroll/services/payroll_automation.service.js#L327-L337) explicitly probes for one (`typeof s3.deleteObject !== 'function' → return false`), meaning the payroll retention purge has **never actually deleted anything** since it shipped.

Adding `deleteObject` is a small addition to the provider, but it is **not behaviour-neutral**: on the next run, `payroll_attachment_sweeper` will begin hard-deleting soft-`deleted` payroll attachments older than `payroll_attachment_retention_days` (default **2555 days / 7 years**). In practice no row is that old yet, so the real-world blast radius today is zero — but this must be stated, not discovered.

**Binding:** this is a deliberate, documented side effect. It is implemented in **Phase 1** (not Phase 4) so it is verified in isolation rather than alongside the document sweeper, and the payroll sweeper's behaviour change is called out in that phase's completion notes. If the user prefers to keep the payroll sweep dormant, the alternative is a `documentDeleteObject` export used only by this module — noisier, and it leaves a real payroll bug in place. **Recommendation: add the shared `deleteObject`.** See **Open Decision 1**.

### D-7 — Promote the pure storage utilities to `src/common/utilities/`

`attachment_storage.utils.js` is 100% pure, security-critical, and needed verbatim by this module. Duplicating it forks a **security control** — the day someone widens the content-type allow-list in one copy, the other silently disagrees.

Move the functions to `src/common/utilities/object_storage.utils.js` and make `src/modules/payroll/utils/attachment_storage.utils.js` a **one-line re-export**. This is an established project idiom, not an invention: the payroll plan records that its `hierarchy_access` module file is exactly such a re-export.

Extensions the document module needs, added in the shared file:
* `ALLOWED_CONTENT_TYPES` gains **`application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`** and **`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`** — required by "downloadable HR templates" (§1.1 #10) and experience-letter uploads. **`image/svg+xml`, `text/html` and `text/xml` stay excluded forever** (script-capable → stored XSS on the bucket origin).
* Office types are **`attachment`-only**: `buildContentDisposition` must force `attachment` for any non-(pdf/image) type regardless of what the caller asks, so a `.docx` is never rendered inline.
* The effective allow-list for a given upload is `intersection(global allow-list, type.allowed_content_types)` — a type can only **narrow**.

`payroll_attachments` keeps its own narrower list by passing the 4-type set explicitly; widening the shared constant must not silently widen payroll. **This is a test requirement, not a comment.**

### D-8 — Scan-ready, not scan-blind

`scan_status` ∈ `not_scanned` \| `pending` \| `clean` \| `infected` \| `failed`, default `not_scanned`.

With no scanner configured, `not_scanned` is treated as acceptable and the document becomes `available` on verification — identical to today's payroll behaviour, so nothing regresses. When the org setting `document_scan_required = true`, a document cannot leave `pending_verification` until `scan_status = 'clean'`, and `infected` is terminal (object deleted, row `quarantined`, HR notified). The hook point is a single service method; no migration is needed to turn scanning on later.

### D-9 — Employees upload their own documents; the manager doc's "HR only" line is scoped, not overridden

The Manager Panel source says *"Only HR/Admin can add/remove and upload documents"* (line 107), while the Employee Panel source devotes an entire section to employee self-upload. Both are satisfied, because they describe **different planes** (D-2):

* **Employee-owned plane** — the employee uploads their own statutory/personal documents. This is the whole point of Employee Panel M8 §2 and of "self-service uploads reduce paperwork". Gated per type by `employee_can_upload`.
* **Org-issued plane** — appointment letters, contracts, NDAs, policies. **HR only.** No employee and no manager can create one. This is the line the Manager doc is protecting, and it holds absolutely.

The manager doc's line is therefore read as *"within the employee's official personnel file, only HR issues documents"* — which is exactly D-2's split.

### D-10 — Documents are tenant-plane only; `admin` / `super-admin` are excluded

Identical reasoning to Payroll **D-14**, and for stronger reason: this module stores Aadhaar, PAN, medical certificates and signed contracts — the most sensitive PII in the product. `hr` is the top authority **inside** an organization; `admin`/`super-admin` are platform roles operating on the SaaS product, and must not hold standing access to a tenant's personnel files.

* **No document route admits `admin` or `super-admin`.** Route lists are `['hr']` and `['manager','hr']`.
* **`getAccessibleUserIds` returning `null` is not sufficient** to grant global scope — that shared util treats all of `['hr','admin','super-admin']` as global because Attendance and Leave depend on that shape. Documents additionally assert `role === 'hr'`. **Do not narrow `GLOBAL_APPROVER_ROLES`** — it would silently change two other modules.
* **Deliberate inconsistency with Leave**, which still uses `['hr','admin','super-admin']`. Documents match Payroll's stricter list on purpose. Do not "harmonize" it back.
* **Accepted trade — no break-glass.** No impersonation mechanism exists. An org whose only HR user is deactivated has no platform-side recovery path. If break-glass is needed, build a consented, audited impersonation flow in the auth module that issues a tenant-plane `hr` token — never by widening a document role list.

### D-11 — Replacement is versioning; nothing is ever overwritten in place

"View, download, **replace**, or delete" (Manager §2.3) must not mean mutating a stored object. A replace creates a **new row** with `version = previous + 1` and `supersedes_id = previous.id`; the previous row goes `superseded` and keeps its object.

* The object key embeds the **document id**, which is per-version — so two versions can never collide, and a signed URL for v1 keeps resolving v1.
* A stable `document_group_id` identifies the logical document across its versions; v1 sets it to its own id.
* Two partial unique indexes carry the invariant *(corrected 2026-09-22 — see note)*:
  * **One live version per logical document** — `employee_documents`: `UNIQUE (org_id, document_group_id) WHERE status IN ('pending_verification','available','expired') AND deleted_at IS NULL`.
  * **One live document per type per person, for single-instance types** — `employee_documents`: `UNIQUE (org_id, user_id, document_type_id) WHERE allows_multiple = false AND status IN ('pending_verification','available','expired') AND deleted_at IS NULL`.
  * `org_documents`: `UNIQUE (org_id, document_group_id) WHERE status = 'published'`.

  > **Correction.** The original wording said the second index applied "only to types where `allows_multiple = false`", with the flag living on the type table. A Postgres partial-index predicate can only reference columns of **its own table**, so that index was not constructible as written. `allows_multiple` is therefore **snapshotted onto `employee_documents`** at row creation and the flag becomes part of the predicate. Consistent with EC-35, flipping the type's flag later applies to **new uploads only**; existing rows keep the value they were created with.

* **The supersede happens at confirm, not at replace-issue.** A replacement row is born `pending_upload`, which is outside both index predicates, so the previous version stays current until the new object is verified to have landed. An abandoned replace therefore leaves the employee's existing document intact rather than deleting it in exchange for nothing.
* **A superseded version that carried acknowledgments keeps them.** Acknowledgment of v1 does **not** satisfy v2 — republishing a policy resets the acknowledgment requirement (EC-12), which is the entire compliance point.

### D-12 — Confidentiality can only be tightened

`effective_confidential = type.is_confidential OR document.is_confidential`. A document of a non-confidential type may be marked confidential; a document of a confidential type can **never** be made visible. Enforced in the service, expressed as a pure function, and unit-tested — not left to a controller.

A confidential document is invisible to managers entirely (not "visible but locked"): it does not appear in list counts, and a direct fetch by id returns the same `404 DOCUMENT_NOT_FOUND` a non-existent id returns (§6 uniform-denial table). Only the subject and `hr` ever see it.

### D-13 — Acknowledgment now; external e-signature pluggable

The requirement asks for "secure e-signature capability" **and** "acknowledgment tracking … with audit trail (timestamp, IP, user ID)". The second is fully deliverable today and is what actually creates the compliance record. We ship:

* **Acknowledgment** — an explicit affirmative act recorded in `document_acknowledgements` with `acknowledged_at`, `ip_address`, `user_agent`, and — critically — **`document_version` and `content_checksum`**, so the record proves *which bytes* were acknowledged. Without the checksum the audit trail is not evidence.
* **Internal typed signature** — `document_signature_requests.provider = 'internal_typed'`: the signer types their full legal name, which is stored alongside the same evidence bundle plus a server-generated `signature_evidence` JSONB (name typed, consent text version, timestamp, IP, UA, document checksum).
* **External providers** — `provider ∈ { internal_typed, docusign, adobe_sign }`. The latter two **validate but return `503 SIGNATURE_PROVIDER_UNAVAILABLE`** until a vendor is chosen and integrated. This is Payroll **D-9**'s pluggable-source pattern: no hard dependency, no schema change later.

**We do not claim these are equivalent.** A typed acknowledgment is strong evidence of assent; it is not a certificate-backed digital signature. Documents requiring the latter must wait for an external provider, and `document_types.requires_signature` is how an org marks them.

### D-14 — Recipients are materialised at publish, topped up on join

"Acknowledgment tracking" is meaningless against a moving population. When an org document is **published**, its targeting rules (all / departments / locations / employment types / explicit include / explicit exclude — the `attendance_holidays` targeting precedent) are **resolved once** into `org_document_recipients` rows.

* Resolution is a **snapshot**: the targeting JSON is also frozen onto the document, so "who was this published to?" is answerable forever.
* **New joiners** who match the frozen targeting are topped up by a daily cron (and by an on-join hook in Phase 5). Top-up **only inserts**; it never removes a recipient, because removing one would erase an acknowledgment record.
* A departed employee's recipient row is marked `waived` with a reason, never deleted — compliance reporting must still show "3 of 50 never acknowledged, 1 waived on exit".
* Publish-time resolution runs inside the publish transaction, batched. For very large orgs this is the one place a publish can be slow; it is explicitly performance-tested (§8).

### D-15 — Hierarchy-scoped maker–checker, deliberately thin

Managers are first-class actors over their direct reports (the project's standing position, and Payroll **D-13**), but documents carry far fewer financially-binding acts than payroll. The tiering is therefore intentionally minimal — three tiers, **two** Tier-B actions:

* **Tier A — Manager-authoritative (direct reports only).** View a report's non-confidential documents where `type.manager_can_view = true`; see their expiry/acknowledgment compliance status; **raise a document request** for a type where `manager_can_request = true`; upload on behalf of a report in those types; nudge a pending request or acknowledgment.
* **Tier B — Manager proposes → HR approves.** (1) **Verification** of an employee-uploaded document — a compliance assertion, so a manager *recommends* and HR decides. (2) **Issuing an org document to a report** (e.g. a promotion letter) — a manager *drafts*, HR publishes. Both use the uniform quartet on the existing tables — `status`, `proposed_by`, `approved_by`, `actioned_at`, plus `rejection_reason`. **No new generic approval table.**
* **Tier C — HR-exclusive.** Type catalog, org-document publish/retire, templates, signature requests, confidential types, retention configuration, org-wide bulk export, and any access to a confidential document.

Scope is re-verified **at approval time**, not only at proposal time, in case the reporting mapping changed (EC-19). The org setting `manager_direct_document_authority` (default **OFF**) lets HR grant a manager direct Tier-B effect, mirroring payroll's equivalent.

### D-16 — Notifications are a queue-and-drain outbox; email only in this module

"HR gets **real-time** notifications for new uploads" is delivered as the project's existing outbox pattern, because that is the only notification mechanism the codebase has: **no in-app notification table and no WebSocket exist.**

`document_notifications` holds `(org_id, user_id, document_id, notification_type, channel, status, scheduled_for, sent_at, attempts, last_error)`. A cron drains it **outside any transaction** — exactly [payslip_email_dispatch.cron.js](src/cron-jobs/payslip_email_dispatch.cron.js). Consequences:

* **A notification failure can never fail or roll back a document operation.** Enqueue is inside the transaction; sending is not.
* Idempotency via a partial unique index on `(document_id, user_id, notification_type, scheduled_for)` so a double-fire sends once.
* **SMS is deferred.** `sms.utils.js` exists but no module wires it to notifications; adding a second channel is a cross-cutting concern, not a document concern. The `channel` column is present so it is a config change later.
* A future in-app notification module reads this table; it is named neutrally for that reason.

### D-17 — The Leave `document_url` bridge is Phase 5, opt-in, and non-breaking

`leave_requests.document_url` is a `STRING(255)` URI validated by `Joi.string().uri()`, and `leave_types.requires_document_threshold` enforces its presence. It is the only pre-existing document pointer outside payroll.

**Phases 1–4 do not touch Leave at all.** In Phase 5 we add an *additive* capability: the leave application accepts an optional `document_id` referencing an `employee_documents` row the caller owns; the service resolves it and populates `document_url` with a stable internal reference. Existing callers passing a raw URL continue to work unchanged.

Because this changes an existing API's accepted request shape, it **requires a dated change record in `public/md_updates/`** per `CLAUDE.md`. Flagged here so it is not discovered at review time.

### D-18 — Exit-date facts come from `employee_exits`, not from a profile column

`employee_profiles` has **no `exit_date`** (the payroll plan records the same gap for Form 16). Offboarding document archival and recipient waiving therefore read `employee_exits` (created by payroll Phase 7) via its **repository**, never by importing the model directly, and degrade gracefully when no exit record exists (treat as active). Cross-module reads go through repositories — the established idiom.

### D-19 — Zero new dependencies

Everything required is installed: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (storage), `@aws-sdk/client-ses` (email), `joi`, `dayjs`, `node-cron`, `sequelize`, `uuid`. CSV exports are **hand-written** (the payroll precedent; `csv_writer.utils.js` already exists in payroll and its pure logic can be promoted if a second consumer justifies it). `pdfkit` is present if a signed-document cover sheet is ever wanted — **not planned**.

### D-20 — Storage is never the source of truth for authorization

Every read path resolves authority **from the database row** and only then issues a short-lived pre-signed URL. Binding rules:

* `storage_key` is **never** returned by an API, logged, or written into an audit row (the payroll §10.6 rule).
* View URLs are short-lived (default 300s) and **single-purpose**: the `Content-Disposition` and `Content-Type` are pinned server-side at signing time.
* A URL, once issued, cannot be revoked before expiry. Therefore **the TTL is the revocation window**, and `document_view_url_ttl_seconds` is an org setting with a hard cap. Every issuance is audit-logged with the actor, so post-hoc attribution always exists.
* Bucket-level controls (Block Public Access, SSE-KMS, versioning) are **deployment** requirements, listed in §12 as ops hand-back items — the application cannot enforce them.

---

## 4. Data Model Overview

All tables: UUID PK, `org_id` NOT NULL with FK → `organizations` (CASCADE), `created_at`/`updated_at`, `underscored: true`, and `paranoid` where records are user-authored. Migration **`00049-create-document-module.js`** creates the Phase-1 set; later phases add their own numbered migrations.

**Phase 1 — Foundation**
`document_type_catalog` (system) · `document_types` · `employee_documents` · `document_audit_logs` · `document_settings` (org singleton)

**Phase 2 — Org-issued documents & distribution**
`org_documents` · `org_document_recipients`

**Phase 3 — Acknowledgment & signature**
`document_acknowledgements` · `document_signature_requests`

**Phase 4 — Compliance & reminders**
`document_requests` · `document_notifications`

**Phase 5 — Templates, reporting & archive**
`document_templates` · `document_export_jobs`

### 4.1 Key structural notes

* **`employee_documents`** — the storage core. Carries the S3 quartet from the payroll precedent (`storage_backend`, `storage_key`, `content_type`, `size_bytes`, `checksum_sha256`) plus the document-specific spine: `document_type_id`, `user_id` (the subject — **the scoping key for every read**), `title`, `document_number` (masked on read, §4.1 below), `issued_on`, `expires_on`, `status`, `scan_status`, `version`, `supersedes_id`, `is_confidential`, `uploaded_by`, `verified_by`, `verified_at`, `rejection_reason`, `source` (`self_upload`\|`hr_upload`\|`manager_upload`\|`onboarding`\|`migrated`), and the D-15 quartet for manager-proposed verification.
  * `status` ∈ `pending_upload` → `pending_verification` → `available` → (`expired` \| `superseded` \| `rejected` \| `quarantined` \| `archived`). A row is born `pending_upload` and only leaves it once HeadObject proves the object landed — an abandoned pre-signed upload is **inert**, never a document that "looks filed".
  * **Every reader filters `status IN ('available','expired')`** (and `expired` only where the caller explicitly asks). A `pending_*` row is a 404 for everyone except its own subject's "in progress" view, mirroring how payroll treats `pending`.
* **`document_number`** (Aadhaar/PAN/licence number) is **masked to the last 4 characters on every read** and never appears in a list projection — the `employee_bank_accounts` precedent. It is stored for expiry/duplicate detection only.
* **`org_documents`** — `document_group_id` (stable across versions), `document_type_id`, `title`, `description`, `status` (`draft`→`published`→`retired`), `version`, `supersedes_id`, `effective_from`, `effective_to`, `targeting` (frozen JSONB), `requires_acknowledgement`, `acknowledgement_due_days`, `requires_signature`, `published_by`, `published_at`, the storage quartet, and the D-15 quartet for manager-drafted documents.
* **`org_document_recipients`** — `(org_document_id, user_id)` unique; `state` ∈ `pending` \| `viewed` \| `acknowledged` \| `signed` \| `waived`; `first_viewed_at`, `due_on`, `waived_reason`. This is what makes "3 of 50 pending" a query rather than a guess.
* **`document_acknowledgements`** — append-only, **not paranoid**, carrying `document_version` and `content_checksum` (D-13). An acknowledgment is evidence; evidence is not soft-deletable.
* **`document_audit_logs`** — the `payroll_audit_logs` schema verbatim (append-only, not paranoid, `proposed_by`/`approved_by` as real columns), written **inside the same transaction** as every change. This is the module's compliance backbone and the fix for the unwired `attendance_audit_logs` precedent.
* **`document_settings`** — org singleton via `getOrCreate(orgId)`, holding the §11 knobs.
* **Indexes.** `(org_id, user_id, status)`, `(org_id, document_type_id, status)`, `(org_id, expires_on) WHERE status = 'available' AND expires_on IS NOT NULL` (the expiry cron's only scan), `(org_id, document_group_id)`, `(org_document_id, state)`. Every predicate carries `org_id`.
* **Polymorphism is avoided.** Unlike `payroll_attachments`, these tables have real FKs. Acknowledgments and signatures reference `org_document_id` **or** `employee_document_id` as two nullable FKs with a CHECK enforcing exactly one — typed and index-friendly, rather than an untyped `owner_id`.

---

## 5. Storage & Upload Contract

This mirrors the verified payroll flow exactly. The binary **never transits the Node process**.

```
1. POST  …/documents        → server validates type + content-type + size,
                              inserts row `pending_upload`,
                              signs a PUT, returns { document_id, upload_url,
                              expires_at, required_headers }        [one transaction]
2. PUT   <upload_url>       → client uploads DIRECT to S3           [no server involvement]
3. POST  …/documents/:id/confirm
                            → HeadObject (3s timeout, no retry, OUTSIDE any transaction)
                              verify size == declared AND type == declared AND type on allow-list
                              → row → `pending_verification` (or `available` if the
                                type does not require verification)   [row-locked transaction]
4. GET   …/documents/:id/view-url
                            → resolve authority from the DB, then sign a short-lived GET
                              with server-pinned Content-Type + Content-Disposition
```

**Non-negotiables, each already proven in payroll:**

* **The object key is built only from server-owned ids** — `org/{orgId}/documents/{plane}/{subjectOrGroupId}/{documentId}`. `file_name` is **never** a path component; it is a traversal vector and is not even read by the key builder.
* **Content-type is enforced at three points**, each alone defeatable: the Joi schema, the signed `Content-Type` on the PUT, and `confirmUpload`'s HeadObject comparison. A declared-vs-landed mismatch is `422 DOCUMENT_VERIFICATION_FAILED` and the row **stays** `pending_upload`.
* **Size is enforced at three points**: Joi (`max_file_size_bytes` from the type), the signed `Content-Length`, and the HeadObject comparison.
* **`confirmUpload` is idempotent and retry-safe** — a second confirm of an already-confirmed row is a no-op; two concurrent confirms serialise under a `FOR UPDATE` row lock.
* **An S3 failure is never a document failure**: `503 DOCUMENT_STORAGE_UNAVAILABLE` with **no state change**.
* **A `reference` backend** (https-only, `isSafeReferenceUrl`) supports externally-hosted documents — a policy PDF on the corporate site. Born `available`; no object to confirm.
* **Checksum** comes from a single-part ETag only (no `-N` multipart suffix); NULL otherwise. The checksum is what `document_acknowledgements.content_checksum` pins.

---

## 6. RBAC Surface

"Manager" always means **scoped to direct reports** via `getAccessibleUserIds`. Tiers refer to **D-15**. The **HR** column is the tenant-plane `hr` role; platform `admin`/`super-admin` appear nowhere in this table and hold **no** document capability (**D-10**).

| Capability | Tier | Employee | Manager (direct reports) | HR (tenant) |
|---|:--:|:--:|:--:|:--:|
| Upload / view / replace / delete **my own** documents | — | ✅ *(per type flags)* | ✅ | ✅ |
| View / acknowledge / sign **org documents addressed to me** | — | ✅ | ✅ | ✅ |
| See **my own** expiry + pending-acknowledgment status | — | ✅ | ✅ | ✅ |
| Download HR templates | — | ✅ | ✅ | ✅ |
| View a **direct report's** non-confidential documents | A | ❌ | ✅ *(`manager_can_view`, org-toggleable)* | ✅ |
| View **team** compliance status (who is missing/expiring) | A | ❌ | ✅ | ✅ |
| Raise a **document request** to a direct report | A | ❌ | ✅ *(`manager_can_request` types)* | ✅ |
| Upload a document **on behalf of** a direct report | A | ❌ | ✅ *(`manager_can_request` types; `source='manager_upload'`)* | ✅ |
| **Recommend** verification / rejection of a report's document | B | ❌ | ✅ *(HR decides)* | ✅ |
| **Draft** an org document addressed to a direct report | B | ❌ | ✅ *(HR publishes)* | ✅ |
| Approve Tier-B proposals | B | ❌ | ❌ *(unless `manager_direct_document_authority` ON)* | ✅ |
| Any access to a **confidential** document | C | ❌ *(unless subject)* | ❌ | ✅ |
| Type catalog CRUD; retention & settings | C | ❌ | ❌ | ✅ |
| Create / publish / retire **org documents**; templates | C | ❌ | ❌ | ✅ |
| Create signature requests | C | ❌ | ❌ | ✅ |
| Org-wide compliance reports & bulk export | C | ❌ | ❌ | ✅ |
| Hard-delete / archive on exit | C | ❌ | ❌ | ✅ |

**Every** manager-facing endpoint (read *or* propose) must call `getAccessibleUserIds` and reject out-of-scope ids **before** any existence lookup, so the denial is identical for "not yours" and "doesn't exist" (no enumeration) — the pattern established in `leave_approver.controller.js` and `attachment_authority.utils.js`. A Tier-B proposal re-verifies scope **at approval time** (EC-19).

**Uniform denial codes *(added 2026-09-22)*.** The denial code is fixed **per addressing mode**, not per reason, or the codes themselves become the oracle:

| Endpoint shape | Every denial returns | Covers |
|---|---|---|
| `…/manager/documents/:id` — addressed by **document id** | `404 DOCUMENT_NOT_FOUND` | non-existent · cross-org · out-of-scope subject · confidential · non-visible status |
| `…/manager/employees/:userId/…` — addressed by **user id** | `403 FORBIDDEN` | non-existent user · cross-org user · not a direct report |
| `…/me/documents/:id` — self plane | `404 DOCUMENT_NOT_FOUND` | non-existent · cross-org · not the caller's |

> **Why this corrects EC-8/EC-9 as originally written.** They specified `404` for a confidential document but `403` for a non-report's document. Since a non-existent id must also answer something, the pair leaked: a `403` would have proven the document exists and is in the manager's team, and a `404` would have separated "confidential" from "not yours". Fixing the code per *addressing mode* removes both inferences. This is stricter than payroll's `attachment_authority.utils`, which mixes `404` (non-available) and `403` (out-of-scope) within one audience; documents carry Aadhaar/PAN-grade PII, so the stricter rule is taken deliberately and must not be "harmonized" back.

**Authority is a pure function.** `document_authority.utils.js` exports two DB-free functions mirroring `attachment_authority.utils.js`:
* `screenDocument({ audience, status, scanStatus, effectiveConfidential })` → terminal deny or `{ needsSubject: true }`. Screens out non-`available` rows (404 for everyone) and refuses a **manager** any confidential document **before the subject is loaded**, so the response is identical whether or not the id exists (D-12).
* `resolveDocumentAuthority({ audience, subjectUserId, actorUserId, accessibleUserIds, typeFlags, recipientUserIds })` → `{ allowed }` or a typed deny.

Both are unit-tested without a database. **Widening either reverses a binding decision** and must be accompanied by an amendment to this file.

---

## 7. Document Lifecycle

### 7.1 Employee-owned document

```
        ┌──────────────┐  confirm (HeadObject OK)   ┌───────────────────────┐
        │ pending_     │ ─────────────────────────▶ │ pending_verification  │
        │ upload       │                            └───────────┬───────────┘
        └──────┬───────┘                        HR verify │      │ HR reject
               │ abandoned > 24h                          ▼      ▼
               │ (sweeper: object + row)            ┌───────────┐ ┌──────────┐
               ▼                                    │ available │ │ rejected │
            (gone)                                  └─────┬─────┘ └──────────┘
                                                          │
                    expires_on passes ──────────────▶ ┌─────────┐
                                                      │ expired │
                    replaced (new version) ─────────▶ ┌────────────┐
                                                      │ superseded │
                    scan finds malware ─────────────▶ ┌─────────────┐
                                                      │ quarantined │
                    subject exits + archive ────────▶ ┌──────────┐
                                                      │ archived │
```

* Types with `requires_verification = false` go `pending_upload → available` directly on confirm.
* **The subject may delete only while `pending_verification`.** Once `available`, deletion is HR-only — an employee must not be able to erase a verified statutory record. Delete is soft (`status='deleted'` + `deleted_at`); the object survives until the retention sweeper, so an accidental deletion is recoverable.
* `expired` is a **derived-then-persisted** state: the daily cron flips it, and every read also treats `expires_on < today` as expired so a missed cron run is never a compliance false-negative.

### 7.2 Org-issued document

```
draft ──(HR publish: resolve targeting → materialise recipients,
         freeze targeting JSONB, enqueue notifications)──▶ published
                                                              │
                        ┌─────────────────────────────────────┤
                        │ new version published               │ HR retire
                        ▼                                     ▼
                   superseded                              retired
```

* `draft` is invisible to every non-HR actor (a manager sees only their own Tier-B drafts).
* **Publishing is transactional**: recipient materialisation, the frozen targeting snapshot, the audit row and the notification enqueue all commit together or not at all. Only the *sending* happens outside (D-16).
* **Retiring does not delete recipients or acknowledgments** — the compliance record of who acknowledged the old policy must survive the policy.

---

## 8. Cross-Cutting Requirements

* **Multi-tenancy.** `org_id` in every predicate, every index, every FK. No exceptions. A cross-org id is loaded as `null` and denied identically to a non-existent one.
* **Transactions.** Unmanaged only — `const t = await db.sequelize.transaction()` … `commit()`/`rollback()`, with `if (!t.finished) await t.rollback()` in the catch. Every state change writes its audit row **inside the same transaction**. Network I/O (S3 signing is local; HeadObject and SES are not) **never** happens inside a transaction that holds row locks.
* **Concurrency.** Two concurrent confirms, two concurrent replaces, two concurrent acknowledgments of one document must each resolve to one outcome. Replaces take `pg_advisory_xact_lock(hashtext(...))` **before** row locks, matching the existing lock-ordering convention; confirms and acknowledgments use `FOR UPDATE` on their own row.
* **Idempotency.** Confirm, acknowledge, sign and publish are all idempotent. A client retry after a timeout must never create a second version, a second acknowledgment, or a duplicate recipient set.
* **Partial failure.** A publish to 2,000 recipients must not be all-or-nothing at the HTTP layer: recipients are materialised in batches inside one transaction; if the transaction is too large for the org, the publish returns `202` and completes via the same worker used by the top-up cron. **Threshold is an org setting, measured in Phase 5** — do not guess it in Phase 2.
* **PII & secrecy.** `storage_key` never leaves the service layer. `document_number` is masked to last-4 on read and absent from list projections. Error messages never disclose whether a document exists. Audit rows never carry the key or the raw document number.
* **Immutability.** `document_audit_logs`, `document_acknowledgements` and the signature evidence bundle are append-only and **not paranoid** — the absence of a `deleted_at` and of any repository delete method is the enforcement.
* **Performance targets** (measured in Phase 5, not assumed): an employee's document list is one query plus one batched type join; a team compliance view for 200 reports is O(number of source tables), not O(employees); the expiry cron scans only the partial index; publish to 5,000 recipients completes within the agreed budget.

---

## 9. Phases

> **Rule (inherited from Leave and Payroll): no phase begins until the previous one is tested and verified.**

### Phase 1 — Foundation: type catalog, storage core, employee documents

**Goal.** Stand the module up and make employee document upload/verify/replace/delete correct and secure, before anything is distributed or acknowledged.

**Scope.**
* Migration `00049-create-document-module.js`; register `modules/document/models` in `MODEL_ROOTS`; create `document.index.js` and mount it in [app.js](src/app.js); seeder `008-seed-document-feature.js` (`documents.access` + plan-feature mapping, following `007`).
* **Infrastructure (D-5, D-6, D-7):** generalise `aws-s3.config.js` with the fallback env chain; add `deleteObject` to the provider; promote the pure storage utils to `src/common/utilities/object_storage.utils.js` and leave a one-line re-export in payroll.
* `document_type_catalog` seeded platform-wide with the official type set; HR **browses and activates** what the org needs, and may define custom types (D-3).
* `employee_documents` full lifecycle: issue upload URL → confirm → verify/reject → replace (versioned) → soft-delete → view-url.
* `document_audit_logs` + repository, **wired from the first write**.
* `document_settings` singleton.
* `document_authority.utils.js` (pure) + the module's storage wrapper.
* Self routes (own documents), HR routes (any subject + catalog CRUD), Manager routes (scoped read + on-behalf upload + Tier-B verification recommendation).
* **Tests:** `tests/unit/document/` — authority matrix, key building, content-type/size gates, confidentiality tightening, version resolution, masking.

**Exit criteria.** An employee uploads a PAN card and sees it `pending_verification`; HR verifies it and it becomes `available`; the employee **cannot** delete it once verified but **can** while pending; a replace produces v2 and leaves v1 `superseded` with its object intact; a manager sees a direct report's non-confidential document and gets an **identical 404** for a confidential one and for a fabricated id; a manager gets `403` for a non-report (verified by id substitution); an abandoned pre-signed upload never appears in any list; `storage_key` appears in **no** response, log or audit row; payroll attachment upload/view/confirm still pass their existing tests unchanged (D-5/D-7 regression gate).

### Phase 2 — Org-issued documents & distribution

**Goal.** The Employee Panel's headline surface — *"My HR Documents"* with appointment letters, contracts, NDAs and policies.

**Scope.**
* `org_documents` + `org_document_recipients`; draft → publish → supersede → retire.
* Targeting resolution (all / departments / locations / employment types / include / exclude), replicating the `attendance_holidays` targeting semantics and **always** keying on `department_id`, never the free-text `department`.
* Frozen targeting snapshot; batched recipient materialisation inside the publish transaction (D-14).
* Employee read: "My HR Documents" — the **read-side composer** merging own `employee_documents` and addressed `org_documents` into one list with a uniform shape.
* Manager Tier-B: draft an org document for a direct report; HR publishes.
* Versioning of policies with supersede semantics.

**Integration.** `organization_departments` / `organization_locations` for targeting; `employee_profiles.department_id` / `location_id` / employment type for matching.

**Exit criteria.** A policy published to "Engineering + Sales" materialises exactly the right recipients and no others; an employee in Finance cannot see it by id (404, identical to non-existent); publishing v2 of a policy supersedes v1 while v1's history survives; a retired document stays visible in history but is not actionable; targeting an empty department publishes cleanly with zero recipients rather than failing.

### Phase 3 — Acknowledgment & signature

**Goal.** The compliance half — "acknowledgment tracking for policy compliance" with a legally-usable audit trail.

**Scope.**
* `document_acknowledgements` (append-only; `document_version` + `content_checksum` + IP + user-agent + timestamp).
* Acknowledgment flow with due dates from `acknowledgement_due_days`; recipient `state` transitions (`pending → viewed → acknowledged`).
* `document_signature_requests` with `provider ∈ { internal_typed, docusign, adobe_sign }`; **internal typed signature implemented**, external providers validate and return `503 SIGNATURE_PROVIDER_UNAVAILABLE` (D-13).
* HR compliance view: per-document acknowledgment matrix, pending list, export.
* Manager Tier-A view: which of my reports have not acknowledged what.

**Exit criteria.** An acknowledgment records the exact version and checksum acknowledged; acknowledging v1 does **not** satisfy v2 after a republish (EC-12); a double-submit creates exactly one acknowledgment; an acknowledgment cannot be deleted or edited by anyone, including HR; a signature request against `docusign` validates its payload and returns `503` with no state change; a non-recipient cannot acknowledge (403, checked before existence).

### Phase 4 — Compliance engine: expiry, requests & reminders

**Goal.** "Automated document reminders" and the required-document checklist that makes onboarding compliance real.

**Scope.**
* `document_requests` — HR or manager asks an employee for a document by a due date; status `open → fulfilled → cancelled → overdue`; links to the uploaded document on fulfilment.
* Required-document checklist per employee, derived from `type.is_mandatory` + `mandatory_for` matched against the employee's profile; onboarding completeness percentage.
* Expiry engine: daily cron flips `available → expired`; read paths also treat `expires_on < today` as expired so a missed run is never a false-negative.
* `document_notifications` outbox + drain cron (D-16): new-upload notice to HR, expiry reminders at `expiry_reminder_days`, pending-acknowledgment reminders, overdue-request reminders.
* Email templates registered in `TEMPLATE_MAP`; **linux-guarded** cron registration in `server.js`; `runStartupCatchUp()`; manual HR trigger endpoints for every cron (the payroll/leave pattern).
* Retention sweeper: abandoned `pending_upload` rows > 24h (object + row), and soft-deleted rows past `type.retention_days`. **Statutory types are excluded unconditionally**, mirroring payroll's `form16_part_a` exclusion.

**Exit criteria.** An Aadhaar expiring in 30 days produces exactly one reminder per configured interval and never a duplicate on a same-day double-fire; a missed cron day does not lose a reminder *and* does not send a stale one; a fulfilled request closes automatically on upload; a statutory document is never swept; the expiry cron's query uses only the partial index (verified by `EXPLAIN`); disabling notifications in settings stops sending without stopping state transitions.

### Phase 5 — Templates, reporting, integration & hardening

**Goal.** Make it survive real audits and real orgs.

**Scope.**
* `document_templates` — HR-provided downloadable forms (reimbursement form, leave application format); versioned; type-gated.
* Search & reporting: metadata search (name, type, tags, owner, date ranges); compliance reports (missing mandatory documents, expiring in N days, acknowledgment status); CSV export (hand-written, D-19); `document_export_jobs` auditing who exported what.
* **Offboarding archive** (Manager §2.2): on employee exit, bulk-archive their documents, waive open recipient rows with a reason, and produce an exit document pack. Exit dates via the `employee_exits` repository (D-18).
* **Leave bridge (D-17):** optional `document_id` on leave application → resolved into `document_url`. **Requires a dated `md_updates` change record.**
* Employee-facing composed view extended to surface payroll-owned documents (payslips, Form 16) **read-only, by delegation** — no rows move (§1.3).
* On-join hook for recipient top-up (complementing the Phase-4 cron).
* Full **edge-case regression** (§10), performance measurement against §8's targets, and a **security pass** focused on IDOR, confidentiality leakage, signed-URL scope, and content-type bypass.
* Documentation close-out: `api_registry.md`, `org_settings_registry.md`, `combined_api_analysis.md`, phase completion report.

**Exit criteria.** Every edge case in §10 has a test or a documented, deliberate decision; the performance targets in §8 are measured and met; the security pass finds no document leak across tenant, hierarchy or confidentiality boundaries; the Leave bridge is additive and every existing leave test still passes.

---

## 10. Edge Case Register

Each must be resolved by an explicit, tested decision — not left to chance.

| # | Edge case | Phase |
|---|---|:--:|
| EC-1 | Pre-signed upload issued, client never uploads → row must stay invisible and be swept, never counted as "filed" | 1 / 4 |
| EC-2 | Declared `application/pdf`, uploads `image/svg+xml` → HeadObject mismatch → `422`, row stays `pending_upload` | 1 |
| EC-3 | `file_name` containing `../`, NUL, CRLF or a quote → never a path component; sanitised only for `Content-Disposition` | 1 |
| EC-4 | File larger than the type limit → rejected at Joi, at the signed `Content-Length`, and at HeadObject | 1 |
| EC-5 | Two concurrent confirms of one document → serialise under `FOR UPDATE`; exactly one transition | 1 |
| EC-6 | Two concurrent replaces → advisory lock; exactly one v2, never two rows claiming current | 1 |
| EC-7 | Employee tries to delete a **verified** statutory document → `403`; only HR may remove it | 1 |
| EC-8 | Manager fetches a confidential document by id → `404 DOCUMENT_NOT_FOUND`, byte-identical to a non-existent id (§6 uniform-denial table) | 1 |
| EC-9 | Manager fetches a **non-report's** document by id → the same `404`; by `:userId` → `403 FORBIDDEN`. Scope checked **before** existence in both | 1 |
| EC-10 | Cross-org document id → loaded as `null`, denied identically to non-existent | 1 |
| EC-11 | Type deactivated while documents and open requests reference it → soft-deactivate; blocked if open requests exist | 1 |
| EC-12 | Policy republished as v2 → v1 acknowledgments do **not** satisfy v2; recipients return to `pending` | 3 |
| EC-13 | Employee joins **after** a policy was published → topped up by the join hook / daily cron; never retroactively marked non-compliant before their join date | 2 / 4 |
| EC-14 | Employee exits with unacknowledged policies → recipient rows `waived` with reason, never deleted | 5 |
| EC-15 | Targeting resolves to zero recipients → publish succeeds with a warning, not an error | 2 |
| EC-16 | Publish to 5,000 recipients → batched inside the transaction; above the threshold, `202` + worker completion | 2 / 5 |
| EC-17 | Expiry cron does not run (missed day, non-linux host) → read paths also derive expiry; no compliance false-negative | 4 |
| EC-18 | Same-day double-fire of a reminder cron (multi-instance deploy) → partial unique index sends exactly once | 4 |
| EC-19 | Tier-B proposal whose subject stops reporting to the proposer before approval → scope re-checked at approval; stale proposal blocked | 1 / 2 |
| EC-20 | `manager_direct_document_authority` ON → manager Tier-B takes effect immediately, still fully audited with both actor ids | 1 |
| EC-21 | S3 outage during upload-url issue / confirm / view → `503`, **no state change**, retry-safe | 1 |
| EC-22 | Signed view URL shared externally → short TTL is the revocation window; every issuance audit-logged with actor (D-20) | 1 |
| EC-23 | `reference`-backend document with a `javascript:` or `data:` URL → rejected; https-only, enforced at schema **and** service | 1 |
| EC-24 | Duplicate upload of the same type for a single-instance type → partial unique index; caller must replace, not add | 1 |
| EC-25 | Document with `expires_on` in the past at upload time → accepted but immediately `expired`, surfaced as non-compliant rather than silently valid | 1 / 4 |
| EC-26 | Malware scanning enabled mid-flight with existing `not_scanned` documents → grandfathered; the gate applies to new uploads only | 4 |
| EC-27 | `document_number` (Aadhaar/PAN) leaking into a list response, log or audit row → masked to last-4; absent from list projections | 1 |
| EC-28 | Retention purge of a statutory document → excluded unconditionally, mirroring payroll's `form16_part_a` | 4 |
| EC-29 | Object delete fails during purge → pointer row **kept** for the next pass; an object is never orphaned behind a dead pointer | 4 |
| EC-30 | Employee soft-deleted while holding open document requests and pending acknowledgments → requests cancelled, recipients waived, documents archived | 5 |
| EC-31 | Notification send fails (SES down) → retried by the drain cron; **never** rolls back or blocks the document operation | 4 |
| EC-32 | Acknowledgment attempted by a non-recipient → `403`, checked before existence | 3 |
| EC-33 | External signature provider selected but unintegrated → validates, returns `503`, **no** partial state | 3 |
| EC-34 | Leave application passing both a raw `document_url` and a `document_id` → explicit precedence rule, documented in the `md_updates` record | 5 |
| EC-35 | Type `allowed_content_types` widened/narrowed after documents exist → applies to new uploads only; existing documents stay readable | 1 |
| EC-36 | Org document targeting a department that is later deleted → frozen targeting snapshot keeps the publish record intelligible | 2 |

---

## 11. Org Settings To Register

Add to `public/md_settings/org_settings_registry.md` as a new `## Document Module` section, numbered from **#58** (the file currently ends at #57), using that file's exact field structure. Register each **in the phase that introduces it**, not retroactively.

| Setting | Phase |
|---|:--:|
| `manager_can_view_team_documents` (**default ON**, D-15) | 1 |
| `manager_direct_document_authority` — manager Tier-B takes effect without an HR checker (**default OFF**) | 1 |
| `document_require_separate_checker` — Tier-B approver ≠ proposer (**default OFF**) | 1 |
| `document_view_url_ttl_seconds` + `document_upload_url_ttl_seconds` (with hard caps, D-20) | 1 |
| `document_max_file_size_bytes` — org ceiling; a type may only narrow it | 1 |
| `document_scan_required` (**default OFF**, D-8) | 1 |
| Default retention window per plane (`document_retention_days`) | 1 |
| `employee_can_delete_verified_documents` (**default OFF**, D-15/EC-7) | 1 |
| Acknowledgment due-days default; whether acknowledgment is blocking | 3 |
| Signature provider selection (`internal_typed` \| `docusign` \| `adobe_sign`) | 3 |
| Expiry reminder schedule (days-before list) | 4 |
| Notification toggles per event (new upload to HR, expiry, pending acknowledgment, overdue request) | 4 |
| `document_request_default_due_days` | 4 |
| Onboarding mandatory-document set and completeness threshold | 4 |
| Bulk-publish recipient threshold (sync vs. `202` + worker) | 5 |
| Offboarding archive policy (archive vs. retain-in-place; exit pack contents) | 5 |

---

## 12. Testing & Verification Requirements

**Runner.** `node --test` is already established — `npm test` runs `tests/unit/**/*.test.js`, with **93 existing test files**. Document tests go in `tests/unit/document/`. Follow the payroll convention: pure functions are tested **without a database**.

**Mandatory unit coverage (every one of these is a pure function by design):**
* `document_authority.utils` — the full audience × status × confidentiality × scope matrix, including the "out-of-scope is byte-identical to non-existent" property.
* `object_storage.utils` — key building (traversal, NUL, separator rejection), content-type allow-list, the office-types-are-attachment-only rule (D-7), reference-URL scheme gate, file-name sanitisation, `Content-Disposition` construction.
* **Allow-list isolation (D-7):** a test asserting that widening the shared allow-list does **not** widen `payroll_attachments`.
* Confidentiality resolution — tighten-only (D-12).
* Version/supersede resolution and the one-current-version invariant.
* Targeting resolution against a fixture population (departments, locations, employment types, include/exclude), including the zero-recipient case.
* Expiry derivation — including the missed-cron path (EC-17).
* `document_number` masking.
* Notification idempotency keys.

**Integration/behavioural verification per phase** is defined by that phase's **exit criteria** (§9). Each must be demonstrated, not asserted.

**Security verification (Phase 5, and spot-checked each phase):**
* **IDOR sweep by id substitution** on every `:id` endpoint, across all three audiences.
* Confidentiality leak sweep — list counts, aggregate endpoints and error messages must not reveal a confidential document's existence.
* Content-type bypass attempt: declare `application/pdf`, upload HTML/SVG, confirm → must fail.
* `storage_key` grep across responses, logs and audit rows → must be absent.
* Signed-URL scope: a URL for document A must not resolve document B; TTL respected.

**Explicit non-claim:** per `CLAUDE.md`, nothing in this module may be reported as verified without having actually been run. **Migrations are handed back to the user to run** — the DB is remote and this plan assumes no direct DB access. Static verification + unit tests are the pre-hand-back gate.

**Ops hand-back items (the application cannot enforce these — D-20):**
1. Run migration `00049` (and later phase migrations) and the `008` seeder.
2. S3 bucket: **Block Public Access ON**, **SSE-KMS**, **versioning ON** (versioning is what makes soft-delete recoverable), lifecycle rules aligned with `retention_days`.
3. Set `APP_S3_BUCKET` (or leave `PAYROLL_S3_BUCKET` — the fallback chain handles it, D-5).
4. CORS on the bucket must allow `PUT` from the app origins, or direct upload fails in the browser.
5. Confirm the IAM role grants `s3:DeleteObject` before D-6's `deleteObject` is relied on.

---

## 13. Open Decisions — Needed Before the Relevant Phase

1. **`deleteObject` on the shared provider (D-6).** Adding it activates payroll's dormant retention sweep. Recommended: **add it** (it fixes a real payroll bug; today's blast radius is zero because no row is 7 years old). Alternative: a document-only delete export. **Confirm before Phase 1.**
2. **Promoting the storage utils to `src/common/` (D-7).** Touches one payroll file, reducing it to a re-export. Recommended: **do it** — forking a security control is the worse option. **Confirm before Phase 1.**
3. **Malware scanning (D-8).** The module ships scan-ready but scan-less. Confirm whether a scanner is expected before go-live, and if so which (S3 + Lambda + ClamAV is the usual low-cost path). **Confirm before Phase 4.**
4. **E-signature provider (D-13).** Internal typed signature ships in Phase 3. If a certificate-backed signature is a hard requirement, a vendor (DocuSign / Adobe Sign / an Aadhaar eSign gateway, which is the India-appropriate option given the product's INR/PF/ESI context) must be chosen — that is a new dependency and a new cost. **Confirm before Phase 3.**
5. **Bulk-publish threshold (EC-16).** The point at which publish goes async must be **measured**, not guessed. **Decide in Phase 5 with real numbers.**
6. **Storage residency.** Aadhaar/PAN are Indian PII. Confirm the bucket region satisfies the org's data-residency expectations — `AWS_REGION` is currently a single global value. **Confirm before Phase 1.**
