// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterFormStep.jsx — One numbered block of a letter form.
//
// It exists as a file rather than twice as a local helper because the two letter
// forms — IssueLetterDialog (#139, one person) and BulkIssueLettersDialog (#143,
// many) — are the same product seen twice. HR who has learnt one must recognise
// the other at a glance, so the numbered badge, the fold control, the blurb and
// the 34px indent are shared code now: the old copies carried the comment
// "matching the single-issue dialog exactly" and had already stopped matching.
//
// Two slots are what the two forms differ by:
//
//  · `onToggle` makes the step FOLD. The letter catalog is the tallest thing on
//    either form and is answered once, in the first second; folding it on a pick
//    puts "who it is for" and the date on screen without a scroll, and `summary`
//    keeps the chosen letter visible so the fold never hides the answer.
//
//  · `aside` puts a control on the heading line, right-aligned — the house
//    toolbar shape of tabs/heading left, search right. It is deliberately in the
//    heading row and not above the content: a search box stacked under the
//    heading reads as the step's first field, which it is not.
//
// At 390px the aside drops to its own full-width line (order-last) so it never
// squeezes the title or the fold button; both only share a line from `sm` up.
// ─────────────────────────────────────────────────────────────────────────────

import { HiChevronDown, HiDocumentText } from "react-icons/hi";

/**
 * @param {object} props
 * @param {number|string} props.n        the step number in the badge
 * @param {string} props.title
 * @param {string} [props.blurb]         one line under the title, hidden while folded
 * @param {string} [props.summary]       the answer, shown in the heading while folded
 * @param {React.ReactNode} [props.aside] right-aligned control on the heading line
 * @param {boolean} [props.open]
 * @param {() => void} [props.onToggle]  its presence is what makes the step fold
 * @param {React.ReactNode} props.children
 */
export default function LetterFormStep({ n, title, blurb, summary, aside, open = true, onToggle, children }) {
  const collapsible = typeof onToggle === "function";
  return (
    <section>
      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-sm font-bold text-slate-800 shrink-0">{title}</h3>
            {collapsible && !open && summary && (
              <span className="inline-flex items-center gap-1.5 min-w-0 text-xs font-bold text-purple-700">
                <HiDocumentText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{summary}</span>
              </span>
            )}
            {aside && open && (
              <div className="order-last w-full min-w-0 sm:order-none sm:ml-auto sm:w-auto">{aside}</div>
            )}
            {collapsible && (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className={`ml-auto inline-flex items-center gap-1 shrink-0 text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:underline ${aside && open ? "sm:ml-0" : ""}`}
              >
                {open ? "Hide" : "Change"}
                <HiChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
          {blurb && open && <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{blurb}</p>}
        </div>
      </div>
      {open && <div className="pl-0 sm:pl-[34px]">{children}</div>}
    </section>
  );
}
