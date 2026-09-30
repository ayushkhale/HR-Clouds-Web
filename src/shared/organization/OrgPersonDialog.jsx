// ─────────────────────────────────────────────────────────────────────────────
// organization/OrgPersonDialog.jsx — One person on the org chart, opened from
// a card (Chart view) or a row (List view). The house record inspector
// (DetailDialog, CLAUDE.md §3), not a hand-rolled popover.
//
// It answers the three questions people open an org chart for: who is this,
// who do they report to, and who reports to them. The reporting line and the
// direct reports are buttons that move the dialog to that person, so you can
// walk the organisation without closing it; "Show in chart" closes it and
// brings the person into view with their line highlighted.
//
// Everything comes from the hierarchy payload already loaded — no request per
// person. It is public-safe by contract (no address, PAN, DOB), so nothing
// here needs a role check except where "Open profile" may go:
//   HR → the employee profile · manager → only their own direct reports (the
//   member profile 403s for anyone else) · everyone → their own My Profile.
// A link that would 403 is left out, not shown broken (CLAUDE.md §2).
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import {
  HiUserCircle,
  HiUsers,
  HiUserGroup,
  HiChartBar,
  HiMail,
  HiChevronRight,
  HiOfficeBuilding,
  HiLocationMarker,
  HiEye,
  HiExternalLink,
} from "react-icons/hi";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats } from "../components/DetailDialog";
import GenderAvatar from "../components/GenderAvatar";
import { ancestorsOf, departmentTone, levelLabel, roleMetaOf } from "./orgChartMeta";

const SURFACE = "organization.org_chart";

function profileLinkFor(node, { myId, workspace }) {
  if (node.id === myId) return { to: "/dashboard/profile", label: "Open My Profile" };
  if (workspace === "hr") return { to: `/dashboard/hr/employees/${encodeURIComponent(node.id)}`, label: "Open profile" };
  if (workspace === "manager" && node.parentId && node.parentId === myId) {
    return { to: `/dashboard/manager/team/member/${encodeURIComponent(node.id)}`, label: "Open profile" };
  }
  return null;
}

function PersonChip({ node, current = false, onClick }) {
  const role = roleMetaOf(node.role);
  const body = (
    <>
      <span className={`w-6 h-6 rounded-full overflow-hidden bg-purple-50 shrink-0 text-[9px] ring-2 ring-offset-1 ring-offset-white ${role.ring}`}>
        <GenderAvatar person={node} name={node.name} />
      </span>
      <span className="min-w-0 text-left">
        <span className={`block text-xs font-bold truncate max-w-[10rem] ${current ? "text-white" : "text-slate-800"}`}>{node.name}</span>
        <span className={`block text-[10px] truncate max-w-[10rem] ${current ? "text-purple-100" : "text-slate-500"}`}>{node.designation || role.label}</span>
      </span>
    </>
  );
  if (current) {
    return <span className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-purple-600 shadow-sm shadow-purple-300/50">{body}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      {body}
    </button>
  );
}

const Arrow = () => <HiChevronRight className="w-4 h-4 text-purple-300 shrink-0" aria-hidden="true" />;

export default function OrgPersonDialog({ index, personId, companyName, myId, workspace, onClose, onNavigate, onShowInChart }) {
  const node = index?.byId.get(personId);
  if (!node) return null;
  const role = roleMetaOf(node.role);
  const tone = departmentTone(node.department);
  const chain = ancestorsOf(index, node.id);
  const manager = chain[chain.length - 1] || null;
  const isMe = node.id === myId;
  const profile = profileLinkFor(node, { myId, workspace });
  const reports = node.children;

  const reportsTo = manager ? manager.name : node.formerManager ? "Someone no longer active" : "Nobody — top of the chart";

  return (
    <DetailDialog
      eyebrow={role.label}
      icon={HiUserCircle}
      title={node.name}
      subtitle={[node.designation, node.department].filter(Boolean).join(" · ") || "No job title yet"}
      badge={isMe ? <DetailPill tone="solid">You</DetailPill> : null}
      width="medium"
      onClose={onClose}
      footer={
        <>
          {node.email && !isMe && (
            <a
              href={`mailto:${node.email}`}
              className="mr-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <HiMail className="w-4 h-4" /> Send an email
            </a>
          )}
          {profile && (
            <Link
              to={profile.to}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors"
            >
              <HiExternalLink className="w-4 h-4" /> {profile.label}
            </Link>
          )}
          <button
            type="button"
            onClick={() => onShowInChart(node.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-sm"
          >
            <HiEye className="w-4 h-4" /> Show in chart
          </button>
        </>
      }
    >
      {/* Who this is, at a glance. */}
      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 rounded-2xl bg-gradient-to-r from-purple-50 via-violet-50/60 to-white border border-purple-100 p-5">
        <span className={`w-20 h-20 rounded-full overflow-hidden bg-white shrink-0 text-2xl ring-4 ring-offset-2 ring-offset-purple-50 shadow-md ${role.ring}`}>
          <GenderAvatar person={node} name={node.name} />
        </span>
        <div className="min-w-0 text-center sm:text-left space-y-2">
          <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${role.soft}`}>{role.label}</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${tone.chip}`}>
              <HiOfficeBuilding className="w-3 h-3" /> {node.department || "No department"}
            </span>
            {node.work_location && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-600">
                <HiLocationMarker className="w-3 h-3" /> {node.work_location}
              </span>
            )}
          </div>
          {node.email && (
            <a href={`mailto:${node.email}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:underline break-all">
              <HiMail className="w-3.5 h-3.5 shrink-0" /> {node.email}
            </a>
          )}
        </div>
      </div>

      <DetailSection title="Reporting line" icon={HiChartBar} collapsible={false} help={{ surface: SURFACE, field: "reporting_to_id" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-slate-50 border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0"><HiOfficeBuilding className="w-3.5 h-3.5" /></span>
            <span className="text-xs font-bold text-slate-700 truncate max-w-[10rem]">{companyName || "Organisation"}</span>
          </span>
          {node.formerManager && (
            <>
              <Arrow />
              <span className="inline-flex items-center px-3 py-1.5 rounded-full border border-dashed border-fuchsia-300 bg-fuchsia-50 text-[11px] font-semibold text-fuchsia-700">
                Someone no longer active
              </span>
            </>
          )}
          {chain.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-2">
              <Arrow />
              <PersonChip node={a} onClick={() => onNavigate(a.id)} />
            </span>
          ))}
          <Arrow />
          <PersonChip node={node} current />
        </div>
      </DetailSection>

      <DetailStats
        items={[
          { label: "Direct reports", value: reports.length, icon: HiUsers },
          { label: "Whole team", value: node.teamSize, icon: HiUserGroup, help: { surface: SURFACE, field: "team_size" } },
          { label: "Place in chart", value: levelLabel(node), icon: HiChartBar, help: { surface: SURFACE, field: "level" } },
        ]}
      />

      <DetailSection title="Details" icon={HiUserCircle}>
        <DetailGrid
          cols={3}
          items={[
            { label: "Job title", value: node.designation },
            { label: "Department", value: node.department },
            { label: "Work location", value: node.work_location },
            { label: "Employee code", value: node.employee_code, mono: true },
            { label: "Reports to", value: reportsTo },
            { label: "Work email", value: node.email },
          ]}
        />
      </DetailSection>

      {reports.length > 0 && (
        <DetailSection title={`Direct reports (${reports.length})`} icon={HiUsers} defaultOpen={reports.length <= 12}>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {reports.map((c) => {
              const cr = roleMetaOf(c.role);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(c.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-200/80 bg-white hover:border-purple-300 hover:bg-purple-50/60 transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <span className={`w-9 h-9 rounded-full overflow-hidden bg-purple-50 shrink-0 text-xs ring-2 ring-offset-1 ring-offset-white ${cr.ring}`}>
                      <GenderAvatar person={c} name={c.name} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-slate-900 truncate">{c.name}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{c.designation || cr.label}</span>
                    </span>
                    {c.children.length > 0 && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold">{c.teamSize} in team</span>
                    )}
                    <HiChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </DetailSection>
      )}
    </DetailDialog>
  );
}
