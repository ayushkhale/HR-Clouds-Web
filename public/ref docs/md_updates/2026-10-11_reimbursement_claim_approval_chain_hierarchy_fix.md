# Reimbursement Claim Approval Chain Hierarchy & Manager Workflow Update

**Date:** 2026-10-11  
**Scope:** Payroll Module — Reimbursement Claims (`reimbursement_claims`, `reimbursement_approvals`)  
**Status:** Implemented & Verified  

---

## 1. Overview & Problem Statement

Previously, when an employee or manager submitted a reimbursement claim (`POST /api/v1/payroll/me/reimbursements/claims/:id/submit`), the approval chain resolver (`approval_chain_resolver.utils.js`) assumed any resolved reporting person had the `manager` role and always constructed a 2-level chain:
1. `level: 1`, `approver_role: 'manager'`
2. `level: 2`, `approver_role: 'hr'`

### The Issue
In organizations where a **Manager reports directly to an HR user** (or an employee reports directly to HR):
- Level 1 was stamped with `approver_role: 'manager'` assigned to the HR user's ID.
- When that HR user attempted to approve the claim, the permission guard (`_assertLevelPermission`) checked whether the claimant was in the caller's direct report array (`accessibleUserIds.includes(claim.user_id)`).
- Because HR users possess tenant-global scope (`accessibleUserIds = null`), the check failed with `403 NOT_YOUR_APPROVAL_LEVEL`.
- Furthermore, no other manager could approve it because the claimant was not their direct report. The claim became unapprovable and stuck at Level 1.

---

## 2. Updated Behavior

The submission pipeline now dynamically inspects the active role of the direct reporting person (`reporting_to_id`):

| Claimant | Direct Reporting Person (Hop 1) | Chain Shape | Approver(s) |
| :--- | :--- | :--- | :--- |
| **Employee** | Manager | **2 Levels** | Level 1: Manager (`approver_role: 'manager'`)<br>Level 2: HR (`approver_role: 'hr'`) |
| **Manager A** | Senior Manager B (`manager`) | **2 Levels** | Level 1: Senior Manager B (`approver_role: 'manager'`)<br>Level 2: HR (`approver_role: 'hr'`) |
| **Manager A** | HR C (`hr`) | **1 Level (Collapsed)** | Level 1: HR (`approver_role: 'hr'`, `assigned_approver_id: HR_C_ID`) |
| **Employee E** | HR C (`hr`) | **1 Level (Collapsed)** | Level 1: HR (`approver_role: 'hr'`, `assigned_approver_id: HR_C_ID`) |
| **Any User** | No Manager / Self-Reporting | **1 Level (Collapsed)** | Level 1: HR (`approver_role: 'hr'`, `assigned_approver_id: null`) |

---

## 3. Frontend & API Impact

### Response Payloads
The request and response shapes of all reimbursement endpoints remain 100% backward compatible:
- `POST /api/v1/payroll/me/reimbursements/claims/:id/submit`
- `GET /api/v1/payroll/me/reimbursements/claims/:id`
- `GET /api/v1/payroll/manager/reimbursements/claims/:id`
- `GET /api/v1/payroll/hr/reimbursements/claims/:id`
- `POST /api/v1/payroll/manager/reimbursements/claims/:id/approve`
- `POST /api/v1/payroll/hr/reimbursements/claims/:id/approve`

### What Changes on the UI
- For claims where the reporting person is HR:
  - `total_levels` in the claim object is `1` (instead of `2`).
  - The `approvals` array contains 1 row (`level: 1, approver_role: 'hr'`).
  - Once HR approves Level 1, the claim transitions immediately to `status: 'approved'` and the payout period is scheduled.
- The UI stepper or approval progress bar should render 1 or 2 steps according to `total_levels` (the frontend already supports this for `reimbursement_approval_levels = 1` configurations).

---

## 4. Per-Category Item Remarks (`approver_remarks`)

### In the Approve API Payload:
When a Manager or HR approves a claim via `POST .../claims/:id/approve`, they can include item-specific remarks:
```json
{
  "remarks": "Overall claim level remark",
  "items": [
    {
      "item_id": "0749c16d-409e-4d1f-9e93-073625e6e4fb",
      "approved_amount": 3200.00,
      "item_status": "approved",
      "approver_remarks": "Approved stay expenses after invoice check"
    },
    {
      "item_id": "1b62ac01-4535-402d-bd0c-58170bac9e89",
      "approved_amount": 0,
      "item_status": "rejected",
      "approver_remarks": "Travel fuel slips were blurry"
    }
  ]
}
```

### In the Read Responses (`GET .../claims/:id`):
Each item in the `items[]` array returns `approver_remarks`:
```json
{
  "id": "0749c16d-409e-4d1f-9e93-073625e6e4fb",
  "category_name": "Stay",
  "amount": "3200.00",
  "approved_amount": "3200.00",
  "item_status": "approved",
  "approver_remarks": "Approved stay expenses after invoice check",
  "attachments": [...]
}
```
If a line was decided at Level 1 by a manager and is not renamed at Level 2, its `approver_remarks` is automatically preserved throughout the lifecycle. Empty or whitespace-only remarks are normalized to `null`.

