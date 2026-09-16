// ─────────────────────────────────────────────────────────────────────────────
// uuid.js — Random v4 UUIDs that work everywhere.
//
// `crypto.randomUUID` exists only in secure contexts (HTTPS or localhost). When
// the app is opened over a LAN IP (http://192.168.x.x:5173) it is undefined, so
// fall back to `crypto.getRandomValues`, which is available on plain HTTP too.
// ─────────────────────────────────────────────────────────────────────────────

export function uuid() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
