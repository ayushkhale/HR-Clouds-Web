// ─────────────────────────────────────────────────────────────────────────────
// TimeField.jsx — The one time picker for the whole app (every role).
//
// Type the time straight into the field ("9:30 am", "930p", "21:15", "0930"),
// or open the picker and click an hour, a minute and AM/PM. The value is always
// a 24-hour "HH:mm" string (or "" when empty) — the same shape
// <input type="time"> used — so forms and validation need no changes. It is
// shown as 12-hour with am/pm, which is how the rest of the app shows times.
//
// This replaced react-time-picker, whose pop-up clock (react-clock) is only a
// picture: clicking it never set a time, and the pop-up was clipped inside
// modals. The panel here is portalled, like the people picker.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiClock, HiX } from "react-icons/hi";
import usePopoverPosition from "../hooks/usePopoverPosition";

const PANEL_H = 300;
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const pad = (n) => String(n).padStart(2, "0");

/** "HH:mm" → { h12, m, pm } or null. */
function split(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h12: h % 12 === 0 ? 12 : h % 12, m: min, pm: h >= 12 };
}

const join = ({ h12, m, pm }) => `${pad((h12 % 12) + (pm ? 12 : 0))}:${pad(m)}`;

/** "HH:mm" → "9:30 AM" for display. */
export function formatTime12(value) {
  const t = split(value);
  return t ? `${t.h12}:${pad(t.m)} ${t.pm ? "PM" : "AM"}` : "";
}

/**
 * Loose typed input → "HH:mm", or null when it can't be read.
 * Accepts "9", "9:30", "930", "0930", "9.30pm", "9:30 a.m.", "21:15".
 */
export function parseTime(text) {
  const raw = String(text || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";
  const meridiem = /(a|am|a\.m\.|p|pm|p\.m\.)$/.exec(raw);
  const isPm = meridiem ? meridiem[1].startsWith("p") : null;
  const digits = (meridiem ? raw.slice(0, -meridiem[1].length) : raw).replace(/[.:]/, ":");
  let h;
  let m;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(digits);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{1,4}$/.test(digits)) {
    if (digits.length <= 2) { h = Number(digits); m = 0; }
    else { h = Number(digits.slice(0, -2)); m = Number(digits.slice(-2)); }
  } else {
    return null;
  }
  if (m > 59) return null;
  if (isPm === null) {
    if (h > 23) return null;
  } else {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (isPm ? 12 : 0);
  }
  return `${pad(h)}:${pad(m)}`;
}

function Column({ label, items, isActive, onPick, render }) {
  const ref = useRef(null);
  // Bring the chosen entry into view when the panel opens.
  useEffect(() => {
    ref.current?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center pb-1.5">{label}</p>
      <div ref={ref} role="listbox" aria-label={label} className="flex-1 overflow-y-auto [scrollbar-width:thin] space-y-0.5 px-1">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={String(item)}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onPick(item)}
              className={`w-full py-1.5 rounded-lg text-sm font-semibold tabular-nums transition-colors ${active ? "bg-purple-600 text-white" : "text-slate-700 hover:bg-purple-50"}`}
            >
              {render(item)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TimeField({
  value,
  onChange,
  invalid = false,
  disabled = false,
  clearable = true,
  label,
  className = "",
  placeholder = "--:-- --",
}) {
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatTime12(value));
  const [typingError, setTypingError] = useState(false);
  const pos = usePopoverPosition(open, anchorRef, { height: PANEL_H, minWidth: 240 });

  // Keep the text in step with the value unless the user is mid-typing.
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setText(formatTime12(value));
  }, [value]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  const current = split(value) || { h12: 9, m: 0, pm: false };
  const set = (patch) => onChange(join({ ...current, ...patch }));

  const commitText = () => {
    typing.current = false;
    const parsed = parseTime(text);
    if (parsed === null) {
      setTypingError(true);
      return;
    }
    setTypingError(false);
    if (parsed === "" && !clearable) { setText(formatTime12(value)); return; }
    if (parsed !== (value || "")) onChange(parsed);
    setText(formatTime12(parsed));
  };

  const setNow = () => {
    const d = new Date();
    onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  return (
    <div ref={anchorRef} className={`relative ${className}`} role="group" aria-label={label}>
      <div
        className={`flex items-center gap-2 w-full min-h-[42px] px-3 rounded-xl border transition ${disabled ? "bg-slate-50 opacity-60" : "bg-slate-50 focus-within:bg-white"} ${
          invalid || typingError ? "border-rose-300" : open ? "border-purple-500 ring-2 ring-purple-100 bg-white" : "border-slate-200 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100"
        }`}
      >
        <input
          type="text"
          inputMode="text"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={invalid || typingError || undefined}
          onChange={(e) => { typing.current = true; setTypingError(false); setText(e.target.value); }}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitText(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
          }}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal"
        />
        {clearable && value && !disabled && (
          <button type="button" onClick={() => { onChange(""); setText(""); }} className="p-0.5 text-slate-400 hover:text-slate-700" aria-label="Clear time">
            <HiX className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`p-0.5 transition-colors ${open ? "text-purple-600" : "text-slate-400 hover:text-purple-600"}`}
          aria-label="Pick a time"
        >
          <HiClock className="w-4 h-4" />
        </button>
      </div>
      {typingError && <p className="text-[11px] text-rose-600 mt-1">Type a time like 9:30 am or 21:30.</p>}

      {pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label ? `${label}: pick a time` : "Pick a time"}
          style={{ position: "fixed", left: pos.left, width: Math.max(pos.width, 240), top: pos.top, bottom: pos.bottom, height: PANEL_H }}
          className="z-[300] bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col p-3 animate-in fade-in zoom-in-95 duration-100"
        >
          <p className="text-center text-lg font-bold text-slate-800 tabular-nums pb-2 mb-2 border-b border-slate-100">
            {value ? formatTime12(value) : <span className="text-slate-400 font-semibold">No time set</span>}
          </p>
          <div className="flex-1 min-h-0 flex gap-1">
            <Column label="Hour" items={HOURS} isActive={(h) => !!value && current.h12 === h} onPick={(h) => set({ h12: h })} render={(h) => h} />
            <Column label="Minute" items={MINUTES} isActive={(m) => !!value && current.m === m} onPick={(m) => set({ m })} render={(m) => pad(m)} />
            <Column label="" items={["AM", "PM"]} isActive={(p) => !!value && (p === "PM") === current.pm} onPick={(p) => set({ pm: p === "PM" })} render={(p) => p} />
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-slate-100">
            <button type="button" onClick={setNow} className="text-xs font-bold text-purple-600 hover:underline">Now</button>
            <div className="flex items-center gap-3">
              {clearable && value && (
                <button type="button" onClick={() => onChange("")} className="text-xs font-bold text-slate-500 hover:underline">Clear</button>
              )}
              <button type="button" onClick={close} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700">Done</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
