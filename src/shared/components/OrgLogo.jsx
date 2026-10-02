// ─────────────────────────────────────────────────────────────────────────────
// OrgLogo.jsx — an organisation's mark: its logo, else its initials, else a
// building icon. The organisation-side twin of GenderAvatar: a logo is a
// presigned or external link that can expire or be blocked, so a failed load
// falls through instead of leaving a broken-image icon. Never fall back to an
// image on someone else's server — the invitation page once used another
// company's hotlinked artwork, which ad blockers and expiry both broke.
//
// `onError` (optional) hears about a logo that failed, e.g. to fetch a fresh
// presigned link. Size and shape come from `className`.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { HiOfficeBuilding } from "react-icons/hi";

export default function OrgLogo({ logo, name, className = "w-10 h-10 rounded-xl", textClassName = "text-xs", onError }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [logo]);

  const initials = String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <span className={`${className} bg-purple-50 border border-purple-100 flex items-center justify-center overflow-hidden shrink-0`}>
      {logo && !failed ? (
        <img
          src={logo}
          alt={name || ""}
          className="w-full h-full object-contain"
          onError={() => { setFailed(true); onError?.(logo); }}
        />
      ) : initials ? (
        <span className={`${textClassName} font-bold text-purple-700`} aria-label={name}>{initials}</span>
      ) : (
        <HiOfficeBuilding className="w-1/2 h-1/2 text-purple-500" aria-hidden="true" />
      )}
    </span>
  );
}
