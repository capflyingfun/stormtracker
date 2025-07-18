import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ModeSelectorProps {
  onModeSelect: (mode: '2d' | '3d') => void;
}

export default function ModeSelector({ onModeSelect }: ModeSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-purple-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">StormTracker</h1>
          <p className="text-blue-100">Choose your visualization mode</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                onClick={() => onModeSelect('2d')}>
            <CardHeader>
              <CardTitle className="text-white text-xl">2D Radar Map</CardTitle>
              <CardDescription className="text-blue-100">
                Traditional storm tracking with interactive radar overlays
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-blue-100 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span>Real-time precipitation waypoints</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                  <span>NEXRAD & RainViewer radar sources</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span>Interactive map controls</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span>Lightning detection system</span>
                </div>
              </div>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onModeSelect('2d');
                }}
              >
                Launch 2D Mode
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                onClick={() => onModeSelect('3d')}>
            <CardHeader>
              <CardTitle className="text-white text-xl">3D Storm Visualization</CardTitle>
              <CardDescription className="text-blue-100">
                Immersive 3D storm columns with height-based intensity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-blue-100 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                  <span>3D storm columns by dBZ intensity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                  <span>Interactive 360° rotation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span>Height-based precipitation levels</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span>Mobile-optimized performance</span>
                </div>
              </div>
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onModeSelect('3d');
                }}
              >
                Launch 3D Mode
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}