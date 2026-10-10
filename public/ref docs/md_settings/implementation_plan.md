# Settings Module — Implementation Plan

> **Status:** PLAN ONLY — nothing in this document has been implemented.
> **Source of truth:** [org_settings_registry.md](org_settings_registry.md) (**114** numbered entries, continuous 1–114, verified). Entries #97–#114 were added to the registry on 2026-10-09 from the code audit in §2.5.
> **Authored:** 2026-10-08
> **Reference plans whose structure this follows:** [md_payrolls/implementation_plan.md](../md_payrolls/implementation_plan.md), [md_pdf-generation/implementation_plan.md](../md_pdf-generation/implementation_plan.md), [md_leave/implementation_plan.md](../md_leave/implementation_plan.md)

---

## 0. How to use this document

* **§1–§5** are the analysis and the architecture. Read them once, fully, before touching code. They decide *what the Settings module is* — and more importantly *what it is not*.
* **§6–§15** are the build contract: every table, endpoint, guard, cache key and failure mode an implementer needs.
* **§16** is the phase plan. Phases are dependency-ordered; do not reorder.
* **§19** lists what could not be decided from the source of truth. **Each item blocks the phase it is tagged to.** Answer them before starting that phase, not during.
* Decisions are numbered `D-S1 …` and referenced from the phases. Edge cases are `EC-S1 …`. Tests are `T-S1 …`. Defects found in existing code during this analysis are `DEF-S1 …`.
* When a phase ships, append an amendment section at the bottom (the convention the PDF plan uses) rather than rewriting the phase.

---

## 1. Executive Summary

The registry documents **96 organization-level decisions** across five modules. A code audit shows that **every one of them already has a storage home, a validator and an enforcement point**. There is no missing persistence layer. What is missing is a **single, coherent, machine-readable way to see, change, audit and reason about them** — today an org admin must visit five unrelated API surfaces (`/payroll/hr/settings`, `/payroll/hr/statutory/config`, `/documents/hr/settings`, `/organizations/profile`, plus a dozen per-record CRUD surfaces) to configure one organization.

Therefore the Settings module is **not a settings store**. It is a **catalog + gateway**:

1. **A declarative catalog** — a versioned code asset (the machine-readable twin of `org_settings_registry.md`) describing every setting: key, owning store, group, scope, data type, default, documented range, RBAC, risk class, change-effect timing, dependencies, enforcement pointer. Kept honest by a **parity test** against each owning module's Joi schema and mutable-field list, so it cannot silently drift from the code.
2. **A gateway** — read aggregation across the four org-singleton stores, and a write dispatcher that **delegates every mutation to the owning module's existing service**, so every existing guard rail (`INSUFFICIENT_CHECKERS`, `SETTINGS_CONFLICT`, `INVALID_PAYOUT_COMPONENT`, `SETTING_OUT_OF_RANGE`, the `affected_runs` impact readout, the audit write) remains the single enforcement boundary.
3. **A surfaces index** — read-only descriptors pointing at the owning module's CRUD for the 34 **per-record** settings (leave types, attendance policies, holidays, weekly-offs, locations, PT slabs…). The Settings module never proxies that CRUD.
4. **A settings-change ledger** for stores with no audit table today, plus a unified history reader that unions the three existing audit tables.

**Explicitly rejected** (§4.8, §4.10): a generic key-value `settings` table; a single `PATCH /settings` writing across stores in one request; a Settings module owning per-record policy CRUD; an event bus for configuration change.

**New database objects: one table** (`settings_change_logs`). **No setting value is relocated. No new dependency.**

### 1.1 Headline findings from the code audit

| # | Finding | Impact |
|---|---|---|
| DEF-S1 | Registry entries **#97 / #98** (`billing_notification_emails`, `billing_reminder_lead_days`) are implemented and self-identify as "registry #97/#98" in four code sites, but are **absent from the registry document**. | Registry is stale; Billing has no section. |
| DEF-S2 | Entries **#87–#90** are filed under `## Document Module` but are all backed by the **`payroll_settings`** singleton. | A UI built from section headings would put four payroll knobs on a documents page. |
| DEF-S3 | The `## Notes & cross-module dependencies` block sits **inside** the Payroll section, between #40 and #41. | Document structure implies #41–#46 are not payroll settings; they are. |
| DEF-S4 | **Attendance settings #13–#29 have no change audit.** `attendance_audit_logs` exists but is required by exactly one file (`clock.service.js`). Policy/holiday/weekly-off/shift/lock/comp-off-policy writes record nothing. | 17 entries, including payroll lock periods, change with no attributable history. |
| DEF-S5 | **Leave settings #1–#12 have no change audit** — the leave module has no audit table at all. | 12 entries including quota and eligibility gates. |
| DEF-S6 | **Organization settings #30–#34, #97, #98 have no change audit** — the org module has no audit table (acknowledged in code comments at `organization.service.js:998` and `:1304`). | Reporting-hierarchy and invitation-policy changes are unattributable. |
| DEF-S7 | `payroll_settings.service.update` reads `current` via `findOrCreate` **without `FOR UPDATE`**, unlike `document_settings.service.update` and `statutory_config.service.updateConfig`, which both lock. | Two concurrent HR writes can interleave → lost update + wrong audit diff. |
| DEF-S8 | `PUT /documents/hr/settings` has **no `validate()` route middleware**; validation happens inside the controller via `validateOrThrow`. | Behaviourally fine today, inconsistent with every other write route, easy to forget on the next endpoint. |
| DEF-S9 | Entry **#87 (`pdf_render_engine`) is documented DEPRECATED and inert** but is still accepted and stored by the payroll settings validator/service. | A Settings UI must be told not to render it. |
| DEF-S10 | `organization.service.updateOrganizationProfile` writes through `organizationRepository.updateOrganizationProfileFields`, which is a **blind `UPDATE … WHERE org_id`** — no `SELECT … FOR UPDATE`, and **no read of the prior row at all**. | Two issues, not one: (a) `If-Match` cannot be verified under a lock, and (b) **there is no before-state to audit**, so Phase 3's `settingsAudit.record` old→new diff is impossible until a locked pre-read is added. This makes DEF-S10 a **prerequisite for Phase 3**, not a nicety. |
| DEF-S11 | 19 settings columns are `DECIMAL` (5 on `payroll_settings`, 14 on `statutory_configs`). The `pg` driver returns `NUMERIC`/`DECIMAL` as **JavaScript strings** (`'2.00'`), while model `defaultValue`s and Joi payloads are **numbers** (`2.00`). `payroll_settings.service.js:99` diffs with `before[key] !== updated[key]`. | A pre-existing latent defect: a DECIMAL key can be recorded as changed when it did not change (`'2.00' !== 2.00`). It also means a naive `value !== default` comparison would report **every clean org** as having non-default decimals. Requires one type-aware comparator, used by both the owner diff and the gateway's `non_default_keys`. |
| DEF-S12 | **`document_letter_branding` is an org singleton** (`UNIQUE (org_id)`, `getOrCreate`, 13 writable identity fields) that this analysis initially mis-classified as a per-record surface. | It is company letterhead identity — the thing HR most expects on a company settings page. Without a dedicated adapter the gateway would have **no writable group for letterhead branding at all**. Registered as entry **#104** and given the fifth adapter. |

---

## 2. Requirements Analysis

### 2.1 What the source of truth contains

114 entries, each with a fixed 7-field shape (Configuration Level, Data Type, Default Value, Enforcement Point, Deep Explanation, Applicable ON, Not-Applicable OFF). Several carry extra `Range:` / `Allowed Values:` / `⚠` fields.

| Document section | Entries | Count |
|---|---|---|
| Leave | #1–#12 | 12 |
| Attendance | #13–#29 | 17 |
| Organization | #30–#34 | 5 |
| Payroll | #35–#57 | 23 |
| Document | #58–#96 | 39 |
| **Total** | | **96** |

A registry *entry* is not a *column*. Many entries bundle several columns (#35 bundles 5, #46 bundles 6, #47 bundles 15, #55 bundles 11). The catalog must model **entry → one-or-more keys**, not one-to-one.

### 2.2 Distribution by actual storage home

This is the axis the architecture is built on, and it does **not** match the document's section headings (DEF-S2, DEF-S3).

| Store | Kind | Registry entries | Notes |
|---|---|---|---|
| `payroll_settings` | org singleton, lazily created | #35–#46, #49 (`pt_state_source` only), #50 (declaration/regime/rounding part), #51–#57, #87–#90 | `hr`-only; audited to `payroll_audit_logs` |
| `statutory_configs` | org singleton, lazily created | #47, #48, #49 (`pt_enabled` only), #50 (enablement/rates part) | `hr`-only; audited to `payroll_audit_logs`; frozen into `payroll_runs.settings_snapshot` at run CREATE |
| `document_settings` | org singleton, lazily created | #58–#86, #91–#96 | 37 mutable columns (`MUTABLE_FIELDS`); audited to `document_audit_logs` |
| `organization_profiles` | org singleton (profile row) | **#97, #98 — unregistered (DEF-S1)** | **no audit table** |
| Per-record tables | 0..N rows per org | #1–#34, #49 (slab rows) | leave types, policy entitlements, employee leave configs, attendance policies, weekly-off rules, comp-off policies, shift templates, holidays, lock periods, locations, departments, reporting mappings, role-invitation policies, PT slabs |

**Consequence:** **65 of 114** entries live in **five** org singletons that already have read + write endpoints (and audit on four of the five): 62 across `payroll_settings`/`statutory_configs`/`document_settings`, 2 on `organization_profiles` (#97/#98), and 1 — a 13-field identity record — on `document_letter_branding` (#104). The remaining **49** live in per-record tables that already have full CRUD. **A Settings module that owns values would be a second source of truth for both halves.**

### 2.3 Scope model present in the data

Five distinct configuration levels, not a uniform hierarchy. Where two levels exist, the owning module already defines the precedence; this plan invents none.

| Scope | Where it appears | Precedence already in code |
|---|---|---|
| **Platform / ops** | not registry entries — env flags (`PDF_BULK_GENERATION_ENABLED`, `BILLING_PERIOD_ENFORCEMENT`, `ENABLE_ATTENDANCE_SIMULATOR`) and provider hard caps (`VIEW_TTL_CAP_SECONDS=900`, `UPLOAD_TTL_CAP_SECONDS=3600`, `ORG_PUBLISH_SYNC_LIMIT=20000`, `ORG_CEILING_BYTES=25 MB`) | **Platform ceiling always wins.** An org may only narrow (#61, #62, #63, #79). |
| **Org (global)** | the four singletons | single value, no contest |
| **Per record / per policy** | leave types, attendance policies, comp-off policies, weekly-off rules, holidays, shift templates, document types, letter configs | targeted rules resolve by `priority` (#25, #26, #28); per-record narrows or overrides the org floor — **and the operator differs per entry** (§5.3) |
| **Per employee** | `employee_leave_configs` (#5, #6, #8, #11) | employee override beats the policy template |
| **Frozen snapshot** | `payroll_runs.settings_snapshot` (#47–#50, #53); reimbursement chain (#51); letter flags (#85, #86); encashment amounts (#55, #57); recipient `due_on` (#68); request `due_on` (#77); signature provider at sign (#70) | **The value at the time of the event wins forever.** A later settings change never restates a committed record. |

The **frozen-snapshot** family is the most important semantic in the registry and the one most likely to be mis-built. §8.4 makes it a first-class catalog attribute (`effect_timing`).

### 2.4 Non-functional requirements derived from the registry

| NFR | Derived from |
|---|---|
| Changes must be attributable (actor, old→new, timestamp, IP, request id) | §Payroll preamble: "every change is written to the append-only `payroll_audit_logs` old→new"; the three existing audit tables |
| Some changes are **irreversible by consequence** and need a confirmation gate | #95 "⚠ Lowering this value makes existing soft-deleted letters … purge candidates on the very next nightly run, and the deletion is irreversible"; #65 "because purge is irreversible" |
| Some changes alter an **HTTP response class** for clients | #79 "⚠ Response-class note: Lowering this value changes the response class … from `200` to `202`" |
| Enabling a control must never deadlock the org | #39, #60 `INSUFFICIENT_CHECKERS`; #64 `SCAN_PROVIDER_NOT_CONFIGURED`; #59+#60 `SETTINGS_CONFLICT` |
| A setting whose dependency is unconfigured must fail loudly, not guess | #49 `PT_STATE_UNRESOLVED` / `PT_SLAB_UNRESOLVED`; #55/#57 component id must reference an active earning component |
| Guard rails must fail **open** where they are abuse protection, not correctness | #83, #96 "the limiter fails open — a Redis error never blocks a legitimate batch" |
| Reads are on hot paths and must stay cheap | #68 settings read inside every publish/sync transaction (C-30); `resolveEffectivePolicy` reads settings on document reads; #58 on every manager list |
| Tenant isolation is absolute | `org_id` on every store; `hr` is top of the tenant plane, `admin`/`super-admin` get no tenant data |

### 2.5 Registry ↔ code gaps found — **now closed in the registry (2026-10-09)**

The first pass of this analysis found 18 org-level configuration decisions that were already implemented and enforced in code but had **no registry entry**. The user's decision (2026-10-09) was that nothing may be left behind, so they were **written into `org_settings_registry.md` as entries #97–#114** before this plan was revised. Q-S1 is therefore **resolved**, and the registry is the source of truth for all 114.

Each entry was authored *from* the code: every citation below was opened and the field values transcribed from the model, validator and consumer.

#### 2.5.1 Newly registered as **organizational singletons** (writable settings groups)

| # | Key(s) | Store | Code citation |
|---|---|---|---|
| #97 | `billing_notification_emails` (array ≤ 5 emails) | `organization_profiles` | [billing_defaults.js](../../src/modules/billing/utils/billing_defaults.js) `MAX_BILLING_NOTIFICATION_EMAILS`, [billing_notification.service.js](../../src/modules/billing/services/billing_notification.service.js), [organization.validator.js](../../src/modules/organization/validators/organization.validator.js) |
| #98 | `billing_reminder_lead_days` (array ≤ 4 ints 1–90, default `[7,1]`) | `organization_profiles` | [billing_defaults.js](../../src/modules/billing/utils/billing_defaults.js) `DEFAULT_REMINDER_LEAD_DAYS`, [subscription_lifecycle.service.js](../../src/modules/billing/services/subscription_lifecycle.service.js), [organization.validator.js](../../src/modules/organization/validators/organization.validator.js) |
| **#104** | **13 letterhead identity fields** — `signatory_name`, `signatory_designation`, `registered_address_lines`, `cin`, `gstin`, `pan`, `tan`, `contact_email`, `contact_phone`, `website`, `accent_color_hex`, `footer_note`, `letterhead_enabled` | **`document_letter_branding`** | [document_letter_branding.model.js](../../src/modules/document/models/document_letter_branding.model.js) (`org_id` `unique: true`), [document_letter_branding.service.js](../../src/modules/document/services/document_letter_branding.service.js) (`getOrCreate`, `replace`, `_mapReplaceFields`) |

**#104 is the correction that changes the architecture** (DEF-S12). The first pass classified `document_letter_branding` as a per-record surface; it is in fact the **fifth org singleton** — `UNIQUE (org_id)`, lazily provisioned by `getOrCreate`, 13 writable scalar/array fields, and the thing HR most expects to find on a company settings page. It gets a dedicated adapter and the writable group `documents.branding` (§5.1).

Three properties of its existing `replace()` make it an unusually clean adapter target, and they were verified in code rather than assumed:

* it is **already PATCH semantics** — `_mapReplaceFields` uses `hasOwnProperty`, so absent keys are untouched despite the method name;
* it **already takes the row lock** — `brandingRepo.findByOrgId(orgId, { lock: true, transaction: t })`;
* it **already audits** old → new into `document_audit_logs` under `entity_type='document_letter_branding'`, action `letter_branding.updated`.

So the branding adapter needs no new audit plumbing and no DEF-S7-style lock fix. What it does need is three field-level rules the gateway must respect (§8.6): `accent_color_hex` is `NOT NULL` and **may never be cleared**; `registered_address_lines` is trimmed/filtered and **truncated to 5**; and the six asset columns (`logo_*`, `signature_*`) are **not writable here** and are `sensitive` — they belong to the upload handshake.

#### 2.5.2 Newly registered as **per-record surfaces** (pointers only, never proxied)

| # | Decision | Owning module | Canonical endpoint | Code citation |
|---|---|---|---|---|
| #99 | Default attendance policy (`is_default`, exactly one per org, auto-promoted for the first) | attendance | `/attendance/hr/policies` | [policy.service.js](../../src/modules/attendance/services/policy.service.js) |
| #100 | Calendar exceptions (date + `exception_type`, targeted) — **read by three modules** | attendance | `/attendance/hr/*` calendar exceptions | [attendance_calendar_exceptions.repository.js](../../src/modules/attendance/repositories/attendance_calendar_exceptions.repository.js), [leave_calculator.utils.js](../../src/modules/leave/utils/leave_calculator.utils.js), [payroll_attendance_aggregator.service.js](../../src/modules/payroll/services/payroll_attendance_aggregator.service.js) |
| #101 | Shift rotation patterns + ordered entries | attendance | `/attendance/hr/rotations` | [shift_rotation_patterns.model.js](../../src/modules/attendance/models/shift_rotation_patterns.model.js) |
| #102 | Field-work locations + `geofence_radius_meters` | attendance | `/attendance/hr/field-locations`, `/field-assignments` | [organization_field_locations.model.js](../../src/modules/attendance/models/organization_field_locations.model.js) |
| #103 | Biometric/attendance devices + employee mappings — **holds `api_key_hash`** | attendance | `/attendance/hr/devices`, `/devices/:id/mappings` | [attendance_devices.model.js](../../src/modules/attendance/models/attendance_devices.model.js) |
| **#114** | **Shift templates** (`name`, `type`, `start_time`, `end_time`, `timezone`, `is_overnight`, `is_active`) | attendance | `/attendance/hr/shifts`, `/shifts/assign` | [shift_templates.model.js](../../src/modules/attendance/models/shift_templates.model.js), [shift_resolver.utils.js](../../src/modules/attendance/utils/shift_resolver.utils.js) |
| #105 | Per-letter-type configuration (reference pattern, approval, signature mode — the per-type layer under #84–#86) | document | `/documents/hr/letter-templates/:code/config` | [document_letter_configs.model.js](../../src/modules/document/models/document_letter_configs.model.js) |
| #106 | Per-document-type rules (~20 flags; override the org-wide #58, #63, #65–#67, #71) | document | `/documents/hr/types`, `/types/activate`, `/types/:id` | [document_types.model.js](../../src/modules/document/models/document_types.model.js), [document_type_rules.utils.js](../../src/modules/document/utils/document_type_rules.utils.js) |
| #107 | Salary component catalog (soft-deleted, never hard-deleted) | payroll | `/payroll/hr/components` (+ `/bootstrap`) | [salary_components.model.js](../../src/modules/payroll/models/salary_components.model.js) |
| #108 | Reimbursement categories | payroll | `/payroll/hr/reimbursements/categories` | [reimbursement_categories.model.js](../../src/modules/payroll/models/reimbursement_categories.model.js) |
| #109 | Benefit plans + enrollments | payroll | `/payroll/hr/benefit-plans` | [benefit_plans.model.js](../../src/modules/payroll/models/benefit_plans.model.js) |
| #110 | Bonus rules (maker-checker + `preview-impact` lifecycle) | payroll | `/payroll/hr/bonus-rules` | [bonus_rules.model.js](../../src/modules/payroll/models/bonus_rules.model.js) |
| #111 | Tax regimes & slabs (`is_default`, surcharge, rebate) | payroll | `/payroll/hr/tax/regimes`, `/tax/regimes/:id/slabs` | [tax_regime.model.js](../../src/modules/payroll/models/tax_regime.model.js), [tax_slab.model.js](../../src/modules/payroll/models/tax_slab.model.js) |
| #112 | Salary structure templates + components (`definition_mode`) | payroll | `/payroll/hr/structure-templates` | [salary_structure_templates.model.js](../../src/modules/payroll/models/salary_structure_templates.model.js) |
| #113 | Leave policy templates, entitlements & the effective-dated assignment ledger | leave | `/leaves/templates`, `/leaves/assignments*`, `/leaves/users/:userId/assign-policy` | [leave_policy_template.model.js](../../src/modules/leave/models/leave_policy_template.model.js), [employee_leave_policy_assignment.model.js](../../src/modules/leave/models/employee_leave_policy_assignment.model.js) |

**#114 (shift templates) was missed by both the registry and this plan's first pass.** It was found by a second sweep that compared every `*.model.js` in the repo against the registry rather than only following the registry's own citations. It matters because #20 (auto-detect shift), #101 (rotations) and the grace/late thresholds (#13/#14/#16) are all *expressed in terms of* shift templates — a registry that describes those but not the templates they reference is incomplete at its foundation.

#### 2.5.3 Completeness evidence

The sweep that produced #97–#114 is reproducible, and these are its results rather than an assertion of thoroughness:

* **Org singletons** — a scan for models declaring `org_id` with `unique: true` returns exactly `document_settings` and `document_letter_branding`; `payroll_settings` and `statutory_configs` enforce the same shape through partial unique indexes in migrations, and `organization_profiles` is one-per-org by construction. **Five singletons, all five now adapted.** This is the class where a miss is expensive (it would mean an unwritable settings group), and it is now closed.
* **Per-record tables** — every `*.model.js` was listed and classified; the 15 new surfaces above are the configuration-bearing remainder.
* **Deliberate exclusions** are catalogued in the registry's own addendum (document *content*, org *master data*, platform-plane catalog/plan tables, role definitions already covered by #32/#33, records created under a setting, env/hard-coded operational constants, and secrets). Writing them down is what stops a future reader from re-opening a closed question.

#### 2.5.4 Still hard-coded — candidates, deliberately **not** registered

Raised as §19 Q-S6, unchanged by this pass: invitation TTL (`INVITE_TTL = 48 * 60 * 60`, [invitation.repository.js:4](../../src/modules/organization/repositories/invitation.repository.js)), the statutory rounding tolerance, `LIST_MAX_LIMIT`, cron schedules, and the `BILLING_*` env knobs in [billing_defaults.js](../../src/modules/billing/utils/billing_defaults.js). These are **seller-controlled operational constants**, not tenant decisions; promoting one is a product decision, not a settings-module task.


### 2.6 Functional requirements for the module

| ID | Requirement | Source |
|---|---|---|
| FR-1 | One read returning every org-plane setting the caller may see, grouped and annotated | registry PURPOSE: "surfaces all of these in one place" |
| FR-2 | A machine-readable catalog a frontend can render a settings UI from, with no hard-coded field list | registry PURPOSE + the shared "audience picker" note (§Notes) |
| FR-3 | Partial update of a settings group, preserving every existing guard and audit behaviour | §Payroll preamble, #39, #59/#60, #55/#57 |
| FR-4 | Reset listed keys to their documented defaults | the `Default Value` field on all 114 entries |
| FR-5 | Unified change history: key, old, new, actor, timestamp, reason | §Payroll preamble (append-only old→new) |
| FR-6 | An index of per-record configuration surfaces pointing at the owning CRUD | §Notes: the targeting model is shared by weekly-offs, holidays, comp-off policies |
| FR-7 | A readiness readout for catalog-declared preconditions | #39, #49, #55, #57, #60, #64, #70 |
| FR-8 | Expose the documented **precedence** and **effect timing**, so a UI can explain which rejection fires first and when a change bites | §Notes "Precedence to preserve"; #53, #68, #77, #85, #86 "frozen" |
| FR-9 | Expose cross-module impact ("changing this also changes Leave") | §Notes "Leave ⇄ Attendance coupling", "Payroll authority coupling" |
| FR-10 | High-risk changes require explicit confirmation and a reason | the `⚠` on #65, #79, #95 |

---

## 3. Functional Scope

### 3.1 In scope

1. The **settings catalog** as a versioned code asset: all **114** registered entries (the #97–#114 gap having been closed in the registry on 2026-10-09, §2.5), expressed as data with a loader and a drift test.
2. **Aggregated read** of the four org singletons, RBAC- and entitlement-projected.
3. **Group-scoped partial write** and **group-scoped reset**, delegating to the owning service.
4. **Unified change history** over `payroll_audit_logs` + `document_audit_logs` + `settings_change_logs`.
5. The **surfaces index** (read-only pointers to per-record CRUD).
6. The **readiness readout**.
7. One new table, `settings_change_logs`, and the recorder the org module calls for #97/#98.
8. Fixing DEF-S7 (missing row lock) and DEF-S8 (missing route validator) in place, in the owning modules.
9. Registry document maintenance: DEF-S1, DEF-S2, DEF-S3 corrections.
10. Optional (Phase 5, gated on §19 Q-S5): a short-TTL read-through cache for the two hot singletons.

### 3.2 Out of scope — flag if requested later

1. **Relocating any setting value.** The five stores keep their columns.
2. **Proxying per-record CRUD.** The Settings module will never create a leave type, holiday or PT slab. It links to the endpoint that does.
3. **Retiring the existing module endpoints.** `/payroll/hr/settings`, `/payroll/hr/statutory/config`, `/documents/hr/settings`, `/organizations/profile` remain canonical write surfaces; the gateway is a second, consistent door onto the same services (§19 Q-S3).
4. **Retrofitting audit to per-record leave/attendance/organization writes** (DEF-S4/5/6) beyond providing the recorder they can call. That is 20+ write paths across three modules and needs its own plan.
5. **A generic key-value configuration store**, runtime-defined settings, or org-authored custom settings.
6. **Platform/ops configuration** (env vars, cron schedules, provider caps) — deploy-time concerns, deliberately not org-visible.
7. **Approval workflow on settings changes.** No registry entry asks for maker-checker *on a settings change*; #39/#40/#59/#60 configure maker-checker *for other objects*. Inventing it here is scope creep (§19 Q-S4).
8. **Scheduled / effective-dated settings changes.** No registry entry asks for a future-dated settings value. The effective dating that exists (`employee_leave_configs.effective_from/to`, `benefit_plans.effective_from/to`, `attendance_lock_periods`) is per-record and owned by its module.
9. **Secret management.** `attendance_devices.api_key_hash`, `PAYROLL_ENCRYPTION_KEY`, `RAZORPAY_*` and renderer credentials are never readable or writable through this module.

### 3.3 Surfaces this module changes

| Surface | Change |
|---|---|
| `src/modules/settings/**` | new (the directory exists and is empty today) |
| `src/app.js` | one line: `require('./modules/settings/settings.index')(app)` |
| `src/infrastructure/postgres-sql/models.index.js` | add `modules/settings/models` to `MODEL_ROOTS` |
| `src/modules/payroll/services/payroll_settings.service.js` | DEF-S7: `FOR UPDATE` read; export `MUTABLE_FIELDS` for the parity test |
| `src/modules/document/routes/document_hr.routes.js` | DEF-S8: add `validate()` middleware to `PUT /settings` |
| `src/modules/organization/services/organization.service.js` | one recorder call inside the existing profile-update transaction, for #97/#98 only |
| `src/modules/document/services/document_settings.service.js`, `src/modules/payroll/services/statutory_config.service.js` | export mutable-key lists for the parity test; no behaviour change |
| `public/md_settings/org_settings_registry.md` | DEF-S1/S2/S3 corrections + confirmed new entries |
| `public/md_updates/` | one dated change record per phase that touches a request/response shape |

---

## 4. Architecture & Module Boundaries

### 4.1 Shape

```text
                    ┌──────────────────────────────────────────┐
  HR / Manager  ──▶ │  Settings module  (src/modules/settings) │
                    │                                          │
                    │  routes ─ controller ─┬ read.service      │
                    │                       ├ write.service     │
                    │                       ├ history.service   │
                    │                       ├ surfaces.service  │
                    │                       └ readiness.service │
                    │                                          │
                    │  catalog/   (declarative code asset)     │
                    │  adapters/  (one per owning store)       │
                    │  models/    settings_change_logs         │
                    └───────────┬──────────────────────────────┘
                                │  delegates every write; never writes a value itself
        ┌───────────────────────┼───────────────────────┬─────────────────────┐
        ▼                       ▼                       ▼                     ▼
 payrollSettings         statutoryConfig          documentSettings      organization
 .service.update()       .updateConfig()          .update()             .updateProfile()
        │                       │                       │                     │
        ▼                       ▼                       ▼                     ▼
 payroll_settings        statutory_configs        document_settings     organization_profiles
 + payroll_audit_logs    + payroll_audit_logs     + document_audit_logs + settings_change_logs
```

### 4.2 Ownership table

| Concern | Owner | Rationale |
|---|---|---|
| Setting **value** storage | the domain module that already stores it | it is the only code that knows the invariants around it |
| Setting **validation** (range, enum, cross-field, dependency) | the domain module's validator + service | one enforcement boundary; a second validator would only create drift |
| Setting **enforcement** (what the value does) | the domain module | unchanged |
| Setting **audit** | the domain module (writes it, inside its own transaction) | audit must be atomic with the change, and only the owner holds the transaction |
| Setting **metadata** (type, default, range, scope, risk, dependencies, effect timing, docs) | **Settings module** | cross-module knowledge with no natural single owner; the registry document already centralises it |
| **Aggregated read, grouping, projection by role & entitlement** | **Settings module** | cross-module by nature |
| **Write dispatch, mass-assignment allowlist, concurrency token, high-risk confirmation** | **Settings module** | gateway-level pre-checks that then delegate |
| **Unified history read** | **Settings module** | union over tables owned by three modules |
| `settings_change_logs` **table** | **Settings module** | ledger of last resort for stores with no audit table |
| **Per-record CRUD** | the domain module | the Settings module links, never proxies |

### 4.3 D-S1 — The Settings module owns metadata, not values

The registry's 114 entries all have homes. Duplicating or migrating them would create two sources of truth for the same bytes and would strand every existing enforcement point (each reads the owning model directly). The Settings module therefore holds **no setting value** and has **no settings-value table**.

**Test that proves it — `T-S1`:** a static source scan asserts no file under `src/modules/settings/**` requires a model other than its own `SettingsChangeLog`, and no file calls `.update(` / `.create(` / `.destroy(` on a foreign model. Same technique as the PDF plan's template lint.

### 4.4 D-S2 — The catalog is a code asset, not a table

Setting *definitions* change only when code changes (a new column, a new range, a new enum value). A table would let definitions drift from the code that enforces them and need a migration per registry edit. A frozen module-scoped JS data asset:

* ships atomically with the code that enforces it,
* is diff-reviewable in the same PR as the column,
* costs zero queries to read,
* and can be **parity-tested** against the owner's Joi schema and mutable-field list (`T-S2`), which a table cannot be.

The catalog is split one file per module section plus `catalog/index.js`, which loads, freezes and asserts structural invariants **at module load** (unique keys, unique registry numbers, every group maps to exactly one store, every `depends_on`/`conflicts_with` resolves, every `precondition` has a registered probe). A malformed catalog fails the process at boot, not at request time.

### 4.5 D-S3 — Every write delegates; the gateway adds only pre-checks

The write path is exactly: resolve group → RBAC → entitlement → allowlist-intersect the payload → concurrency token → high-risk confirmation → **call the owner's existing update method** → return its result (including any impact readout the owner produces). The gateway never writes a column, never writes an audit row for a store that has one, never re-implements a guard.

This is what keeps `INSUFFICIENT_CHECKERS`, `SETTINGS_CONFLICT`, `SCAN_PROVIDER_NOT_CONFIGURED`, `INVALID_PAYOUT_COMPONENT`, `LETTER_REFERENCE_PATTERN_INVALID`, `assertAutoIssueTemplates`, `assertReminderSchedule` and `statutory_config.updateConfig`'s component-activation side effect behaving identically whichever door the caller used.

### 4.6 D-S4 — A group maps to exactly one store; there is no cross-store write

A single `PATCH /settings` spanning `payroll_settings` + `document_settings` would need either a transaction opened by the gateway and passed into both owners — inverting ownership and defeating each owner's own commit/rollback and post-commit behaviour — or a partial-success contract no caller handles correctly.

So: **writes are group-scoped, and every group belongs to exactly one store.** One request → one owner → one transaction → atomic or nothing. A UI page spanning groups issues one request per group and reports per-group results. This is the single most important simplification in the plan.

The one registry entry that spans stores, **#49 (Professional Tax)**, is modelled as one entry with keys in two groups (`statutory.pt` holds `pt_enabled`; `payroll.tax_admin` holds `pt_state_source`; slab rows are a surface). The catalog records the split so the UI can render them together while the writes stay separate.

### 4.7 D-S5 — Per-record settings are *surfaces*, not settings

34 entries are per-record. Their CRUD exists, is validated, and in several cases (weekly-off priority-tier union, holiday targeting, PT slab overlap/gap validation, the leave assignment ledger) carries logic far beyond a settings write. The Settings module exposes them as **descriptors** — group, registry numbers, scope, targeting shape, resolution rule, cross-module consumers, owning endpoint — and nothing more.

### 4.8 D-S6 — Rejected: a generic key-value store

A `settings(org_id, key, value JSONB)` table would lose: column-level `CHECK` constraints (cited as defence-in-depth on at least 12 entries), typed defaults, asserted-but-FK-less references (#55/#57 component ids), ENUM types, and the ability for an enforcement point to read a typed column. The registry's own authoring instruction — "cite the model column" — presumes dedicated columns. Rejected.

### 4.9 D-S7 — The settings-change ledger is the exception, narrowly scoped

`settings_change_logs` exists for **settings keys whose owning store has no audit table**. Today that is exactly #97/#98 on `organization_profiles`. The table is owned by the Settings module; the **write is performed by the owning service inside its own transaction** via a thin recorder the Settings module exports (`settingsAudit.record({...}, transaction)`), so:

* atomicity with the change is preserved,
* the owner stays the owner of its write,
* the gateway is not a required path (a direct `PUT /organizations/profile` is audited too),
* and the same recorder is later available to close DEF-S4/S5/S6 one write path at a time without a new table per module.

The asymmetry (four stores audit into their own tables, one into the settings ledger) is deliberate: duplicating existing audit rows into a second table would create two answers to "who changed this". The history reader unions instead.

**Alternative considered:** give the organization module its own `organization_audit_logs` matching the three existing shapes. More conventional, but to be coherent it would have to cover departments, locations, reporting mappings and invitations — a separate plan. See §19 Q-S2.

### 4.10 D-S8 — No event bus

Nothing in the registry requires asynchronous propagation of a settings change. Every consumer reads the value live at use time or from a frozen snapshot. The only cross-cutting side effect a change needs is **cache invalidation**, which is a synchronous post-commit `DEL` (§11), not an event. An event bus would add a failure mode (a missed event = permanently stale config) in exchange for nothing.

Two side effects already live inside the owners' transactions and stay there: `statutory_config.updateConfig` activating salary-component catalog rows for newly-enabled heads, and its read-only `affected_runs` impact list.

### 4.11 D-S9 — Settings access is never behind a *settings* feature flag

Gating an org out of its own configuration is a trap. But a **group** whose module the org is not entitled to (`payroll.access`, `documents.access`, `leave.access`, `attendance.access`) is projected as `entitled: false` and read-only in the catalog and aggregate read, and a write to it is refused by the owning module's own `requireFeature` gate with `403 FEATURE_NOT_AVAILABLE`. The Settings module adds **no new feature key and no new seeder**.

### 4.12 Directory layout

```text
src/modules/settings/
  settings.index.js                    # mounts routes at /api/v1/settings
  catalog/
    index.js                           # loader + structural invariants + freeze
    leave.catalog.js                   # #1–#12  (surfaces only)
    attendance.catalog.js              # #13–#29 (surfaces only) [+ #99–#103 if confirmed]
    organization.catalog.js            # #30–#34 (surfaces only)
    payroll.catalog.js                 # #35–#46, #49p, #50p, #51–#57, #87–#90
    statutory.catalog.js               # #47, #48, #49p, #50p
    document.catalog.js                # #58–#86, #91–#96
    billing.catalog.js                 # #97, #98
    groups.js                          # group → store, feature key, RBAC
    surfaces.js                        # per-record surface descriptors
    preconditions.js                   # precondition id → probe name
  adapters/
    index.js                           # store key → adapter
    payroll_settings.adapter.js
    statutory_config.adapter.js
    document_settings.adapter.js
    organization_billing.adapter.js
  services/
    settings_read.service.js
    settings_write.service.js
    settings_history.service.js
    settings_surfaces.service.js
    settings_readiness.service.js
    settings_audit.service.js          # the recorder (exported for owners to call)
    settings_cache.service.js          # Phase 5 only
  repositories/
    settings_change_log.repository.js
  models/
    settings_change_logs.model.js
  controllers/
    settings.controller.js
  validators/
    settings.validator.js              # envelope only: group key, confirm, reason, pagination
  routes/
    settings.routes.js
  utils/
    settings_projection.utils.js       # RBAC + entitlement + sensitivity projection
    settings_etag.utils.js
```

### 4.13 The adapter contract

Each adapter is a small declarative object, not a service:

```text
{
  store:            'payroll_settings',
  groups:           ['payroll.calendar', 'payroll.engine', ...],
  featureKey:       'payroll.access',
  read:             (orgId) => Promise<plainRow>,            // delegates to owner's getOrCreate
  update:           (orgId, patch, actor) => Promise<{ row, impact? }>,
  mutableKeys:      () => string[],                          // imported from the owner, for parity
  concurrencyField: 'updated_at',
  auditSource:      { table: 'payroll_audit_logs', entityType: 'payroll_settings' },
  redactKeys:       [...]                                    // never returned
}
```

The adapter is the **only** place in the Settings module that knows a store exists. Adding a fifth store is one adapter file plus catalog entries.

---

## 5. Configuration Ownership & Scope

### 5.1 Group map (writable, org-singleton)

Every group maps to exactly one store (D-S4). Group keys are stable API identifiers.

| Group key | Store | Registry entries | Write | Read |
|---|---|---|---|---|
| `payroll.calendar` | `payroll_settings` | #35, #36, #37 | `hr` | `hr` |
| `payroll.engine` | `payroll_settings` | #41, #42, #43, #44, #45 | `hr` | `hr` |
| `payroll.authority` | `payroll_settings` | #38, #39, #40 | `hr` | `hr`, `manager` |
| `payroll.loans` | `payroll_settings` | #46 | `hr` | `hr` |
| `payroll.tax_admin` | `payroll_settings` | #49 (`pt_state_source`), #50 (declaration window, proof deadline, `default_tax_regime`, `allow_employee_regime_switch`, `tds_monthly_rounding`) | `hr` | `hr` |
| `payroll.reimbursements` | `payroll_settings` | #51, #52 | `hr` | `hr` |
| `payroll.benefits` | `payroll_settings` | #53 | `hr` | `hr` |
| `payroll.payslips` | `payroll_settings` | #54, #88, #89, #90 | `hr` | `hr` |
| `payroll.exits` | `payroll_settings` | #55, #57 | `hr` | `hr` |
| `payroll.automation` | `payroll_settings` | #56 | `hr` | `hr` |
| `payroll.deprecated` | `payroll_settings` | #87 | — (read-only) | `hr` |
| `statutory.pf` | `statutory_configs` | #47 | `hr` | `hr` |
| `statutory.esi` | `statutory_configs` | #48 | `hr` | `hr` |
| `statutory.pt` | `statutory_configs` | #49 (`pt_enabled`) | `hr` | `hr` |
| `statutory.income_tax` | `statutory_configs` | #50 (`income_tax_enabled`, `tds_no_pan_rate`, `tds_no_pan_enforced`, `cess_rate`) | `hr` | `hr` |
| `documents.authority` | `document_settings` | #58, #59, #60, #93 | `hr` | `hr`, `manager` |
| `documents.storage` | `document_settings` | #61, #62, #63, #64 | `hr` | `hr` |
| `documents.retention` | `document_settings` | #65, #95 | `hr` | `hr` |
| `documents.lifecycle` | `document_settings` | #66, #67, #80, #81 | `hr` | `hr` |
| `documents.acknowledgement` | `document_settings` | #68, #69, #70 | `hr` | `hr` |
| `documents.notifications` | `document_settings` | #71, #72, #73, #74, #75, #76, #94 | `hr` | `hr` |
| `documents.requests` | `document_settings` | #77, #78 | `hr` | `hr` |
| `documents.publishing` | `document_settings` | #79 | `hr` | `hr` |
| `documents.letters` | `document_settings` | #82, #83, #84, #85, #86, #91, #92, #96 | `hr` | `hr`, `manager` |
| `documents.branding` | `document_letter_branding` | #104 | `hr` | `hr` |
| `billing.notifications` | `organization_profiles` | #97, #98 | `hr` | `hr` |

**26 writable groups, 5 stores, 1 read-only group.**

`documents.branding` (#104) is the group added by DEF-S12. It is deliberately a group of its own rather than part of `documents.letters`, because it maps to a different store and **a group maps to exactly one store** (D-S4) — the invariant that keeps one request to one transaction. Its 13 keys are the letterhead identity fields; its six asset columns are `sensitive` and not writable through the gateway.

`manager` read access is not whole-group: it is restricted at the **key** level to the keys that govern the manager's own behaviour (#38, #40, #58, #59, #93), mirroring the document module's existing `settingsReadAuth = [hr, manager]` precedent. Everything else in a manager-readable group is projected out.

`admin` / `super-admin` receive **no** access to any group — they are platform-plane roles with no tenant data reach. Asserted by `T-S9`.

### 5.2 Surface map (per-record, read-only pointers)

| Surface key | Registry | Owning endpoint base | Cross-module consumers |
|---|---|---|---|
| `leave.types` | #1, #2, #7, #9, #10, #12 | leave HR types | Payroll (`is_paid`) |
| `leave.policy_entitlements` | #3, #4, #5, #6, #8, #11 | leave HR policies | — |
| `leave.employee_overrides` | #5, #6, #8, #11 | leave HR employee-configs | — |
| `attendance.policies` | #13–#24 | `/api/v1/attendance/hr/policies` | Payroll (via aggregation) |
| `attendance.weekly_offs` | #25 | `/api/v1/attendance/hr/weekly-offs` | **Leave** (working-day math), Payroll (`standard_working_days`) |
| `attendance.comp_off_policies` | #26 | `/api/v1/attendance/hr/comp-off-policies` | Leave (CO wallet), Payroll (#57) |
| `attendance.shifts` | #27 | `/api/v1/attendance/hr/shifts` | — |
| `attendance.holidays` | #28 | `/api/v1/attendance/hr/holidays` | **Leave**, Payroll |
| `attendance.locks` | #29 | `/api/v1/attendance/hr/locks` | **Leave** (retrospective application), Payroll |
| `organization.locations` | #30, #31 | `/api/v1/organizations/locations` | **Attendance** (geofence, tz) |
| `organization.reporting` | #32 | organization employee reporting | **Leave** (approval chain), **Payroll**, **Document** (manager scope) |
| `organization.departments` | #33 | `/api/v1/organizations/departments` | Organization (invite auto-binding) |
| `organization.role_invitation_policies` | #34 | *(seeded; §19 Q-S7)* | Organization (invite) |
| `payroll.pt_slabs` | #49 (slab rows) | `/api/v1/payroll/hr/statutory/pt-slabs` | — |
| `attendance.default_policy` | #99 | `/api/v1/attendance/hr/policies` | Payroll (baseline for unassigned employees) |
| `attendance.calendar_exceptions` | #100 | `/api/v1/attendance/hr` calendar exceptions | **Leave** (day counting), **Payroll** (payable days) |
| `attendance.rotations` | #101 | `/api/v1/attendance/hr/rotations` | — |
| `attendance.shift_templates` | #114 | `/api/v1/attendance/hr/shifts` | — (referenced by #20, #101, #13/#14/#16) |
| `attendance.field_locations` | #102 | `/api/v1/attendance/hr/field-locations` | — |
| `attendance.devices` | #103 | `/api/v1/attendance/hr/devices` | — (**holds `api_key_hash`; never exposed**) |
| `documents.letter_type_configs` | #105 | `/api/v1/documents/hr/letter-templates/:code/config` | — (per-type layer under #84–#86) |
| `documents.type_rules` | #106 | `/api/v1/documents/hr/types` | — (overrides org-wide #58, #63, #65–#67, #71) |
| `payroll.components` | #107 | `/api/v1/payroll/hr/components` | **Document** (letter merge fields), referenced by #55/#57 |
| `payroll.reimbursement_categories` | #108 | `/api/v1/payroll/hr/reimbursements/categories` | — (chain frozen per #51) |
| `payroll.benefit_plans` | #109 | `/api/v1/payroll/hr/benefit-plans` | — |
| `payroll.bonus_rules` | #110 | `/api/v1/payroll/hr/bonus-rules` | — (own maker-checker lifecycle) |
| `payroll.tax_regimes` | #111 | `/api/v1/payroll/hr/tax/regimes` | — |
| `payroll.structure_templates` | #112 | `/api/v1/payroll/hr/structure-templates` | — |
| `leave.policy_templates` | #113 | `/api/v1/leaves/templates`, `/leaves/assignments` | **Payroll** (encashment basis) |

**34 → 49 surfaces.** The 15 added by #99–#114 are pointers, not proxies: the Settings module publishes the registry refs, the owning module and the canonical endpoint, and `T-S53` asserts each endpoint string matches a route the owning module actually registers. Three deserve a `warning` on their descriptor: **#100** because three modules change answer when it changes, **#103** because the row holds a credential hash, and **#107** because its rows are soft-deleted and referenced by frozen payroll history.

### 5.3 Precedence model (restated from the registry, not invented)

The catalog records, per key, which of these the key participates in. **The gateway never resolves precedence — it only publishes it.**

1. **Platform ceiling ∧ org value.** `min(org, platform)` for TTLs and sizes (#61 ≤ 900 s, #62 ≤ 3600 s, #63 ≤ 25 MB, #79 ≤ 20000). An org may only narrow.
2. **Org floor ∧/∨ per-record — the operator differs per entry, and this must not be unified:** #58 `type AND org`; #63 `min(type, org, platform)`; #65 `max(org, type)`; #67 `type OR org`; #66 `type AND org AND NOT statutory`; #71 and #95 per-type overrides org; #68 and #77 per-record value wins when non-null; #84 per-template `reference_pattern` wins.
3. **Policy template → per-employee override.** #5, #6, #8, #11 (`employee_leave_configs` beats `leave_policy_entitlements`).
4. **Targeted rules by `priority`.** #25, #26, #28 — highest matching priority wins; weekly-off is the **top-priority-tier union**, never `rules[0]`.
5. **Frozen snapshot beats live value.** #47–#50 and #53 (run `settings_snapshot` at CREATE), #51 (chain frozen at claim submission), #52 (window at approval), #55/#57 (amounts frozen at creation), #68 (`due_on` at publish/sync), #77 (`due_on` at creation), #85/#86 (letter flags at issue), #70 (provider at sign).
6. **Statutory wins over any org switch.** #65/#66 — `is_statutory` types are never purged or subject-deletable whatever the org says. #56 — `form16_part_a` attachments are never swept.

### 5.4 Application-order precedence to publish (FR-8)

The registry's §Notes fixes the leave-application check order; the catalog records it as `evaluation_order` so a UI can explain which rejection fires first:

`retired-type (#12) → half-day → demographic (#9, #10) → probation (#6) → notice cap (#11) → document (#2)`

---

## 6. Database Design

### 6.1 What is **not** created

No table for setting values. No `settings`, `org_settings`, `setting_definitions`, `setting_overrides` or `setting_versions` table. 114 entries, zero value-storage migrations.

### 6.2 `settings_change_logs` — the ledger of last resort (D-S9)

Append-only. **One row per changed key** (not per request), so history can be filtered by key without JSONB containment scans. The shape deliberately mirrors the three existing audit tables so the history reader can union them with a trivial projection.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `UUID` | no | PK, `UUIDV4` |
| `org_id` | `UUID` | no | FK → `organizations(id)` `ON DELETE CASCADE` |
| `store` | `VARCHAR(40)` | no | `'organization_profiles'` today; CHECK-constrained |
| `group_key` | `VARCHAR(60)` | no | e.g. `'billing.notifications'` |
| `setting_key` | `VARCHAR(80)` | no | the column name, e.g. `'billing_reminder_lead_days'` |
| `registry_ref` | `SMALLINT` | yes | registry entry number (97); nullable so an unregistered key can still be logged |
| `entity_id` | `UUID` | yes | the owning row's id (`organization_profiles.id`) |
| `old_value` | `JSONB` | yes | |
| `new_value` | `JSONB` | yes | |
| `actor_id` | `UUID` | yes | FK → `users(id)` `ON DELETE SET NULL`; null for a system/cron change |
| `actor_role` | `VARCHAR(20)` | yes | role key at the time of change (`'hr'`) |
| `reason` | `TEXT` | yes | required by the API for `risk='high'` keys (§9.5) |
| `source` | `VARCHAR(20)` | no | `'settings_api'` / `'module_api'` / `'system'` — which door the change came through |
| `ip_address` | `VARCHAR(64)` | yes | |
| `request_id` | `VARCHAR(100)` | yes | `x-request-id` correlation |
| `created_at` | `TIMESTAMPTZ` | no | `DEFAULT now()` |

No `updated_at`, no `deleted_at` — append-only by construction. The repository exposes only `create` and read methods (`T-S10`).

**Indexes**

| Index | Purpose |
|---|---|
| `(org_id, created_at DESC)` | the default history page |
| `(org_id, setting_key, created_at DESC)` | history of one setting |
| `(org_id, group_key, created_at DESC)` | history of one group |
| `(org_id, actor_id, created_at DESC)` | "what did this HR user change" |

**Constraints**

* `CHECK (store IN ('organization_profiles'))` — widened by a later migration when a second auditless store appears. Deliberately narrow so an accidental double-write from an already-audited store fails loudly rather than creating duplicate history.
* **Why `document_letter_branding` is *not* in this list.** It was the fifth store added by DEF-S12, but its `replace()` already audits to `document_audit_logs` under `entity_type='document_letter_branding'`. It therefore needs no ledger row, and the CHECK actively prevents one. The ledger's membership rule is **"stores with no audit table of their own"** — today that is exactly `organization_profiles`.
* `CHECK (source IN ('settings_api','module_api','system'))`

**Nullability note (EC-S12):** `old_value`/`new_value` are nullable *and* may legitimately contain `'null'::jsonb`. "The column was NULL before" and "we did not record a before value" must be distinguishable, so the recorder always writes an explicit `'null'::jsonb` when the prior value was SQL `NULL`, and leaves the column SQL-`NULL` only when the value is genuinely unknown. The reader surfaces both as JSON `null`; the distinction exists for forensic queries only.

**Retention:** none in this plan. Rows are small and are compliance evidence. Revisit only if volume demands (§19 Q-S8).

### 6.3 Changes to existing tables

**None required.** Two notes:

* **Concurrency token.** No singleton store has a `version` column; all four have `updated_at` (Sequelize `timestamps`). The plan uses `updated_at` as the ETag / `If-Match` token, checked under the owner's row lock (§12.2), rather than adding a `version` column to three tables for a token `updated_at` already provides. **Caveat (EC-S4):** two writes within the same clock tick would mint the same token — but the row lock serialises them, and the second write's token check runs *after* it holds the lock, so it sees the first write's committed `updated_at`. Postgres `TIMESTAMPTZ` has microsecond resolution, making a real collision implausible; the failure mode is a spurious `412`, never a lost update.
* **History index adequacy.** `payroll_audit_logs` has `(org_id, entity_type, entity_id)` and `document_audit_logs` has `(org_id, entity_type, entity_id, created_at)`. A settings history query pins `entity_type` to one value and `entity_id` to the single settings row, so both indexes are selective enough. **No new index on an existing table.**

### 6.4 Migration

`00073-create-settings-change-logs.js` — one `CREATE TABLE`, four indexes, two CHECKs, inside one transaction, with a `down()` that drops only this table (no destructive side effects, no data loss elsewhere).

> **Operator hand-back:** per the standing rule, this migration is **handed back unrun**. The plan is verified statically and by unit tests only; no `db:migrate` and no connectivity check is performed against the remote database. **Phase 3 is DB-gated** on the operator running it. Phases 1, 2, 4 and 5 require no migration and are not gated.

---

## 7. API Design

Base: `/api/v1/settings`, mounted by `settings.index.js` (one line in `app.js`).
Envelope matches the existing convention: `{ success, message, data }`.
`orgId` is derived from `req.user.orgId` **only** — never from body, query or params (`T-S8`).

### 7.1 Endpoint register

| # | Method | Path | Purpose | Auth | Phase |
|---|---|---|---|---|---|
| S-1 | GET | `/settings/catalog` | machine-readable catalog, projected by role + entitlement | `hr`, `manager` | 1 |
| S-2 | GET | `/settings/catalog/:settingKey` | one setting's full metadata | `hr`, `manager` | 1 |
| S-3 | GET | `/settings` | aggregated current values for every readable group | `hr`, `manager` | 1 |
| S-4 | GET | `/settings/groups/:groupKey` | one group's values + metadata + ETag | `hr`, `manager` | 1 |
| S-5 | PUT | `/settings/groups/:groupKey` | partial update of one group | `hr` | 2 |
| S-6 | POST | `/settings/groups/:groupKey/reset` | reset listed keys to catalog defaults | `hr` | 2 |
| S-7 | GET | `/settings/history` | unified change history, paginated | `hr` | 3 |
| S-8 | GET | `/settings/surfaces` | per-record configuration surface index | `hr`, `manager` | 4 |
| S-9 | GET | `/settings/readiness` | catalog-declared precondition checks | `hr` | 4 |

Nine endpoints. Route ordering: literal segments (`/catalog`, `/history`, `/surfaces`, `/readiness`, `/groups`) are registered **before** any parameterised route so no path is captured — the ordering discipline the document and payroll routers already apply.

### 7.2 S-1 `GET /settings/catalog`

**Purpose.** The contract a settings UI renders itself from (FR-2). Static per deploy → strongly cacheable.

**Query:** `?module=payroll|document|…` `&group=<groupKey>` `&include_hidden=false` (default `false`; `true` includes deprecated entries such as #87).

**Response `data`:**

```text
{
  catalog_version: "2026-10-08.1",          // bumped on every catalog edit; the ETag basis
  registry_entries: 98,
  modules: [
    {
      key: "payroll",
      label: "Payroll",
      entitled: true,                        // entitlement.service.hasFeature('payroll.access')
      groups: [
        {
          key: "payroll.authority",
          label: "Approval authority",
          store: "payroll_settings",
          writable: true,                    // false if role lacks write, or !entitled, or read-only group
          read_roles: ["hr", "manager"],
          write_roles: ["hr"],
          settings: [
            {
              key: "payroll_require_separate_checker",
              registry_ref: 39,
              label: "Require a separate checker",
              scope: "organization",
              data_type: "boolean",
              default: false,
              range: null,                   // { min, max } | { enum: [...] } | { max_entries, item: {...} }
              nullable: false,
              unit: null,
              sensitive: false,
              risk: "high",
              effect_timing: "next_record",   // §8.4
              requires_reason: true,
              preconditions: ["min_active_hr:2"],
              depends_on: [],
              conflicts_with: [],
              consumed_by: ["payroll"],
              deprecated: false,
              doc_ref: "org_settings_registry.md#39",
              enforcement_hint: "src/modules/payroll/services/employee_salary_structure.service.js",
              known_errors: ["INSUFFICIENT_CHECKERS", "SEPARATE_CHECKER_REQUIRED"],
              warnings: []                    // the registry's ⚠ texts, verbatim
            }
          ]
        }
      ]
    }
  ]
}
```

**Normative note on `range`:** catalog ranges are **descriptive**, mirroring the owning module's validator, which remains the enforcement boundary. `T-S2` asserts they agree, so a UI may trust them for client-side hinting; the server answer is authoritative.

**Caching:** `ETag: W/"<catalog_version>"`, `Cache-Control: private, max-age=300`, `304` on a matching `If-None-Match`.

**Errors:** `401`, `403 FORBIDDEN`.

### 7.3 S-2 `GET /settings/catalog/:settingKey`

Single-setting metadata — the same object as a `settings[]` element, plus `group_key` and `module_key`. `404 SETTING_NOT_FOUND` for an unknown key. Lets a UI deep-link a help popover without fetching the whole catalog.

### 7.4 S-3 `GET /settings`

**Purpose.** FR-1 — everything in one place.

**Query:** `?modules=payroll,document` (optional comma filter).

**Behaviour.** For each readable group, call the adapter's `read(orgId)`, which delegates to the owner's `getOrCreate` — so a first-ever read lazily provisions the row exactly as today. Then project: drop keys the caller's role may not read; **drop `sensitive` keys entirely** (never masked-and-returned — absent, so a client cannot distinguish "empty" from "hidden"); attach each group's ETag.

**Response `data`:**

```text
{
  catalog_version: "2026-10-08.1",
  groups: {
    "payroll.authority": {
      store: "payroll_settings",
      etag: "W/\"payroll_settings:1760000000000\"",
      writable: true,
      entitled: true,
      values: { manager_can_view_team_compensation: true, payroll_require_separate_checker: false,
                manager_direct_compensation_authority: false },
      non_default_keys: []                    // derived by valuesEqual(), NOT by !== (DEF-S11)
    },
    "documents.authority": { ... }
  },
  unavailable_groups: [                        // never a silent omission
    { key: "documents.letters", reason: "FEATURE_NOT_AVAILABLE" }
  ]
}
```

**Partial-failure contract (EC-S9).** If one adapter's read throws a dependency error, the endpoint returns `200` with that group in `unavailable_groups` with `reason: "READ_FAILED"` — **but only if at least one group succeeded**. If every group fails it returns `503 SETTINGS_READ_UNAVAILABLE`. A settings page that renders four of five sections, with the fifth explicitly named as failed, is strictly better than a blank 500. The failure is logged at `error` with the store key.

**Errors:** `401`, `403`, `503 SETTINGS_READ_UNAVAILABLE`.

### 7.5 S-4 `GET /settings/groups/:groupKey`

One group: the same per-group object as above, plus the group's `settings[]` metadata inline so a UI can fetch one page's worth in a single call. Returns the group `ETag` that S-5 requires.

**Errors:** `401`, `403 FORBIDDEN`, `403 FEATURE_NOT_AVAILABLE`, `404 SETTINGS_GROUP_NOT_FOUND`.

### 7.6 S-5 `PUT /settings/groups/:groupKey`

**Purpose.** FR-3. Partial update; absent keys are untouched.

**Headers:** `If-Match: <etag>` — **required** (§12.2). `x-request-id` is propagated into the audit row.

**Body:**

```text
{
  values: { "payroll_require_separate_checker": true },
  reason: "SOX control rollout Q4",      // required if any touched key has requires_reason
  confirm: true                          // required if any touched key has risk === 'high'
}
```

**Pipeline (order is normative):**

1. `authenticate` → `authorize(['hr'])` → `requireActiveOrg`.
2. Resolve `groupKey` in the catalog → `404 SETTINGS_GROUP_NOT_FOUND`. A read-only group → `405 SETTINGS_GROUP_READ_ONLY`.
3. Entitlement on the group's feature key → `403 FEATURE_NOT_AVAILABLE`.
4. **Allowlist intersect** `Object.keys(values)` with (this group's catalog keys) ∩ (adapter `mutableKeys()`). Any key outside → `422 SETTING_NOT_WRITABLE { keys: [...] }`. **Unknown keys are rejected, never silently stripped** — the payroll module already learned this the hard way: its own validator comment records a `200` that changed nothing because `stripUnknown` ate four keys. Empty intersection → `422 NO_WRITABLE_KEYS`.
5. A `sensitive` key present → `422 SETTING_NOT_WRITABLE` (a sensitive key is not writable here by construction).
6. `requires_reason` on any touched key and `reason` missing/blank → `422 SETTINGS_REASON_REQUIRED { keys: [...] }`.
7. `risk === 'high'` on any touched key and `confirm !== true` → `409 SETTINGS_CONFIRMATION_REQUIRED { keys: [...], warnings: [...] }`, where `warnings` are the catalog's `⚠` texts verbatim (#95's irreversible purge, #79's response-class change, #65's irreversible purge).
8. Delegate: `adapter.update(orgId, values, { actorId, ip, requestId, reason, ifMatch })`. The owner then acquires the row lock, re-checks the concurrency token **under the lock**, validates via its own Joi + service guards, writes, audits and commits.
9. Build the response from the owner's returned row plus any `impact` it supplies.

**Response `data`:**

```text
{
  group: "payroll.authority",
  etag: "W/\"payroll_settings:1760000123456\"",
  values: { ...the full group after the write... },
  changed: { payroll_require_separate_checker: { from: false, to: true } },  // only real changes
  unchanged_keys: [],                                                        // submitted but identical
  impact: {                                                                  // only when the owner reports one
    affected_runs: [ { id, period, status } ],                               // statutory groups (D-26 precedent)
    notes: ["Existing in-flight payroll runs keep their frozen snapshot."]
  }
}
```

**Error register** (codes raised by the owner are surfaced unchanged):

| Status | Code | Source |
|---|---|---|
| 400 | validation error | owner's Joi |
| 400 | `SETTINGS_IF_MATCH_REQUIRED` | gateway |
| 401 | — | auth |
| 403 | `FORBIDDEN` | role |
| 403 | `FEATURE_NOT_AVAILABLE` | entitlement |
| 404 | `SETTINGS_GROUP_NOT_FOUND` | gateway |
| 405 | `SETTINGS_GROUP_READ_ONLY` | gateway |
| 409 | `SETTINGS_CONFIRMATION_REQUIRED` | gateway |
| 409 | `INSUFFICIENT_CHECKERS` | payroll / document owner (#39, #60) |
| 409 | `SETTINGS_CONFLICT` | document owner (#59 + #60) |
| 409 | `SCAN_PROVIDER_NOT_CONFIGURED` | document owner (#64) |
| 412 | `SETTINGS_PRECONDITION_FAILED` | concurrency token |
| 422 | `SETTING_NOT_WRITABLE` / `NO_WRITABLE_KEYS` / `SETTINGS_REASON_REQUIRED` | gateway |
| 422 | `SETTING_OUT_OF_RANGE` | document owner (`assertCap`, `assertReminderSchedule`, `assertAutoIssueTemplates`) |
| 422 | `LETTER_REFERENCE_PATTERN_INVALID` | document owner (#84) |
| 422 | `INVALID_PAYOUT_COMPONENT` | payroll owner (#55, #57) |
| 503 | `ENTITLEMENT_DEPENDENCY_FAILURE` | entitlement service, unchanged |

`428 Precondition Required` is deliberately **not** used; a missing `If-Match` is a `400` with `SETTINGS_IF_MATCH_REQUIRED`, keeping the vocabulary inside the status codes this codebase already uses.

### 7.7 S-6 `POST /settings/groups/:groupKey/reset`

**Purpose.** FR-4 — "put these back to the documented default".

**Body:** `{ keys: ["document_expiry_reminder_days", "document_notify_expiry"], reason, confirm }`.

`keys` is **required and non-empty**. There is no "reset the whole group" and certainly no "reset everything": a blanket reset of `documents.retention` or `payroll.exits` is a destructive action nobody intends to take in one click.

**Behaviour.** Resolve each key's catalog `default`, then run the **identical S-5 pipeline** with `values = { key: default }`. Reset is not a privileged bypass — every guard (checker pool, conflict, component reference, confirmation, concurrency) applies. A key whose registry default is *"required — no default"* (#3, #8) is not resettable → `422 SETTING_NOT_RESETTABLE`. A key whose default is `null`-means-inherit (#86, #95) resets to `null`.

Same response shape as S-5, with `reset: true`.

### 7.8 S-7 `GET /settings/history`

**Purpose.** FR-5.

**Query:** `group`, `setting_key`, `actor_id`, `from`, `to` (ISO dates), `source`, `limit` (default 50, max 100), `cursor` (opaque keyset on `created_at` + `id` — **not** offset, because audit tables grow).

**Behaviour.** For each source whose scope intersects the filter: `payroll_audit_logs` where `entity_type IN ('payroll_settings','statutory_config')`; `document_audit_logs` where `entity_type = 'document_settings'`; `settings_change_logs`. The two audit tables store **one row per request with `old_values`/`new_values` JSONB maps**; the reader **fans them out to one item per changed key** so the response shape is uniform regardless of source. Merge-sort by `created_at DESC, id DESC`, apply the keyset cursor, trim to `limit`.

**Response `data`:**

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
      actor: { id, name, role: "hr" },
      reason: "Internal policy LP-14",
      source: null,                 // see the source caveat below — NOT always known
      request_id: "…",
      audit_source: "document_audit_logs"
    }
  ],
  next_cursor: "…" | null
}
```

**`source` caveat — it is only known for one of the three sources (DEF-S4 family).** Neither
`payroll_audit_logs` nor `document_audit_logs` has a `source` column; their columns are
`id org_id actor_id target_user_id entity_type entity_id action old_values new_values reason ip_address request_id
proposed_by approved_by` and nothing more. So for rows read from those two tables the reader **cannot** tell whether the
change arrived through the Settings gateway or the module's own endpoint, and it reports `source: null` rather than
guessing `'module_api'`.

`source` is populated **only** for `settings_change_logs` rows, where the recorder sets it. The three options for doing
better were all rejected:

| Option | Rejected because |
|---|---|
| Add a nullable `source` column to both audit tables | they are general-purpose audit tables serving dozens of entity types, not settings tables; this plan changes **no existing table** (§6.3), and the column would be `NULL` for all history before the change anyway |
| Have the gateway pass a distinct `action` string | it would fork the audit vocabulary that existing queries and the §10.1 contract depend on, to answer a question nobody operationally needs |
| Write a `settings_change_logs` row for every gateway write as well | straight duplication — two answers to "who changed this", which §10.1 exists to prevent, and the CHECK constraint deliberately forbids it |

`source` was only ever operational curiosity ("did this org adopt the new UI"). It is **not** worth a schema change to
three tables, so it is demoted to best-effort and documented as such. `T-S48` asserts exactly this: `'settings_api'` for
a gateway write to `organization_profiles`, and `null` for rows sourced from the two JSONB audit tables.

**Key-filter caveat, documented not hidden:** filtering by `setting_key` against the JSONB audit tables uses key-existence (`new_values ? :key`). `payroll_audit_logs` has no GIN index on `new_values`, so the filter degrades to a scan **within** the rows already narrowed by `(org_id, entity_type, entity_id)` — for a settings row, that is at most the org's settings-change count. Acceptable. If an org ever exceeds ~50k settings changes, add a GIN index then, not now.

**Errors:** `401`, `403`, `400` on a malformed cursor or date.

### 7.9 S-8 `GET /settings/surfaces`

**Purpose.** FR-6 — tell the UI where per-record configuration lives, without proxying it.

**Response `data`:** an array of surface descriptors:

```text
{
  key: "attendance.weekly_offs",
  module: "attendance",
  label: "Weekly-off rules",
  registry_refs: [25],
  scope: "per_record",
  targeting: ["department", "location", "employment_type", "job_status", "shift", "user"],
  resolution: "highest-priority-tier union",
  endpoint: "/api/v1/attendance/hr/weekly-offs",
  methods: ["GET", "POST", "PUT", "DELETE"],
  entitled: true,
  consumed_by: ["attendance", "leave"],
  notes: "Leave reuses this engine; changing weekends changes leave-day math.",
  doc_ref: "org_settings_registry.md#25"
}
```

No counts, no record data, no writes. Purely `catalog/surfaces.js` projected by entitlement.

### 7.10 S-9 `GET /settings/readiness`

**Purpose.** FR-7. Every check is **declared in the catalog** as a `precondition` and implemented by a small, named, **read-only** probe. No probe may mutate anything (`T-S11`).

| Precondition id | Check | Gates |
|---|---|---|
| `min_active_hr:2` | count of active `hr` users ≥ 2 | #39, #60 |
| `pt_slabs_loaded` | ≥ 1 active PT slab row for each operating state | #49 |
| `payout_component:fnf_encashment_component_id` | references an active earning component | #55 |
| `payout_component:fnf_notice_recovery_component_id` | same | #55 |
| `payout_component:compoff_encashment_component_id` | same | #57 |
| `scan_provider_configured` | always false today | #64 |
| `signature_provider_available` | #70's provider is in the available set | #70 |
| `letter_auto_issue_templates_known` | every code in #92 is a known, non-compensation-bearing template | #92 |
| `encashable_leave_codes_exist` | every code in #55's `fnf_encashment_leave_type_codes` resolves to a live leave type | #55 |

**Response `data`:** `{ ready: false, checks: [ { id, status: 'ok' | 'blocked' | 'not_applicable', gates: ['payroll.exits#55'], detail, remediation_endpoint } ] }`.

A check is `not_applicable` when the setting it gates is OFF — an org with `pf_enabled=false` is not "unready", and reporting it as blocked would train users to ignore the readout.

### 7.10a The value comparator — `settings_value.utils.valuesEqual()` (DEF-S11)

Three places in this plan ask "is this value the same as that one?": `non_default_keys` (S-3/S-4), `changed` vs
`unchanged_keys` (S-5), and `T-S2`'s default-parity assertion. **All three must use one comparator, and it must not be
`!==`.**

The reason is `pg`: a PostgreSQL `NUMERIC`/`DECIMAL` column is returned as a **JavaScript string** to preserve exact
precision, while the catalog default and the inbound Joi payload are **numbers**. There are **19 such columns** — 5 on
`payroll_settings` (`overtime_rate_multiplier`, `standard_working_hours_per_day`, `loan_max_amount`,
`loan_max_interest_rate`, `loan_default_interest_rate`) and 14 on `statutory_configs`. A naive `value !== default`
therefore evaluates `'2.00' !== 2.00` → `true` and reports **every untouched organization** as having non-default
decimals, which would make `non_default_keys` worse than useless: it would be confidently wrong on the field a UI uses to
draw "modified" badges.

```text
valuesEqual(a, b, dataType):
  decimal  -> both null? equal. either null? not equal. else Number(a) === Number(b)
              (exact: both sides originate from NUMERIC(p,s), so no float-width concern at these scales)
  integer  -> Number(a) === Number(b)
  boolean  -> a === b                      (never string-typed by pg)
  enum/str -> a === b                      (no case folding; enums are case-significant)
  array    -> same length AND element-wise equal, ORDER-SENSITIVE
              (order is meaningful: #98 lead days and #104 address lines both render in order)
  date     -> compare as ISO date strings, not Date identity
  jsonb    -> stable-key-sorted JSON compare
```

Two deliberate choices worth stating, because both are places a reasonable engineer would do the opposite:

* **Arrays compare order-sensitively.** `[7,1]` and `[1,7]` are *not* equal. #98's reminder lead days and #104's
  `registered_address_lines` both have meaningful order, and treating a reorder as "unchanged" would silently discard a
  real edit. (The owner still de-duplicates and sorts where its own contract says so — the comparator does not
  normalise on the owner's behalf.)
* **`null` and `0` / `''` are never equal.** For #95 (`letter_retention_days`) and #86, `null` means *inherit* and is a
  distinct, meaningful state from any value (§8.5).

**`T-S59`** pins the comparator directly with the DECIMAL case as its first assertion: `valuesEqual('2.00', 2.00,
'decimal') === true` and `valuesEqual('2.00', 2.50, 'decimal') === false`.

**This also exposes a pre-existing defect in an owner.** `payroll_settings.service.js:99` computes its audit diff with
`if (before[key] !== updated[key])`, so a DECIMAL key can already be written into `old_values`/`new_values` as changed
when it did not change. Phase 2 fixes it by having that comparison call the shared comparator (`T-S60`). The fix is
confined to the diff; it does not alter what is written to the row.

### 7.11 Frontend change records

Per the standing project instruction, **every phase that adds or changes a request/response shape writes a dated change record** into `public/md_updates/`:

* Phase 1 → `settings_module_read_apis_<date>.md`
* Phase 2 → `settings_module_write_apis_<date>.md` — **must** call out the new mandatory `If-Match` header on S-5/S-6, the only hard client obligation this module introduces
* Phase 3 → `settings_module_history_api_<date>.md`
* Phase 4 → `settings_module_surfaces_readiness_<date>.md`

### 7.12 Repository documentation obligations

Change records in `public/md_updates/` are not the only documentation this module owes. Two repo-wide conventions apply,
both verified against the repository rather than assumed:

**1. `public/md_system/api_registry.md` — every endpoint is catalogued there.** The registry is a 13-column table
(`# | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service |
Employee UI | HR UI | Manager UI`) grouped under `## <Module> — <Area> (Phase N)` headings. The Settings endpoints are
added as a new section:

| Registry # | Endpoint | Phase |
|---|---|---|
| #242 | `GET /api/v1/settings/catalog` | 1 |
| #243 | `GET /api/v1/settings/catalog/:settingKey` | 1 |
| #244 | `GET /api/v1/settings` | 1 |
| #245 | `GET /api/v1/settings/groups/:groupKey` | 1 |
| #246 | `PUT /api/v1/settings/groups/:groupKey` | 2 |
| #247 | `POST /api/v1/settings/groups/:groupKey/reset` | 2 |
| #248 | `GET /api/v1/settings/history` | 3 |
| #249 | `GET /api/v1/settings/surfaces` | 4 |
| #250 | `GET /api/v1/settings/readiness` | 4 |

**The numbering starts at #242, not #240.** The highest number currently in the registry is **#241** — #240/#241 were
taken by the document bulk-request endpoints. Whoever implements Phase 1 must re-check the maximum at that moment and
shift the block if other work has landed in between; these numbers are correct as of 2026-10-09 and are not reserved.

**2. `public/md_settings/combined_api_analysis.md` — the per-module API document.** The convention across
`md_payrolls/`, `md_documents/`, `md_leave/` and `md_pdf-generation/` is `combined_api_analysis.md` alongside
`implementation_plan.md` (**not** `api_documentation.md`, which exists nowhere in this repository). It is written
incrementally — the sections for S-1…S-4 in Phase 1, S-5/S-6 in Phase 2, and so on — so it never describes an endpoint
that does not yet exist.

Each phase's completion criteria therefore include **three** documentation artefacts, not one: the dated change record,
the `api_registry.md` rows, and the `combined_api_analysis.md` sections.

---

## 8. Business Logic & Validation

### 8.1 Where validation lives

| Layer | Responsibility | Owner |
|---|---|---|
| Route | HTTP envelope: group key format, `confirm`/`reason` types, pagination bounds | Settings validator |
| Gateway | group exists, group writable, role may write, org entitled, key is in the group's catalog **and** the adapter's `mutableKeys()`, key is not `sensitive`, reason/confirm policy, concurrency token present | Settings write service |
| **Owner validator** | per-key type, range, enum, length, array shape — **the enforcement boundary** | the domain module's Joi schema |
| **Owner service** | cross-field guards, dependency assertions, pool checks, pattern tokens, reference checks, normalisation | the domain module's service |
| Database | `CHECK` constraints, ENUM types, `NOT NULL`, `UNIQUE (org_id)` | migrations already shipped |

**Rule:** the Settings module never re-implements layers 3–5. It is physically unable to bypass them because it has no write path of its own (D-S1, `T-S1`).

### 8.2 Catalog invariants asserted at load (fail the boot, not the request)

1. Every `key` is globally unique across the catalog.
2. Every `registry_ref` 1–114 appears at least once; no `registry_ref` appears in two modules (catches DEF-S2-style misfiling).
3. Every `group` maps to exactly one `store` (D-S4).
4. Every `depends_on` / `conflicts_with` names a key that exists.
5. Every `precondition` id has a registered probe in `catalog/preconditions.js`.
6. Every `default` type-matches its `data_type`.
7. Every `risk: 'high'` key has at least one `warnings[]` entry (no silent high-risk key).
8. `read_roles` never contains `admin` or `super-admin`.

### 8.3 `T-S2` — the drift test (the single most valuable test in the plan)

For each adapter:

* **key set:** catalog keys for the adapter's groups ≡ the owner's mutable-field list. A column added to `document_settings.MUTABLE_FIELDS` without a catalog entry fails the build; a catalog entry for a non-mutable column fails too.
* **range:** where the owner's Joi schema declares `min`/`max`/`valid(...)`, the catalog's `range` must equal it.
* **default:** the catalog default must equal the model's `defaultValue` (or the owner's defaults object, e.g. `DOCUMENT_SETTINGS_DEFAULTS`) where one exists.
* **nullability:** `nullable` must match the Joi `.allow(null)` / model `allowNull`.

This is what makes the catalog trustworthy enough for a frontend to render from, and it is why the catalog is a code asset rather than a table (D-S2).

### 8.4 `effect_timing` — when a change bites (FR-8)

A first-class catalog attribute, one of five values. It is the registry's "frozen" semantics (§2.3) made machine-readable, and it is the attribute the UI must surface most prominently.

| Value | Meaning | Registry examples |
|---|---|---|
| `immediate` | the next read of the setting uses the new value | #38, #58, #61, #62, #83, #96 |
| `next_record` | applies to records created after the change; existing records keep the old value | #39, #40, #51 (chain frozen at submission), #59, #60, #85, #86, #68/#77 (`due_on` never rewritten), #55/#57 (amounts frozen) |
| `next_run` | applies to payroll runs created after the change; in-flight runs keep `settings_snapshot` | #47, #48, #49, #50, #53 |
| `next_cron_pass` | applies on the next scheduled pass | #56, #65, #71, #73, #74, #76, #90, #92, #95 |
| `inert` | accepted and stored but read by nothing | #87 |

**Implementation note:** `effect_timing` is **not** derived at runtime. It is authored per key from the registry's Deep Explanation and asserted non-null by invariant 7's sibling check. Deriving it would be guessing.

### 8.5 Default values

Every catalog default is transcribed from the registry's `Default Value` field and cross-checked against the model column default by `T-S2`. Three special forms:

* **`"required — no default"`** (#3 `accrual_type`, #8 `annual_quota`) — both are per-record, so they never appear in a writable group; they are surface metadata only. `resettable: false`.
* **`null` means inherit** (#86 → document type's default, #95 → `document_retention_days`) — `nullable: true`, `inherits_from` names the fallback key, and reset writes `null`.
* **Lazily created rows.** All three singletons are created on first access by `getOrCreate`, so "the default" is the column default, not a seeded row. The Settings module **must not** seed settings rows (it would defeat the lazy-provisioning design and create rows for orgs that never use the module).

### 8.6 Cross-field and cross-setting dependencies (all owner-enforced; catalog publishes them)

| Relationship | Keys | Enforced by | Catalog field |
|---|---|---|---|
| Mutually exclusive | #59 `manager_direct_document_authority` ⊕ #60 `document_require_separate_checker` | `document_settings.service.update` → `409 SETTINGS_CONFLICT` | `conflicts_with` |
| Requires a pool | #39, #60 need ≥ 2 active HR | owner → `409 INSUFFICIENT_CHECKERS` | `preconditions` |
| Requires a referenced record | #55, #57 component ids → active earning component | `payroll_settings.service._assertPayoutComponents` → `422 INVALID_PAYOUT_COMPONENT` | `preconditions` |
| Requires reference data | #49 `pt_enabled` needs state slabs | engine emits `PT_STATE_UNRESOLVED`/`PT_SLAB_UNRESOLVED` at run time | `preconditions` (soft) |
| Gated by another flag | #71 schedule only fires when #73 is ON; #88 only acts when `PDF_BULK_GENERATION_ENABLED` | owner / ops flag | `depends_on`, `depends_on_ops` |
| Narrowed by a platform cap | #61, #62, #63, #79 | provider `clampTtl` / code ceiling | `platform_cap` |
| Not configurable yet | #64 `document_scan_required` | owner → `409 SCAN_PROVIDER_NOT_CONFIGURED` | `preconditions`, plus `writable_hint` |
| Accepted but unavailable | #70 non-`internal_typed` providers | accepted at write; `503 SIGNATURE_PROVIDER_UNAVAILABLE` at sign | `warnings` |
| **Never clearable** | #104 `accent_color_hex` (`CHAR(7) NOT NULL`) | `_mapReplaceFields` deletes the key when it resolves to `null`, so a clear is a **silent no-op** in the owner | `nullable: false`, `clearable: false` |
| **Silently truncated** | #104 `registered_address_lines` | owner trims, drops empties and `.slice(0, 5)` | `max_items: 5`, `normalised: true` |
| **Empty string clears to NULL** | #104 text fields | owner maps `''` → `null` | `empty_clears: true` |
| **Inherits when NULL** | #104 text fields → `organization_profiles` | `inheritedFromProfile()` supplies name/website/address/GST/PAN at render | `inherits_from` |

**The gateway does not evaluate any of these.** It publishes them in the catalog so a UI can disable a toggle and explain why, and it lets the owner's `409`/`422` be the answer.

**One consequence of #104 deserves its own note, because it is a correctness trap rather than a documentation nicety.**
Three of the branding rules are *silent normalisations in the owner*: clearing `accent_color_hex` is dropped, and
`registered_address_lines` is trimmed and truncated to 5. A gateway that echoed the request payload back as `changed`
would therefore **report a change the database did not make**. The branding adapter must build its `changed` map from
**the post-write row it re-reads**, not from the submitted patch — and `T-S61` pins exactly that: submit a 7-element
address array and a `null` accent colour, and assert the response reports the stored 5 elements and the *unchanged*
colour, with the accent key in `unchanged_keys`. The same discipline is why §7.6's `changed` is specified as a diff of
stored values rather than an echo.

### 8.7 `risk` classification and the confirmation gate (FR-10)

Three classes. `high` requires `confirm: true` **and** `reason`.

| Risk | Criterion | Keys |
|---|---|---|
| `high` | irreversible consequence, changes a client-visible response class, or alters who may approve money/documents | #29 (lock periods — surface), #39, #40, #59, #60, #65, #79, #92, #95 |
| `medium` | changes money, statutory withholding or outbound email volume | #35, #36, #37, #41–#50, #53, #54, #55, #56, #57, #72–#76, #94, #97, #98 |
| `low` | everything else | the remainder |

The classification is **authored**, grounded in the registry's own `⚠` markers and in what the Deep Explanation says the change does. It is not derived, and `T-S12` pins it so a reclassification is a deliberate, reviewed diff.

### 8.8 Transactional requirements

| Operation | Transaction |
|---|---|
| S-1/S-2 catalog read | none (in-memory) |
| S-3/S-4 value read | the owner's `getOrCreate` opens its own short transaction when none is passed — unchanged behaviour |
| S-5/S-6 write | **exactly one**, opened and committed by the owning service; the gateway never opens a transaction |
| S-7 history read | none (read-only, possibly three queries; no cross-table consistency requirement — audit rows are immutable) |
| S-9 readiness | none; each probe is an independent read. A readiness readout is a snapshot of independent facts, not a consistent view, and is documented as such |
| `settingsAudit.record` | **always inside the caller's transaction**; the recorder never opens one (`T-S13`) |

### 8.9 How dependent modules consume configuration (unchanged)

No consumer changes. Specifically preserved:

* **Reads inside the writer's own transaction.** The document module deliberately calls `settingsService.getOrCreate(orgId, t)` inside publish/sync transactions (C-30) so a concurrent settings change cannot interleave. Any cache added in Phase 5 **must bypass the cache when a transaction is passed** (§11.4) — this is the single most dangerous thing in the whole plan to get wrong.
* **Frozen snapshots.** `payroll_runs.settings_snapshot` is written at run CREATE and read by `calculate()`. The gateway never touches a snapshot, and S-5's `impact.affected_runs` only *reports* which live runs predate an edit.
* **Enforcement points.** All 96 remain exactly where the registry cites them.

---

## 9. Security & Authorization

### 9.1 Role planes

| Role | Catalog | Values read | Write | History | Readiness |
|---|---|---|---|---|---|
| `hr` | all groups | all readable keys | all writable groups | yes | yes |
| `manager` | groups with `manager` in `read_roles` | only the manager-behaviour keys (#38, #40, #58, #59, #93) | **no** | no | no |
| `employee` | no | no | no | no | no |
| `admin`, `super-admin` | **no** | **no** | **no** | **no** | **no** |

`admin`/`super-admin` exclusion is a hard invariant (`T-S9`): they are platform-plane roles with no tenant data reach. A catalog entry listing them in `read_roles` fails the load-time invariant (§8.2 item 8).

### 9.2 Tenant isolation

`orgId` comes from `req.user.orgId` and nowhere else — not body, not query, not params (`T-S8`, a static scan plus a request test). Every adapter read/update takes `orgId` as its first argument and every store has `org_id` on the row with `UNIQUE (org_id)` on the singletons. There is no cross-org read path, no "orgId override for support", and no admin bypass.

`requireActiveOrg` runs on every settings route, so a suspended org cannot change its configuration.

### 9.3 Mass-assignment protection

Closed **by construction**, not by a denylist: the write service builds its patch by **intersecting** the request keys with (catalog keys of the group) ∩ (adapter `mutableKeys()`). A key absent from the catalog cannot be written even if the owner's Joi would accept it, and a key the owner does not list as mutable cannot be written even if the catalog has it. Unknown keys are **rejected with `422`, not stripped** — a silent strip produces a `200` that changed nothing, which the payroll module has already shipped once and had to fix.

Engine-owned columns are protected by the same mechanism: the four `last_*_reminder_on` cron watermarks on `payroll_settings` are absent from the catalog and from the owner's `updateSettingsSchema`, so no door can set them.

### 9.4 Sensitive configuration

| Category | Examples | Treatment |
|---|---|---|
| Secrets | `attendance_devices.api_key_hash`, `PAYROLL_ENCRYPTION_KEY`, `RAZORPAY_*`, `PDF_RENDERER_API_KEY` | **never** in the catalog, never read, never written. Out of scope (§3.2.9). |
| Storage keys | `document_letter_branding.logo_storage_key`, `signature_storage_key`, `organization_profiles.logo_storage_key` | marked `sensitive: true`; **omitted from responses entirely** (not masked). Their upload/replace handshake stays in the owning module. |
| Business-sensitive | #38 `manager_can_view_team_compensation` | readable by `manager` (it governs their own behaviour), never writable by them |
| Platform caps | `VIEW_TTL_CAP_SECONDS`, `ORG_PUBLISH_SYNC_LIMIT`, `ORG_CEILING_BYTES` | published read-only as `platform_cap` so a UI can explain why the org value cannot be raised; never writable |

**Why omit rather than mask:** a masked value (`"****"`) tells an attacker the key exists and has a value. Omission makes the key indistinguishable from a key the caller simply cannot see — which is also what it is.

### 9.5 Unauthorized-modification prevention — the five gates

1. **Role gate** — `authorize(['hr'])` on every write route.
2. **Entitlement gate** — the group's feature key, and again inside the owner's own `requireFeature`.
3. **Allowlist gate** — §9.3.
4. **Concurrency gate** — `If-Match` required; checked under the owner's row lock (§12.2). Prevents a stale UI from silently reverting a colleague's change.
5. **Confirmation gate** — `risk: 'high'` needs `confirm: true` + `reason`; the reason is persisted in the audit row.

### 9.6 Input validation

The envelope validator (Joi) bounds only what the gateway itself interprets: `groupKey` (`^[a-z_]+\.[a-z_]+$`, max 60), `setting_key`/`keys[]` (`^[a-z0-9_]+$`, max 80, array max 50), `reason` (trimmed, 1–500 chars), `confirm` (boolean), pagination (`limit` 1–100, `cursor` opaque base64url ≤ 200 chars), date filters (ISO). Per-key value validation is the owner's.

`values` is **not** schema-validated key-by-key at the gateway — doing so would duplicate 98 keys' worth of Joi and guarantee drift. It is depth- and size-bounded instead (object only, ≤ 60 keys, no nested object deeper than 2, total body ≤ 64 KB) so a pathological payload is rejected before it reaches the owner.

### 9.7 Security tests

| ID | Test |
|---|---|
| `T-S8` | `orgId` never sourced from body/query/params — static scan + request test with a forged `org_id` in the body |
| `T-S9` | `admin` and `super-admin` get `403` on all nine endpoints |
| `T-S14` | a `manager` reading a manager-readable group receives **only** the manager-behaviour keys |
| `T-S15` | a `manager` write to any group → `403` |
| `T-S16` | an unknown key in `values` → `422 SETTING_NOT_WRITABLE`, and **no** write occurs (the owner's update is not called) |
| `T-S17` | a cron watermark key (`last_cutoff_reminder_on`) in `values` → `422` |
| `T-S18` | a `sensitive` key never appears in any S-3/S-4 response, for any role |
| `T-S19` | `risk: 'high'` without `confirm` → `409`, and no write occurs |
| `T-S20` | `risk: 'high'` without `reason` → `422`, and no write occurs |
| `T-S21` | a write to an unentitled group → `403 FEATURE_NOT_AVAILABLE` |
| `T-S22` | an `employee` token → `403` on all nine endpoints |

---

## 10. Audit & Versioning

### 10.1 What is audited, where

| Store | Audit target | Written by | Shape |
|---|---|---|---|
| `payroll_settings` | `payroll_audit_logs`, `entity_type='payroll_settings'`, `action='settings.updated'` | `payroll_settings.service.update`, in-transaction | one row per request, `old_values`/`new_values` JSONB maps of changed keys only |
| `statutory_configs` | `payroll_audit_logs`, `entity_type='statutory_config'`, `action='statutory_config.updated'` | `statutory_config.service.updateConfig`, in-transaction | same |
| `document_settings` | `document_audit_logs`, `entity_type='document_settings'`, `action='document_settings.updated'` | `document_settings.service.update`, in-transaction | same |
| `document_letter_branding` (#104) | `document_audit_logs`, `entity_type='document_letter_branding'`, `action='letter_branding.updated'` | `document_letter_branding.service.replace`, in-transaction | one row per request, full before-DTO → merged-after-DTO (not a changed-keys-only diff) |
| `organization_profiles` (#97/#98) | **`settings_change_logs`** (new) | `organization.service.updateProfile`, in its existing transaction, via `settingsAudit.record` | **one row per changed key** — requires the DEF-S10 locked pre-read to exist at all |

The Settings gateway writes **no** audit row for the first **four** stores. Duplicating would create two answers to "who changed this".

**Note the asymmetry in the branding row, which is pre-existing and left alone:** `replace()` audits `oldValues: before` and `newValues: { ...before, ...changes }`, i.e. two full DTOs rather than only the changed keys. That is a different shape from the other three owners, so the history reader must diff the two JSONB objects key-by-key for this entity type instead of treating `new_values` as a changed-keys map (`T-S62`). Normalising the owner to a changed-keys diff would be a gratuitous change to shipped audit behaviour, so the reader absorbs the difference instead.

### 10.2 The recorder contract

```text
settingsAudit.record({
  orgId, store, groupKey, settingKey, registryRef, entityId,
  oldValue, newValue, actorId, actorRole, reason, source, ipAddress, requestId
}, transaction)            // transaction is REQUIRED
```

* The recorder **never opens a transaction** (`T-S13`). Audit must be atomic with the change.
* It writes one row per key; the caller loops its changed-key diff.
* `source` is `'settings_api'` when the change came through S-5/S-6 and `'module_api'` when it came through the owning module's own endpoint. It is meaningful **only on ledger rows** — rows read from the two JSONB audit tables report `source: null`, because those tables have no such column and this plan changes no existing table (§7.8).
* A recorder failure **fails the whole write** (it is inside the transaction, so it rolls back). Audit is not best-effort for settings: an unattributable change to a control like #39 is worse than a failed save.

### 10.3 What is deliberately not built

| Mechanism | Verdict | Why |
|---|---|---|
| Version numbers on settings rows | **no** | `updated_at` already provides the concurrency token (§6.3); a version column on three tables buys nothing |
| Snapshot-per-change of the whole settings row | **no** | the per-key old→new diff reconstructs any point in time; storing 60 columns per edit is 60× the storage for the same information |
| Rollback endpoint | **no** | a rollback is just another write, and it must re-run every guard. "Reset to default" (S-6) covers the real need; restoring an arbitrary historical value is `PUT` with the value the history shows. Building a rollback that bypasses guards would be a hole; building one that doesn't is S-5. |
| Approval workflow on settings changes | **no** | no registry entry asks for it (§3.2.7, §19 Q-S4) |
| Effective dating of settings changes | **no** | no registry entry asks for it (§3.2.8) |
| Reason required on every change | **no** | required only for `risk: 'high'` keys. Mandatory free text on a low-risk toggle produces `"."` and trains users to ignore the field |

### 10.4 Known gaps carried forward (DEF-S4/S5/S6)

Attendance (#13–#29), Leave (#1–#12) and Organization (#30–#34) **per-record** settings changes remain unaudited after this plan. Closing them means touching 20+ write paths in three modules and belongs in its own plan. What this plan does provide is the **mechanism** they will use (`settingsAudit.record` + `settings_change_logs`), so the follow-up is one call per write path and a `CHECK`-constraint widening — not a new design.

**This gap must be stated explicitly in the Phase 3 change record** so nobody assumes `GET /settings/history` covers all 98 settings. It covers the 62 singleton-backed ones plus #97/#98.

---

## 11. Caching & Performance

### 11.1 Current state (verified)

There is **no cache on any settings read today**. `payroll_settings`, `statutory_configs` and `document_settings` are read from Postgres on every access, including on hot paths (`resolveEffectivePolicy` per document read, `_blockingSetting` per self readout, the manager-visibility check per manager list). `entitlement.service.hasFeature` is likewise uncached.

### 11.2 D-S10 — Phase 1–4 add no cache

The gateway's reads are HR-facing, low-QPS (a settings page load), and already as cheap as the module endpoints they replace. Introducing a cache in the same phase as a new read path would make any regression ambiguous. **Phases 1–4 are cache-free and are therefore performance-neutral by construction.**

### 11.3 Phase 5 (optional, gated on §19 Q-S5) — a narrow read-through cache

Only if measurement justifies it, and only for the two hot singletons:

| Aspect | Design |
|---|---|
| Keys | `settings:v1:document_settings:{orgId}`, `settings:v1:payroll_settings:{orgId}` |
| Value | the plain row, JSON |
| TTL | 30 s — short enough that a missed invalidation self-heals within one page refresh, long enough to collapse a burst |
| Population | read-through in the adapter's `read(orgId)`, **only on the no-transaction path** |
| Invalidation | synchronous `DEL` **after** the owner's transaction commits, in the adapter's update wrapper |
| Failure | **fail open** — any Redis error falls through to Postgres and is logged at `warn`, never thrown. Precedent: `org_rate_limit.utils` and `checkPreviewRate` both fail open |
| Version prefix | `v1` in the key so a shape change is a prefix bump, never a stale-shape read |
| Not cached | `statutory_configs` (read once per run, then frozen into the snapshot — caching buys nothing and risks a wrong withholding), `organization_profiles` (read on a cron cadence) |

### 11.4 The one rule that must not be broken

> **A cached value must never be served to a read that is inside a write transaction.**

The document module deliberately reads settings *inside* the publish/sync transaction (`getOrCreate(orgId, t)`, C-30) so the `due_on` fallback cannot shift mid-write. A cache that answered that read would reintroduce exactly the race C-30 was written to close.

Implementation: the adapter's `read` signature is `read(orgId, { transaction } = {})`, and the cache is consulted **only when `transaction` is falsy**. `T-S23` asserts a transaction-bearing read bypasses the cache; `T-S24` asserts invalidation happens after commit, not before (a pre-commit `DEL` followed by a rollback would evict a value that is still correct — harmless — but a pre-commit `DEL` followed by a concurrent read would repopulate the cache with the *old* value and then the commit would leave it stale, which is not harmless).

### 11.5 Performance characteristics

| Endpoint | Queries | Notes |
|---|---|---|
| S-1 catalog | 0–4 | 0 DB; up to 4 `hasFeature` calls (cacheable later; today each is 1–3 queries) |
| S-2 | 0 | in-memory |
| S-3 aggregate | 4 + entitlement | one `getOrCreate` per store, run **in parallel** (`Promise.allSettled`, which is also what gives §7.4's partial-failure contract) |
| S-4 group | 1 + entitlement | |
| S-5 write | the owner's transaction, unchanged | |
| S-7 history | ≤ 3 | one per source, merged in memory; keyset-paginated |
| S-9 readiness | ≤ 9 small reads | run in parallel; each probe independently bounded |

**Scalability note:** every query is `org_id`-scoped and index-backed. Nothing in this module scans across tenants. There is no N+1: the aggregate read is four fixed queries regardless of how many settings exist, because the settings are columns, not rows — a direct benefit of rejecting the key-value design (D-S6).

---

## 12. Concurrency & Reliability

### 12.1 Concurrent-write scenarios

| Scenario | Today | After this plan |
|---|---|---|
| Two HR users change **different** keys in `document_settings` | second write wins for its keys; `SELECT … FOR UPDATE` serialises them correctly | unchanged, plus the `If-Match` gate makes the second user re-read first |
| Two HR users change **different** keys in `payroll_settings` | **DEF-S7:** no row lock, so the diff computed for the audit row can be wrong and an interleaved write can be lost | fixed in Phase 2: `findByOrgId(orgId, { lock: true, transaction })` after `getOrCreate`, matching the document and statutory services |
| Two HR users change #97/#98 on `organization_profiles` | **DEF-S10:** `updateOrganizationProfile` issues a blind `UPDATE … WHERE org_id` — no lock **and no read of the prior row**. Last write wins, silently | fixed in Phase 2: a locked pre-read (`lock: true`) before the update, the `If-Match` comparison against the locked row, and the before-state captured for the audit. **Phase 3 cannot record an old→new diff for this store until this is done** |
| Two HR users change #104 on `document_letter_branding` | already correct — `replace()` locks with `findByOrgId(orgId, { lock: true, transaction: t })` and reads the before-state for its audit | unchanged; only the `If-Match` comparison is added |
| Two HR users change the **same** key | last write wins silently | `412 SETTINGS_PRECONDITION_FAILED` for the stale caller |
| HR enables #39 while another HR user is deactivated | `countActiveHrUsers` runs inside the transaction, but the user-deactivation path is a different transaction | unchanged — and worth stating plainly: the pool check is a point-in-time check, not a constraint. Deactivating down to one HR user after #39 is ON leaves the org with an unapprovable queue. **This is a pre-existing gap in both the payroll and document modules, outside this plan's scope; raised as §19 Q-S9.** |
| Settings change during a payroll run | run uses its frozen `settings_snapshot` | unchanged; S-5 additionally **reports** the affected live runs via `impact.affected_runs` |
| Settings change during an org-document publish | the publish reads settings inside its own transaction (C-30) | unchanged; Phase 5's cache must not break it (§11.4) |
| Two concurrent **first** reads for an org | `findOrCreate` + `UNIQUE (org_id)` backstop; the loser re-reads | unchanged — the gateway adds no new provisioning path |

### 12.2 Optimistic concurrency, precisely

1. S-4 returns `etag = W/"{store}:{updated_at.getTime()}"`.
2. S-5/S-6 require `If-Match`. Missing → `400 SETTINGS_IF_MATCH_REQUIRED`. Malformed → `400`.
3. The gateway passes `ifMatch` to the adapter, which passes it to the owner.
4. The owner, **after acquiring the row lock**, compares the token against the locked row's `updated_at`. Mismatch → `412 SETTINGS_PRECONDITION_FAILED { current_etag }`.
5. Checking after the lock is what makes it correct: a competing write either has not started (so the token matches) or has committed (so the lock was released and the token no longer matches).

**Why not a `version` column:** §6.3. **Why `If-Match` is required rather than optional:** an optional precondition is one that no client sends, and the whole point is to stop a stale settings page from reverting a colleague's change. The cost is one documented header (flagged in the Phase 2 change record).

### 12.3 Idempotency

* S-1/S-2/S-3/S-4/S-7/S-8/S-9 are `GET` — naturally idempotent.
* S-5 is `PUT` with `If-Match` — a retry with the same token is rejected (`412`) if the first attempt succeeded, and succeeds if it did not. This is exactly the desired behaviour; **no idempotency-key table is needed**, which is why `PUT` was chosen over `POST`.
* S-6 is `POST` for body-shape reasons but is semantically idempotent (resetting to a default twice yields the same state); the `If-Match` gate still prevents a double-apply over a concurrent change.

### 12.4 Failure isolation

| Failure | Behaviour |
|---|---|
| One store's read fails during S-3 | `200` with that group in `unavailable_groups`; `503` only if **all** fail (§7.4) |
| The owner's transaction fails mid-write | the owner rolls back; the gateway surfaces the error; **no partial write is possible** because there is exactly one transaction and one store (D-S4) |
| Audit recorder fails | the enclosing transaction rolls back; the settings change does not happen (§10.2) |
| Redis unavailable (Phase 5 cache) | fail open to Postgres; `warn` log; correctness unaffected |
| Entitlement check fails due to DB outage | `503 ENTITLEMENT_DEPENDENCY_FAILURE` — the existing behaviour, deliberately not flattened to a `403` |
| A readiness probe throws | that check reports `status: 'blocked'` with `detail: 'check failed'`; the other checks still return. A readiness readout is advisory |
| Catalog is malformed | **process fails to boot** (§8.2). A settings module serving a wrong contract is worse than one that is down |

---

## 13. Events & Integrations

### 13.1 Verdict: no new events (D-S8)

Every registry consumer reads its setting live at use time or from a frozen snapshot. No consumer needs to be *told* a setting changed. An event bus would add a permanent-staleness failure mode in exchange for nothing.

### 13.2 Synchronous integration points (all existing)

| Integration | Direction | Trigger | Failure handling |
|---|---|---|---|
| Owner's audit write | Settings → owner's audit table | inside the owner's update transaction | rolls back the change |
| `settingsAudit.record` | organization module → `settings_change_logs` | inside `updateProfile`'s transaction | rolls back the change |
| Salary-component activation | `statutory_config.updateConfig` | a statutory head flips OFF → ON | inside the same transaction; already shipped |
| `affected_runs` impact read | `statutory_config.updateConfig` | after commit, read-only | a failure degrades to an absent `impact` field, never a failed write |
| Cache `DEL` (Phase 5) | adapter → Redis | after commit | fail open; the 30 s TTL is the backstop |
| Entitlement check | Settings → billing | every request | `503` on DB outage |

### 13.3 Notifications on settings change — deliberately not built

A "settings changed" email to HR is **not** in the source of truth and is not planned. Noted as §19 Q-S10 in case it is wanted: it would be a post-commit, failure-isolated enqueue onto the existing email path (the precedent being `payslip_auto_email`, which only enqueues and never lengthens a transaction), gated to `risk: 'high'` keys only.

### 13.4 Cron / scheduled jobs

**The Settings module adds no cron job.** It reads configuration that existing crons already consume (#56 payroll automation, #65/#71/#95 document sweepers, #90 PDF cache purge, #92 letter auto-issue, #98 billing reminders). Those crons continue to read the owning store directly.

---

## 14. Testing Strategy

All tests are `node:test` under `tests/unit/settings/`, matching the existing layout and the `npm test` glob. **No test touches a database** — the standing constraint. Owners are stubbed at the service boundary, which is exactly the seam the gateway talks to.

### 14.1 Catalog & contract tests (Phase 1)

| ID | Test |
|---|---|
| `T-S1` | no foreign model require / no foreign write in `src/modules/settings/**` (static scan) — proves D-S1 |
| `T-S2` | **drift test**: catalog key set ≡ owner mutable-field list; ranges ≡ owner Joi; defaults ≡ model defaults; nullability matches — per adapter (§8.3) |
| `T-S3` | every registry entry 1–114 is represented exactly once across the catalog + surfaces |
| `T-S4` | catalog load-time invariants all hold (§8.2), and a deliberately malformed fixture throws |
| `T-S5` | every group maps to exactly one store; every store has exactly one adapter |
| `T-S6` | group → feature-key map covers only the four real feature keys; no new key invented |
| `T-S7` | catalog is deep-frozen (a mutation attempt throws) |
| `T-S12` | risk classification snapshot — a reclassification must be a deliberate diff |
| `T-S25` | `effect_timing` is non-null for every writable key and is one of the five allowed values |
| `T-S26` | every `risk: 'high'` key has a non-empty `warnings[]` and `requires_reason: true` |

### 14.2 Read-path tests (Phase 1)

| ID | Test |
|---|---|
| `T-S27` | S-3 returns one entry per readable group, with ETags |
| `T-S28` | S-3 with one adapter stubbed to throw → `200` + `unavailable_groups` |
| `T-S29` | S-3 with **all** adapters throwing → `503 SETTINGS_READ_UNAVAILABLE` |
| `T-S30` | S-3 omits unentitled groups into `unavailable_groups` with `FEATURE_NOT_AVAILABLE` |
| `T-S31` | S-1 `include_hidden=false` omits #87; `=true` includes it with `deprecated: true` |
| `T-S32` | S-1 ETag/`304` behaviour |
| `T-S18`, `T-S14`, `T-S22`, `T-S9` | sensitivity and RBAC projection (§9.7) |

### 14.3 Write-path tests (Phase 2)

| ID | Test |
|---|---|
| `T-S16`, `T-S17` | unknown key / watermark key → `422`, owner update **not called** |
| `T-S19`, `T-S20` | high-risk without `confirm` / `reason` → `409` / `422`, owner update **not called** |
| `T-S33` | missing `If-Match` → `400 SETTINGS_IF_MATCH_REQUIRED` |
| `T-S34` | stale `If-Match` → `412` with `current_etag` |
| `T-S35` | read-only group (`payroll.deprecated`) → `405` |
| `T-S36` | the owner's `INSUFFICIENT_CHECKERS` / `SETTINGS_CONFLICT` / `SCAN_PROVIDER_NOT_CONFIGURED` / `INVALID_PAYOUT_COMPONENT` / `SETTING_OUT_OF_RANGE` propagate **unchanged** (status, code, details) |
| `T-S37` | the adapter calls the owner's update **exactly once** with exactly the intersected patch — no extra keys, no dropped keys |
| `T-S38` | `changed` contains only keys whose value actually differed; identical submissions land in `unchanged_keys` |
| `T-S39` | `impact.affected_runs` is passed through when the owner returns it, absent when it does not |
| `T-S40` | S-6 reset resolves catalog defaults and runs the identical pipeline (high-risk reset still needs `confirm`) |
| `T-S41` | S-6 on a `"required — no default"` key → `422 SETTING_NOT_RESETTABLE` |
| `T-S42` | S-6 on a `null`-means-inherit key writes `null` |
| `T-S43` | **DEF-S7 regression:** `payroll_settings.service.update` acquires `FOR UPDATE` before computing the diff (asserted on the repository call) |
| `T-S44` | body-size / key-count / nesting bounds reject a pathological payload before the owner is called |
| `T-S59` | **comparator (DEF-S11):** `valuesEqual('2.00', 2.00, 'decimal')` is `true`; `valuesEqual('2.00', 2.50, 'decimal')` is `false`; `valuesEqual([7,1], [1,7], 'array')` is `false`; `valuesEqual(null, 0, 'integer')` is `false` |
| `T-S60` | **DEF-S11 regression:** a `PUT` that resubmits a DECIMAL key with its existing value produces **no** audit diff entry and lands the key in `unchanged_keys` |
| `T-S61` | **#104 normalisation:** a 7-element `registered_address_lines` is reported back as the stored 5, and a `null` `accent_color_hex` lands in `unchanged_keys` — `changed` is built from the re-read row, never echoed from the patch |
| `T-S62` | **#104 audit shape:** the branding entity's `old_values`/`new_values` are two full DTOs, and the reader diffs them key-by-key rather than treating `new_values` as a changed-keys map |
| `T-S63` | **DEF-S10:** `updateOrganizationProfile` performs a locked read before its update, and the before-state it captures is the one the audit records |
| `T-S64` | the `documents.branding` adapter calls `document_letter_branding.service.replace` exactly once, with only the intersected catalog keys, and never an asset column |

### 14.4 History tests (Phase 3)

| ID | Test |
|---|---|
| `T-S10` | `settings_change_log.repository` exposes only `create` + reads (no update/destroy) |
| `T-S13` | `settingsAudit.record` throws if called without a transaction |
| `T-S45` | fan-out: one `payroll_audit_logs` row with three changed keys yields three history items |
| `T-S46` | merge order across three sources is `created_at DESC, id DESC`, and the keyset cursor is stable across a page boundary with identical timestamps |
| `T-S47` | `setting_key` filter matches a JSONB-map source and the per-key ledger identically |
| `T-S48` | `source` is `'settings_api'` for a gateway write to `organization_profiles`, `'module_api'` for a direct `PUT /organizations/profile`, and **`null`** for every row sourced from `payroll_audit_logs` / `document_audit_logs` (those tables have no `source` column — §7.8) |
| `T-S49` | EC-S12: a prior SQL `NULL` is recorded as `'null'::jsonb`, not SQL `NULL` |

### 14.5 Surfaces / readiness tests (Phase 4)

| ID | Test |
|---|---|
| `T-S11` | no readiness probe performs a write (static scan over the probe module) |
| `T-S50` | a probe for an OFF setting reports `not_applicable`, not `blocked` |
| `T-S51` | a throwing probe degrades to `blocked` without failing the response |
| `T-S52` | surfaces are projected by entitlement; an unentitled module's surfaces are omitted |
| `T-S53` | every surface's `endpoint` string matches a route actually registered by the owning module (static scan against the route files) — stops the index rotting |

### 14.6 Cache tests (Phase 5)

| ID | Test |
|---|---|
| `T-S23` | a read with a transaction **bypasses** the cache (§11.4) |
| `T-S24` | invalidation `DEL` happens after commit, not before |
| `T-S54` | a Redis error on read falls through to Postgres and returns the correct value |
| `T-S55` | a Redis error on invalidation does not fail the write |
| `T-S56` | key prefix includes `v1` and the store name |

### 14.7 Concurrency tests

Unit-level (no DB), by stubbing the repository to simulate interleaving:

| ID | Test |
|---|---|
| `T-S57` | two sequential writes with the same stale ETag: first succeeds, second `412` |
| `T-S58` | the token is compared against the **locked** row, not the pre-lock read |

### 14.8 What cannot be unit-tested, and how it is covered instead

Row locking, `CHECK` constraints and index behaviour need a database. They are covered by: (a) static assertions that the lock option is passed (`T-S43`, `T-S58`); (b) the migration's DDL reviewed against §6.2; (c) an **operator smoke checklist** in the Phase 3 hand-back (create a row, verify the four indexes exist, verify both CHECKs reject a bad value, verify `down()` drops only this table). No claim of DB-level verification will be made without the operator running it.

---

## 15. Observability

### 15.1 Structured logging

One log line per settings write, at `info`, with no values of `sensitive` keys and **no `reason` text** (it may contain business-confidential detail; it lives in the audit row, which is access-controlled):

```text
[settings] write org=<orgId> group=<groupKey> store=<store> actor=<actorId>
           keys=<n> changed=<n> risk=<max risk> req=<requestId> ms=<n>
```

At `warn`: a `412`, a `409 SETTINGS_CONFIRMATION_REQUIRED`, a cache fail-open.
At `error`: an adapter read failure during S-3 (with the store key), a recorder failure, a catalog load failure.

Format follows the existing bracketed-prefix convention (`[AUTH]`, `[Entitlement]`, `[org-rate-limit]`).

### 15.2 Correlation

`x-request-id` is read in the controller (the convention already used by `payroll_hr.controller.actorContext`), threaded through the adapter into the owner's actor context, and persisted on the audit row. Every log line carries it. A settings change is therefore traceable from the HTTP request to the audit row with one identifier.

### 15.3 Metrics (counters, emitted through the existing logging path — no new dependency)

| Metric | Labels | Why |
|---|---|---|
| `settings_write_total` | group, outcome (`ok`/`4xx`/`5xx`) | adoption and failure rate |
| `settings_write_blocked_total` | group, code (`412`, `409`, `422`) | tells you whether the concurrency and confirmation gates are helping or just annoying |
| `settings_read_degraded_total` | store | §7.4 partial failures — the signal that a store is sick |
| `settings_high_risk_change_total` | setting_key | the one metric worth alerting on |
| `settings_cache_fallback_total` | store | Phase 5 only; Redis health |

### 15.4 Alerts worth having

| Alert | Condition | Rationale |
|---|---|---|
| **High-risk settings change** | any `settings_high_risk_change_total` increment | #65/#79/#95 changes have irreversible or client-visible consequences; someone should know the same day |
| **Settings read degraded** | `settings_read_degraded_total` > 0 over 5 min | a store is failing; the settings page is lying by omission |
| **Repeated precondition failures** | `settings_write_blocked_total{code="412"}` > 10 / 5 min for one org | either two admins are fighting, or a client is not re-reading the ETag |
| **Catalog load failure** | process fails to boot | deploy-blocking; should already be caught by `T-S4` |

### 15.5 Audit as observability

`GET /settings/history` is the human-facing observability surface: "what changed, when, by whom, and why". The §10.4 gap (per-record settings unaudited) is the known blind spot and must be stated in the change record.

---

## 16. Implementation Phases

Five phases, ordered by dependency. Phases 1, 2, 4 and 5 require **no migration**. Only Phase 3 is DB-gated, and it is deliberately placed after the functional work so the module is useful before the operator has to do anything.

### Phase 1 — Catalog & read plane (no migration)

**Objective.** Make the 98 settings discoverable and readable through one authenticated surface, with zero behaviour change to any existing endpoint.

| Aspect | Detail |
|---|---|
| **Scope** | catalog as a code asset; four read adapters; S-1, S-2, S-3, S-4; module wiring |
| **DB changes** | **none** |
| **Backend changes** | new `src/modules/settings/` tree (§4.12); `settings.index.js` mounted in `src/app.js` (one line); **no** entry added to `MODEL_ROOTS` (no models in this phase) |
| **APIs** | S-1 `GET /settings/catalog`, S-2 `GET /settings/catalog/:settingKey`, S-3 `GET /settings`, S-4 `GET /settings/groups/:groupKey` |
| **Business logic** | catalog load-time invariants (§8.2); RBAC + sensitivity projection; entitlement projection; parallel adapter reads with partial-failure degradation (§7.4); ETag computation |
| **Security** | `authenticate` + `authorize(['hr','manager'])` + `requireActiveOrg`; `admin`/`super-admin` excluded; `sensitive` keys omitted; `orgId` from the token only |
| **Also in this phase** | registry doc corrections **DEF-S1** (move the `## Notes & cross-module dependencies` block out from between #40 and #41 to the end of the file), **DEF-S2** (re-file #87–#90 under Payroll, or add an explicit "stored on `payroll_settings`" line to each — the catalog's `store` is the machine-readable truth either way), **DEF-S3** (mark #87 `deprecated`/inert in the registry text). These are edits to `org_settings_registry.md` only |
| **Testing** | `T-S1`–`T-S7`, `T-S9`, `T-S12`, `T-S14`, `T-S18`, `T-S22`, `T-S25`–`T-S32` |
| **Dependencies** | none |
| **Completion criteria** | (a) all Phase 1 tests green and the full existing suite still green; (b) `T-S3` proves every registry entry 1–114 is represented; (c) `T-S2` green for all **five** adapters; (d) a `curl` of S-3 as `hr` returns a group entry per readable group across all five stores; (e) no diff in any existing module's source except the one `app.js` mount line; (f) change record `settings_module_read_apis_<date>.md` written |

### Phase 2 — Write plane (no migration)

**Objective.** Let HR change any writable setting through the gateway, with the owner's guards fully intact, plus optimistic concurrency and a confirmation gate for high-risk keys.

| Aspect | Detail |
|---|---|
| **Scope** | S-5, S-6; the allowlist intersection; `If-Match`; `risk: 'high'` confirmation; DEF-S7 and DEF-S8 fixes |
| **DB changes** | **none** |
| **Backend changes** | write service + adapter `update()` wrappers; envelope validator; **fix DEF-S7** — add `FOR UPDATE` to `payroll_settings.service.update` before the diff is computed, matching the document/statutory services; **fix DEF-S8** — attach the existing `updateSettingsSchema` to `PUT /documents/hr/settings` via `validate()` (the service already validates, so this is defence in depth and an earlier, cleaner `422`); **fix DEF-S10** — give `organization.service.updateOrganizationProfile` a locked pre-read (`lock: true`) so it has both a concurrency token to compare and a before-state to audit; **fix DEF-S11** — route `payroll_settings.service.js:99`'s diff through the shared `valuesEqual()` comparator so DECIMAL keys stop reporting phantom changes; add the fifth adapter for `documents.branding` (#104) over the existing `replace()`; extend the **four** mutable owner services to accept and verify an optional `ifMatch` under the lock |
| **APIs** | S-5 `PUT /settings/groups/:groupKey`, S-6 `POST /settings/groups/:groupKey/reset` |
| **Business logic** | intersection allowlist (§9.3); unknown key → `422`, never stripped; `If-Match` compared under the lock (§12.2); high-risk `confirm` + `reason`; owner errors propagated verbatim; `changed`/`unchanged_keys`/`impact` response assembly |
| **Security** | all five gates (§9.5); body bounds (§9.6); watermark columns unreachable |
| **Testing** | `T-S15`–`T-S17`, `T-S19`–`T-S21`, `T-S33`–`T-S44`, `T-S57`, `T-S58` |
| **Dependencies** | Phase 1 (catalog, adapters, ETag) |
| **Completion criteria** | (a) all Phase 2 tests green plus the complete existing suite — **in particular every pre-existing payroll and document settings test must pass unmodified**, which is the proof that the owner's behaviour was not altered; (b) `T-S43` proves the DEF-S7 lock and `T-S63` the DEF-S10 locked pre-read; (c) `T-S36` proves all five owner guard codes reach the client unchanged; (d) `T-S59`/`T-S60` prove the DEF-S11 comparator and that a resubmitted DECIMAL value produces no phantom diff; (e) `T-S61`/`T-S64` prove the `documents.branding` adapter reports stored values and never touches an asset column; (f) change record `settings_module_write_apis_<date>.md` written, **leading with the mandatory `If-Match` header**; (g) `api_registry.md` rows #246/#247 and the matching `combined_api_analysis.md` sections added (§7.12) |

### Phase 3 — Unified change history (**DB-gated**)

**Objective.** One chronological answer to "who changed this setting, when, from what, to what, and why", including the `organization_profiles` door that has no audit today.

| Aspect | Detail |
|---|---|
| **Scope** | migration `00073`; `settings_change_logs` model + repository; `settingsAudit.record`; recorder wiring into `organization.service.updateProfile`; S-7 |
| **DB changes** | **migration `00073-create-settings-change-logs.js`** (§6.2) — one new table, four indexes, two CHECKs. No change to any existing table. `down()` drops only this table (no data loss elsewhere) |
| **Backend changes** | add `modules/settings/models` to `MODEL_ROOTS` in `src/infrastructure/postgres-sql/models.index.js`; the history reader unions `payroll_audit_logs` (two entity types), `document_audit_logs` and `settings_change_logs`, fanning JSONB maps out to one item per key; keyset pagination on `(created_at DESC, id DESC)` |
| **APIs** | S-7 `GET /settings/history` |
| **Business logic** | fan-out and merge (§7.8); `source` attribution where known, `null` where the source table has no such column (§7.8); `'null'::jsonb` for absent prior values (EC-S12); recorder requires a transaction |
| **Security** | `hr` only; `org_id`-scoped; reason text returned only to `hr`; no mutation endpoint on the ledger |
| **Testing** | `T-S10`, `T-S13`, `T-S45`–`T-S49` |
| **Dependencies** | Phase 2 — and specifically **DEF-S10 must be fixed first**: until `updateOrganizationProfile` reads the prior row under a lock there is no before-state, so `settingsAudit.record` has nothing to put in `old_value` and the ledger would record `null → value` for every edit including the second one. **Operator must run migration 00073 before this phase's code is deployed** |
| **Completion criteria** | (a) migration file reviewed against §6.2 and **handed back unrun** with the operator smoke checklist (§14.8); (b) all Phase 3 tests green against stubs; (c) `GET /settings/history` returns `[]` rather than erroring on an org with no history; (d) `T-S62` proves the branding entity's two-full-DTO audit shape is diffed key-by-key, and `T-S48` proves `source` is `null` for JSONB-audit-table rows rather than a guess; (e) change record `settings_module_history_api_<date>.md` written, **explicitly stating the §10.4 coverage gap** (per-record settings in attendance/leave/organization are not in history) and that `source` is only populated for ledger rows; (f) `api_registry.md` row #248 and the `combined_api_analysis.md` section added |

> **Hand-back, not a deploy step.** Per the standing constraint, no `db:migrate` and no connectivity check is run from here. Phase 3 code must not be deployed before the operator confirms 00073 has been applied; until then, Phases 1–2 run fine without it.

### Phase 4 — Surfaces index & readiness (no migration)

**Objective.** Close the discoverability gap for the 34 settings that are *not* columns on a singleton — the per-record ones — and give HR one "is my configuration actually usable?" readout.

| Aspect | Detail |
|---|---|
| **Scope** | S-8, S-9 |
| **DB changes** | **none** |
| **Backend changes** | surfaces index (a static list: registry refs, owning module, managing endpoint, entity, scope — **it stores no values and performs no writes**); readiness probes (read-only, parallel, independently bounded) |
| **APIs** | S-8 `GET /settings/surfaces`, S-9 `GET /settings/readiness` |
| **Business logic** | entitlement projection of surfaces; probe outcomes `ok` / `blocked` / `not_applicable` / check-failed; `not_applicable` when the governing flag is OFF |
| **Security** | `hr` only for readiness; surfaces readable by `hr` (manager sees none — a surfaces list is an administrative map); no probe writes (`T-S11`) |
| **Testing** | `T-S11`, `T-S50`–`T-S53` |
| **Dependencies** | Phase 1 (catalog + entitlement projection) |
| **Completion criteria** | (a) `T-S53` proves every surface endpoint string matches a route the owning module actually registers; (b) `T-S11` proves no probe writes; (c) a readiness call on a fresh org returns without error; (d) change record `settings_module_surfaces_readiness_<date>.md` written |

### Phase 5 — Caching & observability (optional; gated on Q-S5)

**Objective.** Only if measurement shows the settings reads matter. Otherwise this phase is **not built** and that is the correct outcome.

| Aspect | Detail |
|---|---|
| **Scope** | the narrow read-through cache (§11.3); metrics + alerts (§15.3, §15.4) |
| **DB changes** | **none** |
| **Backend changes** | cache in the `document_settings` and `payroll_settings` adapter reads only, **no-transaction path only**; post-commit `DEL`; fail-open; `v1` key prefix. Metrics counters through the existing logging path — **no new dependency** |
| **APIs** | none |
| **Business logic** | §11.4's rule is the acceptance criterion, not a nicety |
| **Testing** | `T-S23`, `T-S24`, `T-S54`–`T-S56` |
| **Dependencies** | Phases 1–2. **Blocked on Q-S5** |
| **Completion criteria** | (a) `T-S23` proves a transaction-bearing read bypasses the cache; (b) `T-S24` proves post-commit invalidation; (c) every existing document publish/sync test passes unmodified; (d) no change record needed (no API change) |

### 16.1 What is deliberately not a phase

| Candidate | Why not |
|---|---|
| "Migrate all settings into a generic store" | D-S6. It would be a rewrite of five modules to achieve nothing a caller can observe |
| "Deprecate the module settings endpoints" | §19 Q-S3. Both doors are supported; the gateway is additive. Removing a working endpoint is a frontend-breaking change with no benefit until the new surface has proven itself |
| "Audit the per-record settings" | §10.4. Real work, its own plan, 20+ write paths in three modules |
| "Approval workflow / effective dating" | not in the source of truth |
| ~~"Register #99–#113"~~ | **Done, not deferred.** The user resolved Q-S1 on 2026-10-09: nothing is to be left behind. All 18 gaps are now registry entries #97–#114, and the catalog/surfaces carry them from Phase 1. The one architectural consequence was #104 → a fifth adapter and the `documents.branding` group (DEF-S12). |

---

## 17. Deployment & Migration

### 17.1 Deployment order

| Step | Action | Reversible? |
|---|---|---|
| 1 | Deploy Phase 1 (read-only, additive routes, no migration) | yes — revert the commit |
| 2 | Deploy Phase 2 (writes) | yes |
| 3 | **Operator** applies migration `00073` | yes — `down()` drops only the new table |
| 4 | Deploy Phase 3 (history + recorder) | yes, but see §17.4 |
| 5 | Deploy Phase 4 | yes |
| 6 | (Optional) Deploy Phase 5 | yes |

The deployment pipeline runs migrations automatically on deploy; `00073` must therefore be present in the same release as Phase 3's code and **must not** be merged earlier than the operator is ready for it.

### 17.2 Default configuration initialisation

**No seeding, no backfill.** Deliberately:

* The three singletons are created lazily by `getOrCreate` on first access, with column defaults. Seeding rows for every org would create rows for orgs that never open the settings page, and would duplicate the defaults in a second place that can drift from the model.
* `organization_profiles` rows already exist for every org; `billing_notification_emails` / `billing_reminder_lead_days` already have defaults.
* The catalog ships with the code, so "initialising defaults" is a deploy, not a data operation.
* `settings_change_logs` starts empty. History before Phase 3 is whatever the three existing audit tables already hold, and the reader surfaces it — so the history endpoint is useful on day one without a backfill.

### 17.3 Backward compatibility

| Concern | Status |
|---|---|
| Existing settings endpoints | **unchanged** — same paths, same request shapes, same responses. Phase 2's only touch is attaching an already-existing validator (DEF-S8) and adding a row lock (DEF-S7), neither of which changes a success response |
| Existing settings responses | unchanged. The gateway's shapes are new and additive |
| `If-Match` | required **only** on the new S-5/S-6. The module endpoints do not require it, so no existing client breaks |
| Owner error codes | propagated verbatim, so a client that already handles `INSUFFICIENT_CHECKERS` works against both doors |
| DB schema | one new table; zero changes to existing tables, columns, types or constraints |
| Frontend | four change records (§7.11); nothing a current screen does stops working |

**The one behaviour change to be honest about:** DEF-S8's validator will reject payloads that the document settings endpoint previously accepted and silently stripped. A client sending a typo'd key currently gets a `200` that changed nothing; after Phase 2 it gets a `422`. That is the correct behaviour and is the same fix the payroll module already made, but it must be in the change record.

### 17.4 Rollback

| Phase | Rollback |
|---|---|
| 1, 2, 4, 5 | revert the commit; routes disappear; nothing else is affected |
| 3 | revert the code **first**, then optionally run `00073` `down()`. Reverting the code while the table remains is completely safe (an unused table). Dropping the table while Phase 3 code is live breaks S-7 and the recorder — **and the recorder failing inside `updateProfile`'s transaction would block profile updates**, which is why the code must be reverted first |

Rolling back Phase 2 while Phase 3 is live is fine: the recorder's `source` column simply stops seeing `'settings_api'` values.

### 17.5 Operator hand-back checklist (Phase 3)

```text
1. Apply migration 00073.
2. Verify the table exists with the columns in §6.2.
3. Verify the four indexes exist.
4. Verify CHECK (store IN (...)) rejects an unknown store.
5. Verify CHECK (old_value IS NOT NULL AND new_value IS NOT NULL).
6. Verify down() drops ONLY settings_change_logs.
7. Confirm applied, then the Phase 3 code may be deployed.
```

No step in this checklist is performed from the development environment.

---

## 18. Failure Scenarios & Recovery

| # | Scenario | Detection | Behaviour | Recovery |
|---|---|---|---|---|
| F-1 | **Two HR users write the same group concurrently** | `412` rate | the second write is rejected with `current_etag`; the row lock means no lost update even without the token | client re-reads S-4 and re-submits. Alert at §15.4's threshold if sustained |
| F-2 | **Stale client writes with an old ETag** | `412` | rejected before any mutation | re-read, re-submit |
| F-3 | **Postgres unreachable during a read** | `5xx`, `settings_read_degraded_total` | per-store degradation: `200` with `unavailable_groups`; `503 SETTINGS_READ_UNAVAILABLE` only if all stores fail | transient; the page shows which sections are unavailable rather than failing wholesale |
| F-4 | **Postgres unreachable during a write** | `5xx` | the owner's transaction never commits; **no partial write possible** (one store, one transaction) | retry. Safe because the write is idempotent under `If-Match` |
| F-5 | **Redis unreachable (Phase 5)** | `settings_cache_fallback_total` | **fail open** to Postgres; `warn` log; values remain correct | self-heals |
| F-6 | **Redis returns a stale value after a missed invalidation** | user reports a saved value not reflected | bounded by the 30 s TTL | wait, or bump the `v1` prefix on deploy. This bounded staleness is the entire reason the TTL is 30 s and not 10 min |
| F-7 | **Invalid config submitted** | `422` from the owner | the owner's Joi/service rejects; nothing written | the error names the key and the allowed range |
| F-8 | **Config valid but unusable** (#64 scan provider, #70 signature provider, #49 missing PT slabs) | `409` at write for #64; `503` at use for #70; engine warning for #49 | #64 is blocked at write; #70 is accepted with a catalog `warning` and fails at signing; #49's slabs are a separate surface | S-9 readiness is the designed detection surface for exactly this class |
| F-9 | **Downstream module fails during a settings write** (e.g. statutory component activation) | `5xx` | it is inside the same transaction → the whole write rolls back | retry |
| F-10 | **Audit recorder fails** | `5xx` | inside the transaction → the change rolls back. A settings change is never applied unattributed | retry; investigate the ledger |
| F-11 | **Unauthorized modification attempt** | `403` | five gates (§9.5); `admin`/`super-admin` cannot read, let alone write | the attempt is logged with actor and request id; it never reaches a store |
| F-12 | **Mass-assignment attempt** (watermark column, storage key, unknown key) | `422` | intersection allowlist; owner never called | `T-S16`/`T-S17` are the regression guard |
| F-13 | **Entitlement DB outage** | `503 ENTITLEMENT_DEPENDENCY_FAILURE` | existing behaviour, not flattened to `403` — the user is told to retry, not to upgrade | transient |
| F-14 | **Catalog malformed after a bad edit** | process fails to boot; `T-S4` should have caught it in CI | the deploy fails rather than serving a wrong contract | revert |
| F-15 | **Settings changed mid-payroll-run** | `impact.affected_runs` in the S-5 response | the run keeps its frozen `settings_snapshot`; the new value applies to the next run (`effect_timing: next_run`) | if the new value *should* apply, the run must be deleted and recreated — existing payroll behaviour, now surfaced at the moment of the edit instead of discovered later |
| F-16 | **Settings changed mid-org-publish** | — | the publish reads settings inside its own transaction (C-30) | unchanged; §11.4 protects it from Phase 5 |
| F-17 | **#39/#60 enabled, then HR pool drops to one** | HR cannot approve | the pool check is point-in-time, not a constraint; the queue stalls | turn the flag off, or activate a second HR user. **Pre-existing in both owners; raised as Q-S9, not fixed here** |
| F-18 | **Irreversible change applied by mistake** (#65 purge, #79 shrunk cap, #95 shortened retention) | the `risk: 'high'` alert (§15.4) | `confirm: true` + `reason` were required, and the old value is in history | turning the setting back does **not** restore purged evidence or re-expand already-shrunk assets. The confirmation gate plus the alert are the whole mitigation, and the plan says so plainly rather than implying recovery exists |
| F-19 | **History reader hits one failing audit source** | partial results | surface the available sources and mark the failing one — history is advisory, so partial is better than nothing | transient |
| F-20 | **An owner adds a mutable key without a catalog entry** | **`T-S2` fails in CI** | the build breaks before the drift ships | add the catalog entry. This is the mechanism that keeps the catalog honest over years |

---

## 19. Risks / Assumptions / Open Questions

### 19.1 Assumptions

| ID | Assumption | If wrong |
|---|---|---|
| A-S1 | `org_settings_registry.md` reflects the shipped code for all 114 entries. Entries #97–#114 were written *from* the code on 2026-10-09 and every citation in them was opened; of #1–#96 roughly 30 were spot-checked and the remainder is taken at its word | a mismatched range or default is caught by `T-S2` at build time, which is precisely why that test exists |
| A-S2 | The registry's "Where It's Set" field names the authoritative write path | a wrong group→store mapping; caught by `T-S5` and by `T-S2`'s key-set comparison |
| A-S3 | `hr` is the only tenant role permitted to change configuration, and the manager-readable set is exactly #38/#40/#58/#59/#93 | `read_roles` is a one-line catalog edit per key |
| A-S4 | No setting requires approval or effective dating today | §10.3 would need revisiting; the change ledger is the foundation either way |
| A-S5 | `updated_at` is a sufficient concurrency token because Sequelize always touches it on update | the same-tick caveat (EC-S4); if it proves real, a `version` column on three tables is a contained follow-up |
| A-S6 | A group maps to exactly one store, so one request is one transaction | multi-store atomicity would be needed, which is a materially different design — this is the load-bearing assumption of the whole plan (D-S4) |
| A-S7 | `effect_timing` per key, as authored from the registry's Deep Explanations, is correct | a UI tells a user a change is immediate when it is not. Highest-value review target in the catalog |
| A-S8 | Settings reads are not hot enough to need caching | Phase 5 exists for this; nothing in Phases 1–4 would have to change |

### 19.2 Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-S1 | Catalog drifts from the owners' real validation | **high** | `T-S2` fails the build (§8.3). The single most important control in the plan |
| R-S2 | The gateway becomes a place people add business logic | **high** | D-S1 + `T-S1` (static scan: no foreign model require, no foreign write). Architecturally the gateway *cannot* write |
| R-S3 | Two write doors diverge in behaviour | medium | the gateway delegates to the same service; `T-S37` asserts one call with the exact patch; every pre-existing owner test must pass unmodified |
| R-S4 | `If-Match` friction causes clients to retry blindly | medium | documented loudly in the Phase 2 change record; `412` returns `current_etag` so a client can re-sync in one step; §15.4 alerts on sustained `412`s |
| R-S5 | Phase 5's cache breaks the C-30 in-transaction read | **high** | §11.4 is stated as an acceptance criterion; `T-S23`; and the phase is optional — the safest mitigation is not building it |
| R-S6 | The 34 per-record settings stay invisible if S-8 is skipped | medium | Phase 4 is small and independent of Phase 3 |
| R-S7 | `settings_change_logs` grows unbounded | low | one row per changed key; a few hundred per org per year. Retention is Q-S8; the table is partition-friendly if it ever matters |
| R-S8 | DEF-S8's new `422` surprises a frontend | low | change record; and the rejected payloads were already no-ops |
| R-S9 | The registry's own document defects (DEF-S1/S2/S3) mislead a future implementer | low | fixed in Phase 1 as doc edits |
| R-S10 | High-risk changes go unnoticed | medium | `confirm` + `reason` + the §15.4 alert + history. Not fully solvable: F-18 is irreversible by nature |

### 19.3 Open questions (need the user's decision)

| ID | Question | Blocks | Default if unanswered |
|---|---|---|---|
| ~~**Q-S1**~~ | **RESOLVED 2026-10-09.** Should the unregistered org-level decisions be added to the registry? **Yes — all of them.** 18 entries (#97–#114, not 17/#99–#113 as first miscounted) are now in `org_settings_registry.md`, and the registry is continuous 1–114. #104 was reclassified from surface to singleton in the process (DEF-S12). | — | — |
| **Q-S2** | `settings_change_logs` vs. a generic `organization_audit_logs` that also absorbs the §10.4 gap | Phase 3's table name and CHECK | build `settings_change_logs` as specified (narrow, purpose-built) |
| **Q-S3** | Should the existing module settings endpoints be deprecated once the gateway ships? | nothing | keep both doors indefinitely; the gateway is additive |
| **Q-S4** | Is an approval workflow (maker-checker) wanted **on settings changes themselves**? | would reshape §10 | no — not in the source of truth |
| **Q-S5** | Build Phase 5's cache? | Phase 5 only | do not build it until a measurement justifies it |
| **Q-S6** | Promote hard-coded operational values to settings — e.g. `INVITE_TTL` (48 h, `invitation.repository.js:4`), the `0.1` statutory rounding tolerance, PDF cache TTLs? | nothing | leave them as code constants; mention them in §2.5 only |
| ~~**Q-S7**~~ | **RESOLVED 2026-10-09.** Does `role_invitation_policies` need its own entry? **No** — it is already the enforcement point cited by the existing Organization entries #32/#33, so a new number would duplicate them. It is listed under the registry addendum's *deliberately not registry entries* table with that reasoning, and it remains reachable as the `organization.role_invitation_policies` surface already in §5.2. | — | — |
| **Q-S8** | Retention policy for `settings_change_logs` — keep forever, or age out? | nothing in Phase 3 | keep forever (small table; audit value is highest for old changes) |
| **Q-S9** | Should enabling #39/#60 **constrain** HR deactivation (F-17/§12.1), not just check the pool at write time? | nothing in this plan | leave as a point-in-time check; it is pre-existing behaviour in both owners |
| **Q-S10** | Notify HR by email on a high-risk settings change (§13.3)? | nothing | no — the alert and history cover it without adding mail volume |

---

## 20. Production Readiness Checklist

### 20.1 Per-phase gates

**Phase 1**
- [ ] `src/modules/settings/` contains no foreign model require and no write call (`T-S1`)
- [ ] `T-S2` green for all **five** adapters (keys, ranges, defaults, nullability)
- [ ] `T-S3` proves registry 1–114 fully represented
- [ ] catalog deep-frozen; load-time invariants enforced; a malformed fixture throws (`T-S4`, `T-S7`)
- [ ] `admin`/`super-admin` get `403` everywhere (`T-S9`)
- [ ] `sensitive` keys absent from every response, every role (`T-S18`)
- [ ] manager projection returns only the five manager-behaviour keys (`T-S14`)
- [ ] partial-failure degradation and the all-fail `503` both covered (`T-S28`, `T-S29`)
- [ ] exactly one line changed in `src/app.js`; no other existing file modified
- [ ] full existing test suite green
- [ ] change record written

**Phase 2**
- [ ] unknown / watermark / non-mutable keys → `422` with the owner never called (`T-S16`, `T-S17`, `T-S37`)
- [ ] missing / stale `If-Match` → `400` / `412` with `current_etag` (`T-S33`, `T-S34`)
- [ ] high-risk without `confirm` or `reason` → `409` / `422`, no write (`T-S19`, `T-S20`)
- [ ] all five owner guard codes propagate unchanged (`T-S36`)
- [ ] **DEF-S7 fixed** — `FOR UPDATE` before the diff in `payroll_settings.service.update` (`T-S43`)
- [ ] **DEF-S8 fixed** — `validate()` attached to `PUT /documents/hr/settings`
- [ ] **DEF-S10 fixed** — `updateOrganizationProfile` reads the prior row under a lock, compares `If-Match` against it, and captures the before-state (`T-S63`). **Phase 3 is blocked until this is true**
- [ ] **DEF-S11 fixed** — one `valuesEqual()` comparator serves `non_default_keys`, the S-5 diff, the owner diff at `payroll_settings.service.js:99`, and `T-S2`'s default parity; no `!==` on a DECIMAL anywhere (`T-S59`, `T-S60`)
- [ ] **DEF-S12 covered** — `documents.branding` group live over the existing `replace()`; `changed` built from the re-read row, not the patch; no asset column writable; no storage key in any response (`T-S61`, `T-S64`)
- [ ] `api_registry.md` rows added (re-check the max endpoint number first — it was **#241** on 2026-10-09, so the block starts at #242) and `combined_api_analysis.md` sections written (§7.12)
- [ ] body bounds reject a pathological payload before the owner (`T-S44`)
- [ ] **every pre-existing payroll and document settings test passes unmodified**
- [ ] change record written, leading with `If-Match`

**Phase 3**
- [ ] migration `00073` reviewed against §6.2 and **handed back unrun** with the §17.5 checklist
- [ ] `modules/settings/models` added to `MODEL_ROOTS`
- [ ] recorder throws without a transaction (`T-S13`); repository exposes no update/destroy (`T-S10`)
- [ ] fan-out, merge order, stable cursor, `setting_key` filter, `source` attribution, `'null'::jsonb` (`T-S45`–`T-S49`)
- [ ] history on a history-less org returns `[]`
- [ ] change record states the §10.4 coverage gap explicitly

**Phase 4**
- [ ] every surface `endpoint` matches a registered route (`T-S53`)
- [ ] no readiness probe writes (`T-S11`)
- [ ] OFF settings report `not_applicable`; a throwing probe degrades to `blocked` (`T-S50`, `T-S51`)
- [ ] change record written

**Phase 5 (if built)**
- [ ] a transaction-bearing read bypasses the cache (`T-S23`)
- [ ] invalidation is post-commit (`T-S24`)
- [ ] Redis errors fail open on both read and invalidate (`T-S54`, `T-S55`)
- [ ] every existing document publish/sync test passes unmodified

### 20.2 Cross-cutting gates

- [ ] `orgId` sourced only from `req.user.orgId` — static scan plus a forged-body test (`T-S8`)
- [ ] no secret appears in any catalog entry, response, or log line
- [ ] no `reason` text in logs (audit row only)
- [ ] `x-request-id` threaded from controller → adapter → owner → audit row
- [ ] no new npm dependency
- [ ] no change to any existing table, column, type or constraint
- [ ] no cron job added
- [ ] no event bus added
- [ ] `db:migrate` / `db:seed` / DB connectivity **never** run from the development environment
- [ ] one dated `.md` change record per phase with an API surface, in `public/md_updates`

---

## 21. Final Architecture Recommendation

### 21.1 The recommendation

**Build the Settings module as a thin, read-mostly façade over the modules that already own the configuration. Do not build a settings store.**

Concretely:

1. **A catalog as a code asset**, not a table — 98 entries of authored metadata (group, store, type, default, range, risk, `effect_timing`, dependencies, preconditions, warnings), deep-frozen, validated at boot, and pinned to the owners' real validation by a build-breaking drift test.
2. **A gateway that dispatches and never decides.** Four adapters, one per store. Every write is the owning service's existing `update()`, inside the owning service's existing transaction, behind the owning service's existing guards. The gateway cannot write — not by policy, but because it imports no foreign model.
3. **One new table and nothing else.** `settings_change_logs` exists only to audit the one store that has no audit today (`organization_profiles`) and to give per-key attribution a durable home. Values stay in their typed, constrained, indexed columns.
4. **Group-scoped writes** so one request is one store, one owner, one transaction — which is what makes partial writes impossible without any distributed-transaction machinery.
5. **`If-Match` on every write,** compared under the owner's row lock.
6. **No events, no cron, no key-value table, no approval engine, no effective dating, no rollback endpoint, and no cache until measured.**

### 21.2 Why this, and not the obvious alternative

The tempting design is a `settings` table of `(org_id, key, value JSONB)` with a generic service in front of it. It fails on every axis that matters here:

* **It cannot enforce.** The registry's real rules are cross-field (#59 ⊕ #60), pool-dependent (≥ 2 HR), reference-checked (payout components must be active earning components), platform-capped, and snapshot-frozen. A generic validator cannot express them, so the enforcement would have to be re-implemented per key inside the "generic" service — at which point it is not generic, just relocated and duplicated.
* **It loses the database.** 60-odd typed columns with ENUMs, `NOT NULL`s, `CHECK`s and defaults become untyped JSONB. Every guarantee Postgres currently gives for free becomes application code that can be bypassed.
* **It breaks the frozen-snapshot model.** `payroll_runs.settings_snapshot`, frozen letter flags, frozen amounts and frozen `due_on` all depend on reading a stable, typed row.
* **It is a migration of five modules** to deliver nothing a caller can observe.

The design above delivers the user-visible outcome — one place to see and change every org setting, with audit, concurrency safety and a risk gate — while leaving 98 working enforcement points untouched.

### 21.3 Against the stated priorities

| Priority | How this design serves it |
|---|---|
| **Simple** | one new table, no new dependency, no cron, no events, no cache in the default plan. The largest artefact is a metadata file |
| **Correct** | every guard, constraint and freeze stays exactly where it already works; `T-S2` makes drift a build failure; `If-Match` under the lock closes lost updates |
| **Maintainable** | adding a setting is: add the column + Joi in the owning module (as today), add one catalog entry — and if you forget the catalog entry, CI tells you |
| **Secure** | five gates; allowlist by construction; secrets never enter the catalog; `admin`/`super-admin` have no reach; `orgId` from the token only |
| **Scalable** | four fixed, index-backed, `org_id`-scoped queries for a full settings read, independent of setting count — because settings are columns, not rows |

### 21.4 Minimum viable scope, if time is short

**Phases 1 and 2 alone are a complete, shippable product** with no migration and no operator dependency: HR can discover and change every writable setting through one surface, with concurrency safety and a confirmation gate, and every existing audit trail keeps working. Phase 3 (unified history), Phase 4 (surfaces + readiness) and Phase 5 (cache) are each independently valuable and independently deferrable.

### 21.5 The two things to get right

1. **`T-S2`, the drift test.** It is what makes a catalog-as-code design trustworthy for years instead of correct on the day it ships.
2. **§11.4** — if Phase 5 is ever built, a cached value must never be served to a read inside a write transaction. That one rule protects a race the document module already fixed once.

---

---

## 22. Review Log

### 22.1 Review of 2026-10-09 — six findings accepted, registry extended

An independent engineering review of this plan raised six points. All six were checked against code; all six were real,
and two were more serious than reported. The user's direction — *"we do not want to leave anything behind; if the setting
is not mentioned in the md file, understand what it is and first add that into the md file and then cover that setting in
the plan"* — resolved the one open question the plan had been deferring.

| Finding | Verdict | What changed |
|---|---|---|
| `document_letter_branding` (#104) is an **org singleton**, not a per-record surface | **Accepted — and it is the one finding that changed the architecture.** Confirmed `org_id` `unique: true` and a `getOrCreate`. **More favourable than reported:** its `replace()` is already PATCH semantics via `hasOwnProperty`, already takes the row lock, and already audits old→new — so it needs no new plumbing | DEF-S12; registry entry #104 reclassified; **fifth adapter** + `documents.branding` group (§5.1); silent-normalisation trap documented (§8.6); audit-shape asymmetry absorbed by the reader (§10.1); `T-S61`, `T-S62`, `T-S64` |
| `organization_profiles` has the same missing-lock flaw as DEF-S7 | **Accepted — and materially worse than reported.** `updateOrganizationProfileFields` is a blind `UPDATE`, so there is not only no lock but **no read of the prior row at all**. That makes it a **hard prerequisite for Phase 3**, since the audit recorder has no before-state to write | DEF-S10; §12.1 row; Phase 2 scope; **Phase 3 dependency**; `T-S63` |
| Postgres `DECIMAL` returns **strings**, so `value !== default` false-positives | **Accepted.** 19 DECIMAL columns (5 `payroll_settings`, 14 `statutory_configs`). It also exposed a **pre-existing defect**: `payroll_settings.service.js:99` already diffs with `!==` and can record a phantom change | DEF-S11; new §7.10a comparator with order-sensitive arrays and `null`≠`0`; `T-S59`, `T-S60` |
| `source` cannot be derived for existing audit rows | **Accepted.** Verified neither `payroll_audit_logs` nor `document_audit_logs` has a `source` column | `source` demoted to ledger-rows-only, reporting **`null`** rather than guessing `'module_api'`; the three alternatives and why each was rejected are recorded (§7.8); `T-S48` rewritten |
| Q-S1 (#99–#113) should not be left out | **Accepted, and superseded by the user's instruction.** The first pass also **miscounted** it as "17 entries #99–#113" (#99–#113 is 15; the set was always #97–#113) | **18 entries #97–#114 written into `org_settings_registry.md`**, which is now continuous 1–114; §2.5 rewritten as closed; Q-S1 and the 16.1 deferral marked resolved |
| `api_registry.md` and a per-module API doc are owed | **Accepted with two corrections.** The numbering is **#242–#250, not #240–#248** — the current maximum is **#241** (#240/#241 are the document bulk-request endpoints). And the per-module convention is **`combined_api_analysis.md`**; `api_documentation.md` exists nowhere in this repository. Neither `.agents/rules` file states the api_registry obligation explicitly, but all 241 endpoints are catalogued there, so the convention is real | new §7.12 with the endpoint block, the "re-check the max first" warning, and three documentation artefacts per phase instead of one |

### 22.2 One finding this review added that the external review did not

Entry **#114 (`shift_templates`)**. The first pass had enumerated #99–#113 by following the registry's own citations; a
second sweep that instead listed **every** `*.model.js` in the repository and classified each one found that shift
template definitions — name, type, start/end time, timezone, `is_overnight` — had no registry entry, despite #20
(auto-detect shift), #101 (rotations) and the grace/late thresholds (#13/#14/#16) all being *expressed in terms of them*.

The method matters more than the single miss: **following a document's own references can only confirm what it already
knows.** The completeness evidence in §2.5.3 is now written to be reproducible for exactly that reason, and its most
important result is the negative one — a scan for `org_id` + `unique: true` returns only `document_settings` and
`document_letter_branding`, so with #104 adapted, the singleton class (where a miss costs a whole unwritable settings
group) is closed.

### 22.3 Net effect on the architecture

The core design is unchanged: catalog-as-code, a gateway that cannot write, group-scoped single-store transactions, one
new table, no key-value store, no event bus. What changed is **one store count (4 → 5), one new group, three defect
fixes folded into Phase 2, one new hard dependency on Phase 3, and six new tests.** No phase was added, no phase was
reordered, and Phases 1+2 remain shippable with no migration.

---

*End of plan.*

