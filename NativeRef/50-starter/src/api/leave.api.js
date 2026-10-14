// ─────────────────────────────────────────────────────────────────────────────
// api/leave.api.js — SELF-SERVICE LEAVE ONLY.
//
// No /leaves/templates, /leaves/assignments or /leaves/team/* — those are HR
// and manager planes. Holidays for the leave calendar come from
// attendanceAPI.getUpcomingHolidays(), not from a leave endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';
import { qs, seg } from './attendance.api';

export const leaveAPI = {
  /**
   * Active leave types tailored to the caller's per-user config — the source
   * for the Apply form's type picker, including each type's rules (half-day
   * allowed, document threshold, demographic restrictions).
   */
  getMyLeaveTypes: () => request('/leaves/my-leave-types'),

  /** The balance wallet. @param {number|null} year — defaults to the current calendar year. */
  getMyBalances: (year = null) => request(`/leaves/my-balances${qs({ year })}`),

  /**
   * UNPAGINATED — the caller's whole history, created_at DESC. For a
   * long-serving employee that can be hundreds of rows, so use a windowed
   * FlatList. Adding a `page` param would be silently stripped.
   */
  getMyRequests: () => request('/leaves/my-requests'),

  /** One request, which must belong to the caller. */
  getLeaveRequest: (id) => request(`/leaves/requests/${seg(id)}`),

  /**
   * Submit a leave application. The backend auto-handles holidays, weekends,
   * the sandwich rule and unpaid days — TAKE THE DAY COUNT FROM THE RESPONSE,
   * never compute it.
   *
   * Two ways to attach evidence, and only ONE of them per request:
   *   `document_url`  a link the applicant pasted, stored as given
   *   `document_id`   a document of theirs already in the portal. The server
   *                   checks it belongs to them and is evidence-grade
   *                   (`available` or `pending_verification`), then stores the
   *                   relative path `/api/v1/documents/attachments/:id/view-url`
   *                   into `document_url`.
   *
   * THAT PATH IS NOT A URL A CLIENT CAN FOLLOW. Every screen showing a leave
   * attachment must go through documentsAPI.getAttachmentViewUrl().
   *
   * @param {{
   *   leave_type_id: string,
   *   start_date: string, end_date: string,     // literal YYYY-MM-DD, no timezone
   *   is_half_day?: boolean,
   *   half_day_type?: 'first_half'|'second_half',
   *   reason?: string,
   *   document_url?: string, document_id?: string,
   * }} payload
   */
  submitRequest: (payload) =>
    request('/leaves/request', { method: 'POST', body: JSON.stringify(payload) }),

  /**
   * No body. THE BACKEND DECIDES BY DATE, NOT STATUS:
   *   • leave entirely in the future → cancelled immediately, balance refunded
   *   • leave that has started       → `cancellation_pending`, needs a manager
   *
   * Nothing in the request says which. Read `response.message` for
   * "pending manager approval" and show the matching toast — and word the
   * CONFIRM correctly beforehand (lib/dates has what you need).
   */
  cancelRequest: (id) => request(`/leaves/requests/${seg(id)}/cancel`, { method: 'POST' }),
};

export default leaveAPI;
