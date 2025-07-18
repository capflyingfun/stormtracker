import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Simple3DCanvasProps {
  location: { lat: number; lon: number; city?: string; } | null;
  precipitationStorms: any[];
  onClose: () => void;
}

// Convert dBZ to height (in pixels)
const dbzToHeight = (dbz: number): number => {
  if (dbz >= 61) return 200; // Extreme thunderstorms
  if (dbz >= 55) return 160; // Very heavy rain/hail
  if (dbz >= 46) return 120; // Heavy rain
  if (dbz >= 35) return 80;  // Moderate rain
  return 40;                 // Light rain
};

// Convert dBZ to color
const dbzToColor = (dbz: number): string => {
  if (dbz >= 61) return '#8B5CF6'; // Purple - Extreme
  if (dbz >= 55) return '#EF4444'; // Red - Very Heavy
  if (dbz >= 46) return '#F97316'; // Orange - Heavy
  if (dbz >= 35) return '#EAB308'; // Yellow - Moderate
  return '#22C55E';                // Green - Light
};

// Convert geographic coordinates to 2D canvas coordinates
const geoToCanvas = (lat: number, lon: number, centerLat: number, centerLon: number, canvasWidth: number, canvasHeight: number): [number, number] => {
  // Simple flat projection for local area (30-mile radius)
  const x = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180) / 1000; // km
  const z = (lat - centerLat) * 110540 / 1000; // km
  
  // Scale to canvas and center
  const canvasX = canvasWidth / 2 + (x * 5); // Scale factor of 5
  const canvasZ = canvasHeight / 2 - (z * 5); // Invert Z for screen coordinates
  
  return [canvasX, canvasZ];
};

export default function Simple3DCanvas({ location, precipitationStorms, onClose }: Simple3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!canvasRef.current || !location) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const draw = () => {
      // Clear canvas
      ctx.fillStyle = '#000011';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw ground grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      // Draw user location
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      ctx.fillStyle = '#00FF00';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
      ctx.fill();

      // Draw location text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Your Location', centerX, centerY - 20);
      ctx.fillText(location.city || `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`, centerX, centerY + 30);

      // Draw storms as 3D-like cylinders
      precipitationStorms.forEach((storm, index) => {
        const [x, z] = geoToCanvas(storm.lat, storm.lon, location.lat, location.lon, canvas.width, canvas.height);
        const intensity = storm.dbz || storm.intensity || 25;
        const height = dbzToHeight(intensity);
        const color = dbzToColor(intensity);

        // Skip storms outside canvas
        if (x < 0 || x > canvas.width || z < 0 || z > canvas.height) return;

        // Draw 3D-like storm column
        const baseY = canvas.height - 50; // Ground level
        const topY = baseY - height;

        // Storm cylinder (simplified 3D effect)
        const gradient = ctx.createLinearGradient(x - 15, topY, x + 15, baseY);
        gradient.addColorStop(0, color + '80'); // Semi-transparent top
        gradient.addColorStop(1, color + 'FF'); // Solid bottom

        ctx.fillStyle = gradient;
        ctx.fillRect(x - 10, topY, 20, height);

        // Storm intensity label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${intensity}dBZ`, x, topY - 5);

        // Waypoint dot if enabled
        if (showWaypoints) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, z, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      });

      // Draw horizon line
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 50);
      ctx.lineTo(canvas.width, canvas.height - 50);
      ctx.stroke();
    };

    draw();

    // Animation loop for rotation effect
    const animate = () => {
      setRotation(prev => (prev + 0.5) % 360);
      draw();
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [location, precipitationStorms, showWaypoints, rotation]);

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
      {/* Header Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
          <h2 className="text-xl font-semibold text-white">3D Storm Visualization (Canvas)</h2>
          <p className="text-sm text-slate-300">{location.city || `${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`}</p>
          <p className="text-xs text-slate-400">{precipitationStorms.length} storms detected</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={() => setShowWaypoints(!showWaypoints)}
            variant="outline"
            className={`${showWaypoints ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}`}
          >
            {showWaypoints ? 'Hide Waypoints' : 'Show Waypoints'}
          </Button>
          <Button onClick={onClose} variant="outline">
            Exit 3D
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: 'crosshair' }}
      />
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700">
        <h3 className="text-sm font-semibold text-white mb-2">Storm Heights & Colors</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22C55E' }}></div>
            <span className="text-slate-300">Light Rain (20-34 dBZ) - 40px height</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EAB308' }}></div>
            <span className="text-slate-300">Moderate Rain (35-45 dBZ) - 80px height</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#F97316' }}></div>
            <span className="text-slate-300">Heavy Rain (46-54 dBZ) - 120px height</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EF4444' }}></div>
            <span className="text-slate-300">Very Heavy/Hail (55-60 dBZ) - 160px height</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#8B5CF6' }}></div>
            <span className="text-slate-300">Extreme (61+ dBZ) - 200px height</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">Canvas-based 3D visualization</p>
      </div>
    </div>
  );
}