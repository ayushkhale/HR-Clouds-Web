// ─────────────────────────────────────────────────────────────────────────────
// attendance/SelfRecordDialogs.jsx — Record inspectors for the four self-service
// attendance lists (My Corrections, My Flags, My Overtime, My Comp-offs).
//
// These four lists used to be dead ends: the reason, the reviewer's remarks and
// the resolution note were squeezed into a table cell with `truncate` and a
// `title` tooltip. A tooltip is not a detail view — it never appears on a touch
// device, it is not reachable by keyboard, and the one sentence the reader
// actually came for ("why was this rejected?") was the part cut off.
//
// So each list now follows the house flow: short scannable rows, the row opens
// the record, and the record is a DetailDialog record-inspector. The pages are
// mounted in all three workspaces under SELF_SERVICE_BASE, so an employee, a
// manager and an HR user reading their own attendance all get the same thing.
//
// Deliberately NOT the approver's panels from DecisionContext.jsx. Those are
// decision support — who this person is, which policy applied, the geofence —
// and they carry their own lighter card style. Reading your own record is a
// different question: what did I ask for, what happened, what did the reviewer
// say. Where the payload does embed the attendance day (`record`), the
// requested-vs-recorded comparison is shown, because that part an employee does
// want.
// ─────────────────────────────────────────────────────────────────────────────

import {
  HiCalendar, HiCheckCircle, HiClock, HiExclamationCircle, HiGift,
  HiLightningBolt, HiPencilAlt, HiUser,
} from "react-icons/hi";
import DetailDialog, {
  DetailGrid, DetailSection, DetailStats, DetailTable, DetailText,
} from "../components/DetailDialog";
import { anomalyStatusKey, anomalyTypeLabel, humanize } from "./enums";
import {
  fmtDate, fmtDateTime, fmtHours, fmtMinutes, fmtTime, toLocalYMD, workedLabel, ymdOnly,
} from "./dates";
import { StatusBadge } from "./ui";

const LONG_DATE = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

/** The attendance day, when the payload carries it. Self lists often don't. */
const recordOf = (item) => item?.record || item?.attendance_record || null;

/** A time that landed on the next calendar day is labelled, not silently shown. */
function TimeWithDayHint({ iso, date }) {
  if (!iso) return null;
  const nextDay = date && toLocalYMD(iso) > ymdOnly(date);
  return (
    <span>
      {fmtTime(iso)}
      {nextDay && <span className="ml-1 text-[10px] font-bold text-indigo-500">next day</span>}
    </span>
  );
}

/** Whatever the reviewer wrote, under any of the names the API has used. */
const reviewerNote = (item) =>
  item?.remarks || item?.manager_remarks || item?.manager_note || item?.review_remarks || null;

/** When it was decided, under any of the names the API has used. */
const decidedAt = (item) => item?.approved_at || item?.reviewed_at || item?.actioned_at || null;

/**
 * The shared tail of all four inspectors: what the reviewer said and when.
 * It is always rendered, even with nothing in it — "no note was left" is an
 * answer, and its absence is what sent people looking for a tooltip.
 */
function ReviewSection({ item, pending }) {
  const note = reviewerNote(item);
  const when = decidedAt(item);
  return (
    <DetailSection title="Review" icon={HiUser}>
      <DetailGrid
        cols={2}
        items={[
          ["Decided on", when ? fmtDateTime(when) : null],
          ["Submitted on", item?.created_at ? fmtDateTime(item.created_at) : null],
        ]}
      />
      <div className="mt-4">
        <DetailText label="What the reviewer said">
          {note || (pending ? "Nobody has reviewed this yet." : "No note was left.")}
        </DetailText>
      </div>
    </DetailSection>
  );
}

// ── My Corrections ──────────────────────────────────────────────────────────

/** @param {{ item: object, onClose: () => void }} props */
export function RegularizationDetailDialog({ item, onClose }) {
  const date = ymdOnly(item?.date);
  const record = recordOf(item);
  const status = String(item?.status || "pending").toLowerCase();
  const pending = status === "pending";

  // Only worth a comparison when the day's recorded times came with the row;
  // otherwise the requested times stand on their own.
  const hasComparison = !!record && (record.clock_in_time || record.clock_out_time);

  return (
    <DetailDialog
      eyebrow="Attendance correction"
      icon={HiPencilAlt}
      title={fmtDate(date, LONG_DATE)}
      subtitle="A correction you asked for on this day"
      badge={<StatusBadge kind="regularization" status={item?.status || "pending"} />}
      onClose={onClose}
    >
      <DetailStats
        items={[
          { label: "Clock in you asked for", value: item?.requested_clock_in ? <TimeWithDayHint iso={item.requested_clock_in} date={date} /> : null, icon: HiClock },
          { label: "Clock out you asked for", value: item?.requested_clock_out ? <TimeWithDayHint iso={item.requested_clock_out} date={date} /> : null, icon: HiClock },
          { label: "How you worked", value: item?.work_mode ? humanize(item.work_mode) : null, icon: HiUser },
        ]}
      />

      {hasComparison && (
        <DetailSection title="What changes" icon={HiCalendar}>
          <DetailTable
            rows={[
              {
                label: "Clock in",
                was: record.clock_in_time ? fmtTime(record.clock_in_time) : null,
                asked: item?.requested_clock_in ? <TimeWithDayHint iso={item.requested_clock_in} date={date} /> : null,
              },
              {
                label: "Clock out",
                was: record.clock_out_time ? fmtTime(record.clock_out_time) : null,
                asked: item?.requested_clock_out ? <TimeWithDayHint iso={item.requested_clock_out} date={date} /> : null,
              },
            ]}
            rowKey={(r) => r.label}
            columns={[
              { header: "", render: (r) => <span className="font-semibold text-slate-700">{r.label}</span> },
              { header: "Recorded on the day", render: (r) => r.was },
              { header: "You asked for", render: (r) => <span className="font-bold text-violet-700">{r.asked}</span> },
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-3">
            {pending
              ? "If this is approved, the times on the right replace the ones on the left."
              : status === "approved"
                ? "The times on the right were applied to your attendance for this day."
                : "Your attendance for this day was left as it was recorded."}
          </p>
        </DetailSection>
      )}

      <DetailSection title="Why you asked" icon={HiPencilAlt}>
        <DetailText>{item?.reason}</DetailText>
      </DetailSection>

      <ReviewSection item={item} pending={pending} />
    </DetailDialog>
  );
}

// ── My Flags ────────────────────────────────────────────────────────────────

/** @param {{ item: object, onClose: () => void }} props */
export function AnomalyDetailDialog({ item, onClose }) {
  const date = ymdOnly(item?.date || item?.record_date || item?.created_at);
  const resolved = anomalyStatusKey(item) === "resolved";

  return (
    <DetailDialog
      eyebrow="Attendance flag"
      icon={HiExclamationCircle}
      title={anomalyTypeLabel(item?.type || item?.anomaly_type)}
      subtitle={fmtDate(date, LONG_DATE)}
      badge={<StatusBadge kind="anomaly" status={anomalyStatusKey(item)} />}
      onClose={onClose}
    >
      <DetailStats
        items={[
          { label: "Day", value: fmtDate(date), icon: HiCalendar },
          { label: "How serious", value: item?.severity ? humanize(item.severity) : null, icon: HiExclamationCircle },
          { label: "Sorted out", value: resolved ? "Yes" : "Not yet", hint: item?.resolved_at ? fmtDateTime(item.resolved_at) : undefined, icon: HiCheckCircle },
        ]}
      />

      <DetailSection title="What was flagged" icon={HiExclamationCircle}>
        <DetailGrid
          cols={3}
          items={[
            ["Flag", anomalyTypeLabel(item?.type || item?.anomaly_type)],
            ["How serious", item?.severity ? humanize(item.severity) : null],
            ["Raised on", item?.created_at ? fmtDateTime(item.created_at) : null],
          ]}
        />
        <div className="mt-4">
          <DetailText label="Details">
            {item?.description || "The system did not record any extra detail for this flag."}
          </DetailText>
        </div>
      </DetailSection>

      {/* Anomalies carry `is_resolved` + `resolution_notes`, not a status
          string, and no reviewer/decided-at pair — so this replaces the shared
          ReviewSection rather than using it. */}
      <DetailSection title="How it was sorted out" icon={HiCheckCircle}>
        <DetailGrid
          cols={2}
          items={[["Sorted out on", item?.resolved_at ? fmtDateTime(item.resolved_at) : null]]}
        />
        <div className="mt-4">
          <DetailText label="Note">
            {item?.resolution_notes || (resolved ? "No note was left." : "Nothing yet — this flag is still open.")}
          </DetailText>
        </div>
      </DetailSection>
    </DetailDialog>
  );
}

// ── My Overtime ─────────────────────────────────────────────────────────────

/** @param {{ item: object, minutes: number|null, onClose: () => void }} props */
export function OvertimeDetailDialog({ item, minutes, onClose }) {
  const date = ymdOnly(item?.date || item?.record_date || recordOf(item)?.date);
  const record = recordOf(item);
  const status = String(item?.status || "pending").toLowerCase();

  return (
    <DetailDialog
      eyebrow="Overtime"
      icon={HiLightningBolt}
      title={fmtDate(date, LONG_DATE)}
      subtitle="Extra hours recorded from your attendance"
      badge={<StatusBadge kind="overtime" status={item?.status || "pending"} />}
      onClose={onClose}
    >
      <DetailStats
        items={[
          { label: "Extra time", value: minutes != null ? fmtMinutes(minutes) : null, hint: "beyond your shift", icon: HiLightningBolt },
          { label: "Day", value: fmtDate(date), icon: HiCalendar },
          { label: "Time on the clock", value: record ? workedLabel(record) : null, icon: HiClock },
        ]}
      />

      <DetailSection title="The day this came from" icon={HiCalendar}>
        <DetailGrid
          items={[
            ["Day", fmtDate(date)],
            ["Extra time", minutes != null ? fmtMinutes(minutes) : null],
            ["Clocked in", record?.clock_in_time ? fmtTime(record.clock_in_time) : null],
            ["Clocked out", record?.clock_out_time ? fmtTime(record.clock_out_time) : null],
          ]}
        />
        <p className="text-[11px] text-slate-500 mt-3">
          Overtime is worked out from your punches and your shift. It is not something you apply for.
        </p>
      </DetailSection>

      {item?.reason && (
        <DetailSection title="Why the extra hours" icon={HiPencilAlt}>
          <DetailText>{item.reason}</DetailText>
        </DetailSection>
      )}

      <ReviewSection item={item} pending={status === "pending"} />
    </DetailDialog>
  );
}

// ── My Comp-offs ────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {object} props.item
 * @param {string} props.term      the org's own word for comp-off
 * @param {string|null} props.workedOn
 * @param {number|string|null} props.credit
 * @param {string|null} props.expiresOn
 * @param {boolean} props.expiringSoon
 * @param {() => void} props.onClose
 */
export function CompOffDetailDialog({ item, term, workedOn, credit, expiresOn, expiringSoon, onClose }) {
  const status = String(item?.status || "earned").toLowerCase();
  const creditLabel = credit != null ? `+${credit} day${Number(credit) === 1 ? "" : "s"}` : null;

  return (
    <DetailDialog
      eyebrow={term}
      icon={HiGift}
      title={workedOn ? fmtDate(workedOn, LONG_DATE) : term}
      subtitle="A day you worked when you did not have to"
      badge={<StatusBadge kind="compoff" status={item?.status || "earned"} />}
      onClose={onClose}
    >
      <DetailStats
        items={[
          { label: "Days credited", value: creditLabel, icon: HiGift },
          { label: "Hours you worked", value: item?.worked_hours != null ? fmtHours(item.worked_hours) : null, icon: HiClock },
          { label: "Use it before", value: expiresOn ? fmtDate(expiresOn) : null, hint: expiringSoon ? "expiring soon" : undefined, icon: HiCalendar },
        ]}
      />

      {expiringSoon && (
        <p className="flex items-start gap-2 text-xs font-semibold text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-3">
          <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
          This expires within the next two weeks. Apply for it from My Leaves before then, or you lose the day.
        </p>
      )}

      <DetailSection title="How you earned it" icon={HiGift}>
        <DetailGrid
          items={[
            ["Day you worked", workedOn ? fmtDate(workedOn) : null],
            ["Hours you worked", item?.worked_hours != null ? fmtHours(item.worked_hours) : null],
            ["Days credited", creditLabel],
            ["Use it before", expiresOn ? fmtDate(expiresOn) : null],
          ]}
        />
        <p className="text-[11px] text-slate-500 mt-3">
          {status === "approved"
            ? "These days are on your leave balance. Apply for them from My Leaves."
            : status === "earned" || status === "pending"
              ? "Once this is approved the days go onto your leave balance."
              : "These days are no longer available."}
        </p>
      </DetailSection>

      <ReviewSection item={item} pending={status === "earned" || status === "pending"} />
    </DetailDialog>
  );
}
