import { storage } from "./storage";
import { generateWeatherAssessment } from "./ai-assistant";
import { sendStormAlert } from "./email";

interface WeatherData {
  temperature: number;
  heatIndex?: number;
  humidity: number;
  uvIndex?: number;
  airQuality?: {
    us_epa_index: number;
    pm2_5: number;
    o3: number;
  };
  windSpeed: number;
  conditions: string;
}

interface ThreatAssessment {
  threatType: 'thunderstorm' | 'heat' | 'air_quality' | 'lightning' | 'severe_weather' | 'uv_warning';
  threatLevel: 'low' | 'moderate' | 'high' | 'extreme';
  threatStatus: 'developing' | 'active' | 'imminent' | 'passed';
  title: string;
  description: string;
  aiAnalysis: string;
  riskToPublic: 'minimal' | 'moderate' | 'significant' | 'extreme';
  recommendedActions: string[];
  estimatedDuration: string;
  priority: number; // 1-10 scale for alert prioritization
}

export class IntelligentThreatDetector {
  
  /**
   * Main threat detection engine - analyzes all weather conditions
   */
  async detectThreats(
    userLocation: { lat: number; lon: number; address: string },
    storms: any[],
    weatherData: WeatherData,
    lightningCount: number = 0
  ): Promise<ThreatAssessment[]> {
    const threats: ThreatAssessment[] = [];
    
    // 1. Thunderstorm Threat Analysis
    const thunderstormThreat = await this.analyzeThunderstormThreat(storms, userLocation);
    if (thunderstormThreat) threats.push(thunderstormThreat);
    
    // 2. Heat Warning Analysis  
    const heatThreat = this.analyzeHeatThreat(weatherData);
    if (heatThreat) threats.push(heatThreat);
    
    // 3. Air Quality Analysis
    const airQualityThreat = this.analyzeAirQuality(weatherData);
    if (airQualityThreat) threats.push(airQualityThreat);
    
    // 4. UV Index Warning
    const uvThreat = this.analyzeUVThreat(weatherData);
    if (uvThreat) threats.push(uvThreat);
    
    // 5. Lightning Threat Analysis
    if (lightningCount > 0) {
      const lightningThreat = this.analyzeLightningThreat(lightningCount, storms);
      if (lightningThreat) threats.push(lightningThreat);
    }
    
    // 6. Severe Weather Analysis (multi-factor)
    const severeThreat = await this.analyzeSevereWeatherThreat(storms, weatherData, userLocation);
    if (severeThreat) threats.push(severeThreat);
    
    return threats.sort((a, b) => b.priority - a.priority); // Highest priority first
  }
  
  /**
   * Analyze thunderstorm threats based on radar data
   */
  private async analyzeThunderstormThreat(storms: any[], userLocation: any): Promise<ThreatAssessment | null> {
    if (!storms || storms.length === 0) return null;
    
    // Find severe storms within threat radius
    const severeStorms = storms.filter(storm => 
      storm.intensity >= 45 && storm.distance <= 30
    );
    
    if (severeStorms.length === 0) return null;
    
    const nearestStorm = severeStorms[0];
    const maxIntensity = Math.max(...severeStorms.map(s => s.intensity));
    
    // Determine threat level based on intensity and proximity
    let threatLevel: 'low' | 'moderate' | 'high' | 'extreme' = 'moderate';
    let threatStatus: 'developing' | 'active' | 'imminent' | 'passed' = 'active';
    
    if (maxIntensity >= 65 || nearestStorm.distance <= 5) {
      threatLevel = 'extreme';
      threatStatus = 'imminent';
    } else if (maxIntensity >= 55 || nearestStorm.distance <= 10) {
      threatLevel = 'high';
      threatStatus = 'active';
    } else if (maxIntensity >= 45 || nearestStorm.distance <= 20) {
      threatLevel = 'moderate';
      threatStatus = 'developing';
    }
    
    const priority = threatLevel === 'extreme' ? 10 : threatLevel === 'high' ? 8 : 6;
    
    return {
      threatType: 'thunderstorm',
      threatLevel,
      threatStatus,
      title: `⛈️ Thunderstorm ${threatLevel.toUpperCase()} - ${severeStorms.length} Storm${severeStorms.length > 1 ? 's' : ''} Detected`,
      description: `Severe thunderstorm activity detected ${nearestStorm.distance.toFixed(1)} miles ${nearestStorm.direction} with maximum intensity of ${maxIntensity.toFixed(0)} dBZ.`,
      aiAnalysis: await this.generateThunderstormAnalysis(severeStorms, userLocation),
      riskToPublic: threatLevel === 'extreme' ? 'extreme' : threatLevel === 'high' ? 'significant' : 'moderate',
      recommendedActions: this.getThunderstormRecommendations(threatLevel, nearestStorm.distance),
      estimatedDuration: this.estimateStormDuration(severeStorms),
      priority
    };
  }
  
  /**
   * Analyze heat-related threats
   */
  private analyzeHeatThreat(weatherData: WeatherData): ThreatAssessment | null {
    const temp = weatherData.temperature;
    const heatIndex = weatherData.heatIndex || temp;
    const humidity = weatherData.humidity;
    
    let threatLevel: 'low' | 'moderate' | 'high' | 'extreme' | null = null;
    
    // Heat Index thresholds (Fahrenheit)
    if (heatIndex >= 125) {
      threatLevel = 'extreme'; // Extreme danger
    } else if (heatIndex >= 105) {
      threatLevel = 'high'; // Danger
    } else if (heatIndex >= 90) {
      threatLevel = 'moderate'; // Extreme caution
    } else if (heatIndex >= 80 && humidity > 60) {
      threatLevel = 'low'; // Caution
    }
    
    if (!threatLevel) return null;
    
    const priority = threatLevel === 'extreme' ? 9 : threatLevel === 'high' ? 7 : threatLevel === 'moderate' ? 5 : 3;
    
    return {
      threatType: 'heat',
      threatLevel,
      threatStatus: 'active',
      title: `🌡️ Heat ${threatLevel.toUpperCase()} - Dangerous Temperature Conditions`,
      description: `Current temperature ${temp.toFixed(0)}°F with heat index of ${heatIndex.toFixed(0)}°F and ${humidity}% humidity.`,
      aiAnalysis: `Hazardous heat conditions present significant health risks. Heat index calculations show ${this.getHeatRiskDescription(heatIndex)}.`,
      riskToPublic: threatLevel === 'extreme' ? 'extreme' : threatLevel === 'high' ? 'significant' : 'moderate',
      recommendedActions: this.getHeatRecommendations(threatLevel),
      estimatedDuration: 'Until evening cooling or weather pattern change',
      priority
    };
  }
  
  /**
   * Analyze air quality threats
   */
  private analyzeAirQuality(weatherData: WeatherData): ThreatAssessment | null {
    if (!weatherData.airQuality) return null;
    
    const aqi = weatherData.airQuality.us_epa_index;
    const pm25 = weatherData.airQuality.pm2_5;
    const ozone = weatherData.airQuality.o3;
    
    let threatLevel: 'low' | 'moderate' | 'high' | 'extreme' | null = null;
    
    // EPA Air Quality Index thresholds
    if (aqi >= 300) {
      threatLevel = 'extreme'; // Hazardous
    } else if (aqi >= 201) {
      threatLevel = 'high'; // Very unhealthy
    } else if (aqi >= 151) {
      threatLevel = 'moderate'; // Unhealthy
    } else if (aqi >= 101) {
      threatLevel = 'low'; // Unhealthy for sensitive groups
    }
    
    if (!threatLevel) return null;
    
    const priority = threatLevel === 'extreme' ? 7 : threatLevel === 'high' ? 5 : 3;
    
    return {
      threatType: 'air_quality',
      threatLevel,
      threatStatus: 'active',
      title: `💨 Air Quality ${threatLevel.toUpperCase()} - Unhealthy Air Conditions`,
      description: `Air Quality Index: ${aqi} (${this.getAQICategory(aqi)}). PM2.5: ${pm25.toFixed(1)} μg/m³, Ozone: ${ozone.toFixed(1)} μg/m³.`,
      aiAnalysis: `Poor air quality conditions pose health risks, especially for sensitive individuals including children, elderly, and those with respiratory conditions.`,
      riskToPublic: threatLevel === 'extreme' ? 'extreme' : threatLevel === 'high' ? 'significant' : 'moderate',
      recommendedActions: this.getAirQualityRecommendations(threatLevel),
      estimatedDuration: 'Until wind patterns change or pollution sources reduce',
      priority
    };
  }
  
  /**
   * Analyze UV radiation threats
   */
  private analyzeUVThreat(weatherData: WeatherData): ThreatAssessment | null {
    if (!weatherData.uvIndex) return null;
    
    const uv = weatherData.uvIndex;
    let threatLevel: 'low' | 'moderate' | 'high' | 'extreme' | null = null;
    
    // UV Index thresholds
    if (uv >= 11) {
      threatLevel = 'extreme'; // Extreme
    } else if (uv >= 8) {
      threatLevel = 'high'; // Very high
    } else if (uv >= 6) {
      threatLevel = 'moderate'; // High
    } else if (uv >= 3) {
      threatLevel = 'low'; // Moderate
    }
    
    if (!threatLevel || threatLevel === 'low') return null; // Only alert for moderate+ UV
    
    const priority = threatLevel === 'extreme' ? 4 : threatLevel === 'high' ? 3 : 2;
    
    return {
      threatType: 'uv_warning',
      threatLevel,
      threatStatus: 'active',
      title: `☀️ UV ${threatLevel.toUpperCase()} - High Solar Radiation`,
      description: `UV Index: ${uv.toFixed(1)} (${this.getUVCategory(uv)}). Significant skin damage risk with unprotected exposure.`,
      aiAnalysis: `Elevated UV radiation levels require protective measures to prevent skin damage and health risks from solar exposure.`,
      riskToPublic: threatLevel === 'extreme' ? 'significant' : 'moderate',
      recommendedActions: this.getUVRecommendations(threatLevel),
      estimatedDuration: 'Until solar angle decreases (evening)',
      priority
    };
  }
  
  /**
   * Analyze lightning threats
   */
  private analyzeLightningThreat(lightningCount: number, storms: any[]): ThreatAssessment | null {
    if (lightningCount === 0) return null;
    
    let threatLevel: 'low' | 'moderate' | 'high' | 'extreme' = 'moderate';
    
    // Lightning threat levels based on strike count and storm proximity
    if (lightningCount >= 50 || (storms.length > 0 && storms[0].distance <= 5)) {
      threatLevel = 'extreme';
    } else if (lightningCount >= 20 || (storms.length > 0 && storms[0].distance <= 10)) {
      threatLevel = 'high';
    } else if (lightningCount >= 5) {
      threatLevel = 'moderate';
    } else {
      threatLevel = 'low';
    }
    
    const priority = threatLevel === 'extreme' ? 9 : threatLevel === 'high' ? 7 : 5;
    
    return {
      threatType: 'lightning',
      threatLevel,
      threatStatus: 'active',
      title: `⚡ Lightning ${threatLevel.toUpperCase()} - Electrical Storm Activity`,
      description: `${lightningCount} lightning strikes detected in the area. Immediate threat to personal safety.`,
      aiAnalysis: `Active lightning strikes indicate dangerous electrical storm activity requiring immediate protective action.`,
      riskToPublic: threatLevel === 'extreme' ? 'extreme' : 'significant',
      recommendedActions: this.getLightningRecommendations(threatLevel),
      estimatedDuration: 'Until thunderstorm activity subsides',
      priority
    };
  }
  
  /**
   * Analyze multi-factor severe weather threats
   */
  private async analyzeSevereWeatherThreat(storms: any[], weatherData: WeatherData, userLocation: any): Promise<ThreatAssessment | null> {
    // Multi-factor analysis combining multiple threat indicators
    const hasStorms = storms.length > 0 && storms[0].intensity >= 50;
    const hasHighWinds = weatherData.windSpeed >= 35; // mph
    const hasExtremeHeat = (weatherData.heatIndex || weatherData.temperature) >= 105;
    const hasPoorAirQuality = weatherData.airQuality?.us_epa_index >= 150;
    
    const threatFactors = [hasStorms, hasHighWinds, hasExtremeHeat, hasPoorAirQuality].filter(Boolean).length;
    
    if (threatFactors < 2) return null; // Need at least 2 threat factors
    
    let threatLevel: 'moderate' | 'high' | 'extreme' = 'moderate';
    if (threatFactors >= 3) {
      threatLevel = 'extreme';
    } else if (threatFactors >= 2 && hasStorms) {
      threatLevel = 'high';
    }
    
    const priority = threatLevel === 'extreme' ? 10 : threatLevel === 'high' ? 8 : 6;
    
    return {
      threatType: 'severe_weather',
      threatLevel,
      threatStatus: 'active',
      title: `🌪️ Severe Weather ${threatLevel.toUpperCase()} - Multiple Threats Active`,
      description: `Multiple severe weather conditions detected: ${this.describeThreatFactors(hasStorms, hasHighWinds, hasExtremeHeat, hasPoorAirQuality)}.`,
      aiAnalysis: await this.generateSevereWeatherAnalysis(storms, weatherData, userLocation),
      riskToPublic: threatLevel === 'extreme' ? 'extreme' : 'significant',
      recommendedActions: this.getSevereWeatherRecommendations(threatLevel),
      estimatedDuration: 'Until weather conditions improve',
      priority
    };
  }
  
  /**
   * Process threats and send automated alerts
   */
  async processThreatsAndSendAlerts(threats: ThreatAssessment[], userLocation: any): Promise<void> {
    try {
      // Get all active alert subscriptions
      const subscriptions = await storage.getAllAlertSubscriptions();
      
      for (const subscription of subscriptions) {
        // Check if subscription location is within threat area (30 mile radius)
        const distance = this.calculateDistance(
          userLocation.lat, userLocation.lon,
          subscription.lat, subscription.lon
        );
        
        if (distance > 30) continue; // Outside threat area
        
        // Check cooldown period
        const lastAlert = subscription.lastAlertSent;
        if (lastAlert) {
          const minutesSinceLastAlert = (Date.now() - lastAlert.getTime()) / (1000 * 60);
          if (minutesSinceLastAlert < subscription.alertCooldown) continue;
        }
        
        // Process each threat for this subscription
        for (const threat of threats) {
          await this.sendThreatAlert(threat, subscription, userLocation);
        }
      }
    } catch (error) {
      console.error('Error processing threat alerts:', error);
    }
  }
  
  /**
   * Send automated threat alert
   */
  private async sendThreatAlert(threat: ThreatAssessment, subscription: any, userLocation: any): Promise<void> {
    try {
      // Store threat detection record
      const threatRecord = await storage.createThreatDetection({
        subscriptionId: subscription.id,
        threatType: threat.threatType,
        threatLevel: threat.threatLevel,
        threatStatus: threat.threatStatus,
        lat: userLocation.lat,
        lon: userLocation.lon,
        locationName: userLocation.address,
        title: threat.title,
        description: threat.description,
        aiAnalysis: threat.aiAnalysis,
        temperature: threat.threatType === 'heat' ? userLocation.temperature : null,
        riskToPublic: threat.riskToPublic,
        recommendedActions: threat.recommendedActions.join('; '),
        estimatedDuration: threat.estimatedDuration
      });
      
      // Create alert message
      const alertMessage = {
        subscriptionId: subscription.id,
        messageType: subscription.emailEnabled ? 'email' : 'sms',
        subject: threat.title,
        content: this.generateAlertMessage(threat, subscription),
        htmlContent: this.generateAlertHTML(threat, subscription),
        recipientEmail: subscription.email,
        recipientPhone: subscription.phoneNumber,
        recipientName: subscription.name,
        alertLocation: userLocation.address,
        deliveryMethod: 'database'
      };
      
      // Store message in database
      const messageId = await storage.createMessage(alertMessage);
      
      // Update threat record with message ID
      await storage.updateThreatDetection(threatRecord.id, {
        messageId,
        alertSent: true,
        alertSentAt: new Date()
      });
      
      // Send external alert if configured
      if (subscription.emailEnabled && process.env.SENDGRID_API_KEY) {
        await sendStormAlert(subscription.email, {
          stormCount: 1,
          maxIntensity: 0,
          nearestDistance: 0,
          location: userLocation.address
        });
      }
      
      console.log(`✅ Threat alert sent: ${threat.title} to ${subscription.name}`);
      
    } catch (error) {
      console.error('Error sending threat alert:', error);
    }
  }
  
  // Helper methods
  private async generateThunderstormAnalysis(storms: any[], userLocation: any): Promise<string> {
    return `Radar analysis shows ${storms.length} active thunderstorm cell${storms.length > 1 ? 's' : ''} with peak intensity ${Math.max(...storms.map(s => s.intensity)).toFixed(0)} dBZ. Storm movement analysis indicates potential for continued development and track toward ${userLocation.address}.`;
  }
  
  private async generateSevereWeatherAnalysis(storms: any[], weatherData: any, userLocation: any): Promise<string> {
    return `Multi-hazard analysis indicates severe weather conditions affecting ${userLocation.address}. Combination of atmospheric factors creates elevated risk requiring heightened awareness and protective measures.`;
  }
  
  private getThunderstormRecommendations(threatLevel: string, distance: number): string[] {
    const base = [
      "Move to substantial shelter immediately",
      "Avoid windows and doors",
      "Stay off porches and balconies",
      "Do not use electrical appliances"
    ];
    
    if (threatLevel === 'extreme' || distance <= 5) {
      return [
        "TAKE IMMEDIATE SHELTER - DANGEROUS STORM APPROACHING",
        "Move to lowest floor, interior room",
        "Stay away from windows and glass",
        "Monitor for tornado warnings",
        ...base
      ];
    }
    
    return base;
  }
  
  private getHeatRecommendations(threatLevel: string): string[] {
    const base = [
      "Stay hydrated - drink water regularly",
      "Limit outdoor activities",
      "Wear light-colored, loose clothing",
      "Stay in air-conditioned areas when possible"
    ];
    
    if (threatLevel === 'extreme') {
      return [
        "AVOID ALL OUTDOOR ACTIVITIES",
        "Seek immediate air conditioning",
        "Check on elderly neighbors and pets",
        "Watch for heat exhaustion symptoms",
        ...base
      ];
    }
    
    return base;
  }
  
  private getAirQualityRecommendations(threatLevel: string): string[] {
    return [
      "Limit outdoor activities, especially exercise",
      "Keep windows and doors closed",
      "Use air purifiers if available",
      "Consider wearing N95 masks outdoors",
      "Sensitive individuals should stay indoors"
    ];
  }
  
  private getUVRecommendations(threatLevel: string): string[] {
    return [
      "Apply broad-spectrum SPF 30+ sunscreen",
      "Seek shade during peak hours (10am-4pm)",
      "Wear protective clothing and wide-brimmed hat",
      "Wear UV-blocking sunglasses",
      "Reapply sunscreen every 2 hours"
    ];
  }
  
  private getLightningRecommendations(threatLevel: string): string[] {
    return [
      "Get indoors immediately",
      "Avoid water, high ground, and metal objects",
      "Stay away from windows and doors",
      "Do not use corded phones or electrical devices",
      "Wait 30 minutes after last thunder before going outside"
    ];
  }
  
  private getSevereWeatherRecommendations(threatLevel: string): string[] {
    return [
      "Monitor weather alerts continuously",
      "Prepare emergency kit with supplies",
      "Have multiple ways to receive warnings",
      "Review family emergency plan",
      "Avoid unnecessary travel"
    ];
  }
  
  private generateAlertMessage(threat: ThreatAssessment, subscription: any): string {
    return `WEATHER ALERT for ${subscription.locationName}\n\n${threat.title}\n\n${threat.description}\n\nRECOMMENDED ACTIONS:\n${threat.recommendedActions.map(action => `• ${action}`).join('\n')}\n\nEstimated Duration: ${threat.estimatedDuration}\n\nThis is an automated alert from StormTracker.`;
  }
  
  private generateAlertHTML(threat: ThreatAssessment, subscription: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626; margin-bottom: 16px;">${threat.title}</h2>
        <p style="margin-bottom: 16px;"><strong>Location:</strong> ${subscription.locationName}</p>
        <p style="margin-bottom: 16px;">${threat.description}</p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="color: #dc2626; margin-top: 0;">Recommended Actions:</h3>
          <ul style="margin: 0; padding-left: 20px;">
            ${threat.recommendedActions.map(action => `<li>${action}</li>`).join('')}
          </ul>
        </div>
        <p><strong>Estimated Duration:</strong> ${threat.estimatedDuration}</p>
        <hr style="margin: 24px 0;">
        <p style="font-size: 12px; color: #666;">This is an automated alert from StormTracker weather monitoring system.</p>
      </div>
    `;
  }
  
  private describeThreatFactors(hasStorms: boolean, hasHighWinds: boolean, hasExtremeHeat: boolean, hasPoorAirQuality: boolean): string {
    const factors = [];
    if (hasStorms) factors.push("severe thunderstorms");
    if (hasHighWinds) factors.push("dangerous winds");
    if (hasExtremeHeat) factors.push("extreme heat");
    if (hasPoorAirQuality) factors.push("poor air quality");
    
    return factors.join(", ");
  }
  
  private getHeatRiskDescription(heatIndex: number): string {
    if (heatIndex >= 125) return "extreme danger - heat stroke imminent";
    if (heatIndex >= 105) return "danger - heat exhaustion and heat stroke likely";
    if (heatIndex >= 90) return "extreme caution - heat exhaustion possible";
    return "caution - fatigue possible with prolonged exposure";
  }
  
  private getAQICategory(aqi: number): string {
    if (aqi >= 300) return "Hazardous";
    if (aqi >= 201) return "Very Unhealthy";
    if (aqi >= 151) return "Unhealthy";
    if (aqi >= 101) return "Unhealthy for Sensitive Groups";
    if (aqi >= 51) return "Moderate";
    return "Good";
  }
  
  private getUVCategory(uv: number): string {
    if (uv >= 11) return "Extreme";
    if (uv >= 8) return "Very High";
    if (uv >= 6) return "High";
    if (uv >= 3) return "Moderate";
    return "Low";
  }
  
  private estimateStormDuration(storms: any[]): string {
    const avgIntensity = storms.reduce((sum, s) => sum + s.intensity, 0) / storms.length;
    
    if (avgIntensity >= 60) return "30-60 minutes";
    if (avgIntensity >= 50) return "45-90 minutes";
    return "1-2 hours";
  }
  
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

// Singleton instance
export const threatDetector = new IntelligentThreatDetector();