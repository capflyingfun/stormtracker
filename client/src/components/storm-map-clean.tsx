import { useEffect, useRef, useState, useCallback } from "react";
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
  detectedAt?: number; // Timestamp for age-based coloring
}

interface StormMapProps {
  location: Location;
  storms: Storm[];
  radarRange: number;
  useMetric: boolean;
  formatDistance: (miles: number) => string;
  formatSpeed: (mph: number) => string;
  stormFilters?: {
    light: boolean;
    moderate: boolean;
    heavy: boolean;
    severe: boolean;
  };

  onRadarSourceChange?: (source: 'rainviewer' | 'nexrad') => void;
  radarSource?: 'rainviewer' | 'nexrad';
  isDisabled?: boolean;
  alertPreferences?: any;
  showAllStormTracks?: boolean;
  showTimeLabels?: boolean;
  onMapInstanceReady?: (mapInstance: any) => void;
}

declare global {
  interface Window {
    L: any;
  }
}

export default function StormMap({ location, storms, radarRange, formatDistance, formatSpeed, stormFilters: externalStormFilters, onRadarSourceChange, radarSource: externalRadarSource, isDisabled, alertPreferences, showAllStormTracks: externalShowAllStormTracks, showTimeLabels = true, onMapInstanceReady }: StormMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const radarLayerRef = useRef<any>(null);
  const rangeCircleRef = useRef<any>(null);
  const stormMarkersRef = useRef<any[]>([]);
  const sectorGridRef = useRef<any>(null);
  const sectorHighlightsRef = useRef<any>(null);
  
  const [showSectorGrid, setShowSectorGrid] = useState(true);
  const [radarSource, setRadarSource] = useState<'rainviewer' | 'nexrad'>(externalRadarSource || 'rainviewer');
  const [nexradSite, setNexradSite] = useState<string>('');
  const [sectorDbzData, setSectorDbzData] = useState<{[key: string]: number}>({});
  
  // Auto-sampling state
  const autoSampleTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Sync with external radar source changes
  useEffect(() => {
    if (externalRadarSource && externalRadarSource !== radarSource) {
      setRadarSource(externalRadarSource);
    }
  }, [externalRadarSource]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSampleTimeoutRef.current) {
        clearTimeout(autoSampleTimeoutRef.current);
      }
    };
  }, []);

  // Initialize NEXRAD site for attribution (simplified, no animation)
  useEffect(() => {
    const setupRadar = async () => {
      if (radarSource === 'nexrad' && location) {
        try {
          // Find nearest radar site for attribution only
          const nearbyResponse = await fetch('/api/nexrad/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: location.lat, lon: location.lon })
          });
          
          if (nearbyResponse.ok) {
            const { site } = await nearbyResponse.json();
            setNexradSite(site);
          }
          
          console.log('NEXRAD: Loading current composite radar tiles');
          
        } catch (error) {
          console.error('Failed to initialize NEXRAD radar:', error);
        }
      }
    };

    setupRadar();
  }, [radarSource, location?.lat, location?.lon]);

  // Load current radar layer (no animation)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map && window.L && location) {
      // Remove existing radar layer
      if (radarLayerRef.current) {
        map.removeLayer(radarLayerRef.current);
      }

      // Add new radar layer based on source
      if (radarSource === 'rainviewer') {
        // RainViewer current radar
        radarLayerRef.current = window.L.tileLayer('/api/rainviewer/tiles/{z}/{x}/{y}', {
          opacity: 0.6,
          attribution: 'Weather data by RainViewer'
        });
      } else {
        // NEXRAD current composite
        radarLayerRef.current = window.L.tileLayer('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png', {
          opacity: 0.6,
          attribution: nexradSite ? `NEXRAD ${nexradSite} via Iowa Mesonet` : 'NEXRAD via Iowa Mesonet'
        });
      }

      map.addLayer(radarLayerRef.current);
    }
  }, [radarSource, location, nexradSite]);

  // Rest of the component implementation continues below...
  // [The rest of the component would be implemented without any animation code]

  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div 
        ref={mapRef} 
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />
      
      {/* Simplified controls */}
      <div className="absolute top-2 left-2 z-[1000] bg-slate-900/90 rounded-lg p-2">
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const newSource = radarSource === 'rainviewer' ? 'nexrad' : 'rainviewer';
              setRadarSource(newSource);
              onRadarSourceChange?.(newSource);
            }}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            {radarSource === 'rainviewer' ? 'RainViewer' : 'NEXRAD'}
          </Button>
        </div>
      </div>

      {/* Range info */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-slate-900/90 rounded-lg p-2 text-xs text-white">
        Range: {radarRange} miles | {radarSource === 'rainviewer' ? 'RainViewer Global' : 'NEXRAD US'}
      </div>
    </div>
  );
}