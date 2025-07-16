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

  // Initialize radar frames
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const frames = [];
    for (let i = 10; i >= 0; i--) {
      frames.push(now - (i * 600)); // 10-minute intervals
    }
    setRadarFrames(frames);
    setCurrentFrame(frames.length - 1);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !window.L || mapInstanceRef.current) return;

    const map = window.L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true
    }).setView([location.lat, location.lon], 8);

    // Add dark base tile layer
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

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

    // Remove existing radar layer
    if (radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current);
    }

    // Add RainViewer radar layer
    radarLayerRef.current = window.L.tileLayer(
      `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/{z}/{x}/{y}/6/1_1.png`,
      {
        tileSize: 256,
        opacity: 0.6,
        transparent: true,
        attribution: 'Weather data © RainViewer'
      }
    ).addTo(map);
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
    if (isAnimating) {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
      setIsAnimating(false);
    } else {
      setIsAnimating(true);
      animationIntervalRef.current = setInterval(() => {
        setCurrentFrame((prev) => {
          const nextFrame = (prev + 1) % radarFrames.length;
          loadRadarLayer(nextFrame);
          return nextFrame;
        });
      }, 500);
    }
  };

  const refreshRadar = () => {
    const now = Math.floor(Date.now() / 1000);
    const frames = [];
    for (let i = 10; i >= 0; i--) {
      frames.push(now - (i * 600));
    }
    setRadarFrames(frames);
    setCurrentFrame(frames.length - 1);
  };

  const handleTimeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFrame = parseInt(e.target.value);
    setCurrentFrame(newFrame);
    loadRadarLayer(newFrame);
  };

  const getTimeDisplay = (): string => {
    if (radarFrames.length === 0) return 'Loading...';
    const timestamp = radarFrames[currentFrame];
    if (currentFrame === radarFrames.length - 1) return 'Live';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          Live Storm Radar - {radarRange} Mile Range
        </h2>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={toggleAnimation}
            variant="default"
            size="sm"
          >
            {isAnimating ? '⏸️ Pause' : '▶️ Play'}
          </Button>
          <Button
            onClick={refreshRadar}
            variant="secondary"
            size="sm"
          >
            🔄 Refresh
          </Button>
        </div>
      </div>
      
      <div className="relative bg-slate-900 rounded-lg border border-slate-600 overflow-hidden" style={{ height: '500px' }}>
        <div ref={mapRef} className="w-full h-full"></div>
        
        {/* Radar Animation Controls */}
        <div className="radar-controls">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Radar Time:</span>
            <input
              type="range"
              min="0"
              max={Math.max(0, radarFrames.length - 1)}
              value={currentFrame}
              onChange={handleTimeSliderChange}
              className="w-24 h-1"
            />
            <span>{getTimeDisplay()}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Updates: 10 min | Range: {radarRange} miles
          </div>
        </div>
      </div>
    </div>
  );
}
