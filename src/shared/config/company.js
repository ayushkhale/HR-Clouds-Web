// ─────────────────────────────────────────────────────────────────────────────
// company.js — the legal identity of the business behind HR Clouds.
//
// The legal pages read from here so the entity details appear in exactly one
// place. Anything left empty is OMITTED from the rendered page rather than
// printed as a placeholder — a policy that says "registered at [ADDRESS]" is
// worse than one that doesn't mention an address at all.
//
// ⚠️ Fill these in before the legal pages go live. A privacy policy for a
// payroll product is a statutory document under the DPDP Act 2023; it needs a
// named grievance officer and a real registered address to be effective.
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANY = {
  /** Trading name shown throughout the site. */
  name: "HR Clouds",

  /** Registered legal entity — taken from the footer copyright line. */
  legalName: "HR Vista Soft Solutions LLP",

  /** Registered office address, as filed. */
  registeredAddress: "",

  /** Corporate Identity Number issued by the MCA. */
  cin: "",

  /** GST registration number. */
  gstin: "",

  /** General contact — already live on the pricing page. */
  supportEmail: "hello@hrclouds.in",

  /** Where privacy requests go. Falls back to supportEmail when unset. */
  privacyEmail: "",

  /** DPDP Act 2023 requires a named grievance officer for personal data. */
  grievanceOfficer: { name: "", email: "" },

  /** Governing jurisdiction for the terms, e.g. "Bengaluru, Karnataka". */
  jurisdiction: "India",

  /**
   * Company profile URLs. The footer previously linked to https://linkedin.com
   * and https://twitter.com — the networks' own homepages, which advertise a
   * presence that isn't there. Only a filled-in entry is rendered; leave a
   * network blank and its icon simply doesn't appear.
   */
  social: {
    linkedin: "",
    twitter: "",
    facebook: "",
    instagram: "",
  },
};

/** The address for privacy matters, falling back to general support. */
export const privacyContact = () => COMPANY.privacyEmail || COMPANY.supportEmail;

/** The grievance officer's address, falling back to privacy then support. */
export const grievanceContact = () =>
  COMPANY.grievanceOfficer.email || privacyContact();

/** True when enough entity detail exists to print an "About the entity" block. */
export const hasEntityDetails = () =>
  Boolean(COMPANY.legalName || COMPANY.registeredAddress || COMPANY.cin || COMPANY.gstin);

/**
 * The date the policies were last substantively changed. Update this by hand
 * when the text changes — deriving it from a build date would silently claim a
 * revision every time the site is deployed.
 */
export const POLICY_LAST_UPDATED = "23 September 2026";
