// ─────────────────────────────────────────────────────────────────────────────
// organization/logoUpload.js — Putting the company logo on the company profile.
//
// The same three steps as the profile photo (`avatarUpload.js`), against the
// org endpoints: ask for a signed link (#2.1) → PUT the bytes straight to
// storage (#2.2) → confirm (#2.3), which HEAD-checks the stored object's real
// type and size and returns the refreshed details payload. The API never
// proxies the file. Contract: `public/ref docs/6_org_profile_management_api.md`.
//
// A logo is NOT cropped to a square the way a face is — a wordmark cropped to a
// circle is unreadable. It is only scaled down to fit inside LOGO_MAX_PX so a
// 4 MB export doesn't hit the 5 MB limit, and only when it is bigger than that;
// a small, already-optimised file is sent exactly as chosen.
//
// Traps:
// • Transparency must survive: a logo on a transparent background turned onto
//   white shows a white box on a dark page. PNG and WebP keep their alpha, and
//   a resized WebP comes back as PNG because canvas WebP support is uneven.
// • `storage_key_token` is opaque, lives ten minutes and is held in memory
//   only. After a failure the person saves again, which starts a fresh
//   handshake — there is no half-finished record to resume.
// • The PUT carries no Authorization header and must echo the Content-Type
//   declared in step one, or storage rejects the signature.
// • Issuing links is rate-limited per org (50/hour, 429 `LOGO_RATE_LIMITED`
//   with Retry-After) — the message says how long to wait.
// • What comes back resolves `profile.logo_url` by presigning the stored key
//   for ~5 minutes. It is a short-lived link: show it, never store it.
// ─────────────────────────────────────────────────────────────────────────────

import { organizationAPI } from "../api";
import { putToSignedUrl } from "../utils/payrollAttachments";
import { organizationErrorMessage } from "../utils/organizationErrors";

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_MAX_PX = 1024; // longest side after scaling down

/** A message if this file can't be used, else null. Checked before anything is uploaded. */
export function logoFileProblem(file) {
  if (!file) return "Choose a logo first.";
  const type = String(file.type || "").toLowerCase();
  if (!LOGO_TYPES.includes(type)) return "That file isn’t an image we can use. Choose a PNG, JPG or WebP file.";
  if (file.size === 0) return "That file is empty. Choose another image.";
  // The original may be large — it is scaled down before upload — but a 25 MB
  // file is a print asset, not a logo, and would stall the tab.
  if (file.size > 25 * 1024 * 1024) return "That image is too large. Choose one under 25 MB.";
  return null;
}

/** Load a File into an <img>, resolving once it can be drawn. */
export function loadLogoImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn’t be opened. Try a different file.")); };
    img.src = url;
  });
}

/**
 * The file to upload: the original when it is already small enough, otherwise
 * the same picture scaled to fit LOGO_MAX_PX with its proportions and its
 * transparency intact.
 * @param {File} file
 * @param {HTMLImageElement} img  the loaded picture (for its real pixel size)
 */
export function prepareLogo(file, img) {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= LOGO_MAX_PX && file.size <= LOGO_MAX_BYTES) return Promise.resolve(file);

  const ratio = Math.min(1, LOGO_MAX_PX / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext("2d");
  // A JPEG has no transparency to keep, and flattening it onto white avoids the
  // black background a transparent canvas gives it.
  const keepAlpha = file.type !== "image/jpeg";
  if (!keepAlpha) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // PNG for anything with alpha: canvas WebP encoding isn't dependable.
  const type = keepAlpha ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("The image couldn’t be prepared. Try a different file.")); return; }
      const base = String(file.name || "logo").replace(/\.[^.]+$/, "").slice(0, 150) || "logo";
      resolve(new File([blob], `${base}.${keepAlpha ? "png" : "jpg"}`, { type }));
    }, type, 0.92);
  });
}

export class LogoUploadError extends Error {
  /** @param {"issue"|"put"|"confirm"} stage */
  constructor(stage, cause) {
    super(cause?.message || "Couldn’t save the logo.");
    this.name = "LogoUploadError";
    this.stage = stage;
    this.cause = cause;
  }
}

/** A message that says what to do next, by the step that failed. */
export function logoUploadMessage(err) {
  if (err instanceof LogoUploadError) {
    if (err.stage === "put") return "The logo couldn’t be sent to secure storage. Check your connection and try again.";
    if (err.stage === "confirm") return organizationErrorMessage(err.cause, "The logo was sent but couldn’t be saved. Try again.");
    return organizationErrorMessage(err.cause, "Couldn’t start the upload. Try again.");
  }
  return organizationErrorMessage(err, "Couldn’t save the logo. Try again.");
}

/**
 * The whole handshake for one (already prepared) image.
 * @param {File} file
 * @param {(stage: "issue"|"put"|"confirm") => void} [onStage]
 * @returns {Promise<object|null>} the refreshed GET /organizations/details payload
 */
export async function uploadCompanyLogo(file, onStage) {
  const content_type = file.type;
  if (file.size > LOGO_MAX_BYTES) {
    throw new LogoUploadError("issue", { data: { errorCode: "FILE_TOO_LARGE" }, status: 413 });
  }

  onStage?.("issue");
  let issued;
  try {
    const res = await organizationAPI.requestLogoUploadUrl({
      content_type,
      size_bytes: file.size,
      file_name: String(file.name || "logo").slice(0, 200),
    });
    issued = res?.data ?? res;
  } catch (err) {
    throw new LogoUploadError("issue", err);
  }
  if (!issued?.upload_url || !issued?.storage_key_token) {
    throw new LogoUploadError("issue", new Error("Storage didn’t return an upload link."));
  }

  onStage?.("put");
  try {
    await putToSignedUrl(issued.upload_url, file, issued.required_headers, content_type);
  } catch (err) {
    throw new LogoUploadError("put", err);
  }

  onStage?.("confirm");
  try {
    const res = await organizationAPI.confirmLogoUpload({ storage_key_token: issued.storage_key_token });
    return res?.data ?? null;
  } catch (err) {
    throw new LogoUploadError("confirm", err);
  }
}
