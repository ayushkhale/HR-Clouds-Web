// ─────────────────────────────────────────────────────────────────────────────
// SetupChecklistCard — "Finish setting up your organisation", on the HR
// dashboard. The nudge half of the setup checklist; the full list is
// OrgSetupChecklistPage at /dashboard/hr/setup.
//
// WHY IT EXISTS. An operating HR has 22 interlocking configuration steps and
// the ones that bite are invisible: a shift template with nobody assigned to
// it, an employee with no reporting manager, no PF/ESI rates. Nothing errors —
// hours simply never compute, leave requests reach nobody, and payroll skips
// people. By the time it shows it is month end. So the dashboard says which
// step is next while there is still time to do it.
//
// IT SITS ABOVE ProfileSetupCard, AND THAT ORDER IS DELIBERATE. The HR's own
// record can't be finished before the organisation has an office and a
// department to pick from — ProfileSetupCard says as much in its own copy. The
// org checklist is where those two come from, so it goes first.
//
// ─── IT GETS QUIETER, THEN IT LEAVES ────────────────────────────────────────
// Three renders, not one:
//   · a must-do step is pending → the full card, with the next step in it;
//   · every must-do done, optional ones left → ONE line and a link. A panel
//     nagging about company holidays for ever is how the ⓘ icons on everyday
//     data got themselves removed (2026-10-01); but dropping the card dead
//     would hide the rest, so it shrinks instead of going;
//   · everything done → nothing, for good.
// Not HR, still loading, or an endpoint this server doesn't have → nothing
// either: no error, no empty frame. The read is gated on the role BEFORE the
// call, because the endpoint is HR_ONLY and a 403 is not a diagnosis (§2).
//
// DISMISSAL IS FOR THE SESSION ONLY, and keyed per organisation — the
// consequences are permanent and someone who switches org is looking at a
// different checklist, so neither silence carries over.
//
// Contract: `md_organization/7_org_setup_checklist_api.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "react-router-dom";
import { HiArrowRight, HiCheckCircle, HiClipboardCheck, HiX } from "react-icons/hi";
import { useAuth } from "../contexts/AuthContext";
import useSetupChecklist from "./useSetupChecklist.js";
import { nextStep, ORG_SETUP_PATH } from "./setupChecklistMeta.js";

const dismissKey = (orgId, userId) => `hrc.orgSetup.dismissed.${orgId || userId || "me"}`;

const wasDismissed = (key) => {
  try { return sessionStorage.getItem(key) === "1"; } catch { return false; }
};

/** One category's progress, small enough that six of them fit a row. */
function CategoryPill({ category }) {
  const complete = category.done === category.total;
  const Icon = category.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${complete
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : "border-slate-200 bg-white text-slate-600"}`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${complete ? "text-violet-500" : "text-slate-400"}`} />
      <span className="truncate max-w-[9rem]">{category.title}</span>
      <span className="tabular-nums">{category.done}/{category.total}</span>
    </span>
  );
}

export default function SetupChecklistCard({ className = "" }) {
  const { user, orgId } = useAuth();
  const userId = user?.user_id || user?.id || null;
  const { checklist, state } = useSetupChecklist();
  const key = dismissKey(orgId, userId);

  // Re-read when the key changes, not only on mount. sessionStorage survives
  // the reload DashboardTopBar does on an org switch, so "Not now" in one
  // organisation must not hide a brand-new organisation's checklist on sight —
  // and this holds whether or not that reload is still there (see the refetch
  // key in useSetupChecklist).
  const [storedKey, setStoredKey] = useState(key);
  const [dismissed, setDismissed] = useState(() => wasDismissed(key));
  if (storedKey !== key) {
    setStoredKey(key);
    setDismissed(wasDismissed(key));
  }

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(key, "1"); } catch { /* private mode */ }
  };

  // No skeleton on purpose: this is the one card on the dashboard that usually
  // isn't there at all, so a placeholder would promise a card that never
  // arrives and shift everything below it when it doesn't.
  if (state !== "ready" || !checklist || checklist.isFullySetup || dismissed) return null;

  const { readiness, done, total, pending, corePending, categories } = checklist;
  const step = nextStep(checklist);

  // ── Every must-do step done: one line, not a card ──
  // `pending === 0` is belt and braces: it means the rows say everything is
  // done while the summary's `is_fully_setup` says otherwise. Trust the rows —
  // "0 optional steps left" is worse than silence.
  if (pending === 0) return null;
  if (corePending === 0) {
    return (
      <section className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 ${className}`}>
        <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />
        <p className="text-sm font-semibold text-slate-800">
          Your organisation is ready to run.
          <span className="font-normal text-slate-600">
            {" "}{pending === 1 ? "One optional step" : `${pending} optional steps`} left.
          </span>
        </p>
        <Link
          to={ORG_SETUP_PATH}
          className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 ml-auto whitespace-nowrap"
        >
          See {pending === 1 ? "it" : "them"} <HiArrowRight className="w-3.5 h-3.5" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition"
          aria-label="Hide this reminder for now"
        >
          <HiX className="w-3.5 h-3.5" />
        </button>
      </section>
    );
  }

  return (
    <section className={`rounded-3xl border border-purple-100 bg-gradient-to-br from-purple-50 via-white to-white shadow-2xs p-5 sm:p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
          <HiClipboardCheck className="w-5 h-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">Finish setting up your organisation</h2>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                {done} of {total} steps done.{" "}
                {/* The consequence, not the count (§6): "2 must-do steps left"
                    on its own doesn't tell anybody why they should care. */}
                <span className="font-semibold text-slate-800">
                  {corePending === 1 ? "One step" : `${corePending} steps`} still needed
                </span>{" "}
                before attendance and payroll can run properly.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold text-fuchsia-700">
              {readiness}% ready
            </span>
          </div>

          <div
            className="mt-4 h-2 w-full rounded-full bg-slate-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={readiness}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Organisation setup progress"
          >
            <div className="h-full rounded-full bg-purple-600 transition-[width] duration-500" style={{ width: `${readiness}%` }} />
          </div>

          {/* Hidden at phone width: six pills in a 250px column stack into a
              tower and the card is already the tallest thing on the screen
              there. The same six counts are on the full page, laid out for the
              room, and the card's job on a phone is the next step and a way
              to get to it. */}
          {categories.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5 mt-3.5">
              {categories.map((category) => <CategoryPill key={category.key} category={category} />)}
            </div>
          )}

          {step ? (
            <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600">Next step</p>
              <p className="text-sm font-bold text-slate-800 mt-1">{step.title}</p>
              {step.body && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.body}</p>}
              <Link
                to={step.route}
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                Set this up <HiArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            // Everything left is a step this build has no screen for. There is
            // no button to offer, so the full list — which explains each one —
            // is the only honest destination.
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">
              The steps still outstanding aren’t set up from here. The full list says where each one is handled.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Link
              to={ORG_SETUP_PATH}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-4 py-2.5 rounded-xl transition"
            >
              See all {total} steps <HiArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button type="button" onClick={dismiss} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-white rounded-xl transition">
              Not now
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white transition"
          aria-label="Hide this reminder for now"
        >
          <HiX className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
