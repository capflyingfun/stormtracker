import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AddressSuggestion {
  id: string;
  display_name: string;
  lat: number;
  lon: number;
  type: 'place' | 'postal_code' | 'address';
  importance: number;
  address: {
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
  };
}

interface SmartAddressSearchProps {
  onLocationSelect: (location: { 
    lat: number; 
    lon: number; 
    name: string; 
    country?: string; 
    isUS?: boolean; 
    recommendedRadarSource?: 'rainviewer' | 'nexrad' 
  }) => void;
  onUseCurrentLocation?: () => void;
  placeholder?: string;
  className?: string;
}

export default function SmartAddressSearch({
  onLocationSelect,
  onUseCurrentLocation,
  placeholder = "Search for an address, city, or ZIP code...",
  className = ""
}: SmartAddressSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch address suggestions
  const fetchSuggestions = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/address-suggest?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      
      if (data.suggestions) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      }
    } catch (error) {
      console.error('Failed to fetch address suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search with longer delay for mobile
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Longer delay for mobile to prevent excessive API calls while typing
    const delay = window.innerWidth < 768 ? 500 : 200;
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, delay);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  // Handle suggestion selection
  const selectSuggestion = (suggestion: AddressSuggestion) => {
    setQuery(suggestion.display_name);
    setShowSuggestions(false);
    // Keep focus on input for mobile after selection
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }, 100);
    onLocationSelect({
      lat: suggestion.lat,
      lon: suggestion.lon,
      name: suggestion.display_name,
      country: suggestion.address?.country,
      isUS: suggestion.address?.country === 'US',
      recommendedRadarSource: suggestion.address?.country === 'US' ? 'nexrad' : 'rainviewer'
    });
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        handleDirectSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          handleDirectSearch();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Handle direct search without suggestions
  const handleDirectSearch = async () => {
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
          name: location.name + (location.state ? `, ${location.state}` : ''),
          country: location.country,
          isUS: location.isUS,
          recommendedRadarSource: location.recommendedRadarSource
        });
        setShowSuggestions(false);
        setQuery("");
      } else {
        alert("Location not found. Please try a different search term.");
      }
    } catch (error) {
      console.error('Direct search failed:', error);
      alert("Search failed. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Get suggestion icon
  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'postal_code':
        return '📮';
      case 'address':
        return '🏠';
      default:
        return '📍';
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              className="pl-10 pr-4 text-base md:text-sm h-12 md:h-10"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-slate-300 border-t-slate-600 rounded-full"></div>
              </div>
            )}
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-80 md:max-h-64 overflow-y-auto"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  onMouseDown={(e) => {
                    // Prevent input from losing focus on mobile
                    e.preventDefault();
                  }}
                  onClick={() => selectSuggestion(suggestion)}
                  className={`w-full text-left px-4 py-4 md:py-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-600 last:border-b-0 transition-colors touch-manipulation ${
                    index === selectedIndex ? 'bg-slate-50 dark:bg-slate-700' : ''
                  }`}
                  style={{ 
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation' 
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl md:text-lg mt-0.5 flex-shrink-0">
                      {getSuggestionIcon(suggestion.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-base md:text-sm">
                        {suggestion.display_name}
                      </div>
                      <div className="text-sm md:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {suggestion.type === 'postal_code' ? 'ZIP Code' : 
                         suggestion.type === 'address' ? 'Address' : 'Place'}
                        {suggestion.address.country && ` • ${suggestion.address.country}`}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {onUseCurrentLocation && (
          <Button
            onClick={onUseCurrentLocation}
            variant="outline"
            className="flex-shrink-0 px-3 sm:px-4 py-3 sm:py-2 h-12 md:h-10 touch-manipulation"
            title="Use current location"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Navigation className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="ml-2 text-sm hidden sm:inline">GPS</span>
          </Button>
        )}
      </div>

      {/* Recent searches hint */}
      {!query && !showSuggestions && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Try: "New York", "90210", "1600 Pennsylvania Ave" or "Miami Beach, FL"
        </div>
      )}
    </div>
  );
}