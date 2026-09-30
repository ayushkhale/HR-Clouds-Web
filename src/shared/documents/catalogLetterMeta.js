// ─────────────────────────────────────────────────────────────────────────────
// documents/catalogLetterMeta.js — Which catalog document types HR Clouds can
// write for you: the ones backed by a letter template (an HTML layout the
// server renders into a branded PDF — PDF Generation Phase 1/2, #135/#139).
//
// Why this exists: before a letter can be issued, the document type it is
// filed under has to be activated (#139 → 409 DOCUMENT_TYPE_NOT_ACTIVATED).
// The catalog holds 50-odd types and only a handful have a template, so HR
// needs to find those to switch them on (Document Types › Catalog filter).
//
// CONTRACT GAP — the pairing is inferred, not read. Neither the catalog row
// (#1) nor the template list (#135) says which document type a template files
// into; the server keeps that map in its own template registry. The catalog
// does follow one convention for everything the company issues, and it is
// what this matches on (checked against the seeded codes in
// md_updates/2026-09-28_document_catalog_url_and_filters_guidance.md §4):
//   template `experience_letter` ↔ catalog `experience_letter_issued` (plane org)
// Also accepted: the same code without the suffix, or the same title once
// "(Issued)" is dropped. Only `plane: "org"` rows qualify — the server refuses
// an employee-plane type for a letter (422 DOCUMENT_TYPE_PLANE_MISMATCH), so
// `experience_letter` (what a new joiner uploads from a past job) never matches.
// If the backend adds the code to either payload, read it here and drop the
// inference — this file is the one place that decides.
// ─────────────────────────────────────────────────────────────────────────────

const stripIssued = (code) => String(code || "").trim().toLowerCase().replace(/_issued$/, "");
const plainTitle = (name) => String(name || "").trim().toLowerCase().replace(/\s*\(issued\)\s*$/, "").replace(/\s+/g, " ");

/**
 * @param {object[]} templates  #135 `data.templates`
 * @returns {(row: object) => object|null}  the letter template behind a catalog row, or null
 */
export function letterTemplateMatcher(templates) {
  const byCode = new Map();
  const byTitle = new Map();
  for (const t of Array.isArray(templates) ? templates : []) {
    // An orphaned config points at a template the server no longer ships.
    if (!t?.code || t.is_orphaned || t.current_version == null) continue;
    byCode.set(stripIssued(t.code), t);
    if (t.title) byTitle.set(plainTitle(t.title), t);
  }
  return (row) => {
    if (!row || row.plane !== "org") return null;
    return byCode.get(stripIssued(row.code)) || byTitle.get(plainTitle(row.name)) || null;
  };
}
