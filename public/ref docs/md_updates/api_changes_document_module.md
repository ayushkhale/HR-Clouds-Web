# Document Module API Changes

This document outlines the recent changes made to the Document Module API contracts that the frontend team needs to be aware of.

## 1. Employee View APIs: Added `document_type` Name
**Endpoints Affected:**
- `GET /api/v1/documents/me/hr-documents` (Employee Document List)
- `GET /api/v1/documents/me/hr-documents/:id` (Employee Document Detail)

**Change Details:**
Previously, the document payload in the employee view lacked the document type's name. We have updated the response payload to include a nested `document_type` object containing the `id` and `name`.

**Previous Response:**
```json
{
  "document": {
    "id": "uuid",
    "title": "Employee Handbook",
    "status": "published",
    "document_type_id": "type-uuid"
  }
}
```

**New Response:**
```json
{
  "document": {
    "id": "uuid",
    "title": "Employee Handbook",
    "status": "published",
    "document_type_id": "type-uuid",
    "document_type": {
      "id": "type-uuid",
      "name": "Company Policy"
    }
  }
}
```
**Frontend Action Required:** You can now display `document.document_type.name` in the UI wherever the document type name is needed.

---

## 2. Update Draft APIs: Added Support for Correction of `file_name` and `reference_url`
**Endpoints Affected:**
- `PUT /api/v1/documents/hr/org-documents/:id` (HR Update Draft)
- `PUT /api/v1/documents/manager/org-documents/:id` (Manager Update Draft)

**Change Details:**
You can now send `file_name` and `reference_url` in the request body to correct them when updating a draft. 

**Validation Rules:**
- `file_name` (string, max 255 chars): Only allowed if the document's `storage_backend` is `s3`. Sending this field for a `reference` backend document will return a `409 INVALID_FIELD_FOR_BACKEND` error.
- `reference_url` (string, max 1000 chars, valid URL): Only allowed if the document's `storage_backend` is `reference`. Sending this field for an `s3` backend document will return a `409 INVALID_FIELD_FOR_BACKEND` error.

**Example Request (S3 Backend):**
```json
{
  "title": "Updated Policy Title",
  "file_name": "Corrected_Handbook_2026.pdf"
}
```

**Example Request (Reference Backend):**
```json
{
  "title": "Updated Link",
  "reference_url": "https://company.sharepoint.com/documents/policy-v2"
}
```
**Frontend Action Required:** If you provide UI for HRs or Managers to rename a file they uploaded to a draft, or to fix a broken external URL, you can now pass these fields directly into the standard `PUT` request.
