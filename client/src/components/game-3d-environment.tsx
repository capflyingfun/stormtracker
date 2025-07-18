import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Plane, Box, Sphere } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Play, Pause } from 'lucide-react';
import * as THREE from 'three';

interface GameStorm {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: string;
  x: number;
  z: number;
}

interface Game3DEnvironmentProps {
  location: { lat: number; lon: number; name: string };
  precipitationStorms: any[];
  onClose: () => void;
}

// Convert real-world coordinates to 3D scene coordinates
function convertToSceneCoords(lat: number, lon: number, centerLat: number, centerLon: number, scale = 1000) {
  const x = (lon - centerLon) * scale * Math.cos(centerLat * Math.PI / 180);
  const z = -(lat - centerLat) * scale;
  return { x, z };
}

// Get storm color based on intensity
function getStormColor(intensity: number) {
  if (intensity >= 61) return '#8B00FF'; // Purple - Extreme
  if (intensity >= 55) return '#FF0000'; // Red - Very Heavy
  if (intensity >= 46) return '#FFA500'; // Orange - Heavy  
  if (intensity >= 35) return '#FFFF00'; // Yellow - Moderate
  return '#00FF00'; // Green - Light
}

// Get storm height based on intensity
function getStormHeight(intensity: number) {
  if (intensity >= 61) return 15; // Extreme storms - very tall
  if (intensity >= 55) return 12; // Very heavy - tall
  if (intensity >= 46) return 8;  // Heavy - medium-tall
  if (intensity >= 35) return 5;  // Moderate - medium
  return 3; // Light - low
}

// Terrain component
function Terrain({ centerLat, centerLon }: { centerLat: number; centerLon: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  return (
    <group>
      {/* Ground plane */}
      <Plane 
        ref={meshRef}
        args={[2000, 2000, 100, 100]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -1, 0]}
      >
        <meshStandardMaterial 
          color="#2a4a2a" 
          wireframe={false}
          transparent={true}
          opacity={0.8}
        />
      </Plane>
      
      {/* Grid overlay */}
      <gridHelper args={[2000, 40, '#444444', '#222222']} position={[0, -0.5, 0]} />
      
      {/* Center marker */}
      <Sphere args={[2]} position={[0, 1, 0]}>
        <meshStandardMaterial color="#00AAFF" emissive="#0066AA" />
      </Sphere>
      
      {/* Location label */}
      <Text
        position={[0, 8, 0]}
        fontSize={4}
        color="#FFFFFF"
        anchorX="center"
        anchorY="middle"
      >
        Your Location
      </Text>
    </group>
  );
}

// Storm visualization component
function StormColumn({ storm }: { storm: GameStorm }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Gentle pulsing animation
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.1 + 1;
      meshRef.current.scale.y = pulse;
      
      // Rotate very slowly
      meshRef.current.rotation.y += 0.01;
    }
  });
  
  const height = getStormHeight(storm.intensity);
  const color = getStormColor(storm.intensity);
  
  return (
    <group position={[storm.x, height / 2, storm.z]}>
      {/* Main storm column */}
      <Box
        ref={meshRef}
        args={[8, height, 8]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial 
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent={true}
          opacity={0.8}
        />
      </Box>
      
      {/* Storm info when hovered */}
      {hovered && (
        <Text
          position={[0, height + 5, 0]}
          fontSize={2}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
        >
          {`${storm.intensity} dBZ\n${storm.distance.toFixed(1)} mi ${storm.direction}`}
        </Text>
      )}
      
      {/* Particle effects for severe storms */}
      {storm.intensity >= 55 && (
        <Sphere args={[12]} position={[0, height + 5, 0]}>
          <meshStandardMaterial 
            color="#FFFFFF"
            transparent={true}
            opacity={0.1}
          />
        </Sphere>
      )}
    </group>
  );
}

// Rain effect component
function RainEffect({ storms }: { storms: GameStorm[] }) {
  const particlesRef = useRef<THREE.Points>(null);
  
  useEffect(() => {
    if (!particlesRef.current) return;
    
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(storms.length * 200 * 3); // 200 raindrops per storm
    
    storms.forEach((storm, stormIndex) => {
      for (let i = 0; i < 200; i++) {
        const index = (stormIndex * 200 + i) * 3;
        positions[index] = storm.x + (Math.random() - 0.5) * 20;
        positions[index + 1] = Math.random() * 30 + 10;
        positions[index + 2] = storm.z + (Math.random() - 0.5) * 20;
      }
    });
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesRef.current.geometry = geometry;
  }, [storms]);
  
  useFrame(() => {
    if (!particlesRef.current) return;
    
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] -= 0.5; // Rain falls down
      
      if (positions[i + 1] < 0) {
        positions[i + 1] = 30; // Reset to top
      }
    }
    
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });
  
  return (
    <points ref={particlesRef}>
      <pointsMaterial size={0.2} color="#87CEEB" transparent opacity={0.6} />
    </points>
  );
}

// Camera controller
function CameraController({ autoRotate }: { autoRotate: boolean }) {
  const { camera } = useThree();
  
  useFrame(() => {
    if (autoRotate) {
      camera.position.x = Math.cos(Date.now() * 0.0005) * 200;
      camera.position.z = Math.sin(Date.now() * 0.0005) * 200;
      camera.lookAt(0, 0, 0);
    }
  });
  
  return null;
}

export default function Game3DEnvironment({ location, precipitationStorms, onClose }: Game3DEnvironmentProps) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [showRain, setShowRain] = useState(true);
  
  // Convert precipitation storms to game storms
  const gameStorms: GameStorm[] = precipitationStorms.slice(0, 50).map((storm, index) => {
    const coords = convertToSceneCoords(storm.lat, storm.lon, location.lat, location.lon);
    return {
      id: `storm-${index}`,
      lat: storm.lat,
      lon: storm.lon,
      intensity: storm.intensity,
      distance: storm.distance,
      direction: storm.direction,
      x: coords.x,
      z: coords.z,
    };
  });
  
  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [100, 50, 100], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 10, 5]} intensity={0.7} />
        <pointLight position={[0, 20, 0]} intensity={0.5} color="#87CEEB" />
        
        <Terrain centerLat={location.lat} centerLon={location.lon} />
        
        {gameStorms.map((storm) => (
          <StormColumn key={storm.id} storm={storm} />
        ))}
        
        {showRain && <RainEffect storms={gameStorms} />}
        
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={50}
          maxDistance={500}
        />
        
        <CameraController autoRotate={autoRotate} />
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
        
        <Button
          onClick={() => setShowRain(!showRain)}
          variant="outline"
          size="sm"
          className="bg-black/70 border-white/30 text-white hover:bg-white/20"
        >
          {showRain ? 'Hide Rain' : 'Show Rain'}
        </Button>
      </div>
      
      {/* Storm Info */}
      <div className="absolute top-4 right-4 bg-black/70 text-white p-4 rounded-lg">
        <h3 className="font-bold mb-2">3D Storm View</h3>
        <p className="text-sm">Location: {location.name}</p>
        <p className="text-sm">Storms: {gameStorms.length}</p>
        <p className="text-xs text-gray-300 mt-2">
          Use mouse to orbit, zoom, and explore
        </p>
      </div>
      
      {/* Storm Legend */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white p-4 rounded-lg">
        <h4 className="font-bold mb-2">Storm Intensity</h4>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500"></div>
            <span>Light (20-34 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500"></div>
            <span>Moderate (35-45 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500"></div>
            <span>Heavy (46-54 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500"></div>
            <span>Very Heavy (55-60 dBZ)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-500"></div>
            <span>Extreme (61+ dBZ)</span>
          </div>
        </div>
      </div>
    </div>
  );
}