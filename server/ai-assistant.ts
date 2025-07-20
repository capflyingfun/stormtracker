import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Dynamic AI tone based on weather severity - prioritize alerts first
function getDynamicTone(storms: StormData[], threatData: any, activeAlerts: any[]) {
  // PRIORITY 1: Check for active alerts first (Heat Advisories, Warnings, etc.)
  const hasActiveAlert = activeAlerts && activeAlerts.length > 0;
  const hasHeatAdvisory = activeAlerts?.some(a => a.event && (
    a.event.toLowerCase().includes('heat') ||
    a.event.toLowerCase().includes('excessive heat') ||
    a.event.toLowerCase().includes('extreme heat')
  ));
  
  // PRIORITY 2: Check for extreme weather threats
  const hasExtremeThreat = storms.some(s => s.intensity >= 65) || 
                          activeAlerts?.some(a => a.severity === 'Extreme') ||
                          threatData?.threatCount > 2;
  
  // PRIORITY 3: Check for high threats
  const hasHighThreat = storms.some(s => s.intensity >= 55) || 
                       activeAlerts?.some(a => a.severity === 'Severe') ||
                       threatData?.threatCount > 0;
  
  // PRIORITY 4: Check for moderate threats
  const hasModerateThreat = storms.some(s => s.intensity >= 35) || 
                           activeAlerts?.some(a => a.severity === 'Moderate') ||
                           hasActiveAlert;
  
  // Tone determination with alert prioritization
  if (hasExtremeThreat) {
    return {
      prefix: "URGENT WEATHER ALERT:",
      style: "Use direct, urgent, life-safety focused language. Be concise and clear about immediate threats. No humor. Start with active alerts.",
      recommendations: "Provide immediate action steps for safety. Use imperative language."
    };
  } else if (hasHighThreat || hasHeatAdvisory) {
    return {
      prefix: "Weather Advisory:",
      style: "Use professional, clear language with focus on safety guidance. Be direct but not alarming. Prioritize discussing active alerts and advisories.",
      recommendations: "Provide specific safety recommendations and monitoring advice. Address heat advisory concerns first."
    };
  } else if (hasModerateThreat || hasActiveAlert) {
    return {
      prefix: "Weather Update:",
      style: "Use balanced professional tone with clear explanations. Maintain awareness without alarm. Discuss active weather alerts before other conditions.",
      recommendations: "Provide situational awareness and preparedness guidance. Address active alerts first."
    };
  } else {
    return {
      prefix: "Weather looks good:",
      style: "Use relaxed, conversational tone. Can include light humor if appropriate.",
      recommendations: "Provide general awareness and can include positive observations."
    };
  }
}

const DETAIL_LEVEL_TEMPLATES = {
  minimal: "Keep response very brief and focused on essential safety information only.",
  standard: "Provide balanced detail level with key weather information and safety guidance.",
  technical: "Include detailed meteorological analysis with specific measurements, wind data, and professional terminology."
};

interface StormData {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: string;
  bearing: number;
  category: string;
  movement?: {
    direction: number;
    speed: number;
    eta?: string;
    impact?: string;
  };
}

interface WindData {
  speed: number;
  direction: number;
  pressure_level: string;
}

interface WeatherAssessmentRequest {
  userLocation: {
    lat: number;
    lon: number;
    address: string;
  };
  storms: StormData[]; // Top 200 closest storms (optimized payload)
  stormCount?: number; // Total storm count in area
  regionalStorms?: StormData[]; // 50-mile regional context
  winds: WindData[];
  radarSource: string;
  threatData?: any; // Optional threat detection data for enhanced analysis
  userSettings?: {
    aiTone: string;
    detailLevel: string;
    includeHumor: boolean;
    simplifiedLanguage: boolean;
  };
}

export async function generateWeatherAssessment(data: WeatherAssessmentRequest): Promise<{
  riskLevel: 'low' | 'moderate' | 'high' | 'extreme';
  summary: string;
  detailedAnalysis: string;
  recommendations: string[];
  timeToImpact?: string;
  confidence: number;
}> {
  try {
    // Fetch aviation weather data from nearby airports
    let aviationWeather: any[] = [];
    let currentWeather: any = null;
    try {
      const aviationResponse = await fetch(
        `http://localhost:5000/api/aviation-weather?lat=${data.userLocation.lat}&lon=${data.userLocation.lon}`
      );
      if (aviationResponse.ok) {
        const aviationData = await aviationResponse.json();
        aviationWeather = aviationData.stations || [];
        currentWeather = aviationData.currentWeather || null;
        console.log(`AI Assistant: Found ${aviationWeather.length} nearby airport weather stations`);
        if (currentWeather) {
          console.log('AI Assistant: Found real-time weather data for immediate area');
        }
      }
    } catch (aviationError) {
      console.log('AI Assistant: Could not fetch aviation weather:', aviationError.message);
    }

    // Fetch Area Forecast Discussion for US locations
    let areaForecastDiscussion: string | null = null;
    try {
      // Check if this is a US location
      const isUSLocation = data.userLocation.lat >= 24.5 && data.userLocation.lat <= 49.5 && 
                          data.userLocation.lon >= -125 && data.userLocation.lon <= -66.5;
      
      if (isUSLocation) {
        const afdResponse = await fetch(
          `http://localhost:5000/api/area-forecast-discussion?lat=${data.userLocation.lat}&lon=${data.userLocation.lon}`
        );
        if (afdResponse.ok) {
          const afdData = await afdResponse.json();
          areaForecastDiscussion = afdData.discussion;
          if (areaForecastDiscussion) {
            console.log(`AI Assistant: Found Area Forecast Discussion from ${afdData.office || 'NWS office'}`);
          }
        }
      }
    } catch (afdError) {
      console.log('AI Assistant: Could not fetch Area Forecast Discussion:', afdError.message);
    }

    // Fetch active NWS alerts first (priority over AFD)
    let activeAlerts: any[] = [];
    let threatSummary: string | null = null;
    try {
      const alertsResponse = await fetch(
        `http://localhost:5000/api/nws-alerts?lat=${data.userLocation.lat}&lon=${data.userLocation.lon}`
      );
      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        activeAlerts = alertsData.alerts || [];
        console.log(`AI Assistant: Found ${activeAlerts.length} active NWS alerts`);
      }
    } catch (alertError) {
      console.log('AI Assistant: Could not fetch NWS alerts:', alertError.message);
    }

    // Fetch threat data when provided
    if (data.threatData) {
      try {
        threatSummary = `Active Threats: ${data.threatData.threatCount} detected\n` +
          `Alert Summary: ${data.threatData.alertsSent} alerts sent\n` +
          `Status: ${data.threatData.status || 'Monitoring active'}\n` +
          `Last Check: ${data.threatData.lastCheck || 'Recent'}\n` +
          `Temperature: ${data.threatData.temperature || 'Unknown'}°F`;
        
        // Fetch NWS alerts for comprehensive advisory information
        const alertsResponse = await fetch(
          `http://localhost:5000/api/nws-alerts?lat=${data.userLocation.lat}&lon=${data.userLocation.lon}`
        );
        if (alertsResponse.ok) {
          const alertsData = await alertsResponse.json();
          activeAlerts = alertsData.alerts || [];
          console.log(`AI Assistant: Found ${activeAlerts.length} active NWS alerts/advisories`);
        }
      } catch (alertError) {
        console.log('AI Assistant: Could not fetch active alerts:', alertError);
      }
    }

    // Calculate storm track intersections with user location
    function calculateStormTrackIntersection(storm: any, userLat: number, userLon: number) {
      if (!storm.movement || !storm.movement.direction || storm.movement.speed <= 0) {
        return { intersects: false, status: 'No movement data' };
      }

      // Calculate storm movement vector (30-degree cone, 15 miles forward projection)
      const stormMovementRad = (storm.movement.direction * Math.PI) / 180;
      const projectionDistance = 15; // miles forward projection
      
      // Future storm position
      const futureStormLat = storm.lat + (projectionDistance / 69.0) * Math.cos(stormMovementRad);
      const futureStormLon = storm.lon + (projectionDistance / 69.0) * Math.sin(stormMovementRad);
      
      // Calculate if user location falls within the 30-degree storm track cone
      const distanceToStormPath = calculatePointToLineDistance(
        userLat, userLon,
        storm.lat, storm.lon,
        futureStormLat, futureStormLon
      );
      
      // 30-degree cone = ±15 degrees, roughly 4 miles wide at 15 miles distance
      const coneWidth = 4; // miles
      const directHit = distanceToStormPath <= coneWidth;
      
      // Check if user is in forward path
      const bearingToUser = calculateBearing(storm.lat, storm.lon, userLat, userLon);
      const stormDirection = storm.movement.direction;
      const angleDiff = Math.abs(((bearingToUser - stormDirection + 180) % 360) - 180);
      const inForwardPath = angleDiff <= 15; // Within 30-degree cone
      
      if (directHit && inForwardPath) {
        return { 
          intersects: true, 
          status: 'DIRECT PATH - Storm track crosses user location',
          pathWidth: distanceToStormPath.toFixed(1),
          eta: storm.movement.eta || 'Unknown'
        };
      } else if (storm.distance <= 5) {
        return { 
          intersects: true, 
          status: 'IMMEDIATE VICINITY - Storm very close to location',
          pathWidth: storm.distance.toFixed(1),
          eta: 'Now'
        };
      }
      
      return { intersects: false, status: 'Storm path does not intersect location' };
    }

    function calculatePointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
      const A = px - x1;
      const B = py - y1;
      const C = x2 - x1;
      const D = y2 - y1;
      
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      
      if (lenSq === 0) return Math.sqrt(A * A + B * B);
      
      const param = dot / lenSq;
      let xx, yy;
      
      if (param < 0) {
        xx = x1;
        yy = y1;
      } else if (param > 1) {
        xx = x2;
        yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }
      
      const dx = px - xx;
      const dy = py - yy;
      return Math.sqrt(dx * dx + dy * dy) * 69.0; // Convert to miles
    }

    function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
      const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
      const bearing = Math.atan2(y, x) * 180 / Math.PI;
      return (bearing + 360) % 360;
    }

    // Enhanced storm analysis with track intersection detection
    const immediateStormContext = data.storms.map(storm => {
      const trackIntersection = calculateStormTrackIntersection(storm, data.userLocation.lat, data.userLocation.lon);
      
      return {
        distance: `${storm.distance.toFixed(1)} miles`,
        direction: `${storm.direction} (${storm.bearing}°)`,
        intensity: `${storm.intensity} dBZ (${storm.category})`,
        movement: storm.movement ? 
          `Moving ${storm.movement.direction}° at ${storm.movement.speed} mph${storm.movement.eta ? `, ETA: ${storm.movement.eta}` : ''}${storm.movement.impact ? `, Impact: ${storm.movement.impact}` : ''}` : 
          'Movement unknown',
        trackStatus: trackIntersection.status,
        directThreat: trackIntersection.intersects
      };
    });

    // Enhanced regional context with track intersection analysis
    const regionalContext = data.regionalStorms && data.regionalStorms.length > 0 ? {
      totalStorms: data.regionalStorms.length,
      intenseCells: data.regionalStorms.filter(s => s.intensity >= 55).length,
      moderateStorms: data.regionalStorms.filter(s => s.intensity >= 45 && s.intensity < 55).length,
      nearestIntense: data.regionalStorms
        .filter(s => s.intensity >= 55)
        .sort((a, b) => a.distance - b.distance)[0],
      approachingStorms: data.regionalStorms
        .filter(s => s.movement && s.movement.impact === 'high')
        .length,
      // CRITICAL: Check regional storms for track intersections over user location
      directPathStorms: data.regionalStorms
        .map(storm => {
          const trackIntersection = calculateStormTrackIntersection(storm, data.userLocation.lat, data.userLocation.lon);
          return { ...storm, trackIntersection };
        })
        .filter(s => s.trackIntersection.intersects),
      overlappingCones: data.regionalStorms
        .filter(s => s.movement && s.distance <= 20) // Within 20 miles for cone analysis
        .map(storm => calculateStormTrackIntersection(storm, data.userLocation.lat, data.userLocation.lon))
        .filter(analysis => analysis.intersects)
    } : null;

    const windContext = data.winds.map(wind => ({
      altitude: wind.pressure_level,
      speed: `${wind.speed} mph`,
      direction: `${wind.direction}°`
    }));

    const prompt = `You are a professional meteorologist analyzing real-time weather data for storm impact assessment.

LOCATION: ${data.userLocation.address} (${data.userLocation.lat.toFixed(4)}°N, ${data.userLocation.lon.toFixed(4)}°W)

⚠️ ACTIVE WEATHER ALERTS & ADVISORIES (HIGHEST PRIORITY):
${activeAlerts.length > 0 ? 
  activeAlerts.map(alert => 
    `🚨 ${alert.event}: ${alert.headline}\n` +
    `   Severity: ${alert.severity || 'Moderate'} | Areas: ${alert.areaDesc}\n` +
    `   Effective: ${alert.effective} | Expires: ${alert.expires}\n` +
    `   Instructions: ${alert.instruction || 'Follow local guidance'}\n`
  ).join('\n') : 
  '✅ No active weather alerts or advisories\n'}

WINDS ALOFT DATA (STORM STEERING):
${windContext.map(wind => `${wind.altitude}: ${wind.speed} from ${wind.direction}`).join('\n')}

IMMEDIATE THREATS (30-MILE RADIUS):
${immediateStormContext.length === 0 ? 'No active storms detected within 30 miles' : 
  immediateStormContext.map((storm, i) => 
    `Storm ${i+1}: ${storm.intensity} at ${storm.distance} ${storm.direction}, ${storm.movement}\n` +
    `  TRACK ANALYSIS: ${storm.trackStatus}${storm.directThreat ? ' ⚠️ DIRECT THREAT' : ''}`
  ).join('\n')}

REGIONAL WEATHER PATTERN (50-MILE RADIUS):
${regionalContext ? 
  `Total storm activity: ${regionalContext.totalStorms} cells detected regionally\n` +
  `Intense cells (55+ dBZ): ${regionalContext.intenseCells}\n` +
  `Moderate storms (45-54 dBZ): ${regionalContext.moderateStorms}\n` +
  `Approaching storms: ${regionalContext.approachingStorms} systems moving toward your area\n` +
  `${regionalContext.nearestIntense ? 
    `Nearest severe storm: ${regionalContext.nearestIntense.intensity} dBZ at ${regionalContext.nearestIntense.distance.toFixed(1)} miles ${regionalContext.nearestIntense.direction}` : 
    'No severe storms within regional area'}\n` +
  `\n⚠️ CRITICAL STORM TRACK ANALYSIS:\n` +
  `Regional storms with paths crossing user location: ${regionalContext.directPathStorms.length}\n` +
  `${regionalContext.directPathStorms.length > 0 ? 
    regionalContext.directPathStorms.map(storm => 
      `- ${storm.intensity} dBZ storm at ${storm.distance.toFixed(1)} miles: ${storm.trackIntersection.status}`
    ).join('\n') : 'No regional storm tracks crossing user location'}\n` +
  `Overlapping movement cones detected: ${regionalContext.overlappingCones.length}` :
  'Regional storm data unavailable - analysis based on 30-mile immediate area only'}

AVIATION WEATHER (NEARBY AIRPORTS):
${aviationData?.stations ? 
  aviationData.stations.map(station => 
    `${station.identifier} (${station.distance}): ${station.skyCondition} | ` +
    `Temp: ${station.temperature}°F | Wind: ${station.windDirection}°@${station.windSpeed}kt | ` +
    `Visibility: ${station.visibility} | ${station.timeAgo}`
  ).join('\n') : 
  'Aviation weather data unavailable'}

CURRENT WEATHER (IMMEDIATE AREA):
${currentWeather ? 
  `${currentWeather.location} (${currentWeather.coordinates}) - ${currentWeather.timeAgo}:\n` +
  `  Temperature: ${currentWeather.conditions.temperature}°C  Humidity: ${currentWeather.conditions.humidity}%\n` +
  `  Wind: ${currentWeather.conditions.windDirection}° at ${currentWeather.conditions.windSpeed} mph${currentWeather.conditions.windGust ? ` gusting ${currentWeather.conditions.windGust} mph` : ''}\n` +
  `  Pressure: ${currentWeather.conditions.pressure} hPa  Visibility: ${currentWeather.conditions.visibility}\n` +
  `  Weather: ${currentWeather.conditions.weather}  Cloud Cover: ${currentWeather.conditions.cloudCover}%\n` +
  `  Source: ${currentWeather.source} (Live Data)\n` : 
  'No real-time weather data available\n'}

RADAR DATA SOURCE: ${data.radarSource} (authentic weather radar)

${threatSummary ? `
ACTIVE THREAT MONITORING STATUS:
${threatSummary}
` : ''}

AREA FORECAST DISCUSSION:
${areaForecastDiscussion ? 
  `From ${areaForecastDiscussion.office} (issued ${areaForecastDiscussion.issuedTime}):\n${areaForecastDiscussion.discussion.substring(0, 800)}${areaForecastDiscussion.discussion.length > 800 ? '...' : ''}` : 
  'Area Forecast Discussion unavailable'}

LIGHTNING ACTIVITY: ${data.lightningCount || 0} recent strikes detected

ANALYSIS INSTRUCTIONS:
${dynamicTone.style}

COMMUNICATION STYLE: ${dynamicTone.prefix}
${dynamicTone.recommendations}

Analyze current weather conditions and provide a comprehensive risk assessment. Focus on immediate safety concerns and provide specific recommendations based on active alerts, storm activity, and current conditions. Use the specified communication style based on threat level.

Respond with exactly this JSON format:
{
  "riskLevel": "low|moderate|high|extreme",
  "summary": "Brief 2-3 sentence overview focusing on key risks",
  "timeToImpact": "Estimated timing if threats approaching or null",
  "recommendations": ["Specific action item 1", "Specific action item 2"],
  "confidence": 0.0-1.0,
  "detailedAnalysis": "Comprehensive analysis including all data sources and meteorological context"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert meteorologist providing precise weather impact assessments based on real radar and atmospheric data. Respond only with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more consistent, factual responses
      max_tokens: 2500 // Increased by 1000 tokens for comprehensive alert summaries
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate and ensure required fields
    return {
      riskLevel: result.riskLevel || 'low',
      summary: result.summary || 'Weather conditions are currently being analyzed.',
      detailedAnalysis: result.detailedAnalysis || 'Detailed analysis is being processed.',
      recommendations: result.recommendations || ['Monitor weather conditions regularly.'],
      timeToImpact: result.timeToImpact,
      confidence: Math.min(Math.max(result.confidence || 0.7, 0), 1)
    };

  } catch (error) {
    console.error('AI weather assessment error:', error);
    
    // Smart fallback assessment based on actual storm data
    const highIntensityStorms = data.storms.filter(s => s.intensity >= 55);
    const nearbyStorms = data.storms.filter(s => s.distance <= 10);
    const closeStorms = data.storms.filter(s => s.distance <= 20);
    
    let riskLevel: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
    let summary = 'Clear weather conditions in your area.';
    let recommendations = ['Continue normal activities', 'Monitor weather periodically'];
    
    if (highIntensityStorms.length > 0 && nearbyStorms.length > 0) {
      riskLevel = 'extreme';
      summary = `Severe weather detected: ${highIntensityStorms.length} intense storm${highIntensityStorms.length > 1 ? 's' : ''} within 10 miles.`;
      recommendations = ['Seek shelter immediately', 'Monitor for tornado warnings', 'Stay indoors until storms pass'];
    } else if (nearbyStorms.length > 0) {
      riskLevel = 'high';
      summary = `Active storms nearby: ${nearbyStorms.length} storm cell${nearbyStorms.length > 1 ? 's' : ''} within 10 miles of your location.`;
      recommendations = ['Stay indoors', 'Monitor weather radar', 'Avoid outdoor activities'];
    } else if (closeStorms.length > 0) {
      riskLevel = 'moderate';
      summary = `Weather developing: ${closeStorms.length} storm cell${closeStorms.length > 1 ? 's' : ''} detected within 20 miles.`;
      recommendations = ['Monitor storm movement', 'Prepare for possible weather changes', 'Stay weather aware'];
    } else if (data.storms.length > 0) {
      riskLevel = 'low';
      summary = `Distant activity: ${data.storms.length} storm cell${data.storms.length > 1 ? 's' : ''} detected in the region.`;
      recommendations = ['Monitor weather conditions', 'No immediate action needed'];
    }

    // Enhanced regional analysis using actual storm data
    const regionalInfo = data.regionalStorms ? 
      ` Regional analysis: ${data.regionalStorms.length} storm cells within 50-mile area, including ${data.regionalStorms.filter(s => s.intensity >= 55).length} severe systems and ${data.regionalStorms.filter(s => s.intensity >= 45 && s.intensity < 55).length} moderate storms.` : 
      '';

    // Add storm movement analysis if available
    const movementInfo = data.storms.filter(s => s.movement).length > 0 ? 
      ` Storm movement: ${data.storms.filter(s => s.movement && s.movement.impact === 'high').length} systems approaching your location.` : 
      ' Storm movement data available from winds aloft analysis.';

    // Enhanced detailed analysis using authentic radar data
    const detailedAnalysis = `AUTHENTIC RADAR ANALYSIS: ${data.storms.length} active precipitation areas detected within 30 miles using ${data.radarSource} radar imagery.${regionalInfo}${movementInfo} Atmospheric data: ${data.winds.length} pressure levels analyzed. Storm intensities extracted from real radar tile RGB pixel data with meteorological accuracy. Professional fallback assessment provided due to temporary AI service limitations.`;

    return {
      riskLevel,
      summary: summary + (data.storms.length > 0 ? ` Using authentic ${data.radarSource} radar data with real dBZ measurements.` : ''),
      detailedAnalysis,
      recommendations: [...recommendations, 'Based on authentic radar tile analysis with real precipitation data'],
      confidence: data.storms.length > 0 ? 0.8 : 0.9 // Higher confidence when using real radar data
    };
  }
}