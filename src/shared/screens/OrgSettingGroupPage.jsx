// ─────────────────────────────────────────────────────────────────────────────
// OrgSettingGroupPage.jsx — ONE group of settings, on its own page
// (#242/#244 to read it, #246/#247 to change it).
//
// WHY THIS PAGE EXISTS. Company Settings used to be a tab strip over a stack
// of shutters: five tabs across the top, up to fifteen collapsible cards
// below, and the thing you actually wanted three clicks deep inside one of
// them. Every rule was reachable and almost none of it was findable. This is
// the master-detail shape the rest of the product already uses — Employees →
// one employee, Departments → one department — because a layman does not have
// to learn it: a list of names, you click a name, you get that one thing on a
// page of its own, you come back.
//
// The list is OrgSettingsPage; this is the detail. The pair follows
// EmployeeProfilePage exactly: a breadcrumb back to the list, the record's
// name as the page title, and nothing else competing with it.
//
// Shared by HR and the manager (§2), one component, no fork — and mounted
// under each workspace's own prefix so following a link never crosses the
// route gate. The server projects: a group a manager may not read comes back
// in `unavailable_groups` and the card says so, exactly as it does in the list.
//
// A group key that isn't in the catalogue is NOT an error page — it is almost
// always a stale bookmark from before a release renamed something, so it says
// that plainly and offers the list.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { HiChevronRight, HiCog } from "react-icons/hi";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import Skeleton from "../components/Skeleton";
import { ErrorState, Toast, useToast } from "../attendance/ui";
import { useCurrentWorkspace } from "../attendance/paths";
import FieldHelp from "../fieldHelp/FieldHelp";
import useSettingsHub from "../settings/useSettingsHub";
import { editRouteFor, groupBlurb, moduleLabel } from "../settings/settingsMeta";
import SettingsGroupForm from "../settings/SettingsGroupForm";

const SURFACE = "settings.hub";

export default function OrgSettingGroupPage() {
  const { groupKey } = useParams();
  const workspace = useCurrentWorkspace();
  const navigate = useNavigate();
  const { toast, showToast, clearToast } = useToast();

  const {
    groups, entriesByGroup, loading, error, reload, applyWrite,
  } = useSettingsHub();

  /** Every link on this page is prefixed with the reader's own workspace. */
  const inWorkspace = (path) => (workspace ? `/dashboard/${workspace}${path}` : null);
  const listPath = inWorkspace("/settings") || "/";

  const group = useMemo(
    () => groups.find((g) => g.key === groupKey) || null,
    [groups, groupKey],
  );
  const rows = group ? entriesByGroup[group.key] || [] : [];
  const route = group ? editRouteFor(group) : null;
  const blurb = group ? groupBlurb(group) : null;

  return (
    <>
      <DashboardTopBar title={group?.label || "Settings"} />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 max-w-5xl w-full mx-auto space-y-5">
        {/* The same breadcrumb shape the employee profile uses, so coming
            back is in the place people already look for it. */}
        <nav className="flex flex-wrap items-center gap-2 text-xs sm:text-sm" aria-label="Breadcrumb">
          <Link
            to={listPath}
            className="font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
          >
            <HiCog className="w-4 h-4" /> Company Settings
          </Link>
          <HiChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          {group ? (
            <>
              <span className="text-slate-400">{moduleLabel(group.module_key)}</span>
              <HiChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
              <span className="font-semibold text-slate-900">{group.label}</span>
            </>
          ) : (
            <span className="font-semibold text-slate-900">Setting</span>
          )}
        </nav>

        {loading ? (
          <Skeleton type="table" rows={6} />
        ) : error ? (
          <ErrorState error={{ message: error }} onRetry={reload} fallback="We couldn’t load your settings." />
        ) : !group ? (
          // A renamed or withdrawn group. Not a failure, and not a 404 page:
          // the list is one click away and almost certainly has what they want.
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-6">
            <h1 className="text-base font-bold text-slate-900">That setting has moved</h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              It isn’t where this link points any more — it may have been renamed, or it may belong to a part of the product your plan doesn’t include.
            </p>
            <button
              type="button"
              onClick={() => navigate(listPath)}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 transition"
            >
              Back to Company Settings
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-slate-900">{group.label}</h1>
                <FieldHelp surface={SURFACE} field={`tab.${group.module_key}`} label={`the ${moduleLabel(group.module_key)} settings`} className="mb-0 ml-1" />
              </div>
              {/* On its own page the sentence finally has room to be read,
                  which is the other half of why it left the list. */}
              {blurb && <p className="text-sm text-slate-500 mt-1 leading-relaxed">{blurb}</p>}
            </div>

            <SettingsGroupForm
              standalone
              group={group}
              entries={rows}
              editTo={route ? { ...route, path: inWorkspace(route.path) } : null}
              onSaved={applyWrite}
              onReload={() => reload()}
              showToast={showToast}
              surface={SURFACE}
            />
          </>
        )}
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
