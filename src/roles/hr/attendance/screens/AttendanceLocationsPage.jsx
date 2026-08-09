import React, { useState, useEffect, useRef } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import PageHeader from "../../../../shared/components/PageHeader";
import { attendanceAPI } from "../../../../shared/api";
import { HiSparkles, HiPlus, HiPencil, HiTrash, HiLocationMarker, HiX, HiSearch } from "react-icons/hi";

function AttendanceLocationsPage() {
  const [locations, setLocations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", latitude: "", longitude: "", radius_meters: 100 });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  useEffect(() => { fetchLocations(); }, []);

  const fetchLocations = async () => {
    try {
      const res = await attendanceAPI.getLocations();
      if (res.success) setLocations(res.data || []);
    } catch (err) { console.error(err); }
  };

  const openModal = (loc = null) => {
    if (loc) {
      setEditingLocation(loc);
      setForm({ name: loc.name, address: loc.address || "", latitude: String(loc.latitude), longitude: String(loc.longitude), radius_meters: loc.radius_meters || 100 });
    } else {
      setEditingLocation(null);
      setForm({ name: "", address: "", latitude: "", longitude: "", radius_meters: 100 });
    }
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

      const lat = parseFloat(form.latitude) || 28.6139;
      const lng = parseFloat(form.longitude) || 77.209;

      const map = window.L.map(mapRef.current).setView([lat, lng], 15);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);

      const marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      const circle = window.L.circle([lat, lng], { radius: form.radius_meters, color: "#7E22CE", fillColor: "#9333ea", fillOpacity: 0.15, weight: 2 }).addTo(map);

      marker.on("dragend", (e) => {
        const pos = e.target.getLatLng();
        setForm(prev => ({ ...prev, latitude: pos.lat.toFixed(6), longitude: pos.lng.toFixed(6) }));
        circle.setLatLng(pos);
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
    if (circleRef.current) circleRef.current.setRadius(form.radius_meters);
  }, [form.radius_meters]);

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
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
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
      address: item.display_name
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
    const payload = {
      name: form.name,
      address: form.address,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius_meters: parseInt(form.radius_meters),
    };
    try {
      if (editingLocation) {
        await attendanceAPI.updateLocation(editingLocation.id, payload);
      } else {
        await attendanceAPI.createLocation(payload);
      }
      closeModal();
      fetchLocations();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save location");
    }
  };

  const handleToggleActive = async (loc) => {
    try {
      await attendanceAPI.updateLocation(loc.id, { is_active: !loc.is_active });
      fetchLocations();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (loc) => {
    if (!confirm(`Delete location "${loc.name}"? This action cannot be undone.`)) return;
    try {
      await attendanceAPI.deleteLocation(loc.id);
      fetchLocations();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Attendance Locations" />
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Office Locations</h1>
              <p className="text-sm text-slate-500 mt-1">Define geographical perimeters where employees can clock in.</p>
            </div>
            <button onClick={() => openModal()} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shrink-0">
              <HiPlus className="w-4 h-4" /> Add Location
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Coordinates</th>
                    <th className="px-6 py-4">Radius</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {locations.length === 0 ? (
                    <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">No locations configured yet. Add your first office location.</td></tr>
                  ) : locations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold text-primary-800 flex items-center gap-2">
                        <HiLocationMarker className="w-4 h-4 text-purple-500" /> {loc.name}
                      </td>
                      <td className="px-6 py-4 text-slate-500 max-w-[200px] truncate">{loc.address || "--"}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{loc.latitude}, {loc.longitude}</td>
                      <td className="px-6 py-4 font-medium">{loc.radius_meters}m</td>
                      <td className="px-6 py-4">
                        <button onClick={() => handleToggleActive(loc)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${loc.is_active ? "bg-purple-600" : "bg-slate-300"}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${loc.is_active ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => openModal(loc)} className="text-slate-400 hover:text-purple-600 transition-colors"><HiPencil className="w-4 h-4 inline" /></button>
                        <button onClick={() => handleDelete(loc)} className="text-slate-400 hover:text-rose-500 transition-colors"><HiTrash className="w-4 h-4 inline" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{editingLocation ? "Edit Location" : "Add New Location"}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><HiX className="w-5 h-5" /></button>
            </div>

            {/* Body */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto">
              
              {/* Left Side: Map Preview */}
              <div className="flex-1 p-6 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 min-h-[400px]">
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
                <div ref={mapRef} className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden relative z-0 min-h-[350px]" />
              </div>

              {/* Right Side: Input Fields */}
              <div className="w-full lg:w-[400px] p-6 flex flex-col gap-5 shrink-0 bg-slate-50/50">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Head Office" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Address</label>
                  <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Business Park" rows="3" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Latitude *</label>
                  <input type="text" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="28.6139" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Longitude *</label>
                  <input type="text" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="77.2090" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Radius: <span className="text-purple-600 font-bold">{form.radius_meters}m</span></label>
                  <input type="range" min="25" max="1000" step="25" value={form.radius_meters} onChange={e => setForm({ ...form, radius_meters: parseInt(e.target.value) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600 shadow-inner" />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1.5"><span>25m</span><span>500m</span><span>1000m</span></div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-100 shrink-0 bg-white">
              <button onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={!form.name || !form.latitude || !form.longitude} className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-purple-600/20 transition-all active:scale-95">
                {editingLocation ? "Update Location" : "Create Location"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttendanceLocationsPage;
