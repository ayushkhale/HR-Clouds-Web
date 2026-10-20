# API Update: Statutory Config Rate Constraint Handling & Validation

**Date:** 2026-10-14  
**Author:** Principal Backend Engineer  
**Scope:** Payroll Statutory Settings (`PUT /api/v1/payroll/hr/statutory/config`, Settings Module S-5)

---

## 1. Context & Problem Statement

When updating statutory configurations via `PUT /api/v1/payroll/hr/statutory/config` or through the Settings Module adapter, clients could submit an update where `eps_rate` (Employee Pension Scheme rate) exceeded `pf_employer_rate` (Employer Provident Fund contribution rate), or partially update one rate without balancing the other.

Because the underlying PostgreSQL schema enforces:
```sql
CONSTRAINT "statutory_configs_eps_rate_check" CHECK ("eps_rate" <= "pf_employer_rate")
```
under Indian statutory PF rules (EPS is carved out of the employer's PF contribution and cannot legally or mathematically exceed it), the database rejected the row with a check constraint error. 

Previously, this uncaught database check constraint was treated as an unhandled 500 `INTERNAL_ERROR`.

---

## 2. Changes Implemented

1. **Joi Schema Validation:**
   - In `updateStatutoryConfigSchema`, added a cross-field check when both `eps_rate` and `pf_employer_rate` are provided in the payload:
   - Returns HTTP 400 Bad Request with `'eps_rate cannot exceed pf_employer_rate'`.

2. **Service-Level Effective Rate Validation:**
   - In `StatutoryConfigService.updateConfig`, the effective rates are evaluated under the pessimistic row lock before the database write is executed:
     - `effectivePfEmployerRate = patch.pf_employer_rate ?? before.pf_employer_rate`
     - `effectiveEpsRate = patch.eps_rate ?? before.eps_rate`
   - If `effectiveEpsRate > effectivePfEmployerRate`, throws an `AppError(400, "EPS rate (<eps_rate>%) cannot exceed employer PF contribution rate (<pf_employer_rate>%)", "STATUTORY_CONFIG_EPS_RATE_EXCEEDS_EMPLOYER_RATE")`.
   - Protects partial patches (e.g. updating `eps_rate` independently or lowering `pf_employer_rate` independently).

3. **Global Error Handler Defense:**
   - In `errorHandlerMiddleware`, mapped PostgreSQL check constraint errors (SQLSTATE `23514` or `SequelizeCheckConstraintError`) to HTTP 400 with `errorCode: "CHECK_CONSTRAINT_VIOLATION"` instead of returning a 500 `INTERNAL_ERROR`.

---

## 3. API Contract & Frontend Impact

### Endpoint:
`PUT /api/v1/payroll/hr/statutory/config`

### Error Response Example (400 Bad Request):
```json
{
  "success": false,
  "message": "EPS rate (15%) cannot exceed employer PF contribution rate (12%)",
  "errorCode": "STATUTORY_CONFIG_EPS_RATE_EXCEEDS_EMPLOYER_RATE"
}
```

### Recommendation for Frontend UI:
- On the Statutory Configuration / PF settings page:
  - Add client-side validation ensuring `eps_rate <= pf_employer_rate`.
  - When the employer PF rate is modified, ensure the EPS rate does not exceed it.
