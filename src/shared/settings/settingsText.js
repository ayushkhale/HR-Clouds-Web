// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsText.js — The ONE place the settings screens get their text
// shades from.
//
// WHY A FILE FOR SIX CLASS NAMES. The hub is mostly prose: a group blurb, a
// sentence under every field, a meta line, a filter label. Those sentences were
// written at `slate-400`/`slate-500`, which is the shade the rest of the
// product uses for furniture — but here the furniture IS the content, and at
// 11px on a bright card it read as switched off (user, 2026-10-10: "the opacity
// of words is much low"). Every one of them now comes from this table, one
// step darker.
//
// ─── HOW TO UNDO THE DARKENING, IN ONE EDIT ────────────────────────────────
// Flip `DARKENED` to `false`. That restores the exact shades every one of
// these screens had before 2026-10-10 — the `BEFORE` column below is the old
// value, verbatim — and nothing else about the layout moves. That is the whole
// reason this indirection exists rather than fifty inline class names: the
// change was asked for provisionally, so it had to be revertible without a
// hunt through six files.
//
// Sizes live here too where the darkening came with one (a caption went from
// 11px to the 12px `text-xs` that Payroll Settings uses — same pass, same
// decision, so the same switch has to take both back).
// ─────────────────────────────────────────────────────────────────────────────

/** The 2026-10-10 contrast pass. `false` = exactly how it read before it. */
const DARKENED = true;

/*                        DARKENED              BEFORE (pre-2026-10-10)
   body      a sentence   slate-700             slate-600
   value     a figure     slate-900             slate-800
   label     a field name slate-600             slate-500
   caption   field help   slate-600, 12px       slate-500, 11px
   meta      a count/date slate-500             slate-400
   faint     an aside     slate-500             slate-400                */
export const TEXT = DARKENED
  ? {
    body: "text-slate-700",
    value: "text-slate-900",
    label: "text-slate-600",
    caption: "text-slate-600",
    captionSize: "text-xs",
    meta: "text-slate-500",
    faint: "text-slate-500",
  }
  : {
    body: "text-slate-600",
    value: "text-slate-800",
    label: "text-slate-500",
    caption: "text-slate-500",
    captionSize: "text-[11px]",
    meta: "text-slate-400",
    faint: "text-slate-400",
  };

/** The sentence under a field: what it does, in the catalogue's own words. */
export const CAPTION = `${TEXT.captionSize} ${TEXT.caption} leading-relaxed`;

/** A field's name, above its control. */
export const FIELD_LABEL = `block text-[11px] font-bold uppercase tracking-wide ${TEXT.label}`;

/** A count, a date, a "3 settings" line — true but secondary. */
export const META = `text-[11px] ${TEXT.meta}`;

/** What a card or an area is for, in one line. */
export const BLURB = `text-xs ${TEXT.body} leading-relaxed`;
