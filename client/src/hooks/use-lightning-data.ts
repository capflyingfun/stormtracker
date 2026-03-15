import { useState, useEffect, useRef } from "react";

export interface LightningStrike {
  lat: number;
  lon: number;
  time: number;
  intensity: number;
  id: string;
}

interface Storm {
  lat: number;
  lon: number;
  intensity: number;
  distance?: number;
}

const STRIKE_MAX_AGE_MS = 10 * 60 * 1000;
const GENERATION_INTERVAL_MS = 8000;
const MAX_STRIKES = 200;

function generateStrikesFromStorms(storms: Storm[]): LightningStrike[] {
  const now = Date.now();
  const newStrikes: LightningStrike[] = [];

  storms.forEach(storm => {
    if (storm.intensity < 40) return;

    const strikesPerCycle = storm.intensity >= 60 ? 4 :
      storm.intensity >= 55 ? 3 :
      storm.intensity >= 50 ? 2 :
      storm.intensity >= 45 ? 1 :
      Math.random() < 0.3 ? 1 : 0;

    for (let i = 0; i < strikesPerCycle; i++) {
      const spreadKm = storm.intensity >= 55 ? 0.15 : 0.08;
      const offsetLat = (Math.random() - 0.5) * spreadKm * 2;
      const offsetLon = (Math.random() - 0.5) * spreadKm * 2 / Math.cos(storm.lat * Math.PI / 180);

      newStrikes.push({
        lat: storm.lat + offsetLat,
        lon: storm.lon + offsetLon,
        time: now - Math.random() * 3000,
        intensity: storm.intensity,
        id: `lt-${now}-${Math.random().toString(36).substr(2, 8)}`
      });
    }
  });

  return newStrikes;
}

export function useLightningData(location: { lat: number; lon: number } | null, _radiusKm: number = 200) {
  const [strikes, setStrikes] = useState<LightningStrike[]>([]);
  const stormsRef = useRef<Storm[]>([]);

  useEffect(() => {
    const handlePrecipitationStorms = (event: CustomEvent) => {
      const stormData = event.detail as Storm[];
      stormsRef.current = stormData.filter(s => s.intensity >= 40);
    };

    window.addEventListener('precipitationStormData', handlePrecipitationStorms as EventListener);
    return () => window.removeEventListener('precipitationStormData', handlePrecipitationStorms as EventListener);
  }, []);

  useEffect(() => {
    if (!location) return;

    const interval = setInterval(() => {
      const eligibleStorms = stormsRef.current;
      if (eligibleStorms.length === 0) return;

      const newStrikes = generateStrikesFromStorms(eligibleStorms);
      if (newStrikes.length === 0) return;

      setStrikes(prev => {
        const cutoff = Date.now() - STRIKE_MAX_AGE_MS;
        const fresh = prev.filter(s => s.time > cutoff);
        const combined = [...newStrikes, ...fresh];
        return combined.slice(0, MAX_STRIKES);
      });
    }, GENERATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [location?.lat, location?.lon]);

  return { strikes };
}
