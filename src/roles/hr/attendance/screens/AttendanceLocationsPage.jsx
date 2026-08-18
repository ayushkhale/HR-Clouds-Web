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
  const [form, setForm] = useState({ name: "", address: "", latitude: "", longitude: "", geofence_radius_meters: 100, city: "", state: "", country: "", pincode: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState("");
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
      setForm({ name: loc.name, address: loc.address || "", latitude: String(loc.latitude), longitude: String(loc.longitude), geofence_radius_meters: loc.geofence_radius_meters || 100, city: loc.city || "", state: loc.state || "", country: loc.country || "", pincode: loc.pincode || "" });
    } else {
      setEditingLocation(null);
      setForm({ name: "", address: "", latitude: "", longitude: "", geofence_radius_meters: 100, city: "", state: "", country: "", pincode: "" });
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
      const circle = window.L.circle([lat, lng], { radius: form.geofence_radius_meters, color: "#7E22CE", fillColor: "#9333ea", fillOpacity: 0.15, weight: 2 }).addTo(map);

      marker.on("dragend", async (e) => {
        const pos = e.target.getLatLng();
        setForm(prev => ({ ...prev, latitude: pos.lat.toFixed(6), longitude: pos.lng.toFixed(6) }));
        circle.setLatLng(pos);
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&addressdetails=1`);
          const data = await res.json();
          if (data && data.address) {
            setForm(prev => ({
              ...prev,
              address: data.display_name,
              city: data.address.city || data.address.town || data.address.village || "",
              state: data.address.state || "",
              country: data.address.country || "",
              pincode: data.address.postcode || ""
            }));
            setSearchQuery(data.display_name);
          }
        } catch (err) {
          console.error("Reverse geocoding failed", err);
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
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&addressdetails=1`);
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
    const payload = {
      name: form.name?.toUpperCase(),
      address: form.address?.toUpperCase(),
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      geofence_radius_meters: parseInt(form.geofence_radius_meters),
      city: form.city?.toUpperCase(),
      state: form.state?.toUpperCase(),
      country: form.country?.toUpperCase(),
      pincode: form.pincode,
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

  const filteredLocations = locations.filter(loc =>
    (loc.name || "").toLowerCase().includes(localSearchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Attendance Locations" />
        <main className="p-6 sm:p-8 space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Office Locations</h1>
              <p className="text-sm text-slate-500 mt-1">Define geographical perimeters where employees can clock in.</p>
            </div>
            <button
              onClick={() => openModal()}
              className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              <HiPlus className="w-4 h-4" /> Add Location
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <HiSearch className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={localSearchQuery}
                  onChange={(e) => setLocalSearchQuery(e.target.value)}
                  placeholder="Search location..."
                  className="w-full bg-slate-50/70 border border-slate-200/80 rounded-full pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {filteredLocations.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-400 font-medium">
                  <HiLocationMarker className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  No locations found.
                </div>
              ) : (
                filteredLocations.map((loc) => (
                  <div 
                    key={loc.id} 
                    className={`rounded-[20px] transition-all duration-300 group flex flex-col overflow-hidden relative ${
                      loc.is_active
                      ? 'bg-white border border-slate-100 hover:border-purple-200 hover:shadow-xl hover:-translate-y-1 shadow-sm'
                      : 'bg-slate-50/50 border border-dashed border-slate-300 hover:border-slate-400 opacity-90 hover:opacity-100 hover:-translate-y-1 shadow-inner'
                    }`}
                  >
                    
                    {/* Header Area */}
                    <div className="p-6 pb-4 border-b border-slate-50 relative">
                      <div className="flex justify-between items-start mb-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-full border ${
                          loc.is_active 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-rose-50 text-rose-600 border-rose-100'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${loc.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {loc.is_active ? 'Active' : 'Inactive'}
                        </div>
                        
                        <button onClick={() => openModal(loc)} className="text-slate-400 hover:text-purple-600 transition-colors p-1.5 rounded-lg hover:bg-purple-50">
                          <HiPencil className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          loc.is_active ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <HiLocationMarker className="w-5 h-5" />
                        </div>
                        <h3 className={`text-[17px] font-bold leading-tight transition-colors line-clamp-1 ${
                          loc.is_active ? 'text-slate-900 group-hover:text-purple-700' : 'text-slate-700'
                        }`}>
                          {loc.name}
                        </h3>
                      </div>
                    </div>

                    {/* Body Area */}
                    <div className="p-6 pt-4 flex-1 flex flex-col gap-4">
                      
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Address</p>
                        <p className="text-xs font-medium text-slate-700 leading-relaxed line-clamp-2">
                          {loc.address || "--"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-auto">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">City & State</p>
                          <p className="text-xs font-semibold text-slate-700 truncate">{loc.city ? `${loc.city}, ${loc.state}` : '--'}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Radius</p>
                          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                            <HiSparkles className="w-3.5 h-3.5 text-purple-500" />
                            {loc.geofence_radius_meters} meters
                          </p>
                        </div>
                      </div>

                    </div>

                    {/* Footer Area for Status Toggle */}
                    <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between shrink-0">
                      <span className="text-xs font-bold text-slate-600">Location Status</span>
                      <button onClick={() => handleToggleActive(loc)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${loc.is_active ? "bg-purple-600" : "bg-slate-300"}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${loc.is_active ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeModal}>
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Radius: <span className="text-purple-600 font-bold">{form.geofence_radius_meters}m</span></label>
                  <input type="range" min="25" max="1000" step="25" value={form.geofence_radius_meters} onChange={e => setForm({ ...form, geofence_radius_meters: parseInt(e.target.value) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600 shadow-inner" />
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
