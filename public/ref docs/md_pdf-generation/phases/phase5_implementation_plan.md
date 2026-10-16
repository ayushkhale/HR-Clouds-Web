# PDF Generation Module — Phase 5 Implementation Plan

**STATUS:** Not started. Phases 1, 2, 3 and 4 are implemented and verified on disk.

**DATE:** 2026-09-29

**SCOPE:** Make the module safe to leave running — renderer authentication (the release blocker),
`record`-class retention and purge, observability, bulk rate limiting, measured performance, and the
operational documentation that lets someone who did not build it run it.

**AUTHORITY:** This document is the **Source of Truth for PDF Generation Module Phase 5**. Where it
disagrees with `public/md_pdf-generation/implementation_plan.md` (the main plan), §5 states the
contradiction and the resolution; the resolution is binding.

**PHASE 5 CLOSES THE MODULE.** There is no Phase 6 in the main plan. Anything not built here and not
explicitly deferred with an owner in §30 is work that will never happen. §3.6 lists what is being
deliberately left undone, so that decision is a decision and not an accident.

---

## 0. Document Control

### 0.1 Reference documents reviewed

| Document | What it contributed |
|---|---|
| `public/md_pdf-generation/implementation_plan.md` (1013 lines, incl. the 2026-09-29 Phase 4 amendment) | §11 Phase 5 = the starting scope; **D-14**, **D-23**, §10, §12 (EC-42…EC-45), §13, §15 constrain it |
| `phases/phase1_implementation_plan.md` (1881 lines) | Renderer transport, `putObject`/`getObject`, artifact table, branding, preview, the lint. §20 defers the cache purger **and asset orphan reclamation** to Phase 5 |
| `phases/phase2_implementation_plan.md` (2222 lines) | Issuance, reference numbering, reissue, `origin` guards, sweeper. §1.3 defers `cache`-class purge and the retention sweeper to Phase 5 |
| `phases/phase3_implementation_plan.md` (1768 lines) | Payroll migration, queue, worker, **`cache`-class purge (built)**. §1.3 and §12.1 keep `record`-class retention + the acknowledgement exclusion in Phase 5 |
| `phases/phase4_implementation_plan.md` (2890 lines) | Bulk, auto-issue, maker–checker. §1.3 defers D-14, `record` retention, bulk rate limiting, observability and performance measurement to Phase 5 |
| `phases/phase{1,2,3,4}_api_analysis.md`, `phase{1,2,3,4}_business_walkthrough.md` | Contract shape and terminology |
| `public/md_payrolls/phases/phase{2,3}_implementation_plan.md`, `public/md_leave/md_phases/phase{2,3}_implementation_plan.md` | Planning methodology — feature chains, traceability tables, deviation registers, acceptance criteria |
| `public/md_system/api_registry.md`, `public/md_settings/org_settings_registry.md`, `public/md_system/background-jobs.md`, `public/md_system/database.md` | High-water marks, verified below |
| `C:\Users\91930\Desktop\Vs_Code\pdf-generation` (`src/handler.js`, `src/config/constants.js`) | The renderer's **actual** current state, read 2026-09-29 |

### 0.2 Verified repository baseline — read 2026-09-29, not inferred from documentation

| Fact | Value | Evidence |
|---|---|---|
| Migration high-water | **`00059-create-letter-batches-and-proposals.js`**; `00060` free | `ls migrations/` (note `00058` is an unrelated comp-off migration) |
| Seeder high-water | **`011-seed-remaining-letter-types.js`**; `012` free | `ls seeders/` |
| Documents API high-water | **#150** | `api_registry.md` |
| Payroll API high-water | **#220** | `api_registry.md` |
| Org settings high-water | **#94** (`document_notify_letter_issued`) | `org_settings_registry.md` |
| Letter templates on disk | **nine** `v1.html` + `_branding_probe`; **zero** `v2` | `ls letter-templates/` |
| Payroll templates on disk | `payslip/v1.html`, `annual_statement/v1.html`, `form16_part_b/v1.html` | `ls pdf-templates/` |
| PDF crons | `pdf_render_worker` (*/15), `pdf_artifact_sweeper` (04:00), `pdf_cache_purge` (04:15), `document_offboarding_archiver` (02:30) | `ls cron-jobs/` |
| Renderer handler auth | **NONE** | `pdf-generation/src/handler.js` — no header read of any kind |
| Renderer `/health` | **absent** | same |
| Renderer version header | **never emitted** | same; HRMS reads `x-renderer-version` and always gets `null` |
| Structured render log line | **absent** | `pdf_render.service.js` has exactly one `console.*`, an error path |
| Metrics / counters | **none anywhere in the repo** | no `prom-client`, no counter module |
| `record`-class retention purge | **absent** | `document_automation._sweepRetention` operates on `employee_document.repository` only |
| Branding asset orphan reclamation | **absent** | `document_letter_branding.service.js:333` records the old key in audit, never deletes the object |
| Bulk rate limiting | **absent** | only `letter_bulk_max_subjects` (#91), a size cap, not a rate |

**Test baseline, measured, not asserted.** `PostGre_DATABASE_URL=<dummy> npm test` →
**2397 tests, 2397 pass, 0 fail**, duration ~40 s. **211** test files under `tests/unit/`, **45**
under `tests/unit/pdf/`. Phase 5's regression gate is **2397 passing, zero failing**, plus its own
new tests.

That baseline moved from 2393 to 2397 on 2026-09-29, when the C-1, C-4 and C-5 fixes below were
applied ahead of the build (§5.1). Four tests were added: three pinning the retention-purge FK guard
and one pinning the seeder↔template bijection. (The five Razorpay environment failures recorded in the Phase 4 plan's §0.2 no longer
occur; the baseline is now clean and Phase 5 holds it clean.)

### 0.3 What Phase 5 delivers

1. **Renderer authentication end to end** — the module's release blocker (**D-14**, F-1).
2. Renderer `x-renderer-version` and `/health`, closing a gap carried openly since Phase 1 (F-2).
3. **`record`-class retention and purge** with the acknowledgement exclusion (**D-23**, EC-42, EC-43, F-3).
4. Branding asset orphan reclamation (F-4, severable).
5. **Observability** — one structured line per render, in-process counters, and a DB-derived queue
   health readout on both planes (F-5, `#151` + `#221`).
6. **Bulk issuance rate limiting** (F-6, setting `#96`).
7. **Measured** performance against §10's targets (F-7).
8. Operational runbooks: renderer-outage disaster path, key rotation, purge (F-8).
9. Eight open decisions closed, three deliberately left open with named owners (§30).
10. Registries, completion report, `md_updates` record, and a correction to the main plan's
    Phase 4 amendment, which cites a file that does not exist (F-10).

---

## 1. Goal & Boundary

### 1.1 Goal

The renderer rejects a request that does not carry our key. A letter that has outlived its retention
leaves both the database and the bucket, in that order, unless someone still owes an acknowledgement
on it. When the renderer degrades, an operator sees it on a readout rather than by reading logs, and
knows from a written runbook what to do. Every number in §10's performance targets has been measured
on real volumes and written down. Nothing an org has already enabled changes behaviour.

### 1.2 Explicitly in scope

| # | Item | Artefact |
|:--:|---|---|
| 1 | `x-api-key` validation in the renderer handler, fail-closed, with a rotation window | `pdf-generation/src/handler.js` (+ `middleware/auth.js`) |
| 2 | `x-renderer-version` response header; `GET /health` | same repo |
| 3 | HRMS-side auth assertions + `renderer_auth` alerting path | `pdf-renderer.provider.js` (assertions only — the code already sends the key) |
| 4 | `record`-class retention purge pass, ordered child-first, chain newest-first | `document_automation.runSweeper` Pass 3 |
| 5 | Org setting `#95 letter_record_retention_days` | `document_settings` + migration `00060` |
| 6 | Superseded branding-asset reclamation | `document_letter_branding` + the document sweeper |
| 7 | `pdf.render` structured log line at the single choke point | `pdf_render.service.js` |
| 8 | In-process counter utility, zero dependencies | `src/common/utilities/pdf_metrics.utils.js` |
| 9 | Queue-health readouts | `#151` (documents), `#221` (payroll) |
| 10 | Bulk rate limit + org setting `#96 letter_bulk_rate_per_hour` | `document_letter_batch.service` + migration `00060` |
| 11 | Generalised org rate limiter, `checkPreviewRate` preserved as a wrapper | `src/common/utilities/org_rate_limit.utils.js` |
| 12 | Migration `00060` — two settings columns, one branding column | authored, **not run** |
| 13 | Performance measurement report with real numbers | `phase5_performance_report.md` |
| 14 | Three runbooks | `public/md_system/runbooks/` |

### 1.3 Explicitly NOT in scope — do not build here

| Excluded | Disposition | Why not |
|---|---|---|
| IAM SigV4 / private VPC endpoint for the renderer | **Recommended follow-on, ops-owned (OD-P5-1)** | **D-14**'s *minimum* is the API key + usage plan + https, and that is what closes the release blocker. The provider is already written so the transport swaps in one file; doing it now would couple a code phase to an infrastructure migration with a different owner and a different rollback. |
| Removing PDFKit | **Never in Phase 5** | **OD-8**: not before one full financial year of HTML payslips. Phase 5 *records the decision*; it deletes nothing. The `pdfkit` default is also the disaster path (F-8), so removing it would remove the fallback this phase documents. |
| Per-org template **variant** selection surface | **Dropped (OD-P5-6)** | Main plan §11 says "if it is still wanted". It is not. `document_letter_configs.pinned_version` (shipped in Phase 1) already gives an org version control, and no requirement anywhere asks for two *variants* of one version. Building a selection surface for a set with one member is speculative. |
| Printing the reference number on the PDF (**F-9 / OD-P2-1 / DV-8**) | **Severable; recommended OUT (OD-P5-7)** | Phase 4's amendment deferred it. It is a *feature*, not hardening, and its mechanism moves reference allocation **before** the render, which changes the issuance transaction's failure semantics (§16.4 of the Phase 4 plan) — precisely the thing a hardening phase must not destabilise. §30.2 carries it with a recommendation. |
| `offer_letter`, `promotion_letter`, `salary_revision_letter` templates | **Severable; see §5 C-4** | Not Phase 5 scope, but Phase 5 must resolve the **dead catalog rows** seeder `010` would otherwise create for them. |
| `transfer_letter` | **Not planned** | Unchanged from Phase 4 §1.3. |
| Report-family templates (`#177`–`#180`) | **OD-P3-5, unowned** | Never in any phase's template list. |
| An external metrics backend (Prometheus, StatsD, CloudWatch EMF) | **Not in Phase 5** | **D-19** zero new dependencies. §20.3 states the honest limitation of in-process counters and specifies the DB-derived readout that does *not* have it. |
| Changing any existing endpoint's request or response contract | **Never** | §26 is the guarantee. Phase 5 adds two endpoints and mutates no contract. |
| An `admin` / `super-admin` plane of any kind | **Never** | Documents D-10; the role-planes rule. Queue health is tenant data. |
| Re-cacheability of a `purged` payslip source (EC-P3-6) | **Decided: no change (OD-P3-6 closed)** | §30.1. Requires a `00055` index change with no usage data to justify it. |

### 1.4 Honesty guard — five stated gaps, not hidden ones

1. **In-process counters reset on every deploy and are per-instance.** With more than one app
   instance, `#151`'s `counters` block describes *the instance that answered the request*, not the
   fleet. This is why the **queue-health numbers in the same response are computed from the
   database**, which is fleet-wide and survives restarts. The counters are a debugging aid; the DB
   figures are the signal. Stated in the response payload itself (§10.3) so no operator is misled.
2. **Phase 5 cannot prove the renderer rejects an unauthenticated request from a unit test.** No
   test in `tests/unit/**` may make a real HTTP call (main plan §14). The renderer's own suite
   (`pdf-generation/test/`) proves the handler logic; the end-to-end proof is the manual check of
   §24.6, recorded as evidence. This is the same discipline every prior phase used, and it is the
   reason item 1 of §27 is a *manual* gate.
3. **Performance targets are measured where real data exists.** If the pilot org has no
   1 000-payslip run, the ZIP target is measured against the largest run that exists and the report
   says so, with the extrapolation shown. A target recorded as "not measurable at current volume" is
   an honest result; a target recorded as "met" on a 12-payslip run is not.
4. **The retention purge is irreversible and runs unattended.** Mitigations are specified (§13.2:
   opt-in by a NULL-defaulted setting, a dry-run mode, a bounded batch, object-before-row ordering,
   the acknowledgement exclusion re-asserted in the loop). The residual risk is a misconfigured
   `letter_record_retention_days`, and the DB CHECK floor of 365 days is what bounds it.
5. **Reclaiming a superseded branding asset deletes an object that a 300-second presigned URL may
   still name.** The one-hour quarantine (§8.4) is twelve times the TTL, which makes it safe rather
   than *provably* safe. A render that somehow outlives the quarantine degrades to a letterhead with
   no logo (EC-10's existing behaviour), not to a failure.

### 1.5 Deviations from the main plan — stated, not silent

| # | Main plan says | Phase 5 does | Why |
|:--:|---|---|---|
| DV-1 | §11 P5: "Retention and purge for **both** classes (D-23)" | `record` class only | `cache`-class purge shipped in **Phase 3** (`pdf_cache_purge.cron.js`). Phase 3 §12.1 recorded this split and the main plan was never amended. Re-planning it would be duplicate work on shipped, tested code. |
| DV-2 | §11 P5: "Rate limiting on preview **and** on bulk issuance" | Bulk only | Preview rate limiting shipped in **Phase 1** (`checkPreviewRate`, setting `#83`). Phase 5 *generalises* the limiter so bulk can reuse it, with `checkPreviewRate` preserved as a behaviour-identical wrapper. |
| DV-3 | §11 P5: "Template version pinning" | Nothing to build | `document_letter_configs.pinned_version` shipped in **Phase 1** and is resolved once at issue (EC-15). Phase 5 adds a regression assertion, not a feature. |
| DV-4 | §13: `letter_record_retention_days` "inherit `document_retention_days`" | Column is `INTEGER NULL`, NULL meaning inherit, with a CHECK of `>= 365` when set | A non-null default would make every org opt **in** to a destructive sweep at migration time. NULL-means-inherit also matches how `document_letter_configs.requires_acknowledgement` already expresses inheritance in this module. §13.2. |
| DV-5 | **D-23**: the purge "deletes the object **before** clearing the pointer, keeping the row on failure" | Adds a **child-row deletion order** the main plan never addresses, and purges a supersede-chain **newest-first** | Verified: every FK into `org_documents` is `onDelete: 'RESTRICT'` (`org_document_recipients`, `document_acknowledgements`, `document_signature_requests`, and `org_documents.supersedes_id` itself). A naive hard-delete raises a foreign-key violation and aborts the pass. §5 C-1. |
| DV-6 | §11 P5: "a failure-rate signal on `pdf_render_jobs`" | Two endpoints, one per plane (`#151` documents, `#221` payroll) | The jobs table is shared and scoped by `source_type` (Phase 4's C-10). One cross-domain endpoint would either leak payroll queue state onto the documents plane or need a domain argument. The split mirrors the existing `#147`/`#219` drain pair exactly. |
| DV-7 | §12 EC-44: a rotated key makes "in-flight renders fail with `renderer_auth`, retried by the worker after the redeploy" | The renderer accepts a **previous** key for a rotation window, so rotation costs zero failed renders | Accepting two keys is four lines in the handler and removes a self-inflicted outage from a routine operation. The main plan's version is the fallback behaviour if the window is not used, not a requirement to fail. §8.1. |

---

## 2. Pre-Flight Checks — before writing any code

Run these and record the answers in the completion report. Each is a one-line command; each would
invalidate a design decision below if it came back different.

| # | Check | Expected | If different |
|:--:|---|---|---|
| 1 | `ls src/infrastructure/postgres-sql/migrations/ \| tail -1` | `00059-…` | Renumber `00060` |
| 2 | `grep -c "api-key\|x-api-key" ../pdf-generation/src/handler.js` | `0` | Someone added auth; re-scope F-1 to verification only |
| 3 | `grep -n "PDF_RENDERER_API_KEY" .env*` on every deployed environment | present and non-empty | **Stop.** F-1 cannot be verified without it |
| 4 | `grep -rn "console\." src/common/services/pdf_render.service.js \| wc -l` | `1` | Re-read before adding F-5's line |
| 5 | `PostGre_DATABASE_URL=<dummy> npm test` | 2397 pass / 0 fail | Fix drift before starting |
| 6 | Confirm the renderer repo is **ours to change** (OD-2) | yes | **Stop.** F-1 and F-2 are both renderer-side |
| 7 | `grep -n "onDelete" migrations/000{50,51}*.js \| grep -c RESTRICT` | ≥ 4 | Re-derive the deletion order of §13.3 |
| 8 | Count `org_documents WHERE origin='generated' AND deleted_at IS NOT NULL` in the pilot DB | record it | Sizes the first purge run; a large number means run with `dry_run` first |

---

## 3. Completed vs Remaining — the reconstruction

This is the section the brief asks for: the main plan's Phase 5 line item by item, against what is
actually on disk.

### 3.1 Main plan §11 Phase 5, reconciled

| Main plan P5 bullet | Actual state | Phase 5 action |
|---|---|---|
| **Renderer authentication (D-14)** — API key end to end | **HRMS half DONE in P1**: `PDF_RENDERER_API_KEY` read, `x-api-key` sent (`provider.js:97`), `401/403 → renderer_auth` (`:132`), https enforced outside development (`config.js:31`). **Renderer half ABSENT**: `handler.js` reads no header. | **F-1** — renderer-side validation, rotation window, usage plan. The release blocker. |
| …plus the IAM/private-endpoint upgrade "if the operator agrees" | Not started | **Out of scope**, §1.3, carried as **OD-P5-1** |
| **Retention and purge for both classes (D-23)**, delete-object-before-clearing-pointer | `cache` class **DONE in P3** (`pdf_cache_purge.cron.js` → `payroll_automation.runCachePurge`, object-then-row, `record` excluded in SQL). `record` class **ABSENT** — `document_automation._sweepRetention` targets `employee_documents`, never `org_documents`. | **F-3** — `record` class only (DV-1) |
| **Observability**: structured render logs | **ABSENT** — one `console.error` in the whole render service | **F-5a** |
| …counters | **ABSENT** — no metrics code anywhere | **F-5b** |
| …a failure-rate signal on `pdf_render_jobs` | **ABSENT** | **F-5c**, `#151` + `#221` |
| **Rate limiting on preview** | **DONE in P1** — `checkPreviewRate`, Redis fixed-hour window, setting `#83`, applied at both `#134` and `#138` | **None.** Regression assertion only (DV-2) |
| …**and on bulk issuance** | **ABSENT** — `#91` caps batch *size*, not batch *rate* | **F-6** |
| **Performance measurement** against §10 targets on real data | Never done in any phase | **F-7** |
| **Documented disaster path** | Never written | **F-8** |
| **Template version pinning** | **DONE in P1** — `pinned_version`, resolved once at issue (EC-15) | **None** (DV-3) |
| …per-org variant-selection surface "if still wanted" | Never built | **Dropped**, OD-P5-6 |
| …the decision on PDFKit removal | Open (OD-8) | **Decision recorded**, no code (§30.1) |
| **Registry updates, completion report, final `md_updates`** | Not done | **F-10** |

### 3.2 Phase 5 requirements already discharged by earlier phases — do not re-plan

| Requirement | Shipped in | Evidence |
|---|---|---|
| Preview rate limiting + setting `#83` | Phase 1 | `document_letter_branding.service.js:477` |
| Template version pinning (`pinned_version`, EC-15) | Phase 1 | `document_letter_configs` |
| https-only renderer base URL | Phase 1 | `pdf-renderer.config.js:31` |
| `x-api-key` transmission and `renderer_auth` classification | Phase 1 | `pdf-renderer.provider.js:97,132` |
| Magic-byte / size / payload guards (EC-1, EC-3) | Phase 1 | provider |
| Stale-`pending` artifact sweeper (EC-20) | Phase 2 | `pdf_artifact_sweeper.cron.js` |
| `cache`-class purge, object-then-row, job reaping | Phase 3 | `pdf_cache_purge.cron.js` |
| EC-19 object-loss **detection** for `record` class | Phase 3 | `runArtifactVerification` + `findReadyRecordsForVerification` |
| Queue claim exclusivity, attempt caps, stale reclaim (EC-33, EC-34) | Phase 3 | `pdf_render_worker.service.js` |
| Source-type-scoped drains (EC-P4-1/2) | Phase 4 | C-10 |
| Batch size cap `#91`; engine-independent letter drain | Phase 4 | `document_letter_batch.service.js` |

### 3.3 Partially implemented — Phase 5 completes the other half

| Item | Half that shipped | Half that remains |
|---|---|---|
| **D-14 renderer auth** | HRMS sends the key and classifies the rejection | The renderer never checks it (**F-1**) |
| **D-16 determinism record** | `renderer_version` column, repository projection, provider header read, `#141` exposure | The renderer never emits the header, so it is always `NULL` (**F-2**) |
| **D-23 retention** | `cache` class | `record` class + EC-42 exclusion + EC-43 ordering (**F-3**) |
| **§10 observability** | `render_ms`, `size_bytes`, `attempt_count` **persisted** on the artifact; `pdf.record.object_missing` and `pdf.letter.reference_burned` log lines | No per-render log line, no counters, no readout (**F-5**) |
| **Rate limiting** | Preview, with a working Redis limiter to copy | Bulk; and the limiter needs generalising first (**F-6**) |
| **Asset lifecycle** | Upload, HeadObject verification, commit under lock, old key **audited** | Old object never **deleted** (**F-4**) |

### 3.4 Responsibilities that moved between phases

| Responsibility | Main plan said | Actually landed | Consequence for Phase 5 |
|---|---|---|---|
| `cache` purge cron | Phase 3 *and* Phase 5 (§11 contradicts itself) | Phase 3 | Phase 5 must not add a second purger. F-3 adds a **pass to the existing document sweeper**, not a new cron. |
| Preview rate limit | Phase 5 | Phase 1 | F-6 reuses, does not rebuild. |
| `#147` letter drain | Phase 3 | Phase 4 | `#151` sits beside it on the same router. |
| Object-loss detection | Phase 2 (OD-P2-2) | Phase 3 | F-3's purge must not re-alarm on rows it has just tombstoned — §13.5. |
| Auto-issue trigger | "on exit finalisation" | a daily sweep after the archive | F-3's purge must run **after** both, in the same daily ordering discipline — §19.2. |

### 3.5 Requirements dropped, with reasons

| Dropped | Reason |
|---|---|
| Per-org template variant selection | No requirement; `pinned_version` covers the real need (OD-P5-6) |
| A second purge cron for `record` class | The document sweeper already owns retention semantics, statutory exclusions and the object-then-row helper. A second cron would duplicate all three (§13.1) |
| A metrics exporter | **D-19**; the DB-derived readout meets the stated requirement ("visible without reading logs") without one |

### 3.6 What Phase 5 knowingly leaves undone

Recorded here so it is a decision. Each has an owner in §30.

1. **F-9 — the reference number on the PDF face.** `prints_reference: false` sits inert on four
   registry entries. Recommended out (OD-P5-7).
2. **Three letter templates** — `offer_letter`, `promotion_letter`, `salary_revision_letter`
   (OD-P5-3, and the §5 C-4 seeder consequence, which **must** be resolved even if the templates
   are not built).
3. **`transfer_letter`** — never planned.
4. **Report-family HTML migration** (`#177`–`#180`) — OD-P3-5, unowned.
5. **IAM/private-endpoint renderer transport** — OD-P5-1.
6. **PDFKit removal** — OD-8, deliberately not before one full financial year.

---

## 4. Phase 1 → 2 → 3 → 4 → 5 Dependency Analysis

| Phase 5 feature | Depends on | Extends, does not duplicate |
|---|---|---|
| **F-1** renderer auth | P1 `pdf-renderer.config.js` (`apiKey`), `provider.js` (`x-api-key`, `renderer_auth`) | Only the **renderer repo** changes on the HRMS side's behalf; the provider is already correct. HRMS changes are assertions and one alert path. |
| **F-2** version + health | P1 provider's `x-renderer-version` read (`:150`) | The read exists; only the emitter is missing. |
| **F-3** record retention | P2 `org_documents.origin='generated'` + `generation_artifact_id`; P1 artifact table (`status`, `object_purged_at`); P4 `document_letter_proposals` (`SET NULL`); the Documents module's `_deleteObjectThenRow`, `resolveRetentionDays`, `retentionCutoff`, statutory rule, `_forEachOrg`; **and the C-1 fix's `hasLiveSuccessor` / `deleteChildLinksFor` pair (§5.1)** | Adds **Pass 3** to `runSweeper`. Reuses the S3-failure semantics, the org loop, the audit shape and now the RESTRICT-ordering pattern verbatim. |
| **F-4** asset reclamation | P1 branding asset handshake + advisory lock at confirm | Adds one JSONB column and a quarantine drain inside the same sweeper pass; no new cron. |
| **F-5a** render log | P1/P2/P3 `pdf_render.service.renderAndRecord` — **D-24**'s single choke point | One log line at the one place every PDF in the system passes through. No caller changes. |
| **F-5b** counters | Nothing | New zero-dependency utility, incremented from the same choke point. |
| **F-5c** readouts | P3 `pdf_render_job.repository`; P4 `#147`/source-type scoping; P1 `document_letter.routes.js` | New repository **aggregate** methods; no change to claim/enqueue paths. |
| **F-6** bulk rate limit | P1 Redis limiter; P4 `document_letter_batch.service.create` | Limiter generalised; `checkPreviewRate` kept as a wrapper so P1's behaviour and tests are untouched. |
| **F-7** performance | Everything | Measurement only. No code. |
| **F-8** runbooks | P3 `pdf_render_engine` fallback; F-1's rotation window | Documentation only. |

**Ordering constraint.** F-1 and F-2 ship in **one renderer deploy**, and that deploy must land
before F-7's measurement (the auth check is on the latency path) and before the completion report can
claim the release blocker is closed.

---

## 5. Contradictions Found and Resolved

### 5.1 Three fixed before the build started (2026-09-29)

C-1, C-4 and C-5 were not left as plan text. Each was a defect in committed code or documentation
that Phase 5 would otherwise have had to work around, and each was cheapest to fix immediately:

| # | Severity | What was wrong | Fix | Proof |
|:--:|---|---|---|---|
| C-1 | **HIGH — live** | The shipped nightly retention sweep deleted an employee document's S3 object, then failed its hard delete on a RESTRICT foreign key: object destroyed, row orphaned, org's sweep wedged from that row on | Successor check moved ahead of the object delete; RESTRICT children cleared inside the transaction | 3 regression tests, each verified to fail against the pre-fix code |
| C-4 | HIGH — latent | Unrun seeder `010` would have created three templateless document types in every tenant | Three rows removed while the seeder is still unrun | Reverse-direction bijection test added; verified to catch a reintroduced orphan |
| C-5 | LOW | The main plan cited a completion report that has never existed | Citations repointed; citation rule recorded | `grep` returns no `phase4_completion_report` reference |

Suite after: **2397 passing, 0 failing** (2393 + 4 new). No behaviour visible to any API client
changed — see §26.

The remaining contradictions below are resolved **by this plan's design**, not by code already written.

### 5.2 Contradictions resolved by design

### C-1 — CRITICAL: every FK into `org_documents` is `RESTRICT`, so the purge D-23 describes cannot execute as written — and the same defect was already live on the employee plane

**Problem.** **D-23** and main plan §12 EC-43 describe the `record` purge as "delete the object, then
the row". Verified in the migrations:

| Child | Column | `onDelete` | Source |
|---|---|---|---|
| `org_document_recipients` | `org_document_id` | **RESTRICT** | `00050:259` |
| `document_acknowledgements` | `org_document_id` | **RESTRICT** | `00051:58` |
| `document_signature_requests` | `org_document_id` | **RESTRICT** | `00051:151` |
| `org_documents` (self) | `supersedes_id` | **RESTRICT** | `00050:60` |
| `document_letter_proposals` | `issued_document_id` | `SET NULL` | `00059:166` |

A `DELETE FROM org_documents` on a letter that was ever published raises
`foreign_key_violation` on the recipient row, which Phase 2 always materialises. The pass would abort
on its first candidate, every night, silently (the cron catches and logs).

**The same defect was already shipped on the employee plane — found and fixed 2026-09-29.** Checking
whether the root cause bit anything live turned up that it did. `employee_documents` has the
identical topology:

| Child | Column | `onDelete` | Source |
|---|---|---|---|
| `employee_documents` (self) | `supersedes_id` | **RESTRICT** | `00049:236` |
| `document_acknowledgements` | `employee_document_id` | **RESTRICT** | `00051:65` |
| `document_signature_requests` | `employee_document_id` | **RESTRICT** | `00051:158` |

and `document_automation._deleteObjectThenRow` — **shipped, running nightly at 03:45** — deleted the
S3 object and then called `hardDeleteById` with no child handling. The reachable trigger is the
version chain: a replacement upload sets `v2.supersedes_id = v1.id`
(`document_version.utils.js:27`), and while `deleteDocument`'s status guard stops an employee
deleting a `superseded` row, **HR bypasses that guard entirely** (`actorRole !== 'hr'`). So an
HR-deleted superseded v1 becomes a retention candidate the database will refuse to delete.

Failure sequence, all three parts bad:

1. `s3.deleteObject` succeeds — **the object is gone.**
2. `hardDeleteById` raises `foreign_key_violation`; the transaction rolls back — **the row survives,
   now pointing at a storage key that no longer exists.** The employee's document is permanently
   un-downloadable, and nothing reports it.
3. The exception propagates to `_forEachOrg`, which records it and moves to the next org — so
   **every document behind that one in the batch is never purged**, and the same row re-wedges the
   org's retention sweep every night thereafter.

The acknowledgement and signature FKs are **not** currently reachable — nothing writes a non-null
`employee_document_id` today (`document_acknowledgement.service.js` passes `null` at both sites).
They are cleared anyway, because the constraints are RESTRICT: the day an employee-plane
acknowledgement lands, an unprepared sweeper repeats step 1.

**Resolution — applied, not planned.**

| Change | File |
|---|---|
| `hasLiveSuccessor(orgId, id)` — `paranoid: false`, because RESTRICT fires on the physical row and a paranoid read would miss a soft-deleted v2 | `employee_document.repository.js` |
| `deleteChildLinksFor(orgId, id, { transaction })` — signature requests then acknowledgements | `employee_document.repository.js` |
| Successor check **before** the object delete; child clearance inside the transaction, before `hardDeleteById` | `document_automation._deleteObjectThenRow` |

Ordering is the fix, not an optimisation: a check placed after the object delete cannot save the
object. Three regression tests pin it, each verified to fail against the pre-fix code.

**For Phase 5 this changes two things.** §13.3's org-plane order is now the *second* implementation
of a pattern that exists in the codebase, so F-3 **extends a proven shape rather than inventing one**
— and the employee-plane pair is the precedent to copy. §13.3 also inherits the corrected ordering:
the successor check runs before the object delete there too.

### C-2 — `#151`/`#221` would leak cross-domain queue state if built as one endpoint

**Problem.** Main plan §11 asks for "a failure-rate signal on `pdf_render_jobs`" — one table holding
both letter and payslip jobs. A single endpoint on either plane exposes the other domain's operational
state to a role scoped to this one, and contradicts Phase 4's C-10, which exists precisely to keep the
two source types apart.

**Resolution.** Two endpoints, each filtering `source_type` server-side (DV-6). `#151` sees
`source_type = 'letter'`; `#221` sees `'payslip'`. Neither accepts a `source_type` parameter — the
scoping is not a client's to choose.

### C-3 — `#151` is a Documents-plane endpoint but reads a table owned by `common/`

**Problem.** `pdf_render_jobs` lives in `src/modules/document/models/` but is served by
`src/common/repositories/pdf_render_job.repository.js` and consumed by both domains. Putting an
aggregate query in the document module would make Payroll depend on Documents for `#221`.

**Resolution.** The aggregate methods go on the **shared** `common/repositories/pdf_render_job.repository.js`
(`countByStatus`, `failureRate`, `oldestQueuedAt`), each taking `sourceTypes` as a required argument.
Each plane's service calls it with its own scope. This is the same shape Phase 4 used for `claim`.

### C-4 — HIGH (FIXED 2026-09-29): seeder `010` created three document types that have no template

**Problem.** `010-seed-letter-document-types.js` seeds `offer_letter_issued`,
`promotion_letter_issued` and `salary_revision_letter_issued`. The registry has **no** template with
those `document_type_code`s. Phase 2 §497 deferred the templates to "Phase 4"; Phase 4's scope was the
main plan's four (`warning`, `internship_certificate`, `noc`, `salary_certificate`) and never picked
them up. Phase 4's own §1.3 states the rule these violate: *"seeding a type with no template is a dead
catalog row in every tenant"*.

**Blast radius.** Three unusable rows in every tenant's document catalog, each selectable in HR's type
pickers and each producing `404 LETTER_TEMPLATE_UNKNOWN` if anyone tries to issue against it.

**Why it is still cheap.** **Seeders `010` and `011` are UNRUN.** No tenant has these rows yet.

**Resolution — applied 2026-09-29.** The three entries were removed from seeder `010` before it was
ever run, and its header rewritten to record why (the templates were deferred to a phase whose list
turned out not to include them). Trimming an unrun seeder costs nothing and leaves no migration debt;
a later seeder adds the types on the day the templates land, per 009's binding rule that a catalog
addition ships as a new seeder rather than an edit to an old one.

The seeded letter codes now form an **exact bijection** with the nine registry templates:

| Seeder | Codes |
|---|---|
| `009` | `warning_letter`, `relieving_letter_issued`, `experience_letter_issued` |
| `010` | `appointment_letter_issued`, `confirmation_letter_issued`, `bonafide_letter_issued`, `salary_certificate_issued` |
| `011` | `internship_certificate_issued`, `noc_issued` |

Nine seeded, nine templates, no orphan either way.

`letter_registry_catalog.test.js` only ever asserted one direction — every template has a seeded
code — which is why this survived four phases. **A reverse-direction test was added**: every code
seeded by `010` or `011` must have a template that issues it. (`009` is excluded; it carries ~45
general document types that correctly have no letter template.) Verified to fail when an orphan row
is reintroduced. Building the three templates remains **OD-P5-3**, and is not Phase 5 work.

### C-5 — the main plan's Phase 4 amendment cites a file that has never persisted, and completion reports are not a durable artefact in this repository

**Problem.** `implementation_plan.md:1003` and `:1006` cite
`phases/phase4_completion_report.md` as the authoritative detail for the F-9 deferral. That file is
not on disk. Checking why turned up a repository convention no phase plan records:

| Report | Git history |
|---|---|
| `phase1_completion_report.md` | never committed |
| `phase2_completion_report.md` | never committed |
| `phase3_completion_report.md` | added in `34296ec`, **deleted in the very next commit `3fefb72`** |
| `phase4_completion_report.md` | never committed |

Every `md_updates` change record, by contrast, **is** in `HEAD` — all five of them. Completion
reports get written during a build and then do not survive; change records do.

**Resolution, in two parts.**

1. **Do not cite a completion report as authority.** F-10 repoints the amendment's two citations at
   `phase4_implementation_plan.md` §30.1 / §1.5 DV-8, which contain the same F-9 reasoning and are
   committed. Phase 5's own plan follows the same rule: every load-bearing decision in this document
   is stated *here* or in the `md_updates` record, never deferred to a completion report.
2. **Phase 5's durable record is the `md_updates` change record, the four registries and the dated
   amendment to the main plan** — the three artefacts this repository demonstrably keeps. A
   `phase5_completion_report.md` is still worth writing as the build log (pre-flight answers, test
   counts, the §23.7 manual evidence, the §25.2 hand-back note), but it is **not** where any
   decision lives, and §27/§28 do not gate on it. §31 marks it accordingly.

**Applied 2026-09-29.** Both citations in the main plan now point at
`phase4_implementation_plan.md` §30.1 / §1.5 DV-8, and a **Citation rule** bullet was added to the
Phase 4 amendment recording the evidence and the rule, so the next phase does not reintroduce a
dangling reference.

**This is an observation, not a criticism of the convention.** If completion reports are being
deleted deliberately, the fix is exactly the above — stop routing authority through them. If the
Phase 3 deletion was accidental, it is recoverable from `34296ec`.
### C-6 — §11 P5 says "purge for both classes"; Phase 3 already shipped one

Resolved as **DV-1**. Phase 3 §12.1 recorded the split and offered to "fold the two crons together"
in Phase 5. Phase 5 declines: they have different cadences (04:15 vs 03:45), different retention
sources (`payroll_settings` vs `document_settings`) and different ownership. Folding them would
couple payroll's purge window to the document module's. **They stay separate.**

### C-7 — §13's `letter_record_retention_days` default "inherit `document_retention_days`" is not expressible as a column default

Resolved as **DV-4**: `INTEGER NULL`, NULL means inherit, resolved at read time by the same
`resolveRetentionDays` helper the employee-document sweep already uses.

---

## 6. Database — Migration `00060-add-pdf-retention-and-rate-limits.js`

One migration, three added columns, no new table, no data backfill. Additive and reversible.

### 6.1 Columns

| Table | Column | Type | Null | Default | Purpose |
|---|---|---|:--:|---|---|
| `document_settings` | `letter_record_retention_days` | INTEGER | **YES** | `NULL` | `#95`. NULL = inherit `document_retention_days` (DV-4) |
| `document_settings` | `letter_bulk_rate_per_hour` | INTEGER | NO | `10` | `#96`. F-6 |
| `document_letter_branding` | `superseded_asset_keys` | JSONB | NO | `'[]'` | F-4 quarantine list |

### 6.2 Constraints

```sql
ALTER TABLE "document_settings" ADD CONSTRAINT "document_settings_letter_record_retention_chk"
  CHECK ("letter_record_retention_days" IS NULL OR "letter_record_retention_days" >= 365);

ALTER TABLE "document_settings" ADD CONSTRAINT "document_settings_letter_bulk_rate_chk"
  CHECK ("letter_bulk_rate_per_hour" BETWEEN 1 AND 500);

ALTER TABLE "document_letter_branding" ADD CONSTRAINT "document_letter_branding_superseded_keys_chk"
  CHECK (jsonb_typeof("superseded_asset_keys") = 'array'
         AND jsonb_array_length("superseded_asset_keys") <= 20);
```

**The 365-day floor is the safety rail for §1.4(4).** A letter is a legal document; no org may
configure a retention shorter than a year through this knob, whatever they type. The 20-entry cap on
the quarantine list bounds a column that is otherwise append-driven (§8.4 drains it daily; 20 branding
changes in one day is already pathological, and the 21st simply deletes inline — §8.4 rule 4).

### 6.3 Index

```sql
CREATE INDEX CONCURRENTLY "pdf_render_jobs_org_type_status_created_idx"
  ON "pdf_render_jobs" ("org_id", "source_type", "status", "created_at");
```

Serves `#151`/`#221`'s `countByStatus`, `failureRate` and `oldestQueuedAt` in one index. The existing
partial `(status, created_at) WHERE status='queued'` does not cover an org-scoped, source-typed
aggregate.

**`CONCURRENTLY` cannot run inside a transaction.** Like Phase 4's enum step (§1.4(6) there), this
makes `up()` partly non-atomic. The migration therefore: (1) runs the three `addColumn` calls plus the
three CHECKs inside one transaction and commits; (2) creates the index **outside** it with
`IF NOT EXISTS`, so a failure at step 2 leaves a re-runnable migration. Called out verbatim in the
hand-back note (§25.2).

### 6.4 `down()`

Drops the index, the three constraints and the three columns. **`down()` is lossy only for
`superseded_asset_keys`** — quarantined keys are forgotten and their objects orphaned permanently.
Stated in the hand-back note. No other column carries data that cannot be re-derived.

### 6.5 Hand-back

Authored, **NOT RUN**, per the standing rule that the user runs migrations. §25.2 is the note.

---

## 7. Models & Repositories

### 7.1 Model changes

| File | Change |
|---|---|
| `document_settings.model.js` | `letter_record_retention_days: { INTEGER, allowNull: true, defaultValue: null }`; `letter_bulk_rate_per_hour: { INTEGER, allowNull: false, defaultValue: 10 }` |
| `document_letter_branding.model.js` | `superseded_asset_keys: { JSONB, allowNull: false, defaultValue: [] }` |
| `document_defaults.js` | `letter_record_retention_days: null` with bound `{ min: 365, max: null, nullable: true }`; `letter_bulk_rate_per_hour: 10` with `{ min: 1, max: 500 }` |
| `document_settings.service.js` | Both keys added to the mutable allow-list |
| `document_hr.validator.js` | `Joi.number().integer().min(365).allow(null)` and `Joi.number().integer().min(1).max(500)` |

`superseded_asset_keys` is **service-layer only** and must never appear in a `toClient` projection —
it contains storage keys, and the module rule (§10 PII) is absolute. Add it to the branding DTO's
explicit omit list and assert that in a test.

### 7.2 New repository methods

**`common/repositories/pdf_render_job.repository.js`** — all three take `sourceTypes` as a **required**
argument (C-2):

| Method | Returns | Notes |
|---|---|---|
| `countByStatus(orgId, { sourceTypes })` | `{ queued, claimed, done, failed, cancelled }` | One `GROUP BY status`; zero-filled in JS so the shape is stable |
| `failureRate(orgId, { sourceTypes, since })` | `{ terminal, failed, rate }` | `failed / (done + failed)` over `updated_at >= since`; `rate: null` when `terminal = 0` — **never `0`**, which would read as "healthy" |
| `oldestQueuedAt(orgId, { sourceTypes })` | `Date \| null` | `MIN(created_at) WHERE status='queued'` |

**`document/repositories/org_document.repository.js`**:

| Method | Notes |
|---|---|
| `findRecordPurgeCandidates(orgId, { cutoff, limit })` | `origin='generated' AND deleted_at IS NOT NULL AND deleted_at < cutoff`, **`paranoid: false`**, ordered `deleted_at ASC`. Returns `id, document_type_id, document_group_id, version, supersedes_id, generation_artifact_id, deleted_at`. **CRON-ONLY ESCAPE HATCH** comment, matching the convention on `findPurgeCandidates` |
| `hasOpenObligation(orgId, docId)` | `true` if any `org_document_recipients` row for the doc has `status IN ('pending','viewed')` **and** the document's `requires_acknowledgement` is true. EC-42 |
| `hasLiveSuccessor(orgId, docId)` | `true` if any non-deleted `org_documents` row has `supersedes_id = docId`. C-1 chain rule |
| `hardDeleteGeneratedById(orgId, id, { transaction })` | `force: true`, `where` includes `origin: 'generated'` so no caller can hard-delete an upload through this path |

**`common/repositories/pdf_render_artifact.repository.js`**:

| Method | Notes |
|---|---|
| `markRecordPurged(id, orgId, { at }, transaction)` | Sets `status='purged'`, `object_purged_at`, `storage_key=NULL`. Conditional on `retention_class='record' AND status='ready'` **in SQL** (the class predicate lives in SQL, exactly like `repairReady` — DV-4 of Phase 3), so it cannot be turned on a cache row |

Nulling `storage_key` is deliberate and is what makes the tombstone safe: after the purge the row
records that a PDF existed, its hashes, its size and its template, and names no object. `#141`'s
`generation` block already reads through `SAFE_ATTRIBUTES` and never exposed the key.

---

## 8. Renderer Changes — repository `Vs_Code/pdf-generation`

This is the only phase that changes code outside the HRMS repository. Both changes ship in **one**
deploy.

### 8.1 F-1 — `x-api-key` validation

New `src/middleware/auth.js`:

```js
const crypto = require('crypto')

// Constant-time compare that does not leak length. Buffers of unequal length make
// timingSafeEqual throw, so hash both sides to a fixed width first.
function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

function headerOf(event, name) {
  const h = event.headers || {}
  const lower = name.toLowerCase()
  for (const k of Object.keys(h)) if (k.toLowerCase() === lower) return h[k]
  return null
}

// Returns null when the request is authorised, or an API Gateway response when it is not.
function authorize(event) {
  const primary = process.env.PDF_RENDERER_API_KEY || null
  const previous = process.env.PDF_RENDERER_API_KEY_PREVIOUS || null

  // FAIL CLOSED. An unconfigured renderer serves nobody, unless a developer has
  // explicitly opted out for a local run.
  if (!primary) {
    if (process.env.ALLOW_UNAUTHENTICATED === 'true') return null
    return { statusCode: 503, headers: JSON_H, body: JSON.stringify({ error: 'Service not configured' }) }
  }

  const presented = headerOf(event, 'x-api-key')
  if (sameKey(presented, primary) || (previous && sameKey(presented, previous))) return null

  return { statusCode: 401, headers: JSON_H, body: JSON.stringify({ error: 'Unauthorized' }) }
}
```

Wired as the **first statement** in `handler.js`, before `JSON.parse` — an unauthenticated caller must
not reach the body parser, the validator, or Chromium.

**Rules.**

1. **Fail closed.** No key configured ⇒ `503`, not "allow". The `ALLOW_UNAUTHENTICATED` escape hatch
   is for local development only and is named so it cannot be set by accident.
2. **Constant-time compare over SHA-256 digests.** Direct `timingSafeEqual` on raw strings throws on
   a length mismatch, which is itself an oracle; hashing fixes the width.
3. **Two keys accepted** (DV-7). Rotation: set `PREVIOUS = old`, `PRIMARY = new`, deploy the renderer,
   then roll HRMS onto the new key, then clear `PREVIOUS`. Zero failed renders. The runbook in F-8
   writes this down.
4. **`401` body carries no detail** — not which header was expected, not whether a key was presented.
5. **The key is never logged.** The existing `console.error('[PDF_SERVICE_ERROR]', err)` prints the
   error, never the event; auth failures return before any logging and log **nothing**, because a
   scanner hitting the endpoint should not be able to fill our log budget.
6. **API Gateway usage plan** with a throttle and a quota — ops task, tracked in §25.3, part of
   **D-14**'s stated minimum.

### 8.2 F-2 — `x-renderer-version` and `/health`

```js
// handler.js, success response
headers: {
  'Content-Type': 'application/pdf',
  'Content-Disposition': 'inline; filename="document.pdf"',
  'x-renderer-version': process.env.RENDERER_VERSION || require('../package.json').version
}
```

HRMS already reads this header (`provider.js:150`) and persists it (`pdf_render.service.js:332`). No
HRMS code changes; artifacts minted after the deploy simply stop having `renderer_version = NULL`,
which closes the gap Phases 1, 2 and 4 each declared openly.

**`GET /health`** returns `200 { ok: true, version }` and **requires the same key** — an unauthenticated
health endpoint is a free enumeration primitive. It does **not** launch Chromium; it is a liveness
signal for the F-8 runbook, not a render test.

### 8.3 Renderer tests

Added to `pdf-generation/test/`: missing key ⇒ `401`; wrong key ⇒ `401`; primary ⇒ `200`; previous ⇒
`200`; no key configured ⇒ `503`; `ALLOW_UNAUTHENTICATED=true` with no key ⇒ `200`; the `401` body
contains no key material and no header name; a `401` short-circuits before `validateInput` (assert the
validator is not called).

### 8.4 F-4 — superseded branding asset reclamation (HRMS side)

At `document_letter_branding.service.confirmAsset`, inside the **existing** advisory-lock transaction
that commits the new key:

1. If a previous key exists, append `{ key, superseded_at }` to `superseded_asset_keys`.
2. Never delete inline. The object may be named by a presigned GET minted up to 300 s ago (EC-10).
3. The document sweeper (§13.6) deletes entries older than **one hour**, object first, then removes
   the entry. A delete failure keeps the entry for the next pass — EC-43's rule, applied here.
4. If the list is at its 20-entry cap, the oldest entry's object is deleted inline before appending.
   A cap breach means twenty branding changes inside one day; degrading to an inline delete is
   correct and keeps the CHECK satisfiable.

---

## 9. Services — New and Changed

| File | Change | Feature |
|---|---|---|
| `src/common/utilities/pdf_metrics.utils.js` | **NEW.** Zero-dependency counters | F-5b |
| `src/common/utilities/org_rate_limit.utils.js` | **NEW.** Generalised Redis fixed-window limiter | F-6 |
| `src/common/services/pdf_render.service.js` | Emit `pdf.render`; increment counters. **No behaviour change** | F-5a/b |
| `src/modules/document/services/document_letter_branding.service.js` | `checkPreviewRate` becomes a wrapper over the shared limiter; `confirmAsset` appends to the quarantine | F-6, F-4 |
| `src/modules/document/services/document_letter_batch.service.js` | Rate check before cohort validation | F-6 |
| `src/modules/document/services/document_automation.service.js` | **Pass 3** `_sweepLetterRetention`; **Pass 4** `_sweepBrandingAssets`; `getLetterQueueHealth` | F-3, F-4, F-5c |
| `src/modules/payroll/services/payroll_automation.service.js` | `getPayslipQueueHealth` | F-5c |

### 9.1 `pdf_metrics.utils.js`

```js
'use strict'
// In-process, monotonic, zero-dependency counters (D-19). Per-instance and reset on
// deploy — see §1.4(1). They are a debugging aid; the fleet-wide signal is the
// DB-derived queue health in the same readout.
const counters = new Map()

function inc(name, labels = {}, by = 1) {
  const key = `${name}|${Object.keys(labels).sort().map(k => `${k}=${labels[k]}`).join(',')}`
  counters.set(key, (counters.get(key) || 0) + by)
}
function snapshot() { return Object.fromEntries(counters) }
function reset() { counters.clear() }           // tests only
module.exports = { inc, snapshot, reset }
```

**`labels` may never carry an `org_id`, a user id or a storage key** — an unbounded label set is a
memory leak, and org ids in a process-global map is a tenancy smell. Permitted labels:
`template_code`, `engine`, `source_type`, `outcome`, `failure_code`. Enforced by a test that asserts
the allow-list.

Counters emitted from `renderAndRecord`: `pdf.render.total`, `pdf.render.ok`, `pdf.render.failed`
(labelled by `failure_code`), `pdf.render.retry`, `pdf.render.unavailable`, `pdf.render.bytes`.

### 9.2 `org_rate_limit.utils.js`

Lifted verbatim from `checkPreviewRate`'s body — Redis `INCR` plus `EXPIRE` on first increment,
UTC hour bucket:

```js
async function checkOrgRate(orgId, bucket, limit, { ttlSeconds = 3600 } = {})
// key: `pdf:${bucket}:${orgId}:${YYYYMMDDHH}`
// over limit -> throw the module's existing 429 error, unchanged
```

`checkPreviewRate(orgId, limit)` becomes `checkOrgRate(orgId, 'preview', limit)`. **The Redis key
format, the TTL, the bucket boundary and the thrown error are byte-identical to Phase 1's**, so every
existing preview-limit test passes untouched. That is the acceptance criterion for this refactor.

**Redis unavailability.** Phase 1's limiter fails **open** on a Redis error (the `try` swallows).
Phase 5 preserves that for preview and **also** for bulk: a Redis outage must not block HR from
issuing letters. The size cap `#91` remains the hard bound in that window. Stated, not silently
inherited.

### 9.3 `renderAndRecord` — the one log line (F-5a)

At the single choke point **D-24** created, on every terminal outcome:

```js
console.log(JSON.stringify({
  evt: 'pdf.render',
  org_id: orgId, artifact_id: artifactId,
  template_code, template_version, engine, source_type,
  attempt, render_ms, size_bytes, page_count,
  outcome,            // 'ok' | 'failed'
  failure_code        // null on success
}))
```

**Forbidden in this line, asserted by a test that greps the emitted string:** `data`, the view-model,
`input_snapshot`, `storage_key`, the API key, the renderer URL, any employee name, any HTML.
`org_id` is permitted — it is an id, and §10 permits ids.

---

## 10. API Surface — `#151` and `#221`

### 10.1 New endpoints

| # | Path | Method | Roles | Gate |
|:--:|---|---|---|---|
| 151 | `/api/v1/documents/hr/jobs/pdf-render/health` | GET | `hr` | `requireFeature('documents.access')` |
| 221 | `/api/v1/payroll/hr/jobs/payslip-render/health` | GET | `hr` | `requireFeature('payroll.access')` |

Registered on the existing routers immediately beside `#147` and `#219` respectively. `#151` must be
registered **before** any `/letters/:id`-shaped route on that router — the Phase 4 most-specific-first
rule. It is on the `/jobs/` prefix, so this is satisfied structurally, but assert it.

### 10.2 Responsibilities

| Layer | Responsibility |
|---|---|
| Route | `[authenticate, authorize(['hr']), requireFeature(...)]`. No body, no path params |
| Controller | Validate `?window_hours` **inside the controller** (Express 5 `req.query` is getter-only) — integer 1–168, default 24. Anything else ⇒ `400 VALIDATION_ERROR` |
| Service | `getLetterQueueHealth(orgId, { windowHours })` / `getPayslipQueueHealth(...)` — calls the three aggregates with its own fixed `sourceTypes`, reads the renderer's configured state, merges the counter snapshot |
| Repository | The three aggregates of §7.2. No `storage_key`, no `payload`, no `last_error` **text** in any aggregate |

### 10.3 Response shape (`#151`; `#221` is identical with `payslip` scope)

```jsonc
{
  "success": true,
  "data": {
    "scope": "letter",
    "window_hours": 24,
    "renderer": { "configured": true, "authenticated": true },
    "queue": {
      "queued": 4, "claimed": 1, "done": 812, "failed": 3, "cancelled": 0,
      "oldest_queued_at": "2026-09-29T04:10:00.000Z",
      "oldest_queued_age_seconds": 900
    },
    "failure_rate": { "terminal": 815, "failed": 3, "rate": 0.0037 },
    "counters": { "pdf.render.total|engine=html": 812, "...": 0 },
    "counters_note": "Per-process and reset on deploy; queue and failure_rate are database-derived and fleet-wide."
  }
}
```

`renderer.authenticated` reflects **`Boolean(config.apiKey)`** — whether *we* are configured to
authenticate. It does not call the renderer. It is the answer to "is the release blocker closed in
this environment?" and it is the one field an operator checks after a rotation.

`failure_rate.rate` is `null` when `terminal === 0`. A readout must not report a healthy `0` for a
queue that has processed nothing.

### 10.4 Frontend change record

`#151` and `#221` are new endpoints; no existing contract moves. A dated record still goes to
`public/md_updates/` per the project rule, naming the two endpoints, the two new org settings
(`#95`, `#96`), the new `429` that `#143` can now return, and an explicit statement that
`#130`–`#150` and `#173`/`#174`/`#191`/`#219` are unchanged.

**`#143` gaining a `429` is a real contract addition** and the one thing the frontend must handle:
the bulk-create call can now be refused for rate, with `Retry-After`. It is called out at the top of
the record.

---

## 11. Business Rules & Validations

| ID | Rule | Enforced at |
|---|---|---|
| BR-1 | A `record`-class artifact's object is deleted only when its owning `org_document` is being hard-deleted in the same pass | `_sweepLetterRetention` |
| BR-2 | A letter with an open acknowledgement obligation is **never** purged, whatever its age | `hasOpenObligation`, re-asserted in the loop (§13.4 rule 3) |
| BR-3 | A letter whose document type `is_statutory` is never purged | Inherited from the existing sweep's statutory rule, re-asserted |
| BR-4 | Effective retention = `letter_record_retention_days` ?? `document_retention_days`, then refined by the **type's** retention if longer | `resolveRetentionDays` — the existing helper |
| BR-5 | A letter that has a live successor (`supersedes_id` points at it) is skipped this pass | `hasLiveSuccessor` |
| BR-6 | Only `origin='generated'` rows are touched. An uploaded document is the employee-document sweep's business | SQL predicate **and** `hardDeleteGeneratedById`'s `where` |
| BR-7 | Only soft-deleted (`deleted_at IS NOT NULL`) letters are candidates. A live letter is never purged by age | SQL predicate |
| BR-8 | Bulk create is refused above `letter_bulk_rate_per_hour` batches per org per hour | `document_letter_batch.service.create`, **before** cohort validation |
| BR-9 | The bulk rate check precedes every read of subject data | Ordering in `create` — a rate-limited caller must not be able to probe the cohort |
| BR-10 | A quarantined asset key is deleted no earlier than one hour after supersession | `_sweepBrandingAssets` |
| BR-11 | `letter_record_retention_days` may be NULL or `>= 365`; never `0`, never negative | Joi + DB CHECK |
| BR-12 | `superseded_asset_keys` never appears in any client projection | DTO omit list + test |

---

## 12. Authorization & Security

| Concern | Rule |
|---|---|
| `#151` / `#221` roles | `hr` only. **No `admin`, no `super-admin`** — queue state is tenant data (role-planes rule). No manager, no employee |
| Tenant scoping | `org_id` from the authenticated context, never from the query. Every aggregate takes it as its first predicate |
| Cross-domain leakage | `sourceTypes` is fixed server-side per endpoint (C-2). No client input selects it |
| Information disclosure | The readouts expose counts, ages and rates. **Never** `last_error` text, `payload`, `storage_key`, `source_id`, a subject name, or the renderer URL |
| Renderer auth | Fail-closed (§8.1 rule 1); constant-time compare; no detail in the `401`; no logging on the auth path |
| Key handling | `PDF_RENDERER_API_KEY` never logged, never in an error body, never in an audit row, never in the `pdf.render` line. Re-asserted by Phase 5's own test, not assumed from Phase 1's |
| Purge authority | The purge is **cron-only**. No endpoint triggers it (OD-P2-5 stays closed). A destructive cross-org sweep behind an HTTP verb still has no requirement |
| Purge blast radius | Bounded by `SWEEP_BATCH`, the 365-day CHECK floor, the `origin='generated'` predicate in SQL, and the obligation/statutory exclusions |
| Rate-limit bypass | The bulk check runs before any subject read (BR-9), so a throttled caller learns nothing about the cohort |
| Uniform denial | Unchanged. `#151`/`#221` have no addressable resource, so there is no id to confuse — a wrong-org caller simply sees their own org's zeros |

---

## 13. PDF Lifecycle, Retention & Purge (F-3)

### 13.1 Where it lives

**Pass 3 of the existing `document_automation.runSweeper`**, not a new cron (§3.5). The sweeper
already owns retention semantics, the statutory exclusion, `_forEachOrg`, the object-then-row helper
and the 03:45 IST destructive window. A second cron would duplicate all five and add a second
contention point to the destructive schedule.

### 13.2 Enablement and safety

* **Opt-in by inheritance.** `letter_record_retention_days` is NULL by default, so the effective
  retention is `document_retention_days`, whose default is **2555 days (7 years)**. On day one after
  the migration, **no letter anywhere is a purge candidate.** The first real purge is seven years
  away unless an org lowers the knob deliberately, and the CHECK stops them below a year.
* **Dry-run.** `runSweeper({ dryRun: true })` executes every selection, guard and count and performs
  **zero** deletes, logging what it would have removed. §25.3 requires one dry run per environment
  before the pass is enabled.
* **Bounded.** `SWEEP_BATCH` per org per night, unchanged from the existing passes.

### 13.3 The deletion order — C-1's resolution

**Copy the employee-plane pair, do not invent a new shape.** `employee_document.repository`'s
`hasLiveSuccessor` and `deleteChildLinksFor` (added by the C-1 fix, §5.1) are the precedent: same
RESTRICT topology, same object-before-row constraint, same `paranoid: false` requirement on the
successor check. F-3's `org_document.repository` methods mirror them.

Per candidate, inside **one** transaction, after the object delete has already succeeded:

```
1. document_signature_requests   WHERE org_document_id = :id     -- RESTRICT (00051:151)
2. document_acknowledgements     WHERE org_document_id = :id     -- RESTRICT (00051:58)
3. org_document_recipients       WHERE org_document_id = :id     -- RESTRICT (00050:259)
4. org_documents                 WHERE id = :id AND origin='generated'  (force: true)
   -- document_letter_proposals.issued_document_id is SET NULL by the DB (00059:166)
5. pdf_render_artifacts -> markRecordPurged(generation_artifact_id)
6. document_audit_logs <- 'letter.purged'   (inside the same transaction)
```

**Chain rule (BR-5).** A reissued letter is a version chain joined by `supersedes_id`, also
`RESTRICT`. v1 cannot be deleted while v2 exists. The pass orders candidates `deleted_at ASC` and
**skips** any row with a live successor, so the chain drains newest-first across successive nights as
each successor is itself purged. No recursive delete, no chain-wide transaction, no lock held over
more than one document.

### 13.4 Per-candidate sequence

```
for each candidate (bounded by SWEEP_BATCH):
  1. type = typeById.get(document_type_id); if (type.is_statutory) continue        -- BR-3
  2. if (hasLiveSuccessor) continue    -- BR-5. BEFORE the object delete (C-1):
                                       -- a check after it cannot save the object
  3. if (hasOpenObligation) continue                                               -- BR-2, EC-42
  4. effectiveDays = resolveRetentionDays(type, settings, letterOverride)          -- BR-4
     if (deleted_at >= cutoff(effectiveDays)) continue
  5. artifact = load(generation_artifact_id)
  6. if (artifact?.storage_key):
       try s3.deleteObject(storage_key)
       catch StorageUnavailableError -> THROW (abort this org's pass)
       catch other                   -> log; continue    -- keep the row; retry tomorrow (EC-43)
  7. BEGIN; steps 1-6 of §13.3; COMMIT
  8. counts.letters_purged += 1
```

**Rule 3 is re-asserted inside the loop even though the SQL could express it.** A single check on a
destructive operation is not enough — this is the same R-24 discipline the existing statutory rule
follows, and the same reason step 1 re-checks statutory.

**Step 6's ordering is EC-43 and D-23 verbatim:** object first. A failure keeps the row, which is the
only pointer to the object; the alternative orphans the object forever.

**Step 6's `StorageUnavailableError` rethrow** matches `_deleteObjectThenRow` exactly: if S3 is down,
attempting 499 more deletes is pointless.

### 13.5 Interaction with EC-19 verification

`runArtifactVerification` (Phase 3) alarms when a `ready` `record` artifact's object is missing. A
purged artifact is `status='purged'` with `object_purged_at` set, and
`findReadyRecordsForVerification` already filters `status: 'ready', object_purged_at: null`. **The
tombstone is excluded structurally** — no change needed, but a test asserts it, because a purge that
made the verifier alarm every night would be worse than no purge.

### 13.6 Pass 4 — branding assets (F-4)

Per org, after Pass 3: read `superseded_asset_keys`, delete the object for every entry older than one
hour (object first), then rewrite the column without the drained entries, in one transaction under the
branding row's existing advisory lock. A delete failure keeps the entry.

### 13.7 State transitions introduced

| Entity | From | To | Trigger | Reversible |
|---|---|---|---|:--:|
| `pdf_render_artifacts` | `ready` | `purged` (+`object_purged_at`, `storage_key=NULL`) | Pass 3 step 5 | **No** |
| `org_documents` (generated, soft-deleted) | row exists | row gone | Pass 3 step 4 | **No** |
| `superseded_asset_keys[]` | entry present | entry gone + object gone | Pass 4 | **No** |

No other entity changes state in Phase 5. **`ready` → `purged` for a `record` artifact is the only
new transition on the artifact machine**, and it is terminal.

### 13.8 C-4 — the three orphan document types

Default action: **remove `offer_letter_issued`, `promotion_letter_issued` and
`salary_revision_letter_issued` from seeder `010`** before it runs anywhere. It is unrun; this is a
free correction. Add a comment naming OD-P5-3 and the future seeder `012` so the intent survives.

If OD-P5-3 comes back "build the templates", the seeder is left as it is and the three templates are
built to the Phase 2 pattern — but that is **not** Phase 5 scope and would be its own increment.

---

## 14. Workflows — End to End

### 14.1 Renderer key rotation (F-1, EC-44)

```
1. Generate NEW key.
2. Renderer env: PDF_RENDERER_API_KEY_PREVIOUS = OLD ; PDF_RENDERER_API_KEY = NEW. Deploy.
   -> both keys valid. HRMS still sends OLD. Zero failures.
3. HRMS env: PDF_RENDERER_API_KEY = NEW. Deploy/restart.
   -> HRMS sends NEW. Both still valid. Zero failures.
4. Verify: #151 renderer.authenticated = true; a preview renders; #151 failure_rate unchanged.
5. Renderer env: clear PDF_RENDERER_API_KEY_PREVIOUS. Deploy.
   -> OLD is dead.
```

Step 3 before step 5 is the whole point. Doing 5 before 3 is the outage EC-44 describes.

### 14.2 Nightly retention (F-3)

```
02:30 document_offboarding_archiver  -> archive, then letter auto-issue  (Phase 4)
03:30 payroll_attachment_sweeper
03:45 document_sweeper
        Pass 1 abandoned uploads          (existing)
        Pass 2 employee-document retention(existing)
        Pass 3 LETTER retention           (NEW - F-3)
        Pass 4 branding asset quarantine  (NEW - F-4)
        Pass 5 outbox purge               (existing)
04:00 pdf_artifact_sweeper  -> stale pending + EC-19 verification
04:15 pdf_cache_purge       -> cache-class objects + terminal job reaping
```

**Ordering is a correctness property, not an optimisation.** Pass 3 runs at 03:45, *before* the 04:00
verifier, so a letter purged tonight is already a tombstone when the verifier looks and is excluded by
`status='ready'` (§13.5). The ≥15-minute spacing rule is preserved throughout.

### 14.3 Bulk rate limit (F-6)

```
POST /documents/hr/letters/bulk
 1. authenticate, authorize(['hr']), requireFeature
 2. load document_settings
 3. checkOrgRate(orgId, 'bulk', letter_bulk_rate_per_hour)   -- BR-8/BR-9; 429 + Retry-After
 4. ...existing Phase 4 flow unchanged: size cap #91, cohort validation, batch, enqueue, 202
```

Step 3 sits between the settings read and the first subject read. An idempotent **re-submission** of
an existing batch still consumes a token — the limiter cannot know it is a replay without reading, and
reading is what the limit protects. Stated in the `md_updates` record so the frontend does not retry a
`429` in a tight loop.

### 14.4 Renderer outage (F-8, the documented disaster path)

| Blast radius | Behaviour |
|---|---|
| Letters (`#139`, `#142`, `#149`) | `503 PDF_RENDERER_UNAVAILABLE`. **No** state change. This is the designed answer — **letters cannot be issued while the renderer is down**, and there is no fallback, by design (**D-10**) |
| Bulk (`#143`) | Still accepts and queues. Items stay `queued`; the drain retries to the attempt cap, then `failed` and individually retryable |
| Payslips | **Unaffected** if the org is on `pdfkit` (the default). If on `html`, the operator sets `pdf_render_engine = 'pdfkit'` — an instant, data-migration-free rollback (Phase 3's exit criterion) |
| Payroll calculate / publish / F&F | **Never touched.** The renderer is not called in any state machine's critical section (§10 Graceful degradation) |
| Detection | `#151`/`#221`: `failure_rate.rate` climbs, `oldest_queued_age_seconds` grows. `renderer.configured=false` means the URL is unset, which is a different fault |

**Operator actions, in order:** check `GET /health` on the renderer; if `401`, it is the key (→ §14.1);
if `5xx`/timeout, it is the Lambda; switch any `html`-engine org to `pdfkit`; leave letter batches
queued — they drain themselves on recovery, and nothing needs replaying by hand.

---

## 15. Transactions & Concurrency

| Operation | Boundary | Concurrency control |
|---|---|---|
| Pass 3 per candidate | One unmanaged transaction **per letter**, opened after the S3 delete | None needed — a soft-deleted letter has no concurrent writer. The `origin='generated'` + id predicate makes a double-run delete zero rows |
| Pass 4 per org | One transaction under the branding row's **existing** advisory lock | Prevents a concurrent `confirmAsset` from losing an append (read-modify-write on JSONB) |
| `markRecordPurged` | Inside the candidate's transaction | Conditional on `status='ready' AND retention_class='record'` in SQL; a concurrent repair changes zero rows |
| `#151`/`#221` | **No transaction.** Read-only aggregates | Snapshot skew between the three aggregates is acceptable and stated; they are a readout, not a ledger |
| Bulk rate check | No transaction | Redis `INCR` is atomic. Two concurrent bulk POSTs both increment; the second sees the true count |
| Counter increments | None | `Map.set` on a single-threaded event loop |

**No network call inside any transaction.** Pass 3's S3 delete is step 6, **before** `BEGIN` at step 7.
Pass 4's deletes precede its rewrite. This is the codebase's standing rule and Phase 5 does not bend it.

**Two sweeper instances.** The cron is not distributed-locked today (no phase made it so). Two
instances would select overlapping candidates; the second's delete of an already-deleted row affects
zero rows and its `markRecordPurged` affects zero rows. **The pass is therefore idempotent but not
mutually excluded**, which matches every other pass in this sweeper. Stated, not fixed — fixing it
would mean introducing a lock discipline the rest of the sweeper does not have.

---

## 16. Idempotency, Retry & Duplicate Requests

| Operation | Idempotent? | Mechanism |
|---|---|---|
| Pass 3 re-run over the same candidate | **Yes** | The row is gone; the next selection cannot find it. A partially-completed candidate (object deleted, transaction failed) is retried: `deleteObject` on a missing key is a no-op in the S3 provider, and the transaction replays cleanly |
| Pass 4 re-run | **Yes** | Entry-by-entry; a missing object is a no-op |
| `markRecordPurged` twice | **Yes** | Second call matches `status='ready'` → zero rows |
| `#151`/`#221` | **Yes** | Read-only |
| Bulk rate check | **No, by design** | Every call consumes a token, including a replay (§14.3). The limit protects the read, not the write |
| Renderer auth | **Yes** | Stateless header compare |
| Rotation (§14.1) | **Yes** | Each step is a config set; re-running a step is a no-op |

**The designed-for partial failure** is "object deleted, transaction failed": the letter row survives
pointing at an artifact whose object is gone. The next night's pass re-selects it, `deleteObject`
no-ops, and the transaction completes. In the window between, `runArtifactVerification` **will** log
`pdf.record.object_missing` for that artifact — a true statement, self-healing within 24 hours. Noted
in the runbook so it is not mistaken for data loss.

---

## 17. Timeout & Resource Management

| Resource | Bound | Where |
|---|---|---|
| Renderer client timeout | 20 s, `AbortSignal.timeout()` | P1, unchanged |
| Renderer auth path | O(1), two SHA-256 digests, before the body parser | §8.1 |
| Purge batch | `SWEEP_BATCH` per org per night | Existing constant |
| Purge memory | One candidate at a time; `attributes` restricted to eight columns | §7.2 |
| Quarantine list | ≤ 20 entries by CHECK | §6.2 |
| Counter map | Bounded by the label allow-list (§9.1) — no org ids, no ids of any kind | Test-enforced |
| `#151` query cost | One index scan per aggregate on `pdf_render_jobs_org_type_status_created_idx` | §6.3 |
| `window_hours` | 1–168, controller-validated | §10.2 |
| Bulk rate | `letter_bulk_rate_per_hour`, 1–500 | §6.2 |
| Redis limiter keys | TTL 3600 s, self-expiring | §9.2 |

**No temporary files anywhere in this module.** The renderer returns base64 in the response body;
HRMS holds one `Buffer` and streams or stores it. Chromium's lifecycle is the Lambda's business and
is unchanged by Phase 5. There is nothing to clean up on our side, and this is stated explicitly
rather than left as an absence.

---

## 18. Error & Failure Handling

| Failure | Code / behaviour | Recovery |
|---|---|---|
| Renderer key wrong/missing | HRMS: `RendererUnavailableError('renderer_auth')` → `503`. Artifact `failed` with `failure_code='renderer_auth'` | Fix the env; the worker retries queued jobs. §14.1 |
| Renderer key unset **on the renderer** | `503 Service not configured` from the handler; HRMS classifies as unavailable | Ops. Fail-closed is the point |
| `deleteObject` fails (non-`StorageUnavailable`) | Log; keep the row; next pass retries | Self-healing (EC-43) |
| `StorageUnavailableError` in Pass 3 | Abort **this org's** pass, rethrow to `_forEachOrg`, which records the org error and continues to the next org | Self-healing |
| Purge transaction fails after the object delete | Row kept; §16's designed-for case | Self-healing in 24 h |
| Redis down during a rate check | **Fail open**; `#91`'s size cap still bounds the batch | §9.2 |
| `#151` aggregate query fails | `500`. A readout failing must never be mistaken for a healthy queue — **no zero-filled fallback** | Ops |
| Counter map missing a key | `snapshot()` omits it; the readout shows the DB figures regardless | N/A |
| Bulk over rate | `429 LETTER_BULK_RATE_EXCEEDED` + `Retry-After` (seconds to the next UTC hour) | Caller waits |

---

## 19. Background Jobs, Events & Integrations

### 19.1 Cron changes

| Cron | Change |
|---|---|
| `document_sweeper.cron.js` (03:45 IST) | Two new passes inside the **existing** `runSweeper`. The cron file itself changes only its summary log line to include `letters_purged` and `assets_reclaimed` |

**No new cron file.** No change to `pdf_render_worker`, `pdf_artifact_sweeper`, `pdf_cache_purge` or
`document_offboarding_archiver`.

### 19.2 Ordering constraints introduced

Pass 3 **must** precede `runArtifactVerification` (04:00) on the same day — §13.5, §14.2. Enforced by
the existing schedule and asserted by a test that reads both cron expressions and compares them, the
same way Phase 4 asserted its archive→auto-issue order.

### 19.3 Events

`letter.purged` — a new `document_audit_logs` action, written inside the purge transaction, carrying
`{ document_type_id, template_code, reference_number, artifact_id, deleted_at, retention_days }`.
**Never** a storage key, never the snapshot. Actor is `null` (cron-originated), matching
`employee_document.purged`.

### 19.4 Integrations

No new integration. No notification on purge — the document has been soft-deleted for years by the
time it is purged, and notifying anyone about it would be noise. Explicitly **Not Applicable**.

---

## 20. Audit, Logging & Observability

### 20.1 Audit

| Action | When | Transaction |
|---|---|---|
| `letter.purged` | Pass 3, per letter | Inside the purge transaction |
| `letter_branding.asset_reclaimed` | Pass 4, per key | Inside the rewrite transaction. Metadata: `{ asset_type, superseded_at }` — **no key** |

### 20.2 Structured logs

| Line | Emitter | Fields |
|---|---|---|
| `pdf.render` | `renderAndRecord`, every terminal outcome | §9.3 |
| `pdf.letter.purged` | Pass 3 | `org_id`, `document_id`, `artifact_id`, `retention_days` |
| `pdf.letter.purge_object_failed` | Pass 3 step 6 | `org_id`, `document_id`, `err.name`. **No key** |
| `pdf.branding.asset_reclaimed` | Pass 4 | `org_id`, `asset_type` |
| `pdf.record.object_missing` | Existing (P3) | Unchanged |
| `pdf.letter.reference_burned` | Existing (P4) | Unchanged |

### 20.3 The observability stance, stated plainly

Three tiers, and the plan is honest about what each is worth:

1. **Structured logs** — complete, per-render, fleet-wide, but require a log search.
2. **In-process counters** — instant, free, and **per-instance and reset on deploy** (§1.4(1)). A
   debugging aid.
3. **DB-derived queue health** — fleet-wide, survives restarts, and is **the signal**. It is what
   §11's "visible without reading logs" actually requires, and it is what the runbook points at.

An external metrics backend would collapse tiers 2 and 3, and is out of scope under **D-19** (§1.3).

---

## 21. Org Settings — `#95` and `#96`

| # | Key | Level | Type | Default | Enforcement point |
|:--:|---|---|---|---|---|
| 95 | `letter_record_retention_days` | Org (`document_settings`) | INTEGER, nullable | `NULL` → inherit `document_retention_days` (2555) | `document_automation._sweepLetterRetention` |
| 96 | `letter_bulk_rate_per_hour` | Org (`document_settings`) | INTEGER | `10` | `document_letter_batch.service.create` |

Registered in `public/md_settings/org_settings_registry.md` in the `## Document Module` section, in
that file's exact structure (Configuration Level, Data Type, Default Value, Enforcement Point, Deep
Explanation, Applicable (ON), Not-Applicable (OFF)). **High-water becomes #96.**

`#95`'s "Deep Explanation" must state that lowering it below the age of existing soft-deleted letters
makes them purge candidates on the **next nightly run**, and that the change is irreversible.

---

## 22. Implementation Sequence

Each step ends green before the next begins.

| # | Step | Verify |
|:--:|---|---|
| 1 | Pre-flight §2 | All eight answers recorded |
| 2 | **Renderer**: `auth.js`, handler wiring, `x-renderer-version`, `/health`, renderer tests | `pdf-generation` suite green; `401` proven locally |
| 3 | Renderer deploy + API Gateway usage plan + key set in every environment | Manual `curl` without a key ⇒ `401`; with ⇒ `200`; `renderer_version` non-null on the next artifact |
| 4 | Migration `00060` authored (not run) + models + defaults + validators + settings allow-list | Unit tests on bounds and the nullable case |
| 5 | `pdf_metrics.utils.js` + the `pdf.render` line in `renderAndRecord` | Log-shape and forbidden-field tests; **full suite still 2393** |
| 6 | `org_rate_limit.utils.js`; `checkPreviewRate` becomes a wrapper | **Every existing preview-limit test passes untouched** — the acceptance criterion for the refactor |
| 7 | Bulk rate limit in `document_letter_batch.service` | `429` test; ordering test (rate before any subject read) |
| 8 | Job aggregates on the shared repository | Query-shape tests incl. `rate: null` when `terminal = 0` |
| 9 | `#151` + `#221` — routes, controllers, services | RBAC, `window_hours` validation, no-leak projection tests |
| 10 | `org_document.repository` purge methods + `markRecordPurged` | Predicate tests, incl. the `record`-only SQL guard |
| 11 | Pass 3 `_sweepLetterRetention` | The full §24 purge matrix, incl. FK-order and chain tests |
| 12 | Pass 4 `_sweepBrandingAssets` | Quarantine age, cap, failure-retention tests |
| 13 | — *(was: trim seeder `010`)* **Already done — §5.1.** No step required | Bijection test green |
| 14 | Dry run in a non-production environment; F-7 measurement | `phase5_performance_report.md` with real numbers |
| 15 | Runbooks, registries, `md_updates`, completion report, main-plan amendment (incl. C-5) | §31 |

**Step 3 gates everything downstream.** Until the renderer rejects an unauthenticated request in a
real environment, the release blocker is open and no completion claim is true.

---

## 23. Testing Requirements

New tests in `tests/unit/pdf/` and `tests/unit/document/`. **DB-free; the renderer stubbed by
injecting `fetch`; no test makes a real HTTP call.**

### 23.1 Renderer auth (in `pdf-generation/test/`)

T-A1 missing key ⇒ `401` · T-A2 wrong key ⇒ `401` · T-A3 primary ⇒ `200` · T-A4 previous ⇒ `200` ·
T-A5 no key configured ⇒ `503` · T-A6 `ALLOW_UNAUTHENTICATED` ⇒ `200` · T-A7 the `401` body contains
no key material and no header name · T-A8 a `401` short-circuits before `validateInput` · T-A9 header
lookup is case-insensitive.

### 23.2 Transport (HRMS)

T-T1 `401` ⇒ `renderer_auth`, **not retried** · T-T2 `403` ⇒ same · T-T3 the key appears in **no**
thrown error, **no** log line and **no** audit row (asserted by capturing `console` across the whole
render path, not just the provider) · T-T4 `x-renderer-version` is persisted onto the artifact ·
T-T5 a missing version header still yields `null`, not a throw.

### 23.3 Retention (the matrix that matters)

| ID | Case | Expected |
|---|---|---|
| T-R1 | Open acknowledgement obligation | **Skipped**, whatever the age (EC-42) |
| T-R2 | Statutory type | Skipped |
| T-R3 | Live successor (`supersedes_id` points at it) | Skipped (BR-5) |
| T-R4 | `origin='uploaded'` | Never selected (BR-6) |
| T-R5 | Not soft-deleted | Never selected (BR-7) |
| T-R6 | Within retention | Skipped |
| T-R7 | Past retention, no obligation | Purged; **children deleted in the §13.3 order** — asserted by call order, not just outcome |
| T-R8 | `deleteObject` fails | Row kept; artifact untouched; counted as a failure (EC-43) |
| T-R9 | `StorageUnavailableError` | Org pass aborts; other orgs continue |
| T-R10 | Transaction fails after the object delete | Row kept; next run completes it |
| T-R11 | `markRecordPurged` on a **cache** artifact | Zero rows — the SQL guard holds |
| T-R12 | Re-run over a purged letter | Zero additional effect |
| T-R13 | `letter_record_retention_days` NULL | Inherits `document_retention_days` |
| T-R14 | Setting below 365 | Rejected by Joi **and** by the CHECK in the migration's SQL |
| T-R15 | A purged tombstone | **Excluded** from `findReadyRecordsForVerification` (§13.5) |
| T-R16 | `dryRun: true` | Counts identical to a live run; **zero** deletes, **zero** transactions |
| T-R17 | Audit row written inside the purge transaction, carrying no storage key | Asserted |

### 23.4 Observability

T-O1 `pdf.render` emitted on success with every field · T-O2 emitted on failure with `failure_code` ·
T-O3 the serialised line contains **none** of: `data`, `input_snapshot`, `storage_key`, the API key,
the renderer URL, any HTML · T-O4 counter labels are restricted to the allow-list · T-O5 no `org_id`
or any id in a counter label · T-O6 `failureRate` returns `rate: null` at `terminal = 0` ·
T-O7 `countByStatus` zero-fills every status · T-O8 `#151` never returns `last_error`, `payload`,
`storage_key` or `source_id` · T-O9 `#151` rejects `window_hours` of `0`, `169`, `'abc'` ·
T-O10 `#151` scopes to `letter` and `#221` to `payslip` with no client override (C-2).

### 23.5 Rate limiting

T-L1 every existing preview-limit test passes **unmodified** · T-L2 bulk refused at limit + 1 with
`429` and `Retry-After` · T-L3 the rate check precedes the first subject read (BR-9), asserted by call
order · T-L4 Redis error ⇒ fail open for both buckets · T-L5 preview and bulk use **separate** Redis
buckets and do not consume each other's budget · T-L6 the key format is byte-identical to Phase 1's.

### 23.6 Regression gate

The entire pre-existing suite passes **unchanged**: **2397 passing, 0 failing**, plus Phase 5's tests.
Checked after steps 5, 6, 7 and 11 individually, not only at the end — step 6 (the limiter refactor)
and step 5 (the log line in the shared render path) are the two that touch code every prior phase
depends on.

### 23.7 Manual end-to-end evidence (once, recorded in the completion report)

1. `curl` the renderer with no key ⇒ `401`. With the key ⇒ `200` and a valid PDF.
2. `GET /health` without a key ⇒ `401`; with ⇒ `200 { ok, version }`.
3. Issue one letter; confirm `renderer_version` is **non-null** on the artifact.
4. `#151` after that issue: `renderer.authenticated = true`, counters non-zero, `failure_rate.rate` sane.
5. Rotate the key per §14.1; confirm **zero** failed renders across all five steps.
6. `runSweeper({ dryRun: true })` on a seeded environment; confirm the counts and that nothing moved.

---

## 24. Performance Measurement (F-7)

Not a feature. A measurement, producing `phases/phase5_performance_report.md`.

| §10 target | Method | Recorded as |
|---|---|---|
| Single letter issue **p95 < 6 s cold / < 3 s warm** | 20 sequential `#139` calls after a ≥15-min idle (cold), then 20 more (warm). `render_ms` from the artifact plus end-to-end wall time | Both p50 and p95, both phases |
| Payslip cache hit **< 300 ms** | 50 `#173` calls against a warm artifact | p50, p95 |
| 1 000-payslip ZIP **< 60 s at O(1) memory** | Largest available run; `process.memoryUsage().heapUsed` sampled every second | Wall time, peak heap, entry count. **If the largest run is smaller, say so and show the extrapolation** (§1.4(3)) |
| Worker sustains `PDF_RENDER_CONCURRENCY` without event-loop starvation | Queue 200 letter jobs; sample event-loop delay during the drain | Max delay, mean delay |
| `runArtifactVerification` completes its window (OD-P4-8) | Time one pass at the pilot org's record-artifact count | Duration and whether the limit needs raising |

Every figure is a number with units. **A target recorded as "met" without a number fails this
section**, and §27 item 12 will not pass.

---

## 25. Migration & Deployment

### 25.1 Order

1. Renderer deploy (F-1, F-2) — **independent of HRMS**, backward-compatible only if the key is set
   in HRMS **first** or simultaneously. See 25.4.
2. HRMS code deploy (all features; the purge is inert until step 3).
3. Migration `00060` — run by the user.
4. Settings `#95`/`#96` become visible; `#95` NULL ⇒ purge still inert (§13.2).
5. One dry run per environment before the pass is trusted.

### 25.2 Hand-back note for `00060` (verbatim, to be pasted into the completion report)

> `00060-add-pdf-retention-and-rate-limits.js` is authored and **NOT RUN**.
> It adds `document_settings.letter_record_retention_days` (INTEGER NULL, CHECK `>= 365` when set),
> `document_settings.letter_bulk_rate_per_hour` (INTEGER NOT NULL DEFAULT 10, CHECK 1–500),
> `document_letter_branding.superseded_asset_keys` (JSONB NOT NULL DEFAULT `'[]'`, CHECK array ≤ 20),
> and the index `pdf_render_jobs_org_type_status_created_idx`.
> **`up()` is partly non-atomic**: the three columns and three CHECKs commit in one transaction; the
> index is then created `CONCURRENTLY` **outside** it, because `CREATE INDEX CONCURRENTLY` cannot run
> inside a transaction. A failure at the index step leaves a re-runnable migration (`IF NOT EXISTS`).
> **`down()` is lossy for `superseded_asset_keys` only** — quarantined keys are forgotten and their
> S3 objects orphaned permanently. Every other column is additive and default-safe.
> **No data is backfilled and no existing row changes.** With `letter_record_retention_days` NULL
> everywhere (the default), the letter retention pass selects nothing until an org lowers the knob.

### 25.3 Ops tasks (not code)

| Task | Owner | Gate |
|---|---|---|
| `PDF_RENDERER_API_KEY` set in every deployed environment, both sides | Ops | Blocks §27.1 |
| API Gateway usage plan: throttle + quota (**D-14**) | Ops | Blocks §27.1 |
| Renderer deployed with auth | Ops | Blocks everything |
| One `dryRun` per environment before the purge is enabled | Ops | Blocks §27.4 |
| Decide IAM/private-endpoint upgrade (OD-P5-1) | Ops | Not a Phase 5 gate |

### 25.4 Rollback

| Change | Rollback |
|---|---|
| Renderer auth | Set `PDF_RENDERER_API_KEY_PREVIOUS` to the key HRMS is sending. **Never** deploy a renderer without auth to recover — that reopens the blocker |
| `pdf.render` log line | Harmless; no rollback needed |
| `#151`/`#221` | New endpoints; removing them breaks nothing |
| Bulk rate limit | Raise `letter_bulk_rate_per_hour` to 500 |
| **Retention purge** | **No rollback. Purged letters are gone.** The controls are prevention: the NULL default, the 365-day floor, the dry run, and the bounded batch |

**The purge is the only irreversible thing Phase 5 ships**, and §13.2's four controls exist because of
that. This is stated here rather than buried, so whoever runs the migration reads it.

---

## 26. Backward Compatibility

| Surface | Guarantee |
|---|---|
| `#130`–`#150` | Unchanged, except `#143` can now return `429` (§10.4) |
| `#173`, `#174`, `#191`, `#219` | Unchanged |
| `pdf_render_engine = 'pdfkit'` orgs | Completely unaffected by every Phase 5 feature |
| An org that changes no setting | `#95` NULL ⇒ no purge; `#96` = 10 ⇒ well above any real HR usage; nothing else is org-visible |
| Existing artifacts | Untouched. Pre-deploy artifacts keep `renderer_version = NULL` forever — that is a true record of what rendered them |
| `checkPreviewRate` | Same Redis key, same TTL, same bucket boundary, same error. The refactor is provable by its unchanged tests |
| `document_sweeper` passes 1, 2, 5 | Untouched |
| The renderer's request/response contract | Unchanged. One **new required header** on requests, and one **new response header** — an older HRMS without the key would break, which is why 25.1 sequences the key before the renderer deploy |

---

## 27. Production-Readiness Checklist

| # | Item | Done when |
|:--:|---|:--:|
| 1 | **The renderer rejects an unauthenticated request in every deployed environment** (D-14 — the release blocker) | ☐ |
| 2 | API Gateway usage plan with throttle and quota in place | ☐ |
| 3 | Key rotation exercised end to end with zero failed renders (§14.1) | ☐ |
| 4 | `00060` authored, tested, handed back unrun with the §25.2 note | ☐ |
| 5 | Settings `#95`/`#96` mutable, bounded, validated, registered | ☐ |
| 6 | Purge skips every excluded class: obligation, statutory, successor, uploaded, live (T-R1…T-R6) | ☐ |
| 7 | Purge deletes children in the §13.3 FK order, asserted by call order | ☐ |
| 8 | Object-before-row ordering proven, and a delete failure keeps the row (EC-43) | ☐ |
| 9 | A purged tombstone does not re-alarm the EC-19 verifier (T-R15) | ☐ |
| 10 | Dry run executed in a non-production environment, counts reviewed | ☐ |
| 11 | No secret, key, snapshot, storage key or payload in any log line, audit row or API response | ☐ |
| 12 | **Every §10 performance target recorded as a number with units** | ☐ |
| 13 | Three runbooks written and linked from `background-jobs.md` | ☐ |
| 14 | `renderer_version` non-null on artifacts minted after the renderer deploy | ☐ |
| 15 | Seeder `010`'s three orphan types resolved (C-4) | ☐ |
| 16 | No transaction open across any S3 or renderer call (invariant test) | ☐ |
| 17 | Full suite at **2397 passing, 0 failing**, plus Phase 5's tests | ☐ |
| 18 | `md_updates` record written, naming `#143`'s new `429` first | ☐ |
| 19 | All four registries current; main-plan amendment written incl. the C-5 correction | ☐ |
| 20 | Manual end-to-end evidence recorded (§23.7) | ☐ |
| 21 | **OD-1, OD-2, OD-8, OD-12, OD-P3-6 and OD-P4-8 are closed in the `md_updates` record and the main-plan amendment** — the two artefacts this repository keeps (C-5), not only in a completion report | ☐ |

**Item 1 is the phase.** Everything else can be excellent and the phase is not done without it —
that is what **D-14** means by "cannot close while the renderer is publicly unauthenticated".

---

## 28. Acceptance Criteria

Phase 5 is complete when every one of these is demonstrably true.

1. A request to the renderer without `x-api-key` is rejected with `401` and never reaches Chromium.
2. A request with the **previous** key during a rotation window succeeds; after the window it is
   rejected. A full rotation costs zero failed renders.
3. The renderer with no key configured serves nobody (`503`), unless `ALLOW_UNAUTHENTICATED` is
   explicitly set for local development.
4. A letter issued after the renderer deploy carries a **non-null** `renderer_version`.
5. A soft-deleted letter past its effective retention, with no open acknowledgement obligation, no
   live successor and a non-statutory type, is removed from the database **and** the bucket — object
   first — and leaves a `purged` artifact tombstone with no storage key and a `letter.purged` audit row.
6. A letter under an open acknowledgement obligation is **never** purged, at any age.
7. A failed object delete leaves the letter row intact and the next night's run completes it.
8. A purged letter does not cause the EC-19 verifier to alarm.
9. `runSweeper({ dryRun: true })` reports identical counts and changes nothing.
10. An org that has changed no setting sees no purge and no behaviour change of any kind.
11. Every render emits exactly one `pdf.render` line containing no data, no HTML, no storage key and
    no API key.
12. `#151` and `#221` each report their own source type's queue only, with `rate: null` on an empty
    queue, and expose no error text, payload, storage key or subject id.
13. A bulk POST above the hourly rate is refused `429` with `Retry-After`, **before** any subject is
    read; `#91`'s size cap still applies below the rate.
14. Every existing preview-rate test passes unmodified after the limiter refactor.
15. Every §10 performance target has a measured number, with units, in
    `phase5_performance_report.md` — or an explicit, reasoned "not measurable at current volume".
16. An operator following the renderer-outage runbook restores payslip service (engine → `pdfkit`)
    without touching the database, and queued letter batches drain themselves on recovery.
17. The full suite is at 2397 passing, 0 failing, plus Phase 5's tests.
18. `00060` is handed back unrun with the §25.2 note; all four registries, the `md_updates` record,
    the completion report and the main-plan amendment are current.

---

## 29. Edge-Case Traceability

### 29.1 The main plan's register — Phase 5's assigned cases

| # | Edge case | Where Phase 5 discharges it |
|---|---|---|
| EC-42 | Retention purge of a letter under an open acknowledgement obligation → excluded unconditionally | `hasOpenObligation`, §13.4 rule 3 (re-asserted in the loop); T-R1 |
| EC-43 | Object delete fails during purge → the row is kept for the next pass | §13.4 step 6; T-R8; the same rule applied to branding assets in §13.6 |
| EC-44 | Renderer API key rotated | **Improved** on the main plan: the dual-key window makes rotation cost zero failed renders (DV-7); §14.1; T-A4 |
| EC-45 | Preview abused as a free PDF service | **Already discharged in Phase 1** (`checkPreviewRate`, `#83`, `cache`-class, streamed not stored). Phase 5 adds the *bulk* half of the same protection (F-6) and a regression assertion |

### 29.2 Inherited cases Phase 5 must not break

| # | Case | Obligation |
|---|---|---|
| EC-4 | `PDF_RENDERER_BASE_URL` unset ⇒ `503`; PDFKit untouched | Unchanged. F-1 adds a second unconfigured state (**renderer-side** key unset ⇒ `503`) that classifies identically at the HRMS boundary |
| EC-10 | Asset presigned URL expires mid-render | F-4's one-hour quarantine is 12× the 300 s TTL (§1.4(5)) |
| EC-19 | Artifact `ready`, object gone | §13.5 — tombstones are excluded structurally; asserted by T-R15 |
| EC-20 | Crash between the S3 write and the commit | Unchanged; the Phase 2 sweeper still owns it |
| EC-35 | Org switches engine mid-month | Unchanged and is the disaster path's rollback (§14.4) |
| EC-46 | Cross-tenant cache isolation | Unchanged; every Phase 5 query is `org_id`-first, and counter labels carry **no** org id (§9.1) |

### 29.3 New edge cases Phase 5 introduces

| # | Case | Resolution |
|---|---|---|
| EC-P5-1 | A letter's chain (v1←v2←v3) purges partially, orphaning v1 behind a `RESTRICT` | Prevented: `hasLiveSuccessor` skips v1 until v2 is gone; the chain drains newest-first across nights (§13.3) |
| EC-P5-2 | Object deleted, transaction fails ⇒ `object_missing` alarms for up to 24 h | **Accepted and documented** (§16). Self-healing on the next pass; named in the runbook so it is not read as data loss |
| EC-P5-3 | Two sweeper instances race on one candidate | Idempotent, not excluded (§15). Zero-row updates on the loser, matching every other pass in this sweeper |
| EC-P5-4 | Redis down ⇒ bulk rate limit inoperative | **Fail open** (§9.2). `#91`'s size cap is the remaining bound; blocking issuance on a cache outage would be worse |
| EC-P5-5 | Counter map grows unboundedly | Prevented by the label allow-list, test-enforced (§9.1) |
| EC-P5-6 | `#151` reports `rate: 0` for a queue that processed nothing | Prevented: `rate` is `null` at `terminal = 0` (§7.2) |
| EC-P5-7 | Key rotated in the wrong order ⇒ every render fails | Prevented by the dual-key window; the wrong order is still possible, so §14.1 numbers the steps and the runbook repeats them |
| EC-P5-8 | An operator sets `letter_record_retention_days` low and purges years of letters the next night | Bounded by the 365-day CHECK, the obligation exclusion and the batch cap; `#95`'s registry entry must state the irreversibility (§21) |
| EC-P5-9 | The renderer deploys with auth before HRMS has the key | Every render `503`s with `renderer_auth`, letters refuse, payslips fall back to `pdfkit`. Prevented by the §25.1 ordering; recoverable in one env change |
| EC-P5-10 | `#151` queried with a huge `window_hours` scans the whole jobs table | Bounded at 168 (7 days) and served by the `00060` index (§6.3) |
| EC-P5-11 | Branding asset quarantine hits its 20-entry cap | The oldest is deleted inline before the append (§8.4 rule 4); the CHECK stays satisfiable |
| EC-P5-12 | A purge runs while a `#141` read of the same letter is in flight | The read is of a soft-deleted row, which `#141` already 404s. No new exposure |

---

## 30. Open Decisions

### 30.1 Decisions Phase 5 closes

| OD | Question | Phase 5's answer |
|---|---|---|
| **OD-1** | The renderer's URL, and may we add an API-key check? | **Yes, and it is done here.** The repository is ours (verified on disk); F-1 adds the check; the key must exist in every deployed environment before any real employee data flows |
| **OD-2** | Do we own the renderer's repository? | **Yes.** F-1 and F-2 take all three of the recommendations it offered: auth, `renderer_version`, `/health` |
| **OD-8** | How long before PDFKit is removed? | **Not in Phase 5, and not on a calendar.** Not before one full financial year of HTML payslips, and revisited with cache-hit and parity data, not a date. PDFKit is also the renderer-outage fallback (§14.4), so removing it would delete the disaster path this phase documents |
| **OD-12** | Does employee PII leaving our process for the renderer need a policy record? | **Yes.** F-8 writes it once: the renderer is treated as a sub-processor boundary even though it is our own account. It names what crosses (the view-model only — **D-15**), what does not (no `user_id`, no bank details, no unmasked identifiers unless the letter prints them), retention at the renderer (none — nothing is written to disk), and the transport control (https + API key) |
| **OD-P3-6** | Should a purged payslip be re-cacheable (a `00055` index change)? | **No change.** No usage data has arrived to justify it, and inline rendering of a payslip old enough to be purged is acceptable (EC-P3-6). Reopen only with a measured miss rate |
| **OD-P4-8** | Does `runArtifactVerification` need a bigger limit after bulk adoption? | **Measured in §24, not guessed.** Raise the limit only if the pass does not complete its window at the pilot org |
| **OD-P5-6** *(new, closed immediately)* | Build the per-org template variant-selection surface? | **No.** §1.3 — `pinned_version` covers the real need; a selection surface for a one-member set is speculative |
| **OD-P2-5** | An HR-triggered sweeper endpoint? | **Still no.** Unchanged from Phases 2, 3 and 4. A destructive cross-org sweep behind an HTTP verb still has no requirement |

### 30.2 Decisions Phase 5 opens or carries

| OD | Question | Recommendation | Owner / needed by |
|---|---|---|---|
| **OD-P5-1** | Upgrade the renderer to IAM SigV4 or a private VPC endpoint? | **Yes, as a follow-on.** The API key closes **D-14**'s minimum; removing the public route removes the surface entirely. The provider is written for a one-file transport swap | Ops, after Phase 5 ships |
| **OD-P5-2** | Is 10 bulk batches per org per hour right? | Yes to start — well above any real HR usage, low enough to bound a scripted abuse. Revisit with `#151` data | Ops, after the first pilot |
| **OD-P5-3** | Build `offer_letter`, `promotion_letter`, `salary_revision_letter`? | **Not in Phase 5.** Default is to trim them from the unrun seeder `010` (§13.8) and build the templates plus a seeder `012` as a separate increment if the business wants them | Product, **before seeder `010` is run** |
| **OD-P5-4** | Should the purge notify anyone? | **No.** The document has been soft-deleted for years by then; a notification would be noise (§19.4) | Closed unless someone objects |
| **OD-P5-5** | Should `#151`/`#221` be pollable by an external monitor without an HR session? | Not in Phase 5. That needs a service-principal auth mode this product does not have. The runbook uses an HR session | Ops, if external monitoring is wanted |
| **OD-P5-7** | Build F-9 (the reference number on the PDF face)? | **Not in Phase 5** (§1.3). It is a feature, and its mechanism moves reference allocation before the render, changing failure semantics in the phase least able to absorb that. If it is wanted, it is its own increment with its own parity fixtures. The inert `prints_reference` flag stays — four lines that document intent and cost nothing | Product |
| **OD-P5-8** | Does the sweeper need distributed mutual exclusion? | Not in Phase 5 (§15). The pass is idempotent, and no other pass in this sweeper has a lock. Adding one for Pass 3 alone would be inconsistent | Ops, if multi-instance contention is observed |

---

## 31. Registry & Documentation Updates

| Registry | Update |
|---|---|
| `public/md_system/api_registry.md` | `#151` and `#221` with roles, router/controller/service columns and full error lists. **Documents high-water → #151; Payroll high-water → #221.** Annotate the `#143` row with its new `429 LETTER_BULK_RATE_EXCEEDED` |
| `public/md_settings/org_settings_registry.md` | `#95 letter_record_retention_days`, `#96 letter_bulk_rate_per_hour`, in the `## Document Module` section, in that file's exact field structure. **High-water → #96.** `#95`'s entry must state the irreversibility |
| `public/md_system/background-jobs.md` | `document_sweeper`'s entry gains Pass 3 and Pass 4 **with the ordering constraint against the 04:00 verifier stated as a correctness property**; links to the three runbooks |
| `public/md_system/database.md` | The three new columns, their CHECKs, the new index; the `letter.purged` audit action |
| `public/md_updates/pdf_generation_phase5_2026_XX_XX.md` | The frontend change record of §10.4, leading with `#143`'s new `429` |
| `public/md_system/runbooks/` | **NEW.** `renderer_outage.md`, `renderer_key_rotation.md`, `pdf_retention_purge.md` |
| `public/md_pdf-generation/implementation_plan.md` | Dated Phase 5 amendment: §11 P5 annotated with DV-1/DV-2/DV-3 (what had already shipped); §12 EC-42…EC-45 annotated with where they are discharged; §13 gains `#95`/`#96` with real numbers; §15 OD-1, OD-2, OD-8, OD-12 marked closed. **And the C-5 correction**: the Phase 4 amendment's two citations of the non-existent `phase4_completion_report.md` repointed at `phase4_implementation_plan.md` §30.1 / §1.5 DV-8 |
| `public/md_pdf-generation/phases/phase5_api_analysis.md` | Written alongside the build, in the shape of `phase4_api_analysis.md` |
| `public/md_pdf-generation/phases/phase5_business_walkthrough.md` | Written alongside the build |
| `public/md_pdf-generation/phases/phase5_performance_report.md` | §24's measured numbers |
| `public/md_pdf-generation/phases/phase5_completion_report.md` | The build log: pre-flight answers, deviations as built, test counts before/after, the manual evidence of §23.7, the §25.2 hand-back note verbatim. **Not authoritative for any decision** — per C-5, completion reports have never persisted in this repository, so every closure it records must also appear in the `md_updates` record and the main-plan amendment. §27 and §28 do not gate on this file |

---

## 32. Summary — the actual remaining Phase 5 work in one page

After subtracting everything Phases 1–4 actually built, Phase 5 is **one security fix, one
irreversible sweeper pass, three readouts, one rate limit, one migration and a measurement**:

1. **The renderer has no authentication.** Verified by reading `handler.js` — it reads no header of
   any kind. The HRMS half has been correct since Phase 1: it sends `x-api-key`, classifies `401/403`
   as `renderer_auth`, and refuses non-https outside development. **The entire release blocker is four
   files in the renderer repository**, and everything else in this phase is secondary to it.
2. **`record`-class retention does not exist**, and cannot be written the way **D-23** describes:
   every foreign key into `org_documents` is `RESTRICT`, so the documented "delete the object, then
   the row" raises a foreign-key violation on the first candidate. §13.3 supplies the child-first
   order and the newest-first chain rule that make it executable. This is the only irreversible thing
   the phase ships, and it is inert until an org lowers a NULL-defaulted setting past a 365-day floor.
3. **`cache`-class purge and preview rate limiting are already done** — Phase 3 and Phase 1
   respectively — despite the main plan listing both under Phase 5. Half of what §11 assigns to this
   phase is already on disk (DV-1, DV-2, DV-3), which is the single biggest difference between this
   plan and a copy of the main plan's Phase 5 section.
4. **There is no observability at all**: one `console.error` in the entire render service, no
   counters, no readout. Phase 5 adds one structured line at **D-24**'s single choke point, a
   zero-dependency counter map with a label allow-list, and two database-derived queue-health
   endpoints — one per plane, because the jobs table is shared and Phase 4's C-10 exists to keep the
   two domains apart.
5. **Bulk issuance is size-capped but not rate-limited.** The Phase 1 preview limiter is generalised
   and reused; `checkPreviewRate` survives as a behaviour-identical wrapper so its tests prove the
   refactor.
6. **Three gaps carried openly since Phase 1 are closed cheaply** because the renderer is being
   deployed anyway: `renderer_version` is always `NULL` because the renderer never emits the header
   HRMS already reads; there is no `/health`; and superseded branding assets are audited but never
   deleted.
7. **One latent defect is caught before it reaches a tenant**: unrun seeder `010` creates three
   document types that have no template, which is exactly the "dead catalog row in every tenant" that
   Phase 4's own rules forbid. Trimming an unrun seeder costs nothing; discovering it after it runs
   costs a migration.

Everything else the main plan listed under Phase 5 either shipped earlier (DV-1, DV-2, DV-3), is a
measurement rather than a feature (§24), is documentation (F-8), or is deliberately dropped with a
reason (§1.3, §3.6). **Phase 5 closes the module**, so §30.2's eight open decisions each carry an
owner — after this phase there is no later phase to inherit them.

---

*End of Phase 5 plan. Amend, date, and keep it true.*
