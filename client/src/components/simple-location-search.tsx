import { useState } from "react";
import { Search, Navigation, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SimpleLocationSearchProps {
  onLocationSelect: (location: { lat: number; lon: number; name: string }) => void;
  onUseCurrentLocation?: () => void;
  placeholder?: string;
  className?: string;
}

export default function SimpleLocationSearch({
  onLocationSelect,
  onUseCurrentLocation,
  placeholder = "Enter city, state, or ZIP code...",
  className = ""
}: SimpleLocationSearchProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      });

      if (response.ok) {
        const location = await response.json();
        onLocationSelect({
          lat: location.lat,
          lon: location.lon,
          name: location.name + (location.state ? `, ${location.state}` : '')
        });
        setQuery(""); // Clear input after successful search
      } else {
        alert("Location not found. Please try a different search term.");
      }
    } catch (error) {
      console.error('Location search failed:', error);
      alert("Search failed. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className={`${className}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-10 pr-4 text-base h-12 md:h-10 bg-slate-700/50 border-slate-600 focus:border-blue-400"
            style={{ fontSize: '16px' }} // Prevent iOS zoom
            disabled={isLoading}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
        
        <Button
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className="px-4 sm:px-6 py-3 h-12 md:h-10 bg-green-600 hover:bg-green-500 touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Search'
          )}
        </Button>

        {onUseCurrentLocation && (
          <Button
            onClick={onUseCurrentLocation}
            variant="outline"
            className="px-3 sm:px-4 py-3 h-12 md:h-10 touch-manipulation"
            title="Use current location"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Navigation className="h-4 w-4" />
            <span className="ml-2 text-sm hidden sm:inline">GPS</span>
          </Button>
        )}
      </div>

      {/* Search examples */}
      <div className="mt-2 text-xs text-slate-400">
        Examples: "New York", "90210", "Miami Beach, FL", "London, UK"
      </div>
    </div>
  );
}