// ─────────────────────────────────────────────────────────────────────────────
// CompanyProfilePage.jsx — Company Profile: the organisation's own details —
// name, what it does, where it is, how many people it has and who to contact
// in HR. Read-only; mounted in all three workspaces (ORG_PATHS).
//
// Contract: GET /organizations/details (`public/ref docs/md_updates/
// 5_org_details_and_hierarchy_api.md` §1). Traps, each handled below:
// • `profile.gst_number` / `profile.company_pan_number` come back to HR ONLY.
//   For anyone else the keys are absent — not null — so the Tax & legal card
//   is gated on the KEY being present (`in`), never on the role. If the server
//   ever widens or narrows who sees them, this follows without a change.
// • `profile` can be null (an org with no profile row). The page still shows
//   the name from `organization` and says the details aren't on file, rather
//   than a grid of N/A.
// • `organization.key` is an internal slug and `organization.id` a UUID —
//   neither is shown (CLAUDE.md §4).
// • `stats` counts ACTIVE members only; invited-but-not-joined and
//   deactivated people aren't in it. The ⓘ on the headline says so, because
//   HR comparing it with the Team page's count will otherwise see a mismatch.
// • HR contact avatars are presigned for ~5 minutes; a page left open longer
//   falls back to the illustration (GenderAvatar), which is fine here.
//
// HR can also EDIT from here (`public/ref docs/6_org_profile_management_api.md`):
// the details (PATCH /organizations/profile) and the logo (its own two-step
// upload). Both are HR-only endpoints, so for everyone else the controls are
// absent rather than present-and-403 (CLAUDE.md §2), and both replies ARE the
// refreshed details payload — they replace `data` directly, so the page never
// re-reads and can never show a stale card after a save.
//
// • An uploaded logo is served as a presigned link that dies in ~5 minutes, so
//   `logoFailed` falls back to the initials and a save resets it. It is never
//   stored anywhere; the next read presigns a fresh one.
// • A payslip or letter PDF snapshots `logo_url` when it is generated. An
//   uploaded (key-only) logo does not reach those documents until payroll
//   adopts key resolution, so the dialog never promises it will.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOfficeBuilding,
  HiGlobeAlt,
  HiPhone,
  HiLocationMarker,
  HiCalendar,
  HiUsers,
  HiBriefcase,
  HiLockClosed,
  HiMail,
  HiShare,
  HiArrowRight,
  HiClipboardCopy,
  HiCheck,
  HiExternalLink,
  HiRefresh,
  HiExclamationCircle,
  HiIdentification,
  HiInformationCircle,
  HiPencil,
  HiPhotograph,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import EditCompanyProfileDialog from "../organization/EditCompanyProfileDialog";
import CompanyLogoDialog from "../organization/CompanyLogoDialog";
import { useAuth } from "../contexts/AuthContext";
import GenderAvatar from "../components/GenderAvatar";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { displayValue } from "../components/DetailDialog";
import { organizationAPI } from "../api";
import { organizationErrorMessage } from "../utils/organizationErrors";
import { useOrgPaths } from "../attendance/paths";
import { useCountUp } from "../motion";
import { fmtDate, ymdOnly } from "../attendance/dates";
import { ROLE_META } from "../organization/orgChartMeta";

const SURFACE = "organization.company_profile";

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const has = (v) => v !== null && v !== undefined && !(typeof v === "string" && !v.trim());

/** "acme.example" → "https://acme.example"; anything that isn't a web address → null. */
function websiteHref(raw) {
  const v = clean(raw);
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}
const websiteLabel = (raw) => String(raw || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** "51-200" → "51–200 people"; anything else is shown as written. */
function sizeLabel(raw) {
  const v = clean(raw);
  if (!v) return null;
  if (/^\d+\s*-\s*\d+$/.test(v)) return `${v.replace(/\s*-\s*/, "–")} people`;
  if (/^\d+\+$/.test(v)) return `${v} people`;
  return v;
}

function Card({ title, icon: Icon, help, action, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-purple-600 shrink-0" />}
          <span className="truncate">{title}</span>
          {help && <FieldHelp surface={help.surface} field={help.field} label={help.label || title} />}
        </h3>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Fact({ icon: Icon, label, children, empty }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <div className={`text-sm font-semibold mt-0.5 break-words ${empty ? "text-slate-400 font-medium" : "text-slate-800"}`}>{children}</div>
      </div>
    </div>
  );
}

function CopyValue({ value, label }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!has(value)) return <span className="text-slate-400 font-medium">N/A</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the value is still selectable */ }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono tracking-wide">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className="p-1 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
      >
        {copied ? <HiCheck className="w-4 h-4 text-violet-600" /> : <HiClipboardCopy className="w-4 h-4" />}
      </button>
    </span>
  );
}

function PeopleCard({ stats, chartPath }) {
  const total = Number(stats?.total_active_members) || 0;
  const parts = [
    { key: "hr", value: Number(stats?.hr_count) || 0 },
    { key: "manager", value: Number(stats?.manager_count) || 0 },
    { key: "employee", value: Number(stats?.employee_count) || 0 },
  ];
  const countRef = useCountUp(String(total));
  return (
    <Card title="People" icon={HiUsers} action={
      <Link to={chartPath} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800">
        Org Chart <HiArrowRight className="w-3.5 h-3.5" />
      </Link>
    }>
      <div className="flex items-end gap-2">
        <span ref={countRef} className="text-4xl font-bold text-slate-900 tabular-nums leading-none">{total}</span>
        <span className="text-sm font-semibold text-slate-500 pb-0.5">
          <HelpLabel text="active members" help={{ surface: SURFACE, field: "total_active_members", label: "active members" }} />
        </span>
      </div>

      {/* The split by role, as one bar. */}
      <div className="mt-5 h-3 w-full rounded-full bg-slate-100 overflow-hidden flex" role="img" aria-label={parts.map((p) => `${p.value} ${ROLE_META[p.key].label}`).join(", ")}>
        {total > 0 && parts.map((p) => p.value > 0 && (
          <span key={p.key} className={`${ROLE_META[p.key].dot} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <li key={p.key} className="min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${ROLE_META[p.key].dot}`} aria-hidden="true" />
              {p.key === "hr" ? "HR" : `${ROLE_META[p.key].label}s`}
            </span>
            <span className="block text-lg font-bold text-slate-900 tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-purple-50/60 border border-purple-100 px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700/80">Departments</p>
          <p className="text-xl font-bold text-slate-900 tabular-nums">{Number(stats?.department_count) || 0}</p>
        </div>
        <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700/80">Locations</p>
          <p className="text-xl font-bold text-slate-900 tabular-nums">{Number(stats?.location_count) || 0}</p>
        </div>
      </div>
    </Card>
  );
}

function HrContacts({ contacts }) {
  return (
    <Card title="HR contacts" icon={HiMail}>
      {contacts.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody has the HR role yet. Once someone does, they’ll be listed here for questions about pay, leave and documents.</p>
      ) : (
        <ul className="space-y-3">
          {contacts.map((c) => {
            const name = clean(c.name) || clean(c.email) || "A colleague";
            return (
              <li key={c.user_id || c.email || name} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/40">
                <span className="w-11 h-11 rounded-full overflow-hidden bg-purple-50 shrink-0 text-sm ring-2 ring-offset-2 ring-offset-white ring-purple-600">
                  <GenderAvatar person={c} name={name} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{name}</p>
                  <p className="text-xs text-slate-500 truncate">{[c.designation, c.work_location].filter(Boolean).join(" · ") || "HR"}</p>
                </div>
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="shrink-0 w-9 h-9 rounded-xl bg-white border border-slate-200 text-purple-600 hover:bg-purple-50 hover:border-purple-200 flex items-center justify-center transition-colors"
                    aria-label={`Email ${name}`}
                    title={c.email}
                  >
                    <HiMail className="w-4 h-4" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading company details">
      <div className="h-64 rounded-3xl bg-white border border-slate-100 overflow-hidden"><div className="h-32 bg-purple-200/60" /></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-72 rounded-2xl bg-white border border-slate-100" />
        <div className="h-72 rounded-2xl bg-white border border-slate-100" />
      </div>
    </div>
  );
}

export default function CompanyProfilePage() {
  const orgPaths = useOrgPaths();
  const { role } = useAuth();
  // Editing is an HR endpoint. For anyone else the buttons simply aren't there.
  const canEdit = String(role || "").toLowerCase() === "hr";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [changingLogo, setChangingLogo] = useState(false);
  const [saved, setSaved] = useState("");
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await organizationAPI.getOrganizationDetails();
      if (token !== requestRef.current) return;
      setData(res?.data || null);
    } catch (err) {
      if (token !== requestRef.current) return;
      setError(err);
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Both writes answer with the whole refreshed details payload, so the page
  // takes it as the new truth instead of reading again. A fresh payload also
  // carries a fresh presigned logo link, hence the reset.
  const applySaved = useCallback((details, message) => {
    if (details) {
      // This payload is newer than anything a read still in flight can bring
      // back, so retire that read's token — and its loading state with it.
      requestRef.current += 1;
      setData(details);
      setLogoFailed(false);
      setError(null);
      setLoading(false);
    }
    setSaved(message);
  }, []);

  // The confirmation clears itself; it says what changed, so it isn't a toast
  // that has to be dismissed.
  useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(""), 6000);
    return () => clearTimeout(timer);
  }, [saved]);

  const org = data?.organization || {};
  const profile = data?.profile || null;
  const p = profile || {};
  const name = clean(org.name) || clean(p.org_name) || "Your organisation";
  const alias = clean(p.org_alias);
  const site = websiteHref(p.website);
  const size = sizeLabel(p.size);
  const joined = org.created_at ? fmtDate(ymdOnly(org.created_at), { month: "long", year: "numeric" }, null) : null;
  const addressLines = [
    [p.address_line_1, p.address_line_2].map(clean).filter(Boolean).join(", "),
    [p.city, p.state, p.zip_code].map(clean).filter(Boolean).join(", "),
    clean(p.country),
  ].filter(Boolean);
  const mapsHref = addressLines.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(", "))}` : null;
  // Present only for HR — the key, not the value, decides (see header).
  const showStatutory = !!profile && ("gst_number" in profile || "company_pan_number" in profile);
  const contacts = Array.isArray(data?.hr_contacts) ? data.hr_contacts : [];
  const logo = clean(p.logo_url) && !logoFailed ? clean(p.logo_url) : null;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <>
      <DashboardTopBar title="Company Profile" />

      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Company Profile</h1>
            <p className="text-sm text-slate-500 mt-1">Who we are, where we are and who to talk to in HR.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
            {canEdit && !loading && !error && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 text-sm font-bold shadow-2xs transition-colors"
              >
                <HiPencil className="w-4 h-4" /> Edit details
              </button>
            )}
            <Link
              to={orgPaths.chart}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold shadow-sm transition-colors"
            >
              <HiShare className="w-4 h-4 rotate-90" /> Open the Org Chart
            </Link>
          </div>
        </div>

        {saved && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm text-violet-900">
            <HiCheck className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <p>{saved}</p>
          </div>
        )}

        {loading ? (
          <PageSkeleton />
        ) : error ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 flex flex-col items-center justify-center text-center gap-3 py-16 px-4" role="alert">
            <span className="w-12 h-12 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center"><HiExclamationCircle className="w-6 h-6" /></span>
            <p className="text-sm font-semibold text-slate-700 max-w-md">{organizationErrorMessage(error, "Couldn’t load the company details.")}</p>
            <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
              <HiRefresh className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        ) : (
          <>
            {/* ── Hero ── */}
            <section className="relative bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="relative h-32 sm:h-36 bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] overflow-hidden">
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle,_rgba(255,255,255,0.55)_1px,_transparent_1px)] [background-size:18px_18px]" aria-hidden="true" />
                <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/10" aria-hidden="true" />
                <div className="absolute right-40 -bottom-24 w-56 h-56 rounded-full bg-white/5" aria-hidden="true" />
                {org.status && (
                  <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/25 text-white text-[10px] font-bold uppercase tracking-wider">
                    <span className={`w-1.5 h-1.5 rounded-full ${org.status === "active" ? "bg-violet-200" : "bg-rose-300"}`} aria-hidden="true" />
                    {org.status === "active" ? "Active" : String(org.status).replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {/* Its own layer, or the cover band above paints over the overlapping logo. */}
              <div className="relative z-10 px-5 sm:px-8 pb-6">
                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
                  <div className="relative -mt-12 shrink-0">
                    <div className="w-24 h-24 rounded-3xl bg-white border-4 border-white shadow-lg flex items-center justify-center overflow-hidden">
                      {logo ? (
                        <img src={logo} alt={`${name} logo`} className="w-full h-full object-contain p-2" onError={() => setLogoFailed(true)} />
                      ) : (
                        <span className="w-full h-full rounded-[1.1rem] bg-gradient-to-br from-purple-100 to-purple-300 text-purple-800 text-2xl font-bold flex items-center justify-center">{initials || <HiOfficeBuilding className="w-9 h-9" />}</span>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setChangingLogo(true)}
                        aria-label={logo ? "Change the company logo" : "Add a company logo"}
                        title={logo ? "Change the company logo" : "Add a company logo"}
                        className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-purple-600 hover:bg-purple-700 text-white border-2 border-white shadow-md flex items-center justify-center transition-colors"
                      >
                        <HiPhotograph className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 md:pt-4">
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight break-words">{name}</h2>
                    {alias && alias !== name && <p className="text-sm text-slate-500 mt-0.5">Also known as {alias}</p>}
                  </div>
                  {(site || p.phone_number) && (
                    <div className="flex flex-wrap gap-2 md:pt-4">
                      {site && (
                        <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold hover:bg-purple-100 transition-colors">
                          <HiGlobeAlt className="w-4 h-4" /> Visit website <HiExternalLink className="w-3.5 h-3.5 opacity-70" />
                        </a>
                      )}
                      {has(p.phone_number) && (
                        <a href={`tel:${String(p.phone_number).replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors">
                          <HiPhone className="w-4 h-4" /> {p.phone_number}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {[
                    has(p.industry) && { icon: HiBriefcase, text: p.industry },
                    size && { icon: HiUsers, text: size },
                    has(p.founded_year) && { icon: HiCalendar, text: `Founded ${p.founded_year}` },
                    (has(p.city) || has(p.country)) && { icon: HiLocationMarker, text: [p.city, p.country].map(clean).filter(Boolean).join(", ") },
                  ].filter(Boolean).map(({ icon: Icon, text }) => (
                    <span key={text} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                      <Icon className="w-3.5 h-3.5 text-purple-500" /> {text}
                    </span>
                  ))}
                  {joined && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-100 text-xs font-semibold text-purple-700">
                      On HR Clouds since {joined}
                    </span>
                  )}
                </div>

                {has(p.description) && (
                  <p className="mt-5 text-sm leading-relaxed text-slate-600 max-w-3xl whitespace-pre-line">{p.description}</p>
                )}
              </div>
            </section>

            {!profile && (
              <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
                <HiInformationCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p>The company’s details — what it does, its address and website — aren’t on file yet. The people counts and HR contacts below are still up to date.</p>
                  {canEdit && (
                    <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 underline underline-offset-2">
                      <HiPencil className="w-3.5 h-3.5" /> Add the company details
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6 min-w-0">
                {profile && (
                  <Card title="About the company" icon={HiOfficeBuilding}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <Fact icon={HiBriefcase} label="Industry" empty={!has(p.industry)}>{displayValue(p.industry)}</Fact>
                      <Fact icon={HiUsers} label="Company size" empty={!size}>{displayValue(size)}</Fact>
                      <Fact icon={HiCalendar} label="Founded" empty={!has(p.founded_year)}>{displayValue(p.founded_year)}</Fact>
                      <Fact icon={HiGlobeAlt} label="Website" empty={!site}>
                        {site ? <a href={site} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:underline break-all">{websiteLabel(p.website)}</a> : "N/A"}
                      </Fact>
                      <Fact icon={HiPhone} label="Phone" empty={!has(p.phone_number)}>{displayValue(p.phone_number)}</Fact>
                      <Fact icon={HiIdentification} label="Short name" empty={!alias}>{displayValue(alias)}</Fact>
                    </div>
                  </Card>
                )}

                {profile && (
                  <Card
                    title="Address"
                    icon={HiLocationMarker}
                    action={mapsHref && (
                      <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800">
                        Open in Maps <HiExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  >
                    {addressLines.length ? (
                      <div className="flex items-start gap-4">
                        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-purple-300/50">
                          <HiLocationMarker className="w-6 h-6" />
                        </span>
                        <address className="not-italic text-sm leading-relaxed text-slate-700">
                          {addressLines.map((line) => <span key={line} className="block">{line}</span>)}
                        </address>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No address on file yet.</p>
                    )}
                  </Card>
                )}

                {showStatutory && (
                  <Card
                    title="Tax & legal registration"
                    icon={HiLockClosed}
                    action={<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500"><HiLockClosed className="w-3 h-3" /> HR only</span>}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="min-w-0">
                        <div className="flex items-center">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">GSTIN</p>
                          <FieldHelp surface={SURFACE} field="gst_number" label="a GSTIN" size="sm" />
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-800"><CopyValue value={clean(p.gst_number)} label="GSTIN" /></div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Company PAN</p>
                          <FieldHelp surface={SURFACE} field="company_pan_number" label="a company PAN" size="sm" />
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-800"><CopyValue value={clean(p.company_pan_number)} label="company PAN" /></div>
                      </div>
                    </div>
                  </Card>
                )}
              </div>

              <div className="space-y-6 min-w-0">
                <PeopleCard stats={data?.stats} chartPath={orgPaths.chart} />
                <HrContacts contacts={contacts} />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Siblings of the page, not of a card, so nothing clips them. */}
      {editing && (
        <EditCompanyProfileDialog
          details={data}
          onClose={() => setEditing(false)}
          onSaved={(details, renamed) => {
            setEditing(false);
            applySaved(details, renamed ? "Company details saved. The new name is used across the app." : "Company details saved.");
          }}
        />
      )}
      {changingLogo && (
        <CompanyLogoDialog
          currentLogo={logo}
          companyName={name}
          onClose={() => setChangingLogo(false)}
          onSaved={(details) => {
            setChangingLogo(false);
            applySaved(details, "The company logo has been updated.");
          }}
        />
      )}
    </>
  );
}
