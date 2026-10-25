# Unified Badge Counts & Reimbursement Claims `pending_hr` API Integration Guide

**Document Version:** 1.0.0 (Production Master)  
**Date:** 2026-10-25  
**Area:** Inbox Module (`/api/v1/inbox`), Payroll Module (`/api/v1/payroll/hr/reimbursements/claims`)  
**Target Audience:** Frontend Engineers (Web & Mobile Apps)  
**Implementation Source of Truth:** `public/md_updates/2026-10-25_unified_badge_counts_implementation_plan.md`  

---

## 1. Executive Summary & Problem Solved

### 1.1 The Legacy Problem
Previously, frontend dashboards fired **13 to 17 separate HTTP requests** across different micro-modules (`/leaves`, `/attendance`, `/tasks`, `/payroll`, `/documents`, `/notifications`, etc.) to calculate navigation badges, sidebar pill counters, and inbox cards. Because of network overhead and rate limits, clients cached counts for 60+ seconds, leaving badges noticeably out of sync and causing discrepancies between card badges and the data tables they open.

### 1.2 The Production Solution
1. **`GET /api/v1/inbox/badges` (API #272):** A single-round-trip endpoint that computes a complete, role-scoped, entitlement-aware count tree in **one database query**. It covers every sidebar badge, inbox card, governance tab, and notification bell for HR, Manager, and Employee workspaces.
2. **`GET /api/v1/payroll/hr/reimbursements/claims?pending_hr=true` (API #133):** An optional query filter that guarantees byte-for-byte consistency between the `categories.inbox.claims.total` badge count and the claims awaiting HR approval.

---

## 2. API Contract: `GET /api/v1/inbox/badges`

### 2.1 Route Details

- **Path:** `/api/v1/inbox/badges`
- **Method:** `GET`
- **Auth:** `Authorization: Bearer <access_token>`
- **Allowed Roles:** `super-admin`, `admin`, `hr`, `manager`, `employee`
- **Caching:** `Cache-Control: no-store` (live operational data; never cached in HTTP proxies)
- **Rate Limit:** **240 requests/hour per user** (sliding UTC hour window). If exceeded, emits HTTP `429 Too Many Requests` with a `Retry-After` header. Fails open gracefully if Redis is temporarily unreachable.
- **Query Parameters:** None. Unknown query parameters are stripped (`stripUnknown: true`), ensuring future query parameters won't break existing clients.

---

### 2.2 Complete JSON Response Schema (`200 OK`)

Every numeric leaf in the response is guaranteed to be a **non-negative integer** (type `number`). Keys are **always present** regardless of role or entitlement; inaccessible or disabled categories return `0` and are named in `meta.unavailable_categories`.

```json
{
  "success": true,
  "message": "Badge counts summary fetched",
  "data": {
    "scope": {
      "role": "hr",
      "plane": "org",
      "team_size": null
    },
    "sidebar": {
      "inbox_total": 14,
      "notifications_unread": 3,
      "unverified_banks": 2,
      "document_verification_queue": 5
    },
    "categories": {
      "inbox": {
        "leaves": { "total": 3, "pending": 2, "cancellation_pending": 1 },
        "regularizations": { "total": 1, "pending": 1 },
        "overtime": { "total": 0, "pending": 0 },
        "comp_offs": { "total": 0, "earned": 0 },
        "anomalies": { "total": 2, "open": 2 },
        "tasks": { "total": 4, "in_review": 4 },
        "salary_proposals": { "total": 1, "proposed": 1 },
        "claims": { "total": 2, "under_review": 2, "submitted": 0 },
        "loans": { "total": 1, "pending": 1 },
        "tax_declarations": { "total": 0, "submitted": 0, "under_review": 0 },
        "devices": { "total": 0, "pending": 0 },
        "letter_proposals": { "total": 0, "pending": 0 }
      },
      "tasks": {
        "pending": 8,
        "in_progress": 12,
        "in_review": 4,
        "reopened": 1,
        "completed": 45,
        "cancelled": 2,
        "overdue": 3,
        "mine": {
          "open": 2,
          "overdue": 0,
          "in_review": 1
        }
      },
      "bank_verification": {
        "unverified": 2,
        "verified": 84,
        "missing_account": 6
      },
      "document_verification": {
        "waiting_decision": 5,
        "manager_approved": 4,
        "manager_rejected": 1,
        "no_recommendation": 0
      },
      "document_requests": {
        "outstanding": 7,
        "overdue": 2,
        "fulfilled": 31
      },
      "devices": {
        "pending": 0,
        "active": 62,
        "suspended": 1,
        "revoked": 3
      },
      "loans": {
        "pending": 1,
        "active": 12,
        "closed": 30,
        "foreclosed": 0
      },
      "letter_proposals": {
        "pending": 0,
        "approved": 9,
        "rejected": 1,
        "cancelled": 0
      },
      "notifications": {
        "unread": 3,
        "unread_is_capped": false,
        "total": 42
      }
    },
    "meta": {
      "unavailable_categories": [],
      "query_ms": 11
    },
    "synced_at": "2026-10-25T12:00:00.000Z"
  }
}
```

---

### 2.3 Detailed Field Semantics

#### 1. Scope Object (`data.scope`)
- **`role`** (`string`): The authenticated caller's active role (`"hr"`, `"manager"`, `"employee"`, `"admin"`, `"super-admin"`).
- **`plane`** (`"org" | "team" | "self"`):
  - `"org"`: The caller sees organization-wide counts (e.g. HR).
  - `"team"`: The caller sees counts for their direct reporting subordinates (e.g. Manager).
  - `"self"`: The caller sees personal self-service counts only (e.g. Employee).
- **`team_size`** (`number | null`): When `plane === "team"`, this represents the count of active direct reports reporting to the manager. If `team_size === 0`, all team counts legitimately return `0`. For `"org"` and `"self"`, this is `null`.

#### 2. Sidebar Object (`data.sidebar`)
- **`inbox_total`** (`number`): **Primary Inbox navigation badge.** Strictly computed as the mathematical sum of the 12 `categories.inbox.*.total` categories. Deliberately excludes bank and document verification queues.
- **`notifications_unread`** (`number`): **Notification bell badge.** Unread notifications for the caller (`read_at IS NULL`), bounded to a maximum of 100 (`NOTIFICATION_UNREAD_COUNT_CAP`).
- **`unverified_banks`** (`number`): Active tenant employees whose primary bank account has not yet been verified by HR (`bank_verification.unverified`).
- **`document_verification_queue`** (`number`): Employee documents currently pending HR verification (`document_verification.waiting_decision`).

#### 3. Inbox Categories (`data.categories.inbox`)
Each object contains a `total` and status breakdown:
- **`leaves`**: `total = pending + cancellation_pending`.
- **`regularizations`**: `total = pending`.
- **`overtime`**: `total = pending`.
- **`comp_offs`**: `total = earned`.
- **`anomalies`**: `total = open` (unresolved punch/GPS anomalies).
- **`tasks`**: `total = in_review` (tasks submitted for review).
- **`salary_proposals`**: `total = proposed`.
- **`claims`**: `total = under_review + submitted` (where `submitted` has `total_levels = 1`).
- **`loans`**: `total = pending`.
- **`tax_declarations`**: `total = submitted + under_review` (current fiscal year).
- **`devices`**: `total = pending`.
- **`letter_proposals`**: `total = pending`.

#### 4. Extended Categories
- **`tasks`**:
  - `pending`, `in_progress`, `in_review`, `reopened`, `completed`, `cancelled`, `overdue`: Reflects the caller's operational plane (org-wide for HR, direct reports for Manager, personal tasks for Employee).
  - `mine`: Personal tasks for the logged-in user (`open`, `overdue`, `in_review`) — populated for **all** roles so managers/HR can still view their personal tasks.
- **`bank_verification`**:
  - `unverified`: Active members with an unverified primary bank account.
  - `verified`: Active members with a verified primary account.
  - `missing_account`: Active members with no primary bank account.
  - *Reconciliation invariant:* `unverified + verified + missing_account === total active tenant members`.
- **`document_verification`**:
  - `waiting_decision`: The entire pending queue (`status = 'pending_verification'`).
  - `manager_approved`: Documents where manager approved (`recommendation = 'verify'`).
  - `manager_rejected`: Documents where manager rejected (`recommendation = 'reject'`).
  - `no_recommendation`: Direct submissions (`recommendation = 'none'`).
  - *Reconciliation invariant:* `manager_approved + manager_rejected + no_recommendation === waiting_decision`.
- **`document_requests`**:
  - `outstanding`: Requests in `open` or `overdue`.
  - `overdue`: Requests past due date in IST timezone.
  - `fulfilled`: Fulfilled requests.
- **`devices`**: `pending`, `active`, `suspended`, `revoked` trusted device registrations.
- **`loans`**: `pending`, `active`, `closed`, `foreclosed` loan requests.
- **`letter_proposals`**: `pending`, `approved`, `rejected`, `cancelled` proposals.
- **`notifications`**:
  - `unread`: Number of unread notifications, capped at 100.
  - `unread_is_capped`: Boolean (`true` if true count > 100). When `true`, render UI badge as `"99+"` or `"100+"`.
  - `total`: Total historical notifications count for the user.

#### 5. Metadata Object (`data.meta`)
- **`unavailable_categories`** (`string[]`): Sorted array of dotted keys (e.g. `["inbox.claims", "bank_verification"]`) that cannot be accessed due to role restrictions or disabled billing feature flags.
  - **Frontend UI Rule:** If a category is in `unavailable_categories`, **hide or omit the corresponding navigation badge or card** rather than rendering a confusing `0`.
- **`query_ms`** (`number`): Aggregate query execution time on the server (for diagnostics only).
- **`synced_at`** (`string`): ISO-8601 UTC timestamp of the snapshot. Use this to render `"Updated X seconds ago"`.

---

## 3. Role & Permission Matrix

The backend enforces strict privilege separation matching the list/action endpoints:

| Role | Plane | Accessible Categories | Unavailable Categories (Zeroed out) |
|:---|:---|:---|:---|
| **`hr`** | `"org"` | All 12 `inbox.*` categories, all extended categories (`bank_verification`, `document_verification`, `devices`, `loans`, `tax_declarations`, `letter_proposals`, `tasks`, `notifications`). | Empty array `[]` (assuming all billing features enabled). |
| **`admin` / `super-admin`** | `"org"` (Platform) | `inbox.leaves`, `inbox.regularizations`, `inbox.overtime`, `inbox.comp_offs`, `inbox.anomalies`, `inbox.tasks`, `inbox.devices`, `tasks`, `devices`, `notifications`. | `inbox.salary_proposals`, `inbox.claims`, `inbox.loans`, `inbox.tax_declarations`, `inbox.letter_proposals`, `bank_verification`, `document_verification`, `document_requests`, `loans`, `letter_proposals`. *(Platform admins have no employee profile / tenant document & payroll visibility).* |
| **`manager`** | `"team"` | `inbox.leaves`, `inbox.regularizations`, `inbox.overtime`, `inbox.comp_offs`, `inbox.anomalies`, `inbox.tasks`, team `tasks`, `tasks.mine`, team `document_requests`, `notifications`. | All payroll and HR governance categories (`inbox.claims`, `inbox.loans`, `inbox.salary_proposals`, `inbox.tax_declarations`, `inbox.devices`, `inbox.letter_proposals`, `bank_verification`, `document_verification`, `devices`, `loans`, `letter_proposals`). |
| **`employee`** | `"self"` | `tasks.mine`, `document_requests` (own), `notifications`. | Entire `inbox.*` group is zeroed (employees do not approve requests). All HR/manager queues. |

---

## 4. API #133: `GET /api/v1/payroll/hr/reimbursements/claims`

### 4.1 Overview
- **Endpoint:** `GET /api/v1/payroll/hr/reimbursements/claims`
- **Method:** `GET`
- **Auth:** `Authorization: Bearer <access_token>` (HR roles only)

### 4.2 New Query Parameter: `pending_hr`
- **Type:** `boolean` (accepts `true`, `false`, `1`, `0`). Default is `false`.
- **Semantics:** When `pending_hr=true`, returns every reimbursement claim awaiting an **HR decision**:
  1. Claims in `under_review` (Level 1 approved by manager, pending HR Level 2 approval).
  2. Claims in `submitted` where `total_levels = 1` (single-level direct HR approval).
- **Mutual Exclusion with `status`:** Passing both `pending_hr=true` and a `status` parameter (e.g. `?pending_hr=true&status=submitted`) is invalid and returns:
  ```json
  {
    "success": false,
    "message": "pending_hr cannot be combined with status",
    "errorCode": "VALIDATION_ERROR"
  }
  ```
- **Backward Compatibility:** When `pending_hr` is omitted or `false`, existing queries behave identically byte-for-byte.

### 4.3 Badge & Queue Parity Guarantee
```text
GET /api/v1/payroll/hr/reimbursements/claims?pending_hr=true&page=1&limit=20
  ↳ response.pagination.total === badges.data.categories.inbox.claims.total
```
The badge count and the list pagination count are guaranteed to match because they share the identical underlying predicate.

---

## 5. UI Component Data-Binding Matrix

| UI Component / Screen | Target Metric | Exact JSON Path in API Response |
|:---|:---|:---|
| **Main Sidebar** | Inbox Badge | `data.sidebar.inbox_total` |
| **Top Navbar** | Notification Bell Badge | `data.sidebar.notifications_unread` (if `unread_is_capped: true`, show `"99+"`) |
| **Sidebar HR Actions** | Unverified Banks | `data.sidebar.unverified_banks` |
| **Sidebar HR Actions** | Document Verification | `data.sidebar.document_verification_queue` |
| **Inbox Card / Pill** | Leave Approvals | `data.categories.inbox.leaves.total` |
| **Inbox Card / Pill** | Regularization Requests | `data.categories.inbox.regularizations.total` |
| **Inbox Card / Pill** | Overtime Requests | `data.categories.inbox.overtime.total` |
| **Inbox Card / Pill** | Comp-Off Grants | `data.categories.inbox.comp_offs.total` |
| **Inbox Card / Pill** | Attendance Anomalies | `data.categories.inbox.anomalies.total` |
| **Inbox Card / Pill** | Task Review Queue | `data.categories.inbox.tasks.total` |
| **Inbox Card / Pill** | Claims Pending HR | `data.categories.inbox.claims.total` |
| **Inbox Card / Pill** | Loan Applications | `data.categories.inbox.loans.total` |
| **Inbox Card / Pill** | Tax Declarations | `data.categories.inbox.tax_declarations.total` |
| **Inbox Card / Pill** | Device Verification | `data.categories.inbox.devices.total` |
| **Inbox Card / Pill** | Letter Proposals | `data.categories.inbox.letter_proposals.total` |
| **Tasks Tab Badge** | Overdue Tasks | `data.categories.tasks.overdue` |
| **Tasks Tab Badge** | My Open Tasks | `data.categories.tasks.mine.open` |
| **Tasks Tab Badge** | My Overdue Tasks | `data.categories.tasks.mine.overdue` |
| **Documents Tab Badge**| Outstanding Requests | `data.categories.document_requests.outstanding` |
| **Documents Tab Badge**| Overdue Requests | `data.categories.document_requests.overdue` |

---

## 6. Frontend Reference Implementation (TypeScript & React)

### 6.1 TypeScript Interfaces (`types/badgeCounts.ts`)

```typescript
export interface BadgeScope {
  role: 'hr' | 'manager' | 'employee' | 'admin' | 'super-admin';
  plane: 'org' | 'team' | 'self';
  team_size: number | null;
}

export interface SidebarBadges {
  inbox_total: number;
  notifications_unread: number;
  unverified_banks: number;
  document_verification_queue: number;
}

export interface InboxCategoryCounts {
  leaves: { total: number; pending: number; cancellation_pending: number };
  regularizations: { total: number; pending: number };
  overtime: { total: number; pending: number };
  comp_offs: { total: number; earned: number };
  anomalies: { total: number; open: number };
  tasks: { total: number; in_review: number };
  salary_proposals: { total: number; proposed: number };
  claims: { total: number; under_review: number; submitted: number };
  loans: { total: number; pending: number };
  tax_declarations: { total: number; submitted: number; under_review: number };
  devices: { total: number; pending: number };
  letter_proposals: { total: number; pending: number };
}

export interface TaskCategoryCounts {
  pending: number;
  in_progress: number;
  in_review: number;
  reopened: number;
  completed: number;
  cancelled: number;
  overdue: number;
  mine: {
    open: number;
    overdue: number;
    in_review: number;
  };
}

export interface BadgeSummaryData {
  scope: BadgeScope;
  sidebar: SidebarBadges;
  categories: {
    inbox: InboxCategoryCounts;
    tasks: TaskCategoryCounts;
    bank_verification: { unverified: number; verified: number; missing_account: number };
    document_verification: { waiting_decision: number; manager_approved: number; manager_rejected: number; no_recommendation: number };
    document_requests: { outstanding: number; overdue: number; fulfilled: number };
    devices: { pending: number; active: number; suspended: number; revoked: number };
    loans: { pending: number; active: number; closed: number; foreclosed: number };
    letter_proposals: { pending: number; approved: number; rejected: number; cancelled: number };
    notifications: { unread: number; unread_is_capped: boolean; total: number };
  };
  meta: {
    unavailable_categories: string[];
    query_ms: number;
  };
  synced_at: string;
}

export interface BadgeSummaryResponse {
  success: boolean;
  message: string;
  data: BadgeSummaryData;
}
```

---

### 6.2 React Context Provider & Polling Hook (`context/BadgeCountsContext.tsx`)

```tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { BadgeSummaryData, BadgeSummaryResponse } from '../types/badgeCounts';

interface BadgeCountsContextType {
  data: BadgeSummaryData | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  isUnavailable: (categoryKey: string) => boolean;
}

const BadgeCountsContext = createContext<BadgeCountsContextType | undefined>(undefined);

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export const BadgeCountsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<BadgeSummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const cooldownUntilRef = useRef<number>(0);

  const fetchBadges = useCallback(async () => {
    // Respect rate-limit cooldown
    if (Date.now() < cooldownUntilRef.current) {
      return;
    }

    try {
      const response = await axios.get<BadgeSummaryResponse>('/api/v1/inbox/badges', {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (response.data?.success) {
        setData(response.data.data);
        setError(null);
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '60', 10);
        cooldownUntilRef.current = Date.now() + (retryAfter * 1000);
        console.warn(`[Badges] Rate limited. Throttling for ${retryAfter}s`);
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBadges();

    // 1. Timer polling
    const timer = setInterval(() => {
      // Only poll when browser window is visible
      if (document.visibilityState === 'visible') {
        fetchBadges();
      }
    }, POLL_INTERVAL_MS);

    // 2. Immediate refetch on tab focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchBadges();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchBadges]);

  const isUnavailable = useCallback(
    (categoryKey: string): boolean => {
      return data?.meta.unavailable_categories.includes(categoryKey) ?? false;
    },
    [data]
  );

  return (
    <BadgeCountsContext.Provider value={{ data, loading, error, refresh: fetchBadges, isUnavailable }}>
      {children}
    </BadgeCountsContext.Provider>
  );
};

export const useBadgeCounts = (): BadgeCountsContextType => {
  const context = useContext(BadgeCountsContext);
  if (!context) {
    throw new Error('useBadgeCounts must be used within a BadgeCountsProvider');
  }
  return context;
};
```

---

### 6.3 Usage Example in Navigation Component (`Sidebar.tsx`)

```tsx
import React from 'react';
import { useBadgeCounts } from '../context/BadgeCountsContext';

export const Sidebar: React.FC = () => {
  const { data, isUnavailable } = useBadgeCounts();

  const inboxTotal = data?.sidebar.inbox_total ?? 0;
  const leavesPending = data?.categories.inbox.leaves.total ?? 0;
  const claimsPending = data?.categories.inbox.claims.total ?? 0;

  return (
    <nav className="sidebar-nav">
      {/* Primary Inbox Nav Item */}
      <a href="/inbox" className="nav-item">
        <span>Inbox</span>
        {inboxTotal > 0 && <span className="badge badge-primary">{inboxTotal}</span>}
      </a>

      {/* Leave Approvals (hidden if billing disabled or role unavailable) */}
      {!isUnavailable('inbox.leaves') && (
        <a href="/leaves/approvals" className="nav-sub-item">
          <span>Leave Approvals</span>
          {leavesPending > 0 && <span className="badge">{leavesPending}</span>}
        </a>
      )}

      {/* Reimbursement Claims (hidden for non-HR or when payroll entitlement is off) */}
      {!isUnavailable('inbox.claims') && (
        <a href="/payroll/claims?pending_hr=true" className="nav-sub-item">
          <span>Reimbursement Claims</span>
          {claimsPending > 0 && <span className="badge">{claimsPending}</span>}
        </a>
      )}
    </nav>
  );
};
```
