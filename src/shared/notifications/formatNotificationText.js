// ─────────────────────────────────────────────────────────────────────────────
// formatNotificationText.js — Pure frontend string normalization and sanitization
// for notification titles, messages, and actor names.
//
// Solves database/template string defects without waiting for backend migrations:
//   · Dangling dots from empty last names ("Employee ." -> "Employee")
//   · Duplicate words ("Emergency Leave leave" -> "Emergency Leave")
//   · Raw ISO date ranges ("from 2026-10-30 to 2026-10-30 (1 day(s))" -> "for 30 Oct 2026 (1 day)")
//   · Unmatched closing parentheses and pluralization ("(1 day(s))" -> "(1 day)")
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a YYYY-MM-DD string into "DD MMM YYYY" (e.g., "2026-10-30" -> "30 Oct 2026").
 */
export function formatIsoDateString(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return dateStr;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const monthIdx = parseInt(month, 10) - 1;
  const dayNum = parseInt(day, 10);
  if (monthIdx < 0 || monthIdx > 11 || Number.isNaN(dayNum)) return dateStr;
  return `${dayNum} ${MONTH_NAMES[monthIdx]} ${year}`;
}

/**
 * Clean and normalize actor names.
 * Strips dangling periods, commas, or excessive spaces (e.g., "Employee ." -> "Employee").
 * Fallback to "The system" if empty or null.
 */
export function cleanActorName(actorName) {
  if (!actorName || typeof actorName !== "string") return "The system";
  // Remove trailing dots, commas, dashes, and extra whitespace
  const cleaned = actorName
    .replace(/[\s.,_-]+$/, "")
    .replace(/^\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "The system";
}

/**
 * Clean consecutive duplicated words case-insensitively (e.g. "Leave leave" -> "Leave").
 * Preserves the first instance's casing.
 */
export function deduplicateWords(str) {
  if (!str || typeof str !== "string") return str;
  // Match repeated words: \b(\w+)\s+\1\b (case-insensitive)
  return str.replace(/\b([a-zA-Z]+)(?:\s+\1\b)+/gi, "$1");
}

/**
 * Clean day pluralization and bracket issues:
 *   - "(1 day(s))" -> "(1 day)"
 *   - "(2 day(s))" -> "(2 days)"
 *   - "(1 day(s)))" -> "(1 day)"
 *   - "1 day(s)" -> "1 day"
 */
export function normalizeDayCounts(str) {
  if (!str || typeof str !== "string") return str;

  return str
    // 1. Fix parenthesized counts like "(1 day(s))", "(1 day(s)))", "(5 day(s))" -> "(1 day)", "(5 days)"
    .replace(/\((\d+)\s*days?(?:\(s\))?\)+/gi, (match, count) => {
      const n = parseInt(count, 10);
      return `(${n} ${n === 1 ? "day" : "days"})`;
    })
    // 2. Fix unparenthesized counts like "1 day(s))" or "1 day(s)" -> "1 day", "5 days"
    .replace(/\b(\d+)\s*days?(?:\(s\))(?:\)+)?/gi, (match, count) => {
      const n = parseInt(count, 10);
      return `${n} ${n === 1 ? "day" : "days"}`;
    });
}

/**
 * Formats date ranges inside notification text:
 * E.g., "from 2026-10-30 to 2026-10-30 (1 day(s))" -> "for 30 Oct 2026 (1 day)"
 * E.g., "from 2026-10-24 to 2026-10-26 (3 day(s))" -> "from 24 Oct 2026 to 26 Oct 2026 (3 days)"
 */
export function normalizeDateRanges(str) {
  if (!str || typeof str !== "string") return str;

  // Pattern matching "from YYYY-MM-DD to YYYY-MM-DD (optional days count)"
  const rangeWithFromRegex = /from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})(?:\s*\((\d+)\s*days?(?:\(s\))?\)?\)?)?/gi;
  let result = str.replace(rangeWithFromRegex, (match, d1, d2, dayCount) => {
    const formatted1 = formatIsoDateString(d1);
    const formatted2 = formatIsoDateString(d2);
    const count = dayCount ? parseInt(dayCount, 10) : null;
    const countSuffix = count != null ? ` (${count} ${count === 1 ? "day" : "days"})` : "";

    if (d1 === d2) {
      // Single-day range: "for 30 Oct 2026 (1 day)"
      return `for ${formatted1}${countSuffix}`;
    }
    return `from ${formatted1} to ${formatted2}${countSuffix}`;
  });

  // Pattern matching "YYYY-MM-DD to YYYY-MM-DD" without leading "from"
  const rangeWithoutFromRegex = /\b(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\b/gi;
  result = result.replace(rangeWithoutFromRegex, (match, d1, d2) => {
    const formatted1 = formatIsoDateString(d1);
    const formatted2 = formatIsoDateString(d2);
    if (d1 === d2) return formatted1;
    return `${formatted1} to ${formatted2}`;
  });

  // Convert any remaining standalone YYYY-MM-DD into "DD MMM YYYY"
  result = result.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (match) => formatIsoDateString(match));

  return result;
}

/**
 * Full message text sanitizer.
 * Cleans dangling dots, duplicated words, date ranges, and pluralizations.
 */
export function cleanMessage(message) {
  if (!message || typeof message !== "string") return "";

  let cleaned = message.trim();

  // 1. Remove dangling dot after an actor name: "Employee . has applied" -> "Employee has applied"
  cleaned = cleaned.replace(/\b([A-Za-z0-9_-]+)\s+\.\s+/g, "$1 ");

  // 2. Normalize repeated words: "Emergency Leave leave" -> "Emergency Leave"
  cleaned = deduplicateWords(cleaned);

  // 3. Normalize date ranges and dates
  cleaned = normalizeDateRanges(cleaned);

  // 4. Normalize day counts and parenthesis
  cleaned = normalizeDayCounts(cleaned);

  // 5. Clean up duplicate periods or spaces before punctuation
  cleaned = cleaned
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

/**
 * Clean notification titles.
 */
export function cleanTitle(title) {
  if (!title || typeof title !== "string") return "Notification";
  let cleaned = title.trim();
  cleaned = deduplicateWords(cleaned);
  cleaned = cleanMessage(cleaned);
  return cleaned || "Notification";
}

/**
 * Formats and sanitizes a complete notification object.
 */
export function formatNotification(notification) {
  if (!notification) return null;
  return {
    ...notification,
    title: cleanTitle(notification.title),
    message: cleanMessage(notification.message),
    actorName: cleanActorName(notification.actorName),
  };
}

export default formatNotification;
