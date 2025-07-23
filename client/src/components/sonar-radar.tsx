import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Storm {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: number;
  speed?: number;
  type: string;
  description?: string;
}

interface Location {
  lat: number;
  lon: number;
  name: string;
}

interface SonarRadarProps {
  location: Location;
  storms: Storm[];
  radarRange: number;
  formatDistance: (miles: number) => string;
  useMetric: boolean;
  onStormClick?: (storm: Storm) => void;
  className?: string;
}

export default function SonarRadar({ 
  location, 
  storms, 
  radarRange, 
  formatDistance, 
  useMetric,
  onStormClick,
  className = ""
}: SonarRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [sweepAngle, setSweepAngle] = useState(0);
  const [isScanning, setIsScanning] = useState(true);
  const [selectedStorm, setSelectedStorm] = useState<Storm | null>(null);
  const [hoveredStorm, setHoveredStorm] = useState<Storm | null>(null);

  const getStormColor = (intensity: number): string => {
    if (intensity >= 65) return '#ff00ff'; // Purple - Extreme
    if (intensity >= 55) return '#ff0000'; // Red - Severe  
    if (intensity >= 46) return '#ff8c00'; // Orange - Heavy
    if (intensity >= 35) return '#ffff00'; // Yellow - Moderate
    if (intensity >= 20) return '#00ff00'; // Green - Light
    return '#40c4ff'; // Light blue - Very light
  };

  const getStormSize = (intensity: number): number => {
    if (intensity >= 65) return 8; // Extreme
    if (intensity >= 55) return 7; // Severe
    if (intensity >= 46) return 6; // Heavy
    if (intensity >= 35) return 5; // Moderate
    if (intensity >= 20) return 4; // Light
    return 3; // Very light
  };

  const getStormCategory = (intensity: number): string => {
    if (intensity >= 65) return 'Extreme';
    if (intensity >= 55) return 'Severe';
    if (intensity >= 46) return 'Heavy';
    if (intensity >= 35) return 'Moderate';
    if (intensity >= 20) return 'Light';
    return 'Very Light';
  };

  const drawSonarDisplay = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(centerX, centerY) - 20;

    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw range circles
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const radius = (maxRadius * i) / 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Draw compass lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let angle = 0; angle < 360; angle += 30) {
      const radians = (angle * Math.PI) / 180;
      const x1 = centerX + Math.cos(radians) * maxRadius * 0.9;
      const y1 = centerY + Math.sin(radians) * maxRadius * 0.9;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Draw compass labels
    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let i = 0; i < 8; i++) {
      const angle = i * 45;
      const radians = ((angle - 90) * Math.PI) / 180;
      const x = centerX + Math.cos(radians) * (maxRadius + 15);
      const y = centerY + Math.sin(radians) * (maxRadius + 15);
      ctx.fillText(directions[i], x, y + 4);
    }

    // Draw range labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    for (let i = 1; i <= 4; i++) {
      const radius = (maxRadius * i) / 4;
      const range = (radarRange * i) / 4;
      const label = useMetric ? `${(range * 1.609).toFixed(0)}km` : `${range.toFixed(0)}mi`;
      ctx.fillText(label, centerX + radius - 15, centerY - 5);
    }

    // Draw sweep line if scanning
    if (isScanning) {
      const sweepRadians = (sweepAngle * Math.PI) / 180;
      const gradient = ctx.createLinearGradient(
        centerX,
        centerY,
        centerX + Math.cos(sweepRadians) * maxRadius,
        centerY + Math.sin(sweepRadians) * maxRadius
      );
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)');
      gradient.addColorStop(0.7, 'rgba(34, 197, 94, 0.3)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(sweepRadians) * maxRadius,
        centerY + Math.sin(sweepRadians) * maxRadius
      );
      ctx.stroke();
    }

    // Draw storms as blips
    storms.forEach((storm) => {
      if (storm.distance > radarRange) return;

      const stormRadians = ((storm.direction - 90) * Math.PI) / 180;
      const stormRadius = (storm.distance / radarRange) * maxRadius;
      const x = centerX + Math.cos(stormRadians) * stormRadius;
      const y = centerY + Math.sin(stormRadians) * stormRadius;

      const color = getStormColor(storm.intensity);
      const size = getStormSize(storm.intensity);

      // Draw storm blip with glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = hoveredStorm?.id === storm.id ? 15 : 8;
      ctx.fillStyle = color;
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fill();

      // Add pulse effect for severe storms
      if (storm.intensity >= 55) {
        const pulseSize = size + Math.sin(Date.now() / 200) * 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, pulseSize, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.shadowBlur = 0;

      // Draw selection indicator
      if (selectedStorm?.id === storm.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });

    // Draw center point (user location)
    ctx.fillStyle = '#3b82f6';
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(centerX, centerY) - 20;

    // Check if click is on a storm
    let clickedStorm: Storm | null = null;
    let minDistance = Infinity;

    storms.forEach((storm) => {
      if (storm.distance > radarRange) return;

      const stormRadians = ((storm.direction - 90) * Math.PI) / 180;
      const stormRadius = (storm.distance / radarRange) * maxRadius;
      const stormX = centerX + Math.cos(stormRadians) * stormRadius;
      const stormY = centerY + Math.sin(stormRadians) * stormRadius;

      const distance = Math.sqrt((clickX - stormX) ** 2 + (clickY - stormY) ** 2);
      const stormSize = getStormSize(storm.intensity);

      if (distance <= stormSize + 5 && distance < minDistance) {
        minDistance = distance;
        clickedStorm = storm;
      }
    });

    if (clickedStorm) {
      setSelectedStorm(clickedStorm);
      onStormClick?.(clickedStorm);
    } else {
      setSelectedStorm(null);
    }
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(centerX, centerY) - 20;

    // Check if mouse is over a storm
    let hoveredStormFound: Storm | null = null;
    let minDistance = Infinity;

    storms.forEach((storm) => {
      if (storm.distance > radarRange) return;

      const stormRadians = ((storm.direction - 90) * Math.PI) / 180;
      const stormRadius = (storm.distance / radarRange) * maxRadius;
      const stormX = centerX + Math.cos(stormRadians) * stormRadius;
      const stormY = centerY + Math.sin(stormRadians) * stormRadius;

      const distance = Math.sqrt((mouseX - stormX) ** 2 + (mouseY - stormY) ** 2);
      const stormSize = getStormSize(storm.intensity);

      if (distance <= stormSize + 5 && distance < minDistance) {
        minDistance = distance;
        hoveredStormFound = storm;
      }
    });

    setHoveredStorm(hoveredStormFound);
    canvas.style.cursor = hoveredStormFound ? 'pointer' : 'default';
  };

  // Animation loop
  useEffect(() => {
    if (!isScanning) return;

    const animate = () => {
      setSweepAngle((prev) => (prev + 2) % 360);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isScanning]);

  // Redraw canvas
  useEffect(() => {
    drawSonarDisplay();
  }, [sweepAngle, storms, selectedStorm, hoveredStorm, radarRange, useMetric]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientWidth; // Square aspect ratio
        drawSonarDisplay();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  return (
    <div className={`bg-slate-900 rounded-xl border border-slate-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <h3 className="text-lg font-semibold text-white">Sonar Radar</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsScanning(!isScanning)}
            variant="outline"
            size="sm"
            className={`text-xs ${isScanning ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-slate-600/20 border-slate-500 text-slate-300'}`}
          >
            {isScanning ? '⏸️ Pause' : '▶️ Scan'}
          </Button>
          <div className="text-xs text-slate-400">
            Range: {formatDistance(radarRange)}
          </div>
        </div>
      </div>

      {/* Radar Display */}
      <div className="relative p-4">
        <div className="aspect-square w-full">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            className="w-full h-full"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Storm Info Tooltip */}
        {hoveredStorm && (
          <div className="absolute top-4 right-4 bg-slate-800/90 border border-slate-600 rounded-lg p-3 text-xs text-white backdrop-blur-sm">
            <div className="font-semibold">{getStormCategory(hoveredStorm.intensity)} Storm</div>
            <div className="text-slate-300">
              <div>Intensity: {hoveredStorm.intensity.toFixed(1)} dBZ</div>
              <div>Distance: {formatDistance(hoveredStorm.distance)}</div>
              <div>Bearing: {hoveredStorm.direction.toFixed(0)}°</div>
            </div>
          </div>
        )}
      </div>

      {/* Storm Legend */}
      <div className="p-4 border-t border-slate-700">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-slate-300">Light</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-slate-300">Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
            <span className="text-slate-300">Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-slate-300">Severe</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            <span className="text-slate-300">Extreme</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-slate-300">You</span>
          </div>
        </div>
        
        {storms.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="text-slate-400 text-xs">
              {storms.length} storm{storms.length !== 1 ? 's' : ''} detected within {formatDistance(radarRange)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}