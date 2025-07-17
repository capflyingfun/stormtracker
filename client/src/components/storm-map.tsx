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
  detectedAt?: number; // Timestamp for age-based coloring
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
  const sectorGridRef = useRef<any>(null);
  const sectorHighlightsRef = useRef<any>(null);
  
  const [isAnimating, setIsAnimating] = useState(false);
  const [showSectorGrid, setShowSectorGrid] = useState(true);
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

  // Add sector grid overlay for visualization
  const addSectorGrid = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Remove existing sector grid
    if (sectorGridRef.current) {
      map.removeLayer(sectorGridRef.current);
    }

    const sectorGroup = window.L.layerGroup();
    const centerLat = location.lat;
    const centerLon = location.lon;

    // Draw distance rings (every 5 miles)
    const distanceRings = [5, 10, 15, 20, 25, 30];
    distanceRings.forEach(distance => {
      const ring = window.L.circle([centerLat, centerLon], {
        color: '#64748b',
        fillColor: 'transparent',
        fillOpacity: 0,
        radius: distance * 1609.34, // Convert miles to meters
        weight: 1,
        opacity: 0.3,
        dashArray: '2,4'
      });
      sectorGroup.addLayer(ring);
    });

    // Draw angular sectors (every 30 degrees)
    const angleSectors = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    angleSectors.forEach(angle => {
      const angleInRadians = (angle * Math.PI) / 180;
      const maxDistance = 30; // 30 miles
      const distanceInDegrees = maxDistance / 69.0; // Rough conversion
      
      const endLat = centerLat + (distanceInDegrees * Math.cos(angleInRadians));
      const endLon = centerLon + (distanceInDegrees * Math.sin(angleInRadians));
      
      const sectorLine = window.L.polyline([
        [centerLat, centerLon],
        [endLat, endLon]
      ], {
        color: '#64748b',
        weight: 1,
        opacity: 0.3,
        dashArray: '2,4'
      });
      sectorGroup.addLayer(sectorLine);
    });

    sectorGridRef.current = sectorGroup;
    if (showSectorGrid) {
      sectorGridRef.current.addTo(map);
    }
  };

  // Add sector highlights for areas with current storm activity (live radar data)
  const addSectorHighlights = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Remove existing sector highlights
    if (sectorHighlightsRef.current) {
      map.removeLayer(sectorHighlightsRef.current);
    }

    const highlightGroup = window.L.layerGroup();
    const centerLat = location.lat;
    const centerLon = location.lon;

    // Create set to track unique sectors to avoid duplicates
    const activeSectors = new Set();

    // Highlight sectors that have current storm activity
    storms.forEach(storm => {
      // Only highlight if storm is recent (within 5 minutes for live data)
      const stormAge = Date.now() - (storm.detectedAt || Date.now());
      const ageMinutes = stormAge / (1000 * 60);
      
      if (ageMinutes < 5) { // Only show current/recent activity
        // Calculate which sector this storm is in
        const distance = storm.distance;
        const angle = storm.direction;
        
        // Find the distance ring (5-mile increments)
        const ringDistance = Math.ceil(distance / 5) * 5;
        
        // Find the angular sector (30-degree increments)
        const sectorAngle = Math.floor(angle / 30) * 30;
        
        const sectorKey = `${ringDistance}-${sectorAngle}`;
        
        // Skip if we already processed this sector
        if (activeSectors.has(sectorKey)) return;
        activeSectors.add(sectorKey);
        
        // Create sector highlight for current activity
        const angleInRadians = (sectorAngle * Math.PI) / 180;
        const nextAngleInRadians = ((sectorAngle + 30) * Math.PI) / 180;
        
        const innerRadius = Math.max(0, ringDistance - 5);
        const outerRadius = ringDistance;
        
        // Create sector polygon points
        const points = [];
        const numPoints = 20;
        
        // Inner arc
        for (let i = 0; i <= numPoints; i++) {
          const currentAngle = angleInRadians + (i / numPoints) * (nextAngleInRadians - angleInRadians);
          const innerDistanceInDegrees = innerRadius / 69.0;
          const lat = centerLat + (innerDistanceInDegrees * Math.cos(currentAngle));
          const lon = centerLon + (innerDistanceInDegrees * Math.sin(currentAngle));
          points.push([lat, lon]);
        }
        
        // Outer arc (reverse order)
        for (let i = numPoints; i >= 0; i--) {
          const currentAngle = angleInRadians + (i / numPoints) * (nextAngleInRadians - angleInRadians);
          const outerDistanceInDegrees = outerRadius / 69.0;
          const lat = centerLat + (outerDistanceInDegrees * Math.cos(currentAngle));
          const lon = centerLon + (outerDistanceInDegrees * Math.sin(currentAngle));
          points.push([lat, lon]);
        }
        
        // Create highlighted sector with intensity-based color
        const intensity = storm.intensity;
        const getSectorColor = () => {
          if (intensity >= 45) return '#ff3300'; // Red for heavy storms
          if (intensity >= 35) return '#ff6600'; // Orange for moderate storms
          return '#ffff00'; // Yellow for light storms
        };
        
        const sectorHighlight = window.L.polygon(points, {
          color: getSectorColor(),
          fillColor: getSectorColor(),
          fillOpacity: 0.3,
          weight: 2,
          opacity: 0.8,
          dashArray: '3,2'
        });
        
        highlightGroup.addLayer(sectorHighlight);
      }
    });

    sectorHighlightsRef.current = highlightGroup;
    if (showSectorGrid) {
      sectorHighlightsRef.current.addTo(map);
    }
  };

  // Update sector grid when location or range changes
  useEffect(() => {
    if (mapInstanceRef.current && window.L) {
      addSectorGrid();
    }
  }, [location, radarRange, showSectorGrid]);

  // Update sector highlights when storms change
  useEffect(() => {
    if (mapInstanceRef.current && window.L && storms.length > 0) {
      addSectorHighlights();
    }
  }, [storms, showSectorGrid, location]);

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
          opacity: 0.8, // Full transparency for testing
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

  // Remove individual storm markers - only show sector highlights
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Clear existing storm markers completely
    stormMarkersRef.current.forEach(marker => map.removeLayer(marker));
    stormMarkersRef.current = [];

    // No individual storm markers - only sector-based visualization
  }, [storms]);

  const getStormColor = (intensity: number): string => {
    // NEXRAD-accurate color scheme matching dBZ values
    if (intensity >= 65) return '#ff00ff'; // Purple - Extreme (65+ dBZ)
    if (intensity >= 55) return '#ff0000'; // Red - Severe (55-60 dBZ)
    if (intensity >= 45) return '#ff8c00'; // Orange - Heavy (45-50 dBZ)
    if (intensity >= 35) return '#ffff00'; // Yellow - Moderate (35-40 dBZ)
    if (intensity >= 20) return '#00ff00'; // Green - Light (20-30 dBZ)
    return '#40c4ff'; // Light blue - Very light (5-15 dBZ)
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
    <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-600/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            Storm Tracker
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <div className="bg-slate-800 px-2 py-1 rounded text-white">
              {storms.length} storms detected
            </div>
            <div className="text-slate-400">
              Range: {radarRange} miles
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowSectorGrid(!showSectorGrid)}
            variant={showSectorGrid ? "default" : "outline"}
            size="sm"
          >
            {showSectorGrid ? "Hide" : "Show"} Grid
          </Button>
          <Button
            onClick={refreshRadar}
            variant="default"
            size="sm"
          >
            Refresh
          </Button>
        </div>
      </div>
      
      <div className="relative bg-slate-900 rounded-lg border border-slate-600 overflow-hidden" style={{ height: '500px' }}>
        <div ref={mapRef} className="w-full h-full"></div>
        
        {/* Sector Activity Legend */}
        <div className="absolute top-2 right-2 z-[1000] bg-slate-900/90 p-2 rounded border border-slate-700 text-xs">
          <div className="font-semibold text-white mb-1">Live Activity</div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 border border-black" style={{ backgroundColor: '#ff3300' }}></div>
              <span className="text-slate-300">Heavy (45+ dBZ)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 border border-black" style={{ backgroundColor: '#ff6600' }}></div>
              <span className="text-slate-300">Moderate (35+ dBZ)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 border border-black" style={{ backgroundColor: '#ffff00' }}></div>
              <span className="text-slate-300">Light (25+ dBZ)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 border border-slate-600" style={{ backgroundColor: 'transparent' }}></div>
              <span className="text-slate-400">No Activity</span>
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
