// ─────────────────────────────────────────────────────────────────────────────
// CompOffPicker.jsx — tick the comp-offs to cash out, by the day they were
// earned. Replaces the "paste the comp-off ids" box: nobody knows those ids,
// and the encashment API only takes ids (`comp_off_ids`, UUIDs).
//
// `load(userId)` returns that person's cashable comp-offs (approved, unused).
// A caller with no way to list them passes `unavailable` with the reason.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { HiCheck, HiGift, HiInformationCircle } from "react-icons/hi";
import { attendanceAPI, tokenHelper } from "../api";
import { normalizePaginated } from "../attendance/normalize";
import { fmtDate, fmtHours, todayYMD, ymdOnly } from "../attendance/dates";
import { DICTIONARY } from "../config/dictionary";

const TERM = DICTIONARY.TERMS.COMP_OFF;
const earnedOn = (c) => ymdOnly(c.earned_date || c.worked_date || c.date);
const expiresOn = (c) => ymdOnly(c.expiry_date || c.expires_on || c.valid_until);
const ownerOf = (c) => c.user_id || c.user?.id || c.employee_id || "";

/* ── HR loader: /attendance/hr/comp-offs, approved only ─────────────────── */
// The list takes `status` but no documented per-person filter, so approved
// comp-offs are paged once (100 a page) and filtered here. Cached for a minute
// per session so switching people doesn't re-page the organisation.
const PAGE = 100;
const MAX_PAGES = 20;
let hrCache = { token: null, at: 0, rows: null, promise: null };

function loadApprovedCompOffs() {
  const token = tokenHelper.get();
  if (hrCache.token !== token) hrCache = { token, at: 0, rows: null, promise: null };
  if (hrCache.rows && Date.now() - hrCache.at < 60_000) return Promise.resolve(hrCache.rows);
  if (hrCache.promise) return hrCache.promise;
  const keys = ["comp_offs", "compOffs", "records"];
  const promise = (async () => {
    const first = normalizePaginated(await attendanceAPI.getCompOffs({ status: "approved", page: 1, limit: PAGE }), keys, { page: 1, limit: PAGE });
    const pages = Math.min(MAX_PAGES, first.totalPages || 1);
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => attendanceAPI.getCompOffs({ status: "approved", page: i + 2, limit: PAGE }))
    );
    return [...first.items, ...rest.flatMap((res) => normalizePaginated(res, keys).items)];
  })()
    .then((rows) => {
      if (hrCache.token === token) hrCache = { token, at: Date.now(), rows, promise: null };
      return rows;
    })
    .catch((err) => {
      if (hrCache.token === token) hrCache.promise = null;
      throw err;
    });
  hrCache.promise = promise;
  return promise;
}

/** For HR screens: this person's approved, unexpired comp-offs, oldest first. */
export async function loadHrCompOffsFor(userId) {
  const today = todayYMD();
  return (await loadApprovedCompOffs())
    .filter((c) => ownerOf(c) === userId && c.status !== "used" && !(expiresOn(c) && expiresOn(c) < today))
    .sort((a, b) => (earnedOn(a) || "").localeCompare(earnedOn(b) || ""));
}

/**
 * @param {string}   userId       whose comp-offs; nothing loads until chosen
 * @param {string[]} value        chosen comp-off ids
 * @param {Function} onChange     next ids
 * @param {Function} [load]       (userId) => Promise<compOff[]>
 * @param {string}   [unavailable] why the list can't be shown (no loader)
 */
export default function CompOffPicker({ userId, value = [], onChange, load, unavailable, personName = "this person" }) {
  const [state, setState] = useState({ items: [], loading: false, error: "" });

  useEffect(() => {
    if (!userId || !load) { setState({ items: [], loading: false, error: "" }); return undefined; }
    let alive = true;
    setState({ items: [], loading: true, error: "" });
    load(userId)
      .then((items) => alive && setState({ items, loading: false, error: "" }))
      .catch(() => alive && setState({ items: [], loading: false, error: `Couldn't load ${personName}'s ${TERM.toLowerCase()}s.` }));
    return () => { alive = false; };
  }, [userId, load, personName]);

  // A new person means a new list; drop choices that aren't in it.
  useEffect(() => {
    if (state.loading) return;
    const ids = new Set(state.items.map((c) => c.id));
    if (value.some((id) => !ids.has(id))) onChange(value.filter((id) => ids.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.items, state.loading]);

  if (unavailable) {
    return (
      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
        <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" /> <span>{unavailable}</span>
      </p>
    );
  }
  if (!userId) return <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl px-3.5 py-3">Choose who this is for to see their {TERM.toLowerCase()}s.</p>;
  if (state.loading) return <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>;
  if (state.error) return <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">{state.error}</p>;
  if (state.items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
        <HiGift className="w-4 h-4 text-slate-400 shrink-0" /> {personName} has no approved, unused {TERM.toLowerCase()}s to cash out.
      </div>
    );
  }

  const chosen = new Set(value);
  const toggle = (id) => onChange(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  const allChosen = state.items.every((c) => chosen.has(c.id));

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs">
        <span className="font-bold text-purple-700">{value.length} of {state.items.length} chosen · {value.length} {value.length === 1 ? "day" : "days"}</span>
        <button type="button" onClick={() => onChange(allChosen ? [] : state.items.map((c) => c.id))} className="font-bold text-purple-600 hover:underline">
          {allChosen ? "Clear" : "Choose all"}
        </button>
      </div>
      <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
        {state.items.map((c) => {
          const on = chosen.has(c.id);
          const expiry = expiresOn(c);
          return (
            <li key={c.id}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c.id)} className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${on ? "bg-purple-50/70" : "hover:bg-slate-50"}`}>
                <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${on ? "bg-purple-600 border-purple-600 text-white" : "border-slate-300 bg-white"}`}>
                  {on && <HiCheck className="w-3 h-3" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">Worked {fmtDate(earnedOn(c), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="block text-[11px] text-slate-400">
                    {[c.worked_hours != null ? `${fmtHours(c.worked_hours)} worked` : null, expiry ? `expires ${fmtDate(expiry, { day: "numeric", month: "short", year: "numeric" })}` : null].filter(Boolean).join(" · ") || "1 day"}
                  </span>
                </span>
                <span className="text-xs font-bold text-slate-500 shrink-0">1 day</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
