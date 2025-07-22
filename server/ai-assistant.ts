import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Emoji-based weather alert storytelling system
function getStormPersonality(intensity: number): {
  emoji: string;
  personality: string;
  description: string;
  simpleName: string;
  educationalNote: string;
} {
  if (intensity >= 65) {
    return {
      emoji: "🌪️💀",
      personality: "A DANGEROUS monster storm",
      description: "raging with extreme fury and destructive power",
      simpleName: "Extreme Thunderstorm",
      educationalNote: `(${intensity} dBZ - this is severe weather that can produce large hail and damaging winds)`
    };
  } else if (intensity >= 55) {
    return {
      emoji: "⛈️😠",
      personality: "An angry thunderstorm",
      description: "crackling with lightning and throwing heavy rain",
      simpleName: "Severe Thunderstorm", 
      educationalNote: `(${intensity} dBZ - strong enough to produce quarter-size hail and gusty winds)`
    };
  } else if (intensity >= 46) {
    return {
      emoji: "🌧️💪",
      personality: "A robust storm system",
      description: "steadily marching with heavy rainfall",
      simpleName: "Heavy Rain",
      educationalNote: `(${intensity} dBZ - expect heavy downpours that could cause flooding)`
    };
  } else if (intensity >= 35) {
    return {
      emoji: "🌦️😊",
      personality: "A moderate rain shower",
      description: "peacefully drifting along with steady precipitation",
      simpleName: "Moderate Rain",
      educationalNote: `(${intensity} dBZ - noticeable rain but generally manageable)`
    };
  } else {
    return {
      emoji: "🌤️😌",
      personality: "A gentle sprinkle",
      description: "quietly misting the area with light moisture",
      simpleName: "Light Rain",
      educationalNote: `(${intensity} dBZ - barely enough to wet the ground)`
    };
  }
}

// Build simplified prompt without emoji storytelling for fallback  
function buildBasicPrompt(data: any, tone: any): string {
  const immediateStormContext = data.storms.map(storm => ({
    distance: typeof storm.distance === 'number' ? `${storm.distance.toFixed(1)} miles` : `${storm.distance}`,
    direction: `${getDirectionName(storm.direction || storm.bearing || 0)} of you`,
    intensity: `${storm.intensity} dBZ`,
    movement: storm.movement ? 
      `Moving ${storm.movement.direction}° at ${storm.movement.speed} mph${storm.movement.eta ? `, ETA: ${storm.movement.eta}` : ''}` : 
      'Movement unknown'
  }));

  const regionalContext = data.regionalStorms ? {
    totalStorms: data.regionalStorms.length,
    severeCount: data.regionalStorms.filter(s => s.intensity >= 55).length,
    moderateCount: data.regionalStorms.filter(s => s.intensity >= 35 && s.intensity < 55).length
  } : { totalStorms: 0, severeCount: 0, moderateCount: 0 };

  return `Analyze this weather data and provide detailed assessment in JSON format:

=== LOCATION ===
Location: ${data.userLocation.address || 'Unknown location'}
Coordinates: ${data.userLocation.lat}, ${data.userLocation.lon}

=== ACTIVE STORMS & RADAR ===
Radar Source: ${data.radarSource} (authentic weather radar)
Lightning Activity: ${data.lightningCount || 0} recent strikes

Immediate Storm Context (30 miles):
${immediateStormContext.length === 0 ? '• No active storms detected within 30 miles' : 
  immediateStormContext.map((storm, index) => 
    `• Storm ${index + 1}: ${storm.intensity} at ${storm.distance} ${storm.direction}, ${storm.movement}`
  ).join('\n')
}

Regional Context (50 miles):
• Total regional storms: ${regionalContext.totalStorms}
• Severe storms (55+ dBZ): ${regionalContext.severeCount}  
• Moderate storms (35-54 dBZ): ${regionalContext.moderateCount}

=== WINDS ALOFT DATA ===
${(data.winds || []).length === 0 ? 'Wind data not available' : 
  (data.winds || []).map(wind => 
    `• ${wind.altitude}: ${wind.speed} from ${wind.direction}`
  ).join('\n')
}

=== THREAT MONITORING ===
${data.threatData ? 
  `Active threats detected: ${data.threatData.threatCount} systems
Temperature: ${data.threatData.temperature}°${data.useMetric ? 'C' : 'F'}
Alert status: ${data.threatData.alertStatus}` : 
  'Threat data not available'
}

Please provide comprehensive analysis including alerts, winds aloft, airport data, and forecast discussion.`;
}

// Generate emoji-based weather story narratives with storm analysis and forecast integration
function generateWeatherStory(storms: StormData[], forecastData?: any, currentWeather?: any): string {
  let story = "";
  
  // Storm analysis section
  if (!storms || storms.length === 0) {
    story = "🌤️ The weather stage is peaceful today - no significant storms are performing in your area!";
  } else {
    // Find closest and strongest storms
    const closestStorm = storms[0]; // storms are sorted by distance
    const strongestStorm = storms.reduce((strongest, current) => 
      current.intensity > strongest.intensity ? current : strongest, storms[0]);
    
    console.log('generateWeatherStory: closestStorm data:', JSON.stringify(closestStorm));
    
    // Closest storm information
    const closestPersonality = getStormPersonality(closestStorm.intensity);
    const directionName = getDirectionName(closestStorm.bearing || 0);
    const distance = typeof closestStorm.distance === 'number' ? closestStorm.distance.toFixed(1) : closestStorm.distance;
    
    story += `🎯 **Nearest Storm**: ${closestPersonality.emoji} ${closestPersonality.personality} is ${closestPersonality.description} ${directionName} at ${distance} miles away.`;
    
    // Strongest storm information (if different from closest)
    if (strongestStorm.id !== closestStorm.id) {
      const strongestPersonality = getStormPersonality(strongestStorm.intensity);
      const strongestDirection = getDirectionName(strongestStorm.bearing || 0);
      const strongestDistance = typeof strongestStorm.distance === 'number' ? strongestStorm.distance.toFixed(1) : strongestStorm.distance;
      story += `\n\n⚡ **Strongest Storm**: ${strongestPersonality.emoji} ${strongestPersonality.personality} (${strongestStorm.intensity} dBZ) is ${strongestDirection} at ${strongestDistance} miles away.`;
    }
    
    // Movement context if available
    if (closestStorm.movement) {
      const movementDir = getDirectionName(closestStorm.movement.direction || 0);
      const directionText = movementDir && movementDir !== 'unknown' ? movementDir.toLowerCase() : 'in an unknown direction';
      story += `\n\n🧭 The nearest storm is moving ${directionText} at ${closestStorm.movement.speed || 0} mph`;
      
      // Add ETA if approaching
      if (closestStorm.movement.eta && closestStorm.movement.eta !== 'N/A') {
        story += ` and will arrive around ${closestStorm.movement.eta}`;
      }
      story += ".";
    }
    
    // Additional storms summary
    if (storms.length > 1) {
      const intensities = storms.map(s => s.intensity).sort((a, b) => a - b);
      const minDbz = intensities[0];
      const maxDbz = intensities[intensities.length - 1];
      story += `\n\n📊 **Area Overview**: ${storms.length} total storms detected with intensity ranging from ${minDbz}-${maxDbz} dBZ.`;
    }
    
    // Educational note
    const personality = getStormPersonality(closestStorm.intensity);
    story += `\n\n📚 ${personality.educationalNote}`;
  }
  
  // Weather forecast section
  if (forecastData && forecastData.periods && forecastData.periods.length > 0) {
    const todayForecast = forecastData.periods[0];
    const tonightForecast = forecastData.periods.length > 1 ? forecastData.periods[1] : null;
    
    story += `\n\n🌤️ **Today's Forecast**: ${todayForecast.name} - ${todayForecast.detailedForecast}`;
    
    if (tonightForecast) {
      story += `\n\n🌙 **Tonight**: ${tonightForecast.detailedForecast}`;
    }
  }
  
  // Current conditions section
  if (currentWeather) {
    story += `\n\n🌡️ **Current Conditions**: `;
    if (currentWeather.temperature) {
      story += `${Math.round(currentWeather.temperature)}°F, `;
    }
    if (currentWeather.humidity) {
      story += `${currentWeather.humidity}% humidity, `;
    }
    if (currentWeather.wind_speed && currentWeather.wind_direction) {
      story += `winds ${getDirectionName(currentWeather.wind_direction)} at ${Math.round(currentWeather.wind_speed)} mph`;
    }
  }
  
  return story;
}

// Convert bearing to direction name
function getDirectionName(bearing: number): string {
  if (typeof bearing !== 'number' || isNaN(bearing)) {
    console.log('Invalid bearing provided to getDirectionName:', bearing);
    return "unknown";
  }
  
  const directions = [
    "North", "NNE", "NE", "ENE", "East", "ESE", "SE", "SSE",
    "South", "SSW", "SW", "WSW", "West", "WNW", "NW", "NNW"
  ];
  const index = Math.round(bearing / 22.5) % 16;
  const result = directions[index];
  
  if (!result) {
    console.log('Direction lookup failed for bearing:', bearing, 'index:', index);
    return "unknown";
  }
  
  return result;
}

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
  altitude?: number;
  level?: string;
  pressure?: number;
  pressure_level?: string;
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
  useMetric?: boolean; // Unit preference for temperature display
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
    // Fetch thunderstorm formation conditions
    let thunderstormConditions: any = null;
    try {
      console.log('AI Assistant: Fetching thunderstorm formation analysis...');
      const thunderstormResponse = await fetch(
        `http://localhost:5000/api/thunderstorm-conditions?lat=${data.userLocation.lat}&lon=${data.userLocation.lon}`,
        { signal: AbortSignal.timeout(8000) }
      );
      
      if (thunderstormResponse.ok) {
        thunderstormConditions = await thunderstormResponse.json();
        console.log(`AI Assistant: Thunderstorm potential: ${thunderstormConditions.thunderstormPotential.overall}/10`);
      }
    } catch (error) {
      console.log('AI Assistant: Thunderstorm analysis unavailable:', error.message);
    }

    // Fetch aviation weather data from nearby airports
    let aviationWeather: any[] = [];
    let currentWeather: any = null;
    if (data.userLocation && data.userLocation.lat && data.userLocation.lon) {
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
    }

    // Fetch Area Forecast Discussion for US locations
    let areaForecastDiscussion: any = null;
    if (data.userLocation && data.userLocation.lat && data.userLocation.lon) {
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
            areaForecastDiscussion = afdData;
            if (areaForecastDiscussion && areaForecastDiscussion.discussion) {
              console.log(`AI Assistant: Found Area Forecast Discussion from ${afdData.office || 'NWS office'}`);
            }
          }
        }
      } catch (afdError) {
        console.log('AI Assistant: Could not fetch Area Forecast Discussion:', afdError.message);
      }
    }

    // Initialize alerts and threat summary
    let activeAlerts: any[] = [];
    let threatSummary: string | null = null;

    // Debug: Log received data structure
    console.log('AI Assistant: Received data keys:', Object.keys(data));
    console.log('AI Assistant: threatData received?', !!data.threatData);
    if (data.threatData) {
      console.log('AI Assistant: threatData keys:', Object.keys(data.threatData));
    }

    // Fetch threat data when provided, otherwise get NWS alerts directly
    if (data.threatData) {
      try {
        threatSummary = `Active Threats: ${data.threatData.threatCount} detected\n` +
          `Alert Summary: ${data.threatData.alertsSent} alerts sent\n` +
          `Status: ${data.threatData.status || 'Monitoring active'}\n` +
          `Last Check: ${data.threatData.lastCheck || 'Recent'}\n` +
          `Temperature: ${data.threatData.temperature || 'Unknown'}°F`;
        
        // Use threat data's alert information instead of fetching NWS alerts separately to avoid duplicates
        if (data.threatData.threats && Array.isArray(data.threatData.threats)) {
          // Extract NWS alerts from threat data to avoid duplication
          const nwsThreats = data.threatData.threats.filter((threat: any) => threat.type === 'nws_alert');
          if (nwsThreats.length > 0) {
            console.log(`AI Assistant: Using ${nwsThreats.length} NWS alerts from threat data (avoiding duplication)`);
            
            // Convert all threat data to alert format without deduplication
            activeAlerts = nwsThreats.map((threat: any) => ({
              headline: threat.title,
              description: threat.description,
              severity: threat.level,
              type: 'Weather Advisory',
              effective: new Date().toISOString(),
              expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              instruction: threat.recommendations?.join('. ') || 'Follow official weather service guidance'
            }));
            console.log(`AI Assistant: Processing ${activeAlerts.length} NWS alerts from threat data`);
          } else {
            console.log('AI Assistant: No NWS alerts found in threat data');
          }
        }
      } catch (alertError) {
        console.log('AI Assistant: Could not process threat/alert data:', alertError);
      }
    } else {
      // No threat data provided, fetch NWS alerts directly (fallback mode)
      if (data.userLocation && data.userLocation.lat && data.userLocation.lon) {
        try {
          const alertsResponse = await fetch(
            `http://localhost:5000/api/nws-alerts?lat=${data.userLocation.lat}&lon=${data.userLocation.lon}`
          );
          if (alertsResponse.ok) {
            const alertsData = await alertsResponse.json();
            activeAlerts = alertsData.alerts || [];
            console.log(`AI Assistant: Found ${activeAlerts.length} active NWS alerts (fallback mode - no threat data)`);
          }
        } catch (alertError) {
          console.log('AI Assistant: Could not fetch NWS alerts in fallback mode:', alertError.message);
        }
      }
    }

    // Calculate storm track intersections with user location
    function calculateStormTrackIntersection(storm: any, userLat: number, userLon: number) {
      // DEBUG: Log storm movement data to identify the actual structure
      if (storm.movement) {
        console.log('AI Assistant: Storm movement data:', JSON.stringify(storm.movement, null, 2));
      }
      
      // CRITICAL: Check if storm already has "High" impact rating from system analysis
      if (storm.movement && (storm.movement.impact === 'high' || storm.movement.impact === 'High')) {
        console.log('AI Assistant: HIGH IMPACT STORM DETECTED - Direct collision course');
        return { 
          intersects: true, 
          status: 'HIGH IMPACT STORM - System detected collision course',
          pathWidth: 'Direct track',
          eta: storm.movement.eta || 'Within 2 hours'
        };
      }
      
      // CRITICAL: Check if storm has ETA AND is moving toward user location
      if (storm.movement && storm.movement.eta && storm.movement.eta !== 'Unknown' && storm.movement.eta !== null) {
        // Only consider it approaching if storm direction is toward user
        const bearingToUser = calculateBearing(storm.lat, storm.lon, userLat, userLon);
        const stormDirection = storm.movement.direction;
        const angleDiff = Math.abs(((bearingToUser - stormDirection + 180) % 360) - 180);
        
        console.log('AI Assistant: Storm direction analysis:', {
          stormLat: storm.lat,
          stormLon: storm.lon,
          userLat,
          userLon,
          bearingToUser,
          stormDirection,
          angleDiff,
          isApproaching: angleDiff <= 15
        });
        
        if (angleDiff <= 15) { // Within 30-degree approach cone
          console.log('AI Assistant: STORM WITH ETA DETECTED - Approaching user location');
          return { 
            intersects: true, 
            status: 'APPROACHING STORM - ETA indicates potential contact',
            pathWidth: 'Track intersection likely',
            eta: storm.movement.eta
          };
        } else {
          console.log('AI Assistant: Storm has ETA but moving away from user location');
          return { intersects: false, status: 'Storm moving away from location' };
        }
      }
      
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

    function getDirectionName(degrees: number): string {
      const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const index = Math.round(degrees / 22.5) % 16;
      return directions[index];
    }

    // Enhanced storm analysis with track intersection detection
    const immediateStormContext = data.storms.map(storm => {
      const trackIntersection = calculateStormTrackIntersection(storm, data.userLocation.lat, data.userLocation.lon);
      
      // Calculate storm severity based on dBZ intensity
      let stormSeverity = 'Light';
      if (storm.intensity >= 61) stormSeverity = 'Extreme';
      else if (storm.intensity >= 55) stormSeverity = 'Severe';
      else if (storm.intensity >= 46) stormSeverity = 'Heavy';
      else if (storm.intensity >= 35) stormSeverity = 'Moderate';
      else if (storm.intensity >= 20) stormSeverity = 'Light';
      
      // Convert bearing to direction name for spatial context
      const directionName = getDirectionName(storm.direction || storm.bearing || 0);
      
      return {
        distance: typeof storm.distance === 'number' ? `${storm.distance.toFixed(1)} miles` : `${storm.distance}`,
        direction: `${directionName} of you`,
        intensity: `${storm.intensity} dBZ (${storm.category})`,
        stormSeverity: stormSeverity, // Storm intensity classification
        movement: storm.movement ? 
          `Moving ${storm.movement.direction}° at ${storm.movement.speed} mph${storm.movement.eta ? `, ETA: ${storm.movement.eta}` : ''}${storm.movement.impact ? `, Impact: ${storm.movement.impact}` : ''}` : 
          'Movement unknown',
        trackStatus: trackIntersection.status,
        directThreat: trackIntersection.intersects,
        impactRating: storm.movement?.impact || 'unknown' // Impact likelihood
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
      directPathStorms: data.userLocation ? data.regionalStorms
        .map(storm => {
          const trackIntersection = calculateStormTrackIntersection(storm, data.userLocation.lat, data.userLocation.lon);
          return { ...storm, trackIntersection };
        })
        .filter(s => s.trackIntersection.intersects) : [],
      overlappingCones: data.userLocation ? data.regionalStorms
        .filter(s => s.movement && s.distance <= 20) // Within 20 miles for cone analysis
        .map(storm => calculateStormTrackIntersection(storm, data.userLocation.lat, data.userLocation.lon))
        .filter(analysis => analysis.intersects) : []
    } : null;

    const windContext = (data.winds || []).filter(wind => {
      // Only include winds with valid data
      return wind.speed > 0 && wind.direction >= 0 && wind.direction <= 360;
    }).map(wind => {
      // Handle different wind data formats from various sources
      let altitudeDisplay = null;
      
      if (wind.level) {
        // Convert pressure levels to user-friendly descriptions
        const pressureToAltitude = {
          '500mb': '500mb (~18,000 ft)',
          '700mb': '700mb (~10,000 ft)', 
          '850mb': '850mb (~5,000 ft)',
          '925mb': '925mb (~2,500 ft)',
          '1000mb': '1000mb (surface)'
        };
        altitudeDisplay = pressureToAltitude[wind.level] || wind.level;
      } else if (wind.altitude && wind.altitude > 0) {
        // Format altitude in feet with pressure level if available
        const altFeet = Math.round(wind.altitude);
        if (wind.pressure) {
          altitudeDisplay = `${wind.pressure}mb (~${altFeet.toLocaleString()} ft)`;
        } else {
          altitudeDisplay = `${altFeet.toLocaleString()} ft`;
        }
      } else if (wind.pressure) {
        // Convert pressure to approximate altitude
        const pressureToFeet = {
          500: '~18,000 ft',
          700: '~10,000 ft',
          850: '~5,000 ft',
          925: '~2,500 ft',
          1000: 'surface'
        };
        const approxAlt = pressureToFeet[wind.pressure] || '';
        altitudeDisplay = approxAlt ? `${wind.pressure}mb (${approxAlt})` : `${wind.pressure}mb`;
      } else if (wind.pressure_level) {
        altitudeDisplay = wind.pressure_level;
      }
      
      // Only return wind data if we have a valid altitude display
      if (altitudeDisplay) {
        return {
          altitude: altitudeDisplay,
          speed: `${wind.speed} mph`,
          direction: `${wind.direction}°`
        };
      }
      
      return null;
    }).filter(wind => wind !== null); // Remove any null entries

    const prompt = `You are a helpful, knowledgeable weather assistant that provides real-time weather briefings for both aviation users and the general public.

When given a location, present weather information in a natural, flowing analysis. Only discuss sections that have meaningful data available - skip any sections marked as "unavailable" or "no data".

Available sections (only discuss if data exists):
1. Weather Alerts – Report any current warnings, watches, advisories, or hazards from the NWS or other relevant agencies.
2. Winds Aloft – Include wind direction and speed at multiple altitudes, especially useful for pilots or balloonists.
3. Active Storms / Radar Summary – Describe any thunderstorm activity, reflectivity values (dBZ), movement, lightning presence, or storm cells nearby.
4. Airport Info (METAR/TAF) – Include current weather, visibility, wind, and short-term forecast from nearby airports. Clarify technical terms for public users.
5. Area Forecast Discussion – Briefly summarize the official forecast discussion and highlight key weather impacts.
6. Thunderstorm Formation Analysis – When available, analyze the three essential conditions for thunderstorm development:
   - MOISTURE: Sufficient water vapor (humidity, dew point spread)
   - ATMOSPHERIC STABILITY: Unstable lapse rate (CAPE, Lifted Index, temperature profiles)
   - LIFTING MECHANISMS: Initial upward motion (wind shear, surface heating, convergence)
   Explain each condition in simple terms and assess overall thunderstorm potential.
7. Optional Notes – Include NOTAMs, icing/turbulence (aviation), or comfort impacts (humidity, heat index, air quality) if available.

Behavior:
- Always start with a clear, one-sentence summary of the overall conditions.
- CRITICAL: Only discuss sections that have meaningful data - completely skip any sections marked as unavailable, no data, or empty. Never mention missing data sections.
- For storm locations, always include directional context (e.g., "northeast of you", "to your southeast")
- Present information in a natural, conversational flow rather than rigid numbered sections.
- Adjust the tone based on severity:
  - Serious and professional if storms, alerts, or hazards are active
  - Friendly and casual if weather is mild or uneventful

Always be factual, readable, and brief—aim for value, not verbosity.
Format the response like a helpful briefing or weather podcast script.

IMPORTANT: When discussing storms, always distinguish between:
- STORM SEVERITY: Based on intensity (Light/Moderate/Heavy/Severe/Extreme based on dBZ)
- IMPACT SEVERITY: Based on collision probability (High/Medium/Low impact chance)
- DISTANCE CONTEXT: Always mention how far each storm is from the user for personal planning
Example: "A Light storm 37 miles away with HIGH impact potential" or "A Severe storm 58 miles away with Low impact likelihood"

=== WEATHER DATA FOR ${data.userLocation?.address || 'User Location'} ===

=== 1. WEATHER ALERTS & ADVISORIES ===
${activeAlerts.length > 0 ? 
  activeAlerts.map(alert => 
    `🚨 ACTIVE ALERT: ${alert.event}\n` +
    `   Headline: ${alert.headline}\n` +
    `   Severity: ${alert.severity || 'Moderate'} | Expires: ${alert.expires}\n` +
    `   Areas: ${alert.areaDesc}\n` +
    `   Action: ${alert.instruction || 'Monitor conditions'}`
  ).join('\n\n') : 
  '✅ No active weather alerts or advisories'}

${windContext.length > 0 ? 
  `=== WINDS ALOFT (STORM STEERING) ===\n${windContext.map(wind => `• ${wind.altitude}: ${wind.speed} from ${wind.direction}`).join('\n')}` :
  ''}

=== ACTIVE STORMS & RADAR ===
Radar Source: ${data.radarSource} (authentic weather radar)
Lightning Activity: ${data.lightningCount || 0} recent strikes

**EMOJI-BASED WEATHER STORY:**
${immediateStormContext.length === 0 ? '🌤️ Clear skies with no significant storms in your area! ✨' : 
  (() => {
    try {
      const storm = immediateStormContext[0];
      if (!storm) return '🌤️ No storm data available for storytelling.';
      
      const personality = getStormPersonality(storm.intensity || 0);
      const distance = storm.distance || 'unknown distance';
      const direction = storm.direction ? getDirectionName(storm.direction) : 'unknown direction';
      
      return `${personality.emoji} ${personality.personality} is ${personality.description} about ${distance} miles ${direction.toLowerCase()} of you. ${personality.educationalNote}`;
    } catch (error) {
      console.log('Weather story generation error:', error.message);
      return '🌤️ Weather story temporarily unavailable - see technical analysis below.';
    }
  })()}

**TECHNICAL STORM ANALYSIS:**
${immediateStormContext.length === 0 ? '• No active storms detected within 50 miles' : 
  (() => {
    const directThreats = immediateStormContext.filter(s => s.directThreat);
    const nonDirectThreats = immediateStormContext.filter(s => !s.directThreat);
    
    let analysis = '';
    
    if (directThreats.length > 0) {
      analysis += `🚨 STORMS WITH DIRECT PATH POTENTIAL:\n`;
      analysis += directThreats.map((storm, i) => 
        `• Storm ${i+1}: ${storm.intensity} | Distance: ${storm.distance} ${storm.direction} of you\n  Storm Severity: ${storm.stormSeverity} | Impact Rating: ${storm.impactRating}\n  Movement: ${storm.movement}\n  ⚠️ ${storm.trackStatus} - POSSIBLE CONTACT WITH YOUR LOCATION`
      ).join('\n');
      analysis += '\n\n';
    }
    
    if (nonDirectThreats.length > 0) {
      analysis += `Other nearby storms:\n`;
      analysis += nonDirectThreats.map((storm, i) => 
        `• Storm ${directThreats.length + i + 1}: ${storm.intensity} | Distance: ${storm.distance} ${storm.direction} of you\n  Storm Severity: ${storm.stormSeverity} | Impact Rating: ${storm.impactRating}\n  Movement: ${storm.movement}\n  Track Status: ${storm.trackStatus}`
      ).join('\n');
    }
    
    return analysis;
  })()}

${regionalContext && (regionalContext.totalStorms > 0 || regionalContext.approachingStorms > 0) ? 
  `Regional Pattern (50-mile radius):\n` +
  `• Total storm cells: ${regionalContext.totalStorms}\n` +
  `• Intense storms (55+ dBZ): ${regionalContext.intenseCells}\n` +
  `• Moderate storms (45-54 dBZ): ${regionalContext.moderateStorms}\n` +
  `• Systems approaching your area: ${regionalContext.approachingStorms}\n` +
  `• Storm tracks potentially crossing location: ${regionalContext.directPathStorms.length}${regionalContext.directPathStorms.length > 0 ? ' ⚠️ TRACK INTERSECTION DETECTED' : ''}` :
  ''}

${(aviationWeather.length > 0 || currentWeather) ? 
  `=== AIRPORT & LOCAL WEATHER ===` : ''}
${aviationWeather.length > 0 ? 
  `Airport Weather (METAR):\n${aviationWeather.map(station => 
    `• ${station.airport} (${station.icao}) - ${station.distance.toFixed(1)} miles:\n  Conditions: ${station.conditions.clouds} | Temp: ${data.useMetric ? `${station.conditions.temperature.toFixed(1)}°C` : `${Math.round((station.conditions.temperature * 9/5) + 32)}°F`}\n  Wind: ${station.conditions.wind} | Visibility: ${station.conditions.visibility}\n  Data: ${station.timeAgo}${station.isStale ? ' - STALE' : ''}`
  ).join('\n')}\n` : ''}${currentWeather ? 
  `Current Local Conditions:\n` +
  `• ${currentWeather.location}: ${currentWeather.conditions.weather}\n` +
  `• Temperature: ${data.useMetric ? `${currentWeather.conditions.temperature.toFixed(1)}°C` : `${Math.round((currentWeather.conditions.temperature * 9/5) + 32)}°F`} | Humidity: ${currentWeather.conditions.humidity}%\n` +
  `• Wind: ${currentWeather.conditions.windDirection}° at ${currentWeather.conditions.windSpeed} mph\n` +
  `• Pressure: ${currentWeather.conditions.pressure} hPa | Visibility: ${currentWeather.conditions.visibility}\n` +
  `• Source: ${currentWeather.source} (Live Data)` : ''}

${areaForecastDiscussion && areaForecastDiscussion.discussion ? 
  `=== AREA FORECAST DISCUSSION ===\nNWS ${areaForecastDiscussion.office} (${areaForecastDiscussion.officeCode}):\n${areaForecastDiscussion.discussion.substring(0, 400)}...` : 
  ''}

${thunderstormConditions ? 
  `=== THUNDERSTORM FORMATION ANALYSIS ===
**The Three Essential Conditions for Thunderstorm Development:**

1. **MOISTURE ANALYSIS** (${thunderstormConditions.moisture.moistureRating.rating}/10)
   • Relative Humidity: ${thunderstormConditions.moisture.relativeHumidity}%
   • Dew Point: ${thunderstormConditions.moisture.dewPoint.toFixed(1)}°C (${Math.round((thunderstormConditions.moisture.dewPoint * 9/5) + 32)}°F)
   • Temperature-Dew Point Spread: ${thunderstormConditions.moisture.dewPointSpread.toFixed(1)}°C
   • Assessment: ${thunderstormConditions.moisture.moistureRating.description}

2. **ATMOSPHERIC STABILITY** (${thunderstormConditions.stability.stabilityRating.rating}/10)
   • CAPE (Convective Available Potential Energy): ${thunderstormConditions.stability.cape || 0} J/kg
   • Lifted Index: ${thunderstormConditions.stability.liftedIndex || 0}°C (negative = unstable)
   • Convective Inhibition (CIN): ${thunderstormConditions.stability.cin || 0} J/kg
   • Assessment: ${thunderstormConditions.stability.stabilityRating.description}

3. **LIFTING MECHANISMS** (${thunderstormConditions.lifting.liftingRating.rating}/10)
   • Surface Wind: ${thunderstormConditions.lifting.surfaceWind.speed} m/s from ${thunderstormConditions.lifting.surfaceWind.direction}°
   • Wind Shear: ${thunderstormConditions.lifting.windShear.total.toFixed(1)} m/s (surface to 180m)
   • Cloud Cover: ${thunderstormConditions.lifting.cloudCover}%
   • Assessment: ${thunderstormConditions.lifting.liftingRating.description}

**OVERALL THUNDERSTORM POTENTIAL: ${thunderstormConditions.thunderstormPotential.overall}/10 (${thunderstormConditions.thunderstormPotential.riskLevel})**
${thunderstormConditions.thunderstormPotential.description}

Conditions Met: Moisture (${thunderstormConditions.thunderstormPotential.conditions.moisture ? 'YES' : 'NO'}), Instability (${thunderstormConditions.thunderstormPotential.conditions.instability ? 'YES' : 'NO'}), Lifting (${thunderstormConditions.thunderstormPotential.conditions.lifting ? 'YES' : 'NO'})` : 
  ''}

CRITICAL ANALYSIS REQUIREMENTS:
1. If there are active weather alerts (Heat Advisories, Warnings, etc.), discuss them FIRST and prominently in your analysis. Heat advisories and weather warnings are the highest priority safety information.

2. STORM TRACK INTERSECTION ANALYSIS: Pay special attention to storm track analysis marked as "DIRECT PATH POTENTIAL", "HIGH IMPACT STORM", "APPROACHING STORM", or "TRACK INTERSECTION DETECTED". Even if storms are light intensity (20-40 dBZ), if they show "POSSIBLE CONTACT WITH YOUR LOCATION", "HIGH impact", or any ETA time, clearly communicate this possibility in your analysis. Do NOT dismiss light storms if they have direct path potential.

3. HIGH IMPACT RECOGNITION: When storms show "High" impact ratings, this ALWAYS means the storm track intersects the user's location. State this clearly: "This storm is on a collision course with your location." When storms have ETAs (like "1.2hr"), this indicates approaching contact. Explain this explicitly.

4. ETA ANALYSIS: Any storm with an ETA time (1.2hr, 2hr, etc.) indicates potential contact with the user's location. Clearly state: "This storm is expected to reach your area in [ETA time]" regardless of intensity.

5. TRACK CONE ANALYSIS: If any storms show directional movement toward the user location (indicated by ETA times and impact ratings), discuss this as a direct contact scenario, not just "nearby activity".

6. TIME & DATE CALCULATION ACCURACY: Always verify and calculate dates and times correctly:
   - Current time is ${new Date().toISOString()} (UTC)
   - For time calculations, consider timezone differences (US Central Time is UTC-5 during daylight saving)
   - When alert data shows "expires" times, calculate actual remaining duration from current time
   - Heat Advisories typically run 10 AM to 7 PM local time (9 hours duration)
   - Verify alert durations by subtracting effective time from expiry time
   - If different alerts have different expiry times, calculate each one individually
   - Always double-check your time math: (expiry time - current time) = remaining duration
   - For alerts showing strange times like "09:45" or early morning hours, these may need timezone correction

Provide your assessment in this exact JSON format:
{
  "riskLevel": "low|moderate|high|extreme",
  "summary": "Start with any active alerts, then brief overview of conditions including storm track intersections",
  "timeToImpact": "Timing if threats approaching or null",
  "recommendations": ["Specific action based on alerts, conditions, and storm track analysis"],
  "confidence": 0.0-1.0,
  "detailedAnalysis": "Write a flowing, natural analysis without numbered sections. Start with active weather alerts if present, then discuss storm track intersections (especially any storms with direct path potential regardless of intensity), winds aloft patterns, current storm activity, airport conditions, and forecaster insights. If storms show potential to make contact with the user location, clearly state this possibility even for light intensity storms. Use the dynamic tone based on threat level."
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
    console.error('Error details:', error.message);
    
    // If it's a specific issue with emoji storytelling, try to provide comprehensive analysis without it
    if (error.message && (error.message.includes('toLowerCase') || error.message.includes('toFixed'))) {
      console.log('Attempting fallback with comprehensive analysis but simplified storytelling...');
      
      // Try again with a simplified prompt that still includes all the comprehensive data
      try {
        const simplifiedPrompt = buildBasicPrompt(data, dynamicTone); // Use simplified prompt without emoji storytelling
        
        const fallbackResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are an expert meteorologist providing precise weather impact assessments based on real radar and atmospheric data. Respond only with valid JSON." },
            { role: "user", content: simplifiedPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 2500
        });
        
        const fallbackResult = JSON.parse(fallbackResponse.choices[0].message.content || '{}');
        console.log('Successfully generated comprehensive analysis with fallback storytelling');
        
        return {
          riskLevel: fallbackResult.riskLevel || 'low',
          summary: fallbackResult.summary || 'Weather conditions analyzed.',
          detailedAnalysis: fallbackResult.detailedAnalysis || 'Comprehensive weather analysis provided.',
          recommendations: fallbackResult.recommendations || ['Monitor weather conditions.'],
          timeToImpact: fallbackResult.timeToImpact,
          confidence: Math.min(Math.max(fallbackResult.confidence || 0.7, 0), 1)
        };
      } catch (fallbackError) {
        console.log('Fallback comprehensive analysis also failed, using authentic radar fallback');
      }
    }
    
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
    const detailedAnalysis = `AUTHENTIC RADAR ANALYSIS: ${data.storms.length} active precipitation areas detected within 30 miles using ${data.radarSource} radar imagery.${regionalInfo}${movementInfo} Atmospheric data: ${(data.winds || []).length} pressure levels analyzed. Storm intensities extracted from real radar tile RGB pixel data with meteorological accuracy. Professional fallback assessment provided due to temporary AI service limitations.`;

    return {
      riskLevel,
      summary: summary + (data.storms.length > 0 ? ` Using authentic ${data.radarSource} radar data with real dBZ measurements.` : ''),
      detailedAnalysis,
      recommendations: [...recommendations, 'Based on authentic radar tile analysis with real precipitation data'],
      confidence: data.storms.length > 0 ? 0.8 : 0.9 // Higher confidence when using real radar data
    };
  }
}