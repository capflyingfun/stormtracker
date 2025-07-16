import { apiRequest } from "./queryClient";

export interface LocationSearchResult {
  lat: number;
  lon: number;
  name: string;
  state?: string;
  country?: string;
}

export interface Storm {
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

export interface WeatherAlert {
  properties: {
    event?: string;
    severity?: string;
    headline?: string;
    description?: string;
    sent: string;
    expires?: string;
  };
}

export const stormApi = {
  async geocodeLocation(query: string): Promise<LocationSearchResult> {
    const response = await apiRequest('POST', '/api/geocode', { query });
    return response.json();
  },

  async reverseGeocode(lat: number, lon: number): Promise<LocationSearchResult> {
    const response = await apiRequest('POST', '/api/reverse-geocode', { lat, lon });
    return response.json();
  },

  async getWeatherData(lat: number, lon: number) {
    const response = await apiRequest('POST', '/api/weather', { lat, lon });
    return response.json();
  },

  async getStorms(lat: number, lon: number, radius: number = 30): Promise<Storm[]> {
    const response = await apiRequest('POST', '/api/storms', { lat, lon, radius });
    return response.json();
  },

  async getAlerts(lat: number, lon: number, radius: number = 30): Promise<WeatherAlert[]> {
    const response = await apiRequest('POST', '/api/alerts', { lat, lon, radius });
    return response.json();
  },
};
