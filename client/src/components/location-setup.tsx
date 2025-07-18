import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import SimpleLocationSearch from "@/components/simple-location-search";

interface LocationSetupProps {
  onGPSLocation: () => Promise<void>;
  onLocationSearch: (query: string) => Promise<void>;
  onLocationSelect?: (location: { 
    lat: number; 
    lon: number; 
    name: string; 
    country?: string; 
    isUS?: boolean; 
    recommendedRadarSource?: 'rainviewer' | 'nexrad' 
  }) => void;
  isLoading: boolean;
}

export default function LocationSetup({ onGPSLocation, onLocationSearch, onLocationSelect, isLoading }: LocationSetupProps) {
  const handleLocationSelect = async (location: { 
    lat: number; 
    lon: number; 
    name: string; 
    country?: string; 
    isUS?: boolean; 
    recommendedRadarSource?: 'rainviewer' | 'nexrad' 
  }) => {
    if (onLocationSelect) {
      onLocationSelect(location);
    } else {
      // Fallback to old search method
      await onLocationSearch(location.name);
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 sm:p-8 border border-slate-700/50 mb-4 sm:mb-6">
      <div className="text-center">
        <div className="text-5xl sm:text-6xl mb-4">📍</div>
        <h2 className="text-lg sm:text-xl font-semibold mb-2">Set Your Location</h2>
        <p className="text-slate-300 mb-6 text-sm sm:text-base">Choose your location to start tracking storms</p>
        
        <div className="space-y-4 max-w-md mx-auto">
          <SimpleLocationSearch
            onLocationSelect={handleLocationSelect}
            onUseCurrentLocation={onGPSLocation}
            placeholder="Enter city, country, state, or ZIP code..."
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
