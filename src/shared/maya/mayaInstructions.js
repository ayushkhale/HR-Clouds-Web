// ─────────────────────────────────────────────────────────────────────────────
// mayaInstructions.js — the lines added SILENTLY to what is sent to Maya
// (user decision, 2026-10-02). They ride on the request only: the chat bubble
// and the conversation history keep exactly what the person wrote, so a later
// turn never repeats an instruction back.
//
// • A question that came from an ⓘ "Ask Maya" link asks for an example: the
//   hint already gave the definition, an example is what makes it land. It
//   still counts as that question if the person edits it before sending; it
//   stops counting once they empty the box (they are writing their own).
// • The chosen language (Maya's language switch) asks for the answer in it,
//   however the question itself was typed. English adds nothing.
//
// The widget keeps INSTRUCTION_RESERVE characters free under Maya's live query
// limit, so adding these never pushes a full-length question over it.
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_LINE = "Give an example of it.";

/** What each language adds to a question. Keys are VOICE_LANGS values. */
const ANSWER_LINE = {
  "en-IN": "",
  "hi-IN": "Answer in Hindi, in Devanagari script.",
  hinglish: "Answer in Hinglish: Hindi written in Roman letters, keeping English HR words in English.",
};

/** The longest instruction block that can be added, plus its separator. */
export const INSTRUCTION_RESERVE =
  2 + EXAMPLE_LINE.length + 1 + Math.max(...Object.values(ANSWER_LINE).map((l) => l.length));

/**
 * The hidden lines for one question, or "" when there are none.
 * @param {{ fromHint?: boolean, lang?: string }} options
 */
export function mayaInstructions({ fromHint = false, lang = "en-IN" } = {}) {
  return [fromHint ? EXAMPLE_LINE : "", ANSWER_LINE[lang] || ""].filter(Boolean).join(" ");
}
