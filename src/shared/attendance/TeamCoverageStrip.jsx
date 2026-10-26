// ─────────────────────────────────────────────────────────────────────────────
// attendance/TeamCoverageStrip.jsx — Who on the team is here, day by day, for
// the manager reading their own schedule.
//
// WHY A STRIP AND NOT A TABLE. The question is "is anyone left on Thursday?",
// which is a shape question — you answer it by glancing along a row of bars,
// not by reading a column of numbers.
//
// SEVEN COLUMNS, NOT A SCROLL (2026-10-22). The window is fixed at a week, so
// the bars divide the panel evenly and the whole thing is readable without
// moving anything. It still tolerates a shorter or longer `days` array — the
// columns simply get wider or narrower — because the array length is the
// server's answer, not ours.
//
// IT IS A REAL COLUMN CHART AS OF 22 OCT 2026 (user: the graphs were awful).
// Each day was a 2px vertical sliver inside a bordered card — the numbers were
// right and the shape was unreadable, which is the one thing a chart is for.
// Now: full-width columns on one shared baseline, the track height IS
// `team_size`, a two-tick axis beside it, 4px rounded data ends, a 2px gap
// between columns, and every column's figure in text underneath. The fills are
// a validated pair (see `BAR_CLASS`) and the legend names both, so no day is
// identified by its colour alone.
//
// CONTRACT TRAPS (integration guide §7.4)
//  · `team_size` IS THE DENOMINATOR. `working_count + away_count` can EXCEED
//    it, because half-day leave counts the same person as both working and
//    away. Dividing by the sum would quietly shrink every bar on a half-day.
//  · All four counts are computed server-side over the whole team. Never
//    recount from `away[]` — that list can be capped, and a recount would
//    under-report in the quiet direction.
//  · `team_size: 0` is a 200 with a dense array of zeroes, not an error. A
//    manager with nobody reporting to them is a normal state.
//  · Scope is DIRECT REPORTS for every role, HR included — this endpoint is
//    deliberately not org-wide, so this must never be presented as an
//    organisation-wide view (delivery §3).
//
// WHY "EVERYONE OFF" IS NOT A WARNING. A Sunday reads 0 of 6 working, and
// flagging it would put a warning on every weekend in the window — which is
// how a useful flag becomes wallpaper. A day is only worth flagging when
// somebody is away on LEAVE and the rest are expected in; a scheduled closure
// is drawn in slate and labelled, not alarmed about.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiUserGroup, HiUsers } from "react-icons/hi";
import DetailDialog, { DetailSection, DetailText } from "../components/DetailDialog";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import { fmtDate, parseYMDLocal } from "./dates";
import { EmptyState, InlineAlert, LoadingRows, PersonCell } from "./ui";
import { LEAVE_PORTIONS } from "./agendaMeta";

const SURFACE = "attendance.my_schedule";
const PANEL = "bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden";
const PANEL_HEAD = "px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5";

/** Below this share of the team present, a working day is worth a second look. */
const THIN_COVERAGE = 0.6;

const weekdayOf = (ymd) => {
  const d = parseYMDLocal(ymd);
  return d ? d.toLocaleDateString("en-IN", { weekday: "narrow" }) : "";
};

const dayNumberOf = (ymd) => {
  const d = parseYMDLocal(ymd);
  return d ? String(d.getDate()) : "";
};

/** Why each person is away, in words. `holiday` can name itself; a weekly off can't. */
function awayReason(entry) {
  if (entry?.kind === "leave") {
    const portion = LEAVE_PORTIONS[entry.portion];
    const type = entry.leave_type_name || "On leave";
    return entry.portion && entry.portion !== "full" ? `${type} · ${portion}` : type;
  }
  if (entry?.kind === "holiday") return entry.holiday_name || "A holiday that applies to them";
  if (entry?.kind === "weekly_off") return "Weekly off";
  return "Away";
}

/**
 * How a day should read. Returns the tone and whether it is worth flagging.
 * A day nobody is expected on is a closure, not thin cover — see the header.
 */
function coverageOf(day, teamSize) {
  const working = day?.working_count || 0;
  const away = Array.isArray(day?.away) ? day.away : [];
  const onLeave = away.some((a) => a.kind === "leave");
  const ratio = teamSize > 0 ? working / teamSize : 0;
  const closed = working === 0 && !onLeave;

  if (closed) return { tone: "closed", flag: false, ratio: 0 };
  if (onLeave && ratio < THIN_COVERAGE) return { tone: "thin", flag: true, ratio };
  return { tone: "normal", flag: false, ratio };
}

/**
 * The two fills this chart uses, validated as a pair rather than picked by eye:
 * `purple-600` #9333ea against `fuchsia-400` #e879f9 separate at ΔE 15.9 for a
 * protan reader and 21.1 for everyone else. Fuchsia-400 sits under 3:1 against
 * white, which is why every column carries its figure in text underneath — the
 * colour is the glance, the label is the answer.
 */
const BAR_CLASS = {
  normal: "bg-purple-600",
  thin: "bg-fuchsia-400",
  closed: "bg-transparent",
};

/** Who is away on one day — the record inspector, not a tooltip (§3). */
function AwayDialog({ day, teamSize, onClose }) {
  if (!day) return null;
  const away = Array.isArray(day.away) ? day.away : [];

  return (
    <DetailDialog
      eyebrow="Team coverage"
      title={fmtDate(day.date)}
      subtitle={`${day.working_count} of ${teamSize} working`}
      icon={HiUsers}
      onClose={onClose}
      width="compact"
      footer={<p className="text-xs text-slate-500">Leave is approved elsewhere — this is a read-only view of who’s already away.</p>}
    >
      <DetailSection title={`Away (${away.length})`} icon={HiUserGroup} collapsible={false}>
        {away.length === 0 ? (
          <p className="text-sm text-slate-500">Everyone is expected in.</p>
        ) : (
          <ul className="space-y-3">
            {away.map((entry, i) => (
              <li key={`${entry.user_id || i}:${entry.kind}`} className="flex items-center justify-between gap-4">
                <PersonCell entity={entry} />
                <span className="text-xs text-slate-500 text-right shrink-0">{awayReason(entry)}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {/* Said plainly because the arithmetic looks wrong otherwise: a half day
          puts one person on both sides of the count. */}
      {day.working_count + day.away_count > teamSize && (
        <DetailText label="Why the numbers overlap">
          Someone is on a half day, so they count as both working and away — half the day is covered and half isn’t.
        </DetailText>
      )}

      {day.items_due_count > 0 && (
        <DetailText label="Falling due">
          {day.items_due_count === 1 ? "One thing is" : `${day.items_due_count} things are`} due from the team on this day.
          Open Team Tasks to see what.
        </DetailText>
      )}
    </DetailDialog>
  );
}

/**
 * @param {{days: object[], teamSize: number|null, maxTeamSize: number|null,
 *          lanes: object|null, loading: boolean, error: unknown}} props
 */
export default function TeamCoverageStrip({ days, teamSize, lanes, loading, errorNote }) {
  const [selected, setSelected] = useState(null);
  const size = teamSize || 0;

  return (
    <>
      <div className={PANEL}>
        <div className={PANEL_HEAD}>
          <HiUsers className="w-4 h-4 text-purple-600 shrink-0" />
          <h2 className="text-base font-bold text-slate-800">
            {/* Keyed on the API field the panel actually renders, not on a
                label of our own invention (§10). */}
            <HelpLabel text="Who’s in, day by day" help={{ surface: SURFACE, field: "working_count", label: "who’s in, day by day", size: "sm" }} />
          </h2>
          {size > 0 && (
            <span className="text-[11px] font-semibold text-slate-400">
              {size === 1 ? "1 person reports to you" : `${size} people report to you`}
            </span>
          )}
        </div>

        {errorNote && (
          <div className="px-5 sm:px-6 pt-4"><InlineAlert tone="rose">{errorNote}</InlineAlert></div>
        )}

        {loading && days.length === 0 ? (
          <div className="p-6"><LoadingRows rows={2} /></div>
        ) : size === 0 ? (
          <EmptyState
            icon={HiUserGroup}
            title="Nobody reports to you"
            message="There’s no team cover to work out. If you expected people here, ask HR who reports to you."
          />
        ) : (
          <div className="px-5 sm:px-6 py-5">
            {/* A failed task lane means the "due" dots are missing, not that
                the coverage beside them is wrong — so it degrades alone. */}
            {lanes?.tasks === "unavailable" && (
              <InlineAlert tone="amber" className="mb-4">
                We couldn’t load what the team owes, so the day markers below may be missing some.
              </InlineAlert>
            )}

            {/* ── The chart ────────────────────────────────────────────────
                Seven columns on one baseline, the track height IS the team, so
                a column you can see the top of is a day somebody is missing
                from. It was a 2px sliver per day until 22 Oct 2026, which drew
                the right numbers at a width nobody could read a shape in. */}
            <div className={`flex items-stretch gap-3 ${loading ? "opacity-60 transition-opacity" : ""}`}>
              {/* The axis: two ticks, because the only two values worth naming
                  are "everybody" and "nobody". */}
              <div className="shrink-0 w-8 h-28 flex flex-col justify-between items-end pb-px" aria-hidden="true">
                <span className="text-[10px] font-bold text-slate-400 tabular-nums leading-none">{size}</span>
                <span className="text-[10px] font-semibold text-slate-300 tabular-nums leading-none">0</span>
              </div>

              {/* The two axis lines are drawn once, over the whole plot, so the
                  baseline sits under the COLUMNS rather than under the labels
                  below them — seven separate borders would be seven dashes. */}
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-0 right-0 top-0 h-28 border-l border-b border-slate-200" aria-hidden="true" />
                <div className="relative flex gap-0.5 pl-1">
                {days.map((day) => {
                  const { tone, flag, ratio } = coverageOf(day, size);
                  const away = Array.isArray(day.away) ? day.away : [];
                  const openable = away.length > 0;
                  const label = `${fmtDate(day.date)}: ${day.working_count} of ${size} working${away.length ? `, ${away.length} away` : ""}`;

                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={!openable}
                      onClick={openable ? () => setSelected(day) : undefined}
                      aria-label={label}
                      title={label}
                      className={`group flex-1 min-w-0 flex flex-col items-stretch rounded-t-lg px-0.5 transition-colors ${
                        openable ? "cursor-pointer hover:bg-purple-50/70" : "cursor-default"
                      }`}
                    >
                      {/* The column: anchored to the baseline, 4px rounded at
                          the data end only, and a hairline track behind it so a
                          thin day still reads as a share of something. */}
                      <span className="h-28 flex flex-col justify-end" aria-hidden="true">
                        <span className="w-full bg-slate-50 flex flex-col justify-end" style={{ height: "100%" }}>
                          <span
                            className={`w-full rounded-t ${BAR_CLASS[tone]} ${openable ? "group-hover:brightness-95" : ""}`}
                            style={{ height: `${Math.round(Math.min(1, Math.max(ratio, tone === "closed" ? 0 : 0.04)) * 100)}%` }}
                          />
                        </span>
                      </span>

                      {/* Direct labels under every column: the figure is the
                          answer, the fill only points at it. */}
                      <span className={`mt-1.5 text-[11px] font-bold tabular-nums ${flag ? "text-fuchsia-700" : tone === "closed" ? "text-slate-400" : "text-slate-700"}`}>
                        {tone === "closed" ? "Off" : `${day.working_count}/${size}`}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        {weekdayOf(day.date)} {dayNumberOf(day.date)}
                      </span>
                      <span className="h-2 flex items-center justify-center">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${day.items_due_count > 0 ? "bg-purple-400" : "bg-transparent"}`}
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                  );
                })}
                </div>
              </div>
            </div>

            {/* A legend for two fills and a dot, so nothing on the chart is
                identified by its colour alone. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pl-11">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-600 shrink-0" aria-hidden="true" /> Expected in
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-fuchsia-400 shrink-0" aria-hidden="true" /> Thin — someone’s on leave
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" aria-hidden="true" /> Something due
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
              Each column is how much of your team is expected in that day, out of {size === 1 ? "the one person" : `all ${size}`} reporting to you.
              Open a day to see who’s away.
            </p>
          </div>
        )}
      </div>

      {selected && (
        <AwayDialog day={selected} teamSize={size} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
