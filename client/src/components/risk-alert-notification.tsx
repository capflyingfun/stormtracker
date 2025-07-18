import { useState, useEffect } from 'react';
import { AlertTriangle, X, Volume2, VolumeX, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RiskAlert {
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  alertType: string;
  title: string;
  message: string;
  conditions: {
    stormCount: number;
    maxIntensity: number;
    nearestDistance: number;
    lightningCount: number;
  };
  shouldAlert: boolean;
}

interface RiskAlertNotificationProps {
  alert: RiskAlert | null;
  isVisible: boolean;
  onDismiss: () => void;
  onOpenSettings?: () => void;
}

export default function RiskAlertNotification({ 
  alert, 
  isVisible, 
  onDismiss, 
  onOpenSettings 
}: RiskAlertNotificationProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      // Pulse animation for extreme alerts
      if (alert?.riskLevel === 'extreme') {
        const pulseInterval = setInterval(() => {
          setIsAnimating(prev => !prev);
        }, 1000);
        return () => clearInterval(pulseInterval);
      }
    }
  }, [isVisible, alert?.riskLevel]);

  if (!alert || !isVisible) return null;

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'extreme': return 'bg-red-600 border-red-500';
      case 'high': return 'bg-orange-600 border-orange-500';
      case 'medium': return 'bg-yellow-600 border-yellow-500';
      case 'low': return 'bg-blue-600 border-blue-500';
      default: return 'bg-gray-600 border-gray-500';
    }
  };

  const getRiskIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'extreme': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '🌧️';
      case 'low': return '🌦️';
      default: return '📡';
    }
  };

  const formatDistance = (distance: number) => {
    if (distance === 999) return 'Unknown';
    return `${distance.toFixed(1)} mi`;
  };

  return (
    <div className="fixed top-2 left-2 right-2 z-50 sm:top-4 sm:right-4 sm:left-auto sm:max-w-md">
      <Card className={`${getRiskColor(alert.riskLevel)} text-white shadow-2xl transition-all duration-300 ${
        isAnimating && alert.riskLevel === 'extreme' ? 'animate-pulse' : ''
      }`}>
        <CardHeader className="pb-3 px-3 pt-3 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-xl sm:text-2xl shrink-0">{getRiskIcon(alert.riskLevel)}</span>
              <CardTitle className="text-base sm:text-lg font-bold truncate">
                {alert.title}
              </CardTitle>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-2">
              <Badge variant="secondary" className="text-xs">
                {alert.riskLevel.toUpperCase()}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="h-6 w-6 p-0 hover:bg-white/20"
              >
                <X className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <p className="text-sm mb-4 leading-relaxed">
            {alert.message}
          </p>
          
          {/* Weather Conditions Summary */}
          <div className="bg-black/20 rounded-lg p-3 mb-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-white/70">Storm Cells:</span>
                <span className="ml-2 font-semibold">{alert.conditions.stormCount}</span>
              </div>
              <div>
                <span className="text-white/70">Max Intensity:</span>
                <span className="ml-2 font-semibold">{alert.conditions.maxIntensity.toFixed(0)} dBZ</span>
              </div>
              <div>
                <span className="text-white/70">Nearest Storm:</span>
                <span className="ml-2 font-semibold">{formatDistance(alert.conditions.nearestDistance)}</span>
              </div>
              <div>
                <span className="text-white/70">Lightning:</span>
                <span className="ml-2 font-semibold">{alert.conditions.lightningCount} strikes</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onDismiss}
              className="flex-1 text-xs"
            >
              Got it
            </Button>
            {onOpenSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSettings}
                className="px-3 text-xs bg-white/10 border-white/20 hover:bg-white/20"
              >
                <Settings className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}