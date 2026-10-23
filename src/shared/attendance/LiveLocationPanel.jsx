// ─────────────────────────────────────────────────────────────────────────────
// LiveLocationPanel — "where is this person, and who has asked lately", on one
// employee's record. ONE component for HR and the manager (CLAUDE.md §2);
// `viewer` picks the API plane and hides nothing from the layout.
//
// ─── WHY IT LIVES INSIDE Reporting & Location ──────────────────────────────
// That tab already answers "where is this person allowed to clock in from".
// "Where are they right now" is the same question in the present tense, and
// the two are read together — a fix 4 km from every assigned site means
// nothing until you can see which sites those are. A tenth tab on the profile
// strip would also have cost more than it gave: the strip already scrolls.
//
// ─── WHY THE HISTORY IS HERE AND NOT A SCREEN ──────────────────────────────
// There is no org-wide "all location requests" endpoint — history is read per
// person, on both planes. A page listing requests would therefore have to ask
// you to pick a person first, which is what this tab already is.
//
// ─── THE ABSENT-NOT-BROKEN RULES (§2) ──────────────────────────────────────
// · The whole panel is hidden when the organisation has the feature off. For
//   HR that is a real policy read; a manager has no policy endpoint, so they
//   start optimistic and the panel disappears after one refusal
//   (`locatePlanes.js` explains why that is the only honest option).
// · The panel is hidden on your OWN record — `CANNOT_LOCATE_SELF` is a
//   guaranteed 422, so the button is absent rather than present and doomed.
// · A server with no such endpoints answers 404 on the history read; the panel
//   stays, the list says so, and the button still works. A missing feature
//   degrades to a quiet surface, never a crash (§7).
//
// ─── WHAT A ROW IS ─────────────────────────────────────────────────────────
// A request, not a position: who asked, why, and whether a fix came back.
// Rows open the record inspector (§3) — there is no eye button, and the whole
// `<tr>` carries `rowPreviewProps` so the keyboard reaches it too.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiLocationMarker, HiClock, HiShieldExclamation, HiExternalLink, HiUser,
} from "react-icons/hi";
import DetailDialog, {
  DetailGrid, DetailSection, DetailText, displayValue, rowPreviewProps,
} from "../components/DetailDialog";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import { useAuth } from "../contexts/AuthContext";
import { TONE_CLASSES, TONE_DOT } from "./enums";
import { fmtDateTime } from "./dates";
import { unwrap } from "./normalize";
import { EmptyState, ErrorState, LoadingRows } from "./ui";
import LocationPinMap from "./LocationPinMap";
import LocateDialog from "./LocateDialog";
import { canLocate, locatePlane, useLocationChecks } from "./locatePlanes";
import {
  SPOOF_BADGE, accuracyLabel, boundsMeta, coordsLabel, distanceLabel,
  hasCoords, mapsLink, sinceLabel, statusMetaOf,
} from "./liveLocationMeta";

const SURFACE = "attendance.locate_employee";
const HISTORY_LIMIT = 10;

/**
 * The status chip. Drawn here rather than through `StatusBadge`, which resolves
 * its own tone from the attendance enum maps — these four statuses are not in
 * them, and passing a className alongside would leave the dot on the wrong
 * colour. Same shape, same sizes, one source of words (`liveLocationMeta`).
 */
function LocateStatusBadge({ status }) {
  const meta = statusMetaOf(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone]}`}
      title={meta.note}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/**
 * @param {object} props
 * @param {string} props.userId
 * @param {string} props.name
 * @param {object} [props.person] directory row, for the avatar in the dialog
 * @param {"hr"|"manager"} props.viewer
 */
export default function LiveLocationPanel({ userId, name, person, viewer = "hr" }) {
  const { user } = useAuth();
  const { nameOf, entryOf } = useEmployeeDirectory();
  const plane = useMemo(() => locatePlane(viewer), [viewer]);
  const isSelf = !!user?.id && String(user.id) === String(userId);

  const { ctx } = useLocationChecks({ viewer, enabled: !isSelf });
  const allowed = canLocate({ ctx, viewer, isSelf });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // "This server doesn't have the history read" is different from "it broke":
  // the first is a quiet line, the second an error with a retry (§7).
  const [absent, setAbsent] = useState(false);
  const [asking, setAsking] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!plane || !userId || isSelf) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = unwrap(await plane.history(userId, { page: 1, limit: HISTORY_LIMIT }));
      setRows(Array.isArray(data?.requests) ? data.requests : []);
      setAbsent(false);
    } catch (err) {
      if (err?.status === 404 || err?.status === 501) { setAbsent(true); setRows([]); }
      else setError(err);
    } finally {
      setLoading(false);
    }
  }, [plane, userId, isSelf]);

  useEffect(() => { load(); }, [load]);

  if (isSelf || !plane) return null;
  // The organisation has it off, or this role may not use it. Nothing here is
  // worth a "coming soon" card on somebody's profile — it is simply absent.
  if (ctx && (ctx.absent || ctx.enabled === false) && rows.length === 0) return null;

  const newest = rows[0] || null;
  const newestFix = newest?.location || null;

  return (
    <>
      <DetailSection
        title="Live location"
        icon={HiLocationMarker}
        help={{ surface: SURFACE, field: "panel" }}
        action={allowed ? (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition"
          >
            <HiLocationMarker className="w-4 h-4" /> Ask for location
          </button>
        ) : null}
      >
        <p className="text-xs text-slate-500 leading-relaxed mb-4">
          Ask this person’s phone where it is while they’re on shift. They see a notice and the
          reason you give, every time.
        </p>

        {/* The most recent answer, if there is one — the question people open
            this tab for is "where were they last", not "list the requests". */}
        {newest && hasCoords(newestFix) && (
          <div className="mb-5 rounded-2xl border border-slate-200 overflow-hidden">
            <LocationPinMap
              latitude={newestFix.latitude}
              longitude={newestFix.longitude}
              accuracyMeters={newestFix.accuracy_meters}
              stale
              height="h-44"
              className="rounded-none border-0"
            />
            <div className="px-4 py-3 bg-slate-50/70 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700">
                  Last reported {sinceLabel(newestFix.captured_at || newest.responded_at)}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Accurate to {accuracyLabel(newestFix.accuracy_meters, "an unknown distance")} · {coordsLabel(newestFix)}
                </p>
              </div>
              {mapsLink(newestFix) && (
                <a
                  href={mapsLink(newestFix)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-purple-600 hover:text-purple-700 shrink-0"
                >
                  Open in Maps <HiExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-100 overflow-hidden">
          {error ? (
            <ErrorState error={error} onRetry={load} fallback="Couldn’t load who has asked for this person’s location." />
          ) : loading ? (
            <div className="p-5"><LoadingRows rows={3} /></div>
          ) : absent ? (
            <div className="px-5 py-8 text-center">
              <HiClock className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-400 mt-2">
                This server doesn’t keep a record of location requests yet.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={HiLocationMarker}
              title="Nobody has asked yet"
              message={allowed
                ? "When someone asks where this person is, every request shows up here with the reason they gave."
                : "Requests would show up here with the reason each person gave."}
            />
          ) : (
            /* The 560px floor must SCROLL, not be clipped: the card around it is
               `overflow-hidden` for its corners, and a table that only hides
               its last column reads as a missing column. */
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[560px]">
              <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 text-[11px] font-semibold uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3">Asked</th>
                  <th className="px-5 py-3">By</th>
                  <th className="px-5 py-3">Why</th>
                  <th className="px-5 py-3">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row, i) => {
                  const asker = row.requested_by;
                  // A bare user_id resolves through the one directory; an
                  // unloaded name reads "Loading…", never the id (§4).
                  const askerName = typeof asker === "string" && asker.includes("-")
                    ? nameOf(asker, "Loading…")
                    : asker || "Unknown user";
                  return (
                    <tr
                      key={row.id || row.request_id || i}
                      {...rowPreviewProps(() => setSelected(row), "Location request details")}
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{sinceLabel(row.created_at)}</span>
                        <span className="block text-[11px] text-slate-400">{fmtDateTime(row.created_at)}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium">{askerName}</td>
                      <td className="px-5 py-3.5 text-slate-500 max-w-[220px] truncate" title={row.reason || undefined}>
                        {displayValue(row.reason)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <LocateStatusBadge status={row.status || (row.fix_returned ? "reported" : "timed_out")} />
                          {row.spoof_flagged && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-rose-50 text-rose-700 border-rose-200">
                              <HiShieldExclamation className="w-3 h-3" /> {SPOOF_BADGE.label}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </DetailSection>

      {asking && (
        <LocateDialog
          userId={userId}
          name={name}
          person={person || entryOf?.(userId)}
          viewer={viewer}
          onClose={() => setAsking(false)}
          onFinished={load}
        />
      )}

      {selected && (
        <RequestInspector
          row={selected}
          subject={name}
          nameOf={nameOf}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/* ─── The record inspector (§3) ──────────────────────────────────────────── */

function RequestInspector({ row, subject, nameOf, onClose }) {
  const meta = statusMetaOf(row.status || (row.fix_returned ? "reported" : "timed_out"));
  const fix = row.location || null;
  const bounds = boundsMeta(fix);
  const asker = typeof row.requested_by === "string" && row.requested_by.includes("-")
    ? nameOf(row.requested_by, "Loading…")
    : row.requested_by || "Unknown user";

  return (
    <DetailDialog
      eyebrow="Live location check"
      title={subject}
      subtitle={`Asked ${fmtDateTime(row.created_at)}`}
      icon={HiLocationMarker}
      badge={<LocateStatusBadge status={row.status || (row.fix_returned ? "reported" : "timed_out")} />}
      onClose={onClose}
      footer={mapsLink(fix) ? (
        <a
          href={mapsLink(fix)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm"
        >
          Open in Maps <HiExternalLink className="w-4 h-4" />
        </a>
      ) : null}
    >
      <DetailSection title="The request" icon={HiUser} collapsible={false}>
        <DetailGrid
          cols={3}
          items={[
            { label: "Asked by", value: asker },
            { label: "Asked", value: fmtDateTime(row.created_at) },
            { label: "Answered", value: row.responded_at ? fmtDateTime(row.responded_at) : "N/A" },
          ]}
        />
        <DetailText label="Why they asked">{displayValue(row.reason)}</DetailText>
        <p className="text-xs text-slate-500 leading-relaxed mt-3">{meta.note}</p>
      </DetailSection>

      {hasCoords(fix) && (
        <DetailSection title="Where the device said it was" icon={HiLocationMarker} collapsible={false}>
          <LocationPinMap
            latitude={fix.latitude}
            longitude={fix.longitude}
            accuracyMeters={fix.accuracy_meters}
            height="h-52"
            className="mb-4"
          />
          <DetailGrid
            cols={3}
            items={[
              { label: "Position", value: coordsLabel(fix) },
              { label: "How precise", value: accuracyLabel(fix.accuracy_meters), help: { surface: SURFACE, field: "accuracy_meters" } },
              { label: "Measured", value: fmtDateTime(fix.captured_at) },
              ...(bounds ? [{ label: "Against work locations", value: bounds.label }] : []),
              ...(Number.isFinite(Number(fix.distance_meters))
                ? [{ label: "Nearest work location", value: distanceLabel(fix.distance_meters) }]
                : []),
            ]}
          />
        </DetailSection>
      )}

      {row.spoof_flagged && (
        <DetailSection title={SPOOF_BADGE.label} icon={HiShieldExclamation} collapsible={false}>
          <p className="text-sm text-rose-700 leading-relaxed">{SPOOF_BADGE.note}</p>
        </DetailSection>
      )}
    </DetailDialog>
  );
}
