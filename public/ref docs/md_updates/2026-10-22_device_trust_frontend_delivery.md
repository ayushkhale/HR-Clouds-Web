# Device Trust Frontend Delivery Specification

**Date:** 2026-10-22  
**Status:** Implemented & Verified in Backend  
**Reference Request:** `public/md_updates/2026-10-22_device_trust_frontend_data_requirements.md`  
**Primary Modules:** `src/modules/attendance/` (Routes, Controllers, Services, Repositories, Validators)

---

## 1. Delivery Overview

All requirements requested by the frontend team in `2026-10-22_device_trust_frontend_data_requirements.md` have been fully implemented, tested, and verified against production criteria:

| Requirement | Endpoint | Delivery Status | Notes |
|:---|:---|:---:|:---|
| **R1 (MUST)** | `GET /api/v1/attendance/hr/trusted-devices` | **DELIVERED** | `user_id` is now returned on every device row. All cryptographic keys remain strictly redacted. |
| **Nice-to-Have** | `GET /api/v1/attendance/hr/trusted-devices` & `GET /api/v1/attendance/trusted-devices` | **DELIVERED** | `last_user_agent` (raw string or `null`) is now exposed on device rows for friendly browser/OS rendering. |
| **R2 (SHOULD)** | `GET /api/v1/attendance/hr/device-trust/coverage` | **DELIVERED** | Enriched with `uncovered_users`, `pending_users`, `pending_devices`, `suspended_users`, and `by_group`. |
| **R3 (SHOULD)** | `GET /api/v1/attendance/hr/device-trust/people` | **DELIVERED** | New high-scale server-side roster endpoint left-joined across active members with status grouping & pagination. |

---

## 2. Updated Endpoint: Device Inventory (API #8)

### `GET /api/v1/attendance/hr/trusted-devices`
**Query Parameters (Unchanged):**
* `user_id` (UUID, optional)
* `status` (`pending` | `active` | `revoked` | `suspended`, optional)
* `platform` (string, optional)
* `device_bound` (boolean, optional)
* `page` (integer, default: 1)
* `limit` (integer, default: 20)

### Response Shape (`200 OK`)
Every row now carries **`user_id`** (UUID matching `users.id`) and **`last_user_agent`**:
```json
{
  "success": true,
  "message": "Trusted devices fetched",
  "data": {
    "items": [
      {
        "id": "c1f72a4d-04be-41bf-bb4e-7b705ad3d8d6",
        "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "device_name": "Work MacBook Pro",
        "platform": "web",
        "credential_type": "webauthn",
        "status": "active",
        "device_bound": true,
        "registered_at": "2026-10-15T08:00:00.000Z",
        "approved_at": "2026-10-15T08:05:00.000Z",
        "last_used_at": "2026-10-21T14:05:14.545Z",
        "last_ip": "103.21.124.5",
        "last_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "revoke_reason": null,
        "replaced_device_id": null,
        "created_at": "2026-10-15T08:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```
> [!NOTE]
> Names, emails, avatars, and departments are deliberately **not** denormalized onto device rows. The frontend joins these from the shared directory using `user_id`.

---

## 3. Updated Endpoint: Enriched Coverage Metrics (API #17)

### `GET /api/v1/attendance/hr/device-trust/coverage`
Provides real-time operational device-trust adoption metrics across the active tenant workforce.

### Response Shape (`200 OK`)
```json
{
  "success": true,
  "message": "Device trust coverage fetched",
  "data": {
    "enrolled_users": 6,
    "active_members": 9,
    "coverage_percentage": 66.67,
    "uncovered_users": 3,
    "pending_users": 1,
    "pending_devices": 1,
    "suspended_users": 0,
    "by_group": [
      {
        "group": "employee",
        "active_members": 5,
        "enrolled_users": 3
      },
      {
        "group": "manager",
        "active_members": 2,
        "enrolled_users": 2
      },
      {
        "group": "hr",
        "active_members": 2,
        "enrolled_users": 1
      }
    ]
  }
}
```

### Field Definitions:
* `active_members`: Total distinct users with an active membership (`user_roles.is_active = true`) in the organization.
* `enrolled_users`: Distinct active members who have at least one active device (`status = 'active'`).
* `coverage_percentage`: `(enrolled_users / active_members) * 100`, rounded to 2 decimal places (or `0` when `active_members === 0`).
* `uncovered_users`: Active members with zero active devices (`active_members - enrolled_users`).
* `pending_users`: Distinct active members with at least one device waiting for HR approval (`status = 'pending'`).
* `pending_devices`: Total device registration requests waiting in the HR review queue.
* `suspended_users`: Distinct active members with at least one device in `suspended` status.
* `by_group`: Breakdown by role tabs (`employee`, `manager`, `hr`).

---

## 4. New Endpoint: Per-Person Device Coverage Roster (API #18)

### `GET /api/v1/attendance/hr/device-trust/people`
High-scale server-side roster left-joined against all active members in the organization. Returns pre-aggregated device summaries per person.

### Query Parameters
| Parameter | Type | Required | Default | Description |
|:---|:---|:---:|:---:|:---|
| `coverage` | `string` | No | - | Filter by status: `none` \| `pending` \| `covered` \| `blocked` |
| `role` | `string` | No | - | Filter by active role group: `employee` \| `manager` \| `hr` |
| `search` | `string` | No | - | Searches email, full name, display name, or employee code (across employees, managers, and HR) |
| `page` | `integer` | No | `1` | Page number (≥ 1) |
| `limit` | `integer` | No | `20` | Page size (1..100) |

### Response Shape (`200 OK`)
```json
{
  "success": true,
  "message": "Device coverage roster fetched",
  "data": {
    "items": [
      {
        "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "device_count": 4,
        "active_count": 1,
        "pending_count": 0,
        "suspended_count": 0,
        "revoked_count": 3,
        "covered": true,
        "last_used_at": "2026-10-21T14:05:14.545Z"
      },
      {
        "user_id": "0e6adfa1-b7ea-4f1a-a1a5-0fa2a96bf8f8",
        "device_count": 0,
        "active_count": 0,
        "pending_count": 0,
        "suspended_count": 0,
        "revoked_count": 0,
        "covered": false,
        "last_used_at": null
      }
    ],
    "total": 9,
    "page": 1,
    "limit": 20
  }
}
```

### Verdict & State Derivation Reference
| State / Filter | Database Condition | UI Verdict |
|:---|:---|:---|
| `covered` | `active_count > 0` | "Can clock in" |
| `pending` | `active_count === 0 && pending_count > 0` | "Waiting for you" |
| `blocked` | `active_count === 0 && pending_count === 0 && suspended_count > 0` | "Blocked" |
| `none` | `active_count === 0 && pending_count === 0 && suspended_count === 0` | "No device" |

---

## 5. Frontend Migration Recommendations

1. **Immediate Unblock:**
   * The People tab in `Registered Devices` can immediately read `item.user_id` from `GET /api/v1/attendance/hr/trusted-devices`.
   * Grouping `const owner = device.user_id;` will now succeed on every device.
2. **Scalability Enhancement:**
   * Replace multi-page client-side fetching with `GET /api/v1/attendance/hr/device-trust/people`.
   * Paging, role filtering (`role=employee`), and coverage filtering (`coverage=none`) will now execute on the database server with zero device caps.
