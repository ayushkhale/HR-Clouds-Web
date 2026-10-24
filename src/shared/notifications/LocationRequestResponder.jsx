// ─────────────────────────────────────────────────────────────────────────────
// LocationRequestResponder — how a browser answers "where are you right now".
//
// Until 2026-10-24 the answer was "it doesn't": the subject's page said
// answering happens on the phone, and every locate against a web-only employee
// came back `422 NO_ACTIVE_DEVICE` while HR were told, wrongly, that the person
// had to install the app. Registering this browser for push fixed the device
// half. This component is the other half — the bit that actually takes a fix
// and posts it.
//
// ─── WHY A DIALOG AND NOT A SILENT READ ────────────────────────────────────
// A service worker may not touch `navigator.geolocation`, so a focused
// document has to do it, and a focused document has a person in front of it.
// Taking their position without a word on screen would be the one thing this
// whole feature promises not to do. So: the request always appears, with the
// reason it exists, and sharing is a press. Letting it expire is a valid
// answer and costs them nothing — the request simply times out, exactly as
// the location notice says.
//
// ─── THE THREE WAYS A REQUEST ARRIVES ──────────────────────────────────────
//   1. Push, tab open   → sw.js broadcasts LOCATION_REQUEST → this dialog.
//   2. Desktop banner pressed, tab open → TRIGGER_LOCATION_SYNC. They have
//      already pressed "Share my location", so the dialog opens with the fix
//      already being taken rather than asking the same question twice.
//   3. Desktop banner pressed, no tab → the worker opens
//      /dashboard?sync_location=true&request_id=… and we read it from there.
//
// ─── CONTRACT TRAPS ────────────────────────────────────────────────────────
// · THE PAYLOAD IS snake_case. The web guide's sample sends `{requestId,
//   accuracy}`; the Joi schema behind the endpoint wants `request_id` and
//   `accuracy_meters` and refuses anything else. The implementation plan §B
//   and the mobile guide agree with each other against that sample, so the
//   sample is the thing that is wrong (§9).
// · `platform` IS AN enum OF 'android' | 'ios'. There is no 'web', and the
//   field is optional, so it is omitted rather than guessed into a 400.
// · `captured_at` IS THE HARDWARE FIX TIME, not `new Date()`. The server marks
//   a `stale_fix` when it falls outside the request window, and a browser that
//   served a cached position would otherwise look like a spoof.
// · `is_mock` IS SELF-REPORTED and a browser cannot know. `false` is the only
//   honest value here; the server's own corroboration is what actually counts.
// · THE WINDOW IS SHORT (60 s). A fix that arrives late is refused with
//   409 LOCATION_REQUEST_EXPIRED, which is "stop", not "retry".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiLocationMarker, HiCheckCircle, HiExclamationCircle, HiX } from "react-icons/hi";
import { attendanceAPI } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";
import { Spinner } from "../attendance/ui";

/** The browser's own refusals, in the words of someone who isn't a developer. */
const GEO_MESSAGES = {
  1: "Your browser is blocking this site from reading your location. Open its site settings — usually the padlock beside the address — and allow Location, then try again.",
  2: "Your device couldn’t work out where it is. Moving somewhere with a clearer signal usually fixes it.",
  3: "Working out where you are took too long. Try again.",
};

/** A browser fix, or a reason there isn't one. Never throws. */
function takeFix() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ error: "This browser can’t share a location." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ position }),
      (err) => resolve({ error: GEO_MESSAGES[err?.code] || "Couldn’t read your location." }),
      // `maximumAge: 0` matters: a cached fix carries an old `captured_at` and
      // the server reads that as a stale answer to a live question.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/** 0–100, when the browser will say. Optional everywhere, so failure is silent. */
async function batteryLevel() {
  try {
    const battery = await navigator.getBattery?.();
    if (!battery || typeof battery.level !== "number") return undefined;
    return Math.round(battery.level * 100);
  } catch {
    return undefined;
  }
}

const PENDING_LOC_KEY = "hrclouds_pending_location_sync";

function readPendingLocation() {
  try {
    const raw = sessionStorage.getItem(PENDING_LOC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePendingLocation(data) {
  try {
    if (data) sessionStorage.setItem(PENDING_LOC_KEY, JSON.stringify(data));
    else sessionStorage.removeItem(PENDING_LOC_KEY);
  } catch {
    /* Storage can be blocked. */
  }
}

export default function LocationRequestResponder() {
  const { isAuthenticated, role } = useAuth();
  const enabled = Boolean(isAuthenticated && role && role !== "guest");

  // `{ requestId, expiresAt }` — one at a time. A second request arriving
  // while one is open replaces it: they are both "where are you now", and the
  // newer one is the one still answerable.
  const [request, setRequest] = useState(null);
  const [phase, setPhase] = useState("asking"); // asking · sharing · shared · failed
  const [problem, setProblem] = useState("");
  const answeredRef = useRef(new Set());

  const open = useCallback((requestId, expiresAt, immediate) => {
    if (!requestId || answeredRef.current.has(requestId)) return;
    setRequest({ requestId, expiresAt: expiresAt || null });
    setPhase(immediate ? "sharing" : "asking");
    setProblem("");
  }, []);

  const share = useCallback(async (requestId) => {
    setPhase("sharing");
    setProblem("");
    const { position, error } = await takeFix();
    if (error) {
      setProblem(error);
      setPhase("failed");
      return;
    }
    try {
      await attendanceAPI.reportLivePing({
        request_id: requestId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        // The schema demands a positive number; a browser that reports no
        // accuracy at all would otherwise fail validation on our side of the
        // wire, which tells the person nothing useful.
        accuracy_meters: position.coords.accuracy > 0 ? position.coords.accuracy : 1,
        is_mock: false,
        captured_at: new Date(position.timestamp || Date.now()).toISOString(),
        battery_level: await batteryLevel(),
      });
      answeredRef.current.add(requestId);
      setPhase("shared");
    } catch (err) {
      setProblem(attendanceErrorMessage(err, "Couldn’t send your location. Try again."));
      setPhase("failed");
    }
  }, []);

  // Pressing the desktop banner is the consent, so that path shares at once.
  useEffect(() => {
    if (request && phase === "sharing" && !problem) share(request.requestId);
    // Deliberately keyed on the request, not on `phase`: a retry calls `share`
    // itself, and re-running here would fire a second fix alongside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.requestId]);

  // 1 & 2 — the worker speaks to an open tab.
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return undefined;
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === "LOCATION_REQUEST") open(data.requestId, data.expiresAt, false);
      if (data.type === "TRIGGER_LOCATION_SYNC") open(data.requestId, null, true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [enabled, open]);

  // 3 — a cold open. Park in sessionStorage immediately so it survives auth hydration
  // and redirects between /dashboard and /dashboard/{role}, then clean the URL so
  // refresh / bookmark cannot replay it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sync_location") === "true") {
      const requestId = params.get("request_id");
      if (requestId) {
        writePendingLocation({ requestId, at: Date.now() });
      }
      params.delete("sync_location");
      params.delete("request_id");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }

    if (!enabled) return;
    const pending = readPendingLocation();
    if (pending?.requestId) {
      const isFresh = Date.now() - (pending.at || 0) < 60_000;
      writePendingLocation(null);
      if (isFresh) {
        open(pending.requestId, null, true);
      }
    }
  }, [enabled, open]);

  // The window closes on its own; so does the dialog, rather than leaving a
  // button that can only ever return 409 LOCATION_REQUEST_EXPIRED.
  useEffect(() => {
    if (!request?.expiresAt || phase === "shared") return undefined;
    const ms = new Date(request.expiresAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return undefined;
    const timer = setTimeout(() => setRequest(null), Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [request?.expiresAt, phase]);

  if (!request) return null;
  const close = () => setRequest(null);

  const isUnretryable = Boolean(
    problem && (
      problem.toLowerCase().includes("expired")
      || problem.toLowerCase().includes("closed before an answer arrived")
      || problem.toLowerCase().includes("no longer available")
    ),
  );

  return (
    <div className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-request-title"
        className="w-full sm:max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-4">
            <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
              phase === "shared"
                ? "bg-purple-50 border-purple-100 text-purple-600"
                : phase === "failed"
                  ? "bg-rose-50 border-rose-100 text-rose-500"
                  : "bg-purple-50 border-purple-100 text-purple-600"
            }`}
            >
              {phase === "shared" ? <HiCheckCircle className="w-6 h-6" />
                : phase === "failed" ? <HiExclamationCircle className="w-6 h-6" />
                  : <HiLocationMarker className="w-6 h-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="location-request-title" className="text-base font-bold text-slate-800">
                {phase === "shared" ? "Location shared" : "Someone has asked where you are"}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mt-1.5">
                {phase === "shared"
                  ? "Your position has been sent. It is on your own location checks page, with who asked and why."
                  : "Your workplace has asked this device to confirm your location. Sharing sends one position, once — nothing keeps running afterwards."}
              </p>
              {phase !== "shared" && (
                <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                  You can let this pass. Nothing is sent unless you press the button, and the request closes on its own.
                </p>
              )}
              {problem && (
                <p className="text-xs text-rose-600 leading-relaxed mt-3" role="alert">{problem}</p>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              className="p-1.5 -mt-1 -mr-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition cursor-pointer shrink-0"
              aria-label="Close"
            >
              <HiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2">
          {phase === "shared" || (phase === "failed" && isUnretryable) ? (
            <button type="button" onClick={close} className={PRIMARY_BTN}>Done</button>
          ) : (
            <>
              <button type="button" onClick={close} disabled={phase === "sharing"} className={SECONDARY_BTN}>
                Not now
              </button>
              <button
                type="button"
                onClick={() => share(request.requestId)}
                disabled={phase === "sharing"}
                className={PRIMARY_BTN}
              >
                {phase === "sharing" ? <Spinner className="w-4 h-4" /> : <HiLocationMarker className="w-4 h-4" />}
                {phase === "sharing" ? "Sharing…" : phase === "failed" ? "Try again" : "Share my location"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
