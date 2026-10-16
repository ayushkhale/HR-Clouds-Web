# PDF Generation Module — Phase 2 Implementation Plan

**Letter issuance: generated `org_documents`, reference numbering, employee-fact resolution.**

Status: **PLAN — not started.** Authored 2026-09-27.
Parent: [`../implementation_plan.md`](../implementation_plan.md) (module source of truth, D-1…D-24, EC-1…EC-46).
Predecessor: [`./phase1_implementation_plan.md`](./phase1_implementation_plan.md) (**COMPLETE**, verified on disk 2026-09-27).

This document is the **source of truth for Phase 2**. Where it differs from the parent plan's
§11 Phase 2 bullet list, §1.4 records the difference and the reason. Where it differs from
Phase 1, Phase 1 wins on facts (it is shipped code) and this plan states the consequence.

**Scope was reconstructed, not copied.** Every parent-plan Phase 2 line item was checked against
the code on disk. Items Phase 1 delivered early are marked **DONE (P1)** in §3 and are not
re-planned. Items the parent assigned to Phase 2 that Phase 1 made unnecessary are marked
**NO LONGER APPLICABLE** with the reason.

**Reading the cross-references.** `§N` and `§N.M` point to *this* document, except for the parent
plan's `§4.5`–`§4.7` (schema) and `§8.1`–`§8.4` (flows), which are always the parent's and are
usually written "parent §8.1". `D-n` are the parent's binding decisions, `EC-n` its edge cases,
`OD-n` its open decisions. `#n` are API registry endpoint numbers. `BR-n` continue from Phase 1's
BR-16, `T-n` are this phase's tests, `A-n` its acceptance criteria, and `EC-P2-n` / `OD-P2-n` are
new here.

---

## 1. Goal & Boundary

### 1.0 Goal

One sentence: **HR presses a button and an employee receives a numbered, audited, non-editable
PDF letter that is an ordinary `org_document` in every read path the product already has.**

Phase 1 built the render path and proved it with sample data. Phase 2 makes the first **record** —
the first PDF whose bytes are stored, whose row is a legal document, and whose input is a real
employee. Everything in Phase 2 exists to make that transition safe.

### 1.1 Explicitly in scope

| # | Deliverable | Why it must be Phase 2 |
|---|---|---|
| 1 | **D-14 renderer authentication end to end** | Phase 1 §1.3(2) and §28 record this as a **Phase 2 release blocker**: P2 is the first phase that sends a real employee's name, designation, dates and CTC to the renderer. The mitigation P1 relied on (only branding + sample data crosses the wire) expires the moment #139 ships. |
| 2 | Migration `00056` — `document_letter_sequences`; `org_documents.origin`, `generation_artifact_id`, `reference_number`; three `document_settings` letter knobs; one additive CHECK | The parent plan §4.5/§4.6 schema P1 deliberately did not create because nothing read it. |
| 3 | Seeder `010-seed-letter-document-types.js` — the **seven** missing org-plane letter types (**D-17**) | Issuing requires an activated org-plane type. Seeder `009` already carries three of the ten D-17 names; see §7. |
| 4 | `document_letter_facts.service.js` — the employee-fact resolver (parent §7.2) | The PII boundary P1 refused to cross. Owns the three-way profile fallback, `department_id` resolution, live-exit lookup and salary-structure lookup. |
| 5 | `letter_issue.builder.js` — the pure issuance view-model builder | P1's builder is `sample_data`-based by design. A letter cannot print sample data. |
| 6 | `document_letter.service.js` — issuance (§8.1), reissue (§8.2), list, detail | The core flow. Single transaction for the record-creating half, per §8.1 step 12. |
| 7 | Reference numbering: sequences table, pattern-token validator, allocation under `FOR UPDATE` (**D-20**) | `document_letter_configs.reference_pattern` is already accepted by #137 and **stored unvalidated**; P2 closes that hole and gives the column a reader. |
| 8 | `origin = 'generated'` guards on `issueFileUrl` / `confirmFile` → `409 DOCUMENT_ORIGIN_GENERATED` (**D-6**, **EC-28**) | A generated letter must not be file-replaceable. Two guard lines in an existing service. |
| 9 | HR routes **#139–#142** | The Phase 2 API surface. |
| 10 | **#138 extended** to accept a real `subject_user_id` | Explicitly deferred to P2 by Phase 1 §1.4(2). An API change to a shipped endpoint ⇒ needs a `md_updates` change record. |
| 11 | Two new templates — `relieving_letter`, `confirmation_letter` (v1) | **OD-3** recommends experience / relieving / appointment / confirmation as the first four. P1 shipped experience and appointment; P2 completes the four. |
| 12 | `pdf_artifact_sweeper.cron.js` — resolves abandoned `pending` artifacts and their orphaned objects (**EC-20**) | P2 is the first phase that writes S3 objects, so P2 is the first phase that can orphan one. The partial index it needs already exists. |
| 13 | Org settings **#84–#86**, plus the **P1 settings gap** (`letter_branding_enabled`, `letter_preview_rate_per_hour` are enforced but not HR-mutable) | §26. |
| 14 | Tests: facts resolver, builder, merge precedence, reference allocation, idempotency, failure ordering, origin guards, authorization matrix, sweeper, two new template lints | Parent §14 items 2–7. |

### 1.2 Explicitly NOT in scope — do not build here

| Excluded | Deferred to | Why not now |
|---|---|---|
| `pdf_render_jobs`, the worker cron, any queue | **Phase 3** | Phase 2 has exactly one render trigger (an HR click) and one render per request. A claim-based queue with no producer is infrastructure without a requirement. |
| Bulk letter issuance (**#143**, **#144**) | **Phase 4** | Bulk calls the single-issue service path unchanged (parent §8.4). Building the single path correctly *is* the Phase 4 prerequisite. |
| Manager letter proposal (**#145**, **#146**), `manager_can_propose_letters` | **Phase 4** | Nothing to propose until issuance exists. The maker–checker frame already exists in `document_org.service` (`proposed_by` / `approved_by`); P2 leaves it untouched. |
| `POST /documents/hr/jobs/pdf-render/run` (**#147**) | **Phase 3** | It runs the Phase 3 worker. |
| Payslip / Form 16 / annual statement; `payroll_pdf.service.js`; `pdf_render_engine` | **Phase 3** | **No payroll file changes behaviour in this phase.** PDFKit remains the only payroll renderer. |
| `cache`-class object purge, retention sweeper | **Phase 5** | P2 writes `record`-class objects that are never purged, and `cache`-class **rows** with no objects (preview still streams — Phase 1 §1.4(3)). |
| Templates for the remaining D-17 types (offer, promotion, increment, internship, NOC, transfer, salary certificate) | **Phase 4** | Their **types** are seeded in `010` so no later seeder is needed; a seeded type with no template is inert (§7.2). |
| **EC-19** object-loss detect-and-repair | **Phase 3** | Requires a download path that reads bytes in our process. P2's letter download is the existing presigned redirect, which never touches the object. §22.6 states the P2 remedy. |
| `admin` / `super-admin` access of any kind | **never** | Documents D-10; memory `role-planes-tenant-vs-platform`. |
| Emailing a letter, attaching it to anything | **Phase 4** | Parent §8.1: "the letter is not emailed". P2 writes audit rows and **enqueues nothing** — `notification.enqueue` validates `event_type` against a frozen five-event catalogue, so a letter event needs a new event, a new toggle and an email template (§24). |
| Editing an issued letter | **never** | **D-11**: a change is a reissue. |

### 1.3 Honesty guard — five stated gaps, not hidden ones

1. **`renderer_version` stays `NULL` unless OD-2 is answered.** Inherited from P1 §1.3(1). Phase 2 stores whatever the provider returns and does not pretend to know the renderer build. A `record`-class artifact with a NULL `renderer_version` is a real gap in the eight-year explainability story; it is recorded here, not discovered in year eight.
2. **Byte-identical re-render is not guaranteed** (**D-16**). `content_hash` is an integrity record of what was delivered, not a reproducibility contract. This is why the bytes are stored (**D-5**) and why reissue creates a new artifact rather than re-deriving the old one.
3. **Reference-number gaps are permanent and intended** (**D-20**). A rolled-back issue consumes nothing, but a render that fails *after* allocation does consume a number. §11.4 states exactly when a number is burned.
4. **The reference number is not printed on the PDF in Phase 2.** Parent §8.1 allocates it in step 12, *after* the render. A number cannot appear in bytes that were produced before it existed. It is persisted on the letter row, returned by the API, and shown in every read. Printing it requires a `v2` template and is Phase 4 work. §11.5 spells out the consequence and why it is not worked around.
5. **`input_snapshot` holds employee PII from this phase onward.** P1's snapshots are sample data. P2's are real. §18.5 defines the redaction rule, the retention consequence and the one place the snapshot may be read.

### 1.4 Deviations from the parent plan — stated, not silent

| # | Parent plan says | Phase 2 does | Why |
|:--:|---|---|---|
| 1 | §4.6 alters `org_documents` with **two** columns (`origin`, `generation_artifact_id`) | Adds a **third**: `reference_number STRING(64) NULL`, with a partial `UNIQUE (org_id, reference_number)` | §8.1 step 13 returns `reference_number`, and #140/#141 and every employee read must return it later. A number that exists only as a counter in `document_letter_sequences` cannot be read back — the counter records *how many*, not *which*. Additive, backfill-free, NULL for every `uploaded` row. |
| 2 | **D-11**: "The S3 key is deterministic, derived from the artifact id" | Phase 2 **changes** `pdf_render.service.js` step 8 to derive the key from `artifactId`, not `content_hash` | P1 shipped `…/pdf/{sourceType}/{contentHash}.pdf`. Two byte-identical letters would share one object: purging or losing one breaks the other, and a `record`-class object would be co-owned by two legal documents. **Safe to change:** `grep -rn "persist" src/` confirms `persist: true` is passed **nowhere** in P1, so no object exists under the old scheme and no behaviour regresses. |
| 3 | **D-6**: a generated letter "is created through `document_org.service`'s existing lifecycle"; §8.1 step 12 does all of it in one `BEGIN … COMMIT` | Phase 2 writes a **dedicated single-transaction path** inside `document_letter.service.js`, reusing `document_org.service`'s *rules, utils, repositories and helpers* — `document_org_rules.utils`, `document_targeting.utils`, `org_document.repository`, `recipientService.materialise(…, t)`, `auditService.record(…, t)`, the advisory-lock ordering — but **not** calling `createDraft` / `publish` | `createDraft` and `publish` each open and commit their **own** transaction. Calling both would make §8.1 step 12 three transactions, so a crash could leave a draft letter with stored bytes and no recipient — precisely the partial failure the parent plan designs against. D-6's own wording concedes this: generation "performs the equivalent of `confirmFile` in the same transaction". **No existing `document_org.service` method is modified**, so no existing behaviour moves. |
| 4 | §7.2 precedence: "overrides beat saved fields beat branding beat DB facts" | `field_overrides` may **not** override a field the registry entry declares in a new `derived_fields` array (`employee_name`, `employee_code`, `department_name`, `joining_date_text`, `relieving_date_text`, `annual_ctc_text`, `compensation_lines`). Attempting it is `422 LETTER_FIELD_NOT_OVERRIDABLE` | An appointment letter is a binding statement of salary. Unrestricted overrides would let a request body print a CTC the approved salary structure does not contain, with the discrepancy visible only to whoever later reads the JSONB snapshot. Overrides remain fully available for the narrative fields the template actually needs from HR (`closing_note`, `purpose_text`, `probation_text`, `confirmation_date_text`). |
| 5 | §11 Phase 2 implies five new templates | Phase 2 adds **two** (`relieving_letter`, `confirmation_letter`) | **OD-3**'s recommendation is experience / relieving / appointment / confirmation; P1 shipped two of those four. The other D-17 types have their catalog rows seeded in `010` (so Phase 4 writes no seeder) but no template until there is a template to write. Shipping unused templates multiplies the golden-fixture and lint surface for no issuable letter. |
| 6 | §12 **EC-19** (object gone, `ready` row present → re-render and compare) is marked Phase 2 | Deferred to **Phase 3** | P2's letter download is the existing `document_org_read.service.viewUrl` presigned redirect: our process never reads the object, so it cannot notice the object is missing, and adding a `HeadObject` to that hot path buys latency for a condition S3 does not produce on its own. §22.6 gives the P2 remedy (reissue, audited) and names the Phase 3 owner. |
| 7 | §13 registers `letter_branding_enabled` (#82) and `letter_preview_rate_per_hour` (#83) as **Phase 1** settings | Phase 2 makes them **writable**. Phase 1 enforces both but omitted them from `document_settings.service.MUTABLE_FIELDS`, so HR cannot change either despite the registry claiming they are configurable | Verified on disk 2026-09-27: `MUTABLE_FIELDS` contains neither key, and `SETTINGS_CAPS` in `document_defaults.js` has no `letter_` entry. This is a P1 defect, not a P2 feature; it is fixed here because P2 adds the sibling knobs and touches the same three files. |

---

## 2. Pre-Flight Checks — before writing any code

| # | Check | Command / file | Expected (verified 2026-09-27 unless noted) |
|:--:|---|---|---|
| 1 | **D-14 answered** | operator (OD-1, OD-2) | `PDF_RENDERER_API_KEY` set in every deployed environment **and** the Lambda handler rejecting requests without it. **Blocks Step 11 (route wiring), not Steps 1–10.** A merged-but-unrouted issuance service sends nothing. |
| 2 | Migration counter | `ls src/infrastructure/postgres-sql/migrations \| tail -1` | `00055-create-pdf-generation.js` → this phase writes **`00056`** |
| 3 | Migration `00055` has been **run** by the operator | operator confirmation | `pdf_render_artifacts`, `document_letter_branding`, `document_letter_configs` exist. `00056` alters nothing `00055` created except adding one CHECK, but seeder `010` and every P2 read assume `00055` landed. |
| 4 | Seeder counter | `ls src/infrastructure/postgres-sql/seeders \| tail -1` | `009-seed-document-type-catalog.js` → this phase writes **`010`** |
| 5 | Document API registry high-water mark | `public/md_system/api_registry.md` | documents end at **#138**, payroll at **#218** → this phase claims **#139–#142** |
| 6 | Org settings registry high-water mark | `public/md_settings/org_settings_registry.md` | ends at **#83** → this phase claims **#84–#86** |
| 7 | Test baseline | `npm test` | **172** test files, all green, **14** of them under `tests/unit/pdf/`. Record the number; §27.6 is the regression gate. |
| 8 | P1 artifacts present | `ls src/common/services/pdf_render.service.js src/common/repositories/pdf_render_artifact.repository.js src/infrastructure/pdf-renderer/` | all present |
| 9 | `persist: true` is unused | `grep -rn "persist: true" src/` | no hits → §1.4(2) is a safe change |
| 10 | Seeder `009` already carries three D-17 codes | `grep -n "experience_letter_issued\|relieving_letter_issued\|warning_letter" src/infrastructure/postgres-sql/seeders/009-seed-document-type-catalog.js` | all three present → `010` must **not** re-declare them (§7.1) |
| 11 | `document_letter_configs` columns exist unread | `grep -n "reference_pattern" src/infrastructure/postgres-sql/migrations/00055-create-pdf-generation.js` | present, commented "Declared now, read by P2" |
| 12 | Sweeper index exists | `grep -n "pdf_render_artifacts_pending_idx" src/infrastructure/postgres-sql/migrations/00055-create-pdf-generation.js` | present → §23 creates no index |

**Stop conditions.** Check 1 unmet ⇒ Steps 1–10 may proceed, Step 11 may not. Check 3 unmet ⇒ the phase cannot be integration-verified at all; report and stop.

---

## 3. Completed vs Remaining — the reconstruction

### 3.1 Already implemented in Phase 1 — **DO NOT RE-PLAN**

Verified by reading each file on disk, 2026-09-27.

| Parent-plan item | Where it lives | State |
|---|---|---|
| Renderer transport, retry classification, timeout, secret hygiene | `src/infrastructure/pdf-renderer/{pdf-renderer.config.js,pdf-renderer.provider.js}` | **DONE (P1)** — exports `renderPdf`, `RendererUnavailableError`, `RendererRejectedError`; `RETRYABLE` excludes `renderer_timeout` on purpose |
| `putObject` / `getObject` (**D-7**), `APP_S3_BUCKET` fallback | `src/infrastructure/aws-s3/aws-s3.provider.js` | **DONE (P1)** — P2 is the first caller of `putObject` in anger |
| The render pipeline: idempotency probe, pending insert, render, magic-byte / `%%EOF` / size verification, hash, failure mapping, `safeMarkFailed`, ready transaction, `writeAudit(ctx, t)` hook | `src/common/services/pdf_render.service.js` (300 lines) | **DONE (P1)**, incl. the `persist: true` branch, unexercised |
| Artifact repository + storage-key containment (`SAFE_ATTRIBUTES`, two named escape hatches) | `src/common/repositories/pdf_render_artifact.repository.js` | **DONE (P1)** |
| `pdf_render_artifacts`, `document_letter_branding`, `document_letter_configs`, `document_settings.letter_*` ×2 | migration `00055` | **DONE (P1)** — incl. `pdf_render_artifacts_pending_idx` (the sweeper's index) and `reference_pattern` / `requires_acknowledgement` / `is_confidential` on the configs table |
| Branding: model, repo, service, asset handshake (**D-12**), presigned-vs-data-URI resolution, `checkPreviewRate` | `document_letter_branding.{model,repository,service}.js` | **DONE (P1)** |
| Template catalog, build-time partial inlining, ten-rule lint | `letter-templates/registry.js`, `_partials/`, `utils/template_loader.utils.js`, `tests/unit/pdf/helpers/lint_template.js` | **DONE (P1)** |
| Templates `experience_letter/v1`, `appointment_letter/v1`, `bonafide_letter/v1` | `letter-templates/*/v1.html` | **DONE (P1)** |
| Formatting helpers (**D-4**), canonical JSON + SHA-256 | `src/common/utilities/pdf_format.utils.js`, `pdf_hash.utils.js` | **DONE (P1)** |
| Preview view-model builder + branding builder | `builders/letter_preview.builder.js`, `builders/branding.builder.js` | **DONE (P1)** — sample-data-based by design |
| HR endpoints **#130–#138** | `routes/document_letter.routes.js`, controllers, `validators/document_letter.validator.js` | **DONE (P1)** |
| `PREVIEW` watermark, lint-asserted | every `v1.html` + lint rule 10 | **DONE (P1)** |
| Org settings **#82**, **#83** (enforcement) | branding service + `document_settings` columns | **DONE (P1)**, but **not HR-writable** — §1.4(7) |
| `tests/unit/pdf/` safety net (14 files) | `tests/unit/pdf/` | **DONE (P1)** |

### 3.2 Partially implemented — Phase 2 completes

| Item | What P1 shipped | What P2 adds |
|---|---|---|
| **#138 preview** | sample data only; `subject_user_id` rejected by `allowUnknown:false` | accepts `subject_user_id`, renders real facts through the same resolver as issuance, still watermarked, still rate-limited, still `persist:false`. **API change ⇒ `md_updates` record.** |
| `document_letter_configs.reference_pattern` | column + `Joi.string().max(120)` on #137, **no token validation** | token-whitelist validator (**D-20**), applied on #137 write *and* re-applied at issue |
| `document_letter_configs.requires_acknowledgement` / `is_confidential` | columns + Joi, written, never read | read at issue and folded into the letter's resolved policy (BR-29 / BR-30) |
| `pdf_render.service.js` `persist: true` branch | code path exists, never called; key derived from `content_hash` | first real caller; key derived from `artifactId` (§1.4(2)); optional `inputSnapshot` param for redaction (§18.5) |
| `pdf_render_artifact.repository` escape hatches | `findByIdWithKey`, `findForRenderById` declared "P2 only", uncalled | `findByIdWithKey` used by the sweeper; `findForRenderById` **stays uncalled in P2** — it belongs to Phase 3's re-render path. Stated, not quietly used to look complete. |
| `document_settings` letter knobs | 2 columns, enforced, not writable | writable + 3 more columns (§26) |

### 3.3 Requirements the parent plan gave Phase 2 that are **NO LONGER APPLICABLE**

| Parent-plan item | Why not |
|---|---|
| Employee / manager read endpoints for letters | The parent plan itself resolves this (§9, under the API table): *"Employee and manager reads add no endpoints."* Verified: `document_org_read.service.js` already serves `listForEmployee`, `detailForEmployee` and `viewUrl` for any published `org_document` with a materialised recipient. A generated letter is one. **This is the D-6 dividend and Phase 2's single largest saving.** P2 adds **zero** employee-plane and **zero** manager-plane routes. |
| A letter-specific download endpoint | Same. `viewUrl` mints the presigned GET from `storage_key` through `findByIdForStorage`, the only key-reading method. |
| A letter-specific acknowledgement / signature flow | Documents Phase 3 shipped it against `org_documents`. A letter with `requires_acknowledgement = true` enters it automatically at publish. |
| A letter-specific audit reader | `document_audit.service.findByEntity(orgId, 'org_document', id)` already serves it. |
| Creating `pdf_render_artifacts_pending_idx` | Already created by `00055`. |
| Seeding `experience_letter_issued`, `relieving_letter_issued`, `warning_letter` | Already in seeder `009`, which carries a **binding rule never to edit it**. `010` adds only what is missing. |
| A new confidentiality mechanism for compensation-bearing letters | `org_documents.is_confidential` plus the existing manager-visibility rules already do it. P2 only *resolves* the value (§17). |
| A new `source_type` enum value for letters | `pdf_render_artifacts.source_type` already includes `'letter'`. No enum ALTER. |
| A new `entity_type` / `action` enum for the three letter audit actions | `document_audit_logs.entity_type` and `.action` are `STRING(50)`, not enums. No migration. |

### 3.4 Genuinely remaining — the Phase 2 work list

Migration `00056` · seeder `010` · D-14 renderer auth · facts resolver · issuance builder · reference numbering (table, validator, allocator) · `document_letter.service.js` (issue / reissue / list / detail) · `origin` guards on the upload handshake · routes #139–#142 · #138 real-subject extension · two templates · artifact sweeper cron · three audit actions · settings #84–#86 plus the P1 gap · the tests for all of it.

---

## 4. Phase 1 → Phase 2 Dependency Analysis

Every P2 component and the exact P1 component it extends. **"Extend" means additive: no P1
signature loses a parameter, no P1 caller changes behaviour.**

| P2 component | P1 dependency | How it is extended | Breaking? |
|---|---|---|:--:|
| `document_letter.service.issue` | `pdf_render.service.renderAndRecord` | called with `persist: true`, `sourceType: 'letter'`, `retentionClass: 'record'`, `sourceId` = a pre-generated `org_documents.id`, and an `onReady` hook. The hook is the **existing** `writeAudit(ctx, t)` parameter, renamed (§13.2) with the old name kept as an alias for the two P1 callers | **No** |
| Storage key shape | `renderAndRecord` step 8 + `buildObjectKey` | key becomes `org/{orgId}/pdf/letter/{artifactId}.pdf` via a new `buildGeneratedPdfKey` in `src/common/utilities/object_storage.utils.js` — **not** `document_storage.utils.js`, because `common/services` must never import from `modules/document` (P1 §1.4(6)) | **No** (§1.4(2)) |
| Redacted `input_snapshot` | `renderAndRecord` step 3 | new optional `inputSnapshot` param, defaulting to `viewModel` — P1 callers unaffected | **No** |
| Sweeper | `artifactRepo.findByIdWithKey`, `s3Provider.deleteObject`, `artifactRepo.markFailed` | uses the declared escape hatch for its intended purpose; adds one cron-only cross-org repo method (§23.2) | **No** |
| `letter_issue.builder` | `branding.builder.buildBrandingBlock`, `pdf_format.utils` | reuses both verbatim; sets the same reserved roots (`branding`, `is_preview`, `issued_on_text`, `template_marker`) and adds none | **No** |
| `document_letter_facts.service` | `db.EmployeeProfile` / `ManagerProfile` / `HrProfile` / `UserProfile` / `OrganizationDepartment`; `payroll/repositories/employee_exit.repository`; `payroll/repositories/employee_salary_structure.repository` | payroll repositories reached through the **graceful lazy-require** pattern `document_offboarding.service.js` already uses for `employee_exit.repository` (**D-18**) | **No** |
| Real-subject preview (#138) | `document_letter_template.service.previewTemplate` | one branch: `subject_user_id` present ⇒ facts resolver instead of `sample_data`. The sample path is untouched and remains the default | **No** — additive request field |
| Reference pattern validation | `document_letter.validator.upsertConfigSchema` | the existing `reference_pattern: Joi.string().max(120)` gains `.custom(assertPatternTokens)` | **Tightening.** An org that already stored a pattern with an unknown token (possible today — nothing validates it) now fails on the *next* write and, at issue, falls back to the org default with a warning log rather than throwing. §11.3. |
| `origin` guards | `document_upload.service.issueFileUrl` / `confirmFile` | two `if (row.origin === 'generated') throw` lines. Every pre-existing row is `origin = 'uploaded'` by DEFAULT, so no existing document changes behaviour | **No** |
| `org_document.repository` projections | frozen `LIST_ATTRIBUTES` / `DETAIL_ATTRIBUTES` | add `origin`, `generation_artifact_id`, `reference_number`. `storage_key` and `reference_url` stay excluded | **No** — additive response fields; needs an `md_updates` record |
| `document_settings` letter knobs | `document_settings.service.MUTABLE_FIELDS`, `document_defaults.SETTINGS_CAPS`, `document_hr.validator` settings schema | five keys added across the three files | **No** |
| Two new templates | `registry.js`, `template_loader.utils`, lint helper | two registry entries + two `v1.html` files + one additive `derived_fields` field on **all five** entries | **No** — `assertValidEntry` gains a check; existing entries gain a field |

### 4.1 What Phase 2 must NOT duplicate

A checklist to run before writing each file. If the answer to any line is "I am writing one", stop.

* A second PDF render pipeline — `pdf_render.service.js` is the only one (**D-24**).
* A second artifact table or a `letters` table — `pdf_render_artifacts` + `org_documents` (**D-6**, **D-21**).
* A second storage-key builder — `buildObjectKey` is the only one.
* A second audit writer — `document_audit.service.record(entry, t)`.
* A second recipient materialiser — `document_recipient.service.materialise(…, t)`.
* A second targeting normaliser or status machine — `document_targeting.utils`, `document_org_rules.utils`.
* A second employee/manager read path — §3.3.
* A second money or date formatter — `pdf_format.utils` (**D-4**).
* A second hash/canonicalisation helper — `pdf_hash.utils`.
* A second rate limiter — `document_letter_branding.service.checkPreviewRate`.
* A second branding resolver — `document_letter_branding.service.resolveAssetSrcs`.
* A second `document_type` loader — `document_type.repository.findByCode(orgId, code)`.
* A new npm dependency — **D-19**, zero.

---

## 5. Feature & Component Breakdown

Each feature carries the full chain: **Requirement → Existing Dependency → Database Impact → API
Impact → Business Logic → Validation → Authorization → PDF Generation Impact → Storage Impact →
Failure Handling → Testing → Acceptance Criteria.** "N/A" is written out where a link does not
apply; it is never left blank.

### F-1 — Letter issuance (#139)

| Link | Content |
|---|---|
| **Requirement** | HR issues a numbered PDF letter for one employee from an enabled template; the letter becomes a published `org_document` addressed to that employee. Parent §8.1. |
| **Existing dependency** | `pdf_render.service.renderAndRecord` (P1); `document_letter_branding.service.resolveAssetSrcs` (P1); `branding.builder` (P1); `template_loader.utils.assembleTemplate` (P1); `registry` (P1); `document_type.repository.findByCode`; `org_document.repository`; `document_recipient.service.materialise`; `document_audit.service.record`; `document_org_rules.utils`; `document_targeting.utils`; `document_settings.service.getOrCreate`. |
| **Database impact** | INSERT 1 `pdf_render_artifacts` (`pending` → `ready`); INSERT 1 `org_documents` (`published`, origin generated); INSERT 1 `org_document_recipients`; UPSERT 1 `document_letter_sequences`; INSERT 2 `document_audit_logs`. No UPDATE of any pre-existing row. |
| **API impact** | New `POST /api/v1/documents/hr/letters`. Contract in §16.1. |
| **Business logic** | §14 (fifteen ordered steps); BR-17 … BR-33. |
| **Validation** | Body schema §16.1; `field_overrides` keys must be declared template fields and must not be derived fields; required fields present after merge → `422 PDF_DATA_INCOMPLETE` naming the missing keys; template enabled; type activated, active, org-plane; subject same-org and not soft-deleted. |
| **Authorization** | `[authenticate, authorize(['hr']), requireFeature('documents.access')]`. `admin` / `super-admin` never reach it (memory `role-planes-tenant-vs-platform`). No manager plane in Phase 2. |
| **PDF generation impact** | One render, `source_type` letter, `retention_class` record, `is_preview` false (no watermark), template version resolved **once** (EC-15) and recorded on the artifact. |
| **Storage impact** | One `putObject` at `org/{orgId}/pdf/letter/{artifactId}.pdf`; `storage_key` written to both the artifact and the letter row; never returned by any API. |
| **Failure handling** | §22.2. Renderer down → 502/504, artifact failed, **no** number consumed, **no** letter row. S3 down → 502 STORAGE_UNAVAILABLE, same. Commit failure after the object exists → artifact failed with DB_COMMIT_FAILED, object orphaned, sweeper deletes it (EC-20). |
| **Testing** | §27.2 T-6 … T-14; §27.3 T-20 … T-24. |
| **Acceptance** | A-3, A-4, A-5, A-7, A-9, A-12. |

### F-2 — Reference numbering (D-20)

| Link | Content |
|---|---|
| **Requirement** | Every issued letter carries a unique, org-scoped, pattern-formatted reference number allocated without duplication under concurrency. |
| **Existing dependency** | None — new. It reuses the transaction the issuing path already owns. |
| **Database impact** | New table `document_letter_sequences`; new column `org_documents.reference_number` (§1.4(1)); one `SELECT … FOR UPDATE` plus one `UPDATE` per issue. |
| **API impact** | `reference_number` appears in #139/#140/#141 and in the existing employee and manager document reads (additive — `md_updates` record required). |
| **Business logic** | §11 — pattern resolution, FY derivation, allocation under row lock, gaps accepted. |
| **Validation** | Token whitelist ORG_CODE, TYPE, FY, YYYY, MM, SEQ:0000; unknown token → `422 LETTER_REFERENCE_PATTERN_INVALID`; rendered length over 64 → `422 LETTER_REFERENCE_TOO_LONG`. |
| **Authorization** | Inherited from #137 (pattern write) and #139 (allocation). No separate surface. |
| **PDF generation impact** | **None in Phase 2** — the number is allocated after the render and is not printed (§1.3(4), §11.5). |
| **Storage impact** | N/A. |
| **Failure handling** | Allocation is inside the single issuing transaction: a rollback consumes nothing, and a render failure happens before allocation. §11.4 lists the one case where a number is burned. |
| **Testing** | T-15 … T-19. |
| **Acceptance** | A-6. |

### F-3 — Employee-fact resolution (parent §7.2)

| Link | Content |
|---|---|
| **Requirement** | Turn `subject_user_id` into the facts a letter prints, from authoritative sources, with no clock read and no silent zero. |
| **Existing dependency** | `db.EmployeeProfile` / `ManagerProfile` / `HrProfile` / `UserProfile` / `OrganizationDepartment`; `payroll/repositories/employee_exit.repository.findLiveByUserId`; `payroll/repositories/employee_salary_structure.repository.findCurrentApproved`; `pdf_format.utils`. |
| **Database impact** | Reads only. No writes, no locks — every read happens **before** any transaction is opened. |
| **API impact** | N/A (a service). |
| **Business logic** | §10.1. Three-way profile fallback (Employee → Manager → HR) mirroring `payslip.service._loadIdentities`; `department_id` → `OrganizationDepartment.name`, **never** the free-text `department` column (memory `department-field-dual-source`); exit dates from `employee_exits`; CTC and component lines from the current **approved** salary structure. |
| **Validation** | Subject resolvable in-org, else uniform `404 DOCUMENT_NOT_FOUND`. Template needs a relieving date but no live exit → `422 LETTER_FACTS_MISSING` naming `last_working_day`. Template needs a CTC but no approved structure → `422 LETTER_FACTS_MISSING` (**EC-24** — never a letter printing a zero amount). |
| **Authorization** | The resolver is unauthorized code; the caller has already established plane and scope. It takes `orgId` as a mandatory first argument and puts it in every predicate. |
| **PDF generation impact** | Supplies the derived fields; nothing else. |
| **Storage impact** | N/A. |
| **Failure handling** | A missing optional fact omits the field (the template's `if` block handles absence — P1's builder rule). A missing **required** fact is a 422, never a blank on a legal document. A payroll model absent from the registry degrades to the same 422 through the lazy-require guard, never a 500. |
| **Testing** | T-1 … T-5. |
| **Acceptance** | A-2, A-10. |

### F-4 — Generated letters are not file-replaceable (D-6, EC-28)

| Link | Content |
|---|---|
| **Requirement** | `issueFileUrl` and `confirmFile` must refuse a row whose origin is generated. |
| **Existing dependency** | `document_upload.service.issueFileUrl` / `confirmFile`; `document_org.service.issueFileUrl` / `confirmFile` / `replace`. |
| **Database impact** | Reads the new `origin` column. No writes. |
| **API impact** | Two existing endpoints gain a `409 DOCUMENT_ORIGIN_GENERATED`. **`md_updates` record required** — a new error code on a shipped endpoint. |
| **Business logic** | §13.5, which also states why `replace` is covered. |
| **Validation** | Pure state check. |
| **Authorization** | Unchanged. The guard runs **after** the existing scope check, so it cannot leak the existence of a letter the caller may not see. |
| **PDF generation impact** | N/A. |
| **Storage impact** | Prevents an uploaded object from overwriting a generated one. |
| **Failure handling** | N/A — the guard is the failure handling. |
| **Testing** | T-25, T-26. |
| **Acceptance** | A-8. |

### F-5 — Reissue (#142, parent §8.2)

| Link | Content |
|---|---|
| **Requirement** | Re-generate a letter from current data as version N+1 in the same `document_group_id`, superseding version N, with a new artifact and a new reference number. The superseded letter keeps its bytes, artifact, number and acknowledgement history forever. |
| **Existing dependency** | Everything F-1 uses, plus `document_org_rules.utils.canTransition` and the `org_documents_published_group_unique_idx` backstop. |
| **Database impact** | INSERT 1 artifact, INSERT 1 `org_documents` (version N+1, `supersedes_id` = N), UPDATE the previous row to superseded, INSERT 1 recipient, UPSERT the sequence, INSERT 2 audit rows. |
| **API impact** | New `POST /api/v1/documents/hr/letters/:id/reissue`. |
| **Business logic** | §15. |
| **Validation** | Target exists, in-org, generated, published, else `409 LETTER_NOT_REISSUABLE`; template still enabled; type still active; subject still resolvable. |
| **Authorization** | `hr` only. Cross-org, invisible or deleted target → uniform `404 DOCUMENT_NOT_FOUND`. |
| **PDF generation impact** | A fresh render at the **currently** resolved template version, which may differ from the superseded letter's. Both versions are recorded on their own artifacts (EC-15). |
| **Storage impact** | A new object under the new artifact id. **The old object is never touched.** |
| **Failure handling** | Same table as F-1. A failure leaves version N published and untouched — reissue is never destructive-first. |
| **Testing** | T-27 … T-31. |
| **Acceptance** | A-11. |

### F-6 — HR letter list and detail (#140, #141)

| Link | Content |
|---|---|
| **Requirement** | HR lists issued letters with filters, and reads one with its artifact metadata and a snapshot summary. |
| **Existing dependency** | `org_document.repository` LIST/DETAIL attribute lists; `pdf_render_artifact.repository.findSafeById`. |
| **Database impact** | Reads only, plus one new partial index (§6.3). |
| **API impact** | Two new endpoints. |
| **Business logic** | §16.2, §16.3. The list is `org_documents` filtered on generated origin, not a new table. |
| **Validation** | Query params validated **inside the controller** with `validateOrThrow` — Express 5 `req.query` is getter-only (memory `manager-panel-authz-backbone`). |
| **Authorization** | `hr` only. |
| **PDF generation impact** | None — no render on read. |
| **Storage impact** | None. `storage_key` stays excluded from both projections; download remains the existing `viewUrl`. |
| **Failure handling** | A missing artifact row (impossible for a generated letter, but the join is LEFT) yields `artifact: null` rather than a 500. |
| **Testing** | T-32 … T-35. |
| **Acceptance** | A-13. |

### F-7 — Real-subject preview (#138 extension)

| Link | Content |
|---|---|
| **Requirement** | HR previews a template against a real employee, watermarked, without issuing anything. |
| **Existing dependency** | `document_letter_template.service.previewTemplate` (P1), F-3, `checkPreviewRate` (P1). |
| **Database impact** | Reads only, plus the one cache-class artifact row P1 already writes. |
| **API impact** | `subject_user_id` added to the #138 body. **`md_updates` record required.** |
| **Business logic** | §13.4. |
| **Validation** | `subject_user_id` optional UUID; present ⇒ facts path, absent ⇒ P1's sample path verbatim. `use_saved_fields` and `override_fields` apply in both. |
| **Authorization** | `hr` only, so no `hierarchy_access` call is needed in Phase 2 — an HR user sees every employee in the org. The parent plan's rule that preview "never accepts a subject the caller could not otherwise read" is satisfied trivially; when Phase 4 opens preview to managers, that check becomes real and must be added then. |
| **PDF generation impact** | `is_preview` true ⇒ watermark. `persist` false ⇒ no object, no number, no letter row, no recipient. |
| **Storage impact** | None — bytes stream back (P1 §1.4(3)). |
| **Failure handling** | The same `422 LETTER_FACTS_MISSING` as issuance, so HR discovers a missing fact **before** issuing. That is this feature's main value. |
| **Testing** | T-36 … T-38. |
| **Acceptance** | A-14. |

### F-8 — Artifact sweeper (EC-20)

| Link | Content |
|---|---|
| **Requirement** | An artifact stuck pending past a grace period is resolved to failed, and any object written for it is deleted. |
| **Existing dependency** | `artifactRepo.markFailed` / `findByIdWithKey`; `s3Provider.deleteObject`; the existing `src/cron-jobs/` registration pattern; index `pdf_render_artifacts_pending_idx`. |
| **Database impact** | UPDATE `pdf_render_artifacts` only, plus one new cron-only repository read (§23.2). |
| **API impact** | None in Phase 2 — the manual trigger #147 is Phase 3. |
| **Business logic** | §23. |
| **Validation** | N/A. |
| **Authorization** | N/A — a cron, no actor. Audit rows carry a null actor. |
| **PDF generation impact** | None — the sweeper never renders. |
| **Storage impact** | Deletes at most one object per swept row, and only where `storage_key` is set. |
| **Failure handling** | Per-row try/catch: one failure never stops the sweep. A delete failure leaves the row failed with `SWEEPER_OBJECT_DELETE_FAILED` so the orphan is greppable. |
| **Testing** | T-39 … T-42. |
| **Acceptance** | A-15. |

### F-9 — Two new templates

| Link | Content |
|---|---|
| **Requirement** | `relieving_letter` and `confirmation_letter`, v1, passing the ten-rule lint. |
| **Existing dependency** | `registry.js`, `_partials/`, the lint helper. |
| **Database impact** | Catalog rows: `confirmation_letter_issued` from seeder `010`; `relieving_letter_issued` already in `009`. |
| **API impact** | Both appear in #135/#136 automatically — the catalog *is* the registry. |
| **Business logic** | §9. |
| **Validation** | `assertValidEntry` at module load; lint at test time. |
| **Authorization** | N/A. |
| **PDF generation impact** | Two more renderable codes. `A4_CONFIG` reused — no new `pdf_config` shape. |
| **Storage impact** | N/A. |
| **Failure handling** | A malformed entry is a **deploy-time** throw, not a runtime 500 (P1's rule). |
| **Testing** | T-43, T-44. |
| **Acceptance** | A-16. |

### F-10 — Org settings #84–#86 plus the P1 gap

| Link | Content |
|---|---|
| **Requirement** | `letter_reference_pattern`, `letter_default_confidential`, `letter_requires_acknowledgement_default` configurable; `letter_branding_enabled` and `letter_preview_rate_per_hour` made writable. |
| **Existing dependency** | `document_settings.service.MUTABLE_FIELDS`; `document_defaults.SETTINGS_CAPS`; the settings Joi in `document_hr.validator.js`; the existing HR settings endpoint. |
| **Database impact** | Three new `document_settings` columns plus one CHECK. |
| **API impact** | The existing HR settings GET/PUT gains five writable keys. **`md_updates` record required.** |
| **Business logic** | §26. |
| **Validation** | Pattern through the token validator; `letter_default_confidential` boolean; `letter_requires_acknowledgement_default` tri-state (true / false / null = inherit). |
| **Authorization** | `hr` only — the existing endpoint's gate. |
| **PDF generation impact** | None directly. |
| **Storage impact** | None. |
| **Failure handling** | Every default equals today's behaviour, so an un-migrated or never-configured org behaves exactly as it does now. |
| **Testing** | T-45, T-46. |
| **Acceptance** | A-17. |

---

## 6. Schema Changes & Migration `00056`

File: `src/infrastructure/postgres-sql/migrations/00056-create-letter-issuance.js`.
**Authored, not run** (memory `user-runs-migrations-no-db-access`). One transaction; raw SQL for
partial indexes and CHECKs exactly as `00049` / `00053` / `00055` do. `down()` is the exact inverse
and **destroys reference numbers** — stated in the file header.

### 6.1 New table — `document_letter_sequences` (parent §4.5, D-20)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK, UUIDV4 | |
| `org_id` | UUID NOT NULL | FK `organizations(id)` ON DELETE CASCADE, matching `00055` |
| `template_code` | STRING(64) NOT NULL | no FK — the catalog is a repo asset (**D-2**) |
| `financial_year` | STRING(9) NOT NULL | e.g. 2026-2027; derivation in §11.2 |
| `last_number` | INTEGER NOT NULL DEFAULT 0 | |
| `created_at`, `updated_at` | | **no** `deleted_at` — no table in this module is paranoid (parent §4.7) |

* `UNIQUE (org_id, template_code, financial_year)` → `document_letter_sequences_org_template_fy_uq`.
* CHECK `document_letter_sequences_last_number_chk`: `last_number >= 0`.
* No other index — every read is by the unique key.

### 6.2 `org_documents` alterations

| Column | Type | Notes |
|---|---|---|
| `origin` | ENUM(uploaded, generated) NOT NULL DEFAULT uploaded | **D-6**. Backfill-free: every existing row genuinely is an upload. |
| `generation_artifact_id` | UUID NULL | **D-6**. FK `pdf_render_artifacts(id)` ON DELETE **RESTRICT** — an artifact a legal document points at must not be deletable. |
| `reference_number` | STRING(64) NULL | §1.4(1) |

* `CREATE UNIQUE INDEX org_documents_reference_number_uq ON org_documents (org_id, reference_number) WHERE reference_number IS NOT NULL AND deleted_at IS NULL` — the structural guarantee behind D-20, independent of the sequence table.
* `ALTER TABLE org_documents ADD CONSTRAINT org_documents_generated_chk CHECK (origin <> 'generated' OR (generation_artifact_id IS NOT NULL AND reference_number IS NOT NULL AND storage_backend = 's3'))` — a generated letter with no artifact, no number, or a reference-URL backend is not a letter. **Safe to add:** no generated row exists yet.

### 6.3 New index for #140

`CREATE INDEX org_documents_org_generated_idx ON org_documents (org_id, document_type_id, created_at DESC) WHERE origin = 'generated' AND deleted_at IS NULL` — the letter list is a small partial slice of a table whose other indexes are targeting- and status-shaped.

### 6.4 `document_settings` alterations (§26)

| Column | Type | Default | Registry |
|---|---|---|:--:|
| `letter_reference_pattern` | STRING(120) NOT NULL | `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}` | **#84** |
| `letter_default_confidential` | BOOLEAN NOT NULL | true | **#85** |
| `letter_requires_acknowledgement_default` | BOOLEAN NULL | NULL (inherit from the type) | **#86** |

CHECK `document_settings_letter_reference_pattern_chk`:
`char_length(letter_reference_pattern) BETWEEN 3 AND 120 AND position('{SEQ' in letter_reference_pattern) > 0`
— a pattern with no sequence token cannot produce unique numbers, and the database says so even if
a future code path forgets. This mirrors `00055`'s reasoning for `document_settings_preview_rate_chk`.

### 6.5 `pdf_render_artifacts` — one additive CHECK

`00055`'s `pdf_render_artifacts_ready_chk` deliberately does **not** require `storage_key`, because
a P1 preview is ready with no object. Phase 2 adds the record-class half:

```sql
ALTER TABLE "pdf_render_artifacts" ADD CONSTRAINT "pdf_render_artifacts_record_ready_chk"
CHECK ("retention_class" <> 'record' OR "status" <> 'ready' OR "storage_key" IS NOT NULL)
```

A record-class artifact that is ready with no stored object is not a record of anything.
**Safe to add:** no record-class row exists yet — P1 writes only cache-class.

### 6.6 What `00056` does **not** do

* Does not touch `pdf_render_artifacts.source_type` — letter is already in the enum.
* Does not touch `document_letter_configs` — `00055` already created all three P2-read columns.
* Does not create `pdf_render_jobs` (Phase 3) or any purge column (Phase 5).
* Does not create `pdf_render_artifacts_pending_idx` — `00055` did.
* Does not alter `document_audit_logs` — `entity_type` and `action` are STRING(50), not enums.
* Does not alter any payroll table (**D-21**, parent §4.7).

### 6.7 Migration hand-back note (copy into the completion report)

```
00056-create-letter-issuance.js — NOT RUN.
Creates:  document_letter_sequences
Alters:   org_documents      (+origin, +generation_artifact_id, +reference_number)
          document_settings  (+3 letter columns)
Adds:     org_documents_reference_number_uq, org_documents_org_generated_idx,
          org_documents_generated_chk, document_settings_letter_reference_pattern_chk,
          document_letter_sequences_org_template_fy_uq,
          document_letter_sequences_last_number_chk,
          pdf_render_artifacts_record_ready_chk
Requires: 00050 (org_documents) and 00055 (pdf_render_artifacts) already run.
Backfill: none. Every added column defaults to current behaviour.
down():   drops document_letter_sequences and the three org_documents columns.
          THIS DESTROYS EVERY ISSUED LETTER'S REFERENCE NUMBER AND ITS LINK TO ITS
          ARTIFACT. The bytes survive in S3 and the artifact rows survive; the legal
          identifiers do not. Do not run down() after any letter has been issued.
Verify:   \d+ org_documents                → 3 new columns, 2 new indexes, 1 new CHECK
          \d+ document_letter_sequences
          SELECT origin, count(*) FROM org_documents GROUP BY 1;   → all uploaded
```

---

## 7. Seeder `010-seed-letter-document-types.js` (D-17)

### 7.1 What already exists — do not re-declare

Seeder `009-seed-document-type-catalog.js` carries a **binding rule never to edit it** and already
contains `experience_letter_issued`, `relieving_letter_issued` and `warning_letter`. `010` therefore
seeds **seven** codes:

| `code` | `group` | `plane` | confidential by default | Template |
|---|---|---|:--:|---|
| `appointment_letter_issued` | onboarding | org | **yes** (prints CTC) | P1 `appointment_letter` |
| `offer_letter_issued` | onboarding | org | **yes** (prints CTC) | Phase 4 |
| `confirmation_letter_issued` | employment_history | org | no | **P2 `confirmation_letter`** |
| `promotion_letter_issued` | employment_history | org | **yes** | Phase 4 |
| `salary_revision_letter_issued` | employment_history | org | **yes** | Phase 4 |
| `bonafide_letter_issued` | employment_history | org | no | P1 `bonafide_letter` |
| `salary_certificate_issued` | employment_history | org | **yes** | Phase 4 |

**Deviation from D-17, stated:** D-17 also names `internship_certificate`, `noc` and `transfer`.
They are **not** seeded, because nothing in Phases 1–4 issues them and an activated org-plane type
with no template is a dead row in every tenant's catalog. They are a one-line addition to a future
seeder when a template exists. `warning_letter` (already in `009`) likewise gets no template — it is
a disciplinary document HR writes, not one the generator produces.

### 7.2 Seeder rules

* Same shape as `009`: `INSERT … ON CONFLICT (code) DO NOTHING`, reusing `009`'s `BASE_DEFAULTS`
  spread so a new type cannot silently differ in the twenty fields nobody inspects.
* `plane: 'org'` for all seven. An employee-plane type would make `_loadTypeAndPolicy(…, 'org')`
  throw `422 DOCUMENT_TYPE_PLANE_MISMATCH` at issue.
* `allows_multiple: true` — an employee can legitimately receive two bonafide letters. (Not read on
  the org plane today, but a wrong value is still wrong.)
* `requires_expiry_date: false`, `default_verification_required: false` — HR does not verify a
  document HR generated.
* **Seeding a type does not activate it in any org.** The existing activation flow does that, and
  `409 DOCUMENT_TYPE_NOT_ACTIVATED` at issue is the actionable error D-17 asks for.
* `down()` deletes exactly these seven codes and nothing else.

### 7.3 Registry ↔ catalog consistency test

A new unit test asserts every `registry.js` entry's `document_type_code` appears in `009` or `010`.
This is the check that fails the build when Phase 4 adds a template and forgets the catalog row —
the failure that would otherwise surface as a production 409 for one tenant.

---

## 8. Model Changes

| File | Change | Notes |
|---|---|---|
| `models/org_documents.model.js` | add `origin` (ENUM, default uploaded), `generation_artifact_id` (UUID null), `reference_number` (STRING(64) null) | keep the file's comment style; `associate` gains `belongsTo(PdfRenderArtifact, { foreignKey: 'generation_artifact_id', as: 'generation_artifact' })` behind the same `if (models.X)` guard the file already uses |
| `models/document_letter_sequences.model.js` | **new** | `timestamps: true`, `underscored: true`, **`paranoid: false`**. Lives in `modules/document/models/` because `MODEL_ROOTS` only scans module directories (P1 OD-P1-3) |
| `models/document_settings.model.js` | add the three §6.4 columns | |
| `models/pdf_render_artifacts.model.js` | **no change** | `source_type` already includes letter |

---

## 9. Templates

### 9.1 Registry changes (`letter-templates/registry.js`)

**One additive field on every entry:** `derived_fields` — the subset of
`required_fields ∪ optional_fields` that the facts resolver owns and `field_overrides` may not touch
(§1.4(4)). `assertValidEntry` gains:

```
if (!Array.isArray(e.derived_fields)) throw new Error(`${where}: derived_fields must be an array`)
const declared = new Set([...e.required_fields, ...e.optional_fields])
for (const f of e.derived_fields) {
  if (!declared.has(f)) throw new Error(`${where}: derived_fields names an undeclared field "${f}"`)
}
```

Existing entries gain:

| Template | `derived_fields` |
|---|---|
| `experience_letter` | employee_name, designation, joining_date_text, relieving_date_text, department_name, employee_code |
| `appointment_letter` | employee_name, designation, joining_date_text, annual_ctc_text, department_name, employee_code, reporting_manager, compensation_lines |
| `bonafide_letter` | employee_name, designation, employee_code |

Everything not listed — `closing_note`, `purpose_text`, `probation_text`, `place_of_issue`,
`hr_contact_line`, `offer_reference_note` — stays HR-supplied and overridable.

### 9.2 New entry — `relieving_letter`

```
code:               relieving_letter
document_type_code: relieving_letter_issued          // already in seeder 009
current_version:    1
required_fields:    employee_name, designation, joining_date_text, relieving_date_text
optional_fields:    department_name, employee_code, resignation_date_text,
                    notice_period_text, closing_note
derived_fields:     employee_name, designation, joining_date_text, relieving_date_text,
                    department_name, employee_code, resignation_date_text, notice_period_text
saved_field_schema: { place_of_issue? max 80, hr_contact_line? max 160 }  unknown(false)
pdf_config:         A4_CONFIG
sample_data:        every required field, PII-free
```

Shape: prose plus a short facts table, exercising `if` blocks on three optionals. It is deliberately
close to `experience_letter`; the meaningful difference is that a relieving letter states the
resignation date and notice period — exactly the pair that must come from `employee_exits` and never
from a request body.

### 9.3 New entry — `confirmation_letter`

```
code:               confirmation_letter
document_type_code: confirmation_letter_issued        // seeder 010
current_version:    1
required_fields:    employee_name, designation, joining_date_text, confirmation_date_text
optional_fields:    department_name, employee_code, probation_end_text,
                    revised_annual_ctc_text, closing_note
derived_fields:     employee_name, designation, joining_date_text, department_name,
                    employee_code, revised_annual_ctc_text
saved_field_schema: { place_of_issue?, hr_contact_line? }
pdf_config:         A4_CONFIG
```

`confirmation_date_text` and `probation_end_text` are **required from HR** and are deliberately not
derived: there is no probation table in this codebase, and inventing one to satisfy a template is
exactly the speculative work the parent plan forbids. `confirmation_date_text` being *required*
means an issue without it is a 422 naming it — HR is told what to supply rather than handed a blank.

### 9.4 Template authoring rules (unchanged from P1; restated because they bind)

* CSS inline; only the four `include partial` markers; no Handlebars partial syntax; no external
  URL; no triple-stash; only the four renderer helpers; assembled size under 256 KB;
  `page-break-inside: avoid` on the signature block; all four margins declared; the
  `is_preview` watermark block present.
* Renders correctly with every optional absent (**D-18**).
* **No existing template file is edited in Phase 2.** The three P1 `v1.html` files are untouched, so
  D-2 immutability is never tested. See §11.5.

### 9.5 Lint

The `tests/unit/pdf/` lint tests iterate the registry, so both new templates are covered the moment
they are registered. `RESERVED_ROOTS` in `tests/unit/pdf/helpers/lint_template.js` is **not**
changed: Phase 2 introduces no new reserved root, because no template prints a reference number
(§11.5).

---

## 10. Source Data & View-Model Responsibilities

The parent plan's §7 rule is absolute and Phase 2 keeps it: **builders are pure
`(facts, branding, config, pinnedDate) → view`; all data fetching happens in the service above the
builder; no builder reads the clock.**

### 10.1 `document_letter_facts.service.js` — new

`async resolve(orgId, subjectUserId, { needs, transaction = null })` where `needs` is the set of
derived fields the template declares. It fetches only what `needs` asks for, so a bonafide letter
does not touch payroll tables at all.

| Fact | Source | Rule |
|---|---|---|
| `full_name` | `UserProfile.display_name` else `first_name + last_name` | `titleCaseName` from `pdf_format.utils`. No name ⇒ `422 LETTER_FACTS_MISSING`. |
| `employee_code`, `designation`, `department_id`, `joining_date`, `employment_type`, `job_status`, `manager_id` | `EmployeeProfile` → `ManagerProfile` → `HrProfile`, first hit wins | Mirrors `payslip.service._loadIdentities`. **Three separate reads joined in memory**, never a three-way OUTER JOIN. `manager_id` exists only on `EmployeeProfile`; for a manager or HR subject `reporting_manager` is simply omitted. |
| `department_name` | `OrganizationDepartment.name` by `department_id` | **Never** the free-text `department` column (memory `department-field-dual-source`). No `department_id` ⇒ the optional field is omitted, not defaulted to the string. |
| `last_working_day`, `resignation_date`, `notice_period_days` | `employee_exit.repository.findLiveByUserId(orgId, userId)` | Lazy-required through the **D-18 graceful pattern** `document_offboarding.service.js` already uses. No live exit ⇒ these three facts are absent. |
| `annual_ctc`, `currency`, component lines | `employee_salary_structure.repository.findCurrentApproved(userId, orgId, { withComponents: true })` | Same lazy-require. Components filtered to `is_part_of_ctc`, sorted by `display_order`, mapped to `{ label: component_name, amount }`. Only the **approved current** structure — never a draft, never a superseded version. |
| Org code (for `{ORG_CODE}`) | `organization.repository` / `organization_profiles` | Resolved once here so the reference builder stays pure. |

Rules with teeth:

* **No clock read.** `resolve` takes no date and returns no formatted date; the *service* passes
  `pinnedDate` to the builder. Raw `DATEONLY` values come back as strings and are formatted by the
  builder through `formatDocumentDate`.
* **Reads happen before any transaction.** `resolve` accepts an optional `transaction` only so the
  §14 step-13 re-check can run inside the issuing transaction; the main call passes none.
* **`orgId` in every predicate.** A cross-org `subjectUserId` returns nothing, which the caller maps
  to the uniform `404`.
* **Returns raw facts, never view fields.** The mapping from `last_working_day` to
  `relieving_date_text` belongs to the builder, so the same facts serve any template.

### 10.2 `letter_issue.builder.js` — new, pure

`buildIssueViewModel({ template, facts, branding, savedFields, overrideFields, pinnedDate, isPreview })`

Merge precedence, top wins (parent §7.2, as amended by §1.4(4)):

1. `overrideFields` — **rejected earlier** by the validator for any `derived_fields` key, so by the
   time the builder runs there is no conflict left to resolve.
2. `savedFields` (`document_letter_configs.saved_fields`, **D-3**).
3. Derived facts from F-3.
4. Template defaults — none exist; a field with no value is **omitted**.

Then, exactly as P1's `buildPreviewViewModel` does:

* Assert every `required_fields` entry is present and non-blank ⇒ else `422 PDF_DATA_INCOMPLETE`
  with the missing keys named (never a partially blank letter).
* Omit empty optionals so the template's `if` blocks take the absent branch.
* Set the reserved roots: `branding` (from `branding.builder`), `is_preview` (false for issuance,
  true for #138), `issued_on_text` = `formatDocumentDate(pinnedDate)`, `template_marker` =
  `code/vN`.
* **Set no new reserved root.** `reference_number` is not in the view model (§11.5).
* Depth ≤ 2, no functions, no `Date`, no Decimal, no Sequelize instances — the parent §7.1 contract.

`letter_preview.builder.js` (P1) is **not modified**: #138's sample path keeps calling it. The
real-subject path calls the new builder with `isPreview: true`. Two builders, one contract, no
branching inside either.

---

## 11. Reference Numbering (D-20)

### 11.1 Pattern resolution

Precedence: `document_letter_configs.reference_pattern` (per template) →
`document_settings.letter_reference_pattern` (per org, **#84**) → the hard default
`{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}`.

`src/modules/document/utils/letter_reference.utils.js` — new, pure:

| Export | Purpose |
|---|---|
| `TOKENS` | frozen whitelist: `ORG_CODE`, `TYPE`, `FY`, `YYYY`, `MM`, `SEQ:0000` (any run of 1–6 zeroes) |
| `assertPatternTokens(pattern)` | throws `422 LETTER_REFERENCE_PATTERN_INVALID` on an unknown token, on no `SEQ` token, or on more than one `SEQ` token. Used by the #137 validator **and** re-applied at issue. |
| `renderPattern(pattern, { orgCode, typeToken, fy, pinnedDate, seq })` | substitutes; zero-pads `SEQ` to the declared width; returns the string. Throws `422 LETTER_REFERENCE_TOO_LONG` over 64 characters (the column width). |

* `{TYPE}` resolves to an uppercase abbreviation from the template code — `experience_letter` → `EXP`,
  `relieving_letter` → `REL`, `appointment_letter` → `APP`, `bonafide_letter` → `BON`,
  `confirmation_letter` → `CNF`. A frozen map in the registry entry (`reference_token`), **not** a
  string transform, so a new template cannot silently collide with an existing abbreviation.
  `assertValidEntry` enforces uniqueness of `reference_token` across the registry.
* `{ORG_CODE}` comes from the org profile; absent ⇒ the first eight characters of `org_id` (upper,
  hyphen-stripped). A letter must never fail to get a number because an optional org field is blank.
* `{YYYY}` / `{MM}` come from `pinnedDate`, never `new Date()`.

### 11.2 Financial year

**OD-4's recommendation is followed:** the FY comes from the org's existing payroll FY configuration
rather than a new knob. Resolution order:

1. If `payroll_settings` is readable (lazy-require, same D-18 pattern) and declares an FY start
   month, use it.
2. Otherwise April–March, formatted `YYYY-YYYY+1`.

The resolved FY is a pure function of `pinnedDate` plus that start month, and is unit-tested at the
boundary (31 March and 1 April) in both configurations. **A letter's FY is decided once, from
`pinnedDate`,** so a request that straddles midnight cannot land in two years.

### 11.3 Allocation

Inside the single issuing transaction (§14 step 13), through
`document_letter_sequence.repository.allocate(orgId, templateCode, fy, t)`:

```
1. SELECT … FROM document_letter_sequences
     WHERE org_id = :o AND template_code = :c AND financial_year = :fy
     FOR UPDATE                                     -- D-20
2. not found → INSERT (last_number = 1) ; on 23505 (a concurrent inserter won) → retry step 1 once
3. found     → UPDATE last_number = last_number + 1 RETURNING last_number
4. return renderPattern(..., seq = last_number)
```

The one-shot retry on 23505 is the only retry; a second collision means genuine pathology and is
allowed to surface. `FOR UPDATE` on one row per `(org, template, FY)` means contention is scoped to
one template in one org in one year — never org-wide serialisation (**EC-18**).

**Lock ordering.** This lock is taken **last** — after the letter-group advisory lock and after any
`org_documents` row lock — so Phase 2's order is always advisory lock → document row → sequence row,
never the reverse (§19.3).

### 11.4 When a number is burned

| Situation | Number consumed? |
|---|---|
| Validation fails, subject missing, template disabled | No — allocation has not happened |
| Renderer fails or times out | No — allocation is after the render |
| S3 write fails | No — same |
| Issuing transaction rolls back for any reason | No — the `UPDATE` rolls back with it |
| Issuing transaction commits, then something downstream fails | Yes, and correctly: the letter exists |
| An idempotent replay of a request that already succeeded | No — §20.2 short-circuits before allocation |
| Two concurrent issues, one loses the idempotency unique index | No — the loser hits the 23505 at the pending insert (§20.2), long before allocation |
| Any error raised *after* allocation but inside transaction B | No — the `UPDATE` rolls back, **but the counter is not reclaimed on the next successful call either**, so gaps remain possible; D-20 accepts them and nothing tries to reclaim one (§19.4) |

### 11.5 Why the number is not printed on the PDF in Phase 2

Parent §8.1 renders at step 9 and allocates at step 12. The number does not exist when the bytes are
produced, and the parent plan's own rationale for that ordering is explicit: *"The reference number
is allocated in step 12 and not earlier, so a render failure never burns a number."*

Three alternatives were considered and rejected:

1. **Allocate before the render.** Burns a number on every renderer timeout, and — worse — puts the
   number inside the view model, hence inside `input_hash`, hence inside the idempotency key, so
   every retry would compute a *different* key and issue a *second* letter. It would destroy
   idempotency to gain a printed line.
2. **Two renders (render, allocate, re-render with the number).** Doubles Lambda cost and latency,
   and D-16 says the second render is not byte-identical, so the stored `content_hash` would describe
   bytes nobody verified.
3. **Edit `v1.html` to add a Ref slot.** Conflicts with **D-2** template immutability. The three
   existing templates have a `doc-meta` block that currently prints the employee code, not a letter
   reference, so there is no slot to fill.

**Phase 2's answer:** the number is a first-class attribute of the letter *record* — persisted,
unique, returned by #139/#140/#141, visible in the employee's document detail, and citable in
correspondence. Printing it is a `v2` template concern with a clean shape (allocate in a short
transaction before the render, accept the burned number on failure, bump `pinned_version` to
`valid(1, 2)`), and it is listed as **OD-P2-1** for Phase 4 rather than smuggled in here.

---

## 12. Layer Responsibilities

| Layer | Owns | Must never |
|---|---|---|
| **Route** (`routes/document_letter.routes.js`) | path, method, `hrAuth` middleware array | contain logic |
| **Controller** (`controllers/document_letter.controller.js`) | `validateOrThrow` on body **and query** (Express 5), building the actor context (`actorId`, `ipAddress`, `requestId`), shaping the response | touch a model, open a transaction, format a date |
| **Validator** (`validators/document_letter.validator.js`) | Joi schemas, `unknown(false)`, the reference-pattern token check | read the database |
| **Service** (`services/document_letter.service.js`) | orchestration, transaction boundaries, authorization *decisions*, idempotency key computation, error mapping | render (delegates), assemble facts (delegates), format (delegates) |
| **Facts service** (`services/document_letter_facts.service.js`) | every source-data read | write anything, read the clock, format |
| **Builder** (`builders/letter_issue.builder.js`) | pure view-model assembly and required-field assertion | I/O of any kind |
| **Reference utils** (`utils/letter_reference.utils.js`) | pattern validation and rendering | database access |
| **Sequence repository** | the `FOR UPDATE` allocation | pattern knowledge |
| **`org_document.repository`** | the letter row, with `storage_key` confined | be called from a controller |
| **`pdf_render.service`** (common) | the render pipeline | know what a letter is |
| **`pdf_render_artifact.repository`** (common) | artifact rows, `SAFE_ATTRIBUTES` containment | leak `storage_key` or `input_snapshot` outside the two named escape hatches |
| **Cron** (`cron-jobs/pdf_artifact_sweeper.cron.js`) | schedule + a bounded sweep | contain the sweep logic (it lives in the service) |

---

## 13. Services — New and Changed

### 13.1 `document_letter.service.js` — new

| Method | Endpoint | §  |
|---|---|---|
| `issue({ orgId, actorId, payload, ipAddress, requestId })` | #139 | §14 |
| `list(orgId, filters)` | #140 | §16.2 |
| `detail(orgId, letterId)` | #141 | §16.3 |
| `reissue({ orgId, actorId, letterId, payload, … })` | #142 | §15 |

Private helpers: `_loadTemplateAndConfig`, `_loadAndAssertType`, `_resolveLetterPolicy`,
`_computeIdempotencyKey`, `_probeExisting`, `_writeLetterRow(…, t)`, `_auditShape`.

### 13.2 `pdf_render.service.js` — three additive changes

| Change | Before | After | Risk |
|---|---|---|---|
| Storage key | `buildObjectKey({ orgId, segments: ['pdf', sourceType, `${rendered.contentHash}.pdf`] })` | `buildGeneratedPdfKey({ orgId, sourceType, artifactId })` → `org/{orgId}/pdf/{sourceType}/{artifactId}.pdf` | **None** — `persist: true` has no caller in P1 (§1.4(2)) |
| `writeAudit` → `onReady` | `writeAudit(ctx, t)` called inside the ready transaction after `markReady` | same call site, renamed `onReady`; `writeAudit` kept as a deprecated alias so the two P1 preview callers are untouched; `ctx` gains `storageKey`, `contentHash`, `sizeBytes` | **None** — additive context fields, both names accepted |
| Redactable snapshot | `input_snapshot: viewModel` | `input_snapshot: inputSnapshot ?? viewModel`, new optional param; `input_hash` **still** over `viewModel` | **None** — default preserves P1 exactly |

Nothing else in the file changes. In particular the idempotency probe, the unique-violation re-read,
`verifyPdfBuffer`, `mapRenderError`, `safeMarkFailed` and both transaction boundaries are untouched —
they are the parts Phase 2 depends on most.

A comment must be added where `input_hash` is computed, stating that the hash covers the **full**
view model while `input_snapshot` may be a redacted projection, so a future reader does not assume
`sha256(canonicalJson(input_snapshot)) === input_hash`.

### 13.3 `document_letter_template.service.js` — one branch

`previewTemplate` gains: if `subject_user_id` is present, call the facts service and
`buildIssueViewModel({ …, isPreview: true })` instead of `buildPreviewViewModel`. The idempotency key
gains the subject id so two employees' previews are distinct artifacts. `persist` stays `false`; the
rate check, branding resolution, audit action (`pdf.preview_rendered`) and response shape are
unchanged. The audit `new_values` gains `subject_user_id` when present — HR previewing a named
employee's salary letter is an event worth recording.

`_writeConfig` (#137) gains `assertPatternTokens(data.reference_pattern)` before the transaction
opens.

### 13.4 `document_letter_branding.service.js` — unchanged

`resolveAssetSrcs`, `_resolveOneAsset`, `checkPreviewRate` are reused verbatim. Issuance calls
`resolveAssetSrcs` **before** opening any transaction, exactly as `previewTemplate` does, because it
performs S3 reads.

**Issuance is deliberately not rate-limited** by `checkPreviewRate`. A preview is a click that costs
a Lambda invocation and produces nothing; an issue is a deliberate act that produces a legal record,
is audited, and is naturally bounded by how many letters an HR user can mean to send. Bulk (Phase 4)
is where a cap belongs, and `letter_bulk_max_subjects` is already registered for it.

### 13.5 `document_upload.service.js` / `document_org.service.js` — the origin guards

* `document_org.service.issueFileUrl` (line ~399) and `confirmFile` (line ~425): after the existing
  row load and scope check, `if (row.origin === 'generated') throw new AppError(409, 'A generated
  document cannot be replaced by an upload', 'DOCUMENT_ORIGIN_GENERATED')`.
* `document_org.service.replace` (line ~662) gets the **same** guard. D-6 names only the two
  handshake methods, but `replace` is the third door into the same state change: it starts a new
  version whose bytes come from an upload. Leaving it open would let HR silently replace a generated
  letter's bytes through a different endpoint, which is exactly what EC-28 exists to prevent.
  **Reissue (#142) is the sanctioned path** and is what the error message should point at.
* `document_upload.service` needs no guard: it serves the **employee** plane, and `origin` exists
  only on `org_documents`. Stated here so the next reader does not go looking.

### 13.6 `document_settings.service.js` — five keys

`MUTABLE_FIELDS` gains `letter_branding_enabled`, `letter_preview_rate_per_hour` (the P1 gap,
§1.4(7)), `letter_reference_pattern`, `letter_default_confidential`,
`letter_requires_acknowledgement_default`. `SETTINGS_CAPS` in `document_defaults.js` gains
`letter_preview_rate_per_hour: { min: 1, max: 1000 }`. The settings Joi in `document_hr.validator.js`
gains all five, with the pattern key routed through `assertPatternTokens`.

### 13.7 `org_document.repository.js` — projections

`LIST_ATTRIBUTES` and `DETAIL_ATTRIBUTES` gain `origin`, `generation_artifact_id` and
`reference_number`. `storage_key` and `reference_url` stay excluded. `findByIdForStorage` remains the
only key-reading method, and the generated-letter download path uses it unchanged.

Two new methods:

* `listGenerated(orgId, filters)` — #140, hitting `org_documents_org_generated_idx`.
* `findGeneratedById(orgId, id)` — #141; returns null for an uploaded row so #141 answers the uniform
  404 for a document that exists but is not a letter.

---

## 14. Issuance — End-to-End Flow (#139)

Fifteen ordered steps. **Transaction boundaries are marked. No network call happens inside a
transaction — the module's one rule with teeth.**

```
POST /api/v1/documents/hr/letters
{ template_code, subject_user_id, field_overrides?, effective_date?, idempotency_key? }

 --- no transaction open ---------------------------------------------------------
  1  authenticate → authorize(['hr']) → requireFeature('documents.access')
  2  validateOrThrow(issueLetterSchema)                       400 on unknown key
  3  registry.get(template_code)                              404 LETTER_TEMPLATE_UNKNOWN
  4  config = letterConfigRepo.findByOrgAndCode(...)
       !config || !is_enabled                              -> 409 LETTER_TEMPLATE_DISABLED
       version = config.pinned_version ?? entry.current_version      (EC-15: resolved ONCE)
  5  type = typeRepo.findByCode(orgId, entry.document_type_code)
       !type              -> 409 DOCUMENT_TYPE_NOT_ACTIVATED
       !type.is_active    -> 409 DOCUMENT_TYPE_INACTIVE
       type.plane!=='org' -> 422 DOCUMENT_TYPE_PLANE_MISMATCH
  6  settings = documentSettingsService.getOrCreate(orgId)
  7  assert field_overrides keys ⊆ declared fields            422 LETTER_FIELD_UNKNOWN
     assert field_overrides ∩ derived_fields = ∅              422 LETTER_FIELD_NOT_OVERRIDABLE
  8  pinnedDate = effective_date ?? todayIso()                ONE clock read, here only
  9  facts = lettersFactsService.resolve(orgId, subject_user_id, { needs })
       subject not found in org -> 404 DOCUMENT_NOT_FOUND     (uniform denial)
       required fact missing    -> 422 LETTER_FACTS_MISSING
 10  branding = brandingService.resolveAssetSrcs(orgId, settings)     [S3 READS]
 11  viewModel = buildIssueViewModel({...})                   422 PDF_DATA_INCOMPLETE
 12  idempotencyKey = §20.1
     probe = artifactRepo.findByOrgAndKey(orgId, key)
       probe ready -> load org_documents by probe.source_id
                      -> 200 { ..., reused: true }            STOP. No number. No new row.
     documentId = crypto.randomUUID()                         pre-generated, like createDraft

 --- pdf_render.service.renderAndRecord(persist:true, sourceId:documentId) --------
 13a [txn A] INSERT pdf_render_artifacts pending (source_id = documentId)   COMMIT
 13b renderPdf(...)                                           [NETWORK, no txn]
 13c verify magic bytes / %%EOF / size ; sha256               [no txn]
 13d putObject(org/{orgId}/pdf/letter/{artifactId}.pdf)        [NETWORK, no txn]
 13e [txn B]  BEGIN
       markReady(artifact, { content_hash, size_bytes, render_ms, storage_key })
       onReady(ctx, t):
         B1  advisoryLockGroup(orgId, groupId, t)             -- `docorg:` key, §19.3
         B2  re-resolve subject minimally (facts.resolve(..., { transaction: t }))
               gone/soft-deleted -> throw 404   (EC-22)
         B3  re-assert type active (typeRepo.findByCode(..., { transaction: t }))
               inactive -> throw 409 DOCUMENT_TYPE_INACTIVE   (EC-23)
         B4  reference_number = sequenceRepo.allocate(orgId, code, fy, t)   -- D-20
         B5  INSERT org_documents {
               id: documentId, document_group_id: groupId, version: 1,
               status: 'published', origin: 'generated',
               generation_artifact_id: artifactId, reference_number,
               document_type_id: type.id, title, description,
               storage_backend: 's3', storage_key, file_name, content_type,
               size_bytes, checksum_sha256: content_hash, confirmed_at: now,
               included_users: [subject_user_id], targeting: <frozen snapshot>,
               requires_acknowledgement, acknowledgement_due_days, is_confidential,
               requires_signature: false, recipient_count: 1,
               materialisation_state: 'not_required',
               published_by: actorId, published_at: now,
               created_by: actorId }
         B6  recipientService.materialise({ orgId, orgDocumentId: documentId,
                                            userIds: [subject], source: 'publish',
                                            dueOn: resolveDueOn(...) }, t)
         B7  audit letter.generated   (entity pdf_render_artifact, id artifactId)
         B8  audit letter.issued      (entity org_document,        id documentId)
     COMMIT
 --- back in the controller -------------------------------------------------------
 14  201 { letter: {...}, reference_number, artifact: { id, size_bytes, content_hash } }
 15  one structured log line (parent §10 observability shape)
```

### 14.1 Why `source_id` is set at the pending insert

The `org_documents` id is generated **before** `renderAndRecord` is called, exactly as
`document_org.service.createDraft` pre-generates its ids. That lets the pending artifact carry
`source_id` from the start, which means `pdf_render_artifacts_source_uniq`
(`UNIQUE (org_id, source_type, source_id) WHERE source_id IS NOT NULL AND status <> 'failed'`)
protects the letter↔artifact relationship from the first write rather than from the last. A failed
render flips the row to `failed`, which releases the partial index, so a retry with a fresh
`documentId` is unobstructed.

### 14.2 Why the letter row is written inside `onReady`

`markReady` and the letter row must commit together or not at all: a `ready` artifact with stored
bytes and no letter row is an orphan object with no owner, and a letter row pointing at a `pending`
artifact would violate `org_documents_generated_chk`. The `onReady` hook is the only place in the
pipeline where a transaction is open **after** the object exists. Using it is why Phase 2 needs no
new transaction of its own for the record-creating half.

### 14.3 Why `source: 'publish'`

`org_document_recipients.source` is `ENUM('publish','sync')`. A letter's recipient row is created by a
publish, so `'publish'` is both the only legal value and the semantically right one — **no enum
migration is required**, and adding a `'letter'` value would break the existing sync/top-up logic that
branches on these two.

### 14.4 What is deliberately not in the flow

* No email, no attachment (parent §8.1).
* No `document_notification` enqueue in Phase 2 — §24 explains what is raised instead and why.
* No `assertUploadAllowed` / `assertPolicyHasUsableContentType`: those gate a **user's** upload
  against the org's allowed content types. The content type here is ours and is always
  `application/pdf`. An org whose policy happens to exclude PDF must not be blocked from receiving
  its own generated letters. Stated so the next reader does not "fix" the omission.
* No `allows_multiple` single-instance check: that guard belongs to `employee_documents`, and a
  second bonafide letter is legitimate. The idempotency key is the duplicate guard here.

---

## 15. Reissue — End-to-End Flow (#142)

```
POST /api/v1/documents/hr/letters/:id/reissue      { field_overrides?, reason?, idempotency_key? }

 --- no transaction open ---------------------------------------------------------
 1  authorize(['hr']) + requireFeature
 2  prev = orgDocRepo.findGeneratedById(orgId, id)
      null (missing / cross-org / deleted / uploaded) -> 404 DOCUMENT_NOT_FOUND
      prev.status !== 'published'                     -> 409 LETTER_NOT_REISSUABLE
 3  steps 3–11 of §14, re-resolved from CURRENT data, with:
      template_code   = derived from prev (stored in the audit shape / type mapping)
      subject_user_id = prev.included_users[0]
      version resolved NOW (may differ from prev — recorded on the new artifact)
 4  idempotencyKey = sha256('letter:reissue:' + orgId + ':' + prev.id + ':' + keySuffix)  §20.1
      probe ready -> return the existing successor, 200 reused:true.  STOP.
 5  documentId = crypto.randomUUID()

 --- renderAndRecord(persist:true, sourceId:documentId) ---------------------------
 6a [txn A] pending artifact                                   COMMIT
 6b render                                                     [NETWORK]
 6c verify + hash
 6d putObject (new artifactId -> new key; old object untouched) [NETWORK]
 6e [txn B]  BEGIN
      markReady(...)
      onReady:
        C1 advisoryLockGroup(orgId, prev.document_group_id, t)           -- FIRST
        C2 prevLocked = orgDocRepo.findById(orgId, prev.id,
                            { lock: true, transaction: t })            -- THEN row lock
             prevLocked.status !== 'published' -> throw 409 LETTER_NOT_REISSUABLE
        C3 re-assert subject + type (as B2/B3)
        C4 reference_number = sequenceRepo.allocate(...)            -- a NEW number
        C5 UPDATE prev -> status 'superseded', superseded_at = now
        C6 INSERT org_documents { ...as B5,
             document_group_id: prev.document_group_id,
             version: prev.version + 1,
             supersedes_id: prev.id }
        C7 recipientService.materialise(... new documentId ...)
        C8 audit letter.generated  (artifact)
        C9 audit letter.reissued   (org_document, old_values = prev shape,
                                    new_values = new shape, reason)
    COMMIT
 7  201 { letter, reference_number, supersedes: { id, version, reference_number } }
```

### 15.1 Invariants reissue must preserve

| Invariant | Mechanism |
|---|---|
| Exactly one published version per group | `org_documents_published_group_unique_idx`; a 23505 maps to `409 ORG_DOCUMENT_ALREADY_PUBLISHED` — the same translation `publish` already uses |
| The superseded letter keeps its bytes, artifact, number and acknowledgements | Nothing in the flow touches the old row except `status` and `superseded_at`; the old `storage_key`, `generation_artifact_id` and `reference_number` are left exactly as they are, and the old object is never deleted (**D-5**, **D-11**) |
| Two concurrent reissues of the same letter produce one successor | C1 serialises them; the loser finds `prevLocked.status === 'superseded'` at C2 and gets `409` |
| A reissue never runs on a letter the caller cannot see | Scope is checked at step 2, **before** existence is disclosed |
| The version chain is readable forever | `supersedes_id` + `version`, the same chain `replace` builds for uploads |

### 15.2 Not in scope for reissue

Retiring a letter, deleting a letter, and reissuing a **superseded** letter (only the published
version is reissuable — reissuing an old version would fork the group). Retire already exists on the
org-document path and works on a generated letter unchanged.

---

## 16. API Contracts — #139 … #142

All four are appended to the **existing** `routes/document_letter.routes.js`, which already mounts
first at `/api/v1/documents/hr` (`document.index.js:20`). `letters` is a fresh literal segment: no
existing route can swallow it and it can swallow nothing.

```js
// -- Letters (#139–#142) ----------------------------------------------------
router.post('/letters', hrAuth, letterController.issue)                 // #139
router.get('/letters', hrAuth, letterController.list)                   // #140
router.post('/letters/:id/reissue', hrAuth, letterController.reissue)   // #142
router.get('/letters/:id', hrAuth, letterController.detail)             // #141
```

`:id/reissue` is registered before `/letters/:id` to match the file's existing most-specific-first
convention, even though the methods differ. `hrAuth` is reused verbatim — no new middleware array, no
new role, no new feature flag.

### 16.1 #139 `POST /api/v1/documents/hr/letters`

**Request**

```json
{
  "template_code": "experience_letter",
  "subject_user_id": "b1f2…",
  "field_overrides": { "purpose": "Visa application" },
  "effective_date": "2026-09-27",
  "idempotency_key": "client-supplied-opaque-string"
}
```

| Field | Rules |
|---|---|
| `template_code` | required, string, must exist in the registry |
| `subject_user_id` | required, uuid |
| `field_overrides` | optional object, depth 1, ≤ 20 keys; each value a string ≤ 500 chars, a number, or a boolean; keys must be declared by the template and must not be `derived_fields` |
| `effective_date` | optional ISO date; must be within ± 365 days of today (**EC-P2-2** — an absurd date would print a letter dated 1970) |
| `idempotency_key` | optional string 8–120 chars, `^[A-Za-z0-9._:-]+$` |

`unknown(false)`: an unrecognised top-level key is `400 VALIDATION_ERROR`, consistent with every other
document endpoint.

**201**

```json
{
  "success": true,
  "message": "Letter issued",
  "data": {
    "letter": {
      "id": "…", "document_group_id": "…", "version": 1,
      "status": "published", "origin": "generated",
      "reference_number": "ACME/EXP/2026-2027/0007",
      "document_type_id": "…", "title": "Experience Letter — Asha Rao",
      "file_name": "experience-letter-asha-rao-2026-09-27.pdf",
      "size_bytes": 84213, "checksum_sha256": "…",
      "is_confidential": true, "requires_acknowledgement": false,
      "recipient_count": 1, "published_at": "2026-09-27T09:14:22.183Z",
      "template": { "code": "experience_letter", "version": 1 }
    },
    "artifact": { "id": "…", "size_bytes": 84213, "content_hash": "…" },
    "reused": false
  }
}
```

An idempotent replay returns the **same body with `reused: true` and status `200`** instead of `201`,
so a client can tell the difference without parsing. No `storage_key`, no download URL, no view model
and no HTML appear in the response, ever. HR downloads through the existing
`#57 GET /org-documents/:id/view-url`.

**Errors**

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | schema |
| 403 | `FEATURE_NOT_ENABLED` / role denial | middleware |
| 404 | `LETTER_TEMPLATE_UNKNOWN` | code not in the registry |
| 404 | `DOCUMENT_NOT_FOUND` | subject missing, cross-org, or soft-deleted (**uniform denial**) |
| 409 | `LETTER_TEMPLATE_DISABLED` | no config row, or `is_enabled = false` |
| 409 | `DOCUMENT_TYPE_NOT_ACTIVATED` / `DOCUMENT_TYPE_INACTIVE` | seeder 010 not run, or the type was deactivated |
| 409 | `PDF_RENDER_IN_PROGRESS` | a concurrent request with the same key is still rendering |
| 409 | `LETTER_REFERENCE_CONFLICT` | 23505 on the reference unique index |
| 409 | `PDF_RETRY_LIMIT_EXCEEDED` | §20.4 salt ceiling reached |
| 422 | `DOCUMENT_TYPE_PLANE_MISMATCH` | the mapped type is not `org` plane |
| 422 | `LETTER_FIELD_UNKNOWN` / `LETTER_FIELD_NOT_OVERRIDABLE` | §1.4(4) |
| 422 | `LETTER_FACTS_MISSING` | a required fact is absent (names the fields) |
| 422 | `PDF_DATA_INCOMPLETE` | a `required_fields` entry is unresolved |
| 422 | `PDF_TOO_LARGE` | rendered bytes over 6 MB |
| 422 | `LETTER_REFERENCE_PATTERN_INVALID` / `LETTER_REFERENCE_TOO_LONG` | §11.1 |
| 500 | `PDF_TEMPLATE_INVALID` | the renderer rejected the template — a deploy bug, not user input |
| 500 | `DB_COMMIT_FAILED` | transaction B failed after the object was stored |
| 502 | `PDF_RENDERER_UNAVAILABLE` / `STORAGE_UNAVAILABLE` | mapped by `mapRenderError` |
| 503 | `PDF_RENDERER_NOT_CONFIGURED` | env missing |
| 504 | `PDF_RENDER_TIMEOUT` | renderer exceeded `PDF_TIMEOUT` |

Every 5xx body carries `artifact_id` so an operator can join the response to the `failed` row without a
log search. No 5xx body carries a renderer URL, an API key, a storage key or a stack trace.

### 16.2 #140 `GET /api/v1/documents/hr/letters`

Query parameters, validated **inside the controller** via `validateOrThrow` because Express 5's
`req.query` is getter-only:
`template_code`, `subject_user_id`, `document_type_id`, `status` (`published|superseded|retired`),
`reference_number` (exact match), `issued_from`, `issued_to`, `page` (≥ 1), `limit` (1–100, default
20), `sort` (`published_at|reference_number`, default `published_at`), `order` (`asc|desc`, default
`desc`).

`issued_from > issued_to` ⇒ `400`. Rows are restricted to `origin = 'generated'`,
`deleted_at IS NULL`, scoped by `org_id`, and projected through `LIST_ATTRIBUTES` so `storage_key`
cannot appear. The response uses the module's standard
`{ items, pagination: { page, limit, total, total_pages } }`.

Confidential letters are **not** hidden from HR: HR is the upper bound of the confidentiality boundary
on the org plane, and P1's #52 already exposes confidential org documents to HR.

### 16.3 #141 `GET /api/v1/documents/hr/letters/:id`

Extends the #55 detail shape with `origin`, `reference_number`, the version chain (`version`,
`supersedes_id`, `superseded_at`) and:

```json
"generation": {
  "artifact_id": "…", "template_code": "experience_letter", "template_version": 1,
  "renderer_version": "chromium-…", "input_hash": "…", "content_hash": "…",
  "size_bytes": 84213, "render_ms": 1840, "retention_class": "record",
  "generated_at": "2026-09-27T09:14:21.006Z", "pinned_date": "2026-09-27"
}
```

The artifact is read through `SAFE_ATTRIBUTES`, so `storage_key` and `input_snapshot` are structurally
unable to appear. `input_hash` is exposed deliberately: it lets an auditor prove two letters came from
identical inputs without exposing the inputs.

`404 DOCUMENT_NOT_FOUND` covers id-not-found, cross-org, soft-deleted **and an uploaded document**
(`origin = 'uploaded'`). #141 answers only about letters; HR uses #55 for uploads.

### 16.4 What is deliberately **not** added

| Not added | Why |
|---|---|
| An employee "my letters" endpoint | D-6 — a letter *is* an `org_document`; `#63` lists it, `#64` details it, `#65` mints the signed view URL, `#66/#67` acknowledge it |
| A manager endpoint | `#71/#72` already read the team's org documents under existing manager scoping |
| A letter download endpoint | `#57` (HR) and `#65`/`#128` (employee) already presign from `storage_key`; a second download path is a second place to get access control wrong |
| Letter delete / retire | `#49` and `#51` operate on a generated row unchanged |
| A letter audit-log endpoint | `#58` already returns the trail for any `org_document`, including the new `letter.*` actions |
| Bulk issue | Phase 4 |

**This is the D-6 dividend and Phase 2's largest single saving: four new endpoints instead of twelve.**

### 16.5 Registry and change-record obligations

* `public/md_system/api_registry.md` gains rows #139–#142.
* A dated change record in `public/md_updates/` covers: the four new endpoints; the three new fields
  (`origin`, `reference_number`, `generation`) appearing on the **existing** #52/#55/#63/#64 responses;
  the five new settings keys on the settings endpoint; and the new `409 DOCUMENT_ORIGIN_GENERATED` that
  #45/#46/#48 can now return.
* `public/md_settings/org_settings_registry.md` gains #84–#86 and corrects the two P1 omissions.

The #45/#46/#48 error addition is the only **behavioural** change to an existing endpoint, and it is
reachable only for a generated document — which no client can have encountered before Phase 2.

---

## 17. Business Rules & Validations

Numbering continues from Phase 1's BR-16.

| # | Rule | Enforced | Violation |
|---|---|---|---|
| BR-17 | A letter may be issued only from an **enabled** config row for a registry template | §14 step 4 | 409 `LETTER_TEMPLATE_DISABLED` |
| BR-18 | The template version is resolved **once** per request (`pinned_version ?? current_version`) and recorded on the artifact | §14 step 4 | EC-15 |
| BR-19 | The mapped document type must exist, be active, and be `org` plane | §14 step 5, re-checked at B3 | 409 / 422 |
| BR-20 | `field_overrides` may not target a `derived_fields` key | validator + §14 step 7 | 422 `LETTER_FIELD_NOT_OVERRIDABLE` |
| BR-21 | Every `required_fields` entry must resolve non-blank; a letter never ships a blank slot | builder | 422 `PDF_DATA_INCOMPLETE` |
| BR-22 | Every date in a letter derives from one `pinnedDate`; no builder reads the clock | builder contract | T-20 |
| BR-23 | A generated letter always has `origin='generated'`, `status='published'`, `version ≥ 1`, and both `generation_artifact_id` and `reference_number` set | `org_documents_generated_chk` | 500 (a bug) |
| BR-24 | The letter row and its `ready` artifact commit together or not at all | §14 step 13e | — |
| BR-25 | `reference_number` is unique per org among live letters | `org_documents_reference_uniq` | 409 `LETTER_REFERENCE_CONFLICT` |
| BR-26 | A number is allocated under `FOR UPDATE`, **after** the render, never before | §11.3 | — |
| BR-27 | One published version per document group | P1's `published_group_unique_idx` | 409 `ORG_DOCUMENT_ALREADY_PUBLISHED` |
| BR-28 | A generated document cannot be replaced by an upload (`file`, `file/confirm`, `replace`) | §13.5 | 409 `DOCUMENT_ORIGIN_GENERATED` |
| BR-29 | Only a **published** letter may be reissued | §15 step 2, re-checked under lock at C2 | 409 `LETTER_NOT_REISSUABLE` |
| BR-30 | A reissue supersedes exactly one predecessor and never deletes its bytes, artifact or number | §15 C5/C6 | — |
| BR-31 | The idempotency key is a pure function of resolved inputs and **excludes** the reference number | §20.1 | T-28 |
| BR-32 | `reference_pattern` contains only whitelisted tokens and exactly one `SEQ` token | `assertPatternTokens`, on write **and** at issue | 422 |
| BR-33 | Confidentiality and acknowledgement requirements are read from org settings at issue time and frozen onto the row | §14 B5 | — |

---

## 18. Authorization & Security

### 18.1 Role plane

All four endpoints are `hr` only, through the **existing** `hrAuth` array
(`authenticate`, `authorize(['hr'])`, `requireFeature('documents.access')`). No new role, no new
middleware, no new feature flag.

`admin` and `super-admin` are **platform** roles and receive no tenant data access, so they are not in
the array and must not be added. A platform operator who needs to see that letters exist uses platform
telemetry, not `/documents/hr/letters`. `employee` and `manager` reach letters only through the
existing org-document endpoints listed in §16.4, under the scoping those endpoints already enforce.

### 18.2 Uniform denial

Cross-org, non-existent, soft-deleted, and "exists but is not a letter" all return an **identical**
`404 DOCUMENT_NOT_FOUND` with no distinguishing field, message or timing branch. Scope is evaluated
**before** existence: every repository predicate carries `org_id`, so a cross-org id simply returns no
row and the caller cannot tell which of the four cases it hit. This is the module's established
semantics and Phase 2 adds no exception to it.

`404 LETTER_TEMPLATE_UNKNOWN` is deliberately *not* uniform — the registry is code, identical for every
org, so naming an unknown template code discloses nothing tenant-specific.

### 18.3 Subject scoping

HR may issue a letter for any user in its own org, including managers and other HR users. There is no
manager-issues-for-report path in Phase 2 (§1.2). The subject is resolved through the facts service,
whose every predicate is `(org_id, user_id)`; a subject in another org is indistinguishable from a
subject that does not exist.

A letter is issued to **exactly one** subject (`included_users: [subject_user_id]`,
`recipient_count: 1`, `materialisation_state: 'not_required'`). Phase 2 writes no rule-based targeting
snapshot that could later expand to include other employees.

### 18.4 Access to the generated PDF

| Reader | Path | Control |
|---|---|---|
| HR | `#57 GET /org-documents/:id/view-url` | `hrAuth` + org scope; short-lived presigned GET |
| Subject employee | `#65 GET /me/org-documents/:id/view-url` | recipient row must exist for the caller |
| Manager | `#72` | existing manager→report scoping |
| Anyone else | — | no row, no URL |

Consequences that follow from D-6 rather than from new code: confidentiality is enforced by the
existing composer; a superseded letter remains readable by the employee who received it; a retired
letter is withdrawn by the existing retire path. **`storage_key` is never returned by any of the four
new endpoints**, and the only method that reads it is P1's `findByIdForStorage`, unchanged.

Presigned URL lifetime, headers and `Content-Disposition` are whatever P1's
`document_org_read.service.viewUrl` already produces. Phase 2 does not fork a second download path,
because a second path is a second place to get access control wrong.

### 18.5 Sensitive data: the `input_snapshot` redaction rule

From Phase 2 onward `input_snapshot` contains a real employee's name, designation, dates, salary and
exit details. Three rules:

1. **Never projected.** `SAFE_ATTRIBUTES` omits `input_snapshot` and `storage_key`; the only readers
   are the two named escape hatches. #141 returns `input_hash`, never the snapshot.
2. **Redacted before storage — specifically the branding roots.** `resolveAssetSrcs` returns
   **presigned S3 URLs**, which embed the branding asset's storage key and expire within the hour.
   Persisting them would (a) write a storage key into a column the containment rules keep keys out of,
   and (b) store a value that is useless by the time anyone reads it. So the issuance path passes the
   new optional `inputSnapshot` parameter (§13.2) holding the view model with every
   `branding.*_src` replaced by `'[redacted]'` and `branding.hash` retained.
   **`input_hash` is still computed over the full view model** so the hash keeps its meaning as a
   fingerprint of what was actually rendered. The code comment required by §13.2 exists so nobody later
   assumes `sha256(canonicalJson(input_snapshot)) === input_hash`.
3. **Retention follows the letter.** A `record`-class snapshot lives as long as its artifact, which
   lives as long as the letter. That is defensible because the snapshot discloses nothing the stored
   PDF does not already contain, to a reader who already has row access. It is recorded as a data-map
   line in the change record so the obligation is visible rather than implicit.

**The one place a snapshot may be read** is a future verification job (Phase 3, EC-19) via
`findForRenderById`. No request-serving code path reads it in Phase 2. A test asserts that no file
under `controllers/` or `routes/` references `input_snapshot`.

### 18.6 Renderer authentication (D-14) — release blocker

Phase 1 shipped against an **unauthenticated** Lambda endpoint, mitigated only by the fact that P1
sends sample data and branding. Phase 2 sends real employee PII across that wire, so the mitigation
expires with this phase.

Required before #139 is enabled in any environment holding real data:

* a shared secret header enforced **inside** the Lambda handler, rejecting with 401 before Puppeteer
  starts;
* the secret injected from the platform's existing secret source into `PDF_RENDERER_API_KEY`, which the
  P1 provider already reads and already excludes from every log line and error body;
* the API Gateway route not publicly discoverable, and throttling configured so a leaked URL cannot be
  used to burn Lambda budget;
* a startup assertion that the key is present when `NODE_ENV === 'production'`, failing fast rather
  than rendering unauthenticated. Absence maps to the existing `503 PDF_RENDERER_NOT_CONFIGURED`.

**Acceptance criterion A-1 does not pass until an unauthenticated request to the renderer is observed
to fail.** This is infrastructure work handed to the operator alongside the migration; it is on the
critical path and cannot be traded for schedule.

### 18.7 Injection and hostile input

| Vector | Control | Source |
|---|---|---|
| Field value containing HTML/script | Handlebars `{{ }}` escapes by default; templates use no `{{{ }}}` — enforced by the P1 template lint | D-2 |
| Field value driving a URL/image | Only branding assets produce URLs, and those come from our own S3 through `resolveAssetSrcs`; user fields never reach `src`/`href` | P1 |
| Remote resource fetch from the template | Renderer SSRF guard blocks `file://`, localhost and private ranges | P1 |
| Oversized field values | Joi caps (500 chars/field, 20 fields) plus `MAX_ASSEMBLED_BYTES` 256 KB | §16.1 |
| Hostile `reference_pattern` | token whitelist, one `SEQ`, 64-char output cap | §11.1 |
| Hostile template code | registry lookup only; the code never touches a path | P1 |
| Path traversal in a storage key | `buildGeneratedPdfKey` composes from `orgId` + a UUID; no user input reaches the key | §1.4(2) |
| Deserialisation of `field_overrides` | depth-1 object, primitives only, `unknown(false)` | §16.1 |

Phase 2 accepts **no template HTML, no CSS and no file uploads from the client.** The only client input
that reaches the renderer is a set of short scalar field values, and it reaches it escaped. That is the
whole of the attack surface and it is deliberately this small.

---

## 19. Transactions & Concurrency

### 19.1 Boundaries

| Txn | Opens | Contains | Duration target |
|---|---|---|---|
| A | `renderAndRecord` step 3 | one INSERT (`pending` artifact) | < 10 ms |
| — | **no transaction** | render (≤ 10 s), verify, hash, S3 put | the slow part |
| B | `renderAndRecord` step 9 | `markReady`, advisory lock, two re-checks, sequence `FOR UPDATE`, `org_documents` INSERT (+ the supersede UPDATE on reissue), recipient materialisation, two audit rows | **< 100 ms** |

Nothing else. No transaction spans the render. No transaction spans an S3 call. Never more than one
transaction open at a time. Both use P1's unmanaged-transaction discipline with
`if (!t.finished) await t.rollback()` in `finally`.

### 19.2 Why transaction B is allowed to do this much

Every statement in B is a local index-backed write or a single-row read; the only blocking wait is the
sequence row lock, held for the tail of B. The alternative — allocating the number in its own short
transaction before B — would let a crash between the two commits burn a number *and* leave an orphan
object, which is strictly worse than a 100 ms lock hold.

### 19.3 Lock ordering

```
1. advisory lock  pg_advisory_xact_lock(hashtext('docorg:{orgId}:{groupId}'))   -- P1's key
2. row lock       orgRepo.findById(orgId, id, { lock: true, transaction: t })   -- reissue only
3. row lock       document_letter_sequences … FOR UPDATE                        -- NEW in P2
```

**The advisory key must be P1's key, character for character.** `document_org.service.js:45`,
`document_recipient.service.js:28` and every other org-document flow lock on
`` `docorg:${orgId}:${groupId}` ``. A letter lives in the same `org_documents` group namespace, so
Phase 2 reuses that exact string — a `document_letter:`-prefixed lock would hash to a different value
and a reissue would **not** serialise against a concurrent `publish`, `replace`, `retire` or
`syncRecipients` on the same group. Follow the module's file-local convention: copy the four-line
`advisoryLockGroup` helper into `document_letter.service.js` with the same key, exactly as five existing
services already do. (The employee plane's `docgrp:` and the slot lock's `docslot:` are deliberately
different namespaces and must not be borrowed.)

Locks 1 and 2 therefore **are** P1's existing order — `document_org.service`,
`document_recipient.service` and `document_upload.service` all acquire advisory-then-row today. Phase 2
appends only the sequence row, at the bottom, and never takes it earlier. Consequences:

* Two P2 flows contend on the advisory lock first, so the second never reaches the row lock while the
  first holds it.
* A P1 flow and a P2 flow acquire locks 1 and 2 in the same order, so no cycle is reachable.
* The sequence row is always last and is released at commit, so it is never held while waiting for
  anything above it — asserted by T-14.

A 40P01 is still mapped to `409` and is safe to retry, because transaction B rolls back completely —
including the number.

### 19.4 Concurrency scenarios

| Scenario | Outcome |
|---|---|
| Two identical issues, sequential | the second returns `200 reused: true`; no render, no number |
| Two identical issues, concurrent | one renders and commits; the loser 23505s on `(org_id, idempotency_key)` at step 13a, re-reads the winner, and returns its result if `ready` or `409 PDF_RENDER_IN_PROGRESS` if still `pending`. **No number is burned** — the loser never reaches allocation |
| Two issues, different subjects, same template + FY | both succeed, serialising briefly on the sequence row; numbers are consecutive |
| Two reissues of the same letter | C1 serialises them; the loser observes `status = 'superseded'` at C2 and gets `409 LETTER_NOT_REISSUABLE` |
| Reissue racing HR `retire` on the same group | both take the advisory lock; the second observes the other's committed status and fails cleanly |
| Reissue racing an employee acknowledgement of the predecessor | independent tables; the acknowledgement stays on the predecessor. Correct — they acknowledged *that* version |
| Subject deactivated mid-flight | re-checked at B2 ⇒ B rolls back ⇒ no letter, no number, one orphan object the sweeper removes (**EC-22**) |
| Template disabled mid-flight | **not** re-checked; the version was pinned at step 4 and the bytes already exist. The letter is issued. Disabling stops *new* issuance; it does not abort work already paid for |
| Type deactivated mid-flight | re-checked at B3 ⇒ rolls back (**EC-23**). Unlike a template flag, an inactive type would produce a row that breaks the module's plane invariants |
| Sequence row contended by many concurrent issues | they queue on one row per `(org, template, FY)`; contention is never org-wide (**EC-18**) |
| Two orgs issuing simultaneously | fully independent — every lock key and index predicate includes `org_id` |

**Gap tolerance is still required** despite the ordering above: any error raised *after* B4 rolls the
allocation back, and Postgres sequence-free counters recover by simply moving on. D-20 accepts gaps;
nothing in Phase 2 attempts to reclaim one.

---

## 20. Idempotency, Retry & Duplicate Requests

### 20.1 Key derivation

```
keySuffix = client idempotency_key
          ?? sha256(canonicalJson({ template_code, template_version, subject_user_id,
                                    pinned_date, field_overrides_sorted,
                                    saved_fields_hash, branding_hash }))

issue   : sha256('letter:issue:'   + orgId + ':' + keySuffix)
reissue : sha256('letter:reissue:' + orgId + ':' + prevDocumentId + ':' + keySuffix)
preview : (P1, unchanged) 'preview:' + … + subject_user_id when present
```

Each choice is deliberate:

* **Org-prefixed** — two orgs cannot collide on a shared client key.
* **Reference number excluded** — including it would make every retry a different key (§11.5) and
  destroy idempotency outright.
* **`pinned_date` included** — the same letter issued tomorrow is genuinely a new letter.
* **`branding_hash` included** — a logo change changes the bytes, so it must change the key; otherwise
  an org that fixed its letterhead would be handed the stale PDF.
* **Predecessor id in the reissue key** — two reissues of *different* letters never collide even with
  the same client key, while a retried reissue of the *same* letter is idempotent.
* **Client key honoured when supplied** — a retrying client then owns its own deduplication window.

### 20.2 Three-layer duplicate defence

| Layer | Catches | Mechanism | Result |
|---|---|---|---|
| Pre-probe (§14 step 12) | a replay arriving after the first finished | `findByOrgAndKey`, `status = 'ready'` | `200 reused: true` — **no render, no Lambda call, no number** |
| Unique index at insert (13a) | two requests racing before either finished | `pdf_render_artifacts_org_key_uniq` → 23505 | P1's loser path: re-read the winner; `ready` ⇒ return it, `pending` ⇒ `409 PDF_RENDER_IN_PROGRESS` |
| `pdf_render_artifacts_source_uniq` | one `org_documents.id` used by two artifacts | partial unique index | 23505 → 500; reachable only through a UUID collision |

A replay arriving while the first render is in flight gets `409 PDF_RENDER_IN_PROGRESS`, not a second
render. That is the correct answer: the client retries, the retry hits the pre-probe, and is served the
finished letter.

### 20.3 Retry semantics by failure point

| Failure at | Artifact left as | Retryable with the same key? |
|---|---|---|
| Validation / facts (steps 1–11) | no row | Yes — nothing happened |
| Pending insert (13a) | none, or the winner's | Yes |
| Render (13b) | `failed` + truncated `failure_reason` | Yes — see §20.4 |
| Verification (13c) | `failed` | Yes |
| S3 put (13d) | `failed` | Yes |
| Transaction B (13e) | `pending` (`markReady` rolled back with it) | Yes; the sweeper later marks the stale row `failed` |
| After commit, before the response reaches the client | `ready`, letter exists | Yes — the pre-probe returns `reused: true`. **This is the case idempotency exists for** |

### 20.4 Retry against a `failed` row — EC-P2-3

`pdf_render_artifacts_org_key_uniq` is **not** partial: it covers `failed` rows. A same-key retry after
a hard failure therefore 23505s at 13a and finds an existing row that is neither `ready` nor `pending`
— a state P1 has no branch for, because P1's only caller is a non-persisted preview.

Phase 2's resolution, and the **one** place it adds logic inside the P1 pipeline rather than around it:

1. In the unique-violation recovery path, a `failed` existing row returns the mapped **original**
   failure (`502`/`504`) instead of `409 PDF_RENDER_IN_PROGRESS`, so the client is told the truth.
2. A caller who wants to genuinely retry supplies a **new** `idempotency_key`.
3. Because a *derived* key is a pure function of unchanged inputs, a derived-key retry would otherwise
   be permanently stuck on a transient outage. So the derived key carries a failure salt: the issuance
   service counts `failed` rows for the base key (a bounded `COUNT`) and appends `:r{n}`, up to
   **n = 5**, then `409 PDF_RETRY_LIMIT_EXCEEDED`.
4. A client-supplied key opts out of the salt entirely and owns its own retry policy.

Tested by T-30 … T-32. The alternative — making the unique index partial on `status <> 'failed'` —
was rejected: it would silently allow unbounded re-attempts of a template that is broken by
construction, and it mutates a P1 index rather than extending P1 behaviour.

### 20.5 What is *not* idempotent, and why that is correct

* Two issues of the same template for the same subject on **different** days produce two letters with
  two numbers. Employees legitimately need a second bonafide letter.
* Two issues with **different** `field_overrides` produce two letters. The content differs.
* `retire` and `delete` are P1 paths with P1 semantics; Phase 2 does not add idempotency keys to them.

---

## 21. Timeout & Resource Management

| Resource | Limit | Source | Behaviour at the limit |
|---|---|---|---|
| Renderer HTTP | `PDF_TIMEOUT` = 10 000 ms via `AbortSignal.timeout()` | P1 provider | `504 PDF_RENDER_TIMEOUT`, artifact `failed`, no number, no object |
| Lambda | 15 s | infrastructure | the client sees the 10 s abort first |
| Assembled HTML | 256 KB (service) / 512 000 B (renderer) | P1 | `422` **before** any network call |
| PDF bytes | 6 MB (API Gateway base64 ceiling) | P1 | `422 PDF_TOO_LARGE`, artifact `failed` |
| Facts reads | ≤ 6 queries, each index-backed on `(org_id, user_id)` | §10.1 | — |
| Branding S3 reads | ≤ 3, all before any transaction opens | P1 | mapped to `502` |
| Transaction B | target < 100 ms | §19.1 | `statement_timeout` as configured |
| Sequence lock | held for the tail of B only | §11.3 | waiters block, then proceed |
| Sweeper batch | 200 rows per run, one pass | §23 | the remainder waits for the next run |
| Peak memory per issue | one PDF buffer (≤ 6 MB) + one base64 string (≤ 8 MB) | P1 | released after the S3 put; **never held across transaction B** |
| HTTP request budget | ~13 s worst case (render 10 s + S3 + B) | — | ensure the ingress/ALB idle timeout exceeds it, else the client sees a 504 the server never sent |

Phase 2 adds **no** in-process queue, worker pool or concurrency limiter. Issuance is synchronous and
request-bounded; the natural limiter is the HTTP worker count. A cap belongs to bulk issuance
(Phase 4), where `letter_bulk_max_subjects` is already registered. Adding an unused limiter now would
be speculative machinery.

---

## 22. Error & Failure Handling

### 22.1 Principles

1. Fail before spending — every validation that can run without I/O runs before the render.
2. One request, at most one Lambda invocation. Never retry the render in-process; only the client knows
   whether a user is still waiting.
3. A failure must leave a row that names it: `failed` + `failure_reason` (truncated to 500) +
   `failure_class`, and the `artifact_id` is returned in the 5xx body so an operator can join response
   to row without a log search.
4. Never delete a stored object from an error path — a delete racing a retry could remove a good
   object. Deletion is the sweeper's job, with the artifact row as its authority.
5. An unaudited state change does not happen: the audit write is inside transaction B, so if it fails
   the letter is not issued.

### 22.2 Matrix

| Failure | DB state | S3 state | Client sees | Recovery | Orphan? |
|---|---|---|---|---|---|
| Validation / facts | nothing written | nothing | 4xx | fix the request | no |
| Renderer 5xx / throttled / network | artifact `failed` | nothing | 502 `PDF_RENDERER_UNAVAILABLE` | retry (§20.4) | no |
| Renderer timeout | artifact `failed` | nothing | 504 `PDF_RENDER_TIMEOUT` | retry | no |
| Renderer not configured | artifact `failed` | nothing | 503 | fix env (see D-14) | no |
| Renderer rejects the template | artifact `failed` | nothing | 500 `PDF_TEMPLATE_INVALID` | **fix the template — a deploy bug, not user input** | no |
| Bad PDF bytes (magic / `%%EOF` / size) | artifact `failed` | nothing | 422 | investigate the renderer | no |
| S3 put fails | artifact `failed` | nothing | 502 `STORAGE_UNAVAILABLE` | retry | no |
| Transaction B fails (any cause) | artifact stays `pending` | **object exists** | 500 `DB_COMMIT_FAILED` | retry creates a new artifact and a new object | **yes, one object** |
| Process killed between the put and B | artifact `pending` | object exists | dropped connection | same | **yes** |
| `markReady` succeeds, `onReady` throws | both rolled back | object exists | the mapped error | same | **yes** |
| Recipient materialisation fails | rolled back | object exists | 500 | same | **yes** |
| Audit write fails | rolled back — **no letter** | object exists | 500 | same | **yes** |
| Reference unique violation (23505) | rolled back | object exists | 409 `LETTER_REFERENCE_CONFLICT` | retry; a new number is drawn | **yes** |
| Published-group unique violation | rolled back | object exists | 409 `ORG_DOCUMENT_ALREADY_PUBLISHED` | reconcile, then retry | **yes** |
| Deadlock (40P01) | rolled back | object exists | 409 | retry | **yes** |

### 22.3 Orphan objects — the one recoverable inconsistency

Every orphan row above has the same shape: **a stored object whose artifact never reached `ready`.**
Both halves are discoverable:

* the artifact row, `status IN ('pending','failed')`, found by `pdf_render_artifacts_pending_idx`;
* the object at `org/{orgId}/pdf/letter/{artifactId}.pdf`.

Because §1.4(2) made the key derivable from `artifactId`, **the sweeper can reconstruct the key from
the row even when `storage_key` was never written** — which is precisely the transaction-B-failure
case. That is the second reason for the key change, and it is why Phase 2 needs no reconciliation
index and no S3 listing job. §23 is the whole remedy.

### 22.4 Orphan records — structurally impossible in Phase 2

The mirror case, a letter row whose object is missing, cannot be produced by this ordering: the object
exists before the row is written, and the row is never written outside the transaction that flips the
artifact to `ready`. `org_documents_generated_chk` makes the illegal intermediate unrepresentable.

It can arise only from out-of-band deletion — a lifecycle rule, an operator, a bucket policy — which is
**EC-19**. `retention_class = 'record'` exists so no lifecycle rule targets these objects, and the
operator hand-back (§29) states that requirement explicitly.

### 22.5 Never done on failure

Never delete an object in a request path. Never mark an artifact `ready` outside transaction B. Never
write a letter row pointing at a non-`ready` artifact "to be repaired later". Never surface a renderer
URL, API key, storage key, view model, rendered HTML or stack trace in an error body or log line. Never
swallow a failure by returning `200` with a partial letter.

### 22.6 EC-19 in Phase 2 — the stated remedy

Phase 2 **cannot** detect object loss, and says so rather than pretending otherwise. The letter
download path is P1's `document_org_read.service.viewUrl`, which mints a presigned redirect: our
process never reads the bytes, so a missing object surfaces as a 403/404 from S3 *to the browser*, not
as a detectable condition in the API. Adding a `HeadObject` to that hot path would put a network call
in front of every letter view for the sake of an event that requires a prior operational error.

Phase 2's remedy is therefore preventive and diagnostic, not corrective:

1. `retention_class = 'record'` on every issued letter's artifact, and a hand-back line forbidding
   lifecycle expiry on the `pdf/letter/` prefix (§29).
2. `content_hash` and `size_bytes` persisted on both the artifact and `org_documents.checksum_sha256`,
   so a recovered object can be proven to be the right one.
3. `input_snapshot` retained for `record`-class artifacts, so Phase 3's verification job can re-render
   and compare without asking HR to re-enter anything.
4. A Phase 3 entry, not a Phase 2 checkbox: a scheduled `HeadObject` sweep over `ready` record
   artifacts, reporting mismatches for repair.

This is honesty gap §1.3 item 4's companion and is recorded as **OD-P2-2**.

---

## 23. Background Job — the Artifact Sweeper

The only background work Phase 2 adds. It exists to close §22.3, and nothing else.

### 23.1 `src/cron-jobs/pdf_artifact_sweeper.cron.js`

Modelled exactly on `payroll_attachment_sweeper.cron.js` and `document_sweeper.cron.js`:
`node-cron`, `timezone: 'Asia/Kolkata'`, a `try/catch` that logs and never rethrows, a summary line
logged only when something happened, and a registration line at require time. Registered in
`src/server.js` after the existing document crons:

```js
require('./cron-jobs/pdf_artifact_sweeper.cron')   // PDF Phase 2: stale pending + orphan object sweep (03:50 IST)
```

**03:50 IST**, ten minutes after `document_sweeper` (03:30) and `payroll_attachment_sweeper` (03:30),
so the three destructive jobs do not contend for the same S3 and DB capacity. Daily, not frequent: an
orphan object costs pennies and nothing reads it, so there is no urgency that justifies a tighter loop.

It is **not** part of startup catch-up. It deletes objects, and the established rule in this codebase is
that the destructive job never runs at boot.

### 23.2 `pdfArtifactSweeperService.run({ orgId = null })` — the logic

Lives in `src/modules/document/services/pdf_artifact_sweeper.service.js`, so the cron file stays a
five-line wrapper and the same logic is reachable from a manual trigger.

```
1  rows = artifactRepo.findStalePendingForSweep({ orgId, olderThanMinutes: 30, limit: 200 })
       -- status='pending' AND created_at < now() - 30 min
       -- uses pdf_render_artifacts_pending_idx; returns id, org_id, source_type, storage_key
2  for each row (sequentially, never in parallel):
     a  key = row.storage_key ?? buildGeneratedPdfKey({ orgId, sourceType, artifactId })
     b  [txn] markFailed(row.id, row.org_id, 'swept: stale pending')      -- FIRST
     c  s3Provider.deleteObject({ key })                                  -- THEN, no txn open
          404/NoSuchKey -> counted as `already_absent`, not an error
          any other error -> counted, logged, continue to the next row
3  return { scanned, marked_failed, objects_deleted, already_absent, errors: [...] }
```

Five decisions worth stating:

* **30 minutes** is three times the worst-case request budget (§21). A `pending` row younger than that
  may still be a live request, and marking it `failed` would make a successful `markReady` fail.
* **Mark first, delete second.** If the delete fails, the row is already `failed` and the object is
  retried on no future run — so the sweep is *not* self-healing for delete failures, and that is
  deliberate: a repeated delete failure is an S3 permission problem an operator must see, not something
  a loop should mask. The error count in the summary is the signal.
* **Reconstructing the key** when `storage_key` is NULL is the whole reason for §1.4(2). This is the
  transaction-B-failure case, and without a derivable key the object would be unreachable.
* **Sequential, batch 200.** An unbounded sweep could delete thousands of objects in one run on a bad
  day; a bounded pass leaves the remainder for tomorrow and keeps the job's cost predictable.
* **Cross-org by design.** The cron passes `orgId: null`. This is the **only** cross-org read in the
  feature and is why `findStalePendingForSweep` is documented as cron-only, next to
  `findByIdWithKey`'s existing "P2 only" note. No request-serving code path may call it — asserted by
  a test that greps `controllers/` and `services/` other than the sweeper.

### 23.3 What the sweeper must never do

* Never touch a `ready` artifact. A `ready` row's object is a letter's bytes.
* Never touch a row younger than the threshold.
* Never delete an object whose artifact row it did not just mark `failed` — the row is the authority.
* Never run inside a request. There is no HR endpoint for it in Phase 2 (§1.2); an operator runs it via
  the cron or a one-off script. The existing `runJob` HR trigger pattern is available if Phase 3 wants
  one, and is explicitly out of scope here.

### 23.4 Failure and observability

A failure inside the loop is counted, logged with `artifact_id` and `failure_class`, and the loop
continues; one bad row never aborts the batch. The cron logs a single line when
`marked_failed + objects_deleted + errors.length > 0`, matching the existing sweepers' quiet-by-default
behaviour.

---

## 24. Events, Notifications & Downstream Integrations

### 24.1 Phase 2 enqueues no notification — and this is verified, not assumed

`document_notification.service.enqueue` validates `event_type` against the frozen five-entry
`EVENT_SETTING_TOGGLE` map and throws `500 NOTIFICATION_EVENT_UNKNOWN` for anything else. A
`letter.issued` email would therefore require **four** additions: a `NOTIFICATION_EVENT` constant in
`document_defaults.js`, a boolean toggle setting, an entry in `EVENT_SETTING_TOGGLE`, and an email body
in `buildEmailContent` — plus a `CTA_PATH_BY_ENTITY` entry. That is a notification feature, not a
side-effect of issuance, and the parent plan puts emailing in Phase 4. **Phase 2 adds none of it.**

### 24.2 What the employee is notified about anyway, for free

If the org's settings make letters acknowledgement-requiring, `recipientService.materialise` writes an
`org_document_recipients` row with a due date, and the **existing** `document_reminder` cron
(08:00 IST) already enqueues `acknowledgement_pending` for pending recipient rows — it is the only
producer of that event (`document_automation.service.js:260`). So an acknowledgement-requiring letter
generates an employee reminder with **zero Phase 2 notification code**, gated by the org's existing
`document_notify_pending_acknowledgement` toggle.

This is the correct amount of notification for Phase 2: the employee is told when they owe an action,
and is not emailed when they do not.

### 24.3 Downstream consumers that pick letters up without changes

| Consumer | Picks up a letter because |
|---|---|
| `#63/#64/#65` employee reads | it is an `org_document` with a recipient row (D-6) |
| `#71/#72` manager reads | existing manager→report scoping over org documents |
| `#66/#67` acknowledgement | recipient row exists; evidence tables are origin-agnostic |
| `#58` audit trail | the `letter.*` rows are ordinary `document_audit_logs` rows |
| `#76/#77` compliance + export | they read recipient state, not `origin` |
| `document_offboarding_archiver` cron | archives by recipient/user, not by origin — an exiting employee's letters are archived automatically |
| `document_composer.service` | the read-side composer already assembles org documents for the employee view |
| Retention / expiry crons | operate on `org_documents`; **letters carry no `expires_on`, so the expiry flip never selects them** |

Each row is a consequence of D-6 and required **no** Phase 2 work. The offboarding archiver is worth
calling out: an exiting employee's relieving letter is archived by the same job that archives their
uploads, which is the behaviour the business wants and which nobody has to write.

### 24.4 The one integration that must be re-verified, not assumed

`document_offboarding.service` reads the exit record that the facts resolver also reads. Phase 2 adds no
write to `employee_exits` and no new coupling — the resolver is read-only and lazily-required (§10.1).
The regression gate (§27.6) runs the existing offboarding suite unchanged to prove it.

---

## 25. Audit & Logging

### 25.1 Audit rows

| Action | Entity type / id | Written at | `new_values` |
|---|---|---|---|
| `letter.generated` | `pdf_render_artifact` / artifactId | B7 | `template_code`, `template_version`, `renderer_version`, `input_hash`, `content_hash`, `size_bytes`, `render_ms`, `retention_class`, `pinned_date` |
| `letter.issued` | `org_document` / documentId | B8 | `reference_number`, `template_code`, `template_version`, `subject_user_id`, `document_type_id`, `artifact_id`, `is_confidential`, `requires_acknowledgement` |
| `letter.reissued` | `org_document` / new documentId | C9 | the `letter.issued` shape **plus** `supersedes_id`, `previous_reference_number`, `reason`; `old_values` carries the predecessor's shape |
| `pdf.preview_rendered` | (P1, unchanged) | — | gains `subject_user_id` when #138 is called with a real subject |

`letter.generated` is written **before** `letter.issued` inside the same transaction, so a reader of
#58 sees cause before effect, and a partial trail is impossible. `document_audit.service.record`
already refuses to run without a transaction, which is what makes that guarantee structural rather
than conventional.

`entity_type` and `action` are `STRING(50)` on `document_audit_logs`, so **no enum migration is
needed** and all four action strings fit.

### 25.2 Never in an audit row

`storage_key`, `input_snapshot`, the view model, any rendered HTML, the renderer base URL, the renderer
API key, any presigned URL. `input_hash` and `content_hash` are recorded instead: they prove what was
rendered without storing it. `field_overrides` values are **not** copied into the audit row — the
letter itself is the record of its own content, and duplicating free-text into a second table doubles
the PII surface for no audit gain.

### 25.3 Log lines

One structured line per issue, in the parent §10 shape:

```
level=info event=letter.issued org_id=… actor_id=… request_id=…
  template=experience_letter/v1 artifact_id=… document_id=… reference=…
  render_ms=1840 size_bytes=84213 total_ms=2310 reused=false
```

Failures log `event=letter.issue_failed` with `failure_class`
(`validation | facts | renderer_timeout | renderer_5xx | renderer_rejected | storage | db_commit |
conflict`) and `artifact_id`. `failure_reason` passes through the existing 500-char truncation before
it is written or logged; a renderer response body is never interpolated raw.

The reused path logs `reused=true render_ms=0`, so the dashboard distinguishes a served replay from a
real render — without which the render-rate metric would silently under-report.

### 25.4 Never in a log line

The forbidden list of §25.2, plus: `field_overrides` values, the subject's name or any other letter
content, and `Authorization` header contents. Identifiers only. A log reader can reconstruct *which*
letter was issued and join to the row; they cannot read the letter from the logs.

### 25.5 Counters

`letters_issued_total{template}`, `letters_reused_total`, `letter_issue_failed_total{failure_class}`,
`render_ms` bucket counts, `sweeper_marked_failed_total`, `sweeper_objects_deleted_total`,
`sequence_allocations_total`. Emitted through the module's existing logger; Phase 2 adds no metrics
library and no new dependency (**D-19**).

---

## 26. Org Settings

### 26.1 New keys — #84 … #86

| # | Key | Type | Default | Effect |
|---|---|---|---|---|
| #84 | `letter_reference_pattern` | STRING(120), nullable | `NULL` ⇒ `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}` | org-wide reference format; per-template `reference_pattern` still wins (§11.1) |
| #85 | `letter_default_confidential` | BOOLEAN | `true` | frozen onto `is_confidential` at issue (BR-33) |
| #86 | `letter_requires_acknowledgement_default` | BOOLEAN | `false` | frozen onto `requires_acknowledgement`; when `true`, `acknowledgement_due_days` comes from the org's existing default |

Defaults chosen conservatively: letters carry salary and exit data, so confidential-by-default is the
safe failure mode; acknowledgement is off by default because an unnecessary acknowledgement obligation
creates overdue rows and reminder emails for every letter an org issues.

### 26.2 The Phase 1 gap this phase closes

`letter_branding_enabled` and `letter_preview_rate_per_hour` were added by P1's migration and **are
enforced** by `document_letter_branding.service`, but were never added to
`document_settings.service.MUTABLE_FIELDS` or to the settings Joi — so no HR user can change either.
Phase 2 adds both (§13.6) plus `letter_preview_rate_per_hour: { min: 1, max: 1000 }` to
`SETTINGS_CAPS`. This is a P1 defect fix, listed as deviation §1.4(7), and it is in scope because
Phase 2 is the first phase for which either value matters operationally.

### 26.3 Obligations

* All five keys are added to `public/md_settings/org_settings_registry.md` — the two P1 keys as
  corrections, the three new keys as additions (memory `org-settings-registry`).
* `letter_reference_pattern` is validated by `assertPatternTokens` on write, so a bad pattern is
  rejected at configuration time rather than at issue time — but it is re-validated at issue anyway,
  because a pattern could have been written before the validator existed (BR-32).
* The change record notes that the settings response gains five fields.

---

## 27. Testing

Node's built-in `node:test`, no database, no network — the P1 discipline unchanged. New files:
`tests/unit/pdf/letter_reference.test.js`, `letter_issue_builder.test.js`,
`letter_facts.test.js`, `letter_issue_service.test.js`, `letter_reissue.test.js`,
`letter_api_contract.test.js`, `pdf_artifact_sweeper.test.js`, plus additions to the existing
`pdf_render_service.test.js` and `letter_registry.test.js`.

### 27.1 Reference numbering — T-1 … T-5

| T | Asserts |
|---|---|
| T-1 | `assertPatternTokens` accepts every whitelisted token, rejects an unknown token, rejects zero `SEQ`, rejects two `SEQ` |
| T-2 | `renderPattern` zero-pads to the declared width; `SEQ:00` and `SEQ:000000` both work; output > 64 chars ⇒ `LETTER_REFERENCE_TOO_LONG` |
| T-3 | FY derivation at the boundary: 31 Mar and 1 Apr, in both an April-start and a January-start org (§11.2) |
| T-4 | `{ORG_CODE}` falls back to the org-id prefix when the profile has no code, and never emits a lowercase or spaced value |
| T-5 | `reference_token` is unique across the registry (fails if a new template collides) |

### 27.2 Issuance service — T-6 … T-14

| T | Asserts |
|---|---|
| T-6 | Happy path: one pending insert, one render, one put, one ready transaction, exactly one `org_documents` insert, one recipient row, two audit rows in `generated`→`issued` order |
| T-7 | Disabled config ⇒ 409, **zero** renderer calls |
| T-8 | Missing / inactive / wrong-plane type ⇒ 409/409/422, zero renderer calls |
| T-9 | `field_overrides` targeting a `derived_field` ⇒ 422, zero renderer calls |
| T-10 | A missing required fact ⇒ 422 `LETTER_FACTS_MISSING`, naming the fields, zero renderer calls |
| T-11 | Renderer timeout ⇒ 504, artifact `failed`, **no `org_documents` row, no sequence increment, no S3 put** |
| T-12 | S3 put failure ⇒ 502, artifact `failed`, no letter row, no number |
| T-13 | Transaction B throwing ⇒ 500 `DB_COMMIT_FAILED`, artifact remains `pending`, no letter row, no number, the object left behind is at the derivable key |
| T-14 | The order of operations inside B: advisory lock → re-checks → allocate → insert → materialise → audit (a call-order assertion, because a reordering would reintroduce the deadlock risk §19.3 removes) |

### 27.3 Determinism and the builder — T-15 … T-24

| T | Asserts |
|---|---|
| T-15 | `buildIssueViewModel` is pure: same inputs ⇒ deep-equal output, twice |
| T-16 | Precedence: savedFields override facts; overrides override savedFields; a blank override does not blank a fact |
| T-17 | Empty optionals are **omitted**, not emitted as `''` |
| T-18 | A missing `required_fields` entry ⇒ `PDF_DATA_INCOMPLETE` naming the key |
| T-19 | Depth ≤ 2, no `Date`, no function, no Sequelize instance anywhere in the output |
| T-20 | No builder reads the clock: freezing `Date.now` to two different values yields identical output (BR-22) |
| T-21 | `input_hash` is stable across key-insertion order (canonical JSON) |
| T-22 | `reference_number` is **absent** from the view model (§11.5) |
| T-23 | Both new templates lint clean: no `{{{`, no `<script>`, no remote `src`, only the four allowed helpers |
| T-24 | `derived_fields` ⊆ the union of `required_fields` and `optional_fields` for every registry entry |

### 27.4 Facts resolver — T-25 … T-27

| T | Asserts |
|---|---|
| T-25 | The three-way profile fallback resolves an employee, a manager and an HR subject; a subject in none ⇒ the uniform 404 |
| T-26 | `department_name` comes from `department_id` → `OrganizationDepartment`, **never** from the free-text `department`; a null `department_id` omits the field |
| T-27 | `needs` gating: a bonafide letter issues no payroll and no exit query (assert the mocked repositories were never called) |

### 27.5 Idempotency, concurrency and reissue — T-28 … T-38

| T | Asserts |
|---|---|
| T-28 | The derived key excludes `reference_number` and changes when `pinned_date`, `branding_hash` or an override changes (BR-31) |
| T-29 | Pre-probe on a `ready` row ⇒ `200 reused: true`, zero renderer calls, zero sequence increments |
| T-30 | 23505 at the pending insert with a `pending` winner ⇒ `409 PDF_RENDER_IN_PROGRESS` |
| T-31 | 23505 with a `ready` winner ⇒ the winner's result |
| T-32 | 23505 with a `failed` existing row ⇒ the **original** mapped failure; the salt increments `:r1`… and the sixth attempt ⇒ `409 PDF_RETRY_LIMIT_EXCEEDED` (§20.4) |
| T-33 | A client-supplied key bypasses the salt entirely |
| T-34 | Reissue supersedes exactly one predecessor, increments `version`, sets `supersedes_id`, allocates a **new** number, and leaves the predecessor's `storage_key`, artifact and number untouched |
| T-35 | Reissue of a `superseded` or `retired` letter ⇒ `409 LETTER_NOT_REISSUABLE` |
| T-36 | Reissue of an uploaded document ⇒ `404 DOCUMENT_NOT_FOUND` |
| T-37 | A 23505 on the published-group index ⇒ `409 ORG_DOCUMENT_ALREADY_PUBLISHED` |
| T-38 | A 23505 on the reference index ⇒ `409 LETTER_REFERENCE_CONFLICT` |

### 27.6 Security, sweeper and regression — T-39 … T-46

| T | Asserts |
|---|---|
| T-39 | No response body, error body or audit row from any of the four endpoints contains `storage_key`, `input_snapshot`, the renderer URL or the API key — a deep scan of the serialised output |
| T-40 | `input_snapshot` is written with `branding.*_src` redacted while `input_hash` still matches the full view model (§18.5) |
| T-41 | `origin='generated'` blocks `#45`, `#46` **and `#48 replace`** with `409 DOCUMENT_ORIGIN_GENERATED`; `origin='uploaded'` is unaffected |
| T-42 | Cross-org: every new endpoint returns the uniform 404 for another org's letter; no timing or message difference from a non-existent id |
| T-43 | The sweeper marks `failed` before deleting, reconstructs the key when `storage_key` is NULL, treats NoSuchKey as `already_absent`, never touches a `ready` row, never touches a row younger than 30 minutes, and stops at 200 |
| T-44 | `findStalePendingForSweep` is referenced only by the sweeper service — a source grep over `controllers/` and the other services |
| T-45 | The registry ↔ seeder-catalog consistency test: every registry entry's `document_type_code` is seeded by 009 or 010, and every 010 code maps to a registry entry |
| T-46 | **Regression gate:** the full suite passes at the count recorded in §2 pre-flight step 7 **plus** the new files, with zero changes to existing test files except the intentional additions in `pdf_render_service.test.js` |

T-46 is the gate that proves §1.4's deviations are non-breaking. If an existing test file needs editing
for a reason not listed in §1.4, that is a breaking change and the design is wrong.

---

## 28. Implementation Sequence

Twelve steps. Each has a verification that must pass before the next begins. No step depends on the DB
being migrated except where stated, so the whole sequence can be built and tested before the operator
runs `00056`.

| # | Step | Verify |
|---|---|---|
| 0 | **Operator, parallel track:** D-14 renderer auth (§18.6) | an unauthenticated renderer request returns 401 |
| 1 | Migration `00056` + models + repository projections (§6, §8, §13.7) | `node -e "require('./src/modules/document/models/org_documents.model')"` loads; a model/migration column-parity test passes; **migration not run** |
| 2 | Seeder `010` + the registry↔catalog test (§7) | T-45 green; seeder is idempotent on a re-read of its own guard |
| 3 | `letter_reference.utils` + the sequence repository (§11) | T-1 … T-5 green |
| 4 | `document_letter_facts.service` (§10.1) | T-25 … T-27 green |
| 5 | The two templates + `derived_fields` on all five registry entries (§9) | T-23, T-24 green; the P1 template lint still passes for the three existing templates |
| 6 | `letter_issue.builder` (§10.2) | T-15 … T-22 green |
| 7 | `pdf_render.service`: key change, `onReady` alias, `inputSnapshot` param, the `failed`-row branch (§13.2, §20.4) | the **existing** `pdf_render_service.test.js` passes unchanged, plus the new cases; T-40 green |
| 8 | `document_letter.service.issue` + controller + validator + route #139 (§14, §16.1) | T-6 … T-14, T-28 … T-33 green |
| 9 | `#140` list and `#141` detail (§16.2, §16.3) | T-39, T-42 green; `storage_key` absent from every projection |
| 10 | `#142` reissue (§15) | T-34 … T-38 green |
| 11 | Origin guards on `#45/#46/#48` + the five settings keys (§13.5, §26) | T-41 green; the existing org-document suite passes unchanged |
| 12 | Sweeper service + cron + `server.js` registration (§23) | T-43, T-44 green; **T-46 full-suite gate** |
| 13 | Docs: api_registry rows, settings registry, the dated change record, the completion report (§16.5, §26.3) | every new endpoint, field, error code and setting appears in exactly one registry row |

Step 7 is the risk concentration: it is the only step that edits a file Phase 1 shipped and Phase 1
tests cover. It is sequenced **before** any consumer of it so that if the "no existing test changes"
condition fails, it fails early and cheaply.

Steps 1 and 2 produce artefacts the operator must run. They are authored, tested statically, and handed
back — **never executed against the remote database by this work** (§29.2).

---

## 29. Deployment, Migration Hand-Back & Backward Compatibility

### 29.1 Deploy order

```
1. Operator: D-14 renderer authentication (§18.6)          -- BLOCKING, independent of the app deploy
2. Operator: npm run db:migrate          -> 00056
3. Operator: node scripts/seed.js 010    (or the project's seeder runner)
4. Deploy the application code
5. Verify: #135 still lists templates; #138 preview still renders; #139 issues one letter in a pilot org
6. Confirm the sweeper registration line appears in the boot log
```

Steps 2 and 3 must precede step 4. `00056` is purely additive, so running it **before** the deploy is
safe: the old code neither reads nor writes the new columns. Running it after the deploy is **not**
safe, because #139 would 500 on a missing column.

If step 1 is not complete, deploy with `#139`/`#142` unreachable rather than sending employee PII to an
unauthenticated endpoint. The cheapest switch is to withhold the two `router.post` lines; there is no
feature flag for this and Phase 2 does not add one, because the correct state is "authenticated", not
"configurable".

### 29.2 Migration hand-back

`00056` and seeder `010` are **authored, statically verified and unit-tested, and handed back unrun**.
No `db:migrate`, no `db:seed` and no connectivity check against the remote database was executed by
this work. The operator runs them.

What the operator must know:

| Item | Note |
|---|---|
| `00056` `up()` | additive only: one new table, three new nullable columns on `org_documents`, two new indexes, one new CHECK, three new settings columns. No data rewrite, no column drop, no type change |
| Locking | the `org_documents` `ALTER TABLE ... ADD COLUMN` calls are metadata-only on PG 11+; the new partial indexes are created in the same transaction as the rest — on a large `org_documents` this takes a brief `SHARE` lock. If the table is large, create the two indexes `CONCURRENTLY` **outside** the migration and comment the migration accordingly |
| `00056` `down()` | drops the new table and columns. **It destroys every issued letter's reference number and artifact link.** Treat as a forward-only migration in any environment that has issued a letter |
| Seeder `010` | idempotent; safe to re-run; activates seven letter document types per org on the `org` plane |
| S3 lifecycle | **no expiry rule may target `org/*/pdf/letter/*`.** These are `retention_class = 'record'` objects and are a legal record (§22.4) |
| Bucket delete permission | the sweeper needs `s3:DeleteObject` on `org/*/pdf/` — it already needs it for nothing else in this module, so this may be a new grant |
| Cron | one new schedule at 03:50 IST; confirm it does not collide with a maintenance window |

### 29.3 Backward compatibility

| Surface | Change | Compatible? |
|---|---|---|
| `#130`–`#137` | none | yes |
| `#138` preview | `subject_user_id` is **optional**; omitted ⇒ the P1 sample path, byte-for-byte | yes |
| `#43`–`#61` org documents | responses gain `origin`, `reference_number`, `generation_artifact_id`; additive fields | yes |
| `#45`/`#46`/`#48` | can now return `409 DOCUMENT_ORIGIN_GENERATED` | **new error**, reachable only for a generated document — which no client has ever seen before this phase |
| `#63`–`#67` employee reads | additive fields only; a letter appears as an ordinary org document | yes |
| Settings endpoint | five new keys | additive |
| `pdf_render.service` | storage key shape, `writeAudit` → `onReady` alias, optional `inputSnapshot` | **no caller affected** — `persist: true` has no P1 caller and `writeAudit` still works (§1.4(2), §13.2) |
| `pdf_render_artifacts` rows written by P1 | untouched; they are `cache`-class, non-persisted previews | yes |
| DB | additive | yes |
| Existing tests | unchanged except intentional additions to `pdf_render_service.test.js` | proved by T-46 |

**Nothing in Phase 2 requires a frontend change to keep working.** The frontend must change only to
*use* the new endpoints. The dated change record (§16.5) says exactly that, so the frontend team can
schedule rather than scramble.

---

## 30. Traceability — Main Plan → Phase 2

| Main-plan requirement | Where Phase 2 delivers it |
|---|---|
| §4.6 `org_documents` additions | §6.2 — plus a third column, `reference_number` (§1.4(5)) |
| §4.7 `document_letter_sequences` | §6.1 |
| §7 builder purity contract | §10.2, T-15 … T-22 |
| §7.2 field precedence | §10.2, amended by §1.4(4) |
| §8.1 issuance flow (12 steps) | §14 (15 steps, transaction boundaries marked) |
| §8.2 reissue flow | §15 |
| §9 rows #139–#142 | §16 |
| §9 note "employee and manager reads add no endpoints" | §16.4 |
| §10 observability shape | §25.3 |
| §13 settings #84–#86 | §26.1 — plus the P1 gap (§26.2) |
| §14 testing expectations | §27, T-1 … T-46 |
| **D-5** branding changes do not alter issued letters | §31 EC-14 |
| **D-6** a letter *is* an `org_document` | §14 B5–B6, §16.4, §24.3 |
| **D-11** deterministic key, no in-place edit | §1.4(2) — key derived from `artifactId`, not `content_hash`, with the reason |
| **D-14** renderer authentication | §18.6 — **release blocker** |
| **D-16** determinism, `input_hash`, `content_hash` | §10.2, T-15/T-20/T-21 |
| **D-17** letter document types seeded | §7, seeder `010` |
| **D-19** no new dependency | honoured; §25.5 |
| **D-20** reference numbering under `FOR UPDATE`, gaps accepted | §11 |
| EC-14 … EC-28 | §31, every row dispositioned |
| OD-3 … OD-6 | §34.1 |
| Deferred: bulk, email, attachments, manager issuance, sign-off, payslip/report PDFs | §1.2, with a named target phase each |

Nothing in the main plan's Phase 2 column is unaccounted for: every row above either lands in a Phase 2
section or appears in §1.2 with a target phase and a reason.

---

## 31. Edge Cases

### 31.1 Main-plan cases marked Phase 2

| EC | Disposition |
|---|---|
| EC-14 | **Satisfied by design.** Issued PDFs are immutable objects; branding is resolved at render time and never re-read. `input_snapshot` explains a historical letter, with branding srcs redacted (§18.5) — the *hash* still proves which branding was used |
| EC-15 | **§14 step 4** — the version is resolved once and written to the artifact. T-6 asserts the artifact records it |
| EC-16 | **§20.2 layer 2** — P1's existing unique-violation path; T-30/T-31 |
| EC-17 | **§20.1** — the derived key is identical, so the second call returns `reused: true`. An intended second copy passes a distinct `idempotency_key`. T-29, T-33 |
| EC-18 | **§11.3** — one row per `(org, template, FY)`; contention is never org-wide |
| EC-19 | **Deferred to Phase 3** with a stated remedy — §22.6, §1.4(6), OD-P2-2 |
| EC-20 | **§23** — the sweeper flips `pending` → `failed` and deletes the object. **The parent plan's "a retry overwrites rather than duplicating" no longer holds:** with the key derived from `artifactId` (§1.4(2)), a retry writes a *new* object rather than overwriting, so the sweeper is now the whole remedy rather than a belt on top of overwrite semantics. This is the one place the key change made a case worse, and it is why §23 is in scope for Phase 2 rather than Phase 3 |
| EC-21 | **§22.2** — storage failure returns **`502 STORAGE_UNAVAILABLE`**, not the `503` the parent plan wrote; P1's shipped `mapRenderError` already maps it to 502 and Phase 2 does not fork it. No DB row advanced, no number consumed, retry-safe — the substance is unchanged |
| EC-22 | **§14 B2** — the subject is re-checked inside transaction B; uniform 404 |
| EC-23 | **§14 B3** — the type is re-checked inside transaction B; 409 |
| EC-24 | **§10.1 + BR-21** — a compensation letter with no approved salary structure ⇒ `422 LETTER_FACTS_MISSING`. **Never `₹0.00`.** T-10 |
| EC-25 | **Not unit-testable.** Hostile-name rendering (RTL, emoji, combining marks) requires a real render. Hostile fixtures are committed and rendered once as part of the §32 pre-release checklist; the templates use a web-safe stack with no custom subset, so the failure mode is a fallback glyph, not a blank box |
| EC-26 | **Template CSS.** Long designation/address values are clamped by CSS with wrapping, never `text-overflow: ellipsis` on a legal value. Verified by the same fixture render |
| EC-27 | `page-break-inside: avoid` on the signature block in both new templates (§9); verified by the long-content fixture render |
| EC-28 | **§13.5** — extended beyond the parent plan's two methods to include `replace` (#48), because that is the third door into the same state change. T-41 |

### 31.2 New cases Phase 2 introduces

| EC | Case | Handling |
|---|---|---|
| EC-P2-1 | Transaction B fails before `storage_key` is ever written, leaving an object whose key exists nowhere in the database | The key is **derivable** from `artifactId` (§1.4(2)); the sweeper reconstructs it (§23.2 step 2a). Without the key change this object would be unreachable forever. T-13, T-43 |
| EC-P2-2 | `effective_date` far in the past or future ⇒ a letter dated 1970, or an FY with no sequence history | Bounded to ± 365 days by the validator (§16.1) |
| EC-P2-3 | A same-key retry after a hard failure collides with the non-partial unique index, a state P1 has no branch for | The `failed`-row branch returns the original failure; a derived key carries a bounded failure salt, ceiling 5 (§20.4). T-32 |
| EC-P2-4 | An org configures a `reference_pattern` with no `SEQ` token, or one that renders over 64 characters, before the validator existed | Validated on write **and** re-validated at issue (BR-32); a pre-existing bad pattern fails the issue with a 422 that names the pattern problem rather than a 500 on a column overflow |
| EC-P2-5 | A subject who is a manager or an HR user, with no `EmployeeProfile` row | The three-way fallback resolves them; `reporting_manager` is simply omitted because only `EmployeeProfile` carries `manager_id` (§10.1). T-25 |
| EC-P2-6 | An org with no `ORG_CODE` on its profile | Falls back to the org-id prefix (§11.1); a letter never fails to get a number because an optional org field is blank. T-4 |
| EC-P2-7 | A template is disabled between the render and transaction B | **Deliberately not re-checked** — the version was pinned and the bytes are paid for. Disabling stops new issuance; it does not abort work in flight (§19.4) |
| EC-P2-8 | The same employee needs two identical letters on the same day (two visa applications) | The derived key would dedupe them; the caller passes an explicit `idempotency_key` to force a second copy. Documented in the change record so the frontend sends one |
| EC-P2-9 | An acknowledgement-requiring letter is superseded before the employee acknowledges | The acknowledgement obligation stays on the predecessor, and the successor raises its own. Correct: the employee acknowledged, or failed to acknowledge, *that* version (§19.4) |

---

## 32. Production-Readiness Checklist

**Security**

- [ ] D-14: renderer rejects an unauthenticated request with 401 — **observed**, not assumed (§18.6)
- [ ] `PDF_RENDERER_API_KEY` present in production; startup asserts it
- [ ] No response, error body, audit row or log line exposes `storage_key`, `input_snapshot`, the renderer URL or the API key — T-39, T-40
- [ ] All four endpoints are `hr` + `documents.access` only; `admin`/`super-admin` denied
- [ ] Cross-org access returns the uniform 404 with no distinguishing signal — T-42
- [ ] `field_overrides` cannot override a `derived_field` — T-9
- [ ] `reference_pattern` token whitelist enforced on write and at issue — T-1

**Data integrity**

- [ ] `00056` applied; `org_documents_generated_chk` and `org_documents_reference_uniq` present
- [ ] Seeder `010` applied; T-45 registry↔catalog consistency green
- [ ] Letter row and `ready` artifact commit in one transaction — T-6
- [ ] No letter row can reference a non-`ready` artifact (CHECK)
- [ ] One published version per group holds under a concurrent reissue — T-34, T-37
- [ ] A superseded letter keeps its bytes, artifact, number and acknowledgements — T-34

**Reliability**

- [ ] Renderer timeout, 5xx and storage failure each leave `failed` + no letter + no number — T-11, T-12
- [ ] Transaction-B failure leaves a sweepable orphan and no letter — T-13
- [ ] Sweeper runs, marks before deleting, reconstructs missing keys, honours the 30-minute and 200-row bounds — T-43
- [ ] `s3:DeleteObject` granted on `org/*/pdf/`
- [ ] **No S3 lifecycle rule targets `org/*/pdf/letter/*`**
- [ ] Ingress idle timeout exceeds the ~13 s worst-case request (§21)
- [ ] Cron registered at 03:50 IST; boot log line present

**Observability**

- [ ] One `letter.issued` / `letter.issue_failed` line per attempt, with `artifact_id`
- [ ] `reused=true` distinguishable in logs
- [ ] `failure_class` present on every failure line
- [ ] `letter.generated` and `letter.issued` audit rows visible through `#58`, in that order
- [ ] Sweeper summary line appears only when it did something

**Content correctness — the manual gate**

- [ ] Both new templates rendered once against the hostile fixtures: long name, 40-char designation, RTL/emoji name, long-content page break — EC-25, EC-26, EC-27
- [ ] A real relieving letter and a real confirmation letter reviewed by HR before the first issue
- [ ] No letter renders `₹0.00`, `undefined`, `null` or an empty required slot — T-10, T-18

**Documentation**

- [ ] `api_registry.md` rows #139–#142
- [ ] `org_settings_registry.md` #84–#86 plus the two P1 corrections
- [ ] Dated change record in `public/md_updates/`
- [ ] Completion report with the EC and T coverage tables

---

## 33. Acceptance Criteria

Phase 2 is complete when all seventeen hold.

| # | Criterion |
|---|---|
| A-1 | The renderer rejects an unauthenticated request (D-14). **This one is non-negotiable and gates release**, not merge |
| A-2 | `00056` and seeder `010` are authored, statically verified, unit-covered and handed back unrun; no migration or connectivity command was executed against the remote database by this work |
| A-3 | `#139` issues a letter: one `org_documents` row (`origin='generated'`, `published`, v1), one `ready` artifact, one recipient row, one reference number, two audit rows — in one transaction |
| A-4 | A repeat `#139` with the same inputs returns `200 reused: true` with zero renderer calls and zero sequence increments |
| A-5 | A renderer or storage failure leaves `failed`, no letter row, no number, and a 5xx that names `artifact_id` without leaking a secret |
| A-6 | A transaction-B failure leaves no letter and an orphan object the sweeper removes on its next run |
| A-7 | `#142` supersedes exactly one predecessor, allocates a new number, and leaves the predecessor's bytes, artifact, number and acknowledgements untouched |
| A-8 | `#140` and `#141` return no `storage_key` and no `input_snapshot`, and answer the uniform 404 for cross-org, deleted and uploaded ids |
| A-9 | `#45`, `#46` and `#48` refuse a generated document with `409 DOCUMENT_ORIGIN_GENERATED`; uploaded documents are unaffected |
| A-10 | An employee sees their letter through the **existing** `#63`/`#64`/`#65` with no new endpoint, and can acknowledge it through `#66`/`#67` when required |
| A-11 | No builder reads the clock; identical inputs produce identical view models; `input_hash` is order-stable |
| A-12 | `department_name` derives from `department_id`; the free-text `department` column is not read anywhere in the feature |
| A-13 | Reference numbers are unique per org, allocated under `FOR UPDATE`, never printed on the Phase 2 PDF, and gaps are documented rather than reclaimed |
| A-14 | All five settings keys are readable and HR-mutable, including the two P1 omissions, with caps enforced |
| A-15 | The two new templates pass the P1 lint and render correctly against the hostile fixtures |
| A-16 | T-1 … T-46 green, **and** the pre-existing suite green at the §2 baseline count with no edits to existing test files beyond the intentional `pdf_render_service.test.js` additions |
| A-17 | `api_registry.md`, `org_settings_registry.md`, a dated change record and a completion report are updated; every new endpoint, field, error code, setting and audit action appears in exactly one registry row |

---

## 34. Open Decisions

### 34.1 Main-plan decisions Phase 2 answers

| OD | Question | Phase 2's answer |
|---|---|---|
| OD-3 | Should a letter's reference number be printed on the PDF? | **Not in Phase 2.** The number is allocated after the render so a render failure burns nothing, and pulling allocation earlier would put the number inside the idempotency key and destroy idempotency. It is a persisted, unique, queryable attribute of the record and is returned by #139/#140/#141. Printing becomes OD-P2-1 |
| OD-4 | Where does the financial year come from? | The org's existing payroll FY configuration, read through the D-18 lazy-require pattern, defaulting to April–March. **No new setting** (§11.2) |
| OD-5 | Are letters confidential by default? | **Yes** — `letter_default_confidential` defaults `true` (#85). Letters carry salary and exit data; confidential-by-default is the safe failure mode |
| OD-6 | Do letters require acknowledgement by default? | **No** — `letter_requires_acknowledgement_default` defaults `false` (#86). Acknowledgement-by-default would create an overdue row and a reminder email for every letter an org issues |

### 34.2 Decisions Phase 2 opens

| OD | Question | Recommendation | Needed by |
|---|---|---|---|
| OD-P2-1 | Print the reference number on the PDF? | Yes, as a `v2` of each template: allocate in a short transaction before the render, accept a burned number on render failure, bump `pinned_version` to `valid(1, 2)`. Keep the number out of the idempotency key by hashing the inputs *without* it | Phase 4, with the bulk/email work |
| OD-P2-2 | How is object loss detected (EC-19)? | A scheduled `HeadObject` sweep over `ready` record artifacts, reporting mismatches; re-render-and-compare only on demand, never a silent substitution | Phase 3 |
| OD-P2-3 | Should the two new `org_documents` indexes be created `CONCURRENTLY`? | Depends on the production row count, which this work cannot query. If `org_documents` exceeds ~1 M rows, move both `CREATE INDEX` statements out of `00056` and run them concurrently | before `00056` is run |
| OD-P2-4 | Is a `retention_class = 'record'` `input_snapshot` acceptable at rest indefinitely? | Yes as designed (§18.5 rule 3) — it discloses nothing the stored PDF does not — but it is a data-map line the DPA owner should sign off, not an engineering decision | before the first production issue |
| OD-P2-5 | Should HR be able to trigger the sweeper manually? | Not in Phase 2. The `runJob` pattern exists and is cheap to add, but a destructive cross-org job behind an HR endpoint needs a scope argument and an audit row first | Phase 3, if operators ask |

---

*End of the Phase 2 implementation plan. Sections 1–4 reconstruct the scope; 5–17 define the build;
18–28 define correctness, failure behaviour and sequence; 29–34 define release. A developer should be
able to implement from §28 outward, reading the referenced sections as each step begins.*
