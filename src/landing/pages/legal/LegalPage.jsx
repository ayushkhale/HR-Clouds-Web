import { Link } from "react-router-dom";
import { COMPANY, POLICY_LAST_UPDATED, hasEntityDetails } from "../../../shared/config/company";

/* ─── Prose primitives ─────────────────────────────────────────────────────
   Legal text is long and mostly unstyled, so these keep spacing and rhythm
   consistent across the four documents without a prose plugin.
──────────────────────────────────────────────────────────────────────────── */

export function Section({ title, children }) {
  return (
    <section className="mb-10 scroll-mt-28">
      <h2 className="font-bold text-xl sm:text-2xl text-primary-800 tracking-tight mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-gray-600 text-sm sm:text-base leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }) {
  return (
    <ul className="space-y-2 pl-5 list-disc marker:text-purple-400">
      {items.map((item, i) => (
        <li key={i} className="leading-relaxed">{item}</li>
      ))}
    </ul>
  );
}

const LEGAL_LINKS = [
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/terms", label: "Terms of Service" },
  { to: "/legal/cookies", label: "Cookie Policy" },
  { to: "/legal/statutory", label: "Statutory Guidelines" },
];

/**
 * Shared shell for every legal document: purple hero, centred column of prose,
 * cross-links to the sibling policies, and the entity block when the company
 * details in company.js have been filled in.
 */
function LegalPage({ title, summary, children }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative bg-primary-500 overflow-hidden pt-32 pb-16 sm:pt-36 sm:pb-20">
        <div className="left-[-10%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-10 blur-3xl rounded-[50%] w-[40rem] h-40 -rotate-45 pointer-events-none" />
        <div className="bottom-0 right-[-10%] absolute bg-gradient-to-r from-purple-500/20 to-transparent blur-3xl rounded-[50%] w-[35rem] h-40 pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-8">
          <p className="text-purple-200 text-xs font-bold uppercase tracking-widest mb-3">
            Legal
          </p>
          <h1 className="font-bold text-3xl sm:text-5xl text-white tracking-tight mb-4">
            {title}
          </h1>
          {summary && (
            <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-2xl">
              {summary}
            </p>
          )}
          <p className="mt-6 text-white/50 text-xs">
            Last updated {POLICY_LAST_UPDATED}
          </p>
        </div>
      </section>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-14 sm:py-20">
        {children}

        {hasEntityDetails() && (
          <Section title="The entity behind HR Clouds">
            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 text-sm space-y-1">
              {COMPANY.legalName && (
                <p><span className="font-semibold text-primary-800">{COMPANY.legalName}</span></p>
              )}
              {COMPANY.registeredAddress && <p>{COMPANY.registeredAddress}</p>}
              {COMPANY.cin && <p>CIN: {COMPANY.cin}</p>}
              {COMPANY.gstin && <p>GSTIN: {COMPANY.gstin}</p>}
            </div>
          </Section>
        )}

        {/* Sibling policies */}
        <div className="mt-14 pt-8 border-t border-gray-200">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
            Other policies
          </p>
          <div className="flex flex-wrap gap-3">
            {LEGAL_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="px-4 py-2 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LegalPage;
