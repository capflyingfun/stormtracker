import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface RiskAlert {
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  alertType: string;
  title: string;
  message: string;
  conditions: {
    stormCount: number;
    maxIntensity: number;
    nearestDistance: number;
    nearestStormDirection?: number;
    lightningCount: number;
  };
  shouldAlert: boolean;
}

interface AlertPreferences {
  lightRainEnabled: boolean;
  moderateRainEnabled: boolean;
  heavyRainEnabled: boolean;
  veryHeavyRainEnabled: boolean;
  extremeStormEnabled: boolean;
  alertRadius: number;
  riskLevel: 'low' | 'medium' | 'high';
  alertFrequency: number;
  soundEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
}

export function useRiskAlerts() {
  const [currentAlert, setCurrentAlert] = useState<RiskAlert | null>(null);
  const [lastAlertTime, setLastAlertTime] = useState<number>(0);
  const [isAlertVisible, setIsAlertVisible] = useState(false);

  // Fetch user alert preferences
  const { data: preferences, isLoading: preferencesLoading } = useQuery<AlertPreferences>({
    queryKey: ['/api/alerts/preferences'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Assess weather risk
  const assessRisk = async (location: { lat: number; lon: number }, storms: any[], lightningCount: number = 0) => {
    if (!preferences || !location) return null;

    try {
      const response = await fetch('/api/risk/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: location.lat,
          lon: location.lon,
          storms: storms.map(storm => ({
            lat: storm.lat,
            lon: storm.lon,
            intensity: storm.intensity || storm.dbz || 0,
            distance: storm.distance
          })),
          lightningCount,
          preferences: {
            riskLevel: preferences.riskLevel,
            alertRadius: preferences.alertRadius,
            lightRainEnabled: preferences.lightRainEnabled,
            moderateRainEnabled: preferences.moderateRainEnabled,
            heavyRainEnabled: preferences.heavyRainEnabled,
            veryHeavyRainEnabled: preferences.veryHeavyRainEnabled,
            extremeStormEnabled: preferences.extremeStormEnabled,
          }
        })
      });

      if (response.ok) {
        const riskData = await response.json();
        return riskData;
      }
    } catch (error) {
      console.error('Risk assessment error:', error);
    }
    
    return null;
  };

  // Show alert if conditions are met
  const showAlert = (alert: RiskAlert) => {
    const now = Date.now();
    const timeSinceLastAlert = now - lastAlertTime;
    const minInterval = (preferences?.alertFrequency || 15) * 60 * 1000; // Convert minutes to milliseconds

    if (alert.shouldAlert && timeSinceLastAlert >= minInterval) {
      setCurrentAlert(alert);
      setIsAlertVisible(true);
      setLastAlertTime(now);

      // Play sound if enabled
      if (preferences?.soundEnabled) {
        playAlertSound(alert.riskLevel);
      }

      // Auto-dismiss after 10 seconds for low risk, 30 seconds for others
      const autoDismissTime = alert.riskLevel === 'low' ? 10000 : 30000;
      setTimeout(() => {
        setIsAlertVisible(false);
      }, autoDismissTime);
    }
  };

  // Play alert sound based on risk level
  const playAlertSound = (riskLevel: string) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Different tones for different risk levels
      switch (riskLevel) {
        case 'extreme':
          oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.2);
          setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.frequency.setValueAtTime(660, audioContext.currentTime);
            gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
            osc2.start();
            osc2.stop(audioContext.currentTime + 0.2);
          }, 300);
          break;
        case 'high':
          oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
        case 'medium':
          oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.2);
          break;
        default:
          oscillator.frequency.setValueAtTime(330, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.1);
      }
    } catch (error) {
      console.log('Audio not available:', error);
    }
  };

  // Dismiss current alert
  const dismissAlert = () => {
    setIsAlertVisible(false);
  };

  return {
    currentAlert,
    isAlertVisible,
    preferences,
    preferencesLoading,
    assessRisk,
    showAlert,
    dismissAlert,
  };
}