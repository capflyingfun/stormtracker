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

interface WebGL3DEnvironmentProps {
  location: Location;
  precipitationStorms: PrecipitationStorm[];
  onClose: () => void;
}

// Convert lat/lon to 3D coordinates with user at center
function latLonTo3D(lat: number, lon: number, userLat: number, userLon: number, scale: number = 0.5) {
  const latDiff = (lat - userLat) * scale;
  const lonDiff = (lon - userLon) * scale;
  
  return {
    x: lonDiff * 111, // Approximate km per degree longitude
    z: latDiff * 111, // Approximate km per degree latitude
    y: 0
  };
}

// Get storm color based on dBZ value
function getStormColor(dbz: number): [number, number, number] {
  if (dbz >= 61) return [139/255, 92/255, 246/255]; // Purple - Extreme
  if (dbz >= 55) return [239/255, 68/255, 68/255]; // Red - Very Heavy
  if (dbz >= 46) return [249/255, 115/255, 22/255]; // Orange - Heavy
  if (dbz >= 35) return [234/255, 179/255, 8/255]; // Yellow - Moderate
  return [34/255, 197/255, 94/255]; // Green - Light
}

// Get storm height based on dBZ intensity
function getStormHeight(dbz: number): number {
  if (dbz >= 61) return 15; // 15,000+ feet
  if (dbz >= 55) return 12; // 12,000 feet
  if (dbz >= 46) return 8;  // 8,000 feet
  if (dbz >= 35) return 5;  // 5,000 feet
  return 3; // 3,000 feet
}

export default function WebGL3DEnvironment({ location, precipitationStorms, onClose }: WebGL3DEnvironmentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [cameraAngle, setCameraAngle] = useState(0);
  const [cameraHeight, setCameraHeight] = useState(20);
  const [cameraDistance, setCameraDistance] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouseX, setLastMouseX] = useState(0);
  const [lastMouseY, setLastMouseY] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Create shader program
    const vertexShaderSource = `
      attribute vec3 position;
      attribute vec3 color;
      uniform mat4 projectionMatrix;
      uniform mat4 viewMatrix;
      varying vec3 vColor;
      
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        gl_PointSize = 12.0;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      varying vec3 vColor;
      
      void main() {
        gl_FragColor = vec4(vColor, 0.8);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Get attribute and uniform locations
    const positionLocation = gl.getAttribLocation(program, 'position');
    const colorLocation = gl.getAttribLocation(program, 'color');
    const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');
    const viewMatrixLocation = gl.getUniformLocation(program, 'viewMatrix');

    // Create perspective projection matrix
    function createPerspectiveMatrix(fov: number, aspect: number, near: number, far: number): Float32Array {
      const f = 1.0 / Math.tan(fov / 2);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0
      ]);
    }

    // Create view matrix
    function createViewMatrix(cameraX: number, cameraY: number, cameraZ: number): Float32Array {
      // Simple look-at matrix looking toward origin
      const eye = [cameraX, cameraY, cameraZ];
      const target = [0, 0, 0];
      const up = [0, 1, 0];
      
      // Calculate camera direction
      const zAxis = [
        eye[0] - target[0],
        eye[1] - target[1], 
        eye[2] - target[2]
      ];
      const zLength = Math.sqrt(zAxis[0] * zAxis[0] + zAxis[1] * zAxis[1] + zAxis[2] * zAxis[2]);
      zAxis[0] /= zLength;
      zAxis[1] /= zLength;
      zAxis[2] /= zLength;
      
      // Calculate right vector
      const xAxis = [
        up[1] * zAxis[2] - up[2] * zAxis[1],
        up[2] * zAxis[0] - up[0] * zAxis[2],
        up[0] * zAxis[1] - up[1] * zAxis[0]
      ];
      const xLength = Math.sqrt(xAxis[0] * xAxis[0] + xAxis[1] * xAxis[1] + xAxis[2] * xAxis[2]);
      xAxis[0] /= xLength;
      xAxis[1] /= xLength;
      xAxis[2] /= xLength;
      
      // Calculate up vector
      const yAxis = [
        zAxis[1] * xAxis[2] - zAxis[2] * xAxis[1],
        zAxis[2] * xAxis[0] - zAxis[0] * xAxis[2],
        zAxis[0] * xAxis[1] - zAxis[1] * xAxis[0]
      ];
      
      return new Float32Array([
        xAxis[0], yAxis[0], zAxis[0], 0,
        xAxis[1], yAxis[1], zAxis[1], 0,
        xAxis[2], yAxis[2], zAxis[2], 0,
        -(xAxis[0] * eye[0] + xAxis[1] * eye[1] + xAxis[2] * eye[2]),
        -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]),
        -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]),
        1
      ]);
    }

    function render() {
      if (!gl || !canvas) return;
      
      // Clear canvas
      gl.clearColor(0.05, 0.05, 0.2, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Calculate camera position
      const cameraX = Math.cos(cameraAngle) * cameraDistance;
      const cameraZ = Math.sin(cameraAngle) * cameraDistance;
      
      // Set matrices
      const projectionMatrix = createPerspectiveMatrix(
        Math.PI / 4, // 45 degree FOV
        canvas.width / canvas.height,
        0.1,
        1000
      );
      
      const viewMatrix = createViewMatrix(cameraX, cameraHeight, cameraZ);
      
      gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
      gl.uniformMatrix4fv(viewMatrixLocation, false, viewMatrix);

      // Draw storm particles
      if (showWaypoints && precipitationStorms.length > 0) {
        const vertices: number[] = [];
        const colors: number[] = [];
        
        precipitationStorms.forEach(storm => {
          const pos3D = latLonTo3D(storm.lat, storm.lon, location.lat, location.lon);
          const height = getStormHeight(storm.dbz);
          const color = getStormColor(storm.dbz);
          
          // Create storm column with particles every 0.5 units
          for (let i = 0; i <= height; i += 0.5) {
            vertices.push(pos3D.x, i, pos3D.z);
            colors.push(color[0], color[1], color[2]);
          }
        });

        if (vertices.length > 0) {
          const positionBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(positionLocation);
          gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

          const colorBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(colorLocation);
          gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

          gl.drawArrays(gl.POINTS, 0, vertices.length / 3);
        }
      }

      // Draw ground grid
      const gridVertices: number[] = [];
      const gridColors: number[] = [];
      
      // Grid lines
      for (let i = -50; i <= 50; i += 5) {
        // Horizontal lines
        gridVertices.push(-50, 0, i, 50, 0, i);
        gridColors.push(0.2, 0.2, 0.4, 0.2, 0.2, 0.4);
        
        // Vertical lines
        gridVertices.push(i, 0, -50, i, 0, 50);
        gridColors.push(0.2, 0.2, 0.4, 0.2, 0.2, 0.4);
      }
      
      // User position marker
      gridVertices.push(0, 0, 0, 0, 2, 0);
      gridColors.push(0, 1, 0, 0, 1, 0);

      if (gridVertices.length > 0) {
        const gridPosBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gridPosBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridVertices), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

        const gridColorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gridColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridColors), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(colorLocation);
        gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.LINES, 0, gridVertices.length / 3);
      }
    }

    // Animation loop
    function animate() {
      render();
      requestAnimationFrame(animate);
    }
    
    animate();

    // Mouse controls
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
      
      setCameraAngle(prev => prev + deltaX * 0.01);
      setCameraHeight(prev => Math.max(5, Math.min(50, prev - deltaY * 0.1)));
      
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
      setCameraDistance(prev => Math.max(10, Math.min(100, prev + e.deltaY * 0.1)));
    };

    // Touch controls for mobile
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
      
      setCameraAngle(prev => prev + deltaX * 0.01);
      setCameraHeight(prev => Math.max(5, Math.min(50, prev - deltaY * 0.1)));
      
      setLastMouseX(e.touches[0].clientX);
      setLastMouseY(e.touches[0].clientY);
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      setIsDragging(false);
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [location, precipitationStorms, showWaypoints, cameraAngle, cameraHeight, cameraDistance, isDragging, lastMouseX, lastMouseY]);

  return (
    <div className="fixed inset-0 bg-black z-50">
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
            setCameraAngle(0);
            setCameraHeight(20);
            setCameraDistance(50);
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

      {/* WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      />
    </div>
  );
}