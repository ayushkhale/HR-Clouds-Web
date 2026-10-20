# CORS Header Fix & CI Deployment Resolution — Idempotency-Key

**Date:** 2026-10-12  
**Author:** Backend Engineering Team  
**Scope:** Global CORS Configuration & Deployment Pipeline  

---

## 1. Problem Statement

When the frontend application (`https://frontend.dev.hrclouds.in`) triggered a POST request to checkout endpoints such as:
`POST https://development.hrclouds.in/api/v1/billing/subscription/checkout`
with the header `Idempotency-Key` or `idempotency-key`, the request failed with the following browser CORS error:

```
Access to fetch at 'https://development.hrclouds.in/api/v1/billing/subscription/checkout' 
from origin 'https://frontend.dev.hrclouds.in' has been blocked by CORS policy: 
Request header field idempotency-key is not allowed by Access-Control-Allow-Headers in preflight response.
```

---

## 2. Root Cause Analysis

1. **Missing CORS Allowed Header**:
   In `src/app.js`, Express `cors` middleware previously had:
   ```javascript
   allowedHeaders: [
     'Content-Type', 'Authorization', 'If-Match', 'if-match', 
     'If-None-Match', 'if-none-match', 'X-Requested-With', 'X-Request-Id'
   ]
   ```
   Because `Idempotency-Key` / `idempotency-key` is required by financial and transactional endpoints (e.g., checkout and task creation), preflight `OPTIONS` requests sent by the browser were rejected.

2. **Blocked Deployment in GitHub Actions CI**:
   Although `Idempotency-Key` and `idempotency-key` were added to `allowedHeaders` in `src/app.js` in commit `33ffc34`, the change failed to deploy to `https://development.hrclouds.in` because GitHub Actions' `Test Gate` job failed:
   ```
   AssertionError: these seeders would duplicate rows on an automated re-run and are not listed in 00064-create-seeder-meta-table.js: 014-seed-task-feature.js
   ```
   The newly introduced seeder `014-seed-task-feature.js` used a non-idempotent `queryInterface.bulkInsert` instead of `INSERT ... ON CONFLICT DO NOTHING`, causing `tests/unit/system/deployment_config.test.js` to fail. As a result, the deployment job was aborted and the live development environment continued running the older Docker container.

---

## 3. Resolution Applied

1. **Configured Allowed Headers (`src/app.js`)**:
   - Explicitly allowed both `'Idempotency-Key'` and `'idempotency-key'` in `allowedHeaders`.

2. **Idempotent Seeder Upgrade (`014-seed-task-feature.js`)**:
   - Refactored `014-seed-task-feature.js` to utilize raw SQL transactions with `ON CONFLICT ("key") DO NOTHING` for `features` and `ON CONFLICT ("plan_id", "feature_id") DO NOTHING` for `plan_features`.
   - All 31 system deployment tests in `tests/unit/system/deployment_config.test.js` now pass cleanly.

3. **Automated Guard Test**:
   - Added an automated regression test in `tests/unit/system/deployment_config.test.js` asserting that `src/app.js` includes `Idempotency-Key` and `idempotency-key` in `allowedHeaders`.

---

## 4. Frontend Action Required

None. Once the latest commit is deployed to `https://development.hrclouds.in`, the preflight `OPTIONS` requests will return `Access-Control-Allow-Headers: ... Idempotency-Key, idempotency-key`, allowing all idempotent requests to succeed.
