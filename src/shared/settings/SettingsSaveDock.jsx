// ─────────────────────────────────────────────────────────────────────────────
// settings/SettingsSaveDock.jsx — The strip pinned to the bottom of the
// settings hub: whether anything is unsaved, which card it is in, and the one
// place to save or drop the lot.
//
// The register behind it, and why "save all" is several requests rather than
// one, is in settingsDock.js. This file is only the strip.
//
// It is `sticky`, not `fixed`: fixed would float over the page's own bottom
// padding and sit on top of the last card's footer buttons at short viewport
// heights. Sticky keeps it in the document, so the content can scroll clear of
// it. Below the toasts (`z-[200]`) and with nothing of its own in the dialog
// stack — it is page furniture, not a layer (§3's stacking order).
//
// IT HAS TO GET OUT OF MAYA'S WAY. The "Ask Maya" launcher is `fixed bottom-6
// right-6 z-[70]` (ChatbotWidget) — the same corner as this bar, and ten
// stacking levels above it, so it sat squarely on top of Save. Raising the
// dock instead would only swap which control is unreachable. So the bar
// reserves her footprint rather than fighting her:
//   · from `sm` up, the buttons are right-aligned, so the gutter goes on the
//     right (the pill is ~155px from the viewport edge; 11rem clears it),
//   · below `sm` there is no room for a 11rem gutter, and the buttons have
//     wrapped onto their own line anyway, so the gutter goes UNDERNEATH — she
//     is 68px tall from the bottom edge, and 5rem of padding puts the buttons
//     above her.
// Both are skipped entirely when the launcher is switched off, which is a
// per-browser preference anyone can set from their profile — reserving space
// for something that isn't there is its own kind of wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { HiCheck, HiCheckCircle, HiExclamationCircle } from "react-icons/hi";
import { useMayaVisibility } from "../hooks/useMayaVisibility";
import { TEXT } from "./settingsText";

const PRIMARY = "px-4 py-2 rounded-xl text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2";
const GHOST = "px-3.5 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50";

/**
 * @param {object} props
 * @param {object[]} props.cards  one entry per unsaved card
 * @param {number} props.total    unsaved settings across all of them
 * @param {(key: string) => void} props.onReveal  bring a named card into view.
 *   The PAGE owns this rather than the dock, because a card can be dirty while
 *   hidden behind a search, and scrolling to something `display:none` does
 *   nothing — the page has to drop the search first.
 */
export default function SettingsSaveDock({ cards, total, saving, onReveal, onSaveAll, onDiscardAll }) {
  const dirty = total > 0;
  const { hidden: mayaHidden } = useMayaVisibility();
  // See the header: her corner is this bar's corner.
  const mayaGutter = mayaHidden ? "" : "pb-20 sm:pb-3 sm:pr-44";

  return (
    <div
      className={`sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 mt-2 px-4 sm:px-6 lg:px-8 py-3 bg-white/85 backdrop-blur-md border-t border-slate-200 ${mayaGutter}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-xs ${TEXT.body} min-w-0 flex items-start gap-2`}>
          {dirty ? (
            <>
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5 text-fuchsia-500" />
              <span className="min-w-0">
                <span className={`font-bold ${TEXT.value}`}>
                  {total} unsaved change{total === 1 ? "" : "s"}
                </span>
                {" in "}
                {/* Naming the card is the whole point: "you have unsaved
                    changes" somewhere on a page of eleven cards is an alarm
                    without an address. */}
                {cards.map((card, i) => (
                  <span key={card.key}>
                    {i > 0 && ", "}
                    <button
                      type="button"
                      onClick={() => onReveal?.(card.key)}
                      className="font-bold text-purple-700 hover:text-purple-900 underline underline-offset-2"
                    >
                      {card.label}
                    </button>
                  </span>
                ))}
              </span>
            </>
          ) : (
            <>
              <HiCheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />
              <span>Everything on this page is saved.</span>
            </>
          )}
        </p>

        {dirty && (
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={onDiscardAll} disabled={saving} className={GHOST}>
              Discard changes
            </button>
            <button type="button" onClick={onSaveAll} disabled={saving} className={PRIMARY}>
              {saving
                ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                : <><HiCheck className="w-4 h-4" /> Save {cards.length > 1 ? "all changes" : "changes"}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
