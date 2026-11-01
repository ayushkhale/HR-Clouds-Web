# Frontend Integration Guide: Role Switching & Promotion System (`employee` ↔ `manager` ↔ `hr`)

**Document Version:** 1.0.0  
**Date:** 2026-11-01  
**Status:** ✅ Production Ready  
**Primary Endpoint:** `PUT /api/v1/organizations/users/:id/role-switch`  
**Target Audience:** Frontend Engineers (React / Next.js / Vue / React Native)

---

## 1. Executive Summary

This integration guide explains how to build the frontend user interface for promoting and demoting organization members across the three core roles: **Employee**, **Manager**, and **HR Administrator**.

When an HR administrator changes a member's role, the backend automatically:
1. Clones and preserves all shared profile data (PAN, UAN, joining date, blood group, contact details, bank records) into the destination role profile table.
2. Rewires and updates organizational reporting lines in `user_reporting_mappings`.
3. Validates organizational hierarchy rules (e.g., Managers and HRs can only report to an HR).
4. Handles Head of Department (HOD) succession or vacation.
5. Protects against demoting the sole active HR.
6. Enforces subscription tier seat capacity limits.
7. Revokes active JWT sessions via Redis so stale permissions are instantly terminated.

---

## 2. API Contract Specification

### 2.1 Endpoint Summary

- **URL:** `/api/v1/organizations/users/:id/role-switch`
- **Method:** `PUT`
- **Authentication:** Bearer JWT token required in `Authorization` header.
- **Authorization:** `hr` only (`HR_ONLY`).
- **Path Parameter:**
  - `:id` (UUIDv4, required) — The `user_id` of the member whose role is being changed.

---

### 2.2 Request Headers

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

### 2.3 Request Body Schema

```json
{
  "new_role": "manager",
  "new_reporting_person": "41fd3123-0000-4000-8000-000000000002",
  "reassign_subordinates_to": "41fd3123-0000-4000-8000-000000000003",
  "replacement_hod_id": "41fd3123-0000-4000-8000-000000000004",
  "designation": "Lead Full-Stack Engineer",
  "reason": "Promotion based on annual engineering review"
}
```

| Field Name | Type | Required | Condition / Rule | Description |
|---|---|---|---|---|
| `new_role` | `string` | **Yes** | Must be `'employee'`, `'manager'`, or `'hr'`. Must differ from current role. | Target role destination. |
| `reason` | `string` | **Yes** | Min 5 chars, max 255 chars. Whitespace trimmed. | Audit justification for the role change. |
| `designation` | `string \| null` | Optional | Max 150 chars. | Updated job title. If omitted, retains existing designation. |
| `new_reporting_person` | `string \| null` | Conditional | Must be UUIDv4. Cannot be self or someone reporting to target user. | Whom this user will report to. If `new_role` is `'manager'` or `'hr'`, **must be an active HR**. If omitted, defaults to acting HR. |
| `reassign_subordinates_to` | `string \| null` | Conditional | Must be UUIDv4. Cannot be self. | Required if target user has direct reports and is being demoted to `'employee'`, or if demoting an HR with manager reports. |
| `replacement_hod_id` | `string \| null` | Conditional | UUIDv4 or `null`. | Required if target user is an active Head of Department and switching to `'employee'`. Pass `null` to vacate the HOD position. |

---

### 2.4 Success Response (200 OK)

```json
{
  "success": true,
  "message": "User role successfully changed to 'manager'",
  "data": {
    "user_id": "3c40186e-b05b-404a-a303-c632c0314871",
    "org_id": "8edac489-a332-467a-bf8d-0273610ba4e8",
    "previous_role": "employee",
    "new_role": "manager",
    "employee_code": "EMP-042",
    "designation": "Lead Full-Stack Engineer",
    "reporting_person": "41fd3123-0000-4000-8000-000000000002",
    "subordinates_reassigned_count": 0,
    "hod_transferred": false,
    "session_revoked": true,
    "updated_at": "2026-11-01T09:40:00.000Z"
  }
}
```

---

## 3. UI/UX Workflow & Component Design

### 3.1 Entry Point in Member Table / Profile View

In the Employee Directory or Organization Members table (`/organization/employees`):
1. In the row options menu (`...`), display a **"Change Role"** action button.
2. **Self-Modification Guard**: If `currentUser.id === row.user_id`, disable the button with tooltip:  
   *"You cannot change your own role. Another administrator must perform this action."*
3. **Sole HR Guard**: If `row.role === 'hr'` and `activeHrCount <= 1`, disable the button with tooltip:  
   *"Cannot demote the sole active HR administrator."*

---

### 3.2 Dynamic Modal Wireframe

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Change Member Role                            │
├────────────────────────────────────────────────────────────────────────┤
│ Member: Vikas Munde (vikas@gmail.com)                                  │
│ Current Role: Manager   |   Department: Sales Department               │
│ Direct Reports: 3 team members   |   Head of Department: Yes           │
├────────────────────────────────────────────────────────────────────────┤
│ Select New Role: *                                                     │
│   ( ) Employee   (•) HR Administrator                                  │
│                                                                        │
│ Designation:                                                           │
│   [ Senior Technical Manager                                         ] │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ [DYNAMIC FIELD A: WHEN NEW ROLE IS 'MANAGER' OR 'HR']                  │
│ Reports To (HR Administrator): *                                       │
│   [ Select an active HR Administrator...                             v]│
│   ℹ Rule: Managers and HRs can only report to an HR Administrator.      │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ [DYNAMIC FIELD B: WHEN DEMOTING TO EMPLOYEE AND HAS DIRECT REPORTS]    │
│ ⚠ Vikas currently manages 3 direct reports.                            │
│ Reassign Direct Reports To: *                                          │
│   [ Select a new Manager or HR Administrator...                      v]│
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ [DYNAMIC FIELD C: WHEN DEMOTING TO EMPLOYEE AND IS HEAD OF DEPARTMENT] │
│ ⚠ Vikas is currently Head of Department for Sales Department.           │
│ Replacement Head of Department:                                        │
│   [ Select replacement HOD or 'Vacate Position'...                   v]│
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ Reason for Role Change: *                                              │
│   [ Enter business justification (min 5 characters)...               ] │
│   [ 42 / 255 characters                                              ] │
├────────────────────────────────────────────────────────────────────────┤
│                                      [ Cancel ]  [ Confirm Role Change ]│
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3.3 Dynamic Field Visibility & Requirement Rules

| Target User Current State | Selected `new_role` | `new_reporting_person` | `reassign_subordinates_to` | `replacement_hod_id` |
|---|---|---|---|---|
| **Employee** | `manager` | **Required** (Dropdown showing **only active HRs**) | Hidden | Hidden |
| **Employee** | `hr` | **Required** (Dropdown showing **only active HRs**) | Hidden | Hidden |
| **Manager** | `employee` | Optional (Dropdown of Managers & HRs) | **Required** if has reports | **Required** if HOD (can select replacement HOD or `null` to vacate) |
| **Manager** | `hr` | **Required** (Dropdown showing **only active HRs**) | Optional (defaults to keeping reports) | Optional (defaults to keeping HOD if in dept) |
| **HR** | `manager` | **Required** (Dropdown showing other active HRs) | **Required** if any report is a Manager or HR | Optional |
| **HR** | `employee` | Optional | **Required** if has reports | **Required** if HOD |

---

## 4. Frontend Data Pre-requisites & Pre-flight Lookups

Before opening the **Change Role** modal, the frontend should fetch the following dropdown options:

1. **Active HR List** (for `new_reporting_person`):
   ```http
   GET /api/v1/organizations/directory?role=hr
   ```
   *Filter out `targetUserId` so users cannot select themselves.*

2. **Active Managers & HRs** (for `reassign_subordinates_to`):
   ```http
   GET /api/v1/organizations/directory
   ```
   *Filter: `m.role === 'manager' || m.role === 'hr'`, excluding `targetUserId`.*

3. **Subordinate Count & Current HOD Status**:
   - Available on the member's profile record:
     - `member.is_hod` or `member.department_head`
     - `member.direct_reports_count`

---

## 5. Exhaustive Error Handling & UI Notification Matrix

The backend returns standardized `AppError` payloads:
```json
{
  "success": false,
  "message": "Human-readable error description",
  "errorCode": "SPECIFIC_ERROR_CODE"
}
```

Map each `errorCode` to user-facing UI treatments as follows:

| HTTP Status | `errorCode` | Cause / Trigger | Recommended UI Display |
|:---:|---|---|---|
| **400** | `SELF_ROLE_SWITCH_FORBIDDEN` | Admin attempted to change their own role. | **Inline Banner / Toast**: *"You cannot change your own role. Another HR administrator must perform this action."* |
| **400** | `ROLE_UNMODIFIED` | Selected `new_role` is identical to current role. | **Form Error on `new_role`**: *"The user already holds this role. Please select a different role."* |
| **400** | `MISSING_SUBORDINATE_REASSIGNMENT` | Target has direct reports and is switching to employee, but no reassignment target was selected. | **Form Error on `reassign_subordinates_to`**: *"This member has direct reports. You must select someone to reassign them to."* |
| **400** | `INVALID_REASSIGNMENT_TARGET` | Reassignment recipient is the target user, is inactive, or a manager was selected for leadership reports. | **Form Error on `reassign_subordinates_to`**: *"Invalid recipient. Subordinates include managers who must report to an active HR."* |
| **400** | `MISSING_REPLACEMENT_HOD` | Member is HOD, switching to employee, but `replacement_hod_id` was omitted. | **Form Error on `replacement_hod_id`**: *"Please select a replacement Head of Department or select 'Vacate Position'."* |
| **400** | `HOD_DEPARTMENT_MISMATCH` | Replacement HOD belongs to a different department than the department headed. | **Form Error on `replacement_hod_id`**: *"The replacement HOD must belong to the same department."* |
| **400** | `CIRCULAR_REPORTING_ERROR` | User selected to report to themselves, or selected someone who currently reports to this user. | **Form Error on `new_reporting_person`**: *"Circular reporting detected. You cannot report to a team member who currently reports to you."* |
| **400** | `INVALID_REPORTING_PERSON_ROLE` | Selected a manager or employee as reporting target for a manager/HR. | **Form Error on `new_reporting_person`**: *"Managers and HRs can only report to an active HR Administrator."* |
| **400** | `VALIDATION_ERROR` | Reason is under 5 characters or missing required fields. | **Inline Field Validation**: Highlight the invalid field. |
| **403** | `LAST_HR_PROTECTED` | Attempted to demote the organization's sole active HR administrator. | **Modal Error Alert**: *"Cannot demote the sole active HR. Please promote another HR administrator first."* |
| **403** | `LIMIT_EXCEEDED` | The active subscription plan has reached its manager or HR seat limit. | **Subscription Upgrade Modal / Toast**: *"Plan seat limit reached for this role. Please upgrade your subscription tier."* |
| **404** | `USER_NOT_FOUND` | User is deleted or has no active organization membership. | **Toast Error**: *"Member not found in organization."* Close modal. |
| **404** | `PROFILE_NOT_FOUND` | Source role profile record missing. | **Toast Error**: *"Profile record not found. Please contact support."* |

---

## 6. Post-Role-Switch Client Session Lifecycle (Critical)

### 6.1 Token Invalidation & Interceptor Handling

When a member's role is switched:
1. The backend immediately writes `user_revoked_at:<userId> = <timestamp>` into Redis.
2. The target user's existing JWT token is now considered **revoked**.
3. On that user's very next API request, the backend returns:
   ```json
   HTTP 401 Unauthorized
   {
     "success": false,
     "message": "Your role or session has changed. Please log in again.",
     "errorCode": "TOKEN_REVOKED"
   }
   ```

### 6.2 Frontend Axios / Fetch Interceptor Setup

Your global HTTP client interceptor **must** intercept `TOKEN_REVOKED`:

```typescript
import axios from 'axios';

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.errorCode;

    // Detect session revocation caused by role switch or logout
    if (error.response?.status === 401 && errorCode === 'TOKEN_REVOKED') {
      console.warn('[Auth] Session revoked due to role change. Refreshing session...');

      try {
        // Option A: Refresh access token via refresh token endpoint
        const { data } = await axios.post('/api/v1/auth/refresh-token');
        setAccessToken(data.data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.data.access_token}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // Option B: If refresh fails, prompt re-login or clear auth state
        clearAuthSession();
        window.location.href = '/login?reason=role_changed';
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
```

### 6.3 State & Permission Refresh

After a successful role switch:
1. **In the HR's session (the actor)**:
   - Close the modal.
   - Show a success toast: `🎉 Role successfully changed to [Role]`.
   - Invalidate and refetch the members list query (e.g. `queryClient.invalidateQueries(['employees'])`).
2. **In the affected user's session (if logged in concurrently)**:
   - Their UI state will refresh with new role permissions upon token re-issuance.
   - If they were demoted from Manager to Employee, immediately redirect them away from `/manager/*` routes to `/dashboard`.

---

## 7. TypeScript Definitions

Copy these types directly into your frontend codebase (`src/types/roleSwitch.ts`):

```typescript
export type OrgRole = 'employee' | 'manager' | 'hr';

export interface SwitchUserRolePayload {
  new_role: OrgRole;
  reason: string;
  designation?: string | null;
  new_reporting_person?: string | null;
  reassign_subordinates_to?: string | null;
  replacement_hod_id?: string | null;
}

export interface SwitchUserRoleResponseData {
  user_id: string;
  org_id: string;
  previous_role: OrgRole;
  new_role: OrgRole;
  employee_code: string;
  designation: string;
  reporting_person: string | null;
  subordinates_reassigned_count: number;
  hod_transferred: boolean;
  session_revoked: boolean;
  updated_at: string;
}

export interface SwitchUserRoleResponse {
  success: boolean;
  message: string;
  data: SwitchUserRoleResponseData;
}

export type RoleSwitchErrorCode =
  | 'SELF_ROLE_SWITCH_FORBIDDEN'
  | 'ROLE_UNMODIFIED'
  | 'MISSING_SUBORDINATE_REASSIGNMENT'
  | 'INVALID_REASSIGNMENT_TARGET'
  | 'MISSING_REPLACEMENT_HOD'
  | 'HOD_DEPARTMENT_MISMATCH'
  | 'CIRCULAR_REPORTING_ERROR'
  | 'INVALID_REPORTING_PERSON_ROLE'
  | 'LAST_HR_PROTECTED'
  | 'LIMIT_EXCEEDED'
  | 'USER_NOT_FOUND'
  | 'PROFILE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'TOKEN_REVOKED';
```

---

## 8. React Example Component Implementation

Below is a complete, production-ready React component using Tailwind CSS and TanStack Query / Axios:

```tsx
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { OrgRole, SwitchUserRolePayload, SwitchUserRoleResponse } from '../types/roleSwitch';

interface Member {
  user_id: string;
  name: string;
  email: string;
  role: OrgRole;
  designation?: string;
  is_hod?: boolean;
  direct_reports_count?: number;
}

interface ChangeRoleModalProps {
  member: Member;
  currentUserId: string;
  activeHrs: { id: string; name: string }[];
  activeManagers: { id: string; name: string }[];
  isOpen: boolean;
  onClose: () => void;
}

export const ChangeRoleModal: React.FC<ChangeRoleModalProps> = ({
  member,
  currentUserId,
  activeHrs,
  activeManagers,
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();

  const [newRole, setNewRole] = useState<OrgRole>(member.role === 'employee' ? 'manager' : 'employee');
  const [designation, setDesignation] = useState(member.designation || '');
  const [newReportingPerson, setNewReportingPerson] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [replacementHodId, setReplacementHodId] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isDemotingToEmployee = newRole === 'employee';
  const hasSubordinates = (member.direct_reports_count || 0) > 0;
  const isCurrentHod = !!member.is_hod;

  const mutation = useMutation({
    mutationFn: async (payload: SwitchUserRolePayload) => {
      const res = await axios.put<SwitchUserRoleResponse>(
        `/api/v1/organizations/users/${member.user_id}/role-switch`,
        payload
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      alert(data.message);
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Role change failed';
      setFormError(msg);
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (reason.trim().length < 5) {
      setFormError('Please enter a reason of at least 5 characters.');
      return;
    }

    const payload: SwitchUserRolePayload = {
      new_role: newRole,
      reason: reason.trim(),
      designation: designation.trim() || undefined,
      new_reporting_person: newReportingPerson || undefined,
      reassign_subordinates_to: isDemotingToEmployee && hasSubordinates ? reassignTo : undefined,
      replacement_hod_id: isDemotingToEmployee && isCurrentHod ? (replacementHodId === 'vacate' ? null : replacementHodId) : undefined,
    };

    mutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-gray-900">Change Member Role</h2>
        <p className="mt-1 text-sm text-gray-500">
          Updating role for <span className="font-semibold text-gray-800">{member.name}</span> ({member.role})
        </p>

        {formError && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Select New Role *</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['employee', 'manager', 'hr'] as OrgRole[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  disabled={r === member.role}
                  onClick={() => setNewRole(r)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-all ${
                    newRole === r
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : r === member.role
                      ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Designation */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Designation</label>
            <input
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Reporting Person (HR Only if new role is Manager or HR) */}
          {(newRole === 'manager' || newRole === 'hr') && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Reports To (HR Administrator) *
              </label>
              <select
                required
                value={newReportingPerson}
                onChange={(e) => setNewReportingPerson(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select an active HR...</option>
                {activeHrs
                  .filter((h) => h.id !== member.user_id)
                  .map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Managers and HRs must report to an active HR.</p>
            </div>
          )}

          {/* Reassign Subordinates */}
          {isDemotingToEmployee && hasSubordinates && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="block text-sm font-medium text-amber-900">
                Reassign Direct Reports To *
              </label>
              <p className="text-xs text-amber-700 mb-2">
                This member currently manages {member.direct_reports_count} direct report(s).
              </p>
              <select
                required
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="">Select a new Manager or HR...</option>
                {[...activeManagers, ...activeHrs]
                  .filter((m) => m.id !== member.user_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* Replacement HOD */}
          {isDemotingToEmployee && isCurrentHod && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <label className="block text-sm font-medium text-blue-900">
                Replacement Head of Department
              </label>
              <p className="text-xs text-blue-700 mb-2">
                This user is an active Head of Department. Select a successor or vacate.
              </p>
              <select
                value={replacementHodId}
                onChange={(e) => setReplacementHodId(e.target.value)}
                className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="vacate">Vacate HOD Position (Leave vacant)</option>
                {activeManagers
                  .filter((m) => m.id !== member.user_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Reason for Role Change *</label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide a business justification..."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : 'Confirm Role Change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

---

## 9. Integration Checklist for Frontend Teams

- [ ] **Modal Entry Point**: Button displayed in `/organization/employees` table action menu.
- [ ] **Self-Demotion Guard**: Button disabled if viewing self (`actorUser.id === row.user_id`).
- [ ] **Sole HR Guard**: Button disabled if target is the sole active HR.
- [ ] **Dynamic Visibility**: Fields (`new_reporting_person`, `reassign_subordinates_to`, `replacement_hod_id`) toggle dynamically based on `new_role` and target user's current status.
- [ ] **HR Filter**: `new_reporting_person` only allows selecting members with role `hr`.
- [ ] **Circular Prevention**: Dropdown filters out the target user and anyone reporting to them.
- [ ] **Toast / Error Mapping**: All error codes mapped to user-friendly messages per Section 5.
- [ ] **Session Interceptor**: Global HTTP interceptor handles `401 TOKEN_REVOKED` and re-authenticates seamlessly.
- [ ] **Cache Invalidation**: Query caches (`['employees']`, `['org-chart']`, `['departments']`) invalidated upon success.

---

*Guide authored by Senior Principal Backend Engineer | Release: Enterprise HRMS 2.0*
