// ─────────────────────────────────────────────────────────────────────────────
// AddressSearchField — type a place, pick it, get coordinates and the address
// fields filled in.
//
// Lifted out of `AttendanceLocationsPage`, which has had this since office
// locations were built, so client sites are registered the same way offices
// are. Nobody should have to read a latitude off a phone to add a site.
//
// The search is DEBOUNCED and self-cancelling: each keystroke aborts the
// request before it, so a fast typist makes one call rather than ten, and a
// slow reply can never overwrite the suggestions for what they typed last.
//
// It never blocks: geocoding is a shortcut on top of the map. If Nominatim is
// unreachable the list stays empty and the pin is still draggable, which is why
// a failure is silent rather than an error banner.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiSearch, HiX } from "react-icons/hi";
import { Spinner } from "../attendance/ui";
import { normalizePlace, searchPlaces } from "../utils/geocoding";

const DEBOUNCE_MS = 600;

/**
 * @param {object}   props
 * @param {Function} props.onSelect  receives a normalized place
 *   ({ latitude, longitude, address, city, state, country, pincode })
 * @param {string}   [props.label]
 * @param {string}   [props.placeholder]
 * @param {string}   [props.id]
 */
export default function AddressSearchField({
  onSelect,
  label = "Find the place",
  placeholder = "Search by name, street or area",
  id = "address-search",
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set when a suggestion is picked, so filling the box with its full address
  // doesn't immediately trigger a fresh search for that same text.
  const justPicked = useRef(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return undefined; }
    if (!query.trim()) { setItems([]); setOpen(false); return undefined; }

    setBusy(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const found = await searchPlaces(query, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setItems(found);
      setOpen(found.length > 0);
      setBusy(false);
    }, DEBOUNCE_MS);

    return () => { clearTimeout(timer); setBusy(false); };
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pick = (item) => {
    const place = normalizePlace(item);
    justPicked.current = true;
    setQuery(place.address);
    setOpen(false);
    setItems([]);
    onSelect?.(place);
  };

  const clear = () => {
    justPicked.current = true;
    setQuery("");
    setItems([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      <div className="relative">
        <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (items.length) setOpen(true); }}
          // Enter takes the best match rather than submitting the whole form,
          // which is what a search box in a form otherwise does.
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (items.length) pick(items[0]); }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-results`}
          className="w-full pl-9 pr-9 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {busy ? <Spinner className="w-3.5 h-3.5" />
            : query ? <button type="button" onClick={clear} aria-label="Clear the search" className="p-0.5 text-slate-400 hover:text-slate-700"><HiX className="w-3.5 h-3.5" /></button>
              : null}
        </span>
      </div>

      {open && items.length > 0 && (
        <ul id={`${id}-results`} role="listbox" className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-56 overflow-y-auto">
          {items.map((item) => (
            <li key={item.place_id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => pick(item)}
                className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-purple-50 transition-colors"
              >
                {item.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-slate-400 mt-1">Picking a result fills the address below and moves the pin. You can still drag the pin to fine-tune it.</p>
    </div>
  );
}
