// ─────────────────────────────────────────────────────────────────────────────
// OrgSettingsHistoryPage.jsx — the settings change history, on its own page
// (#248).
//
// It used to be the sixth tab on a strip. Once every group became a page of
// its own, a tab strip that moved only this one thing was a control that did
// nothing for five of its six positions — so the history became a page too and
// the strip went. Everything in the settings list now behaves the same way:
// you click a name, you get a page, you come back. That sameness is the point.
//
// HR ONLY, and reached only from a row the list shows to HR — #248 is guarded
// `authorize(['hr'])` and a manager gets 403. The route exists under the
// manager prefix all the same, because a manager who types the URL should meet
// the panel's own "not yours to see" rather than a dead route (§2 is about not
// OFFERING what a role lacks, which the list already honours).
// ─────────────────────────────────────────────────────────────────────────────

import { HiChevronRight, HiCog } from "react-icons/hi";
import { Link } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import Skeleton from "../components/Skeleton";
import { ErrorState } from "../attendance/ui";
import { useCurrentWorkspace } from "../attendance/paths";
import useSettingsHub from "../settings/useSettingsHub";
import SettingsHistoryPanel from "../settings/SettingsHistoryPanel";

const SURFACE = "settings.hub";

export default function OrgSettingsHistoryPage() {
  const workspace = useCurrentWorkspace();
  const { groups, entries, groupsByKey, loading, error, reload } = useSettingsHub();
  const listPath = workspace ? `/dashboard/${workspace}/settings` : "/";

  return (
    <>
      <DashboardTopBar title="Change history" />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 max-w-7xl w-full mx-auto space-y-5">
        <nav className="flex flex-wrap items-center gap-2 text-xs sm:text-sm" aria-label="Breadcrumb">
          <Link
            to={listPath}
            className="font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
          >
            <HiCog className="w-4 h-4" /> Company Settings
          </Link>
          <HiChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span className="font-semibold text-slate-900">Change history</span>
        </nav>

        {loading ? (
          <Skeleton type="table" rows={6} />
        ) : error ? (
          <ErrorState error={{ message: error }} onRetry={reload} fallback="We couldn’t load your settings." />
        ) : (
          <SettingsHistoryPanel
            groups={groups}
            entries={entries}
            groupsByKey={groupsByKey}
            surface={SURFACE}
          />
        )}
      </main>
    </>
  );
}
