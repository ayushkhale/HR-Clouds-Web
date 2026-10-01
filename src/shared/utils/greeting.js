// ─────────────────────────────────────────────────────────────────────────────
// greeting.js — How every dashboard greets the person signed in.
//
// It lives in one place for two reasons. The wording was drifting — employees
// got "Good morning, Aditya!" while HR and managers got "Welcome back" — and
// the three dashboards each resolved the name slightly differently, so a
// missing field showed up as an email address on one screen and a role name on
// another.
//
// The name rule is worth stating: `first_name` wins over `name`. They are not
// the same thing and `name` is not always a person's name — an account created
// from an email address can carry the local part ("mealex517") as its `name`
// while `first_name` holds what they are actually called. Falling back to an
// email address is the last resort, never the first choice.
// ─────────────────────────────────────────────────────────────────────────────

/** "Good morning" / "Good afternoon" / "Good evening", by the reader's own clock. */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const titleCase = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

/**
 * What to call this person in a greeting — their first name wherever one is
 * known, and never a whole email address.
 *
 * @param {object} user     the signed-in user from AuthContext
 * @param {string} [fallback] used when nothing usable is known yet
 */
export function firstNameOf(user, fallback = "there") {
  const first = String(user?.first_name || "").trim();
  if (first) return titleCase(first);

  const full = String(user?.name || "").trim();
  // A `name` that is really an email (or its local part) is not a name.
  if (full && !full.includes("@")) return titleCase(full.split(/\s+/)[0]);

  return fallback;
}

/** "Good morning, Aditya" — the whole line, so no screen assembles its own. */
export const greetingFor = (user, fallback) => `${greeting()}, ${firstNameOf(user, fallback)}`;
