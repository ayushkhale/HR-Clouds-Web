// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsUi.jsx — The hub's read-only piece: the policy-surface card.
//
// The catalogue's 49 `surfaces[]` are multi-record policy tables — leave
// types, shift templates, holiday calendars — not singleton settings, so they
// have no values to edit here and have always had their own screens. The hub's
// only job with them is to point, which is the cure for the scavenger hunt the
// design brief describes (its "Pattern B: Configuration Hub").
//
// WHAT A SURFACE CARD DOES NOT DO. The brief sketches an "active defaults
// summary" inside each card — grace period 15m, work week Mon–Fri. We don't
// draw one, and that is deliberate rather than unfinished: those values live
// in the policy tables, not in the catalogue, so showing them would mean a
// read per surface against five modules, several of which 403 for a manager
// (§7 — gate on what the server returned, and never show a control that
// 403s). What the card CAN say truthfully is which rules that screen owns,
// and the catalogue tells us exactly that: the surface labels folded into the
// route.
//
// ─── THE 2026-10-10 PASS ───────────────────────────────────────────────────
// That list of rules used to be a wrapped box of every label the screen owns.
// On "Attendance Policies" that is nine of them, so a card whose whole job is
// to point at a screen grew into four lines of inventory and towered over the
// card beside it. It is now ONE line — the first few, then "+4 more" — and
// the cards are equal height with the action pinned to the bottom, so a row of
// them reads as a wall rather than a ragged skyline.
//
// EVERY CARD EXPLAINS ITSELF (user instruction, 2026-10-10, third pass). The
// one-line blurbs were already written for all twenty screens and none of them
// appeared: `surfaceBlurb` is keyed by the workspace-relative path and the hub
// hands it a path with `/dashboard/<workspace>` on the front, so every lookup
// missed and every card showed a title and a list of nouns. The lookup now
// tolerates either form, and a screen with no sentence of its own gets a plain
// one rather than nothing.
//
// WHERE THE FOUR TILES WENT. There was a strip of four numbers above the tabs
// (how many settings, how many moved off the default, how many need care, when
// anything last changed). Removed on the user's instruction, 2026-10-10: it
// was the first thing on the page and answered a question nobody opens
// Settings to ask — they arrive knowing which rule they want. The two facts
// worth keeping moved onto the thing they describe (the card's own "N moved
// off the default", beside the group it is true of), and "when did this last
// change" has a whole tab of its own.
//
// The editable group card lives in SettingsGroupForm.jsx. There used to be a
// read-only SettingsGroupCard here too, from Phase 1; the write plane
// superseded it, and keeping both would have meant two places to change every
// time a row's rendering did.
// ─────────────────────────────────────────────────────────────────────────────

import { HiArrowRight } from "react-icons/hi";
import { Link } from "react-router-dom";
import { moduleIcon, surfaceBlurb, surfaceFallbackBlurb } from "./settingsMeta";
import { META, TEXT } from "./settingsText";

const CARD = "bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden";

/** How many rule names fit on one line before the rest become a count. */
const RULES_ON_ONE_LINE = 3;

/**
 * A policy surface: a multi-record area (leave types, shifts, holidays) that
 * has always had its own screen. The hub only points at it, which is the whole
 * cure for the scavenger hunt the brief describes.
 *
 * The whole card is the link, so the target is the card rather than a small
 * word at the end of it — which means the "Manage" affordance inside is a
 * styled span, not a nested button. Without a path there is nothing to point
 * at, and a card that looks clickable but isn't is the same lie as a button
 * that 403s (§2), so it renders as plain text instead.
 */
export function SurfaceHubCard({ surfaces, to }) {
  const first = surfaces[0];
  const title = to?.label || first.label;
  // EVERY CARD SAYS WHAT ITS SCREEN IS FOR (user instruction, 2026-10-10).
  // They were all silent, and not because the sentences were missing: the hub
  // prefixes each path with the reader's workspace, and `surfaceBlurb` was
  // keyed by the workspace-relative one, so all twenty lookups missed. That is
  // fixed in settingsMeta; the fallback is here so a screen nobody has written
  // a line for yet still explains itself rather than showing a bare noun.
  const blurb = surfaceBlurb(to) || surfaceFallbackBlurb(to?.label || first.label);
  const Icon = moduleIcon(first.module_key);

  // Each surface is one rule this screen owns; naming them tells the reader
  // whether the thing they came for is in there, which a count can't. When the
  // only surface IS the screen (one registry entry, the same words as the
  // link), that list is the title typed twice, so it is dropped.
  const rules = surfaces
    .map((s) => s.label)
    .filter((label) => label.toLowerCase() !== title.toLowerCase());
  const shown = rules.slice(0, RULES_ON_ONE_LINE);
  const extra = rules.length - shown.length;

  const Shell = to?.path ? Link : "div";
  const shellProps = to?.path
    ? { to: to.path, className: `${CARD} group flex flex-col h-full hover:border-purple-200 hover:shadow-sm transition` }
    : { className: `${CARD} flex flex-col h-full` };

  return (
    <Shell {...shellProps}>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 inline-flex items-center justify-center">
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900 group-hover:text-purple-800 transition truncate">
            {title}
          </h3>
          {/* The footer bar that used to sit here said "Manage <title>" under
              a card already titled <title>, in a card that is itself the
              link. Three statements of the same fact. The arrow on the right
              of the row carries it now. The blurb stays — it is the one line
              that says something the title doesn't (user instruction,
              2026-10-10). */}
          {blurb && <p className={`text-xs ${TEXT.body} mt-1 leading-relaxed line-clamp-2`}>{blurb}</p>}
          {/* One line, always. `truncate` is the backstop for a long first
              label; the count is what keeps the card honest about the rest. */}
          {shown.length > 0 && (
            <p className={`${META} mt-1.5 truncate`}>
              {shown.join(" · ")}
              {extra > 0 && <span> · +{extra} more</span>}
            </p>
          )}
        </div>
        {to?.path && (
          <HiArrowRight
            aria-hidden="true"
            className="shrink-0 w-4 h-4 mt-1 text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition"
          />
        )}
      </div>
    </Shell>
  );
}
