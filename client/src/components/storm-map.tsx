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
  const [radarSource, setRadarSource] = useState<'nexrad'>('nexrad'); // NEXRAD only
  const animationIntervalRef = useRef<NodeJS.Timeout>();
  const [sectorDbzData, setSectorDbzData] = useState<{[key: string]: number}>({});
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize NEXRAD radar frames
  useEffect(() => {
    // For NEXRAD, use simple timestamp
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

    // Draw distance rings (every 10 miles for cleaner look)
    const distanceRings = [10, 20, 30];
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

    // Draw angular sectors (every 30 degrees) - ensure complete circle
    for (let angle = 0; angle < 360; angle += 30) {
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
    }

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

    // No storm highlighting - waypoints will be added by dBZ data

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

  // Add waypoint markers for detected precipitation areas
  const addDbzWaypoints = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    const waypointGroup = window.L.layerGroup();
    const centerLat = location.lat;
    const centerLon = location.lon;

    // Create waypoint markers for sectors with significant precipitation
    for (const [sectorKey, dbzValue] of Object.entries(sectorDbzData)) {
      // Only create waypoints for sectors with measurable precipitation (25+ dBZ)
      if (dbzValue >= 25) {
        const [distance, angle] = sectorKey.split('-').map(Number);
        
        // Calculate center position of the sector for waypoint placement
        const midDistance = distance - 2.5; // Place waypoint in middle of 5-mile ring
        const midAngle = angle + 15; // Place waypoint in middle of 30-degree sector
        
        // Convert to lat/lon coordinates
        const angleRad = (midAngle * Math.PI) / 180;
        const waypointLat = centerLat + ((midDistance * 1609.34) / 111320) * Math.cos(angleRad);
        const waypointLon = centerLon + ((midDistance * 1609.34) / (111320 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angleRad);
        
        // Get color and size based on dBZ value
        const getDbzColor = (dbz: number) => {
          if (dbz >= 45) return '#ff0000'; // Red - Heavy
          if (dbz >= 35) return '#ff9600'; // Orange - Moderate
          return '#ffff00'; // Yellow - Light
        };
        
        const getMarkerSize = (dbz: number) => {
          if (dbz >= 45) return 12; // Large for heavy precipitation
          if (dbz >= 35) return 10; // Medium for moderate precipitation
          return 8; // Small for light precipitation
        };
        
        // Create custom waypoint marker
        const waypointIcon = window.L.divIcon({
          html: `
            <div style="
              width: ${getMarkerSize(dbzValue)}px;
              height: ${getMarkerSize(dbzValue)}px;
              background-color: ${getDbzColor(dbzValue)};
              border: 2px solid #ffffff;
              border-radius: 50%;
              box-shadow: 0 0 6px rgba(0,0,0,0.5);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 8px;
              font-weight: bold;
              color: #000;
            ">
              ${dbzValue}
            </div>
          `,
          className: 'dbz-waypoint',
          iconSize: [getMarkerSize(dbzValue), getMarkerSize(dbzValue)],
          iconAnchor: [getMarkerSize(dbzValue) / 2, getMarkerSize(dbzValue) / 2]
        });
        
        // Create waypoint marker
        const waypointMarker = window.L.marker([waypointLat, waypointLon], {
          icon: waypointIcon
        });
        
        // Add popup with precipitation info
        const directionName = getDirectionName(angle);
        waypointMarker.bindPopup(`
          <b>Precipitation Waypoint</b><br>
          Direction: ${directionName}<br>
          Distance: ${distance} miles<br>
          Intensity: ${dbzValue} dBZ<br>
          Type: ${dbzValue >= 45 ? 'Heavy' : dbzValue >= 35 ? 'Moderate' : 'Light'}<br>
          <small>Real-time NEXRAD data</small>
        `);
        
        waypointGroup.addLayer(waypointMarker);
      }
    }

    sectorHighlightsRef.current = waypointGroup;
    sectorHighlightsRef.current.addTo(map);
  };

  // Update waypoint markers based on dBZ data
  useEffect(() => {
    if (mapInstanceRef.current && window.L) {
      // Remove any existing markers
      if (sectorHighlightsRef.current) {
        mapInstanceRef.current.removeLayer(sectorHighlightsRef.current);
        sectorHighlightsRef.current = null;
      }
      
      // Add new waypoint markers based on dBZ data
      if (Object.keys(sectorDbzData).length > 0) {
        addDbzWaypoints();
      }
    }
  }, [sectorDbzData, showSectorGrid, location]);

  // Load radar layer
  const loadRadarLayer = async (frameIndex?: number) => {
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

    // NEXRAD radar overlay
    const nexradLayer = window.L.tileLayer(
      'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png',
      {
        tileSize: 256,
        opacity: 0.7,
        transparent: true,
        attribution: 'NEXRAD Radar © Iowa Environmental Mesonet',
        maxZoom: 12,
        updateWhenIdle: true,
        updateWhenZooming: false
      }
    );
    
    radarLayerRef.current = nexradLayer;
    radarLayerRef.current.addTo(map);

    // Fallback to OpenWeatherMap if both fail
    if (!radarLayerRef.current) {
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

  // Load radar when frames are ready or source changes
  useEffect(() => {
    if (radarFrames.length > 0) {
      loadRadarLayer();
      // Sample dBZ values after radar loads
      setTimeout(() => sampleRadarDbz(), 2000);
    }
  }, [radarFrames, currentFrame, radarSource]);

  // Remove individual storm markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Clear existing storm markers completely
    stormMarkersRef.current.forEach(marker => map.removeLayer(marker));
    stormMarkersRef.current = [];
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

  const refreshRadar = async () => {
    // For NEXRAD, use simple timestamp refresh
    setRadarFrames([Math.floor(Date.now() / 1000)]);
    setCurrentFrame(0);
    
    // Trigger dBZ sampling after radar refresh
    setTimeout(() => sampleRadarDbz(), 2000);
  };

  // NEXRAD color to dBZ mapping (standard NOAA colormap)
  const colorToDbz = (r: number, g: number, b: number): number => {
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    
    // NEXRAD standard color mapping
    const colorMap: {[key: string]: number} = {
      '#40ffff': 5,   // Light blue - very light
      '#36c5ff': 10,  // Blue - light
      '#0099ff': 15,  // Medium blue
      '#00ff00': 20,  // Green - light rain
      '#00c800': 25,  // Dark green
      '#009600': 30,  // Darker green
      '#ffff00': 35,  // Yellow - moderate
      '#e6c300': 40,  // Dark yellow
      '#ff9600': 45,  // Orange - heavy
      '#ff0000': 50,  // Red - very heavy
      '#c80000': 55,  // Dark red - severe
      '#960000': 60,  // Darker red
      '#ff00ff': 65,  // Magenta - extreme
      '#9632cc': 70,  // Purple - extreme
      '#ffffff': 75   // White - extreme
    };
    
    // Find closest color match
    let bestMatch = 0;
    let minDistance = Infinity;
    
    for (const [color, dbz] of Object.entries(colorMap)) {
      const targetR = parseInt(color.slice(1, 3), 16);
      const targetG = parseInt(color.slice(3, 5), 16);
      const targetB = parseInt(color.slice(5, 7), 16);
      
      const distance = Math.sqrt(
        Math.pow(r - targetR, 2) + 
        Math.pow(g - targetG, 2) + 
        Math.pow(b - targetB, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = dbz;
      }
    }
    
    // Only return dBZ if color match is reasonably close
    return minDistance < 50 ? bestMatch : 0;
  };

  // Sample dBZ values from NEXRAD radar tiles
  const sampleRadarDbz = async () => {
    const map = mapInstanceRef.current;
    if (!map || !radarLayerRef.current) return;

    try {
      // Get map bounds and center
      const center = map.getCenter();
      const zoom = map.getZoom();

      // Calculate multiple tiles around the center to get better coverage
      const tilesToCheck = [];
      const baseTileX = Math.floor((center.lng + 180) / 360 * Math.pow(2, zoom));
      const baseTileY = Math.floor((1 - Math.log(Math.tan(center.lat * Math.PI / 180) + 1 / Math.cos(center.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      
      // Check 3x3 grid of tiles around center
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          tilesToCheck.push({ x: baseTileX + dx, y: baseTileY + dy });
        }
      }

      const newSectorData: {[key: string]: number} = {};

      // Define sectors: 12 angular sectors (30° each) × 6 distance rings (5-mile steps)
      for (let ring = 1; ring <= 6; ring++) {
        for (let sector = 0; sector < 12; sector++) {
          const angle = sector * 30;
          const distance = ring * 5;
          const sectorKey = `${distance}-${angle}`;
          
          // Calculate the geographic center of this sector
          const sectorAngleRad = ((angle + 15) * Math.PI) / 180; // Middle of sector
          const sectorDistance = distance - 2.5; // Middle of ring
          
          // Convert sector position to geographic coordinates
          const sectorLat = center.lat + (sectorDistance * Math.cos(sectorAngleRad)) / 69.0;
          const sectorLon = center.lng + (sectorDistance * Math.sin(sectorAngleRad)) / (69.0 * Math.cos(center.lat * Math.PI / 180));
          
          // Find which tile contains this sector
          const tileX = Math.floor((sectorLon + 180) / 360 * Math.pow(2, zoom));
          const tileY = Math.floor((1 - Math.log(Math.tan(sectorLat * Math.PI / 180) + 1 / Math.cos(sectorLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
          
          // Calculate pixel position within the tile
          const tileSize = 256;
          const pixelX = Math.floor(((sectorLon + 180) / 360 * Math.pow(2, zoom) - tileX) * tileSize);
          const pixelY = Math.floor(((1 - Math.log(Math.tan(sectorLat * Math.PI / 180) + 1 / Math.cos(sectorLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom) - tileY) * tileSize);
          
          // Sample the radar data at this location
          try {
            const tileUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${tileX}/${tileY}.png`;
            
            const canvas = document.createElement('canvas');
            canvas.width = tileSize;
            canvas.height = tileSize;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                ctx.drawImage(img, 0, 0);
                resolve();
              };
              img.onerror = () => resolve(); // Continue on error
              img.src = tileUrl;
            });

            // Sample the pixel data
            const imageData = ctx.getImageData(0, 0, tileSize, tileSize);
            const data = imageData.data;
            
            // Sample multiple points around the sector center
            let maxDbz = 0;
            const sampleRadius = 10; // Sample in 10-pixel radius
            
            for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
              for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) {
                const sampleX = Math.max(0, Math.min(tileSize - 1, pixelX + dx));
                const sampleY = Math.max(0, Math.min(tileSize - 1, pixelY + dy));
                
                const pixelIndex = (sampleY * tileSize + sampleX) * 4;
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];
                const alpha = data[pixelIndex + 3];
                
                // Only process non-transparent pixels
                if (alpha > 0) {
                  const dbz = colorToDbz(r, g, b);
                  if (dbz > maxDbz) {
                    maxDbz = dbz;
                  }
                }
              }
            }
            
            newSectorData[sectorKey] = maxDbz;
            
          } catch (error) {
            // Skip this sector on error
            newSectorData[sectorKey] = 0;
          }
        }
      }

      setSectorDbzData(newSectorData);
      console.log('Sampled dBZ data:', newSectorData);
      
    } catch (error) {
      console.error('Error sampling radar dBZ:', error);
    }
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
            onClick={sampleRadarDbz}
            variant="outline"
            size="sm"
          >
            Sample dBZ
          </Button>
        </div>
      </div>

      {/* Radar Info */}
      <div className="bg-slate-800/50 rounded-lg p-3 mb-4 border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300">Radar Source:</span>
            <div className="text-sm text-white">NEXRAD</div>
          </div>
          <div className="text-xs text-slate-400">
            US High-Resolution
          </div>
        </div>
      </div>
      
      <div className="relative bg-slate-900 rounded-lg border border-slate-600 overflow-hidden" style={{ height: '500px' }}>
        <div ref={mapRef} className="w-full h-full"></div>
        
        {/* Precipitation Waypoints Legend */}
        <div className="absolute top-2 right-2 z-[1000] bg-slate-900/90 p-2 rounded border border-slate-700 text-xs">
          <div className="font-semibold text-white mb-1">
            Precipitation Waypoints {Object.keys(sectorDbzData).filter(key => sectorDbzData[key] >= 25).length > 0 ? `(${Object.keys(sectorDbzData).filter(key => sectorDbzData[key] >= 25).length} active)` : ''}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-white rounded-full" style={{ backgroundColor: '#ff0000' }}></div>
              <span className="text-slate-300">Heavy (45+ dBZ)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 border-2 border-white rounded-full" style={{ backgroundColor: '#ff9600' }}></div>
              <span className="text-slate-300">Moderate (35+ dBZ)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 border-2 border-white rounded-full" style={{ backgroundColor: '#ffff00' }}></div>
              <span className="text-slate-300">Light (25+ dBZ)</span>
            </div>
          </div>
          {Object.keys(sectorDbzData).length > 0 && (
            <div className="mt-1 pt-1 border-t border-slate-600 text-slate-400">
              Real-time NEXRAD radar sampling
            </div>
          )}
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
