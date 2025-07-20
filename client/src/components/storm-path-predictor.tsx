import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, SkipForward, SkipBack, Settings, Eye, EyeOff } from "lucide-react";

interface StormPathPredictorProps {
  location: { lat: number; lon: number; name: string };
  precipitationStorms: any[];
  windsData: any;
  mapInstance: any;
  isVisible: boolean;
  onVisibilityChange: (visible: boolean) => void;
}

interface PredictedPosition {
  lat: number;
  lon: number;
  timestamp: number;
  confidence: number;
}

interface StormPrediction {
  stormId: string;
  currentPosition: { lat: number; lon: number };
  predictedPath: PredictedPosition[];
  intensity: number;
  movementVector: { direction: number; speed: number };
}

export default function StormPathPredictor({ 
  location, 
  precipitationStorms, 
  windsData, 
  mapInstance, 
  isVisible, 
  onVisibilityChange 
}: StormPathPredictorProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [predictionHours, setPredictionHours] = useState([6]); // Default 6 hours
  const [animationSpeed, setAnimationSpeed] = useState([1]); // 1x speed
  const [stormPredictions, setStormPredictions] = useState<StormPrediction[]>([]);
  const [showTrails, setShowTrails] = useState(true);
  const [showConfidenceZones, setShowConfidenceZones] = useState(true);
  
  const animationInterval = useRef<NodeJS.Timeout>();
  const pathLayersRef = useRef<any[]>([]);
  const trailLayersRef = useRef<any[]>([]);
  const confidenceLayersRef = useRef<any[]>([]);
  const currentPositionLayersRef = useRef<any[]>([]);
  
  // Time steps for prediction (every 15 minutes for 1 hour = 4 steps)
  const timeSteps = Array.from({ length: 4 }, (_, i) => (i + 1) * 15); // 15, 30, 45, 60 minutes

  // Calculate storm movement based on winds aloft data
  const calculateStormMovement = (windDirection: number, windSpeed: number) => {
    // Convert wind direction to storm movement direction (wind direction + 180°)
    const stormDirection = (windDirection + 180) % 360;
    // Storm typically moves at 70% of wind speed
    const stormSpeed = windSpeed * 0.7;
    
    return { direction: stormDirection, speed: stormSpeed };
  };

  // Predict future storm positions with time ticks
  const predictStormPath = (
    currentLat: number, 
    currentLon: number, 
    movementVector: { direction: number; speed: number }
  ): PredictedPosition[] => {
    const predictions: PredictedPosition[] = [];
    const { direction, speed } = movementVector;
    
    // Convert direction to radians
    const directionRad = (direction * Math.PI) / 180;
    
    timeSteps.forEach((minutes) => {
      // Distance calculation: speed in mph for given time
      const distanceInMiles = (speed * minutes) / 60; // Convert minutes to hours
      const distanceInDegrees = distanceInMiles / 69; // Rough conversion to degrees
      
      // Calculate new position
      const deltaLat = Math.cos(directionRad) * distanceInDegrees;
      const deltaLon = Math.sin(directionRad) * distanceInDegrees;
      
      const newLat = currentLat + deltaLat;
      const newLon = currentLon + deltaLon;
      
      // Calculate confidence (decreases over time)
      const confidence = Math.max(0.5, 1 - (minutes / 60) * 0.5);
      
      predictions.push({
        lat: newLat,
        lon: newLon,
        timestamp: Date.now() + (minutes * 60 * 1000),
        confidence
      });
    });
    
    return predictions;
  };

  // Generate storm predictions
  useEffect(() => {
    if (!precipitationStorms.length || !windsData || !mapInstance) return;
    
    const predictions: StormPrediction[] = precipitationStorms.map((storm, index) => {
      const movementVector = calculateStormMovement(
        windsData.direction || 0, 
        windsData.speed || 0
      );
      
      const predictedPath = predictStormPath(
        storm.lat,
        storm.lon,
        movementVector
      );
      
      return {
        stormId: storm.id || `storm-${index}`,
        currentPosition: { lat: storm.lat, lon: storm.lon },
        predictedPath,
        intensity: storm.dbz || storm.intensity || 30,
        movementVector
      };
    });
    
    setStormPredictions(predictions);
  }, [precipitationStorms, windsData, predictionHours[0]]);

  // Clear all prediction layers
  const clearPredictionLayers = () => {
    [...pathLayersRef.current, ...trailLayersRef.current, ...confidenceLayersRef.current, ...currentPositionLayersRef.current].forEach(layer => {
      if (layer && mapInstance.hasLayer(layer)) {
        mapInstance.removeLayer(layer);
      }
    });
    pathLayersRef.current = [];
    trailLayersRef.current = [];
    confidenceLayersRef.current = [];
    currentPositionLayersRef.current = [];
  };

  // Format time for display (e.g., "18:07")
  const formatTimeForDisplay = (minutes: number) => {
    const now = new Date();
    const futureTime = new Date(now.getTime() + minutes * 60 * 1000);
    return futureTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
  };

  // Render storm predictions on map with professional trajectory lines
  const renderPredictions = () => {
    if (!mapInstance || !isVisible) return;
    
    clearPredictionLayers();
    
    stormPredictions.forEach((prediction, stormIndex) => {
      const { predictedPath, currentPosition, intensity } = prediction;
      
      // Get storm color based on intensity
      const getStormColor = (dbz: number) => {
        if (dbz >= 61) return '#8b5cf6'; // Purple - Extreme
        if (dbz >= 55) return '#ef4444'; // Red - Very Heavy/Severe
        if (dbz >= 46) return '#f97316'; // Orange - Heavy
        if (dbz >= 35) return '#eab308'; // Yellow - Moderate
        return '#22c55e'; // Green - Light
      };
      
      const stormColor = getStormColor(intensity);
      
      if (window.L && predictedPath.length > 0) {
        // Create path coordinates including current position
        const pathCoordinates = [
          [currentPosition.lat, currentPosition.lon],
          ...predictedPath.map(pos => [pos.lat, pos.lon])
        ];
        
        // Draw the main trajectory line
        const trajectoryLine = window.L.polyline(pathCoordinates, {
          color: stormColor,
          weight: 3,
          opacity: 0.8,
          dashArray: '10, 5'
        });
        
        trajectoryLine.addTo(mapInstance);
        pathLayersRef.current.push(trajectoryLine);
        
        // Add time tick markers along the trajectory line
        predictedPath.forEach((position, index) => {
          const minutes = timeSteps[index];
          const timeString = formatTimeForDisplay(minutes);
          
          // Create time tick marker
          const timeMarker = window.L.circleMarker([position.lat, position.lon], {
            radius: 4,
            fillColor: '#ffffff',
            color: stormColor,
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          });
          
          // Create time label with professional styling like weather radar apps
          const timeLabel = window.L.divIcon({
            className: 'time-tick-label',
            html: `<div style="
              background-color: rgba(0, 0, 0, 0.8);
              color: white;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              text-align: center;
              white-space: nowrap;
              border: 1px solid ${stormColor};
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${timeString}</div>`,
            iconSize: [45, 20],
            iconAnchor: [22, 10]
          });
          
          const timeLabelMarker = window.L.marker([position.lat, position.lon], {
            icon: timeLabel
          });
          
          timeMarker.addTo(mapInstance);
          timeLabelMarker.addTo(mapInstance);
          
          pathLayersRef.current.push(timeMarker);
          pathLayersRef.current.push(timeLabelMarker);
        });
        
        // Draw current storm position with special styling
        const currentMarker = window.L.circleMarker([currentPosition.lat, currentPosition.lon], {
          radius: 8,
          fillColor: stormColor,
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.9
        }).bindPopup(`
          <div class="font-semibold text-white bg-slate-800 p-2 rounded">
            <div>Storm Cell</div>
            <div>Intensity: ${intensity} dBZ</div>
            <div>Forecast Track (1 hour)</div>
          </div>
        `);
        
        currentMarker.addTo(mapInstance);
        currentPositionLayersRef.current.push(currentMarker);
      }
    });
  };

  // Animation control
  const startAnimation = () => {
    setIsAnimating(true);
    setCurrentTimeIndex(0);
    
    animationInterval.current = setInterval(() => {
      setCurrentTimeIndex(prev => {
        const next = prev + 1;
        if (next >= timeSteps.length) {
          setIsAnimating(false);
          return 0;
        }
        return next;
      });
    }, 1000 / animationSpeed[0]); // Adjust speed
  };

  const stopAnimation = () => {
    setIsAnimating(false);
    if (animationInterval.current) {
      clearInterval(animationInterval.current);
    }
  };

  const stepForward = () => {
    setCurrentTimeIndex(prev => Math.min(prev + 1, timeSteps.length - 1));
  };

  const stepBackward = () => {
    setCurrentTimeIndex(prev => Math.max(prev - 1, 0));
  };

  // Re-render when time index changes or visibility changes
  useEffect(() => {
    if (isVisible) {
      renderPredictions();
    } else {
      clearPredictionLayers();
    }
  }, [stormPredictions, currentTimeIndex, isVisible, showTrails, showConfidenceZones]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnimation();
      clearPredictionLayers();
    };
  }, []);

  if (!isVisible) {
    return (
      <Button
        onClick={() => onVisibilityChange(true)}
        variant="outline"
        size="sm"
        className="bg-slate-800/80 border-slate-600 text-slate-200 hover:bg-slate-700"
      >
        <Eye className="h-4 w-4 mr-2" />
        Show Path Predictor
      </Button>
    );
  }

  return (
    <Card className="bg-slate-800/90 border-slate-600">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            🛤️ Storm Path Predictor
            <span className="text-xs bg-blue-600 px-2 py-1 rounded text-white">
              {stormPredictions.length} Storms
            </span>
          </CardTitle>
          <Button
            onClick={() => onVisibilityChange(false)}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
          >
            <EyeOff className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Animation Controls */}
        <div className="flex items-center gap-2">
          <Button
            onClick={stepBackward}
            variant="outline"
            size="sm"
            disabled={currentTimeIndex === 0}
            className="bg-slate-700 border-slate-600 text-slate-200"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          <Button
            onClick={isAnimating ? stopAnimation : startAnimation}
            variant="outline"
            size="sm"
            className="bg-slate-700 border-slate-600 text-slate-200"
          >
            {isAnimating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          
          <Button
            onClick={stepForward}
            variant="outline"
            size="sm"
            disabled={currentTimeIndex >= timeSteps.length - 1}
            className="bg-slate-700 border-slate-600 text-slate-200"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          
          <div className="text-xs text-slate-400 ml-2">
            +{timeSteps[currentTimeIndex] || 0} min
          </div>
        </div>

        {/* Time Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Now</span>
            <span>+{predictionHours[0]}h</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((currentTimeIndex + 1) / timeSteps.length) * 100}%`
              }}
            />
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-3 pt-2 border-t border-slate-600">
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Prediction Hours: {predictionHours[0]}h</label>
            <Slider
              value={predictionHours}
              onValueChange={setPredictionHours}
              min={1}
              max={12}
              step={1}
              className="w-full"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Animation Speed: {animationSpeed[0]}x</label>
            <Slider
              value={animationSpeed}
              onValueChange={setAnimationSpeed}
              min={0.5}
              max={5}
              step={0.5}
              className="w-full"
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={() => setShowConfidenceZones(!showConfidenceZones)}
              variant={showConfidenceZones ? "default" : "outline"}
              size="sm"
              className="text-xs flex-1"
            >
              Confidence Zones
            </Button>
          </div>
        </div>

        {/* Storm Summary */}
        {stormPredictions.length > 0 && (
          <div className="pt-2 border-t border-slate-600">
            <div className="text-xs text-slate-400 mb-2">Active Predictions:</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {stormPredictions.slice(0, 5).map((prediction, index) => (
                <div key={prediction.stormId} className="text-xs bg-slate-700/50 rounded p-2">
                  <div className="font-medium text-white">
                    Storm {index + 1}: {prediction.intensity} dBZ
                  </div>
                  <div className="text-slate-400">
                    Moving {prediction.movementVector.direction.toFixed(0)}° @ {prediction.movementVector.speed.toFixed(1)} mph
                  </div>
                </div>
              ))}
              {stormPredictions.length > 5 && (
                <div className="text-xs text-slate-400 text-center pt-1">
                  +{stormPredictions.length - 5} more storms
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}