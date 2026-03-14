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

// ─── Compass Rose ────────────────────────────────────────────────────────────
function CompassRose({ movDir, movSpeed }: { movDir?: number; movSpeed?: number }) {
  const cx = 70;
  const cy = 70;
  const outerR = 63;
  const innerR = 47;
  const size = 140;
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

  // All 16 compass points: index, label, isMajor, isCardinal
  const all16 = [
    { i: 0,  lbl: 'N',   major: true,  cardinal: true  },
    { i: 1,  lbl: 'NNE', major: false, cardinal: false },
    { i: 2,  lbl: 'NE',  major: true,  cardinal: false },
    { i: 3,  lbl: 'ENE', major: false, cardinal: false },
    { i: 4,  lbl: 'E',   major: true,  cardinal: true  },
    { i: 5,  lbl: 'ESE', major: false, cardinal: false },
    { i: 6,  lbl: 'SE',  major: true,  cardinal: false },
    { i: 7,  lbl: 'SSE', major: false, cardinal: false },
    { i: 8,  lbl: 'S',   major: true,  cardinal: true  },
    { i: 9,  lbl: 'SSW', major: false, cardinal: false },
    { i: 10, lbl: 'SW',  major: true,  cardinal: false },
    { i: 11, lbl: 'WSW', major: false, cardinal: false },
    { i: 12, lbl: 'W',   major: true,  cardinal: true  },
    { i: 13, lbl: 'WNW', major: false, cardinal: false },
    { i: 14, lbl: 'NW',  major: true,  cardinal: false },
    { i: 15, lbl: 'NNW', major: false, cardinal: false },
  ];

  const hasMovement = movDir !== undefined && movSpeed !== undefined && movSpeed > 2;
  const indRad = hasMovement ? toRad(movDir!) : null;
  const dotX = indRad !== null ? cx + Math.cos(indRad) * outerR : null;
  const dotY = indRad !== null ? cy + Math.sin(indRad) * outerR : null;

  const sectorPath = hasMovement
    ? (() => {
        const spread = 18 * (Math.PI / 180);
        const r = outerR - 1;
        const a1 = indRad! - spread;
        const a2 = indRad! + spread;
        return `M ${cx} ${cy} L ${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r} A ${r} ${r} 0 0 1 ${cx + Math.cos(a2) * r} ${cy + Math.sin(a2) * r} Z`;
      })()
    : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
      {/* Sector highlight wedge */}
      {sectorPath && <path d={sectorPath} fill="rgba(251,191,36,0.13)" />}

      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#334155" strokeWidth="1.5" />
      {/* Inner reference ring */}
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#1e293b" strokeWidth="1" />

      {/* Tick marks + labels for all 16 points */}
      {all16.map(({ i, lbl, major, cardinal }) => {
        const deg = i * 22.5;
        const rad = toRad(deg);
        // Tick from inner ring to outer ring
        const tickInner = major ? outerR - 8 : outerR - 5;
        const x1 = cx + Math.cos(rad) * tickInner;
        const y1 = cy + Math.sin(rad) * tickInner;
        const x2 = cx + Math.cos(rad) * outerR;
        const y2 = cy + Math.sin(rad) * outerR;
        // Label radius: major inside innerR, minor just inside innerR
        const labelR = major ? innerR - 9 : innerR - 4;
        const lx = cx + Math.cos(rad) * labelR;
        const ly = cy + Math.sin(rad) * labelR;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={major ? '#475569' : '#2d3d52'} strokeWidth={major ? 1.5 : 1} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fill={cardinal ? '#60a5fa' : major ? '#94a3b8' : '#475569'}
              fontSize={cardinal ? '9' : major ? '8' : '6'}
              fontWeight={cardinal ? 'bold' : major ? 'normal' : 'normal'}
              fontFamily="monospace">
              {lbl}
            </text>
          </g>
        );
      })}

      {/* Dashed needle */}
      {hasMovement && indRad !== null && (
        <line x1={cx} y1={cy}
          x2={cx + Math.cos(indRad) * (outerR - 5)}
          y2={cy + Math.sin(indRad) * (outerR - 5)}
          stroke="rgba(251,191,36,0.55)" strokeWidth="1" strokeDasharray="3 2" />
      )}

      {/* Glowing indicator dot */}
      {hasMovement && dotX !== null && dotY !== null && (
        <>
          <circle cx={dotX} cy={dotY} r="7" fill="rgba(251,191,36,0.18)" />
          <circle cx={dotX} cy={dotY} r="4.5" fill="#f59e0b" />
          <circle cx={dotX} cy={dotY} r="2" fill="#fef3c7" />
        </>
      )}

      {/* Center: user dot */}
      <circle cx={cx} cy={cy} r="4" fill="#1e293b" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r="2" fill="#3b82f6" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
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

  const [tickerMessages, setTickerMessages] = useState<string[]>([]);
  const [tickerIndex, setTickerIndex] = useState(0);
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

    // Direction labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const majorDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const isMobile = displayWidth < 400;
    const labelOffset = isMobile ? 20 : 30;
    for (let i = 0; i < 8; i++) {
      const angle = i * 45;
      const radians = ((angle - 90) * Math.PI) / 180;
      const x = centerX + Math.cos(radians) * (maxRadius + labelOffset);
      const y = centerY + Math.sin(radians) * (maxRadius + labelOffset);
      ctx.fillStyle = '#94a3b8';
      ctx.font = `${isMobile ? '10px' : '12px'} monospace`;
      ctx.fillText(majorDirections[i], x, y);
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

    // Storm dots sorted lowest→highest intensity
    const sortedStorms = [...storms].sort((a, b) => a.intensity - b.intensity);
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

    // Center dot
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
    let minDist = Infinity;
    storms.forEach((storm) => {
      if (storm.distance > radarRange) return;
      const r = ((storm.direction - 90) * Math.PI) / 180;
      const sr = (storm.distance / radarRange) * maxRadius;
      const sx = centerX + Math.cos(r) * sr;
      const sy = centerY + Math.sin(r) * sr;
      const d = Math.sqrt((clickX - sx) ** 2 + (clickY - sy) ** 2);
      if (d <= getStormSize(storm.intensity) + 5 && d < minDist) { minDist = d; clickedStorm = storm; }
    });
    if (clickedStorm) { setSelectedStorm(clickedStorm); onStormClick?.(clickedStorm); }
    else setSelectedStorm(null);
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
    let found: Storm | null = null;
    let minDist = Infinity;
    storms.forEach((storm) => {
      if (storm.distance > radarRange) return;
      const r = ((storm.direction - 90) * Math.PI) / 180;
      const sr = (storm.distance / radarRange) * maxRadius;
      const sx = centerX + Math.cos(r) * sr;
      const sy = centerY + Math.sin(r) * sr;
      const d = Math.sqrt((mouseX - sx) ** 2 + (mouseY - sy) ** 2);
      if (d <= getStormSize(storm.intensity) + 5 && d < minDist) { minDist = d; found = storm; }
    });
    setHoveredStorm(found);
    canvas.style.cursor = found ? 'pointer' : 'default';
  };

  // Fetch AI ticker messages
  useEffect(() => {
    if (!storms.length || !location) return;
    const sig = `${location.lat.toFixed(3)},${location.lon.toFixed(3)},${storms.length},${Math.round(storms.reduce((s, x) => s + x.intensity, 0))}`;
    if (sig === lastFetchSig.current) return;
    lastFetchSig.current = sig;
    const topStorms = [...storms].sort((a, b) => b.intensity - a.intensity).slice(0, 8).map(s => ({
      intensity: s.intensity, distance: s.distance, direction: s.direction, type: s.type, windsPrediction: s.windsPrediction,
    }));
    fetch('/api/ticker-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storms: topStorms, locationName: location.name, userLocation: { lat: location.lat, lon: location.lon } }),
    }).then(r => r.json()).then(data => {
      if (data.messages?.length) { setTickerMessages(data.messages); setTickerIndex(0); }
    }).catch(() => {});
  }, [storms, location]);

  // Animation loop
  useEffect(() => {
    if (!isScanning) return;
    const animate = () => { setSweepAngle((p) => (p + 0.5) % 360); animationFrameRef.current = requestAnimationFrame(animate); };
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isScanning]);

  useEffect(() => { drawSonarDisplay(); }, [drawSonarDisplay]);

  // Resize canvas — capped so it never overflows
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const cr = container.getBoundingClientRect();
      // Cap canvas so the full card fits on a phone screen without scrolling
      const maxH = window.innerHeight * 0.30;
      const size = Math.min(cr.width, 240, maxH);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      drawSonarDisplay();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const getWindDirLabel = (deg: number) => {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  const dominantWind = storms.find(s => s.windsPrediction?.speed && s.windsPrediction.speed > 0)?.windsPrediction;

  const currentTickerMsg = tickerMessages.length > 0
    ? tickerMessages[tickerIndex % tickerMessages.length]
    : storms.length > 0
      ? `🌧️ ${storms.length} precipitation cells detected within ${formatDistance(radarRange)} — stay weather aware`
      : null;

  return (
    <div className={`bg-slate-900 rounded-xl border border-slate-700 overflow-hidden select-none ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <h3 className="text-base font-semibold text-white">Sonar Radar</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsScanning(!isScanning)} variant="outline" size="sm"
            className={`text-xs px-2 py-1 ${isScanning ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-slate-600/20 border-slate-500 text-slate-300'}`}>
            {isScanning ? 'Pause' : 'Scan'}
          </Button>
          <div className="text-xs text-slate-400">{formatDistance(radarRange)}</div>
        </div>
      </div>

      {/* Radar Canvas — centered, size capped by resize handler */}
      <div className="relative p-2 flex justify-center items-center bg-slate-900">
        <div className="relative flex-shrink-0">
          <canvas ref={canvasRef} onClick={handleCanvasClick} onMouseMove={handleCanvasMouseMove}
            className="block border border-slate-700/30 rounded-lg"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        {hoveredStorm && (
          <div className="absolute top-2 right-2 bg-slate-800/90 border border-slate-600 rounded-lg p-2 text-xs text-white backdrop-blur-sm max-w-[180px]">
            <div className="font-semibold">{getStormCategory(hoveredStorm.intensity)} Storm</div>
            <div className="text-slate-300 space-y-0.5">
              <div>{hoveredStorm.intensity.toFixed(1)} dBZ · {formatDistance(hoveredStorm.distance)}</div>
              <div>Bearing: {hoveredStorm.direction.toFixed(0)}°</div>
              {hoveredStorm.windsPrediction?.speed ? (
                <div>Moving: {getWindDirLabel(hoveredStorm.windsPrediction.direction)} @ {Math.round(hoveredStorm.windsPrediction.speed)} mph</div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel: legend + compass rose + ticker */}
      <div className="border-t border-slate-700">
        {/* Color legend + compass rose side by side */}
        <div className="p-3 flex items-start gap-3">
          {/* Legend grid */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
              {[
                { color: 'bg-green-500', label: 'Light' },
                { color: 'bg-yellow-500', label: 'Moderate' },
                { color: 'bg-orange-500', label: 'Heavy' },
                { color: 'bg-red-500', label: 'Severe' },
                { color: 'bg-purple-500', label: 'Extreme' },
                { color: 'bg-blue-500', label: 'You' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`}></div>
                  <span className="text-slate-300 text-[11px]">{label}</span>
                </div>
              ))}
            </div>

            {/* Storm count */}
            <div className="mt-2 text-slate-400 text-xs">
              {storms.length > 0
                ? `${storms.length} storm${storms.length !== 1 ? 's' : ''} within ${formatDistance(radarRange)}`
                : 'No storms detected'}
            </div>

            {/* Movement label under count */}
            {dominantWind && dominantWind.speed > 2 && (
              <div className="mt-1 text-xs text-amber-400/80">
                Moving {getWindDirLabel(dominantWind.direction)} · {Math.round(dominantWind.speed)} mph
              </div>
            )}
          </div>

          {/* Compass rose */}
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <CompassRose
              movDir={dominantWind?.speed && dominantWind.speed > 2 ? dominantWind.direction : undefined}
              movSpeed={dominantWind?.speed}
            />
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Storm Movement</span>
          </div>
        </div>

        {/* AI Ticker */}
        {currentTickerMsg && (
          <div className="px-3 pb-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5 mt-2 mb-1">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Live</span>
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Weather Update</span>
            </div>
            <div className="relative overflow-hidden rounded bg-slate-800/60 border border-slate-700/50 h-7 flex items-center">
              <div className="absolute left-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-r from-slate-800 to-transparent pointer-events-none"></div>
              <div className="absolute right-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-l from-slate-800 to-transparent pointer-events-none"></div>
              <div key={currentTickerMsg} className="text-xs text-slate-200 whitespace-nowrap px-2"
                style={{ animation: 'sonar-ticker-scroll 18s linear forwards' }}
                onAnimationEnd={() => setTickerIndex(i => i + 1)}>
                {currentTickerMsg}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes sonar-ticker-scroll {
          0%   { transform: translateX(100%); }
          100% { transform: translateX(-130%); }
        }
      `}</style>
    </div>
  );
}
