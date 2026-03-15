import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Brain, AlertTriangle, CheckCircle, Clock, MapPin, Wind, Plane, RefreshCw, Send, MessageCircle, BookOpen, ChevronDown, ChevronUp, Cpu, Zap } from "lucide-react";

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

interface Section {
  title: string;
  content: string;
}

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(?:\*\*)?([A-Z][A-Z &/]+(?:[A-Z]))(?:\*\*)?:?\s*(.*)/);
    if (headerMatch && line.trim().length < 60) {
      if (currentTitle || currentContent.length > 0) {
        sections.push({
          title: currentTitle || 'Overview',
          content: currentContent.join('\n').trim(),
        });
      }
      currentTitle = headerMatch[1].replace(/\*\*/g, '').trim();
      currentContent = headerMatch[2] ? [headerMatch[2]] : [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentTitle || currentContent.length > 0) {
    sections.push({
      title: currentTitle || 'Overview',
      content: currentContent.join('\n').trim(),
    });
  }

  return sections.filter(s => s.content.trim().length > 0);
}

function getTitleColor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('right now') || t.includes('current')) return 'text-cyan-400';
  if (t.includes('today')) return 'text-blue-400';
  if (t.includes('week') || t.includes('ahead')) return 'text-indigo-400';
  if (t.includes('storm')) return 'text-amber-400';
  if (t.includes('alert') || t.includes('warning')) return 'text-red-400';
  if (t.includes('aviation')) return 'text-sky-400';
  if (t.includes('marine') || t.includes('outdoor')) return 'text-teal-400';
  if (t.includes('atmosphere')) return 'text-purple-400';
  if (t.includes('bottom line') || t.includes('takeaway')) return 'text-green-400';
  return 'text-slate-400';
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
  const [briefingExpanded, setBriefingExpanded] = useState(false);
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
      
      if (!response.ok) {
        throw new Error('Failed to perform threat detection');
      }
      
      return response.json();
    },
    enabled: false,
  });

  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary, isFetching: summaryFetching } = useQuery({
    queryKey: ['/api/ai-summary', userLocation.lat, userLocation.lon, aiTone],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/ai-summary', {
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        useMetric,
        tone: aiTone,
      });
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    retry: 1,
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
        type: storm.type,
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
        detailedForecast: p.detailedForecast?.slice(0, 300)
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

  const summarySections = summaryData?.summary ? parseSections(summaryData.summary) : [];
  const condensedSections = summarySections.slice(0, 3);
  const remainingSections = summarySections.slice(3);
  const summaryProviderLabel = summaryData?.provider === 'openrouter' ? 'OpenRouter' : summaryData?.provider === 'groq' ? 'Groq' : 'OpenAI';
  const summaryProviderColor = summaryData?.free ? 'text-green-400' : 'text-amber-400';
  const dataPointCount = summaryData?.dataPointsUsed ? Object.values(summaryData.dataPointsUsed).filter(v => v && v !== 0).length : 0;

  return (
    <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600">
      <CardHeader>
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
              {summaryData && (
                <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
                  <Cpu className="w-3 h-3 mr-1" />
                  <span className={summaryProviderColor}>{summaryProviderLabel}</span>
                  {summaryData.free && <Zap className="w-3 h-3 ml-1 text-green-400" />}
                </Badge>
              )}
            </div>
          </div>
        </CardTitle>
        {!cardCollapsed && (
        <>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded-md">
            <span className="text-xs text-slate-400 mr-1">Tone:</span>
            <button
              onClick={() => setAiTone('professional')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                aiTone === 'professional' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-600'
              }`}
              title="Professional meteorological tone"
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
              title="Friendly conversational tone"
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
              title="Fun Carrot Weather style"
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
        </>
        )}
      </CardHeader>
      {!cardCollapsed && (
      <CardContent className="space-y-4">
        {/* === WEATHER BRIEFING SECTION === */}
        <div className="border border-cyan-500/20 rounded-lg bg-slate-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Weather Briefing
            </h4>
            <div className="flex items-center gap-2">
              {dataPointCount > 0 && (
                <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
                  {dataPointCount} sources
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-slate-400 hover:text-cyan-400"
                onClick={() => refetchSummary()}
                disabled={summaryFetching}
              >
                <RefreshCw className={`w-3 h-3 ${summaryFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {summaryLoading && (
            <div className="space-y-2">
              <div className="h-3 bg-slate-700 rounded animate-pulse w-full" />
              <div className="h-3 bg-slate-700 rounded animate-pulse w-5/6" />
              <div className="h-3 bg-slate-700 rounded animate-pulse w-4/6" />
              <div className="h-3 bg-slate-700 rounded animate-pulse w-full" />
              <div className="h-3 bg-slate-700 rounded animate-pulse w-3/6" />
            </div>
          )}

          {!summaryLoading && !summaryData?.summary && (
            <p className="text-slate-400 text-sm">Weather briefing will generate automatically...</p>
          )}

          {!summaryLoading && summarySections.length > 0 && (
            <div className="space-y-3">
              {condensedSections.map((section, i) => (
                <div key={i}>
                  <h5 className={`text-xs font-semibold uppercase tracking-wider mb-1 ${getTitleColor(section.title)}`}>
                    {section.title}
                  </h5>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {section.content}
                  </p>
                </div>
              ))}

              {remainingSections.length > 0 && (
                <>
                  {briefingExpanded && remainingSections.map((section, i) => (
                    <div key={`exp-${i}`}>
                      <h5 className={`text-xs font-semibold uppercase tracking-wider mb-1 ${getTitleColor(section.title)}`}>
                        {section.title}
                      </h5>
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                        {section.content}
                      </p>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-cyan-400 hover:text-cyan-300 hover:bg-slate-800/50 text-xs"
                    onClick={() => setBriefingExpanded(!briefingExpanded)}
                  >
                    {briefingExpanded ? (
                      <>Show Less <ChevronUp className="w-3 h-3 ml-1" /></>
                    ) : (
                      <>Show Full Briefing ({remainingSections.length} more sections) <ChevronDown className="w-3 h-3 ml-1" /></>
                    )}
                  </Button>
                </>
              )}

              {summaryData?.timestamp && (
                <div className="text-[10px] text-slate-500 text-right">
                  {new Date(summaryData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{summaryData.model}
                </div>
              )}
            </div>
          )}
        </div>

        <Separator className="bg-slate-600" />

        {/* === THREAT DETECTION STATUS === */}
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
