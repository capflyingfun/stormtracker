import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogIn, LogOut, User } from "lucide-react";

interface HeaderProps {
  useMetric: boolean;
  onUnitsChange: (useMetric: boolean) => void;
}

export default function Header({ useMetric, onUnitsChange }: HeaderProps) {
  const [showConfig, setShowConfig] = useState(false);
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 p-4 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 text-yellow-400 select-none">⚡</div>
          <div className="select-none">
            <h1 className="text-2xl font-bold select-none">StormTracker <span className="text-sm font-normal text-slate-400">v1.32</span></h1>
            <p className="text-sm text-slate-300 select-none">Real-time storm cell detection with live radar</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
            <span className="text-sm">Ready</span>
          </div>

          {!isLoading && (
            isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                {user.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt={user.firstName || "User"}
                    className="w-7 h-7 rounded-full border border-slate-500"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
                <span className="text-sm text-slate-300 hidden sm:inline">
                  {user.firstName || "User"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout()}
                  className="p-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { window.location.href = "/api/login"; }}
                className="p-2 rounded-lg bg-blue-600/30 hover:bg-blue-500/40 text-blue-300"
              >
                <LogIn className="w-4 h-4 mr-1.5" />
                <span className="text-sm">Sign in</span>
              </Button>
            )
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50"
          >
            ⚙️
          </Button>
        </div>
      </div>

      {/* API Status Panel */}
      {showConfig && (
        <div className="mt-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600/30 select-none">
          <h3 className="text-lg font-semibold mb-3 select-none">Settings & API Status</h3>
          
          {/* Units Toggle */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Units</label>
            <div className="flex gap-2">
              <Button
                variant={!useMetric ? "default" : "secondary"}
                size="sm"
                onClick={() => onUnitsChange(false)}
              >
                Imperial (mph, mi, in)
              </Button>
              <Button
                variant={useMetric ? "default" : "secondary"}
                size="sm"
                onClick={() => onUnitsChange(true)}
              >
                Metric (km/h, km, mm)
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <span>OpenWeather: Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <span>NWS: Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <span>RainViewer: Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <span>Map: Active</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
