// ─────────────────────────────────────────────────────────────────────────────
// GenderAvatar.jsx — THE avatar for a person, used everywhere in the app.
//
// Resolution order:
//   1. A real photo URL (`src`, or found on `person` — e.g. the S3 link in
//      `avatar_url`). If it fails to load, we fall through instead of showing
//      a broken image.
//   2. The generic male / female illustration, picked from the person's gender.
//   3. Purple initials when the gender is unknown — but only after asking the
//      organisation directory (directoryIndex.js), because most list rows name
//      a person without saying their gender. Without that, the same person was
//      an illustration on Team and "PP" on Live Attendance.
//
// Pass `person` and let the component find name, gender and photo, or pass
// `name` / `gender` / `src` explicitly (they win over `person`). The size and
// shape come from the wrapper or `className`.
//
// The illustrations are DiceBear "avataaars" faces embedded in avatarImages.js.
// They render as <img> so every copy on a page keeps its own SVG mask ids.
//
// `onPhotoError` (optional) is told when a real photo fails to load. Uploaded
// photos are presigned links that expire after about five minutes, so a page
// that stays open — the Org Chart — uses it to fetch fresh links rather than
// leave people on the fallback illustration.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { FEMALE_AVATAR_SRC, MALE_AVATAR_SRC } from "./avatarImages";
import { markDirectoryPhotosStale, useDirectoryEntry } from "../utils/directoryIndex";

/** "Male" / "M" / "man" → "male"; "Female" / "F" / "woman" → "female"; else null. */
export function normalizeGender(value) {
  const g = String(value || "").trim().toLowerCase();
  if (["male", "m", "man"].includes(g)) return "male";
  if (["female", "f", "woman"].includes(g)) return "female";
  return null;
}

// Where a row may keep the person. Since 29 Sep 2026 (R-5) the backend puts
// `gender` on the embedded role profiles, which list rows nest under `user`
// (`user.employee_profile`, …) — so those are looked at too. When gender is
// found here, the directory lookup below is never made.
const nested = (person) => [
  person, person?.profile, person?.user, person?.user?.profile,
  person?.user?.employee_profile, person?.user?.manager_profile, person?.user?.hr_profile,
  person?.applicant, person?.applicant?.profile, person?.employee,
  person?.employee_profile, person?.manager_profile, person?.hr_profile,
].filter((x) => x && typeof x === "object");

/** Gender from flat or nested profile shapes. */
export function genderOf(person) {
  if (!person || typeof person !== "object") return null;
  for (const obj of nested(person)) {
    const g = normalizeGender(obj.gender);
    if (g) return g;
  }
  return null;
}

const URL_KEYS = ["avatar_url", "avatar", "photo_url", "profile_picture", "profile_image", "image_url"];

/** The person's real photo URL (e.g. an S3 link) from flat or nested shapes, or "". */
export function avatarUrlOf(person) {
  if (!person || typeof person !== "object") return "";
  for (const obj of nested(person)) {
    for (const key of URL_KEYS) {
      const v = obj[key];
      if (typeof v === "string" && /^(https?:|data:image\/|blob:|\/)/i.test(v.trim())) return v.trim();
    }
  }
  return "";
}

function nameOf(person) {
  for (const obj of nested(person)) {
    const full = [obj.first_name, obj.last_name].filter(Boolean).join(" ").trim();
    const n = obj.display_name || obj.name || obj.full_name || full;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  // Accounts created by invite often have no name yet (HR staff especially,
  // whose `profile` comes back null). Their login email is the only human
  // label there is — better an "M" than a "?".
  for (const obj of nested(person)) {
    const email = obj.email || obj.identifier;
    if (typeof email === "string" && email.trim()) return email.trim();
  }
  return "";
}

/** Every user id and email the row carries, for the directory lookup. */
function lookupKeys(person) {
  const keys = [];
  for (const obj of nested(person)) {
    for (const key of ["user_id", "id", "email", "identifier"]) {
      if (typeof obj[key] === "string" && obj[key]) keys.push(obj[key]);
    }
  }
  return keys;
}

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

export default function GenderAvatar({ person, gender, name, src, className = "w-full h-full", onPhotoError }) {
  const ownPhoto = src || avatarUrlOf(person);
  const ownGender = normalizeGender(gender) || genderOf(person);
  const keys = ownPhoto || ownGender ? [] : lookupKeys(person);
  const known = useDirectoryEntry(keys, keys.length > 0);
  const photo = ownPhoto || known?.photo || "";
  const displayName = name || nameOf(person);
  const g = ownGender || normalizeGender(known?.gender);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => { setPhotoFailed(false); }, [photo]);

  if (photo && !photoFailed) {
    return <img src={photo} alt={displayName || ""} onError={() => {
      setPhotoFailed(true);
      // A photo looked up in the directory: its link expired, so re-read it.
      if (!ownPhoto) markDirectoryPhotosStale();
      onPhotoError?.(photo);
    }} draggable={false} className={`${className} object-cover`} />;
  }
  if (g) {
    return <img src={g === "female" ? FEMALE_AVATAR_SRC : MALE_AVATAR_SRC} alt={displayName || ""} draggable={false} className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-300 text-purple-800 font-bold`} role="img" aria-label={displayName || "Avatar"}>
      <span className="text-[0.8em] leading-none">{initialsOf(displayName)}</span>
    </div>
  );
}
