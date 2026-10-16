# AWS S3 Bucket Configuration & Operational Guide

This document is the authoritative technical reference for the AWS S3 Object Storage infrastructure utilized across the HRMS platform (Document Management Module and Payroll Module).

---

## 1. Overview & Architecture

HRMS employs a **binary-free object storage architecture**. Node.js application servers **never** receive, buffer, or stream raw file bytes. Instead:
1. **Uploads**: The backend signs a pre-signed `PUT` URL with cryptographically pinned headers (`Content-Type`, `Content-Length`). The browser or client directly uploads the binary payload to S3.
2. **Downloads / Views**: The backend signs a time-limited pre-signed `GET` URL with controlled `ResponseContentType` and `ResponseContentDisposition` headers. The client views or downloads the file directly from S3.
3. **Verification**: During confirmation, the backend executes `HeadObject` against S3 to verify the object exists, matches the declared byte length, and conforms to the strict MIME allow-list before activating the database record.

### Configuration Fallback Chain (D-5)
The platform supports a unified bucket configuration with backward-compatible fallbacks:
```text
APP_S3_BUCKET         ──(if unset)──> PAYROLL_S3_BUCKET
APP_S3_KMS_KEY_ID     ──(if unset)──> PAYROLL_S3_KMS_KEY_ID
DOCUMENT_UPLOAD_TTL   ──(if unset)──> PAYROLL_ATTACHMENT_UPLOAD_TTL (default 600s)
DOCUMENT_VIEW_TTL     ──(if unset)──> PAYROLL_ATTACHMENT_VIEW_TTL   (default 300s)
```

---

## 2. Bucket Key Naming Conventions

Object keys are strictly constructed server-side. User-supplied file names are **never** used as object keys or path components to prevent path traversal (`../`) attacks.

| Module | Purpose | Key Format Pattern |
|---|---|---|
| **Document Module** | Employee uploaded documents | `org/{orgId}/documents/employee/{userId}/{documentId}` |
| **Payroll Module** | Reimbursement receipts / claims | `org/{orgId}/reimbursement/{claimId}/{attachmentId}` |
| **Payroll Module** | Loan proof documents | `org/{orgId}/loan/{loanId}/{attachmentId}` |
| **Payroll Module** | Tax proof / 80C declarations | `org/{orgId}/tax_declaration/{declarationId}/{attachmentId}` |
| **Payroll Module** | Generated payslip PDFs | `org/{orgId}/payslip/{runId}/{payslipId}.pdf` |

*All path segments (`orgId`, `userId`, `documentId`) are validated against path traversal (`/`, `\`, `..`, NUL bytes) prior to signing.*

---

## 3. S3 Bucket Settings (AWS Console)

### 3.1. General Configuration
* **AWS Region:** `ap-south-1` (Asia Pacific - Mumbai)  
  *(Mandatory for Indian tenant compliance regarding data residency for Aadhaar, PAN, and banking records).*
* **Bucket Name:** Recommended naming convention: `hrms-documents-<environment>-<region>` (e.g., `hrms-documents-prod-ap-south-1`).

---

### 3.2. Public Access Block (Mandatory)
* **Block all public access:** **ON**
  * `BlockPublicAcls`: **Enabled**
  * `IgnorePublicAcls`: **Enabled**
  * `BlockPublicPolicy`: **Enabled**
  * `RestrictPublicBuckets`: **Enabled**

> [!CAUTION]
> Under no circumstances should public access be enabled. Every object contains confidential employee or financial data and must only be accessed via signed URLs.

---

### 3.3. Default Encryption
The bucket supports standard AWS S3-managed encryption (recommended) or AWS KMS customer-managed keys.

#### Standard Configuration (Recommended):
* **Encryption type:** `Server-side encryption with Amazon S3 managed keys (SSE-S3)` (AES-256)
* **Bucket Key:** `Enabled`
* **Blocked encryption types:** `Server-Side Encryption with Customer-Provided Keys (SSE-C)`
* **Cost:** Free (no AWS KMS charges or key management).
* **Environment Variable:** Omit `APP_S3_KMS_KEY_ID` (defaults to `null`).

#### Enterprise KMS Configuration (Optional):
* **Encryption type:** `Server-side encryption with AWS Key Management Service keys (SSE-KMS)`
* **AWS KMS key:** Specify KMS Key ARN
* **Bucket Key:** `Enabled`
* **Environment Variable:** Set `APP_S3_KMS_KEY_ID=arn:aws:kms:ap-south-1:123456789012:key/your-key-uuid`

---

### 3.4. Bucket Versioning
* **Bucket Versioning:** **Enabled**
* **Rationale:** The application uses soft deletes (`status = 'deleted'`). Versioning prevents permanent data loss, enables point-in-time recovery, and satisfies compliance audits.

---

### 3.5. CORS Configuration (Cross-Origin Resource Sharing)
Direct browser uploads via `PUT` and inline views via `GET` require CORS permissions on the S3 bucket.

Navigate to **Bucket > Permissions > Cross-origin resource sharing (CORS)** and paste:

```json
[
  {
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length"
    ],
    "AllowedMethods": [
      "PUT",
      "GET"
    ],
    "AllowedOrigins": [
      "https://app.yourdomain.com",
      "https://development.hrclouds.in",
      "http://localhost:3000",
      "http://localhost:5173"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 300
  }
]
```

> [!IMPORTANT]
> `Content-Type` and `Content-Length` **must** be listed in `AllowedHeaders`. Both headers are cryptographically signed in the `PUT` URL and validated by `HeadObject`.

---

## 4. S3 Lifecycle Rules

Configure two lifecycle rules under **Bucket > Management > Lifecycle rules**:

### Rule 1: Orphan Upload Sweeper
Mitigates abandoned uploads where an upload URL was issued, but the client never uploaded or the database transaction was aborted.
* **Rule Name:** `CleanOrphanUploads`
* **Filter:** Prefix `org/`
* **Lifecycle Actions:**
  * Expire current versions of objects: **1 day** after creation.
  * Delete expired object delete markers or incomplete multipart uploads: **1 day**.

### Rule 2: Statutory Compliance Retention
Ensures records are retained for the statutory 7-year audit requirement before purging.
* **Rule Name:** `StatutoryDocumentRetention`
* **Filter:** Prefix `org/`
* **Lifecycle Actions:**
  * Transition to Glacier Flexible Retrieval: After **365 days** (optional cost optimization).
  * Expire current versions: After **2,555 days (7 years)**.

---

## 5. IAM Permissions & Policies

Attach the following policy to the IAM user or EC2/ECS IAM Task Role running the backend service:

### Standard Policy (For SSE-S3):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HRMSObjectStorageOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Sid": "HRMSBucketMetadataAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    }
  ]
}
```

### Policy with Optional KMS:
If `APP_S3_KMS_KEY_ID` is used:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HRMSObjectStorageOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Sid": "HRMSKMSOperations",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:ap-south-1:123456789012:key/YOUR_KMS_KEY_ID"
    }
  ]
}
```

---

## 6. Application Environment Variables (`.env`)

```env
# ==============================================================================
# AWS S3 OBJECT STORAGE CONFIGURATION
# ==============================================================================

# Bucket Name & Target AWS Region
APP_S3_BUCKET=hrms-documents-prod-ap-south-1
AWS_REGION=ap-south-1

# IAM Credentials (Optional if running on AWS EC2/ECS with IAM Instance Role)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# KMS Key (Optional - omit if using SSE-S3 managed encryption)
# APP_S3_KMS_KEY_ID=arn:aws:kms:ap-south-1:123456789012:key/your-key-uuid

# ==============================================================================
# PRE-SIGNED URL TTL CONFIGURATION (SECONDS)
# ==============================================================================

# Document Module TTLs (Hard caps: Upload max 3600s, View max 900s)
DOCUMENT_UPLOAD_TTL_SECONDS=600       # Default: 10 minutes (600s)
DOCUMENT_VIEW_TTL_SECONDS=300         # Default: 5 minutes (300s)

# Payroll Module TTLs (Fallback defaults)
PAYROLL_ATTACHMENT_UPLOAD_TTL_SECONDS=600
PAYROLL_ATTACHMENT_VIEW_TTL_SECONDS=300
```

---

## 7. Security & Content-Type Allow-List

To protect against stored Cross-Site Scripting (XSS) and malicious file execution:

1. **Allowed MIME Types:**
   * `image/jpeg` (`.jpg`, `.jpeg`)
   * `image/png` (`.png`)
   * `image/webp` (`.webp`)
   * `application/pdf` (`.pdf`)
   * `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`)
   * `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (`.xlsx`)
   * *(Executable formats such as `text/html`, `image/svg+xml`, `text/xml`, and `.exe` are strictly blocked).*

2. **Inline vs. Attachment Policy:**
   * Safe for inline preview (`disposition: inline`): `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
   * Forced download (`disposition: attachment`): `.docx`, `.xlsx`, and any non-previewable formats.

3. **External Reference URLs:**
   * For documents hosted outside S3 (e.g., DocuSign, DigiLocker), only absolute `https://` URLs are permitted.
   * `javascript:`, `data:`, and local IP addresses are rejected by schema validators.

---

## 8. Operational Troubleshooting & Error Codes

| HTTP Status | Error Code | Root Cause | Solution |
|---|---|---|---|
| **503** | `DOCUMENT_STORAGE_UNAVAILABLE` | `APP_S3_BUCKET` is not configured or AWS credentials invalid. | Check `.env` for `APP_S3_BUCKET` and IAM credentials. |
| **403** | `SignatureDoesNotMatch` | Mismatch in signed headers (`Content-Type` / `Content-Length`) during browser upload. | Ensure the client PUT request matches the exact headers returned by the initiate API. |
| **403** | `AccessDenied` | IAM role missing `s3:PutObject`, `s3:GetObject`, or `s3:DeleteObject`. | Update IAM policy attached to the user/role. |
| **400** | `UPLOAD_CONTENT_MISMATCH` | Byte size or MIME type reported by `HeadObject` does not match declared values. | Confirm file was uploaded completely and wasn't altered in transit. |
| **CORS Error** | `No 'Access-Control-Allow-Origin' header` | Origin missing from S3 CORS configuration. | Add frontend domain to S3 bucket CORS `AllowedOrigins`. |
