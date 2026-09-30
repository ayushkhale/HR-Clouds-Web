// ─────────────────────────────────────────────────────────────────────────────
// GenderAvatar.jsx — THE avatar for a person, used everywhere in the app.
//
// Resolution order:
//   1. A real photo URL (`src`, or found on `person` — e.g. the S3 link in
//      `avatar_url`). If it fails to load, we fall through instead of showing
//      a broken image.
//   2. The generic male / female illustration, picked from the person's gender.
//   3. Purple initials when the gender is unknown — but only after asking the
//      organisation directory (EmployeeDirectoryContext), because most list
//      rows name a person without saying their gender. Without that, the same
//      person was an illustration on Team and "PP" on Live Attendance.
//
// The directory is asked whenever the row has NO PHOTO, even when it does carry
// a gender. It used to be asked only when BOTH were missing, so once the
// backend added `gender` to list rows (R-5) every one of those rows dropped
// straight to the illustration and real photos showed only on the few screens
// whose rows happened to carry `avatar_url` — the "photo here, no photo there"
// bug.
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
import { markDirectoryPhotosStale, useDirectoryEntry } from "../contexts/EmployeeDirectoryContext";
import { avatarUrlOf, genderOf, nestedPeople as nested, normalizeGender, personKeys } from "../utils/personFields";

// Re-exported: these read a person off a row and a dozen screens import them
// from here. They live in utils/personFields.js so the directory store can use
// them without importing a component.
export { avatarUrlOf, genderOf, normalizeGender };

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

export default function GenderAvatar({ person, gender, name, src, className = "w-full h-full", onPhotoError }) {
  const ownPhoto = src || avatarUrlOf(person);
  const ownGender = normalizeGender(gender) || genderOf(person);
  // Ask the directory whenever the row has no photo of its own — a row that
  // says a person's gender still doesn't say what they look like.
  const keys = ownPhoto ? [] : personKeys(person);
  const known = useDirectoryEntry(keys, keys.length > 0);
  const photo = ownPhoto || known?.photo || "";
  const displayName = name || nameOf(person);
  const g = ownGender || normalizeGender(known?.gender);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => { setPhotoFailed(false); }, [photo]);

  if (photo && !photoFailed) {
    return <img src={photo} alt={displayName || ""} onError={() => {
      setPhotoFailed(true);
      // A presigned S3 link that has expired. It may have come from the
      // directory OR from a roster row the directory handed the screen (a
      // picker option carries its whole row), so ask for fresh links either
      // way; the store rate-limits and ignores what it can't refresh. A blob
      // or data URL is a local preview and means nothing to the directory.
      if (/^https?:/i.test(photo)) markDirectoryPhotosStale();
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
