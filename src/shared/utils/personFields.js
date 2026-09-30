// ─────────────────────────────────────────────────────────────────────────────
// personFields.js — Reading gender and photo off a person-shaped row.
//
// These lived in GenderAvatar.jsx, but the employee-directory store needs them
// too and must not import a component (GenderAvatar reads the directory, so
// that would be a cycle). GenderAvatar re-exports them, so existing imports
// keep working.
//
// List rows nest a person in a dozen different ways — `user`, `employee`,
// `profile`, `user.employee_profile`, … — and any of them may carry the two
// fields. Looking in all of them is why the same colleague looks the same on
// every screen.
// ─────────────────────────────────────────────────────────────────────────────

/** "Male" / "M" / "man" → "male"; "Female" / "F" / "woman" → "female"; else null. */
export function normalizeGender(value) {
  const g = String(value || "").trim().toLowerCase();
  if (["male", "m", "man"].includes(g)) return "male";
  if (["female", "f", "woman"].includes(g)) return "female";
  return null;
}

// Where a row may keep the person. Since 29 Sep 2026 (R-5) the backend puts
// `gender` on the embedded role profiles, which list rows nest under `user`
// (`user.employee_profile`, …) — so those are looked at too.
export const nestedPeople = (person) => [
  person, person?.profile, person?.user, person?.user?.profile,
  person?.user?.employee_profile, person?.user?.manager_profile, person?.user?.hr_profile,
  person?.applicant, person?.applicant?.profile, person?.employee,
  person?.employee_profile, person?.manager_profile, person?.hr_profile,
].filter((x) => x && typeof x === "object");

/** Gender from flat or nested profile shapes. */
export function genderOf(person) {
  if (!person || typeof person !== "object") return null;
  for (const obj of nestedPeople(person)) {
    const g = normalizeGender(obj.gender);
    if (g) return g;
  }
  return null;
}

const URL_KEYS = ["avatar_url", "avatar", "photo_url", "profile_picture", "profile_image", "image_url"];

/** The person's real photo URL (e.g. an S3 link) from flat or nested shapes, or "". */
export function avatarUrlOf(person) {
  if (!person || typeof person !== "object") return "";
  for (const obj of nestedPeople(person)) {
    for (const key of URL_KEYS) {
      const v = obj[key];
      if (typeof v === "string" && /^(https?:|data:image\/|blob:|\/)/i.test(v.trim())) return v.trim();
    }
  }
  return "";
}

/** Every user id and email the row carries, for a directory lookup. */
export function personKeys(person) {
  const keys = [];
  for (const obj of nestedPeople(person)) {
    for (const key of ["user_id", "id", "email", "identifier"]) {
      if (typeof obj[key] === "string" && obj[key]) keys.push(obj[key]);
    }
  }
  return keys;
}
