import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, X } from "lucide-react";

interface MapLocationPickerProps {
  onLocationSelect: (location: {
    lat: number;
    lon: number;
    name: string;
    country?: string;
    isUS?: boolean;
    recommendedRadarSource?: 'rainviewer' | 'nexrad';
  }) => void;
  onClose: () => void;
  initialLat?: number;
  initialLon?: number;
}

export default function MapLocationPicker({
  onLocationSelect,
  onClose,
  initialLat = 39.5,
  initialLon = -98.35,
}: MapLocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const [center, setCenter] = useState({ lat: initialLat, lon: initialLon });
  const [locationName, setLocationName] = useState<string>('');
  const [isResolving, setIsResolving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reverse geocode the current center
  const resolveLocation = async (lat: number, lon: number) => {
    setIsResolving(true);
    setLocationName('');
    try {
      const response = await fetch('/api/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon })
      });
      if (response.ok) {
        const data = await response.json();
        const parts = [data.name, data.state].filter(Boolean);
        setLocationName(parts.join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      } else {
        setLocationName(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    } catch {
      setLocationName(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    } finally {
      setIsResolving(false);
    }
  };

  // Debounced resolve on map move
  const scheduleResolve = (lat: number, lon: number) => {
    if (resolveTimer.current) clearTimeout(resolveTimer.current);
    resolveTimer.current = setTimeout(() => resolveLocation(lat, lon), 600);
  };

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    // Dynamically load Leaflet CSS if not already loaded
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then((L) => {
      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [initialLat, initialLon],
        zoom: 11,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;

      // Resolve initial location
      resolveLocation(initialLat, initialLon);

      // Track center on move
      map.on('move', () => {
        const c = map.getCenter();
        setCenter({ lat: c.lat, lon: c.lng });
      });

      map.on('moveend', () => {
        const c = map.getCenter();
        scheduleResolve(c.lat, c.lng);
      });
    });

    return () => {
      if (resolveTimer.current) clearTimeout(resolveTimer.current);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const response = await fetch('/api/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: center.lat, lon: center.lon })
      });

      let name = locationName || `${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`;
      let country = '';
      let isUS = false;

      if (response.ok) {
        const data = await response.json();
        const parts = [data.name, data.state].filter(Boolean);
        name = parts.join(', ') || name;
        country = data.country || '';
        isUS = country === 'US' || country === 'United States';
      }

      onLocationSelect({
        lat: center.lat,
        lon: center.lon,
        name,
        country,
        isUS,
        recommendedRadarSource: isUS ? 'nexrad' : 'rainviewer',
      });
    } catch {
      onLocationSelect({
        lat: center.lat,
        lon: center.lon,
        name: locationName || `${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div>
          <h2 className="text-white font-semibold text-base">Pick Location</h2>
          <p className="text-slate-400 text-xs">Drag the map so the pin is on your spot</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Map container */}
      <div className="relative flex-1">
        <div ref={mapRef} className="w-full h-full" />

        {/* Fixed crosshair pin in center */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="relative flex flex-col items-center" style={{ transform: 'translateY(-50%)' }}>
            <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
            <div className="w-0.5 h-4 bg-blue-500 shadow" />
            <div className="w-2 h-1 bg-blue-400 rounded-full opacity-50" />
          </div>
        </div>

        {/* Horizontal crosshair lines */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[999]">
          <div className="relative w-full h-full">
            <div className="absolute top-1/2 left-0 right-0 border-t border-blue-400/30" style={{ transform: 'translateY(-14px)' }} />
            <div className="absolute left-1/2 top-0 bottom-0 border-l border-blue-400/30" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-slate-800 border-t border-slate-700 shrink-0">
        {/* Current resolved address */}
        <div className="flex items-center gap-2 mb-3 min-h-[20px]">
          <MapPin className="h-4 w-4 text-blue-400 shrink-0" />
          {isResolving ? (
            <span className="text-slate-400 text-sm flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Looking up address...
            </span>
          ) : (
            <span className="text-white text-sm truncate">
              {locationName || `${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-600 text-slate-300 hover:text-white h-12"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirming || isResolving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-12"
          >
            {isConfirming ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Setting...</>
            ) : (
              <><MapPin className="h-4 w-4 mr-2" /> Set This Location</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
