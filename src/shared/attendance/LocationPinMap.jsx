// ─────────────────────────────────────────────────────────────────────────────
// LocationPinMap — a read-only map: one pin, and the circle that says how sure
// we are about it.
//
// WHY THE CIRCLE IS NOT DECORATION. A GPS fix is a point plus a radius, and the
// radius is routinely 8 m outdoors and 300 m indoors. Drawing the point alone
// invites somebody to read a pin on a building as proof the person was in that
// building. The circle is the honest part of this component, which is why it is
// drawn even when the radius is large enough to swallow the pin.
//
// WHY LEAFLET IS LOADED FROM A CDN AND NOT BUNDLED. Same reasoning, same loader
// as `GeofenceMapPicker` and `AttendanceLocationsPage`: a map is needed on a
// handful of rarely-opened dialogs, and bundling it would cost every other
// route. The <script> and <link> are added once per document and reused. There
// are now three copies of this loader; if you unify them, unify all three.
//
// IT IS DELIBERATELY NOT INTERACTIVE. Dragging, zooming by scroll and
// double-click zoom are all off: this map reports a fact, it does not take
// input, and a map that pans under a cursor inside a scrolling dialog steals
// the scroll. The one affordance is "Open in Maps", which the caller renders.
//
// IT NEVER BLANKS. No coordinates, a blocked CDN or a Leaflet that never
// arrives all land on the same quiet placeholder — a map is the nice version of
// this information, never the only version, and the caller always prints the
// coordinates and the accuracy in text beside it.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiLocationMarker } from "react-icons/hi";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

function ensureLeaflet(onReady, onFail) {
  if (!document.getElementById("leaflet-css")) {
    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
  }
  if (typeof window.L !== "undefined") return onReady();
  const existing = document.getElementById("leaflet-js");
  if (existing) {
    existing.addEventListener("load", onReady);
    existing.addEventListener("error", onFail);
    return undefined;
  }
  const script = document.createElement("script");
  script.id = "leaflet-js";
  script.src = LEAFLET_JS;
  script.addEventListener("load", onReady);
  script.addEventListener("error", onFail);
  document.head.appendChild(script);
  return undefined;
}

/**
 * @param {object} props
 * @param {number|null} props.latitude
 * @param {number|null} props.longitude
 * @param {number|null} [props.accuracyMeters] drawn as the uncertainty circle
 * @param {boolean}     [props.stale]          greys the pin: a remembered fix, not a live one
 * @param {string}      [props.height]         Tailwind height class
 * @param {string}      [props.className]
 */
export default function LocationPinMap({
  latitude, longitude, accuracyMeters = null, stale = false,
  height = "h-56", className = "",
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const [failed, setFailed] = useState(false);

  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!hasPin) return undefined;
    let dead = false;

    const init = () => {
      if (dead || !hostRef.current || typeof window.L === "undefined") return;
      const L = window.L;

      if (!mapRef.current) {
        mapRef.current = L.map(hostRef.current, {
          center: [lat, lng],
          zoom: 16,
          // Read-only: every input gesture is off, including the scroll wheel,
          // which would otherwise eat the dialog's own scroll.
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          touchZoom: false,
          zoomControl: false,
          attributionControl: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      if (markerRef.current) map.removeLayer(markerRef.current);
      if (circleRef.current) map.removeLayer(circleRef.current);

      const colour = stale ? "#94a3b8" : "#7c3aed";
      markerRef.current = L.circleMarker([lat, lng], {
        radius: 7, color: "#ffffff", weight: 3, fillColor: colour, fillOpacity: 1,
      }).addTo(map);

      const radius = Number(accuracyMeters);
      if (Number.isFinite(radius) && radius > 0) {
        circleRef.current = L.circle([lat, lng], {
          radius, color: colour, weight: 1, fillColor: colour, fillOpacity: 0.12,
        }).addTo(map);
        // Frame the uncertainty, not the point — otherwise a 400 m circle sits
        // mostly off-screen and reads as a tight fix.
        map.fitBounds(circleRef.current.getBounds(), { padding: [24, 24], maxZoom: 17 });
      } else {
        map.setView([lat, lng], 16);
      }
      // The host is often inside a dialog that animates in, so Leaflet measures
      // a container that has not finished sizing. One late invalidate fixes the
      // grey half-tiles that produces.
      setTimeout(() => !dead && mapRef.current?.invalidateSize(), 180);
    };

    ensureLeaflet(init, () => !dead && setFailed(true));

    return () => {
      dead = true;
    };
  }, [hasPin, lat, lng, accuracyMeters, stale]);

  // Tear the map down only on unmount; re-running it per prop change would
  // destroy and rebuild the tiles on every poll tick.
  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
    markerRef.current = null;
    circleRef.current = null;
  }, []);

  if (!hasPin || failed) {
    return (
      <div className={`${height} rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-center px-6 ${className}`}>
        <HiLocationMarker className="w-6 h-6 text-slate-300" />
        <p className="text-xs font-semibold text-slate-400">
          {failed ? "The map couldn’t load. The coordinates below are still correct." : "No position to show yet."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={`${height} rounded-xl border border-slate-200 overflow-hidden z-0 ${className}`}
      aria-label="Map of the reported position"
      role="img"
    />
  );
}
