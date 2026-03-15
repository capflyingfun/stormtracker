import { useState, useEffect, useRef, useCallback } from "react";

export interface LightningStrike {
  lat: number;
  lon: number;
  time: number;
  intensity: number;
  id: string;
}

interface Location {
  lat: number;
  lon: number;
}

const STRIKE_MAX_AGE_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const WS_RECONNECT_DELAY_MS = 5000;
const MAX_STRIKES = 500;

export function useLightningData(location: Location | null, radiusKm: number = 200) {
  const [strikes, setStrikes] = useState<LightningStrike[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const distanceKm = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!location) return;

    const connect = () => {
      if (!mountedRef.current) return;

      try {
        const ws = new WebSocket('wss://ws1.blitzortung.org/');
        wsRef.current = ws;

        ws.onopen = () => {
          const west = location.lon - (radiusKm / 111);
          const east = location.lon + (radiusKm / 111);
          const south = location.lat - (radiusKm / 111);
          const north = location.lat + (radiusKm / 111);

          ws.send(JSON.stringify({
            west: Math.max(-180, west),
            east: Math.min(180, east),
            north: Math.min(90, north),
            south: Math.max(-90, south)
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.lat !== undefined && data.lon !== undefined) {
              const strikeLat = data.lat;
              const strikeLon = data.lon;
              const dist = distanceKm(location.lat, location.lon, strikeLat, strikeLon);

              if (dist <= radiusKm) {
                const strike: LightningStrike = {
                  lat: strikeLat,
                  lon: strikeLon,
                  time: data.time ? data.time / 1000000 : Date.now(),
                  intensity: data.sig || data.pol || 1,
                  id: `lt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
                };

                setStrikes(prev => {
                  const updated = [strike, ...prev];
                  if (updated.length > MAX_STRIKES) {
                    return updated.slice(0, MAX_STRIKES);
                  }
                  return updated;
                });
              }
            }
          } catch {
          }
        };

        ws.onclose = () => {
          if (mountedRef.current) {
            reconnectTimerRef.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
        }
      }
    };

    connect();

    const cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - STRIKE_MAX_AGE_MS;
      setStrikes(prev => prev.filter(s => s.time > cutoff));
    }, CLEANUP_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      clearInterval(cleanupInterval);
    };
  }, [location?.lat, location?.lon, radiusKm, distanceKm]);

  return { strikes };
}
