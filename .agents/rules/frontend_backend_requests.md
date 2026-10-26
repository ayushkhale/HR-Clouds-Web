---
trigger: always_on
glob:
description: Protocol for frontend engineering when backend changes or API enhancements are required
---

# Frontend Rule: Backend API Enhancement & Tracking Protocol

When working specifically on frontend features, bug fixes, or screen implementations in the HR Clouds web application:

1. **Frontend-First Unblocking**:
   - If a bug, filter discrepancy, or UX issue can be solved or cleanly mitigated on the frontend without waiting for the backend, implement and verify the frontend fix immediately.
   - Maintain UI consistency, adhere strictly to the purple design system (`uirule.md`), and ensure production builds succeed without regressions.

2. **Unified Backend Requests Tracking**:
   - Do NOT create disparate or isolated scratch files when discovering API gaps, missing query parameters, unhandled enum states, or needed backend enhancements.
   - All backend change requests MUST be appended to the single centralized file:
     `public/ref docs/md_updates/frontend_requests_to_backend.md`
   - This ensures the team can hand over one comprehensive, organized document directly to the backend team at once.

3. **Standard Specification Structure**:
   Every backend request added to `public/ref docs/md_updates/frontend_requests_to_backend.md` must follow the standardized structure:
   - **Request ID & Title** (e.g., `REQ-[MODULE]-[NUMBER]: [Title]`)
   - **Target API & Route** (HTTP Method, Endpoint, and Controller/Service reference from `api_registry.md`)
   - **Business Problem & Rationale** (Why the change is needed and what real-world user flow it unblocks)
   - **Exact Backend Technical Changes** (Parameters, SQL/filter predicates, payload shape, validation rules)
   - **Frontend Developer Hint & Context** (Document the exact UI bug/behavior observed, the temporary frontend workaround applied, and step-by-step instructions for the frontend developer who will integrate the API once delivered)
