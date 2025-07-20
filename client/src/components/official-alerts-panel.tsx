import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Calendar, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface NWSAlert {
  id: string;
  properties: {
    event: string;
    severity: string;
    urgency: string;
    certainty: string;
    headline: string;
    description: string;
    instruction?: string;
    sent: string;
    effective: string;
    expires: string;
    senderName: string;
    areas: {
      area: string;
    }[];
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

interface OfficialAlertsPanelProps {
  userLocation: { lat: number; lon: number; name: string } | null;
  storms: any[];
}

const getSeverityColor = (severity: string): string => {
  switch (severity?.toLowerCase()) {
    case 'extreme': return 'bg-red-600 border-red-500';
    case 'severe': return 'bg-orange-600 border-orange-500';
    case 'moderate': return 'bg-yellow-600 border-yellow-500';
    case 'minor': return 'bg-blue-600 border-blue-500';
    default: return 'bg-gray-600 border-gray-500';
  }
};

const getSeverityIcon = (severity: string): string => {
  switch (severity?.toLowerCase()) {
    case 'extreme': return '🚨';
    case 'severe': return '⚠️';
    case 'moderate': return '🟡';
    case 'minor': return '🔵';
    default: return '⚠️';
  }
};

const getAlertTypeIcon = (eventType: string): string => {
  const type = eventType?.toLowerCase() || '';
  if (type.includes('heat')) return '🌡️';
  if (type.includes('thunderstorm') || type.includes('storm')) return '⛈️';
  if (type.includes('tornado')) return '🌪️';
  if (type.includes('flood')) return '🌊';
  if (type.includes('fire')) return '🔥';
  if (type.includes('winter') || type.includes('snow')) return '❄️';
  if (type.includes('wind')) return '💨';
  return '⚠️';
};

const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const alertTime = new Date(timestamp);
  const diffMs = now.getTime() - alertTime.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  
  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hours ago`;
  } else {
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  }
};

const formatDuration = (start: string, end: string): string => {
  const startTime = new Date(start);
  const endTime = new Date(end);
  const now = new Date();
  
  if (now > endTime) return 'Expired';
  
  const remainingMs = endTime.getTime() - now.getTime();
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (remainingHours > 0) {
    return `${remainingHours}h ${remainingMinutes}m remaining`;
  } else {
    return `${remainingMinutes}m remaining`;
  }
};

export default function OfficialAlertsPanel({ userLocation, storms }: OfficialAlertsPanelProps) {
  // Fetch NWS alerts
  const { data: nwsAlertsData, isLoading: nwsLoading } = useQuery({
    queryKey: ["/api/nws-alerts", userLocation?.lat, userLocation?.lon],
    enabled: !!userLocation,
  });

  // Fetch threat monitoring data for radar storm alerts
  const { data: threatData, isLoading: threatLoading } = useQuery({
    queryKey: ["/api/threats/check", userLocation?.lat, userLocation?.lon],
    enabled: !!userLocation,
  });

  const nwsAlerts: NWSAlert[] = nwsAlertsData?.alerts || [];
  const stormThreats: StormThreat[] = threatData?.threats || [];
  
  // Filter out NWS alerts from storm threats to avoid duplication
  const radarStormThreats = stormThreats.filter(threat => threat.type !== 'nws_alert');
  
  const totalAlerts = nwsAlerts.length + radarStormThreats.length;
  const isLoading = nwsLoading || threatLoading;

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">🏛️</div>
        <h2 className="text-xl font-semibold">Official NWS Alerts & Radar Storm Alerts ({totalAlerts})</h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
      </div>
      
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-slate-700/50">
          <TabsTrigger value="all" className="text-xs">
            All ({totalAlerts})
          </TabsTrigger>
          <TabsTrigger value="nws" className="text-xs">
            NWS Alerts ({nwsAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="radar" className="text-xs">
            Radar Storms ({radarStormThreats.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
          {totalAlerts === 0 ? (
            <p className="text-slate-400 text-center py-8">
              {isLoading ? 'Checking for alerts...' : 'No active weather alerts or radar storm threats'}
            </p>
          ) : (
            <>
              {/* NWS Alerts */}
              {nwsAlerts.map((alert) => (
                <div key={alert.id} className={`rounded-lg p-4 border-l-4 ${getSeverityColor(alert.properties.severity)}`}>
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{getSeverityIcon(alert.properties.severity)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{getAlertTypeIcon(alert.properties.event)}</span>
                        <h3 className="font-semibold text-white">{alert.properties.event}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(alert.properties.severity)} text-white`}>
                          {alert.properties.severity?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-slate-300 mb-3">{alert.properties.headline}</p>
                      <div className="text-sm text-slate-400 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Issued: {formatTimeAgo(alert.properties.sent)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>{formatDuration(alert.properties.effective, alert.properties.expires)}</span>
                        </div>
                        {alert.properties.areas && alert.properties.areas.length > 0 && (
                          <div>Areas: {alert.properties.areas.map(area => area.area).join(', ')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Radar Storm Threats */}
              {radarStormThreats.map((threat, index) => (
                <div key={`radar-${index}`} className={`rounded-lg p-4 border-l-4 ${getSeverityColor(threat.level)}`}>
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">📡</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-white">{threat.title}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(threat.level)} text-white`}>
                          {threat.level?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-slate-300 mb-3">{threat.description}</p>
                      <div className="text-sm text-slate-400 space-y-1">
                        <div>Status: {threat.status}</div>
                        <div>Duration: {threat.duration}</div>
                        {threat.timeToExpiration && (
                          <div>Time remaining: {threat.timeToExpiration}</div>
                        )}
                      </div>
                      {threat.recommendations && threat.recommendations.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-medium text-slate-300 mb-1">Recommended Actions:</h4>
                          <ul className="text-sm text-slate-400 space-y-1">
                            {threat.recommendations.slice(0, 3).map((rec, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span>•</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="nws" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
          {nwsAlerts.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              {isLoading ? 'Checking for NWS alerts...' : 'No active National Weather Service alerts'}
            </p>
          ) : (
            nwsAlerts.map((alert) => (
              <div key={alert.id} className={`rounded-lg p-4 border-l-4 ${getSeverityColor(alert.properties.severity)}`}>
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{getSeverityIcon(alert.properties.severity)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getAlertTypeIcon(alert.properties.event)}</span>
                      <h3 className="font-semibold text-white">{alert.properties.event}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(alert.properties.severity)} text-white`}>
                        {alert.properties.severity?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-slate-300 mb-3">{alert.properties.headline}</p>
                    <div className="text-sm text-slate-400 space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>Issued: {formatTimeAgo(alert.properties.sent)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>{formatDuration(alert.properties.effective, alert.properties.expires)}</span>
                      </div>
                      {alert.properties.areas && alert.properties.areas.length > 0 && (
                        <div>Areas: {alert.properties.areas.map(area => area.area).join(', ')}</div>
                      )}
                    </div>
                    {alert.properties.instruction && (
                      <div className="mt-3 p-3 bg-slate-700/50 rounded-lg">
                        <h4 className="text-sm font-medium text-slate-300 mb-1">Instructions:</h4>
                        <p className="text-sm text-slate-400">{alert.properties.instruction}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="radar" className="mt-4 space-y-3 max-h-96 overflow-y-auto">
          {radarStormThreats.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              {isLoading ? 'Analyzing radar data...' : 'No radar-detected storm threats'}
            </p>
          ) : (
            radarStormThreats.map((threat, index) => (
              <div key={`radar-${index}`} className={`rounded-lg p-4 border-l-4 ${getSeverityColor(threat.level)}`}>
                <div className="flex items-start gap-3">
                  <div className="text-2xl">📡</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-white">{threat.title}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(threat.level)} text-white`}>
                        {threat.level?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-slate-300 mb-3">{threat.description}</p>
                    <div className="text-sm text-slate-400 space-y-1">
                      <div>Status: {threat.status}</div>
                      <div>Duration: {threat.duration}</div>
                      {threat.timeToExpiration && (
                        <div>Time remaining: {threat.timeToExpiration}</div>
                      )}
                    </div>
                    {threat.recommendations && threat.recommendations.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-sm font-medium text-slate-300 mb-1">Recommended Actions:</h4>
                        <ul className="text-sm text-slate-400 space-y-1">
                          {threat.recommendations.slice(0, 3).map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span>•</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}