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
import { Slider } from "@/components/ui/slider";

export default function StormTracker() {
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [radarRange, setRadarRange] = useState(30);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
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
      
      <div className="p-6">
        {!location ? (
          <LocationSetup
            onGPSLocation={handleGPSLocation}
            onLocationSearch={handleLocationSearch}
            isLoading={locationLoading}
          />
        ) : (
          <>
            {/* Location Display */}
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">📍</div>
                  <div>
                    <h2 className="text-xl font-semibold">{location.name}</h2>
                    <p className="text-slate-300">
                      Detection Radius: {formatDistance(radarRange)}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleGPSLocation}
                    disabled={locationLoading}
                  >
                    🔄 GPS
                  </Button>
                  
                  <Button
                    onClick={toggleTracking}
                    variant={isTracking ? "destructive" : "default"}
                    size="sm"
                  >
                    {isTracking ? "⏸️ Stop Tracking" : "▶️ Start Tracking"}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 mb-4">
                <div className="flex-1">
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
                <Button
                  variant="secondary"
                  onClick={() => {
                    const input = document.querySelector('input') as HTMLInputElement;
                    if (input?.value) {
                      handleLocationSearch(input.value);
                      input.value = '';
                    }
                  }}
                >
                  Search
                </Button>
              </div>

              {lastUpdate && (
                <div className="text-sm text-slate-400 mb-3">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Detection Radius: {formatDistance(radarRange)}
                </label>
                <Slider
                  value={[radarRange]}
                  onValueChange={(value) => setRadarRange(value[0])}
                  min={5}
                  max={50}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>

            {/* Storm Data Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <StormPanel
                storms={storms || []}
                useMetric={useMetric}
                formatDistance={formatDistance}
                formatSpeed={formatSpeed}
                isLoading={stormDataLoading}
              />
              
              <AlertsPanel
                alerts={alerts || []}
                isLoading={stormDataLoading}
              />
            </div>

            {/* Interactive Radar Map */}
            <StormMap
              location={location}
              storms={storms || []}
              radarRange={radarRange}
              useMetric={useMetric}
              formatDistance={formatDistance}
              formatSpeed={formatSpeed}
            />
          </>
        )}
      </div>
    </div>
  );
}
