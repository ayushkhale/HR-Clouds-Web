// ─────────────────────────────────────────────────────────────────────────────
// LocationPinMap — a read-only map: one pin, and the circle that says how sure
// we are about it.
//
// Powered by the official Google Maps JavaScript SDK, with a zero-watermark
// fallback if the SDK is blocked by client adblockers.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiLocationMarker } from "react-icons/hi";
import { loadGoogleMaps } from "../utils/googleMapsLoader";

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
  latitude,
  longitude,
  accuracyMeters = null,
  stale = false,
  height = "h-56",
  className = "",
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

    const initFallback = () => {
      if (dead || !hostRef.current) return;
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const setup = () => {
        if (dead || !hostRef.current || typeof window.L === "undefined") return;
        if (!mapRef.current) {
          // attributionControl: false ensures NO Leaflet watermark
          mapRef.current = window.L.map(hostRef.current, {
            center: [lat, lng],
            zoom: 16,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            touchZoom: false,
            zoomControl: false,
            attributionControl: false,
          });
          window.L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
            maxZoom: 20,
            subdomains: ["mt0", "mt1", "mt2", "mt3"],
          }).addTo(mapRef.current);
        }

        const map = mapRef.current;
        if (markerRef.current) map.removeLayer(markerRef.current);
        if (circleRef.current) map.removeLayer(circleRef.current);

        const colour = stale ? "#94a3b8" : "#7c3aed";
        markerRef.current = window.L.circleMarker([lat, lng], {
          radius: 7,
          color: "#ffffff",
          weight: 3,
          fillColor: colour,
          fillOpacity: 1,
        }).addTo(map);

        const radius = Number(accuracyMeters);
        if (Number.isFinite(radius) && radius > 0) {
          circleRef.current = window.L.circle([lat, lng], {
            radius,
            color: colour,
            weight: 1,
            fillColor: colour,
            fillOpacity: 0.12,
          }).addTo(map);
          map.fitBounds(circleRef.current.getBounds(), { padding: [24, 24], maxZoom: 17 });
        } else {
          map.setView([lat, lng], 16);
        }
        setTimeout(() => !dead && mapRef.current?.invalidateSize?.(), 180);
      };

      if (typeof window.L !== "undefined") {
        setTimeout(setup, 50);
      } else {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => setTimeout(setup, 50);
        script.onerror = () => !dead && setFailed(true);
        document.head.appendChild(script);
      }
    };

    loadGoogleMaps()
      .then((googleMaps) => {
        if (dead || !hostRef.current) return;
        if (!googleMaps?.Map) {
          initFallback();
          return;
        }

        const center = { lat, lng };
        const colour = stale ? "#94a3b8" : "#7c3aed";

        if (!mapRef.current) {
          mapRef.current = new googleMaps.Map(hostRef.current, {
            center,
            zoom: 16,
            disableDefaultUI: true,
            gestureHandling: "none",
            keyboardShortcuts: false,
          });
        } else {
          mapRef.current.panTo?.(center);
        }

        const map = mapRef.current;

        // Clean up previous layers
        if (markerRef.current) {
          if (typeof markerRef.current.setMap === "function") markerRef.current.setMap(null);
          else if (typeof map.removeLayer === "function") map.removeLayer(markerRef.current);
        }
        if (circleRef.current) {
          if (typeof circleRef.current.setMap === "function") circleRef.current.setMap(null);
          else if (typeof map.removeLayer === "function") map.removeLayer(circleRef.current);
        }

        markerRef.current = new googleMaps.Marker({
          position: center,
          map,
          icon: {
            path: googleMaps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: colour,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
          title: "Reported Position",
        });

        const radius = Number(accuracyMeters);
        if (Number.isFinite(radius) && radius > 0) {
          circleRef.current = new googleMaps.Circle({
            center,
            radius,
            map,
            strokeColor: colour,
            strokeOpacity: 0.8,
            strokeWeight: 1.5,
            fillColor: colour,
            fillOpacity: 0.15,
          });

          const bounds = circleRef.current.getBounds();
          if (bounds) {
            map.fitBounds(bounds);
          }
        } else {
          map.setZoom(16);
          map.setCenter(center);
        }
      })
      .catch(() => {
        initFallback();
      });

    return () => {
      dead = true;
    };
  }, [hasPin, lat, lng, accuracyMeters, stale]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (markerRef.current) {
        if (typeof markerRef.current.setMap === "function") markerRef.current.setMap(null);
        markerRef.current = null;
      }
      if (circleRef.current) {
        if (typeof circleRef.current.setMap === "function") circleRef.current.setMap(null);
        circleRef.current = null;
      }
      if (mapRef.current) {
        if (typeof mapRef.current.remove === "function") mapRef.current.remove();
        else if (window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(mapRef.current);
        mapRef.current = null;
      }
    };
  }, []);

  if (!hasPin || failed) {
    return (
      <div
        className={`${height} rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-center px-6 ${className}`}
      >
        <HiLocationMarker className="w-6 h-6 text-slate-300" />
        <p className="text-xs font-semibold text-slate-400">
          {failed
            ? "The map couldn’t load. The coordinates below are still correct."
            : "No position to show yet."}
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
