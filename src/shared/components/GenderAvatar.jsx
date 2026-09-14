// ─────────────────────────────────────────────────────────────────────────────
// GenderAvatar.jsx — One fixed male and one fixed female illustration (same
// react-nice-avatar library, purple theme, black hair), picked from the gender
// the backend returns. Anyone without a male/female value gets purple initials
// rather than a guessed illustration.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Avatar, { genConfig } from "react-nice-avatar";

const BASE = {
  faceColor: "#F9C9B6",
  earSize: "small",
  hairColor: "#000000",
  hatStyle: "none",
  eyeStyle: "circle",
  glassesStyle: "none",
  noseStyle: "short",
  mouthStyle: "smile",
  bgColor: "linear-gradient(135deg, #EDE9FE 0%, #C4B5FD 100%)",
  isGradient: true,
};

// Built once through genConfig (the library's own normaliser) so the component
// only receives real avatar fields and every card renders the identical face.
const MALE = genConfig({ ...BASE, sex: "man", hairStyle: "normal", eyeBrowStyle: "up", shirtStyle: "polo", shirtColor: "#6D28D9" });
const FEMALE = genConfig({ ...BASE, sex: "woman", hairStyle: "womanLong", eyeBrowStyle: "upWoman", shirtStyle: "short", shirtColor: "#7C3AED" });

/** "Male" / "M" / "man" → "male"; "Female" / "F" / "woman" → "female"; else null. */
export function normalizeGender(value) {
  const g = String(value || "").trim().toLowerCase();
  if (["male", "m", "man"].includes(g)) return "male";
  if (["female", "f", "woman"].includes(g)) return "female";
  return null;
}

/** Gender from flat or nested profile shapes. */
export function genderOf(person) {
  if (!person || typeof person !== "object") return null;
  return normalizeGender(
    person.gender ?? person.profile?.gender ?? person.user?.gender ?? person.user?.profile?.gender
      ?? person.employee_profile?.gender ?? person.manager_profile?.gender ?? person.hr_profile?.gender
  );
}

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

export default function GenderAvatar({ gender, name, src, className = "w-full h-full" }) {
  if (src) return <img src={src} alt={name || ""} className={`${className} object-cover`} />;
  const g = normalizeGender(gender);
  if (g) return <Avatar className={className} {...(g === "female" ? FEMALE : MALE)} />;
  return (
    <div className={`${className} flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-300 text-purple-800 font-bold`} role="img" aria-label={name || "Avatar"}>
      <span className="text-sm leading-none">{initialsOf(name)}</span>
    </div>
  );
}
