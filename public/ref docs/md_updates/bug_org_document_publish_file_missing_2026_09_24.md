# BUG — `POST /org-documents/:id/publish` always returns `409 ORG_DOCUMENT_FILE_MISSING`

**Reported:** 2026-09-24 · **Reporter:** frontend
**Component:** Documents module, Phase 2 (org-issued documents), API #47
**Environment:** `https://development.hrclouds.in/api/v1`
**Severity:** Blocker — **no organisation document can be published at all, on either storage backend.** Every other Phase-2 endpoint (#43–#46, #48–#72) behaves per spec.

---

## 1. Summary

API #47 rejects every publish attempt with:

```json
{ "success": false,
  "message": "Publish requires a confirmed file or a reference url",
  "errorCode": "ORG_DOCUMENT_FILE_MISSING" }
```

…including for drafts that **demonstrably satisfy R-56**. This was verified against a draft whose S3 object is in the bucket, confirmed and checksummed, *and* against a separate reference-backed draft whose `reference_url` is live and retrievable.

`isPublishable` is returning false when it should return true. Because it fails identically on both the `s3` and the `reference` branch, the fault is almost certainly in **how the row is loaded before the check**, not in the check's two conditions.

Nothing is written before the refusal — **no `document_audit_logs` row is created** — so it fails at validation, before the transaction opens.

---

## 2. Impact

- Phase 2 is unusable end to end. HR can author drafts, attach files, edit, delete and read everything, but can never issue a document.
- Recipients are materialised at publish, so `org_document_recipients` stays empty and **all of #59–#61 and #70–#72 are unreachable in practice**.
- Manager proposals (#63–#67) can be created but never actioned, since HR's only approve path is publish.

---

## 3. Subjects used

| | |
|---|---|
| Org | `b782fd72-493e-415d-8b5b-9194b81d294e` |
| Caller role | `hr` (user `71639be3-1a97-4408-8bac-5b8039336755`) |
| S3 draft | `af707e3a-8ebf-405a-811b-75bbb2b5d397` — "Certificate Of Incorporation" |
| Reference draft | `358c5b84-bd51-4caf-b20d-9a285f80864c` — created for this test, since deleted |
| Org type (s3 case) | `95e71aca-fb94-4bfe-89a1-907ef5a9ab0e` |
| Org type (ref case) | `afde43a3-8afa-461b-a8af-13cc36f22127` |

---

## 4. Reproduction

Both paths fail. Substitute a valid HR bearer token for `$T`.

### Path A — S3-backed draft (the original report)

```bash
API=https://development.hrclouds.in/api/v1

curl -s -X POST "$API/documents/hr/org-documents/af707e3a-8ebf-405a-811b-75bbb2b5d397/publish" \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{}'
```

```
HTTP 409
{"success":false,"message":"Publish requires a confirmed file or a reference url",
 "errorCode":"ORG_DOCUMENT_FILE_MISSING"}
```

### Path B — reference-backed draft, from scratch

This is the more useful repro: three calls, no file upload, no S3 involvement at all.

```bash
# 1. create a reference draft. target_job_statuses is set to a value no
#    employee has, so a successful publish would materialise ZERO recipients
#    and touch no real person.
REFID=$(curl -s -X POST "$API/documents/hr/org-documents" \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{
    "document_type_id":"afde43a3-8afa-461b-a8af-13cc36f22127",
    "title":"publish repro",
    "storage_backend":"reference",
    "reference_url":"https://example.com/diagnostic.pdf",
    "target_job_statuses":["ZZ_NO_SUCH_STATUS"]
  }' | jq -r .data.document.id)

# 2. prove the URL was stored — view-url is the only endpoint that returns it
curl -s "$API/documents/hr/org-documents/$REFID/view-url" -H "Authorization: Bearer $T"
# → {"success":true,...,"data":{"view_url":"https://example.com/diagnostic.pdf",
#    "expires_at":null,"file_name":null,"content_type":null}}

# 3. publish
curl -s -X POST "$API/documents/hr/org-documents/$REFID/publish" \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{}'
# → HTTP 409 ORG_DOCUMENT_FILE_MISSING
```

Step 2 proves `org_documents.reference_url` is populated. Step 3 says it isn't.

---

## 5. Proof the preconditions are met (Path A)

R-56 requires `(storage_key AND confirmed_at) OR reference_url`. For `af707e3a…`:

**`GET /org-documents/af707e3a-…` (#55)** — relevant fields:

```json
{ "status": "draft",
  "storage_backend": "s3",
  "file_name": "CERTIFICATE OF INCORPORATION (1).PDF.pdf",
  "content_type": "application/pdf",
  "size_bytes": 536520,
  "checksum_sha256": "c28817293e36e8fe8a4e287aa3d14c74",
  "confirmed_at": "2026-09-23T20:08:09.112Z",
  "created_at":  "2026-09-23T20:08:07.134Z",
  "updated_at":  "2026-09-23T20:08:09.113Z" }
```

**`GET …/audit-logs` (#58)** — the confirm happened, and no publish was ever recorded:

```
2026-09-23T20:08:23.043Z  org_document.viewed          {"backend":"s3","ttl_seconds":300}
2026-09-23T20:08:23.041Z  org_document.viewed          {"backend":"s3","ttl_seconds":300}
2026-09-23T20:08:09.179Z  org_document.file_confirmed  {"size_bytes":536520,"content_type":"application/pdf"}
2026-09-23T20:08:07.208Z  org_document.created         {"scope":"mixed","storage_backend":"s3",...}
```

**`GET …/view-url` (#57)** returns a signed URL built from `storage_key`, so the key is stored:

```
https://hrclouds-developmet.s3.ap-south-1.amazonaws.com/org/b782fd72-493e-415d-8b5b-9194b81d294…
```

**The object is physically in the bucket.** Ranged GET through that signed URL:

```
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-7/536520          ← matches size_bytes exactly
Content-Type: application/pdf
first 8 bytes: 25 50 44 46 2d 31 2e 36   → "%PDF-1.6"
```

So `storage_key` ✓, `confirmed_at` ✓, `checksum_sha256` ✓, real 536,520-byte PDF in S3 ✓ — and publish still says there is no file.

> A plain `HEAD` on that signed URL returns 403. That is expected and not a symptom: presigned URLs are method-scoped and this one is signed for `GET`. Use a ranged `GET` to check object existence.

---

## 6. Why the frontend is ruled out

- The 409 reproduces from **curl**, with no browser involved.
- It reproduces on a draft created **entirely through curl** (Path B), so nothing the app sends is implicated.
- The request body is `{}`, which is what the schema documents as valid (`override_scope_change` optional). `{"override_scope_change":false}` behaves identically.
- No audit row is written, so the request is rejected before the service does any work.
- Every adjacent endpoint on the same rows works: #44 update, #46 confirm, #51 delete, #55 detail, #57 view-url, #58 audit-logs.

---

## 7. Root-cause hypothesis

**`storage_key` and `reference_url` are exactly the two columns that are scrubbed from every list and detail projection** (Phase-2 API guide §2.2: *"`storage_key` — never returned, ever"*, *"`reference_url` — returned only by a `view-url` call"*).

If the publish path loads the row through that **read projection** and then evaluates `isPublishable(doc)` against it, both columns are `undefined` on the in-memory object regardless of what is in the database — so the check can never pass, on either backend. That single mistake explains every observation:

| Observation | Explained? |
|---|---|
| Fails on `s3` despite `confirmed_at` + `storage_key` | yes — `storage_key` scrubbed |
| Fails on `reference` despite a live `reference_url` | yes — `reference_url` scrubbed |
| Fails before any audit row is written | yes — guard runs before the transaction |
| #46 confirm works on the same row | yes — confirm documented to use `findByIdForStorage` |

**Suggested check:** in `document_org.service.js`, compare how `publish` loads the document against how `confirmVersionUpload` does. #46's documented flow is *"Loads row via `findByIdForStorage`"*; if publish uses `findById` / the read-service projection / `LIST_ATTRIBUTES` instead, that is the bug.

This is inferred from black-box behaviour and the documented scrubbing rules — we cannot see the source, so please treat it as a strong lead rather than a diagnosis.

---

## 8. Verifying a fix

Path B above is the cheapest regression test: it needs no file upload and, because `target_job_statuses` matches nobody, a successful publish materialises **zero** recipients. Expected after the fix:

```json
{ "success": true, "message": "Published",
  "data": { "document": { "status": "published", "version": 1, "recipient_count": 0 },
            "recipient_count": 0, "version": 1, "warnings": ["ZERO_RECIPIENTS"] } }
```

Then re-run Path A and expect `status: "published"` with a non-zero `recipient_count` and a `targeting` snapshot.

Worth covering both branches in a test, since a fix applied to only one would leave the other broken and look green.

---

## 9. Frontend status

The frontend is fully wired for #43–#72 and needs no change for this. It reads `confirmed_at` (and, for reference drafts, accepts that the URL is unverifiable client-side) to decide whether to offer Publish, and surfaces `ORG_DOCUMENT_FILE_MISSING` without claiming the user did anything wrong.

One knock-on worth knowing: because publish is the only way to create recipients, **#59, #60, #61, #70, #71 and #72 are wired but have never been exercised against real data.** Once publish works, those six want a second look before release.

---

## 10. Two smaller things, same module

1. **`file_name` can never be corrected.** #45 re-issues the upload URL with an empty body, and #44 does not accept file metadata, so a draft's declared `file_name` is fixed at creation. The document above is named `CERTIFICATE OF INCORPORATION (1).PDF.pdf` with no way to fix it short of deleting the draft. Intended?
2. **#70 gives employees no document-type name.** Rows carry `document_type_id`, but there is no employee-readable org-type endpoint, so the UI can only fall back to the title. A nested `document_type` object on the row would fix it.
