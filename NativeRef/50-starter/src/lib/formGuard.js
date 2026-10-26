// ─────────────────────────────────────────────────────────────────────────────
// lib/formGuard.js — how a form refuses to send (CLAUDE.md §11).
//
// Ported from shared/utils/formGuard.js. One rule, every form in the app, so
// people learn it once:
//
//   THE BUTTON STAYS LIVE. THE PRESS DOES THE CHECKING.
//
// A press on an unfinished form never reaches the API. It REVEALS what is
// missing, REDDENS those boxes, and TRAVELS to the first one.
//
// Why the press and not a disabled button:
//
//  • A DEAD BUTTON DOESN'T SAY WHY. On a form of twelve boxes across three
//    folded sections, "something above is wrong" is not an answer. The press
//    can point at the box; the disabled state can only sulk.
//
//  • A FORM THAT OPENS IN RED IS HOSTILE. An empty required box is a HINT
//    until the first press and an ERROR after it — the `attempted` flag.
//    Nothing is red before somebody has claimed to be finished.
//
//  • THE CHECK HAPPENS ANYWAY. The server validates regardless, and its answer
//    names an API KEY, not a label (`field_overrides.custom_body is
//    required`). Checking first is the only way the person reads our words (§6).
//
// AND IT APPLIES TO EVERY BUTTON THAT CALLS AN API, not just the primary one.
// A preview, a "see this letter", a recalculate sends the same payload and gets
// the same 400 — a secondary button firing an unfinished form was the original
// bug (the letter forms, 14 Oct 2026).
//
// ── WHAT'S DIFFERENT ON NATIVE ───────────────────────────────────────────────
//
// There is no `document.getElementById` and no `scrollIntoView`, so "travel to
// the first problem" is done with measured layout instead:
//
//   • each field REGISTERS its y position and its input ref, via
//     `useFormFocus()` (hooks/useFormFocus.js) and Field's `register` prop
//   • the guard picks the problem with the SMALLEST y — screen order, not key
//     order, exactly as the web version uses document order. A `problems` map
//     is built field by field and then has the odd one added (a date, an
//     unanswered step), so its own key order says nothing about where the
//     boxes are
//   • it scrolls that y to roughly a third from the top and focuses the input
//
// Keys that aren't a box are prefixed with `_` (`_code`, `_subject`, `_date`)
// so they can never collide with an API payload key. They register their
// position too, so an unanswered STEP can still be travelled to.
// ─────────────────────────────────────────────────────────────────────────────

/** Is there anything standing between this form and the request? */
export const hasProblems = (problems) => Object.keys(problems || {}).length > 0;

/**
 * The hint/error switch every form needs: a required box is a plain hint until
 * the first press and an error after it.
 *
 *   const show = revealer(attempted);
 *   <Field error={show(problems.reason)} …>
 *
 * Validation that is about what somebody TYPED (a bad amount, a date in the
 * future) is passed straight through instead — that one is red immediately,
 * because they have claimed to be finished with that box.
 */
export const revealer = (attempted) => (message) => (attempted ? message : undefined);

/**
 * Disabled is for what the person CANNOT FIX BY PRESSING (CLAUDE.md §11):
 * a request in flight, a cooldown, a feature that isn't deployed, a lookup
 * that wouldn't load.
 *
 * A MISSING ANSWER IS NOT ONE OF THEM. This helper exists so the distinction is
 * written down at the call site rather than argued about per form.
 *
 * @param {{busy?: boolean, cooldownUntil?: number, unavailable?: boolean,
 *   lookupFailed?: boolean}} state
 * @returns {{ disabled: boolean, disabledReason?: string }}
 */
export function submitState({ busy, cooldownUntil, unavailable, lookupFailed } = {}) {
  if (busy) return { disabled: true, disabledReason: 'Sending…' };
  if (unavailable) return { disabled: true, disabledReason: 'This isn’t switched on for your organisation yet.' };
  if (lookupFailed) return { disabled: true, disabledReason: 'Couldn’t load everything this form needs. Pull down to try again.' };
  if (cooldownUntil && cooldownUntil > Date.now()) {
    const secs = Math.ceil((cooldownUntil - Date.now()) / 1000);
    return { disabled: true, disabledReason: `Try again in ${secs}s.` };
  }
  return { disabled: false };
}
