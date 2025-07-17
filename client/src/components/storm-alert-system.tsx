import { useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Zap, CloudRain, Wind } from 'lucide-react';

interface StormAlert {
  id: string;
  type: 'severe' | 'extreme' | 'heavy' | 'movement';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'extreme';
  distance: number;
  direction: string;
  intensity: number;
  timestamp: number;
  dismissed: boolean;
}

interface StormAlertSystemProps {
  storms: any[];
  location: { lat: number; lon: number; name: string };
  alertRadius: number;
  onAlertDismiss: (alertId: string) => void;
}

export default function StormAlertSystem({
  storms,
  location,
  alertRadius = 30,
  onAlertDismiss
}: StormAlertSystemProps) {
  const [alerts, setAlerts] = useState<StormAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { lastMessage } = useWebSocket('/ws');

  // Generate alerts based on storm data
  useEffect(() => {
    const newAlerts: StormAlert[] = [];
    const now = Date.now();

    storms.forEach((storm) => {
      // Skip if storm is too far away
      if (storm.distance > alertRadius) return;

      // Generate alerts for different conditions
      const alertId = `storm-${storm.id}`;
      
      // Extreme intensity alert
      if (storm.intensity >= 65) {
        newAlerts.push({
          id: `${alertId}-extreme`,
          type: 'extreme',
          title: 'EXTREME STORM DETECTED',
          description: `${storm.intensity} dBZ storm cell ${storm.distance.toFixed(1)} miles away. Expect extreme precipitation (>4 in/hr).`,
          severity: 'extreme',
          distance: storm.distance,
          direction: getDirectionText(storm.direction),
          intensity: storm.intensity,
          timestamp: now,
          dismissed: false
        });
      }
      // Severe intensity alert
      else if (storm.intensity >= 55) {
        newAlerts.push({
          id: `${alertId}-severe`,
          type: 'severe',
          title: 'SEVERE STORM WARNING',
          description: `${storm.intensity} dBZ storm cell ${storm.distance.toFixed(1)} miles away. Heavy precipitation expected (2-4 in/hr).`,
          severity: 'high',
          distance: storm.distance,
          direction: getDirectionText(storm.direction),
          intensity: storm.intensity,
          timestamp: now,
          dismissed: false
        });
      }
      // Heavy precipitation alert
      else if (storm.intensity >= 45) {
        newAlerts.push({
          id: `${alertId}-heavy`,
          type: 'heavy',
          title: 'Heavy Precipitation Alert',
          description: `${storm.intensity} dBZ storm cell ${storm.distance.toFixed(1)} miles away. Moderate to heavy rain expected (1-2 in/hr).`,
          severity: 'medium',
          distance: storm.distance,
          direction: getDirectionText(storm.direction),
          intensity: storm.intensity,
          timestamp: now,
          dismissed: false
        });
      }

      // Movement alerts for fast-moving storms
      if (storm.speed && storm.speed > 20) {
        newAlerts.push({
          id: `${alertId}-movement`,
          type: 'movement',
          title: 'Fast-Moving Storm',
          description: `Storm moving at ${storm.speed.toFixed(1)} mph. Conditions may change rapidly.`,
          severity: 'medium',
          distance: storm.distance,
          direction: getDirectionText(storm.direction),
          intensity: storm.intensity,
          timestamp: now,
          dismissed: false
        });
      }
    });

    // Update alerts, keeping non-dismissed ones
    setAlerts(prev => {
      const existingDismissed = prev.filter(alert => alert.dismissed);
      const newUndismissed = newAlerts.filter(newAlert => 
        !existingDismissed.some(dismissed => dismissed.id === newAlert.id)
      );
      return [...existingDismissed, ...newUndismissed];
    });

    // Play sound for new high-severity alerts
    if (soundEnabled && newAlerts.some(alert => alert.severity === 'extreme' || alert.severity === 'high')) {
      playAlertSound();
    }
  }, [storms, alertRadius, soundEnabled]);

  // Helper function to get direction text
  const getDirectionText = (bearing: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
  };

  // Play alert sound
  const playAlertSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBGhqNHSyVOmZiEgOxdJAb1lnZOjLrGNBKcGYRm7YYJWuUAZfGXZqiOdBG/wCZHtWXKGzTgFmLkIbJ7AYLQNZEGgNKsWJHQHoGUJCQAFEiJJCaQF8nHdJqN1SaGOUEgJRQTRGXgUIGYMUGnEAR4lCbGIFgJtKZGWUQVByLOFLiFkMCw0QFhYhDNggb2ZkJRJSDkGVFYOTFBNR/RNnZwgWAMzPjD4+HQgFAVQFUAMdEQggJVcGAOYLCJzFUwM4CAwAOJIeUQlQaGAQEwGVDQMMjj4MygAAAABJRU5ErkJggg==');
      audio.play().catch(() => {
        // Ignore audio play errors (browser restrictions)
      });
    } catch (error) {
      // Audio not supported, continue silently
    }
  };

  // Dismiss alert
  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, dismissed: true } : alert
    ));
    onAlertDismiss(alertId);
  };

  // Get alert icon
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'extreme':
      case 'severe':
        return <AlertTriangle className="w-5 h-5" />;
      case 'heavy':
        return <CloudRain className="w-5 h-5" />;
      case 'movement':
        return <Wind className="w-5 h-5" />;
      default:
        return <Zap className="w-5 h-5" />;
    }
  };

  // Get alert color
  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'extreme':
        return 'bg-purple-500/10 border-purple-500 text-purple-300';
      case 'high':
        return 'bg-red-500/10 border-red-500 text-red-300';
      case 'medium':
        return 'bg-orange-500/10 border-orange-500 text-orange-300';
      default:
        return 'bg-yellow-500/10 border-yellow-500 text-yellow-300';
    }
  };

  // Filter active alerts
  const activeAlerts = alerts.filter(alert => !alert.dismissed);

  if (activeAlerts.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-400">
            <Zap className="w-5 h-5" />
            Storm Alert System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400">No active storm alerts in your area.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            Storm Alerts ({activeAlerts.length})
          </div>
          <Button
            onClick={() => setSoundEnabled(!soundEnabled)}
            variant="outline"
            size="sm"
            className="text-slate-400"
          >
            {soundEnabled ? '🔊' : '🔇'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeAlerts.map((alert) => (
          <Alert
            key={alert.id}
            className={`${getAlertColor(alert.severity)} border-l-4`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {getAlertIcon(alert.type)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">{alert.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {alert.distance.toFixed(1)} mi {alert.direction}
                    </Badge>
                  </div>
                  <AlertDescription className="text-sm">
                    {alert.description}
                  </AlertDescription>
                  <div className="flex items-center gap-2 mt-2 text-xs opacity-75">
                    <span>Intensity: {alert.intensity} dBZ</span>
                    <span>•</span>
                    <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => dismissAlert(alert.id)}
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-white"
              >
                ×
              </Button>
            </div>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}