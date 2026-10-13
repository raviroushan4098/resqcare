"use client";

import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { AdvancedMarker, APIProvider, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

export type MapMarker = { id: string; lat: number; lng: number; title: string; kind: "verified" | "unverified" | "ambulance" | "pickup" | "origin" };

const COLORS: Record<MapMarker["kind"], { bg: string; border: string; glyph: string }> = {
  verified: { bg: "#1B7F4C", border: "#0f5532", glyph: "#ffffff" },
  unverified: { bg: "#ffffff", border: "#5B6B7F", glyph: "#5B6B7F" },
  ambulance: { bg: "#C62828", border: "#8e1b1b", glyph: "#ffffff" },
  pickup: { bg: "#1F6FEB", border: "#164fa8", glyph: "#ffffff" },
  origin: { bg: "#12284C", border: "#0a1830", glyph: "#ffffff" },
};

function Clustered({ markers, selectedId, onSelect, cluster }: { markers: MapMarker[]; selectedId?: string | null; onSelect?: (id: string) => void; cluster: boolean }) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const refs = useRef<Record<string, google.maps.marker.AdvancedMarkerElement | null>>({});

  useEffect(() => {
    if (!map || !cluster) return;
    clusterer.current ??= new MarkerClusterer({ map });
    clusterer.current.clearMarkers();
    clusterer.current.addMarkers(Object.values(refs.current).filter(Boolean) as google.maps.marker.AdvancedMarkerElement[]);
  }, [map, markers, cluster]);

  useEffect(() => {
    const m = markers.find((x) => x.id === selectedId);
    if (map && m) map.panTo({ lat: m.lat, lng: m.lng });
  }, [map, selectedId, markers]);

  return (
    <>
      {markers.map((m) => {
        const c = COLORS[m.kind];
        const selected = m.id === selectedId;
        return (
          <AdvancedMarker
            key={m.id}
            position={{ lat: m.lat, lng: m.lng }}
            title={m.title}
            onClick={() => onSelect?.(m.id)}
            ref={(el) => {
              refs.current[m.id] = el;
            }}
            zIndex={selected ? 10 : 1}
          >
            <Pin background={c.bg} borderColor={c.border} glyphColor={c.glyph} scale={selected ? 1.4 : 1} />
          </AdvancedMarker>
        );
      })}
    </>
  );
}

function Route({ path }: { path: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || path.length < 2) return;
    const line = new google.maps.Polyline({ path, strokeColor: "#1F6FEB", strokeOpacity: 0.9, strokeWeight: 4, map });
    return () => line.setMap(null);
  }, [map, path]);
  return null;
}

/** Google map body. Only loaded (dynamic import) when a Maps key is configured and a map view is opened. */
export default function MapCanvas({
  apiKey,
  center,
  zoom = 12,
  markers,
  selectedId,
  onSelect,
  route,
  cluster = false,
  label,
  onError,
}: {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom?: number;
  markers: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  route?: { lat: number; lng: number }[];
  cluster?: boolean;
  label: string;
  onError?: () => void;
}) {
  return (
    <APIProvider apiKey={apiKey} onError={onError}>
      <div role="region" aria-label={label} className="h-[360px] w-full overflow-hidden rounded-card border border-border md:h-[520px]">
        <Map
          defaultCenter={center}
          defaultZoom={zoom}
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
        >
          <Clustered markers={markers} selectedId={selectedId} onSelect={onSelect} cluster={cluster} />
          {route ? <Route path={route} /> : null}
        </Map>
      </div>
    </APIProvider>
  );
}
