# Documents Module — Phase 3 Implementation Plan

**Status:** PLAN — not yet implemented
**Authored:** 2026-09-24
**Supersedes for Phase 3 purposes:** §9 "Phase 3" of `public/md_documents/implementation_plan.md` (that section records the *original* intent; this document is the reconstructed, reconciled scope and is the Source of Truth for Phase 3 development).
**Predecessors:** `phases/phase1_implementation_plan.md` (DELIVERED — verified in source), `phases/phase2_implementation_plan.md` (DELIVERED — verified in source; its own header still reads "PLAN", which is stale — see §2 P-2).

---

## 1. Goal & Boundary

### 1.1 Phase 3 goal (one sentence)

Close the compliance half of the module: let a recipient **acknowledge** — and, where the document demands it, **typed-sign** — the exact version of the exact bytes they were served, store that act as immutable legal evidence that no one including HR can edit or delete, and give HR and managers the readouts that turn that evidence into "who has not acknowledged what, and is it overdue".

### 1.2 In scope

| # | Capability | Why it is Phase 3 |
|---|---|---|
| S-1 | `document_acknowledgements` table + model + repository | Parent §4.1 assigns it to P3; nothing equivalent exists |
| S-2 | `document_signature_requests` table + model + repository | Parent §4.1, P3 |
| S-3 | Migration `00051-create-document-acknowledgements.js` (two new tables + three additive `document_settings` columns) | New tables; the only alteration is three `ADD COLUMN … NOT NULL DEFAULT` on `document_settings` |
| S-4 | Recipient transition `pending`/`viewed` → `acknowledged` | Parent P3 line: "recipient `state` transitions (`pending → viewed → acknowledged`)". `pending → viewed` shipped in P2; `→ acknowledged` is the remainder |
| S-5 | Recipient transition → `signed` via internal typed signature | Parent P3 line + D-13. The `signed` enum value exists since P2 and is currently unreachable |
| S-6 | External provider stub: `docusign` / `adobe_sign` validate fully, then `503 SIGNATURE_PROVIDER_UNAVAILABLE` with **no** state change | Parent EC-33 + D-13 ("pluggable `provider` enum so an external provider drops in later without schema change") |
| S-7 | Evidence bundle: `document_version` + `content_checksum` + IP + **user-agent** + timestamp | Parent §9 P3 scope line, verbatim. `user-agent` is not captured anywhere in the module today |
| S-8 | HR per-document acknowledgement matrix — delivered by **extending** endpoint #59, not by a new endpoint | Parent P3 line "per-document acknowledgment matrix". #59 already returns the roster + `counts_by_state`; the matrix is that roster plus its evidence join |
| S-9 | HR org-wide pending list (#76) and CSV export (#77) | Parent P3 line "pending list, export" |
| S-10 | HR single-acknowledgement evidence readout (#78) | Parent §1.1 requirement #7 "Legal validation with audit trail"; an immutable record with no read path is not evidence |
| S-11 | Manager Tier-A compliance view (#79), scoped by `getAccessibleUserIds` | Parent P3 line: "Manager Tier-A view: which of my reports have not acknowledged what" |
| S-12 | Org settings #68 (`document_acknowledgement_due_days`), #69 (`document_acknowledgement_blocking`), #70 (`document_signature_provider`) | Parent §11 assigns exactly these two rows to Phase 3 |
| S-13 | Due-date fallback: `org_documents.acknowledgement_due_days ?? settings.document_acknowledgement_due_days` at publish and at sync | Direct consequence of S-12; today a null per-document value yields a null `due_on` and therefore no overdue signal at all |
| S-14 | Additive extension of `document_authority.utils.js` with `acknowledge` / `sign` self-plane write actions and the manager compliance read action | Reuse mandate; the chokepoint must stay single |
| S-15 | `user_agent` capture in the org self controller's `ctx(req)` | Required by S-7; currently only `ipAddress` and `requestId` are captured |

### 1.3 NOT in scope (and where it lives)

| Excluded | Owner |
|---|---|
| Reminder emails / notification outbox / "nudge" endpoints for pending acknowledgements | **Phase 4** (parent D-16, §9 Phase 4, §11 row "Notification toggles per event"). Tier-A's "nudge" verb is a notification verb and cannot be built before the outbox exists. |
| Overdue-acknowledgement cron, new-joiner on-join top-up hook | **Phase 4 / Phase 5**. P3 derives overdue **on read** from `due_on`, so a missing cron is never a compliance false-negative (the EC-17 discipline P1 established for expiry). |
| Broad compliance reporting (missing mandatory documents, expiring in N days), `document_export_jobs`, templates, offboarding archive | **Phase 5** (parent §9 Phase 5). P3's export is the acknowledgement compliance export only. |
| Certificate-backed e-signature, DocuSign/Adobe Sign accounts, webhooks, envelope polling | **Deferred** (parent D-13, Open Decision 4). P3 ships the internal typed signature and the provider seam. |
| Any change to `employee_documents` behaviour, columns, or endpoints #1–#42 | Out. See §1.4 honesty guard item 2 and §3.6 O-1 for the one open question this raises. |
| Any change to the P2 publish / replace / retire / reject / delete transactions beyond the S-13 due-day fallback | Out. P3 is additive. |
| New npm dependencies | D-19: zero. Confirmed in §21.3. |

### 1.4 Honesty guard

Four claims in this plan are *design intent*, not verified fact. Each is called out again where it is used.

1. **No DB was touched.** Nothing in this plan has been executed against a database. Migration `00051` is verified **statically** and by unit tests over pure logic only; it is handed back to the operator to run (§2, standing constraint). Index-usage claims in §8.4 and §24.6 are *designed* intent and must be confirmed with `EXPLAIN` before sign-off.
2. **Employee-plane acknowledgement is schema-supported but has no producer.** Parent §4.1 mandates two nullable FKs with an exactly-one `CHECK`, so `employee_document_id` exists from day one. But seeder `009` sets `default_requires_acknowledgement: true` on **org-plane policy types only** (`employee_handbook`, `code_of_conduct`, `posh_policy`, `it_security_policy`) and no catalog entry sets `default_requires_signature: true` at all. P3 therefore builds **no employee-plane acknowledge/sign endpoint** — the column is a schema seam, not dead code we forgot to wire. §3.6 O-1 records this as an open decision.
3. **"Blocking" is deliberately narrow.** Parent §11 says "whether acknowledgment is blocking" and nowhere says what it blocks. P3 implements it as a **read-side flag only** (§10 F-19). It gates no login, no download, no other endpoint. §26 O-2 asks the architect to decide what P4/P5 should make it block.
4. **Typed-name matching is a judgement call.** Parent D-13 says "legally-evidenced internal typed-signature" but does not specify validation. P3 requires the typed name to match the signer's own profile name under a normalised comparison (R-88), because an unvalidated free-text field is not evidence of anything. §26 O-3 records this for the architect to relax if HR objects.

---

## 2. Pre-Flight Checks

Run before Step 1. Each is a concrete command with an expected result.

| # | Check | Command | Expected |
|---|---|---|---|
| P-1 | Working tree clean, on `development` | `git status --porcelain` | empty |
| P-2 | Phase 2 is really in source (its plan header is stale) | `ls src/modules/document/models/org_document*.model.js` | both `org_documents.model.js` and `org_document_recipients.model.js` present |
| P-3 | `00050` is the latest document migration; `00051` is free | `ls src/infrastructure/postgres-sql/migrations \| tail -3` | no `00051-*` present |
| P-4 | Document unit suite green before any change | `npx node --test "tests/unit/document/**/*.test.js"` | `pass 156 / fail 0` |
| P-5 | Full-suite baseline recorded | `npm test` | record the number; do not start until the *pre-existing* failure set is written down |
| P-6 | `signed` + `acknowledged` already in the recipient enum (no `ALTER TYPE` needed) | `grep -n "state:" src/modules/document/models/org_document_recipients.model.js` | ENUM contains `'acknowledged'`, `'signed'` |
| P-7 | The two P3 support indexes already exist from `00050` | `grep -n "org_due_idx\|doc_state_idx" src/infrastructure/postgres-sql/migrations/00050-create-org-documents.js` | both present |
| P-8 | Audit `entity_type` is a free `STRING(50)` (no enum ALTER for the two new entity types) | `grep -n "entity_type" src/modules/document/models/document_audit_logs.model.js` | `DataTypes.STRING(50)` |
| P-9 | Profile name source for R-88 | `grep -n "first_name\|last_name\|display_name" src/modules/auth/models/user_profiles.model.js` | all three present |
| P-10 | CSV writer available for reuse (zero new deps) | `node -e "require('./src/modules/payroll/utils/csv_writer.utils').createCsvWriter"` | function |
| P-11 | `document_settings` has exactly the ten P1 columns | `grep -n "DataTypes" src/modules/document/models/document_settings.model.js` | ten settings columns + id/org_id |

**Migration execution constraint (standing).** This environment must never run `db:migrate` and never open a connection to the remote database. `00051` is verified **statically** (shape review, `down()` symmetry, enum-drop completeness, `CHECK` expression review) plus unit tests over pure logic; the file is then **handed back to the operator** to run. Same protocol as payroll `00047`/`00048` and documents `00049`/`00050`. Note that `00050` itself is still pending operator execution — §25.1 covers the ordering.

---

## 3. Completed-vs-Remaining Analysis

Every row below was established by reading **source**, not by reading the P1/P2 plans.

### 3.1 Already implemented in Phase 1 — Phase 3 reuses, never rebuilds

| Capability | Where it lives | What P3 does with it |
|---|---|---|
| Audit spine with mandatory transaction + `recordDetached` for read-observing events + `storage_key`/`document_number`/`reference_url` scrubbing | `services/document_audit.service.js` | **Reuse verbatim.** `entity_type` is `STRING(50)`, so `document_acknowledgement` and `document_signature_request` need no migration. |
| Uniform-denial contract: `/:id`-addressed → byte-identical `404 DOCUMENT_NOT_FOUND` / "Document not found" / no `details` | `utils/document_authority.utils.js` + every service | **Reuse and extend.** This is the rule that resolves the EC-32 contradiction (§3.6 K-1). |
| Authorization chokepoint (pure, DB-free) | `utils/document_authority.utils.js` | **Extend additively** — new action sets, no signature change to the two existing functions. |
| Unmanaged-transaction idiom + `if (!t.finished) await t.rollback()` | every write service | **Reuse.** |
| IST date-only arithmetic | `utils/document_expiry.utils.js` → `toIstDateString` | **Reuse** for every overdue comparison. P3 adds **no** fourth local `todayIST()` — see §3.5 CO-1. |
| Org settings singleton with `getOrCreate`, defaults and caps | `services/document_settings.service.js`, `utils/document_defaults.js` | **Extend** with three keys + two caps. |
| Error-code register and `AppError(status, message, code, details)` shape | `common/utilities/appError.utils.js`, P1 §16.1 | **Extend** with six new codes (§18.1). |
| Observability prefix `[Document]` and the never-log list | P1 §16.3 | **Reuse**, extended with "never log the typed `signer_name`". |

### 3.2 Already implemented in Phase 2 — Phase 3 consumes, never rebuilds

| Capability | Where it lives | What P3 does with it |
|---|---|---|
| `org_document_recipients` with `state` ENUM **already containing** `acknowledged` and `signed` | `models/org_document_recipients.model.js`, migration `00050` | **Zero enum work.** P3 only makes the two values reachable. |
| `due_on` computed at publish and at sync from `acknowledgement_due_days` | `utils/document_org_rules.utils.js` → `resolveDueOn`; `document_org.service` publish step 10; `document_recipient.service.syncRecipients` | **Consume for overdue derivation.** P3 adds only the settings fallback (S-13). |
| Partial index `org_document_recipients_org_due_idx` `WHERE state IN ('pending','viewed') AND due_on IS NOT NULL` | migration `00050` | **This is the pending-list index.** #76/#79 are designed against it. |
| Index `org_document_recipients_doc_state_idx` | migration `00050` | **This is the matrix index.** Extended #59 is designed against it. |
| `pending → viewed` transition with guarded `WHERE state='pending'` update and `first_viewed_at` | `services/document_recipient.service.markViewed` | **Untouched.** P3's transitions start from whatever state this leaves. |
| `waive` with `409 RECIPIENT_ALREADY_COMPLETED` from `acknowledged`/`signed` | `services/document_recipient.service.waive` | **Untouched and now actually reachable** — P2 wrote this guard against states nothing could produce. P3 makes it live. |
| Recipient roster + `counts_by_state` (zero-filled, all five states) | `org_document_recipient.repository.countsByState`, `document_org_read.service.roster` | **Extend** into the matrix (S-8). |
| Self-plane read surface #70/#71/#72 with frozen employee allow-list projection | `org_document_recipient.repository` `RECIPIENT_ATTRIBUTES` / `EMPLOYEE_DOC_ATTRIBUTES` | **Extend** the projection with the acknowledgement summary. The allow-list discipline is preserved. |
| Version chain: replace creates a **new row** with a new id, same `document_group_id`, `version + 1`; publish supersedes the predecessor and materialises a **fresh** recipient roster on the new id | `document_org.service.replace` / `.publish` | **This is what discharges EC-12 structurally** — see §22. |
| `checksum_sha256` on `org_documents`, populated at confirm from the S3 single-part ETag | `models/org_documents.model.js`, confirm flow | **This is the `content_checksum` source.** |
| `version` on `org_documents` | `models/org_documents.model.js` | **This is the `document_version` source.** |
| Advisory-lock namespace `docorg:{orgId}:{groupId}` and the lock-ordering protocol | `document_recipient.service`, `document_org.service` | **Respected, deliberately not taken** by the acknowledge path — see C-25 and §16.4. |

### 3.3 Partially implemented — Phase 3 completes

| Item | What exists | What P3 must still do |
|---|---|---|
| Recipient state machine | `pending → viewed` and `pending\|viewed → waived` are implemented. `acknowledged` and `signed` are enum values with no producer. | Implement `pending\|viewed → acknowledged` and `pending\|viewed\|acknowledged → signed`, with the monotonicity rule R-79. |
| `isActionable` | `utils/document_org_rules.utils.js` returns `status === 'published'` — status only. The recipient's own state is not considered, so a document the employee already acknowledged still reports `is_actionable: true`. | Split additively: keep `isActionable(status)` byte-identical for existing callers, add `resolveRecipientAction({ status, displayStatus, state, requiresAcknowledgement, requiresSignature })` → `'acknowledge' \| 'sign' \| null`. The self-plane readouts adopt the new one. |
| `acknowledgement_due_days` | Stored per document; `resolveDueOn` returns `null` when it is null, so a document that requires acknowledgement but names no window gets no `due_on` and can never be overdue. | Add the org-default fallback (S-13) so "requires acknowledgement" always implies a due date. |
| Evidence context capture | `ctx(req)` captures `ipAddress` and `requestId`. | Add `userAgent` (truncate at 512, `null` when absent). **Org self controller only** — HR and manager controllers do not produce evidence rows. |
| HR compliance readout | #59 returns roster rows and `counts_by_state`. | Left-join evidence and add the per-row compliance block, plus an org-wide list and export. |

### 3.4 Genuinely remaining Phase 3 scope (the build list)

Migration `00051` · `document_acknowledgements` + `document_signature_requests` models/repositories · pure `document_compliance.utils.js` · `document_acknowledgement.service.js` (acknowledge + sign, both transactional) · `document_compliance.service.js` (HR + manager readouts + CSV rows) · seven new endpoints #73–#79 · three modified endpoints #59/#70/#71 · three org settings #68–#70 · authority-chokepoint extension · `ctx` user-agent capture · `resolveRecipientAction` · due-day fallback.

### 3.5 Phase-1 / Phase-2 carry-over that Phase 3 must NOT propagate

These are pre-existing deviations found in source. Per the surgical-changes rule P3 does **not** fix them, but it must not copy them either.

| # | Deviation | P3's obligation |
|---|---|---|
| CO-1 | `document_org_read.service.js` defines a **third** local `todayIST()` despite `document_expiry.utils.toIstDateString` existing and the P2 plan mandating its reuse. | Every new P3 file imports `toIstDateString`. No new local date helper. The existing three are left alone. |
| CO-2 | `isActionable` is status-only (see §3.3). | Handled by the additive split, not by editing the existing function. |
| CO-3 | P1 carry-over defects D-1…D-4 recorded in P2 §26.2 (leaked transaction in `document_type.service.setActive`; duplicated `requires_verification` OR-ing; `reference_url` in employee-plane `LIST_ATTRIBUTES`; mid-function re-`require`). | Out of P3 scope. Re-listed in §26.4 so they are not lost a third time. |
| CO-4 | P2 §26.2 D-5: the Phase-1 `md_updates` change record, `DOCUMENTS_API_CONTRACT.md`, and both phase completion reports were never written. | P3 **must** produce its own (§27) and must not compound the debt. The missing P1/P2 artefacts remain the operator's call. |

### 3.6 Parent-plan requirements that are no longer applicable, or that changed

| Parent P3 line | Disposition |
|---|---|
| "recipient `state` transitions (`pending → viewed → acknowledged`)" | **Reduced.** `pending → viewed` shipped in P2. Only the tail remains. |
| "per-document acknowledgment matrix" as a *new* view | **Folded into #59.** A second roster endpoint would duplicate the projection, the pagination and the `counts_by_state` aggregate. Extended in place; recorded in the change record. |
| EC-32 "`403`, checked before existence" | **Contradiction — resolved to `404`.** See K-1. |
| Parent §4.1 "reference `org_document_id` **or** `employee_document_id` as two nullable FKs with a `CHECK` enforcing exactly one" | **Honoured in the schema, unused on the employee side in P3.** See §1.4 item 2 and O-1. |
| "Acknowledgment due-days default; whether acknowledgment is blocking" as one settings row | **Split into two columns** (#68, #69). One boolean and one integer cannot share a column. |

**Contradictions resolved (K-…)**

- **K-1 — EC-32's `403` vs P1 §12.2's uniform `404`.** Parent EC-32 says a non-recipient acknowledging gets `403`, checked before existence. P1 §12.2, which is *shipped*, says every `/:id`-addressed denial collapses to a byte-identical `404 DOCUMENT_NOT_FOUND`, and the P2 self plane already returns `404` for a non-recipient reading the same id. Returning `403` on `POST /me/hr-documents/:id/acknowledge` while `GET /me/hr-documents/:id` returns `404` for the same caller and the same id makes the *pair* an existence oracle even though neither code leaks alone. **Resolution: `404 DOCUMENT_NOT_FOUND`, uniform.** EC-32's business intent — a non-recipient cannot acknowledge, and the check cannot be used to probe existence — is fully discharged, and more strictly than the literal text. Recorded in §22 and in the change record.
- **K-2 — "records the exact version and checksum" vs documents that have no checksum.** Parent §4.1 notes `content_checksum` is `NULL` when the object is multipart (no single-part ETag); `storage_backend = 'reference'` documents have no checksum either. **Resolution:** `content_checksum` is nullable and the acknowledgement records whatever the document row carries at the moment of the act, including `NULL`. `document_version` is **never** null — it is the primary evidence key and the one EC-12 turns on.
- **K-3 — "signature request" as a request vs as evidence.** The parent names the table `document_signature_requests` but describes no HR "request a signature" endpoint; `org_documents.requires_signature` is how a document is marked. **Resolution:** one row serves both roles. For `internal_typed` the signer's own call inserts a row already at `status='signed'` (request and fulfilment are the same act). The `pending` status and `provider_reference` exist for the external-provider seam, which writes them in a later phase. No HR-side request endpoint is invented.

---

## 4. Phase 1 → Phase 2 → Phase 3 Dependency Analysis

| P3 feature | Depends on (P1) | Depends on (P2) | How P3 extends it |
|---|---|---|---|
| Acknowledge (#73) | audit spine; uniform denial; `AppError`; settings singleton; unmanaged-txn idiom | `org_document_recipients` row + `state` enum; `org_documents.version` / `checksum_sha256`; `screenOrgDocument`; `ORG_VISIBLE_STATUS.self` | new service + new table; the recipient row transitions in the **same** transaction as the evidence insert |
| Typed sign (#74) | same | same + `requires_signature` | same, plus provider resolution from settings |
| External provider 503 | `AppError` | — | validation and authorization run to completion, then the provider gate throws **before** `db.sequelize.transaction()` is ever called |
| Self readouts (#70/#71/#75) | `toIstDateString` | `listForEmployee` / `findForEmployee` + frozen allow-lists | projection extended with an `acknowledgement` block |
| HR matrix (#59 extended) | audit | `findByDocument` + `countsByState` | left-join evidence; add compliance summary |
| HR pending list (#76) | `toIstDateString` | `org_document_recipients_org_due_idx` | new repository aggregate designed against that index |
| HR export (#77) | — | #76's query | reuses `payroll/utils/csv_writer.utils` + `payroll/utils/download_headers.utils` (§20.3) |
| HR evidence readout (#78) | uniform denial | — | reads the append-only table |
| Manager view (#79) | `getAccessibleUserIds` (D-10) | setting #58 `manager_can_view_team_documents` | #76's query with a mandatory `user_id IN (accessibleUserIds)` predicate |
| Due-day fallback (S-13) | settings singleton | `resolveDueOn`, publish step 10, `syncRecipients` | one `??` at each of the two call sites; `resolveDueOn` itself unchanged |
| Overdue derivation | `toIstDateString`, EC-17 derive-on-read discipline | `due_on` | pure util, never persisted |

**Ordering constraint.** Nothing in P3 can be integration-verified until migration `00050` has actually been run by the operator, because every P3 table FKs into `org_documents` / `org_document_recipients`. Unit-level work is unblocked (§24 is entirely DB-free). §25.1 states the deployment order.

---

## 5. Directory Structure & Wiring

New files only; no file is moved or renamed.

```
src/modules/document/
  models/
    document_acknowledgements.model.js          NEW
    document_signature_requests.model.js        NEW
  repositories/
    document_acknowledgement.repository.js      NEW
    document_signature_request.repository.js    NEW
    org_document_recipient.repository.js        MODIFIED (evidence join, compliance aggregates, lock by (doc,user))
    org_document.repository.js                  MODIFIED (accept lock: 'share')
  services/
    document_acknowledgement.service.js         NEW  (acknowledge + sign)
    document_compliance.service.js              NEW  (HR + manager readouts + CSV rows)
    document_org_read.service.js                MODIFIED (self projection, roster matrix)
    document_org.service.js                     MODIFIED (due-day fallback at publish)
    document_recipient.service.js               MODIFIED (due-day fallback at sync)
    document_settings.service.js                MODIFIED (three new keys + caps)
  utils/
    document_compliance.utils.js                NEW  (pure: overdue, blocking, recipient action, provider gate)
    document_authority.utils.js                 MODIFIED (additive action sets)
    document_defaults.js                        MODIFIED (three defaults, two caps, provider enum)
    document_org_rules.utils.js                 MODIFIED (additive resolveRecipientAction)
  controllers/
    document_org_self.controller.js             MODIFIED (userAgent in ctx; #73/#74/#75)
    document_org_hr.controller.js               MODIFIED (#76/#77/#78; #59 passthrough)
    document_org_manager.controller.js          MODIFIED (#79)
  validators/
    document_org_self.validator.js              MODIFIED (acknowledge/sign bodies)
    document_org_hr.validator.js                MODIFIED (compliance queries)
    document_org_manager.validator.js           MODIFIED (compliance query)
  routes/
    document_org_self.routes.js                 MODIFIED (#73/#74/#75)
    document_org_hr.routes.js                   MODIFIED (#76/#77/#78)
    document_org_manager.routes.js              MODIFIED (#79)

src/infrastructure/postgres-sql/migrations/
  00051-create-document-acknowledgements.js     NEW

tests/unit/document/
  compliance_utils.test.js                      NEW
  acknowledgement_service.test.js               NEW
  signature_service.test.js                     NEW
  compliance_service.test.js                    NEW
  ack_authority.test.js                         NEW
  ack_settings_and_defaults.test.js             NEW
```

**Route-ordering rule (Express 5).** `/org-documents/compliance` and `/org-documents/compliance/export` are literal segments that must be registered **before** `router.get('/org-documents/:id')`, exactly as `/org-documents/proposals` and `/org-documents/groups/:groupId` already are in `document_org_hr.routes.js`. A literal registered after the parameterised route is swallowed by `:id` and fails UUID validation with a confusing `400`.

**Express 5 query rule.** `req.query` is getter-only. Every new query schema is validated **inside the controller** with `validateOrThrow(schema, req.query)` and the result assigned to a local. Nothing assigns to `req.query`.

**Model registration.** Both new models load through the existing `models.index` loader; no loader change. Associations are declared, but the compliance aggregates use raw SQL against the designed indexes (§8.4) rather than `include`s, because a three-table `include` with pagination generates a subquery that will not use `org_document_recipients_org_due_idx`.

---

## 6. Database Schema & Migration `00051`

One migration, one transaction, three objects. `down()` reverses in exact inverse order and drops the two created ENUM types with `CASCADE` (Postgres leaves enum types behind, and a re-run would otherwise fail) — the same shape as `00049` and `00050`.

### 6.1 `document_acknowledgements`

Append-only. **Not paranoid.** No `updated_at`. The repository exposes **no** `update` and **no** `destroy` method at all — that absence is the enforcement of "an acknowledgment cannot be deleted or edited by anyone, including HR", and §24.4 asserts it with a chokepoint test.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | UUID PK | no | `defaultValue: UUIDV4`; generated in the service before the transaction |
| `org_id` | UUID | no | FK `organizations(id)` ON UPDATE CASCADE ON DELETE CASCADE |
| `org_document_id` | UUID | **yes** | FK `org_documents(id)` ON UPDATE CASCADE ON DELETE **RESTRICT** |
| `employee_document_id` | UUID | **yes** | FK `employee_documents(id)` ON UPDATE CASCADE ON DELETE **RESTRICT** |
| `user_id` | UUID | no | FK `users(id)` ON UPDATE CASCADE ON DELETE RESTRICT |
| `document_version` | INTEGER | no | copied from `org_documents.version` at the moment of the act |
| `content_checksum` | VARCHAR(64) | yes | copied from `checksum_sha256`; `NULL` for multipart and `reference` backends (K-2) |
| `acknowledged_at` | TIMESTAMPTZ | no | server clock, never client-supplied |
| `ip_address` | VARCHAR(45) | yes | matches `document_audit_logs.ip_address` |
| `user_agent` | VARCHAR(512) | yes | truncated by the service, never at the DB |
| `request_id` | VARCHAR(100) | yes | matches `document_audit_logs.request_id` |
| `created_at` | TIMESTAMPTZ | no | |

`ON DELETE RESTRICT` on both document FKs is deliberate: an acknowledgement must survive its document. `org_documents` is paranoid, so the normal delete path is a soft delete and never reaches this constraint; `RESTRICT` exists to make a *hard* delete of an acknowledged document impossible at the storage layer, not to be hit in normal operation.

**Constraints**

| Name | Expression |
|---|---|
| `document_acknowledgements_one_anchor_chk` | `(org_document_id IS NOT NULL)::int + (employee_document_id IS NOT NULL)::int = 1` |
| `document_acknowledgements_version_chk` | `document_version >= 1` |

**Indexes** (raw SQL — Sequelize's `where` cannot express partial uniques)

| Name | Definition | Serves |
|---|---|---|
| `document_acknowledgements_org_doc_user_ver_unique_idx` | `UNIQUE (org_document_id, user_id, document_version) WHERE org_document_id IS NOT NULL` | I-11 double-submit backstop **and** EC-12: the version is part of the key, so an ack of v1 cannot satisfy v2 |
| `document_acknowledgements_emp_doc_user_unique_idx` | `UNIQUE (employee_document_id, user_id) WHERE employee_document_id IS NOT NULL` | the employee-plane seam (O-1) |
| `document_acknowledgements_org_doc_idx` | `(org_id, org_document_id) WHERE org_document_id IS NOT NULL` | #59 matrix join, #78 |
| `document_acknowledgements_org_user_idx` | `(org_id, user_id, acknowledged_at DESC)` | #75 self receipt |

### 6.2 `document_signature_requests`

Not paranoid. `updated_at` **is** present, because the external-provider seam needs `pending → signed` on a later callback. Immutability is enforced narrowly and explicitly: **once `status = 'signed'` the row is frozen** — the repository's only update method carries `WHERE status = 'pending'`, and there is no destroy method (§24.4 chokepoint test).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | UUID PK | no | |
| `org_id` | UUID | no | FK organizations CASCADE / CASCADE |
| `org_document_id` | UUID | yes | FK `org_documents` RESTRICT |
| `employee_document_id` | UUID | yes | FK `employee_documents` RESTRICT |
| `user_id` | UUID | no | the signer; FK `users` RESTRICT |
| `document_version` | INTEGER | no | |
| `content_checksum` | VARCHAR(64) | yes | |
| `provider` | ENUM `enum_document_signature_requests_provider` (`internal_typed`,`docusign`,`adobe_sign`) | no | |
| `status` | ENUM `enum_document_signature_requests_status` (`pending`,`signed`,`failed`) | no | default `'pending'`; P3's internal path inserts `'signed'` directly |
| `signer_name` | VARCHAR(150) | yes | the typed name, stored **exactly as typed** (not normalised) — it is evidence |
| `signed_at` | TIMESTAMPTZ | yes | |
| `provider_reference` | VARCHAR(255) | yes | external envelope id; always `NULL` in P3 |
| `ip_address` | VARCHAR(45) | yes | |
| `user_agent` | VARCHAR(512) | yes | |
| `request_id` | VARCHAR(100) | yes | |
| `requested_at` | TIMESTAMPTZ | no | |
| `created_at` / `updated_at` | TIMESTAMPTZ | no | |

**Constraints**

| Name | Expression |
|---|---|
| `document_signature_requests_one_anchor_chk` | `(org_document_id IS NOT NULL)::int + (employee_document_id IS NOT NULL)::int = 1` |
| `document_signature_requests_version_chk` | `document_version >= 1` |
| `document_signature_requests_signed_evidence_chk` | `status <> 'signed' OR (signed_at IS NOT NULL AND signer_name IS NOT NULL)` |

A `signed` row with no signer name or no timestamp is not evidence; the third CHECK makes that state unrepresentable rather than merely discouraged.

**Indexes**

| Name | Definition | Serves |
|---|---|---|
| `document_signature_requests_org_doc_user_ver_unique_idx` | `UNIQUE (org_document_id, user_id, document_version) WHERE org_document_id IS NOT NULL` | I-12 |
| `document_signature_requests_emp_doc_user_unique_idx` | `UNIQUE (employee_document_id, user_id) WHERE employee_document_id IS NOT NULL` | employee seam |
| `document_signature_requests_org_doc_idx` | `(org_id, org_document_id) WHERE org_document_id IS NOT NULL` | #59 matrix join |
| `document_signature_requests_org_pending_idx` | `(org_id, status) WHERE status = 'pending'` | the external-provider reconciliation job a later phase will need |

### 6.3 `document_settings` — three additive columns

`ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ...` only. Every existing row is backfilled by the default in the same statement; no data migration, no downtime window, and the old application binary keeps working against the new schema (§25.2).

| Column | Type | Default | CHECK |
|---|---|---|---|
| `document_acknowledgement_due_days` | INTEGER NOT NULL | `7` | `document_settings_ack_due_days_chk`: `BETWEEN 1 AND 365` |
| `document_acknowledgement_blocking` | BOOLEAN NOT NULL | `false` | — |
| `document_signature_provider` | VARCHAR(20) NOT NULL | `'internal_typed'` | `document_settings_signature_provider_chk`: `IN ('internal_typed','docusign','adobe_sign')` |

VARCHAR + CHECK rather than an ENUM for the settings column, matching the existing `document_settings` style (that table has no enum types) and keeping `down()` trivial. The two *table* columns use ENUMs, matching `org_document_recipients`' style. Each table stays internally consistent.

Default `7` for due-days is the conservative choice: short enough that "overdue" means something, and because `document_acknowledgement_blocking` defaults to `false`, an org that has configured nothing gets a visible-but-non-blocking signal rather than a surprise.

### 6.4 What migration `00051` does **not** do

- No `ALTER TYPE ... ADD VALUE` on `enum_org_document_recipients_state` — `acknowledged` and `signed` are already there (P-6).
- No new index on `org_document_recipients` — `org_document_recipients_org_due_idx` and `..._doc_state_idx` from `00050` are exactly the two P3 needs (P-7).
- No change to `document_audit_logs` — `entity_type` is a free `STRING(50)` (P-8).
- No change to `document_types`, `org_documents`, `employee_documents`, or seeder `009`. Seeder `009` is never edited (binding P2 rule).

---

## 7. Models

### 7.1 `document_acknowledgements.model.js`

```
tableName: 'document_acknowledgements'
timestamps: true, updatedAt: false, paranoid: false
```

`updatedAt: false` is the model-level half of append-only; the table has no `updated_at` column, so leaving it on would break every insert. Column definitions mirror §6.1 exactly. Associations: `belongsTo` `OrgDocument` as `org_document`, `belongsTo` `EmployeeDocument` as `employee_document`, `belongsTo` `User` as `user`. No `hasMany` is declared on `OrgDocument` — the matrix join is raw SQL and an unused association only invites an accidental `include` that leaks the table into an employee-facing projection.

### 7.2 `document_signature_requests.model.js`

```
tableName: 'document_signature_requests'
timestamps: true, paranoid: false
```

Column definitions mirror §6.2. Same association policy.

### 7.3 `document_settings.model.js` (MODIFIED)

Three columns appended, each with the `defaultValue` from §6.3 so an app-side full-row write matches the DB default. No existing column is touched. No behaviour change to `getOrCreate`.

---

## 8. Core Logic — Pure Utility Modules

Everything in this section is DB-free, clock-injectable and unit-tested without a database.

### 8.1 `document_compliance.utils.js` (NEW)

| Export | Signature | Behaviour |
|---|---|---|
| `SIGNATURE_PROVIDERS` | frozen `['internal_typed','docusign','adobe_sign']` | single source for the Joi enum, the settings CHECK mirror and the provider gate |
| `INTERNAL_PROVIDER` | `'internal_typed'` | |
| `isProviderAvailable(provider)` | → boolean | `provider === INTERNAL_PROVIDER`. The one place P3 decides what is shippable; adding DocuSign later is one line here plus an adapter |
| `isOverdue(dueOn, todayIst)` | → boolean | `dueOn != null && todayIst > dueOn`, both `YYYY-MM-DD`, strict greater-than. Due **today** is not overdue |
| `daysRemaining(dueOn, todayIst)` | → integer \| null | IST date-only difference; negative when overdue; `null` when `dueOn` is null |
| `resolveComplianceState({ state, dueOn, todayIst })` | → `'completed' \| 'waived' \| 'overdue' \| 'pending'` | `acknowledged`/`signed` → `completed`; `waived` → `waived`; else `isOverdue` → `overdue`; else `pending` |
| `isBlocking({ complianceState, blockingSetting })` | → boolean | `blockingSetting === true && complianceState === 'overdue'`. The entire meaning of setting #69 in P3 (§1.4 item 3) |
| `normaliseSignerName(value)` | → string | lowercase, NFKD-fold, collapse internal whitespace, strip `.` `,` `'` `-`. Used **only** for comparison; the stored `signer_name` is the raw input |
| `signerNameMatches(typed, { firstName, lastName, displayName })` | → boolean | true if `normaliseSignerName(typed)` equals the normalised `"first last"` **or** the normalised `displayName`. Both accepted because `display_name` is what the employee sees in the UI |

`isOverdue` and `daysRemaining` take `todayIst` as a parameter — they never call the clock. That is what makes the "missed cron is never a false negative" claim testable.

### 8.2 `document_org_rules.utils.js` (MODIFIED — additive only)

New export, existing exports byte-identical:

```
resolveRecipientAction({ status, displayStatus, state, requiresAcknowledgement, requiresSignature })
  → 'sign' | 'acknowledge' | null
```

Returns `null` unless `status === 'published'` **and** `displayStatus === 'active'` **and** `state ∉ {waived}`. Then: `requiresSignature && state !== 'signed'` → `'sign'`; else `requiresAcknowledgement && state === 'pending' || state === 'viewed'` → `'acknowledge'`; else `null`. Signature outranks acknowledgement because `signed` is the terminal state (R-79).

This is the reconciliation of CO-2. `isActionable(status)` keeps its current body and its current callers; only the self-plane readouts move to the new function, and they gain a new field rather than changing an existing one (§11.3).

### 8.3 `document_defaults.js` (MODIFIED)

- `DOCUMENT_SETTINGS_DEFAULTS` gains `document_acknowledgement_due_days: 7`, `document_acknowledgement_blocking: false`, `document_signature_provider: 'internal_typed'`.
- `SETTINGS_CAPS` gains `document_acknowledgement_due_days: { min: 1, max: 365 }`. (`document_acknowledgement_blocking` is a boolean and `document_signature_provider` is an enum; neither takes a numeric cap. Stated explicitly so the omission is not read as an oversight.)
- Re-exports `SIGNATURE_PROVIDERS` from `document_compliance.utils` rather than redeclaring it, so the Joi schema, the settings validator and the provider gate cannot drift.

### 8.4 Query shapes (designed, not measured — §1.4 item 1)

| Readout | Shape | Index it is designed for |
|---|---|---|
| #59 matrix page | `org_document_recipients` filtered by `(org_id, org_document_id[, state])`, ordered by `state, id`, paginated; then **two** batched lookups by the page's `(org_document_id, user_id[])` against the two evidence tables | `org_document_recipients_doc_state_idx`, then `document_acknowledgements_org_doc_idx` / `document_signature_requests_org_doc_idx` |
| #76 / #79 pending list | `org_document_recipients` `WHERE org_id = ? AND state IN ('pending','viewed') AND due_on IS NOT NULL` (+ `user_id IN (...)` for the manager), joined to `org_documents` on `status='published'`, aggregated by document | `org_document_recipients_org_due_idx` — the predicate is written to match the partial index's `WHERE` clause **exactly**, including the `due_on IS NOT NULL` term |
| #77 export | #76's query without pagination, streamed page-by-page at 1 000 rows | same |
| #75 receipt | `(org_id, user_id)` on the evidence tables | `document_acknowledgements_org_user_idx` |

Batched lookups rather than a three-way `LEFT JOIN` for the matrix: the join with `LIMIT`/`OFFSET` pushes Postgres into a subquery plan that will not use the state index, and the page is at most 200 rows, so two `IN`-list lookups are cheaper and far more predictable. `EXPLAIN` confirmation is a §28 gate, not an assumption.

---

## 9. Layer Responsibilities

| Layer | Owns | Must never |
|---|---|---|
| **Route** | Path, audience middleware stack, endpoint number comment, literal-before-parameterised ordering | Contain logic; call a service |
| **Controller** | `ctx(req)` (now including `userAgent`), `validateOrThrow` against params/body/query, calling exactly one service method, `envelope()` | Touch a model or a repository; build SQL; decide authorization; read `req.user.orgId` anywhere but `ctx` |
| **Validator** | Joi shape, enum membership, length and range bounds, `.unknown(false)` | Encode business rules that need DB state (e.g. "is this user a recipient") |
| **Service** | Transaction boundary, lock acquisition and ordering, state guards, evidence assembly, audit write inside the transaction, `AppError` selection | Format HTTP responses; read `req`; call another module's repository directly |
| **Repository** | Sequelize/raw SQL, attribute allow-lists, `org_id` in **every** predicate, lock hints | Contain business rules; open transactions; scrub fields (the allow-list is the scrub) |
| **Pure util** | Dates, overdue, compliance state, provider availability, name normalisation, recipient action | Import `db`, the clock, `fs`, `res`, or any service |

**Authorization is decided in exactly one place** — `document_authority.utils.js` — and re-asserted (never re-decided) in the service. No new authorization branch is added to a controller.

---

## 10. Feature Dossiers

Each dossier follows the fixed frame. A dimension that does not apply says so explicitly rather than being omitted.

### F-13 — Acknowledge an org document (self)

**Requirement.** Parent §1.1 row 6 ("Acknowledgment tracking for policy compliance") and §9 P3 scope line 2. A recipient of a published document that `requires_acknowledgement` records that they have read it; the record names the exact version and the exact bytes.

**Existing dependency.** `org_document_recipients` row (P2), `screenOrgDocument` + `resolveOrgDocumentAuthority` (P1/P2), `org_documents.version` + `checksum_sha256` (P2), `document_audit.service.record` (P1), settings singleton (P1).

**Database impact.** Insert one `document_acknowledgements` row. Update the recipient row's `state` → `acknowledged` (and `first_viewed_at` if it is still null — a recipient who acknowledges without ever hitting `view-url` has demonstrably viewed it). No other table written. `org_documents` is **not** updated — there is no denormalised acknowledged-count column, deliberately: it would need to be maintained under the same lock as publish and would be a second source of truth for a number `counts_by_state` already computes correctly.

**API impact.** New `POST /api/v1/documents/me/hr-documents/:id/acknowledge` (#73). Body `{ }` or `{ "confirm": true }` — see Validation. Response `201` with the created acknowledgement (id, document_version, content_checksum, acknowledged_at) plus the new recipient `state`. Idempotent replay returns `200` with the existing row and `already_acknowledged: true`.

**Business logic.**
1. Load the document by `(org_id, id)`. Not found → uniform `404`.
2. `screenOrgDocument({ audience: 'self', status, effectiveConfidential })`; deny → `404`.
3. Load the caller's recipient row. Absent → `404` (K-1).
4. `resolveOrgDocumentAuthority({ audience:'self', action:'acknowledge', isRecipient, status, ... })`; deny → `404`.
5. Guard: `requires_acknowledgement === true`, else `422 ACKNOWLEDGEMENT_NOT_REQUIRED`.
6. Guard: `resolveOrgDisplayStatus(doc, todayIst) === 'active'`, else `409 ORG_DOCUMENT_NOT_ACTIONABLE` (a document whose `effective_to` has passed cannot be newly acknowledged).
7. Open the transaction. `SELECT ... FOR SHARE` on the `org_documents` row, then `SELECT ... FOR UPDATE` on the recipient row — in that order, always (§16.4).
8. Re-read state under the lock. `acknowledged`/`signed` → idempotent success. `waived` → `409 RECIPIENT_WAIVED`.
9. Insert the evidence row with `document_version = doc.version`, `content_checksum = doc.checksum_sha256` (may be `NULL`, K-2), `acknowledged_at = now()`, IP, user-agent, request id.
10. Update the recipient row to `acknowledged`.
11. `auditService.record({ action: 'org_document.acknowledged', entityType: 'org_document', entityId: docId, targetUserId: actorId, newValues: { state:'acknowledged', document_version, acknowledgement_id } }, t)` — **inside** the transaction.
12. Commit.

**Validation.** Body is `Joi.object({ confirm: Joi.boolean().valid(true) }).unknown(false)` with `confirm` optional. The field exists so a UI can make the act explicit; the server does not require it, because the HTTP verb and the URL already are the act and demanding a magic boolean would be ceremony. `:id` must be a v4 UUID.

**Authorization.** Self plane: `authenticate` + `requireFeature('documents.access')` only — **no** `authorize()` call, matching every other `/me` route. The recipient check is the authorization. `hr` and `manager` cannot acknowledge on anyone's behalf through this route, and no HR-side "acknowledge for employee" endpoint exists (that would destroy the evidentiary value of the whole table).

**Storage / file impact.** None. Acknowledging touches no object, issues no presigned URL, and reads no `storage_key`. `findByIdForStorage` is **not** called anywhere in this flow, which keeps the P2 three-call-site chokepoint assertion intact.

**Failure handling.** Unique-violation on the partial index → translate to idempotent success by re-reading the existing row (the state guard makes this nearly unreachable; the index is the backstop for the interleaving in C-23). Lock timeout → `503` from the generic handler, no partial state. Audit write failure → the whole transaction rolls back; an acknowledgement with no audit row is impossible by construction.

**Testing.** T-32…T-38 (§24.2).

**Acceptance criteria.**
- A recipient of a published, `requires_acknowledgement` document gets `201`, one evidence row carrying the document's exact `version` and `checksum_sha256`, and recipient `state = 'acknowledged'`.
- The same call again returns `200`, `already_acknowledged: true`, and the row count on `document_acknowledgements` is unchanged.
- A non-recipient gets `404` with body byte-identical to a genuinely missing id.
- A `waived` recipient gets `409 RECIPIENT_WAIVED`.
- A document that does not require acknowledgement gets `422 ACKNOWLEDGEMENT_NOT_REQUIRED`.
- No repository method exists that can update or delete a `document_acknowledgements` row.

### F-14 — Internal typed signature (self)

**Requirement.** Parent §1.1 row 5 and D-13: "legally-evidenced internal acknowledgment/typed-signature flow — precisely what the requirement's 'audit trail (timestamp, IP, user ID)' describes — behind a pluggable `provider` enum".

**Existing dependency.** Everything F-13 depends on, plus `org_documents.requires_signature` (P2) and `user_profiles.first_name/last_name/display_name` (auth module).

**Database impact.** Insert one `document_signature_requests` row at `status = 'signed'`. Update the recipient row to `signed`. No update path to an already-`signed` row exists.

**API impact.** New `POST /api/v1/documents/me/hr-documents/:id/sign` (#74). Body `{ "signer_name": "<string>" }`. Response `201` with the signature record (id, provider, document_version, content_checksum, signer_name, signed_at) plus the new recipient state. Replay → `200`, `already_signed: true`.

**Business logic.** Steps 1–4 identical to F-13 with `action: 'sign'`. Then:
5. Guard `requires_signature === true`, else `422 SIGNATURE_NOT_REQUIRED`.
6. Guard display status `active`, else `409 ORG_DOCUMENT_NOT_ACTIONABLE`.
7. Resolve `provider = settings.document_signature_provider`. If `!isProviderAvailable(provider)` → **throw `503 SIGNATURE_PROVIDER_UNAVAILABLE`** with `details: { provider }`, **before any transaction is opened**. This is EC-33's "no partial state", enforced structurally: there is no transaction to leave half-done.
8. Load the signer's own `user_profiles` row and check `signerNameMatches` → else `422 SIGNER_NAME_MISMATCH` (no `details` echoing the expected name — that would turn the endpoint into a name-disclosure oracle for any account whose id you can guess; the caller is signing for themselves, so they know their own name).
9. Open the transaction; same lock order as F-13.
10. Re-read under lock. `signed` → idempotent success. `waived` → `409 RECIPIENT_WAIVED`. `acknowledged` → **allowed to proceed** (R-79 monotonicity: signing is strictly stronger).
11. Insert the signature row: `provider = 'internal_typed'`, `status = 'signed'`, `signer_name` raw as typed, `signed_at = requested_at = now()`, `provider_reference = NULL`, IP, user-agent, request id, `document_version`, `content_checksum`.
12. Update the recipient to `signed`.
13. Audit `org_document.signed` inside the transaction. `signer_name` is **not** placed in `newValues` — it is PII that belongs in the evidence table, not duplicated across the audit spine.
14. Commit.

**Validation.** `signer_name`: `Joi.string().trim().min(2).max(150).required()`. Rejecting at 150 matches the column, so a long name fails as a `400` rather than a DB truncation error.

**Authorization.** Same as F-13. A signature can only ever be produced by the signer's own authenticated session — there is no delegate path, by design.

**Storage / file impact.** None. P3 produces **no** signed artefact, stamps nothing onto the PDF, and does not re-upload anything. The evidence is the database row, exactly as D-13 describes. A visibly-stamped document is a certificate-backed-provider feature and is deferred with the rest of it.

**Failure handling.** Provider unavailable → `503`, nothing written, recipient state unchanged (asserted by T-42). Name mismatch → `422`, nothing written. Unique violation → idempotent success. Everything else as F-13.

**Testing.** T-39…T-44.

**Acceptance criteria.**
- With `document_signature_provider = 'internal_typed'`, a recipient signing a `requires_signature` document gets `201`, one `status='signed'` row with their typed name, and recipient `state = 'signed'`.
- With `document_signature_provider = 'docusign'`, the same call validates the body fully and then returns `503 SIGNATURE_PROVIDER_UNAVAILABLE`; `document_signature_requests` has zero new rows and the recipient state is byte-identical to before (EC-33).
- A typed name that does not match the signer's profile gets `422 SIGNER_NAME_MISMATCH` and the response contains no name.
- Signing after acknowledging moves `acknowledged → signed`; acknowledging after signing is an idempotent no-op that never regresses the state (R-79).

### F-15 — Evidence readouts (self #75, HR #78)

**Requirement.** Parent §1.1 row 7, "Legal validation with audit trail".

**Existing dependency.** Uniform denial; the two new tables.

**Database impact.** Read-only.

**API impact.** `GET /me/hr-documents/:id/acknowledgement` (#75) → the caller's own acknowledgement and/or signature for that document, or `404` if they have none. `GET /hr/org-documents/:id/acknowledgements/:userId` (#78) → the same pair for a named employee, HR only.

**Business logic.** #75 runs the self screen first (a non-recipient gets the same `404` as a non-existent document), then reads by `(org_id, org_document_id, user_id)`. #78 is HR-plane: the route's `authorize(['hr'])` is the gate; a missing document or a missing record both yield `404`.

**Validation.** UUID params only.

**Authorization.** #75 self plane, recipient-anchored. #78 `authorize(['hr'])` — per D-10, `admin` and `super-admin` appear in no `authorize()` list in this module and therefore cannot read evidence.

**Storage / file impact.** None.

**Failure handling.** Nothing to fail transactionally; a read error surfaces as `500` through the generic handler.

**Testing.** T-45, T-46.

**Acceptance criteria.** An employee can retrieve their own receipt including `document_version` and `content_checksum`. HR can retrieve any employee's. Neither endpoint exposes `storage_key`, `reference_url`, or another employee's identity to the self caller.

### F-16 — HR per-document acknowledgement matrix (#59 extended)

**Requirement.** Parent P3 scope: "HR compliance view: per-document acknowledgment matrix".

**Existing dependency.** #59 `GET /hr/org-documents/:id/recipients` with `states`/`limit`/`offset` filters, `findByDocument`, `countsByState`.

**Database impact.** Read-only. Two batched evidence lookups per page (§8.4).

**API impact.** **Modified endpoint.** #59's response gains, on each row: `compliance_state` (`completed`/`waived`/`overdue`/`pending`), `is_overdue`, `days_remaining`, `acknowledged_at`, `acknowledgement_id`, `signed_at`, `signature_request_id`, `acknowledged_version`. The top level gains a `compliance` block: `{ requires_acknowledgement, requires_signature, due_on_basis, completed, pending, overdue, waived, completion_rate }`. Existing fields and `counts_by_state` are unchanged; this is purely additive. New optional query filter `compliance_state`. **Requires a dated change record** (§27).

**Business logic.** Page the roster as today, then batch-load evidence for the page's user ids, then compute `resolveComplianceState` per row against `toIstDateString(new Date())` computed **once** per request.

**Validation.** `compliance_state` is a Joi enum of the four values; `limit` keeps its existing `max: 200`.

**Authorization.** Unchanged — `authorize(['hr'])`.

**Storage / file impact.** None.

**Failure handling.** If an evidence lookup fails the whole request fails; the matrix must never render a `completed` row as `pending` because half the join failed silently.

**Testing.** T-47, T-48.

**Acceptance criteria.** For a document with 3 acknowledged, 46 pending (of which 5 past `due_on`) and 1 waived, the matrix returns `completed: 3, pending: 41, overdue: 5, waived: 1` and each row's `compliance_state` matches its own `state`/`due_on`. No existing #59 field changed name, type or meaning.

### F-17 — HR org-wide pending list (#76) and export (#77)

**Requirement.** Parent P3 scope: "pending list, export".

**Existing dependency.** `org_document_recipients_org_due_idx`; `payroll/utils/csv_writer.utils`; `payroll/utils/download_headers.utils`.

**Database impact.** Read-only.

**API impact.** `GET /hr/org-documents/compliance` (#76): query `type_id`, `document_id`, `overdue_only`, `department_id`, `limit`, `offset`; grouped **by document**, each entry carrying `{ document_id, title, version, type, published_at, requires_acknowledgement, requires_signature, total, completed, pending, overdue, waived, completion_rate }`. `GET /hr/org-documents/compliance/export` (#77): the same filters, `Content-Type: text/csv`, one row **per recipient**, columns `document_id, document_title, document_version, employee_code, user_id, state, compliance_state, due_on, days_remaining, first_viewed_at, acknowledged_at, acknowledged_version, signed_at, signer_provider, waived_at, waived_reason`.

**Business logic.** Both restrict to `org_documents.status = 'published'` — compliance against a retired policy is a Phase-5 historical report, not a live pending list. `department_id` filters through `employee_profiles.department_id`, never the free-text `department` column. Export streams at 1 000 rows per page and writes an audit row `org_document.compliance_exported` via `recordDetached` with `{ row_count, filters }` and **no** employee identifiers.

**Validation.** All UUIDs validated; `limit` max 100 for #76. #77 takes no `limit` and is bounded instead by a hard `COMPLIANCE_EXPORT_MAX_ROWS = 50000` — beyond that it returns `422 EXPORT_TOO_LARGE` with the actual count and a hint to narrow the filters, rather than streaming for minutes and timing out behind a proxy.

**Authorization.** `authorize(['hr'])` on both.

**Storage / file impact.** The CSV is generated and streamed; nothing is written to S3 and no `document_export_jobs` row is created (that table is Phase 5).

**Failure handling.** A mid-stream failure after headers are sent cannot be converted to a JSON error; the service therefore counts rows **first** (the `EXPORT_TOO_LARGE` guard) and only then begins writing, so the realistic failure modes are all pre-header. A post-header failure closes the connection and is logged at `[Document]` error level with the request id — the client sees a truncated file, which is detectable, rather than a silently short one.

**Testing.** T-49…T-52.

**Acceptance criteria.** #76 lists every published acknowledgement-bearing document with correct tallies. `overdue_only=true` returns only documents with at least one overdue recipient. #77 emits a UTF-8 BOM, CRLF line endings, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and formula-guards every user-controlled cell. An export of 50 001 matching rows returns `422` and writes nothing.

### F-18 — Manager Tier-A compliance view (#79)

**Requirement.** Parent P3 scope: "Manager Tier-A view: which of my reports have not acknowledged what". Parent §7 Tier A: "see expiry/acknowledgment compliance status".

**Existing dependency.** `hierarchyAccess.getAccessibleUserIds` (D-10), setting #58 `manager_can_view_team_documents`, #76's query.

**Database impact.** Read-only.

**API impact.** `GET /manager/org-documents/compliance` (#79): query `overdue_only`, `user_id`, `document_id`, `limit`, `offset`; response grouped **by employee** (not by document — a manager's question is "who on my team is behind", not "how is this policy doing org-wide"), each entry `{ user_id, employee_code, display_name, pending_count, overdue_count, documents: [{ document_id, title, version, state, compliance_state, due_on, days_remaining }] }`.

**Business logic.** `accessibleIds = await getAccessibleUserIds(orgId, actorId)`. Per D-10: if it is `null` or empty → `200` with an empty list, **never** a global scope. The `user_id IN (:accessibleIds)` predicate is applied in the repository, not filtered in JS. An explicit `user_id` query param is intersected with the scope; a non-report id yields an empty result, not a `403`, because `/compliance` is not `/:userId`-addressed and an empty list leaks nothing.

Confidential documents are **excluded** from the manager view: a manager must not learn that a direct report was served a `warning_letter` unless they proposed it themselves. The predicate is `resolveEffectiveConfidential(type, doc) === false`, applied server-side.

**Validation.** UUIDs; `limit` max 100.

**Authorization.** `authorize(['manager','hr'])` + `requireFeature('documents.access')`, then the service asserts `settings.manager_can_view_team_documents === true`, else `403 FORBIDDEN` — this route is `/compliance`-addressed, not `/:id`-addressed, so `403` is the correct code here and does not conflict with K-1.

**Storage / file impact.** None.

**Failure handling.** A hierarchy-service failure propagates; it is never defaulted to "no scope" (silently returning an empty list on an outage would read as "my team is fully compliant", which is the worst possible failure direction for a compliance view).

**Testing.** T-53…T-56.

**Acceptance criteria.** A manager sees pending/overdue rows for exactly their accessible users and no one else. A manager with no reports gets an empty list, never the org. A confidential document served to a direct report never appears. With `manager_can_view_team_documents = false` the endpoint returns `403`.

### F-19 — Org settings #68–#70 and the due-day fallback

**Requirement.** Parent §11 assigns to Phase 3: "Acknowledgment due-days default; whether acknowledgment is blocking" and "Signature provider selection (`internal_typed` | `docusign` | `adobe_sign`)".

**Existing dependency.** `document_settings` singleton, `getOrCreate`, `SETTINGS_CAPS`, existing `PUT /hr/settings`.

**Database impact.** Three columns (§6.3).

**API impact.** `GET /hr/settings` and `PUT /hr/settings` (existing endpoints) gain the three keys. **Requires a dated change record.** Endpoints #47 (publish) and #60 (recipients/sync) change behaviour — `due_on` is now populated for a document that requires acknowledgement but names no per-document window — which is a response-visible change on #47's `recipient_count`-bearing payload only indirectly, but is visible on #59/#70. Recorded in the same change record.

**Business logic.**
- `document_acknowledgement_due_days`: used **only** as the fallback when `org_documents.acknowledgement_due_days IS NULL` **and** `requires_acknowledgement IS TRUE`. `resolveDueOn` itself is unchanged; the two call sites become `resolveDueOn(when, row.requires_acknowledgement ? (row.acknowledgement_due_days ?? settings.document_acknowledgement_due_days) : null)`. A document that does not require acknowledgement still gets `due_on = null`.
- `document_acknowledgement_blocking`: read-side only (§1.4 item 3). It sets `is_blocking` on self readouts (#70/#71) and on the matrix rows. It gates nothing in P3.
- `document_signature_provider`: the sole input to F-14's provider gate.

**Validation.** Due-days integer 1–365, enforced in Joi, in `SETTINGS_CAPS` and by the DB `CHECK` — three layers, matching the existing TTL/size settings' discipline. Provider must be one of `SIGNATURE_PROVIDERS`. Setting the provider to `docusign` is **permitted** (so an org can stage the switch), and every sign call then returns `503`; it is not silently rejected at write time, because pretending the value is invalid would hide the real state from HR.

**Authorization.** Existing `PUT /hr/settings`, `authorize(['hr'])`. Unchanged.

**Storage / file impact.** None.

**Failure handling.** Already-published documents keep the `due_on` they were published with; changing the default never retroactively rewrites existing recipient rows. That is deliberate — a compliance deadline that moves because someone edited a setting is not a deadline. Stated in R-86 and asserted by T-58.

**Testing.** T-57…T-59.

**Acceptance criteria.** The three keys round-trip through `GET`/`PUT /hr/settings` and are rejected outside their caps. Publishing an acknowledgement-bearing document with `acknowledgement_due_days = null` now yields a non-null `due_on` derived from the org default. Existing recipient rows are never rewritten when the setting changes.

---

## 11. API Surface

### 11.1 New endpoints #73 … #79

| # | Method | Path | Audience | Middleware | Purpose |
|---|---|---|---|---|---|
| 73 | POST | `/api/v1/documents/me/hr-documents/:id/acknowledge` | self | `authenticate`, `requireFeature('documents.access')` | F-13 |
| 74 | POST | `/api/v1/documents/me/hr-documents/:id/sign` | self | same | F-14 |
| 75 | GET | `/api/v1/documents/me/hr-documents/:id/acknowledgement` | self | same | F-15 |
| 76 | GET | `/api/v1/documents/hr/org-documents/compliance` | HR | `authenticate`, `authorize(['hr'])`, `requireFeature` | F-17 |
| 77 | GET | `/api/v1/documents/hr/org-documents/compliance/export` | HR | same | F-17 |
| 78 | GET | `/api/v1/documents/hr/org-documents/:id/acknowledgements/:userId` | HR | same | F-15 |
| 79 | GET | `/api/v1/documents/manager/org-documents/compliance` | manager | `authenticate`, `authorize(['manager','hr'])`, `requireFeature` | F-18 |

Registration order in `document_org_hr.routes.js`: #76 and #77 go in the **literal-paths block** alongside `/org-documents/proposals`, above `router.get('/org-documents/:id')`. #78 is `:id`-parameterised and goes in the parameterised block. In `document_org_manager.routes.js`, #79 goes above `router.get('/org-documents/:id')`, next to `/org-documents/types` and `/org-documents/mine`.

### 11.2 Endpoint-level responsibilities

| # | Controller does | Service does | Repository does |
|---|---|---|---|
| 73 | `ctx` (+userAgent), validate `:id` + body, call `acknowledgementService.acknowledge` | screen → authorise → guard → txn → lock order → insert evidence → transition recipient → audit → commit | insert; `findByDocAndUser(lock:true)`; `findById(lock:'share')`; update recipient state |
| 74 | as #73 plus `signer_name` | as #73 plus provider gate (pre-txn) and name match | insert; same locks |
| 75 | validate `:id` | self screen → read by `(org, doc, user)` | two point reads |
| 76 | validate query **inside** the controller | resolve `todayIst` once → aggregate → shape | one aggregate query against the partial index |
| 77 | validate query, set headers from `buildDownloadHeaders`, stream | count-guard → page → map rows to CSV → detached audit | paged aggregate |
| 78 | validate `:id` + `:userId` | HR read, `404` on either miss | two point reads |
| 79 | validate query | `getAccessibleUserIds` → setting gate → scoped aggregate → group by employee | scoped aggregate |

### 11.3 Modified existing endpoints (all additive)

| # | Endpoint | Change | Breaking? |
|---|---|---|---|
| 59 | `GET /hr/org-documents/:id/recipients` | per-row compliance + evidence fields; top-level `compliance` block; new optional `compliance_state` filter | No — additive only |
| 70 | `GET /me/hr-documents` | each row gains `acknowledgement: { required, signature_required, state, due_on, days_remaining, is_overdue, is_blocking, acknowledged_at, signed_at }` and `document.next_action` (`acknowledge` / `sign` / `null`); new optional filters `compliance_state`, `overdue_only` | No — additive only |
| 71 | `GET /me/hr-documents/:id` | same `acknowledgement` block and `next_action` | No |
| — | `GET` / `PUT /hr/settings` | three new keys | No |
| 47 | `POST /hr/org-documents/:id/publish` | `due_on` now falls back to the org default (S-13) | Behaviourally visible on #59/#70; no field added or removed |
| 60 | `POST /hr/org-documents/:id/recipients/sync` | same fallback | same |

`document.is_actionable` on #70/#71 keeps its current status-only meaning and is **not** removed; `next_action` is the new, recipient-aware field. Deleting `is_actionable` would break any existing consumer, and the two coexist harmlessly — but the change record states plainly that `next_action` is the one to use.

### 11.4 Response envelope

Every endpoint uses the module's existing `{ success, message, data }` envelope via `envelope()`, except #77, which returns a raw CSV body with the header triple from `buildDownloadHeaders({ format: 'csv', fileName, byteLength })`.

---

## 12. Business Rules & Validations

Continuing the module register (P1 R-1…R-35, P2 R-36…R-75).

| # | Rule |
|---|---|
| R-76 | Only a **recipient** of an org document may acknowledge or sign it. Non-recipients receive the uniform `404` (K-1). |
| R-77 | Only a document with `status = 'published'` **and** derived display status `active` may be newly acknowledged or signed. `superseded` and `retired` documents remain readable but are no longer actionable. |
| R-78 | `requires_acknowledgement` gates #73; `requires_signature` gates #74. Neither flag implies the other. |
| R-79 | **Recipient state is monotonic** along `pending < viewed < acknowledged < signed`. A transition never regresses: acknowledging an already-`signed` document is an idempotent no-op; signing an already-`acknowledged` document advances to `signed`. `waived` sits outside the order and is terminal (R-80). |
| R-80 | A `waived` recipient cannot acknowledge or sign (`409 RECIPIENT_WAIVED`). Conversely an `acknowledged` / `signed` recipient cannot be waived (existing P2 `409 RECIPIENT_ALREADY_COMPLETED`, now reachable). |
| R-81 | An acknowledgement records `document_version` from the document row at the moment of the act and is unique per `(org_document_id, user_id, document_version)`. An acknowledgement of v1 therefore never satisfies v2 (EC-12). |
| R-82 | `content_checksum` is recorded as-is, including `NULL` for multipart uploads and `reference`-backed documents (K-2). A null checksum never blocks an acknowledgement. |
| R-83 | A `document_acknowledgements` row is never updated and never deleted, by anyone, including HR, including the module's own code. Enforced by the absence of repository methods; asserted by T-36. |
| R-84 | A `document_signature_requests` row at `status = 'signed'` is never updated and never deleted. The only update method carries `WHERE status = 'pending'`. |
| R-85 | Every state-changing acknowledgement / signature act writes its audit row **inside** the same transaction. There is no `recordDetached` on any P3 write path; the only detached audit in P3 is `org_document.compliance_exported`, which observes a read. |
| R-86 | Changing `document_acknowledgement_due_days` never rewrites an existing recipient row's `due_on`. The setting applies at publish and at sync only. |
| R-87 | `due_on` falls back to the org default **only** when `requires_acknowledgement` is true and the per-document value is null. A non-acknowledgement document keeps `due_on = null`. |
| R-88 | A typed signature's `signer_name` must match the signer's own profile name under `normaliseSignerName` (`first last`, or `display_name`). Mismatch → `422 SIGNER_NAME_MISMATCH`, with no name echoed back. |
| R-89 | The typed name is stored **exactly as typed**. Normalisation is for comparison only; the evidence is what the human wrote. |
| R-90 | Signature provider comes from org settings, never from the request body. A client cannot choose its own provider. |
| R-91 | A non-`internal_typed` provider validates the whole request and then fails with `503 SIGNATURE_PROVIDER_UNAVAILABLE` before any transaction opens. No row, no state change, no audit (EC-33). |
| R-92 | Overdue is derived on read from `due_on` vs today in IST, strict greater-than. It is never persisted, so a missed cron can never produce a compliance false-negative (EC-17 discipline). Due **today** is not overdue. |
| R-93 | `document_acknowledgement_blocking` sets a read-side `is_blocking` flag on overdue rows and gates no operation in Phase 3. |
| R-94 | Compliance readouts (#76 / #77 / #79) cover `status = 'published'` documents only. |
| R-95 | The manager compliance view excludes documents whose `resolveEffectiveConfidential` is true, and is scoped to `getAccessibleUserIds`; a `null` or empty scope yields an empty list, never the org (D-10). |
| R-96 | All department filtering uses `employee_profiles.department_id`. The free-text `department` column is never used for grouping or filtering. |
| R-97 | The compliance export is capped at `COMPLIANCE_EXPORT_MAX_ROWS = 50000`; beyond that, `422 EXPORT_TOO_LARGE` before a single byte is written. |
| R-98 | No P3 code path reads `storage_key`. `findByIdForStorage` keeps exactly its P2 call sites. |
| R-99 | `user_agent` is truncated to 512 characters by the service before insert, and is never logged. |

### 12.1 Validation layers

| Value | Joi | Service guard | DB |
|---|---|---|---|
| `:id`, `:userId` | v4 UUID | — | FK |
| `signer_name` | trim, 2–150 | R-88 profile match | `VARCHAR(150)`, `signed_evidence_chk` |
| `document_acknowledgement_due_days` | int 1–365 | `SETTINGS_CAPS` | `ack_due_days_chk` |
| `document_signature_provider` | enum | `isProviderAvailable` at sign time | `signature_provider_chk` |
| `compliance_state` filter | enum of 4 | — | — |
| `document_version` | — | copied from the row, never client input | `version_chk >= 1` |
| exactly-one anchor | — | the service only ever sets one | `one_anchor_chk` |

`document_version`, `content_checksum`, `acknowledged_at`, `signed_at`, `ip_address` and `user_agent` are **server-derived without exception**. No request body can influence any of them; that is what makes the row evidence rather than a client assertion.

---

## 13. Authorization & Security

### 13.1 Chokepoint extension (additive)

`document_authority.utils.js` gains one frozen set:

```
ORG_SELF_WRITE_ACTIONS = Object.freeze(new Set(['acknowledge', 'sign']))
```

The `self` branch of `resolveOrgDocumentAuthority` becomes: read actions as today; then, for `ORG_SELF_WRITE_ACTIONS`, require `isRecipient === true` **and** `ORG_VISIBLE_STATUS.self.has(status)` **and** `status === 'published'`; every other action still returns `SELF_WRITE_FORBIDDEN`. The `hr` and `manager` branches are untouched — a manager acknowledging on behalf of a report falls through to the existing `MANAGER_WRITE_FORBIDDEN`, which is the correct answer and needs no new code.

The two existing exported functions keep their signatures and their behaviour for every existing input. T-53 asserts this by replaying the P2 authority fixtures unchanged.

### 13.2 Role planes (D-10)

`admin` and `super-admin` appear in **no** `authorize()` list added by Phase 3. `hr` is the top tenant role. Compliance data is tenant data, and platform roles get none of it.

### 13.3 Denial-code map

| Situation | Route shape | Code |
|---|---|---|
| Non-recipient acknowledges / signs | `/:id`-addressed | `404 DOCUMENT_NOT_FOUND` (K-1) |
| Document does not exist | `/:id`-addressed | `404 DOCUMENT_NOT_FOUND` — byte-identical to the above |
| Document not visible to self (`draft` / `rejected`) | `/:id`-addressed | `404` |
| Manager view disabled by setting #58 | collection | `403 FORBIDDEN` |
| Manager requests a non-report's `user_id` | collection | `200` with an empty list |
| HR reads evidence that does not exist | `/:id/.../:userId` | `404` |
| Wrong role on an HR route | any | `403` from `authorize` |

Two shapes, one rule: **`/:id`-addressed → `404`; collection-addressed → `403` or an empty list.** P3 introduces no third shape.

### 13.4 Data-exposure controls

- The self-plane compliance projection exposes only the caller's own recipient row. An employee can never learn who else received a document, how many did, or how many acknowledged — the P2 `EMPLOYEE_DOC_ATTRIBUTES` / `RECIPIENT_ATTRIBUTES` allow-lists are extended field by explicit field, not opened up.
- #78 returns evidence for a named user and is HR-only.
- `signer_name` appears in the evidence tables and in HR readouts. It is never written to `document_audit_logs` and never logged.
- The CSV export formula-guards every user-controlled cell (employee names, document titles, waive reasons) through the reused `csv_writer.utils`, and is served `attachment` + `nosniff` + `private, no-store` — a compliance CSV rendered inline is a stored-XSS vector in the application's own origin.
- `storage_key`, `reference_url` and `document_number` remain unreachable from every P3 surface.

---

## 14. Document Lifecycle & State Transitions

### 14.1 Org document status (unchanged by P3)

`draft → published → superseded`, `published → retired`, `draft → rejected`. **P3 adds no status and no transition.** There is still no `PATCH /documents/:id/status` on either plane.

### 14.2 Recipient state machine (completed by P3)

| From | Verb | To | Owner | Phase |
|---|---|---|---|---|
| `pending` | view-url (#72) | `viewed` | self | P2 |
| `pending`, `viewed` | acknowledge (#73) | `acknowledged` | self | **P3** |
| `pending`, `viewed`, `acknowledged` | sign (#74) | `signed` | self | **P3** |
| `pending`, `viewed` | waive (#61) | `waived` | HR | P2 |
| `acknowledged`, `signed` | waive | — | — | `409 RECIPIENT_ALREADY_COMPLETED` |
| `waived` | acknowledge / sign | — | — | `409 RECIPIENT_WAIVED` |
| any | delete | — | — | impossible; `waived` is the only exit (D-14) |

`acknowledged → acknowledged` and `signed → signed` are idempotent successes, not transitions. `signed` is terminal.

### 14.3 Version and the acknowledgement (EC-12)

A republish is a **new `org_documents` row** (new id, same `document_group_id`, `version + 1`) with its **own** recipient roster materialised fresh at `pending`. v1's recipients and v1's acknowledgements stay attached to v1, which moves to `superseded`. Employees therefore return to `pending` for v2 as a structural consequence of the P2 design — there is no reset job, no state rewrite, and no way for a v1 acknowledgement to satisfy v2. The unique index on `(org_document_id, user_id, document_version)` is the belt to that braces.

---

## 15. Workflows

### 15.1 Acknowledge (happy path)

```
employee -> GET  /me/hr-documents                  (#70)  next_action "acknowledge", due_on, days_remaining
employee -> GET  /me/hr-documents/:id/view-url     (#72)  pending -> viewed, presigned GET
employee -> POST /me/hr-documents/:id/acknowledge  (#73)  201, evidence row, viewed -> acknowledged
HR       -> GET  /hr/org-documents/:id/recipients  (#59)  matrix shows them completed
```

### 15.2 Sign

```
employee -> GET  /me/hr-documents/:id              (#71)  next_action "sign"
employee -> POST /me/hr-documents/:id/sign         (#74)  { signer_name }
                                                          internal_typed -> 201, state signed
                                                          docusign       -> 503, nothing written
```

### 15.3 Republish (EC-12 end to end)

```
HR -> POST /hr/org-documents/:id/replace           (#48)  new draft v2, same group
HR -> POST /hr/org-documents/:newId/file           (#45)  + confirm (#46)
HR -> POST /hr/org-documents/:newId/publish        (#47)  v1 -> superseded; v2 roster materialised at pending
employee -> GET /me/hr-documents                   (#70)  v2 next_action "acknowledge"; v1 next_action null
```

### 15.4 Compliance chase (P3's ceiling)

```
HR      -> GET /hr/org-documents/compliance         (#76)  overdue_only=true
HR      -> GET /hr/org-documents/compliance/export  (#77)  CSV for the audit file
manager -> GET /manager/org-documents/compliance    (#79)  my team's gaps
```

The next step a user wants here is "remind them", which is Phase 4. P3 deliberately stops at the readout rather than shipping half a notification.

---

## 16. Transactions & Concurrency

### 16.1 Transaction boundaries

| Flow | Boundary |
|---|---|
| #73 acknowledge | one unmanaged transaction: `FOR SHARE` doc → `FOR UPDATE` recipient → insert evidence → update recipient → audit → commit |
| #74 sign | identical, with the provider gate and the name check **before** `db.sequelize.transaction()` |
| #75, #76, #78, #79 | none (reads) |
| #77 export | none; paged reads plus one `recordDetached` audit |
| settings update | existing transaction, unchanged |

Idiom, unchanged from P1/P2: open unmanaged, `await t.commit()` on success, `if (!t.finished) await t.rollback(); throw err` in the catch.

### 16.2 Race register (continuing P1 C-1…C-11, P2 C-12…C-22)

| # | Race | Resolution |
|---|---|---|
| C-23 | Two concurrent acknowledges from the same user (double-click, client retry) | `FOR UPDATE` on the recipient row serialises them; the second sees `acknowledged` and returns the existing row. The partial unique index is the backstop. Exactly one evidence row. |
| C-24 | Acknowledge racing HR waive (#61) | Both take `FOR UPDATE` on the same recipient row. Whichever commits first wins: waive-then-acknowledge → `409 RECIPIENT_WAIVED`; acknowledge-then-waive → `409 RECIPIENT_ALREADY_COMPLETED` (existing P2 guard). The row is never both. |
| C-25 | Acknowledge racing publish-of-v2 (which supersedes v1) | Acknowledge holds `FOR SHARE` on the v1 row; publish's supersede is an `UPDATE` on that same row and blocks until the acknowledgement commits. The acknowledgement is then truthful evidence for the version actually served, and v2's roster is independent. Deliberately **not** guarded by the `docorg:` advisory lock — §16.4. |
| C-26 | Acknowledge racing sign for the same recipient | Serialised on the recipient row. R-79 monotonicity means either order ends at `signed` with both evidence rows present, which is correct: the employee did both. |
| C-27 | Two concurrent signs | As C-23, against the signature unique index. |
| C-28 | Acknowledge racing `recipients/sync` (#60) | Sync only inserts missing rows (`ignoreDuplicates`) and never touches an existing row's state. No conflict. |
| C-29 | Compliance export running while acknowledgements commit | The export is a paged read, not a snapshot; a row may move from pending to completed between pages. Accepted: the CSV carries `generated_at` and the tallies are point-in-time. A `REPEATABLE READ` snapshot would hold a transaction open for minutes across a 50 000-row export for no compliance benefit. |
| C-30 | Settings change racing publish | The publish transaction reads settings inside itself; whichever value is committed at that instant is frozen into `due_on`. R-86 makes this harmless — `due_on` is decided once and never re-derived. |

### 16.3 Lock ordering (extends the P1/P2 protocol)

The module's standing rule is: **advisory lock before any row lock; row locks in ascending `id` order**. P3 adds one ordered pair and takes no advisory lock:

```
1. org_documents            FOR SHARE    (the subject document)
2. org_document_recipients  FOR UPDATE   (the caller's own row)
```

Always in that order, in both #73 and #74. No P3 path locks more than these two rows, so intra-P3 deadlock is impossible. Against P2's writers: publish and sync take `advisory → org_documents FOR UPDATE → bulk INSERT` and never row-lock an existing recipient; waive takes only the recipient row. No cycle exists.

`org_document.repository.findById` is extended to accept `lock: 'share'` alongside its current boolean, mapping to `transaction.LOCK.SHARE`. Existing callers pass `true` / `false` and are unaffected.

### 16.4 Accepted residue (continuing P1 §14.4)

**Why acknowledge does not take the `docorg:{orgId}:{groupId}` advisory lock.** Taking it would serialise every acknowledgement of a policy group org-wide. For a 5 000-recipient handbook published on a Monday morning, that turns a burst of concurrent acknowledgements into a single-file queue behind one lock — a self-inflicted outage on the module's highest-fan-out endpoint. The `FOR SHARE` on the document row gives the one guarantee that matters (an acknowledgement cannot commit against a version that is concurrently being superseded) and conflicts only with supersede, which is rare and HR-initiated. The residual correctness risk is nil, so this is a performance decision rather than a correctness trade.

**Why there is no denormalised `acknowledged_count` on `org_documents`.** It would have to be maintained under the recipient lock, making every acknowledgement contend on the parent document row and re-creating exactly the serialisation the previous paragraph avoids. `counts_by_state` already computes the number correctly on read.

---

## 17. Idempotency & Retry

P3 follows the module's established **natural idempotency** model: no `Idempotency-Key` header, no dedupe table. Correctness comes from state guards plus partial unique indexes. Continuing P1/P2's register (I-1…I-10).

| # | Operation | Replay behaviour | Mechanism |
|---|---|---|---|
| I-11 | `POST /acknowledge` (#73) | `200` with the existing row and `already_acknowledged: true`; row count unchanged | state guard under `FOR UPDATE`, backed by `document_acknowledgements_org_doc_user_ver_unique_idx` |
| I-12 | `POST /sign` (#74) | `200` with the existing row and `already_signed: true` | state guard, backed by `document_signature_requests_org_doc_user_ver_unique_idx` |
| I-13 | `POST /sign` with an unavailable provider | `503` every time; no accumulating state; safe to retry indefinitely | the gate is before the transaction (R-91) |
| I-14 | `POST /acknowledge` after a client timeout where the server actually committed | the retry hits the state guard and returns the committed row | same as I-11 — the client cannot tell the difference, which is the point |
| I-15 | `GET /compliance/export` (#77) | pure read; repeatable; each run writes one `org_document.compliance_exported` audit row (intentional — the audit question is "how many times was this exported", so deduping it would destroy the signal) | none needed |

**Retry guidance for clients.** `503 SIGNATURE_PROVIDER_UNAVAILABLE` is not retryable by backoff — it is a configuration state, not a transient fault, and the response says so via `details.provider`. `503` from a lock timeout **is** retryable. The two are distinguished by their error codes, never by status alone.

---

## 18. Error & Failure Handling

### 18.1 New error codes (continuing P1 §16.1's register)

| Code | Status | When | `details` |
|---|---|---|---|
| `ACKNOWLEDGEMENT_NOT_REQUIRED` | 422 | #73 on a document with `requires_acknowledgement = false` | none |
| `SIGNATURE_NOT_REQUIRED` | 422 | #74 on a document with `requires_signature = false` | none |
| `RECIPIENT_WAIVED` | 409 | acknowledge/sign from `waived` | `{ state }` |
| `ORG_DOCUMENT_NOT_ACTIONABLE` | 409 | document is published but display status is not `active` | `{ display_status }` |
| `SIGNATURE_PROVIDER_UNAVAILABLE` | 503 | provider is `docusign` or `adobe_sign` | `{ provider }` |
| `SIGNER_NAME_MISMATCH` | 422 | typed name fails R-88 | **none** — echoing the expected name would make the endpoint a name-disclosure oracle |
| `EXPORT_TOO_LARGE` | 422 | #77 matches more than 50 000 rows | `{ row_count, limit }` |

Reused unchanged: `DOCUMENT_NOT_FOUND` (404), `RECIPIENT_NOT_FOUND` (404), `RECIPIENT_ALREADY_COMPLETED` (409), `FORBIDDEN` (403), `VALIDATION_ERROR` (400).

### 18.2 Production failure scenarios

| Scenario | Behaviour | Why it is safe |
|---|---|---|
| Client times out mid-acknowledge; server commits | Retry returns the committed row (I-14) | Evidence is never duplicated and never lost |
| DB connection drops mid-transaction | Unmanaged transaction rolls back; no evidence row, recipient state unchanged | Evidence and state move together or not at all |
| Audit insert fails | Whole transaction rolls back | R-85: a committed acknowledgement with no audit row is impossible |
| Employee acknowledges a document whose S3 object was deleted out-of-band | Succeeds | Acknowledgement is a database act; it does not touch storage (§19). The object's absence is an expiry/storage problem surfaced by `view-url`, not a reason to block a compliance record |
| `user_profiles` row missing for the signer | `422 SIGNER_NAME_MISMATCH` | Fails closed. A signature with nothing to verify against is not evidence |
| Hierarchy service down during #79 | Error propagates as `503` | Never defaults to "no scope" — an empty list would read as "my team is fully compliant", the worst failure direction for a compliance view |
| Settings row missing | `getOrCreate` creates it with defaults | Existing P1 behaviour |
| Export connection drops after headers | Connection closes, truncated file, `[Document]` error log with request id | The count-guard puts the realistic failures before the first byte; a truncated CSV is detectable, a silently short one would not be |
| Clock skew across app instances | `acknowledged_at` may differ by the skew | Accepted. Both timestamps are server-side; the DB is the tiebreaker via `created_at`. IST date arithmetic uses date-only granularity, so sub-second skew cannot change an overdue verdict |
| Very large roster (5 000+) on #59 | Paginated at 200, evidence loaded per page | Never loads the roster whole (§8.4) |

### 18.3 Observability

`[Document]` prefix, as P1 §16.3. Never logged: `storage_key`, `document_number`, `reference_url`, presigned URLs, **and now `signer_name` and `user_agent`**.

| Event | Level | Fields |
|---|---|---|
| provider unavailable at sign | warn | `org`, `doc`, `provider` — no user id, no name |
| export started / completed | info | `org`, `row_count`, `duration_ms`, `request_id` |
| export failed post-header | error | `org`, `request_id`, `err.name` |
| lock timeout on acknowledge | warn | `org`, `doc`, `err.name` |

---

## 19. Storage / File Responsibilities & DB↔Storage Consistency

**Phase 3 performs no storage operation whatsoever.** No presigned URL is issued, no object is written, read, copied or deleted, no `HeadObject` is called, and `findByIdForStorage` is not called from any new code path (R-98).

That is the whole of P3's storage responsibility, and it is worth stating positively rather than as an omission: an acknowledgement is a claim about bytes the employee *already* fetched through #72, evidenced by the checksum the confirm flow recorded at upload time. Re-reading the object at acknowledge time would be slower, would couple a compliance write to S3 availability, and would prove nothing extra — the checksum in the row is already the binding between the evidence and the bytes.

**Consequences, stated explicitly:**

- There is no DB↔storage consistency problem to solve in P3, because P3 creates no storage-side artefact. The two-phase upload protocol, the orphan-object residue accepted in P1 §14.4, and the `storage_key` chokepoint are all untouched.
- An acknowledgement survives the loss of its object. That is correct: "I read the handbook on 14 March" remains true and remains legally useful even if the file is later deleted, and `content_checksum` + `document_version` still identify exactly what was read.
- P3 produces **no** stamped or countersigned PDF. Visible signature stamping belongs to a certificate-backed provider and is deferred with the rest of D-13 (§1.3).
- The P2 chokepoint test asserting exactly three `findByIdForStorage` call sites in the org plane must still pass unchanged after P3. It is re-run as T-60.

---

## 20. Background Jobs, Events & Integrations

### 20.1 Jobs

**Phase 3 adds no cron, no scheduled job, and no startup catch-up.** This is deliberate and is the direct consequence of R-92: overdue is derived on read, so there is nothing for a nightly job to compute. The reminder cron that *would* consume `due_on` is Phase 4, and it arrives with the notification outbox it needs (D-16).

The `document_signature_requests_org_pending_idx` exists for a reconciliation job that a later phase will add when an external provider lands. In P3 that index is never used by a query, which is a known and accepted cost of building the seam now rather than migrating later.

### 20.2 Events

None. P3 emits no domain event and subscribes to none. The new-joiner top-up hook remains Phase 4/5; `recipients/sync` (#60) remains the manual discharge of D-14.

### 20.3 Cross-module reuse

| Reused | From | Justification |
|---|---|---|
| `createCsvWriter`, `escapeCell` | `src/modules/payroll/utils/csv_writer.utils.js` | Pure, dependency-free, already carries the BOM and the formula-injection guard. Re-implementing the CSV-injection mitigation in the document module would mean maintaining the same security control twice. Cross-module utility imports are established practice here (payroll→attendance, leave→attendance, organization→billing) |
| `buildDownloadHeaders` | `src/modules/payroll/utils/download_headers.utils.js` | The module-wide contract for every download endpoint (`attachment`, `nosniff`, `private, no-store`, RFC 5987 filename). Duplicating it would risk a document export drifting from payroll's hardened header set |
| `getAccessibleUserIds` | hierarchy access service | The module's existing manager-scoping backbone |
| `user_profiles` read for R-88 | auth module repository | Read-only, by the signer's own id |

**No new npm dependency.** D-19 holds.

---

## 21. Org Settings

### 21.1 New entries (registry continues at #68)

| Registry # | Key | Type | Default | Caps | Enforcement point |
|---|---|---|---|---|---|
| 68 | `document_acknowledgement_due_days` | integer | `7` | 1–365 | Joi on `PUT /hr/settings`; `SETTINGS_CAPS`; DB `document_settings_ack_due_days_chk`. Consumed by `document_org.service.publish` step 10 and `document_recipient.service.syncRecipients` as the fallback when the per-document value is null |
| 69 | `document_acknowledgement_blocking` | boolean | `false` | — | `document_compliance.utils.isBlocking`; surfaced as `is_blocking` on #59/#70/#71. Gates no operation in Phase 3 (§1.4 item 3) |
| 70 | `document_signature_provider` | enum `internal_typed` \| `docusign` \| `adobe_sign` | `'internal_typed'` | enum | Joi; DB `document_settings_signature_provider_chk`; `document_compliance.utils.isProviderAvailable` at `POST /sign` |

`public/md_settings/org_settings_registry.md` must gain these three entries in the module's existing format (Configuration Level, Default, Effect, Enforcement Point) — §27.

### 21.2 Settings not added

No setting controls whether acknowledgement is *possible* — that is `document_types.requires_acknowledgement` copied onto `org_documents` at draft time, which is per-document policy, not per-org configuration. No setting controls the evidence bundle's contents; a configurable audit trail is not an audit trail.

### 21.3 Dependencies

Zero new npm packages (D-19). Confirmed against §20.3: every reuse is an intra-repo require.

---

## 22. Edge-Case Register Discharge

The parent §10 register tags three edge cases to Phase 3. Each is discharged explicitly.

| EC | Text | Discharge |
|---|---|---|
| **EC-12** | "Policy republished as v2 — v1 acknowledgments do **not** satisfy v2; recipients return to `pending`" | **Structural, no new code.** P2's replace creates a new `org_documents` row and publish materialises a fresh roster at `pending` on that new id, so recipients return to `pending` for v2 by construction. v1's acknowledgements stay bound to v1's id and version. The partial unique index keyed on `(org_document_id, user_id, document_version)` makes a cross-version satisfy impossible even if a future code path tried. Asserted by T-37 (an ack of v1 leaves the v2 recipient at `pending` and `next_action = 'acknowledge'`) and T-38 (the same user can hold an ack on v1 and a separate ack on v2). |
| **EC-32** | "Acknowledgment attempted by non-recipient → `403`, checked before existence" | **Intent discharged; code changed to `404` per K-1.** The recipient check runs before any existence-revealing branch, and the response is byte-identical to a genuinely missing document — which is strictly stronger than the specified `403`, because it also hides existence from a caller who *can* enumerate ids. Asserted by T-34 (non-recipient) and T-35 (random UUID) comparing full response bodies for byte equality. The deviation is recorded in §3.6 K-1, in §26 as a decision, and in the change record. |
| **EC-33** | "Signature request against `docusign` validates its payload and returns `503` with no partial state" | **Implemented as R-91.** Params, body, authorization, recipient membership and the `requires_signature` guard all run to completion; only then does the provider gate fire, **before** `db.sequelize.transaction()` is called. "No partial state" is therefore structural rather than a cleanup path — there is no transaction to leave half-done. Asserted by T-42: after a `docusign` sign attempt, `document_signature_requests` row count and the recipient's `state` and `updated_at` are all unchanged. |

**Edge cases explicitly NOT in Phase 3:** EC-13 (new joiner top-up — P2 `sync` + P4 hook), EC-14 (exit waiver — P5), EC-17 (missed cron — the derive-on-read discipline P3 follows, but the cron itself is P4), EC-30 (soft-deleted employee cleanup — P5).

---

## 23. Implementation Sequence

Each step names its own verification. No step starts until the previous one's verification passes.

| Step | Work | Verify |
|---|---|---|
| 0 | Pre-flight §2 P-1…P-11 | every check passes; baselines written down |
| 1 | `document_compliance.utils.js` + `resolveRecipientAction` in `document_org_rules.utils.js` | `compliance_utils.test.js` green; existing `document_org_rules.utils.test.js` still green unchanged |
| 2 | `document_defaults.js` (3 defaults, 1 cap, provider re-export) + `document_settings` model columns + settings service/validator | `ack_settings_and_defaults.test.js` green; existing `storage_and_defaults.test.js` green unchanged |
| 3 | Migration `00051` | static review: `up`/`down` symmetry, both enum types dropped `CASCADE`, all three CHECK expressions, all eight indexes, FK actions. **Handed to operator; never executed here** |
| 4 | Two models + two repositories (insert + point reads only; **no** update/destroy on acknowledgements) | `node -e` load check; T-36 chokepoint test asserts the absent methods |
| 5 | Authority chokepoint extension | `ack_authority.test.js` green; `org_authority.test.js` and `authority.test.js` green **unchanged** (proves additivity) |
| 6 | `document_acknowledgement.service.js` — acknowledge (#73) | `acknowledgement_service.test.js`: T-32…T-38 |
| 7 | Same service — sign (#74), provider gate, name match | `signature_service.test.js`: T-39…T-44 |
| 8 | Self controller `ctx` userAgent + validators + routes #73/#74/#75 | route-order check; controller unit tests |
| 9 | Self read projection: `acknowledgement` block + `next_action` on #70/#71 (+ #75) | `org_read_service.test.js` extended; existing assertions unchanged |
| 10 | Roster matrix on #59 | `compliance_service.test.js` matrix cases T-47/T-48 |
| 11 | `document_compliance.service.js` + #76 + #79 | T-49, T-50, T-53…T-56 |
| 12 | #77 CSV export + count guard | T-51, T-52 |
| 13 | Due-day fallback at publish and sync (S-13) | T-57…T-59; existing `org_service.test.js` and `recipient_service.test.js` still green |
| 14 | Full suite + storage chokepoint re-assert | `npx node --test "tests/unit/document/**/*.test.js"` green; `npm test` at or above the Step-0 baseline; T-60 |
| 15 | Documentation: change record, registry entries, API contract section, completion report | §27 checklist complete |

Steps 1–2 and 4–5 are independent of the migration and can proceed while `00051` waits on the operator. Nothing in steps 1–15 requires a database.

---

## 24. Testing Requirements

All tests are `node --test`, DB-free: pure utils tested directly, services tested with mocked repositories, exactly as P1/P2 do. There is no integration harness in this environment, and this plan does not pretend otherwise.

### 24.1 Pure utility tests (`compliance_utils.test.js`)

| T | Assertion |
|---|---|
| T-32a | `isOverdue`: due yesterday → true; due **today** → false; due tomorrow → false; `null` → false |
| T-32b | `daysRemaining`: correct sign and magnitude across an IST midnight boundary; `null` in → `null` out |
| T-32c | `resolveComplianceState`: all five recipient states × overdue/not → the four outcomes |
| T-32d | `isBlocking`: true only when the setting is on **and** state is `overdue` |
| T-32e | `isProviderAvailable`: true for `internal_typed` only |
| T-32f | `normaliseSignerName` / `signerNameMatches`: case, accents, punctuation, extra whitespace, middle name absent, `display_name` variant; a genuinely different name fails |
| T-33 | `resolveRecipientAction`: `sign` outranks `acknowledge`; `null` for `waived`, `superseded`, `retired`, non-active display status, and already-completed states |

### 24.2 Acknowledge service (`acknowledgement_service.test.js`)

| T | Assertion |
|---|---|
| T-34 | Non-recipient → `404 DOCUMENT_NOT_FOUND`, response body **byte-identical** to T-35's |
| T-35 | Unknown document id → the same `404` body (the pair is the EC-32 oracle test) |
| T-36 | `document_acknowledgement.repository` exposes no `update`, no `destroy`, no `softDelete` — asserted over the module's own exported surface |
| T-37 | Evidence row carries the document's exact `version` and `checksum_sha256`; recipient moves `viewed → acknowledged` |
| T-38 | Replay: second call returns `already_acknowledged: true`, repository `create` called exactly once |
| T-38b | `waived` recipient → `409 RECIPIENT_WAIVED`, nothing written |
| T-38c | `requires_acknowledgement: false` → `422 ACKNOWLEDGEMENT_NOT_REQUIRED` |
| T-38d | Audit is recorded **with the transaction object**, and a thrown audit triggers rollback |
| T-38e | Lock order: the mocked repositories assert `org_documents` `FOR SHARE` is requested before `org_document_recipients` `FOR UPDATE` |

### 24.3 Signature service (`signature_service.test.js`)

| T | Assertion |
|---|---|
| T-39 | `internal_typed` + matching name → row at `status='signed'` with `signed_at` and raw `signer_name`; recipient → `signed` |
| T-40 | Name mismatch → `422 SIGNER_NAME_MISMATCH`, no `details`, no row |
| T-41 | `requires_signature: false` → `422 SIGNATURE_NOT_REQUIRED` |
| T-42 | **EC-33:** `docusign` → `503 SIGNATURE_PROVIDER_UNAVAILABLE`; `db.sequelize.transaction` never called; zero rows; recipient untouched |
| T-43 | Sign from `acknowledged` advances to `signed`; acknowledge from `signed` is a no-op that never regresses (R-79) |
| T-44 | Replay → `already_signed: true`, `create` called once |

### 24.4 Immutability chokepoints

| T | Assertion |
|---|---|
| T-36 | (above) acknowledgement repository has no mutating method |
| T-45 | Signature repository's only update method includes `status: 'pending'` in its `where` |
| T-46 | Neither evidence model declares `paranoid: true`; the acknowledgement model declares `updatedAt: false` |

### 24.5 Compliance services (`compliance_service.test.js`)

| T | Assertion |
|---|---|
| T-47 | Matrix tallies for a 50-row roster with mixed states and 5 past due; per-row `compliance_state` correct |
| T-48 | #59's pre-existing fields and `counts_by_state` are unchanged shape-for-shape (additive proof) |
| T-49 | #76 covers only `status='published'`; `overdue_only` filters correctly |
| T-50 | #76's department filter builds a predicate on `department_id`, never `department` |
| T-51 | #77 emits BOM, CRLF, `attachment`, `nosniff`; a title beginning `=` is formula-guarded |
| T-52 | 50 001 matching rows → `422 EXPORT_TOO_LARGE`, writer never instantiated |
| T-53 | Manager scope: only `accessibleUserIds` appear; a `null` scope yields an empty list, never the org (D-10) |
| T-54 | Manager view excludes confidential documents |
| T-55 | `manager_can_view_team_documents: false` → `403` |
| T-56 | Hierarchy failure propagates; it is never swallowed into an empty list |

### 24.6 Settings and fallback

| T | Assertion |
|---|---|
| T-57 | Due-days outside 1–365 rejected at Joi and at `SETTINGS_CAPS`; provider outside the enum rejected |
| T-58 | Changing the org default does **not** rewrite existing `due_on` values (R-86) |
| T-59 | Publish with `acknowledgement_due_days: null` + `requires_acknowledgement: true` → `due_on` from the org default; with `requires_acknowledgement: false` → `due_on` stays `null` (R-87) |
| T-60 | P2's `findByIdForStorage` three-call-site chokepoint assertion still passes |

### 24.7 Regression gate

Every pre-existing test in `tests/unit/document/` must pass **unmodified**. A P3 change that requires editing a P1 or P2 assertion is a breaking change and must be escalated, not accommodated.

### 24.8 Not covered here (stated honestly)

Index usage (`EXPLAIN` on `org_document_recipients_org_due_idx`), real concurrency under load, actual CSV size/time for 50 000 rows, and migration execution are **not** verifiable in this environment. They are §28 gates for the operator, not claims this plan makes.

---

## 25. Migration, Deployment & Backward Compatibility

### 25.1 Order of operations

1. Operator runs `00050` (still outstanding).
2. Operator runs `00051`.
3. Deploy the application.

`00051` FKs into `org_documents` and `org_document_recipients` and therefore **cannot** run before `00050`. If `00050` has not been applied, `00051` fails at the first `addConstraint` and rolls back cleanly inside its own transaction — no partial schema.

### 25.2 Backward compatibility

| Concern | Status |
|---|---|
| Old app binary against the new schema | **Safe.** Two new tables it never queries; three `document_settings` columns with `NOT NULL DEFAULT`, so its `INSERT`s and `UPDATE`s still succeed |
| New app binary against the old schema | **Not supported** — `POST /acknowledge` would fail on a missing table. Migration precedes deploy (§25.1) |
| Existing API consumers | **No breaking change.** Every modification in §11.3 adds fields or optional query parameters. No field is renamed, retyped or removed |
| `is_actionable` on #70/#71 | Preserved with its current meaning; `next_action` added alongside |
| Existing recipient rows with `due_on = null` | Left as-is. They show `compliance_state: 'pending'` and never `overdue`, which is correct — they were published without a deadline |
| P1/P2 endpoints #1–#58, #60–#72 | Untouched except #47 and #60's due-day fallback |

### 25.3 Rollback

`00051.down()` drops the two tables, then the two enum types with `CASCADE`, then the three `document_settings` columns and their two CHECK constraints, in exact inverse order. It is destructive of acknowledgement evidence by construction — there is nowhere else to put it — so the deployment note must say plainly: **once employees have acknowledged, `down()` destroys legal evidence and must not be run.** The forward-only recovery for a bad deploy is to roll back the application binary and leave the schema in place.

### 25.4 Feature flag

All P3 routes sit behind the existing `requireFeature('documents.access')`. No new flag. An org that has not enabled documents is unaffected by every part of this phase.

---

## 26. Open Decisions, Risks & Carry-Over

### 26.1 Decisions needing the architect before or during Phase 3

| # | Decision | Recommendation |
|---|---|---|
| **O-1** | Should the employee plane (`employee_documents`) get acknowledge/sign endpoints? The schema supports it (two nullable FKs, exactly-one CHECK, both unique indexes) but **no** catalog type sets `default_requires_acknowledgement` or `default_requires_signature` on the employee plane, so there is no producer. | **Build the schema, not the endpoints** (this plan's position). Adding endpoints with no type that triggers them is speculative surface. If HR needs employees to acknowledge an offer letter, that is one catalog change plus a thin reuse of `document_acknowledgement.service` — the seam is already there. Decide before Step 4 if you disagree. |
| **O-2** | What should `document_acknowledgement_blocking` actually block? | P3 makes it a read-side flag only and says so in the change record. Candidates for P4/P5: suppress non-mandatory self-service actions, gate leave application, escalate to the manager. **Needs a product answer, not an engineering one.** |
| **O-3** | Should `signer_name` be validated against the profile (R-88)? | Yes — an unvalidated free-text field is not evidence. But if HR reports false rejections (married names, transliterations, initials), relax it to "records a mismatch flag on the row" rather than dropping the check. Flagged now so the failure is diagnosable. |
| **O-4** | Parent Open Decision 4 (e-signature vendor) | **Still open and still unblocking.** P3 ships `internal_typed` and the provider seam; no vendor decision is required to complete this phase. It becomes blocking only when someone asks for a certificate-backed signature. |
| **O-5** | Is a 50 000-row export cap right? | Provisional. It is a guess at the point where a synchronous CSV stops being reasonable, not a measured number (§1.4 item 1). Measure once real data exists; the alternative is an async export job, which is Phase 5's `document_export_jobs`. |

### 26.2 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `org_document_recipients_org_due_idx` is not chosen by the planner for #76/#79 | medium | The predicate is written to match the partial index's `WHERE` clause exactly, including `due_on IS NOT NULL`. `EXPLAIN` is a §28 gate |
| Acknowledgement burst on a large publish saturates connections | medium | Two row locks, no advisory lock, no denormalised counter (§16.4). Still unmeasured (§1.4 item 1) |
| `FOR SHARE` on `org_documents` blocks a publish longer than expected | low | The share lock is held only for the acknowledge transaction, which does two inserts and no I/O |
| Evidence rows accumulate without bound | low | One row per (document, user, version). A 5 000-person org republishing a handbook yearly adds 5 000 rows a year. No pruning is needed, and pruning would be illegal anyway |
| `00050` never gets run and P3 is built on an unverifiable base | **high** | Called out in §25.1 and in the hand-back note. Unit work proceeds regardless; integration verification does not |

### 26.3 Deferred to Phase 4 / 5 (recorded so it is not lost)

Reminder crons and the notification outbox · manager "nudge" · on-join recipient top-up hook · external signature provider adapters + webhook + reconciliation job (the `pending` status and `provider_reference` column are already in place) · `document_export_jobs` and async export · broad compliance reporting · offboarding archive + exit waivers.

### 26.4 Carry-over defects (re-listed, still unfixed, still out of scope)

From P2 §26.2, none of which P3 touches: **D-1** leaked transaction in `document_type.service.setActive`; **D-2** duplicated `requires_verification` OR-ing; **D-3** `reference_url` in the employee-plane `LIST_ATTRIBUTES`; **D-4** mid-function re-`require`; **D-5** missing Phase-1 change record, missing `DOCUMENTS_API_CONTRACT.md`, missing Phase-1 and Phase-2 completion reports. Plus **CO-1** (third local `todayIST()`) and **CO-2** (status-only `isActionable`) from §3.5. These are listed a third time deliberately: each phase that ships without clearing them makes the next one's reconciliation harder.

---

## 27. Documentation Deliverables

Mandatory. Phase 3 is not complete without all five.

| # | Artefact | Path | Content |
|---|---|---|---|
| 1 | **Dated change record** (required by the repo's standing rule — this phase changes existing API responses) | `public/md_updates/documents_phase3_acknowledgements_2026_09_24.md` | New endpoints #73–#79 with full request/response shapes; the additive changes to #59, #70, #71 and `GET`/`PUT /hr/settings`; the `due_on` behaviour change on #47 and #60; the three new settings; the seven new error codes; the K-1 `404`-instead-of-`403` decision; the `is_actionable` → `next_action` guidance |
| 2 | Org settings registry entries #68–#70 | `public/md_settings/org_settings_registry.md` | Existing format: Configuration Level, Default, Effect, Enforcement Point |
| 3 | API contract section | `public/md_documents/DOCUMENTS_API_CONTRACT.md` | Does not exist yet (D-5). Phase 3 **creates** it covering #73–#79 at minimum, and states in its header that #1–#72 are not yet documented there, so the gap is visible rather than implied |
| 4 | Phase 3 completion report | `public/md_documents/phases/phase3_completion_report.md` | Endpoint-by-endpoint status, EC-12/32/33 discharge evidence, test counts before and after, every deviation from this plan with its reason |
| 5 | Operator hand-back note | alongside the completion report | `00050` then `00051`, in that order; the §25.3 warning that `down()` destroys legal evidence; the `EXPLAIN` checks from §28 |

---

## 28. Production-Readiness Checklist

Ticked only against evidence. An unchecked box blocks sign-off.

**Correctness**
- [ ] All new unit tests green; every pre-existing document test green **unmodified** (T-Regression, §24.7)
- [ ] `npm test` at or above the Step-0 baseline
- [ ] EC-12, EC-32, EC-33 each have a named passing test (T-37/T-38, T-34/T-35, T-42)
- [ ] Acknowledgement and signature repositories expose no mutating method (T-36, T-45)
- [ ] `findByIdForStorage` call-site count unchanged (T-60)

**Data integrity**
- [ ] `00051` reviewed statically: `up`/`down` symmetry, both enum types dropped `CASCADE`, three CHECKs, eight indexes, FK actions
- [ ] Exactly-one-anchor CHECK verified by review on both tables
- [ ] Unique indexes include `document_version` on the org plane (the EC-12 guarantee)

**Security**
- [ ] No new `authorize()` list contains `admin` or `super-admin` (D-10)
- [ ] `/:id`-addressed denials return byte-identical `404`s (T-34/T-35)
- [ ] `signer_name` and `user_agent` appear in no log line and in no audit `newValues`
- [ ] CSV export sets `attachment` + `nosniff` + `private, no-store` and formula-guards user-controlled cells (T-51)
- [ ] Manager scope cannot be widened by a `user_id` parameter (T-53)

**Operations** *(operator-side; this environment cannot verify them — §24.8)*
- [ ] `00050` applied, then `00051` applied
- [ ] `EXPLAIN` confirms #76/#79 use `org_document_recipients_org_due_idx`
- [ ] `EXPLAIN` confirms #59's roster page uses `org_document_recipients_doc_state_idx`
- [ ] A 50 000-row export measured for wall-clock time and peak memory
- [ ] Acknowledgement burst measured on a ≥1 000-recipient document

**Documentation**
- [ ] All five §27 artefacts written

---

## 29. Final Phase 3 Acceptance Criteria

Phase 3 is done when every one of these is true and demonstrable.

1. A recipient of a published, acknowledgement-bearing document can acknowledge it and receives `201`; the stored record carries that document's exact `version` and `checksum_sha256`, the server's timestamp, the caller's IP and user-agent, and nothing the client supplied.
2. Submitting the same acknowledgement twice produces exactly **one** row and a `200` with `already_acknowledged: true`.
3. No code path in the repository — and therefore no HR action, no admin action, and no internal service — can update or delete an acknowledgement.
4. Acknowledging v1 leaves the v2 recipient at `pending` with `next_action: "acknowledge"`, and the same employee can hold separate, independent acknowledgements for v1 and v2 (**EC-12**).
5. A non-recipient attempting to acknowledge receives a response byte-identical to one for a document that does not exist (**EC-32**, resolved to `404` per K-1).
6. With `document_signature_provider = 'internal_typed'`, a recipient can typed-sign a signature-bearing document; the record stores the name exactly as typed and the recipient reaches `signed`.
7. With `document_signature_provider = 'docusign'`, the same request is validated in full and then returns `503 SIGNATURE_PROVIDER_UNAVAILABLE`; no row is created, no state changes, and no transaction is ever opened (**EC-33**).
8. Recipient state never regresses: signing after acknowledging advances to `signed`; acknowledging after signing changes nothing (R-79).
9. A `waived` recipient cannot acknowledge or sign, and an `acknowledged`/`signed` recipient cannot be waived.
10. HR can see, per document, who has and has not completed, who is overdue, and by how many days — with tallies that match the roster exactly.
11. HR can list every published acknowledgement-bearing document's compliance across the org, filter to overdue only, and export the underlying rows as a safe CSV.
12. A manager sees pending and overdue acknowledgements for exactly their direct reports, never for anyone else, never for confidential documents, and sees nothing at all when `manager_can_view_team_documents` is off.
13. Overdue is computed on read; no cron exists, and none is needed for a correct compliance answer.
14. The three new org settings round-trip through the existing settings endpoints, are enforced at Joi, at the caps table and at the DB, and a due-days change never rewrites an already-published deadline.
15. Every existing Phase 1 and Phase 2 test passes **unmodified**, and no existing API response field was renamed, retyped or removed.
16. Migration `00051` is written, statically reviewed, and handed to the operator — and this plan makes no claim that it was executed.
17. All five documentation artefacts in §27 exist, including the dated `md_updates` change record.
