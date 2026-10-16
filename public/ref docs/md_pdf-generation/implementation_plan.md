# PDF Generation Module — Implementation Plan

**STATUS:** **Not started.** This document is written before any code exists. Phases 1–5 all outstanding.

**DATE:** 2026-09-26

**SCOPE:** Every PDF this product emits. Two halves:
1. **Document letters** — org-issued letters generated from data (appointment, offer, confirmation, promotion, increment, experience, relieving, bonafide/employment-verification, warning, internship, NOC), landing in the Document module as `org_documents`.
2. **Payroll documents** — payslips, Form 16 Part B, annual salary statements and the PDF report family, currently rendered by PDFKit, migrated to the same HTML pipeline.

**SOURCES:** The renderer service at `C:\Users\91930\Desktop\Vs_Code\pdf-generation` (`src/handler.js`, `src/services/{template,pdf,browser}.service.js`, `src/utils/validator.js`, `src/config/constants.js`, `README.md`), read 2026-09-26. The sample letterhead template `public/pages/documents.html`. Live HRMS code — `src/modules/document/**`, `src/modules/payroll/utils/pdf/**`, `src/infrastructure/aws-s3/**`.

**PRECEDENTS:**
- `public/md_documents/implementation_plan.md` — structure, decision style, plane separation, edge-case register.
- `public/md_payrolls/implementation_plan.md` — phasing discipline, determinism and snapshot rules.
- `public/md_leave/implementation_plan.md` — edge-case register style.

---

## 0. How to use this document

This file is the **single source of truth** for the PDF Generation module's entire development lifecycle.

* **Do not** write per-phase detail here. When a phase starts, create `public/md_pdf-generation/phases/phase{N}_implementation_plan.md` (mirroring `public/md_documents/phases/`), plus `phase{N}_api_analysis.md` and `phase{N}_business_walkthrough.md`.
* **Amend this file** whenever a decision changes, so it is never stale relative to the code. Date every amendment.
* **In every phase**, four registries must be updated (existing project rules):
  1. `public/md_system/api_registry.md` — one row per new endpoint. Document-plane endpoints continue the Document Module numbering from **#130** (the file currently ends at #129); payroll-plane endpoints continue from **#219** (currently ends at #218).
  2. `public/md_settings/org_settings_registry.md` — every org-configurable knob, in a new `## PDF Generation` section, continuing that file's numbering.
  3. `public/md_documents/combined_api_analysis.md` — request/response contracts for the letter endpoints (they are Document-module endpoints).
  4. **`CLAUDE.md` rule:** any API request/response change that can affect the frontend gets a dated `.md` record in `public/md_updates/`.
* **Rule inherited from Leave, Payroll and Documents:** no phase begins until the previous one is tested and verified.

---

## 1. Scope & Requirements Traceability

### 1.1 What this module delivers

| # | Capability | Delivered in |
|---|---|---|
| 1 | A single, reusable HTML→PDF rendering transport used by every module | **P1** |
| 2 | A platform-owned, versioned library of letter/document templates | **P1** |
| 3 | An HR configuration surface: org branding (logo, signature, signatory, address, identifiers, accent colour, footer) | **P1** |
| 4 | Live **preview** of a branded document before anything is issued | **P1** |
| 5 | Per-letter saved field values (HR fills once, reused on every issue) | **P1** |
| 6 | Generating a letter for one employee and issuing it as an `org_document` visible in their "My HR Documents" | **P2** |
| 7 | Letter reference numbering (Ref. No. on the document, unique per org) | **P2** |
| 8 | Reissue / supersede of an issued letter, with the original preserved | **P2** |
| 9 | Payslip PDFs rendered from HTML, cached, and served identically to today | **P3** |
| 10 | Form 16 Part B and annual salary statement on the same pipeline | **P3** |
| 11 | Bulk payslip ZIP served from the cache, not from N live renders | **P3** |
| 12 | Bulk letter issuance (a batch for many employees) | **P4** |
| 13 | Auto-issue of relieving / experience letters from the offboarding flow | **P4** |
| 14 | Manager proposes a letter, HR approves and issues (maker–checker) | **P4** |
| 15 | Renderer authentication, observability, retention and purge of generated artifacts | **P5** |

### 1.2 Surfaces this module changes

| Surface | Today | After |
|---|---|---|
| `#173` single payslip PDF, `#174` bulk payslip ZIP, `#191` self payslip PDF | PDFKit, rendered per request | HTML pipeline, rendered once and cached (**P3**) |
| Form 16 Part B, annual statement, PDF reports | PDFKit | HTML pipeline (**P3**), report family last |
| `org_documents` | HR uploads a file through the presign handshake | HR may also **generate** one from a template (**P2**) |
| `document_type_catalog` | 51 types, no appointment/offer/promotion/increment/confirmation/bonafide/internship/NOC | +10 org-plane letter types (**P2**, seeder `010`) |

### 1.3 Explicitly out of scope (flag if requested later)

* **HR-authored HTML.** HR never writes, pastes, uploads or edits template HTML. See **D-2**; this is a security and supportability boundary, not a convenience choice.
* **A WYSIWYG template designer.** The configuration surface is a form plus a preview. A designer is a separate product-sized project.
* **Rich-text body blocks inside letters.** Answered explicitly for this plan: letters are field-fill only, from saved fields (**D-3**). No tenant-supplied HTML fragment ever reaches the renderer.
* **Digital signature certificates (PKI / DSC-signed PDFs).** The signature on a letter is a scanned image plus the module's existing acknowledgement/typed-signature evidence (Documents D-13). Cryptographic PDF signing is a separate, dependency-bearing project.
* **Password-protected or encrypted PDFs.** The renderer does not support it and Puppeteer does not emit it.
* **Per-org custom templates (different HTML per tenant).** P5 may add *variant selection* from a platform-curated set; arbitrary per-tenant HTML remains out of scope.
* **Replacing the ZIP writer or the export-ledger model.** Both stay exactly as they are.
* **Removing PDFKit.** It remains in the tree as the fallback renderer for the whole parity window (**D-8**). Its removal is a separate, later decision.

---

## 2. Verified Current-State Facts This Plan Depends On

Everything below was read from the live codebases on **2026-09-26** — do not re-derive it.

### 2.1 The renderer service (`Vs_Code/pdf-generation`)

| Area | Fact | Consequence |
|---|---|---|
| Contract | `POST /v1/pdf/generate` with `{ templateHtml, data, config }`; `200` → `application/pdf`, base64 via API Gateway; `400` validation; `500` render failure | One call, stateless, no session |
| Pipeline | Handlebars compile → Puppeteer `setContent(waitUntil: 'networkidle0')` → `page.pdf()` | The render waits for **every** network request in the HTML to settle |
| Handlebars helpers | **Only** `eq`, `ne`, `lt`, `gt` (`template.service.js`) | **No date, currency, number or pluralisation formatting in templates.** All formatting is ours — **D-4** |
| Template size cap | `MAX_HTML_BYTES = 512000`, validated on `templateHtml` only | Templates stay lean; `data` is not size-validated by the service, so **we** must cap it |
| `data` validation | Only `typeof === 'object'` | No schema protection from the service; ours must be authoritative |
| PDF config allow-list | `format, landscape, scale, margin, displayHeaderFooter, headerTemplate, footerTemplate, pageRanges, preferCSSPageSize, width, height`; `printBackground` is forced `true`; `path` is stripped | Page-number footers are available via `footerTemplate` + `displayHeaderFooter` |
| Defaults | `format: 'A4'`, margins `right/bottom/left: 10mm` — **no `top` default** | Always send an explicit full margin object; never rely on the default |
| SSRF guard | `file://`, `localhost`, `127.0.0.1`, `::1`, `169.254.*`, `10.*`, `172.16–31.*`, `192.168.*` are aborted; everything else is fetched | Assets must be public HTTPS or `data:` URIs — **D-12** |
| Timeouts | `PDF_TIMEOUT = 10000` ms on `setContent`; Lambda timeout 15 s; cold start 1–3 s (README) | Our client timeout must sit **above** the service's and **below** our own request budget |
| Browser | Module-level singleton, reused on warm containers | Latency is bimodal: ~1 s warm, ~4 s cold. Plan for the cold number |
| Response size | base64 through API Gateway (6 MB response cap) | Practical PDF ceiling ≈ **4.4 MB**. Fine for letters and payslips; fatal for a 20 000-entry ZIP — **D-9** |
| **Authentication** | **None.** The handler accepts any request | Employee salary and identity data would cross an open endpoint — **D-14**, and a release blocker |
| Logging | `console.error('[PDF_SERVICE_ERROR]', err)` and a blocked-URL warning; the request body is **not** logged | Acceptable; re-verify before go-live, and never put PII in a template *comment* either |
| Deployment | AWS Lambda behind API Gateway. Exact URL to be supplied by the operator | Config-driven; the plan never hardcodes it |

### 2.2 The sample template (`public/pages/documents.html`)

| Fact | Consequence |
|---|---|
| Pre-formatted values throughout (`fmtSubtotal`, `fmtPrice`, `fmtGrandTotal`) | Confirms **D-4** is the intended authoring style |
| Uses `{{{company.addressHtml}}}` and `{{{company.phoneStr}}}` — triple-stash, unescaped | **Raw-HTML injection vector.** Banned for tenant data and lint-enforced — **D-13** |
| `<link>` to `fonts.googleapis.com` | A live third-party fetch inside every render: added latency, a silent layout shift when it fails, and a leak of render timing to a third party. Self-host — **D-18** |
| `@page { size: A4; margin: 0 }` plus `.page { padding: 24px 42px }` | The template owns its own gutters; renderer margins must then be `0`. Declared **per template**, never globally |
| `{{#if}} / {{else}} / {{#each}} / {{this.*}}` | Block helpers are built in and safe to use; only the four comparison helpers are custom |

### 2.3 The HRMS codebase

| Area | Fact | Consequence |
|---|---|---|
| Runtime | Node **v24.20.0** | `fetch`, `AbortSignal.timeout()` and `structuredClone` are global — **zero new dependencies** (**D-19**) |
| HTTP clients | **No** axios / got / node-fetch anywhere in `src` (only a dead script under `src/code_dump`) | This module introduces the codebase's first outbound HTTP integration. It sets the precedent — build it properly |
| Object storage | `src/infrastructure/aws-s3/{aws-s3.config.js, aws-s3.provider.js}`; provider exports `getUploadUrl`, `getViewUrl`, `headObject`, `deleteObject`, `StorageUnavailableError`, TTL caps | Reuse wholesale |
| **Provider cannot write or read bytes** | There is **no `putObject`** and **no `getObject`**. Every existing upload is presigned PUT direct-from-client; every read is a presigned GET redirect | Server-generated PDFs need both. Adding them is P1 infrastructure work — **D-7** |
| Storage keys | `buildObjectKey` in `src/common/utilities/object_storage.utils.js`; module wrappers `buildDocumentKey({orgId, plane, subjectId, documentId})` and `buildTemplateKey(...)` in `document_storage.utils.js` | Add `buildGeneratedPdfKey(...)` in the same shape; never invent a second key convention |
| S3 config env | `PAYROLL_S3_BUCKET`, `AWS_REGION`, `APP_S3_KMS_KEY_ID`, TTL vars; `isConfigured()` gates a 503 | Generated PDFs live in the same bucket under a new prefix |
| Document module | 20 services, 13 models, 14 route files, mounted at `/api/v1/documents` with `/hr`, `/manager`, `/me` audiences, all gated by `requireFeature('documents.access')` | Letters are a Document-module feature area, not a new HTTP module — **D-6** |
| `org_documents` | Has `document_group_id`/`version`/`supersedes_id`, targeting arrays, `storage_backend ∈ {s3, reference}`, `storage_key`, `confirmed_at`, `status`, maker–checker columns, `materialisation_state` | A generated letter is an `org_documents` row whose bytes we wrote ourselves |
| `org_documents` has **no** `source`/`origin` column | `createDraft({ source })` is audit metadata only, never persisted | A generated letter needs an explicit `origin` discriminator — **D-6** |
| `document_org.service.js` | `createDraft → issueFileUrl → confirmFile → publish → replace / retire / reject / deleteDraft`, with advisory-lock-then-`FOR UPDATE` ordering and demote-predecessor-first publish | Generation substitutes **one step** (the presign/confirm handshake) and reuses every other step |
| `document_recipient.service.js` | `resolveAudience`, `materialise`, `materialisePending`, `topUpForUser`, `waive`, `markViewed` | A single-recipient letter uses `included_users: [userId]` and the same machinery |
| `document_type_catalog` | 51 platform types. The org plane has policy, disciplinary and exit types — but **no** appointment, offer-issued, confirmation, promotion, increment, bonafide, internship or NOC | Letter types must be seeded — **D-17**, seeder `010` |
| `document_export_jobs` | Explicitly **not** a job queue: an audit row for data leaving the system | Do **not** overload it for render jobs. Bulk rendering needs its own claim-based table — **D-9** |
| Payroll PDFs | `pdf_layout.utils.js` (351 lines; `formatMoney` deliberately avoids `toLocaleString` so ICU data cannot change output), `payslip_pdf.utils.js`, `form16_pdf.utils.js`, `annual_statement_pdf.utils.js`, `report_pdf.utils.js` | `formatMoney` is the money contract; HTML view-models must produce **byte-identical** money strings — **D-4** |
| Payslip determinism | `render(snapshot, { creationDate })`: the only inputs are the frozen `snapshot` JSONB and `payslips.published_at`. No repository, no live profile, no clock | The HTML path honours exactly the same rule — **D-5** |
| Payslip storage | `payslips` has `snapshot`, `snapshot_hash`, `engine_version` — **no stored PDF**. Every download re-renders | Caching rendered bytes is new capability, and the thing that makes P3 viable |
| Bulk ZIP | `zip_writer.utils.js`: STORE-only, streaming, O(1) memory, cap `ZIP_MAX_ENTRIES = 20000`; the `buildRunZip` async generator (`payroll_hr.controller.js:101`) renders one payslip at a time into the stream | 20 000 synchronous Lambda calls inside one HTTP response is not an option — **D-9** |
| Download helpers | `controllers/helpers/download.helper.js` — `sendBuffer`, `streamChunks`, both closing the export-ledger row; `buildDownloadHeaders`; CORS already exposes `Content-Disposition` | Unchanged by this module |
| Email | Deep links only — `payslip_dispatch.service.js` is explicit that no PDF is attached | No attachment work, and no reason to read bytes back for email |
| Crons | 17 files in `src/cron-jobs/`, registered in `server.js`, guarded by `os.platform()`; document crons follow a claim-and-drain pattern | Render warm-up and artifact purge follow the same shape |
| Migrations / seeders | Latest `00054-create-document-templates-and-exports.js`; latest seeder `009-seed-document-type-catalog.js` | Next: **`00055-create-pdf-generation.js`**, **`010-seed-letter-document-types.js`** |
| Tests | `node --test`, `tests/unit/**/*.test.js`, **158 files** (55 under `tests/unit/document/`). DB-free by convention | New tests in `tests/unit/pdf/` and `tests/unit/document/` |
| Express 5 gotcha | `req.query` is getter-only; query validation happens **inside** controllers via `validateOrThrow` | Applies to every list endpoint added here |
| Errors / envelope | `AppError(status, message, errorCode[, details])`; `{ success, message, data }`; controllers are class singletons with `try/catch → next(error)` | Match exactly |
| Role planes | `hr` is the top tenant role; `admin`/`super-admin` are platform roles with no tenant data access | Letters are `authorize(['hr'])` / `['manager','hr']` only |
| Operator constraint | Migrations are **never** run by the implementer; they are handed back unrun | Every phase ends with a migration hand-back note |

---

## 3. Architectural Decisions

Each decision is binding. Changing one requires editing this section and dating the amendment.

### D-1 — The renderer is infrastructure, not a module

`src/infrastructure/pdf-renderer/` with exactly two files, mirroring the shape of `aws-s3`:

* `pdf-renderer.config.js` — `baseUrl`, `apiKey`, `timeoutMs`, `maxAttempts`, `maxPayloadBytes`, `isConfigured()`. Reads env, logs one warning at boot when unconfigured (exactly as `aws-s3.config.js` does), never throws at require-time.
* `pdf-renderer.provider.js` — one exported function, `renderPdf({ templateHtml, data, config, requestContext }) → Promise<Buffer>`, plus `RendererUnavailableError` and `RendererRejectedError`.

The provider knows nothing about letters, payslips, orgs or employees. It takes HTML and data and returns bytes. Every domain concern lives above it. This is what lets Documents and Payroll share it without either depending on the other.

**Why not a module:** it has no tables, no routes, no RBAC and no business rules. `src/modules/*` is for domains; this is a driver.

### D-2 — Templates are platform-owned, versioned, immutable repo assets

Templates live at `src/modules/document/letter-templates/<code>/v<N>.html`, with a sibling `registry.js` declaring, per template: `code`, `current_version`, `document_type_code`, `title`, `required_fields`, `optional_fields`, `sample_data`, `pdf_config` (page size, margins, footer).

* A published version is **immutable**. A wording or layout fix is `v(N+1)`, a new file. The old file stays forever, because a letter issued under `v3` must still be explicable in five years.
* HR does not upload, paste, edit or link HTML. Not in P1, not later.
* Shipping a fix reaches every tenant with one deploy.

**Why this and not the "HR provides the HTML" shape originally proposed:** tenant-authored HTML is stored XSS into a headless Chromium with network access, an SSRF pivot through `<img src>`, an unbounded support surface (every broken page-break becomes a ticket), and it makes a platform-wide fix impossible. The HR-facing ease the proposal was reaching for is delivered by **D-3** instead, at none of that cost.

### D-3 — HR configures data, never markup: a branding profile plus saved fields

Two configuration objects, both plain forms:

1. **Branding profile** (one per org) — logo, signature image, signatory name and designation, registered address, CIN/GSTIN/PAN, contact email/phone/website, accent colour, footer disclaimer, letterhead on/off.
2. **Per-template config** (one per org per template code) — `enabled`, plus `saved_fields`: the values HR would otherwise retype on every issue (HR contact block, place of issue, notice-period clause selection, working-hours text, jurisdiction city).

Both are edited through ordinary validated endpoints and rendered live by the **preview** endpoint (**#134**, **#138**) before anything is issued. That preview is the whole usability answer: HR clicks, sees the actual A4 page, adjusts, saves.

**Per the answer to open question 4:** letter body wording is not editable in this scope. It comes from the template version plus saved fields.

### D-4 — Every value is formatted server-side; templates do presentation only

The renderer's Handlebars has four comparison helpers and nothing else. Therefore:

* Each template has exactly one **view-model builder** — `buildAppointmentLetterView(...)`, `buildPayslipView(snapshot, ...)` — a **pure function** returning a flat, JSON-safe object of **display-ready strings**: `fmt_gross`, `issued_on_text`, `joining_date_text`, `amount_in_words`.
* Money goes through the existing `formatMoney` from `pdf_layout.utils.js`, promoted to `src/common/utilities/pdf_format.utils.js` with a one-line re-export left behind in payroll (the same promote-and-re-export move Documents made for storage utils in its D-7). Its locale-independence is a correctness property, not a style preference: `toLocaleString` output can change with the host's ICU data, which would silently alter a legal document.
* Dates go through one `formatDocumentDate(value, style)` helper with a fixed, explicit format. No `moment().format()` scattered through builders, no host-locale dependence.
* Templates contain **no** arithmetic, no conditionals on raw numbers, no `Intl`.

Pure builders are the reason this module can be tested without a database and without the network.

### D-5 — Render once, store the bytes; the stored PDF is the artifact of record

Never re-render for a download. Every generated PDF is written to S3 and recorded in `pdf_render_artifacts` with its `content_hash`, `template_code`, `template_version`, `renderer_version` and the **frozen input snapshot** that produced it.

**Why this is non-negotiable:** an experience letter re-rendered after the employee's designation changes would silently produce a *different legal document* under the same reference number. The same reasoning already governs payslips (`snapshot` + pinned `published_at`); this decision extends it from "deterministic inputs" to "immutable output".

A re-render is only ever performed to **repair** a missing object (artifact row present, object gone) and then only when the recomputed `content_hash` matches the stored one; a mismatch is a hard error, never a silent overwrite (**EC-19**).

### D-6 — Generated letters are `org_documents`; no parallel store

*(Confirmed by the operator, question 3.)*

A generated letter is created through `document_org.service`'s existing lifecycle with `included_users: [subject_user_id]`, and it inherits, for free: targeting and recipient materialisation, publish/supersede/retire, acknowledgement and signature (Documents P3), audit logging, signed view URLs, confidentiality, the read-side composer, offboarding archive and retention.

Two additions to `org_documents`:
* `origin ENUM('uploaded','generated') NOT NULL DEFAULT 'uploaded'` — the discriminator that does not exist today.
* `generation_artifact_id UUID NULL` — the link to `pdf_render_artifacts`.

Generation **replaces exactly one step** of the lifecycle: instead of `issueFileUrl` → client PUT → `confirmFile`, the service renders, writes the object itself, and performs the equivalent of `confirmFile` in the same transaction. Everything before and after is the existing code path.

**A generated letter is never editable as a file.** `issueFileUrl` and `confirmFile` return `409 DOCUMENT_ORIGIN_GENERATED` for a row with `origin = 'generated'`. A change means reissue (**D-11**).

### D-7 — Add `putObject` and `getObject` to the S3 provider

The provider has neither, because until now bytes never transited Node. Server-side generation requires both:

* `putObject({ key, body, contentType, contentLength, checksumSha256 })` — SSE-KMS when `kmsKeyId` is set, mirroring the presigned-PUT parameters exactly so both paths produce identically-configured objects.
* `getObject({ key }) → { body: Buffer, contentLength, contentType }` — needed by the bulk ZIP stream (**D-9**) and by artifact verification.

Both throw `StorageUnavailableError` on transport failure, as the existing methods do. `getObject` is **capped**: it refuses objects above a configured ceiling so a corrupt `content_length` cannot exhaust heap.

**Blast radius check:** adding methods cannot change existing behaviour — but note Documents' D-6 precedent, where adding `deleteObject` silently activated payroll's dormant retention sweep. Grep for `typeof s3.putObject !== 'function'` and `typeof s3.getObject !== 'function'` guards before merging; there are none today, and the phase's regression gate is that every existing payroll and document storage test passes unchanged.

### D-8 — Payslips move to HTML with PDFKit retained as a fallback for the whole parity window

*(Confirmed by the operator, question 5: payslips are in scope.)*

Payroll PDFs are the highest-risk surface in this module: they are legally significant, already correct, covered by an existing test suite, and generated in bulk. The migration is therefore staged, not switched:

* A per-org setting `pdf_render_engine ∈ { pdfkit, html }`, default `pdfkit`, decides which renderer runs. Payroll controllers call one `renderPayrollDocument(...)` facade; the branch lives in exactly one place.
* A **parity harness** renders the same snapshot through both engines and asserts field-level equality of the extracted values (not pixels): every earning, deduction, contribution, total, employee identifier and date string. Parity is proved per document type before that type is switched.
* PDFKit code is **not deleted** in P3. Deleting it is a separate decision after a full financial year of HTML payslips.
* Order of migration: payslip → annual statement → Form 16 Part B → report family. Payslip first because it has the most volume and therefore the most evidence; Form 16 late because its layout is statutory.

**Why not a straight cutover:** a rendering bug that reaches a payslip is a payroll incident, not a cosmetic one, and the renderer is a network dependency in a path that is currently offline and deterministic.

### D-9 — Bulk is never N synchronous renders inside one request

The bulk payslip ZIP streams up to 20 000 entries in O(1) memory today because PDFKit is in-process. Naively swapping in an HTTP call makes it 20 000 sequential Lambda round-trips inside a single HTTP response — minutes of wall time, a cold-start tail, no resumability, and a timeout that loses everything.

The pipeline instead separates rendering from delivery:

1. **Warm-up.** On payslip publish, one `pdf_render_jobs` row per payslip is enqueued. `pdf_render_worker.cron.js` claims rows with `FOR UPDATE SKIP LOCKED`, renders with a **bounded concurrency** (config, default 4), and writes artifacts. By the time anyone downloads, the cache is warm.
2. **Delivery.** The ZIP endpoint streams bytes from S3 via `getObject`, never from the renderer. Memory stays O(1) — one entry buffered at a time, exactly as today.
3. **Misses.** A cache miss inside a bulk stream is rendered inline only while the miss count is under a configured threshold; above it the endpoint returns `202` with the job id and the caller polls. A miss is never silently skipped, and a partially-rendered ZIP is never presented as complete.
4. **Single-document downloads** render inline on a miss (one call, ~1–4 s) and then cache.

### D-10 — Renderer failure is a `503` with no state change, ever

`RendererUnavailableError` (timeout, network, 5xx, unconfigured) maps to `503 PDF_RENDERER_UNAVAILABLE`. `RendererRejectedError` (the service's own `400`) maps to `500 PDF_TEMPLATE_INVALID` — it means *our* template or data is malformed, which is a bug, not a client error, and it must page us rather than blame the user.

In both cases: no `org_documents` row is created or advanced, no reference number is consumed, no artifact row is left `ready`, no S3 object is orphaned. The render happens **before** the transaction that records it opens, and the transaction commits only when bytes are durably in S3.

### D-11 — Idempotency is structural, not hopeful

Every generation entry point accepts an `idempotency_key` (client-supplied; defaulted to a deterministic digest of `org_id + template_code + template_version + subject_user_id + canonicalised input snapshot`).

* `pdf_render_artifacts` carries `UNIQUE (org_id, idempotency_key)`.
* A retry that finds a `ready` artifact returns the existing letter and its existing reference number — it does not issue a second one.
* The S3 key is deterministic, derived from the artifact id, so a retried write is an overwrite of identical bytes rather than a second object.
* **The failure mode that is actually designed for:** render succeeded → S3 write succeeded → DB commit failed. The artifact row is written `pending` *before* the S3 write and flipped to `ready` after, so a crash leaves a `pending` row plus possibly an object; the sweeper reconciles (`EC-20`).

A change to an issued letter is a **reissue**: a new version in the same `document_group_id`, superseding the previous one, with its own reference number and its own artifact. Nothing is ever overwritten in place, matching Documents' D-11.

### D-12 — Asset delivery: presigned GET by default, data URI for small assets

The logo and signature are private S3 objects, and the renderer's SSRF guard blocks anything non-public.

* **Default:** a presigned GET URL with a short TTL (300 s), minted per render. It is fetched by the Lambda within seconds and is useless afterwards.
* **Small assets (< 64 KB):** inlined as a `data:` URI, removing the fetch entirely — fewer moving parts, faster renders, no TTL race. Note the cap applies to the *rendered* payload, not `templateHtml`, so the service's 512 KB limit is not the binding constraint; our own `maxPayloadBytes` is.
* **Never:** a public bucket, a public object ACL, or a permanent CDN URL for a tenant's assets.
* Assets are validated on upload: content type in `{image/png, image/jpeg, image/webp}` (**no SVG** — it is a script-execution vector inside Chromium), dimensions and byte size capped, HeadObject-verified exactly like every other upload in the system.

### D-13 — No triple-stash, no external references; enforced by a template lint test

A unit test walks every template file and fails the build on:

1. Any `{{{ ... }}}` triple-stash, and any use of the `SafeString` idiom.
2. Any `http://` or `https://` URL in `src`, `href`, `@import` or `url(...)` — every asset is either inlined at build time or injected as a presigned URL through `data`.
3. Any `<script>`, `<iframe>`, `<object>`, `<embed>`, or inline event handler attribute.
4. A file above 256 KB (half the service's cap, leaving headroom).
5. A `{{placeholder}}` not declared in the registry's `required_fields`/`optional_fields`, or a declared field never used.

Rule 5 is what makes "someone renamed a field and the letter silently rendered a blank" impossible. Handlebars' default behaviour for a missing key is an empty string — that is the single most likely production defect in this module, and a lint plus a runtime required-field assertion are the two defences.

### D-14 — Renderer authentication is a release blocker, not a nice-to-have

The service is currently open. An open HTML→PDF endpoint is (a) free compute for anyone who finds it, (b) an SSRF probe against anything the Lambda can reach, and (c) in our usage, a path carrying salary, address and identity data.

Minimum before any real employee data flows in a deployed environment:
* A shared secret in an `x-api-key` header, validated in the handler, held by us in `PDF_RENDERER_API_KEY` — never logged, never in an error body, never in the audit trail.
* API Gateway usage plan with throttling and a quota.
* HTTPS only; the provider refuses a non-`https` `baseUrl` outside `NODE_ENV=development`.

Better, and recommended for P5: drop API Gateway's public route and invoke the Lambda over IAM SigV4 (or a private VPC endpoint), so there is no internet-reachable surface at all. The provider is written so the transport can be swapped without touching a caller.

Until the key exists, the HTML engine stays off in production by the default of **D-8**'s org setting — the plan is safe to build against an unauthenticated dev endpoint, and unsafe to release against one.

### D-15 — Minimise what leaves the process

The renderer receives the **view-model**, not the domain object. Builders emit only what the template prints: never `user_id`, never a full salary structure when the letter prints one number, never a bank account, never an Aadhaar or PAN unless that specific letter prints it (and then masked wherever the template shows a masked form).

Our logs record `template_code`, `template_version`, `artifact_id`, byte count, duration and outcome — never `data`, never the rendered HTML, never the API key. This mirrors the document module's rule that `storage_key` never leaves the service layer.

### D-16 — Determinism is recorded, not assumed

Every artifact stores: `template_code`, `template_version`, `renderer_version`, `engine` (`html`/`pdfkit`), `input_hash` (SHA-256 of the canonically-serialised view-model), `content_hash` (SHA-256 of the PDF bytes), and the pinned `issued_at`/`creation_date`.

Any date printed on a document comes from a **pinned value** passed in — `published_at` for a payslip, `issued_on` for a letter — never from `new Date()` inside a builder. A builder that reads the clock is a bug the tests must catch (fixed-clock assertions).

Note that byte-identical PDFs across renders are *not* guaranteed by Chromium (embedded timestamps, font subsetting). `content_hash` is therefore an integrity record of what was actually delivered, not a reproducibility contract. **This is the second reason D-5 stores the bytes rather than re-deriving them.**

### D-17 — Ten new org-plane document types are seeded before letters ship

The catalog has no appointment, offer-issued, confirmation, promotion, increment/salary-revision, bonafide/employment-verification, internship-certificate, NOC, transfer or salary-certificate type. Seeder `010-seed-letter-document-types.js` adds them with the correct `group` (`onboarding`, `employment_history`, `exit`) and `default_is_confidential: true` for every type that prints compensation.

Each template's registry entry names its `document_type_code`; issuing a letter requires that type to be **active in the org**, and the error when it is not is actionable (`409 DOCUMENT_TYPE_NOT_ACTIVATED`), not a generic failure.

### D-18 — Self-contained templates: fonts, CSS and layout

* **No external fonts.** Either a system stack, or one woff2 subset inlined as base64 at build time. The sample's Google Fonts `<link>` makes render latency depend on a third party and makes a font-fetch failure a silent layout change.
* All CSS is inline in a `<style>` block; no external stylesheet, no CSS framework.
* Every template declares its own `pdf_config` — page size, full four-sided margins (never relying on the service's missing `top` default), and whether it uses `displayHeaderFooter` for page numbers.
* `page-break-inside: avoid` on every atomic block (signature block, totals row, table row), as the sample already does. A signature split across pages is a rejected document.
* Templates must render correctly with **empty optional data** — a missing signature image, no logo, a one-line address.

### D-19 — Zero new dependencies

`fetch`, `AbortSignal.timeout()`, `crypto`, `Buffer` and `node:test` cover everything. No Handlebars in our process (the renderer compiles), no axios, no image library. If a phase believes it needs a package, that is a decision to bring back here first.

### D-20 — Reference numbering is allocated inside the issuing transaction

Letters are legal documents; HR expects a Ref. No. `document_letter_sequences (org_id, template_code, financial_year, last_number)` is incremented under `SELECT ... FOR UPDATE` in the same transaction that creates the letter, so numbers cannot duplicate under concurrency.

Numbers may have **gaps** (a rolled-back transaction consumes nothing but a retried idempotent request reuses the original). Gapless numbering would require serialising every issue org-wide; it is not a requirement and will not be implemented. The format is a configurable pattern (`{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}`) validated against a whitelist of tokens.

### D-21 — The artifact table is generic and serves every PDF the system emits

One table, `pdf_render_artifacts`, keyed by `(source_type, source_id)` where `source_type ∈ { letter, payslip, form16, annual_statement, report }`. Payroll tables gain **no** PDF columns.

**Why not `payslips.pdf_storage_key`:** four document families would each grow their own columns, retention and purge would be four code paths, and the report family (which has no durable row at all today) could not participate. One table gives one sweeper, one purge policy, one observability surface.

### D-22 — The module is gated by existing feature flags

No new plan feature. Letter endpoints sit under `requireFeature('documents.access')`; payroll rendering under `payroll.access`. A tenant that has Documents gets letters when HR enables a template.

### D-23 — Retention: artifacts of record are kept, caches are disposable

`pdf_render_artifacts.retention_class`:
* `record` (letters) — governed by the document module's `document_retention_days`, purged only with the owning `org_document`, and **never** purged while the letter is unacknowledged or under an acknowledgement obligation.
* `cache` (payslips, statements, reports) — regenerable from a frozen snapshot, so the object may be purged after `pdf_cache_retention_days` and re-rendered on demand. The row stays; only the object goes, and the row records `object_purged_at`.

The purge sweeper deletes the object **before** clearing the pointer, keeping the row on failure so nothing is orphaned behind a dead pointer (the same ordering Documents chose in its EC-29).

### D-24 — One facade per domain, one provider underneath

Callers never touch the provider directly. Two service-level facades:
* `document_letter.service.js` — letters (Documents).
* `payroll_pdf.service.js` — payroll documents (Payroll), holding the `pdfkit`/`html` branch of **D-8**.

Both call a shared `pdf_render.service.js` that owns template loading, view-model validation, artifact bookkeeping, S3 write, idempotency and error mapping. The provider below it stays dumb. This is what keeps the eventual transport change (**D-14**) a one-file edit.

---

## 4. Data Model

One migration, **`00055-create-pdf-generation.js`**, creates four tables and alters two.

### 4.1 `pdf_render_artifacts` — every PDF the system has produced

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL | in every predicate and every index |
| `source_type` | ENUM `letter, payslip, form16, annual_statement, report` | **D-21** |
| `source_id` | UUID NULL | the `org_documents.id` / `payslips.id`; NULL for ad-hoc reports and previews |
| `template_code` | STRING(64) NOT NULL | |
| `template_version` | INTEGER NOT NULL | |
| `engine` | ENUM `html, pdfkit` NOT NULL | **D-8** — which renderer produced these bytes |
| `renderer_version` | STRING(32) NULL | reported by the service; NULL for `pdfkit` |
| `status` | ENUM `pending, ready, failed, purged` NOT NULL DEFAULT `pending` | **D-11** |
| `retention_class` | ENUM `record, cache` NOT NULL | **D-23** |
| `idempotency_key` | STRING(120) NOT NULL | **D-11** |
| `input_snapshot` | JSONB NOT NULL | the exact view-model sent to the renderer; **the reproducibility record** |
| `input_hash` | CHAR(64) NOT NULL | SHA-256 of the canonicalised `input_snapshot` |
| `content_hash` | CHAR(64) NULL | SHA-256 of the PDF bytes; NULL until `ready` |
| `storage_key` | TEXT NULL | **never leaves the service layer** |
| `size_bytes` | INTEGER NULL | |
| `page_count` | INTEGER NULL | best-effort, from the response when available |
| `render_ms` | INTEGER NULL | observability |
| `attempt_count` | INTEGER NOT NULL DEFAULT 0 | |
| `failure_code` / `failure_reason` | STRING(60) / STRING(500) NULL | never carries the payload |
| `pinned_date` | DATE NOT NULL | the date printed on the document (**D-16**) |
| `object_purged_at` | DATE NULL | **D-23** |
| `created_by` | UUID NULL | NULL for cron-originated renders |
| `created_at` / `updated_at` | | not paranoid — this is an audit surface |

**Indexes.** `UNIQUE (org_id, idempotency_key)`; `UNIQUE (org_id, source_type, source_id) WHERE source_id IS NOT NULL AND status <> 'failed'`; `(org_id, source_type, status)`; partial `(status, updated_at) WHERE status = 'pending'` for the sweeper; partial `(retention_class, created_at) WHERE retention_class = 'cache' AND object_purged_at IS NULL` for the purger.

### 4.2 `pdf_render_jobs` — the claim-based queue for bulk

Deliberately **not** `document_export_jobs`, which that module's own comment says is an audit row and not a queue.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL | |
| `batch_id` | UUID NOT NULL | one bulk request = one batch |
| `source_type` / `source_id` | as above | what to render |
| `template_code` / `template_version` | | pinned at enqueue, so a mid-batch deploy cannot split a batch across template versions |
| `payload` | JSONB NOT NULL | the builder's input keys only, never a rendered view-model |
| `status` | ENUM `queued, claimed, done, failed, cancelled` | |
| `attempts` | INTEGER NOT NULL DEFAULT 0 | capped by `pdf_render_max_attempts` |
| `claimed_at` / `claimed_by` | DATE / STRING(64) NULL | worker instance id; stale claims are reclaimed after a timeout |
| `artifact_id` | UUID NULL | set on success |
| `last_error` | STRING(500) NULL | |
| `created_by`, `created_at`, `updated_at` | | |

**Indexes.** `UNIQUE (org_id, source_type, source_id, batch_id)`; partial `(status, created_at) WHERE status = 'queued'`; `(org_id, batch_id, status)` for progress reads.

### 4.3 `document_letter_branding` — the org's letterhead identity (one row per org)

| Column | Notes |
|---|---|
| `org_id` UUID **UNIQUE** NOT NULL | singleton, `getOrCreate` like `document_settings` |
| `logo_storage_key`, `logo_content_type`, `logo_size_bytes`, `logo_width_px`, `logo_height_px` | HeadObject-verified (**D-12**) |
| `signature_storage_key`, `signature_content_type`, `signature_size_bytes` | optional |
| `signatory_name` STRING(120), `signatory_designation` STRING(120) | printed under the signature |
| `registered_address_lines` ARRAY(STRING) | up to 5 lines; **no HTML** |
| `cin`, `gstin`, `pan`, `tan` STRING(32) NULL | printed in the footer when present |
| `contact_email`, `contact_phone`, `website` | validated; `website` https-only |
| `accent_color_hex` CHAR(7) | strict `^#[0-9A-Fa-f]{6}$` — it is interpolated into CSS |
| `footer_note` STRING(300) | plain text, escaped |
| `letterhead_enabled` BOOLEAN DEFAULT true | off when the org prints on pre-printed stationery |
| `updated_by`, timestamps | |

Org identity that already exists (`org_name`, city/state/country/zip, `website`, `gst_number`, `company_pan_number`, `logo_url` on `organization_profiles`) is **not duplicated**: the branding resolver merges the org profile with this row, with this row winning on conflict. That merge result is what gets frozen into `input_snapshot`.

### 4.4 `document_letter_configs` — per-org, per-template settings

| Column | Notes |
|---|---|
| `org_id` UUID NOT NULL, `template_code` STRING(64) NOT NULL | `UNIQUE (org_id, template_code)` |
| `is_enabled` BOOLEAN NOT NULL DEFAULT false | a template must be explicitly enabled before it can be issued |
| `pinned_version` INTEGER NULL | NULL = always the registry's current version; set = stay on a known version |
| `saved_fields` JSONB NOT NULL DEFAULT `{}` | **D-3**; validated against the template's field schema on write, not only on issue |
| `reference_pattern` STRING(120) NULL | overrides the org default (**D-20**) |
| `requires_acknowledgement` BOOLEAN NULL | NULL = inherit from the document type |
| `is_confidential` BOOLEAN NULL | NULL = inherit; may only be **tightened**, mirroring Documents' D-12 |
| `updated_by`, timestamps | |

### 4.5 `document_letter_sequences` — reference numbers (**D-20**)

`(org_id, template_code, financial_year)` unique, `last_number INTEGER NOT NULL DEFAULT 0`, `updated_at`. Incremented under `FOR UPDATE` inside the issuing transaction.

### 4.6 Alterations

* **`org_documents`** — add `origin ENUM('uploaded','generated') NOT NULL DEFAULT 'uploaded'` and `generation_artifact_id UUID NULL` (**D-6**). Both are additive and backfill-free; existing rows are `uploaded` by default, which is correct.
* **`document_settings`** — add the **letter** knobs of §13 (branding, preview rate, reference pattern, confidentiality and acknowledgement defaults, bulk caps, auto-issue-on-exit, manager proposal).
* **`payroll_settings`** — add the **payroll rendering** knobs of §13 (`pdf_render_engine`, `payslip_prerender_on_publish`, `pdf_bulk_inline_miss_threshold`, `pdf_cache_retention_days`). They belong to the payroll singleton because they govern payroll documents; putting them in `document_settings` would make Payroll depend on the Document module's settings row.

Every added knob defaults to the current behaviour, so an org that has not been migrated — and an org that never enables anything — behaves exactly as it does today.

### 4.7 Structural notes

* `payslips`, `payroll_runs` and every other payroll table are **untouched**. The payslip↔PDF link lives in `pdf_render_artifacts.source_id` (**D-21**).
* `input_snapshot` is the only place a view-model is persisted, and it is what makes an eight-year-old letter explicable.
* `storage_key` columns follow the module rule: read only through a dedicated repository method, never included in a `toClient` projection.
* No table in this module is `paranoid`. A soft-deletable render record is not a record.

---

## 5. The Renderer Contract

### 5.1 Request

```
POST {PDF_RENDERER_BASE_URL}/v1/pdf/generate
x-api-key: {PDF_RENDERER_API_KEY}           // D-14
content-type: application/json
x-request-id: {req.headers['x-request-id']} // correlation, not auth

{ "templateHtml": "<!DOCTYPE html>…", "data": { … }, "config": { … } }
```

### 5.2 Budgets

| Budget | Value | Rationale |
|---|---|---|
| Client timeout | **20 s** | above the service's 10 s `setContent` + 15 s Lambda ceiling, so we observe *its* error rather than inventing our own |
| Attempts | **2** (1 retry) | rendering is a pure function of the request, so a retry is always safe |
| Retry on | network error, timeout, `429`, `5xx` | |
| Never retry on | `400` — the template or data is wrong; retrying is pointless (**D-10**) | |
| Backoff | 500 ms + full jitter | one retry, so keep it simple |
| Max request payload | **4 MB** (`maxPayloadBytes`) | below API Gateway's limit; checked before send, `500 PDF_PAYLOAD_TOO_LARGE` if exceeded, because it means a builder produced something unreasonable |
| Max response | **5 MB** decoded | above it, fail loudly rather than stream a truncated PDF |
| Concurrency (worker) | default **4**, configurable | protects both the Lambda's account concurrency and our event loop |

### 5.3 Response handling

* `200` → decode base64 → **verify the `%PDF-` magic bytes and the trailing `%%EOF`**. A 200 with an HTML error body is the classic API Gateway failure mode and must not be stored as a PDF.
* `400` → `RendererRejectedError` → `500 PDF_TEMPLATE_INVALID`, logged at error with `template_code` and `template_version`, never with `data`.
* `403`/`401` → `RendererUnavailableError` with `failure_code = 'renderer_auth'` — a misconfigured key is an ops problem, surfaced distinctly.
* `429`/`5xx`/timeout/network → `RendererUnavailableError` → `503 PDF_RENDERER_UNAVAILABLE`.
* Unconfigured `baseUrl` → `503 PDF_RENDERER_NOT_CONFIGURED`, the same shape `isConfigured()` produces for S3.

### 5.4 Environment

| Var | Default | Notes |
|---|---|---|
| `PDF_RENDERER_BASE_URL` | none | unset ⇒ every HTML render returns 503; PDFKit paths keep working |
| `PDF_RENDERER_API_KEY` | none | **D-14**; never logged |
| `PDF_RENDERER_TIMEOUT_MS` | `20000` | |
| `PDF_RENDERER_MAX_ATTEMPTS` | `2` | |
| `PDF_RENDERER_MAX_PAYLOAD_BYTES` | `4194304` | |
| `PDF_RENDER_CONCURRENCY` | `4` | worker pool |
| `PDF_CACHE_RETENTION_DAYS` | `400` | `cache`-class objects (**D-23**) |

### 5.5 What the provider must not do

No template loading, no S3, no database, no audit, no retries beyond the configured count, no logging of `data`, no swallowing of errors into a null return. One job: HTML in, bytes out, typed errors on failure.

---

## 6. Template Catalog

### 6.1 Layout

```
src/modules/document/letter-templates/
├── registry.js                    # code → metadata, the single source of truth
├── _partials/                     # build-time includes: letterhead, footer, signature block
├── appointment_letter/v1.html
├── offer_letter/v1.html
├── experience_letter/v1.html
└── …
src/modules/payroll/pdf-templates/
├── registry.js
├── payslip/v1.html
├── annual_statement/v1.html
└── form16_part_b/v1.html
```

Payroll templates live with payroll: they are owned by that domain, their view-models are built from payroll snapshots, and the Documents module has no business knowing about them. Both registries expose the same interface and are loaded by the shared `pdf_render.service.js`.

### 6.2 Registry entry

```js
{
  code: 'experience_letter',
  title: 'Experience Letter',
  document_type_code: 'experience_letter_issued',   // must be active in the org — D-17
  current_version: 1,
  audience: 'letter',                               // letter | payroll
  required_fields: ['employee_name', 'designation', 'joining_date_text', 'relieving_date_text'],
  optional_fields: ['department_name', 'closing_note'],
  saved_field_schema: { /* Joi — what HR fills once, D-3 */ },
  sample_data: { /* complete, realistic, PII-free — powers preview and tests */ },
  pdf_config: { format: 'A4', margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
                displayHeaderFooter: false }
}
```

### 6.3 Loading

Templates are read from disk **once** at first use and held in a module-level `Map` keyed by `code:version` — the same singleton discipline the renderer's browser service uses. A file read per render would be a syscall on every payslip in a 20 000-entry batch.

### 6.4 Authoring rules (all lint-enforced, **D-13**)

1. Double-stash only. Never `{{{ }}}`.
2. No external URLs. Assets arrive through `data`.
3. Self-contained CSS and fonts (**D-18**).
4. Every placeholder declared; every declared field used.
5. `page-break-inside: avoid` on signature blocks, totals rows and table rows.
6. Renders correctly with every optional field absent.
7. ≤ 256 KB.
8. A visible `template_code/vN` marker in the footer of every generated document — when HR reports "this letter looks wrong", the version is on the page.

---

## 7. Configuration & View-Model Contract

### 7.1 What HR actually does (the usability answer)

1. **Branding, once.** Upload logo → upload signature → fill signatory, address, identifiers, accent colour, footer → **Preview** renders a real A4 sample letter → Save.
2. **Per letter type, once.** Enable it → fill its saved fields → **Preview** with sample data or against a real employee → Save.
3. **Per issue.** Pick employee, pick letter type, confirm the pre-filled values, Issue. Everything else is already known.

No HTML, no CSS, no URLs, no placeholders, no file formats. Three forms and a preview button.

### 7.2 Merge-data assembly (per the operator's answer to question 2)

Every value is resolved **at issue time, from the database**, in this precedence:

```
1. explicit request overrides   (rare; only fields the template marks overridable)
2. document_letter_configs.saved_fields   (what HR saved)
3. resolved org branding        (branding row merged over organization_profiles)
4. employee facts from the DB   (profile, department_id → name, location, employment type,
                                 employee_exits for exit dates, payroll salary structure for
                                 compensation-bearing letters)
5. template defaults
```

Rules:
* **Department comes from `department_id`**, never the free-text `department` column — the dual-source trap this codebase already documents.
* **Exit dates come from `employee_exits`**, never a profile column, mirroring Documents' D-18.
* **Compensation comes from the frozen payroll structure**, not a live recompute.
* A missing **required** field is a `422 LETTER_FIELD_MISSING` listing the field names — never a blank space on a legal document.
* The assembled view-model is validated against the template's Joi schema **before** the renderer is called.

### 7.3 View-model rules

* Flat-ish, JSON-safe, display-ready strings (**D-4**).
* Keys are `snake_case` and match the registry exactly.
* No `null` — an absent optional value is omitted, so `{{#if}}` behaves predictably.
* No nested objects deeper than two levels; no functions, no dates, no `Decimal`, no Sequelize instances.
* Builders are pure: `(facts, branding, config, pinnedDate) → view`. No repository calls, no clock, no I/O. **All data fetching happens in the service above the builder.** This is what makes every builder unit-testable without a database.

---

## 8. Pipelines

### 8.1 Letter issuance (the core flow)

```
HR: POST /api/v1/documents/hr/letters
    { template_code, subject_user_id, field_overrides?, effective_date?, idempotency_key? }

 1. authorize(['hr'])  +  requireFeature('documents.access')
 2. load letter config → 409 LETTER_TEMPLATE_DISABLED if not enabled
 3. load document type → 409 DOCUMENT_TYPE_NOT_ACTIVATED / DOCUMENT_TYPE_INACTIVE
 4. resolve subject: same org, exists, not soft-deleted → 404 (uniform denial)
 5. assemble merge data from the DB (§7.2)            ── no transaction, reads only
 6. build view-model (pure)  →  validate against schema → 422 on a missing required field
 7. compute idempotency_key → if a `ready` artifact exists, RETURN IT (D-11) and stop
 8. INSERT pdf_render_artifacts (status='pending')     ── committed on its own, deliberately
 9. renderPdf(templateHtml, view, pdf_config)          ── NETWORK. No transaction open.
10. verify magic bytes, size, hash
11. s3.putObject(deterministic key)                    ── NETWORK. No transaction open.
12. BEGIN
      artifact → status='ready', content_hash, size, storage_key, render_ms
      allocate reference number (FOR UPDATE on document_letter_sequences)   ── D-20
      create org_documents row: origin='generated', confirmed_at=now,
        storage_backend='s3', included_users=[subject], generation_artifact_id
      publish it through the existing lifecycle (materialise 1 recipient)
      write document_audit_logs rows (letter.generated, org_document.published)
    COMMIT
13. 201 { letter_id, reference_number, artifact: { size_bytes, page_count }, document: {…} }
```

**Ordering rationale.** Steps 9 and 11 are network I/O and must never run inside a transaction holding row locks — the codebase's existing rule. The artifact row is committed `pending` *before* the S3 write so that a crash between the two leaves an investigable row rather than an orphaned object (**EC-20**). The reference number is allocated in step 12 and not earlier, so a render failure never burns a number.

**What is deliberately not done:** the letter is not emailed, and the PDF is not attached to anything. Notification reuses the document module's existing queue-and-drain outbox, outside the transaction.

### 8.2 Reissue

`POST /letters/:id/reissue` → re-assembles from current data, renders a **new** artifact, creates version `N+1` in the same `document_group_id`, supersedes the previous version through the existing `document_org.service` path, and allocates a **new** reference number. The superseded letter keeps its bytes, its artifact, its reference number and its acknowledgement history, forever (**D-5**, **D-11**).

### 8.3 Payslip rendering (P3)

```
publish payslip  →  enqueue pdf_render_jobs (source_type='payslip')        [warm-up, D-9]

pdf_render_worker.cron (every minute)
  claim N rows  FOR UPDATE SKIP LOCKED  (bounded concurrency)
  for each: load payslips.snapshot  →  buildPayslipView(snapshot, published_at)
            render → verify → putObject → artifact 'ready' → job 'done'
  failure: attempts++, last_error; over max attempts → 'failed' (alertable, never silent)

GET payslip PDF (#173 / #191)
  artifact ready?  → stream bytes from S3
  miss             → render inline, cache, serve
  engine = pdfkit  → existing path, untouched

GET bulk ZIP (#174)
  count misses in the run
    under threshold → stream, rendering misses inline
    over threshold  → 202 { batch_id }; caller polls; cron fills the cache
  stream: for each payslip → s3.getObject → zip.addEntry → release buffer   [O(1) memory]
```

The ZIP writer, the entry cap, the export ledger and the download headers are all unchanged. The only substitution is where a payslip's bytes come from.

### 8.4 Bulk letter issuance (P4)

`POST /letters/bulk` validates the whole cohort **first** (every subject resolvable, every required field present for every subject), rejects with a per-subject error list if any fail, then enqueues one `pdf_render_jobs` row per subject under one `batch_id` and returns `202 { batch_id, total }`. The worker renders and issues each letter through **exactly** the single-issue service path — one code path, so a bulk letter and a single letter are byte-for-byte the same document.

Partial failure is explicit: a batch reports `done / failed / queued` counts, failures carry a per-subject reason, and a failed subject can be retried individually without touching the ones that succeeded.

### 8.5 Preview

Preview renders through the same service but with `source_type` NULL, `retention_class = 'cache'`, a short-lived artifact, a **`PREVIEW` watermark** applied by the template when `data.is_preview` is true, and **no** reference number, **no** `org_documents` row and **no** recipient. A preview is rate-limited per org (it is the one endpoint that turns a click into a Lambda invocation) and never accepts a subject the caller could not otherwise read.

---

## 9. API Surface & RBAC

All Document-plane routes are gated by `[authenticate, authorize([...]), requireFeature('documents.access')]` and mount under the existing `/api/v1/documents` base. Query parameters are validated **inside controllers** (Express 5 `req.query` is getter-only).

### 9.1 New endpoints — Document plane (registry numbering from #130)

| # | Path | Method | Roles | Phase | Notes |
|---|---|---|---|:--:|---|
| 130 | `/documents/hr/letter-branding` | GET | `hr` | 1 | `getOrCreate`; never returns a storage key |
| 131 | `/documents/hr/letter-branding` | PUT | `hr` | 1 | full replace; strict validation of colour, URLs, address lines |
| 132 | `/documents/hr/letter-branding/assets/upload-url` | POST | `hr` | 1 | presigned PUT for `logo` / `signature`; raster only (**D-12**) |
| 133 | `/documents/hr/letter-branding/assets/confirm` | POST | `hr` | 1 | HeadObject verification, then commit the key |
| 134 | `/documents/hr/letter-branding/preview` | POST | `hr` | 1 | branded sample letter PDF; rate-limited |
| 135 | `/documents/hr/letter-templates` | GET | `hr` | 1 | catalog + this org's enablement state |
| 136 | `/documents/hr/letter-templates/:code` | GET | `hr` | 1 | field schema, saved values, sample data |
| 137 | `/documents/hr/letter-templates/:code/config` | PUT | `hr` | 1 | enable/disable, saved fields, pinned version |
| 138 | `/documents/hr/letter-templates/:code/preview` | POST | `hr` | 1 | sample **or** a real `subject_user_id` |
| 139 | `/documents/hr/letters` | POST | `hr` | 2 | **issue** (§8.1); `idempotency_key` supported |
| 140 | `/documents/hr/letters` | GET | `hr` | 2 | list issued letters; filters by type, subject, date, status |
| 141 | `/documents/hr/letters/:id` | GET | `hr` | 2 | detail incl. artifact metadata and the frozen snapshot |
| 142 | `/documents/hr/letters/:id/reissue` | POST | `hr` | 2 | §8.2 |
| 143 | `/documents/hr/letters/bulk` | POST | `hr` | 4 | `202 { batch_id }` |
| 144 | `/documents/hr/letters/bulk/:batchId` | GET | `hr` | 4 | progress + per-subject failures |
| 145 | `/documents/manager/letters` | POST | `manager`,`hr` | 4 | **propose** for a direct report; HR approves (maker–checker) |
| 146 | `/documents/manager/letters` | GET | `manager`,`hr` | 4 | own proposals, hierarchy-scoped |
| 147 | `/documents/hr/jobs/pdf-render/run` | POST | `hr` | 3 | manually drain the render queue for the caller's org |

**Employee and manager reads add no endpoints.** A generated letter is an `org_document`; it appears in the existing self and manager reads, the existing composer, the existing download-URL issuance and the existing acknowledgement flow. That is the dividend of **D-6**.

### 9.2 New endpoints — Payroll plane (registry numbering from #219)

| # | Path | Method | Roles | Phase |
|---|---|---|---|:--:|
| 219 | `/payroll/hr/jobs/payslip-render/run` | POST | `hr` | 3 |

`#173`, `#174` and `#191` keep their paths, parameters and response shapes. **Their contract does not change** — only the source of the bytes. The `md_updates` record for P3 must say exactly that, because "nothing changed" is itself information the frontend needs.

### 9.3 Denial semantics

Identical to the document module's uniform-denial table, and non-negotiable:

* A letter id from another org, a deleted letter, or a letter the caller may not see → **`404 DOCUMENT_NOT_FOUND`**, byte-identical in all three cases.
* A manager acting on a non-report → **`403 FORBIDDEN`** when addressed by `:userId`, **`404`** when addressed by letter id. Scope is checked **before** existence in both.
* A confidential letter (any letter printing compensation) follows the type's confidentiality; a manager without the right gets the same `404`.
* No error message ever discloses a storage key, a renderer URL, an API key, or whether a template exists but is disabled in *another* org.

---

## 10. Cross-Cutting Requirements

* **Multi-tenancy.** `org_id` in every predicate, every index, every FK. A cross-org id loads as `null` and is denied identically to a non-existent one. The renderer is shared infrastructure, so `org_id` must be part of every cache key, every idempotency key and every storage key — a cache collision here would deliver one tenant's letter to another.
* **Transactions.** Unmanaged only (`const t = await db.sequelize.transaction()` … `commit()`/`rollback()`, with `if (!t.finished) await t.rollback()` in the catch). Every state change writes its audit row **inside the same transaction**. **No network call — renderer or S3 — ever happens inside a transaction** (§8.1).
* **Concurrency.** Two concurrent issues of the same letter for the same subject resolve to one letter (`UNIQUE (org_id, idempotency_key)`). Two workers cannot claim one job (`FOR UPDATE SKIP LOCKED`). Two concurrent reference allocations cannot collide (`FOR UPDATE` on the sequence row). Two concurrent reissues serialise on the group's advisory lock, matching the document module's lock ordering (advisory lock **then** row lock, never the reverse).
* **Idempotency.** Issue, reissue, preview-and-cache, and job claim are all idempotent. A client retry after a timeout must never produce a second letter, a second reference number, or a second S3 object.
* **Partial failure.** The designed-for sequence is render-ok → S3-ok → commit-fail. The `pending` artifact row plus the deterministic key make it recoverable and non-duplicating. A bulk batch is never all-or-nothing after validation: per-subject failures are recorded and individually retryable.
* **Timeouts & retries.** One retry, only on retryable classes, with jitter. A 20 s client timeout above the service's own ceiling. The worker's concurrency cap is what keeps a 20 000-payslip batch from becoming a self-inflicted denial of service against our own Lambda.
* **PII & secrecy.** `storage_key` never leaves the service layer. `input_snapshot` is service-layer only and never returned in a list projection. Logs carry ids, codes, sizes and durations — never `data`, never HTML, never the API key. Document numbers stay masked exactly as the document module masks them.
* **Immutability.** `pdf_render_artifacts` rows are append-and-advance; an artifact's `content_hash`, `input_snapshot` and `template_version` are never updated after `ready`. Issued letters are never edited — only superseded.
* **Observability.** One structured log line per render: `template_code`, `version`, `engine`, `org_id`, `artifact_id`, `attempt`, `render_ms`, `size_bytes`, outcome. Counters for renders, retries, 503s and cache hit-rate. A failure rate above a threshold on `pdf_render_jobs` is the signal that the renderer is degraded, and it must be visible without reading logs.
* **Performance targets** (measured in P5, not assumed): single letter issue p95 < 6 s cold / < 3 s warm; payslip cache hit serves in < 300 ms; a 1 000-payslip ZIP streams from a warm cache in < 60 s at O(1) memory; the render worker sustains the configured concurrency without event-loop starvation.
* **Graceful degradation.** Renderer down ⇒ letters return `503` and payslips keep working on `pdfkit` (the default engine until an org opts in). No PDF path is allowed to take down a non-PDF path: the renderer is never called during payroll calculation, publish, or any other state machine's critical section.

---

## 11. Phases

> **Rule (inherited from Leave, Payroll and Documents): no phase begins until the previous one is tested and verified.**

### Phase 1 — Rendering core, template catalog, branding & preview

**Goal.** Make a branded, correct A4 PDF come out of the system and be visible to HR — with **nothing issued, nothing stored as a record, and no employee data involved** beyond an explicit preview. Get the dangerous parts (transport, sanitisation, formatting, storage) right while the blast radius is a preview.

**Scope.**
* `src/infrastructure/pdf-renderer/{pdf-renderer.config.js, pdf-renderer.provider.js}` — **D-1**, with the full budget/error matrix of §5.
* Provider additions `putObject` / `getObject` — **D-7** — plus the regression gate that every existing payroll and document storage test passes unchanged.
* Promote `formatMoney` and friends to `src/common/utilities/pdf_format.utils.js`, leaving a one-line re-export in `pdf_layout.utils.js` — **D-4**.
* `src/modules/document/letter-templates/` with `registry.js`, `_partials/`, and **three** templates (`experience_letter`, `appointment_letter`, `bonafide_letter`) — enough to prove the letterhead, a table-bearing letter and a minimal letter.
* The template lint test — **D-13**. Written **before** the templates.
* Migration `00055-create-pdf-generation.js` (all four tables + both alterations) — authored, **not run**.
* `document_letter_branding` + `document_letter_configs` services, repositories, validators, HR routes **#130–#138**.
* `pdf_render.service.js` — template load + view-model validation + artifact bookkeeping + S3 write + idempotency + error mapping (**D-24**).
* Asset upload handshake for logo/signature, raster-only, HeadObject-verified (**D-12**).
* Preview (§8.5) with the `PREVIEW` watermark and per-org rate limiting.

**Integration.** `organization_profiles` for org identity (merged, not duplicated); `aws-s3` provider; `document_audit.service` from the first write.

**Tests** (`tests/unit/pdf/`, DB-free, renderer stubbed by injecting `fetch`):
retry/no-retry classification per status class; timeout behaviour; magic-byte verification; payload-size guard; API key never appearing in a thrown error or log line; template lint over every file; view-model builders against golden fixtures; `formatMoney` parity with the PDFKit output for a table of awkward values (negative, zero, > 1 crore, fractional paise); branding merge precedence; accent-colour and address-line validation rejecting CSS/HTML injection.

**Exit criteria.** HR uploads a logo and a signature, saves branding, clicks preview and receives a correct A4 PDF with the org's letterhead. The same preview with **no** logo, **no** signature and a one-line address still renders correctly. An SVG logo is rejected. An accent colour of `red; } body { display:none` is rejected at validation. With `PDF_RENDERER_BASE_URL` unset, every preview returns `503 PDF_RENDERER_NOT_CONFIGURED` and nothing else in the system changes behaviour. With the renderer returning `500`, the caller gets `503` and no artifact is left `ready`. **Every pre-existing payroll and document test passes unchanged.** Migration handed back unrun.

---

### Phase 2 — Letter issuance into `org_documents`

**Goal.** HR issues a real letter to a real employee, and the employee sees it in *My HR Documents* — with the artifact, the reference number and the audit trail all correct.

**Scope.**
* Seeder `010-seed-letter-document-types.js` — the ten missing org-plane types (**D-17**).
* `document_letter.service.js` — the issuance pipeline of §8.1, end to end.
* Reference numbering: `document_letter_sequences`, the pattern validator, allocation under `FOR UPDATE` (**D-20**).
* `org_documents.origin` / `generation_artifact_id` wiring; `issueFileUrl` and `confirmFile` rejecting `origin = 'generated'` with `409 DOCUMENT_ORIGIN_GENERATED` (**D-6**).
* Reissue / supersede (§8.2).
* Merge-data assembly from the DB per §7.2, including the `department_id` and `employee_exits` rules.
* Routes **#139–#142**; audit events `letter.generated`, `letter.issued`, `letter.reissued`.
* Five more templates: `offer_letter`, `confirmation_letter`, `promotion_letter`, `increment_letter`, `relieving_letter`.
* `pdf_artifact_sweeper.cron.js` — reconciles `pending` artifacts older than the render timeout (**EC-20**).

**Integration.** `document_org.service` lifecycle, `document_recipient.service.materialise`, `document_acknowledgement` (a letter type may require acknowledgement), the read-side composer, `employee_exits`, payroll salary structures for compensation-bearing letters.

**Tests.** Idempotent double-issue returns one letter; concurrent issue with the same key produces one row (simulated at the repository contract level); reference allocation under concurrency never duplicates; a required field missing → `422` naming the field, and **no** artifact, **no** number consumed; renderer 503 mid-issue leaves nothing behind; a generated letter cannot be file-replaced; reissue supersedes and preserves v1's bytes, number and acknowledgements; department resolved by `department_id`, never the free-text column; cross-org subject → uniform `404`.

**Exit criteria.** HR issues an experience letter; the employee sees it in their document list and can download it; the PDF carries the right reference number, the org's letterhead and the signatory block. Re-clicking Issue does **not** produce a second letter. Reissuing produces v2, supersedes v1, and v1 remains downloadable with its original bytes. A letter for an inactive document type is refused with an actionable code. The renderer being down blocks issuance with `503` and leaves the system in exactly its prior state. Seeder handed back unrun.

---

### Phase 3 — Payroll migration: payslips, statements and bulk

**Goal.** Payslips render from HTML, cached, with byte-level equivalence of *content* proven against PDFKit before any org is switched — and the 20 000-entry ZIP still streams in constant memory.

**Scope.**
* `src/modules/payroll/pdf-templates/` — `payslip/v1.html`, then `annual_statement/v1.html`, then `form16_part_b/v1.html`, in that order.
* `buildPayslipView(snapshot, publishedAt)` and siblings — pure, snapshot-only, clock-free (**D-5**, **D-16**).
* `payroll_pdf.service.js` facade holding the single `pdfkit | html` branch (**D-8**); `pdf_render_engine` org setting, default `pdfkit`.
* **Parity harness** — renders both engines from the same snapshot and asserts field-level equality of every printed value. A type is not switchable until its parity suite is green over the full payslip fixture set.
* `pdf_render_jobs` + `pdf_render_worker.cron.js` with `FOR UPDATE SKIP LOCKED`, bounded concurrency, attempt caps and stale-claim reclaim (**D-9**).
* Warm-up enqueue on payslip publish; cache-hit serving for `#173`/`#191`; ZIP streaming from S3 for `#174` with the miss-threshold rule.
* Route **#219** and the `md_updates` record stating that `#173`/`#174`/`#191` contracts are unchanged.
* `pdf_cache_purge.cron.js` for `cache`-class artifacts (**D-23**).

**Integration.** `payslip_read.service`, `zip_writer.utils` (untouched), `download.helper` (untouched), the payroll export ledger (untouched), `payslip.service` publish.

**Tests.** Parity across the fixture set; identical output for a re-render of the same snapshot (field-level, not byte-level — **D-16**); a payslip published before the migration renders identically after it; worker claim exclusivity; attempt cap and failure recording; ZIP entry order and entry count with a mixed hit/miss cohort; ZIP memory profile unchanged (one buffer live at a time); cache purge deletes the object, keeps the row, and a subsequent download re-renders; `engine = pdfkit` path completely unchanged.

**Exit criteria.** With `pdf_render_engine = html`, an employee downloads a payslip whose every printed value matches the PDFKit output for the same snapshot. A 1 000-payslip run warms in the background and its ZIP streams from cache. Switching the org back to `pdfkit` restores the old behaviour instantly with no data migration. A renderer outage during warm-up leaves jobs `queued`/`failed` and **does not** affect payroll publish, calculation or any other payroll operation.

---

### Phase 4 — Bulk issuance, offboarding automation, maker–checker

**Goal.** Letters at scale, and letters that issue themselves at the moments the business already has.

**Scope.**
* Bulk letter issuance (§8.4): whole-cohort validation first, then `batch_id` + `202`, routes **#143–#144**.
* Offboarding hook: on exit finalisation, auto-issue relieving and experience letters per org policy, through the same single-issue path, idempotent on `(employee, exit, template)`.
* Manager maker–checker (**#145–#146**): a manager **proposes** a letter for a direct report; HR approves and issues. Scope is re-checked **at approval**, not only at proposal — a stale proposal for someone who has stopped reporting to the proposer is blocked.
* Notification of an issued letter through the existing document notification outbox (queue-and-drain, outside the transaction).
* Remaining templates: `warning_letter`, `internship_certificate`, `noc`, `salary_certificate`.

**Integration.** `document_offboarding.service`, `employee_exits`, `hierarchy_access.utils` via the document module's authority utils, `document_notification.service`.

**Tests.** Cohort validation rejects the whole batch **before** any render when a subject is invalid; per-subject failures are individually retryable; a re-run of the same batch issues nothing new; the offboarding hook is idempotent across repeated runs; a proposal whose subject leaves the proposer's team is blocked at approval; a notification failure never rolls back an issued letter.

**Exit criteria.** HR issues confirmation letters to 200 employees in one action; every one of the 200 is byte-for-byte the document the single-issue path produces; failures are visible per subject and retryable; an employee exit automatically produces a relieving letter exactly once.

---

### Phase 5 — Hardening: security, retention, performance, documentation

**Goal.** Make it safe to leave running.

**Scope.**
* **Renderer authentication (D-14)** — API key end to end, plus the IAM/private-endpoint upgrade if the operator agrees. **This phase cannot close while the renderer is publicly unauthenticated.**
* Retention and purge for both classes (**D-23**), with the delete-object-before-clearing-pointer ordering.
* Observability: structured render logs, counters, a failure-rate signal on `pdf_render_jobs`.
* Rate limiting on preview and on bulk issuance.
* Performance measurement against §10's targets, on real data volumes.
* A documented disaster path: renderer permanently unavailable ⇒ how letters are issued (answer: they are not; payroll falls back to `pdfkit`), and what an operator does.
* Template version pinning, the per-org variant-selection surface if it is still wanted, and the decision on PDFKit removal.
* Registry updates and completion report; final `md_updates` record.

**Exit criteria.** The renderer rejects an unauthenticated request. Performance targets met and recorded with numbers, not adjectives. A purge cycle runs cleanly on real data. `public/md_pdf-generation/phases/phase5_*` and the completion report are written, and all four registries are current.

---

### Phase dependency notes

* P2 cannot start before P1's lint, formatting and transport tests are green — they are the safety net every later phase leans on.
* P3 is independent of P2 in code but **not** in sequence: do not migrate payroll while the letter pipeline is still changing shape.
* P4 depends on P2 only.
* P5 spans everything and must not be folded into P4 "to save time" — the security item is the whole point.

---

## 12. Edge Case Register

Each must be resolved by an explicit, tested decision — not left to chance.

| # | Edge case | Phase |
|---|---|:--:|
| EC-1 | Renderer returns `200` with an HTML error body (classic API Gateway failure) → magic-byte check rejects it; nothing is stored | 1 |
| EC-2 | Renderer times out after having actually rendered → our retry produces a second render; idempotency + deterministic key make it harmless, and only one artifact exists | 1 |
| EC-3 | Renderer `400` (our template or data is wrong) → `500 PDF_TEMPLATE_INVALID`, never retried, logged with code+version but never with `data` | 1 |
| EC-4 | `PDF_RENDERER_BASE_URL` unset → `503 PDF_RENDERER_NOT_CONFIGURED`; payroll `pdfkit` paths keep working untouched | 1 |
| EC-5 | A template placeholder is misspelled → Handlebars silently renders an empty string → caught by the lint (declared-vs-used) **and** by the runtime required-field assertion | 1 |
| EC-6 | A tenant value contains `<script>` or `</style>` → double-stash escaping plus the triple-stash ban; asserted by a test that feeds hostile strings into every field | 1 |
| EC-7 | `accent_color_hex` set to a CSS-breaking string → strict regex at validation; it is interpolated into a stylesheet | 1 |
| EC-8 | Logo uploaded as SVG → rejected; SVG executes script inside Chromium | 1 |
| EC-9 | Logo is a 4 MB photo → size and dimension caps at upload; presigned URL rather than inlining above 64 KB | 1 |
| EC-10 | Logo presigned URL expires mid-render (cold start + slow fetch) → TTL is 300 s against a 20 s budget; on failure the template renders without the logo rather than failing, and the artifact records `asset_degraded` | 1 |
| EC-11 | Renderer cannot reach S3 at all (network policy) → blank logo, valid PDF; detected by the preview before any issuance | 1 |
| EC-12 | Template exceeds 512 KB after an edit → lint fails the build at 256 KB, long before the service would reject it | 1 |
| EC-13 | Two HR users save branding simultaneously → last-write-wins on a singleton row under `FOR UPDATE`; both writes audited | 1 |
| EC-14 | Branding changes **after** letters were issued → issued PDFs are unaffected (**D-5**); the frozen `input_snapshot` explains every historical letter | 2 |
| EC-15 | A template version is bumped while an org has a letter half-configured → `pinned_version` (or the registry's current) is resolved **once** at issue and recorded on the artifact | 2 |
| EC-16 | Two concurrent issues with the same idempotency key → `UNIQUE (org_id, idempotency_key)`; the loser reads the winner's row and returns it | 2 |
| EC-17 | Two concurrent issues **without** a key, for the same subject and template → the derived key is identical, so the same guard applies; a genuinely intended second copy must pass an explicit distinct key | 2 |
| EC-18 | Reference sequence contention under bulk → `FOR UPDATE` on one row per `(org, template, FY)`; gaps are accepted and documented (**D-20**) | 2 |
| EC-19 | Artifact row `ready` but the S3 object is gone → re-render, compare `content_hash`; equal ⇒ repair silently, different ⇒ hard error and alert, never a silent substitution | 2 |
| EC-20 | Crash between the S3 write and the commit → `pending` artifact plus a possibly-orphaned object; the sweeper flips it to `failed` and deletes the object; the deterministic key means a retry overwrites rather than duplicating | 2 |
| EC-21 | Renderer succeeds but S3 is down → `503`, no DB row advanced, no number consumed, retry-safe | 2 |
| EC-22 | Letter issued for an employee soft-deleted mid-flight → subject re-checked inside the issuing transaction; issuance fails with the uniform `404` | 2 |
| EC-23 | Letter type deactivated between config and issue → `409 DOCUMENT_TYPE_INACTIVE`, checked at issue, not only at configure | 2 |
| EC-24 | A compensation-bearing letter for an employee with no salary structure → `422` naming the missing facts; never a letter printing `₹0.00` | 2 |
| EC-25 | Employee name contains RTL, emoji or combining characters → the font subset must cover it or the glyph boxes; asserted with a hostile-name fixture | 2 |
| EC-26 | A very long address or 40-character designation overflows the letterhead → CSS clamps and a fixture test; never silent truncation of a legal value | 2 |
| EC-27 | A letter's content pushes the signature block onto page 2 alone → `page-break-inside: avoid` on the block, asserted by a long-content fixture | 2 |
| EC-28 | Generated letter is file-replaced through the upload handshake → `409 DOCUMENT_ORIGIN_GENERATED` on both `issueFileUrl` and `confirmFile` | 2 |
| EC-29 | Payslip re-rendered after the employee's department changes → impossible: the builder reads only the frozen snapshot | 3 |
| EC-30 | Payslip published but never downloaded → warm-up still renders it; the cache purge later reclaims the object and the row records it | 3 |
| EC-31 | Bulk ZIP with 500 cache misses → over threshold ⇒ `202` + batch; under ⇒ inline renders bounded by the concurrency cap; never a silently short archive | 3 |
| EC-32 | Renderer degraded during a ZIP stream after bytes were written → the existing `streamChunks` mid-stream contract applies: the ledger records the failure and the connection is destroyed rather than emitting a corrupt-but-complete ZIP | 3 |
| EC-33 | Worker instance dies holding claims → stale claims reclaimed after `pdf_render_claim_timeout`; `attempts` still increments so a poison job cannot loop forever | 3 |
| EC-34 | Poison job (a snapshot that always fails to render) → attempt cap → `failed` with a reason, alertable, and it never blocks the queue | 3 |
| EC-35 | Org switches engine mid-month → artifacts record their `engine`; payslips already cached under `pdfkit` are served as they are, new ones render as HTML; no mixed document is ever produced | 3 |
| EC-36 | Migration run while payslips are being downloaded → all schema changes are additive; the `pdfkit` default means behaviour is unchanged until an org opts in | 3 |
| EC-37 | Bulk issuance where one subject is invalid → whole batch rejected at validation, before a single render is spent | 4 |
| EC-38 | Bulk batch re-submitted after a partial failure → `UNIQUE (org_id, source_type, source_id, batch_id)`; only the unfinished subjects run | 4 |
| EC-39 | Offboarding hook fires twice → idempotent on `(employee, exit, template)`; exactly one relieving letter | 4 |
| EC-40 | Manager proposal approved after the subject stops reporting to the proposer → scope re-checked at approval; blocked | 4 |
| EC-41 | Notification send fails after issuance → retried by the drain cron; **never** rolls back or hides the letter | 4 |
| EC-42 | Retention purge of a letter under an open acknowledgement obligation → excluded unconditionally (**D-23**) | 5 |
| EC-43 | Object delete fails during purge → the row is kept for the next pass; an object is never orphaned behind a dead pointer | 5 |
| EC-44 | Renderer API key rotated → config-only change; in-flight renders fail with `renderer_auth` and are retried by the worker after the redeploy | 5 |
| EC-45 | Preview endpoint abused as a free PDF service → per-org rate limit plus the existing auth and feature gates; previews are `cache`-class and purged aggressively | 5 |
| EC-46 | A tenant's letter is served to another tenant from cache → structurally impossible: `org_id` is in the idempotency key, the storage key and every predicate. Asserted by an explicit cross-tenant test | 1 |

---

## 13. Org Settings To Register

Add to `public/md_settings/org_settings_registry.md` as a new `## PDF Generation` section, continuing that file's numbering and using its exact field structure (Configuration Level, Data Type, Default Value, Enforcement Point, Deep Explanation, Applicable (ON), Not-Applicable (OFF)). Register each **in the phase that introduces it**.

| Setting | Stored in | Default | Phase |
|---|---|---|:--:|
| `letter_branding_enabled` — print the letterhead block | `document_settings` | `true` | 1 |
| `letter_preview_rate_per_hour` | `document_settings` | `60` | 1 |
| `letter_reference_pattern` — org-wide default (**D-20**) | `document_settings` | `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}` | 2 |
| `letter_default_confidential` — letters printing compensation | `document_settings` | `true` | 2 |
| `letter_requires_acknowledgement_default` | `document_settings` | inherit from type | 2 |
| `pdf_render_engine` — `pdfkit` \| `html` (**D-8**) | `payroll_settings` | `pdfkit` | 3 |
| `payslip_prerender_on_publish` — warm the cache at publish | `payroll_settings` | `true` | 3 |
| `pdf_bulk_inline_miss_threshold` — misses tolerated inside a ZIP before `202` | `payroll_settings` | `50` | 3 |
| `pdf_cache_retention_days` (**D-23**) | `payroll_settings` | `400` | 3 |
| `letter_bulk_max_subjects` | `document_settings` | `500` | 4 |
| `letter_auto_issue_on_exit` — which templates, if any | `document_settings` | `[]` (off) | 4 |
| `manager_can_propose_letters` (**maker–checker**) | `document_settings` | `false` | 4 |
| `letter_record_retention_days` — `record`-class artifacts | `document_settings` | inherit `document_retention_days` | 5 |

---

## 14. Testing & Verification Requirements

**Runner.** `node --test`; `npm test` runs `tests/unit/**/*.test.js` (158 files today). New tests in `tests/unit/pdf/` (transport, templates, view-models) and `tests/unit/document/` (letter service rules). **DB-free**, following the payroll and document convention.

**The renderer is stubbed, always.** The provider takes its `fetch` implementation by injection so every test drives it without a network. **No test in `tests/unit/**` may make a real HTTP call.** One manual, documented end-to-end check against the live Lambda is performed once per phase and recorded in that phase's completion note — it is evidence, not a test.

**Mandatory unit coverage** (every item below is a pure function or a stubbed boundary by design):

1. **Transport** — retry/no-retry per status class; timeout; malformed base64; non-PDF body; oversized request; oversized response; unconfigured base URL; API key absent from every error path and log line; `https` enforcement outside development.
2. **Template lint** — all eight authoring rules of §6.4, run over every file in both registries. This test fails the build, not a review.
3. **View-models** — golden fixtures per template; hostile inputs (script tags, RTL, emoji, 300-character names, empty optionals); fixed-clock assertions proving no builder reads the clock; `formatMoney` parity with the PDFKit output across negative, zero, fractional and > 1 crore values.
4. **Merge precedence** (§7.2) — overrides beat saved fields beat branding beat DB facts beat template defaults; `department_id` used, never the free-text column; exit dates from `employee_exits`.
5. **Idempotency & concurrency** — repeated issue returns one letter; derived vs explicit keys; reference allocation cannot duplicate; job claim exclusivity; stale-claim reclaim; attempt caps.
6. **Failure ordering** — renderer failure leaves no artifact `ready`, no number consumed, no `org_documents` row; S3 failure after render leaves a `pending` artifact the sweeper resolves; commit failure after an S3 write is recoverable and non-duplicating.
7. **Authorization** — the uniform-denial matrix of §9.3, including cross-org and cross-tenant cache isolation (**EC-46**).
8. **Payroll parity** (P3) — field-level equality between engines over the full payslip fixture set, plus the annual statement and Form 16 sets before each is switched.
9. **ZIP integrity** (P3) — entry count, entry order, per-entry size, and one-buffer-live memory behaviour with a mixed hit/miss cohort.
10. **Regression gate** — the entire pre-existing suite passes unchanged after the S3 provider and `pdf_layout.utils` changes. This is checked in **every** phase, not only P1.

**Verification discipline.** No phase is "done" on the strength of a code read. Each phase's completion note states the test count before and after, the commands run, and the one manual end-to-end check with its result.

---

## 15. Open Decisions — Needed Before the Relevant Phase

| # | Decision | Needed by | Recommendation |
|---|---|:--:|---|
| **OD-1** | The renderer's deployed URL, and whether we may add an API-key check to the handler | **P1** | Operator to supply the URL; add the key before any deployed environment carries real data (**D-14**) |
| **OD-2** | Do we own the renderer's repository (may we change its code), or is it fixed? | **P1** | If we own it, add auth, a `renderer_version` in the response, and a `/health` endpoint — all three are cheap and all three are used by this plan |
| **OD-3** | Which of the ten letter types are actually wanted, and in what order | **P2** | Start with experience, relieving, appointment, confirmation — the four an HR team issues weekly |
| **OD-4** | Reference-number format, and whether the financial year is April–March for every tenant | **P2** | Pattern configurable, FY from the org's existing payroll FY setting rather than a new knob |
| **OD-5** | Does a generated letter require employee acknowledgement by default? | **P2** | Inherit from the document type; default ON for policy-like letters, OFF for certificates |
| **OD-6** | Is a letter visible to the employee's manager? | **P2** | Follow the type's confidentiality; compensation-bearing letters confidential ⇒ HR-only |
| **OD-7** | Parity definition for payslips: field-level or pixel-level? | **P3** | Field-level. Pixel parity between PDFKit and Chromium is unachievable and not what correctness means here |
| **OD-8** | How long before PDFKit is removed | **P3 → P5** | Not before one full financial year of HTML payslips; revisit with data, not a calendar |
| **OD-9** | Does the Lambda have a concurrency reservation, and what is our share? | **P3** | Needed before bulk; the worker's concurrency cap must be set from a real number |
| **OD-10** | Where does the Lambda run relative to our S3 bucket (region, account)? | **P3** | Same region at minimum: it affects asset-fetch latency inside the 10 s render budget and the data-residency story |
| **OD-11** | Should managers be able to propose letters at all | **P4** | Yes, behind `manager_can_propose_letters`, default OFF — consistent with how this product treats managers elsewhere |
| **OD-12** | Data-processing posture: does employee PII leaving our process for the renderer need a contractual or policy record? | **P5** | Treat it as a sub-processor boundary even when it is our own account; document it once |

---

## Amendment — Phase 4 shipped (2026-09-29)

Phase 4 (bulk issuance, manager maker-checker, auto-issue on exit) is code-complete and documented. This amendment records what changed relative to the sections above; the authoritative detail is in `phases/phase4_implementation_plan.md`, `phases/phase4_api_analysis.md` and `phases/phase4_business_walkthrough.md`.

- **§9.1 (New endpoints — Document plane):** Documents API high-water moves **#142 → #150**. Added `#143`/`#144` (bulk create/progress), `#147` (letter render-queue drain), `#148`/`#149`/`#150` (HR proposal queue/approve/reject) on the HR plane, and `#145`/`#146` (manager propose/list) on a **new** `/api/v1/documents/manager` mount. `#139` gained internal-only optional params (`documentId`, `orgContext`, `systemOrigin`) with **no wire change**. Full RBAC/error detail: `phase4_api_analysis.md`; house registry: `public/md_system/api_registry.md`.
- **Citation rule (added 2026-09-29):** completion reports are **not** durable in this repository — `phase1`/`phase2`/`phase4` reports were never committed and `phase3_completion_report.md` was added in `34296ec` and deleted in the next commit, `3fefb72`. Two citations above pointed at `phase4_completion_report.md`, which has never existed; they now point at the implementation plan. **Never cite a completion report as authority.** The durable record is the phase implementation plan, the `public/md_updates/` change record and the registries — all of which are in `HEAD`.

- **§11 (Phases):** P4 requirements 12 (bulk), 13 (auto-issue), 14 (maker-checker) are delivered. **F-9 (printing the reference number on the PDF face, OD-P2-1/DV-8) is deferred** as the plan's own severable item — dropping it leaves Phase 4 complete against §11's P4 scope. See `phase4_implementation_plan.md` §30.1 and §1.5 DV-8.
- **§12 (Edge Case Register):** Auto-issue edge cases wired — empty setting reads nothing beyond settings (BR-A1); no-attributable-actor exit is skipped (R-2); `404` breaks the exit's remaining templates (BR-A7); `409`/`503` skip-and-continue; window saturation warns. Bulk all-or-nothing enqueue; per-item idempotency via salted keyBase; recomputed terminal batch status resists late ticks.
- **§13 (Org Settings To Register):** Org-settings high-water moves **#90 → #94**. Added `letter_bulk_max_subjects` (#91, default **200** per R-6, DB CHECK ≤ 2000 — note §25.1 prose's "500" is superseded), `letter_auto_issue_on_exit` (#92, `[]`, ≤ 5 non-compensation-bearing codes), `manager_can_propose_letters` (#93, off), `document_notify_letter_issued` (#94, off, OD-P4-9). Registered in `public/md_settings/org_settings_registry.md`.
- **Migration:** committed as **`00059-create-letter-batches-and-proposals.js`** (the plan's "00058" was taken) + seeder `011`, both handed back **UNRUN**.

---

## Amendment — Phase 5 shipped (2026-09-29)

Phase 5 (renderer authentication, `record`-class retention purge, bulk rate limiting, observability) is code-complete and documented. Authoritative detail: `phases/phase5_implementation_plan.md`, `phases/phase5_api_analysis.md`, `phases/phase5_business_walkthrough.md`. The durable closures below also appear in `public/md_updates/pdf_generation_phase5_2026_09_29.md` and the registries — per the C-5 citation rule above, the completion report is **not** authoritative for any of them.

- **§9.1 (New endpoints):** Documents API high-water moves **#150 → #151** (`GET /api/v1/documents/hr/jobs/pdf-render/health`); Payroll high-water reaches **#221** (`GET /api/v1/payroll/hr/jobs/payslip-render/health`). Both are `hr`-only, read-only queue-health readouts with a server-fixed `source_type` (C-2). `#143` (bulk create) gains a `429 LETTER_BULK_RATE_EXCEEDED` + `Retry-After` — the only contract change to a pre-existing endpoint. Detail: `phase5_api_analysis.md`; registry: `public/md_system/api_registry.md`.
- **§11 (Phases) — P5, reconciled:** Several P5 bullets had already shipped in earlier phases and required no code (DV-1: `record`-class purge is a *new pass on the existing `document_sweeper`*, not a new cron — `cache` shipped in P3; DV-2: preview rate limiting shipped in P1, F-6 reuses the primitive and `checkPreviewRate` becomes a wrapper; DV-3: template version pinning shipped in P1). New in P5: **F-1** renderer `x-api-key` auth (dual-key, constant-time, fail-closed `503` — the D-14 release blocker, renderer code complete, deploy is an ops gate), **F-2** `x-renderer-version` + `/health`, **F-3** `record`-class letter retention purge, **F-4** branding-asset quarantine, **F-5** observability (`pdf.render` line, counters, `#151`/`#221`), **F-6** bulk rate limit. **F-7** (performance numbers) and **F-8** (runbooks) authored; F-7 numbers are an ops gate. **F-9** (reference number on the PDF face) remains deferred (OD-P5-7).
- **§12 (Edge Case Register) — EC-42…EC-45 discharged:** EC-42 (open acknowledgement obligation ⇒ letter never purged, any age) in `hasOpenObligation` re-asserted in `_sweepLetterRetention`; EC-43 (object-before-row; a failed `deleteObject` keeps the row, `StorageUnavailableError` aborts the org pass and others continue) in the per-candidate sequence; EC-44 (key rotation window ⇒ zero failed renders) in the renderer's dual-key acceptance + the rotation runbook; EC-45 (a purged tombstone must not re-alarm the 04:00 EC-19 verifier) via the 03:45-before-04:00 ordering and the `status='ready'` exclusion (§13.5).
- **§13 (Org Settings) — high-water #94 → #96:** Added `letter_record_retention_days` (**#95**, INTEGER nullable, `NULL` inherits `document_retention_days`=2555, DB CHECK `>= 365` when set — lowering it makes older soft-deleted letters purge candidates on the next nightly run, irreversible) and `letter_bulk_rate_per_hour` (**#96**, INTEGER NOT NULL DEFAULT 10, CHECK 1–500). Registered in `public/md_settings/org_settings_registry.md`.
- **§15 (Open Decisions) — closed by P5:** **OD-1** (renderer auth design) closed by F-1's dual-key scheme; **OD-2** (renderer repo is ours to change) confirmed yes; **OD-8** (PDFKit removal) closed as *decision recorded, no code* — not before one full financial year; **OD-12** (data-processing posture) closed by treating the renderer as a sub-processor boundary and documenting it once. **OD-P3-6** and **OD-P4-8** are likewise closed in the `md_updates` record. Carried open: OD-P5-1 (IAM/private-endpoint transport), OD-P5-3/OD-P5-6/OD-P5-7.
- **Migration:** committed as **`00060-add-pdf-retention-and-rate-limits.js`**, handed back **UNRUN** (partly non-atomic `up()`: three columns + three CHECKs in one transaction, then the queue-health index `CONCURRENTLY` outside it; `down()` lossy for `superseded_asset_keys` only). Verbatim hand-back note in `phases/phase5_completion_report.md` §5.
- **Ops gates (not code), before §27.1 can be ticked:** `PDF_RENDERER_API_KEY` set in every deployed environment (both sides); API Gateway usage plan (throttle + quota, D-14); renderer deployed with auth; migration `00060` run; one `dryRun` sweep per environment before the purge is trusted; §24 performance numbers on a live env.

---

*End of plan. Amend, date, and keep it true.*
