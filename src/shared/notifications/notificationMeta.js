// ─────────────────────────────────────────────────────────────────────────────
// notificationMeta.js — everything the notification UI knows about the domain:
// the eight categories, how a row is read, how the badge is written, and how a
// feed is cut into Today / Yesterday / Earlier.
//
// WHY A META FILE AND NOT INLINE JSX (§8): the same eight categories label a
// filter tab, a row icon, a table cell and an inspector pill, in three
// workspaces. Eight copies of a label map is how they start disagreeing.
//
// ─── THINGS THAT LOOK LIKE CHOICES AND ARE NOT ─────────────────────────────
// · THE CATEGORY LIST IS THE SERVER'S CHECK CONSTRAINT, not ours. Sending a
//   ninth value is a 400, not an empty page, so the filter tabs are built from
//   this list and nothing else. A category that arrives unknown still renders —
//   the catalog grows — it just falls back to the plain System look.
// · NO CATEGORY GETS A COLOUR OF ITS OWN. Eight tinted rows is a fruit salad,
//   and §5 leaves only purple available anyway. The icon carries the category;
//   colour is reserved for one thing on this screen, which is "unread".
// · THE MESSAGE IS PLAIN TEXT, already interpolated server-side with names,
//   dates and day counts. Never parse it, never render it as HTML, never
//   recompute a figure out of it.
// · `actor_name` IS NULL FOR A CRON or a deleted actor, and the server never
//   sends `actor_id` — there is no id to resolve and nothing to look up in the
//   directory. Null reads "The system", never "Unknown" and never an id (§4).
// ─────────────────────────────────────────────────────────────────────────────

import {
  HiCalendar, HiClock, HiCurrencyRupee, HiClipboardCheck, HiDocumentText,
  HiOutlineCalendar, HiUserGroup, HiSparkles, HiBell,
} from "react-icons/hi";
import { humanize } from "../attendance/enums";
import { NOTIFICATION_CATEGORIES } from "../api/notifications.api";

export { NOTIFICATION_CATEGORIES };

/**
 * One entry per server category. `label` is the word on a tab, a column and a
 * pill — identical in all three workspaces (§2), and written for somebody who
 * does not work in HR (§6): "Pay", not "Payroll"; "People", not "Employee".
 */
export const CATEGORY_META = {
  leave: { label: "Leave", icon: HiCalendar },
  attendance: { label: "Attendance", icon: HiClock },
  payroll: { label: "Pay", icon: HiCurrencyRupee },
  task: { label: "Tasks", icon: HiClipboardCheck },
  document: { label: "Documents", icon: HiDocumentText },
  shift: { label: "Shifts", icon: HiOutlineCalendar },
  employee: { label: "People", icon: HiUserGroup },
  system: { label: "System", icon: HiSparkles },
};

const UNKNOWN_CATEGORY = { label: "Update", icon: HiBell };

/** Never throws on a category the installed app has not heard of yet. */
export const categoryMeta = (category) => CATEGORY_META[category] || UNKNOWN_CATEGORY;

/** "Leave" / "Pay" / … for a cell, falling back to a prettified raw value. */
export const categoryLabel = (category) =>
  CATEGORY_META[category]?.label || humanize(category) || "Update";

/** The tabs over the feed: All first, then only categories actually present. */
export function categoryTabs(rows = []) {
  const present = new Set(rows.map((row) => row.category).filter(Boolean));
  return [
    { value: "", label: "All" },
    ...NOTIFICATION_CATEGORIES.filter((c) => present.has(c))
      .map((c) => ({ value: c, label: CATEGORY_META[c].label })),
  ];
}

/**
 * What the bell shows.
 *
 * The server stops counting at `NOTIFICATION_UNREAD_COUNT_CAP` (100 by default)
 * because a plain COUNT(*) over somebody who has never opened the app is
 * unbounded work on every poll, forever. `is_capped` therefore means "at least
 * this many" — printing the raw number would be a figure we were told not to
 * trust. Two digits is also all the room a bell badge has.
 */
export function badgeLabel(count, isCapped = false) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (isCapped || n > 99) return "99+";
  return String(n);
}

/** The same figure as a sentence, for a tooltip and a screen reader. */
export function badgeTitle(count, isCapped = false) {
  const n = Number(count) || 0;
  if (n <= 0) return "Notifications — nothing new";
  if (isCapped) return `Notifications — more than ${n} unread`;
  return `Notifications — ${n} unread`;
}

/** Null actor is a cron or a deleted account, never an id to resolve (§4). */
export const actorLabel = (actorName) => (actorName || "").trim() || "The system";

/**
 * A notification in the shape the UI uses, from whatever the server sent.
 *
 * `is_read` is derived server-side from `read_at`, and both are returned so a
 * client can branch cheaply and still show the timestamp. We re-derive rather
 * than trust the pair to agree: an optimistic local update sets `read_at` and
 * must not have to remember to set the boolean too.
 */
export function normalizeNotification(raw) {
  if (!raw) return null;
  const readAt = raw.read_at || null;
  return {
    id: raw.id,
    eventKey: raw.event_key || "",
    category: raw.category || "system",
    title: (raw.title || "").trim() || "Notification",
    message: (raw.message || "").trim(),
    actorName: raw.actor_name || null,
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
    readAt,
    isRead: readAt != null || raw.is_read === true,
    createdAt: raw.created_at || null,
  };
}

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Today / Yesterday / a date, for the panel's sticky group headers.
 * A feed without them is an undifferentiated wall: the first thing anyone wants
 * to know about a notification is whether it is from this morning or last week.
 */
export function dayBucketLabel(iso) {
  const at = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(at)) return "Earlier";
  const today = startOfDay(Date.now());
  const day = startOfDay(at);
  if (day === today) return "Today";
  if (day === today - 86_400_000) return "Yesterday";
  return new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** `[{ label, items }]` in feed order — the server already sorted it newest first. */
export function groupByDay(rows = []) {
  const groups = [];
  rows.forEach((row) => {
    const label = dayBucketLabel(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  });
  return groups;
}
