# 07 · Documents domain

Three separate collections that look similar and behave differently. Getting
them confused is the main risk here.

| Collection | Path | Whose | What the employee does |
|---|---|---|---|
| **My own documents** | `/documents/me/documents` | theirs, uploaded by them | upload · replace · delete · view |
| **Company documents** | `/documents/me/hr-documents` | the org's, **issued to them** | read · **acknowledge** · **sign** |
| **Blank forms** | `/documents/templates` | nobody's | download |

Plus two self-plane reads: **document requests** HR has made of them, and their
**checklist**.

> These are **not** sub-paths of each other. `ME`, `ME_ORG`, `ME_SELF` and `TPL`
> are deliberately separate constants in the api module. Mixing them up gets you
> a 404 that looks like a permissions problem.

---

## 1. My Document Home — the composed read

```js
documentsAPI.getMyComposedDocuments({ sections, limit });   // GET /documents/me/documents/all
```

Everything of theirs in one call: their own documents, the company documents
addressed to them, the blank forms they can download, and (if payroll is on)
their payslips.

**Two properties shape the whole screen** (T19):

### Sections fail independently

```jsonc
"payslips": { "available": false, "reason": "Payroll is not enabled" }
```

**No section's failure may blank the screen.** Render the sections you got; the
failed one gets a quiet one-line note, not an error state and not an empty card
with a heading.

### No item carries a signed URL

Each item has **`access.path`** — the endpoint to call when the person actually
taps it. That is why a 60-item home screen costs nothing and logs nothing until
something is opened.

**Do not pre-fetch those URLs.** You would be generating audit-logged access
events for documents nobody opened.

```js
// on tap, not on render
const { url } = await request(item.access.path);
openAttachment(url);
```

`limit` caps **each** section and is ≤ 100.

---

## 2. My Personal Documents

```js
documentsAPI.getMyUploadTypes()                  // which types they may upload
documentsAPI.getMyDocuments({ status, type, page, limit })
documentsAPI.getMyDocument(id)
documentsAPI.getMyVersions(id)
documentsAPI.myGetViewUrl(id, { disposition })
documentsAPI.myIssueUpload(payload)              // step 1
documentsAPI.myConfirmUpload(id)                 // step 3
documentsAPI.myReplaceDocument(id, payload)      // new version
documentsAPI.myDeleteDocument(id)
```

### Upload — the same three steps as everywhere else

```
1. POST /documents/me/documents  { document_type, file_name, content_type, file_size,
                                   document_number?, is_confidential?, expires_on? }
     → { id, upload_url }
2. PUT the bytes to upload_url   (no Bearer token, exact Content-Type)
3. POST /documents/me/documents/:id/confirm
```

**Miss step 3 and the document exists in storage but not on the record.**

Sources on mobile: **camera**, gallery, file picker. Compress photos (0.8, max
2000px). A PAN card photo doesn't need 5 MB.

### Form fields and their ⓘ

| Field | ⓘ | Note |
|---|---|---|
| `document_type` | — | From `getMyUploadTypes()`. Never a free-text type |
| `document_number` | ✔ | `documents.upload` |
| `is_confidential` | ✔ | `documents.upload` — it changes who can see it, so the hint says **who** |
| `expires_on` | — | Ordinary date |
| file | — | |

Note `documents.upload` is a **shared** surface — HR and managers use the same
dialog on web — which is why its entries carry a workspace gate and are written
in a voice that reads right to all three.

### Status

| Status | Label |
|---|---|
| `pending_verification` | Waiting for HR to check |
| `available` | Available |
| `verified` | Verified |
| `rejected` | Rejected |
| `expired` | Expired |
| `superseded` | Replaced by a newer version |

`status` has an ⓘ on the filter (`documents.my_documents`).

### Replace vs delete

- **Replace** creates a new version; the old one becomes `superseded` and stays
  in history. This is what someone wants 90% of the time.
- **Delete** removes it. Confirm, and say what's lost:
  > **Delete this document?** · HR will no longer see it, and you'll need to
  > upload it again if it's asked for.

A document used as **leave evidence** cannot be freely deleted — the server will
refuse. Map the code rather than guessing.

---

## 3. My Company Documents

Documents the organisation issued **to them**: policies, letters, handbooks.

```js
documentsAPI.getMyIssuedDocuments({ compliance_state, page, limit })
documentsAPI.getMyIssuedDocument(id)
documentsAPI.myIssuedGetViewUrl(id, { disposition })
documentsAPI.acknowledgeIssuedDocument(id)        // body is exactly { confirm: true }
documentsAPI.signIssuedDocument(id, signerName)   // { signer_name }
documentsAPI.getMyIssuedEvidence(id)              // read the evidence back
```

### Compliance state — the filter and the point of the screen

| `compliance_state` | Label |
|---|---|
| `pending` | Waiting for you |
| `overdue` | **Overdue** |
| `completed` | Done |
| `waived` | Not needed |

`compliance_state` has an ⓘ (`documents.company_documents`).

**"Waiting for you" rather than "Pending"** — on this screen the person *is* the
blocker, and saying so is the screen's whole job. `overdue` is the one place
outside errors where rose is correct.

### Acknowledge vs sign

| | Acknowledge | Sign |
|---|---|---|
| Call | `POST …/acknowledge` with `{ confirm: true }` | `POST …/sign` with `{ signer_name }` |
| Means | "I've read this" | A named attestation |
| UI | A checkbox + button, **after** the document has been opened | A name field + button |
| Button | **I've read this** | **Sign** |

Rules:

- **Do not enable the acknowledge control until the document has been opened.**
  An acknowledgement of something unread is worthless to the organisation and
  unfair to the employee.
- Acknowledging is **not reversible**. Confirm it.
- After success, read the evidence back (`getMyIssuedEvidence`) and show it:
  when, from which device. People ask.
- Emit a refresh so the badge and the list clear **without a reload**.

### Deep link

`company-documents/:documentId` — transactional emails and push both point here
(web contract 2026-10-08). From a cold start: store the intent, run auth, run
the **role gate**, then navigate. Never drop the person on Home having forgotten
what they tapped.

---

## 4. My Document Requests

```js
documentsAPI.getMyDocumentRequests({ status, page, limit });
documentsAPI.getMyChecklist();
```

What HR (or a manager) has asked the employee to provide, and what's still
missing from their file.

| Status | Label |
|---|---|
| `pending` | Waiting for you |
| `fulfilled` | Done |
| `cancelled` | Cancelled |
| `overdue` | **Overdue** |

Each request names the document type, who asked, when, and the due date. The
action is **Upload** — and it should carry the request's `document_type` straight
into the upload form so the person doesn't pick it themselves and get it wrong.

The **checklist** is the same information from the other direction: "your file
is missing X, Y, Z". Show it as a short list on the Documents home, with the
missing items tappable into an upload.

This is the screen that most justifies a tab badge. Someone being chased for a
PAN card by email will deal with it on a phone.

---

## 5. Blank Forms

```js
documentsAPI.getPublishedTemplates({ q, page, limit });
documentsAPI.getPublishedTemplateDownloadUrl(id);
```

Blank company forms — a leave form, a reimbursement form, a declaration.
Published templates only.

Deliberately **not** in the web sidebar ("a form belongs to nobody"); reached
from My Document Home. Keep that: a **card** on the Documents home, not a tab.

Download → OS viewer or share sheet. Nothing to upload here.

---

## 6. The attachment bridge

```js
documentsAPI.getAttachmentViewUrl(id, { disposition });   // /documents/attachments/:id/view-url
```

One stored path serves three readers — the applicant, their manager chain and
HR. **The server works out which you are from your token**; anybody else gets a
uniform 404.

This is what a **leave attachment** resolves through. A leave request's
`document_url` may hold the relative path
`/api/v1/documents/attachments/:id/view-url`, which is **not a URL a client can
follow** (T9). Always go through this endpoint.

`disposition`: `inline` to show, `attachment` to save.

---

## 7. Viewing a document

```
tap
 └─ fetch a FRESH view-url  (the last one has expired — T21)
      ├─ image → AttachmentViewer, pinch-zoom, inline
      └─ PDF / anything else
           └─ blob-util download to cache → FileViewer.open()
```

- **Never a webview.** A PDF in a webview on Android is a blank page about a
  third of the time.
- The server sends `Cache-Control: private, no-store` on these, which is why a
  preview is **re-fetched on every open** rather than remembered. Respect it.
- Clean the cache directory on sign-out — a cached payslip PDF outliving the
  session is a real leak.

---

## 8. Error copy — the uniform denial

`DOCUMENT_NOT_FOUND` is the **one** code for every `…/documents/:id` route:
missing, another org, outside your team, confidential, or not yours.

**The wording must not guess which:**

> "This document isn't available any more. It may have been removed, or you may
> no longer have access to it. Refresh to see the latest."

`REQUEST_NOT_FOUND` is its Phase-4 twin for `…/document-requests/:id`. Both read
the same to the user.

> `TEMPLATE_NOT_FOUND` is **overloaded** — a blank company form in Phase 5, a
> letter template in PDF Phase 1. This app only ever means the blank form, so
> the default mapping is right. Don't "unify" the two.

Document **type codes** never appear raw: `humanizeCode()` turns
`experience_letter_issued` into "Experience letter".

---

## 9. Refresh

There is no document-specific event kind on the bus. Acknowledgements and
uploads change the **More** tab's badge, so:

```js
// after acknowledge / sign / fulfilling a request
emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG);   // or add a DOCUMENT kind
```

**Recommendation:** add `DOCUMENT: 'document'` to `ATTENDANCE_EVENTS` and to
`INBOX_EVENT_KINDS` in the native `lib/events.js`, and subscribe the badge to
it. The web bus is "app-wide despite the folder" by design, and a new queue
joins that list **on the day it is added** — or its badge goes stale until a
restart.

---

## 10. Documents checklist

- [ ] The four collections kept distinct (`ME`, `ME_ORG`, `ME_SELF`, `TPL`)
- [ ] Composed home: sections fail independently, none blanks the screen
- [ ] `access.path` resolved **on tap**, never pre-fetched
- [ ] Upload is three steps and **confirmed**
- [ ] Photos compressed before upload
- [ ] Upload type comes from `getMyUploadTypes()`, never free text
- [ ] A request's upload carries its `document_type` through
- [ ] Acknowledge disabled until the document has been **opened**
- [ ] Acknowledge body is exactly `{ confirm: true }`; sign sends `signer_name`
- [ ] Acknowledgement confirmed, irreversible, evidence shown back
- [ ] "Waiting for you", not "Pending", on the two chase screens
- [ ] `overdue` is rose; nothing else on these screens is
- [ ] Type codes through `humanizeCode()`
- [ ] A fresh `view-url` on every open; none cached
- [ ] PDFs to the OS viewer, never a webview
- [ ] Cache cleared on sign-out
- [ ] `DOCUMENT_NOT_FOUND` wording doesn't guess the reason
- [ ] Deep link `company-documents/:id` works from a cold start, through the
      role gate
- [ ] Blank Forms is a card on the home, not a tab
- [ ] The three document ⓘ surfaces wired (`documents.upload`,
      `documents.my_documents`, `documents.company_documents`)
