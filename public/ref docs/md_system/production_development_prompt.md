# Production Development Prompt Library

Universal prompts for AI-assisted backend, API, database, service, integration, and module development.

## How to use

Before asking the AI to change code, provide the relevant requirements, codebase paths, existing implementation, architecture/reference files, database schema, API contracts, and implementation plan.

**Engineering priority:** correctness → security → data integrity → reliability → maintainability → testing/observability → performance/scalability.

**Global rule:** inspect the existing codebase first. Reuse established patterns. Do not invent, rewrite, or refactor unrelated code unless required.

---

## 1. Build an API

**Use when:** Creating or significantly changing any API.

```text
Implement this API as a Senior/Principal Backend Engineer.

First inspect the existing codebase and follow its established architecture, class structure, layering, validation, database access, authentication, authorization, response format, centralized error handling, logging, and testing conventions. Reuse existing utilities and patterns instead of introducing new ones.

Implement only what the requirements need. Do not invent fields, business rules, abstractions, or endpoints. Preserve existing behavior outside the requested change.

Before finalizing, verify input validation, authorization/tenant isolation, database integrity, transaction boundaries, concurrency/race conditions, retries/idempotency where relevant, consistent errors/responses, and failure handling.

Test mentally and, where possible, with automated tests: invalid input, missing records, duplicates, concurrent requests, stale data, retries, database failures, and unexpected states.

Keep the implementation simple and production-safe. Add comments only for non-obvious business logic.
```

---

## 2. Build a GET API

**Use when:** Creating a read, list, search, or detail API.

```text
Implement this GET API using the existing project architecture and conventions.

Verify authentication, authorization, tenant isolation, parameter validation, filtering, searching, sorting, pagination, date/time handling, and the standard response/error structure.

Handle invalid or missing parameters, nonexistent resources, empty results, ambiguous/duplicate data, stale data, large datasets, and database failures.

Check query efficiency: avoid N+1 queries and unnecessary joins/data loading, select only required fields, and use appropriate indexes/pagination.

Do not invent behavior or change unrelated APIs. Before finalizing, review correctness, security, edge cases, performance, and failure handling, and add focused tests for important paths.
```

---

## 3. Build a Create API

**Use when:** Creating a new resource or record.

```text
Implement this create API using the existing architecture and conventions.

Validate every input and enforce business rules, authorization, tenant isolation, uniqueness, database constraints, and required relationships.

Make the operation transaction-safe where multiple writes must succeed together. Protect against duplicate submissions, retries, race conditions, and concurrent creation; use database constraints as the final integrity boundary.

Handle missing related records, invalid states, duplicate requests, constraint violations, and partial failures without leaving inconsistent data.

Return the existing standard success/error structure through centralized error handling. Add focused tests for validation, duplicates, concurrency-sensitive paths, and transaction failure scenarios.
```

---

## 4. Build an Update API

**Use when:** Updating an existing resource.

```text
Implement this update API using the existing architecture and conventions.

Verify authorization/ownership, tenant isolation, input validation, immutable fields, relationship integrity, allowed state transitions, and concurrent-update behavior.

Prevent updates to nonexistent or stale resources, accidental overwrites, duplicate/replayed requests, invalid transitions, and partial database updates. Use transactions or optimistic/pessimistic locking only where the data model requires them.

Preserve the existing API contract and centralized error structure. Do not change unrelated behavior.

Add tests for invalid input, missing resources, stale/concurrent updates, authorization failures, and important business-rule boundaries.
```

---

## 5. Build a Delete API

**Use when:** Deleting, deactivating, archiving, or retiring a resource.

```text
Implement this delete/deactivation operation according to the existing data model and business rules.

First determine whether the resource must be hard-deleted, soft-deleted, archived, or transitioned to another state. Do not choose based on convention alone.

Check authorization, tenant isolation, foreign keys, active dependencies, historical/audit data, cascading effects, concurrent operations, and data-retention requirements.

Make retries safe where appropriate and clearly handle nonexistent/already-deleted resources, protected resources, active dependencies, and database failures.

Preserve data integrity and the standard response/error structure. Add tests for dependency conflicts, repeated deletion, authorization, concurrency, and rollback/failure scenarios.
```

---

## 6. Review Generated Code

**Use when:** AI has generated or modified code and you need a deep review.

```text
Perform a strict production-level review of the recently generated code as a Senior/Principal Backend Engineer. Do not assume it is correct.

Trace the actual execution flow and check for bugs, logical errors, edge cases, race conditions, security/authorization issues, tenant isolation failures, data-integrity problems, transaction/rollback issues, retry/idempotency problems, validation gaps, incorrect API/database usage, error-handling failures, performance problems, and maintainability issues.

Mentally test invalid input, missing data, duplicates, boundary values, concurrent requests, stale data, retries, partial failures, dependency failures, and unexpected states.

Compare the code with the requirements and existing architecture. Do not recommend rewrites or generic improvements unless they solve a real problem.

For each real issue report:
Severity → File/Location → Problem → Impact → Concrete Fix.

Only call the code production-ready after the review passes.
```

---

## 7. Audit an Entire Module

**Use when:** A feature/module is implemented and all related folders must be checked.

```text
Perform a complete end-to-end production audit of this module across all relevant folders and files. Do not review only recently changed code.

Trace the full flow across routes/controllers, services, repositories, models, migrations, DTOs/validators, middleware, utilities, jobs/events, integrations, and tests.

Compare the implementation with the requirements, approved implementation plan, existing architecture, and API contracts.

Check functional completeness, dependencies, security, authorization, tenant isolation, business rules, data integrity, transactions, concurrency, idempotency, centralized error handling, failure recovery, performance, maintainability, observability, and documentation.

Find missing or partially implemented behavior, broken dependencies, duplicated logic, inconsistent contracts, and edge cases.

For each real issue report:
Severity → File/Location → Problem → Impact → Concrete Fix.

Do not certify the module until the complete workflow has been independently verified.
```

---

## 8. Check Code Against the Implementation Plan

**Use when:** Code has been implemented from an approved plan.

```text
Audit the implementation against the approved implementation plan and requirements.

Trace every planned feature, API, business rule, validation, database change, integration, and workflow to the actual code.

Identify missing, partial, incorrect, unnecessary, or conflicting implementation; API/DB contract mismatches; security and authorization gaps; data-integrity or concurrency risks; and unhandled edge cases.

Do not assume the plan was implemented correctly. Do not treat the plan as more authoritative than the actual requirements or existing architecture when they conflict; flag the conflict instead.

Produce a requirement-by-requirement audit with:
Status → Evidence/File → Issue → Impact → Concrete Fix.
```

---

## 9. Create an Implementation Plan

**Use when:** Requirements are available but implementation has not started.

```text
Analyze the requirements, existing codebase, architecture, database/schema, API conventions, dependencies, and reference files as a Senior/Principal Backend Engineer.

Create a production-ready implementation plan covering:
- Scope and acceptance criteria
- Business rules and state transitions
- Architecture and component boundaries
- Database/schema/migrations and constraints
- APIs and contracts
- Validation/authentication/authorization/tenant isolation
- Transactions, concurrency, and idempotency
- Error handling and failure recovery
- External integrations, events, and side effects
- Edge cases and security risks
- Testing strategy
- Observability/logging/metrics where relevant
- Dependencies and safe implementation order
- Rollback or migration considerations where relevant

Reuse existing patterns. Avoid unnecessary abstractions or rewrites.

Explicitly flag assumptions, ambiguities, conflicts, and risks. Do not write implementation code.
```

---

## 10. Validate an Implementation Plan

**Use when:** An implementation plan already exists.

```text
Strictly review this implementation plan against the requirements, existing codebase, architecture, database model, API conventions, and previously implemented functionality.

Find missing requirements, incorrect assumptions, business-logic gaps, security/authorization issues, data-integrity risks, concurrency problems, API inconsistencies, unnecessary complexity, unsafe migrations, incomplete failure handling, and conflicts with existing behavior.

Verify that the plan is complete, internally consistent, technically correct, testable, and realistically implementable.

Correct the plan where necessary, then provide the safest execution order and verification steps.

Do not write implementation code.
```

---

## 11. Final Plan Gate

**Use when:** The plan is about to enter implementation.

```text
Perform a final technical gate review of this implementation plan.

Look specifically for missing requirements, flawed logic, edge cases, security/data-integrity risks, concurrency issues, incorrect assumptions, API/DB contract problems, migration risks, architectural conflicts, and incomplete workflows.

Verify every planned change is necessary, consistent with the existing codebase, and safely implementable.

Report only real issues with exact corrections. If no blocking issues remain, explicitly confirm that the plan is ready for implementation and list the key verification points to enforce during development.
```

---

## 12. Follow Existing Architecture

**Use when:** AI is introducing patterns inconsistent with the project.

```text
Follow the existing codebase architecture and conventions strictly.

Inspect neighboring modules before coding and reuse established patterns for classes/services/controllers, repositories, DTOs/validators, dependency injection, database access, middleware, error handling, naming, file organization, logging, and tests.

If the project uses class-based structures, preserve them. Do not introduce function-based architecture, a new framework pattern, or a new abstraction unless the existing codebase clearly requires it.

Avoid duplicated utilities, speculative abstractions, unnecessary refactoring, and unrelated changes.

Keep comments minimal and limited to non-obvious business logic or important technical decisions.

The new code should behave and look like a natural continuation of the existing system.
```

---

## 13. Audit Centralized Error Handling

**Use when:** Verifying that every API uses the same error architecture.

```text
Audit the entire backend for centralized error handling.

First identify the project's actual error middleware, error classes, propagation pattern, and standard error-response schema. Then trace representative and exceptional paths through routes/controllers, services, repositories, middleware, utilities, and APIs.

Verify that every API reaches the centralized handler and returns the same required error structure. Find local try/catch responses, swallowed errors, inconsistent status/error codes, different response shapes, incorrect error transformation/propagation, and sensitive information leakage.

Check that expected business errors, validation errors, authorization failures, not-found errors, conflicts, and unexpected server errors are mapped consistently.

Produce a file-by-file audit and a concrete implementation plan to fix violations. Do not modify code yet.
```

---

## 14. Check API Response Changes

**Use when:** Middleware, serializers, controllers, or backend changes may have changed API responses.

```text
Audit whether the recent changes altered any existing API response contract.

Compare:
actual implementation ↔ API registry/contracts ↔ existing documentation ↔ frontend usage.

Check success and error responses, status codes, field names/types, nesting, nullability, pagination metadata, and error structures.

For every difference, determine whether it is intentional and required or an accidental breaking change.

If the API change is correct, update the affected Markdown/API documentation. If it is accidental, fix the API instead.

Create an `md_updates` Markdown file describing every frontend-impacting change:
Endpoint → Old behavior → New behavior → Impact → Required frontend action.

Keep code, contracts, documentation, and frontend expectations synchronized.
```

---

## 15. Generate API Documentation

**Use when:** APIs are implemented and need reliable documentation.

```text
Analyze the actual implementation and generate API documentation for every endpoint.

For each API document:
- Purpose and business reason
- Caller, workflow, and dependencies
- HTTP method/endpoint
- Authentication, authorization, roles, and tenant isolation
- Headers/path/query/body parameters
- Every request field: type, required/optional, validation, defaults, constraints, allowed values
- Success response and every response field
- Realistic request/response examples
- Status/error codes and failure scenarios
- Backend business rules
- Database/state changes
- Transactions/concurrency/idempotency where relevant
- Side effects and integrations
- Pagination/filtering/sorting/date behavior
- State transitions and edge cases
- Frontend implications

Verify every detail against the actual code. Never invent endpoints, fields, validations, error codes, or responses. Explicitly flag code/documentation mismatches and missing APIs.
```

---

## 16. Analyze API Workflows

**Use when:** Multiple APIs form one business workflow.

```text
Analyze all APIs for this feature and map the complete end-to-end workflow.

For each API identify:
Purpose → Caller/role → Preconditions → Inputs → Dependencies → State/data changes → Success outcome → Failure outcome → Side effects.

Determine the correct execution order and identify missing, redundant, unsafe, incorrectly designed, or impossible-to-use APIs.

Check state transitions, authorization, transactions, concurrency, retries/idempotency, partial failures, and stale data.

Produce a workflow another developer can implement without inspecting the backend source for basic integration decisions.
```

---

## 17. Review Database and Transactions

**Use when:** A feature writes related data or depends on transactional consistency.

```text
Review this implementation specifically for database integrity and transaction safety.

Analyze transaction boundaries, commit/rollback behavior, locking, isolation level, race conditions, lost updates, duplicate writes, unique constraints, foreign keys, referential integrity, partial failures, deadlocks, retries, idempotency, and concurrent requests.

Trace every write and determine what happens if any operation fails midway.

Simulate important concurrent scenarios and verify that the final database state remains valid.

Distinguish problems that require application logic from those that should be enforced by database constraints.

Report concrete risks and fixes; do not recommend transactions or locks where they are unnecessary.
```

---

## 18. Security Review

**Use when:** Reviewing APIs, services, authentication, authorization, or data access.

```text
Perform a production security review of this implementation.

Trace requests from authentication through authorization, validation, business logic, database access, and response generation.

Check authentication, authorization, BOLA/IDOR, tenant isolation, privilege escalation, mass assignment, injection, unsafe deserialization/input handling, sensitive-data exposure, error leakage, insecure file handling, replay/duplicate requests, rate limiting where relevant, and access-control gaps.

Verify that security checks occur at the correct trust boundary and cannot be bypassed through alternate endpoints or direct identifiers.

Focus on realistically exploitable issues in this implementation, not generic security advice.

For each finding report:
Severity → Attack/Failure Path → Impact → Concrete Fix.
```

---

## 19. Review Performance and Scalability

**Use when:** A feature handles significant traffic or data.

```text
Review this implementation for realistic production performance and scalability.

Inspect database query count, N+1 queries, indexes, query plans where available, result-set size, pagination, joins/data loading, memory usage, CPU-heavy work, synchronous blocking operations, cache usage, queues/background work, connection usage, and concurrency behavior.

Identify bottlenecks under realistic traffic and data volume rather than optimizing prematurely.

Prioritize correctness and simplicity. For each optimization, explain the measurable problem it addresses and its trade-offs. Do not introduce caching, queues, or abstractions without a concrete need.
```

---

## 20. Review Failure and Resilience

**Use when:** A feature depends on databases, queues, external services, storage, or background jobs.

```text
Perform a failure-mode review of this feature.

Trace behavior when databases fail, transactions roll back, external services timeout or return errors, requests are retried, duplicate requests arrive, processes crash mid-operation, queue messages are duplicated/out of order, jobs partially complete, data is stale/missing, or concurrent operations occur.

Identify data loss, inconsistent state, duplicate side effects, silent failures, stuck workflows, and unrecoverable states.

For each real risk, recommend the smallest appropriate fix using transactions, timeouts, retries with bounded backoff, idempotency, deduplication, compensation, dead-letter handling, or recovery mechanisms where applicable.

Do not add resilience mechanisms blindly; match them to the actual failure mode.
```

---

## 21. Integrate APIs Into Frontend

**Use when:** Building a working frontend reference against real backend APIs.

```text
Integrate the actual backend APIs into the existing frontend/dashboard structure as a working reference implementation.

First inspect the existing pages, components, UI conventions, API registry, documentation, authentication flow, and real API contracts.

Map each API to the correct user role and business workflow. Use only actual endpoints, fields, status codes, and response structures.

Implement the required forms, tables, filters, confirmations, navigation, loading/empty/success/error/validation/authorization states, and relevant state transitions.

Trace every workflow:
UI action → request → API → response/error → UI state.

Do not create mock endpoints or invent backend behavior. Keep unrelated UI unchanged unless needed for the workflow. Use standard, maintainable UI patterns and ensure the reference can exercise the real APIs end-to-end.
```

---

## 22. Audit Frontend API Integration

**Use when:** Backend APIs are connected to frontend pages.

```text
Perform a final end-to-end audit of the frontend/API integration.

Verify every API call against the actual backend contract: endpoint, method, headers/authentication, request fields, response fields, status/error handling, permissions, validation, state transitions, pagination, and date/time behavior.

Test or trace loading, empty, success, validation, authorization, failure, duplicate-submission, stale-data, and retry scenarios.

Follow each workflow from UI action → request → backend → response → UI state.

Find broken calls, incorrect assumptions, missing workflows, wrong fields, stale documentation, and inconsistent UI behavior.

Provide concrete fixes and do not mark the integration ready until each supported workflow can be exercised successfully.
```

---

## 23. Synchronize Documentation

**Use when:** Code, API docs, registries, or frontend contracts may have drifted.

```text
Audit synchronization between:
actual code ↔ API contracts ↔ API registry ↔ documentation ↔ frontend integration.

Compare endpoints, HTTP methods, request/response fields, types, status/error codes, authentication/roles, validation, and business rules.

Treat the actual implementation as the source of truth for documenting current behavior, but do not silently preserve an incorrect implementation: determine whether each discrepancy is an intentional requirement or a bug and flag it.

Produce a mismatch report with:
Artifact → Difference → Impact → Corrective Action.

Update documentation only when the implementation is correct; otherwise fix the implementation first.
```

---

## 24. Review a Refactoring

**Use when:** Cleaning up code without intentionally changing behavior.

```text
Review this refactoring with behavioral compatibility as the primary requirement.

Compare before/after behavior for API contracts, business rules, authorization, database operations, transaction semantics, error structures, side effects, state transitions, and observable behavior.

Look for hidden regressions, changed concurrency semantics, new coupling, duplicated logic, unnecessary abstractions, performance regressions, and accidental scope expansion.

Keep the refactoring focused. Do not change unrelated behavior or architecture unless the change is necessary to preserve correctness or remove a demonstrated production risk.

Recommend concrete corrections and focused regression tests.
```

---

## 25. Final Module Readiness

**Use when:** A complete module is considered finished.

```text
Perform an independent production-readiness audit of the entire module.

Review all relevant code, APIs, database changes, migrations, middleware, utilities, jobs/events, integrations, tests, and documentation.

Verify functional completeness, requirements, business rules, API contracts, authentication/authorization, tenant isolation, data integrity, transactions, concurrency, idempotency, centralized error handling, failure recovery, security, maintainability, observability, performance, scalability, and frontend integration where applicable.

Compare the implementation with the approved plan and actual requirements. Do not rely on previous AI reviews; independently trace the critical workflows and failure paths.

For every real issue report:
Severity → File/Location → Problem → Impact → Concrete Fix.

Only certify production readiness when no blocking correctness, security, reliability, or data-integrity issues remain.
```

---

# Recommended Workflow

For any module:

**1. Plan** → Create an Implementation Plan  
**2. Validate** → Validate Plan + Final Plan Gate  
**3. Implement** → Build API/feature + Follow Existing Architecture  
**4. Review** → Review Generated Code  
**5. Audit** → Module Audit + Security + Database + Failure + Performance reviews  
**6. Verify** → Check Code Against Implementation Plan  
**7. Document** → Generate API Docs + Synchronize Documentation  
**8. Integrate** → Frontend Integration + Frontend Audit  
**9. Final Gate** → Final Module Readiness

---

# Quick Prompts

## Final Code Check

```text
Perform a final strict production review of this code. Do not assume it is correct. Focus on bugs, logical errors, edge cases, race conditions, security, authorization, data integrity, transactions, retries/idempotency, validation, error handling, and failure scenarios. Test invalid input, missing data, duplicates, concurrency, stale data, partial failures, and unexpected states. Verify the existing architecture and requirements. Report each real issue as Severity → Location → Problem → Impact → Fix. Do not mark it production-ready until the review passes.
```

## Final Plan Check

```text
Re-check this implementation plan against the requirements, existing architecture, database model, dependencies, and previous implementation. Find missing requirements, technical errors, incorrect assumptions, edge cases, security/data-integrity risks, concurrency issues, migration risks, and architectural conflicts. Correct real problems and confirm whether the plan is ready for implementation.
```

## API Check

```text
Review this API for production correctness. Verify authentication, authorization, validation, tenant isolation, database integrity, transactions, concurrency, idempotency, response/error consistency, centralized error handling, performance, and edge cases. Test duplicates, missing data, invalid input, retries, concurrent requests, stale data, and dependency/database failures. Report concrete issues and fixes.
```

## Architecture Check

```text
Review this implementation against the existing architecture and neighboring modules. Identify inconsistent patterns, unnecessary abstractions, duplicated logic, incorrect layering, class/function-structure violations, coupling, and unrelated changes. Recommend the smallest production-safe correction that preserves existing behavior.
```

---

# Final Production Checklist

Before accepting generated backend code:

- Requirements fully implemented?
- Existing architecture and conventions followed?
- No unnecessary rewrite or abstraction?
- Inputs validated?
- Authentication and authorization correct?
- Tenant/resource isolation enforced?
- Business rules enforced at the correct layer?
- Database constraints and relationships correct?
- Transaction boundaries correct?
- Concurrent requests safe?
- Retries and duplicates safe?
- API response/error contract unchanged unless intentionally changed?
- Centralized error handling used?
- Sensitive information protected?
- Edge cases and boundary values handled?
- Date/time/timezone behavior correct?
- External failures handled?
- Large datasets and query patterns reasonable?
- Tests cover critical paths and failure cases?
- Logging/metrics/tracing adequate for important operations?
- Documentation matches actual behavior?
- Frontend integration matches the real contract?
- No unrelated behavior broken?

---

# Final Principle

Use AI as an engineering assistant, not an authority.

**Inspect → Plan → Validate → Implement → Test → Review → Audit → Document → Integrate → Final Gate**

A feature is not production-ready because it compiles, passes the happy path, or looks clean. It is production-ready only when its **correctness, security, data integrity, failure behavior, and compatibility with the existing system have been verified.**
