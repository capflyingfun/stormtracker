import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Box, Cylinder } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Vector3, Color } from 'three';
import * as THREE from 'three';

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

interface True3DEnvironmentProps {
  location: Location;
  precipitationStorms: PrecipitationStorm[];
  onClose: () => void;
}

// Convert lat/lon to 3D coordinates with user at center
function latLonTo3D(lat: number, lon: number, userLat: number, userLon: number, scale: number = 0.1) {
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

// Get storm height based on dBZ intensity
function getStormHeight(dbz: number): number {
  // Height in 3D units (roughly corresponding to thousands of feet)
  if (dbz >= 61) return 15; // 15,000+ feet
  if (dbz >= 55) return 12; // 12,000 feet
  if (dbz >= 46) return 8;  // 8,000 feet
  if (dbz >= 35) return 5;  // 5,000 feet
  return 3; // 3,000 feet
}

// Individual storm column component
function StormColumn({ position, dbz, id }: { position: Vector3; dbz: number; id: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  const height = getStormHeight(dbz);
  const color = getStormColor(dbz);
  const radius = Math.max(0.5, dbz / 100); // Size based on intensity
  
  useFrame((state) => {
    if (meshRef.current && hovered) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group position={position}>
      {/* Storm column */}
      <Cylinder
        ref={meshRef}
        args={[radius, radius * 0.8, height, 8]}
        position={[0, height / 2, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshLambertMaterial color={color} transparent opacity={0.8} />
      </Cylinder>
      
      {/* dBZ label */}
      <Text
        position={[0, height + 1, 0]}
        fontSize={0.8}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {dbz}
      </Text>
      
      {/* Base ring */}
      <Cylinder
        args={[radius * 1.2, radius * 1.2, 0.1, 12]}
        position={[0, 0.05, 0]}
      >
        <meshLambertMaterial color={color} transparent opacity={0.3} />
      </Cylinder>
    </group>
  );
}

// Ground plane component
function GroundPlane({ userPosition }: { userPosition: Vector3 }) {
  return (
    <group>
      {/* Main ground plane */}
      <Box args={[200, 0.1, 200]} position={[0, -0.1, 0]}>
        <meshLambertMaterial color="#1a1a2e" />
      </Box>
      
      {/* Grid lines */}
      {Array.from({ length: 21 }, (_, i) => (
        <group key={`grid-${i}`}>
          <Box args={[200, 0.01, 0.1]} position={[0, 0, (i - 10) * 10]}>
            <meshLambertMaterial color="#333366" transparent opacity={0.3} />
          </Box>
          <Box args={[0.1, 0.01, 200]} position={[(i - 10) * 10, 0, 0]}>
            <meshLambertMaterial color="#333366" transparent opacity={0.3} />
          </Box>
        </group>
      ))}
      
      {/* User position marker */}
      <Cylinder args={[1, 0.5, 0.5, 8]} position={userPosition}>
        <meshLambertMaterial color="#00ff00" />
      </Cylinder>
      
      {/* User label */}
      <Text
        position={[userPosition.x, userPosition.y + 2, userPosition.z]}
        fontSize={1}
        color="#00ff00"
        anchorX="center"
        anchorY="middle"
      >
        YOU
      </Text>
    </group>
  );
}

// Compass component
function Compass() {
  return (
    <group position={[0, 20, 0]}>
      {/* North arrow */}
      <Cylinder args={[0.2, 0.1, 2, 6]} position={[0, 0, -8]} rotation={[Math.PI / 2, 0, 0]}>
        <meshLambertMaterial color="#ff0000" />
      </Cylinder>
      <Text
        position={[0, 0, -10]}
        fontSize={1.5}
        color="#ff0000"
        anchorX="center"
        anchorY="middle"
      >
        N
      </Text>
    </group>
  );
}

// Main 3D scene component
function Scene({ location, precipitationStorms, showWaypoints }: { 
  location: Location; 
  precipitationStorms: PrecipitationStorm[];
  showWaypoints: boolean;
}) {
  const userPosition = new Vector3(0, 0, 0); // User at center

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <pointLight position={[0, 20, 0]} intensity={0.5} />

      {/* Ground and grid */}
      <GroundPlane userPosition={userPosition} />
      
      {/* Compass */}
      <Compass />
      
      {/* Storm columns */}
      {showWaypoints && precipitationStorms.map((storm) => {
        const pos3D = latLonTo3D(storm.lat, storm.lon, location.lat, location.lon);
        const position = new Vector3(pos3D.x, pos3D.y, pos3D.z);
        
        return (
          <StormColumn
            key={storm.id}
            position={position}
            dbz={storm.dbz}
            id={storm.id}
          />
        );
      })}
      
      {/* Controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={10}
        maxDistance={100}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
}

export default function True3DEnvironment({ location, precipitationStorms, onClose }: True3DEnvironmentProps) {
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(1);

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Controls */}
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
            {showWaypoints ? 'Hide Storms' : 'Show Storms'}
          </Button>
        </div>
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
        <p className="text-xs text-slate-500 mt-2">Drag to orbit • Scroll to zoom</p>
      </div>

      {/* 3D Canvas */}
      <Canvas
        camera={{ 
          position: [15, 15, 15], 
          fov: 60,
          near: 0.1,
          far: 1000
        }}
        style={{ background: 'linear-gradient(to bottom, #000428, #004e92)' }}
      >
        <Scene 
          location={location} 
          precipitationStorms={precipitationStorms}
          showWaypoints={showWaypoints}
        />
      </Canvas>
    </div>
  );
}