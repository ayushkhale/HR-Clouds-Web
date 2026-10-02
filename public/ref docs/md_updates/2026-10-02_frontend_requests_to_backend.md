# Frontend → Backend: Open Requests, 2 Oct 2026

**From:** Frontend (HR workspace)
**To:** Backend (Organisation, Payroll)
**Date:** 2026-10-02
**Supersedes nothing.** Two items, both found while testing the HR workspace.
Each says exactly what the frontend sends today, so the question is only about
what happens after the request leaves the browser.

---

## G-1 · An invited employee's gender comes back as the wrong one (High, Organisation)

**Reported by testing:** an invitation was sent with **Male** chosen; the person
then shows as **female** in the workspace (the female illustration on avatars,
and "Female" on their profile).

**What the frontend sends.** Verified in `src/roles/hr/components/InviteMemberModal.jsx`:
the select's values are exactly `male` / `female` / `other` (`GENDER_OPTIONS`),
and the invite body carries the chosen value verbatim:

```jsonc
POST /api/v1/organizations/users/invite
{ "email": "…", "role": "employee", "name": "…", "gender": "male", … }
```

Nothing between the select and the request rewrites it — there is no mapping,
no default and no normalisation on the way out. We also confirmed the two
illustrations are not swapped: `MALE_AVATAR_SRC` and `FEMALE_AVATAR_SRC`
(`src/shared/components/avatarImages.js`) are the short-haired and long-haired
faces respectively, and `GenderAvatar` only shows the female one when the value
it reads is literally `female`. So the value the UI displays is the value the
API returned.

**What we cannot see from here, and need checked:**

1. Is `gender` in the invite body's **validation whitelist**? Validation on the
   profile endpoints runs with `stripUnknown: true` (documented in
   `invitation_list_manager_daily_log_and_type_contracts_2026_09_24.md` §6), so
   an unlisted key is dropped silently with a `200`. The documented invite
   contract (`md_organization/2_org_invitation_api.md` §1) does not list
   `gender`, `blood_group`, `dob`, `pan_number`, `uan_number`,
   `marital_status`, `personal_email` or the address fields, all of which the
   invite dialog sends.
2. If it is accepted, **which table is it written to** — `user_profiles`, or the
   role profile (`employee_profiles` / `manager_profiles` / `hr_profiles`)?
3. **Does the role profile's `gender` column have a default?** `formatUserProfile`
   reads `roleProfile.gender || user.gender || user.profile?.gender`
   (`2026-09-28_backend_execution_report_for_frontend_requests.md`, R-5). If the
   invite writes `user_profiles.gender` while the role profile carries a
   non-null default, the default wins on every read — which would produce
   exactly this symptom.

**Why it matters more than one wrong illustration.** Leave types can be
restricted by gender (`allowed_genders` on a leave type, and
`DEMOGRAPHIC_PROFILE_INCOMPLETE` in `leaveErrors`), so a wrong value changes
what the person is allowed to apply for.

**And there is no way to correct it.** `PATCH /organizations/employees/:id` and
`PATCH /organizations/employees/me` both strip `gender` deliberately, and no HR
endpoint writes it. Once an invitation is accepted, the value is frozen wherever
it landed. Either the invite has to be right, or HR needs a way to fix it:

> **Ask:** confirm `gender` is accepted and stored on the read path used by
> `GET /organizations/employees` (#8) and `…/employees/:id` (#9) — and if an
> accepted member's gender can be wrong for any reason, add it to the HR
> employee PATCH whitelist (HR only, not self-service, since leave eligibility
> depends on it).

**Meanwhile:** the invite dialog now says under the field that gender is set
once and cannot be changed from the profile afterwards, so HR knows the choice
is final. No workaround is possible beyond that.

---

## G-2 · `fnf_encashment_max_days` rejected `""`; fixed on the frontend (Closed, Payroll)

Recorded here for the audit trail — no backend change is being asked for.

`PUT /payroll/hr/settings` (#23) returned, on a Payroll Settings page nobody had
edited:

```json
{ "success": false, "message": "\"fnf_encashment_max_days\" must be a number", "errorCode": "VALIDATION_ERROR" }
```

**Cause was ours.** The page defaulted the nullable Phase 7 keys into its form
state as `""` and then PUT the whole settings object, so a field that was not
even rendered failed the entire save. Since #23 is a partial update, the page
now sends only the keys HR actually changed, and an emptied nullable box goes
out as `null` (`src/roles/hr/payroll/settingsMeta.js`).

**One confirmation would help:** that `null` is accepted for the nullable
columns — `fnf_encashment_max_days`, `compoff_encashment_max_days_per_fy`,
`fnf_encashment_component_id`, `fnf_notice_recovery_component_id`,
`compoff_encashment_component_id` — since clearing a cap that was previously set
has no other representation.

---

## L-1 · No way to list who is on which leave policy (Medium, Leave)

> **Expanded.** This item is the short version. The full ask — the screen we want
> to build, and every endpoint it needs, mirrored off the attendance assignment
> contract — is in **`2026-10-02_leave_assignment_api_request.md`**. Read that one
> if you are picking this up.

**Context.** Setup › Leave now has a **Leave Assignment** page, so giving a leave
policy out sits beside the policies themselves instead of three navigations away
inside one employee's profile.

**What is missing.** There is no bulk read of leave assignments or per-user leave
configs. The only reads are:

| Endpoint | Scope |
|---|---|
| `GET /leaves/users/:userId/balances` (#3) | one employee |
| `GET /leaves/team/member/:userId/balances` (#6) | one team member |

Attendance has `GET /attendance/assignments`, which is why Shift Management can
show a table of who works which shift, with the schedule, the effective dates and
the state in every row. The leave equivalent would be one request per employee —
which the frontend does not do — so the new page lists the people from the
employee directory and reads one person's setup when HR opens them. HR therefore
cannot see at a glance **who has no policy at all**, which is the question the
page would most like to answer.

> **Ask:** a list endpoint for leave policy assignments — ideally
> `GET /leaves/assignments` returning, per user, the template they are on
> (`template_id`, `template_name`), when it was assigned, and whether any of
> their leave types have been overridden. Pagination like #8, HR-scoped.
> Even `{ user_id, template_name }` pairs would be enough: the directory
> supplies names and roles, and the page already has a column waiting for it.

**Meanwhile:** the people list carries name, role, department and designation
from the roster, and a "no leave policy assigned" state is shown once a person is
opened. **Frontend ready:** the left-hand list takes a policy column the day the
endpoint exists; nothing else changes.
