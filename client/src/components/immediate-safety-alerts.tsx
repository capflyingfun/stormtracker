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
  properties: {
    event?: string;
    severity?: string;
    headline?: string;
    description?: string;
    expires?: string;
    areaDesc?: string;
  };
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

  // Filter for collision course storms (high impact or ETA present)
  const collisionStorms = storms.filter(storm => 
    storm.movement?.impact === 'high' || storm.movement?.eta
  );

  // Filter for severe storms within 20 miles
  const severeNearbyStorms = storms.filter(storm => 
    storm.intensity >= 55 && storm.distance <= 20
  );

  // Combine all immediate threats
  const immediateThreats = [...collisionStorms, ...severeNearbyStorms];
  
  // Remove duplicates based on coordinates
  const uniqueThreats = immediateThreats.filter((storm, index, arr) => 
    arr.findIndex(s => Math.abs(s.lat - storm.lat) < 0.01 && Math.abs(s.lon - storm.lon) < 0.01) === index
  );

  const totalAlerts = nwsAlerts.length + uniqueThreats.length;

  if (!location || !showAlerts) return null;

  return (
    <div className="bg-red-950/30 border border-red-700/50 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <h3 className="text-lg font-semibold text-red-300">
          Immediate Safety Alerts ({totalAlerts})
        </h3>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-red-400" />}
      </div>

      {totalAlerts === 0 ? (
        <div className="text-center py-4">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-slate-300 text-sm">No immediate weather threats detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* NWS Alerts */}
          {nwsAlerts.map((alert: NWSAlert, index: number) => (
            <div key={`nws-${index}`} className="bg-red-900/40 rounded-lg p-3 border border-red-600/30">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-lg">🚨</div>
                <div className={`w-3 h-3 rounded-full ${getSeverityColor(alert.properties.severity || '')}`}></div>
                <span className="font-semibold text-red-200">{alert.properties.event}</span>
              </div>
              
              <p className="text-sm text-red-100 mb-2">{alert.properties.headline}</p>
              
              {alert.properties.expires && (
                <div className="flex items-center gap-1 text-xs text-red-300">
                  <Clock className="h-3 w-3" />
                  Expires: {new Date(alert.properties.expires).toLocaleString()}
                </div>
              )}
              
              {alert.properties.areaDesc && (
                <p className="text-xs text-red-300 mt-1">Areas: {alert.properties.areaDesc}</p>
              )}
            </div>
          ))}

          {/* Collision Course Storms */}
          {uniqueThreats.map((storm, index) => {
            const category = getIntensityCategory(storm.intensity);
            const direction = getDirectionName(storm.direction);
            
            return (
              <div key={`threat-${index}`} className="bg-orange-900/40 rounded-lg p-3 border border-orange-600/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-lg">⛈️</div>
                    <span className="font-semibold text-orange-200">
                      {category} Storm - Collision Course
                    </span>
                  </div>
                  <span className="text-xs text-orange-300 bg-orange-900/50 px-2 py-1 rounded">
                    {storm.intensity} dBZ
                  </span>
                </div>

                <div className="space-y-1 text-sm text-orange-100">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-3 w-3" />
                    <span>{direction} ({storm.direction.toFixed(0)}°) at {storm.distance.toFixed(1)} miles</span>
                  </div>
                  
                  {storm.movement?.eta && (
                    <div className="flex items-center gap-2 text-orange-200 font-medium">
                      <Clock className="h-3 w-3" />
                      <span>ETA: {storm.movement.eta}</span>
                    </div>
                  )}
                  
                  {storm.movement && (
                    <div className="text-xs text-orange-300">
                      Moving {getDirectionName(storm.movement.direction)} at {storm.movement.speed} mph
                    </div>
                  )}
                </div>

                <div className="mt-2 p-2 bg-orange-950/50 rounded text-xs text-orange-200">
                  <strong>⚠️ Safety Action:</strong> {storm.intensity >= 55 ? 
                    'Seek shelter immediately. This is a severe storm.' : 
                    'Monitor closely and prepare to take shelter.'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}