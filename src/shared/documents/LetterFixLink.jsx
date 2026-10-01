// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterFixLink.jsx — "Go and fix it" under a letter refusal.
//
// Three refusals mean the letter can't be issued until somebody changes a
// setting on another screen, and each screen is a different one (letter
// change record §5):
//   LETTER_TEMPLATE_DISABLED        → Letter Templates (switch the letter on)
//   DOCUMENT_TYPE_NOT_ACTIVATED /
//   DOCUMENT_TYPE_INACTIVE          → Document Types › Catalog › organisation
// A new letter needs BOTH steps, so whichever one is missing is linked
// directly rather than described. Links are HR-only screens, so the manager's
// proposal form passes `hrOnly={false}` and gets the words without the link.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import { HiArrowRight } from "react-icons/hi";
import { documentErrorCode } from "../utils/documentErrors";

const FIXES = {
  LETTER_TEMPLATE_DISABLED: { to: "/dashboard/hr/documents/letter-templates", label: "Open Letter Templates" },
  TEMPLATE_DISABLED: { to: "/dashboard/hr/documents/letter-templates", label: "Open Letter Templates" },
  DOCUMENT_TYPE_NOT_ACTIVATED: { to: "/dashboard/hr/documents/types?tab=catalog&plane=org", label: "Open the document catalog" },
  DOCUMENT_TYPE_INACTIVE: { to: "/dashboard/hr/documents/types", label: "Open Document Types" },
};

/** The fix for this refusal, or null. */
const letterFixFor = (err) => FIXES[documentErrorCode(err)] || null;

export default function LetterFixLink({ err, onNavigate, hrOnly = true }) {
  const fix = letterFixFor(err);
  if (!fix || !hrOnly) return null;
  return (
    <Link
      to={fix.to}
      onClick={onNavigate}
      className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline"
    >
      {fix.label} <HiArrowRight className="w-3.5 h-3.5" />
    </Link>
  );
}
