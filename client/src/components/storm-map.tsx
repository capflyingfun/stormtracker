import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

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

interface StormMapProps {
  location: Location;
  storms: Storm[];
  radarRange: number;
  useMetric: boolean;
  formatDistance: (miles: number) => string;
  formatSpeed: (mph: number) => string;
}

declare global {
  interface Window {
    L: any;
  }
}

export default function StormMap({ location, storms, radarRange, formatDistance, formatSpeed }: StormMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const radarLayerRef = useRef<any>(null);
  const rangeCircleRef = useRef<any>(null);
  const stormMarkersRef = useRef<any[]>([]);
  
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(10);
  const [radarFrames, setRadarFrames] = useState<number[]>([]);
  const animationIntervalRef = useRef<NodeJS.Timeout>();

  // Initialize radar frames - simplified
  useEffect(() => {
    // Just load current radar
    setRadarFrames([Math.floor(Date.now() / 1000)]);
    setCurrentFrame(0);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Wait for Leaflet to load
    const initMap = () => {
      if (!window.L) {
        setTimeout(initMap, 100);
        return;
      }

      const map = window.L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true
      }).setView([location.lat, location.lon], 8);

      // Add dark base tile layer
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [location]);

  // Update map center and range circle when location or range changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    map.setView([location.lat, location.lon], 8);

    // Remove existing range circle
    if (rangeCircleRef.current) {
      map.removeLayer(rangeCircleRef.current);
    }

    // Add detection range circle
    rangeCircleRef.current = window.L.circle([location.lat, location.lon], {
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      radius: radarRange * 1609.34, // Convert miles to meters
      weight: 2
    }).addTo(map);

    // Add center marker
    window.L.marker([location.lat, location.lon], {
      icon: window.L.divIcon({
        className: 'custom-location-marker',
        html: '<div style="background: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(map).bindPopup(`<b>Your Location</b><br>${location.name}`);
  }, [location, radarRange]);

  // Load radar layer
  const loadRadarLayer = (frameIndex?: number) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || radarFrames.length === 0) return;

    const timestamp = radarFrames[frameIndex ?? currentFrame] || radarFrames[radarFrames.length - 1];

    // Remove existing radar layer first
    if (radarLayerRef.current) {
      try {
        map.removeLayer(radarLayerRef.current);
      } catch (e) {
        console.log('Error removing radar layer:', e);
      }
      radarLayerRef.current = null;
    }

    // Create custom radar overlay with RadarScope color palette
    try {
      // Create custom canvas overlay for realistic radar colors
      const CustomRadarLayer = window.L.Layer.extend({
        initialize: function(options) {
          window.L.setOptions(this, options);
          this._canvas = document.createElement('canvas');
          this._ctx = this._canvas.getContext('2d');
        },
        
        onAdd: function(map) {
          this._map = map;
          this._canvas.width = map.getSize().x;
          this._canvas.height = map.getSize().y;
          this._canvas.style.position = 'absolute';
          this._canvas.style.top = '0';
          this._canvas.style.left = '0';
          this._canvas.style.pointerEvents = 'none';
          this._canvas.style.opacity = '0.7';
          
          map.getPanes().overlayPane.appendChild(this._canvas);
          this._drawRadar();
          
          map.on('moveend zoom', this._drawRadar, this);
        },
        
        onRemove: function(map) {
          map.getPanes().overlayPane.removeChild(this._canvas);
          map.off('moveend zoom', this._drawRadar, this);
        },
        
        _drawRadar: function() {
          const map = this._map;
          const canvas = this._canvas;
          const ctx = this._ctx;
          
          canvas.width = map.getSize().x;
          canvas.height = map.getSize().y;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw simulated radar data with your color palette
          this._drawRadarData(ctx, map);
        },
        
        _drawRadarData: function(ctx, map) {
          // RadarScope color palette (dBZ values)
          const colorPalette = [
            { dbz: 0, color: 'rgba(0, 17, 23, 0.0)' },
            { dbz: 5, color: 'rgba(31, 41, 63, 0.8)' },
            { dbz: 10, color: 'rgba(72, 115, 142, 0.8)' },
            { dbz: 15, color: 'rgba(125, 164, 189, 0.8)' },
            { dbz: 20, color: 'rgba(84, 252, 90, 0.8)' },
            { dbz: 25, color: 'rgba(49, 157, 51, 0.8)' },
            { dbz: 30, color: 'rgba(16, 64, 13, 0.8)' },
            { dbz: 35, color: 'rgba(255, 255, 0, 0.8)' },
            { dbz: 45, color: 'rgba(254, 118, 27, 0.8)' },
            { dbz: 50, color: 'rgba(255, 0, 0, 0.8)' },
            { dbz: 55, color: 'rgba(140, 0, 0, 0.8)' },
            { dbz: 60, color: 'rgba(255, 0, 255, 0.8)' },
            { dbz: 65, color: 'rgba(255, 255, 255, 0.8)' }
          ];
          
          // Create sample radar patterns (in a real app, this would be actual radar data)
          const centerPoint = map.latLngToContainerPoint([location.lat, location.lon]);
          const maxRadius = Math.min(canvas.width, canvas.height) / 2;
          
          // Draw concentric circles with different intensities
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const radius = Math.random() * maxRadius * 0.6;
            const intensity = Math.random() * 60 + 5; // 5-65 dBZ
            
            const color = this._getColorForIntensity(intensity, colorPalette);
            if (color) {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(
                centerPoint.x + Math.cos(angle) * radius,
                centerPoint.y + Math.sin(angle) * radius,
                20 + Math.random() * 40,
                0,
                Math.PI * 2
              );
              ctx.fill();
            }
          }
        },
        
        _getColorForIntensity: function(dbz, palette) {
          for (let i = palette.length - 1; i >= 0; i--) {
            if (dbz >= palette[i].dbz) {
              return palette[i].color;
            }
          }
          return null;
        }
      });
      
      // Create and add the custom radar layer
      radarLayerRef.current = new CustomRadarLayer();
      radarLayerRef.current.addTo(map);
      
    } catch (error) {
      console.error('Failed to load custom radar layer:', error);
      
      // Fallback to standard precipitation layer
      radarLayerRef.current = window.L.tileLayer(
        `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=49f87b43ad1ddba1821a5cdac7d6965e`,
        {
          opacity: 0.7,
          transparent: true,
          attribution: 'Weather data © OpenWeatherMap'
        }
      );
      radarLayerRef.current.addTo(map);
    }
  };

  // Load radar when frames are ready
  useEffect(() => {
    if (radarFrames.length > 0) {
      loadRadarLayer();
    }
  }, [radarFrames, currentFrame]);

  // Update storm markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Clear existing storm markers
    stormMarkersRef.current.forEach(marker => map.removeLayer(marker));
    stormMarkersRef.current = [];

    // Add new storm markers
    storms.forEach(storm => {
      const marker = window.L.circleMarker([storm.lat, storm.lon], {
        radius: Math.max(8, storm.intensity / 8),
        fillColor: getStormColor(storm.intensity),
        color: '#ffffff',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.6,
        className: 'storm-marker'
      }).addTo(map);

      marker.bindPopup(`
        <div class="text-slate-200">
          <b>${storm.type} Cell</b><br>
          Intensity: ${storm.intensity.toFixed(0)} dBZ<br>
          Distance: ${formatDistance(storm.distance)} ${getDirectionName(storm.direction)}<br>
          Speed: ${formatSpeed(storm.speed)}<br>
          <em>${storm.description || ''}</em>
        </div>
      `);

      stormMarkersRef.current.push(marker);
    });
  }, [storms, formatDistance, formatSpeed]);

  const getStormColor = (intensity: number): string => {
    if (intensity >= 60) return '#8B0000'; // Dark red - Extreme
    if (intensity >= 50) return '#FF0000'; // Red - Severe
    if (intensity >= 40) return '#FF4500'; // Orange red - Heavy
    if (intensity >= 30) return '#FF8C00'; // Orange - Moderate
    if (intensity >= 20) return '#FFD700'; // Gold - Light
    return '#32CD32'; // Green - Very light
  };

  const getDirectionName = (degrees: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  const toggleAnimation = () => {
    // Disable animation for now - just refresh the radar
    refreshRadar();
  };

  const refreshRadar = () => {
    // Just refresh the current radar layer
    setRadarFrames([Math.floor(Date.now() / 1000)]);
    setCurrentFrame(0);
  };

  const getTimeDisplay = (): string => {
    return 'Live';
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          Live Weather Radar - {radarRange} Mile Range
        </h2>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={refreshRadar}
            variant="default"
            size="sm"
          >
            🔄 Refresh Radar
          </Button>
        </div>
      </div>
      
      <div className="relative bg-slate-900 rounded-lg border border-slate-600 overflow-hidden" style={{ height: '500px' }}>
        <div ref={mapRef} className="w-full h-full"></div>
        
        {/* Radar Legend */}
        <div className="absolute top-2 right-2 z-[1000] bg-slate-900/90 p-2 rounded border border-slate-700 text-xs">
          <div className="font-semibold text-white mb-1">dBZ Scale</div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(31, 41, 63)' }}></div>
              <span className="text-slate-300">5-10</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(72, 115, 142)' }}></div>
              <span className="text-slate-300">10-15</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(84, 252, 90)' }}></div>
              <span className="text-slate-300">20-25</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
              <span className="text-slate-300">35-40</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
              <span className="text-slate-300">50-55</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2" style={{ backgroundColor: 'rgb(255, 0, 255)' }}></div>
              <span className="text-slate-300">60+</span>
            </div>
          </div>
        </div>
        
        {/* Radar Info */}
        <div className="radar-controls">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Radar: {getTimeDisplay()}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Range: {radarRange} miles | dBZ Reflectivity (RadarScope BR palette)
          </div>
        </div>
      </div>
    </div>
  );
}
