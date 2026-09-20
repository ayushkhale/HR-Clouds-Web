// ─────────────────────────────────────────────────────────────────────────────
// EmployeeMultiPicker.jsx — choose a group of employees by name.
//
// Off-cycle and final-settlement runs (#38, Phase 7) pay a named cohort rather
// than everybody, and encashment screens need the same "pick a person" control.
// The backend takes `user_ids`, but nobody can pick a UUID from a list, so this
// searches names and hands back ids.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiX, HiSearch, HiUserGroup } from "react-icons/hi";
import { fetchAllOrgEmployees } from "../../../shared/utils/orgEmployees";

const idOf = (u) => u?.user_id ?? u?.id ?? u?._id;
const nameOf = (u) =>
  u?.name || u?.display_name || [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.identifier || "Unnamed";
const codeOf = (u) => u?.employee_code || u?.code || "";

/**
 * @param {string[]} value      selected user ids
 * @param {Function} onChange   next ids
 * @param {number}   [max]      refuse to add beyond this many
 * @param {boolean}  [disabled]
 * @param {boolean}  [includeInactive] leavers need to be selectable for a final settlement
 */
export default function EmployeeMultiPicker({ value = [], onChange, max, disabled = false, includeInactive = true }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllOrgEmployees({ includeInactive })
      .then((list) => { if (!cancelled) setPeople(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setPeople([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [includeInactive]);

  // Clicking away closes the list without clearing what has been chosen.
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const byId = useMemo(() => {
    const m = {};
    people.forEach((p) => { const id = idOf(p); if (id) m[id] = p; });
    return m;
  }, [people]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = people.filter((p) => idOf(p) && !value.includes(idOf(p)));
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((p) => nameOf(p).toLowerCase().includes(q) || codeOf(p).toLowerCase().includes(q))
      .slice(0, 8);
  }, [people, query, value]);

  const atMax = max !== undefined && value.length >= max;

  const add = (id) => {
    if (atMax || value.includes(id)) return;
    onChange([...value, id]);
    setQuery("");
  };
  const remove = (id) => onChange(value.filter((v) => v !== id));

  return (
    <div ref={boxRef} className="relative">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-[11px] font-bold text-purple-700">
              {byId[id] ? nameOf(byId[id]) : "Selected person"}
              {!disabled && (
                <button type="button" onClick={() => remove(id)} className="text-purple-400 hover:text-purple-700" aria-label={`Remove ${byId[id] ? nameOf(byId[id]) : "person"}`}>
                  <HiX className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          disabled={disabled || loading || atMax}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? "Loading people…" : atMax ? `That's the maximum of ${max}` : "Search by name or employee code"}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60"
        />
      </div>

      {open && !disabled && !atMax && matches.length > 0 && (
        <ul className="absolute z-20 mt-1.5 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          {matches.map((p) => (
            <li key={idOf(p)}>
              <button
                type="button"
                onClick={() => add(idOf(p))}
                className="w-full text-left px-3.5 py-2 hover:bg-purple-50 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold text-slate-700 truncate">{nameOf(p)}</span>
                {codeOf(p) && <span className="text-[10px] font-mono text-slate-400 shrink-0">{codeOf(p)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.trim() && matches.length === 0 && (
        <p className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg px-3.5 py-3 text-xs text-slate-500">
          Nobody matches “{query.trim()}”.
        </p>
      )}

      <p className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
        <HiUserGroup className="w-3 h-3" />
        {value.length} chosen{max !== undefined ? ` of at most ${max}` : ""}
      </p>
    </div>
  );
}
