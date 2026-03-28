import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Navigation, Clock, ArrowUpDown } from "lucide-react";
import { getStormCategory, getCompassDirection, calculateETA, calculateApproachAngle, isStormApproaching, formatStormEta } from "@shared/storm-utils";
import { useLanguage } from "@/hooks/use-language";
import { translateWeatherText } from "@/lib/i18n";

function CountdownTimer({ etaMinutes, label }: { etaMinutes: number; label?: string }) {
  const [now, setNow] = useState(Date.now());
  const startRef = useRef(Date.now());
  const etaRef = useRef(etaMinutes);

  useEffect(() => {
    startRef.current = Date.now();
    etaRef.current = etaMinutes;
  }, [etaMinutes]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedMin = (now - startRef.current) / 60000;
  const remaining = Math.max(0, etaRef.current - elapsedMin);
  const totalSec = Math.floor(remaining * 60);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const isUrgent = remaining <= 10;
  const isWarning = remaining <= 20;

  const timeStr = hours > 0
    ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;

  if (remaining <= 0) {
    return (
      <span className="font-mono font-bold text-red-400 animate-pulse">
        {label || 'ETA'}: ARRIVING
      </span>
    );
  }

  return (
    <span className={`font-mono font-bold ${
      isUrgent ? 'text-red-400 animate-pulse' : isWarning ? 'text-orange-300' : 'text-yellow-300'
    }`}>
      {label || 'ETA'}: {timeStr}
    </span>
  );
}

interface Storm {
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: number;
  windsPrediction?: {
    direction: number;
    speed: number;
  };
  movement?: {
    direction: number;
    speed: number;
    impact: 'high' | 'medium' | 'low';
    eta?: string;
    etaMinutes?: number;
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
  geometry?: {
    type: string;
    coordinates: number[][][];
  } | null;
}

function pointInRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    const intersect = ((yi > lon) !== (yj > lon)) &&
      (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(lat: number, lon: number, rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false;
  if (!pointInRing(lat, lon, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lon, rings[i])) return false;
  }
  return true;
}

function isLocationInAlertZone(lat: number, lon: number, alert: NWSAlert): boolean {
  if (!alert.geometry || !alert.geometry.coordinates) return false;
  const geomType = alert.geometry.type;
  if (geomType === 'Polygon') {
    return pointInPolygonRings(lat, lon, alert.geometry.coordinates as unknown as number[][][]);
  }
  if (geomType === 'MultiPolygon') {
    const multiCoords = alert.geometry.coordinates as unknown as number[][][][];
    for (const polygonRings of multiCoords) {
      if (pointInPolygonRings(lat, lon, polygonRings)) return true;
    }
    return false;
  }
  return false;
}

interface ImmediateSafetyAlertsProps {
  location: any;
  storms: Storm[];
  isLoading: boolean;
  windsAloftData?: any;
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

const getDirectionName = getCompassDirection;
const getIntensityCategory = getStormCategory;

export default function ImmediateSafetyAlerts({ location, storms, isLoading, windsAloftData }: ImmediateSafetyAlertsProps) {
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const { language } = useLanguage();

  // Get NWS alerts after delay
  const { data: nwsAlerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['/api/nws-alerts', location?.lat, location?.lon],
    enabled: !!location,
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

  const { data: translatedAlerts } = useQuery({
    queryKey: ['/api/translate-alerts', language, nwsAlerts],
    enabled: language !== 'en' && nwsAlerts.length > 0,
    queryFn: async () => {
      const response = await fetch('/api/translate-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts: nwsAlerts, language })
      });
      if (!response.ok) return nwsAlerts;
      const data = await response.json();
      return data.translatedAlerts || nwsAlerts;
    },
    staleTime: 10 * 60 * 1000,
  });

  const displayAlerts = (language !== 'en' && translatedAlerts) 
    ? translatedAlerts.map((ta: any, i: number) => ({
        ...nwsAlerts[i],
        headline: ta.headline || nwsAlerts[i]?.headline,
        description: ta.description || nwsAlerts[i]?.description,
      }))
    : nwsAlerts;

  const formatEta = (minutes: number): string => {
    if (minutes < 1) return 'Imminent';
    return `~${formatStormEta(minutes)}`;
  };

  const stormsWithMovement = storms.map(storm => {
    const rawMovement = storm.windsPrediction
      ? { direction: storm.windsPrediction.direction, speed: storm.windsPrediction.speed }
      : storm.movement
        ? { direction: storm.movement.direction, speed: storm.movement.speed }
        : windsAloftData?.stormMovement
          ? { direction: windsAloftData.stormMovement.direction, speed: windsAloftData.stormMovement.speed }
          : null;

    if (!rawMovement || rawMovement.speed == null) return storm;

    const angleDiff = calculateApproachAngle(storm.direction, rawMovement.direction);
    const inCone = angleDiff <= 30;
    const approaching = isStormApproaching(storm.direction, rawMovement.direction, rawMovement.speed);
    const etaMinutes = approaching && rawMovement.speed > 0
      ? calculateETA(storm.distance, rawMovement.speed)
      : inCone && rawMovement.speed > 0
        ? calculateETA(storm.distance, rawMovement.speed)
        : null;

    const impact: 'high' | 'medium' | 'low' =
      approaching && rawMovement.speed > 5 && angleDiff <= 15 ? 'high'
      : inCone && approaching ? 'medium'
      : inCone ? 'medium'
      : 'low';

    return {
      ...storm,
      inCone,
      angleDiff,
      movement: {
        direction: rawMovement.direction,
        speed: rawMovement.speed,
        impact,
        eta: etaMinutes !== null && etaMinutes < 999 ? formatEta(etaMinutes) : undefined,
        etaMinutes: etaMinutes !== null && etaMinutes < 999 ? etaMinutes : undefined,
      }
    };
  });

  const immediateThreats = stormsWithMovement.filter(storm => {
    if (storm.intensity <= 45) return false;
    const mov = storm.movement;
    if (mov?.etaMinutes != null && mov.etaMinutes <= 45) return true;
    if ((storm as any).inCone && mov?.etaMinutes != null && mov.etaMinutes <= 45) return true;
    return false;
  });

  const approachingButNotImminent = stormsWithMovement.filter(storm => {
    if (storm.intensity <= 45) return false;
    const mov = storm.movement;
    const inCone = (storm as any).inCone;
    if (!mov || mov.etaMinutes == null) return false;
    if (inCone && mov.etaMinutes > 45) return true;
    if (!inCone && mov.etaMinutes > 45) return false;
    return false;
  });

  // Remove duplicate storms (within 0.01 degree proximity)
  const deduped = immediateThreats.filter((storm, index, arr) =>
    arr.findIndex(s => Math.abs(s.lat - storm.lat) < 0.01 && Math.abs(s.lon - storm.lon) < 0.01) === index
  );

  // Sort by nearest ETA first
  const uniqueThreats = [...deduped].sort((a, b) =>
    (a.movement?.etaMinutes ?? Infinity) - (b.movement?.etaMinutes ?? Infinity)
  );

  const dangerousAlertTypes = [
    'tornado', 'severe thunderstorm', 'hurricane', 'typhoon', 'tropical storm',
    'flash flood', 'tsunami', 'storm surge', 'extreme wind', 'blizzard',
    'ice storm', 'dust storm', 'fire weather', 'red flag',
    'severe weather', 'special weather'
  ];

  const filteredNwsAlerts = displayAlerts.filter((alert: NWSAlert) => {
    const type = (alert.type || '').toLowerCase();
    const severity = (alert.severity || '').toLowerCase();
    const urgency = (alert.urgency || '').toLowerCase();

    const isWarningOrWatch = type.includes('warning') || type.includes('watch');
    const isSevereLevel = severity === 'extreme' || severity === 'severe';
    const isUrgent = urgency === 'immediate' || urgency === 'expected';
    const isDangerousType = dangerousAlertTypes.some(dt => type.includes(dt));

    return (isWarningOrWatch && (isSevereLevel || isDangerousType)) ||
           (isSevereLevel && isUrgent) ||
           isDangerousType;
  });

  // Sort NWS alerts by effective date and headline content
  const sortedNwsAlerts = [...filteredNwsAlerts].sort((a, b) => {
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

  const totalAlerts = filteredNwsAlerts.length + uniqueThreats.length;

  const alertsUserIsInside = location
    ? displayAlerts.filter((alert: NWSAlert) => isLocationInAlertZone(location.lat, location.lon, alert))
    : [];

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

  if (!location) {
    return (
      <div className="bg-red-900/30 rounded-xl p-3 sm:p-4 border border-red-600/30 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Loader2 className="h-5 w-5 text-red-400 animate-spin" />
          <h3 className="text-lg font-semibold text-red-200">Immediate Safety Alerts</h3>
          <span className="bg-slate-600/50 text-slate-400 px-2 py-1 rounded-full text-xs">Locating…</span>
        </div>
        <SkeletonLoader />
      </div>
    );
  }

  return (
    <div className="bg-red-900/30 rounded-xl p-3 sm:p-4 border border-red-600/30 mb-4 sm:mb-6 select-none">
      <div className="flex items-center justify-between mb-3 select-none">
        <div className="flex items-center gap-2 select-none">
          {alertsLoading ? (
            <Loader2 className="h-5 w-5 text-red-400 animate-spin select-none" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-400 select-none" />
          )}
          <h3 className="text-lg font-semibold text-red-200 select-none">
            Immediate Safety Alerts
          </h3>
          {!alertsLoading && totalAlerts > 0 && (
            <span className="bg-red-600 text-white px-2 py-1 rounded-full text-xs font-bold">
              {totalAlerts}
            </span>
          )}
          {alertsLoading && (
            <span className="bg-slate-600/50 text-slate-400 px-2 py-1 rounded-full text-xs">
              Loading...
            </span>
          )}
        </div>
        
        {/* Sort button for NWS alerts */}
        {!alertsLoading && filteredNwsAlerts.length > 1 && (
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

      {!alertsLoading && alertsUserIsInside.length > 0 && (
        <div className="bg-red-700/30 border border-red-500/60 rounded-lg p-2 mb-3 flex items-center gap-2 animate-pulse">
          <span className="text-lg">🔴</span>
          <span className="text-sm font-semibold text-red-200">
            Your location is inside {alertsUserIsInside.length} active alert zone{alertsUserIsInside.length > 1 ? 's' : ''}: {alertsUserIsInside.map((a: NWSAlert) => a.type).join(', ')}
          </span>
        </div>
      )}

      {alertsLoading ? (
        <SkeletonLoader />
      ) : totalAlerts === 0 ? (
        <div className="text-center py-2 animate-fadeIn">
          {approachingButNotImminent.length > 0 ? (
            <>
              <p className="text-yellow-400/80 text-sm">
                {approachingButNotImminent.length} strong storm{approachingButNotImminent.length > 1 ? 's' : ''} ({'>'}45 dBZ) in your cone but ETA {'>'} 45 min
              </p>
              {(() => {
                const nearest = [...approachingButNotImminent].sort(
                  (a, b) => (a.movement?.etaMinutes ?? Infinity) - (b.movement?.etaMinutes ?? Infinity)
                )[0];
                return nearest?.movement?.etaMinutes != null ? (
                  <div className="flex items-center justify-center gap-1.5 mt-1.5 text-sm">
                    <span className="text-slate-500">⏱</span>
                    <CountdownTimer etaMinutes={nearest.movement.etaMinutes} label="Nearest" />
                  </div>
                ) : null;
              })()}
            </>
          ) : (
            <p className="text-slate-300 text-sm">No immediate weather threats detected</p>
          )}
          <p className="text-slate-500 text-[10px] mt-1">
            Alerts: storms {'>'}45 dBZ in 30° cone with ETA {'<'}45 min, or severe NWS warnings/watches
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* NWS Alerts */}
          {sortedNwsAlerts.map((alert: NWSAlert, index: number) => {
            const userInZone = location && alert.geometry
              ? isLocationInAlertZone(location.lat, location.lon, alert)
              : false;
            return (
            <div 
              key={`nws-${index}`} 
              className={`bg-red-900/40 rounded-lg p-3 border animate-slideInUp ${userInZone ? 'border-red-500 ring-1 ring-red-500/50' : 'border-red-600/30'}`}
              style={{
                animationDelay: `${index * 150}ms`,
                animationFillMode: 'both'
              }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-lg">🚨</div>
                <div className={`w-3 h-3 rounded-full ${getSeverityColor(alert.severity || '')}`}></div>
                <span className="font-semibold text-red-200">{translateWeatherText(alert.type, language)}</span>
                {userInZone && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse">
                    YOU ARE IN THIS ZONE
                  </span>
                )}
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
            );
          })}

          {/* Collision Course / Severe Proximity Storms */}
          {uniqueThreats.map((storm, index) => (
            <div 
              key={`storm-${index}`} 
              className={`bg-orange-900/40 rounded-lg p-3 border border-orange-600/30 animate-slideInUp ${
                storm.intensity >= 63 ? 'extreme-rain-ring' : 
                storm.intensity >= 58 ? 'severe-rain-ring' : 
                storm.intensity >= 49 ? 'heavy-rain-ring' : ''
              }`}
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
                {/* Location + movement line */}
                <div className="flex items-start gap-1 flex-wrap leading-snug">
                  <span>Storm is {storm.distance.toFixed(1)} mi ({getDirectionName(storm.direction)}) of you</span>
                  {storm.movement && storm.movement.direction !== undefined && storm.movement.speed !== undefined && (
                    <span className="text-orange-300">
                      · heading {getDirectionName(storm.movement.direction)} ({storm.movement.direction.toFixed(0)}°) @ {storm.movement.speed.toFixed(1)} mph
                    </span>
                  )}
                </div>
                <div>Intensity: {storm.intensity} dBZ</div>

                {/* ETA + threat classification box */}
                {storm.movement && (
                  <div className="mt-2 p-2 bg-orange-950/50 rounded text-xs space-y-1">
                    {storm.movement.etaMinutes != null && (
                      <div className="flex items-center gap-1.5">
                        <span>⏱</span>
                        <CountdownTimer etaMinutes={storm.movement.etaMinutes} />
                      </div>
                    )}
                    {storm.movement.impact === 'high' ? (
                      <div className="text-red-300">
                        <strong>🎯 COLLISION COURSE:</strong> Storm on direct track — you are in the 30° cone
                      </div>
                    ) : storm.movement.impact === 'medium' ? (
                      <div className="text-orange-300">
                        <strong>⚠️ IN YOUR CONE:</strong> Storm approaching within 30° of your location
                      </div>
                    ) : (
                      <div className="text-orange-300">
                        <strong>⚠️ SEVERE PROXIMITY:</strong> High-intensity storm nearby
                      </div>
                    )}
                    <div className="text-orange-200">
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