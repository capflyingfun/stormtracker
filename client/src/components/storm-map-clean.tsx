import { useEffect, useRef, useState, useCallback } from "react";
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
  detectedAt?: number;
}

interface StormMapProps {
  location: Location;
  storms: Storm[];
  radarRange: number;
  useMetric: boolean;
  formatDistance: (miles: number) => string;
  formatSpeed: (mph: number) => string;
  stormFilters?: {
    light: boolean;
    moderate: boolean;
    heavy: boolean;
    severe: boolean;
  };

  onRadarSourceChange?: (source: 'rainviewer' | 'nexrad') => void;
  radarSource?: 'rainviewer' | 'nexrad';
  isDisabled?: boolean;
  alertPreferences?: any;
  showAllStormTracks?: boolean;
  showTimeLabels?: boolean;
  onMapInstanceReady?: (mapInstance: any) => void;
}

declare global {
  interface Window {
    L: any;
  }
}

export default function StormMap({ 
  location, 
  storms, 
  radarRange, 
  formatDistance, 
  formatSpeed, 
  stormFilters: externalStormFilters, 
  onRadarSourceChange, 
  radarSource: externalRadarSource, 
  isDisabled, 
  alertPreferences, 
  showAllStormTracks: externalShowAllStormTracks, 
  showTimeLabels = true, 
  onMapInstanceReady 
}: StormMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const radarLayerRef = useRef<any>(null);
  const rangeCircleRef = useRef<any>(null);
  const stormMarkersRef = useRef<any[]>([]);
  const precipitationWaypointsRef = useRef<any[]>([]);
  const lightningMarkersRef = useRef<any[]>([]);
  
  const [radarSource, setRadarSource] = useState<'rainviewer' | 'nexrad'>(externalRadarSource || 'rainviewer');
  const [nexradSite, setNexradSite] = useState<string>('');
  const [showLightning, setShowLightning] = useState(false);
  const [lightningData, setLightningData] = useState<any[]>([]);
  const [windsAloftData, setWindsAloftData] = useState<any>(null);
  const [stormFilters, setStormFilters] = useState({
    light: true,
    moderate: true,
    heavy: true,
    veryHeavy: true,
    extreme: true,
  });
  
  // Auto-sampling state
  const autoSampleTimeoutRef = useRef<NodeJS.Timeout>();
  const lightningIntervalRef = useRef<NodeJS.Timeout>();
  
  // Sync with external radar source changes
  useEffect(() => {
    if (externalRadarSource && externalRadarSource !== radarSource) {
      setRadarSource(externalRadarSource);
    }
  }, [externalRadarSource]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !location) return;

    // Load Leaflet if not already loaded
    if (!window.L) {
      const leafletCSS = document.createElement('link');
      leafletCSS.rel = 'stylesheet';
      leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(leafletCSS);

      const leafletJS = document.createElement('script');
      leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      leafletJS.onload = initializeMap;
      document.head.appendChild(leafletJS);
    } else {
      initializeMap();
    }

    function initializeMap() {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const map = window.L.map(mapRef.current).setView([location.lat, location.lon], 8);

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
      onMapInstanceReady?.(map);

      // Add range circle
      if (rangeCircleRef.current) {
        map.removeLayer(rangeCircleRef.current);
      }
      
      rangeCircleRef.current = window.L.circle([location.lat, location.lon], {
        color: '#3b82f6',
        fillColor: 'transparent',
        radius: radarRange * 1609.344 // miles to meters
      }).addTo(map);

      // Map event handlers
      map.on('moveend', handleMapMovement);
      map.on('zoomend', handleMapMovement);
    }
  }, [location]);

  // Handle map movement for auto-sampling
  const handleMapMovement = useCallback(() => {
    if (!mapInstanceRef.current) return;
    
    const center = mapInstanceRef.current.getCenter();
    console.log('Map movement detected, triggering auto-sample and winds aloft update');
    console.log(`Fetching winds aloft for new map center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
    
    // Clear existing timeout
    if (autoSampleTimeoutRef.current) {
      clearTimeout(autoSampleTimeoutRef.current);
    }
    
    // Set new timeout for auto-sampling
    autoSampleTimeoutRef.current = setTimeout(() => {
      fetchWindsAloft(center.lat, center.lng);
      samplePrecipitationData();
    }, 750);
  }, []);

  // Fetch winds aloft data
  const fetchWindsAloft = async (lat: number, lon: number) => {
    try {
      const response = await fetch('/api/winds-aloft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon })
      });
      
      if (response.ok) {
        const data = await response.json();
        setWindsAloftData(data);
        console.log('Winds aloft data received:', data.source || 'Unknown Source', data);
        console.log(`Updated winds aloft for map center: ${data.direction}° @ ${data.speed} mph`);
      }
    } catch (error) {
      console.error('Failed to fetch winds aloft:', error);
    }
  };

  // Sample precipitation data
  const samplePrecipitationData = async () => {
    if (!mapInstanceRef.current || !location) return;

    try {
      console.log(`${radarSource.toUpperCase()}: Using fixed zoom level 8 for consistent sampling (current map zoom: ${mapInstanceRef.current.getZoom()})`);
      
      const response = await fetch('/api/precipitation/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: location.lat,
          lon: location.lon,
          source: radarSource,
          zoom: 8 // Fixed zoom level
        })
      });

      if (response.ok) {
        const data = await response.json();
        const clusteredWaypoints = data.waypoints || [];
        
        console.log(`Found ${data.rawPoints || 0} raw points, clustered to ${clusteredWaypoints.length} waypoints:`, clusteredWaypoints.slice(0, 5));
        
        // Update precipitation waypoints on map
        updatePrecipitationWaypoints(clusteredWaypoints);
        
        // Convert to storm data format and dispatch event
        const stormCells = clusteredWaypoints.map((wp: any, index: number) => ({
          id: `storm-${index}`,
          lat: wp.lat,
          lon: wp.lon,
          intensity: wp.dbz,
          distance: wp.distance,
          direction: wp.bearing,
          speed: 0,
          type: getStormType(wp.dbz),
          description: `${wp.dbz}dBZ @ ${wp.distance.toFixed(1)}mi`,
          windsPrediction: windsAloftData
        }));

        console.log(`${radarSource.toUpperCase()}: Calling updateStormDataFromPrecipitation with ${clusteredWaypoints.length} clustered precipitation points`);
        
        // Dispatch event for storm data updates
        const event = new CustomEvent('precipitationStormData', { detail: stormCells });
        window.dispatchEvent(event);
        
        console.log('DISPATCH EVENT: Dispatching precipitationStormData event with', stormCells.length, 'storm cells for alert system');
        console.log('DISPATCH EVENT: Storm cells being sent:', stormCells.slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to sample precipitation data:', error);
    }
  };

  // Get storm type from dBZ
  const getStormType = (dbz: number): string => {
    if (dbz >= 61) return 'Extreme Thunderstorms';
    if (dbz >= 55) return 'Very Heavy Rain/Hail';
    if (dbz >= 46) return 'Heavy Rain';
    if (dbz >= 35) return 'Moderate Rain';
    if (dbz >= 20) return 'Light Rain';
    return 'Weak Storm';
  };

  // Update precipitation waypoints on map
  const updatePrecipitationWaypoints = (waypoints: any[]) => {
    if (!mapInstanceRef.current) return;

    // Clear existing waypoints
    precipitationWaypointsRef.current.forEach(marker => {
      mapInstanceRef.current.removeLayer(marker);
    });
    precipitationWaypointsRef.current = [];

    // Add new waypoints
    waypoints.forEach((wp, index) => {
      if (!shouldShowStorm(wp.dbz)) return;

      const color = getStormColor(wp.dbz);
      const marker = window.L.circleMarker([wp.lat, wp.lon], {
        radius: 6,
        fillColor: color,
        color: '#fff',
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.7
      });

      marker.bindPopup(`
        <div class="text-sm">
          <strong>${getStormType(wp.dbz)}</strong><br/>
          Intensity: ${wp.dbz} dBZ<br/>
          Distance: ${wp.distance.toFixed(1)} miles<br/>
          Direction: ${getDirectionName(wp.bearing)} (${wp.bearing.toFixed(0)}°)
        </div>
      `);

      marker.addTo(mapInstanceRef.current);
      precipitationWaypointsRef.current.push(marker);
    });

    console.log(`Storm Map: Received ${waypoints.length} authentic precipitation storms for track cones`);
  };

  // Check if storm should be shown based on filters
  const shouldShowStorm = (dbz: number): boolean => {
    if (dbz >= 61) return stormFilters.extreme;
    if (dbz >= 55) return stormFilters.veryHeavy;
    if (dbz >= 46) return stormFilters.heavy;
    if (dbz >= 35) return stormFilters.moderate;
    if (dbz >= 20) return stormFilters.light;
    return true;
  };

  // Get storm color based on dBZ
  const getStormColor = (dbz: number): string => {
    if (dbz >= 61) return '#8B5CF6'; // Purple
    if (dbz >= 55) return '#EF4444'; // Red
    if (dbz >= 46) return '#F97316'; // Orange
    if (dbz >= 35) return '#EAB308'; // Yellow
    if (dbz >= 20) return '#22C55E'; // Green
    return '#6B7280'; // Gray
  };

  // Get direction name from bearing
  const getDirectionName = (degrees: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  // Initialize NEXRAD site for attribution
  useEffect(() => {
    const setupRadar = async () => {
      if (radarSource === 'nexrad' && location) {
        try {
          const nearbyResponse = await fetch('/api/nexrad/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: location.lat, lon: location.lon })
          });
          
          if (nearbyResponse.ok) {
            const { site } = await nearbyResponse.json();
            setNexradSite(site);
          }
          
          console.log('NEXRAD: Loading current composite radar tiles');
          
        } catch (error) {
          console.error('Failed to initialize NEXRAD radar:', error);
        }
      }
    };

    setupRadar();
  }, [radarSource, location?.lat, location?.lon]);

  // Load radar layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map && window.L && location) {
      // Remove existing radar layer
      if (radarLayerRef.current) {
        map.removeLayer(radarLayerRef.current);
      }

      // Add new radar layer based on source
      if (radarSource === 'rainviewer') {
        radarLayerRef.current = window.L.tileLayer('/api/rainviewer/tiles/{z}/{x}/{y}', {
          opacity: 0.6,
          attribution: 'Weather data by RainViewer'
        });
      } else {
        radarLayerRef.current = window.L.tileLayer('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png', {
          opacity: 0.6,
          attribution: nexradSite ? `NEXRAD ${nexradSite} via Iowa Mesonet` : 'NEXRAD via Iowa Mesonet'
        });
      }

      map.addLayer(radarLayerRef.current);
    }
  }, [radarSource, location, nexradSite]);

  // Manual storm update function
  const handleManualStormUpdate = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.blur();
    
    console.log('Manual storm update triggered');
    
    // Clear auto-sample timeout to prevent conflicts
    if (autoSampleTimeoutRef.current) {
      clearTimeout(autoSampleTimeoutRef.current);
    }
    
    // Trigger immediate sampling
    if (mapInstanceRef.current && location) {
      const center = mapInstanceRef.current.getCenter();
      fetchWindsAloft(center.lat, center.lng);
      samplePrecipitationData();
    }
  }, [location]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSampleTimeoutRef.current) {
        clearTimeout(autoSampleTimeoutRef.current);
      }
      if (lightningIntervalRef.current) {
        clearInterval(lightningIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div 
        ref={mapRef} 
        className="w-full h-full"
        style={{ minHeight: '500px' }}
      />
      
      {/* Radar controls */}
      <div className="absolute top-2 left-2 z-[1000] bg-slate-900/90 rounded-lg p-2">
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => {
              const newSource = radarSource === 'rainviewer' ? 'nexrad' : 'rainviewer';
              setRadarSource(newSource);
              onRadarSourceChange?.(newSource);
            }}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            {radarSource === 'rainviewer' ? 'RainViewer' : 'NEXRAD'}
          </Button>
        </div>
      </div>

      {/* Update Storms Button */}
      <div className="absolute top-2 right-2 z-[1000]">
        <button
          type="button"
          onClick={handleManualStormUpdate}
          className="bg-slate-900/90 hover:bg-slate-800/90 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Update Storms
        </button>
      </div>

      {/* Range info */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-slate-900/90 rounded-lg p-2 text-xs text-white">
        Range: {radarRange} miles | {radarSource === 'rainviewer' ? 'RainViewer Global' : 'NEXRAD US'}
      </div>

      {/* Disabled overlay */}
      {isDisabled && (
        <div className="absolute inset-0 bg-black/50 z-[999] flex items-center justify-center">
          <div className="bg-slate-900 text-white px-4 py-2 rounded-lg">
            Map disabled while settings open
          </div>
        </div>
      )}
    </div>
  );
}