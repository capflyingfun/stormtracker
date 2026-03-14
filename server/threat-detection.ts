import { Database } from './storage';
import { DetectedThreat } from '../shared/schema';

interface UserLocation {
  lat: number;
  lon: number;
  address: string;
}

interface WeatherConditions {
  temp: number;
  humidity: number;
  pressure: number;
  uv: number;
  airQuality?: number;
}

interface NWSAlert {
  id: string;
  type: string;
  severity: string;
  headline: string;
  description: string;
  instruction: string;
  effective: string;
  expires: string;
  senderName: string;
}

export class ThreatDetectionService {
  constructor(private db: Database) {}

  async detectThreats(userLocation: UserLocation): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    try {
      // Process NWS alerts
      const nwsAlerts = await this.fetchNWSAlerts(userLocation.lat, userLocation.lon);
      if (nwsAlerts?.length > 0) {
        console.log(`🚨 Processing ${nwsAlerts.length} NWS alerts`);
        const alertThreats = await this.processNWSAlerts(nwsAlerts, userLocation);
        threats.push(...alertThreats);
      }
    } catch (error) {
      console.error('Error in threat detection:', error);
    }
    
    return threats;
  }

  // Placeholder methods for compatibility
  async detectThunderstormThreats(userLocation: UserLocation, storms: any[]): Promise<DetectedThreat[]> {
    return [];
  }

  async detectHeatThreats(userLocation: UserLocation, weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    return [];
  }

  async detectAirQualityThreats(userLocation: UserLocation, weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    return [];
  }

  async detectUVThreats(userLocation: UserLocation, weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    return [];
  }

  async detectLightningThreats(userLocation: UserLocation, lightningCount: number): Promise<DetectedThreat[]> {
    return [];
  }

  async detectSevereWeatherThreats(userLocation: UserLocation, weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    return [];
  }

  async processThreatsAndSendAlerts(userLocation: UserLocation): Promise<{ threatsDetected: number; alertsSent: number }> {
    const threats = await this.detectThreats(userLocation);
    return { threatsDetected: threats.length, alertsSent: 0 };
  }

  private async fetchNWSAlerts(lat: number, lon: number): Promise<NWSAlert[]> {
    try {
      const response = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
        timeout: 8000,
        headers: { 'User-Agent': 'StormTracker/1.0' }
      });
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return data?.features?.map((f: any) => ({
        id: f.id,
        type: f.properties.event,
        severity: f.properties.severity,
        headline: f.properties.headline,
        description: f.properties.description,
        instruction: f.properties.instruction,
        effective: f.properties.effective,
        expires: f.properties.expires,
        senderName: f.properties.senderName
      })) || [];
    } catch (error) {
      console.error('NWS alerts fetch failed:', error);
      return [];
    }
  }

  private async processNWSAlerts(alerts: NWSAlert[], userLocation: UserLocation): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    for (const alert of alerts) {
      const threatLevel = this.mapSeverityToThreatLevel(alert.severity);
      const priority = threatLevel === 'extreme' ? 10 : threatLevel === 'high' ? 8 : 6;
      
      const recommendations = [];
      if (alert.instruction) {
        const instructionParts = alert.instruction.split('.').filter((part: string) => part.trim().length > 10);
        recommendations.push(...instructionParts.slice(0, 5).map((part: string) => part.trim()));
      }
      
      if (recommendations.length === 0) {
        recommendations.push('Follow all official weather service guidance');
        recommendations.push('Monitor conditions closely');
        recommendations.push('Take appropriate safety precautions');
      }
      
      // Fixed description to show "National Weather Service alert" instead of "radar indicated"
      threats.push({
        threatType: 'nws_alert',
        threatLevel,
        threatStatus: 'active',
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: alert.headline || `${alert.type} until ${new Date(alert.expires).toLocaleDateString()}`,
        description: `National Weather Service alert: ${alert.description || alert.type}`,
        riskToPublic: threatLevel === 'extreme' ? 'extreme' : 
                     threatLevel === 'high' ? 'significant' : 
                     threatLevel === 'moderate' ? 'moderate' : 'low',
        recommendedActions: recommendations,
        estimatedDuration: this.calculateAlertDuration(alert.effective, alert.expires),
        priority
      });
      
      console.log(`🚨 Added NWS ${alert.type} alert as ${threatLevel} threat`);
    }
    
    return threats;
  }

  private mapSeverityToThreatLevel(severity: string): 'low' | 'moderate' | 'high' | 'extreme' {
    switch (severity?.toLowerCase()) {
      case 'extreme': return 'extreme';
      case 'severe': return 'high';
      case 'moderate': return 'moderate';
      default: return 'low';
    }
  }

  private calculateAlertDuration(effective: string, expires: string): string {
    try {
      if (!expires || !effective) return 'Duration unknown';
      
      const effectiveDate = new Date(effective);
      const expiryDate = new Date(expires);
      
      // Calculate actual duration from effective to expiry dates
      const totalDurationMs = expiryDate.getTime() - effectiveDate.getTime();
      const totalHours = Math.floor(totalDurationMs / (1000 * 60 * 60));
      
      if (totalDurationMs <= 0) return 'Duration unknown';
      
      if (totalHours <= 24) {
        return totalHours === 1 ? '1 hour' : `${totalHours} hours`;
      } else {
        const days = Math.floor(totalHours / 24);
        const remainingHours = totalHours % 24;
        return remainingHours === 0 
          ? `${days} day${days > 1 ? 's' : ''}`
          : `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
      }
      
    } catch (error) {
      console.error('Duration calculation error:', error);
      return 'Duration unknown';
    }
  }
}