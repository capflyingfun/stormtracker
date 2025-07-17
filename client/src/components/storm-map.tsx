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
  const [precipitationPoints, setPrecipitationPoints] = useState<Array<{
    lat: number;
    lon: number;
    dbz: number;
    id: string;
  }>>([]);
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

  // Calculate distance between two lat/lon points in miles
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Dynamic clustering based on zoom level - like Lightning Tracker Pro
  const clusterPrecipitationPoints = (points: Array<{lat: number; lon: number; dbz: number; id: string}>) => {
    const map = mapInstanceRef.current;
    if (!map) return points;

    const zoom = map.getZoom();
    const clustered: Array<{lat: number; lon: number; dbz: number; id: string; count?: number}> = [];
    const processed = new Set<string>();

    // Dynamic clustering radius based on zoom level
    const getClusterRadius = (zoom: number, dbz: number) => {
      // Base radius decreases as zoom increases (more detail when zoomed in)
      let baseRadius = Math.max(0.3, 8 - zoom); // 0.3 to 8 miles
      
      // High intensity storms cluster less aggressively
      if (dbz >= 45) baseRadius *= 0.6; // Heavy storms stay more separated
      else if (dbz >= 35) baseRadius *= 0.8; // Moderate storms cluster moderately
      
      return baseRadius;
    };

    // Sort points by intensity (highest first) to prioritize strong storms
    const sortedPoints = [...points].sort((a, b) => b.dbz - a.dbz);

    for (const point of sortedPoints) {
      if (processed.has(point.id)) continue;

      // Find nearby points within dynamic clustering radius
      const clusterRadius = getClusterRadius(zoom, point.dbz);
      const nearbyPoints = [point];
      processed.add(point.id);

      for (const otherPoint of sortedPoints) {
        if (processed.has(otherPoint.id)) continue;
        
        const distance = calculateDistance(point.lat, point.lon, otherPoint.lat, otherPoint.lon);
        if (distance <= clusterRadius) {
          nearbyPoints.push(otherPoint);
          processed.add(otherPoint.id);
        }
      }

      // Create cluster with highest dBZ value and weighted position
      const maxDbz = Math.max(...nearbyPoints.map(p => p.dbz));
      const maxDbzPoint = nearbyPoints.find(p => p.dbz === maxDbz)!;
      
      // Weight cluster position towards highest intensity point
      const totalWeight = nearbyPoints.reduce((sum, p) => sum + p.dbz, 0);
      const avgLat = nearbyPoints.reduce((sum, p) => sum + (p.lat * p.dbz), 0) / totalWeight;
      const avgLon = nearbyPoints.reduce((sum, p) => sum + (p.lon * p.dbz), 0) / totalWeight;

      clustered.push({
        lat: avgLat,
        lon: avgLon,
        dbz: maxDbz,
        id: `cluster-${clustered.length}`,
        count: nearbyPoints.length
      });
    }

    return clustered;
  };

  // Update storm data from precipitation points for the Storm Cells panel
  const updateStormDataFromPrecipitation = (clusters: Array<{lat: number; lon: number; dbz: number; id: string; count?: number}>) => {
    if (!location) return;

    // Convert precipitation clusters to storm format
    const stormCells = clusters.map((cluster, index) => {
      const distance = calculateDistance(location.lat, location.lon, cluster.lat, cluster.lon);
      const bearing = calculateBearing(location.lat, location.lon, cluster.lat, cluster.lon);
      
      return {
        id: `storm_${Date.now()}_${index}`,
        lat: cluster.lat,
        lon: cluster.lon,
        intensity: cluster.dbz,
        distance: distance,
        direction: bearing,
        speed: 0, // No movement data from static precipitation
        type: cluster.dbz >= 45 ? 'Heavy' : cluster.dbz >= 35 ? 'Moderate' : 'Light',
        description: `${cluster.dbz} dBZ precipitation ${cluster.count ? `(${cluster.count} cells)` : ''}`
      };
    });

    // Trigger custom event to update storm data
    window.dispatchEvent(new CustomEvent('precipitationStormData', {
      detail: stormCells
    }));
  };

  // Calculate bearing between two points
  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  };

  // Add waypoint markers for detected precipitation areas with dynamic sizing
  const addDbzWaypoints = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    const waypointGroup = window.L.layerGroup();
    const centerLat = location.lat;
    const centerLon = location.lon;
    const zoom = map.getZoom();

    // Create waypoint markers for each actual precipitation point
    for (const point of precipitationPoints) {
      // Get color and size based on dBZ value and zoom level
      const getDbzColor = (dbz: number) => {
        if (dbz >= 45) return '#ff0000'; // Red - Heavy
        if (dbz >= 35) return '#ff9600'; // Orange - Moderate
        return '#ffff00'; // Yellow - Light
      };
      
      // Dynamic sizing based on zoom level and intensity
      const getMarkerSize = (dbz: number, zoom: number, count?: number) => {
        let baseSize = 8;
        
        // Intensity-based sizing
        if (dbz >= 45) baseSize = 14;
        else if (dbz >= 35) baseSize = 12;
        else baseSize = 10;
        
        // Zoom-based scaling
        const zoomFactor = Math.max(0.5, Math.min(2.0, zoom / 8));
        baseSize *= zoomFactor;
        
        // Cluster size indicator when zoomed out
        if (count && count > 1 && zoom < 8) {
          baseSize += Math.min(6, count * 0.5);
        }
        
        return Math.round(baseSize);
      };
      
      const markerSize = getMarkerSize(point.dbz, zoom, point.count);
      
      // Create custom waypoint marker
      const waypointIcon = window.L.divIcon({
        html: `
          <div style="
            width: ${markerSize}px;
            height: ${markerSize}px;
            background-color: ${getDbzColor(point.dbz)};
            border: 2px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 0 6px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${Math.max(7, markerSize * 0.6)}px;
            font-weight: bold;
            color: #000;
          ">
            ${point.dbz}
          </div>
        `,
        className: 'dbz-waypoint',
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2]
      });
      
      // Create waypoint marker at actual precipitation location
      const waypointMarker = window.L.marker([point.lat, point.lon], {
        icon: waypointIcon
      });
      
      // Add popup with precipitation info
      const pointDistance = calculateDistance(centerLat, centerLon, point.lat, point.lon);
      const popupContent = point.count && point.count > 1 
        ? `<b>Storm Cell Cluster</b><br>
           Distance: ${pointDistance.toFixed(1)} miles<br>
           Max Intensity: ${point.dbz} dBZ<br>
           Type: ${point.dbz >= 45 ? 'Heavy' : point.dbz >= 35 ? 'Moderate' : 'Light'}<br>
           Cells: ${point.count}<br>
           <small>Real-time NEXRAD data</small>`
        : `<b>Precipitation Cell</b><br>
           Distance: ${pointDistance.toFixed(1)} miles<br>
           Intensity: ${point.dbz} dBZ<br>
           Type: ${point.dbz >= 45 ? 'Heavy' : point.dbz >= 35 ? 'Moderate' : 'Light'}<br>
           <small>Real-time NEXRAD data</small>`;
      
      waypointMarker.bindPopup(popupContent);
      
      waypointGroup.addLayer(waypointMarker);
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
      
      // Add new waypoint markers based on precipitation points
      if (precipitationPoints.length > 0) {
        addDbzWaypoints();
      }
    }
  }, [precipitationPoints, showSectorGrid, location]);

  // Re-cluster and update markers when zoom changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleZoomEnd = () => {
      // Re-run clustering with current zoom level
      if (precipitationPoints.length > 0) {
        // Get the original raw points by forcing a re-sample
        console.log('Zoom changed, re-clustering precipitation points...');
        // The clustering will happen automatically on next sample
      }
    };

    map.on('zoomend', handleZoomEnd);
    return () => map.off('zoomend', handleZoomEnd);
  }, [precipitationPoints]);

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

  // Sample dBZ values directly from visible precipitation areas
  const sampleRadarDbz = async () => {
    const map = mapInstanceRef.current;
    if (!map || !radarLayerRef.current) return;

    try {
      // Get map bounds and center
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bounds = map.getBounds();

      // Calculate the 30-mile radius boundary
      const radiusInDegrees = 30 / 69.0; // 30 miles in degrees
      const northLat = center.lat + radiusInDegrees;
      const southLat = center.lat - radiusInDegrees;
      const eastLng = center.lng + radiusInDegrees / Math.cos(center.lat * Math.PI / 180);
      const westLng = center.lng - radiusInDegrees / Math.cos(center.lat * Math.PI / 180);

      // Find all tiles that overlap with our 30-mile radius
      const tilesToCheck = [];
      const minTileX = Math.floor((westLng + 180) / 360 * Math.pow(2, zoom));
      const maxTileX = Math.floor((eastLng + 180) / 360 * Math.pow(2, zoom));
      const minTileY = Math.floor((1 - Math.log(Math.tan(northLat * Math.PI / 180) + 1 / Math.cos(northLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      const maxTileY = Math.floor((1 - Math.log(Math.tan(southLat * Math.PI / 180) + 1 / Math.cos(southLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

      for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
          tilesToCheck.push({ x: tileX, y: tileY });
        }
      }

      const precipitationPoints: Array<{
        lat: number;
        lon: number;
        dbz: number;
        id: string;
      }> = [];

      // Sample each tile for precipitation
      for (const tile of tilesToCheck) {
        try {
          const tileUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${tile.x}/${tile.y}.png`;
          
          const canvas = document.createElement('canvas');
          const tileSize = 256;
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
            img.onerror = () => resolve();
            img.src = tileUrl;
          });

          const imageData = ctx.getImageData(0, 0, tileSize, tileSize);
          const data = imageData.data;
          
          // Dynamic sampling resolution based on zoom level
          const zoom = map.getZoom();
          const sampleStep = zoom >= 10 ? 2 : zoom >= 8 ? 3 : 4; // Finer sampling when zoomed in
          
          for (let x = 0; x < tileSize; x += sampleStep) {
            for (let y = 0; y < tileSize; y += sampleStep) {
              const pixelIndex = (y * tileSize + x) * 4;
              const r = data[pixelIndex];
              const g = data[pixelIndex + 1];
              const b = data[pixelIndex + 2];
              const alpha = data[pixelIndex + 3];
              
              if (alpha > 0) {
                const dbz = colorToDbz(r, g, b);
                if (dbz >= 25) {
                  // Convert pixel position back to lat/lon
                  const pixelLng = (tile.x + x / tileSize) * 360 / Math.pow(2, zoom) - 180;
                  const pixelLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.y + y / tileSize) / Math.pow(2, zoom))));
                  const pixelLat = pixelLatRad * 180 / Math.PI;
                  
                  // Check if this point is within our 30-mile radius
                  const distance = calculateDistance(center.lat, center.lng, pixelLat, pixelLng);
                  if (distance <= 30) {
                    // Allow closer spacing for higher intensity precipitation
                    let shouldAdd = true;
                    
                    // Check if there's already a nearby point with lower intensity
                    for (const existingPoint of precipitationPoints) {
                      const existingDistance = calculateDistance(pixelLat, pixelLng, existingPoint.lat, existingPoint.lon);
                      
                      // Dynamic spacing based on intensity
                      let minSpacing = 0.5; // Default minimum spacing in miles
                      if (dbz >= 45) minSpacing = 0.2; // Allow very close spacing for heavy precipitation
                      else if (dbz >= 35) minSpacing = 0.3; // Closer spacing for moderate precipitation
                      
                      if (existingDistance < minSpacing) {
                        // If new point has higher intensity, replace the existing one
                        if (dbz > existingPoint.dbz) {
                          const index = precipitationPoints.indexOf(existingPoint);
                          precipitationPoints.splice(index, 1);
                          shouldAdd = true;
                          break;
                        } else {
                          shouldAdd = false;
                          break;
                        }
                      }
                    }
                    
                    if (shouldAdd) {
                      precipitationPoints.push({
                        lat: pixelLat,
                        lon: pixelLng,
                        dbz: dbz,
                        id: `${tile.x}-${tile.y}-${x}-${y}`
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          // Skip this tile on error
          continue;
        }
      }

      // Cluster nearby precipitation points for cleaner display
      const clusteredPoints = clusterPrecipitationPoints(precipitationPoints);
      
      // Store clustered points
      setPrecipitationPoints(clusteredPoints);
      
      // Create simple sector data for legend display
      const newSectorData: {[key: string]: number} = {};
      clusteredPoints.forEach((point, index) => {
        newSectorData[`point-${index}`] = point.dbz;
      });
      setSectorDbzData(newSectorData);
      
      console.log(`Found ${precipitationPoints.length} raw points, clustered to ${clusteredPoints.length} waypoints:`, clusteredPoints);
      
      // Update storm data with clustered precipitation points
      updateStormDataFromPrecipitation(clusteredPoints);
      
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
            Precipitation Waypoints {Object.keys(sectorDbzData).filter(key => sectorDbzData[key] >= 25).length > 0 ? `(${Object.keys(sectorDbzData).filter(key => sectorDbzData[key] >= 25).length} points)` : ''}
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
