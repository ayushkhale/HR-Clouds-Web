# Settings Module — Phase 1 Implementation Plan

**Catalog as code, the read plane, and the five store adapters**

**Status:** Source of truth for Settings Phase 1. Supersedes §16 "Phase 1" of
[implementation_plan.md](../implementation_plan.md) wherever the two differ in detail; the parent
remains authoritative for the module-wide decisions **D-S1…D-S10**, the defect register
**DEF-S1…DEF-S12**, the edge cases **EC-S…**, and the test register **T-S1…T-S64**.
Every deviation from the parent is listed in **§1.4** — none is silent.

**Source of truth for *what the settings are*:** [org_settings_registry.md](../org_settings_registry.md)
— **114** entries, continuous 1–114.

**Written:** 2026-10-09 · **Depends on:** parent plan dated 2026-10-08, revised 2026-10-09.

**Rule inherited from Leave, Payroll, Documents and PDF Generation:** no phase begins until the
previous one is tested and verified. Phase 1 has no predecessor. **No open question blocks Phase 1**
— Q-S2…Q-S6 and Q-S8…Q-S10 are all tagged to Phases 3–5 (§27.2).

**Standing constraints that shape this phase** (not negotiable, carried from the operator's rules):

* Phase 1 creates **no migration, no model, no seeder**, and runs **no database command**. Verification
  is static plus `node --test`.
* `admin` / `super-admin` are **platform-plane** roles and get **no** tenant data. `hr` is the top of
  the tenant plane.
* No secret is read, logged or returned (`attendance_devices.api_key_hash`, `PAYROLL_ENCRYPTION_KEY`,
  `RAZORPAY_*`, `PDF_RENDERER_API_KEY`, the S3 storage keys).
* A dated change record in `public/md_updates/` is mandatory because this phase adds API surface.

---

## 0. How to read this document

* **§1–§3** fix the boundary and the dependencies. Read fully before writing code.
* **§5–§8** are the heart of the phase: the **verified 138-key inventory**, the catalog design, the
  five adapters, and the comparator. §5.2 is the table that makes this phase implementable without
  re-deriving anything.
* **§9–§19** are the per-layer contracts, in the order the user's layering question asks for them,
  with **Not Applicable — Reason:** stated explicitly where a layer genuinely has no Phase 1 work.
* **§20** is the build order with a verify gate per step.
* **§26** is the only list that decides whether Phase 1 is done.
* New decisions taken by *this* plan are numbered **D-P1-1 …**; new tests **T-P1-…**; open decisions
  **OD-P1-…**. Parent identifiers keep their parent numbering.

---

## 1. Goal & Boundary

### 1.0 Goal

Make **all 114 registered organization settings discoverable, and all 138 org-singleton setting
values readable, through one authenticated surface** — with **zero behaviour change to any existing
endpoint** and **zero rows written** that are not already written today.

Phase 1 is the phase in which the module's **contract and its honesty mechanism** are fixed: the
catalog's shape, the load-time invariants, the parity test against the owning modules, the RBAC and
sensitivity projection, the group→store map, and the ETag basis. Phases 2–5 add writes, history,
surfaces and caching *on top of* these and must not re-decide them.

**The single most important property of this phase, stated once:** the Settings module **cannot
write a setting value**. It has no model, no repository over a foreign table, and no write call. That
is not a convention to be respected — after Phase 1 it is a build-enforced fact (`T-S1`, `T-P1-1`).

**The second most important property:** the catalog is only worth building if it cannot drift from
the code that enforces it. `T-S2` is therefore not a nice-to-have in this phase; it is the phase's
reason to exist. A catalog without `T-S2` is a second source of truth, which is exactly what §4.3 of
the parent plan forbids.

### 1.1 Explicitly in scope

| # | Deliverable | Why it must be Phase 1 |
|---|---|---|
| 1 | `src/modules/settings/catalog/` — the declarative catalog: **138 keys across 26 groups**, plus the **49 surface descriptors** as metadata only | Every later phase reads it. The group→store map is what makes Phase 2's one-request-one-transaction guarantee true (D-S4), so it must be fixed before any write exists. |
| 2 | `catalog/index.js` — loader, **eight load-time invariants**, deep freeze | A malformed catalog must fail the boot, not a request (§6.3). Cheap now, impossible to retrofit once four services read it. |
| 3 | **`T-S2`, the drift test**, written *before* the catalog is filled | The only defence against the catalog lying to a frontend. Build gate, not a review item (§21.2). |
| 4 | Five **read adapters** — `payroll_settings`, `statutory_config`, `document_settings`, `document_letter_branding`, `organization_profiles` | Five, not four: DEF-S12 made branding the fifth store. Each wraps one already-shipped read method; the contract is uniform so Phase 2 only adds `update`. |
| 5 | `utils/settings_value.utils.js` — the **`valuesEqual()` comparator** (DEF-S11) | Moved into Phase 1 from the parent's Phase 2. `non_default_keys` ships in S-3/S-4, and it is computed by comparing a **pg DECIMAL string** against a **catalog JS number**. Shipping it with `!==` would make the field confidently wrong on every clean org (§1.4 (4), §8). |
| 6 | `utils/settings_projection.utils.js` — RBAC, entitlement and sensitivity projection | The security boundary of the read plane. One place, unit-tested, reused by all four endpoints. |
| 7 | `utils/settings_etag.utils.js` — the `updated_at`-based group ETag | Phase 2's `If-Match` is worthless unless Phase 1 mints the token correctly and from the same place. |
| 8 | **S-1…S-4** (`api_registry.md` **#242–#245**): catalog, single-setting metadata, aggregated read, single-group read | The whole FR-1/FR-2 payload. Read-only, so the blast radius of getting the shape wrong is a frontend revision, not a data incident. |
| 9 | Module wiring: `settings.index.js` + **one line** in `src/app.js` | The only edit to an existing file in the entire phase (§4.2). |
| 10 | `tests/unit/settings/` — catalog, parity, invariants, projection, adapters, comparator, read endpoints | DB-free, owners stubbed at the service boundary. The safety net Phases 2–5 lean on. |
| 11 | Registry document corrections **DEF-S1, DEF-S2, DEF-S3** | Doc-only edits to `org_settings_registry.md`. Cheap, and they stop the next reader filing #87–#90 under Documents. |
| 12 | `settings_module_read_apis_<date>.md` + `api_registry.md` rows + `combined_api_analysis.md` §S-1…S-4 | Three documentation artefacts, per parent §7.12. |

### 1.2 Explicitly NOT in scope — do not build these here

| Excluded | Deferred to | Why not now |
|---|---|---|
| **Any write path.** S-5 `PUT /settings/groups/:groupKey`, S-6 reset, the allowlist intersection, `If-Match` *verification*, the `risk:'high'` confirmation gate | **Phase 2** | A read plane is provable without them, and shipping reads first means any write regression in Phase 2 has an unambiguous cause. |
| `adapter.update()`, `mutableKeys()` *as a write allowlist* | **Phase 2** | `mutableKeys()` **is** built in Phase 1 — but only as `T-S2`'s parity input, never as a write gate. See **D-P1-4**. |
| **DEF-S7** (payroll missing `FOR UPDATE`), **DEF-S8** (missing route `validate()`), **DEF-S10** (blind org-profile `UPDATE`) | **Phase 2** | All three are *write*-path defects. Phase 1 reads are unaffected by a missing write lock. Fixing them here would mean touching three shipped owner services in a phase whose completion criterion is "no existing module source changed except one `app.js` line". |
| The **owner-diff half** of DEF-S11 (`payroll_settings.service.js:99`) | **nowhere — it is not a defect** | Verified: both sides of that comparison are DB-typed. See **§1.4 (4)** and **§8.3**. The comparator is still built here, for the gateway's own comparisons. |
| `settings_change_logs`, migration `00073`, the `settingsAudit.record` recorder, S-7 history | **Phase 3** (DB-gated) | Needs a table. Phase 1 adds nothing to `MODEL_ROOTS` and creates no model. |
| S-8 surfaces endpoint, S-9 readiness endpoint, the readiness probes | **Phase 4** | The 49 surface *descriptors* are authored in Phase 1 as catalog data (they are needed by `T-S3`'s 1–114 coverage proof), but **no endpoint serves them and no probe exists**. |
| Any cache, any Redis key, read-through anything | **Phase 5, optional, gated on Q-S5** | D-S10: Phases 1–4 are cache-free so they are performance-neutral by construction. |
| Proxying per-record CRUD (leave types, holidays, PT slabs, shift templates…) | **never** (D-S5) | The Settings module links; it does not proxy. |
| Relocating, copying or seeding any setting value | **never** (D-S1, §17.2) | The five stores keep their columns. The row is created lazily by the owner, as today. |
| A generic key-value `settings` table | **never** (D-S6) | |
| `admin` / `super-admin` access of any kind | **never** | Parent §9.1; memory `role-planes-tenant-vs-platform`. Enforced by a load-time invariant, not just a route. |
| Retrofitting audit to per-record leave/attendance/organization writes (DEF-S4/S5/S6) | **its own plan** | 20+ write paths in three modules. Parent §10.4. |

### 1.3 Honesty guard — six stated gaps, not hidden ones

1. **S-3 is not side-effect-free, and cannot be made so in this phase.** Every adapter read delegates
   to the owner's `getOrCreate`, which **creates the row on first access** — that is the existing,
   deliberate lazy-provisioning design (§8.5 of the parent). For `document_letter_branding` it goes
   one step further: `getOrCreate` writes a `letter_branding.initialized` **audit row** on first
   creation (verified at `document_letter_branding.service.js:163-172`). So a first-ever `GET
   /settings` for an org can create up to five rows and one audit row. This is correct — it is what
   the module endpoints already do — but it means **S-3 is not a safe read to put behind an
   unauthenticated health check or a cache warmer**, and it must be stated in the change record.

2. **`non_default_keys` is only as right as the authored defaults.** It is computed as
   `valuesEqual(storedValue, catalogDefault, dataType)`. `T-S2` proves the catalog default equals the
   model's `defaultValue` where one exists — but five of the six `#104` branding text fields and
   `#95` have no model default (they are `NULL`-means-inherit or `NULL`-means-unset), so for those
   keys `non_default_keys` answers "is it set", not "has it been changed from a documented default".
   The catalog marks them `default: null` and the field is documented as such, rather than pretending.

3. **`effect_timing` is authored, not derived, and is the highest-risk data in the catalog.** Parent
   A-S7. 138 keys get one of five values transcribed from each registry entry's Deep Explanation.
   Nothing in code can verify it. `T-S25` only proves it is present and in the allowed set. **This is
   the one part of Phase 1 that needs a human reviewer who knows the domain**, and §20 Step 4 makes
   that review an explicit gate rather than an assumption.

4. **The `organization_profiles` adapter reads through a repository, not a service.** There is no
   service-level "read this org's profile by orgId" method — `organization.service.getOrganizationDetails`
   takes an `actorUser` and returns a composite with counts and hierarchy, which is the wrong shape and
   far too expensive for a settings read. So the adapter calls
   `organizationRepository.findOrganizationProfileByOrgId(orgId)` directly (**D-P1-5**). That is an
   established convention — `document_hr.controller.js` requires `catalogRepo` and `typeRepo` the same
   way — but it does hand the settings module a module whose write methods it must never call, so
   `T-P1-1` is widened to scan for that (§21.1).

5. **`requireActiveOrg` on the settings routes is stricter than the endpoints it aggregates.** The
   payroll, document and attendance routers do **not** use it (verified: it appears only in the
   organization router and is explicitly declined in `subscription.routes.js`). So after Phase 1 a
   suspended org can still read `/payroll/hr/settings` but gets `403 ORG_NOT_ACTIVE` from
   `/settings`. This is deliberate (**D-P1-6**) — a settings page is exactly where a suspended org
   should not be making changes — but it is an inconsistency, it is this plan's choice, and the
   frontend must be told, because a settings page that 403s while the payroll page loads looks like a
   bug.

6. **No claim is made about the existing suite being green.** `find tests -name "*.test.js"` reports
   **277** test files at the time of writing; `npm test` was **not** run while authoring this plan.
   §2 makes recording the real baseline the implementer's first pre-flight step, because the "full
   suite still green" completion criterion is meaningless without a before-number.

### 1.4 Deviations from the parent plan's §16 Phase 1 — with reasons

| # | Parent §16 Phase 1 says | This plan does | Why |
|---|---|---|---|
| 1 | Scope: "**four** read adapters" | **Five** read adapters | The parent's own completion criteria (c) and (d) already say "all **five** adapters" and "all five stores", and its §5.1 lists 26 groups over 5 stores. The Scope cell is a leftover from before DEF-S12 added `document_letter_branding`. Resolved in favour of five. |
| 2 | Objective: "make the **98** settings discoverable" | **114 registry entries / 138 writable keys** | Another pre-2026-10-09 leftover. The registry is continuous 1–114, and the parent's own `T-S3` and completion criterion (b) say "1–114". The settings *count* that matters to an implementer is **138 keys**, which no document stated before this one (§5.1). |
| 3 | `document_settings` has "**37** mutable columns" (parent §2.2) | **35** | Verified by requiring the module: `document_settings.service.MUTABLE_FIELDS.length === 35`, and `updateSettingsSchema` describes exactly the same 35 keys. The mapping to registry entries #58–#86 + #91–#96 is 1:1 and closes exactly (§5.2.3), which is the independent confirmation that 35 is right. |
| 4 | DEF-S11: "`payroll_settings.service.js:99` diffs with `!==`, so it can **already record a phantom change**"; the fix is in Phase 2 | **The comparator moves to Phase 1. The owner-diff "fix" is dropped — that half of DEF-S11 does not reproduce.** | Both sides of `before[key] !== updated[key]` are DB-typed, so a DECIMAL compares string-to-string and the diff is correct. `before = current.toJSON()` is a row read; `updated = payrollSettingsRepo.update(...)` returns `rows[0]` from a `{ returning: true }` update, i.e. also built from DB output. Verified there is no `pg.types.setTypeParser` anywhere in `src/` or `configs/`, and Sequelize 6.37's `DECIMAL` declares no `parse`, so pg's default `NUMERIC`→string applies to **both** sides. `statutory_config.service.js:84` already says exactly this in a comment, and it is right. **But the comparator is still needed, and needed earlier than the parent thought:** the gateway compares a stored DECIMAL **string** against a catalog **number** for `non_default_keys`, and that ships in S-3/S-4 — Phase 1. So `valuesEqual()` + `T-S59` move here, and the Phase 2 edit to a shipped owner service is removed from scope (it would change working code for no defect — "preserve existing behaviour unless explicitly changing it"). |
| 5 | `T-S2`: "catalog key set **≡** the owner's mutable-field list" for each adapter | **Two-sided equality for three adapters; subset-plus-declared-exclusions for two** | It is unwritable as stated for `organization_profiles`: its Joi schema `fieldValidation_UpdateOrganizationProfile` has **18** keys, of which **16 are org master data** (`org_name`, `city`, `gst_number`…) that the registry's own addendum lists as *deliberately not registry entries*. Equality would force 16 non-settings into the catalog. Same shape, smaller, for `document_letter_branding`, whose read DTO carries 7 non-setting keys. §7.7 defines the exact form. |
| 6 | Backend changes: "new `src/modules/settings/` tree; `settings.index.js` mounted in `src/app.js` (one line)" — and §3.3 lists **four owner services** that must "export mutable-key lists for the parity test" | **No owner file is modified at all.** One `app.js` line is the entire diff outside `src/modules/settings/`. | All five key lists are **already externally derivable** (verified): `document_settings.service` already exports `MUTABLE_FIELDS`; `payroll_hr.validator` already exports `updateSettingsSchema` (63 keys) and `updateStatutoryConfigSchema` (25 keys), and `Joi.describe().keys` enumerates them; branding's 13 are fixed by `_mapReplaceFields`; the org pair is a 2-key constant. So the parent's §3.3 edits are unnecessary, and dropping them turns completion criterion (e) from an aspiration into something `git diff --stat` can prove. |
| 7 | Security: "`authenticate` + `authorize(['hr','manager'])` + `requireActiveOrg`" | Same, **plus a per-group entitlement check inside the service**, and **no `requireFeature` middleware on the route** | One route serves many groups across four feature keys, so a single route-level `requireFeature` cannot express it. Entitlement is therefore resolved per group in the read service and reported in `unavailable_groups` (§14.3). Stated because it is a real departure from how every other router in this codebase gates a feature. |
| 8 | §4.12 directory layout lists `billing.catalog.js # #97, #98` and has no file for #104 | Keeps `billing.catalog.js`, adds `branding.catalog.js`, and sets **`module_key: 'organization'`** for the billing group | #97/#98 live on `organization_profiles`, owned by the organization module; Billing only *consumes* them. Setting `module_key: 'billing'` would make the S-1 `?module=` filter and the entitlement projection both wrong (there is no `billing.access` feature key). The group key stays `billing.notifications` exactly as §5.1 mandates. |
| 9 | §8.2 invariant 2: "no `registry_ref` appears in two modules" | Unchanged, and it **holds** — because `statutory.*` groups carry `module_key: 'payroll'` | #49 and #50 deliberately split across `statutory.pt`/`payroll.tax_admin` and `statutory.income_tax`/`payroll.tax_admin` (D-S4). They are in two *groups* and two *catalog files*, but one module. Without this ruling the invariant would fail on day one. The two entries are marked `split: true` so `T-S3` can expect them in more than one group (§6.3). |

---

## 2. Pre-Flight Checks — before writing any code

Every row is a command whose output the implementer **records**, not assumes. The "Expected" column
is what was observed on 2026-10-09 while authoring this plan.

| # | Check | Command / file | Expected (verified 2026-10-09) |
|---|---|---|---|
| 1 | **Baseline test count and result, recorded before any edit** | `npm test` | Unknown — **record it**. `find tests -name "*.test.js" \| wc -l` reports **277** files. This number is half of the regression gate; the other half is the same command at §26. |
| 2 | Settings module directory is empty | `ls -a src/modules/settings` | empty (only `.`/`..`) ⇒ nothing to reconcile, no dead code to adopt |
| 3 | Migration counter — **confirm Phase 1 writes none** | `ls src/infrastructure/postgres-sql/migrations \| tail -1` | `00072-normalize-and-constrain-work-mode.js`. Phase 3's table will be `00073`. **Phase 1 adds no migration file.** |
| 4 | `MODEL_ROOTS` does **not** include settings | `src/infrastructure/postgres-sql/models.index.js:10-21` | 10 roots, no `modules/settings`. **Leave it that way** — Phase 1 has no model, and adding the root early would make an empty-directory scan the only effect. |
| 5 | API registry tail | `public/md_system/api_registry.md` | max is **#241** (#240/#241 are the document bulk-request endpoints) ⇒ Phase 1 takes **#242–#245**. Re-check at implementation time; these are not reserved. |
| 6 | Org-settings registry tail | `public/md_settings/org_settings_registry.md` | ends at **#114**, continuous from 1. **Phase 1 adds no registry entry** — only the DEF-S1/S2/S3 corrections. |
| 7 | The four feature keys, and only four | `grep -rho "requireFeature('[a-z._]*')" src \| sort -u` | `attendance.access`, `documents.access`, `leave.access`, `payroll.access`. **No `organization.access`, no `billing.access`, no `settings.*`.** This is why `billing.notifications` must carry `featureKey: null` (§7.6) and why `T-S6` can be a closed-set assertion. |
| 8 | All five stores carry `updated_at` (the ETag basis) | the five `*.model.js` files | `timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at'` on all five. **Also note `payroll_settings` and `statutory_configs` are `paranoid: true`** — soft-deleted, so a read must not resurrect a deleted row (§7.2). |
| 9 | Owner key lists are externally derivable | `node -e` requiring the two validators and the document service | `updateSettingsSchema` **63** keys, `updateStatutoryConfigSchema` **25**, `MUTABLE_FIELDS` **35**. ⇒ **no owner file needs an export added** (§1.4 (6)). |
| 10 | No `pg` numeric type-parser override exists | `grep -rn "setTypeParser\|decimalNumbers\|pg.types" src configs` | no match ⇒ `DECIMAL`/`NUMERIC` arrive as **strings**. This is the fact §8 is built on; re-verify it, because a future override would silently change the comparator's job. |
| 11 | Node version | `node -v` | v24.x — `structuredClone`, `Object.groupBy`, `Array.prototype.at` all available; no polyfill needed in the catalog loader |
| 12 | Redis is a hard boot dependency | `src/server.js` | `initRedis()` exits the process on failure. **Irrelevant to Phase 1** (no cache, no rate limit) and recorded only so nobody adds one "since Redis is there anyway". |

**If check 9 fails** (an owner refactor has moved the key lists), stop and re-plan §7.7 — do not
hard-code a key list into the catalog as a workaround. A hard-coded second list is precisely the
drift `T-S2` exists to prevent.

---

## 3. Dependencies on Existing HRMS Components

Phase 1 **consumes** everything below. Apart from the single `app.js` mount line, it **modifies none
of them**.

### 3.1 Reused as-is (verified signatures)

| Component | Path | How Phase 1 uses it |
|---|---|---|
| `authenticate` | `common/middlewares/auth.middleware.js` | Populates the frozen `req.user` with `{ id, role, orgId, orgStatus, … }`. **`orgId` comes from here and nowhere else.** |
| `authorize([...])` | same | `authorize(['hr','manager'])` on all four routes. Returns `403 FORBIDDEN`. |
| `requireActiveOrg` | same | `403 ORG_NOT_ACTIVE` for a non-active org (see **D-P1-6** / §1.3 (5)). |
| `AppError` | `common/utilities/appError.utils.js` | `new AppError(status, message, errorCode, details?)`. `details` is the channel for `{ keys: [...] }`-style payloads; the error middleware passes it through untouched. |
| `errorHandlerMiddleware` | `common/middlewares/error.middleware.js` | Already mounted globally. Emits `{ success, message, errorCode, details? }`. **Phase 1 adds no error middleware.** |
| `validateOrThrow(schema, payload)` | `common/utilities/validator.utils.js` | `abortEarly:false, allowUnknown:false, stripUnknown:true, convert:true` → `400 VALIDATION_ERROR`. Used for the query envelopes. |
| `entitlementService.hasFeature(orgId, key)` | `modules/billing/services/entitlement.service.js` | Per-group entitlement. Returns `false` for "not on plan"; **throws `503 ENTITLEMENT_DEPENDENCY_FAILURE` when the DB is unreachable** — that distinction must survive to the client (§18). Uncached, 1–3 queries per call. |
| `payrollSettingsService.getOrCreate(orgId, transaction = null)` | `modules/payroll/services/payroll_settings.service.js` | Adapter read. Returns a Sequelize instance. |
| `statutoryConfigService.getConfig(orgId)` | `modules/payroll/services/statutory_config.service.js` | Adapter read. Opens its own short transaction, provisions on first access. **No transaction parameter.** |
| `documentSettingsService.getOrCreate(orgId, transaction = null)` | `modules/document/services/document_settings.service.js` | Adapter read. |
| `documentSettingsService.MUTABLE_FIELDS` | same | `T-S2` parity input — 35 frozen strings. |
| `letterBrandingService.getOrCreate(orgId, { includeAssetUrls })` | `modules/document/services/document_letter_branding.service.js` | Adapter read. Returns `{ branding, inherited, assets }`. **Must be called with `includeAssetUrls: false`** (§7.5). |
| `organizationRepository.findOrganizationProfileByOrgId(orgId, transaction = null)` | `modules/organization/repositories/organization.repository.js` | Adapter read (**D-P1-5**, §1.3 (4)). |
| `payrollHrValidator.updateSettingsSchema` / `.updateStatutoryConfigSchema` | `modules/payroll/validators/payroll_hr.validator.js` | `T-S2` parity input via `.describe()`. |
| `organizationValidator.fieldValidation_UpdateOrganizationProfile` | `modules/organization/validators/organization.validator.js` | `T-S2` parity input, with the 16-key exclusion list (§7.7). |
| `node:test` + `node:assert/strict` | `tests/unit/**` | The whole suite. `npm test` glob is `tests/unit/**/*.test.js`. |

### 3.2 Patterns copied, not re-invented

| Pattern | Copied from | Applied to |
|---|---|---|
| `envelope(data, message)` → `{ success, message, data }` | `document_hr.controller.js:17` | All four Phase 1 responses. |
| `ctx(req)` → `{ orgId, actorId, actorRole, ipAddress, requestId }` with `requestId = headers['x-request-id'] \|\| headers['x-correlation-id'] \|\| null` | `document_hr.controller.js:19-26` | `settings.controller.js`. Copied including the `x-correlation-id` fallback, which the payroll version omits. |
| `const hrAuth = [authenticate, authorize(['hr']), requireFeature(...)]` array-constant middleware stacks | `payroll_hr.routes.js:17`, `document_hr.routes.js:50` | `settingsReadAuth` (§4.3) — **without** `requireFeature`, per §1.4 (7). |
| Literal route segments registered **before** parameterised ones | `document_hr.routes.js:33-36` comment, `document.index.js:21` | `/catalog` and `/groups/...` before `/catalog/:settingKey` (§4.3). |
| Query validated **inside the controller**, never assigned back to `req.query` | PDF P1 §4.4; `payroll_hr.routes.js:21` marker | S-1 and S-3 (§4.4). |
| `Object.freeze` on module-level constant lists | `document_settings.service.js:25` `MUTABLE_FIELDS` | The whole catalog, recursively (§6.4). |
| Bracketed log prefix `[settings]` | `[AUTH]`, `[Entitlement]`, `[org-rate-limit]`, `[letter-branding]` | §17.2. |
| `Promise.allSettled` fan-out with per-item degradation | the parent's §7.4 contract | `settings_read.service` (§12.2). |

### 3.3 Explicitly NOT depended on in Phase 1

| Not used | Why |
|---|---|
| `db` / `models.index.js` — **any model at all** | D-S1. The settings module requires **no** model in Phase 1. `T-P1-1` scans for it. |
| `redisClient` | No cache, no rate limiting in this phase (D-S10). |
| `requireFeature` middleware | §1.4 (7) — entitlement is per group, not per route. |
| `requireSubscription` | Not used by payroll or documents for settings either; `hasFeature` is the established gate. |
| `s3Provider` / `object_storage.utils` | The branding adapter is explicitly configured not to reach storage (§7.5). |
| `hierarchy_access.utils` | No per-employee scoping exists in a settings read; the unit of access is the org. |
| `org_rate_limit.utils` | No Phase 1 endpoint is abusable in a way a per-org counter would help: all four are `GET`, `hr`/`manager`-only, and bounded by at most 7 queries. |
| Any audit service | Phase 1 writes no audit row **of its own**. The one audit row a read can cause is the owner's pre-existing `letter_branding.initialized` (§1.3 (1)). |

### 3.4 Integration direction — strictly one-way

```text
  settings ──requires──▶ payroll (2 services, 1 validator)
           ──requires──▶ document (2 services, 1 validator)
           ──requires──▶ organization (1 repository, 1 validator)
           ──requires──▶ billing (1 service: entitlement)

  payroll ──┐
  document ─┼── require ──▶ settings    ✗ NEVER. No existing module gains a
  organization ─┘                          dependency on modules/settings in Phase 1.
```

The same rule the Documents P1 plan set and the PDF P1 plan repeated. It is what keeps Phase 1
revertible by deleting a directory and one line. `T-P1-2` asserts it by scanning every module
*except* settings for `modules/settings`.

---
## 4. Architecture, Directory Structure & Wiring

### 4.1 Layering

```text
  route            settings.routes.js
                   authenticate → authorize(['hr','manager']) → requireActiveOrg
                        │
  controller       settings.controller.js
                   ctx(req) · validateOrThrow(query envelope) · envelope(data) · next(err)
                   NO business rule, NO projection decision
                        │
  service          settings_read.service.js      (S-3, S-4)
                   settings_catalog.service.js   (S-1, S-2)
                        │
                   ┌────┴─────────────────────────────────┐
                   │                                      │
  projection   settings_projection.utils.js        adapters/index.js
               RBAC · entitlement · sensitivity           │
               (pure, no I/O)                      ┌──────┴──────┬──────────┬──────────┬──────────┐
                   │                               ▼             ▼          ▼          ▼          ▼
  catalog      catalog/index.js  (frozen)    payroll_      statutory_   document_  branding   org_billing
               138 keys · 26 groups ·        settings      config       settings
               49 surfaces                      │             │            │          │          │
                                                ▼             ▼            ▼          ▼          ▼
  owner                              payrollSettings  statutoryConfig  documentSettings  letterBranding  organizationRepository
                                     .getOrCreate()   .getConfig()     .getOrCreate()    .getOrCreate()  .findOrganizationProfileByOrgId()
```

Two services, not one: the catalog plane does **zero I/O** and is statically cacheable per deploy;
the value plane does one query per group. Merging them would make S-1 look like it needs a database.

### 4.2 New and modified files

**New — `src/modules/settings/` (the entire phase lives here):**

```text
src/modules/settings/
  settings.index.js                       # mounts /api/v1/settings
  catalog/
    index.js                              # load → validate 8 invariants → deepFreeze → export
    groups.js                             # 26 groups: store, module_key, featureKey, read/write roles
    payroll.catalog.js                    # 63 keys, 11 groups
    statutory.catalog.js                  # 25 keys, 4 groups   (module_key 'payroll' — §1.4 (9))
    document.catalog.js                   # 35 keys, 9 groups
    branding.catalog.js                   # 13 keys, 1 group    (#104, new per §1.4 (8))
    billing.catalog.js                    # 2 keys,  1 group    (module_key 'organization')
    surfaces.js                           # 49 surface descriptors — DATA ONLY, no endpoint in P1
    preconditions.js                      # precondition id → probe NAME only; no probe bodies (P4)
  adapters/
    index.js                              # store key → adapter; assert 1:1 with groups.js
    payroll_settings.adapter.js
    statutory_config.adapter.js
    document_settings.adapter.js
    document_letter_branding.adapter.js
    organization_billing.adapter.js
  services/
    settings_catalog.service.js            # S-1, S-2
    settings_read.service.js               # S-3, S-4
  controllers/
    settings.controller.js
  validators/
    settings.validator.js                  # query + param envelopes ONLY
  routes/
    settings.routes.js
  utils/
    settings_value.utils.js                # valuesEqual()  (§8)
    settings_projection.utils.js           # RBAC/entitlement/sensitivity projection
    settings_etag.utils.js                 # group + catalog ETags
```

`repositories/` and `models/` are **deliberately absent**. Creating them empty would invite Phase 3's
work into Phase 1.

**Modified — exactly one existing file:**

| File | Change | Lines |
|---|---|---|
| `src/app.js` | `require('./modules/settings/settings.index')(app)` after the `billing` mount | **+1** |

**Modified — documentation only (no code):**

| File | Change |
|---|---|
| `public/md_settings/org_settings_registry.md` | DEF-S1/S2/S3 corrections (§22.2) |
| `public/md_system/api_registry.md` | 4 rows, #242–#245 |
| `public/md_settings/combined_api_analysis.md` | new file, S-1…S-4 sections |
| `public/md_updates/settings_module_read_apis_<date>.md` | new change record |

**The completion gate this produces (§26):** `git diff --stat` outside `src/modules/settings/` and
`public/` must show **exactly one changed line in one file**.

### 4.3 Mount and route ordering

`settings.index.js`:

```text
module.exports = (app) => {
  app.use('/api/v1/settings', settingsRoutes)
}
```

`settings.routes.js` — **order is normative**, because `/catalog` and `/groups` are literal segments
that a `:settingKey` route would otherwise capture:

```text
const settingsReadAuth = [authenticate, authorize(['hr', 'manager']), requireActiveOrg]

router.get('/catalog',              settingsReadAuth, controller.getCatalog)        // S-1  #242
router.get('/catalog/:settingKey',  settingsReadAuth, controller.getCatalogEntry)   // S-2  #243
router.get('/groups/:groupKey',     settingsReadAuth, controller.getGroup)          // S-4  #245
router.get('/',                     settingsReadAuth, controller.getAll)            // S-3  #244
```

Three ordering rules, each with a reason:

1. **`/catalog` before `/catalog/:settingKey`** — Express matches in declaration order; the literal
   must win.
2. **`/groups/:groupKey` before `/`** — not strictly required (different depths) but declared in the
   literal-first order the document and payroll routers use, so that Phase 2's
   `PUT /groups/:groupKey` and `POST /groups/:groupKey/reset` slot in without a re-ordering review.
3. **`/` last.** A root `GET` declared first would be harmless here, but every other router in this
   codebase puts the collection route after its literal siblings, and consistency is cheaper than a
   future bug.

**Reserved for later phases — do not add now:** `/history` (P3), `/surfaces`, `/readiness` (P4). When
they land they are **literal segments and must be declared above `/groups/:groupKey`**; a note to
that effect belongs in the route file as a comment, so the ordering discipline survives the phase
boundary.

### 4.4 Express 5 query gotcha

`req.query` is **getter-only** in Express 5. Every query parameter is validated **inside the
controller** with `validateOrThrow(schema, req.query)` and assigned to a local — **never** written
back onto `req.query`. Route lines for S-1 and S-3 carry the `// query validated in controller`
marker, matching `payroll_hr.routes.js:21`.

In Phase 1 this applies to **S-1** (`module`, `group`, `include_hidden`) and **S-3** (`modules`).
S-2 and S-4 use `req.params`, which **is** writable — but for uniformity they are validated the same
way, in the controller, into a local.

---

## 5. Settings Ownership & Scope Model — the Phase 1 view

### 5.1 The verified inventory

This table is the single most useful output of the pre-flight work, and it did not exist in any
document before this plan. Every count was obtained by requiring the owning module's own exports,
not by reading the registry prose.

| Store | Kind | Groups | **Writable keys** | Registry entries | Audit today | ETag basis |
|---|---|---|---|---|---|---|
| `payroll_settings` | org singleton, lazy, `paranoid` | 11 (1 read-only) | **63** | #35–#46, #49p, #50p, #51–#57, #87–#90 | `payroll_audit_logs` | `updated_at` |
| `statutory_configs` | org singleton, lazy, `paranoid` | 4 | **25** | #47, #48, #49p, #50p | `payroll_audit_logs` | `updated_at` |
| `document_settings` | org singleton, lazy | 9 | **35** | #58–#86, #91–#96 | `document_audit_logs` | `updated_at` |
| `document_letter_branding` | org singleton, lazy, `UNIQUE(org_id)` | 1 | **13** | #104 | `document_audit_logs` | `updated_at` |
| `organization_profiles` | one per org, created at registration | 1 | **2** | #97, #98 | **none** (DEF-S6) | `updated_at` |
| **Total** | | **26** | **138** | **65 entries** | | |
| *(per-record tables)* | 0..N rows/org | — | *not settings* | **49 entries** | partial | — |
| | | | | **114** | | |

**65 + 49 = 114.** That arithmetic closing is the Phase 1 proof that the catalog plus the surfaces
index covers the registry exactly once, and it is what `T-S3` asserts mechanically.

**Two facts in this table change how Phase 1 is built:**

* `payroll_settings` and `statutory_configs` are **`paranoid: true`**. `findOne`/`findOrCreate`
  therefore exclude soft-deleted rows automatically. The adapters must **not** pass `paranoid: false`
  and must not add a `deleted_at` filter of their own (§7.2).
* `organization_profiles` is the **only** store not lazily provisioned. There is no `getOrCreate` for
  it; the row is created at registration. A missing row is therefore an anomaly, not a first access,
  and the adapter must report it as such rather than creating one (§7.6).

### 5.2 The complete key → group map

**This is the table the catalog is authored from.** Group assignment follows the parent's §5.1
(registry-entry → group); the key lists come from the owners' own exports; the key → registry-entry
mapping comes from the registry's own `### N. Title (\`key\`, \`key\`…)` headings. Where all three
agree, the count closes — and for all five stores it does.

#### 5.2.1 `payroll_settings` — 63 keys, 11 groups

| Group | Registry | Keys | n |
|---|---|---|---|
| `payroll.calendar` | #35, #36, #37 | `payroll_cycle`, `period_start_day`, `attendance_cutoff_day`, `pay_day`, `pay_day_in_next_month`, `currency`, `financial_year_start_month` | 7 |
| `payroll.authority` | #38, #39, #40 | `manager_can_view_team_compensation`, `payroll_require_separate_checker`, `manager_direct_compensation_authority` | 3 |
| `payroll.engine` | #41, #42, #43, #44, #45 | `lop_basis`, `net_pay_rounding`, `in_progress_treatment`, `overtime_payable`, `overtime_rate_multiplier`, `overtime_hourly_basis`, `standard_working_hours_per_day`, `negative_net_handling` | 8 |
| `payroll.loans` | #46 | `loan_max_amount`, `loan_max_tenure_months`, `loan_max_interest_rate`, `loan_default_interest_rate`, `loan_interest_method`, `loan_max_concurrent_per_employee` | 6 |
| `payroll.tax_admin` | #49p, #50p | `tax_declaration_window_start_month`, `tax_declaration_window_end_month`, `tax_proof_deadline_month`, `tax_proof_deadline_day`, `default_tax_regime`, `allow_employee_regime_switch`, `pt_state_source`, `tds_monthly_rounding` | 8 |
| `payroll.reimbursements` | #51, #52 | `reimbursement_approval_levels`, `reimbursement_payout_lookahead_months` | 2 |
| `payroll.benefits` | #53 | `benefit_deductions_enabled` | 1 |
| `payroll.payslips` | #54, #88, #89, #90 | `payslip_auto_publish`, `payslip_auto_email`, `payslip_prerender_on_publish`, `pdf_bulk_inline_miss_threshold`, `pdf_cache_retention_days` | 5 |
| `payroll.exits` | #55, #57 | `fnf_leave_encashment_enabled`, `fnf_encashment_leave_type_codes`, `fnf_encashment_rate_basis`, `fnf_encashment_divisor`, `fnf_encashment_max_days`, `fnf_encashment_component_id`, `fnf_notice_recovery_enabled`, `fnf_notice_recovery_rate_basis`, `fnf_default_notice_period_days`, `fnf_notice_recovery_component_id`, `fnf_loan_recovery_mode`, `compoff_encashment_enabled`, `compoff_encashment_rate_basis`, `compoff_encashment_divisor`, `compoff_encashment_max_days_per_fy`, `compoff_encashment_component_id` | 16 |
| `payroll.automation` | #56 | `payroll_auto_draft_enabled`, `payroll_auto_draft_day`, `payroll_cutoff_reminder_enabled`, `payroll_payday_reminder_enabled`, `tax_declaration_reminder_enabled`, `payroll_attachment_retention_days` | 6 |
| `payroll.deprecated` **(read-only)** | #87 | `pdf_render_engine` | 1 |
| | | | **63** |

> **Correction to carry into the catalog:** `payroll_attachment_retention_days` belongs to **#56**
> (`### 56. Payroll Automation & Attachment Retention`), hence to `payroll.automation` — **not** to
> `payroll.payslips`, which a reader of the parent's §5.1 row (`#54, #88, #89, #90`) might assume
> because the key sounds payslip-ish. The registry heading is the authority.

#### 5.2.2 `statutory_configs` — 25 keys, 4 groups

| Group | Registry | Keys | n |
|---|---|---|---|
| `statutory.pf` | #47 | `pf_enabled`, `pf_employee_rate`, `pf_employer_rate`, `pf_wage_ceiling`, `pf_restrict_to_ceiling`, `pf_lop_reduces_ceiling`, `pf_include_overtime`, `eps_enabled`, `eps_rate`, `eps_wage_ceiling`, `pf_admin_charge_rate`, `pf_admin_charge_min`, `edli_enabled`, `edli_rate`, `edli_wage_ceiling` | 15 |
| `statutory.esi` | #48 | `esi_enabled`, `esi_employee_rate`, `esi_employer_rate`, `esi_wage_threshold`, `esi_include_overtime` | 5 |
| `statutory.pt` | #49p | `pt_enabled` | 1 |
| `statutory.income_tax` | #50p | `income_tax_enabled`, `tds_no_pan_rate`, `tds_no_pan_enforced`, `cess_rate` | 4 |
| | | | **25** |

All four groups carry **`module_key: 'payroll'`** (§1.4 (9)) and `featureKey: 'payroll.access'`.
**14 of these 25 are `DECIMAL`** — the densest comparator exposure in the catalog (§8).

#### 5.2.3 `document_settings` — 35 keys, 9 groups

A 1:1 key ↔ registry-entry mapping: 29 entries (#58–#86) + 6 entries (#91–#96) = 35 keys.

| Group | Registry | Keys | n |
|---|---|---|---|
| `documents.authority` | #58, #59, #60, #93 | `manager_can_view_team_documents`, `manager_direct_document_authority`, `document_require_separate_checker`, `manager_can_propose_letters` | 4 |
| `documents.storage` | #61, #62, #63, #64 | `document_view_url_ttl_seconds`, `document_upload_url_ttl_seconds`, `document_max_file_size_bytes`, `document_scan_required` | 4 |
| `documents.retention` | #65, #95 | `document_retention_days`, `letter_record_retention_days` | 2 |
| `documents.lifecycle` | #66, #67, #80, #81 | `employee_can_delete_verified_documents`, `document_default_verification_required`, `document_offboarding_archive_mode`, `document_offboarding_exit_pack_scope` | 4 |
| `documents.acknowledgement` | #68, #69, #70 | `document_acknowledgement_due_days`, `document_acknowledgement_blocking`, `document_signature_provider` | 3 |
| `documents.notifications` | #71–#76, #94 | `document_expiry_reminder_days`, `document_notify_hr_on_upload`, `document_notify_expiry`, `document_notify_pending_acknowledgement`, `document_notify_request_raised`, `document_notify_request_overdue`, `document_notify_letter_issued` | 7 |
| `documents.requests` | #77, #78 | `document_request_default_due_days`, `document_onboarding_completeness_threshold` | 2 |
| `documents.publishing` | #79 | `document_publish_sync_threshold` | 1 |
| `documents.letters` | #82–#86, #91, #92, #96 | `letter_branding_enabled`, `letter_preview_rate_per_hour`, `letter_reference_pattern`, `letter_default_confidential`, `letter_requires_acknowledgement_default`, `letter_bulk_max_subjects`, `letter_auto_issue_on_exit`, `letter_bulk_rate_per_hour` | 8 |
| | | | **35** |

#### 5.2.4 `document_letter_branding` — 13 keys, 1 group

| Group | Registry | Keys | n |
|---|---|---|---|
| `documents.branding` | #104 | `signatory_name`, `signatory_designation`, `registered_address_lines`, `cin`, `gstin`, `pan`, `tan`, `contact_email`, `contact_phone`, `website`, `accent_color_hex`, `footer_note`, `letterhead_enabled` | 13 |

The authority for this list is `_mapReplaceFields` (`document_letter_branding.service.js`): 11 text
fields + `registered_address_lines` + `letterhead_enabled`. **Nothing else on that table is a
setting** — see §5.3.

#### 5.2.5 `organization_profiles` — 2 keys, 1 group

| Group | Registry | Keys | n |
|---|---|---|---|
| `billing.notifications` | #97, #98 | `billing_notification_emails`, `billing_reminder_lead_days` | 2 |

`module_key: 'organization'`, **`featureKey: null`** (§1.4 (8), §7.6). Both are `JSONB` arrays with
model defaults `[]` and `[7, 1]` respectively.

### 5.3 What is on these tables but is **not** a setting — the projection rules

A column being writable does not make it a setting. The catalog must exclude the following, and the
read projection must never emit them. Each exclusion has a reason, so nobody re-adds it.

| Store | Excluded | Why | Enforced by |
|---|---|---|---|
| `organization_profiles` | the **16** org master-data keys in `fieldValidation_UpdateOrganizationProfile` — `org_name`, `org_alias`, `industry`, `size`, `website`, `phone_number`, `address_line_1`, `address_line_2`, `city`, `state`, `country`, `zip_code`, `description`, `founded_year`, `gst_number`, `company_pan_number` | Company identity, not a configuration decision. The registry's own addendum lists org master data under *deliberately not registry entries*. | `ORG_PROFILE_NON_SETTING_KEYS`, asserted by `T-S2` (§7.7) |
| `organization_profiles` | `logo_url`, `logo_storage_key` | Owned by the dedicated upload handshake; the storage key is `sensitive`. | not in catalog; `T-S18` |
| `document_letter_branding` | `logo_storage_key`, `logo_content_type`, `logo_size_bytes`, `signature_storage_key`, `signature_content_type`, `signature_size_bytes` | Asset columns, owned by the presign→confirm handshake. **Not writable through `_mapReplaceFields` at all.** The storage keys are `sensitive`. | `BRANDING_NON_SETTING_KEYS` (§7.5) |
| `document_letter_branding` | `superseded_asset_keys` (JSONB) | Service-layer bookkeeping for the BR-10 asset quarantine. Never in `toBrandingDto`, never in any client response. | never read by the adapter |
| `document_letter_branding` | `logo_present`, `signature_present`, `logo_content_type`, `logo_size_bytes`, `signature_content_type`, `signature_size_bytes`, `updated_at` from `toBrandingDto` | Derived asset *metadata*, not settings. `updated_at` is the ETag basis, not a value. | §7.5 projection |
| `document_letter_branding` | the `inherited` and `assets` sub-objects of `getOrCreate`'s return | `inherited` is a read-time fallback view of `organization_profiles`; `assets` is asset state. Neither is a setting value. | §7.5 projection |
| `payroll_settings` | `last_cutoff_reminder_on`, `last_payday_reminder_on`, `last_auto_draft_on`, `last_tax_declaration_reminder_on` (and any other `last_*` cron watermark) | **Engine-owned.** Absent from `updateSettingsSchema`, so no door can set them. Their absence from the catalog is what makes `T-S17` meaningful in Phase 2. | not in catalog; `T-S17` (P2) |
| all five | `id`, `org_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` | Row metadata. | `ROW_META_KEYS`, a single shared exclusion constant |

**D-P1-1 — exclusions are declared, not inferred.** Each adapter exports an explicit frozen
`nonSettingKeys` array. `T-S2` then asserts, two-sided:
`ownerWritableKeys == catalogKeys ∪ nonSettingKeys` **and** `catalogKeys ∩ nonSettingKeys == ∅`.
An owner adding a column lands in neither set and **fails the build** — which is the whole point, and
is strictly stronger than the parent's "catalog ⊆ owner" would have been.

### 5.4 Scope levels present in Phase 1

The user's brief asks which settings are system-, org-, user- or role-level. Answering from the data
rather than from a template:

| Scope | Present in Phase 1? | Where |
|---|---|---|
| **Organization (global)** | **Yes — this is the whole of Phase 1.** All 138 keys. | the five singletons |
| **Platform / ops** | **Read-only metadata only.** Published as a `platform_cap` annotation on #61, #62, #63, #79 so a UI can explain why an org value cannot be raised. **Never a value, never writable, never an env var echoed to a client.** | catalog field, §6.1 |
| **Per record / per policy** | **Metadata only** — the 49 surface descriptors. No values, no CRUD, no endpoint until Phase 4. | `catalog/surfaces.js` |
| **Per employee** | **No.** `employee_leave_configs` (#5, #6, #8, #11) is per-record, owned by Leave, reachable only as a surface descriptor. | — |
| **Role-specific** | **Not a storage scope — a *visibility* scope.** No setting is stored per role. Five keys are *readable* by `manager` because they govern the manager's own behaviour (#38, #40, #58, #59, #93). | §14.2 |
| **User-level preferences** | **Not Applicable — Reason:** no registry entry describes a per-user preference, and inventing a `user_settings` table would be the generic configuration system the brief and D-S6 both forbid. | — |

**There is no inheritance or fallback chain to resolve in Phase 1.** Every one of the 138 keys has
exactly one stored value for the org. The two places the word "fallback" appears in the registry are
both *within* a store and both owner-resolved at use time (#95 `null` → `document_retention_days`;
#86 `null` → the document type's default), and #104's text fields fall back to
`organization_profiles` **at render time**, inside `inheritedFromProfile()`. Phase 1 therefore
**publishes** these relationships as catalog metadata (`inherits_from`) and **resolves none of them**
(§15).

---

## 6. The Catalog — design

### 6.1 Entry shape

One frozen object per key. Fields are grouped by who needs them; a UI needs all of them, which is
the point (FR-2).

```text
{
  // ---- identity ----
  key:              'payroll_require_separate_checker',   // the COLUMN name, unique across catalog
  registry_ref:     39,                                   // 1..114
  group_key:        'payroll.authority',
  module_key:       'payroll',
  store:            'payroll_settings',

  // ---- presentation ----
  label:            'Require a separate checker',
  description:      null,                 // short; the registry Deep Explanation stays in the doc
  unit:             null,                 // 'days' | 'seconds' | 'bytes' | 'percent' | 'months' | null
  doc_ref:          'org_settings_registry.md#39',

  // ---- type contract (T-S2 asserts every line of this block) ----
  data_type:        'boolean',            // boolean|integer|decimal|string|enum|array|date|jsonb
  default:          false,
  nullable:         false,
  range:            null,                 // {min,max} | {enum:[...]} | {max_items,item:{...}} | null
  platform_cap:     null,                 // {source:'VIEW_TTL_CAP_SECONDS', value:900} | null

  // ---- behaviour ----
  effect_timing:    'next_record',        // immediate|next_record|next_run|next_cron_pass|inert
  risk:             'high',               // high|medium|low
  requires_reason:  true,                 // === (risk === 'high')
  resettable:       true,
  sensitive:        false,
  deprecated:       false,
  split:            false,                // true only for #49, #50
  normalised:       false,                // owner silently rewrites the submitted value (#104)
  clearable:        true,                 // false ⇒ a null write is a silent no-op (#104 accent)
  empty_clears:     false,                // '' ⇒ NULL in the owner (#104 text fields)
  inherits_from:    null,                 // key or store this falls back to when NULL

  // ---- relationships (published, never evaluated here) ----
  depends_on:       [],
  depends_on_ops:   [],                   // env flags, e.g. 'PDF_BULK_GENERATION_ENABLED'
  conflicts_with:   [],
  preconditions:    ['min_active_hr:2'],
  consumed_by:      ['payroll'],

  // ---- client guidance ----
  known_errors:     ['INSUFFICIENT_CHECKERS', 'SEPARATE_CHECKER_REQUIRED'],
  warnings:         [],                   // the registry's ⚠ texts, VERBATIM
  enforcement_hint: 'src/modules/payroll/services/employee_salary_structure.service.js'
}
```

**`range` is descriptive, not authoritative.** The owner's Joi schema is the enforcement boundary;
`T-S2` asserts the two agree, which is what lets a UI trust `range` for client-side hinting while the
server answer stays final. This is stated in the S-1 response documentation so no frontend treats it
as a contract it can validate against instead of submitting.

### 6.2 `groups.js`

```text
{
  key:         'payroll.authority',
  label:       'Approval authority',
  module_key:  'payroll',
  store:       'payroll_settings',
  featureKey:  'payroll.access',          // null ⇒ no entitlement gate (billing.notifications only)
  read_roles:  ['hr', 'manager'],
  write_roles: ['hr'],                    // [] ⇒ read-only group (payroll.deprecated only)
  order:       30                          // stable UI ordering; not semantic
}
```

All 26 groups, with `featureKey` taking exactly one of the four verified keys or `null`:

| featureKey | Groups |
|---|---|
| `payroll.access` | the 11 `payroll.*` + the 4 `statutory.*` = **15** |
| `documents.access` | the 9 `documents.*` + `documents.branding` = **10** |
| `null` | `billing.notifications` = **1** |
| `leave.access`, `attendance.access` | **0 writable groups** — Leave (#1–#12) and Attendance (#13–#29, #99–#103, #114) are entirely per-record. They appear only in `surfaces.js`, where entitlement projection still applies in Phase 4. |

**D-P1-2 — `featureKey: null` means "no gate", not "always allowed".** The group is still behind
`authenticate` + `authorize(['hr'])` + `requireActiveOrg`. `billing.notifications` gets `null`
because no `billing.access` or `organization.access` feature key exists (pre-flight 7) and
**inventing one would require a seeder and a plan-feature row** — new billing data for a settings
read, which is out of scope by any reading of the brief. `T-S6` asserts the closed set
`{payroll.access, documents.access, leave.access, attendance.access, null}`.

### 6.3 Load-time invariants — fail the boot, not the request

`catalog/index.js` runs these at `require` time and throws on any failure. The parent's eight,
restated precisely and with the two Phase-1 refinements marked:

| # | Invariant | Fails when |
|---|---|---|
| 1 | every `key` is unique across all five catalog files | a copy-paste duplicate |
| 2 | every `registry_ref` 1–114 appears **at least once** across catalog ∪ surfaces; no ref appears in two **modules**; a ref in more than one **group** must carry `split: true` *(refined — §1.4 (9))* | a missed or misfiled entry; an accidental multi-group key |
| 3 | every `group_key` resolves in `groups.js`, and every group maps to **exactly one** `store` | D-S4 broken — this is the invariant Phase 2's atomicity rests on |
| 4 | every `depends_on` / `conflicts_with` / `inherits_from` names an existing key | a typo that would make a UI disable the wrong toggle |
| 5 | every `preconditions` id exists in `preconditions.js` | P4 would have no probe |
| 6 | every `default` type-matches its `data_type` (via `valuesEqual`'s type table, `null` allowed only when `nullable`) *(refined — uses §8's comparator so a DECIMAL default may be authored as a number)* | a string `'7'` where an integer belongs |
| 7 | every `risk: 'high'` key has a non-empty `warnings[]` **and** `requires_reason: true` | a silent high-risk key |
| 8 | no `read_roles` or `write_roles` contains `admin` or `super-admin` | the platform/tenant plane boundary breached in data |

Plus three this plan adds, because each is a mistake that would otherwise ship silently:

| # | Invariant | Why |
|---|---|---|
| 9 | every `store` in `groups.js` has exactly one adapter in `adapters/index.js`, and vice versa | a group with no adapter returns `undefined` values; an adapter with no group is dead code |
| 10 | `effect_timing` is non-null and one of the five allowed values for **every** catalog key | §1.3 (3) — the one field nothing else can check |
| 11 | `sensitive: true` keys and `catalogKeys ∩ nonSettingKeys` are both empty for every adapter | a `sensitive` key in the catalog would be served by S-1 even though S-3 omits its value, leaking its existence |

**D-P1-3 — the invariants run at module load, in production, every boot.** Not only in tests. A
catalog that fails invariant 3 would let Phase 2 write across two stores in one request; a process
that refuses to start is unambiguously better than one that serves a wrong contract. `T-S4` proves
both directions: the real catalog passes, and a deliberately malformed fixture throws.

### 6.4 Freezing

`deepFreeze` applied to the assembled catalog, recursively through arrays and nested range objects.
Exported as a single frozen object. `T-S7` asserts a mutation attempt throws in strict mode.

Reason beyond hygiene: the projection functions (§12.3) build their output by **copying** from the
catalog. A frozen source makes "accidentally handed the caller a mutable reference to the shared
catalog, who then mutated it for every subsequent request" structurally impossible. That bug class is
invisible in testing and catastrophic in production.

### 6.5 `catalog_version`

A hand-maintained string, `'2026-10-09.1'`, exported from `catalog/index.js`. It is:

* the `ETag` for S-1 and S-2 (`W/"<catalog_version>"`), and
* echoed in S-3/S-4 so a client can detect that its cached catalog is stale.

**D-P1-4 — it is bumped by hand, in the same commit as any catalog edit.** A hash of the catalog
would be automatic but would change on a comment or a key reorder, invalidating every client's cache
for nothing. A date-plus-counter is reviewable in a diff, which matters more here than automation:
the catalog is an API contract. `T-P1-3` asserts the version matches `/^\d{4}-\d{2}-\d{2}\.\d+$/`;
keeping it *correct* is a review obligation, listed in §22.1.

### 6.6 Authoring procedure — filling 138 entries without guessing

This is the bulk of Phase 1's effort and the place where fabrication is most tempting. The procedure
is mechanical, and every field has exactly one authority:

| Field | Authority — in this order, no second-guessing |
|---|---|
| `key`, `data_type`, `nullable` | the **model** column definition |
| `default` | the **model** `defaultValue`, or the owner's defaults object (`DOCUMENT_SETTINGS_DEFAULTS`). **No model default and not nullable ⇒ `default: null` and a `// no column default` comment** |
| `range` | the owner's **Joi** `min`/`max`/`valid(...)`/`max()`, plus `SETTINGS_CAPS` for document keys |
| `registry_ref`, `label`, `unit` | the registry **heading** `### N. Title (\`keys\`)` |
| `effect_timing`, `risk`, `warnings`, `consumed_by`, `depends_on`, `conflicts_with`, `preconditions` | the registry **entry body** (Deep Explanation, `⚠`, Enforcement Point) |
| `platform_cap` | the named constant in code (`VIEW_TTL_CAP_SECONDS`, `UPLOAD_TTL_CAP_SECONDS`, `ORG_CEILING_BYTES`, `ORG_PUBLISH_SYNC_LIMIT`) |
| `enforcement_hint`, `known_errors` | the registry's Enforcement Point, **confirmed by opening the file** |

**Rule: if two authorities disagree, stop and record it — do not average them.** A disagreement is
either a registry defect (fix the registry, as DEF-S1/S2/S3 are being fixed in this phase) or a real
code defect (new `DEF-S` number, raised to the user). `T-S2` will catch the `data_type`/`default`/
`range`/`nullable` family automatically; the behavioural fields are where a human has to be honest.

**Suggested authoring order, cheapest-to-verify first:** `statutory.*` (25 keys, homogeneous,
heavily DECIMAL) → `documents.*` (35, 1:1 with registry entries, `MUTABLE_FIELDS` already frozen) →
`billing.notifications` (2) → `documents.branding` (13) → `payroll.*` (63, the most heterogeneous).
Run `T-S2` after each file, not at the end.

---

## 7. The Adapters

### 7.1 The contract (Phase 1 subset)

```text
{
  store:            'payroll_settings',
  groups:           ['payroll.calendar', ...],        // must equal groups.js's reverse map
  featureKey:       'payroll.access',

  read(orgId):      Promise<{ values: PlainObject, updatedAt: Date }>,

  ownerWritableKeys(): string[],   // from the OWNER's own export — never a literal list here
  nonSettingKeys:   Object.freeze([...]),  // §5.3 — the declared exclusions

  concurrencyField: 'updated_at'
}
```

**Four rules every adapter obeys, each of which `T-P1-4` checks:**

1. **`read` returns plain data, never a Sequelize instance.** The service and projection layers must
   not be able to call `.update()` or `.save()` on anything. This is D-S1 enforced by data shape, not
   by discipline.
2. **`read` returns `updatedAt` separately from `values`.** The ETag needs it; the values map must
   not contain it (it is not a setting — §5.3).
3. **`read` takes no transaction and opens none.** Phase 1 has no in-transaction read path. The
   signature deliberately omits an options object so Phase 5 has to *add* one consciously, at which
   point §11.4's "never serve a cached value inside a write transaction" rule becomes a visible
   decision rather than a default.
4. **No adapter contains an `update`, `create` or `destroy` method in Phase 1.** Not even a stub that
   throws. An empty seat invites someone to fill it before the Phase 2 pre-checks exist.

### 7.2 `payroll_settings.adapter.js`

```text
read(orgId):
  row = await payrollSettingsService.getOrCreate(orgId)      // positional txn arg omitted
  return { values: pick(row.get({ plain: true }), catalogKeysFor(this.groups)),
           updatedAt: row.updated_at }

ownerWritableKeys(): Object.keys(payrollHrValidator.updateSettingsSchema.describe().keys)   // 63
nonSettingKeys: ROW_META_KEYS + the four last_* cron watermarks
```

* `getOrCreate` lazily provisions via `findOrCreate` + the `UNIQUE (org_id)` backstop — unchanged
  behaviour, including its own short transaction and its `SequelizeUniqueConstraintError` re-read.
* **`paranoid: true`:** do not pass `paranoid: false`; a soft-deleted settings row must stay invisible.
* **DECIMAL keys here: 5** — `overtime_rate_multiplier`, `standard_working_hours_per_day`,
  `loan_max_amount`, `loan_max_interest_rate`, `loan_default_interest_rate`. They arrive as strings.
  The adapter passes them through **unchanged** — no `Number()` coercion (§8.4).
* **DEF-S7 (no `FOR UPDATE`) is irrelevant to this adapter.** It is a write-path defect; a read takes
  no lock today and needs none. Phase 2 owns it.

### 7.3 `statutory_config.adapter.js`

```text
read(orgId):
  row = await statutoryConfigService.getConfig(orgId)
  return { values: pick(...), updatedAt: row.updated_at }

ownerWritableKeys(): Object.keys(payrollHrValidator.updateStatutoryConfigSchema.describe().keys)  // 25
```

* `getConfig(orgId)` takes **no transaction parameter** — it always opens its own. Nothing in Phase 1
  needs otherwise; do not add one.
* **14 of 25 keys are DECIMAL.** This adapter is the comparator's main customer.
* `statutory_configs` is frozen into `payroll_runs.settings_snapshot` at run CREATE. The adapter
  **never** reads a snapshot, and S-3/S-4 report the **live** config. The catalog's
  `effect_timing: 'next_run'` on all 25 keys is what tells a UI that the live value is not what an
  in-flight run is using.

### 7.4 `document_settings.adapter.js`

```text
read(orgId):
  row = await documentSettingsService.getOrCreate(orgId)
  return { values: pick(...), updatedAt: row.updated_at }

ownerWritableKeys(): [...documentSettingsService.MUTABLE_FIELDS]    // 35, already frozen
```

The cleanest of the five: the owner already exports a frozen 35-key list, its Joi schema describes
the same 35, and the registry maps 1:1. `T-S2` for this adapter is a three-way equality.

### 7.5 `document_letter_branding.adapter.js` — the one with traps

Three Phase-1 rules, each verified in the owner's source, each of which would be a real defect if
missed:

```text
read(orgId):
  res = await letterBrandingService.getOrCreate(orgId, { includeAssetUrls: false })   // ◀ MANDATORY
  dto = res.branding
  return { values: pick(dto, BRANDING_SETTING_KEYS /* the 13 */), updatedAt: dto.updated_at }
```

| # | Trap | Consequence if missed | Rule |
|---|---|---|---|
| 1 | `getOrCreate(orgId, { includeAssetUrls: true })` signs **two S3 presigned URLs** per call | every `GET /settings` makes two network round-trips to S3 and puts asset URLs into a settings response | **always pass `includeAssetUrls: false`** (it is also the default — pass it explicitly anyway, so the intent survives a future default change). `T-P1-5` asserts the call argument. |
| 2 | the return is `{ branding, inherited, assets }`, **not a row** | spreading the whole thing into `values` would emit `logo_present`, `signature_content_type`, 12 `inherited` org-profile fields and the asset block as if they were settings | pick exactly the **13** keys. `inherited` and `assets` are dropped entirely (§5.3). |
| 3 | `getOrCreate` writes a `letter_branding.initialized` **audit row** on first creation | a read appears in the audit trail | accepted, pre-existing, **documented** (§1.3 (1), §17.1). Do not suppress it — suppressing would mean forking the owner's method. |

* `accent_color_hex` is `CHAR(7) NOT NULL` with default `'#1F2937'`; catalog `nullable: false`,
  `clearable: false`.
* `registered_address_lines` is `ARRAY(STRING(120)) NOT NULL DEFAULT []`; catalog `max_items: 5`,
  `normalised: true`.
* The 11 text fields are `empty_clears: true` and `inherits_from: 'organization_profiles'`.
* `superseded_asset_keys` is never read.

### 7.6 `organization_billing.adapter.js` — the subset one

```text
read(orgId):
  row = await organizationRepository.findOrganizationProfileByOrgId(orgId)
  if (!row) throw new AppError(404, 'Organization profile not found', 'ORG_PROFILE_NOT_FOUND')
  return { values: pick(row.get({ plain: true }), ['billing_notification_emails',
                                                   'billing_reminder_lead_days']),
           updatedAt: row.updated_at }

ownerWritableKeys(): Object.keys(organizationValidator
                       .fieldValidation_UpdateOrganizationProfile.describe().keys)      // 18
nonSettingKeys: ORG_PROFILE_NON_SETTING_KEYS    // the 16 of §5.3, frozen
```

* **No lazy provisioning.** Unlike the other four, this row is created at registration. A missing row
  is an anomaly; the adapter throws `404 ORG_PROFILE_NOT_FOUND` (the same code
  `organization.service` already uses at three sites), and S-3's partial-failure contract turns it
  into `unavailable_groups: [{ key: 'billing.notifications', reason: 'READ_FAILED' }]` rather than
  failing the whole page (§18, EC-S9).
* **`featureKey: null`** — D-P1-2.
* **Reads a repository, not a service** — D-P1-5, §1.3 (4). Phase 2's DEF-S10 fix adds a locked
  pre-read to `organization.service`; **when that lands, this adapter should switch to it**, and
  that switch is listed in Phase 2's entry notes (§28) so the repository dependency does not become
  permanent by accident.
* `organization_profiles` has **no `updated_by`** column and the repository comment says callers must
  not add one. Phase 1 writes nothing, so this only matters as a note for Phase 2.

### 7.7 `T-S2` — the drift test, made writable

The parent's "catalog key set ≡ owner's mutable-field list" holds for three adapters and is
impossible for two (§1.4 (5)). The single form that works for all five:

```text
for each adapter A:
  owner    = new Set(A.ownerWritableKeys())
  catalog  = new Set(catalogKeysForGroups(A.groups))
  excluded = new Set(A.nonSettingKeys)

  assert disjoint(catalog, excluded)                       // invariant 11
  assert setEqual(owner, union(catalog, excluded))         // ◀ the two-sided gate
```

| Adapter | owner | catalog | excluded (settings-relevant) |
|---|---|---|---|
| `payroll_settings` | 63 | 63 | 0 *(the `last_*` watermarks are not in the Joi schema, so they are not in `owner` either)* |
| `statutory_config` | 25 | 25 | 0 |
| `document_settings` | 35 | 35 | 0 |
| `document_letter_branding` | 13 | 13 | 0 *(asset columns are not writable through `_mapReplaceFields`)* |
| `organization_profiles` | **18** | **2** | **16** |

So the equality is non-trivial for exactly one adapter — and that is the one where a silent mistake
(16 master-data fields exposed as settings, writable in Phase 2) would be worst.

**Then, per key, for every adapter:**

| Assertion | Source compared against |
|---|---|
| `range` equals the Joi `min`/`max`/`valid(...)`/`max()` where the owner declares one | `schema.describe().keys[k].rules` / `.allow` / `.valid` |
| `default` equals the model `defaultValue` (via `valuesEqual`, so a DECIMAL number default matches) | `db`-free: read the model's attribute definition through the model factory, **not** a live connection |
| `nullable` equals the Joi `.allow(null)` presence, and the model `allowNull` | both |
| `data_type` is consistent with the model's Sequelize type | model |

**Model access without a database.** `*.model.js` exports `(sequelize, DataTypes) => Model`. The test
instantiates a throwaway `new Sequelize('sqlite::memory:', { logging: false })`-style stub **only to
obtain attribute metadata** — or, preferably, requires the already-built `db` registry, which
`models.index.js` constructs at require time **without connecting** (Sequelize defers connection
until the first query). Either way **no query is issued**, which is what keeps `T-S2` inside the
"no test touches a database" rule. Verify this during Step 2 of §20 and, if the registry turns out to
connect eagerly, fall back to parsing the model factory with the stub.

---

## 8. The Value Comparator — `settings_value.utils.valuesEqual()`

### 8.1 Why it is in Phase 1

Parent §7.10a places this in Phase 2. It belongs here: **`non_default_keys` ships in S-3 and S-4**,
and it is computed as `valuesEqual(stored, catalogDefault, data_type)`. With `!==`, a stored
`'2.00'` compared against a catalog default `2.00` is "different", so **every untouched organization
would be reported as having non-default decimals** on 19 keys. That is not a cosmetic bug: it is the
field a UI draws "modified" badges from, so it would be confidently wrong on the first screen a
customer sees.

### 8.2 The fact it rests on

`pg` returns `NUMERIC`/`DECIMAL` as **JavaScript strings** to preserve exact precision. Verified in
this repository, not assumed:

* no `pg.types.setTypeParser`, `decimalNumbers` or equivalent override exists anywhere in `src/` or
  `configs/` (pre-flight 10);
* Sequelize `6.37.8`'s `DECIMAL` declares no `parse`, so pg's default applies.

**19 DECIMAL columns:** 5 on `payroll_settings` (§7.2), 14 on `statutory_configs` (§7.3).

### 8.3 What this does *not* mean — a correction to DEF-S11

The parent plan states that `payroll_settings.service.js:99` can "already record a phantom change".
**It cannot, and Phase 2 should not change it.** Both sides of that comparison are DB-typed:

| Side | Origin | DECIMAL arrives as |
|---|---|---|
| `before[key]` | `current.toJSON()`, where `current = payrollSettingsRepo.findOrCreate(...)` | string |
| `updated[key]` | `payrollSettingsRepo.update()` → `PayrollSettings.update(data, { returning: true })` → `rows[0]`, built from the DB's `RETURNING` output | string |

`'2.00' !== '2.00'` is `false`, so no phantom diff. `statutory_config.service.js:84` already carries a
comment asserting exactly this property, and it is correct.

**The real exposure is at the gateway boundary**, where one side is *not* DB-typed:

| Comparison | Left | Right | Needs the comparator? |
|---|---|---|---|
| `non_default_keys` (S-3/S-4, **Phase 1**) | DB value — `'2.00'` | catalog default — `2.00` | **Yes** |
| `changed` / `unchanged_keys` (S-5, Phase 2) | submitted patch — `2.5` | stored value — `'2.00'` | **Yes** |
| `T-S2` default parity (**Phase 1**) | catalog default — `2.00` | model `defaultValue` — `2.00` | Yes, for type tolerance |
| owner audit diff (`payroll:99`, `statutory:88`) | DB string | DB string | **No — leave it alone** |

Consequence for scope: `valuesEqual()` and `T-S59` move **into Phase 1**; the Phase 2 edit to
`payroll_settings.service.js` is **removed** from the plan. Changing a shipped owner's audit diff for
a defect that does not reproduce would violate "preserve existing behaviour unless explicitly
changing it", and would put a behavioural change inside a transaction that writes audit rows.

### 8.4 The contract

```text
valuesEqual(a, b, dataType) -> boolean

  both null                      -> true        (for every type)
  exactly one null               -> false       (for every type; null is NEVER equal to 0, '' or [])

  'decimal'   -> Number(a) === Number(b)
  'integer'   -> Number(a) === Number(b)
  'boolean'   -> a === b
  'string'    -> a === b                        no trimming, no case folding
  'enum'      -> a === b                        enums are case-significant
  'array'     -> a.length === b.length && every index equal, ORDER-SENSITIVE
  'date'      -> ISO-date-string comparison, not Date object identity
  'jsonb'     -> stable-key-sorted JSON.stringify comparison
```

Four deliberate choices, each one a place a reasonable engineer would do the opposite:

1. **Arrays are order-sensitive.** `[7,1]` ≠ `[1,7]`. #98's reminder lead days and #104's
   `registered_address_lines` both render in order, so treating a reorder as "unchanged" would
   silently discard a real edit. The comparator does **not** normalise on the owner's behalf — the
   owner still de-duplicates and sorts where its own contract says so.
2. **`null` is never equal to `0`, `''` or `[]`.** For #95 and #86, `null` means *inherit* and is a
   distinct, meaningful state. Collapsing them would make `non_default_keys` lie about the one
   property those keys exist to express.
3. **No coercion outside the numeric types.** A `'true'` string is not equal to `true`. If that ever
   fires, the bug is upstream and should be loud.
4. **The comparator never consults the catalog.** It takes `dataType` as an argument. A pure,
   three-argument function with no imports is trivially testable and cannot develop a dependency on
   the thing it is used to validate.

`valuesEqual` is also used by load-time invariant 6 (§6.3), which is why it lives in `utils/` and is
required by `catalog/index.js` — the one permitted direction (`utils` → nothing, `catalog` → `utils`).

### 8.5 Tests

| ID | Assertion |
|---|---|
| `T-S59` | `valuesEqual('2.00', 2.00, 'decimal') === true`; `valuesEqual('2.00', 2.50, 'decimal') === false`; `valuesEqual([7,1],[1,7],'array') === false`; `valuesEqual(null, 0, 'integer') === false` |
| `T-P1-6` | for each of the 19 DECIMAL keys, a stored string equal to the catalog default yields an **empty** `non_default_keys` — the regression that motivated moving this into Phase 1 |
| `T-P1-7` | `valuesEqual(null, null, t) === true` and `valuesEqual(null, x, t) === false` for every one of the eight `dataType` values |
| `T-P1-8` | `jsonb` comparison is key-order-insensitive: `{a:1,b:2}` equals `{b:2,a:1}` |

---
## 9. Database Layer

**Not Applicable — Reason:** Phase 1 creates **no table, no column, no index, no constraint and no
migration.** All 138 settings already live in typed columns on five existing tables, each with its
own PK, `org_id` FK, uniqueness and check constraints established by the migrations that created
them. Phase 1 only *reads* them, through the owning modules' own services.

This is a deliberate architectural position, not an omission, and it is the single biggest reason
Phase 1 is safe to deploy:

| Question the brief asks | Answer for Phase 1 |
|---|---|
| New tables / columns / PKs / FKs | none |
| Unique constraints | none added. The existing `UNIQUE (org_id)` on `document_settings` and `document_letter_branding` is what makes the owners' `getOrCreate` race-safe; Phase 1 relies on it and adds nothing. |
| Check constraints | none added. Range enforcement is Joi-side in every owner today; the catalog *describes* those ranges (§6.1) and `T-S2` keeps the description honest. Adding CHECK constraints now would be a destructive-risk migration (existing rows could violate them) for no Phase 1 benefit. |
| Indexes | none. Every Phase 1 query is `WHERE org_id = ?` on a table that already has a unique or PK-backed index on `org_id`. At most 5 single-row lookups per request. |
| Defaults / nullability | unchanged; **mirrored** into the catalog and asserted by `T-S2`. |
| Scope / tenant relationships | unchanged: every store is already keyed by `org_id`. |
| Audit relationships | unchanged: the owners already write to `payroll_audit_logs` / `document_audit_logs`. |
| Migration ordering, rollback, data preservation | **Not Applicable** — nothing to order or roll back. |

**Migration `00073-create-settings-change-logs.js` is Phase 3 work and must not be written in
Phase 1.** Writing it early would leave an unrun migration blocking the operator's next deploy for a
table no Phase 1 code reads (see the standing constraint: migrations are handed back unrun, so an
unnecessary one is pure operational cost).

**Deviation check.** If, during implementation, a `T-S2` failure turns out to be a genuine *model*
defect (a wrong `defaultValue`, a missing `allowNull`), **do not fix it in Phase 1.** Record it as a
new `DEF-S` entry and raise it. A column default change is a migration, and a migration in a
zero-migration phase is exactly the "smallest safe architectural change" rule being violated.

---

## 10. API Layer

### 10.1 The four endpoints

| ID | Method & path | Registry # | Purpose | Values? | Auth |
|---|---|---|---|---|---|
| **S-1** | `GET /api/v1/settings/catalog` | #242 | the metadata contract: groups + entries, no values | **no** | hr, manager |
| **S-2** | `GET /api/v1/settings/catalog/:settingKey` | #243 | one entry's full metadata incl. relationships | **no** | hr, manager |
| **S-3** | `GET /api/v1/settings` | #244 | every readable group with current values | yes | hr, manager |
| **S-4** | `GET /api/v1/settings/groups/:groupKey` | #245 | one group with current values | yes | hr, manager |

**Why four and not fewer, and why no more** — the brief says *do not create APIs merely because they
are technically convenient*:

* **S-1 earns its place** because the metadata is large (138 entries + 26 groups + 49 surfaces),
  identical for every org on a given deploy, and separately cacheable against `catalog_version`. Were
  it fused into S-3 the client would re-download the whole contract on every page load.
* **S-3 earns its place** because the alternative is a client making 26 requests, one per group, to
  render one settings page — and because `unavailable_groups` (entitlement, read failure) is a
  page-level concept that only a page-level endpoint can express.
* **S-4 earns its place** because a single-group refresh after a Phase 2 write is the dominant
  interaction, and re-fetching 26 groups to show one is waste.
* **S-2 is the weakest of the four** and is included only because the catalog carries per-key
  relationship data (`depends_on`, `conflicts_with`, `preconditions`, `known_errors`, `warnings`)
  that a detail drawer needs and that S-1 could otherwise be pressured into inlining for all 138
  keys. It returns **metadata only** — it is not a "get one value" endpoint, and deliberately so: a
  per-key value endpoint would invite N+1 reads of a singleton row.

**Explicitly not created in Phase 1:** any `PUT`/`PATCH`/`POST`/`DELETE`; `GET /settings/:key`
(single value); `GET /settings/history`; `GET /settings/surfaces`; `GET /settings/readiness`;
`GET /settings/export`; anything under `/employees/:id/settings`.

### 10.2 Common request/response conventions

* **Envelope** — `{ success: true, message: 'OK', data: {...} }`, from the shared `envelope()` helper
  pattern (§3.2). Errors go through `next(err)` to the global handler, which renders
  `{ success: false, message, errorCode, details? }`.
* **`Cache-Control: private, max-age=0, must-revalidate`** on all four. Settings are tenant data;
  no shared cache may hold them.
* **`ETag`** — S-1/S-2: `W/"<catalog_version>"`. S-3/S-4: `W/"<catalog_version>:<updated_at ISO>"`
  (S-4) or `W/"<catalog_version>:<max(updated_at) ISO>"` (S-3). **`If-None-Match` is honoured with
  `304`** on all four; this is cheap (the comparison happens after the read, so it saves bandwidth,
  not database work) and it establishes the exact token Phase 2's `If-Match` will consume. A client
  that learns the token from a read can use it as a write precondition without a second contract.
* **No pagination.** Fixed, small, bounded collections (26 groups, 138 keys). Paginating a catalog
  would be the "technically convenient API" the brief warns against.
* **`orgId` is never a parameter.** It comes from `req.user.orgId` only — §14.3.

### 10.3 S-1 — `GET /settings/catalog`

**Query** (validated in the controller, Express 5 — §4.4):

| Param | Type | Rule |
|---|---|---|
| `module` | string | optional; one of `payroll`, `document`, `organization`, `leave`, `attendance` |
| `group` | string | optional; must exist in `groups.js`; mutually exclusive with `module` → `422 INVALID_FILTER_COMBINATION` |
| `include_hidden` | boolean | optional, default `false`; when `true`, deprecated groups/keys are included. **Never exposes `sensitive` keys** — there are none in the catalog, by invariant 11. |

**Response `data`:**

```text
{
  catalog_version: '2026-10-09.1',
  generated_at:    '2026-10-09T...Z',
  groups: [ { key, label, module_key, store, feature_key, readable, writable,
              entitled, order, setting_count } ],
  settings: [ <catalog entry, minus enforcement_hint> ],
  surfaces: [ { registry_ref, key, label, module_key, owner_table, owner_endpoint_hint,
                scope: 'per_record', managed_by } ],
  counts: { groups, settings, surfaces }
}
```

Three projection rules, all enforced in `settings_projection.utils` (§12.3):

1. **`enforcement_hint` is stripped from every API response.** It is an internal source path. Serving
   it would publish the module's file layout to any authenticated manager — low severity, zero
   benefit, so it stays server-side (it exists for `T-S14` and for developers reading the catalog).
2. **`readable` / `writable` are computed for the caller's role**, not copied from the group. A
   `manager` sees `writable: false` on every group.
3. **`entitled`** is the entitlement answer for the group's `featureKey` (`true` when `null`).
   A non-entitled group is still **listed** with `entitled: false` — the metadata contract is the
   same for every org on a deploy, and hiding groups would make a UI unable to explain why a feature
   is missing. **Values are a different matter: S-3/S-4 omit them entirely** (§10.5).

**No values anywhere in this response.** `T-S12` asserts the serialised body contains no key named
after any of the 138 settings outside the `settings[].key` field, which is the mechanical form of
"S-1 cannot leak a tenant value".

### 10.4 S-2 — `GET /settings/catalog/:settingKey`

* `settingKey` — `string`, `[a-z0-9_]{1,80}`; validated before lookup so a hostile key cannot reach
  anything. Unknown key → **`404 SETTING_NOT_FOUND`**.
* Response `data` = `{ catalog_version, setting: <entry minus enforcement_hint>, group: {...},
  related: { depends_on: [...], conflicts_with: [...], inherits_from: ... } }`, where `related`
  entries are **resolved to `{key, label, group_key}` stubs** so a drawer can render links without a
  second round-trip, and resolution cannot fail because invariant 4 guarantees every reference exists.
* **A deprecated or non-entitled key still resolves here**, with its flags. A `404` for a key the
  client can see in S-1 would be incoherent.
* **Not Applicable — values:** S-2 returns no value. If the caller needs the value they call S-4 for
  the group. Stated explicitly because "get setting by key" reads like a value endpoint.

### 10.5 S-3 — `GET /settings`

**Query:** `modules` — optional comma-separated subset of module keys; unknown module →
`422 UNKNOWN_MODULE`. Absent means all.

**Response `data`:**

```text
{
  catalog_version: '2026-10-09.1',
  org_id:   '<uuid>',
  groups: [
    {
      key: 'payroll.calendar',
      label, module_key, store,
      readable: true, writable: true, entitled: true,
      values: { payroll_cycle: 'monthly', period_start_day: 1, ... },
      non_default_keys: ['pay_day'],
      updated_at: '2026-09-30T...Z',
      etag: 'W/"2026-10-09.1:2026-09-30T...Z"'
    }
  ],
  unavailable_groups: [ { key, reason: 'NOT_ENTITLED' | 'READ_FAILED' | 'NOT_READABLE' } ],
  meta: { stores_read: 5, groups_returned: 25, groups_unavailable: 1 }
}
```

**Five rules that make this endpoint correct rather than merely functional:**

1. **One read per *store*, not per group.** 26 groups share 5 stores; the read service reads each
   store **at most once** and fans the result out to its groups. Naïvely reading per group would
   issue 26 single-row queries, five of which would also each trigger a `getOrCreate` transaction.
   `T-P1-9` counts adapter invocations and asserts ≤ 5.
2. **One entitlement check per distinct `featureKey`, not per group.** `entitlementService.hasFeature`
   performs up to three queries per call; the 26 groups span only **two** non-null feature keys, so
   the service resolves `{payroll.access, documents.access}` once each and reuses the answers.
   Per-group checking would be 25 calls ≈ 75 queries for one page load. `T-P1-10`.
3. **A store is read only if at least one of its groups survives RBAC + entitlement.** A `manager`
   with no payroll entitlement must not cause a `payroll_settings` row to be provisioned. Order is
   therefore **filter → read**, never read → filter.
4. **`unavailable_groups` is a first-class part of the contract, not an error.** A non-entitled or
   failed group yields `200` with the group listed there. Returning `403` for the whole page because
   one of five stores is unavailable would make the settings page unloadable for an org that simply
   has not bought payroll.
5. **`updated_at` is per group, sourced from the store's row** — so all 11 `payroll.*` groups share
   one timestamp. That is correct and must be documented, because a client might otherwise infer
   per-group change tracking that does not exist.

**Response size:** 138 values + 26 group metadata objects ≈ 40–60 KB. Acceptable for an
authenticated, non-paginated admin page; recorded here so nobody is surprised, and noted in §27 as
the one thing that would justify Phase 5's cache.

### 10.6 S-4 — `GET /settings/groups/:groupKey`

* `groupKey` — `string`, `[a-z0-9_.]{1,60}`. Unknown → **`404 GROUP_NOT_FOUND`**.
* Not readable by the caller's role → **`403 FORBIDDEN`** (not 404 — the group's *existence* is
  already public via S-1, so hiding it here would be theatre; what matters is that the **value** is
  withheld).
* Not entitled → **`403 FEATURE_NOT_AVAILABLE`**, matching `requireFeature`'s existing code and
  status exactly, so a client already handling that code needs no change.
* Response `data` = one group object in the same shape as an S-3 element, plus
  `settings: [<catalog entries for this group>]` so a single-group screen needs no S-1 call.
* `304` on `If-None-Match` match.

**Why the status codes differ between S-3 and S-4 for the same condition.** S-3 is a page load
(degrade, report in `unavailable_groups`); S-4 is a targeted request for one named resource
(fail loudly). This asymmetry is deliberate and is written into the change record so the frontend
implements both paths.

### 10.7 Error catalogue

| Code | Status | Raised by | Condition |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | `authenticate` | missing/invalid/blacklisted token |
| `FORBIDDEN` | 403 | `authorize` / read service | role not in `read_roles` |
| `ORG_NOT_ACTIVE` | 403 | `requireActiveOrg` | org suspended/inactive |
| `FEATURE_NOT_AVAILABLE` | 403 | read service (S-4 only) | group's feature not on the plan |
| `SETTING_NOT_FOUND` | 404 | catalog service | unknown `:settingKey` |
| `GROUP_NOT_FOUND` | 404 | catalog service | unknown `:groupKey` |
| `ORG_PROFILE_NOT_FOUND` | 404 | org adapter (S-4 only) | profile row absent — §7.6 |
| `VALIDATION_ERROR` | 422 | `validateOrThrow` | malformed query/param |
| `INVALID_FILTER_COMBINATION` | 422 | S-1 controller | `module` and `group` both given |
| `UNKNOWN_MODULE` | 422 | S-3 controller | unknown module in `modules` |
| `ENTITLEMENT_DEPENDENCY_FAILURE` | 503 | `entitlementService` | database unreachable — **propagated unchanged**, never flattened to `NOT_ENTITLED` |

**The 503 propagation is load-bearing.** `entitlementService.hasFeature` deliberately throws 503
rather than returning `false` during a database outage, precisely so users are not told to upgrade
their plan during an incident. The settings read service must let that `AppError` escape; catching it
into `unavailable_groups: [{reason: 'NOT_ENTITLED'}]` would re-introduce the bug that service's
comment documents. `T-P1-11` asserts the 503 propagates.

---

## 11. Controller Layer

`settings.controller.js` — four handlers, each with the same five-step body and **no business rule**:

```text
async function getGroup (req, res, next) {
  try {
    const c = ctx(req)                                                       // 1 context
    const { groupKey } = validateOrThrow(schemas.groupKeyParam, req.params)  // 2 validate
    const ifNoneMatch = req.headers['if-none-match'] || null
    const data = await readService.getGroup(c, groupKey)                     // 3 delegate
    if (ifNoneMatch && ifNoneMatch === data.etag) return res.status(304).end()
    res.set('ETag', data.etag)
    res.set('Cache-Control', 'private, max-age=0, must-revalidate')
    return res.status(200).json(envelope(data))                              // 4 respond
  } catch (err) { return next(err) }                                         // 5 propagate
}
```

**What the controller does:** build `ctx(req)`; validate `req.query` / `req.params` into locals; read
`If-None-Match`; call exactly one service method; set `ETag` / `Cache-Control`; wrap in `envelope()`;
`next(err)`.

**What the controller must never do** — each of these has been seen in review, and each belongs to a
named layer instead:

| Forbidden in the controller | Belongs to |
|---|---|
| decide whether a role may read a group | `settings_projection.utils`, via the read service |
| call `entitlementService` | the read service (once per feature key) |
| require anything from `modules/payroll`, `modules/document`, `modules/organization`, `modules/billing` | the adapters / read service |
| compose the ETag string | `settings_etag.utils` |
| filter, sort or shape catalog entries | the catalog service |
| compute `non_default_keys` | the read service, via `valuesEqual` |
| read `req.body` | nothing — Phase 1 has no request body |
| assign to `req.query` | nothing — Express 5 forbids it (§4.4) |

**`ctx(req)` carries `actorRole`** because the read service needs it for projection, and
`actorId` / `ipAddress` / `requestId` because the branding adapter's `getOrCreate` accepts them for
its initialisation audit row (§17.1). It is the same four-field shape the document controllers use,
so a reader of either file recognises it.

`T-S25`–`T-S28` cover the four handlers. `T-P1-12` is a static assertion that
`controllers/settings.controller.js` contains no `require` of another module's directory.

---

## 12. Service Layer

### 12.1 `settings_catalog.service.js` — S-1, S-2

```text
getCatalog(ctx, { module, group, includeHidden })
  1. resolve filter → candidate groups
  2. project groups for ctx.actorRole                             (readable / writable)
  3. resolve entitlement ONCE per distinct non-null featureKey  → entitled flags
  4. select catalog entries whose group survived; drop deprecated unless includeHidden
  5. strip enforcement_hint; attach surfaces (filtered by the same module filter)
  6. return { catalog_version, generated_at, groups, settings, surfaces, counts }

getCatalogEntry(ctx, settingKey)
  1. catalog.byKey(settingKey) → 404 SETTING_NOT_FOUND
  2. project the entry + its group; resolve `related` stubs
  3. return { catalog_version, setting, group, related }
```

**Zero database I/O except the entitlement lookups** — and those are the only reason `ctx` is passed
at all. If a future requirement drops entitlement flags from S-1, this service becomes pure.

**No caching.** The catalog is already an in-process frozen object; filtering 138 entries takes
microseconds. Caching the *filtered projection* would mean caching a cheap pure function keyed on
`(role, module, group, include_hidden, entitlement)` — more invalidation surface than it saves. This
is the §16 decision applied at the one place it was tempting.

### 12.2 `settings_read.service.js` — S-3, S-4

```text
getAll(ctx, { modules })
  1. groups     = catalog.groups filtered by `modules`
  2. readable   = groups where ctx.actorRole ∈ read_roles        ; rest → NOT_READABLE
  3. entitled   = resolveEntitlements(ctx.orgId, distinct featureKeys of readable)
                  → non-entitled groups → NOT_ENTITLED
  4. stores     = distinct stores of the surviving groups                    ◀ ≤ 5
  5. read each store ONCE, via Promise.allSettled                            ◀ partial failure
       fulfilled → { values, updatedAt }
       rejected  → every group of that store → READ_FAILED (log once, with the store name)
                   UNLESS the rejection is a 503 AppError, which rethrows (§10.7)
  6. per surviving group: slice the store's values to the group's keys,
       compute non_default_keys via valuesEqual, build the group etag
  7. return { catalog_version, org_id, groups, unavailable_groups, meta }

getGroup(ctx, groupKey)
  1. catalog.groupByKey → 404 GROUP_NOT_FOUND
  2. RBAC        → 403 FORBIDDEN                (not 404 — §10.6)
  3. entitlement → 403 FEATURE_NOT_AVAILABLE
  4. read the one store; a rejection propagates as-is (no degradation for a targeted request)
  5. slice, non_default_keys, etag, attach catalog entries
```

**`Promise.allSettled`, not `Promise.all`.** With `all`, one store's failure fails the whole settings
page. This is the structural expression of rule 4 in §10.5 and the answer to the brief's "setting
referenced by another module but unavailable" scenario.

**Store reads are concurrent across stores and never repeated within one.** Five parallel single-row
lookups on an indexed `org_id`; no store is read twice in a request, so there is no read-after-read
inconsistency *within* a store. Across stores the five reads are not one snapshot — accepted and
documented (§19.1), because the alternative (a single REPEATABLE READ transaction spanning five
owner services, each of which opens its own) is not achievable without rewriting four shipped
services.

### 12.3 `settings_projection.utils.js` — pure, no I/O

```text
projectGroupForRole(group, role)       -> { ...group, readable, writable }
projectEntryForResponse(entry)         -> entry minus enforcement_hint
isGroupReadable(group, role)           -> role ∈ group.read_roles
sliceValues(values, keys)              -> own-property pick; missing key ⇒ ABSENT, not undefined
computeNonDefaultKeys(values, entries) -> keys where !valuesEqual(v, e.default, e.data_type)
```

Separated from the services because these five functions carry **every rule that, if wrong, leaks
data** — and pure functions with no database and no `ctx` are the cheapest things in this codebase to
test exhaustively. `T-S29`–`T-S32` target this file directly, including the negative case
(`manager` → `payroll.loans` → `readable: false`).

**`sliceValues` treats a key present in the catalog but absent from the row as an anomaly**, not as
`undefined`: it logs the key name only, omits it from `values`, and sets `partial: true` on the
group. This can only happen if the catalog and the model have drifted in a way `T-S2` should have
caught, so it must be visible at runtime rather than rendering as a blank field.

### 12.4 What the service layer explicitly does **not** do in Phase 1

| Concern | Status |
|---|---|
| scope resolution / inheritance | **Not Applicable** — one stored value per key per org (§5.4, §15) |
| default *resolution* at read time | **Not Applicable** — the row always holds a concrete value; defaults are only ever *compared against* |
| override precedence | **Not Applicable** — no override layer exists |
| update semantics, conflict handling | **Phase 2** |
| transaction coordination | **Not Applicable** — Phase 1 opens no transaction. The owners' `getOrCreate` opens its own short one; the gateway neither creates nor joins it. |
| cache invalidation | **Not Applicable** — no cache (§16) |
| event emission | **Never** (D-S8) |

---

## 13. Repository Layer

**Not Applicable — Reason:** the Settings module owns no table in Phase 1, so it has nothing to
query. Every read goes through the **owning module's** service (four cases) or repository (one case,
`organization_profiles` — D-P1-5, §7.6), which is where the scoped queries, `org_id` filters,
soft-delete handling and lazy provisioning already live and are already tested.

Creating `src/modules/settings/repositories/` in Phase 1 would mean one of two things, both wrong:

* a repository that queries **another module's table directly** — breaking the module boundary the
  whole gateway design exists to preserve, and bypassing `paranoid` handling, lazy provisioning and
  the owners' own invariants; or
* an empty directory that Phase 3 will fill — an open seat, which §7.1 rule 4 rejects for the same
  reason.

Phase 3 introduces `settings_change_log.repository.js` **together with** the table it reads
(migration `00073`). That is the first and only time this module needs a repository.

---

## 14. Authorization & Security

### 14.1 The chain, in order

```text
authenticate              → 401 UNAUTHORIZED     token present, valid, not blacklisted; req.user frozen
authorize(['hr','manager'])→ 403 FORBIDDEN        req.user.role ∈ the allow-list
requireActiveOrg          → 403 ORG_NOT_ACTIVE   the org is active
   ↓ (service layer)
group read_roles          → 403 FORBIDDEN / NOT_READABLE
entitlement               → 403 FEATURE_NOT_AVAILABLE / NOT_ENTITLED
```

**The route-level allow-list is `['hr', 'manager']` — the union of every group's `read_roles` — and
it is not sufficient on its own.** It is a coarse gate that keeps `employee` tokens out of the module
entirely; the authoritative, per-group decision happens in the service. Answering the brief's *"do
not assume that an authenticated user should automatically be able to access or modify settings"*
directly: an authenticated `employee` gets `403` at the route, and an authenticated `manager` gets a
**different, smaller** settings page than `hr`, decided per group from catalog data.

### 14.2 The role matrix

| Role | Phase 1 access |
|---|---|
| `hr` | reads **all 26** groups. `writable: true` on 25 (all but `payroll.deprecated`) — advisory in Phase 1, honoured in Phase 2. |
| `manager` | reads **5 groups only**: `payroll.authority` (#38, #40) and `documents.authority` (#58, #59, #93). `writable: false` everywhere. |
| `employee` | **no access** — 403 at the route. |
| `admin`, `super-admin` | **no access — 403 at the route.** These are **platform** roles with no tenant data plane, and a settings read is tenant data. Enforced twice: absent from the route allow-list, and catalog invariant 8 forbids either string appearing in any `read_roles` / `write_roles`. |

**Why `manager` reads those five keys and nothing else.** Each one governs the manager's *own*
permitted behaviour — whether they may view team compensation, hold direct compensation authority,
view team documents, hold direct document authority, propose letters. A manager being able to see
why an action is unavailable to them is why the registry records those entries as manager-relevant.
Every other group is org administration. Any widening is a product decision, and `OD-P1-2` records
it as such rather than letting it drift.

### 14.3 Tenant isolation

**One rule, no exceptions:** `orgId` is read from `req.user.orgId` and from nowhere else.

* No endpoint accepts `orgId` in a path, query or body. There is no body at all.
* Every adapter takes `orgId` as its first argument, sourced from `ctx.orgId`, and every owner query
  is `WHERE org_id = :orgId`.
* `requireFeature`'s middleware form has an `|| req.body?.orgId` fallback in its orgId chain.
  **Phase 1 never uses the middleware form** — entitlement is resolved in the service with an
  explicit `ctx.orgId` — so that fallback is unreachable here. This is written down because the
  fallback is exactly the kind of thing a later contributor would "reuse" on a route, and a `POST`
  body carrying someone else's `orgId` would then satisfy the entitlement check.
* `T-S22` is the cross-org test: org A's token, org B's data, 26 groups — **no value from B appears.**
  Because `orgId` is never an input, the test is really asserting the absence of an injection point,
  which is the strongest form this check can take.

### 14.4 Sensitive settings

**No Phase 1 catalog key is `sensitive`.** That is a verified property, not an aspiration, and
invariant 11 makes breaking it a build failure. The genuinely sensitive material near these tables is
excluded by §5.3 and never read:

| Not read, not in catalog | Where it lives |
|---|---|
| `logo_storage_key`, `signature_storage_key`, `superseded_asset_keys` | `document_letter_branding` |
| `logo_storage_key` | `organization_profiles` |
| `attendance_devices.api_key_hash` | a per-record table — surface metadata only, and **even its surface descriptor names no column** |
| `PAYROLL_ENCRYPTION_KEY`, `RAZORPAY_*`, `PDF_RENDERER_API_KEY`, S3/renderer credentials | environment only |

**Operational flags are published as names, never values.**
`depends_on_ops: ['PDF_BULK_GENERATION_ENABLED']` tells a UI that a setting is subject to an ops
flag; the flag's *value* is not read and not returned. `platform_cap` publishes a **cap value**
(e.g. `900` seconds) — a published product limit, not a secret — and never the env var's content.

`T-S18`: no response from any of the four endpoints contains a key matching
`/key$|secret|token|password|credential|_hash$/i`. Asserted against the **serialised body**, so a
nested field cannot slip through.

### 14.5 Logging

| Logged | Never logged |
|---|---|
| `requestId`, `orgId`, `actorId`, `actorRole`, endpoint, status | any setting **value** |
| group keys and store names on a read failure | the row contents of a failed read |
| the name of a key missing from a row (`sliceValues` anomaly) | its value |
| the error `name` / `code` from a rejected adapter | the raw error object with its `sql` / `parameters` |

Phase 1 is read-only, so **no value ever needs to appear in a log line.** The one tempting case —
diagnosing a `non_default_keys` surprise — is served by logging the *key* and its `data_type`, never
the two values compared. `T-S19` asserts the read path emits no `console.log`.

### 14.6 Input-manipulation surface

| Vector | Status |
|---|---|
| **SQL injection** | **Not Applicable** — no raw SQL, no string interpolation into a query. Every read is a Sequelize `findOne` / `findOrCreate` with a bound `org_id`. |
| **Mass assignment** | **Not Applicable in Phase 1 — no write path, no request body.** The groundwork is nonetheless laid: `ownerWritableKeys()` + `nonSettingKeys` (§7.7) is precisely the allow-list Phase 2 needs, and the 16 org master-data keys are already fenced off. |
| **Parameter pollution** (`?module=a&module=b` → array in Express 5) | the Joi param schemas are `Joi.string()` with no `Joi.array()`, so an array value fails `422 VALIDATION_ERROR` rather than being silently `[0]`-indexed. `T-P1-13`. |
| **Unauthorized discovery** | the catalog is deliberately readable by `hr` and `manager` — it is a product contract, not a secret. It contains **no org-specific data at all**, so there is nothing to enumerate: a `manager`'s S-1 response is identical for every org on a deploy apart from the `entitled` flags. |
| **Prototype pollution** via `:settingKey` = `__proto__` / `constructor` | the key regex `[a-z0-9_]{1,80}` rejects both, **and** catalog lookup uses a `Map`, not object property access. Belt and braces, because the `Map` is the actual fix and the regex is defence in depth. `T-P1-14`. |
| **ReDoS** | both param regexes are linear, anchored and length-bounded. |
| **Body size** | no body; `express.json({limit:'10mb'})` is irrelevant to a `GET`. |

### 14.7 Rate limiting

**Not Applicable — Reason:** no existing read endpoint in this codebase carries a per-route rate
limit, and adding one only for Settings would be an inconsistent, unrequested control. The relevant
risk (S-3 reading five rows per call) is bounded by the `hr` / `manager` role gate. Noted in §27 as
`OD-P1-3`, with the trigger that would change the answer: S-3 appearing in a client polling loop.

---

## 15. Resolution & Precedence Rules

**There is no multi-level resolution in Phase 1, and that is a finding about this system rather than
a simplification.** Each of the 138 keys has exactly one row, one column and one value per
organization. The brief asks about inheritance, fallback and override precedence; the honest answers:

| Mechanism | Phase 1 |
|---|---|
| system default → org override | **Not Applicable.** The column default *is* the system default, and it is **materialised into the row** at provisioning. There is no "unset" state to fall back from. |
| org → department / role / user override | **Not Applicable.** No such table exists for any of the 138 keys; building one would be the generic configuration system the brief forbids. |
| env → DB precedence | **Not Applicable as a value mechanism.** Four caps (`VIEW_TTL_CAP_SECONDS`, `UPLOAD_TTL_CAP_SECONDS`, `ORG_CEILING_BYTES`, `ORG_PUBLISH_SYNC_LIMIT`) **bound** an org value inside the owner at use time — they do not *supply* a value and cannot be read as one. Published as `platform_cap` metadata (§6.1). |
| `null` meaning "inherit" | **Real, but owner-resolved.** Three cases, published and not evaluated: #95 `letter_record_retention_days = null` → the owner uses `document_retention_days`; #86 `letter_requires_acknowledgement_default = null` → the owner uses the document type's default; #104's 11 text fields `= null` → the owner's `inheritedFromProfile()` uses `organization_profiles` **at render time**. |

**D-P1-6 — Phase 1 publishes `inherits_from` and returns the raw stored value, including `null`.** It
does **not** resolve the fallback. Two reasons, both decisive:

1. **Resolving would require re-implementing the owner's rule inside the gateway** — a second
   implementation of a business rule, which is the duplication the brief prohibits and the classic
   failure mode where the gateway and the engine quietly disagree.
2. **`null` is information the UI needs.** A retention field showing "inherits from document
   retention (90)" is a different and better screen from one showing "90". Resolving would destroy
   the distinction and leave Phase 2 unable to tell "set it to 90" from "clear it".

`T-S9` asserts that a `null` stored value is returned as `null` with `inherits_from` populated, and
that no resolved substitute appears anywhere in the response.

**Defaults are used for exactly one purpose in Phase 1: computing `non_default_keys`** (via
`valuesEqual`, §8). They are never substituted into `values`.

---

## 16. Caching & Runtime Consistency

**Not Applicable in Phase 1 — Reason: no cache is introduced.** The brief says *do not introduce
caching unless it is justified*, and here it is not:

| The case for a cache | Why it does not hold in Phase 1 |
|---|---|
| "settings are read often" | each read is 1–5 single-row primary/unique-key lookups. Postgres serves these from shared buffers in well under a millisecond. |
| "the catalog is expensive to build" | it is built **once per process at require time** and frozen. That *is* the cache — in-process, immutable, invalidation-free, and unable to go stale because it is a code artifact versioned with the deploy. |
| "a settings page loads 26 groups" | 5 queries, issued concurrently. |
| "other instances would benefit" | a Redis layer would introduce cross-instance staleness where none exists today — the exact bug class §11.4 of the parent warns about, where a cached read served inside a write transaction reopens a race the document module already fixed. |

Answering each named sub-question explicitly:

* **Key structure, scope-aware keys, read/write behaviour, TTL, invalidation, post-failure behaviour,
  cold cache, fallback** — **Not Applicable.** None exist.
* **The database is unconditionally authoritative.** Every value in every response comes from a row
  read during that request.
* **Multi-instance consistency** — **inherent.** Any instance answering any request reads the same
  rows; two instances cannot disagree about a value. They can only disagree about the **catalog**,
  and only during a rolling deploy — which is §23.3's subject, handled by `catalog_version` being
  additive-only within a release.
* **HTTP caching is the one caching mechanism Phase 1 does use**, and it is client-side, per-tenant
  (`Cache-Control: private`) and revalidating (`ETag` + `304`). The server holds no state, so there
  is nothing to invalidate.

**The one thing Phase 1 must do for Phase 5's sake:** keep the adapter `read(orgId)` signature free
of an options object (§7.1 rule 3), so that adding a transaction-aware or cache-bypassing parameter
later is a deliberate, reviewable change rather than a default that silently applies inside a write
transaction.

---

## 17. Audit, Logging & Observability

### 17.1 Audit — what Phase 1 writes

**The Settings module writes no audit row of its own.** There is no change to record: the phase is
read-only, and `settings_change_logs` does not exist until Phase 3.

**One pre-existing side effect must be declared rather than hidden.** On an org's **first ever**
settings read, `document_letter_branding.getOrCreate` creates the branding row and writes a
`letter_branding.initialized` row to `document_audit_logs`. Consequences, stated plainly:

* **S-3 and S-4 are not strictly side-effect-free on first access.** Four of the five adapters may
  create their singleton row (`payroll_settings`, `statutory_configs`, `document_settings`,
  `document_letter_branding`); only the branding one also *audits* that creation.
* **This is correct and must not be suppressed.** Suppressing it would mean forking the owner's
  method — exactly the duplication the gateway design exists to avoid — and the audit row is
  genuinely true: a row *was* created, by this actor, at this time.
* **The `ctx` fields are passed through** (`actorId`, `ipAddress`, `requestId`) so the row is
  correctly attributed to the HR user who opened the settings page, not to `null`.
* **It is documented in the change record** so an auditor reading `document_audit_logs` is not
  puzzled by an `initialized` event with no apparent branding edit.
* `T-P1-15` asserts that a **second** read of the same org writes **no** audit row — i.e. that the
  side effect is once-per-org, not per-request.

**Change attribution, rollback, history** — **Not Applicable in Phase 1.** No change is made, so
there is nothing to attribute or roll back. Phase 3 owns history; its blocker is already recorded
(DEF-S10: `organization.service.updateOrganizationProfile` reads no prior row, so an audit entry
would have no `old_value`).

### 17.2 Logging

| Event | Level | Fields |
|---|---|---|
| store read failed | `error` | `requestId`, `orgId`, `store`, `error.name`, `error.code` — **never the row, never a value** |
| catalog key present in catalog but absent from the row | `warn` | `requestId`, `orgId`, `store`, `key`, `data_type` |
| entitlement dependency failure (503) | already logged by `entitlementService` | — (do not double-log) |
| catalog load-time invariant failure | **throws at boot**, message names the invariant number and the offending key | — |

**No success-path logging.** A `200` on a read endpoint is noise; the HTTP access log already records
it. `T-S19` asserts no `console.log` in the read path.

### 17.3 Observability

Phase 1 adds **no metrics, no tracing, no new dashboard** — the codebase has no metrics facility to
extend, and introducing one for a read module would be the unrequested infrastructure the brief
warns against. What it does provide, deliberately, is **observability through the response itself**:

| Field | What an operator learns from it |
|---|---|
| `meta.stores_read` | whether the ≤ 5 reads invariant holds in production (`T-P1-9` is the test; this is the runtime check) |
| `unavailable_groups[].reason` | whether degradation is entitlement (`NOT_ENTITLED`), permission (`NOT_READABLE`) or failure (`READ_FAILED`) — distinguishable without server access |
| `group.partial` | catalog/model drift reached production |
| `catalog_version` | which catalog an instance is serving — the rolling-deploy diagnostic (§23.3) |

**Not Applicable — Reason (alerting):** no alerting rule is defined, because a `READ_FAILED` on a
settings read is a symptom of a database problem that existing database-level monitoring already
covers. A settings-specific alert would fire second and add nothing.

---

## 18. Error & Failure Handling

### 18.1 Principles

1. **One failing store degrades its groups, not the page** (S-3). A targeted request fails loudly
   (S-4). §10.6.
2. **A dependency failure is never flattened into a business answer.** A 503 stays a 503; `NOT_ENTITLED` is only ever a real entitlement answer. §10.7.
3. **Errors are constructed with `AppError(status, message, errorCode)`** and propagated via
   `next(err)` to the existing global handler. No module-local error middleware.
4. **No error message contains a setting value, a storage key, an org name or an SQL fragment.**
5. **Nothing is retried inside the request.** A read failure is reported; the client retries. An
   internal retry would multiply load during the outage that caused it.

### 18.2 The failure scenarios named in the brief

Every scenario the brief lists, answered for Phase 1 — including the ones that cannot occur, because
"cannot occur, and here is why" is the useful answer:

| # | Scenario | Phase 1 behaviour |
|---|---|---|
| 1 | **Simultaneous updates to the same setting** | **Not Applicable — Reason:** no write path exists. Phase 2 handles it with `If-Match` on `updated_at`, compared **under the owner's row lock**. Phase 1's contribution is that it *publishes* that token (§10.2). |
| 2 | **The same request is retried** | **Inherently safe.** All four endpoints are `GET`: no state change beyond the once-per-org lazy provisioning, which `findOrCreate` + `UNIQUE(org_id)` already makes idempotent. §19.2. |
| 3 | **DB update succeeds but cache invalidation fails** | **Not Applicable — Reason:** no write, and no cache (§16). This scenario cannot arise in Phase 1 and is the main reason the phase is deployable without a rollback plan. |
| 4 | **Cache invalidation succeeds but the DB update fails** | **Not Applicable — Reason:** as above. |
| 5 | **A setting is deleted or disabled while being read** | Two sub-cases. *(a) Soft-deleted store row* — `paranoid: true` on `payroll_settings` / `statutory_configs` means `findOrCreate` provisions a fresh row; the read succeeds with defaults. *(b) Key removed from the catalog in a new deploy* — the old instance still serves it, the new one does not; `catalog_version` differs so the client can tell. §23.3. |
| 6 | **Cross-org modification attempt** | **Structurally impossible**: `orgId` is never an input (§14.3), and there is no modification path. `T-S22`. |
| 7 | **Access attempted outside the caller's permission scope** | `403` at the route for `employee` / `admin` / `super-admin`; per-group `403` (S-4) or `NOT_READABLE` (S-3) for a `manager` outside the 5 permitted groups. §14.2. |
| 8 | **An invalid value is supplied** | **Not Applicable — Reason:** no value is supplied to any Phase 1 endpoint. Invalid *query/param* input → `422 VALIDATION_ERROR`. Invalid values are Phase 2, and the enforcement boundary is the owner's existing Joi schema, never a re-implementation in the gateway. |
| 9 | **A setting is missing and has no default** | Cannot occur for a provisioned row: `NOT NULL` columns always hold a value. Where the column *is* nullable, `null` is a real, meaningful state and is returned as `null` (§15). Where a catalog key is absent from the row entirely (drift), the key is omitted, `partial: true` is set, and a `warn` is logged — never silently rendered as `undefined`. |
| 10 | **A default exists and the org has an override** | The row value wins — it is the only value. `non_default_keys` reports that it differs from the catalog default (§8). |
| 11 | **An override is removed and must fall back** | **Not Applicable — Reason:** there is no override layer to remove. The nearest real case is clearing a nullable key to `null`, which is a Phase 2 write; Phase 1 returns the `null` and the `inherits_from` pointer, and does not resolve it (D-P1-6). |
| 12 | **A sensitive value is exposed via API or logs** | No catalog key is `sensitive` (invariant 11); storage keys and asset columns are excluded by §5.3 and never read; `T-S18` greps the serialised body; §14.5 forbids values in logs. |
| 13 | **A migration changes the settings structure** | **Not Applicable in Phase 1 — no migration.** The forward-looking rule: a migration that renames or drops a settings column **fails `T-S2` at build time**, before deploy, which is the protection the drift test exists to give. §23.4. |
| 14 | **A setting is referenced by another module but is unavailable or malformed** | Inverted here, and worth stating: **no other module reads Settings** (§3.4), so the gateway's unavailability affects nothing but its own endpoints. In the other direction — an *owner* being unavailable — `Promise.allSettled` degrades that store's groups to `READ_FAILED`. Malformed (a value that fails its own catalog `range`) is **reported, not corrected**: the value is returned as stored, because the gateway's job is to show the truth, and silently clamping it would hide a real data defect. |
| 15 | **Multiple instances with a stale cache** | **Not Applicable — Reason:** no cache. Every instance reads the database. The only per-instance state is the frozen catalog, which is code and changes only with a deploy. |
| 16 | **A settings change must affect runtime behaviour across instances** | **Not Applicable in Phase 1 — no change is made.** The property that *will* make Phase 2 safe is established here: because no instance caches a value, a committed write is visible to **every** instance on its next read, with no invalidation step and therefore no invalidation failure mode. The catalog's `effect_timing` (§6.1) tells a client *when* a change takes effect — `immediate`, `next_record`, `next_run`, `next_cron_pass`, `inert` — which is a product fact about the owning engine, not a cache property. |

### 18.3 Failure of the catalog itself

| Failure | Behaviour |
|---|---|
| a catalog file has a syntax error | `require` throws → **the process does not start**. Correct: an instance that cannot build its contract must not serve traffic. |
| a load-time invariant fails | explicit `Error` naming the invariant and the key → **the process does not start** (§6.3, D-P1-3). |
| `adapters/index.js` and `groups.js` disagree on stores | invariant 9 → boot failure. |

**Deployment consequence:** a bad catalog is caught by the first instance to start, so a rolling
deploy halts with the previous version still serving. This is the single most valuable property of
keeping the catalog as code rather than as rows (§23.2).

---

## 19. Concurrency, Idempotency & Retry

### 19.1 Concurrency within a read

| Concern | Phase 1 |
|---|---|
| **Locking** | **none taken, and none needed.** `FOR UPDATE` on a read path would serialise settings-page loads against each other and against payroll writes for no benefit. DEF-S7 (the missing `FOR UPDATE` in `payroll_settings.service.update`) is a **write**-path defect, out of Phase 1's scope. |
| **Isolation across the five stores** | the five reads are **not** one snapshot. A write committing to `document_settings` between the payroll read and the document read yields a response that mixes a pre-write and a post-write view *of different stores*. **Accepted.** No setting in one store is derived from a setting in another (invariant 3 guarantees group→one store), so no cross-store invariant can be observed broken. Achieving a single snapshot would require one transaction spanning five owner services that each open their own — a rewrite of four shipped services to fix an anomaly with no consequence. |
| **Isolation within a store** | exact. One row, one read; all of a store's groups are sliced from the same result, so the 11 `payroll.*` groups are mutually consistent and share one `updated_at`. |
| **A concurrent write during a read** | the read sees either the pre- or post-commit row; both are valid, and the returned `updated_at`/`etag` correctly identifies which. A client that then issues a Phase 2 write with a stale token is rejected by `If-Match` — which is the whole point of publishing the token on reads. |
| **Lazy provisioning race** | two simultaneous first reads for the same org both call `findOrCreate`; one wins, the loser's `SequelizeUniqueConstraintError` is caught by the owner and re-read. Already implemented, already relied upon by shipped code, backed by `UNIQUE (org_id)`. The gateway adds nothing and must not try to. |

### 19.2 Idempotency

| Property | Phase 1 |
|---|---|
| **HTTP semantics** | all four endpoints are `GET` — safe and idempotent by definition. |
| **Idempotency keys** | **Not Applicable — Reason:** an `Idempotency-Key` header is a mechanism for de-duplicating *writes*. Adding one to a `GET` would be meaningless machinery. Phase 2 may need it; Phase 1 must not pre-build it. |
| **Duplicate/retried requests** | identical responses, except that the **first** request for a never-read org also provisions up to five rows and writes one branding audit row. Every subsequent request, including an immediate retry, is side-effect-free. `T-P1-15`. |
| **Client retry guidance** | `503` → retry with backoff. `5xx` → retry. `403` / `404` / `422` → do not retry. Stated in the change record so the frontend does not retry a `FEATURE_NOT_AVAILABLE`. |
| **Timeouts** | a client timing out mid-read leaves nothing partial: the only writes are the owners' own committed `findOrCreate` transactions, each atomic on its own. There is no multi-step state machine to leave half-finished. |

### 19.3 What Phase 1 deliberately leaves to Phase 2

Recorded here so no one builds it early, and so the Phase 2 author knows what was already decided:

* `If-Match` **enforcement** (Phase 1 only *publishes* the token).
* Row locking on write, including the DEF-S7 fix.
* `changed` / `unchanged_keys` built from the **re-read row, never the submitted patch** — mandatory
  because `document_letter_branding.replace()` silently normalises (DEF-S12).
* Partial-failure semantics for a multi-key write — made trivial by invariant 3: one group, one
  store, one owner, one transaction.
* The `valuesEqual()` comparator is **already available** from Phase 1 (§8), so Phase 2 inherits it
  rather than writing a second comparison rule.

---

## 20. Implementation Sequence

### 20.1 The brief's generic 18-step order, mapped to this phase

The brief supplies a standard sequence and asks that it be analysed and adjusted to the actual
architecture. Six of its steps are inapplicable here, because Phase 1 adds no persistence:

| Brief's step | Phase 1 |
|---|---|
| 1 review existing implementation | **Step 0** below (done in this document; re-verified at Step 0) |
| 2 define scope | §1 |
| 3 design schema · 4 write migration · 5 models · 6 repositories | **Not Applicable** — §9, §13 |
| 7 define the catalog / domain contract | **Steps 2–4** — the single largest piece of work |
| 8 services | **Steps 6–7** |
| 9 validation | **Step 8** (query/param envelopes only) |
| 10 controllers · 11 routes · 12 wiring | **Steps 9–10** |
| 13 authorization | **Step 5** — *moved earlier*, because projection is a dependency of the services, not a decoration on them |
| 14 caching | **Not Applicable** — §16 |
| 15 audit | **Not Applicable** — §17.1 |
| 16 error handling | folded into each step; reuses the global handler |
| 17 tests | **not a step** — a gate at the end of every step (§20.2) |
| 18 docs · deployment | **Steps 11–12** |

**The two reorderings that matter:** authorization/projection comes **before** the services that
consume it (so no service is ever written with authorization "to be added later"), and testing is not
a phase but an exit condition on each step.

### 20.2 The sequence, with a verify gate per step

Each step is independently verifiable, and no step may be started before its predecessor's gate is
green. Steps 2–4 are the bulk of the effort; steps 6–10 are mechanical once the catalog is right.

| # | Step | Verify gate |
|---|---|---|
| **0** | **Record the real baseline.** Run `npm test` and write down the pass/fail count **before touching anything**. Confirm `tests/unit/` has no `settings/` directory yet. Re-run the §2 pre-flight checks (the inventory in this document was verified on 2026-10-09; confirm nothing shifted). | the baseline number is written into the PR description. **A pre-existing failure must be known before Phase 1 starts, or it will later look like Phase 1's fault.** |
| **1** | `settings_value.utils.js` — `valuesEqual()` (§8). First because the catalog loader depends on it (invariant 6). | `T-S59`, `T-P1-6`, `T-P1-7`, `T-P1-8` green. A pure function with no imports: this step cannot break anything. |
| **2** | `catalog/groups.js` — all 26 groups with `store`, `module_key`, `featureKey`, `read_roles`, `write_roles`, `order`. | `T-S6` (closed featureKey set), invariant 8 (no `admin`/`super-admin`), 26 groups over exactly 5 stores. |
| **3** | `catalog/index.js` — the loader, the 11 invariants, `deepFreeze`, `catalog_version`, the `Map` lookups. Written **before** the entry files so every entry is validated as it is authored. | `T-S4` (a malformed fixture throws; the real catalog passes), `T-S7` (frozen), `T-P1-3` (version format). |
| **4** | **The five catalog files — 138 entries.** Author in the §6.6 order (`statutory` 25 → `documents` 35 → `billing` 2 → `branding` 13 → `payroll` 63). Run `T-S2` **after each file**, not at the end. | `T-S2` green per store; `T-S3` (65 + 49 = 114 refs, continuous 1–114); `T-S5` (26 groups, 138 keys); invariants 1–11 all pass at require time. |
| **5** | `catalog/surfaces.js` (49 descriptors, data only) + `catalog/preconditions.js` (ids and probe *names* only). | `T-S3` closes the 114; no surface descriptor names a column on `attendance_devices` (§14.4). |
| **6** | `settings_projection.utils.js` (§12.3) — the five pure functions. Before the services. | `T-S29`–`T-S32`, incl. `manager` → `payroll.loans` → `readable: false` and the `admin` → nothing case. |
| **7** | `adapters/*` — five adapters + `adapters/index.js`. | `T-P1-4` (all four adapter rules), `T-P1-5` (branding called with `includeAssetUrls: false`), invariant 9. |
| **8** | `settings_catalog.service.js` + `settings_read.service.js` + `settings_etag.utils.js`. | `T-P1-9` (≤ 5 store reads), `T-P1-10` (entitlement calls = distinct non-null feature keys), `T-P1-11` (503 propagates), `T-S9` (`null` returned as `null`). |
| **9** | `validators/settings.validator.js` + `controllers/settings.controller.js`. | `T-S25`–`T-S28`, `T-P1-12` (no foreign `require` in the controller), `T-P1-13` (parameter pollution → 422), `T-P1-14` (`__proto__` → 422). |
| **10** | `routes/settings.routes.js` + `settings.index.js` + **the one line in `src/app.js`**. | the app boots; all four routes respond; route ordering is as §4.3; `git diff --stat` outside `src/modules/settings/` and `public/` shows **exactly one changed line**. |
| **11** | Security, isolation and regression suites: `T-S12`, `T-S14`, `T-S18`, `T-S19`, `T-S22`, `T-P1-15`, `T-P1-16`. | all green, **and** the full `npm test` matches the Step 0 baseline plus the new tests — **zero pre-existing tests changed and zero newly failing**. |
| **12** | Documentation: `api_registry.md` #242–#245; `public/md_settings/combined_api_analysis.md`; the dated `public/md_updates/` change record; the three registry corrections (§22.2). | `T-S1` (static scan: no write call into any owner from `src/modules/settings/`) green as the final gate. |

### 20.3 The critical path and what can be parallelised

```text
Step 0 ─▶ 1 ─▶ 2 ─▶ 3 ─▶ 4 ────────────▶ 6 ─▶ 7 ─▶ 8 ─▶ 9 ─▶ 10 ─▶ 11 ─▶ 12
                          └─▶ 5 ─────────────────────────────────┘
```

Step 5 (surfaces) is off the critical path and may be done by a second developer in parallel with
steps 6–8; it has no code dependents in Phase 1 (nothing but S-1 reads it). Everything else is
strictly serial, because each step's gate is the next step's precondition.

**Where the time goes:** Step 4 is roughly 60–70 % of the phase. It is 138 entries × ~25 fields, each
field with one authority (§6.6) and no room for invention. Treat it as transcription under test, not
as design.

---

## 21. Testing Strategy

### 21.1 Rules

* **`node --test`, files under `tests/unit/settings/`** — mirroring `tests/unit/{payroll,document,…}`.
  Run via the existing `npm test`; no new runner, no new dependency.
* **No test touches a database.** The owners' services are stubbed at the adapter seam. `T-S2` reads
  model *metadata* only (§7.7) — if the model registry turns out to connect eagerly, use the stubbed
  Sequelize instance instead. This is the standing constraint, not a preference.
* **No existing test file is modified.** If a Phase 1 change would require editing one, the change is
  wrong — Phase 1 alters no existing behaviour.
* **Stub at the seam, not deeper.** Tests stub the five owner methods (`getOrCreate`, `getConfig`,
  `findOrganizationProfileByOrgId`) and `entitlementService.hasFeature`. They do **not** stub
  Sequelize. A test that needs to stub Sequelize is testing the owner, which already has its own
  tests.

### 21.2 Coverage by category

**Unit — catalog integrity (the build gate)**

| ID | Assertion |
|---|---|
| `T-S2` | per adapter: `ownerWritableKeys == catalogKeys ∪ nonSettingKeys`, disjointness, and per-key `range` / `default` / `nullable` / `data_type` parity (§7.7) |
| `T-S3` | registry refs 1–114 continuous; 65 in the catalog, 49 in surfaces; no ref in two modules; multi-group refs carry `split: true` |
| `T-S4` | the real catalog passes all 11 invariants; a malformed fixture throws, per invariant |
| `T-S5` | 26 groups, 5 stores, 138 keys; per-store counts 63/25/35/13/2 |
| `T-S6` | every `featureKey` ∈ `{payroll.access, documents.access, leave.access, attendance.access, null}` |
| `T-S7` | the exported catalog is deeply frozen; mutation throws |
| `T-P1-3` | `catalog_version` matches `^\d{4}-\d{2}-\d{2}\.\d+$` |

**Unit — comparator and resolution**

`T-S59`, `T-P1-6`, `T-P1-7`, `T-P1-8` (§8.5); `T-S9` (`null` returned as `null` with
`inherits_from`, never resolved); `T-P1-17` (`non_default_keys` is empty for a freshly provisioned
org across all five stores — the end-to-end form of the DECIMAL regression).

**Unit — projection and authorization**

| ID | Assertion |
|---|---|
| `T-S29` | `hr` → all 26 groups readable; 25 writable; `payroll.deprecated` `writable: false` |
| `T-S30` | `manager` → exactly 5 groups readable, 0 writable; the other 21 → `NOT_READABLE` |
| `T-S31` | `employee`, `admin`, `super-admin` → 0 readable groups (and 403 at the route) |
| `T-S32` | `entitled: false` ⇒ the group appears in S-1 metadata **and** in S-3's `unavailable_groups`, with **no `values` key present at all** |
| `T-S14` | `enforcement_hint` appears in no API response |

**Unit — endpoint behaviour**

`T-S25`–`T-S28` (one per endpoint: 200 shape, ETag set, `Cache-Control` set, `304` on matching
`If-None-Match`); plus the error table: `404 SETTING_NOT_FOUND`, `404 GROUP_NOT_FOUND`,
`422 INVALID_FILTER_COMBINATION`, `422 UNKNOWN_MODULE`, `403 FEATURE_NOT_AVAILABLE`,
`404 ORG_PROFILE_NOT_FOUND` → `READ_FAILED` in S-3 but `404` in S-4.

**Security**

| ID | Assertion |
|---|---|
| `T-S12` | no S-1/S-2 response contains a tenant value |
| `T-S18` | no response contains a key matching `/key$|secret|token|password|credential|_hash$/i` |
| `T-S19` | the read path emits no `console.log` |
| `T-S22` | cross-org: org A's token returns no org B value — and `orgId` is not an accepted input anywhere |
| `T-P1-13` | array-valued query params → `422`, never `[0]`-indexed |
| `T-P1-14` | `:settingKey` = `__proto__` / `constructor` / `prototype` → `422`; catalog lookup is `Map`-based |
| `T-P1-18` | **mass-assignment groundwork:** the 16 org master-data keys appear in **no** catalog file and in **no** response |

**Concurrency**

| ID | Assertion |
|---|---|
| `T-P1-19` | two concurrent S-3 calls for the same never-read org: both succeed; the owner's `findOrCreate` + unique-violation re-read path is exercised; exactly one row results |
| `T-P1-15` | a second read of the same org writes **no** audit row (the branding side effect is once per org) |
| `T-P1-9` | S-3 invokes ≤ 5 adapter reads for 26 groups |
| `T-P1-10` | S-3 invokes `hasFeature` exactly once per distinct non-null feature key (2), not once per group (25) |
| `T-P1-20` | one store's adapter rejecting degrades only that store's groups to `READ_FAILED`; the other groups return values and the status is `200` |
| `T-P1-11` | a 503 `AppError` from `entitlementService` propagates as 503, never as `NOT_ENTITLED` |

**Regression — the most important category in this phase**

| ID | Assertion |
|---|---|
| `T-S1` | **static scan:** no file under `src/modules/settings/` calls `.update(`, `.create(`, `.destroy(`, `.save(`, `.replace(` or `.upsert(` on an owner service, model or repository. The mechanical proof that Phase 1 is read-only. |
| `T-P1-12` | the controller requires nothing outside `src/modules/settings/` and `src/common/` |
| `T-P1-16` | the existing owner suites are **unchanged and still green** — `git diff --name-only` lists no file under `tests/unit/{payroll,document,organization,billing}/` |
| `T-P1-21` | `src/app.js` has exactly one added line, and the four existing settings endpoints (`PUT /payroll/hr/settings`, `PUT /payroll/hr/statutory-config`, `PUT /documents/hr/settings`, `PUT /organizations/.../profile`) still resolve to their original handlers |

**Integration tests** — **Not Applicable in Phase 1 — Reason:** every integration-shaped assertion in
the brief's list (database operations, org isolation, transactions, audit) requires a live database,
which the standing constraint forbids this agent from touching. They are covered as far as is
possible without one: org isolation structurally (`T-S22`), database behaviour through the owners'
existing suites, transactions by their absence (§12.4), audit by `T-P1-15`. The operator checklist
(§23.5) lists the three manual verifications that genuinely need a database, to be run by the person
who has access.

### 21.3 Expected test count

Roughly **55–70 new assertions in 8–10 new files** under `tests/unit/settings/`:
`catalog_integrity.test.js`, `values_equal.test.js`, `projection.test.js`, `adapters.test.js`,
`read_service.test.js`, `catalog_service.test.js`, `endpoints.test.js`, `security.test.js`,
`concurrency.test.js`, `regression_static.test.js`. **The Step 0 baseline plus these, with no
pre-existing test modified and none newly failing, is the Phase 1 test gate.**

---

## 22. Documentation Deliverables

### 22.1 Written as part of Phase 1

| Document | Content |
|---|---|
| `public/md_system/api_registry.md` | four rows, **#242–#245**, in the existing column format. **Re-check the current maximum before using these numbers** — #241 was the maximum on 2026-10-09, but the billing phase may have claimed more since. |
| `public/md_settings/combined_api_analysis.md` | **new file**, following the per-module convention (not `api_documentation.md`): one section per endpoint — path, method, auth, request, response, error codes, worked example. Must state the S-3 vs S-4 status-code asymmetry (§10.6) and the retry guidance (§19.2). |
| `public/md_updates/<YYYY-MM-DD>_settings_module_read_apis.md` | the mandated dated change record. **Four new endpoints; no existing contract altered** — so its "Breaking changes" section reads *none*, and that is itself the useful statement for the frontend. Must document: the response envelope, `unavailable_groups` and its three reasons, the ETag format and `304` behaviour, `non_default_keys`, `inherits_from` + the unresolved `null`, `platform_cap`, that `writable` is advisory until Phase 2, and the `manager`'s 5-group view. |
| this file | kept current if any decision changes during implementation |
| `catalog_version` | bumped in the same commit as any catalog edit (D-P1-4) |

### 22.2 Registry corrections to apply (documentation-only, no code)

Three defects recorded in the parent plan's §1.1 are **documentation** errors and should be fixed in
`org_settings_registry.md` during Step 12. They are the only edits Phase 1 makes to the registry, and
each is a correction to a statement that is factually wrong about shipped code:

| Defect | Correction |
|---|---|
| DEF-S1 | the stated default for the affected key does not match the model's `defaultValue`; the model wins. |
| DEF-S2 | the stated range does not match the owner's Joi rule; the Joi rule wins. |
| DEF-S3 | the stated enforcement point names a file/function that has moved; correct the path. |

**Procedure:** apply the correction, then re-run `T-S2` — which is what catches a registry claim that
contradicts the code. Do **not** change any model, default, or Joi rule to match the registry; the
registry is the description, the code is the behaviour (§9's deviation check).

### 22.3 Not written in Phase 1

`settings_change_logs` schema notes (Phase 3), the surfaces API contract (Phase 4), any cache design
note (Phase 5), and migration `00073` (§9).

---

## 23. Migration & Deployment

### 23.1 Migrations

**None.** §9. Nothing to order, nothing to roll back, no existing data to handle, no default
initialisation to run — the owners' lazy `getOrCreate` already materialises defaults per org, on
first access, and has done since those modules shipped.

**No backfill, and none is needed.** An org that has never opened a settings page simply has no
singleton rows yet; the first S-3 creates them with model defaults. That is existing, tested
behaviour reached through a new door, not new behaviour.

### 23.2 Deployment sequencing

```text
1. merge → CI runs `npm test`  ──▶ catalog invariants + T-S2 run at require time
                                   a bad catalog FAILS THE BUILD, not production
2. deploy (rolling, no special ordering)
3. no migration step
4. no cache warm-up, no flush
5. verify: GET /api/v1/settings/catalog as an HR user on one org  →  200 + ETag
```

**Phase 1 is a pure additive code deploy.** It can be rolled back by redeploying the previous
image, with no data consequence whatsoever — the only database side effect it can cause is
provisioning singleton rows that the owners' own endpoints would have provisioned anyway, and those
rows are valid and useful regardless of whether Settings exists.

### 23.3 Multi-instance and rolling-deploy consistency

The brief's requirement — *"deployment must not leave the application in a state where some
instances understand settings that others cannot"* — applies to exactly one artifact here: the
**catalog**, because it is the only per-instance state.

| During a rolling deploy | Behaviour |
|---|---|
| old and new instances serve different `catalog_version` values | **Every response carries its `catalog_version`.** A client that receives an unexpected version re-fetches S-1. This is the mechanism; it is why the field exists in S-3 and S-4 and not only in S-1. |
| a client holds a stale catalog and asks for a group the new catalog renamed | `404 GROUP_NOT_FOUND` → the client re-fetches S-1. Recoverable in one round-trip. |
| a client holds a *new* catalog and hits an *old* instance | same: `404` → re-fetch. Symmetric, and self-healing once the deploy completes. |
| a **value** read differs between instances | **impossible** — no instance caches values (§16). |

**D-P1-7 — catalog changes within a release must be additive.** Adding a key or a group is safe at
any time. **Renaming or removing** a key or group is a client-visible contract change and must be
done in a release of its own, with the change record written **before** the deploy, never bundled
with other work. Phase 1 itself is purely additive (the catalog is new), so this rule binds from
Phase 2 onward — it is recorded here because Phase 1 is where the contract is created and therefore
where the rule has to be established.

### 23.4 A future migration that touches a settings column

Recorded now because the protection is built in Phase 1 and would otherwise go unnoticed:

1. A migration renaming, dropping or retyping a settings column **fails `T-S2` in CI** — the catalog
   no longer matches the owner's model/Joi. The build breaks **before** deploy.
2. The author must then update the catalog entry and `catalog_version` **in the same commit** as the
   migration.
3. If the key is removed, it must also be removed from the registry and recorded in `md_updates`.

That is the whole value proposition of the drift test: a schema change cannot silently desynchronise
the published contract.

### 23.5 Operator checklist (hand-back)

Phase 1 requires **no operator action** — no migration, no seeder, no env var, no config change, no
feature flag. The only things worth a human with database access confirming, after deploy:

| # | Check | Why |
|---|---|---|
| 1 | `GET /api/v1/settings` as HR on an org that has **never** used payroll or documents → `200`, and the five singleton rows now exist with default values | confirms lazy provisioning through the new door, which no unit test can prove without a database |
| 2 | the same call a second time → `200`, and **no new row** in `document_audit_logs` | confirms the branding side effect is once per org (§17.1) |
| 3 | `GET /api/v1/settings` as HR on an org **without** a payroll plan → `200` with the 15 payroll/statutory groups in `unavailable_groups` as `NOT_ENTITLED`, and **no `payroll_settings` row created** | confirms filter-before-read (§10.5 rule 3) — the one correctness property that depends on real entitlement data |

---

## 24. Backward Compatibility

| Surface | Impact |
|---|---|
| **Existing API contracts** | **zero change.** No existing request, response, field, validation rule, parameter or status code is altered. The four existing write endpoints (`PUT /payroll/hr/settings`, `PUT /payroll/hr/statutory-config`, `PUT /documents/hr/settings`, the org profile update) are **untouched and remain fully supported**. `T-P1-21`. |
| **Existing consumers** | the frontend, crons, the payroll engine, the document renderer and the PDF pipeline all keep reading their settings exactly as they do today, from their own services. Nothing is routed through the gateway. §3.4. |
| **Database** | no schema change, no data change, no constraint change. |
| **Behaviour** | one new behaviour only: a settings read can now *provision* singleton rows for an org that has never used the owning feature. That is the owners' own existing `getOrCreate` path, with its own tests, reached earlier than before. Values are the model defaults — identical to what the owner's own first call would have produced. |
| **Deprecation** | **none.** `pdf_render_engine` is published as `deprecated: true` with `effect_timing: 'inert'` and in a read-only group, which *documents* a pre-existing fact (the key stopped having an effect in the 2026-09-30 HTML-only migration) rather than deprecating anything new. |
| **Rollback** | redeploy the previous image. No data to reverse. |
| **Forward compatibility** | clients must tolerate **new** groups and keys appearing in S-1/S-3 without a client change — stated explicitly in the change record, because a client that hard-codes the group list will break on the first Phase 2 addition. |

**The one coupling Phase 1 creates, stated honestly:** `src/modules/settings/` now depends on five
owner methods and three Joi schema objects. If a future refactor renames
`documentSettingsService.MUTABLE_FIELDS`, `payrollHrValidator.updateSettingsSchema`,
`organizationValidator.fieldValidation_UpdateOrganizationProfile`, or any of the five read methods,
the settings module breaks — **at build time, via `T-S2`**, not at runtime. That is the intended
trade: a visible, test-enforced coupling to the owners' public surface, rather than a duplicated key
list that would drift silently.

---

## 25. Feature Traceability Matrix

The chain the brief requires, for each of the eight significant Phase 1 features.

### F-P1-1 · The catalog as a frozen code asset

| | |
|---|---|
| **Requirement** | Parent §16 Phase 1: "catalog as a code asset"; FR-2 (a UI must be able to render every setting without hard-coding it) |
| **Existing dependency** | the five owners' models, Joi schemas, defaults objects and caps constants; `valuesEqual` (F-P1-2) |
| **Database impact** | **none** — §9 |
| **API impact** | S-1, S-2 serve it; S-3, S-4 slice values against it |
| **Business logic** | assemble 138 entries + 26 groups + 49 surfaces; validate 11 invariants; deep-freeze; version |
| **Validation** | the 11 load-time invariants (§6.3), enforced at `require` in production, not only in tests |
| **Authorization** | the catalog carries `read_roles`/`write_roles` as **data**; invariant 8 forbids `admin`/`super-admin` appearing in either |
| **Cache / runtime** | the frozen in-process object **is** the cache; no external cache, no invalidation |
| **Failure handling** | any invariant failure → **the process does not start** (§18.3) |
| **Testing** | `T-S2`, `T-S3`, `T-S4`, `T-S5`, `T-S6`, `T-S7`, `T-P1-3` |
| **Acceptance** | AC-1, AC-2, AC-3 (§26) |

### F-P1-2 · The `valuesEqual()` comparator

| | |
|---|---|
| **Requirement** | correct `non_default_keys` across 19 DECIMAL columns (§8.1) — moved into Phase 1 from the parent's §7.10a |
| **Existing dependency** | none. Pure function, zero imports. |
| **Database impact** | **Not Applicable** |
| **API impact** | `non_default_keys` in S-3 and S-4 |
| **Business logic** | per-type equality; order-sensitive arrays; `null` never equals `0`/`''`/`[]` (§8.4) |
| **Validation** | **Not Applicable — Reason:** it validates nothing; it compares. |
| **Authorization** | **Not Applicable** |
| **Cache / runtime** | **Not Applicable** |
| **Failure handling** | an unknown `dataType` throws — a programming error, surfaced loudly at catalog load (invariant 6) rather than returning a silent `false` |
| **Testing** | `T-S59`, `T-P1-6`, `T-P1-7`, `T-P1-8`, `T-P1-17` |
| **Acceptance** | AC-4 |

### F-P1-3 · The five read adapters

| | |
|---|---|
| **Requirement** | Parent §16: "four read adapters" — **corrected to five** (§1.4 (1)) |
| **Existing dependency** | `payrollSettingsService.getOrCreate`, `statutoryConfigService.getConfig`, `documentSettingsService.getOrCreate`, `letterBrandingService.getOrCreate`, `organizationRepository.findOrganizationProfileByOrgId` |
| **Database impact** | **none of its own** — it may trigger the owners' existing lazy provisioning |
| **API impact** | supplies every value in S-3 and S-4 |
| **Business logic** | call the owner; project to the group's keys; expose `ownerWritableKeys()` for the drift test. **No business rule of its own** — if an adapter needs one, the rule belongs to the owner. |
| **Validation** | **Not Applicable — Reason:** read path; nothing is submitted. The owners' Joi schemas are read as *metadata*, not executed. |
| **Authorization** | **Not Applicable at this layer by design** — the adapter is invoked only after the service has cleared RBAC and entitlement (§10.5 rule 3). Stated explicitly so no one adds a second, divergent check here. |
| **Cache / runtime** | no cache; `read(orgId)` deliberately takes no options object (§16) |
| **Failure handling** | a rejection becomes `READ_FAILED` for that store's groups in S-3, or propagates in S-4; a 503 always propagates |
| **Testing** | `T-P1-4`, `T-P1-5`, `T-P1-9`, `T-P1-20` |
| **Acceptance** | AC-5, AC-6 |

### F-P1-4 · S-1 / S-2 — the metadata endpoints

| | |
|---|---|
| **Requirement** | Parent §7.1 S-1, S-2; api_registry #242, #243 |
| **Existing dependency** | `authenticate`, `authorize`, `requireActiveOrg`, `validateOrThrow`, `AppError`, `entitlementService.hasFeature` |
| **Database impact** | **none** beyond the entitlement lookups |
| **API impact** | two **new** endpoints; no existing contract touched |
| **Business logic** | filter → project for role → entitlement flags → strip `enforcement_hint` → attach surfaces |
| **Validation** | `module` / `group` / `include_hidden` (S-1); `settingKey` regex (S-2); mutual exclusion → 422 |
| **Authorization** | route: `['hr','manager']`; per-group `readable`/`writable` computed for the caller |
| **Cache / runtime** | `ETag: W/"<catalog_version>"`, `304`, `Cache-Control: private` |
| **Failure handling** | `404 SETTING_NOT_FOUND`; 503 from entitlement propagates |
| **Testing** | `T-S25`, `T-S26`, `T-S12`, `T-S14`, `T-P1-13`, `T-P1-14` |
| **Acceptance** | AC-7, AC-9 |

### F-P1-5 · S-3 / S-4 — the value endpoints

| | |
|---|---|
| **Requirement** | Parent §7.1 S-3, S-4; api_registry #244, #245 |
| **Existing dependency** | the five adapters; `entitlementService`; the common middleware chain |
| **Database impact** | ≤ 5 single-row reads per request on already-indexed `org_id` |
| **API impact** | two **new** endpoints |
| **Business logic** | RBAC filter → entitlement filter → **read each store once** → slice → `non_default_keys` → per-group ETag → `unavailable_groups` |
| **Validation** | `modules` list (S-3); `groupKey` regex (S-4) |
| **Authorization** | route allow-list + per-group `read_roles` + per-feature entitlement; `orgId` from the token only |
| **Cache / runtime** | no server cache; `ETag` = `catalog_version` + `updated_at`; DB authoritative |
| **Failure handling** | S-3 degrades per store (`Promise.allSettled`); S-4 fails loudly; 503 always propagates |
| **Testing** | `T-S27`, `T-S28`, `T-S9`, `T-S22`, `T-S32`, `T-P1-9`, `T-P1-10`, `T-P1-11`, `T-P1-20` |
| **Acceptance** | AC-8, AC-9, AC-10 |

### F-P1-6 · Authorization & tenant isolation

| | |
|---|---|
| **Requirement** | *"do not assume that an authenticated user should automatically be able to access or modify settings"*; role planes (`admin`/`super-admin` get no tenant data) |
| **Existing dependency** | `authenticate`, `authorize`, `requireActiveOrg`, `entitlementService` — all reused unchanged; **no new middleware is written** |
| **Database impact** | **none** |
| **API impact** | `403` for `employee`/`admin`/`super-admin`; a 5-group view for `manager` |
| **Business logic** | `read_roles` per group, from catalog data — not hard-coded in a service |
| **Validation** | **Not Applicable** |
| **Authorization** | **this feature *is* the authorization** — §14 |
| **Cache / runtime** | **Not Applicable** — no authorization decision is cached |
| **Failure handling** | `403 FORBIDDEN`, `403 ORG_NOT_ACTIVE`, `403 FEATURE_NOT_AVAILABLE`, `503` propagated |
| **Testing** | `T-S29`, `T-S30`, `T-S31`, `T-S32`, `T-S22`, `T-P1-11` |
| **Acceptance** | AC-9 |

### F-P1-7 · Sensitive-data exclusion

| | |
|---|---|
| **Requirement** | *"never expose sensitive configuration values through APIs or logs unless explicitly required"* |
| **Existing dependency** | the owners' DTO builders (`toBrandingDto` already omits nothing sensitive that Phase 1 then re-picks) |
| **Database impact** | **none** |
| **API impact** | the exclusions of §5.3 appear in no response |
| **Business logic** | declared `nonSettingKeys` per adapter; `includeAssetUrls: false`; ops flags published by **name** only |
| **Validation** | invariant 11 (no `sensitive` catalog key); `T-S2`'s disjointness check |
| **Authorization** | **Not Applicable — Reason:** these fields are not exposed to *any* role, so there is no role to gate. That is stronger than gating. |
| **Cache / runtime** | **Not Applicable** |
| **Failure handling** | a `sensitive` key reaching the catalog → **boot failure** (invariant 11) |
| **Testing** | `T-S18`, `T-S19`, `T-P1-5`, `T-P1-18` |
| **Acceptance** | AC-11 |

### F-P1-8 · Module wiring with a one-line external diff

| | |
|---|---|
| **Requirement** | Parent §16 completion criterion (e): "no diff in any existing module's source except the one `app.js` mount line" |
| **Existing dependency** | the `src/app.js` mount convention; the module `*.index.js` convention |
| **Database impact** | **none.** Explicitly **no entry in `MODEL_ROOTS`** — the settings module declares no model, and adding a root for an empty `models/` directory would make the registry lie. |
| **API impact** | mounts `/api/v1/settings` |
| **Business logic** | route ordering per §4.3 |
| **Validation** | **Not Applicable** |
| **Authorization** | the shared `settingsReadAuth` array applied to all four routes |
| **Cache / runtime** | **Not Applicable** |
| **Failure handling** | a catalog failure prevents boot before any route is mounted (§18.3) |
| **Testing** | `T-P1-21`, `T-P1-12`, `T-P1-16`, `T-S1` |
| **Acceptance** | AC-12, AC-13 |

---

## 26. Phase 1 Acceptance Criteria

**This is the only list that decides whether Phase 1 is done.** Each criterion is mechanically
checkable; none requires a judgement call.

| # | Criterion | How it is proven |
|---|---|---|
| **AC-1** | The catalog contains **exactly 138 keys in 26 groups over 5 stores**, with per-store counts **63 / 25 / 35 / 13 / 2**. | `T-S5` |
| **AC-2** | Registry refs **1–114** are covered exactly once each: **65** in the catalog, **49** in surfaces; no ref in two modules; every multi-group ref carries `split: true`. | `T-S3` |
| **AC-3** | All **11** load-time invariants pass for the real catalog, and a malformed fixture throws for each one. The exported catalog is deeply frozen. | `T-S4`, `T-S7` |
| **AC-4** | `valuesEqual()` is implemented per §8.4, and `non_default_keys` is **empty** for a freshly provisioned org across all five stores (the DECIMAL regression). | `T-S59`, `T-P1-6`–`T-P1-8`, `T-P1-17` |
| **AC-5** | **`T-S2` is green for all five adapters**, two-sided: `ownerWritableKeys == catalogKeys ∪ nonSettingKeys`, disjoint, with per-key `range`/`default`/`nullable`/`data_type` parity. No test touches a database. | `T-S2` |
| **AC-6** | All five adapters obey the four §7.1 rules; the branding adapter is called with `includeAssetUrls: false` and picks exactly the 13 keys. | `T-P1-4`, `T-P1-5` |
| **AC-7** | **S-1, S-2, S-3, S-4** respond `200` with the documented shapes, set `ETag` and `Cache-Control: private`, and return `304` on a matching `If-None-Match`. | `T-S25`–`T-S28` |
| **AC-8** | S-3 performs **≤ 5 adapter reads** and **exactly one entitlement check per distinct non-null feature key** for 26 groups; one store's failure degrades only that store's groups, with HTTP `200`. | `T-P1-9`, `T-P1-10`, `T-P1-20` |
| **AC-9** | Authorization matrix holds: `hr` → 26 readable / 25 writable; `manager` → **5** readable / 0 writable; `employee`, `admin`, `super-admin` → `403`. Cross-org reads return nothing from the other org, and `orgId` is not an accepted input anywhere. A 503 from entitlement propagates as 503. | `T-S29`–`T-S32`, `T-S22`, `T-P1-11` |
| **AC-10** | A `null` stored value is returned as `null` with `inherits_from` populated and **no resolved substitute** anywhere in the response. | `T-S9` |
| **AC-11** | No response from any endpoint contains a value for S-1/S-2, a key matching the secret pattern, `enforcement_hint`, any of the 16 org master-data keys, or any asset/storage key. The read path emits no `console.log`. | `T-S12`, `T-S14`, `T-S18`, `T-S19`, `T-P1-18` |
| **AC-12** | **The static no-write scan is green**: no file under `src/modules/settings/` calls `.update(`, `.create(`, `.destroy(`, `.save(`, `.replace(` or `.upsert(` on an owner service, model or repository. | `T-S1` |
| **AC-13** | **`git diff --stat` outside `src/modules/settings/`, `tests/unit/settings/` and `public/` shows exactly one changed line, in `src/app.js`.** No existing test file is modified. No entry is added to `MODEL_ROOTS`. | `T-P1-16`, `T-P1-21`, plus the diff itself |
| **AC-14** | `npm test` matches the **Step 0 baseline** plus the new settings tests: **zero pre-existing tests changed, zero newly failing.** | the two test runs, both recorded in the PR |
| **AC-15** | Documentation is complete: `api_registry.md` #242–#245, `public/md_settings/combined_api_analysis.md`, the dated `public/md_updates/` change record, and the three DEF-S1/S2/S3 registry corrections. | review |
| **AC-16** | **No migration file is created**, no seeder, no env var, no new dependency in `package.json`. | `git status`, `git diff package.json` |

---

## 27. Production Readiness Checklist

To be walked immediately before the PR is opened. Every row is either green or has a named owner.

**Correctness**

- [ ] 138 keys / 26 groups / 5 stores; per-store counts 63 / 25 / 35 / 13 / 2 (AC-1)
- [ ] registry refs 1–114 covered exactly once; 65 + 49 (AC-2)
- [ ] `T-S2` green for all five adapters, two-sided (AC-5)
- [ ] every `effect_timing` is one of the five allowed values, for all 138 keys (invariant 10)
- [ ] every `risk: 'high'` key has a non-empty `warnings[]` and `requires_reason: true` (invariant 7)
- [ ] `non_default_keys` empty for a fresh org (AC-4)
- [ ] `null` returned as `null`, never resolved (AC-10)

**Security**

- [ ] `orgId` is read only from `req.user.orgId` — grep the module for any other source
- [ ] no `requireFeature` **middleware** on any settings route (the `req.body?.orgId` fallback stays unreachable — §14.3)
- [ ] no catalog key is `sensitive`; no asset/storage key is read
- [ ] the 16 org master-data keys appear in no catalog file
- [ ] branding read uses `includeAssetUrls: false`
- [ ] no `admin`/`super-admin` in any `read_roles`/`write_roles`, and neither in the route allow-list
- [ ] no setting value in any log line; no `console.log` in the read path
- [ ] `:settingKey` / `:groupKey` regex-bounded; catalog lookup is `Map`-based

**Reliability**

- [ ] S-3 uses `Promise.allSettled`; one store's failure yields `200` + `READ_FAILED`
- [ ] a 503 from `entitlementService` propagates as 503
- [ ] S-3 performs ≤ 5 adapter reads and ≤ 2 entitlement checks
- [ ] filter-before-read: a non-entitled store is never read, so never provisioned
- [ ] all four endpoints are `GET`; retries are safe
- [ ] the catalog fails the **boot**, not the request, on any invariant breach

**Isolation**

- [ ] `T-S1` static no-write scan green (AC-12)
- [ ] the controller requires nothing outside `src/modules/settings/` and `src/common/`
- [ ] no existing module file or test file modified; one line in `src/app.js` (AC-13)
- [ ] no `MODEL_ROOTS` entry; no migration; no seeder; no new dependency (AC-16)

**Operations**

- [ ] `npm test` matches the Step 0 baseline plus the new tests (AC-14)
- [ ] `catalog_version` set and in the documented format
- [ ] `api_registry.md` numbers re-checked against the current maximum before use
- [ ] the dated `md_updates` change record written, with the "no breaking changes" statement
- [ ] the three §23.5 post-deploy checks handed to the operator
- [ ] rollback = redeploy previous image; no data consequence — stated in the PR

---

## 28. Risks & Open Decisions

### 28.1 Risks

| ID | Risk | Likelihood | Mitigation |
|---|---|---|---|
| **R-P1-1** | **A catalog entry is authored from the registry's prose rather than the code**, publishing a wrong default or range. | **High** — this is the single most likely defect in the phase, because Step 4 is 138 × ~25 fields of transcription. | `T-S2` catches the four mechanical fields automatically. The behavioural fields (`effect_timing`, `risk`, `warnings`, `consumed_by`) are **not** mechanically checkable — §6.6's one-authority-per-field rule and a review pass over those four fields specifically are the only defence. Call this out in the PR. |
| **R-P1-2** | **An owner's export is renamed** (`MUTABLE_FIELDS`, `updateSettingsSchema`, `fieldValidation_UpdateOrganizationProfile`), breaking the adapter. | Low | `T-S2` fails at build time, not runtime. The coupling is deliberate and documented (§24). |
| **R-P1-3** | **`T-S2` cannot read model metadata without a connection** if the model registry turns out to connect eagerly. | Low–medium | Verified at Step 2; the fallback (a stubbed Sequelize instance used only for attribute metadata) is specified in §7.7. **This must be settled at Step 2, not discovered at Step 4.** |
| **R-P1-4** | **S-3's response grows** as groups are added, pushing past a comfortable payload size. | Low in Phase 1 (40–60 KB) | the `modules` filter already exists; Phase 5's cache is the escalation if needed. |
| **R-P1-5** | **A later contributor adds a write method to an adapter** "while they're in there", bypassing the owner's validation. | Medium over time | `T-S1`'s static scan is the enforcement, and §7.1 rule 4 forbids even a throwing stub. The test must be written in Step 1–7, not left to Step 11. |
| **R-P1-6** | **`manager`'s 5-group view is read as the product decision** it has not formally been. | Medium | `OD-P1-2`. The implementation reads `read_roles` from catalog data, so widening it is a one-line data change in `groups.js` with no code change. |

### 28.2 Open decisions — none blocks implementation

| ID | Decision | Default taken in this plan | Who decides |
|---|---|---|---|
| **OD-P1-1** | Should `billing.notifications` get a real `billing.access` feature key? | **No** — `featureKey: null`. Creating one needs a `features` row and a `plan_features` row, i.e. new billing data for a settings read. | product + billing owner |
| **OD-P1-2** | Is `manager`'s read scope exactly those 5 keys? | **Yes**, per §14.2's reasoning (each key governs the manager's own permitted behaviour). | product |
| **OD-P1-3** | Rate-limit S-3? | **No** — no read endpoint in this codebase is rate-limited (§14.7). Revisit if S-3 appears in a polling loop. | ops |
| **OD-P1-4** | Should `platform_cap` publish the cap **value**? | **Yes** — it is a published product limit, not a secret, and without it a UI cannot explain a rejected value. Never the env var's content. | security review |
| **OD-P1-5** | Does S-2 justify its existence? | **Yes, narrowly** (§10.1). If review disagrees, drop it and fold `related` into S-1 — a contained change, and the cheapest thing in this plan to cut. | reviewer |

### 28.3 Phase 2 entry criteria

Phase 2 (the write plane, S-5…S-7) may start when:

1. All 16 AC rows of §26 are green and Phase 1 is deployed.
2. `valuesEqual()` is in place — Phase 2 **inherits** it and must not write a second comparator.
3. **DEF-S7** is scheduled: `payroll_settings.service.update` must take `FOR UPDATE` before
   `If-Match` can be compared under a lock.
4. **DEF-S8** is scheduled: `PUT /documents/hr/settings` has no `validate()` middleware.
5. **DEF-S12** is understood: `changed` must be built from the **re-read row, never the submitted
   patch**, because `document_letter_branding.replace()` silently normalises.
6. **DEF-S10** is acknowledged as the Phase 3 blocker (no prior-row read ⇒ no `old_value`), and the
   locked pre-read it needs is the point at which the org adapter switches from the repository to the
   service (§7.6).
7. **The `payroll_settings.service.js:99` "fix" is formally dropped** from the Phase 2 scope — that
   half of DEF-S11 does not reproduce (§8.3). Phase 2 must not change that shipped diff.

---

## 29. Final Validation Pass

The brief requires 20 checks before this document is considered finished. Each is answered with
where in the document it is discharged — and where the answer is "no", that is stated.

| # | Check | Result |
|---|---|---|
| 1 | Every Phase 1 requirement from the parent is covered | **Yes.** Parent §16's five scope items map to F-P1-1 … F-P1-8; its six completion criteria map into AC-1…AC-16, with (c) corrected from four adapters to five. |
| 2 | No feature invented | **Yes.** Every key traces to a registry entry and an existing column; every endpoint to parent §7.1 S-1…S-4. The only additions beyond the parent are two *corrections* (five adapters, the comparator's phase) and one new catalog file (`branding.catalog.js` for #104) — all recorded in §1.4. |
| 3 | Existing functionality reused, not duplicated | **Yes.** Five owner read methods, three Joi schemas, four middlewares, `AppError`, `validateOrThrow`, the `envelope`/`ctx` helpers, `entitlementService`. **No new middleware, no new validator utility, no new error class, no re-implemented business rule.** §3.1. |
| 4 | Ownership and scope boundaries unambiguous | **Yes.** §5.1–§5.4, with the complete key→group map in §5.2 and the exclusion rules with reasons in §5.3. |
| 5 | Database constraints and relationships correct | **Not Applicable, stated as such** — §9. No schema change; existing constraints relied upon and named (`UNIQUE(org_id)`, `paranoid`). |
| 6 | API contracts well-defined | **Yes.** §10, endpoint by endpoint, with the full error catalogue in §10.7 and the S-3/S-4 status asymmetry made explicit. |
| 7 | Authorization boundaries enforced | **Yes.** §14.1–§14.2, two layers (route allow-list + per-group `read_roles`), with `admin`/`super-admin` excluded twice. |
| 8 | Tenant isolation guaranteed | **Yes.** §14.3 — `orgId` is never an input, so there is no injection point; `T-S22`. |
| 9 | Sensitive settings handled | **Yes.** §14.4 — no `sensitive` key exists, invariant 11 makes that a build gate, ops flags publish names not values, `T-S18` greps the serialised body. |
| 10 | Concurrency addressed | **Yes.** §19.1, including what is deliberately *not* locked and why, and the cross-store non-snapshot accepted with its reason. |
| 11 | Idempotency and retry | **Yes.** §19.2 — `GET` semantics, the once-per-org provisioning side effect, and why an idempotency key would be meaningless here. |
| 12 | Cache and runtime consistency | **Yes, as a reasoned "no cache"** — §16, with each named sub-question answered and the one signature rule Phase 5 depends on. |
| 13 | Auditability | **Yes.** §17.1 — nothing is written, and the one pre-existing side effect is declared rather than hidden, with a test that it is once-per-org. |
| 14 | Failure and recovery | **Yes.** §18.2 answers all 16 named scenarios, including the eight that cannot occur, with reasons. §18.3 covers catalog failure. |
| 15 | Testing coverage sufficient | **Yes.** §21, five categories, ~55–70 assertions, every AC row backed by a named test. Integration tests marked **Not Applicable** with the reason (no database access) and the three manual checks handed to the operator instead. |
| 16 | Migration and deployment safe | **Yes.** §23 — no migration, additive rolling deploy, rollback by redeploy, and the multi-instance question answered for the only per-instance artifact (the catalog). |
| 17 | Dependencies on other modules clear | **Yes.** §3.1–§3.4, with the one-way diagram and the explicit statement that **no existing module gains a dependency on Settings**. |
| 18 | No future-phase functionality | **Yes.** No write path, no `models/`, no `repositories/`, no migration `00073`, no surfaces or readiness endpoint, no cache, no event bus. §1.2 and §19.3. The one deliberate forward move — the comparator — is justified in §8.1 because Phase 1 *needs* it. |
| 19 | No duplicate settings mechanism | **Yes.** No key-value table, no `settings` model, no second storage path, no parallel validation. The five existing stores remain the only homes for values; the catalog holds **metadata only**. |
| 20 | Production-readiness architecture review | **Yes.** §27, plus the honest statements: R-P1-1 is the real risk (transcription), the coupling in §24 is deliberate and build-time-enforced, and §8.3 corrects the parent rather than inheriting a defect that does not reproduce. |

### 29.1 What this plan does **not** claim

In keeping with the standing constraint that nothing is reported as verified unless it was actually
checked:

* **No test has been run.** `T-S1`…`T-S59` and `T-P1-1`…`T-P1-21` are **specified**, not executed.
  The Step 0 baseline exists precisely because the current `npm test` result has not been measured in
  this plan.
* **No code has been written.** This is a plan; `src/modules/settings/` does not exist.
* **No database was touched** — no `db:migrate`, no `db:migrate:status`, no connectivity check, per
  the standing constraint.
* **The inventory was verified statically on 2026-10-09** by requiring the owners' exports and
  reading their models, validators and services. §2's pre-flight step re-verifies it before coding,
  because the repository moves.
* **Three numbers in the parent plan are corrected here, not silently absorbed:** four adapters → **five**; 98 settings → **114 registry entries / 138 writable keys**; 37 mutable document fields → **35**. §1.4.

---

## 30. Implementation deviations (2026-10-09, kept current per §22.1)

Phase 1 is implemented and tested (48 new assertions in `tests/unit/settings/`, full
suite `3203 pass / 0 fail` — the 3155 Step-0 baseline plus the 48, none pre-existing
test modified). Four decisions deviate from or clarify the plan as written:

1. **§22.2's DEF-S1/S2/S3 descriptions do not match the parent plan §1.1.** §22.2
   describes them as a default mismatch / a range mismatch / a moved enforcement
   path "caught by T-S2". The actual DEF-S1/S2/S3 in the parent plan §1.1 are
   documentation-structure errors: billing #97/#98 absent from the registry;
   #87–#90 filed under Document though backed by `payroll_settings`; the
   cross-module Notes block sitting inside Payroll between #40/#41. **T-S2 was run
   and passes cleanly**, which confirms there is *no* default/range/path drift
   between the catalog and the owners' models/Joi — so the §22.2 descriptions could
   not be applied (they describe defects that do not exist). The §1.1 corrections
   were applied to `org_settings_registry.md` instead: the #97–#114 addendum
   (DEF-S1) and surgical correction notes at the Notes block (DEF-S3) and above #87
   (DEF-S2). Physical block relocation was avoided as non-surgical in a 1100+-line
   doc other work indexes by position.

2. **Manager read scope is 2 groups, not "5".** §22.1 says to document "the
   manager's 5-group view." The shipped scope — the groups whose `read_roles`
   include `manager` — is exactly **two**: `payroll.authority` and
   `documents.authority` (the maker/checker authority knobs, confirmed by §5.4's
   enumeration of #38/#40/#58/#59/#93). The change record documents 2.

3. **`validateOrThrow` status is 400, not 422.** The shared
   `common/utilities/validator.utils.validateOrThrow` raises `400 VALIDATION_ERROR`;
   it was reused unchanged. The two *business*-filter rejections the plan calls out
   (`INVALID_FILTER_COMBINATION`, `UNKNOWN_MODULE`) are raised explicitly in the
   controller as `422`. So malformed input (array param, bad regex, unknown query
   key) → `400`; a well-formed-but-contradictory filter → `422`.

4. **`effect_timing` and `risk` were authored by domain judgment** (per R-P1-1 —
   these are the fields "nothing else can check" against the model/Joi). They merit
   a domain review pass before Phase 2 wires writes off `effect_timing`.

---

*End of Settings Module — Phase 1 Implementation Plan.*
