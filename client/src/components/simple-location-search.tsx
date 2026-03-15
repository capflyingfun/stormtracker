import { useState, useRef, useEffect } from "react";
import { Search, Navigation, Loader2, Map } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import MapLocationPicker from "./map-location-picker";

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
  placeholder = "Enter address, city, state, or ZIP...",
  className = ""
}: SimpleLocationSearchProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGPSLoading, setIsGPSLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [gpsError, setGpsError] = useState<string>('');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = (q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (q.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address-suggest?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
          setShowSuggestions((data.suggestions || []).length > 0);
        }
      } catch { /* ignore */ }
    }, 300);
  };

  const handleSuggestionSelect = (s: any) => {
    setShowSuggestions(false);
    setQuery('');
    setSuggestions([]);
    onLocationSelect({
      lat: s.lat,
      lon: s.lon,
      name: s.display_name,
      country: s.address?.country,
      isUS: s.address?.country === 'US',
      recommendedRadarSource: s.address?.country === 'US' ? 'nexrad' : 'rainviewer',
    });
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setShowSuggestions(false);
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      });

      if (response.ok) {
        const location = await response.json();
        
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
        setQuery("");
      } else {
        const errorData = await response.json();
        alert(`Location not found: ${errorData.message || 'Please try a different search term.'}`);
      }
    } catch (error) {
      alert("Search failed. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`${className}`}>
      <div ref={wrapperRef} className="relative mb-3">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
        <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              fetchSuggestions(e.target.value);
            }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            className="pl-10 pr-4 text-base h-12 md:h-10 bg-slate-700/50 border-slate-600 focus:border-blue-400"
            style={{ fontSize: '16px' }}
            disabled={isLoading}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </form>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
            {suggestions.map((s: any, i: number) => (
              <button
                key={s.id || i}
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0 flex items-center gap-2"
                onClick={() => handleSuggestionSelect(s)}
              >
                <span className="text-slate-400 text-sm shrink-0">{s.type === 'postal_code' ? '📮' : '📍'}</span>
                <span className="text-white text-sm truncate">{s.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-2">
        <Button
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className="w-full py-3 h-12 md:h-10 bg-green-600 hover:bg-green-500 touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          Search Location
        </Button>
      </div>

      <div className="flex gap-2 mb-3">
        <Button
          onClick={() => setShowMapPicker(true)}
          disabled={isLoading || isGPSLoading}
          variant="outline"
          className="flex-1 py-3 h-11 md:h-10 touch-manipulation border-slate-600 text-slate-300 hover:text-white"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Map className="h-4 w-4 mr-2 shrink-0" />
          <span className="text-sm">Pick on Map</span>
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
                if (msg === 'DUCKDUCKGO_GPS_BUG_IOS') {
                  setGpsError('DuckDuckGo\'s "Open as App" blocks GPS on iOS 16.4+. Fix: iPhone Settings → Privacy & Security → Location Services → DuckDuckGo → "While Using App". Or just type your city below!');
                } else if (msg === 'DUCKDUCKGO_GPS_BUG_ANDROID') {
                  setGpsError('DuckDuckGo has a known GPS bug on Android. Fix: Settings → Location → enable "Google Location Accuracy". Or just type your city in the search box below!');
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
            className="flex-1 py-3 h-11 md:h-10 touch-manipulation"
            title="Use current location"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {isGPSLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Navigation className="h-4 w-4 mr-2" />
            )}
            <span className="text-sm">{isGPSLoading ? 'Getting GPS...' : 'Use GPS'}</span>
          </Button>
        )}
      </div>

      {gpsStatus && (
        <div className={`text-xs mb-2 font-medium ${
          gpsStatus.includes('found') ? 'text-green-400' : 'text-blue-400'
        }`}>
          {gpsStatus}
        </div>
      )}

      {gpsError && (
        <div className="text-xs mb-2 p-2 bg-red-900/40 border border-red-600/50 rounded text-red-300 leading-relaxed">
          ⚠️ {gpsError}
        </div>
      )}

      <div className="text-xs text-slate-400">
        Examples: "New York", "90210", "1600 Pennsylvania Ave", "Miami, FL", "London, UK"
      </div>

      {showMapPicker && (
        <MapLocationPicker
          onLocationSelect={(loc) => {
            setShowMapPicker(false);
            onLocationSelect(loc);
          }}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
}
