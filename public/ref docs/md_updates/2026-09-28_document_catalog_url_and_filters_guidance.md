# Frontend Integration Guide: Document Type Catalog URL & Query Filters

**Date:** 28 September 2026  
**Target Audience:** Frontend Development Team  
**Module:** Document Module — HR Administration  
**Affected Endpoint:** `GET /api/v1/documents/hr/catalog`  

---

## 1. Problem Statement & Executive Summary

Currently, the frontend application is calling the Document Catalog endpoint with hardcoded / default query parameters:

```http
❌ CURRENT (INCORRECT DEFAULT):
GET https://development.hrclouds.in/api/v1/documents/hr/catalog?activated=false&plane=employee
```

### Why Hardcoding These Defaults Causes Bugs & Confusion:

1. **`plane=employee` completely blinds the user to Org-Plane documents:**
   * In the platform catalog, there are **54 standard document types**:
     * **35 Employee-Plane** (`plane=employee`): Personal documents uploaded by employees (e.g., Aadhaar, PAN, Passport, previous employer experience letters).
     * **19 Organization-Plane** (`plane=org`): Documents issued or published by the company (e.g., **Experience Letter Issued**, **Relieving Letter Issued**, **Appointment Letter**, **Offer Letter**, company policies, warning letters).
   * By hardcoding `plane=employee`, the HR user **cannot see any issued letter templates or company policies**.
   * Consequently, HR cannot activate `experience_letter_issued`. When HR tries to issue an Experience Letter, the backend rejects it with:
     ```json
     {
       "success": false,
       "message": "The document type for this letter is not activated",
       "errorCode": "DOCUMENT_TYPE_NOT_ACTIVATED"
     }
     ```

2. **`activated=false` hides existing active documents:**
   * If a document type has already been activated in the organization, it disappears completely from the user's catalog view.
   * Users cannot see what is already active, cannot manage active types from the catalog, and falsely assume types were deleted or are missing.

---

## 2. Core Frontend Directives

### Directive 1: Keep the Base Request URL Clean by Default
When the Document Catalog page or modal loads, **do not append default query parameters**:

```http
✅ CORRECT (CLEAN BASE URL):
GET /api/v1/documents/hr/catalog
```
*Calling the clean URL returns the complete platform catalog (all 54 types across all planes and statuses) along with each item's per-organization activation status (`is_activated: true | false`).*

---

### Directive 2: Move Filters to Interactive UI Controls
Filters should **only** be applied when the user explicitly interacts with a UI control (tabs, dropdowns, search input, or toggles).

#### Recommended UI Layout & Filter Mapping:

```
+----------------------------------------------------------------------------------------------------+
|  Document Types Catalog                                                                           |
|                                                                                                    |
|  [ Tabs:  All (54)  |  Employee Documents (35)  |  Company Letters & Policies (19) ]               |
|                                                                                                    |
|  [ Filter: All Statuses ▾ ]   [ Filter: All Groups ▾ ]   [ 🔍 Search by name or code...          ] |
+----------------------------------------------------------------------------------------------------+
```

1. **Plane Tabs / Dropdown:**
   * **All (Default):** Do **not** send the `plane` parameter.
   * **Employee Documents:** Send `?plane=employee` (Incoming employee uploads).
   * **Company Letters & Policies:** Send `?plane=org` (Outgoing HR-issued letters & organization policies).

2. **Activation Status Filter:**
   * **All (Default):** Do **not** send the `activated` parameter.
   * **Activated:** Send `?activated=true`.
   * **Not Activated:** Send `?activated=false`.

3. **Group / Category Filter:**
   * **All (Default):** Do **not** send the `group` parameter.
   * **Specific Group:** Send `?group=<group_name>` (e.g., `exit`, `onboarding`, `employment_history`, `policy`, `identity`).

4. **Search Input:**
   * **Empty (Default):** Do **not** send the `q` parameter.
   * **User types query:** Send `?q=<search_text>` (case-insensitive substring match).

---

## 3. Query Parameter Contract

| Parameter | Type | Required | Default | Allowed Values | Frontend Behavior / Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `plane` | String | Optional | None *(shows all planes)* | `'employee'`, `'org'` | **Do not send by default.** Send `'employee'` when viewing employee vault types; send `'org'` when viewing company letter templates or policies. |
| `activated` | Boolean | Optional | None *(shows all)* | `true`, `false` | **Do not send by default.** Send `true` to view active types; send `false` to view unactivated types available to add. |
| `group` | String | Optional | None *(shows all)* | `'identity'`, `'education'`, `'employment_history'`, `'financial'`, `'medical'`, `'background_check'`, `'onboarding'`, `'policy'`, `'disciplinary'`, `'exit'` | Filters by functional document group. |
| `country_code` | String | Optional | None | ISO 2-letter (e.g. `'IN'`) | Filters country-specific statutory types (e.g. Aadhaar, PF, ESIC). |
| `q` | String | Optional | None | Max 200 chars | Matches substring in document `name`. |
| `include_inactive` | Boolean | Optional | `false` | `true`, `false` | Leave as default (`false`). Only set to `true` if showing platform-deprecated types. |

> [!CAUTION]
> Never send empty string values like `?plane=&activated=` or `?q=`. If a filter is clear/unset, omit that query key entirely from the URL string.

---

## 4. Key Catalog Items & Why `plane` Matters

Understanding the difference between `plane: 'employee'` and `plane: 'org'` is critical for proper frontend UX:

| Catalog Item Code | Name | Plane | Group | Real-World Purpose & UI Placement |
| :--- | :--- | :--- | :--- | :--- |
| **`experience_letter`** | Experience Letter | `employee` | `employment_history` | **Incoming Upload**: An employee uploads their past employer's experience letter when joining. |
| **`experience_letter_issued`** | Experience Letter (Issued) | `org` | `exit` | **Outgoing Letter**: HR generates & issues this company-branded letter to an employee on exit. |
| **`relieving_letter`** | Relieving Letter | `employee` | `employment_history` | **Incoming Upload**: Employee uploads relieving letter from previous company. |
| **`relieving_letter_issued`** | Relieving Letter (Issued) | `org` | `exit` | **Outgoing Letter**: HR generates & issues official company relieving letter. |
| **`appointment_letter_issued`** | Appointment Letter (Issued) | `org` | `onboarding` | **Outgoing Letter**: Official company appointment letter issued to new hires. |
| **`offer_letter_issued`** | Offer Letter (Issued) | `org` | `onboarding` | **Outgoing Letter**: Official job offer letter generated by HR. |
| **`leave_policy`** | Leave Policy | `org` | `policy` | **Company Document**: Standard company leave policy document. |

---

## 5. API Response Schema & UI Consumption

When you make a clean call `GET /api/v1/documents/hr/catalog`, each item returns:

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "c97b0cca-95d3-476e-a034-147515ef53c2",
      "code": "experience_letter_issued",
      "name": "Experience Letter (Issued)",
      "plane": "org",
      "group": "exit",
      "description": null,
      "country_code": null,
      "is_statutory": false,
      "default_is_confidential": false,
      "default_employee_can_upload": true,
      "default_employee_can_view": true,
      "default_employee_can_delete": false,
      "default_manager_can_view": false,
      "default_manager_can_request": false,
      "default_requires_verification": false,
      "default_requires_acknowledgement": false,
      "default_requires_signature": false,
      "default_has_expiry": false,
      "default_is_mandatory": false,
      "default_allows_multiple": true,
      "display_order": 45,
      "is_active": true,
      "is_activated": false,
      "org_type_id": null,
      "org_type_is_active": null
    }
  ]
}
```

### UI Implementation Rules for Status & Actions:

1. **Active Badge vs. Inactive Badge:**
   * If `item.is_activated === true`: Display green badge **"Active"**.
   * If `item.is_activated === false`: Display grey/yellow badge **"Not Activated"**.
2. **Action Buttons:**
   * If `item.is_activated === false`: Show **"Activate"** button.
     * Clicking **"Activate"** calls:
       ```http
       POST /api/v1/documents/hr/types/activate
       Content-Type: application/json

       {
         "codes": [item.code]
       }
       ```
   * If `item.is_activated === true`: Show **"Configure / View"** (links to `/api/v1/documents/hr/types/${item.org_type_id}`).

---

## 6. Checklist for Frontend Developers

- [ ] Remove hardcoded `?plane=employee&activated=false` from initial service/Axios calls.
- [ ] Ensure initial page load calls `GET /api/v1/documents/hr/catalog` with zero default query parameters.
- [ ] Provide user-friendly tabs or a filter dropdown for **Plane** (`All`, `Employee Documents`, `Company Letters & Policies`).
- [ ] Provide user-friendly filter for **Status** (`All`, `Activated`, `Not Activated`).
- [ ] Provide an activation button that calls `POST /api/v1/documents/hr/types/activate` with the respective `code`.
- [ ] Test that `experience_letter_issued` and other issued letter types are visible under `plane=org` or when no plane filter is active.
