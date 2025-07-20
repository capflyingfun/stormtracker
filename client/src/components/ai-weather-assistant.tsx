import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Brain, AlertTriangle, CheckCircle, Clock, MapPin, Wind, Plane, RefreshCw } from "lucide-react";

interface StormData {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: string;
  bearing: number;
  category: string;
  movement?: {
    direction: number;
    speed: number;
    eta?: string;
    impact?: string;
  };
}

interface WindData {
  speed: number;
  direction: number;
  pressure_level: string;
}

interface WeatherAssessment {
  riskLevel: 'low' | 'moderate' | 'high' | 'extreme';
  summary: string;
  detailedAnalysis: string;
  recommendations: string[];
  timeToImpact?: string;
  confidence: number;
}

interface AIWeatherAssistantProps {
  userLocation: {
    lat: number;
    lon: number;
    address: string;
  };
  storms: StormData[];
  winds: WindData[];
  radarSource: string;
  lightningCount?: number;
  useMetric?: boolean;
}

export default function AIWeatherAssistant({
  userLocation,
  storms,
  winds,
  radarSource,
  lightningCount = 0,
  useMetric = false
}: AIWeatherAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isDataReady, setIsDataReady] = useState(false);
  const [loadingTimer, setLoadingTimer] = useState(5); // 5-second countdown

  // Fetch aviation weather data
  const { data: aviationData } = useQuery({
    queryKey: ['/api/aviation-weather', userLocation.lat, userLocation.lon],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/aviation-weather?lat=${userLocation.lat}&lon=${userLocation.lon}`);
      return response.json();
    },
    enabled: !!(userLocation.lat && userLocation.lon),
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  // Threat detection query for monitoring
  const { data: threatData, refetch: refetchThreats } = useQuery({
    queryKey: ['/api/threat-detection', userLocation.lat, userLocation.lon],
    queryFn: async () => {
      const response = await fetch('/api/threat-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: userLocation.lat,
          lon: userLocation.lon,
          address: userLocation.address,
          storms,
          lightningCount
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to perform threat detection');
      }
      
      return response.json();
    },
    enabled: false, // Only run when manually triggered
  });

  // AI Assessment mutation
  const assessmentMutation = useMutation({
    mutationFn: async () => {
      // First get latest threat data
      const currentThreatData = await refetchThreats();
      
      // Optimize payload by sending only essential storm data
      const optimizedStorms = storms.slice(0, 200).map(storm => ({
        lat: storm.lat,
        lon: storm.lon,
        intensity: storm.intensity,
        distance: storm.distance,
        direction: storm.direction,
        type: storm.type,
        movement: storm.movement ? {
          direction: storm.movement.direction,
          speed: storm.movement.speed,
          eta: storm.movement.eta,
          impact: storm.movement.impact
        } : null
      }));
      
      const response = await apiRequest("POST", "/api/ai-assessment", {
        userLocation,
        storms: optimizedStorms,
        stormCount: storms.length,
        winds,
        radarSource,
        includeAlerts: true, // Enhanced to include alert analysis
        lightningCount,
        useMetric,
        threatData: currentThreatData.data // Pass fresh threat data to prevent duplicate NWS alert fetching
      });
      return response.json();
    },
  });

  // Start/Stop monitoring functionality
  const handleStartMonitoring = () => {
    setIsMonitoring(true);
    setLastCheck(new Date());
    refetchThreats();
  };

  const handleStopMonitoring = () => {
    setIsMonitoring(false);
  };

  const handleManualCheck = () => {
    setLastCheck(new Date());
    refetchThreats();
  };

  // Auto-monitor every 10 minutes when monitoring is active
  useEffect(() => {
    if (!isMonitoring) return;
    
    const interval = setInterval(() => {
      setLastCheck(new Date());
      refetchThreats();
    }, 10 * 60 * 1000); // 10 minutes
    
    return () => clearInterval(interval);
  }, [isMonitoring, refetchThreats]);

  // Loading timer and data readiness logic
  useEffect(() => {
    // Reset timer when location changes
    setIsDataReady(false);
    setLoadingTimer(5);
    
    // Start countdown timer
    const timer = setInterval(() => {
      setLoadingTimer(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsDataReady(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [userLocation.lat, userLocation.lon]);

  // Check if storms have loaded and enable early if ready
  useEffect(() => {
    if (storms && storms.length >= 0 && winds && winds.length >= 0 && aviationData) {
      // Data is ready - enable early if timer is under 2 seconds
      if (loadingTimer <= 2) {
        setIsDataReady(true);
        setLoadingTimer(0);
      }
    }
  }, [storms, winds, aviationData, loadingTimer]);

  const assessment = assessmentMutation.data as WeatherAssessment | undefined;

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'extreme': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'moderate': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'extreme': 
      case 'high': return <AlertTriangle className="w-4 h-4" />;
      case 'moderate': return <Clock className="w-4 h-4" />;
      case 'low': return <CheckCircle className="w-4 h-4" />;
      default: return <Brain className="w-4 h-4" />;
    }
  };

  return (
    <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600">
      <CardHeader>
        <CardTitle className="text-white">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-400" />
              AI Weather Assistant
              {isMonitoring && (
                <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                  Monitoring
                </Badge>
              )}
            </div>
            {assessment && (
              <Badge className={`w-fit ${getRiskColor(assessment.riskLevel)}`}>
                {getRiskIcon(assessment.riskLevel)}
                {assessment.riskLevel.toUpperCase()} RISK
              </Badge>
            )}
          </div>
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-md">
            <Brain className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-300">Dynamic Tone Active</span>
          </div>
          <Button
            onClick={() => {
              assessmentMutation.mutate();
              handleManualCheck();
            }}
            disabled={assessmentMutation.isPending || !userLocation || !isDataReady}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:flex-1"
          >
            {assessmentMutation.isPending 
              ? 'Analyzing...' 
              : !isDataReady 
                ? `Loading data... (${loadingTimer}s)`
                : 'Analyze Weather & Alerts'
            }
          </Button>
          {isMonitoring ? (
            <Button
              onClick={handleStopMonitoring}
              size="sm"
              variant="destructive"
              className="w-full sm:flex-1"
            >
              Stop Monitoring
            </Button>
          ) : (
            <Button
              onClick={handleStartMonitoring}
              disabled={!userLocation}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white w-full sm:flex-1"
            >
              Start Monitoring
            </Button>
          )}
        </div>
        {lastCheck && (
          <p className="text-xs text-slate-400 mt-1">
            Last check: {lastCheck.toLocaleTimeString()}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Threat Detection Status */}
        {threatData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b border-slate-600 pb-4">
            <div className="text-center">
              <div className="font-semibold text-lg text-white">{threatData.threatCount}</div>
              <div className="text-slate-400">Active Threats</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-lg text-white">{threatData.alertsGenerated}</div>
              <div className="text-slate-400">Alerts Sent</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-lg text-white">{threatData.weatherConditions.temperature.toFixed(1)}°F</div>
              <div className="text-slate-400">Temperature</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-lg">
                {threatData.dataQuality.openweather_available ? '✅' : '⚠️'}
              </div>
              <div className="text-slate-400">Data Status</div>
            </div>
          </div>
        )}

        {!assessment && !assessmentMutation.isPending && !threatData && (
          <div className="text-center">
            {!isDataReady ? (
              <div className="py-4">
                <Clock className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-400" />
                <p className="text-slate-300 mb-2">
                  Loading storm data and weather information...
                </p>
                <p className="text-slate-400 text-sm">
                  {loadingTimer > 0 ? `Ready in ${loadingTimer} seconds` : 'Almost ready...'}
                </p>
              </div>
            ) : (
              <p className="text-slate-300 mb-4">
                Get comprehensive AI analysis of weather risks, storm threats, and active alerts/advisories
              </p>
            )}
          </div>
        )}

        {assessmentMutation.isPending && (
          <div className="text-center py-6">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
            <p className="text-sm text-slate-300">
              AI is analyzing {Math.min(storms.length, 200)} closest storms{storms.length > 200 ? ` (of ${storms.length} total)` : ''}, wind patterns, and your location...
            </p>
          </div>
        )}

        {assessment && (
          <div className="space-y-4">
            {/* Risk Summary */}
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2 text-white">
                {getRiskIcon(assessment.riskLevel)}
                Risk Assessment
              </h4>
              <p className="text-sm text-slate-200">{assessment.summary}</p>
              {assessment.timeToImpact && (
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-slate-200">Impact timing: {assessment.timeToImpact}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Data Context */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">{storms.length} storms tracked</span>
              </div>
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">{winds.length} wind levels</span>
              </div>
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">{aviationData?.stations?.length || 0} weather stations</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-slate-700 text-slate-200 px-2 py-1 rounded">
                  {radarSource} radar
                </span>
              </div>
            </div>

            {isExpanded && (
              <>
                <Separator />
                
                {/* Detailed Analysis */}
                <div>
                  <h4 className="font-semibold mb-2 text-white">Detailed Analysis</h4>
                  <p className="text-sm whitespace-pre-line text-slate-200">{assessment.detailedAnalysis}</p>
                </div>

                <Separator className="bg-slate-600" />

                {/* Recommendations */}
                <div>
                  <h4 className="font-semibold mb-2 text-white">Safety Recommendations</h4>
                  <ul className="space-y-1">
                    {assessment.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm flex items-start gap-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span className="text-slate-200">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Separator className="bg-slate-600" />

                {/* Confidence & Refresh */}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Confidence: {Math.round(assessment.confidence * 100)}%
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => assessmentMutation.mutate()}
                    disabled={assessmentMutation.isPending}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </>
            )}

            {/* Toggle Details */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-slate-200 hover:bg-slate-700"
            >
              {isExpanded ? 'Show Less' : 'Show Detailed Analysis'}
            </Button>
          </div>
        )}

        {assessmentMutation.isError && (
          <div className="text-center py-4">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
            <p className="text-sm text-red-400">
              Unable to generate AI assessment. Please try again.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => assessmentMutation.mutate()}
              className="mt-2 border-slate-600 text-slate-200 hover:bg-slate-700"
            >
              Retry Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}