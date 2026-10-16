# Feature-gated endpoints: DB outage now returns 503, not 403

**Date:** 2026-09-24
**Area:** Feature entitlement gate (`require_feature` middleware — affects every plan-gated endpoint, e.g. `leave.*`, `payroll.*`, `documents.*`)
**Type:** Error-status behavioural change (bug fix)

## What changed

The entitlement check (`entitlementService.hasFeature`) used to catch **every** error —
including a database that was unreachable — and return `false`. The middleware read that
`false` as "this org does not have the feature" and answered:

```
403 { "errorCode": "FEATURE_NOT_AVAILABLE",
      "message": "This feature is not available on your current subscription plan." }
```

So during a database outage the API told the user to **upgrade their plan**, and the incident
was hidden behind an ordinary 4xx that monitoring does not alert on.

Now, when the failure is a database connectivity error (Sequelize `SequelizeConnection*` /
socket `ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND`, `EHOSTUNREACH`, `ECONNRESET`), the same
check returns:

```
503 { "errorCode": "ENTITLEMENT_DEPENDENCY_FAILURE",
      "message": "Service temporarily unavailable. Please try again shortly." }
```

Any other unexpected error still fails closed to `403 FEATURE_NOT_AVAILABLE` (deny, do not
leak an entitlement). Genuine "no active subscription" / "feature disabled for plan" answers
are unchanged — still `403 FEATURE_NOT_AVAILABLE`.

## Frontend impact

- **On `503 ENTITLEMENT_DEPENDENCY_FAILURE`:** treat as a transient outage — show a
  "temporarily unavailable, please retry" message and allow retry. **Do not** route the user
  to billing/upgrade, and do not cache it as a "feature missing" state.
- **On `403 FEATURE_NOT_AVAILABLE`:** unchanged — the org genuinely lacks the feature; the
  upgrade/plan messaging still applies.
- Any client that currently maps `403 FEATURE_NOT_AVAILABLE` to "upgrade your plan" will no
  longer see that code fired for infrastructure failures, so the misleading upsell during
  outages disappears on its own.

## Not a config/infra fix

The reported `ETIMEDOUT` log meant the database was unreachable at the socket level (DB
down/paused, firewall, or wrong host) — an environment issue to resolve separately. This
change only stops that outage from being mis-reported as a plan limitation.

## Tests

`tests/unit/billing/entitlement_dependency_failure.test.js` — 503 on connection-error name and
on wrapped socket `ETIMEDOUT`/`ECONNREFUSED`; `false` preserved for non-connection errors and
for genuine no-subscription; happy path unchanged. 6/6 green.
