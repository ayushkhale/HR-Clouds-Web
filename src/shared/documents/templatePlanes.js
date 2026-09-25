// ─────────────────────────────────────────────────────────────────────────────
// documents/templatePlanes.js — Two audiences for blank company forms, so the
// shared list and detail ask "what can this viewer do?" instead of branching on
// role.
//
//   hr   — the whole catalogue in every state, and the full lifecycle
//          (#99–#110)
//   self — published, visible forms only, and only to download (#111–#112).
//          Managers use this one too: a template holds no personal data, so
//          there is no team-scoped middle plane the way there is everywhere
//          else in this module.
//
// A capability a plane lacks is `null`, and the UI hides that action.
// ─────────────────────────────────────────────────────────────────────────────

import { documentsAPI as api } from "../api";

export const TEMPLATE_PLANES = {
  hr: {
    key: "hr",
    list: (params) => api.getTemplates(params),
    get: (id) => api.getTemplate(id),
    versions: (id) => api.getTemplateVersions(id),
    downloadUrl: (id) => api.getTemplateDownloadUrl(id),
    create: (payload) => api.createTemplate(payload),
    update: (id, payload) => api.updateTemplate(id, payload),
    issue: (id, payload) => api.templateIssueUpload(id, payload),
    confirm: (id) => api.templateConfirmUpload(id),
    publish: (id) => api.publishTemplate(id),
    replace: (id, payload) => api.replaceTemplate(id, payload),
    archive: (id, reason) => api.archiveTemplate(id, reason),
    remove: (id) => api.deleteTemplate(id),
    // Only HR's list accepts a status filter; the catalogue never discloses one.
    filtersByStatus: true,
  },
  self: {
    key: "self",
    list: (params) => api.getPublishedTemplates(params),
    get: null,
    versions: null,
    downloadUrl: (id) => api.getPublishedTemplateDownloadUrl(id),
    create: null,
    update: null,
    issue: null,
    confirm: null,
    publish: null,
    replace: null,
    archive: null,
    remove: null,
    filtersByStatus: false,
  },
};
