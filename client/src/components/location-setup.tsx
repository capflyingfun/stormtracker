import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import SmartAddressSearch from "@/components/smart-address-search";

interface LocationSetupProps {
  onGPSLocation: () => Promise<void>;
  onLocationSearch: (query: string) => Promise<void>;
  onLocationSelect?: (location: { lat: number; lon: number; name: string }) => void;
  isLoading: boolean;
}

export default function LocationSetup({ onGPSLocation, onLocationSearch, onLocationSelect, isLoading }: LocationSetupProps) {
  const handleSmartLocationSelect = async (location: { lat: number; lon: number; name: string }) => {
    if (onLocationSelect) {
      onLocationSelect(location);
    } else {
      // Fallback to old search method
      await onLocationSearch(location.name);
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 mb-6">
      <div className="text-center">
        <div className="text-6xl mb-4">📍</div>
        <h2 className="text-xl font-semibold mb-2">Set Your Location</h2>
        <p className="text-slate-300 mb-6">Choose your location to start tracking storms</p>
        
        <div className="space-y-4 max-w-md mx-auto">
          <Button
            onClick={onGPSLocation}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span>🔄</span>
            )}
            <span>{isLoading ? 'Getting location...' : 'Use Current GPS Location'}</span>
          </Button>
          
          <div className="text-slate-400">— or —</div>
          
          <SmartAddressSearch
            onLocationSelect={handleSmartLocationSelect}
            placeholder="Search for an address, city, or ZIP code..."
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
