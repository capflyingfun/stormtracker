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

const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const [sweepAngle, setSweepAngle] = useState(0);
  const [isScanning, setIsScanning] = useState(true);
  const [selectedStorm, setSelectedStorm] = useState<Storm | null>(null);
  const [hoveredStorm, setHoveredStorm] = useState<Storm | null>(null);
  const [tickerMessages, setTickerMessages] = useState<string[]>([]);
  const [tickerIndex, setTickerIndex] = useState(0);
  const lastFetchSig = useRef('');

  const getStormColor = (intensity: number) => {
    if (intensity >= 65) return '#ff00ff';
    if (intensity >= 55) return '#ff0000';
    if (intensity >= 46) return '#ff8c00';
    if (intensity >= 35) return '#ffff00';
    if (intensity >= 20) return '#00ff00';
    return '#40c4ff';
  };
  const getStormSize = (intensity: number) => {
    if (intensity >= 65) return 8; if (intensity >= 55) return 7;
    if (intensity >= 46) return 6; if (intensity >= 35) return 5;
    if (intensity >= 20) return 4; return 3;
  };
  const getStormCategory = (intensity: number) => {
    if (intensity >= 65) return 'Extreme'; if (intensity >= 55) return 'Severe';
    if (intensity >= 46) return 'Heavy'; if (intensity >= 35) return 'Moderate';
    if (intensity >= 20) return 'Light'; return 'Very Light';
  };
  const getStormTransparency = (intensity: number) => {
    if (intensity >= 65) return 0.2; if (intensity >= 55) return 0.4;
    if (intensity >= 46) return 0.6; if (intensity >= 35) return 0.8;
    return 1.0;
  };

  const drawSonarDisplay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W / 2;
    const cy = H / 2;

    // Storm field radius — leave room for compass ring outside it
    const compassRingR = Math.min(cx, cy) - 8;   // outer compass ring, near canvas edge
    const maxRadius = compassRingR - 22;           // storm field ends here

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Range circles ──────────────────────────────────────────────────────────
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (maxRadius * i) / 4, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // ── Compass spoke lines (every 30°, stop at maxRadius) ────────────────────
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let angle = 0; angle < 360; angle += 30) {
      const r = ((angle - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(r) * maxRadius, cy + Math.sin(r) * maxRadius);
      ctx.stroke();
    }

    // ── Range labels ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#334155';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    for (let i = 1; i <= 4; i++) {
      const r = (maxRadius * i) / 4;
      const val = (radarRange * i) / 4;
      const lbl = useMetric ? `${(val * 1.609).toFixed(0)}km` : `${val.toFixed(0)}mi`;
      ctx.fillText(lbl, cx + r - 12, cy - 4);
    }

    // ── Sweep line ────────────────────────────────────────────────────────────
    if (isScanning) {
      const sr = ((sweepAngle - 90) * Math.PI) / 180;
      const grad = ctx.createLinearGradient(cx, cy,
        cx + Math.cos(sr) * maxRadius, cy + Math.sin(sr) * maxRadius);
      grad.addColorStop(0, 'rgba(34,197,94,0.8)');
      grad.addColorStop(0.7, 'rgba(34,197,94,0.3)');
      grad.addColorStop(1, 'rgba(34,197,94,0)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sr) * maxRadius, cy + Math.sin(sr) * maxRadius);
      ctx.stroke();
    }

    // ── Storm dots ────────────────────────────────────────────────────────────
    const sorted = [...storms].sort((a, b) => a.intensity - b.intensity);
    sorted.forEach(storm => {
      if (storm.distance > radarRange) return;
      const r = ((storm.direction - 90) * Math.PI) / 180;
      const dist = (storm.distance / radarRange) * maxRadius;
      const sx = cx + Math.cos(r) * dist;
      const sy = cy + Math.sin(r) * dist;
      const color = getStormColor(storm.intensity);
      const size = getStormSize(storm.intensity);
      const alpha = getStormTransparency(storm.intensity);

      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = hoveredStorm?.id === storm.id ? 15 : 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, 2 * Math.PI);
      ctx.fill();

      if (storm.intensity >= 55) {
        const ps = size + Math.sin(Date.now() / 200) * 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath(); ctx.arc(sx, sy, ps, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (selectedStorm?.id === storm.id) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(sx, sy, size + 4, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });

    // ── Center dot (user) ─────────────────────────────────────────────────────
    ctx.fillStyle = '#3b82f6'; ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.shadowBlur = 0;

    // ══ COMPASS ROSE RING (integrated into canvas outer edge) ══════════════════
    // Outer ring circle
    ctx.strokeStyle = '#2d4060';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, compassRingR, 0, 2 * Math.PI);
    ctx.stroke();

    // Dominant movement direction
    const movWind = storms.find(s => s.windsPrediction?.speed && s.windsPrediction.speed > 0)?.windsPrediction;

    // Sector highlight for movement direction
    if (movWind && movWind.speed > 2) {
      const movRad = ((movWind.direction - 90) * Math.PI) / 180;
      const spread = 16 * (Math.PI / 180);
      ctx.fillStyle = 'rgba(251,191,36,0.08)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, compassRingR - 1, movRad - spread, movRad + spread);
      ctx.closePath();
      ctx.fill();
    }

    // 16 tick marks + direction labels
    const smallCanvas = W < 300;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) {
      const deg = i * 22.5;
      const isCardinal = (i % 4 === 0);   // N E S W
      const isMajor = (i % 2 === 0);       // also NE SE SW NW
      const rad = ((deg - 90) * Math.PI) / 180;

      // Tick mark (from storm field boundary outward to ring)
      const tickOuter = compassRingR;
      const tickInner = isCardinal ? maxRadius + 2 : isMajor ? maxRadius + 7 : maxRadius + 10;
      ctx.strokeStyle = isCardinal ? '#3b6fa0' : isMajor ? '#2d4060' : '#1e3050';
      ctx.lineWidth = isCardinal ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * tickInner, cy + Math.sin(rad) * tickInner);
      ctx.lineTo(cx + Math.cos(rad) * tickOuter, cy + Math.sin(rad) * tickOuter);
      ctx.stroke();

      // Label (inside the ring, between maxRadius and compassRingR)
      const labelR = isCardinal
        ? maxRadius + (compassRingR - maxRadius) * 0.45
        : isMajor
          ? maxRadius + (compassRingR - maxRadius) * 0.5
          : maxRadius + (compassRingR - maxRadius) * 0.65;
      const lx = cx + Math.cos(rad) * labelR;
      const ly = cy + Math.sin(rad) * labelR;

      if (isCardinal) {
        ctx.fillStyle = '#60a5fa';
        ctx.font = `bold ${smallCanvas ? '8px' : '9px'} monospace`;
      } else if (isMajor) {
        ctx.fillStyle = '#7a9ab5';
        ctx.font = `${smallCanvas ? '7px' : '8px'} monospace`;
      } else {
        ctx.fillStyle = '#3d5570';
        ctx.font = `${smallCanvas ? '5.5px' : '6.5px'} monospace`;
      }
      ctx.fillText(COMPASS_16[i], lx, ly);
    }

    // ── Movement indicator dot ON the compass ring ────────────────────────────
    if (movWind && movWind.speed > 2) {
      const movRad = ((movWind.direction - 90) * Math.PI) / 180;
      const dotX = cx + Math.cos(movRad) * compassRingR;
      const dotY = cy + Math.sin(movRad) * compassRingR;

      // Outer glow
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Bright center
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [sweepAngle, storms, selectedStorm, hoveredStorm, radarRange, useMetric, isScanning]);

  const getStormAtPoint = (px: number, py: number, canvas: HTMLCanvasElement) => {
    const W = canvas.clientWidth;
    const cx = W / 2; const cy = canvas.clientHeight / 2;
    const compassRingR = Math.min(cx, cy) - 8;
    const maxRadius = compassRingR - 22;
    let best: Storm | null = null; let minD = Infinity;
    storms.forEach(storm => {
      if (storm.distance > radarRange) return;
      const r = ((storm.direction - 90) * Math.PI) / 180;
      const d = (storm.distance / radarRange) * maxRadius;
      const sx = cx + Math.cos(r) * d;
      const sy = cy + Math.sin(r) * d;
      const dist = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
      if (dist <= getStormSize(storm.intensity) + 5 && dist < minD) { minD = dist; best = storm; }
    });
    return best;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = getStormAtPoint(e.clientX - rect.left, e.clientY - rect.top, canvas);
    if (s) { setSelectedStorm(s); onStormClick?.(s); } else setSelectedStorm(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = getStormAtPoint(e.clientX - rect.left, e.clientY - rect.top, canvas);
    setHoveredStorm(s);
    canvas.style.cursor = s ? 'pointer' : 'default';
  };

  // Fetch AI ticker messages
  useEffect(() => {
    if (!storms.length || !location) return;
    const sig = `${location.lat.toFixed(3)},${location.lon.toFixed(3)},${storms.length},${Math.round(storms.reduce((s, x) => s + x.intensity, 0))}`;
    if (sig === lastFetchSig.current) return;
    lastFetchSig.current = sig;
    const top = [...storms].sort((a, b) => b.intensity - a.intensity).slice(0, 8).map(s => ({
      intensity: s.intensity, distance: s.distance, direction: s.direction, type: s.type, windsPrediction: s.windsPrediction,
    }));
    fetch('/api/ticker-messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storms: top, totalStormCount: storms.length, locationName: location.name, userLocation: { lat: location.lat, lon: location.lon } }),
    }).then(r => r.json()).then(d => {
      if (d.messages?.length) { setTickerMessages(d.messages); setTickerIndex(0); }
    }).catch(() => {});
  }, [storms, location]);

  // Sweep animation
  useEffect(() => {
    if (!isScanning) return;
    const go = () => { setSweepAngle(p => (p + 0.5) % 360); animationFrameRef.current = requestAnimationFrame(go); };
    animationFrameRef.current = requestAnimationFrame(go);
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isScanning]);

  useEffect(() => { drawSonarDisplay(); }, [drawSonarDisplay]);

  // Resize — use the wrapper div (has explicit max-width) for reliable measurement
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const resize = () => {
      const wr = wrapper.getBoundingClientRect();
      // Fill card width, cap height to keep sonar card compact on phones
      const size = Math.max(Math.min(wr.width, window.innerHeight * 0.35), 60);
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
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  const getWindDirLabel = (deg: number) => COMPASS_16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

  const dominantWind = storms.find(s => s.windsPrediction?.speed && s.windsPrediction.speed > 0)?.windsPrediction;

  const currentTickerMsg = tickerMessages.length > 0
    ? tickerMessages[tickerIndex % tickerMessages.length]
    : storms.length > 0
      ? `🌧️ Tracking ${storms.length} cells within ${formatDistance(radarRange)} — monitoring conditions`
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
          <span className="text-xs text-slate-400">{formatDistance(radarRange)}</span>
        </div>
      </div>

      {/* Canvas — wrapper fills card width; ResizeObserver watches it for reliable sizing */}
      <div className="p-2 bg-slate-900">
        <div ref={wrapperRef} className="w-full">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            className="block rounded-lg mx-auto"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Hover tooltip */}
        {hoveredStorm && (
          <div className="absolute top-14 right-2 bg-slate-800/95 border border-slate-600 rounded-lg p-2 text-xs text-white z-10 max-w-[160px]">
            <div className="font-semibold">{getStormCategory(hoveredStorm.intensity)}</div>
            <div className="text-slate-300 space-y-0.5">
              <div>{hoveredStorm.intensity.toFixed(1)} dBZ · {formatDistance(hoveredStorm.distance)}</div>
              <div>Bearing {hoveredStorm.direction.toFixed(0)}°</div>
              {hoveredStorm.windsPrediction?.speed ? (
                <div>Moving {getWindDirLabel(hoveredStorm.windsPrediction.direction)} @ {Math.round(hoveredStorm.windsPrediction.speed)} mph</div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: legend + stats + ticker */}
      <div className="border-t border-slate-700 p-3 space-y-2">
        {/* Color legend */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
          {[['bg-green-500','Light'],['bg-yellow-500','Moderate'],['bg-orange-500','Heavy'],
            ['bg-red-500','Severe'],['bg-purple-500','Extreme'],['bg-blue-500','You']].map(([c,l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c}`}></div>
              <span className="text-slate-300">{l}</span>
            </div>
          ))}
        </div>

        {/* Storm count + movement */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">
            {storms.length > 0 ? `${storms.length} storm${storms.length !== 1 ? 's' : ''} within ${formatDistance(radarRange)}` : 'No storms detected'}
          </span>
          {dominantWind && dominantWind.speed > 2 && (
            <span className="text-amber-400/90 font-medium">
              Storm Direction: {getWindDirLabel(dominantWind.direction)} · {Math.round(dominantWind.speed)} mph
            </span>
          )}
        </div>

        {/* AI Ticker */}
        {currentTickerMsg && (
          <div className="border-t border-slate-800 pt-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Live</span>
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Weather Update</span>
            </div>
            <div className="relative overflow-hidden rounded bg-slate-800/60 border border-slate-700/50 h-7 flex items-center">
              <div className="absolute left-0 top-0 bottom-0 w-5 z-10 bg-gradient-to-r from-slate-800 to-transparent pointer-events-none"></div>
              <div className="absolute right-0 top-0 bottom-0 w-5 z-10 bg-gradient-to-l from-slate-800 to-transparent pointer-events-none"></div>
              <div key={currentTickerMsg} className="text-xs text-slate-200 whitespace-nowrap px-2"
                style={{ animation: 'sonar-ticker 18s linear forwards' }}
                onAnimationEnd={() => setTickerIndex(i => i + 1)}>
                {currentTickerMsg}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes sonar-ticker { 0% { transform: translateX(100%); } 100% { transform: translateX(-130%); } }`}</style>
    </div>
  );
}
