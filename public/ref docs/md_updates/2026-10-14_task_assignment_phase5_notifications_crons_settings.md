# Task Assignment Module — Phase 5: Notifications, Crons & Settings Catalog Integration

**Date:** 2026-10-14  
**Author:** Backend Architecture Team  
**Module:** Task Assignment Subsystem (`src/modules/task`) & Settings Catalog Subsystem (`src/modules/settings`)  
**Status:** Completed & Production-Verified  

---

## 1. Overview & Architectural Scope

Phase 5 finalizes the core enterprise capabilities of the Task Assignment Module by introducing:
1. **Multi-Tenant Task Governance Settings:** Migration `00076` creating the `task_settings` table, model, repository, validator, and service with optimistic concurrency (`assertUpdatedAtMatches`).
2. **Settings Catalog Integration:** Registration of the `tasks.governance` group and 9 typed keys (`#115` through `#123`) into the global settings catalog adhering strictly to Invariants 1–11 and store bijection Invariant 9.
3. **Responsive HTML Email Template:** Standardized multi-purpose notification email template (`src/common/templates/task_notification.html`) utilizing HRClouds purple branding (`#6b21a8`), dynamic priority badges, metadata cards, contextual feedback callouts, and direct action CTAs.
4. **Reliable Transactional Outbox Notification Engine:** Non-blocking background worker with row-level `FOR UPDATE SKIP LOCKED` batch claiming, tenant policy gating, recipient hydration, exponential backoff (2^attempts minutes, max 5 attempts), and crash-resilient startup recovery.
5. **Overdue Task Background Sweeper:** Hourly background scanner querying active past-due tasks via index `tasks_overdue_sweep_idx` and emitting `TASK_OVERDUE` alerts with 24-hour UTC calendar date deduplication watermarks without mutating the core task status (D-T5 invariant).
6. **In-Task Discussion Outbox Hook:** Real-time triggering of `TASK_COMMENT_ADDED` notifications when users post comments on active tasks.
7. **Scheduled Background Workers:** Integrated cron workers registered in `src/server.js` (`task_notification_dispatch.cron.js` running every 60s, `task_overdue_sweeper.cron.js` running hourly), along with node crash recovery on boot.

---

## 2. Settings Catalog Keys Reference (#115–#123)

All task governance settings are manageable via the centralized Organization Settings Gateway (`GET /api/v1/settings/groups/tasks.governance` and `PATCH /api/v1/settings/groups/tasks.governance`):

| Ref | Setting Key | Type | Default | Constraints | Description |
|---|---|---|---|---|---|
| **#115** | `task_max_attachments_per_task` | integer | `20` | `min: 1, max: 50` | Maximum file attachments allowed per task. |
| **#116** | `task_max_reworks_allowed` | integer | `5` | `min: 1, max: 20` | Maximum revision/rework cycles allowed before escalation. |
| **#117** | `task_default_due_days` | integer | `7` | `min: 1, max: 90` | Default due date window in days from task creation. |
| **#118** | `task_allow_assignee_comments` | boolean | `true` | boolean | Controls whether assignees may post progress updates and notes. |
| **#119** | `task_notify_email_on_assignment` | boolean | `true` | boolean | Dispatches email notification when a user is assigned a task. |
| **#120** | `task_notify_email_on_submission` | boolean | `true` | boolean | Dispatches email notification when a deliverable is submitted. |
| **#121** | `task_notify_email_on_reopen` | boolean | `true` | boolean | Dispatches email notification when rework is requested. |
| **#122** | `task_notify_email_on_completion` | boolean | `true` | boolean | Dispatches email notification when a task is approved and completed. |
| **#123** | `task_notify_email_on_overdue` | boolean | `true` | boolean | Dispatches daily reminder alert when an active task exceeds its due date. |

---

## 3. Email Notification Template & Event Types

The centralized template `src/common/templates/task_notification.html` maps to 9 distinct domain events registered in `TEMPLATE_MAP` (`src/common/utilities/email.utils.js`):

| Event Key | Event Name | Target Recipient | Contextual Content Displayed |
|---|---|---|---|
| `task_assigned` | Task Assigned | Assignee | Priority badge, due date, assigner name, and task instructions. |
| `task_submitted` | Deliverable Submitted | Assigner | Submission note and external deliverables / review links. |
| `task_reopened` | Rework Requested | Assignee | Reopen justification note, rework counter, and action link. |
| `task_completed` | Task Approved & Completed | Assignee | Completion confirmation and approval comments. |
| `task_reassigned` | Task Reassigned | New Assignee | Reassignment reason, new due date, and handoff notes. |
| `task_cancelled` | Task Cancelled | Assignee | Cancellation reason and termination notice. |
| `task_due_date_extended`| Due Date Extended | Assignee | Previous due date, revised due date, and extension justification. |
| `task_comment_added` | New Comment / Feedback | Counterpart | Comment message body, author name, and direct reply link. |
| `task_overdue` | Task Past Due | Assignee & Assigner | Urgent alert banner, overdue duration, and immediate action link. |

---

## 4. Cron Schedules & Reliability Architecture

1. **Transactional Outbox Worker (`task_notification_dispatch.cron.js`):**
   - **Frequency:** Every 60 seconds (`* * * * *`).
   - **Concurrency Protection:** Uses `FOR UPDATE SKIP LOCKED` inside a short claim transaction, preventing duplicate processing across multiple Node.js worker instances.
   - **Exponential Backoff:** If AWS SES or network transport fails, retry is scheduled at `2^attempts` minutes (2m, 4m, 8m, 16m, 32m).
   - **Dead Letter / Poison Handling:** If attempts reach 5, status transitions permanently to `failed`.
2. **Overdue Task Sweeper (`task_overdue_sweeper.cron.js`):**
   - **Frequency:** Hourly (`0 * * * *`).
   - **D-T5 Invariant Protection:** Sweeper queries candidates dynamically using partial index `tasks_overdue_sweep_idx` and enqueues `TASK_OVERDUE` alerts without mutating `tasks.status`.
   - **24-Hour Calendar Deduplication:** Enqueues with composite deduplication key `task_overdue:{recipientType}:{taskId}:{recipientId}:{YYYY-MM-DD}`, guaranteeing at most one alert per day per party.
3. **Crash Recovery Catch-Up:**
   - On server startup (`server.js`), an asynchronous recovery pass (`taskNotificationService.runStartupCatchUp()`) resets orphaned `processing` records older than 10 minutes back to `pending`.

---

## 5. Automated Verification & Test Results

The comprehensive automated test suite covers all Phase 5 capabilities and full module regressions:
- **Phase 1 Test Suite:** `tests/unit/task/task_models_and_repos.test.js` (13/13 passing)
- **Phase 2 Test Suite:** `tests/unit/task/task_phase2_service_and_api.test.js` (16/16 passing)
- **Phase 3 Test Suite:** `tests/unit/task/task_phase3_lifecycle_and_attachments.test.js` (14/14 passing)
- **Phase 4 Test Suite:** `tests/unit/task/task_phase4_comments_and_audit.test.js` (19/19 passing)
- **Phase 5 Test Suite:** `tests/unit/task/task_phase5_notifications_and_crons.test.js` (18/18 passing)
- **Settings Catalog Invariants:** `tests/unit/settings/settings_audit_recorder.test.js` (10/10 passing)
- **Total Passing Tests:** **90 / 90 tests passing (100% green)**
