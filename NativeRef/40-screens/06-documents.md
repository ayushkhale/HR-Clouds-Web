# 06 · Documents — DocumentsHome · MyDocuments · UploadDocument · CompanyDocuments · DocumentRequests · Forms

Phase 7. Web ancestors: `shared/screens/MyDocumentsPage.jsx`,
`IssuedDocumentsPage.jsx`, `MyRequestsPage.jsx`, `FormsLibraryPage.jsx`.

**This is where the More tab's badge comes from.** Two things wait on the
person: company documents to acknowledge, and documents HR has asked them to
upload. Everything else in this module is theirs already.

`errorCode` is the error key in this domain (not `code`).

---

# DocumentsHome

A menu, same shape as PayHome, with live counts.

```
My Documents        12 on file
Company Documents   2 need your acknowledgement     ← fuchsia count
Document Requests   1 waiting on you                ← fuchsia count
Forms & Templates   8 available
```

A count of zero shows **no count**, not "0" — a zero chip reads as a problem.
Each count is a cheap `{ limit: 1 }` read; a failed one drops the chip.

**Field help: none.** Four labels and four counts.

---

# MyDocuments

**For:** the documents the person has given the organisation — ID, address
proof, certificates — and their state.

### Data

```js
documentsAPI.getMyDocuments({ page, limit })   // the list
documentsAPI.getMyDocument(id)                 // the sheet
documentsAPI.getMyVersions(id)                 // the folded history
documentsAPI.myGetViewUrl(id)                  // FRESH on every open
documentsAPI.getMyUploadTypes()                // the upload form's options
documentsAPI.getMyChecklist()                  // what's still missing
documentsAPI.myDeleteDocument(id)
documentsAPI.myReplaceDocument(id, …)
```

### Layout

```
Checklist card — only when getMyChecklist returns anything outstanding
  │ Still needed: PAN card, Address proof        │  → tap: UploadDocument
Button primary "Add a document"
FilterTabs  All · Verified · Waiting · Needs attention
FlatList of Row
  │ PAN card              ● Verified     │
  │ Added 3 Mar · ••••4821               │   ← last 4 only
  tap → RecordSheet
RecordSheet
  SheetGrid  Type · Number (masked) · Added · Verified by
  SheetSection "Versions"  folded, newest first
  footer  [View]  [Replace]  [Delete]
```

The **checklist card is the point of this screen** for a new joiner. Without
it, "what does HR still need from me" has no answer anywhere in the app.

### States

Loading · loaded · empty ("Nothing on file yet. Add the documents your
organisation asked for." + the checklist) · **nothing outstanding** (checklist
card absent entirely — not an empty card saying "nothing") · a rejected
document (`needs_attention`, fuchsia, with the reviewer's reason in the sheet) ·
couldn't load · offline (list from last fetch; View fails clearly).

### Actions

**View** → `AttachmentViewer`, which fetches a **fresh** view URL. Images
inline, PDFs to the OS viewer.

**Replace** → the upload form in replace mode. Creates a new **version**; the
old one stays in history.

**Delete** → `await useConfirm()`:
> **Delete this document?** · HR may ask for it again. Replacing it instead
> keeps the history.

Confidential documents may refuse deletion — gate on what the response allows,
and if deletion isn't offered, the action is **absent**, not disabled.

Emit `ATTENDANCE_EVENTS.DOCUMENT_REQUEST` after an upload that satisfies a
request, so the More badge clears without a reload.

### Field help — the 2 entries already exist

`documents.upload` → `document_number` and `is_confidential`, both shipped in
`fieldHelp.employee.json`. Wire them in the **form**, and wire
`is_confidential` on the list's column header too if the column renders.

The statuses get no ⓘ — routine queue status (§10).

### Traps

- **Document numbers are masked to the last 4.** The full number is never on
  screen and never in a log. The existing hint says so, which is why that field
  has one.
- **`is_confidential` is one-way.** Once confidential, it can't be made visible
  again — the hint says this, and the form must confirm it before saving.
- **Never cache a view URL.** Presigned, ~5 minutes, `Cache-Control:
  private, no-store`. Fetch on open, every time.
- Version history is `getMyVersions`, a second call — load it when the section
  is expanded, not with the sheet.

---

# UploadDocument

Modal form. Three or four fields, so still gridded.

```
FormGrid
  Select    "What kind of document"             full width
  TextField "Number on the document"  ⓘ          full width (if the type wants one)
  DateField "Expires on"   (if the type wants one)
  Toggle    "Keep this private from my manager"  ⓘ   full width
  file picker: Camera · Photos · Files           full width
footer [Cancel] [Add document]
```

**Camera first.** Most documents on a phone are photographed on the spot. Three
sources, one row, named plainly.

### The three-step upload, in order

```
1. myIssueUpload({ type, filename, content_type })  →  { url, key }
2. PUT the bytes to `url`                            ← NOT through request()
3. myConfirmUpload({ key, … })                       ← the record exists now
```

**A failure at step 2 or 3 means there is no document**, and the screen must
say that rather than closing with a toast. Never report success before step 3
returns.

### Validation

Type chosen · a file picked (`_file`) · the number when the type requires it ·
expiry not in the past · **size and type checked locally before step 1** — a
20MB photo rejected by the server after a 40-second upload on mobile data is
the worst failure in this module. Resize images before uploading.

### Field help

The two shipped entries. `_file`, type and expiry are ordinary.

---

# CompanyDocuments

**For:** documents the organisation has issued **to** the person — policies,
letters, contracts — some of which need acknowledging or signing.

**This is the badge's main source.**

### Data

```js
documentsAPI.getMyIssuedDocuments({ compliance_state, page, limit })
documentsAPI.getMyIssuedDocument(id)
documentsAPI.myIssuedGetViewUrl(id)
documentsAPI.acknowledgeIssuedDocument(id, …)
documentsAPI.signIssuedDocument(id, …)
documentsAPI.getMyIssuedEvidence(id)
```

`compliance_state` is the server's own word for "this still needs the person" —
one param, not two requests.

### Layout

```
FilterTabs  Needs you (2) · Acknowledged · All
FlatList of Row
  │ Leave Policy 2026        ● Needs you │
  │ Issued 2 Oct · read by 20 Oct        │    ← the deadline, in words
  tap → RecordSheet
RecordSheet
  the document, read inline
  SheetGrid  Issued · Deadline · State
  footer  [Read it]  [I acknowledge]
```

### Actions

**I acknowledge** — the write that clears the badge.

> **Acknowledge this document?** · You're confirming you've read it. Your
> organisation keeps a record of when.

On success: `emitAttendanceChanged(ATTENDANCE_EVENTS.ACKNOWLEDGEMENT)` —
**mandatory**, and the kind is already in `INBOX_EVENT_KINDS`. Without the emit
the tab badge stays until a restart.

**Sign** where the document requires it — a different action with a different
record (`signIssuedDocument`, evidence via `getMyIssuedEvidence`). Don't
conflate them: an acknowledgement is "I read this", a signature is a signature.

**Require the document to have been opened before acknowledging.** Not a
scroll-to-bottom gate (people fight it), but Acknowledge stays **disabled with
a `disabledReason`** — "Open it first" — until View has been tapped. That is
the §11-legal disabled case: pressing cannot fix it, opening can.

### States

Loading · loaded · **nothing needs you** ("Nothing to acknowledge. You're up to
date.") · overdue (fuchsia, never rose — a deadline is not an error) ·
acknowledged (the date, in words) · couldn't load · offline (**Acknowledge
fails clearly and is never queued** — an acknowledgement is a compliance
record with a server timestamp).

### Field help — 2 entries

```json
"documents.issued": {
  "kind": "list", "workspaces": ["employee"],
  "description": "Company documents issued to me — acknowledgement and signing",
  "fields": {
    "compliance_state": {
      "hint": "Whether this document still needs something from you. Acknowledging records that you've read it.",
      "askMaya": { "enabled": true, "question": "What does it mean to acknowledge a company document in HR Clouds, and what is recorded when I do?" }
    },
    "acknowledgement_deadline": {
      "hint": "The date your organisation expects you to have read this by. Missing it doesn't lock anything — it's visible to HR.",
      "askMaya": { "enabled": true, "question": "What happens if I don't acknowledge a company document before its deadline?" }
    }
  }
}
```

Both are ours and nobody guesses them. Two entries, under the cap.

### Traps

- **The badge and this list must agree.** Both read
  `compliance_state: 'pending'`; the badge counts, the list shows. A different
  filter in either place means a badge that never clears.
- **Deadline overdue is fuchsia.** rose is for errors and destructive actions
  only (§5).
- Never show the issued-document id, in the row or in the acknowledgement
  toast.

---

# DocumentRequests

**For:** "HR has asked you for something." The second half of the badge.

### Data

`documentsAPI.getMyDocumentRequests({ status, page, limit })`

### Layout

```
FilterTabs  Waiting on you (1) · Done · All
FlatList of Row
  │ Address proof          ● Waiting     │
  │ Asked 2 Oct by HR · needed by 20 Oct │
  └ Upload ──────────────────────────────┘   ← a real action, in the row
  tap → RecordSheet (what was asked, why, by when)
```

**"Asked by HR"**, never a name you had to resolve from an id — if the server
sends a requester id, resolve it through `useDirectory`'s `nameOf`, which reads
**"Loading…"** then a name, and **"Unknown employee"** if it can't resolve. An
id never reaches the screen (§4).

### Actions

**Upload** → `UploadDocument` prefilled with the requested type, and on
success it satisfies the request. Emit
`ATTENDANCE_EVENTS.DOCUMENT_REQUEST`.

### States

Loading · loaded · **nothing waiting** ("Nothing's been asked of you.") ·
overdue (fuchsia) · satisfied (the uploaded document named, linking to
MyDocuments) · couldn't load · offline.

### Field help

**No field qualifies.** The screen is a list of plain-English requests with
dates, and the sheet restates the ask. §10: nothing where the screen already
explains itself.

---

# Forms

**For:** blank forms and templates the organisation publishes — a reimbursement
form, a declaration template.

### Data

`documentsAPI.getPublishedTemplates({ page, limit })` ·
`getPublishedTemplateDownloadUrl(id)`

### Layout

```
FilterTabs by category, if the API groups them
FlatList of Row
  │ Travel reimbursement form            │
  │ PDF · updated 1 Sep                  │
  └ Download ────────────────────────────┘
```

No row opens anything beyond the download — so **no `rowPreviewProps`**, and
the row must not look tappable (§3).

### Actions

**Download** → `downloadFile(getPublishedTemplateDownloadUrl(id), { open: true })`.

### States

Loading · loaded · empty ("Your organisation hasn't published any forms.") ·
couldn't load · download failed (a toast) · offline.

### Field help

**No field qualifies.** A list of file names.

---

## Field-help outcome for this spec

| Surface | Entries |
|---|---|
| `documents.home` | **0** |
| `documents.upload` | **2, already shipped** (`document_number`, `is_confidential`) |
| `documents.mine` (list) | **0** — routine status |
| `documents.issued` | **2 new** (`compliance_state`, `acknowledgement_deadline`) |
| `documents.requests` | **0** — the screen explains itself |
| `documents.forms` | **0** |

Two new entries for the whole module, both on the one screen with a concept
people have never met. Every one has an Ask Maya question.
