# Frontend Integration Guide: Payroll PDF Template Catalog & Visual Preview APIs

**Author:** Senior Backend Engineering Team  
**Target Audience:** Frontend Engineers (React / Next.js / Vue / UI Platform)  
**Module:** Payroll HR Administration  
**Endpoints:** API #225 (`GET /pdf-templates`) & API #226 (`POST /pdf-templates/:code/preview`)  
**Base URL:** `/api/v1/payroll/hr`  
**Authentication:** Bearer Token (JWT)  
**Required Role:** `hr` (User must possess HR permissions and the `payroll.access` feature flag)

---

## 1. Overview & Business Use Case

In HRMS, HR Administrators need to verify how documents look with their company's branding (logo, registered address, statutory identifiers, digital signatures, brand colors) before publishing payroll runs or generating tax certificates.

Previously, HR could only view rendered PDFs after creating real employees and processing actual payroll runs.

With **API #225** and **API #226**, the frontend can now provide:
1. **A Template Selector / Gallery:** Dynamically list all registered payroll document templates.
2. **Instant In-Browser Visual Preview:** Render high-fidelity, production-grade PDF previews in an `<iframe>`, modal, or PDF viewer instantly—using dummy sample data automatically enriched with the organization's **live logo**, **watermark**, and **letterhead profile**.
3. **Interactive What-If Overrides:** Optionally pass field overrides (e.g., custom employee name, pay period title) to test how different content fits on the page.

---

## 2. API Endpoints Specification

### 2.1 API #225: List Payroll PDF Templates

Fetches the catalog of all available payroll templates so the frontend can populate dropdown menus, preview tabs, or document cards.

* **HTTP Method:** `GET`
* **Route:** `/api/v1/payroll/hr/pdf-templates`
* **Headers:**
  ```http
  Authorization: Bearer <token>
  Accept: application/json
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Payroll PDF templates retrieved",
    "data": [
      {
        "code": "payslip",
        "title": "Salary Payslip",
        "audience": "payroll",
        "layout": null,
        "format": "A4",
        "landscape": false,
        "current_version": 1,
        "required_fields": [
          "header", "employee_name", "employee_code", "identity_grid",
          "earnings", "deductions", "net_pay", "net_pay_in_words", "notes", "footer_text"
        ],
        "optional_fields": [
          "reimbursements", "employer_contributions"
        ]
      },
      {
        "code": "annual_statement",
        "title": "Annual Salary Statement",
        "audience": "payroll",
        "layout": null,
        "format": "A4",
        "landscape": true,
        "current_version": 1,
        "required_fields": [
          "header", "employee_name", "employee_code", "identity_grid",
          "salary_grid", "ytd_summary", "notes", "footer_text"
        ],
        "optional_fields": []
      },
      {
        "code": "form16_part_b",
        "title": "Form 16 (Part B) Certificate",
        "audience": "payroll",
        "layout": null,
        "format": "A4",
        "landscape": false,
        "current_version": 1,
        "required_fields": [
          "header", "employee_name", "employee_code", "identity_grid",
          "salary_breakdown", "tax_computation", "verification", "footer_text"
        ],
        "optional_fields": []
      },
      {
        "code": "fnf_statement",
        "title": "Full & Final Settlement Statement",
        "audience": "payroll",
        "layout": null,
        "format": "A4",
        "landscape": false,
        "current_version": 1,
        "required_fields": [
          "header", "employee_name", "employee_code", "identity_grid",
          "earnings", "deductions", "recoveries", "net_payable", "notes", "footer_text"
        ],
        "optional_fields": []
      },
      {
        "code": "payroll_report",
        "title": "Payroll Summary & Component Report",
        "audience": "payroll",
        "layout": null,
        "format": "A4",
        "landscape": true,
        "current_version": 1,
        "required_fields": [
          "header", "columns", "rows", "totals_row", "footer_text"
        ],
        "optional_fields": []
      },
      {
        "code": "bank_advice",
        "title": "Bank Disbursement Advice",
        "audience": "payroll",
        "layout": null,
        "format": "A4",
        "landscape": true,
        "current_version": 1,
        "required_fields": [
          "header", "columns", "rows", "totals_row", "signatory", "footer_text"
        ],
        "optional_fields": []
      }
    ]
  }
  ```

---

### 2.2 API #226: Preview Payroll PDF Template

Renders and streams the binary PDF for a requested template code.

* **HTTP Method:** `POST` (preferred) or `GET` (zero-body shorthand)
* **Route:** `/api/v1/payroll/hr/pdf-templates/:code/preview`
* **URL Parameters:**
  - `code` (string, required): One of `payslip`, `annual_statement`, `form16_part_b`, `fnf_statement`, `payroll_report`, `bank_advice`.
* **Headers:**
  ```http
  Authorization: Bearer <token>
  Accept: application/pdf
  Content-Type: application/json
  ```
* **Request Body (Optional for POST):**
  You can supply an empty body `{}` to render pure golden sample data with the organization's branding, or pass `override_fields` to customize specific values:
  ```json
  {
    "override_fields": {
      "employee_name": "Aman Sharma",
      "employee_code": "EMP-9001",
      "header": {
        "title": "Salary Payslip",
        "subtitle": "Pay Period October 2026"
      }
    }
  }
  ```
* **Response:**
  - **Status:** `200 OK`
  - **Content-Type:** `application/pdf`
  - **Content-Disposition:** `inline; filename*=UTF-8''<code\>-preview.pdf`
  - **Cache-Control:** `private, no-store`
  - **Body:** Raw binary PDF bytes (`Buffer` / `Blob`).

---

## 3. Template Codes Reference Table

| Template Code | Document Title | Page Size | Orientation | Best Used In UI |
| :--- | :--- | :---: | :---: | :--- |
| **`payslip`** | Salary Payslip | A4 | **Portrait** | Monthly payroll review, employee payslip preview tab |
| **`annual_statement`** | Annual Salary Statement | A4 | **Landscape** | Financial year tax planning / salary grid modal |
| **`form16_part_b`** | Form 16 (Part B) Certificate | A4 | **Portrait** | Year-end tax filing preview & compliance panel |
| **`fnf_statement`** | Full & Final Settlement | A4 | **Portrait** | Employee offboarding / exit settlement screen |
| **`payroll_report`** | Payroll Summary Register | A4 | **Landscape** | Monthly reconciliation report preview |
| **`bank_advice`** | Bank Disbursement Advice | A4 | **Landscape** | Salary disbursement / NEFT batch preview |

---

## 4. Frontend Integration Code Examples

### 4.1 React / Next.js Implementation

```tsx
import React, { useState, useEffect } from 'react';

interface PdfTemplate {
  code: string;
  title: string;
  format: string;
  landscape: boolean;
}

export const PayrollTemplatePreviewModal: React.FC<{ token: string; isOpen: boolean; onClose: () => void }> = ({
  token,
  isOpen,
  onClose,
}) => {
  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('payslip');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch available templates catalog
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/v1/payroll/hr/pdf-templates', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setTemplates(res.data);
          if (res.data.length > 0 && !selectedCode) {
            setSelectedCode(res.data[0].code);
          }
        }
      })
      .catch((err) => setError('Failed to load template catalog'));
  }, [isOpen, token]);

  // 2. Fetch and render preview PDF blob
  useEffect(() => {
    if (!isOpen || !selectedCode) return;

    let activeBlobUrl: string | null = null;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/payroll/hr/pdf-templates/${selectedCode}/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/pdf',
      },
      body: JSON.stringify({}), // Optional override_fields can be supplied here
    })
      .then(async (response) => {
        if (!response.ok) {
          // If server returned JSON error (e.g. 404, 502)
          const errorJson = await response.json().catch(() => null);
          throw new Error(errorJson?.message || `Render failed with status ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        activeBlobUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(activeBlobUrl);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });

    // Clean up previous blob URL to avoid browser memory leaks
    return () => {
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [selectedCode, isOpen, token]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[90vh] w-[95vw] max-w-6xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900">Payroll PDF Document Preview</h2>
            <select
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium shadow-sm focus:border-blue-500 focus:outline-none"
            >
              {templates.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.title} ({t.landscape ? 'Landscape' : 'Portrait'})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* PDF Viewer Body */}
        <div className="relative flex-1 bg-gray-100">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <div className="text-center font-medium text-gray-600">Rendering preview with live branding...</div>
            </div>
          )}

          {error && (
            <div className="flex h-full items-center justify-center p-6 text-red-600">
              <p>Error: {error}</p>
            </div>
          )}

          {pdfBlobUrl && !loading && (
            <iframe
              src={pdfBlobUrl}
              title="Payroll PDF Preview"
              className="h-full w-full border-none"
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

---

### 4.2 Vanilla JavaScript / Fetch Helper

```javascript
/**
 * Opens a payroll PDF preview directly in a new browser tab.
 * @param {string} templateCode - e.g. 'payslip' or 'form16_part_b'
 * @param {string} authToken - Bearer JWT
 * @param {object} [overrides] - Optional field overrides
 */
async function openPayrollPdfPreview(templateCode, authToken, overrides = {}) {
  try {
    const response = await fetch(`/api/v1/payroll/hr/pdf-templates/${templateCode}/preview`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/pdf'
      },
      body: JSON.stringify({ override_fields: overrides })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed to render PDF');
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } catch (error) {
    console.error('Preview error:', error);
    alert(`Could not generate preview: ${error.message}`);
  }
}
```

---

## 5. Error Handling Best Practices

When calling the preview endpoint, the response can be either binary `application/pdf` (on success) or a JSON error envelope (on failure). Frontend network interceptors (e.g. Axios or Fetch wrappers) should handle this difference gracefully:

```typescript
async function fetchPdfPreview(code: string, token: string) {
  const res = await fetch(`/api/v1/payroll/hr/pdf-templates/${code}/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    // Attempt to read JSON error body
    let errorMessage = 'An error occurred while generating the PDF.';
    try {
      const errorJson = await res.json();
      errorMessage = errorJson.message || errorMessage;
    } catch {
      errorMessage = `Server returned status ${res.status}: ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return await res.blob();
}
```

### Common HTTP Error Codes

| Status Code | Error Code | Cause & Recommended Action |
| :--- | :--- | :--- |
| **`400`** | `VALIDATION_ERROR` | Malformed `:code` parameter or override body. Check template code casing. |
| **`401`** | `UNAUTHORIZED` | Missing or expired JWT. Redirect user to login. |
| **`403`** | `FORBIDDEN` | Caller lacks `hr` role or `payroll.access` feature flag is inactive for this tenant. |
| **`404`** | `TEMPLATE_NOT_FOUND` | Template code does not exist in the catalog. Refresh template catalog via `GET /pdf-templates`. |
| **`502`** | `PDF_RENDERER_UNAVAILABLE` | External PDF rendering engine is temporarily unreachable. Display retry button to user. |

---

## 6. Branding & Performance Notes

1. **Automatic Branding Enrichment:**  
   The backend automatically fetches and inlines the organization's high-resolution logo (up to 512 KB), background watermark, statutory row (CIN, GSTIN, PAN, TAN), and authorized signatory from Document Letterhead Branding. The frontend does not need to pass branding parameters.
2. **Memory Cleanup:**  
   Always remember to call `URL.revokeObjectURL(blobUrl)` when unmounting preview components or switching template tabs to avoid memory leaks in the browser.
3. **No Database Writes:**  
   These preview endpoints are completely idempotent and **persist zero records** to the database (`persist: false`). You can safely call them repeatedly for live previews.
