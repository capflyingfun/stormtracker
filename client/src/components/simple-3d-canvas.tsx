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

// Convert dBZ to 3D height - taller columns for better visibility
const dbzToHeight = (dbz: number): number => {
  if (dbz >= 61) return 6.0;   // Extreme thunderstorms - Very tall
  if (dbz >= 55) return 4.5;   // Very heavy rain/hail - Tall
  if (dbz >= 46) return 3.0;   // Heavy rain - Medium-tall
  if (dbz >= 35) return 1.8;   // Moderate rain - Medium
  return 1.0;                  // Light rain - Short but visible
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
  const [cameraHeight, setCameraHeight] = useState(6); // Tilted down view
  const [isRotating, setIsRotating] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(2); // 1=slow, 2=medium, 3=fast
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

    const cameraDistance = 15; // Zoomed out more for better overview

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

      // Draw North arrow compass in top right
      const compassSize = 60;
      const compassX = canvas.width - compassSize - 20;
      const compassY = compassSize + 100; // Below the centered control buttons (2 rows)
      
      // Compass background circle
      ctx.fillStyle = 'rgba(51, 51, 85, 0.3)';
      ctx.beginPath();
      ctx.arc(compassX, compassY, compassSize / 2, 0, Math.PI * 2);
      ctx.fill();
      
      // North arrow (considering current rotation)
      const northAngle = -rotationY; // Adjust for current camera rotation
      const arrowLength = compassSize / 3;
      
      // Arrow shaft
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(compassX, compassY);
      ctx.lineTo(
        compassX + Math.sin(northAngle) * arrowLength,
        compassY - Math.cos(northAngle) * arrowLength
      );
      ctx.stroke();
      
      // Arrow head
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      const headSize = 8;
      const headX = compassX + Math.sin(northAngle) * arrowLength;
      const headY = compassY - Math.cos(northAngle) * arrowLength;
      ctx.moveTo(headX, headY);
      ctx.lineTo(
        headX - Math.sin(northAngle + 0.5) * headSize,
        headY + Math.cos(northAngle + 0.5) * headSize
      );
      ctx.lineTo(
        headX - Math.sin(northAngle - 0.5) * headSize,
        headY + Math.cos(northAngle - 0.5) * headSize
      );
      ctx.closePath();
      ctx.fill();
      
      // "N" label
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', 
        compassX + Math.sin(northAngle) * (arrowLength + 15),
        compassY - Math.cos(northAngle) * (arrowLength + 15) + 5
      );

      // Draw highly visible user location marker
      const userPos = rotateY({ x: 0, y: 0, z: 0 }, rotationY);
      const userProjected = project3D({ ...userPos, y: userPos.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
      
      // Large bright marker with multiple layers for visibility
      const scale = 2.5; // Larger scale for better visibility
      
      // Bright background circle for contrast
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, 15 * scale, 0, 2 * Math.PI);
      ctx.fill();
      
      // Bright yellow/orange center
      ctx.fillStyle = '#FF6600'; // Bright orange
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, 12 * scale, 0, 2 * Math.PI);
      ctx.fill();
      
      // White center dot
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, 6 * scale, 0, 2 * Math.PI);
      ctx.fill();
      
      // Pulsing outer ring
      const pulseRadius = 18 * scale + Math.sin(Date.now() * 0.005) * 4;
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, pulseRadius, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw terrain-style polygonal storm visualization
      if (precipitationStorms.length > 0) {
        // Create a grid for terrain mesh
        const gridSize = 32; // Grid resolution
        const gridExtent = 20; // km from center - larger floor area
        const heightMap: number[][] = [];
        
        // Initialize height map
        for (let i = 0; i <= gridSize; i++) {
          heightMap[i] = [];
          for (let j = 0; j <= gridSize; j++) {
            heightMap[i][j] = 0;
          }
        }
        
        // Sample storm data into grid
        precipitationStorms.forEach(storm => {
          const pos3D = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
          const intensity = storm.dbz || storm.intensity || 25;
          const height = dbzToHeight(intensity);
          
          // Map to grid coordinates
          const gridX = Math.round(((pos3D.x / gridExtent) + 1) * gridSize / 2);
          const gridZ = Math.round(((pos3D.z / gridExtent) + 1) * gridSize / 2);
          
          if (gridX >= 0 && gridX <= gridSize && gridZ >= 0 && gridZ <= gridSize) {
            // Use maximum height at each grid point for overlapping storms
            heightMap[gridZ][gridX] = Math.max(heightMap[gridZ][gridX], height);
          }
        });
        
        // Smooth the height map for terrain effect
        for (let pass = 0; pass < 2; pass++) {
          const smoothed = heightMap.map(row => [...row]);
          for (let i = 1; i < gridSize; i++) {
            for (let j = 1; j < gridSize; j++) {
              smoothed[i][j] = (
                heightMap[i-1][j] + heightMap[i+1][j] + 
                heightMap[i][j-1] + heightMap[i][j+1] + 
                heightMap[i][j] * 4
              ) / 8;
            }
          }
          heightMap.splice(0, heightMap.length, ...smoothed);
        }
        
        // Sort grid points by z-distance for proper depth rendering
        const gridPoints: Array<{i: number, j: number, height: number, z: number}> = [];
        for (let i = 0; i < gridSize; i++) {
          for (let j = 0; j < gridSize; j++) {
            const height = heightMap[i][j];
            if (height > 0.1) {
              const x = ((j / gridSize) * 2 - 1) * gridExtent;
              const z = ((i / gridSize) * 2 - 1) * gridExtent;
              const rotatedPos = rotateY({ x, y: 0, z }, rotationY);
              gridPoints.push({ i, j, height, z: rotatedPos.z });
            }
          }
        }
        
        // Sort by z-distance (far to near)
        gridPoints.sort((a, b) => b.z - a.z);
        
        // Render terrain mesh
        gridPoints.forEach(({ i, j, height }) => {
          // Convert grid back to 3D coordinates
          const x = ((j / gridSize) * 2 - 1) * gridExtent;
          const z = ((i / gridSize) * 2 - 1) * gridExtent;
          
          const pos3D = { x, y: 0, z };
          const rotatedPos = rotateY(pos3D, rotationY);
          
          // Project to screen
          const base = project3D({ ...rotatedPos, y: rotatedPos.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
          const top = project3D({ ...rotatedPos, y: rotatedPos.y + height - cameraHeight }, cameraDistance, canvas.width, canvas.height);
          
          // Calculate scale and make columns truly square with no gaps
          const scale = cameraDistance / (cameraDistance + Math.abs(rotatedPos.z) + 1);
          const squareSize = Math.max(10, 55 * scale); // Much larger to eliminate all gaps
          
          // Determine color based on height
          const color = height >= 3.5 ? '#8B5CF6' : // Purple - Extreme
                       height >= 2.5 ? '#EF4444' : // Red - Very Heavy
                       height >= 1.5 ? '#F97316' : // Orange - Heavy
                       height >= 0.8 ? '#EAB308' : // Yellow - Moderate
                       '#22C55E';                   // Green - Light
          
          // Draw solid square terrain columns with exact square dimensions
          const terrainGradient = ctx.createLinearGradient(base.x - squareSize/2, top.y, base.x + squareSize/2, base.y);
          terrainGradient.addColorStop(0, color + 'DD'); // More opaque top
          terrainGradient.addColorStop(1, color + 'FF'); // Fully solid bottom
          
          ctx.fillStyle = terrainGradient;
          // Draw perfect square - width and height are the same
          ctx.fillRect(base.x - squareSize/2, top.y, squareSize, base.y - top.y);
          
          // Add top face for 3D effect
          ctx.fillStyle = color + 'EE';
          ctx.fillRect(base.x - squareSize/2, top.y - 2, squareSize, 4);
          
          // Waypoint dots for reference if enabled
          if (showWaypoints && height > 0.5) {
            ctx.fillStyle = color + 'CC';
            ctx.beginPath();
            ctx.arc(base.x, base.y, Math.max(2, 4 * scale), 0, 2 * Math.PI);
            ctx.fill();
          }
        });
      }
    };

    draw();

    // Touch and mouse rotation controls with proper direction
    const handleStart = (clientX: number, clientY: number) => {
      setIsRotating(true);
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const clickX = clientX - rect.left;
      // Fix direction: Right side = negative rotation (clockwise), Left side = positive rotation (counter-clockwise)
      const baseSpeed = 0.0005 * rotationSpeed; // Adjustable manual rotation speed
      targetRotationSpeed.current = clickX > centerX ? -baseSpeed : baseSpeed;
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
      // Manual rotation - Lerp rotation speed for smooth acceleration/deceleration
      const lerpFactor = 0.1;
      currentRotationSpeed.current += (targetRotationSpeed.current - currentRotationSpeed.current) * lerpFactor;
      
      // Apply manual rotation
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
  }, [location, precipitationStorms, showWaypoints, rotationY, cameraHeight, isRotating, rotationSpeed]);

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
      {/* Top Controls - Two Rows */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex flex-col gap-2 items-center">
        <div className="flex gap-2">
          <Button onClick={onClose} variant="outline" size="sm">
            Exit 3D
          </Button>
          <Button
            onClick={() => setShowWaypoints(!showWaypoints)}
            variant="outline"
            size="sm"
            className={`${showWaypoints ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}`}
          >
            {showWaypoints ? 'Hide Dots' : 'Show Dots'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setRotationY(0)}
            variant="outline"
            size="sm"
            className="bg-green-600 border-green-500"
          >
            📍 North
          </Button>
          <Button
            onClick={() => setRotationSpeed(prev => prev === 3 ? 1 : prev + 1)}
            variant="outline"
            size="sm"
            className="bg-purple-600 border-purple-500"
          >
            Speed {rotationSpeed}x
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ cursor: 'crosshair', touchAction: 'none' }}
      />
      
      {/* Compact Legend - Top Left, Lower Position */}
      <div className="absolute top-20 left-4 bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50">
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