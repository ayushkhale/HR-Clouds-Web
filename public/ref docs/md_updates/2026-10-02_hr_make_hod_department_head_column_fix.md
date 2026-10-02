# HR `make_hod` fix — `hr_profiles.department_head`

**Date:** 2026-10-02
**Audience:** frontend engineers (HR dashboard: invite form, department management)
**Backend status:** code complete, 2656 unit tests green. Migration **`00068` is handed to ops
unrun — and unlike `00067` it is NOT optional for this code** (see §5).
**Companion change the same day:** `2026-10-02_hr_creator_job_profile_setup_and_hod_department_fix.md`

---

## 1. The defect

`manager_profiles` has carried a `department_head` boolean since migration 00016. `hr_profiles`
never got one — but the invitation code writes and reads it for **both** roles.

That flag is the only record of "this person was invited to *head* a department" during the window
between sending an invitation and accepting it. The headship is deliberately staged at invite time
and executed on accept, so a department is not left headless by an invitee who never shows up.

With the column missing on `hr_profiles`:

1. `inviteUser` built `department_head: true` → Sequelize dropped the unknown attribute silently
   (no error, no warning) → nothing was stored.
2. `updateProfileHodFlag` ran `HrProfile.update({ department_head })` with no such model attribute
   → updated nothing.
3. `acceptInvitation` read `profile.department_head` → `undefined` → the headship transfer never ran.

**Net effect: inviting an HR with `make_hod: true` reported success, the invitee joined, and the
department silently kept no head at all.** Managers were unaffected throughout.

## 2. What changed

| # | Change | Frontend impact |
|---|---|---|
| 1 | Migration `00068` adds `hr_profiles.department_head BOOLEAN NOT NULL DEFAULT false`, and backfills `true` for HRs who already head an active department (their flag was lost to defect #2). | None directly — see §4 for the behaviour it unblocks. |
| 2 | `hr_profiles` model declares the attribute (mirrors `manager_profiles`). | — |
| 3 | `POST /organizations/users/invite` with `role: hr` + `make_hod: true` now actually stages headship, and `POST /organizations/invitations/accept` executes it. | The HOD checkbox finally works for HR invitees. |
| 4 | The invite now writes `department_head` **explicitly** (`true` *or* `false`) for every manager/HR invite instead of only writing `true`. | Fixes a latent leak — see §3. |

The backfill is **additive only**: it never clears a flag. `department_head = true` on someone who
is *not* yet a head is a legitimate state — it is precisely a pending `make_hod` invitation — so
clearing flags to "match" `organization_departments` would have destroyed real intent. (This is
also why no equivalent pass was run over `manager_profiles`.)

## 3. Latent leak closed by change #4

Previously the flag was only ever set to `true`. Sequence that leaked headship:

```text
1. HR invites X as manager/HR of Engineering with make_hod: true   → department_head = true
2. The invitation lapses (expires, never accepted)                 → flag stays true
3. HR re-invites X later as a plain member, make_hod unchecked      → flag NOT overwritten (still true)
4. X accepts                                                       → X silently becomes head of Engineering
```

The invite now writes `!!make_hod`, so step 3 clears the stale intent. This is safe by
construction: an invite for a **current member** is rejected with `409 DUPLICATE_MEMBERSHIP` long
before this write, so the only flag reachable is leftover invitation intent — never a sitting
head's.

## 4. API behaviour you should expect

No request or response **shapes** changed. Behaviour that did:

- `POST /organizations/users/invite` — `{ role: "hr", department_id, make_hod: true }` now stages
  headship. Validation is unchanged: `make_hod` with `role: "employee"` → `400 INVALID_HOD_ROLE`;
  `make_hod` without `department_id` → `400 MISSING_DEPARTMENT_FOR_HOD`; a `manager` caller sending
  `make_hod` at all → `403 FORBIDDEN_INVITE_FIELD`.
- `POST /organizations/invitations/accept` — for an HR invited as HOD, accepting now additionally:
  swaps `organization_departments.head_of_department_id` to them, transfers the previous head's
  reporting lines, adopts that department's report-less members (`employee_to_hr`, `manager_to_hr`
  and `hr_to_hr` are all valid relations, so nothing is silently dropped), and joins the new head to
  the department. All inside the same transaction as the membership — it either all lands or none of
  it does. The success response is unchanged (`{ success: true, message: "Invitation accepted successfully" }`).
- **Refresh after accept.** An HR accepting a `make_hod` invitation changes the department's head
  and possibly several people's reporting lines, so invalidate your department and hierarchy caches
  (`GET /organizations/departments`, `GET /organizations/hierarchy`) on the post-accept redirect.

**Not repairable, and worth a line in your UI copy:** HR invitations sent with `make_hod: true`
*before* this fix left no trace of the intent in any table — the flag was dropped at write time.
Those departments have no head. HR appoints one with `PUT /organizations/departments/:id`
(`head_of_department_id`). Note that this path now also joins the head to the department and can
answer `409 HOD_IN_OTHER_DEPARTMENT` — handling for that is described in the companion document, §5.

## 5. Deploy / testing note

Migration `00068` is **required** by this code, not optional: the model now declares the attribute,
so every HOD write (`updateProfileHodFlag`, any manager/HR invite) includes the column in its SQL.
Running the app against a database without the column would fail those writes. The pipeline's
migrate-then-boot ordering already guarantees the right sequence; just don't point this build at an
un-migrated database.

Backend coverage: `tests/unit/organization/hr_department_head_flag.test.js` (9 tests) pins the
migration's shape and the additive-only backfill SQL, the model attribute matching
`manager_profiles`, both profile tables being flipped by `updateProfileHodFlag`, the explicit
`true` / `false` invite writes (including the employee case that must carry no flag), and
`acceptInvitation` executing the transfer for an HR while skipping it without a flag or a
department. Full suite: `npm test` → **2656 pass / 0 fail**.

## 6. Related docs updated

- `public/md_system/api_registry.md` — rows **#4** and **#8** amended.
- `public/md_organization/2_org_invitation_api.md` — `make_hod` validation notes + the accept-step
  side effects.
