// ─────────────────────────────────────────────────────────────────────────────
// documents/requestPlanes.js — One adapter per audience for Phase 4, so the
// shared request list, checklist panel and dialogs ask "what can this viewer
// do?" instead of branching on role.
//
//   hr      — anyone in the organisation; raise, cancel, remind, bulk-raise
//             from a checklist (#80–#86)
//   manager — direct reports only; raise (policy permitting) and cancel what
//             they raised themselves (#93–#96)
//   self    — the caller's own rows, read-only. Requests are answered by
//             uploading the document, not by touching the request (#97–#98)
//
// A capability a plane lacks is `null`, and the UI hides that action rather
// than offering something the server will refuse.
//
// `showsReminders` / `showsLastReminder` mirror the server's projection: HR
// gets both cadence fields, a manager gets the count only, the person gets
// neither. A withheld field must not render as "N/A", so the columns are gated
// on these rather than on the value being present.
// ─────────────────────────────────────────────────────────────────────────────

import { documentsAPI as api } from "../api";

export const REQUEST_PLANES = {
  hr: {
    key: "hr",
    list: (params) => api.getDocumentRequests(params),
    get: api.getDocumentRequest,
    create: (userId, payload) => api.createDocumentRequest(userId, payload),
    bulkFromChecklist: (userId) => api.bulkRequestFromChecklist(userId),
    cancel: (id, reason) => api.cancelDocumentRequest(id, reason),
    remind: (id) => api.remindDocumentRequest(id),
    checklist: (userId) => api.getEmployeeChecklist(userId),
    showsReminders: true,
    showsLastReminder: true,
    // HR may cancel anything in the organisation, including a manager's request.
    canCancelOthers: true,
  },
  manager: {
    key: "manager",
    list: (params) => api.getManagerDocumentRequests(params),
    // There is no manager detail read: the list row is the whole object, and a
    // request outside the reporting line answers a uniform 404 anyway.
    get: null,
    create: (userId, payload) => api.managerCreateDocumentRequest(userId, payload),
    bulkFromChecklist: null,
    cancel: (id, reason) => api.managerCancelDocumentRequest(id, reason),
    remind: null,
    checklist: (userId) => api.getManagerChecklist(userId),
    showsReminders: true,
    showsLastReminder: false,
    // A manager may only cancel a request they raised themselves; anything else
    // is a 404. The row's `requested_by` is checked before the button is shown.
    canCancelOthers: false,
  },
  self: {
    key: "self",
    list: (params) => api.getMyDocumentRequests(params),
    get: null,
    create: null,
    bulkFromChecklist: null,
    cancel: null,
    remind: null,
    checklist: () => api.getMyChecklist(),
    showsReminders: false,
    showsLastReminder: false,
    canCancelOthers: false,
  },
};
