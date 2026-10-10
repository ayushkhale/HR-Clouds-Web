# Settings Module — Phase 2 Implementation Plan

**The write plane.** S-5 `PUT /settings/groups/:groupKey` and S-6
`POST /settings/groups/:groupKey/reset`, delegating every write to the owning
module's existing service, with optimistic concurrency (`If-Match`), a
mass-assignment allowlist, and a confirmation gate for high-risk keys.

| | |
|---|---|
| **Authored** | 2026-10-09 |
| **Parent (source of truth)** | `public/md_settings/implementation_plan.md` — §7.6, §7.7, §8, §9, §12, §14.3, §16 (Phase 2), §20.1 |
| **Predecessor** | `public/md_settings/phases/phase1_implementation_plan.md` — **implemented, tested, green** (48 assertions; full suite 3203 pass / 0 fail) |
| **Migration** | **none** |
| **New endpoints** | 2 (registry **#246**, **#247**) |
| **New tables / models / seeders / env vars** | **none** |
| **Existing files modified** | 1 settings route file + 1 controller + 1 validator + 5 adapters (all inside `src/modules/settings/`), plus **5 owner services, 1 owner repository, 1 owner route** outside the module — enumerated and justified in §13 |

---

## 0. How to read this document

* **Verified** means the statement was checked against the shipped source or executed
  in this repository on 2026-10-09. **Specified** means it is a design instruction for
  the implementer. Nothing below is reported as verified unless it actually was.
* Identifiers: `D-P2-n` decisions, `F-P2-n` findings against the parent plan or Phase 1,
  `R-P2-n` risks, `OD-P2-n` open decisions, `AC-P2-n` acceptance criteria.
  `DEF-Sn` / `T-Sn` / `EC-Sn` are the parent plan's own identifiers, reused unchanged.
* Where a brief topic does not apply, it is answered **"Not Applicable — Reason: …"**
  rather than omitted.
* **No `db:migrate`, no `db:migrate:status`, no database connectivity check is
  performed by this plan or by its implementation.** Phase 2 needs no migration, so
  there is nothing to hand back.

---

## 1. Goal & Boundary

### 1.1 Objective

Let `hr` change any writable setting through one gateway surface, with the owning
module's guards, validators and audit trail **fully intact and unmodified in
behaviour**, plus three gateway-level controls that the module's own doors do not
have: a mass-assignment allowlist, an optimistic-concurrency precondition, and a
confirmation requirement on high-risk keys.

### 1.2 In scope

| # | Item | Why it is Phase 2 |
|---|---|---|
| 1 | **S-5** `PUT /api/v1/settings/groups/:groupKey` (#246) | parent §7.6 |
| 2 | **S-6** `POST /api/v1/settings/groups/:groupKey/reset` (#247) | parent §7.7 |
| 3 | `adapter.update()` on all **five** adapters | parent §4.13; the only place a store is written |
| 4 | The **intersection allowlist** — catalog keys of the group ∩ adapter `ownerWritableKeys()` | parent §9.3; mass-assignment closed by construction |
| 5 | **`If-Match`** required; verified **under the owner's row lock** | parent §12.2 |
| 6 | **`risk: 'high'` confirmation gate** (`confirm` + `reason`) | parent §9.5 gate 5 |
| 7 | **Owner-schema validation at the gateway** — **F-P2-1**, the central correction in this plan | §7 below |
| 8 | **DEF-S7** — locked read before the diff in `payroll_settings.service.update` | parent §12.1 |
| 9 | **DEF-S10** — locked pre-read + before-state in the organization profile update | parent §12.1; **Phase 3 blocker** |
| 10 | **DEF-S8** — reconciled, not applied as written (**F-P2-3**) | §13.6 |
| 11 | **DEF-S12** — `changed` built from the re-read row, never the submitted patch | parent §8.6 |
| 12 | **Catalog data completion** — risk reclassification, `warnings`, `conflicts_with`, `depends_on`; `catalog_version` bump | §15; gate **P2-GATE-1** |
| 13 | Documentation: dated change record, `api_registry.md` #246/#247, `combined_api_analysis.md` S-5/S-6 sections | parent §7.11, §7.12 |

### 1.3 Explicitly **not** in scope

| Item | Where it belongs | Reason |
|---|---|---|
| `settings_change_logs` table, model, repository, migration `00073`, `settingsAudit.record`, S-7 `GET /settings/history` | **Phase 3** | DB-gated. Phase 2 must not create a model or add `modules/settings/models` to `MODEL_ROOTS`. |
| S-8 `GET /settings/surfaces`, S-9 `GET /settings/readiness`, precondition **probes** | **Phase 4** | `catalog/preconditions.js` stays an id registry; Phase 2 evaluates no precondition. |
| Any cache | **Phase 5** (gated on Q-S5) | parent §11.2. Phase 2 remains cache-free; adding a cache in the same phase as the first write would make any regression ambiguous. |
| Multi-group / cross-store write in one request | **nowhere** | D-S4. One request → one group → one store → one transaction. |
| Writes to the 49 **surfaces** (per-record settings) | the owning modules | D-S5. The gateway links, never proxies. |
| Writing any `sensitive` key, asset column, storage key, or cron watermark | **nowhere** | parent §9.3/§9.4; closed by the allowlist by construction (§9.3 below). |
| A rollback endpoint, approval workflow, effective dating, event bus | **nowhere** | parent §10.3, §13.1. |
| Idempotency-key table/header | **nowhere** | parent §12.3. `PUT` + `If-Match` is the idempotency mechanism; see §19.2. |
| Rate limiting S-5/S-6 | **nowhere in Phase 2** | **OD-P2-4**. No write endpoint in this codebase is rate-limited except the two asset-issuance handshakes. |
| Deprecating the owners' own settings endpoints | **nowhere** | Q-S3. Both doors stay. |

### 1.4 Corrections to the parent plan, carried as findings

Each is **verified** against the shipped source. None is absorbed silently.

| ID | Parent says | Verified reality | Consequence for Phase 2 |
|---|---|---|---|
| **F-P2-1** | §8.1: "**Owner validator** — per-key type, range, enum, length, array shape — **the enforcement boundary** — the domain module's Joi schema", reached by delegating to the owner's service (§4.5). | **No owner service applies a Joi schema.** None of the five requires `joi` or any validator module. All five schemas are applied at the **route or controller** layer: payroll/statutory by `validate(schema)` route middleware (`payroll_hr.routes.js:59,161`); document settings by `validateOrThrow` in `document_hr.controller.js:305`; branding by the controller for `replaceBrandingSchema`; the org profile by `organization.controller.js:33`. **Delegating to the service therefore bypasses Joi entirely for every one of the five stores.** | **The gateway must run the owner's own exported schema itself**, before delegating. §7. This is the largest single piece of Phase 2 work the parent plan does not describe. |
| **F-P2-2** | §9.5 gate 2: entitlement is checked "and again inside the owner's own `requireFeature`". | `requireFeature` is **route middleware** (`src/common/middlewares/require_feature.middleware.js`), never called from a service. | The gateway's per-group entitlement check is the **only** entitlement gate on the gateway door. It must therefore be unconditional and must precede the write. §14.2. |
| **F-P2-3** | §16 / §20.1: "fix **DEF-S8** — attach the existing `updateSettingsSchema` to `PUT /documents/hr/settings` via `validate()`"; §17.3 predicts a **new `422`** for typo'd keys. | The document controller **already** calls `validateOrThrow(schemas.updateSettingsSchema, req.body)`. And the shared `validateOrThrow` runs with `stripUnknown: true`, so an unknown key is **dropped, never rejected** — attaching the same schema as route middleware would change **nothing**, and would **not** produce the predicted `422`. | DEF-S8 is reduced to a **convention alignment** (move validation to the route, matching payroll) with **zero behaviour change**, and the parent's §17.3 "one behaviour change to be honest about" is **withdrawn**. §13.6. |
| **F-P2-4** | §16 Phase 2: "extend the **four** mutable owner services to accept and verify an optional `ifMatch`". | There are **five** writable stores (DEF-S12 added `document_letter_branding`). | Five owner services gain `ifMatch`. §13. |
| **F-P2-5** | §8.7 classifies **9** keys as `risk: 'high'` (#29, #39, #40, #59, #60, #65, #79, #92, #95). | The shipped catalog has **exactly one** high-risk key: `letter_record_retention_days` (#95). #29 is a surface (correctly absent). The other **seven** shipped as `medium`, with `requires_reason: false`. Only **two** entries carry any `warnings[]` (#95, #79). | The confirmation gate would guard 1 key instead of 8 and would be near-dead code. **P2-GATE-1** (§15) resolves the classification *before* S-5 ships. |
| **F-P2-6** | §8.6 publishes cross-setting relationships through `conflicts_with` / `depends_on` / `depends_on_ops`. | **Verified empty:** no catalog entry has a `conflicts_with` and none has a `depends_on`. Exactly one has `depends_on_ops` (`pdf_bulk_inline_miss_threshold` → `PDF_BULK_GENERATION_ENABLED`). `document_require_separate_checker` lists `SETTINGS_CONFLICT` in `known_errors` but does not name its conflicting key. | Phase 2 populates the relationships §8.6 names (catalog **data** only). Without them a UI cannot pre-empt the owner's `409 SETTINGS_CONFLICT`. §15.3. |
| **F-P2-7** | §7.6 error register uses `SETTINGS_GROUP_NOT_FOUND`. | Phase 1 shipped **`GROUP_NOT_FOUND`** on S-4 and S-1. | Phase 2 uses **`GROUP_NOT_FOUND`**. Two codes for one condition across sibling endpoints would be a worse contract than one deviation from the parent's draft. |
| **F-P2-8** | §10.1: the four audited owners write "`old_values`/`new_values` JSONB maps of **changed keys only**". | True for `payroll_settings` and `statutory_configs`. **False for `document_settings`** (`document_settings.service.js:274–277` records **every submitted key**, changed or not) and **false for `document_letter_branding`** (two full DTOs — the parent does acknowledge this one in §10.1). | No Phase 2 change. The gateway's `changed` / `unchanged_keys` is computed independently of the audit row, so the two may legitimately disagree for `document_settings`. Recorded here so Phase 3's reader is not written on a false premise. |
| **F-P2-9** | §7.4: if **every** group fails, S-3 returns `503 SETTINGS_READ_UNAVAILABLE`. | Phase 1 shipped no such branch: all-stores-failing returns `200` with every group in `unavailable_groups` as `READ_FAILED`. | **Not a Phase 2 concern** — S-3 is not touched. Recorded so it is not mistaken for a Phase 2 regression. Raised as **OD-P2-5**. |

---

## 2. Pre-Flight Checks — before writing any code

Run these in order. Each has a pass condition. Do not start Step 1 of §20 until all pass.

| # | Check | Command / method | Pass condition |
|---|---|---|---|
| **P-0** | **Baseline the suite.** | `npm test` | Record the pass/fail counts. The 2026-10-09 figure was **3203 pass / 0 fail**. Every later step is measured against *your* baseline, not this number. |
| **P-1** | Phase 1 is present and intact. | `git status`; `ls src/modules/settings` | 27 files under `src/modules/settings/`; `src/app.js` carries the single mount line. |
| **P-2** | The five owner write methods still have the signatures §13 assumes. | read each | `payrollSettingsService.update(orgId, patch, actor)`; `statutoryConfigService.updateConfig(orgId, patch, actor)`; `documentSettingsService.update(orgId, payload, {actorId, ipAddress, requestId})`; `letterBrandingService.replace(orgId, {actorId, payload, ipAddress, requestId})`; `organizationService.updateOrganizationProfile(actorUser, payload)`. |
| **P-3** | The five owner Joi schemas are still exported under the names §7.2 imports. | require them | `payrollHrValidator.updateSettingsSchema` (63 keys), `.updateStatutoryConfigSchema` (25), `documentHrValidator.updateSettingsSchema`, `documentLetterValidator.replaceBrandingSchema`, `organizationValidator.fieldValidation_UpdateOrganizationProfile` (18). |
| **P-4** | **`noDefaults` still neutralises the one Joi default.** | `replaceBrandingSchema.validate({letterhead_enabled:true},{noDefaults:true})` | the result has **no** `registered_address_lines` key. (Verified on Joi 18.2.3; `registered_address_lines` is the **only** key with a `.default()` across all five schemas.) |
| **P-5** | `T-S2` still green (catalog ↔ owner parity) before you edit the catalog. | `node --test tests/unit/settings/catalog_drift.test.js` | green. |
| **P-6** | #246/#247 are still free in `api_registry.md`. | grep the max row number | max is **#245**. If other work has landed, shift the block and say so. |
| **P-7** | **P2-GATE-1 is answered** (§15). | product decision recorded | the risk classification for #39/#40/#59/#60/#65/#79/#92 is confirmed or rejected **in writing**. Implementing the confirmation gate against an unreviewed classification is the one thing in this phase that can be silently wrong. |

---

## 3. Phase 1 Implementation & Completion Verification

Checked against the Phase 1 plan, file by file. This is the "do not treat planned as
completed" pass the brief requires.

### 3.1 Implemented as planned — Phase 2 may rely on these

| Phase 1 artefact | Verified state | What Phase 2 relies on |
|---|---|---|
| `catalog/index.js` | 138 entries / 26 groups / 49 surfaces; 11 invariants run at load and throw; deep-frozen, **including each per-group array** (fixed in the Phase 1 review pass). | `byKey`, `groupByKey`, `entriesForGroup`, `CATALOG_VERSION`. |
| `catalog/define_entry.js` | emits `risk`, `requires_reason` (derived `risk==='high'`), `resettable`, `clearable`, `empty_clears`, `normalised`, `warnings`, `known_errors`, `platform_cap`, `inherits_from`, `deprecated`, `split`. | **every field Phase 2's gates read already exists.** No factory change needed. |
| `catalog/groups.js` | `read_roles` / `write_roles` are catalog **data**. 25 of 26 groups have `write_roles: ['hr']`; `payroll.deprecated` has `write_roles: []`. | the `403` vs `405` distinction (§10.2 step 3) is pure data. |
| `utils/settings_value.utils.js` | `valuesEqual(a,b,dataType)` — numeric coercion for int/decimal only, `null` never equal to `0`/`''`, arrays order-sensitive, jsonb key-order-insensitive, throws on an unknown `dataType`. | **the one comparator.** Phase 2 must not write a second one (parent §7.10a; Phase 1 §28.3 item 2). |
| `utils/settings_etag.utils.js` | `forGroup(version, updatedAt)` → `W/"<version>:<iso>"`; `forAll`; `toIso`. | Phase 2 **extends** it with `parseIfMatch`. The token a client gets from S-4 is byte-identical to what S-5 requires. |
| `utils/settings_projection.utils.js` | `isGroupReadable`, `isGroupWritable`, `projectGroupForRole`, `projectEntryForResponse` (strips `enforcement_hint`), `sliceValues`, `computeNonDefaultKeys`. | `isGroupWritable` becomes **authoritative** (it was advisory in Phase 1); `projectEntryForResponse` reused for S-5's echoed metadata. |
| `adapters/*` (5) | each frozen, exposes exactly `read` + `ownerWritableKeys`; `nonSettingKeys` non-empty only for `organization_profiles` (16 master-data keys). | `ownerWritableKeys()` becomes the **write allowlist** (Phase 1 D-P1-4 built it as parity input only). |
| `services/settings_entitlement.service.js` | `resolveEntitlements(orgId, keys)` → sync lookup; one call per distinct non-null key; `503` propagates via `Promise.all`. | reused verbatim by the write service for the one group's feature key. |
| `controllers/settings.controller.js` | `ctx(req)` → `{orgId, actorId, actorRole, ipAddress, requestId}`; `envelope()`; `validateOrThrow` used **in the controller**, not as route middleware. | Phase 2's two handlers follow the identical five-step shape. `ctx` already carries everything the owners' actor contexts need. |
| `routes/settings.routes.js` | literal-first ordering; `/history`, `/surfaces`, `/readiness` reserved in a comment. | add the two write routes; keep the ordering discipline. |

### 3.2 Phase 1 deviations that affect Phase 2

From the Phase 1 plan §30, re-verified:

1. **`validateOrThrow` raises `400 VALIDATION_ERROR`**, not `422`. Phase 2 keeps that:
   malformed envelope → `400`; business rejections (`SETTING_NOT_WRITABLE`,
   `SETTINGS_REASON_REQUIRED`, …) → `422`. The owner's Joi failure is also `400`,
   which **matches the module's own door** — deliberate (R-S3: the two doors must not
   diverge).
2. **Manager read scope is 2 groups** (`payroll.authority`, `documents.authority`),
   not 5. Irrelevant to writes — `manager` is never a writer — but it means `manager`
   can read two groups it can never write, and S-4 already reports `writable: false`
   for them. Phase 2 makes that advisory flag true.
3. **`effect_timing` and `risk` were authored by domain judgement.** This is now
   **P2-GATE-1** (§15) and **F-P2-5**.
4. **DEF-S1/S2/S3** were documentation corrections, already applied.

### 3.3 Phase 1 artefacts Phase 2 must **change** (and why that is expected)

| Artefact | Change | Justification |
|---|---|---|
| `tests/unit/settings/adapters_contract.test.js` — **T-P1-4** asserts `Object.keys(adapter).filter(isFunction).sort() === ['ownerWritableKeys','read']` and that no `update` exists | becomes `['ownerWritableKeys','read','update']`; the "no write surface" intent moves to a stricter assertion: **no adapter touches a model** (static scan for `db.`, `require('…/models`, `.destroy(`, `.bulkCreate(`, `.upsert(` inside `adapters/`) and `update` delegates to exactly one owner **service** method, once (`T-S37`, `T-S64`). | This is the **only** Phase 1 test that must change, and it changes because the phase boundary moved, not because Phase 1 was wrong. Call it out in the PR description; do not let it be mistaken for a weakened invariant. |
| `adapters/*.adapter.js` (5) | gain `update()`, `ownerSchema`, `auditSource` | parent §4.13's adapter contract, completed. |
| `validators/settings.validator.js`, `controllers/settings.controller.js`, `routes/settings.routes.js`, `utils/settings_etag.utils.js` | additive only | no existing export changes name, shape or behaviour. |
| `catalog/*.catalog.js` + `CATALOG_VERSION` | risk/warnings/relationship data; version bump | §15. **Additive to the contract** — no key renamed, no key removed, no `data_type`/`default`/`range` changed. |

---

## 4. Dependencies on Existing HRMS Components

### 4.1 Reused unchanged — nothing new is created where one of these fits

| Component | Path | Use in Phase 2 |
|---|---|---|
| `authenticate`, `authorize`, `requireActiveOrg` | `common/middlewares/auth.middleware` | the write route guard. |
| `AppError(status, message, errorCode, details?)` | `common/utilities/appError.utils` | every gateway error. `details` is the 4th arg — used for `keys`, `warnings`, `current_etag`. |
| `validateOrThrow(schema, payload)` | `common/utilities/validator.utils` | the **envelope** (params + body shape) only. **Not** used for the owner schema — see §7.3. |
| `entitlementService.hasFeature` | `modules/billing/services/entitlement.service` | via Phase 1's `resolveEntitlements`. `503 ENTITLEMENT_DEPENDENCY_FAILURE` propagates. |
| The five owner write methods | §13 table | the actual writes. |
| The five owner Joi schemas | §7.2 table | the value enforcement boundary, run by the gateway. |
| `payrollSettingsRepo.findByOrgId(orgId, {lock, transaction})` | already supports `lock` | the DEF-S7 fix. |
| `settingsRepo.findByOrgId`, `statutoryConfigRepo.findByOrgId`, `brandingRepo.findByOrgId` | already `{lock:true}` at their write sites | the `If-Match` comparison point. |
| `payrollAuditService.record`, `documentAuditService.record` | in-transaction, owner-called | untouched. The gateway writes **no** audit row. |

### 4.2 Created by Phase 2

| New file | Lines (est.) | Why not an existing utility |
|---|---|---|
| `src/modules/settings/services/settings_write.service.js` | ~200 | the S-5/S-6 pipeline. |
| `src/modules/settings/utils/settings_patch.utils.js` | ~110 | pure functions: allowlist intersection, body bounds, default resolution, `changed`/`unchanged_keys`. Pure + no I/O ⇒ exhaustively testable, mirroring Phase 1's `settings_projection.utils`. |
| `src/modules/settings/utils/settings_owner_validation.utils.js` | ~40 | runs an owner schema with the **four non-negotiable options** (§7.3). `validateOrThrow` cannot be reused: it hardcodes `stripUnknown: true` (which would silently drop a key — the exact defect §9.3 forbids) and offers no `noDefaults` (which would wipe `registered_address_lines`). It raises the **identical** `AppError(400,…,'VALIDATION_ERROR')`. |
| `src/common/utilities/if_match.utils.js` | ~25 | `assertUpdatedAtMatches(row, ifMatch)` — the `412` check, called from **five** owner services. In `common/` because five modules use it, and it knows nothing about the Settings module (it compares an ISO string to `row.updated_at`), so no owner gains a dependency on Settings. |

### 4.3 Dependency direction

Unchanged from Phase 1 and still **one-way** for the gateway: `settings → payroll`,
`settings → document`, `settings → organization`, `settings → billing`.

The **one new reverse edge** is `payroll | document | organization → common/if_match.utils`,
which is a sibling common utility, not the Settings module. **No existing module gains
a dependency on `src/modules/settings`.** (The first such edge is Phase 3's
`settingsAudit.record`, deliberately deferred.)

---

## 5. Settings Ownership & Scope Model — the Phase 2 (write) view

### 5.1 Scope levels present in this system

| Scope | Exists? | Phase 2 treatment |
|---|---|---|
| **System / platform** | yes, as **code constants and env flags** (`VIEW_TTL_CAP_SECONDS`, `UPLOAD_TTL_CAP_SECONDS`, `ORG_CEILING_BYTES`, `ORG_PUBLISH_SYNC_LIMIT`, `PDF_BULK_GENERATION_ENABLED`) | **never writable.** Published read-only as `platform_cap` on the 4 keys that have one, and as `depends_on_ops` on 1 key. There is no platform-settings write path and Phase 2 does not create one. |
| **Organization (tenant) singleton** | yes — the 138 catalog keys across 5 stores | **the whole of Phase 2's write surface.** |
| **Per-record / targeted** | yes — the 49 surfaces | **Not writable here — Reason:** D-S5. The owning module's CRUD is the only door; the gateway publishes a pointer. |
| **User-level** | **No — Reason:** no registry entry is per-user configuration. The nearest thing (`employee_leave_configs`, #5/#6/#8/#11) is a per-employee **policy override**, owned by the leave module and modelled as a surface. Phase 2 introduces no user-scoped setting and no user-preferences store. |
| **Role-specific** | **not as stored values.** Role enters only as *who may read/write a group* (`read_roles`/`write_roles` in `groups.js`). There is no per-role setting value and no per-role override layer. |

### 5.2 Writable group map (verified against `groups.js` + the catalog)

| Store | Groups | Catalog keys | Owner write method | Writable by |
|---|---|---|---|---|
| `payroll_settings` | 10 writable + `payroll.deprecated` (read-only) | 63 (62 writable + `pdf_render_engine`) | `payrollSettingsService.update` | `hr` |
| `statutory_configs` | `statutory.pf` (15), `.esi` (5), `.pt` (1), `.income_tax` (4) | 25 | `statutoryConfigService.updateConfig` | `hr` |
| `document_settings` | 9 groups | 35 | `documentSettingsService.update` | `hr` |
| `document_letter_branding` | `documents.branding` | 13 | `letterBrandingService.replace` | `hr` |
| `organization_profiles` | `billing.notifications` | 2 | `organizationService` (new locked method, §13.5) | `hr` |

**25 writable groups, 137 writable keys, 1 read-only group, 1 read-only key.**

### 5.3 Override precedence and inheritance — what Phase 2 does and does not do

**The gateway resolves no precedence.** It publishes it (Phase 1, D-P1-6) and writes
one store. Concretely:

* **Platform ceiling.** 4 keys carry `platform_cap`. The gateway does **not** clamp.
  The owner's `assertCap` rejects an over-cap value with `422 SETTING_OUT_OF_RANGE`,
  and that reaches the client unchanged. Clamping at the gateway would make the two
  doors behave differently — the thing R-S3 exists to prevent.
* **`null` means inherit.** 18 keys are `nullable`; 12 carry an `inherits_from`
  (1 → another key: `letter_record_retention_days` → `document_retention_days`;
  11 → the `organization_profiles` store, for branding text). A write of `null` stores
  `null`; the gateway does **not** substitute the inherited value, and the response
  reports the stored `null`. **S-6 reset on such a key writes `null`** (`T-S42`).
* **`''` clears to `null`.** 10 keys are `empty_clears: true` (the branding text
  fields). The owner's `_mapReplaceFields` maps `'' → null`. The gateway passes `''`
  through untouched and reports the **stored** `null` in `changed`.
* **Never clearable.** `accent_color_hex` is `clearable: false` (`CHAR(7) NOT NULL`);
  the owner **deletes the key from its patch** when it resolves to `null`, so a clear
  is a silent no-op. The gateway must therefore report it in **`unchanged_keys`**, not
  `changed` — which only works because `changed` is diffed from the re-read row
  (`T-S61`).
* **Frozen snapshots beat live values.** The gateway never touches
  `payroll_runs.settings_snapshot`. S-5 only *reports* the live runs an edit will not
  reach, via `impact.affected_runs` (statutory only).

---

## 6. Architecture, Directory Structure & Wiring

### 6.1 Request path

```text
PUT /api/v1/settings/groups/:groupKey
  │
  ├─ authenticate → authorize(['hr']) → requireActiveOrg          (route)
  ├─ ctx(req) + validateOrThrow(params, body)                      (controller)
  ├─ parseIfMatch(req.headers['if-match'], CATALOG_VERSION)        (controller)
  │
  └─ settings_write.service.updateGroup(ctx, groupKey, {values, reason, confirm, ifMatch})
       1  catalog.groupByKey                → 404 GROUP_NOT_FOUND
       2  group.write_roles.length === 0    → 405 SETTINGS_GROUP_READ_ONLY
       3  isGroupWritable(group, role)      → 403 FORBIDDEN
       4  resolveEntitlements               → 403 FEATURE_NOT_AVAILABLE | 503
       5  assertBodyBounds(values)          → 422 SETTINGS_PAYLOAD_INVALID
       6  intersectWritableKeys             → 422 SETTING_NOT_WRITABLE | NO_WRITABLE_KEYS
       7  reason / confirm policy           → 422 SETTINGS_REASON_REQUIRED | 409 SETTINGS_CONFIRMATION_REQUIRED
       8  validateWithOwnerSchema           → 400 VALIDATION_ERROR          ◀ F-P2-1
       9  before = adapter.read(orgId)                                      ◀ sound only because If-Match is mandatory (§19.1)
      10  adapter.update(orgId, patch, actorCtx, { ifMatch })  ──▶ OWNER
      11  changed / unchanged_keys from (before, after) via valuesEqual
      12  response: values, etag, changed, unchanged_keys, impact?
```

Steps 1–8 are **pure gateway pre-checks that touch no store**. Step 9 is the first
I/O. Everything from step 10 on is the owner's, inside the owner's single transaction.

### 6.2 Files

```text
src/modules/settings/
  routes/settings.routes.js                       ▲ + PUT /groups/:groupKey, POST /groups/:groupKey/reset
  controllers/settings.controller.js              ▲ + updateGroup, resetGroup
  validators/settings.validator.js                ▲ + updateGroupBodySchema, resetGroupBodySchema
  services/
    settings_write.service.js                     ★ NEW
  utils/
    settings_patch.utils.js                       ★ NEW  (pure)
    settings_owner_validation.utils.js            ★ NEW
    settings_etag.utils.js                        ▲ + parseIfMatch
  adapters/
    payroll_settings.adapter.js                   ▲ + update, ownerSchema, auditSource
    statutory_config.adapter.js                   ▲ + update, ownerSchema, auditSource
    document_settings.adapter.js                  ▲ + update, ownerSchema, auditSource
    document_letter_branding.adapter.js           ▲ + update, ownerSchema, auditSource
    organization_billing.adapter.js               ▲ + update, ownerSchema, auditSource; repository → service
  catalog/
    payroll.catalog.js, document.catalog.js, …     ▲ risk / warnings / relationships (data only)
    index.js                                      ▲ CATALOG_VERSION bump

src/common/utilities/
  if_match.utils.js                               ★ NEW

src/modules/payroll/services/payroll_settings.service.js        ▲ DEF-S7 lock + ifMatch
src/modules/payroll/services/statutory_config.service.js        ▲ ifMatch
src/modules/document/services/document_settings.service.js      ▲ ifMatch
src/modules/document/services/document_letter_branding.service.js ▲ ifMatch
src/modules/organization/services/organization.service.js       ▲ DEF-S10 locked method + ifMatch
src/modules/organization/repositories/organization.repository.js ▲ + lockOrganizationProfileByOrgId
src/modules/document/routes/document_hr.routes.js               ▲ DEF-S8 convention alignment (no behaviour change)

src/app.js                                        — unchanged (Phase 1's mount line is enough)
```

`★` new, `▲` modified. **No model, no repository, no migration, no seeder, no env var
is added, and `MODEL_ROOTS` is not touched.**

### 6.3 Route wiring

```js
const settingsWriteAuth = [authenticate, authorize(['hr']), requireActiveOrg]

router.get('/catalog', settingsReadAuth, controller.getCatalog)                       // S-1 #242
router.get('/catalog/:settingKey', settingsReadAuth, controller.getCatalogEntry)      // S-2 #243
router.post('/groups/:groupKey/reset', settingsWriteAuth, controller.resetGroup)      // S-6 #247
router.put('/groups/:groupKey', settingsWriteAuth, controller.updateGroup)            // S-5 #246
router.get('/groups/:groupKey', settingsReadAuth, controller.getGroup)                // S-4 #245
router.get('/', settingsReadAuth, controller.getAll)                                  // S-3 #244
```

* `authorize(['hr'])`, **not** `['hr','manager']`: `manager` is never a writer
  (parent §9.1). An `employee`/`admin`/`super-admin`/`manager` token gets `403` at the
  door (`T-S15`, `T-S9`, `T-S22`).
* **No route-level `requireFeature`** — the feature key depends on the group in the
  path, and the service already resolves it. Consistent with Phase 1.
* `/groups/:groupKey/reset` is declared before `/groups/:groupKey` purely to keep the
  "more specific first" discipline readable; Express 5 would match correctly either way
  (different method and different segment count).

---

## 7. F-P2-1 — Owner-schema validation at the gateway

**This is the most important section of the plan.** Get it wrong and the gateway
becomes a validation bypass around five modules.

### 7.1 The problem, verified

Parent §8.1 assigns per-key type/range/enum/length/array validation to "the domain
module's Joi schema" and §4.5 says the gateway reaches it by calling the owner's
existing update method. **It does not.** Verified by reading all five services: not one
requires `joi` or any validator module. Every schema is applied *above* the service:

| Store | Schema | Applied at | Verified location |
|---|---|---|---|
| `payroll_settings` | `payrollHrValidator.updateSettingsSchema` | **route middleware** | `payroll_hr.routes.js:59` → local `validate()` wrapper (`:13`) |
| `statutory_configs` | `payrollHrValidator.updateStatutoryConfigSchema` | **route middleware** | `payroll_hr.routes.js:161` |
| `document_settings` | `documentHrValidator.updateSettingsSchema` | **controller** | `document_hr.controller.js:305` |
| `document_letter_branding` | `documentLetterValidator.replaceBrandingSchema` | **controller** | `document_letter_branding.controller` (route `document_letter.routes.js:21` has no `validate`) |
| `organization_profiles` | `organizationValidator.fieldValidation_UpdateOrganizationProfile` | **controller** | `organization.controller.js:33` |

The owner services *document* the assumption: `organization.service.js:944` —
*"rejected at the validator, so this method only ever sees whitelisted keys"*.

So a gateway that calls `payrollSettingsService.update(orgId, patch, actor)` directly
would skip every `min`/`max`/`valid(...)`/`length`/`email`/`uri`/pattern rule on 63
keys. The database `CHECK` constraints catch some of it, as a Sequelize error with the
wrong status and an unusable message; the rest would be stored.

### 7.2 D-P2-1 — the gateway runs the owner's **own schema object**

Each adapter declares `ownerSchema` — a reference to the owner's **exported Joi
object**, not a copy, not a subset, not a re-derivation:

```js
// payroll_settings.adapter.js
const payrollHrValidator = require('../../payroll/validators/payroll_hr.validator')
…
ownerSchema: payrollHrValidator.updateSettingsSchema,
```

Why a reference and not a per-key gateway schema:

* **No drift is possible.** The gateway validates with the identical object the module's
  own route uses. `T-S2` already asserts the catalog agrees with that object, so the
  three artefacts (catalog metadata, gateway enforcement, module enforcement) are one
  source.
* Parent §9.6 is explicit: `values` must **not** be schema-validated key-by-key at the
  gateway, because that would duplicate 138 keys of Joi and guarantee drift. Using the
  owner's object is not duplication — it *is* the owner's validator, invoked from a
  second door.
* A new drift test (`T-P2-1`) asserts, per adapter, that
  `Object.keys(ownerSchema.describe().keys)` **equals** `ownerWritableKeys()`, so the
  schema and the allowlist can never disagree.

### 7.3 The four validation options, and why each is non-negotiable

```js
// utils/settings_owner_validation.utils.js
function validateWithOwnerSchema(schema, patch) {
  const { error, value } = schema.validate(patch, {
    abortEarly: false,     // report every bad key at once — an HR settings form submits many
    allowUnknown: false,   // an unknown key is an error …
    stripUnknown: false,   // … and must NOT be silently removed (parent §9.3)
    convert: true,         // same coercion the module's own door applies
    noDefaults: true       // never inject a key the caller did not send
  })
  if (error) throw new AppError(400, error.details[0].message, 'VALIDATION_ERROR', {
    keys: [...new Set(error.details.map((d) => d.path[0]).filter(Boolean))]
  })
  return value
}
```

| Option | If you get it wrong |
|---|---|
| `noDefaults: true` | **Verified data loss.** `replaceBrandingSchema.registered_address_lines` is declared `.default([])`. Without `noDefaults`, **every** `documents.branding` write that does not mention the address lines would inject `registered_address_lines: []` into the patch and **wipe the org's registered address**. It is the only key with a Joi default across all five schemas — verified by enumerating `describe().keys` for each — which is exactly why it is easy to miss. |
| `stripUnknown: false` | reintroduces the "`200` that changed nothing" defect the payroll module already shipped once and had to fix (parent §9.3). The gateway's allowlist (§9.3) rejects unknown keys first, so by this point the patch is already clean — this option makes that a provable invariant rather than a hope. |
| `allowUnknown: false` | same. |
| `convert: true` | must match the module door. Dropping it would make `"7"` fail at the gateway and pass at `/payroll/hr/settings` — divergence (R-S3). |
| `abortEarly: false` | a quality-of-contract choice: a settings form gets all its errors in one round-trip. |

`.min(1)` on four of the five schemas is satisfied by construction: step 6 has already
rejected an empty patch with `422 NO_WRITABLE_KEYS`.

**Ordering matters:** owner-schema validation is step **8**, *after* the allowlist
(step 6) and the reason/confirm gates (step 7). Rationale: an unknown or non-writable
key must be reported as `422 SETTING_NOT_WRITABLE` (a permission fact), not as a
`400` Joi "not allowed" message (a shape fact), and a missing `confirm` must not be
masked by a type error elsewhere in the payload.

### 7.4 What the gateway still never does

It does not re-implement a single cross-field guard. `INSUFFICIENT_CHECKERS`,
`SETTINGS_CONFLICT`, `SCAN_PROVIDER_NOT_CONFIGURED`, `INVALID_PAYOUT_COMPONENT`,
`SETTING_OUT_OF_RANGE`, `LETTER_REFERENCE_PATTERN_INVALID`, `assertReminderSchedule`'s
normalisation, `assertAutoIssueTemplates`' registry membership check, and
`statutory_config`'s component-activation side effect all stay in the owner and reach
the client unchanged (`T-S36`). The gateway adds Joi, which the owner's own door
already has, and nothing else.

---

## 8. The Adapter Write Contract

### 8.1 Shape (completing parent §4.13)

```js
module.exports = Object.freeze({
  store:              'payroll_settings',
  groups:             groupsForStore(STORE),       // derived from the catalog
  featureKey:         'payroll.access',
  read:               async (orgId) => ({ values, updatedAt }),
  update:             async (orgId, patch, actor, { ifMatch }) => ({ values, updatedAt, impact }),
  ownerWritableKeys:  () => [...],                 // write allowlist + T-S2 parity input
  ownerSchema:        <the owner's exported Joi object>,
  nonSettingKeys:     Object.freeze([...]),
  concurrencyField:   'updated_at',
  auditSource:        { table: 'payroll_audit_logs', entityType: 'payroll_settings' }  // metadata for Phase 3; unused in Phase 2
})
```

### 8.2 Rules every `update()` must obey

1. **Call exactly one owner *service* method, exactly once.** Never a model, never a
   repository, never two owner calls (`T-S37`).
2. **Pass only the patch it was given.** No key added, none dropped, no normalisation
   — the gateway has already produced the exact intersected patch.
3. **Return plain data**, never a Sequelize instance: `{ values, updatedAt, impact? }`
   where `values` is the owner's post-write row sliced to this store's catalog keys
   (reuse `pick(plain, catalogKeysForStore(STORE))`, identical to `read`).
4. **Translate the actor context** into the owner's shape. The five owners differ; that
   translation is the adapter's whole reason to exist (§13.1 table).
5. **Thread `ifMatch` through untouched.** The adapter neither parses nor compares it.
6. **Never read or write an asset column, storage key or cron watermark.** Guaranteed
   by the allowlist, asserted by `T-S64` and `T-S17`.
7. **`impact` only when the owner produced one.** Do not synthesise one.

### 8.3 Per-adapter notes

| Adapter | Owner call | `impact` | Trap |
|---|---|---|---|
| `payroll_settings` | `payrollSettingsService.update(orgId, patch, {actorId, ip, requestId}, {ifMatch})` | none | the owner's actor key is **`ip`**, not `ipAddress`. |
| `statutory_config` | `statutoryConfigService.updateConfig(orgId, patch, {actorId, ip, requestId}, {ifMatch})` | `{ affected_runs, activated_components }` — both from the owner's return | `affected_runs` items are `{id, period_month, run_type, status}` (verified), **not** the parent §7.6 sketch's `{id, period, status}`. Pass the owner's objects through verbatim. `activated_components` is a real side effect (statutory heads activate salary-component catalog rows) and is worth surfacing. |
| `document_settings` | `documentSettingsService.update(orgId, patch, {actorId, ipAddress, requestId, ifMatch})` | none | the owner **returns early without writing** when the merged change set is empty, so `updated_at` does **not** move. The gateway must re-slice from whatever row comes back and must not assume the ETag changed. |
| `document_letter_branding` | `letterBrandingService.replace(orgId, {actorId, payload: patch, ipAddress, requestId, ifMatch})` | none | **three silent normalisations** (§5.3). The owner returns `{branding, inherited, assets}` — slice from `.branding` and discard the other two, exactly as `read` does. Its post-write re-read happens **after commit**, outside the transaction (verified `document_letter_branding.service.js:210`) — see EC-P2-7. |
| `organization_billing` | the **new** locked method (§13.5) | none | switches from `organizationRepository` to `organizationService` (planned in Phase 1 §7.6). Its `read` stays on the repository — no reason to change a working read. |

---

## 9. Database Layer

**Not Applicable — Reason: Phase 2 creates no table, column, index, constraint,
enum, default or migration, and changes none.**

Specifically, and each verified:

| Brief item | Answer |
|---|---|
| Required tables / models | none. The five owner tables already exist; the catalog is code (D-S2); there is no settings-value table (D-S6) and Phase 2 does not create one. |
| Columns / types / PK / FK / unique / check / index / defaults / nullability | unchanged. Every writable key is an existing typed column with its existing `CHECK`/`ENUM`/`NOT NULL`. |
| Scope relationship | `org_id` + `UNIQUE (org_id)` on each singleton — already present. |
| Audit relationship | `payroll_audit_logs` / `document_audit_logs` — already written **by the owners**, inside their own transactions. The gateway adds no row. `settings_change_logs` is **Phase 3**. |
| Migration requirements | **none.** Nothing to hand back to the operator. |
| Flexible key-value integrity | **Not Applicable** — there is no key-value model. Type integrity comes from the typed column + the owner's Joi + the catalog's `data_type`, kept in agreement by `T-S2`. |
| Rollback safety | no DDL ⇒ rollback is a code revert (§23). |

**The one schema fact Phase 2 depends on, verified by executing it:** all five models
declare `timestamps: true` with `updatedAt: 'updated_at'`, and all five tables have the
column — `payroll_settings` (paranoid), `statutory_configs` (paranoid),
`document_settings`, `document_letter_branding`, `organization_profiles`. Without this
the `If-Match` token would not exist. **`organization_profiles` has no `updated_by`
column** (the repository comment says so explicitly) — do not add one and do not pass
one.

---

## 10. API Layer

Conventions inherited from Phase 1: base `/api/v1/settings`; envelope
`{ success, message, data }`; `orgId` **only** from `req.user.orgId`; errors as
`AppError` (`status`, `errorCode`, `message`, optional `details`).

### 10.1 Endpoint register (Phase 2 delta)

| # | Method | Path | Registry | Roles | Body | `If-Match` |
|---|---|---|---|---|---|---|
| S-5 | `PUT` | `/settings/groups/:groupKey` | **#246** | `hr` | `{ values, reason?, confirm? }` | **required** |
| S-6 | `POST` | `/settings/groups/:groupKey/reset` | **#247** | `hr` | `{ keys[], reason?, confirm? }` | **required** |

Unchanged: #242–#245 keep their paths, methods, request shapes and responses exactly.

### 10.2 S-5 `PUT /settings/groups/:groupKey` — normative pipeline

**Headers.** `If-Match: W/"<catalog_version>:<iso>"` — the token S-4 returns as the
**group's** `etag`. `x-request-id` (or `x-correlation-id`) is propagated into the
owner's audit row.

**Body.**

```json
{
  "values": { "document_require_separate_checker": true },
  "reason": "SOX control rollout Q4",
  "confirm": true
}
```

**Steps (order is normative; the step numbers are referenced by the tests).**

| # | Check | Failure |
|---|---|---|
| 0 | route guard | `401`; `403` for any non-`hr` token |
| 0a | `validateOrThrow(groupKeyParamSchema, req.params)` and `validateOrThrow(updateGroupBodySchema, req.body)` | `400 VALIDATION_ERROR` |
| 0b | `parseIfMatch(req.headers['if-match'], CATALOG_VERSION)` | absent/blank → `400 SETTINGS_IF_MATCH_REQUIRED`; unparseable → `400 SETTINGS_IF_MATCH_INVALID`; **version segment ≠ current** → `412 SETTINGS_PRECONDITION_FAILED` with `details.reason: 'CATALOG_VERSION_CHANGED'` |
| 1 | `catalog.groupByKey(groupKey)` | `404 GROUP_NOT_FOUND` |
| 2 | `group.write_roles.length === 0` | `405 SETTINGS_GROUP_READ_ONLY` (today: `payroll.deprecated` only) |
| 3 | `isGroupWritable(group, ctx.actorRole)` | `403 FORBIDDEN` |
| 4 | `resolveEntitlements(orgId, [group.featureKey])` | `403 FEATURE_NOT_AVAILABLE`; a `503 ENTITLEMENT_DEPENDENCY_FAILURE` **propagates unchanged** |
| 5 | `assertBodyBounds(values)` — plain object, 1–60 own keys, no nested object deeper than 2, `JSON.stringify(values).length ≤ 65536` | `422 SETTINGS_PAYLOAD_INVALID` with `details.violation` |
| 6 | **allowlist intersect** — `Object.keys(values)` ⊆ (group's catalog keys ∩ `ownerWritableKeys()`), minus `deprecated` and `sensitive` entries | any outside → `422 SETTING_NOT_WRITABLE { keys: [...] }`; none inside → `422 NO_WRITABLE_KEYS` |
| 7a | any touched key `requires_reason` and `reason` missing/blank | `422 SETTINGS_REASON_REQUIRED { keys: [...] }` |
| 7b | any touched key `risk === 'high'` and `confirm !== true` | `409 SETTINGS_CONFIRMATION_REQUIRED { keys: [...], warnings: [...] }` — `warnings` are the catalog's texts verbatim |
| 8 | `validateWithOwnerSchema(adapter.ownerSchema, patch)` | `400 VALIDATION_ERROR { keys: [...] }` |
| 9 | `before = adapter.read(orgId)` | a rejection propagates (no degradation; this is a targeted request) |
| 10 | `adapter.update(orgId, patch, actorCtx, { ifMatch })` | every owner error propagates **verbatim** — status, `errorCode`, `message`, `details`; the `412`'s `details` is enriched with `current_etag` (§12.4) |
| 11 | `changed` / `unchanged_keys` from `(before.values, after.values)` via `valuesEqual` | — |

**Response `data`.**

```json
{
  "catalog_version": "2026-10-10.1",
  "group": "documents.authority",
  "store": "document_settings",
  "etag": "W/\"2026-10-10.1:2026-10-10T08:15:02.431Z\"",
  "updated_at": "2026-10-10T08:15:02.431Z",
  "values": { "...": "the full group after the write" },
  "changed": { "document_require_separate_checker": { "from": false, "to": true } },
  "unchanged_keys": [],
  "non_default_keys": ["document_require_separate_checker"],
  "impact": {
    "affected_runs": [{ "id": "…", "period_month": "2026-10", "run_type": "regular", "status": "draft" }],
    "activated_components": ["PF_EMPLOYER"]
  }
}
```

* `values` is the **whole group** after the write, not just the patch — so a client can
  replace its local group state in one assignment.
* `changed` holds **only keys whose stored value actually differs**, diffed with
  `valuesEqual`. Submitted-but-identical keys land in `unchanged_keys`.
* `non_default_keys` is recomputed (same helper as S-3/S-4) so the "customised" badge
  updates without a re-fetch.
* `impact` is **absent** unless the owner produced one (today: `statutory_configs`
  only).
* **Not present:** `reason` (never echoed — §17.2), `enforcement_hint` (stripped
  everywhere), any `sensitive` key (none exists), any asset column.

### 10.3 S-6 `POST /settings/groups/:groupKey/reset`

**Body.** `{ "keys": ["document_notify_expiry"], "reason": "...", "confirm": true }`

`keys` is **required, non-empty, max 50, unique**. There is deliberately no
"reset the whole group" and no "reset everything": a blanket reset of
`documents.retention` or `payroll.exits` is destructive and nobody means it in one
click (parent §7.7).

**Behaviour.** Resolve each key's catalog `default`, build `values = { key: default }`,
then run the **identical S-5 pipeline from step 1**. Reset is not a privileged bypass:
the checker-pool check, the conflict check, the component-reference check, the
confirmation gate and the concurrency token all apply.

Two reset-specific pre-checks, inserted at step 6:

| Check | Failure |
|---|---|
| key not in the group's writable intersection | `422 SETTING_NOT_WRITABLE { keys }` |
| `entry.resettable === false` | `422 SETTING_NOT_RESETTABLE { keys }` |

**On `resettable`:** verified — **no shipped catalog entry has
`resettable: false`**. The parent's two examples (#3 `accrual_type`, #8 `annual_quota`)
are per-record surfaces and correctly absent from the catalog. The gate is still
implemented, and `T-S41` exercises it against a locally-constructed entry, because the
flag exists in `define_entry` and a future `"required — no default"` key must not
become silently resettable.

**On `clearable: false`:** `accent_color_hex` is the one such key. Its catalog default
is the concrete `'#1F2937'` (verified), so reset writes a real value and the owner's
null-deleting branch is never reached. If a future `clearable: false` key ever has a
`null` default, `defineEntry` must reject that combination — added as **invariant 12**
(§15.4).

Response: identical to S-5 plus `"reset": true`.

### 10.4 Error register (complete, Phase 2)

| Status | `errorCode` | Raised by | `details` |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | envelope Joi, **and the owner's Joi** | `keys[]` for the owner case |
| 400 | `SETTINGS_IF_MATCH_REQUIRED` | gateway | — |
| 400 | `SETTINGS_IF_MATCH_INVALID` | gateway | — |
| 401 | — | `authenticate` | — |
| 403 | `FORBIDDEN` | `authorize(['hr'])`, or step 3 | — |
| 403 | `FEATURE_NOT_AVAILABLE` | step 4 | — |
| 404 | `GROUP_NOT_FOUND` | step 1 | — |
| 404 | `ORG_PROFILE_NOT_FOUND` | the org owner / adapter | — |
| 405 | `SETTINGS_GROUP_READ_ONLY` | step 2 | — |
| 409 | `SETTINGS_CONFIRMATION_REQUIRED` | step 7b | `keys[]`, `warnings[]` |
| 409 | `INSUFFICIENT_CHECKERS` | payroll **and** document owners | `active_hr_count` (document only) |
| 409 | `SETTINGS_CONFLICT` | document owner (#59 ⊕ #60) | `fields[]` |
| 409 | `SCAN_PROVIDER_NOT_CONFIGURED` | document owner (#64) | — |
| 412 | `SETTINGS_PRECONDITION_FAILED` | owner, under the lock; or step 0b on a version change | `current_etag`, `current_updated_at`, `reason?` |
| 422 | `SETTING_NOT_WRITABLE` | step 6 | `keys[]` |
| 422 | `NO_WRITABLE_KEYS` | step 6 | — |
| 422 | `SETTINGS_REASON_REQUIRED` | step 7a | `keys[]` |
| 422 | `SETTING_NOT_RESETTABLE` | S-6 step 6 | `keys[]` |
| 422 | `SETTINGS_PAYLOAD_INVALID` | step 5 | `violation` |
| 422 | `SETTING_OUT_OF_RANGE` | document owner (`assertCap`, `assertReminderSchedule`, `assertAutoIssueTemplates`) | `field`, `min`/`max`/`code` |
| 422 | `INVALID_PAYOUT_COMPONENT` | payroll owner | — |
| 422 | `LETTER_REFERENCE_PATTERN_INVALID` | document owner (`letter_reference.utils`) | — |
| 503 | `ENTITLEMENT_DEPENDENCY_FAILURE` | entitlement service | — |

`428 Precondition Required` is deliberately **not** used (parent §7.6): a missing
`If-Match` is a `400`, keeping the vocabulary inside the status codes this codebase
already uses. **`412` is the first use of that status anywhere in this repository**
(verified) — flag it in the change record.

### 10.5 Caching headers on writes

S-5/S-6 responses set `Cache-Control: no-store` and an `ETag` equal to the new group
token, so a client can use the response's own ETag as the next `If-Match` without a
re-read. They do **not** honour `If-None-Match` (meaningless on a write).

---

## 11. Controller Layer

Two handlers, each following Phase 1's five-step shape exactly, each **containing no
business rule**.

```js
async function updateGroup(req, res, next) {
  try {
    const c = ctx(req)
    const { groupKey } = validateOrThrow(schemas.groupKeyParamSchema, req.params)
    const body = validateOrThrow(schemas.updateGroupBodySchema, req.body)
    const ifMatch = etag.parseIfMatch(req.headers['if-match'], catalog.CATALOG_VERSION)
    const data = await writeService.updateGroup(c, groupKey, { ...body, ifMatch })
    res.set('ETag', data.etag)
    res.set('Cache-Control', 'no-store')
    return res.status(200).json(envelope(data, 'Settings updated'))
  } catch (err) { return next(err) }
}
```

`resetGroup` is identical but validates `resetGroupBodySchema` and calls
`writeService.resetGroup`.

**The controller must not:** decide role access, call entitlement, compute the
allowlist, compose an ETag, evaluate `risk`/`requires_reason`, read the catalog beyond
`CATALOG_VERSION`, open a transaction, or touch `req.query` (Express 5 forbids
assigning to it — Phase 1 §4.4).

`ctx(req)` is reused verbatim: it already yields
`{orgId, actorId, actorRole, ipAddress, requestId}`, which is the full union of what
the five owners' actor contexts need.

### 11.1 Envelope validators (additions to `settings.validator.js`)

```js
const settingValueMap = Joi.object()
  .pattern(/^[a-z0-9_]{1,80}$/, Joi.any())   // per-key validation is the OWNER's (§7)
  .min(1).max(60).required()

const updateGroupBodySchema = Joi.object({
  values:  settingValueMap,
  reason:  Joi.string().trim().min(1).max(500),
  confirm: Joi.boolean()
}).unknown(false)

const resetGroupBodySchema = Joi.object({
  keys:    Joi.array().items(Joi.string().pattern(/^[a-z0-9_]{1,80}$/)).min(1).max(50).unique().required(),
  reason:  Joi.string().trim().min(1).max(500),
  confirm: Joi.boolean()
}).unknown(false)
```

* The `pattern(...)` key regex is what makes `__proto__`, `constructor` and
  `hasOwnProperty` unrepresentable in `values` — the same defence Phase 1 applied to
  `:settingKey`, and the allowlist's own-property `Map` lookup is the real fix behind it
  (`T-P2-6`).
* `values` is deliberately **not** typed per key. Depth and size are bounded in step 5,
  not here, because a Joi depth rule would have to be re-derived per key.
* `reason` is never `required` in the schema — whether it is required depends on the
  **keys**, which is a step-7a decision, not an envelope one.

---

## 12. Service Layer — `settings_write.service.js`

### 12.1 Responsibilities

| Concern | Where |
|---|---|
| group resolution, read-only / RBAC / entitlement gates | write service, steps 1–4 |
| body bounds, allowlist intersection, reason/confirm policy | `settings_patch.utils` (pure), called by the write service |
| owner-schema validation | `settings_owner_validation.utils`, called by the write service |
| the write itself, its transaction, its guards, its audit row | **the owner**, via the adapter |
| `changed` / `unchanged_keys` / `non_default_keys` | `settings_patch.utils` + Phase 1's `settings_projection.utils`, using `valuesEqual` |
| `If-Match` parsing and `current_etag` enrichment | `settings_etag.utils` + the write service's error passthrough |

**The write service opens no transaction, ever** (parent §8.8). It holds no state and
caches nothing.

### 12.2 `settings_patch.utils` — pure functions

```js
assertBodyBounds(values)                      // → void | throws 422 SETTINGS_PAYLOAD_INVALID
writableKeysForGroup(group, adapter)          // → Set: catalog keys ∩ ownerWritableKeys, minus deprecated/sensitive
intersectPatch(values, writableKeys)          // → { patch, rejected[] }
reasonAndConfirmPolicy(entries, {reason, confirm})
                                              // → { needsReason[], needsConfirm[], warnings[] }
resolveDefaults(entries, keys)                // → { values, notResettable[] }   (S-6)
diffStored(beforeValues, afterValues, entries)// → { changed, unchanged_keys }    (valuesEqual)
```

`diffStored` iterates **the submitted keys only** and, for each, compares the before and
after **stored** values:

* differ → `changed[key] = { from: before, to: after }`
* equal → `unchanged_keys.push(key)`
* absent from either side → `unchanged_keys` + a `warn` log naming the key only (a
  catalog/model drift anomaly that `T-S2` should have caught; never a thrown error on a
  write that already committed)

### 12.3 Why `before` comes from a gateway pre-read, and why that is sound

The gateway cannot read inside the owner's transaction (D-S3: it opens none), so
`before` is `adapter.read(orgId)` taken at step 9. That looks racy. It is not, **and
the reason is precisely why `If-Match` is mandatory rather than optional**:

> Let the client read at `T0` (token `E0`), the gateway pre-read at `T1`, and the owner
> acquire the row lock at `T2` and observe `updated_at = U2`. The owner rejects unless
> `U2 === E0`. Any competing commit in `(T0, T2)` moves `updated_at`, so `U2 ≠ E0` and
> the write is refused with `412` **before any mutation**. Therefore a *successful*
> write implies no commit occurred in `(T0, T2)` ⊇ `(T1, T2)`, so the pre-read's values
> are exactly the locked row's values.

So `changed` is exact on success and irrelevant on failure. Cost: one extra read per
write (6 queries instead of 5 on a write path that runs a handful of times per org per
month). **An optional `If-Match` would break this proof** — that is now a second,
independent reason for parent §12.2's "required, not optional", beyond the stale-UI
argument.

### 12.4 `If-Match`: a split responsibility (D-P2-2)

The owner must compare the token **under its row lock** (parent §12.2 step 5), but the
token's outer form (`W/"<catalog_version>:<iso>"`) is a Settings-module concept. If the
owner compared the whole string it would have to know `CATALOG_VERSION` — an owner →
Settings dependency Phase 2 must not create.

**Split:**

* **Gateway** (`etag.parseIfMatch(header, catalogVersion)`):
  * absent/blank → `400 SETTINGS_IF_MATCH_REQUIRED`
  * not matching `^W\/"([^":]+):([^"]+)"$` → `400 SETTINGS_IF_MATCH_INVALID`
  * version segment ≠ `catalogVersion` → `412 SETTINGS_PRECONDITION_FAILED`,
    `details.reason = 'CATALOG_VERSION_CHANGED'` (a rolling deploy or a stale client:
    re-fetch S-1 then S-4, per the retry guidance)
  * otherwise → the **bare ISO timestamp**
  * `*` is **not** accepted: "overwrite whatever is there" is the exact behaviour the
    gate exists to prevent.
* **Owner** receives the bare ISO string and, after `findByOrgId(..., {lock:true})`,
  calls the shared `assertUpdatedAtMatches(row, ifMatch)`:

```js
// src/common/utilities/if_match.utils.js
function assertUpdatedAtMatches(row, ifMatch) {
  if (ifMatch === null || ifMatch === undefined) return      // precondition not requested
  const current = row && row.updated_at ? new Date(row.updated_at).toISOString() : null
  if (current !== ifMatch) {
    throw new AppError(412, 'The resource was modified by another request', 'SETTINGS_PRECONDITION_FAILED',
      { current_updated_at: current })
  }
}
```

* **Gateway again**, on catching a `412` from the adapter: enrich
  `err.details.current_etag = etag.forGroup(CATALOG_VERSION, err.details.current_updated_at)`
  so the client can re-sync in one step, then rethrow. This is the **only** error the
  gateway touches; every other owner error passes through untouched (`T-S36`).

**Why `updated_at` and not a `version` column:** parent §6.3. The known caveat (EC-S4)
— two commits in the same microsecond minting the same token — is unchanged and is
accepted: the row lock serialises them and the second observes the first's committed
`updated_at`, so the failure mode is a spurious `412`, never a lost update.

**A no-op write still moves the token.** Sequelize's bulk `Model.update` always includes
`updated_at` in the `SET` clause, so resubmitting an identical patch returns
`changed: {}` with a **new** ETag. Clients must adopt the ETag from the response rather
than reusing the one they sent. (The one exception, verified: `document_settings`
returns early without writing when the merged change set is empty, leaving the token
unmoved.) This goes in the change record.

### 12.5 Logging

One line per write attempt, at the level the outcome deserves, using Phase 1's
bracketed-prefix convention and **never** a value or the `reason` text:

```text
[settings] write org=<orgId> group=<groupKey> store=<store> actor=<actorId>
           keys=<n> changed=<n> risk=<max> outcome=<ok|4xx|5xx> code=<errorCode|-> req=<id> ms=<n>
```

`warn` for `412`, `409 SETTINGS_CONFIRMATION_REQUIRED`, `422`; `error` for `5xx`;
`info` for success. Parent §15.3's counters are satisfied by this one line plus the
existing log pipeline — **no new dependency, no metrics library** (parent is explicit).

---

## 13. Owner-Service Changes

Seven files outside `src/modules/settings/`. Every change is **additive and
behaviour-preserving when the new parameter is absent** — which is the mechanism by
which "every pre-existing payroll and document settings test must pass unmodified"
(parent §16 completion criterion (a)) is achieved.

### 13.1 Signature changes (all backward compatible)

| Owner | Before | After | Compatibility |
|---|---|---|---|
| `payrollSettingsService.update` | `(orgId, patch, actor = {})` | `(orgId, patch, actor = {}, { ifMatch = null } = {})` | 4th arg optional; existing controller passes 3 |
| `statutoryConfigService.updateConfig` | `(orgId, patch, actor = {})` | `(orgId, patch, actor = {}, { ifMatch = null } = {})` | same |
| `documentSettingsService.update` | `(orgId, payload, { actorId, ipAddress, requestId })` | `+ ifMatch = null` in the same options object | new optional property |
| `letterBrandingService.replace` | `(orgId, { actorId, payload, ipAddress, requestId })` | `+ ifMatch = null` | new optional property |
| `organizationService` | `updateOrganizationProfile(actorUser, payload)` | **unchanged signature**, plus a new method (§13.5) | the existing method's contract is preserved exactly |

### 13.2 `payroll_settings.service.update` — DEF-S7

**Verified defect:** `update()` reads with `payrollSettingsRepo.findOrCreate(orgId, {}, t)`
(line 69) and takes **no row lock**, so two concurrent writers both compute their diff
against a pre-interleave snapshot. The document and statutory services both already do
the right thing.

**Fix — three lines, after the `findOrCreate`:**

```js
const current = await payrollSettingsRepo.findOrCreate(orgId, {}, t)
await payrollSettingsRepo.findByOrgId(orgId, { lock: true, transaction: t })   // DEF-S7
assertUpdatedAtMatches(current, ifMatch)                                       // under the lock
```

`findByOrgId(orgId, { lock, transaction })` already supports `lock` — **verified**, no
repository change needed. The lock must be acquired **before** `before = current.toJSON()`
is used for the diff, which is what makes the audit row correct.

> **Note the ordering subtlety:** `findOrCreate` returns the row instance; the
> subsequent locked `findByOrgId` is what acquires `FOR UPDATE`. Compare `ifMatch`
> against the **locked** read's `updated_at`, and recompute `before` from it, so the
> comparison and the diff both rest on the locked row (`T-S58`).

**What is deliberately NOT changed:** the diff at line 99 (`before[key] !== updated[key]`).
Phase 1 §8.3 verified that both sides are DB-typed, so the DECIMAL phantom-diff the
parent predicted does not reproduce. Phase 1 §28.3 item 7 **formally drops** that half
of DEF-S11 from Phase 2's scope. Do not "fix" it; a gratuitous change to a shipped
audit diff is a regression risk with no defect behind it. The same reasoning applies to
`statutory_config.service.js:88`, whose own comment already records it.

### 13.3 `statutory_config.service.updateConfig`

Already locks (`findByOrgId(orgId, {lock:true, transaction:t})`, line 78). Add one line
immediately after it:

```js
assertUpdatedAtMatches(current, ifMatch)
```

No other change. `affected_runs`, `activated_components` and the component-activation
side effect are untouched.

### 13.4 `document_settings.service.update` and `document_letter_branding.service.replace`

Both already take the lock. Add `assertUpdatedAtMatches(current, ifMatch)` (resp.
`assertUpdatedAtMatches(row, ifMatch)`) immediately after the locked read, **before**
any guard runs, so a stale token costs nothing.

**One ordering detail for `document_settings`:** the early-return branch for an empty
change set (lines 197–201) runs **before** the transaction opens and therefore before
any lock. The `ifMatch` check must not be skipped by it. Since the gateway guarantees a
non-empty patch of mutable keys (step 6), the branch is unreachable from the gateway;
nonetheless place the check inside the transaction so correctness does not depend on the
caller.

### 13.5 `organization.service` — DEF-S10 (the Phase 3 blocker)

**Verified defect:** `updateOrganizationProfile` (line 712) issues
`organizationRepository.updateOrganizationProfileFields(orgId, fields, transaction)` —
a blind `UPDATE … WHERE org_id`, with **no lock and no read of the prior row at all**.
Last write wins silently, and there is no before-state for any audit.

**Smallest safe change — extract one new locked method; the existing method delegates to
it and keeps its exact external contract:**

```js
// NEW — the locked core. Returns both states so Phase 3's recorder has a before.
async updateOrganizationProfileFieldsLocked(actorUser, payload, { ifMatch = null } = {}) {
  const orgId = actorUser.orgId
  const fields = { ...payload }
  const transaction = await sequelize.transaction()
  try {
    const locked = await organizationRepository.lockOrganizationProfileByOrgId(orgId, transaction)
    if (!locked) throw new AppError(404, 'Organization profile not found', 'ORG_PROFILE_NOT_FOUND')
    assertUpdatedAtMatches(locked, ifMatch)                       // under the lock
    const before = locked.get({ plain: true })                    // ◀ the before-state Phase 3 needs

    const affected = await organizationRepository.updateOrganizationProfileFields(orgId, fields, transaction)
    if (affected === 0) throw new AppError(404, 'Organization profile not found', 'ORG_PROFILE_NOT_FOUND')
    if (fields.org_name !== undefined) {
      await organizationRepository.updateOrganizationFields(orgId, { name: fields.org_name }, transaction)
    }
    const after = await organizationRepository.findOrganizationProfileByOrgId(orgId, transaction)
    await transaction.commit()
    return { before, row: after }
  } catch (err) {
    if (!transaction.finished) await transaction.rollback()
    throw err
  }
}

// EXISTING — signature, return value and error codes unchanged.
async updateOrganizationProfile(actorUser, payload) {
  await this.updateOrganizationProfileFieldsLocked(actorUser, payload)
  return await this.getOrganizationDetails(actorUser)
}
```

**New repository method (purely additive — no existing signature changes):**

```js
// organization.repository.js
async lockOrganizationProfileByOrgId(orgId, transaction) {
  return await OrganizationProfile.findOne({
    where: { org_id: orgId },
    lock: transaction.LOCK.UPDATE,
    transaction
  })
}
```

`findOrganizationProfileByOrgId(orgId, transaction = null)` takes a **positional**
transaction and has no `lock` option (verified). Adding an options-object overload
would change a signature used elsewhere; a new method does not.

**Behaviour change to `PUT /organizations/profile`:** it now takes a row lock and does
one extra `SELECT`. Response, status codes and error codes are identical. The `404` on a
missing row now fires from the locked pre-read instead of from `affected === 0` — the
same status and the same `errorCode`. **Both existing checks are kept** so a row deleted
between the lock and the update still yields `404`.

**What this unblocks:** Phase 3's `settingsAudit.record` has an `old_value` for
`organization_profiles`. Without it the ledger would record `null → value` for every
edit, including the second one.

### 13.6 DEF-S8 — reconciled (F-P2-3)

**Verified:** `document_hr.routes.js:53` is `router.put('/settings', hrAuth, controller.updateSettings)`
— no `validate()` middleware. But `document_hr.controller.js:305` already calls
`validateOrThrow(schemas.updateSettingsSchema, req.body)`, so the schema **is** applied;
and the shared `validateOrThrow` runs with `stripUnknown: true`, so an unknown key is
dropped rather than rejected.

Therefore:

* Moving the schema to route middleware would change **nothing** observable. The
  parent's §17.3 prediction of a new `422` for typo'd keys is **withdrawn** (F-P2-3),
  and the change record must not repeat it.
* Making it *reject* unknown keys would mean changing `validateOrThrow`'s options for
  this one route — **a real behaviour change to a shipped endpoint, with a frontend
  blast radius, in service of no reported defect.** Out of scope.

**Decision (D-P2-3):** apply DEF-S8 as a **convention alignment only** — add
`validate(schemas.updateSettingsSchema)` to the route and drop the now-redundant
`validateOrThrow` from the controller, matching how payroll does it. Verify by running
the document module's existing settings tests unmodified. If the implementer judges even
this churn unjustified, **skipping it is acceptable** provided §22's change record and
the parent's §20.1 checklist row both record *why* — this is explicitly **not** a
functional requirement of Phase 2. The gateway's own door is unaffected either way,
because §7 makes the gateway run the schema itself.

### 13.7 What is NOT touched in any owner

* No validator schema is edited, extended or relaxed.
* No audit call, action string, entity type or `old_values`/`new_values` shape changes.
* No guard is moved, reordered (except inserting the `ifMatch` check immediately after
  an existing locked read) or weakened.
* No transaction boundary changes: still exactly one transaction per write, opened and
  committed by the owner.
* No existing route path, method, request shape or success response changes.

---

## 14. Authorization & Security

### 14.1 The five gates (parent §9.5), as implemented

| Gate | Mechanism | Verified basis | Test |
|---|---|---|---|
| 1 **Role** | `authorize(['hr'])` on both write routes **and** step 3's `isGroupWritable` against catalog `write_roles` | two independent layers; the catalog layer is what makes widening a role a one-line data change | `T-S15`, `T-S9`, `T-S22` |
| 2 **Entitlement** | step 4, per group, via Phase 1's resolver | **F-P2-2: this is the only entitlement gate on the gateway door** — `requireFeature` is route middleware and never runs inside an owner service | `T-S21` |
| 3 **Allowlist** | step 6 — intersection, not a denylist | closed **by construction**: a key absent from the catalog cannot be written even if the owner's Joi accepts it, and a key the owner does not list as writable cannot be written even if the catalog has it | `T-S16`, `T-S17`, `T-S37` |
| 4 **Concurrency** | `If-Match` required, compared under the owner's row lock | §12.4 | `T-S33`, `T-S34`, `T-S57`, `T-S58` |
| 5 **Confirmation** | step 7 — `confirm: true` + `reason` for `risk: 'high'` | **depends on P2-GATE-1** (§15); with today's catalog it guards one key | `T-S19`, `T-S20` |

### 14.2 Tenant isolation

`orgId` comes from `req.user.orgId` and **nowhere else** — not body, not query, not
params. The write body schemas are `.unknown(false)`, and `values` keys are constrained
to `^[a-z0-9_]{1,80}$` and then intersected with the catalog, so `org_id` is not even a
representable key (it is row metadata, excluded from every catalog by
`ROW_META_KEYS`). `requireActiveOrg` runs on both write routes, so a suspended org
cannot change its configuration. Every adapter `update` takes `orgId` as its first
positional argument and every owner's `WHERE` is `org_id`-scoped against a
`UNIQUE (org_id)` row. There is no cross-org write path, no support override, no admin
bypass. (`T-S8` — a forged `org_id` in the body is rejected by the schema, not merely
ignored.)

### 14.3 Mass assignment

Closed by the intersection (gate 3). The specific classes that must remain unreachable,
each verified:

| Class | Keys | Why unreachable |
|---|---|---|
| Cron watermarks | `last_cutoff_reminder_on`, `last_payday_reminder_on`, `last_auto_draft_on`, `last_tax_declaration_reminder_on` | absent from the catalog **and** absent from `payrollHrValidator.updateSettingsSchema`, so both the allowlist and the owner schema reject them (`T-S17`) |
| Asset / storage keys | `logo_storage_key`, `signature_storage_key`, `superseded_asset_keys`, and the content-type/size columns | absent from `BRANDING_SETTING_KEYS`, hence from `ownerWritableKeys()`; `replaceBrandingSchema` has no such key either; `_mapReplaceFields` writes only its own whitelist (`T-S64`) |
| Org master data | the 16 `organization_profiles` identity fields | in the adapter's `nonSettingKeys`, excluded from the catalog; load-time invariant 11 asserts catalog ∩ `nonSettingKeys` = ∅ at boot |
| Row metadata | `id`, `org_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` | `ROW_META_KEYS`; never in any catalog |
| Deprecated / read-only | `pdf_render_engine` | its group has `write_roles: []` → `405` before the key is even examined (`T-S35`) |

### 14.4 Sensitive settings

**No catalog key is `sensitive: true`** — load-time invariant 11 makes that a boot
failure, so Phase 2 inherits a provably empty sensitive set. Consequences:

* The parent's step-5 rule ("a `sensitive` key present → `422`") is implemented and
  tested, but is currently unreachable. Keep it: the flag exists in `define_entry` and
  the cost is one line.
* **Secrets** (`PAYROLL_ENCRYPTION_KEY`, `RAZORPAY_*`, `PDF_RENDERER_API_KEY`,
  `attendance_devices.api_key_hash`) are not in the catalog, not read and not writable —
  out of scope entirely (parent §3.2.9).
* **`platform_cap` publishes the cap *value*** (OD-P1-4, already decided): it is a
  product limit, not a secret, and without it a UI cannot explain a rejected value.
  Phase 2 does not publish an env var's contents.

### 14.5 Response and log exposure

* `enforcement_hint` is stripped from every entry by `projectEntryForResponse` — never
  sent.
* `reason` is **never echoed** in a response and **never logged** (parent §15.1): it may
  carry business-confidential detail and belongs only in the access-controlled audit
  row.
* No log line contains a setting **value**. The anomaly log in `diffStored` logs key
  **names** only, matching Phase 1's `sliceValues` precedent.
* `details.keys[]` on a `422`/`400` carries key **names**, never values.

### 14.6 Injection

**Not Applicable — Reason:** every write goes through Sequelize with bound parameters
and a column-name allowlist derived from a frozen in-process catalog. No settings key,
value or group key is ever interpolated into SQL. The one raw query on a write path
(`document_settings.service`'s `countActiveHrUsers`) is pre-existing, uses
`replacements`, and is not reached with any gateway-supplied string.

### 14.7 Unauthorized discovery

S-5/S-6 reveal nothing S-1 does not already publish to the same roles: group existence
is public to `hr`/`manager` via the catalog, so a `404 GROUP_NOT_FOUND` on a write leaks
nothing. A non-`hr` token is stopped at the route, before any catalog lookup.

---

## 15. Catalog Data Completion — P2-GATE-1

Phase 2 turns four catalog fields from decoration into **enforcement**: `risk` and
`warnings` drive the confirmation gate, `requires_reason` drives the reason gate, and
`conflicts_with` / `depends_on` are what let a UI avoid provoking a `409`. Three of
those four are currently under-populated (F-P2-5, F-P2-6). Shipping the gates against
the current data would mean shipping a control that guards one key.

**This is catalog data only — no code, no schema, no API shape change.**

### 15.1 Risk reclassification (the gate)

Proposed, from parent §8.7's criterion *"irreversible consequence, changes a
client-visible response class, or alters who may approve money or documents"*:

| Registry | Key | Group | Today | Proposed | Criterion |
|---|---|---|---|---|---|
| #39 | `payroll_require_separate_checker` | `payroll.authority` | medium | **high** | alters who may approve money |
| #40 | `manager_direct_compensation_authority` | `payroll.authority` | medium | **high** | alters who may approve money |
| #59 | `manager_direct_document_authority` | `documents.authority` | medium | **high** | alters who may approve documents |
| #60 | `document_require_separate_checker` | `documents.authority` | medium | **high** | alters who may approve documents |
| #65 | `document_retention_days` | `documents.retention` | medium | **high** | irreversible purge |
| #79 | `document_publish_sync_threshold` | `documents.publishing` | medium | **high** | changes a client-visible response class (already carries a warning) |
| #92 | `letter_auto_issue_on_exit` | `documents.letters` | medium | **high** | issues unreviewed letters automatically |
| #95 | `letter_record_retention_days` | `documents.retention` | **high** | high (unchanged) | irreversible purge |
| #29 | — | — | not in catalog | **stays out** | it is a per-record surface, correctly not a catalog key |

Each newly-`high` key **must** gain at least one `warnings[]` entry — load-time
**invariant 7** enforces it, so a reclassification without a warning fails the boot.
Write the warning from the registry's own `⚠` text where one exists; where none does,
state the consequence in one plain sentence.

`requires_reason` is **derived** (`risk === 'high'` in `define_entry`), so these eight
keys automatically require a `reason` on S-5/S-6. **That is a client obligation** and
must lead the change record alongside `If-Match`.

> **P2-GATE-1 is a product decision, not an engineering one.** It is recorded as
> pre-flight check **P-7** because implementing the gate against an unreviewed
> classification is the one thing in this phase that can be confidently wrong. If
> product rejects the proposal, implement the gate anyway and record the decision — the
> gate's correctness does not depend on how many keys it guards.

### 15.2 Effect timing

`effect_timing` was likewise authored by domain judgement (Phase 1 §30 item 4) and is
the attribute a UI surfaces most prominently. Phase 2 **does not branch on it** — no
gate, no behaviour. Review it in the same pass as §15.1 for correctness, but a wrong
value here misinforms a user rather than mis-enforcing a control, so it does **not**
gate the phase.

### 15.3 Relationships (F-P2-6)

| Field | Populate | Source |
|---|---|---|
| `conflicts_with` | `document_require_separate_checker` ⊕ `manager_direct_document_authority` (**both directions**) | parent §8.6; the owner raises `409 SETTINGS_CONFLICT` on the pair |
| `depends_on` | `document_expiry_reminder_days` → `document_notify_expiry` (#71 only fires when #73 is ON) | parent §8.6 |
| `depends_on_ops` | already correct on `pdf_bulk_inline_miss_threshold` | — |
| `known_errors` | add the owner codes the §10.4 register attributes to a key, where a key maps to one | lets a client pre-explain a likely rejection |

Load-time invariant 4 already asserts every reference resolves, so a typo fails the
boot. Add a symmetry assertion to `T-P2-7`: if `A.conflicts_with` names `B`, then
`B.conflicts_with` must name `A` — a one-sided conflict is a latent UI bug.

**The gateway still evaluates none of these** (parent §8.6): it publishes them, and lets
the owner's `409`/`422` be the answer.

### 15.4 New load-time invariant 12

> A `clearable: false` entry must not have a `null` default — otherwise S-6 would
> resolve a default the owner silently discards, and reset would report success while
> changing nothing.

Currently satisfied (`accent_color_hex` defaults to `'#1F2937'`). Adding the invariant
makes it a boot gate rather than a coincidence.

### 15.5 `catalog_version` bump

`CATALOG_VERSION` moves from `'2026-10-09.1'` to the Phase 2 ship date + `.1`.
Consequences, all already handled by Phase 1's design:

* S-1/S-2 ETags change ⇒ clients revalidate once. Expected.
* S-3/S-4 group ETags change ⇒ **every outstanding `If-Match` token from before the
  deploy becomes stale**, and `parseIfMatch` returns
  `412 … CATALOG_VERSION_CHANGED`. That is the designed, recoverable behaviour: re-fetch
  S-1, re-read S-4, re-submit. It is why the version is in the token.
* During a rolling deploy two instances serve different versions for a few seconds; a
  write can therefore `412` once. **Document this in the change record** and keep the
  deploy window short (§23.3).
* The changes are **purely additive** to the contract: no key renamed or removed, no
  `data_type`, `default`, `range` or `nullable` altered. Only `risk`,
  `requires_reason`, `warnings`, `conflicts_with`, `depends_on`, `known_errors` move.

---

## 16. Caching & Runtime Consistency

**Phase 2 adds no cache (D-S10, parent §11.2).** Phases 1–4 are cache-free and
therefore performance-neutral by construction. Answering the brief's checklist anyway,
because "no cache" is a design decision that has to survive review:

| Question | Answer |
|---|---|
| Cache key structure / scope-aware keys / TTL | **Not Applicable — Reason:** no cache exists. Phase 5's design (`settings:v1:<store>:<orgId>`, 30 s, read-through, post-commit `DEL`) is specified in parent §11.3 and deliberately not built. |
| Read/write behaviour | every read hits Postgres; every write goes through the owner's transaction. |
| Invalidation | **Not Applicable.** "DB updated but cache invalidation failed" and "cache invalidated but DB update failed" are **both impossible in Phase 2**, because there is no cache to be wrong. This is the main reason the parent sequenced writes before caching. |
| Multi-instance consistency | the only per-instance artefact is the **frozen in-process catalog**, which is immutable per deploy and carries `catalog_version` in every payload and every ETag. A client that receives an unexpected version re-fetches S-1. §15.5. |
| Cold cache / fallback / cache failure | **Not Applicable.** |
| Is the database authoritative? | **yes, unconditionally.** |
| What Phase 2 owes Phase 5 | **the signature discipline.** Adapter `read` must keep the shape `read(orgId)` with room for a future `{ transaction }` option, because parent §11.4's one unbreakable rule is *"a cached value must never be served to a read inside a write transaction"* (the document module reads settings **inside** its publish/sync transaction, C-30). Phase 2 must not introduce any new settings read that would be cacheable-but-transactional. **It does not: the gateway opens no transaction and passes none.** |

### 16.1 Runtime behaviour of a write across instances

A settings change takes effect by being in the database — every consumer reads it live
at use time or from a frozen snapshot (D-S8). There is therefore **no propagation step,
no event, and no stale-instance window**. The two exceptions are pre-existing and
unchanged: `payroll_runs.settings_snapshot` (frozen at run CREATE; S-5 *reports* the
affected live runs rather than changing them) and the document publish/sync
in-transaction read (C-30).

---

## 17. Audit, Logging & Observability

### 17.1 Who writes the audit row

**The owner, inside its own transaction. The gateway writes none** (parent §10.1).
Duplicating would create two answers to "who changed this".

| Store | Audit destination | Shape (verified) |
|---|---|---|
| `payroll_settings` | `payroll_audit_logs`, `entity_type='payroll_settings'`, `action='settings.updated'` | one row per request; `old_values`/`new_values` = **changed keys only** |
| `statutory_configs` | `payroll_audit_logs`, `entity_type='statutory_config'` | changed keys only |
| `document_settings` | `document_audit_logs`, `entity_type='document_settings'` | **every submitted key**, changed or not (F-P2-8) |
| `document_letter_branding` | `document_audit_logs`, `entity_type='document_letter_branding'` | **two full DTOs** |
| `organization_profiles` | **nothing** | see §17.3 |

Because the gateway's `changed` is computed independently (from before/after stored
rows), it may legitimately differ from the audit row's key set for `document_settings`.
That is not a defect in either; it is recorded here so Phase 3's reader is not built on
a false premise.

### 17.2 Change attribution

`actorId`, `ipAddress` and `requestId` flow from `ctx(req)` → adapter → the owner's
actor context → the audit row, so a change is traceable from the HTTP request to the
audit row with one identifier. `x-request-id` (falling back to `x-correlation-id`) is
read in the controller, matching Phase 1 and `payroll_hr.controller.actorContext`.

**`reason` is persisted only where the owner has somewhere to put it.** Verified:
`payroll_audit_logs` and `document_audit_logs` both have a `reason` column, but the four
owner settings-update calls **do not currently pass one** — and Phase 2 does not change
their audit payloads (§13.7). So in Phase 2 the `reason` HR types for a high-risk change
is **enforced but not stored**.

That is an honest gap and it must be stated plainly rather than implied away:

* It does **not** weaken the gate — the write is still refused without a reason.
* Phase 3's `settingsAudit.record` has a `reason` column in its contract and is the
  designed home for it.
* Threading `reason` into the four owners' audit calls is a **one-line-per-owner change
  to a shipped audit payload** and is therefore **OD-P2-2**: a deliberate decision, not
  an oversight. **Recommendation: do it** — the gate is close to pointless if the reason
  is discarded, the column already exists, and adding a value to an existing nullable
  column breaks nothing. If product/review declines, the change record must say that a
  high-risk settings reason is collected and not retained.

### 17.3 The `billing.notifications` audit gap (EC-P2-1)

`organization_profiles` has **no audit table**. Phase 3's ledger is what closes it.
Therefore a Phase 2 write to `billing.notifications` (#97/#98) **is not audited**.

This is not a *new* gap — the existing `PUT /organizations/profile` door is equally
unaudited today — but Phase 2 adds a **second** unaudited door to the same two fields.

**Decision (D-P2-4): ship it, and say so.** Withholding the group from S-5 would create
a group that reads as `writable: true` with no catalog signal explaining why a write
fails, which is a worse contract than a documented gap. DEF-S10's locked pre-read
(§13.5) returns the before-state specifically so Phase 3 can close the gap with no
further owner change. This must appear in: the change record, the §27 checklist, and
parent §20.1's Phase 2 gates. Tracked as **OD-P2-3** if review wants it withheld
instead.

### 17.4 Observability

| Signal | Mechanism |
|---|---|
| `settings_write_total{group,outcome}` | the §12.5 log line's `outcome` field |
| `settings_write_blocked_total{group,code}` | the same line's `code` field, at `warn` |
| `settings_high_risk_change_total{setting_key}` | a dedicated `warn` line on a successful write touching a `risk: 'high'` key — **the one signal worth alerting on the same day** (parent §15.4), because #65/#79/#95 are irreversible |
| `settings_read_degraded_total{store}` | Phase 1's existing `console.error` in the read service |

No metrics library, no new dependency, no new log transport (parent §15.3 is explicit).

---

## 18. Error & Failure Handling

### 18.1 Principles

1. **Owner errors propagate verbatim.** Status, `errorCode`, `message` and `details`
   are untouched, so a client that already handles `INSUFFICIENT_CHECKERS` from
   `/documents/hr/settings` works unchanged against the gateway (`T-S36`). The `412` is
   the single exception, and only to **add** `current_etag`.
2. **Fail before the owner wherever possible.** Every gateway gate runs before step 9's
   read, so a rejected request performs **zero** store I/O (`T-S16`, `T-S19`, `T-S44`).
3. **No partial write is possible.** One request → one group → one store → one
   transaction (D-S4), opened and committed by the owner.
4. **Never flatten a `503` into a `403`.** An entitlement outage must not tell a user to
   upgrade (parent §18 F-13).

### 18.2 Scenario register

| # | Scenario | Behaviour | Recovery |
|---|---|---|---|
| F-1 | two `hr` users write the same group concurrently | the row lock serialises; the loser's token no longer matches → `412` with `current_etag`. **No lost update even if the token had been omitted** | re-read S-4, re-submit |
| F-2 | stale client writes with an old ETag | `412` **before any mutation** | one re-read |
| F-3 | the same request retried (double-click, proxy retry) | first succeeds and moves `updated_at`; the retry carries the now-stale token → `412`. **No duplicate apply** | treat `412` after a success as "already applied"; re-read to confirm |
| F-4 | Postgres unreachable mid-write | the owner's transaction never commits; nothing partial | retry — safe under `If-Match` |
| F-5 | owner guard rejects (`409`/`422`) | nothing written; the error names the key and the bound | fix the value |
| F-6 | gateway gate rejects | nothing read, nothing written | fix the request |
| F-7 | entitlement DB outage | `503 ENTITLEMENT_DEPENDENCY_FAILURE` propagates | transient; retry |
| F-8 | step 9's pre-read fails | the rejection propagates (S-5 is targeted and does not degrade, matching S-4) | retry |
| F-9 | a downstream side effect inside the owner's transaction fails (e.g. statutory component activation) | the whole write rolls back | retry |
| F-10 | `organization_profiles` row missing | `404 ORG_PROFILE_NOT_FOUND` from the locked pre-read; the adapter never provisions one | data anomaly — investigate; the row is created at registration |
| F-11 | catalog malformed after a bad edit (e.g. a new `high` key with no warning) | **the process fails to boot** — invariant 7 | the deploy fails rather than serving a wrong gate; revert |
| F-12 | `catalog_version` changed under a client mid-edit | `412 … CATALOG_VERSION_CHANGED` | re-fetch S-1 → S-4 → re-submit |
| F-13 | a setting is read by another module while being written | the reader sees the pre- or post-commit row; both valid. Document publish/sync reads **inside its own transaction** (C-30) and is unaffected | none needed |
| F-14 | a settings change lands mid-payroll-run | the run keeps its frozen `settings_snapshot`; S-5 reports the affected runs in `impact.affected_runs` | if the change must apply, the run is deleted and recreated — existing payroll behaviour, now surfaced at the moment of the edit |
| F-15 | irreversible change applied by mistake (#65/#79/#95) | `confirm` + `reason` were required and the high-risk log line fired | **turning the setting back does not restore purged evidence.** The gate plus the alert are the whole mitigation, and this plan says so rather than implying recovery exists |
| F-16 | #39/#60 enabled, then the HR pool drops to one | the pool check is point-in-time, not a constraint; the approval queue stalls | turn the flag off or activate a second HR user. **Pre-existing in both owners; Q-S9; not fixed here** |
| F-17 | an owner adds a writable key without a catalog entry | **`T-S2` fails in CI** | add the catalog entry. This is the mechanism that keeps the catalog honest over years |
| F-18 | an owner adds a key to its Joi schema but not to its mutable-field list | **`T-P2-1` fails in CI** (schema keys ≡ `ownerWritableKeys()`) | reconcile the two |

### 18.3 Edge cases specific to Phase 2

| ID | Case | Handling |
|---|---|---|
| EC-P2-1 | a `billing.notifications` write is unaudited | §17.3 — documented gap, closed by Phase 3 |
| EC-P2-2 | resubmitting an identical patch | `200`, `changed: {}`, every key in `unchanged_keys`, **new ETag** (§12.4). Not an error |
| EC-P2-3 | `accent_color_hex: null` | the owner silently drops the key; `changed` (built from the re-read row) correctly reports **no change** and the key lands in `unchanged_keys` (`T-S61`) |
| EC-P2-4 | 7 `registered_address_lines` submitted | Joi caps at 5 → `400 VALIDATION_ERROR`. If a future schema allows more, the owner truncates to 5 and `changed` reports the **stored 5** (`T-S61`). Either way the response never echoes the patch |
| EC-P2-5 | `document_expiry_reminder_days: [7,7,1]` | the owner de-duplicates and sorts descending → stored `[7,1]`. `changed.to` is `[7,1]`, not the submission. The comparator is **order-sensitive**, so `[1,7]` → `[7,1]` *is* a change |
| EC-P2-6 | a nullable key cleared to `null` | stored `null`; `changed` shows `{from: <v>, to: null}`. The gateway does **not** resolve `inherits_from` (D-P1-6) |
| EC-P2-7 | branding's post-write re-read happens **after commit**, outside the transaction (verified line 210) | a concurrent write committing in that window would make `changed` reflect the other actor's value. **The owner's audit row is still correct** (it uses the in-transaction `before` + `changes`). Accepted, not fixed: fixing it means restructuring a shipped method, and `If-Match` makes the interleave require a second writer who acquired the lock after us — i.e. a genuinely later state, which is arguably the more useful thing to report. Documented, not hidden |
| EC-P2-8 | S-3's **top-level** `etag` used as `If-Match` | it is `max(updated_at)` across stores, not a group token, so it will usually mismatch → `412`. Safe but confusing. **The change record must say: use the per-group `etag`** |
| EC-P2-9 | a group with `featureKey: null` (`billing.notifications`) | entitlement resolves to `true` (D-P1-2); the route guards still apply. No billing feature key is invented |
| EC-P2-10 | `values: {}` | `422 NO_WRITABLE_KEYS` at step 6, before the owner's `.min(1)` would have produced a less specific `400` |
| EC-P2-11 | `__proto__` / `constructor` in `values` | unrepresentable: the envelope's key pattern rejects it, and the allowlist is an own-property `Map` lookup (`T-P2-6`) |

---

## 19. Concurrency, Idempotency & Retry

### 19.1 The concurrency model, end to end

| Step | Mechanism |
|---|---|
| token minted | S-4 (and S-3's per-group entry) returns `etag = W/"<catalog_version>:<updated_at ISO>"` |
| token required | S-5/S-6 reject a missing token with `400 SETTINGS_IF_MATCH_REQUIRED` |
| token checked | **after** the owner acquires `SELECT … FOR UPDATE** on the singleton row |
| why after the lock | a competing write has either not started (token matches) or has committed (lock released, `updated_at` moved, token no longer matches). There is no third state |
| lost update | impossible: the lock serialises, and the loser's token is stale |
| same-tick collision (EC-S4) | two commits in the same microsecond mint the same token. Accepted: the failure mode is a **spurious `412`**, never a lost update |

After Phase 2, all five stores lock on write. Before it, two did not (DEF-S7, DEF-S10).

### 19.2 Idempotency

* S-1…S-4, S-7…S-9 are `GET` — naturally idempotent.
* **S-5 is `PUT` + `If-Match`.** A retry with the same token is **refused (`412`) if the
  first attempt succeeded** and **succeeds if it did not**. That is exactly the desired
  semantics and is why `PUT` was chosen over `POST`: **no idempotency-key table, no
  header, no de-duplication store** (parent §12.3). The client's rule is: a `412`
  immediately after a timeout means "re-read before deciding" — not "retry blindly".
* **S-6 is `POST`** only because it carries a body shape `PUT` cannot express
  (`keys[]`). It is **semantically idempotent** — resetting to a default twice yields the
  same state — and the `If-Match` gate still prevents a double-apply over a concurrent
  change.
* `assertUpdatedAtMatches` with `ifMatch === null` is a no-op, so the owners' own doors
  remain exactly as idempotent (or not) as they are today. **Phase 2 does not make
  `If-Match` required on any existing endpoint.**

### 19.3 Partial updates

Partial by design: `values` names only the keys to change; absent keys are untouched. No
key is ever defaulted into a patch (hence `noDefaults`, §7.3), so "partial" means
exactly what it says. There is no full-replace mode, and `document_letter_branding`'s
`replace()` is a misnomer — verified: `_mapReplaceFields` copies only keys the payload
actually carries.

---

## 20. Implementation Sequence

Dependency-ordered. Each step names its verification; do not advance on an unverified
step.

| Step | Work | Verify |
|---|---|---|
| **0** | **Pre-flight §2 (P-0…P-7).** Record the suite baseline. | all eight pass; **P-7 answered in writing** |
| **1** | `src/common/utilities/if_match.utils.js` + its unit test. | `assertUpdatedAtMatches` is a no-op for `null`/`undefined`, throws `412` with `current_updated_at` on mismatch, normalises `Date` and ISO-string inputs identically |
| **2** | `settings_etag.utils.parseIfMatch`. | `T-S33` (missing → 400), malformed → 400, version drift → 412 `CATALOG_VERSION_CHANGED`, `*` rejected, happy path returns the bare ISO |
| **3** | `settings_patch.utils` (pure) + tests. | bounds, intersection, reason/confirm policy, `resolveDefaults`, `diffStored` — all table-driven, **no I/O** |
| **4** | `settings_owner_validation.utils` + tests. | `noDefaults` proven on `replaceBrandingSchema` (**this is the test that would have caught the address-wipe**); unknown key → `400` with `keys[]`; `convert` coerces `"7"` → `7` |
| **5** | **Catalog data pass (§15)** — risk, warnings, relationships, invariant 12, `CATALOG_VERSION` bump. | `catalog_structure` + `catalog_drift` green; invariant 7 proven to fail on a `high` key with no warning; `T-P2-7` conflict symmetry; `T-S12` risk snapshot updated **deliberately** |
| **6** | **Owner changes, one owner at a time, each with the owner's own suite re-run.** Order: statutory → document_settings → branding (all three already lock, so these are one-line insertions) → **payroll (DEF-S7)** → **organization (DEF-S10)**. | after each: that module's existing tests pass **unmodified**; `T-S43` (payroll lock), `T-S58` (token compared against the locked row), `T-S63` (org locked pre-read + before-state) |
| **7** | `adapters/*.adapter.js` — `update`, `ownerSchema`, `auditSource`; switch the org adapter to the service. Update **T-P1-4**. | `T-S37` (one owner call, exact patch), `T-S64` (branding: no asset column), `T-P2-1` (schema keys ≡ `ownerWritableKeys`), adapters still frozen |
| **8** | `settings_write.service.js`. | `T-S16`, `T-S17`, `T-S19`–`T-S21`, `T-S34`–`T-S42`, `T-S57` — every rejection asserts the owner was **not called** |
| **9** | Validators + controller + routes. | `T-S9`, `T-S15`, `T-S22`, `T-S44`, `T-P2-6`; `405` on `payroll.deprecated`; route ordering does not shadow S-4 |
| **10** | Full suite. | **baseline + the new Phase 2 assertions, 0 fail**; the only pre-existing test changed is `T-P1-4`, for the reason in §3.3 |
| **11** | DEF-S8 convention alignment (§13.6) — or a recorded decision to skip. | the document module's settings tests pass unmodified |
| **12** | Documentation §22. | all three artefacts written; change record **leads with `If-Match` and the new `reason` requirement** |

Steps 1–4 are pure and testable with no stubs; step 5 is data; step 6 is the only step
that touches another module's behaviour and is therefore deliberately split per owner
with a suite run between each.

---

## 21. Testing Strategy

All tests are `node:test` + `assert/strict` under `tests/unit/settings/`, matching the
`npm test` glob (`tests/unit/**/*.test.js`). **No test touches a database** — the
standing constraint. Owners are stubbed at the **service boundary**, which is exactly
the seam the gateway talks to, using Phase 1's `withStub` / `harness` save-replace-restore
pattern.

### 21.1 New files

| File | Covers |
|---|---|
| `write_service.test.js` | the S-5/S-6 pipeline, every gate, every rejection's "owner not called" |
| `patch_utils.test.js` | the pure functions (bounds, intersection, policy, defaults, diff) |
| `owner_validation.test.js` | §7.3's four options, especially `noDefaults` |
| `if_match.test.js` | `parseIfMatch` + `assertUpdatedAtMatches` |
| `owner_lock_contract.test.js` | `T-S43`, `T-S58`, `T-S63` — the lock and before-state assertions on the owners |
| *(extended)* `adapters_contract.test.js` | `update` contract, `T-S37`, `T-S64`, `T-P2-1`, **T-P1-4 revision** |
| *(extended)* `catalog_structure.test.js` | invariant 12, `T-P2-7` conflict symmetry, `T-S12` risk snapshot |

### 21.2 Unit tests — gateway logic

| ID | Test |
|---|---|
| `T-S16` | an unknown key in `values` → `422 SETTING_NOT_WRITABLE`, and **the owner's update is never called** |
| `T-S17` | a cron watermark (`last_cutoff_reminder_on`) → `422`, owner not called |
| `T-S19` | a `risk:'high'` key without `confirm` → `409 SETTINGS_CONFIRMATION_REQUIRED` with `warnings[]` verbatim; owner not called |
| `T-S20` | a `risk:'high'` key without `reason` → `422 SETTINGS_REASON_REQUIRED`; owner not called |
| `T-S21` | a write to an unentitled group → `403 FEATURE_NOT_AVAILABLE`; owner not called |
| `T-S33` | missing `If-Match` → `400 SETTINGS_IF_MATCH_REQUIRED` |
| `T-S34` | the owner's `412` is re-raised with `details.current_etag` composed from `current_updated_at` |
| `T-S35` | `payroll.deprecated` → `405 SETTINGS_GROUP_READ_ONLY` (**before** any key check) |
| `T-S36` | all five owner guard codes — `INSUFFICIENT_CHECKERS`, `SETTINGS_CONFLICT`, `SCAN_PROVIDER_NOT_CONFIGURED`, `INVALID_PAYOUT_COMPONENT`, `SETTING_OUT_OF_RANGE` — propagate with status, code, message **and `details`** unchanged |
| `T-S37` | the adapter calls the owner's update **exactly once**, with **exactly** the intersected patch — no extra key, no dropped key, no reordering of semantics |
| `T-S38` | `changed` holds only keys whose stored value differed; identical submissions land in `unchanged_keys` |
| `T-S39` | `impact` is passed through when the owner returns one and **absent** when it does not |
| `T-S40` | S-6 resolves catalog defaults and runs the identical pipeline — a high-risk reset still needs `confirm` |
| `T-S41` | S-6 on a `resettable: false` entry → `422 SETTING_NOT_RESETTABLE` |
| `T-S42` | S-6 on a `null`-means-inherit key writes `null`, and the response reports `null` (no inheritance resolution) |
| `T-S44` | body bounds — 61 keys / depth 3 / >64 KB each → `422 SETTINGS_PAYLOAD_INVALID`, owner not called |
| `T-S59` | the comparator (inherited from Phase 1; re-asserted at the write seam): `valuesEqual('2.00', 2.00, 'decimal')` true, `('2.00', 2.50)` false, `([7,1],[1,7],'array')` false, `(null, 0, 'integer')` false |
| `T-S60` | resubmitting a DECIMAL key with its stored value yields `changed: {}` and the key in `unchanged_keys` |
| `T-S61` | **#104 normalisation:** a `null` `accent_color_hex` lands in `unchanged_keys`; a truncated `registered_address_lines` reports the **stored** value — `changed` is built from the re-read row, never echoed |
| `T-S64` | the branding adapter calls `replace` once with only intersected catalog keys and **never** an asset column or storage key |
| `T-P2-1` | per adapter: `Object.keys(ownerSchema.describe().keys)` ≡ `ownerWritableKeys()` |
| `T-P2-2` | **`noDefaults`:** validating `{letterhead_enabled:true}` against `replaceBrandingSchema` yields **no** `registered_address_lines` key |
| `T-P2-3` | `parseIfMatch` rejects `*`, a bare ISO, a strong ETag, and a wrong `catalog_version` (the last → `412`, not `400`) |
| `T-P2-4` | a successful write touching a `risk:'high'` key emits the high-risk `warn` line and **no** log line contains the `reason` text or any value |
| `T-P2-5` | the response contains no `reason`, no `enforcement_hint`, no asset/storage key, no row-metadata key |
| `T-P2-6` | `__proto__`, `constructor`, `hasOwnProperty` in `values` → rejected by the envelope; the allowlist's own-property lookup cannot resolve them |
| `T-P2-7` | catalog: `conflicts_with` is symmetric; every `high` key has `warnings` and `requires_reason`; invariant 12 holds |

### 21.3 Security tests

| ID | Test |
|---|---|
| `T-S8` | `orgId` is never sourced from body/query/params — a forged `org_id` in `values` is rejected by the envelope pattern, not silently ignored; plus a static scan of `src/modules/settings/**` for `req.body.org`/`req.params.org`/`req.query.org` |
| `T-S9` | `admin` and `super-admin` → `403` on **both** write endpoints |
| `T-S15` | a `manager` write to any group → `403` (route-level), and `isGroupWritable('manager')` is false for all 26 groups |
| `T-S22` | an `employee` token → `403` on both write endpoints |
| `T-S18` | no `sensitive` key appears in any S-5/S-6 response — currently vacuous (the set is empty by invariant 11) and asserted as such, so it becomes meaningful the day a key is marked sensitive |
| `T-S1` | **static scan (strengthened):** no file under `src/modules/settings/**` requires a model, requires `models.index`, or calls `.create(`/`.update(`/`.destroy(`/`.bulkCreate(`/`.upsert(` on anything other than an owner **service** |

### 21.4 Concurrency tests (no DB — the repository/service seam is stubbed to simulate interleaving)

| ID | Test |
|---|---|
| `T-S57` | two sequential writes with the same token: the first succeeds, the second `412` |
| `T-S58` | the token is compared against the **locked** read's `updated_at`, not a pre-lock read's — proven by stubbing the locked read to return a different `updated_at` than the unlocked one |
| `T-S43` | **DEF-S7:** `payroll_settings.service.update` calls `findByOrgId(orgId, { lock: true, transaction })` before the diff is computed (asserted on the repository call, with the argument) |
| `T-S63` | **DEF-S10:** the org profile update performs a **locked** read before its `UPDATE`, and the `before` it returns is the locked row's state |
| `T-P2-8` | a retry carrying a token the first attempt consumed → `412`, and the owner's update is called **exactly once across both attempts** |

### 21.5 Regression tests — the proof the owners were not altered

The single most important acceptance signal:

> **Every pre-existing payroll, document and organization test must pass with zero
> modification.** No test file outside `tests/unit/settings/` may be edited. The only
> settings test that changes is `T-P1-4` (§3.3).

Run per owner during Step 6, not only at the end, so a regression is attributable to one
owner change.

### 21.6 Integration / DB tests

**Not Applicable — Reason: the standing constraint forbids database access from here.**
Row locking (`FOR UPDATE`), `CHECK` constraint rejection, and `updated_at` tick
behaviour need a database. They are covered instead by:

| Mechanism | Covers |
|---|---|
| static assertions that the lock option is passed, with its arguments (`T-S43`, `T-S58`, `T-S63`) | that the lock is requested |
| the owners' existing, unmodified suites | that the surrounding behaviour did not change |
| **the §23.5 operator smoke checklist** | what only a database can prove |

**No claim of DB-level verification will be made without the operator running it.**

---

## 22. Documentation Deliverables

Three artefacts, all required by parent §7.11/§7.12 and by the standing project
instruction. A phase is not complete with two of three.

| # | Artefact | Content |
|---|---|---|
| 1 | **`public/md_updates/<YYYY-MM-DD>_settings_module_write_apis.md`** (matching Phase 1's actual `<date>_<slug>.md` naming, not the parent's `<slug>_<date>.md` sketch) | **Leads with the two hard client obligations:** (a) **`If-Match` is mandatory** on S-5/S-6 — where to get the token (the **per-group** `etag`, **not** S-3's top-level one), what `412` means, and that `412` after a timeout means "re-read, do not retry blindly"; (b) **`reason` is now required** for the keys promoted to `risk:'high'` by §15.1, with the list. Then: the two endpoints; the full error register (§10.4) including **the first `412` in this API**; `changed` vs `unchanged_keys` vs `non_default_keys`; the three branding normalisations; `impact` (statutory only, with the real `affected_runs` field names); that a no-op write still returns a **new ETag**; the `catalog_version` bump and the one-time `412` window during a rolling deploy; **and the §17.3 statement that a `billing.notifications` change is not yet audited.** Breaking changes to existing endpoints: **none** (and the parent's predicted document-settings `422` is explicitly withdrawn — F-P2-3). |
| 2 | **`public/md_system/api_registry.md`** | rows **#246**, **#247** appended to the existing `## Settings Module` section, with the heading updated to cover Phase 2. Re-check the max row number first (it was **#245**). 13 columns, same format as #242–#245. |
| 3 | **`public/md_settings/combined_api_analysis.md`** | new S-5/S-6 sections in the established per-endpoint shape (purpose, method, route, auth, request, detailed function, error handling, response shape). Plus: an `If-Match` subsection under the shared conventions, and a *write-path retry guidance* block beside the existing read-path one. Written **incrementally** — do not describe S-7/S-8/S-9. |

Also update in place: the Phase 1 plan's §30 is **not** edited (it is a historical
record); this document's own §28.3-equivalent (§28.3 below) carries Phase 3's entry
criteria.

---

## 23. Migration & Deployment

### 23.1 Migration

**None.** Phase 2 adds no table, column, index or constraint, so there is nothing to run
and nothing to hand back. Phase 3 is the DB-gated phase (migration `00073`), and that
migration **must not be merged** before the operator is ready, because the deployment
pipeline runs migrations automatically on deploy.

### 23.2 Default-value initialisation

**None, deliberately** (parent §17.2). The singletons are created lazily by
`getOrCreate`/`findOrCreate` on first access with their column defaults;
`organization_profiles` rows already exist for every org; the catalog ships with the
code, so "initialising defaults" is a deploy, not a data operation. **The Settings module
must not seed a settings row** — it would defeat the lazy-provisioning design and create
rows for orgs that never open the page.

### 23.3 Deployment sequence and the rolling-deploy window

| Step | Action | Reversible |
|---|---|---|
| 1 | Deploy Phase 2 (two additive routes, five additive owner parameters, one catalog version bump) | **yes** — revert the commit |

Two instance-version concerns, both bounded:

1. **Catalog version skew.** During the rollout, old instances serve
   `catalog_version: 2026-10-09.1` and new ones the Phase 2 version. A client holding an
   old token that lands on a new instance gets `412 … CATALOG_VERSION_CHANGED` and
   recovers in one re-read. A client on an old instance cannot reach S-5 at all (`404`
   from the router), which is the correct answer for an endpoint that does not exist
   there yet. **Keep the rollout window short**; nothing is corrupted by a long one.
2. **Owner-signature skew.** The `ifMatch` parameter is optional on every owner method,
   so an old instance calling a new service and a new instance calling an old one both
   behave exactly as today. **There is no state in which one instance understands the
   settings contract and another cannot** — the only asymmetry is "the write endpoint
   exists or it does not".

No cache to invalidate on deploy (Phase 2 is cache-free), no config bootstrapping, no
feature flag.

### 23.4 Rollback

Revert the code. Because no schema changed and no data was migrated, a revert is
complete and instantaneous in effect:

* S-5/S-6 disappear (`404`); S-1…S-4 keep working.
* Every value written through the gateway **stays** — it was written by the owner's own
  service into the owner's own column, and the owner's own endpoint can still change it.
  **No orphaned or unreadable state is possible.**
* The owners lose the `ifMatch` parameter and the two new locks. Losing a lock is a
  reversion to the pre-existing (defective) behaviour, not a new defect.
* The `catalog_version` reverts, so clients revalidate once more.

Reverting Phase 2 while Phase 3 is live is **not** supported: Phase 3's recorder depends
on DEF-S10's before-state. Revert Phase 3 first.

### 23.5 Operator smoke checklist (the DB-level facts no unit test can prove)

Hand this to the operator with the release. It is **verification, not a deploy step**,
and nothing in it is claimed as done by this plan.

1. `PUT /api/v1/settings/groups/payroll.calendar` with a fresh `If-Match` from
   `GET /api/v1/settings/groups/payroll.calendar` → `200`, and the response `etag`
   differs from the one sent.
2. Re-send the **same** request → `412 SETTINGS_PRECONDITION_FAILED`, with
   `details.current_etag` equal to the previous response's `etag`.
3. Send with no `If-Match` → `400 SETTINGS_IF_MATCH_REQUIRED`.
4. `PUT …/groups/payroll.deprecated` → `405 SETTINGS_GROUP_READ_ONLY`.
5. A write touching a `risk:'high'` key without `confirm` → `409`; with
   `confirm: true` but no `reason` → `422`; with both → `200`.
6. `PUT …/groups/documents.branding` with `{ "letterhead_enabled": true }` only, then
   `GET` the group → **`registered_address_lines` is unchanged.** *(This is the
   `noDefaults` proof; a failure here means §7.3 was not implemented.)*
7. Confirm a `payroll_audit_logs` row with `entity_type='payroll_settings'` exists for
   step 1 and that its `old_values`/`new_values` name only the changed key.
8. Confirm the pre-existing door still works unchanged:
   `PUT /api/v1/payroll/hr/settings` and `PUT /api/v1/organizations/profile` with no
   `If-Match` → `200`.

---

## 24. Backward Compatibility

| Surface | Status |
|---|---|
| S-1…S-4 (#242–#245) | **paths, methods, request shapes and response shapes unchanged.** The only payload movement is additive catalog metadata (`risk`, `warnings`, `conflicts_with`, `depends_on`, `known_errors`) and the new `catalog_version` string. `writable`, which Phase 1 documented as *advisory*, becomes authoritative — its value for `hr`/`manager` does not change |
| `PUT /api/v1/payroll/hr/settings`, `PUT /api/v1/payroll/hr/statutory/config`, `PUT /api/v1/documents/hr/settings`, `PUT /api/v1/documents/hr/letter-branding`, `PUT /api/v1/organizations/profile` | **unchanged contracts.** Same paths, same bodies, same success responses, same error codes. `If-Match` is **not** required on any of them (`assertUpdatedAtMatches(row, null)` is a no-op) |
| Behavioural changes to those five endpoints | **two, both invisible to a client:** `payroll_settings` now takes a row lock before its diff (DEF-S7), and the org profile update now takes a locked pre-read (DEF-S10) with one extra `SELECT`. Both make a previously-possible lost update impossible. Neither changes a status, code, message or response field |
| Owner error codes | propagated verbatim, so a client that already handles `INSUFFICIENT_CHECKERS` works against **both** doors |
| Owner audit rows | shape, action strings and entity types unchanged. *(If OD-P2-2 is accepted, the existing nullable `reason` column gains a value on gateway writes — additive.)* |
| Database | no schema change, no data migration, no backfill |
| Forward compatibility for clients | clients must tolerate **new** groups, keys and metadata fields appearing without a client change, and must not hard-code the group list — stated in Phase 1's change record and restated here |
| The parent's one predicted breaking change (document settings `422`) | **withdrawn — F-P2-3.** It does not occur |

---

## 25. Feature Traceability Matrix

Requirement → Existing Dependency → DB Impact → API Impact → Business Logic → Validation
→ Authorization → Cache/Runtime → Failure Handling → Testing → Acceptance.

| Requirement (parent §) | Existing dependency | DB | API | Business logic | Validation | Authz | Cache/runtime | Failure | Tests | AC |
|---|---|---|---|---|---|---|---|---|---|---|
| **S-5 partial update** (§7.6) | 5 owner update methods; Phase 1 catalog/adapters/ETag | none | `PUT` #246 | §10.2 pipeline | envelope Joi + **owner Joi at the gateway** (§7) | `hr`; `write_roles`; entitlement | none; DB authoritative | owner errors verbatim; no partial write | `T-S16`–`T-S44`, `T-S59`–`T-S64` | AC-P2-1,2,3 |
| **S-6 reset** (§7.7) | catalog `default`, `resettable` | none | `POST` #247 | identical pipeline, `values` from defaults | `keys[]` bounded; `resettable` gate | same as S-5 | none | same | `T-S40`–`T-S42` | AC-P2-4 |
| **Allowlist / mass assignment** (§9.3) | `ownerWritableKeys`, `nonSettingKeys`, catalog | none | `422 SETTING_NOT_WRITABLE` | intersection, never a strip | pre-Joi | gate 3 | n/a | owner not called | `T-S16`, `T-S17`, `T-S37` | AC-P2-5 |
| **Optimistic concurrency** (§12.2) | `updated_at` on all 5 models (verified) | none | `If-Match`; `400`/`412` | parse at gateway, compare under the owner's lock | token format | gate 4 | n/a | `412` + `current_etag`, pre-mutation | `T-S33`,`T-S34`,`T-S57`,`T-S58`,`T-P2-3`,`T-P2-8` | AC-P2-6 |
| **High-risk confirmation** (§9.5) | catalog `risk`, `warnings`, `requires_reason` | none | `409`/`422` | step 7 | — | gate 5 | n/a | owner not called | `T-S19`,`T-S20`,`T-P2-7` | AC-P2-7 + **P2-GATE-1** |
| **Owner-validation boundary** (**F-P2-1**) | the 5 exported Joi schemas | none | `400 VALIDATION_ERROR` | run the owner's own object | 4 fixed options, `noDefaults` critical | — | n/a | identical code to the module door | `T-P2-1`,`T-P2-2` | AC-P2-8 |
| **DEF-S7** (§12.1) | `payrollSettingsRepo.findByOrgId({lock})` | none | none | locked read before the diff | — | — | n/a | lost update impossible | `T-S43` | AC-P2-9 |
| **DEF-S10** (§12.1) | new `lockOrganizationProfileByOrgId` | none | none | locked pre-read + before-state | — | — | n/a | `404` preserved on both paths | `T-S63` | AC-P2-10 |
| **DEF-S12** (§8.6) | `replace()` + its re-read | none | `changed` from the stored row | never echo the patch | — | — | n/a | EC-P2-3/4/7 | `T-S61`,`T-S64` | AC-P2-11 |
| **DEF-S8** (§16) | `document_hr.routes` | none | none | convention alignment, **no behaviour change** | — | — | n/a | n/a | existing doc tests | AC-P2-12 |
| **DEF-S11** | Phase 1's `valuesEqual` | none | `changed`/`unchanged_keys` | one comparator, no `!==` | — | — | n/a | n/a | `T-S59`,`T-S60` | AC-P2-13 |
| **Audit** (§10) | owners' in-transaction recorders | none | none | gateway writes none | — | — | n/a | recorder failure rolls the write back | existing owner tests | AC-P2-14 |
| **Catalog data** (§8.6/§8.7) | `define_entry`, invariants 4/7/12 | none | additive metadata | data only | boot-time invariants | — | version bump | malformed ⇒ no boot | `T-S12`,`T-P2-7` | AC-P2-15 |
| **Observability** (§15) | existing log pipeline | none | none | one line per write | — | — | n/a | n/a | `T-P2-4` | AC-P2-16 |
| **Docs** (§7.11/§7.12) | `md_updates`, `api_registry`, `combined_api_analysis` | none | — | — | — | — | — | — | manual | AC-P2-17 |

---

## 26. Phase 2 Acceptance Criteria

| ID | Criterion | How it is proven |
|---|---|---|
| **AC-P2-1** | S-5 updates one group through the owner, returns the full post-write group, `changed`, `unchanged_keys`, `non_default_keys`, the new `etag` | `T-S37`, `T-S38` |
| **AC-P2-2** | Every gateway rejection occurs **with zero store I/O** | `T-S16`, `T-S17`, `T-S19`–`T-S21`, `T-S44` each assert the owner stub's call count is 0 |
| **AC-P2-3** | All five owner guard codes reach the client unchanged — status, `errorCode`, `message`, `details` | `T-S36` |
| **AC-P2-4** | S-6 resolves catalog defaults and runs the identical pipeline; a high-risk reset still needs `confirm`; a `null`-inherit key resets to `null` | `T-S40`–`T-S42` |
| **AC-P2-5** | No unknown, non-writable, watermark, asset or master-data key is writable through the gateway, and unknown keys are **rejected, never stripped** | `T-S16`, `T-S17`, `T-S64`, invariant 11 at boot |
| **AC-P2-6** | `If-Match` is mandatory, compared **under the owner's row lock**, and a `412` carries `current_etag` | `T-S33`, `T-S34`, `T-S57`, `T-S58`, `T-P2-3` |
| **AC-P2-7** | A `risk:'high'` key cannot be changed without `confirm: true` **and** a non-blank `reason`; `warnings` are returned verbatim | `T-S19`, `T-S20` |
| **AC-P2-8** | **The owner's own Joi schema runs on every gateway write**, with `noDefaults`, and the schema's key set equals the write allowlist | `T-P2-1`, `T-P2-2` |
| **AC-P2-9** | **DEF-S7 fixed** — `payroll_settings.service.update` acquires `FOR UPDATE` before computing its diff | `T-S43` |
| **AC-P2-10** | **DEF-S10 fixed** — the org profile update reads the prior row under a lock, compares `If-Match` against it, and returns the before-state. **Phase 3 is unblocked** | `T-S63` |
| **AC-P2-11** | **DEF-S12 covered** — `changed` is built from the re-read row; the three branding normalisations report stored values; no asset column is writable and no storage key appears in any response | `T-S61`, `T-S64`, `T-P2-5` |
| **AC-P2-12** | **DEF-S8** applied as a no-behaviour-change convention alignment, **or** skipped with the reason recorded | document module's existing settings tests pass unmodified |
| **AC-P2-13** | **DEF-S11** — exactly one comparator serves `non_default_keys`, `changed`/`unchanged_keys` and `T-S2`; no `!==` on a DECIMAL anywhere in the gateway; the shipped owner diffs are **not** changed | `T-S59`, `T-S60`; grep for a second comparator |
| **AC-P2-14** | The gateway writes **no** audit row, opens **no** transaction, and requires **no** model | `T-S1` static scan; no `models/` directory; `MODEL_ROOTS` untouched |
| **AC-P2-15** | The catalog's `risk`/`warnings`/relationship data is reviewed and complete; invariants 4, 7 and 12 hold at boot; `catalog_version` bumped | `T-S12`, `T-P2-7`, `catalog_structure` |
| **AC-P2-16** | One structured log line per write, with no value and no `reason` text; high-risk successes are logged at `warn` | `T-P2-4` |
| **AC-P2-17** | All three documentation artefacts written (§22), the change record **leading with `If-Match` and the new `reason` requirement** | review |
| **AC-P2-18** | **Every pre-existing test passes unmodified.** The only test file changed outside new ones is `adapters_contract.test.js` (`T-P1-4`), for the reason in §3.3 | `npm test` vs the Step-0 baseline; `git diff --stat tests/` |
| **AC-P2-19** | `src/app.js` is **not** modified by Phase 2; no new dependency in `package.json`; no new env var | `git diff` |

---

## 27. Production Readiness Checklist

Mirrors parent §20.1's Phase 2 gates, with the corrections this plan establishes.

**Correctness**
- [ ] unknown / watermark / non-mutable keys → `422` with the owner never called (`T-S16`, `T-S17`, `T-S37`)
- [ ] missing / stale `If-Match` → `400` / `412` with `current_etag` (`T-S33`, `T-S34`)
- [ ] high-risk without `confirm` or `reason` → `409` / `422`, no write (`T-S19`, `T-S20`)
- [ ] all five owner guard codes propagate unchanged (`T-S36`)
- [ ] **the owner's Joi schema runs on every gateway write, with `noDefaults`** (`T-P2-1`, `T-P2-2`) — **F-P2-1**
- [ ] `changed` built from the re-read row, never the patch (`T-S61`)

**Defects**
- [ ] **DEF-S7 fixed** — `FOR UPDATE` before the diff in `payroll_settings.service.update` (`T-S43`)
- [ ] **DEF-S10 fixed** — locked pre-read, `If-Match` compared against the locked row, before-state captured (`T-S63`). **Phase 3 is blocked until this is true**
- [ ] **DEF-S11** — one comparator; `payroll_settings.service.js:99` **deliberately left alone** (Phase 1 §8.3/§28.3 item 7)
- [ ] **DEF-S12 covered** — branding group writable over the existing `replace()`; no asset column writable; no storage key in any response (`T-S61`, `T-S64`)
- [ ] **DEF-S8** — applied as a convention alignment with **no** behaviour change, or skipped with the reason recorded (**F-P2-3**: the parent's predicted new `422` does not occur)

**Security**
- [ ] `orgId` never from body/query/params (`T-S8`)
- [ ] `admin`, `super-admin`, `employee`, `manager` → `403` on both write endpoints (`T-S9`, `T-S15`, `T-S22`)
- [ ] body bounds reject a pathological payload before the owner (`T-S44`)
- [ ] no `reason` text and no setting value in any log or response (`T-P2-4`, `T-P2-5`)
- [ ] no `sensitive` key writable or returned (invariant 11; `T-S18`)

**Data / catalog**
- [ ] **P2-GATE-1 answered in writing** and the risk classification implemented (§15.1)
- [ ] every `risk:'high'` key has `warnings` and `requires_reason: true` (invariant 7)
- [ ] `conflicts_with` populated and symmetric; `depends_on` populated (`T-P2-7`)
- [ ] invariant 12 added (`clearable:false` ⇒ non-null default)
- [ ] `catalog_version` bumped; the bump's `412` consequence documented

**Known gaps, accepted and documented**
- [ ] **a `billing.notifications` change is not audited until Phase 3** (§17.3) — stated in the change record and accepted by review
- [ ] **the high-risk `reason` is enforced but not persisted** unless OD-P2-2 is accepted (§17.2) — stated in the change record
- [ ] F-17/Q-S9 — the HR-pool check stays point-in-time, pre-existing in both owners

**Regression / process**
- [ ] **every pre-existing payroll, document and organization test passes unmodified**
- [ ] `T-P1-4`'s revision is called out in the PR as a phase-boundary change, not a weakened invariant
- [ ] full suite green against the Step-0 baseline
- [ ] `api_registry.md` #246/#247 (max re-checked) and `combined_api_analysis.md` S-5/S-6 written
- [ ] dated change record written, **leading with `If-Match`**
- [ ] no migration, no model, no seeder, no env var, no new dependency; `src/app.js` untouched

---

## 28. Risks, Open Decisions & Phase 3 Entry

### 28.1 Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-P2-1** | **`noDefaults` is omitted** and every branding write wipes the org's registered address. | **High** — silent data loss on a real column | §7.3 makes it one of four mandatory options; `T-P2-2` pins it; §23.5 step 6 is a DB-level smoke check for exactly this. It is called out three times on purpose |
| **R-P2-2** | **F-P2-1 is not implemented** and the gateway becomes a validation bypass around five modules. | **High** | §7 is the longest section in this plan; `T-P2-1`; `AC-P2-8`; a checklist row under **Correctness** |
| **R-P2-3** | The risk classification ships unreviewed, so the confirmation gate guards 1 key and HR can flip approval authority with no confirmation. | **High** | **P2-GATE-1** / pre-flight **P-7**; `T-S12`'s snapshot makes any later change a deliberate diff |
| **R-P2-4** | Touching five owner services breaks a shipped behaviour. | Medium | every change is additive-with-default; Step 6 changes **one owner at a time** and re-runs that owner's suite before moving on; `AC-P2-18` forbids editing any pre-existing test |
| **R-P2-5** | `If-Match` friction drives blind retries. | Medium | `412` returns `current_etag` so a client re-syncs in one step; the change record leads with the rule "`412` means re-read, never retry blindly"; the `warn` log makes a sustained-`412` pattern visible |
| **R-P2-6** | Two write doors diverge in behaviour over time. | Medium | the gateway calls the **same service** with the **same Joi object**; `T-S37` asserts one call with the exact patch; every pre-existing owner test must pass unmodified |
| **R-P2-7** | A contributor later adds business logic to the gateway. | Medium (over time) | D-S1 + `T-S1`'s strengthened static scan; the gateway still has no transaction and no model |
| **R-P2-8** | The `catalog_version` bump surprises clients mid-edit with a `412`. | Low | documented in the change record with the exact recovery; one re-read; the window is the deploy's length |
| **R-P2-9** | The `billing.notifications` write stays unaudited longer than intended because Phase 3 slips. | Low–medium | §17.3 makes it a checklist item requiring review sign-off, not a footnote |
| **R-P2-10** | The branding post-commit re-read attributes a concurrent actor's value to this write in `changed`. | Low | EC-P2-7 — documented; the **audit row is unaffected**; fixing it means restructuring a shipped method |

### 28.2 Open decisions

| ID | Decision | Default taken | Who decides |
|---|---|---|---|
| **OD-P2-1** | **P2-GATE-1** — accept §15.1's eight high-risk keys? | **Yes, accept the proposal.** It restores parent §8.7's intent | product + security review |
| **OD-P2-2** | Thread `reason` into the four owners' existing audit calls (nullable column already exists)? | **Yes, do it.** A gate that collects a reason and discards it is close to pointless | reviewer |
| **OD-P2-3** | Withhold `billing.notifications` from S-5 until Phase 3 provides an audit trail? | **No — ship it and document the gap** (§17.3). The existing door is equally unaudited, and a silently unwritable group is a worse contract | security review |
| **OD-P2-4** | Rate-limit S-5/S-6? | **No.** No write endpoint here is rate-limited except the two asset handshakes; `org_rate_limit.utils` is available if a measurement ever justifies it | ops |
| **OD-P2-5** | Implement parent §7.4's all-stores-fail `503 SETTINGS_READ_UNAVAILABLE` on S-3 (**F-P2-9**)? | **No — out of Phase 2's scope.** It is a read-path contract change with no Phase 2 dependency. Raise it as its own small change if the current `200`-with-all-groups-`READ_FAILED` proves confusing | reviewer |
| **OD-P2-6** | Apply DEF-S8 at all, given F-P2-3 shows it changes nothing? | **Yes, as convention alignment only**; skipping it with a recorded reason is equally acceptable | implementer |

### 28.3 Phase 3 entry criteria

Phase 3 (unified change history, S-7, migration `00073`) may start when:

1. All of §26's acceptance criteria are green and Phase 2 is deployed.
2. **DEF-S10 is fixed and `T-S63` proves it** — the locked pre-read returns a
   before-state. Without it the ledger records `null → value` for every edit including
   the second one. **This is the hard blocker.**
3. The reader is written against the **verified** audit shapes, not parent §10.1's
   summary: `payroll_settings` and `statutory_configs` store changed keys only;
   **`document_settings` stores every submitted key** (F-P2-8); `document_letter_branding`
   stores two full DTOs (`T-S62`).
4. `source` is understood to be populable **only** for `settings_change_logs` rows —
   neither `payroll_audit_logs` nor `document_audit_logs` has a `source` column, and the
   reader reports `null` rather than guessing (parent §7.8, `T-S48`).
5. OD-P2-2 is settled, since it determines whether `reason` is available in history for
   the four audited stores or only for the ledger.
6. The operator has run migration `00073` — **handed back unrun**, per the standing
   constraint, and Phase 3 code must not deploy before the operator confirms it.
7. `modules/settings/models` is added to `MODEL_ROOTS` **in Phase 3, not Phase 2**.

---

## 29. Final Validation Pass

The brief requires 22 checks before this plan is considered finished. Each is answered
with where it is discharged — and where the answer is "no" or "not applicable", that is
stated.

| # | Check | Result |
|---|---|---|
| 1 | Every Phase 2 requirement from the parent is covered | **Yes.** Parent §16's Phase 2 scope row maps to §1.2 items 1–11; its 7 completion criteria map into AC-P2-1…19; §7.6/§7.7's pipelines are §10.2/§10.3 step for step |
| 2 | Actual Phase 1 status verified against its plan | **Yes, file by file — §3.** Three deviations and nine findings are recorded; nothing planned is treated as completed on the strength of the plan alone |
| 3 | No unsupported feature invented | **Yes.** Two endpoints, both from parent §7.1. Every writable key is an existing column already in the catalog. The only additions beyond the parent are **corrections** (F-P2-1…F-P2-9), not features |
| 4 | Existing functionality reused | **Yes.** Five owner services, **five owner Joi schemas**, four middlewares, `AppError`, `validateOrThrow`, `envelope`/`ctx`, `entitlementService`, Phase 1's comparator/projection/ETag utils, three repositories' existing `{lock}` support. **Three new settings utils + one common util**, each justified in §4.2 against the utility it could not reuse |
| 5 | Ownership and scope boundaries clear | **Yes.** §5, with the write map in §5.2 and the "gateway resolves no precedence" rule in §5.3 |
| 6 | Database constraints and relationships verified | **Not Applicable, stated as such — §9.** No schema change. The one DB fact relied on (`updated_at` on all five models) was verified by executing it |
| 7 | API contracts defined | **Yes.** §10, endpoint by endpoint, with the complete error register in §10.4 |
| 8 | Authorization boundaries | **Yes.** §14.1's five gates, two independent role layers, and the **F-P2-2** correction that the gateway's entitlement check is the only one on this door |
| 9 | Tenant isolation | **Yes.** §14.2 — `orgId` is never an input, and `org_id` is not a representable key in `values` |
| 10 | Sensitive-setting handling | **Yes.** §14.4 — the sensitive set is **provably empty** by boot invariant 11; the gate is implemented anyway; secrets are out of scope; `platform_cap` publishes a product limit, never an env var |
| 11 | Concurrency | **Yes.** §19.1 end to end, including why the check is after the lock, the same-tick caveat, and the proof in §12.3 that the pre-read is sound **because** `If-Match` is mandatory |
| 12 | Idempotency and retry | **Yes.** §19.2 — `PUT` + `If-Match` is the mechanism; no idempotency table; the retry-after-timeout rule is spelled out for clients |
| 13 | Cache / runtime consistency | **Yes, as a reasoned "no cache"** — §16, with every brief sub-question answered, including why "DB written but cache stale" is **impossible** in Phase 2 and what Phase 2 owes Phase 5 |
| 14 | Auditability | **Yes, including two honest gaps** — §17: the gateway writes no row; `billing.notifications` is unaudited until Phase 3 (§17.3); the high-risk `reason` is enforced but not persisted unless OD-P2-2 is accepted (§17.2). Both are checklist items, not footnotes |
| 15 | Failure and recovery | **Yes.** §18.2's 18 scenarios and §18.3's 11 Phase-2-specific edge cases, including the three where recovery **does not exist** (F-15) |
| 16 | Testing coverage | **Yes.** §21 — five categories, ~40 named tests, every AC backed by one. Integration/DB tests are **Not Applicable** with the reason, and the operator smoke checklist (§23.5) carries what only a database can prove |
| 17 | Migration and deployment safety | **Yes.** §23 — no migration; both instance-skew questions answered; rollback is complete because no data moved |
| 18 | Dependencies on other modules | **Yes.** §4.3 — still one-way; the one new edge is to a sibling **common** utility, so **no existing module gains a dependency on `src/modules/settings`** |
| 19 | No future-phase work, no reimplementation of Phase 1 | **Yes.** §1.3. No model, no repository, no migration, no `MODEL_ROOTS` edit, no surfaces/readiness endpoint, no cache, no event bus. Phase 1's catalog, comparator, adapters, projection and ETag utils are **extended, never rewritten** |
| 20 | No duplicate settings mechanism | **Yes.** No settings-value table, no second storage path, no second validator (the gateway runs the owner's **own** object), no second comparator, no second audit row |
| 21 | Backward compatibility with Phase 1 | **Yes.** §24 — #242–#245 unchanged; `writable` turns from advisory to authoritative without changing value; catalog changes are additive; the parent's one predicted breaking change is withdrawn |
| 22 | Production-readiness architecture review | **Yes.** §27, plus the honest statements: **F-P2-1 is the real finding** of this plan and the largest piece of work the parent does not describe; **R-P2-1 is the real hazard** (one missing Joi option silently destroys a column); and **P2-GATE-1 is a product decision that engineering cannot make** |

### 29.1 What this plan does **not** claim

* **No code has been written.** Every `★`/`▲` in §6.2 is an instruction.
* **No test has been run** as part of authoring this plan. `T-S…` and `T-P2-…` are
  **specified**, not executed. Pre-flight **P-0** exists because the implementer's
  baseline, not this document's, is the one that matters.
* **No database was touched** — no `db:migrate`, no `db:migrate:status`, no connectivity
  check. Phase 2 needs none.
* **What *was* verified, on 2026-10-09, by reading the shipped source and executing
  Node in this repository:** the five owner write methods' signatures and lock
  behaviour; that **no owner service applies a Joi schema** (F-P2-1); that
  `requireFeature` is route-only (F-P2-2); that the document controller already
  validates and that `validateOrThrow` strips unknown keys (F-P2-3);
  `timestamps`/`updated_at` on all five models; `Joi 18.2.3` + that `noDefaults`
  neutralises the **one** schema default, which is `replaceBrandingSchema.registered_address_lines`;
  the catalog's shipped `risk` distribution (**1** high, 54 medium, 83 low),
  its empty `conflicts_with`/`depends_on` (F-P2-6), `resettable: false` count of **0**,
  the single `clearable: false` key and its non-null default; `affected_runs`' real
  field names; `payroll_settings`' missing lock (DEF-S7) and the org profile's blind
  `UPDATE` (DEF-S10); that `412` appears nowhere in the codebase today; and that
  `api_registry.md`'s maximum row is **#245**.
* **Three figures in the parent plan are corrected here, not silently absorbed:** four
  owner services → **five** (F-P2-4); nine high-risk keys → **one shipped**, eight
  proposed (F-P2-5); and `SETTINGS_GROUP_NOT_FOUND` → **`GROUP_NOT_FOUND`**, to match
  what Phase 1 actually shipped (F-P2-7).

---

*End of Settings Module — Phase 2 Implementation Plan.*
