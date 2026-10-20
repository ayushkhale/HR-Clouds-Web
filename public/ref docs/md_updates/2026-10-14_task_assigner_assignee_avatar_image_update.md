# API Update: Task Assigner and Assignee Profile Image Support

**Date:** 2026-10-14  
**Author:** Senior Backend Software Engineer  
**Modules Affected:** Task Assignment Module (`src/modules/task/`)  
**Endpoints Affected:**
- `GET /api/v1/tasks/me` (#249)
- `GET /api/v1/tasks/me/:id` (#250)
- `GET /api/v1/tasks/manager/assigned-by-me` (#256)
- `GET /api/v1/tasks/manager/team-tasks` (#257)
- `GET /api/v1/tasks/manager/:id` (#258)
- `GET /api/v1/tasks/hr` (#266)
- `GET /api/v1/tasks/hr/:id` (#267)
- `GET /api/v1/tasks/:id/comments` (#254)
- All Task Mutation Responses (`POST /api/v1/tasks`, `PATCH /status`, `POST /reassign`, etc.)

---

## 1. Requirement & Summary

In task lists, details, and comment threads, frontend user interfaces require the profile picture of both the `assigner` and the `assignee` (as well as comment authors).

Previously, the task response DTO only included `id`, `name`, and `email` for `assigner` and `assignee`:
```json
"assigner": {
    "id": "71639be3-1a97-4408-8bac-5b8039336755",
    "name": "Abhishek Hr",
    "email": "mealex517@gmail.com"
},
"assignee": {
    "id": "d686e926-4152-466d-a827-b2d9d9ac103f",
    "name": "Aditya Patidar",
    "email": "aditya@gmail.com"
}
```

This update enhances the DTO to provide both `avatar_url` (standard HRMS field containing a secure, short-lived presigned S3 URL or external URL) and `profile_image` (alias pointing to the exact same URL):

```json
"assigner": {
    "id": "71639be3-1a97-4408-8bac-5b8039336755",
    "name": "Abhishek Hr",
    "email": "mealex517@gmail.com",
    "avatar_url": "https://<bucket>.s3.<region>.amazonaws.com/org/.../avatars/...?X-Amz-Signature=...",
    "profile_image": "https://<bucket>.s3.<region>.amazonaws.com/org/.../avatars/...?X-Amz-Signature=..."
},
"assignee": {
    "id": "d686e926-4152-466d-a827-b2d9d9ac103f",
    "name": "Aditya Patidar",
    "email": "aditya@gmail.com",
    "avatar_url": null,
    "profile_image": null
}
```

---

## 2. Technical Implementation Details

1. **Hydration & Query Attributes:**
   - Updated `TaskService._getUserIncludes(orgId)` to query `['first_name', 'last_name', 'display_name', 'avatar_url', 'avatar_storage_key']` from `UserProfile`.
   - Updated `TaskCommentRepository` to include `avatar_url` and `avatar_storage_key` for comment authors.
   - Updated `getHrTaskDetail` actor profile attributes.

2. **Private S3 Storage Key Resolution:**
   - Implemented `TaskService._resolveTaskAvatars(tasks)` and `TaskCommentService._resolveCommentAvatars(comments)`.
   - Uploaded avatars stored in private S3 buckets (`avatar_storage_key`) are dynamically resolved into short-lived presigned URLs via `resolveAvatarSrc` (with memory caching per unique key to eliminate duplicate presigning overhead).
   - If an external URL (such as Google OAuth avatar) is present in `avatar_url` without a storage key, it passes through directly.
   - If no avatar exists, both fields cleanly fall back to `null`.
   - Fail-open safety ensures task reads never fail even if storage presigning errors occur.

3. **DTO Formatting & Parity:**
   - Updated `taskFormatter.formatUserSummary(user)` in `src/modules/task/utils/task_formatter.utils.js`:
     ```javascript
     const avatarUrl = profile.avatar_url || null
     return {
       id: plain.id,
       name: fullName || profile.display_name || plain.identifier || 'Unknown User',
       email: plain.identifier || null,
       avatar_url: avatarUrl,
       profile_image: avatarUrl
     }
     ```
   - Updated `TaskCommentService._formatCommentDto(comment)` in `src/modules/task/services/task_comment.service.js` to provide `avatar`, `avatar_url`, and `profile_image` on comment authors.

4. **Backward Compatibility:**
   - Existing fields (`id`, `name`, `email`) remain identical.
   - Adding `avatar_url` and `profile_image` is purely additive.
