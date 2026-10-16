// ─────────────────────────────────────────────────────────────────────────────
// RegisterDeviceDialog — registers THIS computer or phone as a device the
// person may clock in from. A form dialog, not a record inspector, so it
// follows the form rules (CLAUDE.md §3, §11) rather than DetailDialog.
//
// THE ORDER OF THE TWO STEPS IS THE WHOLE DESIGN. `registration/start` does two
// things in one call: it emails or texts a one-time code AND returns the
// options for the device check. Those have independent clocks — the device
// check dies in about three minutes, the code lives for several. So the device
// check runs IMMEDIATELY, and the code is typed afterwards, while the signed
// result waits in component state. Asking for the code first kills the check
// for everybody who has to go and find their email, which is everybody.
//
// Consequences the screen has to own:
//  · A wrong or late code also consumes the device check, so there is no
//    "try the code again" — it restarts from the top, including a second
//    fingerprint prompt. The copy says so, or people type the code again and
//    wonder why nothing happens.
//  · A browser that makes a SYNCED passkey (iCloud Keychain, Google Password
//    Manager) is refused by the server, because a key that copies itself to
//    every device can't prove which device punched. That is nobody's fault and
//    gets its own panel with the fix for each platform, not a red toast.
//  · At the device cap, registering means replacing — and the device being
//    replaced is shut off for good.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import {
  HiCheck, HiCheckCircle, HiClock, HiDeviceMobile, HiExclamationCircle, HiFingerPrint, HiX,
} from "react-icons/hi";
// The same six-digit code input the sign-in screens use — this is the same kind
// of code, sent the same way, so it should look and behave identically.
import OtpInput from "../../auth/components/OtpInput";
import { DANGER_BTN, FIELD, FIELD_INVALID, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";
import FieldHelp from "../fieldHelp/FieldHelp";
import { focusFirstProblem } from "../utils/formGuard";
import {
  attendanceErrorMessage, isDeviceLimitReached, isSyncedPasskey,
} from "../utils/attendanceErrors";
import { beginDeviceRegistration, completeDeviceRegistration } from "./deviceTrust";
import { DEVICE_NAME_MAX, SYNCED_PASSKEY_HELP, platformLabel, suggestDeviceName } from "./deviceTrustMeta";
import { abortCeremony, hasPlatformAuthenticator } from "./webauthn";
import { fmtTime } from "./dates";
import { InlineAlert, Spinner } from "./ui";

const SURFACE = "attendance.device_registration";
const idFor = (key) => `device-reg-${key}`;

/**
 * The two steps, drawn. Registering is the one attendance task with a prompt
 * from OUTSIDE the browser in the middle of it, and people stop in the middle
 * of those: the strip says how much is left and that the fingerprint prompt
 * wasn't the end of it. `synced` is a dead end, not a step, so it has no strip.
 */
function StepStrip({ step, lastLabel }) {
  const steps = [
    { key: "details", label: "This device" },
    { key: "code", label: "Code" },
    { key: "done", label: lastLabel },
  ];
  const current = step === "code" ? 1 : 0;
  return (
    <ol className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/60">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s.key} className="flex items-center gap-2 min-w-0" aria-current={now ? "step" : undefined}>
            <span className={`w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center shrink-0 ${done ? "bg-purple-600 border-purple-600 text-white" : now ? "bg-white border-purple-400 text-purple-600" : "bg-white border-slate-200 text-slate-400"}`}>
              {done ? <HiCheck className="w-3 h-3" /> : i + 1}
            </span>
            <span className={`text-[11px] font-bold truncate ${now ? "text-purple-700" : done ? "text-slate-600" : "text-slate-400"}`}>{s.label}</span>
            {i < steps.length - 1 && <span className={`h-px w-4 sm:w-8 shrink-0 ${done ? "bg-purple-300" : "bg-slate-200"}`} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

const secondsUntil = (iso) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round((ms - Date.now()) / 1000)) : null;
};

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Seconds left on the code, ticking. `null` when the server didn't say.
 *
 * Worth a timer because this clock is the one thing the person can't see and
 * can't recover from cheaply: a late code consumes the device check too, so
 * the attempt restarts at the fingerprint prompt (see the header). It never
 * takes the button away — pressing it is how anyone finds out, and the press
 * does the checking (§11).
 */
function useSecondsLeft(iso) {
  const [left, setLeft] = useState(() => secondsUntil(iso));
  useEffect(() => {
    setLeft(secondsUntil(iso));
    if (!iso) return undefined;
    const id = setInterval(() => setLeft(secondsUntil(iso)), 1000);
    return () => clearInterval(id);
  }, [iso]);
  return left;
}

/**
 * @param {object} props
 * @param {object|null} props.ctx          device-trust context (cap, approval mode)
 * @param {Array} props.devices            the person's own devices, for the replace picker
 * @param {(device: object) => void} props.onRegistered
 * @param {() => void} props.onClose
 */
export default function RegisterDeviceDialog({ ctx, devices = [], onRegistered, onClose }) {
  const [step, setStep] = useState("details"); // details | code | synced
  const [name, setName] = useState(suggestDeviceName);
  const [replaceId, setReplaceId] = useState("");
  const [otp, setOtp] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(null);      // "start" | "finish"
  const [error, setError] = useState("");
  const [noAuthenticator, setNoAuthenticator] = useState(false);
  // Where the code went and when it dies. A STATE copy of two fields from the
  // ref below, because the countdown has to re-render on its own clock and a
  // ref read during render wouldn't.
  const [sent, setSent] = useState(null);
  // The signed result and the request it belongs to. Component state for the
  // seconds between the device check and the code — never stored anywhere else.
  const started = useRef(null);

  const max = Number(ctx?.max_active_devices) || 0;
  const active = (devices || []).filter((d) => d.status === "active");
  // The server decides this; the count from the context is the same number it
  // used. `mustReplace` is only true when there is something to replace.
  const mustReplace = max > 0 && active.length >= max;
  const waitsForHr = ctx?.registration_approval === "hr_approval";

  useEffect(() => {
    // A prompt left open by a closing dialog breaks the NEXT ceremony.
    return abortCeremony;
  }, []);

  useEffect(() => {
    let alive = true;
    // Only a warning: a security key still works where there is no built-in
    // screen lock, so this never takes the button away.
    hasPlatformAuthenticator().then((ok) => { if (alive) setNoAuthenticator(!ok); });
    return () => { alive = false; };
  }, []);

  // §11: build the problems map the screen needs anyway, and check it on press.
  const detailProblems = () => {
    const problems = {};
    if (!name.trim()) problems.device_name = "Give this device a name you’ll recognise later.";
    if (mustReplace && !replaceId) problems.replace_device_id = "Choose which device this one takes over from.";
    return problems;
  };

  const shown = (key, problems) => (attempted && problems[key]) || "";

  const start = async () => {
    if (busy) return;
    const problems = detailProblems();
    if (focusFirstProblem(problems, idFor)) { setAttempted(true); return; }
    setError("");
    setBusy("start");
    try {
      started.current = await beginDeviceRegistration({
        deviceName: name.trim(),
        replaceDeviceId: mustReplace ? replaceId : null,
      });
      setSent({
        to: started.current?.start?.otp_sent_to || "",
        expiresAt: started.current?.start?.otp_expires_at || "",
      });
      setStep("code");
    } catch (err) {
      started.current = null;
      if (err?.silent) return;                       // they closed the prompt
      if (isSyncedPasskey(err)) { setStep("synced"); return; }
      if (isDeviceLimitReached(err)) {
        setError(mustReplace
          ? "You’re already at the number of devices your organisation allows. Pick the one this device takes over from."
          : "You’re already at the number of devices your organisation allows. Close this and refresh your devices, then pick the one this device takes over from.");
        return;
      }
      setError(attendanceErrorMessage(err, "Couldn’t start registering this device."));
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    if (busy || !started.current) return;
    const problems = otp.length === 6 ? {} : { otp: "Enter the six-digit code we sent you." };
    if (focusFirstProblem(problems, idFor)) { setAttempted(true); return; }
    setError("");
    setBusy("finish");
    try {
      const device = await completeDeviceRegistration({
        ...started.current,
        otp,
        deviceName: name.trim(),
        replaceDeviceId: mustReplace ? replaceId : null,
      });
      started.current = null;
      onRegistered(device);
    } catch (err) {
      if (isSyncedPasskey(err)) { setStep("synced"); return; }
      // Everything else here — wrong code, expired code, expired check — means
      // the device check is gone too, so there is nothing to retry with.
      started.current = null;
      setSent(null);
      setOtp("");
      setAttempted(false);
      setStep("details");
      setError(attendanceErrorMessage(err, "Couldn’t finish registering this device."));
    } finally {
      setBusy(null);
    }
  };

  const retrySynced = () => {
    started.current = null;
    setSent(null);
    setOtp("");
    setError("");
    setAttempted(false);
    setStep("details");
  };

  const problems = step === "code" ? (otp.length === 6 ? {} : { otp: "Enter the six-digit code we sent you." }) : detailProblems();
  // The panel in the body already says what the device is asking for, so the
  // button says what IT is doing rather than repeating the instruction.
  const busyLabel = busy === "start" ? "Waiting for your device…" : "Registering…";
  const secondsLeft = useSecondsLeft(step === "code" ? sent?.expiresAt || "" : "");
  const expired = secondsLeft === 0;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Register this device"
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Attendance devices</p>
            <h2 className="text-lg font-bold text-slate-800 mt-0.5">Register this device</h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              {step === "code"
                ? "Almost done — just the code now."
                : step === "synced"
                  ? "This one needs a different kind of screen lock."
                  : "You’ll confirm with this device’s screen lock or fingerprint, then with a code we send you."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {step !== "synced" && (
          <StepStrip step={step} lastLabel={waitsForHr ? "HR approves" : "Ready to use"} />
        )}

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}

          {step === "details" && (
            <>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className={mustReplace ? "" : "sm:col-span-2"}>
                  <label htmlFor={idFor("device_name")} className={LABEL}>Name this device</label>
                  <input
                    id={idFor("device_name")}
                    value={name}
                    maxLength={DEVICE_NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!!busy}
                    placeholder="Work laptop"
                    aria-invalid={!!shown("device_name", problems)}
                    className={`${FIELD} ${shown("device_name", problems) ? FIELD_INVALID : ""}`}
                  />
                  <p className={`text-[11px] mt-1.5 ${shown("device_name", problems) ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                    {shown("device_name", problems) || "Only you and HR see this. It’s how you’ll tell your devices apart."}
                  </p>
                </div>

                {mustReplace && (
                  <div>
                    <div className="flex items-center">
                      <label htmlFor={idFor("replace_device_id")} className={`${LABEL} mb-0`}>Takes over from</label>
                      <FieldHelp surface={SURFACE} field="replace_device_id" label="replacing a device" size="sm" className="ml-1 mb-2" />
                    </div>
                    <select
                      id={idFor("replace_device_id")}
                      value={replaceId}
                      onChange={(e) => setReplaceId(e.target.value)}
                      disabled={!!busy}
                      aria-invalid={!!shown("replace_device_id", problems)}
                      className={`${FIELD} ${shown("replace_device_id", problems) ? FIELD_INVALID : ""}`}
                    >
                      <option value="">Choose a device…</option>
                      {active.map((d) => (
                        <option key={d.id} value={d.id}>{d.device_name} · {platformLabel(d.platform)}</option>
                      ))}
                    </select>
                    <p className={`text-[11px] mt-1.5 ${shown("replace_device_id", problems) ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                      {shown("replace_device_id", problems) || "That device is shut off for good when this one is registered."}
                    </p>
                  </div>
                )}
              </div>

              {/* The prompt comes from the operating system and can open
                  BEHIND this window, where an unexplained spinner reads as a
                  hung dialog and gets the press repeated. While the ceremony
                  is running the screen says what to look for instead. */}
              {busy === "start" ? (
                <div className="rounded-2xl border border-purple-200 bg-purple-50/60 px-4 py-4 flex items-start gap-3" role="status">
                  <span className="w-10 h-10 rounded-2xl bg-white border border-purple-200 text-purple-600 flex items-center justify-center shrink-0">
                    <HiFingerPrint className="w-5 h-5 animate-pulse" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">Confirm it’s you on this device</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Your device is asking for your fingerprint, face or PIN. Look for its prompt — it can open behind this window. Closing the prompt brings you straight back here, with nothing registered.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {noAuthenticator && (
                    <InlineAlert tone="amber">
                      This device doesn’t seem to have a fingerprint reader or screen lock we can use. You can still try — a security key works too — or register from your phone instead.
                    </InlineAlert>
                  )}

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">What happens next</p>
                    <ol className="text-xs font-semibold text-slate-600 space-y-1 list-decimal list-inside">
                      <li>Your device asks you to confirm it’s you — fingerprint, face or PIN.</li>
                      <li>We send a code to your verified email or phone, and you type it here.</li>
                      <li>{waitsForHr ? "HR checks the device before it can be used to clock in." : "You can clock in from this device straight away."}</li>
                    </ol>
                  </div>
                </>
              )}
            </>
          )}

          {step === "code" && (
            <>
              {expired ? (
                <InlineAlert tone="amber">
                  That code has run out. Press “Start again” — we’ll send a new one and ask you to confirm on your device once more.
                </InlineAlert>
              ) : (
                <InlineAlert tone="emerald">
                  Your device is confirmed. We’ve sent a code to <span className="font-bold">{sent?.to || "your verified email or phone"}</span>.
                </InlineAlert>
              )}
              <div id={idFor("otp")}>
                <span className={LABEL}>Enter the code</span>
                <OtpInput value={otp} onChange={setOtp} disabled={!!busy} />
                {/* The clock, because a late code costs a second fingerprint
                    prompt — not just a retype. */}
                {secondsLeft !== null && !expired && (
                  <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 mt-3">
                    <HiClock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    Expires in <span className="tabular-nums text-slate-800">{mmss(secondsLeft)}</span>
                    <span className="font-medium text-slate-400">· by {fmtTime(sent?.expiresAt)}</span>
                  </p>
                )}
                <p className={`text-[11px] mt-3 text-center ${shown("otp", problems) ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                  {shown("otp", problems) || "If the code doesn’t arrive, start again — we’ll send a new one."}
                </p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                A wrong or expired code ends this attempt, so you’ll be asked to confirm on your device once more. Nothing is registered until the code matches.
              </p>
            </>
          )}

          {step === "synced" && (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                {/* Fuchsia, not rose: the browser chose a synced passkey and
                    nothing the person did was wrong — rose would read as a
                    failure they caused (§5). */}
                <span className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center shrink-0">
                  <HiExclamationCircle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{SYNCED_PASSKEY_HELP.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{SYNCED_PASSKEY_HELP.body}</p>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs font-semibold text-slate-600">
                {SYNCED_PASSKEY_HELP.steps.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <HiCheckCircle className="w-4 h-4 text-purple-400 shrink-0 mt-px" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={!!busy} className={SECONDARY_BTN}>
            {step === "synced" ? "Close" : "Cancel"}
          </button>
          {step === "synced" ? (
            <button type="button" onClick={retrySynced} className={PRIMARY_BTN}>
              <HiFingerPrint className="w-4 h-4" /> Try again
            </button>
          ) : step === "code" ? (
            <>
              <button type="button" onClick={retrySynced} disabled={!!busy} className={DANGER_BTN}>Start again</button>
              <button type="button" onClick={finish} disabled={busy === "finish"} className={PRIMARY_BTN}>
                {busy === "finish" ? <><Spinner /> {busyLabel}</> : <><HiCheckCircle className="w-4 h-4" /> Register device</>}
              </button>
            </>
          ) : (
            <button type="button" onClick={start} disabled={busy === "start"} className={PRIMARY_BTN}>
              {busy === "start" ? <><Spinner /> {busyLabel}</> : <><HiDeviceMobile className="w-4 h-4" /> Start</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
