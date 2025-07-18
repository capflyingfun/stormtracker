import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';

interface CanvasStorm {
  id: string;
  x: number;
  y: number;
  z: number;
  intensity: number;
  distance: number;
  direction: string;
  color: string;
  height: number;
}

interface HTMLCanvas3DProps {
  location: { lat: number; lon: number; name: string };
  precipitationStorms: any[];
  onClose: () => void;
}

export default function HTMLCanvas3D({ location, precipitationStorms, onClose }: HTMLCanvas3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const animationRef = useRef<number>();

  console.log('[HTML Canvas 3D] Starting with storms:', precipitationStorms.length);

  // Process storms data
  const canvasStorms: CanvasStorm[] = precipitationStorms
    .filter(storm => storm && typeof storm.lat === 'number' && typeof storm.lon === 'number')
    .slice(0, 50)
    .map((storm, index) => {
      const x = (storm.lon - location.lon) * 2000;
      const z = (storm.lat - location.lat) * 2000;
      const intensity = storm.intensity || 20;
      const height = Math.max(20, Math.min(150, intensity * 1.5));
      
      let color = '#00FF00';
      if (intensity >= 61) color = '#8B00FF';
      else if (intensity >= 55) color = '#FF0000';
      else if (intensity >= 46) color = '#FFA500';
      else if (intensity >= 35) color = '#FFFF00';
      
      return {
        id: `canvas-storm-${index}`,
        x: Math.max(-400, Math.min(400, x)),
        y: 0,
        z: Math.max(-400, Math.min(400, z)),
        intensity,
        distance: storm.distance || 0,
        direction: storm.direction || 'N',
        color,
        height
      };
    });

  // 3D projection functions
  const project3D = (x: number, y: number, z: number, canvas: HTMLCanvasElement) => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const fov = 600;
    
    // Apply rotation
    const cosX = Math.cos(rotation.x * Math.PI / 180);
    const sinX = Math.sin(rotation.x * Math.PI / 180);
    const cosY = Math.cos(rotation.y * Math.PI / 180);
    const sinY = Math.sin(rotation.y * Math.PI / 180);
    
    // Rotate around Y axis
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    
    // Rotate around X axis
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    
    // Project to 2D
    const distance = z2 + 800;
    const scale = (fov / distance) * zoom;
    
    return {
      x: centerX + x1 * scale,
      y: centerY - y1 * scale,
      scale: scale,
      distance: distance
    };
  };

  // Drawing functions
  const drawGround = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const gridSize = 50;
    const gridCount = 20;
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    for (let i = -gridCount; i <= gridCount; i++) {
      for (let j = -gridCount; j <= gridCount; j++) {
        const x1 = i * gridSize;
        const z1 = j * gridSize;
        const x2 = (i + 1) * gridSize;
        const z2 = j * gridSize;
        
        const p1 = project3D(x1, 0, z1, canvas);
        const p2 = project3D(x2, 0, z2, canvas);
        
        if (p1.distance > 0 && p2.distance > 0) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }
  };

  const drawStormColumn = (ctx: CanvasRenderingContext2D, storm: CanvasStorm, canvas: HTMLCanvasElement) => {
    const base = project3D(storm.x, 0, storm.z, canvas);
    const top = project3D(storm.x, storm.height, storm.z, canvas);
    
    if (base.distance > 0 && top.distance > 0) {
      const gradient = ctx.createLinearGradient(base.x, base.y, top.x, top.y);
      gradient.addColorStop(0, storm.color);
      gradient.addColorStop(1, storm.color + '80');
      
      ctx.fillStyle = gradient;
      ctx.strokeStyle = storm.color;
      ctx.lineWidth = 2;
      
      // Draw column as rectangle
      const width = Math.max(2, base.scale * 8);
      ctx.fillRect(base.x - width/2, top.y, width, base.y - top.y);
      ctx.strokeRect(base.x - width/2, top.y, width, base.y - top.y);
      
      // Add glow effect for intense storms
      if (storm.intensity >= 55) {
        ctx.shadowColor = storm.color;
        ctx.shadowBlur = 10;
        ctx.fillRect(base.x - width/2, top.y, width, base.y - top.y);
        ctx.shadowBlur = 0;
      }
    }
  };

  const drawLocationMarker = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const center = project3D(0, 10, 0, canvas);
    
    if (center.distance > 0) {
      ctx.fillStyle = '#00AAFF';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      
      const radius = Math.max(3, center.scale * 5);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Draw ground grid
    drawGround(ctx, canvas);
    
    // Sort storms by distance for proper rendering order
    const sortedStorms = [...canvasStorms].sort((a, b) => {
      const distA = project3D(a.x, a.y, a.z, canvas).distance;
      const distB = project3D(b.x, b.y, b.z, canvas).distance;
      return distB - distA;
    });
    
    // Draw storms
    sortedStorms.forEach(storm => {
      drawStormColumn(ctx, storm, canvas);
    });
    
    // Draw location marker
    drawLocationMarker(ctx, canvas);
    
    // Auto-rotation
    if (isRotating) {
      setRotation(prev => ({ ...prev, y: (prev.y + 0.5) % 360 }));
    }
    
    animationRef.current = requestAnimationFrame(render);
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMouse.x;
    const deltaY = e.clientY - lastMouse.y;
    
    setRotation(prev => ({
      x: Math.max(-90, Math.min(90, prev.x + deltaY * 0.5)),
      y: (prev.y + deltaX * 0.5) % 360
    }));
    
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.3, Math.min(3, prev + e.deltaY * -0.001)));
  };

  // Initialize rendering
  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [rotation, zoom, isRotating, canvasStorms]);

  return (
    <div className="fixed inset-0 bg-black z-50">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      {/* Controls */}
      <div className="absolute top-4 left-4 space-y-2">
        <Button
          onClick={onClose}
          variant="outline"
          size="sm"
          className="bg-black/70 border-white/30 text-white hover:bg-white/20"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Menu
        </Button>
        
        <Button
          onClick={() => setIsRotating(!isRotating)}
          variant="outline"
          size="sm"
          className="bg-black/70 border-white/30 text-white hover:bg-white/20"
        >
          {isRotating ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          Auto Rotate
        </Button>
        
        <Button
          onClick={() => {
            setRotation({ x: 0, y: 0 });
            setZoom(1);
          }}
          variant="outline"
          size="sm"
          className="bg-black/70 border-white/30 text-white hover:bg-white/20"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset View
        </Button>
      </div>

      {/* Info Panel */}
      <div className="absolute top-4 right-4 bg-black/70 text-white p-4 rounded-lg">
        <h3 className="font-bold mb-2">3D Storm Canvas</h3>
        <p className="text-sm">📍 {location.name}</p>
        <p className="text-sm">⛈️ {canvasStorms.length} storms</p>
        <p className="text-xs text-gray-300 mt-2">
          Drag to rotate • Scroll to zoom
        </p>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white p-4 rounded-lg">
        <h4 className="font-bold mb-2">Storm Intensity</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500"></div>
            <span>Light</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500"></div>
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500"></div>
            <span>Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500"></div>
            <span>Very Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-500"></div>
            <span>Extreme</span>
          </div>
        </div>
      </div>
    </div>
  );
}