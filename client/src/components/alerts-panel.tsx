import { Loader2 } from "lucide-react";

interface WeatherAlert {
  properties: {
    event?: string;
    severity?: string;
    headline?: string;
    description?: string;
    sent: string;
    expires?: string;
  };
}

interface AlertsPanelProps {
  alerts: WeatherAlert[];
  isLoading: boolean;
}

const getSeverityColor = (severity: string): string => {
  switch (severity?.toLowerCase()) {
    case 'extreme': return 'bg-red-600';
    case 'severe': return 'bg-orange-600';
    case 'moderate': return 'bg-yellow-600';
    case 'minor': return 'bg-blue-600';
    default: return 'bg-gray-600';
  }
};

export default function AlertsPanel({ alerts, isLoading }: AlertsPanelProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">⚠️</div>
        <h2 className="text-xl font-semibold">Safety Alerts ({alerts.length})</h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
      </div>
      
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <p className="text-slate-400 text-center py-8">
            {isLoading ? 'Checking for alerts...' : 'No active weather alerts'}
          </p>
        ) : (
          alerts.map((alert, index) => {
            const props = alert.properties;
            const severity = props.severity || 'Unknown';
            
            return (
              <div key={index} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getSeverityColor(severity)}`}></div>
                    <span className="font-semibold">{props.event || 'Weather Alert'}</span>
                  </div>
                  <span className="text-sm text-slate-300">{severity}</span>
                </div>
                <p className="text-sm text-slate-300 mb-2">
                  {props.headline || props.description || 'No description available'}
                </p>
                <div className="text-sm text-slate-400">
                  <div>Issued: {new Date(props.sent).toLocaleString()}</div>
                  {props.expires && (
                    <div>Expires: {new Date(props.expires).toLocaleString()}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
