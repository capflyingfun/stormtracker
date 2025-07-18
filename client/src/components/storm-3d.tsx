import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Box, Sphere, Plane } from '@react-three/drei';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Vector3, Color } from 'three';
import { Button } from '@/components/ui/button';

interface Storm3DProps {
  location: { lat: number; lon: number; city?: string; } | null;
  precipitationStorms: any[];
  onClose: () => void;
}

// Convert dBZ to height (in 3D units, representing hundreds of feet)
const dbzToHeight = (dbz: number): number => {
  if (dbz >= 61) return 15; // Extreme thunderstorms - 15,000+ feet
  if (dbz >= 55) return 12; // Very heavy rain/hail - 12,000 feet
  if (dbz >= 46) return 8;  // Heavy rain - 8,000 feet
  if (dbz >= 35) return 5;  // Moderate rain - 5,000 feet
  return 2;                 // Light rain - 2,000 feet
};

// Convert dBZ to color (matching main radar colors)
const dbzToColor = (dbz: number): string => {
  if (dbz >= 61) return '#8B5CF6'; // Purple - Extreme
  if (dbz >= 55) return '#EF4444'; // Red - Very Heavy
  if (dbz >= 46) return '#F97316'; // Orange - Heavy
  if (dbz >= 35) return '#EAB308'; // Yellow - Moderate
  return '#22C55E';                // Green - Light
};

// Convert geographic coordinates to 3D world coordinates
const geoTo3D = (lat: number, lon: number, centerLat: number, centerLon: number): [number, number] => {
  // Simple flat projection for local area (30-mile radius)
  const x = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180) / 1000; // km
  const z = (lat - centerLat) * 110540 / 1000; // km
  return [x * 0.1, z * 0.1]; // Scale down for 3D scene
};

// 3D Cloud component
function Cloud({ position, height, color, intensity }: { 
  position: [number, number, number]; 
  height: number; 
  color: string; 
  intensity: number;
}) {
  const meshRef = useRef<any>();

  // Animate cloud pulsing based on intensity
  useEffect(() => {
    if (meshRef.current) {
      const interval = setInterval(() => {
        const scale = 1 + Math.sin(Date.now() * 0.003) * 0.1;
        meshRef.current.scale.set(scale, scale, scale);
      }, 50);
      return () => clearInterval(interval);
    }
  }, []);

  return (
    <group position={position}>
      {/* Cloud base */}
      <Sphere ref={meshRef} args={[0.5, 8, 6]} position={[0, height / 2, 0]}>
        <meshStandardMaterial color={color} transparent opacity={0.7} />
      </Sphere>
      {/* Rain effect for higher intensities */}
      {intensity >= 35 && (
        <Box args={[0.1, height, 0.1]} position={[0, height / 2, 0]}>
          <meshStandardMaterial color={color} transparent opacity={0.3} />
        </Box>
      )}
      {/* Lightning effect for extreme storms */}
      {intensity >= 55 && (
        <Box args={[0.05, height * 1.5, 0.05]} position={[0, height * 0.75, 0]}>
          <meshStandardMaterial color="#FFFFFF" transparent opacity={0.8} />
        </Box>
      )}
    </group>
  );
}

// Sonar-style radar dots
function SonarDots({ storms, centerLat, centerLon, showWaypoints }: {
  storms: any[];
  centerLat: number;
  centerLon: number;
  showWaypoints: boolean;
}) {
  if (!showWaypoints) return null;

  return (
    <>
      {storms.map((storm, index) => {
        const [x, z] = geoTo3D(storm.lat, storm.lon, centerLat, centerLon);
        return (
          <Sphere key={index} args={[0.05]} position={[x, 0.1, z]}>
            <meshStandardMaterial color={dbzToColor(storm.dbz)} emissive={dbzToColor(storm.dbz)} emissiveIntensity={0.3} />
          </Sphere>
        );
      })}
    </>
  );
}

// Ground plane with location-based background
function GroundPlane({ location }: { location: { lat: number; lon: number; city?: string; } | null }) {
  // Generate a simple gradient based on location for now
  const backgroundColor = useMemo(() => {
    if (!location) return '#1a1a1a';
    // Simple hash of coordinates to generate consistent color
    const hash = Math.abs(Math.sin(location.lat * location.lon)) * 16777215;
    return `#${Math.floor(hash).toString(16).padStart(6, '0').substring(0, 6)}`;
  }, [location]);

  return (
    <Plane args={[50, 50]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <meshStandardMaterial color={backgroundColor} transparent opacity={0.3} />
    </Plane>
  );
}

export default function Storm3D({ location, precipitationStorms, onClose }: Storm3DProps) {
  const [showWaypoints, setShowWaypoints] = useState(true);

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
          <h2 className="text-xl font-semibold text-white">3D Storm Visualization</h2>
          <p className="text-sm text-slate-300">{location.city || `${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`}</p>
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

      {/* 3D Scene */}
      <Canvas camera={{ position: [0, 10, 15], fov: 60 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        
        {/* Ground plane */}
        <GroundPlane location={location} />
        
        {/* 3D Clouds */}
        {precipitationStorms.map((storm, index) => {
          const [x, z] = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
          const height = dbzToHeight(storm.dbz);
          const color = dbzToColor(storm.dbz);
          
          return (
            <Cloud
              key={index}
              position={[x, 0, z]}
              height={height}
              color={color}
              intensity={storm.dbz}
            />
          );
        })}
        
        {/* Sonar dots */}
        <SonarDots 
          storms={precipitationStorms} 
          centerLat={location.lat} 
          centerLon={location.lon}
          showWaypoints={showWaypoints}
        />
        
        {/* Location marker */}
        <Sphere args={[0.2]} position={[0, 0.2, 0]}>
          <meshStandardMaterial color="#00FF00" emissive="#00FF00" emissiveIntensity={0.5} />
        </Sphere>
        
        {/* User location text */}
        <Text
          position={[0, 1, 0]}
          fontSize={0.5}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          Your Location
        </Text>
        
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
      </Canvas>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700">
        <h3 className="text-sm font-semibold text-white mb-2">Storm Heights & Colors</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22C55E' }}></div>
            <span className="text-slate-300">Light Rain (20-34 dBZ) - 2,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EAB308' }}></div>
            <span className="text-slate-300">Moderate Rain (35-45 dBZ) - 5,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#F97316' }}></div>
            <span className="text-slate-300">Heavy Rain (46-54 dBZ) - 8,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EF4444' }}></div>
            <span className="text-slate-300">Very Heavy/Hail (55-60 dBZ) - 12,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#8B5CF6' }}></div>
            <span className="text-slate-300">Extreme (61+ dBZ) - 15,000+ ft</span>
          </div>
        </div>
      </div>
    </div>
  );
}