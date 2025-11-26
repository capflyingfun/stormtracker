import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Simple3DCanvasProps {
  location: { lat: number; lon: number; city?: string; } | null;
  precipitationStorms: any[];
  setViewMode: (mode: 'map' | 'sonar' | '3d') => void;
}

// 3D perspective transformation
interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Point2D {
  x: number;
  y: number;
}

// Convert dBZ to 3D height - taller columns for better visibility
const dbzToHeight = (dbz: number): number => {
  if (dbz >= 61) return 6.0;   // Extreme thunderstorms - Very tall
  if (dbz >= 55) return 4.5;   // Very heavy rain/hail - Tall
  if (dbz >= 46) return 3.0;   // Heavy rain - Medium-tall
  if (dbz >= 35) return 1.8;   // Moderate rain - Medium
  return 1.0;                  // Light rain - Short but visible
};

// Convert dBZ to color
const dbzToColor = (dbz: number): string => {
  if (dbz >= 61) return '#8B5CF6'; // Purple - Extreme
  if (dbz >= 55) return '#EF4444'; // Red - Very Heavy
  if (dbz >= 46) return '#F97316'; // Orange - Heavy
  if (dbz >= 35) return '#EAB308'; // Yellow - Moderate
  return '#22C55E';                // Green - Light
};

// Convert dBZ to transparency level based on intensity
const dbzToTransparency = (dbz: number): string => {
  if (dbz >= 61) return 'FF';      // Purple - 100% opaque
  if (dbz >= 55) return 'CC';      // Red - 80% opaque
  if (dbz >= 46) return '99';      // Orange - 60% opaque
  if (dbz >= 35) return '66';      // Yellow - 40% opaque
  return '33';                     // Green - 20% opaque
};

// Convert rotation angle to compass heading (direction you're looking toward)
const getCompassHeading = (rotationY: number): { degrees: number; direction: string } => {
  // Convert radians to degrees and normalize to 0-360
  // Negative rotation to match standard compass behavior
  let degrees = ((-rotationY * 180 / Math.PI) % 360 + 360) % 360;
  
  // Round to nearest degree
  degrees = Math.round(degrees);
  
  // Get cardinal direction
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  const direction = directions[index];
  
  return { degrees, direction };
};

// 3D to 2D projection with wider field of view
const project3D = (point: Point3D, cameraDistance: number, canvasWidth: number, canvasHeight: number): Point2D => {
  const scale = cameraDistance / (cameraDistance + point.z + 0.1); // Prevent division by zero
  return {
    x: canvasWidth / 2 + point.x * scale * 30,  // Normal field of view
    y: canvasHeight / 2 - point.y * scale * 30  // Standard projection
  };
};

// Convert geographic coordinates to 3D world coordinates
const geoTo3D = (lat: number, lon: number, centerLat: number, centerLon: number): Point3D => {
  // Simple flat projection for local area (30-mile radius)
  const x = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180) / 1000; // km
  const z = (lat - centerLat) * 110540 / 1000; // km - Positive Z is north
  
  return {
    x: x * 0.3,  // Slightly larger scale for better spread
    y: 0,        // Ground level
    z: z * 0.3   // Correct Z orientation matching sonar view
  };
};

// Storm info for popup
interface StormInfo {
  lat: number;
  lon: number;
  dbz: number;
  distance: number;
  bearing: number;
  direction: string;
  category: string;
  speed?: number;
  movementDir?: string;
}

export default function Simple3DCanvas({ location, precipitationStorms, setViewMode }: Simple3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showWaypoints, setShowWaypoints] = useState(false);
  const rotationRef = useRef(0); // Use ref for animation - no re-renders
  const [displayRotation, setDisplayRotation] = useState(0); // Only for UI display
  const cameraHeight = 8;
  const [selectedStorm, setSelectedStorm] = useState<StormInfo | null>(null);
  const stormPositionsRef = useRef<{screenX: number; screenY: number; radius: number; storm: any}[]>([]);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(2);
  const targetRotationSpeed = useRef(0);
  const currentRotationSpeed = useRef(0);
  const lastUIUpdate = useRef(0);
  const starPositionsRef = useRef<{x: number; y: number; size: number; speed: number}[]>([]);

  // Keyboard controls for PC - only rotation, height is locked
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'a':
        case 'arrowleft':
          e.preventDefault();
          rotationRef.current += 0.1; // Rotate left - use ref, no re-render
          break;
        case 'd':
        case 'arrowright':
          e.preventDefault();
          rotationRef.current -= 0.1; // Rotate right - use ref, no re-render
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Removed storm calculation functions - not needed without storm selection

  useEffect(() => {
    if (!canvasRef.current || !location) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const cameraDistance = 20; // Balanced view distance

    // Rotate a 3D point around Y axis
    const rotateY = (point: Point3D, angle: number): Point3D => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x: point.x * cos + point.z * sin,
        y: point.y,
        z: -point.x * sin + point.z * cos
      };
    };

    // Initialize cached star positions once
    if (starPositionsRef.current.length === 0) {
      for (let i = 0; i < 50; i++) { // Reduced from 80 to 50 stars
        const seed1 = Math.sin(i * 127.1) * 43758.5453;
        const seed2 = Math.sin(i * 269.5) * 43758.5453;
        starPositionsRef.current.push({
          x: (seed1 - Math.floor(seed1)) * canvas.width,
          y: (seed2 - Math.floor(seed2)) * canvas.height * 0.5,
          size: 0.5 + (i % 3) * 0.4,
          speed: 1 + (i % 4) * 0.3
        });
      }
    }

    const draw = () => {
      const currentRotation = rotationRef.current;
      
      // Clear canvas with simple background (no gradient per frame)
      ctx.fillStyle = '#000020';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Cached stars with simple twinkle
      const time = Date.now() * 0.001;
      starPositionsRef.current.forEach((star, i) => {
        const twinkle = 0.4 + Math.sin(time * star.speed + i) * 0.4;
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw North arrow compass in top right - aligned with heading display
      const compassSize = 60;
      const compassX = canvas.width - compassSize - 20;
      const compassY = compassSize + 55;
      
      // Compass background circle
      ctx.fillStyle = 'rgba(51, 51, 85, 0.3)';
      ctx.beginPath();
      ctx.arc(compassX, compassY, compassSize / 2, 0, Math.PI * 2);
      ctx.fill();
      
      // North arrow (rotates to always point North)
      const northAngle = currentRotation;
      const arrowLength = compassSize / 3;
      
      // Arrow shaft
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(compassX, compassY);
      ctx.lineTo(
        compassX + Math.sin(northAngle) * arrowLength,
        compassY - Math.cos(northAngle) * arrowLength
      );
      ctx.stroke();
      
      // Arrow head
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      const headSize = 8;
      const headX = compassX + Math.sin(northAngle) * arrowLength;
      const headY = compassY - Math.cos(northAngle) * arrowLength;
      ctx.moveTo(headX, headY);
      ctx.lineTo(
        headX - Math.sin(northAngle + 0.5) * headSize,
        headY + Math.cos(northAngle + 0.5) * headSize
      );
      ctx.lineTo(
        headX - Math.sin(northAngle - 0.5) * headSize,
        headY + Math.cos(northAngle - 0.5) * headSize
      );
      ctx.closePath();
      ctx.fill();
      
      // "N" label
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', 
        compassX + Math.sin(northAngle) * (arrowLength + 15),
        compassY - Math.cos(northAngle) * (arrowLength + 15) + 5
      );

      // Draw circular radar-style grid floor (like sonar view)
      const maxRadius = 50; // 50 miles
      const ringDistances = [13, 25, 38, 50]; // Match sonar view distances
      const numRadialLines = 12; // 12 radial lines (every 30 degrees)
      const scaleFactor = 0.35; // Larger scale for better visibility
      
      // Draw concentric range circles with distance labels
      ringDistances.forEach((radius) => {
        const numSegments = 48; // Smooth circle
        ctx.beginPath();
        
        for (let i = 0; i <= numSegments; i++) {
          const angle = (i / numSegments) * Math.PI * 2;
          const worldX = Math.cos(angle) * radius * scaleFactor;
          const worldZ = Math.sin(angle) * radius * scaleFactor;
          
          const point3D = rotateY({ x: worldX, y: 0, z: worldZ }, currentRotation);
          const projected = project3D({ ...point3D, y: point3D.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
          
          if (i === 0) {
            ctx.moveTo(projected.x, projected.y);
          } else {
            ctx.lineTo(projected.x, projected.y);
          }
        }
        
        // Outer ring is brighter
        const isMajor = radius === 50 || radius === 25;
        ctx.strokeStyle = isMajor ? 'rgba(0, 200, 180, 0.5)' : 'rgba(0, 180, 160, 0.3)';
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.stroke();
        
        // Add distance label on the east side of each ring
        const labelAngle = Math.PI / 2; // East direction
        const labelX = Math.cos(labelAngle) * radius * scaleFactor;
        const labelZ = Math.sin(labelAngle) * radius * scaleFactor;
        const label3D = rotateY({ x: labelX, y: 0.2, z: labelZ }, currentRotation);
        const labelProj = project3D({ ...label3D, y: label3D.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(0, 220, 200, 0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(`${radius}mi`, labelProj.x, labelProj.y);
      });
      
      // Draw radial lines from center outward
      for (let i = 0; i < numRadialLines; i++) {
        const angle = (i / numRadialLines) * Math.PI * 2;
        const endX = Math.cos(angle) * maxRadius * scaleFactor;
        const endZ = Math.sin(angle) * maxRadius * scaleFactor;
        
        const start3D = rotateY({ x: 0, y: 0, z: 0 }, currentRotation);
        const end3D = rotateY({ x: endX, y: 0, z: endZ }, currentRotation);
        
        const startProj = project3D({ ...start3D, y: start3D.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        const endProj = project3D({ ...end3D, y: end3D.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        
        // Cardinal directions are brighter
        const isCardinal = i % 3 === 0;
        ctx.strokeStyle = isCardinal ? 'rgba(0, 200, 180, 0.4)' : 'rgba(0, 180, 160, 0.2)';
        ctx.lineWidth = isCardinal ? 1.2 : 0.6;
        
        ctx.beginPath();
        ctx.moveTo(startProj.x, startProj.y);
        ctx.lineTo(endProj.x, endProj.y);
        ctx.stroke();
      }
      
      // Animated radar sweep line (like sonar)
      const sweepTime = Date.now() * 0.0005; // Sweep speed
      const sweepAngle = (sweepTime % (Math.PI * 2)); // Current sweep angle
      const sweepEndX = Math.cos(sweepAngle) * maxRadius * scaleFactor;
      const sweepEndZ = Math.sin(sweepAngle) * maxRadius * scaleFactor;
      
      const sweepStart3D = rotateY({ x: 0, y: 0.02, z: 0 }, currentRotation);
      const sweepEnd3D = rotateY({ x: sweepEndX, y: 0.02, z: sweepEndZ }, currentRotation);
      
      const sweepStartProj = project3D({ ...sweepStart3D, y: sweepStart3D.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
      const sweepEndProj = project3D({ ...sweepEnd3D, y: sweepEnd3D.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
      
      // Draw sweep line with glow effect
      ctx.strokeStyle = 'rgba(0, 255, 200, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sweepStartProj.x, sweepStartProj.y);
      ctx.lineTo(sweepEndProj.x, sweepEndProj.y);
      ctx.stroke();
      
      // Sweep glow/trail effect (reduced from 8 to 4 trails for performance)
      for (let trail = 1; trail <= 4; trail++) {
        const trailAngle = sweepAngle - (trail * 0.12);
        const trailEndX = Math.cos(trailAngle) * maxRadius * scaleFactor;
        const trailEndZ = Math.sin(trailAngle) * maxRadius * scaleFactor;
        const trailEnd3D = rotateY({ x: trailEndX, y: 0.02, z: trailEndZ }, currentRotation);
        const trailEndProj = project3D({ ...trailEnd3D, y: trailEnd3D.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
        
        ctx.strokeStyle = `rgba(0, 255, 200, ${0.25 - trail * 0.05})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sweepStartProj.x, sweepStartProj.y);
        ctx.lineTo(trailEndProj.x, trailEndProj.y);
        ctx.stroke();
      }

      // Draw user location marker (simplified for performance)
      const userPos = rotateY({ x: 0, y: 0, z: 0 }, currentRotation);
      const userProjected = project3D({ ...userPos, y: userPos.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
      
      // Simple 2-layer marker
      ctx.fillStyle = '#FF6600';
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, 20, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(userProjected.x, userProjected.y, 10, 0, 2 * Math.PI);
      ctx.fill();

      // Draw terrain-style polygonal storm visualization
      const clickableStorms: {screenX: number; screenY: number; radius: number; storm: any}[] = [];
      
      if (precipitationStorms.length > 0) {
        // Draw simple circular storm columns directly from precipitation data
        const stormData = precipitationStorms.map(storm => {
          const pos3D = geoTo3D(storm.lat, storm.lon, location.lat, location.lon);
          const intensity = storm.dbz || storm.intensity || 25;
          const height = dbzToHeight(intensity);
          const color = dbzToColor(intensity);
          const rotatedPos = rotateY(pos3D, currentRotation);
          const windsPrediction = storm.windsPrediction;
          
          // Calculate distance from user (in miles)
          const dLat = storm.lat - location.lat;
          const dLon = storm.lon - location.lon;
          const distMiles = Math.sqrt(
            Math.pow(dLat * 69, 2) + Math.pow(dLon * 69 * Math.cos(location.lat * Math.PI / 180), 2)
          );
          
          // Calculate approach probability based on storm movement direction
          let approachPct = 0;
          if (windsPrediction?.direction && windsPrediction?.speed) {
            // Direction storm is moving (in radians)
            const movementDir = windsPrediction.direction * Math.PI / 180;
            // Direction from storm TO user
            const toUserAngle = Math.atan2(-dLon, -dLat);
            // Difference between movement direction and direction to user
            let angleDiff = Math.abs(movementDir - toUserAngle);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            // If storm is moving toward user (within 60 degrees), calculate probability
            if (angleDiff < Math.PI / 3) { // Within 60 degrees
              approachPct = Math.round((1 - angleDiff / (Math.PI / 3)) * 100);
              // Boost probability if very close
              if (distMiles < 10) approachPct = Math.min(100, approachPct + 20);
            } else if (angleDiff < Math.PI / 2) { // Within 90 degrees
              approachPct = Math.round((1 - angleDiff / (Math.PI / 2)) * 50);
            }
          }
          
          // Get category for grouping
          let category = 'light';
          if (intensity >= 61) category = 'extreme';
          else if (intensity >= 55) category = 'vheavy';
          else if (intensity >= 46) category = 'heavy';
          else if (intensity >= 35) category = 'moderate';

          return { pos3D, intensity, height, color, rotatedPos, windsPrediction, originalStorm: storm, distMiles, approachPct, category };
        });
        
        // Find closest storm of each category
        const closestByCategory: Record<string, typeof stormData[0] | null> = {
          light: null, moderate: null, heavy: null, vheavy: null, extreme: null
        };
        stormData.forEach(storm => {
          const current = closestByCategory[storm.category];
          if (!current || storm.distMiles < current.distMiles) {
            closestByCategory[storm.category] = storm;
          }
        });
        // Create a Set of closest storm references for quick lookup
        const closestStorms = new Set(Object.values(closestByCategory).filter(s => s !== null));

        // Sort by z-distance for proper depth rendering
        stormData.sort((a, b) => b.rotatedPos.z - a.rotatedPos.z);

        stormData.forEach((stormItem) => {
          const { pos3D, intensity, height, color, rotatedPos, windsPrediction, originalStorm, distMiles, approachPct } = stormItem;
          const isClosestOfCategory = closestStorms.has(stormItem);
          
          // Project to screen - simple columns from ground up
          const base = project3D({ ...rotatedPos, y: rotatedPos.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
          const top = project3D({ ...rotatedPos, y: rotatedPos.y + height - cameraHeight }, cameraDistance, canvas.width, canvas.height);

          // Calculate scale for perspective
          const scale = cameraDistance / (cameraDistance + Math.abs(rotatedPos.z) + 1);
          const radius = Math.max(8, 35 * scale); // Circular column radius - increased for better visibility

          // Draw storm column with intensity-based transparency
          const transparency = dbzToTransparency(intensity);
          const columnGradient = ctx.createLinearGradient(base.x - radius, top.y, base.x + radius, base.y);
          columnGradient.addColorStop(0, color + transparency); // Top uses intensity transparency
          columnGradient.addColorStop(1, color + transparency); // Bottom uses same transparency for consistency

          ctx.fillStyle = columnGradient;
          ctx.fillRect(base.x - radius, top.y, radius * 2, base.y - top.y);
          
          // Simple cloud top - just a single ellipse (much faster than multiple gradient circles)
          const cloudRadius = radius * 0.9;
          ctx.fillStyle = color + 'DD';
          ctx.beginPath();
          ctx.ellipse(base.x, top.y, cloudRadius, cloudRadius * 0.5, 0, 0, 2 * Math.PI);
          ctx.fill();
          
          // Light highlight on top
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.ellipse(base.x - cloudRadius * 0.2, top.y - cloudRadius * 0.1, cloudRadius * 0.4, cloudRadius * 0.2, 0, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw distance/approach label for closest storm of each category
          if (isClosestOfCategory) {
            const labelY = top.y - 15; // Above the storm
            const labelText = `${distMiles.toFixed(1)}mi / ${approachPct}%`;
            
            // Background pill for readability
            ctx.font = 'bold 10px sans-serif';
            const textWidth = ctx.measureText(labelText).width;
            const padding = 4;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.beginPath();
            ctx.roundRect(base.x - textWidth / 2 - padding, labelY - 8, textWidth + padding * 2, 14, 4);
            ctx.fill();
            
            // Border matching storm color
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Text
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, base.x, labelY);
          }

          // Animated rain effect - rain streaks falling from storm (reduced for performance)
          const numRainDrops = Math.min(6, Math.floor(intensity / 12)); // Fewer rain drops
          const time = Date.now() * 0.003;
          
          for (let r = 0; r < numRainDrops; r++) {
            // Create pseudo-random but consistent positions for each drop
            const seed = r * 137.5 + intensity;
            const xOffset = (Math.sin(seed) * 0.8) * radius;
            const dropSpeed = 0.5 + (r % 3) * 0.2; // Varying speeds
            
            // Animate drop position (loops from top to bottom)
            const dropProgress = ((time * dropSpeed + seed) % 1);
            const dropY = top.y + (base.y - top.y) * dropProgress;
            
            // Rain streak
            const streakLength = Math.min(15, (base.y - top.y) * 0.1);
            ctx.strokeStyle = `rgba(150, 200, 255, ${0.4 - dropProgress * 0.3})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(base.x + xOffset, dropY);
            ctx.lineTo(base.x + xOffset, dropY + streakLength);
            ctx.stroke();
          }
          
          // Lightning flash effect for severe storms (55+ dBZ)
          if (intensity >= 55) {
            const lightningTime = Date.now() * 0.001;
            // Random flash trigger - roughly every 2-4 seconds per storm
            const flashSeed = Math.floor(lightningTime + intensity) % 100;
            const isFlashing = flashSeed < 3; // 3% chance per frame = occasional flashes
            
            if (isFlashing) {
              // Bright white flash overlay on the storm column
              ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.fillRect(base.x - radius, top.y, radius * 2, base.y - top.y);
              
              // Lightning bolt from cloud
              const boltX = base.x + (Math.sin(flashSeed * 73) * radius * 0.6);
              ctx.strokeStyle = 'rgba(255, 255, 200, 0.9)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(boltX, top.y);
              // Zigzag pattern
              const segments = 4;
              for (let s = 1; s <= segments; s++) {
                const segY = top.y + ((base.y - top.y) * s / segments);
                const zigzag = (s % 2 === 0 ? 1 : -1) * (5 + Math.sin(s * flashSeed) * 8);
                ctx.lineTo(boltX + zigzag, segY);
              }
              ctx.stroke();
            }
          }

          // Storm track cone and movement arrow on ground
          // Calculate in WORLD SPACE first, then rotate with everything else
          if (windsPrediction?.direction && windsPrediction?.speed) {
            const movementDir = windsPrediction.direction * Math.PI / 180;
            const speedMph = windsPrediction.speed || 15;
            
            // Calculate projected positions at 10, 20, 30 minutes
            const timeIntervals = [10, 20, 30]; // minutes
            const coneWidth = 0.02;
            
            timeIntervals.forEach((minutes, idx) => {
              const distance = (speedMph / 60) * minutes; // miles
              const distanceScale = distance * scaleFactor;
              
              // Calculate future position in WORLD SPACE (unrotated)
              const futureWorldX = pos3D.x + Math.sin(movementDir) * distanceScale;
              const futureWorldZ = pos3D.z + Math.cos(movementDir) * distanceScale;
              
              // NOW rotate to screen space
              const futureRotated = rotateY({ x: futureWorldX, y: 0.05, z: futureWorldZ }, currentRotation);
              const futurePos = project3D({ ...futureRotated, y: futureRotated.y - cameraHeight }, cameraDistance, canvas.width, canvas.height);
              
              // Draw time marker circle
              const markerRadius = 3 + idx;
              ctx.fillStyle = `${color}${['66', '44', '33'][idx]}`;
              ctx.beginPath();
              ctx.arc(futurePos.x, futurePos.y, markerRadius, 0, 2 * Math.PI);
              ctx.fill();
              
              // Time label (10m, 20m, 30m)
              ctx.font = '8px monospace';
              ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
              ctx.textAlign = 'center';
              ctx.fillText(`${minutes}m`, futurePos.x, futurePos.y - markerRadius - 3);
            });
            
            // Draw cone outline connecting the markers
            const conePoints: Point2D[] = [];
            const startProj = project3D({ x: rotatedPos.x, y: 0.05 - cameraHeight, z: rotatedPos.z }, cameraDistance, canvas.width, canvas.height);
            
            // Left edge of cone - calculate in world space, then rotate
            for (let i = 0; i <= 2; i++) {
              const minutes = timeIntervals[i];
              const distance = (speedMph / 60) * minutes * scaleFactor;
              const spread = distance * coneWidth * 3;
              const perpAngle = movementDir + Math.PI / 2;
              // World space position
              const worldX = pos3D.x + Math.sin(movementDir) * distance + Math.sin(perpAngle) * spread;
              const worldZ = pos3D.z + Math.cos(movementDir) * distance + Math.cos(perpAngle) * spread;
              // Rotate to view space
              const rotated = rotateY({ x: worldX, y: 0.05, z: worldZ }, currentRotation);
              conePoints.push(project3D({ ...rotated, y: rotated.y - cameraHeight }, cameraDistance, canvas.width, canvas.height));
            }
            // Right edge of cone (reverse)
            for (let i = 2; i >= 0; i--) {
              const minutes = timeIntervals[i];
              const distance = (speedMph / 60) * minutes * scaleFactor;
              const spread = distance * coneWidth * 3;
              const perpAngle = movementDir - Math.PI / 2;
              // World space position
              const worldX = pos3D.x + Math.sin(movementDir) * distance + Math.sin(perpAngle) * spread;
              const worldZ = pos3D.z + Math.cos(movementDir) * distance + Math.cos(perpAngle) * spread;
              // Rotate to view space
              const rotated = rotateY({ x: worldX, y: 0.05, z: worldZ }, currentRotation);
              conePoints.push(project3D({ ...rotated, y: rotated.y - cameraHeight }, cameraDistance, canvas.width, canvas.height));
            }
            
            // Draw filled cone
            ctx.fillStyle = `${color}22`;
            ctx.beginPath();
            ctx.moveTo(startProj.x, startProj.y);
            conePoints.forEach((p) => ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.fill();
            
            // Draw cone outline
            ctx.strokeStyle = `${color}66`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          // Store position for click detection
          clickableStorms.push({
            screenX: base.x,
            screenY: (top.y + base.y) / 2, // Center of column
            radius: radius + 10, // Slightly larger hit area
            storm: originalStorm
          });

          // Waypoint dots on TOP of columns if enabled
          if (showWaypoints) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(top.x, top.y, Math.max(3, 5 * scale), 0, 2 * Math.PI);
            ctx.fill();
          }
        });
      }
      
      // Store storm positions for click handling
      stormPositionsRef.current = clickableStorms;
    };

    draw();

    // Touch and mouse rotation controls with proper direction
    const handleStart = (clientX: number, clientY: number) => {
      setIsRotating(true);
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const clickX = clientX - rect.left;
      // Fix direction: Right side = negative rotation (clockwise), Left side = positive rotation (counter-clockwise)
      const baseSpeed = 0.0005 * rotationSpeed; // Adjustable manual rotation speed
      targetRotationSpeed.current = clickX > centerX ? -baseSpeed : baseSpeed;
    };

    const handleEnd = () => {
      setIsRotating(false);
      targetRotationSpeed.current = 0;
    };

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleStart(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleEnd();
    };

    // Touch events
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      handleEnd();
    };

    // Click handler for storm selection
    const handleClick = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      let clickX: number, clickY: number;
      
      if ('touches' in e) {
        clickX = e.changedTouches[0].clientX - rect.left;
        clickY = e.changedTouches[0].clientY - rect.top;
      } else {
        clickX = e.clientX - rect.left;
        clickY = e.clientY - rect.top;
      }
      
      // Check if click is on any storm
      for (const stormPos of stormPositionsRef.current) {
        const dx = clickX - stormPos.screenX;
        const dy = clickY - stormPos.screenY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < stormPos.radius * 2) { // Hit within column area
          const storm = stormPos.storm;
          const dbz = storm.dbz || storm.intensity || 25;
          
          // Calculate distance and bearing
          const dLat = storm.lat - location.lat;
          const dLon = storm.lon - location.lon;
          const distMiles = Math.sqrt(
            Math.pow(dLat * 69, 2) + Math.pow(dLon * 69 * Math.cos(location.lat * Math.PI / 180), 2)
          );
          const bearing = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
          
          // Get direction name
          const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
          const dirIndex = Math.round(bearing / 22.5) % 16;
          
          // Get category
          let category = 'Light';
          if (dbz >= 61) category = 'Extreme';
          else if (dbz >= 55) category = 'Severe';
          else if (dbz >= 46) category = 'Heavy';
          else if (dbz >= 35) category = 'Moderate';
          
          setSelectedStorm({
            lat: storm.lat,
            lon: storm.lon,
            dbz,
            distance: distMiles,
            bearing,
            direction: directions[dirIndex],
            category,
            speed: storm.windsPrediction?.speed,
            movementDir: storm.windsPrediction?.direction ? directions[Math.round(storm.windsPrediction.direction / 22.5) % 16] : undefined
          });
          return;
        }
      }
      // Click was not on a storm - deselect
      setSelectedStorm(null);
    };

    // Add all event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('click', handleClick as EventListener);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Animation loop - uses refs, no React state updates during animation
    const animate = () => {
      // Manual rotation - Lerp rotation speed for smooth acceleration/deceleration
      const lerpFactor = 0.15;
      currentRotationSpeed.current += (targetRotationSpeed.current - currentRotationSpeed.current) * lerpFactor;
      
      // Apply manual rotation directly to ref (no state update)
      if (Math.abs(currentRotationSpeed.current) > 0.0001) {
        rotationRef.current += currentRotationSpeed.current;
      }
      
      // Throttled UI update for heading display (10fps instead of 60fps)
      const now = Date.now();
      if (now - lastUIUpdate.current > 100) {
        lastUIUpdate.current = now;
        setDisplayRotation(rotationRef.current);
      }
      
      draw();
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('click', handleClick as EventListener);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [location, precipitationStorms, showWaypoints, isRotating, rotationSpeed]);

  if (!location) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h2 className="text-xl font-semibold mb-4">3D Storm View</h2>
          <p className="text-slate-300 mb-4">Location required for 3D visualization</p>
          <Button onClick={() => setViewMode('map')}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
      {/* Full-Width Legend - Bottom */}
      <div className="absolute bottom-4 left-4 right-4 bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700/50 z-10">
        <div className="flex justify-between items-center text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22C55E', opacity: 0.2 }}></div>
            <span>Light</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EAB308', opacity: 0.4 }}></div>
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#F97316', opacity: 0.6 }}></div>
            <span>Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#EF4444', opacity: 0.8 }}></div>
            <span>V.Heavy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#8B5CF6', opacity: 1.0 }}></div>
            <span>Extreme</span>
          </div>
        </div>
      </div>

      {/* Top-Left Controls for Mobile - Aligned with top navigation */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button onClick={() => setViewMode('map')} variant="outline" size="sm">
          Exit 3D
        </Button>
        <Button
          onClick={() => setShowWaypoints(!showWaypoints)}
          variant="outline"
          size="sm"
          className={`${showWaypoints ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}`}
        >
          {showWaypoints ? 'Hide' : 'Show'} Dots
        </Button>
      </div>

      {/* Top-Right Controls for Mobile */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          onClick={() => { rotationRef.current = 0; setDisplayRotation(0); }}
          variant="outline"
          size="sm"
          className="bg-green-600 border-green-500"
        >
          📍 North
        </Button>
        <Button
          onClick={() => setRotationSpeed(prev => prev === 3 ? 1 : prev + 1)}
          variant="outline"
          size="sm"
          className="bg-purple-600 border-purple-500"
        >
          {rotationSpeed}x
        </Button>
      </div>


      {/* Heading Display - Top Left under buttons */}
      <div className="absolute top-16 left-4 z-10 bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate-700/50">
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">Heading</div>
          <div className="text-lg font-bold text-white">
            {getCompassHeading(displayRotation).degrees}°
          </div>
          <div className="text-sm text-slate-300">
            {getCompassHeading(displayRotation).direction}
          </div>
        </div>
      </div>


      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ cursor: 'pointer', touchAction: 'none' }}
      />

      {/* Storm Info Popup */}
      {selectedStorm && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-slate-800/95 backdrop-blur-sm rounded-lg p-4 border border-slate-600 shadow-xl min-w-[200px]">
          <button 
            onClick={() => setSelectedStorm(null)}
            className="absolute top-2 right-2 text-slate-400 hover:text-white text-lg"
          >
            ✕
          </button>
          <h3 className="text-lg font-bold mb-3" style={{ 
            color: selectedStorm.dbz >= 61 ? '#8B5CF6' : 
                   selectedStorm.dbz >= 55 ? '#EF4444' : 
                   selectedStorm.dbz >= 46 ? '#F97316' : 
                   selectedStorm.dbz >= 35 ? '#EAB308' : '#22C55E' 
          }}>
            {selectedStorm.category} Storm
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Intensity:</span>
              <span className="font-medium">{selectedStorm.dbz.toFixed(1)} dBZ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Distance:</span>
              <span className="font-medium">{selectedStorm.distance.toFixed(1)} mi</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Direction:</span>
              <span className="font-medium">{selectedStorm.direction} ({selectedStorm.bearing.toFixed(0)}°)</span>
            </div>
            {selectedStorm.speed && (
              <div className="flex justify-between">
                <span className="text-slate-400">Moving:</span>
                <span className="font-medium">{selectedStorm.movementDir} @ {selectedStorm.speed.toFixed(0)} mph</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-600">
              <span>Lat:</span>
              <span>{selectedStorm.lat.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Lon:</span>
              <span>{selectedStorm.lon.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}