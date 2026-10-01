// ─────────────────────────────────────────────────────────────────────────────
// documents/templateMeta.js — Blank company forms (Phase 5, #99–#112): their
// four states, what each one allows, and the words for them.
//
// A template is the opposite of every other document in this module. An
// employee document is about one person; an org document is addressed to
// specific people; a template is a form nobody has filled in yet. It carries no
// personal data at all, which is why the catalogue is the same for everyone in
// the organisation — there is nothing in it to scope.
//
// The version rule is the one thing worth holding on to: a group
// (`template_group_id`) may have many versions but only ever ONE published. So
// "Publish a new version" is the safe way to update a form — the moment v2 goes
// live, v1 stops being downloadable and employees cannot get last year's sheet
// by accident. Nothing has to be withdrawn by hand.
// ─────────────────────────────────────────────────────────────────────────────

import { humanizeCode } from "./documentMeta";

/**
 * The four template states. `short` is the badge, `label` the sentence form,
 * `hint` the tooltip that says who can see it.
 */
export const TEMPLATE_STATUS = {
  draft: {
    label: "Draft",
    short: "Draft",
    tone: "slate",
    hint: "Only your HR team can see this. Employees see nothing until you publish it.",
  },
  published: {
    label: "Published",
    short: "Live",
    tone: "emerald",
    hint: "This is the live version. Everyone in the organisation can download it.",
  },
  superseded: {
    label: "Replaced",
    short: "Replaced",
    tone: "blue",
    hint: "A newer version took its place. Kept for your records; employees can't download it.",
  },
  archived: {
    label: "Retired",
    short: "Retired",
    tone: "slate",
    hint: "Withdrawn from the catalogue. Kept for your records; employees can't download it.",
  },
};

export const templateStatusMeta = (status) =>
  TEMPLATE_STATUS[status] || { label: humanizeCode(status) || "N/A", short: humanizeCode(status) || "N/A", tone: "slate", hint: "" };

/** The HR list filter (#107). "" means every status. */
export const TEMPLATE_STATUS_FILTERS = [
  { value: "", label: "All forms" },
  { value: "published", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "superseded", label: "Replaced" },
  { value: "archived", label: "Retired" },
];

// ── Field limits, straight from the validator ───────────────────────────────
export const TEMPLATE_TITLE_MAX = 255;
export const TEMPLATE_DESCRIPTION_MAX = 2000;
export const TEMPLATE_REFERENCE_URL_MAX = 2048;
export const TEMPLATE_ARCHIVE_REASON_MAX = 500;

export const TEMPLATE_BACKENDS = [
  {
    value: "s3",
    label: "Upload a file",
    blurb: "A PDF, Word or Excel file kept in this portal. Employees download it with one click.",
  },
  {
    value: "reference",
    label: "Link somewhere else",
    blurb: "A secure https link to a government portal or your intranet. Nothing is stored here, so the link must keep working.",
  },
];

export const isReferenceTemplate = (t) => t?.storage_backend === "reference";

/** Where the form lives, in one phrase. The list and the detail both use it. */
export const templateStorageLine = (t) =>
  isReferenceTemplate(t) ? "Links to a page elsewhere" : "A file kept in this portal";

/**
 * Does this template have something to download? The server computes
 * `has_file`; this falls back to the raw fields for a row that predates it.
 */
export const hasTemplateFile = (t) =>
  t?.has_file ?? (isReferenceTemplate(t) ? !!t?.reference_url : !!t?.confirmed_at);

// ── What each state allows (#100, #103–#106) ────────────────────────────────
export const isTemplateDraft = (t) => t?.status === "draft";
export const canEditTemplate = (t) => isTemplateDraft(t);
export const canDeleteTemplate = (t) => isTemplateDraft(t);
export const canPublishTemplate = (t) => isTemplateDraft(t) && hasTemplateFile(t);
export const canReplaceTemplate = (t) => t?.status === "published";
export const canArchiveTemplate = (t) => t?.status === "published";
/** A superseded or archived version can still be downloaded by HR (#110). */
export const canDownloadTemplate = (t) => hasTemplateFile(t);

/** Why Publish is unavailable, in the words the button's tooltip wants. */
export function templatePublishBlocker(t) {
  if (!isTemplateDraft(t)) return "Only a draft can be published.";
  if (isReferenceTemplate(t)) return t?.reference_url ? "" : "Add the link first.";
  return hasTemplateFile(t) ? "" : "Upload the form file first.";
}

/**
 * The sentence under a draft that says what is left to do. Returned rather
 * than rendered, so both the card and the detail dialog say the same thing.
 */
export function templateNextStep(t) {
  if (!isTemplateDraft(t)) return "";
  const blocker = templatePublishBlocker(t);
  if (blocker) return `${blocker} Nobody can see this form until it's published.`;
  return "Ready to publish. Until you do, nobody outside HR can see it.";
}

/** "Version 3 of 4" for the detail header, or "" when the chain isn't loaded. */
export function versionLabel(template, chain) {
  const version = Number(template?.version);
  if (!Number.isFinite(version)) return "";
  const total = Array.isArray(chain) ? chain.length : 0;
  return total > 1 ? `Version ${version} of ${total}` : `Version ${version}`;
}

// ── Response shapes ─────────────────────────────────────────────────────────
/** #107 / #111 → `{ rows, total }`. */
export function templateListOf(res) {
  const data = res?.data ?? res ?? {};
  const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : [];
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : rows.length;
  return { rows, total };
}

/** #108 / #100 / #102 / #103 / #105 → the template row itself. */
export const templateOf = (res) => res?.data ?? res ?? null;

/** #109 → the version chain, newest version first. */
export function templateVersionsOf(res) {
  const data = res?.data ?? res ?? [];
  const rows = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : [];
  return [...rows].sort((a, b) => (Number(b?.version) || 0) - (Number(a?.version) || 0));
}

/**
 * #99 / #104 → `{ template, upload_url, upload_expires_at, required_headers }`.
 * Normalised into the shape `uploadDocument()` already understands, so the
 * template upload reuses the same issue → PUT → confirm helper as everything
 * else rather than growing its own.
 */
export function templateTicketOf(res) {
  const data = res?.data ?? res ?? {};
  const template = data.template ?? data;
  return {
    template,
    document_id: template?.id ?? null,
    upload_url: data.upload_url ?? null,
    expires_at: data.upload_expires_at ?? null,
    required_headers: data.required_headers ?? null,
  };
}

/** #110 / #112 → `{ url, expires_at, file_name }`. */
export const templateDownloadOf = (res) => res?.data ?? res ?? {};
