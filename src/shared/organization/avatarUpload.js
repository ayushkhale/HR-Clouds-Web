// ─────────────────────────────────────────────────────────────────────────────
// organization/avatarUpload.js — Putting a new profile photo on your account.
//
// The contract (`public/ref docs/md_updates/5_org_details_and_hierarchy_api.md`
// §3) is the same three steps as a document upload: ask for a signed link
// (#upload-url) → PUT the bytes straight to storage → confirm (#confirm), which
// re-checks the stored object's real type and size and returns the updated
// profile. The API never proxies the file.
//
// Why the picture is re-drawn in the browser first (cropAvatar):
// • Every avatar is shown as a circle with `object-cover`, so the person picks
//   what's in the circle before it's saved, not after.
// • A phone photo is 3–8 MB. Re-drawn at 512×512 it is ~60–300 KB, so the 5 MB
//   limit (413) is practically never hit and the upload is quick on mobile.
// • PNG stays PNG (it may be transparent); everything else becomes JPEG on a
//   white background — a transparent JPEG turns black.
//
// Traps:
// • `storage_key_token` is opaque and lives ten minutes. It is held in memory
//   only and sent back verbatim. After a failure the person chooses Save again,
//   which starts a fresh handshake — there is no half-finished record to resume.
// • The PUT carries no Authorization header (putToSignedUrl) and must echo the
//   Content-Type declared in step one, or storage rejects the signature.
// • Confirm is idempotent, so a retry after a network blip is safe.
// ─────────────────────────────────────────────────────────────────────────────

import { organizationAPI } from "../api";
import { putToSignedUrl } from "../utils/payrollAttachments";
import { organizationErrorMessage } from "../utils/organizationErrors";

export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_OUTPUT_PX = 512;

/**
 * True for a photo the person uploaded themselves: the API serves those as a
 * presigned storage link (~5 minutes) on every read. Such a link must never be
 * written back anywhere — it is dead within minutes, and the uploaded photo
 * wins over `avatar_url` regardless (contract §3.7).
 */
export function isUploadedPhotoUrl(url) {
  return typeof url === "string" && /[?&]X-Amz-(Signature|Credential)=/i.test(url);
}

/** A message if this file can't be used, else null. Checked before anything is uploaded. */
export function avatarFileProblem(file) {
  if (!file) return "Choose a picture first.";
  const type = String(file.type || "").toLowerCase();
  if (!AVATAR_TYPES.includes(type)) return "That file isn’t a picture we can use. Choose a PNG, JPG or WebP image.";
  // The original can be large — it's re-drawn smaller before upload — but a
  // 40 MB file is almost certainly not a photo of a face and would stall the tab.
  if (file.size > 25 * 1024 * 1024) return "That picture is too large. Choose one under 25 MB.";
  if (file.size === 0) return "That file is empty. Choose another picture.";
  return null;
}

/** Load a File into an <img>, resolving once it can be drawn. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture couldn’t be opened. Try a different file.")); };
    img.src = url;
  });
}

/**
 * Draw the framed part of the image to a square and return it as a File.
 * @param {HTMLImageElement} img
 * @param {{x: number, y: number, scale: number, frame: number}} crop  image offset and scale inside a `frame`-px square
 * @param {File} source  the chosen file (for its name and type)
 */
export function cropAvatar(img, crop, source) {
  const out = AVATAR_OUTPUT_PX;
  const ratio = out / crop.frame;
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  const keepAlpha = source.type === "image/png";
  if (!keepAlpha) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, out, out);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x * ratio, crop.y * ratio, img.naturalWidth * crop.scale * ratio, img.naturalHeight * crop.scale * ratio);
  const type = keepAlpha ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("The picture couldn’t be prepared. Try a different file.")); return; }
      const base = String(source.name || "photo").replace(/\.[^.]+$/, "").slice(0, 150) || "photo";
      resolve(new File([blob], `${base}.${keepAlpha ? "png" : "jpg"}`, { type }));
    }, type, 0.9);
  });
}

export class AvatarUploadError extends Error {
  /** @param {"issue"|"put"|"confirm"} stage */
  constructor(stage, cause) {
    super(cause?.message || "Couldn’t save the photo.");
    this.name = "AvatarUploadError";
    this.stage = stage;
    this.cause = cause;
  }
}

/** A message that says what to do next, by the step that failed. */
export function avatarUploadMessage(err) {
  if (err instanceof AvatarUploadError) {
    if (err.stage === "put") return "The picture couldn’t be sent to secure storage. Check your connection and try again.";
    if (err.stage === "confirm") return organizationErrorMessage(err.cause, "The picture was sent but couldn’t be saved. Try again.");
    return organizationErrorMessage(err.cause, "Couldn’t start the upload. Try again.");
  }
  return organizationErrorMessage(err, "Couldn’t save the photo. Try again.");
}

/**
 * The whole handshake for one (already cropped) image.
 * @param {File} file
 * @param {(stage: "issue"|"put"|"confirm") => void} [onStage]
 * @returns {Promise<object>} the updated profile (same shape as GET /organizations/me)
 */
export async function uploadAvatar(file, onStage) {
  const content_type = file.type;
  if (file.size > AVATAR_MAX_BYTES) {
    throw new AvatarUploadError("issue", { data: { errorCode: "FILE_TOO_LARGE" }, status: 413 });
  }

  onStage?.("issue");
  let issued;
  try {
    const res = await organizationAPI.requestAvatarUploadUrl({
      content_type,
      size_bytes: file.size,
      file_name: String(file.name || "photo").slice(0, 200),
    });
    issued = res?.data ?? res;
  } catch (err) {
    throw new AvatarUploadError("issue", err);
  }
  if (!issued?.upload_url || !issued?.storage_key_token) {
    throw new AvatarUploadError("issue", new Error("Storage didn’t return an upload link."));
  }

  onStage?.("put");
  try {
    await putToSignedUrl(issued.upload_url, file, issued.required_headers, content_type);
  } catch (err) {
    throw new AvatarUploadError("put", err);
  }

  onStage?.("confirm");
  try {
    const res = await organizationAPI.confirmAvatarUpload({ storage_key_token: issued.storage_key_token });
    return res?.data ?? null;
  } catch (err) {
    throw new AvatarUploadError("confirm", err);
  }
}
