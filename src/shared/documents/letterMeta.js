// ─────────────────────────────────────────────────────────────────────────────
// letterMeta.js — Everything the letterhead and letter-template screens know
// about the domain: field labels and their limits, the two image caps, the
// organisation-profile fallbacks, the catalog state machine, and the plain
// wording for each standard letter. PDF Generation Phase 1 (#130–#138).
//
// Source of truth: public/ref docs/md_pdfs/combined_api_analysis-7.md and
// md_pdfs/2026-09-27_pdf-generation-phase1-letter-branding-and-templates.md.
//
// Three contract facts shape almost every rule below, and each one has bitten
// somebody's first attempt:
//
//   1. Every branding text field is validated `^[^<>]*$` server-side, because
//      the value is interpolated into HTML the renderer compiles. So `<` and `>`
//      are refused everywhere — including inside an address line — and the same
//      check runs here so a wrong character never costs a round trip.
//   2. `accent_color_hex` is NOT NULL in the database, so "" does not clear it
//      the way "" clears every other field. VERIFIED LIVE 2026-09-27, and worse
//      than the spec says: the spec claims an empty colour is "ignored", but the
//      server answers 400 for both `""` ("not allowed to be empty") and `null`
//      ("must be a string"). So never sending an empty colour is load-bearing,
//      not merely tidy — the form never offers to clear it and `brandingChanges`
//      only emits the key when it holds a real `#RRGGBB`.
//
//   2a. LIVE DEVIATION, and the one that cost real data in testing: #131 is
//      documented as a partial update, and it is — EXCEPT for
//      `registered_address_lines`. Omit that key and the server writes its Joi
//      default `[]`, erasing a saved address. Confirmed on 2026-09-27: setting a
//      3-line address and then PUTting `{"contact_phone":"…"}` alone left the
//      address empty, while every other omitted field survived untouched. So the
//      address is ALWAYS sent — see `brandingPayload()`, which is what the save
//      must use. `letterhead_enabled` was tested the same way and is safe.
//   3. The per-organisation defaults a template accepts are described by the
//      server (#136 `template.fields`), NOT by this file. An unknown key is a
//      400 rather than being dropped, so the config form is built from that
//      descriptor and this file holds no field list of its own. What it does
//      hold is the layman explanation of each standard letter, which the API
//      has no place for.
// ─────────────────────────────────────────────────────────────────────────────

import { NUMBER_FIELD_MIN } from "./letterFieldMatrix";
import { formatBytes, humanizeCode } from "./documentMeta";

// ── Reading the replies ──────────────────────────────────────────────────────
const payload = (res) => res?.data ?? res ?? {};

/**
 * #130 / #131 / #133 all answer the same three-part record. `branding` is what
 * HR typed, `inherited` the same facts as they stand on the organisation
 * profile, `assets` the two images (present / absent, plus short-lived URLs when
 * they were asked for).
 */
export function brandingOf(res) {
  const data = payload(res);
  const branding = data.branding || {};
  return {
    branding: {
      ...branding,
      registered_address_lines: Array.isArray(branding.registered_address_lines) ? branding.registered_address_lines : [],
    },
    inherited: data.inherited || {},
    assets: data.assets || {},
  };
}

/** #135 → the catalog rows. */
export function letterTemplatesOf(res) {
  const rows = payload(res).templates;
  return Array.isArray(rows) ? rows : [];
}

/** #136 → `{ template, config }`; `config` is null until this org has saved anything. */
export function letterTemplateOf(res) {
  const data = payload(res);
  const template = data.template || {};
  return {
    template: {
      ...template,
      fields: Array.isArray(template.fields) ? template.fields : [],
      required_fields: Array.isArray(template.required_fields) ? template.required_fields : [],
      optional_fields: Array.isArray(template.optional_fields) ? template.optional_fields : [],
      sample_data: template.sample_data || {},
    },
    config: data.config || null,
  };
}

/** #137 → the stored config. */
export const letterConfigOf = (res) => payload(res).config || null;

// ── The two branding images ──────────────────────────────────────────────────
/** PNG and JPEG only. Vector files are refused outright — they can carry script. */
export const LETTER_ASSET_CONTENT_TYPES = ["image/png", "image/jpeg"];

export const LETTER_ASSETS = [
  {
    key: "logo",
    label: "Company logo",
    maxBytes: 512 * 1024,
    blurb: "Printed at the top of every letter.",
  },
  {
    key: "signature",
    label: "Signatory’s signature",
    maxBytes: 256 * 1024,
    blurb: "Printed above the signatory’s name.",
  },
];

export const letterAssetMeta = (key) => LETTER_ASSETS.find((a) => a.key === key) || LETTER_ASSETS[0];

/** "PNG or JPEG · up to 512 KB" — the same sentence under both upload boxes. */
export const letterAssetLimitLine = (key) => `PNG or JPEG · up to ${formatBytes(letterAssetMeta(key).maxBytes)}`;

/** What the record says about one image: present, its format and its size. */
export function letterAssetState(branding, key) {
  const present = !!branding?.[`${key}_present`];
  return {
    present,
    contentType: branding?.[`${key}_content_type`] || "",
    sizeBytes: Number(branding?.[`${key}_size_bytes`]) || 0,
    line: present
      ? [branding?.[`${key}_content_type`]?.split("/").pop()?.toUpperCase(), formatBytes(branding?.[`${key}_size_bytes`])]
        .filter((part) => part && part !== "N/A").join(" · ")
      : "",
  };
}

// ── The letterhead text fields ───────────────────────────────────────────────
// `inherits` names the key on `inherited` (the organisation profile) that a
// blank field falls back to, which is what makes the "Use this" shortcuts and
// the grey fallback lines honest rather than decorative.
const NO_BRACKETS = /^[^<>]*$/;

export const BRANDING_GROUPS = [
  {
    id: "signatory",
    title: "Who signs your letters",
    blurb: "Printed under the signature. Change it when the person who signs changes.",
    fields: [
      { key: "signatory_name", label: "Full name", max: 120, placeholder: "Priya Nair", help: "As it should appear in print." },
      { key: "signatory_designation", label: "Job title", max: 120, placeholder: "Vice President — People & Culture" },
    ],
  },
  {
    id: "identifiers",
    title: "Company registration numbers",
    blurb: "Printed along the foot of the letter. A wrong one can send a letter back.",
    fields: [
      { key: "cin", label: "CIN", max: 32, placeholder: "U72900KA2021PTC987654", help: "Company Identification Number." },
      { key: "gstin", label: "GSTIN", max: 32, placeholder: "29XYZAB5678C1Z2", inherits: "gst_number" },
      { key: "pan", label: "Company PAN", max: 32, placeholder: "XYZAB5678C", inherits: "company_pan_number" },
      { key: "tan", label: "TAN", max: 32, placeholder: "BLRZ56789C", help: "Used when you deduct tax at source." },
    ],
  },
  {
    id: "contact",
    title: "How people reach you",
    blurb: "Where whoever receives a letter writes back to check it.",
    fields: [
      { key: "contact_email", label: "Email address", max: 150, type: "email", placeholder: "people@yourcompany.com" },
      { key: "contact_phone", label: "Phone number", max: 30, placeholder: "+91 80 6111 2222", inherits: "phone_number" },
      { key: "website", label: "Website", max: 255, type: "url", placeholder: "https://www.yourcompany.com", inherits: "website", help: "Must start with https://." },
    ],
  },
  {
    id: "footer",
    title: "Closing note",
    blurb: "One line at the bottom of the page.",
    fields: [
      {
        key: "footer_note", label: "Footer line", max: 300, multiline: true,
        placeholder: "This is a computer-generated letter and needs no wet signature.",
      },
    ],
  },
];

/** Every editable text key, in the order the form shows them. */
export const BRANDING_TEXT_KEYS = BRANDING_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

const BRANDING_FIELD_INDEX = Object.fromEntries(BRANDING_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f])));
export const brandingField = (key) => BRANDING_FIELD_INDEX[key] || { key, label: humanizeCode(key), max: 120 };

/** A registered address prints at most five lines — more would push the header off the page. */
export const ADDRESS_LINE_LIMIT = 5;
export const ADDRESS_LINE_MAX = 120;

export const ACCENT_DEFAULT = "#1F2937";
const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * A small set of accent colours that sit inside the product's own palette, so a
 * letterhead set up in two clicks still looks like it belongs to the same
 * company as the app. Any hex is accepted — these are a starting point, not a
 * restriction, because a brand colour is the company's to choose.
 */
export const ACCENT_SUGGESTIONS = [
  { hex: "#6D28D9", name: "Purple" },
  { hex: "#4338CA", name: "Indigo" },
  { hex: "#A21CAF", name: "Magenta" },
  { hex: "#1F2937", name: "Charcoal" },
  { hex: "#0F766E", name: "Deep teal" },
  { hex: "#9F1239", name: "Claret" },
];

/** Why this value can't be saved, or "" when it can. Mirrors the server's rules. */
export function brandingFieldProblem(key, value) {
  const text = String(value ?? "");
  if (!text) return "";
  const field = brandingField(key);
  if (!NO_BRACKETS.test(text)) return "Less-than and greater-than signs can’t be used here.";
  if (text.length > field.max) return `Keep this under ${field.max} characters.`;
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return "Enter a complete email address.";
  if (field.type === "url" && !/^https:\/\/\S+$/i.test(text)) return "Enter a secure address that starts with https://.";
  return "";
}

/** Why this address line can't be saved, or "". */
export function addressLineProblem(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (!NO_BRACKETS.test(text)) return "Less-than and greater-than signs can’t be used here.";
  if (text.length > ADDRESS_LINE_MAX) return `Keep each line under ${ADDRESS_LINE_MAX} characters.`;
  return "";
}

/**
 * Everything wrong with the form, keyed the way the inputs are (`address_2` for
 * the third line). An empty object means it can be saved.
 */
export function brandingProblems(form) {
  const out = {};
  BRANDING_TEXT_KEYS.forEach((key) => {
    const problem = brandingFieldProblem(key, form?.[key]);
    if (problem) out[key] = problem;
  });
  (form?.registered_address_lines || []).forEach((line, index) => {
    const problem = addressLineProblem(line);
    if (problem) out[`address_${index}`] = problem;
  });
  if (!HEX.test(String(form?.accent_color_hex || ""))) {
    out.accent_color_hex = "Enter a six-digit colour code like #6D28D9.";
  }
  return out;
}

/** A saved record → the shape the form edits. */
export function brandingToForm(branding) {
  const lines = Array.isArray(branding?.registered_address_lines) ? branding.registered_address_lines : [];
  return {
    ...Object.fromEntries(BRANDING_TEXT_KEYS.map((key) => [key, branding?.[key] ?? ""])),
    // One empty line to type into, so an unset address doesn't need a click first.
    registered_address_lines: lines.length ? [...lines] : [""],
    accent_color_hex: HEX.test(String(branding?.accent_color_hex || "")) ? branding.accent_color_hex : ACCENT_DEFAULT,
    letterhead_enabled: branding?.letterhead_enabled !== false,
  };
}

const sameLines = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);

/** The address as the server stores it: trimmed, blank lines dropped, capped at five. */
export const addressPayload = (form) =>
  (form?.registered_address_lines || []).map((line) => String(line).trim()).filter(Boolean).slice(0, ADDRESS_LINE_LIMIT);

/**
 * Only what changed, in the shape #131 wants.
 *
 * A field the person emptied is sent as `""`, which is how the server clears it
 * — but `accent_color_hex` is never sent empty, because the column can't hold
 * null and the server would ignore it anyway. The address is sent whole (it is
 * one column), trimmed and with blank lines dropped, exactly as the server
 * stores it — so the comparison is against the cleaned list, or an untouched
 * form with a trailing empty line would look changed for ever.
 */
export function brandingChanges(form, saved) {
  const out = {};
  BRANDING_TEXT_KEYS.forEach((key) => {
    const next = String(form?.[key] ?? "").trim();
    const before = String(saved?.[key] ?? "");
    if (next !== before) out[key] = next;
  });

  const lines = addressPayload(form);
  const savedLines = Array.isArray(saved?.registered_address_lines) ? saved.registered_address_lines : [];
  if (!sameLines(lines, savedLines)) out.registered_address_lines = lines;

  const accent = String(form?.accent_color_hex || "");
  if (HEX.test(accent) && accent.toUpperCase() !== String(saved?.accent_color_hex || "").toUpperCase()) {
    out.accent_color_hex = accent;
  }

  const enabled = form?.letterhead_enabled !== false;
  if (enabled !== (saved?.letterhead_enabled !== false)) out.letterhead_enabled = enabled;

  return out;
}

/**
 * The body to send to #131 — the diff, plus the registered address whether or
 * not it changed.
 *
 * Kept separate from `brandingChanges()` on purpose: the diff is what decides
 * whether the Save bar appears, and folding an always-present key into it would
 * leave the form looking permanently unsaved. This is the payload; that is the
 * dirtiness. See deviation 2a in the header for why the address can't be left
 * out of a partial update.
 */
export function brandingPayload(form, saved) {
  return { ...brandingChanges(form, saved), registered_address_lines: addressPayload(form) };
}

/**
 * What the organisation profile holds for a field, for the grey line under an
 * empty box. Left blank, that is what a letter falls back to — so it is worth
 * showing rather than making somebody re-type it.
 */
export function inheritedValue(key, inherited) {
  const field = brandingField(key);
  return field.inherits ? String(inherited?.[field.inherits] || "").trim() : "";
}

/** The profile's address as letterhead lines, for the "Use profile address" shortcut. */
export function inheritedAddressLines(inherited) {
  const town = [inherited?.city, inherited?.state, inherited?.zip_code].map((p) => String(p || "").trim()).filter(Boolean).join(" ");
  return [inherited?.address_line_1, inherited?.address_line_2, town, inherited?.country]
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .slice(0, ADDRESS_LINE_LIMIT);
}

/**
 * What is still missing before letters look finished. Not one of these blocks
 * saving or previewing — a letterhead is legitimately allowed to be sparse, and
 * an organisation printing onto its own pre-printed paper wants most of it empty
 * — so this drives a checklist, never an error.
 */
export function letterheadGaps(branding, inherited) {
  if (branding?.letterhead_enabled === false) return [];
  const address = (branding?.registered_address_lines || []).filter(Boolean).length || inheritedAddressLines(inherited).length;
  return [
    !branding?.signatory_name && "the name of whoever signs",
    !branding?.signatory_designation && "that person’s job title",
    !address && "a registered address",
    !branding?.logo_present && "your logo",
    !branding?.signature_present && "a signature image",
  ].filter(Boolean);
}

/** Has anything at all been typed, or is this still a fresh row? */
export const brandingIsConfigured = (branding) =>
  BRANDING_TEXT_KEYS.some((key) => String(branding?.[key] || "").trim()) ||
  (branding?.registered_address_lines || []).some(Boolean) ||
  !!branding?.logo_present ||
  !!branding?.signature_present;

// ── The letter catalog ───────────────────────────────────────────────────────
/**
 * What each standard letter is FOR, in the words of the person asking for one.
 * The API sends a title and a field schema but no explanation, and "Bonafide
 * Letter" means nothing to most people until you say "for a bank or a visa".
 *
 * An unknown code is not a problem: the title carries, and the purpose line is
 * simply left out rather than guessed at. A later release adding a letter must
 * not need a frontend change to be usable. The fifteen of registry version 1
 * are all described (see letterFieldMatrix.js for their fields).
 */
export const LETTER_PURPOSE = {
  experience_letter: {
    purpose: "Confirms what somebody did here and for how long, for whoever employs them next.",
    audience: "Issued when somebody leaves.",
  },
  appointment_letter: {
    purpose: "The formal offer: the job, the start date and the full pay breakdown.",
    audience: "Issued when somebody joins.",
  },
  bonafide_letter: {
    purpose: "Confirms that somebody works here right now — what a bank, a landlord or an embassy asks for.",
    audience: "Issued on request, usually for a loan, a visa or a passport.",
  },
  relieving_letter: {
    purpose: "Confirms somebody has been released from their job and owes nothing more to the company.",
    audience: "Issued on their last working day.",
  },
  confirmation_letter: {
    purpose: "Confirms somebody’s job is permanent now that their wait after joining is over.",
    audience: "Issued when the wait after joining ends.",
  },
  warning_letter: {
    purpose: "Records a formal warning: what happened and what has to change.",
    audience: "Issued after an incident, usually after a conversation.",
  },
  internship_certificate: {
    purpose: "Confirms an internship: what they did here and for how long.",
    audience: "Issued when the internship ends.",
  },
  noc: {
    purpose: "Says the company has no objection to what somebody is applying for — further study, a visa, a second job.",
    audience: "Issued on request.",
  },
  salary_certificate: {
    purpose: "States what somebody is paid, for a loan, a rental or a visa application.",
    audience: "Issued on request.",
  },
  // Added 30 Sep 2026 (letter change record §2).
  show_cause_notice: {
    purpose: "Asks somebody to explain, in writing and by a deadline, why action shouldn’t be taken over something that happened.",
    audience: "Issued before any disciplinary decision.",
  },
  performance_improvement_plan: {
    purpose: "Sets out what has to improve, by when, and how progress will be checked.",
    audience: "Issued when performance needs a formal plan.",
  },
  full_and_final_statement: {
    purpose: "States the final amount settled with somebody who is leaving, in a formal letter.",
    audience: "Issued once their final pay is worked out. The calculated statement is on their exit in Payroll.",
  },
  offer_letter: {
    purpose: "Offers the job: the title, the start date and the pay, with a date the offer is open until.",
    audience: "Issued before somebody starts. They must already be in your organisation here.",
  },
  promotion_letter: {
    purpose: "Confirms a promotion: the old title, the new one and when it takes effect.",
    audience: "Issued after their profile shows the new title.",
  },
  salary_revision_letter: {
    purpose: "Confirms a change in pay and when it takes effect.",
    audience: "Issued after the new salary has been applied.",
  },
};

export const letterPurpose = (code) => LETTER_PURPOSE[code]?.purpose || "";
export const letterAudience = (code) => LETTER_PURPOSE[code]?.audience || "";

/** A catalog row's name. An orphaned row may carry no title, so the code is made readable. */
export const letterTitle = (row) => String(row?.title || "").trim() || humanizeCode(row?.code) || "Letter";

/**
 * The three states a row can be in, in the tone keys the rest of the app uses
 * (which render purple — see attendance/enums.js).
 *
 * "Withdrawn" is the one worth spelling out: the organisation configured this
 * letter, the platform has since removed it, and nothing can be done with it.
 * It is shown rather than hidden, because otherwise saved wording disappears
 * without explanation.
 */
export function letterStateMeta(row) {
  if (row?.is_orphaned) {
    return { label: "Withdrawn", tone: "slate", hint: "This letter is no longer offered by the platform, so it can’t be prepared or previewed. Your saved wording is kept in case it returns." };
  }
  if (row?.is_enabled) {
    return { label: "In use", tone: "emerald", hint: "HR can prepare this letter." };
  }
  return { label: "Switched off", tone: "amber", hint: "Nobody can prepare this letter until it is switched on." };
}

/** A withdrawn letter can't be opened (#136 answers 404) or drawn. */
export const canConfigureLetter = (row) => !row?.is_orphaned;

/**
 * Whether a preview may merge this organisation's saved wording.
 *
 * #138 refuses `use_saved_fields: true` for a switched-off letter with a 409, so
 * a switched-off letter is previewed from sample wording instead — a preview
 * that works and says what it left out, rather than a button that fails.
 */
export const previewUsesSavedFields = (row) => !!row?.is_enabled;

// ── A template's per-organisation defaults (the #136 form descriptor) ────────
/** A descriptor entry's label. The server humanises the key; this is the fallback. */
export const fieldLabel = (field) => String(field?.label || "").trim() || humanizeCode(field?.key) || "Value";

/**
 * Why this default can't be saved, or "".
 *
 * `max_length` means two things in #136's descriptor (letter change record
 * §8.2): a character limit for text, but the LARGEST ALLOWED VALUE for
 * `type: "number"` — `response_deadline_days` with `max_length: 90` is 1–90,
 * not "90 characters". The minimum (1) is not in the descriptor at all.
 */
export function savedFieldProblem(field, value) {
  const text = String(value ?? "").trim();
  if (!text) return field?.required ? `${fieldLabel(field)} is needed.` : "";
  const max = Number(field?.max_length);
  if (field?.type === "number") {
    if (!/^\d+$/.test(text)) return "Enter a whole number.";
    const n = Number(text);
    if (n < NUMBER_FIELD_MIN) return `At least ${NUMBER_FIELD_MIN}.`;
    if (Number.isFinite(max) && max > 0 && n > max) return `No more than ${max}.`;
    return "";
  }
  if (Number.isFinite(max) && max > 0 && text.length > max) return `Keep this under ${max} characters.`;
  return "";
}

/** The input bounds for a descriptor entry: a value range for numbers, a length for text. */
export function savedFieldInputProps(field) {
  const max = Number(field?.max_length);
  if (field?.type === "number") {
    return { type: "number", inputMode: "numeric", step: 1, min: NUMBER_FIELD_MIN, ...(max > 0 ? { max } : {}) };
  }
  return { type: "text", ...(max > 0 ? { maxLength: max } : {}) };
}

export function savedFieldProblems(fields, values) {
  const out = {};
  (fields || []).forEach((field) => {
    const problem = savedFieldProblem(field, values?.[field.key]);
    if (problem) out[field.key] = problem;
  });
  return out;
}

/**
 * The defaults in the shape #137 stores them: trimmed, with blank boxes left
 * out altogether.
 *
 * Leaving a box blank has to mean "no default saved", not "save an empty
 * string" — an empty default would print as a blank space in a letter, which is
 * exactly the embarrassment the completeness check exists to prevent. Since
 * `saved_fields` is a full replace, dropping the key is what removes a default.
 */
export function savedFieldsPayload(fields, values) {
  const out = {};
  (fields || []).forEach((field) => {
    const text = String(values?.[field.key] ?? "").trim();
    if (text) out[field.key] = field?.type === "number" ? Number(text) : text;
  });
  return out;
}

/** Saved defaults → the shape the form edits (every descriptor key present, as text). */
export function savedFieldsToForm(fields, savedFields) {
  return Object.fromEntries((fields || []).map((field) => [field.key, savedFields?.[field.key] ?? ""]));
}

/**
 * A sample value as one readable line.
 *
 * Not every sample is a string: `appointment_letter` sends `compensation_lines`
 * as `[{ label, amount }, …]` (verified live 2026-09-27), and `String()` on that
 * prints "[object Object]". Anything nested is flattened rather than guessed at,
 * so a template that starts sending a new shape degrades to a readable line
 * instead of leaking JavaScript into the page.
 */
export function sampleText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(sampleText).filter(Boolean).join("; ");
  if (typeof value === "object") {
    return Object.values(value)
      .filter((part) => typeof part === "string" || typeof part === "number")
      .join(" ");
  }
  return String(value);
}

/** The sample text a preview uses for one of the letter's own placeholders. */
export const sampleValue = (template, key) => sampleText(template?.sample_data?.[key]);
