import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Simple3DCanvasProps {
  location: { lat: number; lon: number; city?: string; } | null;
  precipitationStorms: any[];
  onClose: () => void;
}

// 3D perspective transformation
interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Point2D {
  x: number;
  y: number;
}

// Convert dBZ to 3D height
const dbzToHeight = (dbz: number): number => {
  if (dbz >= 61) return 8;  // Extreme thunderstorms
  if (dbz >= 55) return 6;  // Very heavy rain/hail
  if (dbz >= 46) return 4;  // Heavy rain
  if (dbz >= 35) return 2;  // Moderate rain
  return 1;                 // Light rain
};

// Convert dBZ to color
const dbzToColor = (dbz: number): string => {
  if (dbz >= 61) return '#8B5CF6'; // Purple - Extreme
  if (dbz >= 55) return '#EF4444'; // Red - Very Heavy
  if (dbz >= 46) return '#F97316'; // Orange - Heavy
  if (dbz >= 35) return '#EAB308'; // Yellow - Moderate
  return '#22C55E';                // Green - Light
};

// 3D to 2D projection with better perspective
const project3D = (point: Point3D, cameraDistance: number, canvasWidth: number, canvasHeight: number): Point2D => {
  const scale = cameraDistance / (cameraDistance + point.z + 0.1); // Prevent division by zero
  return {
    x: canvasWidth / 2 + point.x * scale * 30,  // Reduced scale for better spread
    y: canvasHeight / 2 - point.y * scale * 30  // Negative for proper Y axis
  };
};

// Convert geographic coordinates to 3D world coordinates
const geoTo3D = (lat: number, lon: number, centerLat: number, centerLon: number): Point3D => {
  // Simple flat projection for local area (30-mile radius)
  const x = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180) / 1000; // km
  const z = (lat - centerLat) * 110540 / 1000; // km
  
  return {
    x: x * 0.3,  // Slightly larger scale for better spread
    y: 0,        // Ground level
    z: z * 0.3   // Normal Z orientation
  };
};

export default function Simple3DCanvas({ location, precipitationStorms, onClose }: Simple3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [rotationY, setRotationY] = useState(0); // Start straight
  const [cameraHeight, setCameraHeight] = useState(8); // High overhead view
  const [isRotating, setIsRotating] = useState(false);
  const targetRotationSpeed = useRef(0);
  const currentRotationSpeed = useRef(0);

  useEffect(() => {
    if (!canvasRef.current || !location) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const cameraDistance = 10;

    // Rotate a 3D point around Y axis
    const rotateY = (point: Point3D, angle: number): Point3D => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x: point.x * cos + point.z * sin,
        y: point.y,
        z: -point.x * sin + point.z * cos
      };
    };

    const draw = () => {
      // Clear canvas with space-like background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#000030');
      gradient.addColorStop(1, '#000010');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw 3D ground grid (only major lines)
      ctx.strokeStyle = '#333355';
      ctx.lineWidth = 1;
      const gridSize = 20;
      const gridSpacing = 4;
      
      // Major grid lines only
      for (let x = -gridSize; x <= gridSize; x += gridSpacing) {
        const start = rotateY({ x, y: 0, z: -gridSize }, rotationY);
        const end = rotateY({ x, y: 0, z: gridSize }, rotationY);
        
        const startProj = project3D({ ...start, y: start.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        const endProj = project3D({ ...end, y: end.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        
        ctx.beginPath();
        ctx.moveTo(startProj.x, startProj.y);
        ctx.lineTo(endProj.x, endProj.y);
        ctx.stroke();
      }
      
      for (let z = -gridSize; z <= gridSize; z += gridSpacing) {
        const start = rotateY({ x: -gridSize, y: 0, z }, rotationY);
        const end = rotateY({ x: gridSize, y: 0, z }, rotationY);
        
        const startProj = project3D({ ...start, y: start.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        const endProj = project3D({ ...end, y: end.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        
        ctx.beginPath();
        ctx.moveTo(startProj.x, startProj.y);
        ctx.lineTo(endProj.x, endProj.y);
        ctx.stroke();
      }

      // Draw user location marker
      const userPos = rotateY({ x: 0, y: 0, z: 0 }, rotationY);
      const userProjected = project3D({ ...userPos, y: userPos.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
      
      ctx.fillStyle = '#00FF00';
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, 6, 0, 2 * Math.PI);
      ctx.fill();

      // Draw storms as 3D columns with perspective
      const stormData = precipitationStorms.map(storm => {
        const pos3D = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
        const intensity = storm.dbz || storm.intensity || 25;
        const height = dbzToHeight(intensity);
        const color = dbzToColor(intensity);

        return { pos3D, intensity, height, color };
      });

      // Sort by z-distance for proper depth rendering
      stormData.sort((a, b) => {
        const aRotated = rotateY(a.pos3D, rotationY);
        const bRotated = rotateY(b.pos3D, rotationY);
        return bRotated.z - aRotated.z; // Draw far objects first
      });

      stormData.forEach(({ pos3D, intensity, height, color }) => {
        const rotatedPos = rotateY(pos3D, rotationY);
        
        // Base and top positions
        const base = project3D({ ...rotatedPos, y: rotatedPos.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        const top = project3D({ ...rotatedPos, y: rotatedPos.y + height - cameraHeight }, cameraDistance, canvas.width, canvas.height);

        // Calculate width based on distance for perspective
        const distance = Math.sqrt(rotatedPos.x * rotatedPos.x + rotatedPos.z * rotatedPos.z);
        const scale = cameraDistance / (cameraDistance + Math.abs(rotatedPos.z) + 1);
        const width = Math.max(2, 20 * scale);

        // Draw storm column with 3D effect
        const columnGradient = ctx.createLinearGradient(base.x - width/2, top.y, base.x + width/2, base.y);
        columnGradient.addColorStop(0, color + '60'); // Transparent top
        columnGradient.addColorStop(1, color + 'FF'); // Solid bottom

        ctx.fillStyle = columnGradient;
        ctx.fillRect(base.x - width/2, top.y, width, base.y - top.y);

        // Add storm cap
        ctx.fillStyle = color + '80';
        ctx.beginPath();
        ctx.ellipse(top.x, top.y, width/2, width/4, 0, 0, 2 * Math.PI);
        ctx.fill();

        // Waypoint dot if enabled
        if (showWaypoints) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(base.x, base.y, Math.max(2, 4 * scale), 0, 2 * Math.PI);
          ctx.fill();
        }

        // Intensity label for nearby storms
        if (distance < 8 && scale > 0.3) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `${Math.max(8, 12 * scale)}px Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(`${intensity}`, top.x, top.y - 5);
        }
      });
    };

    draw();

    // Touch and mouse rotation controls with proper direction
    const handleStart = (clientX: number, clientY: number) => {
      setIsRotating(true);
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const clickX = clientX - rect.left;
      // Right side = positive rotation (clockwise), Left side = negative rotation (counter-clockwise)
      targetRotationSpeed.current = clickX > centerX ? 0.001 : -0.001; // Much slower speed
    };

    const handleEnd = () => {
      setIsRotating(false);
      targetRotationSpeed.current = 0;
    };

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleStart(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleEnd();
    };

    // Touch events
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      handleEnd();
    };

    // Add all event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Animation loop with lerped rotation for smoothness
    const animate = () => {
      // Lerp rotation speed for smooth acceleration/deceleration
      const lerpFactor = 0.1;
      currentRotationSpeed.current += (targetRotationSpeed.current - currentRotationSpeed.current) * lerpFactor;
      
      // Apply rotation
      if (Math.abs(currentRotationSpeed.current) > 0.0001) {
        setRotationY(prev => prev + currentRotationSpeed.current);
      }
      
      draw();
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [location, precipitationStorms, showWaypoints, rotationY, cameraHeight, isRotating]);

  if (!location) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h2 className="text-xl font-semibold mb-4">3D Storm View</h2>
          <p className="text-slate-300 mb-4">Location required for 3D visualization</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            onClick={() => setShowWaypoints(!showWaypoints)}
            variant="outline"
            size="sm"
            className={`${showWaypoints ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}`}
          >
            {showWaypoints ? 'Hide Dots' : 'Show Dots'}
          </Button>
          <Button onClick={onClose} variant="outline" size="sm">
            Exit 3D
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setCameraHeight(3)}
            variant="outline"
            size="sm"
            className={`${cameraHeight <= 4 ? 'bg-green-600 border-green-500' : 'bg-slate-700 border-slate-600'}`}
          >
            Ground View
          </Button>
          <Button
            onClick={() => setCameraHeight(8)}
            variant="outline"
            size="sm"
            className={`${cameraHeight > 4 ? 'bg-green-600 border-green-500' : 'bg-slate-700 border-slate-600'}`}
          >
            Overhead View
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ cursor: 'crosshair', touchAction: 'none' }}
      />
      
      {/* Compact Legend - Top Left */}
      <div className="absolute top-4 left-4 bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
        <div className="text-xs text-slate-300 space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded" style={{ backgroundColor: '#22C55E' }}></div>
            <span>Light (20-34)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded" style={{ backgroundColor: '#EAB308' }}></div>
            <span>Moderate (35-45)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded" style={{ backgroundColor: '#F97316' }}></div>
            <span>Heavy (46-54)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded" style={{ backgroundColor: '#EF4444' }}></div>
            <span>Very Heavy (55-60)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded" style={{ backgroundColor: '#8B5CF6' }}></div>
            <span>Extreme (61+)</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">Tap & hold to rotate</p>
      </div>
    </div>
  );
}