// ─────────────────────────────────────────────────────────────────────────────
// DashboardCard.jsx — the card shell and header every dashboard card uses.
//
// Lived in ManagerDashboard until HR grew the same punch card and needed the
// identical shell (CLAUDE.md §2: a manager promoted to HR must find the same
// screen, not a near-copy). Kept here so the two can't drift apart — a tweak to
// the header lands in both dashboards at once.
//
// `icon` and `divider` are opt-in: only the punch card wears them, so the other
// cards on a dashboard keep their plainer heading.
// ─────────────────────────────────────────────────────────────────────────────

export const CARD = "bg-white rounded-3xl p-6 shadow-xs border border-slate-100";

/** The one header every dashboard card uses: title, a quiet subtitle, one action. */
export default function CardHeader({ title, subtitle, action, icon: Icon, divider = false }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${divider ? "mb-5 pb-4 border-b border-slate-100" : "mb-5"}`}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>}
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-800 leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] font-semibold text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
