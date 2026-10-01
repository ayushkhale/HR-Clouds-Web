// ─────────────────────────────────────────────────────────────────────────────
// organization/orgProfileMeta.js — What the company-profile form collects, and
// what may be sent.
//
// Contract: `public/ref docs/6_org_profile_management_api.md` §1. The lengths
// below ARE the server's, so a value that would come back as a 422 with a Joi
// message is caught in the form instead, next to the field it belongs to.
//
// Two rules the PATCH enforces and this file encodes:
// • It is partial — `changedFields()` sends ONLY what the person actually
//   changed, and saving with nothing changed is not a request at all (the
//   server rejects an empty body, `.min(1)`).
// • Unknown keys are stripped, `logo_url` and `logo_storage_key` among them.
//   The logo has its own handshake (logoUpload.js); it is never a form field.
//
// Clearing a field sends "" rather than dropping the key — dropping it would
// leave the old value in place, which is the opposite of what someone who
// emptied the box asked for. `org_name` is the one field that cannot be
// cleared: it renames the organisation everywhere.
// ─────────────────────────────────────────────────────────────────────────────

const MAX = {
  org_name: 150,
  org_alias: 100,
  industry: 100,
  size: 50,
  website: 255,
  phone_number: 20,
  address_line_1: 255,
  address_line_2: 255,
  city: 100,
  state: 100,
  country: 100,
  zip_code: 20,
  gst_number: 50,
  company_pan_number: 50,
};

/** Every key the PATCH accepts, in the order the form shows them. */
export const PROFILE_FIELDS = [
  "org_name", "org_alias", "industry", "size", "founded_year", "website", "phone_number",
  "address_line_1", "address_line_2", "city", "state", "country", "zip_code",
  "description", "gst_number", "company_pan_number",
];

/** The subset only HR is shown the values of, and only when the read returned them. */
export const STATUTORY_FIELDS = ["gst_number", "company_pan_number"];

export const FOUNDED_MIN = 1800;
export const foundedMax = () => new Date().getFullYear();

/**
 * Company-size bands. A free-typed value from an older record is kept and
 * offered as-is, so editing another field never silently rewrites the size.
 */
/**
 * Industries offered on sign-up and in Edit company details — one list, so a
 * company never registers under a name the edit form can't show. A value from
 * an older free-typed record is kept and offered as-is.
 */
export const INDUSTRY_OPTIONS = [
  "Software Development", "IT Services", "E-Commerce", "Healthcare", "Pharmaceuticals",
  "Education", "Manufacturing", "Automotive", "Finance", "Banking & Insurance",
  "Retail", "Hospitality", "Consulting", "Construction & Real Estate", "Logistics & Transport",
  "Media & Marketing", "Telecommunications", "Energy & Utilities", "Agriculture",
  "Non-profit", "Government", "Other",
];

export const SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"];

const text = (v) => (v === null || v === undefined ? "" : String(v));

/**
 * The form's starting values, from a GET /organizations/details payload.
 * A profile that doesn't exist yet gives an empty form, and saving it creates
 * the row — nothing here assumes there is one.
 */
export function profileFormFrom(details) {
  const p = details?.profile || {};
  const form = {};
  for (const key of PROFILE_FIELDS) form[key] = text(p[key]);
  // The organisation's own name is the authority; the profile copy follows it.
  form.org_name = text(details?.organization?.name || p.org_name);
  return form;
}

/**
 * Which statutory keys the read actually returned. They come back to HR only,
 * and as ABSENT keys rather than nulls, so a manager's form must not offer to
 * blank a value it was never shown (see CompanyProfilePage's header).
 */
export function statutoryVisible(details) {
  const p = details?.profile;
  return !!p && STATUTORY_FIELDS.some((k) => k in p);
}

/** "acme.example" typed into the website box is a website; "hello" is not. */
function websiteProblem(value) {
  const v = value.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") ? null : "That doesn’t look like a web address. Try something like acme.com.";
  } catch {
    return "That doesn’t look like a web address. Try something like acme.com.";
  }
}

/**
 * Problems to show beside the fields, keyed by field. Empty object = ready to
 * save. Everything here is what the server would reject anyway.
 * @returns {Record<string, string>}
 */
export function validateProfileForm(form) {
  const problems = {};
  const name = String(form.org_name || "").trim();
  if (!name) problems.org_name = "The company needs a name.";

  for (const [key, max] of Object.entries(MAX)) {
    const value = String(form[key] ?? "").trim();
    if (value.length > max) problems[key] = `Keep this to ${max} characters or fewer.`;
  }

  const site = websiteProblem(String(form.website || ""));
  if (site) problems.website = site;

  const year = String(form.founded_year || "").trim();
  if (year) {
    const n = Number(year);
    if (!/^\d{4}$/.test(year) || !Number.isInteger(n) || n < FOUNDED_MIN || n > foundedMax()) {
      problems.founded_year = `Enter a year between ${FOUNDED_MIN} and ${foundedMax()}.`;
    }
  }
  return problems;
}

/**
 * Only what changed, in the shape the PATCH takes.
 *
 * A cleared field is sent as "" (the server treats "" and null alike) so the
 * value is actually removed; `founded_year` is sent as a number, or null when
 * cleared, because the column is an integer. Fields the read never returned
 * (the statutory pair, for a non-HR reader) are left out entirely.
 *
 * @param {Record<string,string>} initial  from profileFormFrom
 * @param {Record<string,string>} form     the edited values
 * @param {{ omit?: string[] }} [options]
 * @returns {Object} payload — `{}` means nothing changed, so don't call
 */
export function changedFields(initial, form, { omit = [] } = {}) {
  const payload = {};
  for (const key of PROFILE_FIELDS) {
    if (omit.includes(key)) continue;
    const before = String(initial[key] ?? "").trim();
    const after = String(form[key] ?? "").trim();
    if (before === after) continue;
    if (key === "founded_year") payload[key] = after ? Number(after) : null;
    else payload[key] = after;
  }
  return payload;
}
