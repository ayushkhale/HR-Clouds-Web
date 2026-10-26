// ─────────────────────────────────────────────────────────────────────────────
// attendance/PunchDetails.jsx — how a punch's location and photo are shown,
// wherever a punch appears (2026-10-22). One set of pieces for all three panels
// so the employee, manager and HR views of the same punch cannot drift (§2):
//
//   · LocationChip      — the geofence outcome as a compact, tone-coded chip
//   · PunchPhotoThumb    — a thumbnail that opens the photo, with placeholders
//                          for "not loaded", "expired" and "no photo" (§5)
//   · PunchPhotoViewer   — the enlarged photo. A SIBLING of DetailDialog, never
//                          a child (§3 stacking) — hosts own the open state and
//                          pass a punch through `onViewPhoto`
//   · PunchesSection     — the per-punch list on a daily log (one row per punch)
//   · TodayPunchStrip     — the self today card's first-in / last-out at a glance
//   · PunchInlineGlance  — a tiny thumb + location pin for a dense list row
//
// THE PHOTO URL IS A CREDENTIAL, NOT A LINK (§5). `photo_url` is a presigned GET
// that expires in five minutes. It is rendered straight off the punch prop and
// never stored, cached, logged or forwarded — a stale list re-fetches the day
// rather than retrying the image. The viewer opens only for a photo that is
// actually present; a lapsed one degrades to a placeholder that says so.
//
// Logic (the §4 outcome table, the photo-state machine, coordinate reading)
// lives in punchMeta.js; this file only renders it.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiBan, HiCamera, HiClock, HiExternalLink, HiFingerPrint, HiLocationMarker, HiPhotograph, HiX } from "react-icons/hi";
import { fmtDate, fmtTime } from "./dates";
import { PUNCH_TYPE_LABELS, humanize } from "./enums";
import { DetailSection } from "../components/DetailDialog";
import { coordsLabel, hasCoordinates, PUNCH_SOURCE_LABELS, punchesState, punchLocationView, punchPhotoState } from "./punchMeta";

/* ─── Location ────────────────────────────────────────────────────────────── */

const LOCATION_TONE = {
  ok: "bg-violet-50 text-violet-700 border-violet-200",
  warn: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

/**
 * One punch's geofence outcome as a chip. Renders nothing when there is nothing
 * to say. `view` is a `punchLocationView(location)` result; pass the raw
 * `location` object as a convenience and it is read here.
 */
export function LocationChip({ location, view, className = "", compact = false }) {
  const v = view || punchLocationView(location);
  if (!v) return null;
  const title = [v.label, v.detail, v.address].filter(Boolean).join(" · ");
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} ${LOCATION_TONE[v.tone] || LOCATION_TONE.neutral} ${className}`}
    >
      <HiLocationMarker className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="truncate max-w-[11rem]">{v.label}</span>
      {!compact && v.detail && <span className="font-normal opacity-80">· {v.detail}</span>}
    </span>
  );
}

/* ─── Photo thumbnail ─────────────────────────────────────────────────────── */

const THUMB_SIZE = { sm: "w-8 h-8", md: "w-11 h-11" };

/**
 * A punch photo as a thumbnail. Four outcomes (§5): a live photo is a button
 * that opens the viewer; a deferred or expired one is a placeholder that says
 * to re-open the day; a rejected one shows why on hover; no photo renders
 * nothing. The `<img>` itself can expire between load and click — `onError`
 * drops it back to the placeholder rather than showing a broken image.
 */
export function PunchPhotoThumb({ punch, truncated = false, size = "sm", onOpen, className = "" }) {
  const [broke, setBroke] = useState(false);
  const state = punchPhotoState(punch, { truncated });
  const box = `${THUMB_SIZE[size] || THUMB_SIZE.sm} rounded-lg border shrink-0 flex items-center justify-center overflow-hidden`;

  if (state.kind === "shown" && !broke) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen?.(punch); }}
        className={`${box} border-purple-200 bg-slate-50 hover:ring-2 hover:ring-purple-200 transition ${className}`}
        title="View the punch photo"
        aria-label="View the punch photo"
      >
        <img src={state.url} alt="" className="w-full h-full object-cover" onError={() => setBroke(true)} />
      </button>
    );
  }
  if (state.kind === "none") return null;

  const placeholder = {
    deferred: { icon: HiPhotograph, cls: "border-slate-200 bg-slate-50 text-slate-400", title: "Photo not loaded here — open the day to see it" },
    expired: { icon: HiPhotograph, cls: "border-slate-200 bg-slate-50 text-slate-400", title: "This photo’s link expired — open the day to refresh it" },
    rejected: { icon: HiBan, cls: "border-slate-200 bg-slate-50 text-slate-300", title: `Photo not kept${state.meta?.rejected_reason ? ` — ${humanize(state.meta.rejected_reason)}` : ""}` },
  }[broke ? "expired" : state.kind] || { icon: HiCamera, cls: "border-slate-200 bg-slate-50 text-slate-300", title: "No photo" };
  const Icon = placeholder.icon;
  return (
    <span className={`${box} ${placeholder.cls} ${className}`} title={placeholder.title} aria-label={placeholder.title}>
      <Icon className="w-4 h-4" aria-hidden="true" />
    </span>
  );
}

/* ─── Photo viewer (sibling of DetailDialog, §3) ──────────────────────────── */

/**
 * The enlarged punch photo and its capture metadata. Takes the punch directly —
 * the `photo_url` on it is the credential and is rendered, not kept. Styled like
 * AttachmentViewerDialog (which can't be reused: it re-signs a url by id, and a
 * punch photo is delivered pre-signed with no such endpoint). z-165, Escape
 * closes only this layer.
 */
export function PunchPhotoViewer({ punch, onClose }) {
  const [broke, setBroke] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const url = punch?.photo_url || "";
  const meta = punch?.punch_photo || null;
  const typeLabel = PUNCH_TYPE_LABELS[punch?.type] || humanize(punch?.type) || "Punch";
  const when = punch?.timestamp ? fmtTime(punch.timestamp) : "";

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current?.(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const captured = meta?.captured_at ? fmtDate(meta.captured_at, { day: "numeric", month: "short" }) + ` · ${fmtTime(meta.captured_at)}` : "";
  const metaLines = [
    meta?.address && ["Where", meta.address],
    captured && ["Taken", captured],
    meta?.location_stamped && ["", "Location stamped on the photo"],
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[165] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current?.()}>
      <div role="dialog" aria-modal="true" aria-label="Punch photo" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-purple-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800 truncate">{typeLabel}{when ? ` · ${when}` : ""}</h2>
            <p className="text-[11px] text-slate-400">Photo link expires in a few minutes</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && !broke && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition">
                <HiExternalLink className="w-4 h-4" /> Open
              </a>
            )}
            <button type="button" onClick={() => onCloseRef.current?.()} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition" aria-label="Close"><HiX className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-900/90 min-h-[260px] flex items-center justify-center p-3">
          {url && !broke ? (
            <img src={url} alt="Punch photo" className="max-w-full max-h-[62vh] object-contain rounded-lg" onError={() => setBroke(true)} />
          ) : (
            <div className="text-center px-6 py-10">
              <HiPhotograph className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-200">This photo’s link has expired.</p>
              <p className="text-xs text-slate-400 mt-1">Close and re-open the day to load a fresh one.</p>
            </div>
          )}
        </div>
        {metaLines.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {metaLines.map(([label, value], i) => (
              <p key={i} className="text-[11px] text-slate-500 flex items-start gap-1.5">
                {label && <span className="font-bold uppercase tracking-wide text-slate-400 shrink-0">{label}</span>}
                <span className="min-w-0">{value}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── The daily-log punch list ────────────────────────────────────────────── */

const punchSourceLine = (punch) => [
  PUNCH_SOURCE_LABELS[punch?.source] || (punch?.source ? humanize(punch.source) : null),
  punch?.work_mode && humanize(punch.work_mode),
  punch?.device_name && `Device: ${punch.device_name}`,
  !hasCoordinates(punch) && punch?.source === "web" ? "No location" : null,
].filter(Boolean).join(" · ");

/**
 * One row per punch, photo-forward: the thumbnail on the left, the punch and
 * where it came from in the middle, the geofence chip on the right. Reads the
 * same on the employee screen and on a manager/HR profile, which is the point
 * of sharing it. `onViewPhoto` opens the enlarged photo (owned by the host, §3).
 */
export function PunchesSection({ logs, truncated = false, onViewPhoto, icon = HiFingerPrint, title }) {
  const rows = (Array.isArray(logs) ? logs : [])
    .filter((e) => e && (e.timestamp || e.punch_time || e.created_at))
    .sort((a, b) => new Date(a.timestamp || a.punch_time || a.created_at) - new Date(b.timestamp || b.punch_time || b.created_at));
  if (rows.length === 0) return null;

  return (
    <DetailSection title={title || `Punches (${rows.length})`} icon={icon}>
      <ul className="divide-y divide-slate-100">
        {rows.map((entry, i) => {
          const view = punchLocationView(entry.location);
          const coords = coordsLabel(entry);
          const sourceLine = punchSourceLine(entry);
          return (
            <li key={entry.id || i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <PunchPhotoThumb punch={entry} truncated={truncated} size="md" onOpen={onViewPhoto} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700 text-sm">
                    {PUNCH_TYPE_LABELS[entry.type || entry.log_type] || humanize(entry.type || entry.log_type) || "Punch"}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">{fmtTime(entry.timestamp || entry.punch_time || entry.created_at)}</span>
                </div>
                {sourceLine && <p className="text-[11px] text-slate-400 mt-0.5">{sourceLine}</p>}
                {coords && <p className="text-[10px] text-slate-300 tabular-nums mt-0.5" title={`Latitude, longitude: ${coords}`}>{coords}</p>}
                {entry.notes && <p className="text-[11px] text-slate-500 mt-1 italic">“{entry.notes}”</p>}
              </div>
              {view && <div className="shrink-0 pt-0.5"><LocationChip view={view} /></div>}
            </li>
          );
        })}
      </ul>
    </DetailSection>
  );
}

/* ─── The self today card's punches ───────────────────────────────────────── */

/**
 * Today's first clock-in and last clock-out, with photo and location, read off
 * `/today`'s `punches`. Unlike the card's live geofence note (which belongs to
 * the last punch of this browser session), this survives a reload because it
 * comes from the server. Renders nothing until there is a punch to show.
 */
export function TodayPunchStrip({ punches, onViewPhoto }) {
  const { state, in: clockIn, out: clockOut } = punchesState({ punches });
  if (state !== "loaded" || (!clockIn && !clockOut)) return null;
  const cells = [
    clockIn && { key: "in", label: "Clocked in", punch: clockIn },
    clockOut && { key: "out", label: "Clocked out", punch: clockOut },
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold text-purple-700 uppercase tracking-wider">
        <HiCamera className="w-3.5 h-3.5 text-purple-600 shrink-0" aria-hidden="true" /> Today’s Punch Activity
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cells.map(({ key, label, punch }) => {
          const view = punchLocationView(punch.location);
          const hasPhoto = punchPhotoState(punch).kind !== "none";
          return (
            <div key={key} className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-purple-100/80 shadow-2xs min-w-0">
              {hasPhoto ? (
                <PunchPhotoThumb punch={punch} size="sm" onOpen={onViewPhoto} />
              ) : (
                <span className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <HiClock className="w-4 h-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-700 truncate">
                  {label} · <span className="tabular-nums font-semibold text-purple-700">{fmtTime(punch.timestamp)}</span>
                </p>
                {view && <div className="mt-0.5"><LocationChip view={view} compact /></div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── A dense list row's glance ───────────────────────────────────────────── */

/**
 * A punch at list density: a small thumbnail and, if the geofence was actually
 * checked and the punch landed away from the location, a fuchsia pin. Built for
 * a table cell or a roster card, where a full chip would not fit. A punch whose
 * data was deferred for size renders a muted placeholder that `onOpenDay` can
 * turn into "open the day". Renders nothing when there is nothing to show.
 */
export function PunchInlineGlance({ punch, truncated = false, onViewPhoto, className = "" }) {
  if (!punch) return null;
  const view = punchLocationView(punch.location);
  const photo = punchPhotoState(punch, { truncated });
  const showPin = view && view.checked && view.tone === "warn";
  if (photo.kind === "none" && !showPin) return null;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      <PunchPhotoThumb punch={punch} truncated={truncated} size="sm" onOpen={onViewPhoto} />
      {showPin && <HiLocationMarker className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" title={[view.label, view.detail].filter(Boolean).join(" · ")} aria-label={view.label} />}
    </span>
  );
}
