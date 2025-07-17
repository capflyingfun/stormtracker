import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Location {
  lat: number;
  lon: number;
  name: string;
}

interface Storm {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: number;
  speed: number;
  type: string;
  description?: string;
}

interface StormMapProps {
  location: Location;
  storms: Storm[];
  radarRange: number;
  useMetric: boolean;
  formatDistance: (miles: number) => string;
  formatSpeed: (mph: number) => string;
}

declare global {
  interface Window {
    L: any;
  }
}

export default function StormMap({ location, storms, radarRange, formatDistance, formatSpeed }: StormMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const radarLayerRef = useRef<any>(null);
  const rangeCircleRef = useRef<any>(null);
  const stormMarkersRef = useRef<any[]>([]);
  
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(10);
  const [radarFrames, setRadarFrames] = useState<number[]>([]);
  const animationIntervalRef = useRef<NodeJS.Timeout>();

  // Initialize radar frames - simplified
  useEffect(() => {
    // Just load current radar
    setRadarFrames([Math.floor(Date.now() / 1000)]);
    setCurrentFrame(0);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Wait for Leaflet to load
    const initMap = () => {
      if (!window.L) {
        setTimeout(initMap, 100);
        return;
      }

      const map = window.L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true
      }).setView([location.lat, location.lon], 8);

      // Add dark base tile layer
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [location]);

  // Update map center and range circle when location or range changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    map.setView([location.lat, location.lon], 8);

    // Remove existing range circle
    if (rangeCircleRef.current) {
      map.removeLayer(rangeCircleRef.current);
    }

    // Add detection range circle
    rangeCircleRef.current = window.L.circle([location.lat, location.lon], {
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      radius: radarRange * 1609.34, // Convert miles to meters
      weight: 2
    }).addTo(map);

    // Add center marker
    window.L.marker([location.lat, location.lon], {
      icon: window.L.divIcon({
        className: 'custom-location-marker',
        html: '<div style="background: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(map).bindPopup(`<b>Your Location</b><br>${location.name}`);
  }, [location, radarRange]);

  // Load radar layer
  const loadRadarLayer = (frameIndex?: number) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || radarFrames.length === 0) return;

    const timestamp = radarFrames[frameIndex ?? currentFrame] || radarFrames[radarFrames.length - 1];

    // Remove existing radar layer first
    if (radarLayerRef.current) {
      try {
        map.removeLayer(radarLayerRef.current);
      } catch (e) {
        console.log('Error removing radar layer:', e);
      }
      radarLayerRef.current = null;
    }

    // Create NEXRAD/NWS radar overlay (free, no API key required)
    try {
      // Use Iowa Environmental Mesonet's NEXRAD radar tiles (free, high quality)
      const nexradLayer = window.L.tileLayer(
        'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png',
        {
          tileSize: 256,
          opacity: 0.8,
          transparent: true,
          attribution: 'NEXRAD Radar © Iowa Environmental Mesonet',
          maxZoom: 12,
          updateWhenIdle: true,
          updateWhenZooming: false
        }
      );
      
      // Alternative: Use NWS Ridge Radar (also free)
      const ridgeLayer = window.L.tileLayer(
        'https://nowcoast.noaa.gov/arcgis/rest/services/nowcoast/radar_meteo_imagery_nexrad_time/MapServer/tile/{z}/{y}/{x}',
        {
          tileSize: 256,
          opacity: 0.7,
          transparent: true,
          attribution: 'NWS Ridge Radar © NOAA',
          maxZoom: 12,
          updateWhenIdle: true,
          updateWhenZooming: false
        }
      );
      
      // Create layer group with both NEXRAD sources
      const radarGroup = window.L.layerGroup();
      radarGroup.addLayer(nexradLayer);
      radarGroup.addLayer(ridgeLayer);
      
      radarLayerRef.current = radarGroup;
      radarLayerRef.current.addTo(map);
      
    } catch (error) {
      console.error('Failed to load NEXRAD radar layer:', error);
      
      // Fallback to OpenWeatherMap with enhanced visibility
      radarLayerRef.current = window.L.tileLayer(
        `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=49f87b43ad1ddba1821a5cdac7d6965e`,
        {
          opacity: 0.9,
          transparent: true,
          attribution: 'Weather data © OpenWeatherMap'
        }
      );
      radarLayerRef.current.addTo(map);
    }
  };

  // Load radar when frames are ready
  useEffect(() => {
    if (radarFrames.length > 0) {
      loadRadarLayer();
    }
  }, [radarFrames, currentFrame]);

  // Update storm markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Clear existing storm markers
    stormMarkersRef.current.forEach(marker => map.removeLayer(marker));
    stormMarkersRef.current = [];

    // Add new storm markers
    storms.forEach(storm => {
      const marker = window.L.circleMarker([storm.lat, storm.lon], {
        radius: Math.max(8, storm.intensity / 8),
        fillColor: getStormColor(storm.intensity),
        color: '#ffffff',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.6,
        className: 'storm-marker'
      }).addTo(map);

      marker.bindPopup(`
        <div class="text-slate-200">
          <b>${storm.type} Cell</b><br>
          Intensity: ${storm.intensity.toFixed(0)} dBZ<br>
          Distance: ${formatDistance(storm.distance)} ${getDirectionName(storm.direction)}<br>
          Speed: ${formatSpeed(storm.speed)}<br>
          <em>${storm.description || ''}</em>
        </div>
      `);

      stormMarkersRef.current.push(marker);
    });
  }, [storms, formatDistance, formatSpeed]);

  const getStormColor = (intensity: number): string => {
    if (intensity >= 60) return '#8B0000'; // Dark red - Extreme
    if (intensity >= 50) return '#FF0000'; // Red - Severe
    if (intensity >= 40) return '#FF4500'; // Orange red - Heavy
    if (intensity >= 30) return '#FF8C00'; // Orange - Moderate
    if (intensity >= 20) return '#FFD700'; // Gold - Light
    return '#32CD32'; // Green - Very light
  };

  const getDirectionName = (degrees: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  const toggleAnimation = () => {
    // Disable animation for now - just refresh the radar
    refreshRadar();
  };

  const refreshRadar = () => {
    // Just refresh the current radar layer
    setRadarFrames([Math.floor(Date.now() / 1000)]);
    setCurrentFrame(0);
  };

  const getTimeDisplay = (): string => {
    return 'Live';
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          Live Weather Radar - {radarRange} Mile Range
        </h2>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={refreshRadar}
            variant="default"
            size="sm"
          >
            🔄 Refresh Radar
          </Button>
        </div>
      </div>
      
      <div className="relative bg-slate-900 rounded-lg border border-slate-600 overflow-hidden" style={{ height: '500px' }}>
        <div ref={mapRef} className="w-full h-full"></div>
        
        {/* NEXRAD Radar Legend */}
        <div className="absolute top-2 right-2 z-[1000] bg-slate-900/90 p-2 rounded border border-slate-700 text-xs">
          <div className="font-semibold text-white mb-1">NEXRAD dBZ</div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(64, 196, 255)' }}></div>
              <span className="text-slate-300">5-15</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
              <span className="text-slate-300">20-30</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
              <span className="text-slate-300">35-40</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(255, 140, 0)' }}></div>
              <span className="text-slate-300">45-50</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
              <span className="text-slate-300">55-60</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(255, 0, 255)' }}></div>
              <span className="text-slate-300">65+</span>
            </div>
          </div>
        </div>
        
        {/* Radar Info */}
        <div className="radar-controls">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Radar: {getTimeDisplay()}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Range: {radarRange} miles | NEXRAD Radar (NWS/NOAA)
          </div>
        </div>
      </div>
    </div>
  );
}
