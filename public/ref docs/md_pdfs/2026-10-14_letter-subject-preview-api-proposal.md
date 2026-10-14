# Letter Subject Preview — proposed endpoint #271 (backend specification)

**Date:** 2026-10-14
**Status:** Proposed — not implemented. Nothing in the registry is ticked for this.
**Module:** Documents → PDF Generation
**Audience:** Backend engineers implementing the endpoint
**Feature flag:** `documents.access` (unchanged)
**Auth:** HR-plane only — the existing `hrAuth` array (`authenticate` + `authorize(['hr'])` + `requireFeature('documents.access')`). No new role, middleware or flag.

---

## 1. The gap

HR can preview a letter **template** (`#138`) and the **letterhead** (`#134`). Neither can
show the letter that is actually about to be issued to a named employee.

This is by design in Phase 1, and the design is documented: `#138` renders
`sample_data ← saved_fields ← override_fields`, and **rejects `subject_user_id` with a `400`**
because "Phase 1 previews carry no real employee PII". The registry repeats it —
`#134`/`#138` "preview **sample data only** — no `subject_user_id` is accepted."

So today the last point at which HR can look at a letter is a page of invented details, and
the next click (`#139`) mints a reference number, publishes an immutable PDF and drops it into
the employee's portal. The only way to correct a mistake is `#142 reissue`, which supersedes
the bad letter but leaves it on the register for good.

The missing capability is a **render of the real letter, for the real subject, that is not a
letter**: same facts, same branding, same template version, no reference number, no
`org_document` row, nothing on the register.

### Why this is a new endpoint and not a widened `#138`

Adding `subject_user_id` to `#138` was considered and rejected:

- It would silently invert a documented guarantee. Clients and the registry both state that
  `#138` never touches employee PII; a caller that passes the key today gets a `400`.
- The two endpoints resolve different things. `#138` reads the template registry and the org
  config. A subject preview must run the **employee fact resolver** — the same one `#139`
  uses — which is where `LETTER_FACTS_MISSING` and most real failures come from.
- They need different rate budgets, different audit (a subject preview is a PII read worth
  recording) and a different artifact retention class.
- Its sibling is `#139`, not `#138`. It mirrors `#139`'s body field for field, so it belongs
  on the `/letters` resource.

---

## 2. The endpoint

```
POST /api/v1/documents/hr/letters/preview   →   application/pdf
```

**Route registration:** must be mounted **before** `/letters/:id` (most-specific-first), the
same precaution already taken for `/letters/proposals` (`#148`), so `preview` is never parsed
as a document id.

**Suggested registry number:** `#271` (highest currently allocated is `#270`). Files:
`document_letter.routes.js` → `document_letter_issue.controller.js` →
`document_letter_issue.service.js`, alongside `#139`.

### 2.1 Request

The body is `#139`'s body minus `idempotency_key` (see §3.3 — the client must not supply one).

```json
{
  "template_code": "experience_letter",
  "subject_user_id": "b1f2…",
  "field_overrides": { "purpose": "Visa application" },
  "effective_date": "2026-10-14"
}
```

| Field | Rules — identical to `#139` |
|---|---|
| `template_code` | required, string, must exist in the letter-template registry |
| `subject_user_id` | required, uuid, must be a non-deleted user in the caller's org |
| `field_overrides` | optional object, depth 1, ≤ 20 keys; each value a string ≤ 500 chars / number / boolean; keys must be declared by the template and must not be a `derived_fields` key |
| `effective_date` | optional ISO date, within ± 365 days of today |

Unknown top-level keys ⇒ `400 VALIDATION_ERROR` with `unknown(false)`, consistent with the
module. **`idempotency_key` is an unknown key here** and must be rejected by that same rule.

### 2.2 Response

`200`, binary PDF, headers exactly as `#134`/`#138`:

```
Content-Type: application/pdf
Content-Disposition: inline; filename*=UTF-8''<template_code>-preview.pdf
X-Content-Type-Options: nosniff
Cache-Control: private, no-store
X-Artifact-Id: <uuid>
```

No JSON envelope, no storage key, no view URL, no `input_snapshot`, no `data:` URI — the
same "never returned in any body" list that governs the rest of the module.

The filename deliberately carries the **template code and not the employee's name**, so a
file saved out of the browser does not leak a name into a filename that may be shared.

---

## 3. The five rules that make this safe

These are the whole specification. An implementation that gets the render right and any one
of these wrong is worse than not shipping it.

### 3.1 The reference sequence must not advance

`#139` allocates the per-org reference number **after** a successful render. The preview must
**not call the allocator at all** — not to peek, not to reserve, not in a transaction it
rolls back.

The reference number is a legally meaningful, gapless, per-org-per-FY sequence. A preview
that consumed one would punch holes in the register for letters that were never issued, and
no amount of explaining fixes an auditor's question about the missing numbers.

Render the reference block from the configured `letter_reference_pattern` with the sequence
token rendered as a literal placeholder — `{SEQ:0000}` → `XXXX` — and the surrounding tokens
(`{ORG_CODE}`, `{TYPE}`, `{FY}`) resolved normally, so HR can see the shape the real number
will take. `422 LETTER_REFERENCE_PATTERN_INVALID` still applies if the pattern is broken,
because that failure would also stop the issue.

### 3.2 Nothing is persisted as a document

No `org_documents` row, no `document_group_id`, no recipient rows, no acknowledgement rows,
no document-type activation (see §5), no notification. The preview must not appear in `#140`,
`#141`, `#52`, `#55`, `#63`, `#64` or any employee-facing read.

The confidentiality and acknowledgement settings (`letter_default_confidential`,
`letter_requires_acknowledgement_default`) are **read to render, never frozen** — freezing
happens only at issue.

### 3.3 A preview artifact must never satisfy an issue

This is the subtlest trap. `#139`, `#142`, `#134` and `#138` all share
`pdf_render.service.renderAndRecord`, which keys artifacts by an `input_hash` and, per the
Phase 2 concurrency change, **reuses a `ready` row** found under the same key.

A subject preview resolves the *same facts* from the *same template* for the *same subject*
as the issue that follows it. If both derive the same `input_hash`, the issue will find the
preview's `ready` artifact and hand it back — publishing a **watermarked, reference-less PDF
as a real letter**, and reporting `reused: true` for a letter that was never issued.

Mitigations, all required:

1. The server derives the key itself and includes a purpose discriminator —
   `purpose: 'letter_subject_preview'` — in the hashed input. The client sends no key, which
   is why `idempotency_key` is rejected in §2.1.
2. The artifact row records that purpose, and `#139`/`#142` **must refuse to reuse** an
   artifact whose purpose is not their own, even on an `input_hash` match.
3. A regression test asserts that a preview immediately followed by an issue of identical
   inputs produces a fresh artifact with `reused: false` and a real reference number.

### 3.4 The artifact is ephemeral

Record the artifact with `retention_class: 'ephemeral'` — never `'record'`. The existing
`pdf_artifact_sweeper` cron (03:50 IST) already reaps artifacts left `pending` past 30
minutes; extend it to delete `ready` **ephemeral** artifacts and their objects past a short
TTL (1 hour is sufficient — the response is `no-store` and the bytes are only needed for the
life of the open dialog).

Without this, every preview of a salary letter leaves a permanent object containing that
employee's pay, indistinguishable at the storage layer from an issued letter.

### 3.5 The watermark stays, and says more than `#138`'s

`#138`'s watermark exists because the data is fake. Here the data is **real**, which makes
the watermark more important, not less: this is the only artifact in the system that looks
exactly like a letter, names a real employee, carries real figures, and has no reference
number or register entry behind it.

Keep the diagonal `PREVIEW` watermark on every page, and render the reference block as the
`XXXX` placeholder from §3.1 rather than omitting it — an absent reference line reads like a
formatting bug, while a visible placeholder reads as "not issued yet".

---

## 4. Fact resolution must be the same code path as `#139`

The preview is only worth shipping if it **predicts** the issue. Call the same resolver,
with the same merge order, the same required-field checks and the same validation of
`field_overrides` against the template schema.

Concretely: `#271` and `#139` should differ only in what they do *after*
`renderAndRecord` returns — `#139` allocates a reference and commits a document row,
`#271` streams the bytes. Any divergence in resolution means HR approves a preview and then
hits a `422` on the issue, or worse, issues something that does not match what they approved.

This includes failing the way `#139` fails. A letter whose facts are incomplete must return
`422 LETTER_FACTS_MISSING` naming the same fields — the preview is exactly where that should
surface.

---

## 5. Deliberate divergences from `#139`

Two, both documented here so nobody "fixes" them later:

| Divergence | Why |
|---|---|
| Does **not** check or perform document-type activation | `#139` can fail `409 DOCUMENT_TYPE_NOT_ACTIVATED` because it must insert a row against an active type. A preview inserts nothing, so the check is not applicable. Since 2026-10-03 enabling a template auto-activates its type in the same transaction, so this failure is now rare at issue time anyway. **Consequence to accept:** a successful preview does not fully guarantee a successful issue. |
| Does **not** allocate a reference number | §3.1. **Consequence to accept:** `422 LETTER_REFERENCE_CONFLICT` cannot surface at preview time. |

A **disabled** template is *not* a divergence — mirror `#139` and return
`409 LETTER_TEMPLATE_DISABLED`. You cannot issue from a disabled template, so previewing one
would be a preview of something impossible. (Note this differs from `#138`, which returns
`409 TEMPLATE_DISABLED` only when `use_saved_fields` is set.)

---

## 6. Error catalogue

Inherited wholesale from `#139`, minus the two in §5:

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | bad body; includes `idempotency_key` or any unknown key |
| 404 | `LETTER_TEMPLATE_UNKNOWN` | `template_code` not in the registry |
| 404 | `USER_NOT_FOUND` | `subject_user_id` is not a live user in the caller's org (uniform denial — never distinguish cross-org from missing). **Confirm against `#139` before coding:** the Phase 2 change record does not enumerate a subject-not-found code, and whatever `#139` actually returns is what this must return. `USER_NOT_FOUND` is the Documents HR-plane convention (`#80`, `#81`, `#86`), including for a membership deactivated via `user_roles.is_active=false`. |
| 409 | `LETTER_TEMPLATE_DISABLED` | template not enabled for the org |
| 409 | `PDF_RENDER_IN_PROGRESS` | a concurrent preview under the same derived key is still rendering — retry shortly |
| 409 | `PDF_RETRY_LIMIT_EXCEEDED` | too many failed attempts under this key |
| 422 | `PDF_DATA_INCOMPLETE` | a required template field resolved empty after the merge |
| 422 | `PDF_TOO_LARGE` | over 6 MB |
| 422 | `LETTER_FIELD_UNKNOWN` / `LETTER_FIELD_NOT_OVERRIDABLE` | bad `field_overrides` key |
| 422 | `LETTER_FACTS_MISSING` | a required employee fact is absent (names the fields) |
| 422 | `LETTER_REFERENCE_PATTERN_INVALID` | the configured reference pattern is invalid |
| 429 | `PREVIEW_RATE_LIMITED` | per-org hourly preview cap reached (§7) |
| 500 | `PDF_TEMPLATE_INVALID` | renderer rejected the template (a server bug, not user input) |
| 502 | `PDF_RENDERER_UNAVAILABLE` / `STORAGE_UNAVAILABLE` | renderer / storage transport error |
| 503 | `PDF_RENDERER_NOT_CONFIGURED` | `PDF_RENDERER_BASE_URL` unset |
| 504 | `PDF_RENDER_TIMEOUT` | renderer exceeded its timeout |

Error envelope `{ success: false, message, errorCode }`. Every 5xx carries `artifact_id` for
support triage. No error body may contain a renderer URL, API key, storage key or stack
trace.

---

## 7. Rate limiting — no new setting

Count against the **existing** per-org hourly bucket,
`letter_preview_rate_per_hour` (setting #83, integer 1–1000, default 60), shared with
`#134`/`#138`, and return the same `429 PREVIEW_RATE_LIMITED`.

One renderer, one budget. A subject preview is the heaviest of the three (fact resolution
plus render), so it should not get its own larger allowance, and adding a fourth letter
setting to configure is a cost with no operator benefit.

---

## 8. Audit

`#134`/`#138` are not audited — there is nothing to audit about rendering invented data.
This endpoint is different and **must** be.

Record `letter.subject_preview` with `org_id`, actor `user_id`, `template_code`,
`subject_user_id`, `artifact_id` and `effective_date`. It renders a named employee's
personal and possibly salary facts into a downloadable file, and "who looked at whose pay,
when" is a question this system should be able to answer. No `input_snapshot` and no field
values in the audit row.

There is precedent in the module: `#86` writes a detached `document_checklist.viewed` audit
whenever HR reads *another* employee's checklist. A rendered letter is a strictly larger
disclosure than a checklist, so it should be audited unconditionally rather than only when
the actor and subject differ.

---

## 9. Out of scope (stated so it is a decision, not an omission)

- **Reissue preview.** `#142` re-renders from current facts; HR would reasonably want to see
  that too. It is a separate endpoint (`POST /letters/:id/reissue/preview`) because its input
  is a document id, not a template + subject. Not specified here.
- **Manager-plane preview.** `#145` lets a manager propose a letter. Giving a manager a
  rendered PDF of a report's letter — potentially carrying salary facts the manager may not
  be entitled to — is an access-control question that needs its own analysis. HR-plane only
  for now.
- **Bulk preview.** `#143` issues to many subjects. A preview of one representative subject
  is adequate and is just this endpoint.

---

## 10. Who will call it

- **`IssueLetterDialog`** (`src/shared/documents/IssueLetterDialog.jsx`) — the Issue a letter
  form. It currently has a **"See the layout"** button wired to `#138`, labelled and
  subtitled to say the details are invented, precisely because that is all `#138` can do.
  When `#271` ships, that button switches endpoint and becomes a real preview of the chosen
  person's letter; the label becomes "Preview letter" and the sample-data disclaimers come
  off. It already renders a binary PDF response through
  `LetterPreviewDialog` + `fetchFileBlob`, so the client change is the endpoint, the copy and
  passing `subject_user_id`.
- **`#149` approval review** — HR approving a manager's proposal is issuing a letter
  (`#139` underneath) on someone else's judgement, and is the flow with the strongest case
  for looking at the page first.

---

## 11. Acceptance tests

1. Preview of an enabled template for a valid subject ⇒ `200`, `application/pdf`, watermark
   present, reference block shows the `XXXX` placeholder.
2. **The sequence does not move:** read the org's current reference sequence, run 5 previews,
   read it again — unchanged. Then issue once and confirm the number is the one the sequence
   was always going to produce.
3. **No row is created:** after a preview, `#140` total is unchanged and no `org_documents`
   row exists for the subject.
4. **Preview then issue (§3.3):** preview, then `#139` with identical inputs ⇒ `201`,
   `reused: false`, a real reference number, and an artifact id different from the preview's.
5. **Issue then preview:** the preview must not return the issued letter's artifact, and must
   still be watermarked.
6. `idempotency_key` in the body ⇒ `400 VALIDATION_ERROR`.
7. Disabled template ⇒ `409 LETTER_TEMPLATE_DISABLED`.
8. Subject in another org ⇒ `404 USER_NOT_FOUND`, byte-identical to a non-existent id.
9. A subject missing a required fact ⇒ `422 LETTER_FACTS_MISSING` naming the same fields
   `#139` would name for the same subject.
10. Cap previews at `letter_preview_rate_per_hour` ⇒ `429 PREVIEW_RATE_LIMITED`, and confirm
    `#134`/`#138` share the bucket.
11. `PDF_RENDERER_BASE_URL` unset ⇒ `503 PDF_RENDERER_NOT_CONFIGURED`, and `#139`'s own
    behaviour is unchanged.
12. Ephemeral artifacts are swept (§3.4) and issued-letter artifacts are not.
13. An audit row is written per preview (§8) with no field values in it.

---

## 12. Hand-back checklist

- [ ] Add the `#271` row to `api_registry.md` under *Document Module — PDF Generation: Letter
      Issuance & Reissue (Phase 2)*, and tick the implemented marks. Nothing is ticked today.
- [ ] Amend the Phase 1 HR-plane note in `api_registry.md`: it currently reads that letter
      preview accepts no `subject_user_id`, which stays true of `#134`/`#138` but is no longer
      true of letter preview as a whole.
- [ ] Note in the Phase 2 change record that §7 ("Not added intentionally") no longer covers
      subject preview.
- [ ] Extend `pdf_artifact_sweeper` for ephemeral `ready` artifacts (§3.4).
- [ ] Add the `purpose` discriminator to the artifact table and the reuse guard in
      `renderAndRecord` (§3.3) — this touches `#134`/`#138`/`#139`/`#142`, so it needs its own
      regression pass.
