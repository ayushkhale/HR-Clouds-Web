# Database Architecture

## Overview
The system uses PostgreSQL, managed by Sequelize ORM.

## Multi-Tenancy Strategy
The database uses a **Row-Level Tenancy** model. Almost every operational table includes an `org_id` column which acts as the foreign key back to the `organizations` table.
- When querying, `where: { org_id: req.user.orgId }` must strictly be enforced at the repository layer.
- `users` is one of the few global tables.

## Key Relationships & Enums

### Authentication & Users
- **`users`**: Global. Contains `id`, `email`, `password_hash`, `status` (active, pending_verification).
- **`roles`**: Global enum tables (`hr`, `manager`, `employee`, `guest`).
- **`user_roles`**: The associative entity defining tenancy. `(user_id, role_id, org_id)`. Contains `is_active` and `deleted_at` for soft deletes.
- **Profiles**: `employee_profiles`, `hr_profiles`, `manager_profiles`. 1:1 with `users`, but scoped to the organization. Contains `department_id`, `location_id`.

### Organization Structure
- **`organization_locations`**: Physical/virtual work sites. Used for Geofencing.
- **`organization_departments`**: Departments. Contains `head_of_department_id` (FK to `users`).
- **`user_reporting_mappings`**: Highly critical table for the hierarchy.
  - Columns: `manager_id`, `subordinate_id`, `mapping_relation` (e.g. `employee_to_manager`, `manager_to_hr`), `is_active`.
  - Determines who sees whose attendance requests.

### Attendance Module (Core)
- **`attendance_logs`**: Immutable. Contains `timestamp`, `type` (clock_in, clock_out, break_start, break_end), `source` (web, biometric).
- **`attendance_records`**: A daily aggregate row per user. Contains `total_hours`, `effective_hours`, `status` (present, half_day, absent, etc.).
- **`attendance_policies`**: Defines rules (grace period, thresholds).
- **`employee_shift_assignments`**: Maps an employee to a `shift_templates` or a `rotation_patterns`.

### Document Module — PDF Generation Letters (Phase 4)
_Full DDL lives in migration `00059-create-letter-batches-and-proposals.js` (authored, handed back UNRUN — the operator runs migrations). This section records the shape at the same granularity as the rest of this doc._
- **`document_letter_batches`**: The bulk-letter request record. Key columns `org_id`, `template_code` (no FK — the template catalog is a repo asset), pinned `template_version`, `document_type_id` (FK, `ON DELETE RESTRICT`), `idempotency_key`, `field_overrides` (JSONB), `pinned_date`, `branding_snapshot` (JSONB, stored without `logo_src`/`signature_src`), `total_count`, `status` enum (`queued`/`running`/`completed`/`completed_with_failures`/`cancelled`), `source` enum (`hr_bulk`), `created_by`. Unique `(org_id, idempotency_key)`; CHECK `total_count BETWEEN 1 AND 2000` (an absolute ceiling above the configurable `letter_bulk_max_subjects` #91).
- **`document_letter_batch_items`**: The per-subject ledger. `batch_id` (FK CASCADE), `subject_user_id`, pre-generated `document_id` (no FK — the row does not exist until issued), `status` enum (`pending`/`issued`/`failed`/`skipped`), nullable `letter_id`/`artifact_id` (FKs `ON DELETE SET NULL` so dropping the ledger never touches an issued letter or its artifact), `reference_number`, `failure_code`/`failure_reason`. Unique `(org_id, batch_id, subject_user_id)` and `(org_id, document_id)`; CHECK that an `issued` item has `letter_id`, `artifact_id` and `reference_number` all non-null.
- **`document_letter_proposals`**: The manager maker-checker record. `template_code`, `subject_user_id`, `field_overrides` (JSONB), `status` enum (`pending`/`approved`/`rejected`/`cancelled`), `proposed_by`, `decided_by` (`ON DELETE SET NULL`), `decision_note`, nullable `letter_id`. **No `template_version`** — the version is resolved at approval, like every other issue. Partial unique index on `(org_id, template_code, subject_user_id) WHERE status = 'pending'` (one open proposal per subject+template); CHECKs that a decided proposal names its decider and an `approved` proposal names its `letter_id`.
- **`document_settings` (+4 columns)**: `letter_bulk_max_subjects` (INT, default 200, CHECK 1–2000), `letter_auto_issue_on_exit` (JSONB, default `[]`, CHECK array of ≤ 5), `manager_can_propose_letters` (BOOL, default false), `document_notify_letter_issued` (BOOL, default false). Every default reproduces today's behaviour. Adding a NOT NULL column with a constant default is metadata-only on PostgreSQL 11+, so the table is not rewritten.
- **`document_notifications.event_type`**: gains the enum label `'letter_issued'` (added outside the transaction per PostgreSQL's ADD VALUE rules; `down()` cannot remove an enum label and leaves it inert once #94's column is gone).

### Document Module — PDF Generation Retention & Rate Limits (Phase 5)
_Full DDL lives in migration `00060-add-pdf-retention-and-rate-limits.js` (authored, handed back UNRUN — the operator runs migrations). `up()` is partly non-atomic: the three columns and three CHECKs commit in one transaction; the index is then created `CONCURRENTLY` **outside** it (`CREATE INDEX CONCURRENTLY` cannot run inside a transaction), leaving a re-runnable migration via `IF NOT EXISTS`. `down()` is lossy for `superseded_asset_keys` only._
- **`document_settings` (+2 columns)**:
  - `letter_record_retention_days` (INTEGER, **nullable**, DEFAULT `NULL`): retention window for soft-deleted **generated** letters. `NULL` inherits `document_retention_days` (default 2555 = 7 years), so **no letter anywhere is a purge candidate on day one**. CHECK `document_settings_letter_record_retention_chk`: `IS NULL OR >= 365` — a letter is a legal document; no org may configure a retention shorter than a year. Enforced by `_sweepLetterRetention` (Pass 3). #95.
  - `letter_bulk_rate_per_hour` (INTEGER, NOT NULL, DEFAULT `10`): max bulk-letter batches per org per rolling hour. CHECK `document_settings_letter_bulk_rate_chk`: `BETWEEN 1 AND 500`. Enforced by `document_letter_batch.service.create` via the fixed-window Redis limiter (fail-open). #96.
- **`document_letter_branding` (+1 column)**:
  - `superseded_asset_keys` (JSONB, NOT NULL, DEFAULT `'[]'`): quarantine list of `{ key, superseded_at }` entries — a replaced logo/signature object awaiting deletion by Pass 4 no earlier than one hour after supersession. CHECK `document_letter_branding_superseded_keys_chk`: `jsonb_typeof(...) = 'array' AND jsonb_array_length(...) <= 20`. **Omitted from every client DTO** (BR-12). `down()` drops it losing quarantined keys — the referenced S3 objects are then orphaned permanently.
- **`pdf_render_jobs` (+1 index)**: `pdf_render_jobs_org_type_status_created_idx` on `(org_id, source_type, status, created_at)` — created `CONCURRENTLY`, backs the `#151`/`#221` queue-health aggregates (`countByStatus`, `failureRate`, `oldestQueuedAt`).
- **Audit action `letter.purged`**: written by Pass 3 inside the per-letter purge transaction. `newValues` carries `{ document_type_id, version }` — **never a storage key**. Records the irreversible hard-deletion of a soft-deleted generated letter for the legal trail.

## Transactions
Database transactions (`sequelize.transaction()`) are strictly used in high-risk operations:
- Organization Registration (Creating org, assigning role, activating subscription).
- Department Transfers (Rewiring dozens of rows in `user_reporting_mappings` simultaneously).
- Clock In / Clock Out (Writing logs, updating records, creating anomalies).
- Leave/Regularization Approvals (Modifying status and triggering recalcs).

Failure to pass the `transaction` object down to the repository layer in these flows is considered a critical bug.

## Naming Conventions
- Table names: `snake_case`, plural (e.g., `attendance_records`).
- Column names: `snake_case` (e.g., `clock_in_time`).
- Foreign Keys: Suffixed with `_id` (e.g., `user_id`).
- Timestamps: Sequelize manages `created_at` and `updated_at`.
