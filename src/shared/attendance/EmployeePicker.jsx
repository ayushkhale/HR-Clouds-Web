// ─────────────────────────────────────────────────────────────────────────────
// attendance/EmployeePicker.jsx — Searchable single-select employee picker.
// Value is the employee's `user_id`; the UI shows name, employee code and email
// so HR never types or reads a raw UUID.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { HiCheckCircle, HiSearch } from "react-icons/hi";
import { organizationAPI, tokenHelper } from "../api";
import { attendanceErrorMessage } from "../utils/attendanceErrors.js";
import { initials, isUuid, listFrom } from "./normalize.js";

const firstString = (...values) => values.find((v) => typeof v === "string" && v.trim() && !isUuid(v))?.trim() || "";

/** Normalise one org-roster entry into `{ id, name, code, email }`. */
export function toEmployeeOption(e) {
  const id = e?.user_id || e?.user?.id || e?.employee_id || e?.id;
  const profile = e?.profile || e?.employee_profile || e?.manager_profile || e?.hr_profile || {};
  const joined = [firstString(profile.first_name, e?.first_name), firstString(profile.last_name, e?.last_name)].filter(Boolean).join(" ");
  const email = firstString(e?.email, e?.identifier, e?.user?.identifier, e?.user?.email);
  const name = firstString(profile.display_name, e?.display_name, e?.name, e?.user?.name) || joined || email || "Unnamed employee";
  const code = firstString(e?.employee_code, profile.employee_code, e?.user?.employee_profile?.employee_code);
  return { id, name, code, email, raw: e };
}

// Keyed by the session token so a logout → login (another user or org) in the
// same tab never reuses the previous session's roster.
let cache = { key: null, at: 0, options: [] };
const CACHE_MS = 60_000;
const cacheKey = (purpose) => `${tokenHelper.get() || ""}|${purpose}`;
const isFresh = (purpose) => cache.key === cacheKey(purpose) && Date.now() - cache.at < CACHE_MS;

export function useOrgEmployees(purpose = "shift_assignment") {
  const [state, setState] = useState(() =>
    isFresh(purpose)
      ? { options: cache.options, loading: false, error: null }
      : { options: [], loading: true, error: null }
  );

  useEffect(() => {
    if (isFresh(purpose)) return undefined;
    const key = cacheKey(purpose);
    let alive = true;
    organizationAPI
      .getEmployees({ purpose })
      .then((res) => {
        const list = listFrom(res, ["employees", "members", "users"]);
        const seen = new Set();
        const options = list.map(toEmployeeOption).filter((o) => {
          if (!o.id || seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });
        options.sort((a, b) => a.name.localeCompare(b.name));
        cache = { key, at: Date.now(), options };
        if (alive) setState({ options, loading: false, error: null });
      })
      .catch((error) => alive && setState({ options: [], loading: false, error }));
    return () => {
      alive = false;
    };
  }, [purpose]);

  return state;
}

export default function EmployeePicker({ value, onChange, purpose = "shift_assignment", disabled = false, invalid = false, maxHeight = "max-h-44" }) {
  const { options, loading, error } = useOrgEmployees(purpose);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => [o.name, o.code, o.email].some((f) => f && f.toLowerCase().includes(q)));
  }, [options, search]);

  const selected = options.find((o) => o.id === value);

  return (
    <div>
      <div className="relative mb-2">
        <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, employee code or email…"
          disabled={disabled}
          className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${invalid ? "border-rose-300" : "border-slate-200"}`}
        />
      </div>
      <div className={`${maxHeight} overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50`} role="listbox">
        {loading ? (
          <p className="px-4 py-3 text-xs text-slate-400">Loading employees…</p>
        ) : error ? (
          <p className="px-4 py-3 text-xs text-rose-600">{attendanceErrorMessage(error, "Couldn't load employees.")}</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-3 text-xs text-slate-400">{options.length === 0 ? "No employees found. Invite employees first." : "No matching employees."}</p>
        ) : (
          filtered.map((o) => {
            const isSelected = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => onChange(o.id, o)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${isSelected ? "bg-purple-50" : "hover:bg-slate-50"}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {initials(o.name)}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${isSelected ? "text-purple-700" : "text-slate-800"}`}>
                    {o.name}
                    {o.code && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{o.code}</span>}
                  </p>
                  {o.email && o.email !== o.name && <p className="text-[10px] text-slate-400 truncate">{o.email}</p>}
                </div>
                {isSelected && <HiCheckCircle className="w-4 h-4 text-purple-500 ml-auto shrink-0" />}
              </button>
            );
          })
        )}
      </div>
      {selected && (
        <p className="text-[11px] text-slate-500 mt-1.5">
          Selected: <span className="font-bold text-slate-700">{selected.name}</span>
          {selected.code ? ` · ${selected.code}` : ""}
        </p>
      )}
    </div>
  );
}
