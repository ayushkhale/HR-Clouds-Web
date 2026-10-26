// ─────────────────────────────────────────────────────────────────────────────
// utils/formGuard.js — How a form refuses to send (CLAUDE.md §11).
//
// One rule, everywhere: THE BUTTON STAYS LIVE AND THE PRESS DOES THE CHECKING.
// A press on an unfinished form never reaches the API — it reveals what is
// missing, turns those boxes red and takes the person to the first one.
//
// Why the press and not a disabled button:
//
//  · A DEAD BUTTON DOESN'T SAY WHY. "See this letter" went grey (or worse, fired
//    and came back 400) with the reason sitting in a footnote nobody reads, and
//    on a form of twelve boxes across three folded steps "something above is
//    wrong" is not an answer. The press can point at the box; the disabled state
//    can only sulk.
//
//  · A FORM THAT OPENS IN RED IS HOSTILE. So a required box empty is a HINT
//    until the first press and an ERROR after it — the `attempted` flag every
//    form here keeps, passed down as `revealRequired`. Nothing is red before
//    somebody has claimed to be finished.
//
//  · THE CHECK HAS TO HAPPEN ANYWAY. The server validates regardless, and its
//    answer names an API key, not a label ("field_overrides.custom_body is
//    required"). Checking first is the only way the person reads our words.
//
// What this file does NOT cover: a control the PERSON cannot make ready — a
// rate-limit cooldown, a paused feature, an in-flight request, a renderer the
// server hasn't got. Those stay `disabled`, because pressing is genuinely not
// the next step (CLAUDE.md §2: never show a button that 403s).
//
// Shape of a `problems` map, which is what every form here already builds:
// `{ [fieldKey]: "what is wrong with it" }`, empty when the form may be sent.
// Keys that aren't a field — a step not answered yet — are prefixed with `_`
// so they cannot collide with an API payload key.
// ─────────────────────────────────────────────────────────────────────────────

/** Anything the browser will put a caret or a focus ring on. */
const FOCUSABLE = "input:not([type=hidden]),select,textarea,button,[tabindex]";

/**
 * The element a problem key points at, or `null` when it isn't on screen.
 *
 * A key may name a whole block rather than one box — the letter picker, a
 * person list — so the first control inside it is taken. That is what lets
 * "this step isn't answered" lead somewhere without every step having to own a
 * dummy input.
 */
function problemElement(key, idFor) {
  const id = typeof idFor === "function" ? idFor(key) : `${idFor}-${key}`;
  const host = id ? document.getElementById(id) : null;
  if (!host) return null;
  if (host.matches(FOCUSABLE)) return host;
  return host.querySelector(FOCUSABLE) || host;
}

/**
 * Whichever of these the person meets first on the way down the form.
 *
 * Document order, not the order of the keys: a `problems` map is built field by
 * field and then has the odd one added to it (a date, an unanswered step), so
 * its own order says nothing about where the boxes actually are.
 */
function firstOnScreen(elements) {
  return elements.reduce((first, el) => {
    if (!first) return el;
    const earlier = first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING;
    return earlier ? el : first;
  }, null);
}

/** Is there anything standing between this form and the request? */
export const hasProblems = (problems) => Object.keys(problems || {}).length > 0;

/**
 * Take the person to the first thing that needs them, and say whether the form
 * must not be sent.
 *
 * Call it at the top of every submit handler and return on `true`:
 *
 * ```js
 * const send = async () => {
 *   if (busy) return;
 *   if (focusFirstProblem(blockers(), idFor)) { setAttempted(true); return; }
 *   …
 * };
 * ```
 *
 * @param {Record<string,string>} problems  field key → what is wrong with it
 * @param {((key: string) => string)|string} idFor  the DOM id for a key, or the
 *   form's id prefix when they are all `${prefix}-${key}`
 * @returns {boolean} true when something is wrong, so the caller sends nothing
 */
export function focusFirstProblem(problems, idFor) {
  if (!hasProblems(problems)) return false;

  const target = firstOnScreen(
    Object.keys(problems).map((key) => problemElement(key, idFor)).filter(Boolean),
  );
  if (target) {
    // Scrolled first and then focused WITHOUT a second scroll: focus() scrolls
    // too, and its instant jump cuts the smooth one short halfway.
    try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* older engines take no options */ }
    try { target.focus({ preventScroll: true }); } catch { /* a block, not a box */ }
  }
  // True even when nothing was found: a problem we can't point at is still a
  // problem, and sending anyway is how the 400 got in front of the person.
  return true;
}
