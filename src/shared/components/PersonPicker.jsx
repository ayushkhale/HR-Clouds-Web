// ─────────────────────────────────────────────────────────────────────────────
// PersonPicker.jsx — the one way to choose people, in every role.
//
// `PersonSelect` picks one person, `PersonMultiSelect` picks several. Both open
// the same panel: a search box (name, employee code, email or detail line) over
// a list of people with avatar, name, code and a detail line. Arrow keys move,
// Enter picks, Escape closes.
//
// The panel is portalled to <body> with fixed positioning, so it is never
// clipped by a modal's scrolling body, and it flips upward near the bottom of
// the screen.
//
// `people` may be raw roster rows (any shape toEmployeeOption understands) or
// ready options `{ id, name, code?, sub?, email?, raw? }`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiCheck, HiChevronDown, HiSearch, HiX } from "react-icons/hi";
import GenderAvatar from "./GenderAvatar";
import usePopoverPosition from "../hooks/usePopoverPosition";
import { toEmployeeOption } from "../attendance/EmployeePicker";
import { departmentName } from "../attendance/normalize";

const PANEL_MAX_H = 320;

// Detail line: department and designation, else the email.
const detailOf = (raw, email) => [departmentName(raw), raw?.designation].filter(Boolean).join(" · ") || email || "";

/** Normalise any person-ish row into `{ id, name, code, email, sub, raw }`. */
export function toPersonOption(p) {
  if (p && p.id && p.name && ("sub" in p || "code" in p || "raw" in p)) {
    const raw = p.raw || p;
    const sub = p.sub || detailOf(raw, p.email);
    return { email: "", code: "", ...p, raw, sub: p.active === false ? [sub, "Inactive"].filter(Boolean).join(" · ") : sub };
  }
  const o = toEmployeeOption(p);
  const inactive = p?.is_active === false || p?.status === "inactive";
  return { ...o, sub: [detailOf(p, o.email), inactive ? "Inactive" : ""].filter(Boolean).join(" · ") };
}

const matches = (o, q) => [o.name, o.code, o.email, o.sub].some((f) => f && String(f).toLowerCase().includes(q));

function useOptions(people) {
  return useMemo(() => {
    const seen = new Set();
    return (people || []).map(toPersonOption).filter((o) => {
      if (!o.id || seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }, [people]);
}

function Avatar({ option, size = "w-7 h-7", ring = false }) {
  return (
    <span className={`${size} rounded-full overflow-hidden shrink-0 text-[10px] ${ring ? "ring-2 ring-purple-500" : ""}`}>
      <GenderAvatar person={option.raw || option} name={option.name} />
    </span>
  );
}

/** The shared panel: search box, optional toolbar, people list. */
function SearchPanel({ anchorRef, open, onClose, options, isSelected, onPick, multi, toolbar, emptyText, loading, error }) {
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const pos = usePopoverPosition(open, anchorRef, { height: PANEL_MAX_H, minWidth: 280 });

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? options.filter((o) => matches(o, q)) : options), [options, q]);

  useEffect(() => { if (open) { setQuery(""); setActive(0); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  // Click outside (neither the trigger nor the panel) closes.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || !pos) return null;

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) onPick(shown[active], shown); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); anchorRef.current?.querySelector("button")?.focus(); }
  };

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
      className="z-[300] bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      onKeyDown={onKeyDown}
    >
      <div className="p-2 border-b border-slate-100">
        <div className="relative">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, employee code or email…"
            aria-label="Search people"
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-purple-500"
          />
        </div>
        {toolbar && toolbar(shown)}
      </div>
      <div ref={listRef} role="listbox" aria-multiselectable={multi || undefined} className="overflow-y-auto" style={{ maxHeight: PANEL_MAX_H - 60 }}>
        {loading ? (
          <p className="px-4 py-3 text-xs text-slate-400">Loading people…</p>
        ) : error ? (
          <p className="px-4 py-3 text-xs text-rose-600">{error}</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-3 text-xs text-slate-400">{options.length === 0 ? emptyText : `Nobody matches “${query.trim()}”.`}</p>
        ) : (
          shown.map((o, i) => {
            const selected = isSelected(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={selected}
                data-index={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(o, shown)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 text-left transition-colors ${i === active ? "bg-slate-50" : ""} ${selected ? "bg-purple-50/70" : ""}`}
              >
                {multi && (
                  <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${selected ? "bg-purple-600 border-purple-600 text-white" : "border-slate-300 bg-white"}`}>
                    {selected && <HiCheck className="w-3 h-3" />}
                  </span>
                )}
                <Avatar option={o} ring={!multi && selected} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold truncate ${selected ? "text-purple-700" : "text-slate-800"}`}>
                    {o.name}
                    {o.code && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{o.code}</span>}
                  </span>
                  {o.sub && o.sub !== o.name && <span className="block text-[11px] text-slate-400 truncate">{o.sub}</span>}
                </span>
                {!multi && selected && <HiCheck className="w-4 h-4 text-purple-600 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}

const TRIGGER = "w-full min-h-[42px] flex items-center gap-2 px-3 py-1.5 bg-white border rounded-xl text-sm text-left transition focus:outline-none focus:ring-2 focus:ring-purple-100 disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Pick one person.
 * @param {Array}    people       roster rows or options
 * @param {string}   value        selected id ("" / null for none)
 * @param {Function} onChange     (id, option) — id is "" when cleared
 * @param {string}   [placeholder]
 * @param {string}   [clearLabel] offer a "none/everyone" choice with this label (filters)
 */
export function PersonSelect({
  people, value, onChange, placeholder = "Choose a person", clearLabel, disabled = false, invalid = false,
  loading = false, error = "", emptyText = "No people found.", id, className = "", "aria-label": ariaLabel,
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const options = useOptions(people);
  const selected = options.find((o) => o.id === value) || null;
  const close = useCallback(() => setOpen(false), []);

  const pick = (o) => { onChange(o.id, o); setOpen(false); };
  const clear = (e) => { e.stopPropagation(); onChange("", null); setOpen(false); };

  return (
    <div ref={anchorRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}
        className={`${TRIGGER} ${invalid ? "border-rose-300" : open ? "border-purple-500 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-300"}`}
      >
        {selected ? (
          <>
            <Avatar option={selected} size="w-6 h-6" />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
              {selected.name}
              {selected.code && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{selected.code}</span>}
            </span>
          </>
        ) : (
          <span className={`flex-1 truncate ${clearLabel ? "text-slate-700 font-semibold" : "text-slate-400"}`}>
            {loading ? "Loading people…" : clearLabel || (value ? "Selected person" : placeholder)}
          </span>
        )}
        {selected && clearLabel && !disabled && (
          <span role="button" tabIndex={-1} onClick={clear} className="p-0.5 rounded text-slate-400 hover:text-slate-700" aria-label={`Show ${clearLabel.toLowerCase()}`}>
            <HiX className="w-3.5 h-3.5" />
          </span>
        )}
        <HiChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <SearchPanel
        anchorRef={anchorRef}
        open={open && !disabled}
        onClose={close}
        options={options}
        isSelected={(oid) => oid === value}
        onPick={pick}
        emptyText={emptyText}
        loading={loading}
        error={error}
        toolbar={clearLabel ? () => (
          <button type="button" onClick={clear} className={`mt-2 w-full text-left px-2 py-1.5 rounded-lg text-xs font-bold ${!value ? "bg-purple-50 text-purple-700" : "text-slate-500 hover:bg-slate-50"}`}>
            {clearLabel}
          </button>
        ) : null}
      />
    </div>
  );
}

/**
 * Pick several people.
 * @param {string[]} value    selected ids
 * @param {Function} onChange next ids
 * @param {number}   [max]    refuse to add beyond this many
 * @param {string}   [unknownLabel] chip text for a chosen id no longer in `people`
 */
export function PersonMultiSelect({
  people, value = [], onChange, placeholder = "Choose people", max, unknownLabel = "Selected person", disabled = false, invalid = false,
  loading = false, error = "", emptyText = "No people found.", id, className = "", "aria-label": ariaLabel,
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const options = useOptions(people);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const chosen = new Set(value);
  const atMax = max !== undefined && value.length >= max;
  const close = useCallback(() => setOpen(false), []);

  const toggle = (o) => {
    if (chosen.has(o.id)) onChange(value.filter((v) => v !== o.id));
    else if (!atMax) onChange([...value, o.id]);
  };
  const remove = (e, oid) => { e.stopPropagation(); onChange(value.filter((v) => v !== oid)); };
  const shownChips = value.slice(0, 3);

  return (
    <div ref={anchorRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}
        className={`${TRIGGER} ${invalid ? "border-rose-300" : open ? "border-purple-500 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-300"}`}
      >
        <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
          {value.length === 0 ? (
            <span className="text-slate-400">{loading ? "Loading people…" : placeholder}</span>
          ) : (
            <>
              {shownChips.map((oid) => (
                <span key={oid} className="inline-flex items-center gap-1 max-w-[160px] pl-2 pr-1 py-0.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-md border border-purple-100">
                  <span className="truncate">{byId.get(oid)?.name || unknownLabel}</span>
                  {!disabled && (
                    <span role="button" tabIndex={-1} onClick={(e) => remove(e, oid)} className="w-4 h-4 rounded-full hover:bg-purple-200 flex items-center justify-center" aria-label={`Remove ${byId.get(oid)?.name || "person"}`}>
                      <HiX className="w-3 h-3" />
                    </span>
                  )}
                </span>
              ))}
              {value.length > shownChips.length && <span className="text-xs font-bold text-slate-500">+{value.length - shownChips.length} more</span>}
            </>
          )}
        </span>
        <HiChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <SearchPanel
        anchorRef={anchorRef}
        open={open && !disabled}
        onClose={close}
        options={options}
        multi
        isSelected={(oid) => chosen.has(oid)}
        onPick={toggle}
        emptyText={emptyText}
        loading={loading}
        error={error}
        toolbar={(shown) => (
          <div className="flex items-center justify-between gap-2 mt-2 px-1 text-xs">
            <span className="font-bold text-purple-700">{value.length} chosen{max !== undefined ? ` of at most ${max}` : ""}</span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                disabled={shown.length === 0 || atMax}
                onClick={() => {
                  const add = shown.map((o) => o.id).filter((oid) => !chosen.has(oid));
                  const room = max !== undefined ? Math.max(0, max - value.length) : add.length;
                  onChange([...value, ...add.slice(0, room)]);
                }}
                className="font-bold text-purple-600 hover:underline disabled:opacity-40"
              >
                Choose all shown
              </button>
              <button type="button" disabled={value.length === 0} onClick={() => onChange([])} className="font-bold text-slate-500 hover:underline disabled:opacity-40">Clear</button>
            </span>
          </div>
        )}
      />
    </div>
  );
}
