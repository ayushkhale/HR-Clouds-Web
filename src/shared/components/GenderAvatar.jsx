// ─────────────────────────────────────────────────────────────────────────────
// GenderAvatar.jsx — THE avatar for a person, used everywhere in the app.
//
// Resolution order:
//   1. A real photo URL (`src`, or found on `person` — e.g. the S3 link in
//      `avatar_url`). If it fails to load, we fall through instead of showing
//      a broken image.
//   2. The generic male / female illustration, picked from the person's gender.
//   3. Purple initials when the gender is unknown.
//
// Pass `person` and let the component find name, gender and photo, or pass
// `name` / `gender` / `src` explicitly (they win over `person`). The size and
// shape come from the wrapper or `className`.
//
// The illustrations are DiceBear "avataaars" faces embedded in avatarImages.js.
// They render as <img> so every copy on a page keeps its own SVG mask ids.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { FEMALE_AVATAR_SRC, MALE_AVATAR_SRC } from "./avatarImages";

/** "Male" / "M" / "man" → "male"; "Female" / "F" / "woman" → "female"; else null. */
export function normalizeGender(value) {
  const g = String(value || "").trim().toLowerCase();
  if (["male", "m", "man"].includes(g)) return "male";
  if (["female", "f", "woman"].includes(g)) return "female";
  return null;
}

const nested = (person) => [person, person?.profile, person?.user, person?.user?.profile, person?.applicant, person?.applicant?.profile, person?.employee, person?.employee_profile, person?.manager_profile, person?.hr_profile].filter((x) => x && typeof x === "object");

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

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

export default function GenderAvatar({ person, gender, name, src, className = "w-full h-full" }) {
  const photo = src || avatarUrlOf(person);
  const displayName = name || nameOf(person);
  const g = normalizeGender(gender) || genderOf(person);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => { setPhotoFailed(false); }, [photo]);

  if (photo && !photoFailed) {
    return <img src={photo} alt={displayName || ""} onError={() => setPhotoFailed(true)} draggable={false} className={`${className} object-cover`} />;
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
