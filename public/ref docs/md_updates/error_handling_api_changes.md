# Global Error Handling — Frontend Integration Update

This document outlines the API response structure changes resulting from the recent **Backend Error Handling Standardization**. 

These changes guarantee that **100% of all error responses** across the entire HRMS backend (`auth`, `attendance`, `leave`, `organization`, etc.) now share the exact same JSON schema. No success responses (200/201) were altered.

---

## 1. Global Error Schema Standardization
**Affected Endpoints:** All APIs across the entire application.

### What Changed
Previously, many controllers manually returned 400 or 403 errors with a simplified schema that lacked an error code, or threw generic 500 errors. We have now enforced that all errors flow through the centralized `errorHandlerMiddleware`.

### Previous Structure (Inconsistent)
```json
// Example of an old manual 400 from a controller
{
  "success": false,
  "message": "Start date cannot be after end date"
}
```

### New Structure (Consistent Global Standard)
```json
{
  "success": false,
  "message": "Start date cannot be after end date",
  "errorCode": "BAD_REQUEST" 
}
```

### Frontend Action Required
* **No breaking changes** to the `success` or `message` fields.
* **New Capability:** The frontend can now reliably switch on the `errorCode` field (e.g., `"BAD_REQUEST"`, `"NOT_FOUND"`, `"FORBIDDEN"`, `"INTERNAL_ERROR"`) for all error responses globally to trigger specific UI states (like highlighting invalid fields or redirecting to a 404 page) instead of parsing the string `message`.

---

## 2. Feature Gating Middleware (Breaking Change)
**Affected Endpoints:** Any API gated by the `requireFeature` subscription middleware (e.g., premium modules).

### What Changed
To conform to the global error schema, the `requireFeature` middleware's response structure was updated. The field `code` was renamed to `errorCode`.

### Previous Structure
```json
{
  "success": false,
  "code": "FEATURE_NOT_AVAILABLE",
  "message": "This feature is not available on your current subscription plan."
}
```

### New Structure
```json
{
  "success": false,
  "errorCode": "FEATURE_NOT_AVAILABLE",
  "message": "This feature is not available on your current subscription plan."
}
```

### Frontend Action Required
* **Code Modification Needed:** If your frontend code currently checks `if (error.response.data.code === 'FEATURE_NOT_AVAILABLE')` or `if (error.response.data.code === 'MISSING_ORG_CONTEXT')` to prompt a subscription upgrade or tenant selection modal, you **must update it** to check `error.response.data.errorCode`.

---

## 3. Specific HTTP Status Code Corrections
**Affected Endpoints:** 
* `POST /api/v1/auth/otp/create` (OTP Generation)
* `POST /api/v1/attendance/clock-out` (and related attendance calcs)

### What Changed
Previously, if a required property (like OTP expiration) was missing, or if an attendance record couldn't be found during a background calculation, the system threw a generic native `Error`, resulting in a `500 Internal Server Error`.

These have been mapped to proper HTTP semantic codes:
* **OTP Missing Expiration:** Now returns `400 Bad Request` with `"errorCode": "BAD_REQUEST"`.
* **Attendance Record Not Found:** Now returns `404 Not Found` with `"errorCode": "NOT_FOUND"`.

### Frontend Action Required
* **Minor:** Ensure your API interceptors handle 400 and 404 gracefully for these specific workflows, rather than treating them as catastrophic 500 server crashes.
