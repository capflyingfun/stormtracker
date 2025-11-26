import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, MapPin, TrendingUp, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";

interface ImpactPrediction {
  stormId: string;
  category: string;
  categoryKey: string;
  directionFromUser: string;
  distance: number;
  etaMinutes: number;
  etaFormatted: string;
  intensityNow: number;
  intensityAtArrival: number;
  durationMinutes: number;
  approachProbability: number;
  isApproaching: boolean;
  impactScore: number;
  threatTier: 'low' | 'moderate' | 'high' | 'severe' | 'extreme';
  recommendedAction: string;
}

interface ImpactSummary {
  threatLevel: string;
  primaryThreat: ImpactPrediction;
  totalThreats: number;
  overallMessage: string;
  urgentAction: string;
}

interface ImpactPanelProps {
  storms: any[];
  userLocation: { lat: number; lon: number } | null;
  locationName?: string;
}

const threatColors: Record<string, string> = {
  low: '#22C55E',
  moderate: '#EAB308',
  high: '#F97316',
  severe: '#EF4444',
  extreme: '#8B5CF6'
};

const threatBgColors: Record<string, string> = {
  low: 'bg-green-500/20 border-green-500/50',
  moderate: 'bg-yellow-500/20 border-yellow-500/50',
  high: 'bg-orange-500/20 border-orange-500/50',
  severe: 'bg-red-500/20 border-red-500/50',
  extreme: 'bg-purple-500/20 border-purple-500/50'
};

function CountdownTimer({ etaMinutes }: { etaMinutes: number }) {
  const [remaining, setRemaining] = useState(etaMinutes);
  
  useEffect(() => {
    setRemaining(etaMinutes);
    const interval = setInterval(() => {
      setRemaining(prev => Math.max(0, prev - 1/60)); // Decrease by 1 second
    }, 1000);
    return () => clearInterval(interval);
  }, [etaMinutes]);
  
  if (remaining >= 999) return <span className="text-slate-400">N/A</span>;
  
  const hours = Math.floor(remaining / 60);
  const mins = Math.floor(remaining % 60);
  const secs = Math.floor((remaining * 60) % 60);
  
  return (
    <span className="font-mono font-bold">
      {hours > 0 && `${hours}:`}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

export default function ImpactPanel({ storms, userLocation, locationName }: ImpactPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Create a stable storm signature for cache key
  const stormSignature = storms?.map(s => 
    `${(s.lat || 0).toFixed(2)}-${(s.lon || 0).toFixed(2)}-${s.dbz || s.intensity || 0}`
  ).sort().join('|') || '';
  
  const { data: impactData, isLoading } = useQuery({
    queryKey: ['/api/impact-predictions', stormSignature, userLocation?.lat, userLocation?.lon],
    queryFn: async () => {
      if (!storms || storms.length === 0 || !userLocation) {
        return { predictions: [], summary: null };
      }
      
      const response = await fetch('/api/impact-predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storms, userLocation, locationName })
      });
      
      if (!response.ok) throw new Error('Failed to fetch impact predictions');
      return response.json();
    },
    enabled: !!storms && storms.length > 0 && !!userLocation,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000
  });
  
  const predictions: ImpactPrediction[] = impactData?.predictions || [];
  const summary: ImpactSummary | null = impactData?.summary || null;
  
  // Filter to show only meaningful impacts
  const significantPredictions = predictions.filter(p => p.impactScore > 10);
  
  if (!userLocation || storms.length === 0) {
    return null;
  }
  
  if (significantPredictions.length === 0 && !isLoading) {
    return (
      <div 
        className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 border border-green-500/50"
        data-testid="impact-panel-clear"
      >
        <div className="flex items-center gap-2 text-green-400">
          <Shield className="w-4 h-4" />
          <span className="text-sm font-medium">No significant storm impacts predicted</span>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-600 overflow-hidden"
      data-testid="impact-panel"
    >
      {/* Header with summary */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
        data-testid="impact-panel-toggle"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle 
            className="w-5 h-5" 
            style={{ color: summary ? threatColors[summary.threatLevel] : '#22C55E' }}
          />
          <div className="text-left">
            <div className="text-sm font-semibold text-white">
              Storm Impact Predictions
            </div>
            {summary && (
              <div className="text-xs text-slate-400">
                {summary.overallMessage}
              </div>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {isLoading ? (
            <div className="text-center py-4 text-slate-400 text-sm">
              Calculating impact predictions...
            </div>
          ) : (
            <>
              {/* Primary threat card */}
              {summary?.primaryThreat && (
                <div 
                  className={`rounded-lg p-3 border ${threatBgColors[summary.primaryThreat.threatTier]}`}
                  data-testid="primary-threat-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span 
                      className="text-xs font-bold uppercase px-2 py-0.5 rounded"
                      style={{ 
                        backgroundColor: threatColors[summary.primaryThreat.threatTier] + '30',
                        color: threatColors[summary.primaryThreat.threatTier]
                      }}
                    >
                      {summary.primaryThreat.threatTier} Impact
                    </span>
                    <span className="text-xs text-slate-400">
                      Score: {summary.primaryThreat.impactScore}
                    </span>
                  </div>
                  
                  <div className="text-white font-medium mb-2">
                    {summary.primaryThreat.category}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="flex items-center gap-1 text-slate-300">
                      <MapPin className="w-3 h-3" />
                      <span>{summary.primaryThreat.directionFromUser} • {summary.primaryThreat.distance}mi</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3 h-3" />
                      <span>ETA: <CountdownTimer etaMinutes={summary.primaryThreat.etaMinutes} /></span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <TrendingUp className="w-3 h-3" />
                      <span>{summary.primaryThreat.approachProbability}% approach</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3 h-3" />
                      <span>~{summary.primaryThreat.durationMinutes}min duration</span>
                    </div>
                  </div>
                  
                  <div 
                    className="text-sm font-medium py-1.5 px-2 rounded text-center"
                    style={{ 
                      backgroundColor: threatColors[summary.primaryThreat.threatTier] + '20',
                      color: threatColors[summary.primaryThreat.threatTier]
                    }}
                    data-testid="recommended-action"
                  >
                    {summary.primaryThreat.recommendedAction}
                  </div>
                </div>
              )}
              
              {/* Additional threats */}
              {significantPredictions.slice(1, 3).map((prediction, idx) => (
                <div 
                  key={prediction.stormId}
                  className="bg-slate-700/50 rounded-lg p-2 border border-slate-600"
                  data-testid={`secondary-threat-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: threatColors[prediction.threatTier] }}
                      />
                      <span className="text-sm text-white">{prediction.category}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {prediction.directionFromUser} • {prediction.distance}mi
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">
                      ETA: {prediction.etaFormatted}
                    </span>
                    <span 
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ 
                        backgroundColor: threatColors[prediction.threatTier] + '20',
                        color: threatColors[prediction.threatTier]
                      }}
                    >
                      {prediction.threatTier}
                    </span>
                  </div>
                </div>
              ))}
              
              {/* Location context */}
              <div className="text-xs text-slate-500 text-center pt-1">
                Predictions for {locationName || 'your location'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
