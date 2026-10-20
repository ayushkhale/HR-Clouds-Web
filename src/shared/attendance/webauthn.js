// ─────────────────────────────────────────────────────────────────────────────
// attendance/webauthn.js — The browser half of Device Trust: the two
// `navigator.credentials` ceremonies, in the JSON shapes the backend's WebAuthn
// verifier expects, plus one place that turns a DOMException into something a
// person can act on.
//
// WHY THIS IS HAND-WRITTEN. The backend guide suggests `@simplewebauthn/browser`
// for base64url ↔ ArrayBuffer conversion. This repo writes that kind of helper
// in-house (motion, JWT decoding) and the guide names the native equivalents it
// would wrap: `PublicKeyCredential.parseCreationOptionsFromJSON()`,
// `parseRequestOptionsFromJSON()` and `credential.toJSON()`. Those are used when
// the browser has them (Chrome 119+, Safari 17.4+) and the conversion below runs
// everywhere else, so there is one code path per browser generation and no new
// dependency. The serialised shapes match @simplewebauthn/server@14's
// RegistrationResponseJSON / AuthenticationResponseJSON field for field — if you
// add a field here, check it against that library rather than guessing.
//
// TRAPS, all from the frontend guide (§3.3, §6.4, §7):
//  - One ceremony at a time per browser. A second overlapping call throws
//    InvalidStateError or an instant NotAllowedError, which users report as
//    "the fingerprint thing just closed". `runCeremony` enforces it.
//  - WebAuthn needs a secure context: https, or http://localhost. On
//    http://192.168.x.x it fails with SecurityError and no useful message.
//  - THE RELYING-PARTY ID IS SERVER CONFIG, AND A SecurityError IS ALMOST
//    ALWAYS IT. The browser requires `rp.id` — `WEBAUTHN_RP_ID` on the API, sent
//    to us inside `public_key` — to equal the page's domain or be a parent of
//    it: `localhost` for `localhost:5173`, `hrclouds.in` for
//    `app.hrclouds.in`, never the other way round and never a URL or a port.
//    Nothing here can work around it, so the console says which two values
//    disagree instead of leaving somebody to read Chrome's wording.
//  - There is NO way to ask whether this browser holds a given credential —
//    that is a privacy property of WebAuthn, not a gap. So NotAllowedError is
//    ambiguous (cancelled / timed out / no credential here) and must always be
//    paired with a way to register.
// ─────────────────────────────────────────────────────────────────────────────

/** Browser can do WebAuthn at all, in a context where it is allowed to run. */
export function webauthnSupported() {
  return typeof window !== "undefined"
    && !!window.PublicKeyCredential
    && !!navigator.credentials?.create
    && window.isSecureContext === true;
}

/**
 * The machine has a built-in authenticator (Windows Hello, Touch ID, Android
 * screen lock). It does NOT say a credential is enrolled — nothing can. Use it
 * only to decide whether offering enrollment on web makes sense.
 */
export async function hasPlatformAuthenticator() {
  if (!webauthnSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ── base64url ↔ bytes ───────────────────────────────────────────────────────
// The server speaks base64url without padding. One wrong padding assumption
// produces a signature that fails verification with no diagnostic, so both
// directions live here and nowhere else.

function fromBase64Url(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(buffer) {
  if (!buffer) return undefined;
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on an
  // attestation object, which is routinely a few kilobytes.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const toDescriptors = (list) => (Array.isArray(list) ? list : []).map((item) => ({
  ...item,
  id: fromBase64Url(item.id),
}));

// ── Options JSON → the ArrayBuffer-shaped objects the API wants ──────────────

function creationOptions(json) {
  if (typeof window.PublicKeyCredential?.parseCreationOptionsFromJSON === "function") {
    return window.PublicKeyCredential.parseCreationOptionsFromJSON(json);
  }
  return {
    ...json,
    challenge: fromBase64Url(json.challenge),
    user: { ...json.user, id: fromBase64Url(json.user?.id) },
    excludeCredentials: toDescriptors(json.excludeCredentials),
  };
}

function requestOptions(json) {
  if (typeof window.PublicKeyCredential?.parseRequestOptionsFromJSON === "function") {
    return window.PublicKeyCredential.parseRequestOptionsFromJSON(json);
  }
  return {
    ...json,
    challenge: fromBase64Url(json.challenge),
    allowCredentials: toDescriptors(json.allowCredentials),
  };
}

// ── Credential → the JSON the server verifies ───────────────────────────────

function serialize(credential, kind) {
  if (typeof credential.toJSON === "function") return credential.toJSON();
  const response = credential.response;
  const base = {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
  };
  // Omitted rather than null when the browser does not report it: the server
  // schema accepts absent, and "null" is a different value to a validator.
  if (credential.authenticatorAttachment) base.authenticatorAttachment = credential.authenticatorAttachment;

  if (kind === "registration") {
    const transports = response.getTransports?.();
    return {
      ...base,
      response: {
        clientDataJSON: toBase64Url(response.clientDataJSON),
        attestationObject: toBase64Url(response.attestationObject),
        ...(Array.isArray(transports) && transports.length ? { transports } : {}),
      },
    };
  }
  return {
    ...base,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      // An empty buffer is still an object, so it is truthy: without the length
      // check this sends `userHandle: ""`, which is not the same as omitting it.
      ...(response.userHandle?.byteLength ? { userHandle: toBase64Url(response.userHandle) } : {}),
    },
  };
}

/** The relying-party id inside either options shape, or "" when absent. */
const rpIdOf = (json) => json?.rp?.id || json?.rpId || "";

/** The page's own domain, which `rp.id` has to equal or be a parent of. */
const hostNow = () => (typeof window === "undefined" ? "" : window.location.hostname);

/** Would the browser accept this `rp.id` here? Registrable-suffix rule only. */
const rpIdFits = (rpId) => {
  const host = hostNow();
  return !rpId || host === rpId || host.endsWith(`.${rpId}`);
};

// ── One ceremony at a time ──────────────────────────────────────────────────

let active = null;

/**
 * Abort whatever ceremony is open. Called from a component's cleanup: a remount
 * while the OS prompt is up is the other half of §3.3.
 */
export function abortCeremony() {
  try {
    active?.abort();
  } catch {
    // Already finished — nothing to abort.
  }
  active = null;
}

export const ceremonyInProgress = () => active !== null;

async function runCeremony(kind, optionsJSON) {
  if (!webauthnSupported()) throw unsupportedError();
  if (active) throw ceremonyBusyError();
  const controller = new AbortController();
  active = controller;
  try {
    const rpId = rpIdOf(optionsJSON);
    // Said up front, not just on failure: Chrome can still accept a mismatch
    // when the relying party serves a `.well-known/webauthn` for this origin,
    // so this warns rather than refusing — but it is the first thing to check
    // when the prompt never appears.
    if (import.meta.env.DEV && !rpIdFits(rpId)) {
      console.warn(`[deviceTrust] The server's rp.id (${rpId}) is not ${hostNow()} or a parent of it. Set WEBAUTHN_RP_ID to this environment's domain.`);
    }
    const publicKey = kind === "registration" ? creationOptions(optionsJSON) : requestOptions(optionsJSON);
    const credential = kind === "registration"
      ? await navigator.credentials.create({ publicKey, signal: controller.signal })
      : await navigator.credentials.get({ publicKey, signal: controller.signal });
    if (!credential) throw ceremonyError("CEREMONY_FAILED", "Your device didn’t return a verification. Try again.");
    return serialize(credential, kind);
  } catch (err) {
    throw mapCeremonyError(err, kind, rpIdOf(optionsJSON));
  } finally {
    if (active === controller) active = null;
  }
}

/** Enrollment ceremony — hand it `public_key` from registration/start verbatim. */
export const createCredential = (optionsJSON) => runCeremony("registration", optionsJSON);

/** Punch ceremony — hand it `public_key` from the challenge response verbatim. */
export const getAssertion = (optionsJSON) => runCeremony("authentication", optionsJSON);

// ── Errors ──────────────────────────────────────────────────────────────────

/**
 * A ceremony failure, shaped like the API errors the screens already handle:
 * `.message` is shown, `.code` is branched on, `.isCeremony` marks it as having
 * come from the browser rather than from us.
 * @param {string} code
 * @param {string} message
 * @param {{offerEnrollment?: boolean, silent?: boolean}} [extra]
 */
function ceremonyError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, isCeremony: true, ...extra });
}

const unsupportedError = () => ceremonyError(
  "CEREMONY_UNSUPPORTED",
  "This browser can’t verify your device. Open HR Clouds in Chrome, Edge or Safari, or ask HR to register your device for you.",
);

const ceremonyBusyError = () => ceremonyError(
  "CEREMONY_BUSY",
  "A device check is already open. Finish it, or wait a moment and try again.",
);

/**
 * Every DOMException name the guide lists (§6.4), mapped to copy that says what
 * to do next. `offerEnrollment` marks the ones where registering a device is a
 * plausible next step — NotAllowedError cannot be told apart from "this browser
 * holds no credential", so it always carries it.
 * @param {unknown} err
 * @param {"registration"|"authentication"} kind
 * @param {string} [rpId] what the server asked for, for the SecurityError log
 */
export function mapCeremonyError(err, kind = "authentication", rpId = "") {
  if (err?.isCeremony) return err;
  const name = err?.name || "";

  if (name === "AbortError") return ceremonyError("CEREMONY_ABORTED", "Device check cancelled.", { silent: true });

  if (name === "NotAllowedError") {
    return ceremonyError(
      "CEREMONY_CANCELLED",
      kind === "registration"
        ? "The device check was cancelled or timed out before it finished. Try registering again."
        : "The device check was cancelled or timed out. Try again — if this device has never been registered, register it first.",
      { offerEnrollment: true },
    );
  }

  if (name === "InvalidStateError") {
    return kind === "registration"
      ? ceremonyError("CEREMONY_ALREADY_REGISTERED", "This device is already registered with its screen lock or fingerprint. Use a different one, or check your registered devices.")
      : ceremonyBusyError();
  }

  if (name === "NotSupportedError") {
    return ceremonyError(
      "CEREMONY_UNSUPPORTED",
      "This device can’t be used for attendance. Use your phone instead, or ask HR to register a device for you.",
    );
  }

  if (name === "SecurityError") {
    // A setup problem, never the person's fault: wrong relying-party id, wrong
    // origin, or an insecure address. Loud in the console because nobody can
    // diagnose it from the screen (frontend guide §7).
    console.error(
      `[deviceTrust] WebAuthn SecurityError. The server asked for rp.id "${rpId || "(none sent)"}" while this page is on "${hostNow()}". `
      + "WEBAUTHN_RP_ID must equal that domain or be a parent of it (`localhost` in dev, the apex domain in production) — "
      + "a URL, a port or a sibling domain all fail here. The page also has to be https, or http://localhost.",
      err,
    );
    return ceremonyError(
      "CEREMONY_CONFIG",
      "Device checks can’t run on this address. Tell HR — it’s a setup problem on our side, not something you can fix.",
    );
  }

  return ceremonyError("CEREMONY_FAILED", "Something went wrong during the device check. Try again.");
}
