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
  detectedAt?: number; // Timestamp for age-based coloring
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
}

declare global {
  interface Window {
    L: any;
  }
}

export default function StormMap({ location, storms, radarRange, formatDistance, formatSpeed, stormFilters: externalStormFilters, onRadarSourceChange, radarSource: externalRadarSource, isDisabled, alertPreferences, showAllStormTracks: externalShowAllStormTracks }: StormMapProps) {
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
  const [radarFrames, setRadarFrames] = useState<(string | number)[]>([]);
  const [radarSource, setRadarSource] = useState<'rainviewer' | 'nexrad'>(externalRadarSource || 'rainviewer'); // RainViewer primary
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(-1);
  const [nexradSite, setNexradSite] = useState<string>('');
  const animationIntervalRef = useRef<NodeJS.Timeout>();
  const animationSpeedRef = useRef<number>(800); // ms between frames
  const [sectorDbzData, setSectorDbzData] = useState<{[key: string]: number}>({});
  
  // Auto-sampling state
  const autoSampleTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Sync with external radar source changes
  useEffect(() => {
    if (externalRadarSource && externalRadarSource !== radarSource) {
      setRadarSource(externalRadarSource);
    }
  }, [externalRadarSource]);

  // Use external storm filters if provided, otherwise use internal state
  // Local storm filter state
  const [localStormFilters, setLocalStormFilters] = useState({
    light: true, moderate: true, heavy: true, veryHeavy: true, extreme: true
  });
  
  const stormFilters = localStormFilters;
  const [precipitationPoints, setPrecipitationPoints] = useState<Array<{
    lat: number;
    lon: number;
    dbz: number;
    id: string;
  }>>([]);
  const [previousPrecipitationPoints, setPreviousPrecipitationPoints] = useState<Array<{
    lat: number;
    lon: number;
    dbz: number;
    id: string;
    timestamp: number;
  }>>([]);
  const [radarFrameHistory, setRadarFrameHistory] = useState<Array<{
    timestamp: number;
    precipitationPoints: Array<{lat: number; lon: number; dbz: number; id: string}>;
  }>>([]);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const highlightLayerRef = useRef<any>(null);
  
  // Winds aloft data for arrow directions
  const [currentWindsData, setCurrentWindsData] = useState<any>(null);
  
  // Storm cone visualization state
  const [showAllStormTracks, setShowAllStormTracks] = useState(false);
  const [selectedStormId, setSelectedStormId] = useState<string | null>(null);
  const stormConeLayerRef = useRef<any>(null);
  const allStormConesLayerRef = useRef<any>(null);

  // Sync with external storm tracks toggle
  useEffect(() => {
    if (typeof externalShowAllStormTracks === 'boolean') {
      setShowAllStormTracks(externalShowAllStormTracks);
    }
  }, [externalShowAllStormTracks]);

  // Auto-sampling functionality (silent background operation)
  const triggerAutoSample = useCallback(() => {
    // Clear any existing timeout
    if (autoSampleTimeoutRef.current) {
      clearTimeout(autoSampleTimeoutRef.current);
    }
    
    // Set timeout for 0.75 seconds - sample silently in background
    autoSampleTimeoutRef.current = setTimeout(async () => {
      if (mapInstanceRef.current && location && radarFrames.length > 0) {
        console.log('Auto-sampling triggered by map movement');
        await sampleRadarDbz();
      }
    }, 750);
  }, [location, radarFrames.length]);



  // Initialize radar frames based on source
  useEffect(() => {
    const loadRadarFrames = async () => {
      if (radarSource === 'rainviewer') {
        try {
          const response = await fetch('/api/rainviewer');
          const data = await response.json();
          if (data.radar && data.radar.past) {
            const frames = data.radar.past.map((frame: any) => frame.time);
            setRadarFrames(frames);
            setCurrentFrame(Math.max(0, frames.length - 1));
            setCurrentFrameIndex(frames.length - 1); // Start with most recent frame
            
            console.log(`Loaded ${frames.length} radar frames for animation`);
          }
        } catch (error) {
          console.error('Failed to load RainViewer frames:', error);
          // Fallback to NEXRAD
          setRadarSource('nexrad');
        }
      } else {
        // For NEXRAD, use static current radar display
        try {
          if (!location) {
            console.log('NEXRAD: Waiting for location...');
            return; // Wait for location before loading NEXRAD
          }
          
          // Find nearest radar site for proper attribution
          const nearbyResponse = await fetch('/api/nexrad/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: location.lat, lon: location.lon })
          });
          
          if (!nearbyResponse.ok) {
            throw new Error('Failed to find nearby radar');
          }
          
          const { site } = await nearbyResponse.json();
          setNexradSite(site);
          
          // Use static current NEXRAD radar (no animation)
          const frames = ['current'];
          setRadarFrames(frames);
          setCurrentFrame(0);
          setCurrentFrameIndex(0);
          
          console.log(`NEXRAD: Using static current radar for site ${site}`);
          
          // Immediately load the radar layer for better initial display
          setTimeout(() => {
            if (mapInstanceRef.current && window.L) {
              const nexradUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?t=${Date.now()}`;
              
              // Remove existing radar layer
              if (radarLayerRef.current) {
                mapInstanceRef.current.removeLayer(radarLayerRef.current);
              }
              
              // Add NEXRAD layer immediately
              radarLayerRef.current = window.L.tileLayer(nexradUrl, {
                opacity: 0.7,
                zIndex: 200,
                attribution: `NEXRAD (${site})`,
                updateWhenIdle: true,
                updateWhenZooming: false,
                // Force reload to ensure fresh tiles
                updateInterval: 0
              });
              
              radarLayerRef.current.addTo(mapInstanceRef.current);
              console.log(`NEXRAD radar layer loaded for site ${site}`);
              
              // Give additional time for tiles to load before enabling sampling
              setTimeout(() => {
                console.log('NEXRAD radar tiles should be loaded now');
              }, 1000);
            }
          }, 1000); // Increased delay to 1 second for slower connections
          
        } catch (error) {
          console.error('Failed to load NEXRAD radar:', error);
          // Fall back to RainViewer
          console.log('Switching to RainViewer due to NEXRAD issues');
          setRadarSource('rainviewer');
        }
      }
    };

    loadRadarFrames();
  }, [radarSource, location]); // Added location dependency

  // Animation functions
  const startAnimation = () => {
    if (radarFrames.length < 2) return;
    
    setIsAnimating(true);
    setCurrentFrameIndex(0);
    
    animationIntervalRef.current = setInterval(() => {
      setCurrentFrameIndex(prev => {
        const nextIndex = (prev + 1) % radarFrames.length;
        return nextIndex;
      });
    }, animationSpeedRef.current);
  };

  const stopAnimation = () => {
    setIsAnimating(false);
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = undefined;
    }
    // Return to most recent frame
    if (radarFrames.length > 0) {
      setCurrentFrameIndex(radarFrames.length - 1);
    }
  };

  const toggleAnimation = () => {
    if (isAnimating) {
      stopAnimation();
    } else {
      startAnimation();
    }
  };

  // Update radar display when animation frame changes
  useEffect(() => {
    if (currentFrameIndex >= 0 && radarFrames[currentFrameIndex]) {
      const timestamp = radarFrames[currentFrameIndex];
      // Load radar layer for this frame
      if (radarLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(radarLayerRef.current);
        radarLayerRef.current = null;
      }
      
      // Load new radar layer for this timestamp
      const map = mapInstanceRef.current;
      if (map && window.L) {
        if (radarSource === 'rainviewer') {
          const tileUrlTemplate = `/api/rainviewer/tile/${timestamp}/256/{z}/{x}/{y}/2/1_1.png`;
          radarLayerRef.current = window.L.tileLayer(tileUrlTemplate, {
            opacity: 0.6,
            zIndex: 200,
            attribution: 'RainViewer'
          });
        } else {
          // NEXRAD: Use RIDGE API for site-specific historical data
          const timestampStr = String(timestamp);
          let nexradUrl;
          
          if (timestampStr.startsWith('current') || !nexradSite) {
            // Fallback to current composite radar
            nexradUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?t=${Date.now()}`;
          } else {
            // Use RIDGE API for historical site-specific data
            nexradUrl = `/api/nexrad/tile/${nexradSite}/${timestamp}/{z}/{x}/{y}.png`;
          }
          
          radarLayerRef.current = window.L.tileLayer(nexradUrl, {
            opacity: 0.7,
            zIndex: 200,
            attribution: `NEXRAD ${nexradSite ? `(${nexradSite})` : ''}`,
            updateWhenIdle: true,
            updateWhenZooming: false
          });
        }
        
        radarLayerRef.current.addTo(map);
      }
      
      // Sample precipitation data for this frame only when not animating
      if (!isAnimating) {
        setTimeout(() => sampleRadarDbz(), 1000);
      }
    }
  }, [currentFrameIndex, radarFrames, radarSource]);

  // Auto-refresh waypoints when radar source changes
  useEffect(() => {
    // Only trigger if we have a map and location
    if (!mapInstanceRef.current || !location) return;
    
    // Clear existing waypoints when switching sources
    setPrecipitationPoints([]);
    setRadarFrameHistory([]);
    
    // Clear waypoint markers from map
    if (sectorHighlightsRef.current) {
      mapInstanceRef.current.removeLayer(sectorHighlightsRef.current);
      sectorHighlightsRef.current = null;
    }
    
    // Wait for radar layer to load, then sample new data
    const refreshTimer = setTimeout(() => {
      console.log(`Radar source switched to ${radarSource.toUpperCase()} - sampling precipitation data`);
      sampleRadarDbz();
    }, 1500); // Give time for radar tiles to load
    
    return () => clearTimeout(refreshTimer);
  }, [radarSource]);



  // Notify parent component when radar source changes
  useEffect(() => {
    if (onRadarSourceChange) {
      onRadarSourceChange(radarSource);
    }
  }, [radarSource, onRadarSourceChange]);

  // Cleanup auto-sampling timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSampleTimeoutRef.current) {
        clearTimeout(autoSampleTimeoutRef.current);
      }
    };
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
      }).setView([location.lat, location.lon], 10);

      // Add dark base tile layer
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
      
      // Add map event listeners for auto-sampling with debouncing
      const debouncedTrigger = () => {
        console.log('Map movement detected, triggering auto-sample');
        triggerAutoSample();
      };
      
      map.on('moveend', debouncedTrigger);
      map.on('zoomend', debouncedTrigger);
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off('moveend');
        mapInstanceRef.current.off('zoomend');
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [location]);

  // Update map center and range circle when location or range changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    map.setView([location.lat, location.lon], 10);

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

  // Simple clustering to reduce clutter while preserving highest intensities
  const clusterPrecipitationPoints = (points: Array<{lat: number; lon: number; dbz: number; id: string}>) => {
    const clustered: Array<{lat: number; lon: number; dbz: number; id: string; count?: number}> = [];
    const processed = new Set<string>();

    // Sort points by intensity (highest first) to prioritize strong storms
    const sortedPoints = [...points].sort((a, b) => b.dbz - a.dbz);

    for (const point of sortedPoints) {
      if (processed.has(point.id)) continue;

      // Find nearby points within clustering radius
      const clusterRadius = point.dbz >= 45 ? 0.8 : point.dbz >= 35 ? 1.2 : 1.5; // Miles
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

  // Calculate storm movement by comparing current frame with previous radar frame
  const calculateStormMovement = (currentCluster: any): {speed: number, direction: number} => {
    // Need at least 2 frames for comparison
    if (radarFrameHistory.length < 2) {
      console.log(`Not enough frames for movement calculation: ${radarFrameHistory.length} frames available`);
      return {speed: 0, direction: 0};
    }

    // Get the most recent previous frame (not current)
    const previousFrame = radarFrameHistory[radarFrameHistory.length - 2];
    const timeDiffMinutes = (Date.now() - previousFrame.timestamp) / 1000 / 60; // minutes
    
    // If animation is running or time difference is too small, skip movement calculation
    if (isAnimating || timeDiffMinutes < 2) {
      return {speed: 0, direction: 0};
    }
    
    console.log(`Calculating movement: ${timeDiffMinutes.toFixed(1)} minutes between frames`);
    
    // Find closest matching storm cell in previous frame
    let bestMatch = null;
    let minDistance = Infinity;
    
    for (const prevPoint of previousFrame.precipitationPoints) {
      const distance = calculateDistance(currentCluster.lat, currentCluster.lon, prevPoint.lat, prevPoint.lon);
      const intensityDiff = Math.abs(currentCluster.dbz - prevPoint.dbz);
      
      // Match criteria: within 8 miles and similar intensity (within 25 dBZ)
      if (distance <= 8 && intensityDiff <= 25 && distance < minDistance) {
        minDistance = distance;
        bestMatch = prevPoint;
      }
    }

    if (!bestMatch) {
      console.log(`No match found for storm at ${currentCluster.lat.toFixed(3)}, ${currentCluster.lon.toFixed(3)} (${currentCluster.dbz} dBZ)`);
      return {speed: 0, direction: 0};
    }

    // Calculate actual movement
    const distanceMiles = calculateDistance(bestMatch.lat, bestMatch.lon, currentCluster.lat, currentCluster.lon);
    const timeHours = timeDiffMinutes / 60;
    const speed = distanceMiles / timeHours; // mph
    const direction = calculateBearing(bestMatch.lat, bestMatch.lon, currentCluster.lat, currentCluster.lon);

    console.log(`Storm moved ${distanceMiles.toFixed(2)} miles in ${timeDiffMinutes.toFixed(1)} min = ${speed.toFixed(1)} mph @ ${direction.toFixed(0)}°`);

    // Filter out unrealistic speeds (storms typically move 3-70 mph)
    if (speed >= 3 && speed <= 70 && distanceMiles >= 0.2) {
      return {speed: Math.round(speed), direction: Math.round(direction)};
    }

    // Movement too slow or too fast - show as stationary
    return {speed: 0, direction: 0};
  };

  // Fetch winds aloft data for storm movement prediction
  const fetchWindsAloft = async (lat: number, lon: number) => {
    try {
      const response = await fetch(`/api/winds-aloft?lat=${lat}&lon=${lon}`);
      if (!response.ok) {
        console.warn('Winds aloft data unavailable');
        return null;
      }
      const data = await response.json();
      console.log('Winds aloft data received:', data.source, data.stormMovement);
      return data;
    } catch (error) {
      console.warn('Failed to fetch winds aloft:', error);
      return null;
    }
  };

  // Update storm data from precipitation points for the Storm Cells panel
  const updateStormDataFromPrecipitation = async (clusters: Array<{lat: number; lon: number; dbz: number; id: string; count?: number}>) => {
    if (!location) return;

    // Fetch winds aloft data for movement prediction (only once per update)
    const windsData = await fetchWindsAloft(location.lat, location.lon);
    setCurrentWindsData(windsData); // Store for arrow directions

    // Convert precipitation clusters to storm format with movement data
    const stormCells = clusters.map((cluster, index) => {
      const distance = calculateDistance(location.lat, location.lon, cluster.lat, cluster.lon);
      const bearing = calculateBearing(location.lat, location.lon, cluster.lat, cluster.lon);
      const observedMovement = calculateStormMovement(cluster);
      
      // Enhanced movement prediction using winds aloft data
      let windsPrediction = null;
      if (windsData && windsData.stormMovement && windsData.stormMovement.speed > 0) {
        windsPrediction = {
          direction: windsData.stormMovement.direction,
          speed: windsData.stormMovement.speed,
          confidence: windsData.stormMovement.confidence || 'medium',
          source: windsData.source || 'NOAA Aviation Weather'
        };
      }
      
      return {
        id: `precip_${radarSource}_${cluster.lat.toFixed(6)}_${cluster.lon.toFixed(6)}_${cluster.dbz}_${Date.now()}`,
        lat: cluster.lat,
        lon: cluster.lon,
        intensity: cluster.dbz,
        distance: distance,
        direction: bearing,
        speed: observedMovement.speed,
        type: cluster.dbz >= 45 ? 'Heavy' : cluster.dbz >= 35 ? 'Moderate' : 'Light',
        description: `${cluster.dbz} dBZ precipitation ${cluster.count ? `(${cluster.count} cells)` : ''}`,
        movementDirection: observedMovement.direction,
        windsPrediction: windsPrediction // Add winds aloft prediction
      };
    });

    // Trigger custom event to update storm data
    console.log(`DISPATCH EVENT: Dispatching precipitationStormData event with ${stormCells.length} storm cells for alert system`);
    console.log('DISPATCH EVENT: Storm cells being sent:', stormCells.map(s => `${s.intensity}dBZ @ ${s.distance?.toFixed(1)}mi`));
    if (windsData) {
      console.log('WINDS ALOFT: Movement prediction available:', windsData.stormMovement);
    }
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

  // Calculate destination point given start point, bearing, and distance
  const calculateDestination = (lat: number, lon: number, bearing: number, distance: number): {lat: number, lon: number} => {
    const R = 3959; // Earth's radius in miles
    const bearingRad = bearing * Math.PI / 180;
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    
    const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(distance / R) + 
                                Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad));
    
    const newLonRad = lonRad + Math.atan2(Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
                                          Math.cos(distance / R) - Math.sin(latRad) * Math.sin(newLatRad));
    
    return {
      lat: newLatRad * 180 / Math.PI,
      lon: newLonRad * 180 / Math.PI
    };
  };

  // Show storm cone visualization (30° cone extending 15 miles)
  const showStormCone = (stormLat: number, stormLon: number, movementDirection: number, intensity: number) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Remove existing cone
    hideStormCone();

    const coneDistance = 15; // 15 miles like StormScope
    const coneAngle = 30; // 30° total cone (±15°)
    const halfCone = coneAngle / 2;

    // Calculate cone vertices
    const leftBearing = (movementDirection - halfCone + 360) % 360;
    const rightBearing = (movementDirection + halfCone) % 360;
    const centerBearing = movementDirection;

    // Calculate end points of the cone
    const leftPoint = calculateDestination(stormLat, stormLon, leftBearing, coneDistance);
    const rightPoint = calculateDestination(stormLat, stormLon, rightBearing, coneDistance);
    const centerPoint = calculateDestination(stormLat, stormLon, centerBearing, coneDistance);

    // Create cone polygon
    const conePoints = [
      [stormLat, stormLon], // Storm position (apex)
      [leftPoint.lat, leftPoint.lon], // Left edge
      [centerPoint.lat, centerPoint.lon], // Center tip
      [rightPoint.lat, rightPoint.lon], // Right edge
      [stormLat, stormLon] // Back to start
    ];

    // Get color based on storm intensity
    const getConeColor = (dbz: number) => {
      if (dbz >= 55) return '#EF4444'; // Red for severe
      if (dbz >= 45) return '#F97316'; // Orange for heavy
      if (dbz >= 35) return '#EAB308'; // Yellow for moderate
      return '#22C55E'; // Green for light
    };

    const coneColor = getConeColor(intensity);

    // Create the cone polygon
    const cone = window.L.polygon(conePoints, {
      color: coneColor,
      weight: 2,
      opacity: 0.8,
      fillColor: coneColor,
      fillOpacity: 0.2,
      dashArray: '5, 5'
    });

    // Add center line showing movement direction
    const centerLine = window.L.polyline([
      [stormLat, stormLon],
      [centerPoint.lat, centerPoint.lon]
    ], {
      color: coneColor,
      weight: 3,
      opacity: 0.9,
      dashArray: '10, 5'
    });

    // Create layer group for the cone
    stormConeLayerRef.current = window.L.layerGroup([cone, centerLine]);
    stormConeLayerRef.current.addTo(map);

    // Add tooltip to cone
    cone.bindTooltip(`Storm Movement Cone<br>Direction: ${movementDirection.toFixed(0)}°<br>15-mile projection<br>±15° uncertainty`, {
      permanent: false,
      direction: 'top'
    });
  };

  // Hide storm cone visualization
  const hideStormCone = () => {
    const map = mapInstanceRef.current;
    if (map && stormConeLayerRef.current) {
      map.removeLayer(stormConeLayerRef.current);
      stormConeLayerRef.current = null;
    }
  };

  // Show all storm tracks at once
  const showAllStormCones = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || precipitationPoints.length === 0) return;

    // Remove existing all-cones layer
    hideAllStormCones();

    const allConesGroup = window.L.layerGroup();

    // Get movement direction from winds data
    const getStormMovementDirection = () => {
      if (currentWindsData && currentWindsData.stormMovement && currentWindsData.stormMovement.speed > 0) {
        return currentWindsData.stormMovement.direction;
      }
      return 0; // Default to north
    };

    const movementDirection = getStormMovementDirection();

    // Create cones for all visible precipitation points
    precipitationPoints.forEach(point => {
      // Only show cones for storms above light intensity
      if (point.dbz < 30) return;

      const coneDistance = 15; // 15 miles
      const coneAngle = 30; // 30° total cone (±15°)
      const halfCone = coneAngle / 2;

      // Calculate cone vertices
      const leftBearing = (movementDirection - halfCone + 360) % 360;
      const rightBearing = (movementDirection + halfCone) % 360;
      const centerBearing = movementDirection;

      // Calculate end points of the cone
      const leftPoint = calculateDestination(point.lat, point.lon, leftBearing, coneDistance);
      const rightPoint = calculateDestination(point.lat, point.lon, rightBearing, coneDistance);
      const centerPoint = calculateDestination(point.lat, point.lon, centerBearing, coneDistance);

      // Create cone polygon
      const conePoints = [
        [point.lat, point.lon], // Storm position (apex)
        [leftPoint.lat, leftPoint.lon], // Left edge
        [centerPoint.lat, centerPoint.lon], // Center tip
        [rightPoint.lat, rightPoint.lon], // Right edge
        [point.lat, point.lon] // Back to start
      ];

      // Get color based on storm intensity
      const getConeColor = (dbz: number) => {
        if (dbz >= 55) return '#EF4444'; // Red for severe
        if (dbz >= 45) return '#F97316'; // Orange for heavy
        if (dbz >= 35) return '#EAB308'; // Yellow for moderate
        return '#22C55E'; // Green for light
      };

      const coneColor = getConeColor(point.dbz);

      // Create the cone polygon with reduced opacity for multiple cones
      const cone = window.L.polygon(conePoints, {
        color: coneColor,
        weight: 1,
        opacity: 0.6,
        fillColor: coneColor,
        fillOpacity: 0.1,
        dashArray: '3, 3'
      });

      // Add center line showing movement direction with reduced opacity
      const centerLine = window.L.polyline([
        [point.lat, point.lon],
        [centerPoint.lat, centerPoint.lon]
      ], {
        color: coneColor,
        weight: 2,
        opacity: 0.5,
        dashArray: '8, 4'
      });

      allConesGroup.addLayer(cone);
      allConesGroup.addLayer(centerLine);
    });

    allStormConesLayerRef.current = allConesGroup;
    allStormConesLayerRef.current.addTo(map);
  };

  // Hide all storm cones
  const hideAllStormCones = () => {
    const map = mapInstanceRef.current;
    if (map && allStormConesLayerRef.current) {
      map.removeLayer(allStormConesLayerRef.current);
      allStormConesLayerRef.current = null;
    }
  };

  // Handle show all storm tracks toggle
  useEffect(() => {
    if (showAllStormTracks) {
      showAllStormCones();
      // Hide individual cone when showing all
      hideStormCone();
      setSelectedStormId(null);
    } else {
      hideAllStormCones();
    }
  }, [showAllStormTracks, precipitationPoints, currentWindsData]);

  // Add map click handler to hide cone when clicking elsewhere (only for individual cones)
  useEffect(() => {
    if (showAllStormTracks) return; // Don't handle clicks when showing all tracks
    
    const map = mapInstanceRef.current;
    if (map) {
      const handleMapClick = () => {
        if (selectedStormId) {
          hideStormCone();
          setSelectedStormId(null);
        }
      };
      
      map.on('click', handleMapClick);
      
      return () => {
        map.off('click', handleMapClick);
      };
    }
  }, [selectedStormId, showAllStormTracks]);

  // Cleanup cones on unmount
  useEffect(() => {
    return () => {
      hideStormCone();
      hideAllStormCones();
    };
  }, []);

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
      // Get radar source-specific thresholds
      const getIntensityThresholds = (radarSource: string = 'nexrad') => {
        if (radarSource === 'rainviewer') {
          // RainViewer adjusted thresholds (5-10 dBZ lower to account for higher readings)
          return { extreme: 53, veryHeavy: 47, heavy: 38, moderate: 27, light: 15 };
        }
        // NEXRAD standard thresholds
        return { extreme: 61, veryHeavy: 55, heavy: 46, moderate: 35, light: 20 };
      };
      
      const thresholds = getIntensityThresholds(radarSource);
      
      // Only show meaningful precipitation based on radar source
      if (point.dbz < thresholds.light) continue; // Skip trace/mist values
      
      const category = point.dbz >= thresholds.extreme ? 'extreme' :
                      point.dbz >= thresholds.veryHeavy ? 'veryHeavy' :
                      point.dbz >= thresholds.heavy ? 'heavy' :
                      point.dbz >= thresholds.moderate ? 'moderate' : 'light';
      const shouldShow = stormFilters[category as keyof typeof stormFilters];
      
      if (!shouldShow) continue; // Skip filtered out points
      // 5-category meteorological color system (20-90 dBZ)
      const getDbzColor = (dbz: number) => {
        if (dbz >= 61) return '#8B5CF6'; // Purple - Extreme thunderstorms
        if (dbz >= 55) return '#EF4444'; // Red - Very heavy rain/hail
        if (dbz >= 46) return '#F97316'; // Orange - Heavy rain
        if (dbz >= 35) return '#EAB308'; // Yellow - Moderate rain
        return '#22C55E'; // Green - Light rain (20-34 dBZ)
      };
      
      // Intensity-based sizing with cluster indication
      const getMarkerSize = (dbz: number, count?: number) => {
        let baseSize = 8;
        
        // Intensity-based sizing
        if (dbz >= 45) baseSize = 14;
        else if (dbz >= 35) baseSize = 12;
        else baseSize = 10;
        
        // Cluster size indicator
        if (count && count > 1) {
          baseSize += Math.min(4, count * 0.3);
        }
        
        return Math.round(baseSize);
      };
      
      const markerSize = getMarkerSize(point.dbz, point.count);
      
      // Add popup with precipitation info including rainfall rate
      const pointDistance = calculateDistance(centerLat, centerLon, point.lat, point.lon);
      
      // Determine if this storm meets the user's alert threshold
      const meetsAlertThreshold = alertPreferences && point.dbz >= alertPreferences.minimumDbz;
      const isAlertStorm = meetsAlertThreshold && pointDistance <= (alertPreferences?.alertRadius || 30);
      
      // Get alert threshold color (color that matches the minimum dBZ setting)
      const getAlertThresholdColor = (minimumDbz: number) => {
        if (minimumDbz >= 61) return '#8B5CF6'; // Purple - Extreme (61+ dBZ)
        if (minimumDbz >= 55) return '#EF4444'; // Red - Very Heavy (55-60 dBZ)
        if (minimumDbz >= 46) return '#F97316'; // Orange - Heavy (46-54 dBZ)
        if (minimumDbz >= 35) return '#EAB308'; // Yellow - Moderate (35-45 dBZ)
        return '#22C55E'; // Green - Light (20-34 dBZ)
      };
      
      const alertColor = alertPreferences ? getAlertThresholdColor(alertPreferences.minimumDbz) : '#ffff00';
      
      // Get storm movement direction from current winds aloft data
      const getStormMovementDirection = () => {
        // Use the stored winds aloft data
        if (currentWindsData && currentWindsData.stormMovement && currentWindsData.stormMovement.speed > 0) {
          return currentWindsData.stormMovement.direction;
        }
        
        // Fallback to north if no prediction available
        return 0;
      };
      
      const movementDirection = getStormMovementDirection();
      
      // Create directional arrow marker using custom arrow image
      // Storm arrows point in the direction they are moving (same as wind direction)
      const waypointIcon = window.L.divIcon({
        html: `
          <div style="
            width: ${markerSize + 8}px;
            height: ${markerSize + 8}px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${movementDirection}deg);
            ${isAlertStorm ? 'animation: pulse 2s infinite;' : ''}
          ">
            <svg width="${markerSize}" height="${markerSize}" viewBox="0 0 24 24" style="
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
              ${isAlertStorm ? `filter: drop-shadow(0 0 6px ${alertColor});` : ''}
            ">
              <path d="M12 3 L19 12 L15 12 L15 21 L9 21 L9 12 L5 12 Z" 
                    fill="${getDbzColor(point.dbz)}" 
                    stroke="${isAlertStorm ? alertColor : '#ffffff'}" 
                    stroke-width="${isAlertStorm ? '2' : '1'}"
                    />
            </svg>
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-${movementDirection}deg);
              font-size: ${Math.max(6, markerSize * 0.35)}px;
              font-weight: bold;
              color: #ffffff;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
              pointer-events: none;
              background-color: ${getDbzColor(point.dbz)};
              padding: 1px 3px;
              border-radius: 3px;
              border: 1px solid rgba(255,255,255,0.5);
            ">
              ${point.dbz}
            </div>
          </div>
          ${isAlertStorm ? `
            <style>
              @keyframes pulse {
                0% { transform: rotate(${movementDirection}deg) scale(1); opacity: 1; }
                50% { transform: rotate(${movementDirection}deg) scale(1.2); opacity: 0.7; }
                100% { transform: rotate(${movementDirection}deg) scale(1); opacity: 1; }
              }
            </style>
          ` : ''}
        `,
        className: `dbz-waypoint ${isAlertStorm ? 'alert-storm' : ''}`,
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2]
      });
      
      // Create waypoint marker at actual precipitation location
      const waypointMarker = window.L.marker([point.lat, point.lon], {
        icon: waypointIcon
      });
      
      // Official NOAA/NWS dBZ to rainfall rate conversion table
      // Source: https://www.noaa.gov/jetstream/jetstream/radar-images-velocity
      const getRainfallRate = (dbz: number): { mmh: number; inh: number } => {
        if (dbz >= 65) return { mmh: 420, inh: 16.0 };
        if (dbz >= 60) return { mmh: 205, inh: 8.0 };
        if (dbz >= 55) return { mmh: 100, inh: 4.0 };
        if (dbz >= 50) return { mmh: 47, inh: 1.9 };
        if (dbz >= 45) return { mmh: 24, inh: 0.92 };
        if (dbz >= 40) return { mmh: 12, inh: 0.45 };
        if (dbz >= 35) return { mmh: 6, inh: 0.22 };
        if (dbz >= 30) return { mmh: 3, inh: 0.10 };
        if (dbz >= 25) return { mmh: 1, inh: 0.05 };
        if (dbz >= 20) return { mmh: 0.25, inh: 0.01 }; // Trace amounts
        return { mmh: 0, inh: 0 };
      };
      
      const getPrecipitationType = (dbz: number, radarSource: string = 'nexrad') => {
        const thresholds = getIntensityThresholds(radarSource);
        if (dbz >= thresholds.extreme + 8) return 'Extreme Thunderstorms';
        if (dbz >= thresholds.extreme) return 'Severe Thunderstorms';
        if (dbz >= thresholds.veryHeavy) return 'Very Heavy Rain/Hail';
        if (dbz >= thresholds.heavy) return 'Heavy Rain';
        if (dbz >= thresholds.moderate) return 'Moderate Rain';
        if (dbz >= thresholds.light) return 'Light Rain';
        return 'Trace/Mist';
      };
      
      const rainfallData = getRainfallRate(point.dbz);
      const precipType = getPrecipitationType(point.dbz, radarSource);
      
      // Calculate distance for popup display
      const displayDistance = pointDistance;
      
      const getHailInfo = (dbz: number) => {
        if (dbz >= 65) return 'Large hail likely (2"+ diameter)';
        if (dbz >= 60) return 'Golf ball size hail possible (1.75")';
        if (dbz >= 55) return 'Quarter size hail possible (1")';
        return '';
      };

      const hailWarning = getHailInfo(point.dbz);
      
      const popupContent = point.count && point.count > 1 
        ? `<b>Storm Cell Cluster</b><br>
           Distance: ${displayDistance.toFixed(1)} miles<br>
           Max Intensity: ${point.dbz} dBZ<br>
           ${point.dbz >= 55 ? 'Rain/Hail Rate:' : 'Rain Rate:'} ${rainfallData.mmh} mm/h (${rainfallData.inh} in/h)<br>
           Type: ${precipType}<br>
           ${hailWarning ? `<span style="color: orange;">${hailWarning}</span><br>` : ''}
           Cells: ${point.count}<br>
           <small>Real-time ${radarSource === 'nexrad' ? 'NEXRAD' : 'RainViewer'} data</small>`
        : `<b>Precipitation Cell</b><br>
           Distance: ${displayDistance.toFixed(1)} miles<br>
           Intensity: ${point.dbz} dBZ<br>
           ${point.dbz >= 55 ? 'Rain/Hail Rate:' : 'Rain Rate:'} ${rainfallData.mmh} mm/h (${rainfallData.inh} in/h)<br>
           Type: ${precipType}<br>
           ${hailWarning ? `<span style="color: orange;">${hailWarning}</span><br>` : ''}
           <small>Real-time ${radarSource === 'nexrad' ? 'NEXRAD' : 'RainViewer'} data</small>`;
      
      waypointMarker.bindPopup(popupContent);
      
      // Add click handler to show/hide storm cone (only when not showing all tracks)
      waypointMarker.on('click', (e: any) => {
        e.originalEvent.stopPropagation();
        
        // Don't handle individual clicks when showing all tracks
        if (showAllStormTracks) return;
        
        const stormId = point.id || `storm_${point.lat}_${point.lon}`;
        
        if (selectedStormId === stormId) {
          // Hide cone if same storm clicked
          hideStormCone();
          setSelectedStormId(null);
        } else {
          // Show cone for new storm
          showStormCone(point.lat, point.lon, movementDirection, point.dbz);
          setSelectedStormId(stormId);
        }
      });
      
      waypointGroup.addLayer(waypointMarker);
    }

    sectorHighlightsRef.current = waypointGroup;
    sectorHighlightsRef.current.addTo(map);
  };

  // Update waypoint markers based on dBZ data and filters
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
  }, [precipitationPoints, showSectorGrid, location, stormFilters]);



  // Load radar layer based on source
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

    try {
      if (radarSource === 'rainviewer') {
        // RainViewer global radar with proxy
        // Ensure we have a valid timestamp for RainViewer
        const validTimestamp = timestamp && timestamp !== 'current' ? timestamp : Math.floor(Date.now() / 1000);
        const rainviewerUrl = `/api/rainviewer/tile/${validTimestamp}/256/{z}/{x}/{y}/2/1_1.png`;
        
        radarLayerRef.current = window.L.tileLayer(rainviewerUrl, {
          attribution: 'RainViewer',
          opacity: 0.6,
          transparent: true,
          zIndex: 1000,
          maxZoom: 12
        });
      } else {
        // NEXRAD radar overlay
        radarLayerRef.current = window.L.tileLayer(
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
      }
      
      radarLayerRef.current.addTo(map);
    } catch (error) {
      console.error(`Error loading ${radarSource} radar:`, error);
      
      // Fallback to OpenWeatherMap
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

  const toggleRadarAnimation = () => {
    if (isAnimating) {
      stopAnimation();
    } else {
      startAnimation();
    }
  };

  const refreshRadar = async () => {
    if (radarSource === 'rainviewer') {
      // Reload RainViewer frames
      try {
        const response = await fetch('/api/rainviewer');
        const data = await response.json();
        if (data.radar && data.radar.past) {
          setRadarFrames(data.radar.past.map((frame: any) => frame.time));
          setCurrentFrame(Math.max(0, data.radar.past.length - 1));
        }
      } catch (error) {
        console.error('Failed to refresh RainViewer frames:', error);
      }
    } else {
      // For NEXRAD, use simple timestamp refresh
      setRadarFrames([Math.floor(Date.now() / 1000)]);
      setCurrentFrame(0);
    }
    
    // Trigger dBZ sampling after radar refresh
    setTimeout(() => sampleRadarDbz(), 2000);
  };

  // NEXRAD color to dBZ mapping (standard NOAA colormap)
  const nexradColorToDbz = (r: number, g: number, b: number): number => {
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

  // RainViewer color to dBZ mapping (RainViewer's color scheme)
  const rainviewerColorToDbz = (r: number, g: number, b: number): number => {
    // RainViewer uses a different color scheme - more blue-based
    const colorMap: {[key: string]: number} = {
      // Light precipitation (blue tones)
      '#000080': 15,  // Dark blue - light
      '#0000ff': 20,  // Blue - light rain
      '#4080ff': 25,  // Light blue
      '#80c0ff': 30,  // Lighter blue
      
      // Moderate precipitation (green/yellow)
      '#00ff00': 35,  // Green - moderate
      '#80ff00': 40,  // Yellow-green
      '#ffff00': 45,  // Yellow - heavy
      '#ffc000': 50,  // Orange-yellow
      
      // Heavy precipitation (orange/red)
      '#ff8000': 55,  // Orange - very heavy
      '#ff4000': 60,  // Red-orange
      '#ff0000': 65,  // Red - severe
      '#c00000': 70,  // Dark red
      '#800080': 75,  // Purple - extreme
      '#ff00ff': 80   // Magenta - extreme
    };
    
    // Find closest color match with more tolerance for RainViewer's smoother gradients
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
    
    // Use a higher tolerance for RainViewer's smoother color transitions
    return minDistance < 80 ? bestMatch : 0;
  };

  // Sample radar dBZ values from both NEXRAD and RainViewer
  const sampleRadarDbz = async () => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !location) return;

    console.log(`Starting precipitation sampling...`);
    
    if (radarSource === 'nexrad') {
      await sampleNexradData();
    } else {
      await sampleRainViewerData();
    }
  };

  // NEXRAD-specific data sampling (US coverage)
  const sampleNexradData = async () => {
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

      // Sample each tile for precipitation using NEXRAD
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
          
          // Sample every 4th pixel to find precipitation (finer grid)
          const sampleStep = 4;
          
          for (let x = 0; x < tileSize; x += sampleStep) {
            for (let y = 0; y < tileSize; y += sampleStep) {
              const pixelIndex = (y * tileSize + x) * 4;
              const r = data[pixelIndex];
              const g = data[pixelIndex + 1];
              const b = data[pixelIndex + 2];
              const alpha = data[pixelIndex + 3];
              
              if (alpha > 0) {
                const dbz = nexradColorToDbz(r, g, b);
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
      
      // Store radar frame history for accurate movement calculation
      if (precipitationPoints.length > 0) {
        setRadarFrameHistory(prev => {
          const currentTimestamp = Date.now();
          const newFrame = {
            timestamp: currentTimestamp,
            precipitationPoints: [...precipitationPoints]
          };
          
          // Keep last 10 frames (about 15-20 minutes of history)
          const updatedHistory = [...prev, newFrame].slice(-10);
          
          console.log(`Radar frame stored. History: ${updatedHistory.length} frames spanning ${updatedHistory.length > 1 ? Math.round((currentTimestamp - updatedHistory[0].timestamp) / 1000 / 60) : 0} minutes. Current frame has ${precipitationPoints.length} points.`);
          
          // Automatically detect movement when we have enough frames
          if (updatedHistory.length >= 3) {
            console.log('Sufficient frames for movement analysis available');
          }
          
          return updatedHistory;
        });
      }

      // Update storm data with clustered precipitation points
      console.log(`NEXRAD: Calling updateStormDataFromPrecipitation with ${clusteredPoints.length} clustered precipitation points`);
      updateStormDataFromPrecipitation(clusteredPoints);
      
    } catch (error) {
      console.error('Error sampling NEXRAD dBZ:', error);
    }
  };

  // RainViewer-specific data sampling (Global coverage)
  const sampleRainViewerData = async () => {
    const map = mapInstanceRef.current;
    if (!map || !radarLayerRef.current || radarFrames.length === 0) return;

    try {
      // Get map bounds and center
      const center = map.getCenter();
      const zoom = map.getZoom();

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

      // Get current RainViewer timestamp - ensure it's valid
      const timestamp = radarFrames[currentFrame] || radarFrames[radarFrames.length - 1];
      if (!timestamp || timestamp === 'current') {
        console.log('RainViewer: Invalid timestamp, skipping sampling');
        return;
      }

      // Sample each tile for precipitation using RainViewer
      for (const tile of tilesToCheck) {
        try {
          const tileUrl = `/api/rainviewer/tile/${timestamp}/256/${zoom}/${tile.x}/${tile.y}/2/1_1.png`;
          
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
          
          // Sample every 4th pixel to find precipitation (finer grid)
          const sampleStep = 4;
          
          for (let x = 0; x < tileSize; x += sampleStep) {
            for (let y = 0; y < tileSize; y += sampleStep) {
              const pixelIndex = (y * tileSize + x) * 4;
              const r = data[pixelIndex];
              const g = data[pixelIndex + 1];
              const b = data[pixelIndex + 2];
              const alpha = data[pixelIndex + 3];
              
              if (alpha > 0) {
                const dbz = rainviewerColorToDbz(r, g, b);
                if (dbz >= 20) { // Lower threshold for RainViewer to catch more precipitation
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
      
      console.log(`RainViewer: Found ${precipitationPoints.length} raw points, clustered to ${clusteredPoints.length} waypoints`);
      
      // Store radar frame history for accurate movement calculation
      if (precipitationPoints.length > 0) {
        setRadarFrameHistory(prev => {
          const currentTimestamp = Date.now();
          const newFrame = {
            timestamp: currentTimestamp,
            precipitationPoints: [...precipitationPoints]
          };
          
          // Keep last 10 frames (about 15-20 minutes of history)
          const updatedHistory = [...prev, newFrame].slice(-10);
          
          console.log(`Radar frame stored. History: ${updatedHistory.length} frames spanning ${updatedHistory.length > 1 ? Math.round((currentTimestamp - updatedHistory[0].timestamp) / 1000 / 60) : 0} minutes. Current frame has ${precipitationPoints.length} points.`);
          
          // Automatically detect movement when we have enough frames
          if (updatedHistory.length >= 3) {
            console.log('Sufficient frames for movement analysis available');
          }
          
          return updatedHistory;
        });
      }

      // Update storm data with clustered precipitation points
      console.log(`RainViewer: Calling updateStormDataFromPrecipitation with ${clusteredPoints.length} clustered precipitation points`);
      updateStormDataFromPrecipitation(clusteredPoints);
      
    } catch (error) {
      console.error('Error sampling RainViewer dBZ:', error);
    }
  };

  // Highlight storm cell with pulsing animation
  const highlightStormCell = (lat: number, lon: number) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Remove existing highlight
    if (highlightLayerRef.current) {
      map.removeLayer(highlightLayerRef.current);
    }

    // Create pulsing highlight circle
    const highlightCircle = window.L.circle([lat, lon], {
      color: '#00ff00',
      fillColor: '#00ff00',
      fillOpacity: 0.3,
      radius: 2000, // 2km radius
      weight: 3,
      className: 'storm-highlight-pulse'
    });

    highlightLayerRef.current = highlightCircle;
    highlightCircle.addTo(map);

    // Auto-remove highlight after 3 seconds
    setTimeout(() => {
      if (highlightLayerRef.current) {
        map.removeLayer(highlightLayerRef.current);
        highlightLayerRef.current = null;
      }
    }, 3000);
  };

  const getTimeDisplay = (): string => {
    return 'Live';
  };

  return (
    <div className="bg-slate-900/80 rounded-xl p-3 sm:p-4 border border-slate-600/50">

      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <h2 className="text-lg font-semibold text-white">
            Storm Tracker
          </h2>
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            <div className="text-slate-400 text-xs sm:text-sm">
              Range: {radarRange} miles
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setRadarSource(radarSource === 'rainviewer' ? 'nexrad' : 'rainviewer')}
            variant="outline"
            size="sm"
            className="text-xs px-2"
          >
            Switch to {radarSource === 'rainviewer' ? 'NEXRAD' : 'RainViewer'}
          </Button>
          <Button
            onClick={() => setShowSectorGrid(!showSectorGrid)}
            variant={showSectorGrid ? "default" : "outline"}
            size="sm"
            className="text-xs px-2"
          >
            {showSectorGrid ? "Hide" : "Show"} Grid
          </Button>

          <Button
            onClick={toggleRadarAnimation}
            variant={isAnimating ? "destructive" : "default"}
            size="sm"
            className="text-xs px-2"
            disabled={radarSource === 'nexrad' || radarFrames.length < 2}
          >
            {isAnimating ? 'Stop' : 'Play'}
          </Button>
          {radarFrames.length > 1 && (
            <span className="text-xs text-slate-400">
              {currentFrameIndex >= 0 ? `${currentFrameIndex + 1}/${radarFrames.length}` : 'Live'}
            </span>
          )}
        </div>
      </div>

      {/* Radar Info */}
      <div className="bg-slate-800/50 rounded-lg p-2 sm:p-3 mb-4 border border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs sm:text-sm text-slate-300">Radar Source:</span>
            <div className="text-xs sm:text-sm text-white">{radarSource === 'rainviewer' ? 'RainViewer' : 'NEXRAD'}</div>
          </div>
          <div className="text-xs text-slate-400">
            {radarSource === 'rainviewer' ? 'Global Coverage (Animated)' : 'US High-Resolution (Static)'}
          </div>
        </div>
      </div>
      
      <div className={`relative bg-slate-900 rounded-lg border border-slate-600 overflow-hidden h-[400px] md:h-[600px] lg:h-[700px] xl:h-[800px] ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div ref={mapRef} className="w-full h-full"></div>
        
        {/* Disabled overlay */}
        {isDisabled && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="text-white text-center">
              <div className="text-lg font-semibold">Map Disabled</div>
              <div className="text-sm text-slate-300">Close settings to interact with map</div>
            </div>
          </div>
        )}
        
        {/* Update Storms Button - Top Right */}
        <div className="absolute top-3 right-3 z-[1000]">
          <Button
            onClick={sampleRadarDbz}
            variant="outline"
            size="sm"
            className="text-xs px-3 py-2 bg-slate-800/90 border-slate-600 hover:bg-slate-700/90"
            disabled={isAnimating}
          >
            Update Storms
          </Button>
        </div>
        
        {/* Radar Info */}
        <div className="radar-controls">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Radar: {getTimeDisplay()}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Range: {radarRange} miles | {radarSource === 'rainviewer' ? 'RainViewer' : 'NEXRAD Radar (NWS/NOAA)'}
          </div>
        </div>
      </div>






    </div>
  );
}
