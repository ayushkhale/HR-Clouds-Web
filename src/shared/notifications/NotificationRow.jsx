// ─────────────────────────────────────────────────────────────────────────────
// NotificationRow.jsx — one notification in the bell panel, plus the small
// pieces the full page reuses so the two surfaces cannot drift apart.
//
// ─── HOW AN UNREAD ROW IS MARKED, AND WHY ONLY ONE THING MARKS IT ──────────
// Exactly one signal on this screen carries colour: unread. A purple left edge,
// a purple dot beside the title and a slightly heavier title — nothing else.
// The eight categories are told apart by their ICON, never by a tint, because
// eight tinted rows stacked in a dropdown is a fruit salad in which the one
// thing you actually need to see (what is new) disappears. §5 leaves only
// purple available in any case.
//
// ─── THE DISMISS BUTTON IS A SIBLING, NOT A CHILD ──────────────────────────
// The whole row is a button, so the dismiss control cannot live inside it —
// nested interactive elements are invalid and a click would open the row as
// well. It sits absolutely positioned over the row's right edge as a sibling,
// visible on hover and whenever it has focus, so a keyboard user can always
// reach it.
//
// ─── TWO LINES, NEVER MORE ─────────────────────────────────────────────────
// The server's `message` is display-ready prose that can run long (a leave
// rejection carries the manager's own words). Clamped to two lines here; the
// record inspector is where the whole thing is read. A panel that lets one
// notification take six lines shows three notifications.
// ─────────────────────────────────────────────────────────────────────────────

import { HiX } from "react-icons/hi";
import { actorLabel, categoryLabel, categoryMeta } from "./notificationMeta";
import { sinceLabel } from "../attendance/liveLocationMeta";
import { fmtDateTime } from "../attendance/dates";

/** The round icon chip that says which part of the product this came from. */
export function CategoryIcon({ category, muted = false, className = "w-9 h-9" }) {
  const { icon: Icon } = categoryMeta(category);
  return (
    <span
      className={`${className} rounded-xl flex items-center justify-center shrink-0 border ${
        muted ? "bg-slate-50 border-slate-100 text-slate-400" : "bg-purple-50 border-purple-100 text-purple-600"
      }`}
      aria-hidden="true"
    >
      <Icon className="w-[55%] h-[55%]" />
    </span>
  );
}

/** The category as a word, for a table cell or the inspector header. */
export function CategoryPill({ category }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
      {categoryLabel(category)}
    </span>
  );
}

/** "2 hours ago", with the exact moment on hover for anyone who needs it. */
export function NotificationTime({ iso, className = "" }) {
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
 *   onOpen: () => void,      // marks read and goes wherever it goes
 *   onDismiss?: () => void,  // absent in a read-only context
 * }} props
 */
export default function NotificationRow({ notification, onOpen, onDismiss }) {
  const { category, title, message, actorName, createdAt, isRead } = notification;

  return (
    <li className="relative group">
      <button
        type="button"
        onClick={onOpen}
        className={`w-full text-left flex items-start gap-3 pl-4 pr-10 py-3.5 transition-colors outline-none focus-visible:bg-purple-50/70 hover:bg-purple-50/40 ${
          isRead ? "" : "bg-purple-50/30"
        }`}
      >
        {/* The unread edge. On the row's own left border so it reads as a
            property of the row rather than as another icon competing with the
            category chip. */}
        <span
          className={`absolute left-0 top-0 bottom-0 w-[3px] ${isRead ? "bg-transparent" : "bg-purple-600"}`}
          aria-hidden="true"
        />
        <CategoryIcon category={category} muted={isRead} />
        <span className="flex-1 min-w-0">
          <span className="flex items-start gap-2">
            <span className={`flex-1 min-w-0 text-[13px] leading-snug ${isRead ? "font-semibold text-slate-700" : "font-bold text-slate-900"}`}>
              {title}
            </span>
            {!isRead && (
              <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0 mt-1.5" aria-label="Unread" />
            )}
          </span>
          {message && (
            <span className="block text-xs text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{message}</span>
          )}
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mt-1.5">
            <span className="truncate">{actorLabel(actorName)}</span>
            <span aria-hidden="true">·</span>
            <NotificationTime iso={createdAt} className="shrink-0" />
          </span>
        </span>
      </button>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          // Always reachable by keyboard, only visible on hover/focus so the
          // panel isn't a column of grey crosses.
          className="absolute top-3 right-2.5 p-1.5 rounded-lg text-slate-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
          aria-label={`Clear “${title}”`}
          title="Clear this notification"
        >
          <HiX className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}
