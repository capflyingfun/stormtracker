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
  const [rotation, setRotation] = useState({ x: -15, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const animationRef = useRef<number>();

  console.log('[HTML Canvas 3D] Starting with storms:', precipitationStorms.length);
  console.log('[HTML Canvas 3D] Precipitation storms:', precipitationStorms);
  console.log('[HTML Canvas 3D] Location:', location);

  // Process storms data - check both precipitationStorms and fallback to sample data
  const canvasStorms: CanvasStorm[] = precipitationStorms.length > 0 
    ? precipitationStorms
        .filter(storm => storm && typeof storm.lat === 'number' && typeof storm.lon === 'number')
        .slice(0, 50)
        .map((storm, index) => {
          const x = (storm.lon - location.lon) * 2000;
          const z = (storm.lat - location.lat) * 2000;
          const intensity = storm.intensity || storm.dbz || 20;
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
        })
    : // Create demo storms when no real data is available
      Array.from({ length: 12 }, (_, i) => {
        const angle = (i * 30) * Math.PI / 180;
        const distance = 100 + (i * 30);
        const intensity = 25 + (i * 10);
        const height = Math.max(20, Math.min(150, intensity * 1.5));
        
        let color = '#00FF00';
        if (intensity >= 61) color = '#8B00FF';
        else if (intensity >= 55) color = '#FF0000';
        else if (intensity >= 46) color = '#FFA500';
        else if (intensity >= 35) color = '#FFFF00';
        
        return {
          id: `demo-storm-${i}`,
          x: Math.cos(angle) * distance,
          y: 0,
          z: Math.sin(angle) * distance,
          intensity,
          distance: distance * 0.01,
          direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][i % 8],
          color,
          height
        };
      });

  console.log('[HTML Canvas 3D] Final canvasStorms:', canvasStorms.length, canvasStorms);

  // 3D projection functions
  const project3D = (x: number, y: number, z: number, canvas: HTMLCanvasElement) => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const fov = 400;
    
    // Apply rotation
    const cosX = Math.cos(rotation.x * Math.PI / 180);
    const sinX = Math.sin(rotation.x * Math.PI / 180);
    const cosY = Math.cos(rotation.y * Math.PI / 180);
    const sinY = Math.sin(rotation.y * Math.PI / 180);
    
    // Rotate around Y axis first
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    
    // Then rotate around X axis
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    
    // Move camera back and project to 2D
    const distance = Math.max(1, z2 + 600);
    const scale = (fov / distance) * zoom;
    
    return {
      x: centerX + x1 * scale,
      y: centerY - y1 * scale,
      scale: Math.max(0.1, scale),
      distance: distance
    };
  };

  // Drawing functions
  const drawGround = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const gridSize = 50;
    const gridCount = 16;
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Draw grid lines
    for (let i = -gridCount; i <= gridCount; i++) {
      // Horizontal lines
      const p1 = project3D(-gridCount * gridSize, 0, i * gridSize, canvas);
      const p2 = project3D(gridCount * gridSize, 0, i * gridSize, canvas);
      
      if (p1.distance > 0 && p2.distance > 0) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      
      // Vertical lines
      const p3 = project3D(i * gridSize, 0, -gridCount * gridSize, canvas);
      const p4 = project3D(i * gridSize, 0, gridCount * gridSize, canvas);
      
      if (p3.distance > 0 && p4.distance > 0) {
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }
    }
  };

  const drawStormColumn = (ctx: CanvasRenderingContext2D, storm: CanvasStorm, canvas: HTMLCanvasElement) => {
    const base = project3D(storm.x, 0, storm.z, canvas);
    const top = project3D(storm.x, storm.height, storm.z, canvas);
    
    // Draw simple rectangle for debugging
    ctx.fillStyle = storm.color;
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    
    const width = Math.max(8, base.scale * 20);
    const height = Math.max(10, Math.abs(base.y - top.y));
    
    ctx.fillRect(base.x - width/2, top.y, width, height);
    ctx.strokeRect(base.x - width/2, top.y, width, height);
    
    // Add text label for debugging
    ctx.fillStyle = '#FFF';
    ctx.font = '12px Arial';
    ctx.fillText(`${storm.intensity}`, base.x - 10, top.y - 5);
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
    if (!canvas) {
      console.log('[HTML Canvas 3D] No canvas ref');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('[HTML Canvas 3D] No canvas context');
      return;
    }
    
    // Clear canvas with proper dimensions
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Draw ground grid
    drawGround(ctx, canvas);
    
    // Sort storms by distance for proper rendering order (back to front)
    const sortedStorms = [...canvasStorms].sort((a, b) => {
      const distA = project3D(a.x, a.y, a.z, canvas).distance;
      const distB = project3D(b.x, b.y, b.z, canvas).distance;
      return distB - distA;
    });
    
    console.log('[HTML Canvas 3D] Rendering', sortedStorms.length, 'storms');
    
    // Draw storms
    sortedStorms.forEach((storm, index) => {
      if (index < 3) {
        console.log('[HTML Canvas 3D] Drawing storm', index, storm);
      }
      drawStormColumn(ctx, storm, canvas);
    });
    
    // Draw location marker
    drawLocationMarker(ctx, canvas);
    
    // Auto-rotation
    if (isRotating) {
      setRotation(prev => ({ ...prev, y: (prev.y + 0.5) % 360 }));
    }
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
    console.log('[HTML Canvas 3D] useEffect triggered');
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('[HTML Canvas 3D] No canvas in useEffect');
      return;
    }
    
    // Set proper canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      console.log('[HTML Canvas 3D] Canvas resized:', rect.width, 'x', rect.height);
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Create render loop
    const renderLoop = () => {
      render();
      animationRef.current = requestAnimationFrame(renderLoop);
    };
    
    console.log('[HTML Canvas 3D] Starting render loop');
    animationRef.current = requestAnimationFrame(renderLoop);
    
    return () => {
      console.log('[HTML Canvas 3D] Cleanup');
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Separate effect for storm data changes
  useEffect(() => {
    console.log('[HTML Canvas 3D] Storms data updated:', canvasStorms.length);
  }, [canvasStorms]);

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
            setRotation({ x: -15, y: 0 });
            setZoom(1);
            setIsRotating(false);
          }}
          variant="outline"
          size="sm"
          className="bg-black/70 border-white/30 text-white hover:bg-white/20"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset View
        </Button>
      </div>

      {/* Info Panel - moved to not overlap with controls */}
      <div className="absolute top-4 right-4 bg-black/70 text-white p-3 rounded-lg max-w-48">
        <h3 className="font-bold mb-1 text-sm">3D Storm Canvas</h3>
        <p className="text-xs">📍 {location.name}</p>
        <p className="text-xs">⛈️ {canvasStorms.length} storms</p>
        <p className="text-xs text-gray-300 mt-1">
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