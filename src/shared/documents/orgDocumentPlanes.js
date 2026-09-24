// ─────────────────────────────────────────────────────────────────────────────
// documents/orgDocumentPlanes.js — One adapter per audience for the ORG plane,
// so the shared list, form and detail ask "what can this viewer do?" instead of
// branching on role everywhere. Same idea as documentPlanes.js, different
// endpoints and a very different set of capabilities.
//
//   hr      — author, publish, replace, retire, decline, delete, roster
//             (#43–#61), and read one person's proof of acknowledging (#78)
//   manager — propose for one direct report and manage that draft; never
//             publishes, retires, declines or deletes (#62–#69, R-70)
//   self    — the inbox of what was issued to me (#70–#72), and acknowledging,
//             signing and my own receipt (#73–#75)
//
// Nobody can acknowledge or sign for someone else: those two exist on the self
// plane only.
//
// A capability the plane lacks is `null`, and the UI hides the action rather
// than offering a button the server would refuse.
// ─────────────────────────────────────────────────────────────────────────────

import { documentsAPI as api } from "../api";

export const ORG_PLANES = {
  hr: {
    key: "hr",
    typesKey: "hrOrg",
    list: (params) => api.getOrgDocuments(params),
    get: api.getOrgDocument,
    versions: api.getOrgVersions,
    groupVersions: api.getOrgGroupVersions,
    viewUrl: api.orgGetViewUrl,
    auditLogs: api.getOrgAuditLogs,

    create: (payload) => api.createOrgDocument(payload),
    update: api.updateOrgDocument,
    issueUpload: api.orgIssueUpload,
    confirm: api.orgConfirmUpload,

    publish: api.publishOrgDocument,
    replace: api.replaceOrgDocument,
    retire: api.retireOrgDocument,
    reject: api.rejectOrgDocument,
    remove: api.deleteOrgDocument,

    recipients: api.getOrgRecipients,
    syncRecipients: api.syncOrgRecipients,
    waiveRecipient: api.waiveOrgRecipient,
    recipientEvidence: api.getOrgRecipientEvidence,

    acknowledge: null,
    sign: null,
    myEvidence: null,
  },

  manager: {
    key: "manager",
    typesKey: "managerOrg",
    // A manager's list is only ever their own proposals.
    list: (params) => api.getMyProposals(params),
    get: api.getManagerProposal,
    versions: null,
    groupVersions: null,
    viewUrl: api.managerOrgGetViewUrl,
    auditLogs: null,

    create: (payload) => api.createManagerProposal(payload),
    update: api.updateManagerProposal,
    issueUpload: api.managerOrgIssueUpload,
    confirm: api.managerOrgConfirmUpload,

    // HR-only, every one of them (R-70, R-74).
    publish: null,
    replace: null,
    retire: null,
    reject: null,
    remove: null,

    recipients: null,
    syncRecipients: null,
    waiveRecipient: null,
    recipientEvidence: null,

    acknowledge: null,
    sign: null,
    myEvidence: null,
  },

  self: {
    key: "self",
    typesKey: null,
    // Rows here are recipient records with the document nested under `document`.
    list: (params) => api.getMyIssuedDocuments(params),
    get: api.getMyIssuedDocument,
    versions: null,
    groupVersions: null,
    // Opening the file is also what marks it read (#72), so this is never a
    // silent background call.
    viewUrl: api.myIssuedGetViewUrl,
    auditLogs: null,

    create: null,
    update: null,
    issueUpload: null,
    confirm: null,
    publish: null,
    replace: null,
    retire: null,
    reject: null,
    remove: null,
    recipients: null,
    syncRecipients: null,
    waiveRecipient: null,
    recipientEvidence: null,

    acknowledge: api.acknowledgeIssuedDocument,
    sign: api.signIssuedDocument,
    myEvidence: api.getMyIssuedEvidence,
  },
};
