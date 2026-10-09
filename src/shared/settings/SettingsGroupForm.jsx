// ─────────────────────────────────────────────────────────────────────────────
// settings/SettingsGroupForm.jsx — One settings group, editable, with its own
// dirty state and its own Save (#246, #247).
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
// THE TWO GATES. A high-risk setting needs a written `reason` AND
// `confirm: true`. Rather than guess which settings those are, the card asks
// optimistically and lets the SERVER decide: a 422 SETTINGS_REASON_REQUIRED or
// 409 SETTINGS_CONFIRMATION_REQUIRED comes back carrying the exact keys and
// the catalogue's own `warnings[]`, which the dialog then shows verbatim and
// resubmits with. That way the gate can never drift from the catalogue — and
// the warnings the person reads are the ones the backend wrote for that
// setting, not a paraphrase. (The card still marks high-risk rows up front, so
// the dialog is a confirmation rather than a surprise.)
//
// THE CONFLICT. A 412 means somebody else saved while this form was open. The
// edits stay exactly where they are — losing someone's typing to another
// person's save is the one outcome this whole ETag dance exists to prevent —
// and the card offers to load the latest values so they can redo the change
// against them.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import {
  HiCheck, HiChevronRight, HiExclamationCircle, HiLockClosed, HiRefresh,
} from "react-icons/hi";
import { Link } from "react-router-dom";
import ReasonDialog from "../components/ReasonDialog";
import FieldHelp from "../fieldHelp/FieldHelp";
import { TONE_CLASSES } from "../attendance/enums";
import { fmtDateTime } from "../attendance/dates";
import { settingsAPI } from "../api";
import {
  isPreconditionFailed, needsConfirmDialog, needsConfirmation,
  offendingKeys, riskWarnings, settingsErrorMessage, unavailableReason,
} from "../utils/settingsErrors";
import { displaySettingValue, effectTimingLabel, isEditable, rangeHint, riskMeta } from "./settingsMeta";
import SettingInput from "./SettingInput";

const CARD = "bg-white rounded-2xl border shadow-xs overflow-hidden transition-colors";
const LINK = "inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 shrink-0";
const PRIMARY = "px-4 py-2 rounded-xl text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2";
const SECONDARY = "px-4 py-2 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50 inline-flex items-center gap-2";

function Pill({ tone = "slate", children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[tone] || TONE_CLASSES.slate}`}>
      {children}
    </span>
  );
}

/** Two values the server would call equal. Arrays compare by content. */
const sameValue = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => String(v) === String(b[i]));
  }
  if (a === null || a === undefined) return b === null || b === undefined || b === "";
  if (b === null || b === undefined) return a === "";
  return String(a) === String(b);
};

export default function SettingsGroupForm({ group, entries, editTo, onSaved, onReload, showToast, surface }) {
  const rows = useMemo(() => entries || [], [entries]);
  // Memoised: it feeds the patch diff, and a fresh {} each render would make
  // that recompute (and the card re-render) on every keystroke in any card.
  const stored = useMemo(() => group.values || {}, [group.values]);

  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  // Set when the server asks for a reason and/or confirmation. Carries the
  // operation to resubmit, plus ITS keys and ITS warnings for the dialog.
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

  const resetToDefaults = () => {
    if (resettableKeys.length === 0) return;
    const op = { kind: "reset", keys: resettableKeys };
    // A reset runs the identical pipeline as a save, so the same gates apply:
    // putting a high-risk setting BACK is just as consequential as changing it.
    const gated = rows.filter((e) => resettableKeys.includes(e.key) && (e.risk === "high" || e.requires_reason));
    if (gated.length > 0) {
      setGate({
        op,
        keys: gated.map((e) => e.key),
        warnings: gated.flatMap((e) => e.warnings || []),
        needsConfirm: gated.some((e) => e.risk === "high"),
      });
      return;
    }
    write(op);
  };

  const gatedEntries = useMemo(
    () => rows.filter((e) => dirtyKeys.includes(e.key) && (e.risk === "high" || e.requires_reason)),
    [rows, dirtyKeys],
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
      // with ITS keys and ITS warnings rather than our guess at them, and hold
      // the operation so answering the dialog resubmits exactly the same work.
      if (needsConfirmDialog(err)) {
        setGate({
          op,
          keys: offendingKeys(err),
          warnings: riskWarnings(err),
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
  }, [group.key, group.etag, onSaved, showToast]);

  const save = () => {
    if (!dirty) return;
    const op = { kind: "save", values: patch };
    if (gatedEntries.length > 0) {
      // Ask up front, with the catalogue's own warnings, and answer both gates
      // in one submission.
      setGate({
        op,
        keys: gatedEntries.map((e) => e.key),
        warnings: gatedEntries.flatMap((e) => e.warnings || []),
        needsConfirm: gatedEntries.some((e) => e.risk === "high"),
      });
      return;
    }
    write(op);
  };

  /* ── Not available: the Phase 1 rendering, unchanged ───────────────────── */
  if (reason) {
    return (
      <section className={`${CARD} border-slate-100`}>
        <Header group={group} rows={rows} editTo={editTo} />
        <div className="px-5 py-4 flex items-start gap-2.5">
          {group.unavailableReason === "READ_FAILED"
            ? <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            : <HiLockClosed className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />}
          <div className="min-w-0 flex-1">
            {/* The ⓘ explaining why groups go missing lives here, on a group
                that has gone missing — not on a legend above the page. */}
            <p className="text-xs font-bold text-slate-700 flex items-center">
              {reason.label}
              {surface && <FieldHelp surface={surface} field="unavailable_groups" label="why some settings are hidden" size="sm" className="mb-0" />}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{reason.detail}</p>
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
  const timingNote = timings.length === 1 ? effectTimingLabel(timings[0]) : null;

  return (
    <>
      <section className={`${CARD} ${dirty ? "border-fuchsia-300 ring-2 ring-fuchsia-50" : "border-slate-100"}`}>
        <Header group={group} rows={rows} editTo={editTo} dirtyCount={dirtyKeys.length} />

        {conflict && (
          <div className="mx-5 mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3 text-xs text-slate-700">
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
          <p className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-xs text-slate-700">{error}</p>
        )}

        <dl className="divide-y divide-slate-50">
          {rows.map((entry) => {
            const risk = riskMeta(entry.risk);
            const changed = (group.nonDefaultKeys || []).includes(entry.key);
            const edited = entry.key in patch;
            const editable = canWrite && isEditable(entry);
            const hint = rangeHint(entry);
            const id = `set-${group.key}-${entry.key}`;
            const wide = editable && entry.data_type === "array";
            return (
              // A fixed control column rather than `auto`, so every row's
              // input starts on the same line down the card. With `auto` a
              // long enum made one row's control twice the width of the next
              // and the card read as a ragged edge.
              //
              // A list is the exception: its chips, its text box AND its Add
              // button cannot share 14rem without the placeholder being cut
              // off, so a list drops below its label and takes the full row.
              <div
                key={entry.key}
                className={`px-5 py-3 grid gap-x-5 gap-y-2 items-center transition-colors ${
                  wide ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_14rem]"
                } ${edited ? "bg-fuchsia-50/40" : ""}`}
              >
                <div className="min-w-0">
                  <label htmlFor={editable ? id : undefined} className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 flex-wrap">
                    {entry.label}
                    {edited && <Pill tone="amber">Unsaved</Pill>}
                    {!edited && changed && <Pill tone="purple">Changed</Pill>}
                    {risk && <Pill tone={risk.tone}>{risk.label}</Pill>}
                  </label>
                  {entry.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{entry.description}</p>
                  )}
                  {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
                </div>
                <div className={`w-full min-w-0 ${wide ? "sm:max-w-lg" : ""}`}>
                  {editable ? (
                    <SettingInput
                      id={id}
                      entry={entry}
                      value={valueOf(entry.key)}
                      disabled={saving}
                      onChange={(v) => setEdits((e) => ({ ...e, [entry.key]: v }))}
                    />
                  ) : (
                    <span className="block text-xs font-bold text-slate-800">
                      {group.hasValues ? displaySettingValue(stored[entry.key], entry) : "Couldn’t load"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </dl>

        <footer className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 min-w-0">
            {dirty
              ? `${dirtyKeys.length} unsaved change${dirtyKeys.length === 1 ? "" : "s"}`
              : canWrite
                ? timingNote || "Changes are saved to this area only."
                : timingNote || "These can’t be changed from here."}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {/* Only when something actually differs from the default — there is
                nothing to put back otherwise, and a permanently dead button
                teaches people to ignore the footer. */}
            {canWrite && !dirty && resettableKeys.length > 0 && (
              <button type="button" onClick={resetToDefaults} disabled={saving} className={SECONDARY}>
                <HiRefresh className="w-4 h-4" /> Put back to defaults
              </button>
            )}
          </div>
          {canWrite && dirty && (
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={discard} disabled={saving} className={SECONDARY}>Discard</button>
              <button type="button" onClick={save} disabled={saving} className={PRIMARY}>
                {saving
                  ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                  : <><HiCheck className="w-4 h-4" /> Save</>}
              </button>
            </div>
          )}
        </footer>
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
                    {gate.keys.map((k) => rows.find((r) => r.key === k)?.label || k).join(", ")}
                  </span>.
                </span>
              )}
              {/* Verbatim from the catalogue — these sentences were written for
                  exactly this moment and say what the change actually does. */}
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

function Header({ group, rows, editTo, dirtyCount = 0 }) {
  const changed = (group.nonDefaultKeys || []).length;
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-800">{group.label}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {rows.length} setting{rows.length === 1 ? "" : "s"}
          {changed > 0 && <> · <span className="font-semibold text-purple-700">{changed} changed from the default</span></>}
          {dirtyCount > 0 && <> · <span className="font-semibold text-fuchsia-700">{dirtyCount} unsaved</span></>}
          {group.updatedAt && <> · last changed {fmtDateTime(group.updatedAt)}</>}
        </p>
      </div>
      {editTo && (
        <Link to={editTo.path} className={LINK}>
          {editTo.label} <HiChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </header>
  );
}
