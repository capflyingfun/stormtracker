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

// Convert dBZ to 3D height (taller for better visibility)
const dbzToHeight = (dbz: number): number => {
  if (dbz >= 61) return 12;  // Extreme thunderstorms
  if (dbz >= 55) return 10;  // Very heavy rain/hail
  if (dbz >= 46) return 7;   // Heavy rain
  if (dbz >= 35) return 4;   // Moderate rain
  return 2;                  // Light rain
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
  const [cameraHeight, setCameraHeight] = useState(15); // Higher overhead view for better storm visibility
  const [isRotating, setIsRotating] = useState(false);
  const [rotationSpeedMultiplier, setRotationSpeedMultiplier] = useState(2); // 1=slow, 2=normal, 3=fast
  const [isMobile, setIsMobile] = useState(false);
  const targetRotationSpeed = useRef(0);
  const currentRotationSpeed = useRef(0);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !location) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with mobile optimization
    const dpr = isMobile ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const cameraDistance = 10;

    // Project 3D point to 2D screen coordinates
    const project3D = (point: Point3D, cameraDistance: number, canvasWidth: number, canvasHeight: number): Point2D => {
      const scale = cameraDistance / (cameraDistance + point.z + 0.1);
      return {
        x: canvasWidth / 2 + point.x * scale * 30,
        y: canvasHeight / 2 - point.y * scale * 30
      };
    };

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
      const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
      gradient.addColorStop(0, '#000030');
      gradient.addColorStop(1, '#000010');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // Debug: Log storm count (reduce log frequency)
      if (Math.floor(rotationY * 10) % 10 === 0) {
        console.log(`[3D Canvas] ${precipitationStorms.length} total storms, showing top ${isMobile ? 25 : 50} by intensity/distance`);
      }
      
      if (precipitationStorms.length === 0) {
        // Show no storms message
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No storms detected', rect.width / 2, rect.height / 2);
        return;
      }

      // Draw North arrow compass in top right
      const compassSize = 60;
      const compassX = rect.width - compassSize - 20;
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

      // Draw user location marker
      const userPos = rotateY({ x: 0, y: 0, z: 0 }, rotationY);
      const userProjected = project3D({ ...userPos, y: userPos.y - cameraHeight }, cameraDistance, rect.width, rect.height);
      
      ctx.fillStyle = '#00FF00';
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, 6, 0, 2 * Math.PI);
      ctx.fill();

      // Smart storm limiting: prioritize nearby and high-intensity storms
      const maxStorms = isMobile ? 25 : 50; // Much lower limits for performance
      const stormData = precipitationStorms.map(storm => {
        const pos3D = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
        const intensity = storm.dbz || storm.intensity || 25;
        const distance = Math.sqrt(pos3D.x * pos3D.x + pos3D.z * pos3D.z);
        const height = dbzToHeight(intensity);
        const color = dbzToColor(intensity);
        return { pos3D, intensity, height, color, distance };
      });

      // Sort by priority: higher intensity and closer storms first
      stormData.sort((a, b) => {
        const aScore = a.intensity * 2 - a.distance; // Weight intensity heavily
        const bScore = b.intensity * 2 - b.distance;
        return bScore - aScore;
      });

      const visibleStorms = stormData.slice(0, maxStorms);

      // Sort by z-distance for proper depth rendering
      visibleStorms.sort((a, b) => {
        const aRotated = rotateY(a.pos3D, rotationY);
        const bRotated = rotateY(b.pos3D, rotationY);
        return bRotated.z - aRotated.z; // Draw far objects first
      });

      visibleStorms.forEach(({ pos3D, intensity, height, color, distance }) => {
        const rotatedPos = rotateY(pos3D, rotationY);
        
        // Base and top positions
        const base = project3D({ ...rotatedPos, y: rotatedPos.y - cameraHeight }, cameraDistance, rect.width, rect.height);
        const top = project3D({ ...rotatedPos, y: rotatedPos.y + height - cameraHeight }, cameraDistance, rect.width, rect.height);

        // Calculate width based on distance for perspective (wider columns)
        const scale = cameraDistance / (cameraDistance + Math.abs(rotatedPos.z) + 1);
        const width = Math.max(4, 30 * scale);
        
        // Skip rendering if too far away or too small
        if (scale < 0.1 || distance > 25) return;

        // Simplified rendering for mobile performance
        if (isMobile) {
          // Simple solid column for mobile
          ctx.fillStyle = color;
          ctx.fillRect(base.x - width/2, top.y, width, base.y - top.y);
          
          // Simple circle cap
          ctx.beginPath();
          ctx.arc(top.x, top.y, width/3, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          // Full gradient effect for desktop
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
        }

        // Waypoint dot if enabled
        if (showWaypoints) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(base.x, base.y, Math.max(2, 4 * scale), 0, 2 * Math.PI);
          ctx.fill();
        }

        // Reduced labels on mobile for performance
        const showLabel = isMobile ? (scale > 0.4 && distance < 5) : (scale > 0.1);
        if (showLabel) {
          ctx.fillStyle = '#FFFFFF';
          if (!isMobile) {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
          }
          ctx.font = `${Math.max(10, 14 * scale)}px Arial`;
          ctx.textAlign = 'center';
          const labelText = isMobile ? `${intensity}` : `${intensity} dBZ`;
          if (!isMobile) ctx.strokeText(labelText, top.x, top.y - 8);
          ctx.fillText(labelText, top.x, top.y - 8);
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
      // Fix direction: Right side = negative rotation (clockwise), Left side = positive rotation (counter-clockwise)
      const baseSpeed = 0.001 * rotationSpeedMultiplier;
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

    // Optimized animation loop
    let frameCount = 0;
    const animate = () => {
      frameCount++;
      
      // Lerp rotation speed for smooth acceleration/deceleration
      const lerpFactor = isMobile ? 0.15 : 0.1; // Faster response on mobile
      currentRotationSpeed.current += (targetRotationSpeed.current - currentRotationSpeed.current) * lerpFactor;
      
      // Apply rotation
      if (Math.abs(currentRotationSpeed.current) > 0.0001) {
        setRotationY(prev => prev + currentRotationSpeed.current);
      }
      
      // Reduce render frequency on mobile when not rotating
      const shouldRender = !isMobile || isRotating || frameCount % 2 === 0;
      if (shouldRender) {
        draw();
      }
      
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
  }, [location, precipitationStorms, showWaypoints, rotationY, cameraHeight, isRotating, rotationSpeedMultiplier, isMobile]);

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
            onClick={() => setCameraHeight(3)}
            variant="outline"
            size="sm"
            className={`${cameraHeight <= 4 ? 'bg-green-600 border-green-500' : 'bg-slate-700 border-slate-600'}`}
          >
            Ground
          </Button>
          <Button
            onClick={() => setCameraHeight(8)}
            variant="outline"
            size="sm"
            className={`${cameraHeight > 4 ? 'bg-green-600 border-green-500' : 'bg-slate-700 border-slate-600'}`}
          >
            Overhead
          </Button>
          <Button
            onClick={() => setRotationSpeedMultiplier(prev => prev === 3 ? 1 : prev + 1)}
            variant="outline"
            size="sm"
            className="bg-purple-600 border-purple-500"
          >
            Speed {rotationSpeedMultiplier}x
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