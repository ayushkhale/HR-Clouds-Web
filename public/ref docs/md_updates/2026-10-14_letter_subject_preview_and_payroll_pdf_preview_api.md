# Engineering Update: Real-Subject Letter Preview API (#271) & Cross-Module Payroll PDF Inline Previews

**Document Date:** 2026-10-14  
**Author:** Principal Backend Engineer  
**Status:** Implemented & Verified in Staging  
**Modules Affected:** `src/modules/document`, `src/modules/payroll`  
**Target Audience:** Frontend Developers, QA Engineers, API Integrators  

---

## 1. Executive Summary

### 1.1 The Problems Solved

1. **The Letter Issuance Preview Gap:**
   - Previously, the system offered two extremes:
     - `POST /api/v1/documents/hr/letter-templates/:code/preview` (API #138): Uses dummy, synthetic sample data (`sample_data`). It does not show real employee facts (employee code, joining date, relieving date, department) or allow verifying field overrides for a specific candidate/employee.
     - `POST /api/v1/documents/hr/letters` (API #139): The official issuance endpoint. It permanently commits an `org_documents` row, allocates an immutable gapless reference number (`ACME/EXP/2026/0001`), saves the PDF permanently to AWS S3, and fires email notifications.
   - **Frontend Consequence:** HR administrators could not visually inspect what a letter would actually look like for a specific employee before permanently issuing it.
   - **Solution:** We introduced **Endpoint #271: `POST /api/v1/documents/hr/letters/preview`**, providing real-subject fidelity with diagonal watermarking (`PREVIEW`) and zero database/storage side effects.

2. **The Payroll PDF Forced-Download Friction:**
   - Previously, all payroll PDF download endpoints (`/me/payslips/:id/pdf`, `/me/annual-statements/:financialYear/pdf`, `/hr/runs/:id/bank-advice/pdf`, etc.) strictly emitted `Content-Disposition: attachment; filename="..."`.
   - **User Consequence:** Whenever an employee or HR manager wanted to simply inspect a payslip, Form 16, or tax calculation summary in a modal dialog or new browser tab, the browser was forced to download the file to the user's hard drive.
   - **Solution:** We enabled **inline PDF streaming** across all payroll endpoints using `?disposition=inline` or `?preview=true` query parameters. Browsers can now stream and preview PDFs directly in modal dialogs without downloading.

---

## 2. Endpoint #271: Real-Subject Letter Preview API

### 2.1 Route & Security Specifications

- **Endpoint:** `POST /api/v1/documents/hr/letters/preview`
- **Method:** `POST`
- **Authentication:** Bearer JWT in `Authorization` header (`Bearer <token>`).
- **Required Role:** `hr` (HR administrators only).
- **Required Feature Flag:** `documents.access`.
- **Response Type:** Binary PDF (`application/pdf`).

### 2.2 Request Headers

| Header | Required | Value | Notes |
| :--- | :---: | :--- | :--- |
| `Authorization` | Yes | `Bearer <JWT>` | Standard HR authentication token. |
| `Content-Type` | Yes | `application/json` | Request payload format. |
| `Idempotency-Key` | **No** | *Do not pass* | Explicitly **rejected** by validation (`unknown(false)`). The backend handles isolated caching internally. |

### 2.3 Request Body Schema

The body matches the structure of `POST /api/v1/documents/hr/letters` (#139), but does not permit an `idempotency_key`:

```json
{
  "template_code": "experience_letter",
  "subject_user_id": "893c528f-78d1-4df2-a3c7-128ff3a4b001",
  "effective_date": "2026-10-14",
  "field_overrides": {
    "closing_note": "We wish John continued success and excellence in his future pursuits."
  }
}
```

#### Field Specifications

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `template_code` | String | **Yes** | Valid template code from the template catalog (e.g., `experience_letter`, `appointment_letter`, `bonafide_letter`, `relieving_letter`, `promotion_letter`). |
| `subject_user_id` | UUIDv4 | **Yes** | The user ID of the employee for whom the letter is being prepared. |
| `effective_date` | String (`YYYY-MM-DD`) | Optional | Pinned date of issuance. Defaults to the current UTC date if omitted. |
| `field_overrides` | Object (Key-Value) | Optional | Free-form narrative field overrides declared as overridable by the template. **Cannot** override derived system facts (e.g., employee name, code, joining date, last working day). |

### 2.4 Safety & Architectural Guarantees (Zero Leaks)

1. **Zero Database Persistence:**
   - Does **not** insert any row into `org_documents` or `document_recipients`.
   - Leaves no orphan database records.
2. **Zero Sequence Allocation:**
   - Does **not** invoke `sequenceRepo.allocate`.
   - Never touches or increments the tenant's gapless reference sequence counters.
3. **Zero AWS S3 Persistence:**
   - Calls the PDF renderer with `persist: false`.
   - The PDF buffer is held in memory and returned directly to the client; no file is written to AWS S3.
4. **Isolated Idempotency Cache:**
   - Uses an isolated cache prefix: `letter:preview:${orgId}:${keySuffix}`.
   - Completely prevents preview renders from polluting or colliding with permanent issuance idempotency keys.
5. **Diagonal Watermark Injection:**
   - Automatically builds the view-model with `isPreview: true`.
   - Injects the standard, semi-transparent diagonal `PREVIEW` watermark across the letter background.
6. **Detached Audit Trail:**
   - Asynchronously logs a lightweight detached audit record with `action: 'letter.subject_preview'` in `document_audit_logs`.
7. **Rate Limiting:**
   - Enforces the tenant preview rate limit (`letter_preview_rate_per_hour`, default 60 requests/hour).
   - Prevents denial-of-service / resource exhaustion on the rendering engine.

### 2.5 Response Format

Upon success, HTTP `200 OK` is returned with the binary PDF stream:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="experience_letter-preview.pdf"
Content-Length: 48920
Cache-Control: no-store, no-cache, must-revalidate
```

### 2.6 Error Response Codes

| HTTP Status | Error Code | Description / Resolution |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Request payload failed Joi validation (invalid UUID, unexpected properties like `idempotency_key`, invalid date format). |
| `404` | `LETTER_TEMPLATE_UNKNOWN` | `template_code` is not registered in the system template catalog. |
| `404` | `DOCUMENT_NOT_FOUND` | `subject_user_id` does not exist in the caller's organization. |
| `409` | `LETTER_TEMPLATE_DISABLED` | The requested letter template is disabled in the tenant's letter configuration. HR must enable it via `PUT /documents/hr/letter-templates/:code/config`. |
| `422` | `PDF_DATA_INCOMPLETE` | The subject's profile is missing required data points (e.g. designation, joining date, or relieving date). Returns `details.missing_fields` listing the incomplete facts. |
| `422` | `LETTER_FIELD_UNKNOWN` | A key in `field_overrides` is not defined in the template schema. |
| `422` | `LETTER_FIELD_OVERRIDE_PROHIBITED` | Attempted to override an auto-derived system fact (e.g., employee designation or joining date). |
| `429` | `PREVIEW_RATE_LIMITED` | Tenant has exceeded the hourly preview quota. Header `Retry-After` indicates seconds until the window resets. |
| `502` / `503` | `PDF_RENDERER_UNAVAILABLE` | Lambda rendering cluster is unreachable. |

---

## 3. Payroll PDF Inline Preview Capability

### 3.1 Overview & Query Parameter Support

All payroll PDF export endpoints across Employee Self-Service, Manager, and HR planes now accept the following optional query parameters:

- `?disposition=inline`
- `?preview=true`

When either parameter is provided:
- The response header is changed from `attachment` to `inline`:
  ```http
  Content-Disposition: inline; filename="payslip_2026-08.pdf"; filename*=UTF-8''payslip_2026-08.pdf
  ```
- Browsers will render the PDF inside the existing viewport, iframe, or dialog rather than prompting to save the file.
- **Safety Invariant:** CSV / Excel downloads (`format=csv`) **strictly enforce `attachment`** regardless of the query parameter.

### 3.2 Supported Payroll Endpoints

| Dashboard | Feature / Document | Endpoint | Preview Query Example |
| :--- | :--- | :--- | :--- |
| **Employee Self-Service** | Monthly Payslip | `GET /api/v1/payroll/me/payslips/:id/pdf` | `GET /api/v1/payroll/me/payslips/2026-08/pdf?preview=true` |
| **Employee Self-Service** | Annual Statement | `GET /api/v1/payroll/me/annual-statements/:financialYear/pdf` | `GET /api/v1/payroll/me/annual-statements/2026-2027/pdf?disposition=inline` |
| **Employee Self-Service** | Tax Computation | `GET /api/v1/payroll/me/tax-computation-summary/pdf` | `GET /api/v1/payroll/me/tax-computation-summary/pdf?preview=true` |
| **Manager** | Subordinate Payslip | `GET /api/v1/payroll/manager/subordinates/:subordinateId/payslips/:id/pdf` | `GET /api/v1/payroll/manager/subordinates/:subId/payslips/2026-08/pdf?preview=true` |
| **HR Administration** | Employee Payslip | `GET /api/v1/payroll/hr/employees/:employeeId/payslips/:id/pdf` | `GET /api/v1/payroll/hr/employees/:empId/payslips/2026-08/pdf?disposition=inline` |
| **HR Administration** | Bank Advice PDF | `GET /api/v1/payroll/hr/runs/:id/bank-advice/pdf` | `GET /api/v1/payroll/hr/runs/:runId/bank-advice/pdf?disposition=inline` |
| **HR Administration** | Statutory Summary | `GET /api/v1/payroll/hr/runs/:id/statutory-summary/pdf` | `GET /api/v1/payroll/hr/runs/:runId/statutory-summary/pdf?disposition=inline` |
| **HR Administration** | F&F Statement PDF | `GET /api/v1/payroll/hr/runs/:id/fnf-statement/pdf` | `GET /api/v1/payroll/hr/runs/:runId/fnf-statement/pdf?preview=true` |

---

## 4. Frontend Integration Guide & Code Samples

### 4.1 Rendering Endpoint #271 in a React / Vue / Vanilla Modal

Because the response is binary PDF data, the frontend should fetch the response as a `blob` and generate an object URL:

```typescript
import axios from 'axios';

interface LetterPreviewPayload {
  template_code: string;
  subject_user_id: string;
  effective_date?: string;
  field_overrides?: Record<string, string>;
}

export async function fetchLetterPreviewPdf(payload: LetterPreviewPayload): Promise<string> {
  try {
    const response = await axios.post('/api/v1/documents/hr/letters/preview', payload, {
      responseType: 'blob', // Crucial: receive as binary Blob
      headers: {
        'Accept': 'application/pdf',
      },
    });

    // Create a local blob URL for iframe embedding or PDF.js viewer
    const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(pdfBlob);
    return objectUrl;
  } catch (error: any) {
    // If backend returns an error JSON, parse the blob to read error code
    if (error.response?.data instanceof Blob) {
      const errorJsonText = await error.response.data.text();
      const errorObj = JSON.parse(errorJsonText);
      throw errorObj; // { success: false, message: "...", errorCode: "PDF_DATA_INCOMPLETE", details: ... }
    }
    throw error;
  }
}
```

#### Embedding in a Modal Dialog:
```jsx
function LetterPreviewModal({ objectUrl, onClose, onConfirmIssue }) {
  return (
    <div className="preview-modal-backdrop">
      <div className="preview-modal-content">
        <div className="preview-header">
          <h3>Letter Preview (Watermarked Draft)</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="preview-body">
          <iframe
            src={objectUrl}
            title="Letter Preview"
            width="100%"
            height="650px"
            style={{ border: 'none' }}
          />
        </div>
        <div className="preview-footer">
          <button className="btn-secondary" onClick={onClose}>Edit Details</button>
          <button className="btn-primary" onClick={onConfirmIssue}>Issue Letter Officially</button>
        </div>
      </div>
    </div>
  );
}
```

### 4.2 Opening Payroll PDFs in a Browser Tab Without Downloading

For payslips, Form 16, or tax summaries, simply pass `?preview=true` or `?disposition=inline`:

```typescript
export function previewPayslip(payslipId: string, authToken: string) {
  // If using an authenticated fetch or service worker:
  fetch(`/api/v1/payroll/me/payslips/${payslipId}/pdf?preview=true`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
    .then((res) => res.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank'); // Opens in new tab without triggering download dialog
    });
}
```

---

## 5. Verification & Test Evidence

### 5.1 Unit Tests Executed

1. **Letter Subject Preview Suite (`tests/unit/pdf/letter_subject_preview.test.js`):**
   - Verified: `#271 previewSubjectLetter renders PDF with is_preview watermark and zero persistence` -> **PASS**
   - Verified: `#271 preview idempotency key differs from issue idempotency key` -> **PASS**
   - Verified: `#271 rate limit: propagates 429 when hourly preview cap is exceeded` -> **PASS**
   - Verified: `#271 disabled template: throws 409 LETTER_TEMPLATE_DISABLED` -> **PASS**
   - Verified: `#271 missing subject in facts service: throws 404 DOCUMENT_NOT_FOUND` -> **PASS**
   - Verified: `#271 validator: rejects unknown keys and rejects idempotency_key` -> **PASS**
   - Verified: `Payroll PDF disposition: supports inline for PDF and retains attachment by default` -> **PASS**
   - Verified: `#271 field_overrides targeting a derived field throws 422 LETTER_FIELD_NOT_OVERRIDABLE` -> **PASS**
   - Verified: `#271 field_overrides naming an undeclared field throws 422 LETTER_FIELD_UNKNOWN` -> **PASS**
   - Verified: `#271 missing required facts throws 422 PDF_DATA_INCOMPLETE` -> **PASS**
   - Verified: `#271 failure salt ceiling reached throws 409 PDF_RETRY_LIMIT_EXCEEDED` -> **PASS**
   - **Total:** 11 passed, 0 failed.

2. **Regression Verification:**
   - `tests/unit/pdf/letter_issue_service.test.js`: All 25 tests passed.
   - `tests/unit/payroll/download_headers.test.js`: All 12 tests passed.
   - `tests/unit/payroll/payslip_service.test.js`: All 32 tests passed.

---

## 6. Summary Checklist for Frontend & QA

- [x] Route `/api/v1/documents/hr/letters/preview` is available for `hr` users.
- [x] Returns HTTP `200` with `Content-Type: application/pdf` and `Content-Disposition: inline`.
- [x] Rendered PDF carries `PREVIEW` diagonal watermark across pages.
- [x] Preview leaves zero traces in `org_documents` and AWS S3.
- [x] Reusing preview does not exhaust letter reference numbers.
- [x] Adding `?preview=true` or `?disposition=inline` to payroll PDF endpoints renders inline in browser viewports.
