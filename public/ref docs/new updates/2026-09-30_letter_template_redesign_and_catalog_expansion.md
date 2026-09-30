# Letter Templates — Executive Redesign & Six New Templates (API change record)

**Date:** 2026-09-30
**Module:** Documents → PDF Generation (letter templates)
**Audience:** Frontend / API consumers
**Endpoints touched:** none added or removed. The existing letter endpoints (#135 list, #136 detail, #137 config, #138 preview, #139 issue, #143 bulk, #145 manager proposal) now serve six more template codes. One settings validation rule was added (§4).

---

## 1. What changed at a glance

| Change | Client impact |
| --- | --- |
| All 9 existing letter templates and the shared partials (letterhead, signature block, footer, stylesheet) were redesigned for A4 print. | Visual only. Template codes, field names, and `current_version` (still `1`) are unchanged. The next render of any letter uses the new design. |
| Six new templates were added to the registry. | They appear in #135 / #136 and can be previewed and issued like any other letter (§2, §3). |
| New seeder `012-seed-additional-letter-types.js` adds three catalog document types. | Until it runs **and** the types are activated for an org, issuing an offer, promotion, or salary-revision letter returns `409 DOCUMENT_TYPE_NOT_ACTIVATED` (§5). |
| `letter_auto_issue_on_exit` rejects templates that need HR-typed fields. | New `422` on the settings update (§4). |

> **Versioning note:** the redesign was applied in place to `v1`. Letters already issued keep their stored PDF, so nothing already issued changes. A **re-issue** of an old letter renders in the new design.

---

## 2. New templates

The view model is built as **override > saved field > derived**. Derived fields come from the employee's profile or salary record and **cannot be overridden** (`422 LETTER_FIELD_NOT_OVERRIDABLE`).

#136 returns `required_fields` and `optional_fields` but does **not** say which of them are derived. The tables below list the fields HR must type, so the issue form can show only those inputs.

| Code | Title shown | Catalog `document_type_code` | Ref token |
| --- | --- | --- | --- |
| `show_cause_notice` | Show Cause Notice | `show_cause_notice` (already in catalog) | `SCN` |
| `performance_improvement_plan` | Performance Improvement Plan | `performance_improvement_plan` (already in catalog) | `PIP` |
| `full_and_final_statement` | Full and Final Settlement Statement | `full_and_final_statement` (already in catalog) | `FNF` |
| `offer_letter` | Offer Letter | `offer_letter_issued` (**seeder 012**) | `OFR` |
| `promotion_letter` | Promotion Letter | `promotion_letter_issued` (**seeder 012**) | `PRM` |
| `salary_revision_letter` | Salary Revision Letter | `salary_revision_letter_issued` (**seeder 012**) | `REV` |

### 2.1 Fields HR supplies (via `field_overrides` or saved fields)

| Code | Required (HR-entered) | Optional (HR-entered) | Saved-field key (#137) |
| --- | --- | --- | --- |
| `show_cause_notice` | `allegation_summary`, `response_deadline_days` | — | `response_deadline_days` (integer 1–90) |
| `performance_improvement_plan` | `pip_duration_text`, `plan_summary` | `milestones_text`, `review_date_text` | `pip_duration_text` (≤ 80 chars) |
| `full_and_final_statement` | `net_payable_amount_text` | `settlement_notes`, `payment_mode_text` | `payment_mode_text` (≤ 80 chars) |
| `offer_letter` | `offer_validity_date_text` | `closing_note` | `closing_note` (≤ 500 chars) |
| `promotion_letter` | `previous_designation`, `effective_date_text` | `closing_note` | `closing_note` (≤ 500 chars) |
| `salary_revision_letter` | `effective_date_text` | `previous_annual_ctc_text`, `closing_note` | `closing_note` (≤ 500 chars) |

- Every value is **pre-formatted text** that is printed exactly as sent. The server does not format amounts or dates for these fields. For example, send `"INR 1,42,350"` or `"15 October 2026"`, not a number or an ISO date.
- The only numeric field is `response_deadline_days`. It is printed as "Within N days".
- The existing override limits still apply: scalar values only, strings ≤ 500 chars, at most 20 keys.
- A saved field fills the matching required field when the issue has no override for it. For example, an org that saves `response_deadline_days: 7` does not need to send it on every notice.
- **Two different key sets, two different body names.** Issue (#139) and manager proposal (#145) take `field_overrides`, keyed by the HR-entered fields in the table above. Preview (#138) takes `override_fields` and #137 takes `saved_fields`. Those two accept **only** the saved-field keys (the last column, also returned as `template.fields` by #136). Sending an issue-only key such as `allegation_summary` to #138 returns `400 VALIDATION_ERROR`. See §8.

### 2.2 Fields derived from the employee record (do not send)

| Code | Derived |
| --- | --- |
| `show_cause_notice` | `employee_name`, `employee_code`, `designation`, `department_name` |
| `performance_improvement_plan` | `employee_name`, `employee_code`, `designation`, `department_name` |
| `full_and_final_statement` | `employee_name`, `employee_code`, `designation`, `relieving_date_text` |
| `offer_letter` | `employee_name`, `designation`, `joining_date_text`, `annual_ctc_text`, `department_name`*, `reporting_manager`*, `compensation_lines`* |
| `promotion_letter` | `employee_name`, `employee_code`, `designation`, `department_name`*, `revised_annual_ctc_text`* |
| `salary_revision_letter` | `employee_name`, `employee_code`, `designation`, `revised_annual_ctc_text`, `compensation_lines`* |

\* Optional. If the fact is missing, that line is left out of the letter; no error is raised.

If a **required** derived fact is missing, the issue returns `422 LETTER_FACTS_MISSING`, the same as for existing templates. Things the UI should warn about up front:

- **SCN / PIP** need the employee to have a department (the canonical `department_id`, not the free-text department string).
- **F&F** needs the employee to have an **exit record** in Payroll (any status except `cancelled`). The relieving date printed is that exit's `last_working_day`. Nothing on the employee profile supplies it.
- **Offer letter** needs a joining date and an active salary structure. The subject must already exist as a user in the org; offers to external candidates who aren't users are not supported.
- **Promotion letter** prints the employee's **current** designation as the new designation. Update the profile to the new designation **before** issuing, and type the old one into `previous_designation`.
- **Salary revision letter** prints the **current** salary structure as the revised CTC. Apply the revision **before** issuing the letter.

---

## 3. Preview (#138)

All 15 templates preview without errors from their built-in `sample_data`. A unit test now enforces this for every registry entry. Preview PDFs carry a diagonal **PREVIEW** watermark on every page.

---

## 4. New validation on `letter_auto_issue_on_exit` (settings update)

Automatic issuance on exit runs with no HR input. A template with any required field that HR must type would therefore fail on every exit. Such templates are now rejected when the setting is saved:

```json
{
  "success": false,
  "errorCode": "SETTING_OUT_OF_RANGE",
  "message": "letter_auto_issue_on_exit may not include a template that needs HR-authored fields (full_and_final_statement)",
  "details": { "field": "letter_auto_issue_on_exit", "code": "full_and_final_statement" }
}
```

- **Rejected (HTTP 422):** `full_and_final_statement`, `show_cause_notice`, `performance_improvement_plan`.
- **Also rejected, as before:** templates that carry compensation (`offer_letter`, `promotion_letter`, `salary_revision_letter`, `appointment_letter`, `salary_certificate`).
- **Still allowed:** existing non-compensation templates such as `experience_letter`, `relieving_letter`, and `warning_letter`.

Recommended UI: exclude the rejected codes from the auto-issue picker.

---

## 5. Catalog / activation (operator action required)

- Seeder `012-seed-additional-letter-types.js` inserts `offer_letter_issued`, `promotion_letter_issued`, and `salary_revision_letter_issued`. All three are org-plane, confidential by default, and allow multiple documents. **The seeder has not been run yet.**
- After it runs, each org must still **activate** these types like any other catalog type. Until then, issuing returns `409 DOCUMENT_TYPE_NOT_ACTIVATED`.
- SCN, PIP, and F&F map to types that already exist in the catalog. They need only the usual per-org activation.
- **Separately, each template must be enabled for the org.** A template with no config row is reported by #135 as `is_enabled: false`, and issuing it returns `409 LETTER_TEMPLATE_DISABLED`. HR enables it with `PUT /hr/letter-templates/:code/config` and `{ "is_enabled": true }` (§8.3). So an issuable new letter needs **both** steps: the document type activated, and the template enabled.

| Step | Who | Until done |
|---|---|---|
| Seeder 012 run (offer / promotion / salary revision only) | Operator | `409 DOCUMENT_TYPE_NOT_ACTIVATED` |
| Document type activated for the org | HR (document type catalog) | `409 DOCUMENT_TYPE_NOT_ACTIVATED`, or `409 DOCUMENT_TYPE_INACTIVE` if activated but switched off |
| Template enabled (#137 `is_enabled: true`) | HR | `409 LETTER_TEMPLATE_DISABLED` |

---

## 6. Design notes for anyone embedding previews

- Output is A4 with 0 mm page margins; the template draws its own padding. Long letters (PIP, and offers with many salary components) run to two pages. The signature block and footer always stay together.
- The accent colour comes from branding `accent_color`, with `#1e3a8a` as the fallback. Logos and signatures come from the existing branding data. The templates use no external fonts or URLs.

---

## 7. Endpoint reference

All paths are under `/api/v1/documents` and require the `documents.access` feature. Error bodies use the standard envelope `{ "success": false, "message", "errorCode", "details"? }`.

| # | Method & path | Roles | Notes |
|:--:|---|---|---|
| 135 | `GET /hr/letter-templates?enabled=true\|false` | hr, manager | Also at `GET /manager/letter-templates` |
| 136 | `GET /hr/letter-templates/:code` | hr, manager | Also at `GET /manager/letter-templates/:code` |
| 137 | `PUT /hr/letter-templates/:code/config` | hr | Enable/disable, saved fields |
| 138 | `POST /hr/letter-templates/:code/preview` | hr | Returns a PDF (inline) |
| 139 | `POST /hr/letters` | hr | Issue one letter |
| 143 | `POST /hr/letters/bulk` | hr | **Currently switched off:** `503 PDF_BULK_GENERATION_DISABLED` (see `pdf_html_only_migration_2026_09_30.md` §1) |
| 145 | `POST /manager/letters` | manager, hr | Manager proposal; HR approves via #149 |
| 92 | `PUT /hr/settings` (`letter_auto_issue_on_exit`) | hr | See §4 |

`:code` must match `^[a-z][a-z0-9_]{2,63}$`; anything else is `400 VALIDATION_ERROR`.

## 8. Request / response contracts

### 8.1 #135 — list

```json
{ "success": true, "message": "Templates loaded", "data": { "templates": [
  { "code": "offer_letter", "title": "Offer Letter", "current_version": 1,
    "is_enabled": false, "pinned_version": null, "has_saved_fields": false, "is_orphaned": false }
] } }
```

The six new codes are listed for every org immediately, with `is_enabled: false` until HR enables them (§5).

### 8.2 #136 — detail

```json
{ "success": true, "message": "Template loaded", "data": {
  "template": {
    "code": "show_cause_notice", "title": "Show Cause Notice", "current_version": 1,
    "required_fields": ["employee_name", "employee_code", "designation", "department_name", "allegation_summary", "response_deadline_days"],
    "optional_fields": [],
    "fields": [ { "key": "response_deadline_days", "label": "Response Deadline Days", "type": "number", "max_length": 90, "required": false } ],
    "sample_data": { "...": "..." }
  },
  "config": { "is_enabled": true, "pinned_version": null, "saved_fields": { "response_deadline_days": 7 } }
} }
```

- `config` is `null` when the org has never configured the template.
- `template.fields` describes the **saved-field** keys (for #137 and #138), not the issue inputs. Build the issue form from §9.
- **Descriptor quirk:** for a `number` field, `max_length` is the **maximum value**. So `response_deadline_days` means 1–90, not "90 characters". The minimum (1) is not in the descriptor. `required` is always `false` for saved fields.

### 8.3 #137 — save config

Request:

```json
{ "is_enabled": true,
  "saved_fields": { "closing_note": "We look forward to welcoming you to the team." },
  "pinned_version": null,
  "reference_pattern": null,
  "requires_acknowledgement": null,
  "is_confidential": null }
```

- Only `is_enabled` is required.
- `saved_fields` accepts only that template's saved-field keys; an unknown key or a bad value is `400 VALIDATION_ERROR`.
- `pinned_version` must be `1` or `null`.
- `saved_fields` **replaces** the stored object. Send the full set each time.

Response `200`: `{ "data": { "config": { "is_enabled", "pinned_version", "saved_fields" } } }`. Errors: `404 TEMPLATE_NOT_FOUND`.

### 8.4 #138 — preview

Request (every key optional; any other top-level key, including `subject_user_id`, is a `400`):

```json
{ "use_saved_fields": true, "override_fields": { "response_deadline_days": 3 } }
```

- **The preview always uses sample data for the employee and for any HR-entered field that is not a saved-field key.** For example, a Show Cause Notice preview prints the sample allegation text. It cannot preview a real employee's letter.
- Merge order: `sample_data` ← saved fields (if `use_saved_fields`) ← `override_fields`.
- Response: `200`, `Content-Type: application/pdf`, `Content-Disposition: inline; filename*=UTF-8''<code>-preview.pdf`, `Cache-Control: private, no-store`, `X-Artifact-Id: <uuid>`. Render it in an `<iframe>`/`<object>` from a blob URL.

| Status | errorCode | When |
|:--:|---|---|
| 400 | `VALIDATION_ERROR` | bad `:code`, unknown top-level key, or an `override_fields` key/value the saved-field schema rejects |
| 404 | `TEMPLATE_NOT_FOUND` | code not in the registry |
| 409 | `TEMPLATE_DISABLED` | `use_saved_fields: true` and the org **disabled** the template. Note: preview uses `TEMPLATE_DISABLED`, issue uses `LETTER_TEMPLATE_DISABLED`. A never-configured template previews fine. |
| 422 | `PDF_DATA_INCOMPLETE` | a required field resolved empty (not expected with the built-in sample data) |
| 429 | `PREVIEW_RATE_LIMITED` | per-org hourly cap (`letter_preview_rate_per_hour`). No `Retry-After` header; resets at the top of the UTC hour. |
| 5xx | `PDF_RENDER*` | renderer errors, as in `pdf_html_only_migration_2026_09_30.md` §2 |

### 8.5 #139 — issue

Request:

```json
{ "template_code": "show_cause_notice",
  "subject_user_id": "<uuid>",
  "field_overrides": {
    "allegation_summary": "confidential project documents were shared with an external party on 14 January 2026 without authorisation",
    "response_deadline_days": 7 },
  "effective_date": "2026-10-01",
  "idempotency_key": "scn-2026-10-01-emp1042" }
```

- `field_overrides`: at most 20 keys; values are a string ≤ 500 chars, a number or a boolean. No nested objects.
- `effective_date` (optional, `YYYY-MM-DD`) must be within ±365 days of today. It is the date printed on the letter.
- `idempotency_key` (optional, 8–120 chars of `A-Z a-z 0-9 . _ : -`): generate one per form submission.
  - **Reuse the same key** when the outcome is unknown (network drop, client timeout) or after `409 PDF_RENDER_IN_PROGRESS`. If the letter was issued, the retry returns it (`200`, `reused: true`) instead of issuing a duplicate.
  - **Generate a new key** before retrying after a renderer failure (`502`/`504`/`500 PDF_RENDER_FAILED`). A client key records the failure against that key, and re-sending it returns the same error without rendering again.
  - **Without a key**, the server derives one from the request content. After a render failure a plain retry renders again automatically, up to 5 failed attempts; the sixth returns `409 PDF_RETRY_LIMIT_EXCEEDED`.

Response: `201` `"message": "Letter issued"`, or `200` `"message": "Letter already issued"` for an idempotent repeat:

```json
{ "success": true, "data": { "letter": { "...": "..." }, "artifact": { "...": "..." }, "reused": false } }
```

The `letter` and `artifact` shapes are unchanged from before this release.

**Minimal bodies for the new templates** (`subject_user_id` omitted):

| Code | `field_overrides` |
|---|---|
| `show_cause_notice` | `{ "allegation_summary": "...", "response_deadline_days": 7 }` (the second can come from saved fields) |
| `performance_improvement_plan` | `{ "pip_duration_text": "60 days", "plan_summary": "..." }` + optional `milestones_text`, `review_date_text` |
| `full_and_final_statement` | `{ "net_payable_amount_text": "INR 1,42,350" }` + optional `settlement_notes`, `payment_mode_text` |
| `offer_letter` | `{ "offer_validity_date_text": "15 October 2026" }` + optional `closing_note` |
| `promotion_letter` | `{ "previous_designation": "Senior Software Engineer", "effective_date_text": "01 October 2026" }` + optional `closing_note` |
| `salary_revision_letter` | `{ "effective_date_text": "01 October 2026" }` + optional `previous_annual_ctc_text`, `closing_note` |

### 8.6 #145 — manager proposal

Body: `{ template_code, subject_user_id, field_overrides, reason? }`. `field_overrides` follows the same rules as #139, and the response is unchanged. The subject must be the manager's report, and the org setting `manager_can_propose_letters` must be on. The six new templates can be proposed like any other.

### 8.7 Issue / proposal errors

| Status | errorCode | `details` | Meaning / UI |
|:--:|---|---|---|
| 400 | `VALIDATION_ERROR` | — | body shape (see §8.5) |
| 404 | `LETTER_TEMPLATE_UNKNOWN` | — | code not in the registry |
| 404 | `DOCUMENT_NOT_FOUND` | — | `subject_user_id` is not a member of this org |
| 409 | `LETTER_TEMPLATE_DISABLED` | — | enable it via #137 (§5) |
| 409 | `DOCUMENT_TYPE_NOT_ACTIVATED` | — | seeder 012 not run, or type not activated (§5) |
| 409 | `DOCUMENT_TYPE_INACTIVE` | — | the type was activated but switched off |
| 422 | `LETTER_FIELD_UNKNOWN` | `{ field }` | the key is not a field of this template |
| 422 | `LETTER_FIELD_NOT_OVERRIDABLE` | `{ field }` | the key is derived from the employee record (§2.2); remove it from the form |
| 422 | `PDF_DATA_INCOMPLETE` | `{ missing_fields: [...] }` | a required HR-entered field (§2.1) is empty and not in saved fields; highlight those inputs |
| 422 | `LETTER_FACTS_MISSING` | `{ missing_facts: [...] }` | the employee record lacks a fact (table below) |
| 503 | `PDF_BULK_GENERATION_DISABLED` | — | #143 only |
| 409 | `PDF_RENDER_IN_PROGRESS` | — | the same request is still rendering; retry after ~2 s with the **same** `idempotency_key` |
| 409 | `PDF_RETRY_LIMIT_EXCEEDED` | — | this exact letter failed to render 5 times (no client key); try again later |
| 5xx | `PDF_RENDER*` / `STORAGE_UNAVAILABLE` | — | renderer/storage failure; retry with a **new** `idempotency_key` (§8.5) |

`missing_facts` names the underlying record field, not the letter field:

| `missing_facts` value | Fix it in | Used by (required) |
|---|---|---|
| `full_name` | User profile (display name, or first + last name) | every template |
| `employee_code` | Employee profile | bonafide, NOC, warning, salary certificate, SCN, PIP, F&F, promotion, salary revision |
| `designation` | Employee profile | every template |
| `joining_date` | Employee profile | appointment, experience, relieving, confirmation, internship, salary certificate, offer |
| `department_name` | Employee profile `department_id` | SCN, PIP |
| `last_working_day` | Payroll exit record | experience, relieving, internship, F&F |
| `annual_ctc` | Active approved salary structure | appointment, salary certificate, offer, salary revision |

## 9. Field matrix — all 15 templates

Generated from the registry on 2026-09-30.
- **HR-entered** fields are the only valid `field_overrides` keys for #139/#145.
- **Saved-field keys** are the only valid keys for #137 `saved_fields` and #138 `override_fields`.
- **Auto-issue** means allowed in `letter_auto_issue_on_exit` (§4).

| Code | Doc type | HR-entered required | HR-entered optional | Derived (never send) | Saved-field keys | Auto-issue |
|---|---|---|---|---|---|:--:|
| `experience_letter` | `experience_letter_issued` | — | `closing_note` | employee_name, designation, joining_date_text, relieving_date_text, department_name\*, employee_code\* | `place_of_issue` (≤ 80), `hr_contact_line` (≤ 160) | Yes |
| `appointment_letter` | `appointment_letter_issued` | — | `probation_text`, `closing_note` | employee_name, designation, joining_date_text, annual_ctc_text, department_name\*, employee_code\*, reporting_manager\*, compensation_lines\* | `place_of_issue` (≤ 80), `offer_reference_note` (≤ 160) | No (compensation) |
| `bonafide_letter` | `bonafide_letter_issued` | — | `purpose_text` | employee_name, designation, employee_code | `place_of_issue` (≤ 80) | Yes |
| `relieving_letter` | `relieving_letter_issued` | — | `closing_note` | employee_name, designation, joining_date_text, relieving_date_text, department_name\*, employee_code\* | `place_of_issue` (≤ 80), `hr_contact_line` (≤ 160) | Yes |
| `confirmation_letter` | `confirmation_letter_issued` | — | `closing_note` | employee_name, designation, joining_date_text, department_name\*, employee_code\* | `place_of_issue` (≤ 80), `hr_contact_line` (≤ 160) | Yes |
| `warning_letter` | `warning_letter` | — | `incident_summary`, `expected_correction`, `response_due_text` | employee_name, employee_code, designation, department_name\* | `place_of_issue` (≤ 80), `hr_contact_line` (≤ 160) | Yes |
| `internship_certificate` | `internship_certificate_issued` | — | `closing_note` | employee_name, designation, joining_date_text, relieving_date_text, department_name\* | `place_of_issue` (≤ 80), `hr_contact_line` (≤ 160) | Yes |
| `noc` | `noc_issued` | — | `purpose_text` | employee_name, employee_code, designation | `place_of_issue` (≤ 80) | Yes |
| `salary_certificate` | `salary_certificate_issued` | — | `purpose_text` | employee_name, employee_code, designation, joining_date_text, annual_ctc_text, compensation_lines\* | `place_of_issue` (≤ 80), `hr_contact_line` (≤ 160) | No (compensation) |
| `show_cause_notice` | `show_cause_notice` | `allegation_summary`, `response_deadline_days` | — | employee_name, employee_code, designation, department_name | `response_deadline_days` (integer 1–90) | No (HR fields) |
| `performance_improvement_plan` | `performance_improvement_plan` | `pip_duration_text`, `plan_summary` | `milestones_text`, `review_date_text` | employee_name, employee_code, designation, department_name | `pip_duration_text` (≤ 80) | No (HR fields) |
| `full_and_final_statement` | `full_and_final_statement` | `net_payable_amount_text` | `settlement_notes`, `payment_mode_text` | employee_name, employee_code, designation, relieving_date_text | `payment_mode_text` (≤ 80) | No (HR fields) |
| `offer_letter` | `offer_letter_issued` | `offer_validity_date_text` | `closing_note` | employee_name, designation, joining_date_text, annual_ctc_text, department_name\*, reporting_manager\*, compensation_lines\* | `closing_note` (≤ 500) | No (compensation) |
| `promotion_letter` | `promotion_letter_issued` | `previous_designation`, `effective_date_text` | `closing_note` | employee_name, employee_code, designation, department_name\*, revised_annual_ctc_text\* | `closing_note` (≤ 500) | No (compensation) |
| `salary_revision_letter` | `salary_revision_letter_issued` | `effective_date_text` | `previous_annual_ctc_text`, `closing_note` | employee_name, employee_code, designation, revised_annual_ctc_text, compensation_lines\* | `closing_note` (≤ 500) | No (compensation) |

\* optional derived field: omitted from the letter when the fact is missing.

#136 does not return which fields are derived. Keep this table in the frontend, keyed by template code, and re-check it when `current_version` changes.

## 10. F&F letter vs the payroll F&F statement

These are two different documents. Do not merge them in the UI.

| | Letter `full_and_final_statement` (this record) | Payroll #224 `GET /api/v1/payroll/hr/exits/:id/settlement-statement/pdf` |
|---|---|---|
| Content | Formal letter; HR **types** the net payable figure | Computed statement: encashments, recoveries, final-period pay |
| Stored as | An org document (acknowledgement, re-issue, audit) | Not stored; generated on each download |
| Available when | The employee has a live (not cancelled) exit record | The exit's settlement is `prepared` (provisional) or `settled` (final) |

See `payroll_fnf_bank_advice_statutory_pdfs_2026_09_30.md`.

## 11. Frontend checklist

- [ ] Add the six codes to any code→label/icon map. The titles come from #135.
- [ ] Build issue forms from §9: show only HR-entered fields, prefill from `config.saved_fields`, and never send derived keys.
- [ ] Send `override_fields` (not `field_overrides`) on preview, restricted to `template.fields` keys.
- [ ] Treat `number` descriptors' `max_length` as a max value (`response_deadline_days`: 1–90).
- [ ] Add an "Enable template" action (#137 `is_enabled: true`), and surface `LETTER_TEMPLATE_DISABLED` / `DOCUMENT_TYPE_NOT_ACTIVATED` with a link to the fix.
- [ ] Map `LETTER_FACTS_MISSING.details.missing_facts` and `PDF_DATA_INCOMPLETE.details.missing_fields` to field-level messages (§8.7).
- [ ] Promotion and salary revision: show a reminder to update the designation or apply the salary revision **before** issuing (§2.2).
- [ ] Auto-issue picker: offer only templates marked "Yes" in §9, and at most **5**.
- [ ] Hide or disable bulk issue (#143) while it returns `503 PDF_BULK_GENERATION_DISABLED`.
- [ ] Issue retries: same `idempotency_key` for an unknown outcome, a **new** key after a renderer 5xx (§8.5).
- [ ] Handle `429 PREVIEW_RATE_LIMITED` on preview with a "try again later" message; do not auto-retry.
