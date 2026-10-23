// ─────────────────────────────────────────────────────────────────────────────
// LocateDialog — "ask this person where they are", end to end, in one dialog.
//
// ONE COMPONENT FOR HR AND THE MANAGER (CLAUDE.md §2). `viewer` picks the API
// plane and nothing else: same layout, same wording, same buttons in the same
// places. A manager promoted to HR must not have to relearn this.
//
// ─── WHY IT IS ONE DIALOG WITH THREE FACES, NOT THREE DIALOGS ──────────────
// Ask → wait → answer is one continuous act that takes about eight seconds. A
// second modal stacked on the first would make the person re-find the context
// they were already looking at, and a toast would throw the answer away. So the
// body swaps in place and the header stays put: who is being asked never moves.
//
//   ask     a short form. The reason box, and what will happen to them.
//   waiting the last-known pin, greyed, plus a live "asking their device" line.
//   done    the four terminal states, each said in full (`liveLocationMeta`).
//
// ─── THE RULES THIS SCREEN IS BUILT AROUND ────────────────────────────────
// · NOTHING IS "VERIFIED" — the label is "Reported". See liveLocationMeta's
//   header for why this is a legal point and not a style preference.
// · THE REASON IS ALWAYS REQUIRED HERE even though the API only requires it
//   under `require_reason`. A manager cannot read that flag (locatePlanes.js),
//   and the person being asked reads this sentence in their own history.
// · VALIDATE BEFORE CALLING (§11). The press does the checking; the button
//   stays live until the call is actually in flight. A dead button cannot tell
//   anyone that the reason is four characters short.
// · THE POLL IS THE ONLY WAY THE ANSWER ARRIVES. There is no SSE and no
//   WebSocket, and that is settled rather than pending (plan §B.9). Two
//   seconds, for `timeout_seconds`, and it STOPS on any non-`dispatched`
//   status — `failed` in particular is terminal on the very first response.
// · `status: "failed"` COMES BACK FROM THE **LOCATE** CALL, not from a poll.
//   Treating the locate's 200 as "now start polling" would spend 30 requests
//   discovering a verdict we were handed immediately.
// · A COOLDOWN (429) IS NOT A VALIDATION ERROR. The form was fine; the clock
//   is not. It keeps the typed reason and says how long to wait.
//
// ─── STACKING ─────────────────────────────────────────────────────────────
// This is a FORM first, so it is not a DetailDialog (§3 excludes forms). It
// sits at the same z-[140] band as DetailDialog so it can be opened from a
// record inspector without disappearing behind it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiLocationMarker, HiX, HiClock, HiCheckCircle, HiExclamation,
  HiShieldExclamation, HiExternalLink, HiRefresh, HiInformationCircle,
} from "react-icons/hi";
import GenderAvatar from "../components/GenderAvatar";
import FieldHelp from "../fieldHelp/FieldHelp";
import { TONE_CLASSES, TONE_DOT } from "./enums";
import { fmtDateTime } from "./dates";
import { unwrap } from "./normalize";
import { FieldError, InlineAlert, Spinner } from "./ui";
import LocationPinMap from "./LocationPinMap";
import { locatePlane, noteLocateRefusal } from "./locatePlanes";
import {
  DEFAULT_TIMEOUT_SECONDS, MAX_POLL_SECONDS, POLL_INTERVAL_MS, REASON_MAX,
  SPOOF_BADGE, accuracyConfidence, accuracyLabel, boundsMeta, coordsLabel,
  distanceLabel, hasCoords, isLivePoll, isStaleFix, mapsLink, reasonProblem,
  sinceLabel, statusMetaOf,
} from "./liveLocationMeta";
import {
  attendanceErrorMessage, isLocateCooldown, isLocationConsentPending,
  retryAfterSeconds,
} from "../utils/attendanceErrors";
import { focusFirstProblem } from "../utils/formGuard";

const SURFACE = "attendance.locate_employee";
const idFor = (key) => `locate-${key}`;

const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider";

function Pill({ tone = "slate", children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${TONE_CLASSES[tone] || TONE_CLASSES.slate}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone] || TONE_DOT.slate}`} />
      {children}
    </span>
  );
}

/** One fix, drawn the same way whether it is the live answer or a remembered one. */
function FixPanel({ fix, stale, heading, caption }) {
  const confidence = accuracyConfidence(fix?.accuracy_meters);
  const bounds = boundsMeta(fix);
  const link = mapsLink(fix);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{heading}</p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">{caption}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {confidence && <Pill tone={confidence.tone}>{confidence.label}</Pill>}
          {bounds && <Pill tone={bounds.tone}>{bounds.label}</Pill>}
        </div>
      </div>

      <LocationPinMap
        latitude={fix?.latitude}
        longitude={fix?.longitude}
        accuracyMeters={fix?.accuracy_meters}
        stale={stale}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Position</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5 tabular-nums">{coordsLabel(fix)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">How precise</p>
            <FieldHelp surface={SURFACE} field="accuracy_meters" />
          </div>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{accuracyLabel(fix?.accuracy_meters)}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Measured</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">
            {fmtDateTime(fix?.captured_at || fix?.recorded_at)}
          </p>
        </div>
        {Number.isFinite(Number(fix?.distance_meters)) && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nearest work location</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">{distanceLabel(fix.distance_meters)}</p>
          </div>
        )}
      </div>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700"
        >
          Open in Maps <HiExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.userId        who is being asked
 * @param {string} props.name          their name — never an id on screen (§4)
 * @param {object} [props.person]      directory row, for the avatar
 * @param {"hr"|"manager"} props.viewer
 * @param {Function} props.onClose
 * @param {Function} [props.onFinished] called once a request reaches a terminal
 *   state, so the panel behind can refresh its history without a reload
 */
export default function LocateDialog({ userId, name, person, viewer = "hr", onClose, onFinished }) {
  const plane = useMemo(() => locatePlane(viewer), [viewer]);

  const [phase, setPhase] = useState("ask");      // ask | waiting | done
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [consentPending, setConsentPending] = useState(false);
  const [cooldown, setCooldown] = useState(null);  // seconds still to wait

  const [requestId, setRequestId] = useState(null);
  const [lastKnown, setLastKnown] = useState(null);
  const [result, setResult] = useState(null);      // the poll payload
  const [secondsLeft, setSecondsLeft] = useState(null);

  // The poll's own kill switch. Held in a ref so the interval callback always
  // reads the live value rather than the one captured when it was scheduled.
  const pollingRef = useRef(false);
  const finishedRef = useRef(false);

  const problems = useMemo(() => {
    const out = {};
    const bad = reasonProblem(reason);
    if (bad) out.reason = bad;
    return out;
  }, [reason]);

  const finish = useCallback((payload) => {
    pollingRef.current = false;
    setResult(payload);
    setPhase("done");
    if (!finishedRef.current) {
      finishedRef.current = true;
      onFinished?.();
    }
  }, [onFinished]);

  // ── The poll ──────────────────────────────────────────────────────────────
  // Every ~2 s while the request is live, paused while the tab is hidden
  // (CLAUDE.md §7) and caught up the moment it comes back. Pausing cannot lose
  // the answer: the result is durable state on the server, not an event.
  useEffect(() => {
    if (phase !== "waiting" || !requestId || !plane) return undefined;
    pollingRef.current = true;
    let timer = null;
    const startedAt = Date.now();

    const tick = async () => {
      if (!pollingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      try {
        const data = unwrap(await plane.poll(requestId));
        if (!pollingRef.current) return;
        if (!isLivePoll(data?.status)) {
          finish(data);
          return;
        }
      } catch (err) {
        // A poll that fails is not an answer. One blip must not be reported as
        // "unreachable" — keep trying until the window closes, then let the
        // server's own `timed_out` stand.
        if (!pollingRef.current) return;
        if (err?.status === 404) {
          finish({ status: "timed_out" });
          return;
        }
      }
      const elapsed = (Date.now() - startedAt) / 1000;
      const ceiling = Math.min(secondsLeft ?? DEFAULT_TIMEOUT_SECONDS, MAX_POLL_SECONDS);
      // The window closed with nothing back. Ask once more rather than deciding
      // ourselves: the fix may have landed in the last second, and only the
      // server knows (`timed_out` is derived on read, never swept).
      if (elapsed > ceiling + POLL_INTERVAL_MS) {
        try {
          const data = unwrap(await plane.poll(requestId));
          finish(isLivePoll(data?.status) ? { ...data, status: "timed_out" } : data);
        } catch {
          finish({ status: "timed_out" });
        }
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      pollingRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, requestId, plane, secondsLeft, finish]);

  // The countdown beside the spinner. Purely cosmetic — the poll above owns the
  // real deadline — but a silent eight-second wait reads as a hang.
  useEffect(() => {
    if (phase !== "waiting" || secondsLeft == null) return undefined;
    const id = setInterval(() => setSecondsLeft((s) => (s == null || s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, secondsLeft]);

  // The cooldown ticks down so "try again in 4 min" doesn't go stale on screen.
  useEffect(() => {
    if (cooldown == null || cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((s) => (s == null || s <= 1 ? null : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const send = async () => {
    if (sending || !plane) return;
    setError("");
    setConsentPending(false);
    if (focusFirstProblem(problems, idFor)) { setAttempted(true); return; }

    setSending(true);
    try {
      const data = unwrap(await plane.locate(userId, { reason: reason.trim() }));
      setRequestId(data?.request_id || null);
      setLastKnown(data?.last_known_location || null);

      // `failed` is terminal on this very response — no device could be woken,
      // so there is nothing to poll for.
      if (data?.status === "failed" || !data?.request_id) {
        finish({ status: "failed" });
        return;
      }
      const ttl = Number(data?.timeout_seconds);
      setSecondsLeft(Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, MAX_POLL_SECONDS) : DEFAULT_TIMEOUT_SECONDS);
      setPhase("waiting");
    } catch (err) {
      // Three codes mean the organisation cannot do this at all; the gate
      // remembers them so nobody presses a doomed button twice.
      noteLocateRefusal(err);
      if (isLocateCooldown(err)) setCooldown(retryAfterSeconds(err) ?? 60);
      if (isLocationConsentPending(err)) setConsentPending(true);
      setError(attendanceErrorMessage(err, "We couldn’t ask for their location just now."));
    } finally {
      setSending(false);
    }
  };

  const askAgain = () => {
    pollingRef.current = false;
    finishedRef.current = false;
    setPhase("ask");
    setResult(null);
    setRequestId(null);
    setSecondsLeft(null);
    setError("");
    setAttempted(false);
  };

  const status = statusMetaOf(result?.status);
  const fix = result?.location || null;
  const flagged = result?.spoof_flagged === true;
  const lastKnownStale = isStaleFix(lastKnown);

  const cooldownLabel = cooldown == null ? null
    : cooldown >= 60 ? `${Math.ceil(cooldown / 60)} min` : `${cooldown}s`;

  return (
    <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={phase === "waiting" ? undefined : onClose} />

      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* The header never changes between the three faces: who is being asked
            is the one fact that must not move under the person's eyes. */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-4">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-purple-50 flex items-center justify-center shrink-0">
            <GenderAvatar person={person} name={name} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-purple-500 uppercase tracking-wider">Live location check</p>
            <h2 className="text-lg font-bold text-slate-900 truncate">{name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -m-2 text-slate-300 hover:text-slate-600 rounded-lg shrink-0"
            aria-label="Close"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {phase === "ask" && (
            <>
              {/* Said before they press, not after: this is a request that lands
                  on another person's phone, and they will read the reason. */}
              <div className="flex gap-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <HiInformationCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-900 leading-relaxed">
                  Their phone will show a notice, read its position once, and send it back. It only
                  works while they are clocked in, and they can see who asked and why.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <label htmlFor={idFor("reason")} className={LABEL}>Why you need this</label>
                  <FieldHelp surface={SURFACE} field="reason" />
                </div>
                <textarea
                  id={idFor("reason")}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={REASON_MAX + 50}
                  placeholder="e.g. Confirming arrival at the Andheri client site"
                  className={`w-full px-4 py-3 text-sm border rounded-xl bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none ${attempted && problems.reason ? "border-rose-300" : "border-slate-200"}`}
                />
                <div className="flex items-start justify-between gap-3 mt-1.5">
                  <div className="min-w-0">
                    {attempted && problems.reason
                      ? <FieldError message={problems.reason} id={idFor("reason")} />
                      : <p className="text-[11px] text-slate-400">They will read this in their own history, so write it for them.</p>}
                  </div>
                  <span className="text-[11px] text-slate-300 tabular-nums shrink-0">{reason.trim().length}/{REASON_MAX}</span>
                </div>
              </div>

              {error && (
                <InlineAlert tone={consentPending || cooldown != null ? "amber" : "rose"}>
                  <span className="block">{error}</span>
                  {cooldownLabel && <span className="block mt-1 font-bold">Try again in about {cooldownLabel}.</span>}
                </InlineAlert>
              )}
            </>
          )}

          {phase === "waiting" && (
            <>
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-fuchsia-50 border border-fuchsia-100">
                <Spinner className="w-5 h-5 text-fuchsia-500" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fuchsia-900">Asking their device…</p>
                  <p className="text-xs text-fuchsia-700 mt-0.5">
                    {secondsLeft > 0
                      ? `Usually a few seconds. We’ll keep trying for another ${secondsLeft}s.`
                      : "Still waiting for an answer."}
                  </p>
                </div>
              </div>

              {hasCoords(lastKnown) ? (
                <FixPanel
                  fix={lastKnown}
                  stale={lastKnownStale}
                  heading={lastKnownStale ? "Where they were last seen" : "Their most recent position"}
                  caption={`Reported ${sinceLabel(lastKnown.recorded_at)} — not the answer to this request`}
                />
              ) : (
                <div className="px-4 py-8 rounded-xl border border-dashed border-slate-200 text-center">
                  <HiLocationMarker className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-400 mt-2">
                    Nothing on file from before, so there is nothing to show until they answer.
                  </p>
                </div>
              )}
            </>
          )}

          {phase === "done" && (
            <>
              <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border ${TONE_CLASSES[status.tone]}`}>
                {result?.status === "reported"
                  ? <HiCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  : result?.status === "failed"
                    ? <HiExclamation className="w-5 h-5 shrink-0 mt-0.5" />
                    : <HiClock className="w-5 h-5 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="text-sm font-bold">{status.label}</p>
                  <p className="text-xs mt-0.5 leading-relaxed opacity-90">{status.note}</p>
                </div>
              </div>

              {flagged && (
                <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-rose-50 border border-rose-200">
                  <HiShieldExclamation className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-rose-800">{SPOOF_BADGE.label}</p>
                    <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">{SPOOF_BADGE.note}</p>
                  </div>
                </div>
              )}

              {hasCoords(fix) && (
                <FixPanel
                  fix={fix}
                  stale={false}
                  heading="Reported position"
                  caption={`Their device answered ${sinceLabel(fix.captured_at)}`}
                />
              )}

              {!hasCoords(fix) && hasCoords(lastKnown) && (
                <FixPanel
                  fix={lastKnown}
                  stale
                  heading="Where they were last seen"
                  caption={`Reported ${sinceLabel(lastKnown.recorded_at)} — this is history, not an answer`}
                />
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3">
          {phase === "ask" && (
            <>
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                /* Disabled only for what a press cannot fix: a call already in
                   flight, and a cooldown the clock has to clear (§11). */
                disabled={sending || cooldown != null}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition"
              >
                {sending ? <Spinner className="w-4 h-4" /> : <HiLocationMarker className="w-4 h-4" />}
                {sending ? "Asking…" : cooldownLabel ? `Wait ${cooldownLabel}` : "Ask for location"}
              </button>
            </>
          )}

          {phase === "waiting" && (
            <button
              type="button"
              onClick={() => { pollingRef.current = false; onClose(); }}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800"
            >
              Close and check later
            </button>
          )}

          {phase === "done" && (
            <>
              <button
                type="button"
                onClick={askAgain}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-purple-600 hover:bg-purple-50"
              >
                <HiRefresh className="w-4 h-4" /> Ask again
              </button>
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
