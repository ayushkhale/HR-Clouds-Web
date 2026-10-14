// ─────────────────────────────────────────────────────────────────────────────
// PayrollSettingsPage.jsx — The organisation-wide payroll rules (registry
// #22/#23): the pay calendar, how an amount is worked out, who may approve
// what, salary advances, income tax, payslip delivery, and what happens to
// somebody's last payment when they leave.
//
// ─── IT IS THE SETUP SCREEN, SO IT OFFERS THE WHOLE SINGLETON ──────────────
// Until 15 Oct 2026 this page drew about twenty hand-written controls, which
// left the other forty settings on the same endpoint unreachable from Setup —
// the hours in a working day, the pay day, the cut-off, overtime, the loan
// ceilings, the tax-declaration window (user report: "that folder page does
// not provide all the setup required fields like the full day hours… we expect
// user to complete setup from there directly"). The fields are DATA now
// (payrollSettingsCatalogue.js) and this screen walks them, so the page and
// the endpoint can't drift apart again.
//
// ─── AND IT IS THE SAME SCREEN AS SETTINGS ─────────────────────────────────
// Same card shell, same shelves, same controls, same sticky save dock, same
// search, same ⓘ wiring, same text shades — all of it out of shared/settings
// (user, 15 Oct 2026: "we have to make the UI/UX of the payroll to the
// settings UI/UX"). What it does NOT share is `SettingsGroupForm`, which is a
// form over the settings gateway with an ETag and a reason gate this endpoint
// has neither of; see the header of PayrollSettingCard.jsx.
//
// ─── THE THREE CONTRACT TRAPS, UNCHANGED ───────────────────────────────────
// · THE PUT IS A PARTIAL UPDATE and this page only ever sends what HR actually
//   changed (settingsMeta.js). Sending the whole object used to fail the
//   entire save with a VALIDATION_ERROR on `fnf_encashment_max_days`, because
//   the nullable keys were defaulted into the form as "" and that one wasn't
//   even rendered.
// · A KEY THE SERVER NEVER RETURNED IS NOT OFFERED. An unknown field doesn't
//   fail quietly, it fails the whole request — so `resolveGroups(saved)` draws
//   a field only where `key in saved`, and a card left with nothing is dropped
//   whole. That is also why offering the automation switches (#56) is safe now
//   when it wasn't before: on a server that doesn't store them, that card
//   simply isn't there.
// · PHASE 7 KEY NAMES WERE VERIFIED LIVE 2026-09-20 and do NOT match the
//   phase-7 analysis doc: the doc's `fnf_leave_encashment_rate_basis` is
//   really `fnf_encashment_rate_basis`, `..._divisor_basis` is `..._divisor`,
//   `fnf_leave_encashment_types` is `fnf_encashment_leave_type_codes`, and
//   `fnf_notice_recovery_basis` is `fnf_notice_recovery_rate_basis`. The
//   catalogue carries the live names. Saving the doc's would write keys the
//   server ignores and lose the setting silently.
//
// NO DEFAULTS ARE INVENTED FOR THE FORM. The page used to seed its form state
// with a client-side default object when the read came back empty. Those
// controls could never be saved anyway — `settingsPatch` only sends keys the
// server returned — so an empty read now says so (see the empty state) rather
// than showing an editable page that quietly writes nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  HiCheckCircle, HiChevronDown, HiExclamationCircle, HiSearch, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { leaveAPI, payrollAPI } from "../../../../shared/api";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { focusFirstProblem, hasProblems } from "../../../../shared/utils/formGuard";
import FieldHelp from "../../../../shared/fieldHelp/FieldHelp";
import { useBulkGenerationPaused } from "../../../../shared/pdf/bulkGeneration";
import { layoutWall, moduleIcon } from "../../../../shared/settings/settingsMeta";
import { SETTING_WARNING, settingLabel } from "../../../../shared/settings/settingsBlurbs";
import { BAND_TITLE, META, TEXT } from "../../../../shared/settings/settingsText";
import SettingsSaveDock from "../../../../shared/settings/SettingsSaveDock";
import PayrollSettingCard from "../PayrollSettingCard";
import {
  allFields, payrollCardId, payrollFieldId, resolveGroups,
} from "../payrollSettingsCatalogue";
import { settingProblems, settingsPatch, touchedSettings } from "../settingsMeta";

const SURFACE = "payroll.settings";
/* The hints for the settings themselves live under the hub's surface, where
   all 62 of them were written with their Ask Maya questions (§10: one source).
   A handful of keys ALSO have an HR-onboarding line of their own, written for
   this screen; those entries name their surface in the catalogue and win. */
const FIELD_SURFACE = "settings.hub";

const BandIcon = moduleIcon("payroll");

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button type="button" onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

/* ─── The search ───────────────────────────────────────────────────────────
   Sixty-three settings on one page, so the box is the primary navigation (the
   hub's own §6). It matches everything a reader can SEE above a control —
   the setting's name, the card's name, the card's sentence, a shelf heading —
   and the key last, so typing a column name from an error message also lands.

   A matched card shows only its matching fields, because the point of
   searching a page this long is to be left with the three rows you asked
   for. A card whose own NAME matches keeps all of them: "salary advances"
   means the whole card. */
function filterGroups(groups, query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return groups;
  const out = [];
  for (const group of groups) {
    const shelfLabels = (group.shelves || []).map((s) => String(s.label || "").toLowerCase());
    const cardMatches = [group.label, group.blurb].some((text) => String(text || "").toLowerCase().includes(q))
      || shelfLabels.some((label) => label.includes(q));
    if (cardMatches) { out.push(group); continue; }
    const fields = group.fields.filter((entry) =>
      settingLabel(entry).toLowerCase().includes(q) || entry.key.includes(q.replace(/\s+/g, "_")));
    if (fields.length > 0) out.push({ ...group, fields });
  }
  return out;
}

export default function PayrollSettingsPage() {
  // The settings EXACTLY as the server last returned them. Everything the page
  // sends is a diff against this, so a key this backend lacks is never
  // invented and a value nobody touched is never written (see settingsMeta).
  const [saved, setSaved] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // §11: a form never opens in red. Flipped by the first press.
  const [attempted, setAttempted] = useState(false);
  const [query, setQuery] = useState("");
  // Cards start CLOSED, like the hub's. The page answers "what are we on?"
  // from the folded summaries; opening one is for changing it.
  const [openCards, setOpenCards] = useState(() => new Set());
  const [flash, setFlash] = useState("");
  const searchRef = useRef(null);
  const flashTimer = useRef(null);
  // The last saved value of benefit charging, so the extra caution only fires
  // when it is switched from off to on.
  const benefitsWereOn = useRef(false);

  // Leave types, so the payout list is picked rather than typed as codes.
  const [leaveTypes, setLeaveTypes] = useState([]);
  // Salary components, so a payout or a recovery names a line instead of a
  // UUID (§4). Deductions charge; earnings pay.
  const [deductions, setDeductions] = useState([]);
  const [earnings, setEarnings] = useState([]);

  // Whole-run PDF work paused on this server (learned from a 503 elsewhere
  // this session). While it is, "prepare on release" is accepted and does
  // nothing, so it is the one control here that is genuinely not the person's
  // to fix — §11's definition of disabled.
  const bulkPaused = useBulkGenerationPaused();

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await payrollAPI.getSettings();
      const data = res?.data && typeof res.data === "object" ? res.data : null;
      benefitsWereOn.current = !!data?.benefit_deductions_enabled;
      setSaved(data);
      setSettings(data ? { ...data } : null);
      setAttempted(false);
    } catch (err) {
      setLoadFailed(true);
      showToast(payrollErrorMessage(err, "Couldn’t load the payroll settings"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Active types only: a payout can't be set up against a type nobody can
  // take. A failed read falls back to the plain code box in the picker.
  useEffect(() => {
    let cancelled = false;
    leaveAPI.getLeaveTypes({ include_inactive: false })
      .then((res) => { if (!cancelled) setLeaveTypes(res?.data?.records || res?.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getComponents({ is_active: true })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.records || res.data || [];
        setDeductions(rows.filter((c) => c.component_type === "deduction"));
        setEarnings(rows.filter((c) => c.component_type !== "deduction"));
      })
      // The pickers degrade to "Not set"; the rest of the page still works.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* Ctrl/⌘-K from anywhere on the page, the same shortcut the hub advertises,
     because the two screens are one product. Escape hands the page back. */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  /* ─── What there is to show ─────────────────────────────────────────────── */
  // Only what this server stores, with any enum value it uses added to its own
  // list (see `resolveEntry`). Keyed off `saved` so it is recomputed on a save
  // rather than on every keystroke.
  const groups = useMemo(() => resolveGroups(saved), [saved]);
  const searching = query.trim().length >= 2;
  const visibleGroups = useMemo(() => filterGroups(groups, query), [groups, query]);

  /* ─── What is waiting to be saved ───────────────────────────────────────
     TWO LISTS, NOT ONE. `touched` is what the person changed; `pending` is
     what will actually go out. They differ in exactly one case, and it is the
     one this page has been bitten by: an emptied NOT NULL box is a change
     (so it is highlighted, counted and blocks the save) but can never be sent
     as "" (so it is not in the patch). Counting from the patch alone is how
     a blank required box used to read as "everything is saved". */
  const pending = useMemo(
    () => (settings && saved ? settingsPatch(settings, saved) : {}),
    [settings, saved],
  );
  const touched = useMemo(
    () => (settings && saved ? touchedSettings(settings, saved) : []),
    [settings, saved],
  );
  const problems = useMemo(() => settingProblems(settings, groups), [settings, groups]);

  // Only a field the person actually changed can block the save. A value that
  // arrived out of range (or a required key the server returned empty) is the
  // server's business until somebody touches it — refusing to save an
  // unrelated change over it would strand the page.
  const blockers = useMemo(() => {
    const out = {};
    for (const key of touched) if (problems[key]) out[key] = problems[key];
    return out;
  }, [touched, problems]);

  const dirtyCards = useMemo(
    () => dirtyCardsOf(groups, touched),
    [groups, touched],
  );

  const setValue = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* ─── The shutters ─────────────────────────────────────────────────────── */
  const toggleCard = useCallback((key) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const allOpen = visibleGroups.length > 0 && visibleGroups.every((g) => openCards.has(g.key));
  const toggleAll = () => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      for (const group of visibleGroups) {
        if (allOpen) next.delete(group.key); else next.add(group.key);
      }
      return next;
    });
  };

  /** From the dock: drop the search, open the card, ring it, scroll to it. */
  const revealCard = useCallback((key) => {
    setQuery("");
    setOpenCards((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    setFlash(key);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 1600);
    requestAnimationFrame(() => {
      document.getElementById(payrollCardId(key))?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  // Back to exactly what the server last gave us. One Discard for the page,
  // because there is one Save for the page.
  const discardChanges = () => {
    setSettings(saved ? { ...saved } : null);
    setAttempted(false);
  };

  /* ─── The save ──────────────────────────────────────────────────────────
     §11: the button stays live and the press does the checking. A press on an
     unfinished form reveals, reddens and TRAVELS — which here also means
     opening the card the bad box is behind and dropping a search that is
     hiding it, because `focusFirstProblem` can only reach what is on screen. */
  const save = async () => {
    if (saving) return;

    if (hasProblems(blockers)) {
      setAttempted(true);
      setQuery("");
      setOpenCards((prev) => {
        const next = new Set(prev);
        for (const group of groups) {
          if (group.fields.some((entry) => entry.key in blockers)) next.add(group.key);
        }
        return next;
      });
      // After the cards have opened: a `display: none` box can't take focus.
      requestAnimationFrame(() => focusFirstProblem(blockers, payrollFieldId));
      return;
    }

    if (Object.keys(pending).length === 0) {
      showToast("Nothing has changed yet.", "error");
      return;
    }

    /* ONE CONFIRM, CARRYING OUR OWN CAUTIONS. These settings land on everybody
       at once, and `SETTING_WARNING` already holds a plain line for the ones
       that cost something to get wrong — the same lines the hub shows before
       the gateway's own gate. This endpoint has no reason gate, so the asking
       happens here; a change with no caution saves straight through.
       `window.confirm` is a promise in this app (§7) and is awaited. */
    const cautions = touched
      .map((key) => (SETTING_WARNING[key] ? `• ${settingLabel({ key })}: ${SETTING_WARNING[key]}` : null))
      .filter(Boolean);
    // Switching benefit charging ON starts deductions on the next calculation,
    // which no generic caution covers.
    if (settings.benefit_deductions_enabled && !benefitsWereOn.current) {
      cautions.push("• Every active benefit enrollment will be charged from the next payroll calculation. Check the benefit totals on the Payroll Runs readiness panel first.");
    }
    if (cautions.length > 0) {
      const ok = await window.confirm(
        `${cautions.length === 1 ? "Before this is saved" : "Before these are saved"}:\n\n${cautions.join("\n\n")}\n\nSave ${Object.keys(pending).length === 1 ? "it" : "them"}?`,
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // Only the changed keys. `pdf_render_engine` and emptied cache numbers
      // are stripped inside settingsPatch, so this save keeps working the day
      // those inert columns go.
      const res = await payrollAPI.updateSettings(pending);
      const stored = res?.data && typeof res.data === "object" ? res.data : {};
      // The response carries the stored values, so a box the server coerced
      // comes back as what it really is rather than what was typed.
      const next = { ...(saved || {}), ...pending, ...stored };
      setSaved(next);
      setSettings({ ...next });
      setAttempted(false);
      benefitsWereOn.current = !!next.benefit_deductions_enabled;
      const n = Object.keys(pending).length;
      showToast(`Saved — ${n === 1 ? "1 setting" : `${n} settings`} updated.`);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn’t update the settings"), "error");
    } finally {
      setSaving(false);
    }
  };

  /* The wall: an open card takes its whole course, folded ones go two to a
     course, and a folded card that would be left alone widens to close it.
     `layoutWall` measures nothing and never reorders — see settingsMeta. */
  const wall = useMemo(
    () => layoutWall(visibleGroups, searching ? visibleGroups.map((g) => g.key) : openCards),
    [visibleGroups, searching, openCards],
  );

  // While bulk PDF work is paused, "prepare on release" is accepted and does
  // nothing. The switch is off AND says why, rather than looking live.
  const lockedKeys = bulkPaused ? ["payslip_prerender_on_publish"] : [];
  const notes = bulkPaused
    ? {
      payslip_prerender_on_publish: "Paused on this server for now, along with every other whole-run PDF job — each payslip is prepared the first time somebody downloads it. Your choice is kept and takes effect once it’s switched back on.",
    }
    : {};

  const records = { leaveTypes, deductions, earnings };

  return (
    <>
      <DashboardTopBar title="Payroll Settings" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-slate-900">Payroll Settings</h1>
              <FieldHelp surface={SURFACE} field="page" label="this page" className="mb-0 ml-1" />
            </div>
            <p className={`text-sm ${TEXT.body} mt-1`}>
              The rules every payroll run follows, and what each one is set to today.
            </p>
          </div>

          {!loading && groups.length > 0 && (
            <div className="relative w-full lg:w-[22rem] xl:w-[26rem] shrink-0 lg:mt-1">
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }}
                placeholder="Search every setting — try “pay day” or “notice”"
                className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-16 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition"
                aria-label="Search payroll settings"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Clear search">
                  <HiX className="w-4 h-4" />
                </button>
              ) : (
                // The shortcut is advertised where it is used. Hidden at touch
                // widths, where there is no key to press.
                <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center h-5 px-1.5 rounded-md border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400 pointer-events-none">
                  Ctrl K
                </kbd>
              )}
            </div>
          )}
        </div>

        {loading ? <Skeleton type="card" /> : groups.length === 0 ? (
          /* "COULDN'T LOAD", NEVER "NOT SET" (§7). The payroll settings always
             exist on the server, so an empty read is a failed read — and
             inviting somebody to fill a page that can save nothing back is
             worse than telling them to try again. */
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-sm font-bold text-slate-700">
              {loadFailed ? "Couldn’t load the payroll settings." : "The payroll settings came back empty."}
            </p>
            <p className={`${META} mt-1`}>Nothing has been changed. Try again in a moment.</p>
            <button type="button" onClick={loadSettings} className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition">
              Try again
            </button>
          </div>
        ) : (
          /* A form, so Enter in a box saves — and the dock's own button is
             `type="button"`, so it calls the same handler rather than relying
             on a submit that Enter and the button would reach differently. */
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">

            {/* The band header: the module's own icon in the house badge, its
                name, and what the area is for in a line — the same block, in
                the same place, as the open tab of the settings hub. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-4">
              <div className="min-w-0 flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <BandIcon className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className={BAND_TITLE}>Payroll</h2>
                  <p className={`text-sm ${TEXT.body} mt-0.5`}>
                    How pay is worked out, who signs off what, when payslips go out, and what happens when somebody leaves.
                  </p>
                </div>
              </div>
              {!searching && visibleGroups.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900"
                >
                  <HiChevronDown aria-hidden="true" className={`w-3.5 h-3.5 transition-transform ${allOpen ? "rotate-180" : ""}`} />
                  {allOpen ? "Close all" : "Open all"}
                </button>
              )}
            </div>

            {searching && (
              <p className={`${META} px-1`}>
                {visibleGroups.length === 0
                  ? "Nothing on this page matches that."
                  : `${allFields(visibleGroups).length} setting${allFields(visibleGroups).length === 1 ? "" : "s"} match “${query.trim()}”.`}
              </p>
            )}

            {wall.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {wall.map(({ group, span }) => (
                  <div key={group.key} className={`min-w-0 ${span === 2 ? "xl:col-span-2" : ""}`}>
                    <PayrollSettingCard
                      group={group}
                      values={settings}
                      problems={blockers}
                      attempted={attempted}
                      dirtyKeys={touched}
                      // A search result is open: a card folded over the one
                      // row somebody searched for answers nothing.
                      open={searching || openCards.has(group.key)}
                      onToggle={toggleCard}
                      onChange={setValue}
                      saving={saving}
                      records={records}
                      lockedKeys={lockedKeys}
                      notes={notes}
                      surface={FIELD_SURFACE}
                      flash={flash === group.key}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ONE SAVE FOR THE PAGE, AND IT IS THE DOCK — sticky, so it is in
                view from any scroll position, it names which card is unsaved,
                and it already keeps out of Maya's corner. The page owns it
                because a card can be dirty while hidden behind the search,
                and scrolling to something `display: none` does nothing. */}
            <SettingsSaveDock
              cards={dirtyCards}
              total={touched.length}
              saving={saving}
              onReveal={revealCard}
              onSaveAll={save}
              onDiscardAll={discardChanges}
            />
          </form>
        )}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

/**
 * The cards the dock names, each with the number of its settings waiting.
 *
 * Read off the FULL group list rather than the visible one: a card hidden
 * behind a search is still unsaved, and the dock's whole job is to say so.
 */
function dirtyCardsOf(groups, touched) {
  const dirty = new Set(touched);
  return (groups || [])
    .filter((group) => group.fields.some((entry) => dirty.has(entry.key)))
    .map((group) => ({ key: group.key, label: group.label }));
}
