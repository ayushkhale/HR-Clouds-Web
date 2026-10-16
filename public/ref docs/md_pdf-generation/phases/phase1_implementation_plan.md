# PDF Generation Module — Phase 1 Implementation Plan

**Rendering core, template catalog, branding & preview**

**Status:** Source of truth for PDF Generation Phase 1. Supersedes §11 "Phase 1" of
[implementation_plan.md](../implementation_plan.md) wherever the two differ in detail; the parent
remains authoritative for module-wide decisions **D-1…D-24** and the **EC-1…EC-46** register.
Every deviation from the parent is listed in **§1.4** — none is silent.

**Written:** 2026-09-26 · **Depends on:** parent plan dated 2026-09-26.

**Rule inherited from Leave, Payroll and Documents:** no phase begins until the previous one is
tested and verified. Phase 1 has no predecessor phase, but **OD-1 and OD-2 (§30) must be answered
before Steps 3 and 6 respectively** — Steps 1, 2, 4 and 5 can be built without them.

---

## 1. Goal & Boundary

### 1.0 Goal

Make a **branded, correct, A4 PDF** come out of this system and be visible to HR, with the four
dangerous parts — **transport, sanitisation, formatting, storage** — built and proved while the
blast radius is a preview.

Phase 1 is the phase in which the module's **security and correctness posture is fixed**: the
outbound HTTP boundary, the template authoring rules and their lint, the server-side formatting
contract, the artifact record, the storage write path and the org-isolation rules are all created
here. Phases 2–5 add surfaces on top of them and must not re-decide them.

Phase 1 also answers the question the operator's original proposal raised — *how does HR configure
this without it becoming a support burden?* The answer is **D-3**: two plain forms (branding,
per-template saved fields) and a Preview button. No HTML, no CSS, no URLs, no placeholders.

**The single hardest constraint in this phase, stated once:** the renderer is **currently
unauthenticated** (§2.1 of the parent, **D-14**). Phase 1 is therefore designed so that **no real
employee data ever leaves this process** — see **§1.4 (2)**. That is not a limitation we tolerate;
it is the property that makes Phase 1 safe to build against an open dev endpoint.

### 1.1 Explicitly in scope

| # | Deliverable | Why it must be Phase 1 |
|---|---|---|
| 1 | `src/infrastructure/pdf-renderer/` — config + provider, the codebase's **first outbound HTTP integration** | Every later phase calls it. Retry classification, timeouts, magic-byte verification and secret hygiene are cheap to get right now and expensive to retrofit. |
| 2 | `putObject` / `getObject` on the S3 provider (**D-7**) | The provider cannot write or read bytes today. Nothing server-generated can be stored without them. Landed in isolation, behind the payroll/document regression gate. |
| 3 | `src/common/utilities/pdf_format.utils.js` — promoted `formatMoney`/`text`/date helpers (**D-4**) | The renderer's Handlebars has four helpers. Formatting is ours. Money must keep the ICU-independence property payroll already relies on. |
| 4 | Template catalog: `letter-templates/registry.js`, `_partials/`, **three** templates | Three, not one: a letterhead-heavy letter, a table-bearing letter and a minimal letter prove the partials and the `pdf_config` contract. |
| 5 | **Template lint test** (**D-13**), written *before* the templates | Rule 5 (declared-vs-used placeholders) is the only defence against Handlebars silently rendering a blank on a legal document. It is a build gate, not a review item. |
| 6 | Migration `00055-create-pdf-generation.js` — three tables + two `document_settings` columns | See **§1.4 (1)** for why three and not five. Authored, **not run**. |
| 7 | `document_letter_branding` + `document_letter_configs`: models, repositories, services, validators, HR routes **#130–#138** | The configuration surface. This *is* the HR-usability answer. |
| 8 | `src/common/services/pdf_render.service.js` — template load, view-model validation, artifact bookkeeping, idempotency, error mapping (**D-24**) | The one place both domains will call. Built neutral from the start so Payroll (P3) never requires from `modules/document`. |
| 9 | Branding asset handshake (logo, signature) — presign → HeadObject → confirm, raster-only (**D-12**) | Reuses the `document_template.service` handshake verbatim. Rejecting SVG is a P1 security control, not a P5 polish. |
| 10 | Preview (**#134**, **#138**) with a `PREVIEW` watermark and a per-org rate limit | The whole usability loop. Also the only P1 consumer of the render path, which is the point. |
| 11 | Org settings **#82**, **#83** | Two knobs, both defaulting to current behaviour. |
| 12 | `tests/unit/pdf/` — transport, lint, formatting, view-models, hostile input, cross-tenant | DB-free, renderer stubbed. The safety net every later phase leans on. |

### 1.2 Explicitly NOT in scope — do not build these here

| Excluded | Deferred to | Why not now |
|---|---|---|
| Issuing a letter to an employee; any `org_documents` row | **Phase 2** | Issuance needs reference numbering, the lifecycle integration, recipient materialisation and ten seeded catalog types. None of it can be proved before the render path is. |
| `document_letter_sequences`, reference numbering, `{ORG_CODE}` pattern resolution | **Phase 2** | Nothing in P1 issues a numbered document. Building a sequence table nothing increments is dead schema. |
| `org_documents.origin` / `generation_artifact_id` columns | **Phase 2** | Additive ALTERs whose only readers are P2 code. See **§1.4 (1)**. |
| **Merge-data assembly from employee facts** (§7.2 of the parent) | **Phase 2** | This is the PII boundary. See **§1.4 (2)**. |
| Preview against a real `subject_user_id` | **Phase 2** | Same reason. P1's preview renders **sample data only**. |
| `pdf_render_jobs`, the worker cron, bulk anything | **Phase 3 / 4** | P1 has exactly one render trigger (an HR click) and no batch. A queue would be infrastructure without a justifying requirement. |
| Payslip / Form 16 / annual-statement templates; `payroll_pdf.service.js`; the `pdf_render_engine` flag; the parity harness | **Phase 3** | PDFKit stays the only payroll renderer through P1 and P2. No payroll file changes behaviour in this phase. |
| The artifact sweeper, the cache purge cron, retention | **Phase 2 (sweeper) / Phase 5 (purge)** | P1 leaves no S3 object behind to sweep — see **§1.4 (3)**. |
| Renderer authentication (**D-14**) | **Phase 5**, and it is a **release blocker** | P1 must be buildable against the current open endpoint; production safety in P1 comes from sending no real data, not from a key that does not exist yet. |
| Maker–checker, manager proposals, notifications, offboarding hooks | **Phase 4** | No issuance ⇒ nothing to propose, approve or notify about. |
| `admin` / `super-admin` access of any kind | **never** | Documents D-10, memory `role-planes-tenant-vs-platform`. |
| Removing or touching any PDFKit code path | **not in this module** | Parent §1.3. `pdf_layout.utils.js` gains a re-export and loses nothing. |

### 1.3 Honesty guard — four stated gaps, not hidden ones

1. **`renderer_version` will be `NULL` for every P1 artifact.** The service returns no version
   header (`src/handler.js`, read 2026-09-26). The column exists and is populated *if* the
   operator adds one (**OD-2**). The plan does not pretend to know what rendered the bytes when
   the service will not say.

2. **The renderer is unauthenticated, and P1 ships against it.** The mitigation is scope, not
   configuration: P1 sends org branding and template sample data, never an employee record. An org
   logo and a registered address are already public-facing information. The moment P2 sends a real
   name and salary, **D-14** must be satisfied. This is written into the P2 entry criteria (§29).

3. **`retention_class = 'cache'` has no purger until Phase 5.** P1 writes artifact *rows* and no
   S3 objects (§1.4 (3)), so the accumulation is bounded by the preview rate limit and consists of
   small JSONB rows. This is an accepted residue, recorded here, not discovered later.

4. **`aws-s3.config.js` reads `PAYROLL_S3_BUCKET` only, while its own startup warning names
   `APP_S3_BUCKET`.** Verified 2026-09-26: `const bucket = process.env.PAYROLL_S3_BUCKET || null`,
   with the warning string from Documents D-5 already updated to mention `APP_S3_BUCKET`. The
   fallback chain was never implemented. P1 completes it (§6.3) because it is a one-line fix in a
   file this phase already touches, and because an operator reading that warning today is misled.

### 1.4 Deviations from the parent plan's §11 Phase 1 — with reasons

| # | Parent says | This plan does | Why |
|---|---|---|---|
| 1 | Migration `00055` creates "all four tables + both alterations" | `00055` creates **three** tables (`pdf_render_artifacts`, `document_letter_branding`, `document_letter_configs`) and **two** `document_settings` columns. `pdf_render_jobs` → P3's migration. `document_letter_sequences`, `org_documents.origin`, `generation_artifact_id` → P2's migration. `payroll_settings` knobs → P3's migration. | The operator runs every migration by hand and must be able to verify what they ran. Schema that no code reads cannot be verified by anyone, and a queue table designed nine months before its worker will need an ALTER anyway. Per-phase migrations also match the parent's own "every phase ends with a migration hand-back note". |
| 2 | **#138** previews "sample **or** a real `subject_user_id`" | **#138 accepts sample data only.** No employee facts are assembled, no `subject_user_id` is accepted, no `hierarchy_access` call is made. | This is the security spine of P1. With the renderer unauthenticated (**D-14**), a real-subject preview would put a named employee's designation and dates on an open endpoint. It also keeps the whole employee-facts resolver — a P2 deliverable with its own `department_id`, `employee_exits` and salary-structure rules — out of a phase that does not need it. |
| 3 | Preview creates a short-lived `cache`-class artifact with an S3 object (parent §8.5) | Preview **streams the PDF bytes back in the HTTP response**. The artifact row is still written (`storage_key = NULL`) as the render record. No S3 object is created. | Three reasons. (a) There is an established codebase pattern for exactly this — `buildDownloadHeaders` + `res.end(buffer)`, used by payroll `#173` and by three document CSV endpoints. (b) An object with no purger until P5 is an orphan class; a row is not. (c) S3 lifecycle rules match a literal key prefix, and every key in this codebase starts `org/{orgId}/…`, so "expire all previews" is **not expressible** as a bucket rule — the mitigation the Documents P1 plan used for abandoned uploads is unavailable here. `putObject`/`getObject` are still built and unit-tested in P1 (P2 depends on them) and are exercised once in the manual end-to-end check. |
| 4 | Parent §4.1 gives `source_type ENUM(letter, payslip, form16, annual_statement, report)` but §8.5 says preview has `source_type` NULL | The enum gains **`preview`**, and `source_type` stays `NOT NULL`. | A nullable discriminator on an audit-class table makes the partial unique index and every `(org_id, source_type, status)` read ambiguous. `preview` is a real kind of render and should be named. |
| 5 | Parent §1.1 lists "live preview" as the P1 deliverable without naming a watermark rule | Preview output carries a diagonal `PREVIEW` watermark rendered by the template when `data.is_preview` is true, and the watermark is **lint-asserted** to exist in every template. | A preview PDF is a real PDF. Without a watermark, the first one an HR user emails to an employee becomes an unnumbered, unrecorded "letter". |
| 6 | Parent D-24 names `pdf_render.service.js` without a location | `src/common/services/pdf_render.service.js`, with `src/common/repositories/pdf_render_artifact.repository.js`. Two new directories under `src/common/`. | The alternative is Payroll requiring from `modules/document` in P3, which the Documents P1 plan explicitly forbade ("No existing module gains a dependency on `modules/document`"). One directory each, created once. The *model* still lives in `modules/document/models/` because `MODEL_ROOTS` only scans module directories — that placement carries no runtime coupling, since every consumer reaches it through the global `db` registry. See **OD-P1-3**. |

---

## 2. Pre-Flight Checks — before writing any code

| # | Check | Command / file | Expected (verified 2026-09-26) |
|---|---|---|---|
| 1 | **OD-1 / OD-2 answered** | operator | renderer URL supplied; whether we own the renderer repo. Blocks Step 5 only. |
| 2 | Migration counter | `ls src/infrastructure/postgres-sql/migrations \| tail -1` | `00054-create-document-templates-and-exports.js` → this phase writes **`00055`** |
| 3 | Seeder counter | `ls src/infrastructure/postgres-sql/seeders \| tail -1` | `009-seed-document-type-catalog.js` → **P1 writes no seeder**; `010` belongs to P2 |
| 4 | `MODEL_ROOTS` already includes documents | `src/infrastructure/postgres-sql/models.index.js:20` | `modules/document/models` present ⇒ **no shared-file edit needed for models** |
| 5 | API registry tails | `public/md_system/api_registry.md` | documents end at **#129**, payroll at **#218** ⇒ new document routes start at **#130** |
| 6 | Org-settings registry tail | `public/md_settings/org_settings_registry.md` | ends at **#81** ⇒ PDF settings start at **#82** |
| 7 | **Baseline test count, recorded before any shared-file edit** | `npm test` | **158 test files** green. This is half of the D-7 regression gate; the other half is the same command after Step 3. |
| 8 | S3 configured, or degradation observed | `.env` | `PAYROLL_S3_BUCKET` set ⇒ storage works; unset ⇒ endpoints must return `503`, **observed**, not assumed |
| 9 | Redis reachable | `src/server.js` | `initRedis()` exits the process on failure, so Redis is a hard boot dependency — safe to use for the preview rate counter (§16.5) |
| 10 | Node version | `node -v` | **v24.20.0** — `fetch`, `AbortSignal.timeout()`, `structuredClone` global (**D-19**) |

---

## 3. Dependencies on Existing HRMS Components

Phase 1 **consumes** everything below. Apart from the five shared files in §4.2, it modifies none
of them.

### 3.1 Reused as-is

| Component | Path | Used for | Contract relied on |
|---|---|---|---|
| `authenticate` | `src/common/middlewares/auth.middleware.js` | every route | frozen `req.user` with **`orgId`** (not `org_id`), `id`, `role` |
| `authorize([roles])` | same file | HR plane | role string `'hr'` |
| `requireFeature('documents.access')` | `src/common/middlewares/require_feature.middleware.js` | every route | feature row + plan mapping already seeded by `008` (**D-22** — no new feature) |
| `AppError(status, message, errorCode, details)` | `src/common/utilities/appError.utils.js` | every thrown error | `status`, `errorCode`, optional `details` |
| `errorHandlerMiddleware` | `src/common/middlewares/error.middleware.js` | error envelope | `{success:false, message, errorCode}`; **logs `err.message` + stack for 5xx** — see §16.6 |
| `validateOrThrow(schema, payload)` | `src/common/utilities/validator.utils.js` | all validation | Joi, `allowUnknown:false`, `stripUnknown:true`; throws `400 VALIDATION_ERROR` |
| `object_storage.utils` | `src/common/utilities/object_storage.utils.js` | key building, allow-lists, filename sanitisation | `buildObjectKey({orgId, segments})`, `isAllowedContentType(t, allowed)`, `verifiedContentTypeMatches`, `isSafeReferenceUrl`, `sanitizeFileName` |
| `document_storage.utils` | `src/modules/document/utils/document_storage.utils.js` | module key shapes | `DOCUMENT_PLANE`, `buildDocumentKey`, `buildTemplateKey` — **extended**, not replaced (§4.2) |
| `aws-s3.provider` | `src/infrastructure/aws-s3/aws-s3.provider.js` | presign / head | `getUploadUrl`, `getViewUrl`, `headObject`, `deleteObject`, `StorageUnavailableError`, TTL caps — **extended** (§6) |
| `aws-s3.config` | `src/infrastructure/aws-s3/aws-s3.config.js` | bucket / KMS / TTL / `isConfigured()` | **extended** (§6.3) |
| `document_audit.service` | `src/modules/document/services/document_audit.service.js` | every state change | `record({...}, transaction)` — **transaction is mandatory**; `SCRUBBED_KEYS` already drops `storage_key` |
| `document_settings.service` | `src/modules/document/services/document_settings.service.js` | org singleton | `getOrCreate(orgId, t)`, `MUTABLE_FIELDS`, `SETTINGS_CAPS`, `assertCap` — **extended** with two keys |
| `buildDownloadHeaders` | `src/modules/payroll/utils/download_headers.utils.js` | the preview response | forces `attachment`, `nosniff`, `private, no-store`. **Note:** Documents already imports this from payroll in three controllers — pre-existing coupling this phase follows rather than refactors |
| `OrganizationProfile` | `src/modules/organization/models/organization_profiles.model.js` | branding merge base | `org_name, org_alias, website, phone_number, address_line_1/2, city, state, country, zip_code, logo_url, gst_number, company_pan_number` |
| `redisClient` | `src/infrastructure/redis/connection.redis.js` | preview rate counter | already a hard boot dependency; used by `auth.middleware` and two org services |
| `sequelize` | `src/infrastructure/postgres-sql/models.index.js` | transactions | unmanaged `db.sequelize.transaction()` |

### 3.2 Patterns copied, not re-invented

* **The presign → HeadObject → confirm handshake** for branding assets is `document_template.service.js`'s `issueFileUrl` / `confirmFile` (lines 245–350), including: claimed metadata persisted before signing, the client's claim treated as advisory, the policy re-applied to the **verified** `head.contentType`/`head.contentLength`, `verifiedContentTypeMatches` as the mismatch gate, the multipart-aware ETag rule (`etag.includes('-')` ⇒ no checksum), and idempotent replay when `confirmed_at` is already set.
* **The org-singleton shape** (`findOrCreate`, `UNIQUE (org_id)` as the race backstop, `lock: transaction.LOCK.UPDATE` on write) is `document_settings.repository.js`.
* **Controller shape** — `envelope(data, message)`, `ctx(req)` extracting `orgId`/`actorId`/`ipAddress`/`requestId` from `x-request-id`\|`x-correlation-id`, `try/catch → next(error)`, class-free function exports — is `document_template_hr.controller.js`.
* **Static migration verification** — `tests/unit/document/migration_00054.test.js` asserts against the migration's **source text**, never by executing it. `migration_00055.test.js` does the same.
* **Promote-and-re-export** — `object_storage.utils.js` (promoted from payroll, with a one-line re-export left behind) is the precedent for `pdf_format.utils.js` (§7).

### 3.3 Explicitly NOT depended on in Phase 1

`employee_documents`, `org_documents`, `document_org.service`, `document_recipient.service`,
`document_type_catalog`, `document_types`, `hierarchy_access.utils`, `employee_exits`,
`organization_departments`, any payroll service or model, `node-cron`, the SES/email layer, and
the notification outbox. If a Phase 1 file requires any of these, the scope has drifted.

### 3.4 Integration direction

**One-way, outward, and small.** No existing module gains a dependency on anything new. The four
files outside `src/modules/document/` that change (§4.2) are all additive; the payroll and
document suites are the gate on each.

---
## 4. Architecture, Directory Structure & Wiring

### 4.1 Layering

```
HTTP  ──►  document_letter_hr.controller      request shape only (Joi), envelope, ctx(req)
           │
           ├─► document_letter_branding.service   org singleton, asset handshake, audit, txn
           ├─► document_letter_config.service     per-template config, saved-field validation
           └─► document_letter_preview.service    rate limit, view-model build, delegate
                       │
                       ▼
           common/services/pdf_render.service     template load · view-model validation ·
                       │                          idempotency · artifact bookkeeping ·
                       │                          error mapping        (domain-neutral, D-24)
                       ├─► letter-templates/registry.js        (injected, not required)
                       ├─► common/repositories/pdf_render_artifact.repository.js
                       └─► infrastructure/pdf-renderer/provider  HTML in → bytes out. Nothing else.
                                   │
                                   ▼
                            AWS Lambda (Puppeteer + Handlebars)
```

`pdf_render.service` receives its registry **as an argument**, so it has no knowledge of either
domain. That is the whole reason it can live under `common/` and be called by Payroll in P3
without a cross-module require.

### 4.2 New and modified files

**New — infrastructure**

```
src/infrastructure/pdf-renderer/
├── pdf-renderer.config.js          env, isConfigured(), one boot warning, never throws at require
└── pdf-renderer.provider.js        renderPdf(); RendererUnavailableError; RendererRejectedError
```

**New — shared**

```
src/common/utilities/pdf_format.utils.js         formatMoney, text, formatDocumentDate, EMPTY
src/common/services/pdf_render.service.js        the orchestrator (D-24)
src/common/repositories/pdf_render_artifact.repository.js
```

**New — document module**

```
src/modules/document/
├── controllers/document_letter_hr.controller.js
├── models/pdf_render_artifacts.model.js          (see §1.4 (6) for why it lives here)
├── models/document_letter_branding.model.js
├── models/document_letter_configs.model.js
├── repositories/document_letter_branding.repository.js
├── repositories/document_letter_config.repository.js
├── routes/document_letter_hr.routes.js
├── services/document_letter_branding.service.js
├── services/document_letter_config.service.js
├── services/document_letter_preview.service.js
├── utils/letter_branding.utils.js                merge + validation helpers (pure)
├── utils/letter_view.utils.js                    view-model builders (pure)
├── validators/document_letter.validator.js
└── letter-templates/
    ├── registry.js
    ├── _partials/{letterhead.html, footer.html, signature_block.html, base.css}
    ├── experience_letter/v1.html
    ├── appointment_letter/v1.html
    └── bonafide_letter/v1.html
```

**Modified — five shared files, each individually reversible**

| File | Edit | Risk gate |
|---|---|---|
| `src/infrastructure/aws-s3/aws-s3.provider.js` | **additive**: `putObject`, `getObject` (**D-7**) | full payroll + document suite green before and after |
| `src/infrastructure/aws-s3/aws-s3.config.js` | `APP_S3_BUCKET` fallback (§1.3 (4)); `GET_OBJECT_MAX_BYTES` | same gate; a deployment setting only `PAYROLL_S3_BUCKET` must resolve byte-identically |
| `src/modules/payroll/utils/pdf/pdf_layout.utils.js` | `formatMoney` / `text` / `EMPTY` become re-exports of the promoted util; **exported names and behaviour unchanged** | payroll PDF tests are the gate; `formatMoney` parity table (§23.3) |
| `src/modules/document/utils/document_storage.utils.js` | add `DOCUMENT_PLANE.GENERATED`, `buildGeneratedPdfKey`, `LETTER_ASSET_CONTENT_TYPES` | `shared_allow_list_isolation.test.js` must still pass |
| `src/modules/document/document.index.js` | one mount line | route-ordering check (§4.3) |

**`MODEL_ROOTS` needs no edit** — `modules/document/models` is already scanned
(`models.index.js:20`), and all three new models live there.

**`src/app.js` needs no edit** — the document module is already mounted (line 46).

### 4.3 Mount and route ordering

```js
// document.index.js — appended after the existing HR mounts
app.use('/api/v1/documents/hr', letterHrRoutes)   // #130–#138
```

Five routers already share the `/documents/hr` base. Express matches in registration order, so
the new router is mounted **last** and its paths must not collide with any existing HR path.
Verified against the current route set: no existing HR path begins `letter-branding` or
`letter-templates`. The nearest neighbour is `templateHrRoutes`' `/templates/*` — distinct from
`/letter-templates/*`, but close enough that the collision test (§23.3) asserts it explicitly.

**Within the new router**, static segments are declared before parameterised ones:

| Declare first | Would otherwise be swallowed by |
|---|---|
| `POST /letter-templates/:code/preview` | — (no conflict; `:code` is the only param) |
| `GET /letter-branding` | — |

`:code` is a template code (`^[a-z][a-z0-9_]{2,63}$`), **not** a UUID. It is validated by pattern
in the controller before any lookup, so an unknown code never reaches the registry as a key.

### 4.4 Express 5 query gotcha

`req.query` is getter-only. Every query parameter is validated **inside the controller** with
`validateOrThrow(schema, req.query)` and assigned to a local — never written back onto `req.query`.
Route files carry the `// query validated in controller` marker, matching `payroll_manager.routes.js`.
In P1 this applies to **#135** (`GET /letter-templates`) only.

---

## 5. The Renderer Integration (D-1)

### 5.1 What the service actually is — verified 2026-09-26

Read directly from `C:\Users\91930\Desktop\Vs_Code\pdf-generation`:

| Fact | Source | Consequence for this phase |
|---|---|---|
| `exports.handler` returns a **Lambda proxy object** `{statusCode, headers, isBase64Encoded:true, body: pdfBuffer.toString('base64')}` | `src/handler.js` | Whether the client receives **binary** or **base64 text** depends on API Gateway's `binaryMediaTypes` configuration, which we do not control. **The provider must handle both** — §5.4. |
| `body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body \|\| event` | `src/handler.js` | Direct Lambda invocation (SigV4, no API Gateway) also works. This is what makes **D-14**'s eventual transport swap a one-file change. |
| Handlebars helpers: **`eq`, `ne`, `lt`, `gt` only** | `src/services/template.service.js` | All formatting is ours (**D-4**). Built-in block helpers (`#if`, `#each`, `#unless`, `#with`) are still available. |
| `MAX_HTML_BYTES = 512000`, validated on **`templateHtml` only** | `src/utils/validator.js` | Base64 data URIs travel in `data`, not `templateHtml`, so they do not count against this cap. Our own `maxPayloadBytes` is the binding constraint. |
| `data` must satisfy `typeof data === 'object'` | `src/utils/validator.js` | Arrays and `null` pass that check. We send a plain object, always. |
| `PDF_DEFAULTS.margin` has `right/bottom/left: '10mm'` and **no `top`**; merged as `{...PDF_DEFAULTS.margin, ...safeConfig.margin}` | `src/config/constants.js`, `src/services/pdf.service.js` | Sending a partial margin object silently keeps 10mm on the unspecified sides. **Every template's `pdf_config` declares all four margins.** Lint rule 9 (§9.4). |
| `ALLOWED_PDF_CONFIG_KEYS` = format, landscape, scale, margin, displayHeaderFooter, headerTemplate, footerTemplate, pageRanges, preferCSSPageSize, width, height; `printBackground` forced `true`; `path` stripped | `src/services/pdf.service.js` | Our `pdf_config` validator uses **the same allow-list**, so an unsupported key fails our tests rather than being silently dropped by theirs. |
| `setContent(html, { waitUntil: 'networkidle0', timeout: 10000 })` | `src/services/pdf.service.js` | The render waits for every network request in the HTML to settle. A template with **zero** external requests is not just safer, it is faster — another reason for **D-18**. |
| SSRF guard: `isBlockedUrl` blocks `file://`, `localhost`, `127.0.0.1`, `::1`, and any hostname **starting with** `169.254.`, `10.`, `172.16.`–`172.31.`, `192.168.` | `src/services/pdf.service.js` | **New edge case, not in the parent register — EC-P1-1 (§27.2):** the check is `hostname.startsWith(pattern)`, so a virtual-hosted-style S3 URL for a bucket named `10.something` or `192.168-archive` would be **blocked**. Assert the configured bucket name against those prefixes at boot. |
| `data:` URIs: `new URL('data:…')` parses with `hostname === ''`, matching no pattern | same | Inlined assets pass the guard. Confirmed by reading the predicate, not assumed. |
| Errors: `ValidationError → 400 {error}`; anything else → `500 {error:'PDF generation failed'}`. Request body is **not** logged. | `src/handler.js` | Only two failure shapes to map. The generic 500 message means **our** logs must carry the template code and version, because theirs will not. |
| No `renderer_version`, no `/health` | whole repo | **OD-2**. `renderer_version` stays NULL; readiness is "did a render succeed", not a probe. |

### 5.2 `pdf-renderer.config.js`

Mirrors `aws-s3.config.js` exactly: reads env at require time, logs **one** warning when
unconfigured, exports `isConfigured()`, and **never throws at require time** — an unconfigured
renderer must degrade to `503` per request, not stop the app from booting. (The same reasoning
Documents used for not calling an `assertKeyConfigured()` at module load.)

| Export | Env var | Default | Notes |
|---|---|---|---|
| `baseUrl` | `PDF_RENDERER_BASE_URL` | `null` | trailing slash stripped; **must be `https:`** unless `NODE_ENV === 'development'` |
| `apiKey` | `PDF_RENDERER_API_KEY` | `null` | sent as `x-api-key` when present; absence is legal in P1 (**D-14**) and logged once at boot as a warning |
| `timeoutMs` | `PDF_RENDERER_TIMEOUT_MS` | `20000` | above the service's 10 s `setContent` + 15 s Lambda ceiling, so we observe *its* error |
| `maxAttempts` | `PDF_RENDERER_MAX_ATTEMPTS` | `2` | one retry |
| `maxPayloadBytes` | `PDF_RENDERER_MAX_PAYLOAD_BYTES` | `4194304` | checked before send |
| `maxResponseBytes` | `PDF_RENDERER_MAX_RESPONSE_BYTES` | `5242880` | decoded; above it, fail loudly rather than store a truncated PDF |
| `isConfigured()` | — | — | `Boolean(baseUrl)` |

Boot warning, once, when `baseUrl` is unset:
`[PDF] PDF_RENDERER_BASE_URL not set — HTML rendering endpoints will return 503 PDF_RENDERER_NOT_CONFIGURED`.
A second warning when `baseUrl` is set but `apiKey` is not:
`[PDF] PDF_RENDERER_API_KEY not set — the renderer is being called unauthenticated (D-14)`.

### 5.3 `pdf-renderer.provider.js` — the single exported function

```js
renderPdf({ templateHtml, data, config, requestId }) -> {
  buffer,            // Buffer, verified PDF
  sizeBytes,
  rendererVersion,   // from x-renderer-version if the service ever sends one; else null
  attempts,
  renderMs
}
```

**Two error classes, exported from this file:**

| Class | Raised for | Carries | Maps to |
|---|---|---|---|
| `RendererUnavailableError` | timeout, network error, `401`, `403`, `429`, any `5xx`, unconfigured base URL, oversize response, non-PDF body | `failureCode ∈ {renderer_timeout, renderer_network, renderer_auth, renderer_throttled, renderer_5xx, renderer_not_configured, renderer_bad_response}` | `503 PDF_RENDERER_UNAVAILABLE` (or `503 PDF_RENDERER_NOT_CONFIGURED`) |
| `RendererRejectedError` | the service's own `400` | `failureCode = 'renderer_rejected'`, plus the service's `error` string | `500 PDF_TEMPLATE_INVALID` — **our** bug, never the caller's (**D-10**) |

**Retry policy.** `maxAttempts = 2`. Retry on `RendererUnavailableError` *except* `renderer_auth`
and `renderer_not_configured` (retrying a bad key or a missing URL is pointless). **Never** retry
`RendererRejectedError`. Backoff: `500ms + random(0..500)ms`. Rendering is a pure function of the
request, so a retry is always semantically safe (**EC-2**).

**Request construction.**

```
POST {baseUrl}/v1/pdf/generate
content-type: application/json
accept: application/pdf
x-request-id: {requestId}          // correlation only, never auth
x-api-key: {apiKey}                // only when configured
body: JSON.stringify({ templateHtml, data, config })
signal: AbortSignal.timeout(timeoutMs)
```

The serialised body is measured **once** with `Buffer.byteLength` before sending. Over
`maxPayloadBytes` ⇒ throw `AppError(500, 'render payload too large', 'PDF_PAYLOAD_TOO_LARGE')`
without a network call: it means a builder produced something unreasonable, which is our defect.

### 5.4 Response handling — the part that is easy to get wrong

1. Read the response as an `ArrayBuffer`. Reject immediately if `byteLength > maxResponseBytes`.
2. **Decide binary vs base64 by inspecting the bytes, not by trusting a header:**
   * starts with `%PDF-` ⇒ binary, use as-is;
   * otherwise, if the body is valid base64 ASCII, decode it and re-check for `%PDF-`;
   * otherwise ⇒ `RendererUnavailableError('renderer_bad_response')`.
   This is what makes us immune to the API Gateway `binaryMediaTypes` configuration (§5.1) and to
   the classic "`200` with an HTML error page" failure (**EC-1**).
3. Verify the trailing `%%EOF` within the last 1 KB. A truncated PDF that still starts with
   `%PDF-` is the failure that would otherwise be stored and discovered by an employee.
4. `200` but empty body ⇒ `renderer_bad_response`.
5. `400` ⇒ `RendererRejectedError` with the parsed `error` field.
6. `401`/`403` ⇒ `renderer_auth`. `429` ⇒ `renderer_throttled`. `5xx` ⇒ `renderer_5xx`.
7. `AbortError` ⇒ `renderer_timeout`. Any other thrown error ⇒ `renderer_network`.

### 5.5 What the provider must not do

No template loading. No S3. No database. No audit. No logging of `data`, of `templateHtml`, or of
`apiKey`. No swallowing an error into a `null` return. No retries beyond `maxAttempts`.
**One job: HTML in, verified bytes out, typed errors on failure.**

### 5.6 Secret hygiene — a build gate, not a convention

`error.middleware.js` logs `err.message` **and the stack** for every `status >= 500`, and echoes
`err.stack` in the response body when `NODE_ENV !== 'production'`. Therefore:

* No error message constructed in this provider may interpolate `apiKey` or the full `baseUrl`.
  Messages name the failure class and the host only (`renderer 503 from api.example.com`).
* The test `renderer_secret_hygiene.test.js` drives the provider through **every** failure path
  with a sentinel key value and asserts that the sentinel appears in **no** thrown message, **no**
  `err.stack`, and **no** `console.*` call (console is spied, not silenced).

---

## 6. S3 Provider Additions (D-7)

### 6.1 `putObject`

```js
putObject({ key, body, contentType, contentLength, checksumSha256 }) -> { etag, versionId }
```

* `assertConfigured()` first, exactly like the four existing methods.
* `body` must be a `Buffer`; `contentLength` must equal `body.length` — mismatch is a programming
  error and throws a plain `Error`, not an `AppError`.
* **SSE-KMS when `kmsKeyId` is set**: `ServerSideEncryption: 'aws:kms'`, `SSEKMSKeyId: kmsKeyId`.
  **Verified gap:** `kmsKeyId` is currently exported from `aws-s3.config.js` and **read by
  nothing** — the presigned-PUT path never applies it. `putObject` is therefore the first consumer.
  Recorded as **OD-P1-1**: applying KMS on the server-write path while the presign path does not
  means two objects in the same bucket have different encryption. The operator must confirm
  whether the bucket has default encryption (in which case this is moot) or whether the presign
  path should be brought in line (a separate, out-of-scope change).
* `AbortController` with `PUT_TIMEOUT_MS = 10000` — larger than the 3 s head/delete timeouts
  because this one carries a payload.
* Transport failure ⇒ `StorageUnavailableError`, matching every existing method.

### 6.2 `getObject`

```js
getObject({ key, maxBytes }) -> { body: Buffer, contentLength, contentType } | null
```

* Returns **`null`** when the object is absent (`isNotFound(err)`), mirroring `headObject`'s
  contract rather than throwing — the caller decides whether absence is an error.
* **Capped.** `maxBytes` defaults to `GET_OBJECT_MAX_BYTES` (config, default 16 MB). The cap is
  enforced **twice**: against `res.ContentLength` before reading, and against the accumulated byte
  count while consuming the stream. A corrupt or lying `Content-Length` must not exhaust the heap;
  exceeding the cap throws `StorageUnavailableError('object exceeds read cap')` and the stream is
  destroyed.
* `GET_TIMEOUT_MS = 10000`.
* Unused by Phase 1 code paths (§1.4 (3)) but built and unit-tested here because P2 depends on it
  and because it is one PR with `putObject`.

### 6.3 `aws-s3.config.js`

```js
const bucket = process.env.APP_S3_BUCKET || process.env.PAYROLL_S3_BUCKET || null
const getObjectMaxBytes = Number(process.env.S3_GET_OBJECT_MAX_BYTES) || 16777216
```

The first line **completes** Documents D-5, whose warning string was updated but whose fallback
chain was not (§1.3 (4)). **Behaviour contract:** a deployment that sets only `PAYROLL_S3_BUCKET`
resolves to exactly the value it resolves to today. This is asserted in the regression run, not
hoped for.

### 6.4 Blast-radius check

Documents' D-6 precedent: adding `deleteObject` silently activated payroll's dormant attachment
sweeper, which had been probing for the method's existence. Before merging §6, grep for
capability probes:

```
grep -rn "typeof .*\.putObject\|typeof .*\.getObject" src/
```

**Verified 2026-09-26: there are none.** Adding these two methods therefore cannot change any
existing behaviour. The regression gate (§29, A7) is the proof, not this paragraph.

---

## 7. Formatting Utilities (D-4)

### 7.1 Promotion

Create `src/common/utilities/pdf_format.utils.js` containing, **verbatim**, from
`src/modules/payroll/utils/pdf/pdf_layout.utils.js`:

* `EMPTY` (the em dash printed for a genuinely absent value)
* `formatMoney(value)` — and with it, **verbatim**, the comment explaining why it does not use
  `toLocaleString`. That comment is the reason the function exists in this form: locale-dependent
  grouping would let the server's ICU data silently change the bytes of a re-rendered payslip.
  Moving the code without the comment invites someone to "improve" it in six months.
* `text(value)`

Then reduce those three definitions in `pdf_layout.utils.js` to re-exports. **Its export list and
every observable behaviour stay identical** — the payroll PDF suite is the gate.

### 7.2 Added here, used by every template

| Function | Contract |
|---|---|
| `formatDocumentDate(value, style)` | `style ∈ {'long', 'short', 'iso'}` → `'14 March 2026'`, `'14/03/2026'`, `'2026-03-14'`. **No `Intl`, no `toLocaleDateString`, no moment.** A fixed month-name array and explicit padding, for the same ICU-independence reason as `formatMoney`. Invalid or absent input returns `EMPTY`. |
| `formatDateRange(from, to, style)` | `'14 March 2024 to 31 August 2026'`; open-ended when `to` is absent. |
| `titleCaseName(value)` | Leaves the value alone apart from trimming and collapsing internal whitespace. **It must not lowercase anything** — `McDonald`, `van der Berg` and all-caps legal names are not ours to normalise. |
| `maskIdentifier(value, visible)` | `'XXXXXX1234'`. Used only where a template's own design shows a masked form (**D-15**). |

**Timezone rule.** Every date printed on a document is rendered from its **calendar date** as
stored, with no timezone conversion. A `DATEONLY` column is formatted directly; a timestamp is
converted using the value's UTC components. Rendering a joining date as the previous day because
the server moved to UTC is the exact class of bug this rule exists to prevent, and
`pdf_format.utils.test.js` asserts it with `TZ=Pacific/Kiritimati` and `TZ=Pacific/Midway`
fixtures.

### 7.3 Clock rule (D-16)

**No function in `pdf_format.utils.js` or in any view-model builder reads the clock.** Every date
is passed in. `letter_view.utils.test.js` asserts this structurally: it stubs `Date.now` and the
`Date` constructor to throw, and every builder must still produce its full output.

---
## 8. Database Schema — Migration `00055-create-pdf-generation.js`

One migration, one `queryInterface.sequelize.transaction()`, tables created in FK dependency
order, `down()` reversing every action in inverse order and dropping created ENUM types
`CASCADE` (Postgres leaves them behind otherwise). Shape copied from
`00054-create-document-templates-and-exports.js`.

Creation order: `pdf_render_artifacts` → `document_letter_branding` → `document_letter_configs` →
`ALTER document_settings`.

**Conventions applied to all three tables:** UUID PK with `defaultValue: Sequelize.UUIDV4`;
`created_at`/`updated_at` (`underscored: true`); `org_id UUID NOT NULL` FK →
`organizations(id) ON UPDATE CASCADE ON DELETE CASCADE`; **none is `paranoid`** — a soft-deletable
render record is not a record.

### 8.1 `pdf_render_artifacts`

Every PDF this system has produced, from any domain (**D-21**). The full shape is created now
even though Phase 1 writes only `source_type = 'preview'` rows: the columns are the parent plan's
§4.1 contract, adding them later would mean ALTERing a growing table, and each one is read by a
phase that is already planned.

| Column | Type | Null | Notes |
|---|---|:--:|---|
| `id` | UUID PK | N | |
| `org_id` | UUID FK→organizations CASCADE | N | in **every** predicate and **every** index |
| `source_type` | ENUM `preview, letter, payslip, form16, annual_statement, report` | N | `preview` added per §1.4 (4); P1 writes only `preview` |
| `source_id` | UUID | Y | the future `org_documents.id` / `payslips.id`. **Always NULL in P1.** No FK: it is polymorphic across two modules, and a polymorphic FK cannot be expressed. |
| `template_code` | STRING(64) | N | |
| `template_version` | INTEGER | N | |
| `engine` | ENUM `html, pdfkit` | N | P1 writes only `html`; the value exists so P3's flag has somewhere to record itself |
| `renderer_version` | STRING(32) | Y | **NULL in P1** — the service reports none (§1.3 (1)) |
| `status` | ENUM `pending, ready, failed, purged` | N, default `pending` | |
| `retention_class` | ENUM `record, cache` | N | P1 writes only `cache` |
| `idempotency_key` | STRING(120) | N | **D-11** |
| `input_snapshot` | JSONB | N | the exact view-model sent to the renderer — the reproducibility record |
| `input_hash` | CHAR(64) | N | SHA-256 of the canonicalised `input_snapshot` |
| `content_hash` | CHAR(64) | Y | SHA-256 of the PDF bytes; NULL until `ready` |
| `storage_key` | TEXT | Y | **NULL for every P1 row** (§1.4 (3)). Never leaves the service layer. |
| `size_bytes` | INTEGER | Y | |
| `page_count` | INTEGER | Y | **always NULL** until the renderer reports it (**OD-2**). Declared, not faked. |
| `render_ms` | INTEGER | Y | observability |
| `attempt_count` | INTEGER | N, default 0 | |
| `failure_code` | STRING(60) | Y | the provider's `failureCode`; never carries a payload |
| `failure_reason` | STRING(500) | Y | truncated at 500; never carries `data` or HTML |
| `pinned_date` | DATEONLY | N | the date printed on the document (**D-16**) |
| `object_purged_at` | DATE | Y | **D-23**; unused until P5 |
| `created_by` | UUID FK→users RESTRICT | Y | NULL for future cron-originated renders |
| `created_at` / `updated_at` | DATE | N | |

**Constraints & indexes**

```sql
UNIQUE (org_id, idempotency_key)                                   -- D-11, the concurrency backstop
CREATE UNIQUE INDEX pdf_render_artifacts_source_uniq
  ON pdf_render_artifacts (org_id, source_type, source_id)
  WHERE source_id IS NOT NULL AND status <> 'failed';              -- one live artifact per source
CREATE INDEX ... ON pdf_render_artifacts (org_id, source_type, status);
CREATE INDEX pdf_render_artifacts_pending_idx
  ON pdf_render_artifacts (status, updated_at) WHERE status = 'pending';      -- P2 sweeper
CREATE INDEX pdf_render_artifacts_cache_idx
  ON pdf_render_artifacts (retention_class, created_at)
  WHERE retention_class = 'cache' AND object_purged_at IS NULL;               -- P5 purger
CONSTRAINT pdf_render_artifacts_ready_chk CHECK (
  status <> 'ready' OR (content_hash IS NOT NULL AND size_bytes IS NOT NULL)
);
```

The `ready` CHECK is the database's statement of **D-5**: a `ready` artifact without a content
hash and a size is not a record of anything. Note it deliberately does **not** require
`storage_key`, because a P1 preview is `ready` with no stored object.

### 8.2 `document_letter_branding` — the org's letterhead identity

Org singleton, `getOrCreate` like `document_settings`.

| Column | Type | Null | Notes |
|---|---|:--:|---|
| `id` | UUID PK | N | |
| `org_id` | UUID **UNIQUE** FK→organizations CASCADE | N | the singleton backstop under first-access races |
| `logo_storage_key` | TEXT | Y | written **only** by the confirm endpoint (**#133**) |
| `logo_content_type` | STRING(50) | Y | HeadObject-verified |
| `logo_size_bytes` | INTEGER | Y | |
| `signature_storage_key` | TEXT | Y | |
| `signature_content_type` | STRING(50) | Y | |
| `signature_size_bytes` | INTEGER | Y | |
| `signatory_name` | STRING(120) | Y | |
| `signatory_designation` | STRING(120) | Y | |
| `registered_address_lines` | ARRAY(STRING(120)) | N, default `[]` | at most 5 entries; plain text |
| `cin` / `gstin` / `pan` / `tan` | STRING(32) | Y | printed in the footer when present |
| `contact_email` | STRING(150) | Y | |
| `contact_phone` | STRING(30) | Y | |
| `website` | STRING(255) | Y | https-only, via `isSafeReferenceUrl` |
| `accent_color_hex` | CHAR(7) | N, default `'#1F2937'` | `^#[0-9A-Fa-f]{6}$` — it is interpolated into CSS |
| `footer_note` | STRING(300) | Y | plain text, escaped by the double-stash |
| `letterhead_enabled` | BOOLEAN | N, default `true` | off when the org prints on pre-printed stationery |
| `updated_by` | UUID FK→users RESTRICT | Y | |
| `created_at` / `updated_at` | | N | |

```sql
CONSTRAINT document_letter_branding_accent_chk
  CHECK (accent_color_hex ~ '^#[0-9A-Fa-f]{6}$');
CONSTRAINT document_letter_branding_address_len_chk
  CHECK (array_length(registered_address_lines, 1) IS NULL
         OR array_length(registered_address_lines, 1) <= 5);
```

The accent CHECK is deliberate belt-and-braces: the value is interpolated into a `<style>` block,
so the application validator is the control and the CHECK is the thing that survives a future
code path that forgets to call it.

**Not duplicated here:** `org_name`, address, city/state/country/zip, `website`, `gst_number`,
`company_pan_number` and `logo_url` already exist on `organization_profiles`. The resolver (§13.2)
**merges** the profile with this row, this row winning field-by-field where it is non-empty. The
merge *result* is what is frozen into `input_snapshot`.

### 8.3 `document_letter_configs` — per-org, per-template

| Column | Type | Null | Notes |
|---|---|:--:|---|
| `id` | UUID PK | N | |
| `org_id` | UUID FK→organizations CASCADE | N | |
| `template_code` | STRING(64) | N | `UNIQUE (org_id, template_code)`. **No FK** — the template catalog is a repo asset, not a table (**D-2**). Validity is enforced in the service against `registry.js`. |
| `is_enabled` | BOOLEAN | N, default `false` | a template must be explicitly enabled before it can be issued (P2) or previewed with saved fields |
| `pinned_version` | INTEGER | Y | NULL = always the registry's current version |
| `saved_fields` | JSONB | N, default `{}` | **D-3**; validated against the template's `saved_field_schema` **on write**, not only on use |
| `reference_pattern` | STRING(120) | Y | **declared now, read by P2** — the column belongs to this table's contract and adding it later means ALTERing a table with rows. Nothing in P1 reads it. |
| `requires_acknowledgement` | BOOLEAN | Y | NULL = inherit from the document type. **Write-only in P1.** |
| `is_confidential` | BOOLEAN | Y | NULL = inherit; may only be **tightened** (Documents D-12). **Write-only in P1.** |
| `updated_by` | UUID FK→users RESTRICT | Y | |
| `created_at` / `updated_at` | | N | |

Three columns are marked **write-only-for-now** above, in the same spirit as the Documents P1
plan's `mandatory_for` / `retention_days`: they are part of this table's contract, they are
validated on write, and **nothing in Phase 1 reads them**. Stated here so nobody later assumes
they were wired.

### 8.4 `document_settings` — two added columns

| Column | Type | Default | Registry |
|---|---|---|:--:|
| `letter_branding_enabled` | BOOLEAN NOT NULL | `true` | **#82** |
| `letter_preview_rate_per_hour` | INTEGER NOT NULL | `60` | **#83** |

Both default to the behaviour an un-migrated org already has (branding on, previews effectively
unlimited at 60/hour for a single HR user clicking a button). Model defaults **must mirror the DB
defaults exactly**, so that a full-row app-side write matches what the migration backfilled — the
rule `document_settings.model.js` already states for its Phase 3/4/5 columns.

```sql
CONSTRAINT document_settings_preview_rate_chk
  CHECK (letter_preview_rate_per_hour BETWEEN 1 AND 1000);
```

### 8.5 Migration hygiene

* Raw SQL for the partial, functional and CHECK constraints Sequelize's builders cannot express —
  exactly as `00049`, `00053` and `00054` do.
* Every CHECK and index is **named**, so `down()` can drop it deterministically.
* `down()` drops in reverse: the two `document_settings` columns, then the three tables, then
  `DROP TYPE IF EXISTS enum_pdf_render_artifacts_source_type CASCADE;` and the three other enums.
* **`down()` on `pdf_render_artifacts` destroys render evidence.** Flagged in the hand-back note
  (§25), matching how `00051`'s destructive `down()` was flagged.
* **Not run by the implementer.** Handed back per the standing operator constraint.

### 8.6 Models

Three files, all under `src/modules/document/models/` (already in `MODEL_ROOTS`).

| File | Model name | Associations |
|---|---|---|
| `pdf_render_artifacts.model.js` | `PdfRenderArtifact` | `belongsTo(Organization, {as:'organization'})`, `belongsTo(User, {foreignKey:'created_by', as:'creator'})`. **No association to `OrgDocument`** — `source_id` is polymorphic; P2 adds the reverse link from `org_documents.generation_artifact_id`, which is a real FK. |
| `document_letter_branding.model.js` | `DocumentLetterBranding` | `belongsTo(Organization)`, `belongsTo(User, {foreignKey:'updated_by', as:'updater'})` |
| `document_letter_configs.model.js` | `DocumentLetterConfig` | same two |

Every association is guarded (`if (models.Organization)`), matching the existing model files.

**The `defaultScope` rule:** `PdfRenderArtifact` declares **no** `defaultScope` excluding
`storage_key`. Exclusion is enforced in the repository (§11.3), because a model-level scope is
silently bypassed by `raw: true` and by any `attributes:` list — which is precisely how a storage
key leaks.

---

## 9. Template Catalog (D-2, D-13, D-18)

### 9.1 Layout

```
src/modules/document/letter-templates/
├── registry.js
├── _partials/
│   ├── base.css.html            <style> block: page box, typography, table, watermark
│   ├── letterhead.html          logo + org identity + accent rule
│   ├── footer.html              identifiers, footer_note, the template_code/vN marker
│   └── signature_block.html     signature image + signatory name/designation
├── experience_letter/v1.html
├── appointment_letter/v1.html
└── bonafide_letter/v1.html
```

**Three templates, chosen to cover three shapes:** `experience_letter` (prose + letterhead +
signature), `appointment_letter` (prose + a **table** of compensation lines, exercising
`{{#each}}`, `page-break-inside: avoid` and column alignment), `bonafide_letter` (minimal — four
lines, proving the letterhead survives a nearly-empty body).

Payroll templates (`src/modules/payroll/pdf-templates/`) are **Phase 3** and are not created here.

### 9.2 Partials are build-time includes, not runtime Handlebars partials

The renderer's `template.service.js` calls `Handlebars.compile(templateHtml)` with **no partial
registration**. A `{{> letterhead}}` would therefore render as **empty string** — silently.

So `_partials/*.html` are assembled by **our** loader with a literal `<!--#include
partial="letterhead" -->` marker replaced at load time, producing one self-contained
`templateHtml` string. The loader is pure string substitution — **not** a template engine, **not**
recursive beyond one level, and it throws on an unresolved marker rather than emitting a blank.
Lint rule 6 (§9.4) bans `{{>` outright so nobody discovers this the hard way.

### 9.3 Registry entry

```js
{
  code: 'experience_letter',
  title: 'Experience Letter',
  document_type_code: 'experience_letter_issued',  // P2 resolves this; P1 only records it
  current_version: 1,
  audience: 'letter',
  required_fields: ['employee_name', 'designation', 'joining_date_text', 'relieving_date_text'],
  optional_fields: ['department_name', 'employee_code', 'closing_note'],
  saved_field_schema: Joi.object({ place_of_issue: Joi.string().trim().max(80),
                                   hr_contact_line: Joi.string().trim().max(160) }).unknown(false),
  sample_data: { /* complete, realistic, PII-FREE — see §9.5 */ },
  pdf_config: {
    format: 'A4',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },  // all four — §5.1
    displayHeaderFooter: false
  }
}
```

`document_type_code` names a type that **does not exist in the catalog yet** — seeder `010` is
Phase 2 work (**D-17**). Phase 1 never resolves it. The registry validator asserts the field is a
non-empty string; it does **not** query the catalog.

### 9.4 Authoring rules — all lint-enforced (D-13)

`tests/unit/pdf/template_lint.test.js` walks every file under `letter-templates/` and fails on:

| # | Rule | Rationale |
|---|---|---|
| 1 | No `{{{ ... }}}` triple-stash, no `SafeString` | The sample template (`public/pages/documents.html`) uses `{{{company.addressHtml}}}`. That is the exact pattern that turns a tenant address field into stored XSS inside Chromium. |
| 2 | No `http://` or `https://` in `src`, `href`, `@import` or `url(...)` | The sample's Google Fonts `<link>` makes render latency and layout depend on a third party (**D-18**). Assets arrive through `data`. |
| 3 | No `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, or `on*=` attribute | |
| 4 | File ≤ 256 KB, and the **assembled** template (partials inlined) ≤ 256 KB | Half the service's 512 KB cap, leaving headroom (**EC-12**). The assembled size is what the service validates, so that is what the lint measures. |
| 5 | Every `{{placeholder}}` is declared in `required_fields` ∪ `optional_fields` ∪ the reserved set, **and** every declared field is used | **The single most important rule in this module.** Handlebars renders a missing key as `""`, so a renamed field produces a legal document with a hole in it (**EC-5**). |
| 6 | No `{{>` partial syntax | §9.2 — it would silently render empty. |
| 7 | No helper other than `eq`, `ne`, `lt`, `gt` and the built-in block helpers `if/unless/each/with/log` | An unregistered helper is a **compile error** in the Lambda ⇒ a `400` ⇒ `500 PDF_TEMPLATE_INVALID` in production. |
| 8 | A `page-break-inside: avoid` declaration on every `.signature-block`, `.totals-row` and `<tr>` rule | A signature split across pages is a rejected document (**EC-27**, a Phase 2 case pre-empted here because the rule belongs with the template, not with the letter). |
| 9 | The registry's `pdf_config.margin` declares **all four** sides, and `format` is present | §5.1 — a partial margin object silently inherits 10mm. |
| 10 | The template contains the `is_preview` watermark block and the `template_code/vN` footer marker | §1.4 (5); and when HR reports "this letter looks wrong", the version is on the page. |

Rules 5, 9 and 10 read `registry.js`; the rest are pure text checks. The lint is **written before
the first template** (§24, Step 6) so that no template is ever authored against an unenforced rule.

### 9.5 Sample data

Every registry entry carries complete `sample_data` that is **realistic and PII-free**: an obvious
placeholder name (`Asha Sample`), a placeholder employee code, dates in the past, and — where a
letter prints compensation — round numbers. Requirements:

* It satisfies the template's own `required_fields` in full, so a preview never trips the runtime
  required-field assertion.
* It is used by **three** consumers: the `#136` HR "what does this letter look like" response, the
  `#138` preview, and the golden-fixture tests. One definition, three uses — so a field added to a
  template and not to `sample_data` fails the lint immediately.

### 9.6 Loading

`template_loader.utils.js` reads a template from disk **once**, assembles its partials, and caches
the assembled string in a module-level `Map` keyed `code:version` — the same singleton discipline
the renderer's own browser service uses. A disk read per render would be a syscall on every
payslip in P3's 20 000-entry batch, and the cost of that decision is paid here.

`NODE_ENV === 'development'` bypasses the cache, so a template edit is visible on the next preview
without a restart. Production always caches.

### 9.7 Reserved data keys

Every template may use these without declaring them; the builder always supplies them:

| Key | Source |
|---|---|
| `branding.*` | the resolved branding object (§13.2) — `org_name`, `address_lines[]`, `logo_src`, `signature_src`, `signatory_name`, `signatory_designation`, `accent_color`, `identifiers[]`, `footer_note`, `letterhead_enabled` |
| `is_preview` | `true` only on the preview path — drives the watermark |
| `issued_on_text` | the pinned date, formatted |
| `template_marker` | `"experience_letter/v1"` — the footer marker |

`logo_src` and `signature_src` are **complete `src` attribute values** (a `data:` URI or a
presigned URL), never a bare storage key, and never a bare bucket path.

---
## 10. View-Model Builders (D-15)

The renderer has four helpers. Everything a template prints must therefore arrive as a
**display-ready string**. That constraint is not a nuisance — it is what makes the output
testable without a browser.

### 10.1 The contract

```
src/modules/document/builders/
├── branding.builder.js          resolveBranding(profile, brandingRow, assetSrcs) -> branding VM
├── letter_preview.builder.js    buildPreviewViewModel({template, branding, savedFields, pinnedDate})
```

A builder is a **pure function**: same inputs → byte-identical output. Enforced by convention and
by test, and it is what makes `input_hash` meaningful.

| Rule | Consequence |
|---|---|
| No `Date.now()`, no `new Date()` with no argument | Every date comes in as an argument. A builder that reads the clock cannot be re-run to reproduce yesterday's PDF (**D-16**). |
| No DB access, no `await` | Data is fetched by the service and handed in whole. |
| No `Intl`, no `toLocaleString`, no `toLocaleDateString` | Output must not depend on the container's ICU build. `pdf_format.utils.js` (§7) exists precisely so nobody reaches for these. |
| Emits strings, booleans and arrays of those only | No `Date` objects, no `Decimal`, no `null` where the template prints — absent scalars become `EMPTY` (`'—'`) or are omitted so `{{#if}}` can hide the block. |
| Never emits a storage key, a presigned URL's query string in a logged field, or an internal id | What the builder emits is frozen into `input_snapshot` and stored. Treat it as world-readable within the org. |

### 10.2 Why `null` is not allowed to reach a template

Handlebars renders `null`, `undefined` and a missing key **all** as the empty string. A letter
that should read "Designation: Senior Engineer" silently becomes "Designation: " — a valid PDF
with a hole in it, signed and issued. So:

* **Required** fields: the builder throws `AppError(422, ..., 'PDF_DATA_INCOMPLETE')` if any
  `required_fields` entry resolves empty. Failing loudly beats issuing a defective letter.
* **Optional** fields: the builder emits `EMPTY` for an inline value, or omits the key entirely
  when the template wraps it in `{{#if}}`. Which of the two is a per-field decision recorded in
  the registry's `optional_fields` — and lint rule 5 guarantees the template and the registry
  agree.

### 10.3 Asset embedding (D-12)

`resolveBranding` receives already-resolved `logo_src` / `signature_src` strings; it never talks
to S3. The service resolves them, by the rule fixed in §6:

| Condition | Result |
|---|---|
| No key stored, or `letterhead_enabled = false` | key omitted; template hides the block via `{{#if}}` |
| Object ≤ 64 KB | `getObject` → `data:image/png;base64,...` — no network call from Chromium, no expiry, deterministic bytes |
| Object > 64 KB | presigned GET, TTL 300 s via `getViewUrl` |
| `HeadObject` says the object is gone | the block is hidden and a `WARN` is logged. **A missing logo does not fail a render** — a letter without a logo is recoverable; a 500 on the preview button is not. |

Raster only. **SVG is rejected at upload** (`#132` validation): an SVG is an XML document that
Chromium will happily parse, and it can carry `<script>` and external references. The 64 KB
threshold is an org setting candidate for a later phase; in Phase 1 it is a module constant, so
there is one number to reason about.

### 10.4 Determinism test

`tests/unit/pdf/builders.test.js` calls each builder twice with `structuredClone`d inputs and
asserts `deepStrictEqual`, then asserts the canonical JSON serialisation is byte-identical. Two
fixture runs under `TZ=Pacific/Kiritimati` and `TZ=Pacific/Midway` assert the same date strings
(§7). This is the test that catches a stray `new Date()` on the day someone adds one.

---

## 11. Layer Responsibilities

Four layers, no shortcuts between them. Unchanged from the Documents module — repeated here only
where PDF work adds an obligation.

### 11.1 Controller (`src/modules/document/controllers/`)

* Parses and validates `req.body`, `req.params` and — **inside the handler, not in middleware** —
  `req.query` (Express 5 makes `req.query` a getter; assigning to it throws).
* Resolves the actor: `orgId`, `actorId`, `role`, `ipAddress`, `requestId`. **`org_id` always
  comes from the authenticated token, never from the body or the query.**
* Calls exactly one service method.
* Shapes the HTTP response. For the two PDF-returning endpoints it calls
  `buildDownloadHeaders({format:'pdf', fileName, byteLength})` from
  `src/modules/payroll/utils/download_headers.utils.js` — the same cross-module import three
  document controllers already make — and writes the buffer with `res.end(buffer)`.
* **Never** touches a model, a repository, S3, or the renderer.

### 11.2 Service (`src/modules/document/services/`, plus one in `src/common/services/`)

* Owns authorization beyond the route's role gate, all business rules, transaction boundaries,
  and every audit write.
* Owns **ordering**: network I/O (renderer, S3) happens **outside** the transaction; the
  transaction opens only to write the outcome. §17 states this as a rule with teeth.
* Is the only layer permitted to see a `storage_key` or a presigned URL.

### 11.3 Repository (`src/modules/document/repositories/`, plus one in `src/common/repositories/`)

* One model per repository, every method takes `{ transaction }`, every predicate carries
  `org_id`. No repository method exists that can be called without an org scope — the parameter
  is required, not defaulted.
* `pdf_render_artifact.repository.js` defines **`SAFE_ATTRIBUTES`**, a frozen explicit column
  list that omits `storage_key` and `input_snapshot`, and every read method used by a
  controller-facing path passes it. Two escape hatches exist and are named so they are greppable:
  `findByIdWithKey` and `findForRenderById`, used only by the service's storage paths.
  Enforcement lives here rather than in a model `defaultScope` because a `defaultScope` is
  silently bypassed by `raw: true` and by any explicit `attributes:` list — exactly how a key
  leaks.
* No business rules. No `AppError` except `404`-shaped "not found" returns (`null`), which the
  service converts.

### 11.4 Pure utilities (`src/modules/document/utils/`, `src/common/utilities/`)

No I/O, no clock, no randomness, no `AppError` construction that depends on request context.
`pdf_format.utils.js`, `template_loader.utils.js` (disk read at boot/first-use only, cached),
`pdf_hash.utils.js` (canonical JSON + SHA-256), and the builders of §10.

### 11.5 Provider (`src/infrastructure/pdf-renderer/`)

The only code in the repo that knows the renderer's URL, its wire format, or its base64 quirk
(§5). It speaks `renderPdf(...)` and throws two typed errors. It does not know what a letter is.

---

## 12. Services

Three new services and one new provider. Nothing else moves.

### 12.1 `src/common/services/pdf_render.service.js` — the render pipeline

Cross-module by deliberate placement (§1.4 (6)): Phase 3 has Payroll call this for payslips, and
Payroll must not `require()` out of `modules/document`.

```js
renderAndRecord({
  orgId, actorId, requestId,
  templateCode, templateVersion,
  viewModel,                 // the builder's output — frozen from here on
  pdfConfig,
  sourceType,                // 'preview' in P1
  sourceId,                  // null in P1
  retentionClass,            // 'cache' in P1
  idempotencyKey,
  pinnedDate,
  persist                    // false in P1 -> bytes returned, storage_key stays NULL
}) -> { artifactId, buffer, sizeBytes, contentHash, reused: boolean }
```

Steps, in this exact order:

1. `inputHash = sha256(canonicalJson(viewModel))`.
2. **Idempotency probe**: `findByOrgAndKey(orgId, idempotencyKey)`. A `ready` row with a matching
   `input_hash` short-circuits — return `{reused: true}` plus, when `persist`, the stored bytes.
   A `ready` row with a *different* `input_hash` is a **key collision**: `409
   PDF_IDEMPOTENCY_CONFLICT`, never a silent overwrite.
3. Insert the artifact row `status = 'pending'`, `input_snapshot = viewModel`, `attempt_count = 1`
   — in its **own** short transaction, committed before any network call. This row is the
   evidence that a render was attempted; a row that only appears on success cannot explain a
   timeout. A unique-violation on `(org_id, idempotency_key)` here means a concurrent request won
   the race → re-read and go to step 2 (§18).
4. Assemble `templateHtml` (cached loader), assert assembled size ≤ 256 KB.
5. `renderPdf(...)` — **outside any transaction**, with the provider's own retry policy (§5.3).
6. Verify the bytes: `%PDF-` prefix, `%%EOF` in the tail, `sizeBytes > 0`, `sizeBytes ≤ 6 MB`
   (the API Gateway ceiling — a larger response cannot have arrived intact).
7. `contentHash = sha256(buffer)`.
8. When `persist`: `putObject` to the deterministic key. Not exercised in Phase 1.
9. Transaction: update the row to `ready` with `content_hash`, `size_bytes`, `render_ms`,
   `renderer_version`, `storage_key` (or NULL). Audit inside the same transaction. Commit.
10. On any failure from step 4 onward: mark the row `failed` with `failure_code` and a truncated
    `failure_reason`, **in a separate transaction that does not swallow the original error**, then
    rethrow. A failed mark that itself fails is logged and ignored — it must not mask the real
    cause.

The service never logs `viewModel`, never logs `buffer`, and never puts a storage key in an error
message.

### 12.2 `document_letter_branding.service.js`

`getOrCreate`, `replace` (full PUT), `issueAssetUploadUrl`, `confirmAsset`, `previewBranding`.

The asset handshake is **copied**, not reinvented, from
`document_template.service.js`: `pg_advisory_xact_lock(hashtext(:key))` → presign → client PUT →
`headObject` → content-type and size verified **from the head, not the claim** → ETag recorded as
a checksum only when it has no `-` (a multipart ETag is not an MD5) → idempotent replay when the
same key is confirmed twice.

Replacing a logo leaves the **old object in place**. Deleting it would break every previously
issued letter that used it, once P2 stores letters. The old key is recorded in the audit
`old_values`; reclamation is P5's purger. This is a deliberate, stated leak of ~100 KB per
branding change.

### 12.3 `document_letter_template.service.js`

`listCatalog`, `getTemplate`, `upsertConfig`, `previewTemplate`.

Owns the registry↔DB join: the catalog is a repo asset, the enablement state is a row, and a
config row whose `template_code` is no longer in the registry is reported with
`is_orphaned: true` rather than hidden or deleted — HR needs to see why a letter stopped being
offered.

`upsertConfig` validates `saved_fields` against the template's `saved_field_schema` **on write**.
Validating only on use means a bad config sits in the database until the day someone issues a
letter.

### 12.4 `src/infrastructure/pdf-renderer/pdf_renderer.provider.js`

Specified in full in §5. Listed here so the layer map is complete.

---

## 13. End-to-End Flow

### 13.1 Phase 1 is synchronous. There is no queue, no worker, no job table.

The prompt asks which of the two flows Phase 1 requires. The answer is the synchronous one, and
the reasoning is arithmetic, not preference:

* A Phase 1 preview is **one** PDF, triggered by **one** HR user clicking a button, and that user
  is staring at a spinner waiting for it. An async job would make them poll for a result they
  need in two seconds.
* Budget: renderer p95 ≈ 3 s cold / 1.2 s warm, our client timeout 15 s, one retry on a
  connect-class failure ⇒ worst case ~31 s. Node's default server timeout does not cut this off;
  the client-side timeout is the control.
* Nothing in Phase 1 renders more than one document per request. `#134` and `#138` are
  explicitly single-document endpoints, and no Phase 1 endpoint accepts a list of subjects.

**The queue arrives in Phase 3**, when payslip batches make N synchronous renders indefensible,
and `pdf_render_jobs` is created then. Building it now would mean shipping a worker, a claim
protocol and a drain endpoint with exactly one producer that does not need them — which the
prompt explicitly rules out.

### 13.2 The nine stages, for `POST /documents/hr/letter-templates/:code/preview` (#138)

| # | Stage | What happens | Failure |
|---|---|---|---|
| 1 | **Request** | `POST` with `{ use_saved_fields?, override_fields? }`. Body ≤ 8 KB (`express.json` caps at 10 MB globally; this endpoint validates its own shape strictly, `allowUnknown:false`). | `400 VALIDATION_ERROR` |
| 2 | **Authentication** | `authenticate` middleware; JWT → `req.user`. | `401` |
| 3 | **Authorization** | `authorize(['hr'])` + `requireFeature('documents.access')`. Then the service re-derives `orgId` from the token. `:code` is validated against the registry; an unknown code is `404 TEMPLATE_NOT_FOUND` — the same shape another org's disabled template returns. | `403` / `404` |
| 4 | **Validation** | `validateOrThrow` on the body; `override_fields` keys must be a subset of `saved_field_schema`; the per-org preview rate counter (§16.5) is checked and incremented. | `400`, `429 PREVIEW_RATE_LIMITED` |
| 5 | **Data preparation** | Read `document_settings` (`letter_branding_enabled`), `document_letter_branding` (getOrCreate), `organization_profiles`, and the `document_letter_configs` row. Resolve `logo_src` / `signature_src` (§10.3 — S3 reads happen **here**, before any transaction). Merge profile ← branding row field-by-field. Merge saved fields: `template.sample_data` ← `saved_fields` ← `override_fields` (last wins). Pin the date **once** and pass it down. Set `is_preview = true`. | `502 STORAGE_UNAVAILABLE` if S3 is down *and* an asset is required — otherwise the asset is dropped and the render proceeds |
| 6 | **PDF generation** | `renderAndRecord({ sourceType:'preview', sourceId:null, retentionClass:'cache', persist:false, idempotencyKey: sha256(orgId+code+version+inputHash).slice(0,64) })`. The idempotency key is **derived from the content**, so clicking preview twice with no changes reuses the artifact row instead of accumulating rows. | §19 |
| 7 | **Storage** | **Not Applicable in Phase 1.** `persist:false` ⇒ no `putObject`, no `storage_key`, no orphan object (§1.4 (3)). |  |
| 8 | **Database persistence** | The artifact row transitions `pending → ready` (or `failed`) in one transaction, with the audit row written inside it. | §19 case D |
| 9 | **Response** | `200`, `Content-Type: application/pdf`, `Content-Disposition: inline; filename*=...` — **inline**, because this is a preview the HR user looks at, not a document they file. `buildDownloadHeaders` forces `attachment`, so this endpoint sets its headers directly and keeps `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store` explicitly. `X-Artifact-Id` carries the artifact id for support correlation. | — |

`#134` (branding preview) is the same flow with a fixed internal template code, no
`document_letter_configs` read, and no `override_fields`.

### 13.3 What the other seven endpoints do

`#130`–`#133`, `#135`–`#137` are ordinary CRUD over two tables plus a presign handshake; they
touch neither the renderer nor a PDF. They are specified in §14 and are listed here only to make
the point that **seven of the nine Phase 1 endpoints never render anything** — the render path is
narrow on purpose.

---
## 14. API Surface — #130 to #138

All nine mount under the **existing** `/api/v1/documents` base, in a new router file
`document_letter.routes.js` required by the module's `index.routes.js`. Every route carries
`[authenticate, authorize(['hr']), requireFeature('documents.access')]`. Registry numbering
continues from documents #129.

**Route-ordering note:** `/hr/letter-branding/...` must be declared **before** any existing
`/hr/:something` parameterised route in the document module, or the literal segment is swallowed.
`:code` matches `^[a-z][a-z0-9_]{2,63}$` — it is a template code, **not** a UUID, so the
module's UUID param validator must not be applied to it.

**Shared error responses** (omitted from each table below): `401 UNAUTHORIZED` (no/invalid
token), `403 FORBIDDEN` (role or feature gate), `500 INTERNAL_ERROR`. `org_id` is **always**
taken from the token; no endpoint accepts it in a body, query or path.

---

### #130 — `GET /documents/hr/letter-branding`

| Attribute | Specification |
|---|---|
| **Purpose** | Load the org's letterhead identity for the HR branding form. |
| **Roles** | `hr` |
| **Request** | No parameters. |
| **Validation** | Not Applicable. |
| **Controller** | Resolve actor; call `getOrCreate`; `200`. |
| **Service** | `getOrCreate(orgId)` — read, and insert defaults if absent, in one transaction with `ON CONFLICT` semantics via `findOrCreate` (the `UNIQUE (org_id)` index is the race backstop). Merge `organization_profiles` into the response as `inherited` so the form can show placeholder text for unset fields. |
| **Database** | Read `document_letter_branding`, `organization_profiles`. May **insert** one defaults row. |
| **PDF impact** | Not Applicable. |
| **Storage impact** | Read-only metadata. `logo_storage_key` is **never** in the response; instead `logo_present: true/false` and `logo_size_bytes`. A short-lived view URL is issued only on request via `?include_asset_urls=true` (validated inside the controller), TTL 300 s. |
| **Success** | `200 { branding: {...}, inherited: {...}, assets: { logo_present, signature_present } }` |
| **Errors** | — |
| **Authorization** | Role gate only; the row is addressed solely by the token's `org_id`, so cross-tenant access is structurally impossible. |
| **Idempotency** | Safe method; the `getOrCreate` insert is idempotent under the unique index. |
| **Side effects** | Possible first-access row creation. Audited as `letter_branding.initialized` only when a row is actually created. |

---

### #131 — `PUT /documents/hr/letter-branding`

| Attribute | Specification |
|---|---|
| **Purpose** | Replace the org's letterhead identity (text fields only; assets go through #132/#133). |
| **Roles** | `hr` |
| **Request body** | `signatory_name?`, `signatory_designation?`, `registered_address_lines?: string[]`, `cin?`, `gstin?`, `pan?`, `tan?`, `contact_email?`, `contact_phone?`, `website?`, `accent_color_hex?`, `footer_note?`, `letterhead_enabled?` |
| **Validation** | Joi, `allowUnknown:false`, `stripUnknown:true`. `accent_color_hex` must match `^#[0-9A-Fa-f]{6}$` (**CSS injection control**). `website` must pass `isSafeReferenceUrl` (https, ≤1000 chars). `registered_address_lines` ≤5 entries, each ≤120 chars, trimmed, empties dropped. `contact_email` RFC-shaped. All text fields rejected if they contain `<` or `>` — defence in depth behind the double-stash, and no legitimate letterhead needs an angle bracket. |
| **Controller** | Validate body; call `replace`; `200`. |
| **Service** | Full replace inside one transaction: `findByOrgId({lock: true})`, apply, write audit with `old_values`/`new_values`, commit. Asset columns are **not** touched — a PUT that omitted them must not erase a logo. |
| **Database** | Update one `document_letter_branding` row (+insert if first write). One `document_audit_logs` row, same transaction. |
| **PDF impact** | None directly; the next render picks up the new values. **No cached artifact is invalidated** — Phase 1 stores no re-servable artifact, and a Phase 2 issued letter must keep the branding it was issued with. |
| **Storage impact** | Not Applicable. |
| **Success** | `200 { branding }` |
| **Errors** | `400 VALIDATION_ERROR` |
| **Authorization** | Role gate + token-derived `org_id`. |
| **Idempotency** | Naturally idempotent (full replace). Two concurrent PUTs are serialised by the row lock; last writer wins, both audited. |
| **Side effects** | Audit row. |

---

### #132 — `POST /documents/hr/letter-branding/assets/upload-url`

| Attribute | Specification |
|---|---|
| **Purpose** | Issue a presigned S3 PUT for a logo or signature image. |
| **Roles** | `hr` |
| **Request body** | `asset_type: 'logo'\|'signature'`, `file_name`, `content_type`, `size_bytes` |
| **Validation** | `content_type ∈ { image/png, image/jpeg }` — **raster only; `image/svg+xml` is rejected** (an SVG is executable XML inside Chromium). `size_bytes` ≤ 512 KB for a logo, ≤ 256 KB for a signature. `file_name` through `sanitizeFileName`. |
| **Controller** | Validate; call `issueAssetUploadUrl`; `201`. |
| **Service** | `pg_advisory_xact_lock(hashtext('letter-branding:' + orgId))`; build the key via `buildObjectKey({orgId, segments:['branding', assetType, randomUUID() + ext]})`; persist the **claimed** content type and size to a pending column set; presign PUT with `getUploadUrl` (TTL 600 s, capped at 3600 by the provider). |
| **Database** | Writes the claimed metadata so `#133` has something to compare against. Audit `letter_branding.asset_upload_requested`. |
| **PDF impact** | Not Applicable. |
| **Storage impact** | No object yet. A client that never PUTs leaves nothing behind. |
| **Success** | `201 { upload_url, storage_key_token, expires_in }` — `storage_key_token` is an opaque id, **not** the raw key. |
| **Errors** | `400 VALIDATION_ERROR`, `415 UNSUPPORTED_MEDIA_TYPE`, `413 FILE_TOO_LARGE`, `502 STORAGE_UNAVAILABLE` |
| **Authorization** | Key prefix is `org/{orgId}/...` derived from the token — a caller cannot presign into another tenant's prefix. |
| **Idempotency** | Not idempotent by design: each call mints a fresh random key. Repeated calls are cheap and leave no object. |
| **Side effects** | A presigned URL exists for 10 minutes. |

---

### #133 — `POST /documents/hr/letter-branding/assets/confirm`

| Attribute | Specification |
|---|---|
| **Purpose** | Verify the uploaded object actually exists and matches its claim, then commit it as the org's asset. |
| **Roles** | `hr` |
| **Request body** | `storage_key_token`, `checksum?` (client-computed, advisory) |
| **Validation** | Token must resolve to a pending claim for **this** org and asset type; unresolvable → `404`. |
| **Controller** | Validate; call `confirmAsset`; `200`. |
| **Service** | `headObject` (3 s timeout) **outside** the transaction → `null` means the client never uploaded → `409 UPLOAD_NOT_FOUND`. Then verify **from the head, not the claim**: content type in the allow-list, `contentLength` within the cap, and `verifiedContentTypeMatches(claimed, head.contentType)`. Checksum recorded only when `head.etag` contains no `-` (a multipart ETag is not an MD5). Then one transaction: commit `*_storage_key`, `*_content_type`, `*_size_bytes`, audit, commit. |
| **Database** | Updates three columns on `document_letter_branding`. Audit `letter_branding.asset_confirmed`, with the **old** key in `old_values` (scrubbed by `SCRUBBED_KEYS`). |
| **PDF impact** | The next render embeds the new asset. |
| **Storage impact** | The previous object is **deliberately not deleted** (§12.2). Reclamation is P5. |
| **Success** | `200 { branding }` |
| **Errors** | `404 UPLOAD_CLAIM_NOT_FOUND`, `409 UPLOAD_NOT_FOUND`, `415`, `413`, `502 STORAGE_UNAVAILABLE` |
| **Authorization** | The claim row is looked up with `org_id` in the predicate. A token from another org is a `404`, not a `403`. |
| **Idempotency** | **Yes** — confirming the same token twice returns `200` with the same state, by the `confirmed_at` replay check copied from `document_template.service.js`. |
| **Side effects** | Audit row. Storage cost of the orphaned previous object. |

---

### #134 — `POST /documents/hr/letter-branding/preview`

| Attribute | Specification |
|---|---|
| **Purpose** | Render a one-page sample letter so HR can see their letterhead, logo, signature and accent colour on an actual A4 page before any real letter uses them. |
| **Roles** | `hr` |
| **Request body** | Empty object. (No overrides — this previews *saved* branding.) |
| **Validation** | Body must be `{}`; rate counter checked (§16.5). |
| **Controller** | Call `previewBranding`; set PDF headers; `res.end(buffer)`. |
| **Service** | §13.2 stages 5–8 with the internal `_branding_probe/v1` template and its `sample_data`. `is_preview = true`. |
| **Database** | Reads branding + profile + settings. **Inserts one `pdf_render_artifacts` row** (`source_type='preview'`, `retention_class='cache'`, `storage_key` NULL) and transitions it to `ready`/`failed`. Audit `pdf.preview_rendered`. |
| **PDF impact** | One synchronous renderer call. |
| **Storage impact** | **Reads** the logo/signature objects (`getObject` ≤64 KB, else presign). **Writes nothing.** |
| **Success** | `200 application/pdf`, `Content-Disposition: inline`, `X-Artifact-Id` |
| **Errors** | `429 PREVIEW_RATE_LIMITED`, `502 PDF_RENDERER_UNAVAILABLE`, `500 PDF_TEMPLATE_INVALID`, `504 PDF_RENDER_TIMEOUT`, `502 STORAGE_UNAVAILABLE` |
| **Authorization** | Role gate; org-scoped reads only. |
| **Idempotency** | Content-derived `idempotency_key`; an unchanged repeat reuses the artifact row and re-renders (nothing is stored to return). |
| **Side effects** | One artifact row, one audit row, one rate-counter increment, one outbound HTTPS call. |

---

### #135 — `GET /documents/hr/letter-templates`

| Attribute | Specification |
|---|---|
| **Purpose** | The template catalog joined with this org's enablement state — the list screen. |
| **Roles** | `hr` |
| **Request** | Optional `?enabled=true\|false` — **parsed inside the controller** (Express 5). |
| **Validation** | `enabled` must be exactly `'true'` or `'false'` when present. |
| **Controller** | Parse query; call `listCatalog`; `200`. |
| **Service** | Iterate `registry.js`; left-join the org's `document_letter_configs` rows; mark `is_orphaned` for config rows with no registry entry. |
| **Database** | One indexed read on `(org_id)`. |
| **PDF impact** | Not Applicable. |
| **Storage impact** | Not Applicable. |
| **Success** | `200 { templates: [{ code, title, current_version, is_enabled, pinned_version, has_saved_fields, is_orphaned }] }` |
| **Errors** | `400 VALIDATION_ERROR` |
| **Authorization** | Role gate; the catalog itself is not org data, the enablement state is. |
| **Idempotency** | Safe method. |
| **Side effects** | None. |

---

### #136 — `GET /documents/hr/letter-templates/:code`

| Attribute | Specification |
|---|---|
| **Purpose** | Everything the HR config form needs: the field schema, the org's current saved values, and the sample data. |
| **Roles** | `hr` |
| **Request** | Path `:code`. |
| **Validation** | `:code` must match `^[a-z][a-z0-9_]{2,63}$` **and** exist in the registry. |
| **Controller** | Validate param; call `getTemplate`; `200`. |
| **Service** | Registry entry + config row. `saved_field_schema` is serialised to a **form descriptor** (`[{key, label, type, max_length, required}]`), not as a Joi object — the frontend must not be asked to interpret Joi internals, and that is the contract the `md_updates` record will publish. |
| **Database** | One read on `(org_id, template_code)`. |
| **PDF impact** | Not Applicable. |
| **Storage impact** | Not Applicable. |
| **Success** | `200 { template: { code, title, current_version, required_fields, optional_fields, fields: [...], sample_data }, config: { is_enabled, pinned_version, saved_fields } \| null }` |
| **Errors** | `404 TEMPLATE_NOT_FOUND` |
| **Authorization** | Role gate + org-scoped config read. |
| **Idempotency** | Safe method. |
| **Side effects** | None. |

---

### #137 — `PUT /documents/hr/letter-templates/:code/config`

| Attribute | Specification |
|---|---|
| **Purpose** | Enable/disable a template for the org and store its per-org saved fields. |
| **Roles** | `hr` |
| **Request body** | `is_enabled: boolean`, `saved_fields?: object`, `pinned_version?: integer\|null`, `reference_pattern?`, `requires_acknowledgement?`, `is_confidential?` |
| **Validation** | `saved_fields` validated against **this template's** `saved_field_schema` with `unknown(false)` — an unrecognised key is a `400`, not silently stripped, because a silently dropped field is a letter with a blank line in it. `pinned_version` must be a version the repo actually ships (P1: only `1`). The three write-only columns are validated but **not read by Phase 1** (§8.3). |
| **Controller** | Validate param + body; call `upsertConfig`; `200`. |
| **Service** | One transaction: upsert on `(org_id, template_code)`, audit with old/new, commit. Concurrent upserts are resolved by the unique index → retry once on unique-violation, then read-modify-write under `lock: true`. |
| **Database** | Insert or update one `document_letter_configs` row + one audit row, same transaction. |
| **PDF impact** | Changes what a subsequent `#138` renders. No existing artifact is altered. |
| **Storage impact** | Not Applicable. |
| **Success** | `200 { config }` |
| **Errors** | `400 VALIDATION_ERROR`, `404 TEMPLATE_NOT_FOUND` |
| **Authorization** | Role gate + token `org_id` in the predicate. |
| **Idempotency** | Full replace of the config ⇒ naturally idempotent. |
| **Side effects** | Audit row. |

---

### #138 — `POST /documents/hr/letter-templates/:code/preview`

| Attribute | Specification |
|---|---|
| **Purpose** | Render the template with **sample data**, merged with the org's branding and saved fields, so HR can verify wording and layout before enabling it. |
| **Roles** | `hr` |
| **Request body** | `use_saved_fields?: boolean` (default `true`), `override_fields?: object` |
| **Validation** | `override_fields` keys must be a subset of `saved_field_schema`; each value re-validated by the same schema. **`subject_user_id` is not accepted** — the parent plan's `#138` allowed a real employee; Phase 1 does not, and a request containing it is a `400` from `allowUnknown:false`. Rationale in §1.4 (2): no real employee PII leaves this process while the renderer is unauthenticated. Rate counter checked. |
| **Controller** | Validate param + body; call `previewTemplate`; PDF headers; `res.end(buffer)`. |
| **Service** | The full §13.2 pipeline. Merge order `sample_data ← saved_fields ← override_fields`. `is_preview = true` ⇒ watermark. Required-field assertion before the render call. |
| **Database** | Reads settings/branding/profile/config. One `pdf_render_artifacts` row, `pending → ready\|failed`. Audit `pdf.preview_rendered` with `{template_code, template_version, artifact_id}` — never the view-model. |
| **PDF impact** | One synchronous renderer call, ≤15 s, ≤1 retry. |
| **Storage impact** | Reads branding assets only. **No `putObject`.** |
| **Success** | `200 application/pdf`, `Content-Disposition: inline; filename*=UTF-8''<code>-preview.pdf`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `X-Artifact-Id` |
| **Errors** | `400 VALIDATION_ERROR`, `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_DISABLED` (when `use_saved_fields` and the config is disabled), `422 PDF_DATA_INCOMPLETE`, `429 PREVIEW_RATE_LIMITED`, `502 PDF_RENDERER_UNAVAILABLE`, `504 PDF_RENDER_TIMEOUT`, `500 PDF_TEMPLATE_INVALID` |
| **Authorization** | Role gate; every read carries the token's `org_id`; an unknown or another org's template code yields the identical `404 TEMPLATE_NOT_FOUND` body. |
| **Idempotency** | `idempotency_key = sha256(orgId + code + version + inputHash)`. A no-change repeat reuses the row (`reused: true` internally) rather than inserting a duplicate. Bytes are re-rendered because nothing is stored. |
| **Side effects** | One artifact row, one audit row, one rate increment, one outbound HTTPS call. |

---

### 14.1 Frontend change record

`#130`–`#138` are all new; no existing contract changes. Even so, a dated record is required by
the project convention and must be written as part of Step 11:

`public/md_updates/2026-09-26_pdf-generation-phase1-letter-branding-and-templates.md` — listing
the nine endpoints, their request/response shapes, the `fields` form-descriptor contract from
`#136`, the two binary-returning endpoints and their headers, the `storage_key_token` indirection
(so the frontend never expects a raw key), and every new error code with its HTTP status.

---
## 15. Business Rules & Validation

### 15.1 Rules

| # | Rule | Enforced at | Failure |
|---|---|---|---|
| BR-1 | An org has exactly **one** branding row. | `UNIQUE (org_id)` + `findOrCreate` | unique violation → re-read, never a second row |
| BR-2 | A branding asset is only committed after **HeadObject** confirms it exists with an allowed type and size. A client's claim is never trusted. | `confirmAsset` | `409 UPLOAD_NOT_FOUND` / `415` / `413` |
| BR-3 | Replacing an asset never deletes the previous object. | `confirmAsset` | — (stated leak, §12.2) |
| BR-4 | `saved_fields` is validated against the template's schema **on write**, not on use. | `upsertConfig` | `400` |
| BR-5 | A template code that is not in `registry.js` does not exist, for every endpoint. | service, against the registry | `404 TEMPLATE_NOT_FOUND` |
| BR-6 | Every `required_fields` entry must resolve to a non-empty string before the renderer is called. | builder | `422 PDF_DATA_INCOMPLETE` |
| BR-7 | A preview is always watermarked. `is_preview` is set by the service, not by the caller. | service + lint rule 10 | — |
| BR-8 | A preview never contains real employee data in Phase 1. | `allowUnknown:false` rejects `subject_user_id`; no builder input reads `user_profiles` | `400` |
| BR-9 | Every render writes an artifact row **before** the renderer is called. | `renderAndRecord` step 3 | — |
| BR-10 | A `ready` artifact always has `content_hash` and `size_bytes`. | CHECK constraint + service | DB error (a bug, not a user error) |
| BR-11 | An artifact's `input_snapshot` is written once and never updated. | service writes it on insert only; no update path sets it | — |
| BR-12 | Bytes that do not start `%PDF-` and end with `%%EOF` are not a PDF. | `renderAndRecord` step 6 | `502 PDF_RENDERER_INVALID_RESPONSE` |
| BR-13 | A response larger than 6 MB cannot have survived API Gateway intact and is rejected rather than stored. | step 6 | `502` |
| BR-14 | When `letter_branding_enabled = false`, letterhead, logo and signature blocks are all suppressed — the org prints on pre-printed stationery. | builder | — |
| BR-15 | Preview volume per org is capped by `letter_preview_rate_per_hour`. | §16.5 | `429` |
| BR-16 | An accent colour is six hex digits or the write is rejected. It is interpolated into CSS. | Joi + CHECK | `400` |

### 15.2 Validation placement

Three layers, each with a different job, and none substituting for another:

1. **Joi at the controller** — shape, type, length, enum, `allowUnknown:false`. Produces `400
   VALIDATION_ERROR` through `validateOrThrow`, which already returns
   `AppError(400, details[0].message, 'VALIDATION_ERROR')`.
2. **Service rules** — cross-field and cross-row logic that needs a database read (does this
   template exist, is it enabled, does this claim belong to this org).
3. **Database constraints** — the invariants that must hold even if a future code path forgets:
   the two unique indexes, the `ready` CHECK, the accent-colour CHECK, the address-length CHECK,
   the rate-setting range CHECK.

Rule: a constraint that exists in the database must **also** exist in the application, because a
raw `23514` surfacing as a `500` is a bad error message. The database copy is the backstop, not
the user interface.

---

## 16. Authorization & Security

### 16.1 Authentication

Unchanged: `authenticate` verifies the JWT and populates `req.user`. No new auth surface, no new
token type, no service-to-service credential inbound.

### 16.2 Authorization model

Phase 1 is **HR-plane only**. There is no employee endpoint, no manager endpoint, and nothing an
employee can call. That is not an oversight — branding and template configuration are org
administration, and the employee-facing surface arrives in P2 when letters become
`org_documents` and inherit the document module's existing visibility rules (**D-6**).

`admin` / `super-admin` are **platform** roles and receive no access here, consistent with the
tenant/platform split the rest of the codebase enforces.

### 16.3 Tenant isolation — the structural argument

Phase 1 has **no endpoint that takes an org-scoped resource id in the path or body**. `#130`,
`#131` and `#134` address the branding row by the token's `org_id` alone. `#135`–`#138` address
a config row by `(token org_id, :code)`, where `:code` is a *repo-level* identifier shared by
every tenant, not a row id. `#133`'s `storage_key_token` is the single opaque id a client hands
back, and it is resolved with `org_id` in the predicate.

So **IDOR is structurally impossible in Phase 1**, not merely defended against. This is worth
stating plainly because it changes what the security tests must prove: they must prove the
*absence* of an id-accepting path, and must fail if a future change introduces one. Test
`tests/unit/pdf/no_resource_ids.test.js` asserts that no Phase 1 route pattern contains a
`:id`-shaped parameter other than `:code`, and that `:code` is never used as a primary key
lookup.

### 16.4 Storage-path security

| Control | Implementation |
|---|---|
| Key construction | `buildObjectKey({orgId, segments})`, which prefixes `org/{orgId}/` and runs `assertSafeSegment` on every part (rejects `/`, `\`, NUL, `..`, empty). A caller-supplied string never reaches a key. |
| Filename | `sanitizeFileName` before it appears in `Content-Disposition`; RFC 5987 encoding via `buildDownloadHeaders`. |
| Content type | Allow-list at presign **and** re-verified from `HeadObject` at confirm. |
| Traversal | Not reachable: the only client-supplied component is `file_name`, and only its extension is used. |
| Presigned TTL | Upload 600 s, view 300 s, both under the provider's caps (3600/900). |
| Cross-tenant read | A presigned URL is only ever generated for a key that starts with the caller's own `org/{orgId}/`. |

### 16.5 Preview rate limiting

There is no rate-limiting middleware anywhere in `src/`, and adding one is out of scope. Redis is
already a **hard boot dependency** (`initRedis()` calls `process.exit(1)` on failure), so the
counter uses it directly:

```
key:  pdf:preview:{orgId}:{yyyymmddHH}
INCR, then EXPIRE 3900 on first increment (>3600 so the window never expires mid-hour)
limit: document_settings.letter_preview_rate_per_hour
```

Per **org**, not per user, because the cost being protected is the renderer's concurrency, which
is org-independent. Fail-**closed** on a Redis error would make previews unavailable whenever
Redis hiccups; fail-**open** would remove the control. The choice: **fail open, log at WARN**,
because the downstream renderer has its own concurrency ceiling and the blast radius of an open
counter is bounded cost, while the blast radius of a closed one is a broken HR screen. Recorded
as a deliberate trade-off, not an omission.

### 16.6 Renderer-side security obligations

| Risk | Control |
|---|---|
| **XSS into Chromium** | No triple-stash (lint rule 1), no `<script>`/`on*` (rule 3), all text double-stash-escaped by Handlebars. |
| **SSRF from the renderer** | No external URLs in any template (rule 2); assets are data URIs or presigned URLs on our own bucket. The service's `isBlockedUrl` uses `hostname.startsWith()`, so a bucket literally named `10...`/`192.168...` would be blocked — **EC-P1-1**, mitigated by a boot-time assertion that the configured bucket name does not begin with a private-IP-looking prefix. |
| **Secret leakage via errors** | The provider never puts the renderer URL or an API key in an `AppError` message, because `error.middleware.js` logs `err.message` for 5xx **and echoes `response.stack` when `NODE_ENV !== 'production'`**. A unit test asserts the thrown error's serialised form contains neither the host nor any env value. |
| **Unauthenticated renderer** | Accepted for Phase 1 **only because no real employee data is sent** (§1.4 (2)). Recorded as a release blocker for Phase 2 in §1.3 (2) and the readiness checklist. |
| **PII in logs** | The view-model is never logged. Audit `new_values` carries `{template_code, template_version, artifact_id}` and nothing else. `SCRUBBED_KEYS` already covers `storage_key`. |
| **PDF contents in logs** | The buffer is never stringified. Only `size_bytes`, `content_hash` and `render_ms` are logged. |
| **Temporary files** | **Not Applicable** — nothing is written to local disk. Buffers live in memory for the duration of the request and are released with it. Stated explicitly because the prompt asks about temp-file cleanup and the honest answer is that the design avoids the problem rather than manages it. |

---

## 17. Transactions & Concurrency

### 17.1 The rule

**No network I/O inside a transaction.** A renderer call is up to 15 s and an S3 call up to 3 s;
holding a Postgres transaction open across either pins a connection and a snapshot for the
duration and will exhaust the pool under load. Therefore:

```
[txn 1] insert artifact 'pending'                  commit
        renderPdf(...)            <- no txn open, 15 s
        getObject / putObject     <- no txn open
[txn 2] update artifact 'ready' + audit            commit
```

Two short transactions, an unprotected window between them, and a state machine that can explain
any point in that window. §19 enumerates what happens if the process dies inside it.

### 17.2 Transaction inventory

| Operation | Boundary | Lock |
|---|---|---|
| `#130` getOrCreate | one txn | none; `UNIQUE (org_id)` resolves the race |
| `#131` replace | one txn | `SELECT ... FOR UPDATE` on the branding row |
| `#132` presign | one txn | `pg_advisory_xact_lock(hashtext('letter-branding:'+orgId))`, taken **before** the row lock |
| `#133` confirm | head **outside**, one txn for the commit | advisory lock, same key, same order |
| `#137` upsert config | one txn | unique index + `FOR UPDATE` on retry |
| render | two txns (§17.1) | none — the unique index is the only serialisation point |

**Lock ordering is fixed: advisory lock → row lock, always.** Two code paths taking them in
opposite orders deadlock; one order, written down, prevents it. This mirrors the ordering already
used in `document_template.service.js`.

All transactions are unmanaged (`sequelize.transaction()` with explicit commit), and every
`catch` ends with `if (!t.finished) await t.rollback();` — the codebase's existing idiom, which
avoids the double-rollback throw that masks the original error.

### 17.3 Concurrency scenarios

| Scenario | Outcome |
|---|---|
| Two HRs click preview simultaneously, same config | Both insert; one wins `UNIQUE (org_id, idempotency_key)`, the loser catches the unique violation, re-reads the winner's row, and waits on nothing — it renders its own bytes and returns them, reusing the row. Two renders, one row. Acceptable: previews are cheap and stored nowhere. |
| Two PUTs to branding | Serialised by `FOR UPDATE`. Last writer wins, both audited with distinct `old_values`. |
| Preview races a branding PUT | The preview reads branding **outside** the write transaction, so it sees either the before or after state — never a torn mix, because a single row read is atomic. |
| Two confirms of the same token | The second replays idempotently on `confirmed_at`. |
| Two presigns for the same asset type | Both succeed with different random keys; whichever is confirmed last wins. No corruption, one orphan object. |
| Renderer saturated | Requests queue at the Lambda; our 15 s timeout is the ceiling. The per-org rate counter is what keeps one tenant from consuming the concurrency. |

---

## 18. Idempotency & Retry

### 18.1 Idempotency key

`idempotency_key = sha256(orgId + ':' + templateCode + ':' + templateVersion + ':' + inputHash)`,
truncated to 64 chars, stored in a `STRING(120)` column with `UNIQUE (org_id, idempotency_key)`.

It is **content-derived, not client-supplied**, in Phase 1. A client-supplied key is the right
design for `#139` (issue a letter), where the caller needs to retry a state-changing operation
safely — and the parent plan specifies exactly that for Phase 2. For a preview, a content-derived
key gives the property that matters (identical input ⇒ one row) with no client cooperation.

Because `inputHash` covers the resolved branding and the pinned date, changing the logo or
crossing midnight produces a different key — which is correct: it *is* a different document.

### 18.2 Retry behaviour

| Actor | Behaviour |
|---|---|
| **Provider → renderer** | At most **one** retry, and only for connect-class failures (DNS, ECONNREFUSED, ECONNRESET, 502/503/504 from the gateway) with a 500 ms delay. A timeout is **not** retried: the renderer may still be working, and a second 15 s attempt turns a 15 s failure into a 30 s one. A `400` is never retried — the template or data is wrong and will be wrong again. |
| **Client → API** | Safe: a repeated preview with identical input reuses the row. A repeated `#131`/`#137` is a full replace. A repeated `#133` replays. A repeated `#132` mints a new key (harmless). |
| **Service after partial completion** | §19 case D — a `pending` row older than 10 minutes is stale. Phase 1 has **no sweeper** (that is P2's, and the partial index `pdf_render_artifacts_pending_idx` is created now so the sweeper needs no migration). A stale `pending` preview row is inert: it references no object, blocks nothing, and the next identical preview reuses it. Stated rather than solved, because solving it would mean shipping a cron with one job. |

### 18.3 What is *not* idempotent, deliberately

`#132` (presign). Each call mints a fresh random key. Making it idempotent would require a claim
cache keyed by filename, which invites the exact confusion where two different uploads share a
key. A fresh key per call is cheaper and safer.

---

## 19. Failure Handling

### 19.1 The four partial-failure cases the prompt names

| Case | Phase 1 reality | Handling |
|---|---|---|
| **A. PDF generated, storage fails** | **Cannot occur in Phase 1** — nothing is stored (`persist:false`). The code path exists and is unit-tested for P2: `putObject` throws → the row is marked `failed` with `failure_code='STORAGE_WRITE_FAILED'` → `502`. The bytes are discarded; a re-request re-renders. Never a `ready` row pointing at an object that is not there. |
| **B. Storage succeeds, DB update fails** | The dangerous one, and the one P2 will actually face. The object exists at a **deterministic** key; the row is stuck `pending`. Handling: the object is *not* deleted (a delete that races a retry destroys a good object), the row stays `pending`, and the retry re-derives the same key and overwrites it with byte-identical content. Idempotent by construction. In Phase 1 the same shape applies with no object: the row stays `pending`, the HTTP response is `500`, and the next identical request reuses the row. |
| **C. DB succeeds, file operation fails** | The only file operations in Phase 1 are **reads** of branding assets, and they happen in stage 5, before any write. A failed asset read degrades to "no logo" (§10.3) rather than failing the render. `StorageUnavailableError` during stage 5 with `letterhead_enabled = true` and a logo configured → `502 STORAGE_UNAVAILABLE`, nothing written. |
| **D. Retry after partial completion** | The idempotency probe (step 2) is the recovery mechanism. A `pending` row is re-driven, not duplicated. A `ready` row with a matching hash short-circuits. A `ready` row with a mismatched hash is a `409` rather than a silent overwrite. |

### 19.2 Failure matrix

| Failure | Detected | Artifact state | HTTP | Logged | Recovery |
|---|---|---|---|---|---|
| Renderer DNS/connect | provider | `failed` / `RENDERER_UNREACHABLE` | `502 PDF_RENDERER_UNAVAILABLE` | `ERROR`, host **not** included | retry after one attempt; then user retries |
| Renderer 15 s timeout | `AbortSignal.timeout` | `failed` / `RENDERER_TIMEOUT` | `504 PDF_RENDER_TIMEOUT` | `ERROR` with `render_ms` | user retries; not auto-retried (§18.2) |
| Renderer `400` (bad template/data) | provider | `failed` / `TEMPLATE_INVALID` | `500 PDF_TEMPLATE_INVALID` | `ERROR` with `template_code`, **not** `data` | a bug — the lint should have caught it; fix and redeploy |
| Renderer `500` | provider | `failed` / `RENDERER_ERROR` | `502 PDF_RENDERER_UNAVAILABLE` | `ERROR` | retry |
| Response not a PDF | step 6 magic-byte check | `failed` / `RENDERER_INVALID_RESPONSE` | `502` | `ERROR` with first 16 bytes hex-encoded | investigate the gateway's `binaryMediaTypes` |
| Response > 6 MB | step 6 | `failed` / `RENDER_TOO_LARGE` | `502` | `ERROR` with `size_bytes` | reduce content / P3 async path |
| Required field empty | builder | **no row** — thrown before step 3 | `422 PDF_DATA_INCOMPLETE` with the field names | `WARN` | HR fills the field |
| Asset object missing | `headObject` → null | n/a | render proceeds **without** the asset | `WARN` | HR re-uploads |
| S3 unavailable at stage 5 | `StorageUnavailableError` | no row | `502 STORAGE_UNAVAILABLE` | `ERROR` | retry |
| Redis unavailable | counter | n/a | proceeds (fail-open) | `WARN` | — |
| DB down | Sequelize | n/a | `500` | `ERROR` | — |
| Unique violation on insert | step 3 | reuse existing | `200` | `DEBUG` | — |
| Idempotency-key collision, different input | step 2 | untouched | `409 PDF_IDEMPOTENCY_CONFLICT` | `WARN` | investigate — should be unreachable given the key derivation |
| Process dies mid-render | — | stuck `pending` | connection reset | — | inert; next identical request reuses the row (§18.2) |

### 19.3 Timeouts, in one place

| Hop | Timeout | Source |
|---|---|---|
| API → renderer | **15 000 ms** | `PDF_RENDERER_TIMEOUT_MS`, via `AbortSignal.timeout()` |
| Renderer internal (Puppeteer) | 10 000 ms | the service's own `PDF_TIMEOUT` — **ours must be larger**, or we abandon a render that is about to succeed |
| S3 HeadObject | 3 000 ms | existing provider constant |
| S3 delete | 3 000 ms | existing |
| Worst-case `#138` | ~31 s (15 + 0.5 + 15, plus overhead) | one retry |

The 15 000 > 10 000 relationship is asserted at boot: if someone configures
`PDF_RENDERER_TIMEOUT_MS` below the renderer's own budget, every slow render becomes a spurious
`504` on our side while the Lambda quietly succeeds. Boot-time assertion, not a comment.

### 19.4 Memory

One buffer per in-flight render. A 6 MB ceiling × the org rate limit is the bound. No streaming
is introduced because there is nothing to stream to: the response body *is* the buffer. P3's
batch path is where streaming matters, and it is where it will be built.

---

## 20. Background Jobs

**Not Applicable to Phase 1.** No cron, no worker, no queue, no scheduled sweep.

This is a deliberate reading of the prompt's "do not introduce queues, locks, caching, or other
infrastructure unless the requirements justify them". The candidates were considered and each
rejected with a reason:

| Candidate | Why not in Phase 1 |
|---|---|
| Render queue (`pdf_render_jobs`) | One document per request, one user waiting. **Phase 3**, when payslip batches arrive. |
| Stale-`pending` sweeper | A stale preview row references no object and blocks nothing. The partial index it will need is created now so it costs no migration later. **Phase 2.** |
| Cache purger for `retention_class='cache'` | Phase 1 stores no object, so there is nothing to purge. **Phase 5** (**D-23**). |
| Asset orphan reclamation | ~100 KB per branding change. Not worth a cron. **Phase 5.** |

The one piece of infrastructure Phase 1 *does* use — Redis for the preview counter — is justified
because it is already a hard boot dependency and the alternative was a new middleware and a new
dependency.

---

## 21. Audit & Logging

### 21.1 Audit events

Written through the existing `document_audit.service.record(...)`, **always inside the caller's
transaction** (the service throws without one), and always with `ipAddress` and `requestId`.

| Action | Entity | `new_values` | Notes |
|---|---|---|---|
| `letter_branding.initialized` | `letter_branding` | `{}` | only on genuine first creation |
| `letter_branding.updated` | `letter_branding` | changed fields only | `old_values` carries the previous |
| `letter_branding.asset_upload_requested` | `letter_branding` | `{asset_type}` | key scrubbed |
| `letter_branding.asset_confirmed` | `letter_branding` | `{asset_type, size_bytes, content_type}` | `storage_key` scrubbed by `SCRUBBED_KEYS` |
| `letter_template.config_updated` | `letter_template_config` | `{template_code, is_enabled, pinned_version, saved_field_keys}` | **keys, not values** — saved fields can carry an HR contact line |
| `pdf.preview_rendered` | `pdf_artifact` | `{template_code, template_version, artifact_id, size_bytes}` | **never** the view-model |
| `pdf.render_failed` | `pdf_artifact` | `{template_code, failure_code}` | written in the failure transaction |

`SCRUBBED_KEYS` already contains `storage_key`. Adding `logo_storage_key` and
`signature_storage_key` to that set is one of the five shared-file edits listed in §4.1 — one
line, individually reversible.

### 21.2 Logging

| Level | What |
|---|---|
| `INFO` | render started/completed with `{orgId, templateCode, version, artifactId, renderMs, sizeBytes}` |
| `WARN` | asset missing, Redis counter unavailable, rate limit hit, renderer retry attempted |
| `ERROR` | every `failed` artifact transition, with `failure_code` and the truncated reason |
| `DEBUG` | idempotency reuse |

**Never logged, at any level:** the view-model, `input_snapshot`, the PDF buffer or any slice of
it, a storage key, a presigned URL, the renderer base URL, any env value. The prompt asks for
"logging without exposing sensitive PDF contents"; the mechanism is that the buffer is referenced
only by `sizeBytes` and `contentHash` anywhere outside the response write, and a unit test greps
the provider's and service's error paths for the configured host string.

---

## 22. Org Settings

Two new entries, continuing the registry from #81.

| # | Setting | Table.column | Type | Default | Read by |
|---|---|---|---|---|---|
| **82** | Letterhead branding enabled | `document_settings.letter_branding_enabled` | BOOLEAN | `true` | the branding builder — when `false`, letterhead/logo/signature blocks are suppressed |
| **83** | Preview renders per hour, per org | `document_settings.letter_preview_rate_per_hour` | INTEGER | `60` | §16.5 |

`public/md_updates/org_settings_registry.md` must be extended with both, per the standing rule
that the registry is updated whenever a feature adds an org-configurable decision.

Deliberately **not** made settings in Phase 1: the renderer URL and timeout (deployment
configuration, not an org decision — env vars, §5.2), the 64 KB data-URI threshold (a module
constant; one number to reason about beats 200 tenant-specific ones), and the accent colour
(already a branding column, not a setting).

---
## 23. Testing Requirements

All tests run under `node --test`, **DB-free**, with Sequelize and the S3/renderer providers
stubbed — the same discipline as the 158 existing test files. Nothing in this phase requires a
live database, a live S3 bucket or a live Lambda to be verified, and that is a design property,
not a limitation: every boundary is a function we own.

New directory: `tests/unit/pdf/`. Target **≥110 new assertions across 12 files**, and the whole
suite green before hand-back.

### 23.1 Unit

| File | Covers |
|---|---|
| `pdf_format.test.js` | `formatMoney` (negative, zero, > 1 crore, 2-dp rounding), `formatDocumentDate`, `formatDateRange`, `titleCaseName`, `maskIdentifier`, `EMPTY` for null/undefined/empty-string. Two fixtures re-run under `TZ=Pacific/Kiritimati` and `TZ=Pacific/Midway` asserting identical output — the ICU/timezone-independence property. |
| `builders.test.js` | Determinism (same input twice ⇒ `deepStrictEqual` + identical canonical JSON); required-field assertion throws `422 PDF_DATA_INCOMPLETE` naming the fields; optional fields become `EMPTY` or are omitted per the registry; `letter_branding_enabled=false` suppresses all three blocks; **no `new Date()`** (asserted by a source-text grep of the builder files). |
| `pdf_hash.test.js` | Canonical JSON is key-order-independent; unicode-stable; a one-character change flips the hash; `sha256` of a known buffer matches a fixed vector. |
| `template_lint.test.js` | The ten rules of §9.4, each with a **deliberately failing fixture** as well as the real templates — a lint that has never failed is not known to work. |
| `renderer_provider.test.js` | Binary response, base64 response, base64-of-HTML-error (rejected by magic bytes), truncated PDF (no `%%EOF`), `400` not retried, connect-failure retried exactly once, timeout **not** retried, `PDF_RENDERER_BASE_URL` unset ⇒ `503 PDF_RENDERER_NOT_CONFIGURED`, **and** the secret-hygiene assertion: the serialised error contains neither the host nor any env value. |
| `pdf_render_service.test.js` | Row inserted `pending` **before** the render call (asserted by stub call ordering); `pending → ready` with hash and size; `pending → failed` on each failure class; the failure mark does not swallow the original error; idempotency reuse; `409` on hash mismatch; unique-violation → re-read path. |
| `branding_service.test.js` | `getOrCreate` idempotence; full-replace does not clear asset columns; confirm verifies from the head and not the claim; multipart ETag ⇒ checksum `null`; double-confirm replays; the old object is not deleted. |
| `letter_template_service.test.js` | Registry↔config join; `is_orphaned`; `saved_fields` schema validation on write; unknown key rejected (not stripped); `pinned_version` must exist; merge order `sample ← saved ← override`. |
| `migration_00055.test.js` | Asserts against the migration's **source text** (never execution), copying `migration_00054.test.js`: every table, column, type, default, index name, CHECK name and enum appears; `down()` reverses each in inverse order and drops all four enum types `CASCADE`. |
| `storage_provider_p1.test.js` | `putObject`/`getObject` happy paths, `StorageUnavailableError` mapping, the bucket-config fallback chain, the boot assertion that the bucket name is not private-IP-shaped (**EC-P1-1**). |

### 23.2 Integration (in-process, stubbed edges)

`pdf_pipeline.integration.test.js` — the full `#138` path with a stubbed renderer returning a
real fixture PDF: route → middleware → controller → service → builder → provider → repository,
asserting the artifact row's final state, the audit row's contents, the response headers and the
body's first and last bytes. Plus: renderer failure ⇒ `failed` row + `502`; asset missing ⇒
`200` with a degraded warning logged; rate limit exceeded ⇒ `429` with **no** artifact row.

A **golden-fixture** test renders all three templates against their `sample_data` through the
real Handlebars assembly (not the Lambda) and diffs the produced HTML against checked-in
goldens. This catches template regressions without a browser; the PDF bytes themselves are not
golden-compared, because Chromium's output is not byte-stable across versions and a test that
fails on a Chromium patch release is a test that gets disabled.

### 23.3 API-level

`letter_api.test.js` — route resolution first: `/hr/letter-branding` and `/hr/letter-templates` resolve to their own literal handlers and are not swallowed by any existing parameterised `/hr/:x` route (§4.3). Then, for each of the nine endpoints: success shape; `400` on each validation
rule; `401` without a token; `403` for `employee`, `manager`, `admin`, `super-admin`; `404` for
an unknown `:code`; `409` where defined; duplicate request behaviour (`#133` replay, `#137`
replace, `#138` reuse); and that **no** response body anywhere contains `storage_key`,
`input_snapshot`, a `data:` URI or an `s3.amazonaws.com` URL — a single assertion run over every
captured response in the file.

### 23.4 Security

`letter_security.test.js`:

| Test | Asserts |
|---|---|
| Cross-tenant | Org A's token cannot read, write or preview anything belonging to Org B. Since no endpoint accepts a resource id, this is proven by asserting every repository call made during a request carries the token's `org_id` (spy on the repository layer). **EC-46.** |
| No-resource-id invariant | No Phase 1 route pattern contains an id-shaped parameter other than `:code`; `:code` is never used as a primary-key lookup. Fails loudly if a future change adds one (§16.3). |
| Role bypass | Every role other than `hr` is rejected on all nine routes, and `requireFeature('documents.access')` is present on all nine (asserted from the router's middleware stack, not by calling). |
| Hostile input | `<script>alert(1)</script>`, `</style><style>`, `"><img onerror=`, `../../etc/passwd`, a 10 000-char string, a NUL byte and an RTL-override character are fed into **every** writable text field; each is either rejected with `400` or appears HTML-escaped in the assembled template. **EC-6.** |
| CSS injection | `accent_color_hex` values `red;}` , `#fff;background:url(http://x)`, `javascript:` — all `400`. **EC-7.** |
| SVG upload | `image/svg+xml` rejected at `#132`. **EC-8.** |
| Traversal | `file_name` of `../../../x.png` produces a key still under `org/{orgId}/branding/`. |
| Secret hygiene | Renderer host, API key and bucket name appear in no error body, no log line and no audit row (grep over captured output). |

---

## 24. Implementation Sequence

Twelve steps. Each states what, why, what it depends on, what it touches, and how it is verified.
Steps 1–3 are independently shippable and touch no existing behaviour.

| # | Step | Why it is here | Depends on | Files | Verified by |
|---|---|---|---|---|---|
| **0** | **Operator pre-flight** (§2): confirm the renderer URL, decide `APP_S3_BUCKET` vs the current `PAYROLL_S3_BUCKET`-only read, confirm KMS behaviour (**OD-P1-1**), answer **OD-1**/**OD-2**. | Steps 3 and 6 encode answers to these. Guessing here means rework, not a bug. | — | env, infra | Written answers in §30 |
| **1** | Promote `pdf_format.utils.js` to `src/common/utilities/` (§7). | Every builder needs it; doing it first means no builder is written against the payroll copy. | — | 1 new file; payroll's copy re-exports from it so no payroll behaviour changes | `pdf_format.test.js`; full payroll suite still green |
| **2** | `putObject` / `getObject` on the S3 provider + the bucket-config fallback (§6). | The asset pipeline needs `getObject`; P2 needs `putObject`. Isolated so a regression here is visible before anything depends on it. | — | `aws-s3.provider.js`, `aws-s3.config.js` | `storage_provider_p1.test.js`; grep-verified blast radius |
| **3** | Renderer provider (§5). | The one true boundary to the Lambda. Written and fully tested against stubs **before** anything calls it. | Step 0 (URL) | `src/infrastructure/pdf-renderer/` | `renderer_provider.test.js` |
| **4** | Migration `00055` + three models (§8). | Everything below persists. | — | 1 migration, 3 models | `migration_00055.test.js`; models load without a duplicate-name throw |
| **5** | Repositories, incl. `SAFE_ATTRIBUTES` (§11.3). | The storage-key containment boundary exists before any caller. | Step 4 | 3 repositories | unit tests + the "no storage_key in a safe read" assertion |
| **6** | **Template lint** (§9.4) with failing fixtures — **before any template exists**. | A rule written after the templates is a rule the templates were allowed to violate. | Step 0 (**OD-2**) | `tests/unit/pdf/template_lint.test.js` | its own failing fixtures |
| **7** | Registry, partials, loader, three templates (§9). | | Step 6 | `letter-templates/`, `template_loader.utils.js` | the lint passes on real templates; golden HTML fixtures |
| **8** | Builders (§10). | | Steps 1, 7 | `builders/` | `builders.test.js` incl. the two-timezone fixtures |
| **9** | `pdf_render.service.js` + artifact repository wiring (§12.1). | The pipeline, assembled from parts that are all already tested. | 3, 5, 8 | `src/common/services/`, `src/common/repositories/` | `pdf_render_service.test.js` |
| **10** | Branding service, controller, routes `#130`–`#134`; `SCRUBBED_KEYS` edit. | The first user-visible slice; `#134` proves the whole pipeline end to end. | 2, 9 | services/controllers/routes + 1 shared-file line | `branding_service.test.js`, API tests for 5 endpoints |
| **11** | Template service, controller, routes `#135`–`#138`. | | 10 | services/controllers/routes | `letter_template_service.test.js`, API tests for 4 endpoints |
| **12** | Docs & registries: `md_updates` change record (§14.1), `api_registry` #130–#138, `org_settings_registry` #82–#83, migration hand-back note (§25). | The project convention; and the hand-back is what makes the migration runnable by the operator. | 11 | `public/md_updates/` | manual review; the counters line up |

**Not in this sequence, deliberately:** seeder `010` for the new document types (Phase 2 — no
Phase 1 endpoint resolves a `document_type_code`), `pdf_render_jobs` (Phase 3), and any payroll
template (Phase 3).

---

## 25. Deployment & Migration Hand-Back

### 25.1 Environment

| Variable | Required | Default | Notes |
|---|---|:--:|---|
| `PDF_RENDERER_BASE_URL` | for rendering | none | Absent ⇒ `#134`/`#138` return `503 PDF_RENDERER_NOT_CONFIGURED`. The other seven endpoints and **all** existing payroll `pdfkit` paths are unaffected (**EC-4**). |
| `PDF_RENDERER_TIMEOUT_MS` | no | `15000` | Boot-asserted `> 10000`, the renderer's own budget (§19.3). |
| `PDF_RENDERER_API_KEY` | no | none | Sent as a header when set. Unused today (the Lambda is open); wiring it now means Phase 2's hardening is a config change, not a code change. |
| `APP_S3_BUCKET` | see **OD-P1-1** | falls back to `PAYROLL_S3_BUCKET` | Step 2 implements the fallback the warning string already advertises. |

Deploying with none of these set is safe: the module's seven non-rendering endpoints work, the
two rendering ones return a clear `503`, and nothing existing changes.

### 25.2 Migration hand-back

Per the standing operator constraint, **the implementer does not run `00055`, and runs no
connectivity check against the remote database.** Verification is static (source-text assertions
in `migration_00055.test.js`) plus the DB-free unit suite.

Hand-back note must state:

1. `00055-create-pdf-generation.js` is **additive**: three new tables and two new
   `document_settings` columns, both `NOT NULL` with defaults that preserve current behaviour.
   No existing column is altered or dropped. Safe to run while the application is serving.
2. **`down()` is destructive**: it drops `pdf_render_artifacts`, which is the record of every PDF
   the system produced. Same warning class as `00051`.
3. The two new `document_settings` columns backfill by default on every existing row; on a large
   `document_settings` table (one row per org) this is trivially fast.
4. Deploy order: **migration first, then code.** The new columns have defaults, so old code
   tolerates them; new code cannot tolerate their absence.
5. Rollback: revert the code. Do **not** run `down()` unless the tables are known to be empty.

### 25.3 Post-deploy verification (operator)

`GET #130` returns a branding row; `PUT #131` with an accent colour persists; `POST #132` returns
a presigned URL; after an upload, `POST #133` returns `200`; `POST #134` returns a PDF whose
first bytes are `%PDF-`; `GET #135` lists three templates; `POST #138` on `bonafide_letter`
returns a watermarked PDF. Seven calls, in that order, exercise every layer.

---

## 26. Traceability

`Requirement → Dependency → Database → API → Business Logic → Validation → Authorization →
PDF/Storage → Failure → Testing → Acceptance`, for the five things Phase 1 actually delivers.

| | **R1 Org letterhead identity** | **R2 Branding assets** | **R3 Template catalog & per-org config** | **R4 Render pipeline** | **R5 Preview** |
|---|---|---|---|---|---|
| **Dependency** | `organization_profiles`, `document_audit` | S3 provider, advisory-lock pattern | registry (repo asset) | renderer provider, builders, `pdf_format` | R1–R4, Redis |
| **Database** | `document_letter_branding` | 6 asset columns on the same row | `document_letter_configs` | `pdf_render_artifacts` | settings columns #82/#83 |
| **API** | #130, #131 | #132, #133 | #135, #136, #137 | (none — internal) | #134, #138 |
| **Business logic** | merge profile ← branding | head-verified confirm; no delete of the old object | registry↔config join; write-time schema validation | insert-pending → render → commit-ready | merge sample ← saved ← override; watermark |
| **Validation** | hex colour, https URL, ≤5 address lines, no angle brackets | raster-only, size caps, head-vs-claim | `saved_fields` vs schema, `unknown(false)`, version exists | magic bytes, `%%EOF`, ≤6 MB | body `{}` / subset keys; **`subject_user_id` rejected** |
| **Authorization** | `hr`; org from token | `hr`; key prefixed `org/{orgId}/` | `hr`; `(org_id, :code)` | n/a (internal) | `hr`; rate-limited per org |
| **PDF / Storage** | N/A | S3 write by the client, read by us | N/A | no object in P1 (`persist:false`) | reads assets; writes none |
| **Failure** | row lock; last-write-wins | `409 UPLOAD_NOT_FOUND`; degraded render on a missing object | `404`/`400` | §19.2 matrix in full | `429`; `502`/`504`; `422` |
| **Testing** | `branding_service.test.js`, API, hostile-input | same + SVG/traversal | `letter_template_service.test.js` | `pdf_render_service.test.js`, `renderer_provider.test.js` | `pdf_pipeline.integration.test.js` |
| **Acceptance** | A1 | A2 | A3 | A4 | A5 (§29) |

---

## 27. Edge Cases

### 27.1 Parent-plan Phase 1 cases, discharged

| # | Where it is handled |
|---|---|
| EC-1 | §12.1 step 6 magic-byte + `%%EOF` check; `renderer_provider.test.js` feeds a base64-encoded HTML error body |
| EC-2 | Timeouts are **not** retried (§18.2), so the double-render this describes cannot arise from our retry; the content-derived key makes a *user* retry harmless |
| EC-3 | §19.2 row 3; never retried; `data` never logged |
| EC-4 | §25.1; `503 PDF_RENDERER_NOT_CONFIGURED`, payroll untouched |
| EC-5 | Lint rule 5 (declared-vs-used, **both** directions) + BR-6 runtime assertion |
| EC-6 | Lint rules 1 & 3 + the hostile-input security test |
| EC-7 | Joi regex + the `document_letter_branding_accent_chk` CHECK |
| EC-8 | `#132` allow-list; `image/svg+xml` rejected |
| EC-9 | Size caps at `#132` (512 KB logo / 256 KB signature) and the >64 KB presign rule. **Dimension caps are not implemented** — we do not decode the image, and adding an image decoder is a new dependency. A 500×500 PNG under 512 KB that looks wrong on the page is visible in the `#134` preview, which is exactly what that endpoint is for. Stated rather than silently dropped. |
| EC-10 | 300 s asset TTL against a ~15 s budget; a failed asset fetch degrades to no-logo |
| EC-11 | Same degradation path; the preview is how an org discovers it before P2 issuance |
| EC-12 | Lint rule 4 at 256 KB on the **assembled** template |
| EC-13 | `FOR UPDATE` on the singleton row; both writes audited |
| EC-46 | `org_id` in every predicate and in the idempotency key; proven by the repository-spy cross-tenant test |

### 27.2 New cases found while reconstructing scope

| # | Case | Resolution |
|---|---|---|
| **EC-P1-1** | The renderer's `isBlockedUrl` uses `hostname.startsWith(pattern)`. A bucket named `10-assets` or `192.168-media` yields a virtual-hosted URL whose hostname starts with a blocked pattern ⇒ every presigned asset silently fails to load. | Boot-time assertion that the configured bucket name does not start with a private-IP-shaped prefix; tested in `storage_provider_p1.test.js`. |
| **EC-P1-2** | The renderer's `PDF_DEFAULTS.margin` has **no `top`** key, and our config is spread over it. A registry entry omitting `margin.top` silently inherits nothing while the other three inherit 10 mm. | Lint rule 9: all four sides must be declared. |
| **EC-P1-3** | `{{> partial}}` compiles to an empty string because the Lambda registers no partials. | Build-time inlining (§9.2) + lint rule 6. |
| **EC-P1-4** | An unregistered Handlebars helper is a **compile error** in the Lambda, surfacing as a `400` ⇒ a `500` in production. | Lint rule 7 restricts templates to `eq/ne/lt/gt` and the built-in block helpers. |
| **EC-P1-5** | A preview object written to S3 could never be expired by a bucket lifecycle rule, because every key begins `org/{orgId}/` and lifecycle prefixes are literal. | Phase 1 stores no preview object at all (§1.4 (3)); the artifact row carries `storage_key = NULL`. |
| **EC-P1-6** | Our client timeout configured below the renderer's internal 10 s budget would turn every slow-but-successful render into a spurious `504`. | Boot assertion `PDF_RENDERER_TIMEOUT_MS > 10000` (§19.3). |
| **EC-P1-7** | `aws-s3.config.js` exports `kmsKeyId` that nothing reads; `putObject` would be its first consumer, so a server-side write could be encrypted differently from a client presigned PUT. | **OD-P1-1** — answered at Step 0, before `putObject` ships. |

---

## 28. Production-Readiness Checklist

| | Item | Status at hand-back |
|---|---|---|
| ☐ | Migration `00055` authored, statically tested, **not run** | implementer |
| ☐ | Migration hand-back note written (§25.2), incl. the destructive `down()` warning | implementer |
| ☐ | Full test suite green, including all 158 pre-existing files | implementer |
| ☐ | No new npm dependency (`package.json` diff is empty) | implementer |
| ☐ | Template lint passes; every rule has a failing fixture proving it works | implementer |
| ☐ | Secret-hygiene test green: renderer host, API key and bucket appear in no error, log or audit | implementer |
| ☐ | Cross-tenant and no-resource-id invariant tests green | implementer |
| ☐ | `md_updates` change record written (§14.1) | implementer |
| ☐ | `api_registry` #130–#138 and `org_settings_registry` #82–#83 updated | implementer |
| ☐ | `PDF_RENDERER_BASE_URL` set in the target environment | **operator** |
| ☐ | Bucket-name assertion passes for the configured bucket (**EC-P1-1**) | operator |
| ☐ | **OD-1**, **OD-2**, **OD-P1-1** answered | operator |
| ☐ | Migration run, in the migration-then-code order | operator |
| ☐ | Post-deploy seven-call verification (§25.3) performed | operator |
| ⚠ | **Renderer authentication** — the Lambda is open to the internet. Phase 1 ships against it **only** because no real employee data is sent (§1.4 (2)). This is a **Phase 2 release blocker**, not a Phase 1 one, and it must be recorded as such rather than forgotten. | operator, before P2 |

---

## 29. Acceptance Criteria

Phase 1 is complete when all of the following are demonstrably true.

**A1 — Branding.** An HR user can load, fully replace and re-load their org's letterhead
identity. Unset fields visibly inherit from `organization_profiles`. An invalid accent colour,
a non-https website, a sixth address line and an angle bracket in any text field are each
rejected with `400`. No response, log or audit row contains a storage key.

**A2 — Assets.** An HR user can upload a PNG logo and a PNG signature through presign → PUT →
confirm. An SVG is rejected. An oversized file is rejected. Confirming without having uploaded
returns `409`. Confirming twice returns `200` twice with identical state. The previous object is
retained and the replacement is audited.

**A3 — Templates.** Three templates are listed with this org's enablement state. Opening one
returns a form descriptor derived from its schema plus the org's saved values. Saving a config
with an unknown field key is rejected with `400`, not silently stripped. An unknown `:code`
returns `404` with a body identical to a code that exists but belongs to no org.

**A4 — Render pipeline.** Every render attempt leaves exactly one `pdf_render_artifacts` row,
written **before** the renderer is called, ending `ready` (with `content_hash` and `size_bytes`)
or `failed` (with a `failure_code`). A non-PDF response, a truncated PDF, a timeout, a `400` and
a connect failure each produce the documented status code and the documented `failure_code`. The
renderer host and API key appear in no error, log or audit row.

**A5 — Preview.** `#134` and `#138` return a valid, watermarked A4 PDF beginning `%PDF-` and
ending `%%EOF`, with the org's logo, signature, accent colour and footer identifiers rendered.
`#138` rejects `subject_user_id`. Both are rate-limited per org and return `429` past the limit.
Neither writes an S3 object.

**A6 — Isolation.** No Phase 1 endpoint accepts an org-scoped resource id. Every repository call
in every request carries the token's `org_id`. The no-resource-id invariant test fails if that
ever changes.

**A7 — No regressions.** The full pre-existing suite is green; `package.json` is unchanged; every
existing payroll `pdfkit` path behaves exactly as before, including with
`PDF_RENDERER_BASE_URL` unset.

**A8 — Hand-back.** The migration is authored, statically verified and unrun; the hand-back note,
the `md_updates` record and both registry updates exist.

---

## 30. Open Decisions

Each must be answered **before the step that encodes it**. None blocks starting.

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| **OD-1** | The deployed renderer URL, and whether API Gateway sets `binaryMediaTypes` for `application/pdf`. | Step 3 | Do **not** wait for the answer — the provider detects binary vs base64 by magic bytes and works either way. The answer only tells us which branch is live, which matters for the log line, not the code. |
| **OD-2** | Should the renderer return a page count? It is one `(await page.pdf(), pdf.numPages)`-shaped change on their side. | Step 6 (registry shape) | Ship without it. `page_count` stays NULL rather than being guessed. Revisit in P3, where a payslip's page count matters for ZIP sizing. |
| **OD-P1-1** | Should `putObject` apply `kmsKeyId`? Today it is exported and read by nothing, so presigned PUTs use the bucket default. A server-side write that sets it would encrypt differently from a client-side one. | Step 2 | Apply the bucket default in both paths — i.e. **do not** set it in `putObject` — unless the operator confirms the bucket has no default encryption. Consistency between the two write paths matters more than the key choice. |
| **OD-P1-2** | `APP_S3_BUCKET` fallback: implement the chain the warning already advertises, or change the warning to match the code? | Step 2 | Implement the chain. The warning is the documented intent, and a single-bucket deployment is unaffected. |
| **OD-P1-3** | Is `src/common/services/` the right home for `pdf_render.service.js`, given the repo has no precedent for a cross-module service? | Step 9 | Yes. The alternative — Payroll requiring out of `modules/document` in P3 — is a worse coupling, and the model stays under `modules/document/models/` only because `MODEL_ROOTS` scans module directories. Cheap to move later; the import surface is one file. |

---

*End of Phase 1 implementation plan.*
