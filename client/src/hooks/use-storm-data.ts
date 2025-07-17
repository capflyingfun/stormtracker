import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

interface Location {
  lat: number;
  lon: number;
  name: string;
}

interface Storm {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: number;
  speed: number;
  type: string;
  description?: string;
}

interface WeatherAlert {
  properties: {
    event?: string;
    severity?: string;
    headline?: string;
    description?: string;
    sent: string;
    expires?: string;
  };
}

export function useStormData(location: Location | null, radius: number) {
  const [precipitationStorms, setPrecipitationStorms] = useState<Storm[]>([]);

  // Listen for precipitation storm data from radar sampling
  useEffect(() => {
    const handlePrecipitationStorms = (event: CustomEvent) => {
      setPrecipitationStorms(event.detail);
    };

    window.addEventListener('precipitationStormData', handlePrecipitationStorms as EventListener);
    return () => window.removeEventListener('precipitationStormData', handlePrecipitationStorms as EventListener);
  }, []);

  const stormsQuery = useQuery({
    queryKey: ['/api/storms', location?.lat, location?.lon, radius],
    enabled: !!location,
    refetchInterval: false,
    queryFn: async () => {
      if (!location) return [];
      
      const response = await apiRequest('POST', '/api/storms', {
        lat: location.lat,
        lon: location.lon,
        radius,
      });
      
      return response.json() as Promise<Storm[]>;
    },
  });

  const alertsQuery = useQuery({
    queryKey: ['/api/alerts', location?.lat, location?.lon, radius],
    enabled: !!location,
    refetchInterval: false,
    queryFn: async () => {
      if (!location) return [];
      
      const response = await apiRequest('POST', '/api/alerts', {
        lat: location.lat,
        lon: location.lon,
        radius,
      });
      
      return response.json() as Promise<WeatherAlert[]>;
    },
  });

  return {
    storms: precipitationStorms.length > 0 ? precipitationStorms : stormsQuery.data,
    alerts: alertsQuery.data,
    isLoading: stormsQuery.isLoading || alertsQuery.isLoading,
    refetch: () => {
      stormsQuery.refetch();
      alertsQuery.refetch();
    },
  };
}
