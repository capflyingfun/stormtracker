import { useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";
import { useStormData } from "@/hooks/use-storm-data";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/header";
import LocationSetup from "@/components/location-setup";
import StormMap from "@/components/storm-map";
import StormPanel from "@/components/storm-panel";
import AlertsPanel from "@/components/alerts-panel";
import Simple3DCanvas from "@/components/simple-3d-canvas";
import AlertSettings from "@/components/alert-settings";
import AlertSubscription from "@/components/alert-subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StormTracker() {
  const queryClient = useQueryClient();
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(true);
  const radarRange = 30;
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
  const [precipitationStorms, setPrecipitationStorms] = useState<any[]>([]);
  const [lightningCount, setLightningCount] = useState(0);
  const [showStormFilteringSettings, setShowStormFilteringSettings] = useState(false);
  const [showAlertSubscription, setShowAlertSubscription] = useState(false);
  
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

  // Listen for lightning data
  useEffect(() => {
    const handleLightningData = (event: any) => {
      setLightningCount(event.detail?.count || 0);
    };

    window.addEventListener('lightningData', handleLightningData);
    return () => {
      window.removeEventListener('lightningData', handleLightningData);
    };
  }, []);

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
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
            <div className="p-4">
              <AlertSubscription 
                location={location}
              />
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
                  <Button
                    onClick={() => setShowAlertSubscription(true)}
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30"
                  >
                    🔔 Storm Alerts
                  </Button>
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
                      const directionDifference = Math.abs(((stormDirection - bearingToStorm + 180) % 360) - 180);
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
                    
                    // Calculate impact assessment (reuse same function)
                    const calculateImpactAssessment = (storm: any) => {
                      if (!storm.windsPrediction) return { severity: 'Low', eta: 'No data', impactChance: 'Low' };
                      
                      const movementSpeed = storm.windsPrediction.speed || 0;
                      const stormDirection = storm.windsPrediction.direction || 0;
                      const stormDistance = storm.distance;
                      
                      // Calculate bearing from user to storm
                      const bearingToStorm = storm.direction;
                      
                      // Calculate if storm is moving toward user (within 30° cone)
                      const directionDifference = Math.abs(((stormDirection - bearingToStorm + 180) % 360) - 180);
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

            {/* Interactive Radar Map */}
            {!show3D && (
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
                isDisabled={showStormFilteringSettings}
                alertPreferences={preferences}
              />
            )}

            {/* 3D Toggle Button */}
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

            {/* Storm Data Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mt-4 sm:mt-6">
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