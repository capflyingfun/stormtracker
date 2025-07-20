import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Navigation, Clock } from "lucide-react";

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
  const [showAlerts, setShowAlerts] = useState(false);

  // Delay showing alerts for 3 seconds to allow storm calculations to complete
  useEffect(() => {
    if (location && storms.length >= 0) {
      const timer = setTimeout(() => {
        setShowAlerts(true);
      }, 3000); // 3 second delay
      
      return () => clearTimeout(timer);
    }
  }, [location, storms.length]);

  // Get NWS alerts after delay
  const { data: nwsAlerts = [] } = useQuery({
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
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  // Identify immediate storm threats (high impact or severe proximity)
  const immediateThreats = storms.filter(storm => {
    // High impact storms on collision course
    if (storm.movement?.impact === 'high' && storm.movement?.eta) {
      return true;
    }
    
    // Severe storms within 20 miles
    if (storm.intensity >= 55 && storm.distance <= 20) {
      return true;
    }
    
    return false;
  });

  // Remove duplicate storms (within 0.01 degree proximity)
  const uniqueThreats = immediateThreats.filter((storm, index, arr) => 
    arr.findIndex(s => Math.abs(s.lat - storm.lat) < 0.01 && Math.abs(s.lon - storm.lon) < 0.01) === index
  );

  const totalAlerts = nwsAlerts.length + uniqueThreats.length;

  if (!location || !showAlerts) return null;

  return (
    <div className="bg-red-900/30 rounded-xl p-3 sm:p-4 border border-red-600/30 mb-4 sm:mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <h3 className="text-lg font-semibold text-red-200">
          Immediate Safety Alerts
        </h3>
        {totalAlerts > 0 && (
          <span className="bg-red-600 text-white px-2 py-1 rounded-full text-xs font-bold">
            {totalAlerts}
          </span>
        )}
      </div>

      {totalAlerts === 0 ? (
        <div className="text-center py-2">
          <p className="text-slate-300 text-sm">No immediate weather threats detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* NWS Alerts */}
          {nwsAlerts.map((alert: NWSAlert, index: number) => (
            <div key={`nws-${index}`} className="bg-red-900/40 rounded-lg p-3 border border-red-600/30">
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
                    // Try to extract time from headline for more accurate display
                    const headlineMatch = alert.headline.match(/until .*?(\d{1,2}:\d{2}[AP]M\s+CDT)/i);
                    if (headlineMatch) {
                      return `Today at ${headlineMatch[1]}`;
                    }
                    // Fallback to API timestamp
                    return new Date(alert.expires).toLocaleString('en-US', {
                      timeZone: 'America/Chicago',
                      month: 'numeric',
                      day: 'numeric', 
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short'
                    });
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
            <div key={`storm-${index}`} className="bg-orange-900/40 rounded-lg p-3 border border-orange-600/30">
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
                <div className="flex items-center gap-2">
                  <Navigation className="h-3 w-3" />
                  <span>
                    {getDirectionName(storm.direction)} ({storm.direction.toFixed(0)}°) at {storm.distance.toFixed(1)} miles
                  </span>
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