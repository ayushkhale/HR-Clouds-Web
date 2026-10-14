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
//
// ─── THE HEADINGS, AND WHY THEY ARE A SECOND SWITCH ────────────────────────
// `BIGGER_HEADINGS` is the 2026-10-14 pass ("increase the size of headings a
// bit more and a bit bold"). It is deliberately NOT the same switch as the
// darkening: that one is about shade, this one about size and weight, and the
// two were asked for four days apart. Undoing one must not undo the other.
//
// The sizes only work because the sentence under every field left the card on
// the same day (see settingsBlurbs.js: it is ⓘ help now). A card is a short
// stack of labels and controls again, so the headings can take the room the
// prose was using — which is the whole point of making them bigger. Put the
// sentences back and these sizes become a wall of shouting.
// ─────────────────────────────────────────────────────────────────────────────

/** The 2026-10-10 contrast pass. `false` = exactly how it read before it. */
const DARKENED = true;

/* TWO ROUNDS DEEP. The 2026-10-10 column was already one step darker than
   the product's furniture shades; it was still being read through on 15 Oct
   ("the text color is also need to get a bit bolder here in the settings page
   as due to high white background it is hard to read easily"), which is what
   a bright white card does to slate-500 — the page is white nearly edge to
   edge, so there is no mid-grey anywhere for a grey word to sit against.
   Everything moved one more step. `value` cannot: it is already slate-900.

                        NOW (15 Oct)   10 OCT       BEFORE (pre-2026-10-10)
   body      a sentence   slate-800     slate-700    slate-600
   value     a figure     slate-900     slate-900    slate-800
   label     a field name slate-700     slate-600    slate-500
   caption   field help   slate-700     slate-600    slate-500, 11px
   meta      a count/date slate-600     slate-500    slate-400
   faint     an aside     slate-600     slate-500    slate-400            */
export const TEXT = DARKENED
  ? {
    body: "text-slate-800",
    value: "text-slate-900",
    label: "text-slate-700",
    caption: "text-slate-700",
    captionSize: "text-xs",
    meta: "text-slate-600",
    faint: "text-slate-600",
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

/** The heading pass, 14 and 15 Oct 2026 (one ask, then "a bit more").
 *  `false` = exactly how they read before either of them. */
const BIGGER_HEADINGS = true;

/* A SCALE, NOT SIX SIZES. Every heading on the page is a step on one ladder,
   so a reader can tell what contains what without reading a word:

     page   "Settings"                 text-2xl bold     (OrgSettingsPage's h1)
     band   the open tab's name        text-[22px] extrabold
     section"Managed on their own …"   text-lg bold
     card   a settings group           text-[17px] bold
     shelf  a run of fields in a card  text-[15px] bold
     field  one field's name           text-xs bold uppercase

   THE SHELF HEADING STOPPED SHOUTING. It was 11-12px uppercase with wide
   tracking — a label, the same shape as a field name two lines below it, so a
   run of fields looked like it began at the wrong place. At 15px sentence
   case it is plainly a heading, which is what was asked for ("we can keep the
   text 'Earned days off' but this should look like heading").

                           NOW (15 Oct)        14 OCT                  BEFORE
   band    the open tab     text-[22px] xbold  text-xl bold            text-lg
   section a page section   text-lg bold       (none: an 11px label)   —
   card    a settings group text-[17px] bold   text-[17px] bold        text-[15px]
   shelf   a run of fields  text-[15px] bold   text-xs uppercase       text-[11px]
   field   one field's name text-xs            text-xs                 text-[11px] */
const HEADING = BIGGER_HEADINGS
  ? {
    band: "text-[22px] font-extrabold",
    section: "text-lg font-bold",
    card: "text-[17px] font-bold",
    shelf: "text-[15px] font-bold",
    field: "text-xs",
  }
  : {
    band: "text-lg font-bold",
    section: "text-[11px] font-bold uppercase tracking-wider",
    card: "text-[15px] font-semibold",
    shelf: "text-[11px] font-bold uppercase tracking-wider",
    field: "text-[11px]",
  };

/** A sentence of help where one is still printed as text, not behind an ⓘ:
 *  a change record, or the reason a card can't be opened. NOT in a card's
 *  fields any more — that is what the ⓘ is for (settingsBlurbs.js). */
export const CAPTION = `${TEXT.captionSize} ${TEXT.caption} leading-relaxed`;

/** The open tab's name, over its cards. The page's second-loudest thing. */
export const BAND_TITLE = `${HEADING.band} text-slate-900`;

/** A heading that STARTS SOMETHING ELSE on the page — "Managed on their own
 *  screens", which is a list of links, not settings. It was an 11px uppercase
 *  label, so the change of subject under it read as a caption on the cards
 *  above (user, 15 Oct: "this starts a new UI/UX so the heading should be
 *  big"). Level between the band and a card: it divides the tab, but it
 *  doesn't rename it. */
export const SECTION_TITLE = `${HEADING.section} text-slate-900`;

/** A tab's own label in the strip. The strip itself is the shared FilterTabs
 *  (`text-xs`), which other screens use at that size and must keep — so the
 *  one extra pixel the settings tabs asked for rides on the label NODE this
 *  page hands it, not on the component. */
export const TAB_LABEL = "text-[13px]";

/** A settings group's name, on the card that opens it. */
export const CARD_TITLE = `${HEADING.card} text-slate-900`;

/** The same name on a card that can't be opened — locked, or failed to load.
 *  A separate token rather than an override: two `text-slate-*` classes on one
 *  element are decided by Tailwind's own order in the sheet, not by ours. */
export const CARD_TITLE_MUTED = `${HEADING.card} text-slate-500`;

/** A shelf of related fields inside one card ("Provident Fund"). A heading
 *  now, not a label — see the scale above. Slate-900 rather than the label
 *  shade for the same reason: it names a part of the card. */
export const SHELF_HEADING = `${HEADING.shelf} text-slate-900`;

/** A field's name, above its control. The one heading that stays a LABEL:
 *  uppercase at 12px is how every form in the product names a box, and a
 *  settings card is a form. */
export const FIELD_LABEL = `block ${HEADING.field} font-bold uppercase tracking-wide ${TEXT.label}`;

/** A count, a date, a "3 settings" line — true but secondary. */
export const META = `text-[11px] ${TEXT.meta}`;

/** What a card or an area is for, in one line. */
export const BLURB = `text-xs ${TEXT.body} leading-relaxed`;
