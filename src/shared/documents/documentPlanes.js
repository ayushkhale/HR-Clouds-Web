// ─────────────────────────────────────────────────────────────────────────────
// documents/documentPlanes.js — One adapter per audience, so the shared
// screens (list, detail, upload) ask "what can this viewer do?" instead of
// branching on role everywhere.
//
//   hr      — any employee; verify / reject / replace / delete / audit (#10–#22)
//   manager — direct reports only; view, recommend, upload for a report (#25–#33)
//   self    — own documents; upload / replace / delete (#34–#42)
//
// A capability that a plane lacks is `null`, and the UI hides the action.
// ─────────────────────────────────────────────────────────────────────────────

import { documentsAPI as api } from "../api";

export const DOCUMENT_PLANES = {
  hr: {
    key: "hr",
    list: (userId, params) => api.hrGetEmployeeDocuments(userId, params),
    get: api.hrGetDocument,
    versions: api.hrGetVersions,
    viewUrl: api.hrGetViewUrl,
    issue: (userId, payload) => api.hrIssueUpload(userId, payload),
    confirm: api.hrConfirmUpload,
    replace: api.hrReplaceDocument,
    remove: api.hrDeleteDocument,
    auditLogs: api.getDocumentAuditLogs,
    linkReference: api.hrLinkReference,
    verify: api.verifyDocument,
    reject: api.rejectDocument,
    recommend: null,
  },
  manager: {
    key: "manager",
    list: (userId, params) => api.managerGetEmployeeDocuments(userId, params),
    get: api.managerGetDocument,
    versions: null,
    viewUrl: api.managerGetViewUrl,
    issue: (userId, payload) => api.managerIssueUpload(userId, payload),
    confirm: api.managerConfirmUpload,
    replace: null,
    remove: null,
    auditLogs: null,
    linkReference: null,
    verify: null,
    reject: null,
    recommend: api.recommendDocument,
  },
  self: {
    key: "self",
    list: (_userId, params) => api.getMyDocuments(params),
    get: api.getMyDocument,
    versions: api.getMyVersions,
    viewUrl: api.myGetViewUrl,
    issue: (_userId, payload) => api.myIssueUpload(payload),
    confirm: api.myConfirmUpload,
    replace: api.myReplaceDocument,
    remove: api.myDeleteDocument,
    auditLogs: null,
    linkReference: null,
    verify: null,
    reject: null,
    recommend: null,
  },
};
