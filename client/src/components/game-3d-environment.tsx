import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, Html } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';

interface Game3DProps {
  location: { lat: number; lon: number; city?: string; } | null;
  precipitationStorms: any[];
  setViewMode: (mode: 'map' | 'sonar' | '3d') => void;
}

// Convert dBZ to height
const dbzToHeight = (dbz: number): number => {
  if (dbz >= 61) return 15;
  if (dbz >= 55) return 12;
  if (dbz >= 46) return 8;
  if (dbz >= 35) return 5;
  return 2;
};

// Convert dBZ to color
const dbzToColor = (dbz: number): string => {
  if (dbz >= 61) return '#8B5CF6';
  if (dbz >= 55) return '#EF4444';
  if (dbz >= 46) return '#F97316';
  if (dbz >= 35) return '#EAB308';
  return '#22C55E';
};

// Convert geographic coordinates to 3D world coordinates
const geoTo3D = (lat: number, lon: number, centerLat: number, centerLon: number): [number, number] => {
  const x = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180) / 1000;
  const z = (lat - centerLat) * 110540 / 1000;
  return [x * 0.1, z * 0.1];
};

// Volumetric cloud renderer
function CloudVolume({ position, height, color }: { position: [number, number, number]; height: number; color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.0005;
      meshRef.current.rotation.z += 0.0003;
    }
  });

  return (
    <group position={position}>
      {/* Main cloud cylinder */}
      <mesh ref={meshRef} position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.6, height, 16]} />
        <meshPhongMaterial 
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Secondary cloud sphere for volumetric effect */}
      <mesh position={[0.3, height * 0.7, 0.2]} castShadow>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshPhongMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Tertiary cloud sphere */}
      <mesh position={[-0.3, height * 0.5, -0.3]} castShadow>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshPhongMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Ground indicator */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.1, 8]} />
        <meshPhongMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

// Main environment scene
function GameEnvironment({ location, precipitationStorms }: { location: { lat: number; lon: number; city?: string; }; precipitationStorms: any[] }) {
  const controlsRef = useRef<any>(null);

  // Fixed 11,000 ft altitude
  const cameraHeight = 11;

  return (
    <>
      <Sky sunPosition={[100, 20, 100]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[100, 50, 100]} intensity={1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <pointLight position={[0, 30, 0]} intensity={0.5} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#1a3a1a" roughness={0.9} />
      </mesh>

      {/* Center marker */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 8]} />
        <meshPhongMaterial color="#00FF00" emissive="#00FF00" emissiveIntensity={0.7} />
      </mesh>

      {/* Storm clouds */}
      {precipitationStorms.map((storm, index) => {
        const [x, z] = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
        const height = dbzToHeight(storm.dbz || storm.intensity || 25);
        const color = dbzToColor(storm.dbz || storm.intensity || 25);
        return (
          <CloudVolume
            key={index}
            position={[x, 0, z]}
            height={height}
            color={color}
          />
        );
      })}

      {/* Camera controls - fixed at 11,000 ft altitude */}
      <OrbitControls
        ref={controlsRef}
        autoRotate={false}
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={30}
        maxDistance={200}
        maxPolarAngle={Math.PI}
        minPolarAngle={0}
        autoRotateSpeed={0}
      />

      {/* Fixed camera height */}
      <PerspectiveCamera cameraHeight={cameraHeight} />
    </>
  );
}

// Camera controller to lock height
function PerspectiveCamera({ cameraHeight }: { cameraHeight: number }) {
  const { camera } = useThree();

  useFrame(() => {
    // Lock camera Y position at 11,000 ft equivalent
    camera.position.y = cameraHeight;
  });

  return null;
}

// UI Overlay
function GameUI({ location, precipitationStorms, setViewMode }: { location: { lat: number; lon: number; city?: string; }; precipitationStorms: any[]; setViewMode: (mode: 'map' | 'sonar' | '3d') => void }) {
  const [showWaypoints, setShowWaypoints] = useState(true);

  return (
    <>
      {/* Top-left info panel */}
      <div className="absolute top-4 left-4 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-2">3D Storm Environment</h2>
        <p className="text-sm text-slate-300 mb-2">{location.city || `${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`}</p>
        <p className="text-xs text-slate-400">Altitude: 11,000 ft (Fixed)</p>
        <p className="text-xs text-slate-400 mt-1">Storms Detected: {precipitationStorms.length}</p>
      </div>

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          onClick={() => setShowWaypoints(!showWaypoints)}
          variant="outline"
          size="sm"
          className={`${showWaypoints ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}`}
        >
          {showWaypoints ? '👁️ Hide' : '👁️ Show'}
        </Button>
        <Button
          onClick={() => setViewMode('map')}
          variant="outline"
          size="sm"
          className="bg-slate-700 border-slate-600"
        >
          Exit 3D
        </Button>
      </div>

      {/* Bottom-left legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700">
        <h3 className="text-sm font-semibold text-white mb-2">Storm Intensity Colors</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22C55E' }}></div>
            <span className="text-slate-300">Light (20-34 dBZ) - 2,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EAB308' }}></div>
            <span className="text-slate-300">Moderate (35-45 dBZ) - 5,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#F97316' }}></div>
            <span className="text-slate-300">Heavy (46-54 dBZ) - 8,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EF4444' }}></div>
            <span className="text-slate-300">Very Heavy (55-60 dBZ) - 12,000 ft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#8B5CF6' }}></div>
            <span className="text-slate-300">Extreme (61+ dBZ) - 15,000+ ft</span>
          </div>
        </div>
      </div>

      {/* Bottom-right controls help */}
      <div className="absolute bottom-4 right-4 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700 text-xs text-slate-300">
        <div className="font-semibold mb-2">Controls:</div>
        <div>🖱️ Drag to pan/rotate</div>
        <div>🔍 Scroll to zoom</div>
        <div>Touch: Drag with finger</div>
      </div>
    </>
  );
}

export default function Game3D({ location, precipitationStorms, setViewMode }: Game3DProps) {
  if (!location) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h2 className="text-xl font-semibold mb-4">3D Environment</h2>
          <p className="text-slate-300 mb-4">Location required for 3D visualization</p>
          <Button onClick={() => setViewMode('map')}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
      <Canvas camera={{ position: [0, 11, 40], fov: 75 }}>
        <GameEnvironment location={location} precipitationStorms={precipitationStorms} />
      </Canvas>
      <GameUI location={location} precipitationStorms={precipitationStorms} setViewMode={setViewMode} />
    </div>
  );
}
