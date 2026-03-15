import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Brain, AlertTriangle, CheckCircle, Clock, MapPin, Wind, Plane, RefreshCw, Send, MessageCircle, ChevronDown, ChevronUp, Target, Navigation } from "lucide-react";

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

interface UserSettings {
  aiTone: 'professional' | 'friendly' | 'humorous';
  detailLevel?: 'minimal' | 'standard' | 'technical';
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
  userSettings?: UserSettings;
  nwsForecast?: any[] | null;
}

const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function getCompassDir(deg: number) { return COMPASS_16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; }

function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function isStormApproaching(storm: StormData, userLat: number, userLon: number): boolean {
  if (!storm.movement || storm.movement.speed <= 3) return false;
  if (storm.movement.impact === 'high' || storm.movement.impact === 'medium' || 
      storm.movement.impact === 'Direct Hit') return true;
  const stormToUser = computeBearing(storm.lat, storm.lon, userLat, userLon);
  let angleDiff = Math.abs(storm.movement.direction - stormToUser);
  if (angleDiff > 180) angleDiff = 360 - angleDiff;
  return angleDiff <= 30;
}

export default function AIWeatherAssistant({
  userLocation,
  storms,
  winds,
  radarSource,
  lightningCount = 0,
  useMetric = false,
  userSettings,
  nwsForecast
}: AIWeatherAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [cardCollapsed, setCardCollapsed] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isDataReady, setIsDataReady] = useState(false);
  const [loadingTimer, setLoadingTimer] = useState(5);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [showChatMode, setShowChatMode] = useState(false);
  const [aiTone, setAiTone] = useState<'professional' | 'friendly' | 'humorous'>(
    userSettings?.aiTone || 'friendly'
  );

  const stormSummary = useMemo(() => {
    if (!storms || storms.length === 0) {
      return { total: 0, approaching: [] as StormData[], closest: null as StormData | null, strongest: null as StormData | null };
    }
    const sorted = [...storms].sort((a, b) => a.distance - b.distance);
    const approaching = sorted.filter(s => isStormApproaching(s, userLocation.lat, userLocation.lon));
    const strongest = [...storms].sort((a, b) => b.intensity - a.intensity)[0];
    return { total: storms.length, approaching, closest: sorted[0], strongest };
  }, [storms, userLocation.lat, userLocation.lon]);

  const { data: aviationData } = useQuery({
    queryKey: ['/api/aviation-weather', userLocation.lat, userLocation.lon],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/aviation-weather?lat=${userLocation.lat}&lon=${userLocation.lon}`);
      return response.json();
    },
    enabled: !!(userLocation.lat && userLocation.lon),
    refetchInterval: 300000,
  });

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
      if (!response.ok) throw new Error('Failed to perform threat detection');
      return response.json();
    },
    enabled: false,
  });

  const assessmentMutation = useMutation({
    mutationFn: async () => {
      let currentThreatData = null;
      try {
        const threatResponse = await fetch('/api/threat-detection', {
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
        if (threatResponse.ok) {
          currentThreatData = await threatResponse.json();
        }
      } catch (error) {
        console.log('AI Assessment: Could not fetch threat data:', error);
      }
      
      const optimizedStorms = storms.slice(0, 200).map(storm => ({
        lat: storm.lat,
        lon: storm.lon,
        intensity: storm.intensity,
        distance: storm.distance,
        direction: storm.direction,
        bearing: storm.bearing,
        category: storm.category,
        movement: storm.movement ? {
          direction: storm.movement.direction,
          speed: storm.movement.speed,
          eta: storm.movement.eta,
          impact: storm.movement.impact
        } : null
      }));
      
      const nwsForecastSummary = nwsForecast?.slice(0, 6).map(p => ({
        name: p.name,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        windSpeed: p.windSpeed,
        shortForecast: p.shortForecast,
        detailedForecast: p.detailedForecast
      })) || null;

      const response = await apiRequest("POST", "/api/ai-assessment", {
        userLocation,
        storms: optimizedStorms,
        stormCount: storms.length,
        winds,
        radarSource,
        includeAlerts: true,
        lightningCount,
        useMetric,
        threatData: currentThreatData,
        userSettings: { aiTone },
        nwsForecast: nwsForecastSummary
      });
      return response.json();
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (question: string) => {
      const optimizedStorms = storms.slice(0, 50).map(storm => ({
        lat: storm.lat,
        lon: storm.lon,
        intensity: storm.intensity,
        distance: storm.distance,
        direction: storm.direction,
        category: storm.category
      }));
      
      const nwsForecastSummary = nwsForecast?.slice(0, 4).map(p => ({
        name: p.name,
        shortForecast: p.shortForecast,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        windSpeed: p.windSpeed
      })) || null;

      const response = await apiRequest("POST", "/api/ai-chat", {
        question,
        userLocation,
        useMetric,
        storms: optimizedStorms,
        stormCount: storms.length,
        nwsForecast: nwsForecastSummary
      });
      const result = await response.json();
      return result as { response: string; contextUsed: any };
    },
    onSuccess: (data) => {
      setChatResponse(data.response);
    }
  });

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatQuestion.trim()) {
      chatMutation.mutate(chatQuestion.trim());
      setChatQuestion('');
    }
  };

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

  useEffect(() => {
    if (!isMonitoring) return;
    const interval = setInterval(() => {
      setLastCheck(new Date());
      refetchThreats();
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isMonitoring, refetchThreats]);

  useEffect(() => {
    setIsDataReady(false);
    setLoadingTimer(5);
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

  useEffect(() => {
    if (storms && storms.length >= 0 && winds && winds.length >= 0 && aviationData) {
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

  const fmtDist = (mi: number) => useMetric ? `${(mi * 1.609).toFixed(1)} km` : `${mi.toFixed(1)} mi`;
  const fmtSpeed = (mph: number) => useMetric ? `${Math.round(mph * 1.609)} km/h` : `${Math.round(mph)} mph`;

  return (
    <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600">
      <CardHeader className="pb-2">
        <CardTitle className="text-white cursor-pointer" onClick={() => setCardCollapsed(!cardCollapsed)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-400" />
              AI Weather Assistant
              {cardCollapsed ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              )}
              {isMonitoring && (
                <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                  Monitoring
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {assessment && (
                <Badge className={`w-fit ${getRiskColor(assessment.riskLevel)}`}>
                  {getRiskIcon(assessment.riskLevel)}
                  {assessment.riskLevel.toUpperCase()} RISK
                </Badge>
              )}
            </div>
          </div>
        </CardTitle>

        {!cardCollapsed && (
          <div className="mt-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-1.5">
              <Target className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Storm Status (50 mi)</span>
            </div>
            {stormSummary.total === 0 ? (
              <p className="text-sm text-green-400 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                No storms detected within 50-mile radius
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-slate-300">
                  <span className="text-white font-semibold">{stormSummary.total}</span> storm{stormSummary.total !== 1 ? 's' : ''} detected
                  {stormSummary.closest && (
                    <span className="text-slate-400"> — closest: <span className="text-amber-300">{stormSummary.closest.category}</span> ({stormSummary.closest.intensity} dBZ) {getCompassDir(stormSummary.closest.bearing)} at {fmtDist(stormSummary.closest.distance)}</span>
                  )}
                </p>
                {stormSummary.approaching.length > 0 && (
                  <div className="text-sm">
                    <span className="text-red-400 font-semibold flex items-center gap-1">
                      <Navigation className="w-3 h-3" />
                      {stormSummary.approaching.length} approaching:
                    </span>
                    {stormSummary.approaching.slice(0, 3).map((s, i) => (
                      <p key={i} className="text-slate-300 ml-5 text-xs">
                        {s.category} ({s.intensity} dBZ) — {fmtDist(s.distance)} {getCompassDir(s.bearing)}, moving {getCompassDir(s.movement!.direction)} at {fmtSpeed(s.movement!.speed)}
                        {s.movement?.eta && <span className="text-orange-400"> — ETA: {s.movement.eta}</span>}
                      </p>
                    ))}
                  </div>
                )}
                {stormSummary.approaching.length === 0 && stormSummary.total > 0 && (
                  <p className="text-xs text-slate-500">No storms on collision course with your location</p>
                )}
                {stormSummary.strongest && stormSummary.strongest.intensity >= 45 && stormSummary.strongest !== stormSummary.closest && (
                  <p className="text-xs text-slate-400">
                    Strongest: <span className="text-orange-300">{stormSummary.strongest.category}</span> ({stormSummary.strongest.intensity} dBZ) at {fmtDist(stormSummary.strongest.distance)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      {!cardCollapsed && (
      <CardContent className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded-md">
            <span className="text-xs text-slate-400 mr-1">Tone:</span>
            <button
              onClick={() => setAiTone('professional')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                aiTone === 'professional' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-600'
              }`}
            >
              📊 Pro
            </button>
            <button
              onClick={() => setAiTone('friendly')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                aiTone === 'friendly' 
                  ? 'bg-green-600 text-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-600'
              }`}
            >
              😊 Friendly
            </button>
            <button
              onClick={() => setAiTone('humorous')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                aiTone === 'humorous' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-600'
              }`}
            >
              😄 Fun
            </button>
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
                : '🔍 Full AI Analysis'
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
          <p className="text-xs text-slate-400">
            Last check: {lastCheck.toLocaleTimeString()}
          </p>
        )}

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
              <div className="py-3">
                <Clock className="w-5 h-5 animate-pulse mx-auto mb-1 text-blue-400" />
                <p className="text-slate-400 text-sm">
                  {loadingTimer > 0 ? `Loading storm data... (${loadingTimer}s)` : 'Almost ready...'}
                </p>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">
                Tap "Full AI Analysis" for comprehensive weather & storm assessment
              </p>
            )}
          </div>
        )}

        {assessmentMutation.isPending && (
          <div className="text-center py-6">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
            <p className="text-sm text-slate-300">
              AI is analyzing {Math.min(storms.length, 200)} storms{storms.length > 200 ? ` (of ${storms.length} total)` : ''}, wind patterns, alerts, and aviation data...
            </p>
          </div>
        )}

        {assessment && (
          <div className="space-y-4">
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
                
                <div>
                  <h4 className="font-semibold mb-2 text-white">Detailed Analysis</h4>
                  <p className="text-sm whitespace-pre-line text-slate-200">{assessment.detailedAnalysis}</p>
                </div>

                <Separator className="bg-slate-600" />

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

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-slate-200 hover:bg-slate-700"
            >
              {isExpanded ? 'Show Less' : 'Show Detailed Analysis'}
            </Button>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Ask Weather Questions
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowChatMode(!showChatMode)}
                  className="text-xs text-slate-300 hover:bg-slate-700"
                >
                  {showChatMode ? 'Hide Chat' : 'Show Chat'}
                </Button>
              </div>

              {showChatMode && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "What's the temperature?",
                      "Will it rain today?",
                      "How likely are thunderstorms?",
                      "What's the wind speed?"
                    ].map((question) => (
                      <Button
                        key={question}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setChatQuestion(question);
                          chatMutation.mutate(question);
                        }}
                        disabled={chatMutation.isPending}
                        className="text-xs border-slate-600 text-slate-300 hover:bg-slate-700 h-auto py-2 px-2"
                      >
                        {question}
                      </Button>
                    ))}
                  </div>

                  <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <Input
                      value={chatQuestion}
                      onChange={(e) => setChatQuestion(e.target.value)}
                      placeholder="Ask about weather conditions..."
                      disabled={chatMutation.isPending}
                      className="bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-400"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!chatQuestion.trim() || chatMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>

                  {chatMutation.isPending && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400"></div>
                      Analyzing weather data...
                    </div>
                  )}

                  {chatResponse && (
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600/50">
                      <p className="text-sm text-slate-200 whitespace-pre-line">{chatResponse}</p>
                    </div>
                  )}

                  {chatMutation.isError && (
                    <div className="text-sm text-red-400">
                      Unable to process question. Please try again.
                    </div>
                  )}
                </div>
              )}
            </div>
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
      )}
    </Card>
  );
}
