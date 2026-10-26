// ─────────────────────────────────────────────────────────────────────────────
// NotificationRow.jsx — one notification in the bell panel and mobile feed,
// plus the small presentational pieces the full page reuses.
//
// ─── HIGH-CONTRAST READ VS UNREAD VISUAL HIERARCHY ───────────────────────────
// Unread:
//   · Left border accent: 3px solid #7C3AED (brand purple)
//   · Subtle purple surface tint (bg-purple-50/40)
//   · 8px solid purple dot beside title
//   · Title weight: font-bold text-slate-900
// Read:
//   · Pure white/transparent surface
//   · No unread dot or accent border
//   · Muted icon container
//   · Title weight: font-medium text-slate-700
// ─────────────────────────────────────────────────────────────────────────────

import { HiX, HiExternalLink } from "react-icons/hi";
import { actorLabel, categoryLabel, categoryMeta } from "./notificationMeta";
import { sinceLabel } from "../attendance/liveLocationMeta";
import { fmtDateTime } from "../attendance/dates";

/** The round icon chip that says which part of the product this came from. */
export function CategoryIcon({ category, muted = false, className = "w-9 h-9" }) {
  const meta = categoryMeta(category);
  const Icon = meta.icon;
  const activeClass = meta.iconBgClasses || "bg-purple-50 border-purple-100 text-purple-600";
  return (
    <span
      className={`${className} rounded-xl flex items-center justify-center shrink-0 border ${
        muted ? "bg-slate-50 border-slate-100 text-slate-400" : activeClass
      }`}
      aria-hidden="true"
    >
      <Icon className="w-[55%] h-[55%]" />
    </span>
  );
}

/** Semantic colored category badge for table cells, cards, and inspectors. */
export function CategoryPill({ category, className = "" }) {
  const meta = categoryMeta(category);
  const badgeClasses = meta.badgeClasses || "bg-slate-50 border-slate-200 text-slate-600";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${badgeClasses} ${className}`}
    >
      {categoryLabel(category)}
    </span>
  );
}

/** "2 hours ago", with the exact moment on hover and WCAG AA contrast. */
export function NotificationTime({ iso, className = "text-slate-500" }) {
  return (
    <time dateTime={iso || undefined} title={fmtDateTime(iso)} className={className}>
      {sinceLabel(iso)}
    </time>
  );
}

/** Shaped like the rows it replaces, so the panel doesn't jump when they land. */
export function NotificationSkeleton({ rows = 4 }) {
  return (
    <div className="divide-y divide-slate-50" aria-busy="true" aria-label="Loading notifications">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3.5">
          <div className="w-9 h-9 rounded-xl bg-slate-100 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-2 py-0.5">
            <div className="h-3 w-2/5 rounded bg-slate-100 animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-slate-100/80 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{
 *   notification: object,
 *   onOpen: () => void,           // opens inspector or navigates
 *   onDismiss?: () => void,       // clears the notification
 *   onQuickOpen?: () => void,     // direct 1-click navigate
 *   quickOpenLabel?: string,
 * }} props
 */
export default function NotificationRow({
  notification,
  onOpen,
  onDismiss,
  onQuickOpen,
  quickOpenLabel = "Open item",
}) {
  const { category, title, message, actorName, createdAt, isRead } = notification;

  return (
    <li className="relative group">
      <button
        type="button"
        onClick={onOpen}
        className={`w-full text-left flex items-start gap-3 pl-4 pr-14 py-3.5 transition-colors outline-none focus-visible:bg-purple-50/70 hover:bg-purple-50/40 cursor-pointer ${
          isRead ? "bg-white" : "bg-purple-50/35"
        }`}
      >
        {/* The unread edge: 3px solid brand-purple accent */}
        <span
          className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors ${
            isRead ? "bg-transparent" : "bg-purple-600"
          }`}
          aria-hidden="true"
        />

        <CategoryIcon category={category} muted={isRead} />

        <span className="flex-1 min-w-0">
          <span className="flex items-start gap-2">
            <span
              className={`flex-1 min-w-0 text-[13px] leading-snug ${
                isRead ? "font-medium text-slate-700" : "font-bold text-slate-900"
              }`}
            >
              {title}
            </span>
            {!isRead && (
              <span
                className="w-2 h-2 rounded-full bg-purple-600 shrink-0 mt-1"
                aria-label="Unread"
                title="Unread"
              />
            )}
          </span>

          {message && (
            <span className="block text-xs text-slate-600 leading-relaxed mt-0.5 line-clamp-2">
              {message}
            </span>
          )}

          <span className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-1.5">
            <span className="truncate">{actorLabel(actorName)}</span>
            <span aria-hidden="true">·</span>
            <NotificationTime iso={createdAt} className="shrink-0 text-slate-500" />
          </span>
        </span>
      </button>

      {/* Action buttons (Quick open & Dismiss) */}
      <div className="absolute top-2.5 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {onQuickOpen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickOpen();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition cursor-pointer"
            aria-label={quickOpenLabel}
            title={quickOpenLabel}
          >
            <HiExternalLink className="w-3.5 h-3.5" />
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
            aria-label={`Clear “${title}”`}
            title="Clear this notification"
          >
            <HiX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
