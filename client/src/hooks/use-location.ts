import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface Location {
  lat: number;
  lon: number;
  name: string;
  state?: string;
  country?: string;
}

export function useLocation() {
  const [location, setLocation] = useState<Location | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setLocationFromGPS = async (): Promise<void> => {
    setIsLoading(true);
    
    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported');
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const { latitude: lat, longitude: lon } = position.coords;

      // Reverse geocode to get location name
      const response = await apiRequest('POST', '/api/reverse-geocode', { lat, lon });
      const locationData = await response.json();

      setLocation({
        lat,
        lon,
        name: locationData.name,
        state: locationData.state,
        country: locationData.country,
      });
    } catch (error) {
      console.error('GPS location error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const setLocationFromSearch = async (query: string): Promise<void> => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest('POST', '/api/geocode', { query });
      const locationData = await response.json();

      setLocation({
        lat: locationData.lat,
        lon: locationData.lon,
        name: `${locationData.name}${locationData.state ? `, ${locationData.state}` : ''}`,
        state: locationData.state,
        country: locationData.country,
      });
    } catch (error) {
      console.error('Location search error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    location,
    isLoading,
    setLocationFromGPS,
    setLocationFromSearch,
  };
}
