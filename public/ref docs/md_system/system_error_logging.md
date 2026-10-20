# System Error Logging Architecture & Developer Guide

## 1. Problem Solved
In production, staging, and development environments, intermittent server crashes (HTTP 500 unhandled errors) are notoriously difficult to diagnose after the fact. Standard application logs (stdout, PM2, Docker container logs) present several operational challenges:
* **Log Rotation & Retention Loss:** High-volume access logs cause terminal/container logs to rotate or purge quickly. Finding a bug that occurred 3 days ago at a specific event often becomes impossible.
* **Missing Context:** Console logs usually capture only a generic message or truncated stack trace without the incoming request state (URL, query parameters, route params, sanitized request body, actor user ID, tenant organization ID).
* **Painful Reproduction:** Without knowing the exact payload and user state that triggered the failure, reproducing edge cases requires guesswork.

---

## 2. Solution: The Developer Error Ledger
We introduced a lightweight, append-only database ledger table: `system_error_logs`. 

Whenever an unhandled server error occurs (`status_code >= 500`), the system automatically snapshots the incident into PostgreSQL. Developers can easily query this table using SQL to pinpoint bugs, inspect stack traces, and view the exact input payloads that caused the failure.

---

## 3. How It Works at the Code Level

The feature follows our modular architecture under `src/common` and hooks into the existing error pipeline with minimal footprint:

```
src/
├── infrastructure/
│   └── postgres-sql/
│       ├── migrations/00074-create-system-error-logs.js      # Table definition & indexes
│       └── models.index.js                                  # Auto-loads common/models
├── common/
│   ├── models/system_error_logs.model.js                    # Sequelize model
│   ├── repositories/system_error_log.repository.js          # Direct DB insert layer
│   ├── utilities/system_error_sanitizer.utils.js            # Size bounds & credential redaction
│   ├── services/system_error_logger.service.js              # Safe extraction & non-blocking dispatch
│   └── middlewares/error.middleware.js                      # Single-line hook for >= 500 errors
```

### Detailed Component Workflow

1. **Single-Point Middleware Trigger:**
   * In [error.middleware.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/middlewares/error.middleware.js), when an error reaches the centralized handler and `statusCode >= 500`, it invokes `systemErrorLoggerService.logError(...)`.
   * Client errors (400, 401, 403, 404, 422) bypass the logger completely to prevent database bloat.

2. **Non-Blocking Background Execution (Fire-and-Forget):**
   * [system_error_logger.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/services/system_error_logger.service.js) delegates the database write to `setImmediate`.
   * The HTTP response is sent back to the client immediately without waiting for database persistence.

3. **Size Bounds & Anti-Bloat Guards:**
   * [system_error_sanitizer.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/system_error_sanitizer.utils.js) ensures individual fields do not store thousands of lines:
     * **Stack Traces:** Capped at **50 lines** and **8,000 characters**.
     * **Error Messages:** Capped at **2,000 characters** (prevents raw SQL/buffer dump bloat).
     * **URL Paths:** Capped at **2,048 characters**.
     * **Arrays:** Bulk upload arrays are truncated to the **first 20 items** with a marker (`[TRUNCATED: +X more items]`).
     * **Strings:** Individual string values longer than **500 characters** are truncated.
     * **Payload Ceiling:** Overall serialized JSON size is restricted to **25 KB** per column.

4. **Security & Credential Redaction:**
   * Recursively sanitizes request bodies, query params, and headers.
   * Keys matching sensitive patterns (`password`, `token`, `secret`, `authorization`, `cookie`, `otp`, `card`, `cvv`, `pan`, `aadhaar`, `account_number`) are replaced with `'[REDACTED]'`.
   * Circular object structures are safely handled via `WeakSet` tracking to prevent runtime serialization exceptions.

5. **Standalone Database Persistence:**
   * [system_error_log.repository.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/repositories/system_error_log.repository.js) performs an independent `create` query.
   * It does not inherit the calling route's Sequelize transaction, ensuring error logs persist even when the surrounding business transaction fails or rolls back.

---

## 4. Impact on Main System & Undisturbed Design

To ensure this developer feature never disrupts core business operations or introduces regressions, we applied the following engineering guarantees:

1. **Zero Latency Impact:** Because logging executes on the next event loop tick via `setImmediate`, the client's HTTP response time remains 100% unaffected.
2. **Absolute Fault Tolerance:** The background logger wraps persistence in a comprehensive `try/catch`. If PostgreSQL is offline, down for maintenance, or full, the logger catches the rejection and logs a fallback warning to `console.error`. The main server and active requests never crash.
3. **Loose Entity Coupling (No Foreign Key Locks):** The `user_id` and `org_id` columns are stored as standalone UUIDs without hard database foreign key constraints. This guarantees logging will never fail due to invalid, deleted, or unauthenticated IDs.
4. **Minimal Code Modification:** Only **1 line of code** was added to the main request pipeline ([error.middleware.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/middlewares/error.middleware.js)). No existing controllers, services, repositories, or routes were modified.

---

## 5. Developer Debugging SQL Queries

When investigating a bug, developers can run queries directly against `system_error_logs`:

### 1. View all 500 errors from the last 3 days
```sql
SELECT id, created_at, environment, method, url_path, error_code, message, user_id, org_id
FROM system_error_logs
WHERE status_code >= 500
  AND created_at >= NOW() - INTERVAL '3 days'
ORDER BY created_at DESC;
```

### 2. Inspect the full payload and stack trace for a specific failure
```sql
SELECT url_path, request_body, request_query, request_params, headers, stack_trace
FROM system_error_logs
WHERE id = '<log-uuid>';
```

### 3. Filter errors by specific module or endpoint
```sql
SELECT created_at, message, url_path, controller_function, stack_trace
FROM system_error_logs
WHERE url_path LIKE '%/api/v1/payroll%'
ORDER BY created_at DESC
LIMIT 25;
```

### 4. Find all crashes experienced by a specific tenant organization
```sql
SELECT created_at, status_code, message, url_path, user_id, stack_trace
FROM system_error_logs
WHERE org_id = '<organization-uuid>'
ORDER BY created_at DESC;
```
