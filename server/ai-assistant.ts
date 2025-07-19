import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

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
  storms: StormData[]; // 30-mile immediate threats
  regionalStorms?: StormData[]; // 50-mile regional context
  winds: WindData[];
  radarSource: string;
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
    try {
      const aviationResponse = await fetch(
        `http://localhost:5000/api/aviation-weather?lat=${data.userLocation.lat}&lon=${data.userLocation.lon}`
      );
      if (aviationResponse.ok) {
        const aviationData = await aviationResponse.json();
        aviationWeather = aviationData.stations || [];
        console.log(`AI Assistant: Found ${aviationWeather.length} nearby airport weather stations`);
      }
    } catch (aviationError) {
      console.log('AI Assistant: Could not fetch aviation weather:', aviationError.message);
    }

    // Prepare comprehensive weather context for AI analysis
    const immediateStormContext = data.storms.map(storm => ({
      distance: `${storm.distance.toFixed(1)} miles`,
      direction: `${storm.direction} (${storm.bearing}°)`,
      intensity: `${storm.intensity} dBZ (${storm.category})`,
      movement: storm.movement ? 
        `Moving ${storm.movement.direction}° at ${storm.movement.speed} mph${storm.movement.eta ? `, ETA: ${storm.movement.eta}` : ''}${storm.movement.impact ? `, Impact: ${storm.movement.impact}` : ''}` : 
        'Movement unknown'
    }));

    // Prepare regional context for broader weather pattern analysis
    const regionalContext = data.regionalStorms && data.regionalStorms.length > 0 ? {
      totalStorms: data.regionalStorms.length,
      intenseCells: data.regionalStorms.filter(s => s.intensity >= 55).length,
      moderateStorms: data.regionalStorms.filter(s => s.intensity >= 45 && s.intensity < 55).length,
      nearestIntense: data.regionalStorms
        .filter(s => s.intensity >= 55)
        .sort((a, b) => a.distance - b.distance)[0],
      approachingStorms: data.regionalStorms
        .filter(s => s.movement && s.movement.impact === 'high')
        .length
    } : null;

    const windContext = data.winds.map(wind => ({
      altitude: wind.pressure_level,
      speed: `${wind.speed} mph`,
      direction: `${wind.direction}°`
    }));

    const prompt = `You are a professional meteorologist analyzing real-time weather data for storm impact assessment.

LOCATION: ${data.userLocation.address} (${data.userLocation.lat.toFixed(4)}°N, ${data.userLocation.lon.toFixed(4)}°W)

RADAR DATA SOURCE: ${data.radarSource} (authentic weather radar)

IMMEDIATE THREATS (30-MILE RADIUS):
${immediateStormContext.length === 0 ? 'No active storms detected within 30 miles' : 
  immediateStormContext.map((storm, i) => `Storm ${i+1}: ${storm.intensity} at ${storm.distance} ${storm.direction}, ${storm.movement}`).join('\n')}

REGIONAL WEATHER PATTERN (50-MILE RADIUS):
${regionalContext ? 
  `Total storm activity: ${regionalContext.totalStorms} cells detected regionally\n` +
  `Intense cells (55+ dBZ): ${regionalContext.intenseCells}\n` +
  `Moderate storms (45-54 dBZ): ${regionalContext.moderateStorms}\n` +
  `Approaching storms: ${regionalContext.approachingStorms} systems moving toward your area\n` +
  `${regionalContext.nearestIntense ? 
    `Nearest severe storm: ${regionalContext.nearestIntense.intensity} dBZ at ${regionalContext.nearestIntense.distance.toFixed(1)} miles ${regionalContext.nearestIntense.direction}` : 
    'No severe storms within regional area'}` :
  'Regional storm data unavailable - analysis based on 30-mile immediate area only'}

WINDS ALOFT:
${windContext.map(wind => `${wind.altitude}: ${wind.speed} from ${wind.direction}`).join('\n')}

LIGHTNING ACTIVITY: Analyzed from METAR reports (when available)

AVIATION WEATHER (NEARBY AIRPORTS):
${aviationWeather.length > 0 ? 
  aviationWeather.map(station => 
    `${station.airport} (${station.icao}) - ${station.distance.toFixed(1)} miles ${station.direction}:\n` +
    `  Ceiling: ${station.conditions.ceiling}  Visibility: ${station.conditions.visibility}\n` +
    `  Clouds: ${station.conditions.clouds}  Weather: ${station.conditions.weather}\n` +
    `  Wind: ${station.conditions.wind}  Temp/Dewpoint: ${station.conditions.temperature}°/${station.conditions.dewpoint}°\n` +
    `  METAR: ${station.metar}`
  ).join('\n\n') : 
  'No aviation weather data available'}

Based on this comprehensive meteorological data including radar, winds aloft, and aviation weather conditions, provide a detailed weather impact assessment in JSON format:

{
  "riskLevel": "low|moderate|high|extreme",
  "summary": "Brief 2-sentence overview of current weather threat",
  "detailedAnalysis": "Detailed analysis covering storm positions, intensities, movement patterns, wind influence, and timeline",
  "recommendations": ["Array of 3-4 specific safety recommendations"],
  "timeToImpact": "Estimated time until weather impacts (if applicable)",
  "confidence": 0.85
}

Focus on:
- IMMEDIATE THREATS: Analyze the 30-mile storms for specific timing, intensity, and direct impacts at ${data.userLocation.address}
- REGIONAL CONTEXT: Use the 100-mile storm pattern to assess broader weather trends, approaching systems, and changing conditions
- Storm intensity progression from regional patterns toward the immediate area
- dBZ intensity levels and their rainfall/hail implications for both immediate and approaching storms
- Wind patterns affecting storm steering from Open-Meteo pressure level data
- Aviation weather conditions from nearby airports (ceiling, visibility, cloud coverage)
- Lightning activity reported in METAR/aviation weather observations
- Timing analysis: immediate impacts from 30-mile storms vs longer-term threats from regional patterns
- Directional references using nearby airports and geographic features (e.g., "moving from Pensacola area towards Mobile")
- Escalation patterns: how regional storm activity may intensify or diminish over the next few hours
- Specific safety actions based on both immediate threats and regional weather evolution

Provide a comprehensive assessment that gives users immediate safety guidance while also painting the bigger regional weather picture. When describing storm movements, reference actual nearby airports, cities, or geographic features from the aviation weather data rather than vague directional terms.`;

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
      max_tokens: 1000
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

    const regionalInfo = data.regionalStorms ? 
      ` Regional context: ${data.regionalStorms.length} storm cells within 100 miles, including ${data.regionalStorms.filter(s => s.intensity >= 55).length} severe cells.` : 
      '';

    return {
      riskLevel,
      summary,
      detailedAnalysis: `Storm Analysis: ${data.storms.length} immediate threats within 30 miles.${regionalInfo} Radar source: ${data.radarSource}. Wind data: ${data.winds.length} atmospheric levels available. AI assessment currently unavailable due to quota limits - manual analysis provided.`,
      recommendations,
      confidence: 0.7
    };
  }
}