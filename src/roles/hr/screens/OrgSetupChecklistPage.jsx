// ─────────────────────────────────────────────────────────────────────────────
// OrgSetupChecklistPage.jsx — "Organisation setup", the whole operational
// readiness checklist at /dashboard/hr/setup. The list half of the feature; the
// dashboard nudge is shared/organization/SetupChecklistCard.
//
// WHAT IT IS FOR. Twenty-two configuration milestones across six areas, each
// evaluated by the server as "at least 1 valid record exists". The page's job
// is to make the half-finished ones findable: a shift template with nobody
// assigned, an employee with no reporting manager, no PF/ESI rates. None of
// those raises an error anywhere — attendance simply never computes and
// payroll silently skips people — so a list is the only way anybody sees them.
//
// ─── THE LAYOUT, AND WHAT IT REPLACED (user decision, 21 Oct 2026) ─────────
// Three rewrites got it here, and the two rejected shapes are worth naming so
// nobody walks back into them:
//   1. Six stacked accordions with a status filter. Twenty-two rows deep,
//      every area half-open, the thing you came to do three folds down.
//   2. Tabs, but the figures in four separate bordered tiles above them and
//      the steps in a plain white card below. Four boxes on a white plane
//      saying four numbers, none of which was the headline — the page read as
//      a form, not as a progress screen.
// What it is now:
//   · ONE readiness figure, in the purple hero, drawn as a ring. It is the
//     only number anybody quotes, so it gets the size and the colour, and the
//     two facts that qualify it sit beside it INSIDE the banner (§5 — new
//     header information goes in the hero, never in a strip under it).
//   · ONE full-width tab per area (`SegmentedTabs`), carrying what is left in
//     it. The strip is the page's map, so the All/Still-to-do/Done filter it
//     replaced is gone — a second strip to narrow the first was the clutter.
//   · ONE area at a time, as a TIMELINE rather than a list of cards. The rail
//     and its connected dots say "this is a sequence you are partway through",
//     which is what a checklist is; a card per step said "these are six
//     unrelated objects". It is also why there is no inner card per row — the
//     rail does the grouping that a border was doing badly.
//
// ─── THE WHOLE ROW NAVIGATES ───────────────────────────────────────────────
// Each step is a real `<Link>` filling its row, not an onClick on a div: that
// keeps the keyboard, middle-click and "open in a new tab" that HR actually
// use to set several areas up at once, and it is why §3 forbids hand-rolled
// row clicks. There is no "Set this up" button — the row IS the button, which
// is also §3's "no View button in a row". A step we have no screen for is a
// plain non-interactive row, never a link that 404s (§2).
//
// ─── THREE THINGS THAT LOOK LIKE BUGS AND ARE NOT ──────────────────────────
// · THE SERVER'S `action_url` IS IGNORED. Not one of the 22 it returns is a
//   route in this app. `setupChecklistMeta.js` owns the task_key → route map
//   and its header has the table; a step with no route here gets no link
//   rather than a guess that 404s (§2).
// · "RE-CHECK NOW" IS THE ONLY CALLER OF `recheck=true`, because that flag
//   re-evaluates every task against the domain tables and PERSISTS the result.
//   A GET that writes doesn't belong on a mount or in an effect.
// · A STEP CAN GO BACKWARDS. The engine is bidirectional: delete your only
//   department and that step returns to pending. So the re-check toast can
//   honestly report fewer completed steps than before, and does.
//
// NO RECORD INSPECTOR, DELIBERATELY. §3 reserves DetailDialog for rows whose
// detail holds more than the row; a step's whole payload is its title, its
// sentence, whether it is a must-do and when it was done — all four are on the
// row. The row's job is to take you to the screen that fixes it.
//
// Contract: `md_organization/7_org_setup_checklist_api.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiArrowNarrowRight,
  HiBadgeCheck,
  HiCheck,
  HiClipboardCheck,
  HiRefresh,
  HiSparkles,
} from "react-icons/hi";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import ScreenHeader from "../../../shared/components/ScreenHeader";
import SegmentedTabs from "../../../shared/components/SegmentedTabs";
import { CARD } from "../../../shared/components/DashboardCard";
import { EmptyState, ErrorState, Toast, useToast } from "../../../shared/attendance/ui";
import FieldHelp, { HelpLabel } from "../../../shared/fieldHelp/FieldHelp";
import { fmtDate } from "../../../shared/attendance/dates";
import useSetupChecklist from "../../../shared/organization/useSetupChecklist";

const SURFACE = "organization.setup_checklist";

/* ── The figure, as a ring ────────────────────────────────────────────────── */

/**
 * Drawn rather than printed, because this number is the page's headline and a
 * bar the width of the header would have been a decoration beside the title
 * instead of the subject of it. Rotated -90° so the arc starts at twelve
 * o'clock. The arc is the one saturated thing in a deliberately quiet header,
 * which is the whole reason it reads as the figure to look at.
 */
function ProgressRing({ value, size = 112, stroke = 9, children }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * pct) / 100}
          className="stroke-purple-600 transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/* ── One step on the rail ─────────────────────────────────────────────────── */

/**
 * The dot is the status. Filled violet with a tick = done; a hollow fuchsia
 * ring = a must-do still outstanding; a hollow slate ring = an optional one.
 * Three states, no badges needed for two of them.
 */
function StepDot({ task }) {
  if (task.isDone) {
    return (
      <span className="relative z-10 w-7 h-7 rounded-full bg-violet-500 text-white flex items-center justify-center shadow-sm shadow-violet-500/30">
        <HiCheck className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span
      className={`relative z-10 w-7 h-7 rounded-full bg-white border-2 flex items-center justify-center ${
        task.isCore ? "border-fuchsia-400" : "border-slate-300"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${task.isCore ? "bg-fuchsia-400" : "bg-slate-300"}`} />
    </span>
  );
}

function StepContents({ task }) {
  // Resolved before it is interpolated: an unparseable timestamp has to drop
  // the whole " · <date>" clause, not leave "Done · " hanging.
  const doneOn = task.doneAt ? fmtDate(task.doneAt, { day: "numeric", month: "short" }, "") : "";

  return (
    <div className="min-w-0 flex-1 pb-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={`text-sm font-bold ${task.isDone ? "text-slate-500" : "text-slate-900"}`}>{task.title}</p>
        {task.isCore && !task.isDone && (
          <span className="shrink-0 rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-700">
            Must do
          </span>
        )}
        {/* A date is absent here when the server sent no timestamp, which is
            not the same as unknown — so it gets no N/A and no dash (§5). */}
        {task.isDone && (
          <span className="shrink-0 text-[11px] font-semibold text-violet-600">
            Done{doneOn ? ` · ${doneOn}` : ""}
          </span>
        )}
      </div>
      {task.body && (
        <p className={`text-xs mt-1 leading-relaxed ${task.isDone ? "text-slate-400" : "text-slate-500"}`}>{task.body}</p>
      )}
      {!task.route && !task.isDone && (
        <p className="text-[11px] font-semibold text-slate-400 mt-1.5">Not set up from this screen yet.</p>
      )}
    </div>
  );
}

function StepRow({ task, last }) {
  const inner = (
    <>
      {/* The rail. Drawn per row and stopped on the last one, so the line ends
          at the final dot rather than trailing into the card's padding. */}
      {!last && <span className="absolute left-[1.84rem] top-9 bottom-0 w-px bg-slate-200" aria-hidden="true" />}
      <StepDot task={task} />
      <StepContents task={task} />
    </>
  );

  const base = "relative flex items-start gap-4 px-5 sm:px-6 py-4";

  // Nowhere to go: a plain row, with no pointer and no hover, so it never
  // looks like something that failed to respond to a click.
  if (!task.route) {
    return <li className={base}>{inner}</li>;
  }

  return (
    <li className="relative">
      <Link
        to={task.route}
        className={`${base} group rounded-2xl transition-colors hover:bg-purple-50/50 focus-visible:bg-purple-50/70 focus-visible:outline-none`}
      >
        {inner}
        <HiArrowNarrowRight
          className={`w-5 h-5 shrink-0 mt-1 text-slate-300 transition-all group-hover:translate-x-1 ${
            task.isDone ? "group-hover:text-slate-400" : "group-hover:text-purple-600"
          }`}
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/* ── One area ─────────────────────────────────────────────────────────────── */

function CategoryPanel({ category }) {
  const Icon = category.icon;
  const complete = category.done === category.total;
  const pct = Math.round((category.done / category.total) * 100);
  // Outstanding first: the person opened this tab to do something, not to read
  // what they finished last month. Each half keeps the server's own order.
  const pending = category.tasks.filter((t) => !t.isDone);
  const done = category.tasks.filter((t) => t.isDone);
  const ordered = [...pending, ...done];

  return (
    <section className="bg-white rounded-3xl border border-slate-200/70 shadow-xs overflow-hidden">
      {/* A tinted head rather than another bordered strip: it separates the
          area from its steps with colour instead of with one more line. */}
      <div className="relative px-5 sm:px-6 py-5 bg-gradient-to-br from-purple-50/80 via-white to-white border-b border-slate-100">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
            complete ? "bg-violet-500 text-white shadow-violet-500/25" : "bg-gradient-to-br from-[#6D28D9] to-[#5B21B6] text-white shadow-purple-600/25"
          }`}>
            <Icon className="w-5 h-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="text-base font-bold text-slate-900">{category.title}</h2>
              {complete ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                  <HiBadgeCheck className="w-3 h-3" /> Complete
                </span>
              ) : (
                <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-700">
                  {category.total - category.done} left
                </span>
              )}
            </div>
            {category.body && <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">{category.body}</p>}
          </div>

          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-slate-900 tabular-nums leading-none">
              {category.done}<span className="text-slate-300">/</span>{category.total}
            </p>
            <div className="mt-2 h-1.5 w-20 rounded-full bg-slate-200/70 overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${complete ? "bg-violet-500" : "bg-purple-600"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <ul className="py-2 px-1.5">
        {ordered.map((task, i) => (
          <StepRow key={task.key} task={task} last={i === ordered.length - 1} />
        ))}
      </ul>
    </section>
  );
}

/* ── The page ─────────────────────────────────────────────────────────────── */

export default function OrgSetupChecklistPage() {
  const { checklist, state, error, rechecking, reload, recheck } = useSetupChecklist();
  const { toast, showToast, clearToast } = useToast();
  const [activeKey, setActiveKey] = useState(null);

  const categories = useMemo(() => checklist?.categories || [], [checklist]);

  // Land on the first area with something outstanding, rather than on whichever
  // one the server happens to send first. Only until the person picks a tab:
  // after that their choice stands, including across a re-check.
  useEffect(() => {
    if (!categories.length) return;
    setActiveKey((prev) => {
      if (prev && categories.some((c) => c.key === prev)) return prev;
      return (categories.find((c) => c.done < c.total) || categories[0]).key;
    });
  }, [categories]);

  const tabs = useMemo(() => categories.map((category) => ({
    key: category.key,
    label: category.tab,
    icon: category.icon,
    count: category.total - category.done,
    done: category.done === category.total,
  })), [categories]);

  const active = categories.find((c) => c.key === activeKey) || categories[0] || null;

  const handleRecheck = async () => {
    // The hook answers a re-entrant press with null, same as a failure. The
    // button is disabled while one is in flight, but a keyboard repeat or a
    // double click can still land both, and "couldn't re-check" would be the
    // wrong thing to say about a check that is running right now.
    if (rechecking) return;
    const result = await recheck();
    if (!result) { showToast("Couldn’t re-check your setup just now. Try again in a moment.", "error"); return; }
    const { before, after } = result;
    const moved = before == null ? 0 : after.done - before;
    if (moved > 0) showToast(`${moved === 1 ? "One more step is" : `${moved} more steps are`} now done.`);
    // The engine is bidirectional — this is the deleted-my-only-department
    // case, and saying "nothing changed" there would be a lie.
    else if (moved < 0) showToast(`${-moved === 1 ? "One step is" : `${-moved} steps are`} no longer complete. Something they depend on was removed.`, "info");
    else showToast("Checked — nothing has changed since the last look.", "info");
  };

  return (
    <>
      <DashboardTopBar title="Organisation setup" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">

        <ScreenHeader
          icon={HiSparkles}
          eyebrow="Setup"
          title="Organisation setup"
          subtitle="What your organisation needs in place before attendance, leave and payroll work properly — and what is still outstanding."
          rightContent={state === "ready" && checklist ? (
            <ReadinessHero checklist={checklist} rechecking={rechecking} onRecheck={handleRecheck} />
          ) : null}
        />

        {state === "loading" ? (
          <SetupSkeleton />
        ) : state === "unavailable" ? (
          /* Not deployed, or a server that doesn't open this to this role. A
             capability that isn't there is absent, not broken (§2) — so this
             is a plain notice and not a red error anybody can retry into
             working. */
          <div className={CARD}>
            <EmptyState
              icon={HiClipboardCheck}
              title="The setup checklist isn’t available yet"
              message="This version of HR Clouds can’t read your organisation’s setup progress. Everything in Setup still works — use the sidebar to open each area directly."
            />
          </div>
        ) : state === "error" || !checklist ? (
          <div className={CARD}>
            <ErrorState error={error} onRetry={reload} fallback="Couldn’t load your setup checklist." />
          </div>
        ) : (
          <>
            {/* The ⓘ sits BESIDE the strip, never inside it: a help button
                inside a tablist is another tab as far as the keyboard is
                concerned (§10). */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SegmentedTabs
                  tabs={tabs}
                  value={active?.key}
                  onChange={setActiveKey}
                  ariaLabel="Setup areas"
                />
              </div>
              {active && (
                <FieldHelp
                  surface={SURFACE}
                  field={`tab.${active.key}`}
                  label={`the ${active.title} area`}
                  className="mb-0 shrink-0"
                />
              )}
            </div>

            {active && <CategoryPanel category={active} />}
          </>
        )}
      </main>
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

/* ── What rides in the hero ───────────────────────────────────────────────── */

/**
 * The ring, the two facts that qualify it, and the re-check. It sits in the
 * quiet white `ScreenHeader`, so everything here is in NORMAL tones — the ⓘ is
 * a default `FieldHelp` and not `onDark` (§10), and the one outstanding figure
 * is the only coloured thing in the group.
 */
function ReadinessHero({ checklist, rechecking, onRecheck }) {
  const { readiness, coreDone, coreTotal, pending, isOperational, isFullySetup } = checklist;

  return (
    <div className="flex items-center gap-5 sm:gap-6">
      <ProgressRing value={readiness}>
        <span className="text-2xl font-bold tabular-nums leading-none text-slate-900">{readiness}%</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1">ready</span>
      </ProgressRing>

      <div className="min-w-0 space-y-2.5">
        <HeroFact
          label={<HelpLabel text="Ready to run" help={{ surface: SURFACE, field: "is_operational", size: "sm" }} />}
          value={isOperational ? "Yes" : "Not yet"}
          strong={!isOperational}
        />
        <HeroFact
          label={<HelpLabel text="Must-do steps" help={{ surface: SURFACE, field: "is_core", size: "sm" }} />}
          value={`${coreDone} of ${coreTotal}`}
        />
        <HeroFact
          label={<HelpLabel text="Still to do" help={{ surface: SURFACE, field: "readiness_percentage", size: "sm" }} />}
          value={isFullySetup ? "Nothing" : String(pending)}
        />

        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 hover:border-purple-200 hover:text-purple-700 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition disabled:opacity-60"
        >
          <HiRefresh className={`w-3.5 h-3.5 ${rechecking ? "animate-spin" : ""}`} />
          {rechecking ? "Checking…" : "Re-check now"}
        </button>
      </div>
    </div>
  );
}

function HeroFact({ label, value, strong }) {
  return (
    <div className="flex items-baseline gap-2.5 whitespace-nowrap">
      <span className="text-[11px] font-semibold text-slate-500 w-[5.5rem] shrink-0">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${strong ? "text-fuchsia-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}

/* ── Loading ──────────────────────────────────────────────────────────────── */

// Shaped like the content it replaces — the tab strip, then one area's rail —
// so nothing jumps when the read lands (§5). The hero is already drawn above
// it, so it isn't repeated here.
function SetupSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-[62px] rounded-2xl bg-white border border-slate-200/70 animate-pulse" />

      <div className="bg-white rounded-3xl border border-slate-200/70 shadow-xs overflow-hidden animate-pulse">
        <div className="px-5 sm:px-6 py-5 bg-gradient-to-br from-purple-50/80 via-white to-white border-b border-slate-100 flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 w-44 rounded bg-slate-200" />
            <div className="h-3 w-full max-w-md rounded bg-slate-100" />
          </div>
          <div className="w-20 h-6 rounded bg-slate-100 shrink-0" />
        </div>
        <div className="py-2 px-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-4 px-5 sm:px-6 py-4">
              <div className="w-7 h-7 rounded-full bg-slate-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-44 rounded bg-slate-200" />
                <div className="h-3 w-full max-w-lg rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
