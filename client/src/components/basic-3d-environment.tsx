import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Pause } from 'lucide-react';

interface BasicStorm {
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

interface Basic3DEnvironmentProps {
  location: { lat: number; lon: number; name: string };
  precipitationStorms: any[];
  onClose: () => void;
}

// Simple storm column component using basic geometries
function BasicStormColumn({ storm }: { storm: BasicStorm }) {
  const meshRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Simple rotation animation
      meshRef.current.rotation.y += 0.01;
      // Gentle scaling
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.scale.setScalar(scale);
    }
  });
  
  return (
    <mesh
      ref={meshRef}
      position={[storm.x, storm.height / 2, storm.z]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[6, storm.height, 6]} />
      <meshStandardMaterial 
        color={storm.color}
        emissive={storm.color}
        emissiveIntensity={0.2}
        transparent
        opacity={hovered ? 1.0 : 0.8}
      />
    </mesh>
  );
}

// Simple ground plane
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial color="#1a1a1a" />
    </mesh>
  );
}

// Center location marker
function LocationMarker() {
  return (
    <mesh position={[0, 2, 0]}>
      <sphereGeometry args={[3]} />
      <meshStandardMaterial color="#00AAFF" emissive="#0066AA" />
    </mesh>
  );
}

export default function Basic3DEnvironment({ location, precipitationStorms, onClose }: Basic3DEnvironmentProps) {
  const [autoRotate, setAutoRotate] = useState(false);
  
  console.log('[Basic 3D Environment] Starting with storms:', precipitationStorms.length);
  
  // Convert storms to basic format with validation
  const basicStorms: BasicStorm[] = precipitationStorms
    .filter(storm => storm && typeof storm.lat === 'number' && typeof storm.lon === 'number')
    .slice(0, 25) // Limit to 25 storms for performance
    .map((storm, index) => {
      // Simple coordinate conversion (not geographically accurate but visually effective)
      const x = (storm.lon - location.lon) * 5000;
      const z = -(storm.lat - location.lat) * 5000;
      
      // Get storm properties
      const intensity = storm.intensity || 20;
      const height = Math.max(2, Math.min(20, intensity * 0.3));
      
      let color = '#00FF00'; // Default green
      if (intensity >= 61) color = '#8B00FF'; // Purple
      else if (intensity >= 55) color = '#FF0000'; // Red
      else if (intensity >= 46) color = '#FFA500'; // Orange
      else if (intensity >= 35) color = '#FFFF00'; // Yellow
      
      return {
        id: `basic-storm-${index}`,
        x: Math.max(-400, Math.min(400, x)), // Clamp to visible area
        y: 0,
        z: Math.max(-400, Math.min(400, z)), // Clamp to visible area
        intensity,
        distance: storm.distance || 0,
        direction: storm.direction || 'N',
        color,
        height
      };
    });
  
  console.log('[Basic 3D Environment] Processed storms:', basicStorms.length);
  
  return (
    <div className="fixed inset-0 bg-black z-50">
      <Canvas
        camera={{ position: [100, 80, 100], fov: 60 }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        
        {/* Scene elements */}
        <GroundPlane />
        <LocationMarker />
        
        {/* Storm columns */}
        {basicStorms.map((storm) => (
          <BasicStormColumn key={storm.id} storm={storm} />
        ))}
        
        {/* Camera controls */}
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
          minDistance={20}
          maxDistance={300}
        />
      </Canvas>
      
      {/* UI Controls */}
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
          onClick={() => setAutoRotate(!autoRotate)}
          variant="outline"
          size="sm"
          className="bg-black/70 border-white/30 text-white hover:bg-white/20"
        >
          {autoRotate ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          Auto Rotate
        </Button>
      </div>
      
      {/* Storm Info */}
      <div className="absolute top-4 right-4 bg-black/70 text-white p-4 rounded-lg">
        <h3 className="font-bold mb-2">3D Storm Visualization</h3>
        <p className="text-sm">📍 {location.name}</p>
        <p className="text-sm">⛈️ {basicStorms.length} storms shown</p>
        <p className="text-xs text-gray-300 mt-2">
          Mouse: orbit • Scroll: zoom
        </p>
      </div>
      
      {/* Storm Legend */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white p-4 rounded-lg">
        <h4 className="font-bold mb-2">Storm Intensity</h4>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span>Light (20-34 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span>Moderate (35-45 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span>Heavy (46-54 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span>Very Heavy (55-60 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-500 rounded"></div>
            <span>Extreme (61+ dBZ)</span>
          </div>
        </div>
      </div>
    </div>
  );
}