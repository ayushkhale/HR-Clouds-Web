// ─────────────────────────────────────────────────────────────────────────────
// hrms.api.js — HRMS endpoints (active endpoints only)
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

export const hrmsAPI = {
  /**
   * Transfer an employee to a new department
   * PUT /hr/users/:id/department-transfer
   * @param {string} id - The global user_id
   * @param {Object} payload - { role, new_department_id, new_manager_id, is_current_hod, is_new_hod, replacement_hod_id, old_dept_fallback_manager_id }
   */
  transferDepartment(id, payload) {
    return request(`/hr/users/${id}/department-transfer`, { method: "PUT", body: JSON.stringify(payload) });
  },
};
