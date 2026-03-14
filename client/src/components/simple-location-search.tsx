import { useState } from "react";
import { Search, Navigation, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SimpleLocationSearchProps {
  onLocationSelect: (location: { 
    lat: number; 
    lon: number; 
    name: string; 
    country?: string; 
    isUS?: boolean; 
    recommendedRadarSource?: 'rainviewer' | 'nexrad' 
  }) => void;
  onUseCurrentLocation?: () => Promise<void>;
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
  const [isGPSLoading, setIsGPSLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [gpsError, setGpsError] = useState<string>('');

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
        console.log('Location found:', location); // Debug log
        
        // Create display name with country for international locations
        let displayName = location.name;
        if (location.state) {
          displayName += `, ${location.state}`;
        }
        if (location.country && location.country !== 'US') {
          displayName += `, ${location.country}`;
        }
        
        onLocationSelect({
          lat: location.lat,
          lon: location.lon,
          name: displayName,
          country: location.country,
          isUS: location.isUS,
          recommendedRadarSource: location.recommendedRadarSource
        });
        setQuery(""); // Clear input after successful search
      } else {
        const errorData = await response.json();
        console.error('Search error:', errorData);
        alert(`Location not found: ${errorData.message || 'Please try a different search term.'}`);
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
      {/* Search Input */}
      <div className="relative mb-3">
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

      {/* Action Buttons */}
      <div className="flex gap-2 mb-3">
        <Button
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className="flex-1 px-4 sm:px-6 py-3 h-12 md:h-10 bg-green-600 hover:bg-green-500 touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Search Location'
          )}
        </Button>

        {onUseCurrentLocation && (
          <Button
            onClick={async () => {
              setIsGPSLoading(true);
              setGpsStatus('Getting GPS location...');
              setGpsError('');
              try {
                await onUseCurrentLocation();
                setGpsStatus('GPS location found!');
                setTimeout(() => setGpsStatus(''), 2000);
              } catch (error: any) {
                setGpsStatus('');
                const msg = error?.message || '';
                if (msg === 'DUCKDUCKGO_GPS_BUG') {
                  setGpsError('DuckDuckGo has a known GPS bug. Fix: Android Settings → Location → enable "Google Location Accuracy". Or just type your city in the search box below — that works great!');
                } else if (msg.includes('Location permission') || msg.includes('denied') || msg.includes('PERMISSION_DENIED')) {
                  setGpsError('Location access denied. Go to your browser Settings → Site Permissions → allow Location for this site, then try again. Or type your city below.');
                } else if (msg.includes('not supported')) {
                  setGpsError('GPS is not supported in this browser. Type your city in the search box below.');
                } else {
                  setGpsError('Could not get GPS location. Type your city in the search box below.');
                }
              } finally {
                setIsGPSLoading(false);
              }
            }}
            disabled={isGPSLoading || isLoading}
            variant="outline"
            className="px-3 sm:px-4 py-3 h-12 md:h-10 touch-manipulation"
            title="Use current location"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {isGPSLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            <span className="ml-2 text-sm hidden sm:inline">
              {isGPSLoading ? 'Getting GPS...' : 'Use GPS'}
            </span>
          </Button>
        )}
      </div>

      {/* GPS Status */}
      {gpsStatus && (
        <div className={`text-xs mb-2 font-medium ${
          gpsStatus.includes('found') ? 'text-green-400' : 'text-blue-400'
        }`}>
          {gpsStatus}
        </div>
      )}

      {/* GPS Error — shown persistently so user can read the full message */}
      {gpsError && (
        <div className="text-xs mb-2 p-2 bg-red-900/40 border border-red-600/50 rounded text-red-300 leading-relaxed">
          ⚠️ {gpsError}
        </div>
      )}

      {/* Search examples */}
      <div className="text-xs text-slate-400">
        Examples: "New York", "90210", "1600 Pennsylvania Ave", "Miami, FL", "London, UK"
      </div>
    </div>
  );
}