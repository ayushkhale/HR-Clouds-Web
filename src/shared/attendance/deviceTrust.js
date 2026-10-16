// ─────────────────────────────────────────────────────────────────────────────
// attendance/deviceTrust.js — The three-step punch, the enrollment flow, and
// the one shared read of the device-trust context. Screens never talk to the
// challenge endpoint themselves; they call `punchWithDeviceTrust()` and render
// the progress labels it reports.
//
// WHY THIS FILE EXISTS AT ALL. A punch used to be one POST. Under device trust
// it is: mint a single-use challenge → ask the operating system to sign it →
// post the punch with the signature. Three steps, three new failure classes,
// and a user-interaction step in the middle. Putting that in the punch card
// would have duplicated it four times (clock in, clock out, break start, break
// end) and again in any future punch surface.
//
// THE RULES, each of which cost somebody a day somewhere (frontend guide §3):
//  1. A CHALLENGE IS SINGLE-USE AND REQUEST-SCOPED. It is consumed by the first
//     submit that reaches the gate, even when the punch then fails on a
//     business rule (ALREADY_CLOCKED_IN…). So it is never cached, never stored,
//     never put in React state, and any retry restarts at step 1. It lives in a
//     local variable for the length of one attempt and is then gone.
//  2. `monitor` MUST NEVER BLOCK A PUNCH. In that mode any device failure —
//     including a cancelled fingerprint prompt — falls back to the ordinary
//     proof-less punch, silently. If it surfaced, the pilot would generate a
//     support queue and the rollout would stall.
//  3. A TIMEOUT ON STEP 3 IS AMBIGUOUS: the punch may have committed. Never
//     auto-retry it. The error carries `needsReconcile` and the caller re-reads
//     `/attendance/today` instead.
//  4. `DEVICE_CHALLENGE_INVALID` is retried ONCE and only after announcing it,
//     because the retry raises a second fingerprint prompt and an unannounced
//     one reads as a malfunction. `DEVICE_VERIFICATION_FAILED` is never
//     retried: it is a real cryptographic failure, and every attempt writes an
//     audit row HR reads as a possible attack.
//
// The context read degrades to "off": an older server (404), a disabled module,
// or a network blip all mean attendance behaves exactly as it did before this
// feature shipped. Nothing here can stop a punch that would otherwise work.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { attendanceAPI } from "../api/attendance.api.js";
import { isChallengeExpired, isDeviceTrustError } from "../utils/attendanceErrors.js";
import { DEVICE_MODES, DEVICE_OPERATIONS, effectiveModeOf, isOperationEnforced } from "./deviceTrustMeta.js";
import { unwrap } from "./normalize.js";
import { abortCeremony, createCredential, getAssertion } from "./webauthn.js";

const CREDENTIAL_TYPE = "webauthn";

// One call per operation, so the api layer stays the only place that knows URLs.
const PUNCH_CALLS = {
  [DEVICE_OPERATIONS.CLOCK_IN]: (body) => attendanceAPI.clockIn(body),
  [DEVICE_OPERATIONS.CLOCK_OUT]: (body) => attendanceAPI.clockOut(body),
  [DEVICE_OPERATIONS.BREAK_START]: (body) => attendanceAPI.breakStart(body),
  [DEVICE_OPERATIONS.BREAK_END]: (body) => attendanceAPI.breakEnd(body),
};

// ─────────────────────────────────────────────────────────────────────────────
// The shared context read
//
// Cached for the session and shared by every subscriber: the sidebar asks
// whether the device pages exist, the punch card asks what mode is in force,
// and the devices page asks how many devices are allowed. One read answers all
// three. Invalidated on any device-trust error (a stale mode costs one failed
// punch that self-corrects) and after anything that changes the device count.
// ─────────────────────────────────────────────────────────────────────────────

/** Feature absent: an older server, or attendance switched off for this org. */
const ABSENT = Object.freeze({ enabled: false, absent: true });

let cache = null;         // last good (or ABSENT) context
let inFlight = null;      // de-dupes StrictMode's double mount and parallel screens
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(cache));

/** The cached context without triggering a read. `null` = not read yet. */
export const peekDeviceTrustContext = () => cache;

/** Forget the cached context; the next read goes to the server. */
export function invalidateDeviceTrustContext() {
  cache = null;
  inFlight = null;
}

/**
 * Read the context, from cache unless `force`. NEVER throws and never reports a
 * failure to the caller: a context we could not read is treated as "off", which
 * is the behaviour attendance had before this feature existed. A network blip
 * is not cached, so the next punch tries again.
 * @param {{force?: boolean}} [options]
 */
export async function loadDeviceTrustContext({ force = false } = {}) {
  if (!force && cache) return cache;
  if (!force && inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const data = unwrap(await attendanceAPI.getDeviceTrustContext());
      cache = data && typeof data === "object" ? data : ABSENT;
    } catch (err) {
      // "This server has no such feature" (404/403/501) is a settled answer and
      // worth caching. Anything else — offline, 500 — is not: leave the cache
      // empty so we ask again, rather than hiding the device pages from
      // somebody who has a device registered.
      const settled = err?.status === 404 || err?.status === 403 || err?.status === 501;
      cache = settled ? ABSENT : null;
      inFlight = null;
      notify();
      return ABSENT;
    }
    inFlight = null;
    notify();
    return cache;
  })();
  return inFlight;
}

/** Re-read after an enrollment, a rename or a revoke — the counts have moved. */
export const refreshDeviceTrustContext = () => loadDeviceTrustContext({ force: true });

/**
 * The context, for a component. Starts from whatever is cached, so a second
 * screen renders the right thing on its first frame.
 *
 * `enabled: false` reads nothing and reports "off" — for a caller that renders
 * for a role outside the organisation (the guest sidebar), where an attendance
 * read would 403 and tell us what we already know.
 * @param {{enabled?: boolean}} [options]
 * @returns {{ctx: object|null, loading: boolean, reload: () => void}}
 */
export function useDeviceTrustContext({ enabled = true } = {}) {
  const [ctx, setCtx] = useState(peekDeviceTrustContext);
  const [loading, setLoading] = useState(() => enabled && peekDeviceTrustContext() === null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    let alive = true;
    const onChange = (next) => { if (alive) { setCtx(next); setLoading(false); } };
    listeners.add(onChange);
    loadDeviceTrustContext().then((next) => { if (alive) { setCtx(next); setLoading(false); } });
    return () => { alive = false; listeners.delete(onChange); };
  }, [enabled]);

  const reload = useCallback(() => {
    setLoading(true);
    refreshDeviceTrustContext().finally(() => setLoading(false));
  }, []);

  return { ctx, loading, reload };
}

// ─────────────────────────────────────────────────────────────────────────────
// The punch
// ─────────────────────────────────────────────────────────────────────────────

/** This person has no usable device, so no amount of retrying helps. */
function enrollmentRequiredError() {
  return Object.assign(
    new Error("Register this device before you clock in from it."),
    { code: "DEVICE_REGISTRATION_REQUIRED", isDeviceTrust: true, needsEnrollment: true },
  );
}

/**
 * A ceremony failure (cancelled prompt, unsupported browser) or a server-side
 * device refusal. The only errors `monitor` mode swallows.
 */
const isDeviceFailure = (err) => isDeviceTrustError(err) || err?.isCeremony === true || err?.isDeviceTrust === true;

/**
 * One attempt at a verified punch. Holds the challenge in a local variable and
 * lets it go — step 1 here is the only place a challenge ever exists.
 * @param {string} operation
 * @param {object} body the punch payload the card already builds
 * @param {(stage: "challenge"|"ceremony"|"submit") => void} onStage
 */
async function verifiedPunch(operation, body, onStage) {
  onStage("challenge");
  const challenge = unwrap(await attendanceAPI.requestDeviceChallenge({
    operation,
    credential_type: CREDENTIAL_TYPE,
  }));

  // (a) The server says this punch does not need proof after all — the policy
  // changed since the context was read. Punch as today, prompt nobody.
  if (!challenge?.required) return PUNCH_CALLS[operation](body);

  // (c) Required, but there is no active device of this kind to sign with.
  if (challenge.registration_required) throw enrollmentRequiredError();

  onStage("ceremony");
  const assertion = await getAssertion(challenge.public_key);

  onStage("submit");
  return PUNCH_CALLS[operation]({
    ...body,
    device_proof: {
      challenge_id: challenge.challenge_id,
      credential_type: CREDENTIAL_TYPE,
      assertion,
    },
  });
}

/**
 * Punch, verifying the device when the organisation requires it.
 *
 * `onStage` drives the button's label. The stages are deliberately labelled
 * rather than one spinner: an undifferentiated spinner during a three-step
 * flow gets double-tapped, and a double-tap burns a second challenge.
 *
 * @param {object} args
 * @param {"clock_in"|"clock_out"|"break_start"|"break_end"} args.operation
 * @param {object} args.body the ordinary punch payload — unchanged by this feature
 * @param {(stage: "challenge"|"ceremony"|"submit"|"retrying") => void} [args.onStage]
 * @returns {Promise<unknown>} the punch response, exactly as before
 */
export async function punchWithDeviceTrust({ operation, body, onStage = () => {} }) {
  const call = PUNCH_CALLS[operation];
  if (!call) throw new Error(`Unknown punch operation: ${operation}`);

  const ctx = await loadDeviceTrustContext();

  // Fast path: feature off, or this operation is not gated for this org. No
  // challenge, no prompt, no extra call — byte for byte the old behaviour.
  if (!isOperationEnforced(ctx, operation)) return call(body);

  const monitoring = effectiveModeOf(ctx) === DEVICE_MODES.MONITOR;
  let stage = "challenge";
  const track = (next) => { stage = next; onStage(next); };

  const attempt = () => verifiedPunch(operation, body, track);

  try {
    try {
      return await attempt();
    } catch (err) {
      // The challenge died while the person was reaching for their finger.
      // Announce the second prompt, then retry — once, and only here.
      if (isChallengeExpired(err)) {
        onStage("retrying");
        return await attempt();
      }
      throw err;
    }
  } catch (err) {
    // Ambiguous: the punch may have committed on the server. Re-reading beats
    // guessing, and a second submit would double-punch or burn a dead proof.
    if (err?.isTimeout && stage === "submit") {
      invalidateDeviceTrustContext();
      throw Object.assign(err, { needsReconcile: true });
    }
    if (isDeviceFailure(err)) {
      // A device-trust refusal can mean the policy moved; the next punch reads
      // the context again rather than repeating the same mistake.
      invalidateDeviceTrustContext();
      // Watch-only: the punch must land regardless. Silent on purpose.
      if (monitoring) return call(body);
    }
    throw err;
  }
}

/** Cleanup for a punch surface: cancels an open OS prompt on unmount (§3.3). */
export const cancelDeviceCeremony = abortCeremony;

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment — two calls, in this order, for a reason
//
// `registration/start` sends the one-time code AND returns the WebAuthn
// options. The challenge lives ~180 seconds; the code lives minutes. So the
// device ceremony runs FIRST and the code is collected after it, while the
// attestation waits in memory. Asking for the code first kills the challenge
// for anyone who has to go and find their email — which is everyone.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The replacement device, as the payload carries it: PRESENT or ABSENT, never
 * `null`.
 *
 * SPEC DEVIATION, recorded 15 Oct 2026: the contract writes the field as
 * `replace_device_id?`, which reads as "optional, so null is fine". It is not —
 * the live validator answers `"replace_device_id" must be a string` to an
 * explicit null, so an ordinary registration (nobody at the cap) was refused
 * before it reached the ceremony. The key is dropped instead of nulled, and
 * anything falsy counts as "no replacement".
 */
const replacement = (id) => (id ? { replace_device_id: id } : {});

/**
 * Step 1 + 2: open enrollment and run the device ceremony immediately.
 * @param {{deviceName: string, replaceDeviceId?: string|null}} args
 * @returns {Promise<{start: object, attestation: object}>} both are held by the
 *   dialog, in component state, only until the code is typed. Neither outlives
 *   the dialog, and neither is ever persisted.
 */
export async function beginDeviceRegistration({ deviceName, replaceDeviceId = null }) {
  const start = unwrap(await attendanceAPI.startDeviceRegistration({
    credential_type: CREDENTIAL_TYPE,
    device_name: deviceName,
    // Omitted, never null — see the note on `replacement()` above.
    ...replacement(replaceDeviceId),
  }));
  const attestation = await createCredential(start.public_key);
  return { start, attestation };
}

/**
 * Step 3: the code and the attestation are verified in one transaction — both
 * land or neither does. A wrong code also consumes the challenge, so there is
 * no "try the code again": the caller restarts from `beginDeviceRegistration`.
 * @param {{start: object, attestation: object, otp: string, deviceName: string, replaceDeviceId?: string|null}} args
 * @returns {Promise<object>} the device; `status` is `active`, or `pending` when
 *   HR approves devices, in which case it cannot punch yet.
 */
export async function completeDeviceRegistration({ start, attestation, otp, deviceName, replaceDeviceId = null }) {
  const device = unwrap(await attendanceAPI.completeDeviceRegistration({
    request_id: start.request_id,
    challenge_id: start.challenge_id,
    credential_type: CREDENTIAL_TYPE,
    device_name: deviceName,
    ...replacement(replaceDeviceId),
    otp,
    attestation,
  }));
  await refreshDeviceTrustContext();
  return device;
}
