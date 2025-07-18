import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';

interface CSS3DStorm {
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

interface PureCSS3DEnvironmentProps {
  location: { lat: number; lon: number; name: string };
  precipitationStorms: any[];
  onClose: () => void;
}

export default function PureCSS3DEnvironment({ location, precipitationStorms, onClose }: PureCSS3DEnvironmentProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState({ x: -15, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Process storms with proper validation
  const css3DStorms: CSS3DStorm[] = precipitationStorms
    .filter(storm => storm && typeof storm.lat === 'number' && typeof storm.lon === 'number')
    .slice(0, 36) // Grid of storms
    .map((storm, index) => {
      // Convert lat/lon to grid coordinates
      const gridX = ((storm.lon - location.lon) * 5000) % 800;
      const gridZ = ((storm.lat - location.lat) * 5000) % 800;
      
      const intensity = storm.intensity || 20;
      const height = Math.max(20, Math.min(200, intensity * 2));
      
      let color = '#00FF00';
      if (intensity >= 61) color = '#8B00FF';
      else if (intensity >= 55) color = '#FF0000';
      else if (intensity >= 46) color = '#FFA500';
      else if (intensity >= 35) color = '#FFFF00';
      
      return {
        id: `css-storm-${index}`,
        x: Math.max(-300, Math.min(300, gridX)),
        y: height / 2,
        z: Math.max(-300, Math.min(300, gridZ)),
        intensity,
        distance: storm.distance || 0,
        direction: storm.direction || 'N',
        color,
        height
      };
    });

  // Mouse interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - mousePos.x;
    const deltaY = e.clientY - mousePos.y;
    
    setRotation(prev => ({
      x: Math.max(-90, Math.min(90, prev.x + deltaY * 0.5)),
      y: (prev.y + deltaX * 0.5) % 360
    }));
    
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.3, Math.min(3, prev + e.deltaY * -0.001)));
  };

  // Auto-rotation effect
  useEffect(() => {
    if (!isRotating) return;
    
    const interval = setInterval(() => {
      setRotation(prev => ({
        ...prev,
        y: (prev.y + 0.5) % 360
      }));
    }, 50);
    
    return () => clearInterval(interval);
  }, [isRotating]);

  console.log('[Pure CSS 3D Environment] Rendering storms:', css3DStorms.length);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-black z-50 overflow-hidden">
      {/* CSS 3D Scene */}
      <div
        ref={sceneRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{
          perspective: '1000px',
          perspectiveOrigin: '50% 50%'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="relative w-full h-full"
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale(${zoom})`,
            transformStyle: 'preserve-3d',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          {/* Ground Grid */}
          <div
            className="absolute bg-gray-800 opacity-30"
            style={{
              width: '800px',
              height: '800px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%) rotateX(90deg)',
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '50px 50px'
            }}
          />
          
          {/* Center Location Marker */}
          <div
            className="absolute bg-blue-500 rounded-full shadow-lg"
            style={{
              width: '20px',
              height: '20px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%) translateZ(10px)',
              boxShadow: '0 0 20px #00AAFF'
            }}
          />
          
          {/* Storm Columns */}
          {css3DStorms.map((storm) => (
            <div
              key={storm.id}
              className="absolute group cursor-pointer"
              style={{
                left: '50%',
                top: '50%',
                transform: `
                  translate(-50%, -50%) 
                  translate3d(${storm.x}px, ${-storm.y}px, ${storm.z}px)
                `,
                transformStyle: 'preserve-3d'
              }}
            >
              {/* Storm Column */}
              <div
                className="relative transition-all duration-300 hover:scale-110"
                style={{
                  width: '12px',
                  height: `${storm.height}px`,
                  backgroundColor: storm.color,
                  boxShadow: `
                    0 0 10px ${storm.color},
                    inset 0 0 10px rgba(255,255,255,0.2)
                  `,
                  borderRadius: '2px',
                  animation: storm.intensity >= 55 ? 'pulse 2s infinite' : 'none'
                }}
              />
              
              {/* Storm Info Tooltip */}
              <div
                className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-black/90 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
                style={{
                  transform: 'translate(-50%, 0) rotateX(-90deg) rotateY(180deg)',
                  transformStyle: 'preserve-3d'
                }}
              >
                {storm.intensity} dBZ<br />
                {storm.distance.toFixed(1)} mi {storm.direction}
              </div>
            </div>
          ))}
        </div>
      </div>

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
          }}
          variant="outline"
          size="sm"
          className="bg-black/70 border-white/30 text-white hover:bg-white/20"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset View
        </Button>
      </div>

      {/* Storm Info */}
      <div className="absolute top-4 right-4 bg-black/70 text-white p-4 rounded-lg">
        <h3 className="font-bold mb-2">CSS 3D Storm View</h3>
        <p className="text-sm">📍 {location.name}</p>
        <p className="text-sm">⛈️ {css3DStorms.length} storms</p>
        <p className="text-xs text-gray-300 mt-2">
          Drag to rotate • Scroll to zoom
        </p>
      </div>

      {/* Storm Legend */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white p-4 rounded-lg">
        <h4 className="font-bold mb-2">Storm Intensity</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Light</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span>Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Very Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-500 rounded"></div>
            <span>Extreme</span>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}