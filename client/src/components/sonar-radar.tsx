import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface WindsPrediction {
  direction: number;
  speed: number;
  confidence?: string;
}

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
  windsPrediction?: WindsPrediction;
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

  // Ticker state
  const [tickerMessages, setTickerMessages] = useState<string[]>([]);
  const [tickerIndex, setTickerIndex] = useState(0);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerAnimRef = useRef<Animation | null>(null);
  const lastFetchSig = useRef('');

  const getStormColor = (intensity: number): string => {
    if (intensity >= 65) return '#ff00ff';
    if (intensity >= 55) return '#ff0000';
    if (intensity >= 46) return '#ff8c00';
    if (intensity >= 35) return '#ffff00';
    if (intensity >= 20) return '#00ff00';
    return '#40c4ff';
  };

  const getStormSize = (intensity: number): number => {
    if (intensity >= 65) return 8;
    if (intensity >= 55) return 7;
    if (intensity >= 46) return 6;
    if (intensity >= 35) return 5;
    if (intensity >= 20) return 4;
    return 3;
  };

  const getStormCategory = (intensity: number): string => {
    if (intensity >= 65) return 'Extreme';
    if (intensity >= 55) return 'Severe';
    if (intensity >= 46) return 'Heavy';
    if (intensity >= 35) return 'Moderate';
    if (intensity >= 20) return 'Light';
    return 'Very Light';
  };

  const getStormTransparency = (intensity: number): number => {
    if (intensity >= 65) return 0.2;
    if (intensity >= 55) return 0.4;
    if (intensity >= 46) return 0.6;
    if (intensity >= 35) return 0.8;
    if (intensity >= 20) return 1.0;
    return 1.0;
  };

  // Draw a Windy-style movement arrow through the storm blip
  const drawMovementArrow = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    movDir: number,
    movSpeed: number,
    stormColor: string
  ) => {
    if (movSpeed < 3) return; // Don't draw arrow for nearly stationary storms

    // Arrow length proportional to speed: 5px at 5mph → 30px at 60mph
    const arrowLen = Math.min(30, Math.max(10, (movSpeed / 60) * 30));
    const headLen = Math.max(5, arrowLen * 0.35);
    const headAngle = Math.PI / 5;

    // movDir is the direction the storm is MOVING TO (meteorological convention: 270 = moving west)
    const radians = ((movDir - 90) * Math.PI) / 180;
    const cosR = Math.cos(radians);
    const sinR = Math.sin(radians);

    // Tail starts behind storm, head is in front
    const tailX = x - cosR * (arrowLen * 0.4);
    const tailY = y - sinR * (arrowLen * 0.4);
    const headX = x + cosR * (arrowLen * 0.6);
    const headY = y + sinR * (arrowLen * 0.6);

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(
      headX - headLen * Math.cos(radians - headAngle),
      headY - headLen * Math.sin(radians - headAngle)
    );
    ctx.lineTo(
      headX - headLen * Math.cos(radians + headAngle),
      headY - headLen * Math.sin(radians + headAngle)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  const drawSonarDisplay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const centerX = displayWidth / 2;
    const centerY = displayHeight / 2;
    const maxRadius = Math.min(centerX, centerY) - 30;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Range circles
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const radius = (maxRadius * i) / 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Compass lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let angle = 0; angle < 360; angle += 30) {
      const radians = ((angle - 90) * Math.PI) / 180;
      const x1 = centerX + Math.cos(radians) * maxRadius * 0.9;
      const y1 = centerY + Math.sin(radians) * maxRadius * 0.9;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Compass labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const majorDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const isMobile = displayWidth < 400;
    const majorFontSize = isMobile ? '10px' : '12px';
    const minorFontSize = isMobile ? '7px' : '9px';
    const labelOffset = isMobile ? 20 : 30;
    for (let i = 0; i < 8; i++) {
      const angle = i * 45;
      const radians = ((angle - 90) * Math.PI) / 180;
      const x = centerX + Math.cos(radians) * (maxRadius + labelOffset);
      const y = centerY + Math.sin(radians) * (maxRadius + labelOffset);
      ctx.fillStyle = '#94a3b8';
      ctx.font = `${majorFontSize} monospace`;
      ctx.fillText(majorDirections[i], x, y);
    }
    if (!isMobile) {
      ctx.fillStyle = '#475569';
      ctx.font = `${minorFontSize} monospace`;
      for (let angle = 0; angle < 360; angle += 30) {
        if (angle % 45 !== 0) {
          const radians = ((angle - 90) * Math.PI) / 180;
          const x = centerX + Math.cos(radians) * (maxRadius + labelOffset - 5);
          const y = centerY + Math.sin(radians) * (maxRadius + labelOffset - 5);
          ctx.fillText(angle.toString().padStart(3, '0'), x, y);
        }
      }
    }

    // Range labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    for (let i = 1; i <= 4; i++) {
      const radius = (maxRadius * i) / 4;
      const range = (radarRange * i) / 4;
      const label = useMetric ? `${(range * 1.609).toFixed(0)}km` : `${range.toFixed(0)}mi`;
      ctx.fillText(label, centerX + radius - 15, centerY - 5);
    }

    // Sweep line
    if (isScanning) {
      ctx.globalAlpha = 1.0;
      const sweepRadians = ((sweepAngle - 90) * Math.PI) / 180;
      const gradient = ctx.createLinearGradient(
        centerX, centerY,
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

    // Draw storms sorted by intensity (lowest first so highest renders on top)
    const sortedStorms = [...storms].sort((a, b) => a.intensity - b.intensity);

    // First pass: draw movement arrows (behind storm dots)
    sortedStorms.forEach((storm) => {
      if (storm.distance > radarRange) return;
      if (!storm.windsPrediction || storm.windsPrediction.speed < 3) return;

      const stormRadians = ((storm.direction - 90) * Math.PI) / 180;
      const stormRadius = (storm.distance / radarRange) * maxRadius;
      const x = centerX + Math.cos(stormRadians) * stormRadius;
      const y = centerY + Math.sin(stormRadians) * stormRadius;

      drawMovementArrow(ctx, x, y, storm.windsPrediction.direction, storm.windsPrediction.speed, getStormColor(storm.intensity));
    });

    // Second pass: draw storm dots on top of arrows
    sortedStorms.forEach((storm) => {
      if (storm.distance > radarRange) return;

      const stormRadians = ((storm.direction - 90) * Math.PI) / 180;
      const stormRadius = (storm.distance / radarRange) * maxRadius;
      const x = centerX + Math.cos(stormRadians) * stormRadius;
      const y = centerY + Math.sin(stormRadians) * stormRadius;

      const color = getStormColor(storm.intensity);
      const size = getStormSize(storm.intensity);
      const transparency = getStormTransparency(storm.intensity);

      ctx.globalAlpha = transparency;
      ctx.shadowColor = color;
      ctx.shadowBlur = hoveredStorm?.id === storm.id ? 15 : 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fill();

      if (storm.intensity >= 55) {
        const pulseSize = size + Math.sin(Date.now() / 200) * 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = transparency * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, pulseSize, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      if (selectedStorm?.id === storm.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    });

    // Center dot (user location)
    ctx.fillStyle = '#3b82f6';
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [sweepAngle, storms, selectedStorm, hoveredStorm, radarRange, useMetric, isScanning]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    const centerX = canvas.clientWidth / 2;
    const centerY = canvas.clientHeight / 2;
    const maxRadius = Math.min(centerX, centerY) - 30;
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
    const centerX = canvas.clientWidth / 2;
    const centerY = canvas.clientHeight / 2;
    const maxRadius = Math.min(centerX, centerY) - 30;
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

  // Fetch AI ticker messages when storm data changes
  useEffect(() => {
    if (!storms.length || !location) return;
    const sig = `${location.lat.toFixed(3)},${location.lon.toFixed(3)},${storms.length},${Math.round(storms.reduce((s, x) => s + x.intensity, 0))}`;
    if (sig === lastFetchSig.current) return;
    lastFetchSig.current = sig;

    const topStorms = [...storms].sort((a, b) => b.intensity - a.intensity).slice(0, 8).map(s => ({
      intensity: s.intensity,
      distance: s.distance,
      direction: s.direction,
      type: s.type,
      windsPrediction: s.windsPrediction,
    }));

    fetch('/api/ticker-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storms: topStorms,
        locationName: location.name,
        userLocation: { lat: location.lat, lon: location.lon },
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.messages?.length) {
          setTickerMessages(data.messages);
          setTickerIndex(0);
        }
      })
      .catch(() => {});
  }, [storms, location]);

  // Animation loop
  useEffect(() => {
    if (!isScanning) return;
    const animate = () => {
      setSweepAngle((prev) => (prev + 0.5) % 360);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isScanning]);

  // Redraw canvas
  useEffect(() => {
    drawSonarDisplay();
  }, [drawSonarDisplay]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const size = Math.min(containerRect.width, containerRect.height);
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
        drawSonarDisplay();
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Get wind direction summary for display
  const getWindDirectionLabel = (deg: number): string => {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  // Find dominant wind from storms for the movement legend
  const dominantWind = storms.find(s => s.windsPrediction?.speed && s.windsPrediction.speed > 0)?.windsPrediction;

  const currentTickerMsg = tickerMessages.length > 0
    ? tickerMessages[tickerIndex % tickerMessages.length]
    : storms.length > 0
      ? `🌧️ ${storms.length} precipitation cells detected within ${formatDistance(radarRange)} — stay weather aware`
      : null;

  return (
    <div className={`bg-slate-900 rounded-xl border border-slate-700 overflow-hidden select-none ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-slate-700 select-none">
        <div className="flex items-center gap-2 select-none">
          <div className="w-2 h-2 md:w-3 md:h-3 bg-green-500 rounded-full animate-pulse select-none"></div>
          <h3 className="text-base md:text-lg font-semibold text-white select-none">Sonar Radar</h3>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <Button
            onClick={() => setIsScanning(!isScanning)}
            variant="outline"
            size="sm"
            className={`text-xs px-2 py-1 ${isScanning ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-slate-600/20 border-slate-500 text-slate-300'}`}
          >
            {isScanning ? 'Pause' : 'Scan'}
          </Button>
          <div className="text-xs text-slate-400 hidden sm:block">
            Range: {formatDistance(radarRange)}
          </div>
        </div>
      </div>

      {/* Radar Display */}
      <div className="relative p-2 md:p-4 flex justify-center items-center">
        <div className="relative aspect-square w-full max-w-sm md:max-w-lg">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            className="block border border-slate-700/30 rounded-lg w-full h-full"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Storm hover tooltip */}
        {hoveredStorm && (
          <div className="absolute top-2 right-2 md:top-4 md:right-4 bg-slate-800/90 border border-slate-600 rounded-lg p-2 md:p-3 text-xs text-white backdrop-blur-sm max-w-[200px] select-none">
            <div className="font-semibold">{getStormCategory(hoveredStorm.intensity)} Storm</div>
            <div className="text-slate-300">
              <div>Intensity: {hoveredStorm.intensity.toFixed(1)} dBZ</div>
              <div>Distance: {formatDistance(hoveredStorm.distance)}</div>
              <div>Bearing: {hoveredStorm.direction.toFixed(0)}°</div>
              {hoveredStorm.windsPrediction && hoveredStorm.windsPrediction.speed > 0 && (
                <div>Moving: {getWindDirectionLabel(hoveredStorm.windsPrediction.direction)} @ {Math.round(hoveredStorm.windsPrediction.speed)} mph</div>
              )}
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

        {/* Storm count + movement direction summary */}
        <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-slate-400 text-xs">
            {storms.length > 0
              ? `${storms.length} storm${storms.length !== 1 ? 's' : ''} detected within ${formatDistance(radarRange)}`
              : 'No storms detected'}
          </div>
          {dominantWind && dominantWind.speed > 3 && (
            <div className="flex items-center gap-1.5 text-xs bg-slate-800 px-2 py-1 rounded-full border border-slate-600/50">
              {/* Mini arrow SVG */}
              <svg width="14" height="14" viewBox="0 0 14 14">
                <line x1="2" y1="7" x2="10" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <polygon points="10,4 14,7 10,10" fill="white" opacity="0.9"/>
              </svg>
              <span className="text-slate-300">
                Storms moving {getWindDirectionLabel(dominantWind.direction)} · {Math.round(dominantWind.speed)} mph
              </span>
            </div>
          )}
        </div>

        {/* AI Ticker */}
        {currentTickerMsg && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Live</span>
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Weather Update</span>
            </div>
            <div className="relative overflow-hidden rounded bg-slate-800/60 border border-slate-700/50 h-8 flex items-center">
              {/* Fade masks */}
              <div className="absolute left-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-r from-slate-800/80 to-transparent pointer-events-none"></div>
              <div className="absolute right-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-l from-slate-800/80 to-transparent pointer-events-none"></div>
              {/* Scrolling text */}
              <div
                key={currentTickerMsg}
                className="text-xs text-slate-200 whitespace-nowrap px-2"
                style={{
                  animation: 'sonar-ticker-scroll 18s linear forwards',
                }}
                onAnimationEnd={() => setTickerIndex(i => i + 1)}
              >
                {currentTickerMsg}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ticker animation keyframes */}
      <style>{`
        @keyframes sonar-ticker-scroll {
          0%   { transform: translateX(100%); }
          100% { transform: translateX(-120%); }
        }
      `}</style>
    </div>
  );
}
