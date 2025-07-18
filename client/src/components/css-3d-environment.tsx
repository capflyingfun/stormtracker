import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Location {
  lat: number;
  lon: number;
  name: string;
}

interface PrecipitationStorm {
  lat: number;
  lon: number;
  dbz: number;
  id: string;
  count?: number;
}

interface CSS3DEnvironmentProps {
  location: Location;
  precipitationStorms: PrecipitationStorm[];
  onClose: () => void;
}

// Convert lat/lon to 3D coordinates with user at center
function latLonTo3D(lat: number, lon: number, userLat: number, userLon: number, scale: number = 200) {
  const latDiff = (lat - userLat) * scale;
  const lonDiff = (lon - userLon) * scale;
  
  return {
    x: lonDiff * 111, // Approximate km per degree longitude
    z: latDiff * 111, // Approximate km per degree latitude
    y: 0
  };
}

// Get storm color based on dBZ value
function getStormColor(dbz: number): string {
  if (dbz >= 61) return '#8B5CF6'; // Purple - Extreme
  if (dbz >= 55) return '#EF4444'; // Red - Very Heavy
  if (dbz >= 46) return '#F97316'; // Orange - Heavy
  if (dbz >= 35) return '#EAB308'; // Yellow - Moderate
  return '#22C55E'; // Green - Light
}

// Get storm height based on dBZ intensity (in pixels)
function getStormHeight(dbz: number): number {
  if (dbz >= 61) return 150; // 150px tall
  if (dbz >= 55) return 120; // 120px tall
  if (dbz >= 46) return 80;  // 80px tall
  if (dbz >= 35) return 50;  // 50px tall
  return 30; // 30px tall
}

// Individual storm column component
function StormColumn({ storm, userLocation }: { storm: PrecipitationStorm; userLocation: Location }) {
  const pos3D = latLonTo3D(storm.lat, storm.lon, userLocation.lat, userLocation.lon);
  const height = getStormHeight(storm.dbz);
  const color = getStormColor(storm.dbz);
  const baseSize = Math.max(10, storm.dbz / 3); // Size based on intensity

  return (
    <div
      className="absolute flex flex-col items-center pointer-events-none"
      style={{
        transform: `translate3d(${pos3D.x}px, ${-height}px, ${pos3D.z}px)`,
        transformOrigin: 'bottom center'
      }}
    >
      {/* Storm column */}
      <div
        className="rounded-t-lg opacity-80 shadow-lg"
        style={{
          width: `${baseSize}px`,
          height: `${height}px`,
          backgroundColor: color,
          boxShadow: `0 0 20px ${color}40`,
        }}
      />
      
      {/* dBZ label */}
      <div
        className="text-white text-xs font-bold mt-1 bg-black/50 px-1 rounded"
        style={{ fontSize: '10px' }}
      >
        {storm.dbz}
      </div>
      
      {/* Base ring */}
      <div
        className="absolute bottom-0 rounded-full opacity-30"
        style={{
          width: `${baseSize * 1.5}px`,
          height: `${baseSize * 1.5}px`,
          backgroundColor: color,
          transform: 'translateY(50%)'
        }}
      />
    </div>
  );
}

export default function CSS3DEnvironment({ location, precipitationStorms, onClose }: CSS3DEnvironmentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [rotationX, setRotationX] = useState(-20); // Slight downward angle
  const [rotationY, setRotationY] = useState(0);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouseX, setLastMouseX] = useState(0);
  const [lastMouseY, setLastMouseY] = useState(0);

  // Mouse and touch controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      setLastMouseX(e.clientX);
      setLastMouseY(e.clientY);
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - lastMouseX;
      const deltaY = e.clientY - lastMouseY;
      
      setRotationY(prev => prev + deltaX * 0.5);
      setRotationX(prev => Math.max(-60, Math.min(10, prev - deltaY * 0.5)));
      
      setLastMouseX(e.clientX);
      setLastMouseY(e.clientY);
      e.preventDefault();
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      e.preventDefault();
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale(prev => Math.max(0.2, Math.min(3, prev - e.deltaY * 0.001)));
    };

    // Touch controls
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        setIsDragging(true);
        setLastMouseX(e.touches[0].clientX);
        setLastMouseY(e.touches[0].clientY);
      }
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      
      const deltaX = e.touches[0].clientX - lastMouseX;
      const deltaY = e.touches[0].clientY - lastMouseY;
      
      setRotationY(prev => prev + deltaX * 0.5);
      setRotationX(prev => Math.max(-60, Math.min(10, prev - deltaY * 0.5)));
      
      setLastMouseX(e.touches[0].clientX);
      setLastMouseY(e.touches[0].clientY);
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      setIsDragging(false);
      e.preventDefault();
    };

    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, lastMouseX, lastMouseY]);

  // Update scene transform
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.style.transform = `
        perspective(1000px) 
        rotateX(${rotationX}deg) 
        rotateY(${rotationY}deg) 
        scale3d(${scale}, ${scale}, ${scale})
        translateZ(0)
      `;
    }
  }, [rotationX, rotationY, scale]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900 z-50 overflow-hidden">
      {/* Controls */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-2">
        <Button onClick={onClose} variant="outline" size="sm">
          Exit 3D
        </Button>
        <Button
          onClick={() => setShowWaypoints(!showWaypoints)}
          variant="outline"
          size="sm"
          className={`${showWaypoints ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}`}
        >
          {showWaypoints ? 'Hide Storms' : 'Show Storms'}
        </Button>
        <Button
          onClick={() => {
            setRotationX(-20);
            setRotationY(0);
            setScale(1);
          }}
          variant="outline"
          size="sm"
        >
          Reset View
        </Button>
      </div>

      {/* Legend */}
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
        <p className="text-xs text-slate-500 mt-2">Drag to rotate • Scroll to zoom</p>
      </div>

      {/* 3D Scene Container */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ 
          perspective: '1000px',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <div
          ref={sceneRef}
          className="relative"
          style={{
            transformStyle: 'preserve-3d',
            transform: `
              perspective(1000px) 
              rotateX(${rotationX}deg) 
              rotateY(${rotationY}deg) 
              scale3d(${scale}, ${scale}, ${scale})
              translateZ(0)
            `
          }}
        >
          {/* Ground plane */}
          <div
            className="absolute bg-green-900/20 border border-green-700/30"
            style={{
              width: '800px',
              height: '800px',
              transform: 'rotateX(90deg) translateZ(-1px)',
              left: '-400px',
              top: '-400px',
              background: `
                linear-gradient(45deg, transparent 24%, rgba(34, 197, 94, 0.1) 25%, rgba(34, 197, 94, 0.1) 26%, transparent 27%, transparent 74%, rgba(34, 197, 94, 0.1) 75%, rgba(34, 197, 94, 0.1) 76%, transparent 77%), 
                linear-gradient(45deg, transparent 24%, rgba(34, 197, 94, 0.1) 25%, rgba(34, 197, 94, 0.1) 26%, transparent 27%, transparent 74%, rgba(34, 197, 94, 0.1) 75%, rgba(34, 197, 94, 0.1) 76%, transparent 77%)
              `,
              backgroundSize: '50px 50px',
              backgroundPosition: '0 0, 25px 25px'
            }}
          />

          {/* User position marker */}
          <div
            className="absolute flex flex-col items-center"
            style={{
              transform: 'translate3d(-15px, -60px, -15px)'
            }}
          >
            <div className="w-8 h-8 bg-green-500 rounded-full shadow-lg animate-pulse" />
            <div className="text-green-400 text-xs font-bold mt-1 bg-black/50 px-2 py-1 rounded">
              YOU
            </div>
          </div>

          {/* North compass */}
          <div
            className="absolute flex flex-col items-center"
            style={{
              transform: 'translate3d(-10px, -200px, -300px)'
            }}
          >
            <div className="w-4 h-12 bg-red-500 rounded-t-full" />
            <div className="text-red-400 text-sm font-bold mt-1 bg-black/50 px-2 py-1 rounded">
              N
            </div>
          </div>

          {/* Storm columns */}
          {showWaypoints && precipitationStorms.map((storm) => (
            <StormColumn
              key={storm.id}
              storm={storm}
              userLocation={location}
            />
          ))}
        </div>
      </div>
    </div>
  );
}