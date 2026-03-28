import { useEffect, useState } from "react";
import { Loader2, Cloud, CloudRain, CloudDrizzle, Zap, CloudSnow } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutoTranslate } from "@/hooks/use-auto-translate";
import { formatStormEta } from "@shared/storm-utils";

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
  windsPrediction?: {
    direction: number;
    speed: number;
    confidence: string;
    source: string;
  };
}

interface StormPanelProps {
  storms: Storm[];
  useMetric: boolean;
  formatDistance: (miles: number) => string;
  formatSpeed: (mph: number) => string;
  isLoading: boolean;
  radarSource?: 'rainviewer' | 'nexrad';
  userLocation?: { lat: number; lon: number; name: string };
  stormFilters?: {
    light: boolean;
    moderate: boolean;
    heavy: boolean;
    severe: boolean;
    veryHeavy: boolean;
    extreme: boolean;
  };
  alertPreferences?: any;
}

const getDirectionName = (degrees: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

// Alias for consistency with winds aloft display
const getCompassDirection = getDirectionName;

// Helper function to format direction with bearing in compass format
const formatDirectionWithBearing = (distance: number, bearing: number, formatDistance: (miles: number) => string): string => {
  const direction = getDirectionName(bearing);
  const formattedBearing = bearing.toFixed(0).padStart(3, '0');
  return `${direction} (${formattedBearing}°) @ ${formatDistance(distance)}`;
};

const getStormIntensityName = (intensity: number): string => {
  if (intensity >= 65) return 'Extreme Thunderstorms';
  if (intensity >= 60) return 'Severe Thunderstorms';  
  if (intensity >= 55) return 'Very Heavy Rain/Hail';
  if (intensity >= 46) return 'Heavy Rain';
  if (intensity >= 35) return 'Moderate Rain';
  if (intensity >= 20) return 'Light Rain';
  return 'Weak Storm';
};

const getStormIcon = (intensity: number) => {
  if (intensity >= 65) return <Zap className="w-5 h-5 text-purple-400" />; // Extreme - Lightning
  if (intensity >= 60) return <Zap className="w-5 h-5 text-red-400" />; // Severe - Lightning  
  if (intensity >= 55) return <CloudSnow className="w-5 h-5 text-red-400" />; // Very Heavy/Hail
  if (intensity >= 46) return <CloudRain className="w-5 h-5 text-orange-400" />; // Heavy Rain
  if (intensity >= 35) return <CloudRain className="w-5 h-5 text-yellow-400" />; // Moderate Rain
  if (intensity >= 20) return <CloudDrizzle className="w-5 h-5 text-green-400" />; // Light Rain
  return <Cloud className="w-5 h-5 text-gray-400" />; // Weak
};

const getStormColor = (intensity: number): string => {
  if (intensity >= 61) return 'bg-purple-500';
  if (intensity >= 55) return 'bg-red-500';
  if (intensity >= 46) return 'bg-orange-500';
  if (intensity >= 35) return 'bg-yellow-500';
  if (intensity >= 20) return 'bg-green-500';
  return 'bg-blue-500';
};

// Calculate if storm is headed toward user's location and ETA
const calculateStormImpact = (storm: Storm, userLat: number, userLon: number): {
  willImpact: boolean;
  eta: string | null;
  impactChance: 'high' | 'medium' | 'low';
} => {
  if (!storm.windsPrediction || storm.windsPrediction.speed <= 0) {
    return { willImpact: false, eta: null, impactChance: 'low' };
  }

  // Calculate bearing from storm to user
  const stormToUserBearing = calculateBearing(storm.lat, storm.lon, userLat, userLon);
  const stormMovementDirection = storm.windsPrediction.direction;
  
  // Calculate difference between storm movement direction and direction to user
  let angleDifference = Math.abs(stormMovementDirection - stormToUserBearing);
  if (angleDifference > 180) {
    angleDifference = 360 - angleDifference;
  }
  
  // Define impact cone: 30° left/right of storm movement direction
  const impactConeAngle = 30;
  const willImpact = angleDifference <= impactConeAngle;
  
  if (!willImpact) {
    return { willImpact: false, eta: null, impactChance: 'low' };
  }
  
  // Calculate ETA if storm is headed toward user
  const distanceToUser = storm.distance; // in miles
  const stormSpeedMph = storm.windsPrediction.speed;
  
  if (stormSpeedMph <= 0) {
    return { willImpact: true, eta: 'Stationary', impactChance: 'medium' };
  }
  
  // Calculate time to arrival
  const hoursToArrival = distanceToUser / stormSpeedMph;
  
  // Determine impact chance based on angle difference
  let impactChance: 'high' | 'medium' | 'low' = 'medium';
  if (angleDifference <= 10) impactChance = 'high';
  else if (angleDifference <= 20) impactChance = 'medium';
  else impactChance = 'low';
  
  const eta = formatStormEta(hoursToArrival * 60);
  
  return { willImpact: true, eta, impactChance };
};

// Calculate bearing between two points (same as in storm-map.tsx)
const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
};

// dBZ threshold adjustment based on radar source
// RainViewer reads 5-12 dBZ higher than NEXRAD due to different calibration
const getIntensityThresholds = (radarSource: string = 'nexrad') => {
  if (radarSource === 'rainviewer') {
    // RainViewer adjusted thresholds (5-10 dBZ lower to account for higher readings)
    return { extreme: 53, veryHeavy: 47, heavy: 38, moderate: 27, light: 15 };
  }
  // NEXRAD standard thresholds
  return { extreme: 61, veryHeavy: 55, heavy: 46, moderate: 35, light: 20 };
};

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

export default function StormPanel({ storms, formatDistance, formatSpeed, isLoading, radarSource, userLocation, stormFilters, alertPreferences }: StormPanelProps & { stormFilters?: any; alertPreferences?: any }) {
  const { at } = useAutoTranslate();
  // Local filter state that syncs with the map's precipitation waypoints legend
  const [currentFilters, setCurrentFilters] = useState({
    light: true, moderate: true, heavy: true, veryHeavy: true, extreme: true
  });

  // Listen for filter changes from the precipitation waypoints legend
  useEffect(() => {
    const handleFilterChange = (event: any) => {
      setCurrentFilters(event.detail);
    };

    window.addEventListener('stormFiltersChanged', handleFilterChange);
    return () => {
      window.removeEventListener('stormFiltersChanged', handleFilterChange);
    };
  }, []);

  // Use storms passed as props (these are the precipitation storms from the parent component)
  console.log(`STORM PANEL: Received ${storms.length} storms as props`);
  console.log('STORM PANEL: Props storms:', storms.map(s => `${s.intensity}dBZ @ ${s.distance?.toFixed(1)}mi`));
  
  // Always use precipitation storms data (real radar data) passed as props
  // This ensures we only show storms that are actually detected in the radar imagery
  const effectiveStorms = storms;
  
  // Apply current filter state using radar source-specific thresholds
  const thresholds = getIntensityThresholds(radarSource);
  const filteredStorms = effectiveStorms.filter(storm => {
    const category = storm.intensity >= thresholds.extreme ? 'extreme' :
                    storm.intensity >= thresholds.veryHeavy ? 'veryHeavy' :
                    storm.intensity >= thresholds.heavy ? 'heavy' : 
                    storm.intensity >= thresholds.moderate ? 'moderate' : 'light';
    return currentFilters[category as keyof typeof currentFilters];
  });
  
  console.log(`STORM PANEL: Filtered storms from ${effectiveStorms.length} to ${filteredStorms.length}`);
  console.log('STORM PANEL: Final filtered storms:', filteredStorms.map(s => `${s.intensity}dBZ @ ${s.distance?.toFixed(1)}mi`));
  
  // Sort storms by distance (closest first), then by highest dBZ intensity
  const sortedStorms = [...filteredStorms].sort((a, b) => {
    // Primary sort: distance (closest first)
    const distanceDiff = a.distance - b.distance;
    if (Math.abs(distanceDiff) > 0.1) { // If distance difference is significant (>0.1 miles)
      return distanceDiff;
    }
    // Secondary sort: intensity (highest dBZ first) for storms at similar distances
    return b.intensity - a.intensity;
  });

  // Group storms by intensity category using radar source-specific thresholds
  const stormsByCategory = {
    extreme: sortedStorms.filter(s => s.intensity >= thresholds.extreme),
    veryHeavy: sortedStorms.filter(s => s.intensity >= thresholds.veryHeavy && s.intensity < thresholds.extreme),
    heavy: sortedStorms.filter(s => s.intensity >= thresholds.heavy && s.intensity < thresholds.veryHeavy),
    moderate: sortedStorms.filter(s => s.intensity >= thresholds.moderate && s.intensity < thresholds.heavy),
    light: sortedStorms.filter(s => s.intensity >= thresholds.light && s.intensity < thresholds.moderate)
  };

  const renderStormCard = (storm: any) => {
    // Check if this storm meets the alert threshold
    const meetsAlertThreshold = alertPreferences && storm.intensity >= alertPreferences.minimumDbz;
    
    // Get alert threshold color class (matches the minimum dBZ setting)
    const getAlertBorderClass = (minimumDbz: number) => {
      if (minimumDbz >= 61) return 'border-purple-400'; // Purple - Extreme (61+ dBZ)
      if (minimumDbz >= 55) return 'border-red-400'; // Red - Very Heavy (55-60 dBZ)
      if (minimumDbz >= 46) return 'border-orange-400'; // Orange - Heavy (46-54 dBZ)
      if (minimumDbz >= 35) return 'border-yellow-400'; // Yellow - Moderate (35-45 dBZ)
      return 'border-green-400'; // Green - Light (20-34 dBZ)
    };
    
    const alertBorderClass = alertPreferences ? getAlertBorderClass(alertPreferences.minimumDbz) : 'border-yellow-400';
    
    return (
      <div 
        key={storm.id} 
        className={`bg-slate-700/50 rounded-lg p-3 mb-3 border-2 select-none ${
          meetsAlertThreshold 
            ? `${alertBorderClass}` 
            : 'border-slate-600/50'
        }`}
      >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {getStormIcon(storm.intensity)}
                  <span className="font-medium text-sm">{getStormIntensityName(storm.intensity)}</span>
                </div>
                <span className="text-xs text-slate-300">{storm.intensity.toFixed(0)} dBZ</span>
              </div>
              
              {/* Enhanced storm information */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-300">Location:</span>
                  <span className="text-xs text-white">{formatDirectionWithBearing(storm.distance, storm.direction, formatDistance)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-300">{storm.intensity >= 55 ? 'Rain/Hail Rate:' : 'Rain Rate:'}</span>
                  <span className="text-xs text-white">
                    {getRainfallRate(storm.intensity).mmh} mm/h ({getRainfallRate(storm.intensity).inh} in/h)
                  </span>
                </div>
                
                {storm.intensity >= 55 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-300">Hail Potential:</span>
                    <span className="text-xs text-orange-300">
                      {storm.intensity >= 65 ? 'Large hail (2"+ diameter)' : 
                       storm.intensity >= 60 ? 'Golf ball size (1.75")' : 
                       'Quarter size (1")'}
                    </span>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-300">Intensity:</span>
                  <span className="text-xs text-white">{storm.intensity.toFixed(0)} dBZ</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-300">Coordinates:</span>
                  <span className="text-xs text-slate-400">{storm.lat.toFixed(3)}°, {storm.lon.toFixed(3)}°</span>
                </div>
                
                {storm.speed > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-300">Movement:</span>
                    <span className="text-xs text-white">{formatSpeed(storm.speed)} @ {storm.direction.toFixed(0)}°</span>
                  </div>
                )}
                
                {storm.windsPrediction && (
                  <div>
                    <div className="text-xs text-slate-300 mb-1">Upperlevel Storm Movement Speed & Direction:</div>
                    <div className="text-right text-xs text-blue-300">
                      {storm.windsPrediction.speed > 0 ? `${getCompassDirection(storm.windsPrediction.direction)} (${String(Math.round(storm.windsPrediction.direction)).padStart(3, '0')}°) @ ${storm.windsPrediction.speed} mph` : 'Stationary'}
                      {storm.windsPrediction.confidence && storm.windsPrediction.confidence !== 'low' && (
                        <span className="ml-1 text-slate-400">({storm.windsPrediction.confidence})</span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* ETA calculation display */}
                {storm.windsPrediction && userLocation && (
                  (() => {
                    const impact = calculateStormImpact(storm, userLocation.lat, userLocation.lon);
                    return (
                      <div className="mt-2 pt-2 border-t border-slate-600/50">
                        <div className="text-xs text-slate-300 mb-1">Impact Assessment:</div>
                        <div className="text-right text-xs">
                          {impact.willImpact ? (
                            <div>
                              <span className={`${
                                impact.impactChance === 'high' ? 'text-red-300' :
                                impact.impactChance === 'medium' ? 'text-yellow-300' : 'text-green-300'
                              }`}>
                                {impact.impactChance === 'high' ? 'High' : 
                                 impact.impactChance === 'medium' ? 'Medium' : 'Low'} impact chance
                              </span>
                              {impact.eta && (
                                <div className="text-blue-300 mt-1">
                                  ETA: {impact.eta}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Low chance of impact</span>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
      </div>
      
      {storm.description && (
        <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-600">{storm.description}</p>
      )}
    </div>
    );
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 select-none">
      <div className="flex items-center gap-3 mb-4 select-none">
        <div className="text-2xl select-none">⚡</div>
        <h2 className="text-xl font-semibold select-none">Storm Cells ({sortedStorms.length})</h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-400 select-none" />}
      </div>
      
      {sortedStorms.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-400">
            {isLoading ? 'Scanning radar for storms...' : 'No storms detected in your area'}
          </p>
          <p className="text-slate-500 text-xs mt-1.5">
            {isLoading ? '0 storms detected so far' : '0 storms in scan range'}
          </p>
        </div>
      ) : (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 grid-rows-2 gap-1 bg-slate-700/50 h-auto p-2">
            <TabsTrigger value="all" className="text-xs px-2 py-1">
              All ({sortedStorms.length})
            </TabsTrigger>
            <TabsTrigger value="extreme" className="text-xs text-purple-300 px-2 py-1">
              Extreme ({stormsByCategory.extreme.length})
            </TabsTrigger>
            <TabsTrigger value="veryHeavy" className="text-xs text-red-300 px-2 py-1">
              Severe ({stormsByCategory.veryHeavy.length})
            </TabsTrigger>
            <TabsTrigger value="heavy" className="text-xs text-orange-300 px-2 py-1">
              Heavy ({stormsByCategory.heavy.length})
            </TabsTrigger>
            <TabsTrigger value="moderate" className="text-xs text-yellow-300 px-2 py-1">
              Moderate ({stormsByCategory.moderate.length})
            </TabsTrigger>
            <TabsTrigger value="light" className="text-xs text-green-300 px-2 py-1">
              Light ({stormsByCategory.light.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {sortedStorms.map(renderStormCard)}
          </TabsContent>
          
          <TabsContent value="extreme" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {stormsByCategory.extreme.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No extreme storms detected</p>
            ) : (
              stormsByCategory.extreme.map(renderStormCard)
            )}
          </TabsContent>
          
          <TabsContent value="veryHeavy" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {stormsByCategory.veryHeavy.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No severe storms detected</p>
            ) : (
              stormsByCategory.veryHeavy.map(renderStormCard)
            )}
          </TabsContent>
          
          <TabsContent value="heavy" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {stormsByCategory.heavy.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No heavy rain detected</p>
            ) : (
              stormsByCategory.heavy.map(renderStormCard)
            )}
          </TabsContent>
          
          <TabsContent value="moderate" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {stormsByCategory.moderate.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No moderate rain detected</p>
            ) : (
              stormsByCategory.moderate.map(renderStormCard)
            )}
          </TabsContent>
          
          <TabsContent value="light" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {stormsByCategory.light.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No light rain detected</p>
            ) : (
              stormsByCategory.light.map(renderStormCard)
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
