# Settings Module — Phase 3 Implementation Plan

> **Phase:** 3 of 5 — **Unified change history** (`settings_change_logs` + S-7 `GET /settings/history`).
> **Status:** PLAN ONLY — no code written, no test run, no database touched as part of authoring this document.
> **Parent plan (source of truth):** [../implementation_plan.md](../implementation_plan.md) — §6.2, §7.8, §10, §14.4, §16 "Phase 3", §17.4–§17.5, §18, §20.1.
> **Predecessors:** [phase1_implementation_plan.md](phase1_implementation_plan.md) (SHIPPED), [phase2_implementation_plan.md](phase2_implementation_plan.md) (SHIPPED).
> **Authored:** 2026-10-09. **Verified against the shipped tree on:** 2026-10-09.
> **DB-gated:** yes. Migration `00073` is **handed back unrun**; Phase 3 code must not deploy before the operator confirms it.
> **Baseline executed while authoring:** `node --test "tests/unit/settings/*.test.js"` → **133 pass / 0 fail** (5 suites, 13 files).

---

## 0. How to read this document

* **§1–§5** decide *what Phase 3 is and is not*. Read fully before writing code. §3 is the
  verification of Phases 1 and 2 **against the shipped source**, not against their plans; it
  carries seven findings, two of which change Phase 3's design.
* **§6–§14** are the build contract: table, migration, model, repository, recorder, reader,
  endpoint, controller, validator — every file, every rule.
* **§15–§19** are the production contract: security, cache, audit, failure, concurrency.
* **§20–§27** are sequence, tests, deployment, acceptance.
* **§28** carries the open decisions. **OD-P3-1 blocks §9.2 only**; everything else proceeds.
* New decisions are `D-P3-n`. New findings (corrections to the parent or to Phases 1–2) are
  `F-P3-n`. New edge cases are `EC-P3-n`. New tests are `T-P3-n`; tests inherited from the
  parent keep their `T-S…` number. Open decisions are `OD-P3-n`.
* Where the brief's checklist asks for something this phase does not have, the answer is
  written as **Not Applicable — Reason: …** rather than omitted.

---

## 1. Goal & Boundary

### 1.1 Objective

Give an organization **one chronological, per-key answer** to *"who changed this setting,
when, from what, to what, and why"* across all five settings stores — including
`organization_profiles`, which has no audit table today and is therefore the **only** reason
this phase needs a migration.

Phase 3 adds **one table, one recorder, one reader, one endpoint**. It changes no setting
value, no validation rule, no authorization rule and no existing API contract.

### 1.2 In scope

| # | Item | Parent ref |
|---|---|---|
| 1 | Migration `00073-create-settings-change-logs.js` — one table, four indexes, two CHECKs | §6.2, §6.4 |
| 2 | `settings_change_logs` Sequelize model, and `modules/settings/models` added to `MODEL_ROOTS` | §16 Phase 3 |
| 3 | `settings_change_log.repository.js` — `create` + reads **only**, no update/destroy (`T-S10`) | §6.2 |
| 4 | `settings_audit.service.js` — the `settingsAudit.record` recorder; **transaction required** (`T-S13`) | §10.2 |
| 5 | Recorder wired into `organization.service.updateOrganizationProfileFieldsLocked`, **inside its existing transaction**, so both doors (`PUT /organizations/profile` and S-5/S-6) are attributed | §10.1, §16 |
| 6 | `settings_history.repository.js` + `settings_history.service.js` — the union reader over four audit shapes in three tables, fan-out to one item per changed key, keyset pagination | §7.8 |
| 7 | S-7 `GET /settings/history` — endpoint **#248**, `hr` only | §7.1, §7.8 |
| 8 | Query validator, controller handler, route (declared above `/groups/:groupKey`) | §7.8 |
| 9 | Completion of **DEF-S11** in the one place Phase 2 missed: the owner diff in `payroll_settings.service.js` (§9.3, F-P3-2) | §20.1 Phase 2 |
| 10 | Actor-context threading on the organization module door, so a module-door edit is attributable (§9.1.3, F-P3-4) | §10.2 |
| 11 | Tests `T-S10`, `T-S13`, `T-S45`–`T-S49`, `T-S62`, plus `T-P3-1`–`T-P3-18` | §14.4 |
| 12 | Change record `public/md_updates/2026-10-09_settings_module_history_api.md`, `api_registry.md` row #248, `combined_api_analysis.md` section — and the §10.4 coverage gap stated **explicitly** in the change record | §16, §10.4 |

### 1.3 Explicitly **not** in scope

| Item | Reason |
|---|---|
| Retrofitting audit onto per-record leave / attendance / organization writes (DEF-S4/S5/S6) | Parent §10.4. 20+ write paths in three modules; its own plan. Phase 3 ships the **mechanism** they will use, nothing more. |
| A `source` column on `payroll_audit_logs` / `document_audit_logs` | Parent §7.8 rejects all three options. `source` stays `null` for those rows (`T-S48`). This plan changes **no existing table**. |
| A rollback / restore endpoint | Parent §10.3. A rollback is a `PUT` with the value history shows; one that bypassed the owner's guards would be a hole. |
| Version numbers or whole-row snapshots on settings rows | Parent §10.3. `updated_at` is already the concurrency token; a per-key diff reconstructs any point in time. |
| Notifications / email on a settings change | Parent §13.3, Q-S10. |
| A generic `organization_audit_logs` table | Q-S2 default: build `settings_change_logs` narrow and purpose-built. |
| Retention / archival of the ledger | Q-S8 default: keep forever. The table is partition-friendly if that ever changes. |
| S-8 `/settings/surfaces`, S-9 `/settings/readiness` | Phase 4. The `SURFACES` catalog data **already exists** (49 entries, shipped in Phase 1) — do not touch it. |
| Any cache | Phase 5, gated on Q-S5. Parent D-S10: Phases 1–4 add no cache. |
| Widening the ledger's `store` CHECK | Deliberately narrow (parent §6.2). A **later** migration widens it when a second auditless store appears. |
| Approval workflow / effective dating of settings changes | Q-S4, parent §3.2. Not in the source of truth. |
| Exposing `action` on a history item | The parent's item shape (§7.8) has no `action` field; adding one would invite clients to depend on the owners' audit vocabulary. |
| Backfilling history for changes made before this phase | Impossible for `organization_profiles` (no before-state was ever recorded) and unnecessary for the other four (their rows already exist). §23.2. |

### 1.4 Corrections to the parent plan, carried as findings

These are **not** new features. Each is a place where the parent plan or a Phase 2 claim does
not match the shipped tree, found by reading the source on 2026-10-09.

| ID | Finding | Impact on Phase 3 |
|---|---|---|
| **F-P3-1** | Parent §10.1 says the recorder is called by `organization.service.updateProfile`. In the shipped code the transaction is opened **and committed inside** `updateOrganizationProfileFieldsLocked` (`organization.service.js:724-747`); `updateOrganizationProfile` is a two-line delegator that holds no transaction, and the settings adapter destructures only `{ row }`, discarding `before`. **The recorder must therefore be called from inside `…FieldsLocked`** — not from `updateOrganizationProfile`, and not from the adapter. Anywhere else is a second transaction, which violates §10.2's atomicity rule. | Determines the wiring point (§9.1). |
| **F-P3-2** | **DEF-S11 is only half fixed.** Phase 2's §20.1 checklist claims "no `!==` on a DECIMAL anywhere" and names the owner diff in `payroll_settings.service.js` as routed through `valuesEqual()`. It is not: that diff is still `if (before[key] !== updated[key])` (`payroll_settings.service.js:101`), and `valuesEqual` appears nowhere outside `src/modules/settings/`. Verified: of the 63 `payroll_settings` catalog keys, **exactly one** is mis-diffed — `fnf_encashment_leave_type_codes` (`jsonb`), because two separately-constructed arrays never compare equal with `!==`. DECIMAL is safe here by accident (both sides are `pg` strings); `statutory_configs` has **zero** jsonb/array/dateonly keys and is sound. | Without the fix, S-5 reports that key **unchanged** while S-7 reports it **changed** — two endpoints contradicting each other about one write. Fixed in §9.3. |
| **F-P3-3** | **The parent contradicts itself on the ledger's CHECK constraints.** §6.2 declares `old_value`/`new_value` **nullable** and lists exactly two CHECKs (`store`, `source`), with a nullability note (EC-S12) that *requires* SQL `NULL` to remain representable. §17.5 step 5 tells the operator to verify `CHECK (old_value IS NOT NULL AND new_value IS NOT NULL)`, which would make EC-S12 impossible. | **§6.2 is normative.** Two CHECKs only. The hand-back checklist is corrected in §23.5. |
| **F-P3-4** | `organization.controller.handleUpdateOrganizationProfile` (`organization.controller.js:31-39`) passes only `req.user` and the validated body — **no `ip`, no `x-request-id`, no role**. The settings adapter passes `{ orgId, id: actor.actorId }` and no audit context either. | Both callers must be extended or the ledger's `actor_role` / `ip_address` / `request_id` / `source` columns are dead on arrival (§9.1.3). |
| **F-P3-5** | Parent §7.8's `source` caveat is correct but incomplete: `payroll_audit_logs` and `document_audit_logs` also have **no `actor_role` column** (verified column list: `id org_id actor_id target_user_id entity_type entity_id action old_values new_values reason ip_address request_id proposed_by approved_by`). | `actor.role` is `null` for non-ledger items, by the same reasoning as `source`. Do **not** resolve the actor's *current* role and present it as the role at change time (§12.5). |
| **F-P3-6** | Parent §6.3 proposes pinning history queries by `entity_id` to "the single settings row". Verified unnecessary and undesirable: `(org_id, entity_type)` is already a usable prefix of both tables' indexes, and pinning `entity_id` would require a pre-read of each store's row — provisioning rows on a **read**, which Phase 1 rule 3 forbids. | The reader filters on `(org_id, entity_type, action)` only (§13.2). |
| **F-P3-7** | `T-S1` (the static scan proving `src/modules/settings/**` requires no foreign model and performs no foreign write) **was never implemented** — no settings test reads the module tree. Phases 1–2 got away with it because adapters require foreign *services*. Phase 3 is the first phase to read foreign *tables* and the first to create a reverse edge. | `T-P3-17` implements the scan with the boundary Phase 3 actually needs (§21.3). |

---

## 2. Pre-Flight Checks — before writing any code

Run these in order. **P-0 is mandatory**: this document's baseline is not the implementer's.

| ID | Check | Expected | If it fails |
|---|---|---|---|
| **P-0** | `npm test` | full suite green | **Stop.** Fix or record the pre-existing failure before touching anything. Phase 3's regression claim rests on this number. |
| P-1 | `node --test "tests/unit/settings/*.test.js"` | 133 pass / 0 fail | as P-0 |
| P-2 | `node -e "const c=require('./src/modules/settings/catalog');console.log(c.CATALOG_VERSION,c.ENTRIES.length,c.GROUPS.length,c.SURFACES.length)"` | `2026-10-09.2 138 26 49` | the catalog moved; re-verify §5.4's coverage counts |
| P-3 | `ls src/infrastructure/postgres-sql/migrations/ \| tail -1` | `00072-normalize-and-constrain-work-mode.js` | renumber the migration; `00073` must be the next free number |
| P-4 | max endpoint id in `public/md_system/api_registry.md` | `247` | renumber S-7; it must be the next free endpoint number |
| P-5 | `grep -n "updateOrganizationProfileFieldsLocked" src/modules/organization/services/organization.service.js` | present, returns `{ before, row }` | **Stop — Phase 3's hard blocker.** Parent §20.1 / Phase 2 §28.3(2). Without a before-state the ledger records `null → value` for every edit, including the second. |
| P-6 | `ls src/modules/settings/models src/modules/settings/repositories` | both absent | Phase 3 is partially done; reconcile before continuing |
| P-7 | `grep -rn "settings_change_logs" src/` | no hit | as P-6 |
| P-8 | `grep -rn "valuesEqual" src/modules/payroll/services/payroll_settings.service.js` | no hit → F-P3-2 confirmed | if present, F-P3-2 was fixed after authoring; skip §9.3 and say so in the change record |

**Standing constraint, restated:** no `db:migrate`, no `db:migrate:status`, no `db:seed`, no
connectivity check of any kind is run from the development environment. Everything in this
plan is verified statically and by unit tests; the migration is handed back (§23).

---

## 3. Phase 1 & Phase 2 Implementation Verification

Verified by reading the shipped source and executing Node in this repository on 2026-10-09 —
**not** by trusting the Phase 1/2 plans.

### 3.1 Implemented as planned — Phase 3 may rely on these

| Artefact | Verified fact |
|---|---|
| Module tree | 30 files under `src/modules/settings/` (adapters 7, catalog 9, controllers 1, routes 1, services 4, utils 5, validators 1, index 1) |
| Endpoints | six live: #242 `GET /catalog`, #243 `GET /catalog/:settingKey`, #244 `GET /`, #245 `GET /groups/:groupKey`, #246 `PUT /groups/:groupKey`, #247 `POST /groups/:groupKey/reset` |
| Catalog | 138 entries, 26 groups, 49 surfaces, `CATALOG_VERSION = '2026-10-09.2'`, deep-frozen, 12 load-time invariants |
| Key distribution by store | `payroll_settings` 63, `statutory_configs` 25, `document_settings` 35, `document_letter_branding` 13, `organization_profiles` 2 — **138** |
| Structured keys | exactly **6** are `jsonb`/`array`; full list in §5.4. Every diff Phase 3 performs must be type-aware because of these |
| Adapters | five, bijective with the five stores (boot invariant 9), each exposing `read / update / ownerWritableKeys / ownerSchema / nonSettingKeys / concurrencyField / `**`auditSource`** |
| **`auditSource` metadata** | **already shipped on all five adapters** as `{ table, entityType }`: `payroll_audit_logs/payroll_settings`, `payroll_audit_logs/statutory_config`, `document_audit_logs/document_settings`, `document_audit_logs/document_letter_branding`, `null/organization_profile`. Phase 3's reader is **driven by this existing data**, not by a new hard-coded list |
| `valuesEqual(a,b,dataType)` | pure, no imports, 8 data types, `null` never equal to `0`/`''`/`[]`, arrays order-sensitive, jsonb key-order-insensitive, unknown type throws. Phase 3's one comparator |
| `projection.isGroupReadable / isGroupWritable` | per-group RBAC from catalog data; `admin`/`super-admin` excluded by boot invariant 8 |
| `resolveEntitlements(orgId, featureKeys)` | one check per distinct `featureKey`; a `503` propagates and is never flattened to a `403` |
| `ctx(req)` in the controller | `{ orgId, actorId, actorRole, ipAddress, requestId }`, with `x-request-id` → `x-correlation-id` fallback. **Already carries everything the recorder needs** |
| Degradation idiom | `Promise.allSettled` + `unavailable_groups[]` inside a `200`, except a `503`, which rethrows. Phase 3 reuses the shape for `unavailable_sources[]` (§12.6) |
| `common/if_match.utils.assertUpdatedAtMatches` | shared by all five owners; no-op on `null` |
| **DEF-S7** | fixed — `payroll_settings.service.update` does `findOrCreate` then `findByOrgId({ lock:true })` before the diff |
| **DEF-S8** | reconciled — `PUT /documents/hr/settings` validates |
| **DEF-S10** | **fixed — the Phase 3 blocker is cleared.** `updateOrganizationProfileFieldsLocked` locks via `lockOrganizationProfileByOrgId`, asserts `If-Match` under the lock, captures `const before = locked.get({ plain:true })`, re-reads `after`, and returns `{ before, row: after }` |
| **DEF-S12** | covered — `documents.branding` writable over the existing `replace()`; no asset column writable; the 13 catalog keys exclude every `logo_*`/`signature_*` column |
| Tests | 13 files, **133 pass / 0 fail** (executed while authoring) |

### 3.2 Phase 1 / Phase 2 deviations that change Phase 3's design

| ID | Deviation | Phase 3 consequence |
|---|---|---|
| F-P3-1 | the transaction lives inside `…FieldsLocked`, not in `updateProfile` | recorder is wired inside that method (§9.1) |
| **F-P3-2** | DEF-S11 not completed in the payroll owner | one-key phantom diff; fixed in §9.3, else S-5 and S-7 contradict each other |
| F-P3-4 | neither caller threads ip / request-id / role / source into the profile write | both extended in §9.1.3 |
| F-P3-7 | `T-S1` never written | implemented as `T-P3-17` (§21.3) |
| **OD-P2-2 still open** | `reason` is **gated but discarded**. `settings_write.service.runPipeline` uses `reason` only for the step-7a gate; it is never passed to `adapter.update()`, and none of the four owner settings-update methods sets `reason` on its `record()` call — though **both audit tables have a `reason` column**. | FR-5's "why" is available in history **only for `organization_profiles`** unless OD-P3-1 is accepted. §9.2 specifies the change; §28.2 carries the decision. |
| **F-P2-8 confirmed** | `document_settings.service.update` performs **no diff at all** — it writes `oldValues[f] = current[f]`, `newValues[f] = changes[f]` for **every submitted field** (`document_settings.service.js:275-280`), and `newValues` holds the **submitted** value, not the stored one | the reader must drop no-op items (§12.3 rule 4) and must document that a `document_settings` `new_value` is post-validation but pre-store (§12.2) |
| **T-S62 confirmed** | `document_letter_branding.service.replace` audits `oldValues: before` (a 20-field DTO) and `newValues: { ...before, ...changes }` — **two full DTOs**, not a changed-keys map; and the DTO carries 7 non-catalog fields (`updated_at`, `logo_present`, `logo_content_type`, `logo_size_bytes`, `signature_present`, `signature_content_type`, `signature_size_bytes`) | the reader diffs this entity type key-by-key **and** projects to catalog keys (§12.2, §12.3) |

### 3.3 Phase 1 / Phase 2 artefacts Phase 3 **changes** (and why that is expected)

| File | Change | Compatibility |
|---|---|---|
| `settings/routes/settings.routes.js` | add one `GET /history` line **above** `/groups/:groupKey` (the file's own reserved comment instructs this) | additive |
| `settings/controllers/settings.controller.js` | add `getHistory`; `ctx()` and `envelope()` unchanged | additive |
| `settings/validators/settings.validator.js` | add `historyQuerySchema` | additive |
| `settings/adapters/*.js` | **no change.** `auditSource` already carries what the reader needs | — |
| `settings/catalog/**` | **no change.** `CATALOG_VERSION` is **not** bumped: no catalog data, metadata or contract changes, so bumping it would invalidate every client's S-1/S-3/S-4 ETag for nothing (**D-P3-7**) | — |
| `payroll/services/payroll_settings.service.js` | route the owner diff through `valuesEqual` (F-P3-2, §9.3) | behaviour-preserving for 62 of 63 keys; removes a phantom audit row on the 63rd |
| `organization/services/organization.service.js` | record inside `…FieldsLocked`; accept an `audit` context | additive option; existing signature, return value and error codes unchanged |
| `organization/controllers/organization.controller.js` | thread ip / request-id / role / `source:'module_api'` | additive |
| `settings/adapters/organization_billing.adapter.js` | pass the audit context and `source:'settings_api'` to the owner | additive |
| `infrastructure/postgres-sql/models.index.js` | `MODEL_ROOTS` += `modules/settings/models` | additive; loads exactly one new model |

---

## 4. Dependencies on Existing HRMS Components

### 4.1 Reused unchanged — nothing new is created where one of these fits

| Component | Used for |
|---|---|
| `common/utilities/appError.utils` | every error |
| `common/utilities/validator.utils.validateOrThrow` | the S-7 query schema |
| `common/middlewares/auth.middleware` — `authenticate`, `authorize`, `requireActiveOrg` | the route guard |
| `settings/catalog` — `byKey`, `entriesForGroup`, `groupByKey`, `GROUPS` | key → `{ group_key, store, registry_ref, data_type }` resolution; the reader's whole projection |
| `settings/utils/settings_value.utils.valuesEqual` | **every** diff and no-op drop in this phase |
| `settings/utils/settings_projection.utils.isGroupReadable` | RBAC projection of history |
| `settings/services/settings_entitlement.service.resolveEntitlements` | entitlement projection of history (§15.2 — a **security** requirement, not a nicety) |
| `settings/adapters/*.auditSource` | the source registry; no second list of table names |
| `settings/controllers` `ctx()` / `envelope()` | request context and response envelope |
| `db.PayrollAuditLog`, `db.DocumentAuditLog`, `db.UserProfile` via `infrastructure/postgres-sql/models.index` | the reader's foreign-table reads (D-P3-2) |
| the `Promise.allSettled` degradation idiom from `settings_read.service` | partial source failure (F-19) |
| `organization.repository.lockOrganizationProfileByOrgId` | already shipped by Phase 2; Phase 3 adds **no** repository method to the organization module |
| `document_audit.service.record`'s "throws without a transaction" guard | the **precedent** `settingsAudit.record` copies verbatim (`T-S13`) |
| migration conventions of `00069-create-organization-field-locations.js` | one `queryInterface.sequelize.transaction()`, `createTable` + raw-SQL CHECKs + `addIndex`, `down()` = `dropTable` in a transaction |

### 4.2 Created by Phase 3

| File | Lines (est.) | Responsibility |
|---|---|---|
| `src/infrastructure/postgres-sql/migrations/00073-create-settings-change-logs.js` | ~110 | the one table, four indexes, two CHECKs |
| `src/modules/settings/models/settings_change_logs.model.js` | ~80 | the model; `created_at` only, `paranoid: false` |
| `src/modules/settings/repositories/settings_change_log.repository.js` | ~90 | `create` + `findPage`; **no** update/destroy (`T-S10`) |
| `src/modules/settings/repositories/settings_history.repository.js` | ~160 | keyset reads of the two foreign audit tables via `db.*` |
| `src/modules/settings/services/settings_audit.service.js` | ~110 | `record()` (one row per key, transaction required) and `recordDiff()` (the loop callers use) |
| `src/modules/settings/services/settings_history.service.js` | ~230 | gate → scope → fetch → normalise → fan out → merge → trim → hydrate actors |
| `src/modules/settings/utils/settings_history_cursor.utils.js` | ~70 | encode / decode / compare the `(created_at, id, setting_key)` keyset cursor |
| `src/modules/settings/utils/settings_history_normalise.utils.js` | ~130 | the four audit shapes → one uniform item list (pure, no I/O) |
| `tests/unit/settings/history_cursor.test.js` | — | `T-P3-5`…`T-P3-8` |
| `tests/unit/settings/history_normalise.test.js` | — | `T-S45`, `T-S47`, `T-S62`, `T-P3-1`…`T-P3-4` |
| `tests/unit/settings/history_service.test.js` | — | `T-S46`, `T-S48`, `T-P3-9`…`T-P3-14` |
| `tests/unit/settings/settings_audit_recorder.test.js` | — | `T-S10`, `T-S13`, `T-S49`, `T-P3-15`, `T-P3-16` |
| `tests/unit/settings/module_boundary.test.js` | — | `T-P3-17` (the never-written `T-S1`) |
| `tests/unit/settings/history_api_correctness.test.js` | — | `T-P3-18` + the S-7 error register |
| `public/md_updates/2026-10-09_settings_module_history_api.md` | — | the change record |

Two new utils are created rather than reusing an existing one; each is justified.
**`settings_history_cursor.utils`** — no keyset-cursor convention exists anywhere in the repo
(`grep -rn "next_cursor\|nextCursor" src/` returns nothing; every list endpoint is
`limit`/`offset`), so there is nothing to reuse. **`settings_history_normalise.utils`** — the
four shape translations are pure functions over JSONB maps, and keeping them out of the
service is what makes `T-S45`/`T-S62` unit-testable without a database.

### 4.3 Dependency direction — the one new reverse edge

Forward (unchanged): `settings → payroll`, `settings → document`, `settings → organization`,
`settings → billing`.

**Phase 3 creates the first reverse edge: `organization → settings`**, namely
`organization.service` requiring `settings/services/settings_audit.service`. Phase 2 §4.3
predicted and sanctioned exactly this ("the first such edge is Phase 3's
`settingsAudit.record`, deliberately deferred"). Two rules keep it safe:

* **D-P3-1 — the recorder's import closure must stay free of the adapters.**
  `settings_audit.service` may require **only** `../repositories/settings_change_log.repository`,
  `../catalog` and `../utils/settings_value.utils`. `catalog/index.js` is deliberately pure —
  the boot invariants that would need the adapters live in `adapters/index.js` precisely so
  the catalog never requires them. The resulting chains
  `organization.service → settings_audit.service → settings_change_log.repository → db` and
  `→ settings/catalog → catalog/*.js` contain **no cycle**, even though
  `settings/adapters/organization_billing.adapter.js → organization.service` exists.
  `T-P3-17` asserts the closure statically, so a future `require('../adapters')` in the
  recorder fails CI instead of producing a half-initialised module at boot.
* **D-P3-2 — the settings module reads foreign *tables* through `db.*`, never by requiring a
  foreign model or repository.** `settings_history.repository` uses `db.PayrollAuditLog`,
  `db.DocumentAuditLog` and `db.UserProfile` from `infrastructure/postgres-sql/models.index`.
  This matches the established project convention (the payroll module reads
  `db.DocumentLetterBranding` the same way rather than requiring `modules/document`).
  Reusing `payrollAuditLogRepo.findAndCount` was rejected: it is offset-paginated, cannot
  express the keyset predicate or the `new_values ? :key` JSONB test, and extending a shipped
  foreign repository to suit a reader's pagination is a larger change than owning the query.

---

## 5. Settings Ownership & Scope Model — the Phase 3 (history) view

### 5.1 Scope levels — Phase 3 treatment

| Scope | Exists? | Phase 3 treatment |
|---|---|---|
| **System / platform** | yes, as env flags and code constants | **Not Applicable — Reason:** platform values are deploy-time, have no actor, no org and no change event in the database. They are never written here, so they can have no history. |
| **Organization (tenant) singleton** | yes — 138 keys across 5 stores | **the whole of Phase 3's read surface.** |
| **Per-record / targeted** | yes — 49 surfaces | **Not in history — Reason:** parent §10.4. Leave (#1–#12), attendance (#13–#29) and organization (#30–#34) per-record writes are unaudited today; closing that is a separate plan. The change record must say so (AC-P3-16). |
| **User-level** | **No — Reason:** no registry entry is per-user configuration. No user-scoped setting exists, so none can have history. |
| **Role-specific** | **not as stored values.** Role enters only as who may read a group. | the ledger stores the actor's role **at change time** (`actor_role`) as attribution; that is not a setting scope. |

### 5.2 Where every change is audited — the verified map

This supersedes parent §10.1, which summarises three of the four shapes imprecisely.

| # | Store | Audit table | `entity_type` | `action` | Shape of `old_values` / `new_values` | Writer |
|---|---|---|---|---|---|---|
| 1 | `payroll_settings` | `payroll_audit_logs` | `payroll_settings` | `settings.updated` | **changed keys only**, both sides stored-row values — *except* `fnf_encashment_leave_type_codes`, always reported changed (F-P3-2, fixed in §9.3) | `payroll_settings.service.update`, in-txn |
| 2 | `statutory_configs` | `payroll_audit_logs` | `statutory_config` | `statutory_config.updated` | **changed keys only**, both sides stored-row values. No jsonb/array/dateonly key exists here, so its `!==` diff is sound | `statutory_config.service.updateConfig`, in-txn |
| 3 | `document_settings` | `document_audit_logs` | `document_settings` | `document_settings.updated` | **every submitted key**; `old` = stored, `new` = **submitted** (post-Joi, post-normalisation, pre-store). No diff is performed (F-P2-8) | `document_settings.service.update`, in-txn |
| 4 | `document_letter_branding` | `document_audit_logs` | `document_letter_branding` | `letter_branding.updated` | **two full 20-field DTOs**: `old = before`, `new = { ...before, ...changes }` (`T-S62`). 7 of the 20 fields are not catalog keys | `document_letter_branding.service.replace`, in-txn |
| 5 | `organization_profiles` | **`settings_change_logs`** (new) | n/a — a `store` column | n/a | **one row per changed key**, both sides stored-row values | `organization.service.updateOrganizationProfileFieldsLocked`, in its existing txn, via `settingsAudit.record` (§9.1) |

**The gateway writes no audit row for stores 1–4.** Duplicating would create two answers to
"who changed this", which is the whole reason §10.1 exists — and the ledger's `store` CHECK
actively forbids it.

### 5.3 Ledger membership rule, stated once

> **A store gets a `settings_change_logs` row if and only if it has no audit table of its own.**

Today that is **exactly** `organization_profiles`. `document_letter_branding` is the tempting
mistake: it was the fifth store added by DEF-S12, so it *looks* new — but its `replace()`
already audits to `document_audit_logs`, so it must **not** get a ledger row.
`CHECK (store IN ('organization_profiles'))` is what stops a future contributor adding one by
reflex, and `T-P3-16` asserts the recorder refuses any other store **before** the database
does, so the failure is a clear `500` from our own code rather than a constraint violation.

### 5.4 History coverage — the number the change record must state

| Population | Count | In S-7 history? |
|---|---|---|
| Catalog keys on the four already-audited stores | 136 | **yes** |
| Catalog keys on `organization_profiles` (#97/#98) | 2 | **yes, from the day the recorder ships** (no backfill — §23.2) |
| **Total settings keys with history** | **138** | **yes** |
| Per-record settings behind the 49 surfaces | 49 registry entries | **no** — parent §10.4, DEF-S4/S5/S6 |

The 6 keys whose diff is wrong unless `valuesEqual` is used — these drive §12.3 rule 2 and §9.3:

| Key | Store | `data_type` |
|---|---|---|
| `fnf_encashment_leave_type_codes` | `payroll_settings` | `jsonb` |
| `document_expiry_reminder_days` | `document_settings` | `array` |
| `letter_auto_issue_on_exit` | `document_settings` | `jsonb` |
| `registered_address_lines` | `document_letter_branding` | `array` |
| `billing_notification_emails` | `organization_profiles` | `jsonb` |
| `billing_reminder_lead_days` | `organization_profiles` | `jsonb` |

### 5.5 Override precedence, inheritance, defaults

**Not Applicable — Reason:** Phase 3 reads a change log. It resolves no value, applies no
default and evaluates no precedence. `inherits_from` (e.g. #95 `letter_record_retention_days`
inheriting `document_retention_days` when null) is catalog metadata published by S-1/S-2 and
is **not** re-derived here: history reports the literal recorded `old_value`/`new_value`,
including `null`, and never substitutes the inherited or default value for it. A client that
needs to know what `null` meant reads the catalog entry (**D-P3-3**).

---

## 6. Architecture, Directory Structure & Wiring

### 6.1 Request path — S-7

```text
GET /api/v1/settings/history?group=…&setting_key=…&limit=…&cursor=…
  → authenticate → authorize(['hr']) → requireActiveOrg          (route)
  → controller.getHistory
        ctx(req)                                                  (existing)
        validateOrThrow(historyQuerySchema, req.query)            (existing util, new schema)
        decodeCursor(q.cursor)                                    (new util)
  → settings_history.service.getHistory(ctx, filters)
        1. resolve filter → in-scope groups          (catalog)
        2. RBAC project                              (projection.isGroupReadable)
        3. entitlement project                       (resolveEntitlements)   ← §15.2
        4. groups → stores → audit sources           (adapters[].auditSource)
        5. fetch limit+1 rows per source, in parallel (Promise.allSettled)
        6. normalise each row → items                (normalise utils, pure)
        7. merge-sort + frontier + trim              (cursor utils, pure)
        8. hydrate actor names in ONE query          (db.UserProfile)
  → envelope({ items, next_cursor, unavailable_sources, meta })
```

### 6.2 Write path — the recorder

```text
PUT /organizations/profile          (module door)      PUT /settings/groups/billing.notifications  (gateway door)
      │                                                      │
      └─ organization.controller ──┐              settings_write.service → organization_billing.adapter
         audit: {role,ip,reqId,                              │
                 source:'module_api'}                audit: {role,ip,reqId,reason,
      ┌──────────────────────────────┘                       source:'settings_api'}
      ▼                                                      │
organization.service.updateOrganizationProfileFieldsLocked  ◀┘
      ├─ BEGIN
      ├─ lockOrganizationProfileByOrgId   (FOR UPDATE)       ← shipped (DEF-S10)
      ├─ assertUpdatedAtMatches(locked, ifMatch)             ← shipped
      ├─ before = locked.get({plain:true})                   ← shipped
      ├─ UPDATE organization_profiles                        ← shipped
      ├─ after = findOrganizationProfileByOrgId(txn)         ← shipped
      ├─ settingsAudit.recordDiff({before, after, …}, txn)   ◀── NEW, one row per changed key
      └─ COMMIT
```

The recorder is inside the transaction, so **a recorder failure rolls the settings change
back** (parent §10.2, F-10). That is deliberate: an unattributable change to a control is
worse than a failed save.

### 6.3 Files, annotated

```text
src/infrastructure/postgres-sql/
  migrations/00073-create-settings-change-logs.js        ★ NEW   §7.4
  models.index.js                                        ▲ EDIT  MODEL_ROOTS += settings/models

src/modules/settings/
  models/settings_change_logs.model.js                   ★ NEW   §7.3
  repositories/settings_change_log.repository.js         ★ NEW   §13.1
  repositories/settings_history.repository.js            ★ NEW   §13.2
  services/settings_audit.service.js                     ★ NEW   §8
  services/settings_history.service.js                   ★ NEW   §12
  utils/settings_history_cursor.utils.js                 ★ NEW   §10.3
  utils/settings_history_normalise.utils.js              ★ NEW   §12.2
  controllers/settings.controller.js                     ▲ EDIT  + getHistory  §11
  routes/settings.routes.js                              ▲ EDIT  + GET /history  §6.4
  validators/settings.validator.js                       ▲ EDIT  + historyQuerySchema  §14
  catalog/**                                             — unchanged (D-P3-7)
  adapters/**                                            — unchanged except organization_billing  §9.1.3

src/modules/organization/
  services/organization.service.js                       ▲ EDIT  recorder wiring  §9.1
  controllers/organization.controller.js                 ▲ EDIT  actor context    §9.1.3

src/modules/payroll/
  services/payroll_settings.service.js                   ▲ EDIT  DEF-S11 completion  §9.3
```

`★` = create, `▲` = edit. **No other file in the repository is touched.**

### 6.4 Route wiring

```js
// settings.routes.js — /history is a LITERAL segment and goes ABOVE /groups/:groupKey,
// per the file's own normative ordering comment. hr only: a manager has no administrative
// history view (parent §16 Phase 3 security row).
const settingsHistoryAuth = [authenticate, authorize(['hr']), requireActiveOrg]

router.get('/catalog', settingsReadAuth, controller.getCatalog)                      // S-1 #242
router.get('/catalog/:settingKey', settingsReadAuth, controller.getCatalogEntry)     // S-2 #243
router.get('/history', settingsHistoryAuth, controller.getHistory)                   // S-7 #248  ◀ NEW
router.post('/groups/:groupKey/reset', settingsWriteAuth, controller.resetGroup)     // S-6 #247
router.put('/groups/:groupKey', settingsWriteAuth, controller.updateGroup)           // S-5 #246
router.get('/groups/:groupKey', settingsReadAuth, controller.getGroup)               // S-4 #245
router.get('/', settingsReadAuth, controller.getAll)                                 // S-3 #244
```

`/history` does not currently collide with any pattern route (there is no top-level
`/:param`), so the ordering is defensive rather than load-bearing — but it is the convention
the file sets, and `T-P3-18` asserts the order so a future top-level `/:something` cannot
silently capture it.

`src/app.js` and `settings.index.js` are **not** touched: the module is already mounted.

---

## 7. Database Layer

### 7.1 What is **not** created

No table for setting values. No `settings`, `org_settings`, `setting_definitions`,
`setting_overrides` or `setting_versions` table. No column, type, constraint or index is
added to, or removed from, **any existing table** — including the two audit tables the reader
queries (parent §6.3, F-P3-6: their existing indexes are selective enough).

### 7.2 `settings_change_logs` — normative schema

Append-only. **One row per changed key** (not per request), so history can be filtered by key
without JSONB containment scans. The shape deliberately mirrors the two existing audit tables
so the reader can union them with a trivial projection.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | no | `UUIDV4` | PK |
| `org_id` | `UUID` | no | — | FK → `organizations(id)`, `ON UPDATE CASCADE ON DELETE CASCADE` |
| `store` | `VARCHAR(40)` | no | — | CHECK-constrained to `'organization_profiles'` |
| `group_key` | `VARCHAR(60)` | no | — | e.g. `'billing.notifications'`; resolved by the recorder from the catalog, never passed by the caller |
| `setting_key` | `VARCHAR(80)` | no | — | the column name, e.g. `'billing_reminder_lead_days'` |
| `registry_ref` | `SMALLINT` | yes | — | registry entry number (97/98); nullable so a future unregistered key can still be logged |
| `entity_id` | `UUID` | yes | — | the owning row's id (`organization_profiles.id`). **No FK** — the referent is a settings row, not an entity, and an FK would couple an append-only evidence table to a mutable row's lifecycle |
| `old_value` | `JSONB` | yes | — | see §7.2.1 |
| `new_value` | `JSONB` | yes | — | see §7.2.1 |
| `actor_id` | `UUID` | yes | — | FK → `users(id)`, `ON UPDATE CASCADE ON DELETE SET NULL`; `null` for a system/cron change |
| `actor_role` | `VARCHAR(20)` | yes | — | the role key at the time of change (`'hr'`) |
| `reason` | `TEXT` | yes | — | required by the API for `risk='high'` keys; neither #97 nor #98 is high-risk today, so it is normally `null` on this store |
| `source` | `VARCHAR(20)` | no | — | `'settings_api'` / `'module_api'` / `'system'`; CHECK-constrained |
| `ip_address` | `VARCHAR(64)` | yes | — | wider than `payroll_audit_logs`' `VARCHAR(45)`, per parent §6.2; comfortably fits IPv6 plus a zone id |
| `request_id` | `VARCHAR(100)` | yes | — | `x-request-id` correlation |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | |

**No `updated_at`, no `deleted_at` — append-only by construction.** The repository exposes
only `create` and reads (`T-S10`); that absence is the enforcement, matching
`payroll_audit_log.repository`'s documented stance.

#### 7.2.1 Nullability of the value columns (EC-S12)

`old_value` / `new_value` are nullable **and** may legitimately contain `'null'::jsonb`.
"The column was NULL before" and "we did not record a before value" must stay
distinguishable:

* caller passes a value (including JS `null`) → recorder writes **JSON null**, i.e.
  `sequelize.literal("'null'::jsonb")`, **not** SQL `NULL`;
* caller passes `undefined` → recorder writes **SQL `NULL`**, meaning *genuinely unknown*.

**Implementation trap, verified:** Sequelize maps JS `null` to SQL `NULL` for a `JSONB`
column. Writing JSON `null` therefore requires the literal; `T-S49` asserts it.

**EC-P3-1 — this path is unreachable through today's only caller.** Both
`organization_profiles` settings columns are `allowNull: false` with defaults `[]` and
`[7,1]`, so a real `before` is never SQL `NULL`. The code exists for the DEF-S4/S5/S6
follow-up, and `T-S49` must therefore exercise the **recorder directly** with a synthetic
key, not through the organization path. Say so in the test, or a later reader will assume
coverage that does not exist.

### 7.3 Constraints and indexes

**Constraints — exactly two CHECKs** (F-P3-3; §6.2 of the parent is normative and §17.5 step 5
is a drafting error):

```sql
ALTER TABLE "settings_change_logs"
  ADD CONSTRAINT "scl_store_known"
  CHECK ("store" IN ('organization_profiles'));

ALTER TABLE "settings_change_logs"
  ADD CONSTRAINT "scl_source_known"
  CHECK ("source" IN ('settings_api','module_api','system'));
```

`scl_store_known` is deliberately narrow so an accidental double-write from an
already-audited store **fails loudly** instead of creating duplicate history (§5.3). Widening
it is a one-line later migration, by design.

**Indexes — four**, all `DESC` on `created_at` because every read is newest-first. Expressed
as raw `CREATE INDEX` so the sort direction is unambiguous:

| Index | Columns | Purpose |
|---|---|---|
| `idx_scl_org_created` | `(org_id, created_at DESC)` | the default history page |
| `idx_scl_org_key_created` | `(org_id, setting_key, created_at DESC)` | history of one setting |
| `idx_scl_org_group_created` | `(org_id, group_key, created_at DESC)` | history of one group |
| `idx_scl_org_actor_created` | `(org_id, actor_id, created_at DESC)` | "what did this HR user change" |

No index on `(org_id, source)` or `(org_id, store)`: `store` has one legal value today, and
`source` has three — neither is selective, and both are residual filters inside an already
org-narrowed set.

**Keyset note:** the cursor orders by `(created_at DESC, id DESC)` but the indexes end at
`created_at DESC`. That is intentional — the `id` tiebreak only matters among rows sharing a
microsecond timestamp, which is at most a handful, and adding `id` to four indexes to sort a
handful of rows is not worth the write cost.

### 7.4 Migration `00073-create-settings-change-logs.js`

| Property | Value |
|---|---|
| Number | `00073` — verified next free (P-3) |
| Transaction | one `queryInterface.sequelize.transaction()` wrapping table + CHECKs + indexes, per the `00069` convention |
| `up()` | `createTable` (§7.2) → two raw-SQL `ALTER TABLE … ADD CONSTRAINT` → four raw-SQL `CREATE INDEX` |
| `down()` | `dropTable('settings_change_logs')` inside a transaction. **Drops only this table.** Constraints and indexes go with it. **No data loss anywhere else** — nothing outside this table is created, altered or referenced |
| Existing data | none to handle: the table is new and starts empty. **No backfill** (§23.2) |
| Destructive? | **no.** `up()` creates; `down()` drops a table this migration created |
| Rollback safety | safe **if the code is reverted first** — see §23.4; a live recorder against a dropped table would fail inside `updateProfile`'s transaction and block all profile updates |
| Lock footprint | `CREATE TABLE` + `CREATE INDEX` on an empty new table: no lock on any existing table, so it is safe to apply while the application is serving traffic |
| Timestamps | `created_at` is `TIMESTAMPTZ NOT NULL DEFAULT now()`; the model declares `timestamps: true, createdAt: 'created_at', updatedAt: false` |

### 7.5 Model and `MODEL_ROOTS`

```js
// src/modules/settings/models/settings_change_logs.model.js
// Append-only. NOT paranoid — no deleted_at, no updated_at, and the repository exposes
// only create + read. That absence is the enforcement (T-S10).
tableName: 'settings_change_logs',
timestamps: true, createdAt: 'created_at', updatedAt: false,
paranoid: false, underscored: true

SettingsChangeLog.associate = (models) => {
  SettingsChangeLog.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' })
  SettingsChangeLog.belongsTo(models.User,         { foreignKey: 'actor_id', as: 'actor' })
}
```

`MODEL_ROOTS` gains one entry, placed last to match the existing ordering convention:

```js
path.join(__dirname, '../../modules/settings/models'),
```

**D-P3-4 — `MODEL_ROOTS` is edited in Phase 3, not earlier.** The loader is guarded by
`fs.existsSync(dir)`, so adding the root before the directory exists would be harmless but
misleading. Adding it in the same commit as the model keeps "a model root exists ⟺ models
exist" true.

**Deployment coupling (EC-P3-2):** the moment `MODEL_ROOTS` includes the directory, the model
is defined at boot and `associate` runs. The model being *defined* does not touch the
database, so an instance that boots before the operator applies `00073` starts fine and only
fails if a request reaches the recorder or S-7. That is the correct failure shape and it is
why §23.3 sequences the migration **before** the code deploy.

---

## 8. The Recorder — `settingsAudit.record`

### 8.1 Contract

```js
// src/modules/settings/services/settings_audit.service.js
//
// One row per changed key. The transaction is REQUIRED: audit must be atomic with the
// change it records (parent §10.2, T-S13). This service NEVER opens a transaction and
// NEVER catches a repository error — a failed audit must fail the enclosing write.

async record({
  orgId, store, settingKey, entityId,
  oldValue, newValue,                 // JS null => JSON null; undefined => SQL NULL (§7.2.1)
  actorId, actorRole, reason, source, ipAddress, requestId
}, transaction) -> SettingsChangeLog

async recordDiff({
  orgId, store, entityId, before, after, keys,
  actorId, actorRole, reason, source, ipAddress, requestId
}, transaction) -> string[]           // the setting keys actually recorded
```

### 8.2 Rules `record()` obeys

| # | Rule | Why / test |
|---|---|---|
| 1 | **Throws synchronously if `transaction` is falsy**, with the `document_audit.service` message shape: `[settings] audit.record requires a transaction — refusing to write outside the enclosing write` | `T-S13`. Copies a shipped precedent rather than inventing one |
| 2 | **Never opens a transaction, never swallows an error** | parent §10.2 / F-10: a settings change is never applied unattributed |
| 3 | **Resolves `group_key` and `registry_ref` from the catalog**, via `catalog.byKey(settingKey)`; the caller supplies neither | one source of truth; a typo'd group can't enter the ledger |
| 4 | **Rejects an unknown `settingKey`** (`catalog.byKey` → `null`) with an `Error` | `T-P3-15`. `group_key` is `NOT NULL` and a non-catalog column has no group; silently inventing one would corrupt the group filter |
| 5 | **Rejects any `store` other than `'organization_profiles'`** with an `Error`, and additionally asserts `entry.store === store` | `T-P3-16`. Fails in our code with a clear message before the CHECK fires (§5.3) |
| 6 | **Writes JSON null, not SQL NULL, for a known-null value** (`sequelize.literal("'null'::jsonb")`) | `T-S49`, §7.2.1 |
| 7 | **Writes exactly one row**; the per-key loop is the caller's (`recordDiff`) | parent §10.2 |
| 8 | **Logs nothing containing a value or the reason text** | §17.2; parent §20.2 "no `reason` text in logs" |

### 8.3 Rules `recordDiff()` obeys

| # | Rule | Why / test |
|---|---|---|
| 1 | `keys` defaults to **the catalog keys of `store`** — for `organization_profiles`, exactly `['billing_notification_emails','billing_reminder_lead_days']` | **D-P3-5**, below |
| 2 | Compares `before[k]` against `after[k]` with **`valuesEqual(before[k], after[k], entry.data_type)`**, never `!==` | both org keys are `jsonb`; `!==` would record a phantom change on every write (the same class of bug as F-P3-2) |
| 3 | Records a row **only** for keys that differ; returns the recorded key list | `T-P3-10` |
| 4 | Both sides come from the **stored rows** (`before` = locked pre-read, `after` = post-update re-read), never from the submitted patch | `billing_notification_emails` is `.trim().lowercase()`-normalised by the owner's Joi, so a submitted value can differ from the stored one |
| 5 | Awaits each `record()` **sequentially** inside the caller's transaction | two writes on one transaction must not be concurrent; and 1–2 rows makes parallelism pointless |

> **D-P3-5 — the ledger records settings keys only, not the other 16 profile columns.**
> `updateOrganizationProfileFieldsLocked` accepts up to 18 fields, of which only #97/#98 are
> settings. The other 16 (`org_name`, `address`, `gst_number`, …) are **organization master
> data**, deliberately excluded from the registry (parent §2.5.3) and therefore have no
> `group_key` — which is `NOT NULL`. Logging them would (a) require inventing a group,
> (b) turn the settings ledger into a general org-profile audit, and (c) pre-empt the separate
> DEF-S6 plan. They stay unaudited, exactly as today, and the change record says so.

---

## 9. Owner-Service Changes

Three owners are touched. Every change is additive or behaviour-preserving, and every existing
signature keeps its external contract.

### 9.1 `organization.service` — the recorder wiring (F-P3-1)

#### 9.1.1 Signature

```js
async updateOrganizationProfileFieldsLocked(
  actorUser,
  payload,
  { ifMatch = null, audit = null } = {}      // ◀ audit is NEW and OPTIONAL
)
```

`audit` is `{ actorRole, ipAddress, requestId, reason, source }`. Everything else — parameters,
return value `{ before, row }`, error codes, the lock, the `If-Match` assertion — is unchanged.

#### 9.1.2 Placement

`settingsAudit.recordDiff(...)` is called **after** `after = findOrganizationProfileByOrgId(orgId, transaction)`
and **before** `await transaction.commit()`, passing that same `transaction`.

**EC-P3-3 — `audit == null` must not skip attribution silently.** Three callers exist after
this phase (module controller, settings adapter, and any future internal caller). Rule:

* `audit` present → record with its `source`;
* `audit` absent → record with `source: 'system'`, `actorRole: null`, `ipAddress: null`,
  `requestId: null`, and `actorId` from `actorUser.id`.

A change is therefore **always** recorded; the worst case is a weakly attributed row, never a
missing one. `T-P3-11` asserts it. Making `audit` required instead would turn an unmigrated
internal caller into a `500`, which is a worse trade for an audit feature.

#### 9.1.3 Threading the actor context (F-P3-4)

| Caller | Change |
|---|---|
| `organization.controller.handleUpdateOrganizationProfile` | pass `{ audit: { actorRole: req.user.role, ipAddress: req.ip \|\| null, requestId: req.headers['x-request-id'] \|\| req.headers['x-correlation-id'] \|\| null, reason: null, source: 'module_api' } }`. The request-id fallback chain is copied from `settings.controller.ctx()` so the two doors correlate identically |
| `settings/adapters/organization_billing.adapter.js` | its `update(orgId, patch, actor, { ifMatch })` already receives the gateway's full `ctx`; pass `{ ifMatch, audit: { actorRole: actor.actorRole, ipAddress: actor.ipAddress, requestId: actor.requestId, reason: actor.reason \|\| null, source: 'settings_api' } }` |
| `settings_write.service.runPipeline` | pass `reason` into the `ctx`-derived actor object handed to `adapter.update()` — the **one** place the discarded reason is reconnected (see §9.2; this half is needed for the ledger even if OD-P3-1 is declined for the other four stores) |

`T-S48` is satisfied by exactly this split: `'settings_api'` for a gateway write,
`'module_api'` for a direct `PUT /organizations/profile`, `null` for every row sourced from the
two JSONB audit tables.

### 9.2 Threading `reason` to the four audited owners — **OD-P3-1**

**The problem, verified.** S-5/S-6 require a `reason` for the 8 `risk:'high'` keys and
**discard it**. `payroll_audit_logs` and `document_audit_logs` both have a `reason` column;
none of the four owner settings-update methods sets it. So FR-5's "why" — part of the S-7
response shape in parent §7.8 — would be permanently `null` for 136 of 138 keys.

**Recommendation: accept.** The gate is close to pointless if the answer is thrown away, the
column already exists and is nullable, and the four changes are one line each.

| File | Change |
|---|---|
| `settings_write.service.js` | include `reason` in the actor context passed to `adapter.update()` |
| `payroll_settings.adapter.js`, `statutory_config.adapter.js`, `document_settings.adapter.js`, `document_letter_branding.adapter.js` | forward `reason` to the owner call |
| `payroll_settings.service.update`, `statutory_config.service.updateConfig` | `reason: actor.reason \|\| null` in the `record()` payload |
| `document_settings.service.update`, `document_letter_branding.service.replace` | accept `reason` in the options object and pass it to `auditService.record` |

**Risk and blast radius.** Adding a value to an existing nullable column that nothing reads
today. It changes a **shipped audit payload**, so every pre-existing payroll and document
settings test must still pass unmodified — that is the acceptance condition (AC-P3-13), the
same bar Phase 2 used.

**If declined:** skip this section entirely and ship §9.1 only. S-7 then returns
`reason: null` for every non-ledger item, and the change record must state that a high-risk
settings reason is **collected and not retained**. The endpoint contract is unchanged either
way — `reason` is nullable in both outcomes, so this decision cannot break a client.

### 9.3 `payroll_settings.service` — completing DEF-S11 (F-P3-2)

```js
// before
for (const key of Object.keys(patch)) {
  if (before[key] !== updated[key]) { oldValues[key] = before[key]; newValues[key] = updated[key] }
}

// after — the one comparator, type from the catalog
const { valuesEqual } = require('../../settings/utils/settings_value.utils')
const settingsCatalog = require('../../settings/catalog')
for (const key of Object.keys(patch)) {
  const entry = settingsCatalog.byKey(key)
  const same = entry
    ? valuesEqual(before[key], updated[key], entry.data_type)
    : before[key] === updated[key]            // non-catalog column: unchanged behaviour
  if (!same) { oldValues[key] = before[key]; newValues[key] = updated[key] }
}
```

| Aspect | Answer |
|---|---|
| **Blast radius** | 62 of 63 keys behave identically (`valuesEqual` reduces to `===` for boolean/string/enum, and to `Number(a)===Number(b)` for integer/decimal where both sides are already `pg` strings). The 63rd, `fnf_encashment_leave_type_codes`, stops producing a phantom audit row |
| **Dependency direction** | `payroll → settings/utils` + `payroll → settings/catalog`. This is a **second reverse edge**, beyond §4.3's one. It is accepted because `settings_value.utils` has **zero imports** and `settings/catalog` is pure data — neither can cycle back into payroll. `T-P3-17` asserts both closures |
| **Alternative considered** | relocate `valuesEqual` to `src/common/utilities/` (the `if_match.utils` precedent), removing the reverse edge. **Rejected for Phase 3:** it would move a Phase-1 file that 5 shipped settings files import, for a cosmetic gain, in the same commit as a migration. Recorded as **OD-P3-2** for a later cleanup if a third module needs it |
| **Why not defer to Phase 4?** | Phase 3 is the phase that *publishes* this diff. Shipping S-7 on a knowingly wrong diff would mean S-5 and S-7 disagreeing about the same write, in production, with the explanation living only in this document |
| **Test** | `T-P3-12`: submitting an identical `fnf_encashment_leave_type_codes` array records **no** audit row, and the existing payroll settings tests pass unmodified |

### 9.4 What is **not** touched in any owner

* No owner's Joi schema, guard, lock, transaction boundary, error code or return value.
* `document_settings.service`'s record-every-submitted-key behaviour (F-P2-8) is **left
  alone**; the reader absorbs it (§12.3 rule 4). Normalising it would change shipped audit
  behaviour for a reader's convenience, and the fix at the reader is strictly safer.
* `document_letter_branding.service`'s two-full-DTO audit shape is **left alone** for the same
  reason (parent §10.1 says so explicitly); the reader diffs it (`T-S62`).
* `statutory_config.service`'s `!==` diff: verified sound (no jsonb/array/dateonly key on that
  store). Changing it would be an unrequested edit. **Mention it, do not touch it.**
* `payroll_audit_log.repository`'s `REDACT_DENYLIST` (`account_number`, `payroll_encryption_key`):
  **verified that no catalog key matches it**, so no settings value is ever stored as
  `[REDACTED]`. The reader passes values through verbatim and must not try to "repair" a
  redaction (**D-P3-6**).

---

## 10. API Layer

### 10.1 Endpoint register — Phase 3 delta

| ID | Method & path | Registry # | Auth | Roles | Entitlement | Idempotent |
|---|---|---|---|---|---|---|
| **S-7** | `GET /api/v1/settings/history` | **#248** | required | **`hr` only** | per-group, projected (§15.2) | yes — a safe read |

#242–#247 are **unchanged**: no new field, no changed status code, no changed error code
(§24). No write endpoint is added in Phase 3.

### 10.2 S-7 `GET /settings/history` — normative contract

**Purpose.** FR-5.

**Query parameters**

| Param | Type | Rules |
|---|---|---|
| `group` | string | `^[a-z0-9_.]{1,60}$`. Unknown group → `404 GROUP_NOT_FOUND` (consistent with S-4) |
| `setting_key` | string | `^[a-z0-9_]{1,80}$`. Unknown key → `404 SETTING_NOT_FOUND` (consistent with S-2) |
| `actor_id` | UUID | `Joi.string().uuid()` |
| `from` / `to` | ISO 8601 | `Joi.date().iso()`; `to` must be `>= from` → else `422 INVALID_DATE_RANGE` |
| `source` | enum | `settings_api` \| `module_api` \| `system`. **See the caveat below** |
| `limit` | integer | 1–100, default **50** |
| `cursor` | string | opaque, `^[A-Za-z0-9_-]{1,300}$`; malformed → `400 INVALID_CURSOR` |

`group` and `setting_key` may be combined; if the key is not in the group → `422 FILTER_CONFLICT`.
Every param is a **scalar** `Joi.string()`/`Joi.number()`, never `Joi.array`, so a polluted
`?group=a&group=b` (an array in Express 5) fails validation rather than being silently
`[0]`-indexed — the Phase 1 `T-P1-13` rule.

**Response `200`, `data`:**

```text
{
  items: [
    {
      occurred_at: "2026-10-07T09:12:04.221Z",
      group: "documents.retention",
      setting_key: "letter_record_retention_days",
      registry_ref: 95,
      old_value: null,
      new_value: 730,
      actor: { id: "…", name: "Asha Rao", role: "hr" },   // role: null for non-ledger rows (F-P3-5)
      reason: "Internal policy LP-14",                     // null unless OD-P3-1 is accepted
      source: null,                                        // non-null ONLY for ledger rows
      request_id: "…",
      audit_source: "document_audit_logs"
    }
  ],
  next_cursor: "eyJ2IjoxLCJ0Ijoi…" | null,
  unavailable_sources: [ { table: "payroll_audit_logs", reason: "READ_FAILED" } ],
  meta: { sources_read: 3, sources_unavailable: 0, returned: 50 }
}
```

The item shape is **exactly** parent §7.8's. `next_cursor`, `unavailable_sources` and `meta`
are the envelope: `next_cursor` from §7.8, `unavailable_sources` from F-19 ("surface the
available sources and mark the failing one") using Phase 1's `unavailable_groups` naming
convention, `meta` mirroring S-3's.

**Three caveats that must appear in the change record, not just here**

1. **`source` is only known for ledger rows.** Neither audit table has a `source` column
   (parent §7.8). A row from `payroll_audit_logs`/`document_audit_logs` reports
   `source: null`, never a guessed `'module_api'`. **Consequence: `?source=…` returns only
   ledger rows** — filtering by a column two of three sources do not have cannot do anything
   else. `T-P3-13`.
2. **`actor.role` is only known for ledger rows**, for the same reason (F-P3-5).
3. **`next_cursor === null` is the only end-of-history signal.** A page may be **shorter than
   `limit`** and still have more: no-op items are dropped (§12.3 rule 4) and the merge
   frontier (§10.3) can cut a page short. **A client must not stop on a short page.**

**Key-filter caveat (parent §7.8, restated):** filtering by `setting_key` against the JSONB
audit tables uses key-existence (`new_values ? :key`). `payroll_audit_logs` has no GIN index
on `new_values`, so the predicate degrades to a scan **within** the rows already narrowed by
`(org_id, entity_type)` — for a settings entity type, at most the org's settings-change count.
Acceptable. If an org ever exceeds ~50k settings changes, add a GIN index then, not now.

**Cache headers.** `ETag` is **not** set: history is append-only and unbounded, so a
meaningful validator would be the newest row's `(created_at, id)` across three tables — a
query as expensive as the answer. `Cache-Control: private, max-age=0, must-revalidate`, the
same header S-1…S-4 send. **D-P3-8.**

### 10.3 Keyset cursor — normative design

**Why keyset and not offset:** audit tables grow and are append-only; an offset page
re-reads everything before it, and a concurrent insert shifts every subsequent page. No
keyset convention exists in the repo (§4.2), so this is the first one.

**Order:** `created_at DESC, id DESC, setting_key ASC`.
The third component exists because **one audit row fans out to many items** (§12.3), so a
page boundary can land *inside* a row. `setting_key ASC` makes the within-row order total and
deterministic; rows are immutable, so the order is stable forever.

**Encoding:** `base64url(JSON.stringify({ v: 1, t: <ISO created_at>, i: <row uuid>, k: <setting_key|null> }))`.
`v` lets a future change reject old cursors explicitly rather than mis-parse them. Decoding
validates all four fields and throws `400 INVALID_CURSOR` on anything else — including a
valid-base64 payload with a bad shape, and an unknown `v`. **The cursor is not signed and not
encrypted**: it carries no secret, and it is scoped by `org_id` from the token on every
request, so a forged cursor can only reposition the caller within their **own** org's history
(`T-P3-7`).

**Per-source predicate** (`:t`, `:i` from the cursor):

```sql
created_at < :t  OR  (created_at = :t AND id <= :i)
```

`<=` on the tie, not `<`, so the partially consumed row is re-fetched and its remaining keys
(`setting_key > :k`) can be emitted. Keys `<= :k` of that exact row are dropped in the
normalise step. `T-P3-6`.

**The frontier rule — why a page can be short.** Each source is fetched `limit + 1` **rows**,
but a row yields 1..60 **items**, so the sources cannot be merged to exactly `limit` items
without re-querying. The reader therefore bounds the page:

```text
frontier = max over sources that returned exactly (limit+1) rows
             of that source's oldest fetched (created_at, id)

emit only items with (created_at, id) >= frontier     # everything at-or-newer is complete
trim to limit
next_cursor = cursor(last emitted item)
            | cursor(frontier, k=null)   if nothing was emitted but a frontier exists
            | null                       if every source returned <= limit rows and nothing was trimmed
```

Below the frontier we cannot know whether a *different* source has newer unfetched rows, so
emitting there could interleave wrongly. Taking `max` (the newest of the "may have more"
boundaries) is the standard bound for a merge over independently limited sources. The
`nothing emitted but a frontier exists` branch is what guarantees **forward progress** when a
whole page is dropped as no-ops — without it a client could loop forever. `T-P3-8`.

### 10.4 Error register (complete, S-7)

| Status | `errorCode` | Trigger |
|---|---|---|
| `401` | (auth middleware) | no / invalid token |
| `403` | `FORBIDDEN` | any role other than `hr` — includes `manager`, `employee`, `admin`, `super-admin` |
| `403` | `ORG_INACTIVE` (middleware) | `requireActiveOrg` |
| `400` | `VALIDATION_ERROR` | query fails Joi (bad regex, array pollution, unknown param, `limit` out of range) |
| `400` | `INVALID_CURSOR` | undecodable, wrong shape, or unknown `v` |
| `404` | `GROUP_NOT_FOUND` | `?group=` names no catalog group |
| `404` | `SETTING_NOT_FOUND` | `?setting_key=` names no catalog key |
| `422` | `INVALID_DATE_RANGE` | `to < from` |
| `422` | `FILTER_CONFLICT` | `setting_key` is not a member of `group` |
| `403` | `FEATURE_NOT_AVAILABLE` | a **targeted** filter (`group` or `setting_key`) resolves to a non-entitled group (§15.2) |
| `200` | — | partial source failure → `unavailable_sources[]` inside the `200` (F-19) |
| `503` | `SETTINGS_HISTORY_UNAVAILABLE` | **every** queried source failed |
| `503` | `ENTITLEMENT_DEPENDENCY_FAILURE` | propagated unchanged from the entitlement resolver — never flattened to `403` |

---

## 11. Controller Layer

`getHistory` is the fifth handler in `settings.controller.js` and follows the same five-step
body as the other four. It is **thin by construction**:

```js
// S-7 — GET /settings/history
async function getHistory(req, res, next) {
  try {
    const c = ctx(req)                                             // existing
    const q = validateOrThrow(schemas.historyQuerySchema, req.query)
    if (q.to && q.from && new Date(q.to) < new Date(q.from)) {
      throw new AppError(422, 'to must not be earlier than from', 'INVALID_DATE_RANGE')
    }
    const data = await historyService.getHistory(c, {
      group: q.group !== undefined ? q.group : null,
      settingKey: q.setting_key !== undefined ? q.setting_key : null,
      actorId: q.actor_id !== undefined ? q.actor_id : null,
      from: q.from || null,
      to: q.to || null,
      source: q.source !== undefined ? q.source : null,
      limit: q.limit,
      cursor: cursorUtils.decode(q.cursor)                         // throws 400 INVALID_CURSOR
    })
    res.set('Cache-Control', CACHE_CONTROL)
    return res.status(200).json(envelope(data))
  } catch (err) { return next(err) }
}
```

| Responsibility | Where |
|---|---|
| Request parsing | `ctx(req)` + `validateOrThrow` — both existing |
| Validation integration | the new `historyQuerySchema`; the one cross-field rule (`to >= from`) is here because Joi's `ref` cannot express it as cleanly and the parent lists `400` on a malformed date as a controller-level concern |
| Cursor decode | here, so no service or repository needs to know the encoding — mirrors Phase 2's `parseIfMatch` split (D-P2-2) |
| Authorization enforcement | **not here.** Coarse role gate is the route; per-group RBAC + entitlement is the service (§15) |
| Service invocation | exactly one call |
| Response construction | `envelope(data)` + `Cache-Control`. No `ETag` (D-P3-8) |
| Error propagation | `next(err)` only; never a `res.status(500)` |

**It never:** touch `req.body`, assign to `req.query` (Express 5 forbids it), query a model,
decide role access, call the catalog for a projection, or shape a history item.

---

## 12. Service Layer — `settings_history.service.js`

### 12.1 Responsibilities and the eight ordered steps

| Step | Action | Fails with |
|---|---|---|
| 1 | **Resolve the filter to in-scope groups.** `setting_key` → `catalog.byKey` → its group; `group` → `catalog.groupByKey`; neither → all 26 groups. Both → assert membership | `404 SETTING_NOT_FOUND` / `404 GROUP_NOT_FOUND` / `422 FILTER_CONFLICT` |
| 2 | **RBAC project.** Keep groups where `projection.isGroupReadable(group, ctx.actorRole)`. For `hr` this is all 26 today; it is implemented anyway so a future `manager` widening cannot leak | `403 FORBIDDEN` if a *targeted* filter names an unreadable group |
| 3 | **Entitlement project.** `resolveEntitlements(ctx.orgId, distinct featureKeys)`; drop non-entitled groups | `403 FEATURE_NOT_AVAILABLE` if a *targeted* filter names a non-entitled group; a `503` propagates unchanged |
| 4 | **Groups → stores → sources.** `group.store` → `adapterForStore(store).auditSource`. Group by `table`: `null` ⇒ the ledger. Build the `entity_type`/`action` pair set per table | — |
| 5 | **Fetch `limit + 1` rows per source, in parallel** via `Promise.allSettled`. A rejection other than a `503` degrades that source to `unavailable_sources[]`; a `503` rethrows; **all** sources failing ⇒ `503 SETTINGS_HISTORY_UNAVAILABLE` | as stated |
| 6 | **Normalise each row to items** (§12.2, pure) and apply the key-level filters (§12.3) | — |
| 7 | **Merge, frontier, trim, cursor** (§10.3, pure) | — |
| 8 | **Hydrate actor names in ONE query** (§12.5) | never fails the request (§12.5) |

**It never:** write anything (`T-P3-17`), open a transaction, resolve a setting's current
value, consult a default, apply precedence, or call an owner service.

### 12.2 The four audit shapes → one item list

`settings_history_normalise.utils` exports one pure function per shape. Each takes a raw row
plus `{ auditSource, catalog }` and returns `HistoryItem[]`.

| Shape | Source rows | Normalisation |
|---|---|---|
| **A — changed-keys map** | `payroll_audit_logs` (`payroll_settings`, `statutory_config`), `document_audit_logs` (`document_settings`) | one item per key of `new_values`; `old_value = old_values?.[k] ?? null`. *`document_settings` arrives here too, and its map contains unchanged keys — rule 4 removes them.* |
| **B — two full DTOs** | `document_audit_logs` (`document_letter_branding`) | **diff key-by-key**: for each key present in either DTO, emit an item only when `!valuesEqual(old[k], new[k], data_type)`. `T-S62` |
| **C — one row per key** | `settings_change_logs` | one item, directly; `source` and `actor_role` are the **only** populated instances of those two fields |

**A caveat that belongs in the API docs, not just the code:** for `document_settings` the
recorded `new_value` is the **submitted, post-validation** value, not necessarily the stored
one (F-P2-8). For the other three it is the stored value. The reader cannot repair this
without re-reading the store at the historical instant, which is impossible. Document it;
do not paper over it.

### 12.3 The five key-level rules — in this order

| # | Rule | Reason |
|---|---|---|
| 1 | **Catalog projection.** Drop any key with no `catalog.byKey(key)` entry | removes the branding DTO's 7 non-catalog fields (`updated_at`, `logo_present`, `logo_content_type`, `logo_size_bytes`, `signature_*`) and any owner-internal column (`updated_by`) that ever reaches an audit map. This is also the **sensitive-data gate** (§15.4): a value with no catalog entry is by definition not a published setting |
| 2 | **Store consistency.** Drop any key whose `entry.store` does not match the source's store | a `payroll_settings` audit row can only legitimately carry `payroll_settings` keys; a mismatch means a mis-filed audit row, and showing it would attribute a change to the wrong group |
| 3 | **Group scope.** Drop keys outside the step-1/2/3 surviving group set | this — not the SQL — is what enforces RBAC and entitlement at key granularity, because one audit row can span several groups of the same store (e.g. one `PUT /payroll/hr/settings` touching `payroll.calendar` and `payroll.exits`) |
| 4 | **No-op drop.** Drop any item where `valuesEqual(old_value, new_value, entry.data_type)` | makes all four shapes uniform and neutralises F-P2-8 at the reader. Also why a page can be short (§10.3) |
| 5 | **Cursor tie trim.** On the row that equals the cursor's `(t, i)`, drop keys `<= cursor.k` | §10.3's `<=` predicate; prevents a duplicate item at a page boundary |

`T-S45` (fan-out: one row, three changed keys → three items) and `T-S47` (`setting_key` filter
matches a JSONB map and the per-key ledger identically) land on rules 1–5.

### 12.4 Merge and pagination

Delegated entirely to `settings_history_cursor.utils` (§10.3). The service supplies items and
the per-source "did it return `limit+1` rows" flags; the util returns
`{ items, next_cursor }`. Keeping it pure is what makes `T-S46` — "merge order across three
sources is `created_at DESC, id DESC`, and the keyset cursor is stable across a page boundary
with identical timestamps" — a unit test with no database.

### 12.5 Actor hydration

| Rule | Detail |
|---|---|
| **One query, not N** | collect the distinct non-null `actor_id`s on the trimmed page (≤ `limit`), then one `db.UserProfile.findAll({ where: { user_id: [...ids], org_id: ctx.orgId }, attributes: ['user_id','display_name','first_name','last_name'] })`. The `org_id` predicate is a tenant-isolation requirement, not an optimisation |
| **Name** | `display_name \|\| (first_name + ' ' + last_name).trim() \|\| null` — the shipped convention (`employee_salary_structure.service.js`) |
| **Unresolvable actor** | `{ id, name: null, role }`. A deleted user, or a cross-org `actor_id` that the `org_id` predicate correctly refuses to resolve, must not become a `500` and must not leak a name from another org. `T-P3-14` |
| **Role** | ledger rows → the stored `actor_role`; **all other rows → `null`** (F-P3-5). Resolving the actor's *current* role and presenting it as the role at change time would be a plausible-looking lie |
| **Failure** | a hydration error degrades to `name: null` for the whole page and logs at `warn`; it never fails the request. Names are presentation; the `actor.id` is the attribution |

### 12.6 Partial source failure (F-19)

`Promise.allSettled` across ≤ 3 sources, matching the shipped `settings_read.service` idiom:

| Outcome | Behaviour |
|---|---|
| some sources fail | `200` with `unavailable_sources: [{ table, reason: 'READ_FAILED' }]`; items from the healthy sources are returned. **History is advisory — partial is better than nothing** (parent F-19) |
| a source raises `503` / `ENTITLEMENT_DEPENDENCY_FAILURE` | rethrow unchanged. The Phase 1 rule: never degrade a dependency outage into a quieter answer |
| **all** queried sources fail | `503 SETTINGS_HISTORY_UNAVAILABLE` |
| a failing source is logged | `console.error` with `errorCode`/`name` only — **never a value, never a reason** |

**EC-P3-4 — a degraded page's `next_cursor` is computed from the healthy sources only.** The
page is therefore internally consistent but **incomplete**, and following the cursor after the
source recovers will not retroactively insert the missing rows. `unavailable_sources` being
non-empty is the client's signal that the page is partial; a client doing compliance export
must re-run the page. Stated in the change record.

### 12.7 Logging

One bracketed line per request, matching §12.5 of the Phase 2 plan:

```text
[settings] history org=<uuid> actor=<uuid> req=<id> groups=<n> sources=<n> items=<n> ms=<n> outcome=ok|4xx|5xx code=<errorCode|->
```

Never a setting value, never `reason` text, never an actor name (parent §20.2).

---

## 13. Repository / Data-Access Layer

### 13.1 `settings_change_log.repository.js`

| Method | Contract |
|---|---|
| `create(data, transaction)` | the **only** write path. `transaction` is **required** — throws without one, mirroring `payroll_audit_log.repository`'s "always call inside the same transaction as the change it records". Returns the created row |
| `findPage(orgId, filters, { limit, cursor })` | keyset read. `filters`: `settingKeys[]`, `groupKeys[]`, `actorId`, `from`, `to`, `source`. Orders `created_at DESC, id DESC`, limit `limit + 1`. Returns `{ rows, hasMore }` |

**No `update`, no `destroy`, no `upsert`, no `bulkCreate`, no `findOrCreate`.** `T-S10` asserts
the exported surface is exactly `{ create, findPage }` — the absence *is* the append-only
enforcement.

**Upserts: Not Applicable — Reason:** an append-only ledger has no update path. "Record the
same change twice" is two rows with two timestamps, which is the truth.

### 13.2 `settings_history.repository.js`

Reads the two foreign audit tables via `db.*` (D-P3-2).

```js
async findPayrollAuditPage(orgId, { entityTypes, actions, settingKeys, actorId, from, to }, { limit, cursor })
async findDocumentAuditPage(orgId, { entityTypes, actions, settingKeys, actorId, from, to }, { limit, cursor })
```

| Constraint | Detail |
|---|---|
| `where` | `org_id` **always** (tenant isolation), `entity_type IN (:entityTypes)`, `action IN (:actions)`. The `action` predicate is residual but cheap, and stops a future unrelated action on the same `entity_type` appearing as a settings change (§5.2) |
| `entity_id` | **never filtered** (F-P3-6). `(org_id, entity_type)` is a usable prefix of `payroll_audit_logs`' `(org_id, entity_type, entity_id)` and of `document_audit_logs`' `(org_id, entity_type, entity_id, created_at)`; pinning `entity_id` would need a pre-read that provisions a store row on a **read** |
| `settingKeys` | translated to a JSONB key-existence disjunction on `new_values` (`Op.or` of `sequelize.literal('new_values ? :k')` with bound parameters, **never interpolated** — the key is already regex-bounded by the validator, and binding is the rule regardless). For `document_letter_branding` the predicate always matches (the row holds a full DTO); the key-by-key diff and rule 3 do the real filtering |
| `cursor` | `created_at < :t OR (created_at = :t AND id <= :i)` (§10.3) |
| `order` | `[['created_at','DESC'], ['id','DESC']]` |
| `limit` | `limit + 1`; the caller learns `hasMore` from the extra row |
| `attributes` | explicit list, **not** `*`: `id, org_id, actor_id, entity_type, entity_id, action, old_values, new_values, reason, ip_address, request_id, created_at`. `target_user_id`, `proposed_by`, `approved_by` are irrelevant to a settings change and are not read |
| `raw` | `true` — these rows are projected immediately; model instances buy nothing |
| Transactions | **none.** Every method here is a read outside any transaction. **Not Applicable — Reason:** S-7 mutates nothing |
| Writes | **none.** This repository has no write method at all (`T-P3-17`) |

---

## 14. Validation Requirements

### 14.1 `historyQuerySchema` (added to `settings.validator.js`)

```js
const HISTORY_SOURCES = ['settings_api', 'module_api', 'system']

const historyQuerySchema = Joi.object({
  group:       Joi.string().pattern(/^[a-z0-9_.]{1,60}$/),
  setting_key: Joi.string().pattern(/^[a-z0-9_]{1,80}$/),
  actor_id:    Joi.string().uuid(),
  from:        Joi.date().iso(),
  to:          Joi.date().iso(),
  source:      Joi.string().valid(...HISTORY_SOURCES),
  limit:       Joi.number().integer().min(1).max(100).default(50),
  cursor:      Joi.string().pattern(/^[A-Za-z0-9_-]{1,300}$/)
}).unknown(false)
```

| Rule | Why |
|---|---|
| every param is a **scalar** schema | a polluted `?group=a&group=b` is an array in Express 5; a scalar schema rejects it instead of silently `[0]`-indexing (`T-P1-13`'s rule, re-applied) |
| `.unknown(false)` | an unknown query param is a `400`, never ignored. Consistent with S-1/S-3 |
| anchored, length-bounded patterns | the `setting_key` / `group` patterns make `__proto__`, `constructor` and `hasOwnProperty` unrepresentable. The `Map`-based `catalog.byKey` lookup is the real fix; the regex is defence in depth (`T-P1-14`'s rule) |
| `limit` capped at **100** | parent §7.8. A single row can fan out to 60 items, so 100 rows per source is already the practical ceiling |
| `cursor` bounded at 300 chars | the encoded payload is ~120 chars; 300 rejects a pathological input before base64 decoding |
| **no value-level validation** | **Not Applicable — Reason:** S-7 accepts no setting values. There is no patch, no body, and therefore no owner Joi schema to run (unlike Phase 2's F-P2-1) |

### 14.2 Catalog-level validation

**No new load-time invariant.** Phase 3 adds no catalog data. The invariants Phase 3 *depends
on* and that already hold: invariant 3 (one group → one store — makes group→source resolution
total), invariant 8 (no platform role in any `read_roles`), invariant 11 (no key is
`sensitive:true` — so rule 1's catalog projection is also the sensitivity gate), and
invariant 6 (`valuesEqual` accepts every entry's `data_type` — so rule 4 can never throw on a
real key).

### 14.3 Parity test (T-S2) impact

**No impact.** `T-S2` compares the catalog against the owners' Joi schemas and model columns.
Phase 3 adds no column to a settings store and no catalog entry, so the drift test is
unaffected. The new `settings_change_logs` table is **not** a settings store and is correctly
outside `T-S2`'s scope. Per the repo's standing CI rule, no catalog file under
`src/modules/settings/catalog/` needs updating for this phase — and that is a conclusion, not
an omission.

---

## 15. Authorization & Security

### 15.1 The gates, in order

| # | Gate | Where | Failure |
|---|---|---|---|
| 1 | `authenticate` | route | `401` |
| 2 | `authorize(['hr'])` | route | `403 FORBIDDEN` |
| 3 | `requireActiveOrg` | route | `403 ORG_INACTIVE` |
| 4 | per-group RBAC (`isGroupReadable`) | service step 2 | `403 FORBIDDEN` (targeted filter) / silent omission (broad query) |
| 5 | per-group entitlement | service step 3 | `403 FEATURE_NOT_AVAILABLE` (targeted) / silent omission (broad) |
| 6 | catalog projection + store consistency + group scope | normalise rules 1–3 | key dropped |

Gates 4–6 matter because **one audit row can span several groups of one store**. Filtering at
the SQL level alone would return a whole `payroll_audit_logs` row and expose keys from groups
the caller may not see. Rule 3 is the key-granular enforcement.

### 15.2 Entitlement is a security control here, not a consistency nicety

**`old_value` and `new_value` *are* setting values.** S-3 degrades a non-entitled group to
`NOT_ENTITLED` and returns none of its values. If S-7 ignored entitlement, a downgraded org
could read current `payroll_settings` values out of history — **an entitlement bypass through
a side door.** Phase 3 therefore applies the same projection as Phase 1 and Phase 2.

The counter-argument — "audit evidence should survive a plan downgrade" — is real but is a
**product** decision about entitlements, not something a history endpoint may decide
unilaterally. Recorded as **OD-P3-3**; the default is the secure one.

### 15.3 Tenant isolation

| Rule | Enforcement |
|---|---|
| `orgId` comes from `req.user.orgId` **only** | `ctx(req)`; `org_id` is not a query parameter and not a representable filter. A forged `?org_id=` is `400 VALIDATION_ERROR` by `.unknown(false)` |
| every query is `org_id`-scoped | all three repository methods put `org_id` in `where` unconditionally — including the actor-hydration query (§12.5), so a cross-org `actor_id` resolves to no name rather than another org's name |
| a cursor cannot cross orgs | the cursor carries only `(t, i, k)`; `org_id` is re-applied from the token on every page. A cursor stolen from another org repositions the caller inside **their own** history. `T-P3-7` |
| `?actor_id=` of a foreign user | returns `[]` — the rows are `org_id`-scoped, so a foreign actor matches nothing. Not a `404`: confirming or denying a user id's existence is unauthorized discovery |

### 15.4 Sensitive settings and secret handling

| Concern | Answer |
|---|---|
| sensitive catalog keys | boot invariant 11 proves **no catalog key is `sensitive:true`**. The gate is implemented anyway as normalise rule 1 |
| asset / storage keys | the branding audit row's DTO carries `logo_present` / `logo_content_type` / `logo_size_bytes` / `signature_*` and **no storage key at all** (verified: `toBrandingDto` exposes `*_present`, never `*_storage_key`). Rule 1 drops all 7 non-catalog fields regardless. `T-P3-3` |
| secrets | `attendance_devices.api_key_hash`, `PAYROLL_ENCRYPTION_KEY`, `RAZORPAY_*`, renderer credentials: none is a catalog key, none is on a settings store, none is in any queried audit `entity_type`. **Unreachable by construction** |
| `[REDACTED]` values | `payroll_audit_log.repository` redacts `account_number` / `payroll_encryption_key` substrings. **Verified no catalog key matches**, so no settings value is ever redacted. The reader passes values through verbatim and must not attempt to "repair" one (D-P3-6) |
| `reason` exposure | returned to `hr` only — which is the endpoint's only role. Never logged (§12.7) |
| logs | no value, no reason, no actor name. `errorCode`/`name` only on a failure |
| injection | Sequelize `where` for everything; the one `literal` (`new_values ? :k`) uses **bound parameters**, and the key is regex-bounded upstream. The `'null'::jsonb` literal in the recorder is a fixed constant with no interpolation |
| mass assignment | **Not Applicable — Reason:** S-7 has no request body and writes nothing. The recorder's inputs are not client-supplied: `group_key` and `registry_ref` come from the catalog, `store` is CHECK-constrained, and `source` is set by the server-side caller — a client cannot claim `source:'system'` |
| unauthorized discovery | an unknown `group`/`setting_key` is `404` — the same code S-2/S-4 already return for a name that genuinely does not exist, so the response leaks nothing new. A **known but unentitled** group is `403 FEATURE_NOT_AVAILABLE`, matching S-4 exactly |

### 15.5 Security tests

`T-P3-S1`…`T-P3-S6` in §21.3.

---

## 16. Caching & Runtime Consistency

**Phase 3 adds no cache. D-S10 / D-P3-9.**

| Brief sub-question | Answer |
|---|---|
| Cache key structure, scope-aware keys, TTL, read/write behaviour | **Not Applicable — Reason:** no cache is introduced. Parent §11.2: Phases 1–4 add none; Phase 5 is optional and gated on Q-S5 |
| Is the database authoritative? | **Yes, exclusively.** Every S-7 read goes to Postgres; the ledger is the only new store of record |
| "DB updated but cache invalidation failed" | **Cannot occur in Phase 3** — there is no cache to invalidate |
| "Cache invalidated but DB write failed" | **Cannot occur** — same reason |
| Multi-instance stale settings | **Cannot occur.** Phase 3 writes no setting value. The ledger is append-only, so there is nothing for an instance to hold stale |
| Cold cache / cache failure fallback | **Not Applicable** |
| What Phase 3 owes Phase 5 | Nothing new, with one rule: **Phase 5's cache must never be consulted by the recorder or the reader.** The recorder's `before`/`after` come from a locked row inside a transaction, and parent §11.4 already forbids a cached read inside a transaction. If Phase 5 is built, `T-S23` covers this |
| Does a settings change alter runtime behaviour across instances? | Unchanged from Phase 2: an owner write commits and every instance reads the row on its next request. Phase 3 adds one in-transaction `INSERT`, which changes nothing about propagation |
| Environment vs database configuration | Unchanged. Platform/ops config stays in env and is never in history (§5.1) |

---

## 17. Audit, Logging & Observability

### 17.1 Who writes what, after Phase 3

| Store | Audit row written by | Settings gateway writes a row? |
|---|---|---|
| `payroll_settings`, `statutory_configs` | the payroll owners → `payroll_audit_logs` | **no** |
| `document_settings`, `document_letter_branding` | the document owners → `document_audit_logs` | **no** |
| `organization_profiles` | `organization.service` → `settings_change_logs` via `settingsAudit.record` | **no** — the *owner* writes it, from inside its own transaction. The gateway only supplies the actor context |

This preserves parent §10.1's single rule: **exactly one audit row per settings change, written
by the owner.** Phase 3 does not create a second answer to "who changed this".

### 17.2 Metrics and alerts — via the existing logging path, no new dependency

| Signal | Mechanism |
|---|---|
| `settings_history_total{outcome}` | the §12.7 line's `outcome` |
| `settings_history_degraded_total{table}` | the per-source `console.error` in step 5 |
| `settings_audit_record_total{store,source}` | one `info` line per recorded key: `[settings] audit store=… key=… source=… actor=… req=…` — **key name only, never a value** |
| `settings_audit_failed_total` | an `error` line when `record()` throws. **Worth alerting on the same day**: it means a settings change was rejected because it could not be attributed (F-10), which users experience as a failing save |

### 17.3 Audit as observability

The ledger plus the two audit tables are the forensic record. S-7 is the query surface over
them. Parent §15.5's point stands: a high-risk change (#65 purge, #79 cap, #95 retention) is
detectable from history with actor, time, old value and — if OD-P3-1 is accepted — the reason.

---

## 18. Error & Failure Handling

### 18.1 Principles

1. **An owner error propagates verbatim.** Phase 3 adds no write path, so this is inherited
   unchanged from Phase 2.
2. **A read degrades; a write does not.** S-7 returns partial results with
   `unavailable_sources`. The recorder has no degraded mode — it fails the transaction.
3. **Never flatten a dependency outage into a `403`.** A `503` from entitlement or a store
   propagates as `503`.
4. **Fail loudly at the boundary, not quietly in the middle.** The recorder rejects an unknown
   key or store with an `Error` before the database sees it.

### 18.2 Scenario register

| # | Scenario | Detection | Behaviour | Recovery |
|---|---|---|---|---|
| F3-1 | **Two HR users change the same group concurrently** | `412` rate | unchanged from Phase 2: the owner's row lock serialises; the loser gets `412`. The ledger records only the winner's diff — **there is no lost audit row because there was no lost update** | client re-reads S-4 and re-submits |
| F3-2 | **The same write is retried** (client timeout) | duplicate `PUT` | `If-Match` makes the second attempt `412` if the first committed. If the first *did* commit and the client retries with a **fresh** ETag and the same values, `recordDiff` finds **no difference** and writes **no row** — the ledger is not polluted by a benign retry (§19.2) | none needed |
| F3-3 | **Recorder fails** (constraint, unknown key, DB error) | `5xx`, `settings_audit_failed_total` | inside the transaction → **the settings change rolls back**. A settings change is never applied unattributed (parent F-10) | retry; investigate. If `00073` is missing, this is the symptom — see F3-9 |
| F3-4 | **Migration 00073 not applied but Phase 3 code deployed** | every `billing.notifications` write and every S-7 call fails | the recorder's `INSERT` fails ⇒ `PUT /organizations/profile` **and** S-5 on that group return `5xx`. **This is the one deployment hazard of the phase** | apply `00073`, or revert the code. §23.3 sequences the migration first precisely to prevent it |
| F3-5 | **One audit source unreadable** | `settings_history_degraded_total` | `200` with `unavailable_sources[]`; healthy sources still answer (F-19) | transient; re-run the page (EC-P3-4) |
| F3-6 | **All audit sources unreadable** | `503` | `503 SETTINGS_HISTORY_UNAVAILABLE` | transient |
| F3-7 | **Malformed / forged cursor** | `400 INVALID_CURSOR` | rejected before any query | client restarts from page 1 (no cursor) |
| F3-8 | **A setting is deleted or disabled while a history read is in flight** | — | **Cannot happen.** Audit rows are append-only and immutable; a catalog key cannot be removed at runtime (the catalog is deep-frozen, loaded at boot). If a key is removed in a **future deploy**, normalise rule 1 drops its historical items — see EC-P3-5 |
| F3-9 | **Cross-org access attempt** | `403` / empty result | `org_id` from the token on every query, including actor hydration | the attempt is logged with actor and request id |
| F3-10 | **An audit row references a key that is no longer in the catalog** | silently fewer items | rule 1 drops it. **EC-P3-5**: history for a retired key becomes invisible, not wrong. Acceptable — and it is the same trade S-1/S-3 already make. If a key is ever retired, mark it `deprecated: true` (which keeps it in the catalog and in history) rather than deleting the entry |
| F3-11 | **An audit row's `old_values` is `null` but `new_values` has keys** | — | `old_value: null` on each item. Legitimate (the first write to a lazily created store), and distinct from "no change" | none |
| F3-12 | **An actor was deleted** | — | `actor: { id, name: null, role }`; never a `500` (`T-P3-14`) | none |
| F3-13 | **A page is entirely dropped as no-ops** | short page, non-null `next_cursor` | the frontier branch guarantees forward progress (§10.3) | client follows `next_cursor` |
| F3-14 | **`MODEL_ROOTS` edited but the model file missing** | boot error | `loadModelsFrom` throws on `require` | both land in the same commit (D-P3-4) |
| F3-15 | **Rolling deploy: old and new instances together** | — | old instances lack S-7 (`404`) and lack the recorder, so their profile writes are unaudited; new instances have both. **No instance writes a row the other cannot read** — the table is additive and nothing reads it but S-7 | §23.3 |

### 18.3 Edge cases specific to Phase 3

| ID | Edge case | Resolution |
|---|---|---|
| EC-S12 | SQL `NULL` vs JSON `null` in the ledger | §7.2.1; `'null'::jsonb` via `sequelize.literal`; `T-S49` |
| EC-P3-1 | the JSON-null path is unreachable through today's only caller | test the recorder directly with a synthetic key; say so in the test (§7.2.1) |
| EC-P3-2 | `MODEL_ROOTS` defines the model before the table exists | model definition touches no database; failure is deferred to first use (§7.5) |
| EC-P3-3 | `audit` context absent | record with `source:'system'` and null attribution, never skip the row (§9.1.2) |
| EC-P3-4 | a degraded page's cursor | the page is complete for the healthy sources only; `unavailable_sources` is the signal (§12.6) |
| EC-P3-5 | a catalog key retired in a future deploy | its history becomes invisible; prefer `deprecated: true` over deletion (F3-10) |
| EC-P3-6 | identical `created_at` across two sources | the `id DESC` tiebreak makes the order total; `T-S46` asserts stability across the page boundary |
| EC-P3-7 | one audit row fans out to more than `limit` items | the page is trimmed mid-row and `next_cursor` carries `k`, so the remainder is page 2 (§10.3) |
| EC-P3-8 | `from`/`to` with no timezone | `Joi.date().iso()` parses to a `Date`; `created_at` is `TIMESTAMPTZ`, so the comparison is unambiguous. A date-only `from=2026-10-01` means midnight UTC — document it in the API section rather than silently assuming the org's timezone |
| EC-P3-9 | `?source=settings_api` with `?group=payroll.calendar` | no ledger row can exist for a `payroll_settings` group, so the result is `[]`. Correct, and explained by caveat 1 in §10.2 |

---

## 19. Concurrency, Idempotency & Retry

### 19.1 Concurrency model

| Concern | Answer |
|---|---|
| **Two concurrent writes to `billing.notifications`** | unchanged from Phase 2 and already correct: `lockOrganizationProfileByOrgId` takes `FOR UPDATE`, `If-Match` is compared **under** the lock, and the second writer blocks until the first commits — then sees the new `updated_at` and gets `412`. The ledger therefore records one row per genuine change, in commit order |
| **Is the ledger write serialised?** | yes, transitively: it happens inside the transaction that holds the row lock, so two writers cannot interleave their ledger rows for the same org's profile |
| **Can a reader see a half-written change?** | no. The `INSERT` is in the same transaction as the `UPDATE`, so S-7 sees both or neither |
| **Two concurrent writes to different groups of the same store** | unchanged from Phase 2: the owner's lock serialises them; two audit rows result, ordered by `created_at` |
| **Append-only contention** | the ledger has no update path, so no lock contention of its own. Four `DESC` indexes are the only write cost |
| **Reader/writer contention** | S-7 reads outside any transaction and takes no lock; an in-flight write neither blocks nor is blocked by it |
| **Clock ties** | `TIMESTAMPTZ` has microsecond resolution; the `id DESC` tiebreak makes the order total even on a tie (EC-P3-6) |

### 19.2 Idempotency

| Operation | Idempotent? | Mechanism |
|---|---|---|
| S-7 `GET /settings/history` | **yes** | a safe read. Same cursor + same filters ⇒ same page, because audit rows are immutable and append-only. New rows appear only on *newer* pages, never inside an older one — which is exactly what keyset pagination buys over offset |
| `settingsAudit.record` | **not idempotent, by design** | an append-only ledger must record each call. Calling it twice for one change is a caller bug, which is why the per-key loop lives in `recordDiff` and the only production caller is one line in one method |
| A retried settings write | **effectively idempotent for the ledger** | `recordDiff` diffs stored before/after, so a retry that changes nothing writes nothing (F3-2). This is the property that makes "retry after a client timeout" safe |
| **No idempotency-key table** | — | **Not Applicable — Reason:** parent §12.3. `PUT` + mandatory `If-Match` is the idempotency mechanism for writes, and S-7 is a read |

### 19.3 Partial updates

**Not Applicable — Reason:** Phase 3 introduces no update path. The recorder writes 0, 1 or 2
rows inside the caller's transaction; "partial" is impossible because a failure rolls all of
them back with the settings change itself.

---

## 20. Implementation Sequence

Dependency-ordered. Each step names its verification. Do not reorder: 3 must precede 4, and
8 must precede 9.

| # | Step | Verify |
|---|---|---|
| 0 | **Pre-flight §2** (P-0…P-8) | baseline recorded; P-5 green or **stop** |
| 1 | Migration `00073` | DDL reviewed line-by-line against §7.2/§7.3; **two** CHECKs (F-P3-3); `down()` drops only this table. **Not run** |
| 2 | Model + `MODEL_ROOTS` | `node -e "const db=require('./src/infrastructure/postgres-sql/models.index');console.log(!!db.SettingsChangeLog)"` → `true`; full suite still green (proves no model-load regression) |
| 3 | `settings_change_log.repository` | `T-S10` — exported surface is exactly `{ create, findPage }` |
| 4 | `settings_audit.service` (`record` + `recordDiff`) | `T-S13`, `T-S49`, `T-P3-15`, `T-P3-16`, `T-P3-10` |
| 5 | Wire the recorder into `organization.service`; thread actor context in the org controller and the billing adapter (§9.1) | `T-P3-11`; **every existing organization test passes unmodified** |
| 6 | **DEF-S11 completion** in `payroll_settings.service` (§9.3) | `T-P3-12`; **every existing payroll settings test passes unmodified** |
| 7 | *(if OD-P3-1 accepted)* thread `reason` through the four owners (§9.2) | all pre-existing payroll **and** document settings tests pass unmodified |
| 8 | `settings_history_cursor.utils` + `settings_history_normalise.utils` (both pure) | `T-S45`, `T-S47`, `T-S62`, `T-P3-1`…`T-P3-8` — **no database, no stubs** |
| 9 | `settings_history.repository` | `T-P3-9` (query shape: `org_id` always, no `entity_id`, bound JSONB key predicate, `limit+1`, explicit attributes) |
| 10 | `settings_history.service` | `T-S46`, `T-S48`, `T-P3-13`, `T-P3-14`, and the security tests |
| 11 | Validator + controller + route | `T-P3-18`, the §10.4 error register |
| 12 | `module_boundary.test.js` | `T-P3-17` — the never-written `T-S1` |
| 13 | Full suite | green, including the 133 settings tests **unmodified** |
| 14 | Docs: change record, `api_registry.md` #248, `combined_api_analysis.md` | §22 |
| 15 | Hand back migration `00073` with the §23.5 checklist | the operator confirms before the code deploys |

---

## 21. Testing Strategy

Framework: `node --test` (the repo's runner; no new dev dependency). All tests are unit tests
with stubbed repositories — **no database**, per the standing constraint. §21.6 states what
that cannot cover and how it is covered instead.

### 21.1 Unit tests — pure logic

| ID | Test | File |
|---|---|---|
| `T-S45` | fan-out: one `payroll_audit_logs` row with three changed keys yields three items | `history_normalise` |
| `T-S47` | a `setting_key` filter matches a JSONB-map source and the per-key ledger **identically** | `history_normalise` |
| `T-S62` | the branding entity's two-full-DTO shape is diffed key-by-key; an unchanged key yields **no** item | `history_normalise` |
| `T-P3-1` | shape A: a key present in `new_values` but absent from `old_values` yields `old_value: null` | `history_normalise` |
| `T-P3-2` | **no-op drop**: a `document_settings` row recording an unchanged key yields **no** item (F-P2-8 neutralised) | `history_normalise` |
| `T-P3-3` | the branding DTO's 7 non-catalog fields (`updated_at`, `logo_present`, `logo_content_type`, `logo_size_bytes`, `signature_*`) are **all** dropped by rule 1 | `history_normalise` |
| `T-P3-4` | rule 2: a `payroll_settings` row carrying a `document_settings` key drops that key | `history_normalise` |
| `T-P3-5` | cursor encode → decode round-trips `(t, i, k)` including `k: null` | `history_cursor` |
| `T-P3-6` | the cursor tie-trim drops keys `<= cursor.k` on the equal row and keeps keys `>` it | `history_cursor` |
| `T-P3-7` | a cursor with a bad shape, bad base64 or unknown `v` throws `400 INVALID_CURSOR`; **a well-formed cursor carries no org and cannot cross orgs** | `history_cursor` |
| `T-P3-8` | the **frontier rule**: with one source returning `limit+1` rows, items older than the frontier are withheld; a page emptied by no-op drops still returns a **non-null** `next_cursor` (forward progress) | `history_cursor` |
| `T-P3-10` | `recordDiff` writes a row only for keys that differ by `valuesEqual`; a reordered `billing_reminder_lead_days` **is** a change; an identical array is **not** | `settings_audit_recorder` |

### 21.2 Integration-shaped tests (stubbed repositories)

| ID | Test | File |
|---|---|---|
| `T-S10` | the ledger repository exposes **only** `create` + `findPage` — no update, destroy, upsert, bulkCreate | `settings_audit_recorder` |
| `T-S13` | `settingsAudit.record` **throws** when called without a transaction | `settings_audit_recorder` |
| `T-S46` | merge order across three sources is `created_at DESC, id DESC`, and the keyset cursor is **stable across a page boundary with identical timestamps** | `history_service` |
| `T-S48` | `source` is `'settings_api'` for a gateway write to `organization_profiles`, `'module_api'` for a direct `PUT /organizations/profile`, and **`null`** for every row sourced from the two JSONB audit tables | `history_service` |
| `T-S49` | a prior SQL `NULL` is recorded as `'null'::jsonb`, not SQL `NULL` — asserted against the recorder **directly** with a synthetic key (EC-P3-1) | `settings_audit_recorder` |
| `T-P3-9` | every repository query carries `org_id`, never filters `entity_id` (F-P3-6), binds the JSONB key predicate, requests `limit+1`, and lists attributes explicitly | `history_service` |
| `T-P3-11` | with `audit` absent, the recorder is still called, with `source:'system'` and null attribution (EC-P3-3) | `settings_audit_recorder` |
| `T-P3-12` | resubmitting an identical `fnf_encashment_leave_type_codes` array produces **no** payroll audit row (F-P3-2 fixed), and S-5's `changed` agrees with it | `history_service` |
| `T-P3-13` | `?source=module_api` returns only ledger rows; the two JSONB sources are excluded by construction | `history_service` |
| `T-P3-14` | an unresolvable / cross-org `actor_id` yields `actor.name: null` and never a `500`, and never a name from another org | `history_service` |
| `T-P3-18` | the router mounts seven endpoints in the normative order with `/history` above `/groups/:groupKey`; S-7's guard stack is `authenticate → authorize(['hr']) → requireActiveOrg`; the §10.4 error register is reproduced end to end | `history_api_correctness` |

### 21.3 Security tests

| ID | Test |
|---|---|
| `T-P3-S1` | `manager`, `employee`, `admin`, `super-admin` each get `403` on S-7 — `admin`/`super-admin` have no tenant plane at all |
| `T-P3-S2` | `orgId` is taken only from the token: `?org_id=<other>` is `400 VALIDATION_ERROR`, and a body is ignored (static scan: no `req.body` in `getHistory`) |
| `T-P3-S3` | a non-entitled group's keys never appear — broad query omits them, targeted filter is `403 FEATURE_NOT_AVAILABLE` (§15.2) |
| `T-P3-S4` | no response item ever contains a `*_storage_key`, an asset column, or a non-catalog key (asserted over a crafted branding audit row) |
| `T-P3-S5` | `__proto__`, `constructor`, `hasOwnProperty` as `setting_key` / `group` → `400`/`404`, never a prototype-chain hit |
| `T-P3-S6` | a cursor minted for org A, replayed by org B, returns only org B's rows |
| **`T-P3-17`** | **the module-boundary scan (the never-written `T-S1`):** (a) no file under `src/modules/settings/` requires a foreign `*.model.js` or a foreign repository; (b) no file under `src/modules/settings/repositories/` or `services/settings_history.service.js` calls `create`/`update`/`destroy`/`upsert`/`bulkCreate` on a foreign model; (c) `settings_audit.service`'s **transitive** require closure excludes `settings/adapters/**` (D-P3-1); (d) `settings_value.utils` has **zero** imports and `settings/catalog`'s closure excludes `modules/payroll` and `modules/document` (the §9.3 reverse edge cannot cycle) |

### 21.4 Concurrency tests

No database, so the repository/service seam is stubbed to simulate interleaving — the Phase 2
approach.

| ID | Test |
|---|---|
| `T-P3-C1` | `recordDiff` is invoked with the **same transaction object** the owner is using (static assertion on the passed argument) — the atomicity guarantee |
| `T-P3-C2` | a recorder rejection propagates out of `updateOrganizationProfileFieldsLocked` and `transaction.rollback()` is called; `commit()` is **not** |
| `T-P3-C3` | the ledger row is written **after** the post-update re-read, so `new_value` is the stored value, not the submitted one |
| `T-S57`/`T-S58` (regression) | Phase 2's optimistic-concurrency tests still pass unmodified — proof the recorder did not disturb the lock/`If-Match` ordering |

### 21.5 Regression tests — the proof nothing else moved

| Claim | Proof |
|---|---|
| Phase 1 and 2 behaviour is intact | the **133 existing settings tests pass unmodified** |
| no owner behaviour changed | **every pre-existing payroll, document and organization test passes unmodified**. This is the acceptance bar for §9.1, §9.2 and §9.3 — the same bar Phase 2 used |
| `#242`–`#247` contracts unchanged | `phase1_api_correctness.test.js` and `write_service.test.js` pass untouched |
| the catalog did not move | `catalog_structure` / `catalog_drift` pass untouched; `CATALOG_VERSION` still `2026-10-09.2` (D-P3-7) |
| model loading did not regress | the full suite after step 2 of §20 |

### 21.6 What cannot be unit-tested, and how it is covered instead

`CREATE TABLE`, the two CHECKs, the four `DESC` indexes, `FOR UPDATE` behaviour under real
contention, and `'null'::jsonb` **round-tripping through Postgres** need a database. They are
covered by: (a) the migration DDL reviewed against §7.2/§7.3; (b) static assertions that the
lock option and the transaction are passed (`T-P3-C1`, `T-S58`); (c) the **operator smoke
checklist** in §23.5. **No claim of DB-level verification is made without the operator running
it.**

---

## 22. Documentation Deliverables

| Artefact | Content |
|---|---|
| `public/md_updates/2026-10-09_settings_module_history_api.md` | the change record. **Must lead with the three §10.2 caveats** (`source` and `actor.role` are null for non-ledger rows; a short page is not the end of history) and **must state the §10.4 coverage gap explicitly**: history covers the **138** singleton-backed settings, **not** the 49 per-record surfaces in leave / attendance / organization. Also: `reason` retention (whichever way OD-P3-1 lands), the F-P3-2 fix, and D-P3-5 (the other 16 org-profile columns stay unaudited) |
| `public/md_system/api_registry.md` | row **#248** for S-7, in the established column format |
| `public/md_settings/combined_api_analysis.md` | a new section for S-7 matching the depth of the #242–#247 sections |
| `public/md_settings/phases/phase3_api_analysis.md` | the per-endpoint analysis, matching `phase1_api_analysis.md` / `phase2_api_analysis.md` |
| `public/md_settings/phases/phase3_business_walkthrough.md` | the business walkthrough, matching its Phase 1/2 counterparts |
| `public/md_settings/implementation_plan.md` | append a Phase 3 amendment section at the bottom (the convention parent §0 mandates) recording F-P3-1…F-P3-7 and the §17.5 correction. **Do not rewrite the phase.** |
| `src/modules/settings/catalog/` | **no change.** §14.3 explains why the CI parity rule does not apply to this phase |

---

## 23. Migration & Deployment

### 23.1 Migration

One migration, `00073-create-settings-change-logs.js` (§7.4). **Handed back unrun.**

| Property | Value |
|---|---|
| Ordering | after `00072`; no dependency on any unrun earlier migration (it references only `organizations` and `users`, both long-established) |
| Existing data | none affected. No `UPDATE`, no `ALTER` on any existing table |
| Destructive | **no** |
| Reversible | **yes** — `down()` drops only `settings_change_logs` |
| Lock footprint | a new empty table; no lock on any existing table. Safe to apply while serving traffic |
| Idempotent re-run | not required — `sequelize-cli` tracks applied migrations |

### 23.2 Default-setting initialisation and backfill

**No seeder, no backfill, no default row. D-P3-10.**

| Question | Answer |
|---|---|
| Does any setting need a default row? | **No.** Phase 3 stores no setting values. The 138 values keep living in their own typed columns with their own model defaults |
| Should history be backfilled? | **No, and for `organization_profiles` it is impossible** — no before-state was ever recorded for past edits (that was DEF-S10). The other four stores' history already exists in their audit tables and becomes visible the moment S-7 ships |
| What does an org with no history see? | `{ items: [], next_cursor: null, unavailable_sources: [], meta: {...} }` and a `200`. **`[]`, never an error** — a parent Phase 3 completion criterion, asserted by `T-P3-18` |
| Configuration bootstrapping | **Not Applicable — Reason:** nothing to bootstrap. The ledger starts empty by design |

### 23.3 Deployment sequence

| Step | Action | Who | Reversible? |
|---|---|---|---|
| 1 | Merge the code **without deploying** | dev | yes |
| 2 | **Operator applies `00073`** and runs the §23.5 checklist | operator | yes (`down()`) |
| 3 | Operator confirms applied | operator | — |
| 4 | Deploy the code (rolling) | ops | yes (revert) |
| 5 | Smoke: `GET /settings/history` as `hr` on an org with no history → `200 { items: [] }` | ops | — |
| 6 | Smoke: a `billing.notifications` write via S-5, then `GET /settings/history?group=billing.notifications` → one item with `source:'settings_api'` | ops | — |

**Step 2 before step 4 is mandatory.** Reversing them causes F3-4: every
`billing.notifications` write — through **both** doors — fails until the table exists, because
the recorder is inside the write's transaction.

**Multi-instance / rolling-deploy window.** During the rollout, old instances serve `404` on
`/settings/history` and write no ledger row; new instances serve S-7 and record. Nothing
breaks, because the table is additive and nothing but S-7 reads it. The one visible effect is
that a profile edit landing on an old instance mid-rollout is **not** recorded — a few minutes
of gap, documented in the change record rather than engineered around (a feature flag for a
rolling window would be more machinery than the gap costs). **F3-15.**

**Schema-expectation skew:** there is none in the other direction — no instance expects a
column that another instance lacks, because Phase 3 adds no column to any existing table.

### 23.4 Rollback

| Target | Procedure |
|---|---|
| Revert the code, keep the table | **completely safe.** An unused empty table. The recorder and S-7 disappear; profile writes return to being unaudited |
| Drop the table, keep the code | **breaks writes.** The recorder's `INSERT` fails inside `updateProfile`'s transaction, so **all** organization-profile updates fail. Never do this |
| **Correct order** | **revert the code first, then optionally run `00073` `down()`** (parent §17.4) |
| Partial rollback of §9.3 (DEF-S11) | independent of the migration; revert that file alone if needed |
| Partial rollback of §9.2 (`reason`) | independent; reverting leaves `reason` null on new audit rows, and existing rows keep theirs |

### 23.5 Operator hand-back checklist — **corrects parent §17.5**

```text
1. Apply migration 00073.
2. Verify the table settings_change_logs exists with the 17 columns in §7.2,
   that created_at is TIMESTAMPTZ NOT NULL DEFAULT now(),
   and that there is NO updated_at and NO deleted_at column.
3. Verify the four indexes exist:
      idx_scl_org_created, idx_scl_org_key_created,
      idx_scl_org_group_created, idx_scl_org_actor_created
   and that each orders created_at DESC.
4. Verify CHECK scl_store_known rejects store = 'payroll_settings'.
5. Verify CHECK scl_source_known rejects source = 'ui'.
      ** CORRECTION to parent §17.5 step 5 (F-P3-3): there is NO
         "old_value IS NOT NULL AND new_value IS NOT NULL" CHECK, and there
         must not be — EC-S12 requires SQL NULL to stay representable.
         §6.2 of the parent plan is normative; its §17.5 step 5 is a drafting error. **
6. Verify both FKs: org_id -> organizations(id) ON DELETE CASCADE,
   actor_id -> users(id) ON DELETE SET NULL.
7. Insert one row with old_value = 'null'::jsonb and confirm it reads back as
   JSON null and is DISTINCT from a row with old_value = SQL NULL
   (SELECT old_value IS NULL ...). This is the EC-S12 guarantee.
8. Verify down() drops ONLY settings_change_logs (no other object disappears).
9. Confirm applied. ONLY THEN may the Phase 3 code be deployed.
```

No step in this checklist is performed from the development environment.

---

## 24. Backward Compatibility

| Surface | Status |
|---|---|
| #242 `GET /settings/catalog` | **unchanged.** `CATALOG_VERSION` is **not** bumped (D-P3-7), so every cached client ETag stays valid |
| #243 `GET /settings/catalog/:settingKey` | unchanged |
| #244 `GET /settings` | unchanged |
| #245 `GET /settings/groups/:groupKey` | unchanged |
| #246 `PUT /settings/groups/:groupKey` | **request and response unchanged.** `reason` is now forwarded to the owner (if OD-P3-1 is accepted) — a server-side behaviour change with **no** contract change |
| #247 `POST .../reset` | same as #246 |
| `PUT /organizations/profile` | **response, status codes and error codes identical.** It now takes one extra `INSERT` inside the transaction it already had. The lock and pre-read were already added in Phase 2 |
| `PUT /payroll/hr/settings` | **response unchanged.** Its audit row stops containing a phantom `fnf_encashment_leave_type_codes` entry (F-P3-2). Nothing reads that audit row programmatically today; S-7 is its first reader, which is why fixing it **now** is cheaper than after a client depends on the wrong data |
| `PUT /documents/hr/settings`, `PUT /documents/hr/letter-branding` | unchanged; audit rows gain a `reason` only if OD-P3-1 is accepted |
| Existing audit tables | **no schema change, no data migration, no row rewritten** |
| Existing database objects | **none altered.** One table added |
| New npm dependency | **none** |
| New cron job | **none** |
| New event / message bus | **none** (parent D-S8) |
| Forward compatibility | widening the ledger to a second store is a one-line CHECK migration plus one `record()` call per write path. No reader change is needed: the reader is driven by `auditSource` metadata, not a hard-coded table list |

---

## 25. Feature Traceability Matrix

| Requirement | Source | Database | API | Business logic | Validation | Authorization | Cache/runtime | Failure | Test | AC |
|---|---|---|---|---|---|---|---|---|---|---|
| **FR-5** unified change history (key, old, new, actor, time, reason) | parent §2.6 | §7.2 ledger; two existing audit tables read-only | S-7 #248 | §12.1–§12.5 | §14.1 | §15.1 gates 1–6 | none (§16) | F3-5/6/7 | `T-S45`–`T-S49`, `T-S62`, `T-P3-1`…`T-P3-9`, `T-P3-13` | AC-P3-5…10 |
| `organization_profiles` becomes auditable (DEF-S6 partial, EC-P2-1 closed) | DEF-S1, §10.1 row 5 | §7.2 | — (owner-side) | §8, §9.1 | §8.2 rules 3–5 | server-set `source`; no client input | none | F3-3/4 | `T-S13`, `T-S49`, `T-P3-10`, `T-P3-11`, `T-P3-15`, `T-P3-16`, `T-P3-C1`…`C3` | AC-P3-2…4 |
| Append-only ledger, no rewrite path | §6.2 | no `updated_at`/`deleted_at`; two CHECKs | — | §13.1 | — | — | — | — | `T-S10` | AC-P3-1 |
| Attribution: actor, role, ip, request id, source | §10.2 | 5 columns | item `actor`/`source`/`request_id` | §9.1.3, §12.5 | — | §15.3 | — | F3-12 | `T-S48`, `T-P3-14` | AC-P3-8 |
| `reason` persisted (FR-10's other half) | §10.2, OD-P2-2 | `reason TEXT` | item `reason` | §9.2 | `reason` ≤ 500 (shipped) | `hr` only | — | — | pre-existing owner tests unmodified | AC-P3-13, **OD-P3-1** |
| Tenant isolation | §9.2 | `org_id` on the ledger; `org_id` in every `where` | `orgId` from token only | §15.3 | `.unknown(false)` | §15.3 | — | F3-9 | `T-P3-S2`, `T-P3-S6` | AC-P3-11 |
| No sensitive value exposed | §9.4 | — | — | normalise rule 1 | — | §15.4 | — | — | `T-P3-S4` | AC-P3-12 |
| Keyset pagination that survives growth | §7.8 | four `DESC` indexes | `cursor` / `next_cursor` | §10.3 | cursor regex | — | — | F3-7, F3-13 | `T-S46`, `T-P3-5`…`T-P3-8` | AC-P3-7 |
| Partial source failure is advisory, not fatal | F-19 | — | `unavailable_sources[]` in the `200` | §12.6 | — | — | — | F3-5/6 | `T-P3-9` | AC-P3-9 |
| DEF-S11 completed | §20.1 | — | — | §9.3 | — | — | — | — | `T-P3-12` | AC-P3-14 |
| §10.4 coverage gap disclosed | §10.4 | — | — | §5.4 | — | — | — | — | doc review | AC-P3-16 |
| No duplicate audit row | §10.1 | `store` CHECK | — | §17.1 | §8.2 rule 5 | — | — | — | `T-P3-16` | AC-P3-15 |

---

## 26. Phase 3 Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-P3-1 | `settings_change_logs` is append-only: no `updated_at`, no `deleted_at`, and the repository exports exactly `{ create, findPage }` (`T-S10`) |
| AC-P3-2 | `settingsAudit.record` **throws** without a transaction (`T-S13`) and never opens one |
| AC-P3-3 | A write to `billing.notifications` through **either** door produces one ledger row **per changed key**, with the correct `source` (`T-S48`) |
| AC-P3-4 | A recorder failure **rolls back** the settings change; `commit()` is not reached (`T-P3-C2`) |
| AC-P3-5 | Fan-out: one audit row with three changed keys yields three history items (`T-S45`) |
| AC-P3-6 | The branding entity's two-full-DTO shape is diffed key-by-key and its 7 non-catalog fields never appear (`T-S62`, `T-P3-3`) |
| AC-P3-7 | Merge order is `created_at DESC, id DESC` and the keyset cursor is stable across a page boundary with identical timestamps (`T-S46`); a page emptied by no-op drops still returns a non-null `next_cursor` (`T-P3-8`) |
| AC-P3-8 | `source` is `'settings_api'` / `'module_api'` for ledger rows and **`null`** for every row from the two JSONB audit tables; `actor.role` follows the same rule (`T-S48`, F-P3-5) |
| AC-P3-9 | One failing source degrades to `200` + `unavailable_sources[]`; **all** failing is `503 SETTINGS_HISTORY_UNAVAILABLE`; a `503` is never flattened to `403` |
| AC-P3-10 | `GET /settings/history` on an org with no history returns **`200 { items: [] }`**, not an error (parent completion criterion (c)) |
| AC-P3-11 | `orgId` comes only from the token; a forged `?org_id=` is `400`; a cursor minted by another org returns only the caller's rows (`T-P3-S2`, `T-P3-S6`) |
| AC-P3-12 | No response item contains a non-catalog key, an asset column or a storage key, for any role (`T-P3-S4`) |
| AC-P3-13 | **Every pre-existing payroll, document, organization and settings test passes unmodified** — the proof no owner behaviour was altered |
| AC-P3-14 | **DEF-S11 is complete**: no `!==` diff remains on a catalog key in `payroll_settings.service`, and S-5's `changed` agrees with S-7's items for `fnf_encashment_leave_type_codes` (`T-P3-12`) |
| AC-P3-15 | No store with its own audit table ever gets a ledger row — enforced in code before the CHECK (`T-P3-16`) |
| AC-P3-16 | The change record **explicitly states** the §10.4 coverage gap (138 singleton keys covered; the 49 per-record surfaces are not) and that `source`/`actor.role` are populated only for ledger rows |
| AC-P3-17 | `migration 00073` is reviewed against §7.2/§7.3 and **handed back unrun** with the §23.5 checklist; no `db:migrate` and no connectivity check was run |
| AC-P3-18 | `modules/settings/models` is in `MODEL_ROOTS` and `db.SettingsChangeLog` resolves; the full suite is green after the edit |
| AC-P3-19 | `T-P3-17` passes: no foreign-model require, no foreign write, the recorder's closure excludes the adapters, and the §9.3 reverse edge cannot cycle |
| AC-P3-20 | `api_registry.md` row #248 and the `combined_api_analysis.md` section are written; `CATALOG_VERSION` is unchanged |

---

## 27. Production Readiness Checklist

**Correctness**
- [ ] All four audit shapes normalise to one item list (`T-S45`, `T-S62`, `T-P3-1`…`T-P3-4`)
- [ ] No-op items are dropped, so `document_settings`' record-everything behaviour is invisible to clients
- [ ] Every diff in this phase uses `valuesEqual`; **no `!==` on a catalog key anywhere**, including the payroll owner (AC-P3-14)
- [ ] `old_value: null` (first write) is distinguishable from "no change" (dropped)
- [ ] `registry_ref` and `group` on every item come from the catalog, never from a caller

**Data integrity**
- [ ] Ledger is append-only in schema **and** in the repository surface
- [ ] Two CHECKs, four indexes, two FKs — reviewed against §7.2/§7.3
- [ ] `store` CHECK is narrow, so a double-write fails loudly
- [ ] `'null'::jsonb` vs SQL `NULL` is representable and tested (`T-S49`), with EC-P3-1 disclosed
- [ ] No existing table, column, type, constraint or index is changed

**Security**
- [ ] `hr` only; `manager`/`employee`/`admin`/`super-admin` all `403` (`T-P3-S1`)
- [ ] Per-group RBAC **and** entitlement projected at key granularity (§15.2)
- [ ] `org_id` in every query including actor hydration
- [ ] No secret, storage key, asset column or non-catalog key in any response (`T-P3-S4`)
- [ ] No value and no `reason` text in any log line
- [ ] JSONB key predicate is **bound**, never interpolated
- [ ] Cursor carries no secret and cannot cross orgs (`T-P3-S6`)
- [ ] No request body, so no mass-assignment surface

**Concurrency & reliability**
- [ ] The recorder runs on the **caller's** transaction (`T-P3-C1`) and never opens one
- [ ] A recorder failure rolls the change back (`T-P3-C2`)
- [ ] A benign retry writes no ledger row (F3-2)
- [ ] Phase 2's `T-S57`/`T-S58` concurrency tests pass unmodified
- [ ] S-7 takes no lock and no transaction

**Operability**
- [ ] One `info` line per recorded key; one line per history request; an `error` line on a recorder failure
- [ ] `settings_audit_failed_total` is the one signal worth same-day alerting
- [ ] Migration handed back unrun with the §23.5 checklist (AC-P3-17)
- [ ] Deployment sequenced migration-**then**-code; F3-4 understood
- [ ] Rollback order documented: **code first, table second**

**Process**
- [ ] `db:migrate` / `db:seed` / connectivity **never** run from the development environment
- [ ] No new npm dependency, no cron job, no event bus
- [ ] One dated change record in `public/md_updates`
- [ ] Parent plan amended with F-P3-1…F-P3-7 and the §17.5 correction
- [ ] No catalog file changed; §14.3 explains why the CI parity rule does not apply

---

## 28. Risks, Open Decisions & Phase 4 Entry

### 28.1 Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-P3-1 | **Code deployed before `00073` is applied** → every `billing.notifications` write fails through both doors, because the recorder is inside the write's transaction | **high** | §23.3 step order; the §23.5 checklist ends with "ONLY THEN may the code be deployed"; F3-4 names the symptom so an on-call engineer recognises it in seconds |
| R-P3-2 | **The reader is written against parent §10.1's summary instead of the verified shapes** → `document_settings` history full of no-ops, branding history full of `updated_at` churn | **high** | §5.2 is the verified map; `T-P3-2` and `T-P3-3` fail if the reader trusts the summary. This is Phase 2 §28.3(3)'s entry criterion made executable |
| R-P3-3 | **The recorder is wired in the wrong place** (adapter or `updateProfile`) → a second transaction, so audit is no longer atomic with the change | **high** | F-P3-1 explains why; `T-P3-C1` asserts the transaction identity |
| R-P3-4 | **Entitlement is skipped on S-7**, turning history into a read-path bypass for setting values | **high** | §15.2 states it as a security control; `T-P3-S3` |
| R-P3-5 | The reverse edge `organization → settings` grows into a cycle when someone adds a require to the recorder | medium | D-P3-1 + `T-P3-17(c)` fails CI |
| R-P3-6 | Cursor pagination silently loses or duplicates items at a boundary | medium | the frontier rule (§10.3) is specified, not left to the implementer; `T-S46`, `T-P3-6`, `T-P3-8` |
| R-P3-7 | A client treats a short page as end-of-history | medium | `next_cursor === null` is documented as the **only** terminator, in §10.2, the change record and the API analysis |
| R-P3-8 | `?setting_key=` scans `payroll_audit_logs` without a GIN index | low | bounded by `(org_id, entity_type)`; parent §7.8 accepts it; revisit past ~50k settings changes per org |
| R-P3-9 | The ledger grows unbounded | low | 1 row per changed key, ≤ 2 keys on the only store; a few rows per org per year. Q-S8 default: keep forever |
| R-P3-10 | Threading `reason` changes a shipped audit payload and breaks an owner test | low | AC-P3-13 makes "all pre-existing tests pass unmodified" the gate; and §9.2 is independently revertible |

### 28.2 Open decisions

| ID | Decision | Blocks | Recommendation / default |
|---|---|---|---|
| **OD-P3-1** | Thread `reason` into the four audited owners' audit rows (parent OD-P2-2, still open)? | §9.2 and §20 step 7 **only** | **Accept.** The gate is close to pointless if the answer is discarded; the column exists and is nullable; it is one line per owner. **If declined**, the change record must state that a high-risk settings reason is collected and not retained. Either way the S-7 contract is unchanged (`reason` is nullable) |
| OD-P3-2 | Relocate `valuesEqual` to `src/common/utilities/` to remove the `payroll → settings` edge created by §9.3 | nothing | **Defer.** Moving a Phase-1 file that five shipped files import, in the same commit as a migration, buys nothing today. Revisit if a third module needs the comparator |
| OD-P3-3 | Should settings history survive a subscription downgrade (i.e. **not** be entitlement-projected)? | nothing in Phase 3 | **Default: project it** (§15.2). Exposing values of a non-entitled module through history is a bypass; "audit evidence survives a downgrade" is a product decision about entitlements, not one a history endpoint may make unilaterally |
| OD-P3-4 | Expose the owner's `action` string on a history item | nothing | **No.** Parent §7.8's shape omits it; adding it invites clients to depend on the owners' audit vocabulary (parent §7.8 rejects the same idea for `source`) |
| Q-S2 (parent) | `settings_change_logs` vs a generic `organization_audit_logs` | the table name and CHECK | **Default stands:** build it narrow and purpose-built |
| Q-S8 (parent) | Ledger retention | nothing in Phase 3 | **Default stands:** keep forever |

### 28.3 Phase 4 entry criteria

Phase 4 (surfaces index S-8, readiness S-9 — **no migration**) may start when:

1. All of §26's acceptance criteria are green and Phase 3 is deployed.
2. Phase 4 is understood to be **independent of Phase 3** (parent R-S6): it needs only Phase 1's
   catalog and entitlement projection, so a delay in the operator applying `00073` does not
   block it.
3. The implementer knows the `SURFACES` catalog data (**49 entries**) is **already shipped**
   from Phase 1 and must be consumed, not re-authored.
4. `T-S53` (every surface `endpoint` string matches a route the owning module actually
   registers) is understood as the test that keeps the index from rotting — it is a static scan
   over the route files, not a runtime probe.
5. `T-S11` (no readiness probe performs a write) will reuse the `T-P3-17` scanner built in this
   phase rather than writing a second one.

---

## 29. Final Validation Pass

The brief requires 22 checks. Each is answered with where it is discharged — and where the
answer is "no" or "not applicable", that is stated.

| # | Check | Result |
|---|---|---|
| 1 | Every Phase 3 requirement from the parent is covered | **Yes.** Parent §16's Phase 3 scope row maps to §1.2 items 1–12; its five completion criteria map to AC-P3-10, AC-P3-17, AC-P3-6/AC-P3-8, AC-P3-16, AC-P3-20; §6.2 → §7.2; §7.8 → §10.2; §10.2 → §8; §14.4's seven tests all appear in §21 |
| 2 | Actual Phase 1 / Phase 2 status verified against their plans | **Yes, file by file — §3**, with the 133-test baseline **executed**. Seven findings recorded (F-P3-1…F-P3-7), two of which (F-P3-1, F-P3-2) change the design. Nothing planned is treated as completed on the strength of a plan |
| 3 | No unsupported feature invented | **Yes.** One endpoint (parent §7.1), one table (parent §6.2), one recorder (parent §10.2). Everything else is a **correction** or a necessary mechanism (the cursor, the normaliser) with no repo precedent to reuse |
| 4 | Existing functionality reused | **Yes — §4.1**, 15 components, including the `auditSource` metadata **already shipped on all five adapters**, which is why the reader needs no hard-coded table list. Two new utils, each justified in §4.2 against the thing it could not reuse |
| 5 | Ownership and scope boundaries clear | **Yes.** §5.2's verified audit map, §5.3's one-line membership rule, D-P3-5's "settings keys only, not org master data" |
| 6 | Database constraints and relationships verified | **Yes — §7.2/§7.3**: 17 columns, two FKs with explicit `ON DELETE`, two CHECKs (not three — F-P3-3), four `DESC` indexes, and the reasons for the absent FK on `entity_id` and the absent `id` in the indexes |
| 7 | API contracts defined | **Yes — §10.2** with the full query table, the exact item shape, three caveats, and §10.4's complete 13-row error register |
| 8 | Authorization boundaries | **Yes — §15.1's** six ordered gates, and §15.2's finding that **entitlement is a security control here**, not a consistency nicety |
| 9 | Tenant isolation | **Yes — §15.3.** `orgId` only from the token, `org_id` in every query including actor hydration, and a cursor that cannot cross orgs |
| 10 | Sensitive-setting handling | **Yes — §15.4.** The sensitive set is **provably empty** (boot invariant 11); the gate is implemented anyway as normalise rule 1; storage keys verified absent from the branding DTO; the `[REDACTED]` interaction verified as unreachable |
| 11 | Concurrency | **Yes — §19.1**, including why the ledger write is transitively serialised by the owner's existing row lock, and why no new lock is needed |
| 12 | Idempotency and retry | **Yes — §19.2.** S-7 is a safe read; the recorder is deliberately **not** idempotent; a retried write writes no ledger row because the diff is against stored state |
| 13 | Cache / runtime consistency | **Yes, as a reasoned "no cache" — §16**, with every brief sub-question answered, including why both cache-skew failure modes are **impossible** in this phase and the one rule Phase 3 owes Phase 5 |
| 14 | Auditability | **Yes, and this phase *is* the auditability work.** §17.1 keeps the one-row-per-change rule; §5.4 states the coverage honestly (138 of 138 singleton keys, 0 of 49 per-record surfaces); AC-P3-16 makes the gap a deliverable, not a footnote |
| 15 | Failure and recovery | **Yes — §18.2's** 15 scenarios and §18.3's 9 edge cases, including F3-4 (the one real deployment hazard) and the two cases where recovery is "revert the code first" |
| 16 | Testing coverage | **Yes — §21.** Five categories, ~40 named tests, every AC backed by one. §21.6 states plainly what a unit test **cannot** prove and hands it to the operator checklist |
| 17 | Migration and deployment safety | **Yes — §23.** Non-destructive, reversible, no lock on an existing table, no backfill, sequenced migration-then-code, rolling-window gap disclosed rather than engineered around |
| 18 | Dependencies on other modules | **Yes — §4.3.** The **one sanctioned reverse edge** (`organization → settings`) plus the **second** one §9.3 creates (`payroll → settings/utils`, `payroll → settings/catalog`), each with its cycle argument and a CI guard (`T-P3-17`) |
| 19 | No future-phase work, no reimplementation of Phases 1–2 | **Yes — §1.3.** No surfaces endpoint, no readiness probe, no cache, no catalog change, no `CATALOG_VERSION` bump. Phase 1's catalog, comparator, projection and entitlement service are **consumed, never rewritten** |
| 20 | No duplicate settings mechanism | **Yes.** No settings-value table; the ledger stores **change events**, never current values. No second comparator, no second audit row per change (the `store` CHECK enforces it), no second write door |
| 21 | Backward compatibility with Phases 1–2 | **Yes — §24.** #242–#247 byte-identical; `CATALOG_VERSION` unchanged so client ETags survive; the only observable change to an existing endpoint is the **removal of a phantom audit entry** nothing reads yet |
| 22 | Production-readiness architecture review | **Yes — §27**, plus three honest statements: **F-P3-1 is the finding that decides the design** (the recorder must live inside `…FieldsLocked`); **F-P3-2 is the real defect** (Phase 2's DEF-S11 claim is not true, and shipping S-7 on top of it would put two endpoints in production disagreeing about one write); and **R-P3-1 is the real hazard** — deploying before the operator applies `00073` breaks organization-profile updates through *both* doors |

### 29.1 What this plan does **not** claim

* **No code has been written.** Every `★`/`▲` in §6.3 is an instruction.
* **No test has been run** as part of authoring this plan, **except** the Phase 1/2 baseline
  (`node --test "tests/unit/settings/*.test.js"` → 133 pass / 0 fail). Every `T-S…` / `T-P3-…`
  is **specified**, not executed. Pre-flight **P-0** exists because the implementer's
  baseline, not this document's, is the one that matters.
* **No database was touched** — no `db:migrate`, no `db:migrate:status`, no connectivity
  check. Migration `00073` is handed back unrun, and §21.6 is explicit that locking, CHECK
  behaviour, index direction and `'null'::jsonb` round-tripping are **unverified** until the
  operator runs §23.5.
* **What *was* verified on 2026-10-09, by reading the shipped source and executing Node in
  this repository:** the catalog's shipped shape (138 entries / 26 groups / 49 surfaces /
  `CATALOG_VERSION 2026-10-09.2`) and its per-store key counts; the exact set of 6
  `jsonb`/`array` keys; that `auditSource` is already present on all five adapters; the four
  owners' audit payload shapes, read line by line; that `valuesEqual` appears **nowhere**
  outside `src/modules/settings/` and that `payroll_settings.service` still uses `!==`
  (F-P3-2); that `updateOrganizationProfileFieldsLocked` exists, locks, and returns
  `{ before, row }` (DEF-S10, the Phase 3 blocker, is cleared); that both audit tables lack a
  `source` **and** an `actor_role` column (F-P3-5); that `toBrandingDto` exposes `*_present`
  and never a `*_storage_key`; that `payroll_audit_log.repository`'s redaction deny-list
  matches no catalog key; that the organization controller threads no ip / request-id
  (F-P3-4); that no keyset-cursor convention exists anywhere in `src/`; that `00072` is the
  last migration and `#247` the last endpoint id; and that `T-S1` was never implemented
  (F-P3-7).
* **What this plan deliberately leaves undecided:** OD-P3-1 (`reason` threading) is a
  decision for review, not for the implementer; §9.2 and §20 step 7 are independently
  revertible so the rest of the phase does not wait on it.
