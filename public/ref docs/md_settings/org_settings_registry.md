# Organization Settings Registry

> **PURPOSE:** This document is the single source of truth for every **organization-level decision** baked into the system so far (Leave, Attendance, Organization modules). Each entry is a knob whose *value is a business/culture choice*, not a technical one. It exists so we can later build a dedicated **Org Settings** feature that surfaces all of these in one place. Read it as "the list of switches an org admin should be able to see and set."

> **AI INSTRUCTION — READ BEFORE EDITING:** When you build or modify any feature that introduces a new organization-level decision (any value an org can configure that changes system behavior), you **MUST** register it here, in the correct module section, following the **exact field structure** below. Do not invent fields; do not skip fields. Ground every entry in real code — cite the model column and the file that enforces it in `Enforcement Point`. If a setting is configured per-record (per leave type, per policy, per location), say so in `Configuration Level`. Keep numbering continuous across the whole document. If a new module is added, create a new `## <Module> Module` section.
>
> **Required fields per entry (in this order):**
> * **Configuration Level** — where the value is set (Global/Org, Per Leave Type, Per Policy, Per Location, Per Employee, etc.)
> * **Data Type** — Boolean / Integer / Decimal / String Enum / Array / Date Range, with units.
> * **Default Value** — the value applied when the org does not choose (from the model `defaultValue`, or "required — no default", or "null / unset").
> * **Enforcement Point** — the file(s) where the decision actually changes behavior (link them).
> * **Deep Explanation** — what it does mechanically.
> * **Applicable Scenario (Turned ON):** — when an org should enable / raise it and why.
> * **Not-Applicable Scenario (Turned OFF):** — when an org should disable / lower it and why.

---

## Leave Module

### 1. Sandwich Rule (`sandwich_rule_applies`)
* **Configuration Level:** Per Leave Type
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) (adjacency exploit guard) + [leave_calculator.utils.js](src/modules/leave/utils/leave_calculator.utils.js) (charges intervening non-working days)
* **Deep Explanation:** If enabled, any non-working days (weekends or holidays) that fall immediately between two leave days are automatically converted into leave days and deducted from balance. The calculator expands the span across adjacent same-type approved leaves (within the same calendar year), and the application service blocks the "split Friday + Monday to dodge the weekend" exploit by forcing such requests to be unified.
* **Applicable Scenario (Turned ON):** Enable for "Annual Leave" / "Casual Leave" to stop employees from bracketing weekends to stretch vacations without spending quota.
* **Not-Applicable Scenario (Turned OFF):** Disable for "Sick Leave" / medical emergencies — employees can't control when they fall ill, so penalizing a weekend mid-illness is unfair.

### 2. Document Upload Threshold (`requires_document_threshold`)
* **Configuration Level:** Per Leave Type
* **Data Type:** Integer (Days)
* **Default Value:** `0` (no document ever required)
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) → `_assertDocumentRequirement` (with anti-smurfing across contiguous same-type leaves)
* **Deep Explanation:** Maximum contiguous same-type absence allowed before the system mandates a `document_url`. The check merges calendar-adjacent same-type requests, so splitting one long absence into sub-threshold chunks cannot dodge the requirement. Exceeding the threshold without a document yields a 400 `DOCUMENT_REQUIRED`.
* **Applicable Scenario (Turned ON):** Set to `3`/`4` for "Sick Leave" to force a medical certificate for prolonged absences.
* **Not-Applicable Scenario (Turned OFF):** Set to `0` for "Casual"/"Earned" leave where no proof is expected regardless of duration.

### 3. Accrual Type (`accrual_type`)
* **Configuration Level:** Per Policy Entitlement
* **Data Type:** String Enum (`upfront` | `monthly`)
* **Default Value:** required — no default (must be chosen when the entitlement is created)
* **Enforcement Point:** [leave_accrual.service.js](src/modules/leave/services/leave_accrual.service.js) + [leave_assignment.service.js](src/modules/leave/services/leave_assignment.service.js)
* **Deep Explanation:** Determines how quota is credited. `upfront` drops the entire prorated annual quota into `current_balance` at assignment / Jan 1. `monthly` distributes it across 12 months, requiring the accrual job to deposit the fractional amount each month.
* **Applicable Scenario (Turned ON — Monthly):** Ideal for probationers / new joiners so they earn time off as they work, preventing "take 15 days then resign."
* **Not-Applicable Scenario (Turned OFF — Upfront):** Ideal for tenured staff / standard Annual Leave where employees are trusted to plan the year.

### 4. Max Carry Forward (`max_carry_forward`)
* **Configuration Level:** Per Policy Entitlement
* **Data Type:** Decimal (Days)
* **Default Value:** `0` (nothing carries over)
* **Enforcement Point:** [leave_rollover.service.js](src/modules/leave/services/leave_rollover.service.js) (year-end rollover)
* **Deep Explanation:** At year-end rollover, remaining `current_balance` above `max_carry_forward` is moved to `lapsed_balance` and lost; the allowed amount rolls into the new year.
* **Applicable Scenario (Turned ON):** Set to `5`/`10` for Annual Leave to encourage people to actually take time off instead of hoarding.
* **Not-Applicable Scenario (Turned OFF):** Set to `0` for Sick Leave (usually lapses), or set high/unlimited for Comp-Offs where mandated by labor law.

### 5. Overdraft / Max Negative Balance (`max_negative_balance`)
* **Configuration Level:** Per Policy Entitlement / Per Employee (`employee_leave_configs`)
* **Data Type:** Decimal (Days)
* **Default Value:** `0` (no negative balance allowed)
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) + [leave_calculator.utils.js](src/modules/leave/utils/leave_calculator.utils.js) → `computePaidSplit`
* **Deep Explanation:** Normally a request is blocked once `current_balance` would go below zero. This allows the balance to go negative up to the limit ("borrow against future accrual"). Beyond the limit, the excess is split into Leave Without Pay (LWP) rather than rejected.
* **Applicable Scenario (Turned ON):** Helpful for employees who exhausted leave but have a genuine emergency.
* **Not-Applicable Scenario (Turned OFF):** Keep `0` for strict cultures, or for notice-period employees, to prevent unrecoverable payroll deficits.

### 6. Probation Restriction (`probation_restriction_days`)
* **Configuration Level:** Per Policy Entitlement / Per Employee (`employee_leave_configs`)
* **Data Type:** Integer (Days)
* **Default Value:** `0` (no probation gate)
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) (compares `now - joining_date`)
* **Deep Explanation:** If `daysSinceJoining < probation_restriction_days`, the application API rejects the request. Requires the applicant's `joining_date` to be on file (missing date → hard 400).
* **Applicable Scenario (Turned ON):** Set to `90`/`180` for paid leaves so employees clear probation before consuming benefits.
* **Not-Applicable Scenario (Turned OFF):** Keep `0` for Sick / Unpaid leave that a new joiner may need immediately.

### 7. Paid vs Unpaid Leave Type (`is_paid`)
* **Configuration Level:** Per Leave Type
* **Data Type:** Boolean
* **Default Value:** `true` (paid)
* **Enforcement Point:** [leave_type.model.js](src/modules/leave/models/leave_type.model.js); surfaced in approval/balance flows and to payroll consumers.
* **Deep Explanation:** Marks whether time taken under this type is compensated. Paid types draw down a balance and count as paid days; unpaid types (e.g., LWP, Sabbatical) are recorded as leave but flagged for payroll deduction.
* **Applicable Scenario (Turned ON):** Standard entitlements — Annual, Casual, Sick, Earned.
* **Not-Applicable Scenario (Turned OFF):** "Leave Without Pay", "Sabbatical", or "Unpaid Personal Leave" where the absence is authorized but not compensated.

### 8. Annual Quota (`annual_quota` / `assigned_annual_quota`)
* **Configuration Level:** Per Policy Entitlement (template default) / Per Employee (individual override in `employee_leave_configs`)
* **Data Type:** Decimal (Days)
* **Default Value:** required — no default at the entitlement level (must be set when defining the policy)
* **Enforcement Point:** [leave_assignment.service.js](src/modules/leave/services/leave_assignment.service.js) (seeds balances) + [leave_accrual.service.js](src/modules/leave/services/leave_accrual.service.js)
* **Deep Explanation:** The number of days granted per year for a leave type under a policy. The template value applies to everyone on the policy; the per-employee `assigned_annual_quota` overrides it for individual negotiations (e.g., senior hires with extra leave).
* **Applicable Scenario (Turned ON):** Every quota-bearing leave type needs this (e.g., 12 Casual, 15 Earned, 12 Sick).
* **Not-Applicable Scenario (Turned OFF):** Not meaningful for pure LWP types where days are effectively unlimited/unpaid; keep minimal.

### 9. Gender Eligibility Gate (`allowed_genders`)
* **Configuration Level:** Per Leave Type
* **Data Type:** Array of Strings (gender codes); `null` / `[]` = open to everyone
* **Default Value:** `null` (no gender restriction)
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) → `_assertDemographicEligibility`
* **Deep Explanation:** Restricts who may apply for the type by gender. A gated type requires the applicant's profile to carry a matching gender; a **missing** gender is a hard reject (not a silent allow) so maternity/paternity-style gating cannot be bypassed by an incomplete profile.
* **Applicable Scenario (Turned ON):** "Maternity Leave" (female), "Paternity Leave" (male).
* **Not-Applicable Scenario (Turned OFF):** All general leave types (Annual, Sick, Casual) — leave `null` so everyone qualifies.

### 10. Marital-Status Eligibility Gate (`allowed_marital_statuses`)
* **Configuration Level:** Per Leave Type
* **Data Type:** Array of Strings (marital statuses); `null` / `[]` = open to everyone
* **Default Value:** `null` (no marital restriction)
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) → `_assertDemographicEligibility` (case-insensitive match)
* **Deep Explanation:** Restricts eligibility by marital status; same "missing value = hard reject" rule as the gender gate.
* **Applicable Scenario (Turned ON):** "Marriage Leave" (e.g., allow only `unmarried`/`single` so it's consumed once).
* **Not-Applicable Scenario (Turned OFF):** General leave types — leave `null`.

### 11. Notice-Period Leave Cap (`notice_period_max_days`)
* **Configuration Level:** Per Policy Entitlement / Per Employee (`employee_leave_configs`)
* **Data Type:** Integer (Days); `null` = unrestricted, `0` = fully blocked
* **Default Value:** `null` (no cap)
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) → `_assertNoticePeriodCap` (windowed from `notice_period_started_on`, under balance lock)
* **Deep Explanation:** Bites only while `job_status = notice_period`. Sums this-type leave taken since notice began; if committed + requested exceeds the cap, the request is rejected. `0` blocks the type entirely during notice.
* **Applicable Scenario (Turned ON):** Set `0` for Casual/Earned during notice, or a small `n` to allow limited handover-friendly time off, protecting knowledge transfer.
* **Not-Applicable Scenario (Turned OFF):** Keep `null` for Sick Leave — illness during notice should not be blocked.

### 12. Leave-Type Lifecycle (`is_active`)
* **Configuration Level:** Per Leave Type
* **Data Type:** Boolean
* **Default Value:** `true` (active)
* **Enforcement Point:** [leave_application.service.js](src/modules/leave/services/leave_application.service.js) (rejects applications for retired types)
* **Deep Explanation:** Soft on/off switch for a leave type. A retired (`false`) type can no longer be applied for, but historical balances and requests are preserved (the type is paranoid-soft-deletable separately).
* **Applicable Scenario (Turned ON):** All currently-offered leave types.
* **Not-Applicable Scenario (Turned OFF):** Discontinuing a leave policy (e.g., replacing "Special COVID Leave") without erasing history.

---

## Attendance Module

### 13. Grace Period (`grace_minutes`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Integer (Minutes)
* **Default Value:** `0` (no grace)
* **Enforcement Point:** [attendance_calculation.service.js](src/modules/attendance/services/attendance_calculation.service.js) / [clock.service.js](src/modules/attendance/services/clock.service.js)
* **Deep Explanation:** Allowable lateness before penalization. Clock-in delay `<= grace_minutes` is ignored; beyond it the employee is flagged Late (and may face further late/half-day rules).
* **Applicable Scenario (Turned ON):** `10`/`15` min in traffic-heavy locations, fostering a flexible culture.
* **Not-Applicable Scenario (Turned OFF):** `0` for shift/factory/hospital/support roles needing exact floor coverage.

### 14. Late & Early-Exit Thresholds (`late_threshold_minutes`, `early_exit_threshold_minutes`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Integer (Minutes)
* **Default Value:** `0` for both
* **Enforcement Point:** [attendance_calculation.service.js](src/modules/attendance/services/attendance_calculation.service.js)
* **Deep Explanation:** `late_threshold_minutes` is the point past grace at which lateness becomes a recorded infraction; `early_exit_threshold_minutes` flags leaving before the shift end by more than the allowance.
* **Applicable Scenario (Turned ON):** Time-strict environments (BPO, manufacturing) that track punctuality infractions for payroll/discipline.
* **Not-Applicable Scenario (Turned OFF):** `0` / lax for outcome-based roles where in/out minutes don't matter.

### 15. Half-Day & Full-Day Hour Thresholds (`half_day_min_hours`, `full_day_min_hours`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Decimal (Hours)
* **Default Value:** `4.00` half-day, `8.00` full-day
* **Enforcement Point:** [attendance_calculation.service.js](src/modules/attendance/services/attendance_calculation.service.js)
* **Deep Explanation:** At clock-out, `effective_hours >= full_day_min_hours` → Present; `>= half_day_min_hours` but below full → Half-Day (0.5 LWP/leave); below half → Absent.
* **Applicable Scenario (Turned ON):** Rigid for hourly-wage / strictly-monitored BPO so payroll matches floor time.
* **Not-Applicable Scenario (Turned OFF):** Low/loose thresholds for senior or outcome-based roles.

### 16. Regularization Allowed (`regularization_allowed`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Boolean
* **Default Value:** `true`
* **Enforcement Point:** [regularization.service.js](src/modules/attendance/services/regularization.service.js)
* **Deep Explanation:** Master switch for whether employees can retroactively correct attendance at all. When off, the regularization endpoints reject requests regardless of window.
* **Applicable Scenario (Turned ON):** Most orgs — people forget to punch and need a correction path.
* **Not-Applicable Scenario (Turned OFF):** Fully device-automated / biometric-only sites where all attendance is machine-captured and manual edits are disallowed.

### 17. Regularization Window (`regularization_window_days`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Integer (Days)
* **Default Value:** `7`
* **Enforcement Point:** [regularization.service.js](src/modules/attendance/services/regularization.service.js)
* **Deep Explanation:** How far back a correction may be requested. `current_date - target_date > window` → blocked. Works together with #16 (must be allowed at all first).
* **Applicable Scenario (Turned ON):** `3`/`7` days to force prompt timesheet fixes within the pay cycle.
* **Not-Applicable Scenario (Turned OFF):** A large value if HR prefers to handle corrections manually at month-end.

### 18. Overtime Configuration (`overtime_enabled`, `overtime_min_minutes`, `overtime_requires_approval`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Boolean, Integer (Minutes), Boolean
* **Default Value:** `overtime_enabled=false`, `overtime_min_minutes=30`, `overtime_requires_approval=true`
* **Enforcement Point:** [overtime.service.js](src/modules/attendance/services/overtime.service.js) + [attendance_overtime.model.js](src/modules/attendance/models/attendance_overtime.model.js)
* **Deep Explanation:** `overtime_enabled` turns OT tracking on. `overtime_min_minutes` is the minimum extra time past shift end that counts as OT (filters trivial overruns). `overtime_requires_approval` decides whether OT is auto-credited or held `pending` for manager approval.
* **Applicable Scenario (Turned ON):** Hourly/shift workforces where extra hours are paid or bankable; keep approval ON to control cost.
* **Not-Applicable Scenario (Turned OFF):** Salaried/exempt staff where overtime is not compensated — leave `overtime_enabled=false`.

### 19. Auto Clock-Out (`auto_clock_out_enabled`, `auto_clock_out_after_hours`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Boolean, Decimal (Hours)
* **Default Value:** `auto_clock_out_enabled=false`, `auto_clock_out_after_hours=12.00`
* **Enforcement Point:** [clock.service.js](src/modules/attendance/services/clock.service.js) (paired with a scheduled job)
* **Deep Explanation:** When on, a session left open beyond `auto_clock_out_after_hours` is force-closed so a forgotten punch doesn't record an absurd duration.
* **Applicable Scenario (Turned ON):** Field/remote staff who frequently forget to clock out; caps runaway sessions.
* **Not-Applicable Scenario (Turned OFF):** Sites where genuine long shifts / overnight coverage occur and auto-close would truncate real time.

### 20. Auto-Detect Shift (`auto_detect_shift`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [shift_resolver.utils.js](src/modules/attendance/utils/shift_resolver.utils.js) / [clock.service.js](src/modules/attendance/services/clock.service.js)
* **Deep Explanation:** When on, the system infers the applicable shift from the clock-in time against available shift templates rather than requiring an explicit assignment for that day.
* **Applicable Scenario (Turned ON):** Multi-shift operations where employees rotate and manual daily assignment is impractical.
* **Not-Applicable Scenario (Turned OFF):** Single-shift orgs or where shifts are explicitly rostered — deterministic assignment is safer.

### 21. Missing-Punch Action (`missing_punch_action`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** String Enum (e.g., `flag`, `absent`, `half_day`)
* **Default Value:** `'flag'`
* **Enforcement Point:** [attendance_calculation.service.js](src/modules/attendance/services/attendance_calculation.service.js)
* **Deep Explanation:** How the day is treated when a punch pair is incomplete (clock-in without clock-out or vice versa): `flag` for review, mark `absent`, or dock to `half_day`.
* **Applicable Scenario (Turned ON — strict e.g. `absent`):** Payroll-tight environments where an incomplete record shouldn't silently pass.
* **Not-Applicable Scenario (lenient — `flag`):** Trust-based cultures preferring HR review over automatic penalty.

### 22. Break Limits (`max_break_duration_minutes`, `max_breaks_per_day`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Integer (Minutes), Integer (Count); nullable = unlimited
* **Default Value:** `null` (no limit)
* **Enforcement Point:** [clock.service.js](src/modules/attendance/services/clock.service.js) / [attendance_breaks.repository.js](src/modules/attendance/repositories/attendance_breaks.repository.js)
* **Deep Explanation:** Caps total break minutes and/or number of breaks per day; excess can be flagged or deducted from effective hours.
* **Applicable Scenario (Turned ON):** Contact centers / production lines with defined break allowances.
* **Not-Applicable Scenario (Turned OFF):** Leave `null` for knowledge-work roles where breaks aren't policed.

### 23. Comp-Off on Holiday Work (`comp_off_on_holiday_work`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [comp_off.service.js](src/modules/attendance/services/comp_off.service.js)
* **Deep Explanation:** When on, working on a holiday/weekly-off automatically earns a compensatory-off credit (subject to the Comp-Off Policy in #26).
* **Applicable Scenario (Turned ON):** Orgs that ask staff to work holidays and compensate with time off instead of pay.
* **Not-Applicable Scenario (Turned OFF):** Orgs that pay overtime for holiday work, or never schedule holiday work.

### 24. Late-Penalty Rules (`late_count_half_day_threshold`, `consecutive_late_penalty_days`)
* **Configuration Level:** Per Attendance Policy
* **Data Type:** Integer (Count / Days); nullable = no penalty
* **Default Value:** `null` (disabled)
* **Enforcement Point:** [attendance_calculation.service.js](src/modules/attendance/services/attendance_calculation.service.js)
* **Deep Explanation:** `late_count_half_day_threshold` = number of "late" marks in a period that collapse into a half-day deduction. `consecutive_late_penalty_days` = consecutive late days that trigger a penalty. Both formalize "three strikes" punctuality policies.
* **Applicable Scenario (Turned ON):** Discipline-focused environments needing automatic, consistent late penalties.
* **Not-Applicable Scenario (Turned OFF):** Keep `null` for flexible cultures that handle tardiness via conversation, not deduction.

### 25. Weekly-Off Rules (`days_of_week` + targeting)
* **Configuration Level:** Per Weekly-Off Rule (org-scoped, targeted by department/location/employment-type/job-status/shift/user, resolved by `priority`)
* **Data Type:** Array of Integers (0=Sun … 6=Sat) + target arrays
* **Default Value:** no rule = **no weekly off** (every day is a working day until a rule is defined)
* **Enforcement Point:** [weekly_off.service.js](src/modules/attendance/services/weekly_off.service.js) + [attendance_weekly_off_rules.repository.js](src/modules/attendance/repositories/attendance_weekly_off_rules.repository.js); **also consumed by Leave** in [leave_calculator.utils.js](src/modules/leave/utils/leave_calculator.utils.js) so both engines agree on "working day."
* **Deep Explanation:** Defines which weekdays are non-working, with targeting so different groups can have different weekends. Highest-`priority` matching rule wins. Because Leave reuses this engine, changing weekends here changes leave-day math too.
* **Applicable Scenario (Turned ON):** Almost every org (e.g., Sat+Sun off; alternate-Saturday patterns via rules/rotation). Use targeting for location-specific weekends (e.g., Middle-East Fri/Sat).
* **Not-Applicable Scenario (Turned OFF):** 24/7 continuous operations that manage rest days purely via rotating shifts rather than fixed weekly offs.

### 26. Comp-Off Policy (`min_hours_for_half_day`, `min_hours_for_full_day`, `multiplier`, `validity_days`, `requires_approval`, `max_accumulation`)
* **Configuration Level:** Per Comp-Off Policy (org-scoped, targeted, `priority`-ordered)
* **Data Type:** Decimal (Hours), Decimal (Hours), Decimal (multiplier), Integer (Days), Boolean, Integer (Count)
* **Default Value:** `multiplier=1.00`, `requires_approval=true`, others null/unset
* **Enforcement Point:** [comp_off_policy.service.js](src/modules/attendance/services/comp_off_policy.service.js) + [comp_off.service.js](src/modules/attendance/services/comp_off.service.js)
* **Deep Explanation:** Governs how comp-offs are earned and spent: hours needed to earn a half/full comp-off, an earning `multiplier` (e.g., 2× on national holidays), `validity_days` before a comp-off expires, whether earning needs approval, and `max_accumulation` to cap the banked total.
* **Applicable Scenario (Turned ON):** Any org that grants comp-offs (see #23). Short `validity_days` forces timely consumption; `max_accumulation` caps liability.
* **Not-Applicable Scenario (Turned OFF):** Orgs that don't offer comp-offs at all — no policy needed.

### 27. Shift Templates (`type`, `start_time`/`end_time`, `timezone`, `is_overnight`)
* **Configuration Level:** Per Shift Template (org-scoped, optionally bound to a policy)
* **Data Type:** String Enum (`fixed`/`flexible`/`split`/`night`/`rotational`), Time, String (IANA tz), Boolean
* **Default Value:** `type='fixed'`, `timezone='Asia/Kolkata'`, `is_overnight=false`; times unset until defined
* **Enforcement Point:** [shift.service.js](src/modules/attendance/services/shift.service.js) + [shift_resolver.utils.js](src/modules/attendance/utils/shift_resolver.utils.js)
* **Deep Explanation:** Defines **when** a day is worked — start/end, whether it crosses midnight (`is_overnight`), and the timezone those times are read in. It deliberately does **not** define how the day is *judged*: that is entirely settings 14–16 on the attendance policy (`grace_minutes`, `late_threshold_minutes`, `full_day_min_hours`, `half_day_min_hours`, `early_exit_threshold_minutes`). Migration 00046 removed `min_hours`, core-hour and split-window times, and the early/late buffers, which duplicated or pre-empted that split and were never read by the engine. `type` values `split` and `flexible` now carry no distinguishing field and are descriptive labels only.
* **Applicable Scenario (Turned ON):** Any org with defined working hours; multiple templates for day/night teams.
* **Not-Applicable Scenario (Turned OFF):** Purely deliverable-based teams with no time contract may keep a single permissive `flexible` template.

### 28. Holiday Calendar (`attendance_holidays` + targeting)
* **Configuration Level:** Per Holiday (org-scoped, targeted by department/location/employment-type/job-status and `included_users`/`excluded_users`)
* **Data Type:** Date + type (`public`/…) + target/inclusion/exclusion arrays
* **Default Value:** no holidays until defined
* **Enforcement Point:** [holiday.service.js](src/modules/attendance/services/holiday.service.js); **also consumed by Leave** in [leave_calculator.utils.js](src/modules/leave/utils/leave_calculator.utils.js) (holidays are non-working days and are not deducted from leave unless the sandwich rule applies).
* **Deep Explanation:** The org's holiday list. Targeting supports region/festival-specific holidays (e.g., a state holiday only for that location) via department/location targeting and per-user include/exclude.
* **Applicable Scenario (Turned ON):** Every org — mandatory national holidays plus optional/regional ones through targeting.
* **Not-Applicable Scenario (Turned OFF):** N/A globally; individual regional holidays are simply not created for locations they don't apply to.

### 29. Payroll Lock Periods (`attendance_lock_periods`)
* **Configuration Level:** Global / Organizational
* **Data Type:** Date Range (start_date – end_date)
* **Default Value:** none (no locks)
* **Enforcement Point:** [lock.service.js](src/modules/attendance/services/lock.service.js) (throws `403 DATE_LOCKED` on mutations of locked dates)
* **Deep Explanation:** A manual freeze over a historical date range. While active, any API mutating attendance/regularizations/overtime for those dates is blocked, so late edits can't corrupt a finalized payroll run.
* **Applicable Scenario (Turned ON):** Lock the prior month on payroll-run day so finance computes payouts on stable data.
* **Not-Applicable Scenario (Turned OFF):** Keep the current, ongoing month unlocked so employees can clock and submit corrections.

---

## Organization Module

### 30. Location Geofencing (`geofence_radius_meters`)
* **Configuration Level:** Per Location (`organization_locations`)
* **Data Type:** Integer (Meters) + `latitude`/`longitude`
* **Default Value:** `100` meters (coordinates null until set)
* **Enforcement Point:** [organization_locations.model.js](src/modules/organization/models/organization_locations.model.js); consumed by attendance clock-in geo validation in [clock.service.js](src/modules/attendance/services/clock.service.js).
* **Deep Explanation:** Defines the allowed radius around a location's coordinates within which mobile/web clock-in is accepted. A punch outside the radius can be rejected or flagged. Radius `0`/coordinates unset effectively disables geo-restriction for that location.
* **Applicable Scenario (Turned ON):** On-site/office attendance where physical presence must be proven; smaller radius for tighter control.
* **Not-Applicable Scenario (Turned OFF):** Remote/WFH or field roles — leave coordinates unset (or a large radius) so location doesn't block clock-in.

### 31. Location Timezone (`timezone`)
* **Configuration Level:** Per Location (`organization_locations`) — also per Shift Template (#27)
* **Data Type:** String (IANA tz, e.g., `Asia/Kolkata`)
* **Default Value:** `'Asia/Kolkata'`
* **Enforcement Point:** [organization_locations.model.js](src/modules/organization/models/organization_locations.model.js); attendance time math in [clock.service.js](src/modules/attendance/services/clock.service.js) / [attendance_calculation.service.js](src/modules/attendance/services/attendance_calculation.service.js).
* **Deep Explanation:** The timezone against which a location's shift times, lateness, and day boundaries are computed. Wrong timezone shifts "what counts as late / which calendar day" for that office.
* **Applicable Scenario (Turned ON):** Multi-region orgs — set each office to its local tz so attendance is judged in local time.
* **Not-Applicable Scenario (Turned OFF):** Single-timezone orgs — the default is sufficient.

### 32. Reporting Hierarchy & Approval Chain (`user_reporting_mappings`)
* **Configuration Level:** Per Employee (active mapping in `user_reporting_mappings`); org-wide as a structure
* **Data Type:** Relationship (`reporting_to_id`, `reporting_role`, `mapping_relation` enum)
* **Default Value:** none — if no active manager mapping exists, approvals **escalate to the HR queue**; a self/circular mapping escalates to **admin**.
* **Enforcement Point:** [approval_chain.utils.js](src/modules/leave/utils/approval_chain.utils.js) (routes leave approvals) + [hierarchy_access.utils.js](src/common/utilities/hierarchy_access.utils.js) (data scoping for managers). See also [[manager-panel-authz-backbone]].
* **Deep Explanation:** The single-manager reporting graph that drives (a) who approves an employee's leave and (b) which employees a manager can see/act on. Only the active mapping's `reporting_to_id` is authoritative (never the denormalized `reporting_person`). No mapping → HR-escalation fallback.
* **Applicable Scenario (Turned ON):** Every org with managers — define each employee's reporting manager so approvals route correctly and manager scoping works.
* **Not-Applicable Scenario (Turned OFF):** Flat orgs / owner-run teams — leave employees unmapped and all approvals land in the HR/admin queue by design.

### 33. Department–Location Structure & Auto-Reporting (`organization_departments.head_of_department_id`)
* **Configuration Level:** Per Department (`organization_departments`)
* **Data Type:** Relationships (`location_id`, `head_of_department_id`) + `is_active`
* **Default Value:** `head_of_department_id` null; departments are **flat** (no `parent_id` — no nesting)
* **Enforcement Point:** [invitation.service.js](src/modules/organization/services/invitation.service.js) (on invite, an `employee` joining a department with a head is auto-bound to report to that head) + [organization_departments.model.js](src/modules/organization/models/organization_departments.model.js).
* **Deep Explanation:** Departments belong to locations and may name a head. When a new **employee** is invited into a department that has a head, their `reporting_person` is auto-set to the head (a convenience that seeds the reporting chain). Departments are intentionally flat today.
* **Applicable Scenario (Turned ON):** Orgs that want department heads to automatically become the default approver for their department's new hires.
* **Not-Applicable Scenario (Turned OFF):** Orgs that assign reporting managers explicitly and prefer no auto-binding — leave `head_of_department_id` unset.

### 34. Role Invitation Policy (`role_invitation_policies` + role `priority`)
* **Configuration Level:** Global / Organizational (matrix of inviter-role → invitee-role) + role priority ladder
* **Data Type:** Policy rows (allowed pairs) + Integer role `priority`
* **Deep Explanation guard values:** an inviter cannot invite into a role of **higher priority** than their own, and the pair must be permitted by the policy matrix.
* **Default Value:** governed by seeded `role_invitation_policies`; priority guard always applied.
* **Enforcement Point:** [invitation.service.js](src/modules/organization/services/invitation.service.js) + `checkInvitationPolicy` in [organization.repository.js](src/modules/organization/repositories/organization.repository.js) + [role_invitation_policies.model.js](src/modules/auth/models/role_invitation_policies.model.js).
* **Deep Explanation:** Governs who may onboard whom. Two gates: (1) the configurable policy matrix of allowed inviter→invitee role pairs, and (2) a hard priority rule preventing privilege escalation (you can't mint someone above your own rank). The same guards apply to revoking/resending invitations.
* **Applicable Scenario (Turned ON):** Delegated onboarding — e.g., allow Managers to invite Employees but not HR/Admins; let HR invite Managers/Employees.
* **Not-Applicable Scenario (Turned OFF):** Tightly-centralized orgs can restrict the matrix so only Admin/HR can invite anyone, effectively disabling manager-initiated invites.

---

## Payroll Module

> All six knobs below live on the **`payroll_settings` singleton** (exactly one active row per org, lazily created by `getOrCreate`). They are `hr`-only to read/write (Payroll is tenant-plane, `admin`/`super-admin` excluded) and every change is written to the append-only `payroll_audit_logs` old→new.

### 35. Payroll Cycle & Calendar (`payroll_cycle`, `period_start_day`, `attendance_cutoff_day`, `pay_day`, `pay_day_in_next_month`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** String Enum (`monthly`), Integer (day-of-month 1–31), Integer (day-of-month 1–31), Integer (day-of-month 1–31), Boolean
* **Default Value:** `payroll_cycle='monthly'`, `period_start_day=1`, `attendance_cutoff_day=25`, `pay_day=1`, `pay_day_in_next_month=true`
* **Enforcement Point:** [payroll_settings.model.js](src/modules/payroll/models/payroll_settings.model.js) (column defaults) + [payroll_settings.service.js](src/modules/payroll/services/payroll_settings.service.js) (`getOrCreate`/`update`); consumed by later phases (period generation & payslip runs) — Phase 1 stores and validates them.
* **Deep Explanation:** Defines the shape of a pay period. `period_start_day` is the calendar day a cycle opens; `attendance_cutoff_day` is the last day attendance is counted toward that run; `pay_day` is the disbursement day; `pay_day_in_next_month` says whether that pay day falls in the month **after** the worked period (arrears) rather than the same month.
* **Applicable Scenario (Turned ON):** Set `attendance_cutoff_day=25`, `pay_day=1`, `pay_day_in_next_month=true` for the common Indian pattern — cut attendance on the 25th and pay on the 1st of the following month so finance has time to process.
* **Not-Applicable Scenario (Turned OFF):** Set `pay_day_in_next_month=false` for same-month payroll (cutoff and pay day both inside the worked month) used by orgs that pay current-month on the last working day.

### 36. Payroll Currency (`currency`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** String (ISO-4217 3-letter code)
* **Default Value:** `'INR'`
* **Enforcement Point:** [payroll_settings.model.js](src/modules/payroll/models/payroll_settings.model.js) + [payroll_settings.service.js](src/modules/payroll/services/payroll_settings.service.js)
* **Deep Explanation:** The single currency all salary structures, CTC figures, and future payslips are denominated in. Money is stored as integer paise/cents internally; this code labels those minor units for display and reporting.
* **Applicable Scenario (Turned ON):** Set to the org's payout currency (`INR`, `USD`, `AED`, …) so all compensation figures render and reconcile in one unit.
* **Not-Applicable Scenario (Turned OFF):** Not a toggle — every org has exactly one payroll currency; the default `INR` is used until changed.

### 37. Financial Year Start Month (`financial_year_start_month`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** Integer (month 1–12)
* **Default Value:** `4` (April — the Indian FY)
* **Enforcement Point:** [payroll_settings.model.js](src/modules/payroll/models/payroll_settings.model.js) + [payroll_settings.service.js](src/modules/payroll/services/payroll_settings.service.js)
* **Deep Explanation:** The calendar month the financial year begins on. It anchors annual CTC proration, YTD accumulators, and tax-year boundaries for downstream payroll phases; setting it wrong shifts every "this-year-so-far" computation.
* **Applicable Scenario (Turned ON):** `4` for India (Apr–Mar), `1` for calendar-year jurisdictions (US/EU), `7` for orgs on a Jul–Jun year.
* **Not-Applicable Scenario (Turned OFF):** Not a toggle — always set to the jurisdiction's statutory FY start; the default is April.

### 38. Manager Team-Compensation Visibility (`manager_can_view_team_compensation`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `true`
* **Enforcement Point:** [payroll_access.utils.js](src/modules/payroll/utils/payroll_access.utils.js) → `decideAuthority` (`canViewCompensation`) + [payroll_manager.controller.js](src/modules/payroll/controllers/payroll_manager.controller.js) (`assertCanViewTarget` / team summary) + [employee_salary_structure.service.js](src/modules/payroll/services/employee_salary_structure.service.js) → `getTeamStructures`.
* **Deep Explanation:** Controls whether a **manager** can see the actual pay figures of their direct reports. When OFF, the team endpoint returns headcount and aggregate totals **only** — never a per-head CTC (EC-25) — and per-employee compensation views raise `403 COMPENSATION_VIEW_DISABLED`. Global HR (`scope: 'global'`) always sees figures regardless of this switch; it gates managers only. It never exposes bank-account data (managers are hard-denied that in all cases).
* **Applicable Scenario (Turned ON):** Orgs where managers own comp decisions and need to see report salaries to plan raises and budgets.
* **Not-Applicable Scenario (Turned OFF):** Confidentiality-first orgs that keep pay private to HR — managers can still propose changes and see team headcount, but not individual numbers.

### 39. Separate-Checker Enforcement (`payroll_require_separate_checker`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [employee_salary_structure.service.js](src/modules/payroll/services/employee_salary_structure.service.js) (`createOrRevise` land-approved decision + `approve` EC-30 `SEPARATE_CHECKER_REQUIRED`) + [payroll_settings.service.js](src/modules/payroll/services/payroll_settings.service.js) (`update` guards enabling it with `< 2` active HR → `409 INSUFFICIENT_CHECKERS`).
* **Deep Explanation:** Enforces four-eyes maker-checker on compensation. When OFF, an HR user's assignment lands **approved** immediately (HR is its own checker). When ON, every structure — even one created by HR — lands **proposed** and must be approved by a **different** HR user; approving your own proposal is rejected with `403 SEPARATE_CHECKER_REQUIRED`. Turning it on is itself guarded: the org must have at least two active HR checkers or the update fails, so the control can never deadlock all payroll changes.
* **Applicable Scenario (Turned ON):** Audit-/SOX-sensitive orgs that require a second authorized person to approve any pay change for segregation of duties.
* **Not-Applicable Scenario (Turned OFF):** Small teams or single-HR orgs where insisting on a second approver would stall every change — HR assignments self-approve.

### 40. Manager Direct Compensation Authority (`manager_direct_compensation_authority`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [payroll_access.utils.js](src/modules/payroll/utils/payroll_access.utils.js) → `decideAuthority` (`canApproveFor` for a manager over an in-scope report) + [employee_salary_structure.service.js](src/modules/payroll/services/employee_salary_structure.service.js) (`createOrRevise` runs the full in-transaction approval when a manager holds authority).
* **Deep Explanation:** Elevates a **manager** from proposer to approver for their own direct reports. When OFF (default), a manager's submission always lands **proposed** and waits in the HR checker queue (D-13 maker-checker). When ON, a manager's change to an in-scope report is applied and approved atomically in one request — subject still to the reports-only scope guard and, if #39 is also ON, to the separate-checker rule. It only affects a manager's own reports; it never widens which employees a manager can reach.
* **Applicable Scenario (Turned ON):** Flat or highly-delegated orgs that trust managers to finalize pay for their teams without an HR gate.
* **Not-Applicable Scenario (Turned OFF):** Governance-first orgs that want HR to remain the sole approver — managers propose, HR disposes.

---

## Notes & cross-module dependencies (for the future Settings UI)

> **Registry correction (DEF-S3, Settings Phase 1, 2026-10-09):** this cross-module block sits between #40 and #41 inside the Payroll section, which can read as if #41–#46 were not payroll settings. They **are** payroll settings — each is backed by the `payroll_settings` singleton (see the `Configuration Level` line of #41 onward). The block's position is kept to avoid a large reflow of the document; treat #41–#46 as Payroll regardless of this heading.

* **Leave ⇄ Attendance coupling:** The leave day-calculator reuses the attendance **Weekly-Off Rules (#25)**, **Holiday Calendar (#28)**, and calendar exceptions to decide what a "working day" is. A Settings UI must surface these as attendance-owned but flag their leave impact. **Comp-Off (#23/#26)** also bridges both modules (earned in attendance, redeemed as a leave type with code `CO`).
* **Geofencing/timezone (#30/#31)** live on Organization locations but are enforced by Attendance — present them under whichever module the admin expects, but store once on the location.
* **Targeting model:** Weekly-off rules, holidays, and comp-off policies share a common targeting shape (department/location/employment-type/job-status/user arrays + `priority`). A shared "audience picker" in the Settings UI can serve all three.
* **Precedence to preserve:** Leave application checks run in a fixed order — retired-type → half-day → demographic (#9/#10) → probation (#6) → notice cap (#11) → document (#2). Any settings UI copy should reflect this so admins understand which rejection an employee hits first.
* **Payroll authority coupling:** The payroll maker-checker chain reuses the **Reporting Hierarchy (#32)** to decide which employees a manager may propose/approve for; a manager with no active mapping has no reports and therefore no compensation reach. Payroll settings **#38/#39/#40** together define the maker-checker posture and are cross-referenced by [[manager-maker-checker-over-reports]] and [[role-planes-tenant-vs-platform]] (`hr` is the top tenant approver; `admin`/`super-admin` get no payroll data access).

### 41. Loss of Pay (LOP) Basis (`lop_basis`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** String Enum (`calendar_days`, `standard_working_days`, `fixed_30`)
* **Default Value:** `calendar_days`
* **Enforcement Point:** [payroll_calculation.service.js](src/modules/payroll/services/payroll_calculation.service.js)
* **Deep Explanation:** Determines the denominator used to calculate the per-day rate for prorations and LOP deductions. `calendar_days` uses the exact number of days in the month (28-31); `standard_working_days` uses only the working days (calendar days minus weekly offs and holidays); `fixed_30` uses 30 regardless of the month length.
* **Applicable Scenario (Turned ON):** Choose based on org policy.
* **Not-Applicable Scenario (Turned OFF):** N/A, always required.

### 42. Net Pay Rounding (`net_pay_rounding`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** String Enum (`none`, `nearest_rupee`)
* **Default Value:** `none`
* **Enforcement Point:** [payroll_calculation.service.js](src/modules/payroll/services/payroll_calculation.service.js)
* **Deep Explanation:** If set to `nearest_rupee`, the final `net_earnings` is rounded to the nearest integer, and a `ROUNDING_ADJUSTMENT` component is injected to balance the equation (Gross - Deductions = Net).
* **Applicable Scenario (Turned ON):** For clean bank transfers without decimal values.
* **Not-Applicable Scenario (Turned OFF):** When exact minor-unit precision is desired.

### 43. In-Progress Attendance Treatment (`in_progress_treatment`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** String Enum (`present`, `absent`, `flag_error`)
* **Default Value:** `present`
* **Enforcement Point:** [payroll_attendance_aggregator.service.js](src/modules/payroll/services/payroll_attendance_aggregator.service.js)
* **Deep Explanation:** Determines how an attendance record stuck in `in_progress` (missing clock-out) is treated during payroll aggregation.
* **Applicable Scenario (Turned ON):** Set to `flag_error` in strict organizations where missing punches must be resolved before payroll.
* **Not-Applicable Scenario (Turned OFF):** Set to `present` or `absent` to avoid blocking the payroll run.

### 44. Overtime Payable Configuration (`overtime_payable`, `overtime_rate_multiplier`, `overtime_hourly_basis`, `standard_working_hours_per_day`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean, Decimal (multiplier), String Enum (`basic`, `gross`), Decimal (hours)
* **Default Value:** `overtime_payable=false`, `overtime_rate_multiplier=2.00`, `overtime_hourly_basis='basic'`, `standard_working_hours_per_day=8.00`
* **Enforcement Point:** [payroll_calculation.service.js](src/modules/payroll/services/payroll_calculation.service.js)
* **Deep Explanation:** When `overtime_payable` is true, approved OT hours are monetized. The hourly rate is derived from either the BASIC or GROSS component, divided by `standard_working_hours_per_day` and calendar days, and multiplied by `overtime_rate_multiplier`.
* **Applicable Scenario (Turned ON):** Hourly/shift workforces where OT is paid.
* **Not-Applicable Scenario (Turned OFF):** Salaried environments where extra hours do not yield extra pay.

### 45. Negative Net Pay Handling (`negative_net_handling`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** String Enum (`clamp_and_carry_forward`, `block`)
* **Default Value:** `clamp_and_carry_forward`
* **Enforcement Point:** [payroll_calculation.service.js](src/modules/payroll/services/payroll_calculation.service.js) (net-pay resolution, EC-14) — writes `carry_forward_out` this period and `carry_forward_in` next period on the run item.
* **Deep Explanation:** Decides what a run does when an employee's deductions (loan EMIs, recoveries, statutory withholding) exceed their earnings for the period. `clamp_and_carry_forward` sets `net_pay` to 0, records the un-recovered shortfall in `carry_forward_out`, and recovers it against the next period's net (`carry_forward_in`) via a `CARRY_FORWARD_RECOVERY` line — so the employee is never paid a negative amount and the org never silently writes off the shortfall. `block` instead fails that employee's line as an error item, leaving the run for HR to fix before approval. When it clamps, the engine records `NEGATIVE_NET_CLAMPED` on the item's `calculation_warnings`.
* **Applicable Scenario (Turned ON):** Keep the default `clamp_and_carry_forward` for normal operations — a heavy-EMI or high-recovery month self-corrects over subsequent periods without manual intervention.
* **Not-Applicable Scenario (Turned OFF):** Set `block` in orgs that require every negative-net case to be reviewed and resolved by hand before the run can be approved.

### 46. Loan Governance (`loan_max_amount`, `loan_max_tenure_months`, `loan_max_interest_rate`, `loan_default_interest_rate`, `loan_interest_method`, `loan_max_concurrent_per_employee`)
* **Configuration Level:** Global / Organizational (`payroll_settings` singleton)
* **Data Type:** Decimal (nullable = uncapped), Integer (months), Decimal (% ceiling), Decimal (% default), String Enum (`flat`, `reducing_balance`), Integer (count)
* **Default Value:** `loan_max_amount=null` (no cap), `loan_max_tenure_months=60`, `loan_max_interest_rate=24.00`, `loan_default_interest_rate=0.00`, `loan_interest_method='reducing_balance'`, `loan_max_concurrent_per_employee=1`
* **Enforcement Point:** [employee_loan.service.js](src/modules/payroll/services/employee_loan.service.js) (create-time validation → `LOAN_MAX_AMOUNT_EXCEEDED` / `LOAN_MAX_TENURE_EXCEEDED` / `LOAN_MAX_INTEREST_RATE_EXCEEDED` / `LOAN_MAX_CONCURRENT_EXCEEDED`; applies `loan_interest_method` and `loan_default_interest_rate` when the request omits them) + [loan_schedule.utils.js](src/modules/payroll/utils/loan_schedule.utils.js) (amortization per method).
* **Deep Explanation:** Bounds and defaults for employee salary-advance loans. `loan_max_amount` (NULL = uncapped), `loan_max_tenure_months`, and `loan_max_interest_rate` are hard ceilings rejected at loan creation; `loan_max_concurrent_per_employee` caps how many active loans one employee may carry at once. `loan_default_interest_rate` and `loan_interest_method` fill in a loan request that omits them — `reducing_balance` accrues interest on the outstanding principal, `flat` on the original principal for the whole tenure.
* **Applicable Scenario (Turned ON):** Tighten the ceilings and keep `loan_max_concurrent_per_employee=1` in orgs that offer conservative, one-at-a-time advances.
* **Not-Applicable Scenario (Turned OFF):** Leave `loan_max_amount=null` and raise the other caps for a liberal advance policy; the interest method still defaults every loan consistently.

---

> Registry entries **#47–#50** below govern statutory withholding. The PF/ESI/PT-enablement and income-tax rates/ceilings live on a **second `hr`-only singleton, `statutory_configs`** (one live row per org, lazily created by `getOrCreate`, frozen into each run's `settings_snapshot.statutory` at CREATE — D-23/D-26); the declaration-window, regime and rounding knobs live on the `payroll_settings` singleton (§4.11). They are org-configurable decisions and so belong here regardless of which table holds them. All statutory heads default **OFF** so no org withholds anything until it deliberately opts in.

### 47. Provident Fund (`statutory_configs`: `pf_enabled` + PF/EPS/EDLI rates & ceilings)
* **Configuration Level:** Global / Organizational (`statutory_configs` singleton)
* **Data Type:** Boolean (`pf_enabled`, `pf_restrict_to_ceiling`, `pf_lop_reduces_ceiling`, `pf_include_overtime`, `eps_enabled`, `edli_enabled`) + Decimal % (`pf_employee_rate`, `pf_employer_rate`, `eps_rate`, `pf_admin_charge_rate`, `edli_rate`) + Decimal amount (`pf_wage_ceiling`, `eps_wage_ceiling`, `edli_wage_ceiling`, `pf_admin_charge_min`)
* **Default Value:** `pf_enabled=false`; `pf_employee_rate=12.00`, `pf_employer_rate=12.00`, `pf_wage_ceiling=15000.00`, `pf_restrict_to_ceiling=true`, `pf_lop_reduces_ceiling=true`, `pf_include_overtime=false`, `eps_enabled=true`, `eps_rate=8.33`, `eps_wage_ceiling=15000.00`, `pf_admin_charge_rate=0.5000`, `pf_admin_charge_min=0.00`, `edli_enabled=true`, `edli_rate=0.5000`, `edli_wage_ceiling=15000.00`
* **Enforcement Point:** [statutory_pf.utils.js](src/modules/payroll/utils/statutory_pf.utils.js) (`computePf`) driven by [statutory_config.model.js](src/modules/payroll/models/statutory_config.model.js); orchestrated by [payroll_statutory_aggregator.service.js](src/modules/payroll/services/payroll_statutory_aggregator.service.js). Rates/ceilings are edited via [statutory_config.service.js](src/modules/payroll/services/statutory_config.service.js) (`CHECK` every rate 0–100, ceilings > 0, `eps_rate <= pf_employer_rate`).
* **Deep Explanation:** The PF wage is `min(pf_applicable_earnings, pf_wage_ceiling)` when `pf_restrict_to_ceiling` is on (full wages when off); the ceiling is scaled by `payable_days` first when `pf_lop_reduces_ceiling` is on; overtime is excluded from the PF wage unless `pf_include_overtime` (D-25). The employee contributes `pf_employee_rate`; the employer's `pf_employer_rate` is split so `eps_rate` (of `eps_wage_ceiling`, applied always) is carved **out of** the employer share into EPS and the remainder is the PF-employer amount. EDLI and the admin charge are additional employer CTC costs, never employee deductions.
* **Applicable Scenario (Turned ON):** Set `pf_enabled=true` for EPFO-covered establishments; keep the 12%/₹15,000 statutory defaults unless the org runs a voluntary higher-wage or unrestricted-ceiling scheme.
* **Not-Applicable Scenario (Turned OFF):** Leave `pf_enabled=false` for orgs outside EPFO coverage — no PF/EPS/EDLI lines are computed and the run item's PF heads stay 0.

### 48. Employees' State Insurance (`statutory_configs`: `esi_enabled`, rates, threshold)
* **Configuration Level:** Global / Organizational (`statutory_configs` singleton)
* **Data Type:** Boolean (`esi_enabled`, `esi_include_overtime`) + Decimal % (`esi_employee_rate`, `esi_employer_rate`) + Decimal amount (`esi_wage_threshold`)
* **Default Value:** `esi_enabled=false`, `esi_employee_rate=0.75`, `esi_employer_rate=3.25`, `esi_wage_threshold=21000.00`, `esi_include_overtime=true`
* **Enforcement Point:** [statutory_esi.utils.js](src/modules/payroll/utils/statutory_esi.utils.js) (`computeEsi`) driven by [statutory_config.model.js](src/modules/payroll/models/statutory_config.model.js); orchestrated by [payroll_statutory_aggregator.service.js](src/modules/payroll/services/payroll_statutory_aggregator.service.js); rates edited via [statutory_config.service.js](src/modules/payroll/services/statutory_config.service.js).
* **Deep Explanation:** ESI covers an employee only while their monthly ESI wage is at or below `esi_wage_threshold`. Overtime **is** wages for the ESI contribution when `esi_include_overtime` is on, but it is excluded from the *eligibility* test so an OT spike cannot flip coverage mid-period (§5.4, D-25). While covered, the employee pays `esi_employee_rate` and the employer pays `esi_employer_rate`; the item's `esi_covered` flag records the outcome and drives the preview roll-up. ESI eligibility is frozen for the whole contribution period per the six-month rule.
* **Applicable Scenario (Turned ON):** Set `esi_enabled=true` for orgs with employees drawing ≤ ₹21,000/month; the statutory 0.75%/3.25% split applies.
* **Not-Applicable Scenario (Turned OFF):** Leave `esi_enabled=false` for fully-above-threshold or non-covered workforces — no ESI is computed and `esi_covered` stays false.

### 49. Professional Tax (`statutory_configs.pt_enabled` + `payroll_settings.pt_state_source` + `professional_tax_slabs`)
* **Configuration Level:** Global / Organizational — `pt_enabled` on the `statutory_configs` singleton, `pt_state_source` on the `payroll_settings` singleton, slab rows in the `professional_tax_slabs` table
* **Data Type:** Boolean (`pt_enabled`), String Enum (`pt_state_source`: `work_location`, `profile_state`), plus per-state slab rows (`from_amount`/`to_amount`/`monthly_amount`/`gender`/`month_overrides`)
* **Default Value:** `pt_enabled=false`, `pt_state_source='work_location'`; **no default slabs ship** — a state's slabs must be entered before PT can resolve
* **Enforcement Point:** [statutory_pt.utils.js](src/modules/payroll/utils/statutory_pt.utils.js) (`resolvePtState` → `computePt`, half-open `[from, to)` band selection) via [payroll_statutory_aggregator.service.js](src/modules/payroll/services/payroll_statutory_aggregator.service.js); slabs managed and overlap/gap-validated in [statutory_config.service.js](src/modules/payroll/services/statutory_config.service.js).
* **Deep Explanation:** Professional Tax is a state levy, so the first decision is *which state governs the employee*. `pt_state_source` fixes that chain: `work_location` tries the work-location's state then the profile state; `profile_state` reverses the order. `computePt` then selects the half-open monthly-gross band for that state (with any `month_overrides`, e.g. Maharashtra-February, and `gender` variants) to get the fixed monthly PT amount. If the state or a matching slab cannot be resolved, the engine emits `PT_STATE_UNRESOLVED` / `PT_SLAB_UNRESOLVED` on the item rather than guessing, and the preview surfaces the unresolved count for HR to fix.
* **Applicable Scenario (Turned ON):** Set `pt_enabled=true`, choose `pt_state_source` to match the org's payroll policy, and load each operating state's slab set; PT then withholds the correct fixed amount per employee.
* **Not-Applicable Scenario (Turned OFF):** Leave `pt_enabled=false` for orgs in states with no professional tax — no PT is withheld regardless of slab data.

### 50. Income Tax / TDS (`statutory_configs`: `income_tax_enabled`, `tds_no_pan_*`, `cess_rate`; `payroll_settings`: declaration window, proof deadline, regime, rounding)
* **Configuration Level:** Global / Organizational — enablement and rates on the `statutory_configs` singleton; declaration/regime/rounding knobs on the `payroll_settings` singleton
* **Data Type:** Boolean (`income_tax_enabled`, `tds_no_pan_enforced`, `allow_employee_regime_switch`) + Decimal % (`tds_no_pan_rate`, `cess_rate`) + Integer month/day (`tax_declaration_window_start_month`, `tax_declaration_window_end_month`, `tax_proof_deadline_month`, `tax_proof_deadline_day`) + String Enum (`default_tax_regime`: `old`/`new`; `tds_monthly_rounding`: `none`/`nearest_rupee`/`nearest_ten`)
* **Default Value:** `income_tax_enabled=false`, `tds_no_pan_rate=20.00`, `tds_no_pan_enforced=true`, `cess_rate=4.00`; `tax_declaration_window_start_month=4`, `tax_declaration_window_end_month=1`, `tax_proof_deadline_month=2`, `tax_proof_deadline_day=28`, `default_tax_regime='new'`, `allow_employee_regime_switch=true`, `tds_monthly_rounding='nearest_rupee'`
* **Enforcement Point:** [tds_monthly.utils.js](src/modules/payroll/utils/tds_monthly.utils.js) (`computeMonthlyTds` / `roundTds`) and [tax_period.utils.js](src/modules/payroll/utils/tax_period.utils.js) (`isDeclarationWindowOpen` — the wrap-year window test; `proofDeadlineFor`), orchestrated by [payroll_statutory_aggregator.service.js](src/modules/payroll/services/payroll_statutory_aggregator.service.js); regime resolution and the switch gate in [employee_tax.service.js](src/modules/payroll/services/employee_tax.service.js) (`REGIME_SWITCH_NOT_ALLOWED` when `allow_employee_regime_switch` is off). Config edited via [statutory_config.service.js](src/modules/payroll/services/statutory_config.service.js) / [payroll_settings.service.js](src/modules/payroll/services/payroll_settings.service.js).
* **Deep Explanation:** With `income_tax_enabled=true` the engine estimates the annual liability under the employee's regime, spreads it over the remaining months, adds `cess_rate`, and withholds a monthly TDS (§5.6). `default_tax_regime` is the regime an employee gets before any explicit election; `allow_employee_regime_switch` decides whether an employee may change their own regime (HR always can). When an employee has no PAN and `tds_no_pan_enforced` is on, TDS is floored at `tds_no_pan_rate` per §206AA (`PAN_MISSING_206AA_APPLIED`). The declaration window (`start`/`end` FY months, which may wrap the year end) and the proof deadline (`month`/`day`, frozen onto a declaration at first submission) bound when investment declarations and proofs are accepted. `tds_monthly_rounding` is an operational rounding of the monthly figure (to paise, ₹1, or ₹10) applied last — not the annual §288B rounding.
* **Applicable Scenario (Turned ON):** Set `income_tax_enabled=true`, pick `default_tax_regime`, and set the declaration window and proof deadline to the org's payroll calendar; monthly TDS is then computed and withheld per employee.
* **Not-Applicable Scenario (Turned OFF):** Leave `income_tax_enabled=false` for orgs that do not run TDS through this system — `income_tax_amount` stays 0 and no declaration workflow is required.

### 51. Reimbursement Approval Levels (`reimbursement_approval_levels`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Integer (1–2, mirrored by the `payroll_settings_reimbursement_check` DB CHECK)
* **Default Value:** `2`
* **Enforcement Point:** [reimbursement_claim.service.js](src/modules/payroll/services/reimbursement_claim.service.js) (chain length at submission) via [approval_chain_resolver.utils.js](src/modules/payroll/utils/approval_chain_resolver.utils.js); accepted by [payroll_hr.validator.js](src/modules/payroll/validators/payroll_hr.validator.js) `updateSettingsSchema` and declared on [payroll_settings.model.js](src/modules/payroll/models/payroll_settings.model.js).
* **Deep Explanation:** Decides how many approvals a reimbursement claim needs before it is payable. `2` is the maker–checker chain of D-13 — the employee's manager proposes and HR approves. `1` collapses the chain to a single HR approval, for orgs where managers hold no spend authority. The level count is resolved when the claim is submitted and frozen onto the claim's approval chain, so changing this setting never re-shapes a claim that is already in flight.
* **Applicable Scenario (Turned ON / set to 2):** Keep `2` where line managers own their team's spend and HR is the financial control. This is the default and the D-13 Tier B shape.
* **Not-Applicable Scenario (set to 1):** Set `1` for small orgs with no manager layer, or where HR approves all spend directly — the manager proposal step is skipped entirely.

### 52. Reimbursement Payout Lookahead (`reimbursement_payout_lookahead_months`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Integer (0–6, mirrored by the `payroll_settings_reimbursement_check` DB CHECK)
* **Default Value:** `2`
* **Enforcement Point:** [reimbursement_approval.service.js](src/modules/payroll/services/reimbursement_approval.service.js) (payout-period window) feeding [payroll_payout_aggregator.service.js](src/modules/payroll/services/payroll_payout_aggregator.service.js); accepted by `updateSettingsSchema` and declared on [payroll_settings.model.js](src/modules/payroll/models/payroll_settings.model.js).
* **Deep Explanation:** How many months ahead of the current period an approved claim may be scheduled for payout. A claim approved after the attendance cut-off cannot ride the run that is already closing, so it needs a forward window. `2` lets HR target this month or the next two. `0` forces every approved claim into the current period only, which is stricter but will reject a claim approved late in the cycle.
* **Applicable Scenario (Turned ON / 1–6):** Keep `2` (or widen it) for orgs that batch reimbursements and need to park an approved claim against a future run.
* **Not-Applicable Scenario (set to 0):** Set `0` where every approved claim must settle in the period it was approved in, with no forward scheduling.

### 53. Benefit Deductions Enabled (`benefit_deductions_enabled`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false` — ships OFF deliberately, on the `overtime_payable` / `pf_enabled` precedent
* **Enforcement Point:** Frozen into `payroll_runs.settings_snapshot` at run CREATE by [payroll_run.service.js](src/modules/payroll/services/payroll_run.service.js), then read from that snapshot by `calculate()`; the aggregator skips the benefit query entirely when false ([payroll_payout_aggregator.service.js](src/modules/payroll/services/payroll_payout_aggregator.service.js)). Preview surfaces the figure regardless as a pre-flight warning.
* **Deep Explanation:** Gates whether an enrolled employee's benefit-plan contribution is actually charged on a run. Benefit charges hit every enrolled employee's month automatically, so the org opts in rather than discovering the deduction after the fact. Because the value is read from the run's **frozen** `settings_snapshot` and not from live settings, opting in after a run was created never adds deductions to that run — the change takes effect from the next run created.
* **Applicable Scenario (Turned ON):** Set `true` once benefit plans and enrolments are configured and the org intends employee premiums to be withheld through payroll. Employee shares become deduction lines and employer shares become employer-contribution lines on the CTC.
* **Not-Applicable Scenario (Turned OFF):** Leave `false` where benefits are tracked for enrolment and cost reporting only, or are settled outside payroll — no benefit deduction or contribution lines are emitted and `benefit_employee_amount` / `benefit_employer_amount` stay 0.

### 54. Payslip Auto-Publish and Auto-Email (`payslip_auto_publish`, `payslip_auto_email`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean × 2
* **Default Value:** `payslip_auto_publish=true`, `payslip_auto_email=false`
* **Enforcement Point:** Read at run approval by [payslip.service.js](src/modules/payroll/services/payslip.service.js) (invoked inside `approve()`'s transaction in [payroll_run.service.js](src/modules/payroll/services/payroll_run.service.js)); visibility is enforced on every employee/manager read by [payslip_read.service.js](src/modules/payroll/services/payslip_read.service.js); the email queue is drained by [payslip_dispatch.service.js](src/modules/payroll/services/payslip_dispatch.service.js) and [payslip_email_dispatch.cron.js](src/cron-jobs/payslip_email_dispatch.cron.js).
* **Deep Explanation:** `payslip_auto_publish` controls **visibility, not existence** (D-44). The frozen `payslips` snapshot row is always written at approval — it is the immutable record, not a publication choice — and this flag only sets `visible_to_employee`. `true` reproduces the pre-Phase-6 behaviour exactly, where an approved run is immediately visible to employees; `false` holds payslips back until HR releases them explicitly. `payslip_auto_email` only **enqueues** a notification per payslip (`email_status='pending'`); the dispatcher sends it outside any transaction, so enabling it never lengthens or risks an approval. The email carries a deep link and no attachment (D-42), and email failure never affects visibility.
* **Applicable Scenario (Turned ON):** Keep `payslip_auto_publish=true` for the normal flow where approval is the release decision. Set `payslip_auto_email=true` once the org is ready for outbound mail to every employee on every run and its SES sending limits accommodate the headcount.
* **Not-Applicable Scenario (Turned OFF):** Set `payslip_auto_publish=false` where finance approves runs ahead of an announced pay date and payslips must be released separately. Leave `payslip_auto_email=false` where employees are told through another channel — the payslip is still available in-app, and the dispatcher simply drains an empty queue.

### 55. Full & Final Settlement Policy (`fnf_leave_encashment_enabled`, `fnf_encashment_leave_type_codes`, `fnf_encashment_rate_basis`, `fnf_encashment_divisor`, `fnf_encashment_max_days`, `fnf_encashment_component_id`, `fnf_notice_recovery_enabled`, `fnf_notice_recovery_rate_basis`, `fnf_default_notice_period_days`, `fnf_notice_recovery_component_id`, `fnf_loan_recovery_mode`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Booleans × 2, ENUMs, JSONB code list, nullable INT/UUID; `fnf_loan_recovery_mode` ENUM(`recover_via_payroll`,`settled_externally`,`manual`)
* **Default Value:** all OFF — `fnf_leave_encashment_enabled=false`, `fnf_notice_recovery_enabled=false`, `fnf_encashment_leave_type_codes='[]'`, `fnf_encashment_rate_basis='basic'`, `fnf_encashment_divisor='fixed_30'`, `fnf_default_notice_period_days=30`, `fnf_loan_recovery_mode='manual'`; component ids and `fnf_encashment_max_days` NULL
* **Enforcement Point:** Read by [fnf_settlement.service.js](src/modules/payroll/services/fnf_settlement.service.js) at `prepare-settlement` (#201) and by [encashment.service.js](src/modules/payroll/services/encashment.service.js); rate arithmetic is pure in [encashment_rate.utils.js](src/modules/payroll/utils/encashment_rate.utils.js) and [notice_recovery.utils.js](src/modules/payroll/utils/notice_recovery.utils.js). Loan recovery delegates to `employee_loan.service.foreclose()`.
* **Deep Explanation:** Governs how an exit is settled: which leave type codes are encashable and at what per-day rate/divisor, whether notice shortfall is recovered and on what basis, the default notice period stamped on a new exit record, and whether an active loan is recovered via payroll, settled externally, or left for manual handling. The three component-id columns must reference an **active earning** `salary_components` row in the same org (validated in `payroll_settings.service.update`, not by FK, since the catalog row can be soft-deleted). Encashment amounts are **frozen** at creation, so a later settings change cannot restate an approved encashment.
* **Applicable Scenario (Turned ON):** Enable once the org has configured its encashment/notice earning components and its encashable leave codes, and intends F&F runs to compute leave encashment, notice recovery and loan foreclosure automatically.
* **Not-Applicable Scenario (Turned OFF):** Leave OFF where exits are settled outside payroll — an F&F run then produces no encashment/notice lines and reports outstanding loan balances for HR to settle deliberately (`manual`).

### 56. Payroll Automation & Attachment Retention (`payroll_auto_draft_enabled`, `payroll_auto_draft_day`, `payroll_cutoff_reminder_enabled`, `payroll_payday_reminder_enabled`, `tax_declaration_reminder_enabled`, `payroll_attachment_retention_days`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Booleans × 4, INT × 2
* **Default Value:** all reminder/draft flags `false`; `payroll_auto_draft_day=1`; `payroll_attachment_retention_days=2555` (7 years)
* **Enforcement Point:** Read per-org by [payroll_automation.service.js](src/modules/payroll/services/payroll_automation.service.js), driven by the four Phase-7 crons ([payroll_calendar_reminders.cron.js](src/cron-jobs/payroll_calendar_reminders.cron.js), [payroll_auto_draft.cron.js](src/cron-jobs/payroll_auto_draft.cron.js), [payroll_run_sweeper.cron.js](src/cron-jobs/payroll_run_sweeper.cron.js), [payroll_attachment_sweeper.cron.js](src/cron-jobs/payroll_attachment_sweeper.cron.js)) and the HR manual triggers #212–#215. Reminder idempotency uses four `last_*_reminder_on` DATEONLY watermarks claimed by a conditional UPDATE.
* **Deep Explanation:** Controls whether the scheduled jobs act for the org: auto-drafting the due regular run on `payroll_auto_draft_day` (never today's month — the most recent period whose end precedes today), and sending the cut-off, pay-day, declaration-window and proof-deadline reminders. The run-sweeper (stale `calculating` runs) and attachment-sweeper always run — only their retention window (`payroll_attachment_retention_days`) is configurable; `form16_part_a` attachments are excluded from the sweep unconditionally for statutory retention. A same-day double-fire (multi-instance deploy) sends each reminder exactly once via the watermark claim.
* **Applicable Scenario (Turned ON):** Enable reminders/auto-draft once the org wants the month-end calendar surfaced by email and drafts created without manual action; keep the retention window at the statutory default unless a different policy is required.
* **Not-Applicable Scenario (Turned OFF):** Leave OFF where HR drives the calendar manually — no reminders are sent and no drafts are auto-created; the sweepers still keep the system tidy but touch no tenant-visible payroll state.

### 57. Comp-Off Encashment Policy (`compoff_encashment_enabled`, `compoff_encashment_rate_basis`, `compoff_encashment_divisor`, `compoff_encashment_max_days_per_fy`, `compoff_encashment_component_id`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean, ENUMs, nullable INT/UUID
* **Default Value:** `compoff_encashment_enabled=false`; `compoff_encashment_rate_basis='basic'`; `compoff_encashment_divisor='fixed_30'`; `compoff_encashment_max_days_per_fy` and `compoff_encashment_component_id` NULL
* **Enforcement Point:** Read by [encashment.service.js](src/modules/payroll/services/encashment.service.js) for the `comp_off` source adapter; the CO wallet debit writes `attendance_comp_offs.status='encashed'` and the matching `leave_balances` row via the attendance/leave **repositories** (D-58 — no live attendance/leave service code is touched).
* **Deep Explanation:** Governs whether an unused comp-off can be paid out instead of taken, at what per-day rate/divisor, and the annual cap. Encashing a comp-off debits **both** the `attendance_comp_offs` row (`approved → encashed` under a row lock) and the CO leave wallet, so the day can never be spent as leave and paid as cash (EC-27). Comp-offs are grouped by `YEAR(earned_date)` and each `(user, type, year)` wallet is debited by its own count. The component id must reference an active earning component in the org.
* **Applicable Scenario (Turned ON):** Enable once the org configures its comp-off encashment earning component and intends unused comp-offs to be cash-settled (HR-direct Tier C, or manager-proposed Tier B).
* **Not-Applicable Scenario (Turned OFF):** Leave OFF where comp-offs may only be taken as leave — encashment creation returns `ENCASHMENT_DISABLED` and no `attendance_comp_offs` row is ever flipped to `encashed`.


---

## Document Module

### 58. Manager Team-Document Visibility (`manager_can_view_team_documents`)
* **Configuration Level:** Organizational (`document_settings` singleton, one row per org)
* **Data Type:** Boolean
* **Default Value:** `true`
* **Enforcement Point:** Evaluated inside [document_type_rules.utils.js](src/modules/document/utils/document_type_rules.utils.js) `resolveEffectivePolicy` (AND-ed with `document_types.manager_can_view`) and [document_authority.utils.js](src/modules/document/utils/document_authority.utils.js) `resolveDocumentAuthority` (manager view/list/recommend actions).
* **Deep Explanation:** Sets the org-wide visibility floor for the manager plane. `true` alone is not sufficient — a manager still only sees a document type when its own `manager_can_view` flag is `true` (narrower always wins). When `false`, every manager read (`GET /manager/team/documents`, `/manager/employees/:userId/documents`, `/manager/documents/:id`, `/manager/documents/:id/view-url`) returns an empty list or `404 DOCUMENT_NOT_FOUND` — never a `403` — so the switch feels like "no documents exist for you" rather than a permission wall.
* **Applicable Scenario (Turned ON):** Orgs where line managers are expected to review team documents (verify onboarding paperwork, endorse experience letters).
* **Not-Applicable Scenario (Turned OFF):** Small or privacy-first orgs where only HR should see documents; manager routes remain reachable but return empty results so the frontend does not have to know the difference.

### 59. Manager Direct Document Authority (`manager_direct_document_authority`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** Read at recommendation time by [document_review.service.js](src/modules/document/services/document_review.service.js) `recommend`; the settings guard rail is in [document_settings.service.js](src/modules/document/services/document_settings.service.js) `update`.
* **Deep Explanation:** When `true`, a manager's `POST /manager/documents/:id/recommend` applies the decision immediately (`available` / `expired` / `rejected`) instead of merely surfacing a Tier-B recommendation to HR. The audit row records `proposed_by = approved_by = manager_id`. **This setting cannot be `true` while `document_require_separate_checker` (#60) is `true`** — the pair would make every manager action a self-approval; `PUT /settings` refuses the combination with `409 SETTINGS_CONFLICT`.
* **Applicable Scenario (Turned ON):** Orgs where line managers already carry HR-adjacent responsibilities and the extra hop through HR is friction, not a control.
* **Not-Applicable Scenario (Turned OFF):** Default. Every manager action is a recommendation; HR remains the sole decider.

### 60. Document Separate Checker Required (`document_require_separate_checker`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [document_review.service.js](src/modules/document/services/document_review.service.js) `verify` / `reject` (`SELF_APPROVAL_NOT_ALLOWED` if `approved_by === proposed_by`); enabling checked in [document_settings.service.js](src/modules/document/services/document_settings.service.js) `update` (requires ≥ 2 active `hr` users → `409 INSUFFICIENT_CHECKERS`; incompatible with #59).
* **Deep Explanation:** When `true`, an HR user who proposed or recommended a document cannot approve it — a second HR user must. The guard runs inside the verify/reject transaction, on the loaded row's `proposed_by`, so it holds even when the proposal was recorded via the manager plane and then routed to HR.
* **Applicable Scenario (Turned ON):** Regulated or audited orgs where 4-eyes review of onboarding paperwork or exit documents is required.
* **Not-Applicable Scenario (Turned OFF):** Default. HR self-approve without a second HR user; suitable for small teams.

### 61. Document View-URL TTL (`document_view_url_ttl_seconds`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, seconds
* **Default Value:** `300` (5 minutes)
* **Enforcement Point:** Passed to [aws-s3.provider.js](src/infrastructure/aws-s3/aws-s3.provider.js) `getViewUrl({ ttlSeconds })` by [document_read.service.js](src/modules/document/services/document_read.service.js); the provider's `clampTtl` (`VIEW_TTL_CAP_SECONDS = 900`) is the final line; the DB `CHECK` constraint (`30..900`) is the third.
* **Deep Explanation:** Every `GET …/documents/:id/view-url` mints a fresh signed URL of this TTL. Shorter TTLs reduce the window of a shared URL doing damage; the hard cap `900` in the provider means no application bug or direct DB edit can mint a 24-hour URL (D-20).
* **Applicable Scenario:** Lower for confidential documents, higher when the frontend needs to inline a viewer that keeps the URL for a session.
* **Range:** `30 .. 900` seconds. Values outside the range are refused with `422 SETTING_OUT_OF_RANGE`.

### 62. Document Upload-URL TTL (`document_upload_url_ttl_seconds`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, seconds
* **Default Value:** `600` (10 minutes)
* **Enforcement Point:** Passed to [aws-s3.provider.js](src/infrastructure/aws-s3/aws-s3.provider.js) `getUploadUrl({ ttlSeconds })` by [document_upload.service.js](src/modules/document/services/document_upload.service.js); provider hard cap `UPLOAD_TTL_CAP_SECONDS = 3600`; DB `CHECK` constraint `30..3600`.
* **Deep Explanation:** Also defines the boundary for `isStaleUpload`: a `pending_upload` older than this TTL is reap-able by the next issue/replace attempt on the same slot. Setting it too short can strand slow uploaders; too long delays reap of abandoned attempts.
* **Range:** `30 .. 3600` seconds.

### 63. Document Max File Size (`document_max_file_size_bytes`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, bytes
* **Default Value:** `10485760` (10 MB)
* **Enforcement Point:** [document_type_rules.utils.js](src/modules/document/utils/document_type_rules.utils.js) `resolveEffectivePolicy` (`min(type.max_file_size_bytes, settings.document_max_file_size_bytes, ORG_CEILING_BYTES)`); Joi schema on issue upload; pinned into the signed `Content-Length`; re-verified by HeadObject at confirm; DB `CHECK` constraint `1024..26214400`.
* **Deep Explanation:** The org-wide ceiling. A type may only *narrow* it (a type with `max_file_size_bytes = 5242880` still caps at 5 MB); it can never widen it above the org value or the platform ceiling of 25 MB.
* **Range:** `1024 .. 26214400`.

### 64. Document Scan Required (`document_scan_required`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [document_settings.service.js](src/modules/document/services/document_settings.service.js) `update` refuses to enable it in Phase 1 with `409 SCAN_PROVIDER_NOT_CONFIGURED`.
* **Deep Explanation:** Column and setting exist so Phase 4 can wire an antivirus scanner without a second migration. In Phase 1 no scanner is configured; enabling this would strand every document in `pending_verification`. The setting is registered now (rather than added later) so an install has a stable schema across phases.

### 65. Document Retention Days (`document_retention_days`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, days
* **Default Value:** `2555` (~ 7 years)
* **Enforcement Point:** **Now consumed by Phase 4 F-7.** Read by [document_automation.service.js](src/modules/document/services/document_automation.service.js) `_sweepRetention` as the **org-wide retention floor**: a soft-deleted employee document is hard-deleted only when its `deleted_at` is older than `max(this, per-type retention_days)` (`resolveRetentionDays`, R-26 — the larger of the two wins). The `document_sweeper` cron (03:30 IST) and the manual `#91 POST /hr/jobs/document-sweeper/run` trigger perform the purge; it was write-only in Phases 1–3.
* **Deep Explanation:** Aligns with the statutory retention floor for payroll-adjacent records in most Indian orgs. Statutory catalog types (`is_statutory = true`) are excluded from the purge twice — by the repository predicate and by an in-loop re-assertion (R-24) — whatever this value is. Because purge is irreversible, the effective retention is always the *longer* of the org floor and the per-type window.
* **Range:** `>= 30` days; DB `CHECK` enforces the lower bound.

### 66. Employee Delete Verified Documents (`employee_can_delete_verified_documents`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** [document_type_rules.utils.js](src/modules/document/utils/document_type_rules.utils.js) `resolveEffectivePolicy` (`employeeCanDelete = type.employee_can_delete && this && !type.is_statutory`); enforced by [document_upload.service.js](src/modules/document/services/document_upload.service.js) `deleteDocument`.
* **Deep Explanation:** The subject's ability to delete a *verified* document is the AND of three flags: the type allows self-delete, the org allows self-delete of verified documents, and the type is not statutory. Statutory always wins: an Aadhaar card is never subject-deletable once verified, whatever this setting says.
* **Applicable Scenario (Turned ON):** Orgs where employees own their non-statutory documents fully (optional certificates).
* **Not-Applicable Scenario (Turned OFF):** Default. Employees can delete `pending_upload` / `pending_verification` rows always; verified rows only HR can delete.

### 67. Document Default Verification Required (`document_default_verification_required`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `true`
* **Enforcement Point:** [document_type_rules.utils.js](src/modules/document/utils/document_type_rules.utils.js) `resolveEffectivePolicy` (`requiresVerification = type.requires_verification || this`); used at confirm to decide `pending_verification` vs `available`.
* **Deep Explanation:** The org-wide floor for "does a fresh upload need HR verification?". A type can require verification regardless; this setting narrows the answer to "no" only when both the type and the org say so. Does not retroactively affect existing types.
* **Applicable Scenario (Turned ON):** Default. Every custom type inherits verify-required until HR opts it out.
* **Not-Applicable Scenario (Turned OFF):** Orgs willing to accept employee-submitted documents at face value for most types; HR keeps per-type opt-in.

### 68. Document Acknowledgement Due Days (`document_acknowledgement_due_days`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, days
* **Default Value:** `7`
* **Enforcement Point:** Read at publish by [document_org.service.js](src/modules/document/services/document_org.service.js) `publish` (`row.acknowledgement_due_days ?? publishSettings.document_acknowledgement_due_days`) and at recipient sync by [document_recipient.service.js](src/modules/document/services/document_recipient.service.js) `syncRecipients` (same fallback). Both reads happen inside the write's own transaction via `settingsService.getOrCreate(orgId, t)` (C-30). Joi bounds are in [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`min(1).max(365)`).
* **Deep Explanation:** The org-wide default acknowledgement window, used only as a fallback: a document that requires acknowledgement but carries a `null` per-document `acknowledgement_due_days` gets `due_on = publishedAt + this` (R-87). A per-document value always wins over the org default. A document that does not require acknowledgement keeps `due_on = null` no matter what this is set to. The fallback is applied at publish and at sync only; changing this setting **never** rewrites `due_on` on existing recipient rows (R-86) — a deadline that shifts because a setting changed is not a deadline.
* **Applicable Scenario:** Orgs that want every acknowledgement-bearing document to carry a chase-able deadline without setting a per-document window each time.
* **Range:** `1 .. 365` days. Values outside the range are refused with `422 SETTING_OUT_OF_RANGE`.

### 69. Document Acknowledgement Blocking (`document_acknowledgement_blocking`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** Read-side label only, in [document_org_read.service.js](src/modules/document/services/document_org_read.service.js) `_blockingSetting` (line 368: `settings.document_acknowledgement_blocking === true`), surfaced as `acknowledgement.is_blocking` on the self readouts (#70/#71).
* **Deep Explanation:** When `true`, an outstanding acknowledgement is flagged to the frontend as *blocking* (`is_blocking: true`) so the UI can foreground it. It is deliberately a **label, not a gate** (R-93): this setting does not by itself deny any action anywhere in the backend — it changes how a pending obligation is presented, not what the employee is permitted to do. Any hard gating of downstream actions on unacknowledged documents is out of scope for this module and is left to the consuming surface.
* **Applicable Scenario (Turned ON):** Orgs that want unacknowledged mandatory policies to be visually escalated in the employee portal.
* **Not-Applicable Scenario (Turned OFF):** Default. Pending acknowledgements are shown as normal obligations without escalation.

### 70. Document Signature Provider (`document_signature_provider`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** String enum
* **Default Value:** `internal_typed`
* **Enforcement Point:** Read at sign time by [document_acknowledgement.service.js](src/modules/document/services/document_acknowledgement.service.js) `sign` (line 282: `settings.document_signature_provider || INTERNAL_PROVIDER`); availability is checked by `isProviderAvailable` in [document_compliance.utils.js](src/modules/document/utils/document_compliance.utils.js), and an unavailable provider throws `503 SIGNATURE_PROVIDER_UNAVAILABLE` (`{ provider }`) **before any state change**. The enum is validated in [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) against `SIGNATURE_PROVIDERS`.
* **Deep Explanation:** Selects the e-signature backend used by `POST /me/hr-documents/:id/sign`. Only `internal_typed` (server-captured typed name + IP + checksum) is wired in Phase 3. Setting the value to `docusign` or `adobe_sign` is **accepted** at write time so an org can stage a switch ahead of an integration, but every sign call then returns `503 SIGNATURE_PROVIDER_UNAVAILABLE` until that provider ships (D-13). The provider is never taken from the request body (R-90); the request only carries `signer_name`.
* **Applicable Scenario:** Left at `internal_typed` for all orgs today; the external values exist so the schema is stable when a provider integration lands.
* **Enum:** `internal_typed | docusign | adobe_sign`. Values outside the enum are refused with a `400` validation error.

### 71. Document Expiry Reminder Days (`document_expiry_reminder_days`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer array, days-before-expiry
* **Default Value:** `[30, 15, 7]`
* **Enforcement Point:** Structurally bounded in [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`array of integers 0–365, at most 6 entries`), then normalised by [document_settings.service.js](src/modules/document/services/document_settings.service.js) `assertReminderSchedule` (de-duplicated and sorted descending — the canonical stored form). Read by [document_automation.service.js](src/modules/document/services/document_automation.service.js) `_passExpiryReminders` (F-6 N-2) as the **org-wide default** expiry-reminder schedule.
* **Deep Explanation:** The offsets (in days before `expires_on`) at which an employee is reminded that a document is about to expire. A per-type `expiry_reminder_days` overrides this org default for that type (`resolveExpirySchedule`). Reminders are anticipatory and content-addressed (dedupe key `expiry:{documentId}:{bucket}`), so a missed cron day still fires the correct bucket the next day and a re-run never double-sends. An empty array (`[]`) is valid and means the org never sends expiry reminders. Enqueue is additionally gated on `document_notify_expiry` (#73).
* **Applicable Scenario:** Orgs that want a standard "30/15/7 days out" nudge cadence for expiring identity and compliance documents without configuring each type.
* **Range:** at most **6** entries, each `0 .. 365`; `> 6` entries, a non-integer, or an out-of-range value is refused with `422 SETTING_OUT_OF_RANGE`. `[]` is accepted.

### 72. Document Notify HR On Upload (`document_notify_hr_on_upload`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** The enqueue gate `EVENT_SETTING_TOGGLE[document_uploaded]` in [document_notification.service.js](src/modules/document/services/document_notification.service.js); checked at enqueue on the confirm/link-reference path in [document_upload.service.js](src/modules/document/services/document_upload.service.js) (`enqueueDocumentUploaded`, N-1).
* **Deep Explanation:** When `true`, a confirmed employee-document upload enqueues a `document_uploaded` notice addressed to the org's HR role (fan-out to every active HR user at send time). When `false` (default), no row ever enters the outbox for this event — the gate is at enqueue, so a disabled event costs nothing. The upload itself always succeeds regardless of this toggle (the enqueue is contained; a queue failure never fails the upload).
* **Applicable Scenario (Turned ON):** Small orgs that want HR pinged the moment an employee submits any document.
* **Not-Applicable Scenario (Turned OFF):** Default. HR reviews via the verification queue rather than per-upload email.

### 73. Document Notify Expiry (`document_notify_expiry`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** The pass-level gate in [document_automation.service.js](src/modules/document/services/document_automation.service.js) `_passExpiryReminders` and the enqueue gate `EVENT_SETTING_TOGGLE[document_expiring]` in [document_notification.service.js](src/modules/document/services/document_notification.service.js).
* **Deep Explanation:** Master switch for anticipatory expiry reminders (event `document_expiring`), which fire at the offsets in `document_expiry_reminder_days` (#71). When `false` (default), the reminder pass is skipped entirely and no expiry notice is enqueued. Note the **expiry status flip** (`available → expired`, F-4) is independent of this toggle and always persists — only the *reminder* is gated.
* **Applicable Scenario (Turned ON):** Orgs tracking expiring documents (visas, licences, certifications) that want employees nudged before lapse.
* **Not-Applicable Scenario (Turned OFF):** Default. Expiry is still derived on read; employees simply are not emailed.

### 74. Document Notify Pending Acknowledgement (`document_notify_pending_acknowledgement`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** The pass-level gate in [document_automation.service.js](src/modules/document/services/document_automation.service.js) `_passAckReminders` and the enqueue gate `EVENT_SETTING_TOGGLE[acknowledgement_pending]` in [document_notification.service.js](src/modules/document/services/document_notification.service.js).
* **Deep Explanation:** Master switch for pending-acknowledgement reminders (event `acknowledgement_pending`, F-6 N-3). When `true`, a recipient with an outstanding acknowledgement is reminded once per day (capped at the per-entity reminder cap via a same-day watermark) through the acknowledgement window and while overdue; the window is the org's `document_acknowledgement_due_days` (#68). When `false` (default), the pass is skipped so a disabled org never burns a watermark slot.
* **Applicable Scenario (Turned ON):** Orgs publishing mandatory policies that must chase acknowledgements to a deadline.
* **Not-Applicable Scenario (Turned OFF):** Default. Pending acknowledgements are visible in the portal but not emailed.

### 75. Document Notify Request Raised (`document_notify_request_raised`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** The enqueue gate `EVENT_SETTING_TOGGLE[document_request_raised]` in [document_notification.service.js](src/modules/document/services/document_notification.service.js); checked at enqueue in [document_request.service.js](src/modules/document/services/document_request.service.js) (`create` / `createFromChecklist`).
* **Deep Explanation:** When `true`, raising a document request (#80/#81/#93) enqueues a `document_request_raised` notice to the subject employee with a CTA to upload. When `false` (default), the request is still created and visible in the employee's `/me/document-requests`, but no email is sent. The enqueue is contained: a queue failure never loses the request.
* **Applicable Scenario (Turned ON):** Orgs that want employees emailed the moment HR or a manager asks for a document.
* **Not-Applicable Scenario (Turned OFF):** Default. Employees discover requests in-app.

### 76. Document Notify Request Overdue (`document_notify_request_overdue`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean
* **Default Value:** `false`
* **Enforcement Point:** The pass-level gate in [document_automation.service.js](src/modules/document/services/document_automation.service.js) `_passRequestOverdueReminders` and the enqueue gate `EVENT_SETTING_TOGGLE[document_request_overdue]` in [document_notification.service.js](src/modules/document/services/document_notification.service.js).
* **Deep Explanation:** Master switch for overdue-request reminders (event `document_request_overdue`, F-6 N-4). When `true`, an overdue request is reminded once per day (same-day watermark, capped at the reminder cap). The **open → overdue status flip** (reminder pass A) runs unconditionally regardless of this toggle; only the reminder email is gated. The manual `#85 POST /hr/document-requests/:id/remind` is also idempotent per day.
* **Applicable Scenario (Turned ON):** Orgs that actively chase overdue document requests.
* **Not-Applicable Scenario (Turned OFF):** Default. Requests still flip to `overdue` on read and in the list; no email is sent.

### 77. Document Request Default Due Days (`document_request_default_due_days`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, days
* **Default Value:** `7`
* **Enforcement Point:** Read by [document_request.service.js](src/modules/document/services/document_request.service.js) `createFromChecklist` (`resolveDueOn(now, settings.document_request_default_due_days)`); numeric cap enforced in [document_settings.service.js](src/modules/document/services/document_settings.service.js) `assertCap` and by [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`min(1).max(365)`).
* **Deep Explanation:** The default `due_on` offset applied to requests raised in bulk from a checklist (#81), which carry no per-request `due_on`. A single request raised via #80/#93 uses the caller-supplied `due_on` when present and is otherwise left open-ended (no due date). Changing this setting affects only requests created afterwards; it never rewrites the `due_on` of existing requests.
* **Applicable Scenario:** Orgs onboarding new joiners who want every bulk-raised request to carry a consistent, chase-able deadline.
* **Range:** `1 .. 365` days. Values outside the range are refused with `422 SETTING_OUT_OF_RANGE`.

### 78. Document Onboarding Completeness Threshold (`document_onboarding_completeness_threshold`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, percent
* **Default Value:** `100`
* **Enforcement Point:** Read by [document_checklist.service.js](src/modules/document/services/document_checklist.service.js) `_assemble` (`meets_threshold = percent >= threshold`); numeric cap enforced in [document_settings.service.js](src/modules/document/services/document_settings.service.js) `assertCap` and by [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`min(0).max(100)`).
* **Deep Explanation:** The completeness percentage at or above which an employee's required-document checklist is considered "complete" (`completeness.meets_threshold: true`). Completeness is `satisfied / required * 100` over the required-type set (0 required ⇒ 100%). This is a **label** surfaced on the checklist readouts (#86/#96/#98); it does not by itself gate any action. The default of `100` means every required document must be satisfied to count as complete.
* **Applicable Scenario:** Orgs that accept a partially-complete onboarding pack (e.g. 80%) as "good enough" to clear a joiner while chasing the remainder.
* **Range:** `0 .. 100` percent. Values outside the range are refused with `422 SETTING_OUT_OF_RANGE`.

### 79. Document Publish Sync Threshold (`document_publish_sync_threshold`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, recipient count
* **Default Value:** `20000`
* **Enforcement Point:** Read by [document_org.service.js](src/modules/document/services/document_org.service.js) at publish time; numeric cap enforced in [document_settings.service.js](src/modules/document/services/document_settings.service.js) `assertCap` (`SETTINGS_CAPS` `{ min: 100, max: 20000 }`) and by [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`min(100).max(20000)`).
* **Deep Explanation:** The audience-size boundary between **synchronous** and **asynchronous** org-document publish. When a publish resolves an audience **at or below** this threshold, recipients are materialised inline and the endpoint answers `200`. **Above** it, the document is published immediately, the response is `202 Accepted`, and the background *publish materialiser* cron (every 5 minutes, plus the startup catch-up) fills the roster in batches from the document's **frozen** targeting snapshot. The maximum (`20000`) is the code ceiling `ORG_PUBLISH_SYNC_LIMIT`: an org may set a **lower** threshold to opt more publishes into the async path, but never a higher one.
* **Applicable Scenario:** A large org lowers the threshold (e.g. to `2000`) so that company-wide policy publishes never block the HTTP request while thousands of recipient rows are created.
* **⚠️ Response-class note:** Lowering this value changes the response class of the org-document **publish** endpoint (#47) from `200` to `202` for audiences that now exceed the threshold. Clients must treat `202` as success and poll the materialisation-progress endpoint (#127) rather than assuming the roster is complete on return.
* **Range:** `100 .. 20000`. Values outside the range are refused with `422 SETTING_OUT_OF_RANGE`.

### 80. Document Offboarding Archive Mode (`document_offboarding_archive_mode`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** String enum (`STRING(20)`)
* **Default Value:** `'archive'`
* **Enforcement Point:** Read by [document_offboarding.service.js](src/modules/document/services/document_offboarding.service.js) on employee exit; enum validated against `OFFBOARDING_ARCHIVE_MODES` in [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) and by the DB CHECK constraint.
* **Deep Explanation:** Controls what happens to a departing employee's documents when their membership is removed. `archive` transitions eligible (non-statutory) documents to `archived`; `retain` leaves them in place. **Waiving open acknowledgements and cancelling open requests happen in both modes** — those are compliance hygiene, not archival policy, and always run.
* **Applicable Scenario:** An org under a retention obligation sets `retain` so exit does not change document status, while still closing out the departing user's open acknowledgements and requests.
* **Allowed Values:** `archive` | `retain`. Any other value is refused with `422 SETTING_OUT_OF_RANGE`.

### 81. Document Offboarding Exit-Pack Scope (`document_offboarding_exit_pack_scope`)
* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** String enum (`STRING(20)`)
* **Default Value:** `'all'`
* **Enforcement Point:** Read by [document_offboarding.service.js](src/modules/document/services/document_offboarding.service.js) when building an exit pack (#123/#124); enum validated against `EXIT_PACK_SCOPES` in [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) and by the DB CHECK constraint.
* **Deep Explanation:** The default set of documents an exit pack contains — `all` (both planes), `org_issued` (documents the org published to the employee) or `employee_owned` (documents the employee uploaded). This is only the **default**; a specific exit-pack request may override it per call via `?scope=`.
* **Applicable Scenario:** An org that only ever needs to hand a leaver their org-issued statutory documents sets `org_issued` so the default pack omits personal uploads.
* **Allowed Values:** `all` | `org_issued` | `employee_owned`. Any other value is refused with `422 SETTING_OUT_OF_RANGE`.

### 82. Letter Branding Enabled (`letter_branding_enabled`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean (`BOOLEAN NOT NULL`)
* **Default Value:** `true`
* **Enforcement Point:** Read by [document_letter_branding.service.js](src/modules/document/services/document_letter_branding.service.js) and [document_letter_template.service.js](src/modules/document/services/document_letter_template.service.js) on the preview paths (#134/#138); when `false` the letterhead, logo and signature blocks are all suppressed by the branding builder so the letter renders on pre-printed stationery.
* **Deep Explanation:** Controls whether the org's letterhead identity is composited onto generated letters at all. An org that prints its letters on physically pre-printed company stationery turns this off so the rendered PDF carries only the body text, avoiding a duplicated header. Default `true` mirrors the migration backfill so an un-migrated org keeps branding on.
* **Applicable Scenario:** A company with expensive embossed letterhead paper disables branding so the PDF leaves room for the pre-printed header.
* **Allowed Values:** `true` | `false`.
* **Phase 2 correction:** Registered and enforced in Phase 1 but omitted from `MUTABLE_FIELDS` and the settings Joi, so no HR user could actually change it (deviation §1.4(7)). Phase 2 adds it to both, closing the gap — the value now round-trips through the settings `update` endpoint.

### 83. Letter Preview Rate Per Hour (`letter_preview_rate_per_hour`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer (`INTEGER NOT NULL`)
* **Default Value:** `60`
* **Enforcement Point:** Read by [document_letter_branding.service.js](src/modules/document/services/document_letter_branding.service.js) `checkPreviewRate` and reused by [document_letter_template.service.js](src/modules/document/services/document_letter_template.service.js) on #134/#138; a per-org Redis counter (`pdf:preview:{orgId}:{yyyymmddHH}`) is incremented per preview and `429 PREVIEW_RATE_LIMITED` is returned past the cap. The counter fails **open** on a Redis error. A DB CHECK enforces the range.
* **Deep Explanation:** Bounds how many letter previews an org can render per clock hour. A preview is a synchronous, unauthenticated-renderer call, so the cap protects the shared Lambda from a runaway client. The default of 60 is effectively unlimited for a single HR user clicking a button, while still capping abuse.
* **Applicable Scenario:** An org integrating a bulk "preview all templates" screen raises the limit; a locked-down tenant lowers it.
* **Allowed Values:** Integer `1`–`1000`. Any other value is refused with `422 SETTING_OUT_OF_RANGE`.
* **Phase 2 correction:** Registered and enforced in Phase 1 but not HR-mutable (same defect as #82, deviation §1.4(7)). Phase 2 adds it to `MUTABLE_FIELDS`, the settings Joi (`1`–`1000`), and `SETTINGS_CAPS` (`{ min: 1, max: 1000 }`) so the cap can be tuned per org.

### 84. Letter Reference Pattern (`letter_reference_pattern`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** String (`STRING(120) NOT NULL`)
* **Default Value:** `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}`
* **Enforcement Point:** Read by [document_letter.service.js](src/modules/document/services/document_letter.service.js) at issue/reissue to render the per-org reference number after the PDF is rendered and before the number is allocated under `FOR UPDATE`. Validated by `assertPatternTokens` ([letter_reference.utils.js](src/modules/document/utils/letter_reference.utils.js)) **on write** (settings Joi + service re-assert → `422 LETTER_REFERENCE_PATTERN_INVALID`) **and again at issue** (a pattern could predate the validator).
* **Deep Explanation:** Defines the human-facing reference format stamped on every letter row (not printed on the PDF in Phase 2). The pattern may contain only the whitelisted tokens `{ORG_CODE}`, `{TYPE}`, `{FY}`, `{YYYY}`, `{MM}` and exactly one sequence token `{SEQ:0000}` (the `:0000…` sets zero-padding width, 1–6 zeros); `{SEQ}` without a width is not accepted — a width must be given. Any other token, or a missing/duplicated `{SEQ}`, is rejected. `{YYYY}`/`{MM}` are sliced from the caller's `pinnedDate` (no clock read); `{FY}` is the financial year. A per-template `reference_pattern` still overrides this org-wide default (§11.1). **Deviation from plan §26.1:** the column was implemented `NOT NULL` with a hard default rather than nullable-with-fallback, so a blank/`null` pattern is refused at write time instead of silently resolving to a default — the resolved format is always explicit in the row.
* **Applicable Scenario:** An org that files letters by calendar year sets `{ORG_CODE}/{TYPE}/{YYYY}/{SEQ:00000}`; one that wants a flat sequence sets `{ORG_CODE}-LETTER-{SEQ:000000}`.
* **Allowed Values:** A 1–120 char string using only the whitelisted tokens above and exactly one `{SEQ}` token. Blank/`null` and unknown tokens are refused with `422 LETTER_REFERENCE_PATTERN_INVALID`.

### 85. Letter Default Confidential (`letter_default_confidential`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean (`BOOLEAN NOT NULL`)
* **Default Value:** `true`
* **Enforcement Point:** Read by [document_letter.service.js](src/modules/document/services/document_letter.service.js) at issue and **frozen** onto the letter row's `is_confidential` (BR-33); once set it does not track later changes to this setting.
* **Deep Explanation:** Sets the default confidentiality of newly issued letters. Letters commonly carry salary, CTC and exit data, so confidential-by-default is the safe failure mode — an org must consciously opt out. Because the value is frozen at issue, changing this setting never reclassifies letters already issued.
* **Applicable Scenario:** An org that treats routine experience letters as non-sensitive turns this off so those letters are visible under its less-restricted document views.
* **Allowed Values:** `true` | `false`.

### 86. Letter Requires Acknowledgement Default (`letter_requires_acknowledgement_default`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean (`BOOLEAN NULL`)
* **Default Value:** `NULL` (inherit the document type's own default)
* **Enforcement Point:** Read by [document_letter.service.js](src/modules/document/services/document_letter.service.js) at issue and **frozen** onto the letter row's `requires_acknowledgement` (BR-33); when `true`, `acknowledgement_due_days` comes from the org's existing document-acknowledgement default.
* **Deep Explanation:** Controls whether a newly issued letter demands an employee acknowledgement. Off by default because an unnecessary acknowledgement obligation creates overdue rows and reminder emails for every letter an org issues; `NULL` means "defer to the mapped document type's own setting" rather than forcing a value. Frozen at issue, so it never retroactively adds an obligation to existing letters.
* **Applicable Scenario:** An org that requires employees to formally acknowledge appointment and confirmation letters turns this on so those letters raise an acknowledgement task.
* **Allowed Values:** `true` | `false` | unset (`NULL` ⇒ inherit the type default).

> **Registry correction (DEF-S2, Settings Phase 1, 2026-10-09):** entries **#87–#90** appear under this `## Document Module` heading but are all backed by the **`payroll_settings`** singleton (confirmed by each entry's `Configuration Level` line below), not by a document store. A Settings UI must group them with Payroll, not Documents. The headings are left in place to avoid a large reflow; the backing store is authoritative.

### 87. PDF Render Engine (`pdf_render_engine`) — DEPRECATED, inert since 2026-09-30

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Enum (`enum_payroll_settings_pdf_render_engine`: `'pdfkit' | 'html'`, `NOT NULL`)
* **Default Value:** `'pdfkit'` (column default, now meaningless)
* **Enforcement Point:** None. The HTML-only migration (plan `public/md_pdf-generation/2026-09-30_html_only_renderer_migration_plan.md`, D1) removed PDFKit and the per-org switch. [payroll_hr.validator.js](src/modules/payroll/validators/payroll_hr.validator.js) still accepts both values so existing frontends do not break, and [payroll_settings.service.js](src/modules/payroll/services/payroll_settings.service.js) stores them, but no code reads the column. The former `409 PDF_RENDERER_NOT_CONFIGURED` save guard is gone.
* **Deep Explanation:** It used to choose between the in-process PDFKit renderer and the HTML→PDF renderer for payslips, annual statements and Form 16 Part B. Every payroll PDF is now rendered as HTML by the external renderer (`PDF_RENDERER_BASE_URL` / `PDF_RENDERER_API_KEY`), including held payslips, which render inline and are never cached. There is no longer a deploy-free per-org rollback; a rollback means reverting the deploy. A later cleanup migration will drop the column.
* **Applicable Scenario:** None. Do not build UI for it; hide any existing toggle.
* **Allowed Values:** `'pdfkit'` | `'html'` (both accepted, both ignored).

### 88. Payslip Prerender On Publish (`payslip_prerender_on_publish`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Boolean (`BOOLEAN NOT NULL`)
* **Default Value:** `true`
* **Enforcement Point:** Read inside the existing approval and publish transactions in [payslip.service.js](src/modules/payroll/services/payslip.service.js) (`_enqueuePayslipWarmup`). The warm-up enqueue runs only when the ops-level env switch `PDF_BULK_GENERATION_ENABLED=true` **and** this flag are both on. It no longer depends on `pdf_render_engine`.
* **Deep Explanation:** When on, releasing a run enqueues one background render job per released payslip, so the cache is warm by the time HR downloads (§11.3). When off, the cache fills lazily on first download instead. While the platform bulk switch is off (the default after the 2026-09-30 migration), this flag has no effect, because warm-up is bulk rendering.
* **Applicable Scenario (ON):** An org that wants bulk downloads to stream immediately after a run is released, once ops has re-enabled bulk generation.
* **Not-Applicable Scenario (OFF):** An org that prefers to render on demand and avoid background queue volume.
* **Allowed Values:** `true` | `false`.

### 89. PDF Bulk Inline Miss Threshold (`pdf_bulk_inline_miss_threshold`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Integer (1–500, mirrored by the `payroll_settings_pdf_bulk_inline_miss_threshold_chk` DB CHECK)
* **Default Value:** `50`
* **Enforcement Point:** [payroll_pdf.service.js](src/modules/payroll/services/payroll_pdf.service.js) `planBulkPayslips` and the #174 controller: when the uncached (queue-satisfiable) count exceeds this, #174 returns `202` with a `batch_id` and a poll URL instead of streaming inline. #174 is refused with `503 PDF_BULK_GENERATION_DISABLED` while `PDF_BULK_GENERATION_ENABLED` is off, so this threshold only applies once ops re-enables bulk generation.
* **Deep Explanation:** Bounds how much synchronous render time a cold bulk ZIP may cost on the request thread. Above the threshold the request returns work-queued rather than a slow half-truth; below it, misses render inline as the ZIP streams (warming the cache as a side effect). Held rows are never counted — no queue path can satisfy them.
* **Applicable Scenario:** Lower it to force the `202` path sooner on large runs; raise it to prefer inline streaming.
* **Allowed Values:** Integer 1–500.

### 90. PDF Cache Retention Days (`pdf_cache_retention_days`)

* **Configuration Level:** Organizational (`payroll_settings` singleton)
* **Data Type:** Integer (30–3650, mirrored by the `payroll_settings_pdf_cache_retention_days_chk` DB CHECK)
* **Default Value:** `400`
* **Enforcement Point:** [payroll_automation.service.js](src/modules/payroll/services/payroll_automation.service.js) `runCachePurge`, driven by [pdf_cache_purge.cron.js](src/cron-jobs/pdf_cache_purge.cron.js) at 04:15 IST: cache-class artifacts older than this are deleted from S3 (object first, row second) and marked `purged`.
* **Deep Explanation:** How long a released payslip's cached PDF object is retained before purge. 400 days (≈13 months) covers a full financial year plus a month. Only `cache`-class objects are purged — `record`-class evidence (letters) is never touched by this cron. A purged source renders inline thereafter and is not re-cached (EC-P3-6).
* **Applicable Scenario:** Extend it for orgs that must keep generated payslip objects longer; shorten it to reclaim storage sooner (the source can always be re-rendered inline).
* **Allowed Values:** Integer 30–3650.

### 91. Letter Bulk Max Subjects (`letter_bulk_max_subjects`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, subject count (`INTEGER NOT NULL`)
* **Default Value:** `200`
* **Enforcement Point:** Read at batch-creation time by [document_letter_batch.service.js](src/modules/document/services/document_letter_batch.service.js) (#146 create); the numeric cap is enforced in [document_settings.service.js](src/modules/document/services/document_settings.service.js) `assertCap` (`SETTINGS_CAPS` `{ min: 1, max: 2000 }`) and by [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`min(1).max(2000)`).
* **Deep Explanation:** Bounds how many subject employees a single bulk-letter batch (#146) may target. A batch spanning more subjects than this is refused at creation with `422`, before any letter row or render job is enqueued, so a mistyped audience never floods the render queue. Each subject in an accepted batch is issued idempotently under a salted `keyBase` (`batch:{batchId}:{subjectId}`), so a re-driven batch never double-issues.
* **Applicable Scenario (Turned ON / raised):** An org issuing an org-wide letter (e.g. a revised-policy acknowledgement) to its whole headcount raises the cap toward the `2000` ceiling.
* **Not-Applicable Scenario (Turned OFF / lowered):** A cautious org lowers the cap so a bulk mistake is caught early and letters are issued in smaller, reviewable batches.
* **Allowed Values:** Integer `1`–`2000`. Values outside the range are refused with `422 SETTING_OUT_OF_RANGE`.

### 92. Letter Auto-Issue On Exit (`letter_auto_issue_on_exit`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Array of template codes (`JSONB NOT NULL`)
* **Default Value:** `[]` (empty — no letter is auto-issued on exit)
* **Enforcement Point:** Read by [document_automation.service.js](src/modules/document/services/document_automation.service.js) `runLetterAutoIssue`, driven **after** the offboarding archive by [document_offboarding_archiver.cron.js](src/cron-jobs/document_offboarding_archiver.cron.js) (02:30 IST). Membership is validated on write by `assertAutoIssueTemplates` in [document_settings.service.js](src/modules/document/services/document_settings.service.js) and the array shape by [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`array().items(string 1–64).max(5)`).
* **Deep Explanation:** The set of letter templates automatically issued to a departing employee when their last working day arrives. When empty (default) the auto-issue pass reads nothing beyond settings and returns immediately (BR-A1). On write the array must contain at most **5 distinct, known** template codes, and **no compensation-bearing template** — an automatic, unreviewed letter must never state a salary, so a code whose derived fields draw from the salary source is refused (BR-A2). Each due exit issues each listed template idempotently under a salted `keyBase` (`autoexit:{exitId}:{code}`); a re-run of the cron never re-issues. An exit with no attributable actor (`recorded_by` null) is skipped, not guessed. Auto-issue runs strictly after the archive pass because archival waives the leaver's acknowledgement/notification obligations — a letter issued before the archive would be un-acknowledgeable and unmailed.
* **Applicable Scenario (Turned ON):** An org sets `['relieving_letter', 'experience_letter']` so every leaver automatically receives their standard exit documents on their last working day with no manual step.
* **Not-Applicable Scenario (Turned OFF):** Default. Exit letters are issued manually (or via a proposal/batch) so HR controls the exact content and timing.
* **Allowed Values:** An array of ≤ 5 distinct known template codes, none compensation-bearing. Any other value is refused with `422 SETTING_OUT_OF_RANGE`.

### 93. Manager Can Propose Letters (`manager_can_propose_letters`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean (`BOOLEAN NOT NULL`)
* **Default Value:** `false`
* **Enforcement Point:** Read by [document_letter_proposal.service.js](src/modules/document/services/document_letter_proposal.service.js) at proposal-creation time (#148); when `false`, a manager's attempt to propose a letter is refused. Manager→subject scoping is enforced independently via `hierarchyAccess.getAccessibleUserIds` (a manager may only propose for accessible reports) regardless of this toggle.
* **Deep Explanation:** Master switch for the manager maker-checker path over letters. When `true`, a manager may **propose** a letter for a direct report; the proposal is not a letter until an HR user approves it, at which point it is issued idempotently under a salted `keyBase` (`proposal:{proposalId}`). When `false` (default), only HR issues letters and the proposal endpoints are closed to managers. This never widens a manager's data reach — the subject must still be within the manager's hierarchy scope.
* **Applicable Scenario (Turned ON):** An org that wants line managers to initiate exit/experience letters for their reports (subject to HR approval) turns this on to distribute the drafting workload.
* **Not-Applicable Scenario (Turned OFF):** Default. Letter issuance is centralised in HR; managers have no proposal capability.
* **Allowed Values:** `true` | `false`.

### 94. Document Notify Letter Issued (`document_notify_letter_issued`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Boolean (`BOOLEAN NOT NULL`)
* **Default Value:** `false`
* **Enforcement Point:** The enqueue gate `EVENT_SETTING_TOGGLE[letter_issued]` in [document_notification.service.js](src/modules/document/services/document_notification.service.js); checked at enqueue when a letter is issued in [document_letter.service.js](src/modules/document/services/document_letter.service.js).
* **Deep Explanation:** When `true`, issuing a letter enqueues a `letter_issued` notice to the subject employee. When `false` (default), the letter is still issued and visible in the employee's document views, but no email is sent. The enqueue is contained: a queue failure never fails the issue. **Kept off pending frontend confirmation (OD-P4-9):** the notice's CTA deep-link (`/documents/org`) has not yet been confirmed with the frontend, so the event is registered but defaults off and should not be enabled for an org until the destination route is verified.
* **Applicable Scenario (Turned ON):** An org that wants employees emailed the moment a letter is issued to them — **only once the `/documents/org` CTA route is confirmed live in the frontend**.
* **Not-Applicable Scenario (Turned OFF):** Default. Employees discover issued letters in-app.
* **Allowed Values:** `true` | `false`.

### 95. Letter Record Retention Days (`letter_record_retention_days`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer, **nullable** (`INTEGER NULL`)
* **Default Value:** `NULL` → inherit `document_retention_days` (whose own default is **2555 days / 7 years**). On day one after migration 00060, **no generated letter anywhere is a purge candidate.**
* **Enforcement Point:** Read by [document_automation.service.js](src/modules/document/services/document_automation.service.js) `_sweepLetterRetention` (Pass 3 of the `document_sweeper` cron, 03:45 IST). Validated on write by [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) (`number().integer().min(365)`, or `null` to clear) and floored again by the database CHECK `document_settings_letter_record_retention_chk` (`NULL OR >= 365`).
* **Deep Explanation:** The retention window, in days, after which a **soft-deleted, generated** letter (`origin='generated'`) becomes eligible for **irreversible** hard deletion — the row is destroyed, its RESTRICT children (signature requests, acknowledgements, recipients) are cleared first, its PDF object is deleted from storage, and its render artifact is left as a `purged` tombstone (hashes/size/template retained, `storage_key` NULLed). `NULL` (default) means the org inherits `document_retention_days`; a non-null value must be **≥ 365** — a letter is a legal document and no org may configure a retention shorter than a year through this knob. The effective retention per letter is `max(this-or-inherited-floor, the document type's own retention_days)`, so a longer per-type window always wins. A letter is **never** purged while it still has a live successor version (`supersedes_id` chain, drained newest-first across nights), an open acknowledgement obligation, or a statutory type — whatever its age. **⚠ Lowering this value makes existing soft-deleted letters older than the new window purge candidates on the very next nightly run, and the deletion is irreversible.** The purge is bounded per org per night and has a `dryRun` mode (operators must run one dry pass per environment before enabling — see the `pdf_retention_purge.md` runbook).
* **Applicable Scenario (Set to a value):** A tenant with a stricter internal policy deliberately lowers the letter retention (e.g. to `730` = 2 years) after confirming, via a dry run, exactly which letters that would eventually purge.
* **Not-Applicable Scenario (Left NULL):** Default. Letters inherit the 7-year document retention floor; the purge is effectively inert for years.
* **Allowed Values:** `NULL`, or an integer **≥ 365**. Any other value is refused with `422 SETTING_OUT_OF_RANGE` (Joi) or rejected by the DB CHECK.

### 96. Letter Bulk Rate Per Hour (`letter_bulk_rate_per_hour`)

* **Configuration Level:** Organizational (`document_settings` singleton)
* **Data Type:** Integer (`INTEGER NOT NULL`)
* **Default Value:** `10`
* **Enforcement Point:** Read by [document_letter_batch.service.js](src/modules/document/services/document_letter_batch.service.js) `create` (#143) via the shared fixed-window limiter [org_rate_limit.utils.js](src/common/utilities/org_rate_limit.utils.js). Bounded on write by [document_hr.validator.js](src/modules/document/validators/document_hr.validator.js) and the DB CHECK `document_settings_letter_bulk_rate_chk` (`BETWEEN 1 AND 500`).
* **Deep Explanation:** The maximum number of **bulk-letter batches** an org may create per rolling UTC hour. The limiter keys on `pdf:bulk:{orgId}:{YYYYMMDDHH}` in Redis (INCR + EXPIRE-on-first, TTL 3900 s), so the count resets on the UTC hour boundary. Over the cap, batch creation is refused with `429 LETTER_BULK_RATE_EXCEEDED` and a `Retry-After` header (seconds to the next hour). The limiter **fails open** — a Redis error never blocks a legitimate batch — because throttling is a guard-rail against scripted abuse, not a correctness invariant. The default of 10 sits well above any real HR usage while capping a runaway loop.
* **Applicable Scenario:** An org running an automated onboarding integration that could accidentally fire many bulk requests is protected from flooding the render queue; a genuine HR user issuing a handful of batches an hour never notices the limit.
* **Not-Applicable Scenario:** There is no "off" — the ceiling always applies, but at `500` (the max) it is effectively unbounded for human use.
* **Allowed Values:** An integer **1–500**. Any other value is refused with `422 SETTING_OUT_OF_RANGE` or rejected by the DB CHECK.

---

## Addendum — Entries #97–#114 (added 2026-10-09)

These are org-level configuration decisions that **already exist and are enforced in code** but had no registry entry. They were found by auditing every module against this document while planning the Settings module. Numbers are identifiers assigned in discovery order, so #114 sits under Attendance rather than at the end of its module block; entries are grouped by owning module for reading.

Two classes appear here:

* **Organizational singleton** — one row per org, one column per decision. These are *settings* in the same sense as #35–#96 and belong in a writable settings group.
* **Per-record surface** — a collection of configuration rows managed by its own CRUD endpoints (like #1–#12 leave types or #22–#28 weekly-off rules). These are *not* proxied by the Settings module; it publishes a pointer to the canonical endpoint.

---

### Organization / Billing Module

### 97. Billing Notification Recipients (`billing_notification_emails`)

* **Configuration Level:** Organizational (`organization_profiles` singleton)
* **Data Type:** Array of email strings (`TEXT[]`), at most 5, each ≤ 254 chars, de-duplicated and lower-cased
* **Default Value:** `[]` (empty — only active HR users are notified)
* **Enforcement Point:** Bounded on write by [organization.validator.js](src/modules/organization/validators/organization.validator.js) (`.max(5).unique()`); the cap constant lives in [billing_defaults.js](src/modules/billing/utils/billing_defaults.js) (`MAX_BILLING_NOTIFICATION_EMAILS`); consumed by [billing_notification.service.js](src/modules/billing/services/billing_notification.service.js) when assembling the recipient list for every billing notice. Written through `PUT /api/v1/organizations/profile`.
* **Deep Explanation:** Extra addresses copied on every billing notification (expiry warning, payment success/failure, cancellation) **in addition to** the org's active HR users, who are always included. This exists because the people who must see an invoice — finance, a company secretary, an external accountant — are frequently not HRMS users at all. The cap of 5 is a deliberate anti-abuse bound: the list is operator-free outbound email, so an unbounded array would turn a tenant profile field into a mailing-list primitive.
* **Applicable Scenario (Set):** Finance or an outsourced accountant must receive renewal and payment notices without being given an HRMS login.
* **Not-Applicable Scenario (Left empty):** Default. HR handles billing directly and no external copy is wanted.
* **Allowed Values:** 0–5 valid, unique email addresses. More than 5, a duplicate, or a malformed address is refused with `422`.

### 98. Billing Expiry Reminder Lead Days (`billing_reminder_lead_days`)

* **Configuration Level:** Organizational (`organization_profiles` singleton)
* **Data Type:** Array of integers (`INTEGER[]`), at most 4 entries, each 1–90, de-duplicated
* **Default Value:** `[7, 1]` — a warning 7 days before the period ends and again the day before
* **Enforcement Point:** Bounded on write by [organization.validator.js](src/modules/organization/validators/organization.validator.js) (`.items(integer 1–90).max(4).unique()`); defaults in [billing_defaults.js](src/modules/billing/utils/billing_defaults.js) (`DEFAULT_REMINDER_LEAD_DAYS`, `MAX_REMINDER_LEAD_ENTRIES`); consumed by the subscription lifecycle cron in [subscription_lifecycle.service.js](src/modules/billing/services/subscription_lifecycle.service.js), which emits a `notice.expiring` event on each matching lead day.
* **Deep Explanation:** How many days before the current subscription period ends the org wants to be warned, expressed as a set of lead days rather than a single value so an org can have both an early heads-up and a last-minute nudge. An **empty array disables expiry reminders entirely** — a legitimate choice for an org on annual purchase-order billing that does not want automated chasing, and the reason this field is an array rather than a boolean plus a number. The cron evaluates the set once per pass, so a change takes effect on the next pass and does not retroactively fire a lead day already passed.
* **Applicable Scenario (Set):** An org wants `[30, 7, 1]` because its procurement process needs a month's notice to raise a renewal PO.
* **Not-Applicable Scenario (Set to `[]`):** Reminders off — the org tracks renewals in its own finance calendar.
* **Allowed Values:** 0–4 unique integers, each **1–90**. Anything else is refused with `422`.

---

### Attendance Module

### 99. Default Attendance Policy (`attendance_policies.is_default`)

* **Configuration Level:** Per Attendance Policy (org-scoped), with an org-wide invariant: **at most one default**
* **Data Type:** Boolean flag on a policy row
* **Default Value:** The first policy an org creates is auto-promoted to default; thereafter `false` unless explicitly set
* **Enforcement Point:** [policy.service.js](src/modules/attendance/services/policy.service.js) — single-default promotion and demotion; managed via `POST|GET|PUT /api/v1/attendance/hr/policies` and `PATCH /api/v1/attendance/hr/policies/:id/deactivate`.
* **Deep Explanation:** Which policy governs an employee who has no explicit policy assignment. Because policies carry nearly every attendance decision (#13–#21, #25), the default policy is effectively the org's baseline attendance configuration, and promoting a new default silently changes behaviour for every unassigned employee. The service demotes the previous default in the same operation, so the "at most one" invariant cannot be broken by two concurrent promotions.
* **Applicable Scenario:** An org with one dominant work pattern plus a few exceptions — the common shape. New joiners inherit the default with no assignment step.
* **Not-Applicable Scenario:** An org that assigns every employee an explicit policy; the default then matters only as a safety net.

### 100. Calendar Exceptions (`attendance_calendar_exceptions`)

* **Configuration Level:** Per Exception row (org-scoped, targeted at org / department / location / user)
* **Data Type:** Date + `exception_type` (a working-day or non-working-day override) + optional target scope
* **Default Value:** None — the collection is empty until HR adds an exception
* **Enforcement Point:** [attendance_calendar_exceptions.repository.js](src/modules/attendance/repositories/attendance_calendar_exceptions.repository.js); consumed cross-module by [leave_calculator.utils.js](src/modules/leave/utils/leave_calculator.utils.js) when counting leave days and by [payroll_attendance_aggregator.service.js](src/modules/payroll/services/payroll_attendance_aggregator.service.js) when deriving payable days.
* **Deep Explanation:** One-off overrides of the working calendar — declaring a normally-off day a working day (a compensating Saturday before a long weekend) or a normally-working day non-working (a local bandh, a site-specific closure). This is **the highest-blast-radius per-record configuration in the system**, because three modules read it: attendance day-status resolution, leave day counting and payroll payable-day aggregation all change answer for the affected date. An exception added after a payroll run is created does not retroactively change that run, which keeps a frozen run reproducible.
* **Applicable Scenario:** A regional holiday affects one location only, or the org declares a working Saturday to compensate for a bridge holiday.
* **Not-Applicable Scenario:** Orgs whose calendar is fully described by holidays (#15) and weekly-off rules (#22–#28) need no exceptions at all.

### 101. Shift Rotation Patterns (`shift_rotation_patterns`)

* **Configuration Level:** Per Rotation Pattern (org-scoped), with ordered entries
* **Data Type:** Named pattern + an ordered sequence of rotation entries referencing shift templates
* **Default Value:** None — no rotations until HR defines one
* **Enforcement Point:** [shift_rotation_patterns.model.js](src/modules/attendance/models/shift_rotation_patterns.model.js) with entries in [shift_rotation_entries.model.js](src/modules/attendance/models/shift_rotation_entries.model.js); managed via `POST|GET /api/v1/attendance/hr/rotations` and `DELETE /api/v1/attendance/hr/rotations/:id`.
* **Deep Explanation:** Repeating shift cycles (for example a three-week morning → evening → night rotation) that drive shift assignment without HR rostering each week by hand. The pattern is configuration; the per-employee assignments generated from it are records. Changing a pattern does not rewrite assignments already generated.
* **Applicable Scenario:** Manufacturing, hospital or support operations where staff rotate through shifts on a fixed cycle.
* **Not-Applicable Scenario:** Single-shift or fully flexible orgs — leave the collection empty and rely on #20 auto-detect or explicit assignment.

### 114. Shift Templates (`shift_templates`)

* **Configuration Level:** Per Shift Template (org-scoped, optionally bound to a policy via `policy_id`)
* **Data Type:** Name, `type`, `start_time`, `end_time`, `timezone`, `is_overnight`, `is_active`
* **Default Value:** None — an org defines its own shifts; no templates are seeded
* **Enforcement Point:** [shift_templates.model.js](src/modules/attendance/models/shift_templates.model.js); managed via `POST|GET|PUT|DELETE /api/v1/attendance/hr/shifts`, assigned with `POST /api/v1/attendance/hr/shifts/assign`, and resolved per punch by [shift_resolver.utils.js](src/modules/attendance/utils/shift_resolver.utils.js).
* **Deep Explanation:** The named shift definitions every other shift feature is expressed in terms of — #20 auto-detect picks among them, #101 rotations sequence them, and the grace/late/early-exit thresholds (#13, #14, #16) are all measured against their `start_time`/`end_time`. `is_overnight` is the field that matters most: it tells the resolver that an `end_time` earlier than `start_time` crosses midnight, without which a night shift's duration computes as negative. `timezone` is per template rather than per org so a distributed org can run shifts in local time.
* **Applicable Scenario:** Any org with defined working hours — nearly all of them. This collection is a prerequisite for shift-aware attendance.
* **Not-Applicable Scenario:** Fully flexible orgs that track only total hours and never compare a punch to a shift boundary.

### 102. Field-Work Locations & Geofence Radius (`organization_field_locations`)

* **Configuration Level:** Per Field Location (org-scoped), assigned to employees via field assignments
* **Data Type:** Name, coordinates, `geofence_radius_meters` (integer), active flag
* **Default Value:** None — no field locations until HR creates them
* **Enforcement Point:** [organization_field_locations.model.js](src/modules/attendance/models/organization_field_locations.model.js); managed via `POST|GET|PUT|DELETE /api/v1/attendance/hr/field-locations` with assignment through `POST /api/v1/attendance/hr/field-assignments`; consumed by clock-in geo validation.
* **Deep Explanation:** The field-work counterpart to the office location geofence (#30/#31). A field employee's punch is validated against the radius of the field location(s) assigned to them rather than an office, which is what makes `field` work mode usable for sales, service and site staff. Distinct from `organization_locations` because a field location is a *work site* an employee visits, not a company premises with a timezone and an address on letterhead.
* **Applicable Scenario:** Field sales, installation or service teams whose attendance must be proven at a customer site or project location.
* **Not-Applicable Scenario:** Orgs with no field work mode — the collection stays empty and only office geofences (#30) apply.

### 103. Biometric / Attendance Devices (`attendance_devices`)

* **Configuration Level:** Per Device (org-scoped), with per-device employee mappings
* **Data Type:** Device `type`, identity, active flag, a hashed API key, plus `attendance_device_employee_mappings` linking device-local employee codes to HRMS users
* **Default Value:** None — no devices registered until HR adds them
* **Enforcement Point:** [attendance_devices.model.js](src/modules/attendance/models/attendance_devices.model.js) and [attendance_device_employee_mappings.model.js](src/modules/attendance/models/attendance_device_employee_mappings.model.js); managed via `POST|GET|PUT|DELETE /api/v1/attendance/hr/devices` and `/devices/:id/mappings`; the ingest endpoint is mounted separately at `/api/v1/attendance/devices/webhook`.
* **Deep Explanation:** Registration of physical punch devices that push attendance events into the system, and the mapping from each device's own employee numbering to HRMS users — without the mapping an inbound punch cannot be attributed. **Security-sensitive:** the device credential is stored only as `api_key_hash` and is never readable after issuance, so this collection must be managed through its own endpoints and its secret must never be exposed by any aggregated settings view.
* **Applicable Scenario:** Factories, offices and sites using biometric or RFID terminals as the primary attendance source.
* **Not-Applicable Scenario:** App/web-only attendance — no devices, and the webhook ingest path is simply unused.

---

### Document Module

### 104. Letterhead Branding Identity (`document_letter_branding`)

* **Configuration Level:** **Organizational (`document_letter_branding` singleton — `UNIQUE (org_id)`, lazily provisioned by `getOrCreate`)**
* **Data Type:** `signatory_name`, `signatory_designation`, `registered_address_lines` (array, max 5), `cin`, `gstin`, `pan`, `tan`, `contact_email`, `contact_phone`, `website`, `accent_color_hex` (`CHAR(7)` NOT NULL), `footer_note`, `letterhead_enabled` (boolean); plus logo/signature asset columns owned by a separate upload handshake
* **Default Value:** `accent_color_hex` = `#1F2937`, `registered_address_lines` = `[]`, all other text fields `NULL`; values left `NULL` fall back to the corresponding `organization_profiles` field where one exists
* **Enforcement Point:** [document_letter_branding.model.js](src/modules/document/models/document_letter_branding.model.js); read/written by [document_letter_branding.service.js](src/modules/document/services/document_letter_branding.service.js) (`getOrCreate`, `replace`) via `GET|PUT /api/v1/documents/hr/letter-branding`; assets through `/letter-branding/assets/upload-url` and `/assets/confirm`; consumed at render time by every letter and payroll PDF template.
* **Deep Explanation:** The org's letterhead identity — who signs official letters, the registered address and statutory identifiers printed on them, the accent colour, and whether the letterhead is drawn at all. Despite living in the Document module this is **company identity, not document behaviour**, which is why HR expects to find it on a company settings page next to the org profile. `letterhead_enabled` is the master switch: with it off, letters render on plain paper, which is correct for an org that prints onto pre-printed stationery. Text fields left `NULL` **inherit** from `organization_profiles` (name, website, address, GST, PAN) rather than rendering blank, so an org that fills in its profile gets a usable letterhead with no branding setup at all. Values are **frozen into each issued letter and payslip at render time**, so editing branding never rewrites a document already issued. The `replace` path takes a row lock and audits old → new into `document_audit_logs` under `entity_type='document_letter_branding'`.
* **Applicable Scenario:** Any org issuing offer letters, experience letters, payslips or statutory documents on its own letterhead with a named signatory.
* **Not-Applicable Scenario (`letterhead_enabled = false`):** The org prints onto pre-printed physical letterhead, or issues documents without branding; inherited profile values are then unused.
* **Allowed Values:** `accent_color_hex` must be a 7-character `#RRGGBB` string and **may never be cleared to NULL** (the column is NOT NULL); `registered_address_lines` is truncated to the first 5 non-empty trimmed entries; an empty string in any text field clears it to `NULL`. Asset columns are **not** writable here — they are set only by the upload handshake, and the storage keys must never be exposed.

### 105. Per-Letter-Type Configuration (`document_letter_configs`)

* **Configuration Level:** Per Letter Type (org-scoped, one config row per letter type code)
* **Data Type:** Per-type behaviour flags and values, including the reference-number pattern and the signature/approval requirements referenced by #84–#86
* **Default Value:** Inherited from the letter-type catalog until an org overrides it; a config row is created when a letter type is enabled
* **Enforcement Point:** [document_letter_configs.model.js](src/modules/document/models/document_letter_configs.model.js); managed via `GET /api/v1/documents/hr/letter-templates`, `GET /letter-templates/:code` and `PUT /letter-templates/:code/config`; numbering is allocated from [document_letter_sequences](src/modules/document/models/document_letter_sequences.model.js).
* **Deep Explanation:** The per-type layer beneath the org-wide letter settings (#84–#86, #96): whether a given letter type needs approval before issue, what its reference-number pattern is, and which signature mode applies. It exists because an experience letter and a termination letter legitimately need different approval and signature rules in the same org. Per-type values **override** the org-wide default where set, and the chosen configuration is frozen onto each issued letter, so tightening a rule does not invalidate letters already out.
* **Applicable Scenario:** An org that requires dual approval and a wet signature for employment-verification letters but allows self-service issuance of salary certificates.
* **Not-Applicable Scenario:** An org happy with the org-wide defaults for every type — the per-type configs simply mirror them.

### 106. Per-Document-Type Rules (`document_types`)

* **Configuration Level:** Per Document Type (org-scoped, activated from a platform catalog)
* **Data Type:** Roughly twenty per-type flags and values — mandatory, expiry-bearing, verification-required, retention, visibility, request-ability and more — evaluated as an AND/OR rule set
* **Default Value:** Seeded from [document_type_catalog](src/modules/document/models/document_type_catalog.model.js) when a type is activated; thereafter org-owned
* **Enforcement Point:** [document_types.model.js](src/modules/document/models/document_types.model.js) with resolution in [document_type_rules.utils.js](src/modules/document/utils/document_type_rules.utils.js); managed via `POST /api/v1/documents/hr/types`, `POST /types/activate`, `PUT /types/:id`, `PATCH /types/:id/activate|deactivate`; the catalog is read through `GET /catalog` and `/catalog/:code`.
* **Deep Explanation:** The per-type overrides that sit under the org-wide document settings (#58, #63, #65–#67, #71). The effective rule for a document is the per-type value where set, falling back to the org-wide setting — the precedence model the Settings UI must show, because a user who changes an org-wide default and sees no effect is usually looking at a type that overrides it. Deactivating a type does not delete documents already filed under it.
* **Applicable Scenario:** PAN is mandatory and never expires; a work visa is mandatory, expiry-bearing and verification-required; a training certificate is optional — one org, three rule sets.
* **Not-Applicable Scenario:** An org that activates catalog types and never overrides them; the per-type rows then just carry catalog defaults.

---

### Payroll Module

### 107. Salary Component Catalog (`salary_components`)

* **Configuration Level:** Per Component (org-scoped)
* **Data Type:** Code, name, `component_type` (earning/deduction), calculation basis and formula inputs, taxability, statutory linkage, active flag
* **Default Value:** None until bootstrapped; `POST /components/bootstrap` seeds a standard Indian set, and statutory heads are auto-activated when the matching statutory toggle flips ON
* **Enforcement Point:** [salary_components.model.js](src/modules/payroll/models/salary_components.model.js); managed via `POST /api/v1/payroll/hr/components` (+ `/bootstrap`, `GET`, `PUT`, `DELETE`); activated from statutory config by [statutory_config.service.js](src/modules/payroll/services/statutory_config.service.js).
* **Deep Explanation:** The vocabulary of the payroll engine — every salary structure, payslip line and report column is expressed in these components, which makes this the single most consequential per-record configuration in Payroll. Components are **soft-deleted, never hard-deleted**, because historical runs and payslips reference them; this is also why the exit-payout settings (#55/#57) validate their component ids against an *active earning* component at write time rather than relying on a foreign key.
* **Applicable Scenario:** Every org running payroll. Most start from the bootstrap set and add org-specific allowances.
* **Not-Applicable Scenario:** None if payroll is in use. Orgs not using the Payroll module leave it empty.

### 108. Reimbursement Categories (`reimbursement_categories`)

* **Configuration Level:** Per Category (org-scoped)
* **Data Type:** Name, limits, receipt-requirement and approval-routing attributes, active flag
* **Default Value:** None — no categories until HR creates them
* **Enforcement Point:** [reimbursement_categories.model.js](src/modules/payroll/models/reimbursement_categories.model.js); managed via `POST|GET|PUT|DELETE /api/v1/payroll/hr/reimbursements/categories`.
* **Deep Explanation:** What employees may claim, with the per-category caps and evidence rules the claim validator enforces. The approval chain in force is **frozen onto a claim at submission** (#51), so changing a category's routing does not re-route claims already in flight.
* **Applicable Scenario:** Orgs reimbursing travel, internet, mobile or medical expenses with different caps per category.
* **Not-Applicable Scenario:** Orgs that pay fixed allowances through the salary structure instead of claim-based reimbursement.

### 109. Benefit Plans (`benefit_plans`)

* **Configuration Level:** Per Plan (org-scoped), with per-employee enrollments
* **Data Type:** Plan definition, cost/contribution attributes, eligibility, active flag
* **Default Value:** None — no plans until HR creates them
* **Enforcement Point:** [benefit_plans.model.js](src/modules/payroll/models/benefit_plans.model.js); managed via `POST|GET|PUT|DELETE /api/v1/payroll/hr/benefit-plans` with enrollments under `/benefit-plans/:id/enrollments`.
* **Deep Explanation:** Non-salary benefits (insurance, wellness, allowance programmes) an employee can be enrolled into, where enrollment can carry a payroll consequence. The plan is configuration; an enrollment is a record with its own effective dating, so ending a plan does not retroactively unwind enrollments already processed in a run.
* **Applicable Scenario:** Orgs offering group insurance or structured benefit programmes alongside salary.
* **Not-Applicable Scenario:** Orgs whose entire compensation is expressed in salary components.

### 110. Bonus Rules (`bonus_rules`)

* **Configuration Level:** Per Rule (org-scoped), maker-checker governed
* **Data Type:** `bonus_type`, `value`, `eligibility_source`, `eligibility_config` (JSONB), `max_amount_per_employee`, lifecycle status
* **Default Value:** None — no rules until HR creates them
* **Enforcement Point:** [bonus_rules.model.js](src/modules/payroll/models/bonus_rules.model.js); managed via `POST|GET|PUT /api/v1/payroll/hr/bonus-rules` with `/approve`, `/reject`, `/preview-impact`, `/apply` and `/cancel`.
* **Deep Explanation:** Parameterised bonus programmes — who qualifies, how much, and a per-employee ceiling — applied to a payroll run as adjustments rather than computed inside the engine. This is **money-moving configuration**, which is why it carries its own propose → approve → preview-impact → apply lifecycle instead of being a plain editable row; `preview-impact` exists so the cost is known before it is committed. `max_amount_per_employee` is the backstop against a mis-specified formula.
* **Applicable Scenario:** Annual, festival or performance bonus programmes with rule-based eligibility.
* **Not-Applicable Scenario:** Orgs paying bonuses as one-off manual adjustments instead.

### 111. Tax Regimes & Slabs (`tax_regime`, `tax_slab`)

* **Configuration Level:** Per Regime (org-scoped), each with its own ordered slabs; one regime flagged `is_default`
* **Data Type:** `standard_deduction`, `allows_chapter_via`, `allows_hra_exemption`, `chapter_via_limits`, `rebate_87a_*`, `surcharge_slabs`, `is_default`, plus slab rows (bounds + rate)
* **Default Value:** None until bootstrapped; `POST /tax/bootstrap` seeds the statutory old/new regimes and their slabs
* **Enforcement Point:** [tax_regime.model.js](src/modules/payroll/models/tax_regime.model.js) and [tax_slab.model.js](src/modules/payroll/models/tax_slab.model.js); managed via `POST /api/v1/payroll/hr/tax/bootstrap`, `GET /tax/regimes`, `PUT /tax/regimes/:id`, `GET|PUT /tax/regimes/:id/slabs`.
* **Deep Explanation:** The income-tax rules the TDS projection and Form 16 are computed from. These are org-scoped copies of statutory rules rather than platform constants **so a correction mid-year is a tenant decision with an audit trail, and a finalised financial year keeps the numbers it was computed with**. `is_default` decides the regime for an employee who has not elected one. Editing a regime does not recompute finalised years.
* **Applicable Scenario:** Every org running Indian payroll with TDS; the statutory slabs need updating each Union Budget.
* **Not-Applicable Scenario:** Orgs not using the tax engine, or paying only non-taxable stipends.

### 112. Salary Structure Templates (`salary_structure_templates`)

* **Configuration Level:** Per Template (org-scoped), targeted by department / designation / employment type
* **Data Type:** `definition_mode`, `currency`, targeting attributes, plus ordered component rows in `salary_structure_template_components`
* **Default Value:** None — no templates until HR creates them
* **Enforcement Point:** [salary_structure_templates.model.js](src/modules/payroll/models/salary_structure_templates.model.js); managed via `POST|GET|PUT|DELETE /api/v1/payroll/hr/structure-templates`, component rows under `/structure-templates/:id/components`, with `POST /structure-templates/:id/preview` to dry-run the resulting breakup.
* **Deep Explanation:** Reusable salary breakups — which components, in what order, computed how — so a new hire's structure is instantiated from a template instead of assembled by hand. `definition_mode` decides whether the template is expressed CTC-down or basic-up, which changes how every dependent component is derived. A template is **copied** into an employee's structure at assignment, so editing a template never alters existing employees' salaries.
* **Applicable Scenario:** Orgs with standard grade- or designation-based compensation bands.
* **Not-Applicable Scenario:** Small orgs negotiating every structure individually.

---

### Leave Module

### 113. Leave Policy Templates & Assignment Ledger (`leave_policy_template`, `employee_leave_policy_assignment`)

* **Configuration Level:** Per Template (org-scoped) with per-type entitlements; assignment is per employee and **effective-dated**
* **Data Type:** Template definition + `leave_policy_entitlement` rows per leave type; assignments carry `effective_from` / `effective_to`; per-employee deviations are tracked in `employee_leave_configs.overridden_fields`
* **Default Value:** None — no templates until HR creates them; an employee with no assignment falls back to leave-type defaults (#1–#12)
* **Enforcement Point:** [leave_policy_template.model.js](src/modules/leave/models/leave_policy_template.model.js), [employee_leave_policy_assignment.model.js](src/modules/leave/models/employee_leave_policy_assignment.model.js), [employee_leave_config.model.js](src/modules/leave/models/employee_leave_config.model.js); managed via `POST|GET|PUT|DELETE /api/v1/leaves/templates` (+ `/templates/:id/entitlements`), `POST /api/v1/leaves/users/:userId/assign-policy`, `PUT|DELETE /users/:userId/configs/:leaveTypeId`, and the bulk roster endpoints `GET /assignments`, `/assignments/summary`, `POST /assignments/preview`, `POST /assignments/bulk`, `POST /assignments/:id/end`.
* **Deep Explanation:** Named bundles of leave entitlements assigned to employees over time, rather than editing each employee's quotas individually. The assignment ledger is **append-only and effective-dated**, so an employee's entitlement history is reconstructible and a mid-year policy change does not rewrite balances already accrued. `overridden_fields` records which values were deliberately set per employee, so re-assigning a template does not silently clobber an individual exception. A live configuration is identified by its effective window, **not** by `effective_to IS NULL`.
* **Applicable Scenario:** Orgs with different leave entitlements by grade, location or tenure, or any org that needs to show auditors what an employee was entitled to on a past date.
* **Not-Applicable Scenario:** Orgs where one set of leave-type defaults applies to everyone — no templates, no assignments.

---

### Deliberately **not** registry entries

Catalogued here so a future reader does not mistake the omission for an oversight:

| Table / value | Why it is not a setting |
|---|---|
| `document_templates`, `org_documents`, `employee_documents` | document **content** (versioned files, storage keys, checksums), not configuration |
| `organization_departments`, `organization_locations`, designations | organisational **master data**; `organization_locations.geofence_radius_meters`/`timezone` are already #30/#31 |
| `subscription_plans`, `features`, `plan_features`, `document_type_catalog` | **platform-plane** seller/catalog data; an org cannot configure it |
| `roles`, `role_invitation_policies` | role definitions and who may invite whom — already covered by the Organization entries (#32/#33) |
| `attendance_lock_periods` rows | records created under setting #29, not a setting themselves |
| `INVITE_TTL` (48 h), rounding tolerances, `LIST_MAX_LIMIT`, cron schedules, `BILLING_*` env knobs | **hard-coded or env-driven operational constants**, deliberately seller-controlled and not org-configurable today |
| `attendance_devices.api_key_hash`, `PAYROLL_ENCRYPTION_KEY`, `RAZORPAY_*`, renderer credentials | **secrets** — never readable, never exposed in any settings surface |
