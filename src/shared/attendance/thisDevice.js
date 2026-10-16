// ─────────────────────────────────────────────────────────────────────────────
// attendance/thisDevice.js — which registered device is THE ONE I AM ON?
//
// WebAuthn cannot answer that. A credential proves possession only while a
// ceremony is running, and nothing in the browser exposes "this machine's
// device id" — so "My current device" would be a list of names the person has
// to recognise, which is exactly what they came to the page to find out.
//
// So the answer is remembered at the only moment it is known for certain: the
// registration that just completed in THIS browser. The device id goes into
// local storage against the user id, and the page reads it back.
//
// WHAT THIS IS NOT. It is not a security boundary and nothing is gated on it.
// A punch is still proved by a signature from the hardware (the server checks
// that, we don't), and this value only decides which row of the person's own
// list is shown first. If it is missing, wrong or from another account the page
// falls back to "we can't tell which of these is this device" and the whole
// list still works — the same as before this file existed.
//
// It is per BROWSER PROFILE, not per machine: a second browser on the same
// laptop is a different registration anyway, which is also why clearing site
// data loses the marker and not the device.
//
// The try/catch idiom follows AttendanceCard's work-mode marker — storage can
// be disabled, full, or unavailable in a private window, and none of those are
// worth an error on screen.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "hrclouds_attendance_this_device";

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const write = (value) => {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — the page falls back to "we can't tell" */
  }
};

/**
 * The device registered from this browser, for this person. Scoped by user id
 * so a shared computer never shows one colleague the other's device as "this
 * one" — a wrong row here would be read as "my laptop is registered" when it
 * isn't.
 * @returns {string} the device id, or "" when this browser has no marker
 */
export function recallThisDevice(userId) {
  if (!userId) return "";
  const saved = read();
  return saved && saved.user === String(userId) && saved.device ? String(saved.device) : "";
}

/** Called the moment a registration completes here, with the id it returned. */
export function rememberThisDevice(userId, deviceId) {
  if (!userId || !deviceId) return;
  write({ user: String(userId), device: String(deviceId) });
}

/**
 * Drop the marker — after a self-revoke, or when the id no longer appears in
 * the person's own list (shut off by HR, or registered on a machine that has
 * since been re-imaged). Keeping a dead id would pin an empty panel to the top
 * of the page for good.
 */
export function forgetThisDevice(userId, deviceId) {
  const saved = read();
  if (!saved) return;
  if (userId && saved.user !== String(userId)) return;
  if (deviceId && saved.device !== String(deviceId)) return;
  write(null);
}
