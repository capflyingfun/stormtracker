import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, MapPin, TrendingUp, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { useAutoTranslate } from "@/hooks/use-auto-translate";

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
  minimumDbz?: number;
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
      setRemaining(prev => Math.max(0, prev - 1/60));
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

export default function ImpactPanel({ storms, userLocation, locationName, minimumDbz = 50 }: ImpactPanelProps) {
  const { at } = useAutoTranslate();
  const [isExpanded, setIsExpanded] = useState(true);
  
  const stormSignature = storms?.map(s => 
    `${(s.lat || 0).toFixed(2)}-${(s.lon || 0).toFixed(2)}-${s.dbz || s.intensity || 0}`
  ).sort().join('|') || '';
  
  const { data: impactData, isLoading } = useQuery({
    queryKey: ['/api/impact-predictions', stormSignature, userLocation?.lat, userLocation?.lon],
    queryFn: async () => {
      if (!storms || storms.length === 0 || !userLocation) {
        return { predictions: [], approaching: [], summary: null };
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
    refetchInterval: 30000,
    staleTime: 15000
  });
  
  const primaryThreat: ImpactPrediction | null = impactData?.predictions?.[0] || null;
  const approachingLater: ImpactPrediction[] = impactData?.approaching || [];
  const summary: ImpactSummary | null = impactData?.summary || null;
  
  const threatMeetsThreshold = primaryThreat && primaryThreat.intensityNow >= minimumDbz;
  const approachingMeetsThreshold = approachingLater.filter(p => p.intensityNow >= minimumDbz);

  if (!userLocation || storms.length === 0) {
    return null;
  }
  
  if (!threatMeetsThreshold && approachingMeetsThreshold.length === 0 && !isLoading) {
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
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
        data-testid="impact-panel-toggle"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle 
            className="w-5 h-5" 
            style={{ color: threatMeetsThreshold && summary ? threatColors[summary.threatLevel] : approachingMeetsThreshold.length > 0 ? '#EAB308' : '#22C55E' }}
          />
          <div className="text-left">
            <div className="text-sm font-semibold text-white">
              Storm Impact Predictions
            </div>
            {threatMeetsThreshold && summary ? (
              <div className="text-xs text-slate-400">
                {summary.overallMessage}
              </div>
            ) : approachingMeetsThreshold.length > 0 ? (
              <div className="text-xs text-yellow-400/80">
                {approachingMeetsThreshold.length} storm{approachingMeetsThreshold.length > 1 ? 's' : ''} approaching (ETA {'>'} 45 min)
              </div>
            ) : null}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {isLoading ? (
            <div className="text-center py-4 text-slate-400 text-sm">
              Calculating impact predictions...
            </div>
          ) : (
            <>
              {threatMeetsThreshold && primaryThreat && (
                <div 
                  className={`rounded-lg p-3 border ${threatBgColors[primaryThreat.threatTier]}`}
                  data-testid="primary-threat-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span 
                      className="text-xs font-bold uppercase px-2 py-0.5 rounded"
                      style={{ 
                        backgroundColor: threatColors[primaryThreat.threatTier] + '30',
                        color: threatColors[primaryThreat.threatTier]
                      }}
                    >
                      {primaryThreat.threatTier} Impact
                    </span>
                    <span className="text-xs text-slate-400">
                      Score: {primaryThreat.impactScore}
                    </span>
                  </div>
                  
                  <div className="text-white font-medium mb-2">
                    {primaryThreat.category}
                    <span className="text-sm font-normal text-slate-300 ml-2">
                      {primaryThreat.intensityNow} dBZ
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="flex items-center gap-1 text-slate-300">
                      <MapPin className="w-3 h-3" />
                      <span>{primaryThreat.directionFromUser} • {primaryThreat.distance}mi</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3 h-3" />
                      <span>ETA: <CountdownTimer etaMinutes={primaryThreat.etaMinutes} /></span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <TrendingUp className="w-3 h-3" />
                      <span>{primaryThreat.approachProbability}% approach</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3 h-3" />
                      <span>~{primaryThreat.durationMinutes}min duration</span>
                    </div>
                  </div>
                  
                  <div 
                    className="text-sm font-medium py-1.5 px-2 rounded text-center"
                    style={{ 
                      backgroundColor: threatColors[primaryThreat.threatTier] + '20',
                      color: threatColors[primaryThreat.threatTier]
                    }}
                    data-testid="recommended-action"
                  >
                    {primaryThreat.recommendedAction}
                  </div>
                </div>
              )}

              {approachingMeetsThreshold.length > 0 && (
                <div className="space-y-1.5">
                  {!threatMeetsThreshold && (
                    <div className="text-xs text-yellow-400/80 font-medium px-1">
                      Approaching storms (ETA {'>'} 45 min):
                    </div>
                  )}
                  {approachingMeetsThreshold.slice(0, 2).map((storm) => (
                    <div 
                      key={storm.stormId}
                      className="bg-slate-700/50 rounded-lg p-2 border border-slate-600"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: threatColors[storm.threatTier] }}
                          />
                          <span className="text-sm text-white">{storm.category}</span>
                          <span className="text-xs text-slate-400">{storm.intensityNow} dBZ</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {storm.directionFromUser} • {storm.distance}mi
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-slate-400">
                          ETA: {storm.etaFormatted}
                        </span>
                        <span 
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ 
                            backgroundColor: threatColors[storm.threatTier] + '20',
                            color: threatColors[storm.threatTier]
                          }}
                        >
                          {storm.threatTier}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
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
