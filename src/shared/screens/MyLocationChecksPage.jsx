// ─────────────────────────────────────────────────────────────────────────────
// MyLocationChecksPage — the page the SUBJECT of a location check owns: what
// the rules are, accepting the notice once, and the full list of who has asked
// where they are and why.
//
// Mounted in all three workspaces under each one's own prefix
// (`SELF_SERVICE_PAGES.locationChecks`), for the usual reason: an HR admin can
// be located by another HR admin, and a manager by HR, so nobody is sent into
// the employee workspace to read their own record (§2).
//
// ─── WHY THIS PAGE MATTERS MORE THAN IT LOOKS ──────────────────────────────
// Everything else in this feature is built for the person doing the asking.
// This is the only surface built for the person being asked, and the whole
// arrangement is only defensible because it exists: the notice is readable
// before anything happens, and every request is listed afterwards with the
// reason attached to it. Do not quietly drop a column here to tidy it up.
//
// ─── CONTRACT TRAPS ────────────────────────────────────────────────────────
// · THERE IS NO READ FOR CONSENT. `POST /attendance/locations/consent` exists;
//   nothing tells us whether this person has already accepted, or whether
//   their organisation even asks them to. So the card never claims either way
//   — it offers the button and says that accepting twice changes nothing. The
//   POST is an upsert, so that is true. If a GET ever lands, show the settled
//   state and delete the caveat (§7: say "we can't tell", never guess).
// · THE ANTI-SPOOF VERDICT IS WITHHELD from this endpoint on purpose, so the
//   subject never sees `spoof_flagged` and this page must never render one.
//   Do not "fix" its absence by reading it from somewhere else.
// · THE POSITION ITSELF IS NOT RETURNED HERE either — only `fix_returned`,
//   whether the device answered. The inspector therefore has no map, and says
//   so in its footer rather than leaving an empty hole (§5).
// · ANSWERING HAPPENS ON THE PHONE. The request is delivered by push to a
//   registered mobile device; this browser is not one, and registering it
//   would need push credentials this app does not ship. So the page explains
//   where the answering happens instead of offering a control that cannot
//   work (§2 — absent, not broken).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiLocationMarker, HiShieldCheck, HiRefresh, HiCheckCircle, HiDeviceMobile,
  HiUser, HiClock,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailSection, DetailText, displayValue, rowPreviewProps,
} from "../components/DetailDialog";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { attendanceAPI } from "../api";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import { fmtDateTime } from "../attendance/dates";
import { normalizePaginated } from "../attendance/normalize";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import {
  EmptyState, ErrorState, InlineAlert, LoadingRows, Pagination, Spinner, Toast, useToast,
} from "../attendance/ui";
import { LOCATION_NOTICE, sinceLabel } from "../attendance/liveLocationMeta";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";

const SURFACE = "attendance.my_location_checks";
const PAGE_SIZE = 10;

/** Who asked, as a job rather than a role name — nobody reads "hr" as a word. */
const ASKER_ROLE = {
  hr: "HR",
  manager: "Your manager",
  admin: "HR",
  super_admin: "HR",
};

/**
 * What happened to a request, from the subject's side. They are not told
 * whether the check passed — only whether their device answered, which is the
 * part they can actually act on ("my phone was off", "I had no signal").
 */
function outcomeOf(row) {
  if (row.fix_returned) return { label: "Your phone answered", tone: "emerald" };
  if (row.responded_at) return { label: "Your phone answered", tone: "emerald" };
  return { label: "Your phone didn’t answer", tone: "slate" };
}

function OutcomePill({ outcome }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[outcome.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[outcome.tone]}`} aria-hidden="true" />
      {outcome.label}
    </span>
  );
}

export default function MyLocationChecksPage() {
  const { nameOf } = useEmployeeDirectory();
  const [state, setState] = useState({ rows: [], total: 0, totalPages: 1, loading: true, error: null });
  const [page, setPage] = useState(1);
  // 404/501 here means this server predates the feature. Nothing has ever
  // happened to this person, so the page says so once instead of retrying.
  const [absent, setAbsent] = useState(false);
  const [selected, setSelected] = useState(null);

  const [accepting, setAccepting] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState(null);
  const [acceptError, setAcceptError] = useState("");
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = { page, limit: PAGE_SIZE };
      const res = await attendanceAPI.getMyLocationRequests(params);
      const { items, total, totalPages } = normalizePaginated(res, ["records", "requests"], params);
      setState({ rows: items, total, totalPages, loading: false, error: null });
      setAbsent(false);
    } catch (error) {
      if (error?.status === 404 || error?.status === 501 || error?.status === 503) {
        setState({ rows: [], total: 0, totalPages: 1, loading: false, error: null });
        setAbsent(true);
      } else {
        setState({ rows: [], total: 0, totalPages: 1, loading: false, error });
      }
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function accept() {
    if (accepting) return;
    setAcceptError("");
    setAccepting(true);
    try {
      const res = await attendanceAPI.acknowledgeLocationNotice({ version: LOCATION_NOTICE.consentVersion });
      setAcceptedAt(res?.data?.acknowledged_at || new Date().toISOString());
      showToast("Thanks — your acceptance has been recorded.");
    } catch (err) {
      setAcceptError(attendanceErrorMessage(err, "Couldn’t record your acceptance. Try again in a moment."));
    } finally {
      setAccepting(false);
    }
  }

  const { rows, total, totalPages, loading, error } = state;
  const firstLoad = loading && rows.length === 0;

  return (
    <>
      <DashboardTopBar title="My Location Checks" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="My Location Checks" help={{ surface: SURFACE, field: "page", label: "this page" }} />
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Everyone who has asked where you are, when they asked and the reason they gave. Nothing happens
              without a record on this page.
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} className={SECONDARY_BTN}>
            <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* The rules, before anything else on the page — this is the part the
            person is entitled to read whether or not they ever get asked. */}
        <section className="rounded-3xl border border-purple-100 shadow-xs bg-gradient-to-br from-purple-50/80 via-white to-white px-5 sm:px-6 py-5">
          <div className="flex items-start gap-4 min-w-0">
            <span className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0 shadow-xs">
              <HiShieldCheck className="w-6 h-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-800">{LOCATION_NOTICE.title}</h2>
                <FieldHelp surface={SURFACE} field="consent" label="accepting this notice" size="sm" />
              </div>
              <ul className="mt-3 space-y-2">
                {LOCATION_NOTICE.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                    <HiCheckCircle className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              {acceptError && <div className="mt-4"><InlineAlert tone="rose">{acceptError}</InlineAlert></div>}

              <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
                {acceptedAt ? (
                  <p className="inline-flex items-center gap-2 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-xl px-3.5 py-2.5">
                    <HiCheckCircle className="w-4 h-4" /> Accepted {fmtDateTime(acceptedAt)}
                  </p>
                ) : (
                  <button type="button" onClick={accept} disabled={accepting} className={PRIMARY_BTN}>
                    {accepting ? <Spinner className="w-4 h-4" /> : <HiCheckCircle className="w-4 h-4" />}
                    {accepting ? "Recording…" : "I’ve read and accept this"}
                  </button>
                )}
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-md">
                  Some organisations ask you to accept this before anyone can be given your location. If you
                  already have, pressing it again changes nothing.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Where the answering actually happens. Said plainly, because the
            obvious guess — that this browser answers — is wrong. */}
        <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200">
          <HiDeviceMobile className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Requests go to the HR Clouds app on your phone, not to this browser. Your phone shows you the
            request and sends one position back — there is nothing to switch on here, and closing this page
            changes nothing.
          </p>
        </div>

        {error && <ErrorState error={error} onRetry={load} fallback="Couldn’t load your location checks." />}

        <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <HiLocationMarker className="w-4 h-4 text-purple-600 shrink-0" />
            <h3 className="text-base font-bold text-slate-800">Who has asked</h3>
            {total > 0 && (
              <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5">
                {total}
              </span>
            )}
          </div>

          {firstLoad ? (
            <div className="p-6"><LoadingRows rows={4} /></div>
          ) : absent ? (
            <EmptyState
              icon={HiShieldCheck}
              title="Location checks aren’t switched on here"
              message="Nobody can ask where you are, and nothing has been recorded against you."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={HiLocationMarker}
              title="Nobody has asked where you are"
              message="If someone ever does, the request will appear here with their name and the reason they gave."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[620px]">
                  <caption className="sr-only">Everyone who has asked for your location. Open a row for the full request.</caption>
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-6 py-3.5">When</th>
                      <th className="px-6 py-3.5">Who asked</th>
                      <th className="px-6 py-3.5">Why</th>
                      <th className="px-6 py-3.5">
                        <HelpLabel text="What happened" help={{ surface: SURFACE, field: "fix_returned", size: "sm", label: "what happened to the request" }} />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rows.map((row, i) => {
                      // A bare user_id resolves through the one directory; an
                      // unloaded name reads "Loading…", never the id (§4).
                      const asker = row.requested_by;
                      const askerName = typeof asker === "string" && asker.includes("-")
                        ? nameOf(asker, "Loading…")
                        : asker || "Unknown user";
                      return (
                        <tr
                          key={row.id || row.request_id || i}
                          {...rowPreviewProps(() => setSelected(row), "Location request details")}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-semibold text-slate-800">{sinceLabel(row.created_at)}</span>
                            <span className="block text-[11px] text-slate-400">{fmtDateTime(row.created_at)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-800 block truncate">{askerName}</span>
                            <span className="block text-[11px] text-slate-400">
                              {ASKER_ROLE[row.requester_role] || "A colleague"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 max-w-[260px] truncate" title={row.reason || undefined}>
                            {displayValue(row.reason)}
                          </td>
                          <td className="px-6 py-4">
                            <OutcomePill outcome={outcomeOf(row)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={PAGE_SIZE}
                onPageChange={setPage}
                disabled={loading}
                noun="request"
                className="px-5 sm:px-6 py-4 border-t border-slate-100"
              />
            </>
          )}
        </div>
      </main>

      {selected && (
        <MyRequestInspector
          row={selected}
          nameOf={nameOf}
          onClose={() => setSelected(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

/* ─── The record inspector (§3) ──────────────────────────────────────────── */

function MyRequestInspector({ row, nameOf, onClose }) {
  const asker = typeof row.requested_by === "string" && row.requested_by.includes("-")
    ? nameOf(row.requested_by, "Loading…")
    : row.requested_by || "Unknown user";
  const outcome = outcomeOf(row);

  return (
    <DetailDialog
      eyebrow="Someone asked where you were"
      title={asker}
      subtitle={fmtDateTime(row.created_at)}
      icon={HiUser}
      width="medium"
      badge={<OutcomePill outcome={outcome} />}
      onClose={onClose}
      footer={
        <DetailFooterNote>
          There’s nothing to approve or undo here — this is the record of what happened. The position your
          phone sent isn’t shown back to you; it goes to the person who asked, and is deleted after your
          organisation’s retention period.
        </DetailFooterNote>
      }
    >
      <DetailSection title="The request" icon={HiClock} collapsible={false}>
        <DetailGrid
          cols={2}
          items={[
            { label: "Who asked", value: asker },
            { label: "Their role", value: ASKER_ROLE[row.requester_role] || "A colleague" },
            { label: "Asked", value: fmtDateTime(row.created_at) },
            { label: "Your phone answered", value: row.responded_at ? fmtDateTime(row.responded_at) : "It didn’t" },
          ]}
        />
        <DetailText label="The reason they gave">{displayValue(row.reason)}</DetailText>
      </DetailSection>
    </DetailDialog>
  );
}
