# Phase 6: Advanced Features & Hardening APIs — Frontend Integration Guide

This document provides complete integration specifications for Frontend Developers and DevOps/Support Engineers implementing the **Phase 6 (Advanced Features & Hardening)** module. 

> [!IMPORTANT]
> **Architectural Note:** Phase 6 does not introduce net-new route definitions or controllers. Instead, it introduces powerful new payload parameters and deep business-logic enforcements to existing endpoints (Demographic gating, Document Thresholds, Notice Period Caps, and Rotation-aware Overnight Shifts). This document details how these existing APIs have evolved in Phase 6.

---

## 1. Create & Update Leave Types (Demographic Eligibility)

**What changed:** The Admin Leave Type endpoints now accept demographic gating parameters. You can restrict a leave type to specific genders (e.g., Maternity Leave) or marital statuses (e.g., Marriage Leave).

**Endpoints affected:** 
- `POST /api/v1/leaves/types`
- `PUT /api/v1/leaves/types/:id`
**Roles Required:** `hr`, `admin`, `super-admin`

### New Request Body Fields (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `allowed_genders` | Array of Strings | No | Valid values: `['male', 'female', 'other', 'prefer_not_to_say']`. Pass `null` or `[]` to open to all genders. |
| `allowed_marital_statuses` | Array of Strings | No | Free-text strings (e.g., `['single', 'married']`). Pass `null` or `[]` to open to all marital statuses. |

**Example Request Update:**
```json
{
  "name": "Maternity Leave",
  "code": "ML",
  "is_paid": true,
  "allowed_genders": ["female"],
  "allowed_marital_statuses": null
}
```

---

## 2. Create & Update Entitlements (Notice Period Caps)

**What changed:** Entitlements and employee-specific config overrides now support a hard cap on leave days during an employee's notice period.

**Endpoints affected:**
- `POST /api/v1/leaves/templates/:templateId/entitlements`
- `PUT /api/v1/leaves/templates/:templateId/entitlements/:entitlementId`
- `PUT /api/v1/leaves/users/:userId/configs/:leaveTypeId` (Override Config)
**Roles Required:** `hr`, `admin`, `super-admin`

### New Request Body Fields (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `notice_period_max_days` | Integer / Null | No | `null` = unrestricted (default). `0` = fully blocked during notice period. `n` = max n days allowed during notice period. |

**Important distinction for UI:** The frontend must distinguish between `0` (explicitly blocked) and `null` (unrestricted). Sending `0` means the employee cannot take this leave at all once they resign.

---

## 3. Submit Leave Request (New Enforcements)

**What changed:** The self-service request endpoint has been hardened with four new layers of synchronous business validation. The request payload itself has not changed, but the error responses have significantly expanded.

**Endpoint:** `POST /api/v1/leaves/request`
**Roles Required:** `employee`, `manager`, `hr`, `admin`, `super-admin`

### New Error Scenarios & Business Rules:

1. **Demographic Rejection (400 Bad Request)**
   - **Trigger:** Applicant applies for a leave gated by gender/marital status, but their profile does not match.
   - **Code/Message:** `DEMOGRAPHIC_INELIGIBLE` ("You are not eligible to apply for this leave type.")
   - **Code/Message:** `DEMOGRAPHIC_PROFILE_INCOMPLETE` ("This leave type is restricted by gender, but your gender is not on file.")
   
2. **Document Threshold Enforcement (400 Bad Request)**
   - **Trigger:** Applicant applies for a span of days `> requires_document_threshold` without providing a `document_url`.
   - **Code/Message:** `DOCUMENT_REQUIRED` ("A supporting document is required for more than X day(s) of this leave type.")
   - **Smurf Protection:** The backend sums adjacent pending/approved leaves. If an employee submits back-to-back 2-day leaves to dodge a 3-day threshold, the second submit will trigger this error.

3. **Notice Period Restriction (400 Bad Request)**
   - **Trigger:** Applicant's `job_status` is `notice_period` and they exceed the `notice_period_max_days` cap.
   - **Code/Message:** `NOTICE_PERIOD_RESTRICTED` ("Leave of this type is not permitted during the notice period" OR "You have exceeded your notice period allowance...")

4. **Cross-Year Sandwich Blocks (400 Bad Request)**
   - **Trigger:** If the sandwich rule bridges two different years (e.g., Dec 31 and Jan 3), the backend explicitly splits the charges to maintain ledger integrity.

---

## 4. Approve Leave Request (Rotation-Aware Overnights)

**What changed:** The approval engine is now fully rotation-aware and dynamically resolves complex shift schedules to accurately plot overnight spillovers.

**Endpoint:** `POST /api/v1/leaves/requests/:id/approve`
**Roles Required:** `manager`, `hr`, `admin`, `super-admin`

### Technical Behaviors:
- **Dynamic Resolution:** The API evaluates the employee's shift dynamically for *each day* of the leave. If a multi-day leave crosses a rotation boundary (e.g., Day Shift rotates to Night Shift mid-leave), it accurately assigns overnight flags.
- **Spillover Records:** If `is_overnight` is true, the backend generates an attendance `on_leave` record for the primary date **AND** a spillover record for `date + 1` morning.
- **Half-Day Overnight Alignment:** The system intelligently stamps the `on_leave` record to the correct calendar day for "Second Half" half-day requests on overnight shifts.

---

## 5. Cancel / Reject Request (Spillover Cleanup)

**What changed:** The cancellation and revert paths now safely clean up overnight spillover records without orphaning data.

**Endpoints affected:**
- `POST /api/v1/leaves/requests/:id/cancel`
- `POST /api/v1/leaves/requests/:id/reject`
- (Also affects Deactivation scripts)

### Technical Behaviors:
- **Widened Revert Window:** The internal `revertLeaveRecords` window has been expanded to `endDate + 1 day`. 
- **Safe Scoping:** Because cleanup is strictly scoped by `leave_id`, cancelling an overnight leave safely sweeps the D+1 spillover record without risking deletion of an adjacent leave's records.

---

## Workflow 1: Notice Period Restraints

This workflow prevents employees on their notice period from abusing their leave balances right before departure.

### Step 1: Initiating Resignation (HR Action)
- **Action:** HR marks the employee as resigning (which sets their `job_status = 'notice_period'`).
- **The Phase 6 Magic:** The system automatically recalculates their eligibility for all leave types.

### Step 2: Applying for Restricted Leave (Employee Action)
- **Action:** The employee attempts to use their remaining "Casual Leave", applying for 4 days off. 
- **The Phase 6 Magic:** The `submitLeaveRequest` service checks the `notice_period_max_days` on the Casual Leave entitlement. If the cap is `3`, the application is hard-rejected with a 400 error. The system also sums up any *already approved* leaves during their notice period to ensure the total does not exceed the cap.

---

## Workflow 2: Rotation-Aware Overnight Shift Handling

This workflow accurately records attendance spillovers when an employee on an overnight shift takes a leave, ensuring that payroll correctly counts both calendar days without penalizing the employee for the spillover morning.

### Step 1: Applying for the Leave (Employee Action)
- **Action:** An employee scheduled for a Night Shift (10 PM to 6 AM) applies for a full-day leave for Wednesday.
- **The Phase 6 Magic:** The application is submitted normally. The employee does not need to specify that they are on a night shift; the system will figure it out during approval.

### Step 2: Approving the Overnight Leave (Manager Action)
- **Action:** The manager approves the Wednesday leave.
- **The Phase 6 Magic:** The `shift_resolver` engine dynamically checks the employee's rotation schedule for Wednesday. It discovers the shift is overnight (`is_overnight = true`). 
- **The Spillover Injection:** The engine injects *two* attendance records into the database: one `on_leave` record for Wednesday, and a second `on_leave` "spillover" record for Thursday morning. This prevents the system from marking them "Absent" on Thursday morning for missing their 6 AM punch-out.

### Step 3: Cancelling the Leave (Employee Action)
- **Action:** The employee cancels the Wednesday leave.
- **The Phase 6 Magic:** The cancellation logic sweeps the primary Wednesday record *and* the widened Thursday morning spillover record, safely removing both from the ledger.

---

## Workflow 3: The Cross-Year Smurf Guard

This workflow prevents a specific exploit where an employee intentionally splits a long leave into two separate requests across a year boundary to bypass the "Document Required" threshold.

### Step 1: The Exploit Attempt (Employee Action)
- **Action:** The "Sick Leave" policy requires a doctor's note for > 3 days. The employee needs 5 days off (Dec 30, Dec 31, Jan 1, Jan 2, Jan 3). To avoid submitting a note, they submit two rapid, concurrent requests: Request A for Dec 30-31 (2 days) and Request B for Jan 1-3 (3 days).
- **The Phase 6 Magic:** The Phase 6 implementation utilizes a PostgreSQL advisory lock (`pg_advisory_xact_lock`) based on a hash of the `user_id` and `leave_type_id`.

### Step 2: The Lock & Merge Verification (System Action)
- **Action:** The backend processes Request A and acquires the transaction lock. Request B is forced to wait.
- **The Phase 6 Magic:** Request A succeeds. When Request B finally acquires the lock, the `_contiguousSpanDays` check dynamically queries the database for adjacent leaves. It finds Request A (which is now in the DB). It merges the spans together (`2 + 3 = 5 days`). Since 5 > 3, it rejects Request B with a `DOCUMENT_REQUIRED` error, successfully thwarting the cross-year exploit.

---

## 🛑 Edge Cases & Data Integrity Guardrails

1. **Transaction Locking (`pg_advisory_xact_lock`)**
   - The Submit Request API now utilizes Postgres advisory locks (`hashtext(user_id || leave_type_id)`) to enforce strict serializability across calendar years. 
   - **Impact:** The system is mathematically immune to concurrent double-spend attacks attempting to bypass the Document Threshold or Notice Period caps using split-year concurrent requests.

2. **Calendar Exception Specificity**
   - The internal calculator now weights calendar exceptions (holidays/working-days) by specificity: `User > Location > Department > Org`.
   - **Impact:** An organization-wide "Working Day" exception will no longer incorrectly override a Location-specific "Non-Working Day" exception (e.g., a regional office closed for severe weather).

3. **Marital Status Limitation (Managers/HR)**
   - Phase 6 migrations have injected `marital_status` columns into both `manager_profiles` and `hr_profiles`. 
   - **Impact:** Gating leaves by marital status will properly evaluate against senior staff, avoiding the critical functional defect where managers were indefinitely locked out of Marriage Leave.
