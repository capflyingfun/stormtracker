import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { useQuery } from '@tanstack/react-query';

interface ThreatMonitorProps {
  userLocation?: {
    lat: number;
    lon: number;
    address: string;
  };
  storms?: any[];
  lightningCount?: number;
}

interface ThreatDetectionResult {
  location: string;
  coordinates: { lat: number; lon: number };
  threatCount: number;
  threats: Array<{
    type: string;
    level: string;
    status: string;
    title: string;
    description: string;
    priority: number;
    recommendations: string[];
    duration: string;
  }>;
  weatherConditions: {
    temperature: number;
    humidity: number;
    conditions: string;
    windSpeed: number;
  };
  dataQuality: {
    weatherapi_available: boolean;
    openweather_available: boolean;
    radar_storms: number;
    lightning_detected: number;
  };
  alertsGenerated: number;
  timestamp: string;
}

export function ThreatMonitor({ userLocation, storms = [], lightningCount = 0 }: ThreatMonitorProps) {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  // Automated threat detection query
  const { data: threatData, isLoading, refetch } = useQuery<ThreatDetectionResult>({
    queryKey: ['/api/threat-detection', userLocation?.lat, userLocation?.lon],
    queryFn: async () => {
      if (!userLocation) throw new Error('Location required');
      
      const response = await fetch('/api/threat-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: userLocation.lat,
          lon: userLocation.lon,
          address: userLocation.address,
          storms,
          lightningCount
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to perform threat detection');
      }
      
      return response.json();
    },
    enabled: false, // Manual trigger only
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Auto-monitoring effect
  useEffect(() => {
    if (!isMonitoring || !userLocation) return;

    const interval = setInterval(() => {
      refetch();
      setLastCheck(new Date());
    }, 10 * 60 * 1000); // Check every 10 minutes

    return () => clearInterval(interval);
  }, [isMonitoring, userLocation, refetch]);

  const handleStartMonitoring = () => {
    setIsMonitoring(true);
    refetch();
    setLastCheck(new Date());
  };

  const handleStopMonitoring = () => {
    setIsMonitoring(false);
  };

  const handleManualCheck = () => {
    refetch();
    setLastCheck(new Date());
  };

  const getThreatLevelColor = (level: string) => {
    switch (level) {
      case 'extreme': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getThreatIcon = (type: string) => {
    switch (type) {
      case 'thunderstorm': return '⛈️';
      case 'heat': return '🌡️';
      case 'air_quality': return '💨';
      case 'uv_warning': return '☀️';
      case 'lightning': return '⚡';
      case 'severe_weather': return '🌪️';
      default: return '⚠️';
    }
  };

  if (!userLocation) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🤖 AI Threat Monitor
          </CardTitle>
          <CardDescription>
            Set your location to enable automated weather threat detection
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            🤖 AI Threat Monitor
            {isMonitoring && (
              <Badge variant="default" className="bg-green-100 text-green-800">
                Active
              </Badge>
            )}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualCheck}
              disabled={isLoading}
            >
              {isLoading ? 'Scanning...' : 'Check Now'}
            </Button>
            {isMonitoring ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopMonitoring}
              >
                Stop
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleStartMonitoring}
              >
                Start Monitoring
              </Button>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Automated AI-powered weather threat detection for {userLocation.address}
          {lastCheck && (
            <span className="block text-xs text-muted-foreground mt-1">
              Last check: {lastCheck.toLocaleTimeString()}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* System Status */}
        {threatData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="font-semibold text-lg">{threatData.threatCount}</div>
              <div className="text-muted-foreground">Active Threats</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-lg">{threatData.alertsGenerated}</div>
              <div className="text-muted-foreground">Alerts Sent</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-lg">{threatData.weatherConditions.temperature}°F</div>
              <div className="text-muted-foreground">Temperature</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-lg">
                {threatData.dataQuality.weatherapi_available ? '✅' : '⚠️'}
              </div>
              <div className="text-muted-foreground">WeatherAPI</div>
            </div>
          </div>
        )}

        {/* Active Threats */}
        {threatData?.threats && threatData.threats.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Active Threats</h4>
            {threatData.threats
              .sort((a, b) => b.priority - a.priority)
              .map((threat, index) => (
                <Alert key={index} className={`border-l-4 ${getThreatLevelColor(threat.level)}`}>
                  <AlertDescription>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold flex items-center gap-2 mb-1">
                          <span>{getThreatIcon(threat.type)}</span>
                          {threat.title}
                          <Badge variant="outline" className={getThreatLevelColor(threat.level)}>
                            {threat.level.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {threat.description}
                        </p>
                        {threat.recommendations.length > 0 && (
                          <div>
                            <p className="text-xs font-medium mb-1">Recommended Actions:</p>
                            <ul className="text-xs text-muted-foreground space-y-1">
                              {threat.recommendations.map((rec, idx) => (
                                <li key={idx} className="flex items-start gap-1">
                                  <span>•</span>
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Duration: {threat.duration}
                        </p>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
          </div>
        )}

        {/* No Threats */}
        {threatData && threatData.threatCount === 0 && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">
              <div className="flex items-center gap-2">
                <span>✅</span>
                <span>No active weather threats detected. Conditions are currently safe.</span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Current Conditions Summary */}
        {threatData && (
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <div className="font-medium mb-2">Current Weather Conditions</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Temperature: {threatData.weatherConditions.temperature}°F</div>
              <div>Humidity: {threatData.weatherConditions.humidity}%</div>
              <div>Wind: {threatData.weatherConditions.windSpeed} mph</div>
              <div>Conditions: {threatData.weatherConditions.conditions}</div>
            </div>
          </div>
        )}

        {/* Data Sources */}
        {threatData && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            <div className="font-medium mb-1">Data Sources:</div>
            <div className="space-y-1">
              <div>OpenWeather: {threatData.dataQuality.openweather_available ? '✅ Active' : '❌ Unavailable'}</div>
              <div>WeatherAPI.com: {threatData.dataQuality.weatherapi_available ? '✅ Active' : '⚠️ Using free tier'}</div>
              <div>Radar Storms: {threatData.dataQuality.radar_storms} detected</div>
              <div>Lightning: {threatData.dataQuality.lightning_detected} strikes</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}