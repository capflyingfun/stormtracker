import { useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";
import { useStormData } from "@/hooks/use-storm-data";
import Header from "@/components/header";
import LocationSetup from "@/components/location-setup";
import StormMap from "@/components/storm-map";
import StormPanel from "@/components/storm-panel";
import AlertsPanel from "@/components/alerts-panel";
import Game3DEnvironment from "@/components/game-3d-environment";
import SimpleFallback3D from "@/components/simple-fallback-3d";
import Basic3DEnvironment from "@/components/basic-3d-environment";
import ModeSelector from "@/components/mode-selector";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function LocationFirstTracker() {
  const [useMetric, setUseMetric] = useState(false);
  const [isTracking, setIsTracking] = useState(true);
  const radarRange = 30;
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [appMode, setAppMode] = useState<'2d' | '3d' | null>(null);
  const [precipitationStorms, setPrecipitationStorms] = useState<any[]>([]);
  
  const [stormFilters, setStormFilters] = useState({
    light: true,
    moderate: true,
    heavy: true,
    veryHeavy: true,
    extreme: true,
  });
  
  const [currentRadarSource, setCurrentRadarSource] = useState<'rainviewer' | 'nexrad'>('rainviewer');
  
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

  const resetToLocationSetup = () => {
    clearLocation();
    setAppMode(null);
  };

  // Step 1: Location Setup
  if (!location) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
        <Header useMetric={useMetric} onUnitsChange={setUseMetric} />
        <div className="p-3 sm:p-6">
          <LocationSetup
            onGPSLocation={handleGPSLocation}
            onLocationSearch={handleLocationSearch}
            onLocationSelect={handleDirectLocationSelect}
            isLoading={locationLoading}
          />
        </div>
      </div>
    );
  }

  // Step 2: Mode Selection
  if (!appMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
        <Header useMetric={useMetric} onUnitsChange={setUseMetric} />
        
        <div className="p-3 sm:p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Location Set: {location.name}</h2>
            <p className="text-slate-300">Choose your viewing mode</p>
          </div>
          
          <ModeSelector onModeSelect={setAppMode} />
          
          <div className="text-center mt-6">
            <Button
              variant="outline"
              onClick={resetToLocationSetup}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Change Location
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: 3D Mode
  if (appMode === '3d') {
    console.log('[Location First Tracker] Entering 3D mode with:', {
      location: location,
      precipitationStorms: precipitationStorms?.length || 0,
      hasValidLocation: !!(location && location.lat && location.lon)
    });
    
    // Use the reliable Basic3D environment directly
    return (
      <Basic3DEnvironment
        location={location}
        precipitationStorms={precipitationStorms}
        onClose={resetToLocationSetup}
      />
    );
  }

  // Step 4: 2D Mode
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      <Header useMetric={useMetric} onUnitsChange={setUseMetric} />
      
      <div className="p-3 sm:p-6">
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
              onClick={resetToLocationSetup}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Main Menu
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
      </div>
    </div>
  );
}