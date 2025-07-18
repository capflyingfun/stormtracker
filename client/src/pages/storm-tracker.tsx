import { useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";
import { useStormData } from "@/hooks/use-storm-data";
import { useRiskAlerts } from "@/hooks/use-risk-alerts";
import Header from "@/components/header";
import LocationSetup from "@/components/location-setup";
import StormMap from "@/components/storm-map";
import StormPanel from "@/components/storm-panel";
import AlertsPanel from "@/components/alerts-panel";
import Simple3DCanvas from "@/components/simple-3d-canvas";
import RiskAlertNotification from "@/components/risk-alert-notification";
import AlertSettings from "@/components/alert-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StormTracker() {
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(true); // Auto-enable tracking when location is set
  const radarRange = 30; // Fixed at 30 miles
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [show3D, setShow3D] = useState(false);
  
  // Storm filtering state - 5 meteorological categories (20-90 dBZ)
  const [stormFilters, setStormFilters] = useState({
    light: true,     // 20-34 dBZ (Light rain) - Green
    moderate: true,  // 35-45 dBZ (Moderate rain) - Yellow
    heavy: true,     // 46-54 dBZ (Heavy rain) - Orange
    veryHeavy: true, // 55-60 dBZ (Very heavy rain/hail) - Red
    extreme: true,   // 61+ dBZ (Extreme thunderstorms) - Purple
  });
  
  const [currentRadarSource, setCurrentRadarSource] = useState<'rainviewer' | 'nexrad'>('rainviewer');
  
  // State for precipitation-based storm data
  const [precipitationStorms, setPrecipitationStorms] = useState<any[]>([]);
  const [lightningCount, setLightningCount] = useState(0);
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  
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

  // Initialize risk alert system
  const {
    currentAlert,
    isAlertVisible,
    preferences,
    assessRisk,
    showAlert,
    dismissAlert,
  } = useRiskAlerts();
  
  // Always use precipitation storms (real radar data) instead of API storms
  // This ensures we only show storms that are actually detected in the radar imagery
  const activeStorms = precipitationStorms;
  
  // Filter storms based on intensity (5-category system)
  const filteredStorms = activeStorms.filter(storm => {
    const category = storm.intensity >= 61 ? 'extreme' :    // Extreme thunderstorms
                    storm.intensity >= 55 ? 'veryHeavy' :  // Very heavy rain/hail
                    storm.intensity >= 46 ? 'heavy' :      // Heavy rain
                    storm.intensity >= 35 ? 'moderate' :   // Moderate rain
                    'light';                               // Light rain (20-34 dBZ)
    return stormFilters[category as keyof typeof stormFilters];
  });

  // Listen for precipitation storm data from the map component
  useEffect(() => {
    const handlePrecipitationStormData = (event: any) => {
      setPrecipitationStorms(event.detail || []);
    };

    window.addEventListener('precipitationStormData', handlePrecipitationStormData);
    
    return () => {
      window.removeEventListener('precipitationStormData', handlePrecipitationStormData);
    };
  }, []);

  // Listen for lightning data updates from the map component
  useEffect(() => {
    const handleLightningData = (event: any) => {
      setLightningCount(event.detail?.count || 0);
    };

    window.addEventListener('lightningData', handleLightningData);
    
    return () => {
      window.removeEventListener('lightningData', handleLightningData);
    };
  }, []);

  // Listen for location updates with radar source recommendations
  useEffect(() => {
    const handleLocationWithRadarSource = (event: any) => {
      const locationData = event.detail;
      if (locationData?.recommendedRadarSource) {
        setCurrentRadarSource(locationData.recommendedRadarSource);
        console.log(`Auto-switched to ${locationData.recommendedRadarSource} for ${locationData.isUS ? 'US' : 'international'} location: ${locationData.name}`);
      }
    };

    window.addEventListener('locationWithRadarSource', handleLocationWithRadarSource);
    
    return () => {
      window.removeEventListener('locationWithRadarSource', handleLocationWithRadarSource);
    };
  }, []);

  // Risk assessment and alert generation
  useEffect(() => {
    const performRiskAssessment = async () => {
      // Always perform risk assessment to clear false alerts when no storms detected
      if (!location || !preferences) {
        return;
      }

      try {
        console.log(`Assessing risk for ${precipitationStorms.length} precipitation-detected storms (not synthetic API data)`);
        const riskData = await assessRisk(location, precipitationStorms, lightningCount);
        if (riskData && riskData.shouldAlert) {
          console.log('Risk alert triggered:', riskData.title);
          showAlert(riskData);
        } else if (precipitationStorms.length === 0) {
          console.log('No precipitation storms detected - clearing any existing alerts');
          dismissAlert(); // Clear any existing alerts when no real storms are found
        }
      } catch (error) {
        console.error('Risk assessment failed:', error);
      }
    };

    // Perform risk assessment when storms or location change
    if (location && preferences) {
      performRiskAssessment();
    }
  }, [location, precipitationStorms, lightningCount, preferences, assessRisk, showAlert, dismissAlert]);

  // Handle alert settings save
  const handleAlertSettingsSave = async (newPreferences: any) => {
    try {
      await fetch('/api/alerts/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPreferences)
      });
      // Force refresh preferences
      window.location.reload();
    } catch (error) {
      console.error('Failed to save alert preferences:', error);
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

  // Auto-refresh when tracking is enabled
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isTracking && location) {
      interval = setInterval(() => {
        refetchStormData();
        setLastUpdate(new Date());
      }, 5 * 60 * 1000); // 5 minutes
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
      await setLocationFromGPS();
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
    // Set location directly without another API call
    setLocationDirectly({
      lat: selectedLocation.lat,
      lon: selectedLocation.lon,
      name: selectedLocation.name,
    });
    
    // Automatically switch radar source based on location
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
    clearLocation(); // This will trigger location setup to show
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
      
      {/* Risk Alert Notification */}
      <RiskAlertNotification
        alert={currentAlert}
        isVisible={isAlertVisible}
        onDismiss={dismissAlert}
        onOpenSettings={() => setShowAlertSettings(true)}
      />

      {/* Alert Settings Modal */}
      {preferences && (
        <AlertSettings
          isOpen={showAlertSettings}
          onClose={() => setShowAlertSettings(false)}
          preferences={preferences}
          onSave={handleAlertSettingsSave}
        />
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
                  <Button
                    onClick={() => setShowAlertSettings(true)}
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm"
                  >
                    🔔 Alert Settings
                  </Button>
                  <Button
                    onClick={resetLocation}
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm"
                  >
                    📍 Change Location
                  </Button>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for city, state, or address..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.target as HTMLInputElement;
                        handleLocationSearch(target.value);
                        target.value = '';
                      }
                    }}
                    className="bg-slate-700/50 border-slate-600 flex-1"
                    id="location-search-input"
                  />
                  <Button
                    onClick={() => {
                      const input = document.getElementById('location-search-input') as HTMLInputElement;
                      if (input && input.value.trim()) {
                        handleLocationSearch(input.value);
                        input.value = '';
                      }
                    }}
                    size="sm"
                    className="bg-green-600 hover:bg-green-500 px-3"
                  >
                    🔍
                  </Button>
                </div>
              </div>

              {lastUpdate && (
                <div className="text-xs sm:text-sm text-slate-400">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>

            {/* Interactive Radar Map - Hidden when 3D is active or settings are open */}
            {!show3D && (
              <StormMap
                location={location}
                storms={storms || []}
                radarRange={radarRange}
                useMetric={useMetric}
                formatDistance={formatDistance}
                formatSpeed={formatSpeed}
                stormFilters={stormFilters}
                onStormFiltersChange={setStormFilters}
                onRadarSourceChange={setCurrentRadarSource}
                radarSource={currentRadarSource}
                isDisabled={showAlertSettings}
              />
            )}

            {/* 3D Toggle Button - Between radar and storm panels */}
            {!show3D && (
              <div className="flex justify-center my-4 sm:my-6">
                <Button
                  onClick={() => setShow3D(true)}
                  variant="outline"
                  size="sm"
                  className="bg-purple-600/20 border-purple-500 hover:bg-purple-600/30"
                  disabled={!storms || storms.length === 0}
                >
                  {!storms || storms.length === 0 ? (
                    <>⏳ Loading Storm Data...</>
                  ) : (
                    <>🌩️ View 3D Terrain</>
                  )}
                </Button>
              </div>
            )}

            {/* Storm Data Grid - Moved below radar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mt-4 sm:mt-6">
              <StormPanel
                storms={precipitationStorms}
                useMetric={useMetric}
                formatDistance={formatDistance}
                formatSpeed={formatSpeed}
                isLoading={stormDataLoading}
                radarSource={currentRadarSource}
                stormFilters={stormFilters}
              />
              
              <AlertsPanel
                alerts={alerts || []}
                isLoading={stormDataLoading}
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
