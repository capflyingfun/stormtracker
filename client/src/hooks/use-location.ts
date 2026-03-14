import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface Location {
  lat: number;
  lon: number;
  name: string;
  state?: string;
  country?: string;
}

// Helper function to get GPS location with retry logic
const getLocationWithRetry = async (maxRetries = 3): Promise<GeolocationPosition> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`GPS attempt ${attempt}/${maxRetries}`);
      
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        const options: PositionOptions = {
          enableHighAccuracy: attempt === 1, // Use high accuracy on first attempt only
          timeout: attempt === 1 ? 8000 : 15000, // Shorter timeout on first attempt
          maximumAge: attempt === 1 ? 0 : 60000 // Allow cached location on retries
        };
        
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
      
      console.log(`GPS success on attempt ${attempt}`);
      return position;
    } catch (error) {
      console.warn(`GPS attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw new Error(`GPS failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  
  throw new Error('GPS retry logic failed unexpectedly');
};

export function useLocation() {
  // Initialize location from localStorage if available
  const [location, setLocation] = useState<Location | null>(() => {
    if (typeof window !== 'undefined') {
      const savedLocation = localStorage.getItem('stormtracker-location');
      return savedLocation ? JSON.parse(savedLocation) : null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Detect if running as an installed PWA (standalone mode)
  const isStandalonePWA = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);

  // Helper function to update location and persist to localStorage
  const updateLocation = (newLocation: Location | null) => {
    setLocation(newLocation);
    if (typeof window !== 'undefined') {
      if (newLocation) {
        localStorage.setItem('stormtracker-location', JSON.stringify(newLocation));
        // In PWA standalone mode, force a reload so the app picks up the
        // saved location reliably — React state updates can be unreliable
        // in some standalone WebView contexts (e.g. DuckDuckGo home screen app)
        if (isStandalonePWA()) {
          setTimeout(() => window.location.reload(), 300);
        }
      } else {
        localStorage.removeItem('stormtracker-location');
      }
    }
  };

  const setLocationFromGPS = async (): Promise<Location | null> => {
    setIsLoading(true);
    
    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported by your browser');
      }

      // Check permission state first — critical for PWA / home screen installs
      // where the browser may not show the permission dialog automatically
      if (navigator.permissions) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
          
          if (permissionStatus.state === 'denied') {
            throw new Error(
              'Location permission was denied. To fix this: open your browser Settings, find StormTracker or this site, and allow Location access. Then try again.'
            );
          }
          
          // If prompt state in PWA mode, the dialog may not appear automatically
          // Log so we can debug if needed
          console.log('Geolocation permission state:', permissionStatus.state);
        } catch (permErr: any) {
          // If it's our custom error, re-throw it
          if (permErr.message?.includes('Location permission')) throw permErr;
          // Otherwise permissions API may not be supported — continue anyway
          console.warn('Permissions API not available, proceeding with geolocation request');
        }
      }

      // Try multiple strategies for getting GPS location
      const position = await getLocationWithRetry();
      const { latitude: lat, longitude: lon } = position.coords;

      // Reverse geocode to get location name with fallback
      let locationData;
      try {
        const response = await apiRequest('POST', '/api/reverse-geocode', { lat, lon });
        locationData = await response.json();
      } catch (reverseGeocodeError) {
        console.warn('Reverse geocoding failed, using coordinates:', reverseGeocodeError);
        // Fallback to coordinate-based name
        locationData = {
          name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          state: null,
          country: 'Unknown',
          recommendedRadarSource: lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.5 ? 'nexrad' : 'rainviewer',
          isUS: lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.5
        };
      }

      const location = {
        lat,
        lon,
        name: locationData.name,
        state: locationData.state,
        country: locationData.country,
      };
      
      updateLocation(location);
      
      // Return location with radar source info for GPS usage
      const locationWithRadarInfo = {
        ...location,
        recommendedRadarSource: locationData.recommendedRadarSource,
        isUS: locationData.isUS
      };
      
      return locationWithRadarInfo;
    } catch (error) {
      console.error('GPS location error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
    
    return null;
  };

  const setLocationFromSearch = async (query: string): Promise<void> => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest('POST', '/api/geocode', { query });
      const locationData = await response.json();

      const location = {
        lat: locationData.lat,
        lon: locationData.lon,
        name: `${locationData.name}${locationData.state ? `, ${locationData.state}` : ''}`,
        state: locationData.state,
        country: locationData.country,
      };
      
      updateLocation(location);
      
      // Emit location data with recommended radar source for search usage
      if (locationData.recommendedRadarSource) {
        window.dispatchEvent(new CustomEvent('locationWithRadarSource', {
          detail: {
            ...location,
            recommendedRadarSource: locationData.recommendedRadarSource,
            isUS: locationData.isUS
          }
        }));
      }
    } catch (error) {
      console.error('Location search error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const setLocationDirectly = (locationData: { lat: number; lon: number; name: string; state?: string; country?: string }) => {
    updateLocation({
      lat: locationData.lat,
      lon: locationData.lon,
      name: locationData.name,
      state: locationData.state,
      country: locationData.country,
    });
  };

  const clearLocation = () => {
    updateLocation(null);
  };

  return {
    location,
    isLoading,
    setLocationFromGPS,
    setLocationFromSearch,
    setLocationDirectly,
    clearLocation,
  };
}
