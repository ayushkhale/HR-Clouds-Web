# Documents Module — Phase 2 (Org-Issued Documents): Frontend Change Record

**Date:** 2026-09-24
**Scope:** API #43–#72 wired to UI. No Phase-1 endpoint, request shape or response shape was touched.
**Status:** code complete, `vite build` passes, 0 new lint errors, 31 shape-adapter checks pass against the fixtures in `phase2_api_analysis.md`. **Not click-tested against a live backend**, and **not committed**.
**Registry:** all 30 rows (#43–#72) marked in `api_registry.md` — HR plane under *HR UI*, manager plane under *Manager UI*, self plane under all three (it is mounted in every workspace, matching #34–#42).

---

## 1. What was added

Phase 1 gave every person a file of documents *about them*. Phase 2 adds the other direction: a document the organisation **issues** — a policy, a notice, a letter — to an audience it chooses, with a record of who has read it.

The two planes never share a row, so they do not share a status map, a table or a detail dialog either. Forcing one set of components to serve both would have mislabelled both: an org document has no subject employee, no expiry date and no verification queue, and an employee document has no audience, no version chain across people and no recipient roster.

| Surface | Route | Who |
|---|---|---|
| Organisation Documents (+ Manager proposals tab) | `/dashboard/hr/documents/organisation` | HR |
| Document Proposals | `/dashboard/manager/documents/proposals` | managers |
| Company Documents | `/dashboard/{hr,manager,employee}/company-documents` | everyone |

---

## 2. New and changed files

**New — shared org-document layer (`src/shared/documents/`)**

| File | What it holds |
|---|---|
| `orgDocumentMeta.js` | statuses, recipient states, targeting rules, lifecycle predicates, response-shape adapters |
| `orgDocumentPlanes.js` | one capability adapter per audience (hr / manager / self); a missing capability is `null` and the UI hides the action |
| `orgUi.jsx` | org status badge, recipient state badge, the compliance bar |
| `OrgDocumentTable.jsx` | the list HR and managers read |
| `OrgDocumentFormDialog.jsx` | write or edit a draft: metadata, dates, obligations, audience, file |
| `OrgDocumentDetailDialog.jsx` | one document and every action its plane allows |
| `OrgRecipientsSection.jsx` | the roster, the tallies, top-up (#60) and excuse (#61) |

**New — screens**
`roles/hr/documents/screens/OrgDocumentsPage.jsx`, `roles/manager/documents/screens/OrgProposalsPage.jsx`, `shared/screens/IssuedDocumentsPage.jsx`.

**Changed**

| File | Change |
|---|---|
| `shared/api/documents.api.js` | +30 endpoints. Phase-1 calls untouched. |
| `shared/utils/documentErrors.js` | +21 error codes, +5 predicates (`isProposerScopeChanged`, `isDraftAlreadyOpen`, `openDraftId`, `recipientLimitDetail`, `isOrgDocumentStale`) |
| `shared/documents/useDocumentTypes.js` | +`hrOrg` (#5 filtered to `plane=org`) and +`managerOrg` (#62) loaders, each cached under its own key |
| `roles/hr/documents/DocumentTypeFormDialog.jsx` | **the Phase-2 blocker** — see §3 |
| `roles/hr/documents/screens/DocumentTypesPage.jsx` | plane filter, plane label per row, plane-appropriate permission and rule chips |
| `roles/hr/documents/screens/DocumentSettingsPage.jsx` | `manager_can_view_team_documents` description now says it also gates proposals |
| `routes/AppRoutes.jsx`, `shared/components/DashboardSidebar.jsx` | the three new surfaces |

**Reused unchanged:** `documentUpload.js` (the issue → PUT → confirm dance is identical), `documents/ui.jsx`, `DetailDialog` family, `ReasonDialog`, `AttachmentViewerDialog`, `useTargetingOptions` + `withSelected` (attendance already targets on the same six dimensions), `MultiSelectDropdown`, `PersonSelect` / `PersonMultiSelect`.

---

## 3. The blocker that had to be fixed first

`DocumentTypeFormDialog` hard-coded `plane: "employee"` on every type it created, and never exposed `requires_acknowledgement` / `requires_signature`. An org document's type **must** have `plane = 'org'` (R-36), so with no way to create one, **nothing in Phase 2 was reachable** — #43 would have answered `422 DOCUMENT_TYPE_PLANE_MISMATCH` every time.

The form now asks which plane first, fixes it at creation (it is immutable, R-5), and swaps the rule set:

- **employee plane** — unchanged: who can upload/view/delete, verification, expiry, multiples.
- **org plane** — confidentiality, whether managers may propose one, and the acknowledgement / signature **floor** every document of that kind must meet. Upload, verification, expiry and multiples are not sent, because an issued document is not collected, not verified and has an effective window rather than an expiry date.

---

## 4. Contract traps the UI had to respect

1. **A list row cannot tell you the audience.** #52 returns `targeting` as `{ scope, summary, resolved_count }` — no `criteria`, and the six columns are absent too. Reading the arrays there finds them all empty, which would have reported *every* published document as going to everyone. `goesToEveryone()` trusts the frozen `scope` when present and only falls back to the arrays for a draft, which has no snapshot yet. The per-dimension chips wait for the detail read (#55), which does carry `criteria` and the frozen label dictionary.
2. **`display_status` is never recomputed.** It is the server's IST-aware view of the effective window; the client shows it and does no date maths (§2.3).
3. **A replacement file must keep the draft's format.** #45 re-issues the upload link with an **empty body**, and the presigned PUT pins `Content-Type`, so a later file has to be the same type — the form restricts the picker to `[doc.content_type]` and says why. The file *name* was equally fixed; §11.2 covers the announced change that is meant to make it correctable, and what actually shipped.
4. **Targeting merges per dimension** (#44). The form sends all six arrays every time, so what is saved is exactly what is on screen and no hidden dimension survives. A manager's proposal sends `included_users` and nothing else (R-71).
5. **Raise-only flags.** Acknowledgement and signature can be asked for more strictly than the type requires, never less (R-40) — and on an edit the floor also includes what the draft already promises (#44's own wording). The switches are forced on and disabled at the floor, with a note saying which rule is holding them.
6. **Zero recipients is a successful publish** (R-69), not an error. It surfaces as a warning toast and a banner on the document, because silent success here is a compliance false-negative.
7. **`PROPOSER_SCOPE_CHANGED` is answerable.** Publish retries with `override_scope_change: true` after an explicit confirm that names the override as audited (R-73).
8. **Uniform 404.** `DOCUMENT_NOT_FOUND` never distinguishes missing from forbidden, and no copy guesses which.
9. **Reference documents never expose their URL** outside `view-url`, so the viewer is given `fetchReferences` and always resolves through the endpoint.
10. **Opening a document is a write** on the self plane (#72 flips `pending → viewed`). It is a deliberate, visible action, never a background prefetch, and the recipient record is re-read afterwards.

---

## 5. Deliberate gaps

- **Acknowledging and signing are Phase 3.** Recipient states `acknowledged` / `signed` are read and rendered wherever they appear, but nothing in the UI can produce them. Where a document demands a signature, the form and the detail say plainly that the requirement is stored and shown but nobody is asked to sign yet. No button promises something the backend cannot do.
- ~~**An employee cannot see org type names.**~~ Closed by the 2026-09-24 contract note: #70/#71 nest `document_type: { id, name }`. The UI reads it with a fallback to the type index — see §11.1.
- **`compliance` as a document group.** The Phase-2 example response shows `"group": "compliance"`, but Phase 1's validated enum (`phase1_api_analysis.md` §413) does not contain it and Phase 2 changed no Phase-1 shape. The picker was left on the ten known values; `policy` and `disciplinary` cover the org-plane examples. **Worth confirming with the backend.**
- **No reminders or notifications.** Nothing in Phase 2 emails or notifies a recipient; the document appears in Company Documents and the overdue state is shown there.

---

## 6. How it was verified

- `npx vite build` — passes.
- `npx eslint` on every new and changed file — 0 errors. (Pre-existing errors elsewhere, e.g. unused `React` imports in `AppRoutes.jsx`, were left alone.)
- **31 shape-adapter checks** run against the response fixtures copied verbatim from `phase2_api_analysis.md` (#43, #44, #45, #52, #53, #55, #59), covering the create/re-issue id disagreement, the list-vs-detail targeting projections, `counts_by_state` survival, and every lifecycle predicate. This caught two real bugs before review: the audience-scope misread in §4.1, and a double-counting `+N more` in the audience summary.
- **Not done:** no browser click-through and no live API call. Smoke-test the three surfaces in §1 before release.

---

## 7. For the backend team

1. Confirm whether `compliance` is a legal `document_types.group` value (§5).
2. #45's empty body means a draft's declared `file_name` can never be corrected. Intended, or should #44 accept file metadata while `status = 'draft'`?
3. #70 has no way for an employee to learn an org type's **name**. Every card currently falls back to the document title. A `document_type` object on the row, or an employee-readable org-type list, would fix it.

---

## 11. Backend contract note received 2026-09-24 — verification result

A note arrived describing two additive changes. **Neither is live on `development.hrclouds.in`**, and the routes it names do not exist. Verified with an HR token the same day; every probe below sent an empty or no-op body and changed nothing.

### 11.1 `document_type` on the employee endpoints — cannot be verified yet

The note says #70/#71 now nest `document_type: { id, name }`. `GET /documents/me/hr-documents` returns `{"total":0,"rows":[]}` on the dev org, because **publish is broken** (§ the separate bug report) and no recipient row has ever been created. There is nothing to inspect.

**Built anyway, defensively.** `documentTypeName(doc, index)` prefers `doc.document_type.name` and falls back to the type index. It is correct before and after the change lands, so nothing needs revisiting. This closes §7.3.

### 11.2 Draft `file_name` / `reference_url` correction — route confirmed, not yet deployed

The first version of the note named `PATCH /documents/hr-documents/drafts/:id`, which 404s. **A corrected note followed and names `PUT /documents/hr/org-documents/:id` and `PUT /documents/manager/org-documents/:id`** — i.e. #44 and #64, unchanged. There is no breaking route change, and the client already targets these.

On that route both new fields are still **stripped** from the body (re-checked after the corrected note):

```
PUT /documents/hr/org-documents/:id   {"file_name": "<its current value>"}
→ 400 {"message":"\"value\" must have at least 1 key","errorCode":"VALIDATION_ERROR"}

PUT /documents/hr/org-documents/:id   {"reference_url": "https://example.com/x.pdf"}
→ 400  (same — stripped, leaving an empty object)
```

`reference_url` against an s3 draft should answer `409 INVALID_FIELD_FOR_BACKEND` per the note; it answers `400 "at least one key"` instead, so the field is being dropped *before* that check runs. The change has not reached this environment.

**Built anyway, against the route that exists.** The draft form now offers a **File name** field (s3 drafts) and an editable **link** (reference drafts), sent on the existing `PUT`. Only one is ever sent, since the note says the other returns `409 INVALID_FIELD_FOR_BACKEND` — that code is mapped.

Because the field is silently dropped today, the form **compares the saved row against what it sent** and reports *"Draft saved, but the server kept the original file name"* rather than showing a success for a rename that did nothing. That guard is harmless once the backend accepts the field.

### 11.3 Status for the backend team

Route question is **closed** — the corrected note matches #44/#64 and the client needs no change. What remains:

| Item | State on `development.hrclouds.in` |
|---|---|
| `PUT …/org-documents/:id` accepts `file_name` | **not deployed** — stripped (400) |
| `PUT …/org-documents/:id` accepts `reference_url` | **not deployed** — stripped (400), never reaches the 409 |
| `409 INVALID_FIELD_FOR_BACKEND` | unreachable until the above lands; the code is mapped client-side |
| `document_type` on #70/#71 | **unverifiable** — `GET /me/hr-documents` is `{"total":0,"rows":[]}` |
| Publish (#47) | **still 409 `ORG_DOCUMENT_FILE_MISSING`** |

Publish is the one that gates everything else: recipients only materialise there, so until it works no employee has an issued document and `document_type` cannot be observed. See the separate bug report.

The frontend for all three is built and waiting; none of it needs revisiting when these deploy.
