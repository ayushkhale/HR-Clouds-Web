# Documents Module — Phase 3 (Acknowledgements, Signatures & Compliance): Frontend Change Record

**Date:** 2026-09-24
**Scope:** API #73–#79 wired to UI, plus the additive Phase 3 fields on #59 / #70 / #71 and the three new settings on the settings read/write. No Phase 1 or Phase 2 request was changed.
**Status:** code complete. `vite build` passes. 0 lint errors in new or changed files (the sidebar's four pre-existing errors are untouched). 28 shape-adapter checks pass against the fixtures in `phase3_api_analysis.md`. **Verified live against the dev API with HR, manager and employee tokens (§6); not click-tested in a browser, and not committed.**
**Registry:** #73–#79 marked in `api_registry.md`. The registry had no section for #73–#75, so one was added (*Employee Self-Service, Acknowledgements & Signatures, Phase 3*). Self-plane rows are marked in all three UI columns, the same as #70–#72.

---

## 1. What people can now do

| Who | Where | What |
|---|---|---|
| Everyone | **Company Documents** (`/dashboard/{hr,manager,employee}/company-documents`) | See what needs them, what is overdue and what is done. **Acknowledge** (tick + confirm) or **Sign** (type their name + tick). Open a permanent **receipt**. |
| HR | **Document Compliance** (`/dashboard/hr/documents/compliance`) — new | One row per live document that asks for something: progress, done, still to do, overdue, excused. Filter by kind of document, department, or "only with someone overdue". **Download report (CSV)** using the same filters. |
| HR | Any document → **Who got it** | Tallies are now done / waiting / overdue / excused. There are new Due and Finished columns. Clicking someone who has finished opens their **proof** (#78). |
| HR | **Document Settings** | New card, *Acknowledgements & signatures*: the default number of days to acknowledge, "flag overdue documents as a priority", and how people sign. |
| Managers | **Document Compliance** (`/dashboard/manager/documents/compliance`) — new | One card per team member, showing their pending and overdue documents. Filter by person or "only people who are late". |

Both new pages share the sidebar label **Document Compliance**. It is the same job, so it has the same name in both workspaces.

---

## 2. Files

**New**

| File | Holds |
|---|---|
| `shared/documents/complianceMeta.js` | Compliance verdict labels, `nextActionOf`, `ackBlockOf`, `actionWindow`, deadline wording, evidence/list adapters, signature providers |
| `shared/documents/ComplianceDialogs.jsx` | `AcknowledgeDialog`, `SignDialog`, `EvidenceDialog` (receipt #75 and HR proof #78) |
| `roles/hr/documents/screens/DocumentCompliancePage.jsx` | #76 + #77 |
| `roles/manager/documents/screens/TeamCompliancePage.jsx` | #79 |

**Changed**

| File | Change |
|---|---|
| `shared/api/documents.api.js` | +7 endpoints. The CSV export goes through `utils/download.js`, so a JSON `422` refusal is thrown like any other error. |
| `shared/utils/documentErrors.js` | +8 codes, +5 predicates |
| `shared/documents/orgDocumentPlanes.js` | `acknowledge`, `sign` and `myEvidence` on the self plane only; `recipientEvidence` on HR |
| `shared/documents/orgUi.jsx` | `ComplianceStateBadge`, `DueChip`, `CompletionBar`, `RateMeter` |
| `shared/documents/orgDocumentMeta.js` | Audit labels for acknowledged / signed / compliance_exported |
| `shared/documents/OrgDocumentDetailDialog.jsx` | Self plane: banners, the Acknowledge / Sign / View receipt buttons, and an `initialAction` prop for opening straight into a step. Removed the "not collected in the app yet" wording. |
| `shared/documents/OrgRecipientsSection.jsx` | Compliance bar and filter, Due and Finished columns, proof on row click. Also: the empty Action cell is now blank instead of a dash, and the column is hidden when no row has an action. |
| `shared/documents/OrgDocumentFormDialog.jsx` | Signature wording. The deadline field is prefilled from the org default (`defaultAckDays`). There is a note that signature-only documents have no deadline. |
| `shared/screens/IssuedDocumentsPage.jsx` | Rebuilt around the compliance filter. It is now **full width** (`max-w-7xl`, like every other screen; it was `max-w-5xl`), with a two-column card grid on wide screens. |
| `roles/hr/documents/screens/DocumentSettingsPage.jsx`, `OrgDocumentsPage.jsx` | The settings card, and the default-days prefill |
| `routes/AppRoutes.jsx`, `shared/components/DashboardSidebar.jsx` | The two new pages |

---

## 3. Contract decisions

1. **`document.next_action` decides the button (§7.1)**, not `is_actionable`. Buttons also check `display_status`: a scheduled or expired document shows "Not open yet" or "No longer open" instead of a button the server would refuse (`ORG_DOCUMENT_NOT_ACTIONABLE`).
2. **The combined analysis contradicts itself.** Its Phase 3 inventory table says `next_action ∈ VIEW / ACKNOWLEDGE / SIGN / NONE`, and that #59 filters by `pending / viewed / acknowledged / signed / overdue / waived`. The endpoint sections and the backend note both say `acknowledge | sign | null` and `completed | pending | overdue | waived`. **We follow the endpoint sections.** `next_action` is lower-cased, and anything that is not an action is treated as null, so either spelling works.
3. **First write vs replay.** The note says to use `201` vs `200`. `request()` does not expose the status, so we read the `already_acknowledged` / `already_signed` flag, which the same responses carry. The message is the same either way: nothing is duplicated.
4. **No date maths on the client.** Overdue status, days remaining and `as_of` are all shown exactly as the server sends them. A row from before Phase 3 (with no `acknowledgement` block) is **never** guessed to be overdue.
5. **Signer-name privacy.** `SIGNER_NAME_MISMATCH` shows a generic message. As guidance, the sign dialog shows the signer **their own** names, read from their own `/organizations/me`. This follows the walkthrough ("your official name… is displayed as guidance") and does not reveal anyone else's name. Nothing is auto-filled: typing the name is the signature.
6. **Settings keys are only sent if the server returned them.** An older server never receives a key it would reject, and its settings page does not show a permanent unsaved change.
7. **Evidence 404s.** A 404 with no evidence yet reads as "hasn't acknowledged or signed yet", not as an error. `RECIPIENT_NOT_FOUND` reads as "didn't receive this document".
8. **Managers never see buttons they cannot use.** The manager page is read-only and tells managers to remind people. When the org turns team documents off, the `403` shows a plain notice rather than an error.
9. **HR totals are across documents, not just the current page.** The tiles make one extra `limit=100` read and add up the results. If there are more than 100 documents, the page says so.

---

## 4. For the backend team

1. **What does `compliance_state=pending` mean for a document that asks for nothing?** `resolveComplianceState` treats any `pending` or `viewed` recipient as `pending`, whatever the document's obligation. If #70 does this for information-only documents too, the employee's **"Needs you"** tile overcounts. The cards themselves are correct: they show the read state for those documents. Could #70's compliance filter be limited to documents that ask for something, as #76 already is?
2. Please confirm which `next_action` spelling is canonical (§3.2), and update the combined analysis inventory table to match.
3. ~~Publish (#47) blocked by `ORG_DOCUMENT_FILE_MISSING`.~~ **Fixed. Verified live on 2026-09-24 (§6).** Two new findings are in §6.

---

## 5. How it was verified

- `npx vite build`: passes.
- `npx eslint` on every new and changed file: 0 errors in them.
- 28 adapter checks against the documented fixtures (#70 block, #73, #78, #76, #79, the error envelopes). They cover both `next_action` spellings, the fallback for pre-Phase-3 rows, deadline wording (due today is not overdue), bucket sums, the export-too-large details, the 403 handling, and the rule that no name is disclosed.
- **Not done:** no browser click-through and no live API call. Smoke-test the five surfaces in §1 once publish works.

---

## 6. Live verification — 2026-09-24, dev API, HR / manager / employee tokens

**Publish (#47) works now.** The `ORG_DOCUMENT_FILE_MISSING` blocker is fixed: s3 upload → confirm → publish all succeeded.

End-to-end run: HR published a test document (acknowledgement + signature, audience = one employee). The employee then opened, acknowledged and signed it. HR and the manager read the results.

| Check | Result |
|---|---|
| Phase 1/2 reads for every role (types, my documents, team documents, verification queue, proposals) | all 200 |
| Cross-role access (employee → HR/manager routes, manager → HR proof) | 403 |
| #70 row shape: `acknowledgement` block, lower-case `next_action`, `document.document_type.name` | matches the contract |
| #72 open → `pending` becomes `viewed` | yes |
| A non-recipient (the manager) tries to sign | 404, the uniform denial |
| Wrong name | 422 `SIGNER_NAME_MISMATCH`, no details returned |
| `confirm: false` | 400 |
| #73 acknowledge, then a replay | 201, then 200 with `already_acknowledged: true` |
| #74 sign with odd case and spacing, then a replay | 201, then 200 with `already_signed: true` |
| #75 receipt and #78 proof, before and after | 404, then 200 with both records |
| #61 excuse after signing | 409 `RECIPIENT_ALREADY_COMPLETED` |
| #59 `compliance` block and row fields; #76 tallies; #79 team rows, `overdue_only`, out-of-team `user_id` (empty list) | correct |
| #77 CSV | BOM, the 16 columns, filename header exposed to the browser |
| Audit trail | viewed / acknowledged / signed recorded; labels mapped |
| Settings: the 3 Phase 3 keys | present (7 days, off, internal typed) |
| Manager proposal → HR queue → manager publish attempt → HR decline | 201, listed, 403, declined with the reason visible to the manager |

The UI adapters were also run against the saved live payloads: 8/8 pass.

### New findings for the backend

1. **Acknowledging completes a document that also needs a signature.** After #73 alone, the verdict is `completed`: #59/#76 count the person as done, and #70 `compliance_state=pending` no longer lists the document. Yet `next_action` is still `"sign"`. Either the verdict should stay `pending` until signed, or `next_action` should be null. The UI now shows the person "Waiting" until nothing is left to do (`myComplianceState`), but HR's tallies and the employee's "Needs you" filter follow the server.
2. **`content_checksum` is 32 hex characters** (MD5 / S3 ETag), not the SHA-256 the analysis documents. It still identifies the exact file, but the docs and the evidence claim should match.
3. The typed signer name is stored with its inner spacing (`"aditya   PATIDAR"`). That is by design (R-89); noting it for audit readers.

**Test data left on dev:** type `test_p3_compliance`, published document `2d469352-1ef8-4110-adec-d6c166edb8ca` (signed by Aditya Patidar), and declined proposal `8b5fc97e-97e6-4b7c-83db-0c7324b67e4b`. Evidence rows are permanent by design. The document can be withdrawn from the UI when no longer needed.
