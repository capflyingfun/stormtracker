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
  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#2a4a2a" transparent opacity={0.8} />
      </mesh>
      
      {/* Grid overlay */}
      <gridHelper args={[2000, 40, '#444444', '#222222']} position={[0, -0.5, 0]} />
      
      {/* Center marker */}
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[2]} />
        <meshStandardMaterial color="#00AAFF" emissive="#0066AA" />
      </mesh>
      
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
      try {
        // Gentle pulsing animation
        const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.1 + 1;
        meshRef.current.scale.y = pulse;
        
        // Rotate very slowly
        meshRef.current.rotation.y += 0.01;
      } catch (error) {
        console.error('[3D Storm Column] Animation error:', error);
      }
    }
  });
  
  if (!storm || typeof storm.intensity !== 'number') {
    console.error('[3D Storm Column] Invalid storm data:', storm);
    return null;
  }
  
  const height = getStormHeight(storm.intensity);
  const color = getStormColor(storm.intensity);
  
  return (
    <group position={[storm.x || 0, height / 2, storm.z || 0]}>
      {/* Main storm column */}
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[8, height, 8]} />
        <meshStandardMaterial 
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.8}
        />
      </mesh>
      
      {/* Storm info when hovered */}
      {hovered && (
        <Text
          position={[0, height + 5, 0]}
          fontSize={2}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
        >
          {`${storm.intensity} dBZ\n${storm.distance?.toFixed(1) || '0.0'} mi ${storm.direction || 'N'}`}
        </Text>
      )}
      
      {/* Particle effects for severe storms */}
      {storm.intensity >= 55 && (
        <mesh position={[0, height + 5, 0]}>
          <sphereGeometry args={[12]} />
          <meshStandardMaterial 
            color="#FFFFFF"
            transparent
            opacity={0.1}
          />
        </mesh>
      )}
    </group>
  );
}

// Rain effect component
function RainEffect({ storms }: { storms: GameStorm[] }) {
  const particlesRef = useRef<THREE.Points>(null);
  
  useEffect(() => {
    if (!particlesRef.current || !storms || storms.length === 0) return;
    
    try {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(storms.length * 200 * 3); // 200 raindrops per storm
      
      storms.forEach((storm, stormIndex) => {
        if (!storm || typeof storm.x !== 'number' || typeof storm.z !== 'number') return;
        
        for (let i = 0; i < 200; i++) {
          const index = (stormIndex * 200 + i) * 3;
          positions[index] = storm.x + (Math.random() - 0.5) * 20;
          positions[index + 1] = Math.random() * 30 + 10;
          positions[index + 2] = storm.z + (Math.random() - 0.5) * 20;
        }
      });
      
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particlesRef.current.geometry = geometry;
    } catch (error) {
      console.error('[3D Rain Effect] Error creating rain particles:', error);
    }
  }, [storms]);
  
  useFrame(() => {
    if (!particlesRef.current?.geometry?.attributes?.position) return;
    
    try {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] -= 0.5; // Rain falls down
        
        if (positions[i + 1] < 0) {
          positions[i + 1] = 30; // Reset to top
        }
      }
      
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    } catch (error) {
      console.error('[3D Rain Effect] Error updating rain particles:', error);
    }
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
  
  console.log('[3D Game Environment] Starting with:', {
    location,
    precipitationStorms: precipitationStorms?.length || 0,
    hasLocation: !!location,
    hasLat: location?.lat !== undefined,
    hasLon: location?.lon !== undefined
  });
  
  // Validate inputs
  if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') {
    console.error('[3D Game Environment] Invalid location data:', location);
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">3D Environment Error</h2>
          <p className="mb-4">Invalid location data provided</p>
          <Button onClick={onClose} variant="outline">
            Back to Menu
          </Button>
        </div>
      </div>
    );
  }
  
  // Convert precipitation storms to game storms with proper validation
  const gameStorms: GameStorm[] = (precipitationStorms || [])
    .filter(storm => storm && typeof storm.lat === 'number' && typeof storm.lon === 'number')
    .slice(0, 50)
    .map((storm, index) => {
      try {
        const coords = convertToSceneCoords(storm.lat, storm.lon, location.lat, location.lon);
        return {
          id: `storm-${index}`,
          lat: storm.lat,
          lon: storm.lon,
          intensity: storm.intensity || 20,
          distance: storm.distance || 0,
          direction: storm.direction || 'N',
          x: coords.x,
          z: coords.z,
        };
      } catch (error) {
        console.error('[3D Game Environment] Error converting storm:', storm, error);
        return null;
      }
    })
    .filter(Boolean) as GameStorm[];
  
  console.log('[3D Game Environment] Processed storms:', gameStorms.length);
  
  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [100, 50, 100], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          console.log('[3D Canvas] Created successfully');
          gl.setSize(window.innerWidth, window.innerHeight);
        }}
        onError={(error) => {
          console.error('[3D Canvas] Error:', error);
        }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 10, 5]} intensity={0.7} />
        <pointLight position={[0, 20, 0]} intensity={0.5} color="#87CEEB" />
        
        <Terrain centerLat={location.lat} centerLon={location.lon} />
        
        {gameStorms.map((storm) => (
          <StormColumn key={storm.id} storm={storm} />
        ))}
        
        {showRain && gameStorms.length > 0 && <RainEffect storms={gameStorms} />}
        
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