// ─────────────────────────────────────────────────────────────────────────────
// settings/SettingsGroupForm.jsx — One settings group, editable, with its own
// dirty state and its own Save (#246, #247). The brief's "Pattern A: Direct
// Form Card".
//
// ONE CARD = ONE REQUEST = ONE GROUP = ONE TRANSACTION (decision D-S4). The
// card never reaches outside itself: an admin fixing the payday cannot
// accidentally write to the statutory rates sitting in the next card, because
// those are a different request against a different ETag.
//
// Only what CHANGED is sent. The patch is built by diffing against the values
// the server last gave us, so an untouched key is never in the body — which
// matters more here than usual, because the gateway runs the owner's Joi
// schema with `noDefaults: true` precisely so unmentioned fields keep their
// stored value. Sending the whole form back would be a mass-assignment waiting
// for a default to wipe something (the contract calls this out by name:
// `registered_address_lines`).
//
// WHY THE ROWS ARE LABEL-ABOVE-CONTROL AND NOT A TWO-COLUMN LEDGER. Each row
// used to be `label … [control]` across the full width of the page, with a
// 14rem control column pinned to the right. On a 1440 screen the label and the
// box it belongs to sat 700px apart, which is the "800px away" the brief's §5
// names: the eye crossed the whole card to pair a question with its answer,
// and the description under the label was read as belonging to the row above.
// Each setting is a stacked block now — label, control, then the one line
// explaining what it does — and the blocks sit two or three to a line in the
// card's own grid. So the card can be as wide as the page (it is: see
// OrgSettingsPage) without anything moving away from its label.
//
// ─── THE 2026-10-10 PASS: A SHUTTER, A GRID, AND A FIXED CORNER ────────────
// Three changes, all asked for after reading the first build:
//   · THE CARD IS A SHUTTER. Everything but the header is behind a disclosure,
//     closed by default. Eleven open cards made the Payroll tab five screens
//     long, and an admin arrives to change ONE rule; now the page is an index
//     they open one row of. It also squares the wall: closed cards are a
//     single height, so the two columns have no holes in them.
//     Collapsing does NOT unmount the fields — `edits` lives in this
//     component, so a half-finished change survives a shutter being pulled
//     down and the save dock can still name the card it is in.
//   · FIELDS SHARE A LINE (`fieldSpan` decides who needs more than one cell).
//     One per line left half of every row empty and made a six-setting group
//     as tall as the screen; related numbers — a grace period and the lateness
//     window — now read side by side instead of one below the other. Two to a
//     line from `sm`, three from `xl` since the card went full width.
//   · "PUT BACK TO DEFAULT" IS ALWAYS IN THE TOP-RIGHT CORNER, not in the
//     footer where it used to appear only while the card was clean. Same
//     corner in every card, present exactly when there is something to put
//     back, and it asks before it writes: one click should not quietly
//     rewrite three settings.
//
// ─── THE THIRD PASS, SAME DAY: PLAIN SENTENCES AND ROOM TO BREATHE ─────────
//   · NO COLOURED BADGE ON A RISKY FIELD. "Change carefully" was a rose pill
//     beside the label, wider than some of the fields it warned about, and it
//     said only that something was risky. It became a clause in the caption,
//     and then (fourth pass, same day) a 14px rose mark whose accessible name
//     carries the sentence — because the caption is needed for something else:
//
// ─── THE FOURTH PASS: THE CAPTION SAYS WHAT THE SETTING DOES ───────────────
//     One line per setting, in layman's words, from settingsBlurbs.js — "Allow
//     managers to view their team’s documents", the user's own example. The
//     third pass had put the RISK clause there, so a documents toggle was
//     explained by a sentence about pay, and the catalogue's `description`
//     (the other half of that line) is registry vocabulary. Neither says what
//     the switch does, which is the only thing the reader is asking.
//     The line also sits TIGHT to its label — `mt-0.5` under a switch row,
//     `mt-1` under a control. At `mt-1.5` it read as a gap, not a caption.
//   · ONE SHADE FOR EVERY EXPLANATION. The captions were 11px slate-500 and
//     the "N moved off the default" line was bold purple; both now read as
//     plain text at the size Payroll Settings uses. Purple here was doing the
//     work of a highlight on something nobody needed highlighted.
//   · ROOM BETWEEN ROWS. `gap-y-3.5` put a field's control nearer the caption
//     of the field below it than its own label — the rows read as attached.
//     The grid is `gap-y-5 gap-x-6` now, and the card's own padding, header,
//     footer and banners all sit on one 20px edge instead of three.
// All the text shades come from settingsText.js, which exists so this last
// change can be taken back in one edit if it is not wanted.
//
// A LABEL IS NOT A `<label>` FOR A SWITCH. A switch is a `<button>`, and
// `htmlFor` only binds to form elements — so switch rows pass `labelledBy`
// and the control carries `aria-labelledby` instead. Everything else keeps
// the real label/`id` pairing.
//
// THE TWO GATES. A high-risk setting needs a written `reason` AND
// `confirm: true`. Rather than guess which settings those are, the card asks
// optimistically and lets the SERVER decide: a 422 SETTINGS_REASON_REQUIRED or
// 409 SETTINGS_CONFIRMATION_REQUIRED comes back carrying the exact keys, which
// the dialog asks about and then resubmits with. That way the gate can never
// drift from the catalogue. (The card still marks high-risk rows up front, so
// the dialog is a confirmation rather than a surprise.)
//
// Its keys, OUR words. The 409 also carries `warnings[]`, and this dialog used
// to print them verbatim — until one of them told an HR admin that the publish
// endpoint's response class changes from 200 to 202 and clients must poll the
// materialisation-progress endpoint (2026-10-10). The cautions come from
// SETTING_WARNING now, with a plain fallback for a key we have no line for;
// `riskWarnings` is deleted and its tombstone is in utils/settingsErrors.js.
//
// THE CONFLICT. A 412 means somebody else saved while this form was open. The
// edits stay exactly where they are — losing someone's typing to another
// person's save is the one outcome this whole ETag dance exists to prevent —
// and the card offers to load the latest values so they can redo the change
// against them.
//
// `onDirtyChange` reports this card's unsaved state to the page's save dock,
// which can then say WHICH card is unsaved and save them all. The callbacks it
// hands up are stable wrappers over a ref (`actions`) rather than `save`
// itself: registering a fresh function identity on every render would make the
// effect re-fire forever.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiChevronDown, HiChevronRight, HiExclamationCircle, HiLockClosed, HiRefresh,
} from "react-icons/hi";
import { Link } from "react-router-dom";
import ReasonDialog from "../components/ReasonDialog";
import FieldHelp from "../fieldHelp/FieldHelp";
import { TONE_CLASSES } from "../attendance/enums";
import { fmtDateTime } from "../attendance/dates";
import { settingsAPI } from "../api";
import {
  isPreconditionFailed, needsConfirmDialog, needsConfirmation,
  offendingKeys, settingsErrorMessage, unavailableReason,
} from "../utils/settingsErrors";
import {
  displaySettingValue, effectTimingLabel, fieldShelves, fieldSpan, groupBlurb, groupIcon,
  isEditable, isSwitchControl, rangeHint, riskMeta,
} from "./settingsMeta";
import { settingBlurb, settingLabel, settingWarnings } from "./settingsBlurbs";
import { BLURB, CAPTION, FIELD_LABEL, META, TEXT } from "./settingsText";
import SettingInput from "./SettingInput";
import { groupCardId } from "./settingsDock";

const CARD = "bg-white rounded-2xl border shadow-xs overflow-hidden transition-all";
const LINK = "inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 shrink-0";
/* The card's own Save was PRIMARY; the page's one Save lives in the dock now
   (see the footer comment). SECONDARY is still the reload button's. */
const SECONDARY = "px-4 py-2 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50 inline-flex items-center gap-2";

function Pill({ tone = "slate", children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[tone] || TONE_CLASSES.slate}`}>
      {children}
    </span>
  );
}

/* When a change bites, as a coloured dot and a sentence — the brief's
   "contextual impact badge". Violet for "already done", fuchsia for "waits for
   something", slate for a setting nothing acts on yet (§5: no green, no
   amber). */
const TIMING_DOT = {
  immediate: "bg-violet-500",
  next_record: "bg-fuchsia-500",
  next_run: "bg-fuchsia-500",
  next_cron_pass: "bg-fuchsia-500",
  inert: "bg-slate-300",
};

/** Two values the server would call equal. Arrays compare by content. */
const sameValue = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => String(v) === String(b[i]));
  }
  if (a === null || a === undefined) return b === null || b === undefined || b === "";
  if (b === null || b === undefined) return a === "";
  return String(a) === String(b);
};

export default function SettingsGroupForm({
  group, entries, editTo, onSaved, onReload, showToast, surface, onDirtyChange, flash = false,
  open: openProp, onToggle,
}) {
  const rows = useMemo(() => entries || [], [entries]);
  // Memoised: it feeds the patch diff, and a fresh {} each render would make
  // that recompute (and the card re-render) on every keystroke in any card.
  const stored = useMemo(() => group.values || {}, [group.values]);

  const [edits, setEdits] = useState({});
  // The shutter. The page drives it (it has Expand all, and the save dock has
  // to be able to open a card it is reporting on), and falls back to the
  // card's own state so this component still works on its own.
  const [localOpen, setLocalOpen] = useState(false);
  const open = openProp ?? localOpen;
  const toggle = () => (onToggle ? onToggle(group.key) : setLocalOpen((v) => !v));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  // Set when the server asks for a reason and/or confirmation. Carries the
  // operation to resubmit, plus ITS keys — and our own cautions for them.
  const [gate, setGate] = useState(null);

  const reason = group.unavailableReason ? unavailableReason(group.unavailableReason) : null;
  const canWrite = group.writable && group.entitled && !reason && group.hasValues && Boolean(group.etag);

  const valueOf = (key) => (key in edits ? edits[key] : stored[key]);

  /** Only the keys that actually differ from what the server gave us. */
  const patch = useMemo(() => {
    const out = {};
    for (const key of Object.keys(edits)) {
      if (!sameValue(edits[key], stored[key])) out[key] = edits[key];
    }
    return out;
  }, [edits, stored]);

  const dirtyKeys = Object.keys(patch);
  const dirty = dirtyKeys.length > 0;

  /**
   * The gated keys among the ones being changed, known from the catalogue
   * BEFORE anything is sent. The server enforces these gates too (422
   * SETTINGS_REASON_REQUIRED, 409 SETTINGS_CONFIRMATION_REQUIRED) and that
   * enforcement is the real one — but asking only after a refusal makes the
   * person press Confirm twice and hides the warnings until the second pass.
   * So the catalogue decides when to ASK, and the server still decides whether
   * to ACCEPT. Anything the catalogue didn't mark still falls back to the
   * server's gate below, so a setting reclassified server-side is never
   * silently un-gated here.
   */
  /**
   * What a reset would actually put back: only keys the server says differ
   * from the default, that we can write, and that the catalogue marks
   * resettable. Offering more than that would send keys the gateway refuses
   * (422 SETTING_NOT_RESETTABLE) — a button that 422s is the same mistake as
   * one that 403s.
   */
  const resettableKeys = useMemo(() => {
    const changed = new Set(group.nonDefaultKeys || []);
    return rows
      .filter((e) => changed.has(e.key) && e.resettable !== false && isEditable(e))
      .map((e) => e.key);
  }, [rows, group.nonDefaultKeys]);

  // Keyed off `patch`, not `dirtyKeys`: `patch` is memoised, and
  // `Object.keys` hands back a fresh array every render.
  const gatedEntries = useMemo(
    () => rows.filter((e) => (e.key in patch) && (e.risk === "high" || e.requires_reason)),
    [rows, patch],
  );

  const discard = useCallback(() => {
    setEdits({});
    setError("");
    setConflict(false);
  }, []);

  /**
   * The ONE write path, for both #246 and #247. They share every failure mode
   * — the same two gates, the same 412, the same allowlist — so they share the
   * handling; only the call differs. A second copy of this is how the save and
   * the reset would drift apart.
   *
   * `extra` carries the gate's answers (`reason`, `confirm`) on a resubmit.
   */
  const write = useCallback(async (op, extra = {}) => {
    setSaving(true);
    setError("");
    try {
      const res = op.kind === "reset"
        ? await settingsAPI.resetGroup(group.key, { keys: op.keys, ...extra }, group.etag)
        : await settingsAPI.updateGroup(group.key, { values: op.values, ...extra }, group.etag);
      const data = res?.data || {};
      setEdits({});
      setConflict(false);
      setGate(null);
      onSaved?.(group.key, data);
      if (op.kind === "reset") {
        showToast?.("Put back to the default.");
      } else {
        const n = Object.keys(data.changed || {}).length;
        showToast?.(n === 0
          ? "Nothing changed — those were already the saved values."
          : `Saved. ${n} setting${n === 1 ? "" : "s"} changed.`);
      }
      return true;
    } catch (err) {
      // The server is asking for one more thing, not refusing. Open the dialog
      // with ITS keys — it knows which ones it gated better than we do — but
      // OUR cautions, because its own `warnings[]` are written for integrators
      // (see SETTING_WARNING). Hold the operation so answering the dialog
      // resubmits exactly the same work.
      if (needsConfirmDialog(err)) {
        const keys = offendingKeys(err);
        setGate({
          op,
          keys,
          warnings: settingWarnings(rows.filter((e) => keys.includes(e.key))),
          needsConfirm: needsConfirmation(err),
        });
        return false;
      }
      if (isPreconditionFailed(err)) {
        // Their edits stay on screen. Nothing of theirs was saved.
        setConflict(true);
        setError(settingsErrorMessage(err));
        return false;
      }
      setError(settingsErrorMessage(err, op.kind === "reset"
        ? "We couldn’t put that back. Try again."
        : "We couldn’t save that. Try again."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [group.key, group.etag, rows, onSaved, showToast]);

  const resetToDefaults = async () => {
    if (resettableKeys.length === 0) return;
    // It sits in the corner of every customised card, one click from a write
    // that could undo somebody's deliberate configuration — so it asks, in
    // the words of what is about to happen. `window.confirm` is the in-app
    // dialog and returns a PROMISE: unawaited, the branch is always taken (§7).
    const n = resettableKeys.length;
    const ok = await window.confirm(
      `Put ${n === 1 ? "this setting" : `these ${n} settings`} in ${group.label} back to the value${n === 1 ? "" : "s"} we ship? Whatever ${n === 1 ? "it is" : "they are"} set to now will be replaced.`,
    );
    if (!ok) return;
    const op = { kind: "reset", keys: resettableKeys };
    // A reset runs the identical pipeline as a save, so the same gates apply:
    // putting a high-risk setting BACK is just as consequential as changing it.
    const gated = rows.filter((e) => resettableKeys.includes(e.key) && (e.risk === "high" || e.requires_reason));
    if (gated.length > 0) {
      setGate({
        op,
        keys: gated.map((e) => e.key),
        warnings: settingWarnings(gated),
        needsConfirm: gated.some((e) => e.risk === "high"),
      });
      return;
    }
    write(op);
  };

  /** Returns the write's promise so the save dock can wait for it. */
  const save = useCallback(() => {
    if (!dirty) return Promise.resolve(true);
    const op = { kind: "save", values: patch };
    if (gatedEntries.length > 0) {
      // Ask up front, in our own words, and answer both gates in one
      // submission.
      setGate({
        op,
        keys: gatedEntries.map((e) => e.key),
        warnings: settingWarnings(gatedEntries),
        needsConfirm: gatedEntries.some((e) => e.risk === "high"),
      });
      return Promise.resolve(false);
    }
    return write(op);
  }, [dirty, patch, gatedEntries, write]);

  /* ── Reporting upward ───────────────────────────────────────────────────
     The dock needs to call back into this card. `save` and `discard` change
     identity as the form is typed in, so what goes up is a stable wrapper
     over a ref — otherwise the effect below would re-register on every
     keystroke and loop. */
  const actions = useRef({ save, discard });
  actions.current.save = save;
  actions.current.discard = discard;
  const callSave = useCallback(() => actions.current.save(), []);
  const callDiscard = useCallback(() => actions.current.discard(), []);

  const gated = gatedEntries.length > 0;
  useEffect(() => {
    if (!onDirtyChange) return undefined;
    if (!dirty || !canWrite) {
      onDirtyChange(group.key, null);
      return undefined;
    }
    onDirtyChange(group.key, {
      key: group.key,
      label: group.label,
      count: dirtyKeys.length,
      gated,
      save: callSave,
      discard: callDiscard,
    });
    // Unmounting a dirty card (switching tabs) takes its entry with it, so the
    // dock can never claim unsaved changes in a card that is no longer there.
    return () => onDirtyChange(group.key, null);
  }, [onDirtyChange, group.key, group.label, dirty, canWrite, dirtyKeys.length, gated, callSave, callDiscard]);

  /* ── Not available ──────────────────────────────────────────────────────
     No shutter on this one: there is nothing behind it to open, so a chevron
     would be a promise the card can't keep. It stays one flat block in the
     wall, which is also why the reason sits beside the title rather than
     under it. */
  if (reason) {
    return (
      <section id={groupCardId(group.key)} className={`${CARD} border-slate-100`}>
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 inline-flex items-center justify-center">
            {group.unavailableReason === "READ_FAILED"
              ? <HiExclamationCircle className="w-4 h-4 text-rose-400" />
              : <HiLockClosed className="w-4 h-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-slate-500 truncate">{group.label}</h3>
            {/* The ⓘ explaining why groups go missing lives here, on a group
                that has gone missing — not on a legend above the page. */}
            <p className={`text-xs font-bold ${TEXT.body} mt-0.5 flex items-center`}>
              {reason.label}
              {surface && <FieldHelp surface={surface} field="unavailable_groups" label="why some settings are hidden" size="sm" className="mb-0" />}
            </p>
            <p className={`${CAPTION} mt-0.5`}>{reason.detail}</p>
          </div>
          {reason.retry && (
            <button type="button" onClick={onReload} className={LINK}>
              <HiRefresh className="w-3.5 h-3.5" /> Try again
            </button>
          )}
        </div>
      </section>
    );
  }

  const timings = [...new Set(rows.map((r) => r.effect_timing).filter(Boolean))];
  const timing = timings.length === 1 ? timings[0] : null;
  const timingNote = effectTimingLabel(timing);
  const bodyId = `${groupCardId(group.key)}-body`;
  const changedCount = (group.nonDefaultKeys || []).length;
  // Only the FIRST risky row carries the "what does risk mean" ⓘ — the pill
  // repeats down the card, the concept doesn't (§10: once per concept).
  const firstRiskKey = rows.find((e) => riskMeta(e.risk))?.key || null;
  const shelves = fieldShelves(rows);

  return (
    <>
      <section
        id={groupCardId(group.key)}
        className={`${CARD} scroll-mt-24 ${
          dirty
            ? "border-fuchsia-300 ring-2 ring-fuchsia-50"
            : flash
              ? "border-purple-300 ring-4 ring-purple-100"
              : "border-slate-100"
        }`}
      >
        <Header
          group={group}
          rows={rows}
          dirtyCount={dirtyKeys.length}
          open={open}
          onToggle={toggle}
          bodyId={bodyId}
          onReset={canWrite && resettableKeys.length > 0 ? resetToDefaults : null}
          resetCount={resettableKeys.length}
          busy={saving}
        />

        {conflict && (
          <div className={`mx-5 mt-4 ${open ? "" : "mb-4"} flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3 text-xs text-slate-700`}>
            {/* The "two people can't overwrite each other" hint belongs here,
                on the one screen state where that has actually happened. */}
            <span className="flex-1">
              {error}
              {surface && <FieldHelp surface={surface} field="etag_conflict" label="what happens if two people edit at once" size="sm" className="mb-0" />}
            </span>
            <button type="button" onClick={onReload} className={`${SECONDARY} shrink-0 !py-1.5`}>
              <HiRefresh className="w-3.5 h-3.5" /> Load the latest
            </button>
          </div>
        )}
        {error && !conflict && (
          <p className={`mx-5 mt-4 ${open ? "" : "mb-4"} rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-xs text-slate-700`}>{error}</p>
        )}

        {/* Behind the shutter. Not unmounted — `edits` is this component's
            state and has to survive the card being closed. */}
        <div id={bodyId} className={open ? "" : "hidden"}>
          {/* The two facts about the group as a whole, on one muted line, each
              carrying the ⓘ for its own concept. They used to be a tile strip
              at the top of the page, which explained them a long way from
              anything they described. */}
          {(timingNote || changedCount > 0) && (
            <p className={`px-5 pt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 ${META}`}>
              {timingNote && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${TIMING_DOT[timing] || "bg-slate-300"}`} />
                  {timingNote}
                  {surface && <FieldHelp surface={surface} field="effect_timing" label="when a change takes effect" size="sm" className="mb-0" />}
                </span>
              )}
              {changedCount > 0 && (
                <span className={`inline-flex items-center gap-1 font-semibold ${TEXT.body}`}>
                  {changedCount} moved off the default
                  {surface && <FieldHelp surface={surface} field="non_default_keys" label="what “changed” means" size="sm" className="mb-0" />}
                </span>
              )}
            </p>
          )}

          {/* SHELVES. One grid per shelf, each under its own small heading —
              see `fieldShelves`, which reads them off the keys. A card too
              small to be worth shelving comes back as a single unlabelled
              shelf, which renders as the plain grid it always was.
              Inside a shelf: one field per line on a phone, two from `sm`,
              three from `xl`, and `fieldSpan` gives the two kinds that can't
              live in one cell the room they need. */}
          <div className="px-5 py-4 space-y-4">
            {shelves.map((shelf, shelfIndex) => (
            <section key={shelf.key} className={shelf.label && shelfIndex > 0 ? "pt-3 border-t border-slate-100" : ""}>
            {shelf.label && (
              <h4 className={`text-[11px] font-bold uppercase tracking-wider ${TEXT.label} mb-3`}>
                {shelf.label}
                <span className={`ml-2 font-semibold normal-case tracking-normal ${TEXT.meta}`}>
                  {shelf.rows.length}
                </span>
              </h4>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5 items-start">
            {shelf.rows.map((entry) => {
              const risk = riskMeta(entry.risk);
              const changed = (group.nonDefaultKeys || []).includes(entry.key);
              const edited = entry.key in patch;
              const editable = canWrite && isEditable(entry);
              const asSwitch = editable && isSwitchControl(entry);
              const hint = rangeHint(entry);
              const id = `set-${group.key}-${entry.key}`;
              const blurb = settingBlurb(entry);
              // Ours, not the catalogue's registry title — see SETTING_LABEL.
              const name = settingLabel(entry);

              /* The ⓘ sits BESIDE the label in a flex row, never inside it
                 (§10's wiring rule). A switch gets `aria-labelledby` instead
                 of `htmlFor`, because a button is not labelable. */
              const labelRow = (
                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1">
                  {asSwitch
                    ? <span id={`${id}-label`} className={FIELD_LABEL}>{name}</span>
                    : <label htmlFor={editable ? id : undefined} className={FIELD_LABEL}>{name}</label>}
                  {surface && <FieldHelp surface={surface} field={entry.key} label={name} size="sm" className="mb-0" />}
                  {edited && <Pill tone="amber">Unsaved</Pill>}
                  {!edited && changed && <Pill tone="purple">Changed</Pill>}
                  {/* RISK IS A MARK, NOT WORDS (see settingsMeta's RISK_META).
                      A 14px rose icon, its meaning in its accessible name, so
                      the caption beside it is free to say what the setting
                      does. The ⓘ explaining the mark goes on the first marked
                      field in the card only (§10: once per concept). */}
                  {risk && (
                    /* The tooltip is on the WRAPPER, not the icon: react-icons
                       turns a `title` prop into an SVG <title>, which an
                       `aria-hidden` icon then reads out a second time after
                       the sr-only sentence below it. */
                    <span title={risk.label} className="inline-flex items-center">
                      <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                      <span className="sr-only">{risk.label}.</span>
                    </span>
                  )}
                  {risk && surface && entry.key === firstRiskKey && (
                    <FieldHelp surface={surface} field="risk" label="settings that need care" size="sm" className="mb-0" />
                  )}
                </div>
              );

              /* WHAT THIS SETTING DOES, in one plain line, and nothing else
                 (user instruction, 2026-10-10: "put simple explanation what
                 setting entity do … 'allow manager view team documents' this
                 type goes for all"). The line comes from settingsBlurbs.js,
                 which is written against the registry; the catalogue's own
                 `description` is the fallback, not the first choice, because
                 it is written in the registry's vocabulary and the earlier
                 build printing it is what made the card read like a spec.
                 The allowed range joins it — it is a fact about the same
                 field, and it was the only thing some fields had to say.
                 SET TIGHT TO THE LABEL (`mt-0.5` / `mt-1`): at `mt-1.5` the
                 line floated between its own field and the one below. */
              const captionLine = (blurb || hint) && (
                <p className={`${CAPTION} ${asSwitch ? "mt-0.5" : "mt-1"}`}>
                  {[blurb, hint].filter(Boolean).join(" · ")}
                </p>
              );

              const control = editable ? (
                <SettingInput
                  id={id}
                  entry={entry}
                  value={valueOf(entry.key)}
                  disabled={saving}
                  labelledBy={asSwitch ? `${id}-label` : undefined}
                  onChange={(v) => setEdits((e) => ({ ...e, [entry.key]: v }))}
                />
              ) : (
                <span className={`block text-sm font-bold ${TEXT.value}`}>
                  {group.hasValues ? displaySettingValue(stored[entry.key], entry) : "Couldn’t load"}
                </span>
              );

              return (
                <div
                  key={entry.key}
                  className={`min-w-0 ${fieldSpan(entry)} ${
                    edited ? "-mx-2 px-2 py-2 rounded-xl bg-fuchsia-50/50" : ""
                  }`}
                >
                  {asSwitch ? (
                    // Label and switch on one line, explanation under both:
                    // the switch is the one control small enough to sit beside
                    // what it is called, and it stays inside its own cell so
                    // it can't drift away from its label (see `fieldSpan`).
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">{labelRow}</div>
                        {control}
                      </div>
                      {captionLine}
                    </>
                  ) : (
                    <>
                      {labelRow}
                      <div className="mt-1.5 w-full min-w-0">{control}</div>
                      {captionLine}
                    </>
                  )}
                </div>
              );
            })}
            </dl>
            </section>
            ))}
          </div>

          {/* ONE SAVE PER PAGE, AND IT IS THE DOCK.
              This footer used to carry its own Save and Discard. With one card
              dirty that put two identical purple Save buttons on screen at the
              same moment — one here, one in the dock a few pixels below — doing
              the same write (user report, 2026-10-10). Two controls for one
              action is a question the reader has to answer ("are these
              different? does this one save only this card?") before they can
              do the thing they came for.

              The dock is the one that stays: it is sticky, so it is in view
              from any scroll position, it names which card is unsaved — which
              a footer two screens up cannot — and it already reserves Maya's
              corner. What is left here is the way OUT of the card (the policy
              screen that owns the rest) in the same place in every card, plus
              a plain line pointing at the dock while this card is dirty.
              Saving is still per group underneath: the dock fires one request
              per card, each under its own ETag (see settingsDock.js). */}
          {(editTo || canWrite) && (
            <footer className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              {editTo ? (
                <Link to={editTo.path} className={LINK}>
                  Open {editTo.label} <HiChevronRight className="w-3.5 h-3.5" />
                </Link>
              ) : <span className={META}>Changes here are saved to this area only.</span>}
              {canWrite && dirty && (
                <span className={`text-xs font-bold shrink-0 ${TEXT.value}`}>
                  {saving
                    ? "Saving…"
                    : `${dirtyKeys.length} unsaved — save ${dirtyKeys.length === 1 ? "it" : "them"} in the bar at the foot of the page.`}
                </span>
              )}
            </footer>
          )}
        </div>
      </section>

      {/* The server's own gate, answered. ReasonDialog is the house component
          for "this needs a written reason" (§5 — don't rebuild it). */}
      {gate && (
        <ReasonDialog
          title="Confirm this change"
          description={
            <>
              {gate.keys.length > 0 && (
                <span className="block mb-2">
                  This affects{" "}
                  <span className="font-semibold text-slate-700">
                    {gate.keys.map((k) => settingLabel(rows.find((r) => r.key === k)) || k).join(", ")}
                  </span>.
                </span>
              )}
              {/* Ours, never the catalogue's: its `warnings[]` talk about
                  endpoints and response codes, and a caution nobody can act
                  on only teaches people to click through this dialog. */}
              {gate.warnings.map((w) => (
                <span key={w} className="flex items-start gap-2 mt-1.5 text-rose-700">
                  <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </span>
              ))}
            </>
          }
          label="Why are you making this change?"
          placeholder="This is kept with the change, so whoever reviews it later knows why."
          confirmLabel="Confirm and save"
          tone="danger"
          minLength={1}
          maxLength={500}
          busy={saving}
          error={error}
          onSubmit={(text) => write(gate.op, { reason: text, ...(gate.needsConfirm ? { confirm: true } : {}) })}
          onClose={() => setGate(null)}
        />
      )}
    </>
  );
}

/**
 * The card's header, which is also its shutter: the icon badge, what the group
 * is, what it controls in a sentence, whether it still sits on the shipped
 * defaults — and the one way to open it.
 *
 * The whole row is the toggle, so the target is a card-width button rather
 * than a 16px chevron. "Put back to default" is therefore its SIBLING, not a
 * nested button: an interactive element inside another is invalid, unreachable
 * by keyboard in the order people expect, and ⓘ popovers are forbidden inside
 * one anyway (§10). It is the last thing in the row, which puts it in the same
 * corner of every card — the point of moving it here.
 *
 * Closed, the blurb is clamped to one line so that every closed card is
 * exactly the same height and the two columns stack without gaps.
 */
function Header({
  group, rows, dirtyCount = 0, open, onToggle, bodyId,
  onReset, resetCount = 0, busy = false,
}) {
  const changed = (group.nonDefaultKeys || []).length;
  const Icon = groupIcon(group);
  const blurb = groupBlurb(group);
  return (
    <header className={`flex gap-1 pr-2 ${open ? "items-start border-b border-slate-100" : "items-center"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`flex-1 min-w-0 flex gap-3 px-4 text-left rounded-2xl hover:bg-slate-50/70 transition-colors ${open ? "items-start py-4" : "items-center py-3"}`}
      >
        <span className="shrink-0 w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 inline-flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-slate-900 truncate">{group.label}</span>
            {/* One pill, and only when it SAYS something. "Default" was on
                twelve of the fifteen payroll cards — a badge on everything is
                a badge on nothing, and it was the single biggest source of
                noise in a closed list. Unsaved beats customised; nothing at
                all is the resting state. */}
            {dirtyCount > 0
              ? <Pill tone="amber">{dirtyCount} unsaved</Pill>
              : changed > 0
                ? <Pill tone="purple">Customised</Pill>
                : null}
          </span>
          {/* Closed, a card is ONE LINE: its name. The sentence explaining it
              and the date it last moved are both reference — worth reading
              about the one group you are opening, worth nothing repeated
              fifteen times down a list you are scanning for a name. */}
          {open && blurb && <span className={`block ${BLURB} mt-1`}>{blurb}</span>}
          {open && (
            <span className={`block ${META} mt-1.5`}>
              {rows.length} setting{rows.length === 1 ? "" : "s"}
              {group.updatedAt && <> · last changed {fmtDateTime(group.updatedAt)}</>}
            </span>
          )}
        </span>
        {/* The size of the group, quietly, so a closed row still says how
            much is behind it without spending a line on it. */}
        {!open && (
          <span className={`shrink-0 ${META} tabular-nums`}>{rows.length}</span>
        )}
        <HiChevronDown
          aria-hidden="true"
          className={`shrink-0 w-4 h-4 text-slate-400 transition-transform ${open ? "mt-1 rotate-180" : ""}`}
        />
      </button>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          title={`Put ${resetCount === 1 ? "this setting" : `these ${resetCount} settings`} back to the value we ship`}
          aria-label={`Put ${group.label} back to the default`}
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold ${TEXT.body} border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition ${open ? "mt-4" : "my-auto"}`}
        >
          <HiRefresh className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Put back to default</span>
        </button>
      )}
    </header>
  );
}
