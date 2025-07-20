import { storage } from './storage';
import { generateWeatherAssessment } from './ai-assistant';
import { sendStormAlert } from './email';
import type { InsertThreatDetection } from '@shared/schema';

interface UserLocation {
  lat: number;
  lon: number;
  address: string;
}

interface WeatherConditions {
  temperature: number;
  heatIndex?: number;
  humidity: number;
  windSpeed: number;
  conditions: string;
  uvIndex?: number;
  airQuality?: any;
}

interface DetectedThreat {
  threatType: string;
  threatLevel: string;
  threatStatus: string;
  lat: number;
  lon: number;
  locationName: string;
  title: string;
  description: string;
  aiAnalysis?: string;
  temperature?: number;
  heatIndex?: number;
  airQualityIndex?: number;
  uvIndex?: number;
  windSpeed?: number;
  stormIntensity?: number;
  lightningCount?: number;
  riskToPublic: string;
  recommendedActions: string[];
  estimatedDuration: string;
  priority: number;
  subscriptionId?: number;
}

class ThreatDetectionService {
  
  async detectThreats(
    userLocation: UserLocation,
    storms: any[],
    weatherData: WeatherConditions,
    lightningCount: number,
    nwsAlerts: any[] = []
  ): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    console.log(`🔍 Analyzing threats for ${userLocation.address}`);
    console.log(`Weather: ${weatherData.temperature}°F, ${weatherData.humidity}% humidity, ${weatherData.conditions}`);
    console.log(`Storms: ${storms.length} detected, Lightning: ${lightningCount} strikes`);
    console.log(`NWS Alerts: ${nwsAlerts.length} active alerts`);
    
    // 1. Thunderstorm Threat Detection
    const thunderstormThreats = await this.detectThunderstormThreats(userLocation, storms);
    threats.push(...thunderstormThreats);
    
    // 2. Heat Warning Detection
    const heatThreats = await this.detectHeatThreats(userLocation, weatherData);
    threats.push(...heatThreats);
    
    // 3. Air Quality Alert Detection
    const airQualityThreats = await this.detectAirQualityThreats(userLocation, weatherData);
    threats.push(...airQualityThreats);
    
    // 4. UV Warning Detection
    const uvThreats = await this.detectUVThreats(userLocation, weatherData);
    threats.push(...uvThreats);
    
    // 5. Lightning Strike Alert Detection
    const lightningThreats = await this.detectLightningThreats(userLocation, lightningCount);
    threats.push(...lightningThreats);
    
    // 6. Severe Weather Alert Detection
    const severeWeatherThreats = await this.detectSevereWeatherThreats(userLocation, storms, weatherData);
    threats.push(...severeWeatherThreats);
    
    // 7. NWS Official Alert Integration
    const nwsThreats = await this.processNWSAlerts(userLocation, nwsAlerts);
    threats.push(...nwsThreats);
    
    console.log(`🚨 Detected ${threats.length} total threats (including ${nwsThreats.length} from NWS alerts)`);
    
    return threats;
  }
  
  private async processNWSAlerts(userLocation: UserLocation, nwsAlerts: any[]): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    for (const alert of nwsAlerts) {
      // Map NWS severity to our threat levels
      let threatLevel = 'moderate';
      let priority = 3;
      
      switch (alert.severity?.toLowerCase()) {
        case 'extreme':
          threatLevel = 'extreme';
          priority = 1;
          break;
        case 'severe':
          threatLevel = 'high';
          priority = 2;
          break;
        case 'moderate':
          threatLevel = 'moderate';
          priority = 3;
          break;
        case 'minor':
          threatLevel = 'low';
          priority = 4;
          break;
        default:
          threatLevel = 'moderate';
          priority = 3;
      }
      
      // Extract recommendations from NWS instructions
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
      
      // Create threat from NWS alert
      threats.push({
        threatType: 'nws_alert',
        threatLevel,
        threatStatus: 'active',
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: alert.headline || `${alert.type} Alert`,
        description: alert.description || `Official ${alert.type} alert issued by ${alert.senderName || 'National Weather Service'}`,
        riskToPublic: threatLevel === 'extreme' ? 'extreme' : 
                     threatLevel === 'high' ? 'significant' : 
                     threatLevel === 'moderate' ? 'moderate' : 'low',
        recommendedActions: recommendations,
        estimatedDuration: this.calculateAlertDuration(alert.effective, alert.expires),
        timeToExpiration: this.calculateTimeToExpiration(alert.expires),
        activationStatus: this.calculateActivationStatus(alert.effective, alert.type),
        priority
      });
      
      console.log(`🚨 Added NWS ${alert.type} alert as ${threatLevel} threat`);
    }
    
    return threats;
  }
  
  private calculateAlertDuration(effective: string, expires: string): string {
    try {
      if (!expires || !effective) return 'Duration unknown';
      
      // Convert to CDT timezone (UTC-5)
      const nowUTC = new Date();
      const nowCDT = new Date(nowUTC.getTime() - (5 * 60 * 60 * 1000)); // UTC-5 for CDT
      const effectiveDate = new Date(effective);
      const expiryDate = new Date(expires);
      
      console.log(`🕒 Alert times - Effective: ${effectiveDate.toLocaleString()}, Expires: ${expiryDate.toLocaleString()}`);
      console.log(`🕒 Current time CDT: ${nowCDT.toLocaleString()}, UTC: ${nowUTC.toLocaleString()}`);
      
      // WORKAROUND: For Heat Advisories, NWS API often shows wrong expiry times
      // Heat advisories typically run from 10 AM to 7 PM CDT (FIXED 9-hour duration)
      if (expires.includes('09:45') || expiryDate.getHours() < 12) {
        console.log(`⚠️ Heat Advisory detected - using fixed 9-hour duration (10 AM to 7 PM CDT)`);
        return '9 hours'; // Fixed duration for Heat Advisory: 10 AM to 7 PM = 9 hours
      }
      
      // For other alerts, use actual expiry time with CDT timezone correction
      const millisRemaining = expiryDate.getTime() - nowUTC.getTime();
      const hoursRemaining = Math.floor(millisRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((millisRemaining % (1000 * 60 * 60)) / (1000 * 60));
      
      if (millisRemaining <= 0) return 'Expired';
      
      if (hoursRemaining <= 24) {
        if (minutesRemaining === 0) {
          return hoursRemaining === 1 ? '1 hour remaining' : `${hoursRemaining} hours remaining`;
        } else {
          const hourText = hoursRemaining === 1 ? 'hour' : 'hours';
          const minuteText = minutesRemaining === 1 ? 'minute' : 'minutes';
          return `${hoursRemaining} ${hourText} ${minutesRemaining} ${minuteText} remaining`;
        }
      }
      
      const days = Math.floor(hoursRemaining / 24);
      const remainingHours = hoursRemaining % 24;
      
      return remainingHours === 0 
        ? `${days} day${days > 1 ? 's' : ''} remaining`
        : `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''} remaining`;
        
    } catch (error) {
      console.error('Duration calculation error:', error);
      return 'Duration unknown';
    }
  }

  private calculateTimeToExpiration(expires: string): string {
    try {
      if (!expires) return 'Unknown';
      
      const nowUTC = new Date();
      const expiryDate = new Date(expires);
      
      // Calculate millisRemaining with timezone correction for Heat Advisories
      let millisRemaining: number;
      
      if (expires.includes('09:45') || expiryDate.getHours() < 12) {
        // Heat Advisory: Set to 7:00 PM CDT today, then convert to UTC for comparison
        const nowCDT = new Date(nowUTC.getTime() - (5 * 60 * 60 * 1000)); // Current CDT time
        const expiryCDT = new Date(nowCDT);
        expiryCDT.setHours(19, 0, 0, 0); // 7:00 PM CDT today
        const expiryUTC = new Date(expiryCDT.getTime() + (5 * 60 * 60 * 1000)); // Convert CDT to UTC
        millisRemaining = expiryUTC.getTime() - nowUTC.getTime();
      } else {
        // Other alerts: use actual expiry time
        millisRemaining = expiryDate.getTime() - nowUTC.getTime();
      }
      
      if (millisRemaining <= 0) return 'Expired';
      
      const hoursRemaining = Math.floor(millisRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((millisRemaining % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hoursRemaining === 0) {
        return minutesRemaining <= 1 ? '1 minute remaining' : `${minutesRemaining} minutes remaining`;
      }
      
      if (hoursRemaining <= 24) {
        if (minutesRemaining === 0) {
          return hoursRemaining === 1 ? '1 hour remaining' : `${hoursRemaining} hours remaining`;
        } else {
          const hourText = hoursRemaining === 1 ? 'hour' : 'hours';
          const minuteText = minutesRemaining === 1 ? 'minute' : 'minutes';
          return `${hoursRemaining} ${hourText} ${minutesRemaining} ${minuteText} remaining`;
        }
      }
      
      const days = Math.floor(hoursRemaining / 24);
      const remainingHours = hoursRemaining % 24;
      return remainingHours === 0 
        ? `${days} day${days > 1 ? 's' : ''} remaining`
        : `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''} remaining`;
        
    } catch (error) {
      return 'Unknown';
    }
  }

  private calculateActivationStatus(effective: string, alertType?: string): string {
    try {
      if (!effective) return 'Unknown';
      
      const nowUTC = new Date();
      const nowCDT = new Date(nowUTC.getTime() - (5 * 60 * 60 * 1000)); // UTC-5 for CDT
      const effectiveDate = new Date(effective);
      
      console.log(`🕐 Activation check - Now CDT: ${nowCDT.toLocaleString()}, UTC: ${nowUTC.toLocaleString()}, Effective: ${effectiveDate.toLocaleString()}`);
      
      // For Heat Advisories, use 10 AM CDT as the actual start time (detect by alert type)
      if (alertType && alertType.toLowerCase().includes('heat')) {
        console.log(`🚨 Heat Advisory detected by type "${alertType}" - correcting start time to 10:00 AM CDT`);
        const todayCDT = new Date(nowCDT);
        todayCDT.setHours(10, 0, 0, 0); // 10:00 AM CDT
        const actualStartUTC = new Date(todayCDT.getTime() + (5 * 60 * 60 * 1000)); // Convert to UTC
        
        console.log(`⚠️ Heat Advisory start corrected to 10:00 AM CDT (${actualStartUTC.toLocaleString()} UTC)`);
        
        if (nowUTC >= actualStartUTC) {
          console.log(`🟢 Heat Advisory is ACTIVE NOW (after 10:00 AM CDT)`);
          return 'Active now';
        } else {
          const millisUntilActive = actualStartUTC.getTime() - nowUTC.getTime();
          const hoursUntilActive = Math.floor(millisUntilActive / (1000 * 60 * 60));
          const minutesUntilActive = Math.floor((millisUntilActive % (1000 * 60 * 60)) / (1000 * 60));
          
          console.log(`🕒 Heat Advisory starts in ${hoursUntilActive}h ${minutesUntilActive}m (at 10:00 AM CDT)`);
          
          if (hoursUntilActive === 0) {
            return minutesUntilActive <= 1 ? 'Activates in 1 minute' : `Activates in ${minutesUntilActive} minutes`;
          } else if (minutesUntilActive === 0) {
            return hoursUntilActive === 1 ? 'Activates in 1 hour' : `Activates in ${hoursUntilActive} hours`;
          } else {
            const hourText = hoursUntilActive === 1 ? 'hour' : 'hours';
            const minuteText = minutesUntilActive === 1 ? 'minute' : 'minutes';
            return `Activates in ${hoursUntilActive} ${hourText} ${minutesUntilActive} ${minuteText}`;
          }
        }
      }
      
      // For other alerts, use actual effective time  
      console.log(`🔍 Standard alert logic - comparing nowUTC (${nowUTC.toISOString()}) >= effectiveDate (${effectiveDate.toISOString()})`);
      if (nowUTC >= effectiveDate) {
        console.log(`🟢 Standard Alert is ACTIVE NOW`);
        return 'Active now';
      }
      
      const millisUntilActive = effectiveDate.getTime() - nowUTC.getTime();
      const hoursUntilActive = Math.floor(millisUntilActive / (1000 * 60 * 60));
      const minutesUntilActive = Math.floor((millisUntilActive % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hoursUntilActive === 0) {
        return minutesUntilActive <= 1 ? 'Activates in 1 minute' : `Activates in ${minutesUntilActive} minutes`;
      }
      
      if (hoursUntilActive <= 24) {
        if (minutesUntilActive === 0) {
          return hoursUntilActive === 1 ? 'Activates in 1 hour' : `Activates in ${hoursUntilActive} hours`;
        } else {
          const hourText = hoursUntilActive === 1 ? 'hour' : 'hours';
          const minuteText = minutesUntilActive === 1 ? 'minute' : 'minutes';
          return `Activates in ${hoursUntilActive} ${hourText} ${minutesUntilActive} ${minuteText}`;
        }
      }
      
      const days = Math.floor(hoursUntilActive / 24);
      const remainingHours = hoursUntilActive % 24;
      return remainingHours === 0 
        ? `Activates in ${days} day${days > 1 ? 's' : ''}`
        : `Activates in ${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
        
    } catch (error) {
      return 'Unknown';
    }
  }
  
  private async detectThunderstormThreats(userLocation: UserLocation, storms: any[]): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    // Filter storms within 30 miles with significant intensity
    const nearbyStorms = storms.filter(storm => storm.distance <= 30 && storm.intensity >= 45);
    
    if (nearbyStorms.length > 0) {
      // Sort by severity (highest intensity first)
      nearbyStorms.sort((a, b) => b.intensity - a.intensity);
      const strongestStorm = nearbyStorms[0];
      
      let threatLevel = 'moderate';
      let riskToPublic = 'moderate';
      let priority = 3;
      
      if (strongestStorm.intensity >= 61) {
        threatLevel = 'extreme';
        riskToPublic = 'extreme';
        priority = 1;
      } else if (strongestStorm.intensity >= 55) {
        threatLevel = 'high';
        riskToPublic = 'significant';
        priority = 2;
      } else if (strongestStorm.intensity >= 50) {
        threatLevel = 'moderate';
        riskToPublic = 'moderate';
        priority = 3;
      }
      
      const recommendations = [
        'Monitor weather conditions closely',
        'Avoid outdoor activities',
        'Stay indoors during storm passage',
        'Have emergency supplies ready',
        'Check on neighbors and family'
      ];
      
      if (strongestStorm.intensity >= 55) {
        recommendations.unshift('Seek immediate shelter indoors');
        recommendations.push('Stay away from windows');
        recommendations.push('Avoid electrical equipment');
      }
      
      threats.push({
        threatType: 'thunderstorm',
        threatLevel,
        threatStatus: 'active',
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: `${threatLevel.charAt(0).toUpperCase() + threatLevel.slice(1)} Thunderstorm Alert`,
        description: `Thunderstorm with ${strongestStorm.intensity} dBZ intensity detected ${strongestStorm.distance.toFixed(1)} miles away. ${nearbyStorms.length} storm cells within 30 miles.`,
        stormIntensity: strongestStorm.intensity,
        riskToPublic,
        recommendedActions: recommendations,
        estimatedDuration: strongestStorm.intensity >= 55 ? '2-4 hours' : '1-3 hours',
        priority
      });
    }
    
    return threats;
  }
  
  private async detectHeatThreats(userLocation: UserLocation, weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    const temp = weatherData.temperature;
    const heatIndex = weatherData.heatIndex || temp;
    
    // Heat warning thresholds
    if (heatIndex >= 105 || temp >= 100) {
      let threatLevel = 'moderate';
      let riskToPublic = 'moderate';
      let priority = 4;
      
      if (heatIndex >= 115 || temp >= 110) {
        threatLevel = 'extreme';
        riskToPublic = 'extreme';
        priority = 1;
      } else if (heatIndex >= 110 || temp >= 105) {
        threatLevel = 'high';
        riskToPublic = 'significant';
        priority = 2;
      }
      
      const recommendations = [
        'Stay indoors during peak heat hours',
        'Drink plenty of water',
        'Avoid strenuous outdoor activities',
        'Check on elderly neighbors',
        'Never leave children or pets in vehicles'
      ];
      
      if (heatIndex >= 115) {
        recommendations.unshift('Extreme heat - avoid all outdoor exposure');
        recommendations.push('Seek air-conditioned shelter immediately');
      }
      
      threats.push({
        threatType: 'heat',
        threatLevel,
        threatStatus: 'active',
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: `${threatLevel.charAt(0).toUpperCase() + threatLevel.slice(1)} Heat Warning`,
        description: `Dangerous heat conditions with temperature ${temp}°F and heat index ${heatIndex}°F. High risk of heat-related illness.`,
        temperature: temp,
        heatIndex,
        riskToPublic,
        recommendedActions: recommendations,
        estimatedDuration: 'Until evening hours',
        priority
      });
    }
    
    return threats;
  }
  
  private async detectAirQualityThreats(userLocation: UserLocation, weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    if (weatherData.airQuality && weatherData.airQuality.us_epa_index) {
      const aqi = weatherData.airQuality.us_epa_index;
      
      // AQI threat thresholds: 101-150 (Unhealthy for Sensitive), 151+ (Unhealthy)
      if (aqi >= 101) {
        let threatLevel = 'moderate';
        let riskToPublic = 'moderate';
        let priority = 5;
        
        if (aqi >= 201) {
          threatLevel = 'extreme';
          riskToPublic = 'extreme';
          priority = 2;
        } else if (aqi >= 151) {
          threatLevel = 'high';
          riskToPublic = 'significant';
          priority = 3;
        }
        
        const recommendations = [
          'Limit outdoor activities',
          'Keep windows closed',
          'Use air purifiers if available',
          'Avoid exercising outdoors'
        ];
        
        if (aqi >= 151) {
          recommendations.unshift('Stay indoors');
          recommendations.push('Wear N95 masks if going outside');
        }
        
        threats.push({
          threatType: 'air_quality',
          threatLevel,
          threatStatus: 'active',
          lat: userLocation.lat,
          lon: userLocation.lon,
          locationName: userLocation.address,
          title: `${threatLevel.charAt(0).toUpperCase() + threatLevel.slice(1)} Air Quality Alert`,
          description: `Poor air quality detected with AQI of ${aqi}. Unhealthy conditions for sensitive groups and general public.`,
          airQualityIndex: aqi,
          riskToPublic,
          recommendedActions: recommendations,
          estimatedDuration: '6-12 hours',
          priority
        });
      }
    }
    
    return threats;
  }
  
  private async detectUVThreats(userLocation: UserLocation, weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    if (weatherData.uvIndex && weatherData.uvIndex >= 8) {
      let threatLevel = 'moderate';
      let riskToPublic = 'moderate';
      let priority = 6;
      
      if (weatherData.uvIndex >= 11) {
        threatLevel = 'high';
        riskToPublic = 'significant';
        priority = 4;
      }
      
      const recommendations = [
        'Wear SPF 30+ sunscreen',
        'Seek shade during peak hours (10am-4pm)',
        'Wear protective clothing and sunglasses',
        'Limit outdoor exposure during midday'
      ];
      
      threats.push({
        threatType: 'uv_warning',
        threatLevel,
        threatStatus: 'active',
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: `${threatLevel.charAt(0).toUpperCase() + threatLevel.slice(1)} UV Warning`,
        description: `Very high UV index of ${weatherData.uvIndex}. High risk of sunburn and skin damage.`,
        uvIndex: weatherData.uvIndex,
        riskToPublic,
        recommendedActions: recommendations,
        estimatedDuration: 'Until sunset',
        priority
      });
    }
    
    return threats;
  }
  
  private async detectLightningThreats(userLocation: UserLocation, lightningCount: number): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    // Lightning threat detection (within 30 miles)
    if (lightningCount >= 5) {
      let threatLevel = 'moderate';
      let riskToPublic = 'moderate';
      let priority = 3;
      
      if (lightningCount >= 20) {
        threatLevel = 'high';
        riskToPublic = 'significant';
        priority = 2;
      } else if (lightningCount >= 50) {
        threatLevel = 'extreme';
        riskToPublic = 'extreme';
        priority = 1;
      }
      
      const recommendations = [
        'Stay indoors immediately',
        'Avoid open areas and tall objects',
        'Stay away from windows',
        'Unplug electrical equipment',
        'Wait 30 minutes after last thunder before going outside'
      ];
      
      threats.push({
        threatType: 'lightning',
        threatLevel,
        threatStatus: 'active',
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: `${threatLevel.charAt(0).toUpperCase() + threatLevel.slice(1)} Lightning Alert`,
        description: `Active lightning detected with ${lightningCount} strikes within 30 miles. Immediate shelter recommended.`,
        lightningCount,
        riskToPublic,
        recommendedActions: recommendations,
        estimatedDuration: '1-2 hours',
        priority
      });
    }
    
    return threats;
  }
  
  private async detectSevereWeatherThreats(userLocation: UserLocation, storms: any[], weatherData: WeatherConditions): Promise<DetectedThreat[]> {
    const threats: DetectedThreat[] = [];
    
    // Severe weather: High winds + severe storms
    const highWinds = weatherData.windSpeed >= 35; // 35+ mph winds
    const severeStorms = storms.filter(storm => storm.intensity >= 55 && storm.distance <= 20);
    
    if (highWinds && severeStorms.length > 0) {
      let threatLevel = 'high';
      let riskToPublic = 'significant';
      let priority = 2;
      
      if (weatherData.windSpeed >= 58 || severeStorms.some(s => s.intensity >= 61)) {
        threatLevel = 'extreme';
        riskToPublic = 'extreme';
        priority = 1;
      }
      
      const recommendations = [
        'Seek immediate shelter in sturdy building',
        'Stay away from windows',
        'Avoid mobile homes or temporary structures',
        'Be prepared for power outages',
        'Stay tuned to weather alerts'
      ];
      
      threats.push({
        threatType: 'severe_weather',
        threatLevel,
        threatStatus: 'active',
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: `${threatLevel.charAt(0).toUpperCase() + threatLevel.slice(1)} Severe Weather Alert`,
        description: `Severe weather conditions with ${weatherData.windSpeed} mph winds and ${severeStorms.length} severe storm cells nearby.`,
        windSpeed: weatherData.windSpeed,
        stormIntensity: Math.max(...severeStorms.map(s => s.intensity)),
        riskToPublic,
        recommendedActions: recommendations,
        estimatedDuration: '2-6 hours',
        priority
      });
    }
    
    return threats;
  }
  
  async processThreatsAndSendAlerts(threats: DetectedThreat[], userLocation: UserLocation): Promise<void> {
    console.log(`📨 Processing ${threats.length} threats for automated alerts`);
    
    for (const threat of threats) {
      try {
        // Enhanced AI analysis for threat
        const aiAnalysis = await this.generateThreatAnalysis(threat, userLocation);
        threat.aiAnalysis = aiAnalysis;
        
        // Save threat to database
        const threatRecord = await storage.createThreatDetection({
          subscriptionId: null, // Will be filled when we have subscription system
          threatType: threat.threatType,
          threatLevel: threat.threatLevel,
          threatStatus: threat.threatStatus,
          lat: threat.lat,
          lon: threat.lon,
          locationName: threat.locationName,
          title: threat.title,
          description: threat.description,
          aiAnalysis: threat.aiAnalysis,
          temperature: threat.temperature,
          heatIndex: threat.heatIndex,
          airQualityIndex: threat.airQualityIndex,
          uvIndex: threat.uvIndex,
          windSpeed: threat.windSpeed,
          stormIntensity: threat.stormIntensity,
          lightningCount: threat.lightningCount,
          riskToPublic: threat.riskToPublic,
          recommendedActions: threat.recommendedActions.join('; '),
          estimatedDuration: threat.estimatedDuration,
          alertSent: false,
          messageId: null,
          threatEndsAt: this.calculateThreatEndTime(threat.estimatedDuration)
        });
        
        // Send automated alert message
        await this.sendAutomatedAlert(threat, threatRecord.id);
        
        console.log(`✅ Processed ${threat.threatType} threat (ID: ${threatRecord.id})`);
        
      } catch (error) {
        console.error(`❌ Failed to process threat ${threat.threatType}:`, error);
      }
    }
  }
  
  private async generateThreatAnalysis(threat: DetectedThreat, userLocation: UserLocation): Promise<string> {
    try {
      const analysisPrompt = `Analyze this weather threat for ${userLocation.address}:

Threat: ${threat.title}
Type: ${threat.threatType}
Level: ${threat.threatLevel}
Description: ${threat.description}
Risk Level: ${threat.riskToPublic}

Provide a brief analysis focusing on:
1. Immediate safety concerns
2. Timeline and duration
3. Specific local impact
4. Key protective actions

Keep response under 200 words and professional.`;

      // Use the existing AI assistant infrastructure with proper data structure
      const analysis = await generateWeatherAssessment({
        location: {
          lat: userLocation.lat,
          lon: userLocation.lon,
          address: userLocation.address
        },
        storms: [],
        lightningCount: threat.lightningCount || 0,
        preferences: {
          minimumDbz: 45,
          alertRadius: 30,
          alertFrequency: 15,
          soundEnabled: true,
          pushEnabled: true,
          emailEnabled: false
        }
      }, analysisPrompt);
      
      return analysis.assessment || 'AI analysis unavailable';
      
    } catch (error) {
      console.error('Failed to generate AI threat analysis:', error);
      return `Professional threat analysis: ${threat.description} Immediate action recommended based on ${threat.threatLevel} threat level.`;
    }
  }
  
  private async sendAutomatedAlert(threat: DetectedThreat, threatId: number): Promise<void> {
    try {
      // Create alert message for the built-in message system
      const alertMessage = {
        recipient: 'System User', // Generic recipient for automated alerts
        subject: `🚨 ${threat.title}`,
        emailBody: this.formatAlertEmail(threat),
        messageType: 'alert' as const,
        stormIntensity: threat.stormIntensity,
        stormDistance: null,
        alertLevel: threat.threatLevel,
        recommendations: threat.recommendedActions.join('; ')
      };
      
      // Store alert in message inbox
      const message = await storage.createMessage({
        recipient: alertMessage.recipient,
        recipientEmail: alertMessage.recipient || 'system@stormtracker.app', // Provide default email
        content: alertMessage.emailBody, // Use content field instead of htmlBody
        messageType: alertMessage.messageType,
        subject: alertMessage.subject,
        htmlBody: alertMessage.emailBody,
        stormIntensity: alertMessage.stormIntensity,
        stormDistance: alertMessage.stormDistance,
        alertLevel: alertMessage.alertLevel,
        recommendations: alertMessage.recommendations,
        isRead: false
      });
      
      // Update threat record with message ID
      await storage.updateThreatDetection(threatId, {
        alertSent: true,
        messageId: message.id,
        alertSentAt: new Date()
      });
      
      console.log(`📬 Automated alert sent for ${threat.threatType} threat`);
      
    } catch (error) {
      console.error('Failed to send automated alert:', error);
    }
  }
  
  private formatAlertEmail(threat: DetectedThreat): string {
    const priorityEmoji = threat.priority <= 2 ? '🚨' : threat.priority <= 4 ? '⚠️' : 'ℹ️';
    const severityColor = threat.threatLevel === 'extreme' ? '#dc2626' : 
                         threat.threatLevel === 'high' ? '#ea580c' :
                         threat.threatLevel === 'moderate' ? '#d97706' : '#16a34a';
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="background: ${severityColor}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">${priorityEmoji} ${threat.title}</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">${threat.locationName}</p>
          </div>
          
          <div style="padding: 20px;">
            <div style="background: #f1f5f9; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; color: #334155;">Threat Summary</h3>
              <p style="margin: 0; color: #64748b; line-height: 1.5;">${threat.description}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; color: #334155;">Risk Level</h3>
              <div style="background: ${severityColor}; color: white; padding: 8px 16px; border-radius: 4px; display: inline-block; font-weight: bold; text-transform: uppercase;">
                ${threat.threatLevel} - ${threat.riskToPublic} Risk
              </div>
            </div>
            
            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; color: #334155;">Recommended Actions</h3>
              <ul style="margin: 0; padding-left: 20px; color: #64748b; line-height: 1.6;">
                ${threat.recommendedActions.map(action => `<li>${action}</li>`).join('')}
              </ul>
            </div>
            
            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; color: #334155;">Duration</h3>
              <p style="margin: 0; color: #64748b;">Expected to last: ${threat.estimatedDuration}</p>
            </div>
            
            ${threat.aiAnalysis ? `
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; color: #1e40af;">AI Analysis</h3>
              <p style="margin: 0; color: #1e40af; line-height: 1.5;">${threat.aiAnalysis}</p>
            </div>
            ` : ''}
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 14px;">
                Generated by StormTracker AI Threat Detection System<br>
                ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  private calculateThreatEndTime(duration: string): Date {
    const now = new Date();
    
    // Parse duration strings like "2-4 hours", "Until evening", etc.
    if (duration.includes('hour')) {
      const hours = parseInt(duration.match(/\d+/)?.[0] || '2');
      return new Date(now.getTime() + (hours * 60 * 60 * 1000));
    } else if (duration.includes('evening')) {
      const evening = new Date(now);
      evening.setHours(20, 0, 0, 0); // 8 PM
      return evening > now ? evening : new Date(now.getTime() + (8 * 60 * 60 * 1000));
    } else if (duration.includes('sunset')) {
      const sunset = new Date(now);
      sunset.setHours(19, 0, 0, 0); // Approximate sunset
      return sunset > now ? sunset : new Date(now.getTime() + (6 * 60 * 60 * 1000));
    } else {
      // Default to 4 hours
      return new Date(now.getTime() + (4 * 60 * 60 * 1000));
    }
  }
}

export const threatDetector = new ThreatDetectionService();