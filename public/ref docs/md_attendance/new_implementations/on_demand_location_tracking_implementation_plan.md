# On-Demand Employee Location Tracking — Senior Review & Implementation Plan

**Date:** 2026-10-23
**Reviewer:** Backend (principal) review of `on_demand_location_tracking_spec.md` + `2026-10-23_on_demand_location_tracking_frontend_guide.md`
**Status:** Plan — not implemented. Needs the Part 0 decisions answered before Phase 1 starts.
**Modules touched:** `src/modules/attendance` (feature), **new** `src/modules/notification` (push device registry + transport), `src/infrastructure/postgres-sql` (4 migrations), `src/cron-jobs` (1 sweeper)

---

## Part 0 — Executive summary

The spec is directionally right and the platform analysis (§3) is accurate: service workers genuinely cannot touch `navigator.geolocation`, and the FCM/APNs wake-up story is correct. The **client-side** design can be built roughly as written.

The **backend** design cannot. Twenty-six defects are catalogued in Part A. Six of them are blocking:

| # | Blocker | Why it stops the build |
| :-- | :-- | :-- |
| D-1 | Route paths `/api/v1/manager/...` and `/api/v1/hr/...` do not exist | There is no `/api/v1/manager` mount. Attendance actors live at `/api/v1/attendance/manager/*` and `/api/v1/attendance/hr/*`. |
| D-3 | FR-5 (WebSocket/SSE) is blocked by our own nginx and by our own auth | `proxy_buffering on`, `Connection ""` ("no WebSockets here"), gzip on JSON, and Bearer-only auth that `EventSource` cannot send. |
| D-5 | Ingest authorizes on `request_id` alone | Any employee holding a `request_id` can satisfy another employee's request. Nothing binds the request to the caller. |
| D-17 | FR-6 promises the *request* is logged in Postgres; the schema only logs the *response* | Timed-out and refused requests — exactly the abuse cases — would leave no record at all. |
| D-6 | No consent, no reason, no employee-visible record | Silent background location capture under DPDP 2023 needs notice + purpose. The "Zero New UI Screen" mandate cannot override a data-subject access right. |
| D-10 | `captured_at` and `is_mock` are both client-supplied and unvalidated | The one documented anti-spoof control is a boolean the spoofer sets. A replayed morning fix passes every check in the spec. |

Three decisions need your answer before Phase 1 (Part 0.2).

### 0.1 What this plan changes versus the spec

- **Real-time delivery to HR is short-poll. SSE and WebSocket are dropped outright**, not deferred — §B.9 sets out why push cannot serve that leg and why a client that is actively watching should poll.
- **One cron, not two.** Request expiry is derived on read rather than swept. Only the retention purge needs a scheduler (§B.9).
- **The push-device registry moves out of attendance into a new `src/modules/notification` module.** It is the first brick of the notification system you intend to build; location tracking is its first consumer, not its owner.
- **A request table is added** (`employee_location_requests`). Redis becomes a cache and a lock, never the source of truth.
- **An org policy row is added** (`attendance_location_policies`), modelled exactly on `attendance_device_policies`, with the feature **off by default** behind both an env kill switch and a per-org flag — same posture as device trust.
- **A mandatory `reason`, a cooldown, a daily cap, an employee-visible log, and a retention sweeper** are added. These are not gold-plating; without them this endpoint is a continuous covert-tracking tool with a 60-second refresh.

### 0.2 Decisions I need from you

1. ~~**FR-5 transport.**~~ **RESOLVED 2026-10-23 — short-poll.** SSE and WebSocket are out of the plan; see §B.9. No nginx change, no stream-token scheme, no Redis pub/sub bridge.
2. **Consent posture.** Three options: (a) notice-only — the informational push is the notice, no acknowledgement (fastest, weakest); (b) one-time acknowledgement — the employee accepts a location-tracking notice once, stored with a timestamp, before any request can target them; (c) per-request approval — defeats the Zero-UI mandate. The plan implements (b) as a policy mode with (a) selectable, defaulting to (b).
3. **Who can locate.** The spec says HR + manager. Our `managerRoles` arrays in attendance also include `admin`/`super-admin`, but the role-planes rule says platform roles get no tenant data. Locating a human being is the most tenant-private read in the product. **The plan excludes `admin`/`super-admin`** — confirm.

---

## Part A — Spec review

Defects are grouped by severity. "Spec" = `on_demand_location_tracking_spec.md`; "Guide" = the frontend guide.

### A.1 Blocking defects

**D-1 — The API paths do not exist in this codebase.**
Spec §6.1 and Guide §2.1 specify `POST /api/v1/manager/employee/:employeeId/locate` and `/api/v1/hr/employee/:employeeId/locate`. `src/app.js` mounts no `/api/v1/manager` or `/api/v1/hr`. The attendance module mounts actor sub-paths (`src/modules/attendance/attendance.index.js:11-17`), and members are addressed as `/team/member/:userId/...` for managers (`manager_attendance_read.routes.js:28-30`) and `/employees/:userId/...` for HR (`hr_attendance_read.routes.js:36-38`).

Corrected contract:
- `POST /api/v1/attendance/manager/team/member/:userId/locate`
- `POST /api/v1/attendance/hr/employees/:userId/locate`
- `POST /api/v1/attendance/locations/live-ping` — unchanged, mounts on `user_attendance.routes.js`

**D-3 — FR-5 cannot be delivered as WebSocket or SSE without ops changes and a new auth path.**
Four independent obstacles, all verified:
1. `nginx/production.hrclouds.backend.nginx.config` sets `proxy_buffering on` with an explicit comment that buffering stays on in production, plus `proxy_buffers 16 16k`. SSE frames would sit in the buffer.
2. The same file sets `proxy_set_header Connection ""` with the comment `# keepalive upstream; no WebSockets here`. A WebSocket upgrade will not pass.
3. `gzip_types ... application/json` — gzip buffering further defeats incremental flush.
4. `src/common/middlewares/auth.middleware.js` extracts the token from the `Authorization: Bearer` header only, with no cookie fallback. The browser `EventSource` API cannot set request headers. SSE would require either a short-lived stream token in the query string — which then lands in `/var/log/nginx/hrms_prod_access.log` in cleartext — or a cookie auth path that does not exist.

There is no socket.io, no `ws`, no `EventSource`, no `text/event-stream` anywhere in `src/`. This is greenfield infrastructure, not a wiring job.

**Recommendation:** `GET .../location-requests/:requestId` polled at 2 s for the 60 s window. 30 requests per locate, served from Redis, is nothing. It needs no nginx change, survives the move off `instances: 1` (`ecosystem.config.js`), and reuses Bearer auth unchanged. Phase 6 can add SSE at the same resource with no contract break.

**D-5 — The ingest endpoint has no authorization binding.**
Spec §6.2 processing step 2 is "Verify `request_id` exists in Redis". Nothing checks that the request was issued *for the authenticated caller*. Consequences: an employee who learns any live `request_id` (it is handed to their own device on every request they receive, and it appears in a URL query string on the web path) can post coordinates against someone else's request, closing it with the wrong person's position while the real target's later ping is rejected as already-consumed. Fix: store `{ org_id, user_id, expires_at }` in the Redis value and the request row, and assert `req.user.id === request.user_id && req.user.orgId === request.org_id` before anything else. Return `404`, not `403`, so the endpoint does not confirm that a foreign request id exists.

**D-17 — The audit requirement and the schema contradict each other.**
FR-6 says "Every location request, timestamp, requesting manager ID, employee ID, coordinates, accuracy, mock-location status permanently logged in PostgreSQL". §5.2 only defines a row written *when a ping arrives*. A request that times out, is rejected for `EMPLOYEE_NOT_CLOCKED_IN`, or is refused because no device is registered writes nothing. Those are the rows an employment tribunal will ask for. Redis holds the request state and Redis is evictable, restartable and not backed up. Fix: `employee_location_requests` is a Postgres table; Redis caches it.

**D-6 — No consent model, no reason, no employee-facing record, and the notification text is false.**
The informational notification reads *"HR has verified your current location"* and is posted **before** the GPS fix is taken (Spec §7.3, Guide §4). It should read "requested". Beyond wording:
- No `reason` is captured on the request. A reason field is both the audit record and the single most effective deterrent against casual use.
- No employee-facing read exists. Under DPDP 2023 (and GDPR Art. 15) the employee is entitled to know who accessed their location and when. The "Zero New UI Screen Mandate" (§1.1) is a product preference about the *approval* flow; it does not and cannot suppress an access right. The cost is one list endpoint and one list screen, not a modal in the punch path.
- No consent or notice acknowledgement is recorded anywhere.

**D-10 — `captured_at` is client-controlled and unvalidated; `is_mock` is self-reported.**
The entire anti-spoof story in §8 rests on `is_mock`, a boolean the client sends about itself. A patched APK, a rooted device, or anyone with `curl` and their own token sets it to `false` and posts yesterday's office coordinates with `captured_at` set to now. Server-side corroboration is mandatory, see §B.6.

### A.2 Significant defects

**D-2 — `user_devices` is the wrong name in the wrong module.**
Two device registries already exist and they are deliberately distinct: `attendance_devices` (biometric terminals) and `attendance_trusted_devices` (WebAuthn / device-key punch credentials — its model header explicitly warns about the name collision). A third, generic, user-owned registry called `user_devices` living inside attendance is a naming hazard and a layering mistake: push tokens are consumed by every future notification (task assigned, leave approved, payslip published), not by attendance. See §B.2 for the placement.

**D-4 — "clocked in today" is wrong for overnight shifts.**
Spec §6.1 pre-condition 3 says "open attendance session for today". The codebase's own truth is `clock.service._findOpenRecord` (`clock.service.js:251`), which looks back `OPEN_SHIFT_LOOKBACK_DAYS` and uses `recordRepository.findOpenRecordForUser` (`attendance_records.repository.js:111`). A night-shift employee clocked in at 22:00 yesterday is clocked in now and must be locatable. Reuse the repository method; do not write a `WHERE date = CURRENT_DATE` query.

**D-7 — No rate limiting, cooldown, or cap.**
Nothing in the spec stops a manager from firing this every 61 seconds for eight hours. That is continuous covert tracking assembled out of legal one-off requests, and it is the failure mode that turns a defensible feature into a liability. Required: per-(requester, target) cooldown, per-target daily cap, per-org hourly ceiling. `src/common/utilities/org_rate_limit.utils.js#checkOrgRate` already does the org tier.

**D-11 / D-12 / D-9 — Column constraints missing.**
`is_mock` has no corroboration (D-11, see §B.6). `battery_level SMALLINT` has no `CHECK (0..100)` (D-12). `accuracy_meters NOT NULL` is right, but iOS CoreLocation returns `-1` for an invalid horizontal accuracy and indoor web fixes can return five-figure metres; needs `CHECK (accuracy_meters > 0)` plus a Joi ceiling (D-9).

**D-8 — Coordinate precision diverges from the existing convention.**
Spec §5.2 uses `DECIMAL(10,7)` for both. `attendance_logs` uses `latitude DECIMAL(10,8)` / `longitude DECIMAL(11,8)` (`attendance_logs.model.js`). Match the existing table or distance comparisons between a punch coordinate and a live coordinate round differently.

**D-13 — The settings-catalog step is not applicable as written.**
Spec Phase 1.4 says "Update settings catalog surfaces attendance tracking permissions". `src/modules/settings/catalog/` contains payroll, statutory, document, branding, billing and task catalogs — **there is no attendance catalog**. Creating one pulls the whole attendance config surface into the T-S2 parity test in one go. Follow the `attendance_device_policies` precedent instead: a dedicated HR policy endpoint with `updated_at` as the If-Match token, plus an entry in `public/md_settings/org_settings_registry.md`. Decision recorded in §B.4.

**D-15 — `NO_ACTIVE_DEVICE_FOUND` as `404` is the wrong status.**
Guide §2.1 specifies `404`. The employee exists and the caller may read them; a precondition failed. Use `422` with code `NO_ACTIVE_DEVICE`, consistent with `EMPLOYEE_NOT_CLOCKED_IN`. `404` is reserved for "this user is not visible to you". The guide is the published contract, so this needs correcting there too.

**D-18 — Request coalescing loses the second requester's audit row.**
Spec §8 says the second caller "reuses active `request_id`". That is fine for the push, but it erases the fact that a *second* person asked. Fix: always insert the second request row, set `coalesced_into_request_id`, suppress the duplicate push, and let both rows resolve from the one ping.

**D-20 / D-21 — The push stack is over-specified and internally inconsistent.**
§3.2 and §4 imply direct APNs integration, but the client code in §7.3 and Guide §4 uses `@react-native-firebase/messaging` — which relays to APNs for you. Direct APNs is dead weight; **FCM HTTP v1 covers both Android and iOS**. Dependency position: `google-auth-library` is already in `package.json`, so FCM v1 needs **zero new dependencies**. Web Push does need one — RFC 8291 `aes128gcm` payload encryption is not something to hand-roll — so `web-push` is the single justified addition.

Separately, §1.1's claim that mobile executes "100% automatically" is contradicted by §3.2's own table: force-quit on iOS suppresses silent push entirely, and both OSes throttle. The API must therefore expose honest terminal states rather than implying success.

**D-25 — Target eligibility checks are missing.**
Three guards the spec omits: the target must be an active member (`user_roles.is_active` is the only tenant signal); the requester may not locate themselves; and a manager may not locate a global approver (the `field_location.service` precedent, and `hierarchy_access.utils` already filters these out of `getAccessibleUserIds`).

Also note the spec says a manager may locate "direct or indirect" reports (§6.1 pre-condition 2). `hierarchy_access.getAccessibleUserIds` resolves **direct reports only**, via `UserReportingMapping`. Changing that for this one endpoint would make location tracking broader than approval authority, which is backwards. Plan keeps direct-only.

**D-24 — "Permanent" retention is wrong for this data class.**
§5.2 calls `employee_location_logs` a permanent audit trail. Precise coordinates of a named person are sensitive personal data, and we already treat the comparable class — punch selfies — with a retention sweeper (`attendance_punch_photo_sweeper.cron`, migration 00080). Mirror it: policy-driven retention, default 90 days, with the non-coordinate audit fields on the request row kept longer.

### A.3 Minor defects and notes

- **D-14** No entitlement gate is mentioned. `attendance.geofencing` already exists (`seeders/004-seed-features.js:27`) and is granted from `growth_monthly` up. Reuse it; a new feature key would need a new seeder and a plan-feature backfill.
- **D-16** `clock.service` already throws `400 NOT_CLOCKED_IN` for the employee's own punch path. The new `422 EMPLOYEE_NOT_CLOCKED_IN` is a different actor on a different resource, so the divergence is intentional — flagged here so nobody "harmonises" them later.
- **D-19** The device-registration endpoint at `POST /api/v1/auth/devices/register` (Spec Phase 1.3) would read as a sibling of trusted-device registration at `/api/v1/attendance/trusted-devices/registration/*`. Two unrelated "register a device" flows under confusable paths. Moved to `/api/v1/notifications/devices`.
- **D-22** Guide §3/§4 read the token from `localStorage.getItem('token')`. Our auth is Bearer-only with a Redis blacklist (`auth.middleware.js:8-32`) — functionally fine, but worth stating that the service worker cannot read `localStorage` (it is not available in `ServiceWorkerGlobalScope`), so the token must reach the page context, never the worker. The guide's structure is correct on this; the note is for whoever edits it.
- **D-23** `client.url.includes('/dashboard')` means an employee sitting on `/attendance` gets no match and the worker calls `clients.openWindow`, which several browsers block outside a user gesture. Match on origin, not path.
- **D-26** The two existing per-module outboxes (`document_notifications`, `task_notifications`) have near-identical shape. The future notification module should generalise them — but **location requests must not go through an outbox**: `task_notification_dispatch.cron` runs every 60 s and the document one every 20 min, against a 60 s SLA. Location dispatches inline. Recorded in §B.2 so the eventual refactor does not swallow it.
- No `request_id` uniqueness guard exists at the database level in the spec — only the Redis key. Added as a partial unique index in §B.3.
- `push_token` has no unique constraint. FCM tokens follow the *device*, not the person; when a company phone is reassigned, the new employee's registration must take the token over or HR will push a location request to the previous holder. Added as `token_hash` + unique.

---

## Part B — Design

### B.1 Shape of the solution

```
src/modules/notification/            ← NEW, minimal, forward-compatible
  notification.index.js
  models/notification_devices.model.js
  repositories/notification_device.repository.js
  services/notification_device.service.js
  services/push_dispatch.service.js        ← fan-out + token invalidation
  transports/fcm.transport.js              ← FCM HTTP v1 (google-auth-library, no new dep)
  transports/webpush.transport.js          ← VAPID + aes128gcm (web-push, 1 new dep)
  controllers/ validators/ routes/

src/modules/attendance/
  models/employee_location_requests.model.js
  models/employee_location_logs.model.js
  models/attendance_location_policies.model.js
  repositories/location_request.repository.js
  repositories/location_log.repository.js
  services/location_tracking.service.js    ← request, ingest, status, history
  services/location_policy.service.js      ← HR policy read/write (If-Match)
  controllers/location_tracking.controller.js
  validators/location_tracking.validator.js
  routes/  → added to manager_attendance.routes, hr_attendance.routes, user_attendance.routes

src/cron-jobs/attendance_location_sweeper.cron.js   ← expire + retention
src/infrastructure/postgres-sql/migrations/
  00081-create-notification-devices.js
  00082-create-attendance-location-policies.js
  00083-create-employee-location-requests.js
  00084-create-employee-location-logs.js
```

### B.2 Why the device registry is its own module

Push tokens are addressed by *user*, not by *shift*. Every notification you build next — task assigned, leave approved, document acknowledgement due, payslip published — needs the same registry and the same transports. Building it inside attendance guarantees a later cross-module `require` into `modules/attendance` from `modules/leave`, which is exactly the trap the payslip branding work hit (resolved there by duplication rather than a cross-module require).

`src/modules/notification` is therefore created now with **only** what location tracking needs:

- `notification_devices` — the registry.
- `push_dispatch.service.js` — `dispatchToUser(orgId, userId, message, { timeoutMs })` returning `{ attempted, delivered, failed, invalidated }`.
- Two transports.

It deliberately does **not** yet contain: a notifications table, an outbox, preferences, in-app inbox, or templates. Those belong to the notification project proper. The one rule this plan fixes in place, so the later project does not break it:

> **On-demand location dispatch is synchronous.** It calls `push_dispatch.service` directly and awaits the result inside the request. It must never be routed through an outbox drained by cron — the fastest existing drain is 60 s and the SLA is 60 s end to end.

When the notification module grows an outbox, it wraps the same `push_dispatch.service`; location keeps its direct call.

### B.3 Database

All four migrations are **handed back unrun** — you run migrations, not me.

#### `notification_devices` (migration 00081)

| Column | Type | Notes |
| :-- | :-- | :-- |
| `id` | UUID PK | `gen_random_uuid()` |
| `org_id` | UUID NOT NULL | FK `organizations(id)` |
| `user_id` | UUID NOT NULL | FK `users(id)` |
| `platform` | VARCHAR(10) NOT NULL | `android` / `ios` / `web`; CHECK constraint, not an ENUM type — matches `attendance_trusted_devices.platform` |
| `push_token` | TEXT NOT NULL | FCM registration token, or the Web Push subscription serialised as JSON |
| `token_hash` | CHAR(64) NOT NULL | sha256 of `push_token`; **UNIQUE** |
| `device_name` | VARCHAR(100) NULL | |
| `app_version` | VARCHAR(50) NULL | |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `failure_count` | SMALLINT NOT NULL DEFAULT 0 | consecutive dispatch failures |
| `last_seen_at` | TIMESTAMPTZ NULL | |
| `last_push_at` | TIMESTAMPTZ NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL | |

Indexes: `UNIQUE(token_hash)`; `(org_id, user_id, is_active)`.

`token_hash` rather than a unique index on `push_token` for two reasons: a Web Push subscription JSON plus a long FCM token approaches Postgres's 2704-byte btree key limit, and a fixed-width hash keeps the index small. **Uniqueness is global, not per-org**: one physical device is one row. Re-registering an existing `token_hash` under a different `user_id` *reassigns* the row and resets `failure_count` — that is the reassigned-company-phone case, and getting it wrong means pushing a location request to the wrong person.

#### `attendance_location_policies` (migration 00082) — one row per org

Modelled on `attendance_device_policies` (same rationale: an org security posture, not a shift attribute; `updated_at` is the If-Match token).

| Column | Type | Default | Notes |
| :-- | :-- | :-- | :-- |
| `org_id` | UUID PK | | FK `organizations(id)` |
| `enabled` | BOOLEAN NOT NULL | `false` | **Per-org kill switch, off by default** |
| `consent_mode` | VARCHAR(20) NOT NULL | `acknowledgement` | `notice_only` / `acknowledgement` |
| `allowed_requester_roles` | JSONB NOT NULL | `["hr","manager"]` | |
| `require_clocked_in` | BOOLEAN NOT NULL | `true` | Turning this off is a high-risk change; logged |
| `require_reason` | BOOLEAN NOT NULL | `true` | |
| `notify_employee` | BOOLEAN NOT NULL | `true` | Suppressing the transparency notification is logged loudly |
| `request_ttl_seconds` | SMALLINT NOT NULL | `60` | 30–300 |
| `cooldown_seconds` | SMALLINT NOT NULL | `300` | per (requester, target) |
| `max_requests_per_employee_per_day` | SMALLINT NOT NULL | `6` | 1–50 |
| `log_retention_days` | SMALLINT NOT NULL | `90` | 7–730 |
| `updated_by` | UUID NULL | | |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL | | |

#### `employee_location_requests` (migration 00083)

| Column | Type | Notes |
| :-- | :-- | :-- |
| `id` | UUID PK | this **is** the `request_id` the clients see |
| `org_id` | UUID NOT NULL | FK |
| `user_id` | UUID NOT NULL | target employee, FK `users(id)` |
| `requested_by` | UUID NOT NULL | FK `users(id)` |
| `requester_role` | VARCHAR(20) NOT NULL | role at request time, frozen |
| `reason` | VARCHAR(255) NULL | NOT NULL in effect when `require_reason` |
| `record_id` | UUID NULL | FK `attendance_records(id)` — the open shift this was taken against |
| `status` | VARCHAR(20) NOT NULL | `dispatched` / `reported` / `failed`. **`timed_out` is never stored** — it is derived on read from `status = 'dispatched' AND expires_at < now()` (§B.9). One resolver, used by the poll endpoint and every history read. |
| `failure_reason` | VARCHAR(50) NULL | `push_dispatch_failed` / `permission_denied` / `device_unreachable` |
| `dispatched_device_count` | SMALLINT NOT NULL DEFAULT 0 | |
| `coalesced_into_request_id` | UUID NULL | self-FK; set when the push was suppressed as a duplicate |
| `expires_at` | TIMESTAMPTZ NOT NULL | |
| `responded_at` | TIMESTAMPTZ NULL | |
| `response_log_id` | UUID NULL | FK `employee_location_logs(id)`, added in 00084 |
| `ip_address` | VARCHAR(45) NULL | requester's |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL | |

Indexes: `(org_id, user_id, created_at DESC)`; `(org_id, requested_by, created_at DESC)`. No index on `expires_at` — the earlier draft had a partial one to feed an expiry sweeper, and that sweeper is gone (§B.9).

`response_log_id` is added as a `FOREIGN KEY` in 00084, after the logs table exists.

#### `employee_location_logs` (migration 00084)

| Column | Type | Notes |
| :-- | :-- | :-- |
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL | FK |
| `user_id` | UUID NOT NULL | FK |
| `request_id` | UUID NULL | FK `employee_location_requests(id)`; NULL reserved for future heartbeat sources |
| `requested_by` | UUID NULL | denormalised for the history read |
| `source` | VARCHAR(20) NOT NULL | `on_demand` today; `heartbeat` / `punch` reserved |
| `latitude` | DECIMAL(10,8) NOT NULL | matches `attendance_logs` |
| `longitude` | DECIMAL(11,8) NOT NULL | matches `attendance_logs` |
| `accuracy_meters` | DECIMAL(8,2) NOT NULL | CHECK `> 0` |
| `is_mock` | BOOLEAN NOT NULL DEFAULT false | client-reported, see §B.6 |
| `spoof_signals` | JSONB NULL | server-derived; NULL when clean |
| `battery_level` | SMALLINT NULL | CHECK `BETWEEN 0 AND 100` |
| `platform` | VARCHAR(10) NULL | reported by the responding client |
| `notification_device_id` | UUID NULL | FK `notification_devices(id)` ON DELETE SET NULL |
| `in_bounds` | BOOLEAN NULL | NULL = could not be evaluated (no locations configured) |
| `nearest_location_id` | UUID NULL | FK `organization_locations(id)` |
| `distance_meters` | DECIMAL(10,2) NULL | |
| `captured_at` | TIMESTAMPTZ NOT NULL | device clock |
| `received_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | server clock |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Indexes: `UNIQUE(request_id) WHERE request_id IS NOT NULL` — **this, not Redis, is the single-use guarantee**; `(org_id, user_id, captured_at DESC)`; partial `(captured_at)` where `request_id IS NOT NULL` for the retention sweeper.

The geofence columns reuse `src/common/utilities/geofence.utils.js#calculateDistance` / `isWithinGeofence` and the employee's `employee_field_assignments` + org locations. They are what makes FR-2.1 ("validate geofenced attendance authenticity") answerable without a second round trip.

### B.4 Settings placement — the explicit decision

**No settings-catalog entry.** The `attendance_device_policies` precedent governs: a dedicated HR endpoint pair with `updated_at` as the If-Match token. Reasons:

1. There is no `attendance.catalog.js`. Creating one brings every attendance setting under the T-S2 drift test at once — a large, unrelated piece of work with its own migration and test surface.
2. The settings gateway runs the owning module's Joi schema with `noDefaults`; a policy table with 13 columns and an off-by-default kill switch is exactly the shape the device-trust policy already solves outside the catalog.

Instead: a row in `public/md_settings/org_settings_registry.md` recording the eleven new org-configurable decisions, and `GET` / `PUT /api/v1/attendance/hr/location-policy` using `src/common/utilities/if_match.utils.js`. If attendance is later brought into the catalog, this table joins it with the rest.

### B.5 Request flow — corrected

```
POST /api/v1/attendance/manager/team/member/:userId/locate
POST /api/v1/attendance/hr/employees/:userId/locate
body: { reason: string(10..255) }     ← required when policy.require_reason
```

1. `authenticate` → `authorize(['manager','hr'])` → `requireFeature('attendance.geofencing')`.
   `admin` / `super-admin` excluded (Part 0.2 decision 3).
2. Env kill switch `ATTENDANCE_LOCATION_TRACKING_ENABLED`; off → `503 FEATURE_DISABLED`.
3. Policy load; `enabled = false` → `403 LOCATION_TRACKING_DISABLED`. Caller's role must be in `allowed_requester_roles`.
4. Scope: `hierarchyAccess.getAccessibleUserIds(orgId, req.user)` → `null` means org-wide (HR), otherwise the direct-report list. Target not in scope → `404`. Target is self → `422 CANNOT_LOCATE_SELF`.
5. Target must be an active member (`user_roles.is_active`, not soft-deleted) → else `404`.
6. Consent: `consent_mode = 'acknowledgement'` and the target has no acknowledgement row → `422 EMPLOYEE_CONSENT_PENDING`, with `details.acknowledgement_required = true` so HR can prompt them.
7. Rate gates, in order, cheapest first:
   - per-pair cooldown `SET loc_cool:<org>:<requester>:<target> NX EX cooldown_seconds` → on failure `429 LOCATE_COOLDOWN` + `Retry-After`;
   - per-target daily cap, Redis counter keyed to the org's business date → `429 LOCATE_DAILY_CAP_REACHED`;
   - `checkOrgRate(orgId, 'locate', ATTENDANCE_LOCATION_RATE_PER_HOUR, { keyPrefix: 'attn', withRetryAfter: true })`.
8. Shift gate (when `require_clocked_in`): `recordRepository.findOpenRecordForUser(orgId, userId, today-1, today)` → none → `422 EMPLOYEE_NOT_CLOCKED_IN`. Capture `record_id`.
9. Devices: active `notification_devices` for the user → none → `422 NO_ACTIVE_DEVICE` (**not 404**, D-15).
10. Coalescing: an existing `dispatched` request for this target that has not expired → insert this request row with `coalesced_into_request_id` set, skip the push, return the **new** `request_id` (the caller polls their own row; the sweep in step 14 resolves both).
11. **Transaction:** insert the request row (`status = 'dispatched'`, `expires_at = now + request_ttl_seconds`) and the `attendance_audit_logs` row (`entity_type = 'location_request'`, `action = 'locate_requested'`, `reason`). Commit. *No push inside the transaction* — an external call must never hold a database transaction open.
12. Redis cache `loc_req:<request_id>` = `{ org_id, user_id, expires_at }`, `EX request_ttl_seconds + 30`. Cache only; step 15's ingest still reads the row.
13. `pushDispatch.dispatchToUser(...)` with `PUSH_DISPATCH_TIMEOUT_MS`. All devices fail → `UPDATE` row to `status = 'failed'`, `failure_reason = 'push_dispatch_failed'`.
14. Last-known: Redis `user_last_loc:<user_id>`, falling back to the newest `employee_location_logs` row for the user. Returned with `recorded_at` and an `is_stale` flag.
15. `200` with `{ request_id, status: 'dispatched' | 'failed', timeout_seconds, last_known_location }`.

```
POST /api/v1/attendance/locations/live-ping     (employee)
```

1. `authenticate`; feature + env gates.
2. Joi via `validateOrThrow`: `request_id` uuid required; `latitude` -90..90; `longitude` -180..180; `accuracy_meters` > 0 and <= 100000; `is_mock` boolean default false; `battery_level` 0..100 optional; `captured_at` ISO required; `platform` optional enum.
3. **Transaction, `SELECT ... FOR UPDATE`** on the request row. Missing, or `org_id`/`user_id` mismatch → `404 LOCATION_REQUEST_NOT_FOUND` (D-5; 404 rather than 403 so the endpoint does not confirm foreign ids).
4. `status = 'reported'` already → return `200` with the stored result (idempotent retry, the mobile client will retry on a flaky network). `expires_at < now` or `status` terminal → `409 LOCATION_REQUEST_EXPIRED`.
5. Derive spoof signals (§B.6) and geofence columns.
6. Insert the log row; update the request to `reported`, `responded_at`, `response_log_id`; resolve any rows pointing at it via `coalesced_into_request_id` to the same log. If `is_mock` or any spoof signal fired, insert an `attendance_anomalies` row (`type = 'location_spoof_suspected'`, `record_id` from the request, `severity = 'high'`) **in the same transaction**. Commit.
7. After commit: `SET user_last_loc:<user_id> EX 86400`; `DEL loc_req:<request_id>`.
8. `200 { logged: true }`.

The unique index on `request_id` means two concurrent pings for the same request cannot both land, even if the `FOR UPDATE` lock is somehow bypassed — the second one fails the constraint and is translated to the idempotent `200`.

```
GET /api/v1/attendance/manager/location-requests/:requestId      (poll, 2 s)
GET /api/v1/attendance/hr/location-requests/:requestId
```
Returns `{ status, expires_at, location: {...} | null, spoof_flagged }`. Visible to the original requester, and to any HR in the org. Served from Redis when the request is still live, from Postgres once terminal. `status` is one of `dispatched | reported | timed_out | failed` — the honest set D-21 asks for.

```
GET /api/v1/attendance/manager/team/member/:userId/location-history
GET /api/v1/attendance/hr/employees/:userId/location-history
GET /api/v1/attendance/locations/mine                             ← employee's own (D-6)
```
`/locations/mine` returns who located them, when, why, and whether a fix was returned. No new screen is needed in the punch flow; it is a list.

### B.6 Anti-spoofing — what is actually enforceable

`is_mock` is a client self-report and must be documented as a *signal*, not a control. Server-side corroboration, all cheap, all computed in the ingest transaction, written to `spoof_signals`:

| Signal | Test | Why it works |
| :-- | :-- | :-- |
| `stale_fix` | `captured_at` outside `[request.created_at - CLOCK_SKEW, now + CLOCK_SKEW]` | Catches a replayed earlier fix — the simplest spoof, and the one the spec misses entirely |
| `future_fix` | `captured_at > now + CLOCK_SKEW` | Device clock tampering |
| `implausible_speed` | distance from the user's previous fix ÷ elapsed > `LOCATION_MAX_PLAUSIBLE_SPEED_KMPH` | Teleporting between fixes |
| `suspicious_accuracy` | `accuracy_meters` < 1 m, or exactly equal across consecutive fixes | Fake-GPS apps emit constant, implausibly perfect accuracy |
| `duplicate_coordinates` | coordinates identical to the previous fix to 7 decimal places | Real GPS never repeats exactly |
| `client_mock_flag` | the client's own `is_mock` | Honest clients only |

A flagged ping is **stored and returned**, never rejected — rejecting hands the spoofer a way to force a "device unreachable" verdict, which is a better outcome for them than being flagged. The anomaly row is what HR acts on.

### B.7 Push transports

**FCM HTTP v1** (Android + iOS, via `@react-native-firebase` on the client):
- OAuth2 via `google-auth-library`, already a dependency. Service-account JSON from env, token cached in-process with its expiry.
- `POST https://fcm.googleapis.com/v1/projects/{PROJECT_ID}/messages:send`
- Android: `android.priority = "high"`, `data`-only message so the background handler fires. `data: { action: "REQUEST_LOCATION", requestId, expiresAt }`.
- iOS: `apns.payload.aps["content-available"] = 1`, `apns.headers["apns-priority"] = "5"` (Apple rejects `10` on background pushes).
- `UNREGISTERED` / `INVALID_ARGUMENT` on the token → set `is_active = false` on that device row immediately. This is the only way the registry stays clean.

**Web Push** (VAPID, `web-push` — the one new dependency):
- RFC 8291 `aes128gcm` encryption is not safe to hand-roll; this is the justification.
- `410 Gone` / `404` from the push service → deactivate the device row.

`push_dispatch.service.dispatchToUser` fans out to every active device for the user in parallel, bounded by `PUSH_DISPATCH_TIMEOUT_MS`, and returns `{ attempted, delivered, failed, invalidated }`. Partial success counts as dispatched.

### B.8 Environment variables

All added to `.env.example` with defaults and explanation, per project rule. Boot assertion mirroring `assertDeviceTrustConfigured`: with `ATTENDANCE_LOCATION_TRACKING_ENABLED=true`, FCM and VAPID config must be present or the process refuses to start.

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `ATTENDANCE_LOCATION_TRACKING_ENABLED` | `false` | Global kill switch, checked before any DB read |
| `LOCATION_REQUEST_TTL_SECONDS` | `60` | Fallback when no org policy row exists |
| `LOCATION_LOG_RETENTION_DAYS` | `90` | Fallback retention |
| `LOCATION_MAX_PLAUSIBLE_SPEED_KMPH` | `1200` | `implausible_speed` threshold |
| `LOCATION_CLOCK_SKEW_SECONDS` | `120` | `stale_fix` / `future_fix` tolerance |
| `ATTENDANCE_LOCATION_RATE_PER_HOUR` | `60` | Per-org ceiling on locate requests |
| `PUSH_FCM_PROJECT_ID` | — | FCM v1 project |
| `PUSH_FCM_SERVICE_ACCOUNT_JSON` | — | Service-account JSON (inline or path) |
| `PUSH_WEBPUSH_VAPID_PUBLIC_KEY` | — | |
| `PUSH_WEBPUSH_VAPID_PRIVATE_KEY` | — | |
| `PUSH_WEBPUSH_SUBJECT` | — | `mailto:` or https URL, required by VAPID |
| `PUSH_DISPATCH_TIMEOUT_MS` | `5000` | Hard bound on the inline dispatch |

### B.9 What push covers, and what it does not

Push notifications carry **one** of the three legs in this feature. Conflating them is how the spec ended up specifying WebSockets.

| Leg | Direction | Mechanism | Why |
| :-- | :-- | :-- | :-- |
| 1. Wake the employee | backend → employee device | **Push (FCM / Web Push)** | The employee is not looking at anything. The device may be asleep, the app backgrounded, the browser tab closed. Only push can reach it. |
| 2. Report the fix | employee device → backend | **Plain HTTPS POST** | `live-ping`. Nothing exotic. |
| 3. Tell HR the answer arrived | backend → HR browser | **Short-poll** | HR is staring at a spinner. |

**Why leg 3 is not push.** It could be — HR's browser can hold a Web Push subscription like anyone else's. It should not be:

- Push is for reaching a client that **is not watching**. HR clicked a button four seconds ago and is watching. The tool is mismatched to the situation.
- Delivery latency through FCM / Mozilla autopush / Apple's Web Push service is not bounded. 10–60 s is routine and minutes happen. Against a 60 s request window, a late push is indistinguishable from failure.
- It would require HR to grant notification permission, hold a `notification_devices` row, and run a service worker that `postMessage`s the open tab — the entire employee-side client stack, rebuilt on the HR side, to answer a question HR asked synchronously.

**Why leg 3 is not SSE either.** See D-3: our nginx buffers, refuses upgrades and gzips JSON, and `EventSource` cannot send the Bearer header our auth requires. Every one of those is solvable, and none of them is worth solving for a 60-second wait.

**Why polling costs effectively nothing here.** `GET /location-requests/:requestId` at 2 s over a 60 s window is 30 requests, each a single Redis `GET` while the request is live. The endpoint has to exist regardless — it is the same resource the history read and the timeout UI need. Polling is not infrastructure we are adding; it is a GET we already owe.

**Why there is still a cron, and only one.** Two jobs were originally proposed; one was unnecessary.

- *Expiring `dispatched` → `timed_out`* — **dropped.** It is derivable: a request is timed out when `status = 'dispatched' AND expires_at < now()`. Every read computes it. Correctness never depended on the flip, because the late-ping rejection in §B.5 step 4 compares `expires_at` to the clock, not to the stored status. Dropping the sweep also drops the partial index that existed only to feed it.
- *Retention purge* — **irreducible.** Deleting coordinates 90 days after capture has no triggering request. No user action, no API call, no login will ever cause it. Something has to run on a schedule with nobody asking, which is the definition of a cron. This is the same reason `attendance_punch_photo_sweeper.cron` exists for punch selfies.

### B.10 How HR learns the result

§B.9 establishes that HR is not pushed to. That assumed HR is watching. They may not be, so the full answer has three cases — and only the third needs the notification system.

| Case | How HR finds out | Needs building |
| :-- | :-- | :-- |
| Still on the screen (the normal case — they clicked seconds ago) | Poll resolves within 2 s of arrival | Phase 3 |
| Navigated away, returns later | The result is **durable state, not an event**. The employee's attendance view renders `Last located: 14 min ago (±8 m) by you — "<reason>"` from the newest log row. | Phase 4 read |
| Wants an active nudge while elsewhere in the app | In-app notification via the notification module | **Blocked — see below** |

The second row is the important one and it is why leg 3 never needed push. A location fix is not a chat message: it lands in `employee_location_logs` and stays there. There is no window during which it can be *missed*, only a window during which it is not yet *noticed*. The cost of not noticing is that HR looks at the employee's page a minute later and sees the answer.

**The third row is blocked on work that does not exist yet.** There is no in-app notification surface anywhere in the product today — `task_notifications` and `document_notifications` are both email-only outboxes drained by cron. An *email* here would be actively wrong: HR clicked a button forty seconds ago and does not want mail about it.

So this feature does not build it. It emits the event and stops:

> On transition to `reported`, `location_tracking.service` emits `location.reported` with `{ org_id, recipient_id: requested_by, target_user_id, request_id, spoof_flagged }`. Until the notification module exists this is a no-op seam — a single call behind a feature check, with a unit test asserting it fires exactly once per request and never for a coalesced duplicate. When the module lands, it subscribes; nothing in attendance changes.

Note the asymmetry the notification project must preserve: the **outbound wake** to the employee is synchronous and must never enter an outbox (60 s SLA, §B.2), while this **inbound "it arrived"** is low-urgency and belongs in the outbox like every other notification. Same feature, two opposite delivery requirements.

**Already covered with no new work:** a ping that comes back with `is_mock` or any spoof signal writes an `attendance_anomalies` row, which surfaces at `GET /api/v1/attendance/manager/team/anomalies` — org-wide for HR, because `getAccessibleUserIds` returns `null` for the `hr` role. That is the one outcome genuinely worth chasing HR about, and it already lands in a list they review.

**Open question — bulk locate.** If HR is expected to locate a whole field team at once, a per-request poll becomes N polls. The fix is to make the poll endpoint `GET /api/v1/attendance/{manager,hr}/location-requests?status=live`, returning every in-flight request the caller owns — one poll regardless of how many are outstanding, and identical cost when there is only one. Confirm whether bulk locate is in scope; if it is, this replaces the per-id poll in §B.5 rather than adding to it.

---

## Part C — Phases

Each phase states its verification. Nothing in Phases 1–5 requires an infrastructure change beyond the migrations, which are handed back unrun.

### Phase 0 — Decisions and ops prerequisites (you)

- [ ] Answer the three Part 0.2 decisions.
- [ ] Create the Firebase project; produce a service-account key with the Cloud Messaging scope.
- [ ] Generate a VAPID key pair (`npx web-push generate-vapid-keys`).
- [ ] Confirm whether the mobile app is in fact `@react-native-firebase`-based (this decides that APNs-direct stays out of scope).
- [ ] Confirm the legal posture for `consent_mode` in your target jurisdictions.

**Verify:** credentials present in the environment; decisions recorded in this document.

### Phase 1 — Notification module: device registry + push transports

1.1 Migration `00081-create-notification-devices.js` (handed back unrun).
1.2 Model, repository, `notification_device.service.js` with upsert-by-`token_hash` including the cross-user reassignment path.
1.3 `fcm.transport.js` (google-auth-library, token caching) and `webpush.transport.js` (`web-push`).
1.4 `push_dispatch.service.js` with the timeout bound and token invalidation.
1.5 Routes: `POST /api/v1/notifications/devices`, `GET /api/v1/notifications/devices`, `DELETE /api/v1/notifications/devices/:id`. Mounted in `app.js`.
1.6 `.env.example` entries; boot assertion.

**Verify:** unit tests for upsert reassignment, invalid-token deactivation, platform validation, cross-org isolation, and the dispatch fan-out result shape (transports stubbed). `npm test` green.

### Phase 2 — Location policy + schema

2.1 Migrations `00082`, `00083`, `00084` (handed back unrun).
2.2 Three models + two repositories, registered in `models.index`.
2.3 `location_policy.service.js`; `GET` / `PUT /api/v1/attendance/hr/location-policy` with If-Match via `if_match.utils`.
2.4 Entry in `public/md_settings/org_settings_registry.md`.

**Verify:** unit tests for policy defaults, If-Match 412 on a stale token, range validation on every numeric column, and a model-shape test asserting the migration and the model agree (the `device_trust_model_shape.test.js` pattern).

### Phase 3 — Core request + ingest

3.1 `location_tracking.service.js` — the two flows in §B.5 exactly.
3.2 Controller, Joi validators, routes on the manager / HR / user routers.
3.3 Spoof-signal derivation (§B.6) and the anomaly write.
3.4 Geofence columns via the existing `geofence.utils`.
3.5 `GET .../location-requests/:requestId` poll endpoint (or the `?status=live` list form, if bulk locate is in scope — §B.10).
3.6 `location.reported` event emission — the no-op seam the notification module will later subscribe to (§B.10).

**Verify:** unit tests — manager cannot locate a non-report (404); HR org-wide; self-locate 422; deactivated target 404; not-clocked-in 422 **including the overnight-shift case that must succeed**; no device 422; cooldown 429 with Retry-After; daily cap 429; ingest with a foreign `request_id` 404; ingest after expiry 409; double ingest idempotent 200; each of the six spoof signals; anomaly row written exactly once; audit row written on every request including the rejected ones; push never dispatched inside a transaction.

### Phase 4 — History reads

4.1 Manager / HR member location history, paginated, with the spoof flags.
4.2 `GET /api/v1/attendance/locations/mine`.
4.3 Consent acknowledgement endpoint (when `consent_mode = 'acknowledgement'`).

**Verify:** scoping tests mirroring Phase 3; self-read returns requester identity and reason; pagination contract matches the module's existing list shape.

### Phase 5 — Retention sweeper

The only scheduled work in the feature (§B.9).

5.1 `attendance_location_sweeper.cron.js`: purge `employee_location_logs` rows past the org's `log_retention_days`. **Coordinates only** — the `employee_location_requests` row survives, so "who asked to locate this person, when, and why" stays answerable after the position itself is gone. Registered in `server.js` beside the punch-photo sweeper, on the same daily IST slot pattern.

**Verify:** unit tests on the selection predicate with a frozen clock; per-org retention respected; request rows untouched; idempotent across repeated passes.

### Phase 6 — Documentation

6.1 Dated change record in `public/md_updates/` (new APIs, corrected paths, corrected status codes).
6.2 Update `ATTENDANCE_API_CONTRACT.md` — it is the authoritative attendance contract.
6.3 Rewrite the two source documents per Part E.
6.4 Rollout runbook, in the shape of `device_trust_rollout_runbook.md`.

---

## Part D — Residual risks after full implementation

1. **A determined employee can still defeat this.** A rooted device with a patched client reports whatever it likes, and the server can only test plausibility. The honest claim is "raises the cost and leaves a trail", not "verified location". Do not let the UI say "Verified Live" (Guide §5 currently does) — say "Reported".
2. **iOS force-quit is unfixable.** Apple will not deliver silent push to an app the user swiped away. Those requests will time out, and HR must be told it means "unreachable", not "evading".
3. **Battery-optimised Android OEMs** (Samsung, Xiaomi, OnePlus) kill background receivers. Expect a materially lower delivery rate on those devices than on stock Android.
4. **Legal exposure is jurisdictional and not solved by code.** The policy row, the reason, the acknowledgement and the employee-visible log make the feature defensible; they do not make it lawful everywhere. Works-council consultation is required in parts of the EU before this is switched on.
5. **Cost of accuracy.** `enableHighAccuracy: true` with a 60 s window drains battery noticeably if HR uses this heavily. The daily cap is the mitigation.
6. **Redis loss during a live request** degrades to a Postgres read on ingest — correct, just slower. Redis loss during *dispatch* loses the cooldown key, so a burst could slip through. Acceptable; the daily cap is enforced on the request table as a backstop.

---

## Part E — Corrections needed in the two source documents

These are the edits I would make once the plan is agreed. Listed rather than applied, because the frontend guide is a published contract and these change what the frontend team builds.

**`on_demand_location_tracking_spec.md`**
1. §6.1 / §6.2 / §9 — replace every route with the corrected paths (D-1).
2. §1.1 — soften "100% automatically" to match §3.2's own caveats (D-21).
3. §1.3 / §8 — "rejected if employee not actively clocked in **or on approved leave**" is ambiguous and reads backwards; state the rule as a single predicate.
4. §5.1 — rename `user_devices` → `notification_devices`, relocate to the notification module, add `token_hash` UNIQUE (D-2, D-26).
5. §5.2 — coordinate precision to `(10,8)` / `(11,8)`; add CHECK constraints; add the geofence, spoof-signal and platform columns; strike "permanent" and point at the retention policy (D-8, D-9, D-12, D-24).
6. §5 — add `employee_location_requests` and `attendance_location_policies` (D-17).
7. §6.1 — add `reason` to the request body; add the consent, cooldown, cap and self-locate pre-conditions; change the clocked-in check to the overnight-safe lookup (D-4, D-6, D-7, D-25).
8. §6.2 — add the caller-binding check as processing step 1 (D-5); add `captured_at` validation (D-10).
9. §4 sequence diagram — replace the SSE leg with the poll leg; move the Postgres insert before the Redis publish.
10. §8 — add rows for request coalescing losing an audit row, Redis unavailability, and clock tampering.
11. §9 Phase 1.4 — strike the settings-catalog step; replace with the policy endpoint + registry entry (D-13).
12. The document has suffered text corruption in several places — §2.2, §3.2, §5.2 and §7.2 contain mangled and partially deleted sentences (for example `` `requested_by` UUID FK NULL Manager/HR (NULL ENUM DECIMAL(10, 7) ...`` in the §5.2 table, and the §7.2 code block with its arrow functions and `try`/`catch` braces stripped). Those sections need rewriting from intent, not patching.

**`2026-10-23_on_demand_location_tracking_frontend_guide.md`**
1. §2.1 — corrected paths; add `reason` to the request body; add the full error table (`403 LOCATION_TRACKING_DISABLED`, `422 EMPLOYEE_NOT_CLOCKED_IN`, `422 NO_ACTIVE_DEVICE`, `422 EMPLOYEE_CONSENT_PENDING`, `422 CANNOT_LOCATE_SELF`, `429 LOCATE_COOLDOWN`, `429 LOCATE_DAILY_CAP_REACHED`, `503 FEATURE_DISABLED`).
2. §2.1 — `NO_ACTIVE_DEVICE_FOUND` is `422`, not `404` (D-15).
3. §2 — add the device-registration contract (`POST /api/v1/notifications/devices`), which the guide omits entirely even though nothing works without it.
4. §2 — add the poll endpoint and document the four terminal states.
5. §3 — the service worker must match on origin, not `/dashboard` (D-23); add the `PERMISSION_DENIED` reporting path, which §8 of the spec promises and the guide never implements.
6. §4 — the notification body must say "requested", not "verified" (D-6).
7. §5 — "Verified Live" → "Reported"; add the stale-fix and spoof-flag badges.
8. §5 — replace the WebSocket/SSE subscription step with the poll loop.

---

## Appendix — estimated size

| Phase | Files | New tests |
| :-- | :-- | :-- |
| 1 — notification module | ~11 new, 2 edited | ~14 |
| 2 — policy + schema | ~9 new, 2 edited | ~10 |
| 3 — core flows | ~5 new, 4 edited | ~28 |
| 4 — history reads | ~2 new, 4 edited | ~10 |
| 5 — retention sweeper | 1 new, 1 edited | ~4 |
| 6 — docs | 3 new, 3 edited | — |

Four migrations, one new runtime dependency (`web-push`), one new module, one new cron. No streaming infrastructure and no nginx change.
