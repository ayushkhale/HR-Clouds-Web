// ─────────────────────────────────────────────────────────────────────────────
// LetterPreviewDialog.jsx — A letter or letterhead proof as a real A4 PDF. The
// viewer itself is the shared `PdfPreviewDialog`; what lives here is everything
// specific to LETTERS, which is the part that must not drift:
//
//   · WHICH PREVIEW THIS IS. Two endpoints draw a letter and they differ in the
//     one way that matters to the person reading it:
//       #134 / #138 use MADE-UP details — no employee's name, pay or dates.
//       #271 uses the REAL subject's facts, watermarked, saved nowhere.
//     Pass `subject` (the person's name) for the second. The footer changes
//     accordingly, because the whole safeguard around #138 is that nobody
//     mistakes a sample for a letter, and the whole value of #271 is that the
//     figures ARE the person's — telling HR "these details are invented" over a
//     real salary would destroy the point of the screen.
//   · WHEN "TRY AGAIN" IS HONEST. A spent hourly quota and a renderer that was
//     never switched on are both cured by waiting, so no retry is offered
//     there; a busy or unreachable renderer is worth one.
//   · THE WORDS. `letterErrorMessage` rebuilds a 422 around the field that came
//     out blank, which is the whole value of that message.
//
// Rendered as a SIBLING of DetailDialog or of the issue form, never a child.
// ─────────────────────────────────────────────────────────────────────────────

import PdfPreviewDialog from "../pdf/PdfPreviewDialog";
import {
  isFeatureNotDeployed, isPreviewRateLimited, isPreviewTransient, isRendererNotConfigured,
  letterDraftErrorMessage, letterErrorMessage,
} from "../utils/documentErrors";

/**
 * Waiting, not asking again, is the only cure for these three: a spent hourly
 * quota, a renderer that was never switched on, and a server that is a release
 * behind and has no such route to call.
 */
const letterRetryable = (err) =>
  !isRendererNotConfigured(err) && !isPreviewRateLimited(err) && !isFeatureNotDeployed(err);

/**
 * A preview that broke on the way out touched nothing: no saved wording, no
 * letterhead, and — for #271 — no reference number. Worth saying, because a red
 * panel on the most consequential form in the module reads as "I have half
 * issued a letter".
 */
const letterErrorNote = (err) => (isPreviewTransient(err) ? "Nothing you’ve set up was affected." : "");

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {() => Promise<{ blob: Blob, filename?: string }>} props.render  the preview call
 * @param {string} [props.subject]  the real person this page was drawn for (#271).
 *   Its absence means a sample render, and the footer says so.
 * @param {string} [props.note]  one line about what this particular preview used
 * @param {(err: unknown) => void} [props.onError]  told about a failed render, so the
 *   screen behind can stop offering previews the server plainly can't do
 * @param {() => void} props.onClose
 */
export default function LetterPreviewDialog({ title, subtitle, render, subject = "", note, onError, onClose }) {
  const real = !!subject;
  return (
    <PdfPreviewDialog
      eyebrow={real ? "Draft — not issued" : "Preview only"}
      title={title}
      subtitle={subtitle}
      render={render}
      errorMessage={real ? letterDraftErrorMessage : letterErrorMessage}
      fallback={real ? "Couldn’t draw this draft." : "Couldn’t draw this letter."}
      retryable={letterRetryable}
      errorNote={letterErrorNote}
      fallbackName={real ? "letter-draft.pdf" : "letter-preview.pdf"}
      onError={onError}
      onClose={onClose}
      footnote={
        <>
          {real ? (
            <>
              <span className="font-bold text-slate-600">This is a draft, not an issued letter.</span>{" "}
              It is drawn from {subject}’s own record and stamped PREVIEW across every page. Nothing has been issued:
              no reference number has been used, nothing is saved, and {subject} cannot see it.
            </>
          ) : (
            <>
              <span className="font-bold text-slate-600">This is a test page, not a real letter.</span>{" "}
              It is stamped PREVIEW across every page and filled with made-up details — no employee’s name, pay or dates
              are used, and nothing is saved to anyone’s file.
            </>
          )}
          {note && <span className="block mt-1 font-semibold text-fuchsia-700">{note}</span>}
        </>
      }
    />
  );
}
