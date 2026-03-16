import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import SimpleLocationSearch from "@/components/simple-location-search";
import FavoriteLocations from "@/components/favorite-locations";
import { type FavoriteLocation } from "@/hooks/use-favorites";
import { useLanguage } from "@/hooks/use-language";

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
  const { t } = useLanguage();
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
      await onLocationSearch(location.name);
    }
  };

  const handleFavoriteSelect = (fav: FavoriteLocation) => {
    handleLocationSelect({
      lat: fav.lat,
      lon: fav.lon,
      name: fav.name,
      country: fav.country,
      isUS: fav.isUS,
      recommendedRadarSource: fav.recommendedRadarSource,
    });
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 sm:p-8 border border-slate-700/50 mb-4 sm:mb-6">
      <div className="text-center mb-4 sm:mb-6">
        <div className="text-5xl sm:text-6xl mb-3">📍</div>
        <h2 className="text-lg sm:text-xl font-semibold mb-1">{t.setYourLocation}</h2>
        <p className="text-slate-300 text-sm sm:text-base">{t.chooseLocation}</p>
      </div>

      <div className="max-w-md mx-auto">
        {/* Favorites — shown above search when any exist */}
        <FavoriteLocations onSelect={handleFavoriteSelect} />

        <SimpleLocationSearch
          onLocationSelect={handleLocationSelect}
          onUseCurrentLocation={onGPSLocation}
          placeholder={t.enterAddress}
          className="w-full"
        />
      </div>
    </div>
  );
}
