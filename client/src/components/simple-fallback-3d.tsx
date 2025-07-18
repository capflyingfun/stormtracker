import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface SimpleFallback3DProps {
  location: { lat: number; lon: number; name: string };
  precipitationStorms: any[];
  onClose: () => void;
}

export default function SimpleFallback3D({ location, precipitationStorms, onClose }: SimpleFallback3DProps) {
  // Filter storms by intensity for simplified display
  const stormsByIntensity = precipitationStorms.reduce((acc, storm) => {
    const category = storm.intensity >= 61 ? 'extreme' :
                    storm.intensity >= 55 ? 'veryHeavy' :
                    storm.intensity >= 46 ? 'heavy' :
                    storm.intensity >= 35 ? 'moderate' :
                    'light';
    if (!acc[category]) acc[category] = [];
    acc[category].push(storm);
    return acc;
  }, {} as Record<string, any[]>);

  const getColorForCategory = (category: string) => {
    const colors = {
      extreme: '#8B00FF',
      veryHeavy: '#FF0000',
      heavy: '#FFA500',
      moderate: '#FFFF00',
      light: '#00FF00'
    };
    return colors[category as keyof typeof colors] || '#FFFFFF';
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white z-50">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">3D Storm View</h1>
          <Button
            onClick={onClose}
            variant="outline"
            className="border-white/30 text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Menu
          </Button>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">📍 {location.name}</h2>
          <p className="text-slate-300">
            {precipitationStorms.length} storms detected within 30 miles
          </p>
        </div>

        {/* CSS 3D Simulation */}
        <div className="relative h-96 bg-black/50 rounded-lg overflow-hidden perspective-1000">
          <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 gap-1 p-4 transform-gpu">
            {precipitationStorms.slice(0, 48).map((storm, index) => {
              const height = Math.min(storm.intensity * 0.8, 80);
              const color = storm.intensity >= 61 ? '#8B00FF' :
                           storm.intensity >= 55 ? '#FF0000' :
                           storm.intensity >= 46 ? '#FFA500' :
                           storm.intensity >= 35 ? '#FFFF00' :
                           '#00FF00';
              
              return (
                <div
                  key={index}
                  className="relative group cursor-pointer"
                  style={{ 
                    transform: `translateZ(${height}px) rotateX(45deg)`,
                    transformStyle: 'preserve-3d'
                  }}
                >
                  <div
                    className="w-full h-full rounded opacity-80 hover:opacity-100 transition-all duration-300"
                    style={{
                      backgroundColor: color,
                      height: `${height}px`,
                      boxShadow: `0 0 10px ${color}`,
                      animation: storm.intensity >= 55 ? 'pulse 2s infinite' : 'none'
                    }}
                  />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-black/90 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {storm.intensity} dBZ<br />
                    {storm.distance?.toFixed(1)} mi {storm.direction}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Storm Categories */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(stormsByIntensity).map(([category, storms]) => (
            <div key={category} className="text-center">
              <div
                className="w-8 h-8 rounded-full mx-auto mb-2"
                style={{ backgroundColor: getColorForCategory(category) }}
              />
              <div className="text-sm font-medium capitalize">{category}</div>
              <div className="text-xs text-slate-400">{storms.length} storms</div>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="mt-6 text-center text-slate-400 text-sm">
          <p>Simplified 3D visualization showing storm intensity as height and color.</p>
          <p>Hover over storm columns to see details.</p>
        </div>
      </div>

      <style jsx>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}