// ─────────────────────────────────────────────────────────────────────────────
// GeofenceMapPicker — drag a pin, get coordinates and a radius circle.
//
// Leaflet is loaded from a CDN on first use and read off `window.L`, NOT bundled.
// That is deliberate and matches `AttendanceLocationsPage`, which does the same:
// a map is needed on two rarely-opened dialogs, and bundling it would cost every
// other route. The loader is idempotent — the <script> and <link> are added once
// per document and reused.
//
// WHY THIS EXISTS SEPARATELY: field sites REQUIRE coordinates (a site exists only
// to be geofenced), whereas office locations treat them as optional. Rather than
// reach into that page's 589-line body, the picker is lifted here for the new
// screen. `AttendanceLocationsPage` still has its own copy — it is not refactored
// here on purpose, to keep this change surgical. If you touch both, unify them.
//
// The circle redraws when `radius` changes so the person can see what a 250 m
// geofence actually covers before they save it — the number alone means nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

// Centre of India — only ever used when there is no pin yet, so the first drag
// is a short one wherever the org is.
const FALLBACK = { lat: 28.6139, lng: 77.209 };

function ensureLeaflet(onReady) {
  if (!document.getElementById("leaflet-css")) {
    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
  }
  if (typeof window.L !== "undefined") return onReady();
  const existing = document.getElementById("leaflet-js");
  if (existing) return existing.addEventListener("load", onReady);
  const script = document.createElement("script");
  script.id = "leaflet-js";
  script.src = LEAFLET_JS;
  script.addEventListener("load", onReady);
  document.head.appendChild(script);
  return undefined;
}

/**
 * @param {object}   props
 * @param {number|null} props.latitude
 * @param {number|null} props.longitude
 * @param {number}   props.radius      metres, drawn as a circle
 * @param {Function} props.onChange    ({ latitude, longitude }) on drag/click
 * @param {string}   [props.className]
 */
export default function GeofenceMapPicker({ latitude, longitude, radius = 250, onChange, className = "", fill = false }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  // Held in a ref so moving the pin never re-runs the setup effect and tears the
  // map down mid-drag.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let dead = false;

    const init = () => {
      if (dead || !hostRef.current || typeof window.L === "undefined") return;
      if (mapRef.current) return; // already built

      const lat = Number.isFinite(latitude) ? latitude : FALLBACK.lat;
      const lng = Number.isFinite(longitude) ? longitude : FALLBACK.lng;

      const map = window.L.map(hostRef.current).setView([lat, lng], 15);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      const circle = window.L.circle([lat, lng], {
        radius, color: "#7E22CE", fillColor: "#9333ea", fillOpacity: 0.15, weight: 2,
      }).addTo(map);

      const move = (pos) => {
        circle.setLatLng(pos);
        onChangeRef.current?.({ latitude: Number(pos.lat.toFixed(6)), longitude: Number(pos.lng.toFixed(6)) });
      };
      marker.on("dragend", (e) => move(e.target.getLatLng()));
      // Tapping is far easier than dragging on a phone, so both work.
      map.on("click", (e) => { marker.setLatLng(e.latlng); move(e.latlng); });

      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
      // The dialog animates in, so the container has no height on the first
      // frame and Leaflet renders a grey box without this.
      setTimeout(() => map.invalidateSize(), 200);
    };

    ensureLeaflet(init);
    return () => {
      dead = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markerRef.current = null;
      circleRef.current = null;
    };
    // Built once per mount; the pin and circle are updated by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow coordinates that changed from outside the map (a typed value, or an
  // edit dialog loading its row after the map was built).
  useEffect(() => {
    if (!markerRef.current || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const pos = [latitude, longitude];
    markerRef.current.setLatLng(pos);
    circleRef.current?.setLatLng(pos);
    mapRef.current?.setView(pos);
  }, [latitude, longitude]);

  useEffect(() => {
    if (circleRef.current && Number.isFinite(radius)) circleRef.current.setRadius(radius);
  }, [radius]);

  // `fill` lets the map take the remaining height of a flex column, which is how
  // the office-location dialog sizes its map. Otherwise it keeps a fixed height
  // so it still works in an ordinary stacked form.
  return (
    <div
      ref={hostRef}
      className={`w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative z-0 ${fill ? "flex-1 min-h-[200px] sm:min-h-[350px]" : ""} ${className}`}
      style={fill ? undefined : { height: 260 }}
    />
  );
}
