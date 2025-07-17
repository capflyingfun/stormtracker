import { useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";
import { useStormData } from "@/hooks/use-storm-data";
import Header from "@/components/header";
import LocationSetup from "@/components/location-setup";
import StormMap from "@/components/storm-map";
import StormPanel from "@/components/storm-panel";
import AlertsPanel from "@/components/alerts-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StormTracker() {
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const radarRange = 30; // Fixed at 30 miles
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Storm filtering state - 5 meteorological categories (20-90 dBZ)
  const [stormFilters, setStormFilters] = useState({
    light: true,     // 20-34 dBZ (Light rain) - Green
    moderate: true,  // 35-45 dBZ (Moderate rain) - Yellow
    heavy: true,     // 46-54 dBZ (Heavy rain) - Orange
    veryHeavy: true, // 55-60 dBZ (Very heavy rain/hail) - Red
    extreme: true,   // 61+ dBZ (Extreme thunderstorms) - Purple
  });
  
  const [currentRadarSource, setCurrentRadarSource] = useState<'rainviewer' | 'nexrad'>('rainviewer');
  
  const {
    location,
    isLoading: locationLoading,
    setLocationFromGPS,
    setLocationFromSearch,
  } = useLocation();

  const {
    storms,
    alerts,
    refetch: refetchStormData,
    isLoading: stormDataLoading,
  } = useStormData(location, radarRange);
  
  // Filter storms based on intensity (5-category system)
  const filteredStorms = (storms || []).filter(storm => {
    const category = storm.intensity >= 61 ? 'extreme' :    // Extreme thunderstorms
                    storm.intensity >= 55 ? 'veryHeavy' :  // Very heavy rain/hail
                    storm.intensity >= 46 ? 'heavy' :      // Heavy rain
                    storm.intensity >= 35 ? 'moderate' :   // Moderate rain
                    'light';                               // Light rain (20-34 dBZ)
    return stormFilters[category as keyof typeof stormFilters];
  });

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

  const handleDirectLocationSelect = async (selectedLocation: { lat: number; lon: number; name: string }) => {
    try {
      // Use the smart search direct coordinates
      await setLocationFromSearch(selectedLocation.name);
      if (isTracking) {
        refetchStormData();
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Direct location selection failed:", error);
    }
  };

  const toggleTracking = () => {
    if (!isTracking && location) {
      refetchStormData();
      setLastUpdate(new Date());
    }
    setIsTracking(!isTracking);
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
        isTracking={isTracking}
      />
      
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
                
                <div className="flex gap-2">
                  <Button
                    onClick={toggleTracking}
                    variant={isTracking ? "destructive" : "default"}
                    size="sm"
                    className="text-xs sm:text-sm"
                  >
                    {isTracking ? "⏸️ Stop Tracking" : "▶️ Start Tracking"}
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
                  className="bg-slate-700/50 border-slate-600"
                />
              </div>

              {lastUpdate && (
                <div className="text-xs sm:text-sm text-slate-400">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>

            {/* Interactive Radar Map */}
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
            />

            {/* Storm Data Grid - Moved below radar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mt-4 sm:mt-6">
              <StormPanel
                storms={currentRadarSource === 'nexrad' ? filteredStorms : []}
                useMetric={useMetric}
                formatDistance={formatDistance}
                formatSpeed={formatSpeed}
                isLoading={stormDataLoading}
                radarSource={currentRadarSource}
              />
              
              <AlertsPanel
                alerts={alerts || []}
                isLoading={stormDataLoading}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
