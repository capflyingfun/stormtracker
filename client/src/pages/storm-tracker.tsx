import { useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";
import { useStormData } from "@/hooks/use-storm-data";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Header from "@/components/header";
import LocationSetup from "@/components/location-setup";
import StormMap from "@/components/storm-map";
import StormPanel from "@/components/storm-panel";
import ImmediateSafetyAlerts from "@/components/immediate-safety-alerts";
import Simple3DCanvas from "@/components/simple-3d-canvas";
import AlertSettings from "@/components/alert-settings";
import AlertSubscription from "@/components/alert-subscription";
import { convertTimezonesInText, getTimezoneFromCoordinates } from "@/components/immediate-safety-alerts";

// import { ThreatMonitor } from "@/components/threat-monitor"; // Consolidated into AI Weather Assistant

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIWeatherAssistant from "@/components/ai-weather-assistant";

// Weather Story Component for Modal
function WeatherStoryInline({ storms, userLocation }: { storms: any[], userLocation: any }) {
  // Fetch weather story data
  const { data: weatherStoryData } = useQuery({
    queryKey: ['/api/weather-story-data', userLocation?.lat, userLocation?.lon],
    queryFn: async () => {
      const response = await fetch(`/api/weather-story-data?lat=${userLocation?.lat}&lon=${userLocation?.lon}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    },
    enabled: !!userLocation?.lat && !!userLocation?.lon,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 15 * 60 * 1000, // Refresh every 15 minutes
  });

  const getDirectionName = (degrees: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  const generateStormStory = (sortedStorms: any[], weatherData?: any): string => {
    if (!sortedStorms || sortedStorms.length === 0) {
      return "🌤️ Clear skies ahead! No active storms detected in your area. It's a perfect time to enjoy the peaceful weather.";
    }

    // Get closest and strongest storms
    const closestStorm = [...sortedStorms].sort((a, b) => a.distance - b.distance)[0];
    const strongestStorm = [...sortedStorms].sort((a, b) => b.intensity - a.intensity)[0];
    
    let story = '';
    
    const getStormPersonality = (intensity: number) => {
      if (intensity >= 61) return { emoji: '🌪️💀', personality: 'dangerous monster storm', description: 'raging with extreme fury', educationalNote: '61+ dBZ indicates extreme thunderstorms with large hail and destructive winds' };
      if (intensity >= 55) return { emoji: '⛈️🔥', personality: 'severe thunderstorm', description: 'crackling with intense energy', educationalNote: '55+ dBZ can produce quarter-size hail and damaging winds' };
      if (intensity >= 46) return { emoji: '🌧️⚡', personality: 'heavy rain shower', description: 'pouring steadily with occasional rumbles', educationalNote: '46-54 dBZ produces heavy rainfall that can cause localized flooding' };
      if (intensity >= 35) return { emoji: '🌦️☔', personality: 'moderate rain', description: 'pattering gently but persistently', educationalNote: '35-45 dBZ creates moderate rainfall suitable for watering gardens' };
      return { emoji: '🌤️💧', personality: 'gentle sprinkle', description: 'quietly misting the area', educationalNote: '20-34 dBZ produces light rain or drizzle' };
    };

    // Closest storm analysis
    const closestPersonality = getStormPersonality(closestStorm.intensity);
    const directionName = getDirectionName(closestStorm.direction || 0);
    const distance = closestStorm.distance?.toFixed(1) || 'unknown';
    
    story += `${closestPersonality.emoji} The nearest storm is a ${closestPersonality.personality} ${closestPersonality.description} ${directionName} at ${distance} miles away`;
    
    // Movement context if available
    if (closestStorm.windsPrediction && closestStorm.windsPrediction.speed > 0) {
      const movementDir = getDirectionName(closestStorm.windsPrediction.direction || 0);
      story += `, moving ${movementDir} at ${closestStorm.windsPrediction.speed} mph`;
    }
    story += '. ';
    
    // Strongest storm information (if different from closest)
    if (strongestStorm.id !== closestStorm.id) {
      const strongestPersonality = getStormPersonality(strongestStorm.intensity);
      const strongestDirection = getDirectionName(strongestStorm.direction || 0);
      const strongestDistance = strongestStorm.distance?.toFixed(1) || 'unknown';
      story += `The strongest storm in the area is ${strongestPersonality.emoji} ${strongestPersonality.personality} with ${strongestStorm.intensity} dBZ intensity ${strongestDirection} at ${strongestDistance} miles away. `;
    }
    
    // Educational component
    if (closestStorm) {
      const personality = getStormPersonality(closestStorm.intensity);
      story += `\n\n💡 ${personality.educationalNote}.`;
    }
    
    // Weather forecast section
    if (weatherData?.forecast && weatherData.forecast.periods && weatherData.forecast.periods.length > 0) {
      const todayForecast = weatherData.forecast.periods[0];
      const tonightForecast = weatherData.forecast.periods.length > 1 ? weatherData.forecast.periods[1] : null;
      
      // Extract key forecast details
      const todayTemp = todayForecast.temperature ? `${todayForecast.temperature}°F` : '';
      const todayWind = todayForecast.windSpeed && todayForecast.windDirection ? 
        `winds ${todayForecast.windDirection} @ ${todayForecast.windSpeed.toLowerCase()}` : '';
      
      // Extract precipitation chance from multiple sources
      let precipChance = '';
      
      // First, try probabilityOfPrecipitation field
      if (todayForecast.probabilityOfPrecipitation?.value) {
        precipChance = `${todayForecast.probabilityOfPrecipitation.value}% chance of rain`;
      }
      // Second, try extracting from shortForecast
      else if (todayForecast.shortForecast) {
        const shortMatch = todayForecast.shortForecast.match(/(\d+)\s*%/);
        if (shortMatch) {
          precipChance = `${shortMatch[1]}% chance of rain`;
        }
      }
      // Third, try extracting from detailedForecast
      else if (todayForecast.detailedForecast) {
        const precipMatch = todayForecast.detailedForecast.match(/(\d+)\s*percent/i);
        if (precipMatch) {
          precipChance = `${precipMatch[1]}% chance of rain`;
        }
      }
      
      story += `\n\n🌤️ Today: ${todayForecast.name || 'Today'} - ${todayForecast.shortForecast || 'Conditions updating'}`;
      
      // Add temperature, precipitation, and wind info
      const details = [todayTemp, precipChance, todayWind].filter(Boolean);
      if (details.length > 0) {
        story += ` with ${details.join(', ')}`;
      }
      
      // Add detailed forecast if available
      if (todayForecast.detailedForecast) {
        story += `\n${todayForecast.detailedForecast}`;
      }
      
      // Tonight's forecast
      if (tonightForecast) {
        const tonightTemp = tonightForecast.temperature ? `low ${tonightForecast.temperature}°F` : '';
        const tonightWind = tonightForecast.windSpeed && tonightForecast.windDirection ? 
          `winds ${tonightForecast.windDirection} @ ${tonightForecast.windSpeed.toLowerCase()}` : '';
        
        story += `\n\n🌙 ${tonightForecast.name || 'Tonight'}: ${tonightForecast.shortForecast || 'Conditions updating'}`;
        
        const tonightDetails = [tonightTemp, tonightWind].filter(Boolean);
        if (tonightDetails.length > 0) {
          story += ` with ${tonightDetails.join(', ')}`;
        }
        
        if (tonightForecast.detailedForecast) {
          story += `\n${tonightForecast.detailedForecast}`;
        }
      }
      
      // Extended forecast if available
      if (weatherData.forecast.periods.length > 2) {
        story += '\n\n📅 Extended Forecast:';
        for (let i = 2; i < Math.min(6, weatherData.forecast.periods.length); i++) {
          const period = weatherData.forecast.periods[i];
          const temp = period.temperature ? `${period.temperature}°F` : '';
          story += `\n${period.name}: ${period.shortForecast}${temp ? ` - ${temp}` : ''}`;
        }
      }
    }
    
    // Current conditions section
    if (weatherData?.conditions) {
      const weather = weatherData;
      const conditionsParts = [];
      
      if (weather.conditions?.temperature && weather.conditions.temperature !== 'Unknown') {
        conditionsParts.push(`${Math.round(weather.conditions.temperature)}°F`);
      }
      if (weather.conditions?.humidity && weather.conditions.humidity !== 'Unknown') {
        conditionsParts.push(`${weather.conditions.humidity}% humidity`);
      }
      if (weather.conditions?.windSpeed && weather.conditions.windDirection) {
        const windDir = getDirectionName(weather.conditions.windDirection);
        conditionsParts.push(`winds ${windDir} @ ${Math.round(weather.conditions.windSpeed)} mph`);
      }
      if (weather.conditions?.pressure) {
        conditionsParts.push(`${weather.conditions.pressure} inHg pressure`);
      }
      if (weather.conditions?.visibility) {
        conditionsParts.push(`${weather.conditions.visibility} mi visibility`);
      }
      if (weather.conditions?.cloudCover !== undefined) {
        conditionsParts.push(`${weather.conditions.cloudCover}% clouds`);
      }
      
      if (conditionsParts.length > 0) {
        story += `\n\n🌡️ Current conditions: ${conditionsParts.join(', ')}`;
      }
    }
    
    // Aviation weather section
    if (weatherData?.aviation && weatherData.aviation.airports && weatherData.aviation.airports.length > 0) {
      story += '\n\n✈️ Nearby Airport Weather:';
      weatherData.aviation.airports.slice(0, 3).forEach(airport => {
        if (airport.weather && airport.weather.temperature !== 'Unknown') {
          const airportData = [];
          if (airport.weather.temperature) airportData.push(`${Math.round(airport.weather.temperature)}°F`);
          if (airport.weather.windSpeed && airport.weather.windDirection) {
            const windDir = getDirectionName(airport.weather.windDirection);
            airportData.push(`winds ${windDir} @ ${Math.round(airport.weather.windSpeed)} mph`);
          }
          if (airport.weather.visibility) airportData.push(`${airport.weather.visibility} mi vis`);
          
          if (airportData.length > 0) {
            story += `\n${airport.code} (${airport.distance?.toFixed(1)}mi): ${airportData.join(', ')}`;
          }
        }
      });
    }
    
    // Heat index warning
    if (weatherData?.conditions?.temperature && weatherData.conditions.temperature > 90 && weatherData?.conditions?.humidity && weatherData.conditions.humidity > 60) {
      const heatIndex = Math.round(weatherData.conditions.temperature + ((weatherData.conditions.humidity / 100) * 15));
      if (heatIndex > 105) {
        story += `\n\n🔥 Heat Advisory: Heat index around ${heatIndex}°F - dangerous heat conditions. Stay hydrated and avoid prolonged outdoor exposure.`;
      }
    }
    
    // Special weather alerts and warnings
    if (weatherData?.alerts && weatherData.alerts.length > 0) {
      story += '\n\n🚨 Active Weather Alerts:';
      weatherData.alerts.slice(0, 3).forEach(alert => {
        const severity = alert.severity === 'Extreme' ? '🔴' : 
                        alert.severity === 'Severe' ? '🟠' : 
                        alert.severity === 'Moderate' ? '🟡' : '🔵';
        
        // Use headline as primary source since event field can be null
        const headline = alert.headline || alert.description || 'Weather alert in effect';
        const alertType = alert.event || (headline.includes('Tsunami') ? 'Tsunami Warning' : 
                                           headline.includes('Heat') ? 'Heat Advisory' : 'Weather Alert');
        
        // Convert timezone in headline and format alert for display
        const convertedHeadline = convertTimezonesInText(headline, getTimezoneFromCoordinates(userLocation?.lat || 30.5, userLocation?.lon || -87.4));
        let alertText = `${severity} ${convertedHeadline}`;
        
        story += `\n${alertText}`;
      });
    }
    
    return story;
  };

  return (
    <div>
      {generateStormStory(storms, weatherStoryData)}
    </div>
  );
}

// Embedded Message Inbox Component for Modal
function EmbeddedMessageInbox() {
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const queryClient = useQueryClient();

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
    return <div className="text-slate-300">Loading messages...</div>;
  }

  if (messages.length === 0) {
    return (
      <div className="text-center text-slate-300 py-8">
        <div className="text-4xl mb-4">📧</div>
        <h3 className="text-lg font-semibold mb-2">No Messages Yet</h3>
        <p className="text-slate-400">Storm alert messages will appear here when conditions meet your alert criteria.</p>
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
            ← Back to Messages
          </Button>
          <Button
            onClick={() => deleteMessageMutation.mutate(selectedMessage.id)}
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300"
            disabled={deleteMessageMutation.isPending}
          >
            🗑️ Delete
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
          Total Messages: <span className="font-semibold">{messages.length}</span>
          {" • "}
          Unread: <span className="font-semibold text-blue-400">{messages.filter((m: any) => !m.isRead).length}</span>
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
          
          <p className="text-slate-400 text-sm mb-2">To: {message.recipientEmail}</p>
          
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
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(true);
  const radarRange = 50;
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [show3D, setShow3D] = useState(false);
  
  const [stormFilters, setStormFilters] = useState({
    light: true,
    moderate: true,
    heavy: true,
    veryHeavy: true,
    extreme: true,
  });
  
  const [currentRadarSource, setCurrentRadarSource] = useState<'rainviewer' | 'nexrad'>('rainviewer');
  const [showStormTracks, setShowStormTracks] = useState(false);
  const [showTimeLabels, setShowTimeLabels] = useState(true);
  const [precipitationStorms, setPrecipitationStorms] = useState<any[]>([]);
  const [showStormFilteringSettings, setShowStormFilteringSettings] = useState(false);
  const [showAlertSubscription, setShowAlertSubscription] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [windsData, setWindsData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'tracker' | 'alerts' | 'messages'>('tracker');


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
        const qualifyingStorms = newPrecipitationStorms.filter(storm => 
          storm.intensity >= preferences.minimumDbz
        );
        console.log(`Visual Alert System: Found ${qualifyingStorms.length} storms meeting ${preferences.minimumDbz}+ dBZ threshold for visual highlighting`);
      }
    };

    window.addEventListener('precipitationStormData', handlePrecipitationStormData);
    return () => {
      window.removeEventListener('precipitationStormData', handlePrecipitationStormData);
    };
  }, [location, preferences]);



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

  const handleLocationSearch = async (query: string) => {
    try {
      await setLocationFromSearch(query);
      if (isTracking) {
        refetchStormData();
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Location search failed:", error);
    }
  };

  const handleGPSLocation = async () => {
    try {
      const result = await setLocationFromGPS();
      // Auto-switch to NEXRAD for US GPS locations
      if (result && (result.isUS || result.recommendedRadarSource === 'nexrad')) {
        setCurrentRadarSource('nexrad');
        console.log('Auto-switched to NEXRAD for US GPS location:', result.name);
      }
      if (isTracking) {
        refetchStormData();
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("GPS location failed:", error);
    }
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
          preferences={preferences}
          onSave={handleStormFilteringSettingsSave}
        />
      )}

      {/* Alert Subscription Modal */}
      {showAlertSubscription && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Storm Alert Notifications</h2>
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
              <h2 className="text-lg font-semibold text-white">Storm Alert Messages</h2>
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
                    <p className="text-slate-300 text-sm sm:text-base">
                      Detection Radius: {formatDistance(30)} (Fixed)
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
                    📍 Change Location
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

              <div className="mb-3">
                <Input
                  placeholder="Search for city, state, or address..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const target = e.target as HTMLInputElement;
                      handleLocationSearch(target.value);
                      target.value = '';
                    }
                  }}
                  className="bg-slate-700/50 border-slate-600 w-full"
                  id="location-search-input"
                />
              </div>

              {lastUpdate && (
                <p className="text-slate-400 text-xs sm:text-sm">
                  Last update: {lastUpdate.toLocaleTimeString()}
                </p>
              )}
            </div>

            {/* Immediate Safety Alerts */}
            <ImmediateSafetyAlerts 
              location={location}
              storms={filteredStorms}
              isLoading={stormDataLoading}
            />

            {/* Storm Summary Section */}
            {filteredStorms.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-3 sm:p-6 border border-slate-700/50 mb-4 sm:mb-6">
                <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
                  ⚡ Storm Summary
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Closest Storm */}
                  {(() => {
                    const closestStorm = [...filteredStorms].sort((a, b) => a.distance - b.distance)[0];
                    const getDirectionName = (degrees: number): string => {
                      const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
                      const index = Math.round(degrees / 22.5) % 16;
                      return directions[index];
                    };
                    
                    // Calculate impact assessment
                    const calculateImpactAssessment = (storm: any) => {
                      if (!storm.windsPrediction) return { severity: 'Low', eta: 'No data', impactChance: 'Low' };
                      
                      const movementSpeed = storm.windsPrediction.speed || 0;
                      const stormDirection = storm.windsPrediction.direction || 0;
                      const stormDistance = storm.distance;
                      
                      // Calculate bearing from user to storm
                      const bearingToStorm = storm.direction;
                      
                      // Calculate if storm is moving toward user (within 30° cone)
                      // Storm moves toward user if its movement direction points toward user location
                      const directionToUser = (bearingToStorm + 180) % 360; // Reverse bearing (storm to user)
                      const directionDifference = Math.abs(((stormDirection - directionToUser + 180) % 360) - 180);
                      const isApproaching = directionDifference <= 30;
                      
                      // Calculate ETA if approaching
                      let eta = 'Not approaching';
                      let impactChance = 'Low';
                      
                      if (isApproaching && movementSpeed > 0) {
                        const etaHours = stormDistance / movementSpeed;
                        if (etaHours <= 24) {
                          eta = etaHours < 1 ? `${Math.round(etaHours * 60)}min` : `${etaHours.toFixed(1)}hr`;
                          impactChance = directionDifference <= 15 ? 'High' : 'Medium';
                        }
                      }
                      
                      // Severity based on intensity and proximity
                      let severity = 'Low';
                      if (storm.intensity >= 55 && stormDistance <= 10) severity = 'High';
                      else if (storm.intensity >= 45 && stormDistance <= 15) severity = 'Medium';
                      else if (storm.intensity >= 35 && stormDistance <= 20) severity = 'Medium';
                      
                      return { severity, eta, impactChance, movementSpeed, stormDirection };
                    };
                    
                    const direction = getDirectionName(closestStorm.direction);
                    const formattedBearing = closestStorm.direction.toFixed(0).padStart(3, '0');
                    const impact = calculateImpactAssessment(closestStorm);
                    
                    return (
                      <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-blue-400">🎯</div>
                          <span className="text-sm font-medium text-slate-300">Closest Storm</span>
                        </div>
                        <div className="text-white font-semibold">
                          {direction} ({formattedBearing}°) @ {formatDistance(closestStorm.distance)}
                        </div>
                        <div className="text-xs text-slate-400 mb-1">
                          {closestStorm.intensity}dBZ • {closestStorm.intensity >= 61 ? 'Extreme' :
                           closestStorm.intensity >= 55 ? 'Very Heavy' :
                           closestStorm.intensity >= 46 ? 'Heavy' :
                           closestStorm.intensity >= 35 ? 'Moderate' : 'Light'}
                        </div>
                        {closestStorm.windsPrediction && (
                          <div className="text-xs text-slate-300 space-y-1">
                            <div>Movement: {getDirectionName(impact.stormDirection)} @ {formatSpeed(impact.movementSpeed)}</div>
                            <div className="flex justify-between">
                              <span>Impact: <span className={`${impact.impactChance === 'High' ? 'text-red-400' : impact.impactChance === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>{impact.impactChance}</span></span>
                              <span>ETA: {impact.eta}</span>
                            </div>
                            <div>Severity: <span className={`${impact.severity === 'High' ? 'text-red-400' : impact.severity === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>{impact.severity}</span></div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  {/* Strongest Storm */}
                  {(() => {
                    const strongestStorm = [...filteredStorms].sort((a, b) => b.intensity - a.intensity)[0];
                    const getDirectionName = (degrees: number): string => {
                      const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
                      const index = Math.round(degrees / 22.5) % 16;
                      return directions[index];
                    };
                    
                    // Calculate impact assessment for strongest storm (intensity-based severity)
                    const calculateImpactAssessment = (storm: any) => {
                      if (!storm.windsPrediction) return { severity: 'Low', eta: 'No data', impactChance: 'Low' };
                      
                      const movementSpeed = storm.windsPrediction.speed || 0;
                      const stormDirection = storm.windsPrediction.direction || 0;
                      const stormDistance = storm.distance;
                      
                      // Calculate bearing from user to storm
                      const bearingToStorm = storm.direction;
                      
                      // Calculate if storm is moving toward user (within 30° cone)
                      // Storm moves toward user if its movement direction points toward user location
                      const directionToUser = (bearingToStorm + 180) % 360; // Reverse bearing (storm to user)
                      const directionDifference = Math.abs(((stormDirection - directionToUser + 180) % 360) - 180);
                      const isApproaching = directionDifference <= 30;
                      
                      // Calculate ETA if approaching
                      let eta = 'Not approaching';
                      let impactChance = 'Low';
                      
                      if (isApproaching && movementSpeed > 0) {
                        const etaHours = stormDistance / movementSpeed;
                        if (etaHours <= 24) {
                          eta = etaHours < 1 ? `${Math.round(etaHours * 60)}min` : `${etaHours.toFixed(1)}hr`;
                          impactChance = directionDifference <= 15 ? 'High' : 'Medium';
                        }
                      }
                      
                      // Severity based primarily on intensity (for strongest storm)
                      let severity = 'Low';
                      if (storm.intensity >= 61) severity = 'Extreme';
                      else if (storm.intensity >= 55) severity = 'High';
                      else if (storm.intensity >= 45) severity = 'Medium';
                      else if (storm.intensity >= 35) severity = 'Medium';
                      else if (storm.intensity >= 20) severity = 'Low';
                      
                      return { severity, eta, impactChance, movementSpeed, stormDirection };
                    };
                    
                    const direction = getDirectionName(strongestStorm.direction);
                    const formattedBearing = strongestStorm.direction.toFixed(0).padStart(3, '0');
                    const impact = calculateImpactAssessment(strongestStorm);
                    
                    return (
                      <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-red-400">⚡</div>
                          <span className="text-sm font-medium text-slate-300">Strongest Storm</span>
                        </div>
                        <div className="text-white font-semibold">
                          {strongestStorm.intensity}dBZ
                        </div>
                        <div className="text-xs text-slate-400 mb-1">
                          {direction} ({formattedBearing}°) @ {formatDistance(strongestStorm.distance)} • {strongestStorm.intensity >= 61 ? 'Extreme' :
                           strongestStorm.intensity >= 55 ? 'Very Heavy' :
                           strongestStorm.intensity >= 46 ? 'Heavy' :
                           strongestStorm.intensity >= 35 ? 'Moderate' : 'Light'}
                        </div>
                        {strongestStorm.windsPrediction && (
                          <div className="text-xs text-slate-300 space-y-1">
                            <div>Movement: {getDirectionName(impact.stormDirection)} @ {formatSpeed(impact.movementSpeed)}</div>
                            <div className="flex justify-between">
                              <span>Impact: <span className={`${impact.impactChance === 'High' ? 'text-red-400' : impact.impactChance === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>{impact.impactChance}</span></span>
                              <span>ETA: {impact.eta}</span>
                            </div>
                            <div>Severity: <span className={`${impact.severity === 'High' ? 'text-red-400' : impact.severity === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>{impact.severity}</span></div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Weather Story Modal */}
            {location && precipitationStorms && (
              <div className="mb-4 sm:mb-6 max-w-4xl mx-auto">
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-2xl">📖</div>
                    <h2 className="text-xl font-semibold">Weather Story</h2>
                  </div>
                  <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {/* Weather Story Content - Inline for now */}
                    <WeatherStoryInline 
                      storms={precipitationStorms} 
                      userLocation={location}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* AI Weather Assistant with Integrated Threat Monitoring */}
            {location && windsAloftData && (
              <div className="mb-4 sm:mb-6">
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
            )}

            {/* Auto-update indicator */}
            <div className="flex justify-center mb-4">
              <div className="text-xs text-emerald-400 bg-emerald-900/30 px-3 py-2 rounded-lg border border-emerald-700/50">
                ⚡ Auto-updates on map movement
              </div>
            </div>

            {/* Interactive Radar Map with Side Controls */}
            {!show3D && (
              <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                {/* Left Side Controls - Desktop Only */}
                <div className="hidden lg:flex lg:flex-col lg:w-48 space-y-3">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">Map Controls</h3>
                    <div className="space-y-2">
                      <Button
                        onClick={() => setShow3D(true)}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50"
                        disabled={!storms || storms.length === 0}
                      >
                        🌩️ 3D View
                      </Button>
                      <Button
                        onClick={() => setShowStormFilteringSettings(true)}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                      >
                        ⚙️ Settings
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">Storm Tracks</h3>
                    <p className="text-xs text-slate-400 mb-2">Movement projection cones</p>
                    <Button
                      onClick={() => setShowStormTracks(!showStormTracks)}
                      variant="outline"
                      size="sm"
                      className={`w-full text-xs mb-2 ${showStormTracks ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                    >
                      🎯 {showStormTracks ? 'Hide Tracks' : 'Show Tracks'}
                    </Button>
                    <Button
                      onClick={() => setShowTimeLabels(!showTimeLabels)}
                      variant="outline"
                      size="sm"
                      className={`w-full text-xs ${showTimeLabels ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                      disabled={!showStormTracks}
                    >
                      🕐 {showTimeLabels ? 'Hide Time Labels' : 'Show Time Labels'}
                    </Button>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">Radar Info</h3>
                    <div className="space-y-2 text-xs">
                      <div className="text-slate-400">
                        Source: <span className="text-white">{currentRadarSource === 'nexrad' ? 'NEXRAD' : 'RainViewer'}</span>
                      </div>
                      <div className="text-slate-400">
                        Range: <span className="text-white">{formatDistance(30)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Radar Map - 30% smaller */}
                <div className="flex-1 lg:max-w-[70%] mx-auto">
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
                  />
                </div>

                {/* Right Side Controls - Desktop Only */}
                <div className="hidden lg:flex lg:flex-col lg:w-64 space-y-3">

                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">Storm Stats</h3>
                    <div className="space-y-2 text-xs">
                      <div className="text-slate-400">
                        Detected: <span className="text-white">{filteredStorms.length}</span>
                      </div>
                      <div className="text-slate-400">
                        Closest: <span className="text-white">
                          {filteredStorms.length > 0 ? 
                            formatDistance([...filteredStorms].sort((a, b) => a.distance - b.distance)[0].distance) : 
                            'None'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">Quick Actions</h3>
                    <div className="space-y-2">
                      {/* Alerts and Messages temporarily disabled */}
                      {false && (
                        <>
                          <Button
                            onClick={() => setShowAlertSubscription(true)}
                            variant="outline"
                            size="sm"
                            className="w-full text-xs bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30"
                          >
                            🔔 Alerts
                          </Button>
                          <Button
                            onClick={() => setShowMessages(true)}
                            variant="outline"
                            size="sm"
                            className="w-full text-xs bg-green-600/20 border-green-500 text-green-300 hover:bg-green-600/30"
                          >
                            📧 Messages
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile Controls - Stacked Below Map */}
                <div className="lg:hidden flex flex-wrap gap-2 justify-center mt-4">
                  <Button
                    onClick={() => setShow3D(true)}
                    variant="outline"
                    size="sm"
                    className="bg-purple-600/20 border-purple-500 text-purple-300"
                    disabled={!storms || storms.length === 0}
                  >
                    🌩️ 3D View
                  </Button>
                  <Button
                    onClick={() => setShowStormTracks(!showStormTracks)}
                    variant="outline"
                    size="sm"
                    className={`${showStormTracks ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                  >
                    🎯 {showStormTracks ? 'Hide Tracks' : 'Show Tracks'}
                  </Button>
                  <Button
                    onClick={() => setShowTimeLabels(!showTimeLabels)}
                    variant="outline"
                    size="sm"
                    className={`${showTimeLabels ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
                    disabled={!showStormTracks}
                  >
                    🕐 {showTimeLabels ? 'Hide Time Labels' : 'Show Time Labels'}
                  </Button>
                  <Button
                    onClick={() => setShowStormFilteringSettings(true)}
                    variant="outline"
                    size="sm"
                  >
                    ⚙️ Settings
                  </Button>
                  {/* Alerts and Messages temporarily disabled */}
                  {false && (
                    <>
                      <Button
                        onClick={() => setShowAlertSubscription(true)}
                        variant="outline"
                        size="sm"
                        className="bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30"
                      >
                        🔔 Alerts
                      </Button>
                      <Button
                        onClick={() => setShowMessages(true)}
                        variant="outline"
                        size="sm"
                        className="bg-green-600/20 border-green-500 text-green-300 hover:bg-green-600/30"
                      >
                        📧 Messages
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}





            {/* Main Tracker Content - Always Show */}
            <div className="max-w-4xl mx-auto mt-4 sm:mt-6">
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


          </>
        )}
      </div>
      
      {/* 3D Storm Visualization */}
      {show3D && (
        <Simple3DCanvas 
          location={location} 
          precipitationStorms={precipitationStorms}
          onClose={() => setShow3D(false)}
        />
      )}
      

    </div>
  );
}