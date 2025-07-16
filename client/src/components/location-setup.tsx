import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface LocationSetupProps {
  onGPSLocation: () => Promise<void>;
  onLocationSearch: (query: string) => Promise<void>;
  isLoading: boolean;
}

export default function LocationSetup({ onGPSLocation, onLocationSearch, isLoading }: LocationSetupProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      await onLocationSearch(searchQuery);
      setSearchQuery("");
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
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
          
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type="text"
                placeholder="Enter city, state, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="bg-slate-700/50 border-slate-600"
                disabled={isSearching}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-6 py-3 bg-green-600 hover:bg-green-500"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Search'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
