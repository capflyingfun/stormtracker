import { useEffect, useState, useRef } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';

interface StormMovement {
  stormId: string;
  velocityX: number;
  velocityY: number;
  speed: number;
  direction: number;
  acceleration: number;
  intensityTrend: 'strengthening' | 'weakening' | 'steady';
}

interface StormTrail {
  stormId: string;
  positions: Array<{
    lat: number;
    lon: number;
    timestamp: number;
    intensity: number;
  }>;
}

interface StormMovementTrackerProps {
  storms: any[];
  onMovementUpdate: (movements: StormMovement[]) => void;
  onTrailUpdate: (trails: StormTrail[]) => void;
}

export default function StormMovementTracker({
  storms,
  onMovementUpdate,
  onTrailUpdate,
}: StormMovementTrackerProps) {
  const [previousStorms, setPreviousStorms] = useState<any[]>([]);
  const [stormTrails, setStormTrails] = useState<Map<string, StormTrail>>(new Map());
  const [movements, setMovements] = useState<StormMovement[]>([]);
  const updateInterval = useRef<NodeJS.Timeout>();

  const { lastMessage, isConnected } = useWebSocket('/ws');

  // Track storm movements by comparing current and previous positions
  useEffect(() => {
    if (storms.length === 0) return;

    const currentTime = Date.now();
    const newMovements: StormMovement[] = [];
    const newTrails = new Map(stormTrails);

    storms.forEach((currentStorm) => {
      // Find corresponding previous storm
      const previousStorm = previousStorms.find(
        (prev) => prev.id === currentStorm.id || 
        (Math.abs(prev.lat - currentStorm.lat) < 0.01 && 
         Math.abs(prev.lon - currentStorm.lon) < 0.01)
      );

      // Update trail
      if (!newTrails.has(currentStorm.id)) {
        newTrails.set(currentStorm.id, {
          stormId: currentStorm.id,
          positions: []
        });
      }

      const trail = newTrails.get(currentStorm.id)!;
      trail.positions.push({
        lat: currentStorm.lat,
        lon: currentStorm.lon,
        timestamp: currentTime,
        intensity: currentStorm.intensity
      });

      // Keep only last 20 positions (for performance)
      if (trail.positions.length > 20) {
        trail.positions = trail.positions.slice(-20);
      }

      if (previousStorm && trail.positions.length >= 2) {
        const timeDiff = (currentTime - (previousStorm.timestamp || currentTime - 300000)) / 1000; // seconds
        const latDiff = currentStorm.lat - previousStorm.lat;
        const lonDiff = currentStorm.lon - previousStorm.lon;
        
        // Calculate velocity in mph (approximate conversion)
        const velocityX = (lonDiff * 69.0 * 3600) / timeDiff; // mph eastward
        const velocityY = (latDiff * 69.0 * 3600) / timeDiff; // mph northward
        const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        const direction = Math.atan2(velocityY, velocityX) * 180 / Math.PI;

        // Calculate acceleration
        const previousMovement = movements.find(m => m.stormId === currentStorm.id);
        const acceleration = previousMovement ? 
          (speed - previousMovement.speed) / (timeDiff / 3600) : 0;

        // Determine intensity trend
        let intensityTrend: 'strengthening' | 'weakening' | 'steady' = 'steady';
        if (currentStorm.intensity > previousStorm.intensity + 2) {
          intensityTrend = 'strengthening';
        } else if (currentStorm.intensity < previousStorm.intensity - 2) {
          intensityTrend = 'weakening';
        }

        newMovements.push({
          stormId: currentStorm.id,
          velocityX,
          velocityY,
          speed,
          direction,
          acceleration,
          intensityTrend
        });
      }
    });

    // Clean up old trails (older than 2 hours)
    const cutoffTime = currentTime - 2 * 60 * 60 * 1000;
    newTrails.forEach((trail, stormId) => {
      trail.positions = trail.positions.filter(pos => pos.timestamp > cutoffTime);
      if (trail.positions.length === 0) {
        newTrails.delete(stormId);
      }
    });

    setStormTrails(newTrails);
    setMovements(newMovements);
    setPreviousStorms(storms);

    // Notify parent components
    onMovementUpdate(newMovements);
    onTrailUpdate(Array.from(newTrails.values()));

  }, [storms, previousStorms, stormTrails, movements, onMovementUpdate, onTrailUpdate]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'movement-update') {
      // Handle real-time movement updates from server
      const serverMovements = lastMessage.data;
      setMovements(serverMovements);
      onMovementUpdate(serverMovements);
    }
  }, [lastMessage, onMovementUpdate]);

  // Periodic cleanup
  useEffect(() => {
    updateInterval.current = setInterval(() => {
      const now = Date.now();
      const cutoffTime = now - 2 * 60 * 60 * 1000; // 2 hours

      setStormTrails(prev => {
        const cleaned = new Map(prev);
        cleaned.forEach((trail, stormId) => {
          trail.positions = trail.positions.filter(pos => pos.timestamp > cutoffTime);
          if (trail.positions.length === 0) {
            cleaned.delete(stormId);
          }
        });
        return cleaned;
      });
    }, 60000); // Every minute

    return () => {
      if (updateInterval.current) {
        clearInterval(updateInterval.current);
      }
    };
  }, []);

  return null; // This is a headless component
}