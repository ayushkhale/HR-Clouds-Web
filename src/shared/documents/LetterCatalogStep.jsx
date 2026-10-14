// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterCatalogStep.jsx — Step 1 of both letter forms: pick the kind
// of letter. Shared by IssueLetterDialog (#139) and BulkIssueLettersDialog
// (#143) so the two cannot drift apart again — HR who learnt one form has
// learnt the other, and this step is the first thing they see on each.
//
// Why it owns its own search and fold state rather than taking them as props:
// neither is an answer the form needs. The parent only ever cares WHICH letter
// was picked, so keeping the rest here is what stops the two parents
// implementing it twice and differently.
//
//  · THE SEARCH IS IN THE HEADING, NOT ABOVE THE CARDS. House toolbar shape
//    (heading/tabs left, search right). Stacked under the heading it read as
//    this step's first field, which it is not. It matches the catalog's TITLE
//    and its raw code: the code is never shown (§4) but it is how these letters
//    are named in every other system, so "exp" finding the experience letter is
//    what somebody typing that expects. Underscores are flattened so
//    "salary revision" matches `salary_revision_letter` too.
//
//  · IT FOLDS ON A PICK. Four across still runs to several rows once an
//    organisation switches on its letters, and this question is answered once
//    in the first second; folded, the rest of the form fits a 1366×768 screen
//    without a scroll (§3). The chosen letter stays in the heading, so the fold
//    never hides the answer.
//
//  · THE SEARCH IS NOT CLEARED ON A PICK. Reopening with the same filter still
//    shows the letter that was chosen, which is the only reason to reopen.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { HiDocumentText, HiInformationCircle, HiSearch, HiX } from "react-icons/hi";
import LetterFormStep from "./LetterFormStep";
import { letterTitle } from "./letterMeta";

/**
 * @param {object} props
 * @param {number|string} [props.n]       the step number
 * @param {string} [props.id]             on the cards, for the form guard to
 *   scroll to and focus when no letter has been chosen yet
 * @param {string} [props.problem]        "you haven't chosen one", once the
 *   person has pressed a button that needs it (CLAUDE.md §11)
 * @param {string} [props.blurb]          one line under the title
 * @param {object[]} props.rows           the letters that can actually be issued
 * @param {string} props.value            the chosen `code`, "" for none
 * @param {(code: string) => void} props.onPick
 * @param {boolean} [props.disabled]
 */
export default function LetterCatalogStep({ n = 1, id, problem = "", blurb, rows, value, onPick, disabled = false }) {
  const [query, setQuery] = useState("");
  // Initial only: a letter preselected by the screen behind is already answered.
  const [folded, setFolded] = useState(!!value);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = `${letterTitle(row)} ${String(row.code || "").replace(/_/g, " ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query]);

  const chosen = useMemo(() => rows.find((row) => row.code === value) || null, [rows, value]);
  // Never folded while nothing is chosen: dropping a preselected letter that
  // turns out not to be issuable would otherwise hide the catalog for good.
  const open = !value || !folded;

  return (
    <LetterFormStep
      n={n}
      id={id}
      title="Which letter"
      blurb={blurb}
      summary={chosen ? letterTitle(chosen) : ""}
      open={open}
      onToggle={value ? () => setFolded((f) => !f) : undefined}
      aside={(
        <div className="relative">
          <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder="Search letters…"
            aria-label="Search the letters you can issue"
            className="h-10 w-full sm:w-56 pl-9 pr-8 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none disabled:opacity-60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
              aria-label="Clear the letter search"
            >
              <HiX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    >
      {shown.length === 0 ? (
        <p className="flex flex-wrap items-start gap-x-1.5 gap-y-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
          <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
          <span>No letter you have switched on matches “{query.trim()}”.</span>
          <button type="button" onClick={() => setQuery("")} className="font-bold text-purple-600 hover:underline">
            Show all {rows.length}
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {shown.map((row) => {
            const picked = row.code === value;
            return (
              <button
                key={row.code}
                type="button"
                onClick={() => { onPick(row.code); setFolded(true); }}
                aria-pressed={picked}
                disabled={disabled}
                className={`text-left rounded-xl border px-4 py-3 transition disabled:opacity-60 ${picked ? "border-purple-300 bg-purple-50/70 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
              >
                <span className="flex items-center gap-2">
                  <HiDocumentText className={`w-4 h-4 shrink-0 ${picked ? "text-purple-600" : "text-slate-400"}`} />
                  <span className="text-sm font-bold text-slate-800 truncate">{letterTitle(row)}</span>
                </span>
                <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {row.has_saved_fields ? "Your saved wording is filled in automatically." : "Uses the standard wording."}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {problem && <p className="text-[11px] font-semibold text-rose-600 mt-2">{problem}</p>}
    </LetterFormStep>
  );
}
