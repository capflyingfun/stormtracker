import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
}

interface StormPanelProps {
  storms: Storm[];
  useMetric: boolean;
  formatDistance: (miles: number) => string;
  formatSpeed: (mph: number) => string;
  isLoading: boolean;
  radarSource?: 'rainviewer' | 'nexrad';
}

const getDirectionName = (degrees: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

const getStormIntensityName = (intensity: number): string => {
  if (intensity >= 61) return 'Extreme Thunderstorms';
  if (intensity >= 55) return 'Very Heavy Rain/Hail';
  if (intensity >= 46) return 'Heavy Rain';
  if (intensity >= 35) return 'Moderate Rain';
  if (intensity >= 20) return 'Light Rain';
  return 'Weak Storm';
};

const getStormColor = (intensity: number): string => {
  if (intensity >= 61) return 'bg-purple-500';
  if (intensity >= 55) return 'bg-red-500';
  if (intensity >= 46) return 'bg-orange-500';
  if (intensity >= 35) return 'bg-yellow-500';
  if (intensity >= 20) return 'bg-green-500';
  return 'bg-blue-500';
};

const getRainfallRate = (dbz: number) => {
  const z = Math.pow(10, dbz / 10); // Convert dBZ to Z
  const rate = Math.pow(z / 200, 1 / 1.6); // Marshall-Palmer formula
  return Math.max(0.01, rate); // Minimum 0.01 mm/h
};

export default function StormPanel({ storms, formatDistance, formatSpeed, isLoading, radarSource }: StormPanelProps) {
  const [precipitationStorms, setPrecipitationStorms] = useState<Storm[]>([]);

  // Listen for precipitation storm data from the map component
  useEffect(() => {
    const handlePrecipitationStormData = (event: CustomEvent) => {
      const stormCells = event.detail as Storm[];
      setPrecipitationStorms(stormCells);
    };

    window.addEventListener('precipitationStormData', handlePrecipitationStormData as EventListener);
    
    return () => {
      window.removeEventListener('precipitationStormData', handlePrecipitationStormData as EventListener);
    };
  }, []);

  // Combine API storms with precipitation-detected storms, prioritizing precipitation data
  const allStorms = [...precipitationStorms, ...storms];
  
  // Sort storms by distance (closest first)
  const sortedStorms = [...allStorms].sort((a, b) => a.distance - b.distance);
  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">⚡</div>
        <h2 className="text-xl font-semibold">Storm Cells ({sortedStorms.length})</h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
      </div>
      
      <div className="space-y-3">
        {sortedStorms.length === 0 ? (
          <p className="text-slate-400 text-center py-8">
            {isLoading ? 'Detecting storms...' : 'No storms detected in your area'}
          </p>
        ) : (
          sortedStorms.map((storm) => (
            <div 
              key={storm.id} 
              className="bg-slate-700/50 rounded-lg p-4 border border-slate-600/50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStormColor(storm.intensity)} animate-pulse`}></div>
                  <span className="font-semibold">{getStormIntensityName(storm.intensity)}</span>
                </div>
                <span className="text-sm text-slate-300">{storm.intensity.toFixed(0)} dBZ</span>
              </div>
              
              {/* Enhanced storm information */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">Distance:</span>
                  <span className="text-sm text-white">{formatDistance(storm.distance)} {getDirectionName(storm.direction)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">Rain Rate:</span>
                  <span className="text-sm text-white">
                    {getRainfallRate(storm.intensity).toFixed(1)} mm/h ({(getRainfallRate(storm.intensity) * 0.0394).toFixed(2)} in/h)
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">Intensity:</span>
                  <span className="text-sm text-white">{storm.intensity.toFixed(0)} dBZ</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">Coordinates:</span>
                  <span className="text-xs text-slate-400">{storm.lat.toFixed(3)}°, {storm.lon.toFixed(3)}°</span>
                </div>
                
                {storm.speed > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">Movement:</span>
                    <span className="text-sm text-white">{formatSpeed(storm.speed)} @ {storm.direction.toFixed(0)}°</span>
                  </div>
                )}
              </div>
              
              {storm.description && (
                <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-600">{storm.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
