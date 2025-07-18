import { useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";
import { useStormData } from "@/hooks/use-storm-data";
import Header from "@/components/header";
import LocationSetup from "@/components/location-setup";
import StormMap from "@/components/storm-map";
import StormPanel from "@/components/storm-panel";
import AlertsPanel from "@/components/alerts-panel";
import Simple3DCanvas from "@/components/simple-3d-canvas";
import ModeSelector from "@/components/mode-selector";
import { Button } from "@/components/ui/button";

export default function StormTracker() {
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(true);
  const radarRange = 30;
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [show3D, setShow3D] = useState(false);
  const [appMode, setAppMode] = useState<'2d' | '3d' | null>(null);
  
  const [stormFilters, setStormFilters] = useState({
    light: true,
    moderate: true,
    heavy: true,
    veryHeavy: true,
    extreme: true,
  });
  
  const [currentRadarSource, setCurrentRadarSource] = useState<'rainviewer' | 'nexrad'>('rainviewer');
  const [precipitationStorms, setPrecipitationStorms] = useState<any[]>([]);
  
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
  
  const activeStorms = precipitationStorms.length > 0 ? precipitationStorms : (storms || []);
  
  const filteredStorms = activeStorms.filter(storm => {
    const category = storm.intensity >= 61 ? 'extreme' :
                    storm.intensity >= 55 ? 'veryHeavy' :
                    storm.intensity >= 46 ? 'heavy' :
                    storm.intensity >= 35 ? 'moderate' :
                    'light';
    return stormFilters[category as keyof typeof stormFilters];
  });

  useEffect(() => {
    const handlePrecipitationStormData = (event: any) => {
      setPrecipitationStorms(event.detail || []);
    };
    window.addEventListener('precipitationStormData', handlePrecipitationStormData);
    return () => {
      window.removeEventListener('precipitationStormData', handlePrecipitationStormData);
    };
  }, []);

  useEffect(() => {
    if (location && isTracking) {
      const interval = setInterval(() => {
        refetchStormData();
        setLastUpdate(new Date());
      }, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [location, isTracking, refetchStormData]);

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
    }
    
    if (appMode === '3d') {
      setShow3D(true);
    }
    
    if (isTracking) {
      refetchStormData();
      setLastUpdate(new Date());
    }
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

  if (!appMode) {
    return <ModeSelector onModeSelect={setAppMode} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      <Header useMetric={useMetric} onUnitsChange={setUseMetric} />
      
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold">{location.name}</h2>
                <p className="text-slate-300 text-sm sm:text-base">
                  {filteredStorms.length} storms detected within {radarRange} miles
                </p>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearLocation()}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Change Location
                </Button>
              </div>
            </div>

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
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mt-4 sm:mt-6">
              <StormPanel
                storms={filteredStorms}
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