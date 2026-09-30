// ─────────────────────────────────────────────────────────────────────────────
// letterIssueMeta.js — Everything the issue / register / reissue screens know
// about a letter the company has actually sent out. PDF Generation Phase 2
// (#139 issue, #140 register, #141 detail, #142 reissue), plus the five
// organisation settings that shape one (#82–#86).
//
// Source of truth: public/ref docs/md_pdfs/phase2_api_analysis.md,
// combined_api_analysis-7.md §4–§5 and the change record
// 2026-09-27_pdf-generation-phase2-letter-issuance-and-reissue.md.
//
// Kept apart from letterMeta.js on purpose. That file is about SETTING LETTERS
// UP — the letterhead, the catalog, the wording saved once per organisation.
// This one is about letters that exist: numbered, published, in somebody's
// portal and impossible to unsay. The rules are different in kind, and folding
// them together would blur the one distinction that matters most on these
// screens.
//
// Five contract facts shape nearly every rule below, and each is the sort that
// costs a wrong letter rather than a wasted round trip:
//
//  1. A LETTER IS AN ORG DOCUMENT (`origin: "generated"`). There is no separate
//     letter object, no employee "my letters" endpoint and no letter download.
//     So statuses, badges and the recipient's whole experience come from
//     orgDocumentMeta.js and the existing org-document screens — this file adds
//     only what is peculiar to a generated one, and re-exports nothing.
//
//  2. THE REFERENCE NUMBER IS ALLOCATED AFTER THE RENDER, and only on success.
//     A renderer crash, a timeout or a storage failure therefore burns no
//     number and creates no row: "nothing was issued" is literally true, which
//     is why every failure message here is allowed to say so.
//
//  3. IDEMPOTENCY IS THE ONLY THING STOPPING A DOUBLE LETTER, and since Phase 2
//     it cuts both ways (§6). A repeated key over a still-rendering request is
//     `409 PDF_RENDER_IN_PROGRESS` and a repeated key over a FAILED render
//     re-surfaces that old failure instead of drawing again. So the key must be
//     held across an in-flight retry and thrown away after a recorded failure —
//     see `newIdempotencyKey()` / `keyForRetry()`, which is the one correct
//     lifecycle and the reason the screens don't invent their own.
//
//     The same mechanism means two genuinely-wanted identical letters (two visa
//     applications, same day, same person) need two different keys. A key is
//     therefore minted per ATTEMPT by the form, never derived from the inputs.
//
//  4. THE API NEVER TELLS US WHICH FIELDS MAY BE TYPED IN. #139 refuses an
//     override of a `derived_fields` key with `422
//     LETTER_FIELD_NOT_OVERRIDABLE`, but #135/#136 return no `derived_fields`
//     array — only `required_fields`, `optional_fields` and the separate
//     saved-defaults descriptor. There is no way to compute the overridable set,
//     so `letterOverridableFields()` classifies by key name (documented below)
//     and the server stays the authority: a refusal that names a field is
//     remembered for the session with `rememberNotOverridable()` and the form
//     drops that box. A wrong guess therefore costs one click, never a wrong
//     letter — and a template the platform adds later works without a release.
//
//     SINCE 30 SEP 2026 the backend publishes the answer as a table instead
//     (letter change record §9), and it lives in letterFieldMatrix.js. Every
//     template listed there is built from it — HR-entered fields only, real
//     required checks, the one number sent as a number — and the key-name
//     guessing below is now only the fallback for a code the table doesn't
//     know. #136's `fields` descriptor is NOT used here any more: it describes
//     the saved-default keys (#137/#138), which #139 refuses as overrides.
//
//  5. A REISSUE IS ALWAYS DATED TODAY. #142 takes no `effective_date` at all,
//     so a reissue's number and financial year belong to the reissue. Anything
//     on screen implying otherwise would be a lie about a legal document.
// ─────────────────────────────────────────────────────────────────────────────

import { humanizeCode } from "./documentMeta";
import { todayYMD } from "../attendance/dates";
import { hrFieldMeta, letterMatrix } from "./letterFieldMatrix";

// ── Reading the replies ──────────────────────────────────────────────────────
const payload = (res) => res?.data ?? res ?? {};

/**
 * #140 → `{ rows, total, page, limit, totalPages }`.
 *
 * Deliberately NOT `listPayload()` from documentMeta.js: that reads
 * `{ total, rows }` with limit/offset, and this endpoint answers
 * `{ items, pagination: { page, limit, total, total_pages } }`. Mixing them up
 * reads every page as page one.
 */
export function lettersPayload(res) {
  const data = payload(res);
  const rows = Array.isArray(data.items) ? data.items : [];
  const p = data.pagination || {};
  const limit = Number(p.limit) > 0 ? Number(p.limit) : 20;
  const total = Number.isFinite(Number(p.total)) ? Number(p.total) : rows.length;
  return {
    rows,
    total,
    page: Number(p.page) > 0 ? Number(p.page) : 1,
    limit,
    totalPages: Number(p.total_pages) > 0 ? Number(p.total_pages) : Math.max(1, Math.ceil(total / limit)),
  };
}

/** #139 / #142 → the letter that was issued. */
export const issuedLetterOf = (res) => payload(res).letter || null;

/** #139 / #142 → the render record, for the provenance block. */
export const issuedArtifactOf = (res) => payload(res).artifact || null;

/**
 * Whether this reply was an idempotent replay rather than a fresh issue.
 *
 * `request()` doesn't surface the status code, so `reused` is the only way to
 * know — and it is worth knowing: a replay means the letter already existed and
 * no second number was used. Saying "issued" there would have HR believe they
 * had sent two.
 */
export const wasReused = (res) => payload(res).reused === true;

/**
 * #142 → the version that stepped down, or null.
 *
 * The two specs disagree on the id's name: the change record calls it
 * `document_id`, the endpoint analysis calls it `id`. Both are read rather than
 * picked, because being wrong here silently breaks the "replaced …" line on a
 * screen about a legal document.
 */
export function supersededOf(res) {
  const block = payload(res).supersedes;
  if (!block || typeof block !== "object") return null;
  const id = block.document_id || block.id || null;
  return {
    id,
    version: Number(block.version) || null,
    reference_number: block.reference_number || "",
  };
}

/** #141 → the `generation` provenance block, or null for a row that carries none. */
export const generationOf = (letter) =>
  letter?.generation && typeof letter.generation === "object" ? letter.generation : null;

// ── What a generated letter is ───────────────────────────────────────────────
/**
 * A row created by the letter pipeline rather than uploaded by a person.
 *
 * `reference_number` is checked as well as `origin`, because a server that
 * predates the `origin` column on a given read still marks a letter by giving it
 * a number — and every rule that follows from "this is a letter" (no upload over
 * it, reissue instead of replace) must hold on the older shape too.
 */
export const isGeneratedLetter = (doc) => doc?.origin === "generated" || (!!doc?.reference_number && doc?.origin !== "uploaded");

/** Only the version in force can be reissued (#142 → `409 LETTER_NOT_REISSUABLE`). */
export const canReissueLetter = (doc) => isGeneratedLetter(doc) && doc?.status === "published";

/** Why Reissue isn't offered, in words, or "" when it is. */
export function reissueBlocker(doc) {
  if (!isGeneratedLetter(doc)) return "Only a letter your organisation issued can be reissued.";
  if (doc?.status === "superseded") return "A newer version has already replaced this one. Open the live version to reissue it.";
  if (doc?.status === "retired") return "This letter has been withdrawn, so it can't be reissued.";
  if (doc?.status !== "published") return "Only the live version of a letter can be reissued.";
  return "";
}

/**
 * Statuses #140 accepts as a filter, in lifecycle order.
 *
 * The labels are ORG_STATUS's, not new ones — deliberately. A letter IS an org
 * document, its rows carry `OrgStatusBadge`, and the same row appears on
 * Organisation Documents too. A register whose tabs said "In force" while its own
 * badges said "Live" would be teaching two words for one thing on one screen.
 */
export const LETTER_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "published", label: "Live" },
  { value: "superseded", label: "Older versions" },
  { value: "retired", label: "Withdrawn" },
];

/**
 * #140 `sort`, and what each one means to somebody looking for a letter.
 *
 * The direction rides in the value (`published_at:asc`) rather than sitting in a
 * field of its own, so one `<select>` covers both query keys and there is nothing
 * for a screen to keep in step. `sortParams()` splits it back out.
 */
export const LETTER_SORTS = [
  { value: "published_at", label: "Newest first" },
  { value: "published_at:asc", label: "Oldest first" },
  { value: "reference_number", label: "Reference number" },
];

/** Split a `LETTER_SORTS` value back into the two query keys #140 wants. */
export function sortParams(value) {
  const [sort, order] = String(value || "published_at").split(":");
  const known = ["published_at", "reference_number"].includes(sort) ? sort : "published_at";
  return { sort: known, order: order === "asc" ? "asc" : "desc" };
}

// ── The date printed on the letter ───────────────────────────────────────────
/** #139 accepts an `effective_date` within ±365 days of today; anything else is a 400. */
export const ISSUE_DATE_WINDOW_DAYS = 365;

const shiftYMD = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const issueDateMin = () => shiftYMD(-ISSUE_DATE_WINDOW_DAYS);
export const issueDateMax = () => shiftYMD(ISSUE_DATE_WINDOW_DAYS);

/** Why this date can't be used, or "". An empty date is fine — the server uses today. */
export function issueDateProblem(ymd) {
  const text = String(ymd || "").trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "Choose a date.";
  if (text < issueDateMin() || text > issueDateMax()) return "Choose a date within a year either side of today.";
  return "";
}

/** A note about a back- or forward-dated letter, or "" when it is dated today. */
export function issueDateNote(ymd) {
  const text = String(ymd || "").trim();
  if (!text || text === todayYMD()) return "";
  return text < todayYMD()
    ? "This letter will be dated in the past. Its number comes from the financial year of that date, not today’s."
    : "This letter will be dated in the future. Its number comes from the financial year of that date, not today’s.";
}

// ── Which details may be typed in (see fact 4 in the header) ─────────────────
/**
 * Key names that are read from the person's record and therefore refused as an
 * override.
 *
 * This list exists only because #136 doesn't send `derived_fields`. It is
 * deliberately broad on the FACT side and narrow on the narrative side: a field
 * wrongly treated as a fact is merely absent from the form (and the letter still
 * prints it correctly from the record), whereas a field wrongly offered as
 * typeable is a 422 the person has to read. The patterns cover every derived
 * field named anywhere in the Phase 1 and Phase 2 documents, plus the obvious
 * neighbours a later template would use.
 *
 * Do not add a narrative field here to "fix" a 422 — the server's refusal is
 * already remembered for the session (`rememberNotOverridable`). Add one only
 * when the contract says the field is a record fact.
 */
const DERIVED_FACT_PATTERNS = [
  /(^|_)name$/, /(^|_)names$/, /^full_name/, /^employee_name/, /^subject_/,
  /designation/, /department/, /(^|_)code$/, /employee_code/, /employee_id/,
  /(^|_)date$/, /_date_text$/, /^joining/, /^relieving/, /^exit/, /^confirmation/,
  /^probation/, /^last_working/, /^resignation/, /^notice_period/, /^tenure/,
  /^period/, /^duration/,
  /salary/, /ctc/, /(^|_)pay$/, /^pay_/, /compensation/, /gross/, /(^|_)net$/,
  /^annual_/, /^monthly_/, /(^|_)amount$/, /(^|_)amounts$/, /^earning/, /^deduction/,
  /^component/, /allowance/, /bonus/,
  /(^|_)email$/, /(^|_)phone$/, /(^|_)mobile$/, /address/, /(^|_)location$/,
  /(^|_)gender$/, /(^|_)dob$/, /date_of_birth/, /(^|_)manager/, /(^|_)reporting/,
  /(^|_)grade$/, /(^|_)band$/, /(^|_)level$/, /employment_type/, /job_status/,
  /(^|_)bank/, /(^|_)pan$/, /(^|_)uan$/, /(^|_)esic/, /(^|_)pf_/,
];

const isDerivedFactKey = (key) => DERIVED_FACT_PATTERNS.some((re) => re.test(String(key || "")));

/**
 * Fields the server has told us, this session, that it will not accept as an
 * override — keyed by template code.
 *
 * Module-level rather than per-component state on purpose: the refusal is a fact
 * about the TEMPLATE, not about one open dialog, so learning it once must also
 * fix the next letter of the same kind and the reissue of an old one. It is
 * intentionally not persisted: a server deploy can legitimately change a
 * template's fields, and a stale memory in localStorage would hide a field for
 * good with no way for the person to get it back.
 */
const notOverridable = new Map();

/** Remember a `LETTER_FIELD_*` refusal so the same box isn't offered again. */
export function rememberNotOverridable(templateCode, fieldKey) {
  const code = String(templateCode || "");
  const key = String(fieldKey || "").trim();
  if (!code || !key) return;
  const set = notOverridable.get(code) || new Set();
  set.add(key);
  notOverridable.set(code, set);
}

/** Has the server already refused this field for this template? */
export const isKnownNotOverridable = (templateCode, fieldKey) =>
  !!notOverridable.get(String(templateCode || ""))?.has(String(fieldKey || ""));

/**
 * Every field the server has refused for this template, as a sorted array.
 *
 * A component holds this in state and passes it back to
 * `letterOverridableFields()` rather than letting the field list read module
 * memory behind React's back: a memo over hidden mutable state is a memo that
 * doesn't invalidate, and the box would stay on screen after the refusal.
 */
export const refusedFields = (templateCode) =>
  [...(notOverridable.get(String(templateCode || "")) || [])].sort();

/**
 * Nicer wording than `humanizeCode()` for the narrative fields the standard
 * letters actually have. "Purpose" is accurate and useless; "What the letter is
 * for" is the question the person in front of HR just answered out loud.
 *
 * An unknown key falls back to the humanised key, so a new template is usable
 * the day it ships.
 */
const NARRATIVE_LABELS = {
  purpose: { label: "What the letter is for", help: "Printed in the letter. Say where it is going — a bank, an embassy, a landlord.", long: true },
  closing_note: { label: "Closing sentence", help: "The last line before the signature.", long: true },
  place_of_issue: { label: "Place of issue", help: "The city printed beside the date." },
  hr_contact_line: { label: "Who to contact with questions", help: "Printed at the foot, for whoever receives the letter." },
  remarks: { label: "Extra remarks", help: "", long: true },
  notes: { label: "Extra notes", help: "", long: true },
  note: { label: "Extra note", help: "", long: true },
  reason: { label: "Reason", help: "" },
  subject_line: { label: "Subject line", help: "" },
  addressed_to: { label: "Addressed to", help: "Who the letter is written to, when it isn’t the employee." },
  salutation: { label: "Opening greeting", help: "" },
  special_note: { label: "Special note", help: "", long: true },
  commendation: { label: "Commendation", help: "", long: true },
};

/** #139 caps each override value at 500 characters. */
export const OVERRIDE_MAX_LENGTH = 500;
/** #139 caps `field_overrides` at 20 keys. */
export const OVERRIDE_MAX_KEYS = 20;

/**
 * The boxes the issue, reissue, proposal and bulk forms show.
 *
 * A template in letterFieldMatrix.js is built from that table: exactly the
 * HR-entered fields #139 accepts, with a real `required` flag, our wording, and
 * `kind: "number"` for `response_deadline_days`. `known: true` marks these —
 * only for them does an empty required box count as a problem (see
 * `overrideProblem`).
 *
 * A code the table doesn't know falls back to #136's `required_fields` /
 * `optional_fields`, minus anything that looks like a record fact (fact 4 in
 * the header). The `fields` descriptor is deliberately NOT read: it lists the
 * saved-default keys, which #139 refuses as overrides.
 *
 * Either way, anything the server has refused this session is dropped, and the
 * list is capped at #139's 20 keys.
 *
 * @param {object} template     the #136 `template` object
 * @param {string} [code]       template code, for the matrix and the refusal memory
 * @param {string[]} [refused]  fields the caller knows are refused (see `refusedFields`)
 * @returns {{ key: string, label: string, help: string, required: boolean, long: boolean, max: number, kind: "text"|"number", min?: number, maxValue?: number, known: boolean }[]}
 */
export function letterOverridableFields(template, code, refused = []) {
  const templateCode = code || template?.code || "";
  const rejected = new Set(refused);
  const dropped = (key) => rejected.has(key) || isKnownNotOverridable(templateCode, key);

  const matrix = letterMatrix(templateCode);
  if (matrix) {
    return matrix.hr
      .filter(({ key }) => !dropped(key))
      .map(({ key, required }) => {
        const meta = hrFieldMeta(key) || {};
        const number = meta.kind === "number";
        return {
          key,
          label: meta.label || humanizeCode(key) || "Detail",
          help: meta.help || "",
          required,
          long: meta.long === true,
          max: OVERRIDE_MAX_LENGTH,
          kind: number ? "number" : "text",
          ...(number ? { min: meta.min, maxValue: meta.max } : {}),
          known: true,
        };
      })
      .slice(0, OVERRIDE_MAX_KEYS);
  }

  const entries = [
    ...(Array.isArray(template?.required_fields) ? template.required_fields : []).map((key) => ({ key: String(key ?? "").trim(), required: true })),
    ...(Array.isArray(template?.optional_fields) ? template.optional_fields : []).map((key) => ({ key: String(key ?? "").trim(), required: false })),
  ];

  const seen = new Set();
  const out = [];
  entries.forEach(({ key, required }) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (isDerivedFactKey(key) || dropped(key)) return;
    const known = NARRATIVE_LABELS[key] || hrFieldMeta(key);
    out.push({
      key,
      label: known?.label || humanizeCode(key) || "Detail",
      help: known?.help || "",
      // For an unknown template `required` only means "the template normally
      // prints this" — the form can't tell whether saved wording covers it.
      required,
      long: known?.long === true,
      max: OVERRIDE_MAX_LENGTH,
      kind: "text",
      known: false,
    });
  });
  return out.slice(0, OVERRIDE_MAX_KEYS);
}

/** Record facts in words — "Joining date", not "Joining Date Text". */
const FACT_LABELS = {
  employee_name: "Name",
  employee_code: "Employee code",
  designation: "Job title",
  department_name: "Department",
  joining_date_text: "Joining date",
  relieving_date_text: "Last working day",
  annual_ctc_text: "Yearly pay",
  revised_annual_ctc_text: "New yearly pay",
  compensation_lines: "Pay breakdown",
  reporting_manager: "Reports to",
};
const factLabel = (key) => FACT_LABELS[key] || humanizeCode(key) || key;

/**
 * The placeholders the letter fills in from the person's record, for the
 * read-only "comes from their record" list.
 *
 * Shown rather than hidden because "why can't I change the job title?" is the
 * first question this form provokes, and the honest answer — it is taken from
 * their profile, correct it there — only works if the person can see which
 * parts of the letter those are.
 */
export function letterFactFields(template, code) {
  const matrix = letterMatrix(code || template?.code);
  if (matrix) {
    return [
      ...matrix.derived.map((key) => ({ key, label: factLabel(key), required: true })),
      ...matrix.derivedOptional.map((key) => ({ key, label: factLabel(key), required: false })),
    ];
  }
  const required = Array.isArray(template?.required_fields) ? template.required_fields : [];
  const optional = Array.isArray(template?.optional_fields) ? template.optional_fields : [];
  const seen = new Set();
  const out = [];
  [...required.map((key) => [key, true]), ...optional.map((key) => [key, false])].forEach(([key, isRequired]) => {
    const name = String(key || "").trim();
    if (!name || seen.has(name) || !isDerivedFactKey(name)) return;
    seen.add(name);
    out.push({ key: name, label: factLabel(name), required: isRequired });
  });
  return out;
}

/**
 * The problem an empty required box reports. Exported so a form can show it
 * quietly (as a plain hint) until the person has tried to send, rather than
 * greeting them with red on a form they haven't touched yet.
 */
export const REQUIRED_PROBLEM = "Needed on this letter.";

/** Is every problem on this form just "fill in a required box"? */
export const onlyRequiredMissing = (problems) =>
  Object.keys(problems || {}).length > 0 && Object.values(problems).every((p) => p === REQUIRED_PROBLEM);

/**
 * Why this override value can't be sent, or "".
 *
 * Length for every box, and a whole number in range for a number box.
 *
 * An EMPTY box is a problem only when all three hold: the template is one
 * letterFieldMatrix.js knows (`field.known`), the field is genuinely required
 * there, and this organisation has no saved wording for it — because a saved
 * field fills a required one when the issue sends nothing (§2.1). For a code
 * the matrix doesn't know, an empty box is never blocked: the form can't tell
 * what the saved wording covers, and `422 PDF_DATA_INCOMPLETE` names the field
 * that really came out empty.
 *
 * @param {object} field     from `letterOverridableFields`
 * @param {unknown} value
 * @param {object} [saved]   the template's `config.saved_fields`
 */
export function overrideProblem(field, value, saved = null) {
  const text = String(value ?? "").trim();
  if (!text) {
    const hasSaved = saved && String(saved[field?.key] ?? "").trim() !== "";
    return field?.known && field?.required && !hasSaved ? REQUIRED_PROBLEM : "";
  }
  if (field?.kind === "number") {
    if (!/^\d+$/.test(text)) return "Enter a whole number.";
    const n = Number(text);
    if (Number.isFinite(field.min) && n < field.min) return `At least ${field.min}.`;
    if (Number.isFinite(field.maxValue) && n > field.maxValue) return `No more than ${field.maxValue}.`;
    return "";
  }
  // The field's own limit where one is known, and never above #139's flat cap.
  const max = Number(field?.max) > 0 ? Math.min(Number(field.max), OVERRIDE_MAX_LENGTH) : OVERRIDE_MAX_LENGTH;
  if (String(value ?? "").length > max) return `Keep this under ${max} characters.`;
  return "";
}

export function overrideProblems(fields, values, saved = null) {
  const out = {};
  (fields || []).forEach((field) => {
    const problem = overrideProblem(field, values?.[field.key], saved);
    if (problem) out[field.key] = problem;
  });
  return out;
}

/**
 * The boxes' starting values: this organisation's saved wording where a box has
 * one (the doc's "prefill from `config.saved_fields`"), empty otherwise.
 *
 * Showing it is the point. Sending it unchanged is harmless — it is exactly
 * what the server would have filled in — and the person can see and change the
 * wording on THIS letter without touching the saved default.
 */
export function overridesFromSaved(fields, saved) {
  const out = {};
  (fields || []).forEach((field) => {
    const value = saved?.[field.key];
    if (value !== undefined && value !== null && String(value).trim() !== "") out[field.key] = String(value);
  });
  return out;
}

/** Does this box start from the organisation's saved wording? */
export const isPrefilledFromSaved = (field, saved) =>
  !!saved && saved[field?.key] !== undefined && saved[field?.key] !== null && String(saved[field.key]).trim() !== "";

/** Every override box as text, with saved wording nowhere in sight (that is the server's job). */
export const overridesToForm = (fields) => Object.fromEntries((fields || []).map((f) => [f.key, ""]));

/**
 * The `field_overrides` body #139 / #142 wants: trimmed, with empty boxes left
 * out entirely.
 *
 * An empty box must NOT be sent as `""`. The letter's own default — the
 * template's wording, or this organisation's saved default from #137 — is what
 * should print, and an empty string would override it with a blank space in a
 * document going to a bank.
 */
export function overridesPayload(fields, values) {
  const out = {};
  (fields || []).forEach((field) => {
    const text = String(values?.[field.key] ?? "").trim();
    if (!text) return;
    // The one numeric field (`response_deadline_days`) goes as a number: it is
    // printed as "Within N days" and validated as an integer 1–90.
    out[field.key] = field.kind === "number" ? Number(text) : text;
  });
  return out;
}

// ── Idempotency (see fact 3 in the header) ───────────────────────────────────
/** #139 / #142: 8–120 characters of `[A-Za-z0-9._:-]`. */
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/;

const randomToken = () => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // Fall through to the time-and-random token below.
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

/**
 * A key for ONE attempt at issuing or reissuing.
 *
 * Minted per attempt, never derived from the inputs, and that is the whole
 * point: the server already de-duplicates identical inputs, so a derived key
 * would make a second, genuinely-wanted copy of the same letter impossible to
 * issue (two visa applications on one day — EC-P2-8). A random key per attempt
 * keeps the protection that matters — a double-click sends the same key and gets
 * one letter — without taking that away.
 */
export function newIdempotencyKey(kind = "issue") {
  const key = `letter.${kind}.${randomToken()}`.slice(0, 120);
  // Belt and braces: the pattern is the server's, and a key it refuses would
  // fail the whole request with a 400 that reads like nothing the person did.
  return KEY_PATTERN.test(key) ? key : `letter.${kind}.${Date.now().toString(36)}0000`;
}

/**
 * The key the NEXT attempt should use after `err`.
 *
 * Three rules, and they pull in opposite directions — which is exactly why this
 * lives here rather than being re-derived on each screen:
 *
 *   1. A render still in flight under this key (`409 PDF_RENDER_IN_PROGRESS`)
 *      must be waited for with the SAME key. A fresh key would start a second
 *      render and issue the duplicate the key exists to prevent.
 *   2. A request that never got an ANSWER — no HTTP status at all: the
 *      connection dropped, the tab lost the network, the gateway gave up — keeps
 *      the same key too. The server may well have issued the letter and lost the
 *      reply on the way back. Repeating with the same key can only ever hand
 *      back that first letter (`reused: true`); a fresh key would mint a second
 *      numbered legal document nobody asked for. Between "the person sees a
 *      stale failure and has to start again" and "the employee gets two letters
 *      with two reference numbers", the first is obviously the lesser harm.
 *   3. Anything else answered by the server moves to a FRESH key, because a
 *      FAILED render under a key re-surfaces its old failure for ever (Phase 2
 *      §6) and a genuine retry would otherwise walk into the same wall.
 *
 * @param {string} current  the key the failed attempt used
 * @param {unknown} err     what it failed with
 * @param {(e: unknown) => boolean} isInProgress  `isRenderInProgress`
 * @param {string} [kind]
 */
export function keyForRetry(current, err, isInProgress, kind = "issue") {
  if (!KEY_PATTERN.test(String(current || ""))) return newIdempotencyKey(kind);
  if (isInProgress?.(err)) return current;
  if (!Number.isFinite(Number(err?.status))) return current;
  return newIdempotencyKey(kind);
}

// ── The reference-number pattern (setting #84) ───────────────────────────────
/** Tokens `letter_reference_pattern` accepts, with what each one prints. */
export const REFERENCE_TOKENS = [
  { token: "{ORG_CODE}", label: "Your company’s short code" },
  { token: "{TYPE}", label: "A short code for the kind of letter" },
  { token: "{FY}", label: "The financial year, as 2026-2027" },
  { token: "{YYYY}", label: "The four-digit year" },
  { token: "{MM}", label: "The two-digit month" },
  { token: "{SEQ:0000}", label: "The count, padded to this many digits" },
];

export const REFERENCE_PATTERN_DEFAULT = "{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}";
export const REFERENCE_PATTERN_MAX = 120;
/** The column the finished number is stored in (#84 → `422 LETTER_REFERENCE_TOO_LONG`). */
export const REFERENCE_NUMBER_MAX = 64;

const SEQ_TOKEN = /^\{SEQ:0{1,6}\}$/;
const KNOWN_TOKENS = new Set(["{ORG_CODE}", "{TYPE}", "{FY}", "{YYYY}", "{MM}"]);

/**
 * Why this numbering pattern can't be saved, or "".
 *
 * Checked here as well as on the server because the refusal arrives from the
 * SETTINGS save (`422 LETTER_REFERENCE_PATTERN_INVALID`) while the damage shows
 * up much later, when somebody tries to issue a letter and can't. Catching it in
 * the box it was typed into is the difference between a typo and an outage.
 */
export function referencePatternProblem(pattern) {
  const text = String(pattern ?? "");
  if (!text.trim()) return "A numbering pattern is needed. Letters can’t be issued without one.";
  if (text.length > REFERENCE_PATTERN_MAX) return `Keep the pattern under ${REFERENCE_PATTERN_MAX} characters.`;

  const tokens = text.match(/\{[^{}]*\}/g) || [];
  const unknown = tokens.filter((t) => !KNOWN_TOKENS.has(t) && !SEQ_TOKEN.test(t));
  if (unknown.length) {
    // A bare {SEQ} is the mistake people actually make, and it deserves its own
    // sentence rather than being lumped in with a misspelt token.
    if (unknown.some((t) => /^\{SEQ/i.test(t))) return "Write the count as {SEQ:0000} — the zeros say how many digits it is padded to, up to six.";
    return `${unknown[0]} isn’t something a number can contain. Use only the pieces listed below.`;
  }
  const seq = tokens.filter((t) => SEQ_TOKEN.test(t));
  if (seq.length === 0) return "The pattern must include {SEQ:0000}, or every letter would get the same number.";
  if (seq.length > 1) return "Use {SEQ:0000} once only.";
  // A stray brace left over after the tokens are removed would reach the server.
  if (/[{}]/.test(text.replace(/\{[^{}]*\}/g, ""))) return "There’s an unmatched { or } in the pattern.";
  return "";
}

/** The Indian financial year an ISO date falls in, as the numbering uses it. */
export function financialYearOf(ymd = todayYMD()) {
  const [y, m] = String(ymd).split("-").map(Number);
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  const month = Number.isFinite(m) ? m : new Date().getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${start}-${start + 1}`;
}

/**
 * What a pattern produces, for the live example under the box.
 *
 * `{ORG_CODE}` is shown as a placeholder rather than the real one: no endpoint in
 * the product returns the organisation's own short code (see the org-name gap),
 * and inventing one would make the example look authoritative when it isn't. The
 * screen says as much beside it.
 */
export function referencePatternExample(pattern, { orgCode = "ORGCODE", type = "BON", ymd = todayYMD() } = {}) {
  const [year, month] = String(ymd).split("-");
  return String(pattern ?? "")
    .replace(/\{ORG_CODE\}/g, orgCode)
    .replace(/\{TYPE\}/g, type)
    .replace(/\{FY\}/g, financialYearOf(ymd))
    .replace(/\{YYYY\}/g, year || "")
    .replace(/\{MM\}/g, month || "")
    .replace(/\{SEQ:(0{1,6})\}/g, (_, zeros) => "1".padStart(zeros.length, "0"));
}

/**
 * A warning about a pattern that will produce numbers too long for the column,
 * or "". Not an error: `{ORG_CODE}` is a guess here, so this can only ever be a
 * heads-up — the server is the one that refuses at 64 characters.
 */
export function referenceLengthWarning(pattern) {
  const example = referencePatternExample(pattern);
  if (!example || example.length <= REFERENCE_NUMBER_MAX - 8) return "";
  return `A number like this is ${example.length} characters, and the limit is ${REFERENCE_NUMBER_MAX}. Shorten the pattern, or letters may fail to issue once your company code is included.`;
}

// ── The five letter settings (#82–#86) ───────────────────────────────────────
/**
 * The settings keys this phase added. A screen sends one only when the read
 * returned it, so an older server is never handed a field it would reject.
 */
export const LETTER_SETTING_KEYS = [
  "letter_branding_enabled",
  "letter_preview_rate_per_hour",
  "letter_reference_pattern",
  "letter_default_confidential",
  "letter_requires_acknowledgement_default",
];

/** #86 is a THREE-state setting: true, false, or null meaning "whatever the document type says". */
export const ACK_DEFAULT_CHOICES = [
  { value: "inherit", label: "Follow the document type", blurb: "Whatever the kind of letter is set to. What most organisations want." },
  { value: "yes", label: "Always ask", blurb: "Everyone who receives a letter is asked to confirm they’ve read it." },
  { value: "no", label: "Never ask", blurb: "Letters are filed in the person’s portal with nothing to do." },
];

/** `null | true | false` → the radio value. */
export const ackDefaultToChoice = (value) => (value === true ? "yes" : value === false ? "no" : "inherit");
/** The radio value → what #86 stores. `null` is a real, meaningful value here, not "unset". */
export const ackDefaultFromChoice = (choice) => (choice === "yes" ? true : choice === "no" ? false : null);

/**
 * Who a letter in the #140 register went to, and the letter's own name.
 *
 * #140 list items carry `included_users` since the backend change of 29 Sep
 * 2026 (R-1), and that wins. Older servers sent only `recipient_count` (the
 * #141 detail had the users), so the fallback reads the name out of the
 * generated title, "<Letter> — <Person>" ("Bonafide Letter — Asha Rao"). Keep
 * the fallback until every environment runs R-1: a request per row is not an
 * option, and "A colleague" for every letter is what it replaced.
 *
 * @returns {{ letter: string, person: string }} person is "" when unknown
 */
// What useEmployeeDirectory's nameOf returns when it has no answer.
const DIRECTORY_PLACEHOLDERS = new Set([
  "Loading…", "Name unavailable", "Employee not found", "Unknown user", "A colleague", "N/A",
]);

export function letterRowParts(row, nameOf) {
  const title = String(row?.title || "").trim();
  // R-1 doesn't pin the element shape: accept a bare user id or an object.
  const first = Array.isArray(row?.included_users) && row.included_users.length === 1 ? row.included_users[0] : "";
  const only = typeof first === "string" ? first : first?.user_id || first?.id || "";
  const embeddedName = typeof first === "object" && first ? first.name || first.full_name || "" : "";
  const split = title.lastIndexOf(" — ");
  const fromTitle = split > 0 ? { letter: title.slice(0, split).trim(), person: title.slice(split + 3).trim() } : null;
  // A real directory hit wins, then the title's name. `nameOf` answers with a
  // placeholder ("Loading…", "Name unavailable") when it has no hit, and one
  // of those must never replace a name the title already gives us.
  const looked = only && nameOf ? nameOf(only, "") : "";
  const hit = looked && !DIRECTORY_PLACEHOLDERS.has(looked) ? looked : "";
  const person = embeddedName || hit || fromTitle?.person || (looked === "Loading…" ? looked : "");
  return { letter: (fromTitle && person === fromTitle.person ? fromTitle.letter : title) || "Letter", person };
}

/**
 * A reference number split at its "/" separators, for rendering each part
 * unbreakable with a <wbr> after every slash — so it wraps only between
 * parts, never inside "2026-2027". This used to rewrite the text itself
 * (U+2011 hyphens, U+200B spaces), and those characters came along when the
 * number was copied: people are asked to quote it, and the pasted copy no
 * longer matched in search or in an email. Markup-only breaks copy cleanly.
 * ["HRC", "BON", "2026-2027", "0001"] → render "HRC/" "BON/" … with <wbr>.
 */
export const referenceSegments = (ref) => {
  const parts = String(ref || "").split("/");
  return parts.map((part, i) => (i < parts.length - 1 ? `${part}/` : part));
};
