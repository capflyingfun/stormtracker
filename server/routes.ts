import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { locationSearchSchema, weatherDataRequestSchema, insertLocationSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // API Keys - these would normally come from environment variables
  const API_KEYS = {
    openweather: process.env.OPENWEATHER_API_KEY || '49f87b43ad1ddba1821a5cdac7d6965e',
  };

  // Geocoding endpoint
  app.post("/api/geocode", async (req, res) => {
    try {
      const { query } = locationSearchSchema.parse(req.body);
      
      // Try different geocoding approaches
      let locations = [];
      
      // Check if it's a zip code (5 digits, optionally with +4)
      const zipCodeMatch = query.match(/^\d{5}(-\d{4})?$/);
      if (zipCodeMatch) {
        // For zip codes, add US country code
        const zipResponse = await fetch(
          `https://api.openweathermap.org/geo/1.0/zip?zip=${query},US&appid=${API_KEYS.openweather}`
        );
        
        if (zipResponse.ok) {
          const zipData = await zipResponse.json();
          locations = [{
            lat: zipData.lat,
            lon: zipData.lon,
            name: zipData.name,
            state: '', // Zip API doesn't return state
            country: zipData.country
          }];
        }
      }
      
      // If no results from zip code API or not a zip code, try direct geocoding
      if (locations.length === 0) {
        const response = await fetch(
          `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEYS.openweather}`
        );
        
        if (response.ok) {
          locations = await response.json();
        }
      }
      
      if (locations.length > 0) {
        const location = locations[0];
        res.json({
          lat: location.lat,
          lon: location.lon,
          name: location.name,
          state: location.state,
          country: location.country,
        });
      } else {
        res.status(404).json({ message: "Location not found" });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).json({ message: "Failed to geocode location" });
    }
  });

  // Reverse geocoding endpoint
  app.post("/api/reverse-geocode", async (req, res) => {
    try {
      const { lat, lon } = weatherDataRequestSchema.parse(req.body);
      
      const response = await fetch(
        `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEYS.openweather}`
      );
      
      if (!response.ok) {
        throw new Error(`Reverse geocoding API error: ${response.status}`);
      }
      
      const locations = await response.json();
      
      if (locations.length > 0) {
        const location = locations[0];
        res.json({
          lat,
          lon,
          name: `${location.name}${location.state ? `, ${location.state}` : ''}`,
          state: location.state,
          country: location.country,
        });
      } else {
        res.json({
          lat,
          lon,
          name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          country: 'Unknown',
        });
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({ message: "Failed to reverse geocode location" });
    }
  });

  // Weather data endpoint
  app.post("/api/weather", async (req, res) => {
    try {
      const { lat, lon } = weatherDataRequestSchema.parse(req.body);
      
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEYS.openweather}&units=metric`
      );
      
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ message: "Failed to fetch weather data" });
    }
  });

  // NWS alerts endpoint
  app.post("/api/alerts", async (req, res) => {
    try {
      const { lat, lon, radius = 30 } = weatherDataRequestSchema.parse(req.body);
      
      const response = await fetch(
        `https://api.weather.gov/alerts/active?point=${lat},${lon}&radius=${radius}`
      );
      
      if (!response.ok) {
        // NWS API can be unreliable, return empty array instead of error
        res.json([]);
        return;
      }
      
      const data = await response.json();
      res.json(data.features || []);
    } catch (error) {
      console.error("NWS alerts error:", error);
      res.json([]); // Return empty array on error
    }
  });

  // Storm detection endpoint
  app.post("/api/storms", async (req, res) => {
    try {
      const { lat, lon, radius = 30 } = weatherDataRequestSchema.parse(req.body);
      
      // Get current weather conditions
      const weatherResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEYS.openweather}&units=metric`
      );
      
      if (!weatherResponse.ok) {
        throw new Error(`Weather API error: ${weatherResponse.status}`);
      }
      
      const weatherData = await weatherResponse.json();
      const storms = [];
      
      // Simple storm detection based on weather conditions
      const isStormy = weatherData.weather[0].main === 'Thunderstorm' || 
                      weatherData.weather[0].main === 'Rain';
      const precipitation = weatherData.rain ? (weatherData.rain['1h'] || 0) : 0;
      
      if (isStormy && precipitation > 0.1) {
        // Generate storm data based on actual weather conditions
        const stormCount = Math.min(Math.floor(precipitation * 2), 3);
        
        for (let i = 0; i < stormCount; i++) {
          const angle = (Math.random() * 360) * Math.PI / 180;
          const distance = Math.random() * radius;
          const deltaLat = (distance / 69) * Math.cos(angle); // Rough conversion
          const deltaLon = (distance / 69) * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
          
          storms.push({
            id: `storm_${Date.now()}_${i}`,
            lat: lat + deltaLat,
            lon: lon + deltaLon,
            intensity: Math.min(precipitation * 20 + Math.random() * 20, 65),
            distance: distance,
            direction: Math.floor(Math.random() * 360),
            speed: 15 + Math.random() * 25,
            type: weatherData.weather[0].main,
            description: weatherData.weather[0].description,
          });
        }
      }
      
      res.json(storms);
    } catch (error) {
      console.error("Storm detection error:", error);
      res.status(500).json({ message: "Failed to detect storms" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
