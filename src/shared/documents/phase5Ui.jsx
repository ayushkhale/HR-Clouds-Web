// ─────────────────────────────────────────────────────────────────────────────
// documents/phase5Ui.jsx — The small presentational pieces Phase 5 adds:
// the template and export badges, the tag chips, the expiry-bucket strip and
// the two progress bars (compliance, and a large publish filling in).
//
// Same rule as the rest of the module: every tone comes from TONE_CLASSES, so
// the whole thing stays in the purple family, and rose is reserved for the two
// meanings that genuinely are bad news — a document that has already expired,
// and an export that failed.
// ─────────────────────────────────────────────────────────────────────────────

import { HiHashtag, HiX } from "react-icons/hi";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { templateStatusMeta } from "./templateMeta";
import { EXPIRY_BUCKETS, expiryBucketMeta, exportStatusMeta } from "./reportMeta";

/** Shared badge body, so none of these can drift apart from the Phase 4 ones. */
function Badge({ meta, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate} ${className}`}
      title={meta.hint || meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
      {meta.short}
    </span>
  );
}

/** Where a blank form stands: draft, live, replaced or retired. */
export function TemplateStatusBadge({ status, className = "" }) {
  return <Badge meta={templateStatusMeta(status)} className={className} />;
}

/** Whether a bulk download finished (#119). */
export function ExportStatusBadge({ status, className = "" }) {
  return <Badge meta={exportStatusMeta(status)} className={className} />;
}

/** Which expiry window a document falls in (#117). */
export function ExpiryBucketBadge({ bucket, className = "" }) {
  return <Badge meta={{ ...expiryBucketMeta(bucket), short: expiryBucketMeta(bucket).short }} className={className} />;
}

/**
 * A document's tags. `onRemove` turns each one into a chip that can be taken
 * off, which is how the tag editor renders the set being built.
 */
export function TagChips({ tags = [], onRemove, onPick, empty = null, className = "" }) {
  if (!tags.length) return empty;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {tags.map((tag) => {
        const body = (
          <>
            <HiHashtag className="w-3 h-3 opacity-60" aria-hidden="true" />
            {tag}
          </>
        );
        const base = "inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-lg border border-purple-200 bg-purple-50 text-[11px] font-semibold text-purple-700 max-w-[180px]";
        if (onRemove) {
          return (
            <span key={tag} className={base}>
              <span className="truncate">{body}</span>
              <button type="button" onClick={() => onRemove(tag)} className="p-0.5 -mr-1 rounded text-purple-400 hover:text-purple-800" aria-label={`Remove the tag ${tag}`}>
                <HiX className="w-3 h-3" />
              </button>
            </span>
          );
        }
        if (onPick) {
          return (
            <button key={tag} type="button" onClick={() => onPick(tag)} className={`${base} hover:bg-purple-100 transition`} title={`Show everything tagged ${tag}`}>
              <span className="truncate inline-flex items-center gap-1">{body}</span>
            </button>
          );
        }
        return <span key={tag} className={base}><span className="truncate inline-flex items-center gap-1">{body}</span></span>;
      })}
    </span>
  );
}

/**
 * The six expiry windows as one clickable strip. Empty buckets stay visible
 * and greyed rather than disappearing: "nothing expires in the next week" is
 * the answer somebody came for, and a missing tile doesn't say it.
 */
export function ExpiryBucketStrip({ buckets, active = "", onPick, includeExpired = true }) {
  const shown = includeExpired ? EXPIRY_BUCKETS : EXPIRY_BUCKETS.filter((b) => b.key !== "expired");
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {shown.map((bucket) => {
        const count = Number(buckets?.[bucket.key]) || 0;
        const isActive = active === bucket.key;
        const alarming = bucket.key === "expired" && count > 0;
        return (
          <button
            key={bucket.key}
            type="button"
            onClick={() => onPick?.(isActive ? "" : bucket.key)}
            aria-pressed={isActive}
            title={bucket.blurb}
            className={`text-left rounded-2xl border px-3.5 py-3 transition ${
              isActive
                ? "border-purple-300 bg-purple-50/70 ring-2 ring-purple-100"
                : alarming
                  ? "border-rose-200 bg-rose-50/50 hover:border-rose-300"
                  : count > 0
                    ? "border-slate-100 bg-white shadow-xs hover:border-purple-200"
                    : "border-slate-100 bg-slate-50/60 hover:border-slate-200"
            }`}
          >
            <p className={`text-[11px] font-semibold truncate ${alarming ? "text-rose-600" : count > 0 ? "text-slate-500" : "text-slate-400"}`}>{bucket.label}</p>
            <p className={`text-xl font-bold tracking-tight leading-none mt-1.5 tabular-nums ${alarming ? "text-rose-700" : count > 0 ? "text-slate-800" : "text-slate-300"}`}>{count}</p>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A plain percentage bar. `value` is 0–100, or null when it isn't known — and
 * "not known" renders as an empty track with a dash, never as 0%, because the
 * two mean very different things in a compliance report.
 */
export function PercentBar({ value, label, sub, tone = "purple", className = "" }) {
  const known = Number.isFinite(Number(value));
  const pct = known ? Math.max(0, Math.min(100, Number(value))) : 0;
  const fill = tone === "rose" ? "bg-rose-500" : pct >= 90 ? "bg-violet-500" : pct >= 60 ? "bg-purple-500" : "bg-fuchsia-500";
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        {label && <p className="text-xs font-semibold text-slate-600 truncate">{label}</p>}
        <p className="text-sm font-bold text-slate-800 tabular-nums shrink-0">{known ? `${pct}%` : "—"}</p>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1.5" role="progressbar" aria-valuenow={known ? pct : undefined} aria-valuemin={0} aria-valuemax={100} aria-label={label || "Progress"}>
        <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
