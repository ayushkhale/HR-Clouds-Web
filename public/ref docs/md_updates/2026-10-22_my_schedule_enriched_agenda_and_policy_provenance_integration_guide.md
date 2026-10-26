# Frontend Integration Guide: Enriched "My Schedule" & Policy Provenance

**Document Version:** 2.0.0  
**Date:** 2026-10-22  
**Author:** Senior Principal Backend & Frontend Architecture Team  
**Target Audience:** Frontend Web & Mobile Engineers, UI/UX Designers, Product Managers  
**Module:** Attendance & Workforce Schedule (`/src/modules/attendance`)  
**Primary Endpoint:** `GET /api/v1/attendance/schedule/agenda`  
**Companion Documents:**  
- [`2026-10-22_frontend_my_schedule_forward_view_integration_guide.md`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_updates/2026-10-22_frontend_my_schedule_forward_view_integration_guide.md)
- [`2026-10-22_my_schedule_forward_view_api_delivery.md`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_updates/2026-10-22_my_schedule_forward_view_api_delivery.md)
- [`2026-10-21_shift_and_attendance_policy_visibility_frontend_guide.md`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_updates/2026-10-21_shift_and_attendance_policy_visibility_frontend_guide.md)

---

## 1. Executive Summary & Why This Upgrade Was Shipped

In Version 1 of the forward view agenda (`GET /api/v1/attendance/schedule/agenda`), the frontend was provided with a dense calendar containing server-resolved `day_kind` calculations. However, user feedback and UX reviews highlighted three major operational blindspots:

1. **The "Nameless Weekend" Problem**:
   Weekly offs were marked simply as `day_kind: "weekly_off"`. Employees had no visibility into **which weekly off rule applied to them, what the rule's name was, or why they had that day off** (e.g. *Did this apply because they belong to the "Engineering" department? Or is it an org-wide corporate policy?*).
2. **The "Hollow Task Card" Problem**:
   Tasks falling due on the agenda only contained minimal identifiers (`id`, `title`, `status`, `priority`, `due_at`). The employee couldn't see **who assigned the task**, **what the instructions/briefing were**, **category taxonomy**, **original deadlines / extension counts**, or **reference links** without making extra secondary API calls.
3. **The "Invisible Rulebook" Problem**:
   Employees could see their shift start/end times, but had **zero visibility into the evaluation rules** (grace periods, half-day vs. full-day thresholds, break limits, and regularization retrospective windows).

### What Has Been Shipped (Version 2.0 Backend Enhancements)
In this release, `GET /api/v1/attendance/schedule/agenda` has been enriched with:
- **`employee` context**: Direct department, designation, employee code, and employment type that explain all audience targeting.
- **`weekly_off_policy` (Top-Level)**: Details of the active weekly-off policy, including `matched_by` (e.g. `'department'`), `matched_entity_name` (e.g. `'Engineering'`), and priority.
- **`days[].weekly_off` (Per-Day)**: When `day_kind === 'weekly_off'`, each day carries the matching rule name, rule ID, and matching provenance.
- **`attendance_policy` (Top-Level)**: The fully resolved attendance policy rules (grace minutes, half-day/full-day hours, break duration caps, regularization windows).
- **Rich Task Items**: Full briefing `description`, `category`, `assigner` object (name, avatar, designation), `original_due_date`, `extension_count`, `external_links`, `is_viewed`, and `rework_count`.

---

## 2. Authoritative JSON Schema & TypeScript Definitions

### 2.1 Complete Response Example

```json
{
  "success": true,
  "message": "Schedule fetched",
  "data": {
    "employee": {
      "id": "87974b73-c248-428d-9b35-09598df16e55",
      "name": "Maya Sharma",
      "avatar_url": "https://assets.compunic.com/avatars/maya.png",
      "employee_code": "EMP-0142",
      "department": "Engineering",
      "department_id": "dept-101",
      "designation": "Senior Full Stack Engineer",
      "location_id": "loc-303",
      "work_location": "Mumbai Tech Center",
      "employment_type": "full_time",
      "job_status": "confirmed",
      "joining_date": "2020-01-01"
    },
    "attendance_policy": {
      "id": "pol-505",
      "name": "Engineering Standard Attendance Policy",
      "is_default": false,
      "grace_minutes": 15,
      "late_threshold_minutes": 30,
      "half_day_min_hours": 4.0,
      "full_day_min_hours": 8.0,
      "early_exit_threshold_minutes": 15,
      "max_breaks_per_day": 3,
      "max_break_duration_minutes": 60,
      "regularization_allowed": true,
      "regularization_window_days": 7,
      "overtime_enabled": true,
      "overtime_min_minutes": 60,
      "auto_clock_out_enabled": true,
      "auto_clock_out_after_hours": 12.0
    },
    "weekly_off_policy": {
      "rule_id": "wo-dept-1",
      "rule_name": "Tech & Product 5-Day Work Week",
      "days_of_week": [0, 6],
      "priority": 10,
      "matched_by": "department",
      "matched_entity_name": "Engineering",
      "effective_from": "2026-01-01",
      "effective_to": null
    },
    "range": {
      "from": "2026-10-22",
      "to": "2026-11-20",
      "timezone": "Asia/Kolkata"
    },
    "summary": {
      "working_days": 20,
      "weekly_offs": 8,
      "holidays": 1,
      "leave_days": 1,
      "unassigned_days": 0,
      "items_due": 3,
      "next_day_off": "2026-10-25",
      "next_holiday": {
        "date": "2026-11-01",
        "name": "Diwali"
      }
    },
    "lanes": {
      "shift": "ok",
      "holidays": "ok",
      "leave": "ok",
      "tasks": "ok",
      "documents": "ok",
      "comp_offs": "ok",
      "shift_changes": "ok"
    },
    "days": [
      {
        "date": "2026-10-22",
        "day_kind": "working",
        "shift": {
          "id": "sh-707",
          "name": "General Day Shift",
          "start_time": "09:30:00",
          "end_time": "18:30:00",
          "is_overnight": false,
          "timezone": "Asia/Kolkata",
          "source": "assignment"
        },
        "holiday": null,
        "leave": null,
        "weekly_off": null,
        "items": [
          {
            "kind": "task_due",
            "id": "tsk-808",
            "title": "Deploy API Gateway Rate Limiter",
            "description": "Implement Redis-backed sliding window rate limiter for public auth endpoints.",
            "category": "operational",
            "status": "in_progress",
            "priority": "high",
            "is_overdue": false,
            "due_at": "2026-10-22T18:00:00+05:30",
            "original_due_date": "2026-10-20T18:00:00+05:30",
            "extension_count": 1,
            "is_viewed": true,
            "first_viewed_at": "2026-10-21T10:15:00+05:30",
            "rework_count": 0,
            "external_links": [
              {
                "label": "Architecture RFC",
                "url": "https://wiki.compunic.internal/rfc/rate-limiter"
              }
            ],
            "assigner": {
              "id": "mgr-404",
              "name": "Rahul Verma",
              "designation": "Engineering Manager",
              "avatar_url": "https://assets.compunic.com/avatars/rahul.png"
            }
          }
        ],
        "status_source": "derived",
        "status_reason": "upcoming"
      },
      {
        "date": "2026-10-25",
        "day_kind": "weekly_off",
        "shift": null,
        "holiday": null,
        "leave": null,
        "weekly_off": {
          "rule_id": "wo-dept-1",
          "rule_name": "Tech & Product 5-Day Work Week",
          "day_name": "Sunday",
          "priority": 10,
          "matched_by": "department"
        },
        "items": [],
        "status_source": "derived",
        "status_reason": "weekly_off"
      }
    ]
  }
}
```

---

### 2.2 TypeScript Interface Definitions

```typescript
export interface ScheduleAgendaResponse {
  success: boolean;
  message: string;
  data: {
    employee: EmployeeContext;
    attendance_policy: AttendancePolicyDto | null;
    weekly_off_policy: WeeklyOffPolicyDto | null;
    range: {
      from: string;      // YYYY-MM-DD
      to: string;        // YYYY-MM-DD
      timezone: string;  // e.g. "Asia/Kolkata"
    };
    summary: AgendaSummary;
    lanes: Record<string, 'ok' | 'unavailable' | 'truncated' | 'excluded'>;
    days: DayAgendaEntry[];
  };
}

export interface EmployeeContext {
  id: string;
  name: string;
  avatar_url: string | null;
  employee_code: string | null;
  department: string | null;
  department_id: string | null;
  designation: string | null;
  location_id: string | null;
  work_location: string | null;
  employment_type: string | null;
  job_status: string | null;
  joining_date: string | null; // YYYY-MM-DD
}

export interface AttendancePolicyDto {
  id: string;
  name: string;
  is_default: boolean;
  grace_minutes: number;
  late_threshold_minutes: number;
  half_day_min_hours: number;
  full_day_min_hours: number;
  early_exit_threshold_minutes: number;
  max_breaks_per_day: number | null;
  max_break_duration_minutes: number | null;
  regularization_allowed: boolean;
  regularization_window_days: number;
  overtime_enabled: boolean;
  overtime_min_minutes: number;
  auto_clock_out_enabled: boolean;
  auto_clock_out_after_hours: number;
}

export interface WeeklyOffPolicyDto {
  rule_id: string;
  rule_name: string;
  days_of_week: number[]; // 0 = Sunday ... 6 = Saturday
  priority: number;
  matched_by: 'user' | 'department' | 'location' | 'shift' | 'employment_type' | 'job_status' | 'org_default';
  matched_entity_name: string | null;
  effective_from: string | null;
  effective_to: string | null;
}

export interface DayAgendaEntry {
  date: string; // YYYY-MM-DD
  day_kind: 'working' | 'weekly_off' | 'holiday' | 'leave' | 'half_day_leave' | 'unassigned';
  shift: ShiftDto | null;
  holiday: HolidayDto | null;
  leave: LeaveDto | null;
  weekly_off: WeeklyOffEntryDto | null;
  items: AgendaItem[];
  status_source: 'record' | 'derived';
  status_reason: string;
}

export interface WeeklyOffEntryDto {
  rule_id: string;
  rule_name: string;
  day_name: string; // "Sunday", "Saturday", etc.
  priority: number;
  matched_by: 'user' | 'department' | 'location' | 'shift' | 'employment_type' | 'job_status' | 'org_default';
}

export interface TaskDueItemDto {
  kind: 'task_due';
  id: string;
  title: string;
  description: string | null;
  category: 'operational' | 'compliance' | 'onboarding' | 'administrative' | 'general';
  status: 'pending' | 'in_progress' | 'in_review' | 'reopened' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_overdue: boolean;
  due_at: string; // Full ISO 8601 with offset
  original_due_date: string | null;
  extension_count: number;
  is_viewed: boolean;
  first_viewed_at: string | null;
  rework_count: number;
  external_links: Array<{ label: string; url: string }>;
  assigner: {
    id: string;
    name: string | null;
    designation: string | null;
    avatar_url: string | null;
  } | null;
}
```

---

## 3. UI/UX Component Implementation Guide

### 3.1 Header Widget: Employee Profile & Policy Bar
Place this card at the top of the "My Schedule" screen. It explains the entire rules framework in one glance:

```
+---------------------------------------------------------------------------------------------------------+
|  Maya Sharma (EMP-0142)  •  Senior Full Stack Engineer                                                  |
|  Department: Engineering  •  Location: Bangalore HQ                                                     |
|                                                                                                         |
|  [Shift: General Day Shift (09:30 AM - 06:30 PM)]                                                       |
|  [Weekly Off: Tech & Product 5-Day Work Week (Matched by: Engineering Dept)]                            |
|                                                                                                         |
|  POLICY RULES: Engineering Standard Attendance Policy                                                   |
|  * Grace Period: 15 mins (Punch in before 09:45 AM without penalty)                                      |
|  * Half-Day: 4.0h min  |  Full-Day: 8.0h min                                                            |
|  * Break Limits: Max 3 breaks / 60 mins daily                                                           |
|  * Regularization Window: 7 days                                                                        |
+---------------------------------------------------------------------------------------------------------+
```

#### Frontend Logic:
```tsx
export function PolicySummaryBanner({ policy, weeklyOffPolicy, employee }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{employee.name}</h2>
          <p className="text-sm text-slate-500">
            {employee.designation} • {employee.department || 'General'}
          </p>
        </div>
        <div className="flex gap-2">
          {weeklyOffPolicy && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              <CalendarOff className="h-3.5 w-3.5" />
              {weeklyOffPolicy.rule_name}
              <span className="text-indigo-400">({weeklyOffPolicy.matched_by})</span>
            </span>
          )}
        </div>
      </div>

      {policy && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t pt-3 border-slate-100 text-xs">
          <div>
            <span className="text-slate-400 block">Grace Period</span>
            <span className="font-medium text-slate-700">{policy.grace_minutes} mins</span>
          </div>
          <div>
            <span className="text-slate-400 block">Work Thresholds</span>
            <span className="font-medium text-slate-700">{policy.half_day_min_hours}h Half / {policy.full_day_min_hours}h Full</span>
          </div>
          <div>
            <span className="text-slate-400 block">Max Breaks</span>
            <span className="font-medium text-slate-700">{policy.max_breaks_per_day || 'Unlimited'} ({policy.max_break_duration_minutes || '∞'}m)</span>
          </div>
          <div>
            <span className="text-slate-400 block">Regularization Window</span>
            <span className="font-medium text-slate-700">Within {policy.regularization_window_days} days</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### 3.2 Weekly Off Day Card with Targeting Provenance

When rendering calendar cells or agenda day strips:
- If `day.day_kind === 'weekly_off'`:
  - Show the day as non-working with subtle stripe or muted background.
  - Render a badge: `Weekly Off: ${day.weekly_off.rule_name}`.
  - Hovering/Tapping shows the provenance tooltip:
    *"Applied via Department Rule: Engineering (Priority ${day.weekly_off.priority})"*

```tsx
export function WeeklyOffCard({ day }: { day: DayAgendaEntry }) {
  const wo = day.weekly_off;
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4 border border-slate-100">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <Coffee className="h-5 w-5" />
        </div>
        <div>
          <span className="text-sm font-semibold text-slate-800">Weekly Off ({wo?.day_name})</span>
          <p className="text-xs text-slate-500">
            {wo?.rule_name}
            {wo?.matched_by === 'department' && ' • Department Assignment'}
          </p>
        </div>
      </div>
      <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
        Non-Working
      </span>
    </div>
  );
}
```

---

### 3.3 Rich Task Card & Drawer

With the newly enriched `task_due` item payload, the frontend can render rich interactive task cards directly within the day's agenda:

```
+-----------------------------------------------------------------------+
|  [High Priority]  [Operational]  [Due: Today, 6:00 PM]                |
|  Deploy API Gateway Rate Limiter                                      |
|                                                                       |
|  Implement Redis-backed sliding window rate limiter for public        |
|  auth endpoints.                                                      |
|                                                                       |
|  [Avatar] Assigned by: Rahul Verma (Engineering Manager)              |
|  [PR #104 Link]  •  Deadline Extended 1 time                          |
|                                                                       |
|  [ Mark In Progress ]  [ Open Task Details -> ]                       |
+-----------------------------------------------------------------------+
```

#### Frontend Implementation:
```tsx
export function TaskDueCard({ task }: { task: TaskDueItemDto }) {
  const priorityColors = {
    urgent: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-amber-50 text-amber-700 border-amber-200',
    medium: 'bg-blue-50 text-blue-700 border-blue-200',
    low: 'bg-slate-50 text-slate-700 border-slate-200'
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${priorityColors[task.priority]}`}>
            {task.priority.toUpperCase()}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {task.category}
          </span>
          {task.extension_count > 0 && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Extended
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          Due: {dayjs(task.due_at).format('hh:mm A')}
        </span>
      </div>

      <h4 className="text-sm font-semibold text-slate-900">{task.title}</h4>
      {task.description && (
        <p className="mt-1 text-xs text-slate-600 line-clamp-2">{task.description}</p>
      )}

      {task.external_links && task.external_links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {task.external_links.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {link.label}
            </a>
          ))}
        </div>
      )}

      {task.assigner && (
        <div className="mt-3 flex items-center gap-2 border-t pt-2 border-slate-100">
          {task.assigner.avatar_url ? (
            <img src={task.assigner.avatar_url} alt="" className="h-5 w-5 rounded-full" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-slate-200 text-[10px] flex items-center justify-center font-bold">
              {task.assigner.name.charAt(0)}
            </div>
          )}
          <span className="text-xs text-slate-500">
            Assigned by <strong className="text-slate-700">{task.assigner.name}</strong>
            {task.assigner.designation && ` (${task.assigner.designation})`}
          </span>
        </div>
      )}
    </div>
  );
}
```

---

## 4. State Management & Data Fetching

### React Query / SWR Hook

```typescript
import useSWR from 'swr';
import apiClient from '@/lib/apiClient';
import { ScheduleAgendaResponse } from '@/types/schedule';

export function useMyScheduleAgenda(from?: string, to?: string, include?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (include) params.set('include', include);

  const queryKey = `/api/v1/attendance/schedule/agenda?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<ScheduleAgendaResponse>(
    queryKey,
    (url: string) => apiClient.get(url).then(res => res.data),
    {
      revalidateOnFocus: true,
      dedupingInterval: 10000
    }
  );

  return {
    agenda: data?.data,
    employee: data?.data?.employee,
    attendancePolicy: data?.data?.attendance_policy,
    weeklyOffPolicy: data?.data?.weekly_off_policy,
    days: data?.data?.days || [],
    summary: data?.data?.summary,
    lanes: data?.data?.lanes,
    isLoading,
    isError: Boolean(error),
    mutate
  };
}
```

---

## 5. Summary of Backward Compatibility & Safety

1. **No Breaking Field Removals**:
   - `range`, `summary`, `lanes`, and `days` remain in the identical position and format.
2. **Deterministic Day Keys**:
   - Every entry in `days[]` continues to carry all keys (`date`, `day_kind`, `shift`, `holiday`, `leave`, `weekly_off`, `items`, `status_source`, `status_reason`).
   - On non-weekly-off days, `weekly_off` is explicitly `null` (never missing or undefined).
3. **Graceful Lane Degradation**:
   - `lanes.tasks`, `lanes.documents`, `lanes.comp_offs`, and `lanes.shift_changes` report `ok`, `unavailable`, `truncated`, or `excluded`. The calendar lanes (`shift`, `holidays`, `leave`) are mandatory and never degrade.
