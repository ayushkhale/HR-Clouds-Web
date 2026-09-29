// ─────────────────────────────────────────────────────────────────────────────
// fieldHelpMeta.js — reads fieldHelp.json, the single source for the ⓘ help on
// confusing form fields *and* hard-to-read data (tile figures, table columns,
// statuses), plus the pre-written "Ask Maya" question behind each.
//
// Config v2 (2026-09-29): entries live under `surfaces`, each marked
// `kind: "form"` (something the user fills in) or `kind: "data"` (something they
// read). v1's `forms` key is gone on purpose — no dual path; a second shape is
// how configs rot. Both kinds share one entry shape and one lookup.
//
// Why it's built this way:
// • Keyed by a stable surface id + the API key (payload key for a form field,
//   response key for data), never the visible label — labels get reworded
//   (CLAUDE.md §6) and a label key would silently orphan the entry. A derived
//   figure with no API key gets a stable concept key, explained in the
//   surface's `description`.
// • Gated by workspace in config, not by file location: the self-service
//   screens and the shared primitives (DetailDialog, StatutoryBreakdown) mount
//   in all three workspaces, so who sees an entry can only be said here. An
//   entry on a component manager and HR share lists both (role parity), and
//   its hint is written so it reads right to each.
// • Anything missing — surface, field, workspace, hint — resolves to null and
//   the ⓘ is simply absent. That is what lets components wire every row by its
//   data key and leave the choice of which rows get help to the config.
// • Questions are static text on purpose. Maya is an external service that
//   can't see anyone's records, so questions are conceptual and never carry a
//   name, salary, balance or account number.
// ─────────────────────────────────────────────────────────────────────────────

import CONFIG from "./fieldHelp.json";

export const FIELD_HELP_WORKSPACES = ["employee", "manager", "hr", "guest"];
export const FIELD_HELP_KINDS = ["form", "data"];
export const HINT_MAX_LENGTH = 160;
// Maya's default `limits.maxQueryLength`; the widget also clamps to the live value.
export const QUESTION_MAX_LENGTH = 1000;

const isText = (v) => typeof v === "string" && v.trim().length > 0;

function workspacesOf(surface, field) {
  const list = Array.isArray(field?.workspaces) ? field.workspaces : surface?.workspaces;
  return Array.isArray(list) ? list : [];
}

/**
 * Help for one field or data point in one workspace.
 * @returns {{ hint: string, question: string | null } | null}
 */
export function getFieldHelp(surfaceId, fieldKey, workspace) {
  const surface = CONFIG?.surfaces?.[surfaceId];
  const field = surface?.fields?.[fieldKey];
  if (!field || !isText(field.hint) || !workspace) return null;
  if (!workspacesOf(surface, field).includes(workspace)) return null;
  const ask = field.askMaya;
  const question = ask?.enabled === true && isText(ask.question) && ask.question.length <= QUESTION_MAX_LENGTH
    ? ask.question.trim()
    : null;
  return { hint: field.hint.trim(), question };
}

// Dev-only sanity pass over the config. Warns, never throws — a typo in help
// text must not take a screen down. `import.meta.env.DEV` is a build-time
// constant, so production bundles drop this entirely.
function validateFieldHelp(config) {
  const warn = (msg) => console.warn(`[fieldHelp] ${msg}`);
  if (config?.forms) warn("`forms` is the v1 shape — move entries under `surfaces` with a `kind`.");
  const surfaces = config?.surfaces;
  if (!surfaces || typeof surfaces !== "object") {
    warn("fieldHelp.json has no `surfaces` object.");
    return;
  }
  Object.entries(surfaces).forEach(([surfaceId, surface]) => {
    const checkWorkspaces = (list, where) => {
      if (list === undefined) return;
      if (!Array.isArray(list)) { warn(`${where}: \`workspaces\` must be an array.`); return; }
      list.filter((w) => !FIELD_HELP_WORKSPACES.includes(w))
        .forEach((w) => warn(`${where}: unknown workspace "${w}".`));
    };
    if (surface?.kind === undefined) warn(`${surfaceId}: missing \`kind\` ("form" or "data").`);
    else if (!FIELD_HELP_KINDS.includes(surface.kind)) warn(`${surfaceId}: unknown kind "${surface.kind}".`);
    checkWorkspaces(surface?.workspaces, surfaceId);
    const fields = surface?.fields;
    if (!fields || typeof fields !== "object") { warn(`${surfaceId}: no \`fields\`.`); return; }
    Object.entries(fields).forEach(([fieldKey, field]) => {
      const where = `${surfaceId}.${fieldKey}`;
      checkWorkspaces(field?.workspaces, where);
      if (workspacesOf(surface, field).length === 0) warn(`${where}: no workspaces — it will never show.`);
      if (!isText(field?.hint)) warn(`${where}: missing \`hint\`.`);
      else if (field.hint.length > HINT_MAX_LENGTH) warn(`${where}: hint is ${field.hint.length} characters (keep it under ${HINT_MAX_LENGTH}).`);
      const ask = field?.askMaya;
      if (ask === undefined) return;
      if (ask?.enabled === true && !isText(ask.question)) warn(`${where}: askMaya is enabled but has no question.`);
      if (isText(ask?.question) && ask.question.length > QUESTION_MAX_LENGTH) warn(`${where}: question is over ${QUESTION_MAX_LENGTH} characters and will be hidden.`);
    });
  });
}

if (import.meta.env.DEV) validateFieldHelp(CONFIG);
