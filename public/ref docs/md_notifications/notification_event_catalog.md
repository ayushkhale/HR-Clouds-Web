# Notification Event Catalog & Prioritised HRMS API Matrix

| | |
|---|---|
| **Status** | PLAN ONLY — the catalog file does not exist yet |
| **Authored** | 2026-10-24 |
| **Target file** | `src/modules/notification/constants/notification_catalog.js` |
| **Parent plan** | [`notification_system_implementation_plan.md`](notification_system_implementation_plan.md) |
| **`CATALOG_VERSION`** | `2026-10-24.1` |

This is the authoring sheet for the catalog and the exhaustive hook list for Phases 3–5. Every
**Hook site** below was read in the tree — file, method and the transaction boundary are real, not
inferred.

---

## 0. Read this before planning the rollout

### 0.1 Four Tier-2/3 items in the brief have no source feature to hook

| Brief item | Reality |
|---|---|
| "Shift swap requested / accepted" | **No swap feature exists.** No file in `src/modules/attendance` mentions a swap. There is nothing to notify about. |
| "Shift schedule published" | There is no *publish* step. `shift.service.assignShiftToEmployee` assigns one employee at a time and `rotation.service.createRotationPattern` defines a pattern. The notifiable event is the **assignment**, not a publish. |
| "Employee birthday and work anniversary greetings" | **No birthday/anniversary feature exists** — no code in `src/` references either. Needs a cron that reads `user_profiles.date_of_birth` / `date_of_joining`, which is a new domain feature. |
| "Company announcements / org-wide broadcast" | **No announcement feature exists** — no model, table, endpoint or service. Needs an `announcements` table, HR authoring endpoints and its own migration. |
| "Profile change approved" | No maker-checker flow exists for profiles today; HR edits directly. See the manager maker-checker direction separately — it is a feature, not a notification. |

**Consequence:** Tier 3 is not "just crons". Three of its four items are new domain features that
must be planned and built *before* a notification can exist for them. The plan's Phase 5 therefore
covers only the Tier-3 events whose source already exists (punch reminders, document expiry), and
the rest are listed in §X as blocked.

### 0.2 Legend

- **`to`** — recipient spec resolved inside the notification module (never at the call site).
- **`dedupe`** — `entity` (once ever) · `entity_day` (once per day) · `occurrence` (never suppressed).
- **`email_owner`** — `null` means the engine owns email for this event. A module name means
  **that module already emails it**; the engine must not (plan D-8), so `email ∉ channels`.
- **`enqueue`** — `post-commit` uses `send()` after `commit()`; `in-txn` uses
  `enqueue(…, { transaction })` with a savepoint, for events where loss is unacceptable.

---

## Tier 1 — Core & critical (Phase 3)

Real-time transactions where an employee or manager is blocked until they know.

### T1.1 Leave

| # | `event_key` | Hook site | `to` | Channels | `dedupe` | `email_owner` | Deep link |
|---|---|---|---|---|---|---|---|
| 1 | `leave.applied` | `leave/services/leave_application.service.js` → `submitLeaveRequest`, after `transaction.commit()` (line 461) | `reporting_manager`, `fallback: 'hr_plane'` | `in_app`, `push`, `email` | `entity` | `null` (engine) | `LeaveRequestDetail` / `{ id: leave_id }` |
| 2 | `leave.approved` | `leave/services/leave_approval.service.js` → `approveRequest`, after `commit()` (line 246) | `target_user` | `in_app`, `push`, `email` | `entity` | `null` | `LeaveDetails` / `{ id }` |
| 3 | `leave.rejected` | same file → `rejectRequest`, after `commit()` (line 284) | `target_user` | `in_app`, `push`, `email` | `entity` | `null` | `LeaveDetails` / `{ id }` |
| 4 | `leave.cancellation_requested` | `leave_application.service.js` → `cancelLeaveRequest`, after `commit()` (line 542) | `reporting_manager`, `fallback: 'hr_plane'` | `in_app`, `push` | `occurrence` | `null` | `LeaveRequestDetail` |
| 5 | `leave.cancelled` | `leave_approval.service.js` → `approveRequest` on the `cancellation_pending` branch | `target_user` | `in_app`, `push` | `entity` | `null` | `LeaveDetails` |

Templates:

```text
leave.applied      title "Leave request pending approval"
                   message "{{employee_name}} has applied for {{leave_type}} leave from
                            {{from_date}} to {{to_date}} ({{day_count}} day(s))."
                   push    "{{employee_name}} applied for {{leave_type}} leave."
leave.approved     title "Leave approved"
                   message "Your {{leave_type}} leave from {{from_date}} to {{to_date}} was
                            approved by {{actor_name}}."
                   push    "Your {{leave_type}} leave was approved."
leave.rejected     title "Leave rejected"
                   message "Your {{leave_type}} leave from {{from_date}} to {{to_date}} was
                            rejected by {{actor_name}}. Reason: {{rejection_reason}}"
                   push    "Your {{leave_type}} leave request was rejected."
```

> `rejection_reason` is **manager-entered free text**. It appears in `message` (in-app, plain) and in
> the email, where it is HTML-escaped by the renderer's `html` shape (plan §B.5.4 / D-12). It is
> **not** in `push_body` and **not** in `push_data_keys`.

### T1.2 Attendance

| # | `event_key` | Hook site | `to` | Channels | `dedupe` | `email_owner` |
|---|---|---|---|---|---|---|
| 6 | `attendance.regularization_requested` | `attendance/services/regularization.service.js` → `submitRequest`, after `commit()` (line 169) | `reporting_manager`, `fallback: 'hr_plane'` | `in_app`, `push` | `entity` | `null` |
| 7 | `attendance.regularization_approved` | same file → `approveRequest`, after `commit()` (line 402) | `target_user` | `in_app`, `push` | `entity` | `null` |
| 8 | `attendance.regularization_rejected` | same file → `rejectRequest`, after `commit()` (line 485) | `target_user` | `in_app`, `push` | `entity` | `null` |
| 9 | `attendance.anomaly_flagged` | **NOT** `anomaly.service.createAnomaly` — see the note below | `hr_plane` | `in_app` | `entity_day` | `null` |
| 10 | `attendance.location_requested` | `attendance/services/location_tracking.service.js` → `locate` (line 42), after its own writes commit | `target_user` | `in_app` **only** | `occurrence` | `null` |

> **#9 — do not hook `anomaly.service`.** `createAnomaly(data, transaction)` is called from
> `detectAnomalies(record, policy, shift, transaction)`, which runs **inside the punch transaction**
> owned by `clock.service`. Calling `send()` there would dispatch before the punch committed, and
> calling it in-line would be a notification inside a hot transaction. Hook it **post-commit in
> `clock.service`**, driven by the anomaly ids `detectAnomalies` returns. `dedupe: 'entity_day'`
> keyed on `{user_id}:{date}` — a spoof-suspected employee must not generate one HR alert per punch.

> **#10 — the engine must not send this push.** `locate` already calls
> `pushDispatchService.dispatchToUser` **synchronously inside the request**, because its SLA is 60 s
> end to end and the engine's fastest drain is 60 s (plan D-21). The engine's job here is the
> `in_app` row only — which doubles as the DPDP notice that the employee's location was requested,
> and is the employee-visible record the location spec's D-6 demanded. Channels are `['in_app']`,
> so the row is inserted `dispatch_status = 'sent'` and the drain never touches it.

### T1.3 Payroll

| # | `event_key` | Hook site | `to` | Channels | `dedupe` | `email_owner` |
|---|---|---|---|---|---|---|
| 11 | `payroll.payslip_published` | `payroll/services/payslip.service.js` → `publish`, after `t.commit()` (line 614). **`sendBulk`** (plan D-9) | `target_user` | `in_app`, `push` | `entity` (`payslip_id`) | **`payroll_dispatch`** |
| 12 | `payroll.reimbursement_approved` | `payroll/services/reimbursement_approval.service.js` → `approveLevel` (line 59), post-commit | `target_user` | `in_app`, `push` | `entity` | `null` |
| 13 | `payroll.reimbursement_rejected` | same file → `reject` (line 217), post-commit | `target_user` | `in_app`, `push` | `entity` | `null` |

> **#11 carries no email.** `payslip_dispatch.service.js` already owns payslip email: `publish()`
> sets `email_status = 'pending'` inside the same transaction when `payslip_auto_email` is on, and
> `payslip_email_dispatch.cron` (every 20 min) sends `payslip_available` via `TEMPLATE_MAP`. Adding
> `email` to this event sends every employee **two** emails. Catalog invariant 4 + test T-N3 make
> that a build failure.

> **#11 push body carries no figure.** "Your payslip for {{period_month}} is ready." No net pay, no
> gross, no deductions — a push renders on a lock screen (plan D-13). `push_data_keys` is
> `['screen', 'id', 'event_key']`.

### T1.4 Task

| # | `event_key` | Hook site | `to` | Channels | `dedupe` | `email_owner` |
|---|---|---|---|---|---|---|
| 14 | `task.assigned` | `task/services/task.service.js` → `createTask` (line 183), post-commit | `target_user` (assignee) | `in_app`, `push` | `entity` | **`task_outbox`** |
| 15 | `task.submitted_for_review` | same file → `submitTask` (line 711), post-commit | `actor`'s assigner — use `to: 'target_user'` with `target_user_id = assigner_id` | `in_app`, `push` | `occurrence` | **`task_outbox`** |
| 16 | `task.reopened` | same file → `reopenTask` (line 899), post-commit | `target_user` (assignee) | `in_app`, `push` | **`occurrence`** | **`task_outbox`** |
| 17 | `task.approved` | same file → `approveTask` (line 811), post-commit | `target_user` (assignee) | `in_app`, `push` | `entity` | **`task_outbox`** |
| 18 | `task.reassigned` | same file → `reassignTask` (line 1010), post-commit | `target_user` (new assignee) | `in_app`, `push` | `occurrence` | `task_outbox` |

> **Every task event has `email_owner: 'task_outbox'`** and therefore **no `email` channel.**
> `task_notification.service` already emails `task_assigned`, `task_submitted`, `task_reopened`,
> `task_completed` and `task_overdue`, gated on five `task_settings.task_notify_email_on_*` toggles
> and drained by `task_notification_dispatch.cron` every 60 s. The engine adds **in-app + push
> only** — which is the gap, since the task module has no in-app inbox at all.

> **#16 is `occurrence`, not `entity`** (plan D-14). A task can legitimately be reopened three
> times; `entity` dedupe would silently drop reopens two and three. The existing task outbox has
> this same characteristic and handles it with a per-event dedupe key — the engine's `occurrence`
> mode (null dedupe key) is the equivalent.

---

## Tier 2 — Operational & workflow (Phase 4)

| # | `event_key` | Hook site | `to` | Channels | `dedupe` |
|---|---|---|---|---|---|
| 19 | `attendance.overtime_approved` | `attendance/services/overtime.service.js` → `approveOvertime` (line 46), post-commit | `target_user` | `in_app`, `push` | `entity` |
| 20 | `attendance.overtime_rejected` | same file → `rejectOvertime` (line 79), post-commit | `target_user` | `in_app`, `push` | `entity` |
| 21 | `attendance.comp_off_approved` | `attendance/services/comp_off.service.js` → `approveCompOff` (line 86), post-commit | `target_user` | `in_app`, `push` | `entity` |
| 22 | `attendance.comp_off_rejected` | same file → `rejectCompOff` (line 155), post-commit | `target_user` | `in_app`, `push` | `entity` |
| 23 | `attendance.comp_off_expiring` | `cron-jobs/comp_off_expiry_sync.cron.js` → `comp_off.service.expireStaleCompOffs` (line 221). **`sendBulk`** | `target_user` | `in_app`, `push` | `entity_day` |
| 24 | `shift.assigned` | `attendance/services/shift.service.js` → `assignShiftToEmployee` (line 150), post-commit | `target_user` | `in_app`, `push` | `entity` |
| 25 | `shift.assignment_ended` | same file → `endShiftAssignment` (line 269), post-commit | `target_user` | `in_app` | `entity` |
| 26 | `employee.bank_account_verified` | `payroll/services/bank_account.service.js` → `verify` (line 134), post-commit | `target_user` | `in_app`, `push` | `entity` |
| 27 | `leave.policy_assigned` | `leave/services/leave_assignment.service.js` (roster/bulk assign paths). **`sendBulk`** | `target_user` | `in_app` | `entity` |

**Not buildable in Tier 2** (no source feature — see §0.1): shift swap requested/accepted, shift
schedule published, profile change approved.

> **#23 and #27 are the first `sendBulk` call sites outside payroll.** A comp-off expiry sweep or a
> policy roster assignment touches hundreds of employees in one pass. Hooking them with per-user
> `send()` inside the cron's loop would issue one insert and one drain nudge per employee.

---

## Tier 3 — Informational & scheduled (Phase 5)

### T3.1 Buildable now — the source already exists

| # | `event_key` | Source | `to` | Channels | `dedupe` |
|---|---|---|---|---|---|
| 28 | `attendance.shift_start_reminder` | **New** cron, 15 min before each shift start. Resolve shifts via `shift.service` + `weekly_off.service` (a weekly-off or holiday **must** suppress it — the day-status resolver owns that precedence, do not re-inline the calendar probes). **`sendBulk`** | `target_user` | `push` + `in_app` | `entity_day` |
| 29 | `attendance.missing_clock_out_reminder` | Hook into the existing `cron-jobs/auto_clock_out.cron.js` pass, which already finds open punches. **`sendBulk`** | `target_user` | `push` + `in_app` | `entity_day` |
| 30 | `document.expiring_soon` | `document/services/document_automation.service.js` → `_passExpiryReminders` (line 188) | `target_user` | `in_app` | `entity_day` | **`email_owner: 'document_outbox'`** |
| 31 | `document.acknowledgement_pending` | same service's reminder pass | `target_user` | `in_app` | `entity_day` | **`email_owner: 'document_outbox'`** |
| 32 | `document.request_overdue` | same service's overdue flip | `target_user` | `in_app` | `entity_day` | **`email_owner: 'document_outbox'`** |
| 33 | `payroll.declaration_window_reminder` | `cron-jobs/payroll_calendar_reminders.cron.js` (08:00 IST) — already computes the cohort | `target_user` | `in_app`, `push` | `entity_day` | **`email_owner: 'payroll_reminders'`** |

> **#30–#33 are in-app only.** All four are already emailed — documents by
> `document_notification_dispatch.cron`, payroll by `payroll_calendar_reminders.cron` via
> `sendPayrollActionReminderEmail`. The engine's contribution is that these events become *visible
> in the app*, which they are not today.

> **#28 is the one event with `push` ahead of `in_app` in intent** but it still carries `in_app`
> (catalog invariant 3): a missed reminder push must leave a trace, or an employee who had their
> phone off has no way to know a reminder was due.

### T3.2 Blocked — the source feature must be built first

| # | Wanted | Blocked on |
|---|---|---|
| 34 | `employee.birthday` | A birthday cron reading `user_profiles.date_of_birth`. No such code exists. Also needs a product decision on whether greetings go to the whole org (a 1 000-recipient `sendBulk` per birthday) or to the person only. |
| 35 | `employee.work_anniversary` | Same cron, `date_of_joining`. Same fan-out decision. |
| 36 | `system.announcement` | An `announcements` table + HR authoring endpoints + its own migration. Nothing exists. This is the largest of the blocked items and deserves its own plan. |
| 37 | `employee.document_expiry` (visa/passport/ID, 30 days) | Partly covered by #30 where the document module holds an `expires_on`. A *compliance*-typed subset with a 30-day horizon needs the document type catalog to mark which types are identity documents. |

---

## X. Authoring checklist for `notification_catalog.js`

When the file is written, each entry must satisfy the eight load-time invariants in the plan's
§B.5.1. The four that catch real mistakes:

1. **`email` in `channels` ⇔ `email_owner === null`.** Every `email_owner` value in this document
   (`task_outbox`, `document_outbox`, `payroll_dispatch`, `payroll_reminders`) means *the engine
   does not email this*. Test T-N3 enforces it.
2. **Every `{{var}}` declared in `vars`.** Test T-N2.
3. **No value-bearing word in `push_body` or `push_data_keys`.** Test T-N4 scans for
   `amount|net|gross|salary|reason|ctc`. Note that `leave.rejected` has `rejection_reason` in
   `message` and in `vars` — that is fine; the test only looks at the push surfaces.
4. **`category`** must be one of `leave`, `attendance`, `payroll`, `task`, `document`, `shift`,
   `employee`, `system` — the migration's CHECK set. Test T-N6.

### Event count by tier

| Tier | Buildable | Blocked | Total in brief |
|---|---|---|---|
| 1 | 18 | 0 | 18 |
| 2 | 9 | 3 | 12 |
| 3 | 6 | 4 | 10 |
| **Total** | **33** | **7** | **40** |

33 events ship across Phases 3–5. The 7 blocked ones need domain features first and are not
notification work.
