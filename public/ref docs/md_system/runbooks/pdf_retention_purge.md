# Runbook — PDF Letter Retention Purge

**Owner:** Ops / Data governance
**Applies to:** `document_sweeper` Pass 3 (letter retention, F-3) and Pass 4 (branding-asset quarantine, F-4)
**Related:** [`renderer_outage.md`](renderer_outage.md) · [`renderer_key_rotation.md`](renderer_key_rotation.md) · [`background-jobs.md`](../background-jobs.md)

---

## ⚠ This is the one irreversible thing the PDF module does

Pass 3 **hard-deletes** soft-deleted generated letters that are past their effective retention: the S3
object is deleted, the `org_document` row is destroyed (after its RESTRICT children are cleared), and
the render artifact is left as a `purged` tombstone. **There is no rollback. Purged letters are gone.**

Four controls exist precisely because of this, and none may be bypassed:

1. **NULL default** — `letter_record_retention_days` (#95) defaults to `NULL`, which inherits
   `document_retention_days` (7 years). On day one after migration `00060`, **nothing is a candidate.**
2. **365-day floor** — the setting is `NULL` or `>= 365`, enforced by Joi **and** a DB CHECK. No org
   can configure a retention shorter than a year.
3. **The dry run** — `runSweeper({ dryRun: true })` runs every selection, guard and count but performs
   **zero deletes and opens zero transactions**. Run it before trusting the live pass.
4. **Bounded batch** — each pass processes a bounded candidate set per org per night; version chains
   drain newest-first across successive nights.

## Before enabling the purge in any environment

**Required: one dry run per environment.** (§25.3 gate on §27.4.)

1. Run the sweeper in dry-run mode against the environment:
   `runSweeper({ dryRun: true })` (via a one-off script / node REPL on that environment).
2. Read the returned counts — `letters_purged` and `branding_assets_purged` are the counts of what a
   **live** run *would* delete. `dryRun` guarantees these counts are identical to a live run while
   changing nothing.
3. Sanity-check the number against the org's expectations. A surprising `letters_purged` count means a
   setting was lowered — investigate before enabling.
4. Only then let the nightly live pass run (it is inert while every org's `#95` is `NULL`).

## What is NEVER purged, at any age

- A letter under an **open acknowledgement obligation** (BR-2).
- A **statutory** document type (BR-3).
- A letter with a **live successor** version (`supersedes_id` points at it, BR-5).
- An **uploaded** document (`origin != 'generated'`, BR-6) — that is the employee-document sweep's job.
- A **live** (not soft-deleted) letter (BR-7).

## Lowering `letter_record_retention_days` — the irreversibility warning

> Lowering this value below the age of existing soft-deleted letters makes those letters purge
> candidates on the **next nightly run**, and the deletion is irreversible.

So: before lowering an org's `#95`, run a dry run (above) and confirm the `letters_purged` count is
what you intend. Once the nightly pass runs, those letters and their PDFs are permanently destroyed.

## Failure behaviour (no operator action needed)

- **A single object delete fails** → the letter row is kept and counted as a failure; the next night's
  run completes it. Object-before-row ordering means there are never orphaned rows pointing at deleted
  objects, only (briefly) the reverse.
- **`StorageUnavailableError`** (S3 wholly down) → the current org's pass aborts cleanly; **other orgs
  continue**. The aborted org is retried next night.
- **The transaction fails after the object delete** → the row is kept; the next run completes the
  deletion. The object is already gone, which is safe (the row still points at a now-missing object and
  will be re-selected).

## Verifying a purge ran correctly

- Audit log: one `letter.purged` row per purged letter (carries `{ document_type_id, version }`, **no
  storage key**).
- Structured logs: `pdf.letter.purged` per success; `pdf.letter.purge_object_failed` per object-delete
  failure (name only, no key).
- The 04:00 `pdf_artifact_sweeper` EC-19 verifier does **not** alarm on a letter purged at 03:45 — it
  is already a `purged` tombstone (not `status='ready'`) by the time the verifier looks. This ordering
  is a correctness property; do not reschedule Pass 3 after 04:00.

## Branding-asset quarantine (Pass 4)

When a logo/signature is replaced, the old object's key is quarantined in
`document_letter_branding.superseded_asset_keys` with a `superseded_at` timestamp. Pass 4 deletes the
object no earlier than **one hour** after supersession (BR-10), then rewrites the column under the
branding row's advisory lock. A failed delete keeps the key for the next run. This purge is bounded
(≤ 20 keys) and low-risk; it needs no dry run.
