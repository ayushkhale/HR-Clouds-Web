// ─────────────────────────────────────────────────────────────────────────────
// AttendanceLocationsPage (HR) — the office locations an organisation clocks in
// at, and the map dialog that creates and edits one.
//
// The LIST is not in this file. Reading the locations lives in
// `shared/attendance/officePlanes.js` and drawing them in
// `shared/attendance/OfficeLocationsView.jsx`, because the manager workspace
// shows the same list (§2) and two copies of a card would drift. What stays
// here is everything only HR can do: Add Location, the Leaflet map dialog and
// the active/inactive switch. `POST` and `PUT /organizations/locations` are
// super-admin/admin/hr only (public/ref docs/md_organization/3_org_structure_api.md),
// so the manager page mounts the same view with those props left off.
//
// The dialog's search box and pin drag go through shared/utils/geocoding.js
// (Google Geocoding v4, then Nominatim — 2026-10-24) like every other map. It
// used to call Nominatim inline, which would have left offices on one provider
// while sites and the app's clock-in photo moved to another.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiPlus, HiX, HiSearch } from "react-icons/hi";
import FieldHelp from "../../../../shared/fieldHelp/FieldHelp";
import { useOfficeLocations } from "../../../../shared/attendance/officePlanes";
import OfficeLocationsView from "../../../../shared/attendance/OfficeLocationsView";
import { reverseGeocode, searchPlaces } from "../../../../shared/utils/geocoding";

// Best-effort default timezone for new locations. The backend defaults to UTC
// when omitted, which silently breaks attendance geofence/clock calculations,
// so we always send a real IANA zone (documented `timezone` field).
const BROWSER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
})();

function AttendanceLocationsPage() {
  const list = useOfficeLocations("hr");
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", latitude: "", longitude: "", geofence_radius_meters: 100, city: "", state: "", country: "", pincode: "", timezone: BROWSER_TZ });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const openModal = (loc = null) => {
    setSaveError("");
    if (loc) {
      setEditingLocation(loc);
      setForm({ name: loc.name || "", address: loc.address || "", latitude: String(loc.latitude ?? ""), longitude: String(loc.longitude ?? ""), geofence_radius_meters: loc.geofence_radius_meters || 100, city: loc.city || "", state: loc.state || "", country: loc.country || "", pincode: loc.zip_code || loc.pincode || "", timezone: loc.timezone || BROWSER_TZ });
      setSearchQuery(loc.address || "");
    } else {
      setEditingLocation(null);
      setForm({ name: "", address: "", latitude: "", longitude: "", geofence_radius_meters: 100, city: "", state: "", country: "", pincode: "", timezone: BROWSER_TZ });
      setSearchQuery("");
    }
    setSuggestions([]);
    setShowSuggestions(false);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingLocation(null); };

  // Initialize Leaflet map when modal opens
  useEffect(() => {
    if (!showModal || !mapRef.current) return;
    // Load Leaflet CSS if not already loaded
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (typeof window.L === "undefined") return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

      // Note: 0 is a valid coordinate, so test for finiteness rather than truthiness.
      const parsedLat = parseFloat(form.latitude);
      const parsedLng = parseFloat(form.longitude);
      const lat = Number.isFinite(parsedLat) ? parsedLat : 28.6139;
      const lng = Number.isFinite(parsedLng) ? parsedLng : 77.209;

      const map = window.L.map(mapRef.current).setView([lat, lng], 15);
      window.L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "&copy; Google Maps"
      }).addTo(map);

      const marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      const circle = window.L.circle([lat, lng], { radius: form.geofence_radius_meters, color: "#7E22CE", fillColor: "#9333ea", fillOpacity: 0.15, weight: 2 }).addTo(map);

      marker.on("dragend", async (e) => {
        const pos = e.target.getLatLng();
        setForm(prev => ({ ...prev, latitude: pos.lat.toFixed(6), longitude: pos.lng.toFixed(6) }));
        circle.setLatLng(pos);
        
        // Soft, like every geocode: no address found leaves the pin where it was dropped.
        const place = await reverseGeocode(pos.lat, pos.lng);
        if (place) {
          setForm(prev => ({
            ...prev,
            address: place.address,
            city: place.city,
            state: place.state,
            country: place.country,
            pincode: place.pincode
          }));
          setSearchQuery(place.address);
        }
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;

      setTimeout(() => map.invalidateSize(), 200);
    };

    if (typeof window.L !== "undefined") {
      setTimeout(initMap, 100);
    } else {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setTimeout(initMap, 100);
      document.head.appendChild(script);
    }

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, [showModal]);

  // Update circle radius when slider changes
  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(form.geofence_radius_meters);
  }, [form.geofence_radius_meters]);

  // Update marker and circle when lat/lng inputs change
  useEffect(() => {
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (!isNaN(lat) && !isNaN(lng) && markerRef.current && circleRef.current && mapInstanceRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom());
    }
  }, [form.latitude, form.longitude]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    // Don't search if the query exactly matches the form address (meaning they just selected it)
    if (searchQuery === form.address) {
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const data = await searchPlaces(searchQuery);
        if (data && data.length > 0) {
          setSuggestions(data.slice(0, 5)); // show top 5
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (err) {
        console.error("Geocoding failed", err);
      } finally {
        setIsSearching(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, form.address]);

  const handleSelectSuggestion = (item) => {
    setForm(prev => ({
      ...prev,
      latitude: parseFloat(item.lat).toFixed(6),
      longitude: parseFloat(item.lon).toFixed(6),
      address: item.display_name,
      city: item.address?.city || item.address?.town || item.address?.village || "",
      state: item.address?.state || "",
      country: item.address?.country || "",
      pincode: item.address?.postcode || ""
    }));
    setSearchQuery(item.display_name);
    setShowSuggestions(false);
  };

  const handleSearchLocation = () => {
    if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
    }
  };

  const handleSave = async () => {
    setSaveError("");

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (!form.name?.trim()) {
      setSaveError("Location name is required.");
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setSaveError("Latitude must be a number between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setSaveError("Longitude must be a number between -180 and 180.");
      return;
    }

    // Documented location schema: name, address, city, state, country, zip_code,
    // timezone, is_active. Geofence lat/long/radius are sent alongside because
    // attendance clock-in depends on them (per the org-structure API note).
    const payload = {
      name: form.name?.trim(),
      address: form.address?.trim(),
      latitude: lat,
      longitude: lng,
      geofence_radius_meters: parseInt(form.geofence_radius_meters, 10) || 100,
      city: form.city?.trim(),
      state: form.state?.trim(),
      country: form.country?.trim(),
      zip_code: form.pincode?.trim(),
      timezone: form.timezone || BROWSER_TZ,
    };
    setSaving(true);
    try {
      if (editingLocation) {
        await list.plane.update(editingLocation.id, payload);
      } else {
        await list.plane.create(payload);
      }
      closeModal();
      // Silent: the cards are already on screen, so a skeleton here would
      // blank the list the person was just looking at.
      list.reload({ silent: true });
    } catch (err) {
      console.error(err);
      setSaveError(err?.data?.message || err.message || "Failed to save location");
    } finally {
      setSaving(false);
    }
  };

  // Flip the card in place. Refetching the list here swapped every card for a
  // loading skeleton, so the whole page flashed and re-rendered on each toggle.
  // Ids with a status request in flight. A second click before the first
  // request settles would race it, and a failed first request could revert
  // the second — so the toggle is locked per card until it settles.
  const [togglingIds, setTogglingIds] = useState(() => new Set());
  const handleToggleActive = async (loc) => {
    if (togglingIds.has(loc.id)) return;
    list.setError("");
    const setPending = (on) => setTogglingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(loc.id);
      else next.delete(loc.id);
      return next;
    });
    const nextActive = !loc.is_active;
    const patch = (fields) => list.patch(loc.id, fields);
    setPending(true);
    patch({ is_active: nextActive });
    try {
      const res = await list.plane.update(loc.id, { is_active: nextActive });
      const updated = res?.data && typeof res.data === "object" && !Array.isArray(res.data) ? res.data : null;
      if (updated && updated.id === loc.id) patch(updated);
    } catch (err) {
      console.error(err);
      patch({ is_active: loc.is_active });
      list.setError(err?.data?.message || err?.message || "Could not update the location status.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
        <DashboardTopBar title="Office Locations" />
        <main className="p-6 sm:p-8 space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-bold text-slate-900">Office Locations</h1>
                <FieldHelp surface="organization.office_locations" field="page" label="office locations" />
              </div>
              <p className="text-sm text-slate-500 mt-1">Define geographical perimeters where employees can clock in.</p>
            </div>
            <button
              onClick={() => openModal()}
              className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              <HiPlus className="w-4 h-4" /> Add Location
            </button>
          </div>

          {/* Search, states and the cards are the shared view, so HR's and the
              manager's lists are literally the same component. The two write
              affordances are passed in — a role without them gets no pencil and
              no status switch, rather than a disabled one. */}
          <OfficeLocationsView
            list={list}
            onEdit={openModal}
            onToggle={handleToggleActive}
            togglingIds={togglingIds}
          />
        </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{editingLocation ? "Edit Location" : "Add New Location"}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><HiX className="w-5 h-5" /></button>
            </div>

            {/* Body */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto">
              
              {/* Left Side: Map Preview */}
              <div className="flex-1 p-4 sm:p-6 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 min-h-[250px] sm:min-h-[400px]">
                <label className="block text-sm font-bold text-slate-800 mb-3">Map Preview <span className="text-slate-400 font-normal">(search or drag pin to set location)</span></label>
                <div className="flex gap-2 mb-4 shrink-0 relative">
                  <div className="relative flex-1">
                    <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleSearchLocation(); } }}
                      placeholder="Search for a city, landmark, or address..."
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-xs"
                    />
                    
                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {suggestions.map((item, idx) => (
                          <li 
                            key={item.place_id || idx} 
                            onClick={() => handleSelectSuggestion(item)}
                            className="px-4 py-3 hover:bg-purple-50 cursor-pointer flex flex-col gap-0.5 transition-colors"
                          >
                            <span className="text-sm font-semibold text-slate-700 truncate">{item.name || item.display_name.split(',')[0]}</span>
                            <span className="text-xs text-slate-500 truncate">{item.display_name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button 
                    type="button"
                    onClick={handleSearchLocation}
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-5 py-2.5 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:bg-slate-50 disabled:text-slate-400 text-sm font-bold rounded-lg transition-colors whitespace-nowrap shadow-xs"
                  >
                    {isSearching ? "Searching..." : "Search"}
                  </button>
                </div>
                <div ref={mapRef} className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden relative z-0 min-h-[200px] sm:min-h-[350px]" />
              </div>

              {/* Right Side: Input Fields */}
              <div className="w-full lg:w-[400px] p-4 sm:p-6 flex flex-col gap-5 shrink-0 bg-slate-50/50">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Head Office" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Address</label>
                  <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Business Park" rows="3" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Latitude *</label>
                    <input type="text" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="28.6139" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Longitude *</label>
                    <input type="text" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="77.2090" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
                    <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="New Delhi" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">State</label>
                    <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="Delhi" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Country</label>
                    <input type="text" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="India" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pincode</label>
                    <input type="text" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} placeholder="110001" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Timezone</label>
                    <FieldHelp surface="organization.location_setup" field="timezone" label="the time zone" className="mb-1.5" />
                  </div>
                  <input type="text" value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="Asia/Kolkata" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                  <p className="text-[10px] text-slate-400 mt-1">IANA zone used for attendance calculations at this location.</p>
                </div>
                <div>
                  <div className="flex items-center">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Radius: <span className="text-purple-600 font-bold">{form.geofence_radius_meters}m</span></label>
                    <FieldHelp surface="organization.location_setup" field="geofence_radius_meters" label="the clock-in radius" className="mb-1.5" />
                  </div>
                  <input type="range" min="25" max="1000" step="25" value={form.geofence_radius_meters} onChange={e => setForm({ ...form, geofence_radius_meters: parseInt(e.target.value) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600 shadow-inner" />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1.5"><span>25m</span><span>500m</span><span>1000m</span></div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 p-6 border-t border-slate-100 shrink-0 bg-white">
              {saveError && (
                <div className="mr-auto text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {saveError}
                </div>
              )}
              <button onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.latitude || !form.longitude} className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-purple-600/20 transition-all active:scale-95">
                {saving ? "Saving…" : editingLocation ? "Update Location" : "Create Location"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AttendanceLocationsPage;
