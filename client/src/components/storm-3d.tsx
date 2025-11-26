import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useState, useMemo } from 'react';
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
  const z = (lat - centerLat) * 110540 / 1000; // km - Positive Z is north
  return [x * 0.1, z * 0.1]; // Scale down for 3D scene
};

// 3D Storm Column Component - renders as a cylinder
function StormColumn({ position, height, color }: { 
  position: [number, number, number]; 
  height: number; 
  color: string; 
}) {
  const radius = 0.3 + height * 0.1; // Wider columns for more visible
  return (
    <mesh position={[position[0], height / 2, position[2]]}>
      <cylinderGeometry args={[radius, radius, height, 8]} />
      <meshPhongMaterial color={color} emissive={color} emissiveIntensity={0.3} transparent opacity={0.85} />
    </mesh>
  );
}

// Radar dots overlay
function RadarDots({ storms, centerLat, centerLon, showWaypoints }: {
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
        const color = dbzToColor(storm.dbz || storm.intensity || 25);
        return (
          <mesh key={index} position={[x, 0.05, z]}>
            <sphereGeometry args={[0.08]} />
            <meshBasicMaterial color={color} emissive={color} />
          </mesh>
        );
      })}
    </>
  );
}

// Enhanced ground plane
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[80, 80]} />
      <meshStandardMaterial color="#1a4a1a" roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

// User location marker
function UserMarker() {
  return (
    <mesh position={[0, 0.3, 0]}>
      <cylinderGeometry args={[0.3, 0.3, 0.6, 8]} />
      <meshPhongMaterial color="#00FF00" emissive="#00FF00" emissiveIntensity={0.5} />
    </mesh>
  );
}

// 3D Scene content
function Scene3D({ location, precipitationStorms, showWaypoints }: { 
  location: { lat: number; lon: number; city?: string; };
  precipitationStorms: any[];
  showWaypoints: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} />
      <directionalLight position={[-10, 10, -10]} intensity={0.4} />
      <pointLight position={[0, 20, 0]} intensity={0.5} />
      
      <GroundPlane />
      <UserMarker />
      
      {precipitationStorms.map((storm, index) => {
        const [x, z] = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
        const intensity = storm.dbz || storm.intensity || 25;
        const height = dbzToHeight(intensity);
        const color = dbzToColor(intensity);
        
        return (
          <StormColumn
            key={index}
            position={[x, 0, z]}
            height={height}
            color={color}
          />
        );
      })}
      
      <RadarDots 
        storms={precipitationStorms} 
        centerLat={location.lat} 
        centerLon={location.lon}
        showWaypoints={showWaypoints}
      />
      
      <OrbitControls 
        autoRotate={false}
        autoRotateSpeed={0}
        enableZoom={true}
        enablePan={true}
      />
    </>
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
        <ambientLight intensity={0.6} />
        
        {/* Ground plane */}
        <SimpleGroundPlane location={location} />
        
        {/* 3D Clouds */}
        {precipitationStorms.map((storm, index) => {
          const [x, z] = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
          const intensity = storm.dbz || storm.intensity || 25;
          const height = dbzToHeight(intensity);
          const color = dbzToColor(intensity);
          
          return (
            <SimpleCloud
              key={index}
              position={[x, 0, z]}
              height={height}
              color={color}
            />
          );
        })}
        
        {/* Sonar dots */}
        <SimpleRadarDots 
          storms={precipitationStorms} 
          centerLat={location.lat} 
          centerLon={location.lon}
          showWaypoints={showWaypoints}
        />
        
        {/* Location marker */}
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.2]} />
          <meshBasicMaterial color="#00FF00" />
        </mesh>
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