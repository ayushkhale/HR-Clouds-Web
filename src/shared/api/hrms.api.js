// ─────────────────────────────────────────────────────────────────────────────
// hrms.api.js — Legacy HRMS shim
//
// Department transfer now lives in organizationAPI.transferDepartment(), which
// targets the correct backend route (PUT /organizations/users/:id/department-transfer).
// This shim is kept only for backwards-compatibility with any older imports and
// delegates to the canonical implementation. Prefer organizationAPI directly.
// ─────────────────────────────────────────────────────────────────────────────

import { organizationAPI } from "./organization.api.js";

export const hrmsAPI = {
  /** @deprecated Use organizationAPI.transferDepartment(id, payload) instead. */
  transferDepartment(id, payload) {
    return organizationAPI.transferDepartment(id, payload);
  },
};
