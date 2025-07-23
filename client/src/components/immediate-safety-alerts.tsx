import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Navigation, Clock, ArrowUpDown } from "lucide-react";

interface Storm {
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: number;
  movement?: {
    direction: number;
    speed: number;
    impact: 'high' | 'medium' | 'low';
    eta?: string;
  };
}

interface NWSAlert {
  id: string;
  type: string;
  severity: string;
  urgency: string;
  certainty: string;
  headline: string;
  description: string;
  instruction?: string;
  areas: string;
  effective: string;
  expires: string;
  senderName: string;
}

interface ImmediateSafetyAlertsProps {
  location: any;
  storms: Storm[];
  isLoading: boolean;
}

const getSeverityColor = (severity: string): string => {
  switch (severity?.toLowerCase()) {
    case 'extreme': return 'bg-red-600';
    case 'severe': return 'bg-orange-600';
    case 'high': return 'bg-orange-600';
    case 'moderate': return 'bg-yellow-600';
    case 'low': return 'bg-blue-600';
    case 'minor': return 'bg-blue-600';
    default: return 'bg-gray-600';
  }
};

const getDirectionName = (degrees: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

const getIntensityCategory = (dBZ: number): string => {
  if (dBZ >= 61) return "Extreme";
  if (dBZ >= 55) return "Severe";  
  if (dBZ >= 46) return "Heavy";
  if (dBZ >= 35) return "Moderate";
  return "Light";
};

export default function ImmediateSafetyAlerts({ location, storms, isLoading }: ImmediateSafetyAlertsProps) {
  // Get winds aloft data for storm movement information
  const { data: windsAloftData } = useQuery({
    queryKey: ['/api/winds-aloft', location?.lat, location?.lon],
    enabled: !!location,
    staleTime: 10 * 60 * 1000, // 10 minutes
    queryFn: async () => {
      if (!location) return null;
      const response = await fetch(`/api/winds-aloft?lat=${location.lat}&lon=${location.lon}`);
      if (!response.ok) return null;
      return response.json();
    },
  });
  const [showAlerts, setShowAlerts] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Delay showing alerts for 3 seconds to allow storm calculations to complete
  useEffect(() => {
    if (location && storms.length >= 0) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setShowAlerts(true);
        setIsAnimating(false);
      }, 3000); // 3 second delay
      
      return () => clearTimeout(timer);
    }
  }, [location, storms.length]);

  // Get NWS alerts after delay
  const { data: nwsAlerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['/api/nws-alerts', location?.lat, location?.lon],
    enabled: !!location && showAlerts,
    queryFn: async () => {
      if (!location) return [];
      const response = await fetch(`/api/nws-alerts?lat=${location.lat}&lon=${location.lon}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.alerts || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000 // Refresh every 5 minutes
  });

  // Debug log to see what storms we're receiving
  console.log('🚨 IMMEDIATE SAFETY ALERTS: Received storms:', storms.map(s => 
    `${s.intensity?.toFixed(1)}dBZ @ ${s.distance?.toFixed(1)}mi, bearing: ${s.direction?.toFixed(1)}°`
  ));

  // Add movement data from winds aloft to storms
  const stormsWithMovement = storms.map(storm => {
    if (windsAloftData?.stormMovement) {
      return {
        ...storm,
        movement: {
          direction: windsAloftData.stormMovement.direction,
          speed: windsAloftData.stormMovement.speed,
          impact: 'low', // Default, can be enhanced later
        }
      };
    }
    return storm;
  });

  // Identify immediate storm threats (high impact or severe proximity)
  const immediateThreats = stormsWithMovement.filter(storm => {
    // High impact storms on collision course
    if (storm.movement?.impact === 'high' && storm.movement?.eta) {
      return true;
    }
    
    // Check if storm is approaching using 30-degree cone logic
    if (storm.movement && storm.movement.direction !== undefined && storm.movement.speed > 0) {
      // Calculate if storm is moving toward user (within 30° cone)
      const directionToUser = (storm.direction + 180) % 360; // Direction from storm to user
      const stormMovementDirection = storm.movement.direction;
      const angleDifference = Math.abs(((stormMovementDirection - directionToUser + 180) % 360) - 180);
      const isApproaching = angleDifference <= 15; // 30° cone = ±15°
      
      // Only alert for severe storms that are actually approaching
      if (storm.intensity >= 55 && storm.distance <= 30 && isApproaching) {
        console.log(`🎯 APPROACHING SEVERE STORM: ${storm.intensity.toFixed(1)}dBZ @ ${storm.distance.toFixed(1)}mi, moving ${stormMovementDirection}° toward user direction ${directionToUser.toFixed(0)}° (angle diff: ${angleDifference.toFixed(1)}°)`);
        return true;
      }
    }
    
    // Immediate vicinity storms (within 5 miles regardless of direction)
    if (storm.intensity >= 55 && storm.distance <= 5) {
      console.log(`⚠️ IMMEDIATE VICINITY: ${storm.intensity.toFixed(1)}dBZ @ ${storm.distance.toFixed(1)}mi - too close to ignore`);
      return true;
    }
    
    return false;
  });

  // Remove duplicate storms (within 0.01 degree proximity)
  const uniqueThreats = immediateThreats.filter((storm, index, arr) => 
    arr.findIndex(s => Math.abs(s.lat - storm.lat) < 0.01 && Math.abs(s.lon - storm.lon) < 0.01) === index
  );

  // Sort NWS alerts by effective date and headline content
  const sortedNwsAlerts = [...nwsAlerts].sort((a, b) => {
    const dateA = new Date(a.effective).getTime();
    const dateB = new Date(b.effective).getTime();
    
    // Primary sort by effective date
    if (dateA !== dateB) {
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    }
    
    // Secondary sort by expires date if effective dates are identical
    const expiresA = new Date(a.expires).getTime();
    const expiresB = new Date(b.expires).getTime();
    if (expiresA !== expiresB) {
      return sortOrder === 'newest' ? expiresB - expiresA : expiresA - expiresB;
    }
    
    // Extract expiration date from headline for more granular sorting
    const extractHeadlineDate = (headline: string) => {
      // Extract day number from expiration dates like "until July 21" vs "until July 22"
      const dayMatch = headline.match(/until July (\d{1,2})/);
      if (dayMatch) {
        return parseInt(dayMatch[1]);
      }
      return 0;
    };
    
    const headlineDateA = extractHeadlineDate(a.headline);
    const headlineDateB = extractHeadlineDate(b.headline);
    
    if (headlineDateA !== headlineDateB) {
      return sortOrder === 'newest' ? headlineDateB - headlineDateA : headlineDateA - headlineDateB;
    }
    
    // Final sort by alert type for consistent ordering
    return sortOrder === 'newest' ? b.type.localeCompare(a.type) : a.type.localeCompare(b.type);
  });

  const totalAlerts = nwsAlerts.length + uniqueThreats.length;

  // Skeleton loader component
  const SkeletonLoader = () => (
    <div className="animate-pulse space-y-3">
      <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/30">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-slate-600 rounded-full"></div>
          <div className="w-3 h-3 bg-slate-600 rounded-full"></div>
          <div className="w-24 h-4 bg-slate-600 rounded"></div>
        </div>
        <div className="w-full h-4 bg-slate-600 rounded mb-2"></div>
        <div className="w-2/3 h-3 bg-slate-600 rounded"></div>
      </div>
      <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/30">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-slate-600 rounded-full"></div>
          <div className="w-3 h-3 bg-slate-600 rounded-full"></div>
          <div className="w-32 h-4 bg-slate-600 rounded"></div>
        </div>
        <div className="w-4/5 h-4 bg-slate-600 rounded mb-2"></div>
        <div className="w-1/2 h-3 bg-slate-600 rounded"></div>
      </div>
    </div>
  );

  if (!location) return null;

  return (
    <div className={`bg-red-900/30 rounded-xl p-3 sm:p-4 border border-red-600/30 mb-4 sm:mb-6 transition-all duration-500 ${
      showAlerts ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-2'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isAnimating ? (
            <Loader2 className="h-5 w-5 text-red-400 animate-spin" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-400" />
          )}
          <h3 className="text-lg font-semibold text-red-200">
            Immediate Safety Alerts
          </h3>
          {!isAnimating && totalAlerts > 0 && (
            <span className="bg-red-600 text-white px-2 py-1 rounded-full text-xs font-bold animate-fadeIn">
              {totalAlerts}
            </span>
          )}
          {isAnimating && (
            <span className="bg-slate-600/50 text-slate-400 px-2 py-1 rounded-full text-xs">
              Loading...
            </span>
          )}
        </div>
        
        {/* Sort button for NWS alerts */}
        {!isAnimating && nwsAlerts.length > 1 && (
          <button
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-1 px-2 py-1 text-xs text-red-300 hover:text-red-100 bg-red-900/30 hover:bg-red-900/50 rounded transition-colors"
            title={`Sort ${sortOrder === 'newest' ? 'oldest first' : 'newest first'}`}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
          </button>
        )}
      </div>

      {isAnimating || alertsLoading ? (
        <SkeletonLoader />
      ) : totalAlerts === 0 ? (
        <div className="text-center py-2 animate-fadeIn">
          <p className="text-slate-300 text-sm">No immediate weather threats detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* NWS Alerts */}
          {sortedNwsAlerts.map((alert: NWSAlert, index: number) => (
            <div 
              key={`nws-${index}`} 
              className="bg-red-900/40 rounded-lg p-3 border border-red-600/30 animate-slideInUp"
              style={{
                animationDelay: `${index * 150}ms`,
                animationFillMode: 'both'
              }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-lg">🚨</div>
                <div className={`w-3 h-3 rounded-full ${getSeverityColor(alert.severity || '')}`}></div>
                <span className="font-semibold text-red-200">{alert.type}</span>
              </div>
              
              <p className="text-sm text-red-100 mb-2">{alert.headline}</p>
              
              {alert.expires && (
                <div className="flex items-center gap-1 text-xs text-red-300">
                  <Clock className="h-3 w-3" />
                  Expires: {(() => {
                    // Global dynamic timezone detection using browser's Intl API
                    const getGlobalTimeZone = (lat: number, lon: number): string => {
                      // Use a comprehensive coordinate-to-timezone mapping for major regions
                      // This covers global locations accurately
                      
                      // North America
                      if (lat >= 25 && lat <= 85 && lon >= -180 && lon <= -50) {
                        if (lon <= -165) return 'Pacific/Honolulu'; // Hawaii/Alaska
                        if (lon <= -114) return 'America/Los_Angeles'; // Pacific (includes Nevada)
                        if (lon <= -104) return 'America/Denver'; // Mountain  
                        if (lon <= -90) return 'America/Chicago'; // Central
                        return 'America/New_York'; // Eastern
                      }
                      
                      // Europe
                      if (lat >= 35 && lat <= 75 && lon >= -10 && lon <= 40) {
                        if (lon <= 15) return 'Europe/London'; // Western Europe
                        if (lon <= 30) return 'Europe/Berlin'; // Central Europe
                        return 'Europe/Moscow'; // Eastern Europe
                      }
                      
                      // Asia
                      if (lat >= -10 && lat <= 80 && lon >= 40 && lon <= 180) {
                        if (lon <= 75) return 'Asia/Dubai'; // Middle East/Western Asia
                        if (lon <= 105) return 'Asia/Bangkok'; // Southeast Asia
                        if (lon <= 135) return 'Asia/Shanghai'; // East Asia
                        return 'Asia/Tokyo'; // Far East Asia
                      }
                      
                      // Australia/Oceania
                      if (lat >= -50 && lat <= -10 && lon >= 110 && lon <= 180) {
                        return 'Australia/Sydney';
                      }
                      
                      // South America
                      if (lat >= -60 && lat <= 15 && lon >= -85 && lon <= -30) {
                        return 'America/Sao_Paulo';
                      }
                      
                      // Africa
                      if (lat >= -40 && lat <= 40 && lon >= -20 && lon <= 55) {
                        return 'Africa/Johannesburg';
                      }
                      
                      // Default fallback to user's system timezone
                      return Intl.DateTimeFormat().resolvedOptions().timeZone;
                    };
                    
                    const timeZone = getGlobalTimeZone(location?.lat || 41.2, location?.lon || -115.3);
                    
                    // Get the current timezone abbreviation dynamically
                    const getTimeZoneAbbreviation = (timeZone: string): string => {
                      try {
                        const date = new Date();
                        const formatter = new Intl.DateTimeFormat('en-US', {
                          timeZone: timeZone,
                          timeZoneName: 'short'
                        });
                        
                        const parts = formatter.formatToParts(date);
                        const timeZonePart = parts.find(part => part.type === 'timeZoneName');
                        return timeZonePart?.value || 'UTC';
                      } catch {
                        return 'UTC';
                      }
                    };
                    
                    const timeZoneName = getTimeZoneAbbreviation(timeZone);
                    
                    // Try to extract date and time from headline for more accurate display
                    const headlineMatch = alert.headline.match(/until (.*?)(\d{1,2}:\d{2}[AP]M\s+[A-Z]{2,4})/i);
                    if (headlineMatch) {
                      const dateText = headlineMatch[1].trim();
                      const fullTimeText = headlineMatch[2];
                      
                      // Parse the original time and timezone
                      const timeMatch = fullTimeText.match(/(\d{1,2}):(\d{2})([AP]M)\s+([A-Z]{2,4})/i);
                      if (timeMatch) {
                        const hour = parseInt(timeMatch[1]);
                        const minute = timeMatch[2];
                        const ampm = timeMatch[3];
                        const originalTz = timeMatch[4];
                        
                        // If the headline already shows the correct timezone, use it directly
                        if (originalTz === timeZoneName) {
                          const timeText = `${hour}:${minute} ${ampm} ${timeZoneName}`;
                          
                          // Dynamic date calculation using current date
                          const today = new Date();
                          const tomorrow = new Date(today);
                          tomorrow.setDate(today.getDate() + 1);
                          
                          const todayStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                          const tomorrowStr = tomorrow.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                          
                          // Check if it mentions today's or tomorrow's date
                          if (dateText.includes(todayStr) || dateText.includes(today.getDate().toString())) {
                            return `Today at ${timeText}`;
                          } else if (dateText.includes(tomorrowStr) || dateText.includes(tomorrow.getDate().toString())) {
                            return `Tomorrow at ${timeText}`;
                          } else {
                            return `${dateText} at ${timeText}`;
                          }
                        } else {
                          // Use the original time from headline since it's from NWS and should be authoritative
                          const timeText = fullTimeText;
                          
                          // Dynamic date calculation using current date
                          const today = new Date();
                          const tomorrow = new Date(today);
                          tomorrow.setDate(today.getDate() + 1);
                          
                          const todayStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                          const tomorrowStr = tomorrow.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                          
                          // Check if it mentions today's or tomorrow's date
                          if (dateText.includes(todayStr) || dateText.includes(today.getDate().toString())) {
                            return `Today at ${timeText}`;
                          } else if (dateText.includes(tomorrowStr) || dateText.includes(tomorrow.getDate().toString())) {
                            return `Tomorrow at ${timeText}`;
                          } else {
                            return `${dateText} at ${timeText}`;
                          }
                        }
                      }
                    }
                    // Fallback to API timestamp with proper timezone handling
                    const expireDate = new Date(alert.expires);
                    const today = new Date();
                    const tomorrow = new Date(today);
                    tomorrow.setDate(today.getDate() + 1);
                    
                    if (expireDate.toDateString() === today.toDateString()) {
                      return `Today at ${expireDate.toLocaleTimeString('en-US', {
                        timeZone: timeZone,
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short'
                      })}`;
                    } else if (expireDate.toDateString() === tomorrow.toDateString()) {
                      return `Tomorrow at ${expireDate.toLocaleTimeString('en-US', {
                        timeZone: timeZone,
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short'
                      })}`;
                    } else {
                      return expireDate.toLocaleString('en-US', {
                        timeZone: timeZone,
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short'
                      });
                    }
                  })()}
                </div>
              )}
              
              {alert.areas && (
                <p className="text-xs text-red-300 mt-1">Areas: {alert.areas}</p>
              )}

              {alert.instruction && (
                <div className="mt-2 p-2 bg-red-950/50 rounded text-xs text-red-200">
                  <strong>⚠️ Safety Instructions:</strong> {alert.instruction}
                </div>
              )}
            </div>
          ))}

          {/* Collision Course / Severe Proximity Storms */}
          {uniqueThreats.map((storm, index) => (
            <div 
              key={`storm-${index}`} 
              className="bg-orange-900/40 rounded-lg p-3 border border-orange-600/30 animate-slideInUp"
              style={{
                animationDelay: `${(sortedNwsAlerts.length + index) * 150}ms`,
                animationFillMode: 'both'
              }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-lg">⚡</div>
                <div className={`w-3 h-3 rounded-full ${
                  storm.intensity >= 55 ? 'bg-red-600' : 'bg-orange-600'
                }`}></div>
                <span className="font-semibold text-orange-200">
                  {getIntensityCategory(storm.intensity)} Storm Alert
                </span>
              </div>
              
              <div className="text-sm text-orange-100 space-y-1">
                <div className="w-full">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span>Storm is located {storm.distance.toFixed(1)} miles ({getDirectionName(storm.direction)}) of you</span>
                    <div 
                      className="h-3 w-3 flex items-center justify-center text-orange-300 mx-1 flex-shrink-0"
                      style={{ transform: `rotate(${storm.direction}deg)` }}
                    >
                      ↑
                    </div>
                    <span>of you</span>
                    {storm.movement && storm.movement.direction !== undefined && storm.movement.speed !== undefined && (
                      <span> heading {getDirectionName(storm.movement.direction)} ({storm.movement.direction.toFixed(0)}°) @ {storm.movement.speed.toFixed(1)} mph</span>
                    )}
                  </div>
                </div>
                <div>Intensity: {storm.intensity} dBZ</div>
                
                {storm.movement && (
                  <div className="mt-2 p-2 bg-orange-950/50 rounded text-xs">
                    {storm.movement.impact === 'high' ? (
                      <div className="text-red-300">
                        <strong>🎯 COLLISION COURSE:</strong> Storm moving toward your location
                        {storm.movement.eta && <div>ETA: {storm.movement.eta}</div>}
                      </div>
                    ) : (
                      <div className="text-orange-300">
                        <strong>⚠️ SEVERE PROXIMITY:</strong> High-intensity storm nearby
                      </div>
                    )}
                    <div className="mt-1 text-orange-200">
                      <strong>🏠 Take Shelter:</strong> Move indoors, avoid windows, stay away from metal objects.
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}