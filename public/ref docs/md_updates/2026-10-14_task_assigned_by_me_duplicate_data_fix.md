# API Bug Fix: Task Assigned-By-Me Duplicate Response Elimination

**Date:** 2026-10-14  
**Author:** Senior Backend Software Engineer  
**Modules Affected:** Task Assignment Module (`src/modules/task/`)  
**Endpoints Affected:**
- `GET /api/v1/tasks/manager/assigned-by-me` (#256)
- `GET /api/v1/tasks/manager/team-tasks` (#257)
- `GET /api/v1/tasks/self` (#249)
- `GET /api/v1/tasks/hr` (#266)
- `GET /api/v1/tasks/:id/comments` (#254)

---

## 1. Issue Description

When calling `GET /api/v1/tasks/manager/assigned-by-me?page=1&limit=20&status=pending`, the API returned duplicate/repetitive task items in `data.tasks`:
- For 2 distinct tasks, the response returned 4 array items.
- In each duplicate pair:
  - One item had `assigner.name = "Abhishek Hr"`
  - The duplicate item had `assigner.name = "mealex517"`
- Meanwhile, `data.pagination.total` correctly reported `2`.

---

## 2. Root Cause Analysis

In the Dakshi HRMS PostgreSQL schema:
- A user account in `users` can have multiple profile records in `user_profiles`:
  1. An initial global/system registration record where `org_id IS NULL` (e.g. `display_name = "mealex517"`).
  2. An organization-scoped member profile where `org_id = :org_id` (e.g. `first_name = "Abhishek", last_name = "Hr", display_name = "Abhishek HR"`).
- The unique constraint on `user_profiles` is `(org_id, user_id)`.
- In `TaskService._getUserIncludes()`, the eager-loaded `UserProfile` association did not scope queries with `where: { org_id: orgId }`.
- When Sequelize executed the query:
  ```sql
  LEFT OUTER JOIN users AS assigner ON Task.assigner_id = assigner.id
  LEFT OUTER JOIN user_profiles AS profile ON assigner.id = profile.user_id
  ```
  PostgreSQL matched **both** profile rows for the assigner, producing a 1:2 cartesian row multiplication for every task delegator with an active org profile and legacy global profile.
- Sequelize's `findAndCountAll` executed `COUNT(DISTINCT Task.id)` (evaluating to 2), but hydrated `rows` from the duplicated SQL result set (evaluating to 4).

---

## 3. Engineering Fix

1. **Tenant-Scoped Profile Inclusion (`TaskService._getUserIncludes`):**
   - Updated `_getUserIncludes(orgId)` to explicitly attach `{ org_id: orgId }, required: false` to the `UserProfile` include.
   - Built distinct include objects for `assigner` and `assignee` to prevent Sequelize object-reference mutation collisions.
   - Passed `orgId` across all callers: `getTaskWithUsers`, `getMyTasks`, `getMyTaskDetail`, `getAssignedByMe`, `getTeamTasks`, `getManagerTaskDetail`, `getHrTasks`, and `getHrTaskDetail`.

2. **Task Comments & Audit Trail Hardening (`TaskCommentRepository` & `getHrTaskDetail`):**
   - Scoped `UserProfile` eager-loading to `org_id` in `TaskCommentRepository.findByIdAndOrgId` and `findByTaskId` to prevent duplicate discussion comments.
   - Scoped `audit_logs.actor.profile` in `getHrTaskDetail` to `org_id`.

3. **Defense-in-Depth Deduplication (`taskFormatter.formatPaginatedTasks`):**
   - Added task ID deduplication in `formatPaginatedTasks` to ensure that API responses will never emit repetitive task objects under any join multiplicity.

4. **Automated Regression Verification (`T-P2-16`):**
   - Added test `T-P2-16` in `tests/unit/task/task_phase2_service_and_api.test.js` validating that when an assigner has both an org-scoped profile and a global profile (`org_id IS NULL`), `getAssignedByMe` outputs each task strictly once, with the org-scoped profile name.
