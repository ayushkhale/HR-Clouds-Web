// ─────────────────────────────────────────────────────────────────────────────
// GeofenceMapPicker — drag a pin, get coordinates and a radius circle.
// Powered by the official Google Maps JavaScript SDK, with a zero-watermark
// fallback if the SDK is blocked by client adblockers (net::ERR_BLOCKED_BY_CLIENT).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "../utils/googleMapsLoader";

const FALLBACK = { lat: 28.6139, lng: 77.209 };

/**
 * @param {object}   props
 * @param {number|null} props.latitude
 * @param {number|null} props.longitude
 * @param {number}   props.radius      metres, drawn as a circle
 * @param {Function} props.onChange    ({ latitude, longitude }) on drag/click
 * @param {string}   [props.className]
 * @param {boolean}  [props.fill]
 */
export default function GeofenceMapPicker({
  latitude,
  longitude,
  radius = 250,
  onChange,
  className = "",
  fill = false,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let dead = false;

    const lat = Number.isFinite(latitude) ? latitude : FALLBACK.lat;
    const lng = Number.isFinite(longitude) ? longitude : FALLBACK.lng;
    const center = { lat, lng };

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
        if (mapRef.current) return;

        // attributionControl: false hides any "Leaflet" branding completely
        const map = window.L.map(hostRef.current, { attributionControl: false }).setView([lat, lng], 15);
        window.L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
          maxZoom: 20,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
        }).addTo(map);

        const marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        const circle = window.L.circle([lat, lng], {
          radius: Number.isFinite(radius) ? radius : 250,
          color: "#7E22CE",
          fillColor: "#9333ea",
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(map);

        const move = (pos) => {
          circle.setLatLng(pos);
          onChangeRef.current?.({
            latitude: Number(pos.lat.toFixed(6)),
            longitude: Number(pos.lng.toFixed(6)),
          });
        };

        marker.on("dragend", (e) => move(e.target.getLatLng()));
        map.on("click", (e) => {
          marker.setLatLng(e.latlng);
          move(e.latlng);
        });

        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        setTimeout(() => map.invalidateSize(), 200);
      };

      if (typeof window.L !== "undefined") {
        setTimeout(setup, 50);
      } else {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => setTimeout(setup, 50);
        document.head.appendChild(script);
      }
    };

    loadGoogleMaps()
      .then((googleMaps) => {
        if (dead || !hostRef.current) return;
        if (mapRef.current) return;
        if (!googleMaps?.Map) {
          initFallback();
          return;
        }

        const map = new googleMaps.Map(hostRef.current, {
          center,
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });

        const marker = new googleMaps.Marker({
          position: center,
          map,
          draggable: true,
          title: "Drag to set location",
        });

        const circle = new googleMaps.Circle({
          center,
          radius: Number.isFinite(radius) ? radius : 250,
          map,
          strokeColor: "#7E22CE",
          strokeOpacity: 0.85,
          strokeWeight: 2,
          fillColor: "#9333EA",
          fillOpacity: 0.15,
        });

        const handleMove = (newLat, newLng) => {
          const pos = { lat: newLat, lng: newLng };
          circle.setCenter(pos);
          onChangeRef.current?.({
            latitude: Number(newLat.toFixed(6)),
            longitude: Number(newLng.toFixed(6)),
          });
        };

        marker.addListener("dragend", (e) => {
          if (e.latLng) {
            handleMove(e.latLng.lat(), e.latLng.lng());
          }
        });

        map.addListener("click", (e) => {
          if (e.latLng) {
            marker.setPosition(e.latLng);
            handleMove(e.latLng.lat(), e.latLng.lng());
          }
        });

        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
      })
      .catch(() => {
        initFallback();
      });

    return () => {
      dead = true;
      if (mapRef.current) {
        if (typeof mapRef.current.remove === "function") mapRef.current.remove();
        else if (window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(mapRef.current);
        mapRef.current = null;
      }
      if (markerRef.current) {
        if (typeof markerRef.current.setMap === "function") markerRef.current.setMap(null);
        markerRef.current = null;
      }
      if (circleRef.current) {
        if (typeof circleRef.current.setMap === "function") circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker and circle position when props change externally
  useEffect(() => {
    if (!markerRef.current || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (typeof markerRef.current.setPosition === "function") {
      const pos = { lat: latitude, lng: longitude };
      markerRef.current.setPosition(pos);
      circleRef.current?.setCenter(pos);
      mapRef.current?.panTo(pos);
    } else if (typeof markerRef.current.setLatLng === "function") {
      const pos = [latitude, longitude];
      markerRef.current.setLatLng(pos);
      circleRef.current?.setLatLng(pos);
      mapRef.current?.setView(pos);
    }
  }, [latitude, longitude]);

  // Update circle radius when radius prop changes
  useEffect(() => {
    if (circleRef.current && Number.isFinite(radius)) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  return (
    <div
      ref={hostRef}
      className={`w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative z-0 ${
        fill ? "flex-1 min-h-[200px] sm:min-h-[350px]" : ""
      } ${className}`}
      style={fill ? undefined : { height: 260 }}
    />
  );
}
