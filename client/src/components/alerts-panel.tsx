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

interface StormThreat {
  type: string;
  level: string;
  status: string;
  title: string;
  description: string;
  priority: number;
  recommendations: string[];
  duration: string;
  timeToExpiration?: string;
  activationStatus?: string;
}

interface AlertsPanelProps {
  alerts: WeatherAlert[];
  stormThreats?: StormThreat[];
  isLoading: boolean;
}

const getSeverityColor = (severity: string): string => {
  switch (severity?.toLowerCase()) {
    case 'extreme': return 'bg-red-600';
    case 'severe': return 'bg-orange-600';
    case 'high': return 'bg-orange-600';
    case 'moderate': return 'bg-yellow-600';
    case 'low': return 'bg-blue-600';
    case 'minor': return 'bg-blue-600';
    default: return 'bg-gray-600';
  }
};

const getAlertIcon = (type: string): string => {
  if (type?.toLowerCase().includes('thunderstorm') || type?.toLowerCase().includes('storm')) {
    return '⛈️';
  } else if (type?.toLowerCase().includes('heat')) {
    return '🌡️';
  } else if (type?.toLowerCase().includes('lightning')) {
    return '⚡';
  } else if (type?.toLowerCase().includes('air') || type?.toLowerCase().includes('quality')) {
    return '💨';
  }
  return '⚠️';
};

export default function AlertsPanel({ alerts, stormThreats = [], isLoading }: AlertsPanelProps) {
  const totalAlerts = alerts.length + stormThreats.length;

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">⚠️</div>
        <h2 className="text-xl font-semibold">Safety Alerts ({totalAlerts})</h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
      </div>
      
      <div className="space-y-3">
        {totalAlerts === 0 ? (
          <p className="text-slate-400 text-center py-8">
            {isLoading ? 'Checking for alerts...' : 'No active weather alerts'}
          </p>
        ) : (
          <>
            {/* Storm Threats (Radar-based alerts) */}
            {stormThreats.map((threat, index) => (
              <div key={`storm-${index}`} className="bg-red-900/20 rounded-lg p-4 border border-red-700/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-lg">{getAlertIcon(threat.type)}</div>
                    <div className={`w-3 h-3 rounded-full ${getSeverityColor(threat.level)}`}></div>
                    <span className="font-semibold">{threat.title}</span>
                  </div>
                  <span className="text-sm text-slate-300 capitalize">{threat.level}</span>
                </div>
                <p className="text-sm text-slate-300 mb-2">{threat.description}</p>
                {threat.recommendations.length > 0 && (
                  <div className="text-sm text-slate-400 mb-2">
                    <div className="font-medium text-slate-300 mb-1">Recommendations:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {threat.recommendations.slice(0, 3).map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-sm text-slate-400">
                  <div>Duration: {threat.duration}</div>
                  {threat.timeToExpiration && (
                    <div>Status: {threat.timeToExpiration}</div>
                  )}
                  <div className="text-xs text-orange-400 mt-1">📡 Radar-detected storm threat</div>
                </div>
              </div>
            ))}

            {/* NWS Official Alerts */}
            {alerts.map((alert, index) => {
              const props = alert.properties;
              const severity = props.severity || 'Unknown';
              
              return (
                <div key={`nws-${index}`} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-lg">{getAlertIcon(props.event || '')}</div>
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
                    <div className="text-xs text-blue-400 mt-1">🏛️ National Weather Service</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
