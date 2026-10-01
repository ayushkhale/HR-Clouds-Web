// ─────────────────────────────────────────────────────────────────────────────
// InboxCard — the boxy queue tile used by the HR and manager inboxes.
// One definition, so the two inboxes cannot drift apart: icon and count on top,
// name and one line of explanation under it, and a footer that says whether the
// queue is already open below.
// ─────────────────────────────────────────────────────────────────────────────

import { HiArrowRight } from "react-icons/hi";

export function CountValue({ value, loading }) {
  if (value == null) {
    return loading
      ? <span className="inline-block w-8 h-7 rounded-lg bg-slate-100 animate-pulse" aria-label="Loading" />
      : <span className="text-sm font-bold text-slate-400">N/A</span>;
  }
  return <span className={`text-2xl font-bold tabular-nums ${value > 0 ? "text-purple-700" : "text-slate-300"}`}>{value}</span>;
}

export default function InboxCard({ item, count, loading, selected, onSelect }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-pressed={selected}
      className={`text-left bg-white rounded-2xl border p-5 transition hover:shadow-md ${selected ? "border-purple-500 ring-2 ring-purple-100" : "border-slate-100 shadow-sm hover:border-purple-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600"}`}>
          <Icon className="w-5 h-5" />
        </span>
        <CountValue value={count} loading={loading} />
      </div>
      <p className="mt-3 text-sm font-bold text-slate-800">{item.label}</p>
      <p className="text-xs text-slate-500 mt-0.5">{item.hint}</p>
      <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-purple-600">
        {selected ? "Showing below" : "Review here"}
        <HiArrowRight className={`w-3.5 h-3.5 transition-transform ${selected ? "rotate-90" : ""}`} />
      </p>
    </button>
  );
}
