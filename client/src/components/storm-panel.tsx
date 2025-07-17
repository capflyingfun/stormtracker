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
}

const getDirectionName = (degrees: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

const getStormIntensityName = (intensity: number): string => {
  if (intensity >= 65) return 'Extreme Storm';
  if (intensity >= 55) return 'Severe Storm';
  if (intensity >= 45) return 'Heavy Storm';
  if (intensity >= 35) return 'Moderate Storm';
  if (intensity >= 20) return 'Light Storm';
  return 'Weak Storm';
};

const getStormColor = (intensity: number): string => {
  if (intensity >= 65) return 'bg-purple-500';
  if (intensity >= 55) return 'bg-red-500';
  if (intensity >= 45) return 'bg-orange-500';
  if (intensity >= 35) return 'bg-yellow-500';
  if (intensity >= 20) return 'bg-green-500';
  return 'bg-blue-500';
};

export default function StormPanel({ storms, formatDistance, formatSpeed, isLoading }: StormPanelProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">⚡</div>
        <h2 className="text-xl font-semibold">Storm Cells ({storms.length})</h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
      </div>
      
      <div className="space-y-3">
        {storms.length === 0 ? (
          <p className="text-slate-400 text-center py-8">
            {isLoading ? 'Detecting storms...' : 'No storms detected in your area'}
          </p>
        ) : (
          storms.map((storm) => (
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
              
              {/* Enhanced storm description with directional info */}
              <p className="text-sm text-slate-300 mb-2">
                {getStormIntensityName(storm.intensity)} ({storm.intensity.toFixed(0)}dBZ) {getDirectionName(storm.direction)} of you with {storm.type.toLowerCase()} {formatDistance(storm.distance)} away {storm.speed > 0 ? `moving ${getDirectionName((storm as any).movementDirection || storm.direction)} at ${formatSpeed(storm.speed)}` : '(stationary)'}
              </p>
              

              
              {storm.description && (
                <p className="text-xs text-slate-400 mt-2">{storm.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
