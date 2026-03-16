import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getStormCategory, getCompassDirection, calculateApproachAngle, isStormApproaching, calculateETA } from "@shared/storm-utils";
import { useLocation } from "@/hooks/use-location";
import { useStormData } from "@/hooks/use-storm-data";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Header from "@/components/header";
import LocationSetup from "@/components/location-setup";
import FavoriteLocations from "@/components/favorite-locations";
import StormMap from "@/components/storm-map";
import StormPanel from "@/components/storm-panel";
import ImpactPanel from "@/components/impact-panel";
import ImmediateSafetyAlerts from "@/components/immediate-safety-alerts";
import Simple3DCanvas from "@/components/simple-3d-canvas";
import AlertSettings from "@/components/alert-settings";
import AlertSubscription from "@/components/alert-subscription";
import SonarRadar from "@/components/sonar-radar";
import WeatherDashboard from "@/components/weather-dashboard";
import SectionReorder, { getSectionOrder } from "@/components/section-reorder";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIWeatherAssistant from "@/components/ai-weather-assistant";
import { LayoutList } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

// Embedded Message Inbox Component for Modal
function EmbeddedMessageInbox() {
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  // Get all messages
  const { data: messages = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/messages/all"],
  });

  // Mark message as read
  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const response = await fetch(`/api/messages/${messageId}/read`, { method: "POST" });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/all"] });
    },
  });

  // Delete message
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const response = await fetch(`/api/messages/${messageId}`, { method: "DELETE" });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/all"] });
      setSelectedMessage(null);
    },
  });

  const handleMessageClick = (message: any) => {
    setSelectedMessage(message);
    if (!message.isRead) {
      markAsReadMutation.mutate(message.id);
    }
  };

  if (isLoading) {
    return <div className="text-slate-300">{t.loadingMessages}</div>;
  }

  if (messages.length === 0) {
    return (
      <div className="text-center text-slate-300 py-8">
        <div className="text-4xl mb-4">📧</div>
        <h3 className="text-lg font-semibold mb-2">{t.noMessagesYet}</h3>
        <p className="text-slate-400">{t.alertMessagesAppear}</p>
      </div>
    );
  }

  if (selectedMessage) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            onClick={() => setSelectedMessage(null)}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
          >
            ← {t.messages}
          </Button>
          <Button
            onClick={() => deleteMessageMutation.mutate(selectedMessage.id)}
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300"
            disabled={deleteMessageMutation.isPending}
          >
            🗑️ {t.delete}
          </Button>
        </div>
        
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">{selectedMessage.subject}</h3>
            <span className="text-xs text-slate-400">
              {new Date(selectedMessage.sentAt).toLocaleString()}
            </span>
          </div>
          
          <div className="text-slate-300 prose prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: selectedMessage.htmlContent || selectedMessage.textContent }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-slate-300 mb-4">
        <p className="text-sm">
          {t.stormAlertMessages}: <span className="font-semibold">{messages.length}</span>
          {" • "}
          New: <span className="font-semibold text-blue-400">{messages.filter((m: any) => !m.isRead).length}</span>
        </p>
      </div>
      
      {messages.map((message: any) => (
        <div
          key={message.id}
          onClick={() => handleMessageClick(message)}
          className={`p-4 rounded-lg border cursor-pointer transition-colors ${
            message.isRead 
              ? 'bg-slate-800/30 border-slate-700 hover:bg-slate-800/50' 
              : 'bg-blue-900/20 border-blue-600/50 hover:bg-blue-900/30'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-white text-sm">{message.subject}</h4>
            <div className="flex items-center gap-2">
              {!message.isRead && (
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              )}
              <span className="text-xs text-slate-400">
                {new Date(message.sentAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          
          <p className="text-slate-400 text-sm mb-2">{t.to}: {message.recipientEmail}</p>
          
          <div className="text-slate-300 text-sm line-clamp-2">
            {message.textContent?.substring(0, 150)}...
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StormTracker() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(true);
  const radarRange = 50;
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [show3D, setShow3D] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'sonar' | '3d'>('map');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [stormFilters, setStormFilters] = useState({
    light: true,
    moderate: true,
    heavy: true,
    severe: true,
    veryHeavy: true,
    extreme: true,
  });
  
  const [currentRadarSource, setCurrentRadarSource] = useState<'rainviewer' | 'nexrad' | 'open-meteo'>('rainviewer');
  const [radarComparison, setRadarComparison] = useState<any>(null);
  const [showStormTracks, setShowStormTracks] = useState(false);
  const [showTimeLabels, setShowTimeLabels] = useState(false);
  const [showLightning, setShowLightning] = useState(true);
  const [precipitationStorms, setPrecipitationStorms] = useState<any[]>([]);
  const [showStormFilteringSettings, setShowStormFilteringSettings] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<string[]>(getSectionOrder);
  const [showSectionReorder, setShowSectionReorder] = useState(false);
  const [showAlertSubscription, setShowAlertSubscription] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [windsData, setWindsData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'tracker' | 'alerts' | 'messages'>('tracker');
  const [mobileTab, setMobileTab] = useState<'radar' | 'weather' | 'storms' | 'ai' | 'alerts'>('radar');


  const [mapInstance, setMapInstance] = useState<any>(null);
  
  const {
    location,
    isLoading: locationLoading,
    setLocationFromGPS,
    setLocationFromSearch,
    setLocationDirectly,
    clearLocation,
  } = useLocation();

  const {
    storms,
    alerts,
    refetch: refetchStormData,
    isLoading: stormDataLoading,
  } = useStormData(location, radarRange);


  // Get alert preferences for visual highlighting only
  const { data: preferences } = useQuery({
    queryKey: ['/api/alerts/preferences'],
    staleTime: 5 * 60 * 1000,
  });

  // Get winds aloft data for AI assistant
  const { data: windsAloftData } = useQuery({
    queryKey: ['/api/winds-aloft', location?.lat, location?.lon],
    enabled: !!location,
    staleTime: 10 * 60 * 1000, // 10 minutes
    queryFn: async () => {
      if (!location) return null;
      
      const response = await fetch(`/api/winds-aloft?lat=${location.lat}&lon=${location.lon}`);
      if (!response.ok) return null;
      
      return response.json();
    },
  });

  const [tickerMessages, setTickerMessages] = useState<string[]>([]);
  const lastTickerSig = useRef('');

  useEffect(() => {
    if (!precipitationStorms.length || !location) return;
    const sig = `${location.lat.toFixed(3)},${location.lon.toFixed(3)},${precipitationStorms.length},${Math.round(precipitationStorms.reduce((s, x) => s + (x.intensity || 0), 0))}`;
    if (sig === lastTickerSig.current) return;
    lastTickerSig.current = sig;
    const top = [...precipitationStorms].sort((a, b) => (b.intensity || 0) - (a.intensity || 0)).slice(0, 8).map(s => ({
      intensity: s.intensity, distance: s.distance, direction: s.direction, type: s.type, windsPrediction: s.windsPrediction,
    }));
    fetch('/api/ticker-messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storms: top, totalStormCount: precipitationStorms.length, locationName: location.name, userLocation: { lat: location.lat, lon: location.lon } }),
    }).then(r => r.json()).then(d => {
      if (d.messages?.length) setTickerMessages(d.messages);
    }).catch(() => {});
  }, [precipitationStorms, location]);

  const activeStorms = precipitationStorms;
  
  const filteredStorms = activeStorms.filter(storm => {
    const category = storm.intensity >= 61 ? 'extreme' :
                    storm.intensity >= 55 ? 'veryHeavy' :
                    storm.intensity >= 46 ? 'heavy' :
                    storm.intensity >= 35 ? 'moderate' :
                    'light';
    return stormFilters[category as keyof typeof stormFilters];
  });

  // Listen for precipitation storm data
  useEffect(() => {
    const handlePrecipitationStormData = (event: any) => {
      const newPrecipitationStorms = event.detail || [];
      console.log(`Storm Panel Data: Updated precipitation storms: ${newPrecipitationStorms.length} storms detected`);
      setPrecipitationStorms(newPrecipitationStorms);
      
      // Log for visual highlighting (no popup alerts)
      if (location && preferences) {
        const qualifyingStorms = newPrecipitationStorms.filter((storm: any) => 
          storm.intensity >= (preferences as any).minimumDbz
        );
        console.log(`Visual Alert System: Found ${qualifyingStorms.length} storms meeting ${(preferences as any).minimumDbz}+ dBZ threshold for visual highlighting`);
      }
    };

    window.addEventListener('precipitationStormData', handlePrecipitationStormData);
    return () => {
      window.removeEventListener('precipitationStormData', handlePrecipitationStormData);
    };
  }, [location, preferences]);

  // Test radar sources for comparison
  const testRadarSources = async () => {
    if (!location) return;
    
    try {
      const response = await fetch(`/api/radar-comparison?lat=${location.lat}&lon=${location.lon}`);
      const comparison = await response.json();
      setRadarComparison(comparison);
      console.log('Radar Comparison Results:', comparison);
    } catch (error) {
      console.error('Radar comparison failed:', error);
    }
  };

  // Test Open-Meteo precipitation grid
  const testOpenMeteoGrid = async () => {
    if (!location) return;
    
    try {
      const response = await fetch(`/api/open-meteo-precipitation-grid?lat=${location.lat}&lon=${location.lon}&radius=30`);
      const data = await response.json();
      console.log('Open-Meteo Grid Results:', data);
      
      // Update precipitation storms with Open-Meteo data
      if (data.precipitationStorms) {
        setPrecipitationStorms(data.precipitationStorms);
        
        // Dispatch event for map to update
        window.dispatchEvent(new CustomEvent('precipitationStormData', {
          detail: data.precipitationStorms
        }));
      }
    } catch (error) {
      console.error('Open-Meteo grid test failed:', error);
    }
  };



  // Listen for location with radar source
  useEffect(() => {
    const handleLocationWithRadarSource = (event: any) => {
      const locationData = event.detail;
      if (locationData?.recommendedRadarSource) {
        setCurrentRadarSource(locationData.recommendedRadarSource);
        console.log(`Auto-switched to ${locationData.recommendedRadarSource} for location: ${locationData.name}`);
      }
    };

    window.addEventListener('locationWithRadarSource', handleLocationWithRadarSource);
    return () => {
      window.removeEventListener('locationWithRadarSource', handleLocationWithRadarSource);
    };
  }, []);

  // Handle storm filtering settings save
  const handleStormFilteringSettingsSave = async (newPreferences: any) => {
    try {
      await fetch('/api/alerts/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPreferences)
      });
      // Invalidate and refetch the preferences query
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/preferences'] });
    } catch (error) {
      console.error('Failed to save storm filtering preferences:', error);
    }
  };

  // Clear precipitation storms when location changes
  useEffect(() => {
    setPrecipitationStorms([]);
  }, [location]);

  // Auto-enable tracking when location is set
  useEffect(() => {
    if (location && !isTracking) {
      setIsTracking(true);
      setLastUpdate(new Date());
    }
  }, [location]);

  // Auto-switch to NEXRAD for US locations on app load
  useEffect(() => {
    if (location && currentRadarSource === 'rainviewer') {
      // Detect US locations by coordinates or common US indicators
      const isUSLocation = location.lat >= 24.5 && location.lat <= 49.5 && location.lon >= -125 && location.lon <= -66.5;
      const hasUSIndicators = location.name.includes(', FL') || location.name.includes(', TX') || location.name.includes(', CA') || 
                             location.name.includes(', NY') || location.name.includes('Florida') || location.name.includes('Texas') ||
                             location.name.includes('California') || location.name.includes('Alaska') || location.name.includes('Hawaii');
      
      if (isUSLocation || hasUSIndicators) {
        setCurrentRadarSource('nexrad');
        console.log('Auto-switched to NEXRAD for US location:', location.name);
      }
    }
  }, [location, currentRadarSource]);

  // Auto-refresh when tracking is enabled
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isTracking && location) {
      interval = setInterval(() => {
        refetchStormData();
        setLastUpdate(new Date());
      }, 5 * 60 * 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, location, refetchStormData]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = (q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (q.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address-suggest?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
          setShowSuggestions((data.suggestions || []).length > 0);
        }
      } catch { /* ignore */ }
    }, 300);
  };

  const handleSuggestionSelect = (suggestion: any) => {
    setShowSuggestions(false);
    setSearchQuery('');
    setSuggestions([]);
    const loc = {
      lat: suggestion.lat,
      lon: suggestion.lon,
      name: suggestion.display_name,
      country: suggestion.address?.country,
      isUS: suggestion.address?.country === 'US',
      recommendedRadarSource: (suggestion.address?.country === 'US' ? 'nexrad' : 'rainviewer') as 'nexrad' | 'rainviewer',
    };
    handleDirectLocationSelect(loc);
  };

  const handleLocationSearch = async (query: string) => {
    try {
      await setLocationFromSearch(query);
      if (isTracking) {
        refetchStormData();
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Location search failed:", error);
      alert(`Could not find "${query}". Try a city name, full address, or ZIP code.`);
    }
  };

  const handleGPSLocation = async () => {
    try {
      const result = await setLocationFromGPS();
      // Auto-switch to NEXRAD for US GPS locations
      if (result && ((result as any).isUS || (result as any).recommendedRadarSource === 'nexrad')) {
        setCurrentRadarSource('nexrad');
        console.log('Auto-switched to NEXRAD for US GPS location:', result.name);
      }
      if (isTracking) {
        refetchStormData();
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("GPS location failed:", error);
      // Re-throw so the location UI can show the actual error message
      throw error;
    }
  };

  const handleFavoriteSelect = (fav: { lat: number; lon: number; name: string; country?: string; isUS?: boolean; recommendedRadarSource?: 'rainviewer' | 'nexrad' }) => {
    handleDirectLocationSelect({
      lat: fav.lat,
      lon: fav.lon,
      name: fav.name,
      country: fav.country,
      isUS: fav.isUS,
      recommendedRadarSource: fav.recommendedRadarSource,
    });
  };

  const handleDirectLocationSelect = (selectedLocation: { 
    lat: number; 
    lon: number; 
    name: string; 
    country?: string; 
    isUS?: boolean; 
    recommendedRadarSource?: 'rainviewer' | 'nexrad' 
  }) => {
    setLocationDirectly({
      lat: selectedLocation.lat,
      lon: selectedLocation.lon,
      name: selectedLocation.name,
    });
    
    if (selectedLocation.recommendedRadarSource) {
      setCurrentRadarSource(selectedLocation.recommendedRadarSource);
      console.log(`Auto-switched to ${selectedLocation.recommendedRadarSource} for ${selectedLocation.country === 'US' ? 'US' : 'international'} location: ${selectedLocation.name}`);
    }
    
    if (isTracking) {
      refetchStormData();
      setLastUpdate(new Date());
    }
  };

  const resetLocation = () => {
    clearLocation();
    setIsTracking(false);
    setLastUpdate(null);
  };

  const getStormImpact = (storm: any) => {
    const movementDir = storm.windsPrediction?.direction || 0;
    const movementSpeed = storm.windsPrediction?.speed || 0;
    if (!storm.windsPrediction) {
      return { severity: 'Low', eta: 'No data', impactChance: 'Low', movementDir: 0, movementSpeed: 0, impactColor: 'text-green-400', severityColor: 'text-green-400' };
    }
    const approachAngle = calculateApproachAngle(storm.direction, movementDir);
    const approaching = isStormApproaching(storm.direction, movementDir, movementSpeed);
    let eta = 'Not approaching';
    let impactChance = 'Low';
    if (approaching && movementSpeed > 0) {
      const etaMin = calculateETA(storm.distance, movementSpeed);
      if (etaMin < 999) {
        eta = etaMin < 60 ? `${Math.round(etaMin)}min` : `${(etaMin / 60).toFixed(1)}hr`;
        impactChance = approachAngle <= 15 ? 'High' : 'Medium';
      }
    }
    let severity = 'Low';
    if (storm.intensity >= 55 && storm.distance <= 15) severity = 'High';
    else if (storm.intensity >= 45 && storm.distance <= 20) severity = 'Medium';
    else if (storm.intensity >= 35 && storm.distance <= 25) severity = 'Medium';
    const impactColor = impactChance === 'High' ? 'text-red-400' : impactChance === 'Medium' ? 'text-yellow-400' : 'text-green-400';
    const severityColor = severity === 'High' ? 'text-red-400' : severity === 'Medium' ? 'text-yellow-400' : 'text-green-400';
    return { severity, eta, impactChance, movementDir, movementSpeed, impactColor, severityColor };
  };

  const formatDistance = (miles: number) => {
    if (useMetric) {
      const km = miles * 1.60934;
      return `${km.toFixed(1)} km`;
    }
    return `${miles.toFixed(1)} mi`;
  };

  const formatSpeed = (mph: number) => {
    if (useMetric) {
      const kmh = mph * 1.60934;
      return `${kmh.toFixed(0)} km/h`;
    }
    return `${mph.toFixed(0)} mph`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      <Header 
        useMetric={useMetric}
        onUnitsChange={setUseMetric}
      />
      
      {/* Storm Filtering Settings Modal */}
      {preferences && (
        <AlertSettings
          isOpen={showStormFilteringSettings}
          onClose={() => setShowStormFilteringSettings(false)}
          preferences={preferences as any}
          onSave={handleStormFilteringSettingsSave}
        />
      )}

      {/* Alert Subscription Modal */}
      {showAlertSubscription && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{t.stormAlertNotifications}</h2>
              <Button
                onClick={() => setShowAlertSubscription(false)}
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-white"
              >
                ✕
              </Button>
            </div>
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <AlertSubscription 
                location={location}
              />
            </div>
          </div>
        </div>
      )}

      {/* Messages Modal */}
      {showMessages && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-900 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{t.stormAlertMessages}</h2>
              <Button
                onClick={() => setShowMessages(false)}
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-white"
              >
                ✕
              </Button>
            </div>
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <EmbeddedMessageInbox />
            </div>
          </div>
        </div>
      )}
      
      <div className="p-3 sm:p-6">
        {!location ? (
          <LocationSetup
            onGPSLocation={handleGPSLocation}
            onLocationSearch={handleLocationSearch}
            onLocationSelect={handleDirectLocationSelect}
            isLoading={locationLoading}
          />
        ) : (
          <>
            {/* Location Display */}
            <div className="bg-slate-800/50 rounded-xl p-3 sm:p-6 border border-slate-700/50 mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-0">
                <div className="flex items-center gap-3">
                  <div className="text-xl sm:text-2xl">📍</div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold">{location.name}</h2>
                    <p className="text-slate-400 text-xs">
                      {location.lat.toFixed(4)}°{location.lat >= 0 ? 'N' : 'S'}, {Math.abs(location.lon).toFixed(4)}°{location.lon >= 0 ? 'E' : 'W'}
                    </p>
                    <p className="text-slate-300 text-sm sm:text-base">
                      {t.detectionRadius}: {formatDistance(50)} ({t.unifiedSystem})
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {/* Messages and Alerts tabs temporarily disabled */}
                  <Button
                    onClick={resetLocation}
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm"
                  >
                    📍 {t.changeLocation}
                  </Button>
                  <Button
                    onClick={handleGPSLocation}
                    variant="outline"
                    size="sm"
                    disabled={locationLoading}
                    className="text-xs sm:text-sm"
                  >
                    🌐 GPS
                  </Button>

                </div>
              </div>

              <div ref={searchRef} className="mb-3 relative">
                <form className="flex gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  const val = searchQuery.trim();
                  if (val) {
                    setShowSuggestions(false);
                    handleLocationSearch(val);
                    setSearchQuery('');
                  }
                }}>
                  <Input
                    placeholder={t.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      fetchSuggestions(e.target.value);
                    }}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    className="bg-slate-700/50 border-slate-600 flex-1"
                    style={{ fontSize: '16px' }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={!searchQuery.trim()}
                    className="h-10 px-3 border-slate-600 text-slate-300 hover:text-white"
                  >
                    🔍
                  </Button>
                </form>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                    {suggestions.map((s: any, i: number) => (
                      <button
                        key={s.id || i}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0 flex items-center gap-2"
                        onClick={() => handleSuggestionSelect(s)}
                      >
                        <span className="text-slate-400 text-sm shrink-0">{s.type === 'postal_code' ? '📮' : '📍'}</span>
                        <span className="text-white text-sm truncate">{s.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Favorites — quick-switch + save current */}
              <FavoriteLocations
                onSelect={handleFavoriteSelect}
                currentLat={location.lat}
                currentLon={location.lon}
                currentName={location.name}
                currentCountry={(location as any).country}
                currentIsUS={location.lat >= 24.5 && location.lat <= 49.5 && location.lon >= -125 && location.lon <= -66.5}
                currentRadarSource={currentRadarSource === 'nexrad' ? 'nexrad' : 'rainviewer'}
                showAddButton={true}
              />

              <div className="flex items-center gap-2 flex-wrap">
                {lastUpdate && (
                  <p className="text-slate-400 text-xs sm:text-sm">
                    {t.lastCheck}: {lastUpdate.toLocaleTimeString()}
                  </p>
                )}
                <button
                  onClick={() => setShowSectionReorder(true)}
                  className="hidden lg:flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 bg-slate-800/50 hover:bg-slate-700/50 rounded-md border border-slate-700/50 transition-colors ml-auto"
                >
                  <LayoutList className="w-3 h-3" />
                  {t.layout}
                </button>
              </div>
            </div>

            {showSectionReorder && (
              <SectionReorder
                currentOrder={sectionOrder}
                onOrderChange={setSectionOrder}
                onClose={() => setShowSectionReorder(false)}
              />
            )}

            {/* === DESKTOP LAYOUT: sectionOrder scroll === */}
            <div className="hidden lg:block">
            {sectionOrder.map(sectionId => {
              switch (sectionId) {
                case 'isa':
                  return (
                    <ImmediateSafetyAlerts
                      key="isa"
                      location={location}
                      storms={filteredStorms}
                      isLoading={stormDataLoading}
                      windsAloftData={windsAloftData}
                    />
                  );
                case 'weather':
                  return (
                    <WeatherDashboard
                      key="weather"
                      lat={location.lat}
                      lon={location.lon}
                      useMetric={useMetric}
                      locationName={location.name}
                    />
                  );
                case 'summary':
                  return filteredStorms.length > 0 ? (
                    <div key="summary" className="bg-slate-800/50 rounded-xl p-3 sm:p-6 border border-slate-700/50 mb-4 sm:mb-6">
                      <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
                        ⚡ {t.stormSummary}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(() => {
                          const closestStorm = [...filteredStorms].sort((a, b) => a.distance - b.distance)[0];
                          const impact = getStormImpact(closestStorm);
                          return (
                            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="text-blue-400">🎯</div>
                                <span className="text-sm font-medium text-slate-300">{t.closestStorm}</span>
                              </div>
                              <div className="text-white font-semibold">
                                {getCompassDirection(closestStorm.direction)} ({closestStorm.direction.toFixed(0).padStart(3, '0')}°) @ {formatDistance(closestStorm.distance)}
                              </div>
                              <div className="text-xs text-slate-400 mb-1">
                                {closestStorm.intensity}dBZ • {getStormCategory(closestStorm.intensity)}
                              </div>
                              {closestStorm.windsPrediction && (
                                <div className="text-xs text-slate-300 space-y-1">
                                  <div>{t.movement}: {getCompassDirection(impact.movementDir)} ({impact.movementDir.toFixed(0).padStart(3, '0')}°) @ {formatSpeed(impact.movementSpeed)}</div>
                                  <div className="flex justify-between">
                                    <span>{t.impact}: <span className={impact.impactColor}>{impact.impactChance}</span></span>
                                    <span>{t.eta}: {impact.eta}</span>
                                  </div>
                                  <div>{t.severity}: <span className={impact.severityColor}>{impact.severity}</span></div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {(() => {
                          const strongestStorm = [...filteredStorms].sort((a, b) => b.intensity - a.intensity)[0];
                          const impact = getStormImpact(strongestStorm);
                          return (
                            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="text-red-400">⚡</div>
                                <span className="text-sm font-medium text-slate-300">{t.strongestStorm}</span>
                              </div>
                              <div className="text-white font-semibold">
                                {strongestStorm.intensity}dBZ
                              </div>
                              <div className="text-xs text-slate-400 mb-1">
                                {getCompassDirection(strongestStorm.direction)} ({strongestStorm.direction.toFixed(0).padStart(3, '0')}°) @ {formatDistance(strongestStorm.distance)} • {getStormCategory(strongestStorm.intensity)}
                              </div>
                              {strongestStorm.windsPrediction && (
                                <div className="text-xs text-slate-300 space-y-1">
                                  <div>{t.movement}: {getCompassDirection(impact.movementDir)} ({impact.movementDir.toFixed(0).padStart(3, '0')}°) @ {formatSpeed(impact.movementSpeed)}</div>
                                  <div className="flex justify-between">
                                    <span>{t.impact}: <span className={impact.impactColor}>{impact.impactChance}</span></span>
                                    <span>{t.eta}: {impact.eta}</span>
                                  </div>
                                  <div>{t.severity}: <span className={impact.severityColor}>{impact.severity}</span></div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : null;
                case 'ai':
                  return location && windsAloftData ? (
                    <div key="ai" className="mb-4 sm:mb-6">
                      <AIWeatherAssistant
                        userLocation={{
                          lat: location.lat,
                          lon: location.lon,
                          address: location.name
                        }}
                        storms={precipitationStorms.map(storm => ({
                          id: storm.id,
                          lat: storm.lat,
                          lon: storm.lon,
                          intensity: storm.intensity,
                          distance: storm.distance,
                          direction: storm.direction,
                          bearing: storm.bearing || 0,
                          category: storm.intensity >= 61 ? 'Extreme' :
                                   storm.intensity >= 55 ? 'Very Heavy' :
                                   storm.intensity >= 46 ? 'Heavy' :
                                   storm.intensity >= 35 ? 'Moderate' : 'Light',
                          movement: storm.windsPrediction ? {
                            direction: storm.windsPrediction.direction,
                            speed: storm.windsPrediction.speed,
                            eta: storm.impactAssessment?.eta,
                            impact: storm.impactAssessment?.impactChance
                          } : undefined
                        }))}
                        winds={windsAloftData.winds || []}
                        radarSource={currentRadarSource === 'nexrad' ? 'NEXRAD' : 'RainViewer'}
                        lightningCount={0}
                        useMetric={useMetric}
                      />
                    </div>
                  ) : null;
                case 'radar':
                  return (<div key="radar">
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                <div className="hidden lg:flex lg:flex-col lg:w-48 space-y-3">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">{t.viewMode}</h3>
                    <div className="space-y-2">
                      <Button
                        onClick={() => setViewMode('map')}
                        variant="outline"
                        size="sm"
                        className={`w-full text-xs ${viewMode === 'map' ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                      >
                        🗺️ {t.mapView}
                      </Button>
                      <Button
                        onClick={() => setViewMode('sonar')}
                        variant="outline"
                        size="sm"
                        className={`w-full text-xs ${viewMode === 'sonar' ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                      >
                        📡 {t.sonarView}
                      </Button>
                      <Button
                        onClick={() => setViewMode('3d')}
                        variant="outline"
                        size="sm"
                        className={`w-full text-xs ${viewMode === '3d' ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                        disabled={!storms || storms.length === 0}
                      >
                        🌩️ {t.threeDView}
                      </Button>
                      <Button
                        onClick={() => setShowStormFilteringSettings(true)}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                      >
                        ⚙️ {t.settings}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">{t.stormTracks}</h3>
                    <p className="text-xs text-slate-400 mb-2">{t.movementProjectionCones}</p>
                    <Button
                      onClick={() => setShowStormTracks(!showStormTracks)}
                      variant="outline"
                      size="sm"
                      className={`w-full text-xs mb-2 ${showStormTracks ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                    >
                      🎯 {showStormTracks ? t.hideTracks : t.showTracks}
                    </Button>
                    <Button
                      onClick={() => setShowTimeLabels(!showTimeLabels)}
                      variant="outline"
                      size="sm"
                      className={`w-full text-xs mb-2 ${showTimeLabels ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                      disabled={!showStormTracks}
                    >
                      🕐 {showTimeLabels ? t.hideTimeLabels : t.showTimeLabels}
                    </Button>
                    <Button
                      onClick={() => setShowLightning(!showLightning)}
                      variant="outline"
                      size="sm"
                      className={`w-full text-xs ${showLightning ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                    >
                      ⚡ {showLightning ? t.hideLightning : t.showLightning}
                    </Button>
                    {showLightning && (
                      <p className="text-[9px] text-slate-500 italic mt-1">{t.radarDerived}</p>
                    )}
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">{t.radarInfo}</h3>
                    <div className="space-y-2 text-xs">
                      <div className="text-slate-400">
                        {t.source}: <span className="text-white">{currentRadarSource === 'nexrad' ? 'NEXRAD' : 'RainViewer'}</span>
                      </div>
                      <div className="text-slate-400">
                        {t.range}: <span className="text-white">{formatDistance(radarRange)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 w-full lg:max-w-[70%] mx-auto">
                  {viewMode === 'map' && (
                    <StormMap
                      location={location}
                      storms={storms || []}
                      radarRange={radarRange}
                      useMetric={useMetric}
                      formatDistance={formatDistance}
                      formatSpeed={formatSpeed}
                      stormFilters={stormFilters}
                      onRadarSourceChange={setCurrentRadarSource}
                      radarSource={currentRadarSource}
                      isDisabled={showStormFilteringSettings || showAlertSubscription}
                      alertPreferences={preferences}
                      showAllStormTracks={showStormTracks}
                      showTimeLabels={showTimeLabels}
                      onMapInstanceReady={setMapInstance}
                      showLightning={showLightning}
                    />
                  )}
                  
                  {viewMode === 'sonar' && (
                    <SonarRadar
                      location={location}
                      storms={precipitationStorms}
                      radarRange={radarRange}
                      formatDistance={formatDistance}
                      useMetric={useMetric}
                      onStormClick={(storm) => {
                        console.log('Storm clicked in sonar:', storm);
                      }}
                      className=""
                      showLightning={showLightning}
                    />
                  )}
                  
                  {viewMode === '3d' && (
                    <Simple3DCanvas 
                      location={location} 
                      precipitationStorms={precipitationStorms}
                      setViewMode={setViewMode}
                      tickerMessages={tickerMessages}
                      showLightning={showLightning}
                    />
                  )}
                </div>

                <div className="hidden lg:flex lg:flex-col lg:w-64 space-y-3">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">{t.stormStats}</h3>
                    <div className="space-y-2 text-xs">
                      <div className="text-slate-400">
                        {t.detected}: <span className="text-white">{filteredStorms.length}</span>
                      </div>
                      <div className="text-slate-400">
                        {t.closest}: <span className="text-white">
                          {filteredStorms.length > 0 ? 
                            formatDistance([...filteredStorms].sort((a, b) => a.distance - b.distance)[0].distance) : 
                            t.none
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">{t.quickActions}</h3>
                    <div className="space-y-2">
                      {false && (
                        <>
                          <Button
                            onClick={() => setShowAlertSubscription(true)}
                            variant="outline"
                            size="sm"
                            className="w-full text-xs bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30"
                          >
                            🔔 {t.alerts}
                          </Button>
                          <Button
                            onClick={() => setShowMessages(true)}
                            variant="outline"
                            size="sm"
                            className="w-full text-xs bg-green-600/20 border-green-500 text-green-300 hover:bg-green-600/30"
                          >
                            📧 {t.messages}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
                  </div>);
                case 'impact':
                  return (
                    <div key="impact" className="max-w-4xl mx-auto mt-4 sm:mt-6">
                      <ImpactPanel 
                        storms={precipitationStorms}
                        userLocation={location ? { lat: location.lat, lon: location.lon } : null}
                        locationName={location?.name}
                        minimumDbz={(preferences as any)?.minimumDbz ?? 50}
                      />
                    </div>
                  );
                case 'cells':
                  return (
                    <div key="cells" className="max-w-4xl mx-auto mt-4 sm:mt-6">
                      <StormPanel
                        storms={precipitationStorms}
                        useMetric={useMetric}
                        formatDistance={formatDistance}
                        formatSpeed={formatSpeed}
                        isLoading={stormDataLoading}
                        radarSource={currentRadarSource}
                        userLocation={location}
                        stormFilters={stormFilters}
                        alertPreferences={preferences}
                      />
                    </div>
                  );
                default:
                  return null;
              }
            })}
            </div>

            {/* === MOBILE LAYOUT: Bottom Tab Navigation === */}
            <div className="lg:hidden pb-20">
              {/* Mobile Tab Content */}
              {mobileTab === 'radar' && (
                <div>
                  <div className="mb-3">
                    {viewMode === 'map' && (
                      <StormMap
                        location={location}
                        storms={storms || []}
                        radarRange={radarRange}
                        useMetric={useMetric}
                        formatDistance={formatDistance}
                        formatSpeed={formatSpeed}
                        stormFilters={stormFilters}
                        onRadarSourceChange={setCurrentRadarSource}
                        radarSource={currentRadarSource}
                        isDisabled={showStormFilteringSettings || showAlertSubscription}
                        alertPreferences={preferences}
                        showAllStormTracks={showStormTracks}
                        showTimeLabels={showTimeLabels}
                        onMapInstanceReady={setMapInstance}
                        showLightning={showLightning}
                      />
                    )}
                    {viewMode === 'sonar' && (
                      <SonarRadar
                        location={location}
                        storms={precipitationStorms}
                        radarRange={radarRange}
                        formatDistance={formatDistance}
                        useMetric={useMetric}
                        onStormClick={(storm) => {
                          console.log('Storm clicked in sonar:', storm);
                        }}
                        className=""
                        showLightning={showLightning}
                      />
                    )}
                    {viewMode === '3d' && (
                      <Simple3DCanvas 
                        location={location} 
                        precipitationStorms={precipitationStorms}
                        setViewMode={setViewMode}
                        tickerMessages={tickerMessages}
                        showLightning={showLightning}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      onClick={() => setViewMode('map')}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${viewMode === 'map' ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-800/50 border-slate-600 text-slate-300'}`}
                    >
                      🗺️ {t.map}
                    </Button>
                    <Button
                      onClick={() => setViewMode('sonar')}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${viewMode === 'sonar' ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-slate-800/50 border-slate-600 text-slate-300'}`}
                    >
                      📡 {t.sonar}
                    </Button>
                    <Button
                      onClick={() => setViewMode('3d')}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${viewMode === '3d' ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-slate-800/50 border-slate-600 text-slate-300'}`}
                      disabled={!storms || storms.length === 0}
                    >
                      🌩️ {t.threeD}
                    </Button>
                    <Button
                      onClick={() => setShowStormTracks(!showStormTracks)}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${showStormTracks ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-800/50 border-slate-600 text-slate-300'}`}
                    >
                      🎯 {showStormTracks ? t.hideTracks : t.showTracks}
                    </Button>
                    <Button
                      onClick={() => setShowTimeLabels(!showTimeLabels)}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${showTimeLabels ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-800/50 border-slate-600 text-slate-300'}`}
                      disabled={!showStormTracks}
                    >
                      🕐 {showTimeLabels ? t.hideTimeLabels : t.showTimeLabels}
                    </Button>
                    <Button
                      onClick={() => setShowStormFilteringSettings(true)}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      ⚙️ {t.settings}
                    </Button>
                  </div>
                  {filteredStorms.length > 0 && (
                    <div className="mt-3 bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{t.detected}: <span className="text-white font-medium">{filteredStorms.length}</span></span>
                        <span>{t.closest}: <span className="text-white font-medium">
                          {formatDistance([...filteredStorms].sort((a, b) => a.distance - b.distance)[0].distance)}
                        </span></span>
                        <span>{t.source}: <span className="text-white font-medium">{currentRadarSource === 'nexrad' ? 'NEXRAD' : 'RainViewer'}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mobileTab === 'weather' && (
                <WeatherDashboard
                  lat={location.lat}
                  lon={location.lon}
                  useMetric={useMetric}
                  locationName={location.name}
                />
              )}

              {mobileTab === 'storms' && (
                <div className="space-y-4">
                  {filteredStorms.length > 0 && (
                    <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                      <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
                        ⚡ {t.stormSummary}
                      </h3>
                      <div className="grid grid-cols-1 gap-3">
                        {(() => {
                          const closestStorm = [...filteredStorms].sort((a, b) => a.distance - b.distance)[0];
                          const impact = getStormImpact(closestStorm);
                          return (
                            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="text-blue-400">🎯</div>
                                <span className="text-sm font-medium text-slate-300">{t.closestStorm}</span>
                              </div>
                              <div className="text-white font-semibold">
                                {getCompassDirection(closestStorm.direction)} ({closestStorm.direction.toFixed(0).padStart(3, '0')}°) @ {formatDistance(closestStorm.distance)}
                              </div>
                              <div className="text-xs text-slate-400 mb-1">
                                {closestStorm.intensity}dBZ • {getStormCategory(closestStorm.intensity)}
                              </div>
                              {closestStorm.windsPrediction && (
                                <div className="text-xs text-slate-300 space-y-1">
                                  <div>{t.movement}: {getCompassDirection(impact.movementDir)} ({impact.movementDir.toFixed(0).padStart(3, '0')}°) @ {formatSpeed(impact.movementSpeed)}</div>
                                  <div className="flex justify-between">
                                    <span>{t.impact}: <span className={impact.impactColor}>{impact.impactChance}</span></span>
                                    <span>{t.eta}: {impact.eta}</span>
                                  </div>
                                  <div>{t.severity}: <span className={impact.severityColor}>{impact.severity}</span></div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {(() => {
                          const strongestStorm = [...filteredStorms].sort((a, b) => b.intensity - a.intensity)[0];
                          const impact = getStormImpact(strongestStorm);
                          return (
                            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="text-red-400">⚡</div>
                                <span className="text-sm font-medium text-slate-300">{t.strongestStorm}</span>
                              </div>
                              <div className="text-white font-semibold">
                                {strongestStorm.intensity}dBZ
                              </div>
                              <div className="text-xs text-slate-400 mb-1">
                                {getCompassDirection(strongestStorm.direction)} ({strongestStorm.direction.toFixed(0).padStart(3, '0')}°) @ {formatDistance(strongestStorm.distance)} • {getStormCategory(strongestStorm.intensity)}
                              </div>
                              {strongestStorm.windsPrediction && (
                                <div className="text-xs text-slate-300 space-y-1">
                                  <div>{t.movement}: {getCompassDirection(impact.movementDir)} ({impact.movementDir.toFixed(0).padStart(3, '0')}°) @ {formatSpeed(impact.movementSpeed)}</div>
                                  <div className="flex justify-between">
                                    <span>{t.impact}: <span className={impact.impactColor}>{impact.impactChance}</span></span>
                                    <span>{t.eta}: {impact.eta}</span>
                                  </div>
                                  <div>{t.severity}: <span className={impact.severityColor}>{impact.severity}</span></div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                  <ImpactPanel 
                    storms={precipitationStorms}
                    userLocation={location ? { lat: location.lat, lon: location.lon } : null}
                    locationName={location?.name}
                    minimumDbz={(preferences as any)?.minimumDbz ?? 50}
                  />
                  <StormPanel
                    storms={precipitationStorms}
                    useMetric={useMetric}
                    formatDistance={formatDistance}
                    formatSpeed={formatSpeed}
                    isLoading={stormDataLoading}
                    radarSource={currentRadarSource}
                    userLocation={location}
                    stormFilters={stormFilters}
                    alertPreferences={preferences}
                  />
                </div>
              )}

              {mobileTab === 'ai' && location && windsAloftData && (
                <AIWeatherAssistant
                  userLocation={{
                    lat: location.lat,
                    lon: location.lon,
                    address: location.name
                  }}
                  storms={precipitationStorms.map(storm => ({
                    id: storm.id,
                    lat: storm.lat,
                    lon: storm.lon,
                    intensity: storm.intensity,
                    distance: storm.distance,
                    direction: storm.direction,
                    bearing: storm.bearing || 0,
                    category: storm.intensity >= 61 ? 'Extreme' :
                             storm.intensity >= 55 ? 'Very Heavy' :
                             storm.intensity >= 46 ? 'Heavy' :
                             storm.intensity >= 35 ? 'Moderate' : 'Light',
                    movement: storm.windsPrediction ? {
                      direction: storm.windsPrediction.direction,
                      speed: storm.windsPrediction.speed,
                      eta: storm.impactAssessment?.eta,
                      impact: storm.impactAssessment?.impactChance
                    } : undefined
                  }))}
                  winds={windsAloftData.winds || []}
                  radarSource={currentRadarSource === 'nexrad' ? 'NEXRAD' : 'RainViewer'}
                  lightningCount={0}
                  useMetric={useMetric}
                />
              )}

              {mobileTab === 'alerts' && (
                <ImmediateSafetyAlerts
                  location={location}
                  storms={filteredStorms}
                  isLoading={stormDataLoading}
                  windsAloftData={windsAloftData}
                />
              )}
            </div>

            {/* === MOBILE BOTTOM TAB BAR === */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 border-t border-slate-700/50 flex justify-around items-center z-[999] backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {[
                { id: 'radar' as const, icon: '📡', label: t.radar },
                { id: 'weather' as const, icon: '🌤️', label: t.weather },
                { id: 'storms' as const, icon: '🌩️', label: t.storms },
                { id: 'ai' as const, icon: '🤖', label: 'AI' },
                { id: 'alerts' as const, icon: '🚨', label: t.alerts },
              ].map(tab => {
                const isActive = mobileTab === tab.id;
                const alertCount = tab.id === 'alerts' ? filteredStorms.filter(s => s.intensity >= 45).length : 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMobileTab(tab.id)}
                    className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors relative ${
                      isActive 
                        ? 'text-blue-400' 
                        : 'text-slate-500 active:text-slate-300'
                    }`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span className="text-xl leading-none">{tab.icon}</span>
                    <span className={`text-[10px] font-medium leading-tight ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>{tab.label}</span>
                    {tab.id === 'alerts' && alertCount > 0 && (
                      <span className="absolute -top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                        {alertCount > 9 ? '9+' : alertCount}
                      </span>
                    )}
                    {tab.id === 'storms' && filteredStorms.length > 0 && (
                      <span className="absolute -top-0.5 right-0.5 min-w-[16px] h-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                        {filteredStorms.length > 9 ? '9+' : filteredStorms.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

          </>
        )}
      </div>
    </div>
  );
}