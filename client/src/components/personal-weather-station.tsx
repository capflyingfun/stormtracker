import { useState, useEffect, useCallback } from 'react';
import { getApiKey, hasAmbientWeatherKeys, hasWeatherUndergroundKeys } from '@/hooks/use-api-keys';
import { Key, RefreshCw, Thermometer, Droplets, Wind, Gauge, Sun, CloudRain, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AmbientDevice {
  macAddress: string;
  info: {
    name: string;
    location?: string;
  };
  lastData: Record<string, any>;
}

interface PWSReading {
  tempF: number | null;
  tempC: number | null;
  humidity: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  windDir: number | null;
  windDirLabel: string;
  baromAbsIn: number | null;
  baromRelIn: number | null;
  uv: number | null;
  solarRadiation: number | null;
  dailyRainIn: number | null;
  hourlyRainIn: number | null;
  dewPointF: number | null;
  feelsLikeF: number | null;
  lastUpdated: string;
  stationName: string;
  source: 'ambient' | 'wunderground';
}

function getWindDirLabel(deg: number | null): string {
  if (deg == null) return '--';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function parseAmbientData(device: AmbientDevice): PWSReading {
  const d = device.lastData;
  const tempF = d.tempf ?? d.temp1f ?? null;
  return {
    tempF,
    tempC: tempF != null ? Math.round((tempF - 32) * 5 / 9 * 10) / 10 : null,
    humidity: d.humidity ?? null,
    windSpeedMph: d.windspeedmph ?? null,
    windGustMph: d.windgustmph ?? null,
    windDir: d.winddir ?? null,
    windDirLabel: getWindDirLabel(d.winddir ?? null),
    baromAbsIn: d.baromabsin ?? null,
    baromRelIn: d.baromrelin ?? null,
    uv: d.uv ?? null,
    solarRadiation: d.solarradiation ?? null,
    dailyRainIn: d.dailyrainin ?? null,
    hourlyRainIn: d.hourlyrainin ?? null,
    dewPointF: d.dewPoint ?? d.dewpoint ?? null,
    feelsLikeF: d.feelsLike ?? d.feelslike ?? null,
    lastUpdated: d.dateutc ? new Date(d.dateutc).toLocaleString() : d.date || 'Unknown',
    stationName: device.info?.name || 'My Station',
    source: 'ambient',
  };
}

function parseWundergroundData(data: any): PWSReading {
  const obs = data.observations?.[0] || {};
  const imperial = obs.imperial || {};
  const tempF = imperial.temp ?? null;
  return {
    tempF,
    tempC: tempF != null ? Math.round((tempF - 32) * 5 / 9 * 10) / 10 : null,
    humidity: obs.humidity ?? null,
    windSpeedMph: imperial.windSpeed ?? null,
    windGustMph: imperial.windGust ?? null,
    windDir: obs.winddir ?? null,
    windDirLabel: getWindDirLabel(obs.winddir ?? null),
    baromAbsIn: imperial.pressure ?? null,
    baromRelIn: imperial.pressure ?? null,
    uv: obs.uv ?? null,
    solarRadiation: obs.solarRadiation ?? null,
    dailyRainIn: imperial.precipTotal ?? null,
    hourlyRainIn: imperial.precipRate ?? null,
    dewPointF: imperial.dewpt ?? null,
    feelsLikeF: imperial.windChill ?? imperial.heatIndex ?? null,
    lastUpdated: obs.obsTimeLocal || obs.obsTimeUtc || 'Unknown',
    stationName: obs.stationID || 'WU Station',
    source: 'wunderground',
  };
}

function DataCard({ icon, label, value, unit, color, subValue }: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null;
  unit: string;
  color: string;
  subValue?: string;
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30 flex flex-col items-center gap-1">
      <div className={`${color}`}>{icon}</div>
      <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className="text-white font-bold text-lg">{value ?? '--'}</span>
        <span className="text-slate-400 text-xs">{unit}</span>
      </div>
      {subValue && <span className="text-[10px] text-slate-400">{subValue}</span>}
    </div>
  );
}

interface PersonalWeatherStationProps {
  onOpenApiKeys: () => void;
}

export default function PersonalWeatherStation({ onOpenApiKeys }: PersonalWeatherStationProps) {
  const [reading, setReading] = useState<PWSReading | null>(null);
  const [ambientDevices, setAmbientDevices] = useState<AmbientDevice[]>([]);
  const [selectedDeviceIdx, setSelectedDeviceIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);

  const hasAmbient = hasAmbientWeatherKeys();
  const hasWU = hasWeatherUndergroundKeys();
  const hasKeys = hasAmbient || hasWU;

  const fetchAmbientData = useCallback(async (deviceIdx = 0) => {
    const apiKey = getApiKey('stormtracker_key_ambient_api');
    const appKey = getApiKey('stormtracker_key_ambient_app');
    if (!apiKey || !appKey) return;

    const response = await fetch('/api/pws/ambient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, applicationKey: appKey }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Ambient Weather API error: ${response.status}`);
    }
    const devices: AmbientDevice[] = await response.json();
    if (!devices || devices.length === 0) {
      throw new Error('No devices found on your Ambient Weather account');
    }
    setAmbientDevices(devices);
    const idx = Math.min(deviceIdx, devices.length - 1);
    setSelectedDeviceIdx(idx);
    return parseAmbientData(devices[idx]);
  }, []);

  const fetchWUData = useCallback(async () => {
    const apiKey = getApiKey('stormtracker_key_wunderground_api');
    const stationId = getApiKey('stormtracker_key_wunderground_station');
    if (!apiKey || !stationId) return;

    const response = await fetch('/api/pws/wunderground', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, stationId }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Weather Underground API error: ${response.status}`);
    }
    const data = await response.json();
    return parseWundergroundData(data);
  }, []);

  const fetchData = useCallback(async (deviceIdx?: number) => {
    setLoading(true);
    setError(null);
    try {
      let result: PWSReading | undefined;
      if (hasAmbient) {
        result = await fetchAmbientData(deviceIdx ?? selectedDeviceIdx);
      } else if (hasWU) {
        result = await fetchWUData();
      }
      if (result) {
        setReading(result);
        setLastFetch(new Date());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch station data');
    } finally {
      setLoading(false);
    }
  }, [hasAmbient, hasWU, fetchAmbientData, fetchWUData, selectedDeviceIdx]);

  useEffect(() => {
    if (hasKeys) {
      fetchData();
    }
  }, [hasKeys]);

  useEffect(() => {
    if (!hasKeys) return;
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [hasKeys, fetchData]);

  const handleDeviceSelect = (idx: number) => {
    setSelectedDeviceIdx(idx);
    setShowDeviceSelector(false);
    fetchData(idx);
  };

  if (!hasKeys) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-4 sm:p-6 border border-slate-700/50 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📡</span>
          <h3 className="text-base font-semibold text-white">Personal Weather Station</h3>
        </div>
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
            <Key className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-sm text-slate-300 mb-1">Connect your personal weather station</p>
          <p className="text-xs text-slate-500 mb-4">
            Add your Ambient Weather or Weather Underground API keys to view real-time data from your own station.
          </p>
          <Button
            onClick={onOpenApiKeys}
            variant="outline"
            size="sm"
            className="bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30"
          >
            <Key className="w-4 h-4 mr-1.5" />
            Configure API Keys
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-3 sm:p-6 border border-slate-700/50 mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📡</span>
          <div>
            <h3 className="text-base font-semibold text-white">
              {reading?.stationName || 'Personal Weather Station'}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">
                {reading?.source === 'ambient' ? 'Ambient Weather' : reading?.source === 'wunderground' ? 'Weather Underground' : ''}
              </span>
              {lastFetch && (
                <span className="text-[10px] text-slate-500">
                  Updated {lastFetch.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {ambientDevices.length > 1 && (
            <div className="relative">
              <Button
                onClick={() => setShowDeviceSelector(!showDeviceSelector)}
                variant="outline"
                size="sm"
                className="text-xs h-7 bg-slate-700/50 border-slate-600"
              >
                Station {selectedDeviceIdx + 1}/{ambientDevices.length}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              {showDeviceSelector && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[200px]">
                  {ambientDevices.map((device, idx) => (
                    <button
                      key={device.macAddress}
                      onClick={() => handleDeviceSelect(idx)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 ${
                        idx === selectedDeviceIdx ? 'bg-slate-700/60 text-blue-400' : 'text-slate-200'
                      }`}
                    >
                      <span className="font-medium">{device.info?.name || `Station ${idx + 1}`}</span>
                      {device.info?.location && (
                        <span className="text-xs text-slate-400 block">{device.info.location}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button
            onClick={() => fetchData()}
            variant="ghost"
            size="sm"
            disabled={loading}
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={onOpenApiKeys}
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
          >
            <Key className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-3 mb-4 text-sm text-red-300">
          {error}
          <button onClick={() => fetchData()} className="ml-2 text-red-400 hover:text-red-200 underline text-xs">
            Retry
          </button>
        </div>
      )}

      {loading && !reading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mr-2" />
          <span className="text-slate-300 text-sm">Loading station data...</span>
        </div>
      )}

      {reading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          <DataCard
            icon={<Thermometer className="w-5 h-5" />}
            label="Temperature"
            value={reading.tempF != null ? reading.tempF.toFixed(1) : null}
            unit="°F"
            color="text-red-400"
            subValue={reading.tempC != null ? `${reading.tempC.toFixed(1)}°C` : undefined}
          />
          <DataCard
            icon={<Thermometer className="w-5 h-5" />}
            label="Feels Like"
            value={reading.feelsLikeF != null ? reading.feelsLikeF.toFixed(1) : null}
            unit="°F"
            color="text-orange-400"
          />
          <DataCard
            icon={<Droplets className="w-5 h-5" />}
            label="Humidity"
            value={reading.humidity}
            unit="%"
            color="text-cyan-400"
            subValue={reading.dewPointF != null ? `Dew: ${reading.dewPointF.toFixed(1)}°F` : undefined}
          />
          <DataCard
            icon={<Wind className="w-5 h-5" />}
            label="Wind"
            value={reading.windSpeedMph != null ? reading.windSpeedMph.toFixed(1) : null}
            unit="mph"
            color="text-green-400"
            subValue={`${reading.windDirLabel}${reading.windDir != null ? ` (${reading.windDir}°)` : ''}${reading.windGustMph != null ? ` G${reading.windGustMph.toFixed(1)}` : ''}`}
          />
          <DataCard
            icon={<Gauge className="w-5 h-5" />}
            label="Pressure"
            value={reading.baromRelIn != null ? reading.baromRelIn.toFixed(2) : null}
            unit="inHg"
            color="text-purple-400"
            subValue={reading.baromRelIn != null ? `${(reading.baromRelIn * 33.8639).toFixed(1)} mb` : undefined}
          />
          <DataCard
            icon={<CloudRain className="w-5 h-5" />}
            label="Rain Today"
            value={reading.dailyRainIn != null ? reading.dailyRainIn.toFixed(2) : null}
            unit="in"
            color="text-blue-400"
            subValue={reading.hourlyRainIn != null ? `Rate: ${reading.hourlyRainIn.toFixed(2)} in/hr` : undefined}
          />
          {reading.uv != null && (
            <DataCard
              icon={<Sun className="w-5 h-5" />}
              label="UV Index"
              value={reading.uv}
              unit=""
              color="text-yellow-400"
              subValue={
                reading.uv <= 2 ? 'Low' :
                reading.uv <= 5 ? 'Moderate' :
                reading.uv <= 7 ? 'High' :
                reading.uv <= 10 ? 'Very High' : 'Extreme'
              }
            />
          )}
          {reading.solarRadiation != null && (
            <DataCard
              icon={<Sun className="w-5 h-5" />}
              label="Solar"
              value={reading.solarRadiation.toFixed(0)}
              unit="W/m²"
              color="text-amber-400"
            />
          )}
        </div>
      )}

      {reading && (
        <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
          <span>Last observation: {reading.lastUpdated}</span>
          <span>Auto-refreshes every 60s</span>
        </div>
      )}
    </div>
  );
}
