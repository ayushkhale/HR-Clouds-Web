# Fix Record: Task Notification Action URL Frontend Origin Alignment

**Date:** 2026-10-17  
**Module:** Task Assignment (`task`) & Common Utilities (`email.utils`)  
**Scope:** Outbox email notification dispatch (`ACTION_URL` link generation)  

---

## 1. Problem Description

During task notification dispatch (such as `TASK_ASSIGNED`, `TASK_SUBMITTED`, `TASK_COMPLETED`, `TASK_REOPENED`, etc.), email notifications generated action links using a hardcoded domain:
- `https://app.hrclouds.in/tasks/{taskId}`
- `https://app.hrclouds.in/tasks`

Even though the environment variable `FRONTEND_URL` was configured (e.g. `FRONTEND_URL=https://frontend.dev.hrclouds.in`), it was ignored because the URL string was hardcoded directly in `task_notification.service.js` and had a hardcoded fallback in `email.utils.js`.

---

## 2. Root Cause

1. **[task_notification.service.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/services/task_notification.service.js#L102-L105)**:
   In `runNotificationDispatch()`, `emailData.ACTION_URL` was constructed as:
   ```javascript
   ACTION_URL: payload.task_id
     ? `https://app.hrclouds.in/tasks/${payload.task_id}`
     : 'https://app.hrclouds.in/tasks'
   ```
2. **[email.utils.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/email.utils.js#L426)**:
   The fallback template replacement also hardcoded `'https://app.hrclouds.in/tasks'`:
   ```javascript
   .replace(/{{ACTION_URL}}/g, data.ACTION_URL || 'https://app.hrclouds.in/tasks')
   ```

---

## 3. Resolution

The codebase contains a centralized utility [app_url.utils.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/app_url.utils.js) that resolves URLs with `process.env.FRONTEND_URL` precedence:

```javascript
const { buildFrontendUrl } = require('../../../common/utilities/app_url.utils')

ACTION_URL: payload.task_id
  ? buildFrontendUrl(`tasks/${payload.task_id}`)
  : buildFrontendUrl('tasks')
```

Both [task_notification.service.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/services/task_notification.service.js) and [email.utils.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/email.utils.js) now use `buildFrontendUrl(...)`.

### Resulting URL Generation
- **When `FRONTEND_URL=https://frontend.dev.hrclouds.in`:**  
  Generates `https://frontend.dev.hrclouds.in/tasks/9212ec2e-54b5-48b9-a7fd-d31ccd6b4cbc`
- **When `FRONTEND_URL` is omitted in production:**  
  Falls back cleanly to `frontendBaseUrl` in `default.json` or `https://hrclouds.in/tasks/...`.
